import assert from "node:assert/strict";
import test from "node:test";

import {
  createRadeonCloudAdapter,
  RADEON_CLOUD_BASE_URL,
  RADEON_CLOUD_DEFAULT_MODEL_ID,
  RADEON_CLOUD_PROVIDER_ID
} from "../../apps/story-studio/server/providerGateway/radeonCloudAdapter.mjs";

const TEST_CREDENTIAL = "test-only-radeon-cloud-credential";

test("AMD Radeon Cloud adapter uses the documented OpenAI-compatible chat endpoint without leaking its credential", async () => {
  let observedUrl = "";
  let observedHeaders: Headers | null = null;
  let observedBody: Record<string, unknown> | null = null;
  const adapter = createRadeonCloudAdapter({
    apiKeyProvider: () => TEST_CREDENTIAL,
    fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
      observedUrl = String(url);
      observedHeaders = new Headers(init?.headers);
      observedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({
        model: RADEON_CLOUD_DEFAULT_MODEL_ID,
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "amd-fixture-trace" } });
    }
  });

  assert.deepEqual(await adapter.discoverModels(), {
    providerId: RADEON_CLOUD_PROVIDER_ID,
    modelIds: [RADEON_CLOUD_DEFAULT_MODEL_ID]
  });
  const result = await adapter.openChatCompletion({
    modelId: RADEON_CLOUD_DEFAULT_MODEL_ID,
    messages: [{ role: "user", content: "Hello" }],
    maxOutputTokens: 16,
    temperature: 0.1,
    timeoutMs: 500
  });

  assert.equal(observedUrl, `${RADEON_CLOUD_BASE_URL}/chat/completions`);
  assert.equal(observedHeaders?.get("authorization"), `Bearer ${TEST_CREDENTIAL}`);
  assert.equal(observedHeaders?.get("content-type"), "application/json");
  assert.deepEqual(observedBody, {
    model: RADEON_CLOUD_DEFAULT_MODEL_ID,
    messages: [{ role: "user", content: "Hello" }],
    stream: false,
    max_tokens: 16,
    temperature: 0.1
  });
  assert.equal(result.content, "OK");
  assert.equal(result.traceId, "amd-fixture-trace");
  assert.equal(JSON.stringify(adapter.status()).includes(TEST_CREDENTIAL), false);
});

test("AMD Radeon Cloud adapter rejects an empty credential without an upstream call", async () => {
  let calls = 0;
  const adapter = createRadeonCloudAdapter({ apiKeyProvider: () => "", fetchImpl: async () => { calls += 1; throw new Error("unexpected"); } });
  await assert.rejects(
    adapter.openChatCompletion({ modelId: RADEON_CLOUD_DEFAULT_MODEL_ID, messages: [{ role: "user", content: "Hello" }], maxOutputTokens: 16, temperature: 0.1 }),
    { code: "unconfigured" }
  );
  assert.equal(calls, 0);
});
