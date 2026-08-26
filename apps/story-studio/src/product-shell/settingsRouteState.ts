/** Presentation-only route state for the low-frequency Settings surface. */
export type SettingsRouteSection = "home" | "ai" | "plugins" | "workspace" | "data" | "system";

export type SettingsRouteLeaf =
  | "provider"
  | "models"
  | "tianyi"
  | "context"
  | "skills"
  | "workflows"
  | "catalog"
  | "installed"
  | "permissions"
  | "updates"
  | "appearance"
  | "fonts"
  | "editor"
  | "sidebar"
  | "shortcuts"
  | "location"
  | "backup"
  | "import-export"
  | "storage"
  | "diagnostics"
  | "logs"
  | "version"
  | "recovery";

export type SettingsRouteState = {
  section: SettingsRouteSection;
  leaf: SettingsRouteLeaf;
};

const settingsPaths: Record<SettingsRouteSection, string> = {
  home: "/settings",
  ai: "/settings/ai",
  plugins: "/settings/plugins",
  workspace: "/settings/workspace",
  data: "/settings/data",
  system: "/settings/system"
};

const settingsLeafPaths: Record<Exclude<SettingsRouteSection, "home">, Record<SettingsRouteLeaf, string>> = {
  ai: {
    provider: "/settings/ai/provider",
    models: "/settings/ai/models",
    tianyi: "/settings/ai/tianyi",
    context: "/settings/ai/context",
    skills: "/settings/ai/skills",
    workflows: "/settings/ai/workflows",
    catalog: "/settings/ai/provider",
    installed: "/settings/ai/provider",
    permissions: "/settings/ai/provider",
    updates: "/settings/ai/provider",
    appearance: "/settings/ai/provider",
    fonts: "/settings/ai/provider",
    editor: "/settings/ai/provider",
    sidebar: "/settings/ai/provider",
    shortcuts: "/settings/ai/provider",
    location: "/settings/ai/provider",
    backup: "/settings/ai/provider",
    "import-export": "/settings/ai/provider",
    storage: "/settings/ai/provider",
    diagnostics: "/settings/ai/provider",
    logs: "/settings/ai/provider",
    version: "/settings/ai/provider",
    recovery: "/settings/ai/provider"
  },
  plugins: {
    provider: "/settings/plugins/catalog",
    models: "/settings/plugins/catalog",
    tianyi: "/settings/plugins/catalog",
    context: "/settings/plugins/catalog",
    skills: "/settings/plugins/catalog",
    workflows: "/settings/plugins/catalog",
    catalog: "/settings/plugins/catalog",
    installed: "/settings/plugins/installed",
    permissions: "/settings/plugins/permissions",
    updates: "/settings/plugins/updates",
    appearance: "/settings/plugins/catalog",
    fonts: "/settings/plugins/catalog",
    editor: "/settings/plugins/catalog",
    sidebar: "/settings/plugins/catalog",
    shortcuts: "/settings/plugins/catalog",
    location: "/settings/plugins/catalog",
    backup: "/settings/plugins/catalog",
    "import-export": "/settings/plugins/catalog",
    storage: "/settings/plugins/catalog",
    diagnostics: "/settings/plugins/catalog",
    logs: "/settings/plugins/catalog",
    version: "/settings/plugins/catalog",
    recovery: "/settings/plugins/catalog"
  },
  workspace: {
    provider: "/settings/workspace/appearance",
    models: "/settings/workspace/appearance",
    tianyi: "/settings/workspace/appearance",
    context: "/settings/workspace/appearance",
    skills: "/settings/workspace/appearance",
    workflows: "/settings/workspace/appearance",
    catalog: "/settings/workspace/appearance",
    installed: "/settings/workspace/appearance",
    permissions: "/settings/workspace/appearance",
    updates: "/settings/workspace/appearance",
    appearance: "/settings/workspace/appearance",
    fonts: "/settings/workspace/fonts",
    editor: "/settings/workspace/editor",
    sidebar: "/settings/workspace/sidebar",
    shortcuts: "/settings/workspace/shortcuts",
    location: "/settings/workspace/appearance",
    backup: "/settings/workspace/appearance",
    "import-export": "/settings/workspace/appearance",
    storage: "/settings/workspace/appearance",
    diagnostics: "/settings/workspace/appearance",
    logs: "/settings/workspace/appearance",
    version: "/settings/workspace/appearance",
    recovery: "/settings/workspace/appearance"
  },
  data: {
    provider: "/settings/data/location",
    models: "/settings/data/location",
    tianyi: "/settings/data/location",
    context: "/settings/data/location",
    skills: "/settings/data/location",
    workflows: "/settings/data/location",
    catalog: "/settings/data/location",
    installed: "/settings/data/location",
    permissions: "/settings/data/location",
    updates: "/settings/data/location",
    appearance: "/settings/data/location",
    fonts: "/settings/data/location",
    editor: "/settings/data/location",
    sidebar: "/settings/data/location",
    shortcuts: "/settings/data/location",
    location: "/settings/data/location",
    backup: "/settings/data/backup",
    "import-export": "/settings/data/import-export",
    storage: "/settings/data/storage",
    diagnostics: "/settings/data/location",
    logs: "/settings/data/location",
    version: "/settings/data/location",
    recovery: "/settings/data/location"
  },
  system: {
    provider: "/settings/system/diagnostics",
    models: "/settings/system/diagnostics",
    tianyi: "/settings/system/diagnostics",
    context: "/settings/system/diagnostics",
    skills: "/settings/system/diagnostics",
    workflows: "/settings/system/diagnostics",
    catalog: "/settings/system/diagnostics",
    installed: "/settings/system/diagnostics",
    permissions: "/settings/system/diagnostics",
    updates: "/settings/system/diagnostics",
    appearance: "/settings/system/diagnostics",
    fonts: "/settings/system/diagnostics",
    editor: "/settings/system/diagnostics",
    sidebar: "/settings/system/diagnostics",
    shortcuts: "/settings/system/diagnostics",
    location: "/settings/system/diagnostics",
    backup: "/settings/system/diagnostics",
    "import-export": "/settings/system/diagnostics",
    storage: "/settings/system/diagnostics",
    diagnostics: "/settings/system/diagnostics",
    logs: "/settings/system/logs",
    version: "/settings/system/version",
    recovery: "/settings/system/recovery"
  }
};

const defaultLeaves: Record<Exclude<SettingsRouteSection, "home">, SettingsRouteLeaf> = {
  ai: "provider",
  plugins: "catalog",
  workspace: "appearance",
  data: "location",
  system: "diagnostics"
};

const leavesBySection: Record<Exclude<SettingsRouteSection, "home">, SettingsRouteLeaf[]> = {
  ai: ["provider", "models", "tianyi", "context", "skills", "workflows"],
  plugins: ["catalog", "installed", "permissions", "updates"],
  workspace: ["appearance", "fonts", "editor", "sidebar", "shortcuts"],
  data: ["location", "backup", "import-export", "storage"],
  system: ["diagnostics", "logs", "version", "recovery"]
};

export function settingsLeavesForSection(section: Exclude<SettingsRouteSection, "home">): SettingsRouteLeaf[] {
  return [...leavesBySection[section]];
}

export function settingsLeafForSection(section: SettingsRouteSection): SettingsRouteLeaf {
  return section === "home" ? defaultLeaves.ai : defaultLeaves[section];
}

export function settingsRouteForLeaf(section: SettingsRouteSection, leaf?: SettingsRouteLeaf): string {
  const normalizedSection = section === "home" ? "ai" : section;
  const candidate = leaf && settingsLeafPaths[normalizedSection][leaf];
  return candidate || settingsLeafPaths[normalizedSection][defaultLeaves[normalizedSection]];
}

export function isSettingsRoute(pathname: string): boolean {
  const normalized = normalize(pathname);
  return normalized === "/settings" || normalized.startsWith("/settings/");
}

export function readSettingsRouteSection(pathname: string): SettingsRouteSection {
  const normalized = normalize(pathname);
  const match = (Object.entries(settingsPaths)
    .filter(([section]) => section !== "home")
    .sort(([, left], [, right]) => right.length - left.length)
    .find(([, path]) => normalized === path || normalized.startsWith(`${path}/`))?.[0] as SettingsRouteSection | undefined);
  return match || (normalized === settingsPaths.home ? "home" : "home");
}

export function readSettingsRouteState(pathname: string, search = ""): SettingsRouteState {
  const normalized = normalize(pathname);
  const section = readSettingsRouteSection(normalized);
  const queryLeaf = new URLSearchParams(search).get("section") as SettingsRouteLeaf | null;
  if (section === "home") return { section: "home", leaf: defaultLeaves.ai };
  // Ignore compatibility fallbacks for leaves owned by another category. For
  // example, the broad map keeps `provider` as a safe fallback under system,
  // but `/settings/system/diagnostics` must resolve to the system diagnostic
  // leaf rather than the AI Provider surface.
  const pathLeaf = leavesBySection[section].find((candidate) => settingsLeafPaths[section][candidate] === normalized);
  const leaf = pathLeaf || (queryLeaf && leavesBySection[section].includes(queryLeaf) ? queryLeaf : defaultLeaves[section]);
  // R1 query deep links remain valid while new R2 leaf routes become the
  // canonical browser URL.
  return { section, leaf };
}

export function settingsRouteForSection(section: SettingsRouteSection): string {
  return settingsPaths[section];
}

function normalize(pathname: string): string {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
