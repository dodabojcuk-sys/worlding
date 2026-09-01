import { ArrowRight, Send, Sparkles } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";

import type { TianyiSessionMetadata } from "../../../lib/localTransport";

export function TianyiDialoguePanel(props: {
  projectReady: boolean;
  providerReady: boolean;
  session: TianyiSessionMetadata | null;
  draft: string;
  busy: boolean;
  error: string;
  agentTaskRetained: boolean;
  onDraft(value: string): void;
  onSubmit(): void;
  onOpenSettings(): void;
  onSwitchToAgent(): void;
}) {
  const executionIntent = /(?:推演|预测|执行|运行|生成候选路径)/u.test(props.draft);
  const submit = (event: FormEvent) => { event.preventDefault(); props.onSubmit(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    props.onSubmit();
  };
  return <section className="tianyi-dialogue-panel" aria-label="天意对话" data-dialogue-agent-controls="absent">
    {props.agentTaskRetained ? <section className="tianyi-dialogue-background-task" role="status"><strong>Agent 任务在后台保留</strong><p>当前对话不会操纵任务；切回 Agent 可查看原有进度。</p></section> : null}
    <section className="tianyi-sidebar-conversation" aria-label="普通消息流">
      {!props.projectReady ? <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>开始对话</strong><p>请先打开一个作品。</p></div>
        : !props.providerReady ? <div className="tianyi-sidebar-empty tianyi-provider-unavailable" data-provider-state="unconfigured"><Sparkles aria-hidden="true" /><strong>对话服务尚未连接</strong><p>连接模型服务后，可以解释当前选中内容并回答创作问题。</p><button type="button" onClick={props.onOpenSettings}>打开模型设置</button></div>
          : props.session?.visibleMessages.length ? props.session.visibleMessages.map((message) => <article key={message.eventId} className={`tianyi-sidebar-message is-${message.actor}`}><small>{message.actor === "author" ? "作者" : "天意"}</small><p>{message.visibleContent}</p></article>)
            : <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>普通对话</strong><p>询问故事、解释当前内容，或继续你的创作思考。</p><small>这里不会自动启动推演。</small></div>}
    </section>
    {props.error ? <p className="tianyi-error" role="alert">{props.error}</p> : null}
    {executionIntent ? <section className="tianyi-dialogue-agent-handoff" role="note"><strong>这项请求需要 Agent 执行</strong><p>切换后会保留当前对话草稿，不会自动运行。</p><button type="button" onClick={props.onSwitchToAgent}>转到 Agent 模式<ArrowRight aria-hidden="true" /></button></section> : null}
    <form className="tianyi-dialogue-composer" onSubmit={submit} data-agent-dispatch="forbidden">
      <label><span className="shell-visually-hidden">输入普通对话消息</span><textarea rows={3} value={props.draft} disabled={props.busy || !props.projectReady || !props.providerReady} placeholder="问问当前故事，Shift + Enter 换行" onKeyDown={keyDown} onChange={(event) => props.onDraft(event.target.value)} /></label>
      <button type="submit" aria-label="发送普通对话" title="发送普通对话" disabled={props.busy || !props.draft.trim() || !props.projectReady || !props.providerReady}><Send aria-hidden="true" /></button>
    </form>
  </section>;
}
