import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { WORK_VERSION_REQUIRED_OWNER_KINDS, createStoryStudioWorkVersionAuthority } from "../../src/storyWorkspace/workVersionAuthority.ts";
import { resolveWorkVersionOwnerSnapshotRefs, type WorkVersionOwnerProjectionBundle } from "../../src/storyWorkspace/workVersionSnapshotResolver.ts";

const TOKEN = "narrative-arrangement-local-api-token";

test("local API exposes read/create/insert with token gating and no UI-owned order", async (t) => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "tianyan-narrative-api-r0-"));
  const stateFilePath = path.join(rootPath, ".story-studio", "state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "叙事编排 API", folderSlug: "narrative-api-r0" });
  const event = operations.createWorldObject({ projectId: project.id, type: "event", title: "后讲的来信", status: "planned" });
  const unit = operations.createStoryUnit({ projectId: project.id, title: "主路径", linkedEntityIds: [event.id] });
  const projectPath = operations.resolveProjectWorkspacePath({ projectId: project.id });
  const workVersion = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath }).createRootCheckpoint({
    displayName: "主作品",
    authorActionId: "author.api.work-version",
    idempotencyKey: "idempotency.api.work-version",
    expectedRevision: 0,
    createdAt: "2026-09-03T02:00:00.000Z",
    ownerSnapshotRefs: completeOwnerRefs(),
    optionalNuwaProvenanceRefs: []
  });
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(2_000)]);
    }
    rmSync(rootPath, { recursive: true, force: true });
  });
  child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      WORLD_OS_STORY_STUDIO_ROOT: rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: TOKEN,
      TIANYAN_REAL_PROVIDER_PRODUCT_PATH: "0",
      TIANYAN_PROVIDER_APP_DATA_ROOT: path.join(rootPath, "provider-app"),
      TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(baseUrl, child);

  const query = `projectId=${encodeURIComponent(project.id)}&workVersionId=${encodeURIComponent(workVersion.identity.workVersionId)}&narrativePathId=${encodeURIComponent(unit.id)}`;
  const legacy = await getJson(baseUrl, `/__local/story-studio/narrative-arrangement?${query}`);
  assert.equal(legacy.status, 200);
  assert.deepEqual(legacy.payload.data.projection.placed, []);
  assert.equal(legacy.payload.data.projection.unplaced[event.id].state, "unplaced");

  const createBody = { projectId: project.id, workVersionId: workVersion.identity.workVersionId, narrativePathId: unit.id, ownerStoryUnitId: unit.id, expectedOwnerVersion: unit.version, expectedRevision: 0, operationId: "api.arrangement.create", authorActionId: "author.api.arrangement.create", createdAt: "2026-09-03T02:00:01.000Z" };
  const unauthorized = await postJson(baseUrl, "/__local/story-studio/narrative-arrangements/create", createBody, false);
  assert.equal(unauthorized.status, 403);
  const created = await postJson(baseUrl, "/__local/story-studio/narrative-arrangements/create", createBody);
  assert.equal(created.status, 201);
  assert.equal(created.payload.data.conflict, false);
  assert.equal(created.payload.data.receipt.action, "create");

  const inserted = await postJson(baseUrl, "/__local/story-studio/narrative-arrangements/insert", {
    projectId: project.id,
    workVersionId: workVersion.identity.workVersionId,
    narrativePathId: unit.id,
    expectedOwnerVersion: created.payload.data.ownerVersion,
    expectedRevision: created.payload.data.arrangement.currentRevision,
    operationId: "api.placement.insert",
    authorActionId: "author.api.placement.insert",
    createdAt: "2026-09-03T02:00:02.000Z",
    eventId: event.id,
    storyUnitId: unit.id,
    role: "primary",
    position: { kind: "end" }
  });
  assert.equal(inserted.status, 201);
  assert.equal(inserted.payload.data.conflict, false);
  const read = await getJson(baseUrl, `/__local/story-studio/narrative-arrangement?${query}`);
  assert.equal(read.payload.data.projection.placed[0].eventId, event.id);
  assert.equal(read.payload.data.projection.placed[0].narrativeIndex, 0);
  assert.equal("localStorage" in read.payload.data, false);
});

function completeOwnerRefs() {
  const bundle = Object.fromEntries(WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind, index) => [ownerKind, {
    ownerIdentity: `${ownerKind}.narrative-api-r0`,
    projectionSchemaVersion: `${ownerKind}/fixture-v1`,
    revisionToken: `api.revision.${index + 1}`,
    stableReferenceIds: [`${ownerKind}.ref.api`],
    provenanceReceiptIds: [`receipt.${ownerKind}.api`],
    canonicalProjection: { ownerKind, fixture: "narrative-api-r0" }
  }])) as WorkVersionOwnerProjectionBundle;
  return resolveWorkVersionOwnerSnapshotRefs(bundle);
}

async function postJson(baseUrl: string, pathname: string, body: unknown, authorized = true) {
  const response = await fetch(baseUrl + pathname, {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorized ? { "x-world-os-local-control-token": TOKEN } : {}) },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() as any };
}

async function getJson(baseUrl: string, pathname: string) {
  const response = await fetch(baseUrl + pathname);
  return { status: response.status, payload: await response.json() as any };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Story Studio server exited before NarrativeArrangement API became ready.");
    try {
      if ((await fetch(`${baseUrl}/__local/story-studio/bootstrap`)).ok) return;
    } catch {
      // The local fixture server is still binding its loopback port.
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for NarrativeArrangement API fixture.");
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
