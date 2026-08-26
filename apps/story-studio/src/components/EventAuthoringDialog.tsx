import { Check, FilePlus2, Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AuthorChangeSet } from "../lib/localTransport";

export type EventAuthoringDraft = {
  title: string;
  narrative: string;
  participants: string;
  place: string;
  timing: string;
};

const emptyDraft: EventAuthoringDraft = { title: "", narrative: "", participants: "", place: "", timing: "" };

export function EventAuthoringDialog(props: {
  confirmation: AuthorChangeSet | null;
  busy: boolean;
  error: string;
  onSavePossibility(draft: EventAuthoringDraft): void;
  onPrepareConfirmation(draft: EventAuthoringDraft): void;
  onConfirm(): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<EventAuthoringDraft>(emptyDraft);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  if (props.confirmation) return <div className="event-authoring-backdrop" role="presentation">
    <section className="event-authoring-dialog" role="dialog" aria-modal="true" aria-labelledby="event-confirmation-title">
      <header><div><small>影响范围</small><h2 id="event-confirmation-title">确认加入事件线</h2></div><button type="button" className="icon-action" aria-label="关闭事件确认" onClick={props.onClose}><X /></button></header>
      <p>这一步会把作者确认的变化交给现有变更链。正文与既有人物资料不会被自动改写。</p>
      <dl className="event-authoring-summary"><div><dt>将记录</dt><dd>{props.confirmation.changes.length} 项事件变化</dd></div><div><dt>影响资料</dt><dd>{props.confirmation.affectedNoteIds.length ? `${props.confirmation.affectedNoteIds.length} 项` : "未发现额外资料"}</dd></div></dl>
      {props.confirmation.before.length || props.confirmation.change.length ? <section className="event-authoring-diff"><strong>变更摘要</strong>{props.confirmation.before.slice(0, 2).map((item) => <p key={`before-${item}`}>此前：{item}</p>)}{props.confirmation.change.slice(0, 3).map((item) => <p key={`change-${item}`}>将要记录：{item}</p>)}</section> : null}
      {props.error ? <p className="event-authoring-error" role="alert">{props.error}</p> : null}
      <footer><button type="button" className="secondary-action" disabled={props.busy} onClick={props.onClose}>返回编辑</button><button type="button" className="primary-action" disabled={props.busy} onClick={props.onConfirm}><Check />{props.busy ? "正在确认…" : "最终确认并加入事件线"}</button></footer>
    </section>
  </div>;

  const update = <K extends keyof EventAuthoringDraft>(key: K, value: EventAuthoringDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const valid = draft.narrative.trim().length > 0 || draft.title.trim().length > 0;
  return <div className="event-authoring-backdrop" role="presentation">
    <section className="event-authoring-dialog" role="dialog" aria-modal="true" aria-labelledby="event-authoring-title">
      <header><div><small>事件线</small><h2 id="event-authoring-title">新建事件</h2></div><button type="button" className="icon-action" aria-label="关闭新建事件" onClick={props.onClose}><X /></button></header>
      <label className="event-authoring-narrative"><span>发生了什么？</span><textarea value={draft.narrative} onChange={(event) => update("narrative", event.target.value)} placeholder="直接写下发生的事、冲突或转折。" rows={6} /></label>
      <details className="event-authoring-details"><summary>补充信息（可选）</summary><div><label><span>标题</span><input ref={titleRef} value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="例如：钟响后的发现" /></label><label><span>参与人物</span><input value={draft.participants} onChange={(event) => update("participants", event.target.value)} placeholder="用顿号分隔" /></label><label><span>地点</span><input value={draft.place} onChange={(event) => update("place", event.target.value)} /></label><label><span>时间或相对顺序</span><input value={draft.timing} onChange={(event) => update("timing", event.target.value)} placeholder="例如：午夜之后" /></label></div></details>
      <p className="event-authoring-note">“故事可能”不会进入已确认事件；确认加入前会先展示影响摘要。</p>
      {props.error ? <p className="event-authoring-error" role="alert">{props.error}</p> : null}
      <footer><button type="button" className="secondary-action" disabled={!valid || props.busy} onClick={() => props.onSavePossibility(draft)}><Save />保存为故事可能</button><button type="button" className="primary-action" disabled={!valid || props.busy} onClick={() => props.onPrepareConfirmation(draft)}><FilePlus2 />{props.busy ? "正在准备…" : "确认并加入事件线"}</button></footer>
    </section>
  </div>;
}
