import assert from "node:assert/strict";
import test from "node:test";

import {
  appendStoryCardSection,
  listUnplacedStoryCardSections,
  nextStoryCardSectionId,
  parseStoryCardSections,
  readStoryCardContent,
  replaceStoryCardContent,
  stripStoryCardSectionsByKind
} from "../../src/storyCardPresentation/storyCardSectionAnchors.ts";

test("card section anchors require the frozen one-line comment followed by an ATX heading", () => {
  const body = [
    "# 林远",
    "",
    "正文保留。",
    "",
    '<!-- world-os:section id="secret-01" kind="secret" -->',
    "## 秘密",
    "",
    "CANARY_SECRET_ALPHA",
    "",
    '<!-- world-os:section id="text-01" kind="text" -->',
    "## 备注",
    "",
    "CANARY_CHARACTER_PROSE_A",
    "",
    '<!-- world-os:section id="arc-01" kind="character-arc" -->',
    "## 人物弧线",
    "",
    "CANARY_ARC_ALPHA",
    ""
  ].join("\n");
  const parsed = parseStoryCardSections(body);
  assert.deepEqual(parsed.sections.map((section) => [section.id, section.kind, section.heading]), [
    ["secret-01", "secret", "秘密"],
    ["text-01", "text", "备注"],
    ["arc-01", "character-arc", "人物弧线"]
  ]);
  assert.equal(readStoryCardContent(body, "markdown-section.secret-01").content.includes("CANARY_SECRET_ALPHA"), true);
  assert.equal(readStoryCardContent(body, "markdown-body").content.includes("正文保留。"), true);
  assert.equal(stripStoryCardSectionsByKind(body, "secret").includes("CANARY_SECRET_ALPHA"), false);
  assert.equal(stripStoryCardSectionsByKind(body, "secret").includes("CANARY_CHARACTER_PROSE_A"), true);
  assert.equal(readStoryCardContent(body, "markdown-section.arc-01").content.includes("CANARY_ARC_ALPHA"), true);
});

test("duplicate section identifiers block writes while unrelated comments remain ordinary Markdown", () => {
  const body = [
    "<!-- world-os:other value=\"kept\" -->",
    '<!-- world-os:section id="secret-01" kind="secret" -->',
    "## 秘密一",
    "A",
    '<!-- world-os:section id="secret-01" kind="secret" -->',
    "## 秘密二",
    "B"
  ].join("\n");
  assert.equal(parseStoryCardSections(body).diagnostics.some((item) => item.code === "duplicate-section-id"), true);
  assert.throws(() => replaceStoryCardContent(body, "markdown-section.secret-01", "C"), /Duplicate card section/);
});

test("append, edit, and unplaced detection preserve unrelated Markdown exactly", () => {
  const original = "# 林远\n\n原始正文。\n";
  const sectionId = nextStoryCardSectionId(original, "secret");
  const appended = appendStoryCardSection(original, { id: sectionId, kind: "secret", content: "CANARY_SECRET_BETA\n" });
  assert.equal(appended.startsWith(original), true);
  const edited = replaceStoryCardContent(appended, `markdown-section.${sectionId}`, "新的秘密。\n");
  assert.equal(edited.startsWith(original), true);
  assert.match(edited, /新的秘密/);
  assert.deepEqual(listUnplacedStoryCardSections(edited, []).map((section) => section.id), [sectionId]);
  assert.deepEqual(listUnplacedStoryCardSections(edited, [`markdown-section.${sectionId}`]), []);
  assert.equal(readStoryCardContent(edited, "markdown-section.missing").found, false);
});

test("duplicate character arcs use stable independent anchors", () => {
  let body = "# 林远\n";
  const first = nextStoryCardSectionId(body, "character-arc");
  body = appendStoryCardSection(body, { id: first, kind: "character-arc", content: "ARC_ONE\n" });
  const second = nextStoryCardSectionId(body, "character-arc");
  body = appendStoryCardSection(body, { id: second, kind: "character-arc", content: "ARC_TWO\n" });
  assert.notEqual(first, second);
  assert.deepEqual(parseStoryCardSections(body).sections.map((section) => [section.id, section.kind]), [[first, "character-arc"], [second, "character-arc"]]);
  assert.equal(readStoryCardContent(body, `markdown-section.${first}`).content.includes("ARC_TWO"), false);
});

test("malformed and over-broad anchors are diagnosed but not interpreted", () => {
  const body = [
    '<!-- world-os:section kind="secret" id="secret-01" -->',
    "## 顺序错误",
    '<!-- world-os:section id="Secret_01" kind="secret" -->',
    "## ID 错误",
    '<!-- world-os:section id="secret-02" kind="secret" -->',
    "plain heading"
  ].join("\n");
  const parsed = parseStoryCardSections(body);
  assert.equal(parsed.sections.length, 0);
  assert.equal(parsed.diagnostics.filter((item) => item.code === "invalid-section-anchor").length, 3);
});
