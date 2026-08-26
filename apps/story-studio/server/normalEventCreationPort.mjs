/**
 * Thin application coordinator for the ordinary Event Line author journey.
 * It persists only through the existing Story Unit, Candidate Review, Impact
 * Review and Author Control owners; this module deliberately owns no store.
 */
const PORT_TAG = "普通事件线";

export function createNormalEventCreationPort({ operations, authorControl }) {
  function project(projectId) {
    const value = operations.listProjects().find((item) => item.id === projectId);
    if (!value) throw new Error("当前作品已不存在或未选择。");
    return value;
  }

  function planningEvents(projectId) {
    return operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status === "planned" && item.tags.includes(PORT_TAG));
  }

  function selected(projectId, input = {}) {
    const units = operations.listStoryUnits({ projectId }).filter((unit) => unit.lifecycle !== "archived");
    const storyUnit = input.storyUnitId ? units.find((unit) => unit.id === input.storyUnitId) : units[0];
    const planning = input.planningEventId
      ? planningEvents(projectId).find((event) => event.id === input.planningEventId)
      : planningEvents(projectId).at(-1);
    return { units, storyUnit: storyUnit || null, planning: planning || null };
  }

  function candidateFor(projectId, planning) {
    if (!planning) return null;
    const contextPackId = `normal-event-line:${planning.id}`;
    return authorControl.listCandidateReviews({ projectId })
      .find((review) => review.contextPackId === contextPackId) || null;
  }

  function confirmedFor(projectId, planning) {
    return operations.listWorldObjects({ projectId, type: "event" })
      .filter((event) => event.status === "committed" && event.tags.includes("作者确认"))
      .map((event) => operations.readWorldObject({ projectId, objectId: event.id }))
      .filter((event) => event.properties?.planned_from === planning?.id || event.body.includes(planning?.id || ""));
  }

  function state(projectId, input = {}) {
    const currentProject = project(projectId);
    const { units, storyUnit, planning } = selected(projectId, input);
    const candidate = candidateFor(projectId, planning);
    const impact = planning ? authorControl.readImpactReview({ projectId }) : null;
    const impactForPlanning = impact?.source?.kind === "planning-event" && impact.source.id === planning?.id ? impact : null;
    const changeSet = impactForPlanning ? authorControl.readAuthorChangeSet({ projectId }) : null;
    const confirmed = confirmedFor(projectId, planning);
    return {
      version: "tianyan-normal-event-creation-port/r0",
      project: { id: currentProject.id, title: currentProject.title },
      storyUnits: units.map((unit) => ({ id: unit.id, title: unit.title, summary: unit.summary, version: unit.version })),
      selectedStoryUnitId: storyUnit?.id || null,
      planning: planning ? { id: planning.id, title: planning.title, body: planning.body, revision: planning.revisionToken } : null,
      candidate,
      impact: impactForPlanning,
      changeSet,
      confirmedEvents: confirmed.map((event) => ({ id: event.id, title: event.title, revision: event.revisionToken })),
      writeBoundary: {
        canon: 0,
        worldState: 0,
        character: 0,
        relation: 0,
        memory: 0,
        provider: 0,
        plugin: 0
      }
    };
  }

  function createStoryUnit(projectId, input = {}) {
    project(projectId);
    const title = String(input.title || "第一故事单元").trim();
    const existing = operations.listStoryUnits({ projectId }).find((unit) => unit.title === title && unit.lifecycle !== "archived");
    if (existing) return existing;
    return operations.createStoryUnit({
      projectId,
      title,
      summary: String(input.summary || "由作者在普通事件线建立的最小故事范围。").trim(),
      lifecycle: "active",
      sourceRefs: [],
      items: [],
      linkedEntityIds: [],
      unresolvedQuestionIds: [],
      generationConstraints: {},
      createdAt: new Date().toISOString()
    });
  }

  function createCandidate(projectId, input = {}) {
    project(projectId);
    const scope = selected(projectId, input);
    if (!scope.storyUnit) throw new Error("请先选择或建立一个故事单元。");
    const title = String(input.title || "").trim();
    const body = String(input.body || "").trim();
    if (!title || !body) throw new Error("请写下事件标题和作者输入，再进入评审。");
    const existing = planningEvents(projectId).find((event) => event.title === title && event.body.includes(body));
    const planning = existing || operations.createPlanningEvent({
      projectId,
      title,
      body: `# ${title}\n\n${body}\n\n- 故事单元：${scope.storyUnit.id}\n- 来源：作者在普通事件线输入\n`,
      tags: [PORT_TAG, "作者输入"]
    });
    const contextPackId = `normal-event-line:${planning.id}`;
    const review = authorControl.createCandidateReview({
      projectId,
      createdAt: new Date().toISOString(),
      minimumCandidates: 1,
      result: {
        contextPack: { id: contextPackId, sources: [{ type: "author-input", label: "普通事件线作者输入" }] },
        contextReceiptId: null,
        nuwaRunId: null,
        nuwa: { candidates: [{ id: `candidate:${planning.id}`, title: planning.title, after: body, change: body }] }
      }
    });
    const sourceRef = {
      sourceKind: "event-line",
      ownerId: "story-studio-event-owner",
      entityId: planning.id,
      entityVersion: planning.revisionToken,
      capturedAt: new Date().toISOString()
    };
    if (!scope.storyUnit.sourceRefs.some((ref) => ref.sourceKind === sourceRef.sourceKind && ref.entityId === sourceRef.entityId)) {
      const updated = operations.updateStoryUnit({
        projectId,
        unitId: scope.storyUnit.id,
        expectedVersion: scope.storyUnit.version,
        sourceRefs: [...scope.storyUnit.sourceRefs, sourceRef]
      });
      if (updated.conflict) throw new Error("故事单元刚刚被更新，请刷新后重新提交事件候选。");
    }
    return { planning, review };
  }

  function beginImpact(projectId, input = {}) {
    const scope = selected(projectId, input);
    if (!scope.planning) throw new Error("请先建立事件候选。");
    const review = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: scope.planning.id });
    return { planning: scope.planning, review };
  }

  function reject(projectId, input = {}) {
    const scope = selected(projectId, input);
    const candidate = candidateFor(projectId, scope.planning);
    if (!candidate || !scope.planning) throw new Error("没有可拒绝的事件候选。");
    const route = candidate.candidates[0];
    authorControl.decideCandidateReview({ projectId, reviewId: candidate.id, candidateId: route.id, decision: "rejected", reason: "作者拒绝此普通事件候选；未写入故事事实。", decidedAt: new Date().toISOString() });
    return state(projectId, input);
  }

  function confirm(projectId, input = {}) {
    const scope = selected(projectId, input);
    if (!scope.planning) throw new Error("请先建立事件候选。");
    if (confirmedFor(projectId, scope.planning).length > 0) return { applied: null, state: state(projectId, input) };
    const impact = authorControl.readImpactReview({ projectId });
    const review = impact?.source?.kind === "planning-event" && impact.source.id === scope.planning.id
      ? impact
      : authorControl.createPlanningEventImpactReview({ projectId, planningEventId: scope.planning.id });
    const choice = review.options[0];
    if (!choice) throw new Error("当前影响评审没有可确认的作者选项。");
    const resolved = review.status === "selected" ? review : authorControl.chooseImpactRoute({ projectId, reviewId: review.id, optionId: choice.id, action: "adopt" });
    const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: resolved.id });
    const applied = authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    const candidate = candidateFor(projectId, scope.planning);
    if (candidate?.status !== "accepted") {
      const route = candidate?.candidates[0];
      if (route) authorControl.decideCandidateReview({
        projectId,
        reviewId: candidate.id,
        candidateId: route.id,
        decision: "accepted",
        confirmationReceipt: { planningEventId: scope.planning.id, impactReviewId: resolved.id },
        decidedAt: new Date().toISOString()
      });
    }
    return { applied, state: state(projectId, input) };
  }

  return { state, createStoryUnit, createCandidate, beginImpact, reject, confirm };
}
