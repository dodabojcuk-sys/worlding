import assert from "node:assert/strict";
import test from "node:test";
import { TIANYAN_EXPORT_EXCLUDED_PREFIXES, TIANYAN_WORKSPACE_LAYOUT_V1, isWorkspaceExportPath } from "../../src/storyWorkspace/workspaceLayoutV1.ts";
import { validatePortableWorkspacePackage } from "../../src/storyWorkspace/portableWorkspacePackage.mjs";
import { createWorkspacePackagePort } from "../../src/storyWorkspace/workspacePackagePort.mjs";
import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

test("Workspace Layout V1 separates durable project data from transient files", () => {
  assert.equal(TIANYAN_WORKSPACE_LAYOUT_V1.version, "tianyan-workspace-layout/v1");
  assert.ok(TIANYAN_WORKSPACE_LAYOUT_V1.authorVisible.includes("project.md"));
  assert.equal(isWorkspaceExportPath(".world-os/cache/search.json"), false);
  assert.equal(isWorkspaceExportPath(".world-os/locks/import.lock"), false);
  assert.equal(isWorkspaceExportPath("world/characters/林昭.md"), true);
  assert.equal(isWorkspaceExportPath("credentials/private.txt"), false);
  assert.equal(isWorkspaceExportPath("unknown-root/file.txt"), false);
  assert.ok(TIANYAN_EXPORT_EXCLUDED_PREFIXES.includes(".story-studio/"));
});

test("package port round-trips durable files without copying cache or accepting conflicts", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-package-"));
  const library = path.join(root, "library"); const backup = path.join(root, "backup");
  mkdirSync(library); mkdirSync(backup);
  const project = path.join(library, "package-project");
  createStoryWorkspace({ rootPath: project, title: "中文项目" });
  writeFileSync(path.join(project, "assets", "images", "封面.bin"), Buffer.from([0, 1, 2, 3]));
  writeFileSync(path.join(project, ".world-os", "cache", "ignore.json"), "cache");
  const port = createWorkspacePackagePort({ libraryRoot: library, backupRoot: backup, resolveProjectPath: ({ projectId }) => path.join(library, projectId) });
  const receipt = port.exportProject({ projectId: "package-project", workVersionIds: ["v1"] });
  const payload = JSON.parse(readFileSync(receipt.packagePath, "utf8"));
  assert.equal(payload.files.some((file: { path: string }) => file.path.includes("cache/")), false);
  rmSync(project, { recursive: true, force: true });
  assert.equal(port.importProject({ packageText: JSON.stringify(payload) }).projectId, "package-project");
  assert.deepEqual(readFileSync(path.join(project, "assets", "images", "封面.bin")), Buffer.from([0, 1, 2, 3]));
  assert.throws(() => port.importProject({ packageText: JSON.stringify(payload) }), /already exists/);
  const linked = path.join(library, "link"); symlinkSync(backup, linked, "dir");
  assert.throws(() => createWorkspacePackagePort({ libraryRoot: linked, backupRoot: backup, resolveProjectPath: () => project }), /real directory/);
  rmSync(root, { recursive: true, force: true });
});

test("portable package rejects traversal, duplicate paths and corrupted hashes", () => {
  const valid = { manifest: { version: "tianyan-package/v1", projectId: "project-a", files: [{ path: "project.md", size: 1, sha256: "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881" }] }, files: [{ path: "project.md", data: "eA==" }] };
  assert.equal(validatePortableWorkspacePackage(valid).projectId, "project-a");
  assert.throws(() => validatePortableWorkspacePackage({ ...valid, files: [...valid.files, { path: "../project.md", data: "eA==" }], manifest: { ...valid.manifest, files: [...valid.manifest.files, valid.manifest.files[0]] } }));
});
