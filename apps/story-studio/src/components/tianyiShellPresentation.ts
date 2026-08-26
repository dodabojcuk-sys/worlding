import {
  TIANYI_PANEL_DEFAULT_WIDTH_PX,
  TIANYI_PANEL_MAX_WIDTH_PX,
  TIANYI_PANEL_MIN_WIDTH_PX,
  clampTianyiPanelWidth
} from "../lib/controlCenterPreferences.ts";
import type { TianyiShellContext } from "./tianyiShellContext";

export type TianyiQuickPlacement = "closed" | "floating" | "pinned";
export type TianyiResponsivePanelMode = "floating" | "right-dock";

export const TIANYI_PINNED_WIDTH_MIN = TIANYI_PANEL_MIN_WIDTH_PX;
export const TIANYI_PINNED_WIDTH_MAX = TIANYI_PANEL_MAX_WIDTH_PX;
export const TIANYI_PINNED_WIDTH_DEFAULT = TIANYI_PANEL_DEFAULT_WIDTH_PX;
/**
 * A pinned Tianyi surface always owns the shell's right dock. At narrow
 * desktop widths the shell narrows that column; it must never turn the panel
 * into a second content-flow surface that can overlap the workspace.
 */
export function resolveTianyiResponsivePanelMode(input: {
  placement: TianyiQuickPlacement;
  productMode: string;
  shellWidth: number;
  navigationWidth: number;
  pinnedWidth: number;
  pageDockWidth?: number;
}): TianyiResponsivePanelMode {
  if (input.placement !== "pinned") return "floating";
  return "right-dock";
}

/** Keeps the author-controlled Tianyi rail inside the shell's supported width. */
export function clampTianyiPinnedWidth(width: number): number {
  return clampTianyiPanelWidth(width);
}

/**
 * The resize handle sits on the panel's left edge: moving left widens the rail,
 * while moving right narrows it.
 */
export function resizeTianyiPinnedWidth(startWidth: number, startX: number, currentX: number): number {
  return clampTianyiPinnedWidth(clampTianyiPinnedWidth(startWidth) + startX - currentX);
}

export function summarizeTianyiContext(context: TianyiShellContext): { label: string; sources: string } {
  return {
    label: context.contextLabel || "当前世界",
    sources: context.sourceLabels.join(" · ")
  };
}

export function shouldShowTianyiSuggestions(draft: string): boolean {
  return draft.trim().length === 0;
}

/**
 * A taller pinned rail may temporarily have no physical scroll range. Keep the
 * author's prior anchor so floating mode can restore the same conversation spot.
 */
export function preserveTianyiScrollAnchor(input: {
  currentScrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  previousAnchor: number;
}): number {
  const currentRange = Math.max(0, input.scrollHeight - input.clientHeight);
  const currentScrollTop = Math.max(0, input.currentScrollTop);
  const previousAnchor = Math.max(0, input.previousAnchor);
  if (currentRange <= 1) return previousAnchor;
  if (currentScrollTop >= currentRange - 1 && previousAnchor > currentRange) return previousAnchor;
  return currentScrollTop;
}
