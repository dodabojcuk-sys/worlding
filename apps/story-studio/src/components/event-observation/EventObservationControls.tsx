import { Clock3, Eye, GitBranch, Layers3, Network, Save, UsersRound } from "lucide-react";

import {
  eventObservationCombinationSupport,
  type EventObservationLayer,
  type EventObservationLayout,
  type EventObservationLens,
  type EventObservationScale,
  type EventObservationState,
  type ParticipationRenderMode
} from "../../../../../src/storyContracts/eventObservation.ts";

const LAYOUTS: Array<{ id: EventObservationLayout; label: string; icon: typeof Layers3 }> = [
  { id: "structure", label: "结构", icon: Layers3 },
  { id: "narrative", label: "叙事顺序", icon: GitBranch },
  { id: "world-time", label: "世界时间", icon: Clock3 },
  { id: "relation-network", label: "关系网络", icon: Network }
];

const LENSES: Array<{ id: EventObservationLens; label: string; icon: typeof Eye }> = [
  { id: "none", label: "事件总览", icon: Eye },
  { id: "participation", label: "参与", icon: UsersRound },
  { id: "character-perspective", label: "角色视角", icon: Eye },
  { id: "relationship-evolution", label: "关系演变", icon: Network }
];

export function EventObservationControls(props: {
  state: EventObservationState;
  characterCount: number;
  saveNotice: string | null;
  onLayout(layout: EventObservationLayout): void;
  onLens(lens: EventObservationLens): void;
  onScale(scale: EventObservationScale): void;
  onRenderMode(mode: ParticipationRenderMode): void;
  onLayer(layer: EventObservationLayer, enabled: boolean): void;
  onSave(): void;
}) {
  return <section className="event-observation-controls" aria-label="事件观察组合">
    <div className="event-observation-axis">
      <span>排列</span>
      <div role="group" aria-label="排列">
        {LAYOUTS.map(({ id, label, icon: Icon }) => {
          const support = eventObservationCombinationSupport(id, props.state.lens);
          const disabled = !support.supported;
          return <button key={id} type="button" aria-pressed={props.state.layout === id} disabled={disabled} title={disabled ? support.reason : `${label}只改变观察排列`} onClick={() => props.onLayout(id)}><Icon />{label}</button>;
        })}
      </div>
    </div>
    <div className="event-observation-axis">
      <span>观察</span>
      <div role="group" aria-label="观察">
        {LENSES.map(({ id, label, icon: Icon }) => {
          const disabled = id === "relationship-evolution" || (id === "character-perspective" && props.characterCount === 0);
          const reason = id === "relationship-evolution"
            ? "需要版本化关系状态序列，本轮尚未开放。"
            : id === "character-perspective" && props.characterCount === 0
              ? "当前项目没有可承担视角的正式人物。"
              : "";
          return <button key={id} type="button" aria-pressed={props.state.lens === id} disabled={disabled} title={reason || `${label}只改变观察问题`} onClick={() => props.onLens(id)}><Icon />{label}</button>;
        })}
      </div>
    </div>
    <div className="event-observation-options">
      <label><span>范围</span><select value={props.state.scale} onChange={(event) => props.onScale(event.target.value as EventObservationScale)}><option value="story">故事</option><option value="unit">单元</option><option value="event">事件</option></select></label>
      {props.state.lens === "participation" ? <div className="event-observation-render" role="group" aria-label="参与呈现方式"><span>呈现</span><button type="button" aria-pressed={props.state.renderMode === "trajectory"} onClick={() => props.onRenderMode("trajectory")}>轨迹</button><button type="button" aria-pressed={props.state.renderMode === "matrix"} onClick={() => props.onRenderMode("matrix")}>矩阵</button></div> : null}
      <label className="event-observation-layer"><input type="checkbox" checked={props.state.layers.includes("source-evidence")} onChange={(event) => props.onLayer("source-evidence", event.target.checked)} />来源证据</label>
      <button type="button" className="event-observation-save" title="只保存本机视图，不保存故事事实" onClick={props.onSave}><Save />保存组合</button>
      <span className="event-observation-save-notice" role="status">{props.saveNotice ?? ""}</span>
    </div>
  </section>;
}
