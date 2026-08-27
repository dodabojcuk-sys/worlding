/**
 * Thin bridge from a durable Tianyi creative Event proposal to the existing
 * Candidate Review → Impact Review → Author ChangeSet → AuthorControl chain.
 * It owns neither a store nor a Canon/Event writer.
 */
const PORT_TAG = "天意事件候选";

export function createTianyiCreativeEventPort({ operations, authorControl }) {
  function requireProject(projectId) {
    const project = operations.listProjects().find((item) => item.id === projectId);
    if (!project) throw new Error("当前作品已不存在或未选择。");
    return project;
  }

  function requireCandidate(projection, input) {
    const candidate = projection?.candidates.find((item) => item.candidateId === input.candidateId);
    if (!candidate || candidate.kind !== "event" || candidate.targetOwnerKind !== "candidate-review") throw new Error("这不是可进入事件审查的天意 Event 候选。");
    const source = candidate.sourceRefs?.[0];
    if (!source || source.sessionId !== input.sessionId || !source.eventId || !source.contentHash) throw new Error("天意 Event 候选缺少可验证的项目来源、原话版本或来源引用。");
    const latest = projection.originals?.at(-1);
    if (!latest || latest.eventId !== source.eventId || latest.contentHash !== source.contentHash || projection.summaryState === "stale") {
      throw new Error("天意候选的来源版本已过期；请先基于当前原话重新整理，不能写入事件线。");
    }
    if (candidate.state !== "pending" && candidate.state !== "handed-off") throw new Error("该天意候选当前不可进入正式事件审查。");
    return { candidate, source };
  }

  function marker(input) { return `天意候选：${input.sessionId}:${input.candidateId}`; }
  function planningFor(projectId, input) {
    const key = marker(input);
    return operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status === "planned" && item.tags.includes(PORT_TAG))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }))
      .find((item) => item.body.includes(key)) || null;
  }
  function reviewFor(projectId, input) {
    return authorControl.listCandidateReviews({ projectId })
      .find((item) => item.contextPackId === `tianyi-creative-event:${input.sessionId}:${input.candidateId}`) || null;
  }
  function confirmedFor(projectId, planning) {
    if (!planning) return [];
    return operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status === "committed" && item.tags.includes("作者确认"))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }))
      .filter((item) => item.properties?.planned_from === planning.id || item.body.includes(planning.id));
  }
  function currentImpact(projectId, planning) {
    const impact = authorControl.readImpactReview({ projectId });
    return impact?.source?.kind === "planning-event" && impact.source.id === planning?.id ? impact : null;
  }

  function state(projectId, input, projection) {
    const project = requireProject(projectId);
    const { candidate, source } = requireCandidate(projection, input);
    const planning = planningFor(projectId, input);
    const candidateReview = reviewFor(projectId, input);
    const impact = currentImpact(projectId, planning);
    const changeSet = impact ? authorControl.readAuthorChangeSet({ projectId }) : null;
    const confirmedEvents = confirmedFor(projectId, planning);
    return {
      version: "tianyan-tianyi-event-review-bridge/r0",
      proposal: {
        id: candidate.candidateId,
        title: candidate.title,
        summary: candidate.summary,
        origin: { projectId: project.id, sessionId: source.sessionId, eventId: source.eventId, version: source.contentHash },
        writeTarget: { storyId: `story.${project.id}`, version: source.contentHash, owner: "story-studio-event-owner" },
        evidence: [{ sourceRef: `${source.sessionId}:${source.eventId}:${source.contentHash}`, excerpt: candidate.sourceExcerpt }],
        unknowns: candidate.uncertainties
      },
      planning: planning ? { id: planning.id, title: planning.title, revision: planning.revisionToken } : null,
      candidateReview,
      impact,
      changeSet,
      confirmedEvents: confirmedEvents.map((event) => ({ id: event.id, title: event.title, revision: event.revisionToken })),
      writeBoundary: { canon: 0, worldState: 0, event: 0, provider: 0, plugin: 0 }
    };
  }

  function createCandidate(projectId, input, projection) {
    const project = requireProject(projectId);
    const { candidate, source } = requireCandidate(projection, input);
    const body = [
      `# ${candidate.title}`,
      "",
      candidate.summary,
      "",
      `- ${marker(input)}`,
      `- 项目：${project.id}`,
      `- 故事来源：天意会话 ${source.sessionId} / 原话 ${source.eventId}`,
      `- 来源版本：${source.contentHash}`,
      `- 写入目标：story.${project.id}（当前项目故事；版本锚定为上述来源版本）`,
      `- 证据：${candidate.sourceExcerpt}`,
      `- 待确认：${candidate.uncertainties.join("；") || "无"}`
    ].join("\n");
    const planning = planningFor(projectId, input) || operations.createPlanningEvent({ projectId, title: candidate.title, body, tags: [PORT_TAG, "待作者审查"] });
    const contextPackId = `tianyi-creative-event:${input.sessionId}:${input.candidateId}`;
    const review = authorControl.createCandidateReview({
      projectId,
      createdAt: new Date().toISOString(),
      minimumCandidates: 1,
      result: {
        contextPack: { id: contextPackId, sources: [{ type: "tianyi-creative-source", label: `天意原话 ${source.eventId} · ${source.contentHash}` }] },
        contextReceiptId: source.eventId,
        nuwaRunId: null,
        nuwa: { candidates: [{ id: `candidate:${input.candidateId}`, title: candidate.title, change: candidate.summary, after: candidate.summary, evidence: [candidate.sourceExcerpt], uncertainty: candidate.uncertainties.join("；") || "无" }] }
      }
    });
    return { planning, review };
  }

  function beginImpact(projectId, input, projection) {
    const prepared = createCandidate(projectId, input, projection);
    const route = prepared.review.candidates[0];
    if (!route || route.status !== "awaiting") throw new Error("该天意 Event 候选已不处于可审查状态。");
    return authorControl.createPlanningEventImpactReview({ projectId, planningEventId: prepared.planning.id });
  }
  function reject(projectId, input, projection) {
    const prepared = createCandidate(projectId, input, projection);
    const route = prepared.review.candidates[0];
    if (route?.status === "awaiting") authorControl.decideCandidateReview({ projectId, reviewId: prepared.review.id, candidateId: route.id, decision: "rejected", reason: "作者拒绝此天意 Event 候选；未写入事件、Canon 或世界事实。", decidedAt: new Date().toISOString() });
    return state(projectId, input, projection);
  }
  function confirm(projectId, input, projection, optionId) {
    const prepared = createCandidate(projectId, input, projection);
    if (confirmedFor(projectId, prepared.planning).length > 0) return state(projectId, input, projection);
    const impact = currentImpact(projectId, prepared.planning);
    if (!impact) throw new Error("请先查看并建立影响审查；系统不会替作者默认确认。");
    if (impact.status === "stale") throw new Error("影响审查已过期；不能确认或写入事件线。");
    const selectedOption = impact.options.find((item) => item.id === optionId) || (impact.status === "selected" ? impact.options[0] : null);
    if (!selectedOption) throw new Error("请选择一条影响审查路线后再确认。");
    const resolved = impact.status === "selected" ? impact : authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: selectedOption.id, action: "adopt" });
    const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: resolved.id });
    authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    const route = prepared.review.candidates[0];
    if (route?.status === "awaiting") authorControl.decideCandidateReview({ projectId, reviewId: prepared.review.id, candidateId: route.id, decision: "accepted", confirmationReceipt: { planningEventId: prepared.planning.id, impactReviewId: resolved.id }, decidedAt: new Date().toISOString() });
    return state(projectId, input, projection);
  }

  return { state, createCandidate, beginImpact, reject, confirm };
}
