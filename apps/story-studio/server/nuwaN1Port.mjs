import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  advanceNuwaN1Run,
  buildStorySnapshot,
  cancelNuwaN1Run,
  compileNuwaN1Context,
  createNuwaN1Run,
  createNuwaPlan,
  createNuwaRunPack,
  cueNuwaN1Run,
  pauseNuwaN1Run,
  prepareNuwaN1CandidateHandoff,
  recordNuwaN1ProviderDispatch,
  recordNuwaN1ProviderReservation,
  readLatestNuwaRun,
  readNuwaN1Run,
  resolveNuwaN1ProviderDispatch,
  resumeNuwaN1Run,
  startNuwaN1Run
} from "../../../src/storyIntelligence/index.ts";
import { buildEventStoryCrossingKnowledgeProjection } from "../../../src/storyContracts/eventStoryCrossingKnowledge.ts";

const VERSION = "tianyan-nuwa-n1-port/v1";
const FAKE_ADAPTER_ID = "local-n1-tool-roundtrip-fake/v1";
const AUTO_APPLICATION_RECEIPT_VERSION = "tianyan-nuwa-n1-auto-application/v1";

/**
 * Server-side bridge for the N1 author surface.  The RunPack and N1 runtime
 * remain the lifecycle owner; this module only resolves stable project refs,
 * supplies a replaceable execution adapter, and hands candidates to the
 * existing AuthorControl review owner.
 */
export function createNuwaN1Port({ operations, authorControl, actionPermissionBroker = null, relationOperations = null, creationSourceSelectionPort = null, autoApplicationFaultInjector = null, fakeProviderAllowed = false, fakeStepDelayMs = 0, piAdapterFactory = null, sourceIdentityForProject = () => null, now = () => new Date().toISOString() }) {
  /** Exactly one executable actor step may own a Run.  The entry owns its
   * cancellation handle and promise; duplicate delivery returns that promise
   * instead of replacing the handle. */
  const activePiExecutions = new Map();
  function availability() {
    return fakeProviderAllowed
      ? { kind: "local-fake", label: "本地工程演练 · 0 Provider", adapterId: FAKE_ADAPTER_ID, providerCalls: 0 }
      : piAdapterFactory?.availability?.() ?? { kind: "unavailable", label: "未配置可执行的女娲 Provider；本轮不会自动回退为假对话。", adapterId: null, providerCalls: 0 };
  }

  function workspacePath(projectId) {
    return operations.resolveProjectWorkspacePath({ projectId });
  }

  function requireProject(projectId) {
    const project = operations.listProjects().find((item) => item.id === projectId);
    if (!project) throw failure("找不到当前故事项目。", 404);
    return project;
  }

  function bootstrap(projectId) {
    requireProject(projectId);
    const latest = latestRun(projectId);
    return {
      version: VERSION,
      availability: availability(),
      participants: operations.listWorldObjects({ projectId, type: "character" })
        .filter((item) => item.status !== "archived")
        .map((item) => ({ id: item.id, title: item.title, revision: item.revisionToken })),
      storyUnits: operations.listStoryUnits({ projectId })
        .filter((item) => item.lifecycle !== "archived")
        .map((item) => ({ id: item.id, title: item.title, revision: item.version })),
      relationTypes: relationOperations?.listRelationTypes({ projectId }).types
        .filter((item) => item.lifecycle === "active")
        .map((item) => ({ id: item.relationTypeId, title: item.label, revision: item.typeRevision })) ?? [],
      latestRunId: latest?.run.runId ?? null
    };
  }

  function setup(input) {
    const project = requireProject(input.projectId);
    const scene = resolveScene(input.projectId, input.storyUnit);
    const actors = resolveActors(input.projectId, input.participants, scene);
    const goal = requiredText(input.goal, "局部目标", 1_000);
    return {
      version: VERSION,
      availability: availability(),
      setup: {
        projectId: project.id,
        participants: actors.map((actor) => ({ id: actor.character.id, title: actor.displayName, revision: actor.character.revision })),
        storyUnit: { id: scene.storyUnit.id, title: scene.label, revision: scene.storyUnit.revision },
        goal,
        contextPreview: actors.map((actor) => ({
          actorId: actor.character.id,
          evidenceRefs: [...actor.knownFacts.map((fact) => fact.sourceRef.id), ...actor.beliefs.map((belief) => belief.sourceRef.id)],
          knowledgeItems: actor.knownFacts.map((fact) => ({ id: fact.factId, summary: fact.summary, visibility: fact.visibility })),
          beliefItems: actor.beliefs.map((belief) => ({ id: belief.beliefId, summary: belief.summary, stance: belief.stance })),
          excludedCount: actor.unknownFactIds.length
        }))
      }
    };
  }

  function create(input) {
    requireExecutionAvailability();
    const prepared = setup(input);
    const relationType = resolveRelationType(input.projectId, input);
    const workspace = workspacePath(input.projectId);
    const snapshot = buildStorySnapshot({ workspacePath: workspace });
    const operationId = operation(input.operationId);
    const plan = createNuwaPlan({
      snapshot,
      authorGoal: prepared.setup.goal,
      allowedRoles: ["evidence-critic"],
      runner: "external",
      runKey: `n1.${operationId}`
    });
    try {
      createNuwaRunPack({ workspacePath: workspace, plan, snapshot });
    } catch (error) {
      if (!String(error?.message || error).includes("already exists")) throw error;
    }
    const existing = readNuwaN1Run(workspace, plan.runId);
    if (existing) {
      if (!existing.receipts.some((receipt) => receipt.operationId === operationId)) throw failure("当前女娲 Run 已由其他操作建立，请刷新后继续。", 409);
      return read(input.projectId, plan.runId);
    }
    createNuwaN1Run({
      workspacePath: workspace,
      runId: plan.runId,
      sourceSnapshotHash: snapshot.snapshotHash,
      sourceIdentity: sourceIdentityForProject(input.projectId),
      scene: {
        ...resolveScene(input.projectId, input.storyUnit),
        observedAt: now()
      },
      authorGoal: prepared.setup.goal,
      actors: resolveActors(input.projectId, input.participants, resolveScene(input.projectId, input.storyUnit)),
      operationId,
      now: now()
    });
    // Starting a Run is the one explicit author action that can establish a
    // high-permission scope.  The server derives every target from validated
    // project objects; the browser and model never submit an authorization id.
    if (actionPermissionBroker?.read(input.projectId).profile === "full-access") {
      actionPermissionBroker.grantNuwaFullAccess({
        projectId: input.projectId,
        runId: plan.runId,
        storyUnitId: prepared.setup.storyUnit.id,
        storyUnitRevision: prepared.setup.storyUnit.revision,
        actorIds: prepared.setup.participants.map((actor) => actor.id),
        relationTypeId: relationType?.relationTypeId ?? null,
        relationTypeRevision: relationType?.typeRevision ?? null,
        sourceOperationId: operationId,
        maxSteps: 6,
        maxProviderDispatches: 12
      });
    }
    return read(input.projectId, plan.runId);
  }

  async function step(input) {
    requireExecutionAvailability();
    const workspace = workspacePath(input.projectId);
    let current = requireRun(workspace, input.runId);
    const expectedRevision = revision(input.expectedRevision);
    const operationId = operation(input.operationId);
    const activeKey = `${input.projectId}\u0000${current.runId}`;
    const active = activePiExecutions.get(activeKey);
    if (active) {
      if (active.operationId === operationId) return active.promise;
      throw failure("当前女娲 Run 已有执行中的角色回合；请等待、停止或恢复同一操作。", 409);
    }
    if (current.lifecycle === "ready") {
      current = startNuwaN1Run({ workspacePath: workspace, runId: current.runId, expectedRevision, operationId: `${operationId}.start`, now: now() });
    }
    const adapter = fakeProviderAllowed ? createLocalFakeAdapter(input.projectId, current.runId) : createPiAdapter(input.projectId, current.runId, current.sourceIdentity, operationId);
    const execution = { operationId, adapter, promise: null };
    const promise = (async () => {
      const next = await advanceNuwaN1Run({
        workspacePath: workspace,
        runId: current.runId,
        expectedRevision: current.revision,
        operationId,
        adapter,
        now: now()
      });
      return present(input.projectId, next);
    })();
    execution.promise = promise;
    activePiExecutions.set(activeKey, execution);
    try { return await promise; }
    finally { if (activePiExecutions.get(activeKey) === execution) activePiExecutions.delete(activeKey); }
  }

  async function continuous(input) {
    const initial = requireRun(workspacePath(input.projectId), input.runId);
    const baseOperationId = operation(input.operationId);
    let expectedRevision = revision(input.expectedRevision);
    let current = await step({ ...input, expectedRevision, operationId: continuousStepOperation(baseOperationId, initial.steps.length + 1, expectedRevision) });
    while (current.run && current.run.status === "running") {
      const previousStepCount = current.run.steps.length;
      expectedRevision = current.run.revision;
      current = await step({ ...input, expectedRevision, operationId: continuousStepOperation(baseOperationId, previousStepCount + 1, expectedRevision) });
      // A cue arriving while Pi was using an earlier frozen context deliberately
      // leaves that attempt without a committed step.  Its Run revision changes,
      // so the next loop must use a new durable operation identity rather than
      // replaying the completed no-progress attempt forever.
      if (current.run?.status === "running" && current.run.steps.length === previousStepCount && current.run.revision === expectedRevision) {
        throw failure("连续女娲回合没有提交步骤或推进版本；已停止循环，作者可查看后继续。", 409);
      }
    }
    if (current.run?.status === "completed" && current.authorization?.status === "active") {
      return autoApply({
        projectId: input.projectId,
        runId: current.run.runId,
        expectedRevision: current.run.revision,
        operationId: `${baseOperationId}.apply`,
        selectedStepIds: current.run.steps.map((step) => step.stepId)
      });
    }
    return current;
  }

  function pause(input) {
    return present(input.projectId, pauseNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), ...(input.reason ? { reason: requiredText(input.reason, "暂停原因", 240) } : {}), now: now() }));
  }

  function resume(input) {
    return present(input.projectId, resumeNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), now: now() }));
  }

  function stop(input) {
    // Validate and durably cancel first.  An invalid Stop must never abort a
    // valid live stream merely because it named the same Run.
    const next = cancelNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), ...(input.reason ? { reason: requiredText(input.reason, "停止原因", 240) } : {}), now: now() });
    activePiExecutions.get(`${input.projectId}\u0000${input.runId}`)?.adapter?.cancel?.();
    // Stop is also the author's durable stop-control for automatic formal
    // writes.  Cancellation alone must not leave a completed or partially
    // observed Run with an active scope that can later be applied by a stale
    // browser action.  Already-applied changes remain in their Owner history
    // and can be inspected or reverted through that history.
    const authorization = actionPermissionBroker?.read(input.projectId).nuwaAuthorizations
      .find((item) => item.runId === input.runId && item.status === "active");
    if (authorization) {
      actionPermissionBroker.revokeNuwaFullAccess({
        projectId: input.projectId,
        authorizationId: authorization.id,
        reason: input.reason || "作者已停止女娲 Run，后续自动正式写入已撤销。"
      });
    }
    return present(input.projectId, next);
  }

  function cue(input) {
    return present(input.projectId, cueNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), instruction: requiredText(input.instruction, "作者提示", 800), now: now() }));
  }

  function replay(input) {
    return read(input.projectId, input.runId);
  }

  function candidate(input) {
    const project = requireProject(input.projectId);
    const workspace = workspacePath(project.id);
    const result = prepareNuwaN1CandidateHandoff({
      workspacePath: workspace,
      runId: input.runId,
      expectedRevision: revision(input.expectedRevision),
      operationId: operation(input.operationId),
      selectedStepIds: requiredIds(input.selectedStepIds, "候选步骤"),
      now: now()
    });
    const candidateResult = candidateReviewResult(project, result.run, result.handoff);
    const review = authorControl.createCandidateReview({ projectId: project.id, result: candidateResult, minimumCandidates: 1, createdAt: now() });
    return { ...present(project.id, result.run), candidate: result.handoff, review };
  }

  /**
   * High-permission application deliberately reuses the ordinary planning →
   * impact → changeset → AuthorControl path.  The only different decision is
   * the previously persisted, server-validated Nuwa scope; neither Pi nor the
   * browser gets a direct world-object write capability.
   */
  function autoApply(input) {
    const project = requireProject(input.projectId);
    const current = requireRun(workspacePath(project.id), input.runId);
    const operationId = operation(input.operationId);
    const selectedStepIds = requiredIds(input.selectedStepIds, "候选步骤");
    const receiptId = autoApplicationReceiptId(operationId);
    const inputHash = digest({ projectId: project.id, runId: current.runId, expectedRevision: revision(input.expectedRevision), operationId, selectedStepIds });
    let receipt = readAutoApplicationReceipt(project.id, receiptId);
    if (receipt) {
      if (receipt.inputHash !== inputHash) throw failure("同一自动应用操作键已绑定不同内容；已拒绝重放。", 409);
      if (receipt.status === "active") return presentAutoApplication(project.id, current, receipt);
    } else {
      const prepared = prepareAutoApplication(project, current, input, selectedStepIds);
      receipt = {
        version: AUTO_APPLICATION_RECEIPT_VERSION,
        receiptId,
        inputHash,
        projectId: project.id,
        runId: current.runId,
        sourceSnapshotHash: current.sourceSnapshotHash,
        sourceIdentity: current.sourceIdentity,
        selectedStepIds,
        authorizationId: prepared.authorization.id,
        storyUnitId: prepared.storyUnit.id,
        storyUnitVersion: prepared.storyUnit.version,
        relationTypeId: prepared.relationType?.relationTypeId ?? null,
        relationTypeRevision: prepared.relationType?.typeRevision ?? null,
        status: "applying",
        application: { permissionReceiptId: null, impactPermissionReceiptId: null, candidate: null, review: null, planningEventId: null, impactReviewId: null, changeSetId: null, eventId: null, storyUnitLinkedVersion: null, narrativePlacementIds: [], materialObjectId: null, relationId: null, workVersionReceiptId: null, resultVersion: null },
        failure: null,
        recordedAt: now(),
        updatedAt: now()
      };
      writeAutoApplicationReceipt(receipt);
    }
    try {
      return continueAutoApplication(project, current, input, receipt);
    } catch (cause) {
      receipt.status = "recovery-required";
      receipt.failure = safeMessage(cause);
      receipt.updatedAt = now();
      writeAutoApplicationReceipt(receipt);
      throw failure(`自动应用未完整结束；已保留可恢复回执 ${receipt.receiptId}。${receipt.failure}`, errorStatus(cause));
    }
  }

  function prepareAutoApplication(project, current, input, selectedStepIds, recoveredStoryUnitVersion = null) {
    if (new Set(selectedStepIds).size !== selectedStepIds.length || selectedStepIds.some((id) => !current.steps.some((step) => step.stepId === id))) throw failure("选定步骤已过期或不属于当前女娲 Run。", 409);
    const authorization = actionPermissionBroker?.read(project.id).nuwaAuthorizations.find((item) => item.runId === current.runId && item.status === "active") ?? null;
    if (!authorization || authorization.storyUnitId !== current.scene.storyUnit.id || authorization.storyUnitRevision !== current.scene.storyUnit.revision || authorization.actorIds.length !== current.actors.length || authorization.actorIds.some((id) => !current.actors.some((actor) => actor.character.id === id))) {
      throw failure("当前女娲 Run 没有有效的高权限范围授权；结果仍可送入待确认。", 403);
    }
    const storyUnit = operations.readStoryUnit({ projectId: project.id, unitId: authorization.storyUnitId });
    if (!storyUnit || storyUnit.version !== (recoveredStoryUnitVersion || authorization.storyUnitRevision)) throw failure("目标故事单元已变化；没有执行任何正式写入。", 409);
    const sourceSelection = creationSourcePort();
    if (!current.sourceIdentity || current.sourceIdentity.kind !== "root" || !Number.isSafeInteger(Number(current.sourceIdentity.revision)) || !sourceSelection) {
      throw failure("本次排演缺少可验证的主故事版本；没有执行任何正式写入。", 409);
    }
    const root = sourceSelection.resolveRootWorkVersion(project.id);
    if (!root || root.identity.workVersionId !== current.sourceIdentity.workVersionId || root.identity.currentRevision !== Number(current.sourceIdentity.revision)) {
      throw failure("排演来源版本已变化；没有执行任何正式写入。", 409);
    }
    const relationType = authorization.relationTypeId ? relationOperations?.resolveRelationType({ projectId: project.id, relationTypeId: authorization.relationTypeId }) : null;
    if (authorization.relationTypeId && (!relationType || relationType.lifecycle !== "active" || relationType.typeRevision !== authorization.relationTypeRevision)) throw failure("已授权的关系类型已变更或停用；已阻止本次自动关系写入。", 409);
    return { authorization, storyUnit, relationType };
  }

  function continueAutoApplication(project, current, input, receipt) {
    const selectedStepIds = receipt.selectedStepIds;
    const prepared = prepareAutoApplication(project, current, input, selectedStepIds, receipt.application.storyUnitLinkedVersion);
    if (prepared.authorization.id !== receipt.authorizationId || prepared.storyUnit.version !== (receipt.application.storyUnitLinkedVersion || receipt.storyUnitVersion) || (prepared.relationType?.relationTypeId ?? null) !== receipt.relationTypeId || (prepared.relationType?.typeRevision ?? null) !== receipt.relationTypeRevision) {
      throw failure("持久化自动应用范围已与当前授权或目标版本不一致；已停止恢复。", 409);
    }
    const application = receipt.application;
    const targets = [current.runId, receipt.storyUnitId, ...prepared.authorization.actorIds];
    if (!application.permissionReceiptId) {
      const permission = actionPermissionBroker.record(project.id, { actor: "nuwa", action: "confirmed-event", targetType: "nuwa-run", targets, authorizationId: prepared.authorization.id, checkpointId: current.runId });
      if (permission.outcome !== "allowed") throw failure(permission.reason, 403);
      application.permissionReceiptId = permission.id;
      persistAutoApplication(receipt);
    }
    if (!application.candidate) {
      const handoff = candidate({ ...input, operationId: `${input.operationId}.candidate`, selectedStepIds });
      application.candidate = handoff.candidate;
      application.review = handoff.review;
      persistAutoApplication(receipt);
    }
    const selected = application.candidate.candidates;
    if (!selected.length || selected.some((item) => !selectedStepIds.includes(item.sourceStepId))) throw failure("持久化候选与选定步骤不一致；已停止恢复。", 409);
    const sourceStepIds = selected.map((item) => item.sourceStepId);
    const primary = selected[0];
    const receiptTag = `nuwa-auto-application:${receipt.receiptId}`;
    if (!application.planningEventId) {
      const existing = operations.listWorldObjects({ projectId: project.id, type: "event" }).find((item) => item.tags.includes(receiptTag));
      const sourceSummary = selected.map((item) => `## ${item.title}\n\n${item.summary}\n\n${item.observedResult}\n\n- 来源步骤：${item.sourceStepId}`).join("\n\n");
      const planning = existing || operations.createPlanningEvent({ projectId: project.id, title: selected.length === 1 ? primary.title : `${current.scene.label} · ${selected.length} 个女娲步骤`, body: `# ${selected.length === 1 ? primary.title : `${current.scene.label} · 女娲连续场景`}\n\n${sourceSummary}\n\n- 来源女娲 Run：${current.runId}\n- 来源步骤：${sourceStepIds.join("、")}\n- 高权限范围授权：${prepared.authorization.id}\n- 自动应用回执：${receipt.receiptId}\n- 决策来源：作者开始 Run 时的范围授权\n`, tags: ["女娲自动执行", current.runId, receiptTag] });
      application.planningEventId = planning.id;
      persistAutoApplication(receipt);
    }
    if (!application.impactPermissionReceiptId) {
      const permission = actionPermissionBroker.record(project.id, { actor: "nuwa", action: "event-impact-review", targetType: "nuwa-run", targets, authorizationId: prepared.authorization.id, checkpointId: current.runId });
      if (permission.outcome !== "allowed") throw failure(permission.reason, 403);
      application.impactPermissionReceiptId = permission.id;
      persistAutoApplication(receipt);
    }
    if (!application.eventId) {
      let impact = application.impactReviewId ? authorControl.readImpactReview({ projectId: project.id, reviewId: application.impactReviewId }) : null;
      if (!impact) {
        impact = authorControl.createPlanningEventImpactReview({ projectId: project.id, planningEventId: application.planningEventId });
        application.impactReviewId = impact.id;
        persistAutoApplication(receipt);
      }
      if (impact.status === "pending") {
        const option = impact.options[0];
        if (!option) throw failure("女娲变化没有可应用的影响路径。", 409);
        impact = authorControl.chooseImpactRoute({ projectId: project.id, reviewId: impact.id, optionId: option.id, action: "adopt" });
      }
      if (impact.status !== "selected") throw failure("自动影响审查没有形成可写入的路线。", 409);
      if (!application.changeSetId) {
        const changeSet = authorControl.createAuthorChangeSet({ projectId: project.id, reviewId: impact.id, decisionSource: "nuwa-scope-authorization", authorizationId: prepared.authorization.id });
        application.changeSetId = changeSet.id;
        persistAutoApplication(receipt);
      }
      const applied = authorControl.applyAuthorChangeSet({ projectId: project.id, changeSetId: application.changeSetId });
      if (!applied.application.appliedEventId) throw failure("正式 Event 未产生可验证回执。", 409);
      application.eventId = applied.application.appliedEventId;
      persistAutoApplication(receipt);
    }
    let storyUnit = operations.readStoryUnit({ projectId: project.id, unitId: receipt.storyUnitId });
    if (!storyUnit || (application.storyUnitLinkedVersion == null && storyUnit.version !== receipt.storyUnitVersion)) throw failure("正式 Event 已创建，但故事单元版本已变化；回执保留为待恢复状态。", 409);
    if (application.storyUnitLinkedVersion == null) {
      const linkedEntityIds = [...new Set([...storyUnit.linkedEntityIds, application.eventId])];
      const linked = linkedEntityIds.length === storyUnit.linkedEntityIds.length
        ? { conflict: false, unit: storyUnit }
        : operations.updateStoryUnit({ projectId: project.id, unitId: storyUnit.id, expectedVersion: storyUnit.version, linkedEntityIds });
      if (linked.conflict) throw failure("正式 Event 已创建，但故事单元刚刚变化；回执保留为待恢复状态。", 409);
      application.storyUnitLinkedVersion = linked.unit.version;
      persistAutoApplication(receipt);
      storyUnit = linked.unit;
    }
    if (!application.narrativePlacementIds.length) {
      let arrangement = operations.readNarrativeArrangement({ projectId: project.id, workVersionId: current.sourceIdentity.workVersionId, narrativePathId: storyUnit.id });
      if (!arrangement.arrangement) {
        const created = operations.createNarrativeArrangement({ projectId: project.id, workVersionId: current.sourceIdentity.workVersionId, narrativePathId: storyUnit.id, ownerStoryUnitId: storyUnit.id, expectedOwnerVersion: storyUnit.version, expectedRevision: 0, operationId: `${receipt.receiptId}.arrangement.create`, authorActionId: `${receipt.receiptId}.author.arrangement.create`, createdAt: now() });
        if (created.conflict) throw failure(`NarrativePlacement 创建冲突：${created.code}`, 409);
        arrangement = operations.readNarrativeArrangement({ projectId: project.id, workVersionId: current.sourceIdentity.workVersionId, narrativePathId: storyUnit.id });
        application.storyUnitLinkedVersion = arrangement.ownerVersion;
        persistAutoApplication(receipt);
      }
      const inserted = operations.insertNarrativePlacement({ projectId: project.id, workVersionId: current.sourceIdentity.workVersionId, narrativePathId: storyUnit.id, expectedOwnerVersion: arrangement.ownerVersion, expectedRevision: arrangement.arrangement.currentRevision, operationId: `${receipt.receiptId}.arrangement.insert`, authorActionId: `${receipt.receiptId}.author.arrangement.insert`, sourceKind: "author-action", sourceRef: `nuwa-n1:${current.runId}:${receipt.receiptId}`, createdAt: now(), eventId: application.eventId, storyUnitId: storyUnit.id, role: "primary", position: { kind: "end" } });
      if (inserted.conflict || !inserted.receipt) throw failure(`NarrativePlacement 写入冲突：${inserted.code}`, 409);
      application.narrativePlacementIds = inserted.receipt.afterPlacementIds;
      application.storyUnitLinkedVersion = inserted.ownerVersion;
      persistAutoApplication(receipt);
    }
    if (!application.materialObjectId) {
      const existing = operations.listWorldObjects({ projectId: project.id, type: "location" }).find((item) => item.tags.includes(receiptTag));
      const material = existing || operations.createWorldObject({ projectId: project.id, type: "location", title: `场景：${current.scene.label}`, tags: ["女娲自动执行", current.runId, receiptTag], body: `# 场景：${current.scene.label}\n\n本资料由女娲 Run ${current.runId} 的已授权场景结果建立。\n\n- 来源步骤：${sourceStepIds.join("、")}\n- 授权：${prepared.authorization.id}\n- 自动应用回执：${receipt.receiptId}\n- 结果：${selected.map((item) => item.observedResult).join("；")}\n` });
      application.materialObjectId = material.id;
      persistAutoApplication(receipt);
    }
    if (receipt.relationTypeId && !application.relationId) {
      const event = operations.readWorldObject({ projectId: project.id, objectId: application.eventId });
      const relationId = `nuwa-relation.${digest({ receiptId: receipt.receiptId, eventId: application.eventId, materialObjectId: application.materialObjectId })}`;
      autoApplicationFaultInjector?.({ phase: "before-relation-confirm", receiptId: receipt.receiptId, projectId: project.id, runId: current.runId });
      const relationCandidate = relationOperations.createRelationCandidate({ projectId: project.id, relationId, sourceObjectId: application.eventId, targetObjectId: application.materialObjectId, relationTypeId: prepared.relationType.relationTypeId, relationLabelSnapshot: prepared.relationType.label, direction: "forward", actor: "nuwa", sourceRevision: current.sourceSnapshotHash, sourceRef: `nuwa-n1:${current.runId}:${receipt.receiptId}`, operationId: `${receipt.receiptId}.relation.candidate`, evidenceRefs: [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: project.id, eventId: application.eventId, revisionToken: event.revisionToken, state: "committed", requestedUse: "constraint" } }], now: now() });
      const relation = relationOperations.confirmRelationCandidate({ projectId: project.id, relationId: relationCandidate.relation.relationId, expectedRelationRevision: relationCandidate.relation.revision, operationId: `${receipt.receiptId}.relation.confirm`, actor: "nuwa", now: now() });
      application.relationId = relation.relation.relationId;
      persistAutoApplication(receipt);
    }
    if (!application.workVersionReceiptId) {
      const result = creationSourcePort().appendStructuredStoryRevision(project.id, { expectedRevision: Number(current.sourceIdentity.revision), authorActionId: `${receipt.receiptId}.author`, idempotencyKey: `${receipt.receiptId}.result-version`, createdAt: now(), semanticDeltaRefs: [`nuwa-run:${current.runId}`, `changeset:${application.changeSetId}`, `event:${application.eventId}`, `narrative-placement:${application.narrativePlacementIds.join(",")}`, `material:${application.materialObjectId}`, ...(application.relationId ? [`relation:${application.relationId}`] : [])] });
      application.workVersionReceiptId = result.receipt.receiptId;
      application.resultVersion = { workVersionId: result.identity.workVersionId, revision: result.identity.currentRevision };
      persistAutoApplication(receipt);
    }
    receipt.status = "active";
    receipt.failure = null;
    persistAutoApplication(receipt);
    return presentAutoApplication(project.id, current, receipt);
  }

  function presentAutoApplication(projectId, current, receipt) {
    const application = receipt.application;
    return { ...read(projectId, current.runId), candidate: application.candidate, review: application.review, automaticApplication: { status: receipt.status === "active" ? "applied" : "recovery-required", decisionSource: "nuwa-scope-authorization", receiptId: receipt.receiptId, authorizationId: receipt.authorizationId, permissionReceiptId: application.permissionReceiptId, planningEventId: application.planningEventId, impactReviewId: application.impactReviewId, changeSetId: application.changeSetId, eventId: application.eventId, storyUnitId: receipt.storyUnitId, storyUnitVersion: application.storyUnitLinkedVersion, narrativePlacementIds: application.narrativePlacementIds, materialObjectId: application.materialObjectId, relationId: application.relationId, relationStatus: receipt.relationTypeId ? (application.relationId ? "confirmed" : "recovery-required") : "not-configured", workVersionReceiptId: application.workVersionReceiptId, resultVersion: application.resultVersion, sourceSnapshotHash: receipt.sourceSnapshotHash } };
  }

  function autoApplicationReceiptPath(projectId, receiptId) { return path.join(workspacePath(projectId), ".world-os", "workspace", "nuwa-n1-auto-applications", `${receiptId}.json`); }
  function continuousStepOperation(baseOperationId, sequence, expectedRevision) { return `${baseOperationId}.step.${sequence}.r${expectedRevision}`; }
  function creationSourcePort() { return typeof creationSourceSelectionPort === "function" ? creationSourceSelectionPort() : creationSourceSelectionPort; }
  function autoApplicationReceiptId(operationId) { return `nuwa-n1-auto-application.${digest(operationId)}`; }
  function readAutoApplicationReceipt(projectId, receiptId) { const target = autoApplicationReceiptPath(projectId, receiptId); return existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : null; }
  function writeAutoApplicationReceipt(receipt) { const target = autoApplicationReceiptPath(receipt.projectId, receipt.receiptId); mkdirSync(path.dirname(target), { recursive: true }); const temporary = `${target}.${process.pid}.tmp`; writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); renameSync(temporary, target); }
  function persistAutoApplication(receipt) { receipt.updatedAt = now(); writeAutoApplicationReceipt(receipt); }

  function read(projectId, runId) {
    requireProject(projectId);
    const run = requireRun(workspacePath(projectId), runId);
    return present(projectId, run);
  }

  function latest(projectId) {
    requireProject(projectId);
    const value = latestRun(projectId);
    return value ? present(projectId, value.run) : { version: VERSION, availability: availability(), run: null, contextInspector: null, receipts: [] };
  }

  function latestRun(projectId) {
    const record = readLatestNuwaRun(workspacePath(projectId));
    const run = record ? readNuwaN1Run(workspacePath(projectId), record.runId) : null;
    return run ? { run, record } : null;
  }

  function present(projectId, run) {
    const project = requireProject(projectId);
    return {
      version: VERSION,
      availability: availability(),
      authorization: actionPermissionBroker?.read(projectId).nuwaAuthorizations.find((authorization) => authorization.runId === run.runId) ?? null,
      run: {
        runId: run.runId,
        status: run.lifecycle,
        revision: run.revision,
        scene: { storyUnitId: run.scene.storyUnit.id, label: run.scene.label, observedAt: run.scene.observedAt },
        participants: run.actors.map((item) => ({ id: item.character.id, title: item.displayName, revision: item.character.revision })),
        goal: run.authorGoal,
        steps: run.steps.map((step) => ({ stepId: step.stepId, sequence: step.sequence, actorId: step.actor.id, intent: step.intent, speech: step.speech, action: step.action, observableResult: step.observableResult, heardStatements: step.heardStatements, contextEvidenceRefs: step.contextEvidenceRefs, tool: { name: "read_role_context", requestId: step.toolRequestId }, execution: step.execution, contextHash: step.contextHash, usage: step.usage, committedAt: step.committedAt })),
        dispatches: run.dispatches,
        providerDispatches: run.providerDispatches,
        providerDispatchEvidence: run.providerDispatchEvidence,
        pendingCue: run.pendingCue ? { operationId: run.pendingCue.operationId, instruction: run.pendingCue.instruction } : null,
        attempts: run.attempts.map((attempt) => ({
          attemptId: attempt.attemptId,
          actorId: attempt.actor.id,
          requestId: attempt.requestId,
          dispatches: attempt.dispatches.map((dispatch) => ({
            phase: dispatch.phase,
            status: dispatch.status,
            recordedAt: dispatch.recordedAt,
            detail: dispatch.detail,
            ...(dispatch.phase === "provider" ? {
              providerCall: dispatch.providerCall ?? null,
              requestKey: dispatch.requestKey ?? null,
              reservationId: dispatch.reservationId ?? null,
              receiptEnvelopeId: dispatch.receiptEnvelopeId ?? null,
              provider: dispatch.provider ?? null
            } : {})
          })),
          tool: attempt.tool,
          usage: attempt.usage,
          outcome: attempt.outcome,
          recordedAt: attempt.recordedAt,
          updatedAt: attempt.updatedAt
        })),
        provider: { ...availability(), projectId: project.id },
        blocker: run.blocker
      },
      contextInspector: {
        actors: run.actors.map((actor) => {
          const context = compileNuwaN1Context(run, actor, `nuwa-n1.inspect.${createHash("sha256").update(`${run.runId}:${run.revision}:${actor.character.id}`).digest("hex").slice(0, 32)}`);
          return {
            actorId: actor.character.id,
            evidenceRefs: [
              ...context.knownFacts.map((fact) => ({ id: fact.sourceId, revision: fact.sourceRevision, visibility: fact.visibility })),
              ...context.beliefs.map((belief) => ({ id: belief.sourceId, revision: belief.sourceRevision, visibility: belief.stance }))
            ],
            knowledgeItems: context.knownFacts.map((fact) => ({ id: fact.factId, summary: fact.summary, visibility: fact.visibility, sourceId: fact.sourceId, sourceRevision: fact.sourceRevision })),
            beliefItems: context.beliefs.map((belief) => ({ id: belief.beliefId, summary: belief.summary, stance: belief.stance, sourceId: belief.sourceId, sourceRevision: belief.sourceRevision })),
            excludedCount: actor.unknownFactIds.length
          };
        })
      },
      receipts: run.receipts
    };
  }

  function resolveScene(projectId, ref) {
    const unitId = ref?.id;
    const unit = operations.readStoryUnit({ projectId, unitId });
    if (unit.version !== ref?.revision) throw failure("故事单元已变更，请重新选择。", 409);
    return { storyUnit: { id: unit.id, revision: unit.version }, sceneRef: { id: unit.id, revision: unit.version }, observedAt: now(), label: unit.title };
  }

  function resolveRelationType(projectId, input) {
    if (!relationOperations) return null;
    const active = relationOperations.listRelationTypes({ projectId }).types.filter((item) => item.lifecycle === "active");
    // Omitted is a backward-compatible default; a supplied null is the
    // author's explicit "do not write a Relation" decision and must never be
    // converted into the only available type.
    if (Object.hasOwn(input, "relationTypeId") && input.relationTypeId == null) return null;
    const relationTypeId = input.relationTypeId;
    if (relationTypeId != null) {
      const selected = active.find((item) => item.relationTypeId === relationTypeId);
      if (!selected) throw failure("所选关系类型不存在或已停用；请刷新后重新开始女娲 Run。", 409);
      return selected;
    }
    return active.length === 1 ? active[0] : null;
  }

  function resolveActors(projectId, refs, scene) {
    if (!Array.isArray(refs) || refs.length < 2 || refs.length > 3) throw failure("女娲 N1 需要选择两到三个正式角色。", 400);
    const seen = new Set();
    const sceneEvidence = operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status !== "archived" && scene.storyUnit.id && operations.readStoryUnit({ projectId, unitId: scene.storyUnit.id }).linkedEntityIds.includes(item.id))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }));
    const formalCharacters = operations.listWorldObjects({ projectId, type: "character" })
      .filter((item) => item.status !== "archived")
      .map((item) => ({ id: item.id, label: item.title, revisionToken: item.revisionToken }));
    return refs.map((ref) => {
      if (!ref || typeof ref.id !== "string" || seen.has(ref.id)) throw failure("角色必须使用不同的稳定身份。", 400);
      seen.add(ref.id);
      const summary = operations.listWorldObjects({ projectId, type: "character" }).find((item) => item.id === ref.id && item.status !== "archived");
      if (!summary || summary.revisionToken !== ref.revision) throw failure("角色不存在、已归档或版本已变更。", 409);
      const projection = buildEventStoryCrossingKnowledgeProjection({
        projectId,
        observerId: summary.id,
        characters: formalCharacters,
        events: sceneEvidence.map((event) => ({ id: event.id, title: event.title, status: event.status, revisionToken: event.revisionToken, relativeId: event.relativeId, tags: event.tags, knowledgeSubjectIds: event.knowledgeSubjects }))
      });
      const knownFacts = projection.visibleEvents
        .filter((event) => ["experienced", "witnessed", "informed"].includes(event.knowledgeState))
        .map((event) => ({ factId: event.eventId, summary: `${event.knowledgeLabel}：${event.title}`, sourceRef: { id: event.eventId, revision: event.revisionToken }, visibility: event.knowledgeState }));
      const beliefs = projection.visibleEvents
        .filter((event) => ["believes", "suspects", "misled", "denied", "contradicted"].includes(event.knowledgeState))
        .map((event) => ({
          beliefId: `belief.${event.eventId}`,
          summary: `${event.knowledgeLabel}：${event.title}`,
          stance: event.knowledgeState === "misled" ? "misunderstood" : event.knowledgeState === "suspects" || event.knowledgeState === "contradicted" ? "suspected" : "believed",
          sourceRef: { id: event.eventId, revision: event.revisionToken }
        }));
      const unknownFactIds = projection.hiddenEventIds;
      return {
        character: { id: summary.id, revision: summary.revisionToken },
        displayName: summary.title,
        coreSummary: `正式角色 ${summary.title}；本轮只可使用角色稳定身份及已授权证据。`,
        localGoal: `围绕“${scene.label}”回应当前可观察的变化。`,
        knownFacts,
        beliefs,
        unknownFactIds,
        allowedActions: ["speak", "observe", "ask"]
      };
    });
  }

  function requireExecutionAvailability() {
    if (!fakeProviderAllowed && !piAdapterFactory?.availability?.()) throw failure("女娲 N1 当前没有获授权的执行器；未自动回退为假对话。", 503);
  }

  function createPiAdapter(projectId, runId, sourceIdentity, operationId) {
    if (!sourceIdentity) throw failure("这份排演缺少创建时冻结的作品版本身份；为避免使用新版本执行，已阻止继续。", 409);
    const adapter = piAdapterFactory?.create?.({
      projectId,
      runId,
      sourceIdentity,
      onProviderLifecycle(event) {
        const base = { workspacePath: workspacePath(projectId), runId, operationId, requestKey: event.requestKey, now: now() };
        if (event.phase === "reserved") {
          recordNuwaN1ProviderReservation({
            ...base,
            providerCall: event.providerCall,
            reservationId: event.reservationId,
            receiptEnvelopeId: event.receiptEnvelopeId,
            provider: event.provider
          });
          return;
        }
        if (event.phase === "dispatched") {
          recordNuwaN1ProviderDispatch(base);
          return;
        }
        resolveNuwaN1ProviderDispatch({ ...base, status: event.phase, ...(event.detail ? { detail: event.detail } : {}) });
      }
    });
    if (!adapter) throw failure("女娲 N1 当前没有获授权的 Pi 执行器；未自动回退为假对话。", 503);
    return adapter;
  }

  function createLocalFakeAdapter(projectId, runId) {
    return {
      adapterId: FAKE_ADAPTER_ID,
      async request(context) {
        // Tool request IDs are transport identifiers, not story identities.
        // Keep them ASCII while preserving the Unicode formal character ref in
        // the separately validated `actor` field.
        const actorToken = Buffer.from(context.actor.id, "utf8").toString("hex").slice(0, 48);
        return { type: "tool-request", toolName: "read_role_context", requestId: `n1-tool.${context.runId}.${context.step}.${actorToken}`, actor: context.actor };
      },
      async executeTool({ context, request }) {
        const current = requireRun(workspacePath(projectId), runId);
        const actor = current.actors.find((candidate) => candidate.character.id === request.actor.id && candidate.character.revision === request.actor.revision);
        if (request.toolName !== "read_role_context" || request.actor.id !== context.actor.id || request.actor.revision !== context.actor.revision || context.runId !== current.runId || !actor) {
          throw new Error("角色上下文工具拒绝了越界或过期的请求。");
        }
        return { type: "tool-result", toolName: "read_role_context", requestId: request.requestId, actor: request.actor, context: structuredClone(context) };
      },
      async continueAfterTool({ context, toolResult }) {
        if (toolResult.context.actor.id !== context.actor.id) throw new Error("本地工程演练工具结果越过角色范围。");
        if (fakeStepDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, fakeStepDelayMs));
        const current = requireRun(workspacePath(projectId), runId);
        const heard = context.recentDialogue.at(-1)?.text || null;
        const evidence = context.knownFacts[0]?.summary || "当前没有额外可知事件；保持未知。";
        return {
          type: "actor-result",
          actor: context.actor,
          intent: `依据受限上下文核对：${evidence}`,
          speech: heard ? `我听到了这句话；我只按自己可知的信息继续观察。` : `我只依据当前可知信息继续观察。`,
          action: { action: "observe", targetId: null },
          observableResult: "角色完成一次受限观察；结果仍属于本次女娲 Run。",
          ...(context.step === 1 && current.actors[1] ? { speech: "我只把钟声的线索告诉你。", heardByActorIds: [current.actors[1].character.id] } : {}),
          usage: { inputTokens: null, outputTokens: null }
        };
      }
    };
  }

  return { bootstrap, setup, create, read, latest, step, continuous, pause, resume, stop, replay, cue, candidate, autoApply };
}

function candidateReviewResult(project, run, handoff) {
  const providerCalls = run.attempts.flatMap((attempt) => attempt.dispatches
    .filter((dispatch) => dispatch.phase === "provider")
    .map((dispatch) => ({
      attemptId: attempt.attemptId,
      adapterId: attempt.adapterId,
      status: dispatch.status,
      recordedAt: dispatch.recordedAt,
      detail: dispatch.detail,
      requestKey: dispatch.requestKey ?? null,
      reservationId: dispatch.reservationId ?? null,
      receiptEnvelopeId: dispatch.receiptEnvelopeId ?? null,
      provider: dispatch.provider ?? null
    })));
  const executionAdapters = [...new Set(run.attempts.map((attempt) => attempt.adapterId))];
  const providerProfiles = [...new Map(providerCalls
    .filter((call) => call.provider?.profileId)
    .map((call) => [call.provider.profileId, call.provider])).values()];
  const executionSummary = providerCalls.length
    ? `本次 Run 记录了 ${providerCalls.length} 次模型边界发送；候选仍须作者采纳。`
    : "本次 Run 没有模型边界发送记录；候选仍须作者采纳。";
  const candidates = handoff.candidates.map((candidate) => ({
    id: candidate.candidateId,
    title: candidate.title,
    change: candidate.summary,
    after: candidate.observedResult,
    causes: [`Nuwa N1 Run ${run.runId} / Step ${candidate.sourceStepId}`],
    evidence: run.actors.find((actor) => actor.character.id === candidate.affectedCharacterIds[0])?.knownFacts.map((fact) => fact.sourceRef.id) ?? [],
    affectedObjects: candidate.affectedCharacterIds,
    uncertainty: "本次排演结果尚未成为正式故事事实。",
    impact: "仅进入既有 Candidate Review；正式写入为 0。",
    risk: "必须由作者查看影响后再决定是否采纳。"
  }));
  return {
    version: "tianyan-golden-loop-candidate/v1",
    status: "candidate",
    contextPack: {
      version: "tianyan-golden-loop-context-pack/v1",
      id: handoff.handoffId,
      contextReceiptId: handoff.handoffId,
      project: { id: project.id, title: project.title },
      authorIntent: "审阅女娲 N1 的受限场景候选；不会直接写入故事事实。",
      sources: run.actors.flatMap((actor) => actor.knownFacts.map((fact) => ({ id: fact.sourceRef.id, type: "authorized-character-evidence", label: fact.sourceRef.id, content: fact.summary }))),
      unknowns: ["未选定的角色知识、作者未来安排和其他角色秘密没有进入本次候选。"],
      budgets: { maximumSources: 16, maximumCharacters: 16_000 },
      excluded: run.actors.flatMap((actor) => actor.unknownFactIds.map((id) => ({ id, reason: "not-known-by-selected-actor" })))
    },
    contextReceiptId: handoff.handoffId,
    nuwaRunId: run.runId,
    tianyi: {
      version: "tianyan-tianyi-alignment/v1",
      facts: [],
      inferences: [executionSummary],
      unknowns: ["候选尚未经过作者采纳。"],
      suggestions: candidates.map((candidate) => candidate.title),
      simulationTask: { goal: "审阅女娲 N1 候选。", mustPreserve: ["唯一 Owner", "候选不自动写事实"], questions: [] }
    },
    nuwa: { version: "tianyan-nuwa-simulation/v1", knownFacts: [], assumptions: [`执行器：${executionAdapters.join(", ") || "未记录"}`, `模型边界发送：${providerCalls.length}`], causalSteps: candidates.flatMap((candidate) => candidate.causes), actorResponses: [], conflicts: [], unknowns: ["候选尚未采纳。"], candidates },
    // Preserve the execution identity saved with each dispatch.  An adapter
    // name is not a Provider profile and current settings must not be used to
    // guess what an historical Run used.
    provider: {
      profileId: providerProfiles.length === 1 ? providerProfiles[0].profileId : null,
      profiles: providerProfiles,
      calls: providerCalls
    }
  };
}

function requireRun(workspacePath, runId) {
  const run = readNuwaN1Run(workspacePath, runId);
  if (!run) throw failure("女娲 N1 Run 不存在。", 404);
  return run;
}

function requiredText(value, label, maximum) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum || /\0/u.test(value)) throw failure(`${label}无效。`, 400);
  return value.trim();
}

function requiredIds(value, label) {
  if (!Array.isArray(value) || !value.length || value.length > 6 || value.some((item) => typeof item !== "string" || !item)) throw failure(`${label}无效。`, 400);
  return [...new Set(value)];
}

function operation(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{0,159}$/iu.test(value)) throw failure("操作身份无效。", 400);
  return value;
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw failure("运行修订无效。", 400);
  return value;
}

function failure(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex").slice(0, 32);
}

function safeMessage(cause) {
  return cause instanceof Error ? cause.message : String(cause || "未知错误");
}

function errorStatus(cause) {
  return Number.isSafeInteger(cause?.statusCode) && cause.statusCode >= 400 && cause.statusCode < 600 ? cause.statusCode : 409;
}
