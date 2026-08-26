import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { nuwaRunPath } from "./nuwaRunPack.ts";
import { stableHash, stableJson } from "./storySnapshotBuilder.ts";

export const NUWA_BOUNDED_SCENARIO_VERSION = "tianyan-nuwa-bounded-scenario-r0/v1" as const;
export const NUWA_BOUNDED_SNAPSHOT_VERSION = "tianyan-bounded-story-snapshot-r0/v1" as const;

export type NuwaBoundedLifecycle = "draft" | "ready" | "running" | "paused" | "completed" | "cancelled" | "failed" | "superseded";
export type NuwaBoundedStepStatus = "accepted" | "rejected";
export type NuwaCandidateStatus = "candidate" | "sent-review" | "rejected" | "integrated";

export type BoundedKnowledgeClaim = {
  claimId: string;
  label: string;
  stance: "known" | "believed" | "suspected" | "misinformation" | "unknown";
  sourceAnchorIds: string[];
};

export type BoundedCharacterKnowledge = {
  characterId: string;
  displayName: string;
  claims: BoundedKnowledgeClaim[];
  explicitlyExcludedClaimIds: string[];
};

export type BoundedStorySnapshot = {
  version: typeof NUWA_BOUNDED_SNAPSHOT_VERSION;
  snapshotId: string;
  projectId: string;
  unitId: string;
  branchId: string;
  sourceRevision: string;
  eventRevision: string;
  characterProjectionRevision: string;
  narrativeRange: { start: number; end: number };
  worldTimeRange: { start: string | null; end: string | null; precision: "range" | "unknown" };
  confirmedEvents: Array<{ eventId: string; title: string; narrativeOrder: number; worldTime: string | null }>;
  participatingCharacters: Array<{ characterId: string; displayName: string; role: string }>;
  characterKnowledgeBoundaries: BoundedCharacterKnowledge[];
  worldFacts: Array<{ factId: string; statement: string; sourceAnchorIds: string[] }>;
  relationFacts: Array<{ relationId: string; statement: string; sourceAnchorIds: string[] }>;
  selectedSources: Array<{ sourceAnchorId: string; label: string; revision: string; available: boolean }>;
  authorGoal: string;
  authorQuestion: string;
  forbiddenChanges: string[];
  directorConstraints: string[];
  maximumSteps: number;
  maximumBranches: number;
  budgetClass: "fixture-zero-provider";
  createdAt: string;
  integrity: string;
};

export type NuwaBoundedConstraintCheck = {
  checkId: string;
  label: string;
  outcome: "pass" | "reject" | "warning";
  explanation: string;
};

export type NuwaBoundedStep = {
  stepId: string;
  runId: string;
  branchId: string;
  sequence: number;
  directorBeat: string;
  participatingCharacterIds: string[];
  dialogue: Array<{ characterId: string; text: string }>;
  actions: string[];
  observations: string[];
  knowledgeBefore: Record<string, string[]>;
  knowledgeAfter: Record<string, string[]>;
  stateBefore: string[];
  stateAfter: string[];
  proposedEvents: Array<{ candidateId: string; title: string; insertionAfterEventId: string; narrativeOrder: number; worldTime: string | null; changeKind: "add" | "delete" | "replace" }>;
  proposedRelations: string[];
  proposedCharacterStateChanges: string[];
  openQuestions: string[];
  sourceAnchors: string[];
  constraintChecks: NuwaBoundedConstraintCheck[];
  createdBy: "fixture-director" | "author-steering";
  status: NuwaBoundedStepStatus;
  receipt: { receiptId: string; operationId: string; integrity: string; createdAt: string };
};

export type NuwaBoundedBranch = {
  branchId: string;
  label: string;
  kind: "original" | "temporary";
  parentBranchId: string | null;
  forkPoint: number | null;
  status: NuwaBoundedLifecycle;
  steps: NuwaBoundedStep[];
  steering: Array<{ steeringId: string; fromStep: number; instruction: string; createdAt: string }>;
  supersedesResultId: string | null;
};

export type NuwaBoundedReceipt = {
  receiptId: string;
  operationId: string;
  kind: "create" | "freeze" | "start" | "step" | "pause" | "resume" | "cancel" | "fork" | "handoff" | "integrate" | "view";
  branchId: string | null;
  sequence: number | null;
  createdAt: string;
  integrity: string;
};

export type NuwaEventOverlay = {
  confirmedBaseline: BoundedStorySnapshot["confirmedEvents"];
  candidates: Array<{
    candidateId: string;
    sourceRunId: string;
    sourceBranchId: string;
    sourceStepId: string;
    title: string;
    insertionAfterEventId: string;
    narrativeOrder: number;
    worldTime: string | null;
    adjacency: string;
    causalStatus: "candidate-not-confirmed";
    changeKind: "add" | "delete" | "replace";
    affectedCharacters: string[];
    affectedState: string[];
    sourceAnchors: string[];
    receiptId: string;
    status: NuwaCandidateStatus;
  }>;
};

export type NuwaBranchComparison = {
  leftBranchId: string;
  rightBranchId: string;
  sharedPrefixStep: number;
  rows: Array<{ category: "event" | "character-action" | "knowledge" | "belief" | "world-state" | "relation" | "object" | "open-question" | "source" | "rule-conflict"; left: string; right: string; status: "confirmed-baseline" | "nuwa-rehearsal" | "temporary-branch" | "pending-review" | "rejected" }>;
  endings: { left: string; right: string };
};

export type NuwaCandidateHandoff = {
  handoffId: string;
  candidateId: string;
  sourceRunId: string;
  sourceBranchId: string;
  sourceStepId: string;
  status: NuwaCandidateStatus;
  baselineDiff: string[];
  affectedEvents: string[];
  affectedCharacters: string[];
  characterStateBefore: string[];
  characterStateAfter: string[];
  characterFateBefore: string[];
  characterFateAfter: string[];
  worldStateCandidates: string[];
  relationCandidates: string[];
  unresolvedConflicts: string[];
  recovery: { snapshotIntegrity: string; replayIntegrity: string; rollback: string };
  receiptId: string;
};

export type NuwaBoundedRun = {
  version: typeof NUWA_BOUNDED_SCENARIO_VERSION;
  runId: string;
  snapshot: BoundedStorySnapshot | null;
  lifecycle: NuwaBoundedLifecycle;
  stale: boolean;
  integrityStatus: "unfrozen" | "current" | "mismatch" | "missing-reference";
  activeBranchId: string;
  branches: NuwaBoundedBranch[];
  receipts: NuwaBoundedReceipt[];
  handoff: NuwaCandidateHandoff | null;
  viewState: { selectedStepId: string | null; compareBranchIds: [string, string] | null; activeTool: "observation" | "branch" | "compare" | "review" | "controls"; dockOpen: boolean };
  providerCalls: 0;
  pluginCalls: 0;
  createdAt: string;
  updatedAt: string;
};

export type NuwaBoundedProjection = NuwaBoundedRun & {
  activeBranch: NuwaBoundedBranch;
  selectedStep: NuwaBoundedStep | null;
  comparison: NuwaBranchComparison | null;
  overlay: NuwaEventOverlay | null;
  replay: { matches: boolean; stepsIntegrity: string; receiptIntegrity: string; providerCalls: 0 };
  canHandoff: boolean;
  submissionBlocker: string | null;
};

export interface NuwaScenarioRuntimePort {
  createRun(input: { runId: string; createdAt?: string }): NuwaBoundedRun;
  freezeSnapshot(run: NuwaBoundedRun, snapshot: BoundedStorySnapshot, operationId?: string): NuwaBoundedRun;
  startRun(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun;
  stepRun(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun;
  pauseRun(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun;
  resumeRun(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun;
  cancelRun(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun;
  forkFromStep(run: NuwaBoundedRun, input: { sourceBranchId: string; sequence: number; instruction: string; operationId?: string }): NuwaBoundedRun;
  replayRun(run: NuwaBoundedRun): NuwaBoundedProjection["replay"];
  compareBranches(run: NuwaBoundedRun, leftBranchId: string, rightBranchId: string): NuwaBranchComparison;
  prepareCandidateHandoff(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun;
  recoverRun(workspacePath: string, runId: string): NuwaBoundedRun | null;
  getRunProjection(run: NuwaBoundedRun): NuwaBoundedProjection;
}

export function createTideLetterBoundedSnapshot(input: { projectId: string; sourceRevision: string; createdAt?: string }): BoundedStorySnapshot {
  const base = {
    version: NUWA_BOUNDED_SNAPSHOT_VERSION,
    snapshotId: "snapshot.tide-letter-lighthouse-r0",
    projectId: input.projectId,
    unitId: "fixture.unit.tide-letter",
    branchId: "branch.main",
    sourceRevision: input.sourceRevision,
    eventRevision: "fixture-event-r0",
    characterProjectionRevision: "fixture-character-state-r0",
    narrativeRange: { start: 1, end: 4 },
    worldTimeRange: { start: null, end: null, precision: "unknown" as const },
    confirmedEvents: [
      { eventId: "fixture.event.letter", title: "沈砚收到匿名来信", narrativeOrder: 1, worldTime: null },
      { eventId: "fixture.event.key-transfer", title: "沈砚持有潮纹铜钥匙", narrativeOrder: 2, worldTime: null }
    ],
    participatingCharacters: [
      { characterId: "fixture.character.shen-yan", displayName: "沈砚", role: "持钥人" },
      { characterId: "fixture.character.a-wu", displayName: "阿芜", role: "灯塔同行者" }
    ],
    characterKnowledgeBoundaries: [
      { characterId: "fixture.character.shen-yan", displayName: "沈砚", claims: [
        { claimId: "claim.letter-warning", label: "匿名来信警告不要在无风夜进入灯塔", stance: "known" as const, sourceAnchorIds: ["source.anchor.tide-letter"] },
        { claimId: "claim.copper-key", label: "潮纹铜钥匙在自己手中", stance: "known" as const, sourceAnchorIds: ["source.anchor.key-transfer"] },
        { claimId: "claim.sender-identity", label: "寄信人身份", stance: "unknown" as const, sourceAnchorIds: [] }
      ], explicitlyExcludedClaimIds: ["claim.future-lighthouse-history", "claim.a-wu-private-memory"] },
      { characterId: "fixture.character.a-wu", displayName: "阿芜", claims: [
        { claimId: "claim.lighthouse-plan", label: "沈砚准备前往灯塔", stance: "known" as const, sourceAnchorIds: ["source.anchor.a-wu-observation"] },
        { claimId: "claim.old-name-fragment", label: "旧名曾在守夜记录中出现", stance: "suspected" as const, sourceAnchorIds: ["source.anchor.watch-ledger-fragment"] },
        { claimId: "claim.sender-identity", label: "寄信人身份", stance: "unknown" as const, sourceAnchorIds: [] }
      ], explicitlyExcludedClaimIds: ["claim.full-letter-warning", "claim.future-lighthouse-history", "claim.other-branch-ending"] }
    ],
    worldFacts: [
      { factId: "fact.letter-received", statement: "沈砚收到匿名来信", sourceAnchorIds: ["source.anchor.tide-letter"] },
      { factId: "fact.key-held", statement: "沈砚持有潮纹铜钥匙", sourceAnchorIds: ["source.anchor.key-transfer"] }
    ],
    relationFacts: [{ relationId: "fixture.relation.conditional-cooperation", statement: "沈砚与阿芜目前是有条件合作", sourceAnchorIds: ["source.anchor.a-wu-observation"] }],
    selectedSources: [
      { sourceAnchorId: "source.anchor.tide-letter", label: "匿名来信原文锚点", revision: input.sourceRevision, available: true },
      { sourceAnchorId: "source.anchor.key-transfer", label: "潮纹铜钥匙交接记录", revision: input.sourceRevision, available: true },
      { sourceAnchorId: "source.anchor.watch-ledger-fragment", label: "灯塔守夜记录残页", revision: input.sourceRevision, available: true },
      { sourceAnchorId: "source.anchor.a-wu-observation", label: "阿芜现场观察", revision: input.sourceRevision, available: true }
    ],
    authorGoal: "探索沈砚与阿芜进入灯塔前，旧名线索可能如何暴露。",
    authorQuestion: "旧名线索如何在不暴露寄信人身份的前提下自然出现？",
    forbiddenChanges: ["不确认寄信人身份", "不改变灯塔核心历史", "不让阿芜知道她尚未获知的信息", "不自动创建正式事件", "不自动改变关系真相"],
    directorConstraints: ["每个 Character Actor 只读取自己的知识切片", "心理说明不成为世界事实", "来源不足必须显示警告", "候选只进入 Review"],
    maximumSteps: 4,
    maximumBranches: 2,
    budgetClass: "fixture-zero-provider" as const,
    createdAt: input.createdAt || "2026-08-23T08:00:00.000Z"
  };
  return { ...base, integrity: stableHash(base) };
}

export function createNuwaScenarioRuntimePort(): NuwaScenarioRuntimePort {
  return {
    createRun: createNuwaBoundedRun,
    freezeSnapshot,
    startRun,
    stepRun,
    pauseRun,
    resumeRun,
    cancelRun,
    forkFromStep,
    replayRun,
    compareBranches,
    prepareCandidateHandoff,
    recoverRun: readNuwaBoundedRun,
    getRunProjection
  };
}

export function createNuwaBoundedRun(input: { runId: string; createdAt?: string }): NuwaBoundedRun {
  const runId = safeId(input.runId);
  const createdAt = input.createdAt || "2026-08-23T08:00:00.000Z";
  const run: NuwaBoundedRun = {
    version: NUWA_BOUNDED_SCENARIO_VERSION,
    runId,
    snapshot: null,
    lifecycle: "draft",
    stale: false,
    integrityStatus: "unfrozen",
    activeBranchId: "branch.original",
    branches: [{ branchId: "branch.original", label: "原始排演", kind: "original", parentBranchId: null, forkPoint: null, status: "draft", steps: [], steering: [], supersedesResultId: null }],
    receipts: [],
    handoff: null,
    viewState: { selectedStepId: null, compareBranchIds: null, activeTool: "observation", dockOpen: false },
    providerCalls: 0,
    pluginCalls: 0,
    createdAt,
    updatedAt: createdAt
  };
  return appendReceipt(run, "create", `create:${runId}`, null, null);
}

export function freezeSnapshot(run: NuwaBoundedRun, snapshot: BoundedStorySnapshot, operationId = `freeze:${snapshot.snapshotId}`): NuwaBoundedRun {
  const replay = findOperation(run, operationId);
  if (replay) return structuredClone(run);
  if (run.lifecycle !== "draft") throw new Error("Only a draft Nuwa Run can freeze its bounded snapshot.");
  const integrityStatus = validateBoundedSnapshot(snapshot);
  if (integrityStatus !== "current") throw new Error(`BoundedStorySnapshot failed closed: ${integrityStatus}.`);
  const next = structuredClone(run);
  next.snapshot = structuredClone(snapshot);
  next.lifecycle = "ready";
  next.integrityStatus = "current";
  next.branches[0]!.status = "ready";
  return appendReceipt(next, "freeze", operationId, "branch.original", null);
}

export function startRun(run: NuwaBoundedRun, operationId = `start:${run.runId}`): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  assertCurrent(run);
  if (run.lifecycle !== "ready") throw new Error("Nuwa Run must be ready before start.");
  const next = structuredClone(run);
  next.lifecycle = "running";
  activeBranch(next).status = "running";
  return appendReceipt(next, "start", operationId, next.activeBranchId, null);
}

export function stepRun(run: NuwaBoundedRun, operationId?: string): NuwaBoundedRun {
  const branch = activeBranch(run);
  const sequence = branch.steps.length + 1;
  const id = operationId || `step:${branch.branchId}:${sequence}`;
  if (findOperation(run, id)) return structuredClone(run);
  assertCurrent(run);
  if (run.lifecycle !== "running" || branch.status !== "running") throw new Error(`Nuwa Run is ${run.lifecycle}; steps may append only while running.`);
  if (!run.snapshot || sequence > run.snapshot.maximumSteps) throw new Error("Nuwa Run step budget is exhausted.");
  const next = structuredClone(run);
  const nextBranch = activeBranch(next);
  const step = fixtureStep(next, nextBranch, sequence, id);
  nextBranch.steps.push(step);
  next.viewState.selectedStepId = step.stepId;
  if (sequence === next.snapshot!.maximumSteps) {
    nextBranch.status = "completed";
    next.lifecycle = "completed";
  }
  return appendReceipt(next, "step", id, nextBranch.branchId, sequence);
}

export function pauseRun(run: NuwaBoundedRun, operationId = `pause:${run.activeBranchId}:${activeBranch(run).steps.length}`): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  if (run.lifecycle !== "running") throw new Error("Only a running Nuwa Run can pause.");
  const next = structuredClone(run);
  next.lifecycle = "paused";
  activeBranch(next).status = "paused";
  return appendReceipt(next, "pause", operationId, next.activeBranchId, null);
}

export function resumeRun(run: NuwaBoundedRun, operationId = `resume:${run.activeBranchId}:${activeBranch(run).steps.length}`): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  assertCurrent(run);
  if (run.lifecycle !== "paused") throw new Error("Only a paused Nuwa Run can resume.");
  const next = structuredClone(run);
  next.lifecycle = "running";
  activeBranch(next).status = "running";
  return appendReceipt(next, "resume", operationId, next.activeBranchId, null);
}

export function cancelRun(run: NuwaBoundedRun, operationId = `cancel:${run.activeBranchId}`): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  if (["completed", "cancelled", "superseded"].includes(run.lifecycle)) throw new Error(`Nuwa Run is ${run.lifecycle} and cannot cancel.`);
  const next = structuredClone(run);
  next.lifecycle = "cancelled";
  activeBranch(next).status = "cancelled";
  return appendReceipt(next, "cancel", operationId, next.activeBranchId, null);
}

export function forkFromStep(run: NuwaBoundedRun, input: { sourceBranchId: string; sequence: number; instruction: string; operationId?: string }): NuwaBoundedRun {
  const operationId = input.operationId || `fork:${input.sourceBranchId}:${input.sequence}`;
  if (findOperation(run, operationId)) return structuredClone(run);
  assertCurrent(run);
  const source = branchById(run, input.sourceBranchId);
  if (!source.steps.some((step) => step.sequence === input.sequence)) throw new Error("Nuwa temporary branch requires an existing fork step.");
  if (!run.snapshot || run.branches.length >= run.snapshot.maximumBranches) throw new Error("Nuwa temporary branch budget is exhausted.");
  const next = structuredClone(run);
  const sourceNext = branchById(next, input.sourceBranchId);
  const branchId = "branch.temporary-old-name-correction";
  const existing = next.branches.find((branch) => branch.branchId === branchId);
  if (existing) return structuredClone(run);
  const createdAt = receiptTime(next.receipts.length + 1);
  next.branches.push({
    branchId,
    label: "临时分支 · 旧名线索纠正",
    kind: "temporary",
    parentBranchId: input.sourceBranchId,
    forkPoint: input.sequence,
    status: "paused",
    steps: structuredClone(sourceNext.steps.filter((step) => step.sequence <= input.sequence)),
    steering: [{ steeringId: `steering-${stableHash({ operationId, instruction: input.instruction }).slice(0, 12)}`, fromStep: input.sequence, instruction: input.instruction.trim(), createdAt }],
    supersedesResultId: `result:${input.sourceBranchId}`
  });
  next.activeBranchId = branchId;
  next.lifecycle = "paused";
  next.viewState.compareBranchIds = [input.sourceBranchId, branchId];
  next.viewState.activeTool = "branch";
  return appendReceipt(next, "fork", operationId, branchId, input.sequence);
}

export function prepareCandidateHandoff(run: NuwaBoundedRun, operationId = `handoff:${run.activeBranchId}`): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  assertCurrent(run);
  const branch = activeBranch(run);
  if (branch.status !== "completed") throw new Error("Only a completed Nuwa branch can enter Candidate Review.");
  const candidateStep = [...branch.steps].reverse().find((step) => step.proposedEvents.length > 0);
  if (!candidateStep || !run.snapshot) throw new Error("Completed Nuwa branch has no reviewable Candidate Event.");
  const candidate = candidateStep.proposedEvents[0]!;
  const replay = replayRun(run);
  if (!replay.matches) throw new Error("Nuwa replay integrity failed; handoff is blocked.");
  const next = structuredClone(run);
  const receiptId = receiptIdentity(operationId, "handoff");
  next.handoff = {
    handoffId: `handoff-${stableHash({ runId: run.runId, branchId: branch.branchId, candidateId: candidate.candidateId }).slice(0, 16)}`,
    candidateId: candidate.candidateId,
    sourceRunId: run.runId,
    sourceBranchId: branch.branchId,
    sourceStepId: candidateStep.stepId,
    status: "sent-review",
    baselineDiff: ["在潮纹铜钥匙交接后插入旧名线索核对候选", "不确认寄信人身份", "不修改原始排演步骤"],
    affectedEvents: [candidate.insertionAfterEventId, candidate.candidateId],
    affectedCharacters: ["fixture.character.shen-yan", "fixture.character.a-wu"],
    characterStateBefore: ["沈砚知道来信警告；阿芜不知道完整来信内容"],
    characterStateAfter: ["沈砚知道旧名可能与守夜记录相关；阿芜仍不知道寄信人身份"],
    characterFateBefore: ["灯塔行动前：旧名线索未显露"],
    characterFateAfter: ["灯塔行动前：新增待核对的旧名线索候选"],
    worldStateCandidates: ["无正式 World State 变化"],
    relationCandidates: ["仅候选：有条件合作 → 愿意共同核对；Relation truth 不写入"],
    unresolvedConflicts: ["守夜记录残页缺少旧名出现的精确世界时间", "寄信人身份仍未知"],
    recovery: { snapshotIntegrity: run.snapshot.integrity, replayIntegrity: replay.stepsIntegrity, rollback: `保留 ${branch.parentBranchId || branch.branchId} 与 fork point ${branch.forkPoint ?? 0}` },
    receiptId
  };
  next.viewState.activeTool = "review";
  return appendReceipt(next, "handoff", operationId, branch.branchId, candidateStep.sequence);
}

export function markNuwaCandidateIntegrated(run: NuwaBoundedRun, operationId = `integrate:${run.handoff?.handoffId || "none"}`): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  if (!run.handoff || run.handoff.status !== "sent-review") throw new Error("Nuwa Candidate must be sent to review before integration.");
  const sourceBranchId = run.handoff.sourceBranchId;
  const next = structuredClone(run);
  next.handoff!.status = "integrated";
  return appendReceipt(next, "integrate", operationId, sourceBranchId, null);
}

export function updateNuwaBoundedView(run: NuwaBoundedRun, view: Partial<NuwaBoundedRun["viewState"]>, operationId: string): NuwaBoundedRun {
  if (findOperation(run, operationId)) return structuredClone(run);
  const next = structuredClone(run);
  next.viewState = { ...next.viewState, ...view };
  return appendReceipt(next, "view", operationId, next.activeBranchId, null);
}

export function compareBranches(run: NuwaBoundedRun, leftBranchId: string, rightBranchId: string): NuwaBranchComparison {
  const left = branchById(run, leftBranchId);
  const right = branchById(run, rightBranchId);
  const prefix = right.parentBranchId === left.branchId ? right.forkPoint || 0 : Math.min(left.steps.length, right.steps.length);
  const lastLeft = left.steps.at(-1);
  const lastRight = right.steps.at(-1);
  return {
    leftBranchId,
    rightBranchId,
    sharedPrefixStep: prefix,
    rows: [
      { category: "event", left: lastLeft?.proposedEvents[0]?.title || "未形成 Event 候选", right: lastRight?.proposedEvents[0]?.title || "未形成 Event 候选", status: "pending-review" },
      { category: "character-action", left: "沈砚直接展示信纸上的旧名痕迹", right: "沈砚只询问阿芜是否见过旧名", status: "temporary-branch" },
      { category: "knowledge", left: "阿芜可能接触完整来信信息（已拒绝）", right: "阿芜只知道自己见过的守夜记录残页", status: "rejected" },
      { category: "belief", left: "沈砚怀疑阿芜知道寄信人", right: "沈砚只把阿芜视为记录核对者", status: "nuwa-rehearsal" },
      { category: "world-state", left: "无正式变化", right: "无正式变化", status: "confirmed-baseline" },
      { category: "relation", left: "无正式关系变化", right: "候选：愿意共同核对", status: "pending-review" },
      { category: "object", left: "潮纹铜钥匙仍由沈砚持有", right: "潮纹铜钥匙仍由沈砚持有", status: "confirmed-baseline" },
      { category: "open-question", left: "寄信人是否与旧名有关？", right: "谁在守夜记录中写下旧名？", status: "nuwa-rehearsal" },
      { category: "source", left: "匿名来信 + 钥匙记录", right: "增加守夜记录残页；精确日期不足", status: "temporary-branch" },
      { category: "rule-conflict", left: "知识越界步骤被拒绝", right: "禁止事项通过，来源不足保留警告", status: "rejected" }
    ],
    endings: { left: "旧名痕迹停留在信纸，阿芜未获得越界知识。", right: "阿芜认出旧名曾在守夜记录出现，两人决定先核对记录。" }
  };
}

export function buildNuwaEventOverlay(run: NuwaBoundedRun): NuwaEventOverlay | null {
  if (!run.snapshot) return null;
  const candidates = run.branches.flatMap((branch) => branch.steps.flatMap((step) => step.proposedEvents.map((candidate) => ({
    candidateId: candidate.candidateId,
    sourceRunId: run.runId,
    sourceBranchId: branch.branchId,
    sourceStepId: step.stepId,
    title: candidate.title,
    insertionAfterEventId: candidate.insertionAfterEventId,
    narrativeOrder: candidate.narrativeOrder,
    worldTime: candidate.worldTime,
    adjacency: "相邻于铜钥匙交接；因果仍待 Impact Review",
    causalStatus: "candidate-not-confirmed" as const,
    changeKind: candidate.changeKind,
    affectedCharacters: step.participatingCharacterIds,
    affectedState: step.proposedCharacterStateChanges,
    sourceAnchors: step.sourceAnchors,
    receiptId: step.receipt.receiptId,
    status: run.handoff?.candidateId === candidate.candidateId ? run.handoff.status : "candidate" as const
  }))));
  return { confirmedBaseline: structuredClone(run.snapshot.confirmedEvents), candidates };
}

export function replayRun(run: NuwaBoundedRun): NuwaBoundedProjection["replay"] {
  const stepsIntegrity = stableHash(run.branches.map((branch) => ({ branchId: branch.branchId, parentBranchId: branch.parentBranchId, forkPoint: branch.forkPoint, steps: branch.steps })));
  const receiptIntegrity = stableHash(run.receipts.map(({ integrity, ...receipt }) => receipt));
  const receiptsValid = run.receipts.every((receipt) => receipt.integrity === stableHash(receiptWithoutIntegrity(receipt)));
  const stepsValid = run.branches.every((branch) => branch.steps.every((step) => step.receipt.integrity === stableHash({ ...step, receipt: { ...step.receipt, integrity: undefined } })));
  return { matches: receiptsValid && stepsValid, stepsIntegrity, receiptIntegrity, providerCalls: 0 };
}

export function getRunProjection(run: NuwaBoundedRun): NuwaBoundedProjection {
  const branch = activeBranch(run);
  const selectedStep = branch.steps.find((step) => step.stepId === run.viewState.selectedStepId) || branch.steps.at(-1) || null;
  const comparison = run.viewState.compareBranchIds ? compareBranches(run, ...run.viewState.compareBranchIds) : null;
  const submissionBlocker = run.stale ? "Snapshot revision 已变化；旧 Run 已标记 stale。" : run.integrityStatus === "missing-reference" ? "引用来源缺失；送审已 fail closed。" : run.integrityStatus === "mismatch" ? "Snapshot integrity 不匹配；送审已禁止。" : null;
  return { ...structuredClone(run), activeBranch: structuredClone(branch), selectedStep: structuredClone(selectedStep), comparison, overlay: buildNuwaEventOverlay(run), replay: replayRun(run), canHandoff: branch.status === "completed" && !submissionBlocker, submissionBlocker };
}

export function validateBoundedSnapshot(snapshot: BoundedStorySnapshot): NuwaBoundedRun["integrityStatus"] {
  const { integrity, ...unsigned } = snapshot;
  if (stableHash(unsigned) !== integrity) return "mismatch";
  if (snapshot.selectedSources.some((source) => !source.available)) return "missing-reference";
  const allowed = new Set(snapshot.selectedSources.map((source) => source.sourceAnchorId));
  const references = [
    ...snapshot.worldFacts.flatMap((fact) => fact.sourceAnchorIds),
    ...snapshot.relationFacts.flatMap((fact) => fact.sourceAnchorIds),
    ...snapshot.characterKnowledgeBoundaries.flatMap((boundary) => boundary.claims.flatMap((claim) => claim.sourceAnchorIds))
  ];
  return references.every((reference) => allowed.has(reference)) ? "current" : "missing-reference";
}

export function writeNuwaBoundedRun(workspacePath: string, run: NuwaBoundedRun): NuwaBoundedRun {
  const runPath = nuwaRunPath(workspacePath, safeId(run.runId));
  if (!existsSync(path.join(runPath, "run.json"))) throw new Error("Bounded Nuwa runtime requires the existing RunPack owner.");
  const target = path.join(runPath, "bounded-scenario-r0.json");
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("Bounded Nuwa runtime target must not be a symbolic link.");
  mkdirSync(runPath, { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${stableJson(run)}\n`, "utf8");
  renameSync(temporary, target);
  return structuredClone(run);
}

export function readNuwaBoundedRun(workspacePath: string, runId: string): NuwaBoundedRun | null {
  const target = path.join(nuwaRunPath(workspacePath, safeId(runId)), "bounded-scenario-r0.json");
  if (!existsSync(target)) return null;
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Bounded Nuwa runtime artifact must be a regular file.");
  const run = JSON.parse(readFileSync(target, "utf8")) as NuwaBoundedRun;
  if (run.version !== NUWA_BOUNDED_SCENARIO_VERSION) throw new Error("Bounded Nuwa runtime version is unsupported.");
  if (!replayRun(run).matches) throw new Error("Bounded Nuwa runtime replay integrity mismatch.");
  return structuredClone(run);
}

function fixtureStep(run: NuwaBoundedRun, branch: NuwaBoundedBranch, sequence: number, operationId: string): NuwaBoundedStep {
  const temporary = branch.kind === "temporary";
  const knowledgeBefore = knowledgeAt(run.snapshot!, branch.steps);
  const base = {
    stepId: `${branch.branchId}.step.${sequence}`,
    runId: run.runId,
    branchId: branch.branchId,
    sequence,
    participatingCharacterIds: ["fixture.character.shen-yan", "fixture.character.a-wu"],
    knowledgeBefore,
    createdBy: temporary && sequence > (branch.forkPoint || 0) ? "author-steering" as const : "fixture-director" as const
  };
  let content: Omit<NuwaBoundedStep, keyof typeof base | "receipt">;
  if (sequence === 1) content = {
    directorBeat: "来信与铜钥匙进入同一场景",
    dialogue: [{ characterId: "fixture.character.shen-yan", text: "这把钥匙和信上的潮纹，是同一种纹路。" }],
    actions: ["沈砚把铜钥匙放在未展开的信纸旁"], observations: ["阿芜只能看到潮纹，不能读取完整来信", "铜钥匙的潮纹与信纸水渍相互映照", "灯塔入口仍保持关闭，进入条件没有改变"],
    knowledgeAfter: { ...knowledgeBefore }, stateBefore: ["匿名来信已确认", "潮纹铜钥匙由沈砚持有"], stateAfter: ["正式事实不变", "Run 内建立潮纹关联观察"], proposedEvents: [], proposedRelations: [], proposedCharacterStateChanges: [], openQuestions: ["潮纹为何同时出现？"], sourceAnchors: ["source.anchor.tide-letter", "source.anchor.key-transfer"], constraintChecks: [{ checkId: "knowledge-scope", label: "角色知识边界", outcome: "pass", explanation: "阿芜没有读取完整来信。" }], status: "accepted"
  };
  else if (sequence === 2) content = {
    directorBeat: "测试旧名是否会被过早解释",
    dialogue: [{ characterId: "fixture.character.a-wu", text: "寄信人就是旧守夜人，我认得他的旧名。" }],
    actions: ["阿芜试图确认寄信人身份"], observations: ["该判断依赖阿芜未获知的完整来信与作者全知信息"], knowledgeAfter: { ...knowledgeBefore }, stateBefore: ["寄信人身份未知"], stateAfter: ["无状态变化；步骤被拒绝"], proposedEvents: [], proposedRelations: [], proposedCharacterStateChanges: [], openQuestions: ["阿芜实际上从何处见过旧名？"], sourceAnchors: ["source.anchor.watch-ledger-fragment"], constraintChecks: [{ checkId: "cross-character-secret", label: "跨角色秘密", outcome: "reject", explanation: "阿芜不能读取沈砚掌握的完整来信，也不能确认寄信人。" }, { checkId: "forbidden-sender", label: "禁止确认寄信人", outcome: "reject", explanation: "违反作者禁止事项，状态 delta 为 0。" }], status: "rejected"
  };
  else if (sequence === 3 && !temporary) content = {
    directorBeat: "保留旧名痕迹但不暴露身份",
    dialogue: [{ characterId: "fixture.character.shen-yan", text: "我只问这个旧名，你是否在别处见过？" }], actions: ["沈砚遮住来信正文，只露出水渍旁的旧名残笔"], observations: ["阿芜观察到旧名形状，但不知道寄信人"], knowledgeAfter: addKnowledge(knowledgeBefore, "fixture.character.a-wu", "claim.old-name-shape"), stateBefore: ["阿芜不知道来信内容"], stateAfter: ["阿芜仅知道旧名残笔的外形"], proposedEvents: [], proposedRelations: [], proposedCharacterStateChanges: ["Candidate Character State：阿芜新增对旧名形状的现场观察"], openQuestions: ["残笔是否与守夜记录同一人所写？"], sourceAnchors: ["source.anchor.tide-letter"], constraintChecks: [{ checkId: "corrected-boundary", label: "修正后的知识边界", outcome: "pass", explanation: "只传播当前可观察的旧名形状。" }], status: "accepted"
  };
  else if (sequence === 3) content = {
    directorBeat: "导演纠正：只询问阿芜亲历的记录",
    dialogue: [{ characterId: "fixture.character.shen-yan", text: "先不看信。你在守夜记录里见过这个旧名吗？" }, { characterId: "fixture.character.a-wu", text: "见过一笔，但残页没有日期。" }], actions: ["沈砚收起信纸", "阿芜复述自己见过的记录残片"], observations: ["旧名来自阿芜亲历来源；精确世界时间仍未知", "海雾贴近灯塔外墙，能见度正在下降"], knowledgeAfter: addKnowledge(knowledgeBefore, "fixture.character.shen-yan", "claim.old-name-ledger"), stateBefore: ["沈砚不知道阿芜见过旧名记录"], stateAfter: ["沈砚知道旧名曾出现在守夜记录残页"], proposedEvents: [], proposedRelations: [], proposedCharacterStateChanges: ["Candidate Character State：沈砚新增旧名记录线索"], openQuestions: ["谁写下旧名？", "残页属于哪个世界时间？"], sourceAnchors: ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"], constraintChecks: [{ checkId: "corrected-boundary", label: "角色知识边界", outcome: "pass", explanation: "阿芜只复述自己亲历的信息。" }, { checkId: "insufficient-world-time", label: "来源不足", outcome: "warning", explanation: "残页没有日期；世界时间保持未知。" }], status: "accepted"
  };
  else content = {
    directorBeat: temporary ? "形成可送审的守夜记录核对候选" : "形成可比较的信纸旧名结局",
    dialogue: temporary ? [{ characterId: "fixture.character.a-wu", text: "先去核对守夜记录，再决定是否进灯塔。" }] : [{ characterId: "fixture.character.shen-yan", text: "旧名先留在这里，我们不猜寄信人。" }],
    actions: [temporary ? "两人决定先核对记录" : "沈砚重新折起信纸"], observations: ["寄信人身份保持未知", "灯塔核心历史未改变"], knowledgeAfter: { ...knowledgeBefore }, stateBefore: ["进入灯塔计划未确认"], stateAfter: [temporary ? "候选：先核对守夜记录" : "候选：保留旧名痕迹待后续核验"], proposedEvents: [{ candidateId: temporary ? "candidate.event.old-name-ledger-check" : "candidate.event.old-name-letter-trace", title: temporary ? "沈砚与阿芜决定先核对旧名守夜记录" : "沈砚保留信纸上的旧名痕迹", insertionAfterEventId: "fixture.event.key-transfer", narrativeOrder: 3, worldTime: null, changeKind: "add" }], proposedRelations: temporary ? ["候选：有条件合作 → 愿意共同核对"] : [], proposedCharacterStateChanges: temporary ? ["沈砚：新增核对守夜记录目标", "阿芜：寄信人身份仍未知"] : ["沈砚：旧名线索保持待核验"], openQuestions: ["寄信人是谁？", "旧名记录的精确世界时间是什么？"], sourceAnchors: temporary ? ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"] : ["source.anchor.tide-letter"], constraintChecks: [{ checkId: "formal-write-zero", label: "正式写入", outcome: "pass", explanation: "只产生 Candidate ID；Event owner 写入为 0。" }, ...(temporary ? [{ checkId: "insufficient-source", label: "来源不足", outcome: "warning" as const, explanation: "守夜记录残页缺少精确日期。" }] : [])], status: "accepted"
  };
  const unsigned = { ...base, ...content, receipt: { receiptId: receiptIdentity(operationId, "step"), operationId, integrity: undefined, createdAt: receiptTime(run.receipts.length + 1) } };
  const integrity = stableHash(unsigned);
  return { ...unsigned, receipt: { ...unsigned.receipt, integrity } } as NuwaBoundedStep;
}

function knowledgeAt(snapshot: BoundedStorySnapshot, steps: NuwaBoundedStep[]): Record<string, string[]> {
  const initial = Object.fromEntries(snapshot.characterKnowledgeBoundaries.map((boundary) => [boundary.characterId, boundary.claims.filter((claim) => claim.stance !== "unknown").map((claim) => claim.claimId)]));
  return steps.reduce((current, step) => step.status === "accepted" ? structuredClone(step.knowledgeAfter) : current, initial);
}

function addKnowledge(current: Record<string, string[]>, characterId: string, claimId: string): Record<string, string[]> {
  const next = structuredClone(current);
  next[characterId] = [...new Set([...(next[characterId] || []), claimId])];
  return next;
}

function appendReceipt(run: NuwaBoundedRun, kind: NuwaBoundedReceipt["kind"], operationId: string, branchId: string | null, sequence: number | null): NuwaBoundedRun {
  const next = structuredClone(run);
  const unsigned = { receiptId: receiptIdentity(operationId, kind), operationId, kind, branchId, sequence, createdAt: receiptTime(next.receipts.length) };
  next.receipts.push({ ...unsigned, integrity: stableHash(unsigned) });
  next.updatedAt = unsigned.createdAt;
  return next;
}

function receiptWithoutIntegrity(receipt: NuwaBoundedReceipt): Omit<NuwaBoundedReceipt, "integrity"> {
  const { integrity: _integrity, ...unsigned } = receipt;
  return unsigned;
}

function findOperation(run: NuwaBoundedRun, operationId: string): NuwaBoundedReceipt | null {
  return run.receipts.find((receipt) => receipt.operationId === operationId) || null;
}

function activeBranch(run: NuwaBoundedRun): NuwaBoundedBranch {
  return branchById(run, run.activeBranchId);
}

function branchById(run: NuwaBoundedRun, branchId: string): NuwaBoundedBranch {
  const branch = run.branches.find((candidate) => candidate.branchId === branchId);
  if (!branch) throw new Error(`Nuwa branch is missing: ${branchId}.`);
  return branch;
}

function assertCurrent(run: NuwaBoundedRun): void {
  if (run.stale) throw new Error("Nuwa bounded snapshot is stale.");
  if (run.integrityStatus !== "current") throw new Error(`Nuwa bounded snapshot failed closed: ${run.integrityStatus}.`);
}

function receiptIdentity(operationId: string, kind: string): string {
  return `receipt-${stableHash({ operationId, kind }).slice(0, 16)}`;
}

function receiptTime(index: number): string {
  return new Date(Date.parse("2026-08-23T08:00:00.000Z") + index * 1_000).toISOString();
}

function safeId(value: string): string {
  const normalized = String(value).trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,120}$/i.test(normalized)) throw new Error("Nuwa bounded Run identifier is invalid.");
  return normalized;
}
