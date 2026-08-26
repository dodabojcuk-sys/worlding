import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import {
  AlignCenter,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Hand,
  ImagePlus,
  Images,
  Layers3,
  LocateFixed,
  Lock,
  MapPinned,
  Maximize,
  MousePointer2,
  Pentagon,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Tag,
  Tags,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

import type {
  MapBackground,
  MapDocument,
  MapLabel,
  MapLayer,
  MapMarker,
  MapRegion,
  WorldObjectSummary,
  TianyiObjectContextRef
} from "../lib/localTransport";
import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import {
  createStoryStudioEventReference,
  type StoryStudioEventReference
} from "../../../../src/storyContracts/storyStudioEventReference";
import { visualContextRefs } from "./tianyiObjectContext";

type MapTool = "select" | "pan" | "place" | "region" | "text" | "background" | "layers";
type MapSelection = { kind: "marker" | "region" | "label" | "background"; id: string } | null;
type MapTianyiHandoff =
  | { kind: "visual"; ref: TianyiObjectContextRef }
  | { kind: "event"; reference: StoryStudioEventReference };

export function MapEditor(props: {
  projectId: string;
  document: MapDocument;
  objects: WorldObjectSummary[];
  selection: WorkspaceSelection;
  canUndo: boolean;
  canRedo: boolean;
  onChange(document: MapDocument): void;
  onUndo(): void;
  onRedo(): void;
  onSave(): void;
  onImportImage(file: File): void;
  onSelectObject(object: WorldObjectSummary): void;
  candidateObjectIds: string[];
  onGiveToTianyi(input: MapTianyiHandoff): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const backgroundRef = useRef<L.LayerGroup | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const documentRef = useRef(props.document);
  const onChangeRef = useRef(props.onChange);
  const mapToolRef = useRef<MapTool>("select");
  const activeLayerRef = useRef(props.document.content.layers[0]?.id || "layer.main");
  const selectedRef = useRef<MapSelection>(null);
  const activeBackgroundRef = useRef<string | null>(null);
  const objectsById = useMemo(() => new Map(props.objects.map((object) => [object.id, object])), [props.objects]);
  const candidateKey = props.candidateObjectIds.join("|");
  const [activeLayerId, setActiveLayerId] = useState(props.document.content.layers[0]?.id || "layer.main");
  const [tool, setTool] = useState<MapTool>("select");
  const [selected, setSelected] = useState<MapSelection>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [message, setMessage] = useState("拖入对象，或选择一种地图工具");

  documentRef.current = props.document;
  onChangeRef.current = props.onChange;
  mapToolRef.current = tool;
  activeLayerRef.current = activeLayerId;
  selectedRef.current = selected;

  useEffect(() => {
    if (!props.document.content.layers.some((layer) => layer.id === activeLayerId)) {
      const next = props.document.content.layers[0]?.id || "layer.main";
      setActiveLayerId(next);
      activeLayerRef.current = next;
    }
  }, [activeLayerId, props.document.content.layers]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 5,
      zoomSnap: 0.25,
      attributionControl: false,
      zoomControl: false,
      pmIgnore: false
    });
    map.pm.setGlobalOptions({ snappable: false, allowSelfIntersection: false, finishOn: "dblclick" });
    mapRef.current = map;
    backgroundRef.current = L.layerGroup().addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    map.setView([0, 0], 0);
    let suppressViewportWrites = true;
    let userViewportChange = false;
    let resizeFrame = 0;
    const captureViewport = () => {
      if (suppressViewportWrites || !userViewportChange) return;
      userViewportChange = false;
      const center = map.getCenter();
      const current = documentRef.current;
      const next = { ...current, viewport: { x: round(center.lng), y: round(center.lat), zoom: round(map.getZoom()) } };
      documentRef.current = next;
      onChangeRef.current(next);
    };
    const markViewportChange = () => { userViewportChange = true; };
    const resize = () => {
      map.invalidateSize({ animate: false });
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { suppressViewportWrites = false; });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    map.on("moveend zoomend", captureViewport);
    container.addEventListener("pointerdown", markViewportChange);
    container.addEventListener("wheel", markViewportChange, { passive: true });
    window.addEventListener("resize", resize);
    resizeFrame = requestAnimationFrame(resize);
    return () => {
      cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      container.removeEventListener("pointerdown", markViewportChange);
      container.removeEventListener("wheel", markViewportChange);
      window.removeEventListener("resize", resize);
      map.off();
      map.remove();
      mapRef.current = null;
      backgroundRef.current = null;
      overlayRef.current = null;
    };
  }, [props.document.id]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = backgroundRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const active = props.document.content.backgrounds.find((background) => background.id === props.document.content.activeBackgroundId) || null;
    for (const background of props.document.content.backgrounds) {
      if (!background.visible) continue;
      L.imageOverlay(assetUrl(props.projectId, background.assetPath), [[0, 0], [background.height, background.width]], {
        opacity: background.opacity,
        interactive: false,
        className: background.id === active?.id ? "is-active-map-background" : ""
      }).addTo(layers);
    }
    if (active) {
      const bounds = L.latLngBounds([0, 0], [active.height, active.width]);
      map.setMaxBounds(bounds.pad(0.5));
      if (activeBackgroundRef.current !== active.id) {
        if (props.document.viewport.x === 0 && props.document.viewport.y === 0 && props.document.viewport.zoom === 1) map.fitBounds(bounds, { padding: [24, 24], animate: false });
        else map.setView([props.document.viewport.y, props.document.viewport.x], props.document.viewport.zoom, { animate: false });
      }
    }
    activeBackgroundRef.current = active?.id || null;
  }, [props.document.content.backgrounds, props.document.content.activeBackgroundId, props.document.viewport, props.projectId]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = overlayRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const layerState = new Map(props.document.content.layers.map((layer) => [layer.id, layer]));

    for (const region of props.document.content.regions) {
      const layer = layerState.get(region.layerId);
      if (!layer?.visible) continue;
      const polygon = L.polygon(toLatLngs(region.points), {
        color: region.strokeColor,
        fillColor: region.fillColor,
        fillOpacity: region.fillOpacity,
        weight: selected?.kind === "region" && selected.id === region.id ? 3 : 1.5,
        pmIgnore: false
      }).addTo(layers);
      polygon.bindTooltip(region.title);
      polygon.on("click", () => setSelected({ kind: "region", id: region.id }));
      if (selected?.kind === "region" && selected.id === region.id && !layer.locked && tool === "region") {
        L.PM.reInitLayer(polygon);
        polygon.pm.enable({ allowSelfIntersection: false, snappable: false, draggable: true });
        const commit = () => updateRegionPoints(region.id, polygon);
        polygon.on("pm:edit", commit);
        polygon.on("pm:dragend", commit);
      }
    }

    for (const label of props.document.content.labels) {
      const layer = layerState.get(label.layerId);
      if (!layer?.visible || !label.visible || !labelsVisible) continue;
      const marker = L.marker([label.y, label.x], {
        draggable: selected?.kind === "label" && selected.id === label.id && !layer.locked,
        icon: L.divIcon({
          className: `map-text-label is-${label.treatment} ${selected?.kind === "label" && selected.id === label.id ? "is-selected" : ""}`,
          html: `<span style="--label-size:${label.fontSize}px;--label-weight:${label.fontWeight};--label-rotation:${label.rotation}deg;--label-align:${label.align}">${escapeHtml(label.text)}</span>`,
          iconSize: undefined
        })
      }).addTo(layers);
      marker.on("click", () => setSelected({ kind: "label", id: label.id }));
      marker.on("dragend", () => {
        if (layer.locked) return;
        const point = marker.getLatLng();
        changeMapRef({ labels: documentRef.current.content.labels.map((item) => item.id === label.id ? { ...item, x: round(point.lng), y: round(point.lat) } : item) });
      });
    }

    for (const marker of props.document.content.markers) {
      const layer = layerState.get(marker.layerId);
      if (!layer?.visible) continue;
      const worldObject = objectsById.get(marker.objectId);
      const title = worldObject?.title || `失效引用 · ${marker.objectId}`;
      const mapMarker = L.marker([marker.y, marker.x], {
        draggable: !layer.locked && tool === "select",
        icon: L.divIcon({
          className: `world-map-marker label-${marker.labelMode} ${worldObject ? "" : "is-broken-reference"} ${selected?.kind === "marker" && selected.id === marker.id ? "is-selected" : ""} ${props.candidateObjectIds.includes(marker.objectId) ? "is-candidate-change" : ""}`,
          html: `<span style="--marker-color:${marker.color}"></span><b>${escapeHtml(title)}</b>`,
          iconAnchor: [12, 28]
        })
      }).addTo(layers);
      mapMarker.on("click", (event) => {
        setSelected({ kind: "marker", id: marker.id });
        if (event.originalEvent.detail >= 2 && worldObject) props.onSelectObject(worldObject);
      });
      mapMarker.on("dblclick", () => { if (worldObject) props.onSelectObject(worldObject); });
      mapMarker.on("dragend", () => {
        if (layer.locked) return;
        const point = mapMarker.getLatLng();
        changeMapRef({ markers: documentRef.current.content.markers.map((item) => item.id === marker.id ? { ...item, x: round(point.lng), y: round(point.lat) } : item) });
      });
    }
  }, [props.document, objectsById, props.onSelectObject, props.candidateObjectIds, candidateKey, labelsVisible, selected, tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.pm.disableDraw();
    map.dragging.enable();
    if (tool === "region" && !activeLayerLocked(props.document, activeLayerId)) {
      map.pm.enableDraw("Polygon", { snappable: false, allowSelfIntersection: false, finishOn: "dblclick" });
    }
    const onCreate = (event: { shape: string; layer: L.Layer }) => {
      if (event.shape !== "Polygon" || !(event.layer instanceof L.Polygon)) return;
      const points = fromPolygon(event.layer);
      map.removeLayer(event.layer);
      if (points.length < 3 || activeLayerLocked(documentRef.current, activeLayerRef.current)) return;
      const region: MapRegion = {
        id: nextId("region", documentRef.current.content.regions.map((item) => item.id)),
        title: `区域 ${documentRef.current.content.regions.length + 1}`,
        layerId: activeLayerRef.current,
        points,
        strokeColor: "#d08b43",
        fillColor: "#d08b43",
        fillOpacity: 0.18,
        objectId: null
      };
      changeMapRef({ regions: [...documentRef.current.content.regions, region] });
      setSelected({ kind: "region", id: region.id });
      setMessage("区域已创建，可继续拖动顶点");
    };
    const onMapClick = (event: L.LeafletMouseEvent) => {
      if (tool !== "text" || activeLayerLocked(documentRef.current, activeLayerRef.current)) return;
      const label: MapLabel = {
        id: nextId("label", documentRef.current.content.labels.map((item) => item.id)),
        text: `地图标注 ${documentRef.current.content.labels.length + 1}`,
        layerId: activeLayerRef.current,
        x: round(event.latlng.lng),
        y: round(event.latlng.lat),
        fontSize: 16,
        fontWeight: 600,
        align: "center",
        rotation: 0,
        visible: true,
        treatment: "outline"
      };
      changeMapRef({ labels: [...documentRef.current.content.labels, label] });
      setSelected({ kind: "label", id: label.id });
      setTool("select");
    };
    map.on("pm:create", onCreate);
    map.on("click", onMapClick);
    return () => {
      map.off("pm:create", onCreate);
      map.off("click", onMapClick);
      map.pm.disableDraw();
    };
  }, [tool, activeLayerId, props.document.content.layers]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") { setTool("select"); setMessage("选择工具"); }
      else if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); props.onSave(); }
      else if (modifier && event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); props.onRedo(); }
      else if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); props.onUndo(); }
      else if (event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); props.onRedo(); }
      else if (event.key === "+" || event.key === "=") mapRef.current?.zoomIn();
      else if (event.key === "-") mapRef.current?.zoomOut();
      else if (event.key === "0") fitMap();
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedRef.current) { event.preventDefault(); deleteSelection(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => {
    if (!props.selection.objectId) return;
    const marker = props.document.content.markers.find((item) => item.objectId === props.selection.objectId);
    if (marker) {
      setSelected({ kind: "marker", id: marker.id });
      mapRef.current?.panTo([marker.y, marker.x], { animate: false });
    }
  }, [props.selection.objectId, props.document.id]);

  function changeMapRef(content: Partial<MapDocument["content"]>) {
    const current = documentRef.current;
    const next = { ...current, content: { ...current.content, ...content } };
    documentRef.current = next;
    onChangeRef.current(next);
  }

  function updateRegionPoints(regionId: string, polygon: L.Polygon) {
    const points = fromPolygon(polygon);
    if (points.length < 3) return;
    changeMapRef({ regions: documentRef.current.content.regions.map((item) => item.id === regionId ? { ...item, points } : item) });
  }

  function dropObject(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const objectId = event.dataTransfer.getData("application/x-story-world-object");
    const map = mapRef.current;
    const container = containerRef.current;
    if (!objectsById.has(objectId) || !map || !container) return;
    const rect = container.getBoundingClientRect();
    addObjectMarker(objectId, map.containerPointToLatLng(L.point(event.clientX - rect.left, event.clientY - rect.top)));
  }

  function addObjectMarker(objectId: string, point = mapRef.current?.getCenter()) {
    const worldObject = objectsById.get(objectId);
    if (!worldObject || !point) return;
    if (activeLayerLocked(props.document, activeLayerId)) { setMessage("当前图层已锁定"); return; }
    if (props.document.content.markers.some((marker) => marker.objectId === objectId)) { setMessage("这个对象已经在地图上"); return; }
    const marker: MapMarker = {
      id: nextId("marker", props.document.content.markers.map((item) => item.id)),
      objectId,
      layerId: activeLayerId,
      x: round(point.lng),
      y: round(point.lat),
      color: objectColor(worldObject.type),
      labelMode: "always"
    };
    changeMapRef({ markers: [...props.document.content.markers, marker] });
    setSelected({ kind: "marker", id: marker.id });
    setTool("select");
    setMessage(`${worldObject.title} 已放入地图`);
  }

  function addLayer() {
    const id = nextId("layer", props.document.content.layers.map((layer) => layer.id));
    const layer: MapLayer = { id, title: `图层 ${props.document.content.layers.length + 1}`, visible: true, locked: false };
    changeMapRef({ layers: [...props.document.content.layers, layer] });
    setActiveLayerId(id);
  }

  function updateLayer(layerId: string, patch: Partial<MapLayer>) {
    changeMapRef({ layers: props.document.content.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer) });
  }

  function moveLayer(layerId: string, direction: -1 | 1) {
    const layers = [...props.document.content.layers];
    const index = layers.findIndex((layer) => layer.id === layerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    [layers[index], layers[target]] = [layers[target], layers[index]];
    changeMapRef({ layers });
  }

  function deleteLayer(layerId: string) {
    if (props.document.content.layers.length <= 1 || layerCounts(props.document, layerId).total > 0) return;
    const layers = props.document.content.layers.filter((layer) => layer.id !== layerId);
    changeMapRef({ layers });
    setActiveLayerId(layers[0].id);
  }

  function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) props.onImportImage(file);
    event.target.value = "";
  }

  function activateBackground(backgroundId: string) {
    const background = props.document.content.backgrounds.find((item) => item.id === backgroundId);
    if (!background) return;
    changeMapRef({
      activeBackgroundId: backgroundId,
      baseImage: { assetPath: background.assetPath, mimeType: background.mimeType, width: background.width, height: background.height }
    });
    setSelected({ kind: "background", id: backgroundId });
    setTool("select");
  }

  function chooseTool(nextTool: MapTool) {
    setTool(nextTool);
    if (nextTool === "place" || nextTool === "background" || nextTool === "layers") {
      setSelected(null);
    }
  }

  function fitMap() {
    const map = mapRef.current;
    const background = activeBackground(props.document);
    if (!map || !background) return;
    map.fitBounds([[0, 0], [background.height, background.width]], { padding: [24, 24], animate: false });
  }

  function returnToSelection() {
    if (selected?.kind === "marker") {
      const marker = props.document.content.markers.find((item) => item.id === selected.id);
      if (marker) mapRef.current?.panTo([marker.y, marker.x], { animate: false });
    } else if (selected?.kind === "label") {
      const label = props.document.content.labels.find((item) => item.id === selected.id);
      if (label) mapRef.current?.panTo([label.y, label.x], { animate: false });
    } else if (selected?.kind === "region") {
      const region = props.document.content.regions.find((item) => item.id === selected.id);
      if (region) mapRef.current?.fitBounds(toLatLngs(region.points), { padding: [60, 60], animate: false });
    }
  }

  function deleteSelection() {
    const current = selectedRef.current;
    if (!current) return;
    if (current.kind === "background") return;
    const item = current.kind === "marker"
      ? documentRef.current.content.markers.find((candidate) => candidate.id === current.id)
      : current.kind === "region"
        ? documentRef.current.content.regions.find((candidate) => candidate.id === current.id)
        : documentRef.current.content.labels.find((candidate) => candidate.id === current.id);
    if (!item || activeLayerLocked(documentRef.current, item.layerId)) { setMessage("锁定图层中的内容不能删除"); return; }
    if (current.kind === "marker") changeMapRef({ markers: documentRef.current.content.markers.filter((candidate) => candidate.id !== current.id) });
    if (current.kind === "region") changeMapRef({ regions: documentRef.current.content.regions.filter((candidate) => candidate.id !== current.id) });
    if (current.kind === "label") changeMapRef({ labels: documentRef.current.content.labels.filter((candidate) => candidate.id !== current.id) });
    setSelected(null);
  }

  const activeLocked = activeLayerLocked(props.document, activeLayerId);
  const active = activeBackground(props.document);

  return <section className={`map-editor tool-${tool}`} data-testid="map-editor" onDragOver={(event) => event.preventDefault()} onDrop={dropObject}>
    <div ref={containerRef} className="leaflet-stage" />
    {!active && <div className="map-empty-overlay">
      <MapPinned /><strong>先放入一张世界底图</strong><p>PNG、JPG 或 WebP。之后可以继续加入地下层、历史时期或势力视图。</p>
      <label className="primary-action"><ImagePlus />导入底图<input type="file" accept="image/png,image/jpeg,image/webp" onChange={importImage} /></label>
    </div>}

    <div className="map-author-toolbar" role="toolbar" aria-label="地图作者工具">
      <ToolButton tool="select" current={tool} label="选择" icon={<MousePointer2 />} onChoose={chooseTool} />
      <ToolButton tool="pan" current={tool} label="平移" icon={<Hand />} onChoose={chooseTool} />
      <ToolButton tool="place" current={tool} label="放置对象" icon={<MapPinned />} onChoose={chooseTool} disabled={activeLocked} />
      <ToolButton tool="region" current={tool} label="绘制区域" icon={<Pentagon />} onChoose={chooseTool} disabled={activeLocked} />
      <ToolButton tool="text" current={tool} label="添加文字" icon={<Type />} onChoose={chooseTool} disabled={activeLocked} />
      <ToolButton tool="background" current={tool} label="背景" icon={<Images />} onChoose={chooseTool} />
      <ToolButton tool="layers" current={tool} label="图层" icon={<Layers3 />} onChoose={chooseTool} />
    </div>

    <div className="map-view-toolbar" role="toolbar" aria-label="地图视图工具">
      <button type="button" aria-pressed={labelsVisible} title={labelsVisible ? "隐藏标签" : "显示标签"} aria-label={labelsVisible ? "隐藏标签" : "显示标签"} onClick={() => setLabelsVisible((value) => !value)}><Tags /></button>
      <button type="button" title="放大" aria-label="放大" onClick={() => mapRef.current?.zoomIn()}><ZoomIn /></button>
      <button type="button" title="缩小" aria-label="缩小" onClick={() => mapRef.current?.zoomOut()}><ZoomOut /></button>
      <button type="button" title="适应地图" aria-label="适应地图" onClick={fitMap}><Maximize /></button>
      <button type="button" title="回到选中对象" aria-label="回到选中对象" disabled={!selected} onClick={returnToSelection}><LocateFixed /></button>
    </div>

    {tool === "place" && <aside className="map-object-picker" aria-label="选择地图对象">
      <header><span><MapPinned />放置对象</span><button type="button" onClick={() => setTool("select")} aria-label="关闭对象选择"><X /></button></header>
      <div>{props.objects.map((object) => <button type="button" key={object.id} disabled={props.document.content.markers.some((marker) => marker.objectId === object.id)} onClick={() => addObjectMarker(object.id)}><i style={{ background: objectColor(object.type) }} /><span><strong>{object.title}</strong><small>{objectTypeLabel(object.type)}</small></span></button>)}</div>
    </aside>}

    {tool === "background" && <BackgroundPanel document={props.document} selected={selected} onSelect={setSelected} onActivate={activateBackground} onImport={importImage} />}
    {tool === "layers" && <LayerPanel document={props.document} activeLayerId={activeLayerId} onActive={setActiveLayerId} onAdd={addLayer} onUpdate={updateLayer} onMove={moveLayer} onDelete={deleteLayer} onClose={() => setTool("select")} />}
    {selected && tool !== "place" && tool !== "background" && tool !== "layers" && <MapInspector projectId={props.projectId} document={props.document} objectsById={objectsById} selected={selected} onSelect={setSelected} onChange={changeMapRef} onOpenObject={props.onSelectObject} onDelete={deleteSelection} onGiveToTianyi={props.onGiveToTianyi} />}

    <div className="map-history-tools" aria-label="地图编辑历史">
      <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="撤销" aria-label="撤销"><Undo2 /></button>
      <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="重做" aria-label="重做"><Redo2 /></button>
      <button type="button" onClick={props.onSave} title="保存地图" aria-label="保存地图"><Save /></button>
    </div>
    <p className="map-hint" aria-live="polite">{activeLocked ? "当前图层已锁定" : message}</p>
  </section>;
}

function ToolButton(props: { tool: MapTool; current: MapTool; label: string; icon: ReactNode; disabled?: boolean; onChoose(tool: MapTool): void }) {
  return <button type="button" aria-pressed={props.current === props.tool} className={props.current === props.tool ? "is-active" : ""} title={props.label} aria-label={props.label} disabled={props.disabled} onClick={() => props.onChoose(props.tool)}>{props.icon}</button>;
}

function LayerPanel(props: {
  document: MapDocument;
  activeLayerId: string;
  onActive(id: string): void;
  onAdd(): void;
  onUpdate(id: string, patch: Partial<MapLayer>): void;
  onMove(id: string, direction: -1 | 1): void;
  onDelete(id: string): void;
  onClose(): void;
}) {
  return <aside className="map-layer-panel is-expanded" data-testid="map-layer-panel">
    <header><span><Layers3 />图层</span><div><button type="button" onClick={props.onAdd} aria-label="新增图层"><Plus /></button><button type="button" onClick={props.onClose} aria-label="关闭图层"><X /></button></div></header>
    {props.document.content.layers.map((layer, index) => {
      const counts = layerCounts(props.document, layer.id);
      return <div className={layer.id === props.activeLayerId ? "is-active" : ""} key={layer.id}>
        <button type="button" className="layer-select" onClick={() => props.onActive(layer.id)} aria-label={`选择图层 ${layer.title}`}><span>{layer.title}</span><small>{counts.markers} 标记 · {counts.regions} 区域 · {counts.labels} 文字</small></button>
        <div className="layer-row-actions">
          <button type="button" aria-label="上移图层" disabled={index === 0} onClick={() => props.onMove(layer.id, -1)}><ArrowUp /></button>
          <button type="button" aria-label="下移图层" disabled={index === props.document.content.layers.length - 1} onClick={() => props.onMove(layer.id, 1)}><ArrowDown /></button>
          <button type="button" aria-label={layer.locked ? "解锁图层" : "锁定图层"} onClick={() => props.onUpdate(layer.id, { locked: !layer.locked })}>{layer.locked ? <Lock /> : <Unlock />}</button>
          <button type="button" aria-label={layer.visible ? "隐藏图层" : "显示图层"} onClick={() => props.onUpdate(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye /> : <EyeOff />}</button>
          <button type="button" aria-label="删除空图层" disabled={counts.total > 0 || props.document.content.layers.length === 1} onClick={() => props.onDelete(layer.id)}><Trash2 /></button>
        </div>
        {layer.id === props.activeLayerId && <label><span>图层名称</span><input value={layer.title} onChange={(event) => props.onUpdate(layer.id, { title: event.target.value })} /></label>}
      </div>;
    })}
  </aside>;
}

function BackgroundPanel(props: {
  document: MapDocument;
  selected: MapSelection;
  onSelect(value: MapSelection): void;
  onActivate(id: string): void;
  onImport(event: ChangeEvent<HTMLInputElement>): void;
}) {
  return <aside className="map-background-panel" data-testid="map-background-panel">
    <header><span><Images />背景</span><label className="map-panel-import" title="导入新背景"><ImagePlus /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={props.onImport} /><span className="sr-only">导入新背景</span></label></header>
    {props.document.content.backgrounds.map((background) => <button type="button" className={background.id === props.document.content.activeBackgroundId ? "is-active" : ""} key={background.id} onClick={() => { props.onActivate(background.id); props.onSelect({ kind: "background", id: background.id }); }}>
      <span><strong>{background.title}</strong><small>{background.width} × {background.height} · {Math.round(background.opacity * 100)}%</small></span>
      {background.id === props.document.content.activeBackgroundId && <em>当前</em>}
    </button>)}
  </aside>;
}

function MapInspector(props: {
  projectId: string;
  document: MapDocument;
  objectsById: Map<string, WorldObjectSummary>;
  selected: NonNullable<MapSelection>;
  onSelect(value: MapSelection): void;
  onChange(content: Partial<MapDocument["content"]>): void;
  onOpenObject(object: WorldObjectSummary): void;
  onDelete(): void;
  onGiveToTianyi(input: MapTianyiHandoff): void;
}) {
  const marker = props.selected.kind === "marker" ? props.document.content.markers.find((item) => item.id === props.selected.id) : null;
  const region = props.selected.kind === "region" ? props.document.content.regions.find((item) => item.id === props.selected.id) : null;
  const label = props.selected.kind === "label" ? props.document.content.labels.find((item) => item.id === props.selected.id) : null;
  const background = props.selected.kind === "background" ? props.document.content.backgrounds.find((item) => item.id === props.selected.id) : null;
  const itemLayerId = marker?.layerId || region?.layerId || label?.layerId;
  const locked = itemLayerId ? activeLayerLocked(props.document, itemLayerId) : false;
  const updateMarker = (patch: Partial<MapMarker>) => marker && props.onChange({ markers: props.document.content.markers.map((item) => item.id === marker.id ? { ...item, ...patch } : item) });
  const updateRegion = (patch: Partial<MapRegion>) => region && props.onChange({ regions: props.document.content.regions.map((item) => item.id === region.id ? { ...item, ...patch } : item) });
  const updateLabel = (patch: Partial<MapLabel>) => label && props.onChange({ labels: props.document.content.labels.map((item) => item.id === label.id ? { ...item, ...patch } : item) });
  const updateBackground = (patch: Partial<MapBackground>) => background && props.onChange({ backgrounds: props.document.content.backgrounds.map((item) => item.id === background.id ? { ...item, ...patch } : item) });
  const linkedObject = marker
    ? props.objectsById.get(marker.objectId) ?? null
    : region?.objectId
      ? props.objectsById.get(region.objectId) ?? null
      : null;
  const eventReference = linkedObject?.type === "event"
    ? createStoryStudioEventReference({ projectId: props.projectId, event: linkedObject, requestedUse: "constraint" })
    : null;
  const tianyiRef = eventReference
    ? null
    : visualContextRefs(props.projectId, props.document, [...props.objectsById.values()]).find((ref) => ref.stableId === props.selected.id) ?? null;

  return <aside className="map-element-inspector" data-testid="map-element-inspector">
    <header><span>{marker ? <MapPinned /> : region ? <Pentagon /> : label ? <Type /> : <Images />}<strong>{marker ? "对象标记" : region ? "区域" : label ? "文字" : "背景"}</strong></span><button type="button" onClick={() => props.onSelect(null)} aria-label="关闭地图检查器"><X /></button></header>
    {locked && <p className="map-lock-note"><Lock />所在图层已锁定</p>}
    {(eventReference || tianyiRef) && <button type="button" className="inspector-primary" onClick={() => {
      if (eventReference) props.onGiveToTianyi({ kind: "event", reference: eventReference });
      else if (tianyiRef) props.onGiveToTianyi({ kind: "visual", ref: tianyiRef });
    }}><Sparkles />交给天意</button>}
    {marker && <>
      <div className="inspector-object-summary"><i style={{ background: marker.color }} /><span><strong>{props.objectsById.get(marker.objectId)?.title || "失效对象引用"}</strong><small>{props.objectsById.get(marker.objectId) ? objectTypeLabel(props.objectsById.get(marker.objectId)!.type) : marker.objectId}</small></span></div>
      <Field label="图层"><select value={marker.layerId} disabled={locked} onChange={(event) => updateMarker({ layerId: event.target.value })}>{props.document.content.layers.filter((layer) => !layer.locked || layer.id === marker.layerId).map((layer) => <option key={layer.id} value={layer.id}>{layer.title}</option>)}</select></Field>
      <Field label="标签"><select value={marker.labelMode} disabled={locked} onChange={(event) => updateMarker({ labelMode: event.target.value as MapMarker["labelMode"] })}><option value="always">始终显示</option><option value="hover">悬停显示</option><option value="hidden">隐藏</option></select></Field>
      <Field label="颜色"><input type="color" value={marker.color} disabled={locked} onChange={(event) => updateMarker({ color: event.target.value })} /></Field>
      {props.objectsById.get(marker.objectId) && <button type="button" className="inspector-primary" onClick={() => props.onOpenObject(props.objectsById.get(marker.objectId)!)}>打开完整卡片</button>}
    </>}
    {region && <>
      <Field label="标题"><input value={region.title} disabled={locked} onChange={(event) => updateRegion({ title: event.target.value })} /></Field>
      <Field label="图层"><select value={region.layerId} disabled={locked} onChange={(event) => updateRegion({ layerId: event.target.value })}>{props.document.content.layers.filter((layer) => !layer.locked || layer.id === region.layerId).map((layer) => <option key={layer.id} value={layer.id}>{layer.title}</option>)}</select></Field>
      <div className="inspector-color-row"><Field label="描边"><input type="color" value={region.strokeColor} disabled={locked} onChange={(event) => updateRegion({ strokeColor: event.target.value })} /></Field><Field label="填充"><input type="color" value={region.fillColor} disabled={locked} onChange={(event) => updateRegion({ fillColor: event.target.value })} /></Field></div>
      <Field label={`透明度 ${Math.round(region.fillOpacity * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={region.fillOpacity} disabled={locked} onChange={(event) => updateRegion({ fillOpacity: Number(event.target.value) })} /></Field>
      <Field label="关联对象"><select value={region.objectId || ""} disabled={locked} onChange={(event) => updateRegion({ objectId: event.target.value || null })}><option value="">不关联</option>{[...props.objectsById.values()].map((object) => <option key={object.id} value={object.id}>{object.title}</option>)}</select></Field>
      <p className="inspector-meta">{region.points.length} 个顶点</p>
    </>}
    {label && <>
      <Field label="文字"><input value={label.text} disabled={locked} onChange={(event) => updateLabel({ text: event.target.value })} /></Field>
      <Field label="图层"><select value={label.layerId} disabled={locked} onChange={(event) => updateLabel({ layerId: event.target.value })}>{props.document.content.layers.filter((layer) => !layer.locked || layer.id === label.layerId).map((layer) => <option key={layer.id} value={layer.id}>{layer.title}</option>)}</select></Field>
      <div className="inspector-color-row"><Field label="字号"><input type="number" min="8" max="72" value={label.fontSize} disabled={locked} onChange={(event) => updateLabel({ fontSize: Number(event.target.value) })} /></Field><Field label="字重"><select value={label.fontWeight} disabled={locked} onChange={(event) => updateLabel({ fontWeight: Number(event.target.value) as MapLabel["fontWeight"] })}><option value="400">常规</option><option value="500">中等</option><option value="600">半粗</option><option value="700">粗体</option></select></Field></div>
      <Field label="对齐"><select value={label.align} disabled={locked} onChange={(event) => updateLabel({ align: event.target.value as MapLabel["align"] })}><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></Field>
      <Field label="处理"><select value={label.treatment} disabled={locked} onChange={(event) => updateLabel({ treatment: event.target.value as MapLabel["treatment"] })}><option value="none">无</option><option value="outline">描边</option><option value="plate">底板</option></select></Field>
      <Field label={`旋转 ${label.rotation}°`}><input type="range" min="-180" max="180" step="1" value={label.rotation} disabled={locked} onChange={(event) => updateLabel({ rotation: Number(event.target.value) })} /></Field>
    </>}
    {background && <>
      <Field label="名称"><input value={background.title} onChange={(event) => updateBackground({ title: event.target.value })} /></Field>
      <Field label={`透明度 ${Math.round(background.opacity * 100)}%`}><input type="range" min="0" max="1" step="0.05" value={background.opacity} onChange={(event) => updateBackground({ opacity: Number(event.target.value) })} /></Field>
      <Field label="显示"><input type="checkbox" checked={background.visible} onChange={(event) => updateBackground({ visible: event.target.checked })} /></Field>
      <p className="inspector-meta">{background.width} × {background.height}</p>
    </>}
    {!background && <button type="button" className="inspector-danger" disabled={locked} onClick={props.onDelete}><Trash2 />删除</button>}
  </aside>;
}

function Field(props: { label: string; children: ReactNode }) {
  return <label className="map-inspector-field"><span>{props.label}</span>{props.children}</label>;
}

function activeBackground(document: MapDocument) {
  return document.content.backgrounds.find((background) => background.id === document.content.activeBackgroundId) || null;
}

function activeLayerLocked(document: MapDocument, layerId: string) {
  return Boolean(document.content.layers.find((layer) => layer.id === layerId)?.locked);
}

function layerCounts(document: MapDocument, layerId: string) {
  const markers = document.content.markers.filter((item) => item.layerId === layerId).length;
  const regions = document.content.regions.filter((item) => item.layerId === layerId).length;
  const labels = document.content.labels.filter((item) => item.layerId === layerId).length;
  return { markers, regions, labels, total: markers + regions + labels };
}

function fromPolygon(polygon: L.Polygon): Array<{ x: number; y: number }> {
  const latLngs = polygon.getLatLngs();
  const ring = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;
  return (ring as L.LatLng[]).map((point) => ({ x: round(point.lng), y: round(point.lat) }));
}

function toLatLngs(points: Array<{ x: number; y: number }>): L.LatLngTuple[] {
  return points.map((point) => [point.y, point.x]);
}

function assetUrl(projectId: string, relativePath: string): string {
  return `/__local/story-studio/visual-asset?projectId=${encodeURIComponent(projectId)}&relativePath=${encodeURIComponent(relativePath)}`;
}

function nextId(prefix: string, existing: string[]): string {
  for (let index = 1; index < 10_000; index += 1) {
    const id = `${prefix}.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error(`Could not create ${prefix} id.`);
}

function objectColor(type: string) {
  return ({ character: "#d8a45c", location: "#63c3b5", event: "#b788d8", item: "#8eb4df", faction: "#d87870", rule: "#94a56e", thread: "#d5c66e" } as Record<string, string>)[type] || "#aeb8b2";
}

function objectTypeLabel(type: string) {
  return ({ character: "人物", location: "地点", event: "事件", item: "物品", faction: "势力", rule: "规则", thread: "伏笔" } as Record<string, string>)[type] || "世界对象";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
