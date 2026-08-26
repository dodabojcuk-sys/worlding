import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { getWorkspaceLinkedNotes, listWorkspaceNotes, openStoryWorkspace } from "./storyWorkspaceRepository.mjs";
import {
  RELATION_PROJECTION_VERSION,
  projectLegacyGraphContent,
  projectGraphContent,
  reconcileGraphRelations
} from "./relationRepository.mjs";

const VISUAL_DOCUMENT_VERSION = "story-visual-document/v1";
const VISUAL_DOCUMENT_TYPES = new Set(["map", "graph", "canvas", "timeline", "tree"]);
const DOCUMENT_DIRECTORIES = {
  map: "documents/maps",
  graph: "documents/graphs",
  canvas: "documents/canvases",
  timeline: "documents/timelines",
  tree: "documents/trees"
};
const DOCUMENT_SUFFIXES = {
  map: ".map.json",
  graph: ".graph.json",
  canvas: ".canvas.json",
  timeline: ".timeline.json",
  tree: ".tree.json"
};
const ASSET_DIRECTORIES = new Set(["maps", "images", "audio", "references"]);
const IMAGE_MIME_TYPES = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"]
]);
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function createVisualDocument(rootPath, input) {
  const root = prepareRoot(rootPath);
  const type = requireDocumentType(input.type);
  const title = requireText(input.title, "Visual document title", 100);
  const directory = DOCUMENT_DIRECTORIES[type];
  mkdirSync(safePath(root, directory, { allowMissing: true }), { recursive: true });
  const relativePath = uniqueDocumentPath(root, type, title);
  const documentSlug = path.basename(relativePath, DOCUMENT_SUFFIXES[type]);
  let document = normalizeDocument(root, {
    version: VISUAL_DOCUMENT_VERSION,
    id: `${type}.${safeIdSegment(documentSlug)}`,
    type,
    title,
    objectRefs: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    content: input.content ?? defaultContent(type),
    overlays: { evidence: [], risks: [], candidateChanges: [] }
  }, { operation: "create", currentDocument: null });
  if (type === "graph") {
    const reconciled = reconcileGraphRelations(root, {
      graphDocumentId: document.id,
      sourceRevision: graphRelationSourceRevision(document.content),
      content: document.content,
      mode: "create"
    });
    document = { ...document, content: reconciled.content };
  }
  writeVisualJson(root, relativePath, serializeDocumentForPersistence(document));
  return readVisualDocument(root, relativePath);
}

export function listVisualDocuments(rootPath) {
  const root = prepareRoot(rootPath);
  return Object.values(DOCUMENT_DIRECTORIES)
    .flatMap((directory) => listDocumentFiles(root, directory))
    .map((relativePath) => readVisualDocument(root, relativePath))
    .sort((left, right) => left.type.localeCompare(right.type) || left.title.localeCompare(right.title, "zh-CN"));
}

export function readVisualDocument(rootPath, relativePath) {
  const root = prepareRoot(rootPath);
  const normalizedPath = requireVisualDocumentPath(relativePath);
  const absolutePath = safePath(root, normalizedPath);
  if (!existsSync(absolutePath)) throw new Error(`Visual document does not exist: ${normalizedPath}`);
  if (lstatSync(absolutePath).isSymbolicLink()) throw new Error("Visual document cannot be a symlink.");
  if (statSync(absolutePath).size > MAX_DOCUMENT_BYTES) throw new Error("Visual document is too large.");
  const source = readFileSync(absolutePath, "utf8");
  const parsed = parseJsonObject(source);
  const document = normalizeDocument(root, parsed, { operation: "read", currentDocument: null });
  if (normalizedPath !== expectedPathPrefix(document.type, normalizedPath)) {
    throw new Error("Visual document path does not match its type.");
  }
  const diagnostics = document.type === "timeline" ? { timeline: projectTimelineDiagnostics(root, document.content) } : null;
  return clone({
    ...document,
    ...(diagnostics ? { diagnostics } : {}),
    relativePath: normalizedPath,
    contentHash: contentHash(source),
    source: "visual-json"
  });
}

export function updateVisualDocument(rootPath, input) {
  const root = prepareRoot(rootPath);
  const relativePath = requireVisualDocumentPath(input.relativePath);
  const current = readVisualDocument(root, relativePath);
  if (requireText(input.expectedContentHash, "Expected content hash", 128) !== current.contentHash) {
    return clone({ ok: false, conflict: true, document: current });
  }
  let candidate = normalizeDocument(root, {
    ...input.document,
    version: current.version,
    id: current.id,
    type: current.type
  }, { operation: "update", currentDocument: current });
  if (current.type === "graph") {
    const currentAuthority = current.content.relationAuthority?.status;
    if (currentAuthority !== "ready") {
      throw new Error("Graph relation authority migration is required before this legacy graph can be edited.");
    }
    const reconciled = reconcileGraphRelations(root, {
      graphDocumentId: current.id,
      sourceRevision: graphRelationSourceRevision(candidate.content),
      currentContent: current.content,
      content: candidate.content,
      mode: "update"
    });
    candidate = { ...candidate, content: reconciled.content };
  }
  writeVisualJson(root, relativePath, serializeDocumentForPersistence(candidate));
  return clone({ ok: true, conflict: false, document: readVisualDocument(root, relativePath) });
}

export function validateVisualDocumentUpdate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const relativePath = requireVisualDocumentPath(input.relativePath);
  const current = readVisualDocument(root, relativePath);
  if (requireText(input.expectedContentHash, "Expected content hash", 128) !== current.contentHash) {
    return clone({ valid: false, conflict: true, reason: "磁盘中的文档已经改变，请重新读取后再试。" });
  }
  try {
    normalizeDocument(root, {
      ...input.document,
      version: current.version,
      id: current.id,
      type: current.type
    }, { operation: "update", currentDocument: current });
    return clone({ valid: true, conflict: false, reason: null });
  } catch (error) {
    return clone({ valid: false, conflict: false, reason: error instanceof Error ? error.message : "Timeline mutation is invalid." });
  }
}

export function restoreVisualDocumentSource(rootPath, input) {
  const root = prepareRoot(rootPath);
  const relativePath = requireVisualDocumentPath(input.relativePath);
  const current = readVisualDocument(root, relativePath);
  if (input.expectedContentHash !== current.contentHash) {
    return clone({ ok: false, conflict: true, document: current });
  }
  if (typeof input.source !== "string" || Buffer.byteLength(input.source, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new Error("Visual restore source is invalid.");
  }
  const parsed = parseJsonObject(input.source);
  const candidate = normalizeDocument(root, parsed, { operation: "restore", currentDocument: current });
  if (candidate.id !== current.id || candidate.type !== current.type) throw new Error("Restored visual document identity does not match the canonical document.");
  let nextDocument = candidate;
  if (candidate.type === "graph") {
    if (current.type !== "graph" || current.content.relationAuthority?.status !== "ready" || candidate.content.relationAuthority?.status !== "ready") {
      throw new Error("Graph source restore requires a ready relation projection; legacy semantic payloads remain read-only.");
    }
    const reconciled = reconcileGraphRelations(root, {
      graphDocumentId: current.id,
      sourceRevision: graphRelationSourceRevision(candidate.content),
      currentContent: current.content,
      content: candidate.content,
      mode: "update"
    });
    nextDocument = { ...candidate, content: reconciled.content };
  }
  writeVisualJson(root, relativePath, serializeDocumentForPersistence(nextDocument));
  return clone({ ok: true, conflict: false, document: readVisualDocument(root, relativePath) });
}

export function importVisualAsset(rootPath, input) {
  const root = prepareRoot(rootPath);
  const category = String(input.category || "");
  if (!ASSET_DIRECTORIES.has(category)) throw new Error("Unsupported asset category.");
  const extension = IMAGE_MIME_TYPES.get(String(input.mimeType || ""));
  if (!extension) throw new Error("Unsupported image type.");
  if (typeof input.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)) {
    throw new Error("Image data must be valid base64.");
  }
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image size is outside the allowed range.");
  validateImageSignature(bytes, String(input.mimeType));
  const directory = `assets/${category}`;
  mkdirSync(safePath(root, directory, { allowMissing: true }), { recursive: true });
  const base = safeFilename(path.basename(String(input.filename || "image"), path.extname(String(input.filename || "")))) || "image";
  const relativePath = uniqueAssetPath(root, directory, base, extension);
  const absolutePath = safePath(root, relativePath, { allowMissing: true });
  writeFileSync(absolutePath, bytes, { flag: "wx" });
  return clone({ relativePath, mimeType: String(input.mimeType), size: bytes.length, source: "local-asset" });
}

export function resolveVisualAsset(rootPath, relativePath) {
  const root = prepareRoot(rootPath);
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized.startsWith("assets/")) throw new Error("Asset path must stay inside the project assets directory.");
  const absolutePath = safePath(root, normalized);
  if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile() || lstatSync(absolutePath).isSymbolicLink()) {
    throw new Error("Visual asset does not exist.");
  }
  const extension = path.extname(normalized).toLowerCase();
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { absolutePath, relativePath: normalized, mimeType, size: statSync(absolutePath).size };
}

function normalizeDocument(root, input, options = { operation: "create", currentDocument: null }) {
  rejectDangerousKeys(input);
  if (input.version !== VISUAL_DOCUMENT_VERSION) throw new Error("Unsupported visual document version.");
  const type = requireDocumentType(input.type);
  const id = requireText(input.id, "Visual document id", 160);
  const title = requireText(input.title, "Visual document title", 100);
  const viewport = normalizeViewport(input.viewport);
  const content = type === "map"
    ? normalizeMapContent(root, input.content)
    : type === "graph"
      ? normalizeGraphContent(root, input.content, { ...options, documentId: id })
      : type === "canvas"
        ? normalizeCanvasContent(root, input.content)
        : type === "timeline"
          ? normalizeTimelineContent(input.content)
          : normalizeTreeContent(root, input.content, options.operation !== "read");
  const objectRefs = deriveObjectRefs(root, type, content);
  if (type === "timeline") validateTimelineOperation(root, content, options.currentDocument?.content || null, options.operation);
  else if (options.operation !== "read") validateObjectRefs(root, objectRefs);
  return clone({
    version: VISUAL_DOCUMENT_VERSION,
    id,
    type,
    title,
    objectRefs,
    viewport,
    content,
    overlays: normalizeOverlays(input.overlays)
  });
}

function normalizeMapContent(root, value) {
  const input = cloneJsonObject(value || {});
  const layers = Array.isArray(input.layers) ? input.layers.map((layer) => ({
    id: requireText(layer?.id, "Map layer id", 120),
    title: requireText(layer?.title, "Map layer title", 80),
    visible: layer?.visible !== false,
    locked: layer?.locked === true
  })) : [];
  if (layers.length === 0) layers.push({ id: "layer.main", title: "主要地点", visible: true, locked: false });
  const layerIds = new Set(layers.map((layer) => layer.id));
  if (layerIds.size !== layers.length) throw new Error("Map layer IDs must be unique.");
  const legacyBaseImage = input.baseImage == null ? null : normalizeBaseImage(root, input.baseImage);
  const backgrounds = normalizeUniqueItems(input.backgrounds, "Map background", (background, index) => {
    const asset = normalizeBaseImage(root, background);
    return {
      id: requireText(background?.id, "Map background id", 120),
      title: requireText(background?.title || `背景 ${index + 1}`, "Map background title", 100),
      ...asset,
      opacity: boundedNumber(background?.opacity ?? 1, "Map background opacity", 0, 1),
      visible: background?.visible !== false
    };
  });
  if (backgrounds.length === 0 && legacyBaseImage) {
    backgrounds.push({ id: "background.main", title: "主背景", ...legacyBaseImage, opacity: 1, visible: true });
  }
  const backgroundIds = new Set(backgrounds.map((background) => background.id));
  const activeBackgroundId = backgrounds.length === 0
    ? null
    : backgroundIds.has(input.activeBackgroundId) ? input.activeBackgroundId : backgrounds[0].id;
  const activeBackground = backgrounds.find((background) => background.id === activeBackgroundId) || null;
  const baseImage = activeBackground ? {
    assetPath: activeBackground.assetPath,
    mimeType: activeBackground.mimeType,
    width: activeBackground.width,
    height: activeBackground.height
  } : null;
  const markers = normalizeUniqueItems(input.markers, "Map marker", (marker) => {
    const layerId = requireText(marker?.layerId, "Map marker layer", 120);
    if (!layerIds.has(layerId)) throw new Error("Map marker references an unknown layer.");
    return {
      id: requireText(marker?.id, "Map marker id", 120),
      objectId: requireText(marker?.objectId, "Map marker object", 160),
      layerId,
      x: finiteNumber(marker?.x, "Map marker x"),
      y: finiteNumber(marker?.y, "Map marker y"),
      color: normalizeColor(marker?.color),
      labelMode: ["always", "hover", "hidden"].includes(marker?.labelMode) ? marker.labelMode : "always"
    };
  });
  const regions = normalizeUniqueItems(input.regions, "Map region", (region) => {
    const layerId = requireText(region?.layerId, "Map region layer", 120);
    if (!layerIds.has(layerId)) throw new Error("Map region references an unknown layer.");
    const points = Array.isArray(region?.points) ? region.points.map((point) => ({
      x: finiteNumber(point?.x, "Map region x"),
      y: finiteNumber(point?.y, "Map region y")
    })) : [];
    if (points.length < 3) throw new Error("Map region requires at least three points.");
    return {
      id: requireText(region?.id, "Map region id", 120),
      title: requireText(region?.title, "Map region title", 100),
      layerId,
      points,
      strokeColor: normalizeColor(region?.strokeColor ?? region?.color),
      fillColor: normalizeColor(region?.fillColor ?? region?.color),
      fillOpacity: boundedNumber(region?.fillOpacity ?? 0.16, "Map region opacity", 0, 1),
      objectId: region?.objectId == null || region.objectId === "" ? null : requireText(region.objectId, "Map region object", 160)
    };
  });
  const labels = normalizeUniqueItems(input.labels, "Map label", (label) => {
    const layerId = requireText(label?.layerId, "Map label layer", 120);
    if (!layerIds.has(layerId)) throw new Error("Map label references an unknown layer.");
    return {
      id: requireText(label?.id, "Map label id", 120),
      text: requireText(label?.text, "Map label text", 120),
      layerId,
      x: finiteNumber(label?.x, "Map label x"),
      y: finiteNumber(label?.y, "Map label y"),
      fontSize: boundedNumber(label?.fontSize ?? 16, "Map label font size", 8, 72),
      fontWeight: [400, 500, 600, 700].includes(Number(label?.fontWeight)) ? Number(label.fontWeight) : 600,
      align: ["left", "center", "right"].includes(label?.align) ? label.align : "center",
      rotation: boundedNumber(label?.rotation ?? 0, "Map label rotation", -180, 180),
      visible: label?.visible !== false,
      treatment: ["none", "outline", "plate"].includes(label?.treatment) ? label.treatment : "outline"
    };
  });
  return { baseImage, backgrounds, activeBackgroundId, layers, markers, regions, labels };
}

function normalizeGraphContent(root, value, options = {}) {
  const input = cloneJsonObject(value || {});
  const nodes = normalizeUniqueItems(input.nodes, "Graph node", (node) => ({
    id: requireText(node?.id, "Graph node id", 120),
    objectId: requireText(node?.objectId, "Graph node object", 160),
    x: finiteNumber(node?.x, "Graph node x"),
    y: finiteNumber(node?.y, "Graph node y")
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (Array.isArray(input.relationRefs) && input.relationAuthority?.status === "ready" && !Array.isArray(input.edges) && !Array.isArray(input.proposals)) {
    const projected = projectGraphContent(root, { graphDocumentId: options.documentId, content: { ...input, nodes } });
    return projected;
  }
  const edges = normalizeUniqueItems(input.edges, "Graph edge", (edge) => {
    const source = requireText(edge?.source, "Graph edge source", 120);
    const target = requireText(edge?.target, "Graph edge target", 120);
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new Error("Graph edge references an unknown node.");
    return {
      id: requireText(edge?.id, "Graph edge id", 120),
      ...(edge?.relationId ? { relationId: requireText(edge.relationId, "Graph relation id", 180) } : {}),
      source,
      target,
      relation: requireText(edge?.relation, "Graph relation", 80),
      direction: ["forward", "reverse", "both", "none"].includes(edge?.direction) ? edge.direction : "none"
    };
  });
  const proposals = normalizeUniqueItems(input.proposals, "Graph relation proposal", (proposal) => {
    const source = requireText(proposal?.source, "Graph proposal source", 120);
    const target = requireText(proposal?.target, "Graph proposal target", 120);
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new Error("Graph proposal references an unknown node.");
    if (source === target) throw new Error("Graph proposal cannot connect a node to itself.");
    return {
      id: requireText(proposal?.id, "Graph proposal id", 120),
      ...(proposal?.relationId ? { relationId: requireText(proposal.relationId, "Graph relation id", 180) } : {}),
      source,
      target,
      relation: requireText(proposal?.relation, "Graph proposal relation", 80),
      direction: ["forward", "reverse", "both", "none"].includes(proposal?.direction) ? proposal.direction : "none",
      origin: ["graph", "tree"].includes(proposal?.origin) ? proposal.origin : "graph",
      sourceDocumentId: proposal?.sourceDocumentId == null || proposal.sourceDocumentId === "" ? null : requireText(proposal.sourceDocumentId, "Graph proposal source document", 180)
    };
  });
  const relationshipIds = new Set(edges.map((edge) => edge.id));
  if (proposals.some((proposal) => relationshipIds.has(proposal.id))) throw new Error("Graph relationship IDs must be unique.");
  const objectTypes = Array.isArray(input.filters?.objectTypes)
    ? [...new Set(input.filters.objectTypes.map(String).filter(Boolean))].sort()
    : [];
  if (input.relationAuthority?.status === "ready" && Array.isArray(input.relationRefs)) {
    return {
      nodes,
      edges,
      proposals,
      relationRefs: clone(input.relationRefs),
      relationAuthority: clone(input.relationAuthority),
      filters: { objectTypes }
    };
  }
  return projectLegacyGraphContent(root, {
    nodes,
    edges,
    proposals,
    filters: { objectTypes }
  }, options.documentId || "legacy.graph");
}

function normalizeCanvasContent(root, value) {
  const input = cloneJsonObject(value || {});
  const nodes = normalizeUniqueItems(input.nodes, "Canvas node", (node) => {
    const kind = ["object", "text", "image", "excerpt"].includes(node?.kind) ? node.kind : "text";
    const base = {
      id: requireText(node?.id, "Canvas node id", 120),
      kind,
      x: finiteNumber(node?.x, "Canvas node x"),
      y: finiteNumber(node?.y, "Canvas node y"),
      width: positiveNumber(node?.width ?? 220, "Canvas node width"),
      height: positiveNumber(node?.height ?? 120, "Canvas node height")
    };
    if (kind === "object") return { ...base, objectId: requireText(node?.objectId, "Canvas node object", 160), text: "", assetPath: "" };
    if (kind === "excerpt") return { ...base, objectId: requireText(node?.objectId, "Canvas excerpt object", 160), text: requireText(node?.text, "Canvas excerpt", 1200), assetPath: "" };
    if (kind === "image") {
      const assetPath = normalizeRelativePath(requireText(node?.assetPath, "Canvas image", 240));
      if (!assetPath.startsWith("assets/images/")) throw new Error("Canvas image must be stored in assets/images.");
      resolveVisualAsset(root, assetPath);
      return { ...base, objectId: "", text: String(node?.text || ""), assetPath };
    }
    return { ...base, objectId: "", text: requireText(node?.text, "Canvas text", 1200), assetPath: "" };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeUniqueItems(input.edges, "Canvas edge", (edge) => {
    const source = requireText(edge?.source, "Canvas edge source", 120);
    const target = requireText(edge?.target, "Canvas edge target", 120);
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new Error("Canvas edge references an unknown node.");
    return { id: requireText(edge?.id, "Canvas edge id", 120), source, target, label: String(edge?.label || "").slice(0, 120) };
  });
  const groups = normalizeUniqueItems(input.groups, "Canvas group", (group) => ({
    id: requireText(group?.id, "Canvas group id", 120),
    title: requireText(group?.title, "Canvas group title", 100),
    nodeIds: [...new Set(Array.isArray(group?.nodeIds) ? group.nodeIds.map(String).filter((id) => nodeIds.has(id)) : [])]
  }));
  return { nodes, edges, groups };
}

function normalizeTimelineContent(value) {
  const input = cloneJsonObject(value || {});
  const legacy = !Array.isArray(input.trackViews) && !Array.isArray(input.dependencies) && input.filters == null && input.viewport == null;
  const lanes = normalizeUniqueItems(input.lanes, "Timeline lane", (lane, index) => ({
    id: requireText(lane?.id, "Timeline lane id", 120),
    title: requireText(lane?.title, "Timeline lane title", 80),
    color: normalizeColor(lane?.color),
    order: lane?.order == null ? index : nonNegativeInteger(lane.order, "Timeline lane order")
  })).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((lane, order) => ({ ...lane, order }));
  if (lanes.length === 0) lanes.push({ id: "lane.canon", title: "正史", color: "#63c3b5", order: 0 });
  const laneIds = new Set(lanes.map((lane) => lane.id));
  const laneOrder = new Map(lanes.map((lane) => [lane.id, lane.order]));
  const entries = normalizeUniqueItems(input.entries, "Timeline entry", (entry) => {
    const eventId = requireText(entry?.eventId, "Timeline event", 160);
    const laneId = requireText(entry?.laneId, "Timeline lane", 120);
    if (!laneIds.has(laneId)) throw new Error("Timeline entry references an unknown lane.");
    return {
      id: requireText(entry?.id, "Timeline entry id", 120),
      eventId,
      laneId,
      order: nonNegativeInteger(entry?.order, "Timeline entry order")
    };
  }).sort((left, right) => legacy
    ? (laneOrder.get(left.laneId) || 0) - (laneOrder.get(right.laneId) || 0) || left.order - right.order || left.id.localeCompare(right.id)
    : left.order - right.order || left.id.localeCompare(right.id))
    .map((entry, order) => ({ ...entry, order }));
  if (new Set(entries.map((entry) => entry.eventId)).size !== entries.length) {
    throw new Error("Timeline event references must be unique.");
  }
  const defaultTrackViews = [
    { id: "track.canon", kind: "canon", refId: null, order: 0, visible: true, collapsed: false },
    { id: "track.planning", kind: "planning", refId: null, order: 1, visible: true, collapsed: false },
    ...lanes.filter((lane) => lane.id !== "lane.canon").map((lane, index) => ({
      id: `track.custom.${lane.id}`,
      kind: "custom",
      refId: lane.id,
      order: index + 2,
      visible: true,
      collapsed: false
    }))
  ];
  const trackViews = normalizeTimelineTrackViews(input.trackViews, defaultTrackViews, laneIds);
  const dependencies = normalizeUniqueItems(input.dependencies, "Timeline dependency", (dependency) => {
    if (dependency?.kind !== "requires") throw new Error("Timeline dependency kind must be requires.");
    return {
      id: requireText(dependency.id, "Timeline dependency id", 120),
      fromEventId: requireText(dependency.fromEventId, "Timeline dependency prerequisite", 160),
      toEventId: requireText(dependency.toEventId, "Timeline dependency event", 160),
      kind: "requires"
    };
  });
  const mode = ["all", "canon", "planning"].includes(input.filters?.mode) ? input.filters.mode : "all";
  const objectIds = uniqueTextList(input.filters?.objectIds, "Timeline filter object", 160);
  const timelineViewport = {
    focusedTrackId: input.viewport?.focusedTrackId == null || input.viewport.focusedTrackId === ""
      ? null
      : requireText(input.viewport.focusedTrackId, "Timeline focused track", 160),
    density: input.viewport?.density === "compact" ? "compact" : "comfortable"
  };
  return { lanes, entries, trackViews, dependencies, filters: { mode, objectIds }, viewport: timelineViewport };
}

function normalizeTimelineTrackViews(value, defaults, laneIds) {
  const input = Array.isArray(value) ? value : defaults;
  const tracks = normalizeUniqueItems(input, "Timeline track", (track, index) => {
    const kind = ["canon", "planning", "character", "location", "custom"].includes(track?.kind) ? track.kind : null;
    if (!kind) throw new Error("Timeline track kind is invalid.");
    const refId = ["character", "location", "custom"].includes(kind)
      ? requireText(track?.refId, "Timeline track reference", 160)
      : null;
    if (kind === "custom" && !laneIds.has(refId)) throw new Error("Timeline custom track references an unknown lane.");
    return {
      id: requireText(track?.id, "Timeline track id", 160),
      kind,
      refId,
      order: track?.order == null ? index : nonNegativeInteger(track.order, "Timeline track order"),
      visible: track?.visible !== false,
      collapsed: track?.collapsed === true
    };
  });
  for (const requiredKind of ["canon", "planning"]) {
    if (!tracks.some((track) => track.kind === requiredKind)) tracks.push(defaults.find((track) => track.kind === requiredKind));
  }
  return tracks.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((track, order) => ({ ...track, order }));
}

function normalizeTreeContent(root, value, strictReferences) {
  const input = cloneJsonObject(value || {});
  const sourceGraphPath = input.sourceGraphPath == null || input.sourceGraphPath === ""
    ? ""
    : requireVisualDocumentPath(requireText(input.sourceGraphPath, "Tree source graph", 280));
  let graph = null;
  try {
    graph = sourceGraphPath ? readVisualDocument(root, sourceGraphPath) : null;
  } catch (error) {
    if (strictReferences) throw error;
  }
  if (graph && graph.type !== "graph") throw new Error("Tree source must be a graph document.");
  const knownEdgeIds = new Set(graph?.content.edges.map((edge) => edge.id) || []);
  const knownObjectIds = new Set(graph?.content.nodes.map((node) => node.objectId) || []);
  const includedEdgeIds = uniqueTextList(input.includedEdgeIds, "Tree relation", 120);
  const rootObjectIds = uniqueTextList(input.rootObjectIds, "Tree root object", 160);
  const collapsedObjectIds = uniqueTextList(input.collapsedObjectIds, "Tree collapsed object", 160);
  if (strictReferences && includedEdgeIds.some((edgeId) => !knownEdgeIds.has(edgeId))) {
    throw new Error("Tree references a relation that is not present in its source graph.");
  }
  if (strictReferences && [...rootObjectIds, ...collapsedObjectIds].some((objectId) => !knownObjectIds.has(objectId))) {
    throw new Error("Tree references an object that is not present in its source graph.");
  }
  const direction = input.direction === "TB" ? "TB" : "LR";
  return {
    sourceGraphPath,
    includedEdgeIds: graph ? includedEdgeIds.filter((edgeId) => knownEdgeIds.has(edgeId)) : includedEdgeIds,
    rootObjectIds: graph ? rootObjectIds.filter((objectId) => knownObjectIds.has(objectId)) : rootObjectIds,
    collapsedObjectIds: graph ? collapsedObjectIds.filter((objectId) => knownObjectIds.has(objectId)) : collapsedObjectIds,
    direction
  };
}

function normalizeBaseImage(root, value) {
  const assetPath = normalizeRelativePath(requireText(value?.assetPath, "Map asset path", 240));
  if (!assetPath.startsWith("assets/maps/")) throw new Error("Map image must be stored in assets/maps.");
  const absolute = safePath(root, assetPath);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink()) throw new Error("Map image does not exist.");
  return {
    assetPath,
    mimeType: IMAGE_MIME_TYPES.has(String(value?.mimeType)) ? String(value.mimeType) : "image/png",
    width: positiveNumber(value?.width, "Map image width"),
    height: positiveNumber(value?.height, "Map image height")
  };
}

function deriveObjectRefs(root, type, content) {
  const refs = type === "map"
    ? [...content.markers.map((marker) => marker.objectId), ...content.regions.map((region) => region.objectId).filter(Boolean)]
    : type === "graph"
      ? content.nodes.map((node) => node.objectId)
      : type === "canvas"
        ? content.nodes.filter((node) => node.kind === "object" || node.kind === "excerpt").map((node) => node.objectId)
        : type === "timeline"
          ? [
            ...content.entries.map((entry) => entry.eventId),
            ...content.trackViews.filter((track) => track.kind === "character" || track.kind === "location").map((track) => track.refId)
          ]
          : deriveTreeObjectRefs(root, content);
  return [...new Set(refs)].sort();
}

function deriveTreeObjectRefs(root, content) {
  if (!content.sourceGraphPath) return [];
  let graph;
  try {
    graph = readVisualDocument(root, content.sourceGraphPath);
  } catch {
    return [...content.rootObjectIds];
  }
  const edgeIds = new Set(content.includedEdgeIds);
  const nodeIds = new Set(graph.content.edges
    .filter((edge) => edgeIds.has(edge.id))
    .flatMap((edge) => [edge.source, edge.target]));
  const refs = graph.content.nodes.filter((node) => nodeIds.has(node.id)).map((node) => node.objectId);
  return [...refs, ...content.rootObjectIds];
}

function validateObjectRefs(root, refs) {
  const known = new Set(listWorkspaceNotes(root).map((note) => note.id));
  for (const ref of refs) {
    if (!known.has(ref)) throw new Error(`Visual document references an unknown world object: ${ref}`);
  }
}

function defaultContent(type) {
  if (type === "map") return { baseImage: null, backgrounds: [], activeBackgroundId: null, layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: false }], markers: [], regions: [], labels: [] };
  if (type === "graph") return { nodes: [], edges: [], proposals: [], filters: { objectTypes: [] } };
  if (type === "canvas") return { nodes: [], edges: [], groups: [] };
  if (type === "timeline") return {
    lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5", order: 0 }],
    entries: [],
    trackViews: [
      { id: "track.canon", kind: "canon", refId: null, order: 0, visible: true, collapsed: false },
      { id: "track.planning", kind: "planning", refId: null, order: 1, visible: true, collapsed: false }
    ],
    dependencies: [],
    filters: { mode: "all", objectIds: [] },
    viewport: { focusedTrackId: null, density: "comfortable" }
  };
  return { sourceGraphPath: "", includedEdgeIds: [], rootObjectIds: [], collapsedObjectIds: [], direction: "LR" };
}

function isCanonicalTimelineEvent(note) {
  if (!note) return false;
  const tags = Array.isArray(note.frontmatter.tags)
    ? note.frontmatter.tags.map(String)
    : String(note.frontmatter.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  return note.type === "event" && note.status === "committed" && tags.includes("作者确认");
}

function isPlannedTimelineEvent(note) {
  if (!note) return false;
  const tags = timelineEventTags(note);
  return note.type === "event" && note.status === "planned" && tags.includes("作者规划");
}

function timelineEventTags(note) {
  return Array.isArray(note?.frontmatter?.tags)
    ? note.frontmatter.tags.map(String)
    : String(note?.frontmatter?.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function timelineEventStatus(note) {
  if (!note) return "missing";
  if (isCanonicalTimelineEvent(note)) return "canonical";
  if (isPlannedTimelineEvent(note)) return "planned";
  return "ineligible";
}

function projectTimelineDiagnostics(root, content) {
  const notes = listWorkspaceNotes(root);
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const canonicalLinks = notes
    .filter((note) => isCanonicalTimelineEvent(note) && typeof note.frontmatter?.planned_from === "string" && note.frontmatter.planned_from.trim())
    .map((note) => ({ planningEventId: note.frontmatter.planned_from.trim(), canonicalEventId: note.id }))
    .sort((left, right) => left.planningEventId.localeCompare(right.planningEventId) || left.canonicalEventId.localeCompare(right.canonicalEventId));
  const issues = collectTimelineIssues(root, content, notesById);
  const entryStates = content.entries.map((entry) => ({
    entryId: entry.id,
    eventId: entry.eventId,
    status: timelineEventStatus(notesById.get(entry.eventId))
  }));
  const projectedEntries = content.entries.map((entry) => {
    const note = notesById.get(entry.eventId);
    const status = timelineEventStatus(note);
    const linked = note ? getWorkspaceLinkedNotes(root, note.relativePath) : [];
    const linkedByType = {
      character: new Set(linked.filter((item) => item.type === "character").map((item) => item.id)),
      location: new Set(linked.filter((item) => item.type === "location").map((item) => item.id))
    };
    const trackIds = content.trackViews.flatMap((track) => {
      if (track.kind === "canon" && status === "canonical") return [track.id];
      if (track.kind === "planning" && status === "planned") return [track.id];
      if (track.kind === "custom" && track.refId === entry.laneId) return [track.id];
      if ((track.kind === "character" || track.kind === "location") && linkedByType[track.kind].has(track.refId)) return [track.id];
      return [];
    });
    const plannedFromEventId = typeof note?.frontmatter?.planned_from === "string"
      ? note.frontmatter.planned_from.trim() || null
      : null;
    return {
      entryId: entry.id,
      eventId: entry.eventId,
      trackIds,
      characterIds: [...linkedByType.character].sort(),
      locationIds: [...linkedByType.location].sort(),
      plannedFromEventId
    };
  });
  return { entryStates, projectedEntries, canonicalLinks, issues };
}

function validateTimelineOperation(root, candidate, current, operation) {
  if (operation === "read") return;
  const notesById = new Map(listWorkspaceNotes(root).map((note) => [note.id, note]));
  const candidateIssues = collectTimelineIssues(root, candidate, notesById);
  if (operation === "restore") {
    const blocking = candidateIssues.filter((issue) => !["missing-event", "ineligible-event", "missing-track-reference", "invalid-track-reference", "missing-dependency-endpoint", "invalid-dependency-direction"].includes(issue.code));
    if (blocking.length) throw timelineIssueError(blocking[0]);
    return;
  }
  const currentIssueKeys = new Set(current ? collectTimelineIssues(root, current, notesById).map((issue) => issue.key) : []);
  const introduced = candidateIssues.find((issue) => !currentIssueKeys.has(issue.key));
  if (introduced) throw timelineIssueError(introduced);
}

function collectTimelineIssues(root, content, notesById = new Map(listWorkspaceNotes(root).map((note) => [note.id, note]))) {
  const issues = [];
  for (const entry of content.entries) {
    const status = timelineEventStatus(notesById.get(entry.eventId));
    if (status === "missing") issues.push(timelineIssue("missing-event", `${entry.id}:${entry.eventId}`, entry.id, entry.eventId));
    else if (status === "ineligible") issues.push(timelineIssue("ineligible-event", `${entry.id}:${entry.eventId}`, entry.id, entry.eventId));
  }
  for (const track of content.trackViews) {
    if (track.kind !== "character" && track.kind !== "location") continue;
    const note = notesById.get(track.refId);
    if (!note) issues.push(timelineIssue("missing-track-reference", `${track.id}:${track.refId}`, track.id, track.refId));
    else if (note.type !== track.kind) issues.push(timelineIssue("invalid-track-reference", `${track.id}:${track.refId}`, track.id, track.refId));
  }
  const entryIds = new Set(content.entries.map((entry) => entry.eventId));
  const directed = new Map();
  for (const dependency of content.dependencies) {
    const dependencyKey = `${dependency.fromEventId}->${dependency.toEventId}`;
    if (!entryIds.has(dependency.fromEventId) || !entryIds.has(dependency.toEventId) || !notesById.has(dependency.fromEventId) || !notesById.has(dependency.toEventId)) {
      issues.push(timelineIssue("missing-dependency-endpoint", `${dependency.id}:${dependencyKey}`, dependency.id, dependencyKey));
      continue;
    }
    if (dependency.fromEventId === dependency.toEventId) issues.push(timelineIssue("self-dependency", `${dependency.id}:${dependencyKey}`, dependency.id, dependencyKey));
    if (directed.has(dependencyKey)) issues.push(timelineIssue("duplicate-dependency", `${dependency.id}:${dependencyKey}`, dependency.id, dependencyKey));
    else directed.set(dependencyKey, dependency.id);
    const fromStatus = timelineEventStatus(notesById.get(dependency.fromEventId));
    const toStatus = timelineEventStatus(notesById.get(dependency.toEventId));
    if (fromStatus === "planned" && toStatus === "canonical") {
      issues.push(timelineIssue("invalid-dependency-direction", `${dependency.id}:${dependencyKey}`, dependency.id, dependencyKey));
    }
  }
  const cycle = findTimelineDependencyCycle(content.dependencies, entryIds);
  if (cycle.length) issues.push(timelineIssue("dependency-cycle", cycle.join("->"), cycle[0], cycle.join(" -> ")));
  return issues;
}

function timelineIssue(code, identity, sourceId, targetId) {
  return { code, key: `${code}:${identity}`, sourceId, targetId };
}

function timelineIssueError(issue) {
  const messages = {
    "missing-event": "Timeline entry references a missing event.",
    "ineligible-event": "Timeline entries must reference a committed author-confirmed event or a planned author-planned event Markdown.",
    "missing-track-reference": "Timeline track references a missing object.",
    "invalid-track-reference": "Timeline track references an object with the wrong type.",
    "missing-dependency-endpoint": "Timeline dependency endpoint is not present in entries.",
    "self-dependency": "Timeline dependency cannot reference itself.",
    "duplicate-dependency": "Timeline dependency duplicates an existing directed edge.",
    "invalid-dependency-direction": "Timeline dependency has an invalid direction: a planned event cannot be required by an already canonical event.",
    "dependency-cycle": "Timeline dependency creates a directed cycle."
  };
  return new Error(messages[issue.code] || "Timeline mutation is invalid.");
}

function findTimelineDependencyCycle(dependencies, entryIds) {
  const adjacency = new Map([...entryIds].map((id) => [id, []]));
  for (const dependency of dependencies) {
    if (dependency.fromEventId === dependency.toEventId || !entryIds.has(dependency.fromEventId) || !entryIds.has(dependency.toEventId)) continue;
    adjacency.get(dependency.fromEventId).push(dependency.toEventId);
  }
  for (const targets of adjacency.values()) targets.sort();
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(node) {
    if (visiting.has(node)) return [...stack.slice(stack.indexOf(node)), node];
    if (visited.has(node)) return [];
    visiting.add(node);
    stack.push(node);
    for (const target of adjacency.get(node) || []) {
      const cycle = visit(target);
      if (cycle.length) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return [];
  }
  for (const node of [...adjacency.keys()].sort()) {
    const cycle = visit(node);
    if (cycle.length) return cycle;
  }
  return [];
}

function uniqueTextList(value, label, maxLength) {
  const items = Array.isArray(value) ? value.map((item) => requireText(item, label, maxLength)) : [];
  if (new Set(items).size !== items.length) throw new Error(`${label} references must be unique.`);
  return items;
}

function nonNegativeInteger(value, label) {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer.`);
  return number;
}

function normalizeViewport(value) {
  return {
    x: finiteNumber(value?.x ?? 0, "Viewport x"),
    y: finiteNumber(value?.y ?? 0, "Viewport y"),
    zoom: finiteNumber(value?.zoom ?? 1, "Viewport zoom")
  };
}

function boundedNumber(value, label, minimum, maximum) {
  const number = finiteNumber(value, label);
  if (number < minimum || number > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  return number;
}

function normalizeOverlays(value) {
  return {
    evidence: Array.isArray(value?.evidence) ? clone(value.evidence) : [],
    risks: Array.isArray(value?.risks) ? clone(value.risks) : [],
    candidateChanges: Array.isArray(value?.candidateChanges) ? clone(value.candidateChanges) : []
  };
}

function normalizeUniqueItems(value, label, mapper) {
  const items = Array.isArray(value) ? value.map(mapper) : [];
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error(`${label} IDs must be unique.`);
  return items;
}

function parseJsonObject(source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Visual document contains invalid JSON.");
  }
  return cloneJsonObject(parsed);
}

function cloneJsonObject(value) {
  rejectDangerousKeys(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Visual document data must be an object.");
  return clone(value);
}

function rejectDangerousKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor", "entry", "execute", "script"].includes(key)) {
      throw new Error("Visual document contains a forbidden executable field.");
    }
    rejectDangerousKeys(child);
  }
}

function writeVisualJson(root, relativePath, document) {
  const content = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_DOCUMENT_BYTES) throw new Error("Visual document is too large.");
  const absolutePath = safePath(root, relativePath, { allowMissing: true });
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "w" });
  renameSync(temporaryPath, absolutePath);
}

function serializeDocumentForPersistence(document) {
  if (document.type !== "graph") return document;
  return {
    ...document,
    content: {
      nodes: document.content.nodes,
      relationRefs: document.content.relationRefs || [],
      relationAuthority: document.content.relationAuthority || { version: RELATION_PROJECTION_VERSION, status: "ready", repositoryRevision: 0 },
      filters: document.content.filters || { objectTypes: [] }
    }
  };
}

function listDocumentFiles(root, directory) {
  const absolute = safePath(root, directory, { allowMissing: true });
  if (!existsSync(absolute)) return [];
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("Visual document directory cannot be a symlink.");
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `${directory}/${entry.name}`);
}

function uniqueDocumentPath(root, type, title) {
  const directory = DOCUMENT_DIRECTORIES[type];
  const suffix = DOCUMENT_SUFFIXES[type];
  const base = safeFilename(title) || "untitled";
  for (let index = 1; index < 10_000; index += 1) {
    const filename = index === 1 ? `${base}${suffix}` : `${base}-${index}${suffix}`;
    const relativePath = `${directory}/${filename}`;
    if (!existsSync(safePath(root, relativePath, { allowMissing: true }))) return relativePath;
  }
  throw new Error("Could not create a unique visual document path.");
}

function uniqueAssetPath(root, directory, base, extension) {
  for (let index = 1; index < 10_000; index += 1) {
    const filename = index === 1 ? `${base}${extension}` : `${base}-${index}${extension}`;
    const relativePath = `${directory}/${filename}`;
    if (!existsSync(safePath(root, relativePath, { allowMissing: true }))) return relativePath;
  }
  throw new Error("Could not create a unique asset path.");
}

function requireVisualDocumentPath(value) {
  const relativePath = normalizeRelativePath(requireText(value, "Visual document path", 280));
  if (!Object.entries(DOCUMENT_DIRECTORIES).some(([type, directory]) => relativePath.startsWith(`${directory}/`) && relativePath.endsWith(DOCUMENT_SUFFIXES[type]))) {
    throw new Error("Visual document path is not supported.");
  }
  return relativePath;
}

function expectedPathPrefix(type, relativePath) {
  return relativePath.startsWith(`${DOCUMENT_DIRECTORIES[type]}/`) && relativePath.endsWith(DOCUMENT_SUFFIXES[type]) ? relativePath : "";
}

function prepareRoot(rootPath) {
  const absolute = path.resolve(String(rootPath || ""));
  openStoryWorkspace(absolute);
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("Workspace root cannot be a symlink.");
  return realpathSync(absolute);
}

function safePath(root, relativePath, options = {}) {
  const normalized = normalizeRelativePath(relativePath);
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (!relative && options.allowRoot) return absolute;
    throw new Error("Path must stay inside the workspace.");
  }
  let cursor = path.dirname(absolute);
  while (cursor.startsWith(root) && cursor !== root) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Workspace paths cannot cross symlinks.");
    cursor = path.dirname(cursor);
  }
  if (!options.allowMissing && existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new Error("Workspace file cannot be a symlink.");
  }
  return absolute;
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").normalize("NFC").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Path must be a safe relative project path.");
  }
  return normalized;
}

function requireDocumentType(value) {
  const type = String(value || "");
  if (!VISUAL_DOCUMENT_TYPES.has(type)) throw new Error("Unsupported visual document type.");
  return type;
}

function requireText(value, label, maxLength) {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f]/.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) throw new Error(`${label} is invalid.`);
  return number;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new Error(`${label} must be positive.`);
  return number;
}

function normalizeColor(value) {
  const color = String(value || "#63c3b5");
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#63c3b5";
}

function safeIdSegment(value) {
  return String(value).normalize("NFC").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/g, "-").slice(0, 96) || "untitled";
}

function safeFilename(value) {
  return String(value || "").normalize("NFC").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").replace(/-+/g, "-").slice(0, 100);
}

function validateImageSignature(bytes, mimeType) {
  const valid = mimeType === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!valid) throw new Error("Image data does not match its declared image type.");
}

function contentHash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function graphRelationSourceRevision(content) {
  const semantic = {
    nodes: (content.nodes || []).map((node) => ({ id: node.id, objectId: node.objectId })).sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...(content.edges || [])].map((edge) => ({ id: edge.id, relationId: edge.relationId || null, source: edge.source, target: edge.target, relation: edge.relation, direction: edge.direction })).sort((left, right) => left.id.localeCompare(right.id)),
    proposals: [...(content.proposals || [])].map((proposal) => ({ id: proposal.id, relationId: proposal.relationId || null, source: proposal.source, target: proposal.target, relation: proposal.relation, direction: proposal.direction })).sort((left, right) => left.id.localeCompare(right.id))
  };
  return createHash("sha256").update(JSON.stringify(semantic)).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}
