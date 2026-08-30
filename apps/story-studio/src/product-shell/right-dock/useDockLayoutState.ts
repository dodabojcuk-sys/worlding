import { useState } from "react";

import { DOCK_PANEL_MAX_SIZE, DOCK_PANEL_MIN_SIZE, type DockLayoutState, type DockToolId } from "./types.ts";

export function createInitialDockLayout(initialTianyiOpen = true): DockLayoutState {
  return {
    openPanelIds: [],
    panelSizes: { "expert-analysis": 260, "engineering-log": 320 },
    activeToolId: null,
    isTianyiOpen: initialTianyiOpen
  };
}

export function clampDockPanelSize(size: number): number {
  return Math.min(DOCK_PANEL_MAX_SIZE, Math.max(DOCK_PANEL_MIN_SIZE, Math.round(size)));
}

export function toggleDockPanel(state: DockLayoutState, toolId: DockToolId): DockLayoutState {
  const isOpen = state.openPanelIds.includes(toolId);
  const openPanelIds = isOpen
    ? state.openPanelIds.filter((id) => id !== toolId)
    : [...state.openPanelIds, toolId];
  return {
    ...state,
    openPanelIds,
    activeToolId: isOpen ? openPanelIds.at(-1) ?? null : toolId
  };
}

export function resizeDockPanel(state: DockLayoutState, toolId: DockToolId, nextSize: number): DockLayoutState {
  return { ...state, panelSizes: { ...state.panelSizes, [toolId]: clampDockPanelSize(nextSize) } };
}

export function useDockLayoutState(initialTianyiOpen = true) {
  const [state, setState] = useState(() => createInitialDockLayout(initialTianyiOpen));
  return {
    state,
    togglePanel: (toolId: DockToolId) => setState((current) => toggleDockPanel(current, toolId)),
    resizePanel: (toolId: DockToolId, nextSize: number) => setState((current) => resizeDockPanel(current, toolId, nextSize)),
    setTianyiOpen: (open: boolean) => setState((current) => ({ ...current, isTianyiOpen: open })),
    toggleTianyi: () => setState((current) => ({ ...current, isTianyiOpen: !current.isTianyiOpen }))
  };
}
