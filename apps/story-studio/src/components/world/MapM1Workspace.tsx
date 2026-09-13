import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { Archive, ArrowLeft, CircleHelp, Copy, DoorOpen, Eye, FileText, LocateFixed, LockKeyhole, MapPin, Minus, PanelLeftClose, PanelRight, PencilRuler, Plus, Redo2, RotateCcw, Search, Trash2, Undo2 } from "lucide-react";

import { createVisualDocument, duplicateMapDocument, getVerifiedCanonEvent, getVisualWorkbench, getWorldLibrary, importVisualAsset, listMapRevisions, listRelationTypes, listRelations, readMapRevision, readWorldStateN4, updateVisualDocument, visualAssetUrl, type MapBackground, type MapConnection, type MapContent, type MapDocument, type MapDrawing, type MapPlacement, type RelationTypeDefinition, type WorldObject, type WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { relationActiveAtWorldTime, relationWorldTimeUnknownReason } from "../../../../../src/storyContracts/relationTemporalComparison.ts";
import { createTypedLocationStructureProjection, type LocationStructureKind } from "../../../../../src/storyContracts/storyStudioLocationTopology.ts";
import { applyMapSimilarityTransform, calibratedPlacementBounds, mapCanvasPointToCoordinate, projectChildCanvasPointToParentCanvas, solveMapSimilarityTransform, type MapCalibrationControlPoints } from "../../../../../src/storyContracts/mapCalibration.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { createStarterContent, MAP_TOOL_OPTIONS, MapDrawingOverlay, type MapAuthoringTool } from "./mapAuthoring";
import { MaterialsSectionNavigation } from "./MaterialsSectionNavigation";

type EventObservation = { kind: "event"; eventId: string; eventRevision: string; observedAt: string };
type Observation = { kind: "current" } | EventObservation;
type MapViewport = { x: number; y: number; zoom: number };
type SpatialDraft = { parentMapId: string; baseContentHash: string; placement: MapPlacement; savedPlacement: MapPlacement };
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

function placementAnchor(placement: MapPlacement): { x: number; y: number } {
  if (placement.point) return placement.point;
  return regionCenter(placement.bounds);
}

function clampMapPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.max(0, Math.min(100, point.x)), y: Math.max(0, Math.min(100, point.y)) };
}

function movePlacement(placement: MapPlacement, anchor: { x: number; y: number }): MapPlacement {
  const current = placementAnchor(placement);
  const dx = anchor.x - current.x;
  const dy = anchor.y - current.y;
  return placement.kind === "point"
    ? { ...placement, point: clampMapPoint(anchor) }
    : { ...placement, bounds: placement.bounds.map((point) => clampMapPoint({ x: point.x + dx, y: point.y + dy })) };
}

function scalePlacementBounds(placement: MapPlacement, percent: number): MapPlacement {
  if (placement.kind === "point" || placement.bounds.length < 3) return placement;
  const center = placementAnchor(placement);
  const factor = Math.max(.1, Math.min(10, percent / 100));
  return { ...placement, bounds: placement.bounds.map((point) => clampMapPoint({ x: center.x + (point.x - center.x) * factor, y: center.y + (point.y - center.y) * factor })) };
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
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const [templateChoice, setTemplateChoice] = useState<MapContent["template"]>("geography");
  const [undoContents, setUndoContents] = useState<MapContent[]>([]);
  const [redoContents, setRedoContents] = useState<MapContent[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(() => Boolean(route().placeId));
  const [message, setMessage] = useState("");
  const [historicalRevision, setHistoricalRevision] = useState<string | null>(() => route().mapRevision);
  const [mapSearch, setMapSearch] = useState("");
  const [showArchivedMaps, setShowArchivedMaps] = useState(false);
  const [managerView, setManagerView] = useState<"list" | "spatial">("list");
  const [managerParentId, setManagerParentId] = useState<string | null>(null);
  const [spatialDraft, setSpatialDraft] = useState<SpatialDraft | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const spatialDrag = useRef<{ pointerId: number; startX: number; startY: number; placement: MapPlacement } | null>(null);
  const [connectionTargetId, setConnectionTargetId] = useState("");
  const [connectionKind, setConnectionKind] = useState<MapConnection["kind"]>("door");
  const [mapTitle, setMapTitle] = useState("");
  const [mapRevisions, setMapRevisions] = useState<Array<{ revision: number; updatedAt: string | null; contentHash: string; current: boolean }>>([]);
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
    setUndoContents([]); setRedoContents([]); setDraftDrawingPoints([]); setSelectedDrawingId(requestedElement && map.content.drawings.some((item) => item.id === requestedElement) ? requestedElement : null); setSelectedDrawingIds([]); setAuthoringTool("browse");
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
    let nextMaps = workbench.documents.filter((item): item is MapDocument => item.type === "map");
    setLocations(library.objects.filter((item) => item.type === "location" && item.status !== "archived"));
    setRelations(relationRead.relations);
    setRelationTypes(typeRead.types);
    const requested = route().mapId;
    const requestedRevision = route().mapRevision;
    if (requested && requestedRevision) {
      const current = nextMaps.find((item) => item.id === requested);
      if (current && current.contentHash !== requestedRevision) {
        const historical = await readMapRevision(id, current.relativePath, requestedRevision);
        nextMaps = nextMaps.map((item) => item.id === requested ? historical : item);
        setHistoricalRevision(requestedRevision);
      } else setHistoricalRevision(requestedRevision);
    } else setHistoricalRevision(null);
    setMaps(nextMaps);
    if (requested && !nextMaps.some((item) => item.id === requested)) {
      setMessage("请求的地图已不存在或不属于当前作品；没有改为打开另一张地图。");
      setMapId(null);
    } else if (requested) setMapId(requested);
    else if (!requested) setMapId(null);
  };

  useEffect(() => {
    setMaps([]); setLocations([]); setRelations([]); setRelationTypes([]); setMapId(route().mapId); setHistoricalRevision(route().mapRevision); setSelectedId(route().placeId); setObservation(observationFromRoute()); setViewport(viewportFromRoute()); setStructureKind(route().structureKind);
    setInspector(null); setInspectorError(null); setInspectorOpen(Boolean(route().placeId)); setMessage("");
    if (projectId) void refresh(projectId, workVersionId).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图读取失败。"));
  }, [projectId, workVersionId]);

  useEffect(() => {
    if (!historicalRevision) return;
    setEditingLayout(false);
    setAuthoringTool("browse");
    setDraftDrawingPoints([]);
    setEditingRegionObjectId(null);
  }, [historicalRevision]);

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
  const selectMap = (id: string) => { const params = new URLSearchParams(window.location.search); params.delete("mapRevision"); window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`); setHistoricalRevision(null); setMapId(id || null); setSelectedId(null); setInspectorOpen(false); saveRoute({ mapId: id || null, placeId: null }); };
  const showManager = () => selectMap("");
  const navigateToMap = (id: string) => {
    if (map && projectId) window.sessionStorage.setItem(`tianyan.map.viewport.${projectId}.${map.id}`, JSON.stringify(viewport));
    const stored = projectId ? window.sessionStorage.getItem(`tianyan.map.viewport.${projectId}.${id}`) : null;
    let nextViewport = { x: 0, y: 0, zoom: 1 };
    try { if (stored) nextViewport = normalizeViewport(JSON.parse(stored)); } catch { /* A broken local view preference is safely ignored. */ }
    const params = new URLSearchParams(window.location.search); params.delete("mapRevision"); window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`); setHistoricalRevision(null);
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
  const duplicateMap = (source: MapDocument) => {
    if (!projectId || busy) return;
    setBusy(true);
    void props.runtime.withConnection((token) => duplicateMapDocument({ projectId, relativePath: source.relativePath, title: `${source.title} 副本`, token }))
      .then((created) => { setMaps((items) => [...items, created]); setMessage("地图副本已建立；拥有新地图和图形身份，未复制父图放置或外部通道。"); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "复制地图失败。"))
      .finally(() => setBusy(false));
  };
  const setMapArchived = (target: MapDocument, archived: boolean) => {
    if (!projectId || busy) return;
    setBusy(true);
    void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: target.relativePath, expectedHash: target.contentHash, document: { ...target, content: { ...target.content, lifecycle: { ...target.content.lifecycle, archived } } }, token }))
      .then((next) => { setMaps((items) => items.map((item) => item.id === target.id ? next.document as MapDocument : item)); if (mapId === target.id && archived) showManager(); setMessage(archived ? "地图已归档；底图文件、历史修订和引用均保留。" : "地图已恢复，可继续编辑。" ); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图状态保存失败。"))
      .finally(() => setBusy(false));
  };
  const placeChildMap = (parent: MapDocument, child: MapDocument) => {
    if (!projectId || busy || parent.id === child.id) return;
    const placement: MapPlacement = { id: `placement.${crypto.randomUUID()}`, childMapId: child.id, kind: "point", point: { x: 50, y: 50 }, bounds: [], transform: null, precision: "illustrative", note: "作者在空间总览中放置；仅表示入口或大概位置。" };
    setBusy(true);
    void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: parent.contentHash, document: { ...parent, content: { ...parent.content, placements: [...parent.content.placements, placement] } }, token }))
      .then((next) => { setMaps((items) => items.map((item) => item.id === parent.id ? next.document as MapDocument : item)); setMessage("子地图已按点定位放在父图中心；没有伪造覆盖范围或精确比例。" ); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "子地图定位失败。"))
      .finally(() => setBusy(false));
  };
  const beginSpatialEdit = (parent: MapDocument, placement: MapPlacement) => {
    setCalibrationError(null);
    setSpatialDraft({ parentMapId: parent.id, baseContentHash: parent.contentHash, placement: structuredClone(placement), savedPlacement: structuredClone(placement) });
    setMessage(`正在预览 ${maps.find((item) => item.id === placement.childMapId)?.title ?? "子地图"} 在 ${parent.title} 中的位置；保存前不会建立正式修订。`);
  };
  const beginNewRange = (parent: MapDocument, child: MapDocument) => {
    setCalibrationError(null);
    const placement: MapPlacement = { id: `placement.${crypto.randomUUID()}`, childMapId: child.id, kind: "range", point: null, bounds: [{ x: 35, y: 35 }, { x: 65, y: 35 }, { x: 65, y: 65 }, { x: 35, y: 65 }], transform: null, precision: "illustrative", note: "作者明确建立的范围定位；仅表达子地图在父图中的覆盖区域。" };
    setSpatialDraft({ parentMapId: parent.id, baseContentHash: parent.contentHash, placement, savedPlacement: structuredClone(placement) });
    setMessage(`正在预览 ${child.title} 在 ${parent.title} 中的范围；可拖动、缩放或逐点调整，保存前不会写入。`);
  };
  const updateSpatialDraft = (placement: MapPlacement) => setSpatialDraft((current) => current ? { ...current, placement } : current);
  const cancelSpatialEdit = () => { setSpatialDraft(null); setCalibrationError(null); setMessage("已取消空间定位编辑；已保存位置没有改变。"); };
  const beginCalibration = () => {
    if (!spatialDraft) return;
    const parent = maps.find((item) => item.id === spatialDraft.parentMapId);
    const child = maps.find((item) => item.id === spatialDraft.placement.childMapId);
    if (!parent || !child) { setCalibrationError("父图或子图已失效，无法建立校准。"); return; }
    const childBounds = child.content.coordinateSystem.bounds;
    const parentBounds = parent.content.coordinateSystem.bounds;
    const sourcePoints = [mapCanvasPointToCoordinate({ x: 25, y: 50 }, childBounds), mapCanvasPointToCoordinate({ x: 75, y: 50 }, childBounds)] as MapCalibrationControlPoints["sourcePoints"];
    const calibration: MapCalibrationControlPoints = spatialDraft.placement.kind === "calibrated" && spatialDraft.placement.calibration
      ? structuredClone(spatialDraft.placement.calibration)
      : spatialDraft.placement.kind === "calibrated" && spatialDraft.placement.transform
        ? { sourcePoints, targetPoints: sourcePoints.map((point) => applyMapSimilarityTransform(point, spatialDraft.placement.transform!)) as MapCalibrationControlPoints["targetPoints"] }
        : (() => { const anchor = placementAnchor(spatialDraft.placement); const center = mapCanvasPointToCoordinate(anchor, parentBounds); const width = parentBounds.maxX - parentBounds.minX; return { sourcePoints, targetPoints: [{ x: center.x - width * .15, y: center.y }, { x: center.x + width * .15, y: center.y }] as MapCalibrationControlPoints["targetPoints"] }; })();
    try {
      const transform = solveMapSimilarityTransform(calibration);
      const placement: MapPlacement = { ...spatialDraft.placement, kind: "calibrated", point: null, calibration, transform, bounds: calibratedPlacementBounds({ childBounds, parentBounds, transform }), precision: "calibrated", note: "作者以两个对应点校准；不生成空间或世界事实。" };
      setSpatialDraft({ ...spatialDraft, placement }); setCalibrationError(null); setMessage("校准预览已建立；父图正在使用同一变换投影子图轮廓与图形，保存前不会写入。");
    } catch (error) { setCalibrationError(error instanceof Error ? error.message : "校准点无效。"); }
  };
  const updateCalibrationPoint = (side: "sourcePoints" | "targetPoints", index: 0 | 1, axis: "x" | "y", value: number) => {
    if (!spatialDraft?.placement.calibration) return;
    const parent = maps.find((item) => item.id === spatialDraft.parentMapId); const child = maps.find((item) => item.id === spatialDraft.placement.childMapId);
    if (!parent || !child) return;
    const calibration = structuredClone(spatialDraft.placement.calibration) as MapCalibrationControlPoints;
    calibration[side][index][axis] = value;
    try {
      const sourceBounds = child.content.coordinateSystem.bounds; const targetBounds = parent.content.coordinateSystem.bounds;
      if (calibration.sourcePoints.some((point) => !pointWithinBounds(point, sourceBounds))) throw new Error("子图校准点必须位于子图坐标边界内。");
      if (calibration.targetPoints.some((point) => !pointWithinBounds(point, targetBounds))) throw new Error("父图对应点必须位于父图坐标边界内。");
      const transform = solveMapSimilarityTransform(calibration);
      updateSpatialDraft({ ...spatialDraft.placement, calibration, transform, bounds: calibratedPlacementBounds({ childBounds: child.content.coordinateSystem.bounds, parentBounds: parent.content.coordinateSystem.bounds, transform }) });
      setCalibrationError(null); setMessage("校准对应点已更新到临时预览；尚未保存。");
    } catch (error) {
      updateSpatialDraft({ ...spatialDraft.placement, calibration }); setCalibrationError(error instanceof Error ? error.message : "校准点无效。");
    }
  };
  const saveSpatialEdit = () => {
    if (calibrationError) { setMessage(`校准尚不能保存：${calibrationError}`); return; }
    if (!projectId || !spatialDraft || busy) return;
    const parent = maps.find((item) => item.id === spatialDraft.parentMapId);
    if (!parent) { setMessage("父地图已失效；没有产生部分写入。"); return; }
    const draft = spatialDraft;
    const placements = [...parent.content.placements.filter((item) => item.id !== draft.placement.id), draft.placement];
    setBusy(true); setMessage("正在保存空间定位；当前画布仍是临时预览。");
    void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: draft.baseContentHash, document: { ...parent, content: { ...parent.content, placements } }, token }))
      .then((next) => { if (next.conflict) throw new Error("父地图已有更新，请刷新后重新应用当前预览"); const saved = next.document as MapDocument; setMaps((items) => items.map((item) => item.id === saved.id ? saved : item)); setSpatialDraft(null); setMessage("空间定位已保存为一个地图修订；刷新或重新打开后会恢复。"); })
      .catch((error: unknown) => { setMessage(error instanceof Error ? `空间定位保存失败：${error.message}；预览仍保留，可取消或刷新后重试。` : "空间定位保存失败；预览仍保留。"); })
      .finally(() => setBusy(false));
  };
  const spatialPointFromEvent = (event: PointerEvent<HTMLElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); return clampMapPoint({ x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100 }); };
  const startSpatialDrag = (event: PointerEvent<HTMLButtonElement>, placement: MapPlacement) => { if (!spatialDraft || spatialDraft.placement.id !== placement.id || placement.kind === "calibrated") return; event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); spatialDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, placement: structuredClone(placement) }; };
  const dragSpatialPlacement = (event: PointerEvent<HTMLElement>) => { const active = spatialDrag.current; if (!active || active.pointerId !== event.pointerId || !spatialDraft) return; const bounds = event.currentTarget.getBoundingClientRect(); const anchor = placementAnchor(active.placement); updateSpatialDraft(movePlacement(active.placement, { x: anchor.x + ((event.clientX - active.startX) / bounds.width) * 100, y: anchor.y + ((event.clientY - active.startY) / bounds.height) * 100 })); };
  const endSpatialDrag = (event: PointerEvent<HTMLElement>) => { if (spatialDrag.current?.pointerId === event.pointerId) { spatialDrag.current = null; setMessage("位置已在临时预览中调整；点击保存才会建立正式修订。"); } };
  const saveMap = (document: MapDocument, success: string, failure: string, after?: { success?: () => void; failure?: () => void }) => {
    if (!projectId || busy) return;
    if (historicalRevision) { setMessage("当前打开的是历史地图修订，只读显示；请返回当前版本后再编辑。" ); return; }
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
  const deleteSelectedDrawings = () => {
    if (!map || !selectedDrawingIds.length) return;
    const blocked = map.content.drawings.filter((item) => selectedDrawingIds.includes(item.id) && map.content.layers.find((layer) => layer.id === item.layerId)?.locked);
    if (blocked.length) { setMessage("多选中包含锁定图层对象；没有部分删除。" ); return; }
    saveAuthoringContent({ ...map.content, drawings: map.content.drawings.filter((item) => !selectedDrawingIds.includes(item.id)) }, `已删除 ${selectedDrawingIds.length} 个图示；正式资料未改变。`, { success: () => { setSelectedDrawingIds([]); setSelectedDrawingId(null); } });
  };
  const duplicateSelectedDrawings = () => {
    if (!map || !selectedDrawingIds.length) return;
    const copies = map.content.drawings.filter((item) => selectedDrawingIds.includes(item.id)).map((item) => ({ ...item, id: `drawing.${crypto.randomUUID()}`, points: item.points.map((point) => ({ x: Math.min(100, point.x + 2), y: Math.min(100, point.y + 2) })) }));
    saveAuthoringContent({ ...map.content, drawings: [...map.content.drawings, ...copies] }, `已复制 ${copies.length} 个图示为独立对象。`, { success: () => setSelectedDrawingIds(copies.map((item) => item.id)) });
  };
  const createLocalMapFromArea = () => {
    if (!map || !selectedDrawing || selectedDrawing.kind !== "area" || !projectId || busy) return;
    const parent = map;
    setBusy(true);
    void props.runtime.withConnection(async (token) => {
      const created = await createVisualDocument({ projectId, type: "map", title: `${selectedDrawing.label ?? "局部范围"} · 局部地图`, token }) as MapDocument;
      const localWrite = await updateVisualDocument({ projectId, relativePath: created.relativePath, expectedHash: created.contentHash, document: { ...created, content: { ...created.content, ...createStarterContent("geography") } }, token });
      const child = localWrite.document as MapDocument;
      const placement: MapPlacement = { id: `placement.${parent.id}.${child.id}`, childMapId: child.id, kind: "range", point: null, bounds: selectedDrawing.points, transform: null, precision: "illustrative", note: "由作者圈选范围建立；尚未校准子图坐标。" };
      const parentWrite = await updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: parent.contentHash, document: { ...parent, content: { ...parent.content, placements: [...parent.content.placements, placement] } }, token });
      return { child, parent: parentWrite.document as MapDocument };
    }).then(({ child, parent: nextParent }) => { setMaps((items) => [...items.map((item) => item.id === nextParent.id ? nextParent : item), child]); navigateToMap(child.id); setMessage("已从圈选范围建立局部地图；范围定位不冒充坐标校准。" ); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "局部地图建立失败。" )).finally(() => setBusy(false));
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
    const placementFor = (targetMapId: string): MapPlacement | null => parent ? { id: `placement.${parent.id}.${targetMapId}`, childMapId: targetMapId, kind: "point", point: { x: parent.content.markers.find((item) => item.objectId === scopeObjectId)?.x ?? 50, y: parent.content.markers.find((item) => item.objectId === scopeObjectId)?.y ?? 50 }, bounds: [], transform: null, precision: "illustrative", note: `入口位置：${scope.title}` } : null;
    if (existing) {
      const entrance = entranceFor(existing.id);
      const placement = placementFor(existing.id);
      if (!parent || parent.id === existing.id || (parent.content.entrances.some((item) => item.id === entrance?.id && item.targetMapId === existing.id) && parent.content.placements.some((item) => item.id === placement?.id))) { navigateToMap(existing.id); return; }
      setBusy(true);
      void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: parent.contentHash, document: { ...parent, content: { ...parent.content, entrances: [...parent.content.entrances.filter((item) => item.id !== entrance!.id), entrance!], placements: [...parent.content.placements.filter((item) => item.id !== placement!.id), placement!] } }, token }))
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
      const placement = placementFor((localWrite.document as MapDocument).id)!;
      const parentWrite = await updateVisualDocument({ projectId, relativePath: parent.relativePath, expectedHash: parent.contentHash, document: { ...parent, content: { ...parent.content, entrances: [...parent.content.entrances.filter((item) => item.id !== entrance.id), entrance], placements: [...parent.content.placements.filter((item) => item.id !== placement.id), placement] } }, token });
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
  const addConnection = () => {
    if (!map || !connectionTargetId || !projectId || busy) return;
    const target = maps.find((item) => item.id === connectionTargetId);
    if (!target || target.id === map.id) { setMessage("请选择另一张可用地图作为通道终点。" ); return; }
    const id = `connection.${crypto.randomUUID()}`;
    const connection: MapConnection = {
      id,
      title: connectionKind === "stairs" ? "楼梯连接" : connectionKind === "door" ? "门连接" : connectionKind === "road" ? "道路接口" : "跨图通道",
      kind: connectionKind,
      direction: "both",
      from: { mapId: map.id, endpointId: `${id}.from`, x: 50, y: 50, layerId: activeLayerId },
      to: { mapId: target.id, endpointId: `${id}.to`, x: 50, y: 50, layerId: target.content.layers[0]?.id ?? null },
      relationId: null,
      note: "地图导航通道；尚未确认成正式世界关系。"
    };
    saveMap({ ...map, content: { ...map.content, connections: [...map.content.connections, connection] } }, "跨图通道已保存为两个明确端点；未自动写入正式通行关系。", "跨图通道保存失败。", { success: () => setConnectionTargetId("") });
  };
  const removeConnection = (owner: MapDocument, connectionId: string) => {
    if (!projectId || busy) return;
    setBusy(true);
    void props.runtime.withConnection((token) => updateVisualDocument({ projectId, relativePath: owner.relativePath, expectedHash: owner.contentHash, document: { ...owner, content: { ...owner.content, connections: owner.content.connections.filter((item) => item.id !== connectionId) } }, token }))
      .then((next) => { setMaps((current) => current.map((item) => item.id === owner.id ? next.document as MapDocument : item)); setMessage("地图通道已移除；正式关系未改变。"); })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "通道移除失败。"))
      .finally(() => setBusy(false));
  };
  const openMapHistory = () => {
    if (!projectId || !map) return;
    void listMapRevisions(projectId, map.relativePath).then((items) => setMapRevisions(items)).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "地图历史读取失败。"));
  };
  const openMapRevision = (contentHash: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("mapId", map?.id ?? "");
    params.set("mapRevision", contentHash);
    window.location.assign(`${window.location.pathname}?${params.toString()}`);
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
          const background: MapBackground = { id: `background.${crypto.randomUUID()}`, title: file.name, assetPath: asset.relativePath, mimeType: asset.mimeType, width: image.naturalWidth, height: image.naturalHeight, opacity: 1, visible: true, transform: { x: 0, y: 0, scale: 1, rotation: 0 } };
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

  if (!projectId) return <main className="shell-workspace map-workbench-shell"><MaterialsSectionNavigation current="map" /><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  const selected = locations.find((item) => item.id === selectedId) || null;
  const state = markerState(selected, inspector);
  const scopedChildren = structure && map?.content.scopeObjectId ? structure.childrenByParentId.get(map.content.scopeObjectId) ?? [] : [];
  const visibleLayerIds = new Set(map?.content.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? []);
  const orderedDrawings = map ? [...map.content.drawings].sort((left, right) => map.content.layers.findIndex((layer) => layer.id === left.layerId) - map.content.layers.findIndex((layer) => layer.id === right.layerId)) : [];
  const visibleAdministrationRegions = map?.content.regions.filter((region) => region.layerId === ADMINISTRATION_LAYER_ID && visibleLayerIds.has(region.layerId)) ?? [];
  const administrativeLocationIds = new Set(administrationStructure?.edges.flatMap((edge) => [edge.sourceObjectId, edge.targetObjectId]) ?? []);
  const administrativeLocations = locations.filter((location) => administrativeLocationIds.has(location.id));
  const boundaryPending = administrativeLocations.filter((location) => !map?.content.regions.some((region) => region.layerId === ADMINISTRATION_LAYER_ID && region.objectId === location.id));
  const stageSize = fittedMapStage(canvasSize, map?.content.baseImage ?? null);
  const activeLayer = map?.content.layers.find((item) => item.id === activeLayerId) ?? map?.content.layers[0] ?? null;
  const parentMap = map && !historicalRevision ? maps.find((candidate) => candidate.content.placements.some((placement) => placement.childMapId === map.id) || candidate.content.entrances.some((entrance) => entrance.targetMapId === map.id)) ?? null : null;
  const connectedMaps = map ? (historicalRevision ? [map] : maps).flatMap((owner) => owner.content.connections.filter((connection) => connection.from.mapId === map.id || connection.to.mapId === map.id).map((connection) => ({ owner, connection }))) : [];
  const showInspector = inspectorOpen && Boolean(selected);
  const searchableMaps = maps.filter((item) => (showArchivedMaps || !item.content.lifecycle.archived) && (!mapSearch.trim() || item.title.toLocaleLowerCase().includes(mapSearch.trim().toLocaleLowerCase())));
  const managerParent = maps.find((item) => item.id === managerParentId && !item.content.lifecycle.archived) ?? maps.find((item) => !item.content.lifecycle.archived) ?? null;
  const placedChildIds = new Set(managerParent?.content.placements.map((item) => item.childMapId) ?? []);
  const unlocatedMaps = maps.filter((item) => !item.content.lifecycle.archived && item.id !== managerParent?.id && !placedChildIds.has(item.id));
  return <main className="shell-workspace map-workbench-shell" aria-label="地点地图">
    <section className={`map-workbench ${editingRegionObjectId ? "is-boundary-editing" : ""}`} data-testid="map-m2-workspace">
      <header className="map-workbench-toolbar">
        <MaterialsSectionNavigation current="map" />
        <div className="map-workbench-title"><MapPin aria-hidden="true" /><div><strong>地点地图</strong></div></div>
        <label>当前地图<select aria-label="选择地图" value={mapId ?? ""} onChange={(event) => selectMap(event.target.value)}><option value="">地图管理</option>{maps.filter((item) => !item.content.lifecycle.archived).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        {map ? <label>地图名称<input aria-label="地图名称" value={mapTitle} onChange={(event) => setMapTitle(event.target.value)} onBlur={saveMapTitle} disabled={busy || Boolean(historicalRevision)} /></label> : null}
        <div className="map-workbench-toolbar-actions">
          {materialReturn ? <button type="button" onClick={() => window.location.assign(materialReturn)}><ArrowLeft aria-hidden="true" />返回资料</button> : null}
          {map ? <><button type="button" onClick={showManager}><MapPin aria-hidden="true" />地图管理</button><button type="button" onClick={openMapHistory}><RotateCcw aria-hidden="true" />历史</button></> : null}
          {map && !historicalRevision ? <><label className="map-new-template">新地图起点<select aria-label="新地图起点" value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value as MapContent["template"])}><option value="geography">地理</option><option value="starfield">星域</option><option value="building">建筑</option><option value="blank">空白</option></select></label><button type="button" onClick={create} disabled={busy}>新地图</button></> : null}
          {map && !historicalRevision ? <><input ref={backgroundInput} className="map-background-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { importBackground(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /><button type="button" onClick={() => backgroundInput.current?.click()} disabled={busy}>底图</button></> : null}
          {!historicalRevision ? <button type="button" aria-pressed={editingLayout} onClick={() => setEditingLayout((value) => !value)} disabled={busy}>{editingLayout ? <><Eye aria-hidden="true" />浏览地图</> : <><PencilRuler aria-hidden="true" />编辑布局</>}</button> : null}
          <button type="button" onClick={() => window.dispatchEvent(new Event("story-studio-close-project-directory"))}><PanelLeftClose aria-hidden="true" />专注地图</button>
          <button type="button" aria-expanded={showInspector} aria-controls="map-m2-inspector" onClick={() => setInspectorOpen((value) => !value)} disabled={!selected}><PanelRight aria-hidden="true" />{showInspector ? "收起地点详情" : "地点详情"}</button>
        </div>
        {map ? <nav className="map-navigation-crumbs" aria-label="地图层级"><button type="button" onClick={() => parentMap && navigateToMap(parentMap.id)} disabled={!parentMap}>上层</button>{parentMap ? <><button type="button" onClick={() => navigateToMap(parentMap.id)}>{parentMap.title}</button><span>›</span></> : null}<strong>{map.title}</strong><span className="map-workbench-place-count">{map.content.markers.length} 个已放置地点 · {props.runtime.workVersionLabel ?? (workVersionId ? "正在读取版本" : "尚未建立作品版本")}</span>{mapRevisions.length ? <details><summary>{mapRevisions.length} 个修订</summary>{mapRevisions.map((item) => <button key={item.contentHash} type="button" disabled={item.current} onClick={() => openMapRevision(item.contentHash)}>修订 {item.revision}{item.current ? " · 当前" : ""} · {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "时间未知"}</button>)}</details> : null}</nav> : null}
        {historicalRevision ? <div className="map-historical-banner" role="status"><span>历史地图修订 · 只读。仅当前地图按所选修订恢复；跨图目标没有成套历史快照时按当前版本打开，不把当前外部连接拼入旧画面。</span><button type="button" onClick={() => { const params = new URLSearchParams(window.location.search); params.delete("mapRevision"); window.location.assign(`${window.location.pathname}?${params.toString()}`); }}>返回当前地图</button></div> : null}
        {editingRegionObjectId ? <div className="map-boundary-editor-toolbar" role="group" aria-label="行政边界编辑"><span>边界点 {draftRegionPoints.length}</span><button type="button" onClick={removeBoundaryPoint} disabled={!draftRegionPoints.length || busy}>移除最后一点</button><button type="button" onClick={cancelBoundary} disabled={busy}>取消边界</button><button type="button" className="primary-action" onClick={saveBoundary} disabled={busy || draftRegionPoints.length < 3}>保存边界</button></div> : null}
      </header>
      <div className="map-workbench-notice" aria-live="polite">{message ? <p className="map-workbench-message" role="status">{message}</p> : null}</div>
      {!maps.length ? <section className="map-workbench-empty"><h1>建立第一张作者地图</h1><p>选择轻量起点后即可绘制；所有初始图形都只是图示，不会改变地点、关系或角色知情。</p><label>地图起点<select aria-label="地图起点" value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value as MapContent["template"])}><option value="geography">地理区域</option><option value="starfield">星域</option><option value="building">建筑平面</option><option value="blank">空白画布</option></select></label><button type="button" aria-label="建立地点示意图" className="primary-action" disabled={busy} onClick={create}>建立地图</button></section> : !map ? <section className="map-manager" aria-label="地图管理">
        <header><div><small>资料 · 地图</small><h1>地图管理</h1><p>列表负责查找与整理；空间总览只显示当前父图上的明确放置。</p></div><label><Search aria-hidden="true" />搜索地图<input value={mapSearch} onChange={(event) => setMapSearch(event.target.value)} /></label><div role="group" aria-label="地图管理视图"><button type="button" aria-pressed={managerView === "list"} onClick={() => setManagerView("list")}>列表</button><button type="button" aria-pressed={managerView === "spatial"} onClick={() => setManagerView("spatial")}>空间总览</button></div><label><input type="checkbox" checked={showArchivedMaps} onChange={(event) => setShowArchivedMaps(event.target.checked)} />显示已归档</label><label>新地图起点<select value={templateChoice} onChange={(event) => setTemplateChoice(event.target.value as MapContent["template"])}><option value="geography">地理</option><option value="starfield">星域</option><option value="building">建筑</option><option value="blank">空白</option></select></label><button type="button" className="primary-action" onClick={create} disabled={busy}>新建地图</button></header>
        {managerView === "list" ? <div className="map-manager-list">{searchableMaps.map((item) => { const broken = item.content.connections.filter((connection) => !maps.some((candidate) => candidate.id === connection.from.mapId) || !maps.some((candidate) => candidate.id === connection.to.mapId)).length + item.content.entrances.filter((entrance) => !maps.some((candidate) => candidate.id === entrance.targetMapId)).length; const placements = maps.flatMap((parent) => parent.content.placements.filter((placement) => placement.childMapId === item.id).map((placement) => ({ parent, placement }))); return <article key={item.id} data-archived={item.content.lifecycle.archived}><div className="map-manager-thumbnail">{item.content.backgrounds.length ? <img src={visualAssetUrl(projectId, item.content.backgrounds[0]!.assetPath)} alt="" /> : <MapPin aria-hidden="true" />}</div><div><h2>{item.title}</h2><p>{item.content.scopeObjectId ? locations.find((location) => location.id === item.content.scopeObjectId)?.title ?? "关联地点已失效" : "未关联地点"} · 修订 {item.revision}</p><small>{placements.length ? placements.map(({ parent, placement }) => `${parent.title} · ${placement.kind === "point" ? "点定位" : placement.kind === "range" ? "范围定位" : "已校准"}`).join("；") : "尚未定位"}{broken ? ` · ${broken} 条失效连接` : ""}</small><time>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "旧地图 · 更新时间未知"}</time></div><nav><button type="button" onClick={() => navigateToMap(item.id)}>打开</button><button type="button" onClick={() => void duplicateMap(item)}><Copy aria-hidden="true" />复制</button><button type="button" onClick={() => void setMapArchived(item, !item.content.lifecycle.archived)}>{item.content.lifecycle.archived ? <><RotateCcw aria-hidden="true" />恢复</> : <><Archive aria-hidden="true" />归档</>}</button>{placements[0] ? <button type="button" onClick={() => { setManagerView("spatial"); setManagerParentId(placements[0]!.parent.id); setSpatialDraft(null); }}>父图定位</button> : null}</nav></article>; })}</div> : <div className="map-manager-spatial"><label>父地图<select aria-label="空间总览父地图" value={managerParent?.id ?? ""} onChange={(event) => { setManagerParentId(event.target.value); setSpatialDraft(null); }}>{maps.filter((item) => !item.content.lifecycle.archived).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{managerParent ? <div className="map-manager-parent-canvas" aria-label={`${managerParent.title}空间定位画布`} onPointerMove={dragSpatialPlacement} onPointerUp={endSpatialDrag} onPointerCancel={endSpatialDrag}><strong>{managerParent.title}</strong><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{managerParent.content.placements.map((saved) => spatialDraft?.parentMapId === managerParent.id && spatialDraft.placement.id === saved.id ? spatialDraft.placement : saved).filter((placement) => placement.kind !== "point").map((placement) => <polygon key={placement.id} className={spatialDraft?.placement.id === placement.id ? "is-draft" : ""} points={placement.bounds.map((point) => `${point.x},${point.y}`).join(" ")} />)}{spatialDraft?.parentMapId === managerParent.id && !managerParent.content.placements.some((item) => item.id === spatialDraft.placement.id) && spatialDraft.placement.kind !== "point" ? <polygon className="is-draft" points={spatialDraft.placement.bounds.map((point) => `${point.x},${point.y}`).join(" ")} /> : null}</svg>{managerParent.content.placements.map((saved) => { const placement = spatialDraft?.parentMapId === managerParent.id && spatialDraft.placement.id === saved.id ? spatialDraft.placement : saved; const child = maps.find((item) => item.id === placement.childMapId); if (!child) return null; const point = placementAnchor(placement); return <button key={placement.id} type="button" className={spatialDraft?.placement.id === placement.id ? "is-editing" : ""} style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-label={`编辑 ${child.title} 的${placement.kind === "point" ? "点定位" : placement.kind === "range" ? "范围定位" : "坐标校准"}`} onClick={() => beginSpatialEdit(managerParent, placement)} onPointerDown={(event) => startSpatialDrag(event, placement)}>{child.title}<small>{placement.kind === "point" ? "点定位" : placement.kind === "range" ? `范围 · ${placement.bounds.length} 点` : "坐标已校准"}</small></button>; })}{spatialDraft?.parentMapId === managerParent.id && !managerParent.content.placements.some((item) => item.id === spatialDraft.placement.id) ? (() => { const child = maps.find((item) => item.id === spatialDraft.placement.childMapId); const point = placementAnchor(spatialDraft.placement); return child ? <button type="button" className="is-editing" style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-label={`编辑 ${child.title} 的范围定位`} onPointerDown={(event) => startSpatialDrag(event, spatialDraft.placement)}>{child.title}<small>新范围 · {spatialDraft.placement.bounds.length} 点</small></button> : null; })() : null}</div> : null}<aside><h2>{spatialDraft ? "定位编辑" : "尚未定位"}</h2>{spatialDraft && managerParent ? (() => { const child = maps.find((item) => item.id === spatialDraft.placement.childMapId); const anchor = placementAnchor(spatialDraft.placement); return <section className="map-spatial-editor" aria-label="空间定位编辑器"><strong>{child?.title ?? "子地图"}</strong><small>父图：{managerParent.title} · {spatialDraft.placement.kind === "point" ? "点定位" : spatialDraft.placement.kind === "range" ? `范围定位（保留 ${spatialDraft.placement.bounds.length} 个顶点）` : "坐标校准"}</small><p>画布和数值当前是临时预览；拖动结束不会自动保存。</p>{spatialDraft.placement.kind !== "calibrated" ? <><div><label>水平位置<input aria-label="定位水平位置" type="number" min="0" max="100" step="0.1" value={Number(anchor.x.toFixed(2))} onChange={(event) => updateSpatialDraft(movePlacement(spatialDraft.placement, { ...anchor, x: Number(event.target.value) }))} /></label><label>垂直位置<input aria-label="定位垂直位置" type="number" min="0" max="100" step="0.1" value={Number(anchor.y.toFixed(2))} onChange={(event) => updateSpatialDraft(movePlacement(spatialDraft.placement, { ...anchor, y: Number(event.target.value) }))} /></label></div>{spatialDraft.placement.kind === "range" ? <><label>整体大小（相对当前保存状态）<input aria-label="范围整体大小" type="range" min="25" max="200" step="1" defaultValue="100" onChange={(event) => updateSpatialDraft(scalePlacementBounds(spatialDraft.savedPlacement, Number(event.target.value)))} /></label><details><summary>逐点调整（{spatialDraft.placement.bounds.length}）</summary>{spatialDraft.placement.bounds.map((point, index) => <div key={index}><label>点 {index + 1} X<input aria-label={`范围点 ${index + 1} X`} type="number" min="0" max="100" step="0.1" value={Number(point.x.toFixed(2))} onChange={(event) => updateSpatialDraft({ ...spatialDraft.placement, bounds: spatialDraft.placement.bounds.map((item, pointIndex) => pointIndex === index ? clampMapPoint({ ...item, x: Number(event.target.value) }) : item) })} /></label><label>Y<input aria-label={`范围点 ${index + 1} Y`} type="number" min="0" max="100" step="0.1" value={Number(point.y.toFixed(2))} onChange={(event) => updateSpatialDraft({ ...spatialDraft.placement, bounds: spatialDraft.placement.bounds.map((item, pointIndex) => pointIndex === index ? clampMapPoint({ ...item, y: Number(event.target.value) }) : item) })} /></label></div>)}</details></> : null}<button type="button" onClick={beginCalibration}>改为坐标校准</button></> : null}<div className="map-spatial-editor-actions"><button type="button" onClick={cancelSpatialEdit} disabled={busy}>取消</button><button type="button" className="primary-action" onClick={saveSpatialEdit} disabled={busy || Boolean(calibrationError)}>保存定位</button></div></section>; })() : unlocatedMaps.length ? unlocatedMaps.map((item) => <div key={item.id}><span>{item.title}</span><span><button type="button" disabled={!managerParent || busy} onClick={() => managerParent && placeChildMap(managerParent, item)}>点定位到中心</button><button type="button" disabled={!managerParent || busy} onClick={() => managerParent && beginNewRange(managerParent, item)}>建立范围</button></span></div>) : <p>当前可用地图都已有明确放置。点击画布上的子地图即可调整。</p>}</aside></div>}
        {managerView === "spatial" && spatialDraft && managerParent ? <MapCalibrationPanel parent={managerParent} child={maps.find((item) => item.id === spatialDraft.placement.childMapId) ?? null} placement={spatialDraft.placement} error={calibrationError} onChange={updateCalibrationPoint} /> : null}
      </section> : <>
        <div className={`map-workbench-body ${showInspector ? "" : "is-inspector-collapsed"} ${historicalRevision ? "is-history-readonly" : ""}`}>
          {!historicalRevision ? <aside className="map-authoring-palette" aria-label="地图绘图工具">
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
              <label>旋转<input aria-label="图示旋转" type="number" min="-180" max="180" value={selectedDrawing.rotation} onChange={(event) => updateSelectedDrawing({ rotation: Number(event.target.value) }, "图示旋转已保存。")}/></label>
              <details><summary>顶点（{selectedDrawing.points.length}）</summary><div className="map-drawing-vertices">{selectedDrawing.points.map((point, index) => <div key={`${selectedDrawing.id}:${index}`}><label>X<input aria-label={`顶点 ${index + 1} X`} type="number" min="0" max="100" value={point.x} onChange={(event) => { const points = selectedDrawing.points.map((item, itemIndex) => itemIndex === index ? { ...item, x: Number(event.target.value) } : item); updateSelectedDrawing({ points }, "图示顶点已保存。" ); }} /></label><label>Y<input aria-label={`顶点 ${index + 1} Y`} type="number" min="0" max="100" value={point.y} onChange={(event) => { const points = selectedDrawing.points.map((item, itemIndex) => itemIndex === index ? { ...item, y: Number(event.target.value) } : item); updateSelectedDrawing({ points }, "图示顶点已保存。" ); }} /></label><button type="button" disabled={selectedDrawing.points.length <= (selectedDrawing.kind === "area" ? 3 : selectedDrawing.kind === "symbol" ? 1 : 2)} onClick={() => updateSelectedDrawing({ points: selectedDrawing.points.filter((_, itemIndex) => itemIndex !== index) }, "图示顶点已删除。")}>删</button></div>)}<button type="button" onClick={() => updateSelectedDrawing({ points: [...selectedDrawing.points, { ...selectedDrawing.points.at(-1)! }] }, "图示顶点已新增。")}>新增顶点</button></div></details>
              <button type="button" onClick={() => { if (!map) return; const copy = { ...selectedDrawing, id: `drawing.${crypto.randomUUID()}`, points: selectedDrawing.points.map((point) => ({ x: Math.min(100, point.x + 2), y: Math.min(100, point.y + 2) })) }; saveAuthoringContent({ ...map.content, drawings: [...map.content.drawings, copy] }, "图示副本已保存为独立对象。", { success: () => setSelectedDrawingId(copy.id) }); }}><Copy aria-hidden="true" />复制图示</button>
              <button type="button" aria-pressed={selectedDrawingIds.includes(selectedDrawing.id)} onClick={() => setSelectedDrawingIds((items) => items.includes(selectedDrawing.id) ? items.filter((id) => id !== selectedDrawing.id) : [...items, selectedDrawing.id])}>{selectedDrawingIds.includes(selectedDrawing.id) ? "移出多选" : "加入多选"}</button>
              {selectedDrawing.kind === "area" ? <button type="button" onClick={createLocalMapFromArea}>以此范围建立局部地图</button> : null}
              <button type="button" onClick={deleteDrawing} disabled={busy}><Trash2 aria-hidden="true" />删除选中图示</button>
            </section> : null}
            {selectedDrawingIds.length ? <section className="map-drawing-editor" aria-label="多选操作"><strong>已多选 {selectedDrawingIds.length} 项</strong><button type="button" onClick={duplicateSelectedDrawings} disabled={busy}>复制所选</button><button type="button" onClick={deleteSelectedDrawings} disabled={busy}>删除所选</button><button type="button" onClick={() => setSelectedDrawingIds([])}>取消多选</button></section> : null}
            <button type="button" className="primary-action" onClick={openTianyiWithMap}>交给天意{selectedDrawingId ? " · 选中图示" : " · 当前地图"}</button>
            <details><summary>图层</summary>{map.content.layers.map((layer, index) => <div key={layer.id} className="map-authoring-layer-row"><span>{layer.title}</span><button type="button" aria-label={`上移${layer.title}`} disabled={index === 0} onClick={() => { const layers = [...map.content.layers]; [layers[index - 1], layers[index]] = [layers[index]!, layers[index - 1]!]; saveMap({ ...map, content: { ...map.content, layers } }, "图层顺序已保存。", "图层保存失败。"); }}>↑</button><button type="button" aria-label={`下移${layer.title}`} disabled={index === map.content.layers.length - 1} onClick={() => { const layers = [...map.content.layers]; [layers[index], layers[index + 1]] = [layers[index + 1]!, layers[index]!]; saveMap({ ...map, content: { ...map.content, layers } }, "图层顺序已保存。", "图层保存失败。"); }}>↓</button><button type="button" aria-pressed={layer.visible} onClick={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) } }, "图层显示已保存。", "图层保存失败。")}>{layer.visible ? "显示" : "隐藏"}</button><button type="button" aria-pressed={layer.locked} onClick={() => saveMap({ ...map, content: { ...map.content, layers: map.content.layers.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item) } }, "图层锁定状态已保存。", "图层保存失败。")}>{layer.locked ? "解锁" : "锁定"}</button></div>)}</details>
            {map.content.activeBackgroundId ? <details><summary>底图变换</summary>{map.content.backgrounds.filter((item) => item.id === map.content.activeBackgroundId).map((background) => <div key={background.id} className="map-authoring-detail-stack"><label>透明度<input type="range" min="0" max="1" step="0.05" value={background.opacity} onChange={(event) => saveMap({ ...map, content: { ...map.content, backgrounds: map.content.backgrounds.map((item) => item.id === background.id ? { ...item, opacity: Number(event.target.value) } : item) } }, "底图透明度已保存。", "底图设置保存失败。")}/></label><label>水平位置<input type="number" value={background.transform.x} onChange={(event) => saveMap({ ...map, content: { ...map.content, backgrounds: map.content.backgrounds.map((item) => item.id === background.id ? { ...item, transform: { ...item.transform, x: Number(event.target.value) } } : item) } }, "底图位置已保存。", "底图设置保存失败。")}/></label><label>垂直位置<input type="number" value={background.transform.y} onChange={(event) => saveMap({ ...map, content: { ...map.content, backgrounds: map.content.backgrounds.map((item) => item.id === background.id ? { ...item, transform: { ...item.transform, y: Number(event.target.value) } } : item) } }, "底图位置已保存。", "底图设置保存失败。")}/></label><label>缩放<input type="number" min="0.01" max="100" step="0.05" value={background.transform.scale} onChange={(event) => saveMap({ ...map, content: { ...map.content, backgrounds: map.content.backgrounds.map((item) => item.id === background.id ? { ...item, transform: { ...item.transform, scale: Number(event.target.value) } } : item) } }, "底图缩放已保存。", "底图设置保存失败。")}/></label><label>旋转<input type="number" min="-180" max="180" value={background.transform.rotation} onChange={(event) => saveMap({ ...map, content: { ...map.content, backgrounds: map.content.backgrounds.map((item) => item.id === background.id ? { ...item, transform: { ...item.transform, rotation: Number(event.target.value) } } : item) } }, "底图旋转已保存。", "底图设置保存失败。")}/></label><small>底图变换独立于地图坐标；替换图片不会移动结构化对象。</small></div>)}</details> : null}
            <details><summary>跨图通道（{connectedMaps.length}）</summary><div className="map-authoring-detail-stack"><label>类型<select value={connectionKind} onChange={(event) => setConnectionKind(event.target.value as MapConnection["kind"])}><option value="door">门</option><option value="stairs">楼梯</option><option value="elevator">升降机</option><option value="road">道路接口</option><option value="passage">通道</option><option value="portal">传送门</option></select></label><label>目标地图<select value={connectionTargetId} onChange={(event) => setConnectionTargetId(event.target.value)}><option value="">选择地图</option>{maps.filter((item) => item.id !== map.id && !item.content.lifecycle.archived).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" onClick={addConnection} disabled={!connectionTargetId || busy}>建立两个端点</button>{connectedMaps.map(({ owner, connection }) => <div key={`${owner.id}:${connection.id}`} className="map-connection-row"><button type="button" onClick={() => navigateToMap(connection.from.mapId === map.id ? connection.to.mapId : connection.from.mapId)}>{connection.title} · {maps.find((item) => item.id === (connection.from.mapId === map.id ? connection.to.mapId : connection.from.mapId))?.title ?? "目标缺失"}</button><button type="button" onClick={() => removeConnection(owner, connection.id)}>移除</button></div>)}</div></details>
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
          </aside> : null}
          <section ref={canvasRef} className={`map-m1-canvas map-workbench-canvas ${editingLayout ? "is-editing" : "is-browsing"}`} aria-label="地点示意图画布" onClick={handleCanvasClick} onPointerDown={startPan} onPointerMove={pan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={zoomCanvas}>
            <div className="map-workbench-grid" aria-hidden="true" />
            <div className="map-m2-viewport" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
              <div ref={stageRef} className="map-workbench-stage" style={{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }}>
                {map.content.backgrounds.filter((background) => background.visible && background.id === map.content.activeBackgroundId).map((background) => <img key={background.id} className="map-workbench-background" src={visualAssetUrl(projectId, background.assetPath)} alt="" style={{ opacity: background.opacity, transform: `translate(${background.transform.x}px, ${background.transform.y}px) rotate(${background.transform.rotation}deg) scale(${background.transform.scale})` }} draggable={false} />)}
                <MapDrawingOverlay drawings={orderedDrawings} labels={map.content.labels} visibleLayerIds={visibleLayerIds} selectedId={selectedDrawingId} draft={draftDrawingPoints} draftKind={authoringTool} authoring={authoringTool !== "browse" || editingLayout || Boolean(editingRegionObjectId)} onSelect={(id) => { if (authoringTool === "browse" && !editingLayout) setSelectedDrawingId(id); }} />
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
                {!historicalRevision ? map.content.placements.map((placement) => { const child = maps.find((candidate) => candidate.id === placement.childMapId); return child && placement.kind === "calibrated" ? <CalibratedChildOverlay key={`calibrated.${placement.id}`} parent={map} child={child} placement={placement} /> : null; }) : null}
                {map.content.placements.map((placement) => { const child = maps.find((candidate) => candidate.id === placement.childMapId); if (!child) return null; const point = placement.point ?? placementAnchor(placement); return <button key={placement.id} type="button" className={`map-local-placement is-${placement.kind}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={(event) => { event.stopPropagation(); navigateToMap(child.id); }}><MapPin aria-hidden="true" /><span>{child.title}</span><small>{placement.kind === "point" ? "示意位置" : placement.kind === "range" ? "覆盖范围" : "坐标已校准"}</small></button>; })}
                {connectedMaps.map(({ owner, connection }) => { const endpoint = connection.from.mapId === map.id ? connection.from : connection.to; const targetId = connection.from.mapId === map.id ? connection.to.mapId : connection.from.mapId; const target = maps.find((candidate) => candidate.id === targetId); return <button key={`${owner.id}:${connection.id}`} type="button" className="map-cross-connection" style={{ left: `${endpoint.x}%`, top: `${endpoint.y}%` }} disabled={!target} onClick={(event) => { event.stopPropagation(); if (target) navigateToMap(target.id); }}><DoorOpen aria-hidden="true" /><span>{connection.title}</span><small>{target?.title ?? "目标已失效"}</small></button>; })}
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

function MapCalibrationPanel(props: { parent: MapDocument; child: MapDocument | null; placement: MapPlacement; error: string | null; onChange(side: "sourcePoints" | "targetPoints", index: 0 | 1, axis: "x" | "y", value: number): void }) {
  if (!props.child || props.placement.kind !== "calibrated" || !props.placement.calibration || !props.placement.transform) return null;
  const calibration = props.placement.calibration;
  const transform = props.placement.transform;
  const thirdSource = { x: 30, y: 25 };
  const thirdTarget = projectChildCanvasPointToParentCanvas({ point: thirdSource, childBounds: props.child.content.coordinateSystem.bounds, parentBounds: props.parent.content.coordinateSystem.bounds, transform });
  const unit = props.parent.content.coordinateSystem.unit ?? "地图单位";
  return <section className="map-calibration-panel" aria-label="坐标校准">
    <div className="map-calibration-fields">
      <header><div><h2>坐标校准</h2><p>{props.child.title} → {props.parent.title}</p></div><small>右为 X 正向，下为 Y 正向</small></header>
      <p>分别填写子图上的 A、B 两点及它们在父图中的对应位置。两个点共同确定平移、等比缩放和旋转。</p>
      {([0, 1] as const).map((index) => <fieldset key={index}><legend>对应点 {index === 0 ? "A" : "B"}</legend>{(["sourcePoints", "targetPoints"] as const).map((side) => <div key={side}><strong>{side === "sourcePoints" ? "子图" : "父图"}</strong>{(["x", "y"] as const).map((axis) => <label key={axis}>{axis.toUpperCase()}<input aria-label={`${side === "sourcePoints" ? "子图" : "父图"}点 ${index === 0 ? "A" : "B"} ${axis.toUpperCase()}`} type="number" step="0.1" value={Number(calibration[side][index][axis].toFixed(4))} onChange={(event) => props.onChange(side, index, axis, Number(event.target.value))} /></label>)}</div>)}</fieldset>)}
      {props.error ? <p className="map-calibration-error" role="alert">无法保存：{props.error}</p> : <p className="map-calibration-result">预览：缩放 {transform.scale.toFixed(3)} 倍 · 旋转 {transform.rotation.toFixed(2)}° · 父图单位 {unit}</p>}
    </div>
    <div className="map-calibration-preview"><header><strong>父图对应预览</strong><small>十字点未参与求解，用于检查整体对应</small></header><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="校准实际对应预览" data-third-x={thirdTarget.x.toFixed(4)} data-third-y={thirdTarget.y.toFixed(4)}>
      <CalibratedChildDrawingContent parent={props.parent} child={props.child} placement={props.placement} />
      {props.placement.bounds.length ? <polygon className="map-calibration-outline" points={props.placement.bounds.map((point) => `${point.x},${point.y}`).join(" ")} /> : null}
      {calibration.targetPoints.map((point, index) => { const canvasPoint = projectCoordinateToCanvas(point, props.parent); return <g key={index} className="map-calibration-control"><circle cx={canvasPoint.x} cy={canvasPoint.y} r="1.4" /><text x={canvasPoint.x + 2} y={canvasPoint.y - 2}>{index === 0 ? "A" : "B"}</text></g>; })}
      <g className="map-calibration-third" transform={`translate(${thirdTarget.x} ${thirdTarget.y})`}><path d="M -1.5 0 H 1.5 M 0 -1.5 V 1.5" /><text x="2" y="-2">检查点</text></g>
    </svg></div>
  </section>;
}

function CalibratedChildOverlay(props: { parent: MapDocument; child: MapDocument; placement: MapPlacement }) {
  if (props.placement.kind !== "calibrated" || !props.placement.transform) return null;
  return <svg className="map-calibrated-child-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${props.child.title} 校准叠加`} data-calibration-scale={props.placement.transform.scale.toFixed(6)} data-calibration-rotation={props.placement.transform.rotation.toFixed(6)}><CalibratedChildDrawingContent {...props} /></svg>;
}

function CalibratedChildDrawingContent(props: { parent: MapDocument; child: MapDocument; placement: MapPlacement }) {
  if (!props.placement.transform) return null;
  const project = (point: { x: number; y: number }) => projectChildCanvasPointToParentCanvas({ point, childBounds: props.child.content.coordinateSystem.bounds, parentBounds: props.parent.content.coordinateSystem.bounds, transform: props.placement.transform! });
  return <g data-child-map-id={props.child.id}>{props.child.content.drawings.map((drawing) => {
    const points = drawing.points.map(project); if (!points.length) return null;
    if (drawing.kind === "symbol") return <circle key={drawing.id} cx={points[0]!.x} cy={points[0]!.y} r={Math.max(.8, drawing.size * props.placement.transform!.scale / 4)} fill={drawing.fillColor} stroke={drawing.strokeColor} strokeWidth=".4" vectorEffect="non-scaling-stroke" />;
    if (drawing.kind === "area" || (drawing.kind === "terrain" && drawing.subtype === "land")) return <polygon key={drawing.id} points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill={drawing.fillColor} fillOpacity={drawing.fillOpacity} stroke={drawing.strokeColor} strokeWidth=".45" vectorEffect="non-scaling-stroke" />;
    return <polyline key={drawing.id} points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={drawing.strokeColor} strokeWidth=".55" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
  })}</g>;
}

function projectCoordinateToCanvas(point: { x: number; y: number }, map: MapDocument) {
  const bounds = map.content.coordinateSystem.bounds;
  return { x: (point.x - bounds.minX) / (bounds.maxX - bounds.minX) * 100, y: (point.y - bounds.minY) / (bounds.maxY - bounds.minY) * 100 };
}

function pointWithinBounds(point: { x: number; y: number }, bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
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
function route(): { mapId: string | null; mapRevision: string | null; placeId: string | null; mapElement: string | null; structureKind: LocationStructureKind } { const params = new URLSearchParams(window.location.search); return { mapId: params.get("mapId"), mapRevision: params.get("mapRevision"), placeId: params.get("mapPlace"), mapElement: params.get("mapElement"), structureKind: params.get("mapStructure") === "administration" ? "administration" : "geography" }; }
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
