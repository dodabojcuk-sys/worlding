export const SHELL_RAIL_AUTO_COLLAPSE_QUERY = "(max-width: 75rem)";
export const SHELL_DIRECTORY_OVERLAY_QUERY = "(max-width: 76rem)";

export type ShellRailPreference = "auto" | "collapsed" | "expanded";

export function resolveShellRailCollapsed(preference: ShellRailPreference, autoCollapse: boolean): boolean {
  if (preference === "collapsed") return true;
  if (preference === "expanded") return false;
  return autoCollapse;
}

export function nextShellRailPreference(currentCollapsed: boolean): ShellRailPreference {
  return currentCollapsed ? "expanded" : "collapsed";
}

export function resolveInitialDirectoryOpen(overlay: boolean): boolean {
  return !overlay;
}
