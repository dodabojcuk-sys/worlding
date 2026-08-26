import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCardTemplate } from "../../src/storyCardPresentation/cardTemplateSchema.ts";
import {
  applyCharacterTemplateDiff,
  buildCharacterTemplateDiff,
  createCardTemplateFromCharacter,
  stableTemplateBlockId,
  type CharacterCardDocument
} from "../../src/storyCardPresentation/characterTemplate.ts";
import { parseStoryCardSections } from "../../src/storyCardPresentation/storyCardSectionAnchors.ts";

function template() {
  return normalizeCardTemplate({
    version: "story-card-template/v1",
    id: "card-template.investigator",
    label: "Investigator",
    targetType: "character",
    preset: "character",
    sections: [
      { slot: "background", kind: "text", label: "Background", repeatable: true },
      { slot: "arc-01", kind: "character-arc", label: "Character Arc", repeatable: true }
    ],
    propertyDefinitions: [
      { key: "age", label: "Age", type: "number", enumOptions: [] },
      { key: "role", label: "Role", type: "enum", enumOptions: ["Keeper", "Outsider"] }
    ],
    blocks: [
      { slot: "background-block", kind: "text", sectionSlot: "background", collapsed: false, size: "large" },
      { slot: "arc-block", kind: "character-arc", sectionSlot: "arc-01", collapsed: false, size: "large" },
      { slot: "core-group", kind: "property-group", label: "Core", propertyKeys: ["age", "role"], collapsed: false, size: "medium" }
    ],
    visualDefaults: { layout: "vertical", density: "compact", portraitSlot: true, coverSlot: true }
  });
}

function card(): CharacterCardDocument {
  return {
    version: "story-card-presentation/v2",
    objectId: "character.lin",
    preset: "character",
    layout: "horizontal",
    portrait: { assetRef: "assets/images/portrait.png", fit: "cover", position: { x: 0.2, y: 0.8 } },
    cover: { assetRef: "assets/images/cover.png", fit: "contain", position: { x: 0.5, y: 0.5 } },
    templateRef: null,
    blocks: [
      { id: "card-block.existing.group", kind: "property-group", label: "Existing", propertyKeys: ["age"], collapsed: true, size: "small" }
    ],
    visual: { density: "comfortable", mediaAssets: ["assets/images/detail.png"] }
  };
}

test("template application is deterministic, missing-only, idempotent, and preserves all authored values and presentation", () => {
  const body = "# Lin\n\nCANARY_PROSE\n";
  const properties = [{ key: "age", label: "Age", type: "number" as const, enumOptions: [], value: 31 }];
  const current = card();
  const firstDiff = buildCharacterTemplateDiff({ objectId: current.objectId, template: template(), body, properties, card: current });
  assert.deepEqual(firstDiff.missingPropertyDefinitions.map((item) => item.key), ["role"]);
  assert.deepEqual(firstDiff.missingSections.map((item) => item.sectionId), ["background", "arc-01"]);
  assert.equal(firstDiff.templateOverwriteCount, 0);

  const applied = applyCharacterTemplateDiff({ body, properties, card: current, template: template(), diff: firstDiff });
  assert.equal(applied.body.includes("CANARY_PROSE"), true);
  assert.equal(applied.properties.find((item) => item.key === "age")?.value, 31);
  assert.equal(applied.properties.find((item) => item.key === "role")?.value, null);
  assert.equal(applied.card.blocks[0].id, "card-block.existing.group");
  assert.equal(applied.card.layout, "horizontal");
  assert.equal(applied.card.visual.density, "comfortable");
  assert.deepEqual(applied.card.portrait, current.portrait);
  assert.deepEqual(applied.card.cover, current.cover);
  assert.deepEqual(parseStoryCardSections(applied.body).sections.map((item) => item.kind), ["text", "character-arc"]);

  const retryDiff = buildCharacterTemplateDiff({ objectId: current.objectId, template: template(), ...applied });
  assert.equal(retryDiff.hasChanges, false);
  assert.deepEqual(retryDiff.missingSections, []);
  assert.deepEqual(retryDiff.missingBlocks, []);
  assert.deepEqual(retryDiff.missingPropertyDefinitions, []);
});

test("property type conflicts are visible and never overwrite existing definitions", () => {
  const properties = [{ key: "age", label: "Age", type: "text" as const, enumOptions: [], value: "unknown" }];
  const diff = buildCharacterTemplateDiff({ objectId: "character.lin", template: template(), body: "# Lin\n", properties, card: card() });
  assert.deepEqual(diff.propertyTypeConflicts, [{ key: "age", existingType: "text", templateType: "number" }]);
  const applied = applyCharacterTemplateDiff({ body: "# Lin\n", properties, card: card(), template: template(), diff });
  assert.equal(applied.properties.find((item) => item.key === "age")?.value, "unknown");
  const templateGroup = applied.card.blocks.find((item) => item.id === stableTemplateBlockId("character.lin", "card-template.investigator", "core-group"));
  assert.deepEqual(templateGroup?.propertyKeys, ["role"]);
});

test("templates extracted from a character contain structure only", () => {
  const body = [
    "# Lin",
    "",
    "CANARY_PROSE",
    '<!-- world-os:section id="arc-01" kind="character-arc" -->',
    "## Secret actual title",
    "",
    "CANARY_ARC_PROSE",
    '<!-- world-os:section id="custom-01" kind="text" -->',
    "## CANARY_EVENT_TITLE",
    "",
    "CANARY_SCENE_PROSE",
    ""
  ].join("\n");
  const properties = [{ key: "secret-name", label: "Alias", type: "text" as const, enumOptions: [], value: "CANARY_VALUE" }];
  const extracted = createCardTemplateFromCharacter({ templateId: "card-template.extracted", label: "Extracted", body, properties, card: card() });
  const source = JSON.stringify(extracted);
  for (const canary of ["CANARY_PROSE", "CANARY_ARC_PROSE", "CANARY_EVENT_TITLE", "CANARY_SCENE_PROSE", "CANARY_VALUE", "portrait.png", "cover.png", "detail.png", "character.lin"]) {
    assert.equal(source.includes(canary), false, canary);
  }
  assert.equal(extracted.sections[0].label, "人物弧线");
  assert.equal(extracted.sections[1].label, "自定义正文");
  assert.equal(extracted.propertyDefinitions[0].key, "secret-name");
  assert.equal(stableTemplateBlockId("character.lin", extracted.id, "core-group"), stableTemplateBlockId("character.lin", extracted.id, "core-group"));
});
