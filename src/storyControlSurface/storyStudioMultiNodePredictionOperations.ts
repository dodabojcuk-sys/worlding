import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createPiMultiNodePredictionGateway } from "../storyAgent/piMultiNodePredictionGateway.ts";
import { projectTianyiAgentExecution } from "../storyAgent/tianyiExecutionProjection.ts";
import type { MultiNodePredictionGateway } from "../storyAgent/multiNodePredictionGateway.ts";
import { createPredictionRun, normalizeMultiNodePredictionRequest, validatePredictionBundle, type PredictionRun } from "../storyContracts/multiNodePrediction.ts";
import { validateTianyiAgentExecutionProjection, type TianyiAgentExecutionProjection, type TianyiAgentRuntimeEvent } from "../storyContracts/tianyiAgentMode.ts";
import { assertStoryStudioEventReferenceEligibility } from "../storyContracts/storyStudioEventReference.ts";
import { publishFileNoReplace, readExistingUtf8, replaceFileAtomically } from "./atomicNoReplaceFile.ts";
import { createStoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";

const VERSION = "story-studio-multi-node-prediction-run/v1";
type PersistedRun = PredictionRun & { version: typeof VERSION };

export function createStoryStudioMultiNodePredictionOperations(options: { rootPath: string; stateFilePath: string; now?: () => string; gateway?: MultiNodePredictionGateway; executionTimeoutMs?: number; verifyCanonEventRead?(input: { projectId: string; eventId: string }): boolean }) {
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: options.rootPath, stateFilePath: options.stateFilePath });
  const now = options.now ?? (() => new Date().toISOString());
  const gateway = options.gateway ?? createPiMultiNodePredictionGateway({ now });
  const executionTimeoutMs = boundedTimeout(options.executionTimeoutMs ?? 15_000);
  const active = new Map<string, { controller: AbortController; attemptId: string; stopReason: string | null; timedOut: boolean }>();
  const projectPath = (projectId: string) => workspace.resolveProjectWorkspacePath({ projectId });
  const file = (projectId: string, runId: string) => path.join(projectPath(projectId), ".world-os", "tianyi", "multi-node-predictions", `${safeRunId(runId)}.json`);
  const executionFile = (projectId: string, runId: string) => path.join(projectPath(projectId), ".world-os", "tianyi", "multi-node-predictions", "execution", `${safeRunId(runId)}.json`);
  const readStored = (projectId: string, runId: string): PersistedRun | null => {
    const source = readExistingUtf8(projectPath(projectId), file(projectId, runId));
    if (!source) return null;
    const result = JSON.parse(source) as PersistedRun;
    if (result.version !== VERSION || result.projectId !== projectId || result.runId !== runId) throw new Error("Prediction Run file is invalid.");
    return result;
  };
  const writeNew = (run: PersistedRun) => { const target = file(run.projectId, run.runId); const outcome = publishFileNoReplace({ rootPath: projectPath(run.projectId), targetPath: target, content: `${JSON.stringify(run, null, 2)}\n` }); if (outcome === "exists") return readStored(run.projectId, run.runId)!; return run; };
  const replace = (run: PersistedRun) => { replaceFileAtomically({ rootPath: projectPath(run.projectId), targetPath: file(run.projectId, run.runId), content: `${JSON.stringify(run, null, 2)}\n` }); return run; };
  const readExecution = (projectId: string, runId: string): TianyiAgentExecutionProjection | null => {
    const source = readExistingUtf8(projectPath(projectId), executionFile(projectId, runId));
    if (!source) return null;
    const projection = validateTianyiAgentExecutionProjection(JSON.parse(source) as TianyiAgentExecutionProjection);
    if (projection.projectId !== projectId || projection.runId !== runId) throw new Error("Agent execution projection scope is invalid.");
    return projection;
  };
  const writeExecution = (projection: TianyiAgentExecutionProjection) => {
    replaceFileAtomically({ rootPath: projectPath(projection.projectId), targetPath: executionFile(projection.projectId, projection.runId), content: `${JSON.stringify(projection, null, 2)}\n` });
    return projection;
  };
  const verifySources = (run: PredictionRun) => run.sourceSnapshot.map((reference) => {
    const event = workspace.readWorldObject({ projectId: run.projectId, objectId: reference.eventId });
    assertStoryStudioEventReferenceEligibility({ reference, event, consumer: "tianyi-grounded", canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId: run.projectId, eventId: event.id })) });
    return event;
  });
  const markStaleIfSourceChanged = (run: PersistedRun): PersistedRun => {
    if (run.status !== "ready") return run;
    try { verifySources(run); return run; }
    catch { return replace({ ...run, status: "stale" }); }
  };
  return {
    createPredictionRun(input: { request: unknown; runId: string }) {
      const request = normalizeMultiNodePredictionRequest(input.request);
      const duplicate = list(request.projectId).find((run) => run.operationId === request.operationId);
      if (duplicate) return structuredClone(duplicate);
      const run = createPredictionRun({ ...request, runId: input.runId, createdAt: now() });
      verifySources(run);
      return structuredClone(writeNew({ ...run, version: VERSION }));
    },
    async executePredictionRun(input: { projectId: string; runId: string }) {
      const stored = requireRun(input.projectId, input.runId);
      if (stored.status === "ready") return structuredClone(stored);
      if (stored.status !== "created") throw new Error("Prediction Run cannot be executed from its current state.");
      return executeAttempt(stored, nextAttemptId(stored));
    },
    async retryPredictionRun(input: { projectId: string; runId: string }) {
      const stored = requireRun(input.projectId, input.runId);
      if (!["failed", "stopped"].includes(stored.status)) throw new Error("Only a failed or stopped Prediction Run can create a retry attempt.");
      return executeAttempt(stored, nextAttemptId(stored));
    },
    stopPredictionRun(input: { projectId: string; runId: string; reason?: string }) {
      const stored = requireRun(input.projectId, input.runId);
      if (["ready", "failed", "stopped", "stale", "abandoned"].includes(stored.status)) return structuredClone(stored);
      const key = activeKey(input.projectId, input.runId);
      const running = active.get(key);
      if (running) {
        running.stopReason = safeStopReason(input.reason);
        running.controller.abort();
      } else {
        const projection = readExecution(input.projectId, input.runId);
        const attemptId = projection?.activeAttemptId ?? nextAttemptId(stored);
        const previous = projection?.attempts.filter((attempt) => attempt.attemptId !== attemptId) ?? [];
        const previousEvents = projection?.attempts.find((attempt) => attempt.attemptId === attemptId)?.events ?? [];
        const event: TianyiAgentRuntimeEvent = { type: "TianyiAgentRunStopped", runId: stored.runId, attemptId, reason: safeStopReason(input.reason), recordedAt: now() };
        writeExecution(projectTianyiAgentExecution({ projectId: stored.projectId, runId: stored.runId, attemptId, timeoutMs: executionTimeoutMs, events: [...previousEvents, event], previousAttempts: previous }));
      }
      return structuredClone(replace({ ...stored, status: "stopped" }));
    },
    readPredictionRun(input: { projectId: string; runId: string }) {
      const run = readStored(input.projectId, input.runId);
      return run ? structuredClone(markStaleIfSourceChanged(run)) : null;
    },
    readPredictionExecution(input: { projectId: string; runId: string }) { const projection = readExecution(input.projectId, input.runId); return projection ? structuredClone(projection) : null; },
    listPredictionRuns(input: { projectId: string }) { return list(input.projectId).map((run) => structuredClone(markStaleIfSourceChanged(run))); },
    abandonPredictionRun(input: { projectId: string; runId: string }) {
      const run = requireRun(input.projectId, input.runId);
      if (["abandoned", "stale"].includes(run.status)) return structuredClone(run);
      return structuredClone(replace({ ...run, status: "abandoned" }));
    },
    markPredictionRunStale(input: { projectId: string; runId: string }) { const run = requireRun(input.projectId, input.runId); return structuredClone(replace({ ...run, status: "stale" })); }
  };

  async function executeAttempt(stored: PersistedRun, attemptId: string): Promise<PredictionRun> {
      const key = activeKey(stored.projectId, stored.runId);
      if (active.has(key)) throw new Error("Prediction Run already has an active attempt.");
      const controller = new AbortController();
      const state = { controller, attemptId, stopReason: null as string | null, timedOut: false };
      active.set(key, state);
      replace({ ...stored, bundle: null, status: "generating" });
      const previousProjection = readExecution(stored.projectId, stored.runId);
      const previousAttempts = previousProjection?.attempts.filter((attempt) => attempt.attemptId !== attemptId) ?? [];
      const runtimeEvents: TianyiAgentRuntimeEvent[] = [];
      let terminalRecorded = false;
      const record = async (event: TianyiAgentRuntimeEvent) => {
        if (terminalRecorded) return;
        runtimeEvents.push(structuredClone(event));
        writeExecution(projectTianyiAgentExecution({ projectId: stored.projectId, runId: stored.runId, attemptId, timeoutMs: executionTimeoutMs, events: runtimeEvents, previousAttempts }));
      };
      const timer = setTimeout(() => { state.timedOut = true; controller.abort(); }, executionTimeoutMs);
      try {
        verifySources(stored);
        const knownEvents = workspace.getStoryStudioWorldLibraryBootstrap({ projectId: stored.projectId }).objects
          .filter((object) => object.type === "event")
          .map((object) => ({ id: object.id, title: object.title }));
        const generated = await raceAbort(gateway.generate({
          request: { projectId: stored.projectId, sourceEventRefs: stored.sourceSnapshot, authorGoal: stored.authorGoal, predictionMode: stored.predictionMode, operationId: stored.operationId },
          knownEvents,
          bundleId: `prediction-bundle.${stored.runId}`,
          runtime: {
            runId: stored.runId,
            attemptId,
            workVersionId: "work-version.prediction",
            sessionId: `prediction-session.${stored.runId}`,
            signal: controller.signal,
            onEvent: record
          }
        }), controller.signal);
        const validating = replace({ ...stored, status: "validating" });
        const bundle = validatePredictionBundle({ run: validating, bundle: generated });
        return structuredClone(replace({ ...validating, bundle, status: "ready" }));
      } catch (cause) {
        if (state.timedOut) {
          await record({ type: "TianyiAgentRunFailed", runId: stored.runId, attemptId, reason: "Agent attempt exceeded its bounded execution time.", retryable: true, timedOut: true, recordedAt: now() });
          terminalRecorded = true;
          replace({ ...stored, bundle: null, status: "failed" });
        } else if (controller.signal.aborted) {
          await record({ type: "TianyiAgentRunStopped", runId: stored.runId, attemptId, reason: state.stopReason ?? "作者停止了本次 Agent Attempt。", recordedAt: now() });
          terminalRecorded = true;
          replace({ ...stored, bundle: null, status: "stopped" });
        } else {
          await record({ type: "TianyiAgentRunFailed", runId: stored.runId, attemptId, reason: safeFailureReason(cause), retryable: true, timedOut: false, recordedAt: now() });
          terminalRecorded = true;
          replace({ ...stored, bundle: null, status: "failed" });
        }
        throw cause;
      } finally {
        clearTimeout(timer);
        active.delete(key);
      }
  }
  function nextAttemptId(run: PersistedRun): string { return `agent-attempt.${run.runId}.${(readExecution(run.projectId, run.runId)?.attempts.length ?? 0) + 1}`; }
  function requireRun(projectId: string, runId: string): PersistedRun { const run = readStored(projectId, runId); if (!run) throw new Error("Prediction Run does not exist."); return markStaleIfSourceChanged(run); }
  function list(projectId: string): PersistedRun[] { const directory = path.dirname(file(projectId, "prediction-run.placeholder")); if (!existsSync(directory)) return []; return readdirSync(directory).filter((entry) => /^prediction-run\.[\p{L}\p{N}._:-]+\.json$/u.test(entry)).flatMap((entry) => readStored(projectId, entry.slice(0, -5)) ? [readStored(projectId, entry.slice(0, -5))!] : []).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.runId.localeCompare(left.runId)); }
}
function safeRunId(value: string): string { if (!/^prediction-run\.[\p{L}\p{N}._:-]+$/u.test(value)) throw new Error("Prediction Run identifier is invalid."); return value; }
function boundedTimeout(value: number): number { if (!Number.isSafeInteger(value) || value < 10 || value > 60_000) throw new Error("Prediction execution timeout is invalid."); return value; }
function activeKey(projectId: string, runId: string): string { return `${projectId}\u0000${runId}`; }
function safeStopReason(value: string | undefined): string { const reason = value?.trim(); return reason && [...reason].length <= 160 ? reason : "作者停止了本次 Agent Attempt。"; }
function safeFailureReason(cause: unknown): string { return cause instanceof Error && /schema|tool|candidate|prediction/iu.test(cause.message) ? cause.message.slice(0, 240) : "Agent attempt failed inside the bounded prediction runtime."; }
async function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortFailure();
  let listener: (() => void) | null = null;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { listener = () => reject(abortFailure()); signal.addEventListener("abort", listener, { once: true }); })]);
  } finally {
    if (listener) signal.removeEventListener("abort", listener);
  }
}
function abortFailure(): Error { const error = new Error("Prediction Agent attempt was aborted."); error.name = "AbortError"; return error; }
export type StoryStudioMultiNodePredictionOperations = ReturnType<typeof createStoryStudioMultiNodePredictionOperations>;
