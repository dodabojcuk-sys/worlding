import {
  buildStorySnapshot,
  buildNuwaAttentionContext,
  approveExecutionBriefRevision,
  computeExecutionBriefHash,
  computeExecutionSourceSetHash,
  createNuwaPlan,
  getNuwaSynthesisReadiness,
  NUWA_AUTHOR_LOOP_SEEDS,
  normalizeTianyiNuwaExecutionBrief,
  readExecutionBriefRevision,
  readLatestExecutionBriefRevision,
  readExecutionBriefRunBinding,
  readNuwaBackendManifest,
  readNuwaResultReceipt,
  readNuwaRunPack,
  stableHash,
  writeExecutionBriefRevision,
  writeExecutionBriefRunBinding,
  writeNuwaResultReceipt,
  type NuwaAgentRole,
  type NuwaResultReceipt,
  type TianyiNuwaExecutionBrief,
  type ExecutionResolvedSource,
  type StorySnapshotNote
} from "../storyIntelligence/index.ts";
import {
  archiveEventHash,
  readAuthorizedGlobalMemory,
  readMemory,
  readReceipt,
  readSession,
  visibleArchiveEventContent
} from "../storyContinuity/index.ts";
import { STORY_MEMORY_RECALL_SKILL_MANIFEST } from "../skillControl/storyMemoryRecallSkillManifest.ts";
import { createStoryStudioAuthorControl } from "./storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";
import { createStoryStudioTianyiOperations, type StoryStudioTianyiOperations } from "./storyStudioTianyiOperations.ts";

export type ExecutionBriefDraftInput = {
  projectId: string;
  authorGoal: string;
  sourceQuestion?: string;
  currentContext: TianyiNuwaExecutionBrief["currentContext"];
  startingPoint?: NonNullable<TianyiNuwaExecutionBrief["startingPoint"]>;
  participatingActorIds?: string[];
  observationCriteria?: NonNullable<TianyiNuwaExecutionBrief["observationCriteria"]>;
  createdAt?: string;
  provenance?: NonNullable<TianyiNuwaExecutionBrief["provenance"]>;
  selectedContextReceiptIds: string[];
  selectedArchiveMessageRefs: TianyiNuwaExecutionBrief["selectedArchiveMessageRefs"];
  approvedMemoryRefs: string[];
  mustKeep: string[];
  mustAvoid: string[];
  unresolvedQuestions: string[];
  expectedOutputKind: TianyiNuwaExecutionBrief["expectedOutputKind"];
  requestedRunCount?: number;
  fixedSeeds?: number[];
  allowedAgents: string[];
  allowedSkills: string[];
  capabilityBudget: TianyiNuwaExecutionBrief["capabilityBudget"];
  sensitivity: TianyiNuwaExecutionBrief["sensitivity"];
  operationId: string;
  originatingTianyiSessionId: string;
  returnDestination: TianyiNuwaExecutionBrief["returnDestination"];
};

export type ExecutionBriefChanges = Partial<Pick<ExecutionBriefDraftInput,
  "authorGoal" | "sourceQuestion" | "currentContext" | "startingPoint" | "participatingActorIds" | "observationCriteria" |
  "selectedContextReceiptIds" | "selectedArchiveMessageRefs" |
  "approvedMemoryRefs" | "mustKeep" | "mustAvoid" | "unresolvedQuestions" | "expectedOutputKind" |
  "requestedRunCount" | "fixedSeeds" | "allowedAgents" | "allowedSkills" | "capabilityBudget" | "sensitivity" | "returnDestination"
>>;

const AGENT_PREFIX = "nuwa.";
const SUPERVISOR_AGENT = "nuwa.supervisor";
const AGENT_ROLES: NuwaAgentRole[] = ["continuity", "character-arc", "causality", "foreshadowing", "tension", "evidence-critic"];
const ALLOWED_AGENTS = new Set([SUPERVISOR_AGENT, ...AGENT_ROLES.map((role) => `${AGENT_PREFIX}${role}`)]);
const ALLOWED_SKILLS = new Set([`${STORY_MEMORY_RECALL_SKILL_MANIFEST.id}@${STORY_MEMORY_RECALL_SKILL_MANIFEST.version}`]);

export function createStoryStudioIntelligenceBridgeOperations(options: {
  rootPath: string;
  stateFilePath: string;
  agentId?: string;
  now?: () => string;
  localControlToken?: string;
  tianyiOperations?: StoryStudioTianyiOperations;
}) {
  const agentId = options.agentId ?? "agent.tianyi";
  const workspace = createStoryStudioWorkspaceOperations(options);
  const authorControl = createStoryStudioAuthorControl(options);
  const tianyi = options.tianyiOperations ?? createStoryStudioTianyiOperations({ ...options, agentId });

  async function createExecutionBrief(input: ExecutionBriefDraftInput): Promise<TianyiNuwaExecutionBrief> {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const snapshot = currentSnapshot(input.projectId, projectPath);
    const briefId = `brief.${input.projectId}.${stableHash({ operationId: input.operationId }).slice(0, 12)}`;
    const existing = readExecutionBriefRevision(projectPath, briefId);
    const createdAt = input.createdAt ?? existing?.createdAt ?? options.now?.() ?? new Date().toISOString();
    const seed = normalizeTianyiNuwaExecutionBrief({
      version: "story-studio-tianyi-nuwa-execution-brief/v1",
      briefId,
      revision: 1,
      authorGoal: input.authorGoal,
      sourceQuestion: input.sourceQuestion ?? input.authorGoal,
      sourceProject: { projectId: input.projectId, projectRevision: snapshot.snapshotHash },
      currentContext: input.currentContext,
      startingPoint: input.startingPoint ?? { beatId: input.currentContext.selectionRef, checkpoint: input.currentContext.documentId },
      participatingActorIds: input.participatingActorIds ?? input.currentContext.objectIds,
      observationCriteria: input.observationCriteria ?? {
        success: ["候选未来能够在当前 Canon revision 内给出可追溯的因果差异。"],
        failure: ["候选未来使用了起始检查点之后才会知道的事实，或无法回溯到已选来源。"]
      },
      createdAt,
      provenance: input.provenance ?? { source: "tianyi", sessionId: input.originatingTianyiSessionId, contextHash: snapshot.snapshotHash },
      selectedContextReceiptIds: input.selectedContextReceiptIds,
      selectedArchiveMessageRefs: input.selectedArchiveMessageRefs,
      approvedMemoryRefs: input.approvedMemoryRefs,
      mustKeep: input.mustKeep,
      mustAvoid: input.mustAvoid,
      unresolvedQuestions: input.unresolvedQuestions,
      expectedOutputKind: input.expectedOutputKind,
      requestedRunCount: input.requestedRunCount ?? NUWA_AUTHOR_LOOP_SEEDS.length,
      fixedSeeds: input.fixedSeeds ?? [...NUWA_AUTHOR_LOOP_SEEDS],
      allowedAgents: input.allowedAgents,
      allowedSkills: input.allowedSkills,
      capabilityBudget: input.capabilityBudget,
      sensitivity: input.sensitivity,
      authorApprovalState: "draft",
      expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) },
      operationId: input.operationId,
      originatingTianyiSessionId: input.originatingTianyiSessionId,
      returnDestination: input.returnDestination
    });
    assertCurrentContextDocument(seed, currentScene(input.projectId).id);
    validateAllowLists(seed);
    const resolvedSources = await resolveCurrentSources(seed, snapshot.snapshotHash);
    const attentionContext = buildNuwaAttentionContext({
      brief: seed,
      snapshot,
      resolvedSources: resolvedSources.filter((source) => source.kind !== "story-snapshot").map((source) => ({ kind: source.kind === "archive-message" ? "archive-message" : source.kind === "context-receipt" ? "context-receipt" : "approved-memory", id: source.id, hash: source.hash }))
    });
    const prepared = withExpectedHashes(normalizeTianyiNuwaExecutionBrief({ ...seed, attentionContext }), resolvedSources);
    if (existing) {
      if (existing.revision !== 1 || stableWithoutApproval(existing) !== stableWithoutApproval(prepared)) throw new Error("Execution Brief operation already belongs to different content.");
      return existing;
    }
    return writeExecutionBriefRevision(projectPath, prepared);
  }

  async function reviseExecutionBrief(input: { projectId: string; briefId: string; expectedHash: string; changes: ExecutionBriefChanges }): Promise<TianyiNuwaExecutionBrief> {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const current = requireBrief(projectPath, input.briefId);
    if (current.sourceProject.projectId !== input.projectId) throw new Error("Execution Brief project does not match.");
    if (current.expectedHashes.brief !== input.expectedHash) throw new Error("Execution Brief expected hash conflict.");
    const changes = normalizeChanges(input.changes);
    const snapshot = currentSnapshot(input.projectId, projectPath);
    const seed = normalizeTianyiNuwaExecutionBrief({
      ...current,
      ...changes,
      sourceProject: { projectId: input.projectId, projectRevision: snapshot.snapshotHash },
      revision: current.revision + 1,
      authorApprovalState: "draft",
      expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) }
    });
    assertCurrentContextDocument(seed, currentScene(input.projectId).id);
    validateAllowLists(seed);
    const resolvedSources = await resolveCurrentSources(seed, snapshot.snapshotHash);
    const attentionContext = buildNuwaAttentionContext({
      brief: seed,
      snapshot,
      resolvedSources: resolvedSources.filter((source) => source.kind !== "story-snapshot").map((source) => ({ kind: source.kind === "archive-message" ? "archive-message" : source.kind === "context-receipt" ? "context-receipt" : "approved-memory", id: source.id, hash: source.hash }))
    });
    return writeExecutionBriefRevision(projectPath, withExpectedHashes(normalizeTianyiNuwaExecutionBrief({ ...seed, attentionContext }), resolvedSources));
  }

  async function approveExecutionBrief(input: { projectId: string; briefId: string; revision: number; expectedHash: string; expectedSourceSetHash: string }): Promise<TianyiNuwaExecutionBrief> {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const current = requireBrief(projectPath, input.briefId);
    if (current.revision !== input.revision) throw new Error("Execution Brief revision is stale.");
    if (current.expectedHashes.brief !== input.expectedHash || current.expectedHashes.sourceSet !== input.expectedSourceSetHash) throw new Error("Execution Brief approval hash conflict.");
    const snapshot = currentSnapshot(input.projectId, projectPath);
    const resolvedSources = await resolveCurrentSources(current, snapshot.snapshotHash);
    assertCurrentHashes(current, resolvedSources);
    if (current.authorApprovalState === "approved") return current;
    const approved = { ...current, authorApprovalState: "approved" as const };
    return approveExecutionBriefRevision(projectPath, approved);
  }

  function readExecutionBrief(input: { projectId: string; briefId: string; revision?: number }): TianyiNuwaExecutionBrief | null {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = readExecutionBriefRevision(projectPath, input.briefId, input.revision);
    if (brief && brief.sourceProject.projectId !== input.projectId) throw new Error("Execution Brief project does not match.");
    return brief;
  }

  async function readLatestExecutionState(input: { projectId: string }) {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = readLatestExecutionBriefRevision(projectPath);
    if (!brief) return { brief: null, exploration: null, resultReceipt: null };
    if (brief.sourceProject.projectId !== input.projectId) throw new Error("Latest Execution Brief project does not match.");
    const binding = readExecutionBriefRunBinding(projectPath, brief.briefId, brief.revision);
    const exploration = binding
      ? authorControl.readStoryExploration({ projectId: input.projectId, explorationId: binding.explorationId })
      : null;
    const resultReceipt = binding ? await readResultReceipt({ projectId: input.projectId, briefId: brief.briefId }) : null;
    return { brief, exploration: exploration ? withExecutionActivity(input.projectId, projectPath, exploration) : null, resultReceipt };
  }

  async function startExecutionBrief(input: { projectId: string; briefId: string; revision: number }) {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = requireBrief(projectPath, input.briefId);
    if (brief.revision !== input.revision) throw new Error("Execution Brief revision is stale.");
    if (brief.authorApprovalState !== "approved") throw new Error("Execution Brief requires author approval.");
    const snapshot = currentSnapshot(input.projectId, projectPath);
    const resolvedSources = await resolveCurrentSources(brief, snapshot.snapshotHash);
    assertCurrentHashes(brief, resolvedSources);
    validateAllowLists(brief);
    const existingBinding = readExecutionBriefRunBinding(projectPath, brief.briefId, brief.revision);
    if (existingBinding) {
      if (existingBinding.operationId !== brief.operationId) throw new Error("Execution Brief operation points to a different run.");
      const existing = authorControl.readStoryExploration({ projectId: input.projectId, explorationId: existingBinding.explorationId });
      if (!existing) throw new Error("Execution Brief run binding is missing its exploration.");
      return withExecutionActivity(input.projectId, projectPath, existing);
    }
    const scene = currentScene(input.projectId);
    assertCurrentContextDocument(brief, scene.id);
    const supplemental = await resolveExecutionSupplementalNotes(brief);
    const executionSnapshot = buildStorySnapshot({ workspacePath: projectPath, selectedScenePath: scene.relativeId, supplementalNotes: supplemental.notes });
    const executionAttentionContext = buildNuwaAttentionContext({
      brief: { ...brief, sourceProject: { ...brief.sourceProject, projectRevision: executionSnapshot.snapshotHash } },
      snapshot: executionSnapshot,
      resolvedSources: resolvedSources.filter((source) => source.kind !== "story-snapshot").map((source) => ({ kind: source.kind === "archive-message" ? "archive-message" : source.kind === "context-receipt" ? "context-receipt" : "approved-memory", id: source.id, hash: source.hash }))
    });
    const executionGoal = executionInstruction(brief);
    const fixedSeeds = brief.fixedSeeds?.length === 3 ? brief.fixedSeeds : [...NUWA_AUTHOR_LOOP_SEEDS];
    const allowedRoles = brief.allowedAgents.filter((value) => value !== SUPERVISOR_AGENT).map((value) => value.slice(AGENT_PREFIX.length) as NuwaAgentRole);
    const plan = createNuwaPlan({
      snapshot: executionSnapshot,
      authorGoal: executionGoal,
      allowedRoles,
      budget: { maxRoles: Math.min(brief.capabilityBudget.maxAgentRuns, allowedRoles.length) },
      runKey: `${brief.briefId}:${brief.revision}:${brief.operationId}`,
      seed: fixedSeeds[0]
    });
    if (plan.tasks.length > brief.capabilityBudget.maxAgentRuns) throw new Error("Execution Brief Agent budget is exceeded.");
    const skillCalls = plan.tasks.filter((task) => task.capabilityRequirements.length > 0).length;
    if (skillCalls > brief.capabilityBudget.maxSkillCalls) throw new Error("Execution Brief Skill budget is exceeded.");
    for (const task of plan.tasks) for (const skill of task.capabilityRequirements) {
      const versioned = skill === STORY_MEMORY_RECALL_SKILL_MANIFEST.id ? `${skill}@${STORY_MEMORY_RECALL_SKILL_MANIFEST.version}` : skill;
      if (!brief.allowedSkills.includes(versioned)) throw new Error(`Execution Brief does not allow required Skill: ${versioned}.`);
    }
    const exploration = authorControl.createStoryExploration({
      projectId: input.projectId,
      sceneId: scene.id,
      authorGoal: executionGoal,
      planOptions: { allowedRoles, maxRoles: plan.budget.maxRoles, runKey: `${brief.briefId}:${brief.revision}:${brief.operationId}`, seed: fixedSeeds[0], candidateSeeds: fixedSeeds, supplementalNotes: supplemental.notes, attentionContext: executionAttentionContext }
    });
    const owner = authorControl.readStoryExplorationRunOwner({ projectId: input.projectId, explorationId: exploration.id });
    writeExecutionBriefRunBinding(projectPath, {
      version: "story-studio-tianyi-nuwa-run-binding/v1",
      briefId: brief.briefId,
      briefRevision: brief.revision,
      operationId: brief.operationId,
      explorationId: exploration.id,
      runId: owner.runId
    });
    return withExecutionActivity(input.projectId, projectPath, exploration);
  }

  async function runExecutionBrief(input: { projectId: string; briefId: string; revision: number; explorationId: string }) {
    const { projectPath } = await requireBoundExploration(input);
    return withExecutionActivity(input.projectId, projectPath, await authorControl.runStoryExploration({ projectId: input.projectId, explorationId: input.explorationId }));
  }

  async function synthesizeExecutionBrief(input: { projectId: string; briefId: string; revision: number; explorationId: string }): Promise<{ exploration: ReturnType<typeof authorControl.synthesizeStoryExploration>; resultReceipt: NuwaResultReceipt }> {
    const { brief, projectPath } = await requireBoundExploration(input);
    const exploration = authorControl.synthesizeStoryExploration({ projectId: input.projectId, explorationId: input.explorationId });
    const run = findRunForBrief(projectPath, brief);
    const loaded = readNuwaRunPack(projectPath, run.runId);
    const readiness = getNuwaSynthesisReadiness(projectPath, run.runId);
    const manifest = readNuwaBackendManifest(projectPath, run.runId);
    const partial = readiness.partial || loaded.bundle?.coverage.completeness === "partial";
    const supplemental = await resolveExecutionSupplementalNotes(brief);
    const sourceByNoteId = new Map(supplemental.sources.map((source) => [source.note.id, source.sourceRef]));
    const sourceRefs = loaded.bundle?.sharedEvidence.map((item) => sourceByNoteId.get(item.noteId) ?? storyEvidenceSourceRef(item.noteId, item.relativePath)) ?? [];
    const acceptedExecutions = manifest.executions.filter((execution) => execution.status === "accepted-by-nuwa" && execution.validationStatus === "accepted-by-nuwa");
    const agentsUsed = acceptedExecutions.length > 0 ? [SUPERVISOR_AGENT, ...new Set(acceptedExecutions.map((execution) => `${AGENT_PREFIX}${execution.role}`))] : [];
    const skillsUsed = [...new Set(acceptedExecutions.flatMap((execution) => execution.capability ? [`${STORY_MEMORY_RECALL_SKILL_MANIFEST.id}@${STORY_MEMORY_RECALL_SKILL_MANIFEST.version}`] : []))];
    if (!sourceRefs.some((sourceRef) => sourceRef.startsWith("story."))) throw new Error("Nuwa Result Receipt must include the actual current Story context.");
    const selectedSupplementalRefs = new Set(supplemental.sources.map((source) => source.sourceRef));
    if (sourceRefs.some((sourceRef) => !sourceRef.startsWith("story.") && !selectedSupplementalRefs.has(sourceRef))) throw new Error("Nuwa Result Receipt includes an unauthorized source.");
    if (agentsUsed.length === 0) throw new Error("Nuwa Result Receipt has no accepted Agent execution.");
    if (new Set(exploration.routes.map((route) => route.id)).size !== exploration.routes.length) throw new Error("Nuwa Result Receipt candidate routes are duplicated.");
    const receipt: NuwaResultReceipt = {
      version: "story-studio-nuwa-result-receipt/v1",
      resultReceiptId: `nuwa-result.${stableHash({ runId: run.runId, briefId: brief.briefId, revision: brief.revision }).slice(0, 16)}`,
      briefId: brief.briefId,
      briefRevision: brief.revision,
      operationId: brief.operationId,
      agentsUsed,
      skillsUsed,
      sourceRefs: [...new Set(sourceRefs)],
      candidateRouteIds: exploration.routes.map((route) => route.id),
      disagreements: loaded.bundle?.disagreements.map((item) => `${item.claimKey}: ${item.positions.map((position) => position.value).join(" / ")}`) ?? [],
      unresolvedQuestions: [...new Set([...brief.unresolvedQuestions, ...(loaded.bundle?.unsupportedAssumptions ?? [])])],
      staleState: partial ? "partial" : "current",
      impactReviewEligible: !partial && exploration.status === "ready-for-review" && exploration.routes.length > 0,
      returnDestination: { tianyiSessionId: brief.originatingTianyiSessionId, ...brief.returnDestination }
    };
    const persisted = writeNuwaResultReceipt(projectPath, run.runId, receipt);
    await tianyi.recordTianyiNuwaResult({
      projectId: input.projectId,
      sessionId: brief.originatingTianyiSessionId,
      resultReceiptId: persisted.resultReceiptId,
      candidateRouteCount: persisted.candidateRouteIds.length,
      operationId: `operation.nuwa-result.${stableHash(persisted.resultReceiptId).slice(0, 12)}`
    });
    return { exploration: withExecutionActivity(input.projectId, projectPath, exploration), resultReceipt: persisted };
  }

  async function submitExecutionBriefRouteToImpact(input: {
    projectId: string;
    briefId: string;
    revision: number;
    explorationId: string;
    resultReceiptId: string;
    routeId: string;
  }) {
    const { brief, projectPath, binding, exploration } = await requireBoundExploration(input);
    if (exploration.status !== "ready-for-review") {
      throw new Error(exploration.status === "submitted-to-impact"
        ? "Nuwa Result Receipt has already been consumed by Impact Review."
        : "Nuwa Result Receipt is not ready for Impact Review.");
    }
    const receipt = await readResultReceipt({ projectId: input.projectId, briefId: brief.briefId });
    if (!receipt || receipt.resultReceiptId !== input.resultReceiptId) throw new Error("Nuwa Result Receipt identity does not match the current run binding.");
    if (receipt.briefId !== brief.briefId || receipt.briefRevision !== brief.revision || receipt.operationId !== binding.operationId) {
      throw new Error("Nuwa Result Receipt binding does not match the approved Execution Brief.");
    }
    if (receipt.staleState !== "current" || !receipt.impactReviewEligible) {
      throw new Error("Nuwa Result Receipt is stale, partial, or ineligible for Impact Review.");
    }
    const loaded = readNuwaRunPack(projectPath, binding.runId);
    if (!loaded.bundle || loaded.run.runId !== binding.runId || loaded.bundle.runId !== binding.runId) {
      throw new Error("Nuwa candidate bundle is unavailable for the bound run.");
    }
    const routeIds = loaded.bundle.branches.map((_branch, index) => `route-${index + 1}`);
    if (!routeIds.includes(input.routeId) || !sameStringSet(receipt.candidateRouteIds, routeIds)) {
      throw new Error("Nuwa candidate route does not match the immutable Result Receipt.");
    }
    const submitted = authorControl.submitStoryExplorationRouteToImpact({
      projectId: input.projectId,
      explorationId: input.explorationId,
      routeId: input.routeId
    });
    return { ...submitted, exploration: withExecutionActivity(input.projectId, projectPath, submitted.exploration) };
  }

  async function submitLegacyExplorationRouteToImpact(input: { projectId: string; explorationId: string; routeId: string }) {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = readLatestExecutionBriefRevision(projectPath);
    if (!brief || brief.sourceProject.projectId !== input.projectId) {
      throw new Error("Legacy Nuwa submit requires a current approved Execution Brief binding.");
    }
    const binding = readExecutionBriefRunBinding(projectPath, brief.briefId, brief.revision);
    if (!binding || binding.explorationId !== input.explorationId) {
      throw new Error("Legacy Nuwa submit is not bound to the current Execution Brief.");
    }
    const receipt = readNuwaResultReceipt(projectPath, binding.runId);
    if (!receipt) throw new Error("Legacy Nuwa submit has no bound Result Receipt.");
    return submitExecutionBriefRouteToImpact({
      projectId: input.projectId,
      briefId: brief.briefId,
      revision: brief.revision,
      explorationId: input.explorationId,
      resultReceiptId: receipt.resultReceiptId,
      routeId: input.routeId
    });
  }

  async function readResultReceipt(input: { projectId: string; briefId: string }): Promise<NuwaResultReceipt | null> {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = requireBrief(projectPath, input.briefId);
    const run = findRunForBrief(projectPath, brief, false);
    if (!run) return null;
    const receipt = readNuwaResultReceipt(projectPath, run.runId);
    if (!receipt) return null;
    const snapshot = currentSnapshot(input.projectId, projectPath);
    let stale = false;
    try {
      const resolvedSources = await resolveCurrentSources(brief, snapshot.snapshotHash);
      assertCurrentHashes(brief, resolvedSources);
    } catch {
      stale = true;
    }
    return stale ? { ...receipt, staleState: "stale", impactReviewEligible: false } : receipt;
  }

  async function inspectResultReceiptProvenance(input: { projectId: string; briefId: string }) {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = requireBrief(projectPath, input.briefId);
    const binding = readExecutionBriefRunBinding(projectPath, brief.briefId, brief.revision);
    if (!binding) throw new Error("Execution Brief has no Nuwa run binding.");
    const receipt = readNuwaResultReceipt(projectPath, binding.runId);
    if (!receipt) throw new Error("Nuwa Result Receipt is unavailable.");
    const loaded = readNuwaRunPack(projectPath, binding.runId);
    const manifest = readNuwaBackendManifest(projectPath, binding.runId);
    const supplemental = await resolveExecutionSupplementalNotes(brief);
    const sourceByNoteId = new Map(supplemental.sources.map((source) => [source.note.id, source.sourceRef]));
    const actualUsedSourceRefs = [...new Set(loaded.bundle?.sharedEvidence.map((item) => sourceByNoteId.get(item.noteId) ?? storyEvidenceSourceRef(item.noteId, item.relativePath)) ?? [])];
    const acceptedExecutions = manifest.executions.filter((execution) => execution.status === "accepted-by-nuwa" && execution.validationStatus === "accepted-by-nuwa");
    const actualAgents = acceptedExecutions.length > 0 ? [SUPERVISOR_AGENT, ...new Set(acceptedExecutions.map((execution) => `${AGENT_PREFIX}${execution.role}`))] : [];
    const actualSkills = [...new Set(acceptedExecutions.flatMap((execution) => execution.capability ? [`${STORY_MEMORY_RECALL_SKILL_MANIFEST.id}@${STORY_MEMORY_RECALL_SKILL_MANIFEST.version}`] : []))];
    const resolvedSources = await resolveCurrentSources(brief, currentSnapshot(input.projectId, projectPath).snapshotHash);
    const origin = await tianyi.readTianyiSessionMetadata({ projectId: input.projectId, sessionId: brief.originatingTianyiSessionId });
    const visibleTranscript = origin && !Array.isArray(origin) ? origin.visibleMessages.map((message) => message.visibleContent).filter(Boolean) : [];
    const sceneBody = workspace.readWritingDocument({ projectId: input.projectId, documentId: brief.currentContext.documentId }).body;
    const receiptJson = JSON.stringify(receipt);
    const selectedSourceRefs = [
      ...brief.selectedContextReceiptIds,
      ...brief.selectedArchiveMessageRefs.map((ref) => `${ref.sessionId}:${ref.messageId}`),
      ...brief.approvedMemoryRefs
    ];
    return {
      version: "story-studio-nuwa-result-receipt-provenance-inspection/v1" as const,
      resultReceiptId: receipt.resultReceiptId,
      briefHash: brief.expectedHashes.brief,
      sourceSetHash: brief.expectedHashes.sourceSet,
      runtime: {
        runner: loaded.run.plan.runner,
        backendId: manifest.backend.id,
        backendImplementationVersion: manifest.backend.implementationVersion,
        modelIdentity: manifest.backend.modelIdentity
      },
      receiptSourceRefs: [...receipt.sourceRefs],
      actualUsedSourceRefs,
      selectedSourceRefs,
      unusedSelectedSourceRefs: selectedSourceRefs.filter((ref) => !actualUsedSourceRefs.includes(ref)),
      resolvedSources,
      excludedAuthorizedSources: selectedSourceRefs.filter((ref) => !actualUsedSourceRefs.includes(ref)).map((sourceRef) => ({ sourceRef, reason: "not-selected" as const })),
      sourceSummary: {
        currentContext: receipt.sourceRefs.some((ref) => ref.startsWith("story.")) ? 1 : 0,
        contextReceipts: receipt.sourceRefs.filter((ref) => brief.selectedContextReceiptIds.includes(ref)).length,
        archiveMessages: receipt.sourceRefs.filter((ref) => brief.selectedArchiveMessageRefs.some((item) => `${item.sessionId}:${item.messageId}` === ref)).length,
        authorizedMemories: receipt.sourceRefs.filter((ref) => brief.approvedMemoryRefs.includes(ref)).length
      },
      matches: {
        brief: receipt.briefId === brief.briefId && receipt.briefRevision === brief.revision && receipt.operationId === brief.operationId,
        sourceSet: computeExecutionSourceSetHash(brief, resolvedSources) === brief.expectedHashes.sourceSet,
        runtime: loaded.run.plan.runner === "deterministic" && manifest.backend.id === "deterministic",
        sources: sameStringSet(receipt.sourceRefs, actualUsedSourceRefs),
        agents: sameStringSet(receipt.agentsUsed, actualAgents),
        skills: sameStringSet(receipt.skillsUsed, actualSkills),
        routes: sameStringSet(receipt.candidateRouteIds, loaded.bundle?.branches.map((_branch, index) => `route-${index + 1}`) ?? [])
      },
      contentBoundaries: {
        fullTranscriptCopies: visibleTranscript.filter((content) => content.length > 0 && receiptJson.includes(content)).length,
        canonicalStoryProseCopies: sceneBody.length > 0 && receiptJson.includes(sceneBody) ? 1 : 0
      }
    };
  }

  async function requireCurrentApprovedBrief(input: { projectId: string; briefId: string; revision: number }) {
    const projectPath = workspace.resolveProjectWorkspacePath({ projectId: input.projectId });
    const brief = requireBrief(projectPath, input.briefId);
    if (brief.revision !== input.revision || brief.authorApprovalState !== "approved") throw new Error("Execution Brief approval is stale or missing.");
    const snapshot = currentSnapshot(input.projectId, projectPath);
    const resolvedSources = await resolveCurrentSources(brief, snapshot.snapshotHash);
    assertCurrentHashes(brief, resolvedSources);
    return { brief, projectPath };
  }

  async function requireBoundExploration(input: { projectId: string; briefId: string; revision: number; explorationId: string }) {
    const { brief, projectPath } = await requireCurrentApprovedBrief(input);
    const binding = readExecutionBriefRunBinding(projectPath, brief.briefId, brief.revision);
    if (!binding) throw new Error("Execution Brief has no Nuwa run binding.");
    if (
      binding.briefId !== brief.briefId ||
      binding.briefRevision !== brief.revision ||
      binding.operationId !== brief.operationId ||
      binding.explorationId !== input.explorationId
    ) {
      throw new Error("Execution Brief binding does not match the requested exploration.");
    }
    const exploration = authorControl.readStoryExploration({ projectId: input.projectId, explorationId: input.explorationId });
    if (!exploration) throw new Error("Execution Brief binding is missing its exploration.");
    const run = readNuwaRunPack(projectPath, binding.runId).run;
    if (run.runId !== binding.runId) {
      throw new Error("Execution Brief binding does not match the current Nuwa run.");
    }
    return { brief, projectPath, binding, exploration };
  }

  async function resolveCurrentSources(brief: TianyiNuwaExecutionBrief, snapshotHash: string): Promise<ExecutionResolvedSource[]> {
    if (brief.sourceProject.projectRevision !== snapshotHash) throw new Error("Execution Brief Story sources are stale.");
    const project = { rootPath: options.rootPath, agentId, scope: "project" as const, projectId: brief.sourceProject.projectId };
    const sources: ExecutionResolvedSource[] = [{ kind: "story-snapshot", id: brief.currentContext.documentId, hash: snapshotHash }];
    const origin = await tianyi.readTianyiSessionMetadata({ projectId: brief.sourceProject.projectId, sessionId: brief.originatingTianyiSessionId });
    if (!origin || Array.isArray(origin)) throw new Error("Originating Tianyi Session is unavailable.");
    for (const ref of brief.selectedArchiveMessageRefs) {
      const session = await tianyi.readTianyiSessionMetadata({ projectId: brief.sourceProject.projectId, sessionId: ref.sessionId });
      if (!session || Array.isArray(session) || session.retentionMode !== "normal") throw new Error("Temporary Sessions cannot create durable Archive handoff references.");
      const archive = await readSession(project, ref.sessionId);
      const event = archive?.value.find((item) => item.eventId === ref.messageId);
      if (!event || !visibleArchiveEventContent(event) || event.type === "message-deleted") throw new Error("Execution Brief Archive message is unavailable.");
      sources.push({ kind: "archive-message", id: `${ref.sessionId}:${ref.messageId}`, hash: archiveEventHash(event) });
    }
    for (const receiptId of brief.selectedContextReceiptIds) {
      const receipt = await readReceipt(project, receiptId);
      if (!receipt || receipt.value.project.id !== brief.sourceProject.projectId || receipt.value.stale) throw new Error("Execution Brief Context Receipt is unavailable or stale.");
      sources.push({ kind: "context-receipt", id: receiptId, hash: receipt.contentHash });
    }
    for (const memoryId of brief.approvedMemoryRefs) {
      const projectMemory = await readMemory(project, memoryId);
      if (projectMemory?.value.state === "active" && projectMemory.value.approval_state === "author-approved") {
        sources.push({ kind: "approved-memory", id: memoryId, hash: projectMemory.contentHash });
        continue;
      }
      const authorized = await readAuthorizedGlobalMemory(project, memoryId);
      if (!authorized.authorized || !authorized.memory) throw new Error("Execution Brief author-global Memory is not granted to this project.");
      sources.push({ kind: "approved-memory", id: memoryId, hash: authorized.memory.contentHash });
    }
    return sources;
  }

  async function resolveExecutionSupplementalNotes(brief: TianyiNuwaExecutionBrief): Promise<{ notes: StorySnapshotNote[]; sources: Array<{ sourceRef: string; note: StorySnapshotNote }> }> {
    const project = { rootPath: options.rootPath, agentId, scope: "project" as const, projectId: brief.sourceProject.projectId };
    const sources: Array<{ sourceRef: string; note: StorySnapshotNote }> = [];
    const add = (kind: string, sourceRef: string, title: string, excerpt: string) => {
      const id = `brief-source-${stableHash({ kind, sourceRef }).slice(0, 16)}`;
      sources.push({
        sourceRef,
        note: { id, relativePath: `.world-os/brief-sources/${id}.json`, type: "review", title, status: "current", links: [], evidenceExcerpt: excerpt.slice(0, 240) }
      });
    };
    for (const receiptId of brief.selectedContextReceiptIds) {
      const receipt = await readReceipt(project, receiptId);
      if (!receipt) throw new Error("Execution Brief Context Receipt is unavailable.");
      const excerpt = receipt.value.sources.map((source) => source.excerpt).filter(Boolean).join(" ").slice(0, 240);
      add("context-receipt", receiptId, "作者选择的上下文回执", excerpt || "该回执记录了作者批准交给女娲核对的当前来源。" );
    }
    for (const ref of brief.selectedArchiveMessageRefs) {
      const archive = await readSession(project, ref.sessionId);
      const event = archive?.value.find((item) => item.eventId === ref.messageId);
      const excerpt = event ? visibleArchiveEventContent(event) : null;
      if (!excerpt) throw new Error("Execution Brief Archive message is unavailable.");
      add("archive-message", `${ref.sessionId}:${ref.messageId}`, "作者选择的历史消息", excerpt);
    }
    for (const memoryId of brief.approvedMemoryRefs) {
      const projectMemory = await readMemory(project, memoryId);
      if (projectMemory?.value.state === "active" && projectMemory.value.approval_state === "author-approved") {
        add("approved-memory", memoryId, "作者授权的长期记忆", projectMemory.value.body);
        continue;
      }
      const authorized = await readAuthorizedGlobalMemory(project, memoryId);
      if (!authorized.authorized || !authorized.memory) throw new Error("Execution Brief author-global Memory is not granted to this project.");
      add("approved-memory", memoryId, "作者授权的长期记忆", authorized.memory.value.body);
    }
    return { notes: sources.map((source) => source.note), sources };
  }

  return {
    createExecutionBrief,
    reviseExecutionBrief,
    approveExecutionBrief,
    readExecutionBrief,
    readLatestExecutionState,
    startExecutionBrief,
    runExecutionBrief,
    synthesizeExecutionBrief,
    submitExecutionBriefRouteToImpact,
    submitLegacyExplorationRouteToImpact,
    readResultReceipt,
    inspectResultReceiptProvenance
  };

  function currentScene(projectId: string) {
    const document = workspace.getWritingBootstrap({ projectId }).activeDocument;
    if (!document || document.type !== "scene") throw new Error("Nuwa Execution Brief requires a current scene.");
    return document;
  }

  function currentSnapshot(projectId: string, projectPath: string) {
    const scene = currentScene(projectId);
    return buildStorySnapshot({ workspacePath: projectPath, selectedScenePath: scene.relativeId });
  }

  function withExecutionActivity<T extends { id: string }>(projectId: string, projectPath: string, exploration: T): T & {
    activity: Array<{
      unitId: string;
      runId: string;
      sequence: number;
      actor: string;
      eventType: string;
      summary: string;
      sourceLabel: "本单元执行记录";
    }>;
    rehearsal: ReturnType<typeof readNuwaRunPack>["rehearsal"];
  } {
    const runOwner = authorControl.readStoryExplorationRunOwner({
      projectId,
      explorationId: exploration.id
    });
    const loaded = readNuwaRunPack(projectPath, runOwner.runId);
    const taskById = new Map(loaded.run.plan.tasks.map((task) => [task.taskId, task]));
    return {
      ...exploration,
      rehearsal: loaded.rehearsal,
      activity: loaded.events.slice(-32).map((event, index) => ({
        unitId: exploration.id,
        runId: runOwner.runId,
        sequence: index + 1,
        actor: event.taskId ? executionActivityActor(taskById.get(event.taskId)?.role) : "女娲",
        eventType: event.type,
        summary: executionActivitySummary(event.type),
        sourceLabel: "本单元执行记录" as const
      }))
    };
  }
}

function executionActivityActor(role: NuwaAgentRole | undefined): string {
  return ({
    continuity: "连续性检查",
    "character-arc": "人物弧光检查",
    causality: "因果推演",
    foreshadowing: "伏笔检查",
    tension: "张力检查",
    "evidence-critic": "证据复核"
  } as Partial<Record<NuwaAgentRole, string>>)[role || ""] || "女娲";
}

function executionActivitySummary(type: string): string {
  return ({
    "backend-selected": "已建立本次排演的执行方式",
    "task-started": "开始受限检查",
    "result-produced": "已返回检查结果，等待核验",
    "result-imported": "已读取外部结果，等待核验",
    "result-validated": "检查结果已通过结构核验",
    "result-accepted": "检查结果已纳入候选整理",
    "cache-hit": "复用了与当前来源完全匹配的已核验结果",
    "cache-miss": "没有可复用的已核验结果",
    "task-queued": "等待继续执行",
    "task-rejected": "本次检查未通过，未纳入候选",
    "task-cancelled": "本次检查已取消",
    "replan-requested": "需要根据当前来源重新规划"
  } as Record<string, string>)[type] || "已记录本单元执行状态";
}

function withExpectedHashes(brief: TianyiNuwaExecutionBrief, resolvedSources: ExecutionResolvedSource[]): TianyiNuwaExecutionBrief {
  const prepared = { ...brief, expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) } };
  const briefHash = computeExecutionBriefHash(prepared);
  const withBrief = { ...prepared, expectedHashes: { brief: briefHash, sourceSet: "0".repeat(64) } };
  return { ...withBrief, expectedHashes: { brief: briefHash, sourceSet: computeExecutionSourceSetHash(withBrief, resolvedSources) } };
}

function assertCurrentHashes(brief: TianyiNuwaExecutionBrief, resolvedSources: ExecutionResolvedSource[]): void {
  if (computeExecutionBriefHash(brief) !== brief.expectedHashes.brief) throw new Error("Execution Brief hash is stale.");
  if (computeExecutionSourceSetHash(brief, resolvedSources) !== brief.expectedHashes.sourceSet) throw new Error("Execution Brief source-set hash is stale.");
}

function validateAllowLists(brief: TianyiNuwaExecutionBrief): void {
  if (!brief.allowedAgents.includes(SUPERVISOR_AGENT)) throw new Error("Execution Brief must retain the Nuwa supervisor.");
  if (brief.allowedAgents.some((agent) => !ALLOWED_AGENTS.has(agent))) throw new Error("Execution Brief contains an unknown Agent.");
  if (brief.allowedSkills.some((skill) => !ALLOWED_SKILLS.has(skill))) throw new Error("Execution Brief contains an unknown Skill.");
  if (brief.allowedAgents.length - 1 > brief.capabilityBudget.maxAgentRuns) throw new Error("Execution Brief Agent allowlist exceeds its budget.");
  if (brief.allowedSkills.length > brief.capabilityBudget.maxSkillCalls) throw new Error("Execution Brief Skill allowlist exceeds its budget.");
}

function assertCurrentContextDocument(brief: TianyiNuwaExecutionBrief, currentSceneId: string): void {
  if (brief.currentContext.mode !== "writing" || brief.currentContext.documentId !== currentSceneId) {
    throw new Error("Execution Brief current context does not match the active writing scene.");
  }
}

function executionInstruction(brief: TianyiNuwaExecutionBrief): string {
  return [
    brief.authorGoal,
    ...brief.mustKeep.map((item) => `必须保留：${item}`),
    ...brief.mustAvoid.map((item) => `必须避免：${item}`),
    ...brief.unresolvedQuestions.map((item) => `待核对问题：${item}`)
  ].join("\n").slice(0, 4_000);
}

function requireBrief(projectPath: string, briefId: string): TianyiNuwaExecutionBrief {
  const brief = readExecutionBriefRevision(projectPath, briefId);
  if (!brief) throw new Error("Execution Brief does not exist.");
  return brief;
}

function normalizeChanges(value: ExecutionBriefChanges): ExecutionBriefChanges {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Execution Brief changes are invalid.");
  const allowed = new Set(["authorGoal", "sourceQuestion", "currentContext", "startingPoint", "participatingActorIds", "observationCriteria", "selectedContextReceiptIds", "selectedArchiveMessageRefs", "approvedMemoryRefs", "mustKeep", "mustAvoid", "unresolvedQuestions", "expectedOutputKind", "requestedRunCount", "fixedSeeds", "allowedAgents", "allowedSkills", "capabilityBudget", "sensitivity", "returnDestination"]);
  if (Object.keys(value).length === 0 || Object.keys(value).some((key) => !allowed.has(key))) throw new Error("Execution Brief changes contain unsupported fields.");
  return structuredClone(value);
}

function stableWithoutApproval(value: TianyiNuwaExecutionBrief): string {
  return JSON.stringify({ ...value, authorApprovalState: "draft" });
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length && left.every((item) => right.includes(item));
}

function storyEvidenceSourceRef(noteId: string, relativePath: string): string {
  return `story.${stableHash({ noteId, relativePath }).slice(0, 20)}`;
}

function findRunForBrief(projectPath: string, brief: TianyiNuwaExecutionBrief, required = true) {
  const binding = readExecutionBriefRunBinding(projectPath, brief.briefId, brief.revision);
  if (!binding) {
    if (required) throw new Error("Execution Brief has no Nuwa run binding.");
    return null;
  }
  try {
    return readNuwaRunPack(projectPath, binding.runId).run;
  } catch (error) {
    if (required) throw error;
    return null;
  }
}
