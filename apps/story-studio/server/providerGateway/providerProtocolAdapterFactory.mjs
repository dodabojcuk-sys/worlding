import { createOllamaNativeAdapter } from "./ollamaNativeAdapter.mjs";
import { providerPreset } from "./providerCatalog.mjs";
import { createOpenAiCompatibleAdapter } from "./siliconFlowAdapter.mjs";

/**
 * Binds a concrete Provider instance to one protocol adapter. Presets only
 * supply compatibility defaults; they do not duplicate transport code.
 */
export function createProviderProtocolAdapter(options) {
  const instance = options.instance;
  const preset = providerPreset(instance.preset || instance.provider);
  if (preset.protocolAdapter === "ollama-native") {
    return createOllamaNativeAdapter({
      id: preset.id,
      label: preset.label,
      fetchImpl: options.fetchImpl,
      baseUrlProvider: options.baseUrlProvider
    });
  }
  return createOpenAiCompatibleAdapter({
    id: preset.id,
    label: preset.label,
    fetchImpl: options.fetchImpl,
    apiKeyProvider: options.apiKeyProvider,
    baseUrlProvider: options.baseUrlProvider,
    modelMetadata: preset.suggestedModels.map((entry) => ({ id: entry.id, label: entry.label, capabilities: [] })),
    modelDiscovery: preset.catalogPath ? { pathname: preset.catalogPath, ...(preset.catalogSearch ? { search: preset.catalogSearch } : {}) } : null,
    credentialRequired: preset.credentialRequired,
    traceHeader: preset.id === "siliconflow" ? "x-siliconcloud-trace-id" : "x-request-id",
    enableThinking: preset.id === "siliconflow"
  });
}
