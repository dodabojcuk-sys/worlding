import { useEffect, useState } from "react";
import { getTianyiSessionMetadata, openTianyiSession, type TianyiSessionMetadata, type TianyiSessionScope } from "../../lib/localTransport";
import { TianyiSessionScopeChoice } from "../../components/tianyi/TianyiSessionScopeChoice";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

/** The Tianyi session owner is shared with the full conversation workspace. */
export function TianyiConversationDirectory({ runtime }: { runtime: TianyanShellRuntimeState }) {
  const projectId = runtime.project?.id ?? null;
  const [sessions, setSessions] = useState<TianyiSessionMetadata[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newScope, setNewScope] = useState<TianyiSessionScope | null>(null);
  useEffect(() => {
    if (!projectId) { setSessions([]); return; }
    let active = true;
    void runtime.withConnection((token) => getTianyiSessionMetadata(projectId, null, token)).then((read) => {
      if (active) setSessions(Array.isArray(read) ? read : []);
    }).catch(() => { if (active) setError("天意对话暂时无法读取。"); });
    return () => { active = false; };
  }, [projectId, runtime.withConnection]);
  function open(sessionId: string) {
    runtime.setTianyiConversationId(sessionId);
    window.location.assign(`/tianyi?tianyiSession=${encodeURIComponent(sessionId)}`);
  }
  async function create() {
    if (!projectId || !newScope || busy) return;
    setBusy(true); setError(null);
    try {
      const opened = await runtime.withConnection((token) => openTianyiSession(projectId, `tianyi-directory.${crypto.randomUUID()}`, token, "normal", newScope));
      if (opened.conflict) throw new Error("新建对话发生冲突，请刷新后重试。");
      open(opened.sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "新建对话失败。"); setBusy(false); }
  }
  const filtered = sessions.filter((session, index) => (session.title || session.visibleMessages.find((message) => message.actor === "author")?.visibleContent || `对话 ${index + 1}`).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="tianyi-directory-conversations" data-testid="tianyi-directory-conversations">
    <TianyiSessionScopeChoice projectId={projectId} value={newScope} onChange={setNewScope} disabled={busy} />
    <button type="button" onClick={() => void create()} disabled={!projectId || !newScope || busy}>＋ 新建天意对话</button>
    {sessions.length > 8 ? <input aria-label="搜索天意对话" placeholder="搜索天意对话" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} /> : null}
    <div className="tianyi-directory-conversation-list">{filtered.slice(0, limit).map((session, index) => {
      const title = session.title || session.visibleMessages.find((message) => message.actor === "author")?.visibleContent || `对话 ${index + 1}`;
      return <button type="button" key={session.id} title={title} aria-current={runtime.tianyiConversationId === session.id ? "page" : undefined} onClick={() => open(session.id)}>{title}<small>{session.scope?.kind === "project" ? "项目讨论" : session.scope?.kind === "event-line" ? `事件线 ${session.scope.storylineKey}` : "待补选范围"}</small></button>;
    })}{!filtered.length ? <p>暂无匹配对话。</p> : null}{filtered.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 20)}>显示更多对话</button> : null}</div>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
