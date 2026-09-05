import { useState } from "react";

import { pageToolAvailable } from "../../components/page-tools/pageToolRegistry.ts";
import { DOCK_PANEL_MAX_SIZE, DOCK_PANEL_MIN_SIZE, type DockLayoutState, type DockToolId } from "./types.ts";

export function createInitialDockLayout(): DockLayoutState {
  return {
    openPanelIds: [],
    panelSizes: { "expert-analysis": 260, "engineering-log": 320 },
    activeToolId: null
  };
}

export function clampDockPanelSize(size: number): number {
  return Math.min(DOCK_PANEL_MAX_SIZE, Math.max(DOCK_PANEL_MIN_SIZE, Math.round(size)));
}

export function toggleDockPanel(state: DockLayoutState, toolId: DockToolId): DockLayoutState {
  if (!pageToolAvailable(toolId)) return normalizeDockLayoutState(state);
  const isOpen = state.activeToolId === toolId;
  const activeToolId = isOpen ? null : toolId;
  return {
    ...state,
    openPanelIds: activeToolId ? [activeToolId] : [],
    activeToolId
  };
}

/** Migrates pre-R2.2A multi-panel state without rendering more than one tool. */
export function normalizeDockLayoutState(state: DockLayoutState): DockLayoutState {
  const requested = state.activeToolId ?? state.openPanelIds.at(-1) ?? null;
  const activeToolId = requested && pageToolAvailable(requested) ? requested : null;
  return { ...state, activeToolId, openPanelIds: activeToolId ? [activeToolId] : [] };
}

export function resizeDockPanel(state: DockLayoutState, toolId: DockToolId, nextSize: number): DockLayoutState {
  return { ...state, panelSizes: { ...state.panelSizes, [toolId]: clampDockPanelSize(nextSize) } };
}

export function useDockLayoutState() {
  const [state, setState] = useState(createInitialDockLayout);
  return {
    state,
    togglePanel: (toolId: DockToolId) => setState((current) => toggleDockPanel(current, toolId)),
    closePanel: () => setState((current) => ({ ...current, openPanelIds: [], activeToolId: null })),
    resizePanel: (toolId: DockToolId, nextSize: number) => setState((current) => resizeDockPanel(current, toolId, nextSize))
  };
}
