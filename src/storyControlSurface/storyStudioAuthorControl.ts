import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeStoryImpactReport } from "../domainTemplates/storyWorld/analysis/index.ts";
import { buildStoryChangePreview } from "../domainTemplates/storyWorld/changePreview/index.ts";
import { commitStoryEvent } from "../domainTemplates/storyWorld/commit/index.ts";
import { createStoryDecisionWorkspace, resolveAuthorDecision } from "../domainTemplates/storyWorld/decision/index.ts";
import { projectStoryEvidenceForAuthor, resolveStoryEvidenceBundle } from "../domainTemplates/storyWorld/evidence/index.ts";
import { createStoryAuthorIntent, type StoryAuthorIntent } from "../domainTemplates/storyWorld/intent/index.ts";
import {
  buildStoryProjectFromSnapshot,
  buildStorySnapshot,
  buildNuwaAuthorReview,
  buildNuwaReviewContext,
  createAuthorLoopCandidate,
  createNuwaCandidateAuthorViewModel,
  createNuwaExecutionBackend,
  createNuwaPlan,
  createNuwaRunPack,
  executeNuwaPlanWithBackend,
  getNuwaSynthesisReadiness,
  ensureAuthorLoopBranches,
  NUWA_AUTHOR_LOOP_SEEDS,
  readNuwaBackendManifest,
  readNuwaRunPack,
  readNuwaStandaloneSandboxContext,
  stableHash,
  synthesizeNuwaResults,
  writeNuwaAuthorReview,
  writeNuwaExecutionOutcome,
  writeNuwaPredictionBundle,
  writeNuwaStandaloneSandboxContext,
  type StoryPredictionBranch,
  type NuwaCandidateFutureRun,
  type NuwaCandidateAuthorViewModel,
  type NuwaAttentionContext,
  type StorySnapshot,
  type NuwaExecutionOutcome,
  type NuwaStandaloneSandboxAgent
} from "../storyIntelligence/index.ts";
import {
  publishFileNoReplace,
  readExistingUtf8,
  replaceFileAtomically,
  type AtomicFileBoundary
} from "./atomicNoReplaceFile.ts";
import {
  createStoryStudioWorkspaceOperations,
  type StoryStudioWorldObject
} from "./storyStudioWorkspaceOperations.ts";
import { createStoryStudioRelationOperations } from "./storyStudioRelationOperations.ts";
import type { DraftCreationReceipt, PredictionRun, PredictionRelationReceiptItem } from "../storyContracts/multiNodePrediction.ts";

const REVIEW_VERSION = "story-studio-impact-review/v1";
const CHANGE_SET_VERSION = "story-studio-author-change-set/v1";
const APPLY_INTENT_VERSION = "story-studio-author-change-set-apply-intent/v1";
const APPLY_CONTRACT_VERSION = "author-change-set-crash-safe-event-apply/v0";
const EXPLORATION_VERSION = "story-studio-nuwa-exploration/v1";
const CANDIDATE_REVIEW_VERSION = "story-studio-candidate-review/v1";

export type StoryStudioCandidateReview = {
  version: "story-studio-candidate-review-product/v1";
  id: string;
  projectId: string;
  status: "awaiting" | "rejected" | "accepted" | "abandoned";
  result: {
    version: "tianyan-golden-loop-candidate/v1";
    status: "candidate";
    tianyi: unknown;
    nuwa: { candidates: Array<{ id: string; title: string; change: string; after: string }> };
    candidateRuns?: Array<Pick<NuwaCandidateFutureRun, "candidateId" | "runId" | "seed" | "startingRevision" | "traceHash" | "status">>;
    provider: unknown;
    contextPack: { id: string; sources: Array<{ id: string; type: string; label: string }>; budgets: { maximumSources: number; maximumCharacters: number } };
    contextReceiptId?: string;
    nuwaRunId?: string;
  };
  candidates: Array<{
    id: string;
    title: string;
    summary: string;
    status: "awaiting" | "rejected" | "accepted";
    rejectionReason: string | null;
    confirmationReceipt: null | { planningEventId: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string };
  }>;
  sourceSummary: string[];
  contextPackId: string;
  createdAt: string;
  updatedAt: string;
};

export type StoryStudioCandidateReviewHistoryEntry = StoryStudioCandidateReview & {
  lifecycleStatus: "awaiting" | "rejected" | "accepted" | "abandoned" | "superseded";
};

export type StoryStudioPredictionReview = {
  version: "story-studio-prediction-review/v1";
  id: string;
  projectId: string;
  runId: string;
  pathId: string;
  selectedCandidateNodeIds: string[];
  status: "reviewing" | "drafted";
  receipt: unknown | null;
  updatedAt: string;
};

type PersistedCandidateReview = Omit<StoryStudioCandidateReview, "version"> & {
  version: typeof CANDIDATE_REVIEW_VERSION;
};

type PersistedReviewSource =
  | { kind: "scene"; id: string; relativeId: string; title: string; revisionToken: string }
  | { kind: "planning-event"; id: string; relativeId: string; title: string; revisionToken: string };

type PersistedImpactReview = {
  version: typeof REVIEW_VERSION;
  reviewId: string;
  projectId: string;
  source: PersistedReviewSource;
  sceneId?: string;
  sceneRelativeId?: string;
  sceneTitle?: string;
  sceneRevisionToken?: string;
  snapshotHash: string;
  authorGoal: string;
  origin?: { kind: "author" | "nuwa-route" | "planning-event"; label: string };
  validatedEvidence?: Array<{
    evidenceId: string;
    noteId: string;
    relativePath: string;
    title: string;
    excerpt: string;
    coveredImpactRefs: string[];
  }>;
  intent: StoryAuthorIntent;
  report: ReturnType<typeof analyzeStoryImpactReport>;
  evidenceBundle: ReturnType<typeof resolveStoryEvidenceBundle>;
  decisionWorkspace: ReturnType<typeof createStoryDecisionWorkspace>;
  resolution: ReturnType<typeof resolveAuthorDecision> | null;
  preview: ReturnType<typeof buildStoryChangePreview> | null;
  status: "pending" | "selected" | "rejected";
};

type PersistedAuthorChangeSet = {
  version: typeof CHANGE_SET_VERSION;
  changeSetId: string;
  reviewId: string;
  projectId: string;
  source: PersistedReviewSource;
  sourceScene?: { id: string; relativeId: string; title: string };
  baseline: {
    snapshotHash: string;
    sourceRevisionToken: string;
    sceneRevisionToken?: string;
    objectRevisions: Array<{ objectId: string; revisionToken: string }>;
  };
  affectedNoteIds: string[];
  structuredChanges: Array<{ id: string; summary: string; evidenceRefs: string[] }>;
  evidenceRefs: string[];
  before: string[];
  change: string[];
  after: string[];
  authorDecision: { optionId: string; label: string; status: "accepted" | "modified" };
  candidate: NonNullable<ReturnType<typeof resolveAuthorDecision>["commitCandidate"]>;
  status: "pending" | "applying" | "applied" | "abandoned" | "stale";
  application: {
    mode: "single-event-record";
    reason: string;
    appliedEventId: string | null;
    markdownWrites: number;
  };
};

type PersistedApplyIntent = {
  version: typeof APPLY_INTENT_VERSION;
  contractVersion: typeof APPLY_CONTRACT_VERSION;
  projectId: string;
  changeSetId: string;
  changeSetRevision: string;
  authorDecisionRef: string;
  applyOperationKey: string;
  targetEventRef: string;
  intentHash: string;
  event: {
    id: string;
    relativePath: string;
    title: string;
    status: "committed";
    tags: ["作者确认"];
    plannedFrom: string | null;
    body: string;
    provenance: {
      sourceChangeSetId: string;
      sourceChangeSetRevision: string;
      authorDecisionRef: string;
      applyOperationKey: string;
      intentHash: string;
    };
  };
};

export type AuthorChangeSetApplyFaultPoint =
  | "before-intent-publish"
  | "intent-temporary-durable"
  | "intent-final-published"
  | "after-intent-durable"
  | "applying-temporary-durable"
  | "applying-final-published"
  | "event-temporary-durable"
  | "event-final-published"
  | "event-index-persisted"
  | "event-operation-persisted"
  | "event-state-persisted"
  | "event-revision-persisted"
  | "before-applied-persist"
  | "applied-temporary-durable"
  | "applied-final-published"
  | "after-applied-durable"
  | "before-response";

export type AuthorChangeSetApplyErrorCode =
  | "APPLY_INTENT_MISMATCH"
  | "CHANGESET_REVISION_DRIFT"
  | "EVENT_ID_COLLISION"
  | "EVENT_PROVENANCE_MISMATCH"
  | "MULTIPLE_EVENTS_FOR_OPERATION"
  | "APPLIED_EVENT_MISSING"
  | "LEGACY_APPLYING_UNRECOVERABLE"
  | "ATOMIC_PUBLISH_UNSUPPORTED"
  | "CONCURRENT_APPLY_CONFLICT";

export class AuthorChangeSetApplyError extends Error {
  readonly code: AuthorChangeSetApplyErrorCode;

  constructor(code: AuthorChangeSetApplyErrorCode, message: string) {
    super(message);
    this.name = "AuthorChangeSetApplyError";
    this.code = code;
  }
}

type PersistedNuwaExploration = {
  version: typeof EXPLORATION_VERSION;
  explorationId: string;
  projectId: string;
  sceneId: string;
  sceneRelativeId: string;
  sceneTitle: string;
  sceneRevisionToken: string;
  snapshotHash: string;
  canonicalSnapshotHash?: string;
  authorGoal: string;
  runId: string;
  status: "planned" | "running" | "ready-to-synthesize" | "ready-for-review" | "submitted-to-impact" | "cancelled";
  selectedRouteIndex: number | null;
  reviewId: string | null;
  contextReceiptId?: string;
  /** Child Run Packs for the bounded three-future author loop. */
  candidateRuns?: Array<{
    candidateId: string;
    runId: string;
    seed: number;
    snapshotHash: string;
    status: NuwaCandidateFutureRun["status"];
    branchId?: string;
    traceHash?: string;
  }>;
  /** Missing on existing records means this is a scene-bound exploration. */
  sourceKind?: "scene" | "standalone";
};

export type StoryStudioImpactReview = {
  version: "story-studio-impact-review-product/v1";
  id: string;
  status: "pending" | "selected" | "rejected" | "stale";
  source: {
    kind: "scene" | "planning-event";
    id: string;
    title: string;
    sceneId: string;
    sceneTitle: string;
    planningEventId: string | null;
    authorGoal: string;
    involvedObjects: Array<{ id: string; title: string; type: string }>;
    lockedRules: string[];
    originLabel: string;
  };
  impact: {
    characters: Array<{ id: string; summary: string }>;
    events: Array<{ id: string; summary: string }>;
    relationships: Array<{ id: string; summary: string }>;
    rulesAndLocations: Array<{ id: string; summary: string }>;
    risks: string[];
    opportunities: string[];
    evidenceCoverage: string;
    evidenceCount: number;
  };
  options: Array<{
    id: string;
    label: string;
    summary: string;
    consequence: string;
    riskLevel: "low" | "medium" | "high";
    selected: boolean;
  }>;
  evidence: Array<{ title: string; explanation: string; sources: string[] }>;
  preview: null | {
    before: string[];
    change: string[];
    after: string[];
    longTermPressure: string[];
    preservedMysteries: string[];
    assumptions: string[];
  };
  authorChoice: null | { label: string; status: "selected" | "rejected" };
  canCreateChangeSet: boolean;
  mutatesMarkdown: false;
};

export type StoryStudioAuthorChangeSet = {
  version: "story-studio-author-change-set-product/v1";
  id: string;
  reviewId: string;
  status: "pending" | "applying" | "applied" | "abandoned" | "stale";
  source: { sceneId: string; sceneTitle: string };
  affectedNoteIds: string[];
  changes: Array<{ id: string; summary: string; evidenceCount: number }>;
  before: string[];
  change: string[];
  after: string[];
  authorDecision: { label: string; status: "accepted" | "modified" };
    application: {
      canApply: boolean;
      reason: string;
      eventRecorded: boolean;
      appliedEventId: string | null;
      markdownWrites: number;
    sceneProseChanged: false;
    objectNotesChanged: false;
    projectedEffects: string[];
  };
};

export type StoryStudioReviewHistory = {
  version: "story-studio-review-history-product/v1";
  entries: Array<{
    reviewId: string;
    changeSetId: string | null;
    sourceScene: string;
    sourceKind: "作者想法" | "女娲候选路线" | "规划事件";
    authorGoal: string;
    authorChoice: string;
    evidenceCoverage: string;
    changeStatus: string;
    eventStatus: "世界事件已记录" | "尚未写入世界事件" | "已放弃";
    stale: boolean;
  }>;
};

export type StoryStudioNuwaExploration = {
  version: "story-studio-exploration-product/v1";
  id: string;
  status: "planned" | "running" | "ready-to-synthesize" | "ready-for-review" | "submitted-to-impact" | "cancelled" | "stale";
  source: { kind: "scene" | "standalone"; sceneId: string; sceneTitle: string; authorGoal: string };
  supervisor: { label: "女娲"; role: string; authorDecisionRequired: true };
  specialists: Array<{ label: string; purpose: string; requirement: "required" | "optional"; status: "等待" | "检查中" | "已核验" | "不可用" }>;
  progress: { completed: number; total: number; coverage: "完整" | "部分" | "尚未开始" };
  routes: Array<{
    id: string;
    title: string;
    summary: string;
    immediateConsequence: string;
    mediumTermConsequence: string;
    longTermPressure: string;
    preservedMysteries: string[];
    risks: string[];
    assumptions: string[];
    affectedObjectIds: string[];
    selected: boolean;
    candidateStatus?: "candidate" | "rejected" | "selected" | "promoted";
    authorView?: NuwaCandidateAuthorViewModel;
    candidateRun?: {
      candidateId: string;
      runId: string;
      seed: number;
      startingRevision: string;
      actorDecisionSequence: string[];
      beatEvolution: string[];
      stateDiff: string[];
      causalChain: string[];
      checkpoint: string;
      unresolvedRisks: string[];
      sourceRefs: string[];
      traceHash: string;
      knowledgeBoundary: NuwaCandidateFutureRun["knowledgeBoundary"];
      cost: NuwaCandidateFutureRun["cost"];
    };
  }>;
  capability: { label: string; detail: string };
  primaryAction: "开始推演" | "整理候选路线" | "选择候选路线" | "查看影响评审" | "重新规划";
  canRun: boolean;
  canSynthesize: boolean;
  canSubmitRoute: boolean;
  mutatesMarkdown: false;
  modelCalls: 0;
  standaloneSandbox?: {
    story: string;
    depth: "short" | "medium" | "long";
    agents: Array<{ id: string; displayName: string; kind: "existing-character" | "temporary-character"; objectId: string | null }>;
  };
};

export type StoryStudioIntelligenceOverlay = {
  version: "story-studio-intelligence-overlay-product/v1";
  explorationId: string;
  routeId: string;
  evidence: Array<{ objectId: string; label: string }>;
  risks: Array<{ objectId: string; label: string; level: string }>;
  candidateChanges: Array<{ objectId: string; label: string; changeType: "candidate" }>;
  mapProjection: { hasSpatialChanges: boolean; message: string };
  source: "validated-prediction-bundle";
  readOnly: true;
};

export type StoryStudioAuthorControl = ReturnType<typeof createStoryStudioAuthorControl>;

export function createStoryStudioAuthorControl(input: {
  rootPath: string;
  stateFilePath: string;
  now?: () => string;
  faultInjector?: (
    point: AuthorChangeSetApplyFaultPoint,
    context: { projectId: string; changeSetId: string; applyOperationKey: string; targetEventRef: string }
  ) => void;
}) {
  const workspace = createStoryStudioWorkspaceOperations(input);
  const relations = createStoryStudioRelationOperations({ workspaceOperations: workspace, verifyCanonEventRead: ({ projectId, eventId }) => isVerifiedCanonEventRead(projectId, eventId) });
  const now = input.now ?? (() => new Date().toISOString());

  /**
   * A read-only projection for surfaces that may show Canon facts.  It deliberately
   * reuses the crash-safe apply proof rather than treating mutable event fields as
   * evidence of author confirmation.
   */
  function isVerifiedCanonEventRead(projectId: string, eventId: string): boolean {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId });
    return verifyCanonEventRead(workspace, projectPath, projectId, eventId);
  }

  function createReviewForSource(reviewInput: {
    projectId: string;
    source: PersistedReviewSource;
    authorGoal: string;
    selectedObjectIds: string[];
    origin: NonNullable<PersistedImpactReview["origin"]>;
  }): StoryStudioImpactReview {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: reviewInput.projectId });
    const authorGoal = requireText(reviewInput.authorGoal, "Author goal", 1000);
    const snapshot = buildSnapshotForReviewSource(projectPath, reviewInput.source);
    const selectedIds = new Set(reviewInput.selectedObjectIds);
    const intent = createStoryAuthorIntent({
      id: `story-studio-intent-${stableHash({ snapshotHash: snapshot.snapshotHash, source: reviewInput.source.id, authorGoal }).slice(0, 16)}`,
      content: authorGoal,
      source: "author",
      targetScope: targetScopeFor(authorGoal),
      createdAtLogical: snapshot.notes.length,
      relatedCharacters: noteIds(snapshot, selectedIds, "character"),
      relatedEvents: noteIds(snapshot, selectedIds, "event"),
      relatedLocations: noteIds(snapshot, selectedIds, "location")
    });
    const project = buildStoryProjectFromSnapshot(snapshot);
    const report = analyzeStoryImpactReport(project, intent);
    const evidenceBundle = resolveStoryEvidenceBundle(project, report);
    const decisionWorkspace = createStoryDecisionWorkspace(report);
    const reviewId = `impact-review-${stableHash({ projectId: reviewInput.projectId, sourceKind: reviewInput.source.kind, sourceId: reviewInput.source.id, snapshotHash: snapshot.snapshotHash, authorGoal }).slice(0, 16)}`;
    const artifact: PersistedImpactReview = {
      version: REVIEW_VERSION,
      reviewId,
      projectId: reviewInput.projectId,
      source: reviewInput.source,
      snapshotHash: snapshot.snapshotHash,
      authorGoal,
      origin: reviewInput.origin,
      validatedEvidence: [],
      intent,
      report,
      evidenceBundle,
      decisionWorkspace,
      resolution: null,
      preview: null,
      status: "pending"
    };
    writeReview(projectPath, artifact);
    return projectReview(artifact, snapshot, false);
  }

  function createCandidateReviewArtifact(reviewInput: {
    projectId: string;
    result: StoryStudioCandidateReview["result"];
    createdAt: string;
    minimumCandidates?: number;
  }): StoryStudioCandidateReview {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: reviewInput.projectId });
    const createdAt = requireTimestamp(reviewInput.createdAt);
    const contextPackId = requireText(reviewInput.result.contextPack.id, "Context Pack identifier", 180);
    const reviewId = `candidate-review-${stableHash({ projectId: reviewInput.projectId, contextPackId, candidates: reviewInput.result.nuwa.candidates.map((candidate) => candidate.id) }).slice(0, 16)}`;
    const existing = readCandidateReview(projectPath, reviewId);
    if (existing) return projectCandidateReview(existing);
    const candidates = reviewInput.result.nuwa.candidates.map((candidate) => ({
      id: requireText(candidate.id, "Candidate identifier", 100),
      title: requireText(candidate.title, "Candidate title", 160),
      summary: requireText(candidate.after || candidate.change, "Candidate summary", 800),
      status: "awaiting" as const,
      rejectionReason: null,
      confirmationReceipt: null
    }));
    if (candidates.length < (reviewInput.minimumCandidates ?? 2) || new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
      throw new Error("Candidate Review requires distinct candidate routes.");
    }
    const artifact: PersistedCandidateReview = {
      version: CANDIDATE_REVIEW_VERSION,
      id: reviewId,
      projectId: reviewInput.projectId,
      status: "awaiting",
      result: structuredClone(reviewInput.result),
      candidates,
      sourceSummary: reviewInput.result.contextPack.sources.map((source) => `${source.type} · ${source.label}`).slice(0, 16),
      contextPackId,
      createdAt,
      updatedAt: createdAt
    };
    writeCandidateReview(projectPath, artifact);
    return projectCandidateReview(artifact);
  }

  function decideCandidateReviewArtifact(decisionInput: {
    projectId: string;
    reviewId: string;
    candidateId: string;
    decision: "rejected" | "accepted";
    reason?: string;
    confirmationReceipt?: { planningEventId?: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string };
    decidedAt: string;
  }): StoryStudioCandidateReview {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: decisionInput.projectId });
    const artifact = requireCandidateReview(projectPath, decisionInput.reviewId);
    if (artifact.projectId !== decisionInput.projectId) throw new Error("Candidate Review belongs to another project.");
    if (artifact.status === "abandoned") throw new Error("Abandoned Candidate Review is read-only.");
    const candidate = artifact.candidates.find((item) => item.id === decisionInput.candidateId);
    if (!candidate) throw new Error("Candidate Review route does not exist.");
    if (candidate.status !== "awaiting" && candidate.status !== decisionInput.decision) {
      throw new Error("Candidate Review route already has a different author decision.");
    }
    const confirmationReceipt = decisionInput.decision === "accepted"
      ? normalizeCandidateConfirmationReceipt({
        ...decisionInput.confirmationReceipt,
        contextReceiptId: artifact.result.contextReceiptId,
        nuwaRunId: artifact.result.nuwaRunId
      })
      : null;
    const rejectionReason = decisionInput.decision === "rejected"
      ? requireText(decisionInput.reason || "作者拒绝此候选；未写入故事事实。", "Candidate rejection reason", 500)
      : null;
    const candidates = artifact.candidates.map((item) => item.id === candidate.id
      ? { ...item, status: decisionInput.decision, rejectionReason, confirmationReceipt }
      : item);
    if (decisionInput.decision === "accepted" && candidates.some((item) => item.id !== candidate.id && item.status === "accepted")) {
      throw new Error("Candidate Review already contains an accepted route.");
    }
    const next: PersistedCandidateReview = {
      ...artifact,
      status: decisionInput.decision === "accepted"
        ? "accepted"
        : candidates.every((item) => item.status === "rejected") ? "rejected" : "awaiting",
      candidates,
      updatedAt: requireTimestamp(decisionInput.decidedAt)
    };
    writeCandidateReview(projectPath, next);
    return projectCandidateReview(next);
  }

  return {
    readPredictionReview(input: { projectId: string; reviewId: string }): StoryStudioPredictionReview | null {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
      const reviewId = requireArtifactId(input.reviewId, "Prediction Review identifier");
      const target = path.join(projectPath, ".world-os", "author-control", "prediction-reviews", `${reviewId}.json`);
      if (!existsSync(target)) return null;
      const review = JSON.parse(readFileSync(target, "utf8")) as StoryStudioPredictionReview;
      return review.projectId === input.projectId ? structuredClone(review) : null;
    },
    listPredictionReviews(input: { projectId: string; runId?: string }): StoryStudioPredictionReview[] {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
      const directory = path.join(projectPath, ".world-os", "author-control", "prediction-reviews");
      if (!existsSync(directory)) return [];
      const runId = input.runId ? requireArtifactId(input.runId, "Prediction Run identifier") : null;
      return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .flatMap((entry) => {
          const review = JSON.parse(readFileSync(path.join(directory, entry.name), "utf8")) as StoryStudioPredictionReview;
          return review.projectId === input.projectId && (!runId || review.runId === runId) ? [structuredClone(review)] : [];
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    createPredictionReview(input: { projectId: string; runId: string; pathId: string; selectedCandidateNodeIds: string[]; decidedAt: string }): StoryStudioPredictionReview {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
      const runId = requireArtifactId(input.runId, "Prediction Run identifier");
      const runPath = path.join(projectPath, ".world-os", "tianyi", "multi-node-predictions", `${runId}.json`);
      if (!existsSync(runPath)) throw new Error("Prediction Run does not exist.");
      const run = JSON.parse(readFileSync(runPath, "utf8")) as { projectId: string; status: string; bundle?: { paths: Array<{ id: string; candidateNodeIds: string[] }>; nodes: Array<{ id: string; identityResolution: { kind: string }; timeConsistency: { kind: string } }> } };
      if (run.projectId !== input.projectId || run.status !== "ready" || !run.bundle) throw new Error("Prediction Run is not ready for review.");
      const pathEntry = run.bundle.paths.find((item) => item.id === input.pathId);
      if (!pathEntry) throw new Error("Prediction path must be selected before review.");
      const selected = [...new Set(input.selectedCandidateNodeIds.map((id) => requireText(id, "Prediction node identifier", 160)))];
      if (!selected.length || selected.some((id) => !pathEntry.candidateNodeIds.includes(id))) throw new Error("Prediction review selection is invalid.");
      const nodes = selected.map((id) => run.bundle!.nodes.find((node) => node.id === id)!);
      if (nodes.some((node) => node.identityResolution.kind === "unresolved" || node.timeConsistency.kind === "conflict")) throw new Error("Prediction review is blocked by identity or time validation.");
      const id = `prediction-review-${stableHash({ projectId: input.projectId, runId, pathId: input.pathId, selected }).slice(0, 16)}`;
      const target = path.join(projectPath, ".world-os", "author-control", "prediction-reviews", `${id}.json`);
      if (existsSync(target)) return structuredClone(JSON.parse(readFileSync(target, "utf8")));
      const review: StoryStudioPredictionReview = {
        version: "story-studio-prediction-review/v1",
        id,
        projectId: input.projectId,
        runId,
        pathId: input.pathId,
        selectedCandidateNodeIds: selected,
        status: "reviewing",
        receipt: null,
        updatedAt: requireTimestamp(input.decidedAt)
      };
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(review, null, 2)}\n`, "utf8");
      return structuredClone(review);
    },
    acceptPredictionReview(input: { projectId: string; reviewId: string; operationId: string; decidedAt: string }): StoryStudioPredictionReview {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
      const reviewId = requireArtifactId(input.reviewId, "Prediction Review identifier");
      const target = path.join(projectPath, ".world-os", "author-control", "prediction-reviews", `${reviewId}.json`);
      if (!existsSync(target)) throw new Error("Prediction Review does not exist.");
      const review = JSON.parse(readFileSync(target, "utf8")) as StoryStudioPredictionReview;
      if (review.projectId !== input.projectId) throw new Error("Prediction Review belongs to another project.");
      if (review.status === "drafted") return structuredClone(review);
      const operationId = requireText(input.operationId, "Prediction acceptance operation", 160);
      const draftReceipt = workspace.createPredictionDraftEventsOnce({ projectId: input.projectId, runId: review.runId, pathId: review.pathId, selectedCandidateNodeIds: review.selectedCandidateNodeIds, operationId });
      const runPath = path.join(projectPath, ".world-os", "tianyi", "multi-node-predictions", `${review.runId}.json`);
      const run = JSON.parse(readFileSync(runPath, "utf8")) as PredictionRun;
      if (!run.bundle || run.bundle.bundleId !== draftReceipt.bundleId) throw new Error("Prediction Bundle changed before Relation candidate creation.");
      const pathEntry = run.bundle.paths.find((item) => item.id === review.pathId);
      if (!pathEntry) throw new Error("Prediction path no longer exists.");
      const selected = new Set(review.selectedCandidateNodeIds);
      const eventByCandidate = new Map(draftReceipt.items.flatMap((item) => {
        const eventId = item.action === "draft-created" ? item.draftEventId : item.action === "referenced-existing" ? item.existingEventId : null;
        return eventId ? [[item.candidateNodeId, eventId] as const] : [];
      }));
      const activeTypes = relations.listRelationTypes({ projectId: input.projectId }).types.filter((item) => item.lifecycle === "active");
      const relationItems: PredictionRelationReceiptItem[] = pathEntry.candidateEdgeIds.map((edgeId) => {
        const edge = run.bundle!.edges.find((item) => item.id === edgeId);
        if (!edge) throw new Error("Prediction path references a missing candidate edge.");
        if (!selected.has(edge.sourceCandidateId) || !selected.has(edge.targetCandidateId)) return relationReceipt(edge.id, edge.label, "excluded-unselected-endpoint", null, null, null, null);
        const sourceEventId = eventByCandidate.get(edge.sourceCandidateId) ?? null;
        const targetEventId = eventByCandidate.get(edge.targetCandidateId) ?? null;
        if (!sourceEventId || !targetEventId) return relationReceipt(edge.id, edge.label, "excluded-unmapped-endpoint", sourceEventId, targetEventId, null, null);
        if (sourceEventId === targetEventId) return relationReceipt(edge.id, edge.label, "excluded-collapsed-endpoint", sourceEventId, targetEventId, null, null);
        const exactType = edge.relationTypeHint?.resolution === "exact" && edge.relationTypeHint.label
          ? activeTypes.find((item) => item.label.normalize("NFC").trim() === edge.relationTypeHint.label!.normalize("NFC").trim()) ?? null
          : null;
        const relationOperationId = `prediction-relation.${stableHash({ operationId, edgeId }).slice(0, 32)}`;
        const common = { projectId: input.projectId, operationId: relationOperationId, sourceObjectId: sourceEventId, targetObjectId: targetEventId, direction: edge.direction ?? "forward", sourceRevision: run.bundle!.bundleId, sourceRef: `prediction:${stableHash({ runId: run.runId, bundleId: run.bundle!.bundleId, pathId: review.pathId, edgeId }).slice(0, 40)}`, actor: "author-control.prediction-review", now: requireTimestamp(input.decidedAt) };
        const created = exactType
          ? relations.createRelationCandidate({ ...common, relationTypeId: exactType.relationTypeId, relationLabelSnapshot: exactType.label })
          : relations.createUnresolvedRelationCandidate(common);
        return relationReceipt(edge.id, edge.label, exactType ? "candidate-created" : "relation-type-unresolved", sourceEventId, targetEventId, created.relation.relationId, exactType?.relationTypeId ?? null);
      });
      const receipt: DraftCreationReceipt = { ...draftReceipt, relationItems };
      const next = { ...review, status: "drafted" as const, receipt, updatedAt: requireTimestamp(input.decidedAt) };
      writeFileSync(target, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      return structuredClone(next);
    },
    createCandidateReview(reviewInput: {
      projectId: string;
      result: StoryStudioCandidateReview["result"];
      createdAt: string;
      minimumCandidates?: number;
    }): StoryStudioCandidateReview {
      return createCandidateReviewArtifact(reviewInput);
    },

    readCandidateReview(reviewInput: { projectId: string; reviewId?: string }): StoryStudioCandidateReview | null {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: reviewInput.projectId });
      const artifact = reviewInput.reviewId
        ? readCandidateReview(projectPath, reviewInput.reviewId)
        : readLatestCandidateReview(projectPath);
      return artifact ? projectCandidateReview(artifact) : null;
    },

    listCandidateReviews(reviewInput: { projectId: string }): StoryStudioCandidateReviewHistoryEntry[] {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: reviewInput.projectId });
      const reviews = listCandidateReviews(projectPath);
      const latestId = readLatestCandidateReview(projectPath)?.id || null;
      return reviews.map((review) => ({
        ...projectCandidateReview(review),
        lifecycleStatus: review.status === "awaiting" && review.id !== latestId ? "superseded" : review.status
      }));
    },

    abandonCandidateReview(reviewInput: { projectId: string; reviewId: string; abandonedAt: string }): StoryStudioCandidateReview {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: reviewInput.projectId });
      const artifact = requireCandidateReview(projectPath, reviewInput.reviewId);
      if (artifact.projectId !== reviewInput.projectId) throw new Error("Candidate Review belongs to another project.");
      if (artifact.status === "accepted") throw new Error("Accepted Candidate Review cannot be abandoned.");
      if (artifact.status === "abandoned") return projectCandidateReview(artifact);
      const next: PersistedCandidateReview = {
        ...artifact,
        status: "abandoned",
        updatedAt: requireTimestamp(reviewInput.abandonedAt)
      };
      writeCandidateReview(projectPath, next);
      return projectCandidateReview(next);
    },

    decideCandidateReview(decisionInput: {
      projectId: string;
      reviewId: string;
      candidateId: string;
      decision: "rejected" | "accepted";
      reason?: string;
      confirmationReceipt?: { planningEventId?: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string };
      decidedAt: string;
    }): StoryStudioCandidateReview {
      return decideCandidateReviewArtifact(decisionInput);
    },

    listVerifiedCanonEventIds(readInput: { projectId: string }): string[] {
      const readIndex = buildCanonEventReadIndex(workspace, readInput.projectId);
      return readIndex.events
        .filter((event) => verifyCanonEventRead(workspace, readIndex.projectPath, readInput.projectId, event.id, readIndex))
        .map((event) => event.id);
    },

    verifyCanonEventRead(readInput: { projectId: string; eventId: string }): boolean {
      return isVerifiedCanonEventRead(readInput.projectId, readInput.eventId);
    },

    createImpactReview(reviewInput: {
      projectId: string;
      sceneId: string;
      authorGoal: string;
      selectedObjectIds?: string[];
    }): StoryStudioImpactReview {
      const scene = workspace.openWritingDocument({ projectId: reviewInput.projectId, documentId: reviewInput.sceneId });
      if (scene.type !== "scene") throw new Error("Impact Review requires a scene.");
      return createReviewForSource({
        projectId: reviewInput.projectId,
        source: { kind: "scene", id: scene.id, relativeId: scene.relativeId, title: scene.title, revisionToken: scene.revisionToken },
        authorGoal: reviewInput.authorGoal,
        selectedObjectIds: [...(reviewInput.selectedObjectIds || []), ...scene.mentionedObjects.map((object) => object.id)],
        origin: { kind: "author", label: "作者直接提出的变化" }
      });
    },

    createPlanningEventImpactReview(reviewInput: { projectId: string; planningEventId: string }): StoryStudioImpactReview {
      const planning = workspace.readWorldObject({ projectId: reviewInput.projectId, objectId: reviewInput.planningEventId });
      if (planning.type !== "event" || planning.status !== "planned" || !planning.tags.includes("作者规划")) {
        throw new Error("只有作者规划事件可以进入正史影响评审。");
      }
      const authorGoal = [planning.title, planning.body]
        .join("\n")
        .replace(/^#.*$/gmu, "")
        .trim()
        .slice(0, 1000) || planning.title;
      return createReviewForSource({
        projectId: reviewInput.projectId,
        source: { kind: "planning-event", id: planning.id, relativeId: planning.relativeId, title: planning.title, revisionToken: planning.revisionToken },
        authorGoal,
        selectedObjectIds: [planning.id, ...planning.linkedObjects.map((object) => object.id)],
        origin: { kind: "planning-event", label: "作者规划事件" }
      });
    },

    readImpactReview(reviewInput: { projectId: string; reviewId?: string }): StoryStudioImpactReview | null {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: reviewInput.projectId });
      const artifact = reviewInput.reviewId
        ? readReview(projectPath, reviewInput.reviewId)
        : readLatestReview(projectPath);
      if (!artifact) return null;
      const snapshot = buildSnapshotForReviewSource(projectPath, artifact.source);
      return projectReview(artifact, snapshot, readReviewSourceRevisionToken(workspace, artifact.projectId, artifact.source) !== artifact.source.revisionToken);
    },

    chooseImpactRoute(choiceInput: {
      projectId: string;
      reviewId: string;
      optionId: string;
      action: "adopt" | "adjust" | "preserve";
      authorContent?: string;
    }): StoryStudioImpactReview {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: choiceInput.projectId });
      const artifact = requireReview(projectPath, choiceInput.reviewId);
      const snapshot = buildSnapshotForReviewSource(projectPath, artifact.source);
      if (snapshot.snapshotHash !== artifact.snapshotHash || readReviewSourceRevisionToken(workspace, artifact.projectId, artifact.source) !== artifact.source.revisionToken) {
        throw new Error("故事资料已经改变，请重新进行影响评审。");
      }

      if (choiceInput.action === "preserve") {
        const rejectOption = artifact.decisionWorkspace.options.find((option) => option.type === "reject_change");
        if (!rejectOption) throw new Error("Keep-current-world option is unavailable.");
        const resolution = resolveAuthorDecision({ workspace: artifact.decisionWorkspace, selectedOptionId: rejectOption.id, status: "rejected" });
        const next = { ...artifact, decisionWorkspace: resolution.workspace, resolution, preview: null, status: "rejected" as const };
        writeReview(projectPath, next);
        return projectReview(next, snapshot, false);
      }

      const status = choiceInput.action === "adjust" ? "modified" as const : "accepted" as const;
      const resolution = resolveAuthorDecision({
        workspace: artifact.decisionWorkspace,
        selectedOptionId: choiceInput.optionId,
        status,
        ...(status === "modified" ? { authorContent: requireText(choiceInput.authorContent || "", "Author adjustment", 1000) } : {})
      });
      if (!resolution.commitCandidate) throw new Error("Author choice did not create a preview candidate.");
      const preview = buildStoryChangePreview({
        project: buildStoryProjectFromSnapshot(snapshot),
        candidate: resolution.commitCandidate,
        authorDecision: resolution.commitCandidate.selectedDecision,
        evidenceBundle: artifact.evidenceBundle,
        previousSnapshotId: artifact.snapshotHash
      });
      const next = { ...artifact, decisionWorkspace: resolution.workspace, resolution, preview, status: "selected" as const };
      writeReview(projectPath, next);
      return projectReview(next, snapshot, false);
    },

    createAuthorChangeSet(changeInput: { projectId: string; reviewId: string }): StoryStudioAuthorChangeSet {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: changeInput.projectId });
      const review = requireReview(projectPath, changeInput.reviewId);
      if (review.status !== "selected" || !review.preview || !review.resolution?.commitCandidate) {
        throw new Error("请先由作者采用一条故事走向。");
      }
      const snapshot = buildSnapshotForReviewSource(projectPath, review.source);
      if (snapshot.snapshotHash !== review.snapshotHash || readReviewSourceRevisionToken(workspace, review.projectId, review.source) !== review.source.revisionToken) {
        throw new Error("故事资料已经改变，请重新进行影响评审。");
      }
      const affectedNoteIds = [...new Set([
        ...review.resolution.commitCandidate.affectedCharacters,
        ...review.resolution.commitCandidate.affectedEvents,
        ...review.intent.relatedLocations
      ])].sort();
      const objectRevisions = affectedNoteIds.flatMap((objectId) => {
        try {
          const object = workspace.readWorldObject({ projectId: changeInput.projectId, objectId });
          return [{ objectId, revisionToken: object.revisionToken }];
        } catch {
          return [];
        }
      });
      const routeEvidenceIds = (review.validatedEvidence || []).map((evidence) => evidence.evidenceId);
      const structuredChanges = [
        ...review.preview.changeSet.addedFacts,
        ...review.preview.changeSet.changedRelationships,
        ...review.preview.changeSet.triggeredEvents
      ].map((change) => ({
        ...change,
        evidenceRefs: [...new Set([...change.evidenceRefs, ...routeEvidenceIds])].sort()
      }));
      const changeSetId = `author-change-set-${stableHash({ reviewId: review.reviewId, candidateId: review.resolution.commitCandidate.id }).slice(0, 16)}`;
      const artifact: PersistedAuthorChangeSet = {
        version: CHANGE_SET_VERSION,
        changeSetId,
        reviewId: review.reviewId,
        projectId: changeInput.projectId,
        source: review.source,
        baseline: { snapshotHash: review.snapshotHash, sourceRevisionToken: review.source.revisionToken, objectRevisions },
        affectedNoteIds,
        structuredChanges,
        evidenceRefs: [...new Set(structuredChanges.flatMap((change) => change.evidenceRefs))].sort(),
        before: previewBefore(review.preview),
        change: structuredChanges.map((item) => item.summary),
        after: previewAfter(review.preview),
        authorDecision: {
          optionId: review.resolution.commitCandidate.selectedDecision.optionId,
          label: optionLabelFromType(review.resolution.commitCandidate.selectedDecision.optionType),
          status: review.resolution.commitCandidate.selectedDecision.status
        },
        candidate: review.resolution.commitCandidate,
        status: "pending",
        application: {
          mode: "single-event-record",
          reason: "应用只会新增一条作者确认的事件记录；正文和既有对象卡保持不变。",
          appliedEventId: null,
          markdownWrites: 0
        }
      };
      writeChangeSet(projectPath, artifact);
      return projectChangeSet(artifact, false);
    },

    readAuthorChangeSet(changeInput: { projectId: string; changeSetId?: string }): StoryStudioAuthorChangeSet | null {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: changeInput.projectId });
      const artifact = changeInput.changeSetId
        ? readChangeSet(projectPath, changeInput.changeSetId)
        : readLatestChangeSet(projectPath);
      if (!artifact) return null;
      const intent = readApplyIntent(projectPath, artifact.changeSetId);
      if (intent && !["applied", "abandoned"].includes(artifact.status)) {
        return projectChangeSet({
          ...artifact,
          status: "applying",
          application: { ...artifact.application, reason: "作者确认的事件写入已准备；等待显式重试完成回执。" }
        }, false);
      }
      const stale = isChangeSetStale(workspace, artifact);
      if (stale && !["applied", "abandoned"].includes(artifact.status)) {
        const next = { ...artifact, status: "stale" as const, application: { ...artifact.application, reason: "来源场景或世界对象已在外部改变，请重新评审。" } };
        writeChangeSet(projectPath, next);
        return projectChangeSet(next, true);
      }
      return projectChangeSet(artifact, stale);
    },

    dryRunAuthorChangeSet(changeInput: { projectId: string; changeSetId: string }): StoryStudioAuthorChangeSet {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: changeInput.projectId });
      const artifact = requireChangeSet(projectPath, changeInput.changeSetId);
      if (readApplyIntent(projectPath, artifact.changeSetId) && artifact.status !== "applied") {
        return projectChangeSet({
          ...artifact,
          status: "applying",
          application: { ...artifact.application, reason: "作者确认的事件写入已准备；dry run 不会自动提交或恢复。" }
        }, false);
      }
      const stale = isChangeSetStale(workspace, artifact);
      if (stale && artifact.status !== "applied") {
        const next = { ...artifact, status: "stale" as const, application: { ...artifact.application, reason: "重新检查发现来源文件版本已变化，禁止写入。" } };
        writeChangeSet(projectPath, next);
        return projectChangeSet(next, true);
      }
      return projectChangeSet(artifact, false);
    },

    abandonAuthorChangeSet(changeInput: { projectId: string; changeSetId: string }): StoryStudioAuthorChangeSet {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: changeInput.projectId });
      const artifact = requireChangeSet(projectPath, changeInput.changeSetId);
      if (artifact.status === "applied") throw new Error("已经写入的受保护变更单不能放弃。");
      if (readApplyIntent(projectPath, artifact.changeSetId)) {
        throw new Error("已经准备写入的受保护变更单不能放弃；请先显式恢复或检查冲突。");
      }
      const next = { ...artifact, status: "abandoned" as const, application: { ...artifact.application, reason: "作者已放弃这次世界变化。" } };
      writeChangeSet(projectPath, next);
      return projectChangeSet(next, false);
    },

    applyAuthorChangeSet(changeInput: { projectId: string; changeSetId: string }): StoryStudioAuthorChangeSet {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: changeInput.projectId });
      let artifact = requireChangeSet(projectPath, changeInput.changeSetId);
      const existingIntent = readApplyIntent(projectPath, artifact.changeSetId);
      if (artifact.status === "applied") {
        if (!existingIntent) {
          validateLegacyAppliedEvent(workspace, artifact);
          if (artifact.application.appliedEventId) workspace.projectConfirmedEventToTimeline({ projectId: artifact.projectId, eventId: artifact.application.appliedEventId });
          return projectChangeSet(artifact, false);
        }
        if (!sameApplyIntent(existingIntent, buildApplyIntent(artifact))) {
          throw applyError("APPLY_INTENT_MISMATCH", "已应用变更单与冻结写入意图不一致，禁止静默接受。");
        }
        validateAppliedEvent(workspace, artifact, existingIntent);
        if (artifact.application.appliedEventId) workspace.projectConfirmedEventToTimeline({ projectId: artifact.projectId, eventId: artifact.application.appliedEventId });
        return projectChangeSet(artifact, false);
      }
      if (artifact.status === "abandoned") throw new Error("已放弃的受保护变更单不能写入。");
      if (artifact.status === "applying" && !existingIntent) {
        throw applyError("LEGACY_APPLYING_UNRECOVERABLE", "旧版写入中记录缺少稳定意图，禁止猜测或重新分配事件。");
      }
      if (!existingIntent && isChangeSetStale(workspace, artifact)) {
        artifact = { ...artifact, status: "stale", application: { ...artifact.application, reason: "来源文件版本已变化，禁止覆盖当前世界。" } };
        writeChangeSet(projectPath, artifact);
        return projectChangeSet(artifact, true);
      }

      const expectedIntent = buildApplyIntent(artifact);
      const intent = existingIntent || (() => {
        const snapshot = buildSnapshotForReviewSource(projectPath, artifact.source);
        commitStoryEvent(buildStoryProjectFromSnapshot(snapshot), artifact.candidate, {
          logicalTimestamp: snapshot.notes.length,
          previousSnapshotId: artifact.baseline.snapshotHash
        });
        emitApplyFault(input, "before-intent-publish", expectedIntent);
        const persisted = writeApplyIntentOnce(projectPath, expectedIntent, (boundary) => {
          emitApplyFault(input, boundary === "temporary-durable" ? "intent-temporary-durable" : "intent-final-published", expectedIntent);
        });
        emitApplyFault(input, "after-intent-durable", persisted);
        return persisted;
      })();
      if (!sameApplyIntent(intent, expectedIntent)) {
        throw applyError("APPLY_INTENT_MISMATCH", "已存在的写入意图与当前变更单身份不一致，禁止继续。");
      }

      assertOperationMultiplicity(workspace, intent);
      const targetBefore = readEventIfPresent(workspace, intent.projectId, intent.targetEventRef);
      if (!targetBefore && isChangeSetStale(workspace, artifact)) {
        throw applyError("CHANGESET_REVISION_DRIFT", "写入意图形成后来源版本已变化，禁止创建事件。");
      }

      const applying = { ...artifact, status: "applying" as const, application: { ...artifact.application, reason: "正在写入作者确认的事件记录。" } };
      writeChangeSet(projectPath, applying, (boundary) => {
        emitApplyFault(input, boundary === "temporary-durable" ? "applying-temporary-durable" : "applying-final-published", intent);
      });

      const publication = workspace.createConfirmedEventOnce({
        projectId: intent.projectId,
        targetEventRef: intent.targetEventRef,
        title: intent.event.title,
        body: intent.event.body,
        ...(intent.event.plannedFrom ? { plannedFrom: intent.event.plannedFrom } : {}),
        provenance: {
          sourceChangeSetId: intent.event.provenance.sourceChangeSetId,
          sourceChangeSetRevision: intent.event.provenance.sourceChangeSetRevision,
          authorDecisionRef: intent.event.provenance.authorDecisionRef,
          applyOperationKey: intent.event.provenance.applyOperationKey,
          intentHash: intent.event.provenance.intentHash
        },
        operationId: intent.applyOperationKey,
        onBoundary: (boundary) => emitApplyFault(input, boundary, intent)
      });
      if (publication.conflict || !publication.event) {
        const target = readEventIfPresent(workspace, intent.projectId, intent.targetEventRef);
        if (!target || target.properties.apply_operation_key !== intent.applyOperationKey) {
          throw applyError("EVENT_ID_COLLISION", "目标事件身份已被无关内容占用，未覆盖也未分配替代身份。");
        }
        throw applyError("EVENT_PROVENANCE_MISMATCH", "目标事件与冻结写入意图不一致，未覆盖作者内容。");
      }

      assertOperationMultiplicity(workspace, intent);
      emitApplyFault(input, "before-applied-persist", intent);
      const applied: PersistedAuthorChangeSet = {
        ...applying,
        status: "applied",
        application: {
          ...applying.application,
          reason: "作者确认的变化已记录为世界事件；正文和既有对象卡未被自动修改。",
          appliedEventId: publication.event.id,
          markdownWrites: 1
        }
      };
      writeChangeSet(projectPath, applied, (boundary) => {
        emitApplyFault(input, boundary === "temporary-durable" ? "applied-temporary-durable" : "applied-final-published", intent);
      });
      workspace.projectConfirmedEventToTimeline({ projectId: applied.projectId, eventId: publication.event.id });
      emitApplyFault(input, "after-applied-durable", intent);
      emitApplyFault(input, "before-response", intent);
      return projectChangeSet(applied, false);
    },

    createStoryExploration(explorationInput: {
      projectId: string;
      sceneId: string;
      authorGoal: string;
      planOptions?: {
        allowedRoles: Parameters<typeof createNuwaPlan>[0]["allowedRoles"];
        maxRoles: number;
        runKey: string;
        seed?: number;
        candidateSeeds?: number[];
        runner?: "deterministic" | "external";
        supplementalNotes?: Parameters<typeof buildStorySnapshot>[0]["supplementalNotes"];
        /** Stable IDs supplied only after a trusted server source read. */
        explicitNoteIds?: Parameters<typeof buildStorySnapshot>[0]["explicitNoteIds"];
        attentionContext?: NuwaAttentionContext;
      };
    }): StoryStudioNuwaExploration {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const scene = workspace.openWritingDocument({ projectId: explorationInput.projectId, documentId: explorationInput.sceneId });
      if (scene.type !== "scene" && scene.type !== "chapter") throw new Error("女娲推演需要一个当前写作文档。");
      const authorGoal = requireText(explorationInput.authorGoal, "Author goal", 1000);
      // Freshness remains a comparison against canonical project facts only.
      // A server-authorized source selection changes what this run may read,
      // not what the world itself is. Keeping the two hashes distinct prevents
      // an explicit event reference from making its own exploration stale.
      const canonicalSnapshot = buildStorySnapshot({ workspacePath: projectPath, selectedScenePath: scene.relativeId });
      const snapshotInput = {
        workspacePath: projectPath,
        selectedScenePath: scene.relativeId,
        ...(explorationInput.planOptions?.explicitNoteIds?.length
          ? { explicitNoteIds: explorationInput.planOptions.explicitNoteIds }
          : {})
      };
      const snapshot = explorationInput.planOptions?.supplementalNotes?.length || explorationInput.planOptions?.explicitNoteIds?.length
        ? buildStorySnapshot({ ...snapshotInput, supplementalNotes: explorationInput.planOptions.supplementalNotes })
        : canonicalSnapshot;
      const plan = createNuwaPlan({
        snapshot,
        authorGoal,
        ...(explorationInput.planOptions ? {
          allowedRoles: explorationInput.planOptions.allowedRoles,
          budget: { maxRoles: explorationInput.planOptions.maxRoles },
          runKey: explorationInput.planOptions.runKey,
          ...(explorationInput.planOptions.seed === undefined ? {} : { seed: explorationInput.planOptions.seed }),
          runner: explorationInput.planOptions.runner
        } : {}),
        seed: explorationInput.planOptions?.seed ?? NUWA_AUTHOR_LOOP_SEEDS[0]
      });
      const explorationId = `story-exploration-${stableHash({
        sceneId: scene.id,
        snapshotHash: snapshot.snapshotHash,
        authorGoal,
        ...(explorationInput.planOptions ? { runId: plan.runId } : {})
      }).slice(0, 16)}`;
      const existing = readExploration(projectPath, explorationId);
      if (existing) return projectExploration(existing, projectPath, scene.revisionToken !== existing.sceneRevisionToken);
      createNuwaRunPack({ workspacePath: projectPath, plan, snapshot, attentionContext: explorationInput.planOptions?.attentionContext });
      const candidateSeeds = explorationInput.planOptions?.candidateSeeds?.length === 3
        ? [...explorationInput.planOptions.candidateSeeds]
        : [...NUWA_AUTHOR_LOOP_SEEDS];
      const candidateRuns = candidateSeeds.map((seed, index) => {
        const candidatePlan = index === 0
          ? plan
          : createNuwaPlan({
            snapshot,
            authorGoal,
            ...(explorationInput.planOptions ? {
              allowedRoles: explorationInput.planOptions.allowedRoles,
              budget: { maxRoles: explorationInput.planOptions.maxRoles },
              runKey: `${explorationInput.planOptions.runKey}:candidate:${seed}`,
              runner: explorationInput.planOptions.runner
            } : { runKey: `${plan.runId}:candidate:${seed}`, runner: plan.runner }),
            seed
          });
        if (index > 0) createNuwaRunPack({ workspacePath: projectPath, plan: candidatePlan, snapshot, updateLatest: false, attentionContext: explorationInput.planOptions?.attentionContext });
        return {
          candidateId: `candidate-${index + 1}`,
          runId: candidatePlan.runId,
          seed,
          snapshotHash: snapshot.snapshotHash,
          status: "candidate" as const
        };
      });
      const artifact: PersistedNuwaExploration = {
        version: EXPLORATION_VERSION,
        explorationId,
        projectId: explorationInput.projectId,
        sceneId: scene.id,
        sceneRelativeId: scene.relativeId,
        sceneTitle: scene.title,
        sceneRevisionToken: scene.revisionToken,
        snapshotHash: snapshot.snapshotHash,
        canonicalSnapshotHash: canonicalSnapshot.snapshotHash,
        authorGoal,
        runId: plan.runId,
        status: "planned",
        selectedRouteIndex: null,
        reviewId: null,
        candidateRuns,
        sourceKind: "scene"
      };
      writeExploration(projectPath, artifact);
      return projectExploration(artifact, projectPath, false);
    },

    /** Creates a bounded, run-owned rehearsal without inventing a scene or a second world. */
    createStandaloneStoryExploration(explorationInput: {
      projectId: string;
      story: string;
      authorGoal: string;
      characterNames?: string[];
      preservedFacts?: string[];
      boundaries?: string[];
      depth?: "short" | "medium" | "long";
    }): StoryStudioNuwaExploration {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const story = requireText(explorationInput.story, "Standalone Nuwa story", 12_000);
      const authorGoal = requireText(explorationInput.authorGoal, "Standalone Nuwa author goal", 1_000);
      const depth = explorationInput.depth ?? "medium";
      const normalizeList = (values: string[] | undefined, label: string, maximum: number) => {
        if (!values) return [];
        if (!Array.isArray(values) || values.length > maximum) throw new Error(`${label} is invalid.`);
        const normalized = values.map((value) => requireText(value, label, 240));
        return [...new Set(normalized)];
      };
      const characterNames = normalizeList(explorationInput.characterNames, "Standalone Nuwa character", 16);
      const preservedFacts = normalizeList(explorationInput.preservedFacts, "Standalone Nuwa preserved fact", 24);
      const boundaries = normalizeList(explorationInput.boundaries, "Standalone Nuwa boundary", 24);
      const snapshot = buildStorySnapshot({ workspacePath: projectPath });
      const runKey = `standalone-${stableHash({ story, authorGoal, characterNames, preservedFacts, boundaries, depth }).slice(0, 20)}`;
      const plan = createNuwaPlan({ snapshot, authorGoal: `${authorGoal}\n\n${story}`, runKey, runner: "external", seed: NUWA_AUTHOR_LOOP_SEEDS[0] });
      const explorationId = `story-exploration-${stableHash({ projectId: explorationInput.projectId, runId: plan.runId }).slice(0, 16)}`;
      const existing = readExploration(projectPath, explorationId);
      if (existing) return projectExploration(existing, projectPath, false);
      createNuwaRunPack({ workspacePath: projectPath, plan, snapshot });
      const candidateRuns = NUWA_AUTHOR_LOOP_SEEDS.map((seed, index) => {
        const candidatePlan = index === 0 ? plan : createNuwaPlan({ snapshot, authorGoal: `${authorGoal}\n\n${story}`, runKey: `${runKey}:candidate:${seed}`, runner: "external", seed });
        if (index > 0) createNuwaRunPack({ workspacePath: projectPath, plan: candidatePlan, snapshot, updateLatest: false });
        return { candidateId: `candidate-${index + 1}`, runId: candidatePlan.runId, seed, snapshotHash: snapshot.snapshotHash, status: "candidate" as const };
      });
      const characters = workspace.listWorldObjects({ projectId: explorationInput.projectId, type: "character" });
      const agents: NuwaStandaloneSandboxAgent[] = characterNames.map((name) => {
        const matches = characters.filter((character) => [character.title, ...character.aliases].some((label) => label.normalize("NFC") === name.normalize("NFC")));
        if (matches.length === 1) {
          const character = workspace.readWorldObject({ projectId: explorationInput.projectId, objectId: matches[0]!.id });
          return {
            id: `existing-${stableHash({ runId: plan.runId, objectId: character.id }).slice(0, 16)}`,
            kind: "existing-character" as const,
            displayName: character.title,
            objectId: character.id,
            sourceRevision: character.revisionToken,
            goal: "沿用正式人物资料中的当前目标。",
            disposition: "沿用正式人物资料中的已知性格与行为倾向。",
            knownInformation: "来自本次作者输入与正式人物资料的只读快照。",
            unknownInformation: "本次输入没有明确给出的信息保持未知。",
            sourceExcerpt: story.slice(0, 800)
          };
        }
        return {
          id: `temporary-${stableHash({ runId: plan.runId, name }).slice(0, 16)}`,
          kind: "temporary-character" as const,
          displayName: name,
          objectId: null,
          sourceRevision: null,
          goal: "等待作者在本次排演中补充目标。",
          disposition: "等待作者在本次排演中补充性格或行为倾向。",
          knownInformation: "仅知道作者输入中直接描述的内容。",
          unknownInformation: "未在作者输入中出现的背景、关系与动机均未知。",
          sourceExcerpt: story.slice(0, 800)
        };
      });
      const now = input.now ? input.now() : new Date().toISOString();
      writeNuwaStandaloneSandboxContext({
        workspacePath: projectPath,
        runId: plan.runId,
        context: { version: "story-studio-nuwa-standalone-sandbox/v1", runId: plan.runId, story, authorGoal, preservedFacts, boundaries, depth, agents, createdAt: now, updatedAt: now }
      });
      const artifact: PersistedNuwaExploration = {
        version: EXPLORATION_VERSION,
        explorationId,
        projectId: explorationInput.projectId,
        sceneId: `standalone:${plan.runId}`,
        sceneRelativeId: "",
        sceneTitle: "独立排演",
        sceneRevisionToken: "standalone",
        snapshotHash: snapshot.snapshotHash,
        canonicalSnapshotHash: snapshot.snapshotHash,
        authorGoal,
        runId: plan.runId,
        status: "planned",
        selectedRouteIndex: null,
        reviewId: null,
        candidateRuns,
        sourceKind: "standalone"
      };
      writeExploration(projectPath, artifact);
      return projectExploration(artifact, projectPath, false);
    },

    readStoryExploration(explorationInput: { projectId: string; explorationId?: string }): StoryStudioNuwaExploration | null {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const artifact = explorationInput.explorationId
        ? readExploration(projectPath, explorationInput.explorationId)
        : readLatestExploration(projectPath);
      if (!artifact) return null;
      if (artifact.sourceKind === "standalone") return projectExploration(artifact, projectPath, false);
      const scene = workspace.readWritingDocument({ projectId: explorationInput.projectId, documentId: artifact.sceneId });
      return projectExploration(artifact, projectPath, scene.revisionToken !== artifact.sceneRevisionToken);
    },

    readStoryExplorationRunOwner(explorationInput: { projectId: string; explorationId: string }): { runId: string; kind: "nuwa-run-pack"; contextReceiptId: string | null } {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const artifact = requireExploration(projectPath, explorationInput.explorationId);
      return { runId: artifact.runId, kind: "nuwa-run-pack", contextReceiptId: artifact.contextReceiptId ?? null };
    },

    bindStoryExplorationContextReceipt(bindingInput: { projectId: string; explorationId: string; contextReceiptId: string }): { runId: string; kind: "nuwa-run-pack"; contextReceiptId: string } {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: bindingInput.projectId });
      const artifact = requireExploration(projectPath, bindingInput.explorationId);
      const contextReceiptId = requireText(bindingInput.contextReceiptId, "Context Receipt identifier", 180);
      if (artifact.contextReceiptId && artifact.contextReceiptId !== contextReceiptId) {
        throw new Error("女娲任务已经绑定另一份 Context Receipt。");
      }
      if (!artifact.contextReceiptId) writeExploration(projectPath, { ...artifact, contextReceiptId });
      return { runId: artifact.runId, kind: "nuwa-run-pack", contextReceiptId };
    },

    async runStoryExploration(explorationInput: { projectId: string; explorationId: string }): Promise<StoryStudioNuwaExploration> {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      let artifact = requireExploration(projectPath, explorationInput.explorationId);
      assertExplorationCurrent(workspace, artifact, projectPath);
      artifact = { ...artifact, status: "running" };
      writeExploration(projectPath, artifact);
      const candidateRuns = persistedCandidateRuns(artifact);
      const nextCandidateRuns = [] as NonNullable<PersistedNuwaExploration["candidateRuns"]>;
      for (const candidate of candidateRuns) {
        const loaded = readNuwaRunPack(projectPath, candidate.runId);
        const manifest = readNuwaBackendManifest(projectPath, candidate.runId);
        const outcome = await executeNuwaPlanWithBackend({
          plan: loaded.run.plan,
          snapshot: loaded.snapshot,
          backend: createNuwaExecutionBackend({ id: "deterministic" }),
          profile: "balanced",
          cachedResults: manifest.cache
        });
        writeNuwaExecutionOutcome({ workspacePath: projectPath, runId: candidate.runId, outcome });
        const readiness = getNuwaSynthesisReadiness(projectPath, candidate.runId);
        nextCandidateRuns.push({ ...candidate, status: readiness.canSynthesize ? candidate.status : "candidate" });
      }
      const ready = nextCandidateRuns.length > 0 && nextCandidateRuns.every((candidate) => getNuwaSynthesisReadiness(projectPath, candidate.runId).canSynthesize);
      artifact = { ...artifact, candidateRuns: nextCandidateRuns, status: ready ? "ready-to-synthesize" : "planned" };
      writeExploration(projectPath, artifact);
      return projectExploration(artifact, projectPath, false);
    },

    recordProviderStoryExploration(explorationInput: {
      projectId: string;
      explorationId: string;
      outcome: NuwaExecutionOutcome;
    }): StoryStudioNuwaExploration {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      let artifact = requireExploration(projectPath, explorationInput.explorationId);
      assertExplorationCurrent(workspace, artifact, projectPath);
      if (explorationInput.outcome.backend.id !== "external-run-pack" || !explorationInput.outcome.backend.remoteExecution) {
        throw new Error("真实 Provider 结果必须通过 external-run-pack 适配器进入女娲运行包。");
      }
      writeNuwaExecutionOutcome({ workspacePath: projectPath, runId: artifact.runId, outcome: explorationInput.outcome });
      const readiness = getNuwaSynthesisReadiness(projectPath, artifact.runId);
      if (!readiness.canSynthesize) throw new Error("真实 Provider 结果未通过女娲运行包核验。");
      const loaded = readNuwaRunPack(projectPath, artifact.runId);
      const bundle = synthesizeNuwaResults({ plan: loaded.run.plan, snapshot: loaded.snapshot, results: loaded.results });
      writeNuwaPredictionBundle({ workspacePath: projectPath, runId: artifact.runId, bundle });
      artifact = { ...artifact, status: "ready-for-review" };
      writeExploration(projectPath, artifact);
      return projectExploration(artifact, projectPath, false);
    },

    synthesizeStoryExploration(explorationInput: { projectId: string; explorationId: string }): StoryStudioNuwaExploration {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const artifact = requireExploration(projectPath, explorationInput.explorationId);
      assertExplorationCurrent(workspace, artifact, projectPath);
      const existingParentBundle = readNuwaRunPack(projectPath, artifact.runId).bundle;
      if (existingParentBundle && artifact.status === "ready-for-review") {
        return projectExploration(artifact, projectPath, false);
      }
      const candidateRuns = persistedCandidateRuns(artifact);
      const parent = readNuwaRunPack(projectPath, artifact.runId);
      const childBundles = candidateRuns.map((candidate) => {
        const readiness = getNuwaSynthesisReadiness(projectPath, candidate.runId);
        if (!readiness.canSynthesize) throw new Error("必要的专业检查尚未通过核验，不能整理候选路线。");
        const loaded = readNuwaRunPack(projectPath, candidate.runId);
        const bundle = synthesizeNuwaResults({ plan: loaded.run.plan, snapshot: loaded.snapshot, results: loaded.results });
        if (candidate.runId !== artifact.runId) {
          writeNuwaPredictionBundle({ workspacePath: projectPath, runId: candidate.runId, bundle });
        }
        return { candidate, loaded, bundle };
      });
      const branches: StoryPredictionBranch[] = [];
      const projectedCandidates: NuwaCandidateFutureRun[] = [];
      childBundles.forEach(({ candidate, loaded, bundle }, index) => {
        const base = ensureAuthorLoopBranches(bundle, 3)[index] || ensureAuthorLoopBranches(bundle, 3)[0];
        if (!base) throw new Error("女娲候选路线缺少可比较分支。");
        const branch = {
          ...structuredClone(base),
          id: `candidate-${index + 1}-${stableHash({ candidateId: candidate.candidateId, branchId: base.id }).slice(0, 10)}`,
          title: `${base.title} · 候选 ${index + 1}`,
          summary: `${base.summary}（固定 seed ${candidate.seed}，独立 Run Pack）`
        };
        branches.push(branch);
        projectedCandidates.push(createAuthorLoopCandidate({
          candidateId: candidate.candidateId,
          parentRunId: artifact.runId,
          childRunId: loaded.run.runId,
          seed: candidate.seed,
          snapshot: loaded.snapshot,
          branch,
          status: candidate.status
        }));
      });
      const parentBundle = {
        ...synthesizeNuwaResults({ plan: parent.run.plan, snapshot: parent.snapshot, results: parent.results }),
        runId: parent.run.runId,
        branches,
        candidateRuns: projectedCandidates
      };
      writeNuwaPredictionBundle({ workspacePath: projectPath, runId: artifact.runId, bundle: parentBundle });
      const nextCandidateRuns = candidateRuns.map((candidate, index) => ({
        ...candidate,
        branchId: projectedCandidates[index]?.branchId,
        traceHash: projectedCandidates[index]?.traceHash,
        status: projectedCandidates[index]?.status ?? candidate.status
      }));
      const next = { ...artifact, candidateRuns: nextCandidateRuns, status: "ready-for-review" as const };
      writeExploration(projectPath, next);
      return projectExploration(next, projectPath, false);
    },

    submitStoryExplorationRouteToImpact(explorationInput: { projectId: string; explorationId: string; routeId: string; submittedAt?: string }): {
      exploration: StoryStudioNuwaExploration;
      review: StoryStudioImpactReview;
      overlay: StoryStudioIntelligenceOverlay;
      candidateReview: StoryStudioCandidateReview;
    } {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const artifact = requireExploration(projectPath, explorationInput.explorationId);
      assertExplorationCurrent(workspace, artifact, projectPath);
      const loaded = readNuwaRunPack(projectPath, artifact.runId);
      if (!loaded.bundle) throw new Error("请先整理女娲候选路线。");
      const routeIndex = routeIndexFromProductId(explorationInput.routeId, loaded.bundle.branches.length);
      const candidateRuns = persistedCandidateRuns(artifact);
      if (candidateRuns[routeIndex]?.status === "rejected") throw new Error("已淘汰的候选不能进入影响评审。");
      const branch = loaded.bundle.branches[routeIndex];
      const context = buildNuwaReviewContext(loaded.snapshot, loaded.bundle, branch);
      const scene = workspace.readWritingDocument({ projectId: explorationInput.projectId, documentId: artifact.sceneId });
      const reviewId = `impact-review-${stableHash({ explorationId: artifact.explorationId, routeIndex }).slice(0, 16)}`;
      const candidateReview = createCandidateReviewArtifact({
        projectId: explorationInput.projectId,
        createdAt: explorationInput.submittedAt || now(),
        minimumCandidates: 1,
        result: explorationCandidateResult(artifact, loaded.snapshot, loaded.bundle)
      });
      const candidate = candidateReview.candidates.find((item) => item.id === explorationInput.routeId);
      if (!candidate) throw new Error("Candidate Review route does not match the Nuwa Result Receipt.");
      if (candidateReview.status === "accepted" && candidate.status !== "accepted") {
        throw new Error("Candidate Review already accepted a different route.");
      }
      const reviewArtifact: PersistedImpactReview = {
        version: REVIEW_VERSION,
        reviewId,
        projectId: explorationInput.projectId,
        source: { kind: "scene", id: artifact.sceneId, relativeId: artifact.sceneRelativeId, title: artifact.sceneTitle, revisionToken: scene.revisionToken },
        snapshotHash: loaded.snapshot.snapshotHash,
        authorGoal: loaded.bundle.authorGoal,
        origin: { kind: "nuwa-route", label: `女娲候选路线：${branch.title}` },
        validatedEvidence: branch.evidence.map((evidence) => ({
          evidenceId: evidence.evidenceId,
          noteId: evidence.noteId,
          relativePath: evidence.relativePath,
          title: evidence.title,
          excerpt: evidence.excerpt,
          coveredImpactRefs: [`candidate-route:${branch.strategy}`]
        })),
        intent: context.intent,
        report: context.impactReport,
        evidenceBundle: context.evidenceBundle,
        decisionWorkspace: context.decisionWorkspace,
        resolution: null,
        preview: null,
        status: "pending"
      };
      writeReview(projectPath, reviewArtifact);
      writeNuwaAuthorReview({
        workspacePath: projectPath,
        runId: artifact.runId,
        review: buildNuwaAuthorReview({ snapshot: loaded.snapshot, bundle: loaded.bundle, branchId: branch.id })
      });
      const acceptedCandidateReview = decideCandidateReviewArtifact({
        projectId: explorationInput.projectId,
        reviewId: candidateReview.id,
        candidateId: explorationInput.routeId,
        decision: "accepted",
        confirmationReceipt: { planningEventId: null, impactReviewId: reviewId },
        decidedAt: explorationInput.submittedAt || candidateReview.createdAt
      });
      const next = {
        ...artifact,
        status: "submitted-to-impact" as const,
        selectedRouteIndex: routeIndex,
        reviewId,
        candidateRuns: candidateRuns.map((candidate, index) => index === routeIndex ? { ...candidate, status: "selected" as const } : candidate)
      };
      writeExploration(projectPath, next);
      const overlay = buildProductOverlay(next, loaded.snapshot, branch, routeIndex);
      writeOverlay(projectPath, overlay);
      return {
        exploration: projectExploration(next, projectPath, false),
        review: projectReview(reviewArtifact, loaded.snapshot, false),
        overlay,
        candidateReview: acceptedCandidateReview
      };
    },

    rejectStoryExplorationRoute(explorationInput: { projectId: string; explorationId: string; routeId: string; reason?: string }): StoryStudioNuwaExploration {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const artifact = requireExploration(projectPath, explorationInput.explorationId);
      assertExplorationCurrent(workspace, artifact, projectPath);
      if (artifact.status === "submitted-to-impact") throw new Error("已经进入影响评审的候选不能在女娲比较页淘汰。");
      const loaded = readNuwaRunPack(projectPath, artifact.runId);
      if (!loaded.bundle) throw new Error("请先整理女娲候选路线。");
      const routeIndex = routeIndexFromProductId(explorationInput.routeId, loaded.bundle.branches.length);
      const candidateRuns = persistedCandidateRuns(artifact);
      const candidate = candidateRuns[routeIndex];
      if (!candidate) throw new Error("候选运行不存在。");
      if (candidate.status === "rejected") return projectExploration(artifact, projectPath, false);
      const next = {
        ...artifact,
        candidateRuns: candidateRuns.map((item, index) => index === routeIndex ? { ...item, status: "rejected" as const } : item)
      };
      writeExploration(projectPath, next);
      return projectExploration(next, projectPath, false);
    },

    cancelStoryExploration(explorationInput: { projectId: string; explorationId: string }): StoryStudioNuwaExploration {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: explorationInput.projectId });
      const artifact = requireExploration(projectPath, explorationInput.explorationId);
      if (artifact.status === "submitted-to-impact") throw new Error("已经进入影响评审的推演不能取消，请在评审中保持当前世界。");
      const next = { ...artifact, status: "cancelled" as const };
      writeExploration(projectPath, next);
      return projectExploration(next, projectPath, false);
    },

    readIntelligenceOverlay(overlayInput: { projectId: string }): StoryStudioIntelligenceOverlay | null {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: overlayInput.projectId });
      return readOverlay(projectPath);
    },

    readReviewHistory(historyInput: { projectId: string }): StoryStudioReviewHistory {
      const projectPath = workspace.resolveProjectWorkspacePath({ projectId: historyInput.projectId });
      const reviews = listReviews(projectPath);
      const changeSets = listChangeSets(projectPath);
      const changeByReview = new Map(changeSets.map((changeSet) => [changeSet.reviewId, changeSet]));
      return structuredClone({
        version: "story-studio-review-history-product/v1",
        entries: reviews.map((review) => {
          const snapshot = buildSnapshotForReviewSource(projectPath, review.source);
          const projected = projectReview(review, snapshot, readReviewSourceRevisionToken(workspace, review.projectId, review.source) !== review.source.revisionToken);
          const changeSet = changeByReview.get(review.reviewId);
          return {
            reviewId: review.reviewId,
            changeSetId: changeSet?.changeSetId ?? null,
            sourceScene: review.source.title,
            sourceKind: review.origin?.kind === "nuwa-route" ? "女娲候选路线" as const
              : review.origin?.kind === "planning-event" ? "规划事件" as const
              : "作者想法" as const,
            authorGoal: review.authorGoal,
            authorChoice: projected.authorChoice?.label || "等待作者选择",
            evidenceCoverage: projected.impact.evidenceCoverage,
            changeStatus: changeSet ? changeStatusLabel(changeSet.status) : "尚未建立受保护的变更单",
            eventStatus: changeSet?.status === "applied" ? "世界事件已记录" as const
              : changeSet?.status === "abandoned" ? "已放弃" as const
              : "尚未写入世界事件" as const,
            stale: projected.status === "stale"
          };
        })
      });
    }
  };
}

function projectReview(artifact: PersistedImpactReview, currentSnapshot: StorySnapshot, sceneStale: boolean): StoryStudioImpactReview {
  const stale = sceneStale || artifact.snapshotHash !== currentSnapshot.snapshotHash;
  const evidenceProjection = projectStoryEvidenceForAuthor(artifact.evidenceBundle);
  const routeEvidence = artifact.validatedEvidence || [];
  const evidenceCount = routeEvidence.length || artifact.evidenceBundle.coverage.explainedImpacts;
  const evidenceTotal = routeEvidence.length ? 1 : artifact.evidenceBundle.coverage.totalImpacts;
  const evidenceExplained = routeEvidence.length ? 1 : artifact.evidenceBundle.coverage.explainedImpacts;
  const selectedOption = artifact.resolution?.workspace.selectedOption;
  const snapshotObjects = new Map(currentSnapshot.notes.map((note) => [note.id, note]));
  const involvedIds = new Set([
    ...artifact.intent.relatedCharacters,
    ...artifact.intent.relatedEvents,
    ...artifact.intent.relatedLocations
  ]);
  const preview = artifact.preview;

  return structuredClone({
    version: "story-studio-impact-review-product/v1",
    id: artifact.reviewId,
    status: stale ? "stale" : artifact.status,
    source: {
      kind: artifact.source.kind,
      id: artifact.source.id,
      title: artifact.source.title,
      sceneId: artifact.source.kind === "scene" ? artifact.source.id : "",
      sceneTitle: artifact.source.title,
      planningEventId: artifact.source.kind === "planning-event" ? artifact.source.id : null,
      authorGoal: artifact.authorGoal,
      involvedObjects: [...involvedIds].flatMap((id) => {
        const note = snapshotObjects.get(id);
        return note ? [{ id: note.id, title: note.title, type: objectTypeLabel(note.type) }] : [];
      }),
      lockedRules: currentSnapshot.lockedRules.map((note) => note.title),
      originLabel: artifact.origin?.label || "作者直接提出的变化"
    },
    impact: {
      characters: artifact.report.affectedCharacters.map((item) => ({ id: item.characterId, summary: productSentence(item.summary) })),
      events: artifact.report.affectedEvents.map((item) => ({ id: item.eventId, summary: productSentence(item.summary) })),
      relationships: artifact.report.affectedRelationships.map((item) => ({ id: `${item.sourceId}->${item.targetId}`, summary: productSentence(item.summary) })),
      rulesAndLocations: artifact.report.affectedRules.map((item) => ({ id: item.rule, summary: productSentence(item.summary) })),
      risks: artifact.report.risks.map(productSentence),
      opportunities: artifact.report.opportunities.map(productSentence),
      evidenceCoverage: `${evidenceExplained}/${evidenceTotal} 项影响有可追溯证据`,
      evidenceCount
    },
    options: artifact.report.alternatives.map((alternative, index) => {
      const option = artifact.decisionWorkspace.options[index];
      return {
        id: option.id,
        label: optionLabel(alternative.label),
        summary: alternativeSummary(alternative.label),
        consequence: alternativeConsequence(alternative.label),
        riskLevel: option.riskLevel,
        selected: selectedOption?.id === option.id
      };
    }),
    evidence: [
      ...routeEvidence.map((item) => ({
        title: "候选路线证据",
        explanation: productSentence(item.excerpt || "这条候选路线引用了当前故事资料。"),
        sources: [item.title]
      })),
      ...evidenceProjection.sections.flatMap((section) => section.items.map((item) => ({
        title: section.title,
        explanation: productSentence(item.explanation),
        sources: item.sourceLabels
      })))
    ],
    preview: preview ? {
      before: [
        ...preview.beforeState.characterStates.map((item) => `${item.name}：${statusLabel(item.status)}`),
        ...preview.beforeState.relationshipStates.map((item) => `${item.sourceId} → ${item.targetId}：${statusLabel(item.status)}`),
        ...preview.beforeState.eventStates.map((item) => `${item.eventId}: ${item.consequences.join("；")}`)
      ],
      change: [
        ...preview.changeSet.addedFacts.map((item) => productSentence(item.summary)),
        ...preview.changeSet.changedRelationships.map((item) => productSentence(item.summary)),
        ...preview.changeSet.triggeredEvents.map((item) => productSentence(item.summary))
      ],
      after: [
        ...preview.afterState.projectedCharacterStates.map((item) => `${item.name}：${productSentence(item.projectedStatus)}`),
        ...preview.afterState.projectedWorldState.map(productSentence)
      ],
      longTermPressure: preview.afterState.affectedFutureThreads,
      preservedMysteries: currentSnapshot.openThreads.map((note) => note.title),
      assumptions: artifact.evidenceBundle.coverage.unexplainedImpactRefs
    } : null,
    authorChoice: selectedOption
      ? { label: selectedOption.type === "reject_change" ? "保持当前世界" : optionLabelFromType(selectedOption.type), status: artifact.status === "rejected" ? "rejected" : "selected" }
      : null,
    canCreateChangeSet: !stale && artifact.status === "selected" && Boolean(preview),
    mutatesMarkdown: false
  });
}

function noteIds(snapshot: StorySnapshot, selectedIds: Set<string>, type: "character" | "event" | "location"): string[] {
  return snapshot.notes.filter((note) => note.type === type && selectedIds.has(note.id)).map((note) => note.id).sort();
}

function targetScopeFor(goal: string): StoryAuthorIntent["targetScope"] {
  if (/规则|不得|必须|潮门/.test(goal)) return "world_rule";
  if (/关系|信任|怀疑|告诉|透露|背叛/.test(goal)) return "relationship";
  if (/角色|人物|身份|死亡|受伤|失踪/.test(goal)) return "character";
  if (/场景|地点|进入|来到/.test(goal)) return "new_scene";
  return "event";
}

function optionLabel(label: "immediate reveal" | "partial clue" | "delayed reveal"): string {
  if (label === "immediate reveal") return "立即揭示";
  if (label === "partial clue") return "只透露部分线索";
  return "延后揭示";
}

function optionLabelFromType(type: string): string {
  if (type === "accept_immediate_reveal") return "立即揭示";
  if (type === "accept_partial_clue") return "只透露部分线索";
  if (type === "accept_delayed_reveal") return "延后揭示";
  return "调整后的走向";
}

function alternativeSummary(label: "immediate reveal" | "partial clue" | "delayed reveal"): string {
  if (label === "immediate reveal") return "在当前场景明确揭示，让变化立刻成为可见事实。";
  if (label === "partial clue") return "给出可追踪线索，但不确认秘密全貌。";
  return "把揭示压力留到后续章节，维持当前世界状态。";
}

function alternativeConsequence(label: "immediate reveal" | "partial clue" | "delayed reveal"): string {
  if (label === "immediate reveal") return "信息更清晰，但可能过早消耗悬念。";
  if (label === "partial clue") return "回应作者意图，同时保留开放伏笔。";
  return "保持当前节奏，但未来章节需要承担兑现压力。";
}

function productSentence(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/World rules remain locked during preview\./g, "世界规则在预览阶段保持锁定。"],
    [/No committed story event is created by this preview\./g, "这次预览不会创建正式故事事件。"],
    [/affected by accept_partial_clue/g, "预计受到“部分线索”走向影响"],
    [/affected by accept_immediate_reveal/g, "预计受到“立即揭示”走向影响"],
    [/affected by accept_delayed_reveal/g, "预计受到“延后揭示”走向影响"],
    [/The intent changes existing event dependencies\./g, "这次变化会影响既有事件依赖。"],
    [/The intent touches a protected story rule or location\./g, "这次变化触及受保护的世界规则或地点。"],
    [/Let the author choose between reveal, clue, or delay\./g, "作者可以在揭示、线索与延后之间选择。"],
    [/Turn the location into a stronger scene anchor\./g, "可以让这个地点成为更明确的场景支点。"],
    [/Use the discovery to pay off an existing open loop\./g, "可以用这次发现回应已有伏笔。"],
    [/(\S+) and (\S+) relationship may shift through accept_partial_clue\./g, "$1 与 $2 的关系可能因“部分线索”发生变化。"],
    [/(\S+) and (\S+) relationship may shift through accept_immediate_reveal\./g, "$1 与 $2 的关系可能因“立即揭示”发生变化。"],
    [/(\S+) and (\S+) relationship may shift through accept_delayed_reveal\./g, "$1 与 $2 的关系可能因“延后揭示”发生变化。"],
    [/Accept partial clue/g, "采用部分线索"],
    [/Accept immediate reveal/g, "采用立即揭示"],
    [/Accept delayed reveal/g, "采用延后揭示"],
    [/Show a clue without confirming the full secret\./g, "只展示线索，不确认秘密全貌。"],
    [/Risk level:\s*medium/gi, "中等风险"],
    [/Risk level:\s*high/gi, "高风险"],
    [/Risk level:\s*low/gi, "低风险"],
    [/accept_partial_clue/g, "只透露部分线索"],
    [/accept_immediate_reveal/g, "立即揭示"],
    [/accept_delayed_reveal/g, "延后揭示"],
    [/A candidate could conflict with a locked Markdown world rule\./g, "候选路线可能与锁定的世界规则冲突。"],
    [/A candidate could resolve an open mystery before the author intends\./g, "候选路线可能过早解开作者仍想保留的谜题。"],
    [/\bactive\b/gi, "当前有效"],
    [/\bmissing\b/gi, "当前故事中尚未出现"]
  ];
  return replacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
}

function statusLabel(value: string): string {
  return ({
    active: "当前有效",
    missing: "当前故事中尚未出现",
    locked: "已锁定",
    open: "尚未解决",
    drafting: "写作中",
    reviewing: "待检查",
    revising: "修订中",
    completed: "已完成"
  } as Record<string, string>)[value] || productSentence(value);
}

function objectTypeLabel(value: string): string {
  return ({
    character: "人物",
    location: "地点",
    event: "事件",
    item: "物品",
    faction: "势力",
    rule: "规则",
    thread: "伏笔",
    scene: "场景",
    chapter: "章节"
  } as Record<string, string>)[value] || "世界资料";
}

function riskLabelForProduct(value: "low" | "medium" | "high"): string {
  return ({ low: "低风险", medium: "中等风险", high: "高风险" })[value];
}

function changeStatusLabel(value: PersistedAuthorChangeSet["status"]): string {
  return ({
    pending: "等待作者写入",
    applying: "正在记录世界事件",
    applied: "世界事件已记录",
    abandoned: "作者已放弃",
    stale: "故事资料已变化"
  } as const)[value];
}

function reviewDirectory(projectPath: string): string {
  return path.join(projectPath, ".world-os", "author-control", "impact-reviews");
}

function reviewPath(projectPath: string, reviewId: string): string {
  if (!/^impact-review-[a-f0-9]{16}$/.test(reviewId)) throw new Error("Impact Review identifier is invalid.");
  return path.join(reviewDirectory(projectPath), `${reviewId}.json`);
}

function writeReview(projectPath: string, artifact: PersistedImpactReview): void {
  const directory = reviewDirectory(projectPath);
  mkdirSync(directory, { recursive: true });
  const target = reviewPath(projectPath, artifact.reviewId);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
  writeFileSync(path.join(directory, "latest.json"), `${JSON.stringify({ version: "story-studio-impact-review-latest/v1", reviewId: artifact.reviewId }, null, 2)}\n`, "utf8");
}

function readReview(projectPath: string, reviewId: string): PersistedImpactReview | null {
  const target = reviewPath(projectPath, reviewId);
  if (!existsSync(target)) return null;
  const value = JSON.parse(readFileSync(target, "utf8")) as PersistedImpactReview;
  if (value.version !== REVIEW_VERSION || value.reviewId !== reviewId) throw new Error("Impact Review file is invalid.");
  return { ...value, source: normalizeReviewSource(value) };
}

function readLatestReview(projectPath: string): PersistedImpactReview | null {
  const latestPath = path.join(reviewDirectory(projectPath), "latest.json");
  if (!existsSync(latestPath)) return null;
  const latest = JSON.parse(readFileSync(latestPath, "utf8")) as { reviewId?: string };
  return latest.reviewId ? readReview(projectPath, latest.reviewId) : null;
}

function listReviews(projectPath: string): PersistedImpactReview[] {
  const directory = reviewDirectory(projectPath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => /^impact-review-[a-f0-9]{16}\.json$/.test(entry))
    .sort()
    .flatMap((entry) => {
      const review = readReview(projectPath, entry.replace(/\.json$/, ""));
      return review ? [review] : [];
    })
    .reverse();
}

function candidateReviewDirectory(projectPath: string): string {
  return path.join(projectPath, ".world-os", "author-control", "candidate-reviews");
}

function candidateReviewPath(projectPath: string, reviewId: string): string {
  if (!/^candidate-review-[a-f0-9]{16}$/.test(reviewId)) throw new Error("Candidate Review identifier is invalid.");
  return path.join(candidateReviewDirectory(projectPath), `${reviewId}.json`);
}

function writeCandidateReview(projectPath: string, artifact: PersistedCandidateReview): void {
  const directory = candidateReviewDirectory(projectPath);
  mkdirSync(directory, { recursive: true });
  const target = candidateReviewPath(projectPath, artifact.id);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
  const latest = path.join(directory, "latest.json");
  const latestTemporary = `${latest}.tmp`;
  writeFileSync(latestTemporary, `${JSON.stringify({ version: "story-studio-candidate-review-latest/v1", reviewId: artifact.id }, null, 2)}\n`, "utf8");
  renameSync(latestTemporary, latest);
}

function readCandidateReview(projectPath: string, reviewId: string): PersistedCandidateReview | null {
  const target = candidateReviewPath(projectPath, reviewId);
  if (!existsSync(target)) return null;
  const value = JSON.parse(readFileSync(target, "utf8")) as PersistedCandidateReview;
  if (value.version !== CANDIDATE_REVIEW_VERSION || value.id !== reviewId || !Array.isArray(value.candidates)) {
    throw new Error("Candidate Review file is invalid.");
  }
  return value;
}

function readLatestCandidateReview(projectPath: string): PersistedCandidateReview | null {
  const latestPath = path.join(candidateReviewDirectory(projectPath), "latest.json");
  if (!existsSync(latestPath)) return null;
  const latest = JSON.parse(readFileSync(latestPath, "utf8")) as { reviewId?: string };
  return latest.reviewId ? readCandidateReview(projectPath, latest.reviewId) : null;
}

function listCandidateReviews(projectPath: string): PersistedCandidateReview[] {
  const directory = candidateReviewDirectory(projectPath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => /^candidate-review-[a-f0-9]{16}\.json$/.test(entry))
    .flatMap((entry) => {
      const review = readCandidateReview(projectPath, entry.replace(/\.json$/, ""));
      return review ? [review] : [];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
}

function requireCandidateReview(projectPath: string, reviewId: string): PersistedCandidateReview {
  const review = readCandidateReview(projectPath, reviewId);
  if (!review) throw new Error("Candidate Review does not exist.");
  return review;
}

function projectCandidateReview(artifact: PersistedCandidateReview): StoryStudioCandidateReview {
  return structuredClone({ ...artifact, version: "story-studio-candidate-review-product/v1" as const });
}

function normalizeCandidateConfirmationReceipt(
  value: { planningEventId?: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string } | undefined
): { planningEventId: string | null; impactReviewId: string; contextReceiptId?: string; nuwaRunId?: string } {
  if (!value) throw new Error("Accepted Candidate Review requires a confirmation receipt.");
  return {
    planningEventId: value.planningEventId ? requireText(value.planningEventId, "Planning Event identifier", 180) : null,
    impactReviewId: requireText(value.impactReviewId, "Impact Review identifier", 180),
    ...(value.contextReceiptId ? { contextReceiptId: requireText(value.contextReceiptId, "Context Receipt identifier", 180) } : {}),
    ...(value.nuwaRunId ? { nuwaRunId: requireText(value.nuwaRunId, "Nuwa run identifier", 180) } : {})
  };
}

function requireReview(projectPath: string, reviewId: string): PersistedImpactReview {
  const review = readReview(projectPath, reviewId);
  if (!review) throw new Error("Impact Review does not exist.");
  return review;
}

function normalizeReviewSource(value: PersistedImpactReview): PersistedReviewSource {
  if (value.source?.kind === "scene" || value.source?.kind === "planning-event") {
    return {
      kind: value.source.kind,
      id: requireText(value.source.id, "Review source id", 180),
      relativeId: requireText(value.source.relativeId, "Review source path", 320),
      title: requireText(value.source.title, "Review source title", 160),
      revisionToken: requireText(value.source.revisionToken, "Review source revision", 128)
    };
  }
  if (value.sceneId && value.sceneRelativeId && value.sceneTitle && value.sceneRevisionToken) {
    return {
      kind: "scene",
      id: requireText(value.sceneId, "Legacy review scene", 180),
      relativeId: requireText(value.sceneRelativeId, "Legacy review scene path", 320),
      title: requireText(value.sceneTitle, "Legacy review scene title", 160),
      revisionToken: requireText(value.sceneRevisionToken, "Legacy review scene revision", 128)
    };
  }
  throw new Error("Impact Review source is invalid.");
}

function normalizeChangeSetSource(value: PersistedAuthorChangeSet): PersistedReviewSource {
  if (value.source?.kind === "scene" || value.source?.kind === "planning-event") return normalizeReviewSource({ source: value.source } as PersistedImpactReview);
  if (value.sourceScene && value.baseline.sceneRevisionToken) {
    return {
      kind: "scene",
      id: requireText(value.sourceScene.id, "Legacy Change Set scene", 180),
      relativeId: requireText(value.sourceScene.relativeId, "Legacy Change Set scene path", 320),
      title: requireText(value.sourceScene.title, "Legacy Change Set scene title", 160),
      revisionToken: requireText(value.baseline.sceneRevisionToken, "Legacy Change Set source revision", 128)
    };
  }
  throw new Error("Change Set source is invalid.");
}

function buildSnapshotForReviewSource(projectPath: string, source: PersistedReviewSource): StorySnapshot {
  return buildStorySnapshot({ workspacePath: projectPath, selectedScenePath: source.kind === "scene" ? source.relativeId : "" });
}

function readReviewSourceRevisionToken(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  projectId: string,
  source: PersistedReviewSource
): string {
  try {
    return source.kind === "scene"
      ? workspace.readWritingDocument({ projectId, documentId: source.id }).revisionToken
      : workspace.readWorldObject({ projectId, objectId: source.id }).revisionToken;
  } catch {
    return "missing-source";
  }
}

function requireText(value: string, label: string, maxLength: number): string {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`${label} is invalid.`);
  return normalized;
}

function requireArtifactId(value: string, label: string): string {
  const normalized = requireText(value, label, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function requireTimestamp(value: string): string {
  const normalized = requireText(value, "Timestamp", 64);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error("Timestamp is invalid.");
  return normalized;
}

function relationReceipt(candidateEdgeId: string, label: string, action: PredictionRelationReceiptItem["action"], sourceEventId: string | null, targetEventId: string | null, relationId: string | null, relationTypeId: string | null): PredictionRelationReceiptItem {
  return { candidateEdgeId, label, action, sourceEventId, targetEventId, relationId, relationTypeId };
}

function previewBefore(preview: NonNullable<PersistedImpactReview["preview"]>): string[] {
  return [
    ...preview.beforeState.characterStates.map((item) => `${item.name}：${statusLabel(item.status)}`),
    ...preview.beforeState.relationshipStates.map((item) => `${item.sourceId} → ${item.targetId}：${statusLabel(item.status)}`),
    ...preview.beforeState.eventStates.map((item) => `${item.eventId}: ${item.consequences.join("；")}`)
  ];
}

function previewAfter(preview: NonNullable<PersistedImpactReview["preview"]>): string[] {
  return [
    ...preview.afterState.projectedCharacterStates.map((item) => `${item.name}：${productSentence(item.projectedStatus)}`),
    ...preview.afterState.projectedWorldState.map(productSentence)
  ];
}

function buildApplyIntent(artifact: PersistedAuthorChangeSet): PersistedApplyIntent {
  const changeSetRevision = stableHash({
    version: artifact.version,
    changeSetId: artifact.changeSetId,
    reviewId: artifact.reviewId,
    projectId: artifact.projectId,
    source: artifact.source,
    baseline: artifact.baseline,
    affectedNoteIds: artifact.affectedNoteIds,
    structuredChanges: artifact.structuredChanges,
    evidenceRefs: artifact.evidenceRefs,
    before: artifact.before,
    change: artifact.change,
    after: artifact.after,
    authorDecision: artifact.authorDecision,
    candidate: artifact.candidate,
    applicationMode: artifact.application.mode
  });
  const authorDecisionRef = `author-decision-${stableHash({
    reviewId: artifact.reviewId,
    optionId: artifact.authorDecision.optionId,
    status: artifact.authorDecision.status
  }).slice(0, 24)}`;
  const applyOperationKey = `author-change-set-apply-${stableHash({
    contractVersion: APPLY_CONTRACT_VERSION,
    projectId: artifact.projectId,
    changeSetId: artifact.changeSetId,
    changeSetRevision,
    authorDecisionRef
  })}`;
  const targetEventRef = `event.author-confirmed-${stableHash({
    projectId: artifact.projectId,
    applyOperationKey
  }).slice(0, 24)}`;
  const title = `${artifact.source.title} · ${artifact.authorDecision.label}`;
  const body = eventMarkdown(artifact, "");
  const provenance = {
    sourceChangeSetId: artifact.changeSetId,
    sourceChangeSetRevision: changeSetRevision,
    authorDecisionRef,
    applyOperationKey
  };
  const eventWithoutIntentHash = {
    id: targetEventRef,
    relativePath: `world/events/${targetEventRef}.md`,
    title,
    status: "committed" as const,
    tags: ["作者确认"] as ["作者确认"],
    plannedFrom: artifact.source.kind === "planning-event" ? artifact.source.id : null,
    body,
    provenance
  };
  const intentHash = stableHash({
    contractVersion: APPLY_CONTRACT_VERSION,
    projectId: artifact.projectId,
    changeSetId: artifact.changeSetId,
    changeSetRevision,
    authorDecisionRef,
    applyOperationKey,
    targetEventRef,
    event: eventWithoutIntentHash
  });
  return {
    version: APPLY_INTENT_VERSION,
    contractVersion: APPLY_CONTRACT_VERSION,
    projectId: artifact.projectId,
    changeSetId: artifact.changeSetId,
    changeSetRevision,
    authorDecisionRef,
    applyOperationKey,
    targetEventRef,
    intentHash,
    event: {
      ...eventWithoutIntentHash,
      provenance: { ...provenance, intentHash }
    }
  };
}

function applyIntentPath(projectPath: string, changeSetId: string): string {
  changeSetPath(projectPath, changeSetId);
  return path.join(changeSetDirectory(projectPath), `${changeSetId}.apply-intent.v1.json`);
}

function readApplyIntent(projectPath: string, changeSetId: string): PersistedApplyIntent | null {
  let result: ReturnType<typeof readApplyIntentResult>;
  try {
    result = readApplyIntentResult(projectPath, changeSetId);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw applyError("APPLY_INTENT_MISMATCH", "写入意图无法解析，禁止继续。");
  }
  if (result.status === "missing") return null;
  if (result.status === "invalid") {
    throw applyError("APPLY_INTENT_MISMATCH", "写入意图身份不完整，禁止继续。");
  }
  return result.intent;
}

function readApplyIntentResult(projectPath: string, changeSetId: string):
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; intent: PersistedApplyIntent } {
  const source = readExistingUtf8(projectPath, applyIntentPath(projectPath, changeSetId));
  if (source == null) return { status: "missing" };
  const value = JSON.parse(source) as PersistedApplyIntent;
  if (
    value.version !== APPLY_INTENT_VERSION ||
    value.contractVersion !== APPLY_CONTRACT_VERSION ||
    value.changeSetId !== changeSetId ||
    value.event?.id !== value.targetEventRef ||
    value.event?.provenance?.intentHash !== value.intentHash
  ) return { status: "invalid" };
  return { status: "valid", intent: value };
}

function writeApplyIntentOnce(
  projectPath: string,
  intent: PersistedApplyIntent,
  onBoundary: (boundary: AtomicFileBoundary) => void
): PersistedApplyIntent {
  const target = applyIntentPath(projectPath, intent.changeSetId);
  const source = `${JSON.stringify(intent, null, 2)}\n`;
  let publication: "created" | "exists";
  try {
    publication = publishFileNoReplace({ rootPath: projectPath, targetPath: target, content: source, onBoundary });
  } catch (error) {
    if (error instanceof AuthorChangeSetApplyError) throw error;
    throw applyError("ATOMIC_PUBLISH_UNSUPPORTED", "当前文件系统无法完成不可覆盖的写入意图发布。");
  }
  if (publication === "exists" && readExistingUtf8(projectPath, target) !== source) {
    throw applyError("APPLY_INTENT_MISMATCH", "并发写入意图与当前变更单不一致，禁止继续。");
  }
  return readApplyIntent(projectPath, intent.changeSetId)!;
}

function sameApplyIntent(left: PersistedApplyIntent, right: PersistedApplyIntent): boolean {
  return stableHash(left) === stableHash(right);
}

function emitApplyFault(
  input: {
    faultInjector?: (
      point: AuthorChangeSetApplyFaultPoint,
      context: { projectId: string; changeSetId: string; applyOperationKey: string; targetEventRef: string }
    ) => void;
  },
  point: AuthorChangeSetApplyFaultPoint,
  intent: PersistedApplyIntent
): void {
  input.faultInjector?.(point, {
    projectId: intent.projectId,
    changeSetId: intent.changeSetId,
    applyOperationKey: intent.applyOperationKey,
    targetEventRef: intent.targetEventRef
  });
}

function operationEvents(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  intent: PersistedApplyIntent,
  readIndex?: CanonEventReadIndex
) {
  if (readIndex) return readIndex.eventsByOperation.get(intent.applyOperationKey) ?? [];
  return workspace.listWorldObjects({ projectId: intent.projectId, type: "event" })
    .map((summary) => workspace.readWorldObject({ projectId: intent.projectId, objectId: summary.id }))
    .filter((event) => event.properties.apply_operation_key === intent.applyOperationKey);
}

function assertOperationMultiplicity(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  intent: PersistedApplyIntent,
  readIndex?: CanonEventReadIndex
): void {
  const events = operationEvents(workspace, intent, readIndex);
  if (events.length > 1) {
    throw applyError("MULTIPLE_EVENTS_FOR_OPERATION", "同一作者确认操作对应多个事件，禁止自动删除或认领。");
  }
  if (events.length === 1 && events[0].id !== intent.targetEventRef) {
    throw applyError("EVENT_PROVENANCE_MISMATCH", "事件 provenance 指向当前操作但事件身份不匹配。");
  }
}

function readEventIfPresent(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  projectId: string,
  eventId: string
) {
  const exists = workspace.listWorldObjects({ projectId, type: "event" }).some((event) => event.id === eventId);
  return exists ? workspace.readWorldObject({ projectId, objectId: eventId }) : null;
}

function validateAppliedEvent(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  artifact: PersistedAuthorChangeSet,
  intent: PersistedApplyIntent,
  readIndex?: CanonEventReadIndex
): void {
  assertOperationMultiplicity(workspace, intent, readIndex);
  const event = readIndex?.eventsById.get(intent.targetEventRef) ?? readEventIfPresent(workspace, intent.projectId, intent.targetEventRef);
  if (!event) {
    throw applyError("APPLIED_EVENT_MISSING", "变更单已记录 applied，但对应的确认事件缺失。");
  }
  if (
    artifact.application.appliedEventId !== intent.targetEventRef ||
    event.type !== "event" ||
    event.status !== "committed" ||
    event.properties.source_change_set_id !== intent.changeSetId ||
    event.properties.source_change_set_revision !== intent.changeSetRevision ||
    event.properties.author_decision_ref !== intent.authorDecisionRef ||
    event.properties.apply_operation_key !== intent.applyOperationKey ||
    event.properties.apply_intent_hash !== intent.intentHash
  ) {
    throw applyError("EVENT_PROVENANCE_MISMATCH", "applied 回执与确认事件 provenance 不一致。");
  }
}

function isCanonRecordValidationError(error: unknown): error is AuthorChangeSetApplyError {
  if (!(error instanceof AuthorChangeSetApplyError)) return false;
  switch (error.code) {
    case "APPLIED_EVENT_MISSING":
    case "EVENT_PROVENANCE_MISMATCH":
      return true;
    default:
      return false;
  }
}

function sameReviewSource(left: PersistedReviewSource, right: PersistedReviewSource): boolean {
  return left.kind === right.kind &&
    left.id === right.id &&
    left.relativeId === right.relativeId &&
    left.title === right.title &&
    left.revisionToken === right.revisionToken;
}

/**
 * Confirms an event is the unique result of a fully persisted author adoption.
 * Any absent, malformed, or contradictory record is intentionally not readable
 * as Canon; this function is never used by the apply path and has no writes.
 */
function verifyCanonEventRead(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  projectPath: string,
  projectId: string,
  eventId: string,
  readIndex?: CanonEventReadIndex
): boolean {
  const event = readIndex?.eventsById.get(eventId) ?? readEventIfPresent(workspace, projectId, eventId);
  if (
    !event ||
    event.type !== "event" ||
    event.status !== "committed" ||
    !event.tags.includes("作者确认")
  ) return false;

  const changeSetId = event.properties.source_change_set_id;
  if (typeof changeSetId !== "string" || !isChangeSetId(changeSetId)) return false;
  const artifact = readChangeSet(projectPath, changeSetId);
  if (
    !artifact ||
    artifact.projectId !== projectId ||
    artifact.status !== "applied" ||
    artifact.application.mode !== "single-event-record"
  ) return false;

  const review = readReview(projectPath, artifact.reviewId);
  if (
    !review ||
    review.projectId !== projectId ||
    review.status !== "selected" ||
    !review.resolution?.commitCandidate ||
    !sameReviewSource(review.source, artifact.source) ||
    stableHash(review.resolution.commitCandidate) !== stableHash(artifact.candidate) ||
    review.resolution.commitCandidate.selectedDecision.optionId !== artifact.authorDecision.optionId ||
    review.resolution.commitCandidate.selectedDecision.status !== artifact.authorDecision.status
  ) return false;

  const intentResult = readApplyIntentResult(projectPath, artifact.changeSetId);
  if (intentResult.status !== "valid" || !sameApplyIntent(intentResult.intent, buildApplyIntent(artifact))) return false;
  const intent = intentResult.intent;

  try {
    validateAppliedEvent(workspace, artifact, intent, readIndex);
    return event.id === intent.targetEventRef;
  } catch (error) {
    if (isCanonRecordValidationError(error)) return false;
    throw error;
  }
}

type CanonEventReadIndex = {
  projectPath: string;
  events: StoryStudioWorldObject[];
  eventsById: Map<string, StoryStudioWorldObject>;
  eventsByOperation: Map<string, StoryStudioWorldObject[]>;
};

function buildCanonEventReadIndex(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  projectId: string
): CanonEventReadIndex {
  const projectPath = workspace.resolveProjectWorkspacePath({ projectId });
  const events = workspace.listWorldObjects({ projectId, type: "event" })
    .map((event) => workspace.readWorldObject({ projectId, objectId: event.id }));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const eventsByOperation = new Map<string, StoryStudioWorldObject[]>();
  for (const event of events) {
    const operationKey = event.properties.apply_operation_key;
    if (typeof operationKey !== "string") continue;
    const claimants = eventsByOperation.get(operationKey) ?? [];
    claimants.push(event);
    eventsByOperation.set(operationKey, claimants);
  }
  return { projectPath, events, eventsById, eventsByOperation };
}

function validateLegacyAppliedEvent(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  artifact: PersistedAuthorChangeSet
): void {
  const eventId = artifact.application.appliedEventId;
  if (!eventId) {
    throw applyError("APPLIED_EVENT_MISSING", "旧版 applied 变更单没有可验证的确认事件回执。");
  }
  const event = readEventIfPresent(workspace, artifact.projectId, eventId);
  if (!event) {
    throw applyError("APPLIED_EVENT_MISSING", "变更单已记录 applied，但对应的确认事件缺失。");
  }
  if (event.type !== "event" || event.status !== "committed") {
    throw applyError("EVENT_PROVENANCE_MISMATCH", "旧版 applied 回执指向的对象不是已确认事件。");
  }
}

function applyError(code: AuthorChangeSetApplyErrorCode, message: string): AuthorChangeSetApplyError {
  return new AuthorChangeSetApplyError(code, message);
}

function changeSetDirectory(projectPath: string): string {
  return path.join(projectPath, ".world-os", "author-control", "change-sets");
}

function isChangeSetId(changeSetId: string): boolean {
  return /^author-change-set-[a-f0-9]{16}$/.test(changeSetId);
}

function changeSetPath(projectPath: string, changeSetId: string): string {
  if (!isChangeSetId(changeSetId)) throw new Error("Change Set identifier is invalid.");
  return path.join(changeSetDirectory(projectPath), `${changeSetId}.json`);
}

function writeChangeSet(
  projectPath: string,
  artifact: PersistedAuthorChangeSet,
  onBoundary?: (boundary: AtomicFileBoundary) => void
): void {
  const directory = changeSetDirectory(projectPath);
  mkdirSync(directory, { recursive: true });
  const target = changeSetPath(projectPath, artifact.changeSetId);
  replaceFileAtomically({
    rootPath: projectPath,
    targetPath: target,
    content: `${JSON.stringify(artifact, null, 2)}\n`,
    onBoundary
  });
  replaceFileAtomically({
    rootPath: projectPath,
    targetPath: path.join(directory, "latest.json"),
    content: `${JSON.stringify({ version: "story-studio-author-change-set-latest/v1", changeSetId: artifact.changeSetId }, null, 2)}\n`
  });
}

function readChangeSet(projectPath: string, changeSetId: string): PersistedAuthorChangeSet | null {
  const target = changeSetPath(projectPath, changeSetId);
  if (!existsSync(target)) return null;
  const value = JSON.parse(readFileSync(target, "utf8")) as PersistedAuthorChangeSet;
  if (value.version !== CHANGE_SET_VERSION || value.changeSetId !== changeSetId) throw new Error("Change Set file is invalid.");
  const source = normalizeChangeSetSource(value);
  return {
    ...value,
    source,
    baseline: {
      ...value.baseline,
      sourceRevisionToken: value.baseline.sourceRevisionToken || value.baseline.sceneRevisionToken || source.revisionToken
    }
  };
}

function readLatestChangeSet(projectPath: string): PersistedAuthorChangeSet | null {
  const latestPath = path.join(changeSetDirectory(projectPath), "latest.json");
  if (!existsSync(latestPath)) return null;
  const latest = JSON.parse(readFileSync(latestPath, "utf8")) as { changeSetId?: string };
  return latest.changeSetId ? readChangeSet(projectPath, latest.changeSetId) : null;
}

function listChangeSets(projectPath: string): PersistedAuthorChangeSet[] {
  const directory = changeSetDirectory(projectPath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => /^author-change-set-[a-f0-9]{16}\.json$/.test(entry))
    .sort()
    .flatMap((entry) => {
      const changeSet = readChangeSet(projectPath, entry.replace(/\.json$/, ""));
      return changeSet ? [changeSet] : [];
    });
}

function requireChangeSet(projectPath: string, changeSetId: string): PersistedAuthorChangeSet {
  const artifact = readChangeSet(projectPath, changeSetId);
  if (!artifact) throw new Error("Change Set does not exist.");
  return artifact;
}

function isChangeSetStale(workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>, artifact: PersistedAuthorChangeSet): boolean {
  if (readReviewSourceRevisionToken(workspace, artifact.projectId, artifact.source) !== artifact.baseline.sourceRevisionToken) return true;
  return artifact.baseline.objectRevisions.some((baseline) => {
    try {
      return workspace.readWorldObject({ projectId: artifact.projectId, objectId: baseline.objectId }).revisionToken !== baseline.revisionToken;
    } catch {
      return true;
    }
  });
}

function projectChangeSet(artifact: PersistedAuthorChangeSet, stale: boolean): StoryStudioAuthorChangeSet {
  const status = stale && !["applied", "abandoned"].includes(artifact.status) ? "stale" : artifact.status;
  return structuredClone({
    version: "story-studio-author-change-set-product/v1",
    id: artifact.changeSetId,
    reviewId: artifact.reviewId,
    status,
    source: { sceneId: artifact.source.kind === "scene" ? artifact.source.id : "", sceneTitle: artifact.source.title },
    affectedNoteIds: artifact.affectedNoteIds,
    changes: artifact.structuredChanges.map((change) => ({ id: change.id, summary: productSentence(change.summary), evidenceCount: change.evidenceRefs.length })),
    before: artifact.before,
    change: artifact.change.map(productSentence),
    after: artifact.after.map(productSentence),
    authorDecision: artifact.authorDecision,
    application: {
      canApply: status === "pending",
      reason: artifact.application.reason,
      eventRecorded: status === "applied" && Boolean(artifact.application.appliedEventId),
      appliedEventId: artifact.application.appliedEventId,
      markdownWrites: artifact.application.markdownWrites,
      sceneProseChanged: false,
      objectNotesChanged: false,
      projectedEffects: artifact.after.map(productSentence).filter((item) => item !== "这次预览不会创建正式故事事件。")
    }
  });
}

function eventMarkdown(artifact: PersistedAuthorChangeSet, _commitId: string): string {
  return [
    `# ${artifact.source.title} · ${artifact.authorDecision.label}`,
    "",
    "## 作者选择",
    "",
    artifact.authorDecision.label,
    "",
    "## 已确认的事件变化",
    "",
    ...artifact.structuredChanges.map((change) => `- ${productSentence(change.summary)}`),
    "",
    "## 证据引用",
    "",
    ...artifact.evidenceRefs.map((evidenceRef) => `- ${evidenceRef}`),
    "",
    "事件记录：已由作者确认",
    "变更来源：作者确认的受保护变更单",
    ""
  ].join("\n");
}

function explorationDirectory(projectPath: string): string {
  return path.join(projectPath, ".world-os", "author-control", "explorations");
}

function explorationPath(projectPath: string, explorationId: string): string {
  if (!/^story-exploration-[a-f0-9]{16}$/.test(explorationId)) throw new Error("Story exploration identifier is invalid.");
  return path.join(explorationDirectory(projectPath), `${explorationId}.json`);
}

function writeExploration(projectPath: string, artifact: PersistedNuwaExploration): void {
  const directory = explorationDirectory(projectPath);
  mkdirSync(directory, { recursive: true });
  const target = explorationPath(projectPath, artifact.explorationId);
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
  writeFileSync(path.join(directory, "latest.json"), `${JSON.stringify({ version: "story-studio-nuwa-exploration-latest/v1", explorationId: artifact.explorationId }, null, 2)}\n`, "utf8");
}

function readExploration(projectPath: string, explorationId: string): PersistedNuwaExploration | null {
  const target = explorationPath(projectPath, explorationId);
  if (!existsSync(target)) return null;
  const value = JSON.parse(readFileSync(target, "utf8")) as PersistedNuwaExploration;
  if (value.version !== EXPLORATION_VERSION || value.explorationId !== explorationId) throw new Error("Story exploration file is invalid.");
  return value;
}

function readLatestExploration(projectPath: string): PersistedNuwaExploration | null {
  const latestPath = path.join(explorationDirectory(projectPath), "latest.json");
  if (!existsSync(latestPath)) return null;
  const latest = JSON.parse(readFileSync(latestPath, "utf8")) as { explorationId?: string };
  return latest.explorationId ? readExploration(projectPath, latest.explorationId) : null;
}

function requireExploration(projectPath: string, explorationId: string): PersistedNuwaExploration {
  const artifact = readExploration(projectPath, explorationId);
  if (!artifact) throw new Error("女娲推演不存在。");
  return artifact;
}

function persistedCandidateRuns(artifact: PersistedNuwaExploration): NonNullable<PersistedNuwaExploration["candidateRuns"]> {
  if (artifact.candidateRuns?.length) return artifact.candidateRuns.map((candidate) => ({ ...candidate }));
  return [{
    candidateId: "candidate-1",
    runId: artifact.runId,
    seed: NUWA_AUTHOR_LOOP_SEEDS[0],
    snapshotHash: artifact.snapshotHash,
    status: "candidate"
  }];
}

function assertExplorationCurrent(
  workspace: ReturnType<typeof createStoryStudioWorkspaceOperations>,
  artifact: PersistedNuwaExploration,
  projectPath: string
): void {
  if (artifact.sourceKind === "standalone") {
    const snapshot = buildStorySnapshot({ workspacePath: projectPath });
    if (snapshot.snapshotHash !== (artifact.canonicalSnapshotHash ?? artifact.snapshotHash)) {
      throw new Error("世界资料已经改变，请根据当前资料重新准备独立排演。");
    }
    return;
  }
  const scene = workspace.readWritingDocument({ projectId: artifact.projectId, documentId: artifact.sceneId });
  const snapshot = buildStorySnapshot({ workspacePath: projectPath, selectedScenePath: artifact.sceneRelativeId });
  if (scene.revisionToken !== artifact.sceneRevisionToken || snapshot.snapshotHash !== (artifact.canonicalSnapshotHash ?? artifact.snapshotHash)) {
    throw new Error("故事资料已经改变，请根据当前场景重新规划。");
  }
}

function projectExploration(artifact: PersistedNuwaExploration, projectPath: string, sceneStale: boolean): StoryStudioNuwaExploration {
  const loaded = readNuwaRunPack(projectPath, artifact.runId);
  const manifest = readNuwaBackendManifest(projectPath, artifact.runId);
  const readiness = getNuwaSynthesisReadiness(projectPath, artifact.runId);
  const standalone = artifact.sourceKind === "standalone";
  const sandbox = standalone ? readNuwaStandaloneSandboxContext(projectPath, artifact.runId) : null;
  const stale = sceneStale || buildStorySnapshot({ workspacePath: projectPath, ...(standalone ? {} : { selectedScenePath: artifact.sceneRelativeId }) }).snapshotHash !== (artifact.canonicalSnapshotHash ?? artifact.snapshotHash);
  const executionByRole = new Map(manifest.executions.map((execution) => [execution.role, execution]));
  const candidateProjection = loaded.bundle?.candidateRuns || [];
  const candidateStatusById = new Map((artifact.candidateRuns || []).map((candidate) => [candidate.candidateId, candidate.status]));
  const routes = loaded.bundle?.branches.map((branch, index) => {
    const candidate = candidateProjection[index];
    const authorView = candidate ? createNuwaCandidateAuthorViewModel({ candidate }) : undefined;
    return {
      id: productRouteId(index),
      title: authorView?.direction || productSentence(branch.title),
      summary: authorView?.keyAction || productSentence(branch.summary),
      immediateConsequence: authorView?.directResult || productSentence(branch.immediateConsequence),
      mediumTermConsequence: authorView?.downstreamImpact || productSentence(branch.mediumTermConsequence),
      longTermPressure: productSentence(branch.longTermPressure),
      preservedMysteries: authorView?.unknowns || branch.preservedMysteries,
      risks: authorView?.risks || branch.risks.map((risk) => productSentence(risk.summary)),
      assumptions: branch.assumptions.map(productSentence),
      affectedObjectIds: branch.affectedObjects.flatMap((relativePath) => {
        const note = loaded.snapshot.notes.find((candidateNote) => candidateNote.relativePath === relativePath);
        return note ? [note.id] : [];
      }),
      selected: artifact.selectedRouteIndex === index,
      ...(candidate ? {
        candidateStatus: candidateStatusById.get(candidate.candidateId) || candidate.status,
        authorView,
        candidateRun: {
          candidateId: candidate.candidateId,
          runId: candidate.runId,
          seed: candidate.seed,
          startingRevision: candidate.startingRevision,
          actorDecisionSequence: candidate.actorDecisionSequence,
          beatEvolution: candidate.beatEvolution,
          stateDiff: candidate.stateDiff,
          causalChain: candidate.causalChain,
          checkpoint: candidate.checkpoint,
          unresolvedRisks: candidate.unresolvedRisks,
          sourceRefs: candidate.sourceRefs,
          traceHash: candidate.traceHash,
          knowledgeBoundary: candidate.knowledgeBoundary,
          cost: candidate.cost
        }
      } : {})
    };
  }) || [];
  const evidenceExecution = manifest.executions.find((execution) => execution.role === "evidence-critic");
  const capabilityDetail = evidenceExecution?.capability?.product?.copy
    || (evidenceExecution?.status === "accepted-by-nuwa" ? "证据检查已通过现有故事资料核验。" : "将在推演时检查引用范围和证据来源。");
  const status = stale ? "stale" : artifact.status;
  return structuredClone({
    version: "story-studio-exploration-product/v1",
    id: artifact.explorationId,
    status,
    source: { kind: standalone ? "standalone" : "scene", sceneId: artifact.sceneId, sceneTitle: artifact.sceneTitle, authorGoal: artifact.authorGoal },
    supervisor: { label: "女娲", role: "分解目标、核验证据、整理候选未来", authorDecisionRequired: true },
    specialists: loaded.run.plan.tasks.map((task) => {
      const execution = executionByRole.get(task.role);
      return {
        label: roleLabel(task.role),
        purpose: rolePurpose(task.role),
        requirement: task.requirement,
        status: !execution ? "等待" as const
          : execution.status === "accepted-by-nuwa" ? "已核验" as const
          : execution.status === "result-produced" || execution.status === "running" ? "检查中" as const
          : "不可用" as const
      };
    }),
    progress: {
      completed: readiness.validatedResultCount,
      total: loaded.run.plan.tasks.length,
      coverage: readiness.validatedResultCount === 0 ? "尚未开始" : readiness.partial ? "部分" : "完整"
    },
    routes,
    capability: { label: "证据回忆", detail: capabilityDetail },
    primaryAction: status === "stale" || status === "cancelled" ? "重新规划"
      : status === "planned" ? "开始推演"
      : status === "ready-to-synthesize" ? "整理候选路线"
      : status === "ready-for-review" ? "选择候选路线"
      : status === "submitted-to-impact" ? "查看影响评审"
      : "开始推演",
    canRun: status === "planned",
    canSynthesize: status === "ready-to-synthesize" && readiness.canSynthesize,
    canSubmitRoute: status === "ready-for-review" && routes.length > 0,
    mutatesMarkdown: false,
    modelCalls: 0,
    ...(sandbox ? {
      standaloneSandbox: {
        story: sandbox.story,
        depth: sandbox.depth,
        agents: sandbox.agents.map((agent) => ({ id: agent.id, displayName: agent.displayName, kind: agent.kind, objectId: agent.objectId }))
      }
    } : {})
  });
}

function roleLabel(role: string): string {
  return ({
    continuity: "连续性检查",
    "character-arc": "人物弧光",
    causality: "因果推演",
    foreshadowing: "伏笔检查",
    tension: "张力检查",
    "evidence-critic": "证据复核"
  } as Record<string, string>)[role] || "专业检查";
}

function rolePurpose(role: string): string {
  return ({
    continuity: "检查时间顺序、当前场景约束和锁定规则。",
    "character-arc": "检查人物目标、关系压力和成长连续性。",
    causality: "追踪眼前、中期与长期后果。",
    foreshadowing: "检查线索节奏、未解伏笔和谜题保留。",
    tension: "检查阻力、代价、选择压力与戏剧升级。",
    "evidence-critic": "确认候选路线没有声称故事资料中不存在的事实。"
  } as Record<string, string>)[role] || "检查候选路线是否符合当前世界。";
}

function productRouteId(index: number): string {
  return `route-${index + 1}`;
}

function explorationCandidateResult(
  artifact: PersistedNuwaExploration,
  snapshot: StorySnapshot,
  bundle: { runId: string; authorGoal: string; branches: StoryPredictionBranch[] }
): StoryStudioCandidateReview["result"] {
  const sources = snapshot.notes
    .filter((note) => bundle.branches.some((branch) => branch.evidence.some((evidence) => evidence.noteId === note.id)))
    .slice(0, 16)
    .map((note) => ({ id: note.id, type: note.type, label: note.title }));
  return {
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    tianyi: { authorGoal: bundle.authorGoal, authorDecisionRequired: true },
    nuwa: { candidates: bundle.branches.map((branch, index) => ({
      id: productRouteId(index),
      title: branch.title,
      change: productSentence(branch.immediateConsequence || branch.summary),
      after: productSentence(branch.longTermPressure || branch.summary)
    })) },
    ...(bundle.candidateRuns ? {
      candidateRuns: bundle.candidateRuns.map((candidate) => ({
        candidateId: candidate.candidateId,
        runId: candidate.runId,
        seed: candidate.seed,
        startingRevision: candidate.startingRevision,
        traceHash: candidate.traceHash,
        status: candidate.status
      }))
    } : {}),
    provider: { mode: "verified-nuwa-run-pack", modelCalls: 0 },
    contextPack: {
      id: `context-pack-${stableHash({ explorationId: artifact.explorationId, runId: bundle.runId, snapshotHash: snapshot.snapshotHash }).slice(0, 16)}`,
      sources: sources.length > 0 ? sources : [{ id: snapshot.project.id, type: snapshot.project.type, label: snapshot.project.title }],
      budgets: { maximumSources: 16, maximumCharacters: 16_000 }
    },
    ...(artifact.contextReceiptId ? { contextReceiptId: artifact.contextReceiptId } : {}),
    nuwaRunId: artifact.runId
  };
}

function routeIndexFromProductId(routeId: string, count: number): number {
  const match = /^route-([1-9][0-9]*)$/.exec(routeId);
  const index = match ? Number(match[1]) - 1 : -1;
  if (index < 0 || index >= count) throw new Error("候选路线不存在。");
  return index;
}

function overlayPath(projectPath: string): string {
  return path.join(projectPath, ".world-os", "author-control", "overlays", "latest.json");
}

function buildProductOverlay(
  artifact: PersistedNuwaExploration,
  snapshot: StorySnapshot,
  branch: StoryPredictionBranch,
  routeIndex: number
): StoryStudioIntelligenceOverlay {
  const notesByPath = new Map(snapshot.notes.map((note) => [note.relativePath, note]));
  const affected = branch.affectedObjects.flatMap((relativePath) => {
    const note = notesByPath.get(relativePath);
    return note ? [{ objectId: note.id, label: note.title }] : [];
  });
  const spatialChanges = affected.filter((object) => snapshot.notes.find((note) => note.id === object.objectId)?.type === "location");
  return {
    version: "story-studio-intelligence-overlay-product/v1",
    explorationId: artifact.explorationId,
    routeId: productRouteId(routeIndex),
    evidence: branch.evidence.flatMap((evidence) => {
      const note = notesByPath.get(evidence.relativePath);
      return note ? [{ objectId: note.id, label: evidence.title }] : [];
    }),
    risks: branch.risks.flatMap((risk) => affected.map((object) => ({ objectId: object.objectId, label: productSentence(risk.summary), level: riskLabelForProduct(risk.level) }))),
    candidateChanges: affected.map((object) => ({ objectId: object.objectId, label: productSentence(branch.immediateConsequence), changeType: "candidate" as const })),
    mapProjection: spatialChanges.length > 0
      ? { hasSpatialChanges: true, message: `${spatialChanges.length} 个地点存在候选空间变化，仅供预览。` }
      : { hasSpatialChanges: false, message: "这条路线没有新增地图变化。" },
    source: "validated-prediction-bundle",
    readOnly: true
  };
}

function writeOverlay(projectPath: string, overlay: StoryStudioIntelligenceOverlay): void {
  const target = overlayPath(projectPath);
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
}

function readOverlay(projectPath: string): StoryStudioIntelligenceOverlay | null {
  const target = overlayPath(projectPath);
  if (!existsSync(target)) return null;
  const value = JSON.parse(readFileSync(target, "utf8")) as StoryStudioIntelligenceOverlay;
  if (value.version !== "story-studio-intelligence-overlay-product/v1" || value.readOnly !== true) {
    throw new Error("推演叠层文件无效。");
  }
  return {
    ...value,
    mapProjection: value.mapProjection || { hasSpatialChanges: false, message: "这条路线没有新增地图变化。" }
  };
}
