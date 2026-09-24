import { useEffect, useRef, useState, type ReactNode } from "react";
import { getTianyiSessionMetadata, type TianyiSessionMetadata } from "../../lib/localTransport";
import { MobileTianyiChat } from "./MobileTianyiChat";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import type { StoryStudioShellDestinationId } from "../navigation/topLevelDestinationRegistry";

const DESTINATIONS: Array<[StoryStudioShellDestinationId, string]> = [
  ["world", "世界"], ["event-line", "事件线"], ["nuwa", "女娲"],
  ["library", "资料"], ["writing", "创作中心"], ["multiverse", "多元功能中心"], ["data", "数据"]
];

/** Port of the supplied phone prototype's top bar, project tree and chat viewport. */
export function MobileStoryStudioShell(props: {
  runtime: TianyanShellRuntimeState;
  activeId: StoryStudioShellDestinationId;
  settingsOpen: boolean;
  accountOpen: boolean;
  content: ReactNode;
  workContent: ReactNode;
  onNavigate(id: StoryStudioShellDestinationId): void;
  onSettings(): void;
  onAccount(): void;
  onSummon(): void;
  assistant: ReactNode;
}) {
  const { runtime } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<TianyiSessionMetadata[]>([]);
  const [sessionsError, setSessionsError] = useState("");
  const [chatExpanded, setChatExpanded] = useState(true);
  const [workOpen, setWorkOpen] = useState(() => new URLSearchParams(window.location.search).get("tianyiLane") === "work");
  const [routeRevision, setRouteRevision] = useState(0);
  const mobileRoot = useRef<HTMLDivElement>(null);
  const chatRoute = !props.settingsOpen && !props.accountOpen && (props.activeId === "tianyi" || window.location.pathname === "/");
  const eventLocation = new URLSearchParams(window.location.search);
  const eventDepth = eventLocation.has("node") ? 3 : eventLocation.has("unit") ? 2 : eventLocation.has("line") ? 1 : 0;
  const settingsDetail = props.settingsOpen ? window.location.pathname.split("/")[2] : null;
  const settingsTitles: Record<string, string> = { appearance: "外观与语言", storage: "存储与备份", transfer: "导入与导出", "agent-provider": "API / Provider", "agent-permissions": "默认权限" };
  const title = props.settingsOpen ? settingsTitles[settingsDetail ?? ""] ?? "设置" : props.accountOpen ? "个人中心" : workOpen && chatRoute ? "天意工作面" : chatRoute ? "天衍" : props.activeId === "event-line" && eventDepth ? eventDepth === 3 ? "节点详情" : eventDepth === 2 ? "节点" : "单元" : DESTINATIONS.find(([id]) => id === props.activeId)?.[1] ?? "天衍";

  useEffect(() => {
    if (!drawerOpen || !runtime.project) return;
    let active = true;
    setSessionsError("");
    void runtime.withConnection((token) => getTianyiSessionMetadata(runtime.project!.id, null, token)).then((read) => {
      if (active) setSessions(Array.isArray(read) ? read : read ? [read] : []);
    }).catch((cause) => { if (active) setSessionsError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [drawerOpen, runtime.project?.id, runtime.tianyiConversationId]);
  useEffect(() => {
    const update = () => { setRouteRevision((value) => value + 1); setWorkOpen(new URLSearchParams(window.location.search).get("tianyiLane") === "work"); };
    window.addEventListener("popstate", update);
    window.addEventListener("tianyan-mobile-route-change", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("tianyan-mobile-route-change", update); };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      if (!mobileRoot.current) return;
      mobileRoot.current.style.setProperty("--mobile-visual-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setDrawerOpen(false); setWorkOpen(false); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    const openStructure = () => props.onNavigate("event-line");
    window.addEventListener("tianyan-nuwa-open-structure", openStructure);
    return () => window.removeEventListener("tianyan-nuwa-open-structure", openStructure);
  }, [props.onNavigate]);
  void routeRevision;

  const go = (id: StoryStudioShellDestinationId) => { setDrawerOpen(false); setWorkOpen(false); props.onNavigate(id); };
  const openSession = (id: string | null) => { runtime.setTianyiConversationId(id); go("tianyi"); };
  const back = () => {
    if (workOpen) { window.history.back(); return; }
    if (props.settingsOpen || props.accountOpen) { window.history.back(); return; }
    if (props.activeId === "event-line" && eventDepth) { window.history.back(); return; }
    setDrawerOpen(true);
  };
  const inBook = runtime.project?.title ?? "选择作品";
  const filteredSessions = sessions.filter((item) => (item.title || item.visibleMessages.find((message) => message.actor === "author")?.visibleContent || item.id).toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return <div ref={mobileRoot} className="tianyan-mobile" data-testid="tianyan-mobile-template" data-route={props.activeId}>
    <header className="mobile-topbar"><button type="button" className="mobile-topbar-side" onClick={props.activeId === "event-line" && eventDepth || workOpen || props.settingsOpen || props.accountOpen ? back : () => setDrawerOpen(true)}>{props.activeId === "event-line" && eventDepth || workOpen || props.settingsOpen || props.accountOpen ? "‹ 返回" : "☰ 功能中心"}</button><div className="mobile-topbar-title">{title}</div>{props.settingsOpen || props.accountOpen ? <span className="mobile-topbar-side mobile-topbar-right" /> : <button type="button" className="mobile-topbar-side mobile-topbar-right" onClick={chatRoute ? () => go("writing") : props.activeId === "nuwa" ? () => { window.history.pushState({}, "", "/nuwa?nuwaView=manage"); window.dispatchEvent(new PopStateEvent("popstate")); } : props.onSummon}>{chatRoute ? "✎ 创作中心" : props.activeId === "nuwa" ? "记录查询" : "✧ AI 对话"}</button>}</header>
    <main className="mobile-viewport">{chatRoute ? workOpen ? props.workContent : <MobileTianyiChat runtime={runtime} onDirectory={() => setDrawerOpen(true)} onWork={() => { const next = new URL(window.location.href); next.pathname = "/tianyi"; next.searchParams.set("tianyiLane", "work"); window.history.pushState({}, "", `${next.pathname}${next.search}`); setWorkOpen(true); }} /> : props.content}</main>
    {drawerOpen ? <><button type="button" className="mobile-drawer-backdrop" aria-label="关闭功能中心" onClick={() => setDrawerOpen(false)} /><aside className="mobile-drawer" role="dialog" aria-label="功能中心"><div className="mobile-drawer-head"><div><strong>天衍</strong><small>与 AI 共赴更大的故事</small></div><button type="button" aria-label="关闭功能中心" onClick={() => setDrawerOpen(false)}>×</button></div><label className="mobile-drawer-search"><span>⌕</span><input type="search" aria-label="搜索书籍、对话或资料" placeholder="搜索书籍、对话或资料" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="新建天意对话" onClick={() => openSession(null)}>＋</button></label><div className="mobile-drawer-scroll"><button type="button" className="mobile-book" onClick={() => setChatExpanded((open) => !open)}><span className="mobile-book-cover">{inBook[0]}</span><span><b>{inBook}</b><small>当前作品 · 同一项目身份</small></span><span>{chatExpanded ? "⌄" : "›"}</span></button>{chatExpanded ? <div className="mobile-drawer-tree"><button type="button" className="mobile-tree-heading" onClick={() => go("tianyi")}>天意 <span>对话</span></button><button type="button" className="mobile-tree-new" onClick={() => openSession(null)}>＋ 新建对话</button>{sessionsError ? <p role="alert">{sessionsError}</p> : filteredSessions.map((item) => <button type="button" className="mobile-tree-session" key={item.id} onClick={() => openSession(item.id)} aria-current={item.id === runtime.tianyiConversationId ? "page" : undefined}><span>{item.title || item.visibleMessages.find((message) => message.actor === "author")?.visibleContent.slice(0, 18) || "未命名对话"}</span><small>{item.scope?.kind === "event-line" ? "事件线" : item.scope?.kind === "project" ? "项目" : "待选范围"}</small></button>)}</div> : null}{runtime.projects.filter((book) => book.id !== runtime.project?.id && (!query || book.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))).map((book) => <button type="button" key={book.id} className="mobile-book mobile-book-other" onClick={() => { setDrawerOpen(false); setWorkOpen(false); void runtime.openProject(book.id).then(() => props.onNavigate("tianyi")); }}><span className="mobile-book-cover">{book.title[0]}</span><span><b>{book.title}</b><small>切换作品</small></span><span>›</span></button>)}<div className="mobile-drawer-destinations">{DESTINATIONS.filter(([id, label]) => !query || label.includes(query)).map(([id, label]) => <button type="button" key={id} className="mobile-tree-heading" onClick={() => go(id)}>{label}</button>)}</div></div><div className="mobile-drawer-foot"><button type="button" onClick={() => { setDrawerOpen(false); props.onSettings(); }}>设置</button><button type="button" onClick={() => { setDrawerOpen(false); props.onAccount(); }}>个人中心</button></div></aside></> : null}
    {props.assistant}
  </div>;
}
