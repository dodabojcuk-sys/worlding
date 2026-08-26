import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cardPresentationRelativePath,
  deterministicVirtualBlockId,
  readCardPresentation,
  saveCardPresentation,
  validateCardPresentation
} from "../../src/storyWorkspace/cardPresentationRepository.mjs";
import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-card-presentation-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  mkdirSync(path.join(rootPath, "assets/images"), { recursive: true });
  writeFileSync(path.join(rootPath, "assets/images/portrait.png"), "png");
  const objectId = "character.林远";
  const legacyCard = { layout: "horizontal", blocks: ["text", "properties", "media", "connections", "graph"], coverAsset: "assets/images/portrait.png", mediaAssets: ["assets/images/portrait.png"], hasLegacyFields: true };
  const markdownBody = "# 林远\n\nCANARY_CHARACTER_PROSE_A\n\n<!-- world-os:section id=\"secret-01\" kind=\"secret\" -->\n## 秘密\n\nCANARY_SECRET_ALPHA\n";
  return { rootPath, objectId, legacyCard, markdownBody };
}

test("missing companions project deterministic v1 composition without touching disk", () => {
  const input = fixture();
  const first = readCardPresentation(input.rootPath, input);
  const second = readCardPresentation(input.rootPath, input);
  assert.equal(first.virtual, true);
  assert.equal(first.contentHash, null);
  assert.deepEqual(first.document, second.document);
  assert.equal(first.document.blocks[0].id, deterministicVirtualBlockId(input.objectId, "text", 1));
  assert.equal(existsSync(path.join(input.rootPath, "documents/cards")), false);
});

test("first explicit save creates an atomic strict companion with an independent hash and no copied prose", () => {
  const input = fixture();
  const virtual = readCardPresentation(input.rootPath, input);
  const saved = saveCardPresentation(input.rootPath, { ...input, expectedContentHash: null, document: virtual.document });
  assert.equal(saved.ok, true);
  assert.equal(saved.presentation.virtual, false);
  assert.match(saved.presentation.contentHash, /^[a-f0-9]{64}$/);
  const source = readFileSync(path.join(input.rootPath, cardPresentationRelativePath(input.objectId)), "utf8");
  for (const canary of ["CANARY_CHARACTER_PROSE_A", "CANARY_SECRET_ALPHA", "CANARY_RELATION_TEXT", "CANARY_EVENT_TITLE"]) {
    assert.equal(source.includes(canary), false, canary);
  }
  assert.equal(Object.hasOwn(JSON.parse(source), "title"), false);
  assert.equal(existsSync(`${path.join(input.rootPath, cardPresentationRelativePath(input.objectId))}.tmp-${process.pid}`), false);
});

test("presentation supports duplicate arc references and property groups without storing values", () => {
  const input = fixture();
  input.markdownBody += '\n<!-- world-os:section id="arc-01" kind="character-arc" -->\n## 人物弧线\n\nARC_ONE\n\n<!-- world-os:section id="arc-02" kind="character-arc" -->\n## 人物弧线\n\nARC_TWO\n';
  const base = readCardPresentation(input.rootPath, input).document;
  const document = {
    ...base,
    blocks: [
      ...base.blocks,
      { id: "card-block.arc.01", kind: "character-arc", contentRef: "markdown-section.arc-01", collapsed: false, size: "large" },
      { id: "card-block.arc.02", kind: "character-arc", contentRef: "markdown-section.arc-02", collapsed: true, size: "large" },
      { id: "card-block.group.core", kind: "property-group", label: "核心信息", propertyKeys: ["age", "role"], collapsed: false, size: "medium" }
    ]
  };
  const saved = saveCardPresentation(input.rootPath, { ...input, expectedContentHash: null, document });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.presentation.document.blocks.slice(-3).map((block: { kind: string }) => block.kind), ["character-arc", "character-arc", "property-group"]);
  const source = readFileSync(path.join(input.rootPath, cardPresentationRelativePath(input.objectId)), "utf8");
  for (const canary of ["ARC_ONE", "ARC_TWO", "age: 31", "propertyValue"]) assert.equal(source.includes(canary), false);
  assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: { ...document, blocks: [...document.blocks.slice(0, -1), { ...document.blocks.at(-1), value: "secret" }] } }), /unknown field|forbidden/);
});

test("relation groups store bounded stable filters and default-reject copied relationship truth", () => {
  const input = fixture();
  const base = readCardPresentation(input.rootPath, input).document;
  const relationGroup = {
    id: "card-block.relation.core",
    kind: "relation-group",
    label: "核心关系",
    relationConfig: { sourceDocumentIds: ["graph.core"], directions: ["outgoing", "both"], relationTypes: ["member-of"], edgeIds: ["edge.member"] },
    collapsed: false,
    size: "medium"
  };
  const document = { ...base, blocks: [...base.blocks, relationGroup] };
  const normalized = validateCardPresentation(input.rootPath, { objectId: input.objectId, document });
  assert.deepEqual(normalized.blocks.at(-1), relationGroup);
  assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: { ...document, blocks: [...base.blocks, { ...relationGroup, relationConfig: { ...relationGroup.relationConfig, confirmedOnly: false } }] } }), /unknown field/);
  assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: { ...document, blocks: [...base.blocks, { ...relationGroup, relationText: "copied truth" }] } }), /forbidden content field|unknown field/);
  assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: { ...document, blocks: [...base.blocks, { ...relationGroup, relationConfig: { ...relationGroup.relationConfig, sourceDocumentIds: ["../../graph"] } }] } }), /source document is invalid/);
});

test("schema rejects unknown fields, forbidden content, invalid identities, duplicate blocks, and unsafe values", () => {
  const input = fixture();
  const base = readCardPresentation(input.rootPath, input).document;
  const cases: Array<[string, unknown, RegExp]> = [
    ["unknown top", { ...base, future: true }, /unknown field/],
    ["unknown block", { ...base, blocks: [{ ...base.blocks[0], future: true }] }, /unknown field/],
    ["unknown kind", { ...base, blocks: [{ ...base.blocks[0], kind: "agent" }] }, /kind is not supported/],
    ["duplicate id", { ...base, blocks: [base.blocks[0], { ...base.blocks[0] }] }, /duplicate block/],
    ["wrong owner", { ...base, objectId: "character.阿岚" }, /does not match/],
    ["invalid content ref", { ...base, blocks: [{ ...base.blocks[0], contentRef: "../../secret" }] }, /content reference is invalid/],
    ["secret body", { ...base, blocks: [{ ...base.blocks[0], kind: "secret", contentRef: "markdown-body" }] }, /dedicated Markdown section/],
    ["forbidden title", { ...base, title: "林远" }, /forbidden content field|unknown field/],
    ["nested prose", { ...base, visual: { ...base.visual, prose: "copy" } }, /forbidden content field/],
    ["non-finite", { ...base, cover: { assetRef: "assets/images/portrait.png", fit: "cover", position: { x: Number.NaN, y: 0.5 } } }, /non-finite|position is invalid/],
    ["out of bounds", { ...base, cover: { assetRef: "assets/images/portrait.png", fit: "cover", position: { x: 1.1, y: 0.5 } } }, /position is invalid/],
    ["external asset", { ...base, cover: { assetRef: "https://example.com/a.png", fit: "cover", position: { x: 0.5, y: 0.5 } } }, /asset reference is invalid/],
    ["absolute asset", { ...base, cover: { assetRef: "/tmp/a.png", fit: "cover", position: { x: 0.5, y: 0.5 } } }, /asset reference is invalid/]
  ];
  for (const [label, candidate, expected] of cases) {
    assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: candidate }), expected, label);
  }

  for (const key of ["__proto__", "prototype", "constructor"]) {
    const source = `{"version":"story-card-presentation/v2","objectId":"${input.objectId}","preset":"character","layout":"horizontal","portrait":null,"cover":null,"templateRef":null,"blocks":[],"visual":{"density":"comfortable","mediaAssets":[]},"${key}":{}}`;
    const target = path.join(input.rootPath, cardPresentationRelativePath(input.objectId));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
    assert.throws(() => readCardPresentation(input.rootPath, input), /forbidden content field|block count/);
  }
});

test("repository rejects stale hashes, traversal-shaped IDs, symlink companions, and missing or symlink assets", () => {
  const input = fixture();
  const virtual = readCardPresentation(input.rootPath, input);
  const first = saveCardPresentation(input.rootPath, { ...input, expectedContentHash: null, document: virtual.document });
  assert.equal(saveCardPresentation(input.rootPath, { ...input, expectedContentHash: "0".repeat(64), document: virtual.document }).conflict, true);
  for (const objectId of ["../character.lin", "%2e%2e", "/tmp/character.lin", "character.."] ) {
    assert.throws(() => cardPresentationRelativePath(objectId), /identifier is invalid/);
  }
  const missing = { ...first.presentation.document, cover: { assetRef: "assets/images/missing.png", fit: "cover", position: { x: 0.5, y: 0.5 } } };
  assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: missing }), /does not exist/);
  writeFileSync(path.join(input.rootPath, "outside.png"), "png");
  symlinkSync(path.join(input.rootPath, "outside.png"), path.join(input.rootPath, "assets/images/symlink.png"));
  const symlinkAsset = { ...first.presentation.document, cover: { assetRef: "assets/images/symlink.png", fit: "cover", position: { x: 0.5, y: 0.5 } } };
  assert.throws(() => validateCardPresentation(input.rootPath, { objectId: input.objectId, document: symlinkAsset }), /symlink|invalid/i);
});

test("read diagnostics expose missing portrait and cover assets without inventing replacements", () => {
  const input = fixture();
  const virtual = readCardPresentation(input.rootPath, input);
  const document = {
    ...virtual.document,
    portrait: { assetRef: "assets/images/portrait.png", fit: "cover", position: { x: 0.5, y: 0.5 } },
    cover: { assetRef: "assets/images/portrait.png", fit: "contain", position: { x: 0.4, y: 0.6 } }
  };
  saveCardPresentation(input.rootPath, { ...input, expectedContentHash: null, document });
  unlinkSync(path.join(input.rootPath, "assets/images/portrait.png"));
  const read = readCardPresentation(input.rootPath, input);
  assert.deepEqual(read.diagnostics.filter((item: { code: string }) => item.code.includes("-asset")).map((item: { code: string }) => item.code), ["missing-portrait-asset", "missing-cover-asset"]);
  assert.equal(read.document.portrait.assetRef, "assets/images/portrait.png");
  assert.equal(read.document.cover.assetRef, "assets/images/portrait.png");
});

test("repository rejects malformed, oversized, excessive, wrong-version, and symlink companion files without accepting temp residue", () => {
  for (const [label, source, expected] of [
    ["malformed", "{", /malformed/],
    ["wrong version", JSON.stringify({ version: "story-card-presentation/v1" }), /Unsupported/],
    ["oversized", " ".repeat(256 * 1024 + 1), /too large/]
  ] as const) {
    const input = fixture();
    const target = path.join(input.rootPath, cardPresentationRelativePath(input.objectId));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
    assert.throws(() => readCardPresentation(input.rootPath, input), expected, label);
  }

  const excessive = fixture();
  const base = readCardPresentation(excessive.rootPath, excessive).document;
  assert.throws(() => validateCardPresentation(excessive.rootPath, { objectId: excessive.objectId, document: { ...base, blocks: Array.from({ length: 97 }, (_, index) => ({ ...base.blocks[0], id: `card-block.text.${String(index).padStart(2, "0")}` })) } }), /block count/);
  assert.throws(() => validateCardPresentation(excessive.rootPath, { objectId: excessive.objectId, document: { ...base, visual: { ...base.visual, mediaAssets: Array.from({ length: 25 }, (_, index) => `assets/images/${index}.png`) } } }), /media count/);
  assert.throws(() => validateCardPresentation(excessive.rootPath, { objectId: excessive.objectId, document: { ...base, templateRef: `card-template.${"a".repeat(100)}` } }), /template reference is invalid/);

  const symlink = fixture();
  const target = path.join(symlink.rootPath, cardPresentationRelativePath(symlink.objectId));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(path.join(symlink.rootPath, "outside.card.json"), JSON.stringify(base));
  symlinkSync(path.join(symlink.rootPath, "outside.card.json"), target);
  assert.throws(() => readCardPresentation(symlink.rootPath, symlink), /symlink|invalid/i);

  const interrupted = fixture();
  const virtual = readCardPresentation(interrupted.rootPath, interrupted);
  const interruptedTarget = path.join(interrupted.rootPath, cardPresentationRelativePath(interrupted.objectId));
  mkdirSync(path.dirname(interruptedTarget), { recursive: true });
  writeFileSync(`${interruptedTarget}.tmp-${process.pid}`, "partial");
  const saved = saveCardPresentation(interrupted.rootPath, { ...interrupted, expectedContentHash: null, document: virtual.document });
  assert.equal(saved.ok, true);
  assert.equal(JSON.parse(readFileSync(interruptedTarget, "utf8")).version, "story-card-presentation/v2");
  assert.equal(existsSync(`${interruptedTarget}.tmp-${process.pid}`), false);
});
