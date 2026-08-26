/**
 * URL-only presentation state for the two authoring workspaces. These route
 * segments select existing workbench views; they are not domain identities,
 * persistence owners, or a second navigation registry.
 */
export type MultiverseRouteMode = "translation" | "pov" | "if" | "adaptation" | null;
export type CreationRouteMode = "hub" | "novel" | "screenplay" | "comic" | "interactive" | "translation-adaptation" | "plugins";

const multiversePaths: Record<Exclude<MultiverseRouteMode, null>, string> = {
  translation: "/multiverse/translation",
  pov: "/multiverse/perspective",
  if: "/multiverse/if",
  adaptation: "/multiverse/localization"
};

const legacyMultiversePaths: Record<string, Exclude<MultiverseRouteMode, null>> = {
  "/multiverse/pov": "pov",
  "/multiverse/fan-localization": "adaptation"
};

const creationPaths: Record<CreationRouteMode, string> = {
  hub: "/creation",
  novel: "/creation/novel",
  screenplay: "/creation/screenplay",
  comic: "/creation/comic",
  interactive: "/creation/interactive",
  "translation-adaptation": "/creation/translation-adaptation",
  plugins: "/creation/plugins"
};

export function readMultiverseRouteMode(pathname: string): MultiverseRouteMode {
  const normalized = normalize(pathname);
  return (Object.entries(multiversePaths).find(([, path]) => path === normalized)?.[0] as Exclude<MultiverseRouteMode, null> | undefined) || legacyMultiversePaths[normalized] || null;
}

export function multiverseRouteForMode(mode: MultiverseRouteMode): string {
  return mode ? multiversePaths[mode] : "/multiverse";
}

export function readCreationRouteMode(pathname: string): CreationRouteMode {
  const normalized = normalize(pathname);
  return (Object.entries(creationPaths).find(([, path]) => path === normalized)?.[0] as CreationRouteMode | undefined) || "hub";
}

export function creationRouteForMode(mode: CreationRouteMode): string {
  return creationPaths[mode];
}

function normalize(pathname: string): string {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
