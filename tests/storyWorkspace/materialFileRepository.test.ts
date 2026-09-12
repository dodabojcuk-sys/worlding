import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  createMaterialFolder,
  importMaterialFiles,
  listMaterialFiles,
  moveMaterialFiles,
  readMaterialFile,
  readMaterialOperationReceipt,
  resolveMaterialFileBytes,
  setMaterialFilesArchived,
  updateMaterialFileMetadata,
  updateMaterialFolder
} from "../../src/storyWorkspace/materialFileRepository.mjs";

const NOW = "2026-09-12T08:00:00.000Z";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-material-files-"));
  createStoryWorkspace({ rootPath: root, title: "隔离资料", genre: "test", ambience: "safe" });
  return root;
}
function encoded(value: string) { return Buffer.from(value, "utf8").toString("base64"); }

test("material files keep stable identity through rename, move, archive and historical revision reads", () => {
  const root = fixture();
  try {
    const folder = createMaterialFolder(root, { title: "北湾", expectedRevision: 0, now: NOW });
    const imported = importMaterialFiles(root, { operationId: "import.one", folderId: folder.folder.id, now: NOW, files: [{ name: "雾港.md", mimeType: "text/markdown", base64: encoded("宵禁从午夜开始。") }] });
    assert.equal(imported.state, "completed");
    const fileId = imported.results[0].fileId;
    const firstRevision = imported.results[0].revisionId;
    assert.ok(fileId && firstRevision);

    const renamed = updateMaterialFileMetadata(root, { operationId: "rename.one", expectedRevision: 2, fileId, displayName: "雾港夜令", tags: ["宵禁"], now: "2026-09-12T08:01:00.000Z" });
    assert.equal(renamed.state, "completed");
    assert.equal(readMaterialFile(root, fileId)?.displayName, "雾港夜令");

    const versioned = importMaterialFiles(root, { operationId: "replace.one", now: "2026-09-12T08:02:00.000Z", files: [{ name: "雾港.md", mimeType: "text/markdown", base64: encoded("宵禁改为子夜后一刻。"), replaceFileId: fileId }] });
    assert.equal(versioned.results[0].status, "version-created");
    assert.equal(readMaterialFile(root, fileId)?.revisions.length, 2);
    assert.equal(resolveMaterialFileBytes(root, fileId, firstRevision).bytes.toString("utf8"), "宵禁从午夜开始。");

    const archived = setMaterialFilesArchived(root, { operationId: "archive.one", expectedRevision: 4, fileIds: [fileId], archived: true, now: "2026-09-12T08:03:00.000Z" });
    assert.equal(archived.state, "completed");
    assert.equal(listMaterialFiles(root, { archived: false }).total, 0);
    assert.equal(listMaterialFiles(root, { archived: true }).files[0].id, fileId);

    setMaterialFilesArchived(root, { operationId: "restore.one", expectedRevision: 5, fileIds: [fileId], archived: false, now: "2026-09-12T08:04:00.000Z" });
    const moved = moveMaterialFiles(root, { operationId: "move.one", expectedRevision: 6, fileIds: [fileId], folderId: null, now: "2026-09-12T08:05:00.000Z" });
    assert.equal(moved.state, "completed");
    assert.equal(readMaterialFile(root, fileId)?.folderId, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("imports distinguish byte duplicates, same-name different content, partial failure and replay", () => {
  const root = fixture();
  try {
    const first = importMaterialFiles(root, { operationId: "import.batch", now: NOW, files: [
      { name: "同名.txt", mimeType: "text/plain", base64: encoded("甲") },
      { name: "坏文件.pdf", mimeType: "application/pdf", base64: encoded("not a pdf") },
      { name: "同名.txt", mimeType: "text/plain", base64: encoded("乙") }
    ] });
    assert.equal(first.state, "partial");
    assert.deepEqual(first.results.map((entry: { status: string }) => entry.status), ["created", "failed", "created"]);
    assert.equal(listMaterialFiles(root).total, 2);

    const duplicate = importMaterialFiles(root, { operationId: "import.duplicate", now: NOW, files: [{ name: "别名.txt", mimeType: "text/plain", base64: encoded("甲") }] });
    assert.equal(duplicate.results[0].status, "duplicate");
    assert.equal(listMaterialFiles(root).total, 2);

    const replay = importMaterialFiles(root, { operationId: "import.batch", now: NOW, files: [{ name: "不会执行.txt", mimeType: "text/plain", base64: encoded("新") }] });
    assert.equal(replay.replayed, true);
    assert.equal(listMaterialFiles(root).total, 2);
    assert.equal(readMaterialOperationReceipt(root, "import.batch")?.state, "partial");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("folder moves reject cycles and stale catalog revisions", () => {
  const root = fixture();
  try {
    const parent = createMaterialFolder(root, { title: "资料", expectedRevision: 0, now: NOW });
    const child = createMaterialFolder(root, { title: "历史", parentId: parent.folder.id, expectedRevision: 1, now: NOW });
    assert.throws(() => updateMaterialFolder(root, { folderId: parent.folder.id, parentId: child.folder.id, expectedRevision: 2, now: NOW }), /descendant/u);
    assert.throws(() => createMaterialFolder(root, { title: "过期", expectedRevision: 1, now: NOW }), /changed/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("portable roots contain immutable material bytes without hidden path indirection", () => {
  const root = fixture();
  try {
    const imported = importMaterialFiles(root, { operationId: "import.portable", now: NOW, files: [{ name: "原文.txt", mimeType: "text/plain", base64: encoded("原始字节") }] });
    const record = readMaterialFile(root, imported.results[0].fileId)!;
    const stored = path.join(root, record.revision.relativePath);
    assert.equal(readFileSync(stored, "utf8"), "原始字节");
    assert.ok(record.revision.relativePath.startsWith("assets/material-files/"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("large material lists page real records, search text and omit bodies from list projections", () => {
  const root = fixture();
  try {
    for (let batch = 0; batch < 7; batch += 1) {
      importMaterialFiles(root, { operationId: `operation.scale.${batch}`, files: Array.from({ length: 20 }, (_, index) => { const number = batch * 20 + index; return { name: `资料-${String(number).padStart(3, "0")}.md`, mimeType: "text/markdown", base64: encoded(number === 137 ? "一般正文\n北湾深处的关键线索" : `可解析的实际资料 ${number}`) }; }) });
    }
    const first = listMaterialFiles(root, { limit: 50, offset: 0, sort: "name" });
    const second = listMaterialFiles(root, { limit: 50, offset: 50, sort: "name" });
    assert.equal(first.total, 140);
    assert.equal(first.files.length, 50);
    assert.notEqual(first.files[0].id, second.files[0].id);
    assert.equal(first.files.every((file: { revisions: Array<{ textContent: string | null }> }) => file.revisions.every((revision) => revision.textContent === null)), true);
    const found = listMaterialFiles(root, { query: "关键线索", limit: 10 });
    assert.equal(found.total, 1);
    assert.equal(found.files[0].originalName, "资料-137.md");
    assert.equal(readMaterialFile(root, found.files[0].id)?.revision.textContent.includes("关键线索"), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
