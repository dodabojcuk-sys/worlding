import { AlertTriangle, CheckCircle2, CircleHelp, Eye, MapPin, MinusCircle, Package, UserRound, UsersRound, X } from "lucide-react";
import { useMemo } from "react";

import {
  buildEventParticipationProjection,
  EVENT_OBSERVATION_MAX_FOCUS,
  EVENT_OBSERVATION_MAX_VISIBLE_EVENTS,
  type EventObservationScale,
  type ParticipationState
} from "../../../../../src/storyContracts/eventObservation.ts";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";
import type { EventLineEventSummary } from "../eventLineCommittedEvents";

const STATE_COPY: Record<ParticipationState, string> = {
  direct: "参与",
  witnessed: "见证",
  "explicit-absence": "明确缺席",
  unknown: "未知"
};

export function ParticipationObservation(props: {
  events: readonly EventLineEventSummary[];
  objects: readonly PerspectiveObjectRef[];
  focusObjectIds: readonly string[];
  layout: "narrative" | "world-time";
  scale: EventObservationScale;
  showSources: boolean;
  selectedEventId: string | null;
  onFocusObjectIds(ids: string[]): void;
  onSelectEvent(eventId: string): void;
}) {
  const objects = useMemo(() => props.objects.filter((object) => object.formal === true), [props.objects]);
  const projection = useMemo(() => buildEventParticipationProjection({
    events: props.events,
    objects,
    focusObjectIds: props.focusObjectIds,
    layout: props.layout
  }), [objects, props.events, props.focusObjectIds, props.layout]);
  const selected = new Set(projection.objects.map((object) => object.id));
  const visibleColumns = projection.columns.slice(0, EVENT_OBSERVATION_MAX_VISIBLE_EVENTS);
  const toggle = (objectId: string) => {
    const current = projection.objects.map((object) => object.id);
    props.onFocusObjectIds(current.includes(objectId) ? current.filter((id) => id !== objectId) : current.length < EVENT_OBSERVATION_MAX_FOCUS ? [...current, objectId] : current);
  };
  const gridTemplateColumns = `10.5rem repeat(${Math.max(1, visibleColumns.length)}, minmax(${props.scale === "story" ? "7.75rem" : props.scale === "event" ? "11.5rem" : "9.75rem"}, 1fr))`;
  return <section className={`event-participation-workspace is-${props.scale}`} aria-label="事件参与观察" data-testid="event-participation-workspace" data-layout={props.layout}>
    <aside className="event-participation-picker">
      <header><UsersRound /><div><strong>观察对象</strong><span>正式人物、地点或物品 · 最多 {EVENT_OBSERVATION_MAX_FOCUS} 个</span></div></header>
      {(["character", "location", "item"] as const).map((type) => <fieldset key={type}><legend>{objectTypeLabel(type)}</legend>{objects.filter((object) => object.type === type).map((object) => <label key={object.id}><input type="checkbox" checked={selected.has(object.id)} disabled={!selected.has(object.id) && selected.size >= EVENT_OBSERVATION_MAX_FOCUS} onChange={() => toggle(object.id)} />{object.label}</label>)}{objects.every((object) => object.type !== type) ? <small>暂无正式{objectTypeLabel(type)}对象</small> : null}</fieldset>)}
      <p>Event 标签只作为参与证据，不会自动创建对象或改写事实。</p>
    </aside>
    <div className="event-participation-canvas">
      <header>
        <div><small>当前组合 · {props.layout === "narrative" ? "叙事顺序" : "世界时间"} × 参与</small><h2>{projection.objects.length ? `${projection.objects.map((object) => object.label).join("、")} 的参与轨迹` : "选择对象，查看参与轨迹"}</h2></div>
        <span>{props.layout === "world-time" ? "只排序可验证日期；相对描述与未知时间独立保留" : "按作品揭示顺序排列；不代表事件实际发生先后"}</span>
      </header>
      {projection.objects.length ? <>
        <div className="event-participation-focus" aria-label="当前观察对象">{projection.objects.map((object) => <button key={object.id} type="button" onClick={() => toggle(object.id)} aria-label={`移除观察对象 ${object.label}`}>{objectIcon(object.type)}<span>{object.label}</span><X /></button>)}</div>
        {projection.columns.length > visibleColumns.length ? <p className="event-participation-limit" role="status">当前只呈现前 {visibleColumns.length} / {projection.columns.length} 个事件，避免大范围矩阵阻塞；请先按故事单元缩小观察范围。</p> : null}
        <div className="event-participation-scroll" tabIndex={0} aria-label={`${props.layout === "narrative" ? "叙事顺序" : "世界时间"}参与矩阵，可横向滚动`}>
          <div className="event-participation-matrix" style={{ gridTemplateColumns }}>
            <div className="event-participation-corner"><strong>参与者</strong><span>事件列</span></div>
            {visibleColumns.map((column, index) => <button key={column.event.id} type="button" className="event-participation-event" aria-current={props.selectedEventId === column.event.id ? "true" : undefined} onClick={() => props.onSelectEvent(column.event.id)}>
              <small>{column.unitLabel === "未归入故事单元" ? `事件 ${index + 1}` : column.unitLabel}</small>
              <strong>{column.event.title}</strong>
              {props.scale !== "story" ? <span>{props.layout === "world-time" ? column.time.label : `叙事序 ${column.narrativeIndex + 1}`}</span> : null}
              {props.layout === "world-time" && column.temporalGroup !== "ordered" ? <em>{column.temporalGroup === "unknown" ? "时间未定" : "时间仅有描述"}</em> : null}
            </button>)}
            {projection.objects.flatMap((object, objectIndex) => [
              <div className="event-participation-object" key={`object:${object.id}`}><span>{objectIcon(object.type)}</span><strong>{object.label}</strong><small>{objectTypeLabel(object.type)}</small></div>,
              ...visibleColumns.map((column) => {
                const cell = column.cells[objectIndex]!;
                return <button key={`${object.id}:${column.event.id}`} type="button" className={`event-participation-cell is-${cell.state} ${cell.conflict ? "has-conflict" : ""}`} data-participation-state={cell.state} data-event-id={column.event.id} aria-label={`${object.label}在“${column.event.title}”中的状态：${STATE_COPY[cell.state]}${cell.conflict ? "，证据冲突" : ""}`} aria-current={props.selectedEventId === column.event.id ? "true" : undefined} onClick={() => props.onSelectEvent(column.event.id)}>
                  {stateIcon(cell.state)}<strong>{STATE_COPY[cell.state]}</strong>
                  {cell.conflict ? <span className="event-participation-conflict"><AlertTriangle />证据冲突</span> : null}
                  {props.showSources && props.scale === "event" ? <small>{cell.evidenceRefs.length ? `${cell.evidenceRefs.length} 个来源引用` : "无明确参与证据"}</small> : null}
                </button>;
              })
            ])}
          </div>
        </div>
        <footer><span><CheckCircle2 />参与</span><span><Eye />见证</span><span><MinusCircle />明确缺席</span><span><CircleHelp />未知不是缺席</span>{props.showSources ? <strong>点击任一格，在既有详情中核对 Event 来源</strong> : null}</footer>
      </> : <div className="event-participation-empty"><UsersRound /><strong>{objects.length ? "先选择一个观察对象" : "当前没有可用的正式对象"}</strong><p>{objects.length ? "对象选择只改变本机视图；不会运行 AI，也不会写入 Event。" : "请先在世界资料中建立人物、地点或物品。Event 标签不会自动变成正式对象。"}</p></div>}
    </div>
  </section>;
}

function objectTypeLabel(type: PerspectiveObjectRef["type"]): string { return type === "character" ? "人物" : type === "location" ? "地点" : "物品"; }
function objectIcon(type: PerspectiveObjectRef["type"]) { return type === "character" ? <UserRound /> : type === "location" ? <MapPin /> : <Package />; }
function stateIcon(state: ParticipationState) { return state === "direct" ? <CheckCircle2 /> : state === "witnessed" ? <Eye /> : state === "explicit-absence" ? <MinusCircle /> : <CircleHelp />; }
