import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { visualAssetUrl, type MapContent, type MapDrawing, type MapLabel } from "../../lib/localTransport";

export type MapAuthoringTool = "browse" | "terrain" | "line" | "area" | "symbol" | "label";

export const MAP_TOOL_OPTIONS: Record<Exclude<MapAuthoringTool, "browse" | "label">, Array<{ value: string; label: string }>> = {
  terrain: [{ value: "land", label: "陆地" }, { value: "water", label: "水域" }, { value: "forest", label: "森林" }, { value: "mountain", label: "山脉" }, { value: "sand", label: "沙地" }],
  line: [{ value: "river", label: "河流" }, { value: "road", label: "道路" }, { value: "wall", label: "墙体" }, { value: "connector", label: "连接示意" }],
  area: [{ value: "geography", label: "地理范围" }, { value: "district", label: "行政范围图示" }, { value: "room", label: "房间" }],
  symbol: [{ value: "settlement", label: "聚落" }, { value: "building", label: "建筑" }, { value: "door", label: "门" }, { value: "entrance", label: "入口" }, { value: "planet", label: "星球" }]
};

export function createStarterContent(template: MapContent["template"]): Pick<MapContent, "template" | "layers" | "drawings" | "labels"> {
  const layers = template === "starfield"
    ? [{ id: "layer.stars", title: "星域", visible: true, locked: false }, { id: "layer.routes", title: "航线", visible: true, locked: false }, { id: "layer.main", title: "地点与资料", visible: true, locked: false }]
    : template === "building"
      ? [{ id: "layer.plan", title: "建筑平面", visible: true, locked: false }, { id: "layer.main", title: "地点与资料", visible: true, locked: false }]
      : [{ id: "layer.terrain", title: "地形", visible: true, locked: false }, { id: "layer.routes", title: "河流与道路", visible: true, locked: false }, { id: "layer.main", title: "地点与资料", visible: true, locked: false }];
  const drawing = (value: Partial<MapDrawing> & Pick<MapDrawing, "id" | "kind" | "subtype" | "layerId" | "points">): MapDrawing => ({ strokeColor: "#167b7a", fillColor: "#49a99b", fillOpacity: .24, width: 3, size: 4, seed: 1, rotation: 0, label: null, objectId: null, ...value });
  const drawings = template === "starfield" ? [
    drawing({ id: "starter.planet.1", kind: "symbol", subtype: "planet", layerId: "layer.stars", points: [{ x: 27, y: 42 }], size: 8, fillColor: "#d39b53", label: "主星" }),
    drawing({ id: "starter.planet.2", kind: "symbol", subtype: "planet", layerId: "layer.stars", points: [{ x: 70, y: 56 }], size: 6, fillColor: "#63c3b5", label: "伴星" }),
    drawing({ id: "starter.route", kind: "line", subtype: "connector", layerId: "layer.routes", points: [{ x: 31, y: 44 }, { x: 66, y: 54 }], strokeColor: "#8ab7c7", width: 1.5 })
  ] : template === "building" ? [
    drawing({ id: "starter.room.entry", kind: "area", subtype: "room", layerId: "layer.plan", points: [{ x: 18, y: 18 }, { x: 51, y: 18 }, { x: 51, y: 80 }, { x: 18, y: 80 }], fillColor: "#e8dfcf", strokeColor: "#705c49", fillOpacity: .55, width: 2, label: "门厅" }),
    drawing({ id: "starter.room.guard", kind: "area", subtype: "room", layerId: "layer.plan", points: [{ x: 53, y: 18 }, { x: 82, y: 18 }, { x: 82, y: 80 }, { x: 53, y: 80 }], fillColor: "#d8e4dc", strokeColor: "#705c49", fillOpacity: .55, width: 2, label: "守卫室" }),
    drawing({ id: "starter.door", kind: "symbol", subtype: "door", layerId: "layer.plan", points: [{ x: 52, y: 50 }], strokeColor: "#705c49", fillColor: "#f7f3ea", size: 6, label: "内门" }),
    drawing({ id: "starter.floor-entrance", kind: "symbol", subtype: "entrance", layerId: "layer.plan", points: [{ x: 23, y: 72 }], strokeColor: "#167b7a", fillColor: "#d8eee8", size: 5, label: "一层入口" })
  ] : template === "geography" ? [
    drawing({ id: "starter.coast", kind: "terrain", subtype: "land", layerId: "layer.terrain", points: [{ x: 18, y: 25 }, { x: 28, y: 18 }, { x: 48, y: 26 }, { x: 62, y: 20 }, { x: 82, y: 34 }, { x: 74, y: 76 }, { x: 35, y: 82 }, { x: 16, y: 62 }], fillColor: "#c9c89a", width: 18 }),
    drawing({ id: "starter.river", kind: "line", subtype: "river", layerId: "layer.routes", points: [{ x: 54, y: 20 }, { x: 50, y: 38 }, { x: 57, y: 58 }, { x: 64, y: 78 }], strokeColor: "#2f7f9b", width: 3, label: "主河道" }),
    drawing({ id: "starter.mountains", kind: "terrain", subtype: "mountain", layerId: "layer.terrain", points: [{ x: 31, y: 33 }, { x: 39, y: 38 }, { x: 47, y: 34 }], strokeColor: "#706b61", fillColor: "#706b61", width: 9, label: "山脉" }),
    drawing({ id: "starter.forest", kind: "terrain", subtype: "forest", layerId: "layer.terrain", points: [{ x: 34, y: 57 }, { x: 43, y: 63 }, { x: 51, y: 60 }], strokeColor: "#315f52", fillColor: "#4f7f5d", width: 10, label: "森林" }),
    drawing({ id: "starter.road", kind: "line", subtype: "road", layerId: "layer.routes", points: [{ x: 24, y: 68 }, { x: 43, y: 52 }, { x: 66, y: 48 }], strokeColor: "#9a6b3c", width: 2.5, label: "道路" })
  ] : [];
  const labels = template === "starfield"
    ? [{ id: "starter.label.starfield", text: "未命名星域", layerId: "layer.stars", x: 50, y: 14, fontSize: 20, fontWeight: 700 as const, align: "center" as const, rotation: 0, visible: true, treatment: "outline" as const }]
    : template === "building"
      ? [{ id: "starter.label.floor", text: "一层", layerId: "layer.plan", x: 50, y: 12, fontSize: 18, fontWeight: 700 as const, align: "center" as const, rotation: 0, visible: true, treatment: "outline" as const }]
      : template === "geography"
        ? [{ id: "starter.label.region", text: "未命名区域", layerId: "layer.terrain", x: 50, y: 12, fontSize: 20, fontWeight: 700 as const, align: "center" as const, rotation: 0, visible: true, treatment: "outline" as const }]
        : [];
  return { template, layers, drawings, labels };
}

type DrawingContentProps = { drawings: MapDrawing[]; labels: MapLabel[]; visibleLayerIds: Set<string>; selectedId?: string | null; onSelect?: (id: string) => void; compact?: boolean };

/** The same geometry projection is used by the editor, atlas and alignment. */
export function MapDrawingContent(props: DrawingContentProps) {
  const visible = props.drawings.filter((item) => props.visibleLayerIds.has(item.layerId));
  const occupied: Array<{x:number;y:number}> = [];
  return <g className={props.compact ? "map-content-compact" : ""}>
    {visible.map((item) => {
      const point = labelPoint(item.points);
      const showName = item.id === props.selectedId || !occupied.some((other) => Math.abs(other.x-point.x)<15 && Math.abs(other.y-point.y)<7);
      if (showName) occupied.push(point);
      return <Drawing key={item.id} drawing={item} selected={item.id === props.selectedId} showName={showName && !props.compact} onSelect={props.onSelect ? () => props.onSelect!(item.id) : undefined} />;
    })}
    {!props.compact && props.labels.filter((item) => item.visible && props.visibleLayerIds.has(item.layerId)).map((item) => <text key={item.id} className={`map-authoring-label is-${item.treatment}`} x={item.x} y={item.y} fontSize={Math.min(3, item.fontSize / 6)} fontWeight={item.fontWeight} textAnchor={item.align === "left" ? "start" : item.align === "right" ? "end" : "middle"} transform={`rotate(${item.rotation} ${item.x} ${item.y})`}>{item.text}</text>)}
  </g>;
}

export function MapDrawingOverlay(props: DrawingContentProps & { draft: Array<{ x: number; y: number }>; draftKind: MapAuthoringTool; authoring: boolean }) {
  return <svg className={`map-authoring-overlay${props.authoring ? " is-authoring" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="地图绘图内容">
    <MapDrawingContent {...props} />
    {props.draft.length ? <polyline className="map-authoring-draft" points={props.draft.map(pointText).join(" ")} fill={props.draftKind === "area" ? "#49a99b" : "none"} fillOpacity=".18" /> : null}
  </svg>;
}

/** Legacy background offsets are display pixels; the owner contract has no unit discriminator. */
export function MapBackgroundContent(props: { content: MapContent; projectId: string }) {
  return <g className="map-background-content">
    {props.content.backgrounds.filter((background) => background.visible && background.id === props.content.activeBackgroundId).map((background) => <image key={background.id} href={visualAssetUrl(props.projectId, background.assetPath)} width="100" height="100" preserveAspectRatio="none" opacity={background.opacity} style={{transform:`translate(${background.transform.x}px, ${background.transform.y}px) rotate(${background.transform.rotation}deg) scale(${background.transform.scale})`,transformOrigin:"center",transformBox:"fill-box"}} />)}
  </g>;
}

export function MapReadOnlyContent(props: { content: MapContent; projectId: string; compact?: boolean }) {
  const visibleLayerIds = new Set(props.content.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  return <g className="map-readonly-content">
    <MapBackgroundContent content={props.content} projectId={props.projectId} />
    <MapDrawingContent drawings={[...props.content.drawings].sort((a,b) => props.content.layers.findIndex((l)=>l.id===a.layerId)-props.content.layers.findIndex((l)=>l.id===b.layerId))} labels={props.content.labels} visibleLayerIds={visibleLayerIds} compact={props.compact} />
    {props.content.regions.filter((r)=>visibleLayerIds.has(r.layerId)).map((r)=><polygon key={r.id} points={r.points.map(pointText).join(" ")} fill={r.fillColor} fillOpacity={r.fillOpacity} stroke={r.strokeColor} strokeWidth=".4" />)}
    {props.content.markers.filter((m)=>visibleLayerIds.has(m.layerId)).map((m)=><circle key={m.id} cx={m.x} cy={m.y} r="1" fill={m.color} />)}
  </g>;
}

function Drawing(props: { drawing: MapDrawing; selected: boolean; showName?: boolean; onSelect?: () => void }) {
  const item = props.drawing;
  const common = {
    className: `map-drawing is-${item.kind} is-${item.subtype}${props.selected ? " is-selected" : ""}`,
    "data-drawing-id": item.id,
    role: props.onSelect ? "button" : undefined,
    tabIndex: props.onSelect ? 0 : undefined,
    "aria-label": item.label ? `地图图示：${item.label}` : `地图图示：${item.subtype}`,
    onClick: props.onSelect ? (event: MouseEvent) => { event.stopPropagation(); props.onSelect?.(); } : undefined,
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect?.(); } }
  };
  const name = item.label ? props.showName !== false ? <DrawingName drawing={item} /> : <title>{item.label}</title> : null;
  if (item.kind === "symbol") {
    const point = item.points[0]!;
    if (item.subtype === "planet") return <g {...common}><g transform={`translate(${point.x} ${point.y})`}><circle r={item.size / 2} fill={item.fillColor} stroke={item.strokeColor} strokeWidth=".55" /><ellipse rx={item.size * .7} ry={item.size * .18} fill="none" stroke={item.strokeColor} strokeWidth=".45" transform="rotate(-18)" /></g>{name}</g>;
    if (item.subtype === "building") return <g {...common}><g transform={`translate(${point.x} ${point.y})`}><rect x={-item.size / 2} y={-item.size / 2} width={item.size} height={item.size} rx=".5" fill={item.fillColor} stroke={item.strokeColor} strokeWidth=".55" /><path d={`M ${-item.size * .65} ${-item.size / 2} L 0 ${-item.size} L ${item.size * .65} ${-item.size / 2}`} fill="none" stroke={item.strokeColor} strokeWidth=".55" /></g>{name}</g>;
    if (item.subtype === "door") return <g {...common}><g transform={`translate(${point.x} ${point.y}) rotate(${item.rotation})`}><path d={`M ${-item.size / 2} ${item.size / 2} V ${-item.size / 2} H ${item.size / 2}`} fill="none" stroke={item.strokeColor} strokeWidth=".65" /><path d={`M ${-item.size / 2} ${item.size / 2} A ${item.size} ${item.size} 0 0 1 ${item.size / 2} ${-item.size / 2}`} fill="none" stroke={item.strokeColor} strokeWidth=".28" strokeDasharray=".7 .45" /></g>{name}</g>;
    return <g {...common}><g transform={`translate(${point.x} ${point.y}) rotate(${item.rotation})`}><path d="M -2 2 L 0 -2 L 2 2 Z" fill={item.fillColor} stroke={item.strokeColor} vectorEffect="non-scaling-stroke" /></g>{name}</g>;
  }
  if (item.kind === "area") return <g {...common}><polygon points={item.points.map(pointText).join(" ")} fill={item.fillColor} fillOpacity={item.fillOpacity} stroke={item.strokeColor} strokeWidth={item.width / 4} vectorEffect="non-scaling-stroke" />{name}</g>;
  if (item.kind === "terrain" && item.subtype === "land") return <g {...common}><polygon points={item.points.map(pointText).join(" ")} fill={item.fillColor} fillOpacity={Math.max(item.fillOpacity, .72)} stroke={item.strokeColor} strokeWidth={item.width / 4} strokeLinejoin="round" />{name}</g>;
  if (item.kind === "terrain" && (item.subtype === "forest" || item.subtype === "mountain")) return <g {...common}><polyline className="map-terrain-brush-path" points={item.points.map(pointText).join(" ")} fill="none" stroke={item.fillColor} strokeOpacity=".18" strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" />{resamplePath(item.points, Math.max(2.2, 7 - item.width / 3)).map((point, index) => item.subtype === "forest" ? <path key={index} d={`M ${point.x - 1.2} ${point.y + 1.3} L ${point.x} ${point.y - 1.5} L ${point.x + 1.2} ${point.y + 1.3} Z M ${point.x} ${point.y + 1.3} V ${point.y + 2.1}`} fill={item.fillColor} stroke={item.strokeColor} strokeWidth=".2" /> : <path key={index} d={`M ${point.x - 1.8} ${point.y + 1.2} L ${point.x} ${point.y - 1.8} L ${point.x + 1.8} ${point.y + 1.2} M ${point.x - .5} ${point.y - .95} L ${point.x + .15} ${point.y - .2}`} fill="none" stroke={item.strokeColor} strokeWidth=".5" />)}{name}</g>;
  return <g {...common}><polyline points={item.points.map(pointText).join(" ")} fill="none" stroke={item.strokeColor} strokeWidth={item.width / 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />{name}</g>;
}

const pointText = (point: { x: number; y: number }) => `${point.x},${point.y}`;
function DrawingName(props: { drawing: MapDrawing }): ReactNode {
  const point = labelPoint(props.drawing.points);
  return <text className="map-drawing-name" x={point.x} y={point.y - Math.max(2.4, props.drawing.size / 2 + .8)} textAnchor="middle">{props.drawing.label}</text>;
}

function labelPoint(points: Array<{ x: number; y: number }>) {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function resamplePath(points: Array<{ x: number; y: number }>, spacing: number) {
  const result = [points[0]!];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!; const end = points[index + 1]!;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.floor(distance / spacing));
    for (let step = 1; step <= steps; step += 1) result.push({ x: start.x + ((end.x - start.x) * step) / steps, y: start.y + ((end.y - start.y) * step) / steps });
  }
  return result;
}
