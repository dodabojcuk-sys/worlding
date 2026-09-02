import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  beginCatalogRefresh,
  completeCatalogRefresh,
  declaredCapabilities,
  emptyCatalogSnapshot,
  failCatalogRefresh,
  mergeModelEntry,
  unsupportedCatalogSnapshot
} from "../../apps/story-studio/server/providerGateway/providerCatalog.mjs";
import {
  createPersistentProviderProfileStore,
  defaultProviderProfileState,
  normalizeProviderProfile
} from "../../apps/story-studio/server/providerGateway/persistentProviderProfileStore.mjs";

test("preset suggestions never count as a fetched catalog", () => {
  const state = defaultProviderProfileState(new Date("2026-09-03T00:00:00.000Z"));
  const amd = state.profiles.find((profile) => profile.provider === "radeon-cloud");
  assert.equal(amd.catalog.status, "never_fetched");
  assert.equal(amd.catalog.fetchedAt, null);
  assert.equal(amd.catalog.entries.filter((entry) => entry.source === "endpoint").length, 0);
  assert.equal(amd.suggestedModels.length, 1);
});

test("legacy static catalogs without a success timestamp migrate to unverified", () => {
  const migrated = normalizeProviderProfile({
    schemaVersion: 2,
    revision: 4,
    activeProfileId: "radeon-cloud.default",
    profiles: [{
      id: "radeon-cloud.default",
      provider: "radeon-cloud",
      displayName: "AMD Radeon Cloud",
      baseUrl: "https://developer.amd.com.cn/radeon/api/v1",
      modelId: "DeepSeek-V4-Flash-Vision-Exp",
      enabled: true,
      credentialRef: "radeon-cloud.default",
      connectionStatus: "unknown",
      lastVerifiedAt: null,
      lastError: null,
      availableModels: ["DeepSeek-V4-Flash-Vision-Exp"],
      lastModelDiscoveryAt: null,
      updatedAt: "2026-08-22T00:00:00.000Z"
    }],
    history: []
  });
  const profile = migrated.profiles.find((entry) => entry.provider === "radeon-cloud");
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(profile.catalog.status, "never_fetched");
  assert.equal(profile.catalog.fetchedAt, null);
  assert.equal(profile.catalog.entries[0].source, "unverified");
  assert.deepEqual(profile.availableModels, []);
});

test("catalog transition preserves last-known-good as stale after failure", () => {
  const empty = emptyCatalogSnapshot("fixture.default", 0);
  const loading = beginCatalogRefresh(empty, new Date("2026-09-03T00:00:00.000Z"));
  assert.equal(loading.status, "loading");
  const ready = completeCatalogRefresh(loading, [{ id: "fixture/model", source: "endpoint", capabilityClaims: [] }], new Date("2026-09-03T00:00:01.000Z"));
  assert.equal(ready.status, "ready");
  const retrying = beginCatalogRefresh(ready, new Date("2026-09-03T00:00:02.000Z"));
  const stale = failCatalogRefresh(retrying, { category: "timeout", message: "timed out" }, new Date("2026-09-03T00:00:03.000Z"));
  assert.equal(stale.status, "stale");
  assert.equal(stale.lastKnownGood, true);
  assert.deepEqual(stale.entries.map((entry) => entry.id), ["fixture/model"]);
  assert.equal(stale.lastSuccessAt, "2026-09-03T00:00:01.000Z");
  const firstFailure = failCatalogRefresh(beginCatalogRefresh(empty), { category: "unavailable", message: "offline" });
  assert.equal(firstFailure.status, "failed");
});

test("endpoint changes invalidate only the active Provider instance catalog", () => {
  const appDataRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-catalog-r0-"));
  const store = createPersistentProviderProfileStore({ appDataRoot, now: () => new Date("2026-09-03T00:00:00.000Z") });
  let state = store.save({ expectedRevision: 0, provider: "siliconflow", modelId: "fixture/chat" });
  state = store.beginCatalog({ expectedRevision: state.revision });
  state = store.completeCatalog({ expectedRevision: state.revision, entries: [{ id: "fixture/chat", source: "endpoint", capabilityClaims: [] }] });
  const siliconBefore = state.profiles.find((profile) => profile.provider === "siliconflow");
  const amdBefore = state.profiles.find((profile) => profile.provider === "radeon-cloud");
  state = store.save({ expectedRevision: state.revision, provider: "siliconflow", baseUrl: "http://127.0.0.1:9911/v1" });
  const siliconAfter = state.profiles.find((profile) => profile.provider === "siliconflow");
  const amdAfter = state.profiles.find((profile) => profile.provider === "radeon-cloud");
  assert.equal(siliconAfter.configRevision, siliconBefore.configRevision + 1);
  assert.equal(siliconAfter.catalog.status, "stale");
  assert.equal(siliconAfter.catalog.providerInstanceId, "siliconflow.default");
  assert.deepEqual(amdAfter.catalog, amdBefore.catalog);
});

test("unknown capability remains unknown and one model may receive multiple explicit capabilities", () => {
  const unknown = { id: "fixture/model", source: "endpoint", capabilityClaims: [] };
  assert.deepEqual(declaredCapabilities(unknown), []);
  const llm = mergeModelEntry([unknown], { id: "fixture/model", source: "endpoint", capabilityClaims: [{ capability: "llm", source: "user-declared" }] });
  const both = mergeModelEntry(llm, { id: "fixture/model", source: "endpoint", capabilityClaims: [{ capability: "embedding", source: "probed" }], dimensions: 768 });
  assert.deepEqual(declaredCapabilities(both[0]).sort(), ["embedding", "llm"]);
  assert.equal(both[0].dimensions, 768);
});

test("a Provider without a catalog endpoint enters the explicit manual flow", () => {
  const unsupported = unsupportedCatalogSnapshot(
    emptyCatalogSnapshot("manual-only.default", 7),
    new Date("2026-09-03T00:00:04.000Z")
  );
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.entries.length, 0);
  assert.equal(unsupported.failure.category, "unsupported");
  assert.match(unsupported.failure.message, /手工配置模型/u);
});
