import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";

export function TianyiEventLineCandidateTrajectory(props: {
  runtime: TianyanShellRuntimeState;
  onReturn(): void;
  onChanged(): void;
}) {
  return <section className="event-line-candidate-trajectory" aria-label="天意候选轨迹">
    <header><div><small>候选与可能性 · 区别于正式主故事脊</small><h2>天意候选正在事件线中审查</h2></div><button type="button" onClick={props.onReturn}>返回同一 Work lane</button></header>
    <div><span>当前正式故事</span><i aria-hidden="true" /><strong>候选变化</strong><i aria-hidden="true" /><span>采纳后的新版本</span></div>
    <label>作者调整（保留在 Work lane）<textarea value={props.runtime.workComposerDraft} onChange={(event) => props.runtime.setWorkComposerDraft(event.target.value)} rows={2} placeholder="补充需要纳入影响审查的调整……" /></label>
    <TianyiAdoptionPanel runtime={props.runtime} onChanged={props.onChanged} />
  </section>;
}
