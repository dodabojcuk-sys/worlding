export const TIANYI_OBJECT_CONTEXT_REF_VERSION = "story-tianyi-object-context-ref/v1" as const;
export const TIANYI_MAX_EXPLICIT_OBJECT_CONTEXT_REFS = 4;

export const TIANYI_OBJECT_OWNER_TYPES = [
  "markdown-object",
  "markdown-writing",
  "visual-map",
  "visual-timeline"
] as const;

export const TIANYI_OBJECT_TYPES = [
  "character",
  "location",
  "event",
  "item",
  "rule",
  "chapter",
  "scene",
  "selection",
  "map-marker",
  "map-region",
  "timeline-event"
] as const;

export type TianyiObjectOwnerType = typeof TIANYI_OBJECT_OWNER_TYPES[number];
export type TianyiObjectType = typeof TIANYI_OBJECT_TYPES[number];
export type TianyiObjectContextState = "current" | "stale" | "missing" | "unauthorized";
export type TianyiObjectContextInclusion = "included" | "excluded";

/**
 * Reference-only context selected by an author. It contains enough identity to
 * re-read the canonical owner, but never stores story prose or visual JSON.
 */
export type TianyiObjectContextRef = {
  version: typeof TIANYI_OBJECT_CONTEXT_REF_VERSION;
  ownerType: TianyiObjectOwnerType;
  objectType: TianyiObjectType;
  stableId: string;
  projectId: string;
  ownerId: string;
  contentHash: string;
  state: TianyiObjectContextState;
  inclusion: TianyiObjectContextInclusion;
  label: string;
};

const STABLE_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u;
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export function normalizeTianyiObjectContextRef(value: unknown): TianyiObjectContextRef {
  const input = plainObject(value, "Tianyi object context reference");
  exact(input, [
    "version", "ownerType", "objectType", "stableId", "projectId", "ownerId",
    "contentHash", "state", "inclusion", "label"
  ], "Tianyi object context reference");
  if (input.version !== TIANYI_OBJECT_CONTEXT_REF_VERSION) throw new Error("Tianyi object context reference version is invalid.");
  return {
    version: TIANYI_OBJECT_CONTEXT_REF_VERSION,
    ownerType: oneOf(input.ownerType, TIANYI_OBJECT_OWNER_TYPES, "Tianyi object owner type"),
    objectType: oneOf(input.objectType, TIANYI_OBJECT_TYPES, "Tianyi object type"),
    stableId: stableId(input.stableId, "Tianyi object stable identifier"),
    projectId: projectId(input.projectId),
    ownerId: stableId(input.ownerId, "Tianyi object owner identifier"),
    contentHash: hash(input.contentHash),
    state: oneOf(input.state, ["current", "stale", "missing", "unauthorized"] as const, "Tianyi object context state"),
    inclusion: oneOf(input.inclusion, ["included", "excluded"] as const, "Tianyi object context inclusion"),
    label: text(input.label, "Tianyi object context label", 120)
  };
}

export function normalizeTianyiObjectContextRefs(value: unknown, maximum = TIANYI_MAX_EXPLICIT_OBJECT_CONTEXT_REFS): TianyiObjectContextRef[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Tianyi object context accepts at most ${maximum} references.`);
  const unique = new Map<string, TianyiObjectContextRef>();
  for (const item of value) {
    const ref = normalizeTianyiObjectContextRef(item);
    const key = tianyiObjectContextRefKey(ref);
    const existing = unique.get(key);
    if (existing && existing.contentHash !== ref.contentHash) throw new Error("Duplicate Tianyi object context references disagree on content hash.");
    if (!existing) unique.set(key, ref);
  }
  return [...unique.values()];
}

export function tianyiObjectContextRefKey(ref: Pick<TianyiObjectContextRef, "projectId" | "ownerType" | "ownerId" | "objectType" | "stableId">): string {
  return `${ref.projectId}:${ref.ownerType}:${ref.ownerId}:${ref.objectType}:${ref.stableId}`;
}

export function withTianyiObjectContextResolution(
  ref: TianyiObjectContextRef,
  state: TianyiObjectContextState,
  inclusion: TianyiObjectContextInclusion
): TianyiObjectContextRef {
  return { ...ref, state, inclusion };
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: string[], label: string): void {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) throw new Error(`${label} fields are invalid.`);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function stableId(value: unknown, label: string): string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function projectId(value: unknown): string {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) throw new Error("Tianyi object context project identifier is invalid.");
  return value;
}

function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error("Tianyi object context hash is invalid.");
  return value;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) throw new Error(`${label} is invalid.`);
  return value.trim();
}
