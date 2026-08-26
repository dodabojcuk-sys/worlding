import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLocalFileDevelopmentCredentialBackend,
  createMacKeychainCredentialBackend
} from "../../apps/story-studio/server/providerGateway/providerCredentialBackend.mjs";
import {
  createPersistentProviderProfileStore,
  defaultProviderProfileState
} from "../../apps/story-studio/server/providerGateway/persistentProviderProfileStore.mjs";
import { createSessionCredentialController } from "../../apps/story-studio/server/providerGateway/sessionCredentialController.mjs";

test("persistent Provider Profile saves atomically, increments revision, and never stores a credential", () => {
  const appDataRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-profile-"));
  const store = createPersistentProviderProfileStore({ appDataRoot, now: () => new Date("2026-08-22T00:00:00.000Z") });
  const initial = store.read();
  assert.equal(initial.revision, 0);
  const saved = store.save({
    expectedRevision: initial.revision,
    displayName: "Fixture SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    modelId: "fixture/chat-model",
    enabled: true
  });
  assert.equal(saved.revision, 1);
  assert.equal(saved.profiles[0].modelId, "fixture/chat-model");
  const serialized = readFileSync(store.profilePath, "utf8");
  assert.equal(serialized.includes("api-key"), false);
  assert.equal(statSync(store.profilePath).mode & 0o777, 0o600);
  assert.throws(() => store.save({ expectedRevision: 0, modelId: "stale" }), /已在别处更新/);
});

test("Provider display name cannot be persisted as modelId", () => {
  const appDataRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-model-identity-"));
  const store = createPersistentProviderProfileStore({ appDataRoot });
  assert.throws(
    () => store.save({ expectedRevision: 0, displayName: "硅基流动", modelId: "硅基流动" }),
    /默认模型必须使用模型 ID/u
  );
  assert.equal(store.read().revision, 0);
  assert.equal(store.read().profiles[0].modelId, "");

  const saved = store.save({ expectedRevision: 0, displayName: "硅基流动", modelId: "Qwen/Qwen3.5-35B-A3B" });
  assert.equal(saved.profiles[0].displayName, "硅基流动");
  assert.equal(saved.profiles[0].modelId, "Qwen/Qwen3.5-35B-A3B");
});

test("Profile reload observes an external non-sensitive edit and rejects corrupt input without silent defaults", () => {
  const appDataRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-reload-"));
  const store = createPersistentProviderProfileStore({ appDataRoot });
  const initial = store.read();
  const saved = store.save({ expectedRevision: initial.revision, displayName: "Original", modelId: "fixture/one" });
  const external = {
    ...saved,
    revision: saved.revision + 1,
    profiles: [{ ...saved.profiles[0], displayName: "Edited outside" }]
  };
  writeFileSync(store.profilePath, JSON.stringify(external));
  assert.equal(store.reload().profiles[0].displayName, "Edited outside");
  writeFileSync(store.profilePath, "not-json");
  assert.throws(() => store.reload(), /配置损坏|格式不受支持/);
  assert.ok(store.lastCorruptPath);
});

test("development credential fallback is separate, atomic, 0600, and never returned to the browser projection", () => {
  const appDataRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-credential-"));
  const backend = createLocalFileDevelopmentCredentialBackend({ appDataRoot });
  const controller = createSessionCredentialController({ backend });
  controller.replace("fixture-secret-value");
  assert.equal(controller.configured(), true);
  assert.equal(statSync(backend.filePath).mode & 0o777, 0o600);
  assert.equal(controller.backendKind(), "local-file-development-only");
  controller.clear();
  assert.equal(controller.configured(), false);
});

test("Keychain adapter does not pass the credential in argv", () => {
  let stored = "";
  const calls: Array<{ args: string[]; input?: string }> = [];
  const backend = createMacKeychainCredentialBackend({
    spawnSyncImpl(_command: string, args: string[], options: { input?: string }) {
      calls.push({ args, input: options.input });
      if (args[0] === "find-generic-password") return { status: stored ? 0 : 44, stdout: stored, stderr: "" };
      if (args[0] === "delete-generic-password") { stored = ""; return { status: 0, stdout: "", stderr: "" }; }
      return { status: 1, stdout: "", stderr: "" };
    },
    promptRunImpl(_command: string, args: string[], options: { input?: string }) {
      calls.push({ args, input: options.input });
      stored = String(options.input || "").trim();
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  backend.write("fixture-keychain-secret");
  assert.equal(backend.read(), "fixture-keychain-secret");
  assert.equal(calls.some((call) => call.args.includes("fixture-keychain-secret")), false);
  const promptCall = calls.find((call) => call.args[0] === "-c");
  assert.equal(promptCall?.input, "fixture-keychain-secret\n");
  assert.equal(promptCall?.args[1]?.includes("fixture-keychain-secret"), false);
  backend.clear();
  assert.equal(backend.read(), "");
});

test("default profile is non-secret and versioned", () => {
  const state = defaultProviderProfileState(new Date("2026-08-22T00:00:00.000Z"));
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.revision, 0);
  assert.equal(state.profiles[0].credentialRef, "siliconflow.default");
  assert.equal(JSON.stringify(state).includes("apiKey"), false);
});

test("profile keeps bounded non-sensitive model discovery and operation history in the same owner", () => {
  const appDataRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-history-"));
  const store = createPersistentProviderProfileStore({ appDataRoot });
  const saved = store.save({
    expectedRevision: 0,
    modelId: "fixture/chat-model",
    availableModels: ["fixture/chat-model", "fixture/other-model", "fixture/chat-model"],
    lastModelDiscoveryAt: "2026-08-22T00:00:00.000Z",
    historyEntry: { id: "history-1", kind: "models", status: "success", occurredAt: "2026-08-22T00:00:00.000Z", modelCount: 2, latencyMs: 8 }
  });
  assert.deepEqual(saved.profiles[0].availableModels, ["fixture/chat-model", "fixture/other-model"]);
  assert.equal(saved.history.length, 1);
  assert.equal(store.publicState(saved, { configured: true, backend: "local-file-development-only", suffix: "alue" }).credential.suffix, "alue");
  assert.equal(readFileSync(store.profilePath, "utf8").includes("fixture-secret"), false);
});
