export const STORY_STUDIO_OBJECT_PROFILE_VERSION = "story-studio-object-profile/v1" as const;

export const STORY_STUDIO_PROFILE_SOURCES = ["author", "agent", "source-anchor"] as const;
export const STORY_STUDIO_PROFILE_CONFIDENCE = ["high", "medium", "low", "unknown"] as const;

export type StoryStudioObjectProfileObjectType =
  | "character"
  | "item"
  | "location"
  | "faction"
  | "event"
  | "rule"
  | "thread";

export type StoryStudioProfileSource = typeof STORY_STUDIO_PROFILE_SOURCES[number];
export type StoryStudioProfileConfidence = typeof STORY_STUDIO_PROFILE_CONFIDENCE[number];
export type StoryStudioProfileValue = string | string[] | number | boolean | null;

export type StoryStudioProfileField = {
  label: string;
  value: StoryStudioProfileValue;
  source: StoryStudioProfileSource;
  confidence: StoryStudioProfileConfidence;
  sourceAnchors: string[];
};

export type StoryStudioObjectProfile = {
  version: typeof STORY_STUDIO_OBJECT_PROFILE_VERSION;
  objectType: StoryStudioObjectProfileObjectType;
  fields: Record<string, StoryStudioProfileField>;
  unresolvedQuestions: string[];
  warnings: string[];
  authorConfirmed: boolean;
};

export type StoryStudioObjectProfileInput = {
  objectType: StoryStudioObjectProfileObjectType;
  fields?: Record<string, Partial<StoryStudioProfileField> & Pick<StoryStudioProfileField, "label" | "value">>;
  unresolvedQuestions?: string[];
  warnings?: string[];
  authorConfirmed?: boolean;
};

const PROFILE_KEY = /^[a-z][a-z0-9._-]{0,79}$/u;
const MAX_FIELDS = 96;
const MAX_LABEL_LENGTH = 120;
const MAX_TEXT_LENGTH = 4_000;
const MAX_LIST_ITEMS = 64;
const MAX_ANCHORS = 32;

export function normalizeStoryStudioObjectProfile(input: unknown): StoryStudioObjectProfile {
  if (!isRecord(input)) throw new Error("Object profile must be a record.");
  const objectType = normalizeObjectType(input.objectType);
  const fieldsInput = isRecord(input.fields) ? input.fields : {};
  const fieldEntries = Object.entries(fieldsInput);
  if (fieldEntries.length > MAX_FIELDS) throw new Error("Object profile has too many fields.");
  const fields: Record<string, StoryStudioProfileField> = {};
  for (const [key, value] of fieldEntries) {
    if (!PROFILE_KEY.test(key)) throw new Error("Object profile field key is invalid.");
    if (!isRecord(value)) throw new Error("Object profile field is invalid.");
    fields[key] = {
      label: boundedText(value.label, "Object profile field label", MAX_LABEL_LENGTH),
      value: normalizeValue(value.value),
      source: normalizeSource(value.source),
      confidence: normalizeConfidence(value.confidence),
      sourceAnchors: boundedList(value.sourceAnchors, "Object profile source anchors", MAX_ANCHORS, 240)
    };
  }
  return {
    version: STORY_STUDIO_OBJECT_PROFILE_VERSION,
    objectType,
    fields,
    unresolvedQuestions: boundedList(input.unresolvedQuestions, "Object profile unresolved questions", 32, 500),
    warnings: boundedList(input.warnings, "Object profile warnings", 32, 500),
    authorConfirmed: input.authorConfirmed === true
  };
}

export function readStoryStudioObjectProfile(value: unknown, expectedObjectType?: StoryStudioObjectProfileObjectType): StoryStudioObjectProfile | null {
  if (value == null || value === "") return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error("Object profile JSON is invalid.");
    }
  }
  const profile = normalizeStoryStudioObjectProfile(parsed);
  if (expectedObjectType && profile.objectType !== expectedObjectType) throw new Error("Object profile type does not match its World Object.");
  return profile;
}

export function serializeStoryStudioObjectProfile(input: StoryStudioObjectProfileInput | StoryStudioObjectProfile): string {
  return JSON.stringify(normalizeStoryStudioObjectProfile(input));
}

export function profileFromTextFields(objectType: StoryStudioObjectProfileObjectType, fields: Record<string, string>): StoryStudioObjectProfile {
  const normalized: StoryStudioObjectProfileInput = {
    objectType,
    fields: Object.fromEntries(Object.entries(fields)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => [key, { label: profileLabel(key), value: value.trim(), source: "author", confidence: "unknown", sourceAnchors: [] }])),
    authorConfirmed: true
  };
  return normalizeStoryStudioObjectProfile(normalized);
}

function normalizeObjectType(value: unknown): StoryStudioObjectProfileObjectType {
  if (["character", "item", "location", "faction", "event", "rule", "thread"].includes(String(value))) return value as StoryStudioObjectProfileObjectType;
  throw new Error("Object profile type is invalid.");
}

function normalizeSource(value: unknown): StoryStudioProfileSource {
  return STORY_STUDIO_PROFILE_SOURCES.includes(value as StoryStudioProfileSource) ? value as StoryStudioProfileSource : "author";
}

function normalizeConfidence(value: unknown): StoryStudioProfileConfidence {
  return STORY_STUDIO_PROFILE_CONFIDENCE.includes(value as StoryStudioProfileConfidence) ? value as StoryStudioProfileConfidence : "unknown";
}

function normalizeValue(value: unknown): StoryStudioProfileValue {
  if (value == null || value === "") return null;
  if (typeof value === "string") return boundedText(value, "Object profile value", MAX_TEXT_LENGTH);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Object profile number is invalid.");
    return value;
  }
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return boundedList(value, "Object profile value list", MAX_LIST_ITEMS, MAX_TEXT_LENGTH);
  throw new Error("Object profile value is invalid.");
}

function boundedList(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} is invalid.`);
  return [...new Set(value.map((item) => boundedText(item, label, maximumLength)))];
}

function boundedText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = value.normalize("NFC").trim();
  if (!text || [...text].length > maximumLength || /[\u0000-\u001f]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function profileLabel(key: string): string {
  return key.split(/[._-]/u).filter(Boolean).map((part) => part[0].toLocaleUpperCase("en-US") + part.slice(1)).join(" ") || key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
