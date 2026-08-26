import {
  PRODUCT_WORKSPACE_MODES,
  resolveStoryStudioWorkspaceId,
  type ProductWorkspaceMode
} from "../product-shell/navigation/topLevelDestinationRegistry.ts";

export { PRODUCT_WORKSPACE_MODES } from "../product-shell/navigation/topLevelDestinationRegistry.ts";
export type { ProductWorkspaceMode } from "../product-shell/navigation/topLevelDestinationRegistry.ts";

export function migrateProductWorkspaceMode(value: unknown): { mode: ProductWorkspaceMode; migrated: boolean } {
  const resolved = resolveStoryStudioWorkspaceId(value);
  return { mode: resolved.id, migrated: resolved.migrated };
}
