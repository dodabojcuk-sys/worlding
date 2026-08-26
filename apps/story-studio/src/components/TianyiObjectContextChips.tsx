import { BookPlus, X } from "lucide-react";
import { useState, type DragEvent } from "react";

import type { TianyiObjectContextRef } from "../lib/localTransport";
import { parseDroppedTianyiObjectContext, tianyiObjectContextKey } from "./tianyiObjectContext";

export function TianyiObjectContextChips(props: {
  refs: TianyiObjectContextRef[];
  availableRefs: TianyiObjectContextRef[];
  onAdd(ref: TianyiObjectContextRef): void;
  onRemove(ref: TianyiObjectContextRef): void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = new Set(props.refs.map(tianyiObjectContextKey));
  const available = props.availableRefs.filter((ref) => !selected.has(tianyiObjectContextKey(ref)));
  const atLimit = props.refs.length >= 4;

  function drop(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    const ref = parseDroppedTianyiObjectContext(event.dataTransfer);
    if (ref && !atLimit) props.onAdd(ref);
  }

  return <section className="tianyi-object-context" aria-label="当前问题资料" onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-story-studio-tianyi-object-context-ref")) event.preventDefault(); }} onDrop={drop} data-testid="tianyi-object-context-dropzone">
    <header><strong>当前问题资料</strong><button type="button" onClick={() => setPickerOpen((current) => !current)} aria-expanded={pickerOpen} disabled={atLimit}><BookPlus />{atLimit ? "已达 4 项" : "添加资料"}</button></header>
    <div className="tianyi-object-context-chips">
      {props.refs.map((ref) => <span className={`tianyi-object-context-chip is-${ref.state}`} data-source-state={ref.state} data-source-inclusion={ref.inclusion} key={tianyiObjectContextKey(ref)}><span>{ref.label}</span><small>{stateLabel(ref.state)}</small><button type="button" onClick={() => props.onRemove(ref)} aria-label={`移除资料 ${ref.label}`}><X /></button></span>)}
      {props.refs.length === 0 && <small>拖入对象，或从现有资料中选择；最多 4 项。</small>}
    </div>
    {pickerOpen && <div className="tianyi-object-context-picker" role="dialog" aria-label="添加天意资料">
      {available.length ? available.map((ref) => <button type="button" onClick={() => { props.onAdd(ref); setPickerOpen(false); }} key={tianyiObjectContextKey(ref)}><span>{ref.label}</span><small>{objectTypeLabel(ref.objectType)}</small></button>) : <p>当前没有更多可加入的资料。</p>}
    </div>}
  </section>;
}

function stateLabel(state: TianyiObjectContextRef["state"]): string {
  return ({ current: "当前", stale: "已变化", missing: "已缺失", unauthorized: "无权限" })[state];
}

function objectTypeLabel(type: TianyiObjectContextRef["objectType"]): string {
  return ({ character: "人物", location: "地点", event: "事件", item: "物件 / 证据", rule: "规则", chapter: "章节", scene: "场景", selection: "当前选区", "map-marker": "地图标记", "map-region": "地图区域", "timeline-event": "时间线事件" })[type];
}
