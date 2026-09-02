import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { createUnavailableStoryModelingGateway, type StoryModelingEvidenceSource, type StoryModelingGateway } from "../storyAgent/storyModelingGateway.ts";
import {
  createStoryModelingRun,
  createStoryModelingSourceManifest,
  estimateStoryModelingRun,
  normalizeStoryModelingRequest,
  recommendStoryModelingScope,
  validateStoryModelingResult,
  type StoryModelingPrice,
  type StoryModelingRequest,
  type StoryModelingRun,
  type StoryModelingScope,
  type StoryModelingTool,
  type StoryLogicFinding,
  type StoryLogicReviewRecord
} from "../storyContracts/storyModeling.ts";
import { assertStoryStudioEventReferenceEligibility, type StoryStudioEventReference } from "../storyContracts/storyStudioEventReference.ts";
import { publishFileNoReplace, readExistingUtf8, replaceFileAtomically } from "./atomicNoReplaceFile.ts";
import { createStoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";

const STORE_VERSION = "story-studio-story-modeling-run/v1" as const;
const LOGIC_REVIEW_STORE_VERSION = "story-studio-logic-review-store/v1" as const;
type StoredRun = StoryModelingRun & { storeVersion: typeof STORE_VERSION };
type LogicReviewStore = { version: typeof LOGIC_REVIEW_STORE_VERSION; projectId: string; records: StoryLogicReviewRecord[] };

export function createStoryStudioStoryModelingOperations(options: {
  rootPath: string;
  stateFilePath: string;
  gateway?: StoryModelingGateway;
  now?: () => string;
  price?: StoryModelingPrice | null;
  verifyCanonEventRead?(input: { projectId: string; eventId: string }): boolean;
}) {
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: options.rootPath, stateFilePath: options.stateFilePath });
  const gateway = options.gateway ?? createUnavailableStoryModelingGateway();
  const now = options.now ?? (() => new Date().toISOString());
  const active = new Map<string, AbortController>();
  const projectPath = (projectId: string) => workspace.resolveProjectWorkspacePath({ projectId });
  const runFile = (projectId: string, runId: string) => path.join(projectPath(projectId), ".world-os", "tianyi", "story-modeling", `${safeRunId(runId)}.json`);
  const logicReviewFile = (projectId: string) => path.join(projectPath(projectId), ".world-os", "tianyi", "story-modeling", "reviews", "logic.json");

  return {
    planStoryModeling(input: { projectId: string; tool: StoryModelingTool; scope: StoryModelingScope; eventRefs: StoryStudioEventReference[]; previousManifestDigest?: string | null; structuralChange?: boolean }) {
      const snapshot = snapshotRequest(input.projectId, input.eventRefs);
      const manifest = createStoryModelingSourceManifest({ projectId: input.projectId, sources: snapshot.sources.map(({ content: _content, ...source }) => source) });
      const previous = input.previousManifestDigest ? list(input.projectId).find((run) => run.sourceManifestDigest === input.previousManifestDigest) ?? null : null;
      const changedSourceIds = input.previousManifestDigest === manifest.digest ? [] : changedSources(manifest.sources, previous?.sourceSnapshot ?? []);
      const scope = resolveScope(input.scope, manifest.sources, input.eventRefs, changedSourceIds);
      return { manifest, scope, modelingBasis: manifest.sources.some((source) => source.sourceOrigin === "original-prose") ? "original-sources" as const : "event-only" as const, recommendation: recommendStoryModelingScope({ manifest, previousManifestDigest: input.previousManifestDigest, changedSourceIds, structuralChange: Boolean(input.structuralChange) }), estimate: estimateStoryModelingRun({ manifest, scope, eventCount: input.eventRefs.length, maxOutputTokensPerRequest: 512, price: options.price ?? null }) };
    },
    createStoryModelingRun(input: { request: unknown; runId: string }) {
      const request = normalizeStoryModelingRequest(input.request);
      snapshotRequest(request.projectId, request.eventRefs);
      const existing = list(request.projectId).find((run) => run.operationId === request.operationId);
      if (existing) return structuredClone(existing);
      return structuredClone(writeNew({ ...createStoryModelingRun({ request, runId: input.runId, now: now() }), storeVersion: STORE_VERSION }));
    },
    async executeStoryModelingRun(input: { projectId: string; runId: string }) {
      const run = requireRun(input.projectId, input.runId);
      if (run.status === "ready") return structuredClone(run);
      if (!["created", "failed", "stopped"].includes(run.status)) throw new Error("Story modeling Run cannot execute from its current state.");
      const key = `${run.projectId}\u0000${run.runId}`;
      if (active.has(key)) throw new Error("Story modeling Run already has an active Attempt.");
      const controller = new AbortController();
      active.set(key, controller);
      const running = replace({ ...run, status: "running", failureReason: null, completedAt: null, budgetReservation: { ...run.budgetReservation, status: "reserved" }, progress: { ...run.progress, currentBatch: run.progress.completedBatches, stage: "extracting" } });
      try {
        const request = requestFromRun(running);
        const snapshot = snapshotRequest(run.projectId, run.sourceEventRefs);
        const sourceIds = new Set(run.affectedSourceIds);
        const sources = snapshot.sources.filter((source) => sourceIds.has(source.sourceId));
        const output = await gateway.generate({
          request,
          runId: run.runId,
          signal: controller.signal,
          sources,
          completedBatches: running.batchReceipts.map((receipt) => ({ batchIndex: receipt.batchIndex, inputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens, result: receipt.result })),
          async onBatch(batch) {
            if (controller.signal.aborted) throw new Error("Story modeling Run was stopped before the next batch.");
            const latest = requireRun(run.projectId, run.runId);
            if (latest.status !== "running") throw new Error("Story modeling Run is no longer active.");
            const receipt = { batchIndex: batch.batchIndex, status: "ready" as const, providerRequests: 1 as const, inputTokens: batch.inputTokens, outputTokens: batch.outputTokens, result: batch.result };
            const receipts = [...latest.batchReceipts.filter((item) => item.batchIndex !== batch.batchIndex), receipt].sort((left, right) => left.batchIndex - right.batchIndex);
            replace({ ...latest, batchReceipts: receipts, progress: { ...latest.progress, completedBatches: receipts.length, currentBatch: receipts.length < latest.progress.totalBatches ? batch.batchIndex + 1 : null, stage: receipts.length < latest.progress.totalBatches ? "extracting" : "aggregating", inputTokens: receipts.reduce((sum, item) => sum + item.inputTokens, 0), outputTokens: receipts.reduce((sum, item) => sum + item.outputTokens, 0) } });
          }
        });
        if (!Number.isSafeInteger(output.usage.providerRequests) || output.usage.providerRequests < 1 || output.usage.providerRequests > run.estimate.providerRequestRange.max) throw new Error("Story modeling Provider request count exceeded the confirmed estimate.");
        const totalTokens = output.usage.inputTokens + output.usage.outputTokens;
        const actualCost = options.price ? roundUsd(output.usage.inputTokens / 1_000_000 * options.price.inputPerMillionTokens + output.usage.outputTokens / 1_000_000 * options.price.outputPerMillionTokens) : null;
        const result = validateStoryModelingResult({ request, runId: run.runId, result: output.result });
        const latest = requireRun(run.projectId, run.runId);
        return structuredClone(replace({ ...latest, status: "ready", provider: output.provider, actual: { providerRequests: output.usage.providerRequests, inputTokens: output.usage.inputTokens, outputTokens: output.usage.outputTokens, totalTokens, cost: actualCost === null ? null : { currency: "USD", value: actualCost } }, result, progress: { ...latest.progress, completedBatches: latest.progress.totalBatches, currentBatch: null, stage: "complete", inputTokens: output.usage.inputTokens, outputTokens: output.usage.outputTokens }, budgetReservation: { ...latest.budgetReservation, status: "consumed" }, completedAt: now(), failureReason: null }));
      } catch (cause) {
        const latest = requireRun(run.projectId, run.runId);
        const terminal = replace({ ...latest, status: controller.signal.aborted ? "stopped" : "failed", progress: { ...latest.progress, currentBatch: null, stage: controller.signal.aborted ? "stopped" : "failed" }, completedAt: now(), failureReason: cause instanceof Error ? cause.message.slice(0, 240) : "Story modeling failed." });
        if (controller.signal.aborted) return structuredClone(terminal);
        throw cause;
      } finally { active.delete(key); }
    },
    readStoryModelingRun(input: { projectId: string; runId: string }) { return readStored(input.projectId, input.runId); },
    listStoryModelingRuns(input: { projectId: string }) { return list(input.projectId).map((run) => structuredClone(run)); },
    stopStoryModelingRun(input: { projectId: string; runId: string }) { const run = requireRun(input.projectId, input.runId); active.get(`${run.projectId}\u0000${run.runId}`)?.abort(); return structuredClone(replace({ ...run, status: "stopped", progress: { ...run.progress, currentBatch: null, stage: "stopped" }, budgetReservation: { ...run.budgetReservation, status: "released" }, completedAt: now(), failureReason: "作者已停止本次故事建模。" })); },
    listStoryLogicReviews(input: { projectId: string }) { return structuredClone(readLogicReviews(input.projectId).records); },
    reviewStoryLogicFinding(input: { projectId: string; findingId: string; source: StoryLogicFinding["source"]; evidenceRefs: string[]; authorStatus: "ignored" | "resolved" }) {
      const findingId = safeFindingId(input.findingId);
      if (input.source !== "local" && input.source !== "ai") throw new Error("Story logic review source is invalid.");
      if (input.authorStatus !== "ignored" && input.authorStatus !== "resolved") throw new Error("Story logic review status is invalid.");
      if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length > 256 || input.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 240)) throw new Error("Story logic review evidence is invalid.");
      const store = readLogicReviews(input.projectId);
      const record: StoryLogicReviewRecord = { version: "story-modeling-logic-review/v1", projectId: input.projectId, findingId, source: input.source, evidenceDigest: digest(JSON.stringify([...new Set(input.evidenceRefs)].sort())), authorStatus: input.authorStatus, updatedAt: now() };
      const next = { ...store, records: [...store.records.filter((item) => item.findingId !== findingId), record].sort((left, right) => left.findingId.localeCompare(right.findingId)) };
      replaceFileAtomically({ rootPath: projectPath(input.projectId), targetPath: logicReviewFile(input.projectId), content: `${JSON.stringify(next, null, 2)}\n` });
      return structuredClone(record);
    }
  };

  function snapshotRequest(projectId: string, refs: StoryStudioEventReference[]): { events: Array<{ reference: StoryStudioEventReference; event: ReturnType<typeof workspace.readWorldObject> }>; sources: StoryModelingEvidenceSource[] } {
    if (!Array.isArray(refs) || refs.length > 512) throw new Error("Story modeling Event scope is invalid.");
    const events = refs.map((reference) => {
      const event = workspace.readWorldObject({ projectId, objectId: reference.eventId });
      assertStoryStudioEventReferenceEligibility({ reference, event, consumer: "tianyi-grounded", canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId, eventId: event.id })) });
      return { reference, event };
    });
    const writing = workspace.getWritingBootstrap({ projectId }).chapters.flatMap((chapter) => [chapter, ...chapter.scenes]).map((summary) => workspace.readWritingDocument({ projectId, documentId: summary.id }));
    const writingSources: StoryModelingEvidenceSource[] = writing.map((document) => ({ sourceId: `writing-source.${document.id}`, sourceKind: document.type, sourceOrigin: "original-prose", label: document.title, revision: document.revisionToken, contentDigest: digest(document.body), characterCount: [...document.body].length, dependencySourceIds: document.type === "scene" && document.chapterId ? [`writing-source.${document.chapterId}`] : [], content: document.body }));
    const importedSources: StoryModelingEvidenceSource[] = workspace.listSourceImportDocuments({ projectId }).flatMap((document) => {
      const revision = document.revisions.find((item) => item.revisionId === document.currentRevisionId);
      return revision ? [{ sourceId: `import-source.${document.sourceDocumentId}`, sourceKind: "imported-document" as const, sourceOrigin: "original-prose" as const, label: document.title, revision: revision.revisionId, contentDigest: `sha256:${revision.revisionHash}` as const, characterCount: [...revision.content].length, dependencySourceIds: [], content: revision.content }] : [];
    });
    const eventSources: StoryModelingEvidenceSource[] = events.map(({ reference, event }, index) => ({ sourceId: `event-source.${reference.eventId}`, sourceKind: "event", sourceOrigin: "structured-event", label: event.title, revision: reference.revisionToken, contentDigest: digest(event.body), characterCount: [...event.body].length, dependencySourceIds: index ? [`event-source.${events[index - 1]!.reference.eventId}`] : [], content: event.body }));
    const sources = [...writingSources, ...importedSources, ...eventSources];
    if (!sources.length) throw new Error("Story modeling requires original source material or structured Event evidence.");
    return { events, sources };
  }
  function requestFromRun(run: StoredRun): StoryModelingRequest { const snapshot = snapshotRequest(run.projectId, run.sourceEventRefs); const manifest = createStoryModelingSourceManifest({ projectId: run.projectId, sources: snapshot.sources.map(({ content: _content, ...source }) => source) }); if (manifest.digest !== run.sourceManifestDigest) throw new Error("Story modeling sources changed after author confirmation."); return { projectId: run.projectId, operationId: run.operationId, tool: run.tool, trigger: run.trigger, scope: run.scope, manifest, eventRefs: run.sourceEventRefs, selectedPerspectiveRefs: run.selectedPerspectiveRefs, estimate: run.estimate, authorConfirmedAt: run.createdAt }; }
  function readStored(projectId: string, runId: string): StoredRun | null { const source = readExistingUtf8(projectPath(projectId), runFile(projectId, runId)); if (!source) return null; const parsed = JSON.parse(source) as StoredRun; if (parsed.storeVersion !== STORE_VERSION || parsed.projectId !== projectId || parsed.runId !== runId) throw new Error("Story modeling artifact scope is invalid."); const batchPlan = parsed.batchPlan ?? []; return { ...parsed, selectedPerspectiveRefs: parsed.selectedPerspectiveRefs ?? [], batchPlan, progress: parsed.progress ?? { totalBatches: batchPlan.length, completedBatches: 0, currentBatch: null, stage: parsed.status === "ready" ? "complete" : "queued", inputTokens: parsed.actual?.inputTokens ?? 0, outputTokens: parsed.actual?.outputTokens ?? 0 }, batchReceipts: parsed.batchReceipts ?? [], budgetReservation: parsed.budgetReservation ?? { reservationId: `story-modeling-budget.${parsed.runId}`, providerRequestLimit: parsed.estimate.providerRequestRange.max, status: parsed.status === "ready" ? "consumed" : "confirmed" } }; }
  function writeNew(run: StoredRun): StoredRun { const target = runFile(run.projectId, run.runId); const outcome = publishFileNoReplace({ rootPath: projectPath(run.projectId), targetPath: target, content: `${JSON.stringify(run, null, 2)}\n` }); return outcome === "exists" ? readStored(run.projectId, run.runId)! : run; }
  function replace(run: StoredRun): StoredRun { replaceFileAtomically({ rootPath: projectPath(run.projectId), targetPath: runFile(run.projectId, run.runId), content: `${JSON.stringify(run, null, 2)}\n` }); return run; }
  function requireRun(projectId: string, runId: string): StoredRun { const run = readStored(projectId, runId); if (!run) throw new Error("Story modeling Run does not exist."); return run; }
  function list(projectId: string): StoredRun[] { const dir = path.dirname(runFile(projectId, "story-modeling-run.placeholder")); if (!existsSync(dir)) return []; return readdirSync(dir).filter((entry) => entry.endsWith(".json")).flatMap((entry) => { const run = readStored(projectId, entry.slice(0, -5)); return run ? [run] : []; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  function readLogicReviews(projectId: string): LogicReviewStore {
    const source = readExistingUtf8(projectPath(projectId), logicReviewFile(projectId));
    if (!source) return { version: LOGIC_REVIEW_STORE_VERSION, projectId, records: [] };
    const parsed = JSON.parse(source) as LogicReviewStore;
    if (parsed.version !== LOGIC_REVIEW_STORE_VERSION || parsed.projectId !== projectId || !Array.isArray(parsed.records)) throw new Error("Story logic review artifact scope is invalid.");
    return parsed;
  }
}

function resolveScope(scope: StoryModelingScope, sources: Array<{ sourceId: string; dependencySourceIds: string[] }>, eventRefs: StoryStudioEventReference[], changed: string[]): StoryModelingScope {
  const allSourceIds = sources.map((source) => source.sourceId);
  const existing = new Set(allSourceIds);
  if (scope.kind === "full-book") return { kind: "full-book", sourceIds: allSourceIds };
  if (scope.kind === "selection") { const selected = scope.sourceIds.filter((id) => existing.has(id)); return { kind: "selection", sourceIds: selected.length ? selected : eventRefs.map((ref) => `event-source.${ref.eventId}`).filter((id) => existing.has(id)), eventRefs, unitIds: scope.unitIds }; }
  const requested = scope.changedSourceIds.filter((id) => existing.has(id));
  const changedSourceIds = changed.length ? changed : requested.length ? requested : allSourceIds;
  const dependencySourceIds = [...new Set([...scope.dependencySourceIds.filter((id) => existing.has(id)), ...sources.filter((source) => changedSourceIds.includes(source.sourceId)).flatMap((source) => source.dependencySourceIds)])].filter((id) => existing.has(id) && !changedSourceIds.includes(id));
  return { kind: "incremental", changedSourceIds, dependencySourceIds };
}
function changedSources(current: Array<{ sourceId: string; revision: string; contentDigest: string }>, previous: Array<{ sourceId: string; revision: string; contentDigest: string }>): string[] { const prior = new Map(previous.map((source) => [source.sourceId, source])); return current.filter((source) => { const before = prior.get(source.sourceId); return !before || before.revision !== source.revision || before.contentDigest !== source.contentDigest; }).map((source) => source.sourceId); }
function digest(value: string): `sha256:${string}` { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function safeRunId(value: string): string { if (!/^story-modeling-run\.[\p{L}\p{N}._:-]+$/u.test(value)) throw new Error("Story modeling Run identifier is invalid."); return value; }
function safeFindingId(value: string): string { if (!/^[\p{L}\p{N}._:-]{1,180}$/u.test(value)) throw new Error("Story logic finding identifier is invalid."); return value; }
function roundUsd(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

export type StoryStudioStoryModelingOperations = ReturnType<typeof createStoryStudioStoryModelingOperations>;
