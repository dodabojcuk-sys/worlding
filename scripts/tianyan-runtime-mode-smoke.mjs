import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";

import { assertCanonicalRuntime } from "./canonical-runtime.mjs";

assertCanonicalRuntime();
const distIndex = path.join(process.cwd(), "apps/story-studio/dist/index.html");
if (!existsSync(distIndex)) throw new Error("Production runtime smoke requires apps/story-studio/dist/index.html; run npm run build first.");

const port = await reservePort();
const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-runtime-mode-smoke-"));
const baseUrl = `http://127.0.0.1:${port}`;
const evidencePath = String(process.env.TIANYAN_RUNTIME_MODE_EVIDENCE || "").trim();
const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    WORLD_OS_STORY_STUDIO_ROOT: path.join(root, "workspace"),
    WORLD_OS_STORY_STUDIO_STATE_FILE: path.join(root, "workspace", ".story-studio", "state.json"),
    TIANYAN_PROVIDER_APP_DATA_ROOT: path.join(root, "provider-app-data"),
    TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1",
    TIANYAN_STORY_STUDIO_RUNTIME_MODE: "combined-static",
    PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY",
    REAL_PROVIDER_CREDENTIALS_USED: "0"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForHealthyServer();
  const rootPage = await fetch(baseUrl);
  assert.equal(rootPage.status, 200);
  const rootHtml = await rootPage.text();
  assert.doesNotMatch(rootHtml, /\/@vite\/client|\/src\/main\.tsx/);
  const assetPath = readAssetPath(rootHtml);

  const nestedRoute = await fetch(`${baseUrl}/event-line?eventView=line`);
  assert.equal(nestedRoute.status, 200, "combined-static must keep nested SPA refreshes available.");
  assert.equal(await nestedRoute.text(), rootHtml);

  const asset = await fetch(`${baseUrl}${assetPath}`);
  assert.equal(asset.status, 200, "combined-static must return hashed build assets.");

  const health = await fetch(`${baseUrl}/__local/story-studio/health`);
  assert.deepEqual(await health.json(), { data: { status: "healthy", runtimeMode: "combined-static" } });

  const missingApi = await fetch(`${baseUrl}/__local/story-studio/runtime-mode-missing`);
  assert.equal(missingApi.status, 404, "unknown API routes must not fall back to index.html.");
  assert.match(String(missingApi.headers.get("content-type")), /application\/json/);
  const missingApiBody = await missingApi.text();
  assert.doesNotMatch(missingApiBody, /<!doctype html>/i);

  if (evidencePath) writeFileSync(evidencePath, JSON.stringify({
    runtimeMode: "combined-static",
    entry: baseUrl,
    nestedRouteStatus: nestedRoute.status,
    assetPath,
    assetStatus: asset.status,
    health: { status: 200, body: { data: { status: "healthy", runtimeMode: "combined-static" } } },
    unknownApi: { status: missingApi.status, contentType: missingApi.headers.get("content-type"), body: JSON.parse(missingApiBody) },
    viteStarted: false,
    source: "apps/story-studio/dist"
  }, null, 2));

  console.log(`APP_UI_AND_API=${baseUrl}`);
  console.log("RUNTIME_MODE=combined-static");
  console.log("PRODUCTION_VITE_STARTED=0");
  console.log("PRODUCTION_SINGLE_PORT_SMOKE=PASS");
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(2_000)]);
  }
  rmSync(root, { recursive: true, force: true });
}

async function reservePort() {
  const probe = createNetServer();
  try {
    await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("Unable to reserve loopback port.");
    return address.port;
  } finally {
    await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  }
}

async function waitForHealthyServer() {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("combined-static server exited before becoming healthy.");
    try { if ((await fetch(`${baseUrl}/__local/story-studio/health`)).ok) return; } catch { /* retry */ }
    await delay(80);
  }
  throw new Error("combined-static server did not become healthy.");
}

function readAssetPath(html) {
  const match = html.match(/(?:src|href)="(\/assets\/[^"]+)"/u);
  if (!match) throw new Error("Built index.html does not reference a hashed asset.");
  return match[1];
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
