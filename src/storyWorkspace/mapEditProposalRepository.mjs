import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readVisualDocument, readVisualDocumentRevision, updateVisualDocument, validateVisualDocumentUpdate } from "./visualDocumentRepository.mjs";

const VERSION = "story-map-edit-proposal/v1";
const MAX_OPERATIONS = 100;
const MAX_REQUEST_BYTES = 256 * 1024;

export function createMapEditProposal(rootPath, input) {
  const map = readMap(rootPath, input.relativePath);
  const operationId = requireText(input.operationId, "Map proposal operation id", 160);
  const proposalPath = proposalFile(rootPath, operationId);
  if (existsSync(proposalPath)) return readProposalFile(proposalPath);
  const baseContentHash = requireText(input.baseContentHash, "Map proposal base revision", 128);
  if (map.contentHash !== baseContentHash) throw new Error("地图在提案生成前已经改变；请基于当前修订重新生成。");
  const operations = Array.isArray(input.operations) ? input.operations.map(normalizeOperation) : [];
  if (operations.length === 0 || operations.length > MAX_OPERATIONS) throw new Error("Map proposal operation count is outside the allowed range.");
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_REQUEST_BYTES) throw new Error("Map proposal input is too large.");
  const scope = normalizeScope(input.scope, map);
  const candidate = applyMapOperations(map, operations, scope);
  const constraints = normalizeConstraints(input.constraints, map, scope);
  const spatialChecks = validateSpatialConstraints(map, candidate, constraints);
  const validation = validateVisualDocumentUpdate(rootPath, {
    relativePath: map.relativePath,
    expectedContentHash: map.contentHash,
    document: candidate
  });
  if (!validation.valid) throw new Error(validation.reason || "Map proposal is invalid.");
  const proposal = {
    version: VERSION,
    id: `map-proposal.${digest(operationId).slice(0, 24)}`,
    operationId,
    mapId: map.id,
    relativePath: map.relativePath,
    baseContentHash,
    baseRevision: map.revision,
    status: "pending",
    scope,
    capability: normalizeCapability(input.capability),
    prompt: requireText(input.prompt, "Map proposal prompt", 2000),
    operations: clone(operations),
    preview: diffMap(map, candidate),
    referenceObjectIds: normalizeReferenceObjectIds(input.referenceObjectIds, map, scope),
    constraints,
    spatialChecks,
    ...(input.generation ? { generation: normalizeGeneration(input.generation) } : {}),
    ...(input.operationExplanations ? { operationExplanations: normalizeExplanations(input.operationExplanations, operations) } : {}),
    createdAt: new Date().toISOString(),
    decidedAt: null,
    resultContentHash: null
  };
  writeJsonAtomic(proposalPath, proposal);
  return clone(proposal);
}

export function acceptMapEditProposal(rootPath, input) {
  const proposalPath = proposalFile(rootPath, input.operationId);
  const proposal = readProposalFile(proposalPath);
  if (proposal.status === "accepted") return proposal;
  if (proposal.status !== "pending") throw new Error("Only a pending map proposal can be accepted.");
  const map = readMap(rootPath, proposal.relativePath);
  if (map.contentHash !== proposal.baseContentHash) throw new Error("地图已被人工修改；旧 AI 提案不会覆盖新修订。");
  const candidate = applyMapOperations(map, proposal.operations, proposal.scope);
  validateSpatialConstraints(map, candidate, proposal.constraints);
  const result = updateVisualDocument(rootPath, {
    relativePath: map.relativePath,
    expectedContentHash: proposal.baseContentHash,
    document: candidate
  });
  if (!result.ok) throw new Error("地图已改变；旧 AI 提案没有写入。");
  const accepted = { ...proposal, status: "accepted", decidedAt: new Date().toISOString(), resultContentHash: result.document.contentHash, resultRevision: result.document.revision };
  writeJsonAtomic(proposalPath, accepted);
  return clone(accepted);
}

export function rejectMapEditProposal(rootPath, input) {
  const proposalPath = proposalFile(rootPath, input.operationId);
  const proposal = readProposalFile(proposalPath);
  if (proposal.status === "rejected") return proposal;
  if (proposal.status !== "pending") throw new Error("Only a pending map proposal can be rejected.");
  const rejected = { ...proposal, status: "rejected", decidedAt: new Date().toISOString() };
  writeJsonAtomic(proposalPath, rejected);
  return clone(rejected);
}

export function compensateMapEditProposal(rootPath, input) {
  const proposalPath = proposalFile(rootPath, input.operationId);
  const proposal = readProposalFile(proposalPath);
  if (proposal.status === "compensated") return proposal;
  if (proposal.status !== "accepted") throw new Error("Only an accepted map proposal can be compensated.");
  const map = readMap(rootPath, proposal.relativePath);
  if (!proposal.resultContentHash || map.contentHash !== proposal.resultContentHash) {
    throw new Error("地图在提案接受后已有修改；不会用补偿覆盖作者的后续修订。");
  }
  const base = readVisualDocumentRevision(rootPath, {
    relativePath: proposal.relativePath,
    contentHash: proposal.baseContentHash
  });
  const result = updateVisualDocument(rootPath, {
    relativePath: proposal.relativePath,
    expectedContentHash: proposal.resultContentHash,
    document: base
  });
  if (!result.ok) throw new Error("地图已改变；本次提案补偿没有写入。");
  const compensated = {
    ...proposal,
    status: "compensated",
    compensatedAt: new Date().toISOString(),
    compensationContentHash: result.document.contentHash,
    compensationRevision: result.document.revision
  };
  writeJsonAtomic(proposalPath, compensated);
  return clone(compensated);
}

export function listMapEditProposals(rootPath, relativePath) {
  const map = readMap(rootPath, relativePath);
  const directory = proposalDirectory(rootPath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readProposalFile(path.join(directory, entry.name)))
    .filter((proposal) => proposal.mapId === map.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function applyMapOperations(map, operations, scope) {
  const candidate = clone(map);
  const content = candidate.content;
  for (const raw of operations) {
    const operation = normalizeOperation(raw);
    if (scope.kind === "selection") {
      if (operation.type === "add-drawing" || operation.type.includes("placement") || operation.type.includes("connection")) throw new Error("Selection-scoped map proposals may only change explicitly selected drawings.");
      if (!operation.targetId || !scope.objectIds.includes(operation.targetId)) throw new Error("Map proposal operation is outside the author-selected scope.");
    }
    if (scope.kind === "region" && operation.type !== "add-drawing") throw new Error("Region-scoped map proposals may only add drawings.");
    if (operation.type === "add-drawing") {
      assertLayerWritable(content, operation.value.layerId);
      if (scope.kind === "region" && scope.layerId && operation.value.layerId !== scope.layerId) throw new Error("Map proposal drawing is outside the author-selected layer.");
      if (scope.kind === "region" && operation.value.points.some((point) => !pointInsideBounds(point, scope.bounds))) throw new Error("Map proposal drawing is outside the author-selected region.");
      if (content.drawings.some((item) => item.id === operation.value.id)) throw new Error("Map proposal drawing identity already exists.");
      content.drawings.push(operation.value);
    } else if (operation.type === "update-drawing") {
      const index = content.drawings.findIndex((item) => item.id === operation.targetId);
      if (index < 0) throw new Error("Map proposal drawing no longer exists.");
      assertLayerWritable(content, content.drawings[index].layerId);
      const patch = pick(operation.patch, ["points", "strokeColor", "fillColor", "fillOpacity", "width", "size", "rotation", "label", "objectId", "layerId", "subtype"]);
      if (patch.layerId) assertLayerWritable(content, patch.layerId);
      content.drawings[index] = { ...content.drawings[index], ...patch };
    } else if (operation.type === "delete-drawing") {
      const drawing = content.drawings.find((item) => item.id === operation.targetId);
      if (!drawing) throw new Error("Map proposal drawing no longer exists.");
      assertLayerWritable(content, drawing.layerId);
      content.drawings = content.drawings.filter((item) => item.id !== operation.targetId);
    } else if (operation.type === "set-placement") {
      content.placements = [...content.placements.filter((item) => item.id !== operation.value.id), operation.value];
    } else if (operation.type === "remove-placement") {
      if (!content.placements.some((item) => item.id === operation.targetId)) throw new Error("Map placement no longer exists.");
      content.placements = content.placements.filter((item) => item.id !== operation.targetId);
    } else if (operation.type === "set-connection") {
      content.connections = [...content.connections.filter((item) => item.id !== operation.value.id), operation.value];
    } else if (operation.type === "remove-connection") {
      if (!content.connections.some((item) => item.id === operation.targetId)) throw new Error("Map connection no longer exists.");
      content.connections = content.connections.filter((item) => item.id !== operation.targetId);
    }
  }
  return candidate;
}

function normalizeOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Map proposal operation is invalid.");
  const type = String(value.type || "");
  if (["add-drawing", "set-placement", "set-connection"].includes(type)) return { type, value: cloneObject(value.value) };
  if (["update-drawing"].includes(type)) return { type, targetId: requireText(value.targetId, "Map proposal target", 120), patch: cloneObject(value.patch) };
  if (["delete-drawing", "remove-placement", "remove-connection"].includes(type)) return { type, targetId: requireText(value.targetId, "Map proposal target", 120) };
  throw new Error("Map proposal operation type is not allowed.");
}

function normalizeScope(value, map) {
  const kind = value?.kind === "selection" ? "selection" : value?.kind === "region" ? "region" : "map";
  const objectIds = kind === "selection" ? [...new Set((Array.isArray(value.objectIds) ? value.objectIds : []).map((item) => requireText(item, "Map scope object", 120)))] : [];
  if (kind === "selection" && objectIds.length === 0) throw new Error("Selected map scope is empty.");
  const bounds = kind === "region" ? cloneObject(value.bounds) : null;
  if (kind === "region") {
    for (const key of ["x", "y", "width", "height"]) if (!Number.isFinite(bounds[key])) throw new Error("Map proposal region is invalid.");
    if (bounds.width <= 0 || bounds.height <= 0 || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > 100 || bounds.y + bounds.height > 100) throw new Error("Map proposal region must stay inside the map bounds.");
  }
  const layerId = kind === "region" ? requireText(value.layerId, "Map proposal region layer", 120) : null;
  if (kind === "region") {
    const layer = map.content.layers.find((item) => item.id === layerId);
    if (!layer || layer.locked) throw new Error("Map proposal region layer is missing or locked.");
  }
  return { kind, mapId: map.id, objectIds, bounds, layerId };
}

function normalizeReferenceObjectIds(value, map, scope) {
  const editable = new Set(scope.objectIds);
  return [...new Set((Array.isArray(value) ? value : []).map((item) => requireText(item, "Map proposal reference", 120)))]
    .filter((id) => !editable.has(id))
    .map((id) => {
      if (!map.content.drawings.some((drawing) => drawing.id === id)) throw new Error("Map proposal reference no longer exists.");
      return id;
    });
}

function normalizeConstraints(value, map, scope) {
  if (value == null) return { preserveLineEndpointIds: [], avoidAreaObjectIds: [] };
  const source = cloneObject(value);
  const allowed = ["preserveLineEndpointIds", "avoidAreaObjectIds"];
  if (Object.keys(source).some((key) => !allowed.includes(key))) throw new Error("Map proposal constraints contain unsupported fields.");
  const preserveLineEndpointIds = normalizeConstraintIds(source.preserveLineEndpointIds, map, scope, (drawing) => drawing.kind === "line", "Endpoint constraint");
  const avoidAreaObjectIds = normalizeConstraintIds(source.avoidAreaObjectIds, map, scope, (drawing) => drawing.kind === "area", "Avoidance constraint");
  return { preserveLineEndpointIds, avoidAreaObjectIds };
}

function normalizeConstraintIds(value, map, scope, predicate, label) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => requireText(item, label, 120)))].map((id) => {
    const drawing = map.content.drawings.find((item) => item.id === id);
    if (!drawing || !predicate(drawing)) throw new Error(`${label} references an incompatible drawing.`);
    if (scope.objectIds.includes(id) && label === "Avoidance constraint") throw new Error("An editable drawing cannot also be an avoidance reference.");
    return id;
  });
}

function validateSpatialConstraints(before, after, constraints = {}) {
  const checks = [];
  const endpointIds = Array.isArray(constraints?.preserveLineEndpointIds) ? constraints.preserveLineEndpointIds : [];
  for (const id of endpointIds) {
    const original = before.content.drawings.find((item) => item.id === id);
    const result = after.content.drawings.find((item) => item.id === id);
    if (!original || !result || result.kind !== "line" || !sameMapPoint(original.points[0], result.points[0]) || !sameMapPoint(original.points.at(-1), result.points.at(-1))) throw new Error("地图提案改变了要求保留的道路端点。");
  }
  if (endpointIds.length) checks.push({ kind: "line-endpoints-preserved", status: "passed", objectIds: [...endpointIds], referenceObjectIds: [] });
  const avoidAreaObjectIds = Array.isArray(constraints?.avoidAreaObjectIds) ? constraints.avoidAreaObjectIds : [];
  const polygons = avoidAreaObjectIds.map((id) => before.content.drawings.find((item) => item.id === id)).filter(Boolean);
  const changedLineIds = after.content.drawings.filter((item) => item.kind === "line" && before.content.drawings.some((previous) => previous.id === item.id && JSON.stringify(previous.points) !== JSON.stringify(item.points))).map((item) => item.id);
  for (const lineId of changedLineIds) {
    const line = after.content.drawings.find((item) => item.id === lineId);
    if (polygons.some((polygon) => mapPolylineIntersectsPolygon(line.points, polygon.points))) throw new Error("建议道路进入了作者指定的避让范围；未创建或应用提案。");
  }
  if (avoidAreaObjectIds.length) checks.push({ kind: "avoids-explicit-areas", status: "passed", objectIds: changedLineIds, referenceObjectIds: [...avoidAreaObjectIds] });
  return checks;
}

export function mapPolylineIntersectsPolygon(line, polygon) {
  if (line.some((point) => pointInPolygonOrBoundary(point, polygon))) return true;
  for (let lineIndex = 0; lineIndex < line.length - 1; lineIndex += 1) {
    for (let polygonIndex = 0; polygonIndex < polygon.length; polygonIndex += 1) {
      if (segmentsIntersect(line[lineIndex], line[lineIndex + 1], polygon[polygonIndex], polygon[(polygonIndex + 1) % polygon.length])) return true;
    }
  }
  return false;
}

function pointInPolygonOrBoundary(point, polygon) {
  let inside = false;
  for (let left = 0, right = polygon.length - 1; left < polygon.length; right = left++) {
    const a = polygon[right]; const b = polygon[left];
    if (orientation(a, b, point) === 0 && onSegment(a, point, b)) return true;
    if (((a.y > point.y) !== (b.y > point.y)) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c); const o2 = orientation(a, b, d); const o3 = orientation(c, d, a); const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b)) || (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d));
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  return Math.abs(value) < 1e-9 ? 0 : value > 0 ? 1 : 2;
}

function onSegment(a, point, b) { return point.x <= Math.max(a.x, b.x) + 1e-9 && point.x >= Math.min(a.x, b.x) - 1e-9 && point.y <= Math.max(a.y, b.y) + 1e-9 && point.y >= Math.min(a.y, b.y) - 1e-9; }
function sameMapPoint(left, right) { return Boolean(left && right && Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9); }

function normalizeGeneration(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Map proposal generation metadata is invalid.");
  return {
    kind: value.kind === "real-provider" ? "real-provider" : "local-fake",
    providerId: requireText(value.providerId, "Map proposal Provider", 120),
    modelId: requireText(value.modelId, "Map proposal model", 200),
    providerDispatches: value.providerDispatches === 1 ? 1 : 0,
    sessionId: requireText(value.sessionId, "Map proposal Tianyi Session", 200),
    workVersionId: requireText(value.workVersionId, "Map proposal WorkVersion", 200),
    receiptEnvelopeId: typeof value.receiptEnvelopeId === "string" && value.receiptEnvelopeId.trim() ? value.receiptEnvelopeId.trim().slice(0, 200) : null
  };
}

function normalizeExplanations(value, operations) {
  if (!Array.isArray(value) || value.length !== operations.length) throw new Error("Map proposal explanations do not match the operations.");
  return value.map((item, index) => ({ operationIndex: index, reason: requireText(item?.reason, "Map proposal operation reason", 280) }));
}

function normalizeCapability(value) {
  const mode = value?.mode === "vision" ? "vision" : value?.mode === "image" ? "image" : "text";
  return { mode, imageInput: value?.imageInput === true, structuredOperations: value?.structuredOperations !== false };
}

function assertLayerWritable(content, layerId) {
  const layer = content.layers.find((item) => item.id === layerId);
  if (!layer) throw new Error("Map proposal references an unknown layer.");
  if (layer.locked) throw new Error(`图层“${layer.title}”已锁定；AI 提案未写入。`);
}

function diffMap(before, after) {
  const beforeIds = new Set(before.content.drawings.map((item) => item.id));
  const afterIds = new Set(after.content.drawings.map((item) => item.id));
  return {
    addedDrawingIds: [...afterIds].filter((id) => !beforeIds.has(id)),
    modifiedDrawingIds: after.content.drawings.filter((item) => beforeIds.has(item.id) && JSON.stringify(item) !== JSON.stringify(before.content.drawings.find((beforeItem) => beforeItem.id === item.id))).map((item) => item.id),
    deletedDrawingIds: [...beforeIds].filter((id) => !afterIds.has(id)),
    placementIds: after.content.placements.map((item) => item.id),
    connectionIds: after.content.connections.map((item) => item.id),
    changes: [
      ...after.content.drawings.filter((item) => !beforeIds.has(item.id)).map((item) => ({ kind: "added", drawingId: item.id, before: null, after: clone(item) })),
      ...after.content.drawings.filter((item) => beforeIds.has(item.id) && JSON.stringify(item) !== JSON.stringify(before.content.drawings.find((beforeItem) => beforeItem.id === item.id))).map((item) => ({ kind: "modified", drawingId: item.id, before: clone(before.content.drawings.find((beforeItem) => beforeItem.id === item.id)), after: clone(item) })),
      ...before.content.drawings.filter((item) => !afterIds.has(item.id)).map((item) => ({ kind: "deleted", drawingId: item.id, before: clone(item), after: null }))
    ]
  };
}

function pointInsideBounds(point, bounds) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function readMap(rootPath, relativePath) {
  const map = readVisualDocument(rootPath, relativePath);
  if (map.type !== "map") throw new Error("Map proposal target must be a map.");
  return map;
}

function proposalDirectory(rootPath) {
  return path.join(path.resolve(rootPath), "documents/maps/.proposals");
}

function proposalFile(rootPath, operationId) {
  return path.join(proposalDirectory(rootPath), `${digest(requireText(operationId, "Map proposal operation id", 160))}.json`);
}

function readProposalFile(filePath) {
  if (!existsSync(filePath)) throw new Error("Map proposal does not exist.");
  const value = JSON.parse(readFileSync(filePath, "utf8"));
  if (value?.version !== VERSION) throw new Error("Unsupported map proposal version.");
  return clone(value);
}

function writeJsonAtomic(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, filePath);
}

function pick(value, keys) {
  const source = cloneObject(value);
  return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
}

function cloneObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Map proposal object is invalid.");
  return clone(value);
}

function requireText(value, label, maximum) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return structuredClone(value); }
