import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
export type NuwaN1KnownFact = { factId: string; summary: string; sourceRef: NuwaN1StableRef; visibility: "experienced" | "heard" | "public" };
export type NuwaN1Belief = { beliefId: string; summary: string; stance: "believed" | "suspected" | "misunderstood" };
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
  beliefs: NuwaN1Belief[];
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
  usage?: { inputTokens: number | null; outputTokens: number | null };
};
export interface NuwaN1ExecutionAdapter {
  readonly adapterId: string;
  request(input: NuwaN1Context): Promise<NuwaN1ToolRequest>;
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
  usage: { inputTokens: number | null; outputTokens: number | null };
  committedAt: string;
};
export type NuwaN1Receipt = { operationId: string; kind: "create" | "start" | "step" | "pause" | "resume" | "cancel" | "cue" | "handoff"; revision: number; recordedAt: string };
export type NuwaN1Run = {
  version: typeof NUWA_N1_RUNTIME_VERSION;
  runId: string;
  sourceSnapshotHash: string;
  scene: NuwaN1Scene;
  authorGoal: string;
  actors: NuwaN1Actor[];
  lifecycle: NuwaN1Lifecycle;
  revision: number;
  dispatches: number;
  steps: NuwaN1Step[];
  pendingCue: { operationId: string; instruction: string } | null;
  blocker: string | null;
  receipts: NuwaN1Receipt[];
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
  candidates: Array<{ candidateId: string; title: string; summary: string; sourceStepId: string; affectedCharacterIds: string[]; observedResult: string }>;
  formalWrites: 0;
};

export function createNuwaN1Run(input: { workspacePath: string; runId: string; sourceSnapshotHash: string; scene: NuwaN1Scene; authorGoal: string; actors: NuwaN1Actor[]; operationId: string; now?: string }): NuwaN1Run {
  assertRunPack(input.workspacePath, input.runId, input.sourceSnapshotHash);
  assertSetup(input);
  const target = statePath(input.workspacePath, input.runId);
  if (existsSync(target)) {
    const current = readNuwaN1Run(input.workspacePath, input.runId);
    if (current && current.receipts.some((receipt) => receipt.operationId === input.operationId)) return current;
    throw new Error("Nuwa N1 Run already exists for this RunPack.");
  }
  const now = input.now || new Date().toISOString();
  const run: NuwaN1Run = {
    version: NUWA_N1_RUNTIME_VERSION, runId: safeId(input.runId), sourceSnapshotHash: checkedHash(input.sourceSnapshotHash), scene: cloneScene(input.scene), authorGoal: text(input.authorGoal, "authorGoal", 1_000), actors: input.actors.map(normalizeActor), lifecycle: "ready", revision: 1, dispatches: 0, steps: [], pendingCue: null, blocker: null,
    receipts: [{ operationId: safeOperation(input.operationId), kind: "create", revision: 1, recordedAt: now }], createdAt: now, updatedAt: now
  };
  writeAtomically(target, run);
  return structuredClone(run);
}

export function readNuwaN1Run(workspacePath: string, runId: string): NuwaN1Run | null {
  const target = statePath(workspacePath, runId);
  if (!existsSync(target)) return null;
  if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error("Nuwa N1 state must be a regular RunPack file.");
  return normalizeRun(JSON.parse(readFileSync(target, "utf8")) as unknown);
}

export function startNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; now?: string }): NuwaN1Run {
  return transition(input, "start", (run) => {
    if (run.lifecycle !== "ready" && run.lifecycle !== "paused") throw new Error("Nuwa N1 Run must be ready or paused before start.");
    return { ...run, lifecycle: "running", blocker: null };
  });
}

export function pauseNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; reason?: string; now?: string }): NuwaN1Run {
  return transition(input, "pause", (run) => {
    if (run.lifecycle !== "running") throw new Error("Only a running Nuwa N1 Run can pause.");
    return { ...run, lifecycle: "paused", blocker: input.reason ? text(input.reason, "pause reason", 240) : null };
  });
}

export function resumeNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; now?: string }): NuwaN1Run {
  return transition(input, "resume", (run) => {
    if (run.lifecycle !== "paused") throw new Error("Only a paused Nuwa N1 Run can resume.");
    return { ...run, lifecycle: "running", blocker: null };
  });
}

export function cancelNuwaN1Run(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; reason?: string; now?: string }): NuwaN1Run {
  return transition(input, "cancel", (run) => {
    if (run.lifecycle === "cancelled") return run;
    if (run.lifecycle === "completed") throw new Error("A completed Nuwa N1 Run cannot be cancelled.");
    return { ...run, lifecycle: "cancelled", blocker: input.reason ? text(input.reason, "cancel reason", 240) : "作者停止了本次排演。" };
  });
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
  if (initial.receipts.some((receipt) => receipt.operationId === input.operationId)) return initial;
  if (initial.revision !== input.expectedRevision) throw new Error("Nuwa N1 revision conflict.");
  if (initial.lifecycle !== "running") throw new Error("Nuwa N1 Run is not running.");
  if (initial.steps.length >= NUWA_N1_MAX_COMMITTED_STEPS) return persist(input, initial, "step", { ...initial, lifecycle: "completed", blocker: null });
  if (initial.dispatches + 2 > NUWA_N1_MAX_DISPATCHES) return persist(input, initial, "step", { ...initial, lifecycle: "blocked", blocker: "模拟 dispatch 预算已用尽；请结束或新建一次排演。" });
  const actor = initial.actors[initial.steps.length % initial.actors.length]!;
  const context = compileNuwaN1Context(initial, actor, input.operationId);
  const request = await input.adapter.request(context);
  validateToolRequest(request, actor);
  const toolResult: NuwaN1ToolResult = { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: structuredClone(actor.character), context };
  const result = await input.adapter.continueAfterTool({ context, toolResult });
  validateActorResult(result, actor);
  // Re-read after every await.  A pause/cancel or another writer may have
  // completed while the adapter was running; cancellation always wins.
  const current = requireRun(input.workspacePath, input.runId);
  if (current.lifecycle === "cancelled") return current;
  if (current.revision !== initial.revision) throw new Error("Nuwa N1 revision changed while the adapter was running.");
  if (current.lifecycle !== "running") return current;
  const sequence = current.steps.length + 1;
  const step: NuwaN1Step = {
    stepId: `nuwa-n1-step.${stableHash({ runId: current.runId, sequence, operationId: input.operationId }).slice(0, 20)}`,
    operationId: safeOperation(input.operationId), sequence, actor: structuredClone(actor.character), intent: text(result.intent, "intent", 600), speech: result.speech == null ? null : text(result.speech, "speech", 1_200), action: { action: text(result.action.action, "action", 160), targetId: result.action.targetId == null ? null : stableObjectId(result.action.targetId) }, observableResult: text(result.observableResult, "observableResult", 1_200), toolRequestId: safeId(request.requestId), execution: { adapterId: text(input.adapter.adapterId, "adapterId", 160), attemptId: context.attemptId, contextVersion: context.version, tool: { name: "read_role_context", requestId: safeId(request.requestId), status: "completed" } }, contextHash: stableHash(context), usage: { inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null }, committedAt: input.now || new Date().toISOString()
  };
  const next: NuwaN1Run = { ...current, steps: [...current.steps, step], dispatches: current.dispatches + 2, pendingCue: null, lifecycle: sequence >= NUWA_N1_MAX_COMMITTED_STEPS ? "completed" : "running", blocker: null };
  return persist(input, current, "step", next);
}

export function compileNuwaN1Context(run: NuwaN1Run, actor: NuwaN1Actor, operationId: string): NuwaN1Context {
  const canonicalActor = run.actors.find((candidate) => sameRef(candidate.character, actor.character));
  if (!canonicalActor) throw new Error("Nuwa N1 actor is outside the frozen Run scope.");
  const dialogue = run.steps.flatMap((step) => step.speech && step.actor.id !== actor.character.id ? [{ speakerId: step.actor.id, text: step.speech, observedStep: step.sequence }] : []).slice(-4);
  return {
    version: "tianyan-nuwa-n1-role-context/v1", runId: run.runId, attemptId: safeOperation(operationId), step: run.steps.length + 1, actor: structuredClone(canonicalActor.character), scene: cloneScene(run.scene), localGoal: canonicalActor.localGoal, coreSummary: canonicalActor.coreSummary,
    knownFacts: canonicalActor.knownFacts.map((fact) => ({ factId: fact.factId, summary: fact.summary, sourceId: fact.sourceRef.id, sourceRevision: fact.sourceRef.revision, visibility: fact.visibility })), beliefs: structuredClone(canonicalActor.beliefs), unknownFactIds: [...canonicalActor.unknownFactIds], recentDialogue: dialogue, allowedActions: [...canonicalActor.allowedActions], remaining: { committedSteps: NUWA_N1_MAX_COMMITTED_STEPS - run.steps.length, dispatches: NUWA_N1_MAX_DISPATCHES - run.dispatches, inputTokenBudget: 4096, outputTokenBudget: 1024 }, authorCue: run.pendingCue?.instruction ?? null
  };
}

export function prepareNuwaN1CandidateHandoff(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; selectedStepIds: string[]; now?: string }): { run: NuwaN1Run; handoff: NuwaN1CandidateHandoff } {
  const current = requireRun(input.workspacePath, input.runId);
  if (current.receipts.some((receipt) => receipt.operationId === input.operationId)) return { run: current, handoff: buildHandoff(current, input.selectedStepIds) };
  if (current.revision !== input.expectedRevision) throw new Error("Nuwa N1 revision conflict.");
  if (!current.steps.length) throw new Error("Nuwa N1 Run has no selected result to hand off.");
  const handoff = buildHandoff(current, input.selectedStepIds);
  const run = persist(input, current, "handoff", current);
  return { run, handoff };
}

function buildHandoff(run: NuwaN1Run, selectedStepIds: string[]): NuwaN1CandidateHandoff {
  const selected = run.steps.filter((step) => selectedStepIds.includes(step.stepId));
  if (!selected.length || selected.length !== new Set(selectedStepIds).size) throw new Error("Nuwa N1 selected steps must belong to this Run.");
  return { version: "tianyan-nuwa-n1-candidate-handoff/v1", handoffId: `nuwa-n1-handoff.${stableHash({ runId: run.runId, selectedStepIds: selected.map((step) => step.stepId) }).slice(0, 20)}`, runId: run.runId, sourceSnapshotHash: run.sourceSnapshotHash, selectedStepIds: selected.map((step) => step.stepId), status: "candidate", candidates: selected.map((step) => ({ candidateId: `nuwa-n1-candidate.${step.stepId}`, title: `${run.actors.find((actor) => sameRef(actor.character, step.actor))?.displayName || "角色"}的场景行动`, summary: step.intent, sourceStepId: step.stepId, affectedCharacterIds: [step.actor.id], observedResult: step.observableResult })), formalWrites: 0 };
}

function transition(input: { workspacePath: string; runId: string; expectedRevision: number; operationId: string; now?: string }, kind: NuwaN1Receipt["kind"], mutate: (run: NuwaN1Run) => NuwaN1Run): NuwaN1Run {
  const current = requireRun(input.workspacePath, input.runId);
  if (current.receipts.some((receipt) => receipt.operationId === input.operationId)) return current;
  if (current.revision !== input.expectedRevision) throw new Error("Nuwa N1 revision conflict.");
  return persist(input, current, kind, mutate(current));
}

function persist(input: { workspacePath: string; runId: string; operationId: string; now?: string }, current: NuwaN1Run, kind: NuwaN1Receipt["kind"], candidate: NuwaN1Run): NuwaN1Run {
  const latest = requireRun(input.workspacePath, input.runId);
  if (latest.receipts.some((receipt) => receipt.operationId === input.operationId)) return latest;
  if (latest.revision !== current.revision) throw new Error("Nuwa N1 revision conflict.");
  const recordedAt = input.now || new Date().toISOString();
  const next: NuwaN1Run = { ...candidate, revision: current.revision + 1, updatedAt: recordedAt, receipts: [...current.receipts, { operationId: safeOperation(input.operationId), kind, revision: current.revision + 1, recordedAt }].slice(-96) };
  writeAtomically(statePath(input.workspacePath, input.runId), next);
  return structuredClone(next);
}

function normalizeRun(value: unknown): NuwaN1Run {
  if (!value || typeof value !== "object") throw new Error("Nuwa N1 state is invalid.");
  const run = value as NuwaN1Run;
  if (run.version !== NUWA_N1_RUNTIME_VERSION || !safeId(run.runId) || !Number.isSafeInteger(run.revision) || run.revision < 1) throw new Error("Nuwa N1 state version or identity is invalid.");
  if (!Array.isArray(run.actors) || run.actors.length < 2 || run.actors.length > 3 || !Array.isArray(run.steps) || run.steps.length > NUWA_N1_MAX_COMMITTED_STEPS || !Number.isSafeInteger(run.dispatches) || run.dispatches < 0 || run.dispatches > NUWA_N1_MAX_DISPATCHES) throw new Error("Nuwa N1 state bounds are invalid.");
  if (!["ready", "running", "paused", "completed", "cancelled", "blocked"].includes(run.lifecycle)) throw new Error("Nuwa N1 lifecycle is invalid.");
  return structuredClone(run);
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
  const beliefs = actor.beliefs.map((belief) => ({ beliefId: stableObjectId(belief.beliefId), summary: text(belief.summary, "belief", 800), stance: belief.stance }));
  if (!Array.isArray(actor.allowedActions) || !actor.allowedActions.length) throw new Error("Nuwa N1 actor must have allowed actions.");
  return { character, displayName: text(actor.displayName, "displayName", 160), coreSummary: text(actor.coreSummary, "coreSummary", 1_000), localGoal: text(actor.localGoal, "localGoal", 800), knownFacts, beliefs, unknownFactIds: actor.unknownFactIds.map(stableObjectId), allowedActions: actor.allowedActions.map((action) => text(action, "allowed action", 120)) };
}
function validateToolRequest(request: NuwaN1ToolRequest, actor: NuwaN1Actor): void {
  if (request.type !== "tool-request" || request.toolName !== "read_role_context" || !safeId(request.requestId) || !sameRef(request.actor, actor.character)) throw new Error("Nuwa N1 adapter requested an unsupported or cross-character tool.");
}
function validateActorResult(result: NuwaN1ActorResult, actor: NuwaN1Actor): void {
  if (result.type !== "actor-result" || !sameRef(result.actor, actor.character) || !actor.allowedActions.includes(result.action.action)) throw new Error("Nuwa N1 adapter result is outside the actor scope or allowed actions.");
  text(result.intent, "intent", 600); text(result.observableResult, "observableResult", 1_200); if (result.speech != null) text(result.speech, "speech", 1_200);
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
function statePath(workspacePath: string, runId: string): string { return path.join(nuwaRunPath(workspacePath, runId), "nuwa-n1.json"); }
function writeAtomically(target: string, value: NuwaN1Run): void { mkdirSync(path.dirname(target), { recursive: true }); if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("Nuwa N1 state must not be a symbolic link."); const temporary = `${target}.tmp`; if (existsSync(temporary) && lstatSync(temporary).isSymbolicLink()) throw new Error("Nuwa N1 temporary state must not be a symbolic link."); writeFileSync(temporary, `${stableJson(value)}\n`, "utf8"); renameSync(temporary, target); }
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
