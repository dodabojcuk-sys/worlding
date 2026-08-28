/**
 * Presentation-only R0 shell contract.
 *
 * Story spaces live exclusively in `storyStudioWorkspaceRegistry.ts`.
 * These types own no Canon, Event, WorldState, session, context, or author decision.
 */
export type TianyanR0PanelId = "project-directory" | "global-tianyi" | "page-inspector";
export type TianyanR0PanelSide = "inline-start" | "inline-end";
export type TianyanR0PanelMode = "docked" | "floating" | "hidden";
export type TianyanR0SnapMode = "none" | "edge" | "neighbor";

export type TianyanR0PanelPlacement = {
  id: TianyanR0PanelId;
  visible: boolean;
  side: TianyanR0PanelSide;
  mode: TianyanR0PanelMode;
  snap: TianyanR0SnapMode;
  order: number;
};

export type TianyanR0ShellLayoutState = Record<TianyanR0PanelId, TianyanR0PanelPlacement>;

/** R0.1 command panel acts on shell presentation only, never business data or indexes. */
export const TIAN_YAN_R0_COMMAND_PANEL_SCOPE = {
  destinations: "registry-only",
  rail: "visibility-only",
  panels: "visibility-only",
  locale: "presentation-only",
  theme: "presentation-only",
  businessSearch: false
} as const;

export const TIAN_YAN_R0_DEFAULT_LAYOUT: TianyanR0ShellLayoutState = {
  "project-directory": {
    id: "project-directory",
    visible: true,
    side: "inline-start",
    mode: "docked",
    snap: "none",
    order: 1
  },
  "global-tianyi": {
    id: "global-tianyi",
    visible: false,
    side: "inline-end",
    mode: "docked",
    snap: "none",
    order: 1
  },
  "page-inspector": {
    id: "page-inspector",
    visible: false,
    side: "inline-end",
    mode: "docked",
    snap: "none",
    order: 2
  }
};
