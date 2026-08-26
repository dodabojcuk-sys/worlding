import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function fixture(name: string) {
  const rootPath = path.join(tmpdir(), `world-os-story-studio-library-${name}`);
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(rootPath, { recursive: true });
  const stateFilePath = path.join(rootPath, ".studio-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  return { rootPath, projectRoot: path.join(rootPath, "mist-lighthouse"), stateFilePath, operations };
}

test("Story Studio World Library creates all built-in object types as canonical Markdown", () => {
  const input = fixture("types");
  assert.equal(input.operations.getStoryStudioWorldLibraryBootstrap({ projectId: "mist-lighthouse" }).objects.length, 0);

  const types = ["character", "location", "event", "item", "faction", "rule", "thread"] as const;
  for (const [index, type] of types.entries()) {
    const created = input.operations.createWorldObject({
      projectId: "mist-lighthouse",
      type,
      title: `${type}-${index}`,
      status: type === "rule" ? "locked" : "active",
      tags: ["seed", type]
    });
    assert.equal(created.type, type);
    assert.equal(created.source, "markdown");
    assert.equal(existsSync(path.join(input.projectRoot, created.relativeId)), true);
    assert.match(readFileSync(path.join(input.projectRoot, created.relativeId), "utf8"), /world_os: story-workspace\/v1/);
  }

  const library = input.operations.listWorldObjects({ projectId: "mist-lighthouse" });
  assert.equal(library.length, 7);
  assert.deepEqual(Object.fromEntries(types.map((type) => [type, library.filter((item) => item.type === type).length])), {
    character: 1, location: 1, event: 1, item: 1, faction: 1, rule: 1, thread: 1
  });
});

test("World Library searches title and tags and filters by type from the derived index", () => {
  const input = fixture("search");
  input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "character", title: "林远", tags: ["protagonist", "lighthouse"] });
  input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "location", title: "旧灯塔", tags: ["lighthouse"] });
  input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "event", title: "失踪船只", tags: ["mystery"] });

  assert.deepEqual(input.operations.searchWorldObjects({ projectId: "mist-lighthouse", query: "林远" }).map((item) => item.title), ["林远"]);
  assert.deepEqual(input.operations.searchWorldObjects({ projectId: "mist-lighthouse", query: "lighthouse" }).map((item) => item.title), ["旧灯塔", "林远"]);
  assert.deepEqual(input.operations.searchWorldObjects({ projectId: "mist-lighthouse", query: "", type: "event" }).map((item) => item.title), ["失踪船只"]);
});

test("Card updates preserve unknown fields, expose links and backlinks, and reject stale writes", () => {
  const input = fixture("edit");
  const location = input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "location", title: "旧灯塔" });
  const character = input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "character", title: "林远" });

  const characterPath = path.join(input.projectRoot, character.relativeId);
  const initialSource = readFileSync(characterPath, "utf8").replace("status: active", "status: active\ncustom_oath: keep");
  writeFileSync(characterPath, initialSource, "utf8");
  const opened = input.operations.openWorldObject({ projectId: "mist-lighthouse", objectId: character.id });
  const saved = input.operations.updateWorldObject({
    projectId: "mist-lighthouse",
    objectId: character.id,
    expectedHash: opened.revisionToken,
    title: "林远",
    status: "active",
    tags: ["protagonist"],
    aliases: ["守灯人"],
    body: `# 林远\n\n他守着 [[旧灯塔]]，也记录在 [灯塔资料](../locations/旧灯塔.md)。\n`
  });
  assert.equal(saved.conflict, false);
  assert.match(readFileSync(characterPath, "utf8"), /custom_oath: keep/);

  const locationBacklinks = input.operations.getWorldObjectBacklinks({ projectId: "mist-lighthouse", objectId: location.id });
  assert.deepEqual(locationBacklinks.map((item) => item.title), ["林远"]);
  assert.deepEqual(input.operations.openWorldObject({ projectId: "mist-lighthouse", objectId: character.id }).linkedObjects.map((item) => item.title), ["旧灯塔"]);

  writeFileSync(characterPath, readFileSync(characterPath, "utf8").replace("他守着", "外部编辑：他守着"), "utf8");
  const conflict = input.operations.updateWorldObject({
    projectId: "mist-lighthouse",
    objectId: character.id,
    expectedHash: saved.object.revisionToken,
    title: "林远",
    status: "active",
    tags: [],
    aliases: [],
    body: "# 林远\n\n过期的本地内容。\n"
  });
  assert.equal(conflict.conflict, true);
  assert.match(readFileSync(characterPath, "utf8"), /外部编辑/);
  assert.doesNotMatch(readFileSync(characterPath, "utf8"), /过期的本地内容/);
});

test("World Library restart restores only relative tabs and rereads active content from Markdown", () => {
  const input = fixture("restart");
  const character = input.operations.createWorldObject({ projectId: "mist-lighthouse", type: "character", title: "林远" });
  input.operations.openWorldObject({ projectId: "mist-lighthouse", objectId: character.id });
  const characterPath = path.join(input.projectRoot, character.relativeId);
  writeFileSync(characterPath, readFileSync(characterPath, "utf8").replace("# 林远", "# 林远\n\n重启后的外部补充"), "utf8");

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const bootstrap = restarted.getStoryStudioWorldLibraryBootstrap({ projectId: "mist-lighthouse" });
  assert.equal(bootstrap.activeObject?.id, character.id);
  assert.match(bootstrap.activeObject?.body || "", /重启后的外部补充/);

  const appState = readFileSync(input.stateFilePath, "utf8");
  const workspaceState = readFileSync(path.join(input.projectRoot, ".world-os", "state.json"), "utf8");
  assert.doesNotMatch(appState, /林远|重启后的外部补充|# /);
  assert.doesNotMatch(workspaceState, /重启后的外部补充|# /);
  assert.doesNotMatch(workspaceState, new RegExp(input.projectRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
