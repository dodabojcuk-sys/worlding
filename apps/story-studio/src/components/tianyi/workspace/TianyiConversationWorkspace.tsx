import { ArrowRight, BookOpen, FilePlus2, History, Link2, LoaderCircle, Paperclip, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  captureTianyiCreativeAuthorSource,
  decideTianyiCreativeCandidate,
  extractTianyiCreativeProjection,
  getTianyiCreativeProjection,
  getTianyiSessionMetadata,
  handoffTianyiCreativeCandidate,
  openTianyiSession,
  type TianyiCreativeProjection,
  type TianyiSessionMetadata
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";

type Lane = "creative" | "work";

export function TianyiConversationWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const { runtime } = props;
  const project = runtime.project;
  const [lane, setLane] = useState<Lane>(() => new URLSearchParams(window.location.search).get("tianyiLane") === "work" ? "work" : "creative");
  const [projection, setProjection] = useState<TianyiCreativeProjection | null>(null);
  const [metadata, setMetadata] = useState<TianyiSessionMetadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const restoreRequestedLane = () => {
      if (window.location.pathname === "/tianyi" && new URLSearchParams(window.location.search).get("tianyiLane") === "work") setLane("work");
    };
    restoreRequestedLane();
    window.addEventListener("popstate", restoreRequestedLane);
    return () => window.removeEventListener("popstate", restoreRequestedLane);
  }, []);

  const operationId = (label: string) => `operation.tianyi-golden-loop.${label}.${crypto.randomUUID()}`;
  const ensureConversation = useCallback(async () => {
    if (!project) throw new Error("请先打开一个作品。");
    if (runtime.tianyiConversationId) return runtime.tianyiConversationId;
    const opened = await runtime.withConnection((token) => openTianyiSession(project.id, operationId("open"), token));
    runtime.setTianyiConversationId(opened.sessionId);
    return opened.sessionId;
  }, [project, runtime]);

  const refresh = useCallback(async (sessionId: string, candidateId = runtime.activeTianyiCandidateId) => {
    if (!project) return;
    const [nextProjection, nextMetadata] = await runtime.withConnection((token) => Promise.all([
      getTianyiCreativeProjection(project.id, sessionId, token),
      getTianyiSessionMetadata(project.id, sessionId, token)
    ]));
    setProjection(nextProjection);
    setMetadata(Array.isArray(nextMetadata) ? nextMetadata.find((item) => item.id === sessionId) ?? null : nextMetadata);
    const activeCandidate = candidateId ?? nextProjection?.candidates.find((item) => item.state === "handed-off")?.candidateId ?? null;
    if (activeCandidate) runtime.setActiveTianyiCandidateId(activeCandidate);
  }, [project, runtime]);

  useEffect(() => {
    if (!runtime.tianyiConversationId || !project) return;
    void refresh(runtime.tianyiConversationId).catch(() => undefined);
  }, [project, refresh, runtime.tianyiConversationId]);

  const submitCreative = async () => {
    const text = runtime.creativeComposerDraft.trim();
    if (!text || !project || busy) return;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureConversation();
      const captureOperationId = operationId("capture");
      const captured = await runtime.withConnection((token) => captureTianyiCreativeAuthorSource({
        projectId: project.id,
        sessionId,
        operationId: captureOperationId,
        submissionId: operationId("submission"),
        text,
        collaborate: false,
        token
      }));
      const extracted = await runtime.withConnection((token) => extractTianyiCreativeProjection({
        projectId: project.id,
        sessionId,
        operationId: operationId("extract"),
        source: captured.source,
        fixture: deterministicThreeCandidates(text),
        token
      }));
      setProjection(extracted.projection);
      runtime.setCreativeComposerDraft("");
      await refresh(sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "这次整理没有完成；原草稿仍保留。"); }
    finally { setBusy(false); }
  };

  const preserveCandidate = async (candidateId: string) => {
    if (!project || !runtime.tianyiConversationId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await runtime.withConnection((token) => decideTianyiCreativeCandidate({ projectId: project.id, sessionId: runtime.tianyiConversationId!, candidateId, operationId: operationId("preserve"), decision: "deferred", token }));
      setProjection(result.projection);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "未能保留候选。"); }
    finally { setBusy(false); }
  };

  const moveCandidateToWork = async (candidateId: string) => {
    if (!project || !runtime.tianyiConversationId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await runtime.withConnection((token) => handoffTianyiCreativeCandidate({ projectId: project.id, sessionId: runtime.tianyiConversationId!, candidateId, operationId: operationId("handoff"), token }));
      runtime.setActiveTianyiCandidateId(candidateId);
      setProjection(result.projection);
      setLane("work");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "候选未能进入 Work lane。"); }
    finally { setBusy(false); }
  };

  const openEventLine = () => {
    if (!runtime.tianyiConversationId || !runtime.activeTianyiCandidateId) return;
    const params = new URLSearchParams({ tianyiSession: runtime.tianyiConversationId, tianyiCandidate: runtime.activeTianyiCandidateId });
    window.history.pushState({}, "", `/event-line?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeCandidate = useMemo(() => projection?.candidates.find((item) => item.candidateId === runtime.activeTianyiCandidateId) ?? null, [projection, runtime.activeTianyiCandidateId]);
  const draft = lane === "creative" ? runtime.creativeComposerDraft : runtime.workComposerDraft;
  const setDraft = lane === "creative" ? runtime.setCreativeComposerDraft : runtime.setWorkComposerDraft;

  if (!project) return <main className="tianyi-workspace"><section className="tianyi-workspace-empty"><Sparkles /><h1>天意</h1><p>请先打开一个作品，再开始同一段创意与工作会话。</p></section></main>;

  return <main className="tianyi-workspace" aria-label="天意统一会话" data-tianyi-conversation-id={runtime.tianyiConversationId ?? "not-started"} data-active-lane={lane}>
    <header className="tianyi-workspace-header">
      <div><small>TIANYI CONVERSATION</small><h1>天意</h1></div>
      <div className="tianyi-lane-switch" role="tablist" aria-label="天意模式">
        <button type="button" role="tab" aria-selected={lane === "creative"} onClick={() => setLane("creative")}>创意模式</button>
        <button type="button" role="tab" aria-selected={lane === "work"} onClick={() => setLane("work")}>工作模式</button>
      </div>
      <p><History />同一会话 · 历史、附件、来源、引用与候选持续保留</p>
    </header>

    <div className="tianyi-workspace-body">
      <section className="tianyi-conversation-column">
        <section className="tianyi-visible-history" aria-label="同一会话的可见历史">
          {metadata?.visibleMessages.length ? metadata.visibleMessages.map((message) => <article key={message.eventId} className={`is-${message.actor}`}><span>{message.actor === "author" ? "你" : "天意"}</span><p>{message.visibleContent}</p></article>) : <div className="tianyi-conversation-welcome"><Sparkles /><h2>从一个变化开始</h2><p>创意模式负责展开可能性；工作模式负责把明确候选带到影响审查与作者采纳。</p><small>本轮使用确定性本地整理，Provider 调用为 0。</small></div>}
        </section>

        {lane === "creative" ? <section className="tianyi-lane-stage" aria-label="创意模式工作区">
          <div className="tianyi-stage-heading"><div><small>CREATIVE LANE</small><h2>让想法先展开，不默认改动正式故事</h2></div><span>快速对话 · 大上下文提炼 · 候选</span></div>
          {projection?.summary ? <article className="tianyi-summary-card"><strong>本轮提炼</strong><p>{projection.summary}</p><small>来源：作者原话 {projection.summarySourceRefs[0]?.eventId.slice(0, 12)} · {projection.summaryState === "current" ? "当前版本" : "需重新提炼"}</small></article> : null}
          {projection?.candidates.length ? <div className="tianyi-candidate-grid" aria-label="共享候选注册表">{projection.candidates.map((candidate, index) => <article key={candidate.candidateId} data-candidate-state={candidate.state}><header><span>方向 {index + 1}</span><small>{candidate.state === "deferred" ? "已保留可能性" : candidate.state === "handed-off" ? "已进入工作" : "候选"}</small></header><h3>{candidate.title}</h3><p>{candidate.summary}</p><small>{candidate.uncertainties.join("；")}</small><footer>{candidate.state === "pending" ? <><button type="button" onClick={() => preserveCandidate(candidate.candidateId)}>保留可能性</button><button type="button" className="primary-action" onClick={() => moveCandidateToWork(candidate.candidateId)}>进入工作模式<ArrowRight /></button></> : candidate.state === "handed-off" ? <button type="button" onClick={() => { runtime.setActiveTianyiCandidateId(candidate.candidateId); setLane("work"); }}>继续工作</button> : <span>可在候选历史中恢复</span>}</footer></article>)}</div> : null}
        </section> : <section className="tianyi-lane-stage" aria-label="工作模式工作区">
          <div className="tianyi-stage-heading"><div><small>WORK LANE</small><h2>{activeCandidate?.title ?? "选择一个候选继续"}</h2></div><span>深度分析 · 方案发展 · 影响审查</span></div>
          <div className="tianyi-work-contract">
            <dl><div><dt>当前工作目标</dt><dd>{activeCandidate?.summary ?? "从共享候选注册表选择一项"}</dd></div><div><dt>目标故事</dt><dd>{project.title}</dd></div><div><dt>基础版本</dt><dd>{runtime.workVersionLabel ?? "当前主线（尚未建立版本）"}</dd></div><div><dt>ContextPack</dt><dd>{runtime.sharedTianyiReferences.length ? `${runtime.sharedTianyiReferences.length} 个引用` : "作者原话与当前故事范围"}</dd></div></dl>
            <label>工作范围<select value={runtime.workScope} onChange={(event) => runtime.setWorkScope(event.target.value as TianyanShellRuntimeState["workScope"])}><option value="current-story">当前故事</option><option value="current-unit">当前单元</option><option value="selected-events">选中事件</option></select></label>
          </div>
          {activeCandidate ? <TianyiAdoptionPanel runtime={runtime} onOpenEventLine={openEventLine} /> : <p className="tianyi-work-empty">在创意模式选择一个候选，Work lane 会保留目标、基础版本、范围与 ContextPack。</p>}
        </section>}

        {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
        <section className="tianyi-workspace-composer">
          <textarea aria-label={lane === "creative" ? "创意模式草稿" : "工作模式草稿"} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder={lane === "creative" ? "提出一个故事变化，或粘贴一段灵感……" : "继续推演当前候选；未发送草稿只属于 Work lane……"} />
          <div><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `attachment:${crypto.randomUUID()}`, label: "本地附件（演示）", kind: "attachment" })}><Paperclip />附件</button><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `source:${crypto.randomUUID()}`, label: "工程来源（演示）", kind: "source" })}><Link2 />来源</button>{lane === "creative" ? <button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}整理成三个候选</button> : <button type="button" className="tianyi-send" disabled={!draft.trim()} onClick={() => runtime.setWorkComposerDraft(draft)}><Send />保留工作草稿</button>}</div>
        </section>
      </section>

      <aside className="tianyi-current-context" aria-label="当前视图">
        <header><strong>当前视图</strong><small>只读</small></header>
        <section><BookOpen /><div><strong>上下文</strong><p>{project.title}</p><small>{runtime.workVersionLabel ?? "当前故事"}</small></div></section>
        <section><FilePlus2 /><div><strong>共享引用</strong>{runtime.sharedTianyiReferences.length ? runtime.sharedTianyiReferences.map((item) => <p key={item.id}>{item.label}</p>) : <p>尚未添加附件或来源</p>}</div></section>
        <section><Sparkles /><div><strong>候选注册表</strong><p>{projection?.candidates.length ?? 0} 个候选</p><small>Creative 与 Work 共同可见</small></div></section>
      </aside>
    </div>
  </main>;
}

function deterministicThreeCandidates(text: string) {
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 180);
  return {
    reply: "我保留了你的原话，并整理出三条互相区别的事件方向。它们都只是候选，尚未写入正式故事。",
    summary: `围绕“${excerpt}”展开三个可审查方向；作者仍掌握唯一采纳权。`,
    themes: ["动机与代价", "规则与冲突", "时间与抵达"],
    openQuestions: ["哪条变化最接近当前故事目标？"],
    candidates: [
      { kind: "event", title: "方向一：守住旧约", summary: `${excerpt}，人物选择兑现旧约，但必须承担新的代价。`, uncertainties: ["代价的承担者仍待作者确认"] },
      { kind: "event", title: "方向二：规则失效", summary: `${excerpt}，既有规则在关键时刻失效，迫使人物寻找新的通道。`, uncertainties: ["规则失效范围仍待影响审查"] },
      { kind: "event", title: "方向三：提前抵达", summary: `${excerpt}，一个关键人物提前抵达，改变原有事件顺序。`, uncertainties: ["时间顺序与连锁影响仍待核对"] }
    ]
  };
}
