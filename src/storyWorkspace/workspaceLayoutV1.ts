/** Machine-readable boundary for the existing Markdown workspace. */
export const TIANYAN_WORKSPACE_LAYOUT_V1 = {
  version: "tianyan-workspace-layout/v1",
  authorVisible: ["project.md", "world/", "chapters/", "scenes/", "story-units/", "planning/", "reviews/", "artifacts/", "assets/", "documents/", "manuscripts/"],
  internalDurable: ["continuity/", ".world-os/state.json", ".world-os/object-catalog/", ".world-os/author-control/", ".world-os/story-intelligence/", ".world-os/work-versions/"],
  transient: [".world-os/cache/", ".world-os/locks/", ".world-os/runs/", ".world-os/staging/", ".world-os/continuity-locks/"],
  owners: { workspace: "storyWorkspaceRepository", catalog: "objectCatalog", layout: "workspaceLayoutRepository", workVersions: "workVersionAuthority", continuity: "storyContinuity", agentRuns: "storyAgent" }
} as const;

export const TIANYAN_EXPORT_EXCLUDED_PREFIXES = [".world-os/cache/", ".world-os/locks/", ".world-os/runs/", ".world-os/staging/", ".world-os/continuity-locks/", ".story-studio/", ".env", "credentials", "secrets"] as const;
const EXPORTABLE_ROOTS = new Set(["project.md", "world", "chapters", "scenes", "story-units", "planning", "reviews", "artifacts", "assets", "documents", "manuscripts", "continuity", ".world-os"]);

export function isWorkspaceExportPath(relativePath: string) {
  const segments = relativePath.split("/");
  const root = segments[0];
  const forbidden = segments.some((segment) => /^(?:credentials?|secrets?|cache|locks?|continuity-locks)$/iu.test(segment) || /^\.env(?:\.|$)/u.test(segment) || /\.lock$/iu.test(segment));
  return EXPORTABLE_ROOTS.has(root) && !forbidden && !TIANYAN_EXPORT_EXCLUDED_PREFIXES.some((prefix) => relativePath === prefix.replace(/\/$/u, "") || relativePath.startsWith(prefix));
}
