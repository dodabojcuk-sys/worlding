import assert from "node:assert/strict";
import test from "node:test";

import {
  changeCharacterPropertyEnumOptions,
  convertCharacterProperty,
  listCharacterPropertyFrontmatterKeys,
  normalizeCharacterProperties,
  parseCharacterProperties,
  serializeCharacterProperties
} from "../../src/storyCardPresentation/characterProperties.ts";

test("typed character properties use one readable flat frontmatter contract", () => {
  const properties = normalizeCharacterProperties([
    { key: "summary", label: "简介", type: "text", enumOptions: [], value: "守塔人" },
    { key: "age", label: "年龄", type: "number", enumOptions: [], value: 31 },
    { key: "visible", label: "公开", type: "boolean", enumOptions: [], value: false },
    { key: "birth-date", label: "出生日期", type: "date-like-text", enumOptions: [], value: "雾历十三年" },
    { key: "alignment", label: "立场", type: "enum", enumOptions: ["守序", "游离"], value: "守序" },
    { key: "mentor", label: "导师", type: "object-reference", enumOptions: [], value: "character.阿岚" },
    { key: "allies", label: "盟友", type: "object-reference-list", enumOptions: [], value: ["character.阿岚", "faction.黑塔"] }
  ]);
  const encoded = serializeCharacterProperties(properties, "investigator");
  assert.equal(encoded.frontmatter.character_subtype, "investigator");
  assert.equal(encoded.frontmatter.character_property_age_value, "31");
  assert.equal(encoded.frontmatter.character_property_visible_value, "false");
  assert.deepEqual(encoded.frontmatter.character_property_allies_value, ["character.阿岚", "faction.黑塔"]);
  assert.equal(Object.values(encoded.frontmatter).every((value) => typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string"))), true);

  const parsed = parseCharacterProperties({ ...encoded.frontmatter, custom_external_field: "preserved" });
  assert.equal(parsed.subtype, "investigator");
  assert.deepEqual(parsed.properties, properties);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(listCharacterPropertyFrontmatterKeys({ ...encoded.frontmatter, custom_external_field: "preserved" }).includes("custom_external_field"), false);
});

test("number boolean enum and reference values reject unsafe or lossy input", () => {
  for (const value of ["NaN", "Infinity", "1,000", " 1 "]) {
    assert.throws(() => normalizeCharacterProperties([{ key: "score", label: "数值", type: "number", enumOptions: [], value }]), /Number property/);
  }
  for (const value of ["yes", "0", 1]) {
    assert.throws(() => normalizeCharacterProperties([{ key: "flag", label: "标记", type: "boolean", enumOptions: [], value }]), /Boolean property/);
  }
  assert.throws(() => normalizeCharacterProperties([{ key: "role", label: "身份", type: "enum", enumOptions: ["A"], value: "B" }]), /enum.*options/i);
  assert.throws(() => normalizeCharacterProperties([{ key: "ally", label: "盟友", type: "object-reference", enumOptions: [], value: "阿岚" }]), /identifier/);
  assert.throws(() => normalizeCharacterProperties([{ key: "allies", label: "盟友", type: "object-reference-list", enumOptions: [], value: ["character.a", "character.a"] }]), /unique/);
});

test("property type changes require explicit loss and selection decisions", () => {
  const text = { key: "score", label: "分数", type: "text", enumOptions: [], value: "12.5" };
  assert.equal(convertCharacterProperty(text, "number").value, 12.5);
  const number = { key: "score", label: "分数", type: "number", enumOptions: [], value: 12.5 };
  assert.throws(() => convertCharacterProperty(number, "text"), /confirmation/);
  assert.equal(convertCharacterProperty(number, "text", { confirmTextConversion: true }).value, "12.5");
  const reference = { key: "ally", label: "盟友", type: "object-reference", enumOptions: [], value: "character.a" };
  assert.deepEqual(convertCharacterProperty(reference, "object-reference-list").value, ["character.a"]);
  const list = { key: "allies", label: "盟友", type: "object-reference-list", enumOptions: [], value: ["character.a", "character.b"] };
  assert.throws(() => convertCharacterProperty(list, "object-reference"), /Choose one/);
  assert.equal(convertCharacterProperty(list, "object-reference", { selectedReference: "character.b" }).value, "character.b");
  const empty = { key: "empty", label: "空值", type: "text", enumOptions: [], value: null };
  assert.equal(convertCharacterProperty(empty, "number").value, null);
  assert.deepEqual(convertCharacterProperty(empty, "object-reference-list").value, []);
});

test("enum option edits never silently discard the selected value", () => {
  const property = { key: "role", label: "身份", type: "enum", enumOptions: ["A", "B"], value: "B" };
  assert.throws(() => changeCharacterPropertyEnumOptions(property, ["A"]), /selected value/);
  assert.deepEqual(changeCharacterPropertyEnumOptions(property, ["A", "B", "C"]).enumOptions, ["A", "B", "C"]);
});

test("malformed external flat fields produce diagnostics without inventing values", () => {
  const parsed = parseCharacterProperties({
    character_property_bad_key_type: "text",
    character_property_incomplete_type: "number",
    character_property_flag_type: "boolean",
    character_property_flag_label: "标记",
    character_property_flag_value: "yes"
  });
  assert.equal(parsed.properties.length, 0);
  assert.deepEqual(new Set(parsed.diagnostics.map((item) => item.code)), new Set(["invalid-property-field", "incomplete-property", "invalid-property-value"]));
});
