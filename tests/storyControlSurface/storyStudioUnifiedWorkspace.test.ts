import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-studio-unified-"));
  const stateFilePath = path.join(rootPath, ".app-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const character = operations.createWorldObject({ projectId: project.id, type: "character", title: "林远", body: "# 林远\n\n守塔人。\n" });
  const location = operations.createWorldObject({ projectId: project.id, type: "location", title: "旧灯塔", body: "# 旧灯塔\n\n地下室尚未公开。\n" });
  return { rootPath, stateFilePath, operations, project, character, location };
}

test("shared workspace selection survives restart without copying object content", () => {
  const input = fixture();
  const canvas = input.operations.createVisualDocument({ projectId: input.project.id, type: "canvas", title: "线索板" });
  const updated = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: canvas.relativePath,
    expectedHash: canvas.contentHash,
    document: {
      ...canvas,
      content: {
        ...canvas.content,
        nodes: [{ id: "node.1", kind: "object", objectId: input.character.id, text: "", assetPath: "", x: 80, y: 120, width: 220, height: 110 }],
        edges: [],
        groups: []
      }
    }
  });
  assert.equal(updated.conflict, false);
  input.operations.setWorkspaceSelection({
    projectId: input.project.id,
    selection: { objectId: input.character.id, source: "canvas-node", documentId: canvas.id, blockId: "node.1", relationId: null }
  });

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const library = restarted.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id });
  assert.deepEqual(library.selection, { objectId: input.character.id, source: "canvas-node", documentId: canvas.id, blockId: "node.1", relationId: null });

  const canvasSource = readFileSync(path.join(input.rootPath, input.project.id, canvas.relativePath), "utf8");
  assert.match(canvasSource, new RegExp(input.character.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(canvasSource, /守塔人/);
});

test("writing bridge saves Markdown references, restores context, and rejects stale writes", () => {
  const input = fixture();
  const chapter = input.operations.createWritingDocument({ projectId: input.project.id, type: "chapter", title: "第三章" });
  const scene = input.operations.createWritingDocument({ projectId: input.project.id, type: "scene", title: "地下室门前", chapterId: chapter.id });
  const saved = input.operations.updateWritingDocument({
    projectId: input.project.id,
    documentId: scene.id,
    expectedHash: scene.revisionToken,
    status: "drafting",
    body: "# 地下室门前\n\n林远回到 [[旧灯塔]]，但没有说出全部秘密。\n"
  });
  assert.equal(saved.conflict, false);
  assert.deepEqual(saved.document.mentionedObjects.map((object) => object.id), [input.location.id]);
  assert.deepEqual(saved.document.guard.locations.map((object) => object.id), [input.location.id]);

  const sourcePath = path.join(input.rootPath, input.project.id, saved.document.relativeId);
  assert.match(readFileSync(sourcePath, "utf8"), /\[\[旧灯塔\]\]/);
  writeFileSync(sourcePath, readFileSync(sourcePath, "utf8").replace("没有说出", "外部编辑：没有说出"), "utf8");
  const conflict = input.operations.updateWritingDocument({
    projectId: input.project.id,
    documentId: scene.id,
    expectedHash: saved.document.revisionToken,
    status: "reviewing",
    body: "过期文字"
  });
  assert.equal(conflict.conflict, true);
  assert.match(readFileSync(sourcePath, "utf8"), /外部编辑/);
  assert.doesNotMatch(readFileSync(sourcePath, "utf8"), /过期文字/);

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const writing = restarted.getWritingBootstrap({ projectId: input.project.id });
  assert.equal(writing.activeDocument?.id, scene.id);
  assert.match(writing.activeDocument?.body || "", /外部编辑/);
});
