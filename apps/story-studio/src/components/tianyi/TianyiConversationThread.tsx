import { FileText, MessageCircle, Sparkles } from "lucide-react";

import type { TianyiVisibleMessage } from "../../lib/localTransport";

export function TianyiConversationThread(props: {
  messages: TianyiVisibleMessage[];
  streamingText: string;
  onOpenSource(trigger: HTMLButtonElement, receiptId: string): void;
}) {
  return <section className="tianyi-conversation-thread" aria-label="当前天意对话">
    <div className="tianyi-conversation-scroll">
      {props.messages.length === 0
        ? <div className="tianyi-conversation-loading"><Sparkles /><strong>这次对话还没有消息</strong></div>
        : <CollaborateThread messages={props.messages} streamingText={props.streamingText} onOpenSource={props.onOpenSource} />}
    </div>
  </section>;
}

function CollaborateThread(props: { messages: TianyiVisibleMessage[]; streamingText: string; onOpenSource(trigger: HTMLButtonElement, receiptId: string): void }) {
  return <div className="tianyi-thread-list is-collaborate">{[...props.messages].sort((left, right) => left.sequence - right.sequence).map((message) => message.actor === "author" ? <AuthorMessage key={message.eventId} message={message} onOpenSource={props.onOpenSource} /> : <article className="tianyi-thread-message is-tianyi" key={message.eventId}><MessageMeta label="天意整理建议" message={message} /><p>{message.visibleContent}</p><SourceLink message={message} onOpenSource={props.onOpenSource} /></article>)}{props.streamingText && <article className="tianyi-thread-message is-tianyi is-streaming" role="status" aria-live="polite"><div className="tianyi-thread-message-meta"><span>天意正在生成</span><span>基于当前来源</span></div><p>{props.streamingText}</p></article>}</div>;
}

function AuthorMessage(props: { message: TianyiVisibleMessage; onOpenSource(trigger: HTMLButtonElement, receiptId: string): void }) {
  return <article className="tianyi-thread-message is-author"><MessageMeta label="作者原话" message={props.message} /><p>{props.message.visibleContent}</p><SourceLink message={props.message} onOpenSource={props.onOpenSource} /></article>;
}

function SourceLink(props: { message: TianyiVisibleMessage; onOpenSource(trigger: HTMLButtonElement, receiptId: string): void }) {
  if (!props.message.receiptId) return null;
  return <button type="button" className="tianyi-thread-source-link" onClick={(event) => props.onOpenSource(event.currentTarget, props.message.receiptId!)}><FileText />查看引用来源</button>;
}

function MessageMeta(props: { label: string; message: TianyiVisibleMessage }) {
  return <div className="tianyi-thread-message-meta"><span>{props.label}</span><time>{formatTime(props.message.recordedAt)}</time></div>;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
