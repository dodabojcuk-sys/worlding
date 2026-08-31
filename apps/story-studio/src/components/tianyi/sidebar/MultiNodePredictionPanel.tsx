import { Ban, Check, ChevronRight, CircleCheck, Clock3, LoaderCircle, Play, RotateCcw, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { derivePredictionReviewGate, type IdentityResolutionKind, type PredictionRun } from "../../../../../../src/storyContracts/multiNodePrediction.ts";
import type { StoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import { acceptMultiNodePredictionReview, abandonMultiNodePredictionRun, createMultiNodePredictionReview, createMultiNodePredictionRun, executeMultiNodePredictionRun, getMultiNodePredictionExecution, listMultiNodePredictionReviews, listMultiNodePredictionRuns, retryMultiNodePredictionRun, stopMultiNodePredictionRun, type MultiNodePredictionReviewProjection, type TianyiPredictionExecutionProjection } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";

type PredictionPhase = "idle" | "reading" | "generating" | "validating" | "reviewing" | "failed" | "stopped";
type DraftReceipt = { operationId: string; runId: string; pathId: string; items: Array<{ candidateNodeId: string; action: "draft-created" | "referenced-existing" | "merge-review"; draftEventId: string | null; existingEventId: string | null }> };
type PredictionSelectionDetail = { runId: string; pathId: string; selectedCandidateNodeIds: string[]; origin: "tianyi" | "canvas" };

/** Candidate-only author controls. Canon, WorldState and formal Relations stay outside this component. */
export function MultiNodePredictionPanel(props: { runtime: TianyanShellRuntimeState; eventRefs: StoryStudioEventReference[]; sourceLabels?: string[] }) {
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
  const pollingGeneration = useRef(0);
  const stopRequested = useRef(false);
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
    if (run) announceRun(run);
  }, [run?.runId]);

  useEffect(() => {
    if (!project || !run) return;
    let active = true;
    void listMultiNodePredictionReviews(project.id, run.runId).then((reviews) => {
      const drafted = reviews.find((review) => review.status === "drafted");
      if (!active || !drafted) return;
      setPathId(drafted.pathId); setSelectedNodeIds(drafted.selectedCandidateNodeIds); setReceipt(normalizeReceipt(drafted));
      announceSelection({ runId: run.runId, pathId: drafted.pathId, selectedCandidateNodeIds: drafted.selectedCandidateNodeIds, origin: "tianyi" });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [project, run]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<PredictionSelectionDetail>).detail;
      if (!run || detail?.origin !== "canvas" || detail.runId !== run.runId) return;
      setPathId(detail.pathId); setSelectedNodeIds(detail.selectedCandidateNodeIds); setReceipt(null);
    };
    window.addEventListener("story-studio-prediction-review-selection", receive);
    return () => window.removeEventListener("story-studio-prediction-review-selection", receive);
  }, [run]);

  const start = () => void (async () => {
    if (!project || props.eventRefs.length < 1 || props.eventRefs.length > 4 || busy) return;
    setBusy(true); setError(""); setReceipt(null); setPhase("generating");
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
    } catch (cause) { if (!stopRequested.current) setError(cause instanceof Error ? cause.message : "推演未完成，原事件没有改变。"); setPhase(stopRequested.current ? "stopped" : "failed"); }
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
      if (accepted.status === "drafted") window.dispatchEvent(new CustomEvent("story-studio-prediction-drafts-created", { detail: { projectId: project.id, runId: run.runId } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "采纳未完成，候选仍保持预览状态。"); }
    finally { setBusy(false); }
  })();
  const selectRun = (runId: string) => { const selected = runs.find((item) => item.runId === runId) ?? null; setRun(selected); setPhase(selected?.status === "ready" ? "reviewing" : selected?.status === "stopped" ? "stopped" : selected?.status === "failed" ? "failed" : "idle"); };
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
      setRun(stopped); setPhase("stopped"); announceRun(stopped);
      const projection = await props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId: run.runId, token }));
      if (projection) { setExecution(projection); announceExecution(projection); }
    } catch (cause) { stopRequested.current = false; setError(cause instanceof Error ? cause.message : "未能停止本次推演。"); }
  })();
  const retry = () => void (async () => {
    if (!project || !run || busy || !["failed", "stopped"].includes(run.status)) return;
    setBusy(true); setError(""); setReceipt(null); setPhase("generating"); stopRequested.current = false; announceAgentState(true, run.runId); beginExecutionPolling(run.runId);
    try {
      const ready = await props.runtime.withConnection((token) => retryMultiNodePredictionRun({ projectId: project.id, runId: run.runId, token }));
      setRun(ready); setRuns((current) => current.map((item) => item.runId === ready.runId ? ready : item)); announceRun(ready);
      const projection = await props.runtime.withConnection((token) => getMultiNodePredictionExecution({ projectId: project.id, runId: ready.runId, token }));
      if (projection) { setExecution(projection); announceExecution(projection); }
      setBusy(false); setPhase("reviewing");
    } catch (cause) { if (!stopRequested.current) setError(cause instanceof Error ? cause.message : "重试未完成。"); setPhase(stopRequested.current ? "stopped" : "failed"); }
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
  const sourceLabels = props.eventRefs.map((reference, index) => props.sourceLabels?.[index] ?? reference.eventId);
  const pathNumber = activePath && run?.bundle ? run.bundle.paths.findIndex((path) => path.id === activePath.id) + 1 : 0;
  const adoption = summarizeAdoption(run, activePath, selectedNodeIds);
  return <section className="tianyi-prediction-panel" aria-label="多节点推演" data-prediction-phase={phase}>
    <header><div><small>事件线 · 结构化推演</small><strong>多节点推演</strong></div><span className="tianyi-prediction-candidate-badge">候选</span></header>
    {receipt ? <ReceiptView receipt={receipt} run={run} /> : null}
    <section className="tianyi-prediction-scope-card" aria-label={`推演范围，${props.eventRefs.length} 个节点`}><strong>推演范围 · {props.eventRefs.length} 个节点</strong><div>{sourceLabels.map((label, index) => <span key={props.eventRefs[index]!.eventId} title={label} aria-label={`第 ${index + 1} 个推演依据：${label}`}><b>{index + 1}</b>{label}</span>)}</div></section>
    <section className="tianyi-prediction-context-card"><strong>ContextPack</strong><dl><div><dt>依据</dt><dd>{props.eventRefs.length}</dd></div><div><dt>约束</dt><dd>{props.eventRefs.length + 1}</dd></div><div><dt>未决</dt><dd>{run?.bundle?.nodes.filter((node) => node.timeConsistency.kind === "unknown" || node.identityResolution.kind === "unresolved").length ?? 0}</dd></div></dl></section>
    <section className="tianyi-prediction-request"><strong>当前请求</strong><p>{goal}</p><small>推演方式 · 后续发展</small></section>
    <PredictionProgress phase={phase} run={run} />
    {run ? <div className="tianyi-prediction-runtime-actions"><button type="button" className="tianyi-prediction-execution-link" disabled={!execution} onClick={() => { if (execution) announceExecution(execution); window.dispatchEvent(new CustomEvent("story-studio-open-agent-execution", { detail: { runId: run.runId } })); }}><Workflow aria-hidden="true" />查看执行过程</button>{busy ? <button type="button" className="is-stop" disabled={stopRequested.current} onClick={stop}>停止本次推演</button> : ["failed", "stopped"].includes(run.status) ? <button type="button" onClick={retry}>重新推演</button> : null}</div> : null}
    {!run?.bundle ? <label className="tianyi-prediction-goal"><span>作者意图</span><textarea value={goal} maxLength={1000} rows={2} disabled={busy} onChange={(event) => setGoal(event.target.value)} /></label> : null}
    {!run?.bundle ? <button type="button" className="primary-action tianyi-prediction-start" disabled={busy || !goal.trim()} onClick={start}>{busy ? <LoaderCircle className="is-spinning" /> : <Play />}{busy ? "正在推演" : "开始推演"}</button> : null}
    {busy && !run?.bundle ? <button type="button" className="primary-action tianyi-prediction-accept" disabled><Check />完成检查后选择路径</button> : null}
    <p className="tianyi-prediction-connection-note">本次推演可直接运行，不需要额外连接。</p>
    {run?.bundle ? <section className="tianyi-prediction-results">
      <div className="tianyi-prediction-run-heading"><span>本次推演 · {run.runId.slice(-8)}</span><strong>{run.status === "ready" ? "等待作者审阅" : run.status === "abandoned" ? "已放弃" : run.status === "stopped" ? "已停止，可重新推演" : run.status === "failed" ? "推演失败" : "处理中"}</strong></div>
      <section className="tianyi-prediction-paths" aria-label={`候选路径，共 ${run.bundle.paths.length} 条`}><header><strong>候选路径（{run.bundle.paths.length}）</strong><small>画布一次只显示当前路径</small></header>{run.bundle.paths.map((path, index) => {
        const active = path.id === pathId;
        const nodes = path.candidateNodeIds.map((nodeId) => run.bundle!.nodes.find((node) => node.id === nodeId)?.title).filter(Boolean);
        const blocked = path.candidateNodeIds.some((nodeId) => run.bundle!.nodes.find((node) => node.id === nodeId)?.timeConsistency.kind === "conflict");
        return <article key={path.id} className={active ? "is-active" : ""} data-path-id={path.id}><div><b>{index + 1}</b><strong title={path.title}>{path.title}</strong>{blocked ? <span className="is-blocked">时间冲突</span> : active ? <span>当前路径</span> : null}</div><p title={nodes.join(" → ")}>{nodes.join(" → ")}</p><button type="button" aria-label={`${active ? "正在预览" : "预览路径"}：${path.title}`} aria-pressed={active} onClick={() => choosePath(path.id)}>{active ? "正在预览" : "预览路径"}<ChevronRight /></button></article>;
      })}</section>
      {activePath ? <section className="tianyi-prediction-review" aria-label={`审阅路径 ${activePath.title}`}><header><div><small>路径 {pathNumber}</small><strong title={activePath.title}>{activePath.title}</strong></div><span>已选择 {selectedNodeIds.length}/{activePath.candidateNodeIds.length}</span></header>{activePath.candidateNodeIds.map((nodeId) => {
        const node = run.bundle!.nodes.find((item) => item.id === nodeId)!;
        const blocked = node.identityResolution.kind === "unresolved" || node.timeConsistency.kind === "conflict";
        return <label key={node.id} className="tianyi-prediction-node"><input type="checkbox" checked={selectedNodeIds.includes(node.id)} disabled={busy || blocked} onChange={(event) => toggleNode(node.id, event.target.checked)} /><span><strong title={node.title}>{node.title}</strong><small>身份：{identityLabel(node.identityResolution.kind)}</small><small className={node.timeConsistency.kind === "conflict" ? "is-blocked" : ""}>时间：{node.timeConsistency.label}{node.timeConsistency.kind === "unknown" ? "（可继续审阅）" : ""}{blocked ? " · 需先处理" : ""}</small><small>写入目标：{writeTarget(node.identityResolution.kind)}</small></span></label>;
      })}<dl className="tianyi-prediction-adoption-summary" aria-label="本次采纳数量"><div><dt>已选择候选</dt><dd>{adoption.selected}</dd></div><div><dt>沿用已有事件</dt><dd>{adoption.referenced}</dd></div><div><dt>保存为作者草稿</dt><dd>{adoption.drafts}</dd></div><div><dt>已跳过</dt><dd>{adoption.skipped}</dd></div>{adoption.blocked ? <div className="is-blocked"><dt>因冲突阻止</dt><dd>{adoption.blocked}</dd></div> : null}</dl></section> : <p className="tianyi-prediction-path-prompt">请先选择一条候选路径，再决定要保存哪些节点。</p>}
      <button type="button" className="primary-action tianyi-prediction-accept" disabled={!gate.allowed || !selectedNodeIds.length} onClick={accept}><Check />{adoptionButtonLabel(adoption)}</button>
      <div className="tianyi-prediction-secondary-actions"><button type="button" disabled={busy} onClick={start}><RotateCcw />生成新推演</button><button type="button" disabled={busy || run.status === "abandoned"} onClick={abandon}><Ban />放弃本次推演</button></div>
      {!gate.allowed ? <small className="tianyi-prediction-gate">采纳已禁用：{gateReason(gate.reasons)}</small> : null}
      <label className="tianyi-prediction-adjust"><span>继续调整本次推演</span><textarea value={goal} maxLength={1000} rows={2} disabled={busy} onChange={(event) => setGoal(event.target.value)} /></label>
    </section> : <p className="tianyi-prediction-empty"><RotateCcw />选择 1–4 个已有事件后，生成可审阅的连续候选路径。</p>}
    {runs.length > 1 ? <label className="tianyi-prediction-history">推演历史<select value={run?.runId ?? ""} onChange={(event) => selectRun(event.target.value)}>{runs.map((item) => <option key={item.runId} value={item.runId}>{item.runId.slice(-8)} · {runStatusLabel(item.status)}</option>)}</select></label> : null}
    {run?.status === "abandoned" ? <p className="tianyi-prediction-receipt" role="status">本次推演已放弃；既有草稿和历史回执均保留。</p> : null}
    {error ? <p className="tianyi-error" role="alert">{error}</p> : null}
  </section>;
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
function announceExecution(projection: TianyiPredictionExecutionProjection): void { (window as Window & { __storyStudioAgentExecutionProjection?: TianyiPredictionExecutionProjection }).__storyStudioAgentExecutionProjection = projection; window.dispatchEvent(new CustomEvent("story-studio-agent-execution-projection", { detail: projection })); }
function announceAgentState(running: boolean, runId: string | null): void { window.dispatchEvent(new CustomEvent("story-studio-prediction-agent-state", { detail: { running, runId } })); }
function announceSelection(detail: PredictionSelectionDetail): void { (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection = detail; window.dispatchEvent(new CustomEvent("story-studio-prediction-review-selection", { detail })); }
function normalizeReceipt(review: MultiNodePredictionReviewProjection): DraftReceipt | null { const value = review.receipt; if (!value || typeof value !== "object" || Array.isArray(value)) return null; const record = value as Partial<DraftReceipt>; return typeof record.operationId === "string" && typeof record.runId === "string" && typeof record.pathId === "string" && Array.isArray(record.items) ? record as DraftReceipt : null; }
function nodeTitle(run: PredictionRun | null, nodeId: string): string { return run?.bundle?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId; }
function runStatusLabel(status: PredictionRun["status"]): string { return status === "ready" ? "等待审阅" : status === "abandoned" ? "已放弃" : status === "stale" ? "来源失效" : status === "stopped" ? "已停止" : status === "failed" ? "失败" : "处理中"; }
function identityLabel(kind: IdentityResolutionKind): string { return kind === "reference-existing" ? "引用已有事件" : kind === "merge-review" ? "待合并审查" : kind === "unresolved" ? "身份待决" : "新建草稿（已说明差异）"; }
function writeTarget(kind: IdentityResolutionKind): string { return kind === "create-new-with-difference" ? "保存为作者草稿" : kind === "reference-existing" ? "沿用已有事件（不新建）" : kind === "merge-review" ? "进入待合并审查（不新建）" : "身份待决（不保存）"; }
function gateReason(reasons: string[]): string { return reasons.includes("prediction-not-ready") ? "推演或一致性检查尚未完成" : reasons.includes("path-not-selected") ? "请先选择候选路径" : reasons.some((reason) => reason.startsWith("time-conflict:")) ? "候选路径存在时间冲突" : reasons.some((reason) => reason.startsWith("identity-unresolved:")) ? "候选身份尚未决议" : "当前操作尚未完成"; }
