import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("all Tianyi routes share token, same-origin, bounded JSON, and sanitized error middleware", () => {
  const source = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const expectedRoutes = [
    "identity", "project-resume", "context-projection", "session/open", "question", "session/prepare-close",
    "memory-candidate/review", "memory-candidate/decide", "stopping-point/decide", "session/finalize-close", "session/metadata",
    "receipt/read", "memory/read", "memory/list", "memory/edit", "memory/revoke", "memory/restore", "memory/hard-delete",
    "memory/revisions", "memory/revision/preview", "global-memory-grant/read", "global-memory-grant/list",
    "global-memory-grant/create", "global-memory-grant/revoke", "global-memory-grant/restore", "global-memory-grant/hard-delete",
    "global-memory-grant/revisions", "global-memory-grant/revision/preview", "session/events", "receipt/list",
    "stopping-point/list", "stopping-point/revoke", "stopping-point/restore", "stopping-point/hard-delete",
    "stopping-point/revisions", "tombstone/list", "session/retain-temporary", "session/rollover", "source-return", "session/hard-delete",
    "archive-message/hard-delete", "archive-recall/rebuild", "archive-recall/search", "archive-recall/invalidate",
    "pack/export", "pack/stage"
  ];
  for (const route of expectedRoutes) assert.match(source, new RegExp(`"${route.replace("/", "\\/")}"`));
  assert.match(source, /handleTianyiRequest[\s\S]*requireToken\(request\);[\s\S]*requireSameOrigin\(request\);[\s\S]*MAX_CONTINUITY_JSON_BODY_BYTES/);
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /searchParams\.get\(["']token/);
});

test("Tianyi loopback transport rejects unauthorized, foreign-origin, unknown, oversized, and malformed requests", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-route-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const token = "route-test-local-control-token";
  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "Route Project", folderSlug: "route-project" });
  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    await waitForServer(baseUrl, server);
    const endpoint = `${baseUrl}/__local/story-studio/tianyi/session/open`;
    const validBody = { projectId: "route-project", operationId: "operation.route-open" };

    const unauthorized = await post(endpoint, validBody, {});
    assert.equal(unauthorized.status, 403);

    const foreign = await post(endpoint, validBody, { "x-world-os-local-control-token": token, origin: "http://evil.example" });
    assert.equal(foreign.status, 403);

    const unknown = await post(endpoint, { ...validBody, filesystemPath: rootPath }, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(unknown.status, 400);

    const oversized = await post(endpoint, { ...validBody, filler: "x".repeat(70 * 1024) }, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(oversized.status, 413);

    const malformed = await post(endpoint, { projectId: "../escape", operationId: "operation.route-open" }, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(malformed.status, 400);
    const malformedText = await malformed.text();
    assert.doesNotMatch(malformedText, new RegExp(escapeRegExp(rootPath)));
    assert.doesNotMatch(malformedText, new RegExp(escapeRegExp(token)));

    const valid = await post(endpoint, validBody, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(valid.status, 200);
    const payload = await valid.json() as { data?: { sessionId?: string } };
    assert.match(String(payload.data?.sessionId), /^session\.\d{6}$/u);

    const temporary = await post(endpoint, { ...validBody, operationId: "operation.route-temporary", retentionMode: "temporary" }, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(temporary.status, 200);
    const temporaryPayload = await temporary.json() as { data?: { sessionId?: string; retentionMode?: string; archiveWriteCount?: number } };
    assert.match(String(temporaryPayload.data?.sessionId), /^temporary-session\.[a-f0-9]{24}$/u);
    assert.equal(temporaryPayload.data?.retentionMode, "temporary");
    assert.equal(temporaryPayload.data?.archiveWriteCount, 0);

    const rebuild = await post(`${baseUrl}/__local/story-studio/tianyi/archive-recall/rebuild`, { projectId: "route-project" }, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(rebuild.status, 200);
    const crossProject = await post(`${baseUrl}/__local/story-studio/tianyi/archive-recall/search`, { projectId: "route-project", authorizedProjectIds: ["route-project", "other-project"], query: "route", filters: {}, limit: 20 }, { "x-world-os-local-control-token": token, origin: baseUrl });
    assert.equal(crossProject.status, 400);

    const wrongMethod = await fetch(endpoint, { headers: { "x-world-os-local-control-token": token, origin: baseUrl } });
    assert.equal(wrongMethod.status, 405);
  } finally {
    await terminateChildProcess(server, { label: "Tianyi route test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await rm(rootPath, { recursive: true, force: true });
  }
});

async function post(url: string, body: unknown, headers: Record<string, string>) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Story Studio route test server exited early.");
    try { if ((await fetch(`${baseUrl}/__local/story-studio/bootstrap`)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Story Studio route test server did not start.");
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("OS did not assign a temporary loopback port.");
    return address.port;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
