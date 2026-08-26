/** Presentation-only Tianyi state that must never restore a retired surface. */
export const RETIRED_TIANYI_UI_PREFERENCE_KEYS = [
  "story-studio:tianyi:view",
  "story-studio:tianyi:last-view",
  "story-studio:tianyi:lastView",
  "story-studio:tianyi:surface",
  "story-studio:tianyi-v2:view",
  "story-studio:tianyi-v2:surface",
  "tianyan:tianyi:view",
  "tianyan:tianyi:lastView"
] as const;

export type RetiredUiLocationInput = { pathname: string; search: string; hash?: string };
export type RetiredUiLocation = RetiredUiLocationInput & { changed: boolean; retiredSurface: "tianyi-view" | "tianyi-v2-alias" | null };

/** Canonicalizes retired presentation state without touching domain query data. */
export function normalizeRetiredUiLocation(input: RetiredUiLocationInput): RetiredUiLocation {
  const url = new URL(`http://story-studio.local${input.pathname}${input.search}${input.hash ?? ""}`);
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  url.pathname = pathname;
  let changed = false;
  let retiredSurface: RetiredUiLocation["retiredSurface"] = null;

  if (pathname === "/tianyi-v2") {
    url.pathname = "/tianyi";
    retiredSurface = "tianyi-v2-alias";
    changed = true;
  }
  if (url.pathname === "/tianyi" && url.searchParams.has("view")) {
    url.searchParams.delete("view");
    retiredSurface = retiredSurface ?? "tianyi-view";
    changed = true;
  }
  if (url.pathname === "/tianyi" && url.searchParams.has("founderPreview")) {
    url.searchParams.delete("founderPreview");
    changed = true;
  }
  return { pathname: url.pathname, search: url.search, hash: url.hash, changed, retiredSurface };
}

export function clearRetiredTianyiUiPreferences(storage: Pick<Storage, "removeItem"> | null | undefined): void {
  if (!storage) return;
  for (const key of RETIRED_TIANYI_UI_PREFERENCE_KEYS) {
    try { storage.removeItem(key); } catch { /* presentation storage is optional */ }
  }
}

export function clearRetiredTianyiUiPreferencesFromBrowser(): void {
  if (typeof window === "undefined") return;
  clearRetiredTianyiUiPreferences(readOptionalBrowserStorage("local"));
  clearRetiredTianyiUiPreferences(readOptionalBrowserStorage("session"));
}

function readOptionalBrowserStorage(kind: "local" | "session"): Storage | null {
  try { return window[`${kind}Storage`]; } catch { return null; }
}
