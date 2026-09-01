import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { createUnavailableStoryModelingGateway, type StoryModelingGateway } from "../storyAgent/storyModelingGateway.ts";
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
  type StoryModelingTool
} from "../storyContracts/storyModeling.ts";
import { assertStoryStudioEventReferenceEligibility, type StoryStudioEventReference } from "../storyContracts/storyStudioEventReference.ts";
import { publishFileNoReplace, readExistingUtf8, replaceFileAtomically } from "./atomicNoReplaceFile.ts";
import { createStoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";

const STORE_VERSION = "story-studio-story-modeling-run/v1" as const;
type StoredRun = StoryModelingRun & { storeVersion: typeof STORE_VERSION };

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

  return {
    planStoryModeling(input: { projectId: string; tool: StoryModelingTool; scope: StoryModelingScope; eventRefs: StoryStudioEventReference[]; previousManifestDigest?: string | null; structuralChange?: boolean }) {
      const snapshot = snapshotRequest(input.projectId, input.eventRefs);
      const manifest = createStoryModelingSourceManifest({ projectId: input.projectId, sources: snapshot.events.map(({ reference, event }, index) => ({ sourceId: `event-source.${reference.eventId}`, sourceKind: "event", revision: reference.revisionToken, contentDigest: `sha256:${createHash("sha256").update(event.body).digest("hex")}`, characterCount: [...event.body].length, dependencySourceIds: index ? [`event-source.${snapshot.events[index - 1]!.reference.eventId}`] : [] })) });
      const scope = resolveScope(input.scope, manifest.sources.map((source) => source.sourceId), input.eventRefs);
      const changedSourceIds = input.previousManifestDigest === manifest.digest ? [] : scope.kind === "incremental" ? scope.changedSourceIds : [];
      return { manifest, scope, recommendation: recommendStoryModelingScope({ manifest, previousManifestDigest: input.previousManifestDigest, changedSourceIds, structuralChange: Boolean(input.structuralChange) }), estimate: estimateStoryModelingRun({ manifest, scope, eventCount: input.eventRefs.length, maxOutputTokensPerRequest: 512, price: options.price ?? null }) };
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
      if (run.status !== "created") throw new Error("Story modeling Run cannot execute from its current state.");
      const key = `${run.projectId}\u0000${run.runId}`;
      if (active.has(key)) throw new Error("Story modeling Run already has an active Attempt.");
      const controller = new AbortController();
      active.set(key, controller);
      const running = replace({ ...run, status: "running", failureReason: null });
      try {
        const request = requestFromRun(running);
        const output = await gateway.generate({ request, runId: run.runId, signal: controller.signal });
        if (!Number.isSafeInteger(output.usage.providerRequests) || output.usage.providerRequests < 1 || output.usage.providerRequests > run.estimate.providerRequestRange.max) throw new Error("Story modeling Provider request count exceeded the confirmed estimate.");
        const totalTokens = output.usage.inputTokens + output.usage.outputTokens;
        const actualCost = options.price ? roundUsd(output.usage.inputTokens / 1_000_000 * options.price.inputPerMillionTokens + output.usage.outputTokens / 1_000_000 * options.price.outputPerMillionTokens) : null;
        const result = validateStoryModelingResult({ request, runId: run.runId, result: output.result });
        return structuredClone(replace({ ...running, status: "ready", provider: output.provider, actual: { providerRequests: output.usage.providerRequests, inputTokens: output.usage.inputTokens, outputTokens: output.usage.outputTokens, totalTokens, cost: actualCost === null ? null : { currency: "USD", value: actualCost } }, result, completedAt: now(), failureReason: null }));
      } catch (cause) {
        replace({ ...running, status: controller.signal.aborted ? "stopped" : "failed", completedAt: now(), failureReason: cause instanceof Error ? cause.message.slice(0, 240) : "Story modeling failed." });
        throw cause;
      } finally { active.delete(key); }
    },
    readStoryModelingRun(input: { projectId: string; runId: string }) { return readStored(input.projectId, input.runId); },
    listStoryModelingRuns(input: { projectId: string }) { return list(input.projectId).map((run) => structuredClone(run)); },
    stopStoryModelingRun(input: { projectId: string; runId: string }) { const run = requireRun(input.projectId, input.runId); active.get(`${run.projectId}\u0000${run.runId}`)?.abort(); return structuredClone(replace({ ...run, status: "stopped", completedAt: now(), failureReason: "作者已停止本次故事建模。" })); }
  };

  function snapshotRequest(projectId: string, refs: StoryStudioEventReference[]) {
    if (!Array.isArray(refs) || refs.length === 0 || refs.length > 512) throw new Error("Story modeling Event scope is invalid.");
    const events = refs.map((reference) => {
      const event = workspace.readWorldObject({ projectId, objectId: reference.eventId });
      assertStoryStudioEventReferenceEligibility({ reference, event, consumer: "tianyi-grounded", canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId, eventId: event.id })) });
      return { reference, event };
    });
    return { events };
  }
  function requestFromRun(run: StoredRun): StoryModelingRequest { const snapshot = snapshotRequest(run.projectId, run.sourceEventRefs); const manifest = createStoryModelingSourceManifest({ projectId: run.projectId, sources: snapshot.events.map(({ reference, event }, index) => ({ sourceId: `event-source.${reference.eventId}`, sourceKind: "event", revision: reference.revisionToken, contentDigest: `sha256:${createHash("sha256").update(event.body).digest("hex")}`, characterCount: [...event.body].length, dependencySourceIds: index ? [`event-source.${snapshot.events[index - 1]!.reference.eventId}`] : [] })) }); if (manifest.digest !== run.sourceManifestDigest) throw new Error("Story modeling sources changed after author confirmation."); return { projectId: run.projectId, operationId: run.operationId, tool: run.tool, trigger: run.trigger, scope: run.scope, manifest, eventRefs: run.sourceEventRefs, estimate: run.estimate, authorConfirmedAt: run.createdAt }; }
  function readStored(projectId: string, runId: string): StoredRun | null { const source = readExistingUtf8(projectPath(projectId), runFile(projectId, runId)); if (!source) return null; const parsed = JSON.parse(source) as StoredRun; if (parsed.storeVersion !== STORE_VERSION || parsed.projectId !== projectId || parsed.runId !== runId) throw new Error("Story modeling artifact scope is invalid."); return parsed; }
  function writeNew(run: StoredRun): StoredRun { const target = runFile(run.projectId, run.runId); const outcome = publishFileNoReplace({ rootPath: projectPath(run.projectId), targetPath: target, content: `${JSON.stringify(run, null, 2)}\n` }); return outcome === "exists" ? readStored(run.projectId, run.runId)! : run; }
  function replace(run: StoredRun): StoredRun { replaceFileAtomically({ rootPath: projectPath(run.projectId), targetPath: runFile(run.projectId, run.runId), content: `${JSON.stringify(run, null, 2)}\n` }); return run; }
  function requireRun(projectId: string, runId: string): StoredRun { const run = readStored(projectId, runId); if (!run) throw new Error("Story modeling Run does not exist."); return run; }
  function list(projectId: string): StoredRun[] { const dir = path.dirname(runFile(projectId, "story-modeling-run.placeholder")); if (!existsSync(dir)) return []; return readdirSync(dir).filter((entry) => entry.endsWith(".json")).flatMap((entry) => { const run = readStored(projectId, entry.slice(0, -5)); return run ? [run] : []; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
}

function resolveScope(scope: StoryModelingScope, allSourceIds: string[], eventRefs: StoryStudioEventReference[]): StoryModelingScope { if (scope.kind === "full-book") return { kind: "full-book", sourceIds: allSourceIds }; if (scope.kind === "selection") return { kind: "selection", sourceIds: scope.sourceIds.length ? scope.sourceIds : allSourceIds, eventRefs, unitIds: scope.unitIds }; return { kind: "incremental", changedSourceIds: scope.changedSourceIds.length ? scope.changedSourceIds : allSourceIds.slice(-1), dependencySourceIds: scope.dependencySourceIds }; }
function safeRunId(value: string): string { if (!/^story-modeling-run\.[\p{L}\p{N}._:-]+$/u.test(value)) throw new Error("Story modeling Run identifier is invalid."); return value; }
function roundUsd(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

export type StoryStudioStoryModelingOperations = ReturnType<typeof createStoryStudioStoryModelingOperations>;
