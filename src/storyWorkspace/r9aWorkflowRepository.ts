import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const WORKFLOW_RELATIVE_PATH = "documents/workspace/r9a-workflow.json";
const RECOVERY_ROOT = ".story-studio/r9a-recovery";
const BACKUPS_RELATIVE_PATH = `${RECOVERY_ROOT}/backups`;
const MAX_SNAPSHOT_BYTES = 96 * 1024 * 1024;
const SNAPSHOT_ROOTS = ["project.md", "documents", "assets"] as const;

export type R9AWorkflowTask = {
  id: string;
  title: string;
  lane: "library" | "relationship" | "event" | "nuwa" | "creation" | "recovery" | "multiverse";
  state: "queued" | "active" | "blocked" | "done";
  sourceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type R9AWorkflowState = {
  version: "story-studio-r9a-workflow/v1";
  tasks: R9AWorkflowTask[];
  updatedAt: string;
  contentHash: string;
};

export type R9AProjectBackup = {
  id: string;
  title: string;
  kind: "backup" | "pre-restore-checkpoint";
  createdAt: string;
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
};

type SnapshotManifest = R9AProjectBackup & { version: "story-studio-r9a-project-backup/v1"; files: Array<{ relativePath: string; bytes: number; hash: string }> };

export function readR9AWorkflowState(projectPath: string): R9AWorkflowState {
  const filePath = safeProjectPath(projectPath, WORKFLOW_RELATIVE_PATH, true);
  if (!existsSync(filePath)) return withHash({ version: "story-studio-r9a-workflow/v1", tasks: [], updatedAt: new Date(0).toISOString() });
  const source = readFileSync(filePath, "utf8");
  const raw = JSON.parse(source) as Record<string, unknown>;
  if (raw.version !== "story-studio-r9a-workflow/v1" || !Array.isArray(raw.tasks)) throw new Error("R9A workflow state is invalid.");
  const tasks = raw.tasks.map(normalizeTask).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  return withHash({ version: "story-studio-r9a-workflow/v1", tasks, updatedAt: timestamp(raw.updatedAt, "Workflow update time") });
}

export function createR9AWorkflowTask(projectPath: string, input: Omit<R9AWorkflowTask, "id" | "state" | "createdAt" | "updatedAt"> & { state?: R9AWorkflowTask["state"] }): R9AWorkflowState {
  const current = readR9AWorkflowState(projectPath);
  const now = new Date().toISOString();
  const title = text(input.title, "Workflow task title", 160);
  const base = `task.${slug(title)}`;
  let id = base;
  let suffix = 2;
  while (current.tasks.some((task) => task.id === id)) id = `${base}-${suffix++}`;
  const task = normalizeTask({ id, title, lane: input.lane, state: input.state || "queued", sourceRefs: input.sourceRefs, createdAt: now, updatedAt: now });
  return writeR9AWorkflowState(projectPath, { ...current, tasks: [...current.tasks, task], updatedAt: now });
}

export function updateR9AWorkflowTask(projectPath: string, input: { taskId: string; expectedHash: string; state: R9AWorkflowTask["state"] }): { conflict: boolean; state: R9AWorkflowState } {
  const current = readR9AWorkflowState(projectPath);
  if (text(input.expectedHash, "Workflow revision", 128) !== current.contentHash) return { conflict: true, state: current };
  const taskId = text(input.taskId, "Workflow task", 160);
  const task = current.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error("Workflow task does not exist.");
  const next = { ...task, state: state(input.state), updatedAt: new Date().toISOString() };
  return { conflict: false, state: writeR9AWorkflowState(projectPath, { ...current, tasks: current.tasks.map((candidate) => candidate.id === taskId ? next : candidate), updatedAt: next.updatedAt }) };
}

export function createR9AProjectBackup(projectPath: string, input: { title: string; kind?: R9AProjectBackup["kind"] }): R9AProjectBackup {
  const root = prepareProjectRoot(projectPath);
  const createdAt = new Date().toISOString();
  const kind = input.kind || "backup";
  const title = text(input.title, "Backup title", 160);
  const id = `${kind === "backup" ? "backup" : "checkpoint"}.${createdAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}.${stableHash(`${title}:${createdAt}`).slice(0, 8)}`;
  const backupRoot = safeProjectPath(root, `${BACKUPS_RELATIVE_PATH}/${id}`, true);
  if (existsSync(backupRoot)) throw new Error("Backup identity already exists.");
  mkdirSync(backupRoot, { recursive: true });
  const files = copySnapshotRoots(root, backupRoot);
  const manifest: SnapshotManifest = {
    version: "story-studio-r9a-project-backup/v1",
    id,
    title,
    kind,
    createdAt,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    fingerprint: stableHash(JSON.stringify(files)),
    files
  };
  writeJsonAtomic(path.join(backupRoot, "manifest.json"), manifest);
  return projectBackup(manifest);
}

export function listR9AProjectBackups(projectPath: string): R9AProjectBackup[] {
  const root = prepareProjectRoot(projectPath);
  const backupsRoot = safeProjectPath(root, BACKUPS_RELATIVE_PATH, true);
  if (!existsSync(backupsRoot)) return [];
  return readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .flatMap((entry) => {
      try { return [projectBackup(readSnapshotManifest(path.join(backupsRoot, entry.name)))]; } catch { return []; }
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Restores only files which existed in the selected snapshot. Newer files are
 * deliberately retained, making this a protected, non-deleting recovery.
 * A fresh checkpoint is created before any source file is overwritten. */
export function restoreR9AProjectBackup(projectPath: string, input: { backupId: string; confirmed: boolean }): { restored: boolean; checkpoint: R9AProjectBackup; backup: R9AProjectBackup } {
  if (input.confirmed !== true) throw new Error("Project recovery requires explicit author confirmation.");
  const root = prepareProjectRoot(projectPath);
  const backupId = text(input.backupId, "Backup", 160);
  const backupRoot = safeProjectPath(root, `${BACKUPS_RELATIVE_PATH}/${backupId}`);
  const manifest = readSnapshotManifest(backupRoot);
  const checkpoint = createR9AProjectBackup(root, { title: `Pre-restore checkpoint for ${manifest.title}`, kind: "pre-restore-checkpoint" });
  for (const file of manifest.files) {
    const source = safeSnapshotPath(backupRoot, file.relativePath);
    const target = safeProjectPath(root, file.relativePath, true);
    if (!existsSync(source) || lstatSync(source).isSymbolicLink()) throw new Error("Backup source is invalid.");
    if (stableHash(readFileSync(source)) !== file.hash) throw new Error("Backup integrity check failed.");
    mkdirSync(path.dirname(target), { recursive: true });
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error("Project recovery target is a symlink.");
    copyFileSync(source, target);
  }
  return { restored: true, checkpoint, backup: projectBackup(manifest) };
}

function writeR9AWorkflowState(projectPath: string, input: Omit<R9AWorkflowState, "contentHash">): R9AWorkflowState {
  const normalized = withHash({ version: "story-studio-r9a-workflow/v1", tasks: input.tasks.map(normalizeTask), updatedAt: timestamp(input.updatedAt, "Workflow update time") });
  writeJsonAtomic(safeProjectPath(projectPath, WORKFLOW_RELATIVE_PATH, true), { version: normalized.version, tasks: normalized.tasks, updatedAt: normalized.updatedAt });
  return readR9AWorkflowState(projectPath);
}

function copySnapshotRoots(projectRoot: string, backupRoot: string): SnapshotManifest["files"] {
  const files: SnapshotManifest["files"] = [];
  let totalBytes = 0;
  const copyFile = (relativePath: string) => {
    const source = safeProjectPath(projectRoot, relativePath);
    if (lstatSync(source).isSymbolicLink()) throw new Error("Project backup cannot follow symlinks.");
    const metadata = statSync(source);
    if (!metadata.isFile()) throw new Error("Project backup source is invalid.");
    totalBytes += metadata.size;
    if (totalBytes > MAX_SNAPSHOT_BYTES) throw new Error("Project backup exceeds the protected size limit.");
    const destination = safeSnapshotPath(backupRoot, relativePath, true);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    files.push({ relativePath, bytes: metadata.size, hash: stableHash(readFileSync(source)) });
  };
  const walk = (relativePath: string) => {
    const source = safeProjectPath(projectRoot, relativePath);
    if (lstatSync(source).isSymbolicLink()) throw new Error("Project backup cannot follow symlinks.");
    const metadata = statSync(source);
    if (metadata.isFile()) { copyFile(relativePath); return; }
    if (!metadata.isDirectory()) throw new Error("Project backup source is invalid.");
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Project backup cannot follow symlinks.");
      walk(`${relativePath}/${entry.name}`);
    }
  };
  for (const entry of SNAPSHOT_ROOTS) if (existsSync(safeProjectPath(projectRoot, entry, true))) walk(entry);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function readSnapshotManifest(backupRoot: string): SnapshotManifest {
  const source = readFileSync(safeSnapshotPath(backupRoot, "manifest.json"), "utf8");
  const value = JSON.parse(source) as Record<string, unknown>;
  if (value.version !== "story-studio-r9a-project-backup/v1" || !Array.isArray(value.files)) throw new Error("Project backup manifest is invalid.");
  const files = value.files.map((file) => ({ relativePath: relativePath(file?.relativePath), bytes: positiveInteger(file?.bytes, "Backup file bytes"), hash: text(file?.hash, "Backup file hash", 128) }));
  return { version: "story-studio-r9a-project-backup/v1", id: text(value.id, "Backup id", 160), title: text(value.title, "Backup title", 160), kind: value.kind === "pre-restore-checkpoint" ? "pre-restore-checkpoint" : "backup", createdAt: timestamp(value.createdAt, "Backup creation time"), fileCount: positiveInteger(value.fileCount, "Backup file count"), totalBytes: positiveInteger(value.totalBytes, "Backup byte count", true), fingerprint: text(value.fingerprint, "Backup fingerprint", 128), files };
}

function normalizeTask(value: unknown): R9AWorkflowTask {
  const record = value as Record<string, unknown>;
  return { id: text(record.id, "Workflow task id", 160), title: text(record.title, "Workflow task title", 160), lane: lane(record.lane), state: state(record.state), sourceRefs: stringList(record.sourceRefs, "Workflow task references", 24, 200), createdAt: timestamp(record.createdAt, "Workflow task creation time"), updatedAt: timestamp(record.updatedAt, "Workflow task update time") };
}

function withHash(value: Omit<R9AWorkflowState, "contentHash">): R9AWorkflowState { return { ...value, contentHash: stableHash(JSON.stringify(value)) }; }
function projectBackup(value: SnapshotManifest): R9AProjectBackup { const { version: _version, files: _files, ...backup } = value; return backup; }
function prepareProjectRoot(value: string): string { const root = path.resolve(value); if (!existsSync(root) || lstatSync(root).isSymbolicLink()) throw new Error("Project workspace is invalid."); return root; }
function safeProjectPath(root: string, target: string, allowMissing = false): string { return safePath(root, target, allowMissing); }
function safeSnapshotPath(root: string, target: string, allowMissing = false): string { return safePath(root, target, allowMissing); }
function safePath(root: string, target: string, allowMissing: boolean): string { const normalized = relativePath(target); const candidate = path.resolve(root, normalized); if (path.relative(root, candidate).startsWith("..") || path.isAbsolute(path.relative(root, candidate))) throw new Error("Path escapes its protected root."); if (!allowMissing && !existsSync(candidate)) throw new Error("Protected path is missing."); return candidate; }
function writeJsonAtomic(filePath: string, value: unknown): void { mkdirSync(path.dirname(filePath), { recursive: true }); const temporary = `${filePath}.tmp`; writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); renameSync(temporary, filePath); }
function stableHash(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function text(value: unknown, label: string, maximum: number): string { const next = String(value ?? "").trim(); if (!next || next.length > maximum || /[\u0000-\u001F]/u.test(next)) throw new Error(`${label} is invalid.`); return next; }
function relativePath(value: unknown): string { const next = text(value, "Protected relative path", 512).replaceAll("\\", "/"); if (next.startsWith("/") || next.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Protected relative path is invalid."); return next; }
function timestamp(value: unknown, label: string): string { const next = text(value, label, 64); if (Number.isNaN(Date.parse(next))) throw new Error(`${label} is invalid.`); return next; }
function positiveInteger(value: unknown, label: string, allowZero = false): number { const next = Number(value); if (!Number.isSafeInteger(next) || next < (allowZero ? 0 : 1)) throw new Error(`${label} is invalid.`); return next; }
function stringList(value: unknown, label: string, maximum: number, itemMaximum: number): string[] { if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid.`); return [...new Set(value.map((item) => text(item, label, itemMaximum)))]; }
function lane(value: unknown): R9AWorkflowTask["lane"] { if (["library", "relationship", "event", "nuwa", "creation", "recovery", "multiverse"].includes(String(value))) return value as R9AWorkflowTask["lane"]; throw new Error("Workflow lane is invalid."); }
function state(value: unknown): R9AWorkflowTask["state"] { if (["queued", "active", "blocked", "done"].includes(String(value))) return value as R9AWorkflowTask["state"]; throw new Error("Workflow task state is invalid."); }
function slug(value: string): string { return value.toLocaleLowerCase("zh-CN").replace(/\s+/gu, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/gu, "-").slice(0, 96) || "untitled"; }
