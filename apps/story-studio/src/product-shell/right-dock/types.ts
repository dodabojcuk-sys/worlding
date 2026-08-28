export type DockToolId = "engineering-log" | "expert-analysis" | "reader-appreciation" | "language-check" | "history" | "extensions";

export type DockLayoutState = {
  openPanelIds: DockToolId[];
  panelSizes: Partial<Record<DockToolId, number>>;
  activeToolId: DockToolId | null;
  isTianyiOpen: boolean;
};

export const DOCK_PANEL_MIN_SIZE = 160;
export const DOCK_PANEL_MAX_SIZE = 640;
