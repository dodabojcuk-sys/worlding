import type { MouseEvent } from "react";
import type { MapContent, MapDrawing, MapLabel } from "../../lib/localTransport";

export type MapAuthoringTool = "browse" | "terrain" | "line" | "area" | "symbol" | "label";

export const MAP_TOOL_OPTIONS: Record<Exclude<MapAuthoringTool, "browse" | "label">, Array<{ value: string; label: string }>> = {
  terrain: [{ value: "land", label: "陆地" }, { value: "water", label: "水域" }, { value: "forest", label: "森林" }, { value: "mountain", label: "山脉" }, { value: "sand", label: "沙地" }],
  line: [{ value: "river", label: "河流" }, { value: "road", label: "道路" }, { value: "wall", label: "墙体" }, { value: "connector", label: "连接示意" }],
  area: [{ value: "geography", label: "地理范围" }, { value: "district", label: "行政范围图示" }, { value: "room", label: "房间" }],
  symbol: [{ value: "settlement", label: "聚落" }, { value: "building", label: "建筑" }, { value: "entrance", label: "入口" }, { value: "planet", label: "星球" }]
};

export function createStarterContent(template: MapContent["template"]): Pick<MapContent, "template" | "layers" | "drawings" | "labels"> {
  const layers = template === "starfield"
    ? [{ id: "layer.stars", title: "星域", visible: true, locked: false }, { id: "layer.routes", title: "航线", visible: true, locked: false }, { id: "layer.main", title: "地点与资料", visible: true, locked: false }]
    : template === "building"
      ? [{ id: "layer.plan", title: "建筑平面", visible: true, locked: false }, { id: "layer.main", title: "地点与资料", visible: true, locked: false }]
      : [{ id: "layer.terrain", title: "地形", visible: true, locked: false }, { id: "layer.routes", title: "河流与道路", visible: true, locked: false }, { id: "layer.main", title: "地点与资料", visible: true, locked: false }];
  const drawing = (value: Partial<MapDrawing> & Pick<MapDrawing, "id" | "kind" | "subtype" | "layerId" | "points">): MapDrawing => ({ strokeColor: "#167b7a", fillColor: "#49a99b", fillOpacity: .24, width: 3, size: 4, seed: 1, rotation: 0, label: null, objectId: null, ...value });
  const drawings = template === "starfield" ? [
    drawing({ id: "starter.planet.1", kind: "symbol", subtype: "planet", layerId: "layer.stars", points: [{ x: 27, y: 42 }], size: 8, fillColor: "#d39b53" }),
    drawing({ id: "starter.planet.2", kind: "symbol", subtype: "planet", layerId: "layer.stars", points: [{ x: 70, y: 56 }], size: 6, fillColor: "#63c3b5" }),
    drawing({ id: "starter.route", kind: "line", subtype: "connector", layerId: "layer.routes", points: [{ x: 31, y: 44 }, { x: 66, y: 54 }], strokeColor: "#8ab7c7", width: 1.5 })
  ] : template === "building" ? [
    drawing({ id: "starter.floor", kind: "area", subtype: "room", layerId: "layer.plan", points: [{ x: 18, y: 18 }, { x: 82, y: 18 }, { x: 82, y: 80 }, { x: 18, y: 80 }], fillColor: "#e8dfcf", strokeColor: "#705c49", fillOpacity: .55, width: 2 }),
    drawing({ id: "starter.wall", kind: "line", subtype: "wall", layerId: "layer.plan", points: [{ x: 52, y: 18 }, { x: 52, y: 80 }], strokeColor: "#705c49", width: 3 })
  ] : template === "geography" ? [
    drawing({ id: "starter.coast", kind: "terrain", subtype: "land", layerId: "layer.terrain", points: [{ x: 18, y: 25 }, { x: 28, y: 18 }, { x: 48, y: 26 }, { x: 62, y: 20 }, { x: 82, y: 34 }, { x: 74, y: 76 }, { x: 35, y: 82 }, { x: 16, y: 62 }], fillColor: "#c9c89a", width: 18 }),
    drawing({ id: "starter.river", kind: "line", subtype: "river", layerId: "layer.routes", points: [{ x: 54, y: 20 }, { x: 50, y: 38 }, { x: 57, y: 58 }, { x: 64, y: 78 }], strokeColor: "#2f7f9b", width: 3 })
  ] : [];
  return { template, layers, drawings, labels: [] };
}

export function MapDrawingOverlay(props: { drawings: MapDrawing[]; labels: MapLabel[]; visibleLayerIds: Set<string>; selectedId: string | null; draft: Array<{ x: number; y: number }>; draftKind: MapAuthoringTool; authoring: boolean; onSelect: (id: string) => void }) {
  const visible = props.drawings.filter((item) => props.visibleLayerIds.has(item.layerId));
  return <svg className={`map-authoring-overlay${props.authoring ? " is-authoring" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="地图绘图内容">
    {visible.map((item) => <Drawing key={item.id} drawing={item} selected={item.id === props.selectedId} onSelect={() => props.onSelect(item.id)} />)}
    {props.labels.filter((item) => item.visible && props.visibleLayerIds.has(item.layerId)).map((item) => <text key={item.id} className={`map-authoring-label is-${item.treatment}`} x={item.x} y={item.y} fontSize={item.fontSize / 4} fontWeight={item.fontWeight} textAnchor={item.align === "left" ? "start" : item.align === "right" ? "end" : "middle"} transform={`rotate(${item.rotation} ${item.x} ${item.y})`}>{item.text}</text>)}
    {props.draft.length ? <polyline className="map-authoring-draft" points={props.draft.map(pointText).join(" ")} fill={props.draftKind === "area" ? "#49a99b" : "none"} fillOpacity=".18" /> : null}
  </svg>;
}

function Drawing(props: { drawing: MapDrawing; selected: boolean; onSelect: () => void }) {
  const item = props.drawing;
  const common = { className: `map-drawing is-${item.kind} is-${item.subtype}${props.selected ? " is-selected" : ""}`, onClick: (event: MouseEvent) => { event.stopPropagation(); props.onSelect(); } };
  if (item.kind === "symbol") {
    const point = item.points[0]!;
    if (item.subtype === "planet") return <g {...common} transform={`translate(${point.x} ${point.y})`}><circle r={item.size / 2} fill={item.fillColor} stroke={item.strokeColor} strokeWidth=".55" /><ellipse rx={item.size * .7} ry={item.size * .18} fill="none" stroke={item.strokeColor} strokeWidth=".45" transform="rotate(-18)" /></g>;
    if (item.subtype === "building") return <g {...common} transform={`translate(${point.x} ${point.y})`}><rect x={-item.size / 2} y={-item.size / 2} width={item.size} height={item.size} rx=".5" fill={item.fillColor} stroke={item.strokeColor} strokeWidth=".55" /><path d={`M ${-item.size * .65} ${-item.size / 2} L 0 ${-item.size} L ${item.size * .65} ${-item.size / 2}`} fill="none" stroke={item.strokeColor} strokeWidth=".55" /></g>;
    return <g {...common} transform={`translate(${point.x} ${point.y}) rotate(${item.rotation})`}><path d="M -2 2 L 0 -2 L 2 2 Z" fill={item.fillColor} stroke={item.strokeColor} vectorEffect="non-scaling-stroke" />{item.label ? <text y="5" textAnchor="middle">{item.label}</text> : null}</g>;
  }
  if (item.kind === "area") return <polygon {...common} points={item.points.map(pointText).join(" ")} fill={item.fillColor} fillOpacity={item.fillOpacity} stroke={item.strokeColor} strokeWidth={item.width / 4} vectorEffect="non-scaling-stroke" />;
  if (item.kind === "terrain" && item.subtype === "land") return <polygon {...common} points={item.points.map(pointText).join(" ")} fill={item.fillColor} fillOpacity={Math.max(item.fillOpacity, .72)} stroke={item.strokeColor} strokeWidth={item.width / 4} strokeLinejoin="round" />;
  if (item.kind === "terrain" && (item.subtype === "forest" || item.subtype === "mountain")) return <g {...common}>{samplePoints(item.points).map((point, index) => item.subtype === "forest" ? <path key={index} d={`M ${point.x - 1.2} ${point.y + 1.3} L ${point.x} ${point.y - 1.5} L ${point.x + 1.2} ${point.y + 1.3} Z`} fill={item.fillColor} stroke={item.strokeColor} strokeWidth=".2" /> : <path key={index} d={`M ${point.x - 1.8} ${point.y + 1.2} L ${point.x} ${point.y - 1.8} L ${point.x + 1.8} ${point.y + 1.2}`} fill="none" stroke={item.strokeColor} strokeWidth=".5" />)}</g>;
  return <polyline {...common} points={item.points.map(pointText).join(" ")} fill="none" stroke={item.strokeColor} strokeWidth={item.width / 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
}

const pointText = (point: { x: number; y: number }) => `${point.x},${point.y}`;
function samplePoints(points: Array<{ x: number; y: number }>) {
  return points.flatMap((point, index) => index === points.length - 1 ? [point] : [point, { x: (point.x + points[index + 1]!.x) / 2, y: (point.y + points[index + 1]!.y) / 2 }]);
}
