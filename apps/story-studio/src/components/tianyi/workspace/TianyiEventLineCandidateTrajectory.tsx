import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";

export function TianyiEventLineCandidateTrajectory(props: {
  runtime: TianyanShellRuntimeState;
  onReturn(): void;
  onClose(): void;
  onChanged(): void;
}) {
  return <section className="event-line-candidate-trajectory" aria-label="天意候选轨迹">
    <header><div><small>候选审查 · 正式事件线仍可见</small><h2>候选将作为叠层进入当前故事</h2></div><nav><button type="button" onClick={props.onReturn}>返回创作工作区</button><button type="button" onClick={props.onClose}>关闭审查</button></nav></header>
    <div><span>当前正式故事</span><i aria-hidden="true" /><strong>候选变化</strong><i aria-hidden="true" /><span>采纳后的新版本</span></div>
    <p className="event-line-candidate-position"><strong>候选位置：待编排区。</strong>采纳后以同一 Event 身份进入下方事件线；叙事位置与世界时间仍由作者明确安排。</p>
    <label>作者调整（保留在当前工作区）<textarea value={props.runtime.workComposerDraft} onChange={(event) => props.runtime.setWorkComposerDraft(event.target.value)} rows={2} placeholder="补充需要纳入影响审查的调整……" /></label>
    <TianyiAdoptionPanel runtime={props.runtime} compact onChanged={props.onChanged} />
  </section>;
}
