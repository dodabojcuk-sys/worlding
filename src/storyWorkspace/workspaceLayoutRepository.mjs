import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { openStoryWorkspace } from "./storyWorkspaceRepository.mjs";

const WORKSPACE_LAYOUT_VERSION = "story-workspace-layout/v1";
const WORKSPACE_LAYOUT_PATH = "documents/workspace/library.workspace.json";
const MAX_LAYOUT_BYTES = 256 * 1024;

export function readWorkspaceLayout(rootPath) {
  const root = prepareRoot(rootPath);
  const absolutePath = safePath(root, WORKSPACE_LAYOUT_PATH, { allowMissing: true });
  if (!existsSync(absolutePath)) return clone(defaultLayout());
  if (lstatSync(absolutePath).isSymbolicLink()) throw new Error("Workspace layout cannot be a symlink.");
  const source = readFileSync(absolutePath, "utf8");
  if (Buffer.byteLength(source, "utf8") > MAX_LAYOUT_BYTES) throw new Error("Workspace layout is too large.");
  const layout = normalizeLayout(JSON.parse(source));
  return clone({ ...layout, contentHash: hash(source), source: "workspace-json" });
}

export function createWorkspaceFolder(rootPath, input) {
  const root = prepareRoot(rootPath);
  const current = readWorkspaceLayout(root);
  const title = requireText(input.title, "Folder title", 80);
  const parentId = input.parentId == null ? null : requireText(input.parentId, "Parent folder", 120);
  const kind = normalizeFolderKind(input.kind);
  if (parentId && !current.folders.some((folder) => folder.id === parentId)) throw new Error("Parent folder does not exist.");
  const base = `folder.${safeIdSegment(title)}`;
  let id = base;
  let suffix = 2;
  while (current.folders.some((folder) => folder.id === id)) id = `${base}-${suffix++}`;
  const next = normalizeLayout({
    ...current,
    folders: [...current.folders, { id, title, parentId, kind, order: current.folders.length }]
  });
  writeLayout(root, next);
  return clone({ folder: next.folders.find((folder) => folder.id === id), layout: readWorkspaceLayout(root) });
}

export function updateWorkspaceLayout(rootPath, input) {
  const root = prepareRoot(rootPath);
  const current = readWorkspaceLayout(root);
  if (requireText(input.expectedContentHash, "Workspace layout revision", 128) !== current.contentHash) {
    return clone({ conflict: true, layout: current });
  }
  const next = normalizeLayout(input.layout);
  writeLayout(root, next);
  return clone({ conflict: false, layout: readWorkspaceLayout(root) });
}

function defaultLayout() {
  return {
    version: WORKSPACE_LAYOUT_VERSION,
    folders: [],
    placements: []
  };
}

function normalizeLayout(value) {
  rejectDangerousKeys(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Workspace layout must be an object.");
  if (value.version !== WORKSPACE_LAYOUT_VERSION) throw new Error("Unsupported workspace layout version.");
  const folders = Array.isArray(value.folders) ? value.folders.map((folder) => ({
    id: requireText(folder?.id, "Folder id", 120),
    title: requireText(folder?.title, "Folder title", 80),
    parentId: folder?.parentId == null ? null : requireText(folder.parentId, "Parent folder", 120),
    kind: normalizeFolderKind(folder?.kind),
    order: requireInteger(folder?.order, "Folder order")
  })) : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  if (folderIds.size !== folders.length) throw new Error("Folder ids must be unique.");
  for (const folder of folders) {
    if (folder.parentId && !folderIds.has(folder.parentId)) throw new Error("Folder parent reference is invalid.");
    if (folder.parentId === folder.id) throw new Error("Folder cannot contain itself.");
  }
  const placements = Array.isArray(value.placements) ? value.placements.map((placement) => ({
    documentId: requireText(placement?.documentId, "Placed document", 180),
    folderId: requireText(placement?.folderId, "Placement folder", 120),
    order: requireInteger(placement?.order, "Placement order")
  })) : [];
  if (new Set(placements.map((placement) => placement.documentId)).size !== placements.length) {
    throw new Error("A document can be placed in only one folder.");
  }
  if (placements.some((placement) => !folderIds.has(placement.folderId))) throw new Error("Placement folder does not exist.");
  return {
    version: WORKSPACE_LAYOUT_VERSION,
    folders: folders.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    placements: placements.sort((left, right) => left.order - right.order || left.documentId.localeCompare(right.documentId))
  };
}

function normalizeFolderKind(value) {
  if (value == null || value === "") return "folder";
  if (value === "folder" || value === "custom-category") return value;
  throw new Error("Workspace folder kind is invalid.");
}

function writeLayout(root, layout) {
  const absolutePath = safePath(root, WORKSPACE_LAYOUT_PATH, { allowMissing: true });
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(layout, null, 2)}\n`, { flag: "w" });
  renameSync(temporaryPath, absolutePath);
}

function prepareRoot(rootPath) {
  const workspace = openStoryWorkspace(rootPath);
  return realpathSync(workspace.rootPath);
}

function safePath(root, relativePath, options = { allowMissing: false }) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Workspace layout path is invalid.");
  }
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Workspace layout path escapes the project.");
  let cursor = target;
  while (!existsSync(cursor)) {
    if (!options.allowMissing) throw new Error("Workspace layout does not exist.");
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("Workspace layout path is invalid.");
    cursor = parent;
  }
  if (lstatSync(cursor).isSymbolicLink()) throw new Error("Workspace layout path cannot contain a symlink.");
  if (realpathSync(cursor) !== root && !realpathSync(cursor).startsWith(`${root}${path.sep}`)) throw new Error("Workspace layout path escapes the project.");
  return target;
}

function requireText(value, label, maxLength) {
  const text = String(value || "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} is invalid.`);
  return number;
}

function safeIdSegment(value) {
  return requireText(value, "Folder title", 80).replace(/\s+/gu, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/gu, "-").slice(0, 80) || "untitled";
}

function rejectDangerousKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Workspace layout contains a dangerous key.");
    rejectDangerousKeys(child);
  }
}

function hash(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function clone(value) {
  return structuredClone(value);
}
