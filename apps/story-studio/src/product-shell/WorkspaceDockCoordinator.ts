import { useSyncExternalStore } from "react";

/**
 * A Workspace is the routed, central authoring area. A Surface is the single,
 * temporary work face coordinated by the Shell around that Workspace.
 *
 * `floating` is deliberately type-only in R1. It currently resolves to an
 * overlay and stores neither geometry nor a layout preference; a later slice
 * may add a renderer without making this manager a persistence owner.
 */
export type WorkspaceSurfacePlacement = "docked" | "overlay" | "hidden";
export type WorkspaceSurfacePlacementExtension = WorkspaceSurfacePlacement | "floating";

export const WORKSPACE_SURFACE_KINDS = [
  "object-inspector",
  "relation-review",
  "creation-surface",
  "tianyi-assistant",
  "nuwa-inspector",
  "character-context",
  "character-fate",
  "world-evolution",
  "relationship-flow",
  "future-projection-map"
] as const;

export type WorkspaceSurfaceKind = typeof WORKSPACE_SURFACE_KINDS[number];

export type EventLineSurfaceViewMode = "event-detail" | "relation-review" | "event-create";
export type EventLineSurfaceContext = Readonly<{
  projectId: string;
  eventId: string | null;
  workVersionId: string | null;
  viewMode: EventLineSurfaceViewMode;
}>;

export type WorkspaceSurfaceReservation = Readonly<{
  kind: Extract<WorkspaceSurfaceKind, "character-fate" | "world-evolution" | "relationship-flow" | "future-projection-map">;
  title: string;
  unavailableMessage: string;
}>;

/**
 * Capability registration is intentionally display-only. A reservation is not
 * a feature owner, data source, prediction, or authorization grant.
 */
export const WORKSPACE_SURFACE_RESERVATIONS: readonly WorkspaceSurfaceReservation[] = [
  { kind: "character-fate", title: "角色命运演化", unavailableMessage: "命运演化未接入" },
  { kind: "world-evolution", title: "世界演化", unavailableMessage: "世界演化分析未接入" },
  { kind: "relationship-flow", title: "关系演化", unavailableMessage: "关系演化未接入" },
  { kind: "future-projection-map", title: "未来可能性图", unavailableMessage: "未来推演视图未接入" }
];

export function getWorkspaceSurfaceReservation(kind: WorkspaceSurfaceKind): WorkspaceSurfaceReservation | null {
  return WORKSPACE_SURFACE_RESERVATIONS.find((reservation) => reservation.kind === kind) ?? null;
}

/**
 * A Context Package only references an existing entity in a versioned scope.
 * It never copies object content and is not a second fact source.
 */
export type SurfaceContextPackage = Readonly<{
  /** The referenced domain object; never an embedded object snapshot. */
  objectType: "character" | "event" | "location" | "story-unit";
  objectId: string;
  projectId: string;
  workVersionId: string | null;
  /** Why this object entered the next temporary work face. */
  sourceContext: string;
  /** The routed view that initiated the handoff, not a new navigation owner. */
  currentView: "tianyi" | "nuwa" | "event-line" | "project-directory";
}>;

/**
 * This is intentionally a transport-free context envelope. It can later carry
 * a Context Package reference, but does not construct, persist, or authorize
 * one here.
 */
export type WorkspaceSurfaceContext = Readonly<{
  projectId?: string | null;
  workVersionId?: string | null;
  ownerId?: string | null;
  eventId?: string | null;
  relationId?: string | null;
  runId?: string | null;
  actorId?: string | null;
  characterId?: string | null;
  stepId?: string | null;
  viewMode?: EventLineSurfaceViewMode;
  contextPackage?: SurfaceContextPackage;
}>;

export type WorkspaceSurfaceInstance = Readonly<{
  id: string;
  kind: WorkspaceSurfaceKind;
  context: WorkspaceSurfaceContext;
  requestedPlacement: WorkspaceSurfacePlacementExtension;
  placement: WorkspaceSurfacePlacement;
}>;

export type OpenWorkspaceSurfaceInput = Readonly<{
  kind: WorkspaceSurfaceKind;
  context?: WorkspaceSurfaceContext;
  placement?: WorkspaceSurfacePlacementExtension;
}>;

export const RIGHT_WORK_SURFACE_MODES = [
  "NONE",
  "EVENT_DETAILS",
  "EVENT_CREATE",
  "RELATION_REVIEW",
  "TIANYI",
  "NUWA_INSPECTOR"
] as const;

export type RightWorkSurfaceMode = typeof RIGHT_WORK_SURFACE_MODES[number];

/**
 * `mode` and `ownerId` remain while older page workspaces migrate. They are a
 * read-only compatibility projection of the one Surface instance, never a
 * second state store.
 */
export type RightWorkSurfaceState = Readonly<{
  activeSurface: WorkspaceSurfaceInstance | null;
  mode: RightWorkSurfaceMode;
  ownerId: string | null;
}>;

function modeFor(surface: WorkspaceSurfaceInstance | null): RightWorkSurfaceMode {
  if (!surface || surface.placement === "hidden") return "NONE";
  if (surface.kind === "relation-review") return "RELATION_REVIEW";
  if (surface.kind === "tianyi-assistant") return "TIANYI";
  if (surface.kind === "nuwa-inspector") return "NUWA_INSPECTOR";
  if (surface.kind === "creation-surface") return "EVENT_CREATE";
  return "EVENT_DETAILS";
}

function instanceId(kind: WorkspaceSurfaceKind, context: WorkspaceSurfaceContext): string {
  const scope = context.relationId ?? context.eventId ?? context.runId ?? context.projectId ?? "workspace";
  return `${kind}:${scope}`;
}

function snapshotFor(surface: WorkspaceSurfaceInstance | null): RightWorkSurfaceState {
  return { activeSurface: surface, mode: modeFor(surface), ownerId: surface?.context.ownerId ?? null };
}

let currentSurface = snapshotFor(null);
const listeners = new Set<() => void>();

function publish(next: WorkspaceSurfaceInstance | null): WorkspaceSurfaceInstance | null {
  const nextSnapshot = snapshotFor(next);
  if (currentSurface.activeSurface === nextSnapshot.activeSurface) return currentSurface.activeSurface;
  currentSurface = nextSnapshot;
  listeners.forEach((listener) => listener());
  return next;
}

function isActive(kind: WorkspaceSurfaceKind): boolean {
  return currentSurface.activeSurface?.kind === kind;
}

/**
 * The sole transient Surface coordinator. It has a one-instance capacity by
 * design: opening a different Surface destroys the previous temporary face and
 * leaves the routed Workspace intact underneath.
 */
export const workspaceSurfaceManager = {
  snapshot(): RightWorkSurfaceState {
    return currentSurface;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  openSurface(input: OpenWorkspaceSurfaceInput): WorkspaceSurfaceInstance {
    const context = input.context ?? {};
    const requestedPlacement = input.placement ?? "docked";
    const placement: WorkspaceSurfacePlacement = requestedPlacement === "floating" ? "overlay" : requestedPlacement;
    const next: WorkspaceSurfaceInstance = {
      id: instanceId(input.kind, context),
      kind: input.kind,
      context,
      requestedPlacement,
      placement
    };
    return publish(next)!;
  },
  closeSurface(target?: WorkspaceSurfaceKind | string): void {
    const active = currentSurface.activeSurface;
    if (!active || (target && target !== active.kind && target !== active.id)) return;
    publish(null);
  },
  hideSurface(target?: WorkspaceSurfaceKind | string): void {
    const active = currentSurface.activeSurface;
    if (!active || (target && target !== active.kind && target !== active.id) || active.placement === "hidden") return;
    publish({ ...active, placement: "hidden" });
  },
  restoreSurface(target?: WorkspaceSurfaceKind | string): void {
    const active = currentSurface.activeSurface;
    if (!active || (target && target !== active.kind && target !== active.id) || active.placement !== "hidden") return;
    publish({ ...active, placement: active.requestedPlacement === "floating" ? "overlay" : active.requestedPlacement });
  },
  isActive
};

/** Compatibility facade for existing page workspaces during the R1 migration. */
export const workspaceDockCoordinator = {
  snapshot: workspaceSurfaceManager.snapshot,
  subscribe: workspaceSurfaceManager.subscribe,
  openPageInspector(pageId: string, mode: Exclude<RightWorkSurfaceMode, "NONE" | "TIANYI" | "NUWA_INSPECTOR"> = "EVENT_DETAILS"): void {
    workspaceSurfaceManager.openSurface({
      kind: mode === "RELATION_REVIEW" ? "relation-review" : mode === "EVENT_CREATE" ? "creation-surface" : "object-inspector",
      context: { projectId: "legacy-page-surface", eventId: mode === "EVENT_DETAILS" ? pageId : null, workVersionId: null, viewMode: mode === "EVENT_CREATE" ? "event-create" : mode === "RELATION_REVIEW" ? "relation-review" : "event-detail" }
    });
  },
  openQuickTianyi(): void {
    workspaceSurfaceManager.openSurface({ kind: "tianyi-assistant", context: { ownerId: "tianyi-agent" } });
  },
  closePageInspector(pageId: string): void {
    const active = currentSurface.activeSurface;
    if (active?.context.eventId === pageId && ["object-inspector", "relation-review", "creation-surface"].includes(active.kind)) workspaceSurfaceManager.closeSurface();
  },
  closeQuickTianyi(): void {
    workspaceSurfaceManager.closeSurface("tianyi-assistant");
  },
  close(): void {
    workspaceSurfaceManager.closeSurface();
  }
};

export function useWorkspaceSurface(): RightWorkSurfaceState {
  return useSyncExternalStore(workspaceSurfaceManager.subscribe, workspaceSurfaceManager.snapshot, workspaceSurfaceManager.snapshot);
}

export function useWorkspaceDockSlot(): RightWorkSurfaceState {
  return useWorkspaceSurface();
}
