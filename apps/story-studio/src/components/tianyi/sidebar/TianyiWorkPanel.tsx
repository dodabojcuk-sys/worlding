import { ArrowRight, Send, Sparkles } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";

import type { TianyiSessionMetadata } from "../../../lib/localTransport";

export function TianyiWorkPanel(props: {
  projectReady: boolean;
  providerReady: boolean;
  session: TianyiSessionMetadata | null;
  draft: string;
  busy: boolean;
  error: string;
  pageAgentRunRetained: boolean;
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
  return <section className="tianyi-dialogue-panel" aria-label="天意工作泳道" data-work-lane="shared" data-page-agent-dispatch="forbidden">
    {props.pageAgentRunRetained ? <section className="tianyi-dialogue-background-task" role="status"><strong>页面 Agent Run 在后台保留</strong><p>Work lane 不操纵该 Run；切回 Agent 可查看页面范围内的进度。</p></section> : null}
    <section className="tianyi-sidebar-conversation" aria-label="同一 Work lane 的可见历史">
      {!props.projectReady ? <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>开始工作</strong><p>请先打开一个作品。</p></div>
        : props.session?.visibleMessages.length ? props.session.visibleMessages.map((message) => <article key={message.eventId} className={`tianyi-sidebar-message is-${message.actor}`}><small>{message.actor === "author" ? "作者" : "天意"}</small><p>{message.visibleContent}</p></article>)
          : <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>工作模式</strong><p>这里接入天意大页面的同一个 Work lane。</p><small>页面 Agent 只生成可挂入此泳道的结构化候选。</small></div>}
    </section>
    {props.error ? <p className="tianyi-error" role="alert">{props.error}</p> : null}
    {executionIntent ? <section className="tianyi-dialogue-agent-handoff" role="note"><strong>这项请求需要页面 Agent 执行</strong><p>切换后会保留 Work 草稿，不会自动运行。</p><button type="button" onClick={props.onSwitchToAgent}>转到 Agent<ArrowRight aria-hidden="true" /></button></section> : null}
    <form className="tianyi-dialogue-composer" onSubmit={submit} data-agent-dispatch="forbidden">
      <label><span className="shell-visually-hidden">输入 Work lane 消息</span><textarea rows={3} value={props.draft} disabled={props.busy || !props.projectReady || !props.providerReady} placeholder="继续同一项工作，Shift + Enter 换行" onKeyDown={keyDown} onChange={(event) => props.onDraft(event.target.value)} /></label>
      <button type="submit" aria-label="发送到 Work lane" title="发送到 Work lane" disabled={props.busy || !props.draft.trim() || !props.projectReady || !props.providerReady}><Send aria-hidden="true" /></button>
    </form>
    {!props.providerReady && props.projectReady ? <div className="tianyi-provider-unavailable" data-provider-state="unconfigured"><strong>模型服务尚未连接</strong><p>候选与已保存上下文仍可查看；发送新的模型消息需要先配置 Provider。</p><button type="button" onClick={props.onOpenSettings}>打开模型设置</button></div> : null}
  </section>;
}
