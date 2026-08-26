import { stableHash } from "./storySnapshotBuilder.ts";
import { STORY_MEMORY_RECALL_SKILL_ID } from "../skillControl/storyMemoryRecallSkillManifest.ts";
import {
  NUWA_AGENT_ROLES,
  type NuwaAgentRole,
  type NuwaAgentTask,
  type NuwaBudget,
  type NuwaPlan,
  type StorySnapshot,
  type StorySnapshotNoteType
} from "./storyIntelligenceTypes.ts";

const DEFAULT_BUDGET: NuwaBudget = {
  maxRoles: 5,
  maxBranchProposalsPerTask: 2,
  maxEvidenceExcerptsPerTask: 4,
  maxBundleBranches: 5
};

const ROLE_PURPOSE: Record<NuwaAgentRole, string> = {
  continuity: "Check timeline order, current scene constraints, and locked rules.",
  "character-arc": "Check character goals, relationship pressure, and arc continuity.",
  causality: "Trace immediate, medium-term, and long-term consequences.",
  foreshadowing: "Check clue pacing, unresolved threads, and mystery preservation.",
  tension: "Check resistance, cost, choice pressure, and dramatic escalation.",
  "evidence-critic": "Check that proposals do not claim facts absent from the Markdown snapshot."
};

export function createNuwaPlan(input: {
  snapshot: StorySnapshot;
  authorGoal: string;
  budget?: Partial<NuwaBudget>;
  allowedRoles?: NuwaAgentRole[];
  runKey?: string;
  runner?: NuwaPlan["runner"];
  seed?: number;
}): NuwaPlan {
  const budget = { ...DEFAULT_BUDGET, ...input.budget };
  const allowedRoles = input.allowedRoles ? new Set(input.allowedRoles) : null;
  const selectedRoles = selectNuwaRoles(input.authorGoal, input.snapshot)
    .filter((role) => !allowedRoles || allowedRoles.has(role))
    .slice(0, budget.maxRoles);
  if (selectedRoles.length === 0) throw new Error("Nuwa planning requires at least one allowed specialist role.");
  const runId = `nuwa-run-${stableHash({ snapshotHash: input.snapshot.snapshotHash, authorGoal: input.authorGoal, ...(input.runKey ? { runKey: input.runKey } : {}), ...(input.seed === undefined ? {} : { seed: input.seed }) }).slice(0, 12)}`;

  return {
    version: "world-os-nuwa-plan-v1",
    runId,
    snapshotHash: input.snapshot.snapshotHash,
    authorGoal: input.authorGoal.trim(),
    selectedRoles,
    tasks: selectedRoles.map((role, index) => createTask({ role, index, snapshot: input.snapshot, budget })),
    budget,
    authorConfirmationRequired: true,
    runner: input.runner ?? "deterministic",
    ...(input.seed === undefined ? {} : { seed: input.seed })
  };
}

export function selectNuwaRoles(authorGoal: string, snapshot: StorySnapshot): NuwaAgentRole[] {
  const selected = new Set<NuwaAgentRole>();
  const value = authorGoal.toLowerCase();
  const hasRelationshipChange = includesAny(value, ["关系", "信任", "怀疑", "告诉", "透露", "背叛", "联盟"]);
  const hasMysteryPressure = includesAny(value, ["秘密", "线索", "悬念", "谜", "伏笔", "地下"]);
  const hasLongTermPressure = includesAny(value, ["长期", "后续", "未来", "第", "章节", "终局", "多年"]);
  const hasStatusChange = includesAny(value, ["死亡", "受伤", "失踪", "身份", "离开", "获得"]);
  const hasRulePressure = includesAny(value, ["规则", "不得", "必须", "潮门", "时代", "技术"])
    || snapshot.lockedRules.some((note) => value.includes(note.title.toLowerCase()));

  if (hasRelationshipChange) addRoles(selected, ["character-arc", "causality", "evidence-critic"]);
  if (hasMysteryPressure) addRoles(selected, ["foreshadowing", "continuity", "evidence-critic"]);
  if (hasLongTermPressure) addRoles(selected, ["causality", "continuity", "character-arc", "tension", "evidence-critic"]);
  if (hasStatusChange) addRoles(selected, ["continuity", "character-arc", "causality", "evidence-critic"]);
  if (hasRulePressure) addRoles(selected, ["continuity", "causality", "evidence-critic"]);
  if (selected.size === 0) addRoles(selected, ["causality", "tension", "evidence-critic"]);

  return [...selected].sort((left, right) => NUWA_AGENT_ROLES.indexOf(left) - NUWA_AGENT_ROLES.indexOf(right));
}

function createTask(input: {
  role: NuwaAgentRole;
  index: number;
  snapshot: StorySnapshot;
  budget: NuwaBudget;
}): NuwaAgentTask {
  return {
    taskId: `nuwa-task-${String(input.index + 1).padStart(2, "0")}-${input.role}`,
    role: input.role,
    purpose: ROLE_PURPOSE[input.role],
    allowedNoteRefs: allowedNoteRefs(input.role, input.snapshot),
    forbiddenOperations: [
      "write-markdown",
      "write-workspace-state",
      "commit-story-change",
      "spawn-agent",
      "call-provider"
    ],
    expectedOutputSchema: "world-os-nuwa-agent-result-v1",
    evidenceRequired: true,
    maximumBranchProposals: input.budget.maxBranchProposalsPerTask,
    maximumEvidenceExcerpts: input.budget.maxEvidenceExcerptsPerTask,
    writeScope: "none",
    noWrite: true,
    selectionReason: selectionReason(input.role, input.snapshot),
    requirement: input.index === 0 || input.role === "evidence-critic" ? "required" : "optional",
    capabilityRequirements: input.role === "evidence-critic" ? [STORY_MEMORY_RECALL_SKILL_ID] : []
  };
}

function allowedNoteRefs(role: NuwaAgentRole, snapshot: StorySnapshot): string[] {
  const allowedTypes: Record<NuwaAgentRole, StorySnapshotNoteType[]> = {
    continuity: ["chapter", "scene", "event", "rule", "thread", "keyframe"],
    "character-arc": ["character", "chapter", "scene", "thread"],
    causality: ["chapter", "scene", "event", "rule", "thread", "character"],
    foreshadowing: ["thread", "scene", "chapter", "event", "rule"],
    tension: ["scene", "chapter", "thread", "character", "event"],
    "evidence-critic": ["project", "chapter", "scene", "character", "location", "event", "rule", "thread", "keyframe", "review"]
  };
  const selected = new Set(snapshot.selectedNoteRefs);
  const accepted = new Set(snapshot.recentAcceptedChanges.map((note) => note.relativePath));
  const paths = snapshot.notes
    .filter((note) => allowedTypes[role].includes(note.type))
    .filter((note) => selected.size === 0 || selected.has(note.relativePath) || accepted.has(note.relativePath) || note.type === "rule" || note.type === "thread")
    .map((note) => note.relativePath);

  return [...new Set([snapshot.project.relativePath, ...paths])].sort();
}

function selectionReason(role: NuwaAgentRole, snapshot: StorySnapshot): string {
  if (role === "foreshadowing") return `${snapshot.openThreads.length} unresolved Markdown thread(s) need pacing review.`;
  if (role === "continuity") return `${snapshot.lockedRules.length} locked Markdown rule(s) need consistency review.`;
  if (role === "evidence-critic") return "Every proposal must remain traceable to the Markdown snapshot.";
  return ROLE_PURPOSE[role];
}

function addRoles(target: Set<NuwaAgentRole>, roles: NuwaAgentRole[]): void {
  for (const role of roles) target.add(role);
}

function includesAny(value: string, values: string[]): boolean {
  return values.some((item) => value.includes(item.toLowerCase()));
}
