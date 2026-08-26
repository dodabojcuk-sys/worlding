import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { nuwaRunPath } from "./nuwaRunPack.ts";
import { stableHash, stableJson } from "./storySnapshotBuilder.ts";

/**
 * R0 is deliberately a small deterministic scene rehearsal.  It is a
 * projection inside an existing Nuwa Run Pack, not a second world/runtime
 * store.  The contracts are editor/provider agnostic so the policy can later
 * be replaced without changing the persisted boundary.
 */
export const NUWA_SCENE_SIMULATION_R0_VERSION = "story-studio-nuwa-scene-simulation-r0/v1" as const;
export const NUWA_SCENE_SIMULATION_R0_MAX_STEPS = 12;

export type NuwaSceneStableRefR0 = { id: string; revision: string };
export type NuwaSceneActorIdR0 = "actor.linyuan" | "actor.alan" | "actor.gatekeeper";
export type NuwaSceneActionTypeR0 = "observe" | "move" | "tell" | "use-resource" | "search" | "wait";

export type NuwaSceneBeliefsR0 = {
  confirmedFacts: string[];
  hypotheses: string[];
  misunderstandings: string[];
};

export type NuwaSceneActorStateR0 = {
  actorRef: NuwaSceneStableRefR0;
  displayName: string;
  currentGoal: string;
  secondaryGoals: string[];
  knowledgeRefs: string[];
  beliefs: NuwaSceneBeliefsR0;
  runLocalMemory: string[];
  emotionFlags: string[];
  resources: Record<string, number>;
  locationRef: string;
  active: boolean;
};

export type NuwaScenePassiveEntityR0 = {
  entityRef: NuwaSceneStableRefR0;
  displayName: string;
  kind: "location" | "item" | "event";
  state: "present" | "missing" | "locked" | "open";
};

export type NuwaSceneKnowledgeRefR0 = {
  id: string;
  label: string;
  kind: "fact" | "secret" | "clue";
  sourceRevision: string;
  confirmed: boolean;
};

export type NuwaSceneFixtureR0 = {
  version: "story-studio-nuwa-scene-fixture-r0/v1";
  fixtureId: "clocktower-search-arlan-r0";
  title: "钟楼外寻找阿岚";
  unitRef: NuwaSceneStableRefR0;
  beatRefs: NuwaSceneStableRefR0[];
  sourceRefs: NuwaSceneStableRefR0[];
  knowledge: NuwaSceneKnowledgeRefR0[];
  secretRef: string;
  actors: NuwaSceneActorStateR0[];
  passiveEntities: NuwaScenePassiveEntityR0[];
  locations: Record<string, { label: string; reachable: string[] }>;
  initialResources: Record<string, number>;
  maxSteps: 8;
};

export type NuwaSceneSandboxStateR0 = {
  locations: Record<NuwaSceneActorIdR0, string>;
  resources: Record<string, number>;
  entityStates: Record<string, NuwaScenePassiveEntityR0["state"]>;
  flags: Record<string, boolean>;
};

export type NuwaSceneSimulationActionR0 = {
  actionId: string;
  actorRef: NuwaSceneStableRefR0;
  type: NuwaSceneActionTypeR0;
  targetRefs: string[];
  statedIntent: string;
  knowledgeCitations: string[];
  expectedEffect: string;
  sourceStep: number;
};

export type NuwaSceneObservationReceiptR0 = {
  receiptId: string;
  receivingActorRef: NuwaSceneStableRefR0;
  information: string;
  knowledgeRef: string;
  channel: "direct" | "witnessed" | "told" | "public" | "inferred";
  sourceEventId: string;
  certainty: "confirmed" | "inferred" | "reported";
  receivedStep: number;
};

export type NuwaSceneStateDeltaR0 = {
  locations: Partial<Record<NuwaSceneActorIdR0, string>>;
  resources: Record<string, number>;
  entityStates: Record<string, NuwaScenePassiveEntityR0["state"]>;
  flags: Record<string, boolean>;
};

export type NuwaSceneResolvedEventR0 = {
  eventId: string;
  step: number;
  action: NuwaSceneSimulationActionR0;
  outcome: "accepted" | "rejected" | "modified";
  resolverReason: string;
  appliedStateDelta: NuwaSceneStateDeltaR0;
  observations: NuwaSceneObservationReceiptR0[];
  ruleRefs: string[];
  evidenceRefs: NuwaSceneStableRefR0[];
  createdStep: number;
};

export type NuwaSceneCheckpointR0 = {
  checkpointId: string;
  parentRunId: string;
  step: number;
  sandboxStateHash: string;
  ledgerHash: string;
  actorStateHashes: Record<NuwaSceneActorIdR0, string>;
  sandboxState: NuwaSceneSandboxStateR0;
  actors: NuwaSceneActorStateR0[];
  createdAt: string;
};

export type NuwaSceneInterventionEventR0 = {
  interventionId: string;
  targetRunId: string;
  checkpointId: string;
  instruction: string;
  modifiedSoftGoal: string | null;
  injectedEvent: {
    type: "propagate-secret" | "public-announcement";
    fromActorId: NuwaSceneActorIdR0 | null;
    toActorIds: NuwaSceneActorIdR0[];
    knowledgeRef: string | null;
    information: string;
  } | null;
  before: { softGoals: string[]; knowledgeRefs: Record<NuwaSceneActorIdR0, string[]> };
  after: { softGoals: string[]; knowledgeRefs: Record<NuwaSceneActorIdR0, string[]> };
  provenance: { kind: "author"; source: string };
  createdAt: string;
};

export type NuwaSceneRunStatusR0 = "planned" | "running" | "paused" | "completed" | "stopped" | "failed" | "stale";

export type NuwaSceneSimulationRunR0 = {
  version: typeof NUWA_SCENE_SIMULATION_R0_VERSION;
  runId: string;
  parentRunId: string | null;
  parentCheckpointId: string | null;
  sharedPrefixStep: number;
  scenario: NuwaSceneFixtureR0;
  snapshotHash: string;
  canonicalRevision: string;
  director: { hardConstraints: string[]; softGoals: string[]; maxSteps: number };
  actors: NuwaSceneActorStateR0[];
  sandboxState: NuwaSceneSandboxStateR0;
  ledger: NuwaSceneResolvedEventR0[];
  checkpoints: NuwaSceneCheckpointR0[];
  interventions: NuwaSceneInterventionEventR0[];
  childRunIds: string[];
  status: NuwaSceneRunStatusR0;
  nextStep: number;
  finalStateHash: string | null;
  ledgerHash: string;
  stateHash: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NuwaSceneSimulationReadModelR0 = NuwaSceneSimulationRunR0 & {
  replay: { stateHash: string; ledgerHash: string; matches: boolean; regeneratedActions: 0 } | null;
  children: Array<{ runId: string; parentCheckpointId: string | null; status: NuwaSceneRunStatusR0; stateHash: string; ledgerHash: string }>;
};

export type NuwaSceneCandidateR0 = {
  version: "story-studio-nuwa-scene-candidate-r0/v1";
  candidateId: string;
  sourceRunId: string;
  sourceCheckpointId: string | null;
  relevantStepRange: { start: number; end: number };
  actorDecisions: string[];
  stateDeltas: string[];
  causalChain: string[];
  knowledgeCitations: string[];
  authorInterventions: string[];
  uncertainty: string[];
  unresolvedQuestions: string[];
  sourceRevisions: NuwaSceneStableRefR0[];
  status: "candidate";
  reviewGate: "candidate-review";
  mutatesCanon: false;
  mutatesEvent: false;
  mutatesNovel: false;
  mutatesRecall: false;
};

export type NuwaSceneComparisonR0 = {
  version: "story-studio-nuwa-scene-compare-r0/v1";
  parentRunId: string;
  childRunId: string;
  sharedPrefixStep: number;
  divergenceStep: number | null;
  intervention: NuwaSceneInterventionEventR0 | null;
  differentActions: Array<{ step: number; parent: string | null; child: string | null }>;
  stateChanges: string[];
  informationPropagation: string[];
  finalResults: { parent: string; child: string };
  causalChain: string[];
  unresolvedQuestions: string[];
  metrics: { parentSteps: number; childSteps: number; parentCost: 0; childCost: 0 };
};

export type NuwaSceneReplayR0 = {
  runId: string;
  stateHash: string;
  ledgerHash: string;
  expectedStateHash: string;
  expectedLedgerHash: string;
  matches: boolean;
  regeneratedActions: 0;
};

const ACTOR_REFS: Record<NuwaSceneActorIdR0, NuwaSceneStableRefR0> = {
  "actor.linyuan": { id: "character.linyuan", revision: "fixture-r0" },
  "actor.alan": { id: "character.alan", revision: "fixture-r0" },
  "actor.gatekeeper": { id: "character.gatekeeper", revision: "fixture-r0" }
};

const SCENE_REVISION = "fixture-r0";

export function createNuwaSceneFixtureR0(input: { snapshotHash?: string; canonicalRevision?: string; unitId?: string; unitRevision?: string } = {}): NuwaSceneFixtureR0 {
  const sourceRevision = input.canonicalRevision || SCENE_REVISION;
  const unitId = input.unitId || "unit.clocktower-search-arlan";
  const unitRevision = input.unitRevision || sourceRevision;
  const actor = (id: NuwaSceneActorIdR0, displayName: string, goal: string, locationRef: string, knowledgeRefs: string[], resources: Record<string, number>, misunderstandings: string[]): NuwaSceneActorStateR0 => ({
    actorRef: ACTOR_REFS[id],
    displayName,
    currentGoal: goal,
    secondaryGoals: [],
    knowledgeRefs: [...knowledgeRefs],
    beliefs: { confirmedFacts: knowledgeRefs.map((ref) => ref), hypotheses: [], misunderstandings },
    runLocalMemory: [],
    emotionFlags: [],
    resources: { ...resources },
    locationRef,
    active: true
  });
  const knowledge: NuwaSceneKnowledgeRefR0[] = [
    { id: "fact.clocktower-open", label: "钟楼外门仍可进入", kind: "fact", sourceRevision, confirmed: true },
    { id: "clue.arlan-at-gate", label: "阿岚最后一次被看见在门侧", kind: "clue", sourceRevision, confirmed: true },
    { id: "secret.basement-key", label: "地下室钥匙藏在第三块石缝里", kind: "secret", sourceRevision, confirmed: true }
  ];
  return {
    version: "story-studio-nuwa-scene-fixture-r0/v1",
    fixtureId: "clocktower-search-arlan-r0",
    title: "钟楼外寻找阿岚",
    unitRef: { id: unitId, revision: unitRevision },
    beatRefs: [
      { id: "beat.search-gate", revision: sourceRevision },
      { id: "beat.secret-signal", revision: sourceRevision }
    ],
    sourceRefs: [
      { id: "scene.clocktower-exterior", revision: sourceRevision },
      { id: "event.arlan-last-seen", revision: sourceRevision },
      { id: "location.clocktower", revision: sourceRevision }
    ],
    knowledge,
    secretRef: "secret.basement-key",
    actors: [
      actor("actor.linyuan", "林远", "在钟楼外找到阿岚并保护关键线索", "location.clocktower-exterior", ["fact.clocktower-open", "clue.arlan-at-gate", "secret.basement-key"], { "oil-lamp": 1 }, ["阿岚可能已经离开钟楼"]),
      actor("actor.alan", "阿岚", "确认林远是否愿意共享真实线索", "location.clocktower-gate", ["fact.clocktower-open", "clue.arlan-at-gate"], {}, ["林远只是来找人，不会隐瞒关键事实"]),
      actor("actor.gatekeeper", "守门人", "维持钟楼入口秩序", "location.clocktower-gate", ["fact.clocktower-open"], {}, ["阿岚只是短暂停留"])
    ],
    passiveEntities: [
      { entityRef: { id: "location.clocktower-exterior", revision: sourceRevision }, displayName: "钟楼外", kind: "location", state: "present" },
      { entityRef: { id: "location.clocktower-gate", revision: sourceRevision }, displayName: "钟楼门侧", kind: "location", state: "present" },
      { entityRef: { id: "item.oil-lamp", revision: sourceRevision }, displayName: "煤油灯", kind: "item", state: "present" }
    ],
    locations: {
      "location.clocktower-exterior": { label: "钟楼外", reachable: ["location.clocktower-gate"] },
      "location.clocktower-gate": { label: "钟楼门侧", reachable: ["location.clocktower-exterior"] }
    },
    initialResources: { "oil-lamp": 1 },
    maxSteps: 8
  };
}

export function createNuwaSceneSimulationRun(input: { runId: string; snapshotHash: string; canonicalRevision?: string; createdAt?: string; fixture?: NuwaSceneFixtureR0 }): NuwaSceneSimulationRunR0 {
  const fixture = structuredClone(input.fixture || createNuwaSceneFixtureR0({ snapshotHash: input.snapshotHash, canonicalRevision: input.canonicalRevision }));
  const actors = structuredClone(fixture.actors);
  const sandboxState: NuwaSceneSandboxStateR0 = {
    locations: Object.fromEntries((Object.keys(ACTOR_REFS) as NuwaSceneActorIdR0[]).map((actorId) => [actorId, actors.find((actor) => actor.actorRef.id === ACTOR_REFS[actorId].id)?.locationRef || ""])) as Record<NuwaSceneActorIdR0, string>,
    resources: { ...fixture.initialResources },
    entityStates: Object.fromEntries(fixture.passiveEntities.map((entity) => [entity.entityRef.id, entity.state])),
    flags: {}
  };
  const now = input.createdAt || "2026-08-17T00:00:00.000Z";
  const run: NuwaSceneSimulationRunR0 = {
    version: NUWA_SCENE_SIMULATION_R0_VERSION,
    runId: validateRunId(input.runId),
    parentRunId: null,
    parentCheckpointId: null,
    sharedPrefixStep: 0,
    scenario: fixture,
    snapshotHash: input.snapshotHash,
    canonicalRevision: input.canonicalRevision || SCENE_REVISION,
    director: {
      hardConstraints: ["角色只能使用自己的知识投影", "位置必须可达", "资源不可凭空增加", "候选不是故事事实"],
      softGoals: ["让林远找到阿岚", "保留地下室核心秘密的因果压力"],
      maxSteps: fixture.maxSteps
    },
    actors,
    sandboxState,
    ledger: [],
    checkpoints: [],
    interventions: [],
    childRunIds: [],
    status: "planned",
    nextStep: 1,
    finalStateHash: null,
    ledgerHash: stableHash([]),
    stateHash: stableHash(sandboxState),
    failureReason: null,
    createdAt: now,
    updatedAt: now
  };
  return structuredClone(run);
}

export function stepNuwaSceneSimulation(run: NuwaSceneSimulationRunR0, now?: string): NuwaSceneSimulationRunR0 {
  assertRunnable(run);
  if (run.nextStep > run.director.maxSteps) return completeRun(run, now);
  const next = structuredClone(run);
  const step = next.nextStep;
  const actorId = scheduledActor(step);
  const actor = next.actors.find((candidate) => candidate.actorRef.id === ACTOR_REFS[actorId].id);
  if (!actor) throw new Error(`Scene scheduler actor is missing: ${actorId}.`);
  const action = deterministicActorPolicy(next, actorId, step);
  const resolved = resolveNuwaSceneAction(next, action);
  next.ledger.push(resolved);
  applyDelta(next.sandboxState, resolved.appliedStateDelta);
  syncActorStateFromSandbox(next.actors, next.sandboxState);
  applyObservations(next, resolved.observations);
  next.nextStep = step + 1;
  next.status = next.nextStep > next.director.maxSteps ? "completed" : "paused";
  next.finalStateHash = next.status === "completed" ? stableHash(next.sandboxState) : null;
  next.ledgerHash = stableHash(next.ledger);
  next.stateHash = stableHash(next.sandboxState);
  next.updatedAt = now || stepTimestamp(next.createdAt, step);
  return next;
}

export function runNuwaSceneSimulation(run: NuwaSceneSimulationRunR0, input: { steps?: number; now?: string } = {}): NuwaSceneSimulationRunR0 {
  let next = structuredClone(run);
  const requested = input.steps == null ? next.director.maxSteps : Math.max(0, Math.min(input.steps, NUWA_SCENE_SIMULATION_R0_MAX_STEPS));
  next.status = next.status === "planned" || next.status === "paused" ? "running" : next.status;
  for (let count = 0; count < requested && next.status !== "completed"; count += 1) {
    next = stepNuwaSceneSimulation(next, input.now);
    if (next.status === "paused" && count + 1 < requested) next.status = "running";
  }
  if (next.nextStep > next.director.maxSteps) next = completeRun(next, input.now);
  return next;
}

export function pauseNuwaSceneSimulation(run: NuwaSceneSimulationRunR0, now?: string): NuwaSceneSimulationRunR0 {
  if (run.status === "completed" || run.status === "stopped") return structuredClone(run);
  return { ...structuredClone(run), status: "paused", updatedAt: now || run.updatedAt };
}

export function stopNuwaSceneSimulation(run: NuwaSceneSimulationRunR0, now?: string): NuwaSceneSimulationRunR0 {
  if (run.status === "completed") return structuredClone(run);
  return { ...structuredClone(run), status: "stopped", updatedAt: now || run.updatedAt };
}

export function createNuwaSceneCheckpoint(run: NuwaSceneSimulationRunR0, input: { checkpointId?: string; createdAt?: string } = {}): NuwaSceneSimulationRunR0 {
  if (run.status === "failed") throw new Error("Failed scene runs cannot create checkpoints.");
  const checkpointId = input.checkpointId || `checkpoint-${String(run.ledger.length).padStart(2, "0")}`;
  const existing = run.checkpoints.find((checkpoint) => checkpoint.checkpointId === checkpointId);
  if (existing) return structuredClone(run);
  const checkpoint: NuwaSceneCheckpointR0 = {
    checkpointId,
    parentRunId: run.runId,
    step: run.ledger.length,
    sandboxStateHash: run.stateHash,
    ledgerHash: run.ledgerHash,
    actorStateHashes: Object.fromEntries(run.actors.map((actor) => [actor.actorRef.id as NuwaSceneActorIdR0, stableHash(actor)])) as Record<NuwaSceneActorIdR0, string>,
    sandboxState: structuredClone(run.sandboxState),
    actors: structuredClone(run.actors),
    createdAt: input.createdAt || stepTimestamp(run.createdAt, run.ledger.length)
  };
  return { ...structuredClone(run), checkpoints: [...run.checkpoints, checkpoint], status: "paused", updatedAt: checkpoint.createdAt };
}

export function applyNuwaSceneIntervention(run: NuwaSceneSimulationRunR0, input: {
  checkpointId: string;
  instruction: string;
  modifiedSoftGoal?: string;
  injectSecretTo?: NuwaSceneActorIdR0[];
  createdAt?: string;
  source?: string;
}): NuwaSceneSimulationRunR0 {
  const checkpoint = run.checkpoints.find((candidate) => candidate.checkpointId === input.checkpointId);
  if (!checkpoint) throw new Error("Intervention requires an existing checkpoint.");
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("Intervention instruction is required.");
  const beforeKnowledge = actorKnowledgeMap(run.actors);
  const beforeGoals = [...run.director.softGoals];
  const targets = [...new Set(input.injectSecretTo || [])];
  const injectedEvent = targets.length > 0 ? {
    type: "propagate-secret" as const,
    fromActorId: null,
    toActorIds: targets,
    knowledgeRef: run.scenario.secretRef,
    information: "作者明确注入：地下室钥匙的位置被传给指定角色。"
  } : null;
  const afterKnowledge = structuredClone(beforeKnowledge);
  if (injectedEvent) for (const actorId of targets) afterKnowledge[actorId] = [...new Set([...afterKnowledge[actorId], run.scenario.secretRef])];
  const afterGoals = input.modifiedSoftGoal ? [...beforeGoals, input.modifiedSoftGoal.trim()] : beforeGoals;
  const intervention: NuwaSceneInterventionEventR0 = {
    interventionId: `intervention-${stableHash({ runId: run.runId, checkpointId: input.checkpointId, instruction, targets }).slice(0, 12)}`,
    targetRunId: run.runId,
    checkpointId: input.checkpointId,
    instruction,
    modifiedSoftGoal: input.modifiedSoftGoal?.trim() || null,
    injectedEvent,
    before: { softGoals: beforeGoals, knowledgeRefs: beforeKnowledge },
    after: { softGoals: afterGoals, knowledgeRefs: afterKnowledge },
    provenance: { kind: "author", source: input.source || "author-control" },
    createdAt: input.createdAt || stepTimestamp(run.createdAt, run.ledger.length)
  };
  const next = structuredClone(run);
  next.director.softGoals = afterGoals;
  next.interventions.push(intervention);
  next.status = "paused";
  next.updatedAt = intervention.createdAt;
  next.stateHash = stableHash(next.sandboxState);
  return next;
}

export function forkNuwaSceneSimulationFromCheckpoint(run: NuwaSceneSimulationRunR0, input: { checkpointId: string; childRunId: string; createdAt?: string }): { parent: NuwaSceneSimulationRunR0; child: NuwaSceneSimulationRunR0 } {
  const checkpoint = run.checkpoints.find((candidate) => candidate.checkpointId === input.checkpointId);
  if (!checkpoint) throw new Error("Scene branch requires an existing checkpoint.");
  const childId = validateRunId(input.childRunId);
  const child: NuwaSceneSimulationRunR0 = {
    ...structuredClone(run),
    runId: childId,
    parentRunId: run.runId,
    parentCheckpointId: checkpoint.checkpointId,
    sharedPrefixStep: checkpoint.step,
    actors: structuredClone(checkpoint.actors),
    sandboxState: structuredClone(checkpoint.sandboxState),
    ledger: structuredClone(run.ledger.slice(0, checkpoint.step)),
    checkpoints: structuredClone(run.checkpoints.filter((candidate) => candidate.step <= checkpoint.step)),
    interventions: structuredClone(run.interventions.filter((intervention) => intervention.checkpointId === checkpoint.checkpointId)),
    childRunIds: [],
    status: "paused",
    nextStep: checkpoint.step + 1,
    finalStateHash: null,
    ledgerHash: checkpoint.ledgerHash,
    stateHash: checkpoint.sandboxStateHash,
    failureReason: null,
    createdAt: input.createdAt || run.createdAt,
    updatedAt: input.createdAt || run.updatedAt
  };
  // An intervention is metadata on the parent until a child is created.  The
  // child receives the explicit injected event; the parent prefix and actor
  // knowledge therefore remain immutable and comparable.
  for (const intervention of child.interventions) {
    if (!intervention.injectedEvent) continue;
    for (const actorId of intervention.injectedEvent.toActorIds) {
      const target = child.actors.find((actor) => actor.actorRef.id === ACTOR_REFS[actorId].id);
      if (!target) throw new Error(`Intervention target actor is missing: ${actorId}.`);
      const knowledgeRef = intervention.injectedEvent.knowledgeRef;
      if (knowledgeRef && !target.knowledgeRefs.includes(knowledgeRef)) target.knowledgeRefs.push(knowledgeRef);
      if (knowledgeRef && !target.beliefs.confirmedFacts.includes(knowledgeRef)) target.beliefs.confirmedFacts.push(knowledgeRef);
      target.runLocalMemory.push(intervention.injectedEvent.information);
    }
  }
  const parent = structuredClone(run);
  if (!parent.childRunIds.includes(childId)) parent.childRunIds.push(childId);
  parent.updatedAt = input.createdAt || parent.updatedAt;
  return { parent, child };
}

export function compareNuwaSceneSimulations(parent: NuwaSceneSimulationRunR0, child: NuwaSceneSimulationRunR0): NuwaSceneComparisonR0 {
  if (child.parentRunId !== parent.runId) throw new Error("Scene comparison requires a parent/child Run lineage.");
  const sharedPrefixStep = child.sharedPrefixStep;
  const max = Math.max(parent.ledger.length, child.ledger.length);
  const differentActions: NuwaSceneComparisonR0["differentActions"] = [];
  let divergenceStep: number | null = null;
  for (let index = sharedPrefixStep; index < max; index += 1) {
    const parentAction = parent.ledger[index]?.action.actionId || null;
    const childAction = child.ledger[index]?.action.actionId || null;
    if (parentAction !== childAction) {
      divergenceStep = divergenceStep ?? index + 1;
      differentActions.push({ step: index + 1, parent: parent.ledger[index]?.action.statedIntent || null, child: child.ledger[index]?.action.statedIntent || null });
    }
  }
  const intervention = child.interventions[0] || parent.interventions.find((candidate) => candidate.checkpointId === child.parentCheckpointId) || null;
  const stateChanges = compareState(parent.sandboxState, child.sandboxState);
  const informationPropagation = compareKnowledge(parent.actors, child.actors);
  const finalResults = {
    parent: parent.status === "completed" ? `父 Run 完成，状态 ${parent.stateHash.slice(0, 12)}` : `父 Run ${parent.status}`,
    child: child.status === "completed" ? `子 Run 完成，状态 ${child.stateHash.slice(0, 12)}` : `子 Run ${child.status}`
  };
  return {
    version: "story-studio-nuwa-scene-compare-r0/v1",
    parentRunId: parent.runId,
    childRunId: child.runId,
    sharedPrefixStep,
    divergenceStep,
    intervention,
    differentActions,
    stateChanges,
    informationPropagation,
    finalResults,
    causalChain: [
      `共享前缀至第 ${sharedPrefixStep} 步`,
      intervention ? `作者干预：${intervention.instruction}` : "没有额外作者干预",
      divergenceStep ? `从第 ${divergenceStep} 步开始行动分歧` : "尚未出现行动分歧"
    ],
    unresolvedQuestions: ["作者是否要把候选送入 Candidate Review？", "分支结果是否仍满足当前 Canon revision？"],
    metrics: { parentSteps: parent.ledger.length, childSteps: child.ledger.length, parentCost: 0, childCost: 0 }
  };
}

export function replayNuwaSceneSimulation(run: NuwaSceneSimulationRunR0): NuwaSceneReplayR0 {
  const replayState = structuredClone(run.scenario.actors);
  const replaySandbox: NuwaSceneSandboxStateR0 = {
    locations: Object.fromEntries((Object.keys(ACTOR_REFS) as NuwaSceneActorIdR0[]).map((actorId) => [actorId, replayState.find((actor) => actor.actorRef.id === ACTOR_REFS[actorId].id)?.locationRef || ""])) as Record<NuwaSceneActorIdR0, string>,
    resources: { ...run.scenario.initialResources },
    entityStates: Object.fromEntries(run.scenario.passiveEntities.map((entity) => [entity.entityRef.id, entity.state])),
    flags: {}
  };
  const replayActors = replayState;
  for (const event of run.ledger) {
    applyDelta(replaySandbox, event.appliedStateDelta);
    applyObservationsToActors(replayActors, event.observations);
  }
  const stateHash = stableHash(replaySandbox);
  const ledgerHash = stableHash(run.ledger);
  return {
    runId: run.runId,
    stateHash,
    ledgerHash,
    expectedStateHash: run.stateHash,
    expectedLedgerHash: run.ledgerHash,
    matches: stateHash === run.stateHash && ledgerHash === run.ledgerHash,
    regeneratedActions: 0
  };
}

export function buildNuwaSceneCandidate(run: NuwaSceneSimulationRunR0, input: { currentCanonicalRevision?: string; checkpointId?: string | null } = {}): NuwaSceneCandidateR0 {
  if (run.status !== "completed") throw new Error("Only a completed scene Run can produce a Candidate.");
  if (input.currentCanonicalRevision && input.currentCanonicalRevision !== run.canonicalRevision) throw new Error("Scene Run is stale against the current Canon revision.");
  const events = run.ledger.filter((event) => event.outcome === "accepted");
  const start = events[0]?.step || 1;
  const end = events.at(-1)?.step || 0;
  return {
    version: "story-studio-nuwa-scene-candidate-r0/v1",
    candidateId: `scene-candidate-${stableHash({ runId: run.runId, stateHash: run.stateHash, ledgerHash: run.ledgerHash }).slice(0, 16)}`,
    sourceRunId: run.runId,
    sourceCheckpointId: input.checkpointId ?? run.checkpoints.at(-1)?.checkpointId ?? null,
    relevantStepRange: { start, end },
    actorDecisions: events.map((event) => `${event.step}. ${event.action.actorRef.id}：${event.action.statedIntent}`),
    stateDeltas: events.flatMap((event) => deltaSummary(event.appliedStateDelta)),
    causalChain: events.map((event) => `${event.step}. ${event.resolverReason}`),
    knowledgeCitations: [...new Set(events.flatMap((event) => event.action.knowledgeCitations))],
    authorInterventions: run.interventions.map((intervention) => intervention.instruction),
    uncertainty: ["Run 结果仍是候选，不代表 Canon 事实。", "未被 ObservationReceipt 传递的信息保持未知。"],
    unresolvedQuestions: ["作者是否要把候选送入 Candidate Review？", "分支结果是否仍满足当前 Canon revision？"],
    sourceRevisions: [run.scenario.unitRef, ...run.scenario.beatRefs, ...run.scenario.sourceRefs],
    status: "candidate",
    reviewGate: "candidate-review",
    mutatesCanon: false,
    mutatesEvent: false,
    mutatesNovel: false,
    mutatesRecall: false
  };
}

export function validateNuwaSceneSimulationRun(run: NuwaSceneSimulationRunR0): NuwaSceneSimulationRunR0 {
  if (run.version !== NUWA_SCENE_SIMULATION_R0_VERSION) throw new Error("Scene simulation version is unsupported.");
  if (run.ledger.length > run.director.maxSteps || run.director.maxSteps > NUWA_SCENE_SIMULATION_R0_MAX_STEPS) throw new Error("Scene simulation step budget is invalid.");
  const actorIds = run.actors.map((actor) => actor.actorRef.id);
  if (new Set(actorIds).size !== actorIds.length || actorIds.length !== 3) throw new Error("Scene simulation must contain exactly three actors.");
  if (run.scenario.passiveEntities.length < 2 || run.scenario.passiveEntities.length > 4) throw new Error("Scene fixture passive entity count is invalid.");
  for (const actor of run.actors) {
    const actorId = (Object.keys(ACTOR_REFS) as NuwaSceneActorIdR0[]).find((candidate) => ACTOR_REFS[candidate].id === actor.actorRef.id);
    if (!actorId || run.sandboxState.locations[actorId] !== actor.locationRef) throw new Error("Scene actor location is out of sync with the Run sandbox.");
  }
  const replay = replayNuwaSceneSimulation(run);
  if (!replay.matches) throw new Error("Scene simulation replay hash does not match the saved Run.");
  return structuredClone(run);
}

export function resolveNuwaSceneAction(run: NuwaSceneSimulationRunR0, action: NuwaSceneSimulationActionR0): NuwaSceneResolvedEventR0 {
  const actorId = actorIdFromRef(run, action.actorRef);
  const actor = run.actors.find((candidate) => candidate.actorRef.id === ACTOR_REFS[actorId].id);
  if (!actor || !actor.active) throw new Error("Scene action actor is inactive or missing.");
  const unknownCitation = action.knowledgeCitations.find((ref) => !actor.knowledgeRefs.includes(ref));
  if (unknownCitation) throw new Error(`Knowledge boundary leak: ${actorId} cited ${unknownCitation} without an ObservationReceipt.`);
  const eventId = `scene-event-${String(action.sourceStep).padStart(2, "0")}-${stableHash({ runId: run.runId, action }).slice(0, 10)}`;
  const emptyDelta: NuwaSceneStateDeltaR0 = { locations: {}, resources: {}, entityStates: {}, flags: {} };
  const reject = (reason: string, ruleRefs: string[], evidenceRefs: NuwaSceneStableRefR0[] = []): NuwaSceneResolvedEventR0 => ({ eventId, step: action.sourceStep, action: structuredClone(action), outcome: "rejected", resolverReason: reason, appliedStateDelta: emptyDelta, observations: [], ruleRefs, evidenceRefs, createdStep: action.sourceStep });
  if (!run.scenario.locations[run.sandboxState.locations[actorId]]) return reject("Actor location is not part of the scene map.", ["location.exists"]);
  if (action.type === "move") {
    const target = action.targetRefs[0];
    if (!target || !run.scenario.locations[target]) return reject("目标地点不存在。", ["location.target-exists"]);
    if (!run.scenario.locations[run.sandboxState.locations[actorId]].reachable.includes(target)) return reject("目标地点当前不可达。", ["location.reachable"]);
    return { eventId, step: action.sourceStep, action: structuredClone(action), outcome: "accepted", resolverReason: `位置允许移动至${run.scenario.locations[target].label}。`, appliedStateDelta: { ...emptyDelta, locations: { [actorId]: target } }, observations: [], ruleRefs: ["location.reachable"], evidenceRefs: run.scenario.sourceRefs.slice(0, 1), createdStep: action.sourceStep };
  }
  if (action.type === "use-resource") {
    const resource = action.targetRefs[0];
    if (!resource || (run.sandboxState.resources[resource] || 0) < 1) return reject("资源不足，行动被拒绝。", ["resource.available"]);
    return { eventId, step: action.sourceStep, action: structuredClone(action), outcome: "accepted", resolverReason: `消耗一份${resource}，行动在当前资源约束内成立。`, appliedStateDelta: { ...emptyDelta, resources: { [resource]: -1 }, flags: { [`used:${resource}`]: true } }, observations: [], ruleRefs: ["resource.available"], evidenceRefs: run.scenario.sourceRefs.slice(0, 1), createdStep: action.sourceStep };
  }
  if (action.type === "tell") {
    const recipientId = action.targetRefs.find((target) => target in ACTOR_REFS) as NuwaSceneActorIdR0 | undefined;
    const knowledgeRef = action.knowledgeCitations[0];
    if (!recipientId || !knowledgeRef) return reject("告知缺少明确接收角色或知识引用。", ["observation.recipient", "observation.knowledge"]);
    const recipient = run.actors.find((candidate) => candidate.actorRef.id === ACTOR_REFS[recipientId].id);
    if (!recipient) return reject("接收角色不存在。", ["observation.recipient"]);
    if (run.sandboxState.locations[actorId] !== run.sandboxState.locations[recipientId]) return reject("告知双方不在同一地点，不能生成直接 ObservationReceipt。", ["observation.same-location"]);
    const receipt: NuwaSceneObservationReceiptR0 = { receiptId: `receipt-${String(action.sourceStep).padStart(2, "0")}-${recipientId}`, receivingActorRef: recipient.actorRef, information: run.scenario.knowledge.find((item) => item.id === knowledgeRef)?.label || knowledgeRef, knowledgeRef, channel: "told", sourceEventId: eventId, certainty: "confirmed", receivedStep: action.sourceStep };
    return { eventId, step: action.sourceStep, action: structuredClone(action), outcome: "accepted", resolverReason: `${actor.displayName}向${recipient.displayName}明确告知一条可追溯信息。`, appliedStateDelta: emptyDelta, observations: [receipt], ruleRefs: ["knowledge.actor-owned", "observation.explicit-recipient"], evidenceRefs: run.scenario.sourceRefs.slice(0, 2), createdStep: action.sourceStep };
  }
  if (action.type === "observe" || action.type === "search") {
    const target = action.targetRefs[0];
    if (target && !run.scenario.passiveEntities.some((entity) => entity.entityRef.id === target) && !run.scenario.locations[target]) return reject("观察目标不存在。", ["target.exists"]);
    return { eventId, step: action.sourceStep, action: structuredClone(action), outcome: "accepted", resolverReason: `${actor.displayName}在${run.scenario.locations[run.sandboxState.locations[actorId]].label}完成观察；只向自己增加现场记忆。`, appliedStateDelta: emptyDelta, observations: [{ receiptId: `receipt-${String(action.sourceStep).padStart(2, "0")}-${actorId}`, receivingActorRef: actor.actorRef, information: action.expectedEffect, knowledgeRef: action.targetRefs[0] || "clue.local-observation", channel: "direct", sourceEventId: eventId, certainty: "inferred", receivedStep: action.sourceStep }], ruleRefs: ["knowledge.private-observation"], evidenceRefs: run.scenario.sourceRefs.slice(0, 1), createdStep: action.sourceStep };
  }
  return { eventId, step: action.sourceStep, action: structuredClone(action), outcome: "accepted", resolverReason: `${actor.displayName}选择等待，世界状态保持不变。`, appliedStateDelta: emptyDelta, observations: [], ruleRefs: ["action.wait"], evidenceRefs: [], createdStep: action.sourceStep };
}

export function deterministicActorPolicy(run: NuwaSceneSimulationRunR0, actorId: NuwaSceneActorIdR0, step: number): NuwaSceneSimulationActionR0 {
  const actorRef = ACTOR_REFS[actorId];
  const base = { actionId: `action-${String(step).padStart(2, "0")}-${actorId}`, actorRef, sourceStep: step };
  if (step === 1 && actorId === "actor.linyuan") return { ...base, type: "observe", targetRefs: ["location.clocktower-gate"], statedIntent: "先确认门侧是否还有阿岚的踪迹。", knowledgeCitations: ["clue.arlan-at-gate"], expectedEffect: "发现门侧的脚印方向。" };
  if (step === 2 && actorId === "actor.alan") return { ...base, type: "move", targetRefs: ["location.clocktower-exterior"], statedIntent: "从门侧走到钟楼外确认林远是否在等我。", knowledgeCitations: ["fact.clocktower-open"], expectedEffect: "阿岚移动到钟楼外。" };
  if (step === 3 && actorId === "actor.gatekeeper") return { ...base, type: "observe", targetRefs: ["location.clocktower-gate"], statedIntent: "守门人观察来往的人。", knowledgeCitations: ["fact.clocktower-open"], expectedEffect: "记录门侧有人经过。" };
  if (step === 4 && actorId === "actor.linyuan") return { ...base, type: "tell", targetRefs: ["actor.alan"], statedIntent: "向阿岚告知地下室钥匙的位置，但不扩大传播。", knowledgeCitations: ["secret.basement-key"], expectedEffect: "阿岚获得地下室钥匙位置的明确知识。" };
  if (step === 5 && actorId === "actor.alan") return { ...base, type: "search", targetRefs: ["item.oil-lamp"], statedIntent: "依据刚刚得到的线索寻找可用的灯。", knowledgeCitations: ["secret.basement-key"], expectedEffect: "阿岚开始把钥匙线索与现场物品联系起来。" };
  if (step === 6 && actorId === "actor.gatekeeper") {
    if (run.actors.find((candidate) => candidate.actorRef.id === ACTOR_REFS[actorId].id)?.knowledgeRefs.includes(run.scenario.secretRef)) {
      return { ...base, type: "tell", targetRefs: ["actor.alan"], statedIntent: "守门人因作者注入的秘密向阿岚确认钥匙线索。", knowledgeCitations: [run.scenario.secretRef], expectedEffect: "分支中的秘密传播产生新的可追溯观察。" };
    }
    return { ...base, type: "wait", targetRefs: [], statedIntent: "守门人暂不介入两人的谈话。", knowledgeCitations: [], expectedEffect: "守门人保持对秘密未知。" };
  }
  if (step === 7 && actorId === "actor.linyuan") return { ...base, type: "use-resource", targetRefs: ["oil-lamp"], statedIntent: "点亮煤油灯，为进入钟楼外沿做准备。", knowledgeCitations: ["fact.clocktower-open"], expectedEffect: "消耗一份煤油灯资源。" };
  if (step === 8 && actorId === "actor.alan") return { ...base, type: "move", targetRefs: ["location.clocktower-gate"], statedIntent: "带着新线索回到门侧，暂不告诉守门人。", knowledgeCitations: ["secret.basement-key"], expectedEffect: "阿岚回到门侧，秘密未向守门人公开。" };
  return { ...base, type: "wait", targetRefs: [], statedIntent: `${actorId}保持观察。`, knowledgeCitations: [], expectedEffect: "保持当前状态。" };
}

export function readNuwaSceneSimulationRun(workspacePath: string, runId: string): NuwaSceneSimulationRunR0 | null {
  const safeRunId = validateRunId(runId);
  const target = path.join(nuwaRunPath(workspacePath, safeRunId), "scene-runtime.json");
  if (!existsSync(target)) return null;
  assertRegularFile(target);
  const raw = JSON.parse(readFileSync(target, "utf8")) as NuwaSceneSimulationRunR0;
  const ledger = readSceneLedger(workspacePath, safeRunId);
  const normalized = { ...raw, ledger };
  // Older development RunPacks may predate the actor resource projection.
  // Reconcile this derived view on read without rewriting user data or the
  // append-only ledger; the sandbox remains the authoritative Run-local state.
  syncActorStateFromSandbox(normalized.actors, normalized.sandboxState);
  return validateNuwaSceneSimulationRun(normalized);
}

export function writeNuwaSceneSimulationRun(workspacePath: string, run: NuwaSceneSimulationRunR0): NuwaSceneSimulationRunR0 {
  const safeRunId = validateRunId(run.runId);
  const runPath = nuwaRunPath(workspacePath, safeRunId);
  if (!existsSync(path.join(runPath, "run.json"))) throw new Error("Scene simulation requires an existing Nuwa Run Pack.");
  const validated = validateNuwaSceneSimulationRun(run);
  const ledgerPath = path.join(runPath, "scene-ledger.jsonl");
  const previous = existsSync(ledgerPath) ? readSceneLedger(workspacePath, safeRunId) : [];
  if (previous.length > validated.ledger.length || previous.some((event, index) => stableJson(event) !== stableJson(validated.ledger[index]))) {
    throw new Error("Scene Event Ledger is append-only; existing events cannot be rewritten.");
  }
  if (validated.ledger.length > previous.length) appendFileSync(ledgerPath, `${validated.ledger.slice(previous.length).map((event) => stableJson(event)).join("\n")}\n`, "utf8");
  const metadata = { ...validated, ledger: undefined } as unknown as Record<string, unknown>;
  delete metadata.ledger;
  atomicJson(path.join(runPath, "scene-runtime.json"), metadata);
  return structuredClone(validated);
}

export function deleteNuwaSceneSimulationRuntime(workspacePath: string, runId: string): void {
  // This helper intentionally has no product caller.  It exists only for
  // isolated fixture cleanup and is never used by the app or migration code.
  const safeRunId = validateRunId(runId);
  const runPath = nuwaRunPath(workspacePath, safeRunId);
  const target = path.join(runPath, "scene-runtime.json");
  if (existsSync(target)) throw new Error("Scene runtime deletion is not part of the product contract.");
}

export function listNuwaSceneSimulationChildren(workspacePath: string, runId: string): NuwaSceneSimulationRunR0[] {
  const root = path.join(path.resolve(workspacePath), ".world-os", "runs", "nuwa");
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((entry) => /^[a-z0-9][a-z0-9-]*$/i.test(entry)).flatMap((entry) => {
    const child = readNuwaSceneSimulationRun(workspacePath, entry);
    return child?.parentRunId === runId ? [child] : [];
  });
}

export function readNuwaSceneSimulationReadModel(workspacePath: string, runId: string): NuwaSceneSimulationReadModelR0 | null {
  const run = readNuwaSceneSimulationRun(workspacePath, runId);
  if (!run) return null;
  const replay = replayNuwaSceneSimulation(run);
  return {
    ...run,
    replay: { stateHash: replay.stateHash, ledgerHash: replay.ledgerHash, matches: replay.matches, regeneratedActions: 0 },
    children: listNuwaSceneSimulationChildren(workspacePath, run.runId).map((child) => ({ runId: child.runId, parentCheckpointId: child.parentCheckpointId, status: child.status, stateHash: child.stateHash, ledgerHash: child.ledgerHash }))
  };
}

function assertRunnable(run: NuwaSceneSimulationRunR0): void {
  if (run.status === "paused" || run.status === "planned" || run.status === "running") return;
  if (run.status === "stale") throw new Error("Canon revision is stale; this Run cannot continue.");
  throw new Error(`Scene Run is ${run.status} and cannot continue.`);
}

function completeRun(run: NuwaSceneSimulationRunR0, now?: string): NuwaSceneSimulationRunR0 {
  const next = structuredClone(run);
  next.status = "completed";
  next.finalStateHash = stableHash(next.sandboxState);
  next.stateHash = next.finalStateHash;
  next.ledgerHash = stableHash(next.ledger);
  next.updatedAt = now || next.updatedAt;
  return next;
}

function actorIdFromRef(run: NuwaSceneSimulationRunR0, ref: NuwaSceneStableRefR0): NuwaSceneActorIdR0 {
  const actor = (Object.keys(ACTOR_REFS) as NuwaSceneActorIdR0[]).find((id) => ACTOR_REFS[id].id === ref.id && ACTOR_REFS[id].revision === ref.revision);
  if (!actor || !run.actors.some((candidate) => candidate.actorRef.id === ref.id && candidate.actorRef.revision === ref.revision)) throw new Error("Scene action actor reference is not part of this Run.");
  return actor;
}

function scheduledActor(step: number): NuwaSceneActorIdR0 {
  return (["actor.linyuan", "actor.alan", "actor.gatekeeper"] as NuwaSceneActorIdR0[])[(step - 1) % 3];
}

function actorKnowledgeMap(actors: NuwaSceneActorStateR0[]): Record<NuwaSceneActorIdR0, string[]> {
  return Object.fromEntries((Object.keys(ACTOR_REFS) as NuwaSceneActorIdR0[]).map((id) => [id, [...(actors.find((actor) => actor.actorRef.id === ACTOR_REFS[id].id)?.knowledgeRefs || [])]])) as Record<NuwaSceneActorIdR0, string[]>;
}

function applyDelta(state: NuwaSceneSandboxStateR0, delta: NuwaSceneStateDeltaR0): void {
  for (const [actorId, location] of Object.entries(delta.locations)) if (location) state.locations[actorId as NuwaSceneActorIdR0] = location;
  for (const [resource, amount] of Object.entries(delta.resources)) state.resources[resource] = (state.resources[resource] || 0) + amount;
  Object.assign(state.entityStates, delta.entityStates);
  Object.assign(state.flags, delta.flags);
}

function applyObservations(run: NuwaSceneSimulationRunR0, observations: NuwaSceneObservationReceiptR0[]): void {
  applyObservationsToActors(run.actors, observations);
}

function applyObservationsToActors(actors: NuwaSceneActorStateR0[], observations: NuwaSceneObservationReceiptR0[]): void {
  for (const receipt of observations) {
    const actor = actors.find((candidate) => candidate.actorRef.id === receipt.receivingActorRef.id && candidate.actorRef.revision === receipt.receivingActorRef.revision);
    if (!actor) throw new Error("ObservationReceipt receiver is not part of the Run.");
    if (!actor.knowledgeRefs.includes(receipt.knowledgeRef)) actor.knowledgeRefs.push(receipt.knowledgeRef);
    if (receipt.certainty === "confirmed" && !actor.beliefs.confirmedFacts.includes(receipt.knowledgeRef)) actor.beliefs.confirmedFacts.push(receipt.knowledgeRef);
    if (receipt.certainty !== "confirmed" && !actor.beliefs.hypotheses.includes(receipt.knowledgeRef)) actor.beliefs.hypotheses.push(receipt.knowledgeRef);
    if (!actor.runLocalMemory.includes(receipt.information)) actor.runLocalMemory.push(receipt.information);
  }
}

function syncActorStateFromSandbox(actors: NuwaSceneActorStateR0[], sandboxState: NuwaSceneSandboxStateR0): void {
  for (const actor of actors) {
    const actorId = (Object.keys(ACTOR_REFS) as NuwaSceneActorIdR0[]).find((candidate) => ACTOR_REFS[candidate].id === actor.actorRef.id);
    if (!actorId) continue;
    if (sandboxState.locations[actorId]) actor.locationRef = sandboxState.locations[actorId];
    for (const resource of Object.keys(actor.resources)) {
      if (resource in sandboxState.resources) actor.resources[resource] = sandboxState.resources[resource] || 0;
    }
  }
}

function compareState(parent: NuwaSceneSandboxStateR0, child: NuwaSceneSandboxStateR0): string[] {
  const changes: string[] = [];
  for (const id of Object.keys(parent.locations) as NuwaSceneActorIdR0[]) if (parent.locations[id] !== child.locations[id]) changes.push(`${id}：${parent.locations[id]} → ${child.locations[id]}`);
  for (const id of new Set([...Object.keys(parent.resources), ...Object.keys(child.resources)])) if ((parent.resources[id] || 0) !== (child.resources[id] || 0)) changes.push(`资源 ${id}：${parent.resources[id] || 0} → ${child.resources[id] || 0}`);
  return changes;
}

function compareKnowledge(parent: NuwaSceneActorStateR0[], child: NuwaSceneActorStateR0[]): string[] {
  const changes: string[] = [];
  for (const actor of child) {
    const before = parent.find((candidate) => candidate.actorRef.id === actor.actorRef.id)?.knowledgeRefs || [];
    const added = actor.knowledgeRefs.filter((ref) => !before.includes(ref));
    if (added.length) changes.push(`${actor.displayName} 新增知识：${added.join("、")}`);
  }
  return changes;
}

function deltaSummary(delta: NuwaSceneStateDeltaR0): string[] {
  return [
    ...Object.entries(delta.locations).map(([actor, location]) => `${actor} 移动到 ${location}`),
    ...Object.entries(delta.resources).map(([resource, amount]) => `${resource} ${amount < 0 ? "消耗" : "增加"} ${Math.abs(amount)}`),
    ...Object.entries(delta.flags).map(([flag, value]) => `${flag}=${value}`)
  ];
}

function stepTimestamp(createdAt: string, step: number): string {
  const base = Date.parse(createdAt);
  if (!Number.isFinite(base)) return createdAt;
  return new Date(base + step * 1_000).toISOString();
}

function validateRunId(value: string): string {
  const normalized = String(value).trim();
  if (!/^[a-z0-9][a-z0-9-]{2,120}$/i.test(normalized)) throw new Error("Scene Run identifier is invalid.");
  return normalized;
}

function readSceneLedger(workspacePath: string, runId: string): NuwaSceneResolvedEventR0[] {
  const target = path.join(nuwaRunPath(workspacePath, runId), "scene-ledger.jsonl");
  if (!existsSync(target)) return [];
  assertRegularFile(target);
  return readFileSync(target, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as NuwaSceneResolvedEventR0);
}

function atomicJson(target: string, value: unknown): void {
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("Scene runtime target must not be a symbolic link.");
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${stableJson(value)}\n`, "utf8");
  renameSync(temporary, target);
}

function assertRegularFile(target: string): void {
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Scene runtime artifact must be a regular file.");
}
