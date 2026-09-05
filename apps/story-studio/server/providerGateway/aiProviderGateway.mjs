import { createHash, randomUUID } from "node:crypto";

import { providerGatewayError } from "./providerGatewayErrors.mjs";

export const DEFAULT_MODEL_PROFILES = Object.freeze([
  Object.freeze({
    id: "siliconflow-qwen3.5-35b-structured",
    label: "Qwen 3.5 35B A3B · 结构化创作",
    purpose: "structured-story",
    providerId: "siliconflow",
    modelId: "Qwen/Qwen3.5-35B-A3B",
    maxOutputTokens: 2_400,
    temperature: 0.35,
    timeoutMs: 45_000,
    enableThinking: false
  }),
  Object.freeze({
    id: "siliconflow-qwen3.5-9b-structured",
    label: "Qwen 3.5 9B · 结构化创作",
    purpose: "structured-story",
    providerId: "siliconflow",
    modelId: "Qwen/Qwen3.5-9B",
    maxOutputTokens: 2_400,
    temperature: 0.35,
    timeoutMs: 45_000,
    enableThinking: false
  }),
  Object.freeze({
    id: "siliconflow-qwen3.5-4b-structured",
    label: "Qwen 3.5 4B · 结构化创作",
    purpose: "structured-story",
    providerId: "siliconflow",
    modelId: "Qwen/Qwen3.5-4B",
    maxOutputTokens: 2_400,
    temperature: 0.35,
    timeoutMs: 45_000,
    enableThinking: false
  }),
  Object.freeze({
    id: "radeon-cloud-deepseek-v4-flash-vision-exp",
    label: "DeepSeek V4 Flash Vision Exp · AMD Radeon Cloud",
    purpose: "structured-story",
    providerId: "radeon-cloud",
    modelId: "DeepSeek-V4-Flash-Vision-Exp",
    maxOutputTokens: 2_400,
    temperature: 0.35,
    timeoutMs: 45_000,
    enableThinking: false
  })
]);

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARACTERS = 24_000;
const MAX_TOTAL_MESSAGE_CHARACTERS = 64_000;
const MAX_TOOLS = 16;
const MAX_TOOL_SCHEMA_CHARACTERS = 16_000;
export const EMBEDDING_PROBE_TEXT = "Tianyan embedding capability probe. No author content.";

export function createAiProviderGateway({ adapters, profiles = DEFAULT_MODEL_PROFILES, budgetLedger = null, receiptEnvelopeStore = null, defaultAuthorizationReceiptId = null, maxOutputTokensCap = null }) {
  const adapterMap = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const frozenProfiles = profiles.map(validateProfile).filter((profile) => adapterMap.has(profile.providerId));
  let activeProfiles = frozenProfiles;
  if (!frozenProfiles.length) throw new TypeError("Provider Gateway requires at least one profile bound to an installed adapter.");

  return Object.freeze({
    reserveGenerationBatch(input) {
      if (!budgetLedger || typeof budgetLedger.reserveBatch !== "function") return Object.freeze({ reservations: Object.freeze([]), ledger: null });
      if (!Array.isArray(input?.requests) || input.requests.length < 1 || input.requests.length > 64) throw providerGatewayError("invalid-request");
      return budgetLedger.reserveBatch({ requests: input.requests.map((request) => ({ idempotencyKey: request.idempotencyKey, kind: "generation", toolLoopTurn: false, retry: false, authorizationReceiptId: request.authorizationReceiptId ?? defaultAuthorizationReceiptId, scope: request.budgetScope })) });
    },
    metadata() {
      return Object.freeze({
        version: "story-studio-provider-gateway/v1",
        providers: Object.freeze([...adapterMap.values()].map((adapter) => Object.freeze({
          id: adapter.id,
          ...adapter.status()
        }))),
        models: Object.freeze([...adapterMap.values()].flatMap((adapter) => adapter.models.map((model) => Object.freeze({
          providerId: adapter.id,
          id: model.id,
          label: model.label,
          capabilities: Object.freeze([...model.capabilities])
        })))),
        profiles: Object.freeze(activeProfiles.map(publicProfile)),
        ...(budgetLedger ? { budgetLedger: budgetLedger.snapshot() } : {}),
        ...(receiptEnvelopeStore ? { replaySafeReceiptEnvelope: Object.freeze({ version: "tianyan-replay-safe-provider-receipt-envelope/v1", envelopeCount: receiptEnvelopeStore.list().length }) } : {})
      });
    },
    async openChatStream(input) {
      const profile = activeProfiles.find((candidate) => candidate.id === input?.profileId);
      if (!profile) throw providerGatewayError("invalid-request");
      const adapter = adapterMap.get(profile.providerId);
      const messages = validateMessages(input?.messages);
      const tools = validateTools(input?.tools);
      const toolChoice = validateToolChoice(input?.toolChoice, tools);
      const configuredTokenCap = maxOutputTokensCap == null ? profile.maxOutputTokens : boundedInteger(maxOutputTokensCap, 1, profile.maxOutputTokens);
      const maxOutputTokens = boundedInteger(input?.maxOutputTokens ?? configuredTokenCap, 1, configuredTokenCap);
      if (adapter.status().configured !== true) return adapter.openChatStream({
        modelId: profile.modelId, messages, maxOutputTokens, temperature: profile.temperature,
        timeoutMs: profile.timeoutMs, signal: input?.signal, responseFormat: input?.responseFormat === "json-object" ? "json-object" : "text", enableThinking: profile.enableThinking,
        ...(tools.length ? { tools, toolChoice } : {})
      });
      const reservation = reserveBudget(budgetLedger, { ...input, authorizationReceiptId: input?.authorizationReceiptId ?? defaultAuthorizationReceiptId }, "generation", profile.id);
      let receipt = null;
      try {
        receipt = beginReceiptEnvelope(receiptEnvelopeStore, reservation, input, profile);
        markReceiptDispatched(receiptEnvelopeStore, receipt);
        const stream = await adapter.openChatStream({
          modelId: profile.modelId,
          messages,
          maxOutputTokens,
          temperature: profile.temperature,
          timeoutMs: profile.timeoutMs,
          signal: input?.signal,
          responseFormat: input?.responseFormat === "json-object" ? "json-object" : "text",
          enableThinking: profile.enableThinking,
          ...(tools.length ? { tools, toolChoice } : {})
        });
        if (!reservation && !receipt) return stream;
        return Object.freeze({
          traceId: stream.traceId,
          ...(receipt ? { receiptEnvelopeId: receipt.envelopeId } : {}),
          events: budgetedEvents(stream.events, budgetLedger, reservation?.reservation?.reservationId ?? null, stream.traceId, receiptEnvelopeStore, receipt)
        });
      } catch (error) {
        completeBudgetFailure(budgetLedger, reservation, error);
        persistReceiptFailure(receiptEnvelopeStore, receipt, error);
        throw error;
      }
    },
    async openChatCompletion(input) {
      const profile = activeProfiles.find((candidate) => candidate.id === input?.profileId);
      if (!profile) throw providerGatewayError("invalid-request");
      const adapter = adapterMap.get(profile.providerId);
      const messages = validateMessages(input?.messages);
      const tools = validateTools(input?.tools);
      const toolChoice = validateToolChoice(input?.toolChoice, tools);
      if (typeof adapter.openChatCompletion !== "function") throw providerGatewayError("unavailable");
      if (adapter.status().configured !== true) return adapter.openChatCompletion({
        modelId: profile.modelId, messages, maxOutputTokens: boundedInteger(input?.maxOutputTokens ?? 64, 1, 512), temperature: profile.temperature,
        timeoutMs: boundedInteger(input?.timeoutMs ?? Math.min(profile.timeoutMs, 30_000), 50, 120_000), signal: input?.signal,
        responseFormat: input?.responseFormat === "json-object" ? "json-object" : "text", enableThinking: false,
        ...(tools.length ? { tools, toolChoice } : {})
      });
      const reservation = input?.budgetReservationId && budgetLedger
        ? { reused: false, reservation: budgetLedger.claim({ reservationId: input.budgetReservationId }) }
        : reserveBudget(budgetLedger, { ...input, authorizationReceiptId: input?.authorizationReceiptId ?? defaultAuthorizationReceiptId }, "generation", profile.id);
      let receipt = null;
      try {
        receipt = beginReceiptEnvelope(receiptEnvelopeStore, reservation, input, profile);
        markReceiptDispatched(receiptEnvelopeStore, receipt);
        const result = await adapter.openChatCompletion({
          modelId: profile.modelId,
          messages,
          maxOutputTokens: boundedInteger(input?.maxOutputTokens ?? 64, 1, 512),
          temperature: profile.temperature,
          timeoutMs: boundedInteger(input?.timeoutMs ?? Math.min(profile.timeoutMs, 30_000), 50, 120_000),
          signal: input?.signal,
          responseFormat: input?.responseFormat === "json-object" ? "json-object" : "text",
          enableThinking: false,
          ...(tools.length ? { tools, toolChoice } : {})
        });
        freezeReceiptResponse(receiptEnvelopeStore, receipt, {
          responseBody: result.toolCalls?.length
            ? JSON.stringify({ content: result.content, toolCalls: result.toolCalls })
            : result.content,
          traceId: result.traceId,
          usage: result.usage,
          finishReason: result.finishReason
        });
        if (reservation) budgetLedger.complete({ reservationId: reservation.reservation.reservationId, outcome: "success", traceId: result.traceId });
        return receipt ? Object.freeze({ ...result, receiptEnvelopeId: receipt.envelopeId }) : result;
      } catch (error) {
        completeBudgetFailure(budgetLedger, reservation, error);
        persistReceiptFailure(receiptEnvelopeStore, receipt, error);
        throw error;
      }
    },
    async discoverModels(input = {}) {
      const adapter = adapterMap.get(input.providerId || "siliconflow");
      if (!adapter || typeof adapter.discoverModels !== "function") throw providerGatewayError("invalid-request");
      // Catalog discovery is an explicit Settings action, not generation. It
      // must remain available even when a prior generation authorization is
      // exhausted; the route still enforces same-origin, credential ownership,
      // response bounds and a hard timeout before this boundary.
      return adapter.discoverModels({ signal: input.signal, timeoutMs: input.timeoutMs });
    },
    async probeEmbedding(input = {}) {
      const adapter = adapterMap.get(input.providerId || "siliconflow");
      if (!adapter || typeof adapter.probeEmbedding !== "function") throw providerGatewayError("unavailable");
      return adapter.probeEmbedding({
        modelId: input.modelId,
        syntheticText: EMBEDDING_PROBE_TEXT,
        signal: input.signal,
        timeoutMs: input.timeoutMs
      });
    },
    selectDiscoveredModel(modelIds, options = {}) {
      const modelId = selectStructuredChatModel(modelIds);
      const providerId = typeof options.providerId === "string" && adapterMap.has(options.providerId) ? options.providerId : "siliconflow";
      const matchingProfile = frozenProfiles.find((profile) => profile.providerId === providerId && profile.modelId === modelId);
      activeProfiles = [matchingProfile || validateProfile({
        id: `${providerId}-session-structured`,
        label: `${modelId} · 当前账户`,
        purpose: "structured-story",
        providerId,
        modelId,
        maxOutputTokens: 2_400,
        temperature: 0.25,
        timeoutMs: 60_000,
        enableThinking: false
      })];
      return publicProfile(activeProfiles[0]);
    },
    clearDiscoveredModel() {
      activeProfiles = frozenProfiles;
    }
  });
}

function reserveBudget(ledger, input, kind, scope) {
  if (!ledger) return null;
  const reservation = ledger.reserve({
    idempotencyKey: typeof input?.idempotencyKey === "string" && input.idempotencyKey.trim() ? input.idempotencyKey : `provider-dispatch.${randomUUID()}`,
    kind,
    scope: typeof input?.budgetScope === "string" && input.budgetScope.trim() ? input.budgetScope : scope,
    toolLoopTurn: input?.toolLoopTurn === true,
    retry: input?.retry === true,
    authorizationReceiptId: input?.authorizationReceiptId ?? null
  });
  if (reservation.reused) {
    const error = new Error("Provider request was already reserved; replay the existing receipt instead of dispatching again.");
    error.code = "PROVIDER_IDEMPOTENT_REPLAY_REQUIRED";
    error.statusCode = 409;
    throw error;
  }
  return reservation;
}

async function* budgetedEvents(events, ledger, reservationId, traceId, receiptEnvelopeStore = null, receipt = null) {
  let completed = false;
  let responseBody = "";
  let usage = null;
  let finishReason = null;
  try {
    for await (const event of events) {
      if (event?.type === "chunk") {
        if (typeof event.text === "string") responseBody += event.text;
        if (event.usage) usage = event.usage;
        if (typeof event.finishReason === "string") finishReason = event.finishReason;
      }
      if (event?.type === "tool-call-delta" && typeof event.argumentsDelta === "string") responseBody += event.argumentsDelta;
      yield event;
    }
    freezeReceiptResponse(receiptEnvelopeStore, receipt, { responseBody, traceId, usage, finishReason });
    if (ledger && reservationId) ledger.complete({ reservationId, outcome: "success", traceId });
    completed = true;
  } catch (error) {
    if (ledger && reservationId) ledger.complete({ reservationId, outcome: budgetOutcome(error), traceId });
    persistReceiptFailure(receiptEnvelopeStore, receipt, error);
    completed = true;
    throw error;
  } finally {
    if (!completed) {
      if (ledger && reservationId) ledger.complete({ reservationId, outcome: "cancelled-after-dispatch", traceId });
      persistReceiptFailure(receiptEnvelopeStore, receipt, { code: "cancelled" });
    }
  }
}

function beginReceiptEnvelope(store, reservation, input, profile) {
  if (!store || !input?.receiptEnvelopeContext) return null;
  if (!reservation?.reservation?.reservationId) {
    const error = new Error("Replay-safe Provider receipts require an existing budget reservation.");
    error.code = "REPLAY_ENVELOPE_BUDGET_REQUIRED";
    throw error;
  }
  const result = store.begin({
    ...input.receiptEnvelopeContext,
    operationId: input.receiptEnvelopeContext.operationId || input.idempotencyKey,
    budgetReservationId: reservation.reservation.reservationId,
    providerId: profile.providerId,
    modelId: profile.modelId
  });
  if (result.reused) {
    const error = new Error("Replay-safe Provider receipt already exists; replay it instead of dispatching again.");
    error.code = "PROVIDER_IDEMPOTENT_REPLAY_REQUIRED";
    error.statusCode = 409;
    throw error;
  }
  return result.envelope;
}

function markReceiptDispatched(store, receipt) {
  if (!store || !receipt) return;
  store.markDispatched({
    envelopeId: receipt.envelopeId,
    dispatchReceiptId: `provider-dispatch.${receipt.budgetReservationId}`
  });
}

function freezeReceiptResponse(store, receipt, input) {
  if (!store || !receipt) return;
  const digest = createHash("sha256").update(String(input.responseBody ?? "")).digest("hex");
  store.freezeResponse({
    envelopeId: receipt.envelopeId,
    frozenResponseId: input.traceId ? `provider-response.${input.traceId}` : `provider-response.${digest.slice(0, 24)}`,
    frozenResponseHash: digest,
    usage: input.usage ?? null,
    finishReason: input.finishReason ?? null
  });
}

function persistReceiptFailure(store, receipt, error) {
  if (!store || !receipt) return;
  const code = typeof error?.code === "string" ? error.code : "transport-failed";
  const replayStatus = code === "timeout" ? "timeout" : (code === "cancelled" || error?.name === "AbortError") ? "cancelled" : "transport_failed";
  try { store.markFailure({ envelopeId: receipt.envelopeId, replayStatus, errorClassification: code }); } catch { /* never replace the Provider error */ }
}

function completeBudgetFailure(ledger, reservation, error) {
  if (!ledger || !reservation) return;
  ledger.complete({ reservationId: reservation.reservation.reservationId, outcome: budgetOutcome(error) });
}

function budgetOutcome(error) {
  if (error?.code === "timeout") return "timeout";
  if (error?.code === "cancelled" || error?.name === "AbortError") return "cancelled-after-dispatch";
  if (error?.code === "invalid-response") return "malformed";
  return "transport-failed";
}

export function selectStructuredChatModel(modelIds) {
  if (!Array.isArray(modelIds)) throw providerGatewayError("invalid-response");
  const candidates = [...new Set(modelIds.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))]
    .filter(isJsonCompatibleChatModel)
    .sort((left, right) => modelPreferenceScore(right) - modelPreferenceScore(left) || left.localeCompare(right));
  if (!candidates.length) throw providerGatewayError("invalid-response");
  return candidates[0];
}

function isJsonCompatibleChatModel(modelId) {
  const normalized = modelId.toLowerCase();
  if (/deepseek-(?:r1|v3)(?:\b|[-_.])/.test(normalized)) return false;
  return !/(?:embedding|rerank|stable-diffusion|flux|kolors|whisper|speech|image|video)/.test(normalized);
}

function modelPreferenceScore(modelId) {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("qwen3.5-35b-a3b")) return 1_000;
  if (normalized.includes("qwen3.5")) return 900;
  if (normalized.includes("glm-5")) return 850;
  if (normalized.includes("glm-4.7")) return 820;
  if (normalized.includes("qwen3")) return 800;
  if (normalized.includes("glm")) return 700;
  if (normalized.includes("hunyuan")) return 650;
  return 100;
}

function validateProfile(value) {
  if (!value || typeof value !== "object") throw new TypeError("Invalid model profile.");
  const id = requiredString(value.id);
  const providerId = requiredString(value.providerId);
  const modelId = requiredString(value.modelId);
  const label = requiredString(value.label);
  const purpose = requiredString(value.purpose);
  const maxOutputTokens = boundedInteger(value.maxOutputTokens, 1, 8_192);
  const temperature = boundedNumber(value.temperature, 0, 2);
  const timeoutMs = boundedInteger(value.timeoutMs, 50, 120_000);
  const enableThinking = value.enableThinking === true;
  return Object.freeze({ id, providerId, modelId, label, purpose, maxOutputTokens, temperature, timeoutMs, enableThinking });
}

function publicProfile(profile) {
  return Object.freeze({
    id: profile.id,
    label: profile.label,
    purpose: profile.purpose,
    providerId: profile.providerId,
    modelId: profile.modelId,
    maxOutputTokens: profile.maxOutputTokens,
    streaming: true
  });
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES) {
    throw providerGatewayError("invalid-request");
  }
  let totalCharacters = 0;
  const messages = value.map((message) => {
    if (!message || typeof message !== "object") throw providerGatewayError("invalid-request");
    if (!new Set(["system", "user", "assistant", "tool"]).has(message.role)) throw providerGatewayError("invalid-request");
    const content = typeof message.content === "string" ? message.content.trim() : "";
    const toolCalls = message.role === "assistant" ? validateAssistantToolCalls(message.toolCalls) : [];
    const toolCallId = message.role === "tool" ? boundedToolString(message.toolCallId, 160) : null;
    const name = message.role === "tool" ? boundedToolName(message.name) : null;
    if ((!content && toolCalls.length === 0) || content.length > MAX_MESSAGE_CHARACTERS) throw providerGatewayError("invalid-request");
    totalCharacters += content.length;
    if (message.role === "assistant" && toolCalls.length) return Object.freeze({ role: "assistant", content: content || null, tool_calls: toolCalls });
    if (message.role === "tool") return Object.freeze({ role: "tool", tool_call_id: toolCallId, name, content });
    return Object.freeze({ role: message.role, content });
  });
  if (totalCharacters > MAX_TOTAL_MESSAGE_CHARACTERS) throw providerGatewayError("invalid-request");
  return Object.freeze(messages);
}

function validateTools(value) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_TOOLS) throw providerGatewayError("invalid-request");
  const names = new Set();
  return Object.freeze(value.map((tool) => {
    const definition = tool?.type === "function" ? tool.function : tool;
    const name = boundedToolName(definition?.name);
    if (names.has(name)) throw providerGatewayError("invalid-request");
    names.add(name);
    const description = boundedToolString(definition?.description, 1_000);
    const parameters = definition?.parameters;
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters) || parameters.type !== "object") throw providerGatewayError("invalid-request");
    const serialized = JSON.stringify(parameters);
    if (serialized.length > MAX_TOOL_SCHEMA_CHARACTERS || /"(?:__proto__|prototype|constructor)"\s*:/u.test(serialized)) throw providerGatewayError("invalid-request");
    return Object.freeze({ type: "function", function: Object.freeze({ name, description, parameters: structuredClone(parameters) }) });
  }));
}

function validateToolChoice(value, tools) {
  if (!tools.length) {
    if (value != null) throw providerGatewayError("invalid-request");
    return null;
  }
  if (value == null || value === "auto") return "auto";
  if (value === "required" || value === "none") return value;
  const name = boundedToolName(value?.type === "function" ? value?.function?.name : value?.name);
  if (!tools.some((tool) => tool.function.name === name)) throw providerGatewayError("invalid-request");
  return Object.freeze({ type: "function", function: Object.freeze({ name }) });
}

function validateAssistantToolCalls(value) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_TOOLS) throw providerGatewayError("invalid-request");
  return Object.freeze(value.map((call) => Object.freeze({
    id: boundedToolString(call?.id, 160),
    type: "function",
    function: Object.freeze({
      name: boundedToolName(call?.name ?? call?.function?.name),
      arguments: boundedToolString(call?.argumentsJson ?? call?.function?.arguments, MAX_MESSAGE_CHARACTERS)
    })
  })));
}

function boundedToolName(value) {
  const name = boundedToolString(value, 96);
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(name)) throw providerGatewayError("invalid-request");
  return name;
}

function boundedToolString(value, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw providerGatewayError("invalid-request");
  return value.trim();
}

function requiredString(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("Invalid model profile string.");
  return value.trim();
}

function boundedInteger(value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError("Invalid model profile integer.");
  return value;
}

function boundedNumber(value, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new TypeError("Invalid model profile number.");
  return value;
}
