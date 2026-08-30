import { Check, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { derivePredictionReviewGate, type IdentityResolutionKind, type PredictionRun } from "../../../../../../src/storyContracts/multiNodePrediction.ts";
import type { StoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import {
  acceptMultiNodePredictionReview,
  createMultiNodePredictionReview,
  createMultiNodePredictionRun,
  executeMultiNodePredictionRun,
  listMultiNodePredictionRuns,
  listMultiNodePredictionReviews,
  abandonMultiNodePredictionRun
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";

/**
 * Author-facing prediction controls. The result stays a candidate projection:
 * this component neither exposes the execution graph nor writes Canon/Relations.
 */
export function MultiNodePredictionPanel(props: { runtime: TianyanShellRuntimeState; eventRefs: StoryStudioEventReference[]; sourceLabels?: string[] }) {
  const [goal, setGoal] = useState("推演这些事件之后可能发生的连续发展。");
  const [run, setRun] = useState<PredictionRun | null>(null);
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [pathId, setPathId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const project = props.runtime.project;
  const sourceKey = props.eventRefs.map((reference) => `${reference.eventId}:${reference.revisionToken}`).join("|");
  const activePath = run?.bundle?.paths.find((path) => path.id === pathId) ?? null;
  const gate = useMemo(() => run ? derivePredictionReviewGate({ run, pathId, operationPending: busy }) : { allowed: false, reasons: ["prediction-not-ready"] }, [busy, pathId, run]);

  useEffect(() => {
    if (!project || !props.eventRefs.length) { setRun(null); return; }
    let active = true;
    void props.runtime.withConnection((token) => listMultiNodePredictionRuns(project.id, token)).then((runs) => {
      if (!active) return;
      setRuns(runs);
      const matching = runs.find((candidate) => candidate.sourceSnapshot.map((reference) => `${reference.eventId}:${reference.revisionToken}`).join("|") === sourceKey) ?? null;
      setRun(matching);
    }).catch(() => { if (active) setRun(null); });
    return () => { active = false; };
  }, [project, props.eventRefs.length, props.runtime, sourceKey]);

  useEffect(() => {
    setPathId(null);
    setSelectedNodeIds([]);
    if (run) announce(run);
  }, [run]);

  useEffect(() => {
    if (!project || !run) return;
    let active = true;
    void listMultiNodePredictionReviews(project.id, run.runId).then((reviews) => {
      const drafted = reviews.find((review) => review.status === "drafted");
      if (active && drafted) setReceipt("已保存为作者草稿，尚未写入正式事件线。");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [project, run]);

  const start = () => void (async () => {
    if (!project || props.eventRefs.length < 1 || props.eventRefs.length > 4 || busy) return;
    setBusy(true); setError(""); setReceipt(null);
    try {
      const runId = `prediction-run.${crypto.randomUUID()}`;
      const created = await props.runtime.withConnection((token) => createMultiNodePredictionRun({
        request: { projectId: project.id, sourceEventRefs: props.eventRefs, authorGoal: goal.trim(), predictionMode: "forward-development", operationId: `prediction-request.${crypto.randomUUID()}` },
        runId,
        token
      }));
      const ready = await props.runtime.withConnection((token) => executeMultiNodePredictionRun({ projectId: project.id, runId: created.runId, token }));
      setRun(ready);
      setRuns((current) => [ready, ...current.filter((item) => item.runId !== ready.runId)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "推演未完成，原事件没有改变。"); }
    finally { setBusy(false); }
  })();
  const choosePath = (nextPathId: string) => {
    const nextPath = run?.bundle?.paths.find((path) => path.id === nextPathId) ?? null;
    setPathId(nextPathId); setSelectedNodeIds(nextPath?.candidateNodeIds ?? []); setReceipt(null);
  };
  const preview = () => { if (run) announce(run); };
  const accept = () => void (async () => {
    if (!project || !run || !pathId || !gate.allowed || !selectedNodeIds.length) return;
    setBusy(true); setError("");
    try {
      const now = new Date().toISOString();
      const review = await props.runtime.withConnection((token) => createMultiNodePredictionReview({ projectId: project.id, runId: run.runId, pathId, selectedCandidateNodeIds: selectedNodeIds, decidedAt: now, token }));
      const accepted = await props.runtime.withConnection((token) => acceptMultiNodePredictionReview({ projectId: project.id, reviewId: review.id, operationId: `prediction-accept.${crypto.randomUUID()}`, decidedAt: new Date().toISOString(), token }));
      setReceipt(accepted.status === "drafted" ? "已保存为作者草稿，尚未写入正式事件线。" : "审阅结果已保存。");
      if (accepted.status === "drafted") window.dispatchEvent(new CustomEvent("story-studio-prediction-drafts-created", { detail: { projectId: project.id, runId: run.runId } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "采纳未完成，候选仍保持预览状态。"); }
    finally { setBusy(false); }
  })();
  const selectRun = (runId: string) => setRun(runs.find((item) => item.runId === runId) ?? null);
  const abandon = () => void (async () => {
    if (!project || !run || busy || run.status === "abandoned") return;
    setBusy(true); setError("");
    try {
      const abandoned = await props.runtime.withConnection((token) => abandonMultiNodePredictionRun({ projectId: project.id, runId: run.runId, token }));
      setRun(abandoned); setRuns((current) => current.map((item) => item.runId === abandoned.runId ? abandoned : item));
      setReceipt("此 Run 已放弃；既有草稿不会删除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法放弃当前 Run。"); }
    finally { setBusy(false); }
  })();

  if (!project || props.eventRefs.length < 1 || props.eventRefs.length > 4) return null;
  return <section className="tianyi-prediction-panel" aria-label="多节点推演">
    <header><strong>多节点推演</strong><small>候选尚未写入事件线</small></header>
    <p className="tianyi-prediction-sources">依据 {props.eventRefs.length} 个事件：{props.eventRefs.map((reference, index) => props.sourceLabels?.[index] ?? reference.eventId).join("、")}</p>
    <p className="tianyi-prediction-context">ContextPack 摘要：{props.eventRefs.length} 个已版本化事件约束；只生成候选，不写入 Canon。</p>
    <p className="tianyi-prediction-mode">推演方式：后续发展</p>
    <label>作者意图<textarea value={goal} maxLength={1000} rows={3} disabled={busy} onChange={(event) => setGoal(event.target.value)} /></label>
    <button type="button" className="primary-action" disabled={busy || !goal.trim()} onClick={start}>{busy ? <LoaderCircle className="is-spinning" /> : <Play />}{run ? "重新推演" : "开始推演"}</button>
    {busy ? <p className="tianyi-prediction-progress" role="status"><LoaderCircle className="is-spinning" />正在推演并进行一致性检查；审阅和草稿采纳已禁用。</p> : null}
    {run?.bundle ? <section className="tianyi-prediction-results">
      <p>Run {run.runId.slice(-8)} · {run.status === "ready" ? "一致性检查完成" : run.status === "abandoned" ? "已放弃" : "推演未完成"}</p>
      <label>候选路径<select value={pathId ?? ""} onChange={(event) => choosePath(event.target.value)} disabled={busy}><option value="" disabled>先选择一条候选路径</option>{run.bundle.paths.map((path) => <option key={path.id} value={path.id}>{path.title}</option>)}</select></label>
      <button type="button" onClick={preview}>在关系图中预览</button>
      {activePath ? <p className="tianyi-prediction-review-heading">审阅路径：{activePath.title} · 已选择 {selectedNodeIds.length}/{activePath.candidateNodeIds.length} 个节点</p> : null}
      {activePath?.candidateNodeIds.map((nodeId) => {
        const node = run.bundle!.nodes.find((item) => item.id === nodeId)!;
        const blocked = node.identityResolution.kind === "unresolved" || node.timeConsistency.kind === "conflict";
        return <label key={node.id} className="tianyi-prediction-node"><input type="checkbox" checked={selectedNodeIds.includes(node.id)} disabled={busy || blocked} onChange={(event) => setSelectedNodeIds((current) => event.target.checked ? [...current, node.id] : current.filter((id) => id !== node.id))} /><span><strong>{node.title}</strong><small>身份：{identityLabel(node.identityResolution.kind)} · 时间：{node.timeConsistency.label}{node.timeConsistency.kind === "unknown" ? "（时间未定）" : ""}{blocked ? " · 需先处理" : ""}</small><small>写入目标：{node.identityResolution.kind === "create-new-with-difference" ? "作者草稿 Event" : node.identityResolution.kind === "reference-existing" ? "引用已有 Event（不写入）" : node.identityResolution.kind === "merge-review" ? "待合并审查（不写入）" : "身份待决（不写入）"}</small></span></label>;
      })}
      <button type="button" className="primary-action" disabled={!gate.allowed || !selectedNodeIds.length} onClick={accept}><Check />将所选节点保存为草稿</button>
      <button type="button" disabled={busy || run.status === "abandoned"} onClick={abandon}>放弃当前 Run</button>
      {!gate.allowed ? <small>采纳已禁用：{gate.reasons.includes("prediction-not-ready") ? "推演或一致性检查尚未完成" : gate.reasons.includes("path-not-selected") ? "请先选择候选路径" : gate.reasons.some((reason) => reason.startsWith("time-conflict:")) ? "候选路径存在时间冲突" : gate.reasons.some((reason) => reason.startsWith("identity-unresolved:")) ? "候选身份尚未决议" : "当前操作尚未完成"}</small> : null}
    </section> : <p className="tianyi-prediction-empty"><RotateCcw />选择 1–4 个已有事件后，生成可审阅的后续候选路径。</p>}
    {runs.length > 1 ? <label className="tianyi-prediction-history">Run 历史<select value={run?.runId ?? ""} onChange={(event) => selectRun(event.target.value)}>{runs.map((item) => <option key={item.runId} value={item.runId}>{item.runId.slice(-8)} · {item.status}</option>)}</select></label> : null}
    {receipt ? <p className="tianyi-prediction-receipt" role="status">{receipt}</p> : null}
    {error ? <p className="tianyi-error" role="alert">{error}</p> : null}
  </section>;
}

function announce(run: PredictionRun): void {
  (window as Window & { __storyStudioPredictionRun?: PredictionRun }).__storyStudioPredictionRun = run;
  window.dispatchEvent(new CustomEvent("story-studio-multi-node-prediction-run", { detail: run }));
}

function identityLabel(kind: IdentityResolutionKind): string {
  return kind === "reference-existing" ? "引用已有事件" : kind === "merge-review" ? "待合并审查" : kind === "unresolved" ? "身份待决" : "新建草稿（已说明差异）";
}
