import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("draft Event Recycle Bin metadata is written by the existing catalog owner without deleting the Event", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-r8-event-trash-"));
  try {
    const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, "state.json") });
    const project = operations.createProject({ title: "长夜将明", folderSlug: "long-night-r8-trash" });
    const event = operations.createWorldObject({ projectId: project.id, type: "event", title: "草稿事件", status: "draft", tags: [], body: "# 草稿事件\n" });
    const before = operations.readObjectCatalog({ projectId: project.id, workVersionId: "work-version.root.r8" });
    const after = operations.updateObjectCatalog({ projectId: project.id, workVersionId: "work-version.root.r8", expectedRevision: before.revision, operation: "trash", objectType: "event", objectIds: [event.id], trashedFrom: "active" });
    assert.equal(after.records.find((record) => record.objectId === event.id)?.trashedAt !== null, true);
    assert.equal(operations.readWorldObject({ projectId: project.id, objectId: event.id }).status, "draft");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
