export const CHARACTER_PROPERTY_TYPES = [
  "text",
  "number",
  "boolean",
  "date-like-text",
  "object-reference",
  "object-reference-list",
  "enum"
] as const;

export type CharacterPropertyType = typeof CHARACTER_PROPERTY_TYPES[number];
export type CharacterPropertyValue = string | number | boolean | string[] | null;

export type CharacterProperty = {
  key: string;
  label: string;
  type: CharacterPropertyType;
  enumOptions: string[];
  value: CharacterPropertyValue;
};

export type CharacterPropertyDiagnostic = {
  code: "invalid-property-field" | "incomplete-property" | "invalid-property-value";
  propertyKey: string | null;
  message: string;
};

export const CHARACTER_SUBTYPE_FIELD = "character_subtype";
export const CHARACTER_PROPERTY_PREFIX = "character_property_";

const PROPERTY_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const PROPERTY_FIELD_PATTERN = /^character_property_([a-z][a-z0-9-]{0,31})_(type|label|options|value)$/u;
const OBJECT_ID_PATTERN = /^(?:character|location|event|item|faction|rule|thread)\.[\p{L}\p{N}][\p{L}\p{N}._-]{0,158}$/u;
const NUMBER_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
const MAX_PROPERTIES = 48;
const MAX_LABEL_LENGTH = 80;
const MAX_VALUE_LENGTH = 320;
const MAX_ENUM_OPTIONS = 32;
const MAX_REFERENCES = 32;

export function parseCharacterProperties(frontmatter: Record<string, unknown>): {
  subtype: string;
  properties: CharacterProperty[];
  diagnostics: CharacterPropertyDiagnostic[];
} {
  const subtype = normalizeSubtype(frontmatter[CHARACTER_SUBTYPE_FIELD]);
  const grouped = new Map<string, Partial<Record<"type" | "label" | "options" | "value", unknown>>>();
  const diagnostics: CharacterPropertyDiagnostic[] = [];

  for (const [field, value] of Object.entries(frontmatter)) {
    if (!field.startsWith(CHARACTER_PROPERTY_PREFIX)) continue;
    const match = PROPERTY_FIELD_PATTERN.exec(field);
    if (!match) {
      diagnostics.push({ code: "invalid-property-field", propertyKey: null, message: `人物属性字段 ${field} 不符合 flat Markdown 合同。` });
      continue;
    }
    const [, key, suffix] = match;
    const values = grouped.get(key) || {};
    values[suffix as "type" | "label" | "options" | "value"] = value;
    grouped.set(key, values);
  }

  if (grouped.size > MAX_PROPERTIES) {
    diagnostics.push({ code: "invalid-property-field", propertyKey: null, message: "人物属性数量超过允许范围。" });
  }

  const properties: CharacterProperty[] = [];
  for (const [key, fields] of grouped) {
    try {
      if (fields.type == null || fields.label == null) throw new Error("人物属性定义缺少 type 或 label。 ");
      properties.push(normalizeCharacterProperty({
        key,
        label: fields.label,
        type: fields.type,
        enumOptions: fields.options == null ? [] : fields.options,
        value: fields.value == null ? null : fields.value
      }));
    } catch (error) {
      diagnostics.push({
        code: fields.type == null || fields.label == null ? "incomplete-property" : "invalid-property-value",
        propertyKey: key,
        message: error instanceof Error ? error.message.trim() : "人物属性定义无效。"
      });
    }
  }

  return { subtype, properties, diagnostics };
}

export function normalizeCharacterProperties(value: unknown): CharacterProperty[] {
  if (!Array.isArray(value) || value.length > MAX_PROPERTIES) throw new Error("Character property count is outside the allowed range.");
  const keys = new Set<string>();
  return value.map((property) => {
    const normalized = normalizeCharacterProperty(property);
    if (keys.has(normalized.key)) throw new Error("Character property keys must be unique.");
    keys.add(normalized.key);
    return normalized;
  });
}

export function normalizeCharacterProperty(value: unknown): CharacterProperty {
  if (!isPlainObject(value)) throw new Error("Character property must be an object.");
  requireExactFields(value, new Set(["key", "label", "type", "enumOptions", "value"]), "Character property");
  const key = requirePropertyKey(value.key);
  const label = requireText(value.label, "Character property label", MAX_LABEL_LENGTH);
  const type = requirePropertyType(value.type);
  const enumOptions = normalizeEnumOptions(value.enumOptions, type);
  const propertyValue = normalizeValue(value.value, type, enumOptions);
  return { key, label, type, enumOptions, value: propertyValue };
}

export function serializeCharacterProperties(propertiesInput: unknown, subtypeInput: unknown): {
  frontmatter: Record<string, string | string[]>;
  propertyKeys: string[];
} {
  const properties = normalizeCharacterProperties(propertiesInput);
  const subtype = normalizeSubtype(subtypeInput);
  const frontmatter: Record<string, string | string[]> = {};
  if (subtype) frontmatter[CHARACTER_SUBTYPE_FIELD] = subtype;
  for (const property of properties) {
    const prefix = `${CHARACTER_PROPERTY_PREFIX}${property.key}_`;
    frontmatter[`${prefix}type`] = property.type;
    frontmatter[`${prefix}label`] = property.label;
    if (property.type === "enum") frontmatter[`${prefix}options`] = [...property.enumOptions];
    if (property.value !== null) {
      frontmatter[`${prefix}value`] = Array.isArray(property.value)
        ? [...property.value]
        : property.type === "boolean"
          ? property.value ? "true" : "false"
          : String(property.value);
    }
  }
  return { frontmatter, propertyKeys: properties.map((property) => property.key) };
}

export function listCharacterPropertyFrontmatterKeys(frontmatter: Record<string, unknown>): string[] {
  return Object.keys(frontmatter).filter((key) => key === CHARACTER_SUBTYPE_FIELD || key.startsWith(CHARACTER_PROPERTY_PREFIX));
}

export function convertCharacterProperty(propertyInput: unknown, nextTypeInput: unknown, options: {
  confirmTextConversion?: boolean;
  selectedReference?: string;
  enumOptions?: string[];
} = {}): CharacterProperty {
  const property = normalizeCharacterProperty(propertyInput);
  const nextType = requirePropertyType(nextTypeInput);
  if (property.type === nextType) {
    return nextType === "enum" && options.enumOptions
      ? changeCharacterPropertyEnumOptions(property, options.enumOptions)
      : property;
  }

  if (property.value === null) {
    const enumOptions = nextType === "enum"
      ? normalizeStringList(options.enumOptions || [], "Enum options", MAX_ENUM_OPTIONS, MAX_LABEL_LENGTH, false)
      : [];
    return normalizeCharacterProperty({
      ...property,
      type: nextType,
      enumOptions,
      value: nextType === "object-reference-list" ? [] : null
    });
  }

  let value: CharacterPropertyValue = property.value;
  if (nextType === "number") {
    if (typeof value !== "string") throw new Error("Current value cannot be converted to a number.");
    value = parseFiniteNumber(value);
  } else if (nextType === "text" || nextType === "date-like-text") {
    if ((property.type === "number" || property.type === "boolean") && !options.confirmTextConversion) {
      throw new Error("Converting this property to text requires explicit confirmation.");
    }
    if (Array.isArray(value)) throw new Error("A reference list cannot be converted to text automatically.");
    value = value == null ? null : String(value);
  } else if (property.type === "object-reference" && nextType === "object-reference-list") {
    value = typeof value === "string" ? [value] : [];
  } else if (property.type === "object-reference-list" && nextType === "object-reference") {
    const references = Array.isArray(value) ? value : [];
    if (references.length > 1 && !options.selectedReference) throw new Error("Choose one reference before converting this list.");
    const selected = options.selectedReference || references[0] || null;
    if (selected && !references.includes(selected)) throw new Error("Selected reference is not in the current list.");
    value = selected;
  } else if (nextType === "enum") {
    const enumOptions = normalizeStringList(options.enumOptions || [], "Enum options", MAX_ENUM_OPTIONS, MAX_LABEL_LENGTH, false);
    if (value != null && (typeof value !== "string" || !enumOptions.includes(value))) throw new Error("Current value is not present in the enum options.");
    return normalizeCharacterProperty({ ...property, type: nextType, enumOptions, value });
  } else if (nextType === "boolean") {
    if (value !== "true" && value !== "false" && value !== null) throw new Error("Current value cannot be converted to a boolean.");
    value = value == null ? null : value === "true";
  } else if (nextType === "object-reference" || nextType === "object-reference-list") {
    if (value !== null) throw new Error("Current value cannot be converted to an object reference without losing data.");
    value = nextType === "object-reference-list" ? [] : null;
  } else {
    throw new Error("Property type conversion is not supported.");
  }

  return normalizeCharacterProperty({ ...property, type: nextType, enumOptions: [], value });
}

export function changeCharacterPropertyEnumOptions(propertyInput: unknown, optionsInput: unknown): CharacterProperty {
  const property = normalizeCharacterProperty(propertyInput);
  if (property.type !== "enum") throw new Error("Only enum properties have options.");
  const enumOptions = normalizeStringList(optionsInput, "Enum options", MAX_ENUM_OPTIONS, MAX_LABEL_LENGTH, false);
  if (property.value !== null && !enumOptions.includes(String(property.value))) {
    throw new Error("Enum options cannot silently remove the selected value.");
  }
  return { ...property, enumOptions };
}

export function normalizeCharacterSubtype(value: unknown): string {
  return normalizeSubtype(value);
}

export function isCharacterObjectId(value: unknown): boolean {
  return OBJECT_ID_PATTERN.test(String(value ?? "").normalize("NFC"));
}

function normalizeValue(value: unknown, type: CharacterPropertyType, enumOptions: string[]): CharacterPropertyValue {
  if (value == null || value === "") return null;
  if (type === "number") {
    if (typeof value === "number") return requireFiniteNumber(value);
    if (typeof value !== "string" || !value || value.length > 80 || /[\u0000-\u001F]/u.test(value)) throw new Error("Number property value is invalid.");
    return parseFiniteNumber(value);
  }
  if (type === "boolean") {
    if (value === true || value === false) return value;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error("Boolean property value must be exactly true or false.");
  }
  if (type === "object-reference-list") return normalizeStringList(value, "Object reference list", MAX_REFERENCES, 160, true).map(requireObjectId);
  if (Array.isArray(value)) throw new Error("Character property value has the wrong shape.");
  const text = requireText(value, "Character property value", MAX_VALUE_LENGTH);
  if (type === "object-reference") return requireObjectId(text);
  if (type === "enum" && !enumOptions.includes(text)) throw new Error("Enum property value is not present in its options.");
  return text;
}

function normalizeEnumOptions(value: unknown, type: CharacterPropertyType): string[] {
  if (type !== "enum") {
    if (Array.isArray(value) && value.length === 0) return [];
    throw new Error("Only enum properties may define enum options.");
  }
  return normalizeStringList(value, "Enum options", MAX_ENUM_OPTIONS, MAX_LABEL_LENGTH, false);
}

function normalizeSubtype(value: unknown): string {
  if (value == null || value === "" || Array.isArray(value)) return "";
  return requireText(value, "Character subtype", 80);
}

function requirePropertyKey(value: unknown): string {
  const key = String(value ?? "").normalize("NFC");
  if (!PROPERTY_KEY_PATTERN.test(key)) throw new Error("Character property key is invalid.");
  return key;
}

function requirePropertyType(value: unknown): CharacterPropertyType {
  const type = String(value ?? "") as CharacterPropertyType;
  if (!CHARACTER_PROPERTY_TYPES.includes(type)) throw new Error("Character property type is not supported.");
  return type;
}

function requireObjectId(value: string): string {
  const objectId = String(value).normalize("NFC");
  if (!OBJECT_ID_PATTERN.test(objectId)) throw new Error("Object reference identifier is invalid.");
  return objectId;
}

function parseFiniteNumber(value: string): number {
  const text = String(value);
  if (text !== text.trim()) throw new Error("Number property value is invalid.");
  if (!NUMBER_PATTERN.test(text)) throw new Error("Number property value is invalid.");
  return requireFiniteNumber(Number(text));
}

function requireFiniteNumber(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Number property value must be finite.");
  return value;
}

function normalizeStringList(value: unknown, label: string, maximumCount: number, maximumLength: number, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || value.length > maximumCount || (!allowEmpty && value.length === 0)) throw new Error(`${label} are outside the allowed range.`);
  const result = value.map((item) => requireText(item, label, maximumLength));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique.`);
  return result;
}

function requireText(value: unknown, label: string, maximumLength: number): string {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maximumLength || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireExactFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains an unknown field: ${key}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
