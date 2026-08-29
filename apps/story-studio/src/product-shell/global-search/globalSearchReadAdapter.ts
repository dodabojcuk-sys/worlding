import { getObjectCatalog, getWorldLibrary, listSourceImportReviews } from "../../lib/localTransport.ts";

import type { GlobalSearchProjectReadModel, GlobalSearchReadAdapter } from "./globalSearchTypes";

/**
 * Product-shell read adapter. It composes the established project library,
 * version-scoped ObjectCatalog metadata, and source-import review projection.
 * No source content is copied into this module and no write port is exposed.
 */
export type ProductGlobalSearchReadDependencies = Pick<typeof import("../../lib/localTransport.ts"), "getObjectCatalog" | "getWorldLibrary" | "listSourceImportReviews">;

export function createProductGlobalSearchReadAdapter(dependencies: ProductGlobalSearchReadDependencies = { getObjectCatalog, getWorldLibrary, listSourceImportReviews }): GlobalSearchReadAdapter {
  return {
    async read(context): Promise<GlobalSearchProjectReadModel> {
      const [library, catalog, sourceDocuments] = await Promise.all([
        dependencies.getWorldLibrary(context.projectId),
        dependencies.getObjectCatalog(context.projectId, context.workVersionId),
        dependencies.listSourceImportReviews(context.projectId)
      ]);
      if (library.project.id !== context.projectId || catalog.projectId !== context.projectId || catalog.workVersionId !== context.workVersionId) {
        throw new Error("Global search read projections do not match the requested project/work-version context.");
      }
      const trashed = new Set(catalog.records.filter((record) => record.trashedAt !== null).map((record) => `${record.objectType}:${record.objectId}`));
      return {
        context,
        objects: library.objects
          .filter((object) => !trashed.has(`${object.type}:${object.id}`))
          .map((object) => ({ id: object.id, title: object.title, type: object.type, aliases: object.aliases, tags: object.tags, revision: object.revisionToken, sourceId: object.relativeId || null })),
        sources: sourceDocuments
          .filter((document) => document.projectId === context.projectId)
          .map((document) => ({ id: document.sourceDocumentId, title: document.title, filename: document.filename, revision: document.currentRevisionHash, mode: document.mode }))
      };
    }
  };
}
