import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const OBJECT_CATALOG_SCHEMA_VERSION = "tianyan-object-catalog/v1" as const;
export type CatalogLifecycleSource = "active" | "archived";
export type ObjectCatalogRecord = {
  projectId: string; workVersionId: string; objectType: string; objectId: string;
  categoryId: string | null; trashedAt: string | null; trashedFrom: CatalogLifecycleSource | null;
  displayOrder: number | null; createdAt: string; updatedAt: string;
};
export type ObjectCatalogState = {
  schemaVersion: typeof OBJECT_CATALOG_SCHEMA_VERSION; projectId: string; workVersionId: string;
  revision: number; records: ObjectCatalogRecord[];
};

/** Object IDs are generated from author-facing titles and therefore may contain Unicode letters or numbers. */
const SAFE_ID = /^[\p{L}\p{N}._:-]{1,180}$/u;
const nowIso = () => new Date().toISOString();

/** Owns directory organization and trash metadata only; WorldObject fields remain outside this repository. */
export function createObjectCatalog(projectPath: string) {
  const root = path.join(projectPath, ".world-os", "object-catalog");
  const catalogPath = (workVersionId: string) => path.join(root, `${safeId(workVersionId, "Work version")}.json`);
  const read = (projectId: string, workVersionId: string): ObjectCatalogState => {
    const filename = catalogPath(workVersionId);
    if (!existsSync(filename)) return emptyState(projectId, workVersionId);
    return normalizeState(JSON.parse(readFileSync(filename, "utf8")), projectId, workVersionId);
  };
  const write = (state: ObjectCatalogState): ObjectCatalogState => {
    mkdirSync(root, { recursive: true });
    const normalized = normalizeState(state, state.projectId, state.workVersionId);
    const filename = catalogPath(normalized.workVersionId);
    const temporary = `${filename}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporary, filename);
    return normalized;
  };
  const mutate = (projectId: string, workVersionId: string, expectedRevision: number, operation: (state: ObjectCatalogState) => ObjectCatalogState) => {
    const current = read(projectId, workVersionId);
    if (current.revision !== expectedRevision) throw new Error("Object catalog changed; reload before retrying.");
    return write({ ...operation(current), revision: current.revision + 1 });
  };
  return {
    read,
    setCategory(input: { projectId: string; workVersionId: string; expectedRevision: number; objectType: string; objectIds: string[]; categoryId: string | null }) {
      return mutate(input.projectId, input.workVersionId, input.expectedRevision, (state) => upsertMany(state, input.objectType, input.objectIds, (record, timestamp) => ({ ...record, categoryId: input.categoryId ? safeId(input.categoryId, "Category") : null, updatedAt: timestamp })));
    },
    moveToTrash(input: { projectId: string; workVersionId: string; expectedRevision: number; objectType: string; objectIds: string[]; trashedFrom: CatalogLifecycleSource }) {
      return mutate(input.projectId, input.workVersionId, input.expectedRevision, (state) => upsertMany(state, input.objectType, input.objectIds, (record, timestamp) => ({ ...record, trashedAt: timestamp, trashedFrom: input.trashedFrom, updatedAt: timestamp })));
    },
    restoreFromTrash(input: { projectId: string; workVersionId: string; expectedRevision: number; objectType: string; objectIds: string[] }) {
      return mutate(input.projectId, input.workVersionId, input.expectedRevision, (state) => upsertMany(state, input.objectType, input.objectIds, (record, timestamp) => ({ ...record, trashedAt: null, trashedFrom: null, updatedAt: timestamp })));
    }
  };
}

function emptyState(projectId: string, workVersionId: string): ObjectCatalogState {
  return { schemaVersion: OBJECT_CATALOG_SCHEMA_VERSION, projectId: safeId(projectId, "Project"), workVersionId: safeId(workVersionId, "Work version"), revision: 0, records: [] };
}
function upsertMany(state: ObjectCatalogState, objectType: string, objectIds: string[], update: (record: ObjectCatalogRecord, timestamp: string) => ObjectCatalogRecord): ObjectCatalogState {
  const timestamp = nowIso(); const next = new Map(state.records.map((record) => [`${record.objectType}:${record.objectId}`, record]));
  for (const objectId of [...new Set(objectIds)].map((id) => safeId(id, "Object"))) {
    const key = `${objectType}:${objectId}`; const current = next.get(key) ?? { projectId: state.projectId, workVersionId: state.workVersionId, objectType: safeId(objectType, "Object type"), objectId, categoryId: null, trashedAt: null, trashedFrom: null, displayOrder: null, createdAt: timestamp, updatedAt: timestamp };
    next.set(key, update(current, timestamp));
  }
  return { ...state, records: [...next.values()].sort((left, right) => left.objectType.localeCompare(right.objectType) || left.objectId.localeCompare(right.objectId)) };
}
function normalizeState(value: unknown, projectId: string, workVersionId: string): ObjectCatalogState {
  const record = value as Partial<ObjectCatalogState>;
  if (!record || record.schemaVersion !== OBJECT_CATALOG_SCHEMA_VERSION || record.projectId !== projectId || record.workVersionId !== workVersionId || !Number.isSafeInteger(record.revision) || !Array.isArray(record.records)) throw new Error("Object catalog is invalid or belongs to another scope.");
  return { schemaVersion: OBJECT_CATALOG_SCHEMA_VERSION, projectId: safeId(projectId, "Project"), workVersionId: safeId(workVersionId, "Work version"), revision: record.revision!, records: record.records.map((item) => normalizeRecord(item, projectId, workVersionId)) };
}
function normalizeRecord(value: unknown, projectId: string, workVersionId: string): ObjectCatalogRecord {
  const item = value as Partial<ObjectCatalogRecord>;
  const allowed = new Set(["projectId", "workVersionId", "objectType", "objectId", "categoryId", "trashedAt", "trashedFrom", "displayOrder", "createdAt", "updatedAt"]);
  if (!item || typeof item !== "object" || Object.keys(item).some((key) => !allowed.has(key)) || item.projectId !== projectId || item.workVersionId !== workVersionId) throw new Error("Object catalog record is invalid.");
  const timestamp = (input: unknown) => typeof input === "string" && !Number.isNaN(Date.parse(input)) ? input : (() => { throw new Error("Object catalog timestamp is invalid."); })();
  return { projectId, workVersionId, objectType: safeId(item.objectType, "Object type"), objectId: safeId(item.objectId, "Object"), categoryId: item.categoryId == null ? null : safeId(item.categoryId, "Category"), trashedAt: item.trashedAt == null ? null : timestamp(item.trashedAt), trashedFrom: item.trashedFrom === "active" || item.trashedFrom === "archived" ? item.trashedFrom : null, displayOrder: Number.isSafeInteger(item.displayOrder) ? item.displayOrder! : null, createdAt: timestamp(item.createdAt), updatedAt: timestamp(item.updatedAt) };
}
function safeId(value: unknown, label: string): string { const result = String(value ?? ""); if (!SAFE_ID.test(result)) throw new Error(`${label} identifier is invalid.`); return result; }
