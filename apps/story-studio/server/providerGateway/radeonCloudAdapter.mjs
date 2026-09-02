import { createOpenAiCompatibleAdapter } from "./siliconFlowAdapter.mjs";

export const RADEON_CLOUD_PROVIDER_ID = "radeon-cloud";
export const RADEON_CLOUD_BASE_URL = "https://developer.amd.com.cn/radeon/api/v1";
export const RADEON_CLOUD_DEFAULT_MODEL_ID = "DeepSeek-V4-Flash-Vision-Exp";

export const RADEON_CLOUD_MODEL_METADATA = Object.freeze([
  Object.freeze({
    id: RADEON_CLOUD_DEFAULT_MODEL_ID,
    label: "DeepSeek V4 Flash Vision Exp",
    capabilities: Object.freeze(["chat", "streaming"])
  })
]);

/** AMD Radeon Cloud's documented OpenAI-compatible chat endpoint. */
export function createRadeonCloudAdapter(options = {}) {
  return createOpenAiCompatibleAdapter({
    ...options,
    id: RADEON_CLOUD_PROVIDER_ID,
    label: "AMD Radeon Cloud",
    modelMetadata: RADEON_CLOUD_MODEL_METADATA,
    defaultBaseUrl: RADEON_CLOUD_BASE_URL,
    apiKeyEnvironmentName: "RADEON_CLOUD_API_KEY",
    // The supplied public contract names the chat endpoint, not a models
    // endpoint. Keep catalog discovery deterministic rather than probing an
    // undocumented route; a connection test still uses chat/completions.
    modelDiscovery: null,
    traceHeader: "x-request-id",
    enableThinking: false
  });
}
