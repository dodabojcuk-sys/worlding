import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openStoryWorkspace } from "./storyWorkspaceRepository.mjs";

const CATALOG_VERSION = "story-studio-media-catalog/v1";
const CATALOG_PATH = "creation/media-assets.json";
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_ASSETS = 500;
const MEDIA_KINDS = new Set(["image", "audio", "video", "reference"]);

export function readCreationMediaCatalog(rootPath) {
  const root = prepareRoot(rootPath);
  const absolutePath = safePath(root, CATALOG_PATH, { allowMissing: true });
  if (!existsSync(absolutePath)) return clone({ version: CATALOG_VERSION, assets: [], contentHash: null, source: "creation-media-json" });
  if (lstatSync(absolutePath).isSymbolicLink() || !lstatSync(absolutePath).isFile()) throw new Error("Creation media catalog must be a regular file.");
  if (statSync(absolutePath).size > MAX_CATALOG_BYTES) throw new Error("Creation media catalog is too large.");
  const source = readFileSync(absolutePath, "utf8");
  const parsed = parseObject(source);
  const catalog = normalizeCatalog(parsed);
  return clone({ ...catalog, contentHash: hash(source), source: "creation-media-json" });
}

export function createCreationMediaAsset(rootPath, input) {
  const current = readCreationMediaCatalog(rootPath);
  assertExpectedHash(input.expectedCatalogHash, current.contentHash);
  if (current.assets.length >= MAX_ASSETS) throw new Error("Creation media catalog reached its asset limit.");
  const now = requireIso(input.now);
  const requested = normalizeAsset({ ...input.asset, createdAt: now, updatedAt: now });
  const id = uniqueAssetId(requested.id || `${requested.kind}.${slug(requested.fileName)}`, new Set(current.assets.map((asset) => asset.id)));
  writeCatalog(rootPath, { version: CATALOG_VERSION, assets: [...current.assets, { ...requested, id }] });
  const next = readCreationMediaCatalog(rootPath);
  return clone({ conflict: false, catalog: next, asset: next.assets.find((asset) => asset.id === id) });
}

export function updateCreationMediaAsset(rootPath, input) {
  const current = readCreationMediaCatalog(rootPath);
  if (!expectedHashMatches(input.expectedCatalogHash, current.contentHash)) return clone({ conflict: true, catalog: current, asset: current.assets.find((asset) => asset.id === input.assetId) || null });
  const index = current.assets.findIndex((asset) => asset.id === input.assetId);
  if (index < 0) throw new Error("Creation media asset does not exist.");
  const previous = current.assets[index];
  const candidate = normalizeAsset({ ...previous, ...input.patch, id: previous.id, createdAt: previous.createdAt, updatedAt: requireIso(input.now) });
  const assets = current.assets.map((asset, assetIndex) => assetIndex === index ? candidate : asset);
  writeCatalog(rootPath, { version: CATALOG_VERSION, assets });
  const next = readCreationMediaCatalog(rootPath);
  return clone({ conflict: false, catalog: next, asset: next.assets[index] });
}

export function deleteCreationMediaAsset(rootPath, input) {
  const current = readCreationMediaCatalog(rootPath);
  if (!expectedHashMatches(input.expectedCatalogHash, current.contentHash)) return clone({ conflict: true, catalog: current });
  if (!current.assets.some((asset) => asset.id === input.assetId)) throw new Error("Creation media asset does not exist.");
  writeCatalog(rootPath, { version: CATALOG_VERSION, assets: current.assets.filter((asset) => asset.id !== input.assetId) });
  return clone({ conflict: false, catalog: readCreationMediaCatalog(rootPath) });
}

function writeCatalog(rootPath, value) {
  const root = prepareRoot(rootPath);
  const catalog = normalizeCatalog(value);
  const source = `${JSON.stringify(catalog, null, 2)}\n`;
  if (Buffer.byteLength(source) > MAX_CATALOG_BYTES) throw new Error("Creation media catalog is too large.");
  const absolutePath = safePath(root, CATALOG_PATH, { allowMissing: true });
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, source, { encoding: "utf8", flag: "w", mode: 0o600 });
  renameSync(temporaryPath, absolutePath);
}

function normalizeCatalog(value) {
  rejectDangerous(value);
  if (value.version !== CATALOG_VERSION || !Array.isArray(value.assets) || value.assets.length > MAX_ASSETS) throw new Error("Creation media catalog is invalid.");
  const assets = value.assets.map(normalizeAsset);
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) throw new Error("Creation media asset IDs must be unique.");
  return { version: CATALOG_VERSION, assets };
}

function normalizeAsset(value) {
  rejectDangerous(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Creation media asset is invalid.");
  const kind = text(value.kind, "Media kind", 24);
  if (!MEDIA_KINDS.has(kind)) throw new Error("Creation media kind is invalid.");
  const relativePath = optionalText(value.relativePath, "Media path", 280);
  if (relativePath && (!relativePath.startsWith("assets/") || relativePath.split("/").some((segment) => !segment || segment === "." || segment === ".."))) throw new Error("Media path must stay inside project assets.");
  const width = optionalInteger(value.width, "Media width");
  const height = optionalInteger(value.height, "Media height");
  const durationMs = optionalInteger(value.durationMs, "Media duration");
  return {
    id: optionalText(value.id, "Media asset ID", 160),
    fileName: text(value.fileName, "Media filename", 180),
    kind,
    mimeType: text(value.mimeType, "Media MIME type", 100),
    size: integer(value.size, "Media size", 0, 1024 * 1024 * 1024 * 8),
    width,
    height,
    durationMs,
    source: optionalText(value.source, "Media source", 500),
    license: optionalText(value.license, "Media license", 300),
    generatedBy: optionalText(value.generatedBy, "Media generation source", 300),
    tags: stringList(value.tags, 32, 60),
    relativePath,
    createdAt: requireIso(value.createdAt),
    updatedAt: requireIso(value.updatedAt)
  };
}

function prepareRoot(rootPath) {
  const absolute = path.resolve(String(rootPath || ""));
  openStoryWorkspace(absolute);
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("Workspace root cannot be a symlink.");
  return realpathSync(absolute);
}

function safePath(root, relativePath, options = {}) {
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Creation media path escapes the workspace.");
  let cursor = path.dirname(absolute);
  while (cursor.startsWith(root) && cursor !== root) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Creation media path cannot cross symlinks.");
    cursor = path.dirname(cursor);
  }
  if (!options.allowMissing && existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) throw new Error("Creation media file cannot be a symlink.");
  return absolute;
}

function uniqueAssetId(baseValue, existing) {
  const base = text(baseValue, "Media asset ID", 160).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "") || "asset";
  if (!existing.has(base)) return base;
  for (let index = 2; index < 10_000; index += 1) if (!existing.has(`${base}.${index}`)) return `${base}.${index}`;
  throw new Error("Could not allocate a media asset ID.");
}

function slug(value) { return String(value || "asset").normalize("NFC").replace(/\.[^.]+$/u, "").slice(0, 80); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return structuredClone(value); }
function parseObject(source) { try { const value = JSON.parse(source); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; } catch { throw new Error("Creation media catalog is malformed."); } }
function requireIso(value) { const textValue = text(value, "Media timestamp", 80); if (!Number.isFinite(Date.parse(textValue))) throw new Error("Media timestamp is invalid."); return textValue; }
function text(value, label, max) { if (typeof value !== "string" || !value.normalize("NFC").trim() || value.length > max) throw new Error(`${label} is invalid.`); return value.normalize("NFC").trim(); }
function optionalText(value, label, max) { if (value == null || value === "") return ""; return text(value, label, max); }
function integer(value, label, min, max) { if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} is invalid.`); return value; }
function optionalInteger(value, label) { return value == null ? null : integer(value, label, 0, Number.MAX_SAFE_INTEGER); }
function stringList(value, maxItems, maxLength) { if (!Array.isArray(value) || value.length > maxItems) throw new Error("Media tags are invalid."); return [...new Set(value.map((item) => text(item, "Media tag", maxLength)))]; }
function assertExpectedHash(expected, current) { if (!expectedHashMatches(expected, current)) throw new Error("Creation media catalog changed; reload before editing."); }
function expectedHashMatches(expected, current) { return (expected == null ? null : text(expected, "Expected media catalog hash", 128)) === current; }
function rejectDangerous(value, depth = 0) { if (depth > 12) throw new Error("Creation media metadata is too deep."); if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Creation media metadata contains a dangerous key."); rejectDangerous(child, depth + 1); } }
