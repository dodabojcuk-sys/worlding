import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import { createWorkspaceFolder, readWorkspaceLayout, updateWorkspaceLayout } from "../../src/storyWorkspace/workspaceLayoutRepository.mjs";

function createFixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-workspace-layout-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  return rootPath;
}

test("workspace layout stores author-owned folders without copying document prose", () => {
  const rootPath = createFixture();
  const first = createWorkspaceFolder(rootPath, { title: "主要角色" });
  const second = createWorkspaceFolder(rootPath, { title: "主要角色", parentId: first.folder.id });
  const layout = readWorkspaceLayout(rootPath);

  assert.equal(layout.version, "story-workspace-layout/v1");
  assert.equal(layout.folders.length, 2);
  assert.equal(second.folder.parentId, first.folder.id);
  assert.notEqual(second.folder.id, first.folder.id);
  const source = readFileSync(path.join(rootPath, "documents/workspace/library.workspace.json"), "utf8");
  assert.doesNotMatch(source, /林远|正文|body/);
  assert.equal(existsSync(path.join(rootPath, ".world-os", "workspace-layout.json")), false);
});

test("workspace layout rejects stale updates and symlink destinations", () => {
  const rootPath = createFixture();
  const created = createWorkspaceFolder(rootPath, { title: "地点" });
  const stale = updateWorkspaceLayout(rootPath, {
    expectedContentHash: "stale",
    layout: created.layout
  });
  assert.equal(stale.conflict, true);

  const otherRoot = mkdtempSync(path.join(os.tmpdir(), "story-workspace-outside-"));
  const linkedRoot = createFixture();
  const documentsPath = path.join(linkedRoot, "documents");
  symlinkSync(otherRoot, path.join(documentsPath, "workspace"), "dir");
  assert.throws(() => createWorkspaceFolder(linkedRoot, { title: "逃逸" }), /symlink/i);
});

test("custom material categories reuse the workspace layout owner and persist rename/order", () => {
  const rootPath = createFixture();
  const first = createWorkspaceFolder(rootPath, { title: "阵营", kind: "custom-category" });
  const second = createWorkspaceFolder(rootPath, { title: "秘仪", kind: "custom-category" });
  const current = readWorkspaceLayout(rootPath);
  const updated = updateWorkspaceLayout(rootPath, {
    expectedContentHash: current.contentHash,
    layout: {
      ...current,
      folders: current.folders.map((folder) => folder.id === first.folder.id
        ? { ...folder, title: "势力", order: 1 }
        : folder.id === second.folder.id
          ? { ...folder, order: 0 }
          : folder)
    }
  });

  assert.equal(updated.conflict, false);
  assert.deepEqual(updated.layout.folders.map((folder) => [folder.title, folder.kind, folder.order]), [
    ["秘仪", "custom-category", 0],
    ["势力", "custom-category", 1]
  ]);
  assert.equal(readWorkspaceLayout(rootPath).folders[0]?.kind, "custom-category");
});
