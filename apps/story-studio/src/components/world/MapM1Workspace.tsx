import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { ArrowLeft, CircleHelp, DoorOpen, Eye, FileText, LocateFixed, LockKeyhole, MapPin, Minus, PanelLeftClose, PanelRight, PencilRuler, Plus, Redo2, Trash2, Undo2 } from "lucide-react";

import { createVisualDocument, getVerifiedCanonEvent, getVisualWorkbench, getWorldLibrary, importVisualAsset, listRelationTypes, listRelations, readWorldStateN4, updateVisualDocument, visualAssetUrl, type MapBackground, type MapContent, type MapDocument, type MapDrawing, type RelationTypeDefinition, type WorldObject, type WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { relationActiveAtWorldTime, relationWorldTimeUnknownReason } from "../../../../../src/storyContracts/relationTemporalComparison.ts";
import { createTypedLocationStructureProjection, type LocationStructureKind } from "../../../../../src/storyContracts/storyStudioLocationTopology.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { createStarterContent, MAP_TOOL_OPTIONS, MapDrawingOverlay, type MapAuthoringTool } from "./mapAuthoring";

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

const ADMINISTRATION_LAYER_ID = "layer.administration";

function ensureAdministrationLayer(layers: MapDocument["content"]["layers"]): MapDocument["content"]["layers"] {
  return layers.some((layer) => layer.id === ADMINISTRATION_LAYER_ID)
    ? layers
    : [...layers, { id: ADMINISTRATION_LAYER_ID, title: "行政边界与名称", visible: true, locked: false }];
}

function regionCenter(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

/** Author-facing spatial layout only. Location facts remain with their existing Owners. */
export function MapM1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const materialReturn = safeReturn(new URLSearchParams(window.location.search).get("materialReturn"));
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
  const [authoringTool, setAuthoringTool] = useState<MapAuthoringTool>("browse");
  const [authoringSubtype, setAuthoringSubtype] = useState("land");
  const [authoringLabel, setAuthoringLabel] = useState("新标注");
  const [drawingLabelDraft, setDrawingLabelDraft] = useState("");
  const [activeLayerId, setActiveLayerId] = useState("layer.main");
  const [draftDrawingPoints, setDraftDrawingPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(() => route().mapElement);
  const [templateChoice, setTemplateChoice] = useState<MapContent["template"]>("geography");
  const [undoContents, setUndoContents] = useState<MapContent[]>([]);
  const [redoContents, setRedoContents] = useState<MapContent[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(() => Boolean(route().placeId));
  const [message, setMessage] = useState("");
  const [mapTitle, setMapTitle] = useState("");
  const [structureKind, setStructureKind] = useState<LocationStructureKind>(() => route().structureKind);
  const [structurePanelOpen, setStructurePanelOpen] = useState(false);
  const [editingRegionObjectId, setEditingRegionObjectId] = useState<string | null>(null);
  const [draftRegionPoints, setDraftRegionPoints] = useState<Array<{ x: number; y: number }>>([]);
  const backgroundInput = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const drag = useRef<{ pointerId: number; x: number; y: number; viewport: MapViewport; moved: boolean; drawingId: string | null } | null>(null);
  const terrainBrush = useRef<{ pointerId: number; points: Array<{ x: number; y: number }> } | null>(null);
  const suppressCanvasClick = useRef(false);
  const map = maps.find((item) => item.id === mapId) ?? null;
  const selectedDrawing = map?.content.drawings.find((item) => item.id === selectedDrawingId) ?? null;
  useEffect(() => {
    if (!map) return;
    if (!map.content.layers.some((layer) => layer.id === activeLayerId)) setActiveLayerId(map.content.layers[0]!.id);
    const requestedElement = route().mapElement;
    setUndoContents([]); setRedoContents([]); setDraftDrawingPoints([]); setSelectedDrawingId(requestedElement && map.content.drawings.some((item) => item.id === requestedElement) ? requestedElement : null); setAuthoringTool("browse");
  }, [map?.id]);

  useEffect(() => { setDrawingLabelDraft(selectedDrawing?.label ?? ""); }, [selectedDrawing?.id, selectedDrawing?.label]);

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
    setInspector(null); setInspectorError(null); setInspectorOpen(Boolean(route().placeId)); setMessage("");
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
  const administrationStructure = useMemo(() => map ? createTypedLocationStructureProjection({ objects: locations, relations, rule: map.content.structure, kind: "administration" }) : null, [map, locations, relations]);
  const saveRoute = (next: Partial<{ mapId: string | null; placeId: string | null; observation: Observation; viewport: MapViewport; structureKind: LocationStructureKind }>) => {
    const current = route(); const params = new URLSearchParams(window.location.search);
    setQuery(params, "mapId", next.mapId === undefined ? current.mapId : next.mapId);
    setQuery(params, "mapPlace", next.placeId === undefined ? current.placeId : next.placeId);
    writeObservation(params, next.observation === undefined ? observationFromRoute() : next.observation);
    writeViewport(params, next.viewport === undefined ? viewportFromRoute() : next.viewport);
    params.set("mapStructure", next.structureKind === undefined ? structureKind : next.structureKind);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };
  const selectMap = (id: string) => { setMapId(id || null); setSelectedId(null); setInspectorOpen(false); saveRoute({ mapId: id || null, placeId: null }); };
  const navigateToMap = (id: string) => {
    if (map && projectId) window.sessionStorage.setItem(`tianyan.map.viewport.${projectId}.${map.id}`, JSON.stringify(viewport));
    const stored = projectId ? window.sessionStorage.getItem(`tianyan.map.viewport.${projectId}.${id}`) : null;
    let nextViewport = { x: 0, y: 0, zoom: 1 };
    try { if (stored) nextViewport = normalizeViewport(JSON.parse(stored)); } catch { /* A broken local view preference is safely ignored. */ }
    setMapId(id); setViewport(nextViewport); saveRoute({ mapId: id, viewport: nextViewport, placeId: null }); setSelectedId(null);
  };
  useEffect(() => { setMapTitle(map?.title ?? ""); }, [map?.id, map?.title]);
  const selectPlace = (id: string) => { setSelectedId(id); saveRoute({ placeId: id }); };
  const selectObservation = (next: Observation) => { setObservation(next); if (selectedId) setInspectorOpen(true); saveRoute({ observation: next }); };
  const selectStructureKind = (next: LocationStructureKind) => { setStructureKind(next); saveRoute({ structureKind: next }); };
  const moveViewport = (next: MapViewport) => { const normalized = normalizeViewport(next); setViewport(normalized); saveRoute({ viewport: normalized }); };
  const create = () => { setBusy(true); void props.runtime.withConnection(async (token) => {
    const created = await createVisualDocument({ projectId: projectId!, type: "map", title: templateChoice === "starfield" ? "新星域" : templateChoice === "building" ? "建筑平面" : "地点示意图", token }) as MapDocument;
    const starter = createStarterContent(templateChoice);
    return updateVisualDocument({ projectId: projectId!, relativePath: created.relativePath, expectedHash: created.contentHash, document: { ...created, content: { ...created.content, ...starter } }, token });
  }).then((next) => { const created = next.document as MapDocument; setMaps((current) => [...current, created]); setMapId(created.id); setSelectedId(null); setInspectorOpen(false); setActiveLayerId(created.content.layers[0]!.id); saveRoute({ mapId: created.id, placeId: null }); setMessage("地图起点已建立；其中图形只是图示，不会自动成为世界事实。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图创建失败。")).finally(() => setBusy(false)); };
  const saveMap = (document: MapDocument, success: string, failure: string, after?: { success?: () => void; failure?: () => void }) => {
    if (!projectId || busy) return;
    const previous = map!;
    // Keep author controls responsive while the existing VisualDocument Owner
    // confirms the write. A rejected write restores the exact prior document.
    setMaps((current) => current.map((item) => item.id === previous.id ? document : item));
    setBusy(true);
    void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: previous.relativePath, expectedHash: previous.contentHash, document, token })).then((next) => {
      setMaps((current) => current.map((item) => item.id === previous.id ? next.document as MapDocument : item)); setBusy(false); setMessage(success); after?.success?.();
    }).catch((error: unknown) => { setMaps((current) => current.map((item) => item.id === previous.id ? previous : item)); setBusy(false); setMessage(error instanceof Error ? error.message : failure); after?.failure?.(); });
  };
  const saveAuthoringContent = (content: MapContent, success: string, after?: { success?: () => void; failure?: () => void }) => {
    if (!map || busy) return;
    setUndoContents((items) => [...items.slice(-39), map.content]);
    setRedoContents([]);
    saveMap({ ...map, content }, success, "地图绘制保存失败；画布已恢复到上一次持久化结果，未清空当前草稿。", { success: after?.success, failure: () => { setUndoContents((items) => items.slice(0, -1)); after?.failure?.(); } });
  };
  const selectAuthoringTool = (tool: MapAuthoringTool) => {
    setAuthoringTool(tool); setDraftDrawingPoints([]); setSelectedDrawingId(null);
    if (tool === "terrain") setAuthoringSubtype("land");
    if (tool === "line") setAuthoringSubtype("river");
    if (tool === "area") setAuthoringSubtype("geography");
    if (tool === "symbol") setAuthoringSubtype("settlement");
  };
  const commitDrawing = (points: Array<{ x: number; y: number }>) => {
    if (!map || (authoringTool !== "terrain" && authoringTool !== "line" && authoringTool !== "area")) return;
    const minimum = authoringTool === "area" ? 3 : 2;
    if (points.length < minimum) { setMessage(authoringTool === "terrain" ? "请在画布上按住并拖动，画出一段连续地形。" : `还需至少 ${minimum - points.length} 个点才能完成这笔图示。`); return; }
    const layer = map.content.layers.find((item) => item.id === activeLayerId);
    if (!layer || layer.locked) { setMessage("当前图层已锁定；没有写入绘图。" ); return; }
    const drawing: MapDrawing = { id: `drawing.${crypto.randomUUID()}`, kind: authoringTool, subtype: authoringSubtype, layerId: activeLayerId, points, strokeColor: authoringSubtype === "river" || authoringSubtype === "water" ? "#2f7f9b" : authoringSubtype === "road" ? "#9a6b3c" : "#315f52", fillColor: authoringSubtype === "forest" ? "#4f7f5d" : authoringSubtype === "mountain" ? "#706b61" : authoringSubtype === "sand" ? "#d1b878" : authoringSubtype === "water" ? "#68a9bd" : "#96a978", fillOpacity: .28, width: authoringTool === "terrain" ? 12 : authoringSubtype === "road" ? 2.5 : 3, size: 4, seed: Date.now() % 999999, rotation: 0, label: MAP_TOOL_OPTIONS[authoringTool].find((option) => option.value === authoringSubtype)?.label ?? null, objectId: null };
    saveAuthoringContent({ ...map.content, drawings: [...map.content.drawings, drawing] }, authoringTool === "terrain" ? "连续地形笔触已保存；它仍是地图图示，不会自动建立地理事实。" : "绘图已保存为地图图示；未建立道路、地理或行政事实。", { success: () => { setDraftDrawingPoints([]); setSelectedDrawingId(drawing.id); } });
  };
  const finishDrawing = () => commitDrawing(draftDrawingPoints);
  const updateSelectedDrawing = (patch: Partial<MapDrawing>, success: string) => {
    if (!map || !selectedDrawing || busy) return;
    const layer = map.content.layers.find((item) => item.id === selectedDrawing.layerId);
    if (layer?.locked) { setMessage("该图层已锁定；没有修改图示。"); return; }
    saveAuthoringContent({ ...map.content, drawings: map.content.drawings.map((item) => item.id === selectedDrawing.id ? { ...item, ...patch } : item) }, success);
  };
  const deleteDrawing = () => {
    if (!map || !selectedDrawingId) return;
    const drawing = map.content.drawings.find((item) => item.id === selectedDrawingId);
    const layer = drawing && map.content.layers.find((item) => item.id === drawing.layerId);
    if (!drawing || layer?.locked) { setMessage("该图层已锁定；没有删除图示。"); return; }
    saveAuthoringContent({ ...map.content, drawings: map.content.drawings.filter((item) => item.id !== selectedDrawingId) }, "图示已删除；关联的正式资料（如有）未被删除。");
    setSelectedDrawingId(null);
  };
  const undoAuthoring = () => {
    if (!map || !undoContents.length || busy) return;
    const previous = undoContents[undoContents.length - 1]!;
    setUndoContents((items) => items.slice(0, -1)); setRedoContents((items) => [...items, map.content]);
    saveMap({ ...map, content: previous }, "已撤销上一步地图编辑。", "撤销失败；保留当前地图。");
  };
  const redoAuthoring = () => {
    if (!map || !redoContents.length || busy) return;
    const next = redoContents[redoContents.length - 1]!;
    setRedoContents((items) => items.slice(0, -1)); setUndoContents((items) => [...items, map.content]);
    saveMap({ ...map, content: next }, "已重做地图编辑。", "重做失败；保留当前地图。");
  };
  const openTianyiWithMap = () => {
    if (!map || !projectId) return;
    const mapReturn = new URL(window.location.href);
    if (selectedDrawingId) mapReturn.searchParams.set("mapElement", selectedDrawingId);
    else mapReturn.searchParams.delete("mapElement");
    const params = new URLSearchParams({ tianyiLane: "work", mapRef: map.id, mapRevision: map.contentHash, mapReturn: `${mapReturn.pathname}${mapReturn.search}` });
    if (selectedDrawingId) params.set("mapElement", selectedDrawingId);
    window.location.assign(`/tianyi?${params.toString()}`);
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
    const structureLabel = structureKind === "geography" ? "地理" : "行政";
    saveMap({ ...map, content: { ...map.content, structure: { ...map.content.structure, [field]: next } } }, `${structureLabel}结构规则写入成功；正在刷新正式关系……`, "结构规则保存冲突，请刷新后重试。", { success: () => {
      if (!projectId || !workVersionId) {
        setMessage(`${structureLabel}结构规则已保存；当前作品尚无可读取的版本关系。`);
        return;
      }
      void listRelations({ projectId, workVersionId, reviewState: "confirmed", includeArchived: false }).then((read) => {
        setRelations(read.relations);
        setMessage(`${structureLabel}结构规则已保存；正式关系已刷新。`);
      }).catch(() => setMessage(`${structureLabel}结构规则已保存，但正式关系刷新失败；请刷新页面后重试读取。`));
    } });
  };
  const beginBoundary = (objectId: string) => {
    if (!map) return;
    const existing = map.content.regions.find((region) => region.objectId === objectId && region.layerId === ADMINISTRATION_LAYER_ID);
    setEditingRegionObjectId(objectId);
    setDraftRegionPoints(existing?.points ?? []);
    setEditingLayout(true);
    setInspectorOpen(false);
    window.requestAnimationFrame(() => stageRef.current?.scrollIntoView({ block: "center" }));
    setMessage(existing ? "正在编辑这条行政边界；点击画布继续添加点，保存前不会改写地图。" : "正在描绘行政边界；至少放置三个点后保存。行政关系事实不会因描边而改变。");
  };
  const cancelBoundary = () => {
    setEditingRegionObjectId(null);
    setDraftRegionPoints([]);
    setMessage("行政边界编辑已取消；没有保存任何变化。");
  };
  const addBoundaryPoint = (event: MouseEvent<HTMLElement>) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box?.width || !box.height) { setMessage("地图舞台尚未就绪；没有记录不准确的边界点。"); return; }
    const x = Math.round(((event.clientX - box.left) / box.width) * 1000) / 10;
    const y = Math.round(((event.clientY - box.top) / box.height) * 1000) / 10;
    setDraftRegionPoints((points) => [...points, { x, y }]);
  };
  const removeBoundaryPoint = () => setDraftRegionPoints((points) => points.slice(0, -1));
  const saveBoundary = () => {
    if (!map || !editingRegionObjectId || draftRegionPoints.length < 3) return;
    const location = locations.find((item) => item.id === editingRegionObjectId);
    if (!location) { setMessage("所选行政对象不属于当前作品；没有保存边界。"); return; }
    const layers = ensureAdministrationLayer(map.content.layers);
    const id = `region.administration.${editingRegionObjectId}`;
    const region = { id, title: location.title, layerId: ADMINISTRATION_LAYER_ID, points: draftRegionPoints, strokeColor: "#167b7a", fillColor: "#49a99b", fillOpacity: .22, objectId: editingRegionObjectId };
    saveMap({ ...map, content: { ...map.content, layers, regions: [...map.content.regions.filter((item) => item.id !== id), region] } }, "行政边界已保存到当前地图；行政管辖关系仍由 Relation Owner 单独管理。", "行政边界保存冲突，请刷新后重试。");
    setEditingRegionObjectId(null);
    setDraftRegionPoints([]);
    setEditingLayout(false);
  };
  const openLocalMap = (scopeObjectId: string) => {
    const existing = maps.find((item) => item.content.scopeObjectId === scopeObjectId);
    const scope = locations.find((location) => location.id === scopeObjectId);
    if (!scope || !projectId) return;
    const parent = map;
    const entranceFor = (targetMapId: string) => parent ? { id: `entrance.${scopeObjectId}`, title: `进入${scope.title}`, layerId: parent.content.layers.some((item) => item.id === "layer.main") ? "layer.main" : parent.content.layers[0]!.id, x: parent.content.markers.find((item) => item.objectId === scopeObjectId)?.x ?? 50, y: parent.content.markers.find((item) => item.objectId === scopeObjectId)?.y ?? 50, targetMapId, kind: "entrance" as const, objectId: scopeObjectId } : null;
    if (existing) {
      const entrance = entranceFor(existing.id);
      if (!parent || parent.id === existing.id || parent.content.entrances.some((item) => item.id === entrance?.id && item.targetMapId === existing.id)) { navigateToMap(existing.id); return; }
      setBusy(true);
      void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: parent.contentHash, document: { ...parent, content: { ...parent.content, entrances: [...parent.content.entrances.filter((item) => item.id !== entrance!.id), entrance!] } }, token }))
        .then((write) => { const repairedParent = write.document as MapDocument; setMaps((current) => current.map((item) => item.id === repairedParent.id ? repairedParent : item)); navigateToMap(existing.id); setMessage("已恢复缺失的局部地图入口；没有创建世界事实。"); })
        .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "局部地图存在，但入口恢复失败；请刷新后重试。"))
        .finally(() => setBusy(false));
      return;
    }
    setBusy(true);
    void props.runtime.withConnection(async (token) => {
      const created = await createVisualDocument({ projectId, type: "map", title: `${scope.title} · 局部地图`, token }) as MapDocument;
      const starter = createStarterContent(parent?.content.template === "starfield" ? "geography" : "building");
      const localWrite = await updateVisualDocument({ projectId, relativePath: created.relativePath, expectedHash: created.contentHash, document: { ...created, content: { ...created.content, ...starter, scopeObjectId } }, token });
      if (!parent) return { local: localWrite.document as MapDocument, parent: null };
      const entrance = entranceFor((localWrite.document as MapDocument).id)!;
      const parentWrite = await updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: parent.contentHash, document: { ...parent, content: { ...parent.content, entrances: [...parent.content.entrances.filter((item) => item.id !== entrance.id), entrance] } }, token });
      return { local: localWrite.document as MapDocument, parent: parentWrite.document as MapDocument };
    }).then((next) => { setMaps((current) => [...current.map((item) => next.parent && item.id === next.parent.id ? next.parent : item), next.local]); navigateToMap(next.local.id); setMessage("局部地图和明确入口已保存；入口只表示导航，不推断相邻、通行或管辖关系。" ); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "建立局部地图失败；没有创建关系或地点事实。")).finally(() => setBusy(false));
  };
  const place = (location: WorldObjectSummary, event: MouseEvent<HTMLElement>) => {
    if (!map || busy || !editingLayout) return;
    const box = stageRef.current?.getBoundingClientRect(); if (!box?.width || !box.height) { setMessage("地图舞台尚未就绪；没有保存不准确的标记位置。"); return; } const marker = map.content.markers.find((item) => item.objectId === location.id);
    const x = Math.round(((event.clientX - box.left) / box.width) * 1000) / 10; const y = Math.round(((event.clientY - box.top) / box.height) * 1000) / 10;
    const document: MapDocument = { ...map, content: { ...map.content, markers: marker ? map.content.markers.map((item) => item.id === marker.id ? { ...item, x, y } : item) : [...map.content.markers, { id: `marker.${location.id}`, objectId: location.id, layerId: "layer.main", x, y, color: "#147d78", labelMode: "always" }] } };
    setBusy(true); void props.runtime.withConnection((token) => updateVisualDocument({ projectId: projectId!, relativePath: map.relativePath, expectedHash: map.contentHash, document, token })).then((next) => { setMaps((current) => current.map((item) => item.id === map.id ? next.document as MapDocument : item)); setMessage("布局已保存；地点事实、关系与角色记忆未被改写。"); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "布局保存冲突，请刷新后重试。")).finally(() => setBusy(false));
  };
  const handleCanvasClick = (event: MouseEvent<HTMLElement>) => {
    if (suppressCanvasClick.current) { suppressCanvasClick.current = false; return; }
    if (editingRegionObjectId) { addBoundaryPoint(event); return; }
    if (authoringTool !== "browse") {
      const box = stageRef.current?.getBoundingClientRect();
      if (!box?.width || !box.height) return;
      const point = { x: Math.max(0, Math.min(100, Math.round(((event.clientX - box.left) / box.width) * 1000) / 10)), y: Math.max(0, Math.min(100, Math.round(((event.clientY - box.top) / box.height) * 1000) / 10)) };
      if (authoringTool === "label" && map) {
        if (!authoringLabel.trim()) { setMessage("请先填写标注文字。" ); return; }
        const layer = map.content.layers.find((item) => item.id === activeLayerId);
        if (!layer || layer.locked) { setMessage("当前图层已锁定；没有放置文字。" ); return; }
        saveAuthoringContent({ ...map.content, labels: [...map.content.labels, { id: `label.${crypto.randomUUID()}`, text: authoringLabel.trim(), layerId: activeLayerId, x: point.x, y: point.y, fontSize: 18, fontWeight: 600, align: "center", rotation: 0, visible: true, treatment: "outline" }] }, "文字已保存为地图标注；不会自动建立同名地点。");
        return;
      }
      if (authoringTool === "symbol") {
        const layer = map?.content.layers.find((item) => item.id === activeLayerId);
        if (!map || !layer || layer.locked) { setMessage("当前图层已锁定；没有放置符号。" ); return; }
        const drawing: MapDrawing = { id: `drawing.${crypto.randomUUID()}`, kind: "symbol", subtype: authoringSubtype, layerId: activeLayerId, points: [point], strokeColor: "#315f52", fillColor: authoringSubtype === "planet" ? "#d39b53" : "#d8eee8", fillOpacity: .85, width: 2, size: authoringSubtype === "planet" ? 7 : 4, seed: Date.now() % 999999, rotation: 0, label: null, objectId: null };
        saveAuthoringContent({ ...map.content, drawings: [...map.content.drawings, drawing] }, "符号已保存为地图图示；尚未绑定正式对象。" );
        setSelectedDrawingId(drawing.id);
      } else if (authoringTool === "terrain") setMessage("地形画笔需要按住并拖动；松开后会保存一笔连续的山林或地貌。" );
      else setDraftDrawingPoints((points) => [...points, point]);
      return;
    }
    if (selected) place(selected, event);
  };
  const saveMapTitle = () => {
    if (!map || !projectId || !mapTitle.trim() || mapTitle.trim() === map.title) return;
    const placeholder = map.content.template === "starfield" ? "未命名星域" : map.content.template === "geography" ? "未命名区域" : null;
    const document: MapDocument = { ...map, title: mapTitle.trim(), content: placeholder ? { ...map.content, labels: map.content.labels.map((label) => label.text === placeholder ? { ...label, text: mapTitle.trim() } : label) } : map.content };
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
  const pointOnStage = (clientX: number, clientY: number) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    return { x: Math.max(0, Math.min(100, Math.round(((clientX - box.left) / box.width) * 1000) / 10)), y: Math.max(0, Math.min(100, Math.round(((clientY - box.top) / box.height) * 1000) / 10)) };
  };
  const startPan = (event: PointerEvent<HTMLElement>) => {
    if (authoringTool === "terrain" && !editingLayout && event.button === 0) {
      const point = pointOnStage(event.clientX, event.clientY);
      if (!point) return;
      terrainBrush.current = { pointerId: event.pointerId, points: [point] };
      setDraftDrawingPoints([point]);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (editingLayout || authoringTool !== "browse" || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest(".map-workbench-marker, .map-local-entrance, .map-workbench-canvas-controls")) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewport, moved: false, drawingId: target.closest<SVGGElement>(".map-drawing")?.dataset.drawingId ?? null };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pan = (event: PointerEvent<HTMLElement>) => {
    const brush = terrainBrush.current;
    if (brush?.pointerId === event.pointerId) {
      const point = pointOnStage(event.clientX, event.clientY);
      const previous = brush.points.at(-1);
      if (point && previous && Math.hypot(point.x - previous.x, point.y - previous.y) >= 1.2) {
        brush.points.push(point);
        setDraftDrawingPoints([...brush.points]);
      }
      return;
    }
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const x = active.viewport.x + event.clientX - active.x;
    const y = active.viewport.y + event.clientY - active.y;
    active.moved ||= Math.abs(event.clientX - active.x) > 3 || Math.abs(event.clientY - active.y) > 3;
    setViewport(normalizeViewport({ ...viewport, x, y }));
  };
  const endPan = (event: PointerEvent<HTMLElement>) => {
    const brush = terrainBrush.current;
    if (brush?.pointerId === event.pointerId) {
      terrainBrush.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      suppressCanvasClick.current = true;
      window.requestAnimationFrame(() => { suppressCanvasClick.current = false; });
      commitDrawing(brush.points);
      return;
    }
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.moved) moveViewport({ ...active.viewport, x: active.viewport.x + event.clientX - active.x, y: active.viewport.y + event.clientY - active.y });
    else if (active.drawingId) setSelectedDrawingId(active.drawingId);
  };
  const zoomCanvas = (event: WheelEvent<HTMLElement>) => {
    if (editingLayout || authoringTool !== "browse" || event.ctrlKey || event.metaKey) return;
    moveViewport({ ...viewport, zoom: viewport.zoom + (event.deltaY < 0 ? .1 : -.1) });
  };

  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  const selected = locations.find((item) => item.id === selectedId) || null;
  const state = markerState(selected, inspector);
  const scopedChildren = structure && map?.content.scopeObjectId ? structure.childrenByParentId.get(map.content.scopeObjectId) ?? [] : [];
  const visibleLayerIds = new Set(map?.content.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []);
  const visibleAdministrationRegions = map?.content.regions.filter((region) => region.layerId === ADMINISTRATION_LAYER_ID && visibleLayerIds.has(region.layerId)) ?? [];
  const administrativeLocationIds = new Set(administrationStructure?.edges.flatMap((edge) => [edge.sourceObjectId, edge.targetObjectId]) ?? []);
  const administrativeLocations = locations.filter((location) => administrativeLocationIds.has(location.id));
  const boundaryPending = administrativeLocations.filter((location) => !map?.content.regions.some((region) => region.layerId === ADMINISTRATION_LAYER_ID && region.objectId === location.id));
  const stageSize = fittedMapStage(canvasSize, map?.content.baseImage ?? null);
  const activeLayer = map?.content.layers.find((item) => item.id === activeLayerId) ?? map?.content.layers[0] ?? null;
  const parentMap = map ? maps.find((candidate) => candidate.content.entrances.some((entrance) => entrance.targetMapId === map.id)) ?? null : null;
  const showInspector = inspectorOpen && Boolean(selected);
  return <main className="shell-workspace map-workbench-shell" aria-label="地点地图">
    <section className={`map-workbench ${editingRegionObjectId ? "is-boundary-editing" : ""}`} data-testid="map-m2-workspace">
      <header className="map-workbench-toolbar">
        <div className="map-workbench-title"><MapPin aria-hidden="true" /><div><strong>地点地图</strong><span>{map?.content.markers.length ?? 0} 个已放置地点 · {props.runtime.workVersionLabel ?? (workVersionId ? "正在读取版本" : "尚未建立作品版本")}</span></div></div>
        <label>当前地图<select aria-label="选择地图" value={mapId ?? ""} onChange={(event) => selectMap(event.target.value)}>{!mapId ? <option value="">请选择地图</option> : null}{maps.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {map ? <label>地图名称<input aria-label="地图名称" value={mapTitle} onChange={(event) => setMapTitle(event.target.value)} onBlur={saveMapTitle} disabled={busy} /></label> : null}
        <div className="map-workbench-toolbar-actions">
          {materialReturn ? <button type="button" onClick={() => window.location.assign(materialReturn)}><ArrowLeft aria-hidden="true" />返回资料</button> : null}
          {map ? <><label className="map-new-template">新地图起点<select aria-label="新地图起点" value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value as MapContent["template"])}><option value="geography">地理</option><option value="starfield">星域</option><option value="building">建筑</option><option value="blank">空白</option></select></label><button type="button" onClick={create} disabled={busy}>新地图</button></> : null}
          {map ? <><input ref={backgroundInput} className="map-background-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { importBackground(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /><button type="button" onClick={() => backgroundInput.current?.click()} disabled={busy}>底图</button></> : null}
          <button type="button" aria-pressed={editingLayout} onClick={() => setEditingLayout((value) => !value)} disabled={busy}>{editingLayout ? <><Eye aria-hidden="true" />浏览地图</> : <><PencilRuler aria-hidden="true" />编辑布局</>}</button>
          <button type="button" onClick={() => window.dispatchEvent(new Event("story-studio-close-project-directory"))}><PanelLeftClose aria-hidden="true" />专注地图</button>
          <button type="button" aria-expanded={showInspector} aria-controls="map-m2-inspector" onClick={() => setInspectorOpen((value) => !value)} disabled={!selected}><PanelRight aria-hidden="true" />{showInspector ? "收起地点详情" : "地点详情"}</button>
        </div>
        {map ? <nav className="map-navigation-crumbs" aria-label="地图层级"><button type="button" onClick={() => parentMap && navigateToMap(parentMap.id)} disabled={!parentMap}>上层</button>{parentMap ? <><button type="button" onClick={() => navigateToMap(parentMap.id)}>{parentMap.title}</button><span>›</span></> : null}<strong>{map.title}</strong></nav> : null}
        {editingRegionObjectId ? <div className="map-boundary-editor-toolbar" role="group" aria-label="行政边界编辑"><span>边界点 {draftRegionPoints.length}</span><button type="button" onClick={removeBoundaryPoint} disabled={!draftRegionPoints.length || busy}>移除最后一点</button><button type="button" onClick={cancelBoundary} disabled={busy}>取消边界</button><button type="button" className="primary-action" onClick={saveBoundary} disabled={busy || draftRegionPoints.length < 3}>保存边界</button></div> : null}
      </header>
      <div className="map-workbench-notice" aria-live="polite">{message ? <p className="map-workbench-message" role="status">{message}</p> : null}</div>
      {!maps.length ? <section className="map-workbench-empty"><h1>建立第一张作者地图</h1><p>选择轻量起点后即可绘制；所有初始图形都只是图示，不会改变地点、关系或角色知情。</p><label>地图起点<select aria-label="地图起点" value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value as MapContent["template"])}><option value="geography">地理区域</option><option value="starfield">星域</option><option value="building">建筑平面</option><option value="blank">空白画布</option></select></label><button type="button" aria-label="建立地点示意图" className="primary-action" disabled={busy} onClick={create}>建立地图</button></section> : !map ? <p className="map-workbench-message" role="alert">请选择一张可用地图；没有自动跳转到第一张地图。</p> : <>
        <div className={`map-workbench-body ${showInspector ? "" : "is-inspector-collapsed"}`}>
          <aside className="map-authoring-palette" aria-label="地图绘图工具">
            <details open className="map-workbench-story-strip" aria-label="故事观察位置"><summary>故事观察位置</summary><div className="map-authoring-detail-stack" role="tablist" aria-label="选择故事观察位置"><button type="button" role="tab" aria-selected={observation.kind === "current"} onClick={() => selectObservation({ kind: "current" })}>当前状态</button>{nodes.map((node) => <button key={observationKey(node)} type="button" role="tab" aria-selected={observationKey(node) === observationKey(observation)} onClick={() => selectObservation(node)}>{eventLabel(inspector?.events ?? [], node.eventId)}之后</button>)}</div></details>
            <div className="map-authoring-tool-grid" role="toolbar" aria-label="绘图工具">
              {([['browse', '浏览'], ['terrain', '地形'], ['line', '线条'], ['area', '区域'], ['symbol', '标记'], ['label', '文字']] as Array<[MapAuthoringTool, string]>).map(([tool, label]) => <button key={tool} type="button" aria-pressed={authoringTool === tool} onClick={() => selectAuthoringTool(tool)}>{label}</button>)}
            </div>
            {authoringTool !== "browse" && authoringTool !== "label" ? <label>样式<select aria-label="绘图样式" value={authoringSubtype} onChange={(event) => setAuthoringSubtype(event.target.value)}>{MAP_TOOL_OPTIONS[authoringTool].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
            {authoringTool === "label" ? <label>标注文字<input aria-label="标注文字" value={authoringLabel} maxLength={120} onChange={(event) => setAuthoringLabel(event.target.value)} /></label> : null}
            <label>当前图层<select aria-label="当前绘图图层" value={activeLayer?.id ?? ""} onChange={(event) => setActiveLayerId(event.target.value)}>{map.content.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.title}{layer.locked ? " · 已锁定" : ""}</option>)}</select></label>
            <div className="map-authoring-history"><button type="button" onClick={undoAuthoring} disabled={!undoContents.length || busy} aria-label="撤销"><Undo2 aria-hidden="true" />撤销</button><button type="button" onClick={redoAuthoring} disabled={!redoContents.length || busy} aria-label="重做"><Redo2 aria-hidden="true" />重做</button></div>
            {draftDrawingPoints.length ? <div className="map-authoring-draft-actions"><span>已取 {draftDrawingPoints.length} 个点</span><button type="button" onClick={() => setDraftDrawingPoints((items) => items.slice(0, -1))}>退一点</button><button type="button" className="primary-action" onClick={finishDrawing}>完成这一笔</button><button type="button" onClick={() => setDraftDrawingPoints([])}>取消</button></div> : null}
            {selectedDrawing ? <section className="map-drawing-editor" aria-label="选中图示编辑器">
              <strong>选中图示</strong>
              <label>名称<input aria-label="图示名称" value={drawingLabelDraft} maxLength={120} onChange={(event) => setDrawingLabelDraft(event.target.value)} onBlur={() => updateSelectedDrawing({ label: drawingLabelDraft.trim() || null }, "图示名称已保存。")}/></label>
              <label>样式<select aria-label="图示样式" value={selectedDrawing.subtype} onChange={(event) => updateSelectedDrawing({ subtype: event.target.value }, "图示样式已保存。")}>{MAP_TOOL_OPTIONS[selectedDrawing.kind].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label>{selectedDrawing.kind === "symbol" ? "大小" : "笔触宽度"}<input key={`${selectedDrawing.id}:${selectedDrawing.kind === "symbol" ? selectedDrawing.size : selectedDrawing.width}`} aria-label={selectedDrawing.kind === "symbol" ? "图示大小" : "图示笔触宽度"} type="number" min={selectedDrawing.kind === "symbol" ? 1 : .25} max="30" step="0.5" defaultValue={selectedDrawing.kind === "symbol" ? selectedDrawing.size : selectedDrawing.width} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateSelectedDrawing(selectedDrawing.kind === "symbol" ? { size: value } : { width: value }, "图示尺寸已保存。" ); }} /></label>
              <div className="map-drawing-editor-colors"><label>线色<input aria-label="图示线色" type="color" value={selectedDrawing.strokeColor} onChange={(event) => updateSelectedDrawing({ strokeColor: event.target.value }, "图示颜色已保存。")}/></label><label>填色<input aria-label="图示填色" type="color" value={selectedDrawing.fillColor} onChange={(event) => updateSelectedDrawing({ fillColor: event.target.value }, "图示颜色已保存。")}/></label></div>
              <button type="button" onClick={deleteDrawing} disabled={busy}><Trash2 aria-hidden="true" />删除选中图示</button>
            </section> : null}
            <button type="button" className="primary-action" onClick={openTianyiWithMap}>交给天意{selectedDrawingId ? " · 选中图示" : " · 当前地图"}</button>
            <details><summary>图层</summary>{map.content.layers.map((layer) => <div key={layer.id} className="map-authoring-layer-row"><span>{layer.title}</span><button type="button" aria-pressed={layer.visible} onClick={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) } }, "图层显示已保存。", "图层保存失败。")}>{layer.visible ? "显示" : "隐藏"}</button><button type="button" aria-pressed={layer.locked} onClick={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item) } }, "图层锁定状态已保存。", "图层保存失败。")}>{layer.locked ? "解锁" : "锁定"}</button></div>)}</details>
            <details className="map-structure-details" open={structurePanelOpen} onToggle={(event) => setStructurePanelOpen(event.currentTarget.open)}><summary>空间与行政</summary><div className="map-authoring-detail-stack">
              <div role="group" aria-label="空间结构"><button type="button" aria-pressed={structureKind === "geography"} onClick={() => selectStructureKind("geography")}>地理</button><button type="button" aria-pressed={structureKind === "administration"} onClick={() => selectStructureKind("administration")}>行政</button></div>
              <label>地图范围<select aria-label="地图范围" value={map.content.scopeObjectId ?? ""} onChange={(event) => saveScope(event.target.value)}><option value="">整张地图</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
              <span>读取的正式关系类型</span>{relationTypes.filter((type) => type.lifecycle === "active").map((type) => <label key={type.relationTypeId}><span><input type="checkbox" checked={(structureKind === "geography" ? map.content.structure.geographyRelationTypeIds : map.content.structure.administrationRelationTypeIds).includes(type.relationTypeId)} onChange={() => toggleStructureType(type.relationTypeId)} />{type.label}</span></label>)}
              <div className="map-structure-children"><span>{map.content.scopeObjectId ? "当前范围的直接对象" : "已确认的结构关系"}</span>{map.content.scopeObjectId ? scopedChildren.length ? scopedChildren.map((edge) => { const child = locations.find((location) => location.id === edge.sourceObjectId); return child ? <button key={edge.relationId} type="button" onClick={() => { selectPlace(child.id); setInspectorOpen(true); }}>{child.title}<small>{edge.label}</small></button> : null; }) : <small>此范围没有直接对象。</small> : structure?.edges.map((edge) => <small key={edge.relationId}>{locations.find((item) => item.id === edge.sourceObjectId)?.title ?? "未解析地点"} · {edge.label} · {locations.find((item) => item.id === edge.targetObjectId)?.title ?? "未解析地点"}</small>)}</div>
              <span>图层显示</span>{map.content.layers.map((layer) => <label key={layer.id}><span><input type="checkbox" checked={layer.visible} onChange={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) } }, "图层显示已保存；没有改变地点或关系事实。", "图层显示保存冲突，请刷新后重试。")} />{layer.title}</span></label>)}
              {administrativeLocations.length ? <label>行政边界<select aria-label="选择行政区域" value={editingRegionObjectId ?? ""} onChange={(event) => event.target.value && beginBoundary(event.target.value)}><option value="">选择行政对象</option>{administrativeLocations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label> : <small>选择行政关系类型后，可为已确认行政对象描绘边界。</small>}
            </div></details>
            <details open aria-label="地点"><summary>地点与局部图</summary><div className="map-authoring-detail-stack">{locations.map((location) => <div key={location.id} className="map-authoring-place-row"><button type="button" onClick={() => { selectPlace(location.id); setInspectorOpen(true); }}>{location.title}{map.content.markers.some((marker) => marker.objectId === location.id) ? "" : " · 未放置"}</button><button type="button" onClick={() => openLocalMap(location.id)}>进入局部图</button></div>)}</div></details>
            <small>图形默认标为“图示”。只有显式绑定资料或正式关系，才会成为天意可引用的世界依据。</small>
          </aside>
          <section ref={canvasRef} className={`map-m1-canvas map-workbench-canvas ${editingLayout ? "is-editing" : "is-browsing"}`} aria-label="地点示意图画布" onClick={handleCanvasClick} onPointerDown={startPan} onPointerMove={pan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={zoomCanvas}>
            <div className="map-workbench-grid" aria-hidden="true" />
            <div className="map-m2-viewport" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
              <div ref={stageRef} className="map-workbench-stage" style={{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }}>
                {map.content.backgrounds.filter((background) => background.visible && background.id === map.content.activeBackgroundId).map((background) => <img key={background.id} className="map-workbench-background" src={visualAssetUrl(projectId, background.assetPath)} alt="" style={{ opacity: background.opacity }} draggable={false} />)}
                <MapDrawingOverlay drawings={map.content.drawings} labels={map.content.labels} visibleLayerIds={visibleLayerIds} selectedId={selectedDrawingId} draft={draftDrawingPoints} draftKind={authoringTool} authoring={authoringTool !== "browse" || editingLayout || Boolean(editingRegionObjectId)} onSelect={(id) => { if (authoringTool === "browse" && !editingLayout) setSelectedDrawingId(id); }} />
                {visibleAdministrationRegions.length ? <svg className="map-administration-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="行政边界叠加">
                  {visibleAdministrationRegions.map((region) => {
                    const label = locations.find((location) => location.id === region.objectId)?.title ?? region.title;
                    const center = regionCenter(region.points);
                    return <g key={region.id} data-region-object={region.objectId ?? undefined}><polygon points={region.points.map((point) => `${point.x},${point.y}`).join(" ")} fill={region.fillColor} fillOpacity={region.fillOpacity} stroke={region.strokeColor} strokeWidth=".45" vectorEffect="non-scaling-stroke" /><text x={center.x} y={center.y} textAnchor="middle">{label}</text></g>;
                  })}
                </svg> : null}
                {editingRegionObjectId && draftRegionPoints.length ? <svg className="map-administration-overlay is-draft" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="正在编辑行政边界"><polyline points={draftRegionPoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#0c615d" strokeWidth=".55" strokeDasharray="1.2 1" vectorEffect="non-scaling-stroke" />{draftRegionPoints.map((point, index) => <circle key={`${point.x}:${point.y}:${index}`} cx={point.x} cy={point.y} r=".65" />)}</svg> : null}
                {map.content.markers.filter((marker) => visibleLayerIds.has(marker.layerId)).map((marker) => {
                const location = locations.find((item) => item.id === marker.objectId);
                const markerStateValue = location?.id === selected?.id ? state : "unloaded";
                return location ? <button key={marker.id} className={`map-workbench-marker is-${markerStateValue}`} data-state={markerStateValue} type="button" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} aria-pressed={selectedId === location.id} onClick={(event) => { event.stopPropagation(); selectPlace(location.id); setInspectorOpen(true); }}>
                  <MarkerIcon state={markerStateValue} /><span>{location.title}</span><small>{markerStateLabel(markerStateValue)}</small>
                </button> : null;
                })}
                {map.content.entrances.filter((entrance) => visibleLayerIds.has(entrance.layerId)).map((entrance) => { const targetExists = maps.some((candidate) => candidate.id === entrance.targetMapId); return <button key={entrance.id} type="button" className="map-local-entrance" style={{ left: `${entrance.x}%`, top: `${entrance.y}%` }} disabled={!targetExists} title={targetExists ? entrance.title : "目标局部地图已缺失"} onClick={(event) => { event.stopPropagation(); if (targetExists) navigateToMap(entrance.targetMapId); }}><DoorOpen aria-hidden="true" /><span>{entrance.title}</span></button>; })}
              </div>
            </div>
            <div className="map-workbench-canvas-controls" aria-label="地图视角">
              <button type="button" onClick={() => moveViewport({ ...viewport, zoom: viewport.zoom + .15 })} aria-label="放大地图"><Plus aria-hidden="true" /></button>
              <span>{Math.round(viewport.zoom * 100)}%</span>
              <button type="button" onClick={() => moveViewport({ ...viewport, zoom: viewport.zoom - .15 })} aria-label="缩小地图"><Minus aria-hidden="true" /></button>
              <button type="button" onClick={() => moveViewport({ x: 0, y: 0, zoom: 1 })}><LocateFixed aria-hidden="true" />适配</button>
            </div>
            <p className="map-workbench-canvas-hint">{editingRegionObjectId ? `行政边界编辑：已放置 ${draftRegionPoints.length} 个点，点击画布继续描绘。` : authoringTool !== "browse" ? `${authoringTool === "terrain" ? "地形画笔" : authoringTool === "line" ? "线条" : authoringTool === "area" ? "区域" : "标记"}：在画布取点，图形保存后仍只是图示。` : editingLayout ? "布局编辑：选择地点后点击画布保存位置。" : "浏览：拖动平移、滚轮缩放，点击地点或图示查看。"}</p>
          </section>
          {showInspector ? <MapInspector selected={selected} data={inspector} error={inspectorError} versionReady={Boolean(workVersionId)} projectId={projectId} workVersionId={workVersionId} mapId={map.id} observation={observation} scopeMap={() => selected && openLocalMap(selected.id)} /> : null}
        </div>
        <details className="map-structure-details-legacy" aria-label="旧地理与行政结构"><summary>空间结构与同图行政叠加 · {structureKind === "geography" ? "地理与空间" : "行政与管辖"}</summary><section className="map-structure-panel">
          <div className="map-structure-heading"><div><span>空间结构</span><strong>{structureKind === "geography" ? "地理与空间" : "行政与管辖"}</strong></div><div role="group" aria-label="结构视图"><button type="button" aria-pressed={structureKind === "geography"} onClick={() => selectStructureKind("geography")}>地理</button><button type="button" aria-pressed={structureKind === "administration"} onClick={() => selectStructureKind("administration")}>行政</button></div></div>
          <label>当前地图范围<select aria-label="旧范围选择" value={map.content.scopeObjectId ?? ""} onChange={(event) => saveScope(event.target.value)} disabled={busy}><option value="">整张地图（不指定范围）</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>
          <div className="map-structure-types"><span>读取的正式关系类型</span>{relationTypes.filter((type) => type.lifecycle === "active").length ? relationTypes.filter((type) => type.lifecycle === "active").map((type) => <label key={type.relationTypeId}><input type="checkbox" checked={(structureKind === "geography" ? map.content.structure.geographyRelationTypeIds : map.content.structure.administrationRelationTypeIds).includes(type.relationTypeId)} onChange={() => toggleStructureType(type.relationTypeId)} disabled={busy} />{type.label}</label>) : <small>还没有可选关系类型。请先在关系页建立并确认类型；旧文本关系不会被自动归类。</small>}</div>
          <div className="map-structure-children"><span>{map.content.scopeObjectId ? "当前范围的直接对象" : "已确认的结构关系"}</span>{map.content.scopeObjectId ? scopedChildren.length ? scopedChildren.map((edge) => { const child = locations.find((location) => location.id === edge.sourceObjectId); return child ? <button key={edge.relationId} type="button" onClick={() => { selectPlace(child.id); setInspectorOpen(true); }}>{child.title}<small>{edge.label}</small></button> : null; }) : <small>此范围在当前结构中没有直接对象；可保留为空或在关系页建立明确关系。</small> : structure?.edges.length ? structure.edges.map((edge) => <small key={edge.relationId}>{locations.find((item) => item.id === edge.sourceObjectId)?.title ?? "未解析地点"} · {edge.label} · {locations.find((item) => item.id === edge.targetObjectId)?.title ?? "未解析地点"}</small>) : <small>尚未选择用于此结构的关系类型，因此不会根据文字标签猜测层级。</small>}</div>
          <div className="map-structure-layers"><span>图层显示</span>{map.content.layers.map((layer) => <label key={layer.id}><input type="checkbox" checked={layer.visible} onChange={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) } }, "图层显示已保存；没有改变地点或关系事实。", "图层显示保存冲突，请刷新后重试。")} disabled={busy} />{layer.title}</label>)}</div>
        </section></details>
        <section className="map-administration-panel" aria-label="行政边界与管辖">
          <div><span>同图行政叠加</span><strong>行政边界与名称覆盖在当前地理底图上；切换图层不会改变位置或缩放。</strong></div>
          {administrationStructure?.edges.length ? <ul>{administrationStructure.edges.map((edge) => <li key={edge.relationId}><span>{locations.find((item) => item.id === edge.sourceObjectId)?.title ?? "未解析地点"} · {edge.label} · {locations.find((item) => item.id === edge.targetObjectId)?.title ?? "未解析地点"}</span></li>)}</ul> : <p>尚未选择行政关系类型，因此没有可叠加的管辖信息。</p>}
          {administrativeLocations.length ? <div className="map-administration-actions"><label>描绘行政边界<select aria-label="旧边界对象选择" value={editingRegionObjectId ?? ""} onChange={(event) => event.target.value && beginBoundary(event.target.value)} disabled={busy}><option value="">选择已确认行政对象</option>{administrativeLocations.map((location) => <option key={location.id} value={location.id}>{location.title}</option>)}</select></label>{editingRegionObjectId ? <><button type="button" onClick={removeBoundaryPoint} disabled={!draftRegionPoints.length || busy}>移除最后一点</button><button type="button" onClick={cancelBoundary} disabled={busy}>取消边界</button><button type="button" className="primary-action" onClick={saveBoundary} disabled={busy || draftRegionPoints.length < 3}>保存边界（{draftRegionPoints.length}）</button></> : null}</div> : null}
          {boundaryPending.length ? <p className="map-administration-pending">{boundaryPending.map((location) => location.title).join("、")}：已确认管辖信息，但边界待标注。</p> : null}
        </section>
        <footer className="map-workbench-story-strip-legacy" aria-label="旧故事观察位置">
          <div><span>故事节点</span><strong>{observation.kind === "current" ? "当前状态" : `${eventLabel(inspector?.events ?? [], observation.eventId)}之后`}</strong></div>
          <div className="map-workbench-story-nodes" role="tablist" aria-label="选择故事观察位置">
            <button type="button" role="tab" aria-selected={observation.kind === "current"} onClick={() => selectObservation({ kind: "current" })}>当前</button>
            {nodes.map((node) => <button key={observationKey(node)} type="button" role="tab" aria-selected={observationKey(node) === observationKey(observation)} onClick={() => selectObservation(node)}>{eventLabel(inspector?.events ?? [], node.eventId)}之后</button>)}
          </div>
          <label className="map-workbench-more-nodes">更多节点<select aria-label="选择故事观察位置" value={observationKey(observation)} onChange={(event) => { const next = event.target.value === "current" ? { kind: "current" } as Observation : nodes.find((item) => observationKey(item) === event.target.value); if (next) selectObservation(next); }}><option value="current">当前状态</option>{nodes.map((node) => <option key={observationKey(node)} value={observationKey(node)}>{eventLabel(inspector?.events ?? [], node.eventId)}之后</option>)}</select></label>
        </footer>
        <section className="map-workbench-places" aria-label="旧地点条"><span>地点</span>{locations.map((location) => <span key={location.id}><button type="button" aria-pressed={location.id === selectedId} onClick={() => { selectPlace(location.id); setInspectorOpen(true); }}>{location.title}{map.content.markers.some((marker) => marker.objectId === location.id) ? "" : " · 未放置"}</button><button type="button" onClick={() => openLocalMap(location.id)}>局部图</button>{editingLayout && map.content.markers.some((marker) => marker.objectId === location.id) ? <button type="button" onClick={() => removeMarker(location.id)}>移除标记</button> : null}</span>)}</section>
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
  const openRelations = () => { if (!props.selected) return; const parameters = new URLSearchParams({ libraryView: "relations", relationCenter: props.selected.id, relationReturn: `${window.location.pathname}${window.location.search}`, ...(props.observation.kind === "event" ? { mapObservationEvent: props.observation.eventId, mapObservationRevision: props.observation.eventRevision, mapObservedAt: props.observation.observedAt, mapObservationLabel: eventLabel(props.data?.events ?? [], props.observation.eventId) } : {}) }); window.location.assign(`/library?${parameters.toString()}`); };
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
function route(): { mapId: string | null; placeId: string | null; mapElement: string | null; structureKind: LocationStructureKind } { const params = new URLSearchParams(window.location.search); return { mapId: params.get("mapId"), placeId: params.get("mapPlace"), mapElement: params.get("mapElement"), structureKind: params.get("mapStructure") === "administration" ? "administration" : "geography" }; }
function safeReturn(value: string | null): string | null { return value && value.startsWith("/") && !value.startsWith("//") ? value : null; }
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
