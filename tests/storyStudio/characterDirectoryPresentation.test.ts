import assert from "node:assert/strict";
import test from "node:test";

import { compareDirectoryCharacters, getCharacterDirectorySummary, validateCustomRoleLevel } from "../../apps/story-studio/src/product-shell/project-directory/character/characterDirectoryPresentation.ts";
import { readObjectDirectoryDensity, readObjectDirectorySort, saveObjectDirectoryDensity, saveObjectDirectorySort } from "../../apps/story-studio/src/lib/controlCenterPreferences.ts";

const anchor = (id: string, heading: string, content: string) => `<!-- world-os:section id="${id}" kind="text" -->\n## ${heading}\n\n${content}`;

test("character directory summary only renders safe user content from the shared section parser", () => {
  const backgroundThenPersonality = `${anchor("background", "背景", "来自雾港的调查者。\n\n")}${anchor("personality", "性格", "冷静克制。")}`;
  assert.equal(getCharacterDirectorySummary({ body: backgroundThenPersonality }, "暂无人物摘要"), "来自雾港的调查者。");

  const emptyBackground = `${anchor("background", "背景", "\n")}${anchor("personality", "性格", "冷静克制。")}`;
  assert.equal(getCharacterDirectorySummary({ body: emptyBackground }, "暂无人物摘要"), "暂无人物摘要");

  assert.equal(getCharacterDirectorySummary({ body: backgroundThenPersonality, profile: { fields: { summary: { value: "经作者确认的一句话摘要。" } } } }, "暂无人物摘要"), "经作者确认的一句话摘要。");
  assert.equal(getCharacterDirectorySummary({ body: "旧格式正文的第一段。\n\n第二段。" }, "暂无人物摘要"), "旧格式正文的第一段。");
  assert.equal(getCharacterDirectorySummary({ body: '<!-- world-os:section id="Broken" kind="text" -->\n## 旧标题\n\n不能泄漏。' }, "暂无人物摘要"), "不能泄漏。");
  assert.equal(getCharacterDirectorySummary({ body: "", profile: { fields: { summary: { value: "<!-- world-os:section id=\"bad\" -->" } } } }, "暂无人物摘要"), "暂无人物摘要");
});

test("directory sorting is deterministic with title and object ID fallbacks", () => {
  const records = [
    { object: { id: "character.b", title: "同名", subtype: "supporting", updatedAt: "2026-01-02" }, eventCount: 2, manualOrder: null },
    { object: { id: "character.a", title: "同名", subtype: "main", updatedAt: "2026-01-02" }, eventCount: 2, manualOrder: null }
  ];
  assert.deepEqual([...records].sort((left, right) => compareDirectoryCharacters(left, right, "appearance-desc")).map((item) => item.object.id), ["character.a", "character.b"]);
  assert.deepEqual([...records].sort((left, right) => compareDirectoryCharacters(left, right, "role-level")).map((item) => item.object.id), ["character.a", "character.b"]);
});

test("custom role levels use unicode-safe project values without a new store", () => {
  assert.deepEqual(validateCustomRoleLevel("叙述视角", ["main", "supporting"]), { value: "叙述视角" });
  assert.deepEqual(validateCustomRoleLevel("主要角色", ["主要角色"]), { error: "duplicate" });
  assert.deepEqual(validateCustomRoleLevel("<script>", []), { error: "dangerous" });
});

test("directory density and sort share one browser preference scoped by user and object type", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveObjectDirectoryDensity(storage, "author-a", "character", "compact");
  saveObjectDirectorySort(storage, "author-a", "character", "name-desc");
  assert.equal(readObjectDirectoryDensity(storage, "author-a", "character"), "compact");
  assert.equal(readObjectDirectorySort(storage, "author-a", "character"), "name-desc");
  assert.equal(readObjectDirectorySort(storage, "author-a", "item"), "manual");
});
