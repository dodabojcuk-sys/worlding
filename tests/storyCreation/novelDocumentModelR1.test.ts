import assert from "node:assert/strict";
import test from "node:test";

import { appendObjectReference, blockText, childBlocks, createEmptyNovelDocumentModelR1, createNovelDocumentModelR1Fixture, migrateMarkdownToNovelDocumentModelR1, moveSiblingBefore, novelReferenceFixture, replaceBlockInlines, replaceBlockText, replaceBlockTextPreservingReferences, serializeNovelDocumentModelToMarkdown, validateNovelDocumentModelR1 } from "../../src/storyCreation/novelDocumentModelR1.ts";

test("Novel Document Model R1 keeps stable block IDs while paragraphs change", () => {
  const document = createNovelDocumentModelR1Fixture();
  const changed = replaceBlockText(document, "paragraph.roof.2", "他仍没有回头。 ");
  assert.equal(changed.blocks["paragraph.roof.2"].id, "paragraph.roof.2");
  assert.equal(blockText(changed.blocks["paragraph.roof.2"]), "他仍没有回头。 ");
  assert.equal(document.blocks["paragraph.roof.2"].id, "paragraph.roof.2");
});

test("Novel Document Model R1 moves only sibling blocks and retains tree ownership", () => {
  const document = createNovelDocumentModelR1Fixture();
  const moved = moveSiblingBefore(document, "chapter.bell", "chapter.rain");
  assert.deepEqual(childBlocks(moved, "volume.mist").map((block) => block.id), ["chapter.bell", "chapter.rain"]);
  assert.equal(moved.blocks["chapter.bell"].parentId, "volume.mist");
  assert.equal(moveSiblingBefore(document, "scene.tower", "scene.roof"), document);
});

test("Novel Document Model R1 keeps object references semantic and Markdown export deterministic", () => {
  const document = appendObjectReference(createNovelDocumentModelR1Fixture(), "paragraph.roof.2", novelReferenceFixture[1]);
  const markdown = serializeNovelDocumentModelToMarkdown(document);
  assert.match(markdown, /tianyan:block id=paragraph\.roof\.2 kind=paragraph/u);
  assert.match(markdown, /\[临武城\]\(tianyan:\/\/object\/location\/location\.linwu-city\)/u);
  assert.match(markdown, /# 卷一 · 雾落临武/u);
});

test("reviewed prose proposals retain an explicit existing object reference", () => {
  const document = createNovelDocumentModelR1Fixture();
  const accepted = replaceBlockTextPreservingReferences(document, "paragraph.roof.1", "雨水停在瓦檐上，@林海听见马蹄穿过雾。");
  assert.equal(accepted.blocks["paragraph.roof.1"].inlines.some((inline) => inline.kind === "object-ref" && inline.ref.id === "character.lin-hai"), true);
  assert.match(serializeNovelDocumentModelToMarkdown(accepted), /\[林海\]\(tianyan:\/\/object\/character\/character\.lin-hai\)/u);
});

test("Markdown projection imports back into a stable tree without private editor nodes", () => {
  const fixture = createNovelDocumentModelR1Fixture();
  const markdown = serializeNovelDocumentModelToMarkdown(fixture);
  const resolver = new Map(novelReferenceFixture.map((reference) => [reference.id, { type: reference.type, label: reference.label, revision: reference.revision }]));
  const roundTrip = migrateMarkdownToNovelDocumentModelR1(markdown, { documentId: fixture.documentId, title: fixture.title, createdAt: "2026-08-17T00:00:00.000Z", references: resolver });
  assert.equal(roundTrip.title, fixture.title);
  assert.equal(Object.values(roundTrip.blocks).some((block) => block.inlines.some((inline) => inline.kind === "object-ref" && inline.ref.id === "character.lin-hai")), true);
  assert.equal(serializeNovelDocumentModelToMarkdown(roundTrip).includes("ProseMirror"), false);
});

test("DocumentModel validation rejects duplicate, orphan, cycle, hierarchy, and reference errors", () => {
  const fixture = createNovelDocumentModelR1Fixture();
  assert.throws(() => validateNovelDocumentModelR1({ ...fixture, rootIds: ["volume.mist", "volume.mist"] }), /duplicate/u);
  assert.throws(() => validateNovelDocumentModelR1({ ...fixture, blocks: { ...fixture.blocks, orphan: { id: "orphan", kind: "paragraph", parentId: null, inlines: [{ kind: "text", text: "孤儿" }], childIds: [] } } }), /orphan/u);
  assert.throws(() => validateNovelDocumentModelR1({ ...fixture, blocks: { ...fixture.blocks, "volume.mist": { ...fixture.blocks["volume.mist"], childIds: ["volume.mist"] } } }), /missing child|cycle|hierarchy/u);
  assert.throws(() => validateNovelDocumentModelR1({ ...fixture, blocks: { ...fixture.blocks, "chapter.rain": { ...fixture.blocks["chapter.rain"], childIds: ["paragraph.roof.1"] } } }), /hierarchy/u);
  assert.throws(() => validateNovelDocumentModelR1(fixture, { references: new Map([["character.lin-hai", { type: "location" }]]) }), /type mismatch/u);
});

test("inline edits keep an object token atomic and 100k Chinese characters serialise", () => {
  const fixture = createNovelDocumentModelR1Fixture();
  const paragraph = fixture.blocks["paragraph.roof.1"];
  const edited = replaceBlockInlines(fixture, paragraph.id, [{ kind: "text", text: "前" }, paragraph.inlines[1]!, { kind: "text", text: "后" }]);
  const reference = edited.blocks[paragraph.id].inlines.find((inline) => inline.kind === "object-ref");
  assert.equal(reference?.kind, "object-ref");
  assert.equal(reference?.ref.id, "character.lin-hai");
  const blank = createEmptyNovelDocumentModelR1("novel.long", "长篇 smoke", "2026-08-17T00:00:00.000Z");
  const paragraphId = Object.keys(blank.blocks).find((id) => blank.blocks[id]?.kind === "paragraph")!;
  const long = replaceBlockText(blank, paragraphId, "临武城的雾".repeat(20_000));
  assert.ok(serializeNovelDocumentModelToMarkdown(long).length > 100_000);
});
