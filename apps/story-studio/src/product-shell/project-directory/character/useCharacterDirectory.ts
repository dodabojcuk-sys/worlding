import { useCallback, useEffect, useState } from "react";
import { archiveWorldObject, bulkUpdateWorldObjects, createCharacterCard, createWorkspaceFolder, getObjectCatalog, getWorldLibrary, readWorldObject, restoreWorldObject, updateObjectCatalog, type ObjectCatalogState, type WorldObject, type WorkspaceFolder } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";

export type CharacterDirectoryCategory = Pick<WorkspaceFolder, "id" | "title">;
export type CharacterDirectoryRecord = { object: WorldObject; categoryId: string | null; categoryName: string | null; trashedAt: string | null; trashedFrom: "active" | "archived" | null; eventCount: number; manualOrder: number | null };
export type CharacterCreateInput = {
  title: string;
  subtype: string;
  aliases: string[];
  tags: string[];
  summary: string;
  categoryId: string | null;
};
export type CharacterCreateResult = {
  object: WorldObject;
  objectId: string;
  projectId: string;
  workVersionId: string;
  categoryError: string | null;
};
export const UNVERSIONED_CATALOG_SCOPE = "work-version.unversioned";
export function useCharacterDirectory(runtime: TianyanShellRuntimeState) {
  const workVersionId = runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE;
  const [state, setState] = useState<{ scope: string | null; records: CharacterDirectoryRecord[]; categories: CharacterDirectoryCategory[]; catalog: ObjectCatalogState | null; loading: boolean; error: string | null }>({ scope: null, records: [], categories: [], catalog: null, loading: false, error: null });
  const loadDirectory = useCallback(async () => {
    if (!runtime.project) return { scope: null, records: [] as CharacterDirectoryRecord[], categories: [] as CharacterDirectoryCategory[], catalog: null as ObjectCatalogState | null };
    const currentScope = `${runtime.project.id}:${workVersionId}`;
    const [library, catalog] = await Promise.all([getWorldLibrary(runtime.project.id), getObjectCatalog(runtime.project.id, workVersionId)]);
    const categories = library.folders.filter((folder) => folder.kind === "custom-category").map((folder) => ({ id: folder.id, title: folder.title }));
    const categoryNames = new Map(categories.map((category) => [category.id, category.title]));
    const characterSummaries = library.objects.filter((item) => item.type === "character");
    const sourceOrder = new Map(characterSummaries.map((item, index) => [item.id, index]));
    const details = await Promise.all(characterSummaries.map((item) => readWorldObject(runtime.project!.id, item.id)));
    const records = details.map((object) => {
      const metadata = catalog.records.find((item) => item.objectType === "character" && item.objectId === object.id);
      const eventIds = new Set([...(object.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []), ...object.linkedObjects.filter((item) => item.type === "event").map((item) => item.id), ...object.backlinks.filter((item) => item.type === "event").map((item) => item.id)]);
      return { object, categoryId: metadata?.categoryId ?? null, categoryName: metadata?.categoryId ? categoryNames.get(metadata.categoryId) ?? null : null, trashedAt: metadata?.trashedAt ?? null, trashedFrom: metadata?.trashedFrom ?? null, eventCount: eventIds.size, manualOrder: metadata?.displayOrder ?? sourceOrder.get(object.id) ?? null };
    });
    return { scope: currentScope, records, categories, catalog };
  }, [runtime.project?.id, workVersionId]);
  const reload = useCallback(async () => {
    if (!runtime.project) { setState({ scope: null, records: [], categories: [], catalog: null, loading: false, error: null }); return { scope: null, records: [] as CharacterDirectoryRecord[], categories: [] as CharacterDirectoryCategory[], catalog: null as ObjectCatalogState | null }; }
    const currentScope = `${runtime.project.id}:${workVersionId}`;
    setState((current) => current.scope?.startsWith(`${runtime.project!.id}:`)
      ? { ...current, scope: currentScope, loading: true, error: null }
      : { ...current, scope: currentScope, records: [], categories: [], catalog: null, loading: true, error: null });
    try {
      const next = await loadDirectory();
      setState((current) => current.scope === currentScope ? { ...next, loading: false, error: null } : current);
      return next;
    } catch (error) {
      setState((current) => current.scope === currentScope ? { scope: currentScope, records: [], categories: [], catalog: null, loading: false, error: error instanceof Error ? error.message : "Character directory unavailable." } : current);
      throw error;
    }
  }, [loadDirectory, runtime.project?.id, workVersionId]);
  useEffect(() => { void reload(); }, [reload]);
  const mutateCatalog = async (operation: "set-category" | "trash" | "restore", objectIds: string[], extra: { categoryId?: string | null; trashedFrom?: "active" | "archived" } = {}) => {
    if (!runtime.project || !state.catalog) throw new Error("Object catalog is not ready.");
    await runtime.withConnection((token) => updateObjectCatalog({ projectId: runtime.project!.id, workVersionId, expectedRevision: state.catalog!.revision, operation, objectType: "character", objectIds, ...extra, token }));
    await reload();
  };
  return {
    ...state, reload,
    async create(input: CharacterCreateInput): Promise<CharacterCreateResult> {
      if (!runtime.project) throw new Error("No active project.");
      const projectId = runtime.project.id;
      const result = await runtime.withConnection((token) => createCharacterCard({ projectId, title: input.title, mode: "guided", subtype: input.subtype, aliases: input.aliases, tags: input.tags, background: input.summary || undefined, token }));
      const afterCreate = await reload();
      if (!afterCreate.records.some((record) => record.object.id === result.object.id)) throw new Error("Created character is unavailable in the refreshed directory.");
      let categoryError: string | null = null;
      if (input.categoryId && afterCreate.catalog) {
        try {
          await runtime.withConnection((token) => updateObjectCatalog({ projectId, workVersionId, expectedRevision: afterCreate.catalog!.revision, operation: "set-category", objectType: "character", objectIds: [result.object.id], categoryId: input.categoryId, token }));
        } catch (error) {
          categoryError = error instanceof Error ? error.message : "Category could not be saved.";
        } finally {
          await reload();
        }
      }
      return { object: result.object, objectId: result.object.id, projectId, workVersionId, categoryError };
    },
    async retryCategory(objectId: string, categoryId: string) {
      if (!runtime.project) throw new Error("No active project.");
      const latest = await loadDirectory();
      const catalog = latest.catalog;
      if (!catalog) throw new Error("Object catalog is not ready.");
      await runtime.withConnection((token) => updateObjectCatalog({ projectId: runtime.project!.id, workVersionId, expectedRevision: catalog.revision, operation: "set-category", objectType: "character", objectIds: [objectId], categoryId, token }));
      await reload();
    },
    async createCategory(title: string): Promise<CharacterDirectoryCategory> {
      if (!runtime.project) throw new Error("No active project.");
      const result = await runtime.withConnection((token) => createWorkspaceFolder({ projectId: runtime.project!.id, title, kind: "custom-category", token }));
      await reload();
      return { id: result.folder.id, title: result.folder.title };
    },
    async archive(ids: string[]) { if (!runtime.project) return; for (const id of ids) { const record = state.records.find((item) => item.object.id === id); if (record && record.object.status !== "archived") await runtime.withConnection((token) => archiveWorldObject({ projectId: runtime.project!.id, objectId: id, expectedHash: record.object.revisionToken, token })); } await reload(); },
    async unarchive(ids: string[]) { if (!runtime.project) return; for (const id of ids) { const record = state.records.find((item) => item.object.id === id); if (record?.object.status === "archived") await runtime.withConnection((token) => restoreWorldObject({ projectId: runtime.project!.id, objectId: id, expectedHash: record.object.revisionToken, token })); } await reload(); },
    async addTags(ids: string[], tags: string[]) { if (!runtime.project) return; await runtime.withConnection((token) => bulkUpdateWorldObjects({ projectId: runtime.project!.id, objectIds: ids, operation: "add-tags", tags, token })); await reload(); },
    trash: async (ids: string[]) => {
      if (!runtime.project || !state.catalog) throw new Error("Object catalog is not ready.");
      const archived = ids.filter((id) => state.records.find((item) => item.object.id === id)?.object.status === "archived");
      const active = ids.filter((id) => !archived.includes(id)); let revision = state.catalog.revision;
      for (const [objectIds, trashedFrom] of [[active, "active"], [archived, "archived"]] as const) { if (!objectIds.length) continue; const next = await runtime.withConnection((token) => updateObjectCatalog({ projectId: runtime.project!.id, workVersionId, expectedRevision: revision, operation: "trash", objectType: "character", objectIds, trashedFrom, token })); revision = next.revision; }
      await reload();
    },
    restoreTrash: async (id: string) => { const record = state.records.find((item) => item.object.id === id); if (!record) return; const sourceMatches = record.trashedFrom === "archived" ? record.object.status === "archived" : record.object.status !== "archived"; if (!sourceMatches) throw new Error("Character lifecycle changed while in trash; restore is blocked."); await mutateCatalog("restore", [id]); },
    setCategory: (ids: string[], categoryId: string | null) => mutateCatalog("set-category", ids, { categoryId })
  };
}
