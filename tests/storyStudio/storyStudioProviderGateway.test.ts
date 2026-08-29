import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createAiProviderGateway,
  DEFAULT_MODEL_PROFILES,
  selectStructuredChatModel
} from "../../apps/story-studio/server/providerGateway/aiProviderGateway.mjs";
import {
  ProviderGatewayError,
  providerGatewayErrorPayload
} from "../../apps/story-studio/server/providerGateway/providerGatewayErrors.mjs";
import {
  createSiliconFlowAdapter,
  SILICONFLOW_CHAT_COMPLETIONS_URL,
  SILICONFLOW_MODELS_URL
} from "../../apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs";
import { createSessionCredentialController } from "../../apps/story-studio/server/providerGateway/sessionCredentialController.mjs";

const PROFILE_ID = DEFAULT_MODEL_PROFILES[0].id;
const TEST_CREDENTIAL = "test-only-siliconflow-credential";

test("provider status and model profiles expose non-sensitive metadata only", () => {
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async () => { throw new Error("fetch should not run"); }
  });

  const metadata = gateway.metadata();
  assert.deepEqual(metadata.providers, [{ id: "siliconflow", configured: true, callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null }]);
  assert.deepEqual(Object.keys(metadata.providers[0]).sort(), ["callCount", "configured", "id", "lastLatencyMs", "lastTraceId", "lastUsage"]);
  assert.equal(metadata.models[0].id, "Qwen/Qwen3.5-35B-A3B");
  assert.equal(metadata.profiles[0].providerId, "siliconflow");
  assert.equal(metadata.profiles[0].streaming, true);
  const serialized = JSON.stringify(metadata);
  assert.equal(serialized.includes(TEST_CREDENTIAL), false);
  assert.equal(serialized.includes("SILICONFLOW_API_KEY"), false);
  assert.equal(serialized.toLowerCase().includes("authorization"), false);
});

test("missing credential fails honestly before fetch and never falls back", async () => {
  let fetchCount = 0;
  const gateway = createGateway({
    environment: {},
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must not run");
    }
  });

  assert.deepEqual(gateway.metadata().providers, [{ id: "siliconflow", configured: false, callCount: 0, lastLatencyMs: null, lastUsage: null, lastTraceId: null }]);
  await assert.rejects(
    gateway.openChatStream(requestInput()),
    (error: unknown) => error instanceof ProviderGatewayError
      && error.code === "unconfigured"
      && error.retryable === false
  );
  assert.equal(fetchCount, 0);
});

test("invalid caller input is distinct from an invalid upstream response", async () => {
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async () => { throw new Error("fetch should not run"); }
  });
  await assert.rejects(
    gateway.openChatStream({ profileId: "unknown", messages: [{ role: "user", content: "hello" }] }),
    (error: unknown) => error instanceof ProviderGatewayError
      && error.code === "invalid-request"
      && error.statusCode === 400
      && error.retryable === false
  );
});

test("SiliconFlow adapter uses the fixed official endpoint and normalizes ordered SSE chunks", async () => {
  let observedUrl = "";
  let observedInit: RequestInit | undefined;
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
      observedUrl = String(url);
      observedInit = init;
      return sseResponse([
        "data: {\"choices\":[{\"delta\":{\"content\":\"你\"},\"finish_reason\":null}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"好\"},\"finish_reason\":null}]}",
        "\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}\n\n",
        "data: [DONE]\n\n"
      ], { "x-siliconcloud-trace-id": "trace-safe-123" });
    }
  });

  const stream = await gateway.openChatStream(requestInput());
  assert.equal(stream.traceId, "trace-safe-123");
  const events = await collect(stream.events);
  assert.equal(observedUrl, SILICONFLOW_CHAT_COMPLETIONS_URL);
  assert.equal(observedInit?.method, "POST");
  assert.equal(observedInit?.redirect, "error");
  assert.equal(observedInit?.signal instanceof AbortSignal, true);
  const headers = observedInit?.headers as Record<string, string>;
  assert.equal(headers.accept, "text/event-stream");
  assert.equal(headers.authorization.startsWith("Bearer "), true);
  assert.equal(headers.authorization.length, `Bearer ${TEST_CREDENTIAL}`.length);
  const body = JSON.parse(String(observedInit?.body));
  assert.deepEqual(body, {
    model: "Qwen/Qwen3.5-35B-A3B",
    messages: [{ role: "user", content: "只回复 OK" }],
    stream: true,
    max_tokens: 2400,
    temperature: 0.35,
    enable_thinking: false
  });
  assert.deepEqual(events, [
    { type: "chunk", text: "你", finishReason: null, usage: null },
    { type: "chunk", text: "好", finishReason: null, usage: null },
    { type: "chunk", text: "", finishReason: "stop", usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 } },
    { type: "done" }
  ]);
  assert.equal(JSON.stringify(events).includes(TEST_CREDENTIAL), false);
});

test("Provider Gateway enforces an explicit per-run output cap below the selected profile", async () => {
  let observedMaxTokens = 0;
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      observedMaxTokens = JSON.parse(String(init?.body)).max_tokens;
      return sseResponse(["data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n", "data: [DONE]\n\n"]);
    }
  });
  const stream = await gateway.openChatStream({ ...requestInput(), maxOutputTokens: 512 });
  await collect(stream.events);
  assert.equal(observedMaxTokens, 512);
  await assert.rejects(gateway.openChatStream({ ...requestInput(), maxOutputTokens: 2_401 }), /Invalid/);
});

test("grounded JSON mode requests one provider-native JSON object without changing the profile boundary", async () => {
  let body: Record<string, unknown> | null = null;
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return sseResponse(["data: {\"choices\":[{\"delta\":{\"content\":\"{}\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"]);
    }
  });
  const stream = await gateway.openChatStream({ ...requestInput(), responseFormat: "json-object" });
  await collect(stream.events);
  assert.deepEqual(body?.response_format, { type: "json_object" });
  assert.equal(JSON.stringify(body).includes(TEST_CREDENTIAL), false);
});

test("minimal non-stream inference reuses the Provider Gateway and exposes only bounded response metadata", async () => {
  let observedBody: Record<string, unknown> | null = null;
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      observedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        model: "Qwen/Qwen3.5-35B-A3B",
        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
      }), {
        status: 200,
        headers: { "content-type": "application/json", "x-siliconcloud-trace-id": "trace-minimal" }
      });
    }
  });
  const result = await gateway.openChatCompletion({
    profileId: PROFILE_ID,
    messages: [{ role: "user", content: "Reply with OK." }],
    maxOutputTokens: 16
  });
  assert.deepEqual(result, {
    modelId: "Qwen/Qwen3.5-35B-A3B",
    content: "OK",
    finishReason: "stop",
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
    traceId: "trace-minimal"
  });
  assert.equal(observedBody?.stream, false);
  assert.equal(JSON.stringify(result).includes(TEST_CREDENTIAL), false);
});

test("one large transport chunk may contain many individually bounded SSE events", async () => {
  const payload = `${Array.from({ length: 4_000 }, () => (
    "data: {\"choices\":[{\"delta\":{\"content\":\"x\"},\"finish_reason\":null}]}\n\n"
  )).join("")}data:[DONE]\n\n`;
  assert.equal(Buffer.byteLength(payload) > 256 * 1024, true);
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async () => sseResponse([payload])
  });

  const stream = await gateway.openChatStream(requestInput());
  const events = await collect(stream.events);
  assert.equal(events.length, 4_001);
  assert.deepEqual(events.at(-1), { type: "done" });
});

test("upstream status errors map without response-body or credential leakage and do not retry", async () => {
  const cases = [
    { status: 401, code: "unauthorized" },
    { status: 403, code: "forbidden" },
    { status: 404, code: "not-found" },
    { status: 429, code: "rate-limited" },
    { status: 503, code: "unavailable" },
    { status: 400, code: "invalid-response" }
  ];
  for (const current of cases) {
    let fetchCount = 0;
    const gateway = createGateway({
      environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(`upstream-secret-body-${TEST_CREDENTIAL}`, {
          status: current.status,
          headers: { "content-type": "application/json" }
        });
      }
    });
    await assert.rejects(gateway.openChatStream(requestInput()), (error: unknown) => {
      assert.equal(error instanceof ProviderGatewayError, true);
      const payload = providerGatewayErrorPayload(error);
      assert.equal(payload.code, current.code);
      assert.equal(JSON.stringify(payload).includes(TEST_CREDENTIAL), false);
      assert.equal(JSON.stringify(payload).includes("upstream-secret-body"), false);
      return true;
    });
    assert.equal(fetchCount, 1);
  }
});

test("caller AbortSignal cancels an active stream without a second request", async () => {
  let fetchCount = 0;
  let streamCancelled = false;
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: {\"choices\":[{\"delta\":{\"content\":\"起\"},\"finish_reason\":null}]}\n\n"));
    },
    cancel() {
      streamCancelled = true;
    }
  });
  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(upstream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
  });
  const controller = new AbortController();
  const stream = await gateway.openChatStream({ ...requestInput(), signal: controller.signal });
  const iterator = stream.events[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), {
    value: { type: "chunk", text: "起", finishReason: null, usage: null },
    done: false
  });
  controller.abort();
  await assert.rejects(iterator.next(), (error: unknown) => error instanceof ProviderGatewayError && error.code === "cancelled");
  assert.equal(fetchCount, 1);
  assert.equal(streamCancelled, true);
});

test("profile timeout aborts one pending request and maps to timeout", async () => {
  let fetchCount = 0;
  const adapter = createSiliconFlowAdapter({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async (_url: URL | RequestInfo, init?: RequestInit) => {
      fetchCount += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    }
  });
  const gateway = createAiProviderGateway({
    adapters: [adapter],
    profiles: [{
      ...DEFAULT_MODEL_PROFILES[0],
      id: "timeout-profile",
      timeoutMs: 50
    }]
  });

  await assert.rejects(
    gateway.openChatStream({ ...requestInput(), profileId: "timeout-profile" }),
    (error: unknown) => error instanceof ProviderGatewayError && error.code === "timeout"
  );
  assert.equal(fetchCount, 1);
});

test("missing DONE, malformed JSON, and non-SSE responses fail closed", async () => {
  const responses = [
    () => sseResponse(["data: {\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}\n\n"]),
    () => sseResponse(["data: not-json\n\ndata: [DONE]\n\n"]),
    () => new Response("plain", { status: 200, headers: { "content-type": "application/json" } })
  ];
  for (const response of responses) {
    const gateway = createGateway({
      environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
      fetchImpl: async () => response()
    });
    const operation = async () => {
      const stream = await gateway.openChatStream(requestInput());
      await collect(stream.events);
    };
    await assert.rejects(operation(), (error: unknown) => error instanceof ProviderGatewayError && error.code === "invalid-response");
  }
});

test("server wiring keeps credentials server-only and exposes only the bounded grounded-answer route", () => {
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const adapter = readFileSync("apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs", "utf8");
  const localTransport = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  const preferences = readFileSync("apps/story-studio/src/lib/controlCenterPreferences.ts", "utf8");
  assert.match(server, /\/__local\/story-studio\/model-service\//);
  assert.match(server, /route === "status"/);
  assert.match(server, /handleModelServiceRequest[\s\S]*requireToken\(request\);[\s\S]*requireSameOrigin\(request\);/);
  assert.match(server, /route === "tianyi-grounded-answer"/);
  assert.match(server, /runTianyiGroundedAnswer/);
  assert.doesNotMatch(server, /route === "chat\/stream"/);
  assert.doesNotMatch(server, /route === "chat"/);
  assert.match(adapter, /environment \|\| process\.env/);
  assert.match(adapter, /SILICONFLOW_API_KEY/);
  assert.doesNotMatch(localTransport, /SILICONFLOW_API_KEY|Authorization:\s*Bearer/);
  assert.doesNotMatch(preferences, /SILICONFLOW_API_KEY|Authorization:\s*Bearer/);
});

test("session credential stays in memory and model discovery exposes IDs only", async () => {
  const credentials = createSessionCredentialController();
  credentials.replace(TEST_CREDENTIAL);
  let observedAuthorization = "";
  const gateway = createAiProviderGateway({
    adapters: [createSiliconFlowAdapter({
      apiKeyProvider: () => credentials.readForProvider(),
      fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
        assert.equal(String(url), SILICONFLOW_MODELS_URL);
        observedAuthorization = (init?.headers as Record<string, string>).authorization;
        return new Response(JSON.stringify({ data: [{ id: "Qwen/Qwen3.5-35B-A3B" }, { id: "Qwen/Qwen3.5-9B" }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    })]
  });

  const discovery = await gateway.discoverModels({ providerId: "siliconflow" });
  assert.deepEqual(discovery.modelIds, ["Qwen/Qwen3.5-35B-A3B", "Qwen/Qwen3.5-9B"]);
  assert.equal(gateway.selectDiscoveredModel(discovery.modelIds).modelId, "Qwen/Qwen3.5-35B-A3B");
  assert.equal(observedAuthorization, `Bearer ${TEST_CREDENTIAL}`);
  assert.equal(JSON.stringify(discovery).includes(TEST_CREDENTIAL), false);
  credentials.clear();
  assert.equal(credentials.configured(), false);
  assert.equal(credentials.readForProvider(), "");
});

test("live catalog selection rejects JSON-incompatible families and creates a session-only profile", async () => {
  assert.equal(selectStructuredChatModel([
    "deepseek-ai/DeepSeek-V3.2",
    "Pro/zai-org/GLM-4.7",
    "Qwen/Qwen3.5-9B"
  ]), "Qwen/Qwen3.5-9B");
  assert.throws(() => selectStructuredChatModel(["deepseek-ai/DeepSeek-R1", "deepseek-ai/DeepSeek-V3.2"]));

  const gateway = createGateway({
    environment: { SILICONFLOW_API_KEY: TEST_CREDENTIAL },
    fetchImpl: async () => { throw new Error("fetch should not run"); }
  });
  const selected = gateway.selectDiscoveredModel(["vendor/new-chat-model"]);
  assert.equal(selected.id, "siliconflow-session-structured");
  assert.equal(selected.modelId, "vendor/new-chat-model");
  assert.deepEqual(gateway.metadata().profiles.map((profile) => profile.modelId), ["vendor/new-chat-model"]);
  gateway.clearDiscoveredModel();
  assert.equal(gateway.metadata().profiles[0].modelId, DEFAULT_MODEL_PROFILES[0].modelId);
});

function createGateway(options: { environment: Record<string, string>; fetchImpl: typeof fetch }) {
  return createAiProviderGateway({
    adapters: [createSiliconFlowAdapter(options)]
  });
}

function requestInput() {
  return {
    profileId: PROFILE_ID,
    messages: [{ role: "user", content: "只回复 OK" }]
  };
}

function sseResponse(chunks: string[], extraHeaders: Record<string, string> = {}): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    }
  }), { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", ...extraHeaders } });
}

async function collect(source: AsyncIterable<unknown>) {
  const values = [];
  for await (const value of source) values.push(value);
  return values;
}
