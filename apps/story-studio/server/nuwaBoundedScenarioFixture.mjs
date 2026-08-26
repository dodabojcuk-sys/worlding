import {
  buildStorySnapshot,
  cancelNuwaBoundedRun,
  createNuwaBoundedRun,
  createNuwaPlan,
  createNuwaRunPack,
  createTideLetterBoundedSnapshot,
  forkNuwaBoundedFromStep,
  freezeNuwaBoundedSnapshot,
  getNuwaBoundedRunProjection,
  markNuwaCandidateIntegrated,
  pauseNuwaBoundedRun,
  prepareNuwaBoundedCandidateHandoff,
  readNuwaBoundedRun,
  replayNuwaBoundedRun,
  resumeNuwaBoundedRun,
  startNuwaBoundedRun,
  stepNuwaBoundedRun,
  updateNuwaBoundedView,
  writeNuwaBoundedRun
} from "../../../src/storyIntelligence/index.ts";
import { storyObservationPatchToCandidateResult } from "../../../src/storyContracts/storyObservationProposalPatch.ts";

const RUN_ID = "nuwa-tide-letter-bounded-r0";
const CONTEXT_ID = "context.nuwa-tide-letter-bounded-r0";
const CANDIDATE_ID = "candidate.event.old-name-ledger-check";
const PLANNING_TITLE = "沈砚与阿芜决定先核对旧名守夜记录";

export function createNuwaBoundedScenarioFixtureAdapter({ operations, authorControl, now = () => new Date().toISOString() }) {
  function isolatedProject(projectId) {
    const project = operations.listProjects().find((item) => item.id === projectId);
    if (!project) throw new Error("Nuwa bounded Fixture project does not exist.");
    if (!/隔离|fixture/i.test(project.title)) throw new Error("Nuwa bounded Fixture writes require an explicitly isolated project.");
    return project;
  }

  function workspacePath(projectId) {
    return operations.resolveProjectWorkspacePath({ projectId });
  }

  function ensureRun(projectId) {
    const project = isolatedProject(projectId);
    const workspace = workspacePath(projectId);
    const existing = readNuwaBoundedRun(workspace, RUN_ID);
    if (existing) return existing;
    const snapshot = buildStorySnapshot({ workspacePath: workspace });
    try {
      const plan = createNuwaPlan({ snapshot, authorGoal: "潮痕来信有界排演" });
      createNuwaRunPack({ workspacePath: workspace, plan: { ...plan, runId: RUN_ID }, snapshot });
    } catch (error) {
      if (!String(error?.message || error).includes("already exists")) throw error;
    }
    let run = createNuwaBoundedRun({ runId: RUN_ID });
    run = freezeNuwaBoundedSnapshot(run, createTideLetterBoundedSnapshot({ projectId: project.id, sourceRevision: snapshot.snapshotHash }));
    return writeNuwaBoundedRun(workspace, run);
  }

  function write(projectId, run) {
    return writeNuwaBoundedRun(workspacePath(projectId), run);
  }

  function reviewState(projectId, run) {
    const review = authorControl.listCandidateReviews({ projectId }).find((item) => item.contextPackId === CONTEXT_ID) || null;
    const candidate = review?.candidates.find((item) => item.id === CANDIDATE_ID) || null;
    const impactReviewId = candidate?.confirmationReceipt?.impactReviewId || null;
    const impact = impactReviewId ? authorControl.readImpactReview({ projectId, reviewId: impactReviewId }) : null;
    const latestChangeSet = authorControl.readAuthorChangeSet({ projectId });
    const changeSet = latestChangeSet?.reviewId === impactReviewId ? latestChangeSet : null;
    const stage = changeSet?.status === "applied" ? "integrated" : impact ? "impact-review" : review ? candidate?.status === "rejected" ? "rejected" : "candidate-review" : run.handoff ? "handoff-prepared" : "simulation";
    return {
      stage,
      candidateReviewId: review?.id || null,
      candidateStatus: candidate?.status || (run.handoff ? run.handoff.status : "not-created"),
      impactReviewId,
      impactStatus: impact?.status || null,
      changeSetId: changeSet?.id || null,
      changeSetStatus: changeSet?.status || null,
      appliedEventId: changeSet?.application.appliedEventId || null,
      eventWrites: changeSet?.status === "applied" ? 1 : 0,
      characterWrites: 0,
      worldStateWrites: 0,
      relationWrites: 0,
      memoryWrites: 0,
      providerCalls: 0,
      pluginCalls: 0,
      impactPreview: impactPreview(run)
    };
  }

  function read(projectId, options = {}) {
    const run = ensureRun(projectId);
    const projected = structuredClone(run);
    if (options.missingSource === true && projected.snapshot) {
      projected.integrityStatus = "missing-reference";
      projected.snapshot.selectedSources[2].available = false;
    }
    if (options.stale === true) projected.stale = true;
    return {
      version: "tianyan-nuwa-bounded-scenario-fixture-r0/v1",
      run: getNuwaBoundedRunProjection(projected),
      review: reviewState(projectId, run),
      providerLedger: { setup: 3, generation: 6, total: 9 },
      realProviderCalls: 0,
      newGenerationCalls: 0
    };
  }

  function operate(projectId, action, input = {}) {
    isolatedProject(projectId);
    let run = ensureRun(projectId);
    if (action === "start") run = startNuwaBoundedRun(run, input.operationId);
    else if (action === "step") run = stepNuwaBoundedRun(run, input.operationId);
    else if (action === "play") {
      if (run.lifecycle === "ready") run = startNuwaBoundedRun(run, input.operationId ? `${input.operationId}:start` : undefined);
      if (run.lifecycle === "paused") run = resumeNuwaBoundedRun(run, input.operationId ? `${input.operationId}:resume` : undefined);
      while (run.lifecycle === "running") run = stepNuwaBoundedRun(run);
    } else if (action === "pause") run = pauseNuwaBoundedRun(run, input.operationId);
    else if (action === "resume") run = resumeNuwaBoundedRun(run, input.operationId);
    else if (action === "cancel") run = cancelNuwaBoundedRun(run, input.operationId);
    else if (action === "fork") run = forkNuwaBoundedFromStep(run, { sourceBranchId: input.sourceBranchId || "branch.original", sequence: Number(input.sequence || 2), instruction: String(input.instruction || "不要展示完整来信，只询问阿芜亲历的守夜记录。"), ...(input.operationId ? { operationId: input.operationId } : {}) });
    else if (action === "select-branch") {
      if (!run.branches.some((branch) => branch.branchId === input.branchId)) throw new Error("Selected Nuwa branch does not exist.");
      run = structuredClone(run);
      run.activeBranchId = input.branchId;
      const selectedBranch = run.branches.find((branch) => branch.branchId === input.branchId);
      run.lifecycle = selectedBranch.status;
      run = updateNuwaBoundedView(run, {
        activeTool: input.activeTool || "branch",
        selectedStepId: selectedBranch.steps.at(-1)?.stepId || null,
      }, input.operationId || `view:branch:${input.branchId}`);
    } else if (action === "view") run = updateNuwaBoundedView(run, input.view || {}, input.operationId || `view:${Date.now()}`);
    else if (action === "handoff") run = prepareNuwaBoundedCandidateHandoff(run, input.operationId);
    else if (action === "replay") {
      replayNuwaBoundedRun(run);
      return read(projectId);
    } else throw new Error("Nuwa bounded Fixture action does not exist.");
    write(projectId, run);
    return read(projectId);
  }

  function prepareReview(projectId) {
    const project = isolatedProject(projectId);
    let run = ensureRun(projectId);
    if (!run.handoff) run = prepareNuwaBoundedCandidateHandoff(run);
    write(projectId, run);
    let review = authorControl.listCandidateReviews({ projectId }).find((item) => item.contextPackId === CONTEXT_ID) || null;
    if (!review) review = authorControl.createCandidateReview({ projectId, result: candidateResult(project, run), minimumCandidates: 1, createdAt: now() });
    return read(projectId);
  }

  function prepareImpact(projectId) {
    const project = isolatedProject(projectId);
    prepareReview(projectId);
    let review = authorControl.listCandidateReviews({ projectId }).find((item) => item.contextPackId === CONTEXT_ID);
    const candidate = review?.candidates.find((item) => item.id === CANDIDATE_ID);
    if (!candidate) throw new Error("Nuwa bounded Candidate Review is missing.");
    if (!candidate.confirmationReceipt?.impactReviewId && candidate.status === "awaiting") {
      let planning = operations.listWorldObjects({ projectId, type: "event" }).find((item) => item.title === PLANNING_TITLE && item.status === "planned");
      if (!planning) planning = operations.createPlanningEvent({ projectId, title: PLANNING_TITLE, tags: ["Nuwa Fixture", "待作者审查"], body: planningBody() });
      const impact = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
      authorControl.decideCandidateReview({ projectId, reviewId: review.id, candidateId: CANDIDATE_ID, decision: "accepted", confirmationReceipt: { planningEventId: planning.id, impactReviewId: impact.id }, decidedAt: now() });
    }
    return read(projectId);
  }

  function reject(projectId) {
    isolatedProject(projectId);
    prepareReview(projectId);
    const review = authorControl.listCandidateReviews({ projectId }).find((item) => item.contextPackId === CONTEXT_ID);
    const candidate = review?.candidates.find((item) => item.id === CANDIDATE_ID);
    if (candidate?.status === "awaiting") authorControl.decideCandidateReview({ projectId, reviewId: review.id, candidateId: CANDIDATE_ID, decision: "rejected", reason: "作者拒绝女娲候选；正式 Event、World、Relation 与 Character 写入均为 0。", decidedAt: now() });
    const run = ensureRun(projectId);
    if (run.handoff) {
      const next = structuredClone(run);
      next.handoff.status = "rejected";
      write(projectId, next);
    }
    return read(projectId);
  }

  function confirm(projectId) {
    isolatedProject(projectId);
    const prepared = prepareImpact(projectId);
    if (!prepared.review.impactReviewId) throw new Error("Nuwa Impact Review is unavailable.");
    let impact = authorControl.readImpactReview({ projectId, reviewId: prepared.review.impactReviewId });
    if (impact.status === "pending") {
      const option = impact.options[0];
      if (!option) throw new Error("Nuwa Impact Review has no author route.");
      impact = authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: option.id, action: "adopt" });
    }
    let changeSet = authorControl.readAuthorChangeSet({ projectId });
    if (!changeSet || changeSet.reviewId !== impact.id) changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: impact.id });
    if (changeSet.status === "pending") authorControl.dryRunAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    let run = ensureRun(projectId);
    if (run.handoff?.status === "sent-review") {
      run = markNuwaCandidateIntegrated(run);
      write(projectId, run);
    }
    return read(projectId);
  }

  return { read, operate, prepareReview, prepareImpact, reject, confirm };
}

function candidateResult(project, run) {
  return storyObservationPatchToCandidateResult({
    version: "story-observation-proposal-patch/v1",
    patchId: "patch.nuwa-tide-letter-bounded-r0",
    projectId: project.id,
    baseCanonVersion: run.snapshot.integrity,
    contextId: CONTEXT_ID,
    selection: { projection: "event-line", nodeIds: ["fixture.event.letter", "fixture.event.key-transfer"], relationIds: [], timeWindow: null, clueSources: ["character", "object", "archive"], observer: "女娲临时分支" },
    sources: [
      { id: "source.anchor.watch-ledger-fragment", type: "archive-anchor", label: "灯塔守夜记录残页", excerpt: "旧名曾出现；残页没有精确日期。" },
      { id: "source.anchor.a-wu-observation", type: "character-observation", label: "阿芜现场观察", excerpt: "阿芜只复述自己见过的记录，不确认寄信人。" }
    ],
    unknowns: ["寄信人身份仍未知", "旧名记录的精确世界时间仍未知"],
    prohibitedChanges: ["不得确认寄信人", "不得修改 Relation truth", "不得回写原始 Nuwa steps"],
    operations: [{
      operationId: CANDIDATE_ID,
      kind: "add-event",
      title: PLANNING_TITLE,
      change: "在铜钥匙交接之后，增加先核对旧名守夜记录的候选事件。",
      after: "沈砚知道旧名可能与守夜记录相关；阿芜仍不知道寄信人身份。",
      rationale: `来自 Run ${run.runId} / Branch ${run.handoff.sourceBranchId} / Step ${run.handoff.sourceStepId}。`,
      confidence: 1,
      risk: "守夜记录残页缺少精确日期，世界时间必须保持未知。",
      affectedNodeIds: ["fixture.event.key-transfer", "fixture.character.shen-yan", "fixture.character.a-wu"],
      evidence: ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"],
      conflicts: ["旧名出现的精确世界时间未知"],
      timeEstimate: { label: "铜钥匙交接之后，灯塔行动之前", precision: "range" }
    }],
    adapter: { kind: "development-deterministic", providerCalls: 0 },
    createdAt: "2026-08-23T08:20:00.000Z"
  }, project.title);
}

function impactPreview(run) {
  return {
    title: PLANNING_TITLE,
    sourceRun: run.runId,
    sourceBranch: run.handoff?.sourceBranchId || null,
    sourceStep: run.handoff?.sourceStepId || null,
    baselineDiff: run.handoff?.baselineDiff || [],
    affectedEvents: run.handoff?.affectedEvents || [],
    affectedCharacters: ["沈砚", "阿芜"],
    characterStateBefore: run.handoff?.characterStateBefore || [],
    characterStateAfter: run.handoff?.characterStateAfter || [],
    characterFateBefore: run.handoff?.characterFateBefore || [],
    characterFateAfter: run.handoff?.characterFateAfter || [],
    worldStateCandidates: run.handoff?.worldStateCandidates || [],
    relationCandidates: run.handoff?.relationCandidates || [],
    unresolvedConflicts: run.handoff?.unresolvedConflicts || [],
    rollback: run.handoff?.recovery.rollback || "原始 Run 与所有 receipts 保留",
    ownerWritePlan: ["existing Candidate Review", "existing Impact Review", "existing Author Change Set", "existing Event owner after author confirmation"]
  };
}

function planningBody() {
  return [
    `# ${PLANNING_TITLE}`,
    "",
    "## Nuwa source",
    `- Run: ${RUN_ID}`,
    "- Branch: branch.temporary-old-name-correction",
    "- Step: branch.temporary-old-name-correction.step.4",
    "",
    "## Candidate change",
    "沈砚与阿芜在进入灯塔前，先核对旧名守夜记录。",
    "",
    "## Remains unknown",
    "- 寄信人身份",
    "- 旧名记录的精确世界时间",
    "",
    "This isolated Fixture planning Event is not confirmed until AuthorControl applies it."
  ].join("\n");
}
