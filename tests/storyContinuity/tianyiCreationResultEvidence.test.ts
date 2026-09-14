import test from "node:test";
import assert from "node:assert/strict";
import { countTianyiCreationBodyCharacters, recognizeTianyiCreationIdeas } from "../../src/storyContinuity/tianyiCreationResultEvidence.ts";

test("creation evidence recognizes rendered ordered-list items without browser-generated numbers", () => {
  const evidence = recognizeTianyiCreationIdeas({ renderedListItems: ["河道断流：港工必须封闸保住仓库，船户却要开闸救下游，两方在潮水前僵持。", "山路封锁：守路人阻止商队通行，否则旧港会暴露；商队必须送药进镇。", "旧港之争：两家都持有契约并拒绝让步，主角必须在退潮前决定归属。"] });
  assert.equal(evidence?.recognitionSource, "rendered-list");
  assert.deepEqual(evidence?.ideas.map((idea) => idea.title), ["河道断流", "山路封锁", "旧港之争"]);
  assert.equal(evidence?.ideas.every((idea) => idea.hasConcreteConflict), true);
});

test("creation evidence recognizes ordered Markdown and standalone heading blocks without fixed titles", () => {
  const ordered = recognizeTianyiCreationIdeas({ markdown: "1. **潮线改道：** 甲方必须开闸，乙方却要保住堤岸。\n2. 山口来客：向导拒绝带路，伤员必须及时进镇。" });
  assert.deepEqual(ordered?.ideas.map((idea) => idea.title), ["潮线改道", "山口来客"]);
  const headed = recognizeTianyiCreationIdeas({ markdown: "## 灯塔来信\n守塔人拒绝交信，收信者必须在天亮前离港。\n\n## 河口旧约\n双方都持有旧约并争夺泊位。" });
  assert.equal(headed?.recognitionSource, "markdown-headings");
  assert.deepEqual(headed?.ideas.map((idea) => idea.title), ["灯塔来信", "河口旧约"]);
});

test("body character count excludes title, numbering, Markdown, whitespace, punctuation, symbols, and format characters", () => {
  assert.equal(countTianyiCreationBodyCharacters("**甲方** 必须开闸，乙方却拒绝。"), 11);
});
