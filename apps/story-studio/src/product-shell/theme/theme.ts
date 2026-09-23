export type ShellTheme = "cloud-ink" | "night-paper";

/** The topbar reads its visible theme name from this authoritative shell registry. */
export const SHELL_THEME_REGISTRY: Record<ShellTheme, { labelKey: "topbar.themeCloud" | "topbar.themeNight" }> = {
  "cloud-ink": { labelKey: "topbar.themeCloud" },
  "night-paper": { labelKey: "topbar.themeNight" }
};

export function resolveInitialShellTheme(): ShellTheme {
  const requested = new URLSearchParams(window.location.search).get("theme");
  if (requested === "night-paper" || requested === "cloud-ink") return requested;
  try { return window.localStorage.getItem("tianyan.shell.theme") === "night-paper" ? "night-paper" : "cloud-ink"; }
  catch { return "cloud-ink"; }
}
