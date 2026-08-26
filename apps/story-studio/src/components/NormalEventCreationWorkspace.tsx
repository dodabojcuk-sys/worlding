import { CheckCircle2, ChevronRight, FilePlus2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { NormalEventCreationState } from "../lib/localTransport";

type Action = "create-story-unit" | "create-candidate" | "begin-impact" | "reject" | "confirm";

/** Ordinary author route; it deliberately does not know about Fixtures or Nuwa. */
export function NormalEventCreationWorkspace(props: {
  projectId: string;
  load(input?: { storyUnitId?: string; planningEventId?: string }): Promise<NormalEventCreationState>;
  operate(action: Action, input?: { storyUnitId?: string; planningEventId?: string; title?: string; summary?: string; body?: string }): Promise<{ state: NormalEventCreationState }>;
  onOpenCreation(input: { storyUnitId: string; eventId: string }): void;
}) {
  const [state, setState] = useState<NormalEventCreationState | null>(null);
  const [title, setTitle] = useState("雨夜的守夜记录");
  const [body, setBody] = useState("沈砚决定保留旧名线索，并在天亮前核对守夜记录。作者希望这成为当前主线的明确转折。 ");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try { setError(""); setState(await props.load()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  useEffect(() => { void load(); }, [props.projectId]);

  const operate = async (action: Action, input = {}) => {
    if (busy) return;
    setBusy(true); setError("");
    try { setState((await props.operate(action, input)).state); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  if (!state) return <main className="creation-source-workspace" data-testid="normal-event-creation-loading"><p>正在读取当前作品的事件线…</p>{error && <p role="alert">{error}</p>}</main>;
  const unit = state.storyUnits.find((item) => item.id === state.selectedStoryUnitId) || state.storyUnits[0] || null;
  const confirmed = state.confirmedEvents[0] || null;

  return <main className="creation-source-workspace normal-event-creation" data-testid="normal-event-creation-workspace">
    <header className="creation-source-header">
      <div><p className="eyebrow">事件线 · 当前作品</p><h1>确认一个故事事件</h1><p>{state.project.title}。作者输入先成为候选；只有通过影响评审和明确确认，才会写入一条事件。</p></div>
      <span className="creation-source-boundary"><ShieldCheck size={16} />不会自动修改人物、世界状态或正文</span>
    </header>

    {error && <p role="alert" className="creation-source-error">{error}</p>}
    {!unit ? <section className="creation-source-empty"><FilePlus2 size={24} /><h2>先建立故事范围</h2><p>事件需要属于一个故事单元，之后创作会沿用同一范围。</p><button type="button" className="primary-action" disabled={busy} onClick={() => void operate("create-story-unit")}>建立最小故事单元</button></section> : !state.planning ? <section className="creation-source-panel"><p className="eyebrow">当前故事单元 · {unit.title}</p><h2>写下事件候选</h2><label>事件标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>作者输入<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} /></label><p className="creation-source-note">这一步不会写入故事事实。接下来会展示候选与影响范围。</p><button type="button" className="primary-action" disabled={busy} onClick={() => void operate("create-candidate", { storyUnitId: unit.id, title, body })}>进入候选评审 <ChevronRight size={16} /></button></section> : !state.impact ? <section className="creation-source-panel"><p className="eyebrow">候选评审</p><h2>{state.planning.title}</h2><p>{state.candidate?.candidates[0]?.summary || state.planning.body}</p><p className="creation-source-note">候选尚未改变故事事实。拒绝会保持正式 Event 写入为 0。</p><div className="creation-source-actions"><button type="button" disabled={busy} onClick={() => void operate("reject", { planningEventId: state.planning?.id })}>拒绝此候选</button><button type="button" className="primary-action" disabled={busy} onClick={() => void operate("begin-impact", { planningEventId: state.planning?.id })}>查看影响评审 <ChevronRight size={16} /></button></div></section> : !confirmed ? <section className="creation-source-panel"><p className="eyebrow">影响评审</p><h2>作者确认前的影响范围</h2><p>{state.impact.impact?.evidenceCoverage || "系统只展示可能改变、不会改变和仍未知的内容；确认不会自动写回正文或世界状态。"}</p><ul><li>会改变：新增一条作者确认的 Event</li><li>不会改变：Canon、人物、世界状态、关系、正文</li><li>仍未知：事件后续影响仍由作者继续决定</li></ul><button type="button" className="primary-action" disabled={busy} onClick={() => void operate("confirm", { planningEventId: state.planning?.id })}>确认并写入事件</button></section> : <section className="creation-source-panel"><CheckCircle2 size={24} /><p className="eyebrow">已确认事件</p><h2>{confirmed.title}</h2><p>事件已由既有 AuthorControl 写入，并仍属于当前作品与故事单元。重复确认不会新增第二条事件。</p><button type="button" className="primary-action" onClick={() => props.onOpenCreation({ storyUnitId: unit.id, eventId: confirmed.id })}>带着此事件进入创作 <ChevronRight size={16} /></button></section>}
  </main>;
}
