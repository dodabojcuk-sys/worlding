import type { ContinuityContext } from "./continuityFilesystem.ts";
import { readGlobalMemoryGrant, readMemory } from "./memoryGrantRepositories.ts";
import { sha256, stableJson } from "./continuityValidation.ts";

export const TIANYI_CONTEXT_PROJECTION_VERSION = "story-tianyi-context-projection/v1" as const;

export const TIANYI_SOURCE_ORIGINS = [
  "active-owner",
  "shared-selection",
  "writing-guard",
  "locked-rule",
  "unresolved-thread",
  "review-evidence",
  "explicit-memory"
] as const;

export type TianyiSourceOrigin = typeof TIANYI_SOURCE_ORIGINS[number];
export type TianyiProjectionSourceState = "current" | "stale" | "missing" | "unavailable" | "excluded";
export type TianyiProjectionSourceKind =
  | "writing-document"
  | "world-object"
  | "visual-document"
  | "selection"
  | "writing-guard"
  | "locked-rule"
  | "unresolved-thread"
  | "review-evidence"
  | "memory";

export type TianyiProjectionSource = {
  id: string;
  ownerKind: TianyiProjectionSourceKind;
  hash: string;
  label: string;
  state: TianyiProjectionSourceState;
  classification: "story-source" | "rule" | "review-evidence" | "memory";
  origin: TianyiSourceOrigin;
  exclusionReason: string | null;
};

export type TianyiApprovedMemoryRef = {
  id: string;
  scope: "author-global" | "project";
  contentHash: string;
  grantHash: string | null;
};

export type TianyiContextProjection = {
  version: typeof TIANYI_CONTEXT_PROJECTION_VERSION;
  projectId: string;
  productMode: string;
  activeSurface: { ownerKind: "project" | "writing-document" | "world-object" | "visual-document"; ownerId: string | null };
  selection: { documentId: string | null; objectId: string | null; timelinePointId: string | null };
  sources: TianyiProjectionSource[];
  approvedMemoryRefs: TianyiApprovedMemoryRef[];
  persona: { revision: number; contentHash: string };
  relationshipPolicy: { revision: number; contentHash: string };
  enabledSkillRefs: Array<{ id: string; version: string }>;
  runtime: { adapterId: "tianyi.fixture"; adapterVersion: string };
  lockedRuleIds: string[];
  unresolvedThreadIds: string[];
  reviewEvidenceIds: string[];
  fingerprint: string;
};

export type BuildTianyiContextProjectionInput = Omit<TianyiContextProjection, "version" | "fingerprint">;

export type TianyiMemorySelection = { id: string; scope: "author-global" | "project" };

export type TianyiMemoryProjectionResult = {
  sources: TianyiProjectionSource[];
  approvedMemoryRefs: TianyiApprovedMemoryRef[];
};

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SOURCE_STATE = ["current", "stale", "missing", "unavailable", "excluded"] as const;
const SOURCE_KIND = ["writing-document", "world-object", "visual-document", "selection", "writing-guard", "locked-rule", "unresolved-thread", "review-evidence", "memory"] as const;
const SOURCE_CLASSIFICATION = ["story-source", "rule", "review-evidence", "memory"] as const;
const ACTIVE_OWNER_KIND = ["project", "writing-document", "world-object", "visual-document"] as const;
const ORIGIN_PRIORITY = new Map(TIANYI_SOURCE_ORIGINS.map((origin, index) => [origin, index]));

export function buildTianyiContextProjection(input: BuildTianyiContextProjectionInput): TianyiContextProjection {
  const normalized = normalizeProjectionParts(input);
  const withoutFingerprint = {
    version: TIANYI_CONTEXT_PROJECTION_VERSION,
    ...normalized
  };
  return { ...withoutFingerprint, fingerprint: projectionFingerprint(withoutFingerprint) };
}

export function normalizeTianyiContextProjection(value: unknown): TianyiContextProjection {
  const input = plainObject(value, "Tianyi context projection");
  exact(input, [
    "version", "projectId", "productMode", "activeSurface", "selection", "sources", "approvedMemoryRefs",
    "persona", "relationshipPolicy", "enabledSkillRefs", "runtime", "lockedRuleIds", "unresolvedThreadIds",
    "reviewEvidenceIds", "fingerprint"
  ], "Tianyi context projection");
  if (input.version !== TIANYI_CONTEXT_PROJECTION_VERSION) throw new Error("Tianyi context projection version is invalid.");
  const normalized = normalizeProjectionParts(input as unknown as BuildTianyiContextProjectionInput);
  const expected = projectionFingerprint({ version: TIANYI_CONTEXT_PROJECTION_VERSION, ...normalized });
  if (hash(input.fingerprint, "Tianyi projection fingerprint") !== expected) throw new Error("Tianyi context projection fingerprint is invalid.");
  return { version: TIANYI_CONTEXT_PROJECTION_VERSION, ...normalized, fingerprint: expected };
}

export async function resolveTianyiMemoryProjection(input: {
  rootPath: string;
  projectId: string;
  agentId: string;
  selections: TianyiMemorySelection[];
}): Promise<TianyiMemoryProjectionResult> {
  if (!Array.isArray(input.selections) || input.selections.length > 32) throw new Error("Tianyi Memory selection is invalid.");
  const projectId = requireProjectId(input.projectId);
  const agentId = requireId(input.agentId, "Agent identifier");
  const projectContext: ContinuityContext = { rootPath: input.rootPath, agentId, scope: "project", projectId };
  const globalContext: ContinuityContext = { rootPath: input.rootPath, agentId, scope: "author-global" };
  const seen = new Set<string>();
  const sources: TianyiProjectionSource[] = [];
  const approvedMemoryRefs: TianyiApprovedMemoryRef[] = [];

  for (const selection of input.selections) {
    const id = requireId(selection.id, "Memory identifier");
    const scope = selection.scope;
    const key = `${scope}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (scope !== "project" && scope !== "author-global") throw new Error("Memory scope is invalid.");
    const memory = await readMemory(scope === "project" ? projectContext : globalContext, id);
    const base = {
      id,
      ownerKind: "memory" as const,
      hash: memory?.contentHash ?? sha256(`missing:${scope}:${id}`),
      label: `Memory ${id}`,
      classification: "memory" as const,
      origin: "explicit-memory" as const
    };
    if (!memory) {
      sources.push({ ...base, state: "missing", exclusionReason: "memory-missing-or-deleted" });
      continue;
    }
    if (memory.value.state !== "active" || memory.value.approval_state !== "author-approved") {
      sources.push({ ...base, state: "excluded", exclusionReason: "memory-not-active-approved" });
      continue;
    }
    if (memory.value.sensitivity !== "ordinary") {
      sources.push({ ...base, state: "excluded", exclusionReason: `${memory.value.sensitivity}-default-deny` });
      continue;
    }
    if (scope === "project") {
      sources.push({ ...base, state: "current", exclusionReason: null });
      approvedMemoryRefs.push({ id, scope, contentHash: memory.contentHash, grantHash: null });
      continue;
    }
    const grant = await readGlobalMemoryGrant(projectContext, id);
    if (!grant || grant.value.state !== "active") {
      sources.push({ ...base, state: "excluded", exclusionReason: "missing-or-revoked-grant" });
      continue;
    }
    if (grant.value.agentId !== agentId || grant.value.projectId !== projectId || grant.value.memoryId !== id) {
      sources.push({ ...base, state: "excluded", exclusionReason: "grant-owner-mismatch" });
      continue;
    }
    if (grant.value.memoryContentHash !== memory.contentHash) {
      sources.push({ ...base, state: "excluded", exclusionReason: "stale-grant" });
      continue;
    }
    sources.push({ ...base, state: "current", exclusionReason: null });
    approvedMemoryRefs.push({ id, scope, contentHash: memory.contentHash, grantHash: grant.contentHash });
  }

  return {
    sources: sortSources(sources),
    approvedMemoryRefs: approvedMemoryRefs.sort(compareMemoryRefs)
  };
}

export function projectionFingerprint(value: Omit<TianyiContextProjection, "fingerprint">): string {
  return sha256(stableJson(value));
}

function normalizeProjectionParts(input: BuildTianyiContextProjectionInput): Omit<TianyiContextProjection, "version" | "fingerprint"> {
  const active = plainObject(input.activeSurface, "Tianyi active surface");
  exact(active, ["ownerKind", "ownerId"], "Tianyi active surface");
  const selection = plainObject(input.selection, "Tianyi shared selection");
  exact(selection, ["documentId", "objectId", "timelinePointId"], "Tianyi shared selection");
  const persona = revisionRef(input.persona, "Tianyi Persona");
  const relationshipPolicy = revisionRef(input.relationshipPolicy, "Tianyi Relationship Policy");
  const runtime = plainObject(input.runtime, "Tianyi runtime");
  exact(runtime, ["adapterId", "adapterVersion"], "Tianyi runtime");
  if (runtime.adapterId !== "tianyi.fixture") throw new Error("Tianyi runtime adapter is invalid.");

  const sources = array(input.sources, "Tianyi projection sources", 64).map(normalizeSource);
  const uniqueSources = new Map<string, TianyiProjectionSource>();
  for (const source of sortSources(sources)) if (!uniqueSources.has(source.id)) uniqueSources.set(source.id, source);
  const approvedMemoryRefs = array(input.approvedMemoryRefs, "Tianyi approved Memory references", 32).map((value) => {
    const ref = plainObject(value, "Tianyi approved Memory reference");
    exact(ref, ["id", "scope", "contentHash", "grantHash"], "Tianyi approved Memory reference");
    if (ref.scope !== "author-global" && ref.scope !== "project") throw new Error("Tianyi Memory scope is invalid.");
    return {
      id: requireId(ref.id, "Approved Memory identifier"),
      scope: ref.scope,
      contentHash: hash(ref.contentHash, "Approved Memory content hash"),
      grantHash: ref.grantHash === null ? null : hash(ref.grantHash, "Approved Memory grant hash")
    } as TianyiApprovedMemoryRef;
  }).sort(compareMemoryRefs);

  return {
    projectId: requireProjectId(input.projectId),
    productMode: text(input.productMode, "Tianyi product mode", 64),
    activeSurface: {
      ownerKind: oneOf(active.ownerKind, ACTIVE_OWNER_KIND, "Tianyi active owner kind"),
      ownerId: active.ownerId === null ? null : requireId(active.ownerId, "Tianyi active owner identifier")
    },
    selection: {
      documentId: nullableId(selection.documentId, "Selected document identifier"),
      objectId: nullableId(selection.objectId, "Selected object identifier"),
      timelinePointId: nullableId(selection.timelinePointId, "Selected timeline point identifier")
    },
    sources: [...uniqueSources.values()],
    approvedMemoryRefs,
    persona,
    relationshipPolicy,
    enabledSkillRefs: array(input.enabledSkillRefs, "Tianyi enabled Skill references", 32).map((value) => {
      const ref = plainObject(value, "Tianyi enabled Skill reference");
      exact(ref, ["id", "version"], "Tianyi enabled Skill reference");
      return { id: requireId(ref.id, "Skill identifier"), version: text(ref.version, "Skill version", 40) };
    }).sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`)),
    runtime: { adapterId: "tianyi.fixture", adapterVersion: text(runtime.adapterVersion, "Tianyi runtime version", 40) },
    lockedRuleIds: idList(input.lockedRuleIds, "Tianyi locked rules"),
    unresolvedThreadIds: idList(input.unresolvedThreadIds, "Tianyi unresolved threads"),
    reviewEvidenceIds: idList(input.reviewEvidenceIds, "Tianyi review evidence")
  };
}

function normalizeSource(value: unknown): TianyiProjectionSource {
  const source = plainObject(value, "Tianyi projection source");
  exact(source, ["id", "ownerKind", "hash", "label", "state", "classification", "origin", "exclusionReason"], "Tianyi projection source");
  return {
    id: requireId(source.id, "Projection source identifier"),
    ownerKind: oneOf(source.ownerKind, SOURCE_KIND, "Projection source owner kind"),
    hash: hash(source.hash, "Projection source hash"),
    label: text(source.label, "Projection source label", 120),
    state: oneOf(source.state, SOURCE_STATE, "Projection source state"),
    classification: oneOf(source.classification, SOURCE_CLASSIFICATION, "Projection source classification"),
    origin: oneOf(source.origin, TIANYI_SOURCE_ORIGINS, "Projection source origin"),
    exclusionReason: source.exclusionReason === null ? null : requireId(source.exclusionReason, "Projection exclusion reason")
  };
}

function revisionRef(value: unknown, label: string): { revision: number; contentHash: string } {
  const ref = plainObject(value, label);
  exact(ref, ["revision", "contentHash"], label);
  if (!Number.isSafeInteger(ref.revision) || Number(ref.revision) < 1) throw new Error(`${label} revision is invalid.`);
  return { revision: Number(ref.revision), contentHash: hash(ref.contentHash, `${label} hash`) };
}

function sortSources(sources: TianyiProjectionSource[]): TianyiProjectionSource[] {
  return [...sources].sort((left, right) => {
    const priority = Number(ORIGIN_PRIORITY.get(left.origin)) - Number(ORIGIN_PRIORITY.get(right.origin));
    return priority || left.id.localeCompare(right.id);
  });
}

function compareMemoryRefs(left: TianyiApprovedMemoryRef, right: TianyiApprovedMemoryRef): number {
  return `${left.scope}:${left.id}`.localeCompare(`${right.scope}:${right.id}`);
}

function idList(value: unknown, label: string): string[] {
  return [...new Set(array(value, label, 64).map((item) => requireId(item, `${label} identifier`)))].sort();
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  for (const key of Object.keys(value)) if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`${label} contains a dangerous key.`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${label} contains an unknown field.`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing a required field.`);
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > maximum || /[\u0000-\u001F\u007F]/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function requireId(value: unknown, label: string): string {
  const normalized = text(value, label, 96);
  if (!ID_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : requireId(value, label);
}

function requireProjectId(value: unknown): string {
  const normalized = text(value, "Tianyi project identifier", 64);
  if (!PROJECT_ID_PATTERN.test(normalized)) throw new Error("Tianyi project identifier is invalid.");
  return normalized;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new Error(`${label} is invalid.`);
  return value as T[number];
}
