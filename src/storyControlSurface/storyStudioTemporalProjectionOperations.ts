import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { createPiTemporalProjectionGateway } from "../storyAgent/piTemporalProjectionGateway.ts";
import type {
  TemporalProjectionEvidenceEvent,
  TemporalProjectionEvidenceRelation,
  TemporalProjectionGateway
} from "../storyAgent/temporalProjectionGateway.ts";
import {
  createTemporalProjectionRun,
  normalizeTemporalProjectionRequest,
  validateTemporalProjectionResult,
  validateTemporalProjectionRun,
  type TemporalProjectionRequest,
  type TemporalProjectionRun
} from "../storyContracts/temporalProjection.ts";
import { assertStoryStudioEventReferenceEligibility } from "../storyContracts/storyStudioEventReference.ts";
import { publishFileNoReplace, readExistingUtf8, replaceFileAtomically } from "./atomicNoReplaceFile.ts";
import { createStoryStudioRelationOperations, type RelationReadProjectionR0 } from "./storyStudioRelationOperations.ts";
import { createStoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";

const STORE_VERSION = "story-studio-temporal-projection-run/v1" as const;
type StoredRun = TemporalProjectionRun & { storeVersion: typeof STORE_VERSION };

export function createStoryStudioTemporalProjectionOperations(options: {
  rootPath: string;
  stateFilePath: string;
  now?: () => string;
  gateway?: TemporalProjectionGateway;
  executionTimeoutMs?: number;
  verifyCanonEventRead?(input: { projectId: string; eventId: string }): boolean;
}) {
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: options.rootPath, stateFilePath: options.stateFilePath });
  const relations = createStoryStudioRelationOperations({ workspaceOperations: workspace, verifyCanonEventRead: options.verifyCanonEventRead });
  const gateway = options.gateway ?? createPiTemporalProjectionGateway({ now: options.now });
  const now = options.now ?? (() => new Date().toISOString());
  const timeoutMs = boundedTimeout(options.executionTimeoutMs ?? 15_000);
  const active = new Map<string, AbortController>();
  const projectPath = (projectId: string) => workspace.resolveProjectWorkspacePath({ projectId });
  const runFile = (projectId: string, runId: string) => path.join(projectPath(projectId), ".world-os", "tianyi", "temporal-projections", `${safeRunId(runId)}.json`);

  return {
    currentGraphRevision(input: { projectId: string; eventRefs: unknown[] }) {
      const request = normalizeTemporalProjectionRequest({ projectId: input.projectId, graphRevisionHash: "0".repeat(64), eventRefs: input.eventRefs, operationId: "temporal-operation.revision-read", trigger: "author-requested" });
      const evidence = resolveEvidence(request);
      return { graphRevisionHash: computeTemporalGraphRevisionHash(request, evidence.relations), eventCount: evidence.events.length, relationCount: evidence.relations.length };
    },
    createTemporalProjectionRun(input: { request: unknown; runId: string }) {
      const request = normalizeTemporalProjectionRequest(input.request);
      const evidence = resolveEvidence(request);
      assertCurrentGraphRevision(request, evidence.relations);
      const existing = list(request.projectId).find((run) => run.operationId === request.operationId);
      if (existing) return structuredClone(markStale(existing));
      const run = createTemporalProjectionRun({ ...request, runId: input.runId, createdAt: now() });
      return structuredClone(writeNew({ ...run, storeVersion: STORE_VERSION }));
    },
    async executeTemporalProjectionRun(input: { projectId: string; runId: string }) {
      const run = requireRun(input.projectId, input.runId);
      if (run.status === "ready") return structuredClone(run);
      if (run.status !== "created") throw new Error("Temporal projection Run cannot execute from its current state.");
      return execute(run);
    },
    async retryTemporalProjectionRun(input: { projectId: string; runId: string }) {
      const run = requireRun(input.projectId, input.runId);
      if (!(["failed", "stopped"] as const).includes(run.status as "failed" | "stopped")) throw new Error("Only a failed or stopped temporal projection Run can be retried by the author.");
      return execute(run);
    },
    stopTemporalProjectionRun(input: { projectId: string; runId: string }) {
      const run = requireRun(input.projectId, input.runId);
      active.get(key(input.projectId, input.runId))?.abort();
      if (["ready", "failed", "stopped"].includes(run.status)) return structuredClone(run);
      return structuredClone(replace({ ...run, status: "stopped", failureReason: "作者已停止本次时间位置推断。" }));
    },
    readTemporalProjectionRun(input: { projectId: string; runId: string }) { const run = readStored(input.projectId, input.runId); return run ? structuredClone(markStale(run)) : null; },
    listTemporalProjectionRuns(input: { projectId: string }) { return list(input.projectId).map((run) => structuredClone(markStale(run))); },
    readTemporalProjectionByRevision(input: { projectId: string; graphRevisionHash: string }) {
      const run = list(input.projectId).find((candidate) => candidate.graphRevisionHash === input.graphRevisionHash && candidate.status === "ready") ?? null;
      return run ? structuredClone(markStale(run)) : null;
    }
  };

  async function execute(run: StoredRun): Promise<TemporalProjectionRun> {
    const current = key(run.projectId, run.runId);
    if (active.has(current)) throw new Error("Temporal projection Run already has an active Attempt.");
    const controller = new AbortController();
    active.set(current, controller);
    const generating = replace({ ...run, status: "generating", failureReason: null });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const request: TemporalProjectionRequest = { projectId: run.projectId, graphRevisionHash: run.graphRevisionHash, eventRefs: run.sourceSnapshot, operationId: run.operationId, trigger: run.trigger };
      const evidence = resolveEvidence(request);
      assertCurrentGraphRevision(request, evidence.relations);
      const result = await raceAbort(gateway.generate({ request, ...evidence, runtime: { runId: run.runId, attemptId: `temporal-attempt.${run.runId}.1`, signal: controller.signal } }), controller.signal);
      const projection = validateTemporalProjectionResult({ request, result });
      return structuredClone(replace({ ...generating, ...projection, status: "ready", stale: false, failureReason: null }));
    } catch (cause) {
      const stopped = controller.signal.aborted;
      replace({ ...generating, status: stopped ? "stopped" : "failed", failureReason: stopped ? "时间位置推断已安全停止。" : safeFailure(cause) });
      throw cause;
    } finally {
      clearTimeout(timer);
      active.delete(current);
    }
  }

  function resolveEvidence(request: TemporalProjectionRequest): { events: TemporalProjectionEvidenceEvent[]; relations: TemporalProjectionEvidenceRelation[] } {
    const events = request.eventRefs.map((reference, storyOrder) => {
      const event = workspace.readWorldObject({ projectId: request.projectId, objectId: reference.eventId });
      assertStoryStudioEventReferenceEligibility({ reference, event, consumer: "tianyi-grounded", canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId: request.projectId, eventId: event.id })) });
      const authored = authoredTime(event.tags);
      return { id: event.id, title: event.title, summary: firstSummary(event.body), tags: [...event.tags], storyOrder, authoredTimeLabel: authored.label, authoredTimeKind: authored.kind };
    });
    const scope = new Set(events.map((event) => event.id));
    const relationReads = relations.listRelations({ projectId: request.projectId, includeArchived: false }).relations
      .filter((relation) => relation.reviewState !== "rejected" && scope.has(relation.sourceObjectId) && scope.has(relation.targetObjectId));
    return { events, relations: relationReads.map(temporalRelationEvidence) };
  }

  function assertCurrentGraphRevision(request: TemporalProjectionRequest, relationEvidence: TemporalProjectionEvidenceRelation[]) {
    if (computeTemporalGraphRevisionHash(request, relationEvidence) !== request.graphRevisionHash) throw new Error("Temporal projection graph revision is stale.");
  }

  function markStale(run: StoredRun): StoredRun {
    try {
      const request: TemporalProjectionRequest = { projectId: run.projectId, graphRevisionHash: run.graphRevisionHash, eventRefs: run.sourceSnapshot, operationId: run.operationId, trigger: run.trigger };
      const evidence = resolveEvidence(request);
      return { ...run, stale: computeTemporalGraphRevisionHash(request, evidence.relations) !== run.graphRevisionHash };
    } catch { return { ...run, stale: true }; }
  }

  function readStored(projectId: string, runId: string): StoredRun | null {
    const source = readExistingUtf8(projectPath(projectId), runFile(projectId, runId));
    if (!source) return null;
    const parsed = JSON.parse(source) as Record<string, unknown>;
    if (parsed.storeVersion !== STORE_VERSION) throw new Error("Temporal projection artifact version is invalid.");
    const { storeVersion: _, ...projection } = parsed;
    const run = validateTemporalProjectionRun(projection);
    if (run.projectId !== projectId || run.runId !== runId) throw new Error("Temporal projection artifact scope is invalid.");
    return { ...run, storeVersion: STORE_VERSION };
  }
  function writeNew(run: StoredRun): StoredRun { const target = runFile(run.projectId, run.runId); const outcome = publishFileNoReplace({ rootPath: projectPath(run.projectId), targetPath: target, content: `${JSON.stringify(run, null, 2)}\n` }); return outcome === "exists" ? readStored(run.projectId, run.runId)! : run; }
  function replace(run: StoredRun): StoredRun { replaceFileAtomically({ rootPath: projectPath(run.projectId), targetPath: runFile(run.projectId, run.runId), content: `${JSON.stringify(run, null, 2)}\n` }); return run; }
  function requireRun(projectId: string, runId: string): StoredRun { const run = readStored(projectId, runId); if (!run) throw new Error("Temporal projection Run does not exist."); return markStale(run); }
  function list(projectId: string): StoredRun[] { const directory = path.dirname(runFile(projectId, "temporal-run.placeholder")); if (!existsSync(directory)) return []; return readdirSync(directory).filter((entry) => /^temporal-run\.[\p{L}\p{N}._:-]+\.json$/u.test(entry)).flatMap((entry) => { const run = readStored(projectId, entry.slice(0, -5)); return run ? [run] : []; }).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.runId.localeCompare(left.runId)); }
}

export function computeTemporalGraphRevisionHash(request: Pick<TemporalProjectionRequest, "projectId" | "eventRefs">, relations: readonly TemporalProjectionEvidenceRelation[]): string {
  const canonical = {
    projectId: request.projectId,
    events: request.eventRefs.map((reference) => ({ eventId: reference.eventId, revisionToken: reference.revisionToken, state: reference.state })),
    relations: [...relations].map((relation) => ({ id: relation.id, sourceEventId: relation.sourceEventId, targetEventId: relation.targetEventId, label: relation.label, strictBefore: relation.strictBefore, confirmed: relation.confirmed })).sort((left, right) => left.id.localeCompare(right.id))
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function temporalRelationEvidence(relation: RelationReadProjectionR0): TemporalProjectionEvidenceRelation {
  const label = relation.currentTypeLabel ?? relation.relationLabelSnapshot;
  const ordered = relation.direction === "forward" && /(?:促使|导致|影响|先于|之前|后续|延续|before|after|cause|result)/iu.test(label);
  return { id: relation.relationId, sourceEventId: relation.sourceObjectId, targetEventId: relation.targetObjectId, label, strictBefore: relation.reviewState === "confirmed" && ordered, confirmed: relation.reviewState === "confirmed" };
}
function authoredTime(tags: readonly string[]): { label: string | null; kind: TemporalProjectionEvidenceEvent["authoredTimeKind"] } { const raw = tags.map((tag) => /^(?:Time|时间|World Time|世界时间)[：:]\s*(.+)$/iu.exec(tag)?.[1]?.trim()).find(Boolean) ?? null; if (!raw || /^(?:时间未定|未定|unknown)$/iu.test(raw)) return { label: null, kind: "unknown" }; if (/[~～–—至]/u.test(raw)) return { label: raw, kind: "range" }; if (/(?:之前|之后|同时|稍后|此前|此后)/u.test(raw)) return { label: raw, kind: "relative" }; return { label: raw, kind: "exact" }; }
function firstSummary(body: string): string { return body.split(/\n+/u).map((line) => line.replace(/^#+\s*/u, "").trim()).find((line) => line && !/^---$/u.test(line))?.slice(0, 240) ?? ""; }
function safeRunId(value: string): string { if (!/^temporal-run\.[\p{L}\p{N}._:-]+$/u.test(value)) throw new Error("Temporal projection Run identifier is invalid."); return value; }
function boundedTimeout(value: number): number { if (!Number.isSafeInteger(value) || value < 10 || value > 60_000) throw new Error("Temporal projection timeout is invalid."); return value; }
function safeFailure(cause: unknown): string { return cause instanceof Error && /temporal|projection|schema|event|relation|time/iu.test(cause.message) ? cause.message.slice(0, 240) : "时间位置推断在有界 Agent 运行中失败。"; }
function key(projectId: string, runId: string): string { return `${projectId}\u0000${runId}`; }
async function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> { if (signal.aborted) throw abortError(); let listener: (() => void) | null = null; try { return await Promise.race([promise, new Promise<T>((_, reject) => { listener = () => reject(abortError()); signal.addEventListener("abort", listener, { once: true }); })]); } finally { if (listener) signal.removeEventListener("abort", listener); } }
function abortError(): Error { const error = new Error("Temporal projection Agent Attempt was aborted."); error.name = "AbortError"; return error; }

export type StoryStudioTemporalProjectionOperations = ReturnType<typeof createStoryStudioTemporalProjectionOperations>;
