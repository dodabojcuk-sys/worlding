export type ShellTheme = "cloud-ink" | "night-paper";

/** The topbar reads its visible theme name from this authoritative shell registry. */
export const SHELL_THEME_REGISTRY: Record<ShellTheme, { labelKey: "topbar.themeCloud" | "topbar.themeNight" }> = {
  "cloud-ink": { labelKey: "topbar.themeCloud" },
  "night-paper": { labelKey: "topbar.themeNight" }
};

export function resolveInitialShellTheme(): ShellTheme {
  return new URLSearchParams(window.location.search).get("theme") === "night-paper" ? "night-paper" : "cloud-ink";
}
