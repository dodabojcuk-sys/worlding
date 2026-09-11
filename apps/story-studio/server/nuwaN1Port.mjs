import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
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
  recordNuwaN1ProviderPreflightFailure,
  recordNuwaN1ProviderReservation,
  readLatestNuwaRun,
  readNuwaN1Run,
  resolveNuwaN1ProviderDispatch,
  resumeNuwaN1Run,
  startNuwaN1Run
} from "../../../src/storyIntelligence/index.ts";
import { buildEventStoryCrossingKnowledgeProjection } from "../../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import {
  invalidateCharacterMemoriesByRun,
  listRecallableCharacterMemories,
  synchronizeCharacterHeardMemories
} from "../../../src/storyContinuity/index.ts";

const VERSION = "tianyan-nuwa-n1-port/v1";
const FAKE_ADAPTER_ID = "local-n1-tool-roundtrip-fake/v1";
const AUTO_APPLICATION_RECEIPT_VERSION = "tianyan-nuwa-n1-auto-application/v1";

/**
 * Server-side bridge for the N1 author surface.  The RunPack and N1 runtime
 * remain the lifecycle owner; this module only resolves stable project refs,
 * supplies a replaceable execution adapter, and hands candidates to the
 * existing AuthorControl review owner.
 */
export function createNuwaN1Port({ operations, authorControl, continuityRootPath, continuityAgentId = "agent.nuwa", actionPermissionBroker = null, relationOperations = null, creationSourceSelectionPort = null, autoApplicationFaultInjector = null, fakeProviderAllowed = false, fakeStepDelayMs = 0, piAdapterFactory = null, sourceIdentityForProject = () => null, now = () => new Date().toISOString() }) {
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
    const storyUnits = operations.listStoryUnits({ projectId })
      .filter((item) => item.lifecycle !== "archived")
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    return {
      version: VERSION,
      availability: availability(),
      participants: operations.listWorldObjects({ projectId, type: "character" })
        .filter((item) => item.status !== "archived")
        .map((item) => ({ id: item.id, title: item.title, revision: item.revisionToken })),
      storyUnits: storyUnits.map((item) => ({ id: item.id, title: item.title, revision: item.version })),
      storylines: resolveStorylines(storyUnits),
      relationTypes: relationOperations?.listRelationTypes({ projectId }).types
        .filter((item) => item.lifecycle === "active")
        .map((item) => ({ id: item.relationTypeId, title: item.label, revision: item.typeRevision })) ?? [],
      latestRunId: latest?.run.runId ?? null
    };
  }

  async function setup(input, frozenSourceIdentity = sourceIdentityForProject(input.projectId, input.workVersionId ?? null)) {
    const project = requireProject(input.projectId);
    const scope = resolveScope(input.projectId, input.scope, input.storyUnit);
    const scene = scope.scenes[0];
    const actors = await resolveActors(input.projectId, input.participants, scene, frozenSourceIdentity);
    const goal = requiredText(input.goal, "局部目标", 1_000);
    const previewRun = { runId: `nuwa-n1-preview.${createHash("sha256").update(`${project.id}:${scene.storyUnit.id}:${goal}`).digest("hex").slice(0, 20)}`, actors, scene, scope, authorGoal: goal, steps: [], providerDispatches: 0, pendingCue: null };
    return {
      version: VERSION,
      availability: availability(),
      setup: {
        projectId: project.id,
        participants: actors.map((actor) => ({ id: actor.character.id, title: actor.displayName, revision: actor.character.revision, localGoal: actor.localGoal })),
        storyUnit: { id: scene.storyUnit.id, title: scene.label, revision: scene.storyUnit.revision },
        scope: presentScope(scope),
        goal,
        contextPreview: actors.map((actor) => {
          const context = compileNuwaN1Context(previewRun, actor, `nuwa-n1.preview.${createHash("sha256").update(`${project.id}:${actor.character.id}:${goal}`).digest("hex").slice(0, 24)}`);
          return {
            actorId: actor.character.id,
            localGoal: context.localGoal,
            coreSummary: context.coreSummary,
            profileBasis: context.profileBasis,
            attention: context.attention,
            evidenceRefs: [...context.knownFacts.map((fact) => fact.sourceId), ...context.beliefs.map((belief) => belief.sourceId)],
            knowledgeItems: context.knownFacts.map((fact) => ({ id: fact.factId, summary: fact.summary, visibility: fact.visibility })),
            beliefItems: context.beliefs.map((belief) => ({ id: belief.beliefId, summary: belief.summary, stance: belief.stance })),
            memoryItems: context.knownFacts.filter((fact) => fact.memorySource).map((fact) => ({ id: fact.factId, summary: fact.summary, source: fact.memorySource })),
            excludedCount: actor.unknownFactIds.length
          };
        })
      }
    };
  }

  async function create(input) {
    requireExecutionAvailability();
    const sourceIdentity = sourceIdentityForProject(input.projectId, input.workVersionId ?? null);
    const prepared = await setup(input, sourceIdentity);
    if (actionPermissionBroker?.read(input.projectId).profile === "full-access" && prepared.setup.scope.scenes.length !== 1) {
      throw failure("当前正式自动应用只覆盖一个已验证的故事单元；连续范围仍可用普通候选排演，避免把未实现的跨单元写入伪装为已授权。", 409);
    }
    if (actionPermissionBroker?.read(input.projectId).profile === "full-access" && (!["root", "derived"].includes(sourceIdentity?.kind) || !Number.isSafeInteger(Number(sourceIdentity?.revision)))) {
      throw failure("女娲高权限排演必须先绑定当前正式主版本或 IF 版本；未建立版本时不会建立 Run 或授权。", 409);
    }
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
      ensureFullAccessAuthorization(input.projectId, plan.runId, prepared, relationType, operationId);
      return read(input.projectId, plan.runId);
    }
    createNuwaN1Run({
      workspacePath: workspace,
      runId: plan.runId,
      sourceSnapshotHash: snapshot.snapshotHash,
      sourceIdentity,
      scene: prepared.setup.scope.scenes[0],
      scope: prepared.setup.scope,
      authorGoal: prepared.setup.goal,
      // The frozen scope, rather than the legacy convenience field in the
      // request, is the authority for every source-dependent actor lookup.
      actors: await resolveActors(input.projectId, input.participants, prepared.setup.scope.scenes[0], sourceIdentity),
      operationId,
      now: now()
    });
    // Starting a Run is the one explicit author action that can establish a
    // high-permission scope.  The server derives every target from validated
    // project objects; the browser and model never submit an authorization id.
    ensureFullAccessAuthorization(input.projectId, plan.runId, prepared, relationType, operationId);
    return read(input.projectId, plan.runId);
  }

  function ensureFullAccessAuthorization(projectId, runId, prepared, relationType, operationId) {
    if (actionPermissionBroker?.read(projectId).profile !== "full-access") return;
    const sourceIdentity = requireRun(workspacePath(projectId), runId).sourceIdentity;
    if (!(["root", "derived"].includes(sourceIdentity?.kind) && Number.isSafeInteger(Number(sourceIdentity.revision)))) {
      throw failure("这份排演没有冻结正式作品版本身份；已拒绝补发高权限授权。", 409);
    }
    const expectedActorIds = prepared.setup.participants.map((actor) => actor.id);
    const authorization = actionPermissionBroker.grantNuwaFullAccess({
      projectId,
      runId,
      storyUnitId: prepared.setup.storyUnit.id,
      storyUnitRevision: prepared.setup.storyUnit.revision,
      actorIds: expectedActorIds,
      relationTypeId: relationType?.relationTypeId ?? null,
      relationTypeRevision: relationType?.typeRevision ?? null,
      sourceOperationId: operationId,
      maxSteps: 6,
      maxProviderDispatches: 12
    });
    const sameActors = authorization.actorIds.length === expectedActorIds.length && expectedActorIds.every((actorId) => authorization.actorIds.includes(actorId));
    if (authorization.runId !== runId || authorization.storyUnitId !== prepared.setup.storyUnit.id || authorization.storyUnitRevision !== prepared.setup.storyUnit.revision || authorization.relationTypeId !== (relationType?.relationTypeId ?? null) || authorization.relationTypeRevision !== (relationType?.typeRevision ?? null) || !sameActors) {
      throw failure("已有女娲范围授权与这次启动的稳定目标不一致；已拒绝重用。", 409);
    }
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
      await synchronizeCharacterHeardMemories(continuityContext(input.projectId), next);
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
        application: { permissionReceiptId: null, impactPermissionReceiptId: null, candidate: null, review: null, planningEventId: null, impactReviewId: null, changeSetId: null, eventId: null, storyUnitLinkedVersion: null, narrativePlacementIds: [], materialObjectId: null, relationId: null, worldStateChanges: [], workVersionReceiptId: null, resultVersion: null, fixedDraft: null, rollback: null },
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
    const expiresAt = authorization?.expiresAt ? Date.parse(authorization.expiresAt) : null;
    const authorizationExpired = expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.parse(now()));
    if (!authorization || authorizationExpired || authorization.storyUnitId !== current.scene.storyUnit.id || authorization.storyUnitRevision !== current.scene.storyUnit.revision || authorization.actorIds.length !== current.actors.length || authorization.actorIds.some((id) => !current.actors.some((actor) => actor.character.id === id))) {
      throw failure("当前女娲 Run 没有有效的高权限范围授权；结果仍可送入待确认。", 403);
    }
    const storyUnit = operations.readStoryUnit({ projectId: project.id, unitId: authorization.storyUnitId });
    if (!storyUnit || storyUnit.version !== (recoveredStoryUnitVersion || authorization.storyUnitRevision)) throw failure("目标故事单元已变化；没有执行任何正式写入。", 409);
    const sourceSelection = creationSourcePort();
    if (!current.sourceIdentity || !["root", "derived"].includes(current.sourceIdentity.kind) || !Number.isSafeInteger(Number(current.sourceIdentity.revision)) || !sourceSelection) {
      throw failure("本次排演缺少可验证的正式作品版本；没有执行任何正式写入。", 409);
    }
    const sourceVersion = sourceSelection.resolveWorkVersion(project.id, current.sourceIdentity.workVersionId);
    if (!sourceVersion || sourceVersion.identity.workVersionId !== current.sourceIdentity.workVersionId || sourceVersion.identity.currentRevision !== Number(current.sourceIdentity.revision)) {
      throw failure("排演来源版本已变化；没有执行任何正式写入。", 409);
    }
    if (sourceVersion.identity.kind === "derived") {
      throw failure("该 IF 已可排演并冻结 N4 状态，但正式 Event/Relation 仍未具备版本作用域；为避免改写主线，本次结果只能进入候选与 B1-C 融入审查。", 409);
    }
    const relationType = authorization.relationTypeId ? relationOperations?.resolveRelationType({ projectId: project.id, relationTypeId: authorization.relationTypeId }) : null;
    if (authorization.relationTypeId && (!relationType || relationType.lifecycle !== "active" || relationType.typeRevision !== authorization.relationTypeRevision)) throw failure("已授权的关系类型已变更或停用；已阻止本次自动关系写入。", 409);
    return { authorization, storyUnit, relationType, sourceVersion };
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
      const sourceSummary = selected.map((item) => [
        `## ${item.title}`,
        item.summary,
        item.speech ? `台词：${item.speech}` : null,
        item.action ? `行动：${item.action}` : null,
        `结果：${item.observedResult}`,
        `- 来源步骤：${item.sourceStepId}`
      ].filter(Boolean).join("\n\n")).join("\n\n");
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
        const changeSet = authorControl.createAuthorChangeSet({ projectId: project.id, reviewId: impact.id, workVersionId: current.sourceIdentity.workVersionId, decisionSource: "nuwa-scope-authorization", authorizationId: prepared.authorization.id });
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
      const previousPlacementIds = new Set(inserted.receipt.beforePlacementIds);
      application.narrativePlacementIds = inserted.receipt.afterPlacementIds.filter((placementId) => !previousPlacementIds.has(placementId));
      if (!application.narrativePlacementIds.length) throw failure("本批 NarrativePlacement 回执未记录新增项。", 409);
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
      const relationCandidate = relationOperations.createRelationCandidate({ projectId: project.id, workVersionId: current.sourceIdentity.workVersionId, relationId, sourceObjectId: application.eventId, targetObjectId: application.materialObjectId, relationTypeId: prepared.relationType.relationTypeId, relationLabelSnapshot: prepared.relationType.label, direction: "forward", actor: "nuwa", sourceRevision: current.sourceSnapshotHash, sourceRef: `nuwa-n1:${current.runId}:${receipt.receiptId}`, operationId: `${receipt.receiptId}.relation.candidate`, evidenceRefs: [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: project.id, eventId: application.eventId, revisionToken: event.revisionToken, state: "committed", requestedUse: "constraint" } }], now: now() });
      const relation = relationOperations.confirmRelationCandidate({ projectId: project.id, workVersionId: current.sourceIdentity.workVersionId, relationId: relationCandidate.relation.relationId, expectedRelationRevision: relationCandidate.relation.revision, operationId: `${receipt.receiptId}.relation.confirm`, actor: "nuwa", now: now() });
      application.relationId = relation.relation.relationId;
      persistAutoApplication(receipt);
    }
    if (!Array.isArray(application.worldStateChanges)) application.worldStateChanges = [];
    const eventForState = operations.readWorldObject({ projectId: project.id, objectId: application.eventId });
    for (const step of current.steps.filter((item) => selectedStepIds.includes(item.stepId))) {
      const command = step.action?.worldState;
      if (!command) continue;
      const commandKey = `${receipt.receiptId}.world-state.${step.stepId}`;
      if (application.worldStateChanges.some((change) => change.operationId === commandKey)) continue;
      if (!step.contextEvidenceRefs.some((ref) => ref.visibility === "world-state" && ref.id.startsWith(`world-state.${command.objectId}.`))) throw failure("女娲状态动作没有来自该角色已知状态的精确依据。", 409);
      const subject = operations.readWorldObject({ projectId: project.id, objectId: command.objectId });
      const value = command.kind === "passage"
        ? { kind: "passage", state: command.state }
        : { kind: "holder", state: command.state, holder: command.holderId == null ? null : (() => { const holder = operations.readWorldObject({ projectId: project.id, objectId: command.holderId }); return { id: holder.id, revision: holder.revisionToken }; })() };
      const earlierChange = application.worldStateChanges.find((change) => change.objectId === subject.id);
      if (earlierChange) {
        // Several selected steps may repeat the same already-authorized state
        // command.  They are evidence for the scene, not distinct mutations:
        // write it once so one batch always has a reversible state boundary.
        if (JSON.stringify(earlierChange.value) !== JSON.stringify(value)) {
          throw failure("同一自动应用批次对同一对象提出了冲突状态；未猜测写入。", 409);
        }
        continue;
      }
      const currentState = operations.readWorldStateN4({ projectId: project.id, objectId: subject.id, workVersionId: current.sourceIdentity.workVersionId, observedAt: now() });
      const appliedState = operations.applyWorldStateN4({ projectId: project.id, objectId: subject.id, workVersionId: current.sourceIdentity.workVersionId, expectedObjectRevision: subject.revisionToken, expectedRevision: currentState.history.length, operationId: commandKey, effectiveAt: now(), value, evidence: { kind: "confirmed-event", event: { id: eventForState.id, revision: eventForState.revisionToken } }, now: now() });
      application.worldStateChanges.push({ operationId: commandKey, sourceStepId: step.stepId, objectId: subject.id, changeId: appliedState.change.changeId, revision: appliedState.change.revision, value: appliedState.change.value });
      persistAutoApplication(receipt);
    }
    if (!application.workVersionReceiptId) {
      const result = creationSourcePort().appendTargetWorkVersionRevision(project.id, { workVersionId: current.sourceIdentity.workVersionId, expectedRevision: Number(current.sourceIdentity.revision), expectedManifestDigest: prepared.sourceVersion.manifest.canonicalDigest, authorActionId: `${receipt.receiptId}.author`, idempotencyKey: `${receipt.receiptId}.result-version`, createdAt: now(), semanticDeltaRefs: [`nuwa-run:${current.runId}`, `changeset:${application.changeSetId}`, `event:${application.eventId}`, `narrative-placement:${application.narrativePlacementIds.join(",")}`, `material:${application.materialObjectId}`, ...(application.relationId ? [`relation:${application.relationId}`] : []), ...application.worldStateChanges.map((change) => `world-state:${change.objectId}:${change.changeId}`)] });
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
    return { ...read(projectId, current.runId), candidate: application.candidate, review: application.review, automaticApplication: presentAutomaticApplication(receipt) };
  }

  function presentAutomaticApplication(receipt) {
    const application = receipt.application;
    return { status: application.rollback?.status === "active" ? "rolled-back" : receipt.status === "active" ? "applied" : "recovery-required", decisionSource: "nuwa-scope-authorization", receiptId: receipt.receiptId, authorizationId: receipt.authorizationId, permissionReceiptId: application.permissionReceiptId, planningEventId: application.planningEventId, impactReviewId: application.impactReviewId, changeSetId: application.changeSetId, eventId: application.eventId, storyUnitId: receipt.storyUnitId, storyUnitVersion: application.storyUnitLinkedVersion, narrativePlacementIds: application.narrativePlacementIds, materialObjectId: application.materialObjectId, relationId: application.relationId, relationStatus: receipt.relationTypeId ? (application.relationId ? "confirmed" : "recovery-required") : "not-configured", worldStateChanges: application.worldStateChanges ?? [], workVersionReceiptId: application.workVersionReceiptId, resultVersion: application.resultVersion, sourceSnapshotHash: receipt.sourceSnapshotHash, fixedDraft: application.fixedDraft ?? null, rollback: application.rollback ?? null };
  }

  async function freezeAutoApplicationDraft(input) {
    const project = requireProject(input.projectId);
    const current = requireRun(workspacePath(project.id), input.runId);
    const receipt = requireAutoApplicationReceipt(project.id, current.runId, input.receiptId);
    const application = receipt.application;
    if (receipt.status !== "active" || !application.eventId || !application.resultVersion) throw failure("这份自动应用尚未完成，不能建立固定稿。", 409);
    const operationId = operation(input.operationId);
    const source = creationSourcePort();
    const root = source?.resolveRootWorkVersion(project.id);
    if (!root || root.identity.workVersionId !== application.resultVersion.workVersionId || root.identity.currentRevision !== application.resultVersion.revision) throw failure("正式故事版本已经变化；不能把当前内容标为这份自动应用的固定稿。", 409);
    if (application.fixedDraft) {
      if (application.fixedDraft.operationId !== operationId) return presentAutoApplication(project.id, current, receipt);
      return presentAutoApplication(project.id, current, receipt);
    }
    const creationKey = `${receipt.receiptId}.fixed-draft`;
    const artifact = await source.createOrOpenOutputArtifact(project.id, {
      workVersionId: application.resultVersion.workVersionId,
      storyUnitId: receipt.storyUnitId,
      eventIds: [application.eventId],
      creationKey,
      title: `${current.scene.label} · 女娲固定稿`
    });
    application.fixedDraft = {
      artifactId: artifact.id,
      sourceVersion: application.resultVersion,
      creationKey,
      operationId,
      createdAt: now()
    };
    persistAutoApplication(receipt);
    return presentAutoApplication(project.id, current, receipt);
  }

  /**
   * Compensation is deliberately an independent, durable operation. It never
   * changes the Run outcome: the Run remains historical evidence while the
   * formal Owners record a later reversal and a new WorkVersion revision.
   */
  async function rollbackAutoApplication(input) {
    const project = requireProject(input.projectId);
    const current = requireRun(workspacePath(project.id), input.runId);
    const receipt = requireAutoApplicationReceipt(project.id, current.runId, input.receiptId);
    const application = receipt.application;
    if (receipt.status !== "active" || !application.eventId || !application.resultVersion) throw failure("这份自动应用尚未完成，不能回溯。", 409);
    const operationId = operation(input.operationId);
    const inputHash = digest({ projectId: project.id, runId: current.runId, receiptId: receipt.receiptId, operationId });
    let rollback = application.rollback;
    if (rollback) {
      if (rollback.inputHash !== inputHash) throw failure("同一回溯操作键已绑定不同内容；已拒绝重放。", 409);
      if (rollback.status === "active") {
        await invalidateCharacterMemoriesByRun(continuityContext(project.id), { runId: current.runId, invalidatedAt: rollback.updatedAt, operationId: `nuwa-memory-rollback.${digest(rollback.operationId)}` });
        return presentAutoApplication(project.id, current, receipt);
      }
    } else {
      rollback = { operationId, inputHash, status: "applying", preflight: null, relation: null, arrangement: null, storyUnit: null, material: null, compensation: null, worldStateChanges: [], workVersionReceiptId: null, resultVersion: null, failure: null, recordedAt: now(), updatedAt: now() };
      application.rollback = rollback;
      persistAutoApplication(receipt);
    }
    try {
      if (!rollback.preflight) {
        const source = creationSourcePort();
        const root = source?.resolveRootWorkVersion(project.id);
        if (!root || root.identity.workVersionId !== application.resultVersion.workVersionId || root.identity.currentRevision !== application.resultVersion.revision) throw failure("故事版本已有后续修改；为保护作者内容，未开始回溯。", 409);
        const storyUnit = operations.readStoryUnit({ projectId: project.id, unitId: receipt.storyUnitId });
        if (!storyUnit || !storyUnit.linkedEntityIds.includes(application.eventId)) throw failure("目标故事单元已不再保有本批 Event；未猜测回溯范围。", 409);
        const arrangement = operations.readNarrativeArrangement({ projectId: project.id, workVersionId: application.resultVersion.workVersionId, narrativePathId: receipt.storyUnitId });
        const insertReceipt = arrangement.arrangement?.receipts?.find((item) => item.operationId === `${receipt.receiptId}.arrangement.insert`) ?? null;
        if (!arrangement.arrangement || !insertReceipt || !application.narrativePlacementIds.every((id) => insertReceipt.afterPlacementIds.includes(id))) throw failure("本批 NarrativePlacement 回执不完整；未开始回溯。", 409);
        const relation = application.relationId ? relationOperations?.readRelation({ projectId: project.id, workVersionId: application.resultVersion.workVersionId, relationId: application.relationId }).relation : null;
        if (application.relationId && (!relation || relation.archived || relation.reviewState !== "confirmed")) throw failure("本批 Relation 已变化；未开始回溯。", 409);
        const material = operations.readWorldObject({ projectId: project.id, objectId: application.materialObjectId });
        if (!material || material.status === "archived") throw failure("本批资料已变化；未开始回溯。", 409);
        const worldState = Object.values((application.worldStateChanges ?? []).reduce((byObject, change) => {
          (byObject[change.objectId] ||= []).push(change);
          return byObject;
        }, {})).map((changes) => {
          const lastChange = changes.at(-1);
          if (!lastChange) throw failure("本批对象状态回执为空；未开始回溯。", 409);
          const projection = operations.readWorldStateN4({ projectId: project.id, objectId: lastChange.objectId, workVersionId: application.resultVersion.workVersionId, observedAt: now() });
          const recordedIds = changes.map((change) => change.changeId);
          const tailIds = projection.history.slice(-recordedIds.length).map((change) => change.changeId);
          if (tailIds.length !== recordedIds.length || tailIds.some((changeId, index) => changeId !== recordedIds[index])) throw failure("本批对象状态已有后续作者修改；为保护新状态，未开始回溯。", 409);
          return { objectId: lastChange.objectId, changes: changes.map((change) => ({ changeId: change.changeId, revision: change.revision })) };
        });
        rollback.preflight = {
          baseVersion: application.resultVersion,
          storyUnitVersion: storyUnit.version,
          relationRevision: relation?.revision ?? null,
          materialRevision: material.revisionToken,
          arrangementRevision: arrangement.arrangement.currentRevision,
          arrangementOwnerVersion: arrangement.ownerVersion,
          arrangementTargetRevision: insertReceipt.beforeRevision,
          worldState
        };
        persistAutoApplication(receipt);
      }
      const preflight = rollback.preflight;
      const root = creationSourcePort().resolveRootWorkVersion(project.id);
      if (!root || root.identity.workVersionId !== preflight.baseVersion.workVersionId || root.identity.currentRevision !== preflight.baseVersion.revision) throw failure("回溯期间故事版本已继续前进；已停止，未覆盖后续内容。", 409);
      if (application.relationId && !rollback.relation) {
        const relation = relationOperations.readRelation({ projectId: project.id, workVersionId: application.resultVersion.workVersionId, relationId: application.relationId }).relation;
        if (!relation || relation.revision !== preflight.relationRevision || relation.archived) throw failure("Relation 版本已变化；已停止回溯。", 409);
        autoApplicationFaultInjector?.({ phase: "before-rollback-relation", receiptId: receipt.receiptId, projectId: project.id, runId: current.runId });
        const archived = relationOperations.archiveConfirmedRelation({ projectId: project.id, workVersionId: application.resultVersion.workVersionId, relationId: application.relationId, expectedRelationRevision: relation.revision, operationId: `${rollback.operationId}.relation-archive`, actor: "nuwa", now: now() });
        rollback.relation = { relationId: application.relationId, receiptId: archived.receipt?.receiptId ?? null, revision: archived.relation?.revision ?? null };
        persistAutoApplication(receipt);
      }
      if (!rollback.arrangement) {
        const arrangement = operations.readNarrativeArrangement({ projectId: project.id, workVersionId: preflight.baseVersion.workVersionId, narrativePathId: receipt.storyUnitId });
        if (!arrangement.arrangement || arrangement.arrangement.currentRevision !== preflight.arrangementRevision || arrangement.ownerVersion !== preflight.arrangementOwnerVersion) throw failure("NarrativePlacement 已变化；已停止回溯。", 409);
        const rolled = operations.rollbackNarrativeArrangement({ projectId: project.id, workVersionId: preflight.baseVersion.workVersionId, narrativePathId: receipt.storyUnitId, expectedOwnerVersion: arrangement.ownerVersion, expectedRevision: arrangement.arrangement.currentRevision, operationId: `${rollback.operationId}.arrangement-rollback`, authorActionId: `${rollback.operationId}.author.arrangement-rollback`, sourceKind: "author-action", sourceRef: `nuwa-n1-rollback:${receipt.receiptId}`, createdAt: now(), targetRevision: preflight.arrangementTargetRevision });
        if (rolled.conflict || !rolled.receipt) throw failure(`NarrativePlacement 回溯冲突：${rolled.code}`, 409);
        rollback.arrangement = { receiptId: rolled.receipt.receiptId, revision: rolled.arrangement?.currentRevision ?? null, ownerVersion: rolled.ownerVersion };
        persistAutoApplication(receipt);
      }
      if (!rollback.storyUnit) {
        const storyUnit = operations.readStoryUnit({ projectId: project.id, unitId: receipt.storyUnitId });
        if (!storyUnit.linkedEntityIds.includes(application.eventId)) throw failure("正式 Event 已不在目标故事单元；已停止回溯。", 409);
        const updated = operations.updateStoryUnit({ projectId: project.id, unitId: storyUnit.id, expectedVersion: storyUnit.version, linkedEntityIds: storyUnit.linkedEntityIds.filter((id) => id !== application.eventId) });
        if (updated.conflict) throw failure("故事单元版本冲突；已停止回溯。", 409);
        rollback.storyUnit = { unitId: storyUnit.id, version: updated.unit.version, removedEventId: application.eventId };
        persistAutoApplication(receipt);
      }
      if (!rollback.material) {
        const material = operations.readWorldObject({ projectId: project.id, objectId: application.materialObjectId });
        if (material.status === "archived") throw failure("本批资料已由其他操作归档；已停止回溯。", 409);
        const archived = operations.archiveWorldObject({ projectId: project.id, objectId: material.id, expectedHash: material.revisionToken });
        rollback.material = { objectId: material.id, revisionToken: archived.revisionToken };
        persistAutoApplication(receipt);
      }
      if (!rollback.compensation) {
        const rollbackTag = `nuwa-auto-rollback:${receipt.receiptId}`;
        const existing = operations.listWorldObjects({ projectId: project.id, type: "event" })
          .filter((item) => item.status === "planned" && item.tags.includes(rollbackTag))
          .map((item) => operations.readWorldObject({ projectId: project.id, objectId: item.id }))[0] ?? null;
        const planning = existing || operations.createPlanningEvent({ projectId: project.id, title: `回溯：${current.scene.label}`, tags: ["女娲自动回溯", rollbackTag], body: `# 回溯：${current.scene.label}\n\n该补偿 Event 撤回自动应用 ${receipt.receiptId} 的当前正式效果；原始 Run、Event 与 heard 历史仍保留可查。\n\n- 自动应用回执：${receipt.receiptId}\n- 原 Event：${application.eventId}\n- 原版本：${preflight.baseVersion.workVersionId}@r${preflight.baseVersion.revision}\n` });
        let impact = authorControl.createPlanningEventImpactReview({ projectId: project.id, planningEventId: planning.id });
        if (impact.status === "pending") {
          const option = impact.options[0];
          if (!option) throw failure("回溯补偿缺少可用的影响路径。", 409);
          impact = authorControl.chooseImpactRoute({ projectId: project.id, reviewId: impact.id, optionId: option.id, action: "adopt" });
        }
        if (impact.status !== "selected") throw failure("回溯补偿没有形成可写入的路线。", 409);
        const changeSet = authorControl.createAuthorChangeSet({ projectId: project.id, reviewId: impact.id, decisionSource: "nuwa-scope-authorization", authorizationId: receipt.authorizationId });
        const applied = authorControl.applyAuthorChangeSet({ projectId: project.id, changeSetId: changeSet.id });
        rollback.compensation = { planningEventId: planning.id, impactReviewId: impact.id, changeSetId: changeSet.id, eventId: applied.application.appliedEventId };
        persistAutoApplication(receipt);
      }
      if (!Array.isArray(rollback.worldStateChanges)) rollback.worldStateChanges = [];
      for (const state of preflight.worldState ?? []) {
        for (const original of [...state.changes].reverse()) {
          if (rollback.worldStateChanges.some((change) => change.objectId === state.objectId && change.compensatesChangeId === original.changeId)) continue;
          const current = operations.readWorldObject({ projectId: project.id, objectId: state.objectId });
          const currentState = operations.readWorldStateN4({ projectId: project.id, objectId: state.objectId, workVersionId: preflight.baseVersion.workVersionId, observedAt: now() });
          const compensatedInThisRollback = rollback.worldStateChanges.some((change) => change.objectId === state.objectId && change.changeId === currentState.change?.changeId);
          if (!currentState.change || (currentState.change.changeId !== original.changeId && !compensatedInThisRollback)) throw failure("对象状态版本已变化；已停止回溯以保护后续作者修改。", 409);
          const compensated = operations.compensateWorldStateN4({ projectId: project.id, objectId: state.objectId, workVersionId: preflight.baseVersion.workVersionId, expectedObjectRevision: current.revisionToken, expectedRevision: currentState.history.length, operationId: `${rollback.operationId}.world-state.${original.changeId}`, compensatesChangeId: original.changeId, effectiveAt: now(), evidence: { kind: "confirmed-event", event: { id: rollback.compensation.eventId, revision: operations.readWorldObject({ projectId: project.id, objectId: rollback.compensation.eventId }).revisionToken } }, now: now() });
          rollback.worldStateChanges.push({ objectId: state.objectId, changeId: compensated.change.changeId, compensatesChangeId: original.changeId, revision: compensated.change.revision });
          persistAutoApplication(receipt);
        }
      }
      if (!rollback.workVersionReceiptId) {
        const version = creationSourcePort().appendStructuredStoryRevision(project.id, { expectedRevision: preflight.baseVersion.revision, authorActionId: `${rollback.operationId}.author`, idempotencyKey: `${rollback.operationId}.result-version`, createdAt: now(), semanticDeltaRefs: [`compensation-of:${receipt.receiptId}`, `event:${rollback.compensation.eventId}`, `archived-material:${application.materialObjectId}`, ...(application.relationId ? [`archived-relation:${application.relationId}`] : []), ...rollback.worldStateChanges.map((change) => `compensated-world-state:${change.objectId}:${change.compensatesChangeId}`), `rolled-back-placement:${application.narrativePlacementIds.join(",")}`] });
        rollback.workVersionReceiptId = version.receipt.receiptId;
        rollback.resultVersion = { workVersionId: version.identity.workVersionId, revision: version.identity.currentRevision };
        persistAutoApplication(receipt);
      }
      rollback.status = "active";
      rollback.failure = null;
      persistAutoApplication(receipt);
      await invalidateCharacterMemoriesByRun(continuityContext(project.id), { runId: current.runId, invalidatedAt: receipt.updatedAt, operationId: `nuwa-memory-rollback.${digest(rollback.operationId)}` });
      return presentAutoApplication(project.id, current, receipt);
    } catch (cause) {
      rollback.status = "recovery-required";
      rollback.failure = safeMessage(cause);
      persistAutoApplication(receipt);
      throw failure(`回溯未完整结束；已保留可恢复回执 ${receipt.receiptId}。${rollback.failure}`, errorStatus(cause));
    }
  }

  function autoApplicationReceiptPath(projectId, receiptId) { return path.join(workspacePath(projectId), ".world-os", "workspace", "nuwa-n1-auto-applications", `${receiptId}.json`); }
  function continuousStepOperation(baseOperationId, sequence, expectedRevision) { return `${baseOperationId}.step.${sequence}.r${expectedRevision}`; }
  function creationSourcePort() { return typeof creationSourceSelectionPort === "function" ? creationSourceSelectionPort() : creationSourceSelectionPort; }
  function autoApplicationReceiptId(operationId) { return `nuwa-n1-auto-application.${digest(operationId)}`; }
  function readAutoApplicationReceipt(projectId, receiptId) { const target = autoApplicationReceiptPath(projectId, receiptId); return existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : null; }
  function latestAutoApplicationReceipt(projectId, runId) {
    const directory = path.dirname(autoApplicationReceiptPath(projectId, "placeholder"));
    if (!existsSync(directory)) return null;
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readAutoApplicationReceipt(projectId, entry.name.slice(0, -5)))
      .filter((receipt) => receipt?.runId === runId && receipt.application?.eventId)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] ?? null;
  }
  function requireAutoApplicationReceipt(projectId, runId, receiptId) { const receipt = readAutoApplicationReceipt(projectId, requiredText(receiptId, "自动应用回执", 240)); if (!receipt || receipt.projectId !== projectId || receipt.runId !== runId) throw failure("自动应用回执不存在或不属于当前 Run。", 404); return receipt; }
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
    const automaticReceipt = latestAutoApplicationReceipt(projectId, run.runId);
    return {
      version: VERSION,
      availability: availability(),
      authorization: actionPermissionBroker?.read(projectId).nuwaAuthorizations.find((authorization) => authorization.runId === run.runId) ?? null,
      run: {
        runId: run.runId,
        status: run.lifecycle,
        revision: run.revision,
        scene: { storyUnitId: run.scene.storyUnit.id, label: run.scene.label, observedAt: run.scene.observedAt },
        scope: presentScope(run.scope),
        participants: run.actors.map((item) => ({ id: item.character.id, title: item.displayName, revision: item.character.revision, localGoal: item.localGoal })),
        goal: run.authorGoal,
        steps: run.steps.map((step) => ({ stepId: step.stepId, sequence: step.sequence, actorId: step.actor.id, scene: { storyUnitId: step.scene.storyUnit.id, label: step.scene.label, observedAt: step.scene.observedAt }, intent: step.intent, speech: step.speech, action: step.action, observableResult: step.observableResult, heardStatements: step.heardStatements, contextEvidenceRefs: step.contextEvidenceRefs, tool: { name: "read_role_context", requestId: step.toolRequestId }, execution: step.execution, contextHash: step.contextHash, usage: step.usage, committedAt: step.committedAt })),
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
            localGoal: context.localGoal,
            coreSummary: context.coreSummary,
            profileBasis: context.profileBasis,
            attention: context.attention,
            evidenceRefs: [
              ...context.knownFacts.map((fact) => ({ id: fact.sourceId, revision: fact.sourceRevision, visibility: fact.visibility })),
              ...context.beliefs.map((belief) => ({ id: belief.sourceId, revision: belief.sourceRevision, visibility: belief.stance }))
            ],
            knowledgeItems: context.knownFacts.map((fact) => ({ id: fact.factId, summary: fact.summary, visibility: fact.visibility, sourceId: fact.sourceId, sourceRevision: fact.sourceRevision })),
            beliefItems: context.beliefs.map((belief) => ({ id: belief.beliefId, summary: belief.summary, stance: belief.stance, sourceId: belief.sourceId, sourceRevision: belief.sourceRevision })),
            memoryItems: actor.knownFacts.filter((fact) => fact.memorySource).map((fact) => ({
              id: fact.factId,
              summary: fact.summary,
              source: fact.memorySource,
              selectedByAttention: context.attention.selected.some((item) => item.key === `knowledge:${fact.factId}`)
            })),
            excludedCount: actor.unknownFactIds.length
          };
        })
      },
      receipts: run.receipts,
      ...(automaticReceipt ? { automaticApplication: presentAutomaticApplication(automaticReceipt) } : {})
    };
  }

  function resolveScene(projectId, ref) {
    const unitId = ref?.id;
    const unit = operations.readStoryUnit({ projectId, unitId });
    if (unit.version !== ref?.revision) throw failure("故事单元已变更，请重新选择。", 409);
    return { storyUnit: { id: unit.id, revision: unit.version }, sceneRef: { id: unit.id, revision: unit.version }, observedAt: now(), label: unit.title };
  }

  /**
   * Story Units already carry the formal ordering and branch structure.  This
   * is a read projection for the Nuwa chooser, not a new Storyline owner.
   */
  function resolveStorylines(units) {
    const primary = units.filter((unit) => unit.kind === "main");
    const branches = units.filter((unit) => unit.kind === "branch");
    return [
      ...(primary.length ? [{ key: "primary", title: "主线", units: primary.map(presentUnit) }] : []),
      ...branches.map((unit) => ({ key: `branch.${unit.id}`, title: `分支 · ${unit.title}`, units: [presentUnit(unit)] }))
    ];
  }

  function resolveScope(projectId, requested, legacyStoryUnit) {
    const units = operations.listStoryUnits({ projectId })
      .filter((unit) => unit.lifecycle !== "archived")
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    const storylines = resolveStorylines(units);
    const legacy = legacyStoryUnit?.id ? { storylineKey: "primary", startStoryUnitId: legacyStoryUnit.id, endStoryUnitId: legacyStoryUnit.id, mode: "bounded" } : null;
    const input = requested || legacy;
    if (!input || typeof input !== "object") throw failure("请选择女娲要推演的事件线与开始单元。", 400);
    const storylineKey = requiredText(input.storylineKey, "事件线", 160);
    const storyline = storylines.find((item) => item.key === storylineKey);
    if (!storyline) throw failure("所选事件线已不可用，请刷新后重新选择。", 409);
    const startStoryUnitId = requiredText(input.startStoryUnitId, "开始单元", 180);
    const startIndex = storyline.units.findIndex((unit) => unit.id === startStoryUnitId);
    if (startIndex < 0) throw failure("开始单元不属于所选事件线。", 409);
    const mode = input.mode === "continuous" ? "continuous" : input.mode === "bounded" ? "bounded" : null;
    if (!mode) throw failure("女娲范围模式无效。", 400);
    const endStoryUnitId = input.endStoryUnitId == null || input.endStoryUnitId === "" ? null : requiredText(input.endStoryUnitId, "结束单元", 180);
    if (mode === "bounded" && !endStoryUnitId) throw failure("请选择结束单元，或改为持续推演。", 400);
    const endIndex = mode === "continuous"
      ? Math.min(storyline.units.length - 1, startIndex + 2)
      : storyline.units.findIndex((unit) => unit.id === endStoryUnitId);
    if (endIndex < startIndex) throw failure("结束单元必须位于开始单元之后。", 409);
    if (mode === "bounded" && endIndex < 0) throw failure("结束单元不属于所选事件线。", 409);
    const selected = storyline.units.slice(startIndex, endIndex + 1);
    if (!selected.length || selected.length > 3) throw failure("N1 单次排演最多覆盖 3 个连续单元；请缩小范围后继续。", 409);
    return {
      version: "tianyan-nuwa-n1-scope/v1",
      mode,
      storylineKey: storyline.key,
      storylineLabel: storyline.title,
      scenes: selected.map((unit) => resolveScene(projectId, unit)),
      currentSceneIndex: 0
    };
  }

  function presentUnit(unit) { return { id: unit.id, title: unit.title, revision: unit.version }; }
  function presentScope(scope) {
    return {
      version: scope.version,
      mode: scope.mode,
      storylineKey: scope.storylineKey,
      storylineLabel: scope.storylineLabel,
      currentSceneIndex: scope.currentSceneIndex,
      scenes: scope.scenes.map((scene) => ({ storyUnit: { ...scene.storyUnit }, sceneRef: { ...scene.sceneRef }, observedAt: scene.observedAt, label: scene.label }))
    };
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

  async function resolveActors(projectId, refs, scene, sourceIdentity) {
    if (!Array.isArray(refs) || refs.length < 2 || refs.length > 3) throw failure("女娲 N1 需要选择两到三个正式角色。", 400);
    const seen = new Set();
    // RunPack needs a stable synthetic identity for a candidate-only project,
    // but that string is not a WorkVersion Authority identity.  Normalize at
    // every formal Owner boundary instead of making an unversioned Run look
    // like a root or IF version.
    const ownerWorkVersionId = ["root", "derived"].includes(sourceIdentity?.kind)
      ? sourceIdentity.workVersionId
      : null;
    const linkedEntityIds = new Set(operations.readStoryUnit({ projectId, unitId: scene.storyUnit.id }).linkedEntityIds);
    const verifiedEventIds = new Set(authorControl.listVerifiedCanonEventIds({
      projectId,
      // An IF Run may read its own formal Event results, but never a sibling
      // or mainline Run merely because the Event Owner is shared.
      workVersionId: ownerWorkVersionId
    }));
    const sceneEvidence = operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status !== "archived" && linkedEntityIds.has(item.id) && verifiedEventIds.has(item.id))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }));
    const formalCharacters = operations.listWorldObjects({ projectId, type: "character" })
      .filter((item) => item.status !== "archived")
      .map((item) => ({ id: item.id, label: item.title, revisionToken: item.revisionToken }));
    return Promise.all(refs.map(async (ref) => {
      if (!ref || typeof ref.id !== "string" || seen.has(ref.id)) throw failure("角色必须使用不同的稳定身份。", 400);
      seen.add(ref.id);
      const summary = operations.listWorldObjects({ projectId, type: "character" }).find((item) => item.id === ref.id && item.status !== "archived");
      if (!summary || summary.revisionToken !== ref.revision) throw failure("角色不存在、已归档或版本已变更。", 409);
      const character = operations.readWorldObject({ projectId, objectId: summary.id });
      if (character.type !== "character" || character.revisionToken !== summary.revisionToken) throw failure("角色版本已在准备期间变化，请刷新后重试。", 409);
      const profileBasis = resolveCharacterProfileBasis(character);
      const projection = buildEventStoryCrossingKnowledgeProjection({
        projectId,
        observerId: summary.id,
        characters: formalCharacters,
        events: sceneEvidence.map((event) => ({ id: event.id, title: event.title, status: event.status, revisionToken: event.revisionToken, relativeId: event.relativeId, tags: event.tags, knowledgeSubjectIds: event.knowledgeSubjects }))
      });
      const knownFacts = projection.visibleEvents
        .filter((event) => ["experienced", "witnessed", "informed"].includes(event.knowledgeState))
        .map((event) => ({ factId: event.eventId, summary: `${event.knowledgeLabel}：${event.title}`, sourceRef: { id: event.eventId, revision: event.revisionToken }, visibility: event.knowledgeState, attentionRequired: true }));
      const visibleEventIds = new Set(projection.visibleEvents.filter((event) => ["experienced", "witnessed", "informed"].includes(event.knowledgeState)).map((event) => event.eventId));
      const worldObjects = operations.listWorldObjects({ projectId }).filter((item) => item.status !== "archived" && ["location", "item"].includes(item.type));
      for (const object of worldObjects) {
        const state = operations.readWorldStateN4?.({ projectId, objectId: object.id, workVersionId: ownerWorkVersionId, observedAt: scene.observedAt });
        if (state?.status !== "known" || !state.change || !visibleEventIds.has(state.change.evidence.event.id)) continue;
        const value = state.value.kind === "passage"
          ? `${object.title}通行状态：${state.value.state === "open" ? "开放" : state.value.state === "closed" ? "封闭" : "未知"}`
          : `${object.title}持有状态：${state.value.state === "held" ? `由 ${state.value.holder.id} 持有` : state.value.state === "unheld" ? "明确无人持有" : "未知"}`;
        // Authorization decides this source set first.  A current state is
        // still indispensable scene evidence; the bounded N4 model permits
        // only two state kinds, keeping this required input small.
        knownFacts.push({ factId: `world-state.${object.id}.${state.change.changeId}`, summary: value, sourceRef: { id: state.change.evidence.event.id, revision: state.change.evidence.event.revision }, visibility: "world-state", worldStateObjectId: object.id, attentionRequired: true });
      }
      const relations = relationOperations?.listRelations({ projectId, workVersionId: ownerWorkVersionId, reviewState: "confirmed" }).relations ?? [];
      for (const relation of relations) {
        if (relation.sourceObjectId !== summary.id && relation.targetObjectId !== summary.id) continue;
        const evidence = relation.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference;
        if (!evidence?.eventId || !evidence?.revisionToken || !visibleEventIds.has(evidence.eventId)) continue;
        const otherId = relation.sourceObjectId === summary.id ? relation.targetObjectId : relation.sourceObjectId;
        const other = formalCharacters.find((character) => character.id === otherId);
        knownFacts.push({ factId: `relation.${relation.relationId}`, summary: `正式关系：${summary.title}与 ${other?.label ?? otherId} 为${relation.currentTypeLabel ?? relation.relationLabelSnapshot}。`, sourceRef: { id: evidence.eventId, revision: evidence.revisionToken }, visibility: "relation" });
      }
      const recalledMemories = await listRecallableCharacterMemories(continuityContext(projectId), { recipientId: summary.id, sourceIdentity, observedAt: scene.observedAt });
      knownFacts.push(...recalledMemories.map((memory) => ({
        factId: memory.id,
        summary: `听闻：${memory.speakerId} 说“${memory.statement}”`,
        sourceRef: { id: memory.id, revision: digest({ memoryId: memory.id, sourceStepRevision: memory.sourceStepRevision, sourceRunId: memory.sourceRunId }) },
        visibility: "heard",
        memorySource: {
          memoryId: memory.id,
          speakerId: memory.speakerId,
          sourceRunId: memory.sourceRunId,
          sourceStepId: memory.sourceStepId,
          sceneId: memory.sourceScene.id,
          sceneObservedAt: memory.sourceScene.observedAt,
          workVersionId: memory.sourceIdentity.workVersionId,
          workRevision: memory.sourceIdentity.revision,
          validity: memory.validity.state
        }
      })));
      const beliefs = projection.visibleEvents
        .filter((event) => ["believes", "suspects", "misled", "denied", "contradicted"].includes(event.knowledgeState))
        .map((event) => ({
          beliefId: `belief.${event.eventId}`,
          summary: `${event.knowledgeLabel}：${event.title}`,
          stance: event.knowledgeState === "misled" ? "misunderstood" : event.knowledgeState === "suspects" || event.knowledgeState === "contradicted" ? "suspected" : "believed",
          sourceRef: { id: event.eventId, revision: event.revisionToken },
          attentionRequired: true
        }));
      const unknownFactIds = projection.hiddenEventIds;
      return {
        character: { id: summary.id, revision: summary.revisionToken },
        displayName: summary.title,
        coreSummary: `角色核心：${profileBasis.core ?? "未设置"}；底线：${profileBasis.boundaries ?? "未设置"}。`,
        localGoal: optionalText(ref.localGoal, "角色本场目标", 800) ?? `围绕“${scene.label}”回应当前可观察的变化（作者未单独设置本场目标）。`,
        profileBasis,
        knownFacts,
        beliefs,
        unknownFactIds,
        // State actions remain server-validated against the exact legal
        // world-state source below; declaring them here is not permission to
        // mutate an arbitrary object.
        allowedActions: ["speak", "observe", "ask", "handoff-item", "change-passage"]
      };
    }));
  }

  function continuityContext(projectId) {
    if (!continuityRootPath) throw failure("Story Continuity 根目录未配置；没有写入角色记忆。", 503);
    return { rootPath: continuityRootPath, agentId: continuityAgentId, scope: "project", projectId };
  }

  function resolveCharacterProfileBasis(character) {
    const profile = character.profile?.objectType === "character" && character.profile.authorConfirmed === true ? character.profile : null;
    const core = authorProfileText(profile?.fields?.character_core, "角色核心");
    const boundaries = authorProfileText(profile?.fields?.boundaries, "角色底线");
    return {
      core,
      boundaries,
      sourceRevision: character.revisionToken,
      sources: [
        ...(core ? [{ field: "character_core", source: "author-profile" }] : []),
        ...(boundaries ? [{ field: "boundaries", source: "author-profile" }] : [])
      ]
    };
  }

  function requireExecutionAvailability() {
    const status = piAdapterFactory?.availability?.();
    if (!fakeProviderAllowed && (!status || status.kind === "unavailable")) throw failure(status?.label || "女娲 N1 当前没有获授权的执行器；未自动回退为假对话。", 503);
  }

  function createPiAdapter(projectId, runId, sourceIdentity, operationId) {
    if (!sourceIdentity) throw failure("这份排演缺少创建时冻结的作品版本身份；为避免使用新版本执行，已阻止继续。", 409);
    const actorIds = requireRun(workspacePath(projectId), runId).actors.map((actor) => actor.character.id);
    const adapter = piAdapterFactory?.create?.({
      projectId,
      runId,
      sourceIdentity,
      actorIds,
      onProviderLifecycle(event) {
        const base = { workspacePath: workspacePath(projectId), runId, operationId, requestKey: event.requestKey, now: now() };
        if (event.phase === "failed" && typeof event.detail === "string" && event.detail.startsWith("request-validation:")) {
          recordNuwaN1ProviderPreflightFailure({
            ...base,
            providerCall: event.providerCall,
            detail: event.detail,
            provider: event.provider
          });
          return;
        }
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
        const knownKey = context.knownFacts.find((fact) => fact.visibility === "world-state" && fact.worldStateObjectId && fact.summary.includes("持有状态"));
        const recipient = current.actors.find((actor) => actor.character.id !== context.actor.id) ?? null;
        const rehearsalHandoff = Boolean(knownKey && recipient && current.authorGoal.includes("交接钥匙"));
        return {
          type: "actor-result",
          actor: context.actor,
          intent: `依据受限上下文核对：${evidence}`,
          speech: heard ? `我听到了这句话；我只按自己可知的信息继续观察。` : `我只依据当前可知信息继续观察。`,
          action: rehearsalHandoff ? { action: "handoff-item", targetId: knownKey.worldStateObjectId, worldState: { kind: "holder", objectId: knownKey.worldStateObjectId, state: "held", holderId: recipient.character.id } } : { action: "observe", targetId: null },
          observableResult: rehearsalHandoff ? "角色依据自己合法获知的持有状态，提出将关键物件正式交给同场角色。" : "角色完成一次受限观察；结果仍属于本次女娲 Run。",
          ...(context.step === 1 && current.actors[1] ? { speech: current.authorGoal.includes("北闸已封") ? "北闸已封。" : "我只把钟声的线索告诉你。", heardByActorIds: [current.actors[1].character.id] } : {}),
          usage: { inputTokens: null, outputTokens: null }
        };
      }
    };
  }

  return { bootstrap, setup, create, read, latest, step, continuous, pause, resume, stop, replay, cue, candidate, autoApply, freezeAutoApplicationDraft, rollbackAutoApplication };
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
  const selectedContextRefs = handoff.candidates.flatMap((candidate) => run.steps
    .find((step) => step.stepId === candidate.sourceStepId)?.contextEvidenceRefs ?? []);
  const contextSources = [...new Map(selectedContextRefs.map((ref) => [ref.sourceId, {
    id: ref.sourceId,
    type: `nuwa-step-${ref.visibility}`,
    label: ref.sourceId,
    content: ref.summary
  }])).values()];
  const candidates = handoff.candidates.map((candidate) => ({
    id: candidate.candidateId,
    title: candidate.title,
    change: candidate.summary,
    after: candidate.observedResult,
    causes: [`Nuwa N1 Run ${run.runId} / Step ${candidate.sourceStepId}`],
    evidence: [...new Set(run.steps.find((step) => step.stepId === candidate.sourceStepId)?.contextEvidenceRefs.map((ref) => ref.sourceId) ?? [])],
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
      sources: contextSources,
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

function optionalText(value, label, maximum) {
  if (value == null || value === "") return null;
  return requiredText(value, label, maximum);
}

function authorProfileText(field, label) {
  if (!field || field.source !== "author" || typeof field.value !== "string") return null;
  return optionalText(field.value, label, 1_000);
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
