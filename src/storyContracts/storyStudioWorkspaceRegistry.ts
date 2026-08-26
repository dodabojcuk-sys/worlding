/**
 * The only product-level registry for Story Studio's eight author workspaces.
 * It is intentionally static: a workspace is not a plugin, a route handler,
 * or a second domain owner.
 */
export type StoryStudioWorkspaceIcon =
  | "world"
  | "tianyi"
  | "event-line"
  | "nuwa"
  | "multiverse"
  | "library"
  | "writing"
  | "data";

export type StoryStudioWorkspaceGroup = "world" | "intelligence" | "authoring";
export type StoryStudioWorkspaceVisibility = "primary" | "more" | "hidden";
export type StoryStudioAuthorNavigation = "global";

export type StoryStudioWorkspaceDefinition = {
  id: string;
  route: string;
  displayName: string;
  icon: StoryStudioWorkspaceIcon;
  order: number;
  group: StoryStudioWorkspaceGroup;
  visibility: {
    desktop: "primary";
    mobile: StoryStudioWorkspaceVisibility;
  };
  /** Presentation only. Domain ownership remains outside the navigation registry. */
  authorNavigation: StoryStudioAuthorNavigation;
  enabled: boolean;
};

export const STORY_STUDIO_WORKSPACE_REGISTRY = [
  { id: "world", route: "/world", displayName: "世界", icon: "world", order: 1, group: "world", visibility: { desktop: "primary", mobile: "primary" }, authorNavigation: "global", enabled: true },
  { id: "tianyi", route: "/tianyi", displayName: "天意", icon: "tianyi", order: 2, group: "intelligence", visibility: { desktop: "primary", mobile: "primary" }, authorNavigation: "global", enabled: true },
  { id: "event-line", route: "/event-line", displayName: "事件线", icon: "event-line", order: 3, group: "world", visibility: { desktop: "primary", mobile: "primary" }, authorNavigation: "global", enabled: true },
  { id: "multiverse", route: "/multiverse", displayName: "多元", icon: "multiverse", order: 4, group: "authoring", visibility: { desktop: "primary", mobile: "more" }, authorNavigation: "global", enabled: true },
  { id: "nuwa", route: "/nuwa", displayName: "女娲", icon: "nuwa", order: 5, group: "world", visibility: { desktop: "primary", mobile: "primary" }, authorNavigation: "global", enabled: true },
  { id: "library", route: "/library", displayName: "资料", icon: "library", order: 6, group: "world", visibility: { desktop: "primary", mobile: "more" }, authorNavigation: "global", enabled: true },
  { id: "writing", route: "/creation", displayName: "创作", icon: "writing", order: 7, group: "authoring", visibility: { desktop: "primary", mobile: "primary" }, authorNavigation: "global", enabled: true },
  { id: "data", route: "/data", displayName: "数据", icon: "data", order: 8, group: "world", visibility: { desktop: "primary", mobile: "hidden" }, authorNavigation: "global", enabled: true }
] as const satisfies readonly StoryStudioWorkspaceDefinition[];

export type StoryStudioWorkspaceId = typeof STORY_STUDIO_WORKSPACE_REGISTRY[number]["id"];
export type StoryStudioWorkspace = typeof STORY_STUDIO_WORKSPACE_REGISTRY[number];

export const STORY_STUDIO_WORKSPACE_IDS: readonly StoryStudioWorkspaceId[] = STORY_STUDIO_WORKSPACE_REGISTRY.map((workspace) => workspace.id) as StoryStudioWorkspaceId[];

const LEGACY_WORKSPACE_IDS: Record<string, StoryStudioWorkspaceId> = {
  creation: "writing",
  intelligence: "tianyi",
  localization: "world",
  publish: "world"
};

const LEGACY_WORKSPACE_ROUTES: Record<string, StoryStudioWorkspaceId> = {
  "/writing": "writing",
  "/tianyi-v2": "tianyi"
};

/** Canonical authoring children remain projections of their existing workspace.
 * They deliberately do not join the seven-space global registry. */
const AUTHORING_CHILD_WORKSPACE_ROUTES: Record<string, StoryStudioWorkspaceId> = {
  "/multiverse/translation": "multiverse",
  "/multiverse/perspective": "multiverse",
  "/multiverse/pov": "multiverse",
  "/multiverse/if": "multiverse",
  "/multiverse/localization": "multiverse",
  "/multiverse/fan-localization": "multiverse",
  "/creation/novel": "writing",
  "/creation/screenplay": "writing",
  "/creation/comic": "writing",
  "/creation/interactive": "writing",
  "/creation/translation-adaptation": "writing",
  "/creation/plugins": "writing"
};

export function isStoryStudioWorkspaceId(value: unknown): value is StoryStudioWorkspaceId {
  return typeof value === "string" && STORY_STUDIO_WORKSPACE_IDS.includes(value as StoryStudioWorkspaceId);
}

/** Normalizes old stored destinations without making legacy values canonical. */
export function resolveStoryStudioWorkspaceId(value: unknown): { id: StoryStudioWorkspaceId; migrated: boolean } {
  if (isStoryStudioWorkspaceId(value)) return { id: value, migrated: false };
  return { id: typeof value === "string" && LEGACY_WORKSPACE_IDS[value] ? LEGACY_WORKSPACE_IDS[value] : "world", migrated: true };
}

export function storyStudioWorkspaceById(id: StoryStudioWorkspaceId): StoryStudioWorkspace {
  const workspace = STORY_STUDIO_WORKSPACE_REGISTRY.find((item) => item.id === id);
  if (!workspace) throw new Error(`Unknown Story Studio workspace: ${id}`);
  return workspace;
}

export function storyStudioWorkspaceRoute(id: StoryStudioWorkspaceId): string {
  return storyStudioWorkspaceById(id).route;
}

export function storyStudioWorkspaceDisplayName(id: StoryStudioWorkspaceId): string {
  return storyStudioWorkspaceById(id).displayName;
}

/**
 * Resolves URL input only. Legacy paths and query values are accepted on read;
 * callers may subsequently replace them with the canonical route.
 */
export function resolveStoryStudioWorkspaceLocation(input: {
  pathname: string;
  search: string;
}): { id: StoryStudioWorkspaceId; migrated: boolean } {
  const pathname = normalizePathname(input.pathname);
  const direct = STORY_STUDIO_WORKSPACE_REGISTRY.find((workspace) => workspace.route === pathname);
  if (direct) return { id: direct.id, migrated: false };
  if (AUTHORING_CHILD_WORKSPACE_ROUTES[pathname]) return { id: AUTHORING_CHILD_WORKSPACE_ROUTES[pathname], migrated: false };
  if (LEGACY_WORKSPACE_ROUTES[pathname]) return { id: LEGACY_WORKSPACE_ROUTES[pathname], migrated: true };

  const query = new URLSearchParams(input.search);
  const requested = query.get("workspace") ?? query.get("mode");
  if (requested) return resolveStoryStudioWorkspaceId(requested);
  if (pathname === "/" && query.get("skipIntro") === "1") return { id: "library", migrated: false };
  return { id: "world", migrated: pathname !== "/" };
}

function normalizePathname(value: string): string {
  const normalized = value.replace(/\/+$/u, "") || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
