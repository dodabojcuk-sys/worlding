import { ArrowLeft, BookOpen, Clock3, MessageCirclePlus, Sparkles } from "lucide-react";

import type { TianyiSessionMetadata } from "../../lib/localTransport";

/** Kept as a shared structural type for the existing review leaf.  The Tianyi
 * page no longer renders an Agent surface or navigates to that review. */
export type TianyiManagedAgent = {
  id: string;
  title: string;
  status: string;
  revisionToken: string;
  contextLinked: boolean;
};

export type TianyiConversationRailProps = {
  currentSession: TianyiSessionMetadata | null;
  recentSessions: TianyiSessionMetadata[];
  projectTitle: string;
  sceneLabel: string;
  briefState: "idle" | "draft" | "approved" | "returned";
  busy?: boolean;
  onCreateSession?(): void;
  onSelectSession?(sessionId: string): void;
  onReturnProject(): void;
};

/**
 * Props-only leaf for the future Tianyi session rail. The App remains the
 * owner of session discovery and persistence; this component only renders a
 * supplied view model.
 */
export function TianyiConversationRail(props: TianyiConversationRailProps) {
  const recent = props.recentSessions.filter((session) => session.id !== props.currentSession?.id).slice(0, 4);
  return <div className="tianyi-conversation-rail-content" aria-label="天意会话">
    <header>
      <span><Sparkles />天意</span>
      <button type="button" className="icon-action" onClick={props.onCreateSession} disabled={!props.onCreateSession || props.busy} aria-label="新建天意会话" title="新建天意会话"><MessageCirclePlus /></button>
    </header>
    <div className="tianyi-session-sidebar-scene"><BookOpen /><span><small>当前来源</small><strong>{props.sceneLabel || "尚未选择场景"}</strong></span></div>
    <div id="tianyi-sidebar-sessions" role="region" aria-label="会话">
      <section aria-label="当前会话">
        <small>当前会话</small>
        {props.currentSession ? <div className="tianyi-session-sidebar-current" aria-current="page"><span><Sparkles />正在记录</span><strong>{visibleMessageCount(props.currentSession)} 条可见内容</strong><em>{briefLabel(props.briefState)}</em></div> : <p>开始后，记录与协作会共用同一条历史。</p>}
      </section>
      {recent.length > 0 && <section aria-label="最近会话">
        <small>最近会话</small>
        <ul>{recent.map((session, index) => <li key={session.id}><button type="button" onClick={() => props.onSelectSession?.(session.id)} disabled={!props.onSelectSession || props.busy}><Clock3 /><span>最近对话 {index + 1}</span><em>{visibleMessageCount(session)} 条可见内容</em></button></li>)}</ul>
      </section>}
    </div>
    <section className="tianyi-conversation-rail-task"><small>当前任务 / 执行简报</small><strong>{briefLabel(props.briefState)}</strong><span>未决问题会留在当前会话，未经审核不会写入故事。</span></section>
    <footer><button type="button" className="tianyi-session-sidebar-return" onClick={props.onReturnProject}><ArrowLeft /><span><small>返回当前作品</small><strong>{props.projectTitle}</strong></span></button></footer>
  </div>;
}

export function visibleMessageCount(session: TianyiSessionMetadata): number {
  return session.visibleMessages.length;
}

function briefLabel(state: TianyiConversationRailProps["briefState"]): string {
  return ({ idle: "待整理", draft: "待检查", approved: "执行简报已批准", returned: "女娲已返回" })[state];
}
