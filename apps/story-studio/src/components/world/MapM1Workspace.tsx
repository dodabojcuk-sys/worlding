import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { CircleHelp, DoorOpen, Eye, FileText, LocateFixed, LockKeyhole, MapPin, Minus, PanelRight, PencilRuler, Plus } from "lucide-react";

import { createVisualDocument, getVerifiedCanonEvent, getVisualWorkbench, getWorldLibrary, importVisualAsset, listRelationTypes, listRelations, readWorldStateN4, updateVisualDocument, visualAssetUrl, type MapBackground, type MapDocument, type RelationTypeDefinition, type WorldObject, type WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { relationActiveAtWorldTime, relationWorldTimeUnknownReason } from "../../../../../src/storyContracts/relationTemporalComparison.ts";
import { createTypedLocationStructureProjection, type LocationStructureKind } from "../../../../../src/storyContracts/storyStudioLocationTopology.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

type EventObservation = { kind: "event"; eventId: string; eventRevision: string; observedAt: string };
type Observation = { kind: "current" } | EventObservation;
type MapViewport = { x: number; y: number; zoom: number };
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
  const [relations, setRelations] = useState<RelationReadProjectionR0[]>([]);
  const [relationTypes, setRelationTypes] = useState<RelationTypeDefinition[]>([]);
  const [mapId, setMapId] = useState(() => route().mapId);
  const [selectedId, setSelectedId] = useState<string | null>(() => route().placeId);
  const [observation, setObservation] = useState<Observation>(() => observationFromRoute());
  const [viewport, setViewport] = useState<MapViewport>(() => viewportFromRoute());
  const [inspector, setInspector] = useState<MapInspectorData | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingLayout, setEditingLayout] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [message, setMessage] = useState("");
  const [mapTitle, setMapTitle] = useState("");
  const [structureKind, setStructureKind] = useState<LocationStructureKind>(() => route().structureKind);
  const backgroundInput = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; viewport: MapViewport; moved: boolean } | null>(null);
  const map = maps.find((item) => item.id === mapId) ?? null;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(canvas); update();
    return () => observer.disconnect();
  }, [map?.id]);

  const refresh = async (id: string, versionId: string | null) => {
    const [library, workbench, relationRead, typeRead] = await Promise.all([
      getWorldLibrary(id), getVisualWorkbench(id),
      versionId ? listRelations({ projectId: id, workVersionId: versionId, reviewState: "confirmed", includeArchived: false }) : Promise.resolve({ relations: [] as RelationReadProjectionR0[] }),
      listRelationTypes(id)
    ]);
    if (props.runtime.project?.id !== id) return;
    const nextMaps = workbench.documents.filter((item): item is MapDocument => item.type === "map");
    setLocations(library.objects.filter((item) => item.type === "location" && item.status !== "archived"));
    setMaps(nextMaps);
    setRelations(relationRead.relations);
    setRelationTypes(typeRead.types);
    const requested = route().mapId;
    if (requested && !nextMaps.some((item) => item.id === requested)) {
      setMessage("请求的地图已不存在或不属于当前作品；没有改为打开另一张地图。");
      setMapId(null);
    } else if (requested) setMapId(requested);
    else if (nextMaps.length === 1) setMapId(nextMaps[0]!.id);
  };

  useEffect(() => {
    setMaps([]); setLocations([]); setRelations([]); setRelationTypes([]); setMapId(route().mapId); setSelectedId(route().placeId); setObservation(observationFromRoute()); setViewport(viewportFromRoute()); setStructureKind(route().structureKind);
    setInspector(null); setInspectorError(null); setMessage("");
    if (projectId) void refresh(projectId, workVersionId).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图读取失败。"));
  }, [projectId, workVersionId]);

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
  const structure = useMemo(() => map ? createTypedLocationStructureProjection({ objects: locations, relations, rule: map.content.structure, kind: structureKind }) : null, [map, locations, relations, structureKind]);
  const saveRoute = (next: Partial<{ mapId: string | null; placeId: string | null; observation: Observation; viewport: MapViewport; structureKind: LocationStructureKind }>) => {
    const current = route(); const params = new URLSearchParams(window.location.search);
    setQuery(params, "mapId", next.mapId === undefined ? current.mapId : next.mapId);
    setQuery(params, "mapPlace", next.placeId === undefined ? current.placeId : next.placeId);
    writeObservation(params, next.observation === undefined ? observationFromRoute() : next.observation);
    writeViewport(params, next.viewport === undefined ? viewportFromRoute() : next.viewport);
    params.set("mapStructure", next.structureKind === undefined ? structureKind : next.structureKind);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };
  const selectMap = (id: string) => { setMapId(id || null); saveRoute({ mapId: id || null }); };
  useEffect(() => { setMapTitle(map?.title ?? ""); }, [map?.id, map?.title]);
  const selectPlace = (id: string) => { setSelectedId(id); saveRoute({ placeId: id }); };
  const selectObservation = (next: Observation) => { setObservation(next); saveRoute({ observation: next }); };
  const selectStructureKind = (next: LocationStructureKind) => { setStructureKind(next); saveRoute({ structureKind: next }); };
  const moveViewport = (next: MapViewport) => { const normalized = normalizeViewport(next); setViewport(normalized); saveRoute({ viewport: normalized }); };
  const create = () => { setBusy(true); void props.runtime.withConnection((token) => createVisualDocument({ projectId: projectId!, type: "map", title: "地点示意图", token })).then((next) => { setMaps((current) => [...current, next as MapDocument]); setMapId((next as MapDocument).id); saveRoute({ mapId: (next as MapDocument).id }); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图创建失败。")).finally(() => setBusy(false)); };
  const saveMap = (document: MapDocument, success: string, failure: string) => {
    if (!projectId || busy) return;
    const previous = map!;
    // Keep author controls responsive while the existing VisualDocument Owner
    // confirms the write. A rejected write restores the exact prior document.
    setMaps((current) => current.map((item) => item.id === previous.id ? document : item));
    setBusy(true);
    void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: previous.relativePath, expectedHash: previous.contentHash, document, token })).then((next) => {
      setMaps((current) => current.map((item) => item.id === previous.id ? next.document as MapDocument : item)); setBusy(false); setMessage(success);
    }).catch((error: unknown) => { setMaps((current) => current.map((item) => item.id === previous.id ? previous : item)); setBusy(false); setMessage(error instanceof Error ? error.message : failure); });
  };
  const saveScope = (scopeObjectId: string) => {
    if (!map) return;
    saveMap({ ...map, content: { ...map.content, scopeObjectId: scopeObjectId || null } }, "地图范围已保存；这只是本图阅读范围，不会写入地点包含关系。", "地图范围保存冲突，请刷新后重试。");
  };
  const toggleStructureType = (typeId: string) => {
    if (!map) return;
    const field = structureKind === "geography" ? "geographyRelationTypeIds" : "administrationRelationTypeIds";
    const current = map.content.structure[field];
    const next = current.includes(typeId) ? current.filter((id) => id !== typeId) : [...current, typeId].sort();
    saveMap({ ...map, content: { ...map.content, structure: { ...map.content.structure, [field]: next } } }, `${structureKind === "geography" ? "地理" : "行政"}结构规则已保存；只有明确选中的关系类型会被读取。`, "结构规则保存冲突，请刷新后重试。");
  };
  const openLocalMap = (scopeObjectId: string) => {
    const existing = maps.find((item) => item.content.scopeObjectId === scopeObjectId);
    if (existing) { selectMap(existing.id); return; }
    const scope = locations.find((location) => location.id === scopeObjectId);
    if (!scope || !projectId) return;
    setBusy(true);
    void props.runtime.withConnection(async (token) => {
      const created = await createVisualDocument({ projectId, type: "map", title: `${scope.title} · 局部地图`, token }) as MapDocument;
      return updateVisualDocument({ projectId, relativePath: created.relativePath, expectedHash: created.contentHash, document: { ...created, content: { ...created.content, scopeObjectId } }, token });
    }).then((next) => { const local = next.document as MapDocument; setMaps((current) => [...current, local]); selectMap(local.id); setMessage("局部地图已建立；尚未上传底图也可摆放地点。" ); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "建立局部地图失败；没有创建关系或地点事实。")).finally(() => setBusy(false));
  };
  const place = (location: WorldObjectSummary, event: MouseEvent<HTMLElement>) => {
    if (!map || busy || !editingLayout) return;
    const box = stageRef.current?.getBoundingClientRect(); if (!box?.width || !box.height) { setMessage("地图舞台尚未就绪；没有保存不准确的标记位置。"); return; } const marker = map.content.markers.find((item) => item.objectId === location.id);
    const x = Math.round(((event.clientX - box.left) / box.width) * 1000) / 10; const y = Math.round(((event.clientY - box.top) / box.height) * 1000) / 10;
    const document: MapDocument = { ...map, content: { ...map.content, markers: marker ? map.content.markers.map((item) => item.id === marker.id ? { ...item, x, y } : item) : [...map.content.markers, { id: `marker.${location.id}`, objectId: location.id, layerId: "layer.main", x, y, color: "#147d78", labelMode: "always" }] } };
    setBusy(true); void props.runtime.withConnection((token) => updateVisualDocument({ projectId: projectId!, relativePath: map.relativePath, expectedHash: map.contentHash, document, token })).then((next) => { setMaps((current) => current.map((item) => item.id === map.id ? next.document as MapDocument : item)); setMessage("布局已保存；地点事实、关系与角色记忆未被改写。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "布局保存冲突，请刷新后重试。")).finally(() => setBusy(false));
  };
  const saveMapTitle = () => {
    if (!map || !projectId || !mapTitle.trim() || mapTitle.trim() === map.title) return;
    const document: MapDocument = { ...map, title: mapTitle.trim() };
    setBusy(true); void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: map.relativePath, expectedHash: map.contentHash, document, token })).then((next) => { setMaps((current) => current.map((item) => item.id === map.id ? next.document as MapDocument : item)); setMessage("地图名称已保存；地点事实未被改写。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图名称保存冲突，请刷新后重试。" )).finally(() => setBusy(false));
  };
  const removeMarker = (locationId: string) => {
    if (!map || !projectId) return;
    const document: MapDocument = { ...map, content: { ...map.content, markers: map.content.markers.filter((item) => item.objectId !== locationId) } };
    setBusy(true); void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: map.relativePath, expectedHash: map.contentHash, document, token })).then((next) => { setMaps((current) => current.map((item) => item.id === map.id ? next.document as MapDocument : item)); setMessage("地点标记已移除；地点资料仍保留。" ); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "移除标记失败，请刷新后重试。" )).finally(() => setBusy(false));
  };
  const importBackground = (file: File | null) => {
    if (!file || !map || !projectId || busy) return;
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) { setMessage("底图仅支持 PNG、JPEG 或 WebP；没有上传任何文件。"); return; }
    const reader = new FileReader();
    reader.onerror = () => setMessage("无法读取所选底图；没有修改地图。");
    reader.onload = () => {
      if (typeof reader.result !== "string") { setMessage("无法读取所选底图；没有修改地图。"); return; }
      const base64 = reader.result.split(",", 2)[1];
      if (!base64) { setMessage("底图内容为空；没有修改地图。"); return; }
      const image = new Image();
      image.onerror = () => setMessage("所选文件不是可读取的图片；没有修改地图。");
      image.onload = () => {
        setBusy(true);
        void props.runtime.withConnection(async (token) => {
          const asset = await importVisualAsset({ projectId, category: "maps", filename: file.name, mimeType: file.type, base64, token });
          const background: MapBackground = { id: `background.${crypto.randomUUID()}`, title: file.name, assetPath: asset.relativePath, mimeType: asset.mimeType, width: image.naturalWidth, height: image.naturalHeight, opacity: 1, visible: true };
          const document: MapDocument = { ...map, content: { ...map.content, backgrounds: [...map.content.backgrounds, background], activeBackgroundId: background.id, baseImage: { assetPath: background.assetPath, mimeType: background.mimeType, width: background.width, height: background.height } } };
          return updateVisualDocument({ projectId, relativePath: map.relativePath, expectedHash: map.contentHash, document, token });
        }).then((next) => { setMaps((current) => current.map((item) => item.id === map.id ? next.document as MapDocument : item)); setMessage("底图已保存到此地图；地点事实和世界状态没有被改写。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "底图保存失败；没有修改地图。" )).finally(() => setBusy(false));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  const startPan = (event: PointerEvent<HTMLElement>) => {
    if (editingLayout || event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewport, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pan = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const x = active.viewport.x + event.clientX - active.x;
    const y = active.viewport.y + event.clientY - active.y;
    active.moved ||= Math.abs(event.clientX - active.x) > 3 || Math.abs(event.clientY - active.y) > 3;
    setViewport(normalizeViewport({ ...viewport, x, y }));
  };
  const endPan = (event: PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.moved) moveViewport({ ...active.viewport, x: active.viewport.x + event.clientX - active.x, y: active.viewport.y + event.clientY - active.y });
  };
  const zoomCanvas = (event: WheelEvent<HTMLElement>) => {
    if (editingLayout || event.ctrlKey || event.metaKey) return;
    moveViewport({ ...viewport, zoom: viewport.zoom + (event.deltaY < 0 ? .1 : -.1) });
  };

  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  const selected = locations.find((item) => item.id === selectedId) || null;
  const state = markerState(selected, inspector);
  const scopedChildren = structure && map?.content.scopeObjectId ? structure.childrenByParentId.get(map.content.scopeObjectId) ?? [] : [];
  const visibleLayerIds = new Set(map?.content.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []);
  const stageSize = fittedMapStage(canvasSize, map?.content.baseImage ?? null);
  return <main className="shell-workspace map-workbench-shell" aria-label="地点地图">
    <section className="map-workbench" data-testid="map-m2-workspace">
      <header className="map-workbench-toolbar">
        <div className="map-workbench-title"><MapPin aria-hidden="true" /><div><strong>地点地图</strong><span>{map?.content.markers.length ?? 0} 个已放置地点 · {props.runtime.workVersionLabel ?? (workVersionId ? "正在读取版本" : "尚未建立作品版本")}</span></div></div>
        <label>当前地图<select aria-label="选择地图" value={mapId ?? ""} onChange={(event) => selectMap(event.target.value)}>{!mapId ? <option value="">请选择地图</option> : null}{maps.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {map ? <label>地图名称<input aria-label="地图名称" value={mapTitle} onChange={(event) => setMapTitle(event.target.value)} onBlur={saveMapTitle} disabled={busy} /></label> : null}
        <div className="map-workbench-toolbar-actions">
          {map ? <><input ref={backgroundInput} className="map-background-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { importBackground(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /><button type="button" onClick={() => backgroundInput.current?.click()} disabled={busy}>底图</button></> : null}
          <button type="button" aria-pressed={editingLayout} onClick={() => setEditingLayout((value) => !value)}>{editingLayout ? <><Eye aria-hidden="true" />浏览地图</> : <><PencilRuler aria-hidden="true" />编辑布局</>}</button>
          <button type="button" aria-expanded={inspectorOpen} aria-controls="map-m2-inspector" onClick={() => setInspectorOpen((value) => !value)}><PanelRight aria-hidden="true" />{inspectorOpen ? "收起检查器" : "打开检查器"}</button>
        </div>
      </header>
      <div className="map-workbench-notice" aria-live="polite">{message ? <p className="map-workbench-message" role="status">{message}</p> : null}</div>
      {!maps.length ? <section className="map-workbench-empty"><h1>建立第一张地点地图</h1><p>地点布局只保存到地图，不会改变地点、关系或角色知情。</p><button type="button" className="primary-action" disabled={busy} onClick={create}>建立地点示意图</button></section> : !map ? <p className="map-workbench-message" role="alert">请选择一张可用地图；没有自动跳转到第一张地图。</p> : <>
        <div className={`map-workbench-body ${inspectorOpen ? "" : "is-inspector-collapsed"}`}>
          <section ref={canvasRef} className={`map-m1-canvas map-workbench-canvas ${editingLayout ? "is-editing" : "is-browsing"}`} aria-label="地点示意图画布" onClick={(event) => selected && place(selected, event)} onPointerDown={startPan} onPointerMove={pan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={zoomCanvas}>
            <div className="map-workbench-grid" aria-hidden="true" />
            <div className="map-m2-viewport" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
              <div ref={stageRef} className="map-workbench-stage" style={{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }}>
                {map.content.backgrounds.filter((background) => background.visible && background.id === map.content.activeBackgroundId).map((background) => <img key={background.id} className="map-workbench-background" src={visualAssetUrl(projectId, background.assetPath)} alt="" style={{ opacity: background.opacity }} draggable={false} />)}
                {map.content.markers.filter((marker) => visibleLayerIds.has(marker.layerId)).map((marker) => {
                const location = locations.find((item) => item.id === marker.objectId);
                const markerStateValue = location?.id === selected?.id ? state : "unloaded";
                return location ? <button key={marker.id} className={`map-workbench-marker is-${markerStateValue}`} data-state={markerStateValue} type="button" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-pressed={selectedId === location.id} onClick={(event) => { event.stopPropagation(); selectPlace(location.id); setInspectorOpen(true); }}>
                  <MarkerIcon state={markerStateValue} /><span>{location.title}</span><small>{markerStateLabel(markerStateValue)}</small>
                </button> : null;
                })}
              </div>
            </div>
            <div className="map-workbench-canvas-controls" aria-label="地图视角">
              <button type="button" onClick={() => moveViewport({ ...viewport, zoom: viewport.zoom + .15 })} aria-label="放大地图"><Plus aria-hidden="true" /></button>
              <span>{Math.round(viewport.zoom * 100)}%</span>
              <button type="button" onClick={() => moveViewport({ ...viewport, zoom: viewport.zoom - .15 })} aria-label="缩小地图"><Minus aria-hidden="true" /></button>
              <button type="button" onClick={() => moveViewport({ x: 0, y: 0, zoom: 1 })}><LocateFixed aria-hidden="true" />适配</button>
            </div>
            <p className="map-workbench-canvas-hint">{editingLayout ? "布局编辑：选择地点后点击画布保存位置。" : "浏览：拖动平移、滚轮缩放，点击地点查看。"}</p>
          </section>
          {inspectorOpen ? <MapInspector selected={selected} data={inspector} error={inspectorError} versionReady={Boolean(workVersionId)} projectId={projectId} workVersionId={workVersionId} mapId={map.id} observation={observation} scopeMap={() => selected && openLocalMap(selected.id)} /> : null}
        </div>
        <details className="map-structure-details" aria-label="地理与行政结构"><summary>空间结构 · {structureKind === "geography" ? "地理与空间" : "行政与管辖"}</summary><section className="map-structure-panel">
          <div className="map-structure-heading"><div><span>空间结构</span><strong>{structureKind === "geography" ? "地理与空间" : "行政与管辖"}</strong></div><div role="group" aria-label="结构视图"><button type="button" aria-pressed={structureKind === "geography"} onClick={() => selectStructureKind("geography")}>地理</button><button type="button" aria-pressed={structureKind === "administration"} onClick={() => selectStructureKind("administration")}>行政</button></div></div>
          <label>当前地图范围<select aria-label="地图范围" value={map.content.scopeObjectId ?? ""} onChange={(event) => saveScope(event.target.value)} disabled={busy}><option value="">整张地图（不指定范围）</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
          <div className="map-structure-types"><span>读取的正式关系类型</span>{relationTypes.filter((type) => type.lifecycle === "active").length ? relationTypes.filter((type) => type.lifecycle === "active").map((type) => <label key={type.relationTypeId}><input type="checkbox" checked={(structureKind === "geography" ? map.content.structure.geographyRelationTypeIds : map.content.structure.administrationRelationTypeIds).includes(type.relationTypeId)} onChange={() => toggleStructureType(type.relationTypeId)} disabled={busy} />{type.label}</label>) : <small>还没有可选关系类型。请先在关系页建立并确认类型；旧文本关系不会被自动归类。</small>}</div>
          <div className="map-structure-children"><span>{map.content.scopeObjectId ? "当前范围的直接对象" : "已确认的结构关系"}</span>{map.content.scopeObjectId ? scopedChildren.length ? scopedChildren.map((edge) => { const child = locations.find((location) => location.id === edge.sourceObjectId); return child ? <button key={edge.relationId} type="button" onClick={() => { selectPlace(child.id); setInspectorOpen(true); }}>{child.title}<small>{edge.label}</small></button> : null; }) : <small>此范围在当前结构中没有直接对象；可保留为空或在关系页建立明确关系。</small> : structure?.edges.length ? structure.edges.map((edge) => <small key={edge.relationId}>{locations.find((item) => item.id === edge.sourceObjectId)?.title ?? "未解析地点"} · {edge.label} · {locations.find((item) => item.id === edge.targetObjectId)?.title ?? "未解析地点"}</small>) : <small>尚未选择用于此结构的关系类型，因此不会根据文字标签猜测层级。</small>}</div>
          <div className="map-structure-layers"><span>图层显示</span>{map.content.layers.map((layer) => <label key={layer.id}><input type="checkbox" checked={layer.visible} onChange={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) } }, "图层显示已保存；没有改变地点或关系事实。", "图层显示保存冲突，请刷新后重试。")} disabled={busy} />{layer.title}</label>)}</div>
        </section></details>
        <footer className="map-workbench-story-strip" aria-label="故事观察位置">
          <div><span>故事节点</span><strong>{observation.kind === "current" ? "当前状态" : `${eventLabel(inspector?.events ?? [], observation.eventId)}之后`}</strong></div>
          <div className="map-workbench-story-nodes" role="tablist" aria-label="选择故事观察位置">
            <button type="button" role="tab" aria-selected={observation.kind === "current"} onClick={() => selectObservation({ kind: "current" })}>当前</button>
            {nodes.map((node) => <button key={observationKey(node)} type="button" role="tab" aria-selected={observationKey(node) === observationKey(observation)} onClick={() => selectObservation(node)}>{eventLabel(inspector?.events ?? [], node.eventId)}之后</button>)}
          </div>
          <label className="map-workbench-more-nodes">更多节点<select aria-label="选择故事观察位置" value={observationKey(observation)} onChange={(event) => { const next = event.target.value === "current" ? { kind: "current" } as Observation : nodes.find((item) => observationKey(item) === event.target.value); if (next) selectObservation(next); }}><option value="current">当前状态</option>{nodes.map((node) => <option key={observationKey(node)} value={observationKey(node)}>{eventLabel(inspector?.events ?? [], node.eventId)}之后</option>)}</select></label>
        </footer>
        <section className="map-workbench-places" aria-label="地点"><span>地点</span>{locations.map((location) => <span key={location.id}><button type="button" aria-pressed={location.id === selectedId} onClick={() => { selectPlace(location.id); setInspectorOpen(true); }}>{location.title}{map.content.markers.some((marker) => marker.objectId === location.id) ? "" : " · 未放置"}</button><button type="button" onClick={() => openLocalMap(location.id)}>局部图</button>{editingLayout && map.content.markers.some((marker) => marker.objectId === location.id) ? <button type="button" onClick={() => removeMarker(location.id)}>移除标记</button> : null}</span>)}</section>
        <details className="map-workbench-help"><summary>地图阅读与编辑说明</summary><p>观察位置只读取当前作品版本的既有事实；浏览、平移和缩放不会写入世界。只有“编辑布局”会保存地点在这张示意图中的位置。</p></details>
      </>}
    </section>
  </main>;
}

async function readMapInspector(input: { projectId: string; workVersionId: string; locationId: string; observation: Observation }): Promise<MapInspectorData> {
  const stateRead = await readWorldStateN4({ projectId: input.projectId, objectId: input.locationId, workVersionId: input.workVersionId, ...(input.observation.kind === "current" ? { observation: "current" } : { observedAt: input.observation.observedAt }) });
  if (stateRead.projectId !== input.projectId || stateRead.objectId !== input.locationId || stateRead.workVersionId !== input.workVersionId) throw new Error("地点状态返回了不匹配的作品或版本。");
  const [relationRead, library] = await Promise.all([listRelations({ projectId: input.projectId, workVersionId: input.workVersionId, objectId: input.locationId, reviewState: "confirmed", includeArchived: true }), getWorldLibrary(input.projectId)]);
  const observedAt = input.observation.kind === "event" ? input.observation.observedAt : null;
  const relations = observedAt ? relationRead.relations.filter((relation) => relationActiveAtWorldTime(relation, observedAt)) : relationRead.relations.filter((relation) => !relation.archived);
  const unlocatedRelationCount = observedAt ? relationRead.relations.filter((relation) => relationWorldTimeUnknownReason(relation) !== null).length : 0;
  const stateHistory = observedAt ? stateRead.projection.history.filter((change) => change.effectiveAt <= observedAt) : stateRead.projection.history;
  const refs = uniqueEventRefs([...stateHistory.map((change) => change.evidence.event), ...relationRead.relations.flatMap((relation) => relation.evidenceRefs.filter((ref) => ref.kind === "confirmed-event").flatMap((ref) => { const reference = ref.reference as { eventId?: string; revision?: string; revisionToken?: string } | undefined; const revision = reference?.revision ?? reference?.revisionToken; return reference?.eventId && revision ? [{ id: reference.eventId, revision }] : []; }))]);
  const reads = await Promise.all(refs.map(async (reference) => ({ reference, read: await getVerifiedCanonEvent(input.projectId, reference.id, input.workVersionId) })));
  const events = reads.flatMap(({ reference, read }) => read.status === "ready" && read.event.revisionToken === reference.revision ? [read.event] : []);
  return { state: stateRead.projection, relations, unlocatedRelationCount, events, unavailableEventCount: reads.length - events.length, labels: new Map(library.objects.map((item) => [item.id, item.title])) };
}

function MapInspector(props: { selected: WorldObjectSummary | null; data: MapInspectorData | null; error: string | null; versionReady: boolean; projectId: string; workVersionId: string | null; mapId: string; observation: Observation; scopeMap(): void }) {
  const openSource = (eventId: string, relationId?: string) => { const parameters = new URLSearchParams({ projectId: props.projectId, ...(props.workVersionId ? { workVersionId: props.workVersionId } : {}), mapReturn: `${window.location.pathname}${window.location.search}`, ...(relationId ? { eventTask: "relationship", relationId } : { directoryObject: eventId }) }); window.location.assign(`/event-line?${parameters.toString()}`); };
  const openRelations = () => { if (!props.selected) return; const parameters = new URLSearchParams({ worldView: "relations", relationCenter: props.selected.id, relationReturn: `${window.location.pathname}${window.location.search}`, ...(props.observation.kind === "event" ? { mapObservationEvent: props.observation.eventId, mapObservationRevision: props.observation.eventRevision, mapObservedAt: props.observation.observedAt, mapObservationLabel: eventLabel(props.data?.events ?? [], props.observation.eventId) } : {}) }); window.location.assign(`/world?${parameters.toString()}`); };
  if (!props.selected) return <aside id="map-m2-inspector" className="map-m1-inspector map-workbench-inspector" aria-label="地点检查器"><h2>选择地点</h2><p>选择一个正式地点后查看此版本、此故事位置的已有资料。</p></aside>;
  if (!props.versionReady) return <aside id="map-m2-inspector" className="map-m1-inspector map-workbench-inspector" aria-label="地点检查器"><h2>{props.selected.title}</h2><p>这个作品尚未建立可观察的作品版本。地点资料和布局仍可编辑；故事状态、正式关系与事件依据会在作者建立版本后显示，且不会借用其他版本。</p></aside>;
  if (props.error) return <aside id="map-m2-inspector" className="map-m1-inspector map-workbench-inspector" aria-label="地点检查器" role="alert"><h2>{props.selected.title}</h2><p>{props.error}</p></aside>;
  if (!props.data) return <aside id="map-m2-inspector" className="map-m1-inspector map-workbench-inspector" aria-label="地点检查器" aria-busy="true"><h2>{props.selected.title}</h2><p>正在读取同一版本、同一观察位置的状态、关系与来源……</p></aside>;
  const data = props.data;
  const stateText = data.state.status === "unknown" ? "无法确定该观察位置的状态：尚无可用正式记录。" : describeWorldState(data.state.value, data.labels);
  const evidence = data.state.change?.evidence.event ?? null;
  const currentEvidence = evidence ? data.events.find((event) => event.id === evidence.id && event.revisionToken === evidence.revision) ?? null : null;
  const relatedEvents = data.events.filter((event) => event.id !== currentEvidence?.id);
  return <aside id="map-m2-inspector" className="map-m1-inspector map-workbench-inspector" aria-label="地点检查器" data-testid="map-m2-inspector">
    <header><div><span>地点检查器</span><h2>{props.selected.title}</h2></div><span className={`map-workbench-state-chip is-${markerState(props.selected, data)}`}>{markerStateLabel(markerState(props.selected, data))}</span></header>
    <section><h3>{props.observation.kind === "current" ? "当前状态" : "所选节点之后"}</h3><p>{stateText}</p>{evidence ? <a className="map-workbench-source-link" href="#map-current-evidence"><FileText aria-hidden="true" />查看状态依据</a> : null}</section>
    <section id="map-current-evidence"><h3>当前状态依据</h3>{currentEvidence ? <article className="map-workbench-source-preview"><strong>{currentEvidence.title}</strong><p>{eventPreview(currentEvidence)}</p><button type="button" onClick={() => openSource(currentEvidence.id)}>打开完整事件</button></article> : evidence ? <p role="alert">当前状态依据在此版本中无法精确读取；没有以同名或其他事件替代。</p> : <p>当前状态没有可定位的正式事件依据。</p>}</section>
    {relatedEvents.length ? <details className="map-workbench-related-events"><summary>关联记录（{relatedEvents.length}）</summary><ul>{relatedEvents.map((event) => <li key={event.id}><button type="button" onClick={() => openSource(event.id)}>{event.title}</button></li>)}</ul></details> : null}
    {data.unavailableEventCount ? <small>有 {data.unavailableEventCount} 条依据的版本修订无法在当前范围精确读取，未显示为另一版本正文。</small> : null}
    <section><h3>局部正式关系</h3>{data.relations.length ? <ul>{data.relations.map((relation) => { const otherId = relation.sourceObjectId === props.selected!.id ? relation.targetObjectId : relation.sourceObjectId; return <li key={relation.relationId}><button type="button" onClick={() => openSource("", relation.relationId)}>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</button><small>{data.labels.get(otherId) ?? "关联对象"}</small></li>; })}</ul> : <p>此观察位置没有可定位的已确认正式关系。</p>}<button type="button" className="map-workbench-source-link" onClick={openRelations}>查看关系图</button><button type="button" className="map-workbench-source-link" onClick={props.scopeMap}>打开此地点的局部地图</button>{data.unlocatedRelationCount ? <small>{data.unlocatedRelationCount} 条关系缺少故事生效时间，未伪装成该节点的历史状态。</small> : null}</section>
    <details><summary>阅读范围与技术详情</summary><p>地图是作者视图；切换节点不会写入角色的听闻、信念或记忆。</p><code>{props.selected.id}</code><code>{props.mapId}</code><code>{observationKey(props.observation)}</code></details>
  </aside>;
}

function observationNodes(history: MapInspectorData["state"]["history"]): EventObservation[] { return history.map((change) => ({ kind: "event" as const, eventId: change.evidence.event.id, eventRevision: change.evidence.event.revision, observedAt: change.effectiveAt })).filter((item, index, all) => all.findIndex((other) => observationKey(other) === observationKey(item)) === index); }
function observationKey(value: Observation): string { return value.kind === "current" ? "current" : `event:${value.eventId}:${value.eventRevision}:${value.observedAt}`; }
function observationFromRoute(): Observation { const params = new URLSearchParams(window.location.search); const eventId = params.get("mapObservationEvent"); const eventRevision = params.get("mapObservationRevision"); const observedAt = params.get("mapObservedAt"); return eventId && eventRevision && observedAt ? { kind: "event", eventId, eventRevision, observedAt } : { kind: "current" }; }
function route(): { mapId: string | null; placeId: string | null; structureKind: LocationStructureKind } { const params = new URLSearchParams(window.location.search); return { mapId: params.get("mapId"), placeId: params.get("mapPlace"), structureKind: params.get("mapStructure") === "administration" ? "administration" : "geography" }; }
function setQuery(params: URLSearchParams, key: string, value: string | null) { if (value) params.set(key, value); else params.delete(key); }
function writeObservation(params: URLSearchParams, value: Observation) { params.delete("mapObservationEvent"); params.delete("mapObservationRevision"); params.delete("mapObservedAt"); if (value.kind === "event") { params.set("mapObservationEvent", value.eventId); params.set("mapObservationRevision", value.eventRevision); params.set("mapObservedAt", value.observedAt); } }
function viewportFromRoute(): MapViewport { const params = new URLSearchParams(window.location.search); return normalizeViewport({ x: Number(params.get("mapPanX") ?? 0), y: Number(params.get("mapPanY") ?? 0), zoom: Number(params.get("mapZoom") ?? 1) }); }
function normalizeViewport(value: MapViewport): MapViewport { return { x: Number.isFinite(value.x) ? Math.max(-720, Math.min(720, value.x)) : 0, y: Number.isFinite(value.y) ? Math.max(-480, Math.min(480, value.y)) : 0, zoom: Number.isFinite(value.zoom) ? Math.max(.6, Math.min(2, value.zoom)) : 1 }; }
function fittedMapStage(canvas: { width: number; height: number }, image: { width: number; height: number } | null): { width: number; height: number } { if (!canvas.width || !canvas.height || !image?.width || !image.height) return canvas; const scale = Math.min(canvas.width / image.width, canvas.height / image.height); return { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) }; }
function writeViewport(params: URLSearchParams, value: MapViewport) { const normalized = normalizeViewport(value); if (normalized.x) params.set("mapPanX", String(normalized.x)); else params.delete("mapPanX"); if (normalized.y) params.set("mapPanY", String(normalized.y)); else params.delete("mapPanY"); if (normalized.zoom !== 1) params.set("mapZoom", String(normalized.zoom)); else params.delete("mapZoom"); }
function eventLabel(events: readonly WorldObject[], eventId: string): string { return events.find((event) => event.id === eventId)?.title ?? "已确认事件"; }
function uniqueEventRefs(values: Array<{ id: string; revision: string }>): Array<{ id: string; revision: string }> { return values.filter((value, index) => values.findIndex((other) => other.id === value.id && other.revision === value.revision) === index); }
function describeWorldState(value: MapInspectorData["state"]["value"], labels: ReadonlyMap<string, string>): string { if (!value) return "无法确定该观察位置的状态：尚无可用正式记录。"; if (value.kind === "passage") return value.state === "open" ? "通行状态：可通行。" : value.state === "closed" ? "通行状态：封闭。" : "通行状态：未知。"; if (value.state === "held" && value.holder) return `持有状态：由 ${labels.get(value.holder.id) ?? "已记录对象"} 持有。`; return value.state === "unheld" ? "持有状态：未持有。" : "持有状态：未知。"; }
function eventPreview(event: WorldObject): string {
  const summary = event.tags.find((tag) => /^(?:观测摘要|摘要)[：:]/u.test(tag))?.replace(/^(?:观测摘要|摘要)[：:]/u, "").trim();
  return summary || "此事件没有作者摘要；请打开完整事件阅读已核验正文。";
}

type MarkerState = "open" | "closed" | "unknown" | "unloaded";
function markerState(_selected: WorldObjectSummary | null, data: MapInspectorData | null): MarkerState {
  if (!data || data.state.status === "unknown" || !data.state.value) return data ? "unknown" : "unloaded";
  if (data.state.value.kind !== "passage") return "unknown";
  return data.state.value.state === "open" ? "open" : data.state.value.state === "closed" ? "closed" : "unknown";
}
function markerStateLabel(state: MarkerState): string { return state === "open" ? "可通行" : state === "closed" ? "封闭" : state === "unknown" ? "未知" : "未读取"; }
function MarkerIcon(props: { state: MarkerState }) { return props.state === "open" ? <DoorOpen aria-hidden="true" /> : props.state === "closed" ? <LockKeyhole aria-hidden="true" /> : props.state === "unknown" ? <CircleHelp aria-hidden="true" /> : <MapPin aria-hidden="true" />; }
