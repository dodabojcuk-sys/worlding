import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { targetObjectIdForAgentProposal } from "../../../src/storyControlSurface/storyStudioAgentProposalOperations.ts";
import { agentRecognitionProposalIdForKey, compensateAgentRecognitionApplication, createAgentRecognitionProposalIdempotencyKey } from "../../../src/storyIntelligence/agentRecognitionProposalRepository.ts";

const RECEIPT_VERSION = "tianyan-story-intake-batch-receipt/v1";
const PREVIEW_VERSION = "tianyan-story-intake-batch-preview/v1";
const ENTITY_TYPES = new Set(["character", "item", "location"]);

export function createStoryIntakeBatchPort({ rootPath, operations, relationOperations, tianyiAgentRuntime, tianyiCreativeEventPort, creationSourceSelectionPort }) {
  async function context(input) {
    const project = operations.listProjects().find((item) => item.id === input.projectId);
    if (!project) throw new Error("当前作品已不存在或未选择。");
    const run = await tianyiAgentRuntime.getRunProjection(input);
    if (!run?.storyIntakeEnvelope) throw new Error("Story Intake 候选包已丢失；请回到原对话重新整理。");
    const envelope = run.storyIntakeEnvelope;
    if (envelope.projectId !== input.projectId || envelope.sessionId !== input.sessionId || envelope.runId !== input.runId || run.workVersionId !== input.workVersionId) throw new Error("候选批次不属于当前作品或运行；已阻止跨项目写入。");
    const ids = Array.isArray(input.candidateIds) ? input.candidateIds.map(String) : [];
    if (!ids.length || ids.length > 24 || new Set(ids).size !== ids.length) throw new Error("请选择明确且不重复的候选范围。");
    const byId = new Map(envelope.candidates.map((candidate) => [candidate.candidateId, candidate]));
    const candidates = ids.map((id) => byId.get(id) || (() => { throw new Error(`候选 ${id} 已过期或丢失；请返回审阅刷新批次。`); })());
    const proposedRelations = relationLinks(candidates, envelope.candidates);
    const allowedRelationKeys = new Set(proposedRelations.map((item) => item.key));
    const excludedRelationKeys = Array.isArray(input.excludedRelationKeys) ? input.excludedRelationKeys.map(String) : [];
    if (new Set(excludedRelationKeys).size !== excludedRelationKeys.length || excludedRelationKeys.some((key) => !allowedRelationKeys.has(key))) throw new Error("排除关系范围已过期；请重新查看两端候选。");
    const relationBindings = normalizeRelationBindings(input.relationBindings, proposedRelations, input.projectId, operations);
    const entityBindings = normalizeEntityBindings(input.entityBindings, candidates, input.projectId, operations);
    const bindingsByRelationKey = new Map(relationBindings.map((binding) => [binding.relationKey, binding]));
    const activeRelations = proposedRelations
      .filter((item) => !excludedRelationKeys.includes(item.key))
      .map((item) => ({ ...item, binding: bindingsByRelationKey.get(item.key) ?? null }));
    const root = creationSourceSelectionPort.resolveRootWorkVersion(project.id);
    const currentBase = root ? { workVersionId: root.identity.workVersionId, revision: root.identity.currentRevision, manifestId: root.identity.headManifestId } : { workVersionId: "work-version.unversioned", revision: 0, manifestId: null };
    const position = input.position === "start" ? "start" : input.position === "end" ? "end" : (() => { throw new Error("请选择明确的叙事位置。"); })();
    return { project, run, envelope, candidates, currentBase, position, excludedRelationKeys, relationBindings, entityBindings, activeRelations };
  }

  async function preview(input) {
    const value = await context(input);
    const { envelope, candidates, currentBase, position, excludedRelationKeys, relationBindings, entityBindings, activeRelations } = value;
    const conflicts = [];
    if (!sameBaseVersion(envelope.baseVersion, currentBase)) conflicts.push("基础版本已变化；请重新整理后再确认。");
    const compensatedCandidateIds = new Set(findReceipts(input.projectId, (receipt) => receipt.status === "undone" && receipt.envelopeId === envelope.envelopeId).flatMap((receipt) => receipt.candidateIds));
    if (candidates.some((candidate) => candidate.lifecycleStatus === "rejected")) conflicts.push("选择范围包含已拒绝候选；请先恢复或移出范围。");
    if (candidates.some((candidate) => candidate.lifecycleStatus === "confirmed")) conflicts.push("选择范围包含已采纳候选；请移出范围以避免重复写入。");
    const currentEventTitles = new Set(operations.listWorldObjects({ projectId: input.projectId, type: "event" })
      .filter((event) => event.status !== "archived")
      .map((event) => event.title));
    for (const candidate of candidates.filter((item) => item.type === "event")) {
      if (candidate.proposedTitle && currentEventTitles.has(candidate.proposedTitle) && !compensatedCandidateIds.has(candidate.candidateId)) conflicts.push(`${candidate.proposedTitle}：已有同名事件；请移出本次范围，或回到审阅核对是否为同一事件。`);
    }
    const currentEntityTitles = new Map([...ENTITY_TYPES].map((type) => [
      type,
      new Set(operations.listWorldObjects({ projectId: input.projectId, type })
        .filter((object) => object.status !== "archived")
        .map((object) => object.title))
    ]));
    const entityLabels = { character: "角色", item: "物品", location: "地点" };
    const entityBindingsByCandidateId = new Map(entityBindings.map((binding) => [binding.candidateId, binding]));
    for (const candidate of candidates.filter((item) => ENTITY_TYPES.has(item.type))) {
      if (candidate.proposedName && currentEntityTitles.get(candidate.type)?.has(candidate.proposedName) && !entityBindingsByCandidateId.has(candidate.candidateId)) {
        conflicts.push(`${candidate.proposedName}：当前作品已有同名${entityLabels[candidate.type]}；请回到审阅完成身份合并，或移出本次范围。`);
      }
    }
    const chosenUnit = candidates.find((candidate) => candidate.type === "story_unit") || null;
    const existingUnit = selectTargetStoryUnit(operations.listStoryUnits({ projectId: input.projectId }));
    const hasPlacement = candidates.some((candidate) => candidate.type === "narrative_path_membership");
    if (hasPlacement && !candidates.some((candidate) => candidate.type === "event")) conflicts.push("叙事路径候选需要在同一明确范围内包含 Event。");
    if (hasPlacement && !chosenUnit && !existingUnit) conflicts.push("叙事路径候选需要一个已选或现有 Story Unit。");
    for (const relation of activeRelations) {
      if (!relation.target && !relation.binding) conflicts.push(`${relation.title}：关系端点已丢失，请绑定已有对象、排除或回到审阅恢复。`);
      else if (!relation.targetSelected && !relation.binding) conflicts.push(`${relation.title}：请纳入所需候选、绑定已有对象，或明确排除这项关系。`);
      else if (!ENTITY_TYPES.has(relation.source.type) && relation.source.type !== "event") conflicts.push(`${relation.title}：起点不是可绑定的故事对象或事件。`);
      else if (relation.target && !relation.binding && !ENTITY_TYPES.has(relation.target.type) && relation.target.type !== "event") conflicts.push(`${relation.title}：终点不是可绑定的故事对象或事件。`);
    }
    const items = candidates.map((candidate) => itemPreview(candidate, entityBindingsByCandidateId.get(candidate.candidateId) ?? null));
    for (const item of items) if (!item.supported && item.reason) conflicts.push(`${item.title}：${item.reason}`);
    const previewId = `story-intake-preview.${digest({
      envelopeId: envelope.envelopeId,
      baseVersion: canonicalBaseVersion(envelope.baseVersion),
      candidateIds: candidates.map((candidate) => candidate.candidateId),
      excludedRelationKeys,
      relationBindings,
      entityBindings,
      position,
      targetStoryUnitId: existingUnit?.id ?? null,
      targetStoryUnitVersion: existingUnit?.version ?? null
    })}`;
    return {
      version: PREVIEW_VERSION,
      previewId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      runId: input.runId,
      envelopeId: envelope.envelopeId,
      baseVersion: envelope.baseVersion,
      candidateIds: candidates.map((candidate) => candidate.candidateId),
      excludedRelationKeys,
      relationBindings,
      entityBindings,
      items,
      storyUnit: {
        candidateId: chosenUnit?.candidateId ?? null,
        title: existingUnit?.title ?? chosenUnit?.proposedTitle ?? "尚未选择故事单元",
        summary: existingUnit?.summary ?? chosenUnit?.summary ?? "当前选择范围尚未连接到故事单元。",
        targetId: existingUnit?.id ?? null,
        targetVersion: existingUnit?.version ?? null,
        position
      },
      impact: {
        events: candidates.filter((candidate) => candidate.type === "event").length,
        storyUnits: chosenUnit ? 1 : 0,
        narrativePlacements: candidates.filter((candidate) => candidate.type === "narrative_path_membership").length,
        worldObjects: candidates.filter((candidate) => ENTITY_TYPES.has(candidate.type)).length,
        relations: activeRelations.length,
        unresolved: candidates.filter((candidate) => candidate.type === "unresolved").length
      },
      conflicts: [...new Set(conflicts)],
      canConfirm: conflicts.length === 0,
      activeReceipt: publicReceipt(
        findActiveReceipt(input.projectId, envelope.envelopeId, candidates.map((candidate) => candidate.candidateId), excludedRelationKeys, relationBindings, entityBindings)
        || findActiveReceiptForCandidateScope(input.projectId, envelope.envelopeId, candidates.map((candidate) => candidate.candidateId))
        || findRecoveryReceiptForCandidateScope(input.projectId, envelope.envelopeId, candidates.map((candidate) => candidate.candidateId))
      )
    };
  }

  async function confirm(input) {
    const existing = readReceipt(input.projectId, receiptIdFor(input.operationId));
    if (existing?.status === "active" || existing?.status === "undone") return { run: await tianyiAgentRuntime.getRunProjection(input), receipt: publicReceipt(existing) };
    if (existing?.status === "failed-compensated") throw conflictError("上次相同操作失败但已完整补偿；请重新查看影响后使用新的确认操作。");
    if (existing) {
      await compensateReceiptAndRebase(existing, input, "interrupted");
      writeReceipt({ ...existing, status: "failed-compensated", failure: existing.failure ?? "进程在批次完成前中断", compensatedAt: new Date().toISOString() });
      throw conflictError("上次相同操作未完成，已按持久化日志补偿；请重新查看影响后再确认。");
    }
    const before = await context(input);
    const planned = await preview(input);
    if (!planned.canConfirm) throw new Error(planned.conflicts.join("；"));
    if (planned.previewId !== input.previewId || planned.baseVersion.revision !== input.expectedBaseRevision) throw conflictError("影响预览已过期；没有执行任何写入，请重新查看影响。");

    const now = new Date().toISOString();
    let receipt = {
      version: RECEIPT_VERSION,
      receiptId: receiptIdFor(input.operationId),
      previewId: planned.previewId,
      projectId: input.projectId,
      workVersionId: input.workVersionId,
      sessionId: input.sessionId,
      runId: input.runId,
      envelopeId: before.envelope.envelopeId,
      candidateIds: planned.candidateIds,
      excludedRelationKeys: before.excludedRelationKeys,
      relationBindings: before.relationBindings,
      entityBindings: before.entityBindings,
      omittedCandidateIds: before.envelope.candidates.map((candidate) => candidate.candidateId).filter((id) => !planned.candidateIds.includes(id)),
      position: before.position,
      storyUnit: planned.storyUnit,
      status: "applying",
      items: [],
      intents: [],
      undo: { arrangement: null, storyUnit: null, eventCandidateIds: [], relations: [] },
      recordedAt: now,
      undoneAt: null
    };
    writeReceipt(receipt);
    let run = before.run;
    let storyUnit = null;
    const eventApplications = new Map();
    const endpointApplications = new Map();
    const entityBindingsByCandidateId = new Map(before.entityBindings.map((binding) => [binding.candidateId, binding]));
    const eventCandidates = before.candidates.filter((candidate) => candidate.type === "event");
    const compensatedCandidateIds = new Set(findReceipts(input.projectId, (candidateReceipt) => candidateReceipt.status === "undone" && candidateReceipt.envelopeId === before.envelope.envelopeId).flatMap((candidateReceipt) => candidateReceipt.candidateIds));
    try {
      for (const candidate of before.candidates.filter((item) => ENTITY_TYPES.has(item.type))) {
        const entityOperationId = childOperation(input.operationId, "entity", candidate.candidateId);
        const entityBinding = entityBindingsByCandidateId.get(candidate.candidateId);
        if (entityBinding) {
          const intent = { owner: "story-workspace-object", mode: "link-existing", candidateId: candidate.candidateId, objectType: candidate.type, title: candidate.proposedName, operationId: entityOperationId, proposalId: null, targetId: entityBinding.targetObjectId, expectedRevision: entityBinding.targetObjectRevision, completed: false };
          receipt.intents.push(intent);
          writeReceipt(receipt);
          const application = { owner: "story-workspace-object", objectId: entityBinding.targetObjectId, proposalId: null, receiptId: `story-intake-entity-link.${digest({ operationId: input.operationId, candidateId: candidate.candidateId, targetObjectId: entityBinding.targetObjectId, targetObjectRevision: entityBinding.targetObjectRevision })}`, appliedAt: now };
          run = await tianyiAgentRuntime.recordStoryIntakeApplication({ ...input, candidateId: candidate.candidateId, application, operationId: entityOperationId });
          receipt.items.push(receiptItem(candidate, application.owner, application.objectId, application.receiptId));
          endpointApplications.set(candidate.candidateId, application.objectId);
          intent.completed = true;
          writeReceipt(receipt);
          continue;
        }
        const entityPlan = storyIntakeEntityPlan(input.projectId, before.envelope, candidate);
        const intent = {
          owner: "story-workspace-object",
          candidateId: candidate.candidateId,
          objectType: candidate.type,
          title: candidate.proposedName,
          operationId: entityOperationId,
          proposalId: entityPlan.proposalId,
          targetId: entityPlan.targetId,
          expectedObject: entityPlan.expectedObject,
          completed: false
        };
        receipt.intents.push(intent);
        writeReceipt(receipt);
        run = await tianyiAgentRuntime.decideStoryIntakeCandidate({ ...input, candidateId: candidate.candidateId, lifecycleStatus: "confirmed", operationId: entityOperationId, expectedTargetObjectId: entityPlan.targetId });
        const applied = run.storyIntakeEnvelope.candidates.find((item) => item.candidateId === candidate.candidateId).formalApplication;
        receipt.items.push(receiptItem(candidate, applied.owner, applied.objectId, applied.receiptId));
        endpointApplications.set(candidate.candidateId, applied.objectId);
        intent.completed = true;
        writeReceipt(receipt);
      }

      for (const eventCandidate of eventCandidates) {
        const projection = legacyProjection(before.envelope, eventCandidate);
        const eventInput = { sessionId: input.sessionId, candidateId: eventCandidate.candidateId, operationId: childOperation(input.operationId, "event-readopt", eventCandidate.candidateId) };
        receipt.undo.eventCandidateIds.push(eventCandidate.candidateId);
        writeReceipt(receipt);
        let state;
        if (compensatedCandidateIds.has(eventCandidate.candidateId)) state = tianyiCreativeEventPort.reconfirm(input.projectId, eventInput, projection);
        else {
          const impact = tianyiCreativeEventPort.beginImpact(input.projectId, eventInput, projection);
          const option = impact.options?.[0];
          if (!option) throw new Error("Event 影响预览没有可采纳路线；没有继续写入其他结构。");
          state = tianyiCreativeEventPort.confirm(input.projectId, eventInput, projection, option.id);
        }
        const applied = state.adoptionReceipt;
        const eventApplication = { owner: "story-studio-event-owner", objectId: applied.appliedEventId, proposalId: state.planning?.id ?? null, receiptId: applied.receiptId, appliedAt: applied.recordedAt };
        eventApplications.set(eventCandidate.candidateId, eventApplication);
        endpointApplications.set(eventCandidate.candidateId, eventApplication.objectId);
        run = await tianyiAgentRuntime.recordStoryIntakeApplication({ ...input, candidateId: eventCandidate.candidateId, application: eventApplication, operationId: childOperation(input.operationId, "event", eventCandidate.candidateId) });
        receipt.items.push(receiptItem(eventCandidate, eventApplication.owner, eventApplication.objectId, eventApplication.receiptId));
        writeReceipt(receipt);
      }

      const unitCandidate = before.candidates.find((candidate) => candidate.type === "story_unit") || null;
      if (unitCandidate) {
      const sourceRef = { sourceKind: "tianyi-intent", ownerId: "tianyi.agent-runtime", entityId: before.envelope.envelopeId, entityVersion: before.envelope.sourceRef.contentHash, capturedAt: now };
      const existingRootUnit = planned.storyUnit.targetId ? operations.readStoryUnit({ projectId: input.projectId, unitId: planned.storyUnit.targetId }) : null;
      if (existingRootUnit && existingRootUnit.version !== planned.storyUnit.targetVersion) throw conflictError("目标 Story Unit 在预览后已变化；没有继续写入，请重新查看影响。");
      if (existingRootUnit) {
        receipt.undo.storyUnit = { id: existingRootUnit.id, mode: "restore", summary: existingRootUnit.summary, sourceRefs: existingRootUnit.sourceRefs, sourceVersionRef: existingRootUnit.sourceVersionRef };
        writeReceipt(receipt);
        const updated = operations.updateStoryUnit({ projectId: input.projectId, unitId: existingRootUnit.id, expectedVersion: existingRootUnit.version, summary: [existingRootUnit.summary, unitCandidate.summary].filter(Boolean).join("\n\n"), sourceVersionRef: `${before.envelope.baseVersion.workVersionId}@r${before.envelope.baseVersion.revision}`, sourceRefs: [...existingRootUnit.sourceRefs, sourceRef] });
        if (updated.conflict) throw new Error("Story Unit 在确认前已变化；已停止后续结构写入。");
        storyUnit = updated.unit;
      } else {
        const unitIntent = { owner: "story-unit-owner", candidateId: unitCandidate.candidateId, title: unitCandidate.proposedTitle, beforeTargetIds: operations.listStoryUnits({ projectId: input.projectId }).map((unit) => unit.id), completed: false };
        receipt.intents.push(unitIntent);
        writeReceipt(receipt);
        storyUnit = operations.createStoryUnit({ projectId: input.projectId, title: unitCandidate.proposedTitle, summary: unitCandidate.summary, lifecycle: "active", sourceVersionRef: `${before.envelope.baseVersion.workVersionId}@r${before.envelope.baseVersion.revision}`, sourceRefs: [sourceRef] });
        receipt.undo.storyUnit = { id: storyUnit.id, mode: "archive" };
        unitIntent.completed = true;
      }
      writeReceipt(receipt);
      const application = { owner: "story-unit-owner", objectId: storyUnit.id, proposalId: null, receiptId: `story-unit-receipt.${digest({ operationId: input.operationId, candidateId: unitCandidate.candidateId, version: storyUnit.version })}`, appliedAt: now };
      run = await tianyiAgentRuntime.recordStoryIntakeApplication({ ...input, candidateId: unitCandidate.candidateId, application, operationId: childOperation(input.operationId, "unit", unitCandidate.candidateId) });
      receipt.items.push(receiptItem(unitCandidate, application.owner, application.objectId, application.receiptId));
      writeReceipt(receipt);
      }

      const membership = before.candidates.find((candidate) => candidate.type === "narrative_path_membership") || null;
      if (membership) {
      storyUnit = storyUnit || (planned.storyUnit.targetId ? operations.readStoryUnit({ projectId: input.projectId, unitId: planned.storyUnit.targetId }) : null);
      if (!storyUnit || eventApplications.size === 0) throw new Error("叙事编排缺少已验证的 Event 或 Story Unit；未创建路径位置。");
      let read = operations.readNarrativeArrangement({ projectId: input.projectId, workVersionId: input.workVersionId, narrativePathId: storyUnit.id });
      const createOperationId = childOperation(input.operationId, "arrangement-create", storyUnit.id);
      const insertOperationIds = eventCandidates.map((candidate) => childOperation(input.operationId, "arrangement-insert", `${membership.candidateId}:${candidate.candidateId}`));
      if (!read.arrangement) {
        receipt.undo.arrangement = { storyUnitId: storyUnit.id, beforeRevision: 0, receiptIds: [], createdByBatch: true, createOperationId, insertOperationIds };
        writeReceipt(receipt);
        const created = operations.createNarrativeArrangement({ projectId: input.projectId, workVersionId: input.workVersionId, narrativePathId: storyUnit.id, ownerStoryUnitId: storyUnit.id, expectedOwnerVersion: storyUnit.version, expectedRevision: 0, operationId: createOperationId, authorActionId: childOperation(input.operationId, "author", "arrangement-create"), createdAt: now });
        if (created.conflict) throw new Error(`NarrativeArrangement 创建冲突：${created.code}`);
        read = operations.readNarrativeArrangement({ projectId: input.projectId, workVersionId: input.workVersionId, narrativePathId: storyUnit.id });
      } else {
        receipt.undo.arrangement = { storyUnitId: storyUnit.id, beforeRevision: read.arrangement.currentRevision, receiptIds: [], createdByBatch: false, createOperationId: null, insertOperationIds };
        writeReceipt(receipt);
      }
      const placementCandidates = before.position === "start" ? [...eventCandidates].reverse() : eventCandidates;
      for (const eventCandidate of placementCandidates) {
        const eventApplication = eventApplications.get(eventCandidate.candidateId);
        const insertOperationId = childOperation(input.operationId, "arrangement-insert", `${membership.candidateId}:${eventCandidate.candidateId}`);
        const beforeRevision = read.arrangement.currentRevision;
        const inserted = operations.insertNarrativePlacement({ projectId: input.projectId, workVersionId: input.workVersionId, narrativePathId: storyUnit.id, expectedOwnerVersion: read.ownerVersion, expectedRevision: beforeRevision, operationId: insertOperationId, authorActionId: childOperation(input.operationId, "author", `arrangement-insert:${eventCandidate.candidateId}`), sourceKind: "author-action", sourceRef: `story-intake:${before.envelope.envelopeId}`, createdAt: now, eventId: eventApplication.objectId, storyUnitId: storyUnit.id, role: "primary", position: { kind: before.position } });
        if (inserted.conflict || !inserted.receipt) throw new Error(`NarrativeArrangement 写入冲突：${inserted.code}`);
        receipt.undo.arrangement.receiptIds.push(inserted.receipt.receiptId);
        writeReceipt(receipt);
        read = operations.readNarrativeArrangement({ projectId: input.projectId, workVersionId: input.workVersionId, narrativePathId: storyUnit.id });
      }
      const application = { owner: "narrative-arrangement-owner", objectId: storyUnit.id, proposalId: null, receiptId: receipt.undo.arrangement.receiptIds[0], appliedAt: now };
      run = await tianyiAgentRuntime.recordStoryIntakeApplication({ ...input, candidateId: membership.candidateId, application, operationId: childOperation(input.operationId, "arrangement", membership.candidateId) });
      receipt.items.push(receiptItem(membership, application.owner, application.objectId, application.receiptId));
      writeReceipt(receipt);
      }

      for (const relation of before.activeRelations) {
        const sourceObjectId = endpointApplications.get(relation.source.candidateId);
        const targetObjectId = relation.binding?.targetObjectId ?? (relation.target ? endpointApplications.get(relation.target.candidateId) : null);
        if (!sourceObjectId || !targetObjectId) throw new Error(`关系 ${relation.title} 的端点未经 Owner 完成映射。`);
        const relationOperationId = childOperation(input.operationId, "relation", relation.key);
        const created = relationOperations.createUnresolvedRelationCandidate({
          projectId: input.projectId,
          operationId: relationOperationId,
          sourceObjectId,
          targetObjectId,
          direction: relation.relation === "precedes" ? "forward" : "none",
          sourceRevision: `${before.envelope.baseVersion.workVersionId}@r${before.envelope.baseVersion.revision}`,
          sourceRef: `story-intake:${before.envelope.envelopeId}:${relation.key}`,
          actor: "story-intake-batch",
          now
        });
        receipt.undo.relations.push({ relationId: created.relation.relationId, expectedRevision: created.relation.revision, operationId: relationOperationId });
        receipt.items.push({ candidateId: `relation-link.${digest(relation.key)}`, type: "relation", title: relation.title, owner: "relation-owner", targetId: created.relation.relationId, receiptId: created.receipt.receiptId, undoState: "available" });
        writeReceipt(receipt);
      }

      for (const candidate of before.candidates.filter((item) => item.type === "unresolved")) receipt.items.push({ ...receiptItem(candidate, "candidate-only", null, `candidate-only.${digest(candidate.candidateId)}`), undoState: "not-required" });
      const resultBase = creationSourceSelectionPort.resolveRootWorkVersion(input.projectId);
      receipt = { ...receipt, status: "active", resultBaseRevision: resultBase?.identity.currentRevision ?? null };
      writeReceipt(receipt);
      return { run, receipt: publicReceipt(receipt) };
    } catch (cause) {
      try {
        receipt = { ...receipt, status: "compensating" };
        writeReceipt(receipt);
        await compensateReceiptAndRebase(receipt, input, "failed");
      } catch (compensationCause) {
        receipt = { ...receipt, status: "recovery-required", failure: safeMessage(cause), compensationFailure: safeMessage(compensationCause) };
        writeReceipt(receipt);
        throw conflictError(`批次写入失败，自动补偿也未完成；已保留恢复日志并阻止继续确认。原始错误：${safeMessage(cause)}；补偿错误：${safeMessage(compensationCause)}`);
      }
      receipt = { ...receipt, status: "failed-compensated", failure: safeMessage(cause), compensatedAt: new Date().toISOString() };
      writeReceipt(receipt);
      throw conflictError(`批次写入失败，已撤销本次已完成的步骤：${safeMessage(cause)}`);
    }
  }

  async function undo(input) {
    const receipt = readReceipt(input.projectId, input.receiptId);
    if (!receipt || receipt.projectId !== input.projectId || receipt.sessionId !== input.sessionId || receipt.runId !== input.runId) throw new Error("批次回执不存在或不属于当前运行。");
    if (receipt.status === "undone") return { run: await tianyiAgentRuntime.getRunProjection(input), receipt: publicReceipt(receipt) };
    if (receipt.status !== "active" && receipt.status !== "undoing" && receipt.status !== "recovery-required") throw new Error("该批次没有可撤销的有效采纳回执。");
    if (receipt.status === "active" && receipt.resultBaseRevision !== null && receipt.resultBaseRevision !== undefined) {
      const currentRoot = creationSourceSelectionPort.resolveRootWorkVersion(input.projectId);
      if (!currentRoot || currentRoot.identity.currentRevision !== receipt.resultBaseRevision) {
        throw conflictError("当前故事已在这次采纳后继续变化；为避免撤销夹带后续内容，已停止撤销。");
      }
    }
    writeReceipt({ ...receipt, status: "undoing" });
    let run = await compensateReceipt(receipt, input);
    const currentRoot = creationSourceSelectionPort.resolveRootWorkVersion(input.projectId);
    if (!currentRoot) throw new Error("撤销已完成，但当前主版本不可读；已停止候选重验证。");
    const rebasedVersion = { workVersionId: currentRoot.identity.workVersionId, revision: currentRoot.identity.currentRevision, manifestId: currentRoot.identity.headManifestId };
    run = await tianyiAgentRuntime.rebaseStoryIntakeAfterUndo({ ...input, baseVersion: rebasedVersion, operationId: childOperation(input.operationId, "rebase", receipt.envelopeId) });
    const now = new Date().toISOString();
    const undone = { ...receipt, status: "undone", undoResultBaseRevision: rebasedVersion.revision, items: receipt.items.map((item) => ({ ...item, undoState: item.undoState === "not-required" ? "not-required" : "undone" })), undoneAt: now };
    writeReceipt(undone);
    return { run, receipt: publicReceipt(undone) };
  }

  async function compensateReceipt(receipt, input) {
    let run = await tianyiAgentRuntime.getRunProjection(input);
    if (!run?.storyIntakeEnvelope || run.storyIntakeEnvelope.envelopeId !== receipt.envelopeId) throw new Error("原候选批次已丢失；已停止补偿，未猜测写入目标。");
    const now = new Date().toISOString();
    if (receipt.undo.arrangement) {
      const target = receipt.undo.arrangement;
      let read = operations.readNarrativeArrangement({ projectId: input.projectId, workVersionId: receipt.workVersionId, narrativePathId: target.storyUnitId });
      const baselineRevision = target.createdByBatch ? 1 : target.beforeRevision;
      const rollbackOperationId = childOperation(input.operationId, "arrangement-rollback", target.storyUnitId);
      if (read.arrangement && read.arrangement.currentRevision !== baselineRevision) {
        const rolled = operations.rollbackNarrativeArrangement({ projectId: input.projectId, workVersionId: receipt.workVersionId, narrativePathId: target.storyUnitId, expectedOwnerVersion: read.ownerVersion, expectedRevision: read.arrangement.currentRevision, operationId: rollbackOperationId, authorActionId: childOperation(input.operationId, "author", "arrangement-rollback"), sourceKind: "author-action", sourceRef: `batch-receipt:${receipt.receiptId}`, createdAt: now, targetRevision: baselineRevision });
        if (rolled.conflict) throw new Error(`NarrativeArrangement 撤销冲突：${rolled.code}`);
      }
      if (target.createdByBatch && target.createOperationId) {
        read = operations.readNarrativeArrangement({ projectId: input.projectId, workVersionId: receipt.workVersionId, narrativePathId: target.storyUnitId });
        if (read.arrangement) {
          const insertOperationIds = target.insertOperationIds ?? [target.insertOperationId].filter(Boolean);
          const discarded = operations.discardNarrativeArrangement({ projectId: input.projectId, workVersionId: receipt.workVersionId, narrativePathId: target.storyUnitId, expectedOwnerVersion: read.ownerVersion, expectedRevision: read.arrangement.currentRevision, expectedCreateOperationId: target.createOperationId, allowedOperationIds: [target.createOperationId, ...insertOperationIds, rollbackOperationId].filter(Boolean) });
          if (discarded.conflict) throw new Error(`NarrativeArrangement 新建补偿冲突：${discarded.code}`);
        }
      }
    }
    for (const target of [...(receipt.undo.relations ?? [])].reverse()) {
      relationOperations.rejectRelationCandidate({
        projectId: input.projectId,
        relationId: target.relationId,
        expectedRelationRevision: target.expectedRevision,
        operationId: childOperation(input.operationId, "relation-reject", target.relationId),
        actor: "story-intake-batch.undo",
        now
      });
    }
    const eventCandidateIds = receipt.undo.eventCandidateIds ?? [receipt.undo.eventCandidateId].filter(Boolean);
    for (const candidateId of [...eventCandidateIds].reverse()) {
      const candidate = run.storyIntakeEnvelope.candidates.find((item) => item.candidateId === candidateId);
      if (!candidate) continue;
      const currentBase = creationSourceSelectionPort.resolveRootWorkVersion(input.projectId);
      tianyiCreativeEventPort.undo(input.projectId, { sessionId: receipt.sessionId, candidateId: candidate.candidateId, expectedCurrentRevision: currentBase?.identity.currentRevision }, legacyProjection(run.storyIntakeEnvelope, candidate));
    }
    if (receipt.undo.storyUnit) {
      const target = receipt.undo.storyUnit;
      const current = operations.readStoryUnit({ projectId: input.projectId, unitId: target.id });
      if (current && !(target.mode === "archive" && current.lifecycle === "archived")) {
        const reverted = target.mode === "archive"
          ? operations.archiveStoryUnit({ projectId: input.projectId, unitId: current.id, expectedVersion: current.version })
          : operations.updateStoryUnit({ projectId: input.projectId, unitId: current.id, expectedVersion: current.version, summary: target.summary, sourceRefs: target.sourceRefs, sourceVersionRef: target.sourceVersionRef });
        if (reverted.conflict) throw new Error("Story Unit 撤销时版本已变化；已停止后续撤销。");
      }
    }
    if (!receipt.undo.storyUnit) {
      for (const intent of receipt.intents?.filter((item) => item.owner === "story-unit-owner") ?? []) {
        const created = operations.listStoryUnits({ projectId: input.projectId }).find((unit) => !intent.beforeTargetIds.includes(unit.id) && unit.title === intent.title && unit.lifecycle !== "archived");
        if (created) {
          const archived = operations.archiveStoryUnit({ projectId: input.projectId, unitId: created.id, expectedVersion: created.version });
          if (archived.conflict) throw new Error("新建 Story Unit 补偿时版本已变化；已停止后续补偿。");
        }
      }
    }
    for (const intent of receipt.intents?.filter((item) => item.owner === "story-workspace-object") ?? []) {
      const currentCandidate = run.storyIntakeEnvelope.candidates.find((candidate) => candidate.candidateId === intent.candidateId);
      if (intent.mode === "link-existing") {
        if (currentCandidate?.formalApplication?.owner === "story-workspace-object" && currentCandidate.formalApplication.objectId === intent.targetId && currentCandidate.formalApplication.receiptId) {
          run = await tianyiAgentRuntime.undoStoryIntakeApplication({ ...input, workVersionId: receipt.workVersionId, sessionId: receipt.sessionId, runId: receipt.runId, candidateId: intent.candidateId, receiptId: currentCandidate.formalApplication.receiptId, operationId: childOperation(input.operationId, "restore-link", intent.candidateId) });
        }
        continue;
      }
      if (!intent.targetId || !intent.proposalId || !intent.operationId || !intent.expectedObject) throw new Error(`对象 ${intent.title} 缺少可验证的预写 intent；已停止补偿。`);
      const exactApplicationWasRecorded = currentCandidate?.formalApplication?.owner === "story-workspace-object"
        && currentCandidate.formalApplication.objectId === intent.targetId
        && currentCandidate.formalApplication.proposalId === intent.proposalId;
      if (!intent.completed && !exactApplicationWasRecorded) continue;
      const archived = operations.archiveAgentProposalObjectOnce({ projectId: input.projectId, targetObjectId: intent.targetId, objectType: intent.objectType, proposalId: intent.proposalId, proposalRevision: 1, operationId: intent.operationId, title: intent.title, ...intent.expectedObject });
      if (archived.conflict) throw new Error(`对象 ${intent.title} 的精确路径、版本或提案来源已变化；已停止补偿。`);
      if (currentCandidate?.formalApplication?.owner === "story-workspace-object" && currentCandidate.formalApplication.objectId === intent.targetId) {
        run = await tianyiAgentRuntime.undoStoryIntakeApplication({ ...input, workVersionId: receipt.workVersionId, sessionId: receipt.sessionId, runId: receipt.runId, candidateId: intent.candidateId, receiptId: currentCandidate.formalApplication.receiptId, operationId: childOperation(input.operationId, "restore-intent", intent.candidateId) });
      }
      if (archived.found) await compensateAgentRecognitionApplication({ workspacePath: path.join(rootPath, input.projectId), projectId: input.projectId, proposalId: intent.proposalId, operationId: intent.operationId, targetObjectId: intent.targetId, now });
    }
    for (const item of [...receipt.items].reverse()) {
      if (item.owner === "story-workspace-object" && item.targetId) {
        const matchingIntent = receipt.intents?.find((intent) => intent.owner === "story-workspace-object" && intent.candidateId === item.candidateId && intent.targetId === item.targetId);
        if (!matchingIntent) throw new Error(`对象 ${item.title} 的撤销缺少精确预写 intent；已停止撤销。`);
      }
      const currentCandidate = run.storyIntakeEnvelope.candidates.find((candidate) => candidate.candidateId === item.candidateId);
      if (item.owner !== "candidate-only" && currentCandidate?.formalApplication?.receiptId === item.receiptId) run = await tianyiAgentRuntime.undoStoryIntakeApplication({ ...input, workVersionId: receipt.workVersionId, sessionId: receipt.sessionId, runId: receipt.runId, candidateId: item.candidateId, receiptId: item.receiptId, operationId: childOperation(input.operationId, "restore", item.candidateId) });
    }
    return run;
  }

  async function compensateReceiptAndRebase(receipt, input, reason) {
    let run = await compensateReceipt(receipt, input);
    const currentRoot = creationSourceSelectionPort.resolveRootWorkVersion(input.projectId);
    if (!currentRoot) throw new Error("批次已补偿，但当前主版本不可读；已停止候选重验证。");
    const rebasedVersion = { workVersionId: currentRoot.identity.workVersionId, revision: currentRoot.identity.currentRevision, manifestId: currentRoot.identity.headManifestId };
    run = await tianyiAgentRuntime.rebaseStoryIntakeAfterUndo({ ...input, workVersionId: receipt.workVersionId, sessionId: receipt.sessionId, runId: receipt.runId, baseVersion: rebasedVersion, operationId: childOperation(input.operationId, "rebase", `${reason}-${receipt.envelopeId}`) });
    return run;
  }

  function receiptPath(projectId, receiptId) { return path.join(rootPath, projectId, ".world-os", "workspace", "story-intake-batch-receipts", `${receiptId}.json`); }
  function findActiveReceipt(projectId, envelopeId, candidateIds, excludedRelationKeys = [], relationBindings = [], entityBindings = []) {
    return findReceipts(projectId, (receipt) => receipt.status === "active" && receipt.envelopeId === envelopeId && JSON.stringify(receipt.candidateIds) === JSON.stringify(candidateIds) && JSON.stringify(receipt.excludedRelationKeys ?? []) === JSON.stringify(excludedRelationKeys) && JSON.stringify(receipt.relationBindings ?? []) === JSON.stringify(relationBindings) && JSON.stringify(receipt.entityBindings ?? []) === JSON.stringify(entityBindings))[0] || null;
  }
  function findActiveReceiptForCandidateScope(projectId, envelopeId, candidateIds) {
    return findReceipts(projectId, (receipt) => receipt.status === "active" && receipt.envelopeId === envelopeId && JSON.stringify(receipt.candidateIds) === JSON.stringify(candidateIds))[0] || null;
  }
  function findRecoveryReceiptForCandidateScope(projectId, envelopeId, candidateIds) {
    return findReceipts(projectId, (receipt) => receipt.status === "recovery-required" && receipt.envelopeId === envelopeId && JSON.stringify(receipt.candidateIds) === JSON.stringify(candidateIds))
      .sort((left, right) => String(right.recordedAt).localeCompare(String(left.recordedAt)))[0] || null;
  }
  function findReceipts(projectId, predicate) {
    const directory = path.dirname(receiptPath(projectId, "placeholder"));
    if (!existsSync(directory)) return [];
    return readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => {
      try { return JSON.parse(readFileSync(path.join(directory, name), "utf8")); } catch { return null; }
    }).filter((receipt) => receipt && predicate(receipt));
  }
  function readReceipt(projectId, receiptId) { const file = receiptPath(projectId, receiptId); return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null; }
  function writeReceipt(receipt) { const file = receiptPath(receipt.projectId, receipt.receiptId); mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.tmp`; writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); renameSync(temporary, file); }
  return Object.freeze({ preview, confirm, undo });
}

function itemPreview(candidate, entityBinding = null) {
  const title = candidate.proposedName || candidate.proposedTitle || "未命名候选";
  if (ENTITY_TYPES.has(candidate.type)) return { candidateId: candidate.candidateId, type: candidate.type, title, owner: "story-workspace-object", action: entityBinding ? `关联已有对象「${entityBinding.targetObjectTitle}」` : "经资料对象 Owner 建立对象", supported: Boolean(entityBinding) || candidate.identityDecision === "propose_new", reason: entityBinding || candidate.identityDecision === "propose_new" ? null : "需要先完成身份合并决定" };
  if (candidate.type === "event") return { candidateId: candidate.candidateId, type: candidate.type, title, owner: "story-studio-event-owner", action: "经 Event 影响审查与 AuthorControl 采纳", supported: true, reason: null };
  if (candidate.type === "story_unit") return { candidateId: candidate.candidateId, type: candidate.type, title, owner: "story-unit-owner", action: "建立 Story Unit", supported: true, reason: null };
  if (candidate.type === "narrative_path_membership") return { candidateId: candidate.candidateId, type: candidate.type, title, owner: "narrative-arrangement-owner", action: "写入明确的叙事位置", supported: true, reason: null };
  if (candidate.type === "unresolved") return { candidateId: candidate.candidateId, type: candidate.type, title, owner: "candidate-only", action: "保留原文，不写事实", supported: true, reason: null };
  return { candidateId: candidate.candidateId, type: candidate.type, title, owner: "relation-owner", action: "进入关系审阅", supported: false, reason: "关系端点仍需作者完成身份绑定，本次保持候选" };
}

function legacyProjection(envelope, candidate) {
  const source = envelope.sourceRef;
  return { summaryState: "current", originals: [{ ...source, text: candidate.sourceEvidence.excerpt }], candidates: [{ candidateId: candidate.candidateId, kind: "event", title: candidate.proposedTitle, summary: candidate.summary, uncertainties: candidate.uncertainties, sourceExcerpt: candidate.sourceEvidence.excerpt, targetOwnerKind: "candidate-review", state: "pending", reviewStatus: "pending", sourceRefs: [source], duplicateHints: [], revision: 1, ownerReceipt: null }] };
}
function receiptItem(candidate, owner, targetId, receiptId) { return { candidateId: candidate.candidateId, type: candidate.type, title: candidate.proposedName || candidate.proposedTitle || "未命名候选", owner, targetId, receiptId, undoState: "available" }; }
function relationLinks(candidates, allCandidates) {
  const selected = new Set(candidates.map((candidate) => candidate.candidateId));
  const byId = new Map(allCandidates.map((candidate) => [candidate.candidateId, candidate]));
  return candidates.flatMap((source) => source.proposedRelations.map((link, index) => {
    const targetCandidateId = typeof link.targetCandidateId === "string" ? link.targetCandidateId : "missing";
    const target = byId.get(targetCandidateId) || null;
    const key = `${source.candidateId}:${link.relation}:${targetCandidateId}:${index}`;
    const sourceTitle = source.proposedName || source.proposedTitle || "未命名候选";
    const targetTitle = target?.proposedName || target?.proposedTitle || "丢失端点";
    return { key, source, target, targetCandidateId, targetSelected: selected.has(targetCandidateId), relation: link.relation, label: link.label, title: `${sourceTitle} → ${targetTitle}（${link.label || link.relation}）` };
  }));
}
function normalizeRelationBindings(value, proposedRelations, projectId, operations) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 24) throw new Error("关系绑定范围无效；请重新查看当前批次。");
  const byKey = new Map(proposedRelations.map((relation) => [relation.key, relation]));
  const seen = new Set();
  const bindings = value.map((binding) => {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new Error("关系绑定格式无效；请重新选择已有对象。");
    const keys = Object.keys(binding).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["relationKey", "targetObjectId"])) throw new Error("关系绑定包含不受支持的字段；请重新选择已有对象。");
    const relationKey = typeof binding.relationKey === "string" ? binding.relationKey : "";
    const targetObjectId = typeof binding.targetObjectId === "string" ? binding.targetObjectId : "";
    const relation = byKey.get(relationKey);
    if (!relation || !targetObjectId || seen.has(relationKey)) throw new Error("关系绑定范围已过期或重复；请重新查看当前批次。");
    if (relation.targetSelected) throw new Error(`${relation.title}：目标候选已在明确范围内，不能同时夹带既有对象绑定。`);
    let target;
    try { target = operations.readWorldObject({ projectId, objectId: targetObjectId }); } catch { throw new Error(`${relation.title}：所绑定的已有对象不存在或不属于当前作品。`); }
    if (!target || target.status === "archived") throw new Error(`${relation.title}：所绑定的已有对象已归档或不可用。`);
    if (!ENTITY_TYPES.has(target.type) && target.type !== "event") throw new Error(`${relation.title}：所绑定对象不是可用于关系端点的资料对象或事件。`);
    seen.add(relationKey);
    return { relationKey, targetObjectId: target.id, targetObjectTitle: target.title, targetObjectType: target.type, targetObjectRevision: target.revisionToken };
  });
  return bindings.sort((left, right) => left.relationKey.localeCompare(right.relationKey));
}
function normalizeEntityBindings(value, candidates, projectId, operations) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 24) throw new Error("对象身份绑定范围无效；请重新查看当前批次。");
  const byId = new Map(candidates.filter((candidate) => ENTITY_TYPES.has(candidate.type)).map((candidate) => [candidate.candidateId, candidate]));
  const seen = new Set();
  const bindings = value.map((binding) => {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new Error("对象身份绑定格式无效；请重新选择已有对象。");
    const keys = Object.keys(binding).sort();
    if (JSON.stringify(keys) !== JSON.stringify(["candidateId", "targetObjectId"])) throw new Error("对象身份绑定包含不受支持的字段；请重新选择已有对象。");
    const candidateId = typeof binding.candidateId === "string" ? binding.candidateId : "";
    const targetObjectId = typeof binding.targetObjectId === "string" ? binding.targetObjectId : "";
    const candidate = byId.get(candidateId);
    if (!candidate || !targetObjectId || seen.has(candidateId)) throw new Error("对象身份绑定范围已过期或重复；请重新查看当前批次。");
    let target;
    try { target = operations.readWorldObject({ projectId, objectId: targetObjectId }); } catch { throw new Error(`${candidate.proposedName}：所绑定的已有对象不存在或不属于当前作品。`); }
    if (!target || target.status === "archived") throw new Error(`${candidate.proposedName}：所绑定的已有对象已归档或不可用。`);
    if (target.type !== candidate.type) throw new Error(`${candidate.proposedName}：只能绑定同类型的已有对象。`);
    seen.add(candidateId);
    return { candidateId, targetObjectId: target.id, targetObjectTitle: target.title, targetObjectType: target.type, targetObjectRevision: target.revisionToken };
  });
  return bindings.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
}
function storyIntakeEntityPlan(projectId, envelope, candidate) {
  const key = createAgentRecognitionProposalIdempotencyKey({ projectId, storyId: `story.${projectId}`, tianyiSessionId: envelope.sessionId, sourceEventId: envelope.sourceRef.eventId, objectKind: candidate.type, suggestedName: candidate.proposedName, proposalRevision: 1 });
  const proposalId = agentRecognitionProposalIdForKey(key);
  return {
    proposalId,
    targetId: targetObjectIdForAgentProposal(candidate.type, proposalId),
    expectedObject: {
      status: "active",
      tags: ["天意 Story Intake"],
      aliases: [],
      body: `# ${candidate.proposedName}\n\n${candidate.summary}\n\n## 来源证据\n\n${candidate.sourceEvidence.excerpt}`
    }
  };
}
function selectTargetStoryUnit(units) { return units.filter((unit) => unit.lifecycle !== "archived").sort((left, right) => Number(left.kind !== "main") - Number(right.kind !== "main") || left.order - right.order || left.id.localeCompare(right.id))[0] || null; }
function canonicalBaseVersion(baseVersion) { return { workVersionId: baseVersion.workVersionId, revision: baseVersion.revision, manifestId: baseVersion.manifestId ?? null }; }
function conflictError(message) { const error = new Error(message); error.statusCode = 409; return error; }
function safeMessage(cause) { return cause instanceof Error ? cause.message : "未知错误"; }
function receiptIdFor(operationId) { return `story-intake-batch.${digest(operationId)}`; }
function childOperation(operationId, role, target) { return `story-intake-batch.${role}.${digest({ operationId, target })}`; }
function sameBaseVersion(left, right) { return left.workVersionId === right.workVersionId && left.revision === right.revision && left.manifestId === right.manifestId; }
function digest(value) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value), "utf8").digest("hex").slice(0, 32); }
function publicReceipt(receipt) { if (!receipt) return null; const { undo: _undo, intents: _intents, workVersionId: _workVersionId, failure: _failure, compensatedAt: _compensatedAt, compensationFailure: _compensationFailure, ...projection } = receipt; return receipt.status === "recovery-required" ? { ...projection, recoveryMessage: "上次确认未完整结束；请先按这张精确回执恢复并撤销，再重新查看影响。" } : projection; }
