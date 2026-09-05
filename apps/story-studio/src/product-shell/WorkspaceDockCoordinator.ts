import { useSyncExternalStore } from "react";

export const RIGHT_WORK_SURFACE_MODES = [
  "NONE",
  "EVENT_DETAILS",
  "EVENT_CREATE",
  "RELATION_REVIEW",
  "TIANYI"
] as const;

export type RightWorkSurfaceMode = typeof RIGHT_WORK_SURFACE_MODES[number];
export type RightWorkSurfaceState = {
  mode: RightWorkSurfaceMode;
  ownerId: string | null;
};

/**
 * The App Shell owns one right work surface. Event details, event creation,
 * relation review, and Tianyi may keep their own content state, but only this
 * coordinator decides which one is visible.
 */
let currentSurface: RightWorkSurfaceState = { mode: "NONE", ownerId: null };
const listeners = new Set<() => void>();

function publish(next: RightWorkSurfaceState): void {
  if (currentSurface.mode === next.mode && currentSurface.ownerId === next.ownerId) return;
  currentSurface = next;
  listeners.forEach((listener) => listener());
}

export const workspaceDockCoordinator = {
  snapshot(): RightWorkSurfaceState {
    return currentSurface;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  openPageInspector(pageId: string, mode: Exclude<RightWorkSurfaceMode, "NONE" | "TIANYI"> = "EVENT_DETAILS"): void {
    publish({ mode, ownerId: pageId });
  },
  openQuickTianyi(): void {
    publish({ mode: "TIANYI", ownerId: "tianyi-agent" });
  },
  closePageInspector(pageId: string): void {
    if (currentSurface.ownerId === pageId && currentSurface.mode !== "TIANYI") publish({ mode: "NONE", ownerId: null });
  },
  closeQuickTianyi(): void {
    if (currentSurface.mode === "TIANYI") publish({ mode: "NONE", ownerId: null });
  },
  close(): void {
    publish({ mode: "NONE", ownerId: null });
  }
};

export function useWorkspaceDockSlot(): RightWorkSurfaceState {
  return useSyncExternalStore(workspaceDockCoordinator.subscribe, workspaceDockCoordinator.snapshot, workspaceDockCoordinator.snapshot);
}
