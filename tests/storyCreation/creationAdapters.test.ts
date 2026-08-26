import assert from "node:assert/strict";
import test from "node:test";

import { CREATION_STRUCTURE_VERSION, creationStructureNeedsMigration, migrateCreationStructure } from "../../src/storyCreation/creationArtifactModel.ts";
import { appendMarkdownHeading, markdownHeadingAtOffset, markdownOutline, markdownWordCount, removeMarkdownSection, renameMarkdownHeading, reorderMarkdownSection } from "../../src/storyCreation/markdownDocumentModel.ts";
import { fountainRoundTrip, parseFountain } from "../../src/storyCreation/screenplayFormatAdapter.ts";
import { CreationAutosaveController } from "../../src/storyCreation/autosaveController.ts";
import { applyCompositionEvent } from "../../src/storyCreation/compositionBuffer.ts";

test("legacy OutputArtifact structures migrate additively without changing source text", () => {
  const source = "# 第一章\n\n正文";
  const legacy = { chapters: [{ title: "第一章", scenes: [] }], custom: { retained: true } };
  const migrated = migrateCreationStructure("novel", legacy, source);
  assert.equal(migrated.version, CREATION_STRUCTURE_VERSION);
  assert.equal(migrated.kind, "novel");
  assert.deepEqual(migrated.custom, { retained: true });
  assert.equal(creationStructureNeedsMigration(legacy), true);
  assert.equal(creationStructureNeedsMigration(migrated), false);
  assert.equal(source, "# 第一章\n\n正文");
});

test("comic migration creates serializable pages and panels with creation-only references", () => {
  const structure = migrateCreationStructure("comic", { panels: [{ image: "夜雨", dialogue: "走。" }] }, "");
  assert.equal(structure.kind, "comic");
  assert.deepEqual(JSON.parse(JSON.stringify(structure)), structure);
  const pages = structure.pages as Array<{ panels: Array<Record<string, unknown>> }>;
  assert.equal(pages[0].panels[0].prompt, "夜雨");
  assert.equal(pages[0].panels[0].dialogue, "走。");
  assert.equal("event" in pages[0].panels[0], false);
});

test("Markdown operations keep headings addressable through rename add remove and reorder", () => {
  const source = "# 卷一\n\n## 第一章\n\n甲\n\n## 第二章\n\n乙\n";
  const outline = markdownOutline(source);
  assert.deepEqual(outline.map((item) => item.title), ["卷一", "第一章", "第二章"]);
  const renamed = renameMarkdownHeading(source, outline[1].id, "开端");
  assert.match(renamed, /## 开端/u);
  const renamedOutline = markdownOutline(renamed);
  const reordered = reorderMarkdownSection(renamed, renamedOutline[2].id, renamedOutline[1].id);
  assert.ok(reordered.indexOf("## 第二章") < reordered.indexOf("## 开端"));
  const current = markdownHeadingAtOffset(reordered, reordered.indexOf("乙"));
  assert.equal(current?.title, "第二章");
  const withEnding = appendMarkdownHeading(reordered, 2, "终章");
  const ending = markdownOutline(withEnding).find((item) => item.title === "终章");
  assert.ok(ending);
  assert.doesNotMatch(removeMarkdownSection(withEnding, ending!.id), /终章/u);
  assert.deepEqual(markdownWordCount("你好，世界。 Hello world"), { characters: 16, words: 4 });
});

test("Fountain R0 parses scenes dialogue and exact UTF-16 offsets while round-tripping", () => {
  const source = "INT. 厨房 - 夜 #1#\n\n雨敲着窗。\n\n阿岚\n（低声）\n我们走。\n\n> CUT TO:\n\n.钟楼顶部 #2A#\n\n风更大了。";
  const document = parseFountain(source);
  assert.equal(fountainRoundTrip(source), source);
  assert.deepEqual(document.scenes.map((scene) => [scene.title, scene.sceneNumber]), [["INT. 厨房 - 夜", "1"], ["钟楼顶部", "2A"]]);
  assert.equal(document.scenes[1].start, source.indexOf(".钟楼顶部"));
  assert.ok(document.tokens.some((token) => token.type === "character" && token.text === "阿岚"));
  assert.ok(document.tokens.some((token) => token.type === "dialogue" && token.text === "我们走。"));
  assert.ok(document.tokens.some((token) => token.type === "transition"));
});

test("unsupported Fountain syntax stays visible as editable source instead of being discarded", () => {
  const source = "Title: 未完成\n\n# 第一幕\n\n[[note]]\n\n角色^\n台词";
  const document = parseFountain(source);
  assert.equal(document.source, source);
  assert.deepEqual(document.unsupported, ["dual-dialogue", "notes", "sections", "title-page"]);
});

test("Chinese composition commits once and autosave debounce flushes the latest complete text", () => {
  let composition = { active: false, value: "" };
  composition = applyCompositionEvent(composition, { type: "start" }).state;
  const partial = applyCompositionEvent(composition, { type: "change", value: "n" }); composition = partial.state;
  const candidate = applyCompositionEvent(composition, { type: "change", value: "你" }); composition = candidate.state;
  const complete = applyCompositionEvent(composition, { type: "end", value: "你好" });
  assert.equal(partial.commit, null);
  assert.equal(candidate.commit, null);
  assert.equal(complete.commit, "你好");

  const scheduled = new Map<number, () => void>();
  let sequence = 0;
  const saved: string[] = [];
  const controller = new CreationAutosaveController<string>(700, { set(callback) { sequence += 1; scheduled.set(sequence, callback); return sequence; }, clear(handle) { scheduled.delete(handle as number); } }, (value) => saved.push(value));
  controller.schedule("你");
  controller.schedule("你好");
  assert.equal(scheduled.size, 1);
  controller.flush();
  assert.deepEqual(saved, ["你好"]);
  assert.equal(scheduled.size, 0);
});

test("100k Chinese characters remain reversible Markdown source", () => {
  const source = `# 长篇\n\n${"雾".repeat(100_000)}`;
  assert.equal(markdownOutline(source)[0]?.title, "长篇");
  assert.equal(markdownWordCount(source).characters, 100_002);
  assert.equal(source.slice(-4), "雾雾雾雾");
});
