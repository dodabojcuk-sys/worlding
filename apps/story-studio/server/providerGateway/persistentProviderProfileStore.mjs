import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { defaultProviderAppDataRoot } from "./providerAppDataRoot.mjs";
import {
  PROVIDER_PRESETS,
  beginCatalogRefresh,
  completeCatalogRefresh,
  emptyCatalogSnapshot,
  endpointIdentity,
  failCatalogRefresh,
  invalidateCatalogSnapshot,
  mergeModelEntry,
  normalizeCatalogEntries,
  providerPreset,
  unsupportedCatalogSnapshot
} from "./providerCatalog.mjs";

export { defaultProviderAppDataRoot } from "./providerAppDataRoot.mjs";

export const PROVIDER_PROFILE_SCHEMA_VERSION = 3;
export const DEFAULT_PROVIDER_PROFILE_ID = "siliconflow.default";
export const RADEON_CLOUD_PROVIDER_PROFILE_ID = "radeon-cloud.default";
export const MAX_PROVIDER_MODELS = 500;
export const MAX_PROVIDER_HISTORY = 20;

export function defaultProviderProfileState(now = new Date()) {
  const at = now.toISOString();
  return {
    schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
    revision: 0,
    activeProfileId: DEFAULT_PROVIDER_PROFILE_ID,
    profiles: PROVIDER_PRESETS.map((preset) => defaultProfileForPreset(preset, at)),
    history: []
  };
}

function defaultProfileForPreset(preset, at) {
  const id = `${preset.id}.default`;
  const suggestedDefault = preset.id === "radeon-cloud" ? preset.suggestedModels[0]?.id || "" : "";
  return {
    id,
    providerInstanceId: id,
    provider: preset.id,
    preset: preset.id,
    protocolAdapter: preset.protocolAdapter,
    displayName: preset.label,
    baseUrl: preset.defaultBaseUrl,
    endpointIdentity: endpointIdentity(preset.defaultBaseUrl),
    modelId: suggestedDefault,
    embeddingModelId: "",
    defaultModels: {
      llm: suggestedDefault ? { providerInstanceId: id, modelId: suggestedDefault } : null,
      embedding: null
    },
    enabled: true,
    credentialRef: id,
    configRevision: 0,
    connectionStatus: "unknown",
    lastVerifiedAt: null,
    lastError: null,
    catalog: emptyCatalogSnapshot(id, 0),
    suggestedModels: preset.suggestedModels.map((entry) => ({ ...entry, capabilityClaims: entry.capabilityClaims.map((claim) => ({ ...claim })) })),
    embeddingProbe: null,
    createdAt: at,
    updatedAt: at
  };
}

export function createPersistentProviderProfileStore(options = {}) {
  const fsImpl = options.fsImpl || fs;
  const appDataRoot = path.resolve(options.appDataRoot || defaultProviderAppDataRoot());
  const profilePath = path.resolve(options.profilePath || path.join(appDataRoot, "provider-profile.json"));
  const now = typeof options.now === "function" ? options.now : () => new Date();
  let lastCorruptPath = null;

  function read() {
    if (!fsImpl.existsSync(profilePath)) return defaultProviderProfileState(now());
    try {
      return normalizeProviderProfile(JSON.parse(String(fsImpl.readFileSync(profilePath, "utf8"))));
    } catch (error) {
      preserveCorruptProfile();
      throw profileStoreError("provider-profile-corrupt", error);
    }
  }

  function commit(current, profiles, input = {}) {
    const next = normalizeProviderProfile({
      schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
      revision: current.revision + 1,
      activeProfileId: input.activeProfileId || current.activeProfileId,
      profiles,
      history: input.historyEntry
        ? [...current.history, normalizeProviderHistoryEntry(input.historyEntry)].slice(-MAX_PROVIDER_HISTORY)
        : current.history
    });
    atomicWrite(next);
    return next;
  }

  function updateActive(expectedRevision, transform, input = {}) {
    const current = read();
    assertExpectedRevision(expectedRevision, current.revision);
    const active = current.profiles.find((profile) => profile.id === current.activeProfileId);
    if (!active) throw profileStoreError("provider-profile-schema");
    const updated = normalizeProviderProfileEntry(transform(active));
    return commit(current, current.profiles.map((profile) => profile.id === active.id ? updated : profile), input);
  }

  function reload() { return read(); }

  function assertRevision(expectedRevision) {
    const current = read();
    assertExpectedRevision(expectedRevision, current.revision);
    return current;
  }

  function save(input = {}) {
    const current = read();
    assertExpectedRevision(input.expectedRevision, current.revision);
    const currentActive = current.profiles.find((profile) => profile.id === current.activeProfileId) || current.profiles[0];
    const requestedProvider = input.provider ?? currentActive.provider;
    const target = current.profiles.find((profile) => profile.provider === requestedProvider);
    if (!target) throw profileStoreError("provider-profile-unsupported-provider");
    const nextBaseUrl = input.baseUrl ?? target.baseUrl;
    const configChanged = input.invalidateCatalog === true || nextBaseUrl.replace(/\/$/u, "") !== target.baseUrl;
    const configRevision = configChanged ? target.configRevision + 1 : target.configRevision;
    const llmModelId = boundedText(input.llmModelId ?? input.modelId ?? target.modelId, 240);
    const embeddingModelId = boundedText(input.embeddingModelId ?? target.embeddingModelId, 240);
    let catalog = configChanged ? invalidateCatalogSnapshot(target.catalog, configRevision) : target.catalog;
    if (Array.isArray(input.availableModels)) {
      const discoveryTime = new Date(input.lastModelDiscoveryAt || now());
      catalog = completeCatalogRefresh(beginCatalogRefresh(catalog, discoveryTime), input.availableModels.map((id) => ({ id, source: "endpoint", capabilityClaims: [] })), discoveryTime);
    }
    if (llmModelId) {
      const existingEntry = catalog.entries.find((entry) => entry.id === llmModelId);
      if (existingEntry || !target.suggestedModels.some((entry) => entry.id === llmModelId)) {
        catalog = { ...catalog, entries: mergeModelEntry(catalog.entries, { id: llmModelId, source: existingEntry?.source || "manual", capabilityClaims: [{ capability: "llm", source: "user-declared" }] }) };
      }
    }
    if (embeddingModelId) {
      const existingEntry = catalog.entries.find((entry) => entry.id === embeddingModelId);
      catalog = { ...catalog, entries: mergeModelEntry(catalog.entries, { id: embeddingModelId, source: existingEntry?.source || "manual", capabilityClaims: [{ capability: "embedding", source: "user-declared" }] }) };
    }
    const nextProfile = normalizeProviderProfileEntry({
      ...target,
      displayName: input.displayName ?? target.displayName,
      baseUrl: nextBaseUrl,
      modelId: llmModelId,
      embeddingModelId,
      defaultModels: {
        llm: llmModelId ? { providerInstanceId: target.id, modelId: llmModelId } : null,
        embedding: embeddingModelId ? { providerInstanceId: target.id, modelId: embeddingModelId } : null
      },
      enabled: input.enabled ?? target.enabled,
      configRevision,
      endpointIdentity: endpointIdentity(nextBaseUrl),
      connectionStatus: input.connectionStatus ?? target.connectionStatus,
      lastVerifiedAt: input.lastVerifiedAt === undefined ? target.lastVerifiedAt : input.lastVerifiedAt,
      lastError: input.lastError === undefined ? target.lastError : input.lastError,
      catalog,
      embeddingProbe: configChanged ? null : target.embeddingProbe,
      updatedAt: now().toISOString()
    });
    assertProviderModelIdentity(nextProfile.displayName, nextProfile.modelId);
    return commit(current, current.profiles.map((profile) => profile.id === target.id ? nextProfile : profile), {
      activeProfileId: target.id,
      historyEntry: input.historyEntry
    });
  }

  function beginCatalog(input = {}) {
    return updateActive(input.expectedRevision, (profile) => ({
      ...profile,
      catalog: beginCatalogRefresh(profile.catalog, now()),
      lastError: null,
      updatedAt: now().toISOString()
    }));
  }

  function completeCatalog(input = {}) {
    return updateActive(input.expectedRevision, (profile) => {
      const preset = providerPreset(profile.preset);
      const endpointEntries = normalizeCatalogEntries(input.entries, "endpoint").map((entry) => {
        const suggestion = preset.suggestedModels.find((item) => item.id === entry.id);
        const prior = profile.catalog.entries.find((item) => item.id === entry.id);
        return {
          ...entry,
          source: "endpoint",
          capabilityClaims: [...(suggestion?.capabilityClaims || []), ...(prior?.capabilityClaims || []), ...entry.capabilityClaims]
        };
      });
      const endpointIds = new Set(endpointEntries.map((entry) => entry.id));
      const manualEntries = profile.catalog.entries.filter((entry) => entry.source === "manual" && !endpointIds.has(entry.id));
      const catalog = completeCatalogRefresh(profile.catalog, [...endpointEntries, ...manualEntries], now());
      return { ...profile, catalog, lastError: null, updatedAt: now().toISOString() };
    }, { historyEntry: input.historyEntry });
  }

  function failCatalog(input = {}) {
    return updateActive(input.expectedRevision, (profile) => ({
      ...profile,
      catalog: failCatalogRefresh(profile.catalog, input.failure, now()),
      lastError: input.failure?.message || "Provider 目录获取失败。",
      updatedAt: now().toISOString()
    }), { historyEntry: input.historyEntry });
  }

  function markCatalogUnsupported(input = {}) {
    return updateActive(input.expectedRevision, (profile) => ({ ...profile, catalog: unsupportedCatalogSnapshot(profile.catalog, now()), updatedAt: now().toISOString() }), { historyEntry: input.historyEntry });
  }

  function recordEmbeddingProbe(input = {}) {
    return updateActive(input.expectedRevision, (profile) => {
      const entries = mergeModelEntry(profile.catalog.entries, {
        id: input.modelId,
        source: profile.catalog.entries.find((entry) => entry.id === input.modelId)?.source || "manual",
        revision: input.modelRevision || "unknown",
        dimensions: input.dimensions,
        capabilityClaims: [{ capability: "embedding", source: "probed" }]
      });
      return {
        ...profile,
        embeddingModelId: input.modelId,
        defaultModels: { ...profile.defaultModels, embedding: { providerInstanceId: profile.id, modelId: input.modelId } },
        catalog: { ...profile.catalog, entries },
        embeddingProbe: {
          status: "success",
          modelId: input.modelId,
          modelRevision: input.modelRevision || "unknown",
          dimensions: input.dimensions,
          latencyMs: input.latencyMs,
          verifiedAt: now().toISOString()
        },
        updatedAt: now().toISOString()
      };
    }, { historyEntry: input.historyEntry });
  }

  function markConnection(input = {}) {
    return save({
      expectedRevision: input.expectedRevision,
      connectionStatus: input.connectionStatus,
      lastVerifiedAt: input.lastVerifiedAt,
      lastError: input.lastError,
      historyEntry: input.historyEntry
    });
  }

  function recordHistory(input = {}) { return updateActive(input.expectedRevision, (profile) => profile, { historyEntry: input.historyEntry }); }
  function disable(input = {}) { return save({ expectedRevision: input.expectedRevision, enabled: false, connectionStatus: "disabled" }); }

  function publicState(state, credentialStatus = {}) {
    const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId) || null;
    return {
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      activeProfileId: state.activeProfileId,
      profile: activeProfile ? publicProfile(activeProfile) : null,
      providerInstances: state.profiles.map(publicProfile),
      presets: PROVIDER_PRESETS.map((preset) => ({ id: preset.id, label: preset.label, protocolAdapter: preset.protocolAdapter, defaultBaseUrl: preset.defaultBaseUrl, credentialRequired: preset.credentialRequired })),
      history: state.history.map((entry) => ({ ...entry })),
      credential: { configured: credentialStatus.configured === true, backend: credentialStatus.backend || "unknown" }
    };
  }

  function atomicWrite(value) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    try {
      fsImpl.mkdirSync(appDataRoot, { recursive: true, mode: 0o700 });
      try { fsImpl.chmodSync(appDataRoot, 0o700); } catch { /* best effort */ }
      const temporaryPath = `${profilePath}.${process.pid}.${randomUUID()}.tmp`;
      fsImpl.writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      try { fsImpl.chmodSync(temporaryPath, 0o600); } catch { /* best effort */ }
      const descriptor = fsImpl.openSync(temporaryPath, "r");
      try { fsImpl.fsyncSync(descriptor); } finally { fsImpl.closeSync(descriptor); }
      fsImpl.renameSync(temporaryPath, profilePath);
      try { fsImpl.chmodSync(profilePath, 0o600); } catch { /* best effort */ }
    } catch (error) {
      throw profileStoreError(error?.code === "EACCES" || error?.code === "EPERM" ? "provider-profile-permission" : "provider-profile-write-failed", error);
    }
  }

  function preserveCorruptProfile() {
    if (lastCorruptPath || !fsImpl.existsSync(profilePath)) return;
    const preservedPath = `${profilePath}.corrupt-${now().toISOString().replace(/[:.]/gu, "-")}`;
    try {
      if (typeof fsImpl.copyFileSync === "function") fsImpl.copyFileSync(profilePath, preservedPath);
      else fsImpl.renameSync(profilePath, preservedPath);
      lastCorruptPath = preservedPath;
    } catch { /* original remains untouched */ }
  }

  return Object.freeze({
    kind: "persistent-local-provider-profile",
    appDataRoot,
    profilePath,
    read,
    reload,
    assertRevision,
    save,
    beginCatalog,
    completeCatalog,
    failCatalog,
    markCatalogUnsupported,
    recordEmbeddingProbe,
    markConnection,
    recordHistory,
    disable,
    publicState,
    get lastCorruptPath() { return lastCorruptPath; }
  });
}

function publicProfile(profile) {
  const endpointModels = profile.catalog.entries.filter((entry) => entry.source === "endpoint").map((entry) => entry.id);
  return { ...profile, availableModels: endpointModels, lastModelDiscoveryAt: profile.catalog.lastSuccessAt };
}

export function normalizeProviderProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileStoreError("provider-profile-schema");
  if (value.schemaVersion === 1 || value.schemaVersion === 2) return migrateLegacyProviderProfile(value);
  if (value.schemaVersion !== PROVIDER_PROFILE_SCHEMA_VERSION) throw profileStoreError("provider-profile-schema");
  if (!Number.isInteger(value.revision) || value.revision < 0) throw profileStoreError("provider-profile-schema");
  if (!Array.isArray(value.profiles) || value.profiles.length < 1 || value.profiles.length > 16) throw profileStoreError("provider-profile-schema");
  const profiles = value.profiles.map(normalizeProviderProfileEntry);
  const history = Array.isArray(value.history) ? value.history.map(normalizeProviderHistoryEntry).slice(-MAX_PROVIDER_HISTORY) : [];
  const activeProfileId = boundedText(value.activeProfileId, 96);
  if (!activeProfileId || !profiles.some((profile) => profile.id === activeProfileId)) throw profileStoreError("provider-profile-schema");
  return { schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION, revision: value.revision, activeProfileId, profiles, history };
}

function normalizeProviderProfileEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileStoreError("provider-profile-schema");
  const id = boundedText(value.providerInstanceId || value.id, 96);
  const presetId = boundedText(value.preset || value.provider, 48);
  const preset = providerPreset(presetId);
  const displayName = boundedText(value.displayName, 120);
  const baseUrl = boundedText(value.baseUrl, 500).replace(/\/$/u, "");
  const credentialRef = boundedText(value.credentialRef, 120);
  if (!id || !displayName || !baseUrl || !credentialRef || value.enabled !== true && value.enabled !== false) throw profileStoreError("provider-profile-schema");
  try { new URL(baseUrl); } catch { throw profileStoreError("provider-profile-schema"); }
  const configRevision = Number.isInteger(value.configRevision) && value.configRevision >= 0 ? value.configRevision : 0;
  const modelId = boundedText(value.modelId || value.defaultModels?.llm?.modelId, 240);
  const embeddingModelId = boundedText(value.embeddingModelId || value.defaultModels?.embedding?.modelId, 240);
  const catalog = normalizeCatalog(value.catalog, id, configRevision);
  const availableModels = catalog.entries.filter((entry) => entry.source === "endpoint").map((entry) => entry.id);
  return {
    id,
    providerInstanceId: id,
    provider: preset.id,
    preset: preset.id,
    protocolAdapter: preset.protocolAdapter,
    displayName,
    baseUrl,
    endpointIdentity: boundedText(value.endpointIdentity, 64) || endpointIdentity(baseUrl),
    modelId,
    embeddingModelId,
    defaultModels: {
      llm: modelId ? { providerInstanceId: id, modelId } : null,
      embedding: embeddingModelId ? { providerInstanceId: id, modelId: embeddingModelId } : null
    },
    enabled: value.enabled,
    credentialRef,
    configRevision,
    connectionStatus: ["unknown", "verified", "failed", "disabled"].includes(value.connectionStatus) ? value.connectionStatus : "unknown",
    lastVerifiedAt: typeof value.lastVerifiedAt === "string" ? value.lastVerifiedAt : null,
    lastError: value.lastError ? String(value.lastError).replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 240) : null,
    catalog,
    availableModels,
    lastModelDiscoveryAt: catalog.lastSuccessAt,
    suggestedModels: normalizeCatalogEntries(value.suggestedModels ?? preset.suggestedModels, "preset"),
    embeddingProbe: normalizeEmbeddingProbe(value.embeddingProbe),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : typeof value.updatedAt === "string" ? value.updatedAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
  };
}

function normalizeCatalog(value, providerInstanceId, configRevision) {
  if (!value || typeof value !== "object") return emptyCatalogSnapshot(providerInstanceId, configRevision);
  const status = ["never_fetched", "loading", "ready", "stale", "failed", "unsupported"].includes(value.status) ? value.status : "never_fetched";
  const entries = normalizeCatalogEntries(value.entries);
  return {
    schemaVersion: 1,
    providerInstanceId,
    configRevision,
    status,
    source: ["endpoint", "manual", "preset"].includes(value.source) ? value.source : "endpoint",
    lastAttemptAt: typeof value.lastAttemptAt === "string" ? value.lastAttemptAt : null,
    lastSuccessAt: typeof value.lastSuccessAt === "string" ? value.lastSuccessAt : null,
    fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : null,
    entries,
    failure: value.failure && typeof value.failure === "object" ? {
      category: boundedText(value.failure.category, 64) || "unavailable",
      message: String(value.failure.message || "Provider 目录获取失败。").replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 240),
      occurredAt: typeof value.failure.occurredAt === "string" ? value.failure.occurredAt : null
    } : null,
    lastKnownGood: value.lastKnownGood === true
  };
}

function migrateLegacyProviderProfile(value) {
  if (!Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.profiles) || value.profiles.length < 1) throw profileStoreError("provider-profile-schema");
  const now = new Date(0).toISOString();
  const defaults = defaultProviderProfileState(new Date(0));
  const migratedByProvider = new Map();
  for (const legacy of value.profiles) {
    const presetId = boundedText(legacy.provider, 48);
    const preset = PROVIDER_PRESETS.find((item) => item.id === presetId);
    if (!preset) continue;
    const base = defaultProfileForPreset(preset, typeof legacy.updatedAt === "string" ? legacy.updatedAt : now);
    const available = Array.isArray(legacy.availableModels) ? legacy.availableModels : [];
    const verifiedEndpoint = Boolean(legacy.lastModelDiscoveryAt);
    const entries = normalizeCatalogEntries(available.map((entry) => ({ id: typeof entry === "string" ? entry : entry?.id, source: verifiedEndpoint ? "endpoint" : "unverified", capabilityClaims: [] })), verifiedEndpoint ? "endpoint" : "unverified");
    const catalog = verifiedEndpoint ? {
      ...completeCatalogRefresh(emptyCatalogSnapshot(base.id, 0), entries, new Date(legacy.lastModelDiscoveryAt)),
      lastAttemptAt: legacy.lastModelDiscoveryAt
    } : { ...emptyCatalogSnapshot(base.id, 0), entries };
    migratedByProvider.set(presetId, normalizeProviderProfileEntry({
      ...base,
      ...legacy,
      id: base.id,
      providerInstanceId: base.id,
      preset: presetId,
      protocolAdapter: preset.protocolAdapter,
      credentialRef: boundedText(legacy.credentialRef, 120) || base.credentialRef,
      catalog,
      suggestedModels: preset.suggestedModels,
      configRevision: 0,
      createdAt: typeof legacy.updatedAt === "string" ? legacy.updatedAt : now
    }));
  }
  const profiles = defaults.profiles.map((profile) => migratedByProvider.get(profile.provider) || profile);
  const activeLegacy = value.profiles.find((profile) => profile.id === value.activeProfileId);
  const activeProfileId = activeLegacy ? `${activeLegacy.provider}.default` : DEFAULT_PROVIDER_PROFILE_ID;
  return normalizeProviderProfile({ schemaVersion: 3, revision: value.revision, activeProfileId, profiles, history: Array.isArray(value.history) ? value.history : [] });
}

function normalizeEmbeddingProbe(value) {
  if (!value || typeof value !== "object" || value.status !== "success") return null;
  const modelId = boundedText(value.modelId, 240);
  if (!modelId || !Number.isInteger(value.dimensions) || value.dimensions < 1) return null;
  return {
    status: "success",
    modelId,
    modelRevision: boundedText(value.modelRevision, 240) || "unknown",
    dimensions: Math.min(value.dimensions, 1_000_000),
    latencyMs: Number.isFinite(value.latencyMs) && value.latencyMs >= 0 ? Math.round(value.latencyMs) : 0,
    verifiedAt: typeof value.verifiedAt === "string" ? value.verifiedAt : ""
  };
}

function normalizeProviderHistoryEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileStoreError("provider-profile-schema");
  const id = boundedText(value.id, 120);
  const kind = ["save", "reload", "models", "connection", "credential", "disable", "inference", "embedding"].includes(value.kind) ? value.kind : "connection";
  const status = ["success", "failed"].includes(value.status) ? value.status : "success";
  const occurredAt = typeof value.occurredAt === "string" ? value.occurredAt : "";
  if (!id || !occurredAt) throw profileStoreError("provider-profile-schema");
  return {
    id,
    kind,
    status,
    occurredAt,
    modelId: boundedText(value.modelId, 240) || null,
    modelCount: Number.isInteger(value.modelCount) && value.modelCount >= 0 ? Math.min(value.modelCount, MAX_PROVIDER_MODELS) : null,
    latencyMs: Number.isFinite(value.latencyMs) && value.latencyMs >= 0 ? Math.min(Math.round(value.latencyMs), 86_400_000) : null,
    error: value.error ? String(value.error).replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 240) : null,
    traceId: boundedText(value.traceId, 160) || null
  };
}

function assertProviderModelIdentity(displayName, modelId) {
  if (modelId && displayName.localeCompare(modelId, undefined, { sensitivity: "accent" }) === 0) throw profileStoreError("provider-profile-model-id-display-name");
}

function boundedText(value, maxLength) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }

function assertExpectedRevision(expectedRevision, actualRevision) {
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== actualRevision) {
    const error = profileStoreError("provider-profile-revision-conflict");
    error.expectedRevision = expectedRevision;
    error.actualRevision = actualRevision;
    throw error;
  }
}

function profileStoreError(code, cause) {
  const messages = {
    "provider-profile-corrupt": "本机 Provider 配置损坏，已保留损坏副本；请重新载入或修复配置。",
    "provider-profile-schema": "本机 Provider 配置格式不受支持，未覆盖原文件。",
    "provider-profile-permission": "本机 Provider 配置目录不可写，配置未保存。",
    "provider-profile-write-failed": "本机 Provider 配置保存失败，原配置保持不变。",
    "provider-profile-unsupported-provider": "当前 Provider 不受支持。",
    "provider-profile-revision-conflict": "Provider 配置已在别处更新，请重新载入后再保存。",
    "provider-profile-model-id-display-name": "默认模型必须使用模型 ID，不能使用 Provider 显示名称。"
  };
  const error = new Error(messages[code] || "本机 Provider 配置操作失败。");
  error.name = "PersistentProviderProfileError";
  error.code = code;
  error.statusCode = code === "provider-profile-revision-conflict" ? 409 : 400;
  if (cause?.code && !error.cause) error.cause = cause.code;
  return error;
}
