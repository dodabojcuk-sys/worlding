import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink
} from "node:fs/promises";
import path from "node:path";

import { ContinuityError, type ContinuityOwnerKind, type ContinuityOwnerRef, type ContinuityScope } from "./continuityTypes.ts";
import { normalizeNfc, requireMachineId, requireProjectId, sha256 } from "./continuityValidation.ts";

const OWNER_DIRECTORY: Record<ContinuityOwnerKind, string> = {
  persona: "persona",
  "relationship-policy": "relationship-policy",
  memory: "memories",
  "global-memory-grant": "global-memory-grants",
  session: "sessions",
  "context-receipt": "receipts",
  "stopping-point": "stopping-points"
};

const OWNER_EXTENSION: Record<ContinuityOwnerKind, string> = {
  persona: ".md",
  "relationship-policy": ".json",
  memory: ".md",
  "global-memory-grant": ".grant.json",
  session: ".jsonl",
  "context-receipt": ".context-receipt.json",
  "stopping-point": ".md"
};

let temporarySequence = 0;

export type ContinuityContext = {
  rootPath: string;
  agentId: string;
  scope: ContinuityScope;
  projectId?: string;
};

export type ResolvedContinuityOwner = {
  configuredRoot: string;
  agentRoot: string;
  absolutePath: string;
  relativePath: string;
  historyRoot: string;
  tombstonePath: string;
  owner: ContinuityOwnerRef;
};

export async function resolveContinuityOwner(context: ContinuityContext, kind: ContinuityOwnerKind, rawOwnerId: string, options: { createDirectories?: boolean } = {}): Promise<ResolvedContinuityOwner> {
  const configuredRoot = await prepareConfiguredRoot(context.rootPath);
  const agentId = requireMachineId(context.agentId, "Agent identifier");
  const ownerId = requireMachineId(rawOwnerId, "Continuity owner identifier");
  const scope = context.scope;
  const projectId = scope === "project" ? requireProjectId(context.projectId) : null;
  assertOwnerScope(kind, scope);

  const base = scope === "author-global"
    ? path.join(configuredRoot, "_continuity")
    : path.join(await resolveProjectRoot(configuredRoot, projectId as string), "continuity");
  const agentRoot = path.join(base, "agents", agentId);
  const directory = OWNER_DIRECTORY[kind];
  const filename = ownerFilename(kind, ownerId, agentId);
  const absolutePath = kind === "persona" || kind === "relationship-policy"
    ? path.join(agentRoot, filename)
    : path.join(agentRoot, directory, filename);
  const historyRoot = kind === "persona" || kind === "relationship-policy"
    ? path.join(agentRoot, "history", directory)
    : path.join(agentRoot, "history", directory, ownerId);
  const tombstonePath = path.join(agentRoot, "tombstones", directory, `${ownerId}.json`);

  assertInside(configuredRoot, absolutePath);
  assertInside(configuredRoot, historyRoot);
  assertInside(configuredRoot, tombstonePath);
  await assertNoSymlinkSegments(configuredRoot, absolutePath, true);
  await assertNoSymlinkSegments(configuredRoot, historyRoot, true);
  await assertNoSymlinkSegments(configuredRoot, tombstonePath, true);
  if (options.createDirectories) {
    await ensureSecureDirectory(configuredRoot, path.dirname(absolutePath));
    await ensureSecureDirectory(configuredRoot, historyRoot);
    await ensureSecureDirectory(configuredRoot, path.dirname(tombstonePath));
  }
  return {
    configuredRoot,
    agentRoot,
    absolutePath,
    relativePath: toProductRelativePath(configuredRoot, absolutePath),
    historyRoot,
    tombstonePath,
    owner: { kind, id: ownerId, agentId, scope, projectId }
  };
}

export async function prepareAuthorGlobalRoot(rootPath: string): Promise<string> {
  const root = await prepareConfiguredRoot(rootPath);
  const continuityRoot = path.join(root, "_continuity");
  await assertNoSymlinkSegments(root, continuityRoot, true);
  await ensureSecureDirectory(root, continuityRoot);
  return continuityRoot;
}

export async function prepareProjectContinuityRoot(rootPath: string, projectId: string): Promise<string> {
  const root = await prepareConfiguredRoot(rootPath);
  const projectRoot = await resolveProjectRoot(root, requireProjectId(projectId));
  const continuityRoot = path.join(projectRoot, "continuity");
  await assertNoSymlinkSegments(root, continuityRoot, true);
  await ensureSecureDirectory(root, continuityRoot);
  return continuityRoot;
}

export async function prepareContinuityIndexRoot(rootPath: string): Promise<{ configuredRoot: string; indexRoot: string }> {
  const configuredRoot = await prepareConfiguredRoot(rootPath);
  const indexRoot = path.join(configuredRoot, ".world-os", "continuity-indexes");
  await assertNoSymlinkSegments(configuredRoot, indexRoot, true);
  await ensureSecureDirectory(configuredRoot, indexRoot);
  return { configuredRoot, indexRoot };
}

export async function readSecureUtf8(location: ResolvedContinuityOwner, maximumBytes: number): Promise<string | null> {
  if (!(await exists(location.absolutePath))) return null;
  await assertRegularSecureFile(location.configuredRoot, location.absolutePath);
  const details = await stat(location.absolutePath);
  if (details.size > maximumBytes) throw new ContinuityError("continuity-owner-too-large", "Continuity owner exceeds its size limit.");
  return readFile(location.absolutePath, "utf8");
}

export async function readSecurePathUtf8(root: string, target: string, maximumBytes: number): Promise<string | null> {
  assertInside(root, target);
  if (!(await exists(target))) return null;
  await assertRegularSecureFile(root, target);
  const details = await stat(target);
  if (details.size > maximumBytes) throw new ContinuityError("continuity-owner-too-large", "Continuity file exceeds its size limit.");
  return readFile(target, "utf8");
}

export async function securePathExists(root: string, target: string): Promise<boolean> {
  assertInside(root, target);
  if (!(await exists(target))) return false;
  await assertNoSymlinkSegments(root, target, false);
  return true;
}

export async function removeSecureTree(root: string, target: string): Promise<void> {
  assertInside(root, target);
  if (!(await exists(target))) return;
  await assertNoSymlinkSegments(root, target, false);
  await rm(target, { recursive: true, force: true });
}

export async function writeSecureUtf8(location: ResolvedContinuityOwner, source: string): Promise<void> {
  await ensureSecureDirectory(location.configuredRoot, path.dirname(location.absolutePath));
  await atomicWriteSecure(location.configuredRoot, location.absolutePath, source);
}

export async function removeSecureFile(location: ResolvedContinuityOwner): Promise<boolean> {
  if (!(await exists(location.absolutePath))) return false;
  await assertRegularSecureFile(location.configuredRoot, location.absolutePath);
  await unlink(location.absolutePath);
  return true;
}

export async function listOwnerIds(context: ContinuityContext, kind: ContinuityOwnerKind): Promise<string[]> {
  const sampleId = kind === "persona" || kind === "relationship-policy" ? context.agentId : ownerPrefix(kind, 1);
  const sample = await resolveContinuityOwner(context, kind, sampleId);
  if (kind === "persona" || kind === "relationship-policy") return (await exists(sample.absolutePath)) ? [sample.owner.id] : [];
  const directory = path.dirname(sample.absolutePath);
  if (!(await exists(directory))) return [];
  await assertSecureDirectory(sample.configuredRoot, directory);
  const extension = OWNER_EXTENSION[kind];
  const entries = await readdir(directory, { withFileTypes: true });
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new ContinuityError("continuity-symlink", "Continuity directories cannot contain symlinks.");
    if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
    const id = entry.name.slice(0, -extension.length);
    ids.push(requireMachineId(id, "Continuity filename identifier"));
  }
  return ids.sort((left, right) => left.localeCompare(right));
}

export async function listOwnerTombstoneIds(context: ContinuityContext, kind: ContinuityOwnerKind): Promise<string[]> {
  const sampleId = kind === "persona" || kind === "relationship-policy" ? context.agentId : ownerPrefix(kind, 1);
  const sample = await resolveContinuityOwner(context, kind, sampleId);
  return listIdsFromJsonDirectory(sample.configuredRoot, path.dirname(sample.tombstonePath));
}

export async function allocateMonotonicOwnerId(context: ContinuityContext, kind: Exclude<ContinuityOwnerKind, "persona" | "relationship-policy">): Promise<string> {
  const configuredRoot = await prepareConfiguredRoot(context.rootPath);
  const agentId = requireMachineId(context.agentId, "Agent identifier");
  const projectId = context.scope === "project" ? requireProjectId(context.projectId) : "author-global";
  const lockKey = `id:${context.scope}:${projectId}:${agentId}:${kind}`;
  return withContinuityLock(configuredRoot, lockKey, async () => {
    const prefix = ownerPrefixName(kind);
    const active = await listOwnerIds(context, kind);
    const sample = await resolveContinuityOwner(context, kind, ownerPrefix(kind, 1), { createDirectories: true });
    const tombstoneDirectory = path.dirname(sample.tombstonePath);
    const tombstones = await listIdsFromJsonDirectory(sample.configuredRoot, tombstoneDirectory);
    const reservationRoot = path.join(configuredRoot, ".world-os", "continuity-id-reservations", sha256(lockKey));
    await ensureSecureDirectory(configuredRoot, reservationRoot);
    const reservations = (await readdir(reservationRoot, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name);
    let maximum = 0;
    for (const id of [...active, ...tombstones, ...reservations]) {
      const match = id.match(new RegExp(`^${escapeRegExp(prefix)}\\.(\\d{6})$`, "u"));
      if (match) maximum = Math.max(maximum, Number(match[1]));
    }
    const id = ownerPrefix(kind, maximum + 1);
    const reservation = path.join(reservationRoot, id);
    await atomicWriteSecure(configuredRoot, reservation, "reserved\n", { replace: false });
    return id;
  });
}

export async function withOwnerLock<T>(location: ResolvedContinuityOwner, task: () => Promise<T>): Promise<T> {
  return withContinuityLock(location.configuredRoot, `owner:${location.relativePath}`, task);
}

export async function withContinuityLock<T>(configuredRoot: string, key: string, task: () => Promise<T>): Promise<T> {
  const lockParent = path.join(configuredRoot, ".world-os", "continuity-locks");
  await ensureSecureDirectory(configuredRoot, lockParent);
  const lockPath = path.join(lockParent, `${createHash("sha256").update(key).digest("hex")}.lock`);
  let acquired = false;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
  }
  if (!acquired) throw new ContinuityError("continuity-lock-timeout", "Continuity owner is busy.");
  try {
    return await task();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function ensureSecureDirectory(root: string, target: string): Promise<void> {
  assertInside(root, target);
  const relative = path.relative(root, target);
  if (!relative) return;
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (await exists(cursor)) {
      const details = await lstat(cursor);
      if (details.isSymbolicLink()) throw new ContinuityError("continuity-symlink", "Continuity path cannot cross a symlink.");
      if (!details.isDirectory()) throw new ContinuityError("continuity-path-type", "Continuity directory path is invalid.");
    } else {
      try {
        await mkdir(cursor, { mode: 0o700 });
        await chmod(cursor, 0o700);
      } catch (error) {
        if (!isNodeError(error, "EEXIST")) throw error;
        const raced = await lstat(cursor);
        if (raced.isSymbolicLink() || !raced.isDirectory()) throw new ContinuityError("continuity-path-type", "Continuity directory path is invalid.");
      }
    }
  }
}

export async function assertNoSymlinkSegments(root: string, target: string, allowMissing: boolean): Promise<void> {
  assertInside(root, target);
  const relative = path.relative(root, target);
  if (!relative) return;
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (!(await exists(cursor))) {
      if (allowMissing) return;
      throw new ContinuityError("continuity-path-missing", "Continuity path is missing.");
    }
    if ((await lstat(cursor)).isSymbolicLink()) throw new ContinuityError("continuity-symlink", "Continuity path cannot cross a symlink.");
  }
  const nearest = await nearestExistingParent(target);
  const real = await realpath(nearest);
  assertInside(root, real);
}

export async function atomicWriteSecure(root: string, target: string, source: string | Buffer, options: { replace?: boolean } = {}): Promise<void> {
  assertInside(root, target);
  await assertNoSymlinkSegments(root, target, true);
  await ensureSecureDirectory(root, path.dirname(target));
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.continuity-tmp-${process.pid}-${String(++temporarySequence).padStart(6, "0")}`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(source);
    await handle.sync();
    await handle.close();
    handle = null;
    if (options.replace === false && await exists(target)) throw new ContinuityError("continuity-conflict", "Continuity owner already exists.");
    await assertNoSymlinkSegments(root, target, true);
    await rename(temporary, target);
    await chmod(target, 0o600);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function purgeTemporaryFiles(root: string, directory: string, ownerFilenameFragment: string): Promise<number> {
  if (!(await exists(directory))) return 0;
  await assertSecureDirectory(root, directory);
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new ContinuityError("continuity-symlink", "Continuity directories cannot contain symlinks.");
    if (entry.isFile() && entry.name.includes(ownerFilenameFragment) && entry.name.includes("continuity-tmp")) {
      await unlink(path.join(directory, entry.name));
      removed += 1;
    }
  }
  return removed;
}

export function ownerPrefix(kind: Exclude<ContinuityOwnerKind, "persona" | "relationship-policy">, sequence: number): string {
  return `${ownerPrefixName(kind)}.${String(sequence).padStart(6, "0")}`;
}

function ownerPrefixName(kind: Exclude<ContinuityOwnerKind, "persona" | "relationship-policy">): string {
  return ({
    memory: "memory",
    "global-memory-grant": "grant",
    session: "session",
    "context-receipt": "receipt",
    "stopping-point": "stopping-point"
  })[kind];
}

function ownerFilename(kind: ContinuityOwnerKind, ownerId: string, agentId: string): string {
  if (kind === "persona") {
    if (ownerId !== agentId) throw new Error("Persona owner must equal the Agent identifier.");
    return "persona.md";
  }
  if (kind === "relationship-policy") {
    if (ownerId !== agentId) throw new Error("Relationship Policy owner must equal the Agent identifier.");
    return "relationship-policy.json";
  }
  return `${ownerId}${OWNER_EXTENSION[kind]}`;
}

async function prepareConfiguredRoot(rawRootPath: string): Promise<string> {
  if (typeof rawRootPath !== "string" || !rawRootPath.trim() || /[\u0000-\u001F]/u.test(rawRootPath)) throw new Error("Story Studio root is invalid.");
  const absolute = path.resolve(normalizeNfc(rawRootPath));
  if (!(await exists(absolute))) throw new Error("Story Studio root does not exist.");
  const details = await lstat(absolute);
  if (details.isSymbolicLink()) throw new ContinuityError("continuity-root-symlink", "Story Studio root cannot be a symlink.");
  if (!details.isDirectory()) throw new Error("Story Studio root is invalid.");
  return realpath(absolute);
}

async function resolveProjectRoot(root: string, projectId: string): Promise<string> {
  const candidate = path.join(root, projectId);
  if (path.dirname(candidate) !== root || !(await exists(candidate))) throw new Error("Story project does not exist.");
  const details = await lstat(candidate);
  if (details.isSymbolicLink()) throw new ContinuityError("continuity-project-symlink", "Story project cannot be a symlink.");
  if (!details.isDirectory()) throw new Error("Story project is invalid.");
  const resolved = await realpath(candidate);
  if (path.dirname(resolved) !== root) throw new ContinuityError("continuity-path-escape", "Story project escapes the configured root.");
  const projectFile = path.join(resolved, "project.md");
  if (!(await exists(projectFile)) || (await lstat(projectFile)).isSymbolicLink() || !(await stat(projectFile)).isFile()) throw new Error("Story project is invalid.");
  return resolved;
}

function assertOwnerScope(kind: ContinuityOwnerKind, scope: ContinuityScope): void {
  if ((kind === "persona" || kind === "relationship-policy") && scope !== "author-global") throw new Error("Owner is author-global only.");
  if ((kind === "global-memory-grant" || kind === "session" || kind === "context-receipt" || kind === "stopping-point") && scope !== "project") throw new Error("Owner is project-local only.");
}

function assertInside(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new ContinuityError("continuity-path-escape", "Continuity path escapes the configured root.");
}

async function assertRegularSecureFile(root: string, target: string): Promise<void> {
  await assertNoSymlinkSegments(root, target, false);
  const details = await lstat(target);
  if (details.isSymbolicLink() || !details.isFile()) throw new ContinuityError("continuity-path-type", "Continuity owner file is invalid.");
}

async function assertSecureDirectory(root: string, target: string): Promise<void> {
  await assertNoSymlinkSegments(root, target, false);
  const details = await lstat(target);
  if (details.isSymbolicLink() || !details.isDirectory()) throw new ContinuityError("continuity-path-type", "Continuity directory is invalid.");
}

async function listIdsFromJsonDirectory(root: string, directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];
  await assertSecureDirectory(root, directory);
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new ContinuityError("continuity-symlink", "Continuity directories cannot contain symlinks.");
    if (entry.isFile() && entry.name.endsWith(".json")) result.push(requireMachineId(entry.name.slice(0, -5), "Tombstone identifier"));
  }
  return result;
}

async function nearestExistingParent(target: string): Promise<string> {
  let cursor = target;
  while (!(await exists(cursor))) cursor = path.dirname(cursor);
  return cursor;
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

function toProductRelativePath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
