import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Bot, CheckCircle2, CirclePause, CirclePlay, FileClock, FilePlus2, History, MessageSquarePlus, OctagonX, PanelRight, Play, RefreshCw, Send, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import {
  autoApplyNuwaN1Result,
  createNuwaN1Candidate,
  createNuwaN1Run,
  cueNuwaN1Run,
  freezeNuwaN1AutomaticDraft,
  getNuwaN1Bootstrap,
  getNuwaN1Latest,
  getNuwaN1Run,
  getMultiverseWorkVersions,
  replayNuwaN1Run,
  rollbackNuwaN1AutomaticApplication,
  runNuwaN1Action,
  runNuwaN1Continuously,
  setupNuwaN1,
  type NuwaN1Bootstrap,
  type NuwaN1ReadModel,
  type NuwaN1Run,
  type NuwaN1Setup,
  type NuwaN1ScopeSelection,
  type NuwaN1Step,
  type MultiverseWorkVersion
} from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

const MAX_PARTICIPANTS = 3;
const MIN_PARTICIPANTS = 2;

function isSelectableWorkVersion(version: MultiverseWorkVersion) {
  return version.identity.status === "active"
    && (version.identity.kind === "root" || version.identity.kind === "derived");
}

export function NuwaN1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const projectIdRef = useRef(projectId);
  const operationGeneration = useRef(0);
  projectIdRef.current = projectId;
  const [bootstrap, setBootstrap] = useState<NuwaN1Bootstrap | null>(null);
  const [run, setRun] = useState<NuwaN1ReadModel | null>(null);
  const [setup, setSetup] = useState<NuwaN1Setup | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantGoals, setParticipantGoals] = useState<Record<string, string>>({});
  const [storyUnitId, setStoryUnitId] = useState("");
  const [storylineKey, setStorylineKey] = useState("");
  const [scopeMode, setScopeMode] = useState<NuwaN1ScopeSelection["mode"]>("bounded");
  const [endStoryUnitId, setEndStoryUnitId] = useState("");
  const [relationTypeId, setRelationTypeId] = useState<string | null>(null);
  const [workVersions, setWorkVersions] = useState<MultiverseWorkVersion[]>([]);
  const [workVersionId, setWorkVersionId] = useState("");
  const [goal, setGoal] = useState("");
  const [cue, setCue] = useState("");
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<"context" | "step" | "log">("context");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queuedParticipantId, setQueuedParticipantId] = useState<string | null>(null);

  useEffect(() => {
    operationGeneration.current += 1;
    let active = true;
    setBootstrap(null); setRun(null); setSetup(null); setParticipantIds([]); setParticipantGoals({}); setStoryUnitId(""); setStorylineKey(""); setScopeMode("bounded"); setEndStoryUnitId(""); setRelationTypeId(null); setWorkVersions([]); setWorkVersionId(""); setGoal(""); setSelectedStepIds([]); setBusy(false); setInterrupting(false); setError(null); setNotice(null); setQueuedParticipantId(null);
    if (!projectId) return () => { active = false; };
    const requestedRunId = new URLSearchParams(window.location.search).get("runId")?.trim() || null;
    void Promise.all([getNuwaN1Bootstrap(projectId), requestedRunId ? getNuwaN1Run(projectId, requestedRunId) : getNuwaN1Latest(projectId), getMultiverseWorkVersions(projectId)]).then(([nextBootstrap, latest, versions]) => {
      if (!active) return;
      setBootstrap(nextBootstrap);
      setWorkVersions(versions);
      setWorkVersionId(versions.find((version) => isSelectableWorkVersion(version) && version.identity.kind === "root")?.identity.workVersionId ?? "");
      setRun(latest.run ? latest : null);
      const requestedParticipantId = window.sessionStorage.getItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      const requestedParticipant = requestedParticipantId && nextBootstrap.participants.some((participant) => participant.id === requestedParticipantId) ? requestedParticipantId : null;
      const queuedParticipant = latest.run ? requestedParticipant : null;
      setQueuedParticipantId(queuedParticipant);
      if (requestedParticipantId && (!requestedParticipant || !latest.run)) window.sessionStorage.removeItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      setParticipantIds(latest.run?.participants.map((participant) => participant.id) ?? (requestedParticipant ? [requestedParticipant] : []));
      setParticipantGoals(Object.fromEntries(latest.run?.participants.map((participant) => [participant.id, participant.localGoal ?? ""]) ?? []));
      const latestScope = latest.run?.scope;
      const defaultStoryline = nextBootstrap.storylines[0];
      setStorylineKey(latestScope?.storylineKey ?? defaultStoryline?.key ?? "");
      setScopeMode(latestScope?.mode ?? "bounded");
      setStoryUnitId(latestScope?.scenes[0]?.storyUnit.id ?? latest.run?.scene.storyUnitId ?? defaultStoryline?.units[0]?.id ?? "");
      setEndStoryUnitId(latestScope?.mode === "bounded" ? (latestScope.scenes.at(-1)?.storyUnit.id ?? "") : "");
      setRelationTypeId(latest.authorization?.relationTypeId ?? (nextBootstrap.relationTypes.length === 1 ? nextBootstrap.relationTypes[0]!.id : null));
      setGoal(latest.run?.goal ?? "让两位角色在当前场景中决定下一步行动。");
      setSelectedStepIds(latest.run?.steps.slice(-1).map((step) => step.stepId) ?? []);
      setSelectedStepId(latest.run?.steps.at(-1)?.stepId ?? null);
      if (requestedParticipant) setNotice(latest.run
        ? `已从角色档案保留 ${nextBootstrap.participants.find((participant) => participant.id === requestedParticipant)?.title ?? "该角色"}；新建排演时会自动加入。`
        : `已从角色档案加入 ${nextBootstrap.participants.find((participant) => participant.id === requestedParticipant)?.title ?? "该角色"}；再选择 1–2 位正式角色即可开始。`);
    }).catch((reason: unknown) => {
      if (active) setError(messageFor(reason, "女娲工作面未能读取本地作品；现有作品没有被修改。"));
    });
    return () => { active = false; };
  }, [projectId]);

  const selectedStoryline = useMemo(() => bootstrap?.storylines.find((line) => line.key === storylineKey) ?? null, [bootstrap?.storylines, storylineKey]);
  const scopeUnits = selectedStoryline?.units ?? [];
  const selectedScope = useMemo<NuwaN1ScopeSelection | null>(() => storyUnitId && storylineKey && (scopeMode === "continuous" || endStoryUnitId) ? { storylineKey, startStoryUnitId: storyUnitId, endStoryUnitId: scopeMode === "bounded" ? endStoryUnitId : null, mode: scopeMode } : null, [endStoryUnitId, scopeMode, storyUnitId, storylineKey]);
  const canPrepare = participantIds.length >= MIN_PARTICIPANTS && Boolean(selectedScope) && Boolean(goal.trim()) && participantIds.every((id) => Boolean(participantGoals[id]?.trim()));
  const selectableWorkVersions = useMemo(() => workVersions.filter(isSelectableWorkVersion), [workVersions]);
  const selectedStep = run?.run?.steps.find((step) => step.stepId === selectedStepId) ?? null;
  const actorContext = useMemo(() => {
    if (run?.contextInspector && run.run) {
      return run.contextInspector.actors.map((context) => ({
        actorId: context.actorId,
        actorLabel: run.run!.participants.find((participant) => participant.id === context.actorId)?.title ?? "当前角色",
        localGoal: context.localGoal,
        coreSummary: context.coreSummary,
        profileBasis: context.profileBasis,
        attention: context.attention,
        knowledgeItems: context.knowledgeItems,
        beliefItems: context.beliefItems,
        memoryItems: context.memoryItems,
        evidenceRefs: context.evidenceRefs.map((reference) => reference.id),
        excludedCount: context.excludedCount
      }));
    }
    return setup?.setup.contextPreview.map((actor) => ({
      ...actor,
      actorLabel: bootstrap?.participants.find((participant) => participant.id === actor.actorId)?.title ?? "角色"
    })) ?? [];
  }, [bootstrap?.participants, run?.contextInspector, run?.run, setup?.setup.contextPreview]);

  const updateRun = (next: NuwaN1ReadModel) => {
    if (!next.run) {
      setRun(null);
      return;
    }
    setRun(next);
    setSetup(null);
    const latestStep = next.run.steps.at(-1);
    if (latestStep) {
      setSelectedStepId(latestStep.stepId);
      const nextSteps = next.run.steps;
      setSelectedStepIds((current) => current.length ? current.filter((id) => nextSteps.some((step) => step.stepId === id)) : [latestStep.stepId]);
    }
  };
  const beginOperation = () => ({ projectId: projectIdRef.current, generation: operationGeneration.current });
  const isCurrentOperation = (scope: ReturnType<typeof beginOperation>) => scope.projectId === projectIdRef.current && scope.generation === operationGeneration.current;
  const act = async (operation: () => Promise<NuwaN1ReadModel>, message?: string | ((next: NuwaN1ReadModel) => string)) => {
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await operation();
      if (!isCurrentOperation(scope)) return;
      updateRun(next);
      if (message) setNotice(typeof message === "function" ? message(next) : message);
    }
    catch (reason) { if (isCurrentOperation(scope)) setError(messageFor(reason, "本次女娲操作没有完成；未写入正式故事。")); }
    finally { if (isCurrentOperation(scope)) setBusy(false); }
  };
  const prepare = async () => {
    if (!projectId || !canPrepare) return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    try {
      const participants = selectedParticipants(bootstrap, participantIds, participantGoals);
      const storyUnit = selectedStoryUnit(bootstrap, storyUnitId);
      if (!storyUnit || !selectedScope) throw new Error("当前事件线范围已不可用，请重新选择后再准备。");
      const next = await props.runtime.withConnection((token) => setupNuwaN1({ projectId, participants, storyUnit, scope: selectedScope, goal: goal.trim(), workVersionId: workVersionId || null, operationId: newOperationId(), token }));
      if (!isCurrentOperation(scope)) return;
      setSetup(next); setNotice("上下文预览已生成；角色只会收到各自允许的依据。"); setInspectorOpen(true); setInspectorTab("context");
    } catch (reason) { if (isCurrentOperation(scope)) setError(messageFor(reason, "准备上下文失败；没有启动排演。")); }
    finally { if (isCurrentOperation(scope)) setBusy(false); }
  };
  const create = () => {
    if (!projectId || !canPrepare) return;
    const participants = selectedParticipants(bootstrap, participantIds, participantGoals);
    const storyUnit = selectedStoryUnit(bootstrap, storyUnitId);
    if (!storyUnit || !selectedScope) return;
    void act(() => props.runtime.withConnection((token) => createNuwaN1Run({ projectId, participants, storyUnit, scope: selectedScope, goal: goal.trim(), relationTypeId, workVersionId: workVersionId || null, operationId: newOperationId(), token })), "已建立本地工程演练；尚未调用真实 Provider。");
  };
  const runAction = (action: "step" | "pause" | "resume" | "stop" | "replay") => {
    if (!projectId || !run) return;
    if (action === "replay") {
      void act(() => props.runtime.withConnection((token) => replayNuwaN1Run({ projectId, runId: run.run!.runId, token })), "已按记录回放；没有再次请求 Provider。");
      return;
    }
    if (action === "pause" || action === "stop") {
      const current = run.run!;
      const scope = beginOperation();
      setInterrupting(true); setError(null); setNotice(null);
      void props.runtime.withConnection((token) => runNuwaN1Action({ projectId, runId: current.runId, expectedRevision: current.revision, action, operationId: newOperationId(), token }))
        .then((next) => { if (isCurrentOperation(scope)) updateRun(next); })
        .catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, action === "stop" ? "停止请求没有完成；请刷新后核对 Run 状态。" : "暂停请求没有完成；请刷新后核对 Run 状态。")); })
        .finally(() => { if (isCurrentOperation(scope)) setInterrupting(false); });
      return;
    }
    void act(() => props.runtime.withConnection((token) => runNuwaN1Action({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, action, operationId: newOperationId(), token })), undefined);
  };
  const runContinuously = () => {
    if (!projectId || !run?.run) return;
    void act(
      () => props.runtime.withConnection((token) => runNuwaN1Continuously({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, operationId: newOperationId(), token })),
      (next) => next.run?.status !== "completed"
        ? `连续排演已停止于“${next.run?.status ?? "未知"}”；未显示为完成或已自动应用。`
        : next.automaticApplication?.status === "applied"
          ? "连续排演已完成，并已按范围授权自动应用正式结果。"
          : "连续排演已完成；结果仍停留在 Run 中等待选择。"
    );
  };
  const beginAnotherRun = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("runId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setRun(null); setSetup(null); setSelectedStepIds([]); setSelectedStepId(null); setCue(""); setParticipantGoals({}); setError(null);
    if (queuedParticipantId && projectId) {
      setParticipantIds([queuedParticipantId]);
      window.sessionStorage.removeItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      const participant = bootstrap?.participants.find((item) => item.id === queuedParticipantId);
      setQueuedParticipantId(null);
      setNotice(`旧 Run 仍可从运行记录回看；已将 ${participant?.title ?? "角色档案中的角色"} 加入新的范围排演。`);
      return;
    }
    setNotice("旧 Run 仍可从运行记录回看；现在可以选择新的事件线与单元范围建立排演。");
  };
  const sendCue = (event: FormEvent) => {
    event.preventDefault();
    if (!projectId || !run || !cue.trim()) return;
    const submittedCue = cue.trim();
    void act(async () => {
      const next = await props.runtime.withConnection((token) => cueNuwaN1Run({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, instruction: submittedCue, operationId: newOperationId(), token }));
      setCue("");
      return next;
    }, "作者提示已进入当前 Run 的后续步骤，不会改写既有步骤。");
  };
  const sendCandidate = () => {
    if (!projectId || !run || !selectedStepIds.length) return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => createNuwaN1Candidate({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, selectedStepIds, operationId: newOperationId(), token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result); setNotice(`已将“${result.candidate.candidates[0]?.title ?? "选定结果"}”送入待确认；尚未写入正式故事。`);
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "候选未能送入待确认；正式故事没有变化。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const autoApply = () => {
    if (!projectId || !run || !selectedStepIds.length || run.authorization?.status !== "active") return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => autoApplyNuwaN1Result({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, selectedStepIds, operationId: newOperationId(), token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result);
      setNotice(`已按高权限范围自动写入正式 Event 并纳入当前故事单元（${result.automaticApplication.eventId}）；来源 Run、授权、影响审查与变更集均可追溯。`);
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "自动应用未完成；请刷新核对已保存回执，系统不会把未完成状态显示为已写入。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const freezeDraft = () => {
    const application = run?.automaticApplication;
    if (!projectId || !run?.run || !application) return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => freezeNuwaN1AutomaticDraft({ projectId, runId: run.run!.runId, receiptId: application.receiptId, operationId: newOperationId(), token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result);
      setNotice(`已固定 ${result.automaticApplication.fixedDraft?.artifactId ?? "当前版本"}；之后回溯不会改写这份稿。`);
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "固定稿未能建立；当前故事没有被改写。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const rollbackApplication = () => {
    const application = run?.automaticApplication;
    if (!projectId || !run?.run || !application) return;
    const operationId = application.rollback?.status === "recovery-required" ? application.rollback.operationId : newOperationId();
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => rollbackNuwaN1AutomaticApplication({ projectId, runId: run.run!.runId, receiptId: application.receiptId, operationId, token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result);
      setNotice(`已完成补偿回溯；新的正式版本为 r${result.automaticApplication.rollback?.resultVersion?.revision ?? "?"}，Run 与 heard 历史仍保留。`);
    }).catch((reason: unknown) => {
      if (!isCurrentOperation(scope)) return;
      setError(messageFor(reason, "回溯未完整结束；请在本页恢复同一回执，系统不会显示为已全部回溯。"));
      // The durable receipt may have advanced to recovery-required even when
      // this write request fails.  Refresh it before another click so the
      // recovery keeps its original idempotency key.
      void getNuwaN1Run(projectId, run.run!.runId).then((latest) => {
        if (isCurrentOperation(scope)) updateRun(latest);
      }).catch(() => { /* Keep the original failure visible if refresh is unavailable. */ });
    }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const openFixedDraft = () => {
    const artifactId = run?.automaticApplication?.fixedDraft?.artifactId;
    if (!projectId || !artifactId) return;
    window.sessionStorage.setItem(`tianyan-creation-source-artifact:${projectId}`, artifactId);
    // Keep the exact pinned identity in the route as well as the one-shot
    // handoff.  A Creation mount may otherwise see several historical drafts
    // after a refresh and correctly refuse to guess which one to open.
    window.location.assign(`/creation?projectId=${encodeURIComponent(projectId)}&artifactId=${encodeURIComponent(artifactId)}`);
  };
  const openApplicationEvent = () => {
    const eventId = run?.automaticApplication?.eventId;
    if (!eventId) return;
    window.location.assign(`/event-line?eventTask=story&eventId=${encodeURIComponent(eventId)}`);
  };
  const openApplicationRelation = () => {
    const relationId = run?.automaticApplication?.relationId;
    if (!relationId || !run?.run) return;
    window.location.assign(`/event-line?eventTask=relationship&relationId=${encodeURIComponent(relationId)}&nuwaRunId=${encodeURIComponent(run.run.runId)}`);
  };

  if (!projectId) return <NuwaUnavailable title="先打开一个作品" detail="女娲排演必须绑定当前作品、正式角色和故事单元；这里不会创建独立的故事副本或角色仓库。" />;
  if (!bootstrap && !error) return <NuwaUnavailable title="正在读取女娲排演" detail="正在恢复当前作品的最新 Run；读取本身不会调用 Provider。" loading />;

  const availability = bootstrap?.availability;
  const localFake = availability?.kind === "local-fake";
  // Availability says whether this explicitly configured executor can start a
  // bounded Run.  It is not a synonym for the zero-call fixture executor.
  const executable = Boolean(availability && availability.kind !== "unavailable");
  const status = run?.run?.status ?? "ready";
  return <main className="shell-workspace shell-workspace-nuwa" aria-label="女娲">
    <section className="nuwa-n1-workspace" data-testid="nuwa-n1-workspace" data-run-id={run?.run?.runId ?? ""} data-run-status={status} data-provider-calls={availability?.providerCalls ?? 0}>
      <header className="nuwa-n1-header">
        <div><small>独立工作区 · 当前作品</small><h1>女娲</h1><p>{run?.run ? run.authorization?.status === "active" ? `正在“${run.run.scope.storylineLabel}”的已授权单元范围内排演；正式写入仍保留回溯。` : `正在“${run.run.scope.storylineLabel}”的 ${run.run.scope.mode === "continuous" ? "持续" : "指定"}范围内排演；结果需走待确认。` : "先选事件线和单元范围，再选择 2–3 位正式角色；系统在范围内自行分步骤。"}</p></div>
        <div className={`nuwa-n1-runtime-state is-${availability?.kind ?? "unavailable"}`}><Bot /><div><strong>{availability?.label ?? "本地作品服务未连接"}</strong><span>{localFake ? "本地工程演练 · 0 Provider" : executable ? "已配置执行器；开始排演才会发送明确授权的请求。" : "无可执行 Provider；不会自动回退为假对话。"}</span></div></div>
      </header>

      {error ? <p className="nuwa-n1-message is-error" role="alert"><AlertTriangle />{error}</p> : null}
      {notice ? <p className="nuwa-n1-message is-notice" role="status"><CheckCircle2 />{notice}</p> : null}
      {run?.authorization ? <p className="nuwa-n1-message is-notice" data-testid="nuwa-n1-authorization"><ShieldCheck />{run.authorization.status === "active" ? `高权限自动执行已授权：当前 Run、${run.authorization.storyUnitId} 与 ${run.authorization.actorIds.length} 位角色；最多 ${run.authorization.maxSteps} 步 / ${run.authorization.maxProviderDispatches} 次模型发送，可随时停止或回溯。` : "此 Run 的高权限授权已失效；不会继续自动写入。"}</p> : null}

      <section className="nuwa-n1-author-scope" aria-label="本次排演方式">
        <div><small>运行方式</small><strong>{run?.authorization?.status === "active" ? "已授权自动应用" : "普通候选"}</strong><span>{run?.authorization?.status === "active" ? "只限当前 Run、故事单元、所选人物和已绑定关系类型；停止后不继续写入。" : "结果只进入待确认；没有获得正式故事写入权限。"}</span></div>
        <div><small>执行服务</small><strong>{localFake ? "本地工程演练" : availability?.label ?? "未连接"}</strong><span>{localFake ? "假服务用于验证数据流；真实 Provider 0 次。" : executable ? "只有开始排演后才按已配置边界发送。" : "当前不会产生角色步骤。"}</span></div>
      </section>

      <section className="nuwa-n1-controlbar" aria-label="排演范围与操作">
        <label><span>作品版本</span><select aria-label="作品版本" value={workVersionId} disabled={Boolean(run) || busy || !selectableWorkVersions.length} onChange={(event) => { setWorkVersionId(event.target.value); setSetup(null); }}>{selectableWorkVersions.length ? selectableWorkVersions.map((version) => <option key={version.identity.workVersionId} value={version.identity.workVersionId}>{version.identity.kind === "root" ? "主版本" : "IF"} · {version.identity.displayName} · r{version.identity.currentRevision}</option>) : <option value="">尚未建立正式版本 · 仅候选排演</option>}</select></label>
        <label><span>事件线</span><select aria-label="事件线" value={storylineKey} disabled={Boolean(run) || busy} onChange={(event) => { const next = bootstrap?.storylines.find((line) => line.key === event.target.value); setStorylineKey(event.target.value); setStoryUnitId(next?.units[0]?.id ?? ""); setEndStoryUnitId(next?.units[0]?.id ?? ""); setSetup(null); }}>{bootstrap?.storylines.map((line) => <option key={line.key} value={line.key}>{line.title}</option>)}</select></label>
        <label><span>从单元开始</span><select aria-label="从单元开始" value={storyUnitId} disabled={Boolean(run) || busy || !scopeUnits.length} onChange={(event) => { const next = event.target.value; setStoryUnitId(next); if (scopeMode === "bounded" && (!endStoryUnitId || scopeUnits.findIndex((unit) => unit.id === endStoryUnitId) < scopeUnits.findIndex((unit) => unit.id === next))) setEndStoryUnitId(next); setSetup(null); }}>{scopeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label>
        <label><span>推演范围</span><select aria-label="推演范围" value={scopeMode} disabled={Boolean(run) || busy} onChange={(event) => { setScopeMode(event.target.value as NuwaN1ScopeSelection["mode"]); setSetup(null); }}><option value="bounded">到指定单元</option><option value="continuous">持续推演（N1 预算内）</option></select></label>
        {scopeMode === "bounded" ? <label><span>到单元结束</span><select aria-label="到单元结束" value={endStoryUnitId} disabled={Boolean(run) || busy || !scopeUnits.length} onChange={(event) => { setEndStoryUnitId(event.target.value); setSetup(null); }}>{scopeUnits.slice(Math.max(0, scopeUnits.findIndex((unit) => unit.id === storyUnitId))).map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label> : <span className="nuwa-n1-scope-hint">持续模式会从开始单元依序推进；N1 本轮最多覆盖 3 个单元 / 6 步，可暂停并恢复。</span>}
        <label><span>自动关系类型</span><select value={relationTypeId ?? ""} disabled={Boolean(run) || busy || !bootstrap?.relationTypes.length} onChange={(event) => setRelationTypeId(event.target.value || null)}><option value="">不写关系</option>{bootstrap?.relationTypes.map((type) => <option key={type.id} value={type.id}>{type.title}</option>)}</select></label>
        <label className="nuwa-n1-goal"><span>局部目标</span><input value={goal} disabled={Boolean(run) || busy} onChange={(event) => { setGoal(event.target.value); setSetup(null); }} maxLength={240} placeholder="例如：决定是否沿旧桥继续追查" /></label>
        <div className="nuwa-n1-status"><span>状态</span><strong>{statusLabel(status)}</strong>{run?.run ? <small>{run.run.scope.currentSceneIndex + 1} / {run.run.scope.scenes.length} 单元 · {run.run.steps.length} / {runStepBudget(run.run)} 步 · 本地/网络模型发送 {run.run.providerDispatches} / 12 · 内部工具回合 {internalToolTurns(run.run)}</small> : <small>范围内自动分步，最多 3 个单元 / 6 步</small>}</div>
        {!run ? <button type="button" className="primary-action" disabled={!canPrepare || busy || !executable} onClick={create}><Play />开始排演</button> : null}
        {run?.run?.status === "ready" ? <><button type="button" className="primary-action" disabled={busy} onClick={runContinuously}><Play />连续运行</button><button type="button" disabled={busy} onClick={() => runAction("step")}><Play />开始第一步</button><button type="button" className="danger-action" disabled={interrupting} onClick={() => runAction("stop")}><OctagonX />停止</button></> : null}
        {run?.run?.status === "running" ? <><button type="button" className="primary-action" disabled={busy} onClick={runContinuously}><Play />连续运行</button><button type="button" disabled={busy} onClick={() => runAction("step")}><Play />单步</button><button type="button" disabled={interrupting} onClick={() => runAction("pause")}><CirclePause />暂停</button><button type="button" className="danger-action" disabled={interrupting} onClick={() => runAction("stop")}><OctagonX />停止</button></> : null}
        {run?.run?.status === "paused" ? <><button type="button" className="primary-action" disabled={busy} onClick={() => runAction("resume")}><CirclePlay />恢复</button><button type="button" className="danger-action" disabled={interrupting} onClick={() => runAction("stop")}><OctagonX />停止</button></> : null}
        {run?.run && ["completed", "cancelled", "blocked"].includes(run.run.status) ? <><button type="button" disabled={busy} onClick={() => runAction("replay")}><History />回放</button><button type="button" className="primary-action" disabled={busy} onClick={beginAnotherRun}><MessageSquarePlus />新建排演</button></> : null}
      </section>

      <div className="nuwa-n1-body">
        <div className="nuwa-n1-primary">
      {!run ? <section className="nuwa-n1-setup" aria-label="女娲排演准备">
        <div className="nuwa-n1-setup-copy"><small>正式角色 · 稳定身份</small><h2>选择参与者</h2><p>角色只会获得自己的可知范围；角色档案、作者目标与其他角色秘密不会自动进入其上下文。</p></div>
        <fieldset><legend>选择 2–3 位正式角色</legend><div className="nuwa-n1-participant-options">{bootstrap?.participants.map((participant) => {
          const checked = participantIds.includes(participant.id);
          return <label key={participant.id}><input type="checkbox" checked={checked} disabled={busy || (!checked && participantIds.length >= MAX_PARTICIPANTS)} onChange={() => { setParticipantIds((current) => checked ? current.filter((id) => id !== participant.id) : [...current, participant.id]); setSetup(null); }} /><span><strong>{participant.title}</strong><small>正式角色</small></span></label>;
        })}</div></fieldset>
        {participantIds.length ? <fieldset className="nuwa-n1-participant-goals"><legend>逐角色本场目标</legend>{participantIds.map((participantId) => { const participant = bootstrap?.participants.find((item) => item.id === participantId); return <label key={participantId}><span>{participant?.title ?? "角色"}</span><input value={participantGoals[participantId] ?? ""} disabled={busy} maxLength={800} required onChange={(event) => { setParticipantGoals((current) => ({ ...current, [participantId]: event.target.value })); setSetup(null); }} placeholder="本场只属于这个角色的目标" /></label>; })}</fieldset> : null}
        <footer><span>{participantIds.length < MIN_PARTICIPANTS ? `还需要选择 ${MIN_PARTICIPANTS - participantIds.length} 位角色。` : participantIds.some((id) => !participantGoals[id]?.trim()) ? "请为每位角色填写本场目标。" : "范围准备就绪；可先检查上下文。"}</span><button type="button" disabled={!canPrepare || busy} onClick={prepare}><ShieldCheck />查看上下文</button></footer>
      </section> : run?.run ? <NuwaRunReader run={run} selectedStepId={selectedStepId} selectedStepIds={selectedStepIds} onSelectStep={(step) => { setSelectedStepId(step.stepId); setInspectorOpen(true); setInspectorTab("step"); }} onToggleCandidate={(stepId) => setSelectedStepIds((current) => current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId])} /> : null}

      {!run && setup ? <section className="nuwa-n1-context-preview"><ShieldCheck /><div><strong>本轮上下文预览</strong><p>{setup.setup.contextPreview.map((actor) => `${bootstrap?.participants.find((item) => item.id === actor.actorId)?.title ?? "角色"}：${actor.profileBasis.core ?? "未设置核心"}；底线 ${actor.profileBasis.boundaries ?? "未设置"}；目标 ${actor.localGoal}`).join("；")}</p><small>这里只是发送前预览；尚未提交步骤，也没有网络发送回执。</small></div></section> : null}
        </div>

      <aside className={`nuwa-n1-inspector ${inspectorOpen ? "is-open" : ""}`} aria-label="女娲上下文检查器">
        <header><div><PanelRight /><span><small>按需展开</small><strong>上下文检查器</strong></span></div><button type="button" aria-label={inspectorOpen ? "收起上下文检查器" : "展开上下文检查器"} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((open) => !open)}><PanelRight /></button></header>
        {inspectorOpen ? <><nav aria-label="检查器内容"><button type="button" aria-pressed={inspectorTab === "context"} onClick={() => setInspectorTab("context")}>角色知情</button><button type="button" aria-pressed={inspectorTab === "step"} onClick={() => setInspectorTab("step")}>步骤结果</button><button type="button" aria-pressed={inspectorTab === "log"} onClick={() => setInspectorTab("log")}>运行记录</button></nav>
          {inspectorTab === "context" ? <ContextInspector actors={actorContext} mode={run?.run ? "committed" : "preview"} participantLabels={new Map(bootstrap?.participants.map((participant) => [participant.id, participant.title]) ?? [])} sceneLabels={new Map(bootstrap?.storyUnits.map((unit) => [unit.id, unit.title]) ?? [])} /> : null}
          {inspectorTab === "step" ? <StepInspector step={selectedStep} /> : null}
          {inspectorTab === "log" ? <LogInspector run={run} /> : null}
        </> : null}
      </aside>
      </div>
      {run?.run && run.automaticApplication ? <ApplicationSummary application={run.automaticApplication} heardCount={run.run.steps.reduce((count, step) => count + step.heardStatements.length, 0)} onOpenEvent={openApplicationEvent} onOpenRelation={openApplicationRelation} onOpenFixedDraft={openFixedDraft} /> : null}
      {run?.run ? <footer className="nuwa-n1-composer"><form onSubmit={sendCue}><label><span>给当前排演的提示</span><textarea value={cue} onChange={(event) => setCue(event.target.value)} disabled={busy || !["running", "paused"].includes(run.run.status)} maxLength={800} rows={2} placeholder="例如：让下一步先确认钟楼内的声音来源。" /></label><button type="submit" className="primary-action" disabled={busy || !cue.trim() || !["running", "paused"].includes(run.run.status)}><Send />加入后续步骤</button></form><div><span>{selectedStepIds.length ? `已选择 ${selectedStepIds.length} 个结果` : run.authorization?.status === "active" ? "选择步骤后自动应用到授权范围" : "选择步骤后可送入待确认"}</span>{run.authorization?.status === "active" ? <button type="button" className="primary-action" disabled={busy || !selectedStepIds.length || !["completed", "cancelled"].includes(run.run.status)} onClick={autoApply}><CheckCircle2 />自动应用结果</button> : <button type="button" disabled={busy || !selectedStepIds.length || !["completed", "cancelled"].includes(run.run.status)} onClick={sendCandidate}><FilePlus2 />送入待确认</button>}{run.automaticApplication ? <span className="nuwa-n1-application-tools"><button type="button" disabled={busy || Boolean(run.automaticApplication.fixedDraft)} onClick={freezeDraft}>固定稿</button>{run.automaticApplication.fixedDraft ? <button type="button" onClick={openFixedDraft}>查看并下载固定稿</button> : null}<button type="button" className="danger-action" disabled={busy || run.automaticApplication.rollback?.status === "active"} onClick={rollbackApplication}>{run.automaticApplication.rollback?.status === "recovery-required" ? "恢复回溯" : "回溯本批"}</button></span> : null}</div></footer> : null}
      {run?.run ? <details className="nuwa-n1-technical"><summary>技术详情</summary><dl><div><dt>Run</dt><dd>{run.run.runId}</dd></div><div><dt>修订</dt><dd>{run.run.revision}</dd></div><div><dt>Provider</dt><dd>{run.run.provider.label} · {run.run.provider.providerCalls} calls</dd></div></dl></details> : null}
    </section>
  </main>;
}

function NuwaRunReader(props: { run: NuwaN1ReadModel; selectedStepId: string | null; selectedStepIds: string[]; onSelectStep(step: NuwaN1Step): void; onToggleCandidate(stepId: string): void }) {
  const run = props.run.run;
  if (!run) return null;
  if (!run.steps.length) return <section className="nuwa-n1-empty-run"><Sparkles /><strong>排演已建立，等待第一步</strong><p>选择“单步”开始局部演练；这里不会把场景输入直接写入正式 Event。</p></section>;
  return <section className="nuwa-n1-reader" aria-label="排演步骤"><header><div><small>按步骤阅读</small><h2>{run.scene.label}</h2></div><span>{run.participants.map((participant) => participant.title).join("、")}</span></header><ol>{run.steps.map((step) => {
    const actor = run.participants.find((participant) => participant.id === step.actorId);
    return <li key={step.stepId} className={step.stepId === props.selectedStepId ? "is-selected" : ""}><article><header><button type="button" aria-label={`查看第 ${step.sequence} 步`} onClick={() => props.onSelectStep(step)}><span>{step.sequence}</span><strong>{actor?.title ?? "角色"}</strong><small>已保存步骤</small></button><label><input type="checkbox" checked={props.selectedStepIds.includes(step.stepId)} onChange={() => props.onToggleCandidate(step.stepId)} /><span>选择结果</span></label></header><div className="nuwa-n1-step-intent"><small>人物意图</small><p>{step.intent}</p></div>{step.speech ? <blockquote><small>人物对白</small>{step.speech}</blockquote> : null}{step.action ? <div className="nuwa-n1-step-action"><small>人物行动</small><p>{step.action.action}</p></div> : null}<div className="nuwa-n1-step-observation"><EyeIcon /> <div><small>发生的结果</small><p>{step.observableResult}</p></div></div><details className="nuwa-n1-step-technical"><summary>查看本步骤依据与执行详情</summary><p>上下文工具：{step.tool.name}</p><p>输入 {step.usage.inputTokens} · 输出 {step.usage.outputTokens}（{step.usage.source === "reported" ? "执行器回报" : "保守估算，不是计费 token"}）</p><p>{step.contextEvidenceRefs.length} 条实际使用依据 · {step.heardStatements.length} 条定向听闻</p></details></article></li>;
  })}</ol></section>;
}

function ContextInspector(props: { mode: "preview" | "committed"; participantLabels: ReadonlyMap<string, string>; sceneLabels: ReadonlyMap<string, string>; actors: Array<{ actorId: string; actorLabel: string; localGoal: string; coreSummary: string; profileBasis: { core: string | null; boundaries: string | null; sourceRevision: string }; attention: { selected: Array<{ sourceId: string; reason: string }>; excluded: { count: number }; budget: { estimator: string; maxInputTokens: number; baseBytes: number; sourceBudgetBytes: number; selectedSourceBytes: number; outputReserveTokens: number; requiredOverflow: boolean } }; knowledgeItems: Array<{ id: string; summary: string; visibility: string }>; beliefItems: Array<{ id: string; summary: string; stance: string }>; memoryItems: Array<{ id: string; summary: string; source: { speakerId: string; sourceRunId: string; sourceStepId: string; sceneId: string; sceneObservedAt: string; workVersionId: string; workRevision: string; validity: "active" }; selectedByAttention?: boolean }>; evidenceRefs: string[]; excludedCount: number }> }) {
  if (!props.actors.length) return <section className="nuwa-n1-inspector-empty"><UsersRound /><p>选择参与者后可查看各自允许的上下文；未选择的人物不会收到这些材料。</p></section>;
  return <section className="nuwa-n1-context-list">{props.actors.map((actor) => <article key={actor.actorId}><header><strong>{actor.actorLabel}</strong><small>{props.mode === "preview" ? "本轮上下文预览" : "本步骤使用的依据"}</small></header><dl className="nuwa-n1-context-basis"><div><dt>角色核心</dt><dd>{actor.profileBasis.core ?? "未设置"}</dd></div><div><dt>底线</dt><dd>{actor.profileBasis.boundaries ?? "未设置"}</dd></div><div><dt>本场目标</dt><dd>{actor.localGoal}</dd></div></dl><p>{actor.knowledgeItems.length ? actor.knowledgeItems.map((item) => item.summary).join("；") : "当前没有可安全提供的已知内容。"}</p>{actor.beliefItems.length ? <p><small>信念与误解</small><br />{actor.beliefItems.map((item) => item.summary).join("；")}</p> : null}{actor.memoryItems.length ? <div className="nuwa-n1-memory-sources"><small>听闻 · 与正式关系、已确认事实分开</small><ul>{actor.memoryItems.map((item) => <li key={item.id}><span>{props.participantLabels.get(item.source.speakerId) ?? "一位角色"}在{props.sceneLabels.get(item.source.sceneId) ?? "先前场景"}告诉{actor.actorLabel}：{readableMemoryStatement(item.summary)}</span><small>{item.source.validity === "active" ? "当前有效" : item.source.validity}{item.selectedByAttention === false ? " · 本轮未选入" : " · 已选入本轮依据"}</small><details><summary>复制与定位来源</summary><code>{item.source.sourceRunId} / {item.source.sourceStepId} / {item.source.workVersionId}@r{item.source.workRevision} / {item.source.sceneObservedAt}</code></details></li>)}</ul></div> : null}<details className="nuwa-n1-context-technical"><summary>查看来源、修订与预算详情</summary><p>人物修订：{actor.profileBasis.sourceRevision}</p>{actor.attention.selected.length ? <ol className="nuwa-n1-attention-sources">{actor.attention.selected.map((source) => <li key={`${source.sourceId}:${source.reason}`}><span>{source.sourceId}</span><small>{attentionReasonLabel(source.reason)}</small></li>)}</ol> : <p>预算内没有额外可用依据。</p>}<div className="nuwa-n1-attention-budget"><small>UTF-8 保守估算</small><span>已选来源 {actor.attention.budget.selectedSourceBytes} / {actor.attention.budget.sourceBudgetBytes} 字节 · 完整输入上限 {actor.attention.budget.maxInputTokens} · 输出预留 {actor.attention.budget.outputReserveTokens}；不是实际计费 token</span></div></details><footer><span>{actor.evidenceRefs.length} 条已选来源</span>{actor.attention.excluded.count ? <span>{actor.attention.excluded.count} 条低相关来源未选入</span> : null}{actor.excludedCount ? <span>{actor.excludedCount} 项权限排除（身份隐藏）</span> : null}</footer></article>)}</section>;
}

function readableMemoryStatement(summary: string): string {
  return summary.match(/^听闻：.+? 说“(.+)”$/u)?.[1] ?? summary;
}

function StepInspector(props: { step: NuwaN1Step | null }) {
  if (!props.step) return <section className="nuwa-n1-inspector-empty"><FileClock /><p>选择一个排演步骤，查看它的执行结果与状态决定。</p></section>;
  return <section className="nuwa-n1-step-detail"><small>第 {props.step.sequence} 步</small><h3>本步骤结果</h3><dl><div><dt>人物意图</dt><dd>{props.step.intent}</dd></div>{props.step.speech ? <div><dt>人物对白</dt><dd>{props.step.speech}</dd></div> : null}{props.step.action ? <div><dt>人物行动</dt><dd>{props.step.action.action}</dd></div> : null}<div><dt>发生的结果</dt><dd>{props.step.observableResult}</dd></div>{props.step.heardStatements.length ? <div><dt>谁听到了</dt><dd>{props.step.heardStatements.map((heard) => <span key={heard.recipientId}>仅递送给 {heard.recipientId}</span>)}</dd></div> : null}</dl><details><summary>技术依据</summary><p>上下文工具：{props.step.tool.name}</p>{props.step.heardStatements.map((heard) => <p key={`${heard.recipientId}:source`}>听闻来源：{heard.sourceStepId}@{heard.sourceRevision}</p>)}{props.step.contextEvidenceRefs.map((reference) => <p key={`${reference.kind}:${reference.id}`}>{reference.visibility} · {reference.sourceId}@{reference.sourceRevision}</p>)}</details></section>;
}

function ApplicationSummary(props: { application: NonNullable<NuwaN1ReadModel["automaticApplication"]>; heardCount: number; onOpenEvent(): void; onOpenRelation(): void; onOpenFixedDraft(): void }) {
  const application = props.application;
  const rolledBack = application.status === "rolled-back";
  return <section className="nuwa-n1-application-summary" data-testid="nuwa-n1-application-summary" data-status={application.status}>
    <header><div><small>本场正式变化</small><h2>{rolledBack ? "本批已补偿回溯" : application.status === "applied" ? "授权范围内的变化已保存" : "自动应用需要恢复"}</h2><p>{rolledBack ? "原 Run、固定稿和历史回执保持可查；当前有效故事已按补偿版本更新。" : "显示来自实际 Owner 回执的结果；听闻单列，不与正式事实或关系合计。"}</p></div><strong>{application.status === "applied" ? "已应用" : application.status === "rolled-back" ? "已回溯" : "待恢复"}</strong></header>
    <dl><div><dt>正式事件</dt><dd>{application.eventId ? "1 项" : "0 项"}</dd></div><div><dt>正式关系</dt><dd>{application.relationId ? "1 项" : "0 项"}</dd></div><div><dt>叙事位置</dt><dd>{application.narrativePlacementIds.length} 项</dd></div><div><dt>人物新增听闻</dt><dd>{props.heardCount} 项</dd></div></dl>
    <nav aria-label="变化去向">{application.eventId ? <button type="button" onClick={props.onOpenEvent}>查看正式事件</button> : null}{application.relationId ? <button type="button" onClick={props.onOpenRelation}>比较这条关系</button> : <span>本批未配置合法关系类型，没有补造关系。</span>}{application.fixedDraft ? <button type="button" onClick={props.onOpenFixedDraft}>查看并下载固定稿</button> : <span>尚未固定本批故事稿。</span>}</nav>
  </section>;
}

function LogInspector(props: { run: NuwaN1ReadModel | null }) {
  const receipts = props.run?.receipts ?? [];
  const attempts = props.run?.run?.attempts ?? [];
  if (!receipts.length && !attempts.length) return <section className="nuwa-n1-inspector-empty"><History /><p>开始排演后，这里会显示关键状态、工具和回执；不会记录每次输入或角色不可见原文。</p></section>;
  return <ol className="nuwa-n1-log">{attempts.map((attempt) => {
    const provider = attempt.dispatches.filter((dispatch) => dispatch.phase === "provider");
    const internal = attempt.dispatches.filter((dispatch) => dispatch.phase !== "provider");
    return <li key={attempt.attemptId}><small>角色回合</small><p>{attemptOutcomeLabel(attempt.outcome)} · 模型发送 {provider.length} 次（{provider.map((dispatch) => providerDispatchStatusLabel(dispatch.status)).join("、") || "无"}）· 内部工具回合 {internal.length} 次 · 工具{toolStatusLabel(attempt.tool.status)}</p><time>{formatTime(attempt.updatedAt)}</time></li>;
  })}{receipts.map((receipt) => <li key={receipt.operationId}><small>{receipt.kind}</small><p>{receiptLabel(receipt.kind)} · 修订 {receipt.revision}</p><time>{formatTime(receipt.recordedAt)}</time></li>)}</ol>;
}

function NuwaUnavailable(props: { title: string; detail: string; loading?: boolean }) {
  return <main className="shell-workspace shell-workspace-nuwa"><section className="nuwa-n1-unavailable" role={props.loading ? "status" : "alert"}>{props.loading ? <RefreshCw /> : <AlertTriangle />}<h1>{props.title}</h1><p>{props.detail}</p></section></main>;
}

function statusLabel(status: NuwaN1Run["status"] | "ready") { return ({ ready: "准备中", running: "排演中", paused: "已暂停", completed: "已完成", cancelled: "已停止", blocked: "需要处理" } as const)[status]; }
function messageFor(reason: unknown, fallback: string) { return reason instanceof Error && reason.message ? reason.message : fallback; }
function EyeIcon() { return <CheckCircle2 aria-hidden="true" />; }
function selectedParticipants(bootstrap: NuwaN1Bootstrap | null, ids: string[], goals: Record<string, string>) { return bootstrap?.participants.filter((participant) => ids.includes(participant.id)).map((participant) => ({ ...participant, localGoal: goals[participant.id]?.normalize("NFC").trim() })) ?? []; }
function selectedStoryUnit(bootstrap: NuwaN1Bootstrap | null, id: string) { return bootstrap?.storyUnits.find((unit) => unit.id === id) ?? null; }
function newOperationId() { return `nuwa-n1.${crypto.randomUUID()}`; }
function receiptLabel(kind: "create" | "start" | "step" | "pause" | "resume" | "cancel" | "cue" | "handoff") { return ({ create: "建立排演", start: "开始排演", step: "完成一步", pause: "暂停排演", resume: "恢复排演", cancel: "停止排演", cue: "加入作者提示", handoff: "送入待确认" } as const)[kind]; }
function attemptOutcomeLabel(outcome: NuwaN1Run["attempts"][number]["outcome"]) { return ({ pending: "执行中", committed: "已提交", failed: "执行失败", cancelled: "已取消", blocked: "预算阻断" } as const)[outcome]; }
function toolStatusLabel(status: NuwaN1Run["attempts"][number]["tool"]["status"]) { return ({ pending: "等待中", completed: "已完成", failed: "失败", cancelled: "已取消" } as const)[status]; }
function providerDispatchStatusLabel(status: NuwaN1Run["attempts"][number]["dispatches"][number]["status"]) { return ({ reserved: "已预留", dispatched: "已进入发送", completed: "已完成", failed: "发送前失败", cancelled: "已取消", unknown: "结果未知" } as const)[status]; }
function runStepBudget(run: NuwaN1Run) { return run.scope.scenes.length === 1 ? 6 : Math.min(6, run.scope.scenes.length * 2); }
function internalToolTurns(run: NuwaN1Run) { return run.attempts.reduce((count, attempt) => count + attempt.dispatches.filter((dispatch) => dispatch.phase !== "provider").length, 0); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }); }
function attentionReasonLabel(reason: string) { return ({ "current-scene-required": "当前场景必需", "goal-keyword-match": "匹配角色目标", "scene-keyword-match": "匹配当前场景", "stable-authorized-fallback": "预算内稳定补充" } as Record<string, string>)[reason] ?? reason; }
