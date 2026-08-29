/** Machine-readable boundary for the existing Markdown workspace. */
export const TIANYAN_WORKSPACE_LAYOUT_V1 = {
  version: "tianyan-workspace-layout/v1",
  authorVisible: ["project.md", "world/", "chapters/", "scenes/", "story-units/", "planning/", "reviews/", "artifacts/", "assets/", "documents/", "manuscripts/"],
  internalDurable: [".world-os/state.json", ".world-os/object-catalog/", ".world-os/author-control/", ".world-os/continuity/", ".world-os/work-versions/"],
  transient: [".world-os/cache/", ".world-os/locks/", ".world-os/staging/"],
  owners: { workspace: "storyWorkspaceRepository", catalog: "objectCatalog", layout: "workspaceLayoutRepository", workVersions: "workVersionAuthority", continuity: "storyContinuity", agentRuns: "storyAgent" }
} as const;

export const TIANYAN_EXPORT_EXCLUDED_PREFIXES = [".world-os/cache/", ".world-os/locks/", ".world-os/staging/", ".story-studio/", ".env", "credentials", "secrets"] as const;
const EXPORTABLE_ROOTS = new Set(["project.md", "world", "chapters", "scenes", "story-units", "planning", "reviews", "artifacts", "assets", "documents", "manuscripts", ".world-os"]);

export function isWorkspaceExportPath(relativePath: string) {
  const root = relativePath.split("/")[0];
  return EXPORTABLE_ROOTS.has(root) && !TIANYAN_EXPORT_EXCLUDED_PREFIXES.some((prefix) => relativePath === prefix.replace(/\/$/u, "") || relativePath.startsWith(prefix));
}
