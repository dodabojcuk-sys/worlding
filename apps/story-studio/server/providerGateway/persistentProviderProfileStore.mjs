import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { defaultProviderAppDataRoot } from "./providerAppDataRoot.mjs";

export { defaultProviderAppDataRoot } from "./providerAppDataRoot.mjs";

export const PROVIDER_PROFILE_SCHEMA_VERSION = 1;
export const DEFAULT_PROVIDER_PROFILE_ID = "siliconflow.default";
export const MAX_PROVIDER_MODELS = 500;
export const MAX_PROVIDER_HISTORY = 20;

export function defaultProviderProfileState(now = new Date()) {
  return {
    schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
    revision: 0,
    activeProfileId: DEFAULT_PROVIDER_PROFILE_ID,
    profiles: [{
      id: DEFAULT_PROVIDER_PROFILE_ID,
      provider: "siliconflow",
      displayName: "硅基流动",
      baseUrl: "https://api.siliconflow.cn/v1",
      modelId: "",
      enabled: true,
      credentialRef: DEFAULT_PROVIDER_PROFILE_ID,
      connectionStatus: "unknown",
      lastVerifiedAt: null,
      lastError: null,
      availableModels: [],
      lastModelDiscoveryAt: null,
      updatedAt: now.toISOString()
    }],
    history: []
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
    let source;
    try {
      source = fsImpl.readFileSync(profilePath, "utf8");
      return normalizeProviderProfile(JSON.parse(String(source)));
    } catch (error) {
      preserveCorruptProfile();
      throw profileStoreError("provider-profile-corrupt", error);
    }
  }

  function reload() {
    return read();
  }

  function assertRevision(expectedRevision) {
    const current = read();
    assertExpectedRevision(expectedRevision, current.revision);
    return current;
  }

  function save(input = {}) {
    const current = read();
    assertExpectedRevision(input.expectedRevision, current.revision);
    const existing = current.profiles.find((profile) => profile.id === current.activeProfileId) || current.profiles[0];
    const nextProfile = normalizeProviderProfileEntry({
      ...existing,
      id: existing.id,
      provider: "siliconflow",
      displayName: input.displayName ?? existing.displayName,
      baseUrl: input.baseUrl ?? existing.baseUrl,
      modelId: input.modelId ?? existing.modelId,
      enabled: input.enabled ?? existing.enabled,
      credentialRef: existing.credentialRef,
      connectionStatus: input.connectionStatus ?? existing.connectionStatus,
      lastVerifiedAt: input.lastVerifiedAt === undefined ? existing.lastVerifiedAt : input.lastVerifiedAt,
      lastError: input.lastError === undefined ? existing.lastError : input.lastError,
      availableModels: input.availableModels === undefined ? existing.availableModels : input.availableModels,
      lastModelDiscoveryAt: input.lastModelDiscoveryAt === undefined ? existing.lastModelDiscoveryAt : input.lastModelDiscoveryAt,
      updatedAt: now().toISOString()
    });
    assertProviderModelIdentity(nextProfile.displayName, nextProfile.modelId);
    const history = input.historyEntry
      ? [...current.history, normalizeProviderHistoryEntry(input.historyEntry)].slice(-MAX_PROVIDER_HISTORY)
      : current.history;
    const next = normalizeProviderProfile({
      schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
      revision: current.revision + 1,
      activeProfileId: existing.id,
      profiles: [nextProfile],
      history
    });
    atomicWrite(next);
    return next;
  }

  function markConnection(input = {}) {
    return save({
      expectedRevision: input.expectedRevision,
      connectionStatus: input.connectionStatus,
      lastVerifiedAt: input.lastVerifiedAt,
      lastError: input.lastError,
      availableModels: input.availableModels,
      lastModelDiscoveryAt: input.lastModelDiscoveryAt,
      historyEntry: input.historyEntry
    });
  }

  function recordHistory(input = {}) {
    return save({
      expectedRevision: input.expectedRevision,
      historyEntry: input.historyEntry
    });
  }

  function disable(input = {}) {
    return save({ expectedRevision: input.expectedRevision, enabled: false, connectionStatus: "disabled" });
  }

  function publicState(state, credentialStatus = {}) {
    const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId) || null;
    return {
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      activeProfileId: state.activeProfileId,
      profile: activeProfile ? { ...activeProfile } : null,
      history: state.history.map((entry) => ({ ...entry })),
      credential: {
        configured: credentialStatus.configured === true,
        backend: credentialStatus.backend || "unknown"
      }
    };
  }

  function atomicWrite(value) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    try {
      fsImpl.mkdirSync(appDataRoot, { recursive: true, mode: 0o700 });
      try { fsImpl.chmodSync(appDataRoot, 0o700); } catch { /* best effort on test filesystems */ }
      const temporaryPath = `${profilePath}.${process.pid}.${randomUUID()}.tmp`;
      fsImpl.writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
      try { fsImpl.chmodSync(temporaryPath, 0o600); } catch { /* best effort on test filesystems */ }
      const descriptor = fsImpl.openSync(temporaryPath, "r");
      try { fsImpl.fsyncSync(descriptor); } finally { fsImpl.closeSync(descriptor); }
      fsImpl.renameSync(temporaryPath, profilePath);
      try { fsImpl.chmodSync(profilePath, 0o600); } catch { /* best effort on test filesystems */ }
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
    } catch {
      // The original file remains untouched when preservation itself fails.
    }
  }

  return Object.freeze({
    kind: "persistent-local-provider-profile",
    appDataRoot,
    profilePath,
    read,
    reload,
    assertRevision,
    save,
    markConnection,
    recordHistory,
    disable,
    publicState,
    get lastCorruptPath() { return lastCorruptPath; }
  });
}

export function normalizeProviderProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileStoreError("provider-profile-schema");
  if (value.schemaVersion !== PROVIDER_PROFILE_SCHEMA_VERSION) throw profileStoreError("provider-profile-schema");
  if (!Number.isInteger(value.revision) || value.revision < 0) throw profileStoreError("provider-profile-schema");
  if (!Array.isArray(value.profiles) || value.profiles.length < 1 || value.profiles.length > 8) throw profileStoreError("provider-profile-schema");
  const profiles = value.profiles.map(normalizeProviderProfileEntry);
  const history = Array.isArray(value.history)
    ? value.history.map(normalizeProviderHistoryEntry).slice(-MAX_PROVIDER_HISTORY)
    : [];
  const activeProfileId = typeof value.activeProfileId === "string" ? value.activeProfileId.trim() : "";
  if (!activeProfileId || !profiles.some((profile) => profile.id === activeProfileId)) throw profileStoreError("provider-profile-schema");
  return {
    schemaVersion: PROVIDER_PROFILE_SCHEMA_VERSION,
    revision: value.revision,
    activeProfileId,
    profiles,
    history
  };
}

function normalizeProviderProfileEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileStoreError("provider-profile-schema");
  const id = boundedText(value.id, 96);
  const provider = boundedText(value.provider, 48);
  const displayName = boundedText(value.displayName, 120);
  const baseUrl = boundedText(value.baseUrl, 500);
  const modelId = boundedText(value.modelId, 240);
  const credentialRef = boundedText(value.credentialRef, 120);
  const connectionStatus = ["unknown", "verified", "failed", "disabled"].includes(value.connectionStatus) ? value.connectionStatus : "unknown";
  if (!id || provider !== "siliconflow" || !displayName || !baseUrl || !credentialRef) throw profileStoreError("provider-profile-schema");
  let parsedUrl;
  try { parsedUrl = new URL(baseUrl); } catch { throw profileStoreError("provider-profile-schema"); }
  if (!/^https?:$/u.test(parsedUrl.protocol) || /[\r\n\0]/u.test(baseUrl)) throw profileStoreError("provider-profile-schema");
  if (typeof value.enabled !== "boolean") throw profileStoreError("provider-profile-schema");
  if (value.lastVerifiedAt !== null && value.lastVerifiedAt !== undefined && typeof value.lastVerifiedAt !== "string") throw profileStoreError("provider-profile-schema");
  if (value.lastError !== null && value.lastError !== undefined && typeof value.lastError !== "string") throw profileStoreError("provider-profile-schema");
  const availableModels = normalizeAvailableModels(value.availableModels);
  if (value.lastModelDiscoveryAt !== null && value.lastModelDiscoveryAt !== undefined && typeof value.lastModelDiscoveryAt !== "string") throw profileStoreError("provider-profile-schema");
  return {
    id,
    provider,
    displayName,
    baseUrl: baseUrl.replace(/\/$/u, ""),
    modelId,
    enabled: value.enabled,
    credentialRef,
    connectionStatus,
    lastVerifiedAt: value.lastVerifiedAt || null,
    lastError: value.lastError ? String(value.lastError).slice(0, 240) : null,
    availableModels,
    lastModelDiscoveryAt: value.lastModelDiscoveryAt || null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
  };
}

function normalizeAvailableModels(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PROVIDER_MODELS) throw profileStoreError("provider-profile-schema");
  return [...new Set(value.map((model) => {
    if (typeof model === "string") return model.trim().slice(0, 240);
    if (!model || typeof model !== "object") return "";
    return typeof model.id === "string" ? model.id.trim().slice(0, 240) : "";
  }).filter(Boolean))].slice(0, MAX_PROVIDER_MODELS);
}

function normalizeProviderHistoryEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw profileStoreError("provider-profile-schema");
  const id = boundedText(value.id, 120);
  const kind = ["save", "reload", "models", "connection", "credential", "disable", "inference"].includes(value.kind) ? value.kind : "connection";
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

/**
 * A provider label is presentation metadata, never a model identity. Reject
 * the common browser-autofill failure where the display name is submitted as
 * the model ID instead of silently persisting an unusable profile.
 */
function assertProviderModelIdentity(displayName, modelId) {
  if (!modelId) return;
  if (displayName.localeCompare(modelId, undefined, { sensitivity: "accent" }) === 0) {
    throw profileStoreError("provider-profile-model-id-display-name");
  }
}

function boundedText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

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
    "provider-profile-revision-conflict": "Provider 配置已在别处更新，请重新载入后再保存。",
    "provider-profile-model-id-display-name": "默认模型必须使用模型 ID，不能使用 Provider 显示名称。"
  };
  const error = new Error(messages[code] || "本机 Provider 配置操作失败。");
  error.name = "PersistentProviderProfileError";
  error.code = code;
  error.statusCode = code === "provider-profile-revision-conflict" ? 409 : 400;
  if (cause && cause.code && !error.cause) error.cause = cause.code;
  return error;
}
