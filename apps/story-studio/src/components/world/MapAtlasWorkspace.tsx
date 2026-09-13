import { useEffect, useRef, useState } from "react";
import type { MapContent, MapDocument, MapPlacement } from "../../lib/localTransport";
import { MapReadOnlyContent } from "./mapAuthoring";
import { MapAlignmentWorkspace } from "./MapAlignmentWorkspace";

type Point = {x:number;y:number};
type Draft = {parentMapId:string; placement:MapPlacement; savedPlacement:MapPlacement};
const anchor = (p:MapPlacement):Point => p.point ?? {x:p.bounds.reduce((s,q)=>s+q.x,0)/p.bounds.length,y:p.bounds.reduce((s,q)=>s+q.y,0)/p.bounds.length};
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
export function MapAtlasWorkspace(props: {
  projectId:string; maps:MapDocument[]; parent:MapDocument|null; draft:Draft|null; busy:boolean; error:string|null;
  view:"list"|"spatial"; onView(v:"list"|"spatial"):void; onParent(id:string):void;
  onOpen(id:string):void; onDuplicate(map:MapDocument):void; onArchive(map:MapDocument,value:boolean):void;
  template:MapContent["template"]; onTemplate(v:MapContent["template"]):void; onCreate():void;
  onEdit(parent:MapDocument,p:MapPlacement):void; onNew(parent:MapDocument,child:MapDocument):void;
  onUpdate(p:MapPlacement):void; onMove(p:MapPlacement,q:Point):MapPlacement; onScale(p:MapPlacement,n:number):MapPlacement;
  onCalibrate():void; onPoint(side:"sourcePoints"|"targetPoints",index:0|1,point:Point):void; onSave():void; onCancel():void;
}) {
  const storageKey=`tianyan.map.atlas.${props.projectId}`;
  const [search,setSearch]=useState(()=>sessionStorage.getItem(`${storageKey}.search`)??"");
  const [archived,setArchived]=useState(()=>sessionStorage.getItem(`${storageKey}.archived`)==="true");
  const [selected,setSelected]=useState<string|null>(()=>sessionStorage.getItem(`tianyan.map.atlas.${props.projectId}.selection`));
  const [pending,setPending]=useState<string|null>(null);
  const [zoom,setZoom]=useState(()=>Number(sessionStorage.getItem(`tianyan.map.atlas.${props.projectId}.zoom`)) || 1);
  useEffect(()=>{sessionStorage.setItem(`tianyan.map.atlas.${props.projectId}.selection`,selected??"");sessionStorage.setItem(`tianyan.map.atlas.${props.projectId}.zoom`,String(zoom));},[selected,zoom,props.projectId]);
  const [pan,setPan]=useState(()=>{try{const value=JSON.parse(sessionStorage.getItem(`${storageKey}.pan`)??"null");return value&&Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:{x:0,y:0};}catch{return {x:0,y:0};}});
  useEffect(()=>{sessionStorage.setItem(`${storageKey}.pan`,JSON.stringify(pan));sessionStorage.setItem(`${storageKey}.search`,search);sessionStorage.setItem(`${storageKey}.archived`,String(archived));},[storageKey,pan,search,archived]);
  const panning=useRef<{x:number;y:number;start:Point;pointer:number}|null>(null);
  const drag=useRef<{pointer:number;start:Point;p:MapPlacement;vertex?:number}|null>(null);
  const svg=useRef<SVGSVGElement|null>(null);
  const parent=props.parent;
  const child=props.maps.find((m)=>m.id===props.draft?.placement.childMapId);
  const placements=parent ? [...parent.content.placements.filter((p)=>p.id!==props.draft?.placement.id),...(props.draft?.parentMapId===parent.id?[props.draft.placement]:[])] : [];
  const available=props.maps.filter((m)=>!m.content.lifecycle.archived && m.id!==parent?.id && !placements.some((p)=>p.childMapId===m.id));
  const chooseParent=(id:string)=>{if(props.draft)return;props.onParent(id);setSelected(null);setPending(null);setZoom(1);setPan({x:0,y:0});};
  const point=(x:number,y:number)=>{const b=svg.current!.getBoundingClientRect();return {x:clamp(pan.x+50-50/zoom+(x-b.left)/b.width*100/zoom),y:clamp(pan.y+50-50/zoom+(y-b.top)/b.height*100/zoom)};};
  const start=(e:React.PointerEvent<SVGElement>,p:MapPlacement,vertex?:number)=>{
    if(e.button!==0 || p.kind==="calibrated" || !parent)return;
    if(props.draft && props.draft.placement.id!==p.id)return;
    if(!props.draft || props.draft.placement.id!==p.id)props.onEdit(parent,p);
    e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);setSelected(p.id);
    drag.current={pointer:e.pointerId,start:point(e.clientX,e.clientY),p:structuredClone(p),vertex};
  };
  const roots=props.maps.filter((m)=>!props.maps.some((p)=>p.content.placements.some((q)=>q.childMapId===m.id)));
  return <section className="map-manager map-atlas" aria-label="地图管理">
    <header><div><h1>地图集</h1><p>{props.maps.length} 张地图 · {roots.length} 张独立地图</p></div><label>搜索地图<input value={search} onChange={(e)=>setSearch(e.target.value)}/></label><div role="group" aria-label="地图管理视图"><button aria-pressed={props.view==="list"} onClick={()=>props.onView("list")}>列表</button><button aria-pressed={props.view==="spatial"} onClick={()=>props.onView("spatial")}>空间总览</button></div><details><summary>管理选项</summary><label><input type="checkbox" checked={archived} onChange={(e)=>setArchived(e.target.checked)}/>显示已归档</label></details><label>新地图起点<select value={props.template} onChange={(e)=>props.onTemplate(e.target.value as MapContent["template"])}><option value="geography">地理</option><option value="building">建筑</option><option value="starfield">星域</option><option value="blank">空白</option></select></label><button onClick={props.onCreate} disabled={props.busy}>新建地图</button></header>
    {props.view==="list" ? <div className="map-manager-list">{[...props.maps].sort((a,b)=>(b.updatedAt??"").localeCompare(a.updatedAt??"")).filter((m)=>(archived||!m.content.lifecycle.archived)&&m.title.includes(search)).map((m)=>{
      const parents=props.maps.filter((p)=>p.content.placements.some((q)=>q.childMapId===m.id));
      return <article key={m.id} data-archived={m.content.lifecycle.archived}><div className="map-manager-thumbnail"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={m.title+"内容缩略图"}><MapReadOnlyContent projectId={props.projectId} content={m.content} compact/></svg></div><div><h2>{m.title}</h2><small>{parents.length ? "上层："+parents.map((p)=>p.title).join(" · ") : "独立地图 · 可作为空间总览起点"}</small><p>{m.content.drawings.length} 个图示 · {m.content.placements.length} 张子图{m.content.lifecycle.archived?" · 已归档":""}</p></div><nav><button onClick={()=>props.onOpen(m.id)}>绘制此图</button><button onClick={()=>{chooseParent(m.id);props.onView("spatial");}}>以此图为父图</button>{parents[0]?<button onClick={()=>{chooseParent(parents[0]!.id);setSelected(parents[0]!.content.placements.find((p)=>p.childMapId===m.id)!.id);props.onView("spatial");}}>在上层图中查看位置</button>:null}<details><summary>更多</summary><button onClick={()=>props.onDuplicate(m)}>复制</button><button onClick={()=>props.onArchive(m,!m.content.lifecycle.archived)}>{m.content.lifecycle.archived?"恢复":"归档"}</button><small>修订 {m.revision}</small><time>{m.updatedAt?new Date(m.updatedAt).toLocaleString():"时间未知"}</time></details></nav></article>;
    })}</div> : props.draft?.placement.kind==="calibrated" && child && parent ? <MapAlignmentWorkspace projectId={props.projectId} parent={parent} child={child} placement={props.draft.placement} error={props.error} busy={props.busy} onPoint={props.onPoint} onSave={props.onSave} onCancel={props.onCancel}/> : <div className="map-manager-spatial">
      <div className="map-spatial-view-toolbar"><label>父地图<select aria-label="空间总览父地图" value={parent?.id??""} onChange={(e)=>chooseParent(e.target.value)}>{props.maps.filter((m)=>!m.content.lifecycle.archived).map((m)=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label><span> ◉ 点位　▱ 范围　◇ 跨图端点 · 中键平移</span><label>看图缩放<select aria-label="空间视口缩放" value={zoom} onChange={(e)=>setZoom(Number(e.target.value))}><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label></div>
      {parent ? <div className="map-manager-parent-canvas" aria-label={parent.title+"空间定位画布"}>
        <svg ref={svg} viewBox={`${pan.x+50-50/zoom} ${pan.y+50-50/zoom} ${100/zoom} ${100/zoom}`} preserveAspectRatio="none" tabIndex={0} role="application" aria-label="空间地图画布"
          onClick={(e)=>{if(!pending)return;const m=props.maps.find((m)=>m.id===pending);if(!m)return; const q=point(e.clientX,e.clientY);props.onEdit(parent,{id:"placement."+crypto.randomUUID(),childMapId:m.id,kind:"point",point:q,bounds:[],transform:null,precision:"illustrative",note:"作者选择的位置"});setPending(null);}}
          onPointerDown={(e)=>{if(e.button===1){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);panning.current={x:e.clientX,y:e.clientY,start:pan,pointer:e.pointerId};}}}
          onPointerMove={(e)=>{const v=panning.current;if(v&&v.pointer===e.pointerId){const b=e.currentTarget.getBoundingClientRect();setPan({x:v.start.x-(e.clientX-v.x)/b.width*100/zoom,y:v.start.y-(e.clientY-v.y)/b.height*100/zoom});return;}const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const q=point(e.clientX,e.clientY);if(d.vertex!==undefined)props.onUpdate({...d.p,bounds:d.p.bounds.map((p,i)=>i===d.vertex?q:p)});else {const a=anchor(d.p);props.onUpdate(props.onMove(d.p,{x:a.x+q.x-d.start.x,y:a.y+q.y-d.start.y}));}}}
          onPointerUp={()=>{drag.current=null;panning.current=null;}} onPointerCancel={()=>{drag.current=null;panning.current=null;}}>
          <MapReadOnlyContent projectId={props.projectId} content={parent.content}/>
          {placements.map((p,pi)=>{const a=anchor(p),m=props.maps.find((m)=>m.id===p.childMapId);return <g key={p.id} className={`map-spatial-placement ${selected===p.id||props.draft?.placement.id===p.id?"is-selected":""}`} role="button" tabIndex={0} aria-label={`编辑 ${m?.title??"失效目标"} 的${p.kind==="point"?"点定位":p.kind==="range"?"范围定位":"坐标校准"}`} onClick={(e)=>{e.stopPropagation();setSelected(p.id);if(p.kind==="calibrated")props.onEdit(parent,p);}} onDoubleClick={()=>m&&props.onOpen(m.id)} onKeyDown={(e)=>{if(e.key==="Enter"){setSelected(p.id);props.onEdit(parent,p);}}} onPointerDown={(e)=>start(e,p)}>
            {p.kind==="point"?<circle cx={a.x} cy={a.y} r="1.4"/>:<polygon points={p.bounds.map((q)=>q.x+","+q.y).join(" ")}/>}<title>{m?.title??"目标已失效"}</title>{(selected===p.id || props.draft?.placement.id===p.id || !placements.slice(0,pi).some(q=>Math.abs(anchor(q).x-a.x)<20&&Math.abs(anchor(q).y-a.y)<7)) ? <text x={Math.min(95,a.x+2)} y={Math.max(3,a.y-2)} textAnchor={a.x>75?"end":"start"}>{(m?.title??"目标已失效").length>16?(m!.title.slice(0,15)+"…"):m?.title??"目标已失效"}</text>:null}
          </g>;})}
          {props.draft?.placement.kind==="range" ? props.draft.placement.bounds.map((p,i)=><circle key={i} className="map-range-handle" cx={p.x} cy={p.y} r="1.1" role="button" tabIndex={0} aria-label={`范围控制点 ${i+1}`} onPointerDown={(e)=>start(e,props.draft!.placement,i)} onKeyDown={(e)=>{const dx=e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:0,dy=e.key==="ArrowUp"?-1:e.key==="ArrowDown"?1:0;if(dx||dy){e.preventDefault();props.onUpdate({...props.draft!.placement,bounds:props.draft!.placement.bounds.map((q,j)=>i===j?{x:clamp(q.x+dx),y:clamp(q.y+dy)}:q)});}}}/>):null}
          {props.maps.flatMap((m)=>m.content.connections).flatMap((c)=>[c.from,c.to].filter((e)=>e.mapId===parent.id).map((e)=><path key={e.endpointId} className="map-spatial-endpoint" d={`M ${e.x} ${e.y-1.5} l 1.5 1.5 l -1.5 1.5 l -1.5 -1.5 Z`}><title>{c.title}</title></path>))}
        </svg>
      </div>:<p>创建第一张地图后可在这里组织空间。</p>}
      <aside><h2>{props.draft?"定位编辑":pending?"在父图选位置":"子地图"}</h2>{props.draft&&parent?<section className="map-spatial-editor" aria-label="空间定位编辑器"><strong>{child?.title??"目标已失效"}</strong><small>父图：{parent.title} · 临时预览</small><p>拖动范围或圆形控制点。保存前不会改动已保存位置。</p><div className="map-spatial-editor-actions"><button onClick={props.onCancel} disabled={props.busy}>取消</button><button className="primary-action" onClick={props.onSave} disabled={props.busy||Boolean(props.error)}>保存定位</button></div><label>水平位置<input aria-label="定位水平位置" type="number" value={Number(anchor(props.draft.placement).x.toFixed(2))} onChange={(e)=>props.onUpdate(props.onMove(props.draft!.placement,{...anchor(props.draft!.placement),x:Number(e.target.value)}))}/></label><label>垂直位置<input aria-label="定位垂直位置" type="number" value={Number(anchor(props.draft.placement).y.toFixed(2))} onChange={(e)=>props.onUpdate(props.onMove(props.draft!.placement,{...anchor(props.draft!.placement),y:Number(e.target.value)}))}/></label>{props.draft.placement.kind==="range"?<label>范围整体大小<input aria-label="范围整体大小" type="range" min="25" max="200" defaultValue="100" onChange={(e)=>props.onUpdate(props.onScale(props.draft!.savedPlacement,Number(e.target.value)))}/></label>:<button onClick={()=>{const a=anchor(props.draft!.placement);props.onUpdate({...props.draft!.placement,kind:"range",point:null,bounds:[{x:clamp(a.x-10),y:clamp(a.y-10)},{x:clamp(a.x+10),y:clamp(a.y-10)},{x:clamp(a.x+10),y:clamp(a.y+10)},{x:clamp(a.x-10),y:clamp(a.y+10)}]});}}>改为范围</button>}<button onClick={props.onCalibrate}>改为坐标校准</button></section>:<>
        {placements.map((p)=>{const m=props.maps.find((m)=>m.id===p.childMapId);return <section key={p.id} className={selected===p.id?"is-selected":""}><strong>{m?.title??"目标已失效"}</strong><div><button onClick={()=>parent&&props.onEdit(parent,p)}>调整位置</button><button disabled={!m} onClick={()=>m&&props.onOpen(m.id)}>进入子图</button></div></section>;})}
        <h3>可放入当前父图</h3><small>独立地图不必定位；仅在需要时建立放置。</small>{available.map((m)=><section key={m.id}><strong>{m.title}</strong><div><button aria-pressed={pending===m.id} onClick={()=>setPending(m.id)}>在图上放置</button><button onClick={()=>parent&&props.onNew(parent,m)}>建立范围</button></div>{pending===m.id?<><p>点击父图地标。键盘替代：先建立中心预览，再用位置输入调整。</p><button onClick={()=>{if(parent)props.onEdit(parent,{id:"placement."+crypto.randomUUID(),childMapId:m.id,kind:"point",point:{x:50,y:50},bounds:[],transform:null,precision:"illustrative",note:"作者位置预览"});setPending(null);}}>输入位置</button><button onClick={()=>setPending(null)}>取消放置</button></>:null}</section>)}
      </>}</aside>
    </div>}
  </section>;
}
