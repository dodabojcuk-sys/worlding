import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { readWorkspaceState } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

test("startWriting creates one default chapter and scene behind one workspace operation", () => {
  const fixture = createFixture();
  try {
    const result = fixture.operations.startWriting({ projectId: fixture.projectId });

    assert.equal(result.chapter.title, "未命名章节");
    assert.equal(result.scene.title, "新场景");
    assert.equal(result.scene.chapterId, result.chapter.id);
    assert.equal(result.writing.chapters.length, 1);
    assert.equal(result.writing.chapters[0]?.scenes.length, 1);
    assert.equal(result.writing.activeDocument?.id, result.scene.id);
    assert.throws(
      () => fixture.operations.startWriting({ projectId: fixture.projectId }),
      /already started/i
    );
    assert.equal(readdirSync(path.join(fixture.projectPath, "chapters")).length, 1);
    assert.equal(readdirSync(path.join(fixture.projectPath, "scenes")).length, 1);
  } finally {
    rmSync(fixture.rootPath, { recursive: true, force: true });
  }
});

test("startWriting compensates the chapter and restores state when scene creation fails", () => {
  const fixture = createFixture({ failBeforeScene: true });
  try {
    const stateBefore = readWorkspaceState(fixture.projectPath);
    assert.throws(
      () => fixture.operations.startWriting({ projectId: fixture.projectId }),
      /injected scene failure/i
    );

    const writing = fixture.operations.getWritingBootstrap({ projectId: fixture.projectId });
    assert.equal(writing.chapters.length, 0);
    assert.equal(writing.activeDocument, null);
    assert.deepEqual(readdirSync(path.join(fixture.projectPath, "chapters")), []);
    assert.deepEqual(readdirSync(path.join(fixture.projectPath, "scenes")), []);
    assert.deepEqual(readWorkspaceState(fixture.projectPath), stateBefore);
  } finally {
    rmSync(fixture.rootPath, { recursive: true, force: true });
  }
});

test("startWriting removes both new documents when the final bootstrap step fails", () => {
  const fixture = createFixture({ failBeforeBootstrap: true });
  try {
    const stateBefore = readWorkspaceState(fixture.projectPath);
    assert.throws(
      () => fixture.operations.startWriting({ projectId: fixture.projectId }),
      /injected bootstrap failure/i
    );
    assert.deepEqual(readdirSync(path.join(fixture.projectPath, "chapters")), []);
    assert.deepEqual(readdirSync(path.join(fixture.projectPath, "scenes")), []);
    assert.deepEqual(readWorkspaceState(fixture.projectPath), stateBefore);
  } finally {
    rmSync(fixture.rootPath, { recursive: true, force: true });
  }
});

function createFixture(options: { failBeforeScene?: boolean; failBeforeBootstrap?: boolean } = {}) {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-studio-initial-writing-"));
  const stateFilePath = path.join(rootPath, ".app-state.json");
  const operations = createStoryStudioWorkspaceOperations({
    rootPath,
    stateFilePath,
    ...(options.failBeforeScene ? {
      beforeInitialWritingSceneCreate() {
        throw new Error("injected scene failure");
      }
    } : {}),
    ...(options.failBeforeBootstrap ? {
      beforeInitialWritingBootstrap() {
        throw new Error("injected bootstrap failure");
      }
    } : {})
  });
  const project = operations.createProject({ title: "空白世界", folderSlug: "blank-world" });
  return {
    rootPath,
    stateFilePath,
    operations,
    projectId: project.id,
    projectPath: path.join(rootPath, project.id)
  };
}
