import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAiProviderGateway } from "../../apps/story-studio/server/providerGateway/aiProviderGateway.mjs";
import { createPersistentProviderProfileStore } from "../../apps/story-studio/server/providerGateway/persistentProviderProfileStore.mjs";
import { createOpenAiCompatibleAdapter } from "../../apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs";
import { assertDatasetEmbeddingCompatible, createEmbeddingIndexManifest, type EmbeddingBindingIdentity } from "../../src/storyContinuity/embeddingIndexBinding.ts";

test("Gateway, catalog owner and binding gate preserve stale data, expose unsupported, and block incompatible vectors", async () => {
  let catalogAttempt = 0;
  const adapter = createOpenAiCompatibleAdapter({
    id: "siliconflow",
    label: "Fixture OpenAI-Compatible",
    apiKeyProvider: () => "fixture-secret",
    defaultBaseUrl: "https://fixture.invalid/v1",
    modelMetadata: [],
    modelDiscovery: { pathname: "models" },
    fetchImpl: async () => {
      catalogAttempt += 1;
      if (catalogAttempt === 1) return new Response(JSON.stringify({ data: [{ id: "fixture/embed" }] }), { status: 200, headers: { "content-type": "application/json" } });
      if (catalogAttempt === 2) return new Response("unavailable", { status: 503 });
      return new Response("missing", { status: 404 });
    }
  });
  const gateway = createAiProviderGateway({
    adapters: [adapter],
    profiles: [{ id: "fixture-profile", label: "Fixture", purpose: "structured-story", providerId: "siliconflow", modelId: "fixture/embed", maxOutputTokens: 32, temperature: 0, timeoutMs: 500, enableThinking: false }]
  });
  const store = createPersistentProviderProfileStore({ appDataRoot: mkdtempSync(path.join(tmpdir(), "tianyan-provider-lifecycle-integration-")) });

  let state = store.beginCatalog({ expectedRevision: 0 });
  const discovered = await gateway.discoverModels({ providerId: "siliconflow" });
  state = store.completeCatalog({ expectedRevision: state.revision, entries: discovered.modelIds.map((id) => ({ id, source: "endpoint", capabilityClaims: [] })) });
  assert.equal(state.profiles[0].catalog.status, "ready");

  state = store.beginCatalog({ expectedRevision: state.revision });
  await assert.rejects(() => gateway.discoverModels({ providerId: "siliconflow" }), { code: "unavailable" });
  state = store.failCatalog({ expectedRevision: state.revision, failure: { category: "unavailable", message: "safe fixture failure" } });
  assert.equal(state.profiles[0].catalog.status, "stale");
  assert.deepEqual(state.profiles[0].catalog.entries.map((entry) => entry.id), ["fixture/embed"]);

  await assert.rejects(() => gateway.discoverModels({ providerId: "siliconflow" }), { code: "not-found" });
  state = store.markCatalogUnsupported({ expectedRevision: state.revision });
  assert.equal(state.profiles[0].catalog.status, "unsupported");

  const bound = createEmbeddingIndexManifest({
    indexGenerationId: "generation-1",
    datasetId: "dataset-1",
    ...identity({ dimensions: 768, modelRevision: "sha256:a" }),
    createdAt: "2026-09-03T00:00:00.000Z",
    status: "ready",
    sourceBoundary: { documentIds: ["document-1"], versionIds: ["version-1"], boundaryDigest: "sha256:source" }
  });
  assert.throws(() => assertDatasetEmbeddingCompatible(bound, identity({ dimensions: 1024, modelRevision: "sha256:b" })), /需要重建新索引/u);
});

function identity(overrides: Partial<EmbeddingBindingIdentity>): EmbeddingBindingIdentity {
  return {
    providerInstanceId: "siliconflow.default",
    protocol: "openai-compatible",
    preset: "siliconflow",
    endpointIdentity: "endpoint-fixture",
    modelId: "fixture/embed",
    modelRevision: "unknown",
    dimensions: 768,
    encoding: "float32",
    normalization: "l2",
    distanceMetric: "cosine",
    adapterVersion: "openai-compatible-r0",
    chunkingRecipe: "story-memory",
    chunkingVersion: "1",
    ...overrides
  };
}
