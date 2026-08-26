export const NUWA_AGENT_ROLES = [
  "continuity",
  "character-arc",
  "causality",
  "foreshadowing",
  "tension",
  "evidence-critic"
] as const;

/** Fixed local seeds for the bounded author-loop rehearsal. */
export const NUWA_AUTHOR_LOOP_SEEDS = [1701, 2718, 3141] as const;

export type NuwaAgentRole = (typeof NUWA_AGENT_ROLES)[number];

/**
 * Nuwa is the single supervisory agent for a Story Intelligence run. Specialist
 * roles are bounded workers beneath this contract; they never own author choice.
 */
export const NUWA_ORCHESTRATION_IDENTITY = {
  kind: "supervisor-agent",
  name: "nuwa",
  authorDecisionRequired: true
} as const;

export type NuwaOrchestrationIdentity = typeof NUWA_ORCHESTRATION_IDENTITY;

export type NuwaRunStatus =
  | "planned"
  | "running"
  | "awaiting-results"
  | "synthesizing"
  | "ready-for-author-review"
  | "rejected"
  | "failed";

export type StorySnapshotNoteType =
  | "project"
  | "chapter"
  | "scene"
  | "character"
  | "location"
  | "event"
  | "rule"
  | "thread"
  | "keyframe"
  | "review";

export type StorySnapshotNote = {
  id: string;
  relativePath: string;
  type: StorySnapshotNoteType;
  title: string;
  status: string;
  links: string[];
  evidenceExcerpt: string;
};

export type StorySnapshot = {
  version: "world-os-story-snapshot-v1";
  project: StorySnapshotNote;
  currentChapter: StorySnapshotNote | null;
  currentScene: StorySnapshotNote | null;
  notes: StorySnapshotNote[];
  selectedNoteRefs: string[];
  openThreads: StorySnapshotNote[];
  lockedRules: StorySnapshotNote[];
  recentAcceptedChanges: StorySnapshotNote[];
  snapshotHash: string;
  deterministic: true;
};

export type NuwaBudget = {
  maxRoles: number;
  maxBranchProposalsPerTask: number;
  maxEvidenceExcerptsPerTask: number;
  maxBundleBranches: number;
};

export type NuwaAgentTask = {
  taskId: string;
  role: NuwaAgentRole;
  purpose: string;
  allowedNoteRefs: string[];
  forbiddenOperations: [
    "write-markdown",
    "write-workspace-state",
    "commit-story-change",
    "spawn-agent",
    "call-provider"
  ];
  expectedOutputSchema: "world-os-nuwa-agent-result-v1";
  evidenceRequired: true;
  maximumBranchProposals: number;
  maximumEvidenceExcerpts: number;
  writeScope: "none";
  noWrite: true;
  selectionReason: string;
  requirement: "required" | "optional";
  capabilityRequirements: string[];
};

export type NuwaPlan = {
  version: "world-os-nuwa-plan-v1";
  runId: string;
  snapshotHash: string;
  authorGoal: string;
  selectedRoles: NuwaAgentRole[];
  tasks: NuwaAgentTask[];
  budget: NuwaBudget;
  authorConfirmationRequired: true;
  runner: "deterministic" | "external";
  /** Optional replay seed; it changes run identity only and never grants write access. */
  seed?: number;
};

export type NuwaEvidenceReference = {
  evidenceId: string;
  noteId: string;
  relativePath: string;
  title: string;
  excerpt: string;
  noteType: StorySnapshotNoteType;
};

export type NuwaFinding = {
  id: string;
  category: "continuity" | "character" | "causality" | "foreshadowing" | "tension" | "evidence";
  summary: string;
  affectedNoteRefs: string[];
  evidenceIds: string[];
  support: "supported" | "unsupported";
  claim?: {
    key: string;
    value: string;
  };
};

export type NuwaRisk = {
  id: string;
  level: "low" | "medium" | "high";
  summary: string;
  evidenceIds: string[];
};

export type NuwaBranchStrategy = "immediate-reveal" | "partial-clue" | "delayed-reveal" | "preserve-current" | "custom";

export type NuwaBranchProposal = {
  id: string;
  strategy: NuwaBranchStrategy;
  title: string;
  summary: string;
  immediateConsequence: string;
  mediumTermConsequence: string;
  longTermPressure: string;
  affectedNoteRefs: string[];
  preservedMysteries: string[];
  risks: NuwaRisk[];
  evidenceIds: string[];
  assumptions: string[];
  sourceRole: NuwaAgentRole;
};

export type NuwaAgentResult = {
  version: "world-os-nuwa-agent-result-v1";
  runId: string;
  snapshotHash: string;
  taskId: string;
  role: NuwaAgentRole;
  findings: NuwaFinding[];
  proposedBranches: NuwaBranchProposal[];
  risks: NuwaRisk[];
  evidence: NuwaEvidenceReference[];
  unsupportedAssumptions: string[];
  confidence: "low" | "medium" | "high";
  writeScope: "none";
};

export type NuwaDisagreement = {
  id: string;
  claimKey: string;
  positions: Array<{
    role: NuwaAgentRole;
    value: string;
    findingId: string;
  }>;
  resolution: "author-review-required";
};

export type StoryPredictionBranch = {
  id: string;
  strategy: NuwaBranchStrategy;
  title: string;
  summary: string;
  immediateConsequence: string;
  mediumTermConsequence: string;
  longTermPressure: string;
  affectedObjects: string[];
  preservedMysteries: string[];
  risks: NuwaRisk[];
  evidence: NuwaEvidenceReference[];
  assumptions: string[];
  unsupported: boolean;
  sourceAgentRoles: NuwaAgentRole[];
};

export type StoryPredictionBundle = {
  version: "world-os-story-prediction-bundle-v1";
  runId: string;
  snapshotHash: string;
  authorGoal: string;
  branches: StoryPredictionBranch[];
  sharedEvidence: NuwaEvidenceReference[];
  disagreements: NuwaDisagreement[];
  unsupportedAssumptions: string[];
  authorDecisionRequired: true;
  runnerLabel: "本地规则推演" | "外部结果待核验";
  deterministic: boolean;
  coverage: {
    completeness: "complete" | "partial";
    validatedResultCount: number;
    missingRequiredRoles: NuwaAgentRole[];
    missingOptionalRoles: NuwaAgentRole[];
  };
  /** Three isolated author-loop futures projected from child Run Packs. */
  candidateRuns?: NuwaCandidateFutureRun[];
};

export type NuwaCandidateFutureRun = {
  version: "story-studio-nuwa-candidate-future-run/v1";
  candidateId: string;
  runId: string;
  parentRunId: string;
  seed: number;
  snapshotHash: string;
  startingRevision: string;
  branchId: string;
  branch: StoryPredictionBranch;
  actorDecisionSequence: string[];
  beatEvolution: string[];
  stateDiff: string[];
  causalChain: string[];
  checkpoint: string;
  unresolvedRisks: string[];
  sourceRefs: string[];
  traceHash: string;
  knowledgeBoundary: {
    rule: string;
    unknownBeforeCheckpoint: string[];
  };
  cost: { modelCalls: 0; provider: "deterministic"; estimatedUsd: 0 };
  status: "candidate" | "rejected" | "selected" | "promoted";
};

export type NuwaRunRecord = {
  version: "world-os-nuwa-run-v1";
  runId: string;
  snapshotHash: string;
  authorGoal: string;
  selectedScenePath: string | null;
  status: NuwaRunStatus;
  plan: NuwaPlan;
  resultTaskIds: string[];
  authorConfirmationRequired: true;
  runner: "deterministic" | "external";
};

export type NuwaAuthorReview = {
  version: "world-os-nuwa-author-review-v1";
  runId: string;
  branchId: string;
  snapshotHash: string;
  status: "awaiting-author-decision";
  authorDecisionRequired: true;
  decisionWorkspace: unknown;
  impactReport: unknown;
  evidenceProjection: unknown;
  changePreview: null;
  mutatesMarkdown: false;
};

export type StoryIntelligenceBenchmarkCase = {
  id: string;
  authorGoal: string;
  expected: {
    requiresRuleConflict?: boolean;
    requiresLongTermPressure?: boolean;
    requiresUnsupportedAssumption?: boolean;
    requiresDisagreement?: boolean;
    requiresDuplicateMerge?: boolean;
  };
};

export type StoryIntelligenceBenchmarkResult = {
  version: "world-os-story-intelligence-benchmark-v1";
  runner: "deterministic";
  cases: Array<{
    id: string;
    metrics: Record<string, number | boolean>;
    passed: boolean;
  }>;
  aggregate: Record<string, number | boolean>;
  limitations: ["deterministic-baseline-only", "not-model-quality-evidence"];
  executionFacts: {
    liveModelExecutions: 0;
    modelQualityComparison: "not-performed";
  };
  metricClassification: Record<string, "deterministic-assertion" | "machine-scored-heuristic" | "requires-human-review" | "live-model-operational" | "unavailable">;
};
