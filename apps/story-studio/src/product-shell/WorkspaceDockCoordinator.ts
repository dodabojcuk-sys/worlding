import { useSyncExternalStore } from "react";

/**
 * The App Shell owns the single wide right-hand slot. Page inspectors and
 * contextual Tianyi can keep their local lens/session state, but cannot each
 * independently claim layout space.
 */
export type WorkspaceDockSlot =
  | { kind: "closed" }
  | { kind: "page-inspector"; pageId: string }
  | { kind: "quick-tianyi" };

let currentSlot: WorkspaceDockSlot = { kind: "closed" };
const listeners = new Set<() => void>();

function publish(next: WorkspaceDockSlot): void {
  if (currentSlot.kind === next.kind && (next.kind !== "page-inspector" || (currentSlot.kind === "page-inspector" && currentSlot.pageId === next.pageId))) return;
  currentSlot = next;
  listeners.forEach((listener) => listener());
}

export const workspaceDockCoordinator = {
  snapshot(): WorkspaceDockSlot {
    return currentSlot;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  openPageInspector(pageId: string): void {
    publish({ kind: "page-inspector", pageId });
  },
  openQuickTianyi(): void {
    publish({ kind: "quick-tianyi" });
  },
  closePageInspector(pageId: string): void {
    if (currentSlot.kind === "page-inspector" && currentSlot.pageId === pageId) publish({ kind: "closed" });
  },
  closeQuickTianyi(): void {
    if (currentSlot.kind === "quick-tianyi") publish({ kind: "closed" });
  }
};

export function useWorkspaceDockSlot(): WorkspaceDockSlot {
  return useSyncExternalStore(workspaceDockCoordinator.subscribe, workspaceDockCoordinator.snapshot, workspaceDockCoordinator.snapshot);
}
