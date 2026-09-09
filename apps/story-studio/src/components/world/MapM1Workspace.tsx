import { useEffect, useState, type MouseEvent } from "react";

import { createVisualDocument, getVisualWorkbench, getWorldLibrary, updateVisualDocument, type MapDocument, type WorldObjectSummary } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** Author-facing spatial layout only. Location facts remain with WorldState. */
export function MapM1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [map, setMap] = useState<MapDocument | null>(null);
  const [locations, setLocations] = useState<WorldObjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async (id: string) => {
    const [library, workbench] = await Promise.all([getWorldLibrary(id), getVisualWorkbench(id)]);
    if (props.runtime.project?.id !== id) return;
    setLocations(library.objects.filter((item) => item.type === "location" && item.status !== "archived"));
    setMap(workbench.documents.find((item): item is MapDocument => item.type === "map") || null);
  };
  useEffect(() => { setMap(null); setLocations([]); setSelectedId(null); setMessage(""); if (projectId) void refresh(projectId).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图读取失败。")); }, [projectId]);
  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  const create = () => { setBusy(true); void props.runtime.withConnection((token) => createVisualDocument({ projectId, type: "map", title: "地点示意图", token })).then((next) => setMap(next as MapDocument)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图创建失败。 ")).finally(() => setBusy(false)); };
  const place = (location: WorldObjectSummary, event: MouseEvent<HTMLElement>) => {
    if (!map || busy) return;
    const box = event.currentTarget.getBoundingClientRect();
    const marker = map.content.markers.find((item) => item.objectId === location.id);
    const x = Math.round(((event.clientX - box.left) / box.width) * 1000) / 10;
    const y = Math.round(((event.clientY - box.top) / box.height) * 1000) / 10;
    const document: MapDocument = { ...map, content: { ...map.content, markers: marker ? map.content.markers.map((item) => item.id === marker.id ? { ...item, x, y } : item) : [...map.content.markers, { id: `marker.${location.id}`, objectId: location.id, layerId: "layer.main", x, y, color: "#147d78", labelMode: "always" }] } };
    setBusy(true); void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: map.relativePath, expectedHash: map.contentHash, document, token })).then((next) => { setMap(next.document as MapDocument); setSelectedId(location.id); setMessage("布局已保存；地点事实未被改写。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "布局保存冲突，请刷新后重试。")).finally(() => setBusy(false));
  };
  const selected = locations.find((item) => item.id === selectedId) || null;
  return <main className="shell-workspace" aria-label="地点地图"><section className="shell-workspace-stage" data-testid="map-m1-workspace"><p className="shell-workspace-eyebrow">世界 · 空间示意</p><h1>地点地图</h1><p className="shell-workspace-summary">手工摆放仅保存地图布局，不推断通行、距离、人物位置或世界事实。</p>{message ? <p className="creation-source-message" role="status">{message}</p> : null}
    {!map ? <button type="button" className="primary-action" disabled={busy} onClick={create}>建立地点示意图</button> : <><div className="creation-source-summary"><article><div><small>当前地图</small><strong>{map.title}</strong><span>{map.content.markers.length} 个已放置地点</span></div></article><article><div><small>当前作品地点</small><strong>{locations.length}</strong><span>未放置地点仍显示在列表中</span></div></article></div><div className="map-m1-layout"><section className="map-m1-canvas" aria-label="地点示意图画布" onClick={(event) => selected && place(selected, event)}>{map.content.markers.map((marker) => { const location = locations.find((item) => item.id === marker.objectId); return location ? <button key={marker.id} type="button" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-pressed={selectedId === location.id} onClick={(event) => { event.stopPropagation(); setSelectedId(location.id); }}>{location.title}</button> : null; })}<p>先在下方选择地点，再在此处点击摆放或移动。</p></section><aside className="map-m1-inspector" aria-label="地点检查器"><h2>{selected ? selected.title : "选择地点"}</h2>{selected ? <><p>当前版本状态：未接入读投影时保持未知。</p><p>关联事件、关系和女娲依据将通过既有 Owner 投影接入；本切片不从地图坐标推断事实。</p><details><summary>技术详情</summary><code>{selected.id}</code></details></> : <p>选择一个正式地点后查看其既有资料。</p>}</aside></div><section className="creation-source-package" aria-label="未放置地点"><h2>地点</h2><ul>{locations.map((location) => <li key={location.id}><button type="button" onClick={() => setSelectedId(location.id)}>选择 {location.title}</button>{map.content.markers.some((marker) => marker.objectId === location.id) ? " · 已放置；在画布点击可移动" : " · 尚未放置"}</li>)}</ul></section></>}</section></main>;
}
