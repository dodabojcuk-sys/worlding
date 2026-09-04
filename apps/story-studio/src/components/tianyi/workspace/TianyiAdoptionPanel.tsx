import { ArrowRight, CheckCircle2, FileClock, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { beginTianyiCreativeEventImpact, confirmTianyiCreativeEvent, getTianyiCreativeEventReview, undoTianyiCreativeEvent, type TianyiCreativeEventReview } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";

export function TianyiAdoptionPanel(props: {
  runtime: TianyanShellRuntimeState;
  compact?: boolean;
  onOpenEventLine?(): void;
  onChanged?(review: TianyiCreativeEventReview): void;
}) {
  const project = props.runtime.project;
  const sessionId = props.runtime.tianyiConversationId;
  const candidateId = props.runtime.activeTianyiCandidateId;
  const [review, setReview] = useState<TianyiCreativeEventReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!project || !sessionId || !candidateId) { setReview(null); return; }
    const next = await props.runtime.withConnection((token) => getTianyiCreativeEventReview({ projectId: project.id, sessionId, candidateId, token }));
    setReview(next);
  }, [candidateId, project, props.runtime, sessionId]);
  useEffect(() => { void load().catch(() => setReview(null)); }, [load]);
  const run = async (action: (token: string) => Promise<TianyiCreativeEventReview>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { const next = await props.runtime.withConnection(action); setReview(next); props.onChanged?.(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作未完成；没有覆盖当前故事。"); }
    finally { setBusy(false); }
  };
  if (!review || !project || !sessionId || !candidateId) return <section className="tianyi-adoption-panel is-empty"><ShieldCheck /><p>从同一会话选择一个 Event 候选后，这里会显示结构化影响与作者采纳。</p></section>;
  const receipt = review.adoptionReceipt;
  const impactReady = Boolean(review.impact);
  const option = review.impact?.options[0] ?? null;
  return <section className={`tianyi-adoption-panel ${props.compact ? "is-compact" : ""}`} data-testid="tianyi-adoption-panel" data-impact-ready={impactReady} data-adoption-status={receipt?.status ?? "candidate"}>
    <header><div><small>候选轨迹 · 与正式故事分离</small><h2>{review.proposal.title}</h2></div><span>{receipt ? receipt.status === "undone" ? "已撤销" : "已采纳" : impactReady ? "影响已审查" : "等待影响审查"}</span></header>
    <p>{review.proposal.summary}</p>
    <div className="tianyi-adoption-progress" aria-label="作者采纳进度"><span className="is-complete"><CheckCircle2 />候选</span><span className={impactReady ? "is-complete" : ""}><ShieldCheck />影响审查</span><span className={receipt ? "is-complete" : ""}><FileClock />作者采纳</span></div>
    {!receipt ? <>
      {impactReady ? <section className="tianyi-structured-diff" aria-label="结构化故事语义 diff"><strong>结构化故事语义 diff</strong><dl><div><dt>基础版本</dt><dd>{review.proposal.writeTarget.version}</dd></div><div><dt>范围</dt><dd>{props.runtime.workScope === "current-story" ? "当前故事" : props.runtime.workScope === "selected-events" ? "选中事件" : "当前单元"}</dd></div><div><dt>变化</dt><dd>{review.impact?.preview?.change.join("；") || review.proposal.summary}</dd></div><div><dt>证据</dt><dd>{review.impact?.impact?.evidenceCoverage ?? review.proposal.evidence[0]?.sourceRef}</dd></div><div><dt>风险</dt><dd>{review.impact?.impact?.risks.join("；") || option?.summary || "未发现阻断性风险"}</dd></div></dl></section> : null}
      <div className="tianyi-adoption-actions">
        {!impactReady ? <button type="button" className="primary-action" disabled={busy} onClick={() => void run((token) => beginTianyiCreativeEventImpact({ projectId: project.id, sessionId, candidateId, token }))}>打开结构化影响预览</button> : null}
        {impactReady && props.onOpenEventLine ? <button type="button" onClick={props.onOpenEventLine}>在事件线中打开<ArrowRight /></button> : null}
        {impactReady ? <button type="button" className="primary-action tianyi-adopt-action" disabled={busy || !option} onClick={() => option && void run((token) => confirmTianyiCreativeEvent({ projectId: project.id, sessionId, candidateId, optionId: option.id, token }))}>采纳</button> : null}
      </div>
      <small>单击“采纳”即对当前明确目标原子生效；没有第二次确认。</small>
    </> : <section className="tianyi-adoption-receipt" aria-label="结构化采纳回执">
      <header><CheckCircle2 /><div><strong>{receipt.status === "undone" ? "采纳已通过补偿版本撤销" : "采纳已生效"}</strong><small>{receipt.receiptId}</small></div></header>
      <dl><div><dt>BaseVersion</dt><dd>{receipt.baseVersion.label}</dd></div><div><dt>结果版本</dt><dd>{receipt.status === "undone" ? receipt.compensation?.resultVersion.label : receipt.resultVersion.label}</dd></div><div><dt>目标</dt><dd>{receipt.targetStoryId}</dd></div><div><dt>对象</dt><dd>{receipt.appliedEventId}</dd></div><div><dt>来源</dt><dd>{receipt.sourceRefs.join("、")}</dd></div></dl>
      <details><summary>查看变化</summary><ul>{receipt.structuredDiff.map((item) => <li key={item.id}>{item.summary}</li>)}</ul></details>
      {receipt.status === "active" ? <button type="button" disabled={busy} onClick={() => void run((token) => undoTianyiCreativeEvent({ projectId: project.id, sessionId, candidateId, token }))}><RotateCcw />撤销（创建补偿版本）</button> : <p><RotateCcw />原 Event 与历史回执仍保留；补偿 Event：{receipt.compensation?.eventId}</p>}
    </section>}
    {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
  </section>;
}
