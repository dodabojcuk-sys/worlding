import { createCreationSourceSelectionPort } from "./creationSourceSelectionPort.mjs";

/**
 * Fixture compatibility wrapper. It supplies only the isolated Project guard
 * and deterministic projection salt; all Creation behavior lives in the
 * shared project-scoped port used by the normal route.
 */
export function createWorkVersionBoundCreationFixtureAdapter({ operations, relationOperations = null, canonReadProjection = null, faultInjector = () => {} }) {
  return createCreationSourceSelectionPort({
    operations,
    relationOperations,
    canonReadProjection,
    faultInjector,
    projectGuard(project) {
      if (!/创作来源隔离|creation.source.fixture/iu.test(project.title)) {
        throw new Error("WorkVersion Creation Fixture writes require an explicitly isolated Project.");
      }
    },
    projectionSalt({ sourceGeneration }) {
      return `fixture-source-generation:${sourceGeneration}`;
    }
  });
}
