import { storyObservationPatchToCandidateResult } from "../../../src/storyContracts/storyObservationProposalPatch.ts";

const CONTEXT_ID = "context.character-state-impact-r0";
const CANDIDATE_ID = "candidate.character-state.old-name-reveal";
const PLANNING_TITLE = "阿芜告诉沈砚，旧名曾出现在灯塔守夜记录中";

export function createCharacterStateImpactFixtureAdapter({ operations, authorControl, now = () => new Date().toISOString() }) {
  function assertIsolated(projectId) {
    const project = operations.listProjects().find((item) => item.id === projectId);
    if (!project) throw new Error("Character State Fixture project does not exist.");
    if (!/隔离|fixture/i.test(project.title)) throw new Error("Character State Fixture writes require an explicitly isolated project.");
    return project;
  }

  function candidateResult(project) {
    return storyObservationPatchToCandidateResult({
      version: "story-observation-proposal-patch/v1",
      patchId: "patch.character-state-impact-r0",
      projectId: project.id,
      baseCanonVersion: "fixture-canon-r0",
      contextId: CONTEXT_ID,
      selection: { projection: "event-line", nodeIds: ["fixture.event.letter", "fixture.event.key-transfer"], relationIds: [], timeWindow: null, clueSources: ["character", "object"], observer: "沈砚角色状态" },
      sources: [
        { id: "source.anchor.watch-ledger", type: "archive-anchor", label: "灯塔守夜记录", excerpt: "旧名曾出现在守夜记录中；寄信人身份仍未知。" },
        { id: "source.anchor.a-wu-statement", type: "event-source", label: "阿芜的转述", excerpt: "阿芜只转述旧名记录，不替作者确认寄信人身份。" }
      ],
      unknowns: ["寄信人身份仍未知", "旧名出现的具体世界时间仍未知"],
      prohibitedChanges: ["不得把寄信人身份升级为事实", "不得修改 Relation Graph", "不得泄漏阿芜未说出的私密判断"],
      operations: [{
        operationId: CANDIDATE_ID,
        kind: "add-event",
        title: PLANNING_TITLE,
        change: "沈砚获得旧名与灯塔守夜记录有关的新知识。",
        after: "沈砚知道旧名曾出现，但仍不知道寄信人身份；对阿芜的信任从有条件合作转为愿意核对记录。",
        rationale: "阿芜在场并明确转述记录内容，来源锚点完整。",
        confidence: 1,
        risk: "若把旧名记录解释为寄信人身份证明，会造成角色知识越界。",
        affectedNodeIds: ["fixture.character.shen-yan", "fixture.character.a-wu", "fixture.event.lighthouse-plan"],
        evidence: ["source.anchor.watch-ledger", "source.anchor.a-wu-statement"],
        conflicts: ["账册旁线对旧名出现的日期存在两个有效版本"],
        timeEstimate: { label: "钥匙交接之后，灯塔行动之前", precision: "range" }
      }],
      adapter: { kind: "development-deterministic", providerCalls: 0 },
      createdAt: "2026-08-23T00:00:00.000Z"
    }, project.title);
  }

  function findReview(projectId) {
    return authorControl.listCandidateReviews({ projectId }).find((review) => review.contextPackId === CONTEXT_ID) || null;
  }

  function read(projectId) {
    const candidateReview = findReview(projectId);
    const candidate = candidateReview?.candidates.find((item) => item.id === CANDIDATE_ID) || null;
    const impactReviewId = candidate?.confirmationReceipt?.impactReviewId || null;
    const impactReview = impactReviewId ? authorControl.readImpactReview({ projectId, reviewId: impactReviewId }) : null;
    const latestChangeSet = authorControl.readAuthorChangeSet({ projectId });
    const changeSet = latestChangeSet?.reviewId === impactReviewId ? latestChangeSet : null;
    const stage = changeSet?.status === "applied" ? "confirmed" : candidate?.status === "rejected" ? "rejected" : impactReview ? "awaiting_author" : candidateReview ? "candidate" : "initial";
    return {
      version: "tianyan-character-event-impact-fixture/v1",
      stage,
      candidateReviewId: candidateReview?.id || null,
      candidateId: CANDIDATE_ID,
      candidateStatus: candidate?.status || "not-created",
      impactReviewId,
      impactStatus: impactReview?.status || null,
      changeSetId: changeSet?.id || null,
      appliedEventId: changeSet?.application.appliedEventId || null,
      formalEventWrites: changeSet?.status === "applied" ? 1 : 0,
      characterWrites: 0,
      worldStateWrites: 0,
      relationWrites: 0,
      providerCalls: 0,
      preview: impactPreview()
    };
  }

  function prepare(projectId) {
    const project = assertIsolated(projectId);
    let review = findReview(projectId);
    if (!review) review = authorControl.createCandidateReview({ projectId, result: candidateResult(project), minimumCandidates: 1, createdAt: now() });
    const candidate = review.candidates.find((item) => item.id === CANDIDATE_ID);
    if (candidate?.status === "rejected") return read(projectId);
    if (!candidate?.confirmationReceipt?.impactReviewId) {
      let planning = operations.listWorldObjects({ projectId, type: "event" }).find((item) => item.title === PLANNING_TITLE && item.status === "planned");
      if (!planning) planning = operations.createPlanningEvent({ projectId, title: PLANNING_TITLE, tags: ["Character State Fixture", "待作者审查"], body: planningBody() });
      const impact = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
      authorControl.decideCandidateReview({ projectId, reviewId: review.id, candidateId: CANDIDATE_ID, decision: "accepted", confirmationReceipt: { planningEventId: planning.id, impactReviewId: impact.id }, decidedAt: now() });
    }
    return read(projectId);
  }

  function reject(projectId) {
    const project = assertIsolated(projectId);
    let review = findReview(projectId);
    if (!review) review = authorControl.createCandidateReview({ projectId, result: candidateResult(project), minimumCandidates: 1, createdAt: now() });
    const candidate = review.candidates.find((item) => item.id === CANDIDATE_ID);
    if (candidate?.status === "awaiting") authorControl.decideCandidateReview({ projectId, reviewId: review.id, candidateId: CANDIDATE_ID, decision: "rejected", reason: "作者拒绝此候选；未写入角色、事件、世界状态或关系事实。", decidedAt: now() });
    return read(projectId);
  }

  function confirm(projectId) {
    const prepared = prepare(projectId);
    if (!prepared.impactReviewId) throw new Error("Character impact review is unavailable.");
    let impact = authorControl.readImpactReview({ projectId, reviewId: prepared.impactReviewId });
    if (!impact) throw new Error("Character impact review is missing.");
    if (impact.status === "pending") {
      const option = impact.options[0];
      if (!option) throw new Error("Character impact review has no author route.");
      impact = authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: option.id, action: "adopt" });
    }
    let changeSet = authorControl.readAuthorChangeSet({ projectId });
    if (!changeSet || changeSet.reviewId !== impact.id) changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: impact.id });
    if (changeSet.status === "pending") authorControl.dryRunAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    return read(projectId);
  }

  return { read, prepare, reject, confirm };
}

function planningBody() {
  return [
    `# ${PLANNING_TITLE}`,
    "",
    "## 候选变化",
    "沈砚获得旧名与灯塔守夜记录有关的新知识。",
    "",
    "## 仍然未知",
    "- 寄信人身份",
    "- 旧名出现的精确世界时间",
    "",
    "## 来源",
    "- source.anchor.watch-ledger",
    "- source.anchor.a-wu-statement",
    "",
    "本记录是隔离 Fixture 的作者规划事件；确认前不属于已发生事实。"
  ].join("\n");
}

function impactPreview() {
  return {
    title: PLANNING_TITLE,
    sources: ["灯塔守夜记录", "阿芜的转述"],
    affectedCharacters: ["沈砚", "阿芜"],
    before: ["沈砚知道来信警告，但不知道旧名记录", "沈砚只与阿芜保持有条件合作"],
    after: ["沈砚知道旧名曾出现在守夜记录中", "沈砚愿意与阿芜共同核对记录"],
    newKnowledge: ["旧名与灯塔守夜记录有关"],
    remainsUnknown: ["寄信人身份", "旧名出现的精确世界时间"],
    beliefChanges: ["‘阿芜可能隐瞒记录’从怀疑转为待核对开放问题"],
    goalChanges: ["新增：核对守夜记录"],
    relationshipChanges: ["沈砚视角：有条件合作 → 愿意共同核对"],
    affectedEvents: ["灯塔在无风夜亮起"],
    affectedFatePoints: ["知识边界 / 关系认知"],
    conflicts: ["账册旁线对旧名出现日期存在两个有效版本"],
    openQuestions: ["谁写下旧名？", "阿芜从何处看到记录？"],
    ownerWritePlan: ["现有 Candidate Review", "现有 Impact Review", "现有 Author Change Set", "现有 Event owner（仅作者确认后）"],
    safeToApply: true
  };
}
