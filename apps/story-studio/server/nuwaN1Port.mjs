import {
  advanceNuwaN1Run,
  buildStorySnapshot,
  cancelNuwaN1Run,
  createNuwaN1Run,
  createNuwaPlan,
  createNuwaRunPack,
  cueNuwaN1Run,
  pauseNuwaN1Run,
  prepareNuwaN1CandidateHandoff,
  readLatestNuwaRun,
  readNuwaN1Run,
  resumeNuwaN1Run,
  startNuwaN1Run
} from "../../../src/storyIntelligence/index.ts";

const VERSION = "tianyan-nuwa-n1-port/v1";
const FAKE_ADAPTER_ID = "local-n1-tool-roundtrip-fake/v1";

/**
 * Server-side bridge for the N1 author surface.  The RunPack and N1 runtime
 * remain the lifecycle owner; this module only resolves stable project refs,
 * supplies a replaceable execution adapter, and hands candidates to the
 * existing AuthorControl review owner.
 */
export function createNuwaN1Port({ operations, authorControl, fakeProviderAllowed = false, now = () => new Date().toISOString() }) {
  function availability() {
    return fakeProviderAllowed
      ? { kind: "local-fake", label: "本地工程演练 · 0 Provider", adapterId: FAKE_ADAPTER_ID, providerCalls: 0 }
      : { kind: "unavailable", label: "未配置可执行的女娲 Provider；本轮不会自动回退为假对话。", adapterId: null, providerCalls: 0 };
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
          evidenceRefs: actor.knownFacts.map((fact) => fact.sourceRef.id),
          knowledgeSubjects: actor.knownFacts.map((fact) => fact.factId),
          excludedCount: actor.unknownFactIds.length
        }))
      }
    };
  }

  function create(input) {
    requireExecutionAvailability();
    const prepared = setup(input);
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
      scene: {
        ...resolveScene(input.projectId, input.storyUnit),
        observedAt: now()
      },
      authorGoal: prepared.setup.goal,
      actors: resolveActors(input.projectId, input.participants, resolveScene(input.projectId, input.storyUnit)),
      operationId,
      now: now()
    });
    return read(input.projectId, plan.runId);
  }

  async function step(input) {
    requireExecutionAvailability();
    const workspace = workspacePath(input.projectId);
    let current = requireRun(workspace, input.runId);
    const expectedRevision = revision(input.expectedRevision);
    if (current.lifecycle === "ready") {
      current = startNuwaN1Run({ workspacePath: workspace, runId: current.runId, expectedRevision, operationId: `${operation(input.operationId)}.start`, now: now() });
    }
    const next = await advanceNuwaN1Run({
      workspacePath: workspace,
      runId: current.runId,
      expectedRevision: current.revision,
      operationId: operation(input.operationId),
      adapter: createLocalFakeAdapter(),
      now: now()
    });
    return present(input.projectId, next);
  }

  function pause(input) {
    return present(input.projectId, pauseNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), ...(input.reason ? { reason: requiredText(input.reason, "暂停原因", 240) } : {}), now: now() }));
  }

  function resume(input) {
    return present(input.projectId, resumeNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), now: now() }));
  }

  function stop(input) {
    return present(input.projectId, cancelNuwaN1Run({ workspacePath: workspacePath(input.projectId), runId: input.runId, expectedRevision: revision(input.expectedRevision), operationId: operation(input.operationId), ...(input.reason ? { reason: requiredText(input.reason, "停止原因", 240) } : {}), now: now() }));
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
    const actor = run.actors[0] ?? null;
    return {
      version: VERSION,
      availability: availability(),
      run: {
        runId: run.runId,
        status: run.lifecycle,
        revision: run.revision,
        scene: { storyUnitId: run.scene.storyUnit.id, label: run.scene.label, observedAt: run.scene.observedAt },
        participants: run.actors.map((item) => ({ id: item.character.id, title: item.displayName, revision: item.character.revision })),
        goal: run.authorGoal,
        steps: run.steps.map((step) => ({ stepId: step.stepId, sequence: step.sequence, actorId: step.actor.id, intent: step.intent, speech: step.speech, action: step.action, observableResult: step.observableResult, tool: { name: "read_role_context", requestId: step.toolRequestId }, execution: step.execution, contextHash: step.contextHash, usage: step.usage, committedAt: step.committedAt })),
        dispatches: run.dispatches,
        provider: { ...availability(), projectId: project.id },
        blocker: run.blocker
      },
      contextInspector: actor ? {
        actorId: actor.character.id,
        evidenceRefs: actor.knownFacts.map((fact) => ({ id: fact.sourceRef.id, revision: fact.sourceRef.revision, visibility: fact.visibility })),
        knowledgeSubjects: actor.knownFacts.map((fact) => fact.factId),
        excludedCount: actor.unknownFactIds.length
      } : null,
      receipts: run.receipts
    };
  }

  function resolveScene(projectId, ref) {
    const unitId = ref?.id;
    const unit = operations.readStoryUnit({ projectId, unitId });
    if (unit.version !== ref?.revision) throw failure("故事单元已变更，请重新选择。", 409);
    return { storyUnit: { id: unit.id, revision: unit.version }, sceneRef: { id: unit.id, revision: unit.version }, observedAt: now(), label: unit.title };
  }

  function resolveActors(projectId, refs, scene) {
    if (!Array.isArray(refs) || refs.length < 2 || refs.length > 3) throw failure("女娲 N1 需要选择两到三个正式角色。", 400);
    const seen = new Set();
    const sceneEvidence = operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status !== "archived" && scene.storyUnit.id && operations.readStoryUnit({ projectId, unitId: scene.storyUnit.id }).linkedEntityIds.includes(item.id))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }));
    return refs.map((ref) => {
      if (!ref || typeof ref.id !== "string" || seen.has(ref.id)) throw failure("角色必须使用不同的稳定身份。", 400);
      seen.add(ref.id);
      const summary = operations.listWorldObjects({ projectId, type: "character" }).find((item) => item.id === ref.id && item.status !== "archived");
      if (!summary || summary.revisionToken !== ref.revision) throw failure("角色不存在、已归档或版本已变更。", 409);
      const knownFacts = sceneEvidence
        .filter((event) => event.knowledgeSubjects.includes(summary.id))
        .map((event) => ({ factId: `event.${event.id}`, summary: `已确认事件：${event.title}`, sourceRef: { id: event.id, revision: event.revisionToken }, visibility: "experienced" }));
      const unknownFactIds = sceneEvidence.filter((event) => !event.knowledgeSubjects.includes(summary.id)).map((event) => `event.${event.id}`);
      return {
        character: { id: summary.id, revision: summary.revisionToken },
        displayName: summary.title,
        coreSummary: `正式角色 ${summary.title}；本轮只可使用角色稳定身份及已授权证据。`,
        localGoal: `围绕“${scene.label}”回应当前可观察的变化。`,
        knownFacts,
        beliefs: [],
        unknownFactIds,
        allowedActions: ["speak", "observe", "ask"]
      };
    });
  }

  function requireExecutionAvailability() {
    if (!fakeProviderAllowed) throw failure("女娲 N1 当前没有获授权的执行器；未自动回退为假对话。", 503);
  }

  function createLocalFakeAdapter() {
    return {
      adapterId: FAKE_ADAPTER_ID,
      async request(context) {
        // Tool request IDs are transport identifiers, not story identities.
        // Keep them ASCII while preserving the Unicode formal character ref in
        // the separately validated `actor` field.
        const actorToken = Buffer.from(context.actor.id, "utf8").toString("hex").slice(0, 48);
        return { type: "tool-request", toolName: "read_role_context", requestId: `n1-tool.${context.runId}.${context.step}.${actorToken}`, actor: context.actor };
      },
      async continueAfterTool({ context, toolResult }) {
        if (toolResult.context.actor.id !== context.actor.id) throw new Error("本地工程演练工具结果越过角色范围。");
        const heard = context.recentDialogue.at(-1)?.text || null;
        const evidence = context.knownFacts[0]?.summary || "当前没有额外可知事件；保持未知。";
        return {
          type: "actor-result",
          actor: context.actor,
          intent: `依据受限上下文核对：${evidence}`,
          speech: heard ? `我听到了这句话；我只按自己可知的信息继续观察。` : `我只依据当前可知信息继续观察。`,
          action: { action: "observe", targetId: null },
          observableResult: "角色完成一次受限观察；结果仍属于本次女娲 Run。",
          usage: { inputTokens: null, outputTokens: null }
        };
      }
    };
  }

  return { bootstrap, setup, create, read, latest, step, pause, resume, stop, replay, cue, candidate };
}

function candidateReviewResult(project, run, handoff) {
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
      inferences: ["本地工程演练经受限工具往返生成，Provider 调用为 0。"],
      unknowns: ["候选尚未经过作者采纳。"],
      suggestions: candidates.map((candidate) => candidate.title),
      simulationTask: { goal: "审阅女娲 N1 候选。", mustPreserve: ["唯一 Owner", "候选不自动写事实"], questions: [] }
    },
    nuwa: { version: "tianyan-nuwa-simulation/v1", knownFacts: [], assumptions: ["本地工程演练 · 0 Provider"], causalSteps: candidates.flatMap((candidate) => candidate.causes), actorResponses: [], conflicts: [], unknowns: ["候选尚未采纳。"], candidates },
    provider: { profileId: "local-n1-tool-roundtrip-fake", calls: [] }
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
