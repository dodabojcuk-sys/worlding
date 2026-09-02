import assert from "node:assert/strict";
import test from "node:test";

import { createAiProviderGateway, EMBEDDING_PROBE_TEXT } from "../../apps/story-studio/server/providerGateway/aiProviderGateway.mjs";
import { createOllamaNativeAdapter } from "../../apps/story-studio/server/providerGateway/ollamaNativeAdapter.mjs";
import { createOpenAiCompatibleAdapter } from "../../apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs";

test("OpenAI-compatible Embedding probe uses only fixed synthetic text and returns no vector", async () => {
  const secret = "fixture-openai-compatible-secret";
  let body: Record<string, unknown> | null = null;
  let authorization = "";
  const adapter = createOpenAiCompatibleAdapter({
    id: "fixture",
    label: "Fixture",
    apiKeyProvider: () => secret,
    defaultBaseUrl: "https://fixture.invalid/v1",
    modelMetadata: [{ id: "fixture/embed", label: "Embed", capabilities: [] }],
    fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
      assert.equal(String(url), "https://fixture.invalid/v1/embeddings");
      authorization = new Headers(init?.headers).get("authorization") || "";
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ model: "fixture/embed", data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const gateway = createAiProviderGateway({ adapters: [adapter], profiles: [{ id: "fixture-profile", label: "Fixture", purpose: "structured-story", providerId: "fixture", modelId: "fixture/embed", maxOutputTokens: 32, temperature: 0, timeoutMs: 500, enableThinking: false }] });
  const result = await gateway.probeEmbedding({ providerId: "fixture", modelId: "fixture/embed" });
  assert.deepEqual(body, { model: "fixture/embed", input: EMBEDDING_PROBE_TEXT });
  assert.equal(authorization, `Bearer ${secret}`);
  assert.equal(result.dimensions, 3);
  assert.equal("embedding" in result, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("Ollama native adapter maps /api/tags and /api/embed without guessing capabilities", async () => {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const adapter = createOllamaNativeAdapter({
    baseUrlProvider: () => "http://127.0.0.1:11434",
    fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push(String(url));
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      if (String(url).endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "nomic-embed-text:latest", digest: "sha256:abc" }] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ model: "nomic-embed-text:latest", embeddings: [[0, 0.5, 1, -0.5]] }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  const catalog = await adapter.discoverModels();
  assert.deepEqual(catalog.modelIds, ["nomic-embed-text:latest"]);
  assert.deepEqual(adapter.models[0].capabilities, []);
  const probe = await adapter.probeEmbedding({ modelId: "nomic-embed-text:latest", syntheticText: EMBEDDING_PROBE_TEXT });
  assert.equal(probe.dimensions, 4);
  assert.deepEqual(bodies, [{ model: "nomic-embed-text:latest", input: [EMBEDDING_PROBE_TEXT] }]);
  assert.deepEqual(calls, ["http://127.0.0.1:11434/api/tags", "http://127.0.0.1:11434/api/embed"]);
});
