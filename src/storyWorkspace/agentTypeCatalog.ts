import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync
} from "node:fs";
import path from "node:path";

import { listAgentRecognitionProposals } from "../storyIntelligence/agentRecognitionProposalRepository.ts";
import { listWorkspaceNotes, readWorkspaceNote } from "./storyWorkspaceRepository.mjs";

/**
 * Agent Type Catalog is metadata only. WorldObject Markdown remains the only
 * object owner; this module never stores object payloads or an object->type
 * index. Builtins are virtual and therefore cannot be edited or deleted.
 */
export const AGENT_TYPE_CATALOG_VERSION = "story-agent-type-catalog/v1" as const;
export const AGENT_LIBRARY_PROJECTION_VERSION = "story-agent-library-projection/v1" as const;
export const AGENT_TYPE_CATALOG_RELATIVE_PATH = path.join(".world-os", "agent-types", "catalog.json");

export const AGENT_TYPE_BASE_CAPABILITIES = ["role", "item", "location", "organization"] as const;
export const AGENT_TYPE_FIELD_KINDS = ["text", "longText", "number", "boolean", "date", "enum"] as const;
export const AGENT_TYPE_STATUSES = ["draft", "active", "retired"] as const;

/** Stable flat-frontmatter key used by a future explicit WorldObject binding UI. */
export function agentTypeFieldFrontmatterKey(fieldId: string): string {
  return `agent_field_${normalizeFieldId(fieldId).replaceAll(".", "_")}`;
}

export type AgentTypeBaseCapability = typeof AGENT_TYPE_BASE_CAPABILITIES[number];
export type AgentTypeFieldKind = typeof AGENT_TYPE_FIELD_KINDS[number];
export type AgentTypeStatus = typeof AGENT_TYPE_STATUSES[number];

export type AgentTypeFieldDefinition = {
  fieldId: string;
  label: string;
  kind: AgentTypeFieldKind;
  description: string;
  required: boolean;
  defaultValue: string | number | boolean | null;
  status: "active" | "retired";
  displayOrder: number;
  options?: string[];
};

export type AgentTypeProvenance = {
  kind: "author" | "migration" | "system";
  sourceRef?: string;
};

export type AgentTypeDefinition = {
  typeId: string;
  label: string;
  description: string;
  baseCapability: AgentTypeBaseCapability;
  fieldDefinitions: AgentTypeFieldDefinition[];
  status: AgentTypeStatus;
  revision: number;
  provenance: AgentTypeProvenance;
  createdAt: string;
  updatedAt: string;
  builtin: boolean;
};

type PersistedAgentType = Omit<AgentTypeDefinition, "builtin">;

export type AgentTypeCatalog = {
  version: typeof AGENT_TYPE_CATALOG_VERSION;
  revision: number;
  types: AgentTypeDefinition[];
  customTypes: AgentTypeDefinition[];
  source: "virtual" | "catalog-json";
  contentHash: string | null;
  path: string;
};

export type AgentTypeObjectReference = {
  objectId: string;
  objectRevision: string;
  relativePath: string;
  title: string;
  sourceType: string;
  typeId: string;
  typeRevision: number;
};

export type AgentTypeResolution = {
  objectId: string;
  objectRevision: string;
  relativePath: string;
  title: string;
  sourceType: string;
  state: "classified" | "uncertain";
  typeId: string | null;
  typeRevision: number | null;
  explicitBinding: boolean;
  reason: string | null;
};

export type AgentTypeDirectory = {
  typeId: string;
  label: string;
  description: string;
  baseCapability: AgentTypeBaseCapability;
  status: AgentTypeStatus;
  typeRevision: number;
  count: number;
  objects: AgentTypeObjectReference[];
};

export type ClassifiedAgentLibraryProjection = {
  version: typeof AGENT_LIBRARY_PROJECTION_VERSION;
  catalogRevision: number;
  directories: AgentTypeDirectory[];
};

export type UncertainAgentLibraryItem =
  | ({ kind: "world-object" } & Pick<AgentTypeResolution, "objectId" | "objectRevision" | "relativePath" | "title" | "sourceType" | "reason">)
  | {
    kind: "agent-recognition-proposal";
    proposalId: string;
    revision: number;
    objectKind: string;
    suggestedName: string;
    status: string;
    sourceEventId: string;
  };

export type UncertainAgentLibraryProjection = {
  version: typeof AGENT_LIBRARY_PROJECTION_VERSION;
  catalogRevision: number;
  items: UncertainAgentLibraryItem[];
};

const CATALOG_MAX_BYTES = 2 * 1024 * 1024;
const TYPE_ID_PATTERN = /^agent\.custom\.[a-z0-9][a-z0-9._-]{2,95}$/u;
const FIELD_ID_PATTERN = /^field\.[a-z0-9][a-z0-9._-]{2,95}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_TYPES = 256;
const MAX_FIELDS = 64;
const BUILTIN_WORLD_TYPES: Record<AgentTypeBaseCapability, readonly string[]> = {
  role: ["character"],
  item: ["item"],
  location: ["location"],
  organization: ["faction"]
};

const BUILTIN_AGENT_TYPES: readonly AgentTypeDefinition[] = [
  builtin("agent.role", "角色", "面向作者的角色目录。", "role"),
  builtin("agent.item", "物品", "面向作者的物品目录。", "item"),
  builtin("agent.location", "地点", "面向作者的地点目录。", "location"),
  builtin("agent.organization", "组织", "面向作者的组织目录。", "organization")
];

const BUILTIN_BY_ID = new Map(BUILTIN_AGENT_TYPES.map((type) => [type.typeId, type]));
const BUILTIN_ORDER = new Map(BUILTIN_AGENT_TYPES.map((type, index) => [type.typeId, index]));

export function readAgentTypeCatalog(rootPath: string): AgentTypeCatalog {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const catalogPath = path.join(root, AGENT_TYPE_CATALOG_RELATIVE_PATH);
  if (!existsSync(catalogPath)) {
    return clone({
      version: AGENT_TYPE_CATALOG_VERSION,
      revision: 0,
      types: BUILTIN_AGENT_TYPES,
      customTypes: [],
      source: "virtual" as const,
      contentHash: null,
      path: catalogPath
    });
  }
  assertNoSymlinkSegments(root, catalogPath, false);
  const source = readFileSync(catalogPath, "utf8");
  if (Buffer.byteLength(source, "utf8") > CATALOG_MAX_BYTES) throw new Error("Agent Type Catalog is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("Agent Type Catalog JSON is malformed.");
  }
  const normalized = normalizePersistedCatalog(parsed);
  const customTypes = normalized.types.map((type) => ({ ...type, builtin: false as const }));
  return clone({
    version: AGENT_TYPE_CATALOG_VERSION,
    revision: normalized.revision,
    types: sortTypes([...BUILTIN_AGENT_TYPES, ...customTypes]),
    customTypes,
    source: "catalog-json" as const,
    contentHash: sha256(source),
    path: catalogPath
  });
}

export function listAgentTypes(rootPath: string): AgentTypeDefinition[] {
  return clone(readAgentTypeCatalog(rootPath).types);
}

export function getAgentType(rootPath: string, typeId: string): AgentTypeDefinition | null {
  const normalizedId = normalizeTypeId(typeId);
  return clone(readAgentTypeCatalog(rootPath).types.find((type) => type.typeId === normalizedId) || null);
}

export function createAgentType(rootPath: string, input: {
  label: string;
  description?: string;
  baseCapability: AgentTypeBaseCapability;
  fieldDefinitions?: Array<Partial<AgentTypeFieldDefinition> & { label: string; kind: AgentTypeFieldKind }>;
  status?: AgentTypeStatus;
  provenance?: AgentTypeProvenance;
  expectedCatalogRevision?: number;
  expectedRevision?: number;
  now?: string;
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const current = readAgentTypeCatalog(root);
  assertExpectedCatalogRevision(current.revision, input.expectedCatalogRevision ?? input.expectedRevision, current.source === "virtual");
  const label = normalizeLabel(input.label);
  const baseCapability = requireBaseCapability(input.baseCapability);
  assertActiveLabelAvailable(current.types, label);
  const now = normalizeTimestamp(input.now || new Date().toISOString(), "createdAt");
  const seed = `${label}|${baseCapability}|${now}|${randomUUID()}`;
  const typeId = `agent.custom.${sha256(seed).slice(0, 24)}`;
  const type: AgentTypeDefinition = {
    typeId,
    label,
    description: normalizeDescription(input.description),
    baseCapability,
    fieldDefinitions: normalizeFieldDefinitions(input.fieldDefinitions || [], 0, now),
    status: normalizeStatus(input.status || "draft"),
    revision: 1,
    provenance: normalizeProvenance(input.provenance || { kind: "author", sourceRef: "agent-type-catalog" }),
    createdAt: now,
    updatedAt: now,
    builtin: false
  };
  const next = writeCatalog(root, current, [...current.customTypes, type]);
  return { catalogRevision: next.revision, type: clone(type) };
}

export function updateAgentType(rootPath: string, input: {
  typeId: string;
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
  label?: string;
  description?: string;
  baseCapability?: AgentTypeBaseCapability;
  fieldDefinitions?: Array<Partial<AgentTypeFieldDefinition> & { fieldId?: string; label: string; kind: AgentTypeFieldKind }>;
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const current = readAgentTypeCatalog(root);
  const typeId = normalizeTypeId(input.typeId);
  const existing = requireCustomType(current, typeId);
  assertExpectedCatalogRevision(current.revision, input.expectedCatalogRevision, false);
  assertExpectedTypeRevision(existing.revision, input.expectedTypeRevision ?? input.expectedRevision);
  const bound = findBoundWorldObjects(root, typeId);
  const baseCapability = input.baseCapability === undefined ? existing.baseCapability : requireBaseCapability(input.baseCapability);
  if (bound.length > 0 && baseCapability !== existing.baseCapability) {
    throw new Error("Agent Type baseCapability is immutable after an object is bound.");
  }
  const label = input.label === undefined ? existing.label : normalizeLabel(input.label);
  if (label !== existing.label) assertActiveLabelAvailable(current.types, label, typeId);
  const fields = input.fieldDefinitions === undefined
    ? existing.fieldDefinitions
    : reconcileFieldDefinitions(existing, input.fieldDefinitions, root);
  const updated: AgentTypeDefinition = {
    ...existing,
    label,
    description: input.description === undefined ? existing.description : normalizeDescription(input.description),
    baseCapability,
    fieldDefinitions: fields,
    revision: existing.revision + 1,
    updatedAt: normalizeTimestamp(new Date().toISOString(), "updatedAt")
  };
  const next = writeCatalog(root, current, current.customTypes.map((type) => type.typeId === typeId ? updated : type));
  return { catalogRevision: next.revision, type: clone(updated) };
}

/** Draft activation is explicit so authoring clients cannot smuggle a status
 * transition through the general metadata editor. */
export function activateAgentType(rootPath: string, input: {
  typeId: string;
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const current = readAgentTypeCatalog(root);
  const typeId = normalizeTypeId(input.typeId);
  const existing = requireCustomType(current, typeId);
  assertExpectedCatalogRevision(current.revision, input.expectedCatalogRevision, false);
  assertExpectedTypeRevision(existing.revision, input.expectedTypeRevision ?? input.expectedRevision);
  if (existing.status === "active") return { catalogRevision: current.revision, type: clone(existing) };
  if (existing.status !== "draft") throw new Error("Only a draft Agent Type can be activated.");
  assertActiveLabelAvailable(current.types, existing.label, existing.typeId);
  const updated = { ...existing, status: "active" as const, revision: existing.revision + 1, updatedAt: new Date().toISOString() };
  const next = writeCatalog(root, current, current.customTypes.map((type) => type.typeId === typeId ? updated : type));
  return { catalogRevision: next.revision, type: clone(updated) };
}

export function retireAgentType(rootPath: string, input: {
  typeId: string;
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const current = readAgentTypeCatalog(root);
  const typeId = normalizeTypeId(input.typeId);
  const existing = requireCustomType(current, typeId);
  assertExpectedCatalogRevision(current.revision, input.expectedCatalogRevision, false);
  assertExpectedTypeRevision(existing.revision, input.expectedTypeRevision ?? input.expectedRevision);
  if (existing.status === "retired") return { catalogRevision: current.revision, type: clone(existing) };
  const updated = { ...existing, status: "retired" as const, revision: existing.revision + 1, updatedAt: new Date().toISOString() };
  const next = writeCatalog(root, current, current.customTypes.map((type) => type.typeId === typeId ? updated : type));
  return { catalogRevision: next.revision, type: clone(updated) };
}

export function deleteAgentType(rootPath: string, input: {
  typeId: string;
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
}): { catalogRevision: number; deletedTypeId: string } {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const current = readAgentTypeCatalog(root);
  const typeId = normalizeTypeId(input.typeId);
  const existing = requireCustomType(current, typeId);
  assertExpectedCatalogRevision(current.revision, input.expectedCatalogRevision, false);
  assertExpectedTypeRevision(existing.revision, input.expectedTypeRevision ?? input.expectedRevision);
  if (existing.status !== "draft") throw new Error("Only an unused draft Agent Type can be deleted.");
  if (findBoundWorldObjects(root, typeId).length > 0) throw new Error("A bound Agent Type cannot be deleted; retire it instead.");
  writeCatalog(root, current, current.customTypes.filter((type) => type.typeId !== typeId));
  return { catalogRevision: current.revision + 1, deletedTypeId: typeId };
}

export function addAgentTypeField(rootPath: string, input: {
  typeId: string;
  field: Partial<AgentTypeFieldDefinition> & { label: string; kind: AgentTypeFieldKind };
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const current = requireCustomTypeWithRevision(rootPath, input);
  if (current.type.fieldDefinitions.some((field) => field.status === "active" && sameLabel(field.label, input.field.label))) {
    throw new Error("Agent Type field label already exists.");
  }
  const usedIds = new Set(current.type.fieldDefinitions.map((field) => field.fieldId));
  const now = new Date().toISOString();
  const normalized = normalizeFieldDefinition(input.field, current.type.fieldDefinitions.length, now, usedIds);
  return updateAgentType(rootPath, {
    typeId: input.typeId,
    expectedTypeRevision: current.type.revision,
    expectedCatalogRevision: current.catalogRevision,
    fieldDefinitions: [...current.type.fieldDefinitions, normalized]
  });
}

export function updateAgentTypeField(rootPath: string, input: {
  typeId: string;
  fieldId: string;
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
  label?: string;
  description?: string;
  required?: boolean;
  defaultValue?: AgentTypeFieldDefinition["defaultValue"];
  displayOrder?: number;
  options?: string[];
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const current = requireCustomTypeWithRevision(rootPath, input);
  const fieldId = normalizeFieldId(input.fieldId);
  const field = current.type.fieldDefinitions.find((candidate) => candidate.fieldId === fieldId);
  if (!field) throw new Error(`Agent Type field does not exist: ${fieldId}.`);
  const used = fieldUsedByWorldObjects(current.root, fieldId);
  const nextField: AgentTypeFieldDefinition = {
    ...field,
    label: input.label === undefined ? field.label : normalizeLabel(input.label),
    description: input.description === undefined ? field.description : normalizeDescription(input.description),
    required: input.required === undefined ? field.required : Boolean(input.required),
    defaultValue: input.defaultValue === undefined ? field.defaultValue : normalizeDefaultValue(field.kind, input.defaultValue, field.options),
    displayOrder: input.displayOrder === undefined ? field.displayOrder : normalizeDisplayOrder(input.displayOrder),
    options: input.options === undefined ? field.options : normalizeEnumOptions(field.kind, input.options)
  };
  if (used && (nextField.kind !== field.kind || nextField.required !== field.required || nextField.defaultValue !== field.defaultValue || JSON.stringify(nextField.options) !== JSON.stringify(field.options))) {
    throw new Error("An Agent Type field in use can only change label, description, or displayOrder; retire it instead.");
  }
  return updateAgentType(rootPath, {
    typeId: input.typeId,
    expectedTypeRevision: current.type.revision,
    expectedCatalogRevision: current.catalogRevision,
    fieldDefinitions: current.type.fieldDefinitions.map((candidate) => candidate.fieldId === fieldId ? nextField : candidate)
  });
}

export function retireAgentTypeField(rootPath: string, input: {
  typeId: string;
  fieldId: string;
  expectedTypeRevision?: number;
  expectedRevision?: number;
  expectedCatalogRevision?: number;
}): { catalogRevision: number; type: AgentTypeDefinition } {
  const current = requireCustomTypeWithRevision(rootPath, input);
  const fieldId = normalizeFieldId(input.fieldId);
  if (!current.type.fieldDefinitions.some((field) => field.fieldId === fieldId)) throw new Error(`Agent Type field does not exist: ${fieldId}.`);
  return updateAgentType(rootPath, {
    typeId: input.typeId,
    expectedTypeRevision: current.type.revision,
    expectedCatalogRevision: current.catalogRevision,
    fieldDefinitions: current.type.fieldDefinitions.map((field) => field.fieldId === fieldId ? { ...field, status: "retired" as const } : field)
  });
}

export function resolveAgentTypeForWorldObject(rootPath: string, objectId: string): AgentTypeResolution {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const normalizedObjectId = normalizeObjectId(objectId);
  const note = listWorkspaceNotes(root).find((candidate) => candidate.id === normalizedObjectId);
  if (!note) throw new Error(`WorldObject does not exist: ${normalizedObjectId}.`);
  return resolveNote(root, readAgentTypeCatalog(root), note);
}

export function listWorldObjectsByAgentType(rootPath: string, typeId: string): AgentTypeObjectReference[] {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const catalog = readAgentTypeCatalog(root);
  const type = catalog.types.find((candidate) => candidate.typeId === normalizeAnyTypeId(typeId));
  if (!type) throw new Error(`Agent Type does not exist: ${typeId}.`);
  return listWorkspaceNotes(root)
    .map((note) => resolveNote(root, catalog, note))
    .filter((resolution) => resolution.state === "classified" && resolution.typeId === type.typeId)
    .map((resolution) => ({
      objectId: resolution.objectId,
      objectRevision: resolution.objectRevision,
      relativePath: resolution.relativePath,
      title: resolution.title,
      sourceType: resolution.sourceType,
      typeId: type.typeId,
      typeRevision: type.revision
    }))
    .sort(compareObjectReferences);
}

export function countWorldObjectsByAgentType(rootPath: string, typeId: string): number {
  return listWorldObjectsByAgentType(rootPath, typeId).length;
}

export function listClassifiedLibraryProjection(rootPath: string): ClassifiedAgentLibraryProjection {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const catalog = readAgentTypeCatalog(root);
  const directories = sortTypes(catalog.types)
    .filter((type) => type.builtin || type.status === "active" || type.status === "retired")
    .map((type) => {
      const objects = listWorldObjectsByAgentType(root, type.typeId);
      return {
        typeId: type.typeId,
        label: type.label,
        description: type.description,
        baseCapability: type.baseCapability,
        status: type.status,
        typeRevision: type.revision,
        count: objects.length,
        objects
      };
    });
  return { version: AGENT_LIBRARY_PROJECTION_VERSION, catalogRevision: catalog.revision, directories };
}

export async function listUncertainLibraryProjection(rootPath: string, projectId?: string): Promise<UncertainAgentLibraryProjection> {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const catalog = readAgentTypeCatalog(root);
  const items: UncertainAgentLibraryItem[] = listWorkspaceNotes(root)
    .map((note) => resolveNote(root, catalog, note))
    .filter((resolution) => resolution.state === "uncertain")
    .map((resolution) => ({
      kind: "world-object" as const,
      objectId: resolution.objectId,
      objectRevision: resolution.objectRevision,
      relativePath: resolution.relativePath,
      title: resolution.title,
      sourceType: resolution.sourceType,
      reason: resolution.reason || "agent-type-uncertain"
    }));
  if (projectId) {
    const proposals = await listAgentRecognitionProposals({ workspacePath: root, projectId });
    for (const proposal of proposals) {
      if (["confirmed", "merged", "ignored"].includes(proposal.status)) continue;
      items.push({
        kind: "agent-recognition-proposal",
        proposalId: proposal.proposalId,
        revision: proposal.revision,
        objectKind: proposal.objectKind,
        suggestedName: proposal.suggestedName,
        status: proposal.status,
        sourceEventId: proposal.sourceEventId
      });
    }
  }
  items.sort((left, right) => uncertainLabel(left).localeCompare(uncertainLabel(right), "zh-CN") || uncertainIdentity(left).localeCompare(uncertainIdentity(right)));
  return { version: AGENT_LIBRARY_PROJECTION_VERSION, catalogRevision: catalog.revision, items };
}

function requireCustomTypeWithRevision(rootPath: string, input: { typeId: string; expectedCatalogRevision?: number; expectedTypeRevision?: number; expectedRevision?: number }): { root: string; catalogRevision: number; type: AgentTypeDefinition } {
  const root = prepareWorkspaceRootForCatalog(rootPath);
  const catalog = readAgentTypeCatalog(root);
  const type = requireCustomType(catalog, normalizeTypeId(input.typeId));
  assertExpectedCatalogRevision(catalog.revision, input.expectedCatalogRevision, false);
  assertExpectedTypeRevision(type.revision, input.expectedTypeRevision ?? input.expectedRevision);
  return { root, catalogRevision: catalog.revision, type };
}

function reconcileFieldDefinitions(existing: AgentTypeDefinition, input: Array<Partial<AgentTypeFieldDefinition> & { fieldId?: string; label: string; kind: AgentTypeFieldKind }>, root: string): AgentTypeFieldDefinition[] {
  const now = new Date().toISOString();
  const incoming = normalizeFieldDefinitions(input, 0, now);
  const incomingIds = new Set(incoming.map((field) => field.fieldId));
  for (const field of existing.fieldDefinitions) {
    if (!incomingIds.has(field.fieldId)) {
      if (fieldUsedByWorldObjects(root, field.fieldId)) throw new Error("An Agent Type field in use cannot be deleted; retire it instead.");
      throw new Error("Agent Type field deletion is explicit; use retireAgentTypeField.");
    }
  }
  return incoming.map((field) => {
    const previous = existing.fieldDefinitions.find((candidate) => candidate.fieldId === field.fieldId);
    if (!previous) return field;
    if (fieldUsedByWorldObjects(root, field.fieldId) && (
      field.kind !== previous.kind ||
      field.required !== previous.required ||
      field.defaultValue !== previous.defaultValue ||
      JSON.stringify(field.options) !== JSON.stringify(previous.options)
    )) throw new Error("An Agent Type field in use can only change label, description, displayOrder, or be retired.");
    return { ...field, status: previous.status === "retired" ? "retired" : field.status };
  });
}

function normalizePersistedCatalog(value: unknown): { revision: number; types: PersistedAgentType[] } {
  const object = requirePlainObject(value, "Agent Type Catalog");
  exactKeys(object, ["version", "revision", "types"], "Agent Type Catalog");
  if (object.version !== AGENT_TYPE_CATALOG_VERSION) throw new Error("Agent Type Catalog version is unsupported.");
  const revision = positiveOrZeroInteger(object.revision, "Catalog revision");
  if (!Array.isArray(object.types) || object.types.length > MAX_TYPES) throw new Error("Agent Type Catalog types are invalid.");
  const types = object.types.map((type) => normalizePersistedType(type));
  const ids = new Set<string>();
  for (const type of types) {
    if (BUILTIN_BY_ID.has(type.typeId)) throw new Error("Builtin Agent Types are virtual and immutable.");
    if (ids.has(type.typeId)) throw new Error("Agent Type identifiers must be unique.");
    ids.add(type.typeId);
  }
  const allTypes = [...BUILTIN_AGENT_TYPES, ...types.map((type) => ({ ...type, builtin: false as const }))];
  for (const type of types) assertActiveLabelAvailable(allTypes, type.label, type.typeId);
  return { revision, types };
}

function normalizePersistedType(value: unknown): PersistedAgentType {
  const object = requirePlainObject(value, "Agent Type");
  exactKeys(object, ["typeId", "label", "description", "baseCapability", "fieldDefinitions", "status", "revision", "provenance", "createdAt", "updatedAt"], "Agent Type");
  const typeId = normalizeTypeId(String(object.typeId));
  const type: PersistedAgentType = {
    typeId,
    label: normalizeLabel(String(object.label)),
    description: normalizeDescription(object.description),
    baseCapability: requireBaseCapability(object.baseCapability),
    fieldDefinitions: normalizeFieldDefinitionsFromPersisted(object.fieldDefinitions),
    status: normalizeStatus(object.status),
    revision: positiveInteger(object.revision, "Agent Type revision"),
    provenance: normalizeProvenance(object.provenance),
    createdAt: normalizeTimestamp(String(object.createdAt), "createdAt"),
    updatedAt: normalizeTimestamp(String(object.updatedAt), "updatedAt")
  };
  if (type.updatedAt < type.createdAt) throw new Error("Agent Type updatedAt precedes createdAt.");
  return type;
}

function normalizeFieldDefinitionsFromPersisted(value: unknown): AgentTypeFieldDefinition[] {
  if (!Array.isArray(value) || value.length > MAX_FIELDS) throw new Error("Agent Type fieldDefinitions are invalid.");
  const fields = value.map((item, index) => normalizeFieldDefinition(item, index, new Date(0).toISOString(), new Set(), true));
  const ids = new Set<string>();
  for (const field of fields) {
    if (ids.has(field.fieldId)) throw new Error("Agent Type field identifiers must be unique.");
    ids.add(field.fieldId);
  }
  return fields;
}

function normalizeFieldDefinitions(input: Array<Partial<AgentTypeFieldDefinition> & { label: string; kind: AgentTypeFieldKind }>, baseOrder: number, now: string): AgentTypeFieldDefinition[] {
  if (!Array.isArray(input) || input.length > MAX_FIELDS) throw new Error("Agent Type fieldDefinitions are invalid.");
  const ids = new Set<string>();
  return input.map((field, index) => normalizeFieldDefinition(field, baseOrder + index, now, ids, false));
}

function normalizeFieldDefinition(value: unknown, index: number, now: string, usedIds: Set<string>, requireStableFieldId: boolean): AgentTypeFieldDefinition {
  const object = requirePlainObject(value, "Agent Type field");
  const allowed = ["fieldId", "label", "kind", "description", "required", "defaultValue", "status", "displayOrder", "options"];
  exactKeys(object, requireStableFieldId ? ["fieldId", "label", "kind"] : ["label", "kind"], "Agent Type field", ["fieldId", "description", "required", "defaultValue", "status", "displayOrder", "options"]);
  const label = normalizeLabel(String(object.label));
  const kind = requireFieldKind(object.kind);
  const fieldId = object.fieldId === undefined
    ? `field.custom.${sha256(`${label}|${kind}|${now}|${index}`).slice(0, 24)}`
    : normalizeFieldId(String(object.fieldId));
  if (usedIds.has(fieldId)) throw new Error("Agent Type field identifiers must be unique.");
  usedIds.add(fieldId);
  const options = normalizeEnumOptions(kind, object.options);
  const defaultValue = normalizeDefaultValue(kind, object.defaultValue === undefined ? null : object.defaultValue, options);
  return {
    fieldId,
    label,
    kind,
    description: normalizeDescription(object.description),
    required: object.required === undefined ? false : requireBoolean(object.required, "Field required"),
    defaultValue,
    status: object.status === undefined ? "active" : requireFieldStatus(object.status),
    displayOrder: object.displayOrder === undefined ? index : normalizeDisplayOrder(object.displayOrder),
    ...(options ? { options } : {})
  };
}

function normalizeEnumOptions(kind: AgentTypeFieldKind, value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    if (kind === "enum") throw new Error("Enum fields require options.");
    return undefined;
  }
  if (kind !== "enum" || !Array.isArray(value) || value.length < 1 || value.length > 64) throw new Error("Only enum fields may define options.");
  const options = value.map((item) => normalizeLabel(String(item)));
  if (new Set(options.map((item) => item.toLocaleLowerCase("zh-CN"))).size !== options.length) throw new Error("Enum options must be unique.");
  return options;
}

function normalizeDefaultValue(kind: AgentTypeFieldKind, value: unknown, options?: string[]): AgentTypeFieldDefinition["defaultValue"] {
  if (value === null || value === undefined) return null;
  if ((kind === "text" || kind === "longText" || kind === "date") && typeof value !== "string") throw new Error("Field defaultValue has the wrong type.");
  if (kind === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error("Number field defaultValue is invalid.");
  if (kind === "boolean" && typeof value !== "boolean") throw new Error("Boolean field defaultValue is invalid.");
  if (kind === "enum" && (typeof value !== "string" || !options?.includes(value))) throw new Error("Enum field defaultValue must be one of its options.");
  if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/u.test(String(value))) throw new Error("Date field defaultValue must be YYYY-MM-DD.");
  if (typeof value === "string" && value.length > (kind === "longText" ? 20_000 : 512)) throw new Error("Field defaultValue is too long.");
  return value as AgentTypeFieldDefinition["defaultValue"];
}

function resolveNote(root: string, catalog: AgentTypeCatalog, note: ReturnType<typeof listWorkspaceNotes>[number]): AgentTypeResolution {
  const explicitValue = note.frontmatter.agentTypeId;
  const explicitBinding = explicitValue !== undefined;
  const base = { objectId: note.id, objectRevision: note.contentHash, relativePath: note.relativePath, title: note.title, sourceType: note.type, explicitBinding };
  let typeId: string | null = null;
  if (explicitBinding) {
    if (typeof explicitValue !== "string" || !explicitValue.trim()) return { ...base, state: "uncertain", typeId: null, typeRevision: null, reason: "agent-type-id-invalid" };
    try {
      typeId = normalizeAnyTypeId(explicitValue);
    } catch {
      return { ...base, state: "uncertain", typeId: null, typeRevision: null, reason: "agent-type-id-invalid" };
    }
    const type = catalog.types.find((candidate) => candidate.typeId === typeId);
    if (!type) return { ...base, state: "uncertain", typeId, typeRevision: null, reason: "agent-type-id-unknown" };
    if (!isCompatible(type.baseCapability, note.type)) return { ...base, state: "uncertain", typeId, typeRevision: type.revision, reason: "agent-type-binding-incompatible" };
    if (!type.builtin && type.status === "draft") return { ...base, state: "uncertain", typeId, typeRevision: type.revision, reason: "agent-type-draft" };
    return { ...base, state: "classified", typeId, typeRevision: type.revision, reason: null };
  }
  const builtin = BUILTIN_AGENT_TYPES.find((candidate) => isCompatible(candidate.baseCapability, note.type));
  if (builtin) return { ...base, state: "classified", typeId: builtin.typeId, typeRevision: builtin.revision, reason: null };
  return { ...base, state: "uncertain", typeId: null, typeRevision: null, reason: "world-object-type-not-agent-directory" };
}

function findBoundWorldObjects(root: string, typeId: string): string[] {
  return listWorkspaceNotes(root).filter((note) => note.frontmatter.agentTypeId === typeId).map((note) => note.id);
}

function fieldUsedByWorldObjects(root: string, fieldId: string): boolean {
  return listWorkspaceNotes(root).some((note) => hasFieldValue(note.frontmatter, fieldId));
}

function hasFieldValue(frontmatter: Record<string, unknown>, fieldId: string): boolean {
  return Object.prototype.hasOwnProperty.call(frontmatter, agentTypeFieldFrontmatterKey(fieldId))
    || Object.prototype.hasOwnProperty.call(frontmatter, `agent_${fieldId}`)
    || Object.prototype.hasOwnProperty.call(frontmatter, fieldId);
}

function writeCatalog(root: string, current: AgentTypeCatalog, customTypes: AgentTypeDefinition[]): { revision: number } {
  const catalogPath = path.join(root, AGENT_TYPE_CATALOG_RELATIVE_PATH);
  assertNoSymlinkSegments(root, catalogPath, true);
  const nextRevision = current.revision + 1;
  const payload = {
    version: AGENT_TYPE_CATALOG_VERSION,
    revision: nextRevision,
    types: customTypes.map(({ builtin: _builtin, ...type }) => type)
  };
  const source = `${JSON.stringify(sortJson(payload), null, 2)}\n`;
  const directory = path.dirname(catalogPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertNoSymlinkSegments(root, directory, false);
  const temporary = path.join(directory, `.${path.basename(catalogPath)}.agent-type-tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeSync(fd, source, null, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    assertNoSymlinkSegments(root, catalogPath, true);
    renameSync(temporary, catalogPath);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* best effort cleanup */ }
    throw error;
  }
  return { revision: nextRevision };
}

function prepareWorkspaceRootForCatalog(rootPath: string): string {
  const root = path.resolve(String(rootPath || ""));
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error("Story workspace root is invalid.");
  const resolved = realpathSync(root);
  const project = readWorkspaceNote(resolved, "project.md");
  if (project.type !== "project") throw new Error("Story workspace project.md is invalid.");
  return resolved;
}

function assertNoSymlinkSegments(root: string, target: string, allowMissing: boolean): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Agent Type Catalog path escapes workspace.");
  let cursor = root;
  for (const segment of relative ? relative.split(path.sep) : []) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) {
      if (allowMissing) return;
      throw new Error("Agent Type Catalog path is missing.");
    }
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("Agent Type Catalog path cannot cross a symlink.");
  }
}

function requireCustomType(catalog: AgentTypeCatalog, typeId: string): AgentTypeDefinition {
  if (BUILTIN_BY_ID.has(typeId)) throw new Error("Builtin Agent Types are immutable.");
  const type = catalog.customTypes.find((candidate) => candidate.typeId === typeId);
  if (!type) throw new Error(`Agent Type does not exist: ${typeId}.`);
  return type;
}

function assertExpectedCatalogRevision(current: number, expected: number | undefined, virtual: boolean): void {
  if (expected === undefined) {
    if (!virtual) throw new Error("Catalog revision is required for a write.");
    return;
  }
  if (!Number.isInteger(expected) || expected < 0 || expected !== current) throw new Error("Agent Type Catalog revision is stale.");
}

function assertExpectedTypeRevision(current: number, expected: number | undefined): void {
  if (expected === undefined || !Number.isInteger(expected) || expected !== current) throw new Error("Agent Type revision is stale.");
}

function assertActiveLabelAvailable(types: AgentTypeDefinition[], label: string, exceptTypeId?: string): void {
  if (types.some((type) => type.typeId !== exceptTypeId && type.status !== "retired" && sameLabel(type.label, label))) {
    throw new Error("Agent Type label conflicts with an existing active type.");
  }
}

function sameLabel(left: string, right: string): boolean {
  return left.normalize("NFC").toLocaleLowerCase("zh-CN") === right.normalize("NFC").toLocaleLowerCase("zh-CN");
}

function sortTypes(types: AgentTypeDefinition[]): AgentTypeDefinition[] {
  return [...types].sort((left, right) => {
    const leftBuiltin = BUILTIN_ORDER.get(left.typeId);
    const rightBuiltin = BUILTIN_ORDER.get(right.typeId);
    if (leftBuiltin !== undefined || rightBuiltin !== undefined) return (leftBuiltin ?? 999) - (rightBuiltin ?? 999);
    const statusOrder = { active: 0, draft: 1, retired: 2 } as const;
    return (statusOrder[left.status] - statusOrder[right.status]) || left.label.localeCompare(right.label, "zh-CN") || left.typeId.localeCompare(right.typeId);
  });
}

function compareObjectReferences(left: AgentTypeObjectReference, right: AgentTypeObjectReference): number {
  return left.title.localeCompare(right.title, "zh-CN") || left.objectId.localeCompare(right.objectId);
}

function uncertainLabel(item: UncertainAgentLibraryItem): string {
  return item.kind === "world-object" ? item.title : item.suggestedName;
}

function uncertainIdentity(item: UncertainAgentLibraryItem): string {
  return item.kind === "world-object" ? item.objectId : item.proposalId;
}

function isCompatible(capability: AgentTypeBaseCapability, worldType: string): boolean {
  return BUILTIN_WORLD_TYPES[capability].includes(worldType);
}

function builtin(typeId: string, label: string, description: string, baseCapability: AgentTypeBaseCapability): AgentTypeDefinition {
  const timestamp = "1970-01-01T00:00:00.000Z";
  return { typeId, label, description, baseCapability, fieldDefinitions: [], status: "active", revision: 1, provenance: { kind: "system", sourceRef: "world-object-type" }, createdAt: timestamp, updatedAt: timestamp, builtin: true };
}

function normalizeTypeId(value: string): string {
  if (typeof value !== "string" || !TYPE_ID_PATTERN.test(value)) throw new Error("Custom Agent Type identifier is invalid.");
  return value;
}

function normalizeAnyTypeId(value: string): string {
  const normalized = String(value || "").trim();
  if (BUILTIN_BY_ID.has(normalized)) return normalized;
  return normalizeTypeId(normalized);
}

function normalizeFieldId(value: string): string {
  if (typeof value !== "string" || !FIELD_ID_PATTERN.test(value)) throw new Error("Agent Type field identifier is invalid.");
  return value;
}

function normalizeObjectId(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 160 || /[\0\r\n]/u.test(normalized)) throw new Error("WorldObject identifier is invalid.");
  return normalized;
}

function normalizeLabel(value: string): string {
  const normalized = String(value ?? "").normalize("NFC").trim();
  if (!normalized || normalized.length > 120 || /[\0\r\n]/u.test(normalized)) throw new Error("Agent Type label is invalid.");
  return normalized;
}

function normalizeDescription(value: unknown): string {
  const normalized = String(value ?? "").normalize("NFC").trim();
  if (normalized.length > 2_000 || /[\0]/u.test(normalized)) throw new Error("Agent Type description is invalid.");
  return normalized;
}

function normalizeTimestamp(value: string, label: string): string {
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeProvenance(value: unknown): AgentTypeProvenance {
  const object = requirePlainObject(value, "Agent Type provenance");
  exactKeys(object, ["kind", "sourceRef"], "Agent Type provenance", ["sourceRef"]);
  if (!["author", "migration", "system"].includes(String(object.kind))) throw new Error("Agent Type provenance kind is invalid.");
  return { kind: object.kind as AgentTypeProvenance["kind"], ...(object.sourceRef === undefined ? {} : { sourceRef: normalizeLabel(String(object.sourceRef)) }) };
}

function requireBaseCapability(value: unknown): AgentTypeBaseCapability {
  if (!AGENT_TYPE_BASE_CAPABILITIES.includes(value as AgentTypeBaseCapability)) throw new Error("Agent Type baseCapability is invalid.");
  return value as AgentTypeBaseCapability;
}

function requireFieldKind(value: unknown): AgentTypeFieldKind {
  if (!AGENT_TYPE_FIELD_KINDS.includes(value as AgentTypeFieldKind)) throw new Error("Agent Type field kind is unsupported.");
  return value as AgentTypeFieldKind;
}

function normalizeStatus(value: unknown): AgentTypeStatus {
  if (!AGENT_TYPE_STATUSES.includes(value as AgentTypeStatus)) throw new Error("Agent Type status is invalid.");
  return value as AgentTypeStatus;
}

function requireFieldStatus(value: unknown): "active" | "retired" {
  if (value !== "active" && value !== "retired") throw new Error("Agent Type field status is invalid.");
  return value;
}

function normalizeDisplayOrder(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 10_000) throw new Error("Agent Type field displayOrder is invalid.");
  return Number(value);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function positiveOrZeroInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, required: string[], label: string, optional: string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(object, key)) throw new Error(`${label} is missing ${key}.`);
  for (const key of Object.keys(object)) if (!allowed.has(key)) throw new Error(`${label} contains an unknown field: ${key}.`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
