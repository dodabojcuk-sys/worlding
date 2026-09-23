import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MessageSquarePlus, FolderPlus, Pencil, X } from "lucide-react";
import { getNuwaN1Bootstrap, getTianyiSessionMetadata, openTianyiSession, renameTianyiSession, renameStoryProject, type TianyiSessionMetadata } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import { readSelectedConversation, retainSelectedConversation } from "../runtime/tianyiShellSessionRecovery";
import { useI18n } from "../i18n/I18nProvider";

type RunHistoryItem = { runId: string; conversationId?: string | null; label: string; status: string; createdAt: string };

/** Navigation projection only; projects, session archives and RunPack retain ownership. */
export function ProjectConversationPanel({ runtime, onDirectory, onClose, currentProjectOnly = false }: { runtime: TianyanShellRuntimeState; onDirectory(): void; onClose(): void; currentProjectOnly?: boolean }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState<string[]>(() => runtime.project ? [runtime.project.id] : []);
  const [sessions, setSessions] = useState<Record<string, TianyiSessionMetadata[]>>({});
  const [history, setHistory] = useState<Record<string, RunHistoryItem[]>>({});
  const [failed, setFailed] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [renaming, setRenaming] = useState<{ projectId: string; title: string; session?: TianyiSessionMetadata } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRunId = new URLSearchParams(window.location.search).get("runId");
  const scrollKey = `tianyan-nuwa-conversations-scroll:${runtime.project?.id ?? "none"}`;
  useEffect(() => {
    if (!currentProjectOnly || !runtime.project || !sessions[runtime.project.id]) return;
    try { if (listRef.current) listRef.current.scrollTop = Number(window.sessionStorage.getItem(scrollKey)) || 0; }
    catch { /* scrolling remains usable without storage */ }
  }, [currentProjectOnly, runtime.project?.id, scrollKey, sessions]);
  useEffect(() => {
    if (!activeRunId) return;
    // History arrives after the conversation list. Open the current association
    // once it exists; authors may then collapse it without losing Run identity.
    for (const details of listRef.current?.querySelectorAll<HTMLDetailsElement>(".conversation-runs:not(.project-run-history)") ?? []) {
      if (details.querySelector('[aria-current="page"]')) details.open = true;
    }
  }, [activeRunId, history]);
  function runLabel(run: RunHistoryItem) {
    const statusKey = {
      ready: "conversation.runReady", running: "conversation.runRunning", paused: "conversation.runPaused",
      completed: "conversation.runCompleted", cancelled: "conversation.runStopped", blocked: "conversation.runBlocked"
    }[run.status] as Parameters<typeof t>[0] | undefined;
    const date = new Date(run.createdAt);
    const when = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
    return [run.label, statusKey ? t(statusKey) : run.status, when].filter(Boolean).join(" · ");
  }
  useEffect(() => {
    let active = true;
    setFailed([]);
    for (const projectId of expanded) void Promise.all([
      runtime.withConnection((token) => getTianyiSessionMetadata(projectId, null, token)), getNuwaN1Bootstrap(projectId)
    ]).then(([items, data]) => {
      if (!active) return;
      setSessions((current) => ({ ...current, [projectId]: Array.isArray(items) ? items : [] }));
      setHistory((current) => ({ ...current, [projectId]: data.runs ?? [] }));
    }).catch(() => { if (active) setFailed((items) => [...items, projectId]); });
    return () => { active = false; };
  }, [expanded, revision, runtime.withConnection]);
  async function select(projectId: string, sessionId: string | null, runId?: string) {
    setBusy(true); setError("");
    try {
      await runtime.openProject(projectId);
      retainSelectedConversation(projectId, sessionId);
      const url = new URL(runId ? "/nuwa" : window.location.pathname, window.location.origin);
      url.searchParams.set("locale", locale);
      if (runId) url.searchParams.set("runId", runId);
      // Full navigation leaves requests bound to their captured server identity.
      window.location.assign(url.toString());
    } catch (cause) { setError(String(cause)); setBusy(false); }
  }
  async function createConversation(projectId?: string) {
    if (busy) return;
    if (!projectId) { setCreating(true); return; }
    setBusy(true); setError("");
    try {
      const opened = await runtime.withConnection((token) => openTianyiSession(projectId, `conversation.${crypto.randomUUID()}`, token));
      if (opened.conflict) throw new Error(t("conversation.failed"));
      await select(projectId, opened.sessionId);
    } catch (cause) { setError(String(cause)); setBusy(false); }
  }
  async function rename() {
    if (!renaming || busy || !title.trim()) return;
    setBusy(true); setError("");
    try {
      if (renaming.session) {
        const session = renaming.session;
        await runtime.withConnection((token) => renameTianyiSession({ projectId: renaming.projectId, sessionId: session.id, title: title.trim(), expectedContentHash: session.contentHash!, operationId: `rename.${crypto.randomUUID()}`, token }));
        setRenaming(null); setTitle(""); setRevision((n) => n + 1); setBusy(false);
      } else {
        await runtime.withConnection((token) => renameStoryProject({ projectId: renaming.projectId, title: title.trim(), expectedTitle: renaming.title, token }));
        window.location.reload();
      }
    } catch (cause) { setError(String(cause)); setBusy(false); }
  }
  return <aside className={`project-directory-panel project-conversation-panel${currentProjectOnly ? " is-embedded" : ""}`} aria-label={t("conversation.title")} data-testid="project-conversations">
    {!currentProjectOnly ? <header><h2>{t("conversation.title")}</h2><button type="button" onClick={onClose} aria-label={t("conversation.close")}><X /></button></header> : null}
    <button className="conversation-new" type="button" disabled={busy} onClick={() => void createConversation(runtime.project?.id)}><MessageSquarePlus />{t("conversation.newChat")}</button>
    {!currentProjectOnly ? <button className="conversation-secondary" type="button" onClick={() => { setCreating((v) => !v); setRenaming(null); setTitle(""); }}><FolderPlus />{t("conversation.newProject")}</button> : null}
    {creating || renaming ? <form onSubmit={(event) => { event.preventDefault(); if (renaming) { void rename(); return; } if (!title.trim() || busy) return; setBusy(true); void runtime.createProject(title.trim()).then(() => window.location.reload()).catch((cause) => { setError(String(cause)); setBusy(false); }); }}>
      <input autoFocus aria-label={t(renaming ? "conversation.name" : "conversation.projectName")} placeholder={t(renaming ? "conversation.name" : "conversation.projectName")} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={renaming?.session ? 120 : 80} />
      <div><button type="submit" disabled={busy || !title.trim()}>{t(renaming ? "conversation.save" : "conversation.create")}</button><button type="button" onClick={() => { setCreating(false); setRenaming(null); }}>{t("conversation.cancel")}</button></div>
    </form> : null}
    <div className="project-conversation-list" ref={listRef} onScroll={(event) => { if (currentProjectOnly) try { window.sessionStorage.setItem(scrollKey, String(event.currentTarget.scrollTop)); } catch { /* navigation remains usable */ } }}>
      {!runtime.projects.length && <p>{t("conversation.first")}</p>}
      {(currentProjectOnly ? runtime.projects.filter((project) => project.id === runtime.project?.id) : runtime.projects).map((project) => <section key={project.id} data-project-id={project.id}>
        <div className="project-conversation-heading" data-current={runtime.project?.id === project.id}>
          <button className="conversation-icon" type="button" aria-label={`${t("conversation.expand")} ${project.title}`} aria-expanded={expanded.includes(project.id)} onClick={() => setExpanded((items) => items.includes(project.id) ? items.filter((id) => id !== project.id) : [...items, project.id])}>{expanded.includes(project.id) ? <ChevronDown /> : <ChevronRight />}</button>
          <button className="conversation-label" type="button" title={project.title} aria-current={runtime.project?.id === project.id ? "true" : undefined} disabled={busy} onClick={() => void select(project.id, readSelectedConversation(project.id))}>{project.title}</button>
          <button className="conversation-icon row-action" type="button" disabled={busy} aria-label={`${t("conversation.rename")} ${project.title}`} onClick={() => { setCreating(false); setRenaming({ projectId: project.id, title: project.title }); setTitle(project.title); }}><Pencil /></button>
        </div>
        {expanded.includes(project.id) && <div className="project-conversation-items">
          {failed.includes(project.id) ? <p role="alert">{t("conversation.failed")}<button type="button" onClick={() => setRevision((n) => n + 1)}>{t("conversation.retry")}</button></p> : !sessions[project.id] ? <p role="status">{t("conversation.loading")}</p> : !sessions[project.id]!.length ? <p>{t("conversation.empty")}</p> : sessions[project.id]!.map((session, index) => {
            const label = session.title || session.visibleMessages.find((message) => message.actor === "author")?.visibleContent || `${t("conversation.chat")} ${index + 1}`;
            const runs = (history[project.id] ?? []).filter((run) => run.conversationId === session.id);
            return <div key={session.id} data-session-id={session.id}>
              <div className="conversation-row"><button className="conversation-label" type="button" title={label} disabled={busy} aria-current={runtime.project?.id === project.id && runtime.tianyiConversationId === session.id ? "page" : undefined} onClick={() => void select(project.id, session.id)}>{label}</button><button className="conversation-icon row-action" type="button" disabled={busy} aria-label={`${t("conversation.rename")} ${label}`} onClick={() => { setCreating(false); setRenaming({ projectId: project.id, title: label, session }); setTitle(label.slice(0,120)); }}><Pencil /></button></div>
              {runs.length > 0 && <details className="conversation-runs"><summary>{t("conversation.runs")} · {runs.length}</summary>{runs.map((run) => <button type="button" key={run.runId} disabled={busy} title={`${runLabel(run)} · ${run.runId}`} aria-current={activeRunId === run.runId ? "page" : undefined} onClick={() => void select(project.id, session.id, run.runId)}><span>{runLabel(run)}</span><small>{run.runId.slice(-6)}</small></button>)}</details>}
            </div>;
          })}
          {!currentProjectOnly ? <button className="conversation-secondary" type="button" disabled={busy} onClick={() => void createConversation(project.id)}>＋ {t("conversation.newChat")}</button> : null}
          {Boolean(history[project.id]?.length) && <details className="conversation-runs project-run-history"><summary>{t("conversation.history")}</summary>{history[project.id]!.map((run) => <button type="button" key={run.runId} disabled={busy} title={`${runLabel(run)} · ${run.runId}`} aria-current={activeRunId === run.runId ? "page" : undefined} onClick={() => void select(project.id, run.conversationId ?? null, run.runId)}><span>{runLabel(run)}</span><small>{run.runId.slice(-6)}</small></button>)}</details>}
        </div>}
      </section>)}
    </div>
    {error && <p role="alert">{error}</p>}
    {!currentProjectOnly ? <button className="conversation-directory" type="button" onClick={onDirectory}>{t("conversation.directory")}</button> : null}
  </aside>;
}
