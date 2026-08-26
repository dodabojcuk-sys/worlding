import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  parseStoryMarkdown,
  readWorkspaceNote,
  updateWorkspaceNote
} from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

function fixture(name: string) {
  const rootPath = join(tmpdir(), `world-os-story-studio-${name}`);
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(rootPath, { recursive: true });
  return {
    rootPath,
    stateFilePath: join(rootPath, ".studio-state.json"),
    operations: createStoryStudioWorkspaceOperations({
      rootPath,
      stateFilePath: join(rootPath, ".studio-state.json")
    })
  };
}

test("Story Studio lists an empty configured root and creates canonical Markdown projects", () => {
  const input = fixture("create");
  mkdirSync(join(input.rootPath, "_continuity", "agents", "agent.tianyi"), { recursive: true });
  writeFileSync(join(input.rootPath, "_continuity", "project.md"), "reserved root canary", "utf8");
  assert.deepEqual(input.operations.listProjects(), []);

  const titleOnly = input.operations.createProject({ title: "First World", folderSlug: "first-world" });
  assert.equal(titleOnly.id, "first-world");
  assert.equal(titleOnly.title, "First World");
  assert.equal(titleOnly.source, "markdown");
  assert.equal(titleOnly.counts.chapters, 0);

  const detailed = input.operations.createProject({
    title: "雾中灯塔",
    folderSlug: "mist-lighthouse",
    genre: "dark-fantasy",
    ambience: "rain-lighthouse"
  });
  assert.equal(detailed.genre, "dark-fantasy");
  assert.equal(detailed.ambience, "rain-lighthouse");

  mkdirSync(join(input.rootPath, "mist-lighthouse", "continuity", "agents", "agent.tianyi", "memories"), { recursive: true });
  writeFileSync(join(input.rootPath, "mist-lighthouse", "continuity", "agents", "agent.tianyi", "memories", "memory.000001.md"), "reserved project continuity canary", "utf8");
  const object = input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "location", title: "旧灯塔" });
  assert.equal(object.title, "旧灯塔");
  assert.equal(input.operations.listWorldObjects({ projectId: "mist-lighthouse" }).some((item) => item.relativeId.startsWith("continuity/")), false);

  const source = readFileSync(join(input.rootPath, "mist-lighthouse", "project.md"), "utf8");
  assert.match(source, /world_os: story-workspace\/v1/);
  assert.match(source, /genre: dark-fantasy/);
  assert.match(source, /ambience: rain-lighthouse/);
  assert.equal(parseStoryMarkdown(source).frontmatter.title, "雾中灯塔");
});

test("Story Studio rejects duplicate unsafe absolute traversal and symlink project identifiers", () => {
  const input = fixture("paths");
  input.operations.createProject({ title: "Safe", folderSlug: "safe-world" });
  assert.throws(() => input.operations.createProject({ title: "Again", folderSlug: "safe-world" }), /already exists/i);

  for (const folderSlug of ["../outside", "/tmp/outside", "nested/world", "bad\\world", "bad\0world"]) {
    assert.throws(() => input.operations.createProject({ title: "Unsafe", folderSlug }), /project identifier|folder/i);
  }

  const outside = join(tmpdir(), "world-os-story-studio-outside");
  rmSync(outside, { recursive: true, force: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "project.md"), "---\nid: project.outside\ntype: project\ntitle: Outside\n---\n", "utf8");
  symlinkSync(outside, join(input.rootPath, "escaped-world"));
  assert.throws(() => input.operations.openProject({ projectId: "escaped-world" }), /symlink/i);
});

test("Story Studio reopens from relative app state and rereads metadata from Markdown", () => {
  const input = fixture("restart");
  input.operations.createProject({
    title: "雾中灯塔",
    folderSlug: "mist-lighthouse",
    genre: "mystery",
    ambience: "distant-sea"
  });

  const projectRoot = join(input.rootPath, "mist-lighthouse");
  input.operations.openProject({ projectId: "mist-lighthouse" });
  const current = readWorkspaceNote(projectRoot, "project.md");
  updateWorkspaceNote(projectRoot, {
    relativePath: "project.md",
    expectedContentHash: current.contentHash,
    frontmatter: { genre: "historical", custom_field: "preserved" }
  });
  rmSync(join(projectRoot, ".world-os", "index.json"));

  const restarted = createStoryStudioWorkspaceOperations({
    rootPath: input.rootPath,
    stateFilePath: input.stateFilePath
  }).getBootstrap();

  assert.equal(restarted.activeProject?.title, "雾中灯塔");
  assert.equal(restarted.activeProject?.genre, "historical");
  assert.equal(restarted.activeProject?.source, "markdown");
  assert.equal(existsSync(join(projectRoot, ".world-os", "index.json")), true);
  assert.equal(parseStoryMarkdown(readFileSync(join(projectRoot, "project.md"), "utf8")).frontmatter.custom_field, "preserved");

  const state = readFileSync(input.stateFilePath, "utf8");
  assert.doesNotMatch(state, new RegExp(input.rootPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(state, /雾中灯塔|custom_field|世界简介/);
});

test("Story Studio returns a recoverable state when the remembered project is removed", () => {
  const input = fixture("removed");
  input.operations.createProject({ title: "Temporary", folderSlug: "temporary" });
  rmSync(join(input.rootPath, "temporary"), { recursive: true, force: true });

  const bootstrap = createStoryStudioWorkspaceOperations({
    rootPath: input.rootPath,
    stateFilePath: input.stateFilePath
  }).getBootstrap();
  assert.equal(bootstrap.activeProject, null);
  assert.equal(bootstrap.recovery?.code, "active-project-missing");
});

test("writing continuity survives process restart and safely drops stale editor offsets", () => {
  const input = fixture("writing-continuity");
  input.operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const chapter = input.operations.createWritingDocument({ projectId: "mist-lighthouse", type: "chapter", title: "第一章" });
  const scene = input.operations.createWritingDocument({ projectId: "mist-lighthouse", type: "scene", title: "潮声", chapterId: chapter.id });
  const saved = input.operations.saveWritingContinuity({
    projectId: "mist-lighthouse",
    activeDestination: "nuwa",
    returnDestination: "creation",
    workspaceMode: "library",
    showWorldHome: false,
    documentId: scene.id,
    revisionToken: scene.revisionToken,
    selection: { objectId: null, source: "writing-mention", documentId: null, blockId: null, relationId: null },
    editorSelection: { start: 8, end: 18 },
    scrollTop: 420,
    focus: "writing-editor"
  });
  assert.equal(saved.state, "exact");
  assert.equal(saved.returnDestination, "writing", "legacy persisted creation values migrate on the server before continuity is returned");

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  assert.deepEqual(restarted.readWritingContinuity({ projectId: "mist-lighthouse" }), saved);

  restarted.updateWritingDocument({
    projectId: "mist-lighthouse",
    documentId: scene.id,
    expectedHash: scene.revisionToken,
    status: scene.status,
    body: `${scene.body}\n修订后的正文。`
  });
  const stale = restarted.readWritingContinuity({ projectId: "mist-lighthouse" });
  assert.equal(stale?.state, "revision-stale");
  assert.equal(stale?.editorSelection, null);
  assert.equal(stale?.scrollTop, 0);
  assert.equal(stale?.focus, "workspace");
  const stateSource = readFileSync(input.stateFilePath, "utf8");
  assert.doesNotMatch(stateSource, /修订后的正文/);
});
