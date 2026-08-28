/** Presentation-only placement protocol. It persists no story or session data. */
export type R0PanelId = "directory" | "page-tools" | "global-tianyi" | "page-log";
export type R0DockEdge = "left" | "right" | "bottom";
export type R0PanelMode = "docked" | "floating" | "hidden";

export type R0PanelPlacement = {
  panel: R0PanelId;
  mode: R0PanelMode;
  edge: R0DockEdge;
  width: "narrow" | "regular" | "wide";
};

/**
 * R0 only renders docked/hidden panels. `floating` is intentionally a protocol
 * value for the next stage; it has no drag or persistence behavior yet.
 */
export const R0_DEFAULT_PANEL_PLACEMENTS: readonly R0PanelPlacement[] = [
  { panel: "directory", mode: "docked", edge: "left", width: "regular" },
  { panel: "page-tools", mode: "docked", edge: "right", width: "narrow" },
  { panel: "global-tianyi", mode: "docked", edge: "right", width: "regular" },
  { panel: "page-log", mode: "docked", edge: "bottom", width: "wide" }
];
