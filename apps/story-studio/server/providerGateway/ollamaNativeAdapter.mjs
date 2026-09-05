import { providerGatewayError } from "./providerGatewayErrors.mjs";

/** Ollama's native /api protocol. It is local and credentialless by default. */
export function createOllamaNativeAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const baseUrlProvider = typeof options.baseUrlProvider === "function" ? options.baseUrlProvider : () => "http://127.0.0.1:11434";
  const id = typeof options.id === "string" && options.id.trim() ? options.id.trim() : "ollama";
  let models = Object.freeze([]);
  const telemetry = { callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null };
  if (typeof fetchImpl !== "function") throw new TypeError("Ollama adapter requires fetch.");

  return Object.freeze({
    id,
    label: options.label || "Ollama",
    get models() { return models; },
    status() { return Object.freeze({ configured: true, ...telemetry }); },
    async discoverModels(input = {}) {
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, endpoint(baseUrlProvider, "api/tags"), { method: "GET", redirect: "error", headers: { accept: "application/json" } }, input);
      if (!response?.ok) { await discard(response); throw mapStatus(response?.status); }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const entries = Array.isArray(payload?.models) ? payload.models : [];
      const normalized = [];
      const seen = new Set();
      for (const entry of entries.slice(0, 500)) {
        const modelId = String(entry?.model || entry?.name || "").trim().slice(0, 240);
        if (!modelId || seen.has(modelId)) continue;
        seen.add(modelId);
        normalized.push({ id: modelId, label: modelId, capabilities: Object.freeze([]), revision: typeof entry?.digest === "string" ? entry.digest.slice(0, 240) : "unknown" });
      }
      if (!normalized.length) throw providerGatewayError("invalid-response");
      models = Object.freeze(normalized.map((entry) => Object.freeze(entry)));
      telemetry.lastLatencyMs = Date.now() - startedAt;
      return Object.freeze({ providerId: id, modelIds: Object.freeze(normalized.map((entry) => entry.id)), modelEntries: Object.freeze(normalized.map((entry) => Object.freeze({ id: entry.id, revision: entry.revision }))) });
    },
    async probeEmbedding(input = {}) {
      const modelId = requiredModelId(input.modelId);
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, endpoint(baseUrlProvider, "api/embed"), {
        method: "POST",
        redirect: "error",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ model: modelId, input: [input.syntheticText] })
      }, input);
      if (!response?.ok) { await discard(response); throw mapStatus(response?.status); }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const vector = Array.isArray(payload?.embeddings?.[0]) ? payload.embeddings[0] : null;
      validateVector(vector);
      return Object.freeze({ providerId: id, modelId: typeof payload?.model === "string" ? payload.model : modelId, modelRevision: "unknown", dimensions: vector.length, latencyMs: Date.now() - startedAt });
    },
    async openChatCompletion(input = {}) {
      const modelId = requiredModelId(input.modelId);
      telemetry.callCount += 1;
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, endpoint(baseUrlProvider, "api/chat"), {
        method: "POST",
        redirect: "error",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ model: modelId, messages: input.messages, stream: false, options: { num_predict: input.maxOutputTokens, temperature: input.temperature } })
      }, input);
      if (!response?.ok) { await discard(response); throw mapStatus(response?.status); }
      let payload;
      try { payload = await response.json(); } catch { throw providerGatewayError("invalid-response"); }
      const content = typeof payload?.message?.content === "string" ? payload.message.content : "";
      if (!content && payload?.done !== true) throw providerGatewayError("invalid-response");
      telemetry.lastLatencyMs = Date.now() - startedAt;
      return Object.freeze({ modelId: typeof payload?.model === "string" ? payload.model : modelId, content, finishReason: payload?.done_reason || (payload?.done ? "stop" : null), usage: ollamaUsage(payload), traceId: null });
    },
    async openChatStream(input = {}) {
      const modelId = requiredModelId(input.modelId);
      telemetry.callCount += 1;
      const startedAt = Date.now();
      const response = await fetchWithTimeout(fetchImpl, endpoint(baseUrlProvider, "api/chat"), {
        method: "POST",
        redirect: "error",
        headers: { accept: "application/x-ndjson", "content-type": "application/json" },
        body: JSON.stringify({ model: modelId, messages: input.messages, stream: true, options: { num_predict: input.maxOutputTokens, temperature: input.temperature } })
      }, input);
      if (!response?.ok || !response.body) { await discard(response); throw mapStatus(response?.status); }
      return Object.freeze({ traceId: null, events: consumeJsonLines(response.body, () => { telemetry.lastLatencyMs = Date.now() - startedAt; }) });
    }
  });
}

async function* consumeJsonLines(body, complete) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSeen = false;
  let modelSeen = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let payload;
        try { payload = JSON.parse(line); } catch { throw providerGatewayError("invalid-response"); }
        if (payload?.error) throw providerGatewayError("invalid-response");
        if (!modelSeen && typeof payload?.model === "string" && payload.model.trim()) {
          modelSeen = true;
          yield Object.freeze({ type: "response-metadata", responseModelId: payload.model.trim().slice(0, 240) });
        }
        const text = typeof payload?.message?.content === "string" ? payload.message.content : "";
        if (text) yield Object.freeze({ type: "chunk", text, finishReason: null, usage: null });
        if (payload?.done === true) {
          doneSeen = true;
          yield Object.freeze({ type: "chunk", text: "", finishReason: payload.done_reason || "stop", usage: ollamaUsage(payload) });
          yield Object.freeze({ type: "done" });
        }
      }
    }
    if (!doneSeen) throw providerGatewayError("invalid-response");
  } finally {
    complete();
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function endpoint(baseUrlProvider, suffix) {
  const base = new URL(String(baseUrlProvider() || "").trim());
  if (!/^https?:$/u.test(base.protocol)) throw providerGatewayError("invalid-request");
  base.pathname = `${base.pathname.replace(/\/$/u, "")}/${suffix}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

async function fetchWithTimeout(fetchImpl, url, init, input) {
  const controller = new AbortController();
  const callerSignal = input?.signal;
  if (callerSignal?.aborted) throw providerGatewayError("cancelled");
  const onAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), Math.min(120_000, Math.max(50, Number(input?.timeoutMs) || 15_000)));
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  catch (error) { throw callerSignal?.aborted ? providerGatewayError("cancelled") : error?.name === "AbortError" ? providerGatewayError("timeout") : providerGatewayError("unavailable"); }
  finally { clearTimeout(timeout); callerSignal?.removeEventListener("abort", onAbort); }
}

function requiredModelId(value) {
  const modelId = typeof value === "string" ? value.trim() : "";
  if (!modelId) throw providerGatewayError("invalid-request");
  return modelId;
}

function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length < 1 || vector.length > 1_000_000 || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw providerGatewayError("invalid-response");
}

function ollamaUsage(payload) {
  const promptTokens = Number.isInteger(payload?.prompt_eval_count) ? payload.prompt_eval_count : 0;
  const completionTokens = Number.isInteger(payload?.eval_count) ? payload.eval_count : 0;
  return Object.freeze({ promptTokens, completionTokens, totalTokens: promptTokens + completionTokens });
}

function mapStatus(status) {
  if (status === 404) return providerGatewayError("not-found");
  if (status === 429) return providerGatewayError("rate-limited");
  if (status >= 500) return providerGatewayError("unavailable");
  return providerGatewayError("invalid-response");
}

async function discard(response) { try { await response?.body?.cancel?.(); } catch { /* ignored */ } }
