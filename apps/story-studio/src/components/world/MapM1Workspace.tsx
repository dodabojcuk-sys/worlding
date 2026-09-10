import { useEffect, useState, type MouseEvent } from "react";

import { createVisualDocument, getVerifiedCanonEventList, getVisualWorkbench, getWorldLibrary, listRelations, readWorldObject, readWorldStateN4, updateVisualDocument, type MapDocument, type WorldObject, type WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** Author-facing spatial layout only. Location facts remain with WorldState. */
export function MapM1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const [map, setMap] = useState<MapDocument | null>(null);
  const [locations, setLocations] = useState<WorldObjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspector, setInspector] = useState<MapInspectorData | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async (id: string) => {
    const [library, workbench] = await Promise.all([getWorldLibrary(id), getVisualWorkbench(id)]);
    if (props.runtime.project?.id !== id) return;
    setLocations(library.objects.filter((item) => item.type === "location" && item.status !== "archived"));
    setMap(workbench.documents.find((item): item is MapDocument => item.type === "map") || null);
  };
  useEffect(() => { setMap(null); setLocations([]); setSelectedId(null); setInspector(null); setInspectorError(null); setMessage(""); if (projectId) void refresh(projectId).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图读取失败。")); }, [projectId]);
  useEffect(() => {
    let active = true;
    setInspector(null);
    setInspectorError(null);
    if (!projectId || !selectedId || !workVersionId) return;
    const scope = `${projectId}:${workVersionId}:${selectedId}`;
    void readMapInspector({ projectId, workVersionId, locationId: selectedId }).then((next) => {
      if (active && scope === `${props.runtime.project?.id ?? ""}:${props.runtime.workVersionId ?? ""}:${selectedId}`) setInspector(next);
    }).catch((error: unknown) => {
      if (active && scope === `${props.runtime.project?.id ?? ""}:${props.runtime.workVersionId ?? ""}:${selectedId}`) setInspectorError(error instanceof Error ? error.message : "地点检查器暂时无法读取；没有把失败当作未知状态。");
    });
    return () => { active = false; };
  }, [locations, projectId, selectedId, workVersionId]);
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
    {!map ? <button type="button" className="primary-action" disabled={busy} onClick={create}>建立地点示意图</button> : <><div className="creation-source-summary"><article><div><small>当前地图</small><strong>{map.title}</strong><span>{map.content.markers.length} 个已放置地点</span></div></article><article><div><small>正式地点</small><strong>{locations.length}</strong><span>未放置地点仍显示在列表中</span></div></article><article><div><small>阅读范围</small><strong>{props.runtime.workVersionLabel ?? "正在读取版本"}</strong><span>布局跨版本复用；世界事实始终按此版本读取</span></div></article></div><div className="map-m1-layout"><section className="map-m1-canvas" aria-label="地点示意图画布" onClick={(event) => selected && place(selected, event)}>{map.content.markers.map((marker) => { const location = locations.find((item) => item.id === marker.objectId); return location ? <button key={marker.id} type="button" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-pressed={selectedId === location.id} onClick={(event) => { event.stopPropagation(); setSelectedId(location.id); }}>{location.title}</button> : null; })}<p>先在下方选择地点，再在此处点击摆放或移动。</p></section><MapInspector selected={selected} data={inspector} error={inspectorError} versionReady={Boolean(workVersionId)} /></div><section className="creation-source-package" aria-label="未放置地点"><h2>地点</h2><ul>{locations.map((location) => <li key={location.id}><button type="button" onClick={() => setSelectedId(location.id)}>选择 {location.title}</button>{map.content.markers.some((marker) => marker.objectId === location.id) ? " · 已放置；在画布点击可移动" : " · 尚未放置"}</li>)}</ul></section></>}</section></main>;
}

type MapInspectorData = { state: Awaited<ReturnType<typeof readWorldStateN4>>["projection"]; relations: readonly RelationReadProjectionR0[]; events: readonly WorldObject[]; labels: ReadonlyMap<string, string> };

async function readMapInspector(input: { projectId: string; workVersionId: string; locationId: string }): Promise<MapInspectorData> {
  const [stateRead, relationRead, canon, library] = await Promise.all([
    readWorldStateN4({ projectId: input.projectId, objectId: input.locationId, workVersionId: input.workVersionId }),
    listRelations({ projectId: input.projectId, workVersionId: input.workVersionId, objectId: input.locationId, reviewState: "confirmed" }),
    getVerifiedCanonEventList(input.projectId, input.workVersionId),
    getWorldLibrary(input.projectId)
  ]);
  if (stateRead.projectId !== input.projectId || stateRead.objectId !== input.locationId || stateRead.workVersionId !== input.workVersionId) throw new Error("地点状态返回了不匹配的作品或版本。");
  if (canon.status !== "ready") throw new Error(canon.error.message);
  const knownEventIds = new Set(canon.eventIds);
  const stateEventId = stateRead.projection.change?.evidence.event.id;
  const relationEventIds = relationRead.relations.flatMap((relation) => relation.evidenceRefs.filter((ref) => ref.kind === "confirmed-event").map((ref) => (ref.reference as { eventId?: string } | undefined)?.eventId).filter((eventId): eventId is string => Boolean(eventId)));
  const location = await readWorldObject(input.projectId, input.locationId);
  const linkedEventIds = [
    ...location.linkedObjects.filter((item) => item.type === "event").map((item) => item.id),
    ...(location.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []),
    ...(stateEventId ? [stateEventId] : []),
    ...relationEventIds
  ];
  const eventIds = [...new Set(linkedEventIds)].filter((id) => knownEventIds.has(id));
  const events = await Promise.all(eventIds.map((eventId) => readWorldObject(input.projectId, eventId)));
  return { state: stateRead.projection, relations: relationRead.relations, events: events.filter((event) => event.type === "event"), labels: new Map(library.objects.map((item) => [item.id, item.title])) };
}

function MapInspector(props: { selected: WorldObjectSummary | null; data: MapInspectorData | null; error: string | null; versionReady: boolean }) {
  const openEvent = (eventId: string) => window.location.assign(`/event-line?eventId=${encodeURIComponent(eventId)}`);
  const openRelation = (relationId: string) => window.location.assign(`/event-line?eventTask=relationship&relationId=${encodeURIComponent(relationId)}`);
  if (!props.selected) return <aside className="map-m1-inspector" aria-label="地点检查器"><h2>选择地点</h2><p>选择一个正式地点后查看其既有资料。</p></aside>;
  if (!props.versionReady) return <aside className="map-m1-inspector" aria-label="地点检查器" aria-busy="true"><h2>{props.selected.title}</h2><p>正在确定当前作品版本；不会以另一个版本的状态替代。</p></aside>;
  if (props.error) return <aside className="map-m1-inspector" aria-label="地点检查器" role="alert"><h2>{props.selected.title}</h2><p>{props.error}</p></aside>;
  if (!props.data) return <aside className="map-m1-inspector" aria-label="地点检查器" aria-busy="true"><h2>{props.selected.title}</h2><p>正在读取当前版本的地点状态、正式关系与可定位事件……</p></aside>;
  const data = props.data;
  const state = data.state;
  const stateText = state.status === "unknown" ? "未知：当前版本没有可用的状态记录。" : describeWorldState(state.value, data.labels);
  return <aside className="map-m1-inspector" aria-label="地点检查器" data-testid="map-m1-inspector"><h2>{props.selected.title}</h2><section><h3>当前版本状态</h3><p>{stateText}</p>{state.change ? <p><small>自 {state.effectiveFrom} 生效 · <button type="button" onClick={() => openEvent(state.change!.evidence.event.id)}>查看支持事件</button></small></p> : null}</section><section><h3>关联事件</h3>{data.events.length ? <ul>{data.events.map((event) => <li key={event.id}><button type="button" onClick={() => openEvent(event.id)}>{event.title}</button></li>)}</ul> : <p>当前版本没有可定位的正式事件；没有根据地图位置补造事件。</p>}</section><section><h3>局部正式关系</h3>{data.relations.length ? <ul>{data.relations.map((relation) => { const otherId = relation.sourceObjectId === props.selected!.id ? relation.targetObjectId : relation.sourceObjectId; return <li key={relation.relationId}><button type="button" onClick={() => openRelation(relation.relationId)}>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</button><small> · {data.labels.get(otherId) ?? "关联对象"}</small></li>; })}</ul> : <p>当前版本没有这处地点的已确认正式关系。</p>}</section><section><h3>女娲步骤依据</h3><p>地点检查器只显示已正式落入事件的来源；角色私下说法和听闻不会因地图打开而公开给所有角色。</p>{state.change ? <button type="button" onClick={() => openEvent(state.change!.evidence.event.id)}>从状态依据打开正式事件</button> : <p>当前没有可定位的状态依据。</p>}</section><details><summary>技术详情</summary><code>{props.selected.id}</code><code>{state.subjectId}</code></details></aside>;
}

function describeWorldState(value: MapInspectorData["state"]["value"], labels: ReadonlyMap<string, string>): string {
  if (!value) return "未知：当前版本没有可用的状态记录。";
  if (value.kind === "passage") return value.state === "open" ? "通行状态：可通行。" : value.state === "closed" ? "通行状态：封闭。" : "通行状态：未知。";
  if (value.state === "held" && value.holder) return `持有状态：由 ${labels.get(value.holder.id) ?? "已记录对象"} 持有。`;
  return value.state === "unheld" ? "持有状态：未持有。" : "持有状态：未知。";
}
