import assert from "node:assert/strict";
import test from "node:test";

import {
  EMBEDDING_INDEX_REBUILD_MESSAGE,
  changeGlobalEmbeddingDefault,
  compareEmbeddingBindings,
  createEmbeddingIndexManifest,
  guardDatasetEmbeddingBinding,
  type EmbeddingBindingIdentity
} from "../../src/storyContinuity/embeddingIndexBinding.ts";

const identity = (overrides: Partial<EmbeddingBindingIdentity> = {}): EmbeddingBindingIdentity => ({
  providerInstanceId: "siliconflow.default",
  protocol: "openai-compatible",
  preset: "siliconflow",
  endpointIdentity: "endpoint-a",
  modelId: "BAAI/bge-m3",
  modelRevision: "digest-a",
  dimensions: 1024,
  encoding: "float32",
  normalization: "l2",
  distanceMetric: "cosine",
  adapterVersion: "openai-compatible/v1",
  chunkingRecipe: "story-source-chunks",
  chunkingVersion: "v1",
  ...overrides
});

const manifest = createEmbeddingIndexManifest({
  indexGenerationId: "index-generation-1",
  datasetId: "dataset-1",
  ...identity(),
  createdAt: "2026-09-03T00:00:00.000Z",
  status: "ready",
  sourceBoundary: { documentIds: ["document-1"], versionIds: ["work-version-1"], boundaryDigest: "boundary-a" }
});

test("embedding compatibility covers vector-space and chunking identity", () => {
  for (const changed of [
    identity({ dimensions: 768 }),
    identity({ modelRevision: "digest-b" }),
    identity({ normalization: "none" }),
    identity({ distanceMetric: "dot" }),
    identity({ chunkingVersion: "v2" })
  ]) {
    const result = compareEmbeddingBindings(identity(), changed);
    assert.equal(result.compatible, false);
    assert.equal(result.mismatches.length, 1);
  }
  assert.equal(compareEmbeddingBindings(identity(), identity()).compatible, true);
});

test("an incompatible dataset binding is blocked with an explicit rebuild gate", () => {
  const result = guardDatasetEmbeddingBinding(manifest, identity({ dimensions: 768 }));
  assert.deepEqual({ allowed: result.allowed, requiresRebuild: result.requiresRebuild, message: result.message }, { allowed: false, requiresRebuild: true, message: EMBEDDING_INDEX_REBUILD_MESSAGE });
});

test("changing global Embedding default never rewrites existing dataset manifests", () => {
  const before = JSON.stringify(manifest);
  const changed = changeGlobalEmbeddingDefault({ currentDefault: identity(), nextDefault: identity({ modelId: "new/model", modelRevision: "unknown" }), datasetBindings: [{ datasetId: "dataset-1", manifest }] });
  assert.equal(changed.defaultEmbedding.modelId, "new/model");
  assert.equal(JSON.stringify(changed.datasetBindings[0].manifest), before);
  assert.equal(changed.datasetBindings[0].manifest.indexGenerationId, "index-generation-1");
});
