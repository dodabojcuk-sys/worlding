import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { nuwaRunPath } from "./nuwaRunPack.ts";
import { stableHash, stableJson } from "./storySnapshotBuilder.ts";

/**
 * N1 is deliberately a run-local rehearsal ledger.  It extends an existing
 * Nuwa RunPack and returns candidate handoff data; it never becomes an Event,
 * Canon, WorldState, or character-memory owner.
 */
export const NUWA_N1_RUNTIME_VERSION = "tianyan-nuwa-n1-runtime/v1" as const;
export const NUWA_N1_MAX_COMMITTED_STEPS = 6;
export const NUWA_N1_MAX_DISPATCHES = 12;

export type NuwaN1StableRef = { id: string; revision: string };
export type NuwaN1Lifecycle = "ready" | "running" | "paused" | "completed" | "cancelled" | "blocked";
export type NuwaN1KnownFact = { factId: string; summary: string; sourceRef: NuwaN1StableRef; visibility: "experienced" | "witnessed" | "informed" | "heard" | "public" };
/** A belief remains role-local, but its evidence provenance must stay visible
 * so that a suspicion is never silently upgraded to a shared story fact. */
export type NuwaN1Belief = { beliefId: string; summary: string; stance: "believed" | "suspected" | "misunderstood"; sourceRef: NuwaN1StableRef };
export type NuwaN1Actor = {
  character: NuwaN1StableRef;
  displayName: string;
  coreSummary: string;
  localGoal: string;
  knownFacts: NuwaN1KnownFact[];
  beliefs: NuwaN1Belief[];
  unknownFactIds: string[];
  allowedActions: string[];
};
export type NuwaN1Scene = { storyUnit: NuwaN1StableRef; sceneRef: NuwaN1StableRef; observedAt: string; label: string };
export type NuwaN1Context = {
  version: "tianyan-nuwa-n1-role-context/v1";
  runId: string;
  attemptId: string;
  step: number;
  actor: NuwaN1StableRef;
  scene: NuwaN1Scene;
  localGoal: string;
  coreSummary: string;
  knownFacts: Array<{ factId: string; summary: string; sourceId: string; sourceRevision: string; visibility: NuwaN1KnownFact["visibility"] }>;
  beliefs: Array<NuwaN1Belief & { sourceId: string; sourceRevision: string }>;
  unknownFactIds: string[];
  recentDialogue: Array<{ speakerId: string; text: string; observedStep: number }>;
  allowedActions: string[];
  remaining: { committedSteps: number; dispatches: number; inputTokenBudget: 4096; outputTokenBudget: 1024 };
  authorCue: string | null;
};
export type NuwaN1ToolRequest = { type: "tool-request"; toolName: "read_role_context"; requestId: string; actor: NuwaN1StableRef };
export type NuwaN1ToolResult = { type: "tool-result"; toolName: "read_role_context"; requestId: string; actor: NuwaN1StableRef; context: NuwaN1Context };
export type NuwaN1ActorResult = {
  type: "actor-result";
  actor: NuwaN1StableRef;
  intent: string;
  speech: string | null;
  action: { action: string; targetId: string | null };
  observableResult: string;
  /** Explicit delivery contract.  Text is never parsed to infer who heard it. */
  heardByActorIds?: string[];
  usage?: { inputTokens: number | null; outputTokens: number | null };
};
export type NuwaN1Usage = { inputTokens: number; outputTokens: number; source: "reported" | "estimated" };
export interface NuwaN1ExecutionAdapter {
  readonly adapterId: string;
  request(input: NuwaN1Context): Promise<NuwaN1ToolRequest>;
  /** The runtime owns scope validation; the adapter owns actual tool execution. */
  executeTool(input: { context: NuwaN1Context; request: NuwaN1ToolRequest }): Promise<NuwaN1ToolResult>;
  continueAfterTool(input: { context: NuwaN1Context; toolResult: NuwaN1ToolResult }): Promise<NuwaN1ActorResult>;
}
export type NuwaN1Step = {
  stepId: string;
  operationId: string;
  sequence: number;
  actor: NuwaN1StableRef;
  intent: string;
  speech: string | null;
  action: { action: string; targetId: string | null };
  observableResult: string;
  toolRequestId: string;
  execution: {
    adapterId: string;
    attemptId: string;
    contextVersion: NuwaN1Context["version"];
    tool: { name: "read_role_context"; requestId: string; status: "completed" };
  };
  contextHash: string;
  usage: NuwaN1Usage;
  heardByActorIds: string[];
  /** The exact, scoped evidence references provided to this completed turn. */
  contextEvidenceRefs: Array<{ kind: "knowledge" | "belief"; id: string; summary: string; sourceId: string; sourceRevision: string; visibility: string }>;
  /** Durable statement deliveries; a heard statement is not a world fact. */
  heardStatements: Array<{ recipientId: string; speakerId: string; statement: string; sourceStepId: string; sourceRevision: string }>;
  committedAt: string;
};
export type NuwaN1Receipt = { operationId: string; kind: "create" | "start" | "step" | "pause" | "resume" | "cancel" | "cue" | "handoff"; revision: number; recordedAt: string; payloadHash?: string };
export type NuwaN1ProviderDispatchStatus = "reserved" | "dispatched" | "completed" | "failed" | "cancelled" | "unknown";
export type NuwaN1Attempt = {
  operationId: string;
  attemptId: string;
  adapterId: string;
  actor: NuwaN1StableRef;
  contextHash: string;
  requestId: string | null;
  dispatches: Array<{
    phase: "request" | "continue-after-tool" | "provider";
    status: "dispatched" | "completed" | "failed" | "cancelled" | "reserved" | "unknown";
    recordedAt: string;
    detail: string | null;
    /** Provider entries bind the N1 projection to the Gateway's existing
     * reservation and replay-safe receipt identities. */
    providerCall?: number;
    requestKey?: string;
    reservationId?: string | null;
    receiptEnvelopeId?: string | null;
    provider?: { providerId: string; profileId: string; modelId: string };
  }>;
  tool: { status: "pending" | "completed" | "failed" | "cancelled"; recordedAt: string; detail: string | null };
  usage: NuwaN1Usage | null;
  outcome: "pending" | "committed" | "failed" | "cancelled" | "blocked";
  recordedAt: string;
  updatedAt: string;
};
export type NuwaN1Run = {
  version: typeof NUWA_N1_RUNTIME_VERSION;
  runId: string;
  sourceSnapshotHash: string;
  /** Frozen at author create time; execution must not re-read the current root. */
  sourceIdentity: { kind: "root" | "unversioned-draft"; workVersionId: string; revision: string } | null;
  scene: NuwaN1Scene;
  authorGoal: string;
  actors: NuwaN1Actor[];
  lifecycle: NuwaN1Lifecycle;
  revision: number;
  /** Actual model-boundary sends.  This is deliberately separate from the
   * local tool-round-trip bookkeeping in `dispatches`. */
  providerDispatches: number;
  /** Older RunPacks may have no model-boundary history at all.  Such a Run
   * remains readable, but cannot silently resume with a fresh budget. */
  providerDispatchEvidence: "complete" | "unknown";
  dispatches: number;
  steps: NuwaN1Step[];
  pendingCue: { operationId: string; instruction: string } | null;
  blocker: string | null;
  receipts: NuwaN1Receipt[];
  /** Dispatch and tool receipts are durable even when no scene step commits. */
  attempts: NuwaN1Attempt[];
  createdAt: string;
  updatedAt: string;
};
export type NuwaN1CandidateHandoff = {
  version: "tianyan-nuwa-n1-candidate-handoff/v1";
  handoffId: string;
  runId: string;
  sourceSnapshotHash: string;
  selectedStepIds: string[];
  status: "candidate";
  candidates: Array<{ candidateId: string; title: string; summary: string; speech: string | null; action: string; sourceStepId: string; affectedCharacterIds: string[]; observedResult: string }>;
  formalWrites: 0;
};

export function createNuwaN1Run(input: { workspacePath: string; runId: string; sourceSnapshotHash: string; sourceIdentity?: { kind: "root" | "unversioned-draft"; workVersionId: string; revision: string } | null; scene: NuwaN1Scene; authorGoal: string; actors: NuwaN1Actor[]; operationId: string; now?: string }): NuwaN1Run {
  assertRunPack(input.workspacePath, input.runId, input.sourceSnapshotHash);
  assertSetup(input);
  if (readNuwaN1Run(input.workspacePath, input.runId)) {
    const current = readNuwaN1Run(input.workspacePath, input.runId);
    if (current && current.receipts.some((receipt) => receipt.operationId === input.operationId)) return current;
    throw new Error("Nuwa N1 Run already exists for this RunPack.");
  }
  const now = input.now || new Date().toISOString();
  const run: NuwaN1Run = {
    version: NUWA_N1_RUNTIME_VERSION, runId: safeId(input.runId), sourceSnapshotHash: checkedHash(input.sourceSnapshotHash), sourceIdentity: normalizeSourceIdentity(input.sourceIdentity), scene: cloneScene(input.scene), authorGoal: text(input.authorGoal, "authorGoal", 1_000), actors: input.actors.map(normalizeActor), lifecycle: "ready", revision: 1, providerDispatches: 0, providerDispatchEvidence: "complete", dispatches: 0, steps: [], pendingCue: null, blocker: null,
    receipts: [{ operationId: safeOperation(input.operationId), kind: "create", revision: 1, recordedAt: now }], attempts: [], createdAt: now, updatedAt: now
  };
  writeAtomically(input.workspacePath, input.runId, run);
  return structuredClone(run);
}

export function readNuwaN1Run(workspacePath: string, runId: string): NuwaN1Run | null {
  const runFile = runPackFile(workspacePath, runId);
  if (!existsSync(runFile)) return null;
  if (lstatSync(runFile).isSymbolicLink() || !lstatSync(runFile).isFile()) throw new Error("Nuwa RunPack must be a regular file.");
  const pack = JSON.parse(readFileSync(runFile, "utf8")) as { nuwaN1?: unknown };
  if (pack.nuwaN1) return normalizeRun(pack.nuwaN1);
  // N1 v1 originally wrote a sibling file.  Read it only as a one-way
  // compatibility bridge; the next N1 write embeds it into run.json.
  const legacy = legacyStatePath(workspacePath, runId);
  if (!existsSync(legacy)) return null;
  if (lstatSync(legacy).isSymbolicLink() || !lstatSync(legacy).isFile()) throw new Error("Nuwa N1 legacy state must be a regular RunPack file.");
  return normalizeRun(JSON.parse(readFileSync(legacy, "utf8")) as unknown);
}

export function startNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; now?: string }): NuwaN1Run {
  return transition(input, "start", (run) => {
    if (run.lifecycle !== "ready" && run.lifecycle !== "paused") throw new Error("Nuwa N1 Run must be ready or paused before start.");
    return { ...run, lifecycle: "running", blocker: null };
  });
}

export function pauseNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; reason?: string; now?: string }): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  if (current.receipts.some((receipt) => receipt.operationId === input.operationId)) return current;
  if (current.revision !== input.expectedRevision && !current.attempts.some((attempt) => attempt.outcome === "pending")) throw new Error("Nuwa N1 revision conflict.");
  if (current.lifecycle !== "running") throw new Error("Only a running Nuwa N1 Run can pause.");
  return persist(input, current, "pause", { ...current, lifecycle: "paused", blocker: input.reason ? text(input.reason, "pause reason", 240) : null });
}

export function resumeNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; now?: string }): NuwaN1Run {
  return transition(input, "resume", (run) => {
    if (run.lifecycle !== "paused") throw new Error("Only a paused Nuwa N1 Run can resume.");
    return { ...run, lifecycle: "running", blocker: null };
  });
}

export function cancelNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; reason?: string; now?: string }): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  if (current.receipts.some((receipt) => receipt.operationId === input.operationId)) return current;
  // A caller can only know the revision before a live adapter dispatch.  The
  // durable attempt ledger makes that one narrow cancellation race explicit.
  if (current.revision !== input.expectedRevision && !current.attempts.some((attempt) => attempt.outcome === "pending")) throw new Error("Nuwa N1 revision conflict.");
  if (current.lifecycle === "cancelled") return current;
  if (current.lifecycle === "completed") throw new Error("A completed Nuwa N1 Run cannot be cancelled.");
  return persist(input, current, "cancel", { ...current, lifecycle: "cancelled", blocker: input.reason ? text(input.reason, "cancel reason", 240) : "作者停止了本次排演。" });
}

export function cueNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; instruction: string; now?: string }): NuwaN1Run {
  return transition(input, "cue", (run) => {
    if (!["ready", "running", "paused"].includes(run.lifecycle)) throw new Error("Author cue is only available before the Run ends.");
    return { ...run, pendingCue: { operationId: safeOperation(input.operationId), instruction: text(input.instruction, "cue", 800) } };
  });
}

/** Executes a real product-shaped tool round trip against a local/fake adapter. */
export async function advanceNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; adapter: NuwaN1ExecutionAdapter; now?: string }): Promise<NuwaN1Run> {
  const initial = requireRun(input.workspacePath, input.runId);
  if (initial.receipts.some((receipt) => receipt.operationId === input.operationId) || initial.attempts.some((attempt) => attempt.operationId === input.operationId)) return initial;
  if (initial.attempts.some((attempt) => attempt.outcome === "pending")) throw new Error("Nuwa N1 has a persisted pending attempt; recover or cancel it before starting another Provider operation.");
  if (initial.revision !== input.expectedRevision) throw new Error("Nuwa N1 revision conflict.");
  if (initial.lifecycle !== "running") throw new Error("Nuwa N1 Run is not running.");
  if (initial.providerDispatchEvidence === "unknown") return persist(input, initial, "step", {
    ...initial,
    lifecycle: "blocked",
    blocker: "这份历史 Run 缺少可恢复的模型发送记录；为避免把未知发送当作零并重新取得预算，已阻止继续执行。"
  });
  if (initial.steps.length >= NUWA_N1_MAX_COMMITTED_STEPS) return persist(input, initial, "step", { ...initial, lifecycle: "completed", blocker: null });
  if (initial.providerDispatches >= NUWA_N1_MAX_DISPATCHES) return persist(input, initial, "step", { ...initial, lifecycle: "blocked", blocker: "实际 Provider 发送预算已用尽；请结束或新建一次排演。" });
  const actor = initial.actors[initial.steps.length % initial.actors.length]!;
  const context = compileNuwaN1Context(initial, actor, input.operationId);
  const attemptId = safeOperation(input.operationId);
  const preflightInputTokens = Buffer.byteLength(stableJson(context), "utf8");
  if (preflightInputTokens > context.remaining.inputTokenBudget) {
    const recorded = recordedAt(input);
    return writeAttempt(input, initial, {
      ...initial,
      lifecycle: "blocked",
      blocker: "角色上下文的保守 Token 估算超过 N1 输入上限；未发送请求。",
      attempts: [...initial.attempts, {
        operationId: attemptId,
        attemptId,
        adapterId: text(input.adapter.adapterId, "adapterId", 160),
        actor: structuredClone(actor.character),
        contextHash: stableHash(context),
        requestId: null,
        dispatches: [],
        tool: { status: "cancelled", recordedAt: recorded, detail: "input budget blocked before dispatch" },
        usage: { inputTokens: preflightInputTokens, outputTokens: 0, source: "estimated" },
        outcome: "blocked",
        recordedAt: recorded,
        updatedAt: recorded
      }]
    });
  }
  let current = recordAttempt(input, initial, {
    operationId: safeOperation(input.operationId), attemptId, adapterId: text(input.adapter.adapterId, "adapterId", 160), actor: structuredClone(actor.character), contextHash: stableHash(context), requestId: null,
    dispatches: [{ phase: "request", status: "dispatched", recordedAt: recordedAt(input), detail: null }], tool: { status: "pending", recordedAt: recordedAt(input), detail: null }, usage: null, outcome: "pending", recordedAt: recordedAt(input), updatedAt: recordedAt(input)
  }, 1);
  let request: NuwaN1ToolRequest;
  try {
    request = await input.adapter.request(context);
    validateToolRequest(request, actor);
  } catch (error) {
    return finishAttempt(input, current, attemptId, "failed", `request failed: ${diagnostic(error)}`, { lifecycle: "blocked", blocker: "角色上下文工具请求失败；本次排演已阻塞。" });
  }
  current = afterAwait(input, current, attemptId);
  if (hasNewerAuthorCue(initial, current)) return preserveNewerAuthorCue(input, current, attemptId);
  if (current.lifecycle === "cancelled") return finishAttempt(input, current, attemptId, "cancelled", "cancelled after request dispatch");
  if (current.lifecycle !== "running") return finishAttempt(input, current, attemptId, "failed", `run is ${current.lifecycle} after request dispatch`);
  let toolResult: NuwaN1ToolResult;
  try {
    toolResult = await input.adapter.executeTool({ context, request });
    validateToolResult(toolResult, request, context, actor);
  } catch (error) {
    return finishAttempt(input, current, attemptId, "failed", `tool failed: ${diagnostic(error)}`, { lifecycle: "blocked", blocker: "角色上下文工具执行失败；本次排演已阻塞。" }, "tool");
  }
  current = afterAwait(input, current, attemptId);
  if (hasNewerAuthorCue(initial, current)) return preserveNewerAuthorCue(input, current, attemptId);
  if (current.lifecycle === "cancelled") return finishAttempt(input, current, attemptId, "cancelled", "cancelled after tool execution", undefined, "tool");
  if (current.lifecycle !== "running") return finishAttempt(input, current, attemptId, "failed", `run is ${current.lifecycle} after tool execution`, undefined, "tool");
  current = updateAttempt(input, current, attemptId, (attempt) => ({ ...attempt, requestId: safeId(request.requestId), tool: { status: "completed", recordedAt: recordedAt(input), detail: null }, dispatches: [...attempt.dispatches, { phase: "continue-after-tool", status: "dispatched", recordedAt: recordedAt(input), detail: null }], updatedAt: recordedAt(input) }), 1);
  let result: NuwaN1ActorResult;
  try {
    result = await input.adapter.continueAfterTool({ context, toolResult });
    validateActorResult(result, actor);
    validateUsage(result.usage);
  } catch (error) {
    current = afterAwait(input, current, attemptId);
    return finishAttempt(input, current, attemptId, current.lifecycle === "cancelled" ? "cancelled" : "failed", `continue-after-tool failed: ${diagnostic(error)}`, { lifecycle: "blocked", blocker: "角色回合执行失败；本次排演已阻塞。" });
  }
  current = afterAwait(input, current, attemptId);
  if (hasNewerAuthorCue(initial, current)) return preserveNewerAuthorCue(input, current, attemptId);
  if (current.lifecycle === "cancelled") return finishAttempt(input, current, attemptId, "cancelled", "cancelled after continue-after-tool dispatch");
  if (current.lifecycle !== "running") return finishAttempt(input, current, attemptId, "failed", `run is ${current.lifecycle} after continue-after-tool dispatch`);
  const usage = resolveUsage(context, result);
  if (usage.inputTokens > 4096 || usage.outputTokens > 1024) {
    return finishAttempt(input, current, attemptId, "blocked", "reported token usage exceeds N1 per-turn budget", { lifecycle: "blocked", blocker: "角色回合的精确 Token 用量超过 N1 上限；未提交场景步骤。" }, undefined, usage);
  }
  let sequence: number;
  let step: NuwaN1Step;
  try {
    sequence = current.steps.length + 1;
    const stepId = `nuwa-n1-step.${stableHash({ runId: current.runId, sequence, operationId: input.operationId }).slice(0, 20)}`;
    const speech = result.speech == null ? null : text(result.speech, "speech", 1_200);
    const heardByActorIds = normalizeHearers(result.heardByActorIds, actor.character.id, current.actors);
    if (heardByActorIds.length && !speech) throw new Error("Nuwa N1 statement delivery requires a completed spoken statement.");
    const sourceRevision = current.sourceIdentity?.revision ?? `run-r${current.revision}`;
    step = {
      stepId,
      operationId: safeOperation(input.operationId), sequence, actor: structuredClone(actor.character), intent: text(result.intent, "intent", 600), speech, action: { action: text(result.action.action, "action", 160), targetId: result.action.targetId == null ? null : stableObjectId(result.action.targetId) }, observableResult: text(result.observableResult, "observableResult", 1_200), heardByActorIds,
      contextEvidenceRefs: contextEvidenceRefs(context),
      heardStatements: heardByActorIds.map((recipientId) => ({ recipientId, speakerId: actor.character.id, statement: speech!, sourceStepId: stepId, sourceRevision })),
      toolRequestId: safeId(request.requestId), execution: { adapterId: text(input.adapter.adapterId, "adapterId", 160), attemptId, contextVersion: context.version, tool: { name: "read_role_context", requestId: safeId(request.requestId), status: "completed" } }, contextHash: stableHash(context), usage, committedAt: input.now || new Date().toISOString()
    };
  } catch (error) {
    return finishAttempt(input, current, attemptId, "failed", `actor result rejected: ${diagnostic(error)}`, { lifecycle: "blocked", blocker: "角色回合结果不符合 N1 边界；未提交场景步骤。" }, undefined, usage);
  }
  const next: NuwaN1Run = { ...current, steps: [...current.steps, step], pendingCue: null, lifecycle: sequence >= NUWA_N1_MAX_COMMITTED_STEPS ? "completed" : "running", blocker: null, attempts: current.attempts.map((attempt) => attempt.operationId === attemptId ? { ...attempt, requestId: safeId(request.requestId), tool: { status: "completed", recordedAt: recordedAt(input), detail: null }, usage, outcome: "committed", dispatches: attempt.dispatches.map((dispatch) => dispatch.phase === "provider" ? dispatch : { ...dispatch, status: "completed" }), updatedAt: recordedAt(input) } : attempt) };
  return persist(input, current, "step", next);
}

export function compileNuwaN1Context(run: NuwaN1Run, actor: NuwaN1Actor, operationId: string): NuwaN1Context {
  const canonicalActor = run.actors.find((candidate) => sameRef(candidate.character, actor.character));
  if (!canonicalActor) throw new Error("Nuwa N1 actor is outside the frozen Run scope.");
  const dialogue = run.steps.flatMap((step) => step.speech && (step.actor.id === actor.character.id || step.heardByActorIds.includes(actor.character.id)) ? [{ speakerId: step.actor.id, text: step.speech, observedStep: step.sequence }] : []).slice(-4);
  return {
    version: "tianyan-nuwa-n1-role-context/v1", runId: run.runId, attemptId: safeOperation(operationId), step: run.steps.length + 1, actor: structuredClone(canonicalActor.character), scene: cloneScene(run.scene), localGoal: canonicalActor.localGoal, coreSummary: canonicalActor.coreSummary,
    knownFacts: [...canonicalActor.knownFacts.map((fact) => ({ factId: fact.factId, summary: fact.summary, sourceId: fact.sourceRef.id, sourceRevision: fact.sourceRef.revision, visibility: fact.visibility })), ...heardStatements(run, actor.character.id)], beliefs: canonicalActor.beliefs.map((belief) => ({ ...structuredClone(belief), sourceId: belief.sourceRef.id, sourceRevision: belief.sourceRef.revision })), unknownFactIds: [...canonicalActor.unknownFactIds], recentDialogue: dialogue, allowedActions: [...canonicalActor.allowedActions], remaining: { committedSteps: NUWA_N1_MAX_COMMITTED_STEPS - run.steps.length, dispatches: NUWA_N1_MAX_DISPATCHES - run.providerDispatches, inputTokenBudget: 4096, outputTokenBudget: 1024 }, authorCue: run.pendingCue?.instruction ?? null
  };
}

/** Called by the Pi bridge immediately before every model-boundary send. */
export function recordNuwaN1ProviderReservation(input: { workspacePath: string; runId: string; operationId: string; providerCall: number; requestKey: string; reservationId: string | null; receiptEnvelopeId: string | null; provider: { providerId: string; profileId: string; modelId: string }; now?: string }): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  const attemptId = safeOperation(input.operationId);
  if (current.lifecycle !== "running") throw new Error("Nuwa N1 Run is no longer running before Provider dispatch.");
  if (current.providerDispatches >= NUWA_N1_MAX_DISPATCHES) throw new Error("Nuwa N1 actual Provider dispatch budget is exhausted before transport.");
  if (!Number.isSafeInteger(input.providerCall) || input.providerCall < 1 || input.providerCall > NUWA_N1_MAX_DISPATCHES) throw new Error("Nuwa N1 Provider dispatch ordinal is invalid.");
  const requestKey = safeRequestKey(input.requestKey);
  const found = current.attempts.find((attempt) => attempt.operationId === attemptId);
  const prior = found?.dispatches.find((dispatch) => dispatch.phase === "provider" && dispatch.requestKey === requestKey);
  if (prior) return current;
  return updateAttempt(input, current, attemptId, (attempt) => ({
    ...attempt,
    dispatches: [...attempt.dispatches, {
      phase: "provider", status: "reserved", recordedAt: recordedAt(input), detail: null,
      providerCall: input.providerCall, requestKey,
      reservationId: input.reservationId == null ? null : safeId(input.reservationId),
      receiptEnvelopeId: input.receiptEnvelopeId == null ? null : safeId(input.receiptEnvelopeId),
      provider: normalizeProviderIdentity(input.provider)
    }],
    updatedAt: recordedAt(input)
  }));
}

/** The Gateway calls this only after its transport has accepted the request.
 * A reservation alone deliberately does not consume N1's actual-send count. */
export function recordNuwaN1ProviderDispatch(input: { workspacePath: string; runId: string; operationId: string; requestKey: string; now?: string }): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  const attemptId = safeOperation(input.operationId);
  if (current.lifecycle !== "running") throw new Error("Nuwa N1 Run is no longer running before Provider dispatch.");
  if (current.providerDispatches >= NUWA_N1_MAX_DISPATCHES) throw new Error("Nuwa N1 actual Provider dispatch budget is exhausted.");
  const requestKey = safeRequestKey(input.requestKey);
  const attempt = current.attempts.find((candidate) => candidate.operationId === attemptId);
  const dispatch = attempt?.dispatches.find((candidate) => candidate.phase === "provider" && candidate.requestKey === requestKey);
  if (!dispatch) throw new Error("Nuwa N1 Provider dispatch has no matching Gateway reservation.");
  if (dispatch.status !== "reserved") return current;
  return updateAttempt(input, current, attemptId, (candidate) => ({
    ...candidate,
    dispatches: candidate.dispatches.map((item) => item.phase === "provider" && item.requestKey === requestKey
      ? { ...item, status: "dispatched", recordedAt: recordedAt(input) }
      : item),
    updatedAt: recordedAt(input)
  }), 0, 1);
}

/** Gateway stream completion is per request, so a later failed tool turn
 * cannot rewrite an earlier successful request in the same actor attempt. */
export function resolveNuwaN1ProviderDispatch(input: { workspacePath: string; runId: string; operationId: string; requestKey: string; status: Exclude<NuwaN1ProviderDispatchStatus, "reserved" | "dispatched">; detail?: string | null; now?: string }): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  const attemptId = safeOperation(input.operationId);
  const requestKey = safeRequestKey(input.requestKey);
  const allowed = new Set(["completed", "failed", "cancelled", "unknown"]);
  if (!allowed.has(input.status)) throw new Error("Nuwa N1 Provider terminal status is invalid.");
  const attempt = current.attempts.find((candidate) => candidate.operationId === attemptId);
  const dispatch = attempt?.dispatches.find((candidate) => candidate.phase === "provider" && candidate.requestKey === requestKey);
  if (!dispatch) throw new Error("Nuwa N1 Provider result has no matching Gateway reservation.");
  if (["completed", "failed", "cancelled", "unknown"].includes(dispatch.status)) return current;
  return updateAttempt(input, current, attemptId, (candidate) => ({
    ...candidate,
    dispatches: candidate.dispatches.map((item) => item.phase === "provider" && item.requestKey === requestKey
      ? { ...item, status: input.status, detail: input.detail == null ? item.detail : text(input.detail, "Provider diagnostic", 240), recordedAt: recordedAt(input) }
      : item),
    updatedAt: recordedAt(input)
  }));
}

export function prepareNuwaN1CandidateHandoff(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; selectedStepIds: string[]; now?: string }): { run: NuwaN1Run; handoff: NuwaN1CandidateHandoff } {
  const current = requireRun(input.workspacePath, input.runId);
  const handoff = buildHandoff(current, input.selectedStepIds);
  const payloadHash = stableHash({ selectedStepIds: handoff.selectedStepIds });
  const prior = current.receipts.find((receipt) => receipt.operationId === input.operationId);
  if (prior) {
    if (prior.kind !== "handoff" || prior.payloadHash !== payloadHash) throw new Error("Nuwa N1 operation payload does not match its recorded handoff.");
    return { run: current, handoff };
  }
  if (current.revision !== input.expectedRevision) throw new Error("Nuwa N1 revision conflict.");
  if (!current.steps.length) throw new Error("Nuwa N1 Run has no selected result to hand off.");
  const run = persist({ ...input, payloadHash }, current, "handoff", current);
  return { run, handoff };
}

function buildHandoff(run: NuwaN1Run, selectedStepIds: string[]): NuwaN1CandidateHandoff {
  const selected = run.steps.filter((step) => selectedStepIds.includes(step.stepId));
  if (!selected.length || selected.length !== new Set(selectedStepIds).size) throw new Error("Nuwa N1 selected steps must belong to this Run.");
  return { version: "tianyan-nuwa-n1-candidate-handoff/v1", handoffId: `nuwa-n1-handoff.${stableHash({ runId: run.runId, selectedStepIds: selected.map((step) => step.stepId) }).slice(0, 20)}`, runId: run.runId, sourceSnapshotHash: run.sourceSnapshotHash, selectedStepIds: selected.map((step) => step.stepId), status: "candidate", candidates: selected.map((step) => ({ candidateId: `nuwa-n1-candidate.${step.stepId}`, title: `${run.actors.find((actor) => sameRef(actor.character, step.actor))?.displayName || "角色"}的场景行动`, summary: step.intent, speech: step.speech, action: step.action.action, sourceStepId: step.stepId, affectedCharacterIds: [step.actor.id], observedResult: step.observableResult })), formalWrites: 0 };
}

function transition(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; now?: string }, kind: NuwaN1Receipt["kind"], mutate: (run: NuwaN1Run) => NuwaN1Run): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  if (current.receipts.some((receipt) => receipt.operationId === input.operationId)) return current;
  if (current.revision !== input.expectedRevision) throw new Error("Nuwa N1 revision conflict.");
  return persist(input, current, kind, mutate(current));
}

function persist(input: { workspacePath: string; runId: string; operationId: string; now?: string; payloadHash?: string }, current: NuwaN1Run, kind: NuwaN1Receipt["kind"], candidate: NuwaN1Run): NuwaN1Run {
  const latest = requireRun(input.workspacePath, input.runId);
  if (latest.receipts.some((receipt) => receipt.operationId === input.operationId)) return latest;
  if (latest.revision !== current.revision) throw new Error("Nuwa N1 revision conflict.");
  const recordedAt = input.now || new Date().toISOString();
  const next: NuwaN1Run = { ...candidate, revision: current.revision + 1, updatedAt: recordedAt, receipts: [...current.receipts, { operationId: safeOperation(input.operationId), kind, revision: current.revision + 1, recordedAt, ...(input.payloadHash ? { payloadHash: checkedHash(input.payloadHash) } : {}) }].slice(-96) };
  writeAtomically(input.workspacePath, input.runId, next);
  return structuredClone(next);
}

function recordAttempt(input: { workspacePath: string; runId: string; now?: string }, current: NuwaN1Run, attempt: NuwaN1Attempt, dispatchIncrement: number): NuwaN1Run {
  if (current.attempts.some((candidate) => candidate.operationId === attempt.operationId)) return current;
  return writeAttempt(input, current, { ...current, attempts: [...current.attempts, attempt], dispatches: current.dispatches + dispatchIncrement });
}

function updateAttempt(input: { workspacePath: string; runId: string; now?: string }, current: NuwaN1Run, operationId: string, mutate: (attempt: NuwaN1Attempt) => NuwaN1Attempt, dispatchIncrement = 0, providerDispatchIncrement = 0): NuwaN1Run {
  const found = current.attempts.find((attempt) => attempt.operationId === operationId);
  if (!found) throw new Error("Nuwa N1 dispatch attempt is missing.");
  return writeAttempt(input, current, { ...current, attempts: current.attempts.map((attempt) => attempt.operationId === operationId ? mutate(attempt) : attempt), dispatches: current.dispatches + dispatchIncrement, providerDispatches: current.providerDispatches + providerDispatchIncrement });
}

function writeAttempt(input: { workspacePath: string; runId: string; now?: string }, current: NuwaN1Run, candidate: NuwaN1Run): NuwaN1Run {
  const latest = requireRun(input.workspacePath, input.runId);
  if (latest.revision !== current.revision) throw new Error("Nuwa N1 revision changed while the adapter was running.");
  const next = { ...candidate, revision: current.revision + 1, updatedAt: recordedAt(input) };
  writeAtomically(input.workspacePath, input.runId, next);
  return structuredClone(next);
}

function afterAwait(input: { workspacePath: string; runId: string }, before: NuwaN1Run, attemptId: string): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  if (!current.attempts.some((attempt) => attempt.operationId === attemptId)) throw new Error("Nuwa N1 dispatch attempt is missing after adapter await.");
  if (current.lifecycle !== "cancelled" && current.lifecycle !== "paused" && current.revision !== before.revision && !onlyOwnProviderDispatchesChanged(before, current, attemptId, { allowPendingCueChange: true })) throw new Error("Nuwa N1 revision changed while the adapter was running.");
  return current;
}

function onlyOwnProviderDispatchesChanged(before: NuwaN1Run, current: NuwaN1Run, attemptId: string, options: { allowPendingCueChange?: boolean } = {}): boolean {
  if (current.lifecycle !== before.lifecycle || current.steps.length !== before.steps.length || current.attempts.length !== before.attempts.length || current.providerDispatches < before.providerDispatches) return false;
  if (options.allowPendingCueChange && !onlyCueReceiptChanged(before, current)) return false;
  const topLevel = (run: NuwaN1Run) => ({ ...run, revision: 0, updatedAt: "", providerDispatches: 0, attempts: [], ...(options.allowPendingCueChange ? { pendingCue: null, receipts: [] } : {}) });
  if (stableJson(topLevel(before)) !== stableJson(topLevel(current))) return false;
  const previous = before.attempts.find((attempt) => attempt.operationId === attemptId);
  const next = current.attempts.find((attempt) => attempt.operationId === attemptId);
  if (!previous || !next || next.dispatches.length < previous.dispatches.length) return false;
  const comparableAttempt = (attempt: NuwaN1Attempt) => ({ ...attempt, dispatches: [], updatedAt: "" });
  if (stableJson(comparableAttempt(previous)) !== stableJson(comparableAttempt(next))) return false;
  const previousNonProvider = previous.dispatches.filter((dispatch) => dispatch.phase !== "provider");
  const nextNonProvider = next.dispatches.filter((dispatch) => dispatch.phase !== "provider");
  if (stableJson(previousNonProvider) !== stableJson(nextNonProvider)) return false;
  return current.attempts.every((attempt) => attempt.operationId === attemptId || stableJson(attempt) === stableJson(before.attempts.find((candidate) => candidate.operationId === attempt.operationId)));
}

function onlyCueReceiptChanged(before: NuwaN1Run, current: NuwaN1Run): boolean {
  if (current.receipts.length < before.receipts.length) return false;
  if (stableJson(current.receipts.slice(0, before.receipts.length)) !== stableJson(before.receipts)) return false;
  return current.receipts.slice(before.receipts.length).every((receipt) => receipt.kind === "cue");
}

function hasNewerAuthorCue(before: NuwaN1Run, current: NuwaN1Run): boolean {
  return stableJson(before.pendingCue) !== stableJson(current.pendingCue);
}

function preserveNewerAuthorCue(input: { workspacePath: string; runId: string; now?: string }, current: NuwaN1Run, attemptId: string): NuwaN1Run {
  return finishAttempt(
    input,
    current,
    attemptId,
    "blocked",
    "作者在本回合执行期间加入了新的提示；本回合不会冒称已使用该提示，提示将保留给下一步。"
  );
}

function finishAttempt(input: { workspacePath: string; runId: string; now?: string }, current: NuwaN1Run, attemptId: string, outcome: "failed" | "cancelled" | "blocked", detail: string, terminal?: Pick<NuwaN1Run, "lifecycle" | "blocker">, target: "dispatch" | "tool" = "dispatch", usage: NuwaN1Usage | null = null): NuwaN1Run {
  const updated = updateAttempt(input, current, attemptId, (attempt) => ({
    ...attempt,
    tool: target === "tool" ? { status: outcome === "cancelled" ? "cancelled" : "failed", recordedAt: recordedAt(input), detail } : attempt.tool,
    dispatches: target === "dispatch" ? attempt.dispatches.map((dispatch, index) => dispatch.phase === "provider" && dispatch.status === "reserved" ? { ...dispatch, status: "failed", detail, recordedAt: recordedAt(input) } : dispatch.phase === "provider" && dispatch.status === "dispatched" ? { ...dispatch, status: outcome === "cancelled" ? "cancelled" : "unknown", detail, recordedAt: recordedAt(input) } : index === attempt.dispatches.length - 1 && dispatch.status === "dispatched" ? { ...dispatch, status: outcome === "cancelled" ? "cancelled" : "failed", detail, recordedAt: recordedAt(input) } : dispatch) : attempt.dispatches,
    usage: usage ?? attempt.usage,
    outcome,
    updatedAt: recordedAt(input)
  }));
  if (updated.lifecycle === "cancelled" || !terminal) return updated;
  return applyAttemptTerminal(input, updated, terminal);
}

function applyAttemptTerminal(input: { workspacePath: string; runId: string; now?: string }, current: NuwaN1Run, terminal: Pick<NuwaN1Run, "lifecycle" | "blocker">): NuwaN1Run {
  return writeAttempt(input, current, { ...current, lifecycle: terminal.lifecycle, blocker: terminal.blocker });
}

function normalizeAttempt(value: NuwaN1Attempt): NuwaN1Attempt {
  if (!value || typeof value !== "object" || !safeOperation(value.operationId) || !safeOperation(value.attemptId) || !Array.isArray(value.dispatches)) throw new Error("Nuwa N1 attempt receipt is invalid.");
  return structuredClone(value);
}

function safeRequestKey(value: string): string {
  return text(value, "Provider request key", 240);
}

function normalizeProviderIdentity(value: { providerId: string; profileId: string; modelId: string }) {
  return {
    providerId: text(value?.providerId, "Provider identity", 160),
    profileId: text(value?.profileId, "Provider profile identity", 160),
    modelId: text(value?.modelId, "Provider model identity", 240)
  };
}

function validateToolResult(result: NuwaN1ToolResult, request: NuwaN1ToolRequest, context: NuwaN1Context, actor: NuwaN1Actor): void {
  if (result.type !== "tool-result" || result.toolName !== request.toolName || result.requestId !== request.requestId || !sameRef(result.actor, actor.character) || result.context.runId !== context.runId || result.context.attemptId !== context.attemptId || !sameRef(result.context.actor, actor.character) || stableHash(result.context) !== stableHash(context)) throw new Error("Nuwa N1 tool result is outside the requested role context.");
}

function validateUsage(usage: NuwaN1ActorResult["usage"]): void {
  for (const value of [usage?.inputTokens, usage?.outputTokens]) if (value != null && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Nuwa N1 reported token usage is invalid.");
}

function normalizeHearers(value: unknown, speakerId: string, actors: NuwaN1Actor[]): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 2) throw new Error("Nuwa N1 statement recipients are invalid.");
  const allowed = new Set(actors.map((actor) => actor.character.id));
  const ids = [...new Set(value.map((item) => stableObjectId(String(item))))];
  if (ids.some((id) => id === speakerId || !allowed.has(id))) throw new Error("Nuwa N1 statement recipient is outside the Run roster.");
  return ids;
}

function heardStatements(run: NuwaN1Run, actorId: string) {
  return run.steps
    .flatMap((step) => step.heardStatements ?? [])
    .filter((heard) => heard.recipientId === actorId)
    .map((heard) => ({ factId: `heard.${heard.sourceStepId}.${actorId}`, summary: `听到 ${heard.speakerId} 的说法：${heard.statement}`, sourceId: heard.sourceStepId, sourceRevision: heard.sourceRevision, visibility: "heard" as const }));
}

function contextEvidenceRefs(context: NuwaN1Context): NuwaN1Step["contextEvidenceRefs"] {
  return [
    ...context.knownFacts.map((fact) => ({ kind: "knowledge" as const, id: fact.factId, summary: fact.summary, sourceId: fact.sourceId, sourceRevision: fact.sourceRevision, visibility: fact.visibility })),
    ...context.beliefs.map((belief) => ({ kind: "belief" as const, id: belief.beliefId, summary: belief.summary, sourceId: belief.sourceId, sourceRevision: belief.sourceRevision, visibility: belief.stance }))
  ];
}

/** A provider may omit exact metering.  Byte length is an intentionally
 * conservative upper bound for UTF-8 tokenization and is persisted as such. */
function resolveUsage(context: NuwaN1Context, result: NuwaN1ActorResult): NuwaN1Usage {
  const reportedInput = result.usage?.inputTokens;
  const reportedOutput = result.usage?.outputTokens;
  const inputTokens = reportedInput ?? Buffer.byteLength(stableJson(context), "utf8");
  const outputTokens = reportedOutput ?? Buffer.byteLength(stableJson({ intent: result.intent, speech: result.speech, action: result.action, observableResult: result.observableResult }), "utf8");
  return { inputTokens, outputTokens, source: reportedInput != null && reportedOutput != null ? "reported" : "estimated" };
}

function diagnostic(error: unknown): string { return text(String(error instanceof Error ? error.message : error || "unknown adapter failure"), "adapter diagnostic", 240); }
function recordedAt(input: { now?: string }): string { return input.now || new Date().toISOString(); }

function normalizeRun(value: unknown): NuwaN1Run {
  if (!value || typeof value !== "object") throw new Error("Nuwa N1 state is invalid.");
  const run = value as NuwaN1Run;
  if (run.version !== NUWA_N1_RUNTIME_VERSION || !safeId(run.runId) || !Number.isSafeInteger(run.revision) || run.revision < 1) throw new Error("Nuwa N1 state version or identity is invalid.");
  if (!Array.isArray(run.actors) || run.actors.length < 2 || run.actors.length > 3 || !Array.isArray(run.steps) || run.steps.length > NUWA_N1_MAX_COMMITTED_STEPS || !Number.isSafeInteger(run.dispatches) || run.dispatches < 0 || run.dispatches > NUWA_N1_MAX_DISPATCHES) throw new Error("Nuwa N1 state bounds are invalid.");
  // v1 persisted local tool-round-trip dispatches only.  Keep old Runs
  // readable and explicitly report that no model-boundary send was recorded.
  if (run.providerDispatches == null) {
    run.providerDispatches = 0;
    run.providerDispatchEvidence = "unknown";
  }
  if (!Number.isSafeInteger(run.providerDispatches) || run.providerDispatches < 0 || run.providerDispatches > NUWA_N1_MAX_DISPATCHES) throw new Error("Nuwa N1 Provider dispatch bounds are invalid.");
  if (run.providerDispatchEvidence == null) run.providerDispatchEvidence = "complete";
  if (run.providerDispatchEvidence !== "complete" && run.providerDispatchEvidence !== "unknown") throw new Error("Nuwa N1 Provider dispatch evidence is invalid.");
  if (!["ready", "running", "paused", "completed", "cancelled", "blocked"].includes(run.lifecycle)) throw new Error("Nuwa N1 lifecycle is invalid.");
  if (!Array.isArray(run.attempts)) run.attempts = [];
  run.sourceIdentity = normalizeSourceIdentity(run.sourceIdentity);
  run.actors = run.actors.map(normalizeActor);
  run.steps = run.steps.map((step) => {
    const heardByActorIds = Array.isArray(step.heardByActorIds) ? step.heardByActorIds.map((id) => stableObjectId(id)) : [];
    const speech = step.speech == null ? null : text(step.speech, "speech", 1_200);
    const sourceRevision = run.sourceIdentity?.revision ?? `run-r${run.revision}`;
    const heardStatements = Array.isArray(step.heardStatements)
      ? step.heardStatements.map(normalizeHeardStatement)
      : speech ? heardByActorIds.map((recipientId) => ({ recipientId, speakerId: step.actor.id, statement: speech, sourceStepId: step.stepId, sourceRevision })) : [];
    const allowed = new Set(run.actors.map((actor) => actor.character.id));
    if (heardStatements.some((heard) => heard.speakerId !== step.actor.id || heard.sourceStepId !== step.stepId || heard.recipientId === step.actor.id || !allowed.has(heard.recipientId))) throw new Error("Nuwa N1 heard statement is outside its completed step or Run roster.");
    if (heardStatements.length !== heardByActorIds.length || heardStatements.some((heard) => !heardByActorIds.includes(heard.recipientId))) throw new Error("Nuwa N1 statement delivery ledger is inconsistent.");
    return { ...step, speech, heardByActorIds, heardStatements, contextEvidenceRefs: Array.isArray(step.contextEvidenceRefs) ? step.contextEvidenceRefs.map(normalizeContextEvidenceRef) : [] };
  });
  run.attempts = run.attempts.map(normalizeAttempt);
  return structuredClone(run);
}

function normalizeSourceIdentity(value: unknown): NuwaN1Run["sourceIdentity"] {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Nuwa N1 source identity is invalid.");
  const identity = value as Record<string, unknown>;
  if (identity.kind !== "root" && identity.kind !== "unversioned-draft") throw new Error("Nuwa N1 source identity kind is invalid.");
  return { kind: identity.kind, workVersionId: safeId(String(identity.workVersionId || "")), revision: text(String(identity.revision || ""), "sourceIdentity revision", 180) };
}

function assertSetup(input: { sourceSnapshotHash: string; scene: NuwaN1Scene; authorGoal: string; actors: NuwaN1Actor[] }): void {
  checkedHash(input.sourceSnapshotHash); cloneScene(input.scene); text(input.authorGoal, "authorGoal", 1_000);
  if (!Array.isArray(input.actors) || input.actors.length < 2 || input.actors.length > 3) throw new Error("Nuwa N1 requires two or three formal characters.");
  const ids = new Set(input.actors.map((actor) => actor.character.id));
  if (ids.size !== input.actors.length) throw new Error("Nuwa N1 character identity must use distinct stable IDs.");
  input.actors.forEach(normalizeActor);
}
function normalizeActor(actor: NuwaN1Actor): NuwaN1Actor {
  const character = cloneRef(actor.character);
  const knownFacts = actor.knownFacts.map((fact) => ({ factId: stableObjectId(fact.factId), summary: text(fact.summary, "known fact", 800), sourceRef: cloneRef(fact.sourceRef), visibility: fact.visibility }));
  const beliefs = actor.beliefs.map((belief) => ({ beliefId: stableObjectId(belief.beliefId), summary: text(belief.summary, "belief", 800), stance: belief.stance, sourceRef: cloneRef(belief.sourceRef) }));
  if (!Array.isArray(actor.allowedActions) || !actor.allowedActions.length) throw new Error("Nuwa N1 actor must have allowed actions.");
  return { character, displayName: text(actor.displayName, "displayName", 160), coreSummary: text(actor.coreSummary, "coreSummary", 1_000), localGoal: text(actor.localGoal, "localGoal", 800), knownFacts, beliefs, unknownFactIds: actor.unknownFactIds.map(stableObjectId), allowedActions: actor.allowedActions.map((action) => text(action, "allowed action", 120)) };
}
function validateToolRequest(request: NuwaN1ToolRequest, actor: NuwaN1Actor): void {
  if (request.type !== "tool-request" || request.toolName !== "read_role_context" || !safeId(request.requestId) || !sameRef(request.actor, actor.character)) throw new Error("Nuwa N1 adapter requested an unsupported or cross-character tool.");
}
function validateActorResult(result: NuwaN1ActorResult, actor: NuwaN1Actor): void {
  if (result.type !== "actor-result" || !sameRef(result.actor, actor.character) || !actor.allowedActions.includes(result.action.action)) throw new Error("Nuwa N1 adapter result is outside the actor scope or allowed actions.");
  text(result.intent, "intent", 600); text(result.observableResult, "observableResult", 1_200); if (result.speech != null) text(result.speech, "speech", 1_200);
  if (result.heardByActorIds != null && !Array.isArray(result.heardByActorIds)) throw new Error("Nuwa N1 statement recipients are invalid.");
}
function normalizeHeardStatement(value: unknown): NuwaN1Step["heardStatements"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Nuwa N1 heard statement is invalid.");
  const heard = value as Record<string, unknown>;
  return { recipientId: stableObjectId(String(heard.recipientId || "")), speakerId: stableObjectId(String(heard.speakerId || "")), statement: text(String(heard.statement || ""), "heard statement", 1_200), sourceStepId: safeId(String(heard.sourceStepId || "")), sourceRevision: text(String(heard.sourceRevision || ""), "heard source revision", 180) };
}
function normalizeContextEvidenceRef(value: unknown): NuwaN1Step["contextEvidenceRefs"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Nuwa N1 context evidence is invalid.");
  const ref = value as Record<string, unknown>;
  if (ref.kind !== "knowledge" && ref.kind !== "belief") throw new Error("Nuwa N1 context evidence kind is invalid.");
  return { kind: ref.kind, id: stableObjectId(String(ref.id || "")), summary: text(String(ref.summary || ""), "context evidence", 1_200), sourceId: stableObjectId(String(ref.sourceId || "")), sourceRevision: text(String(ref.sourceRevision || ""), "context source revision", 180), visibility: text(String(ref.visibility || ""), "context visibility", 80) };
}
function requireRun(workspacePath: string, runId: string): NuwaN1Run { const run = readNuwaN1Run(workspacePath, runId); if (!run) throw new Error("Nuwa N1 Run has not been created for this RunPack."); return run; }
function assertRunPack(workspacePath: string, runId: string, expectedSnapshotHash?: string): void {
  const runPath = nuwaRunPath(workspacePath, runId);
  if (!existsSync(path.join(runPath, "run.json")) || !existsSync(path.join(runPath, "snapshot.json"))) throw new Error("Nuwa N1 requires an existing Nuwa RunPack.");
  if (expectedSnapshotHash) {
    const snapshot = JSON.parse(readFileSync(path.join(runPath, "snapshot.json"), "utf8")) as { snapshotHash?: unknown };
    if (snapshot.snapshotHash !== expectedSnapshotHash) throw new Error("Nuwa N1 source snapshot does not match its existing RunPack.");
  }
}
function runPackFile(workspacePath: string, runId: string): string { return path.join(nuwaRunPath(workspacePath, runId), "run.json"); }
function legacyStatePath(workspacePath: string, runId: string): string { return path.join(nuwaRunPath(workspacePath, runId), "nuwa-n1.json"); }
/** N1's lifecycle ledger lives inside the existing RunPack.  Updating this
 * single file removes the former planned/run mismatch while preserving all
 * unrelated RunPack fields for the established owner. */
function writeAtomically(workspacePath: string, runId: string, value: NuwaN1Run): void {
  const target = runPackFile(workspacePath, runId);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error("Nuwa RunPack must be a regular file.");
  const pack = JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
  if (!pack || typeof pack !== "object") throw new Error("Nuwa RunPack is invalid.");
  const temporary = `${target}.tmp`;
  if (existsSync(temporary) && lstatSync(temporary).isSymbolicLink()) throw new Error("Nuwa N1 temporary state must not be a symbolic link.");
  writeFileSync(temporary, `${stableJson({ ...pack, status: value.lifecycle, nuwaN1: value })}\n`, "utf8");
  renameSync(temporary, target);
}
function cloneRef(ref: NuwaN1StableRef): NuwaN1StableRef { return { id: stableObjectId(ref.id), revision: checkedHash(ref.revision) }; }
function cloneScene(scene: NuwaN1Scene): NuwaN1Scene { return { storyUnit: cloneRef(scene.storyUnit), sceneRef: cloneRef(scene.sceneRef), observedAt: text(scene.observedAt, "observedAt", 80), label: text(scene.label, "scene label", 240) }; }
function sameRef(left: NuwaN1StableRef, right: NuwaN1StableRef): boolean { return left.id === right.id && left.revision === right.revision; }
function checkedHash(value: string): string { if (typeof value !== "string" || !/^[a-f0-9]{16,128}$/iu.test(value)) throw new Error("Nuwa N1 stable revision is invalid."); return value; }
function safeId(value: string): string { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,159}$/iu.test(value)) throw new Error("Nuwa N1 identity is invalid."); return value; }
function safeOperation(value: string): string { return safeId(value); }
/** Stable story object IDs are not filesystem names. They may be Chinese (or
 * another NFC Unicode identifier), but cannot contain traversal/separator or
 * invisible control whitespace that could be confused at a later boundary. */
function stableObjectId(value: string): string {
  if (typeof value !== "string") throw new Error("Nuwa N1 stable object identity is invalid.");
  const normalized = value.normalize("NFC");
  if (!normalized || normalized.length > 240 || normalized === "." || normalized === ".." || /[\\/\u0000-\u001f\u007f\s]/u.test(normalized)) throw new Error("Nuwa N1 stable object identity is invalid.");
  return normalized;
}
function text(value: string, label: string, maximum: number): string { if (typeof value !== "string" || !(value = value.trim()) || value.length > maximum) throw new Error(`Nuwa N1 ${label} is invalid.`); return value; }
