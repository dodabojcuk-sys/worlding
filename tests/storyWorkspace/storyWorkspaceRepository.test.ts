import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createStoryWorkspace,
  createWorkspaceNote,
  deleteWorkspaceNote,
  getWorkspaceProjectSummary,
  getWorkspaceTree,
  listWorkspaceNotes,
  openStoryWorkspace,
  parseStoryMarkdown,
  readWorkspaceNote,
  rebuildWorkspaceIndex,
  renameWorkspaceNote,
  updateWorkspaceState,
  updateWorkspaceNote,
  validateStoryWorkspace
} from "../../src/storyWorkspace/index.mjs";

const FIXTURE_ROOT = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");

test("create open validate and summarize a Markdown-first workspace", () => {
  const rootPath = createTempWorkspace("create");

  const created = createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const opened = openStoryWorkspace(rootPath);
  const validation = validateStoryWorkspace(rootPath);
  const summary = getWorkspaceProjectSummary(rootPath);

  assert.equal(created.project.title, "雾中灯塔");
  assert.equal(opened.project.title, "雾中灯塔");
  assert.deepEqual(validation, { valid: true, errors: [] });
  assert.equal(summary.projectTitle, "雾中灯塔");
  assert.equal(existsSync(path.join(rootPath, "project.md")), true);
  assert.equal(existsSync(path.join(rootPath, ".world-os", "index.json")), true);
  assert.equal(existsSync(path.join(rootPath, ".obsidian")), false);
  assert.equal(readFileSync(path.join(rootPath, "project.md"), "utf8").startsWith("---\n"), true);
});

test("creates reads updates renames and deletes canonical Markdown notes", () => {
  const rootPath = createTempWorkspace("notes");
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const scene = createWorkspaceNote(rootPath, {
    id: "scene.chapter-03.scene-02",
    type: "scene",
    title: "告知边界",
    status: "drafting",
    frontmatter: {
      chapter: "chapters/03-潜入灯塔.md",
      characters: ["world/characters/林远.md", "world/characters/阿岚.md"],
      location: "world/locations/旧灯塔.md",
      tags: ["scene", "suspense"],
      custom_priority: "2"
    },
    body: "# S2 · 告知边界\n\n林远没有把全部真相说出口。\n\n[地下室秘密](../world/threads/地下室秘密.md)"
  });

  const read = readWorkspaceNote(rootPath, scene.relativePath);
  assert.equal(read.frontmatter.custom_priority, "2");
  assert.match(read.body, /林远没有把全部真相说出口/);
  assert.equal(read.references.includes("../world/threads/地下室秘密.md"), true);
  assert.equal(read.references.includes("world/characters/林远.md"), true);

  const updated = updateWorkspaceNote(rootPath, {
    relativePath: scene.relativePath,
    expectedContentHash: read.contentHash,
    frontmatter: { status: "reviewing" },
    body: "# S2 · 告知边界\n\n林远只把旧地图推到阿岚面前。"
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.note.frontmatter.custom_priority, "2");
  assert.match(updated.note.body, /旧地图/);

  const renamed = renameWorkspaceNote(rootPath, {
    relativePath: scene.relativePath,
    title: "告知边界修订"
  });
  assert.equal(renamed.frontmatter.title, "告知边界修订");
  assert.equal(existsSync(path.join(rootPath, scene.relativePath)), false);
  assert.equal(existsSync(path.join(rootPath, renamed.relativePath)), true);

  deleteWorkspaceNote(rootPath, renamed.relativePath);
  assert.equal(existsSync(path.join(rootPath, renamed.relativePath)), false);
});

test("preserves unknown flat YAML properties and Markdown bodies", () => {
  const rootPath = createTempWorkspace("frontmatter");
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const note = createWorkspaceNote(rootPath, {
    id: "character.linyuan",
    type: "character",
    title: "林远",
    status: "active",
    frontmatter: {
      aliases: ["守塔人"],
      custom_flag: "true",
      custom_score: "2"
    },
    body: "# 林远\n\n他仍是地下室的第一发现者。"
  });
  const original = readWorkspaceNote(rootPath, note.relativePath);

  const changed = updateWorkspaceNote(rootPath, {
    relativePath: note.relativePath,
    expectedContentHash: original.contentHash,
    frontmatter: { status: "reviewing" },
    body: original.body
  });

  assert.equal(changed.ok, true);
  assert.deepEqual(changed.note.frontmatter.aliases, ["守塔人"]);
  assert.equal(changed.note.frontmatter.custom_flag, "true");
  assert.equal(changed.note.frontmatter.custom_score, "2");
  assert.equal(changed.note.body, original.body);
});

test("parses standard Markdown links and Obsidian-compatible wikilinks", () => {
  const parsed = parseStoryMarkdown([
    "---",
    "world_os: story-workspace/v1",
    "id: scene.links",
    "type: scene",
    "title: 链接测试",
    "status: drafting",
    "characters:",
    "  - \"[[林远]]\"",
    "---",
    "# 链接测试",
    "",
    "[地下室](../world/locations/地下室.md) 与 [[旧信来源|旧信]] 都可读。"
  ].join("\n"));

  assert.deepEqual(new Set(parsed.references), new Set(["../world/locations/地下室.md", "林远", "旧信来源"]));
  assert.deepEqual(parsed.frontmatter.characters, ["[[林远]]"]);
});

test("rejects traversal and symlink escapes", () => {
  const rootPath = createTempWorkspace("safety");
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });

  assert.throws(() => readWorkspaceNote(rootPath, "../outside.md"), /outside workspace|Invalid workspace path/i);
  assert.throws(() => createWorkspaceNote(rootPath, {
    id: "escape",
    type: "scene",
    title: "安全名称",
    relativePath: "scenes/../../escape.md",
    body: "# Escape"
  }), /Invalid workspace path|outside workspace/i);

  const outside = path.join(tmpdir(), "world-os-story-workspace-outside.md");
  writeFileSync(outside, "outside", "utf8");
  const linkPath = path.join(rootPath, "world", "characters", "escape.md");
  symlinkSync(outside, linkPath);
  assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
  assert.throws(() => readWorkspaceNote(rootPath, "world/characters/escape.md"), /symlink/i);
  unlinkSync(linkPath);
  rmSync(outside, { force: true });
});

test("detects externally modified notes instead of silently overwriting them", () => {
  const rootPath = createTempWorkspace("conflict");
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const note = createWorkspaceNote(rootPath, {
    id: "scene.conflict",
    type: "scene",
    title: "冲突场景",
    body: "# 冲突场景\n\n原始内容。"
  });
  const beforeExternalEdit = readWorkspaceNote(rootPath, note.relativePath);
  writeFileSync(path.join(rootPath, note.relativePath), "---\nworld_os: story-workspace/v1\nid: scene.conflict\ntype: scene\ntitle: 冲突场景\nstatus: drafting\n---\n# 冲突场景\n\n外部编辑内容。\n", "utf8");

  const result = updateWorkspaceNote(rootPath, {
    relativePath: note.relativePath,
    expectedContentHash: beforeExternalEdit.contentHash,
    body: "# 冲突场景\n\n本地旧内容。"
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.match(readFileSync(path.join(rootPath, note.relativePath), "utf8"), /外部编辑内容/);
});

test("index is derived, contains no prose, and rebuilds after deletion", () => {
  const rootPath = createTempWorkspace("index");
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  createWorkspaceNote(rootPath, {
    id: "scene.index",
    type: "scene",
    title: "索引场景",
    body: "# 索引场景\n\n唯一正文信号：不应该进入索引。"
  });
  const indexPath = path.join(rootPath, ".world-os", "index.json");
  const before = readFileSync(indexPath, "utf8");
  assert.doesNotMatch(before, /唯一正文信号/);
  unlinkSync(indexPath);

  const rebuilt = rebuildWorkspaceIndex(rootPath);
  assert.equal(rebuilt.entries.length, 2);
  assert.doesNotMatch(readFileSync(indexPath, "utf8"), /唯一正文信号/);
  assert.deepEqual(validateStoryWorkspace(rootPath), { valid: true, errors: [] });
  assert.equal(readWorkspaceNote(rootPath, "scenes/索引场景.md").body.includes("唯一正文信号"), true);
});

test("derived index repairs external Markdown deletion and content drift before listing", () => {
  const rootPath = createTempWorkspace("external-index-drift");
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const character = createWorkspaceNote(rootPath, {
    id: "character.index-drift",
    type: "character",
    title: "索引守灯人",
    body: "# 索引守灯人\n\n原始正文。"
  });
  const characterPath = path.join(rootPath, character.relativePath);
  const characterSource = readFileSync(characterPath, "utf8");

  rmSync(characterPath);
  assert.equal(getWorkspaceTree(rootPath).groups.characters.some((note) => note.id === character.id), false);
  assert.equal(JSON.parse(readFileSync(path.join(rootPath, ".world-os", "index.json"), "utf8")).entries.some((entry: { id: string }) => entry.id === character.id), false);

  writeFileSync(characterPath, characterSource);
  assert.equal(getWorkspaceTree(rootPath).groups.characters.some((note) => note.id === character.id), true);
  writeFileSync(characterPath, `${characterSource}\n外部追加正文。\n`);
  getWorkspaceTree(rootPath);
  const refreshed = JSON.parse(readFileSync(path.join(rootPath, ".world-os", "index.json"), "utf8")).entries.find((entry: { id: string }) => entry.id === character.id);
  assert.equal(refreshed.contentHash, readWorkspaceNote(rootPath, character.relativePath).contentHash);
});

test("state deletion does not delete canonical story content and tree stays deterministic", () => {
  const rootPath = copyFixture();
  const initialTree = getWorkspaceTree(rootPath);
  const notes = listWorkspaceNotes(rootPath);
  const statePath = path.join(rootPath, ".world-os", "state.json");
  updateWorkspaceState(rootPath, { currentScenePath: "scenes/03-02-告知边界.md" });
  unlinkSync(statePath);

  assert.equal(readWorkspaceNote(rootPath, "scenes/03-02-告知边界.md").frontmatter.title, "告知边界");
  assert.equal(notes.some((note) => note.relativePath === "world/characters/林远.md"), true);
  assert.deepEqual(getWorkspaceTree(rootPath), initialTree);
  assert.deepEqual(validateStoryWorkspace(rootPath), { valid: true, errors: [] });
});

test("workspace implementation stays local deterministic and contains no external client", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "storyWorkspace", "storyWorkspaceRepository.mjs"), "utf8");
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|openai|anthropic|gemini|Date\.now|Math\.random/i);
  assert.doesNotMatch(source, /sqlite|database|postgres|mongodb/i);
  assert.match(source, /renameSync/);
  assert.match(source, /world-os-tmp-\$\{process\.pid\}/);
});

function createTempWorkspace(label: string): string {
  const rootPath = mkdtempSync(path.join(tmpdir(), `world-os-story-workspace-${label}-`));
  return rootPath;
}

function copyFixture(): string {
  const rootPath = createTempWorkspace("fixture");
  cpSync(FIXTURE_ROOT, rootPath, { recursive: true });
  for (const directory of [
    "world/events",
    "planning",
    "reviews",
    "assets/images",
    "assets/references",
    ".world-os/cache",
    ".world-os/locks",
    ".world-os/runs"
  ]) {
    mkdirSync(path.join(rootPath, directory), { recursive: true });
  }
  rebuildWorkspaceIndex(rootPath);
  return rootPath;
}
