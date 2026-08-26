import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cardTemplateRelativePath,
  deleteCardTemplate,
  listCardTemplates,
  readCardTemplate,
  saveCardTemplate
} from "../../src/storyWorkspace/cardTemplateRepository.mjs";
import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-card-template-"));
  createStoryWorkspace({ rootPath, title: "Template fixture" });
  const document = {
    version: "story-card-template/v1",
    id: "card-template.investigator",
    label: "Investigator",
    targetType: "character",
    preset: "character",
    sections: [{ slot: "arc-01", kind: "character-arc", label: "Character Arc", repeatable: true }],
    propertyDefinitions: [{ key: "age", label: "Age", type: "number", enumOptions: [] }],
    blocks: [
      { slot: "arc-block", kind: "character-arc", sectionSlot: "arc-01", collapsed: false, size: "large" },
      { slot: "core", kind: "property-group", label: "Core", propertyKeys: ["age"], collapsed: false, size: "medium" }
    ],
    visualDefaults: { layout: "horizontal", density: "comfortable", portraitSlot: true, coverSlot: true }
  };
  return { rootPath, document };
}

test("local card templates have independent hashes, atomic writes, stable list order, conflicts, and delete semantics", () => {
  const input = fixture();
  assert.equal(readCardTemplate(input.rootPath, { templateId: input.document.id }).missing, true);
  const created = saveCardTemplate(input.rootPath, { templateId: input.document.id, expectedContentHash: null, document: input.document });
  assert.equal(created.ok, true);
  assert.match(created.template.contentHash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(listCardTemplates(input.rootPath).map((item) => item.template.id), [input.document.id]);
  assert.equal(saveCardTemplate(input.rootPath, { templateId: input.document.id, expectedContentHash: "0".repeat(64), document: input.document }).conflict, true);
  const updated = saveCardTemplate(input.rootPath, { templateId: input.document.id, expectedContentHash: created.template.contentHash, document: { ...input.document, label: "Investigator v2" } });
  assert.equal(updated.template.template.label, "Investigator v2");
  assert.equal(deleteCardTemplate(input.rootPath, { templateId: input.document.id, expectedContentHash: created.template.contentHash }).conflict, true);
  assert.equal(deleteCardTemplate(input.rootPath, { templateId: input.document.id, expectedContentHash: updated.template.contentHash }).deleted, true);
});

test("template repository rejects traversal, malformed and oversized files, symlinks, and copied content fields", () => {
  const input = fixture();
  for (const templateId of ["../investigator", "card-template...", "card-template.%2e%2e", "/tmp/template", "C:\\template"] ) {
    assert.throws(() => cardTemplateRelativePath(templateId), /identifier is invalid/);
  }
  assert.throws(() => saveCardTemplate(input.rootPath, { templateId: input.document.id, expectedContentHash: null, document: { ...input.document, body: "CANARY_PROSE" } }), /unknown field|forbidden/);
  const target = path.join(input.rootPath, cardTemplateRelativePath(input.document.id));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, "{");
  assert.throws(() => readCardTemplate(input.rootPath, { templateId: input.document.id }), /malformed/);
  writeFileSync(target, " ".repeat(256 * 1024 + 1));
  assert.throws(() => readCardTemplate(input.rootPath, { templateId: input.document.id }), /too large/);
  writeFileSync(path.join(input.rootPath, "outside.json"), "{}");
  writeFileSync(target, "{}");
  const symlinkTarget = path.join(input.rootPath, cardTemplateRelativePath("card-template.symlink"));
  symlinkSync(path.join(input.rootPath, "outside.json"), symlinkTarget);
  assert.throws(() => readCardTemplate(input.rootPath, { templateId: "card-template.symlink" }), /symlink|invalid/i);
  assert.equal(existsSync(`${target}.tmp-${process.pid}`), false);
  assert.equal(readFileSync(path.join(input.rootPath, "outside.json"), "utf8"), "{}");
});

test("template repository rejects symlink directories and file identity mismatches", () => {
  const directoryInput = fixture();
  const outsideDirectory = path.join(directoryInput.rootPath, "outside-templates");
  mkdirSync(outsideDirectory);
  symlinkSync(outsideDirectory, path.join(directoryInput.rootPath, "documents/card-templates"));
  assert.throws(() => listCardTemplates(directoryInput.rootPath), /symlink|invalid/i);
  assert.equal(existsSync(path.join(outsideDirectory, "investigator.card-template.json")), false);

  const identityInput = fixture();
  const target = path.join(identityInput.rootPath, cardTemplateRelativePath("card-template.other"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(identityInput.document, null, 2)}\n`);
  assert.throws(() => readCardTemplate(identityInput.rootPath, { templateId: "card-template.other" }), /does not match/);
});
