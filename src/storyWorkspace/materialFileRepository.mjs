import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openStoryWorkspace } from "./storyWorkspaceRepository.mjs";

export const MATERIAL_FILE_CATALOG_VERSION = "tianyan-material-file-catalog/v1";
export const MATERIAL_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const MATERIAL_FILE_BATCH_MAX = 20;
const CATALOG_PATH = "documents/workspace/material-files.json";
const ASSET_ROOT = "assets/material-files";
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPTS = 500;

export function readMaterialFileCatalog(rootPath) {
  const root = prepareRoot(rootPath);
  const target = safePath(root, CATALOG_PATH, true);
  if (!existsSync(target)) return withHash(defaultCatalog());
  if (lstatSync(target).isSymbolicLink()) throw new Error("Material file catalog cannot be a symlink.");
  const source = readFileSync(target, "utf8");
  if (Buffer.byteLength(source) > MAX_CATALOG_BYTES) throw new Error("Material file catalog is too large.");
  return withHash(normalizeCatalog(JSON.parse(source)));
}

export function listMaterialFiles(rootPath, input = {}) {
  const catalog = readMaterialFileCatalog(rootPath);
  const query = String(input.query || "").normalize("NFC").trim().toLocaleLowerCase();
  const type = input.type ? requireType(input.type) : null;
  const archived = input.archived === true;
  const folderId = input.folderId == null ? undefined : input.folderId === "" ? null : requireId(input.folderId, "Folder id");
  const offset = integer(input.offset ?? 0, "Offset", 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(input.limit ?? 100, "Limit", 1, 200);
  const sort = ["recent", "name", "size", "type"].includes(input.sort) ? input.sort : "recent";
  const filtered = catalog.files.filter((file) => Boolean(file.archivedAt) === archived)
    .filter((file) => !type || file.type === type)
    .filter((file) => folderId === undefined || file.folderId === folderId)
    .filter((file) => !query || [file.displayName, file.originalName, ...file.tags, currentText(file)].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => sort === "name" ? a.displayName.localeCompare(b.displayName, "zh-CN") : sort === "size" ? b.size - a.size || a.displayName.localeCompare(b.displayName, "zh-CN") : sort === "type" ? a.type.localeCompare(b.type) || a.displayName.localeCompare(b.displayName, "zh-CN") : b.updatedAt.localeCompare(a.updatedAt) || a.displayName.localeCompare(b.displayName, "zh-CN"));
  return clone({ files: filtered.slice(offset, offset + limit).map(listProjection), total: filtered.length, offset, limit, folders: catalog.folders, catalogRevision: catalog.revision, contentHash: catalog.contentHash });
}

function currentText(file) {
  return file.revisions.find((revision) => revision.id === file.currentRevisionId)?.textContent ?? "";
}

function listProjection(file) {
  return { ...file, revisions: file.revisions.map((revision) => ({ ...revision, textContent: null })) };
}

export function readMaterialFile(rootPath, fileId, revisionId = null) {
  const root = prepareRoot(rootPath);
  const catalog = readMaterialFileCatalog(root);
  const file = catalog.files.find((entry) => entry.id === requireId(fileId, "File id"));
  if (!file) return null;
  const requestedRevision = revisionId || file.currentRevisionId;
  const revision = file.revisions.find((entry) => entry.id === requestedRevision || entry.sha256 === requestedRevision);
  if (!revision) return null;
  return clone({ ...file, revision, contentHash: catalog.contentHash });
}

export function resolveMaterialFileBytes(rootPath, fileId, revisionId = null) {
  const root = prepareRoot(rootPath);
  const record = readMaterialFile(root, fileId, revisionId);
  if (!record) throw notFound("Material file or revision is unavailable.");
  const absolutePath = safePath(root, record.revision.relativePath, false);
  if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile() || lstatSync(absolutePath).isSymbolicLink()) throw notFound("Material file bytes are unavailable.");
  const bytes = readFileSync(absolutePath);
  if (bytes.length !== record.revision.size || digest(bytes) !== record.revision.sha256) throw new Error("Material file bytes do not match the saved revision.");
  return { record, absolutePath, bytes };
}

export function importMaterialFiles(rootPath, input) {
  const root = prepareRoot(rootPath);
  const operationId = requireId(input.operationId, "Operation id");
  const current = readMaterialFileCatalog(root);
  const replay = current.receipts.find((entry) => entry.operationId === operationId);
  if (replay) return clone({ ...replay, replayed: true, catalogRevision: current.revision });
  const entries = Array.isArray(input.files) ? input.files : [];
  if (!entries.length || entries.length > MATERIAL_FILE_BATCH_MAX) throw new Error(`Select 1-${MATERIAL_FILE_BATCH_MAX} files per batch.`);
  const now = iso(input.now);
  const results = [];
  let next = stripHash(current);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      const bytes = decodeBytes(entry.base64);
      if (!bytes.length || bytes.length > MATERIAL_FILE_MAX_BYTES) throw new Error(`Each file must be 1-${MATERIAL_FILE_MAX_BYTES} bytes.`);
      const originalName = filename(entry.name);
      const mimeType = mime(entry.mimeType, originalName);
      assertAllowedBytes(bytes, mimeType, originalName);
      const sha256 = digest(bytes);
      const duplicate = next.files.find((file) => file.revisions.some((revision) => revision.sha256 === sha256 && revision.size === bytes.length));
      const replaceFileId = entry.replaceFileId ? requireId(entry.replaceFileId, "Replacement file id") : null;
      if (replaceFileId) {
        const fileIndex = next.files.findIndex((file) => file.id === replaceFileId);
        if (fileIndex < 0) throw new Error("Replacement target is unavailable.");
        const existing = next.files[fileIndex];
        if (existing.revisions.some((revision) => revision.sha256 === sha256)) {
          results.push({ index, name: originalName, status: "duplicate", fileId: existing.id, revisionId: existing.currentRevisionId, duplicateOf: existing.id, error: null });
          continue;
        }
        const revision = writeRevision(root, existing.id, originalName, mimeType, bytes, now);
        next.files[fileIndex] = { ...existing, originalName, mimeType, type: materialType(mimeType, originalName), size: bytes.length, currentRevisionId: revision.id, revisions: [...existing.revisions, revision], updatedAt: now };
        results.push({ index, name: originalName, status: "version-created", fileId: existing.id, revisionId: revision.id, duplicateOf: duplicate?.id ?? null, error: null });
        continue;
      }
      if (duplicate) {
        results.push({ index, name: originalName, status: "duplicate", fileId: duplicate.id, revisionId: duplicate.currentRevisionId, duplicateOf: duplicate.id, error: null });
        continue;
      }
      const id = `file.${randomUUID()}`;
      const revision = writeRevision(root, id, originalName, mimeType, bytes, now);
      next.files.push({ id, displayName: displayName(entry.displayName || originalName), originalName, mimeType, type: materialType(mimeType, originalName), size: bytes.length, folderId: normalizeFolder(input.folderId, next.folders), tags: stringList(entry.tags, 32, 60), archivedAt: null, currentRevisionId: revision.id, revisions: [revision], links: [], createdAt: now, updatedAt: now });
      results.push({ index, name: originalName, status: "created", fileId: id, revisionId: revision.id, duplicateOf: null, error: null });
    } catch (error) {
      results.push({ index, name: typeof entry?.name === "string" ? entry.name.slice(0, 180) : `item-${index + 1}`, status: "failed", fileId: null, revisionId: null, duplicateOf: null, error: error instanceof Error ? error.message : "Import failed." });
    }
  }
  const receipt = { version: "tianyan-material-file-operation-receipt/v1", operationId, kind: "import", state: results.some((entry) => entry.status === "failed") ? "partial" : "completed", results, createdAt: now };
  next.receipts = [...next.receipts, receipt].slice(-MAX_RECEIPTS);
  next.revision += 1;
  writeCatalog(root, next);
  return clone({ ...receipt, replayed: false, catalogRevision: next.revision });
}

export function createMaterialNote(rootPath, input) {
  const title = String(input.displayName || input.name || "新建笔记").replace(/\.(?:md|markdown)$/iu, "").trim() || "新建笔记";
  const text = String(input.content ?? "") || `# ${title}\n\n`;
  const name = filename(input.name || "新建笔记.md");
  return importMaterialFiles(rootPath, { operationId: input.operationId, folderId: input.folderId ?? null, now: input.now, files: [{ name, displayName: input.displayName || name.replace(/\.[^.]+$/u, ""), mimeType: "text/markdown", base64: Buffer.from(text, "utf8").toString("base64"), tags: input.tags || [] }] });
}

export function updateMaterialFileMetadata(rootPath, input) {
  return mutate(rootPath, input, "metadata", (file, catalog, now) => ({ ...file, displayName: input.displayName == null ? file.displayName : displayName(input.displayName), tags: input.tags == null ? file.tags : stringList(input.tags, 32, 60), folderId: input.folderId === undefined ? file.folderId : normalizeFolder(input.folderId, catalog.folders), links: input.links == null ? file.links : normalizeLinks(input.links), updatedAt: now }));
}

export function setMaterialFilesArchived(rootPath, input) {
  return mutateMany(rootPath, input, input.archived ? "archive" : "restore", (file, _catalog, now) => ({ ...file, archivedAt: input.archived ? (file.archivedAt || now) : null, updatedAt: now }));
}

export function moveMaterialFiles(rootPath, input) {
  return mutateMany(rootPath, input, "move", (file, catalog, now) => ({ ...file, folderId: normalizeFolder(input.folderId, catalog.folders), updatedAt: now }));
}

export function createMaterialFolder(rootPath, input) {
  const root = prepareRoot(rootPath);
  const current = readMaterialFileCatalog(root);
  assertExpected(current, input.expectedRevision);
  const now = iso(input.now);
  const parentId = normalizeFolder(input.parentId ?? null, current.folders);
  const id = `folder.${randomUUID()}`;
  const next = stripHash(current);
  next.folders.push({ id, title: displayName(input.title), parentId, createdAt: now, updatedAt: now });
  next.revision += 1;
  writeCatalog(root, next);
  return clone({ folder: next.folders.at(-1), catalogRevision: next.revision });
}

export function updateMaterialFolder(rootPath, input) {
  const root = prepareRoot(rootPath);
  const current = readMaterialFileCatalog(root);
  assertExpected(current, input.expectedRevision);
  const id = requireId(input.folderId, "Folder id");
  const index = current.folders.findIndex((folder) => folder.id === id);
  if (index < 0) throw notFound("Material folder is unavailable.");
  const parentId = input.parentId === undefined ? current.folders[index].parentId : normalizeFolder(input.parentId, current.folders);
  if (parentId === id || (parentId && descendants(current.folders, id).has(parentId))) throw new Error("Folder cannot be moved into itself or a descendant.");
  const now = iso(input.now);
  const next = stripHash(current);
  next.folders[index] = { ...next.folders[index], title: input.title == null ? next.folders[index].title : displayName(input.title), parentId, updatedAt: now };
  next.revision += 1;
  writeCatalog(root, next);
  return clone({ folder: next.folders[index], catalogRevision: next.revision });
}

export function readMaterialOperationReceipt(rootPath, operationId) {
  return clone(readMaterialFileCatalog(rootPath).receipts.find((entry) => entry.operationId === requireId(operationId, "Operation id")) || null);
}

function mutate(rootPath, input, kind, transform) {
  return mutateMany(rootPath, { ...input, fileIds: [input.fileId] }, kind, transform);
}
function mutateMany(rootPath, input, kind, transform) {
  const root = prepareRoot(rootPath);
  const operationId = requireId(input.operationId, "Operation id");
  const current = readMaterialFileCatalog(root);
  const replay = current.receipts.find((entry) => entry.operationId === operationId);
  if (replay) return clone({ ...replay, replayed: true, catalogRevision: current.revision });
  assertExpected(current, input.expectedRevision);
  const ids = [...new Set((Array.isArray(input.fileIds) ? input.fileIds : []).map((id) => requireId(id, "File id")))];
  if (!ids.length || ids.length > 200) throw new Error("Select 1-200 files.");
  const now = iso(input.now);
  const next = stripHash(current);
  const results = ids.map((id) => {
    const index = next.files.findIndex((file) => file.id === id);
    if (index < 0) return { fileId: id, status: "failed", error: "Material file is unavailable." };
    try { next.files[index] = transform(next.files[index], next, now); return { fileId: id, status: "completed", error: null }; }
    catch (error) { return { fileId: id, status: "failed", error: error instanceof Error ? error.message : "Operation failed." }; }
  });
  const receipt = { version: "tianyan-material-file-operation-receipt/v1", operationId, kind, state: results.some((entry) => entry.status === "failed") ? "partial" : "completed", results, createdAt: now };
  next.receipts = [...next.receipts, receipt].slice(-MAX_RECEIPTS);
  next.revision += 1;
  writeCatalog(root, next);
  return clone({ ...receipt, replayed: false, catalogRevision: next.revision });
}

function writeRevision(root, fileId, originalName, mimeType, bytes, now) {
  const sha256 = digest(bytes);
  const id = `revision.${sha256.slice(0, 24)}`;
  // Stored revisions deliberately use a neutral extension. Workspace note
  // discovery must never parse uploaded .md/.txt bytes as product documents,
  // and download/preview always use the validated metadata MIME instead.
  const relativePath = `${ASSET_ROOT}/${fileId}/${id}.blob`;
  const target = safePath(root, relativePath, true);
  mkdirSync(path.dirname(target), { recursive: true });
  if (!existsSync(target)) writeFileSync(target, bytes, { flag: "wx" });
  else if (digest(readFileSync(target)) !== sha256) throw new Error("Material revision path collision.");
  const text = isTextMime(mimeType) ? decodeUtf8(bytes) : null;
  return { id, sha256, size: bytes.length, mimeType, relativePath, textStatus: text === null ? "not-applicable" : "ready", textContent: text, createdAt: now };
}
function writeCatalog(root, catalog) {
  const normalized = normalizeCatalog(catalog);
  const target = safePath(root, CATALOG_PATH, true);
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { flag: "wx" });
  renameSync(temporary, target);
}
function defaultCatalog() { return { version: MATERIAL_FILE_CATALOG_VERSION, revision: 0, folders: [], files: [], receipts: [] }; }
function normalizeCatalog(value) {
  rejectDangerous(value);
  if (!value || value.version !== MATERIAL_FILE_CATALOG_VERSION) throw new Error("Unsupported material file catalog version.");
  const folders = Array.isArray(value.folders) ? value.folders.map((folder) => ({ id: requireId(folder.id, "Folder id"), title: displayName(folder.title), parentId: folder.parentId == null ? null : requireId(folder.parentId, "Parent folder"), createdAt: iso(folder.createdAt), updatedAt: iso(folder.updatedAt) })) : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  if (folderIds.size !== folders.length) throw new Error("Material folder ids must be unique.");
  for (const folder of folders) if (folder.parentId && (!folderIds.has(folder.parentId) || folder.parentId === folder.id || descendants(folders, folder.id).has(folder.parentId))) throw new Error("Material folder hierarchy is invalid.");
  const files = Array.isArray(value.files) ? value.files.map((file) => normalizeFile(file, folderIds)) : [];
  if (new Set(files.map((file) => file.id)).size !== files.length) throw new Error("Material file ids must be unique.");
  const receipts = Array.isArray(value.receipts) ? value.receipts.slice(-MAX_RECEIPTS).map(normalizeReceipt) : [];
  return { version: MATERIAL_FILE_CATALOG_VERSION, revision: integer(value.revision ?? 0, "Catalog revision", 0, Number.MAX_SAFE_INTEGER), folders, files, receipts };
}
function normalizeFile(file, folderIds) {
  const revisions = Array.isArray(file.revisions) ? file.revisions.map((revision) => ({ id: requireId(revision.id, "Revision id"), sha256: hashText(revision.sha256), size: integer(revision.size, "Revision size", 1, MATERIAL_FILE_MAX_BYTES), mimeType: mime(revision.mimeType, file.originalName), relativePath: assetPath(revision.relativePath), textStatus: ["ready", "unavailable", "not-applicable"].includes(revision.textStatus) ? revision.textStatus : "unavailable", textContent: revision.textContent == null ? null : String(revision.textContent), createdAt: iso(revision.createdAt) })) : [];
  if (!revisions.length || new Set(revisions.map((revision) => revision.id)).size !== revisions.length) throw new Error("Material revisions are invalid.");
  const currentRevisionId = requireId(file.currentRevisionId, "Current revision id");
  if (!revisions.some((revision) => revision.id === currentRevisionId)) throw new Error("Current material revision is unavailable.");
  const folderId = file.folderId == null ? null : requireId(file.folderId, "Folder id");
  if (folderId && !folderIds.has(folderId)) throw new Error("Material folder reference is invalid.");
  return { id: requireId(file.id, "File id"), displayName: displayName(file.displayName), originalName: filename(file.originalName), mimeType: mime(file.mimeType, file.originalName), type: requireType(file.type), size: integer(file.size, "File size", 1, MATERIAL_FILE_MAX_BYTES), folderId, tags: stringList(file.tags, 32, 60), archivedAt: file.archivedAt == null ? null : iso(file.archivedAt), currentRevisionId, revisions, links: normalizeLinks(file.links || []), createdAt: iso(file.createdAt), updatedAt: iso(file.updatedAt) };
}
function normalizeReceipt(value) { if (!value || typeof value !== "object") throw new Error("Material operation receipt is invalid."); return clone(value); }
function withHash(catalog) { const normalized = normalizeCatalog(catalog); return clone({ ...normalized, contentHash: digest(Buffer.from(JSON.stringify(normalized))) }); }
function stripHash(catalog) { const { contentHash: _hash, ...value } = catalog; return clone(value); }
function descendants(folders, id) { const result = new Set(); let changed = true; while (changed) { changed = false; for (const folder of folders) if (folder.parentId === id || (folder.parentId && result.has(folder.parentId))) if (!result.has(folder.id)) { result.add(folder.id); changed = true; } } return result; }
function normalizeFolder(value, folders) { if (value == null || value === "") return null; const id = requireId(value, "Folder id"); if (!folders.some((folder) => folder.id === id)) throw new Error("Material folder is unavailable."); return id; }
function normalizeLinks(value) { if (!Array.isArray(value) || value.length > 200) throw new Error("Material links are invalid."); return value.map((link) => ({ kind: ["world-object", "source-import", "visual-document"].includes(link?.kind) ? link.kind : (() => { throw new Error("Material link kind is invalid."); })(), id: requireId(link.id, "Material link id"), label: displayName(link.label || link.id) })); }
function prepareRoot(rootPath) { const workspace = openStoryWorkspace(path.resolve(String(rootPath || ""))); if (lstatSync(workspace.rootPath).isSymbolicLink()) throw new Error("Workspace root cannot be a symlink."); return realpathSync(workspace.rootPath); }
function safePath(root, relativePath, allowMissing) { const normalized = String(relativePath || "").replaceAll("\\", "/"); if (!normalized || normalized.startsWith("/") || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Material path is invalid."); const target = path.resolve(root, normalized); const relative = path.relative(root, target); if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Material path escapes the project."); let cursor = target; while (!existsSync(cursor)) { if (!allowMissing) throw notFound("Material path is unavailable."); cursor = path.dirname(cursor); } if (lstatSync(cursor).isSymbolicLink() || (realpathSync(cursor) !== root && !realpathSync(cursor).startsWith(`${root}${path.sep}`))) throw new Error("Material path cannot cross a symlink."); return target; }
function decodeBytes(value) { if (typeof value !== "string" || Buffer.from(value, "base64").toString("base64") !== value) throw new Error("File payload is not canonical base64."); return Buffer.from(value, "base64"); }
function decodeUtf8(bytes) { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (text.includes("\0")) throw new Error("Text file contains unsupported null bytes."); return text; }
function isTextMime(value) { return value === "text/plain" || value === "text/markdown"; }
function materialType(mimeType, name) { if (isTextMime(mimeType)) return "text"; if (["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return "image"; if (mimeType === "application/pdf") return "pdf"; if (mimeType.startsWith("audio/")) return "audio"; if (mimeType.startsWith("video/")) return "video"; if (/\.(?:docx?|odt|xlsx?|csv|pptx?)$/iu.test(name)) return "office"; if (/\.(?:zip|7z|rar|tar|gz)$/iu.test(name)) return "archive"; return "attachment"; }
function requireType(value) { if (!["text", "image", "pdf", "audio", "video", "office", "archive", "attachment"].includes(value)) throw new Error("Material file type is invalid."); return value; }
function mime(value, name) { const text = String(value || "").toLowerCase().trim(); if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(text)) return text; const ext = path.extname(String(name || "")).toLowerCase(); return ({ ".md": "text/markdown", ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm", ".zip": "application/zip" })[ext] || "application/octet-stream"; }
function assertAllowedBytes(bytes, mimeType, name) { const ext = path.extname(name).toLowerCase(); if ([".exe", ".dll", ".so", ".sh", ".bat", ".cmd", ".appimage", ".msi", ".deb", ".rpm"].includes(ext)) throw new Error("Executable files are not accepted as materials."); if (mimeType === "image/png" && !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("PNG signature does not match the declared type."); if (mimeType === "image/jpeg" && !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9)) throw new Error("JPEG signature does not match the declared type."); if (mimeType === "image/webp" && !(bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) throw new Error("WebP signature does not match the declared type."); if (mimeType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("PDF signature does not match the declared type."); }
function assetPath(value) { const text = String(value || "").replaceAll("\\", "/"); if (!text.startsWith(`${ASSET_ROOT}/`) || text.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Material asset path is invalid."); return text; }
function filename(value) { const text = String(value || "").normalize("NFC").trim(); if (!text || text.length > 180 || /[/\\\0\r\n]/u.test(text)) throw new Error("Filename is invalid."); return text; }
function displayName(value) { const text = String(value || "").normalize("NFC").trim(); if (!text || text.length > 180 || /[\0\r\n]/u.test(text)) throw new Error("Display name is invalid."); return text; }
function requireId(value, label) { const text = String(value || "").normalize("NFC").trim(); if (!text || text.length > 200 || !/^[\p{L}\p{N}._:-]+$/u.test(text)) throw new Error(`${label} is invalid.`); return text; }
function iso(value = new Date().toISOString()) { const text = String(value); if (!Number.isFinite(Date.parse(text))) throw new Error("Timestamp is invalid."); return text; }
function integer(value, label, min, max) { if (!Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`${label} is invalid.`); return Number(value); }
function stringList(value = [], maxItems, maxLength) { if (!Array.isArray(value) || value.length > maxItems) throw new Error("String list is invalid."); return [...new Set(value.map((item) => { const text = String(item || "").normalize("NFC").trim(); if (!text || text.length > maxLength) throw new Error("String value is invalid."); return text; }))]; }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function hashText(value) { const text = String(value || ""); if (!/^[0-9a-f]{64}$/u.test(text)) throw new Error("Content hash is invalid."); return text; }
function assertExpected(catalog, expected) { if (integer(expected, "Expected catalog revision", 0, Number.MAX_SAFE_INTEGER) !== catalog.revision) { const error = new Error("Material catalog changed; reload before editing."); error.statusCode = 409; throw error; } }
function notFound(message) { const error = new Error(message); error.statusCode = 404; return error; }
function rejectDangerous(value, depth = 0) { if (depth > 20) throw new Error("Material catalog is too deep."); if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Material catalog contains a dangerous key."); rejectDangerous(child, depth + 1); } }
function clone(value) { return structuredClone(value); }
