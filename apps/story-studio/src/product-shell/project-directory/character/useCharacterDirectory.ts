import { useCallback, useEffect, useState } from "react";
import { archiveWorldObject, bulkUpdateWorldObjects, createCharacterCard, getObjectCatalog, getWorldLibrary, readWorldObject, restoreWorldObject, updateObjectCatalog, type ObjectCatalogState, type WorldObject } from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";

export type CharacterDirectoryRecord = { object: WorldObject; categoryId: string | null; trashedAt: string | null; trashedFrom: "active" | "archived" | null; eventCount: number };
export const UNVERSIONED_CATALOG_SCOPE = "work-version.unversioned";
export function useCharacterDirectory(runtime: TianyanShellRuntimeState) {
  const workVersionId = runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE;
  const [state, setState] = useState<{ scope: string | null; records: CharacterDirectoryRecord[]; catalog: ObjectCatalogState | null; loading: boolean; error: string | null }>({ scope: null, records: [], catalog: null, loading: false, error: null });
  const reload = useCallback(async () => {
    if (!runtime.project) { setState({ scope: null, records: [], catalog: null, loading: false, error: null }); return; }
    const currentScope = `${runtime.project.id}:${workVersionId}`;
    setState((current) => ({ ...current, scope: currentScope, records: [], catalog: null, loading: true, error: null }));
    try {
      const [library, catalog] = await Promise.all([getWorldLibrary(runtime.project.id), getObjectCatalog(runtime.project.id, workVersionId)]);
      const details = await Promise.all(library.objects.filter((item) => item.type === "character").map((item) => readWorldObject(runtime.project!.id, item.id)));
      const records = details.map((object) => {
        const metadata = catalog.records.find((item) => item.objectType === "character" && item.objectId === object.id);
        const eventIds = new Set([...(object.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []), ...object.linkedObjects.filter((item) => item.type === "event").map((item) => item.id), ...object.backlinks.filter((item) => item.type === "event").map((item) => item.id)]);
        return { object, categoryId: metadata?.categoryId ?? null, trashedAt: metadata?.trashedAt ?? null, trashedFrom: metadata?.trashedFrom ?? null, eventCount: eventIds.size };
      });
      setState((current) => current.scope === currentScope ? { scope: currentScope, records, catalog, loading: false, error: null } : current);
    } catch (error) { setState((current) => current.scope === currentScope ? { scope: currentScope, records: [], catalog: null, loading: false, error: error instanceof Error ? error.message : "Character directory unavailable." } : current); }
  }, [runtime.project?.id, workVersionId]);
  useEffect(() => { void reload(); }, [reload]);
  const mutateCatalog = async (operation: "set-category" | "trash" | "restore", objectIds: string[], extra: { categoryId?: string | null; trashedFrom?: "active" | "archived" } = {}) => {
    if (!runtime.project || !state.catalog) throw new Error("Object catalog is not ready.");
    await runtime.withConnection((token) => updateObjectCatalog({ projectId: runtime.project!.id, workVersionId, expectedRevision: state.catalog!.revision, operation, objectType: "character", objectIds, ...extra, token }));
    await reload();
  };
  return {
    ...state, reload,
    async create(title: string, subtype: string) { if (!runtime.project) throw new Error("No active project."); const result = await runtime.withConnection((token) => createCharacterCard({ projectId: runtime.project!.id, title, mode: "freeform", subtype, token })); await reload(); return result.object; },
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
