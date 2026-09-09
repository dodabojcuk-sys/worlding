export type DirectoryWorkspaceState = {
  preferredOpen: boolean;
  path: string[];
  query: string;
  selectedObjectId: string | null;
  scrollTop: number;
  character: {
    view: "active" | "archived" | "trash";
    tagFilter: string;
    categoryFilter: string;
    roleFilter: string;
    multi: boolean;
    selectedIds: string[];
    scrollTop: number;
  };
};

export type DirectoryTemporarySurface = "none" | "right-inspector" | "tianyi" | "settings" | "account" | "central-review" | "workspace-overlay";

export function directoryWorkspaceStorageKey(projectId: string | null): string {
  return `tianyan:directory-workspace:${projectId || "no-project"}`;
}

export function defaultDirectoryWorkspaceState(preferredOpen: boolean): DirectoryWorkspaceState {
  return { preferredOpen, path: [], query: "", selectedObjectId: null, scrollTop: 0, character: defaultCharacterDirectoryWorkspaceState() };
}

export function readDirectoryWorkspaceState(projectId: string | null, fallbackOpen: boolean): DirectoryWorkspaceState {
  if (typeof window === "undefined") return defaultDirectoryWorkspaceState(fallbackOpen);
  try {
    const value = JSON.parse(window.localStorage.getItem(directoryWorkspaceStorageKey(projectId)) || "null") as Partial<DirectoryWorkspaceState> | null;
    if (!value) return defaultDirectoryWorkspaceState(fallbackOpen);
    return {
      preferredOpen: typeof value.preferredOpen === "boolean" ? value.preferredOpen : fallbackOpen,
      path: Array.isArray(value.path) ? value.path.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
      query: typeof value.query === "string" ? value.query.slice(0, 160) : "",
      selectedObjectId: typeof value.selectedObjectId === "string" ? value.selectedObjectId : null,
      scrollTop: Number.isFinite(value.scrollTop) && Number(value.scrollTop) >= 0 ? Number(value.scrollTop) : 0,
      character: normalizeCharacterDirectoryWorkspaceState(value.character)
    };
  } catch {
    return defaultDirectoryWorkspaceState(fallbackOpen);
  }
}

function defaultCharacterDirectoryWorkspaceState(): DirectoryWorkspaceState["character"] {
  return { view: "active", tagFilter: "", categoryFilter: "all", roleFilter: "all", multi: false, selectedIds: [], scrollTop: 0 };
}

function normalizeCharacterDirectoryWorkspaceState(value: unknown): DirectoryWorkspaceState["character"] {
  const fallback = defaultCharacterDirectoryWorkspaceState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    view: record.view === "archived" || record.view === "trash" ? record.view : "active",
    tagFilter: typeof record.tagFilter === "string" ? record.tagFilter.slice(0, 120) : "",
    categoryFilter: typeof record.categoryFilter === "string" ? record.categoryFilter.slice(0, 160) : "all",
    roleFilter: typeof record.roleFilter === "string" ? record.roleFilter.slice(0, 120) : "all",
    multi: record.multi === true,
    selectedIds: Array.isArray(record.selectedIds) ? record.selectedIds.filter((item): item is string => typeof item === "string").slice(0, 100) : [],
    scrollTop: Number.isFinite(record.scrollTop) && Number(record.scrollTop) >= 0 ? Number(record.scrollTop) : 0
  };
}

export function writeDirectoryWorkspaceState(projectId: string | null, state: DirectoryWorkspaceState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(directoryWorkspaceStorageKey(projectId), JSON.stringify(state));
}

export function resolveDirectoryPresentation(input: { preferredOpen: boolean; temporarySurface: DirectoryTemporarySurface }): boolean {
  return input.preferredOpen && input.temporarySurface === "none";
}
