export type ShellTheme = "cloud-ink" | "night-paper";

export function resolveInitialShellTheme(): ShellTheme {
  return new URLSearchParams(window.location.search).get("theme") === "night-paper" ? "night-paper" : "cloud-ink";
}
