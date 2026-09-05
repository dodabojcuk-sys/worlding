export type ShellFocusLayout = "wide" | "focused" | "narrow";

export const MAIN_WORKSPACE_SAFE_WIDTH = 840;
export const MAIN_WORKSPACE_NARROW_WIDTH = 640;

export function resolveShellFocusLayout(input: {
  shellWidth: number;
  railWidth: number;
  directoryWidth: number;
  contextDockWidth: number;
  toolRailWidth: number;
}): ShellFocusLayout {
  const chromeWidth = input.railWidth + input.directoryWidth + input.contextDockWidth + input.toolRailWidth;
  const remaining = input.shellWidth - chromeWidth;
  if (remaining >= MAIN_WORKSPACE_SAFE_WIDTH) return "wide";
  if (input.shellWidth - input.railWidth >= MAIN_WORKSPACE_NARROW_WIDTH) return "focused";
  return "narrow";
}

export function cssLength(element: HTMLElement, name: string): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  if (value.endsWith("rem")) return Number.parseFloat(value) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.parseFloat(value) || 0;
}
