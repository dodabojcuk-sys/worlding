import { Ban, Check, ChevronRight, CircleCheck, Clock3, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { derivePredictionReviewGate, type IdentityResolutionKind, type PredictionRun } from "../../../../../../src/storyContracts/multiNodePrediction.ts";
import type { StoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import { acceptMultiNodePredictionReview, abandonMultiNodePredictionRun, createMultiNodePredictionReview, createMultiNodePredictionRun, executeMultiNodePredictionRun, listMultiNodePredictionReviews, listMultiNodePredictionRuns, type MultiNodePredictionReviewProjection } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";

type PredictionPhase = "idle" | "reading" | "generating" | "validating" | "reviewing" | "failed";
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
      setPhase(matching?.status === "ready" ? "reviewing" : matching?.status === "failed" ? "failed" : "idle");
      if (matching) announceRun(matching);
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
    try {
      const runId = `prediction-run.${crypto.randomUUID()}`;
      const created = await props.runtime.withConnection((token) => createMultiNodePredictionRun({ request: { projectId: project.id, sourceEventRefs: props.eventRefs, authorGoal: goal.trim(), predictionMode: "forward-development", operationId: `prediction-request.${crypto.randomUUID()}` }, runId, token }));
      setRun(created); announceRun(created); setPhase("validating");
      const ready = await props.runtime.withConnection((token) => executeMultiNodePredictionRun({ projectId: project.id, runId: created.runId, token }));
      setRun(ready); setRuns((current) => [ready, ...current.filter((item) => item.runId !== ready.runId)]); setPhase("reviewing"); announceRun(ready);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "推演未完成，原事件没有改变。"); setPhase("failed"); }
    finally { setBusy(false); }
  })();
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
  const selectRun = (runId: string) => { const selected = runs.find((item) => item.runId === runId) ?? null; setRun(selected); setPhase(selected?.status === "ready" ? "reviewing" : selected?.status === "failed" ? "failed" : "idle"); };
  const abandon = () => void (async () => {
    if (!project || !run || busy || run.status === "abandoned") return;
    setBusy(true); setError("");
    try { const abandoned = await props.runtime.withConnection((token) => abandonMultiNodePredictionRun({ projectId: project.id, runId: run.runId, token })); setRun(abandoned); setRuns((current) => current.map((item) => item.runId === abandoned.runId ? abandoned : item)); setReceipt(null); announceRun(abandoned); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法放弃当前 Run。"); }
    finally { setBusy(false); }
  })();

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
    {!run?.bundle ? <label className="tianyi-prediction-goal"><span>作者意图</span><textarea value={goal} maxLength={1000} rows={2} disabled={busy} onChange={(event) => setGoal(event.target.value)} /></label> : null}
    {!run?.bundle ? <button type="button" className="primary-action tianyi-prediction-start" disabled={busy || !goal.trim()} onClick={start}>{busy ? <LoaderCircle className="is-spinning" /> : <Play />}{busy ? "正在推演" : "开始推演"}</button> : null}
    {busy && !run?.bundle ? <button type="button" className="primary-action tianyi-prediction-accept" disabled><Check />完成检查后选择路径</button> : null}
    <p className="tianyi-prediction-connection-note">本次推演可直接运行，不需要额外连接。</p>
    {run?.bundle ? <section className="tianyi-prediction-results">
      <div className="tianyi-prediction-run-heading"><span>Run {run.runId.slice(-8)}</span><strong>{run.status === "ready" ? "等待作者审阅" : run.status === "abandoned" ? "已放弃" : run.status === "failed" ? "运行失败" : "处理中"}</strong></div>
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
      })}<dl className="tianyi-prediction-adoption-summary" aria-label="本次采纳数量"><div><dt>已选择候选</dt><dd>{adoption.selected}</dd></div><div><dt>引用已有 Event</dt><dd>{adoption.referenced}</dd></div><div><dt>新建 draft Event</dt><dd>{adoption.drafts}</dd></div><div><dt>跳过</dt><dd>{adoption.skipped}</dd></div>{adoption.blocked ? <div className="is-blocked"><dt>因冲突阻止</dt><dd>{adoption.blocked}</dd></div> : null}</dl></section> : <p className="tianyi-prediction-path-prompt">请先选择一条候选路径，再决定要保存哪些节点。</p>}
      <button type="button" className="primary-action tianyi-prediction-accept" disabled={!gate.allowed || !selectedNodeIds.length} onClick={accept}><Check />{adoptionButtonLabel(adoption)}</button>
      <div className="tianyi-prediction-secondary-actions"><button type="button" disabled={busy} onClick={start}><RotateCcw />重新推演</button><button type="button" disabled={busy || run.status === "abandoned"} onClick={abandon}><Ban />放弃 Run</button></div>
      {!gate.allowed ? <small className="tianyi-prediction-gate">采纳已禁用：{gateReason(gate.reasons)}</small> : null}
      <label className="tianyi-prediction-adjust"><span>继续调整本次推演</span><textarea value={goal} maxLength={1000} rows={2} disabled={busy} onChange={(event) => setGoal(event.target.value)} /></label>
    </section> : <p className="tianyi-prediction-empty"><RotateCcw />选择 1–4 个已有事件后，生成可审阅的连续候选路径。</p>}
    {runs.length > 1 ? <label className="tianyi-prediction-history">Run 历史<select value={run?.runId ?? ""} onChange={(event) => selectRun(event.target.value)}>{runs.map((item) => <option key={item.runId} value={item.runId}>{item.runId.slice(-8)} · {runStatusLabel(item.status)}</option>)}</select></label> : null}
    {run?.status === "abandoned" ? <p className="tianyi-prediction-receipt" role="status">此 Run 已放弃；既有草稿和历史回执均保留。</p> : null}
    {error ? <p className="tianyi-error" role="alert">{error}</p> : null}
  </section>;
}

function PredictionProgress(props: { phase: PredictionPhase; run: PredictionRun | null }) {
  const steps = ["读取多节点上下文", "推演候选路径", "一致性检查", "等待作者审阅"];
  const activeIndex = props.phase === "reading" ? 0 : props.phase === "generating" ? 1 : props.phase === "validating" ? 2 : props.phase === "reviewing" || props.run?.status === "ready" ? 3 : props.phase === "failed" ? 1 : -1;
  return <section className="tianyi-prediction-progress" aria-label="推演进度" role="status"><header><strong>状态</strong><span>{props.phase === "failed" ? "推演失败，可重试" : props.run?.status === "abandoned" ? "Run 已放弃" : activeIndex === 3 ? "一致性检查完成" : activeIndex >= 0 ? `正在进行 ${activeIndex + 1}/4` : "准备就绪"}</span></header><ol>{steps.map((step, index) => <li key={step} data-state={props.phase === "failed" && index === activeIndex ? "failed" : index < activeIndex || activeIndex === 3 ? "complete" : index === activeIndex ? "active" : "pending"}>{index < activeIndex || activeIndex === 3 ? <CircleCheck /> : index === activeIndex ? <LoaderCircle className={activeIndex < 3 ? "is-spinning" : undefined} /> : <Clock3 />}<span>{step}</span></li>)}</ol></section>;
}

function ReceiptView(props: { receipt: DraftReceipt; run: PredictionRun | null }) {
  const path = props.run?.bundle?.paths.find((item) => item.id === props.receipt.pathId);
  const created = props.receipt.items.filter((item) => item.action === "draft-created");
  const referenced = props.receipt.items.filter((item) => item.action === "referenced-existing");
  const mergeReview = props.receipt.items.filter((item) => item.action === "merge-review");
  const selectedIds = new Set(props.receipt.items.map((item) => item.candidateNodeId));
  const unselectedIds = path?.candidateNodeIds.filter((id) => !selectedIds.has(id)) ?? [];
  const skippedIds = [...unselectedIds, ...mergeReview.map((item) => item.candidateNodeId)];
  return <section className="tianyi-prediction-receipt-card is-primary" role="status" aria-label="本次采纳结果"><header><CircleCheck /><div><strong>本次采纳结果</strong><small>回执已持久保存 · 尚未进入正式事件线</small></div></header><dl><div><dt>Run ID</dt><dd>{props.receipt.runId}</dd></div><div><dt>候选路径</dt><dd>{path?.title ?? props.receipt.pathId}</dd></div><div><dt>选择数量</dt><dd>{props.receipt.items.length}</dd></div><div><dt>引用已有 Event</dt><dd>{referenced.length ? referenced.map((item) => nodeTitle(props.run, item.candidateNodeId)).join("、") : "0"}</dd></div><div><dt>新建 draft Event</dt><dd>{created.length ? created.map((item) => nodeTitle(props.run, item.candidateNodeId)).join("、") : "0"}</dd></div><div><dt>跳过节点</dt><dd>{skippedIds.length ? skippedIds.map((id) => nodeTitle(props.run, id)).join("、") : "0"}</dd></div><div><dt>因冲突阻止</dt><dd>0</dd></div><div><dt>回执 ID</dt><dd>{props.receipt.operationId}</dd></div></dl></section>;
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
function announceSelection(detail: PredictionSelectionDetail): void { (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection = detail; window.dispatchEvent(new CustomEvent("story-studio-prediction-review-selection", { detail })); }
function normalizeReceipt(review: MultiNodePredictionReviewProjection): DraftReceipt | null { const value = review.receipt; if (!value || typeof value !== "object" || Array.isArray(value)) return null; const record = value as Partial<DraftReceipt>; return typeof record.operationId === "string" && typeof record.runId === "string" && typeof record.pathId === "string" && Array.isArray(record.items) ? record as DraftReceipt : null; }
function nodeTitle(run: PredictionRun | null, nodeId: string): string { return run?.bundle?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId; }
function runStatusLabel(status: PredictionRun["status"]): string { return status === "ready" ? "等待审阅" : status === "abandoned" ? "已放弃" : status === "stale" ? "来源失效" : status === "failed" ? "失败" : "处理中"; }
function identityLabel(kind: IdentityResolutionKind): string { return kind === "reference-existing" ? "引用已有事件" : kind === "merge-review" ? "待合并审查" : kind === "unresolved" ? "身份待决" : "新建草稿（已说明差异）"; }
function writeTarget(kind: IdentityResolutionKind): string { return kind === "create-new-with-difference" ? "作者草稿 Event" : kind === "reference-existing" ? "引用已有 Event（不写入）" : kind === "merge-review" ? "待合并审查（不写入）" : "身份待决（不写入）"; }
function gateReason(reasons: string[]): string { return reasons.includes("prediction-not-ready") ? "推演或一致性检查尚未完成" : reasons.includes("path-not-selected") ? "请先选择候选路径" : reasons.some((reason) => reason.startsWith("time-conflict:")) ? "候选路径存在时间冲突" : reasons.some((reason) => reason.startsWith("identity-unresolved:")) ? "候选身份尚未决议" : "当前操作尚未完成"; }
