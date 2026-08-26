import {
  CHARACTER_PROPERTY_TYPES,
  type CharacterPropertyType
} from "./characterProperties.ts";

export const CARD_TEMPLATE_VERSION = "story-card-template/v1" as const;
export const CARD_TEMPLATE_TARGET_TYPE = "character" as const;
export const CARD_TEMPLATE_PRESET = "character" as const;
export const CARD_TEMPLATE_SECTION_KINDS = ["text", "secret", "character-arc"] as const;
export const CARD_TEMPLATE_BLOCK_KINDS = [
  "text", "secret", "character-arc", "property-group", "properties",
  "relation-group", "connections", "media", "map", "graph", "timeline", "tree", "canvas"
] as const;

export type CardTemplateSectionKind = typeof CARD_TEMPLATE_SECTION_KINDS[number];
export type CardTemplateBlockKind = typeof CARD_TEMPLATE_BLOCK_KINDS[number];

export type CardTemplateSection = {
  slot: string;
  kind: CardTemplateSectionKind;
  label: string;
  repeatable: boolean;
};

export type CardTemplatePropertyDefinition = {
  key: string;
  label: string;
  type: CharacterPropertyType;
  enumOptions: string[];
};

export type CardTemplateBlock = {
  slot: string;
  kind: CardTemplateBlockKind;
  sectionSlot?: string;
  label?: string;
  propertyKeys?: string[];
  collapsed: boolean;
  size: "small" | "medium" | "large";
};

export type CardTemplate = {
  version: typeof CARD_TEMPLATE_VERSION;
  id: string;
  label: string;
  targetType: typeof CARD_TEMPLATE_TARGET_TYPE;
  preset: typeof CARD_TEMPLATE_PRESET;
  sections: CardTemplateSection[];
  propertyDefinitions: CardTemplatePropertyDefinition[];
  blocks: CardTemplateBlock[];
  visualDefaults: {
    layout: "horizontal" | "vertical";
    density: "comfortable" | "compact";
    portraitSlot: boolean;
    coverSlot: boolean;
  };
};

const TOP_FIELDS = new Set(["version", "id", "label", "targetType", "preset", "sections", "propertyDefinitions", "blocks", "visualDefaults"]);
const SECTION_FIELDS = new Set(["slot", "kind", "label", "repeatable"]);
const PROPERTY_FIELDS = new Set(["key", "label", "type", "enumOptions"]);
const BLOCK_FIELDS = new Set(["slot", "kind", "sectionSlot", "label", "propertyKeys", "collapsed", "size"]);
const VISUAL_FIELDS = new Set(["layout", "density", "portraitSlot", "coverSlot"]);
const TEMPLATE_ID_PATTERN = /^card-template\.[a-z0-9][a-z0-9._-]{0,94}$/u;
const SLOT_PATTERN = /^[a-z][a-z0-9-]{0,47}$/u;
const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const MAX_SECTIONS = 48;
const MAX_PROPERTIES = 48;
const MAX_BLOCKS = 96;
const MAX_ENUM_OPTIONS = 32;
const MAX_LABEL_LENGTH = 80;
const MAX_DEPTH = 8;
const MAX_NODES = 1200;
const MAX_STRING_LENGTH = 320;
const FORBIDDEN_KEYS = new Set([
  "__proto__", "prototype", "constructor", "name", "title", "aliases", "status", "subtype", "tags",
  "value", "propertyValue", "selectedValue", "selectedEnumValue", "body", "prose", "text", "secretText",
  "arcText", "relationshipText", "relationText", "sceneProse", "eventTitle", "objectTitle", "objectId",
  "objectReference", "objectReferences", "portrait", "cover", "assetRef", "imageBytes", "base64", "url",
  "remoteUrl", "prompt", "script", "code", "executable", "parentTemplate", "template", "templates", "inherits"
]);

export function normalizeCardTemplate(value: unknown): CardTemplate {
  assertBoundedTree(value);
  requirePlainObject(value, "Card template");
  requireExactFields(value, TOP_FIELDS, "Card template");
  rejectForbiddenKeys(value);
  if (value.version !== CARD_TEMPLATE_VERSION) throw new Error("Unsupported card template version.");
  const id = requirePattern(value.id, TEMPLATE_ID_PATTERN, "Card template identifier");
  const label = requireText(value.label, "Card template label", MAX_LABEL_LENGTH);
  if (value.targetType !== CARD_TEMPLATE_TARGET_TYPE) throw new Error("Card template target type is not supported.");
  if (value.preset !== CARD_TEMPLATE_PRESET) throw new Error("Card template preset is not supported.");

  const sections = normalizeArray(value.sections, "Card template sections", MAX_SECTIONS).map(normalizeSection);
  requireUnique(sections.map((section) => section.slot), "Card template section slots");
  const properties = normalizeArray(value.propertyDefinitions, "Card template properties", MAX_PROPERTIES).map(normalizeProperty);
  requireUnique(properties.map((property) => property.key), "Card template property keys");
  const blocks = normalizeArray(value.blocks, "Card template blocks", MAX_BLOCKS, false).map(normalizeBlock);
  requireUnique(blocks.map((block) => block.slot), "Card template block slots");
  const visualDefaults = normalizeVisual(value.visualDefaults);

  const sectionBySlot = new Map(sections.map((section) => [section.slot, section]));
  const propertyKeys = new Set(properties.map((property) => property.key));
  for (const block of blocks) {
    if (isContentKind(block.kind)) {
      const section = block.sectionSlot ? sectionBySlot.get(block.sectionSlot) : null;
      if (!section || section.kind !== block.kind) throw new Error("Card template content block must reference a matching section slot.");
    }
    if (block.kind === "property-group" && !block.propertyKeys?.every((key) => propertyKeys.has(key))) {
      throw new Error("Card template property group references an undefined property key.");
    }
  }

  return {
    version: CARD_TEMPLATE_VERSION,
    id,
    label,
    targetType: CARD_TEMPLATE_TARGET_TYPE,
    preset: CARD_TEMPLATE_PRESET,
    sections,
    propertyDefinitions: properties,
    blocks,
    visualDefaults
  };
}

export function cardTemplateFileSegment(templateId: string): string {
  return requirePattern(templateId, TEMPLATE_ID_PATTERN, "Card template identifier").slice("card-template.".length);
}

export function isContentTemplateBlock(kind: CardTemplateBlockKind): boolean {
  return isContentKind(kind);
}

export function requireTemplateSlot(value: unknown): string {
  return requirePattern(value, SLOT_PATTERN, "Card template slot");
}

function normalizeSection(value: unknown): CardTemplateSection {
  requirePlainObject(value, "Card template section");
  requireExactFields(value, SECTION_FIELDS, "Card template section");
  const slot = requirePattern(value.slot, SLOT_PATTERN, "Card template section slot");
  const kind = String(value.kind || "") as CardTemplateSectionKind;
  if (!CARD_TEMPLATE_SECTION_KINDS.includes(kind)) throw new Error("Card template section kind is not supported.");
  const label = requireText(value.label, "Card template section label", MAX_LABEL_LENGTH);
  if (typeof value.repeatable !== "boolean") throw new Error("Card template section repeatable state is invalid.");
  return { slot, kind, label, repeatable: value.repeatable };
}

function normalizeProperty(value: unknown): CardTemplatePropertyDefinition {
  requirePlainObject(value, "Card template property definition");
  requireExactFields(value, PROPERTY_FIELDS, "Card template property definition");
  const key = requirePattern(value.key, PROPERTY_KEY_PATTERN, "Card template property key");
  const label = requireText(value.label, "Card template property label", MAX_LABEL_LENGTH);
  const type = String(value.type || "") as CharacterPropertyType;
  if (!CHARACTER_PROPERTY_TYPES.includes(type)) throw new Error("Card template property type is not supported.");
  const enumOptions = normalizeStringArray(value.enumOptions, "Card template enum options", MAX_ENUM_OPTIONS);
  if (type === "enum" && enumOptions.length === 0) throw new Error("Enum template properties require options.");
  if (type !== "enum" && enumOptions.length > 0) throw new Error("Only enum template properties may have options.");
  return { key, label, type, enumOptions };
}

function normalizeBlock(value: unknown): CardTemplateBlock {
  requirePlainObject(value, "Card template block");
  requireExactFields(value, BLOCK_FIELDS, "Card template block");
  const slot = requirePattern(value.slot, SLOT_PATTERN, "Card template block slot");
  const kind = String(value.kind || "") as CardTemplateBlockKind;
  if (!CARD_TEMPLATE_BLOCK_KINDS.includes(kind)) throw new Error("Card template block kind is not supported.");
  if (typeof value.collapsed !== "boolean") throw new Error("Card template block collapsed state is invalid.");
  const size = value.size === "small" || value.size === "medium" || value.size === "large" ? value.size : null;
  if (!size) throw new Error("Card template block size is invalid.");
  const base = { slot, kind, collapsed: value.collapsed, size };
  if (isContentKind(kind)) {
    if ("label" in value || "propertyKeys" in value) throw new Error("Content template blocks cannot contain property-group fields.");
    return { ...base, sectionSlot: requirePattern(value.sectionSlot, SLOT_PATTERN, "Card template section reference") };
  }
  if (kind === "property-group") {
    if ("sectionSlot" in value) throw new Error("Property groups cannot reference a Markdown section.");
    return {
      ...base,
      label: requireText(value.label, "Card template property-group label", MAX_LABEL_LENGTH),
      propertyKeys: normalizeStringArray(value.propertyKeys, "Card template property-group keys", MAX_PROPERTIES).map((key) => requirePattern(key, PROPERTY_KEY_PATTERN, "Card template property key"))
    };
  }
  if (kind === "relation-group") {
    if ("sectionSlot" in value || "propertyKeys" in value) throw new Error("Relation groups cannot reference Markdown sections or property keys.");
    return { ...base, label: requireText(value.label, "Card template relation-group label", MAX_LABEL_LENGTH) };
  }
  if ("sectionSlot" in value || "label" in value || "propertyKeys" in value) throw new Error("Card template block contains fields that do not apply to its kind.");
  return base;
}

function normalizeVisual(value: unknown): CardTemplate["visualDefaults"] {
  requirePlainObject(value, "Card template visual defaults");
  requireExactFields(value, VISUAL_FIELDS, "Card template visual defaults");
  if (value.layout !== "horizontal" && value.layout !== "vertical") throw new Error("Card template layout is invalid.");
  if (value.density !== "comfortable" && value.density !== "compact") throw new Error("Card template density is invalid.");
  if (typeof value.portraitSlot !== "boolean" || typeof value.coverSlot !== "boolean") throw new Error("Card template image slots are invalid.");
  return { layout: value.layout, density: value.density, portraitSlot: value.portraitSlot, coverSlot: value.coverSlot };
}

function isContentKind(kind: CardTemplateBlockKind): kind is CardTemplateSectionKind {
  return CARD_TEMPLATE_SECTION_KINDS.includes(kind as CardTemplateSectionKind);
}

function normalizeArray(value: unknown, label: string, maximum: number, allowEmpty = true): unknown[] {
  if (!Array.isArray(value) || value.length > maximum || (!allowEmpty && value.length === 0)) throw new Error(`${label} are outside the allowed range.`);
  return value;
}

function normalizeStringArray(value: unknown, label: string, maximum: number, allowEmpty = true): string[] {
  const values = normalizeArray(value, label, maximum, allowEmpty).map((item) => requireText(item, label, MAX_LABEL_LENGTH));
  requireUnique(values, label);
  return values;
}

function assertBoundedTree(value: unknown, depth = 0, counter = { value: 0 }): void {
  counter.value += 1;
  if (depth > MAX_DEPTH || counter.value > MAX_NODES) throw new Error("Card template structure is outside the allowed range.");
  if (typeof value === "string" && value.length > MAX_STRING_LENGTH) throw new Error("Card template string is too long.");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Card template contains a non-finite number.");
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) assertBoundedTree(child, depth + 1, counter);
}

function rejectForbiddenKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Card template contains forbidden field: ${key}`);
    if (typeof child === "string" && /^(?:https?:|data:|blob:|file:)/iu.test(child)) throw new Error("Card template cannot contain remote or executable references.");
    rejectForbiddenKeys(child);
  }
}

function requireExactFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains an unknown field: ${key}`);
}

function requirePlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
}

function requirePattern(value: unknown, pattern: RegExp, label: string): string {
  const text = String(value ?? "").normalize("NFC");
  if (!pattern.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireText(value: unknown, label: string, maximum: number): string {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maximum || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
