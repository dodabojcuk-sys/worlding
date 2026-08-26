import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCardTemplate } from "../../src/storyCardPresentation/cardTemplateSchema.ts";

function template() {
  return {
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
    visualDefaults: { layout: "horizontal", density: "comfortable", portraitSlot: true, coverSlot: true }
  };
}

test("strict card templates accept structure but never content, values, identities, assets, or executable references", () => {
  const normalized = normalizeCardTemplate(template());
  assert.equal(normalized.id, "card-template.investigator");
  assert.deepEqual(normalized.blocks[2].propertyKeys, ["age", "role"]);
  for (const [label, candidate, expected] of [
    ["top prose", { ...template(), prose: "CANARY_PROSE" }, /unknown field|forbidden/],
    ["property value", { ...template(), propertyDefinitions: [{ ...template().propertyDefinitions[0], value: 31 }] }, /unknown field|forbidden/],
    ["asset", { ...template(), visualDefaults: { ...template().visualDefaults, assetRef: "assets\/images\/a.png" } }, /unknown field|forbidden/],
    ["remote", { ...template(), label: "https:\/\/example.com\/template" }, /remote|executable/],
    ["unknown block", { ...template(), blocks: [{ ...template().blocks[0], future: true }] }, /unknown field/],
    ["unsupported kind", { ...template(), blocks: [{ ...template().blocks[0], kind: "agent" }] }, /kind is not supported/]
  ] as const) {
    assert.throws(() => normalizeCardTemplate(candidate), expected, label);
  }
});

test("template slots, definitions, and block references are bounded and internally consistent", () => {
  assert.throws(() => normalizeCardTemplate({ ...template(), id: "..\/investigator" }), /identifier is invalid/);
  assert.throws(() => normalizeCardTemplate({ ...template(), sections: [...template().sections, template().sections[0]] }), /must be unique/);
  assert.throws(() => normalizeCardTemplate({ ...template(), propertyDefinitions: [...template().propertyDefinitions, template().propertyDefinitions[0]] }), /must be unique/);
  assert.throws(() => normalizeCardTemplate({ ...template(), blocks: [{ ...template().blocks[0], sectionSlot: "missing" }] }), /matching section/);
  assert.throws(() => normalizeCardTemplate({ ...template(), blocks: [{ ...template().blocks[2], propertyKeys: ["missing"] }] }), /undefined property/);
  assert.throws(() => normalizeCardTemplate({ ...template(), propertyDefinitions: [{ key: "role", label: "Role", type: "enum", enumOptions: [] }] }), /require options/);
  assert.throws(() => normalizeCardTemplate({ ...template(), blocks: [] }), /allowed range/);
});

test("template schema default-rejects dangerous keys, content values, inheritance, remote data, and excessive structures", () => {
  for (const field of [
    "__proto__", "prototype", "constructor", "value", "selectedEnumValue", "prose", "secretText", "arcText",
    "objectReference", "objectTitle", "relationText", "sceneProse", "eventTitle", "assetRef", "base64", "prompt",
    "script", "code", "executable", "parentTemplate", "template", "inherits"
  ]) {
    const candidate = JSON.parse(JSON.stringify(template())) as Record<string, unknown>;
    Object.defineProperty(candidate, field, { value: "CANARY", enumerable: true, configurable: true });
    assert.throws(() => normalizeCardTemplate(candidate), /unknown field|forbidden/, field);
  }
  assert.throws(() => normalizeCardTemplate({ ...template(), version: "story-card-template/v2" }), /Unsupported/);
  assert.throws(() => normalizeCardTemplate({ ...template(), propertyDefinitions: [{ key: "role", label: "Role", type: "object", enumOptions: [] }] }), /type is not supported/);
  assert.throws(() => normalizeCardTemplate({ ...template(), label: "data:text/plain,CANARY" }), /remote|executable/);
  assert.throws(() => normalizeCardTemplate({ ...template(), label: "x".repeat(321) }), /too long|invalid/);
  assert.throws(() => normalizeCardTemplate({ ...template(), sections: Array.from({ length: 49 }, (_, index) => ({ slot: `section-${index}`, kind: "text", label: "Section", repeatable: true })) }), /outside the allowed range/);
  const recursive: Record<string, unknown> = {};
  let cursor = recursive;
  for (let index = 0; index < 10; index += 1) {
    cursor.child = {};
    cursor = cursor.child as Record<string, unknown>;
  }
  assert.throws(() => normalizeCardTemplate({ ...template(), future: recursive }), /outside the allowed range/);
});
