import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openStoryWorkspace } from "./storyWorkspaceRepository.mjs";
import { parseStoryCardSections, readStoryCardContent } from "../storyCardPresentation/storyCardSectionAnchors.ts";

export const CARD_PRESENTATION_VERSION = "story-card-presentation/v2";
export const CARD_PRESENTATION_BLOCK_KINDS = ["text", "secret", "character-arc", "property-group", "relation-group", "properties", "connections", "media", "map", "graph", "timeline", "tree", "canvas"];

const BLOCK_KIND_SET = new Set(CARD_PRESENTATION_BLOCK_KINDS);
const CONTENT_BLOCK_KINDS = new Set(["text", "secret", "character-arc"]);
const LEGACY_BLOCK_KINDS = new Set(["text", "properties", "connections", "media", "map", "graph", "timeline", "tree", "canvas"]);
const TOP_LEVEL_FIELDS = new Set(["version", "objectId", "preset", "layout", "portrait", "cover", "templateRef", "blocks", "visual"]);
const BLOCK_FIELDS = new Set(["id", "kind", "contentRef", "presentationRef", "label", "propertyKeys", "relationConfig", "collapsed", "size"]);
const RELATION_CONFIG_FIELDS = new Set(["sourceDocumentIds", "directions", "relationTypes", "edgeIds"]);
const IMAGE_FIELDS = new Set(["assetRef", "fit", "position"]);
const POSITION_FIELDS = new Set(["x", "y"]);
const VISUAL_FIELDS = new Set(["density", "mediaAssets"]);
const PRESENTATION_REFS = new Set([
  "object.properties", "object.connections", "object.media",
  "projection.map-appearances", "projection.graph-relations", "projection.timeline-participation", "projection.tree-appearances", "projection.canvas-appearances"
]);
const FORBIDDEN_KEYS = new Set([
  "__proto__", "prototype", "constructor", "title", "name", "aliases", "status", "tags", "prose", "body", "text",
  "secretText", "relationshipText", "relationText", "sceneProse", "eventTitle", "propertyValue", "summary", "aiSummary"
]);
const OBJECT_ID_PATTERN = /^(?:character|location|event|item|faction|rule|thread)\.[\p{L}\p{N}][\p{L}\p{N}._-]{0,158}$/u;
const BLOCK_ID_PATTERN = /^card-block\.[\p{L}\p{N}][\p{L}\p{N}._-]{0,126}$/u;
const CONTENT_REF_PATTERN = /^(?:markdown-body|markdown-section\.[a-z][a-z0-9-]{0,62})$/u;
const TEMPLATE_REF_PATTERN = /^card-template\.[a-z0-9][a-z0-9._-]{0,94}$/u;
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const VISUAL_DOCUMENT_ID_PATTERN = /^(?:visual|map|graph|canvas|timeline|tree)[.\p{L}\p{N}_-]{1,158}$/u;
const GRAPH_EDGE_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,119}$/u;
const ASSET_REF_PATTERN = /^assets\/images\/[\p{L}\p{N}._ -]+\.(?:png|jpe?g|webp|gif)$/iu;
const MAX_DOCUMENT_BYTES = 256 * 1024;
const MAX_BLOCKS = 96;
const MAX_MEDIA_ASSETS = 24;
const MAX_DEPTH = 8;
const MAX_NODES = 800;
const MAX_STRING_LENGTH = 320;

export function cardPresentationRelativePath(objectId) {
  return `documents/cards/${requireObjectId(objectId)}.card.json`;
}

export function readCardPresentation(rootPath, input) {
  const root = prepareRoot(rootPath);
  const objectId = requireObjectId(input.objectId);
  const relativePath = cardPresentationRelativePath(objectId);
  const absolutePath = safePath(root, relativePath, { allowMissing: true });
  if (!existsSync(absolutePath)) return virtualProjection(root, input, relativePath);
  assertRegularFile(absolutePath, "Card presentation");
  if (statSync(absolutePath).size > MAX_DOCUMENT_BYTES) throw new Error("Card presentation is too large.");
  const source = readFileSync(absolutePath, "utf8");
  const value = parseJson(source);
  const normalized = normalizeCardPresentation(root, value, { objectId, operation: "read" });
  const diagnostics = contentDiagnostics(root, normalized, String(input.markdownBody ?? ""));
  return clone({
    document: normalized,
    relativePath,
    contentHash: hash(source),
    source: "presentation-json",
    virtual: false,
    diagnostics,
    migration: { required: false, cleanupPending: hasLegacyPresentation(input.legacyCard) }
  });
}

export function validateCardPresentation(rootPath, input) {
  const root = prepareRoot(rootPath);
  return clone(normalizeCardPresentation(root, input.document, { objectId: requireObjectId(input.objectId), operation: input.operation || "write" }));
}

export function saveCardPresentation(rootPath, input) {
  const root = prepareRoot(rootPath);
  const objectId = requireObjectId(input.objectId);
  const relativePath = cardPresentationRelativePath(objectId);
  const absolutePath = safePath(root, relativePath, { allowMissing: true });
  const expected = input.expectedContentHash == null ? null : requireHash(input.expectedContentHash);
  const current = existsSync(absolutePath) ? readCardPresentation(root, { objectId, markdownBody: input.markdownBody || "", legacyCard: null }) : null;
  if ((current && expected !== current.contentHash) || (!current && expected !== null)) {
    return clone({ ok: false, conflict: true, presentation: current });
  }
  const document = normalizeCardPresentation(root, input.document, { objectId, operation: "write" });
  const source = serializeCardPresentation(document);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  assertNoSymlinkPath(root, absolutePath, true);
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, source, { encoding: "utf8", flag: "w", mode: 0o600 });
    renameSync(temporaryPath, absolutePath);
  } catch (error) {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
  const presentation = readCardPresentation(root, { objectId, markdownBody: input.markdownBody || "", legacyCard: input.legacyCard || null });
  return clone({ ok: true, conflict: false, presentation });
}

export function restoreCardPresentationSource(rootPath, input) {
  const root = prepareRoot(rootPath);
  const objectId = requireObjectId(input.objectId);
  const current = readCardPresentation(root, { objectId, markdownBody: input.markdownBody || "", legacyCard: null });
  if (current.virtual || requireHash(input.expectedContentHash) !== current.contentHash) {
    return clone({ ok: false, conflict: true, presentation: current });
  }
  if (typeof input.source !== "string" || Buffer.byteLength(input.source, "utf8") > MAX_DOCUMENT_BYTES) throw new Error("Card presentation restore source is invalid.");
  const document = normalizeCardPresentation(root, parseJson(input.source), { objectId, operation: "write" });
  return saveCardPresentation(root, { objectId, expectedContentHash: current.contentHash, document, markdownBody: input.markdownBody || "" });
}

export function serializeCardPresentation(document) {
  const source = `${JSON.stringify(document, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAX_DOCUMENT_BYTES) throw new Error("Card presentation is too large.");
  return source;
}

export function deterministicVirtualBlockId(objectId, kind, ordinal) {
  const stable = hash(`story-card-presentation/v2:${requireObjectId(objectId)}:${requireBlockKind(kind)}:${requirePositiveInteger(ordinal)}`).slice(0, 16);
  return `card-block.${kind}.${stable}`;
}

export function nextCardBlockId(objectId, kind, existingIds) {
  const existing = new Set(Array.isArray(existingIds) ? existingIds : []);
  for (let ordinal = 1; ordinal <= MAX_BLOCKS; ordinal += 1) {
    const candidate = deterministicVirtualBlockId(objectId, kind, ordinal);
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not create a card block identifier.");
}

export function defaultPresentationRef(kind) {
  return ({
    properties: "object.properties",
    connections: "object.connections",
    media: "object.media",
    map: "projection.map-appearances",
    graph: "projection.graph-relations",
    timeline: "projection.timeline-participation",
    tree: "projection.tree-appearances",
    canvas: "projection.canvas-appearances"
  })[kind] || null;
}

function virtualProjection(root, input, relativePath) {
  const objectId = requireObjectId(input.objectId);
  const legacy = normalizeLegacyCard(input.legacyCard);
  const occurrences = new Map();
  let usedBody = false;
  const anchoredByKind = new Map();
  for (const section of parseStoryCardSections(String(input.markdownBody ?? "")).sections) {
    const values = anchoredByKind.get(section.kind) || [];
    values.push(section.id);
    anchoredByKind.set(section.kind, values);
  }
  const blocks = legacy.blocks.map((kind) => {
    const ordinal = (occurrences.get(kind) || 0) + 1;
    occurrences.set(kind, ordinal);
    const base = { id: deterministicVirtualBlockId(objectId, kind, ordinal), kind, collapsed: kind === "secret", size: kind === "text" ? "large" : "medium" };
    if (CONTENT_BLOCK_KINDS.has(kind)) {
      const anchored = anchoredByKind.get(kind)?.shift();
      const contentRef = anchored ? `markdown-section.${anchored}` : kind === "text" && !usedBody ? "markdown-body" : `markdown-section.${kind}-${String(ordinal).padStart(2, "0")}`;
      if (contentRef === "markdown-body") usedBody = true;
      return { ...base, contentRef };
    }
    return { ...base, presentationRef: defaultPresentationRef(kind) };
  });
  const document = normalizeCardPresentation(root, {
    version: CARD_PRESENTATION_VERSION,
    objectId,
    preset: "character",
    layout: legacy.layout,
    portrait: null,
    cover: legacy.coverAsset ? defaultImageReference(legacy.coverAsset) : null,
    templateRef: null,
    blocks,
    visual: { density: "comfortable", mediaAssets: legacy.mediaAssets }
  }, { objectId, operation: "read" });
  return clone({
    document,
    relativePath,
    contentHash: null,
    source: "virtual-v1",
    virtual: true,
    diagnostics: contentDiagnostics(root, document, String(input.markdownBody ?? "")),
    migration: { required: true, cleanupPending: false }
  });
}

function normalizeCardPresentation(root, value, context) {
  assertBoundedTree(value);
  requirePlainObject(value, "Card presentation");
  requireExactFields(value, TOP_LEVEL_FIELDS, "Card presentation");
  rejectForbiddenKeys(value);
  if (value.version !== CARD_PRESENTATION_VERSION) throw new Error("Unsupported card presentation version.");
  const objectId = requireObjectId(value.objectId);
  if (objectId !== context.objectId) throw new Error("Card presentation object identifier does not match its owner.");
  if (value.preset !== "character") throw new Error("Checkpoint A supports only the Character preset.");
  if (value.layout !== "horizontal" && value.layout !== "vertical") throw new Error("Card presentation layout is invalid.");
  const portrait = normalizeImage(root, value.portrait, context.operation);
  const cover = normalizeImage(root, value.cover, context.operation);
  const templateRef = value.templateRef == null ? null : requirePattern(value.templateRef, TEMPLATE_REF_PATTERN, "Card template reference");
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > MAX_BLOCKS) throw new Error("Card presentation block count is outside the allowed range.");
  const ids = new Set();
  const blocks = value.blocks.map((block) => normalizeBlock(block, ids));
  const visual = normalizeVisual(root, value.visual, context.operation);
  return { version: CARD_PRESENTATION_VERSION, objectId, preset: "character", layout: value.layout, portrait, cover, templateRef, blocks, visual };
}

function normalizeBlock(value, ids) {
  requirePlainObject(value, "Card presentation block");
  requireExactFields(value, BLOCK_FIELDS, "Card presentation block");
  const id = requirePattern(value.id, BLOCK_ID_PATTERN, "Card block identifier");
  if (ids.has(id)) throw new Error("Card presentation contains a duplicate block identifier.");
  ids.add(id);
  const kind = requireBlockKind(value.kind);
  const collapsed = requireBoolean(value.collapsed, "Card block collapsed state");
  const size = ["small", "medium", "large"].includes(value.size) ? value.size : null;
  if (!size) throw new Error("Card block size is invalid.");
  if (CONTENT_BLOCK_KINDS.has(kind)) {
    if ("label" in value || "propertyKeys" in value || "relationConfig" in value) throw new Error("Markdown content blocks cannot store group fields.");
    if ("presentationRef" in value) throw new Error("Markdown content blocks cannot store a presentation reference.");
    const contentRef = requirePattern(value.contentRef, CONTENT_REF_PATTERN, "Card content reference");
    if (kind === "secret" && contentRef === "markdown-body") throw new Error("Secret blocks require a dedicated Markdown section.");
    if (kind === "character-arc" && contentRef === "markdown-body") throw new Error("Character arc blocks require a dedicated Markdown section.");
    return { id, kind, contentRef, collapsed, size };
  }
  if (kind === "property-group") {
    if ("contentRef" in value || "presentationRef" in value || "relationConfig" in value) throw new Error("Property groups cannot store content or projection references.");
    const label = requireText(value.label, "Property group label", 80);
    if (!Array.isArray(value.propertyKeys) || value.propertyKeys.length > 48) throw new Error("Property group key count is outside the allowed range.");
    const propertyKeys = value.propertyKeys.map((key) => requirePattern(key, PROPERTY_KEY_PATTERN, "Property group key"));
    if (new Set(propertyKeys).size !== propertyKeys.length) throw new Error("Property group keys must be unique.");
    return { id, kind, label, propertyKeys, collapsed, size };
  }
  if (kind === "relation-group") {
    if ("contentRef" in value || "presentationRef" in value || "propertyKeys" in value) throw new Error("Relation groups cannot store content, property, or projection references.");
    const label = requireText(value.label, "Relation group label", 80);
    const relationConfig = normalizeRelationConfig(value.relationConfig);
    return { id, kind, label, relationConfig, collapsed, size };
  }
  if ("label" in value || "propertyKeys" in value || "relationConfig" in value) throw new Error("Projection blocks cannot store group fields.");
  if ("contentRef" in value) throw new Error("Projection blocks cannot store a Markdown content reference.");
  const presentationRef = requirePattern(value.presentationRef, /^[a-z][a-z0-9.-]{0,94}$/u, "Card presentation reference");
  if (!PRESENTATION_REFS.has(presentationRef) || presentationRef !== defaultPresentationRef(kind)) throw new Error("Card presentation reference is not supported.");
  return { id, kind, presentationRef, collapsed, size };
}

function normalizeRelationConfig(value) {
  requirePlainObject(value, "Relation group configuration");
  requireExactFields(value, RELATION_CONFIG_FIELDS, "Relation group configuration");
  const sourceDocumentIds = normalizeBoundedUniqueStrings(value.sourceDocumentIds, 12, (item) => requirePattern(item, VISUAL_DOCUMENT_ID_PATTERN, "Relation group source document"));
  const directions = normalizeBoundedUniqueStrings(value.directions, 4, (item) => {
    if (!["incoming", "outgoing", "both", "none"].includes(item)) throw new Error("Relation group direction is invalid.");
    return item;
  });
  const relationTypes = normalizeBoundedUniqueStrings(value.relationTypes, 24, (item) => requireText(item, "Relation group relation type", 80));
  const edgeIds = normalizeBoundedUniqueStrings(value.edgeIds, 96, (item) => requirePattern(item, GRAPH_EDGE_ID_PATTERN, "Relation group edge"));
  return { sourceDocumentIds, directions, relationTypes, edgeIds };
}

function normalizeBoundedUniqueStrings(value, maximum, normalize) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("Relation group filter count is outside the allowed range.");
  const normalized = value.map(normalize);
  if (new Set(normalized).size !== normalized.length) throw new Error("Relation group filters must be unique.");
  return normalized;
}

function normalizeImage(root, value, operation) {
  if (value == null) return null;
  requirePlainObject(value, "Card image reference");
  requireExactFields(value, IMAGE_FIELDS, "Card image reference");
  const assetRef = requireAssetRef(root, value.assetRef, operation);
  if (!['cover', 'contain'].includes(value.fit)) throw new Error("Card image fit is invalid.");
  requirePlainObject(value.position, "Card image position");
  requireExactFields(value.position, POSITION_FIELDS, "Card image position");
  const x = requireBoundedNumber(value.position.x, "Card image x position", 0, 1);
  const y = requireBoundedNumber(value.position.y, "Card image y position", 0, 1);
  return { assetRef, fit: value.fit, position: { x, y } };
}

function normalizeVisual(root, value, operation) {
  requirePlainObject(value, "Card visual settings");
  requireExactFields(value, VISUAL_FIELDS, "Card visual settings");
  if (value.density !== "comfortable" && value.density !== "compact") throw new Error("Card visual density is invalid.");
  if (!Array.isArray(value.mediaAssets) || value.mediaAssets.length > MAX_MEDIA_ASSETS) throw new Error("Card media count is outside the allowed range.");
  const mediaAssets = [...new Set(value.mediaAssets.map((asset) => requireAssetRef(root, asset, operation)))];
  return { density: value.density, mediaAssets };
}

function contentDiagnostics(root, document, markdownBody) {
  const diagnostics = [];
  const parsed = parseStoryCardSections(markdownBody);
  diagnostics.push(...parsed.diagnostics);
  for (const block of document.blocks) {
    if (!CONTENT_BLOCK_KINDS.has(block.kind)) continue;
    const content = readStoryCardContent(markdownBody, block.contentRef);
    if (!content.found) diagnostics.push({ code: "missing-content-ref", message: "卡片区块引用的 Markdown 内容不存在。", blockId: block.id, contentRef: block.contentRef });
  }
  for (const [role, image] of [["portrait", document.portrait], ["cover", document.cover]]) {
    if (!image || existsSync(safePath(root, image.assetRef, { allowMissing: true }))) continue;
    diagnostics.push({
      code: `missing-${role}-asset`,
      message: role === "portrait" ? "人物肖像文件已缺失；请重新导入或清除引用。" : "卡片封面文件已缺失；请重新导入或清除引用。"
    });
  }
  return diagnostics.filter((item, index, all) => all.findIndex((candidate) => candidate.code === item.code && candidate.blockId === item.blockId && candidate.sectionId === item.sectionId) === index);
}

function normalizeLegacyCard(value) {
  const blocks = Array.isArray(value?.blocks) ? value.blocks.filter((kind) => LEGACY_BLOCK_KINDS.has(kind)) : [];
  return {
    layout: value?.layout === "vertical" ? "vertical" : "horizontal",
    blocks: blocks.length ? blocks : ["text", "properties", "media", "connections", "graph"],
    coverAsset: typeof value?.coverAsset === "string" && value.coverAsset ? value.coverAsset : null,
    mediaAssets: Array.isArray(value?.mediaAssets) ? value.mediaAssets.filter((item) => typeof item === "string").slice(0, MAX_MEDIA_ASSETS) : []
  };
}

function hasLegacyPresentation(value) {
  return Boolean(value?.hasLegacyFields);
}

function defaultImageReference(assetRef) {
  return { assetRef, fit: "cover", position: { x: 0.5, y: 0.5 } };
}

function requireAssetRef(root, value, operation) {
  const assetRef = requirePattern(value, ASSET_REF_PATTERN, "Card image asset reference").replaceAll("\\", "/");
  if (assetRef.split("/").some((segment) => segment === "." || segment === "..")) throw new Error("Card image asset reference is invalid.");
  const absolutePath = safePath(root, assetRef, { allowMissing: operation === "read" });
  if (existsSync(absolutePath)) {
    assertRegularFile(absolutePath, "Card image asset");
  } else if (operation !== "read") {
    throw new Error("Card image asset does not exist.");
  }
  return assetRef;
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
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Card presentation path escapes the project.");
  assertNoSymlinkPath(root, absolute, options.allowMissing === true);
  return absolute;
}

function assertNoSymlinkPath(root, target, allowMissing) {
  const relative = path.relative(root, target);
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) {
      if (allowMissing) return;
      continue;
    }
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("Card presentation paths cannot cross symlinks.");
  }
  const parent = nearestExistingParent(target);
  const real = realpathSync(parent);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) throw new Error("Card presentation path escapes the project.");
}

function nearestExistingParent(target) {
  let cursor = target;
  while (!existsSync(cursor)) cursor = path.dirname(cursor);
  return cursor;
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").normalize("NFC").replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Card presentation path must be a safe relative project path.");
  }
  return normalized;
}

function parseJson(source) {
  try {
    const value = JSON.parse(source);
    rejectForbiddenKeys(value);
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Card presentation JSON is malformed.");
    throw error;
  }
}

function assertBoundedTree(value, depth = 0, counter = { value: 0 }) {
  counter.value += 1;
  if (depth > MAX_DEPTH || counter.value > MAX_NODES) throw new Error("Card presentation structure is outside the allowed range.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Card presentation contains a non-finite number.");
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) throw new Error("Card presentation string is too long.");
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) assertBoundedTree(child, depth + 1, counter);
}

function rejectForbiddenKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Card presentation contains forbidden content field: ${key}`);
    rejectForbiddenKeys(child);
  }
}

function requireExactFields(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains an unknown field: ${key}`);
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
}

function requireObjectId(value) {
  return requirePattern(value, OBJECT_ID_PATTERN, "Card object identifier");
}

function requireBlockKind(value) {
  const kind = String(value || "");
  if (!BLOCK_KIND_SET.has(kind)) throw new Error("Card presentation block kind is not supported.");
  return kind;
}

function requirePattern(value, pattern, label) {
  const text = String(value ?? "").normalize("NFC");
  if (!pattern.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireText(value, label, maximumLength) {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maximumLength || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

function requireBoundedNumber(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function requirePositiveInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Card block ordinal is invalid.");
  return number;
}

function requireHash(value) {
  const text = String(value || "");
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error("Card presentation hash is invalid.");
  return text;
}

function assertRegularFile(target, label) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isFile()) throw new Error(`${label} is invalid.`);
}

function hash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}
