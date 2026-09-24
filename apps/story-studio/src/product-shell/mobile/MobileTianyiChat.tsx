import { useEffect, useRef, useState } from "react";
import { getTianyiSessionMetadata, openTianyiSession, selectTianyiSessionScope, streamTianyiGroundedAnswer, type TianyiSessionMetadata, type TianyiSessionScope } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import { TianyiSessionScopeChoice } from "../../components/tianyi/TianyiSessionScopeChoice";

const QUICK = [
  ["生成角色设定", "帮我把这一场里还没成形的角色整理成设定。"],
  ["继续扩写", "接着最后一段往下扩写，不要改已经定下来的部分。"],
  ["整理灵感", "把我刚才说的想法整理成一条灵感记录。"]
] as const;

/** The original phone prototype's chat surface, backed by the shared Session owner. */
export function MobileTianyiChat(props: { runtime: TianyanShellRuntimeState; onDirectory(): void; onWork(): void }) {
  const { runtime } = props;
  const project = runtime.project;
  const sessionId = runtime.tianyiConversationId;
  const [session, setSession] = useState<TianyiSessionMetadata | null>(null);
  const [scopeChoice, setScopeChoice] = useState<TianyiSessionScope | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState("");
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [draftExpanded, setDraftExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSession(null); setScopeChoice(null); setError(""); setStreamText("");
    if (!project || !sessionId) return;
    let active = true;
    void runtime.withConnection((token) => getTianyiSessionMetadata(project.id, sessionId, token)).then((read) => {
      if (active) setSession(Array.isArray(read) ? read.find((item) => item.id === sessionId) ?? null : read);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [project?.id, sessionId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [session?.visibleMessages.length, streamText]);

  async function send(value = runtime.creativeComposerDraft) {
    const question = value.trim();
    if (!project || !question || busy) return;
    setBusy(true); setError(""); setStreamText("");
    try {
      let targetId = sessionId;
      let scope = session?.scope ?? null;
      if (!targetId) {
        if (!scopeChoice) throw new Error("新对话请先选择项目讨论或目标事件线；草稿仍保留。");
        const opened = await runtime.withConnection((token) => openTianyiSession(project.id, `operation.mobile-open.${crypto.randomUUID()}`, token, "normal", scopeChoice));
        targetId = opened.sessionId;
        scope = scopeChoice;
        runtime.setTianyiConversationId(targetId);
      } else if (!scope) {
        if (!scopeChoice) throw new Error("历史对话尚未绑定范围；请明确补选后再发送。");
        const selected = await runtime.withConnection((token) => selectTianyiSessionScope({ projectId: project.id, sessionId: targetId!, scope: scopeChoice, operationId: `operation.mobile-scope.${crypto.randomUUID()}`, token }));
        setSession(selected);
        scope = selected.scope ?? null;
      }
      if (!scope) throw new Error("天意对话范围尚未保存；没有发送请求。");
      const model = runtime.modelStatus;
      const selectedModelId = model?.profile.profile?.modelId;
      const profileId = model?.tianyiDialogue.runtime === "local-fake"
        ? "local-fake-grounded-answer"
        : model?.profiles.find((item) => item.modelId === selectedModelId)?.id;
      if (!profileId || (model?.tianyiDialogue.runtime !== "local-fake" && !model?.tianyiDialogue.ready)) throw new Error("当前没有可用的回答模型；草稿仍保留。");
      const latest = await runtime.withConnection((token) => getTianyiSessionMetadata(project.id, targetId!, token));
      const savedScope = (Array.isArray(latest) ? latest.find((item) => item.id === targetId) : latest)?.scope;
      if (JSON.stringify(savedScope) !== JSON.stringify(scope)) throw new Error("对话范围在发送前发生变化；请刷新后重试。");
      const retry = (Array.isArray(latest) ? latest.find((item) => item.id === targetId) : latest)?.groundedAttempts.slice().reverse().find((item) => item.question === question && item.profileId === profileId && item.state !== "COMPLETED");
      const result = await runtime.withConnection((token) => streamTianyiGroundedAnswer({
        operationId: `operation.mobile-answer.${crypto.randomUUID()}`,
        submissionId: retry?.submissionId ?? `submission.mobile-answer.${crypto.randomUUID()}`,
        explicitRetry: retry?.retryRequired === true,
        profileId, question,
        contextRequest: { version: "story-tianyi-grounded-context-request/v1", projectId: project.id, sessionId: targetId!, taskKind: "grounded-answer", accessMode: "author", subjectRef: null, sceneRef: null, explicitRefs: [], scope },
        token, onDraft: (event) => setStreamText(event.text)
      }));
      if (result.status !== "current" || !result.answer) throw new Error("本轮回答未完成；草稿仍保留，请查看回执后重试。");
      const read = await runtime.withConnection((token) => getTianyiSessionMetadata(project.id, targetId!, token));
      setSession(Array.isArray(read) ? read.find((item) => item.id === targetId) ?? null : read);
      runtime.setCreativeComposerDraft("");
      setStreamText("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  const selected = session?.scope ?? scopeChoice;
  return <section className="mobile-chat-view" aria-label="天意对话">
    <div className="mobile-chat-context"><button type="button" className="mobile-chat-context-chip" onClick={props.onDirectory}>《{project?.title ?? "未选作品"}》· {selected?.kind === "event-line" ? "事件线对话" : selected?.kind === "project" ? "项目对话" : "待选范围"}</button><span>{session?.title || (sessionId ? "历史对话" : "新对话")}</span></div>
    <div className="mobile-chat-scope"><TianyiSessionScopeChoice projectId={project?.id ?? null} value={selected} onChange={setScopeChoice} disabled={busy || Boolean(session?.scope)} />{session?.scope ? <small>范围已保存；换线请新建对话。</small> : null}</div>
    <div className="mobile-chat-messages" ref={scrollRef}>
      {session?.visibleMessages.length ? session.visibleMessages.map((message) => <div className={`mobile-chat-message ${message.actor === "author" ? "mobile-chat-message-own" : ""}`} key={message.eventId}><span className="mobile-chat-avatar">{message.actor === "author" ? "我" : "天"}</span><div className="mobile-chat-message-body">{message.visibleContent}</div></div>) : <div className="mobile-chat-message"><span className="mobile-chat-avatar">天</span><div className="mobile-chat-message-body">这里是《{project?.title ?? "当前作品"}》的对话。选定项目或事件线后，可以直接开始创作。</div></div>}
      {streamText ? <div className="mobile-chat-message"><span className="mobile-chat-avatar">天</span><div className="mobile-chat-message-body">{streamText}</div></div> : null}
      {error ? <p className="mobile-chat-error" role="alert">{error}</p> : null}
    </div>
    <div className="mobile-chat-composer"><div className="mobile-chat-quick">{QUICK.map(([label, prompt]) => <button type="button" key={label} onClick={() => runtime.setCreativeComposerDraft(prompt)}>{label}</button>)}</div><div className={`mobile-chat-inputbar ${draftExpanded ? "is-expanded" : ""}`}><button type="button" aria-label="高级工作面 · 整理为故事候选" onClick={props.onWork}>＋</button><textarea aria-label="和天意对话" placeholder={`和天意聊聊《${project?.title ?? "当前作品"}》`} value={runtime.creativeComposerDraft} onChange={(event) => runtime.setCreativeComposerDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void send(); } }} rows={draftExpanded ? 7 : 2} /><button type="button" aria-label="发送普通对话" disabled={busy || !runtime.creativeComposerDraft.trim()} onClick={() => void send()}>➤</button></div><div className="mobile-chat-foot"><button type="button" onClick={() => setSkillsOpen((open) => !open)}>＋ 技能</button><button type="button" aria-label={draftExpanded ? "收起草稿" : "展开草稿"} onClick={() => setDraftExpanded((open) => !open)}>{draftExpanded ? "收起草稿" : "展开草稿"}</button><span>普通发送 · 不写入正式故事</span></div>{skillsOpen ? <div className="mobile-chat-skills"><h3>技能 · 快捷入口</h3>{["拆书", "总结", "提取人物", "提取世界观"].map((skill) => <button type="button" key={skill} onClick={() => { runtime.setCreativeComposerDraft(`请帮我${skill}，先保留候选与依据。`); setSkillsOpen(false); }}>{skill}</button>)}</div> : null}</div>
  </section>;
}
