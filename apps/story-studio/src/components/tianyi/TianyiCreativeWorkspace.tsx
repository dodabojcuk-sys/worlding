import { Check, CirclePause, Lightbulb, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { TianyiAgentRunProjection, TianyiContextRequest, TianyiCreativeEventReview, TianyiCreativeProjection } from "../../lib/localTransport";
import { ReviewContextSummary, type ReviewContextStage } from "./ReviewContextSummary";
import type { TianyiV2Operations } from "./useTianyiSessionController";

function authorFacingWorkCopy(value: string): string {
  return value.replace(/Agent\/Object/gu, "资料").replace(/\bAgent\b/gu, "工作");
}

// 先保存原话；Provider 可用时才会发起一次受控整理请求。

export function TianyiCreativeWorkspace(props: { projectId: string; token: string; sessionId: string | null; operations: TianyiV2Operations; onSessionId(sessionId: string): void; sharedDraft: string; onDraft(value: string): void; onOpenEventLine?(eventId: string): void; withConnection?: <T>(action: (token: string) => Promise<T>) => Promise<T> }) {
  const [projection, setProjection] = useState<TianyiCreativeProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewTriggerRef = useRef<HTMLButtonElement>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [eventReview, setEventReview] = useState<TianyiCreativeEventReview | null>(null);
  const [eventReviewError, setEventReviewError] = useState("");
  const [authorConfirmationOpen, setAuthorConfirmationOpen] = useState(false);
  const [selectedImpactOptionId, setSelectedImpactOptionId] = useState("");
  const withToken = <T,>(action: (token: string) => Promise<T>): Promise<T> => props.withConnection ? props.withConnection(action) : action(props.token);
  useEffect(() => { if (props.sessionId) void withToken((token) => props.operations.readCreative(props.projectId, props.sessionId!, token)).then(setProjection).catch(() => setProjection(null)); }, [props.operations, props.projectId, props.sessionId, props.token, props.withConnection]);
  useEffect(() => {
    const candidates = projection?.candidates ?? [];
    if (candidates.length === 0) {
      setSelectedCandidateId(null);
      return;
    }
    if (!selectedCandidateId || !candidates.some((candidate) => candidate.candidateId === selectedCandidateId)) {
      setSelectedCandidateId(candidates.find((candidate) => candidate.state === "pending")?.candidateId ?? candidates[0].candidateId);
    }
  }, [projection, selectedCandidateId]);
  const id = (label: string) => `operation.creative.${label}.${Date.now().toString(36)}`;
  const session = async () => { if (props.sessionId) return props.sessionId; const opened = await withToken((token) => props.operations.openSession(props.projectId, id("open"), token)); props.onSessionId(opened.sessionId); return opened.sessionId; };
  const submit = async (collaborate: boolean) => {
    if (!props.sharedDraft.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const sessionId = await session();
      const captured = await withToken((token) => props.operations.captureCreativeSource({ projectId: props.projectId, sessionId, operationId: id("capture"), submissionId: `submission.creative.${Date.now().toString(36)}`, text: props.sharedDraft, collaborate, token }));
      props.onDraft("");
      setProjection(collaborate ? (await withToken((token) => props.operations.extractCreative({ projectId: props.projectId, sessionId, operationId: id("extract"), source: captured.source, token }))).projection : await withToken((token) => props.operations.readCreative(props.projectId, sessionId, token)));
    } catch (cause) { if (collaborate && props.sessionId) { try { setProjection((await withToken((token) => props.operations.markCreativeProviderUnavailable({ projectId: props.projectId, sessionId: props.sessionId!, operationId: id("provider-unavailable"), stage: "extraction", message: "原话已保存，分析未运行。", token }))).projection); } catch { /* preserve the original error if the marker itself is unavailable */ } } setError(`${cause instanceof Error ? cause.message : "操作未完成。"} 原话若已出现，将始终保留在当前会话。`); } finally { setBusy(false); }
  };
  const decide = async (candidateId: string, decision: "rejected" | "deferred") => { if (!props.sessionId) return; setBusy(true); try { setProjection((await withToken((token) => props.operations.decideCreative({ projectId: props.projectId, sessionId: props.sessionId!, candidateId, operationId: id(decision), decision, token }))).projection); } catch (cause) { setError(cause instanceof Error ? cause.message : "候选审查未完成。"); } finally { setBusy(false); } };
  const handoff = async (candidateId: string) => { if (!props.sessionId) return; setBusy(true); setError(""); try { const result = await withToken((token) => props.operations.handoffCreative({ projectId: props.projectId, sessionId: props.sessionId!, candidateId, operationId: id("handoff"), token })); setProjection(result.projection); if (result.eventReview) { setEventReview(result.eventReview); setEventReviewError(""); setSelectedImpactOptionId(result.eventReview.impact?.options[0]?.id || ""); } } catch (cause) { setError(cause instanceof Error ? cause.message : "现有资料交接未完成。"); } finally { setBusy(false); } };
  const readEventReview = async (candidateId: string) => { if (!props.sessionId) return; setEventReviewError(""); try { const value = await withToken((token) => props.operations.readCreativeEventReview({ projectId: props.projectId, sessionId: props.sessionId!, candidateId, token })); setEventReview(value); setSelectedImpactOptionId(value.impact?.options[0]?.id || ""); } catch (cause) { setEventReview(null); setEventReviewError(cause instanceof Error ? cause.message : "无法核验事件候选审查上下文。"); } };
  const beginEventImpact = async (candidateId: string) => { if (!props.sessionId) return; setBusy(true); setError(""); try { const value = await withToken((token) => props.operations.beginCreativeEventImpact({ projectId: props.projectId, sessionId: props.sessionId!, candidateId, token })); setEventReview(value); setSelectedImpactOptionId(value.impact?.options[0]?.id || ""); } catch (cause) { setError(cause instanceof Error ? cause.message : "影响审查未建立。"); } finally { setBusy(false); } };
  const rejectEvent = async (candidateId: string) => { if (!props.sessionId) return; setBusy(true); try { setEventReview(await withToken((token) => props.operations.rejectCreativeEvent({ projectId: props.projectId, sessionId: props.sessionId!, candidateId, token }))); } catch (cause) { setError(cause instanceof Error ? cause.message : "拒绝未完成。"); } finally { setBusy(false); } };
  const confirmEvent = async (candidateId: string) => { if (!props.sessionId || !selectedImpactOptionId) return; setBusy(true); try { const value = await withToken((token) => props.operations.confirmCreativeEvent({ projectId: props.projectId, sessionId: props.sessionId!, candidateId, optionId: selectedImpactOptionId, token })); setEventReview(value); } catch (cause) { setError(cause instanceof Error ? cause.message : "正式写入未完成。"); } finally { setBusy(false); } };
  const beginEdit = (candidate: TianyiCreativeProjection["candidates"][number]) => { setEditingCandidateId(candidate.candidateId); setEditTitle(candidate.title); setEditSummary(candidate.summary); setError(""); };
  const saveEdit = async (candidate: TianyiCreativeProjection["candidates"][number]) => { if (!props.sessionId || !editTitle.trim() || !editSummary.trim()) return; setBusy(true); setError(""); try { const result = await withToken((token) => props.operations.editCreative({ projectId: props.projectId, sessionId: props.sessionId!, candidateId: candidate.candidateId, operationId: id("edit"), expectedRevision: candidate.revision, title: editTitle, summary: editSummary, uncertainties: candidate.uncertainties, token })); setProjection(result.projection); setEditingCandidateId(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "候选编辑未完成。"); } finally { setBusy(false); } };
  const pause = async () => { if (!props.sessionId) return; setBusy(true); try { setProjection((await withToken((token) => props.operations.pauseCreative(props.projectId, props.sessionId!, id("pause"), token))).projection); } catch (cause) { setError(cause instanceof Error ? cause.message : "暂停未完成。"); } finally { setBusy(false); } };
  const recover = async () => { if (!props.sessionId) return; setBusy(true); setError(""); try { setProjection((await withToken((token) => props.operations.recoverCreative(props.projectId, props.sessionId!, id("recover"), token))).projection); } catch (cause) { setError(cause instanceof Error ? cause.message : "恢复未完成。"); } finally { setBusy(false); } };
  const complete = async () => { if (!props.sessionId) return; setBusy(true); try { setProjection((await withToken((token) => props.operations.completeCreative(props.projectId, props.sessionId!, id("complete"), token))).projection); } catch (cause) { setError(cause instanceof Error ? cause.message : "整理未完成。"); } finally { setBusy(false); } };
  const lifecycleCopy: Record<TianyiCreativeProjection["lifecycle"], string> = { idle: "等待原话", capturing: "原话已保存", responding: "天意正在回应", extracting: "正在整理候选", "review-ready": "等待作者审查", paused: "已暂停，可恢复", recovering: "正在恢复安全点", "provider-unavailable": "原话已保存，分析未运行", completed: "已完成", archived: "已归档" };
  const selectedCandidate = projection?.candidates.find((candidate) => candidate.candidateId === selectedCandidateId) ?? projection?.candidates[0] ?? null;
  const isEventCandidate = selectedCandidate?.kind === "event" && selectedCandidate.targetOwnerKind === "candidate-review";
  useEffect(() => { if (isEventCandidate && selectedCandidate) { setAuthorConfirmationOpen(false); setEventReview(null); void readEventReview(selectedCandidate.candidateId); } else { setEventReview(null); setEventReviewError(""); } }, [isEventCandidate, selectedCandidate?.candidateId, selectedCandidate?.revision]);
  const reviewStage: ReviewContextStage = eventReview?.confirmedEvents[0] ? "receipt" : eventReview?.impact ? (authorConfirmationOpen ? "confirmation" : "impact") : "candidate";
  const reviewTechnical = eventReview ? [
    { label: "Proposal ID", value: eventReview.proposal.id },
    { label: "CandidateReview ID", value: eventReview.candidateReview?.id },
    { label: "ImpactReview ID", value: eventReview.impact?.id },
    { label: "ChangeSet ID", value: eventReview.changeSet?.id },
    { label: "Event ID", value: eventReview.confirmedEvents[0]?.id },
    { label: "来源内容身份", value: eventReview.proposal.origin.version }
  ] : [];
  const latestOriginalId = projection?.originals.at(-1)?.eventId;
  const latestResponseId = projection?.responses.at(-1)?.eventId;
  return <div className={`tianyi-creative-canvas ${reviewOpen ? "is-review-open" : ""}`} data-testid="tianyi-creative-workspace"><section className="tianyi-creative-timeline" aria-label="作者原话与天意创意协作">
    <div className="tianyi-creative-state" role="status"><span>创意 · {lifecycleCopy[projection?.lifecycle ?? "idle"]}</span>{projection?.summaryState === "stale" ? <strong>新原话已产生，旧整理不会覆盖正式资料</strong> : null}{projection?.providerUnavailable ? <p>{projection.providerUnavailable.message} 可稍后重试。</p> : null}<button ref={reviewTriggerRef} type="button" className="tianyi-mobile-review-trigger" onClick={() => setReviewOpen(true)}>待审候选 {projection?.pendingCount ?? 0}</button></div>
    {projection?.originals.map((item) => <article className={`tianyi-thread-message is-author ${item.eventId === latestOriginalId ? "is-current" : "is-history"}`} key={item.eventId}><div className="tianyi-thread-message-meta"><span>作者原话 · 已安全保存</span><time>{new Date(item.recordedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.text}</p></article>)}
    {projection?.responses.map((item) => <article className={`tianyi-thread-message is-tianyi ${item.eventId === latestResponseId ? "is-current" : "is-history"}`} key={item.eventId}><div className="tianyi-thread-message-meta"><span>天意整理建议 · {item.runtime === "provider" ? "SiliconFlow" : "本地夹具"}</span><time>{new Date(item.recordedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.text}</p></article>)}
    {!projection?.originals.length && <div className="tianyi-conversation-empty"><Lightbulb /><div><small>创意模式</small><h1>先说出你的想法</h1><p>每一句原话会先安全记录；没有模型连接也能继续记录。</p></div></div>}
    <section className="tianyi-creative-understanding"><header><span><Sparkles />当前理解</span><small>{projection?.summaryState === "stale" ? "已有新原话，需重新整理" : "来源已安全保存"}</small></header><p>{projection?.summary ?? "尚未整理；摘要永远不会替换原话。"}</p>{projection?.themes.length ? <ul>{projection.themes.map((item) => <li key={item}>{item}</li>)}</ul> : null}</section>
    {error && <p className="tianyi-error" role="alert">{error}</p>}
    <label className="tianyi-creative-composer"><span>你的原话</span><textarea value={props.sharedDraft} onChange={(event) => props.onDraft(event.target.value)} placeholder="一个模糊的场景、人物、冲突或画面都可以……" disabled={busy || projection?.lifecycle === "completed" || projection?.lifecycle === "archived"} /><footer><small>先保存原话；模型连接可用时“记录并整理”才会发起一次受控整理请求。</small><button type="button" className="secondary-action" onClick={() => void submit(false)} disabled={busy || !props.sharedDraft.trim()}>只记录</button><button type="button" className="primary-action" onClick={() => void submit(true)} disabled={busy || !props.sharedDraft.trim()}>{busy ? <LoaderCircle className="is-spinning" /> : <Sparkles />}记录并整理</button></footer></label>
    </section><aside className={`tianyi-creative-review ${reviewOpen ? "is-open" : ""}`} aria-label="创意候选审查">
      <header><span>待审候选</span><strong>{projection?.pendingCount ?? 0}</strong><button type="button" className="tianyi-mobile-review-close" onClick={() => { setReviewOpen(false); reviewTriggerRef.current?.focus(); }}>返回画布</button></header>
      {projection?.candidates.length ? <>
        <nav className="tianyi-creative-candidate-nav" aria-label="候选列表">{projection.candidates.map((candidate) => <button key={candidate.candidateId} type="button" className={candidate.candidateId === selectedCandidate?.candidateId ? "is-selected" : ""} onClick={() => { setSelectedCandidateId(candidate.candidateId); setEditingCandidateId(null); }}><span>{candidate.title}</span><small>{candidate.state === "pending" ? "待审" : candidate.state}</small></button>)}</nav>
        {selectedCandidate ? <article key={selectedCandidate.candidateId}>
          {isEventCandidate && eventReview ? <ReviewContextSummary context={eventReview.reviewContext} stage={reviewStage} technical={reviewTechnical} /> : null}
          {isEventCandidate && eventReviewError ? <p className="tianyi-error" role="alert">审查已阻断：{eventReviewError}</p> : null}
          {editingCandidateId === selectedCandidate.candidateId ? <div className="tianyi-creative-edit"><label>候选名称<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><label>候选说明<textarea value={editSummary} onChange={(event) => setEditSummary(event.target.value)} /></label><footer><button type="button" className="primary-action" disabled={busy} onClick={() => void saveEdit(selectedCandidate)}>保存编辑</button><button type="button" className="secondary-action" disabled={busy} onClick={() => setEditingCandidateId(null)}>取消</button></footer></div> : <><strong>{selectedCandidate.title}</strong><p>{selectedCandidate.summary.replace(/现有 Agent\/Object/gu, "现有资料")}</p></>}
          <em>依据摘录：{selectedCandidate.sourceExcerpt}</em>
          {selectedCandidate.uncertainties.map((item) => <span key={item}>待确认：{item}</span>)}
          {isEventCandidate && eventReview ? <section className="tianyi-creative-event-review">
            {eventReview.impact ? <><p>影响审查：{eventReview.impact.status === "stale" ? "已过期，不能确认" : "已建立，尚未写入故事事实"}</p><p>候选摘要：{eventReview.proposal.summary}</p><p>受影响对象、冲突与未知项：{eventReview.proposal.unknowns.join("；") || "当前没有无法判断项"}</p><select aria-label="影响审查路线" value={selectedImpactOptionId} onChange={(event) => setSelectedImpactOptionId(event.target.value)}>{eventReview.impact.options.map((option) => <option key={option.id} value={option.id}>{option.label}：{option.summary}</option>)}</select></> : <p>候选正在等待影响审查；尚未写入故事事实。</p>}
            {eventReview.confirmedEvents[0] ? <><p role="status">已写入 Event：{eventReview.confirmedEvents[0].title}；来源可追溯状态已保留。</p><button type="button" className="primary-action" onClick={() => props.onOpenEventLine?.(eventReview.confirmedEvents[0].id)}>打开事件线</button></> : <footer>{!eventReview.impact ? <button type="button" className="primary-action" disabled={busy} onClick={() => void beginEventImpact(selectedCandidate.candidateId)}>查看影响审查</button> : !authorConfirmationOpen ? <button type="button" className="primary-action" disabled={busy || eventReview.impact.status === "stale" || !selectedImpactOptionId} onClick={() => setAuthorConfirmationOpen(true)}>进入作者确认</button> : <button type="button" className="primary-action" disabled={busy || eventReview.impact.status === "stale" || !selectedImpactOptionId} onClick={() => void confirmEvent(selectedCandidate.candidateId)}>确认并写入事件线</button>}<button type="button" className="secondary-action" disabled={busy} onClick={() => void rejectEvent(selectedCandidate.candidateId)}>拒绝候选</button></footer>}
          </section> : null}
          {selectedCandidate.state === "pending" && <footer>{selectedCandidate.targetOwnerKind === "agent-recognition-proposal" ? <button type="button" className="primary-action" disabled={busy} onClick={() => void handoff(selectedCandidate.candidateId)}>送入现有资料审核</button> : selectedCandidate.targetOwnerKind === "candidate-review" ? <button type="button" className="primary-action" disabled={busy || !eventReview} aria-describedby={eventReview ? undefined : "event-review-context-blocked"} onClick={() => void handoff(selectedCandidate.candidateId)}>审查这个候选</button> : null}{selectedCandidate.targetOwnerKind === "candidate-review" && !eventReview ? <span id="event-review-context-blocked">正在核验来源、版本与写入目标；未通过核验前不能进入审查。</span> : null}<button type="button" className="secondary-action" disabled={busy} onClick={() => beginEdit(selectedCandidate)}>编辑</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void decide(selectedCandidate.candidateId, "deferred")}>稍后处理</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void decide(selectedCandidate.candidateId, "rejected")}>拒绝</button></footer>}
        </article> : null}
      </> : <p>整理后，候选会显示在这里；没有唯一归属的内容继续保留为候选。</p>}
      <footer className="tianyi-creative-session-actions"><button type="button" className="secondary-action" onClick={() => void pause()} disabled={!props.sessionId || busy || projection?.lifecycle === "completed" || projection?.lifecycle === "archived"}><CirclePause />暂停</button>{projection?.lifecycle === "paused" || projection?.lifecycle === "provider-unavailable" || projection?.lifecycle === "recovering" ? <button type="button" className="secondary-action" onClick={() => void recover()} disabled={busy}>恢复安全点</button> : null}<button type="button" className="primary-action" onClick={() => void complete()} disabled={!props.sessionId || busy || (projection?.pendingCount ?? 0) > 0 || projection?.lifecycle === "completed" || projection?.lifecycle === "archived"}><Check />整理本次创意</button></footer>
    </aside></div>;
}

const TIANYI_AGENT_TASK_PRESETS = [
  "整理当前上下文",
  "检查故事逻辑",
  "查找开放问题",
  "检查角色知识边界",
  "归并重复候选",
  "为当前创意生成后续问题"
] as const;

type TianyiAgentSurfaceProps = {
  projectId: string;
  token: string;
  sessionId: string | null;
  sourceCount: number;
  providerReady: boolean | null;
  operations: TianyiV2Operations;
  baseContextRequest: TianyiContextRequest | null;
  sharedDraft: string;
  onDraft(value: string): void;
  onSessionId(sessionId: string): void;
  withConnection?: <T>(action: (token: string) => Promise<T>) => Promise<T>;
  presentation?: "full" | "dock";
  currentPage?: string;
};

/**
 * The Agent surface is deliberately task-first: the author starts one bounded
 * run, reviews its plan, and explicitly approves the next step. The runtime
 * projection is re-read from the Session event stream after reload; local
 * storage only remembers which run to request again and never stores content.
 */
export function TianyiAgentManagementSurface(props: TianyiAgentSurfaceProps) {
  const [task, setTask] = useState(props.sharedDraft);
  const [projection, setProjection] = useState<TianyiAgentRunProjection | null>(null);
  const [runId, setRunId] = useState("");
  const [steering, setSteering] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runStorageKey = `tianyi-agent-run:${props.projectId}:${props.sessionId ?? "none"}`;
  const operationId = (label: string) => `operation.tianyi-agent.${label}.${Date.now().toString(36)}`;
  const withToken = <T,>(action: (token: string) => Promise<T>): Promise<T> => props.withConnection ? props.withConnection(action) : action(props.token);
  const dockPresentation = props.presentation === "dock";

  useEffect(() => {
    if (!props.sharedDraft.trim() || props.sharedDraft === task) return;
    setTask(props.sharedDraft);
  }, [props.sharedDraft, task]);

  useEffect(() => {
    if (!props.sessionId || typeof window === "undefined") return;
    const storedRunId = window.sessionStorage.getItem(runStorageKey) || "";
    if (!storedRunId) return;
    setRunId(storedRunId);
    void withToken((token) => props.operations.recoverAgentRun({ projectId: props.projectId, sessionId: props.sessionId!, runId: storedRunId, token })).then((next) => {
      if (next) {
        setProjection(next);
        setTask((current) => current.trim() ? current : next.task);
      }
    }).catch(() => undefined);
  }, [props.operations, props.projectId, props.sessionId, props.token, props.withConnection, runStorageKey]);

  const withBusy = async (action: () => Promise<TianyiAgentRunProjection | null>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await action();
      if (next) setProjection(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "工作未完成；已保留当前会话，可以重试。");
    } finally {
      setBusy(false);
    }
  };

  const ensureSession = async () => {
    if (props.sessionId) return props.sessionId;
    const opened = await withToken((token) => props.operations.openSession(props.projectId, operationId("open-session"), token));
    props.onSessionId(opened.sessionId);
    return opened.sessionId;
  };

  const start = () => void withBusy(async () => {
    if (!task.trim()) throw new Error("先写下这次想让天意完成的工作。");
    const sessionId = await ensureSession();
    const next = await withToken((token) => props.operations.startAgentRun({
      projectId: props.projectId,
      sessionId,
      task,
      currentPage: props.currentPage ?? "/tianyi",
      contextRequest: props.baseContextRequest ? { ...props.baseContextRequest } : undefined,
      permissionProfile: "step-by-step",
      operationId: operationId("start"),
      token
    }));
    setRunId(next.runId);
    if (typeof window !== "undefined") window.sessionStorage.setItem(`tianyi-agent-run:${props.projectId}:${sessionId}`, next.runId);
    props.onDraft("");
    return next;
  });

  const currentAwaitingStep = projection?.plan.find((step) => step.status === "awaiting_author") ?? null;
  const approve = () => void withBusy(async () => {
    if (!projection || !currentAwaitingStep || !props.sessionId) throw new Error("当前没有等待作者确认的步骤。");
    return withToken((token) => props.operations.approveAgentStep({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, stepId: currentAwaitingStep.stepId, operationId: operationId("approve"), token }));
  });
  const continueRun = () => void withBusy(async () => {
    if (!projection || !props.sessionId) throw new Error("当前没有可继续的 Agent 运行。");
    return withToken((token) => props.operations.continueAgentRun({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, operationId: operationId("continue"), token }));
  });
  const reject = () => void withBusy(async () => {
    if (!projection || !currentAwaitingStep || !props.sessionId) throw new Error("当前没有等待作者确认的步骤。");
    return withToken((token) => props.operations.rejectAgentStep({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, stepId: currentAwaitingStep.stepId, reason: "作者暂不允许这一步。", operationId: operationId("reject"), token }));
  });
  const pause = () => void withBusy(async () => {
    if (!projection || !props.sessionId) throw new Error("当前没有可暂停的 Agent 运行。");
    return withToken((token) => props.operations.pauseAgentRun({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, operationId: operationId("pause"), token }));
  });
  const resume = () => void withBusy(async () => {
    if (!projection || !props.sessionId) throw new Error("当前没有可恢复的 Agent 运行。");
    return withToken((token) => props.operations.resumeAgentRun({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, operationId: operationId("resume"), token }));
  });
  const cancel = () => void withBusy(async () => {
    if (!projection || !props.sessionId) throw new Error("当前没有可取消的 Agent 运行。");
    return withToken((token) => props.operations.cancelAgentRun({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, reason: "作者停止了这项工作。", operationId: operationId("cancel"), token }));
  });
  const sendSteering = () => void withBusy(async () => {
    if (!projection || !props.sessionId || !steering.trim()) throw new Error("先写下要调整的方向。");
    const next = await withToken((token) => props.operations.steerAgentRun({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, instruction: steering, operationId: operationId("steer"), token }));
    setSteering("");
    return next;
  });
  const handoff = (candidateId: string) => void withBusy(async () => {
    if (!projection || !props.sessionId) throw new Error("当前没有可交接的 Agent 候选。");
    return withToken((token) => props.operations.handoffAgentCandidate({ projectId: props.projectId, sessionId: props.sessionId!, runId: projection.runId, candidateId, operationId: operationId("handoff"), token }));
  });

  const statusCopy: Record<TianyiAgentRunProjection["status"], string> = {
    idle: "等待开始", planning: "正在规划", awaiting_author: "等待作者确认", running: "正在工作", paused: "已暂停", completed: "已完成", failed: "需要处理错误", cancelled: "已取消"
  };
  const primaryLabel = !projection ? "开始这项工作" : projection.status === "awaiting_author" && currentAwaitingStep ? "允许下一步" : projection.status === "paused" ? "恢复工作" : projection.status === "running" ? "继续检查" : projection.status === "failed" ? "重试这项工作" : "开始下一项工作";
  const primaryAction = !projection || projection.status === "completed" || projection.status === "cancelled" || projection.status === "failed" ? start : projection.status === "awaiting_author" && currentAwaitingStep ? approve : projection.status === "paused" ? resume : continueRun;

  return <section className={`tianyi-agent-management tianyi-agent-workbench ${dockPresentation ? "is-dock" : ""}`} data-testid="tianyi-agent-management">
    <header className="tianyi-agent-hero"><small>{dockPresentation ? "天意工作" : "天意工作台"}</small><h1>{dockPresentation ? "在当前范围内完成一项工作" : "让天意完成一项明确的工作"}</h1><p>先限定当前会话和来源，再逐步确认工作计划。每个结果都先作为候选，不会自动改写故事事实。</p></header>
    <section className="tianyi-agent-task-card" aria-label="工作任务">
      <label htmlFor="tianyi-agent-task">这次想让天意做什么？</label>
      <textarea id="tianyi-agent-task" data-testid="tianyi-agent-task" value={task} onChange={(event) => { setTask(event.target.value); props.onDraft(event.target.value); }} maxLength={4000} placeholder="例如：检查当前角色的知识边界，并列出需要作者确认的开放问题。" disabled={busy || Boolean(projection && !["completed", "cancelled", "failed"].includes(projection.status))} />
      {!dockPresentation && <div className="tianyi-agent-presets" aria-label="常用工作"><span>从一个方向开始</span>{TIANYI_AGENT_TASK_PRESETS.map((preset) => <button type="button" className="secondary-action" key={preset} onClick={() => { setTask(preset); props.onDraft(preset); }} disabled={busy}>{preset}</button>)}</div>}
      <footer><span>{props.sourceCount} 项当前来源 · {props.providerReady ? "已连接可用模型" : "未连接模型，仍可用本地安全演示"}</span><button type="button" className="primary-action" data-testid="tianyi-agent-primary-action" onClick={primaryAction} disabled={busy || (!projection && !task.trim())}>{busy ? <LoaderCircle className="is-spinning" /> : <Sparkles />}{busy ? "处理中…" : primaryLabel}</button></footer>
    </section>
    {error && <p className="tianyi-error" role="alert">{error}</p>}
    {projection && <>
      <section className="tianyi-agent-run-summary" aria-label="当前工作"><div><span>当前工作</span><strong>{statusCopy[projection.status]}</strong></div><p>{projection.resultSummary || "天意会先读取当前引用范围，再按步骤请求你的确认。"}</p><small>{projection.model.runtime === "pi" ? "本次使用受天意控制的 Pi runtime" : "本次使用隔离安全夹具；没有自动写入故事资料"}</small></section>
      <section className="tianyi-agent-plan" aria-label="工作步骤"><header><div><small>工作步骤</small><h2>每一步都可暂停和回看</h2></div><span>{projection.budget.providerCalls}/{projection.budget.maxProviderCalls} 次模型调用</span></header><ol>{projection.plan.map((step) => <li key={step.stepId} className={`is-${step.status}`}><span className="tianyi-agent-step-marker" aria-hidden="true" /><div><strong>{step.title}</strong><small>{step.status === "awaiting_author" ? "等待你的确认" : step.status === "completed" ? "已完成" : step.status === "rejected" ? "已拒绝" : step.status === "failed" ? "失败，可重试" : "待处理"}</small></div>{step.status === "awaiting_author" && <span className="tianyi-agent-step-actions"><button type="button" className="primary-action" onClick={approve} disabled={busy}>允许</button><button type="button" className="secondary-action" onClick={reject} disabled={busy}>暂不允许</button></span>}</li>)}</ol></section>
      {projection.candidates.length > 0 && <section className="tianyi-agent-candidates" aria-label="带来源的候选"><header><div><small>带来源的候选</small><h2>先看建议，再决定交给谁</h2></div><span>{projection.candidates.filter((candidate) => candidate.state === "pending").length} 项待处理</span></header><div className="tianyi-agent-candidate-list">{projection.candidates.map((candidate) => <article key={candidate.candidateId} className={`is-${candidate.state}`}><div><span>{candidate.kind === "unknown" ? "待确认类型" : candidate.kind}</span><strong>{candidate.title}</strong><p>{authorFacingWorkCopy(candidate.summary)}</p><small>来源 {candidate.sourceRefs.length} 项 · {candidate.uncertainties.join("；")}</small></div><footer>{candidate.ownerReceipt ? <span className="tianyi-owner-receipt">已获得现有资料回执</span> : candidate.targetOwnerKind === "agent-recognition-proposal" && candidate.state === "pending" ? <button type="button" className="primary-action" onClick={() => handoff(candidate.candidateId)} disabled={busy}>交给现有资料审核</button> : <span>{candidate.state === "deferred" ? "稍后处理" : candidate.state === "rejected" ? "已拒绝" : "保持候选"}</span>}</footer></article>)}</div></section>}
      <section className="tianyi-agent-steering" aria-label="调整方向"><label htmlFor="tianyi-agent-steering">调整下一步方向</label><div><input id="tianyi-agent-steering" value={steering} onChange={(event) => setSteering(event.target.value)} placeholder="例如：只看当前章节，不要扩展到全项目。" disabled={busy || ["completed", "cancelled"].includes(projection.status)} /><button type="button" className="secondary-action" onClick={sendSteering} disabled={busy || !steering.trim()}>告诉天意</button></div></section>
      <footer className="tianyi-agent-run-actions"><button type="button" className="secondary-action" onClick={pause} disabled={busy || !props.sessionId || ["completed", "cancelled", "paused"].includes(projection.status)}>暂停</button>{projection.status === "paused" && <button type="button" className="secondary-action" onClick={resume} disabled={busy}>恢复</button>}<button type="button" className="secondary-action" onClick={cancel} disabled={busy || !props.sessionId || ["completed", "cancelled"].includes(projection.status)}>停止</button></footer>
      <details className="tianyi-agent-technical-details"><summary>查看运行与来源详情</summary><p>当前 Session、来源锚点、步骤回执和 Owner 回执都保存在既有连续性链路中。这里只显示调试信息，不包含密钥或原始模型响应。</p><dl><div><dt>运行状态</dt><dd>{statusCopy[projection.status]}</dd></div><div><dt>来源范围</dt><dd>{projection.contextManifest?.sourceRefs.length ?? 0} 项</dd></div><div><dt>回执</dt><dd>{projection.receipts.length} 条</dd></div><div><dt>运行编号</dt><dd>{projection.runId}</dd></div></dl></details>
    </>}
  </section>;
}
