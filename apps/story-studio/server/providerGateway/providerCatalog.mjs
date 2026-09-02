import { createHash } from "node:crypto";

export const PROVIDER_PROTOCOL_ADAPTERS = Object.freeze(["openai-compatible", "ollama-native"]);
export const MODEL_CAPABILITIES = Object.freeze(["llm", "embedding", "vlm", "rerank", "asr", "tts"]);
export const CAPABILITY_SOURCES = Object.freeze(["preset-declared", "user-declared", "probed", "unknown"]);
export const MODEL_CATALOG_STATES = Object.freeze(["never_fetched", "loading", "ready", "stale", "failed", "unsupported"]);

const llmSuggestion = (id, label = id) => Object.freeze({
  id,
  label,
  source: "preset",
  capabilityClaims: Object.freeze([{ capability: "llm", source: "preset-declared" }])
});

export const PROVIDER_PRESETS = Object.freeze([
  Object.freeze({ id: "siliconflow", label: "硅基流动", protocolAdapter: "openai-compatible", defaultBaseUrl: "https://api.siliconflow.cn/v1", credentialRequired: true, catalogPath: "models", catalogSearch: Object.freeze({ type: "text", sub_type: "chat" }), suggestedModels: Object.freeze([
    llmSuggestion("Qwen/Qwen3.5-35B-A3B", "Qwen 3.5 35B A3B"),
    llmSuggestion("Qwen/Qwen3.5-9B", "Qwen 3.5 9B"),
    llmSuggestion("Qwen/Qwen3.5-4B", "Qwen 3.5 4B")
  ]) }),
  Object.freeze({ id: "radeon-cloud", label: "AMD Radeon Cloud", protocolAdapter: "openai-compatible", defaultBaseUrl: "https://developer.amd.com.cn/radeon/api/v1", credentialRequired: true, catalogPath: "models", suggestedModels: Object.freeze([
    llmSuggestion("DeepSeek-V4-Flash-Vision-Exp", "DeepSeek V4 Flash Vision Exp")
  ]) }),
  Object.freeze({ id: "openai", label: "OpenAI", protocolAdapter: "openai-compatible", defaultBaseUrl: "https://api.openai.com/v1", credentialRequired: true, catalogPath: "models", suggestedModels: Object.freeze([]) }),
  Object.freeze({ id: "deepseek", label: "DeepSeek", protocolAdapter: "openai-compatible", defaultBaseUrl: "https://api.deepseek.com/v1", credentialRequired: true, catalogPath: "models", suggestedModels: Object.freeze([]) }),
  Object.freeze({ id: "zhipu", label: "GLM / Zhipu", protocolAdapter: "openai-compatible", defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4", credentialRequired: true, catalogPath: "models", suggestedModels: Object.freeze([]) }),
  Object.freeze({ id: "ollama", label: "Ollama", protocolAdapter: "ollama-native", defaultBaseUrl: "http://127.0.0.1:11434", credentialRequired: false, catalogPath: "api/tags", suggestedModels: Object.freeze([]) }),
  Object.freeze({ id: "lemonade", label: "AMD Lemonade", protocolAdapter: "openai-compatible", defaultBaseUrl: "http://127.0.0.1:8000/api/v1", credentialRequired: false, catalogPath: "models", suggestedModels: Object.freeze([]) }),
  Object.freeze({ id: "vllm", label: "vLLM", protocolAdapter: "openai-compatible", defaultBaseUrl: "http://127.0.0.1:8000/v1", credentialRequired: false, catalogPath: "models", suggestedModels: Object.freeze([]) }),
  Object.freeze({ id: "custom-openai", label: "Custom OpenAI-Compatible", protocolAdapter: "openai-compatible", defaultBaseUrl: "https://example.invalid/v1", credentialRequired: true, catalogPath: "models", suggestedModels: Object.freeze([]) })
]);

const presetMap = new Map(PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export function providerPreset(presetId) {
  const preset = presetMap.get(String(presetId || ""));
  if (!preset) throw new TypeError("Unknown Provider preset.");
  return preset;
}

export function endpointIdentity(baseUrl) {
  const parsed = new URL(String(baseUrl || "").trim());
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return createHash("sha256").update(parsed.toString().replace(/\/$/u, "")).digest("hex").slice(0, 24);
}

export function emptyCatalogSnapshot(providerInstanceId, configRevision) {
  return {
    schemaVersion: 1,
    providerInstanceId,
    configRevision,
    status: "never_fetched",
    source: "endpoint",
    lastAttemptAt: null,
    lastSuccessAt: null,
    fetchedAt: null,
    entries: [],
    failure: null,
    lastKnownGood: false
  };
}

export function beginCatalogRefresh(snapshot, now = new Date()) {
  return {
    ...snapshot,
    status: "loading",
    lastAttemptAt: now.toISOString(),
    failure: null,
    lastKnownGood: snapshot.entries.length > 0 && Boolean(snapshot.lastSuccessAt)
  };
}

export function completeCatalogRefresh(snapshot, entries, now = new Date()) {
  const at = now.toISOString();
  return {
    ...snapshot,
    status: "ready",
    source: "endpoint",
    lastAttemptAt: snapshot.lastAttemptAt || at,
    lastSuccessAt: at,
    fetchedAt: at,
    entries: normalizeCatalogEntries(entries, "endpoint"),
    failure: null,
    lastKnownGood: false
  };
}

export function failCatalogRefresh(snapshot, failure, now = new Date()) {
  const hasLastKnownGood = snapshot.entries.some((entry) => entry.source === "endpoint") && Boolean(snapshot.lastSuccessAt);
  return {
    ...snapshot,
    status: hasLastKnownGood ? "stale" : "failed",
    lastAttemptAt: snapshot.lastAttemptAt || now.toISOString(),
    failure: {
      category: safeFailureCategory(failure?.category),
      message: safeFailureMessage(failure?.message),
      occurredAt: now.toISOString()
    },
    lastKnownGood: hasLastKnownGood
  };
}

export function invalidateCatalogSnapshot(snapshot, nextConfigRevision) {
  const hasLastKnownGood = snapshot.entries.some((entry) => entry.source === "endpoint") && Boolean(snapshot.lastSuccessAt);
  return {
    ...snapshot,
    configRevision: nextConfigRevision,
    status: hasLastKnownGood ? "stale" : "never_fetched",
    failure: hasLastKnownGood ? { category: "config-changed", message: "Provider 配置已变更，旧目录仅作上次成功结果。", occurredAt: null } : null,
    lastKnownGood: hasLastKnownGood
  };
}

export function unsupportedCatalogSnapshot(snapshot, now = new Date()) {
  return {
    ...snapshot,
    status: "unsupported",
    lastAttemptAt: now.toISOString(),
    failure: { category: "unsupported", message: "此 Provider 不支持目录获取，请手工配置模型。", occurredAt: now.toISOString() },
    lastKnownGood: false
  };
}

export function normalizeCatalogEntries(entries, fallbackSource = "unverified") {
  if (!Array.isArray(entries)) return [];
  const byId = new Map();
  for (const candidate of entries.slice(0, 500)) {
    const id = typeof candidate === "string" ? candidate.trim().slice(0, 240) : String(candidate?.id || "").trim().slice(0, 240);
    if (!id) continue;
    const source = ["endpoint", "manual", "preset", "unverified"].includes(candidate?.source) ? candidate.source : fallbackSource;
    const claims = normalizeCapabilityClaims(candidate?.capabilityClaims);
    byId.set(id, {
      id,
      label: String(candidate?.label || id.split("/").at(-1) || id).trim().slice(0, 240),
      source,
      revision: String(candidate?.revision || "unknown").trim().slice(0, 240) || "unknown",
      capabilityClaims: claims,
      ...(Number.isInteger(candidate?.dimensions) && candidate.dimensions > 0 ? { dimensions: Math.min(candidate.dimensions, 1_000_000) } : {})
    });
  }
  return [...byId.values()];
}

export function mergeModelEntry(entries, entry) {
  const current = normalizeCatalogEntries(entries);
  const normalized = normalizeCatalogEntries([entry], entry?.source || "manual")[0];
  if (!normalized) return current;
  const prior = current.find((item) => item.id === normalized.id);
  const claims = normalizeCapabilityClaims([...(prior?.capabilityClaims || []), ...normalized.capabilityClaims]);
  if (prior) return current.map((item) => item.id === normalized.id ? { ...prior, ...normalized, capabilityClaims: claims } : item);
  return [...current, { ...normalized, capabilityClaims: claims }];
}

export function declaredCapabilities(entry) {
  return [...new Set(normalizeCapabilityClaims(entry?.capabilityClaims).filter((claim) => claim.source !== "unknown").map((claim) => claim.capability))];
}

export function normalizeCapabilityClaims(value) {
  const byCapability = new Map();
  if (Array.isArray(value)) {
    for (const claim of value) {
      if (!MODEL_CAPABILITIES.includes(claim?.capability) || !CAPABILITY_SOURCES.includes(claim?.source)) continue;
      const existing = byCapability.get(claim.capability);
      if (!existing || capabilitySourceRank(claim.source) > capabilitySourceRank(existing.source)) byCapability.set(claim.capability, { capability: claim.capability, source: claim.source });
    }
  }
  return [...byCapability.values()];
}

function capabilitySourceRank(source) {
  return { unknown: 0, "preset-declared": 1, "user-declared": 2, probed: 3 }[source] || 0;
}

function safeFailureCategory(value) {
  const normalized = String(value || "unavailable").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/u.test(normalized) ? normalized : "unavailable";
}

function safeFailureMessage(value) {
  return String(value || "Provider 目录获取失败。").replace(/Bearer\s+[^\s]+/giu, "Bearer [已隐藏]").slice(0, 240);
}
