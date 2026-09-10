import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { createVisualDocument, getVerifiedCanonEvent, getVisualWorkbench, getWorldLibrary, listRelations, readWorldStateN4, updateVisualDocument, type MapDocument, type WorldObject, type WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

type EventObservation = { kind: "event"; eventId: string; eventRevision: string; observedAt: string };
type Observation = { kind: "current" } | EventObservation;
type MapInspectorData = {
  state: Awaited<ReturnType<typeof readWorldStateN4>>["projection"];
  relations: readonly RelationReadProjectionR0[];
  unlocatedRelationCount: number;
  events: readonly WorldObject[];
  unavailableEventCount: number;
  labels: ReadonlyMap<string, string>;
};

/** Author-facing spatial layout only. Location facts remain with their existing Owners. */
export function MapM1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const [maps, setMaps] = useState<MapDocument[]>([]);
  const [locations, setLocations] = useState<WorldObjectSummary[]>([]);
  const [mapId, setMapId] = useState(() => route().mapId);
  const [selectedId, setSelectedId] = useState<string | null>(() => route().placeId);
  const [observation, setObservation] = useState<Observation>(() => observationFromRoute());
  const [inspector, setInspector] = useState<MapInspectorData | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [message, setMessage] = useState("");
  const map = maps.find((item) => item.id === mapId) ?? null;

  const refresh = async (id: string) => {
    const [library, workbench] = await Promise.all([getWorldLibrary(id), getVisualWorkbench(id)]);
    if (props.runtime.project?.id !== id) return;
    const nextMaps = workbench.documents.filter((item): item is MapDocument => item.type === "map");
    setLocations(library.objects.filter((item) => item.type === "location" && item.status !== "archived"));
    setMaps(nextMaps);
    const requested = route().mapId;
    if (requested && !nextMaps.some((item) => item.id === requested)) {
      setMessage("请求的地图已不存在或不属于当前作品；没有改为打开另一张地图。");
      setMapId(null);
    } else if (requested) setMapId(requested);
    else if (nextMaps.length === 1) setMapId(nextMaps[0]!.id);
  };

  useEffect(() => {
    setMaps([]); setLocations([]); setMapId(route().mapId); setSelectedId(route().placeId); setObservation(observationFromRoute());
    setInspector(null); setInspectorError(null); setMessage("");
    if (projectId) void refresh(projectId).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图读取失败。"));
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setInspector(null); setInspectorError(null);
    if (!projectId || !selectedId || !workVersionId) return;
    const scope = `${projectId}:${workVersionId}:${selectedId}:${observationKey(observation)}`;
    void readMapInspector({ projectId, workVersionId, locationId: selectedId, observation }).then((next) => {
      if (active && scope === `${props.runtime.project?.id ?? ""}:${props.runtime.workVersionId ?? ""}:${selectedId}:${observationKey(observation)}`) setInspector(next);
    }).catch((error: unknown) => {
      if (active && scope === `${props.runtime.project?.id ?? ""}:${props.runtime.workVersionId ?? ""}:${selectedId}:${observationKey(observation)}`) setInspectorError(error instanceof Error ? error.message : "地点检查器暂时无法读取；没有把失败当作未知状态。");
    });
    return () => { active = false; };
  }, [projectId, selectedId, workVersionId, observation]);

  const nodes = useMemo(() => observationNodes(inspector?.state.history ?? []), [inspector?.state.history]);
  const saveRoute = (next: Partial<{ mapId: string | null; placeId: string | null; observation: Observation }>) => {
    const current = route(); const params = new URLSearchParams(window.location.search);
    setQuery(params, "mapId", next.mapId === undefined ? current.mapId : next.mapId);
    setQuery(params, "mapPlace", next.placeId === undefined ? current.placeId : next.placeId);
    writeObservation(params, next.observation === undefined ? observationFromRoute() : next.observation);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };
  const selectMap = (id: string) => { setMapId(id || null); saveRoute({ mapId: id || null }); };
  const selectPlace = (id: string) => { setSelectedId(id); saveRoute({ placeId: id }); };
  const selectObservation = (next: Observation) => { setObservation(next); saveRoute({ observation: next }); };
  const create = () => { setBusy(true); void props.runtime.withConnection((token) => createVisualDocument({ projectId: projectId!, type: "map", title: "地点示意图", token })).then((next) => { setMaps((current) => [...current, next as MapDocument]); setMapId((next as MapDocument).id); saveRoute({ mapId: (next as MapDocument).id }); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图创建失败。")).finally(() => setBusy(false)); };
  const place = (location: WorldObjectSummary, event: MouseEvent<HTMLElement>) => {
    if (!map || busy || !editingLayout) return;
    const box = event.currentTarget.getBoundingClientRect(); const marker = map.content.markers.find((item) => item.objectId === location.id);
    const x = Math.round(((event.clientX - box.left) / box.width) * 1000) / 10; const y = Math.round(((event.clientY - box.top) / box.height) * 1000) / 10;
    const document: MapDocument = { ...map, content: { ...map.content, markers: marker ? map.content.markers.map((item) => item.id === marker.id ? { ...item, x, y } : item) : [...map.content.markers, { id: `marker.${location.id}`, objectId: location.id, layerId: "layer.main", x, y, color: "#147d78", labelMode: "always" }] } };
    setBusy(true); void props.runtime.withConnection((token) => updateVisualDocument({ projectId: projectId!, relativePath: map.relativePath, expectedHash: map.contentHash, document, token })).then((next) => { setMaps((current) => current.map((item) => item.id === map.id ? next.document as MapDocument : item)); setMessage("布局已保存；地点事实、关系与角色记忆未被改写。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "布局保存冲突，请刷新后重试。")).finally(() => setBusy(false));
  };

  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  const selected = locations.find((item) => item.id === selectedId) || null;
  return <main className="shell-workspace" aria-label="地点地图"><section className="shell-workspace-stage" data-testid="map-m2-workspace"><p className="shell-workspace-eyebrow">世界 · 地点地图</p><h1>地点地图</h1><p className="shell-workspace-summary">默认浏览。只有进入布局编辑后才会移动地点；地图读取不会改变世界事实或角色知情范围。</p>{message ? <p className="creation-source-message" role="status">{message}</p> : null}
    {!maps.length ? <button type="button" className="primary-action" disabled={busy} onClick={create}>建立地点示意图</button> : <><div className="map-m2-toolbar"><label>地图<select aria-label="选择地图" value={mapId ?? ""} onChange={(event) => selectMap(event.target.value)}>{!mapId ? <option value="">请选择地图</option> : null}{maps.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>故事观察位置<select aria-label="选择故事观察位置" value={observationKey(observation)} onChange={(event) => { const next = nodes.find((item) => observationKey(item) === event.target.value); if (next) selectObservation(next); }}><option value="current">当前状态（不是系统时间）</option>{nodes.map((node) => <option key={observationKey(node)} value={observationKey(node)}>事件之后 · {eventLabel(inspector?.events ?? [], node.eventId)}</option>)}</select></label><button type="button" aria-pressed={editingLayout} onClick={() => setEditingLayout((value) => !value)}>{editingLayout ? "完成布局编辑" : "编辑布局"}</button></div>
      {!map ? <p role="alert">请选择一张可用地图；没有自动跳转到第一张地图。</p> : <><div className="creation-source-summary"><article><div><small>当前地图</small><strong>{map.title}</strong><span>{map.content.markers.length} 个已放置地点</span></div></article><article><div><small>正式地点</small><strong>{locations.length}</strong><span>未放置地点仍可选择</span></div></article><article><div><small>读取范围</small><strong>{props.runtime.workVersionLabel ?? "正在读取版本"}</strong><span>{observation.kind === "current" ? "当前 Owner 状态" : "所选已确认事件之后"}</span></div></article></div><div className="map-m1-layout"><section className={`map-m1-canvas ${editingLayout ? "is-editing" : "is-browsing"}`} aria-label="地点示意图画布" onClick={(event) => selected && place(selected, event)}>{map.content.markers.map((marker) => { const location = locations.find((item) => item.id === marker.objectId); return location ? <button key={marker.id} type="button" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-pressed={selectedId === location.id} onClick={(event) => { event.stopPropagation(); selectPlace(location.id); }}>{location.title}</button> : null; })}<p>{editingLayout ? "选择地点后点击画布保存布局位置。" : "浏览模式：点击地点查看；点击空白不会移动地点。"}</p></section><MapInspector selected={selected} data={inspector} error={inspectorError} versionReady={Boolean(workVersionId)} projectId={projectId} workVersionId={workVersionId} mapId={map.id} observation={observation} /></div><section className="creation-source-package" aria-label="地点"><h2>地点</h2><ul>{locations.map((location) => <li key={location.id}><button type="button" onClick={() => selectPlace(location.id)}>选择 {location.title}</button>{map.content.markers.some((marker) => marker.objectId === location.id) ? " · 已放置" : " · 尚未放置"}</li>)}</ul></section></>}</>}</section></main>;
}

async function readMapInspector(input: { projectId: string; workVersionId: string; locationId: string; observation: Observation }): Promise<MapInspectorData> {
  const stateRead = await readWorldStateN4({ projectId: input.projectId, objectId: input.locationId, workVersionId: input.workVersionId, ...(input.observation.kind === "current" ? { observation: "current" } : { observedAt: input.observation.observedAt }) });
  if (stateRead.projectId !== input.projectId || stateRead.objectId !== input.locationId || stateRead.workVersionId !== input.workVersionId) throw new Error("地点状态返回了不匹配的作品或版本。");
  const [relationRead, library] = await Promise.all([listRelations({ projectId: input.projectId, workVersionId: input.workVersionId, objectId: input.locationId, reviewState: "confirmed" }), getWorldLibrary(input.projectId)]);
  const observedAt = input.observation.kind === "event" ? input.observation.observedAt : null;
  const relations = observedAt ? relationRead.relations.filter((relation) => relationAt(relation, observedAt)) : relationRead.relations.filter((relation) => !relation.archived);
  const unlocatedRelationCount = observedAt ? relationRead.relations.filter((relation) => !relation.temporal?.validFrom).length : 0;
  const refs = uniqueEventRefs([...stateRead.projection.history.map((change) => change.evidence.event), ...relationRead.relations.flatMap((relation) => relation.evidenceRefs.filter((ref) => ref.kind === "confirmed-event").flatMap((ref) => { const reference = ref.reference as { eventId?: string; revision?: string } | undefined; return reference?.eventId && reference.revision ? [{ id: reference.eventId, revision: reference.revision }] : []; }))]);
  const reads = await Promise.all(refs.map(async (reference) => ({ reference, read: await getVerifiedCanonEvent(input.projectId, reference.id, input.workVersionId) })));
  const events = reads.flatMap(({ reference, read }) => read.status === "ready" && read.event.revisionToken === reference.revision ? [read.event] : []);
  return { state: stateRead.projection, relations, unlocatedRelationCount, events, unavailableEventCount: reads.length - events.length, labels: new Map(library.objects.map((item) => [item.id, item.title])) };
}

function MapInspector(props: { selected: WorldObjectSummary | null; data: MapInspectorData | null; error: string | null; versionReady: boolean; projectId: string; workVersionId: string | null; mapId: string; observation: Observation }) {
  const openSource = (eventId: string, relationId?: string) => { const parameters = new URLSearchParams({ projectId: props.projectId, ...(props.workVersionId ? { workVersionId: props.workVersionId } : {}), mapReturn: `${window.location.pathname}${window.location.search}`, ...(relationId ? { eventTask: "relationship", relationId } : { eventId }) }); window.location.assign(`/event-line?${parameters.toString()}`); };
  if (!props.selected) return <aside className="map-m1-inspector" aria-label="地点检查器"><h2>选择地点</h2><p>选择一个正式地点后查看此版本、此故事位置的已有资料。</p></aside>;
  if (!props.versionReady) return <aside className="map-m1-inspector" aria-label="地点检查器" aria-busy="true"><h2>{props.selected.title}</h2><p>正在确定当前作品版本；不会以另一个版本的状态替代。</p></aside>;
  if (props.error) return <aside className="map-m1-inspector" aria-label="地点检查器" role="alert"><h2>{props.selected.title}</h2><p>{props.error}</p></aside>;
  if (!props.data) return <aside className="map-m1-inspector" aria-label="地点检查器" aria-busy="true"><h2>{props.selected.title}</h2><p>正在读取同一版本、同一观察位置的状态、关系与来源……</p></aside>;
  const data = props.data;
  const stateText = data.state.status === "unknown" ? "无法确定该观察位置的状态：尚无可用正式记录。" : describeWorldState(data.state.value, data.labels);
  return <aside className="map-m1-inspector" aria-label="地点检查器" data-testid="map-m2-inspector"><h2>{props.selected.title}</h2><section><h3>{props.observation.kind === "current" ? "当前状态" : "所选事件之后的状态"}</h3><p>{stateText}</p>{data.state.change ? <p><small>依据生效于 {data.state.effectiveFrom} · <button type="button" onClick={() => openSource(data.state.change!.evidence.event.id)}>查看支持事件</button></small></p> : null}</section><section><h3>局部正式关系</h3>{data.relations.length ? <ul>{data.relations.map((relation) => { const otherId = relation.sourceObjectId === props.selected!.id ? relation.targetObjectId : relation.sourceObjectId; return <li key={relation.relationId}><button type="button" onClick={() => openSource("", relation.relationId)}>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</button><small> · {data.labels.get(otherId) ?? "关联对象"}</small></li>; })}</ul> : <p>此观察位置没有可定位的已确认正式关系。</p>}{data.unlocatedRelationCount ? <small>{data.unlocatedRelationCount} 条关系缺少故事生效时间，未伪装成该节点的历史状态。</small> : null}</section><section><h3>支持事件</h3>{data.events.length ? <ul>{data.events.map((event) => <li key={event.id}><button type="button" onClick={() => openSource(event.id)}>{event.title}</button></li>)}</ul> : <p>当前范围没有可精确定位的正式事件。</p>}{data.unavailableEventCount ? <small>有 {data.unavailableEventCount} 条依据的版本修订无法在当前范围精确读取，未显示为另一版本正文。</small> : null}</section><section><h3>角色知情边界</h3><p>地图是作者视图。打开或切换观察位置不会写入任何角色的听闻、信念或记忆。</p></section><details><summary>技术详情</summary><code>{props.selected.id}</code><code>{props.mapId}</code><code>{observationKey(props.observation)}</code></details></aside>;
}

function observationNodes(history: MapInspectorData["state"]["history"]): EventObservation[] { return history.map((change) => ({ kind: "event" as const, eventId: change.evidence.event.id, eventRevision: change.evidence.event.revision, observedAt: change.effectiveAt })).filter((item, index, all) => all.findIndex((other) => observationKey(other) === observationKey(item)) === index); }
function observationKey(value: Observation): string { return value.kind === "current" ? "current" : `event:${value.eventId}:${value.eventRevision}:${value.observedAt}`; }
function observationFromRoute(): Observation { const params = new URLSearchParams(window.location.search); const eventId = params.get("mapObservationEvent"); const eventRevision = params.get("mapObservationRevision"); const observedAt = params.get("mapObservedAt"); return eventId && eventRevision && observedAt ? { kind: "event", eventId, eventRevision, observedAt } : { kind: "current" }; }
function route(): { mapId: string | null; placeId: string | null } { const params = new URLSearchParams(window.location.search); return { mapId: params.get("mapId"), placeId: params.get("mapPlace") }; }
function setQuery(params: URLSearchParams, key: string, value: string | null) { if (value) params.set(key, value); else params.delete(key); }
function writeObservation(params: URLSearchParams, value: Observation) { params.delete("mapObservationEvent"); params.delete("mapObservationRevision"); params.delete("mapObservedAt"); if (value.kind === "event") { params.set("mapObservationEvent", value.eventId); params.set("mapObservationRevision", value.eventRevision); params.set("mapObservedAt", value.observedAt); } }
function eventLabel(events: readonly WorldObject[], eventId: string): string { return events.find((event) => event.id === eventId)?.title ?? "已确认事件"; }
function relationAt(relation: RelationReadProjectionR0, observedAt: string): boolean { const temporal = relation.temporal; return Boolean(temporal?.validFrom && temporal.validFrom <= observedAt && (!temporal.validTo || temporal.validTo > observedAt) && !relation.archived); }
function uniqueEventRefs(values: Array<{ id: string; revision: string }>): Array<{ id: string; revision: string }> { return values.filter((value, index) => values.findIndex((other) => other.id === value.id && other.revision === value.revision) === index); }
function describeWorldState(value: MapInspectorData["state"]["value"], labels: ReadonlyMap<string, string>): string { if (!value) return "无法确定该观察位置的状态：尚无可用正式记录。"; if (value.kind === "passage") return value.state === "open" ? "通行状态：可通行。" : value.state === "closed" ? "通行状态：封闭。" : "通行状态：未知。"; if (value.state === "held" && value.holder) return `持有状态：由 ${labels.get(value.holder.id) ?? "已记录对象"} 持有。`; return value.state === "unheld" ? "持有状态：未持有。" : "持有状态：未知。"; }
