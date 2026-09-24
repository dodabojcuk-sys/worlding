/**
 * Browser-local layout preference for the Nuwa-led main + auxiliary workspace.
 * It only remembers presentation (auxiliary rail open state and width); it is
 * not a story fact owner and never touches project data.
 */
export type NuwaAuxiliaryLayout = { auxiliaryOpen: boolean; auxiliaryWidth: number };

export const NUWA_AUXILIARY_MIN_WIDTH_PX = 240;
export const NUWA_AUXILIARY_MAX_WIDTH_PX = 440;
const NUWA_AUXILIARY_DEFAULT_WIDTH_PX = 320;
const NUWA_AUXILIARY_SNAP_PRESETS_PX = [248, 320, 400] as const;
const NUWA_AUXILIARY_SNAP_THRESHOLD_PX = 14;
const LAYOUT_KEY_PREFIX = "tianyan-nuwa-workspace-layout:";

export function clampNuwaAuxiliaryWidth(value: unknown): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return NUWA_AUXILIARY_DEFAULT_WIDTH_PX;
  return Math.round(Math.min(NUWA_AUXILIARY_MAX_WIDTH_PX, Math.max(NUWA_AUXILIARY_MIN_WIDTH_PX, numeric)));
}

/** Mirrors the directory sidebar's snap approach: presets win within a small threshold. */
export function snapNuwaAuxiliaryWidth(value: unknown): number {
  const width = clampNuwaAuxiliaryWidth(value);
  const nearest = NUWA_AUXILIARY_SNAP_PRESETS_PX.reduce((current, candidate) => Math.abs(width - candidate) < Math.abs(width - current) ? candidate : current);
  return Math.abs(width - nearest) <= NUWA_AUXILIARY_SNAP_THRESHOLD_PX ? nearest : width;
}

export function readNuwaAuxiliaryLayout(projectId: string | null): NuwaAuxiliaryLayout {
  const fallback: NuwaAuxiliaryLayout = { auxiliaryOpen: true, auxiliaryWidth: NUWA_AUXILIARY_DEFAULT_WIDTH_PX };
  if (!projectId) return fallback;
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(`${LAYOUT_KEY_PREFIX}${projectId}`) ?? "null");
    if (!value || typeof value !== "object") return fallback;
    const input = value as Partial<NuwaAuxiliaryLayout>;
    return { auxiliaryOpen: input.auxiliaryOpen !== false, auxiliaryWidth: clampNuwaAuxiliaryWidth(input.auxiliaryWidth) };
  } catch {
    return fallback;
  }
}

export function writeNuwaAuxiliaryLayout(projectId: string | null, layout: NuwaAuxiliaryLayout): void {
  if (!projectId) return;
  try {
    window.localStorage.setItem(`${LAYOUT_KEY_PREFIX}${projectId}`, JSON.stringify({ auxiliaryOpen: layout.auxiliaryOpen, auxiliaryWidth: clampNuwaAuxiliaryWidth(layout.auxiliaryWidth) }));
  } catch {
    // A blocked storage keeps the session-local layout; nothing else is lost.
  }
}

/** Reserve readable author space before allocating optional panes. */
export function resolveNuwaPaneWidths(width: number, eventOpen: boolean, preferredEventWidth: number, inspectorOpen: boolean) {
  const primary = 480;
  const inspector = inspectorOpen ? 280 : 52;
  const eventRoom = width - primary - inspector - 38;
  const eventInline = eventOpen && eventRoom >= NUWA_AUXILIARY_MIN_WIDTH_PX;
  const eventWidth = Math.min(preferredEventWidth, Math.max(NUWA_AUXILIARY_MIN_WIDTH_PX, eventRoom));
  const inspectorInline = width >= primary + inspector + (eventInline ? eventWidth + 38 : 60);
  return { eventInline, eventWidth, inspectorInline, preferredWidth: primary + inspector + (eventOpen ? preferredEventWidth + 38 : 60) };
}
