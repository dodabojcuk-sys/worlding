import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MapDocument, MapPlacement } from "../../lib/localTransport";
import { mapCanvasPointToCoordinate, mapCoordinatePointToCanvas, projectChildCanvasPointToParentCanvas } from "../../../../../src/storyContracts/mapCalibration.ts";
import { MapReadOnlyContent } from "./mapAuthoring";

type Point = { x: number; y: number };
export function CalibratedMapContent(props: { parent: MapDocument; child: MapDocument; placement: MapPlacement; projectId: string; opacity?: number; children?: ReactNode }) {
  if (!props.placement.transform) return null;
  const project = (point: Point) => projectChildCanvasPointToParentCanvas({ point, childBounds: props.child.content.coordinateSystem.bounds, parentBounds: props.parent.content.coordinateSystem.bounds, transform: props.placement.transform! });
  const o = project({x:0,y:0}), x = project({x:100,y:0}), y = project({x:0,y:100});
  return <g className="map-alignment-child" data-child-map-id={props.child.id} transform={`matrix(${(x.x-o.x)/100} ${(x.y-o.y)/100} ${(y.x-o.x)/100} ${(y.y-o.y)/100} ${o.x} ${o.y})`} opacity={props.opacity ?? .65}><MapReadOnlyContent content={props.child.content} projectId={props.projectId} />{props.children}</g>;
}

function focusedViewBox(points: Point[]): { x: number; y: number; width: number; height: number } {
  const xs=points.map((point)=>point.x),ys=points.map((point)=>point.y);
  const minX=Math.max(0,Math.min(...xs)-8),maxX=Math.min(100,Math.max(...xs)+8);
  const minY=Math.max(0,Math.min(...ys)-8),maxY=Math.min(100,Math.max(...ys)+8);
  const width=Math.max(18,maxX-minX),height=Math.max(18,maxY-minY);
  return {x:Math.min(100-width,minX),y:Math.min(100-height,minY),width,height};
}

/** UI-only point picking; the parent workspace owns the pending revision. */
export function MapAlignmentWorkspace(props: {
  projectId: string; parent: MapDocument; child: MapDocument; placement: MapPlacement; error: string | null; busy: boolean;
  onPoint(side: "sourcePoints" | "targetPoints", index: 0 | 1, point: Point): void;
  onSave(): void; onCancel(): void;
}) {
  const [step, setStep] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [focusPreview,setFocusPreview]=useState(true);
  const [showChild,setShowChild]=useState(true);
  const [childOpacity,setChildOpacity]=useState(.72);
  const panning=useRef<{x:number;y:number;start:Point;pointer:number}|null>(null);
  const [cursor, setCursor] = useState<Point>({x:50,y:50});
  const calibration = props.placement.calibration!;
  const preview = step === 4;
  const source = step === 0 || step === 2;
  const current = source ? props.child : props.parent;
  const index = (step < 2 ? 0 : 1) as 0 | 1;
  const side = source ? "sourcePoints" : "targetPoints";
  const labels = ["子图 · A", "父图 · A", "子图 · B", "父图 · B", "叠加预览"];
  const choose = (point: Point) => {
    if (preview) return;
    if (point.x<0 || point.x>100 || point.y<0 || point.y>100) return;
    props.onPoint(side, index, mapCanvasPointToCoordinate(point, current.content.coordinateSystem.bounds));
    setStep(Math.min(4, step + 1));
  };
  const third = projectChildCanvasPointToParentCanvas({point:{x:30,y:25},childBounds:props.child.content.coordinateSystem.bounds,parentBounds:props.parent.content.coordinateSystem.bounds,transform:props.placement.transform!});
  const focus=useMemo(()=>focusedViewBox([...props.placement.bounds,...calibration.targetPoints.map((point)=>mapCoordinatePointToCanvas(point,props.parent.content.coordinateSystem.bounds)),third]),[props.placement.bounds,calibration.targetPoints,props.parent.content.coordinateSystem.bounds,third.x,third.y]);
  const normalViewBox={x:pan.x+50-50/zoom,y:pan.y+50-50/zoom,width:100/zoom,height:100/zoom};
  const viewBox=preview&&focusPreview?{...focus,x:focus.x+pan.x,y:focus.y+pan.y}:normalViewBox;
  useEffect(()=>{if(preview)setFocusPreview(true);},[preview]);
  return <section className="map-alignment-workspace" aria-label="坐标校准">
    <header><div><strong>精确对齐 · {props.child.title} → {props.parent.title}</strong><p>{preview ? "检查地标是否对应。可返回任一步重选；保存前不会改动原图。" : `在「${current.title}」上选择对应点 ${index === 0 ? "A" : "B"}。${source ? "先选容易识别的地标。" : "选择同一地标在父图的位置。"}`}</p></div><div className="map-spatial-editor-actions"><button onClick={props.onCancel} disabled={props.busy}>取消</button><button className="primary-action" onClick={props.onSave} disabled={props.busy || Boolean(props.error) || !preview}>保存定位</button></div></header>
    <nav aria-label="对齐步骤">{labels.map((label,i)=><button key={label} aria-current={step===i ? "step" : undefined} onClick={()=>setStep(i)}>{i+1}. {label}</button>)}</nav>
    <div className="map-alignment-stage">
      <svg viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="none" role="application" tabIndex={0} aria-label={preview ? "校准实际对应预览" : `${source ? "子图" : "父图"}对应点选择画布`} data-third-x={third.x.toFixed(4)} data-third-y={third.y.toFixed(4)}
        onPointerDown={(e)=>{if(e.button===1){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);panning.current={x:e.clientX,y:e.clientY,start:pan,pointer:e.pointerId};}}}
        onPointerMove={(e)=>{const v=panning.current;if(!v||v.pointer!==e.pointerId)return;const b=e.currentTarget.getBoundingClientRect();setPan({x:v.start.x-(e.clientX-v.x)/b.width*viewBox.width,y:v.start.y-(e.clientY-v.y)/b.height*viewBox.height});}}
        onPointerUp={()=>{panning.current=null;}} onPointerCancel={()=>{panning.current=null;}}
        onClick={(event)=>{ const box=event.currentTarget.getBoundingClientRect(); choose({x:viewBox.x+(event.clientX-box.left)/box.width*viewBox.width,y:viewBox.y+(event.clientY-box.top)/box.height*viewBox.height}); }}
        onKeyDown={(event)=>{ if(preview)return; const delta=event.shiftKey?5:1; const d=event.key==="ArrowLeft"?{x:-delta,y:0}:event.key==="ArrowRight"?{x:delta,y:0}:event.key==="ArrowUp"?{x:0,y:-delta}:event.key==="ArrowDown"?{x:0,y:delta}:null; if(d){event.preventDefault();setCursor({x:Math.max(0,Math.min(100,cursor.x+d.x)),y:Math.max(0,Math.min(100,cursor.y+d.y))});} if(event.key==="Enter"){event.preventDefault();choose(cursor);} }}>
        <g className="map-alignment-parent"><MapReadOnlyContent content={current.content} projectId={props.projectId} /></g>
        {preview && !props.error && showChild ? <CalibratedMapContent {...props} opacity={childOpacity}><g className="map-calibration-child-check"><circle cx="30" cy="25" r="1.2"/><path d="M 27.5 25 H 32.5 M 30 22.5 V 27.5"/></g></CalibratedMapContent> : null}
        {calibration[preview ? "targetPoints" : side].map((p,i)=>{const q=mapCoordinatePointToCanvas(p,current.content.coordinateSystem.bounds);return <g className="map-calibration-control" key={i}><circle cx={q.x} cy={q.y} r="1.2"/><text x={q.x+2} y={q.y-2}>{i===0?"A":"B"}</text></g>;})}
        {preview ? <g className="map-calibration-third" transform={`translate(${third.x} ${third.y})`}><path d="M -1.5 0 H 1.5 M 0 -1.5 V 1.5"/><text x="2" y="-2">检查点</text></g> : <path className="map-pick-cursor" d={`M ${cursor.x-1} ${cursor.y} h 2 M ${cursor.x} ${cursor.y-1} v 2`} />}
      </svg>
    </div>
    {!preview && !source ? <details className="map-alignment-reference"><summary>查看子图对应点参考</summary><div><strong>{props.child.title}</strong><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="子图对应点参考"><MapReadOnlyContent content={props.child.content} projectId={props.projectId}/>{calibration.sourcePoints.map((point,i)=>{const q=mapCoordinatePointToCanvas(point,props.child.content.coordinateSystem.bounds);return <g className="map-calibration-control" key={i}><circle cx={q.x} cy={q.y} r="2"/><text x={q.x+3} y={q.y-3}>{i===0?"A":"B"}</text></g>;})}</svg></div></details> : null}
    <footer><span>{props.error ? <span role="alert">无法保存：{props.error}</span> : `临时预览 · 缩放 ${props.placement.transform!.scale.toFixed(3)} 倍 · 旋转 ${props.placement.transform!.rotation.toFixed(2)}°`}</span>{preview?<><button aria-pressed={focusPreview} onClick={()=>{setFocusPreview(!focusPreview);setPan({x:0,y:0});}}>{focusPreview?"查看整张父图":"聚焦对齐区域"}</button><button aria-pressed={!showChild} onClick={()=>setShowChild(!showChild)}>{showChild?"临时隐藏子图":"显示子图"}</button><label>子图透明度<input aria-label="子图叠加透明度" type="range" min="0.2" max="1" step="0.05" value={childOpacity} disabled={!showChild} onChange={(e)=>setChildOpacity(Number(e.target.value))}/></label><span className="map-alignment-legend"><i/>父图 <i/>子图</span></>:<><label>看图缩放<select aria-label="对齐视口缩放" value={zoom} onChange={(e)=>setZoom(Number(e.target.value))}><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label><button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>适配视图</button></>}<small>中键平移；方向键移动十字，Enter 选点。视口不改变地图坐标。</small></footer>
    <details className="map-calibration-fields"><summary>高级：精确坐标调整</summary>{([0,1] as const).map((i)=><fieldset key={i}><legend>对应点 {i===0?"A":"B"}</legend>{(["sourcePoints","targetPoints"] as const).map((s)=><div key={s}><strong>{s==="sourcePoints"?"子图":"父图"}</strong>{(["x","y"] as const).map((axis)=><label key={axis}>{axis.toUpperCase()}<input aria-label={`${s==="sourcePoints"?"子图":"父图"}点 ${i===0?"A":"B"} ${axis.toUpperCase()}`} type="number" value={Number(calibration[s][i][axis].toFixed(4))} onChange={(e)=>props.onPoint(s,i,{...calibration[s][i],[axis]:Number(e.target.value)})}/></label>)}</div>)}</fieldset>)}</details>
  </section>;
}
