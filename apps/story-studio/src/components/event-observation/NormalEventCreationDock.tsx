import { useState } from "react";
import { CheckCircle2, GitBranch, RefreshCw, ShieldCheck } from "lucide-react";

import { type NormalEventCreationState } from "../../lib/localTransport";

export type NormalCreationAction = "create-story-unit" | "create-candidate" | "begin-impact" | "reject" | "confirm";

/**
 * 作者确认链的普通事件线界面：候选 → 影响评审 → 作者确认。
 * 每一步都是作者的一次显式点击；本组件不拥有故事事实，
 * 只编排既有 Normal Event Creation Port 的既有操作。
 */
export function NormalEventCreationDock(props: {
  projectId: string | null;
  fallbackUnits: ReadonlyArray<{ id: string; title: string }>;
  onChanged(): void;
  runAction(input: { action: NormalCreationAction; storyUnitId?: string; planningEventId?: string; title?: string; body?: string }): Promise<{ state: NormalEventCreationState | null; confirmedApplied: boolean }>;
}) {
  const [state, setState] = useState<NormalEventCreationState | null>(null);
  const [unitId, setUnitId] = useState<string>("");
  const [newUnitTitle, setNewUnitTitle] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const units: Array<{ id: string; title: string }> = state?.storyUnits?.length ? state.storyUnits.map((unit) => ({ id: unit.id, title: unit.title })) : (state ? [] : props.fallbackUnits.map((unit) => ({ id: unit.id, title: unit.title })));
  const effectiveUnitId = unitId || state?.selectedStoryUnitId || (units[0]?.id ?? "");

  const run = async (input: { action: NormalCreationAction; storyUnitId?: string; planningEventId?: string; title?: string; body?: string }, successMessage: string) => {
    if (!props.projectId) {
      setError("请先打开一个作品，再使用常规创作。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { state: next, confirmedApplied } = await props.runAction({ ...input, storyUnitId: input.storyUnitId ?? (effectiveUnitId || undefined) });
      setState(next);
      setMessage(input.action === "confirm" && !confirmedApplied
        ? "该候选此前已确认过；本次未重复写入正式事件。"
        : successMessage);
      props.onChanged();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "常规创作操作没有完成；现有内容未被改写。");
    } finally {
      setBusy(false);
    }
  };

  return <div className="event-line-dock-stack" data-testid="normal-creation-dock">
    <section><small>常规创作</small><h2>作者确认链</h2><p>候选 → 影响评审 → 作者确认写入正式事件，并自动归属到所选故事单元。每一步都需要作者显式点击。</p></section>
    <section>
      <small>故事单元</small>
      <select value={effectiveUnitId} disabled={busy} onChange={(event) => setUnitId(event.target.value)}>
        {units.length === 0 && <option value="">还没有故事单元</option>}
        {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}
      </select>
      <form className="normal-creation-unit-row" onSubmit={(event) => {
        event.preventDefault();
        const value = newUnitTitle.trim();
        if (!value || busy) return;
        void run({ action: "create-story-unit", title: value, storyUnitId: undefined }, `已建立故事单元“${value}”（可直接使用）。`);
        setNewUnitTitle("");
      }}>
        <input value={newUnitTitle} maxLength={80} placeholder="新建故事单元，例如：第一幕" aria-label="新建单元名称" disabled={busy} onChange={(event) => setNewUnitTitle(event.target.value)} />
        <button type="submit" disabled={busy || !newUnitTitle.trim()}>新建单元</button>
      </form>
    </section>
    <section>
      <small>第一步 · 事件候选</small>
      <input value={title} maxLength={80} placeholder="事件标题" aria-label="常规创作事件标题" disabled={busy} onChange={(event) => setTitle(event.target.value)} />
      <textarea value={body} rows={4} placeholder="发生了什么（作者输入）" aria-label="常规创作事件正文" disabled={busy} onChange={(event) => setBody(event.target.value)} />
      <button type="button" disabled={busy || !title.trim() || !body.trim() || !effectiveUnitId} onClick={() => void run({ action: "create-candidate", title: title.trim(), body: body.trim() }, "事件候选已建立；请继续影响评审。")}>
        <GitBranch />建立事件候选
      </button>
    </section>
    {state?.planning ? <section>
      <small>第二步 · 影响评审</small>
      <p><strong>{state.planning.title}</strong></p>
      {state.impact ? <p><ShieldCheck /> 影响评审已就绪（{state.impact.status === "selected" ? "作者已选择写入路线" : "待选择路线"}）。</p> : <button type="button" disabled={busy} onClick={() => void run({ action: "begin-impact", planningEventId: state.planning!.id }, "影响评审已开始；请核对后确认写入。")}>
        <ShieldCheck />开始影响评审
      </button>}
    </section> : null}
    {state?.planning && state.impact ? <section>
      <small>第三步 · 作者确认</small>
      <p>确认后该事件成为正式事实，并归属到所选故事单元。</p>
      <button type="button" className="primary-action" disabled={busy} onClick={() => void run({ action: "confirm", planningEventId: state.planning!.id }, "已由作者确认并写入正式事件；单元归属已更新。")}>
        <CheckCircle2 />{busy ? <RefreshCw /> : null}确认写入正式事件
      </button>
    </section> : null}
    {state?.confirmedEvents.length ? <section>
      <small>已确认的正式事件</small>
      <ul>{state.confirmedEvents.map((event: { id: string; title: string }) => <li key={event.id}><CheckCircle2 />{event.title}</li>)}</ul>
    </section> : null}
    {message && <p role="status">{message}</p>}
    {error && <p className="is-error" role="alert">{error}</p>}
  </div>;
}
