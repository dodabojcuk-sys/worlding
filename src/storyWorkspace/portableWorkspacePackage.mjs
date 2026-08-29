import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { TIANYAN_EXPORT_EXCLUDED_PREFIXES, isWorkspaceExportPath } from "./workspaceLayoutV1.ts";

export const TIANYAN_PACKAGE_VERSION = "tianyan-package/v1";
const MAX_FILES = 20_000;
const MAX_BYTES = 512 * 1024 * 1024;

export function createPortableWorkspacePackage(projectRoot, { projectId, workVersionIds = [] }) {
  const root = path.resolve(projectRoot); const files = [];
  for (const relativePath of list(root)) {
    if (!isWorkspaceExportPath(relativePath)) continue;
    const absolute = path.join(root, relativePath);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Export rejects symlink: ${relativePath}`);
    if (!stat.isFile()) continue;
    const bytes = readFileSync(absolute);
    files.push({ path: relativePath, size: bytes.length, sha256: digest(bytes), data: bytes.toString("base64") });
    if (files.length > MAX_FILES || files.reduce((total, file) => total + file.size, 0) > MAX_BYTES) throw new Error("Workspace export exceeds safety limit.");
  }
  return { manifest: { version: TIANYAN_PACKAGE_VERSION, projectId, workVersionIds, exportedAt: new Date().toISOString(), applicationFormat: "story-workspace/v1", excludedPrefixes: [...TIANYAN_EXPORT_EXCLUDED_PREFIXES], files: files.map(({ data, ...entry }) => entry) }, files };
}

export function validatePortableWorkspacePackage(value) {
  if (!value || typeof value !== "object" || !value.manifest || !Array.isArray(value.files)) throw new Error("Invalid Tianyan package.");
  const { manifest, files } = value;
  if (manifest.version !== TIANYAN_PACKAGE_VERSION || !/^[A-Za-z0-9._-]+$/u.test(manifest.projectId || "")) throw new Error("Package manifest is invalid.");
  const seen = new Set(); const manifestEntries = new Map(); let total = 0;
  if (!Array.isArray(manifest.files) || manifest.files.length !== files.length || files.length > MAX_FILES) throw new Error("Package file list is invalid.");
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== "string" || !isSafeRelative(entry.path) || manifestEntries.has(entry.path)) throw new Error("Package manifest contains an invalid or duplicate path.");
    manifestEntries.set(entry.path, entry);
  }
  for (const file of files) {
    if (!file || typeof file.path !== "string" || !isSafeRelative(file.path) || seen.has(file.path) || !isWorkspaceExportPath(file.path)) throw new Error("Package contains forbidden or duplicate path.");
    seen.add(file.path);
    if (typeof file.data !== "string" || !isCanonicalBase64(file.data)) throw new Error(`Package payload is not base64: ${file.path}`);
    const bytes = Buffer.from(file.data, "base64"); total += bytes.length;
    const entry = manifestEntries.get(file.path);
    if (!entry || entry.size !== bytes.length || entry.sha256 !== digest(bytes)) throw new Error(`Package hash mismatch: ${file.path}`);
  }
  if (total > MAX_BYTES || !seen.has("project.md")) throw new Error("Package exceeds safety limit or misses project.md.");
  return { projectId: manifest.projectId, fileCount: files.length, totalBytes: total };
}

function list(root, relative = "") { const current = path.join(root, relative); return readdirSync(current, { withFileTypes: true }).flatMap((entry) => { const child = relative ? `${relative}/${entry.name}` : entry.name; if (entry.isSymbolicLink()) throw new Error(`Export rejects symlink: ${child}`); return entry.isDirectory() ? list(root, child) : [child]; }); }
function isSafeRelative(value) {
  const root = value.split("/")[0];
  const allowedRoots = new Set(["project.md", "world", "chapters", "scenes", "story-units", "planning", "reviews", "artifacts", "assets", "documents", "manuscripts", ".world-os"]);
  return value.length > 0 && !path.isAbsolute(value) && !value.split("/").includes("..") && !value.includes("\\") && allowedRoots.has(root);
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function isCanonicalBase64(value) { return Buffer.from(value, "base64").toString("base64") === value; }
