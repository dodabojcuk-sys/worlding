import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readVisualDocument, updateVisualDocument, validateVisualDocumentUpdate } from "./visualDocumentRepository.mjs";

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
  const operations = Array.isArray(input.operations) ? input.operations : [];
  if (operations.length === 0 || operations.length > MAX_OPERATIONS) throw new Error("Map proposal operation count is outside the allowed range.");
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_REQUEST_BYTES) throw new Error("Map proposal input is too large.");
  const scope = normalizeScope(input.scope, map);
  const candidate = applyMapOperations(map, operations, scope);
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
  const result = updateVisualDocument(rootPath, {
    relativePath: map.relativePath,
    expectedContentHash: proposal.baseContentHash,
    document: candidate
  });
  if (!result.ok) throw new Error("地图已改变；旧 AI 提案没有写入。");
  const accepted = { ...proposal, status: "accepted", decidedAt: new Date().toISOString(), resultContentHash: result.document.contentHash };
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
    if (scope.kind === "selection" && operation.targetId && !scope.objectIds.includes(operation.targetId)) {
      throw new Error("Map proposal operation is outside the author-selected scope.");
    }
    if (operation.type === "add-drawing") {
      assertLayerWritable(content, operation.value.layerId);
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
  }
  return { kind, mapId: map.id, objectIds, bounds };
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
    connectionIds: after.content.connections.map((item) => item.id)
  };
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
