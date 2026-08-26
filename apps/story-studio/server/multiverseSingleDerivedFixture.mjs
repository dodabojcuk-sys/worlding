import {
  buildStorySnapshot,
  createNuwaBoundedRun,
  createNuwaPlan,
  createNuwaRunPack,
  createTideLetterBoundedSnapshot,
  forkNuwaBoundedFromStep,
  freezeNuwaBoundedSnapshot,
  getNuwaBoundedRunProjection,
  markNuwaCandidateIntegrated,
  prepareNuwaBoundedCandidateHandoff,
  readNuwaBoundedRun,
  resumeNuwaBoundedRun,
  stableHash,
  startNuwaBoundedRun,
  stepNuwaBoundedRun,
  writeNuwaBoundedRun
} from "../../../src/storyIntelligence/index.ts";
import { storyObservationPatchToCandidateResult } from "../../../src/storyContracts/storyObservationProposalPatch.ts";
import { createStoryStudioWorkVersionAuthority } from "../../../src/storyWorkspace/workVersionAuthority.ts";
import { resolveWorkVersionOwnerSnapshotRefs } from "../../../src/storyWorkspace/workVersionSnapshotResolver.ts";
import {
  MULTIVERSE_EVENT_CHANGE_ID,
  buildSingleDerivedSemanticCompare,
  validateSingleEventSelection
} from "../../../src/storyWorkspace/multiverseSingleDerivedR0.ts";

export const MULTIVERSE_R0_RUN_ID = "nuwa-multiverse-single-derived-r0";
export const MULTIVERSE_R0_CONTEXT_ID = "context.multiverse-single-derived-r0";
export const MULTIVERSE_R0_DERIVED_NAME = "旧名守夜记录走向";

const PLANNING_TITLE = "沈砚与阿芜决定先核对旧名守夜记录";
const ROOT_ACTION_ID = "author.multiverse.root-baseline.r0";
const DERIVED_ACTION_ID = "author.multiverse.save-derived.r0";
const APPEND_ACTION_ID = "author.multiverse.integrate-event.r0";

export function createMultiverseSingleDerivedFixtureAdapter({ operations, authorControl, now = () => new Date().toISOString(), faultInjector = () => {} }) {
  function isolatedProject(projectId) {
    const project = operations.listProjects().find((item) => item.id === projectId);
    if (!project) throw new Error("Multiverse Fixture Project does not exist.");
    if (!/多元隔离|multiverse.fixture/i.test(project.title)) throw new Error("Multiverse Fixture writes require an explicitly isolated Project.");
    return project;
  }

  function projectPath(projectId) {
    return operations.resolveProjectWorkspacePath({ projectId });
  }

  function authority(projectId) {
    isolatedProject(projectId);
    return createStoryStudioWorkVersionAuthority({ projectRoot: projectPath(projectId) });
  }

  function ensureCompletedRun(projectId) {
    const project = isolatedProject(projectId);
    const workspace = projectPath(projectId);
    const existing = readNuwaBoundedRun(workspace, MULTIVERSE_R0_RUN_ID);
    if (existing) return existing;
    const snapshot = buildStorySnapshot({ workspacePath: workspace });
    try {
      const plan = createNuwaPlan({ snapshot, authorGoal: "多元版本·旧名守夜记录走向" });
      createNuwaRunPack({ workspacePath: workspace, plan: { ...plan, runId: MULTIVERSE_R0_RUN_ID }, snapshot });
    } catch (error) {
      if (!String(error?.message || error).includes("already exists")) throw error;
    }
    let run = createNuwaBoundedRun({ runId: MULTIVERSE_R0_RUN_ID });
    run = freezeNuwaBoundedSnapshot(run, createTideLetterBoundedSnapshot({ projectId: project.id, sourceRevision: snapshot.snapshotHash }));
    run = startNuwaBoundedRun(run);
    while (run.lifecycle === "running") run = stepNuwaBoundedRun(run);
    run = forkNuwaBoundedFromStep(run, { sourceBranchId: "branch.original", sequence: 2, instruction: "不要展示完整来信，只询问阿芜亲历的守夜记录。" });
    run = resumeNuwaBoundedRun(run);
    while (run.lifecycle === "running") run = stepNuwaBoundedRun(run);
    run = prepareNuwaBoundedCandidateHandoff(run);
    return writeNuwaBoundedRun(workspace, run);
  }

  function reviewState(projectId) {
    const review = authorControl.listCandidateReviews({ projectId }).find((item) => item.contextPackId === MULTIVERSE_R0_CONTEXT_ID) || null;
    const candidate = review?.candidates.find((item) => item.id === MULTIVERSE_EVENT_CHANGE_ID) || null;
    const impactReviewId = candidate?.confirmationReceipt?.impactReviewId || null;
    const impact = impactReviewId ? authorControl.readImpactReview({ projectId, reviewId: impactReviewId }) : null;
    const latestChangeSet = authorControl.readAuthorChangeSet({ projectId });
    const changeSet = latestChangeSet?.reviewId === impactReviewId ? latestChangeSet : null;
    return { review, candidate, impact, changeSet };
  }

  function listVersions(projectId) {
    return authority(projectId).listVersions();
  }

  function read(projectId, options = {}) {
    const project = isolatedProject(projectId);
    const versionAuthority = authority(projectId);
    const versions = versionAuthority.listVersions();
    const root = versions.find((version) => version.identity.kind === "root") || null;
    const derived = versions.find((version) => version.identity.kind === "derived") || null;
    const review = reviewState(projectId);
    const integrated = review.changeSet?.status === "applied" && root?.identity.currentRevision === 2;
    const compare = root && derived
      ? buildSingleDerivedSemanticCompare({
          rootRevision: root.identity.currentRevision,
          derivedPinnedRevision: derived.identity.parentBaseRevision,
          integrated,
          missingSource: options.missingSource === true,
          staleSelection: options.staleSelection === true
        })
      : null;
    const run = options.ensureNuwa === true || derived ? ensureCompletedRun(projectId) : null;
    const derivedStaleness = derived ? versionAuthority.projectVersionStaleness(derived.identity.workVersionId) : null;
    return {
      version: "tianyan-multiverse-single-derived-fixture-r0/v1",
      project: { id: project.id, title: project.title },
      root: root ? versionView(root) : null,
      derived: derived ? {
        ...versionView(derived),
        pinnedRootRevision: derived.identity.parentBaseRevision,
        sourceRootVersionId: derived.identity.parentVersionId,
        sourceManifestId: derived.identity.parentManifestId,
        status: integrated ? "integrated" : derivedStaleness?.state === "stale" ? "source-updated" : "ready"
      } : null,
      nuwa: run ? {
        run: getNuwaBoundedRunProjection(run),
        saveConfirmation: {
          versionName: MULTIVERSE_R0_DERIVED_NAME,
          sourceRevision: root?.identity.currentRevision || null,
          sourcePath: "旧名线索纠正后的临时走向",
          eventCandidate: PLANNING_TITLE,
          currentStoryChanged: false
        }
      } : null,
      compare,
      review: {
        stage: integrated ? "integrated" : review.impact ? "impact-review" : review.review ? review.candidate?.status === "rejected" ? "rejected" : "candidate-review" : derived ? "compare" : "not-started",
        candidateReviewId: review.review?.id || null,
        candidateStatus: review.candidate?.status || null,
        impactReviewId: review.impact?.id || null,
        impactStatus: review.impact?.status || null,
        changeSetId: review.changeSet?.id || null,
        changeSetStatus: review.changeSet?.status || null,
        appliedEventId: review.changeSet?.application.appliedEventId || null
      },
      writes: {
        confirmedEvents: authorControl.listVerifiedCanonEventIds({ projectId }).length,
        rootRevisionAppends: root ? Math.max(0, root.identity.currentRevision - 1) : 0,
        derivedRevisions: derived?.identity.currentRevision || 0,
        character: 0,
        worldState: 0,
        relation: 0,
        canonBody: 0,
        session: 0,
        archive: 0,
        memory: 0,
        provider: 0,
        plugin: 0
      },
      history: root?.revision.semanticDeltaRefs || [],
      blockers: {
        missingSource: options.missingSource === true,
        staleSelection: options.staleSelection === true
      }
    };
  }

  function createRoot(projectId) {
    const project = isolatedProject(projectId);
    const result = authority(projectId).createRootCheckpoint({
      displayName: "当前作品主线",
      authorActionId: ROOT_ACTION_ID,
      idempotencyKey: `multiverse-r0:root:${project.id}`,
      expectedRevision: 0,
      createdAt: "2026-08-24T09:00:00.000Z",
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, "root-r1"),
      optionalNuwaProvenanceRefs: []
    });
    return { result, view: read(projectId) };
  }

  function saveDerived(projectId, input = {}) {
    const project = isolatedProject(projectId);
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((version) => version.identity.kind === "root");
    if (!root) throw new Error("Create the root WorkVersion explicitly before saving a derived version.");
    const run = ensureCompletedRun(projectId);
    if (run.lifecycle !== "completed" || run.handoff?.status !== "sent-review") throw new Error("Completed Nuwa temporary path and handoff receipts are required.");
    if (input.versionName !== MULTIVERSE_R0_DERIVED_NAME) throw new Error("Derived version confirmation name does not match the reviewed value.");
    if (input.sourceRevision !== root.identity.currentRevision || input.sourceRevision !== 1) throw new Error("Derived source revision is stale or not the pinned root revision.");
    if (input.changeId !== MULTIVERSE_EVENT_CHANGE_ID || run.handoff.candidateId !== "candidate.event.old-name-ledger-check") throw new Error("Nuwa Event candidate identity does not match the selected Multiverse difference.");
    const result = versionAuthority.createDerivedVersion({
      displayName: MULTIVERSE_R0_DERIVED_NAME,
      parentVersionId: root.identity.workVersionId,
      parentBaseRevision: root.identity.currentRevision,
      parentManifestId: root.identity.headManifestId,
      authorActionId: DERIVED_ACTION_ID,
      idempotencyKey: `multiverse-r0:derived:${project.id}:${run.runId}`,
      expectedRevision: 0,
      createdAt: "2026-08-24T09:10:00.000Z",
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, "derived-r1", { candidate: MULTIVERSE_EVENT_CHANGE_ID }),
      optionalNuwaProvenanceRefs: [{
        runId: run.runId,
        branchId: run.handoff.sourceBranchId,
        stepId: run.handoff.sourceStepId,
        receiptId: run.handoff.receiptId,
        canonicalDigest: stableHash({ runId: run.runId, handoff: run.handoff })
      }]
    });
    return { result, view: read(projectId) };
  }

  function prepareReview(projectId, selectedChangeIds) {
    const project = isolatedProject(projectId);
    const current = read(projectId);
    if (!current.compare) throw new Error("A root and direct derived WorkVersion are required before review.");
    validateSingleEventSelection(current.compare, selectedChangeIds);
    const run = ensureCompletedRun(projectId);
    let review = reviewState(projectId).review;
    if (!review) review = authorControl.createCandidateReview({ projectId, result: candidateResult(project, run), minimumCandidates: 1, createdAt: "2026-08-24T09:20:00.000Z" });
    return read(projectId);
  }

  function prepareImpact(projectId) {
    prepareReview(projectId, [MULTIVERSE_EVENT_CHANGE_ID]);
    let { review, candidate } = reviewState(projectId);
    if (!review || !candidate) throw new Error("Selected Multiverse Candidate Review is missing.");
    if (!candidate.confirmationReceipt?.impactReviewId && candidate.status === "awaiting") {
      let planning = operations.listWorldObjects({ projectId, type: "event" }).find((item) => item.title === PLANNING_TITLE && item.status === "planned");
      if (!planning) planning = operations.createPlanningEvent({ projectId, title: PLANNING_TITLE, tags: ["Multiverse Fixture", "待作者审查"], body: planningBody() });
      const impact = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
      authorControl.decideCandidateReview({
        projectId,
        reviewId: review.id,
        candidateId: MULTIVERSE_EVENT_CHANGE_ID,
        decision: "accepted",
        confirmationReceipt: { planningEventId: planning.id, impactReviewId: impact.id, nuwaRunId: MULTIVERSE_R0_RUN_ID },
        decidedAt: "2026-08-24T09:30:00.000Z"
      });
    }
    return read(projectId);
  }

  function reject(projectId) {
    prepareReview(projectId, [MULTIVERSE_EVENT_CHANGE_ID]);
    const { review, candidate } = reviewState(projectId);
    if (candidate?.status === "awaiting") authorControl.decideCandidateReview({ projectId, reviewId: review.id, candidateId: MULTIVERSE_EVENT_CHANGE_ID, decision: "rejected", reason: "作者放弃这个版本差异；正式 Event 与其他 Owner 写入均为 0。", decidedAt: "2026-08-24T09:31:00.000Z" });
    return read(projectId);
  }

  function confirm(projectId, selectedChangeIds = [MULTIVERSE_EVENT_CHANGE_ID]) {
    const before = read(projectId);
    if (!before.compare) throw new Error("Multiverse compare is unavailable.");
    if (before.review.stage === "integrated") return before;
    validateSingleEventSelection(before.compare, selectedChangeIds);
    const prepared = prepareImpact(projectId);
    let { impact, changeSet } = reviewState(projectId);
    if (!impact) throw new Error("Impact Review is unavailable.");
    if (impact.status === "pending") {
      const option = impact.options[0];
      if (!option) throw new Error("Impact Review has no author route.");
      impact = authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: option.id, action: "adopt" });
    }
    if (!changeSet || changeSet.reviewId !== impact.id) changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: impact.id });
    if (changeSet.status === "pending") changeSet = authorControl.dryRunAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    changeSet = authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    faultInjector("after-event-apply", { projectId, eventId: changeSet.application.appliedEventId });

    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((version) => version.identity.kind === "root");
    const derived = versionAuthority.listVersions().find((version) => version.identity.kind === "derived");
    if (!root || !derived) throw new Error("Root and derived WorkVersions are required for integration.");
    if (root.identity.currentRevision === 1) {
      versionAuthority.appendRevision({
        workVersionId: root.identity.workVersionId,
        expectedRevision: 1,
        authorActionId: APPEND_ACTION_ID,
        idempotencyKey: `multiverse-r0:root-r2:${projectId}:${changeSet.id}`,
        createdAt: "2026-08-24T09:40:00.000Z",
        ownerSnapshotRefs: ownerSnapshotRefs(projectId, "root-r2", { confirmedEventId: changeSet.application.appliedEventId }),
        optionalNuwaProvenanceRefs: [],
        semanticDeltaRefs: [
          MULTIVERSE_EVENT_CHANGE_ID,
          `candidate-review:${reviewState(projectId).review.id}`,
          `impact-review:${impact.id}`,
          `author-change-set:${changeSet.id}`,
          `event:${changeSet.application.appliedEventId}`,
          `derived:${derived.identity.workVersionId}`
        ]
      });
    } else if (root.identity.currentRevision !== 2) throw new Error("Unexpected root WorkVersion revision during R0 integration.");

    let run = ensureCompletedRun(projectId);
    if (run.handoff?.status === "sent-review") {
      run = markNuwaCandidateIntegrated(run);
      writeNuwaBoundedRun(projectPath(projectId), run);
    }
    return read(projectId);
  }

  function ownerSnapshotRefs(projectId, seed, semantic = {}) {
    const project = isolatedProject(projectId);
    const objects = operations.listWorldObjects({ projectId });
    const confirmedEventIds = authorControl.listVerifiedCanonEventIds({ projectId });
    const characters = objects.filter((item) => item.type === "character").map((item) => ({ id: item.id, revision: item.revisionToken }));
    const events = objects.filter((item) => item.type === "event" && confirmedEventIds.includes(item.id)).map((item) => ({ id: item.id, revision: item.revisionToken }));
    const storyUnits = operations.listStoryUnits({ projectId }).map((item) => ({ id: item.id, version: item.version }));
    const outputs = operations.listOutputArtifacts({ projectId }).map((item) => ({ id: item.id, version: item.version }));
    const slices = {
      project: projectionSlice("project", seed, [`project:${project.id}`], { projectId: project.id, title: project.title }),
      "story-structure": projectionSlice("story-structure", seed, storyUnits.length ? storyUnits.map((item) => `story-unit:${item.id}`) : [`story-structure:${project.id}:empty`], { state: storyUnits.length ? "present" : "empty", storyUnits }),
      "event-hierarchy": projectionSlice("event-hierarchy", seed, events.length ? events.map((item) => `event:${item.id}`) : semantic.candidate ? [`candidate:${semantic.candidate}`] : [`event-hierarchy:${project.id}:empty`], { events, candidateEventRef: semantic.candidate || null }),
      "character-state": projectionSlice("character-state", seed, characters.length ? characters.map((item) => `character:${item.id}`) : [`character-state:${project.id}:empty`], { characters, confirmedEventId: semantic.confirmedEventId || null }),
      "world-state": projectionSlice("world-state", seed, [`world-state:${project.id}:unchanged`], { state: "unchanged", confirmedEventId: semantic.confirmedEventId || null }),
      relation: projectionSlice("relation", seed, [`relation:${project.id}:unchanged`], { state: "unchanged" }),
      canon: projectionSlice("canon", seed, confirmedEventIds.length ? confirmedEventIds.map((id) => `canon-event:${id}`) : [`canon:${project.id}:empty`], { state: confirmedEventIds.length ? "present" : "empty", confirmedEventIds }),
      "source-anchors": projectionSlice("source-anchors", seed, ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"], { sourceAnchorIds: ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"] }),
      "creation-output": projectionSlice("creation-output", seed, outputs.length ? outputs.map((item) => `creation-output:${item.id}`) : [`creation-output:${project.id}:empty`], { state: outputs.length ? "present" : "empty", outputs })
    };
    return resolveWorkVersionOwnerSnapshotRefs(slices);
  }

  return Object.freeze({ read, createRoot, saveDerived, prepareReview, prepareImpact, reject, confirm, ensureCompletedRun, listVersions });
}

function projectionSlice(ownerKind, seed, stableReferenceIds, canonicalProjection) {
  const revisionToken = stableHash({ ownerKind, seed, canonicalProjection });
  return {
    ownerIdentity: `story-studio.${ownerKind}`,
    projectionSchemaVersion: `story-studio-${ownerKind}-projection/r0`,
    revisionToken,
    stableReferenceIds,
    provenanceReceiptIds: [`snapshot-receipt:${ownerKind}:${revisionToken.slice(0, 24)}`],
    canonicalProjection
  };
}

function versionView(version) {
  return {
    id: version.identity.workVersionId,
    name: version.identity.displayName,
    kind: version.identity.kind,
    revision: version.identity.currentRevision,
    manifestId: version.identity.headManifestId,
    receiptId: version.receipt.receiptId,
    createdAt: version.identity.createdAt
  };
}

function candidateResult(project, run) {
  return storyObservationPatchToCandidateResult({
    version: "story-observation-proposal-patch/v1",
    patchId: "patch.multiverse-single-derived-r0",
    projectId: project.id,
    baseCanonVersion: run.snapshot.integrity,
    contextId: MULTIVERSE_R0_CONTEXT_ID,
    selection: { projection: "event-line", nodeIds: ["fixture.event.key-transfer"], relationIds: [], timeWindow: null, clueSources: ["archive", "character"], observer: "多元版本已选变化" },
    sources: [
      { id: "source.anchor.watch-ledger-fragment", type: "archive-anchor", label: "灯塔守夜记录残页", excerpt: "旧名曾出现；残页没有精确日期。" },
      { id: "source.anchor.a-wu-observation", type: "character-observation", label: "阿芜现场观察", excerpt: "阿芜只复述自己见过的记录，不确认寄信人。" }
    ],
    unknowns: ["寄信人身份仍未知", "旧名记录的精确世界时间仍未知"],
    prohibitedChanges: ["不得确认寄信人", "不得修改 Relation truth", "不得回写 Nuwa steps"],
    operations: [{
      operationId: MULTIVERSE_EVENT_CHANGE_ID,
      kind: "add-event",
      title: PLANNING_TITLE,
      change: "在铜钥匙交接之后，增加先核对旧名守夜记录的候选事件。",
      after: "沈砚知道旧名可能与守夜记录相关；阿芜仍不知道寄信人身份。",
      rationale: `来自 ${run.runId} / ${run.handoff.sourceBranchId} / ${run.handoff.sourceStepId}。`,
      confidence: 1,
      risk: "守夜记录残页缺少精确日期，世界时间必须保持未知。",
      affectedNodeIds: ["fixture.event.key-transfer", "fixture.character.shen-yan", "fixture.character.a-wu"],
      evidence: ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"],
      conflicts: ["旧名出现的精确世界时间未知"],
      timeEstimate: { label: "铜钥匙交接之后，灯塔行动之前", precision: "range" }
    }],
    adapter: { kind: "development-deterministic", providerCalls: 0 },
    createdAt: "2026-08-24T09:15:00.000Z"
  }, project.title);
}

function planningBody() {
  return [
    `# ${PLANNING_TITLE}`,
    "",
    "## Multiverse source",
    `- Run: ${MULTIVERSE_R0_RUN_ID}`,
    "- Branch: branch.temporary-old-name-correction",
    "- Step: branch.temporary-old-name-correction.step.4",
    `- Selected change: ${MULTIVERSE_EVENT_CHANGE_ID}`,
    "",
    "## Remains unknown",
    "- Sender identity",
    "- Exact world time",
    "",
    "This isolated Fixture planning Event is not confirmed until AuthorControl applies it."
  ].join("\n");
}
