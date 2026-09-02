import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";

test("Provider Settings persists non-sensitive profile across restart and protects revision/credential boundaries", async () => {
  const storyRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-server-story-"));
  const providerRoot = mkdtempSync(path.join(tmpdir(), "tianyan-provider-server-config-"));
  const stateFilePath = path.join(storyRoot, "state.json");
  const port = 48_000 + (process.pid % 1_000);
  const base = `http://127.0.0.1:${port}`;
  const fakeProvider = await startFakeSiliconFlow();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    WORLD_OS_STORY_STUDIO_ROOT: storyRoot,
    WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
    TIANYAN_PROVIDER_APP_DATA_ROOT: providerRoot,
    TIANYAN_CREDENTIAL_BACKEND: "LOCAL_FILE_DEVELOPMENT_ONLY"
  };
  const serverLogs: string[] = [];
  let child = spawnServer(env, serverLogs);
  try {
    await waitForServer(base);
    const session = await fetch(`${base}/__local/story-studio/storage/session`, { headers: { origin: base } });
    assert.equal(session.status, 200);
    const cookie = session.headers.get("set-cookie") || "";
    const headers = { cookie, origin: base, "content-type": "application/json" };
    const initial = await jsonGet(base, "model-service/status", headers);
    assert.equal(initial.data.profile.revision, 0);
    assert.equal(initial.data.profile.credential.configured, false);

    const saved = await jsonPost(base, "model-service/profile/save", {
      expectedRevision: 0,
      displayName: "Fixture Profile",
      baseUrl: "https://api.siliconflow.cn/v1",
      modelId: "fixture/chat-model",
      enabled: true
    }, headers);
    assert.equal(saved.status, 200);
    assert.equal(saved.data.revision, 1);
    assert.equal(JSON.stringify(saved).includes("fixture-secret"), false);

    await terminateChildProcess(child, { label: "persistent Provider profile test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    child = spawnServer(env, serverLogs);
    await waitForServer(base);
    const sessionAfterRestart = await fetch(`${base}/__local/story-studio/storage/session`, { headers: { origin: base } });
    let activeHeaders = { cookie: sessionAfterRestart.headers.get("set-cookie") || "", origin: base, "content-type": "application/json" };
    const restarted = await jsonGet(base, "model-service/status", activeHeaders);
    assert.equal(restarted.data.profile.profile.displayName, "Fixture Profile");
    assert.equal(restarted.data.profile.profile.modelId, "fixture/chat-model");
    assert.equal(restarted.data.profile.credential.configured, false);
    assert.equal(restarted.data.profile.storage.scope, "test-isolated");
    assert.match(restarted.data.profile.storage.compatibilityNotice, /Smoke/u);

    const profilePath = path.join(providerRoot, "provider-profile.json");
    const external = JSON.parse(readFileSync(profilePath, "utf8"));
    external.revision = 2;
    external.profiles[0].displayName = "Edited by operator";
    writeFileSync(profilePath, JSON.stringify(external));
    const reloaded = await jsonPost(base, "model-service/profile/reload", {}, activeHeaders);
    assert.equal(reloaded.data.profile.displayName, "Edited by operator");
    assert.equal(reloaded.data.revision, 2);
    const conflict = await jsonPost(base, "model-service/profile/save", { expectedRevision: 1, displayName: "Must not overwrite" }, activeHeaders);
    assert.equal(conflict.status, 409);

    const configured = await jsonPost(base, "model-service/profile/save", {
      expectedRevision: 2,
      displayName: "Edited by operator",
      baseUrl: fakeProvider.baseUrl,
      modelId: "fixture/chat-model",
      enabled: true,
      apiKey: "fixture-secret-value"
    }, activeHeaders);
    assert.equal(configured.data.credential.configured, true);
    assert.equal(configured.data.profile.modelId, "fixture/chat-model");
    assert.equal(JSON.stringify(configured).includes("fixture-secret-value"), false);
    assert.equal(configured.data.profile.connectionStatus, "unknown");
    const credentialPath = path.join(providerRoot, "credentials", "siliconflow.default.credential");
    assert.equal(readFileSync(credentialPath, "utf8").trim(), "fixture-secret-value");

    await terminateChildProcess(child, { label: "persistent Provider credential restart test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    child = spawnServer(env, serverLogs);
    await waitForServer(base);
    const sessionAfterCredentialRestart = await fetch(`${base}/__local/story-studio/storage/session`, { headers: { origin: base } });
    activeHeaders = { cookie: sessionAfterCredentialRestart.headers.get("set-cookie") || "", origin: base, "content-type": "application/json" };
    const credentialRestarted = await jsonGet(base, "model-service/status", activeHeaders);
    assert.equal(credentialRestarted.data.profile.credential.configured, true);
    assert.equal(credentialRestarted.data.profile.profile.modelId, "fixture/chat-model");
    assert.equal(credentialRestarted.data.tianyiDialogue.ready, true);
    assert.equal(JSON.stringify(credentialRestarted).includes("fixture-secret-value"), false);

    const invalidModelIdentity = await jsonPost(base, "model-service/profile/save", {
      expectedRevision: configured.data.revision,
      displayName: "Edited by operator",
      modelId: "Edited by operator",
      enabled: true
    }, activeHeaders);
    assert.equal(invalidModelIdentity.status, 400);
    assert.match(invalidModelIdentity.error || "", /模型 ID/u);
    const afterInvalidModelIdentity = await jsonGet(base, "model-service/status", activeHeaders);
    assert.equal(afterInvalidModelIdentity.data.profile.revision, configured.data.revision);
    assert.equal(afterInvalidModelIdentity.data.profile.profile.modelId, "fixture/chat-model");

    const models = await jsonPost(base, "model-service/models", {}, activeHeaders);
    assert.equal(models.status, 200);
    assert.deepEqual(models.data.models, ["fixture/chat-model", "fixture/alternate-model"]);
    assert.deepEqual(models.data.profile.profile.availableModels, ["fixture/chat-model", "fixture/alternate-model"]);
    assert.equal(models.data.profile.history.at(-1).kind, "models");
    assert.equal(JSON.stringify(models).includes("fixture-secret-value"), false);

    const selectedModel = await jsonPost(base, "model-service/profile/save", {
      expectedRevision: models.data.profile.revision,
      modelId: "fixture/alternate-model",
      enabled: true
    }, activeHeaders);
    assert.equal(selectedModel.status, 200);
    assert.equal(selectedModel.data.profile.modelId, "fixture/alternate-model");
    assert.equal(selectedModel.data.credential.configured, true, "A model-only save with no apiKey must preserve the existing credential.");

    await terminateChildProcess(child, { label: "model-only Provider credential restart test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    child = spawnServer(env, serverLogs);
    await waitForServer(base);
    const sessionAfterModelOnlyRestart = await fetch(`${base}/__local/story-studio/storage/session`, { headers: { origin: base } });
    activeHeaders = { cookie: sessionAfterModelOnlyRestart.headers.get("set-cookie") || "", origin: base, "content-type": "application/json" };
    const modelOnlyRestarted = await jsonGet(base, "model-service/status", activeHeaders);
    assert.equal(modelOnlyRestarted.data.profile.credential.configured, true);
    assert.equal(modelOnlyRestarted.data.profile.profile.modelId, "fixture/alternate-model");
    assert.equal(readFileSync(credentialPath, "utf8").trim(), "fixture-secret-value");
    assert.equal(JSON.stringify(modelOnlyRestarted).includes("fixture-secret-value"), false);

    const revealed = await jsonPost(base, "model-service/profile/reveal-credential", { confirmed: true }, activeHeaders);
    assert.equal(revealed.status, 404);
    assert.equal(JSON.stringify(revealed).includes("fixture-secret-value"), false);

    const staleCredential = await jsonPost(base, "model-service/profile/save", {
      expectedRevision: 2,
      displayName: "Must not replace credential",
      apiKey: "stale-secret-value"
    }, activeHeaders);
    assert.equal(staleCredential.status, 409);
    assert.equal(readFileSync(credentialPath, "utf8").trim(), "fixture-secret-value");

    const connection = await jsonPost(base, "model-service/test", { modelId: "fixture/alternate-model" }, activeHeaders);
    assert.equal(connection.status, 200);
    assert.equal(connection.data.modelId, "fixture/alternate-model");
    assert.equal(connection.data.availableModelCount, 2);
    assert.deepEqual(connection.data.models, ["fixture/chat-model", "fixture/alternate-model"]);
    assert.equal(connection.data.profile.profile.connectionStatus, "verified");
    assert.equal(connection.data.profile.profile.modelId, "fixture/alternate-model");
    const inference = await jsonPost(base, "model-service/minimal-inference", {}, activeHeaders);
    assert.equal(inference.status, 200);
    assert.equal(inference.data.modelId, "fixture/alternate-model");
    assert.equal(inference.data.content, "OK");
    assert.equal(fakeProvider.calls.models, 2);
    assert.equal(fakeProvider.calls.completions, 1);

    const cleared = await jsonPost(base, "model-service/profile/clear-credential", { confirmed: true }, activeHeaders);
    assert.equal(cleared.data.credential.configured, false);
    assert.equal(cleared.data.profile.modelId, "fixture/alternate-model");
    assert.equal(cleared.data.profile.connectionStatus, "unknown");

    const disabled = await jsonPost(base, "model-service/profile/disable", { expectedRevision: 2 }, activeHeaders);
    assert.equal(disabled.status, 409);
    const current = await jsonGet(base, "model-service/status", activeHeaders);
    const disabledOk = await jsonPost(base, "model-service/profile/disable", { expectedRevision: current.data.revision }, activeHeaders);
    assert.equal(disabledOk.data.profile.enabled, false);
    assert.equal(serverLogs.join("").includes("fixture-secret-value"), false);
  } finally {
    await terminateChildProcess(child, { label: "persistent Provider profile test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await closeServer(fakeProvider.server);
  }
});

test("Provider Settings can select AMD Radeon Cloud with an isolated credential and a verified local OpenAI-compatible response", async () => {
  const storyRoot = mkdtempSync(path.join(tmpdir(), "tianyan-radeon-server-story-"));
  const providerRoot = mkdtempSync(path.join(tmpdir(), "tianyan-radeon-server-config-"));
  const port = 49_000 + (process.pid % 800);
  const base = `http://127.0.0.1:${port}`;
  const fakeProvider = await startFakeRadeonCloud();
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    WORLD_OS_STORY_STUDIO_ROOT: storyRoot,
    WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(storyRoot, "state.json"),
    TIANYAN_PROVIDER_APP_DATA_ROOT: providerRoot,
    TIANYAN_CREDENTIAL_BACKEND: "LOCAL_FILE_DEVELOPMENT_ONLY"
  };
  const logs: string[] = [];
  const child = spawnServer(env, logs);
  try {
    await waitForServer(base);
    const session = await fetch(`${base}/__local/story-studio/storage/session`, { headers: { origin: base } });
    const headers = { cookie: session.headers.get("set-cookie") || "", origin: base, "content-type": "application/json" };
    const configured = await jsonPost(base, "model-service/profile/save", {
      expectedRevision: 0,
      provider: "radeon-cloud",
      displayName: "AMD Radeon Cloud",
      baseUrl: fakeProvider.baseUrl,
      modelId: "DeepSeek-V4-Flash-Vision-Exp",
      enabled: true,
      apiKey: "fixture-amd-secret"
    }, headers);
    assert.equal(configured.status, 200);
    assert.equal(configured.data.profile.provider, "radeon-cloud");
    assert.equal(configured.data.credential.configured, true);
    assert.equal(JSON.stringify(configured).includes("fixture-amd-secret"), false);
    assert.equal(readFileSync(path.join(providerRoot, "credentials", "radeon-cloud.default.credential"), "utf8").trim(), "fixture-amd-secret");
    assert.equal(logs.join("").includes("fixture-amd-secret"), false);

    const models = await jsonPost(base, "model-service/models", {}, headers);
    assert.equal(models.status, 200);
    assert.equal(models.data.providerId, "radeon-cloud");
    assert.deepEqual(models.data.models, ["DeepSeek-V4-Flash-Vision-Exp", "Qwen3.8-Flash-Next"]);
    assert.equal(fakeProvider.calls.models, 1);

    const inference = await jsonPost(base, "model-service/minimal-inference", {}, headers);
    assert.equal(inference.status, 200);
    assert.equal(inference.data.modelId, "DeepSeek-V4-Flash-Vision-Exp");
    assert.equal(inference.data.content, "AMD OK");
    assert.equal(fakeProvider.calls.completions, 1);
    assert.equal(fakeProvider.authorization, "Bearer fixture-amd-secret");
  } finally {
    await terminateChildProcess(child, { label: "AMD Radeon Cloud Provider server test", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await closeServer(fakeProvider.server);
  }
});

async function startFakeSiliconFlow(): Promise<{ server: Server; baseUrl: string; calls: { models: number; completions: number } }> {
  const calls = { models: 0, completions: 0 };
  const server = createServer((request, response) => {
    if (request.url === "/v1/models?type=text&sub_type=chat" && request.method === "GET") {
      calls.models += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "fixture/chat-model" }, { id: "fixture/alternate-model" }] }));
      return;
    }
    if (request.url === "/v1/chat/completions" && request.method === "POST") {
      calls.completions += 1;
      response.writeHead(200, { "content-type": "application/json", "x-siliconcloud-trace-id": "fixture-trace" });
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const model = JSON.parse(body).model;
        response.end(JSON.stringify({ model, choices: [{ message: { content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }));
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake SiliconFlow server did not expose a port.");
  return { server, baseUrl: `http://127.0.0.1:${address.port}/v1`, calls };
}

async function startFakeRadeonCloud(): Promise<{ server: Server; baseUrl: string; calls: { models: number; completions: number }; authorization: string | null }> {
  const calls = { models: 0, completions: 0 };
  let authorization: string | null = null;
  const server = createServer((request, response) => {
    if (request.url === "/api/v1/models" && request.method === "GET") {
      calls.models += 1;
      authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : null;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "DeepSeek-V4-Flash-Vision-Exp" }, { id: "Qwen3.8-Flash-Next" }] }));
      return;
    }
    if (request.url === "/api/v1/chat/completions" && request.method === "POST") {
      calls.completions += 1;
      authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : null;
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const model = JSON.parse(body).model;
        response.writeHead(200, { "content-type": "application/json", "x-request-id": "amd-server-fixture" });
        response.end(JSON.stringify({ model, choices: [{ message: { content: "AMD OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 } }));
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake Radeon Cloud server did not expose a port.");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    calls,
    get authorization() { return authorization; }
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function spawnServer(env: NodeJS.ProcessEnv, logs: string[]): ChildProcess {
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr?.on("data", (chunk) => logs.push(String(chunk)));
  return child;
}

async function waitForServer(base: string): Promise<void> {
  // Cold-starting the full Story Studio server can exceed eight seconds on a
  // loaded developer machine; keep the test bounded without making it flaky.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/__local/story-studio/bootstrap`)).ok) return;
    } catch { /* retry until bounded startup deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Provider profile server did not start.");
}

async function jsonGet(base: string, route: string, headers: Record<string, string>) {
  const response = await fetch(`${base}/__local/story-studio/${route}`, { headers });
  const data = await response.json() as { data?: Record<string, any>; error?: string };
  return { status: response.status, data: data.data, error: data.error };
}

async function jsonPost(base: string, route: string, body: unknown, headers: Record<string, string>) {
  const response = await fetch(`${base}/__local/story-studio/${route}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await response.json() as { data?: Record<string, any>; error?: string };
  return { status: response.status, data: data.data, error: data.error };
}
