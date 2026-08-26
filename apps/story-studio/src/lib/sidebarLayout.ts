export const SIDEBAR_ICON_WIDTH_PX = 56;
export const SIDEBAR_COMPACT_WIDTH_PX = 196;
export const SIDEBAR_STANDARD_WIDTH_PX = 248;
export const SIDEBAR_MIN_WIDTH_PX = SIDEBAR_COMPACT_WIDTH_PX;
export const SIDEBAR_MAX_WIDTH_PX = 320;
export const SIDEBAR_SNAP_THRESHOLD_PX = 12;

export type SidebarWidthMode = "compact" | "standard" | "custom";

export type SidebarWidthPreference = {
  sidebarWidth: SidebarWidthMode;
  sidebarCustomWidthPx: number;
};

export function clampSidebarWidth(value: unknown, fallback = SIDEBAR_STANDARD_WIDTH_PX): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return clampSidebarWidth(fallback, SIDEBAR_STANDARD_WIDTH_PX);
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, numeric)));
}

export function snapSidebarWidth(value: unknown, threshold = SIDEBAR_SNAP_THRESHOLD_PX): number {
  const width = clampSidebarWidth(value);
  const safeThreshold = Math.max(0, Number.isFinite(threshold) ? threshold : SIDEBAR_SNAP_THRESHOLD_PX);
  const presets = [SIDEBAR_COMPACT_WIDTH_PX, SIDEBAR_STANDARD_WIDTH_PX] as const;
  const nearest = presets.reduce((current, candidate) => Math.abs(width - candidate) < Math.abs(width - current) ? candidate : current);
  return Math.abs(width - nearest) <= safeThreshold ? nearest : width;
}

export function resolveSidebarWidthPx(mode: SidebarWidthMode, customWidthPx: unknown): number {
  if (mode === "compact") return SIDEBAR_COMPACT_WIDTH_PX;
  if (mode === "standard") return SIDEBAR_STANDARD_WIDTH_PX;
  return clampSidebarWidth(customWidthPx);
}

export function sidebarPreferenceFromPixels(value: unknown): SidebarWidthPreference {
  const width = snapSidebarWidth(value);
  if (width === SIDEBAR_COMPACT_WIDTH_PX) {
    return { sidebarWidth: "compact", sidebarCustomWidthPx: SIDEBAR_COMPACT_WIDTH_PX };
  }
  if (width === SIDEBAR_STANDARD_WIDTH_PX) {
    return { sidebarWidth: "standard", sidebarCustomWidthPx: SIDEBAR_STANDARD_WIDTH_PX };
  }
  return { sidebarWidth: "custom", sidebarCustomWidthPx: width };
}
