import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createPortableWorkspacePackage, validatePortableWorkspacePackage } from "./portableWorkspacePackage.mjs";
import { ensureWorkspaceDirectories, validateStoryWorkspace } from "./storyWorkspaceRepository.mjs";

/**
 * The only filesystem port for portable .tianyan packages.  Callers provide
 * resolved roots from the existing workspace owner; raw browser paths are not
 * accepted here or by its HTTP adapter.
 */
export function createWorkspacePackagePort({ libraryRoot, resolveProjectPath, backupRoot = null }) {
  const library = realDirectory(libraryRoot, "library root");
  const backup = backupRoot ? realDirectory(backupRoot, "backup root") : null;
  if (backup && isSameOrInside(backup, library)) throw new Error("Backup root must be outside the library root.");

  return {
    exportProject({ projectId, workVersionIds = [] }) {
      if (!backup) throw blockedBackupRoot();
      const projectPath = realProject(resolveProjectPath({ projectId }), library);
      const payload = createPortableWorkspacePackage(projectPath, { projectId, workVersionIds });
      const packageName = `${projectId}-${new Date().toISOString().replaceAll(":", "-")}.tianyan`;
      const destination = path.join(backup, packageName);
      writeAndVerifyAtomically(destination, Buffer.from(JSON.stringify(payload), "utf8"));
      return { packageName, packagePath: destination, fileCount: payload.files.length, exportedAt: payload.manifest.exportedAt };
    },
    importProject({ packageText }) {
      if (typeof packageText !== "string" || Buffer.byteLength(packageText, "utf8") > 768 * 1024 * 1024) throw new Error("Package input exceeds the import limit.");
      let payload;
      try { payload = JSON.parse(packageText); } catch { throw new Error("Package is not valid JSON."); }
      const verified = validatePortableWorkspacePackage(payload);
      const destination = path.join(library, verified.projectId);
      if (existsSync(destination)) throw conflict(verified.projectId);
      const stagingRoot = path.join(library, ".tianyan-staging");
      mkdirSync(stagingRoot, { recursive: true });
      if (lstatSync(stagingRoot).isSymbolicLink()) throw new Error("Import staging cannot be a symlink.");
      const staging = path.join(stagingRoot, `${verified.projectId}-${randomUUID()}`);
      mkdirSync(staging, { recursive: false });
      try {
        for (const file of payload.files) writeStagedFile(staging, file.path, Buffer.from(file.data, "base64"));
        ensureWorkspaceDirectories(staging);
        const validation = validateStoryWorkspace(staging);
        if (!validation.valid) throw new Error(`Imported workspace validation failed: ${validation.errors.join("; ")}`);
        // Destination was checked before staging and is checked again immediately before rename.
        if (existsSync(destination)) throw conflict(verified.projectId);
        renameSync(staging, destination);
        return { projectId: verified.projectId, fileCount: verified.fileCount, importedAt: new Date().toISOString() };
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw error;
      }
    }
  };
}

function realDirectory(value, label) {
  const resolved = path.resolve(value);
  if (!existsSync(resolved) || !lstatSync(resolved).isDirectory() || lstatSync(resolved).isSymbolicLink()) throw new Error(`Configured ${label} is not a real directory.`);
  return resolved;
}
function realProject(value, library) {
  const project = realDirectory(value, "project root");
  if (path.dirname(project) !== library) throw new Error("Project root escapes the configured library.");
  return project;
}
function writeStagedFile(root, relativePath, bytes) {
  const target = path.resolve(root, relativePath);
  if (!isInside(target, root)) throw new Error("Package path escapes staging.");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: "wx" });
}
function writeAndVerifyAtomically(destination, contents) {
  if (existsSync(destination)) throw new Error("Export filename already exists.");
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { flag: "wx" });
    validatePortableWorkspacePackage(JSON.parse(readFileSync(temporary, "utf8")));
    if (existsSync(destination)) throw new Error("Export filename already exists.");
    renameSync(temporary, destination);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
function isInside(candidate, root) { const relative = path.relative(root, candidate); return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); }
function isSameOrInside(candidate, root) { return path.resolve(candidate) === path.resolve(root) || isInside(candidate, root); }
function blockedBackupRoot() { const error = new Error("A separately configured backup directory is required before export."); error.code = "BACKUP_ROOT_NOT_CONFIGURED"; return error; }
function conflict(projectId) { const error = new Error(`Project id already exists: ${projectId}`); error.code = "PROJECT_ID_CONFLICT"; return error; }
