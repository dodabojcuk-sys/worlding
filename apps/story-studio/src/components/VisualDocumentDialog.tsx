import { Clock3, GitFork, Map, Network, Shapes, X } from "lucide-react";

import type { VisualDocumentType } from "../lib/localTransport";

export function VisualDocumentDialog(props: {
  type: VisualDocumentType;
  title: string;
  busy: boolean;
  error: string;
  onType(type: VisualDocumentType): void;
  onTitle(title: string): void;
  onCreate(): void;
  onClose(): void;
}) {
  return <div className="dialog-backdrop" role="presentation">
    <section className="new-object-dialog visual-document-dialog" role="dialog" aria-modal="true" aria-label="新建视觉文档">
      <button className="quiet-close" type="button" onClick={props.onClose} aria-label="关闭"><X /></button>
      <p className="eyebrow">视觉世界</p>
      <h2>创建一份可组合的世界文档</h2>
      <p>视觉文档只保存布局和对象引用，不复制人物或地点正文。</p>
      <div className="visual-type-picker">
        <button type="button" className={props.type === "map" ? "is-selected" : ""} onClick={() => props.onType("map")}><Map /><span><strong>地图</strong><small>底图、地点、区域与图层</small></span></button>
        <button type="button" className={props.type === "graph" ? "is-selected" : ""} onClick={() => props.onType("graph")}><GitFork /><span><strong>关系图谱</strong><small>对象节点与类型化关系</small></span></button>
        <button type="button" className={props.type === "canvas" ? "is-selected" : ""} onClick={() => props.onType("canvas")}><Shapes /><span><strong>画布</strong><small>对象、文本、图片与箭头</small></span></button>
        <button type="button" className={props.type === "timeline" ? "is-selected" : ""} onClick={() => props.onType("timeline")}><Clock3 /><span><strong>时间线</strong><small>作者确认的正史事件</small></span></button>
        <button type="button" className={props.type === "tree" ? "is-selected" : ""} onClick={() => props.onType("tree")}><Network /><span><strong>树</strong><small>已有图谱关系的层级投影</small></span></button>
      </div>
      <label className="dialog-field"><span>文档名称</span><input autoFocus value={props.title} maxLength={100} placeholder={visualPlaceholder(props.type)} onChange={(event) => props.onTitle(event.target.value)} /></label>
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      <button type="button" className="primary-action dialog-primary" disabled={!props.title.trim() || props.busy} onClick={props.onCreate}>{props.busy ? "正在创建" : `创建${visualLabel(props.type)}`}</button>
    </section>
  </div>;
}

function visualLabel(type: VisualDocumentType): string {
  return type === "map" ? "地图" : type === "graph" ? "图谱" : type === "canvas" ? "画布" : type === "timeline" ? "时间线" : "树";
}

function visualPlaceholder(type: VisualDocumentType): string {
  return type === "map" ? "例如：灯塔海域" : type === "graph" ? "例如：核心关系" : type === "canvas" ? "例如：第三章线索板" : type === "timeline" ? "例如：灯塔正史" : "例如：守塔人家族";
}
