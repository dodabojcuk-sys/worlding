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
  replayNuwaN1Run,
  rollbackNuwaN1AutomaticApplication,
  runNuwaN1Action,
  runNuwaN1Continuously,
  setupNuwaN1,
  type NuwaN1Bootstrap,
  type NuwaN1ReadModel,
  type NuwaN1Run,
  type NuwaN1Setup,
  type NuwaN1Step
} from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

const MAX_PARTICIPANTS = 3;
const MIN_PARTICIPANTS = 2;

export function NuwaN1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const projectIdRef = useRef(projectId);
  const operationGeneration = useRef(0);
  projectIdRef.current = projectId;
  const [bootstrap, setBootstrap] = useState<NuwaN1Bootstrap | null>(null);
  const [run, setRun] = useState<NuwaN1ReadModel | null>(null);
  const [setup, setSetup] = useState<NuwaN1Setup | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [storyUnitId, setStoryUnitId] = useState("");
  const [relationTypeId, setRelationTypeId] = useState<string | null>(null);
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

  useEffect(() => {
    operationGeneration.current += 1;
    let active = true;
    setBootstrap(null); setRun(null); setSetup(null); setParticipantIds([]); setStoryUnitId(""); setRelationTypeId(null); setGoal(""); setSelectedStepIds([]); setBusy(false); setInterrupting(false); setError(null); setNotice(null);
    if (!projectId) return () => { active = false; };
    void Promise.all([getNuwaN1Bootstrap(projectId), getNuwaN1Latest(projectId)]).then(([nextBootstrap, latest]) => {
      if (!active) return;
      setBootstrap(nextBootstrap);
      setRun(latest.run ? latest : null);
      const requestedParticipantId = window.sessionStorage.getItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      const requestedParticipant = !latest.run && requestedParticipantId && nextBootstrap.participants.some((participant) => participant.id === requestedParticipantId) ? requestedParticipantId : null;
      if (requestedParticipantId) window.sessionStorage.removeItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      setParticipantIds(latest.run?.participants.map((participant) => participant.id) ?? (requestedParticipant ? [requestedParticipant] : []));
      setStoryUnitId(nextBootstrap.storyUnits[0]?.id ?? "");
      setRelationTypeId(nextBootstrap.relationTypes.length === 1 ? nextBootstrap.relationTypes[0]!.id : null);
      setGoal(latest.run?.goal ?? "让两位角色在当前场景中决定下一步行动。");
      setSelectedStepIds(latest.run?.steps.slice(-1).map((step) => step.stepId) ?? []);
      setSelectedStepId(latest.run?.steps.at(-1)?.stepId ?? null);
      if (requestedParticipant) setNotice(`已从角色档案加入 ${nextBootstrap.participants.find((participant) => participant.id === requestedParticipant)?.title ?? "该角色"}；再选择 1–2 位正式角色即可开始。`);
    }).catch((reason: unknown) => {
      if (active) setError(messageFor(reason, "女娲工作面未能读取本地作品；现有作品没有被修改。"));
    });
    return () => { active = false; };
  }, [projectId]);

  const canPrepare = participantIds.length >= MIN_PARTICIPANTS && Boolean(storyUnitId) && Boolean(goal.trim());
  const selectedStep = run?.run?.steps.find((step) => step.stepId === selectedStepId) ?? null;
  const actorContext = useMemo(() => {
    if (run?.contextInspector && run.run) {
      return run.contextInspector.actors.map((context) => ({
        actorId: context.actorId,
        actorLabel: run.run!.participants.find((participant) => participant.id === context.actorId)?.title ?? "当前角色",
        knowledgeItems: context.knowledgeItems,
        beliefItems: context.beliefItems,
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
      const participants = selectedParticipants(bootstrap, participantIds);
      const storyUnit = selectedStoryUnit(bootstrap, storyUnitId);
      if (!storyUnit) throw new Error("当前故事单元已不可用，请重新选择后再准备。");
      const next = await props.runtime.withConnection((token) => setupNuwaN1({ projectId, participants, storyUnit, goal: goal.trim(), operationId: newOperationId(), token }));
      if (!isCurrentOperation(scope)) return;
      setSetup(next); setNotice("上下文预览已生成；角色只会收到各自允许的依据。"); setInspectorOpen(true); setInspectorTab("context");
    } catch (reason) { if (isCurrentOperation(scope)) setError(messageFor(reason, "准备上下文失败；没有启动排演。")); }
    finally { if (isCurrentOperation(scope)) setBusy(false); }
  };
  const create = () => {
    if (!projectId || !canPrepare) return;
    const participants = selectedParticipants(bootstrap, participantIds);
    const storyUnit = selectedStoryUnit(bootstrap, storyUnitId);
    if (!storyUnit) return;
    void act(() => props.runtime.withConnection((token) => createNuwaN1Run({ projectId, participants, storyUnit, goal: goal.trim(), relationTypeId, operationId: newOperationId(), token })), "已建立本地工程演练；尚未调用真实 Provider。");
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
    setRun(null); setSetup(null); setSelectedStepIds([]); setSelectedStepId(null); setCue(""); setError(null);
    setNotice("旧 Run 仍可从运行记录回看；现在可以按当前作品范围建立新排演。");
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
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "回溯未完整结束；请在本页恢复同一回执，系统不会显示为已全部回溯。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const openFixedDraft = () => {
    const artifactId = run?.automaticApplication?.fixedDraft?.artifactId;
    if (!projectId || !artifactId) return;
    window.sessionStorage.setItem(`tianyan-creation-source-artifact:${projectId}`, artifactId);
    // Keep the exact pinned identity in the route as well as the one-shot
    // handoff.  A Creation mount may otherwise see several historical drafts
    // after a refresh and correctly refuse to guess which one to open.
    window.location.assign(`/creation?artifactId=${encodeURIComponent(artifactId)}`);
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
    <section className="nuwa-n1-workspace" data-testid="nuwa-n1-workspace" data-run-status={status} data-provider-calls={availability?.providerCalls ?? 0}>
      <header className="nuwa-n1-header">
        <div><small>有界排演 · 当前作品</small><h1>女娲</h1><p>{run?.run ? run.authorization?.status === "active" ? `围绕“${run.run.scene.label}”持续运行；当前高权限范围可自动执行并保留回溯。` : `围绕“${run.run.scene.label}”继续读取 Run 内变化；结果需走待确认。` : "先选定一个故事单元与 2–3 位正式角色，建立可恢复的局部排演。"}</p></div>
        <div className={`nuwa-n1-runtime-state is-${availability?.kind ?? "unavailable"}`}><Bot /><div><strong>{availability?.label ?? "本地作品服务未连接"}</strong><span>{localFake ? "本地工程演练 · 0 Provider" : executable ? "已配置执行器；开始排演才会发送明确授权的请求。" : "无可执行 Provider；不会自动回退为假对话。"}</span></div></div>
      </header>

      {error ? <p className="nuwa-n1-message is-error" role="alert"><AlertTriangle />{error}</p> : null}
      {notice ? <p className="nuwa-n1-message is-notice" role="status"><CheckCircle2 />{notice}</p> : null}
      {run?.authorization ? <p className="nuwa-n1-message is-notice" data-testid="nuwa-n1-authorization"><ShieldCheck />{run.authorization.status === "active" ? `高权限自动执行已授权：当前 Run、${run.authorization.storyUnitId} 与 ${run.authorization.actorIds.length} 位角色；最多 ${run.authorization.maxSteps} 步 / ${run.authorization.maxProviderDispatches} 次模型发送，可随时停止或回溯。` : "此 Run 的高权限授权已失效；不会继续自动写入。"}</p> : null}

      <section className="nuwa-n1-controlbar" aria-label="排演范围与操作">
        <label><span>当前场景</span><select value={storyUnitId} disabled={Boolean(run) || busy} onChange={(event) => { setStoryUnitId(event.target.value); setSetup(null); }}>{bootstrap?.storyUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label>
        <label><span>自动关系类型</span><select value={relationTypeId ?? ""} disabled={Boolean(run) || busy || !bootstrap?.relationTypes.length} onChange={(event) => setRelationTypeId(event.target.value || null)}><option value="">不写关系</option>{bootstrap?.relationTypes.map((type) => <option key={type.id} value={type.id}>{type.title}</option>)}</select></label>
        <label className="nuwa-n1-goal"><span>局部目标</span><input value={goal} disabled={Boolean(run) || busy} onChange={(event) => { setGoal(event.target.value); setSetup(null); }} maxLength={240} placeholder="例如：决定是否沿旧桥继续追查" /></label>
        <div className="nuwa-n1-status"><span>状态</span><strong>{statusLabel(status)}</strong>{run?.run ? <small>{run.run.steps.length} / 6 步 · 本地/网络模型发送 {run.run.providerDispatches} / 12 · 内部工具回合 {internalDispatches(run.run)}</small> : <small>最多 6 个已提交步骤</small>}</div>
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
        <footer><span>{participantIds.length < MIN_PARTICIPANTS ? `还需要选择 ${MIN_PARTICIPANTS - participantIds.length} 位角色。` : "范围准备就绪；可先检查上下文。"}</span><button type="button" disabled={!canPrepare || busy} onClick={prepare}><ShieldCheck />查看上下文</button></footer>
      </section> : run?.run ? <NuwaRunReader run={run} selectedStepId={selectedStepId} selectedStepIds={selectedStepIds} onSelectStep={(step) => { setSelectedStepId(step.stepId); setInspectorOpen(true); setInspectorTab("step"); }} onToggleCandidate={(stepId) => setSelectedStepIds((current) => current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId])} /> : null}

      {!run && setup ? <section className="nuwa-n1-context-preview"><ShieldCheck /><div><strong>已核对角色上下文</strong><p>{setup.setup.contextPreview.map((actor) => `${bootstrap?.participants.find((item) => item.id === actor.actorId)?.title ?? "角色"}：${actor.knowledgeItems.length} 项已知、${actor.beliefItems.length} 项信念`).join("；")}</p></div></section> : null}
        </div>

      <aside className={`nuwa-n1-inspector ${inspectorOpen ? "is-open" : ""}`} aria-label="女娲上下文检查器">
        <header><div><PanelRight /><span><small>按需展开</small><strong>上下文检查器</strong></span></div><button type="button" aria-label={inspectorOpen ? "收起上下文检查器" : "展开上下文检查器"} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((open) => !open)}><PanelRight /></button></header>
        {inspectorOpen ? <><nav aria-label="检查器内容"><button type="button" aria-pressed={inspectorTab === "context"} onClick={() => setInspectorTab("context")}>角色知情</button><button type="button" aria-pressed={inspectorTab === "step"} onClick={() => setInspectorTab("step")}>步骤结果</button><button type="button" aria-pressed={inspectorTab === "log"} onClick={() => setInspectorTab("log")}>运行记录</button></nav>
          {inspectorTab === "context" ? <ContextInspector actors={actorContext} /> : null}
          {inspectorTab === "step" ? <StepInspector step={selectedStep} /> : null}
          {inspectorTab === "log" ? <LogInspector run={run} /> : null}
        </> : null}
      </aside>
      </div>
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
    return <li key={step.stepId} className={step.stepId === props.selectedStepId ? "is-selected" : ""}><article><header><button type="button" aria-label={`查看第 ${step.sequence} 步`} onClick={() => props.onSelectStep(step)}><span>{step.sequence}</span><strong>{actor?.title ?? "角色"}</strong><small>已提交到 Run</small></button><label><input type="checkbox" checked={props.selectedStepIds.includes(step.stepId)} onChange={() => props.onToggleCandidate(step.stepId)} /><span>选择结果</span></label></header><div className="nuwa-n1-step-intent"><small>意图</small><p>{step.intent}</p></div>{step.speech ? <blockquote><small>台词</small>{step.speech}</blockquote> : null}{step.action ? <div className="nuwa-n1-step-action"><small>动作</small><p>{step.action.action}</p></div> : null}<div className="nuwa-n1-step-observation"><EyeIcon /> <div><small>可观察结果</small><p>{step.observableResult}</p></div></div><footer><span data-kind="tool">{step.tool.name}</span><span data-kind="receipt">输入 {step.usage.inputTokens} · 输出 {step.usage.outputTokens}（{step.usage.source === "reported" ? "计量" : "保守估算"}）</span></footer></article></li>;
  })}</ol></section>;
}

function ContextInspector(props: { actors: Array<{ actorId: string; actorLabel: string; knowledgeItems: Array<{ id: string; summary: string; visibility: string }>; beliefItems: Array<{ id: string; summary: string; stance: string }>; evidenceRefs: string[]; excludedCount: number }> }) {
  if (!props.actors.length) return <section className="nuwa-n1-inspector-empty"><UsersRound /><p>选择参与者后可查看各自允许的上下文；未选择的人物不会收到这些材料。</p></section>;
  return <section className="nuwa-n1-context-list">{props.actors.map((actor) => <article key={actor.actorId}><header><strong>{actor.actorLabel}</strong><small>角色可知范围</small></header><p>{actor.knowledgeItems.length ? actor.knowledgeItems.map((item) => item.summary).join("；") : "当前没有可安全提供的已知内容。"}</p>{actor.beliefItems.length ? <p><small>信念与误解</small><br />{actor.beliefItems.map((item) => item.summary).join("；")}</p> : null}<footer><span>{actor.evidenceRefs.length} 条来源依据</span>{actor.excludedCount ? <span>{actor.excludedCount} 项已排除</span> : null}</footer></article>)}</section>;
}

function StepInspector(props: { step: NuwaN1Step | null }) {
  if (!props.step) return <section className="nuwa-n1-inspector-empty"><FileClock /><p>选择一个排演步骤，查看它的执行结果与状态决定。</p></section>;
  return <section className="nuwa-n1-step-detail"><small>第 {props.step.sequence} 步</small><h3>执行结果</h3><dl><div><dt>意图</dt><dd>{props.step.intent}</dd></div>{props.step.speech ? <div><dt>台词</dt><dd>{props.step.speech}</dd></div> : null}{props.step.action ? <div><dt>动作</dt><dd>{props.step.action.action}</dd></div> : null}<div><dt>可观察结果</dt><dd>{props.step.observableResult}</dd></div><div><dt>上下文工具</dt><dd>{props.step.tool.name}</dd></div>{props.step.heardStatements.length ? <div><dt>说法传播</dt><dd>{props.step.heardStatements.map((heard) => <span key={heard.recipientId}>仅递送至 {heard.recipientId} · 来源 {heard.sourceStepId}@{heard.sourceRevision}</span>)}</dd></div> : null}{props.step.contextEvidenceRefs.length ? <div><dt>实际上下文依据</dt><dd>{props.step.contextEvidenceRefs.map((reference) => <span key={`${reference.kind}:${reference.id}`}>{reference.visibility} · {reference.sourceId}@{reference.sourceRevision}</span>)}</dd></div> : null}</dl></section>;
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
function selectedParticipants(bootstrap: NuwaN1Bootstrap | null, ids: string[]) { return bootstrap?.participants.filter((participant) => ids.includes(participant.id)) ?? []; }
function selectedStoryUnit(bootstrap: NuwaN1Bootstrap | null, id: string) { return bootstrap?.storyUnits.find((unit) => unit.id === id) ?? null; }
function newOperationId() { return `nuwa-n1.${crypto.randomUUID()}`; }
function receiptLabel(kind: "create" | "start" | "step" | "pause" | "resume" | "cancel" | "cue" | "handoff") { return ({ create: "建立排演", start: "开始排演", step: "完成一步", pause: "暂停排演", resume: "恢复排演", cancel: "停止排演", cue: "加入作者提示", handoff: "送入待确认" } as const)[kind]; }
function attemptOutcomeLabel(outcome: NuwaN1Run["attempts"][number]["outcome"]) { return ({ pending: "执行中", committed: "已提交", failed: "执行失败", cancelled: "已取消", blocked: "预算阻断" } as const)[outcome]; }
function toolStatusLabel(status: NuwaN1Run["attempts"][number]["tool"]["status"]) { return ({ pending: "等待中", completed: "已完成", failed: "失败", cancelled: "已取消" } as const)[status]; }
function providerDispatchStatusLabel(status: NuwaN1Run["attempts"][number]["dispatches"][number]["status"]) { return ({ reserved: "已预留", dispatched: "已进入发送", completed: "已完成", failed: "发送前失败", cancelled: "已取消", unknown: "结果未知" } as const)[status]; }
function internalDispatches(run: NuwaN1Run) { return run.attempts.flatMap((attempt) => attempt.dispatches).filter((dispatch) => dispatch.phase !== "provider").length; }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }); }
