import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCreationMediaAsset, deleteCreationMediaAsset, readCreationMediaCatalog, updateCreationMediaAsset } from "../../src/storyWorkspace/creationMediaRepository.mjs";
import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

test("MediaAsset metadata is versioned, searchable data with stable IDs and replace semantics", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tianyan-media-catalog-"));
  try {
    createStoryWorkspace({ rootPath: root, title: "Media" });
    const empty = readCreationMediaCatalog(root);
    assert.equal(empty.contentHash, null);
    const created = createCreationMediaAsset(root, {
      expectedCatalogHash: null,
      now: "2026-08-17T00:00:00.000Z",
      asset: { fileName: "钟楼.png", kind: "image", mimeType: "image/png", size: 2048, width: 1920, height: 1080, durationMs: null, source: "author", license: "original", generatedBy: "", tags: ["钟楼"], relativePath: "assets/images/钟楼.png" }
    });
    assert.equal(created.asset.id, "image.钟楼");
    const updated = updateCreationMediaAsset(root, {
      assetId: created.asset.id,
      expectedCatalogHash: created.catalog.contentHash,
      now: "2026-08-17T01:00:00.000Z",
      patch: { fileName: "钟楼-修订.png", tags: ["钟楼", "夜景"] }
    });
    assert.equal(updated.conflict, false);
    assert.equal(updated.asset.id, created.asset.id);
    assert.deepEqual(updated.asset.tags, ["钟楼", "夜景"]);
    const stale = deleteCreationMediaAsset(root, { assetId: created.asset.id, expectedCatalogHash: created.catalog.contentHash });
    assert.equal(stale.conflict, true);
    const removed = deleteCreationMediaAsset(root, { assetId: created.asset.id, expectedCatalogHash: updated.catalog.contentHash });
    assert.equal(removed.conflict, false);
    assert.equal(removed.catalog.assets.length, 0);
    assert.match(await readFile(path.join(root, "creation", "media-assets.json"), "utf8"), /story-studio-media-catalog\/v1/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MediaAsset repository rejects traversal, dangerous keys, and invalid catalog versions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tianyan-media-hostile-"));
  try {
    createStoryWorkspace({ rootPath: root, title: "Media" });
    assert.throws(() => createCreationMediaAsset(root, {
      expectedCatalogHash: null,
      now: "2026-08-17T00:00:00.000Z",
      asset: { fileName: "bad.png", kind: "image", mimeType: "image/png", size: 1, tags: [], relativePath: "../bad.png", source: "", license: "", generatedBy: "" }
    }), /inside project assets/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
