import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_STANDARD_WIDTH_PX,
  clampSidebarWidth,
  type SidebarWidthMode
} from "./sidebarLayout.ts";

export const CONTROL_CENTER_PREFERENCES_KEY = "story-studio:ai-control-center:v1";
export const OBJECT_DIRECTORY_PREFERENCES_KEY = "story-studio:object-directory-ui:v1";
export type ObjectDirectoryDensity = "standard" | "compact";
export type ObjectDirectorySort = "manual" | "name-asc" | "name-desc" | "recent" | "appearance-asc" | "appearance-desc" | "role-level";
type ObjectDirectoryPreference = { density?: ObjectDirectoryDensity; sort?: ObjectDirectorySort };

export const TIANYI_PANEL_MIN_WIDTH_PX = 360;
export const TIANYI_PANEL_DEFAULT_WIDTH_PX = 380;
export const TIANYI_PANEL_MAX_WIDTH_PX = 460;

export type ProviderType =
  | "openai-compatible"
  | "anthropic-compatible"
  | "local-api"
  | "custom-endpoint";

export type ProviderMetadata = {
  id: string;
  type: ProviderType;
  name: string;
  baseUrl: string;
  connectionStatus: "not-checked";
  credentialStatus: "not-configured";
  modelCatalogStatus: "placeholder";
};

export type ModelReasoning = "standard" | "high";

export type ModelProfile = {
  id: "quick-organization" | "complex-deduction";
  label: string;
  providerId: string | null;
  model: string;
  reasoning: ModelReasoning;
};

export type AppearancePreferences = {
  uiFontSize: "small" | "standard" | "large" | "xlarge";
  editorFontSize: "small" | "standard" | "large" | "xlarge";
  sidebarWidth: SidebarWidthMode;
  sidebarCustomWidthPx: number;
  tianyiPanelWidthPx: number;
  editorWidth: "focus" | "standard" | "wide" | "full";
  sidebarCollapsed: boolean;
};

export type ControlCenterPreferences = {
  version: 3;
  providers: ProviderMetadata[];
  modelProfiles: ModelProfile[];
  appearance: AppearancePreferences;
};

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readObjectDirectoryDensity(storage: PreferenceStorage | null | undefined, userId: string, objectType: string): ObjectDirectoryDensity {
  const preference = readObjectDirectoryPreference(storage, userId, objectType);
  return preference.density === "compact" ? "compact" : "standard";
}

export function saveObjectDirectoryDensity(storage: PreferenceStorage | null | undefined, userId: string, objectType: string, density: ObjectDirectoryDensity) {
  return saveObjectDirectoryPreference(storage, userId, objectType, { density }).density ?? density;
}

export function readObjectDirectorySort(storage: PreferenceStorage | null | undefined, userId: string, objectType: string): ObjectDirectorySort {
  const sort = readObjectDirectoryPreference(storage, userId, objectType).sort;
  return sort && ["manual", "name-asc", "name-desc", "recent", "appearance-asc", "appearance-desc", "role-level"].includes(sort) ? sort : "manual";
}

export function saveObjectDirectorySort(storage: PreferenceStorage | null | undefined, userId: string, objectType: string, sort: ObjectDirectorySort) {
  return saveObjectDirectoryPreference(storage, userId, objectType, { sort }).sort ?? sort;
}

function readObjectDirectoryPreference(storage: PreferenceStorage | null | undefined, userId: string, objectType: string): ObjectDirectoryPreference {
  try {
    const parsed = JSON.parse(storage?.getItem(OBJECT_DIRECTORY_PREFERENCES_KEY) || "{}") as Record<string, unknown>;
    const legacy = parsed[`${userId}:${objectType}`];
    if (legacy === "compact" || legacy === "standard") return { density: legacy };
    return legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy as ObjectDirectoryPreference : {};
  } catch { return {}; }
}

function saveObjectDirectoryPreference(storage: PreferenceStorage | null | undefined, userId: string, objectType: string, patch: ObjectDirectoryPreference): ObjectDirectoryPreference {
  const next = { ...readObjectDirectoryPreference(storage, userId, objectType), ...patch };
  try {
    const parsed = JSON.parse(storage?.getItem(OBJECT_DIRECTORY_PREFERENCES_KEY) || "{}") as Record<string, unknown>;
    storage?.setItem(OBJECT_DIRECTORY_PREFERENCES_KEY, JSON.stringify({ ...parsed, [`${userId}:${objectType}`]: next }));
  } catch { /* Display preferences never block project data. */ }
  return next;
}

/** Browser-only storage for UI preferences and non-sensitive provider drafts. */
export function getBrowserPreferenceStorage(): PreferenceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const DEFAULT_CONTROL_CENTER_PREFERENCES: ControlCenterPreferences = {
  version: 3,
  providers: [],
  modelProfiles: [
    {
      id: "quick-organization",
      label: "快速整理",
      providerId: null,
      model: "",
      reasoning: "standard"
    },
    {
      id: "complex-deduction",
      label: "复杂推演",
      providerId: null,
      model: "",
      reasoning: "high"
    }
  ],
  appearance: {
    uiFontSize: "standard",
    editorFontSize: "standard",
    sidebarWidth: "standard",
    sidebarCustomWidthPx: SIDEBAR_STANDARD_WIDTH_PX,
    tianyiPanelWidthPx: TIANYI_PANEL_DEFAULT_WIDTH_PX,
    editorWidth: "standard",
    sidebarCollapsed: false
  }
};

export function readControlCenterPreferences(storage: PreferenceStorage | null | undefined): ControlCenterPreferences {
  if (!storage) return cloneDefaults();
  try {
    const source = storage.getItem(CONTROL_CENTER_PREFERENCES_KEY);
    return source ? normalizeControlCenterPreferences(JSON.parse(source)) : cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export function saveControlCenterPreferences(storage: PreferenceStorage | null | undefined, preferences: ControlCenterPreferences): ControlCenterPreferences {
  const normalized = normalizeControlCenterPreferences(preferences);
  try {
    storage?.setItem(CONTROL_CENTER_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    // Display preferences must never block the author from opening the project.
  }
  return normalized;
}

export function normalizeControlCenterPreferences(value: unknown): ControlCenterPreferences {
  const record = asRecord(value);
  const providers = Array.isArray(record?.providers)
    ? record.providers.flatMap((provider) => normalizeProvider(provider)).filter(uniqueProvider)
    : [];
  const requestedProfiles = Array.isArray(record?.modelProfiles) ? record.modelProfiles : [];
  const defaults = cloneDefaults();
  const modelProfiles = defaults.modelProfiles.map((fallback) => {
    const candidate = requestedProfiles.find((profile) => asRecord(profile)?.id === fallback.id);
    return normalizeModelProfile(candidate, fallback, providers);
  });
  const appearanceRecord = asRecord(record?.appearance);
  const legacySidebarWidth = appearanceRecord?.sidebarWidth ?? migrateLegacySidebarDensity(appearanceRecord?.sidebarDensity);
  const sidebarWidth = normalizeSidebarWidthMode(legacySidebarWidth);
  const sidebarCustomWidthPx = legacySidebarWidth === "wide"
    ? SIDEBAR_MAX_WIDTH_PX
    : clampSidebarWidth(appearanceRecord?.sidebarCustomWidthPx, defaults.appearance.sidebarCustomWidthPx);

  return {
    version: 3,
    providers,
    modelProfiles,
    appearance: {
      uiFontSize: oneOf(appearanceRecord?.uiFontSize ?? appearanceRecord?.fontSize, ["small", "standard", "large", "xlarge"], defaults.appearance.uiFontSize),
      editorFontSize: oneOf(appearanceRecord?.editorFontSize, ["small", "standard", "large", "xlarge"], defaults.appearance.editorFontSize),
      sidebarWidth,
      sidebarCustomWidthPx,
      tianyiPanelWidthPx: clampTianyiPanelWidth(appearanceRecord?.tianyiPanelWidthPx),
      editorWidth: oneOf(migrateLegacyEditorWidth(appearanceRecord?.editorWidth), ["focus", "standard", "wide", "full"], defaults.appearance.editorWidth),
      sidebarCollapsed: typeof appearanceRecord?.sidebarCollapsed === "boolean" ? appearanceRecord.sidebarCollapsed : defaults.appearance.sidebarCollapsed
    }
  };
}

function migrateLegacySidebarDensity(value: unknown): unknown {
  return value === "comfortable" ? "wide" : value;
}

function normalizeSidebarWidthMode(value: unknown): SidebarWidthMode {
  if (value === "wide") return "custom";
  return oneOf(value, ["compact", "standard", "custom"], DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.sidebarWidth);
}

export function clampTianyiPanelWidth(value: unknown): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return TIANYI_PANEL_DEFAULT_WIDTH_PX;
  return Math.round(Math.min(TIANYI_PANEL_MAX_WIDTH_PX, Math.max(TIANYI_PANEL_MIN_WIDTH_PX, numeric)));
}

function migrateLegacyEditorWidth(value: unknown): unknown {
  return value === "narrow" ? "focus" : value;
}

export function nextProviderId(type: ProviderType, providers: ProviderMetadata[]): string {
  const prefix = `provider-${type}`;
  let sequence = 1;
  while (providers.some((provider) => provider.id === `${prefix}-${sequence}`)) sequence += 1;
  return `${prefix}-${sequence}`;
}

function normalizeProvider(value: unknown): ProviderMetadata[] {
  const record = asRecord(value);
  if (!record) return [];
  const type = oneOf<ProviderType | null>(record.type, ["openai-compatible", "anthropic-compatible", "local-api", "custom-endpoint"], null);
  const id = safeText(record.id, 96);
  const name = safeText(record.name, 120);
  const baseUrl = safeText(record.baseUrl, 500);
  if (!type || !id || !name || !baseUrl) return [];
  return [{
    id,
    type,
    name,
    baseUrl,
    connectionStatus: "not-checked",
    credentialStatus: "not-configured",
    modelCatalogStatus: "placeholder"
  }];
}

function normalizeModelProfile(value: unknown, fallback: ModelProfile, providers: ProviderMetadata[]): ModelProfile {
  const record = asRecord(value);
  const requestedProviderId = safeText(record?.providerId, 96) || null;
  return {
    id: fallback.id,
    label: fallback.label,
    providerId: requestedProviderId && providers.some((provider) => provider.id === requestedProviderId) ? requestedProviderId : null,
    model: safeText(record?.model, 160),
    reasoning: oneOf(record?.reasoning, ["standard", "high"], fallback.reasoning)
  };
}

function uniqueProvider(provider: ProviderMetadata, index: number, providers: ProviderMetadata[]): boolean {
  return providers.findIndex((candidate) => candidate.id === provider.id) === index;
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function oneOf<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cloneDefaults(): ControlCenterPreferences {
  return structuredClone(DEFAULT_CONTROL_CENTER_PREFERENCES);
}
