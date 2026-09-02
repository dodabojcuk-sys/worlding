import {
  isProviderGatewayError,
  providerGatewayError
} from "./providerGatewayErrors.mjs";

export const SILICONFLOW_PROVIDER_ID = "siliconflow";
export const SILICONFLOW_CHAT_COMPLETIONS_URL = "https://api.siliconflow.cn/v1/chat/completions";
export const SILICONFLOW_MODELS_URL = "https://api.siliconflow.cn/v1/models?type=text&sub_type=chat";

export const SILICONFLOW_MODEL_METADATA = Object.freeze([
  Object.freeze({
    id: "Qwen/Qwen3.5-35B-A3B",
    label: "Qwen 3.5 35B A3B",
    capabilities: Object.freeze(["chat", "streaming", "json-object", "tool-calls"])
  }),
  Object.freeze({ id: "Qwen/Qwen3.5-9B", label: "Qwen 3.5 9B", capabilities: Object.freeze(["chat", "streaming", "json-object", "tool-calls"]) }),
  Object.freeze({ id: "Qwen/Qwen3.5-4B", label: "Qwen 3.5 4B", capabilities: Object.freeze(["chat", "streaming", "json-object", "tool-calls"]) })
]);

const MAX_SSE_EVENT_BYTES = 256 * 1024;

export function createSiliconFlowAdapter(options = {}) {
  return createOpenAiCompatibleAdapter({
    ...options,
    id: SILICONFLOW_PROVIDER_ID,
    label: "SiliconFlow",
    modelMetadata: SILICONFLOW_MODEL_METADATA,
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    apiKeyEnvironmentName: "SILICONFLOW_API_KEY",
    modelDiscovery: { pathname: "models", search: { type: "text", sub_type: "chat" } },
    traceHeader: "x-siliconcloud-trace-id",
    enableThinking: true
  });
}

/**
 * Small server-only adapter for providers that implement the OpenAI Chat
 * Completions and SSE shape. Product routing, credential ownership and
 * author permissions continue to live outside this transport adapter.
 */
export function createOpenAiCompatibleAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const environment = options.environment || process.env;
  const providerId = requiredProviderId(options.id);
  const label = typeof options.label === "string" && options.label.trim() ? options.label.trim() : providerId;
  const modelMetadata = Array.isArray(options.modelMetadata) && options.modelMetadata.length ? options.modelMetadata : [];
  const apiKeyEnvironmentName = typeof options.apiKeyEnvironmentName === "string" ? options.apiKeyEnvironmentName : "SILICONFLOW_API_KEY";
  const apiKeyProvider = typeof options.apiKeyProvider === "function" ? options.apiKeyProvider : () => readApiKey(environment, apiKeyEnvironmentName);
  const baseUrlProvider = typeof options.baseUrlProvider === "function" ? options.baseUrlProvider : () => options.defaultBaseUrl || "https://api.siliconflow.cn/v1";
  const modelDiscovery = options.modelDiscovery || null;
  const traceHeader = typeof options.traceHeader === "string" && options.traceHeader ? options.traceHeader : "x-request-id";
  const enableThinking = options.enableThinking === true;
  const credentialRequired = options.credentialRequired !== false;
  const telemetry = { callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null };
  let discoveredModels = Object.freeze(modelMetadata.map((model) => Object.freeze({ ...model, capabilities: Object.freeze([...(model.capabilities || [])]) })));
  if (typeof fetchImpl !== "function") throw new TypeError("SiliconFlow adapter requires fetch.");

  return Object.freeze({
    id: providerId,
    label,
    get models() { return discoveredModels; },
    status() {
      return Object.freeze({ configured: !credentialRequired || readCredential(apiKeyProvider).length > 0, ...telemetry });
    },
    async discoverModels(input = {}) {
      const apiKey = readCredential(apiKeyProvider);
      if (credentialRequired && !apiKey) throw providerGatewayError("unconfigured");
      if (!modelDiscovery) {
        const ids = discoveredModels.map((model) => model.id);
        if (!ids.length) throw providerGatewayError("invalid-response");
        return Object.freeze({ providerId, modelIds: Object.freeze(ids) });
      }
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, providerEndpoint(baseUrlProvider, modelDiscovery.pathname, modelDiscovery.search), {
        method: "GET",
        redirect: "error",
        headers: providerHeaders(apiKey, { accept: "application/json" })
      }, input);
      if (!response?.ok) {
        await discardResponseBody(response);
        throw mapHttpStatus(response?.status);
      }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const ids = Array.isArray(payload?.data)
        ? [...new Set(payload.data.map((model) => typeof model?.id === "string" ? model.id.trim() : "").filter(Boolean))].slice(0, 500)
        : [];
      if (!ids.length) throw providerGatewayError("invalid-response");
      discoveredModels = Object.freeze(ids.map((id) => Object.freeze({
        id,
        label: id.split("/").at(-1) || id,
        capabilities: Object.freeze(["chat", "streaming"])
      })));
      telemetry.lastLatencyMs = Date.now() - startedAt;
      return Object.freeze({ providerId, modelIds: Object.freeze(ids) });
    },
    async probeEmbedding(input = {}) {
      const apiKey = readCredential(apiKeyProvider);
      if (credentialRequired && !apiKey) throw providerGatewayError("unconfigured");
      const modelId = typeof input.modelId === "string" ? input.modelId.trim() : "";
      if (!modelId) throw providerGatewayError("invalid-request");
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, providerEndpoint(baseUrlProvider, "embeddings"), {
        method: "POST",
        redirect: "error",
        headers: providerHeaders(apiKey, { accept: "application/json", "content-type": "application/json" }),
        body: JSON.stringify({ model: modelId, input: input.syntheticText })
      }, input);
      if (!response?.ok) {
        await discardResponseBody(response);
        throw mapHttpStatus(response?.status);
      }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const vector = Array.isArray(payload?.data?.[0]?.embedding) ? payload.data[0].embedding : null;
      validateEmbeddingVector(vector);
      return Object.freeze({
        providerId,
        modelId: typeof payload?.model === "string" && payload.model.trim() ? payload.model.trim() : modelId,
        modelRevision: "unknown",
        dimensions: vector.length,
        latencyMs: Date.now() - startedAt
      });
    },
    async openChatCompletion(input) {
      const apiKey = readCredential(apiKeyProvider);
      if (credentialRequired && !apiKey) throw providerGatewayError("unconfigured");
      const callerSignal = input?.signal;
      if (callerSignal?.aborted) throw providerGatewayError("cancelled");
      telemetry.callCount += 1;
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, providerEndpoint(baseUrlProvider, "chat/completions"), {
        method: "POST",
        redirect: "error",
        headers: providerHeaders(apiKey, {
          accept: "application/json",
          "content-type": "application/json"
        }),
        body: JSON.stringify({
          model: input.modelId,
          messages: input.messages,
          stream: false,
          max_tokens: input.maxOutputTokens,
          temperature: input.temperature,
          ...(enableThinking ? { enable_thinking: input.enableThinking === true } : {}),
          ...(input.responseFormat === "json-object" ? { response_format: { type: "json_object" } } : {})
        })
      }, input);
      if (!response?.ok) {
        await discardResponseBody(response);
        throw mapHttpStatus(response?.status);
      }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
      const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
      const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
      const usage = normalizeUsage(payload?.usage);
      if (!content && !finishReason) throw providerGatewayError("invalid-response");
      telemetry.lastUsage = usage;
      telemetry.lastTraceId = boundedTraceId(response.headers?.get?.(traceHeader));
      telemetry.lastLatencyMs = Date.now() - startedAt;
      return Object.freeze({
        modelId: typeof payload?.model === "string" ? payload.model : input.modelId,
        content,
        finishReason,
        usage,
        traceId: telemetry.lastTraceId
      });
    },
    async openChatStream(input) {
      const apiKey = readCredential(apiKeyProvider);
      if (credentialRequired && !apiKey) throw providerGatewayError("unconfigured");
      telemetry.callCount += 1;
      const startedAt = Date.now();

      const callerSignal = input.signal;
      if (callerSignal?.aborted) throw providerGatewayError("cancelled");

      const controller = new AbortController();
      let timeoutTriggered = false;
      const onCallerAbort = () => controller.abort();
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
      const timeoutId = setTimeout(() => {
        timeoutTriggered = true;
        controller.abort();
      }, normalizeTimeout(input.timeoutMs));

      let response;
      try {
        response = await fetchImpl(providerEndpoint(baseUrlProvider, "chat/completions"), {
          method: "POST",
          redirect: "error",
          headers: providerHeaders(apiKey, {
            accept: "text/event-stream",
            "content-type": "application/json"
          }),
          body: JSON.stringify({
            model: input.modelId,
            messages: input.messages,
            stream: true,
            max_tokens: input.maxOutputTokens,
            temperature: input.temperature,
            ...(enableThinking ? { enable_thinking: input.enableThinking === true } : {}),
            ...(input.tools?.length ? { tools: input.tools, tool_choice: input.toolChoice || "auto" } : {}),
            ...(input.responseFormat === "json-object" ? { response_format: { type: "json_object" } } : {})
          }),
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", onCallerAbort);
        throw normalizeTransportError(error, { callerSignal, timeoutTriggered });
      }

      if (!response?.ok) {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", onCallerAbort);
        await discardResponseBody(response);
        throw mapHttpStatus(response?.status);
      }
      if (!isEventStreamResponse(response) || !response.body) {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", onCallerAbort);
        await discardResponseBody(response);
        throw providerGatewayError("invalid-response");
      }

      const traceId = boundedTraceId(response.headers?.get?.(traceHeader));
      telemetry.lastTraceId = traceId;

      return Object.freeze({
        traceId,
        events: consumeProviderStream({
          responseBody: response.body,
          signal: controller.signal,
          callerSignal,
          timeoutTriggered: () => timeoutTriggered,
          onUsage(usage) { telemetry.lastUsage = usage; },
          cleanup() {
            clearTimeout(timeoutId);
            callerSignal?.removeEventListener("abort", onCallerAbort);
            telemetry.lastLatencyMs = Date.now() - startedAt;
          }
        })
      });
    }
  });
}

function providerEndpoint(baseUrlProvider, pathname, search = undefined) {
  let base;
  try {
    base = new URL(String(baseUrlProvider() || "").trim());
  } catch {
    throw providerGatewayError("invalid-request");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") throw providerGatewayError("invalid-request");
  base.pathname = `${base.pathname.replace(/\/$/u, "")}/${pathname.replace(/^\//u, "")}`;
  base.search = search ? new URLSearchParams(search).toString() : "";
  return base.toString();
}

function providerHeaders(apiKey, base) {
  return apiKey ? { ...base, authorization: `Bearer ${apiKey}` } : base;
}

function validateEmbeddingVector(vector) {
  if (!Array.isArray(vector) || vector.length < 1 || vector.length > 1_000_000) throw providerGatewayError("invalid-response");
  if (vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw providerGatewayError("invalid-response");
}

async function* consumeProviderStream(input) {
  try {
    yield* parseSse(input.responseBody, input.signal, input.onUsage);
  } catch (error) {
    throw normalizeTransportError(error, {
      callerSignal: input.callerSignal,
      timeoutTriggered: input.timeoutTriggered()
    });
  } finally {
    input.cleanup();
  }
}

async function* parseSse(body, signal, onUsage) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  const toolCalls = new Map();
  let toolFinishSeen = false;
  try {
    while (!completed) {
      const result = await readWithAbort(reader, signal);
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const source = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (Buffer.byteLength(source) > MAX_SSE_EVENT_BYTES) throw providerGatewayError("invalid-response");
        const event = parseSseEvent(source);
        if (event?.type === "done") {
          for (const call of [...toolCalls.values()].filter((item) => !item.ended).sort((left, right) => left.order - right.order)) {
            call.ended = true;
            yield Object.freeze({ type: "tool-call-malformed", id: call.id || null, name: call.name || null, index: call.index, argumentsJson: call.argumentsJson, reason: "missing-completion" });
          }
          completed = true;
          yield event;
          break;
        }
        if (event?.type === "provider-payload") {
          const normalized = normalizeProviderPayload(event.payload, toolCalls, toolFinishSeen);
          if (normalized.toolFinishSeen) toolFinishSeen = true;
          for (const item of normalized.events) {
            if (item.type === "chunk" && item.usage) onUsage?.(item.usage);
            yield item;
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (Buffer.byteLength(buffer) > MAX_SSE_EVENT_BYTES) throw providerGatewayError("invalid-response");
    }
    if (!completed) throw providerGatewayError("invalid-response");
  } catch (error) {
    if (signal.aborted) {
      for (const call of [...toolCalls.values()].filter((item) => !item.ended).sort((left, right) => left.order - right.order)) {
        yield Object.freeze({ type: "tool-call-aborted", id: call.id || null, name: call.name || null, index: call.index, reason: "cancelled" });
      }
    }
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function parseSseEvent(source) {
  const data = source
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data) return null;
  if (data === "[DONE]") return Object.freeze({ type: "done" });

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    throw providerGatewayError("invalid-response");
  }
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const text = typeof choice?.delta?.content === "string" ? choice.delta.content : "";
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const usage = normalizeUsage(payload?.usage);
  return Object.freeze({ type: "provider-payload", payload });
}

function normalizeProviderPayload(payload, toolCalls, toolFinishSeen) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const text = typeof choice?.delta?.content === "string" ? choice.delta.content : "";
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const usage = normalizeUsage(payload?.usage);
  const rawCalls = Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls : [];
  const events = [];
  if (text || (finishReason && finishReason !== "tool_calls") || usage) events.push(Object.freeze({ type: "chunk", text, finishReason: finishReason === "tool_calls" ? null : finishReason, usage }));
  for (const raw of rawCalls) {
    const index = Number.isInteger(raw?.index) && raw.index >= 0 ? raw.index : null;
    if (index === null) {
      events.push(Object.freeze({ type: "tool-call-malformed", id: null, name: null, index: -1, argumentsJson: "", reason: "missing-index" }));
      continue;
    }
    let call = toolCalls.get(index);
    if (!call) {
      call = { index, id: "", name: "", argumentsJson: "", started: false, ended: false, order: toolCalls.size };
      toolCalls.set(index, call);
    }
    if (call.ended) {
      events.push(Object.freeze({ type: "tool-call-malformed", id: call.id || null, name: call.name || null, index, argumentsJson: call.argumentsJson, reason: "delta-after-end" }));
      continue;
    }
    if (typeof raw.id === "string" && raw.id) call.id = appendProviderField(call.id, raw.id);
    if (typeof raw.function?.name === "string" && raw.function.name) call.name = appendProviderField(call.name, raw.function.name);
    const fragment = typeof raw.function?.arguments === "string" ? raw.function.arguments : "";
    if (!call.started && call.id && call.name) {
      call.started = true;
      events.push(Object.freeze({ type: "tool-call-start", id: call.id, name: call.name, index }));
      if (call.argumentsJson) events.push(Object.freeze({ type: "tool-call-delta", id: call.id, name: call.name, index, argumentsDelta: call.argumentsJson }));
    }
    if (fragment) {
      call.argumentsJson += fragment;
      if (call.argumentsJson.length > MAX_SSE_EVENT_BYTES) {
        events.push(Object.freeze({ type: "tool-call-malformed", id: call.id || null, name: call.name || null, index, argumentsJson: "", reason: "arguments-too-large" }));
        call.ended = true;
      } else if (call.started) {
        events.push(Object.freeze({ type: "tool-call-delta", id: call.id, name: call.name, index, argumentsDelta: fragment }));
      }
    }
  }
  if (finishReason === "tool_calls") {
    if (toolFinishSeen) {
      events.push(Object.freeze({ type: "tool-call-malformed", id: null, name: null, index: -1, argumentsJson: "", reason: "duplicate-completion" }));
    } else {
      for (const call of [...toolCalls.values()].sort((left, right) => left.order - right.order)) {
        if (call.ended) continue;
        call.ended = true;
        if (!call.id || !call.name) {
          events.push(Object.freeze({ type: "tool-call-malformed", id: call.id || null, name: call.name || null, index: call.index, argumentsJson: call.argumentsJson, reason: "missing-field" }));
          continue;
        }
        let parsed;
        try { parsed = JSON.parse(call.argumentsJson || "{}"); } catch { parsed = null; }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          events.push(Object.freeze({ type: "tool-call-malformed", id: call.id, name: call.name, index: call.index, argumentsJson: call.argumentsJson, reason: "malformed-arguments" }));
          continue;
        }
        events.push(Object.freeze({ type: "tool-call-end", id: call.id, name: call.name, index: call.index, argumentsJson: call.argumentsJson || "{}", arguments: parsed }));
      }
    }
    return { events, toolFinishSeen: true };
  }
  return { events, toolFinishSeen };
}

function appendProviderField(current, fragment) {
  if (!current) return fragment;
  return fragment === current || current.endsWith(fragment) ? current : `${current}${fragment}`;
}

function normalizeUsage(value) {
  if (!value || typeof value !== "object") return null;
  const promptTokens = finiteNonNegativeInteger(value.prompt_tokens);
  const completionTokens = finiteNonNegativeInteger(value.completion_tokens);
  const totalTokens = finiteNonNegativeInteger(value.total_tokens);
  if (promptTokens === null || completionTokens === null || totalTokens === null) return null;
  return Object.freeze({ promptTokens, completionTokens, totalTokens });
}

function finiteNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function boundedTraceId(value) {
  if (typeof value !== "string") return null;
  const traceId = value.trim();
  return traceId && traceId.length <= 160 ? traceId : null;
}

function readWithAbort(reader, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function abortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function normalizeTransportError(error, state) {
  if (isProviderGatewayError(error)) return error;
  if (state.callerSignal?.aborted) return providerGatewayError("cancelled");
  if (state.timeoutTriggered) return providerGatewayError("timeout");
  return providerGatewayError("unavailable");
}

function mapHttpStatus(status) {
  if (status === 401) return providerGatewayError("unauthorized");
  if (status === 403) return providerGatewayError("forbidden");
  if (status === 404) return providerGatewayError("not-found");
  if (status === 429) return providerGatewayError("rate-limited");
  if (status >= 500) return providerGatewayError("unavailable");
  return providerGatewayError("invalid-response");
}

function isEventStreamResponse(response) {
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  return contentType.startsWith("text/event-stream");
}

async function discardResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // The upstream body is intentionally discarded without logging it.
  }
}

function requiredProviderId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)) throw new TypeError("OpenAI-compatible adapter requires a stable provider id.");
  return id;
}

function readApiKey(environment, keyName) {
  return typeof environment?.[keyName] === "string" ? environment[keyName].trim() : "";
}

function readCredential(provider) {
  const value = provider();
  return typeof value === "string" ? value.trim() : "";
}

async function fetchWithTimeout(fetchImpl, url, init, input) {
  const callerSignal = input?.signal;
  if (callerSignal?.aborted) throw providerGatewayError("cancelled");
  const controller = new AbortController();
  let timeoutTriggered = false;
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onAbort, { once: true });
  const timeoutId = setTimeout(() => { timeoutTriggered = true; controller.abort(); }, normalizeTimeout(input?.timeoutMs || 15_000));
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  catch (error) { throw normalizeTransportError(error, { callerSignal, timeoutTriggered }); }
  finally { clearTimeout(timeoutId); callerSignal?.removeEventListener("abort", onAbort); }
}

function normalizeTimeout(value) {
  const timeout = Number(value);
  if (!Number.isFinite(timeout)) return 30_000;
  return Math.min(120_000, Math.max(50, Math.floor(timeout)));
}
