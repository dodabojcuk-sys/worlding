import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

export type AtomicFileBoundary = "temporary-durable" | "final-published";

type AtomicFileInput = {
  rootPath: string;
  targetPath: string;
  content: string | NodeJS.ArrayBufferView;
  onBoundary?: (boundary: AtomicFileBoundary) => void;
  /** Internal durability observation seam; product callers omit it. */
  onDirectoryFsync?: (
    boundary: "directory-fsync-entered" | "directory-fsync-completed",
    directory: string
  ) => void;
};

/**
 * Publishes complete bytes without replacing an existing final path.
 *
 * The staging name is in the target directory, does not end in `.md`, and is
 * linked into place only after its bytes are fsynced. `EEXIST` is returned to
 * the caller for read-and-verify handling.
 */
export function publishFileNoReplace(input: AtomicFileInput): "created" | "exists" {
  const { root, target, directory } = prepareTarget(input.rootPath, input.targetPath);
  const temporary = stagePath(directory, path.basename(target));
  let temporaryExists = false;
  try {
    const descriptor = openSync(temporary, "wx", 0o600);
    temporaryExists = true;
    try {
      writeFileSync(descriptor, input.content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    input.onBoundary?.("temporary-durable");
    assertPathComponents(root, target, true);
    try {
      linkSync(temporary, target);
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        // A contender may observe the final link before its creator has fsynced
        // the directory. Confirm the directory entry independently before the
        // contender reports a durable existing winner.
        fsyncDirectory(directory, input.onDirectoryFsync);
        return "exists";
      }
      throw error;
    }
    input.onBoundary?.("final-published");
    fsyncDirectory(directory, input.onDirectoryFsync);
    return "created";
  } finally {
    if (temporaryExists && existsSync(temporary)) unlinkSync(temporary);
  }
}

/**
 * Atomically replaces a mutable workflow record using a unique same-directory
 * staging file. This is not used for Canon Event publication.
 */
export function replaceFileAtomically(input: AtomicFileInput): void {
  const { root, target, directory } = prepareTarget(input.rootPath, input.targetPath);
  const temporary = stagePath(directory, path.basename(target));
  let temporaryExists = false;
  try {
    const descriptor = openSync(temporary, "wx", 0o600);
    temporaryExists = true;
    try {
      writeFileSync(descriptor, input.content);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    input.onBoundary?.("temporary-durable");
    assertPathComponents(root, target, true);
    renameSync(temporary, target);
    temporaryExists = false;
    input.onBoundary?.("final-published");
    fsyncDirectory(directory, input.onDirectoryFsync);
  } finally {
    if (temporaryExists && existsSync(temporary)) unlinkSync(temporary);
  }
}

export function readExistingUtf8(rootPath: string, targetPath: string): string | null {
  const { root, target } = prepareTarget(rootPath, targetPath);
  if (!existsSync(target)) return null;
  assertPathComponents(root, target, false);
  return readFileSync(target, "utf8");
}

function prepareTarget(rootPath: string, targetPath: string): { root: string; target: string; directory: string } {
  const configuredRoot = path.resolve(rootPath);
  if (
    !existsSync(configuredRoot) ||
    lstatSync(configuredRoot).isSymbolicLink() ||
    !lstatSync(configuredRoot).isDirectory()
  ) {
    throw new Error("Atomic publication root must be an existing non-symlink directory.");
  }
  const root = realpathSync(configuredRoot);
  const requestedTarget = path.resolve(targetPath);
  const configuredRelative = path.relative(configuredRoot, requestedTarget);
  const target = !configuredRelative.startsWith("..") && !path.isAbsolute(configuredRelative)
    ? path.resolve(root, configuredRelative)
    : requestedTarget;
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Atomic publication target is outside its owner root.");
  }
  const directory = path.dirname(target);
  ensureDirectoriesInsideRoot(root, directory);
  assertPathComponents(root, target, true);
  return { root, target, directory };
}

function ensureDirectoriesInsideRoot(root: string, directory: string): void {
  const relative = path.relative(root, directory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Atomic publication directory is outside its owner root.");
  }
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) {
      try {
        mkdirSync(cursor);
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      }
    }
    const entry = lstatSync(cursor);
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error("Atomic publication directory path is not a safe directory.");
    }
    const real = realpathSync(cursor);
    if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
      throw new Error("Atomic publication directory escapes its owner root.");
    }
  }
}

function assertPathComponents(root: string, target: string, allowMissingFinal: boolean): void {
  const relative = path.relative(root, target);
  let cursor = root;
  const segments = relative.split(path.sep);
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) {
      if (allowMissingFinal && index === segments.length - 1) return;
      throw new Error("Atomic publication path component is missing.");
    }
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error("Atomic publication does not permit symbolic links.");
    }
  }
}

function stagePath(directory: string, basename: string): string {
  return path.join(directory, `.${basename}.tianyan-stage-${process.pid}-${randomUUID()}`);
}

function fsyncDirectory(
  directory: string,
  onDirectoryFsync?: AtomicFileInput["onDirectoryFsync"]
): void {
  const descriptor = openSync(directory, "r");
  try {
    onDirectoryFsync?.("directory-fsync-entered", directory);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  onDirectoryFsync?.("directory-fsync-completed", directory);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
