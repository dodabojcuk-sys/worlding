import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Eye, MapPin, MinusCircle, Package, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  buildEventParticipationProjection,
  EVENT_OBSERVATION_MAX_FOCUS,
  EVENT_OBSERVATION_MAX_VISIBLE_EVENTS,
  type EventObservationScale,
  type ParticipationRenderMode,
  type ParticipationState
} from "../../../../../src/storyContracts/eventObservation.ts";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";
import type { EventLineEventSummary } from "../eventLineCommittedEvents";

const STATE_COPY: Record<ParticipationState, string> = { direct: "参与", witnessed: "见证", "explicit-absence": "明确缺席", unknown: "未知" };

export function ParticipationObservation(props: {
  events: readonly EventLineEventSummary[];
  objects: readonly PerspectiveObjectRef[];
  focusObjectIds: readonly string[];
  layout: "narrative" | "world-time";
  scale: EventObservationScale;
  renderMode: ParticipationRenderMode;
  showSources: boolean;
  selectedEventId: string | null;
  detailsOpen: boolean;
  onFocusObjectIds(ids: string[]): void;
  onSelectEvent(eventId: string): void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const objects = useMemo(() => props.objects.filter((object) => object.formal === true), [props.objects]);
  const projection = useMemo(() => buildEventParticipationProjection({ events: props.events, objects, focusObjectIds: props.focusObjectIds, layout: props.layout }), [objects, props.events, props.focusObjectIds, props.layout]);
  const selected = new Set(projection.objects.map((object) => object.id));
  const visibleColumns = projection.columns.slice(0, EVENT_OBSERVATION_MAX_VISIBLE_EVENTS);
  const isTrajectory = props.renderMode === "trajectory";
  useEffect(() => { if (props.detailsOpen) setPickerOpen(false); }, [props.detailsOpen]);
  const toggle = (objectId: string) => {
    const current = projection.objects.map((object) => object.id);
    props.onFocusObjectIds(current.includes(objectId) ? current.filter((id) => id !== objectId) : current.length < EVENT_OBSERVATION_MAX_FOCUS ? [...current, objectId] : current);
  };
  const gridTemplateColumns = `${isTrajectory ? "8rem" : "10.5rem"} repeat(${Math.max(1, visibleColumns.length)}, minmax(${isTrajectory ? "6.75rem" : props.scale === "story" ? "7.75rem" : props.scale === "event" ? "11.5rem" : "9.75rem"}, 1fr))`;
  const choose = (eventId: string) => { setPickerOpen(false); props.onSelectEvent(eventId); };
  return <section className={`event-participation-workspace is-${props.scale} is-${props.renderMode}`} aria-label="事件参与观察" data-testid="event-participation-workspace" data-layout={props.layout} data-render-mode={props.renderMode}>
    <div className="event-participation-canvas">
      <header><div><small>当前组合 · {props.layout === "narrative" ? "叙事顺序" : "世界时间"} × 参与 · {isTrajectory ? "轨迹阅读" : "矩阵核查"}</small><h2>{projection.objects.length ? `${projection.objects.map((object) => object.label).join("、")} 的参与${isTrajectory ? "轨迹" : "矩阵"}` : "选择对象，查看事件参与"}</h2></div><span>{props.layout === "world-time" ? "只排序可验证日期；相对描述与未知时间独立保留" : "按作品揭示顺序排列；不代表事件实际发生先后"}</span></header>
      <div className="event-participation-selection"><button type="button" className="event-participation-picker-trigger" aria-expanded={pickerOpen} aria-controls="event-participation-picker" onClick={() => setPickerOpen((open) => !open)}><UsersRound />选择对象 <strong>{projection.objects.length}/{EVENT_OBSERVATION_MAX_FOCUS}</strong><ChevronDown /></button><div className="event-participation-focus" aria-label="当前观察对象">{projection.objects.map((object) => <button key={object.id} type="button" onClick={() => toggle(object.id)} aria-label={`移除观察对象 ${object.label}`}>{objectIcon(object.type)}<span>{object.label}</span><X /></button>)}</div></div>
      {pickerOpen ? <section id="event-participation-picker" className="event-participation-picker" aria-label="选择观察对象"><header><UsersRound /><div><strong>观察对象</strong><span>正式人物、地点或物品；选择不会改写故事事实。</span></div></header><div>{(["character", "location", "item"] as const).map((type) => <fieldset key={type}><legend>{objectTypeLabel(type)}</legend>{objects.filter((object) => object.type === type).map((object) => <label key={object.id}><input type="checkbox" checked={selected.has(object.id)} disabled={!selected.has(object.id) && selected.size >= EVENT_OBSERVATION_MAX_FOCUS} onChange={() => toggle(object.id)} />{object.label}</label>)}{objects.every((object) => object.type !== type) ? <small>暂无正式{objectTypeLabel(type)}对象</small> : null}</fieldset>)}</div></section> : null}
      {projection.objects.length ? <>
        {projection.columns.length > visibleColumns.length ? <p className="event-participation-limit" role="status">当前只呈现前 {visibleColumns.length} / {projection.columns.length} 个事件；请先按故事单元缩小范围。</p> : null}
        <div className="event-participation-scroll" tabIndex={0} aria-label={`${props.layout === "narrative" ? "叙事顺序" : "世界时间"}${isTrajectory ? "参与轨迹" : "参与矩阵"}，可横向滚动`}><div className="event-participation-matrix" style={{ gridTemplateColumns }}><div className="event-participation-corner"><strong>{isTrajectory ? "对象轨迹" : "参与者"}</strong><span>事件列</span></div>{visibleColumns.map((column, index) => <button key={column.event.id} type="button" className="event-participation-event" aria-current={props.selectedEventId === column.event.id ? "true" : undefined} onClick={() => choose(column.event.id)}><small>{column.unitLabel === "未归入故事单元" ? `事件 ${index + 1}` : column.unitLabel}</small><strong>{column.event.title}</strong>{props.scale !== "story" ? <span>{props.layout === "world-time" ? column.time.label : `叙事序 ${column.narrativeIndex + 1}`}</span> : null}{props.layout === "world-time" && column.temporalGroup !== "ordered" ? <em>{column.temporalGroup === "unknown" ? "时间未定" : "时间仅有描述"}</em> : null}</button>)}{projection.objects.flatMap((object, objectIndex) => [<div className="event-participation-object" key={`object:${object.id}`}><span>{objectIcon(object.type)}</span><strong>{object.label}</strong><small>{objectTypeLabel(object.type)}{isTrajectory ? " · 连线只表示持续追踪" : ""}</small></div>, ...visibleColumns.map((column) => <ParticipationCell key={`${object.id}:${column.event.id}`} eventId={column.event.id} state={column.cells[objectIndex]!} object={object} title={column.event.title} selected={props.selectedEventId === column.event.id} trajectory={isTrajectory} showSources={props.showSources && props.scale === "event"} onSelect={() => choose(column.event.id)} />)])}</div></div>
        {isTrajectory ? <nav className="event-participation-spine" aria-label="事件脊柱全局方位"><span>事件脊柱</span>{visibleColumns.map((column) => <button key={column.event.id} type="button" aria-current={props.selectedEventId === column.event.id ? "true" : undefined} onClick={() => choose(column.event.id)} title={`定位事件：${column.event.title}`}><i />{column.narrativeIndex + 1}</button>)}<strong>{props.selectedEventId ? "当前事件已高亮" : "选择事件以定位"}</strong></nav> : null}
        <footer><span><CheckCircle2 />参与</span><span><Eye />见证</span><span><MinusCircle />明确缺席</span><span><CircleHelp />未知不是缺席</span>{isTrajectory ? <strong>连续线仅表示对象正在被追踪；不代表关系或中间参与。</strong> : props.showSources ? <strong>点击任一格，在既有详情中核对 Event 来源</strong> : null}</footer>
      </> : <div className="event-participation-empty"><UsersRound /><strong>{objects.length ? "先选择一个观察对象" : "当前没有可用的正式对象"}</strong><p>{objects.length ? "对象选择只改变本机视图；不会运行 AI，也不会写入 Event。" : "请先在世界资料中建立人物、地点或物品。Event 标签不会自动变成正式对象。"}</p></div>}
    </div>
  </section>;
}

function ParticipationCell(props: { eventId: string; state: { state: ParticipationState; conflict: boolean; evidenceRefs: string[] }; object: PerspectiveObjectRef; title: string; selected: boolean; trajectory: boolean; showSources: boolean; onSelect(): void }) {
  const { state: cell } = props;
  return <button type="button" className={`event-participation-cell is-${cell.state} ${cell.conflict ? "has-conflict" : ""}`} data-participation-state={cell.state} data-event-id={props.eventId} aria-label={`${props.object.label}在“${props.title}”中的状态：${STATE_COPY[cell.state]}${cell.conflict ? "，证据冲突" : ""}`} aria-current={props.selected ? "true" : undefined} onClick={props.onSelect}>{stateIcon(cell.state)}<strong className={props.trajectory && cell.state === "unknown" ? "sr-only" : undefined}>{STATE_COPY[cell.state]}</strong>{cell.conflict ? <span className="event-participation-conflict"><AlertTriangle />证据冲突</span> : null}{props.showSources ? <small>{cell.evidenceRefs.length ? `${cell.evidenceRefs.length} 个来源引用` : "无明确参与证据"}</small> : null}</button>;
}

function objectTypeLabel(type: PerspectiveObjectRef["type"]): string { return type === "character" ? "人物" : type === "location" ? "地点" : "物品"; }
function objectIcon(type: PerspectiveObjectRef["type"]) { return type === "character" ? <UserRound /> : type === "location" ? <MapPin /> : <Package />; }
function stateIcon(state: ParticipationState) { return state === "direct" ? <CheckCircle2 /> : state === "witnessed" ? <Eye /> : state === "explicit-absence" ? <MinusCircle /> : <CircleHelp />; }
