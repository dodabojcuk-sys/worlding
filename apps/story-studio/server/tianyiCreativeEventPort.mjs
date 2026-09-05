/**
 * Thin bridge from a durable Tianyi creative Event proposal to the existing
 * Candidate Review → Impact Review → Author ChangeSet → AuthorControl chain.
 * It owns neither a store nor a Canon/Event writer.
 */
const PORT_TAG = "天意事件候选";
const RECEIPT_PREFIX = "<!-- tianyi-adoption-receipt:";
const RECEIPT_SUFFIX = " -->";

export function createTianyiCreativeEventPort({ operations, authorControl, creationSourceSelectionPort }) {
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
  function nextOperationTime(value) {
    const timestamp = Date.parse(String(value || ""));
    if (!Number.isFinite(timestamp)) throw new Error("天意采纳操作缺少可验证的版本时间。");
    return new Date(timestamp + 1).toISOString();
  }
  function recordedOperationTime(planning) {
    const match = planning.body.match(/^- 采纳操作时间：(.+)$/mu);
    if (!match) throw new Error("天意候选缺少稳定的采纳操作时间；禁止生成不可重放的版本回执。");
    return match[1];
  }
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

  function adoptionReceipt(planning) {
    if (!planning) return null;
    const line = planning.body.split("\n").find((item) => item.startsWith(RECEIPT_PREFIX) && item.endsWith(RECEIPT_SUFFIX));
    if (!line) return null;
    try { return JSON.parse(line.slice(RECEIPT_PREFIX.length, -RECEIPT_SUFFIX.length)); }
    catch { throw new Error("天意采纳回执已损坏；禁止猜测版本状态。"); }
  }

  function writeAdoptionReceipt(projectId, planning, receipt) {
    const encoded = `${RECEIPT_PREFIX}${JSON.stringify(receipt)}${RECEIPT_SUFFIX}`;
    const body = planning.body.split("\n").filter((line) => !line.startsWith(RECEIPT_PREFIX)).concat(["", encoded]).join("\n");
    const updated = operations.updateWorldObject({ projectId, objectId: planning.id, expectedHash: planning.revisionToken, title: planning.title, status: planning.status, tags: planning.tags, aliases: planning.aliases, body });
    if (updated.conflict) throw new Error("采纳回执写入冲突；请重新载入后核对已生成版本。");
    return updated.object;
  }

  function state(projectId, input, projection) {
    const project = requireProject(projectId);
    const { candidate, source } = requireCandidate(projection, input);
    const planning = planningFor(projectId, input);
    const candidateReview = reviewFor(projectId, input);
    const impact = currentImpact(projectId, planning);
    const latestChangeSet = impact ? authorControl.readAuthorChangeSet({ projectId }) : null;
    const changeSet = latestChangeSet?.reviewId === impact?.id ? latestChangeSet : null;
    const confirmedEvents = confirmedFor(projectId, planning);
    const receipt = adoptionReceipt(planning);
    const rootVersion = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    return {
      version: "tianyan-tianyi-event-review-bridge/r0",
      proposal: {
        id: candidate.candidateId,
        title: candidate.title,
        summary: candidate.summary,
        origin: { projectId: project.id, sessionId: source.sessionId, eventId: source.eventId, version: source.contentHash },
        writeTarget: { storyId: `story.${project.id}`, version: receipt?.baseVersion?.label ?? (rootVersion ? `${rootVersion.identity.workVersionId}@r${rootVersion.identity.currentRevision}` : "missing"), owner: "story-studio-event-owner" },
        evidence: [{ sourceRef: `${source.sessionId}:${source.eventId}:${source.contentHash}`, excerpt: candidate.sourceExcerpt }],
        unknowns: candidate.uncertainties
      },
      reviewContext: {
        project: { id: project.id, displayName: project.title },
        source: {
          displayName: `天意作者原话 · 会话 ${source.sessionId}`,
          versionLabel: `当前来源版本 · ${source.contentHash.slice(0, 12)}`,
          freshness: "current"
        },
        writeTarget: { id: `story.${project.id}`, displayName: "当前作品 · 事件线" },
        safety: "候选，不会自动写入故事事实"
      },
      planning: planning ? { id: planning.id, title: planning.title, revision: planning.revisionToken } : null,
      candidateReview,
      impact,
      changeSet,
      confirmedEvents: confirmedEvents.map((event) => ({ id: event.id, title: event.title, revision: event.revisionToken })),
      versionState: rootVersion ? { workVersionId: rootVersion.identity.workVersionId, revision: rootVersion.identity.currentRevision, manifestId: rootVersion.identity.headManifestId } : null,
      adoptionReceipt: receipt,
      writeBoundary: { canon: 0, worldState: 0, event: 0, provider: 0, plugin: 0 }
    };
  }

  function createCandidate(projectId, input, projection) {
    const project = requireProject(projectId);
    const { candidate, source } = requireCandidate(projection, input);
    const rootVersion = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    if (!rootVersion) throw new Error("当前作品尚未建立主故事版本；请先建立版本后再把候选带入正式工作。");
    if (rootVersion.identity.status !== "active") throw new Error("当前主故事版本已归档，不能接收候选。");
    const body = [
      `# ${candidate.title}`,
      "",
      candidate.summary,
      "",
      `- ${marker(input)}`,
      `- 项目：${project.id}`,
      `- 故事来源：天意会话 ${source.sessionId} / 原话 ${source.eventId}`,
      `- 来源版本：${source.contentHash}`,
      `- 写入目标：story.${project.id}`,
      `- 基础版本：${rootVersion.identity.workVersionId}@r${rootVersion.identity.currentRevision}`,
      `- 基础清单：${rootVersion.identity.headManifestId}`,
      `- 采纳操作时间：${nextOperationTime(rootVersion.revision.createdAt)}`,
      `- 证据：${candidate.sourceExcerpt}`,
      `- 待确认：${candidate.uncertainties.join("；") || "无"}`
    ].join("\n");
    const planning = planningFor(projectId, input) || operations.createPlanningEvent({ projectId, title: candidate.title, body, tags: [PORT_TAG, "待作者审查"] });
    const contextPackId = `tianyi-creative-event:${input.sessionId}:${input.candidateId}`;
    const review = authorControl.createCandidateReview({
      projectId,
      createdAt: recordedOperationTime(planning),
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
    const existingReceipt = adoptionReceipt(prepared.planning);
    if (existingReceipt) return state(projectId, input, projection);
    const impact = currentImpact(projectId, prepared.planning);
    if (!impact) throw new Error("请先查看并建立影响审查；系统不会替作者默认确认。");
    if (impact.status === "stale") throw new Error("影响审查已过期；不能确认或写入事件线。");
    const selectedOption = impact.options.find((item) => item.id === optionId) || (impact.status === "selected" ? impact.options[0] : null);
    if (!selectedOption) throw new Error("请选择一条影响审查路线后再确认。");
    const resolved = impact.status === "selected" ? impact : authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: selectedOption.id, action: "adopt" });
    const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: resolved.id });
    const root = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    if (!root) throw new Error("采纳时主故事版本缺失；禁止在缺少版本权威时写入 Event。");
    const match = prepared.planning.body.match(/^- 基础版本：(.+)@r(\d+)$/mu);
    if (!match || match[1] !== root.identity.workVersionId) throw new Error("候选的基础版本身份无效；禁止写入当前故事版本。");
    const baseRevision = Number(match[2]);
    if (root.identity.currentRevision !== baseRevision) throw new Error("主故事版本已前进；请基于当前 BaseVersion 重新完成影响审查，未写入 Event。");
    const applied = authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    const version = creationSourceSelectionPort.appendStructuredStoryRevision(projectId, {
      expectedRevision: baseRevision,
      authorActionId: `author.tianyi-adopt.${input.candidateId}`,
      idempotencyKey: `tianyi-adopt:${input.sessionId}:${input.candidateId}`,
      createdAt: recordedOperationTime(prepared.planning),
      semanticDeltaRefs: [`changeset:${changeSet.id}`, `event:${applied.application.appliedEventId}`, `tianyi-candidate:${input.candidateId}`]
    });
    const route = prepared.review.candidates[0];
    if (route?.status === "awaiting") authorControl.decideCandidateReview({ projectId, reviewId: prepared.review.id, candidateId: route.id, decision: "accepted", confirmationReceipt: { planningEventId: prepared.planning.id, impactReviewId: resolved.id }, decidedAt: new Date().toISOString() });
    writeAdoptionReceipt(projectId, prepared.planning, {
      schemaVersion: "tianyan-tianyi-adoption-receipt/r0",
      receiptId: `tianyi-adoption.${input.candidateId}`,
      status: "active",
      sessionId: input.sessionId,
      candidateId: input.candidateId,
      targetStoryId: `story.${projectId}`,
      baseVersion: { workVersionId: root.identity.workVersionId, revision: baseRevision, label: `${root.identity.displayName} V${baseRevision}` },
      resultVersion: { workVersionId: version.identity.workVersionId, revision: version.identity.currentRevision, label: `${version.identity.displayName} V${version.identity.currentRevision}` },
      changeSetId: changeSet.id,
      appliedEventId: applied.application.appliedEventId,
      workVersionReceiptId: version.receipt.receiptId,
      recordedAt: recordedOperationTime(prepared.planning),
      structuredDiff: changeSet.changes,
      sourceRefs: [`${input.sessionId}:${input.candidateId}`],
      compensation: null
    });
    return state(projectId, input, projection);
  }

  function reconfirm(projectId, input, projection) {
    const prepared = createCandidate(projectId, input, projection);
    const receipt = adoptionReceipt(prepared.planning);
    if (!receipt || receipt.status !== "undone" || !receipt.appliedEventId) throw new Error("只有已撤销且回执完整的 Event 候选才能恢复采纳。");
    const originalEvent = operations.readWorldObject({ projectId, objectId: receipt.appliedEventId });
    if (!originalEvent || originalEvent.status !== "committed") throw new Error("原 Event 已丢失或状态已变化；不能猜测恢复。");
    const root = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    if (!root) throw new Error("恢复采纳时主故事版本缺失。");
    const createdAt = nextOperationTime(root.revision.createdAt);
    const version = creationSourceSelectionPort.appendStructuredStoryRevision(projectId, {
      expectedRevision: root.identity.currentRevision,
      authorActionId: `author.tianyi-readopt.${input.candidateId}`,
      idempotencyKey: input.operationId || `tianyi-readopt:${input.sessionId}:${input.candidateId}:r${root.identity.currentRevision}`,
      createdAt,
      semanticDeltaRefs: [`readopt-of:${receipt.receiptId}`, `event:${receipt.appliedEventId}`, `tianyi-candidate:${input.candidateId}`]
    });
    writeAdoptionReceipt(projectId, operations.readWorldObject({ projectId, objectId: prepared.planning.id }), {
      ...receipt,
      status: "active",
      baseVersion: { workVersionId: root.identity.workVersionId, revision: root.identity.currentRevision, label: `${root.identity.displayName} V${root.identity.currentRevision}` },
      resultVersion: { workVersionId: version.identity.workVersionId, revision: version.identity.currentRevision, label: `${version.identity.displayName} V${version.identity.currentRevision}` },
      workVersionReceiptId: version.receipt.receiptId,
      recordedAt: createdAt,
      compensation: null
    });
    return state(projectId, input, projection);
  }

  function undo(projectId, input, projection) {
    const prepared = createCandidate(projectId, input, projection);
    const receipt = adoptionReceipt(prepared.planning);
    if (!receipt || receipt.status !== "active") return state(projectId, input, projection);
    const root = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    const expectedCurrentRevision = Number.isSafeInteger(input.expectedCurrentRevision)
      ? input.expectedCurrentRevision
      : receipt.resultVersion.revision;
    if (!root || root.identity.workVersionId !== receipt.resultVersion.workVersionId || root.identity.currentRevision !== expectedCurrentRevision) throw new Error("故事版本已继续前进；本次撤销需要先重新评估，不能覆盖后续变化。");
    const compensationMarker = `天意补偿：${input.sessionId}:${input.candidateId}`;
    const compensationPlanning = operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status === "planned" && item.tags.includes(PORT_TAG))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }))
      .find((item) => item.body.includes(compensationMarker))
      || operations.createPlanningEvent({ projectId, title: `撤销：${prepared.planning.title}`, tags: [PORT_TAG, "补偿版本"], body: `# 撤销：${prepared.planning.title}\n\n作者撤销先前采纳；保留原始 Event 与回执历史，并以补偿事件表达语义逆转。\n\n- ${compensationMarker}\n- 撤销回执：${receipt.receiptId}\n- 原 Event：${receipt.appliedEventId}\n` });
    const existingCompensation = confirmedFor(projectId, compensationPlanning)[0] || null;
    let compensationEvent = existingCompensation;
    if (!compensationEvent) {
      const impact = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: compensationPlanning.id });
      const option = impact.options[0];
      if (!option) throw new Error("撤销补偿缺少可用的结构化影响路线。");
      const resolved = authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: option.id, action: "adopt" });
      const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: resolved.id });
      const applied = authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
      compensationEvent = operations.readWorldObject({ projectId, objectId: applied.application.appliedEventId });
    }
    const version = creationSourceSelectionPort.appendStructuredStoryRevision(projectId, {
      expectedRevision: root.identity.currentRevision,
      authorActionId: `author.tianyi-undo.${input.candidateId}`,
      idempotencyKey: `tianyi-undo:${input.sessionId}:${input.candidateId}`,
      createdAt: nextOperationTime(receipt.recordedAt),
      semanticDeltaRefs: [`compensation-of:${receipt.receiptId}`, `event:${compensationEvent.id}`]
    });
    writeAdoptionReceipt(projectId, operations.readWorldObject({ projectId, objectId: prepared.planning.id }), {
      ...receipt,
      status: "undone",
      compensation: { eventId: compensationEvent.id, workVersionReceiptId: version.receipt.receiptId, resultVersion: { workVersionId: version.identity.workVersionId, revision: version.identity.currentRevision, label: `${version.identity.displayName} V${version.identity.currentRevision}` } }
    });
    return state(projectId, input, projection);
  }

  return { state, createCandidate, beginImpact, reject, confirm, reconfirm, undo };
}
