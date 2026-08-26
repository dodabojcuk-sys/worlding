/**
 * Browser-safe DTO for the bounded Nuwa fixture transport.
 *
 * The client deliberately owns no runtime implementation. This shape mirrors
 * the server projection at the HTTP boundary so browser code never imports the
 * Story Intelligence runtime or its filesystem dependencies.
 */
export type NuwaBoundedLifecycle = "draft" | "ready" | "running" | "paused" | "completed" | "cancelled" | "failed" | "superseded";

type BoundedStorySnapshot = {
  version: "tianyan-bounded-story-snapshot-r0/v1";
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
  characterKnowledgeBoundaries: Array<{
    characterId: string;
    displayName: string;
    claims: Array<{ claimId: string; label: string; stance: "known" | "believed" | "suspected" | "misinformation" | "unknown"; sourceAnchorIds: string[] }>;
    explicitlyExcludedClaimIds: string[];
  }>;
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

type NuwaBoundedStep = {
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
  constraintChecks: Array<{ checkId: string; label: string; outcome: "pass" | "reject" | "warning"; explanation: string }>;
  createdBy: "fixture-director" | "author-steering";
  status: "accepted" | "rejected";
  receipt: { receiptId: string; operationId: string; integrity: string; createdAt: string };
};

type NuwaBoundedBranch = {
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

type NuwaCandidateHandoff = {
  handoffId: string;
  candidateId: string;
  sourceRunId: string;
  sourceBranchId: string;
  sourceStepId: string;
  status: "candidate" | "sent-review" | "rejected" | "integrated";
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

export type NuwaBoundedProjection = {
  version: "tianyan-nuwa-bounded-scenario-r0/v1";
  runId: string;
  snapshot: BoundedStorySnapshot | null;
  lifecycle: NuwaBoundedLifecycle;
  stale: boolean;
  integrityStatus: "unfrozen" | "current" | "mismatch" | "missing-reference";
  activeBranchId: string;
  branches: NuwaBoundedBranch[];
  receipts: Array<{
    receiptId: string;
    operationId: string;
    kind: "create" | "freeze" | "start" | "step" | "pause" | "resume" | "cancel" | "fork" | "handoff" | "integrate" | "view";
    branchId: string | null;
    sequence: number | null;
    createdAt: string;
    integrity: string;
  }>;
  handoff: NuwaCandidateHandoff | null;
  viewState: { selectedStepId: string | null; compareBranchIds: [string, string] | null; activeTool: "observation" | "branch" | "compare" | "review" | "controls"; dockOpen: boolean };
  providerCalls: 0;
  pluginCalls: 0;
  createdAt: string;
  updatedAt: string;
  activeBranch: NuwaBoundedBranch;
  selectedStep: NuwaBoundedStep | null;
  comparison: {
    leftBranchId: string;
    rightBranchId: string;
    sharedPrefixStep: number;
    rows: Array<{ category: "event" | "character-action" | "knowledge" | "belief" | "world-state" | "relation" | "object" | "open-question" | "source" | "rule-conflict"; left: string; right: string; status: "confirmed-baseline" | "nuwa-rehearsal" | "temporary-branch" | "pending-review" | "rejected" }>;
    endings: { left: string; right: string };
  } | null;
  overlay: {
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
      status: "candidate" | "sent-review" | "rejected" | "integrated";
    }>;
  } | null;
  replay: { matches: boolean; stepsIntegrity: string; receiptIntegrity: string; providerCalls: 0 };
  canHandoff: boolean;
  submissionBlocker: string | null;
};
