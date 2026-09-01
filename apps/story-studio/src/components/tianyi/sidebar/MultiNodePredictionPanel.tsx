import { ArrowLeft, Ban, Check, ChevronRight, CircleCheck, Clock3, GitBranch, LoaderCircle, Play, RotateCcw, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { derivePredictionReviewGate, type IdentityResolutionKind, type PredictionRun } from "../../../../../../src/storyContracts/multiNodePrediction.ts";
import type { StoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import { acceptMultiNodePredictionReview, abandonMultiNodePredictionRun, createMultiNodePredictionReview, createMultiNodePredictionRun, executeMultiNodePredictionRun, getMultiNodePredictionExecution, listMultiNodePredictionReviews, listMultiNodePredictionRuns, retryMultiNodePredictionRun, stopMultiNodePredictionRun, type MultiNodePredictionReviewProjection, type TianyiPredictionExecutionProjection } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import {
  predictionSourceSummary,
  predictionStageForView,
  predictionViewAfterEscape,
  predictionViewAfterPathSelection,
  predictionViewStateFromPersistence,
  type TianyiPredictionViewState
} from "./tianyiPredictionViewState";

type PredictionPhase = "idle" | "reading" | "generating" | "validating" | "reviewing" | "failed" | "stopped";
type DraftReceipt = { operationId: string; runId: string; pathId: string; items: Array<{ candidateNodeId: string; action: "draft-created" | "referenced-existing" | "merge-review"; draftEventId: string | null; existingEventId: string | null }> };
type PredictionSelectionDetail = { runId: string; pathId: string; selectedCandidateNodeIds: string[]; origin: "tianyi" | "canvas" };
type PredictionViewDetail = { runId: string; view: TianyiPredictionViewState; pathId: string | null };

/** Candidate-only author controls. Canon, WorldState and formal Relations stay outside this component. */
export function MultiNodePredictionPanel(props: { runtime: TianyanShellRuntimeState; eventRefs: StoryStudioEventReference[]; sourceLabels?: string[]; sourceUnitSummary?: string }) {
  const [goal, setGoal] = useState("推演这些事件之后可能发生的连续发展。");
  const [run, setRun] = useState<PredictionRun | null>(null);
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [pathId, setPathId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<PredictionPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<DraftReceipt | null>(null);
  const [execution, setExecution] = useState<TianyiPredictionExecutionProjection | null>(null);
  const [viewState, setViewState] = useState<TianyiPredictionViewState>("task");
  const pollingGeneration = useRef(0);
  const stopRequested = useRef(false);
  const adjustGoalRef = useRef<HTMLTextAreaElement>(null);
  const project = props.runtime.project;
  const sourceKey = props.eventRefs.map((reference) => `${reference.eventId}:${reference.revisionToken}`).join("|");
  const activePath = run?.bundle?.paths.find((path) => path.id === pathId) ?? null;
  const gate = useMemo(() => run ? derivePredictionReviewGate({ run, pathId, operationPending: busy }) : { allowed: false, reasons: ["prediction-not-ready"] }, [busy, pathId, run]);

  useEffect(() => {
    if (!project || !props.eventRefs.length) { setRun(null); return; }
    let active = true;
    setPhase("reading");
    void props.runtime.withConnection((token) => listMultiNodePredictionRuns(project.id, token)).then((history) => {
      if (!active) return;
      setRuns(history);
      const matching = history.find((candidate) => candidate.sourceSnapshot.map((reference) => `${reference.eventId}:${reference.revisionToken}`).join("|") === sourceKey) ?? null;
      setRun(matching);
      props.runtime.setActiveAgentRunId(matching?.runId ?? null);
      setPhase(matching?.status === "ready" ? "reviewing" : matching?.status === "stopped" ? "stopped" : matching?.status === "failed" ? "failed" : "idle");
      setViewState(predictionViewStateFromPersistence({ runStatus: matching?.status ?? null, hasBundle: Boolean(matching?.bundle), selectedPathId: null, hasReceipt: false }));
      if (matching) {
        announceRun(matching);
        if (["generating", "validating"].includes(matching.status)) beginExecutionPolling(matching.runId);
        void props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId: matching.runId, token })).then((projection) => { if (active && projection) { setExecution(projection); announceExecution(projection); } }).catch(() => undefined);
      }
    }).catch(() => { if (active) { setRun(null); setPhase("idle"); } });
    return () => { active = false; };
  }, [project, props.eventRefs.length, props.runtime, sourceKey]);

  useEffect(() => {
    setPathId(null); setSelectedNodeIds([]); setReceipt(null);
    if (run) {
      announceRun(run);
      setViewState(predictionViewStateFromPersistence({ runStatus: run.status, hasBundle: Boolean(run.bundle), selectedPathId: null, hasReceipt: false }));
    }
  }, [run?.runId]);

  useEffect(() => {
    if (!project || !run) return;
    let active = true;
    void listMultiNodePredictionReviews(project.id, run.runId).then((reviews) => {
      const drafted = reviews.find((review) => review.status === "drafted");
      if (!active || !drafted) return;
      setPathId(drafted.pathId); setSelectedNodeIds(drafted.selectedCandidateNodeIds); setReceipt(normalizeReceipt(drafted));
      setViewState("receipt");
      announceSelection({ runId: run.runId, pathId: drafted.pathId, selectedCandidateNodeIds: drafted.selectedCandidateNodeIds, origin: "tianyi" });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [project, run]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<PredictionSelectionDetail>).detail;
      if (!run || detail?.origin !== "canvas" || detail.runId !== run.runId) return;
      setPathId(detail.pathId); setSelectedNodeIds(detail.selectedCandidateNodeIds); setReceipt(null);
      setViewState(predictionViewAfterPathSelection(detail.pathId));
    };
    window.addEventListener("story-studio-prediction-review-selection", receive);
    return () => window.removeEventListener("story-studio-prediction-review-selection", receive);
  }, [run]);

  useEffect(() => {
    if (!run) return;
    announceViewState({ runId: run.runId, view: viewState, pathId });
  }, [pathId, run, viewState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const next = predictionViewAfterEscape(viewState);
      if (next === viewState) return;
      event.preventDefault();
      setViewState(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewState]);

  const start = () => void (async () => {
    if (!project || props.eventRefs.length < 1 || props.eventRefs.length > 4 || busy) return;
    setBusy(true); setError(""); setReceipt(null); setPhase("generating");
    setViewState("running");
    stopRequested.current = false; announceAgentState(true, null);
    try {
      const runId = `prediction-run.${crypto.randomUUID()}`;
      const created = await props.runtime.withConnection((token) => createMultiNodePredictionRun({ request: { projectId: project.id, sourceEventRefs: props.eventRefs, authorGoal: goal.trim(), predictionMode: "forward-development", operationId: `prediction-request.${crypto.randomUUID()}` }, runId, token }));
      props.runtime.setActiveAgentRunId(created.runId);
      announceAgentState(true, created.runId);
      setRun(created); announceRun(created); setPhase("validating");
      beginExecutionPolling(created.runId);
      const ready = await props.runtime.withConnection((token) => executeMultiNodePredictionRun({ projectId: project.id, runId: created.runId, token }));
      setRun(ready); setRuns((current) => [ready, ...current.filter((item) => item.runId !== ready.runId)]); announceRun(ready);
      const execution = await props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId: ready.runId, token }));
      if (execution) { setExecution(execution); announceExecution(execution); }
      setBusy(false); setPhase("reviewing");
      setViewState("overview");
    } catch (cause) { if (!stopRequested.current) setError(cause instanceof Error ? cause.message : "推演未完成，原事件没有改变。"); setPhase(stopRequested.current ? "stopped" : "failed"); setViewState("task"); }
    finally { pollingGeneration.current += 1; setBusy(false); announceAgentState(false, run?.runId ?? props.runtime.activeAgentRunId); }
  })();
  const beginExecutionPolling = (runId: string) => {
    if (!project) return;
    const generation = ++pollingGeneration.current;
    void (async () => {
      while (pollingGeneration.current === generation) {
        try {
          const projection = await props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId, token }));
          if (projection) { setExecution(projection); announceExecution(projection); }
        } catch { /* a not-yet-created execution sidecar is recoverable while the run starts */ }
        await new Promise((resolve) => window.setTimeout(resolve, 90));
      }
    })();
  };
  const choosePath = (nextPathId: string) => {
    if (!run) return;
    const nextPath = run.bundle?.paths.find((path) => path.id === nextPathId) ?? null;
    const nextSelected = nextPath?.candidateNodeIds ?? [];
    setPathId(nextPathId); setSelectedNodeIds(nextSelected); setReceipt(null);
    setViewState(predictionViewAfterPathSelection(nextPathId));
    announceSelection({ runId: run.runId, pathId: nextPathId, selectedCandidateNodeIds: nextSelected, origin: "tianyi" });
  };
  const toggleNode = (nodeId: string, checked: boolean) => {
    if (!run || !pathId) return;
    const next = checked ? [...selectedNodeIds, nodeId].filter((id, index, values) => values.indexOf(id) === index) : selectedNodeIds.filter((id) => id !== nodeId);
    setSelectedNodeIds(next); setReceipt(null); announceSelection({ runId: run.runId, pathId, selectedCandidateNodeIds: next, origin: "tianyi" });
  };
  const accept = () => void (async () => {
    if (!project || !run || !pathId || !gate.allowed || !selectedNodeIds.length) return;
    setBusy(true); setError("");
    try {
      const review = await props.runtime.withConnection((token) => createMultiNodePredictionReview({ projectId: project.id, runId: run.runId, pathId, selectedCandidateNodeIds: selectedNodeIds, decidedAt: new Date().toISOString(), token }));
      const accepted = await props.runtime.withConnection((token) => acceptMultiNodePredictionReview({ projectId: project.id, reviewId: review.id, operationId: `prediction-accept.${review.id}`, decidedAt: new Date().toISOString(), token }));
      setReceipt(normalizeReceipt(accepted));
      setViewState("receipt");
      if (accepted.status === "drafted") window.dispatchEvent(new CustomEvent("story-studio-prediction-drafts-created", { detail: { projectId: project.id, runId: run.runId } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "采纳未完成，候选仍保持预览状态。"); }
    finally { setBusy(false); }
  })();
  const selectRun = (runId: string) => { const selected = runs.find((item) => item.runId === runId) ?? null; setRun(selected); setPhase(selected?.status === "ready" ? "reviewing" : selected?.status === "stopped" ? "stopped" : selected?.status === "failed" ? "failed" : "idle"); setViewState(predictionViewStateFromPersistence({ runStatus: selected?.status ?? null, hasBundle: Boolean(selected?.bundle), selectedPathId: null, hasReceipt: false })); };
  const abandon = () => void (async () => {
    if (!project || !run || busy || run.status === "abandoned") return;
    setBusy(true); setError("");
    try { const abandoned = await props.runtime.withConnection((token) => abandonMultiNodePredictionRun({ projectId: project.id, runId: run.runId, token })); setRun(abandoned); setRuns((current) => current.map((item) => item.runId === abandoned.runId ? abandoned : item)); setReceipt(null); announceRun(abandoned); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法放弃当前 Run。"); }
    finally { setBusy(false); }
  })();
  const stop = () => void (async () => {
    if (!project || !run || !busy || stopRequested.current) return;
    stopRequested.current = true; setError("");
    try {
      const stopped = await props.runtime.withConnection((token) => stopMultiNodePredictionRun({ projectId: project.id, runId: run.runId, reason: "作者停止了本次推演。", token }));
      setRun(stopped); setPhase("stopped"); setViewState("task"); announceRun(stopped);
      const projection = await props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId: run.runId, token }));
      if (projection) { setExecution(projection); announceExecution(projection); }
    } catch (cause) { stopRequested.current = false; setError(cause instanceof Error ? cause.message : "未能停止本次推演。"); }
  })();
  const retry = () => void (async () => {
    if (!project || !run || busy || !["failed", "stopped"].includes(run.status)) return;
    setBusy(true); setError(""); setReceipt(null); setPhase("generating"); setViewState("running"); stopRequested.current = false; announceAgentState(true, run.runId); beginExecutionPolling(run.runId);
    try {
      const ready = await props.runtime.withConnection((token) => retryMultiNodePredictionRun({ projectId: project.id, runId: run.runId, token }));
      setRun(ready); setRuns((current) => current.map((item) => item.runId === ready.runId ? ready : item)); announceRun(ready);
      const projection = await props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId: ready.runId, token }));
      if (projection) { setExecution(projection); announceExecution(projection); }
      setBusy(false); setPhase("reviewing");
      setViewState("overview");
    } catch (cause) { if (!stopRequested.current) setError(cause instanceof Error ? cause.message : "重试未完成。"); setPhase(stopRequested.current ? "stopped" : "failed"); setViewState("task"); }
    finally { pollingGeneration.current += 1; setBusy(false); announceAgentState(false, run.runId); }
  })();

  useEffect(() => {
    const onStop = () => stop();
    const onRetry = () => retry();
    window.addEventListener("story-studio-stop-agent-execution", onStop);
    window.addEventListener("story-studio-retry-agent-execution", onRetry);
    return () => { window.removeEventListener("story-studio-stop-agent-execution", onStop); window.removeEventListener("story-studio-retry-agent-execution", onRetry); };
  });

  useEffect(() => () => { pollingGeneration.current += 1; }, []);

  if (!project || props.eventRefs.length < 1 || props.eventRefs.length > 4) return null;
  const pathNumber = activePath && run?.bundle ? run.bundle.paths.findIndex((path) => path.id === activePath.id) + 1 : 0;
  const adoption = summarizeAdoption(run, activePath, selectedNodeIds);
  const hasTimeConflict = gate.reasons.some((reason) => reason.startsWith("time-conflict:"));
  const stage = predictionStageForView(viewState);
  const returnToOverview = () => setViewState("overview");
  const returnToTask = () => {
    setViewState("task");
    window.requestAnimationFrame(() => adjustGoalRef.current?.focus());
  };
  const openExecution = () => {
    if (execution) announceExecution(execution);
    if (run) window.dispatchEvent(new CustomEvent("story-studio-open-agent-execution", { detail: { runId: run.runId } }));
  };
  const primary = viewState === "task"
    ? <button type="button" className="primary-action" disabled={busy || !goal.trim()} onClick={["failed", "stopped"].includes(run?.status ?? "") ? retry : start}>{["failed", "stopped"].includes(run?.status ?? "") ? <RotateCcw /> : <Play />}{["failed", "stopped"].includes(run?.status ?? "") ? "重新推演" : "开始推演"}</button>
    : viewState === "running"
      ? <button type="button" className="secondary-action is-stop" disabled={!busy || stopRequested.current} onClick={stop}>停止本次推演</button>
      : viewState === "overview"
        ? <button type="button" className="primary-action" disabled>请从画布或列表选择路径</button>
        : viewState === "focus"
          ? <button type="button" className="primary-action" disabled={!activePath || !gate.allowed} onClick={() => setViewState("review")}><Check />进入节点审阅</button>
          : viewState === "review"
            ? <button type="button" className="primary-action" disabled={!gate.allowed || !selectedNodeIds.length} onClick={accept}><Check />{adoptionButtonLabel(adoption)}</button>
            : <button type="button" className="primary-action" onClick={() => window.dispatchEvent(new CustomEvent("story-studio-prediction-return-event-graph"))}><ArrowLeft />返回正式事件图</button>;

  return <section className="tianyi-prediction-panel is-staged" aria-label="多节点推演" data-prediction-phase={phase} data-prediction-view={viewState}>
    <header className="tianyi-prediction-header"><div><small>事件线 · 天意 Agent</small><strong>多节点推演</strong></div><span className="tianyi-prediction-candidate-badge">候选</span></header>
    <nav className="tianyi-prediction-stage-marker" aria-label="推演阶段">{(["task", "running", "candidates", "review"] as const).map((item) => <span key={item} data-state={item === stage ? "active" : stageOrder(item) < stageOrder(stage) ? "complete" : "pending"}>{item === "task" ? "任务" : item === "running" ? "运行" : item === "candidates" ? "候选" : "审阅"}</span>)}</nav>
    <div className="tianyi-prediction-scroll">
      <section className="tianyi-prediction-source-summary" aria-label={`推演范围，${props.eventRefs.length} 个节点`}><span>推演依据</span><strong>{predictionSourceSummary(props.eventRefs.length, props.sourceUnitSummary)}</strong><small>完整顺序在画布顶部托盘管理</small></section>

      {viewState === "task" ? <section className="tianyi-prediction-stage-content" aria-label="推演任务">
        <div className="tianyi-prediction-stage-heading"><span>01</span><div><small>任务</small><h2>准备后续发展推演</h2></div></div>
        <label className="tianyi-prediction-goal"><span>作者要求</span><textarea ref={adjustGoalRef} value={goal} maxLength={1000} rows={4} disabled={busy} onChange={(event) => setGoal(event.target.value)} /></label>
        <label className="tianyi-prediction-mode"><span>推演方式</span><select value="forward-development" disabled><option value="forward-development">后续发展</option></select></label>
        <section className="tianyi-prediction-task-checks"><span><CircleCheck />只读取版本化事件依据</span><span><CircleCheck />结果先进入候选预览</span><span><CircleCheck />正式写入仍需作者审阅</span></section>
        {error ? <p className="tianyi-error" role="alert">{error}</p> : null}
        {run?.status === "abandoned" ? <p className="tianyi-prediction-receipt" role="status">本次推演已放弃；既有草稿和历史回执均保留。</p> : null}
      </section> : null}

      {viewState === "running" ? <section className="tianyi-prediction-stage-content" aria-label="推演运行">
        <div className="tianyi-prediction-stage-heading"><span>02</span><div><small>运行</small><h2>正在生成并检查候选</h2></div></div>
        <PredictionProgress phase={phase} run={run} />
        <button type="button" className="tianyi-prediction-execution-link" disabled={!execution} onClick={openExecution}><Workflow aria-hidden="true" />查看执行过程</button>
        <p className="tianyi-prediction-connection-note">切换到 Dialogue 不会取消当前 Agent 任务。</p>
      </section> : null}

      {viewState === "overview" && run?.bundle ? <section className="tianyi-prediction-stage-content" aria-label="候选路径总览">
        <div className="tianyi-prediction-stage-heading"><span>03</span><div><small>候选</small><h2>{run.bundle.paths.length} 条路径可同时比较</h2></div></div>
        <p className="tianyi-prediction-stage-helper">中央画布与这里使用同一条路径选择。候选仍未写入正式事件线。</p>
        <PathList run={run} pathId={pathId} onChoose={choosePath} />
      </section> : null}

      {viewState === "focus" && activePath && run?.bundle ? <section className="tianyi-prediction-stage-content" aria-label={`聚焦路径 ${activePath.title}`}>
        <div className="tianyi-prediction-stage-heading"><span>03</span><div><small>当前路径 · {pathNumber}</small><h2 title={activePath.title}>{activePath.title}</h2></div></div>
        <p className="tianyi-prediction-stage-helper">中央画布已聚焦这条路径；按 Escape 返回全部路径。</p>
        <PathNodeSummary run={run} pathId={activePath.id} />
        {hasTimeConflict ? <section className="tianyi-prediction-conflict-help" role="note"><strong>这条路径暂时不可采纳</strong><p>候选时间与现有故事顺序冲突；当前路径不会写入正式事件、正式关系或世界状态。</p><button type="button" onClick={returnToTask}>返回修正推演要求</button><button type="button" onClick={returnToOverview}>返回候选总览</button></section> : null}
        {!gate.allowed && !hasTimeConflict ? <small className="tianyi-prediction-gate">审阅已禁用：{gateReason(gate.reasons)}</small> : null}
        <button type="button" className="tianyi-prediction-text-action" onClick={returnToOverview}><ArrowLeft />返回候选总览</button>
      </section> : null}

      {viewState === "review" && activePath && run?.bundle ? <section className="tianyi-prediction-stage-content" aria-label={`审阅路径 ${activePath.title}`}>
        <div className="tianyi-prediction-stage-heading"><span>04</span><div><small>审阅 · 路径 {pathNumber}</small><h2 title={activePath.title}>{activePath.title}</h2></div></div>
        <p className="tianyi-prediction-stage-helper">逐个确认写入影响；未选节点会明确跳过。</p>
        <section className="tianyi-prediction-review">{activePath.candidateNodeIds.map((nodeId) => {
          const node = run.bundle!.nodes.find((item) => item.id === nodeId)!;
          const blocked = node.identityResolution.kind === "unresolved" || node.timeConsistency.kind === "conflict";
          return <label key={node.id} className="tianyi-prediction-node"><input type="checkbox" checked={selectedNodeIds.includes(node.id)} disabled={busy || blocked} onChange={(event) => toggleNode(node.id, event.target.checked)} /><span><strong title={node.title}>{node.title}</strong><small>身份：{identityLabel(node.identityResolution.kind)}</small><small className={node.timeConsistency.kind === "conflict" ? "is-blocked" : ""}>时间：{node.timeConsistency.label}{node.timeConsistency.kind === "unknown" ? "（可继续审阅）" : ""}{blocked ? " · 需先处理" : ""}</small><small>写入目标：{writeTarget(node.identityResolution.kind)}</small></span></label>;
        })}</section>
        <dl className="tianyi-prediction-adoption-summary" aria-label="本次采纳数量"><div><dt>已选择候选</dt><dd>{adoption.selected}</dd></div><div><dt>沿用已有事件</dt><dd>{adoption.referenced}</dd></div><div><dt>保存为作者草稿</dt><dd>{adoption.drafts}</dd></div><div><dt>已跳过</dt><dd>{adoption.skipped}</dd></div>{adoption.blocked ? <div className="is-blocked"><dt>因冲突阻止</dt><dd>{adoption.blocked}</dd></div> : null}</dl>
        <button type="button" className="tianyi-prediction-text-action" onClick={() => setViewState("focus")}><ArrowLeft />返回当前路径</button>
      </section> : null}

      {viewState === "receipt" && receipt ? <section className="tianyi-prediction-stage-content receipt-stage"><ReceiptView receipt={receipt} run={run} /></section> : null}

      <details className="tianyi-prediction-technical-details"><summary>技术回执与历史<ChevronRight /></summary>
        <dl><div><dt>当前运行</dt><dd>{run?.runId ?? "尚未创建"}</dd></div><div><dt>候选结果组</dt><dd>{run?.bundle?.bundleId ?? "尚未生成"}</dd></div><div><dt>状态</dt><dd>{run ? runStatusLabel(run.status) : "准备"}</dd></div></dl>
        {run ? <button type="button" disabled={!execution} onClick={openExecution}><Workflow />查看执行图</button> : null}
        {runs.length > 1 ? <label className="tianyi-prediction-history">推演历史<select value={run?.runId ?? ""} onChange={(event) => selectRun(event.target.value)}>{runs.map((item) => <option key={item.runId} value={item.runId}>{item.runId.slice(-8)} · {runStatusLabel(item.status)}</option>)}</select></label> : null}
        {run?.bundle ? <div className="tianyi-prediction-secondary-actions"><button type="button" disabled={busy} onClick={start}><RotateCcw />生成新推演</button><button type="button" disabled={busy || run.status === "abandoned"} onClick={abandon}><Ban />放弃本次推演</button></div> : null}
      </details>
    </div>
    <footer className={`tianyi-prediction-primary ${hasTimeConflict && viewState === "focus" ? "is-blocked" : ""}`}>{primary}{hasTimeConflict && viewState === "focus" ? <span>时间冲突阻止采纳 · 正式写入为 0</span> : null}</footer>
  </section>;
}

function PathList(props: { run: PredictionRun; pathId: string | null; onChoose: (pathId: string) => void }) {
  const bundle = props.run.bundle;
  if (!bundle) return null;
  return <ol className="tianyi-prediction-path-list">{bundle.paths.map((path, index) => {
    const nodes = path.candidateNodeIds.map((nodeId) => bundle.nodes.find((node) => node.id === nodeId)).filter((node): node is NonNullable<typeof node> => Boolean(node));
    const conflictCount = nodes.filter((node) => node.timeConsistency.kind === "conflict" || node.identityResolution.kind === "unresolved").length;
    return <li key={path.id} data-selected={props.pathId === path.id ? "true" : "false"} data-blocked={conflictCount ? "true" : "false"}>
      <button type="button" aria-pressed={props.pathId === path.id} aria-label={`路径 ${index + 1}，${path.title}${conflictCount ? `，${conflictCount} 个阻断` : ""}`} onClick={() => props.onChoose(path.id)}>
        <span className="tianyi-prediction-path-number">{index + 1}</span>
        <span><strong title={path.title}>{path.title}</strong><small>{nodes.map((node) => node.title).join(" → ")}</small><em>{conflictCount ? `${conflictCount} 个阻断 · 需修正` : `${nodes.length} 个候选节点 · 尚未写入`}</em></span>
        <GitBranch aria-hidden="true" />
      </button>
    </li>;
  })}</ol>;
}

function PathNodeSummary(props: { run: PredictionRun; pathId: string }) {
  const bundle = props.run.bundle;
  const path = bundle?.paths.find((item) => item.id === props.pathId);
  if (!bundle || !path) return null;
  return <ol className="tianyi-prediction-path-node-summary">{path.candidateNodeIds.map((nodeId, index) => {
    const node = bundle.nodes.find((item) => item.id === nodeId);
    if (!node) return null;
    const blocked = node.identityResolution.kind === "unresolved" || node.timeConsistency.kind === "conflict";
    return <li key={node.id} data-blocked={blocked ? "true" : "false"}><span>{index + 1}</span><div><strong title={node.title}>{node.title}</strong><small>{identityLabel(node.identityResolution.kind)} · {node.timeConsistency.label}</small></div></li>;
  })}</ol>;
}

function stageOrder(stage: "task" | "running" | "candidates" | "review"): number {
  return { task: 0, running: 1, candidates: 2, review: 3 }[stage];
}

function PredictionProgress(props: { phase: PredictionPhase; run: PredictionRun | null }) {
  const steps = ["读取多节点上下文", "推演候选路径", "一致性检查", "等待作者审阅"];
  const activeIndex = props.phase === "reading" ? 0 : props.phase === "generating" ? 1 : props.phase === "validating" ? 2 : props.phase === "reviewing" || props.run?.status === "ready" ? 3 : props.phase === "failed" || props.phase === "stopped" ? 1 : -1;
  return <section className="tianyi-prediction-progress" aria-label="推演进度" role="status"><header><strong>状态</strong><span>{props.phase === "stopped" || props.run?.status === "stopped" ? "本次推演已停止，可重新推演" : props.phase === "failed" ? "推演失败，可重新推演" : props.run?.status === "abandoned" ? "本次推演已放弃" : activeIndex === 3 ? "一致性检查完成" : activeIndex >= 0 ? `正在进行 ${activeIndex + 1}/4` : "准备就绪"}</span></header><ol>{steps.map((step, index) => <li key={step} data-state={(props.phase === "failed" || props.phase === "stopped") && index === activeIndex ? "failed" : index < activeIndex || activeIndex === 3 ? "complete" : index === activeIndex ? "active" : "pending"}>{index < activeIndex || activeIndex === 3 ? <CircleCheck /> : index === activeIndex ? <LoaderCircle className={activeIndex < 3 && props.phase !== "stopped" ? "is-spinning" : undefined} /> : <Clock3 />}<span>{step}</span></li>)}</ol></section>;
}

function ReceiptView(props: { receipt: DraftReceipt; run: PredictionRun | null }) {
  const path = props.run?.bundle?.paths.find((item) => item.id === props.receipt.pathId);
  const created = props.receipt.items.filter((item) => item.action === "draft-created");
  const referenced = props.receipt.items.filter((item) => item.action === "referenced-existing");
  const mergeReview = props.receipt.items.filter((item) => item.action === "merge-review");
  const selectedIds = new Set(props.receipt.items.map((item) => item.candidateNodeId));
  const unselectedIds = path?.candidateNodeIds.filter((id) => !selectedIds.has(id)) ?? [];
  const skippedIds = [...unselectedIds, ...mergeReview.map((item) => item.candidateNodeId)];
  return <section className="tianyi-prediction-receipt-card is-primary" role="status" aria-label="本次采纳结果"><header><CircleCheck /><div><strong>这次采纳已保存</strong><small>作者草稿已保存 · 尚未进入正式故事</small></div></header><dl><div><dt>采纳路径</dt><dd>{path?.title ?? "已保存路径"}</dd></div><div><dt>本次选中</dt><dd>{props.receipt.items.length} 个节点</dd></div><div><dt>沿用已有事件</dt><dd>{referenced.length ? referenced.map((item) => nodeTitle(props.run, item.candidateNodeId)).join("、") : "无"}</dd></div><div><dt>保存为作者草稿</dt><dd>{created.length ? created.map((item) => nodeTitle(props.run, item.candidateNodeId)).join("、") : "无"}</dd></div><div><dt>未采纳或待合并</dt><dd>{skippedIds.length ? skippedIds.map((id) => nodeTitle(props.run, id)).join("、") : "无"}</dd></div><div><dt>因冲突未保存</dt><dd>无</dd></div></dl><details><summary>查看技术回执</summary><dl><div><dt>完整推演 ID</dt><dd>{props.receipt.runId}</dd></div><div><dt>路径 ID</dt><dd>{props.receipt.pathId}</dd></div><div><dt>回执 ID</dt><dd>{props.receipt.operationId}</dd></div></dl></details></section>;
}

type AdoptionSummary = { selected: number; referenced: number; drafts: number; skipped: number; blocked: number; mergeReview: number };
function summarizeAdoption(run: PredictionRun | null, path: NonNullable<PredictionRun["bundle"]>["paths"][number] | null, selectedNodeIds: readonly string[]): AdoptionSummary {
  if (!run?.bundle || !path) return { selected: 0, referenced: 0, drafts: 0, skipped: 0, blocked: 0, mergeReview: 0 };
  const selectedIds = new Set(selectedNodeIds);
  const selected = path.candidateNodeIds.map((id) => run.bundle!.nodes.find((node) => node.id === id)).filter((node): node is NonNullable<typeof node> => Boolean(node && selectedIds.has(node.id)));
  const referenced = selected.filter((node) => node.identityResolution.kind === "reference-existing").length;
  const drafts = selected.filter((node) => node.identityResolution.kind === "create-new-with-difference").length;
  const mergeReview = selected.filter((node) => node.identityResolution.kind === "merge-review").length;
  const blocked = selected.filter((node) => node.identityResolution.kind === "unresolved" || node.timeConsistency.kind === "conflict").length;
  return { selected: selected.length, referenced, drafts, mergeReview, blocked, skipped: path.candidateNodeIds.length - selected.length + mergeReview };
}
function adoptionButtonLabel(summary: AdoptionSummary): string {
  if (!summary.selected) return "请选择要采纳的节点";
  if (summary.blocked) return `采纳 ${summary.selected} 个节点 · ${summary.blocked} 个冲突待处理`;
  if (summary.drafts) return `采纳 ${summary.selected} 个节点 · 新建 ${summary.drafts} 个草稿`;
  if (summary.referenced === summary.selected) return `采纳 ${summary.selected} 个节点 · 引用 ${summary.referenced} 个已有事件`;
  return `采纳 ${summary.selected} 个节点 · 不新建草稿`;
}

function announceRun(run: PredictionRun): void { (window as Window & { __storyStudioPredictionRun?: PredictionRun }).__storyStudioPredictionRun = run; window.dispatchEvent(new CustomEvent("story-studio-multi-node-prediction-run", { detail: run })); }
function announceViewState(detail: PredictionViewDetail): void { (window as Window & { __storyStudioPredictionView?: PredictionViewDetail }).__storyStudioPredictionView = detail; window.dispatchEvent(new CustomEvent("story-studio-prediction-view-state", { detail })); }
function announceExecution(projection: TianyiPredictionExecutionProjection): void { (window as Window & { __storyStudioAgentExecutionProjection?: TianyiPredictionExecutionProjection }).__storyStudioAgentExecutionProjection = projection; window.dispatchEvent(new CustomEvent("story-studio-agent-execution-projection", { detail: projection })); }
function announceAgentState(running: boolean, runId: string | null): void { window.dispatchEvent(new CustomEvent("story-studio-prediction-agent-state", { detail: { running, runId } })); }
function announceSelection(detail: PredictionSelectionDetail): void { (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection = detail; window.dispatchEvent(new CustomEvent("story-studio-prediction-review-selection", { detail })); }
function normalizeReceipt(review: MultiNodePredictionReviewProjection): DraftReceipt | null { const value = review.receipt; if (!value || typeof value !== "object" || Array.isArray(value)) return null; const record = value as Partial<DraftReceipt>; return typeof record.operationId === "string" && typeof record.runId === "string" && typeof record.pathId === "string" && Array.isArray(record.items) ? record as DraftReceipt : null; }
function nodeTitle(run: PredictionRun | null, nodeId: string): string { return run?.bundle?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId; }
function runStatusLabel(status: PredictionRun["status"]): string { return status === "ready" ? "等待审阅" : status === "abandoned" ? "已放弃" : status === "stale" ? "来源失效" : status === "stopped" ? "已停止" : status === "failed" ? "失败" : "处理中"; }
function identityLabel(kind: IdentityResolutionKind): string { return kind === "reference-existing" ? "引用已有事件" : kind === "merge-review" ? "待合并审查" : kind === "unresolved" ? "身份待决" : "新建草稿（已说明差异）"; }
function writeTarget(kind: IdentityResolutionKind): string { return kind === "create-new-with-difference" ? "保存为作者草稿" : kind === "reference-existing" ? "沿用已有事件（不新建）" : kind === "merge-review" ? "进入待合并审查（不新建）" : "身份待决（不保存）"; }
function gateReason(reasons: string[]): string { return reasons.includes("prediction-not-ready") ? "推演或一致性检查尚未完成" : reasons.includes("path-not-selected") ? "请先选择候选路径" : reasons.some((reason) => reason.startsWith("time-conflict:")) ? "候选路径存在时间冲突" : reasons.some((reason) => reason.startsWith("identity-unresolved:")) ? "候选身份尚未决议" : "当前操作尚未完成"; }
