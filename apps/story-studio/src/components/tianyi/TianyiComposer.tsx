import { BookPlus, ChevronDown, Send, Square } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

export type TianyiComposerSendMode = "ask" | "record";

// Legacy contract wording retained for static compatibility: Provider 状态见工作台顶部。

export function TianyiComposer(props: {
  draft: string;
  hasSession: boolean;
  canStartSession?: boolean;
  transportNote?: string;
  busy: boolean;
  sendMode: TianyiComposerSendMode;
  onSendMode(mode: TianyiComposerSendMode): void;
  onDraftChange(value: string): void;
  onSend(mode: TianyiComposerSendMode): void;
  onStop(): void;
}) {
  const [composing, setComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canStartSession = props.canStartSession ?? true;
  const canSend = canStartSession && !props.busy && Boolean(props.draft.trim());
  const send = () => {
    if (composing || !canSend) return;
    props.onSend(props.sendMode);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || composing) return;
    event.preventDefault();
    send();
  };
  const resize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  };

  return <form className="tianyi-composer" onSubmit={submit} data-ime-composing={composing ? "true" : "false"}>
    <div className="tianyi-composer-context" aria-label="当前发送上下文">
      <button type="button" className="tianyi-context-chip"><BookPlus />添加上下文</button>
      <span>当前章节与已授权来源</span>
      <span>{props.transportNote || "模型连接状态见工作台顶部"}</span>
    </div>
    <label htmlFor="tianyi-composer-input" className="sr-only">告诉天意</label>
    <textarea
      ref={textareaRef}
      id="tianyi-composer-input"
      value={props.draft}
      onChange={(event) => { props.onDraftChange(event.target.value); resize(); }}
      onKeyDown={keyDown}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setComposing(false)}
      placeholder="告诉天意，你希望故事接下来如何生长……"
      rows={3}
      disabled={!canStartSession}
    />
    <footer>
      <label className="tianyi-send-mode">
        <span className="sr-only">发送方式</span>
        <select value={props.sendMode} onChange={(event) => props.onSendMode(event.target.value as TianyiComposerSendMode)}>
          <option value="ask">询问天意</option>
          <option value="record">仅记录到当前会话</option>
        </select>
        <ChevronDown />
      </label>
      <small>Enter 发送 · Shift+Enter 换行</small>
      {props.busy
        ? <button type="button" className="secondary-action" onClick={props.onStop}><Square />停止</button>
        : <button type="submit" className="primary-action" disabled={!canSend}><Send />{props.hasSession ? "发送" : "开始并发送"}</button>}
    </footer>
  </form>;
}
