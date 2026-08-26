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
    capabilities: Object.freeze(["chat", "streaming", "json-object"])
  }),
  Object.freeze({ id: "Qwen/Qwen3.5-9B", label: "Qwen 3.5 9B", capabilities: Object.freeze(["chat", "streaming", "json-object"]) }),
  Object.freeze({ id: "Qwen/Qwen3.5-4B", label: "Qwen 3.5 4B", capabilities: Object.freeze(["chat", "streaming", "json-object"]) })
]);

const MAX_SSE_EVENT_BYTES = 256 * 1024;

export function createSiliconFlowAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const environment = options.environment || process.env;
  const apiKeyProvider = typeof options.apiKeyProvider === "function" ? options.apiKeyProvider : () => readApiKey(environment);
  const baseUrlProvider = typeof options.baseUrlProvider === "function" ? options.baseUrlProvider : () => "https://api.siliconflow.cn/v1";
  const telemetry = { callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null };
  let discoveredModels = SILICONFLOW_MODEL_METADATA;
  if (typeof fetchImpl !== "function") throw new TypeError("SiliconFlow adapter requires fetch.");

  return Object.freeze({
    id: SILICONFLOW_PROVIDER_ID,
    label: "SiliconFlow",
    get models() { return discoveredModels; },
    status() {
      return Object.freeze({ configured: readCredential(apiKeyProvider).length > 0, ...telemetry });
    },
    async discoverModels(input = {}) {
      const apiKey = readCredential(apiKeyProvider);
      if (!apiKey) throw providerGatewayError("unconfigured");
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, providerEndpoint(baseUrlProvider, "models", { type: "text", sub_type: "chat" }), {
        method: "GET",
        redirect: "error",
        headers: { accept: "application/json", authorization: `Bearer ${apiKey}` }
      }, input);
      if (!response?.ok) {
        await discardResponseBody(response);
        throw mapHttpStatus(response?.status);
      }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const ids = Array.isArray(payload?.data)
        ? payload.data.map((model) => typeof model?.id === "string" ? model.id : "").filter(Boolean).slice(0, 500)
        : [];
      if (!ids.length) throw providerGatewayError("invalid-response");
      discoveredModels = Object.freeze(ids.map((id) => Object.freeze({
        id,
        label: id.split("/").at(-1) || id,
        capabilities: Object.freeze(["chat", "streaming"])
      })));
      telemetry.lastLatencyMs = Date.now() - startedAt;
      return Object.freeze({ providerId: SILICONFLOW_PROVIDER_ID, modelIds: Object.freeze(ids) });
    },
    async openChatCompletion(input) {
      const apiKey = readCredential(apiKeyProvider);
      if (!apiKey) throw providerGatewayError("unconfigured");
      const callerSignal = input?.signal;
      if (callerSignal?.aborted) throw providerGatewayError("cancelled");
      telemetry.callCount += 1;
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, providerEndpoint(baseUrlProvider, "chat/completions"), {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: input.modelId,
          messages: input.messages,
          stream: false,
          max_tokens: input.maxOutputTokens,
          temperature: input.temperature,
          enable_thinking: input.enableThinking === true,
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
      telemetry.lastTraceId = boundedTraceId(response.headers?.get?.("x-siliconcloud-trace-id"));
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
      if (!apiKey) throw providerGatewayError("unconfigured");
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
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: input.modelId,
            messages: input.messages,
            stream: true,
            max_tokens: input.maxOutputTokens,
            temperature: input.temperature,
            enable_thinking: input.enableThinking === true,
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

      const traceId = boundedTraceId(response.headers?.get?.("x-siliconcloud-trace-id"));
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
          completed = true;
          yield event;
          break;
        }
        if (event) {
          if (event.type === "chunk" && event.usage) onUsage?.(event.usage);
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (Buffer.byteLength(buffer) > MAX_SSE_EVENT_BYTES) throw providerGatewayError("invalid-response");
    }
    if (!completed) throw providerGatewayError("invalid-response");
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
  if (!text && !finishReason && !usage) return null;
  return Object.freeze({
    type: "chunk",
    text,
    finishReason,
    usage
  });
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

function readApiKey(environment) {
  return typeof environment?.SILICONFLOW_API_KEY === "string" ? environment.SILICONFLOW_API_KEY.trim() : "";
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
