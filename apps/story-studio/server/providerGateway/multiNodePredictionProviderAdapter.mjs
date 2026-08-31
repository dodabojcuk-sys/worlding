import { createPiMultiNodePredictionGateway } from "../../../../src/storyAgent/piMultiNodePredictionGateway.ts";

export const REAL_PROVIDER_PREDICTION_ADAPTER_VERSION = "tianyan-multi-node-prediction-provider-adapter-r1/v1";

/**
 * Server-only bridge from the product-owned prediction Gateway to the only
 * Provider broker. Constructing this adapter never dispatches a model call.
 * The caller must still opt into an execution and the broker retains
 * credentials, budgets, idempotency and normalized stream ownership.
 */
export function createRealProviderMultiNodePredictionGateway(options = {}) {
  const gateway = requireGateway(options.gateway);
  const metadata = gateway.metadata();
  const profile = selectProfile(metadata, options.profileId);
  const provider = metadata.providers.find((item) => item.id === profile.providerId);
  if (!provider || provider.configured !== true) throw providerUnavailable("Real prediction Provider is not configured.");
  const maxProviderCalls = boundedInteger(options.maxProviderCalls ?? 8, 2, 8, "Prediction Provider call limit");
  const maxOutputTokens = boundedInteger(options.maxOutputTokens ?? 256, 1, 256, "Prediction output token limit");
  const maxPredictionRuns = options.maxPredictionRuns == null ? null : boundedInteger(options.maxPredictionRuns, 1, 1, "Prediction smoke Run limit");
  let consumedPredictionRuns = 0;

  const predictionGateway = createPiMultiNodePredictionGateway({
    now: options.now,
    provider: {
      providerId: profile.providerId,
      profileId: profile.id,
      modelId: profile.modelId,
      maxOutputTokens,
      async openProviderStream(input) {
        if (input.providerCall > maxProviderCalls) throw providerLimitExceeded(maxProviderCalls);
        return gateway.openChatStream({
          profileId: profile.id,
          messages: input.messages,
          tools: input.tools,
          maxOutputTokens,
          signal: input.signal,
          idempotencyKey: `tianyi-prediction.${safeId(input.projectId)}.${safeId(input.runId)}.${safeId(input.attemptId)}.provider-${input.providerCall}`,
          budgetScope: `tianyi-prediction:${safeId(input.projectId)}`,
          toolLoopTurn: input.providerCall > 1,
          retry: input.retry
        });
      }
    }
  });
  return Object.freeze({
    async generate(input) {
      if (maxPredictionRuns !== null && consumedPredictionRuns >= maxPredictionRuns) throw providerRunLimitExceeded();
      consumedPredictionRuns += 1;
      return predictionGateway.generate(input);
    }
  });
}

function requireGateway(value) {
  if (!value || typeof value.metadata !== "function" || typeof value.openChatStream !== "function") throw new TypeError("Prediction Provider adapter requires the server Provider Gateway.");
  return value;
}

function selectProfile(metadata, requestedId) {
  const profiles = Array.isArray(metadata?.profiles) ? metadata.profiles : [];
  const profile = requestedId
    ? profiles.find((item) => item.id === requestedId)
    : profiles.find((item) => item.purpose === "structured-story") || profiles[0];
  if (!profile || typeof profile.id !== "string" || typeof profile.providerId !== "string" || typeof profile.modelId !== "string") throw providerUnavailable("No structured-story Provider profile is available.");
  return profile;
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

function safeId(value) {
  const normalized = String(value || "").trim();
  if (!/^[\p{L}\p{N}._:-]{1,180}$/u.test(normalized)) throw new TypeError("Prediction Provider scope identifier is invalid.");
  return normalized;
}

function providerUnavailable(message) {
  const error = new Error(message);
  error.name = "ProviderUnavailable";
  error.code = "provider-unavailable";
  error.retryable = false;
  return error;
}

function providerLimitExceeded(limit) {
  const error = new Error(`Prediction Provider exceeded its bounded ${limit}-call tool loop.`);
  error.name = "ProviderLimitExceeded";
  error.code = "provider-call-limit";
  error.retryable = false;
  return error;
}

function providerRunLimitExceeded() {
  const error = new Error("Real prediction smoke is limited to one Prediction Run.");
  error.name = "ProviderRunLimitExceeded";
  error.code = "provider-run-limit";
  error.retryable = false;
  return error;
}
