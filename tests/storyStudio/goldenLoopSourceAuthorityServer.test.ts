import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { readReceipt } from "../../src/storyContinuity/index.ts";
import { createStoryStudioEventReference } from "../../src/storyContracts/storyStudioEventReference.ts";
import { readNuwaRunPack } from "../../src/storyIntelligence/index.ts";

const CONTROL_TOKEN = "test-local-control-token";

test("Golden Loop HTTP route derives one immutable Receipt from server-resolved document source", async (t) => {
  const rootPath = mkdtempSync(path.join(tmpdir(), "tianyan-source-authority-server-"));
  const stateFilePath = path.join(rootPath, ".story-studio", "state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const project = operations.createProject({
    title: "来源权威服务器测试",
    folderSlug: "source-authority-server",
    genre: "mystery",
    ambience: "rain-lighthouse"
  });
  operations.openProject({ projectId: project.id });
  const chapter = operations.createWritingDocument({ projectId: project.id, type: "chapter", title: "第一章" });
  const scene = operations.createWritingDocument({ projectId: project.id, type: "scene", title: "当前场景", chapterId: chapter.id });
  const updated = operations.updateWritingDocument({
    projectId: project.id,
    documentId: scene.id,
    expectedHash: scene.revisionToken,
    status: "drafting",
    body: "甲🙂e\u0301乙：只有这段正文可以成为本轮来源。"
  });
  assert.equal(updated.conflict, false);
  const document = updated.document;
  const plannedEvent = operations.createPlanningEvent({
    projectId: project.id,
    title: "潮门的守夜人提前离开岗位",
    body: "这只是作者待审的事件内容，浏览器只能提交它的稳定引用。"
  });
  const eventRef = createStoryStudioEventReference({
    projectId: project.id,
    event: plannedEvent,
    requestedUse: "simulate-from"
  });
  const port = await reservePort();
  const baseUrl = "http://127.0.0.1:" + port;
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
      PORT: String(port),
      WORLD_OS_STORY_STUDIO_ROOT: rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: CONTROL_TOKEN,
      TIANYAN_CREDENTIAL_BACKEND: "LOCAL_FILE_DEVELOPMENT_ONLY",
      TIANYAN_PROVIDER_APP_DATA_ROOT: path.join(rootPath, "provider-app"),
      TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(baseUrl, child);

  const request = {
    projectId: project.id,
    profileId: "siliconflow-qwen3.5-35b-structured",
    authorIntent: "只比较当前选区之后的最小变化。",
    focus: {
      mode: "nuwa",
      document: {
        id: document.id,
        revision: document.revisionToken,
        selection: { coordinate: "utf16-code-unit", start: 0, end: document.body.length }
      },
      eventRef
    },
    contextRefs: []
  };

  const forgedBackground = await postJson(baseUrl, "/__local/story-studio/model-service/golden-loop/run", {
    ...request,
    background: "FORGED_CLIENT_BACKGROUND"
  });
  assert.equal(forgedBackground.status, 400);
  assert.equal((await listReceipts(baseUrl, project.id)).length, 0);

  const staleRevision = await postJson(baseUrl, "/__local/story-studio/model-service/golden-loop/run", {
    ...request,
    focus: {
      ...request.focus,
      document: { ...request.focus.document, revision: "f".repeat(64) }
    }
  });
  assert.equal(staleRevision.status, 409);
  assert.equal((await listReceipts(baseUrl, project.id)).length, 0);

  const firstAttempt = await postJson(baseUrl, "/__local/story-studio/model-service/golden-loop/run", request);
  assert.equal(firstAttempt.status, 503, JSON.stringify(firstAttempt.payload));
  const receiptsAfterFirstAttempt = await listReceipts(baseUrl, project.id);
  assert.equal(receiptsAfterFirstAttempt.length, 1);

  const receipt = await readReceipt({
    rootPath,
    agentId: "agent.tianyi",
    scope: "project",
    projectId: project.id
  }, receiptsAfterFirstAttempt[0].id);
  assert.ok(receipt);
  assert.equal(receipt.value.sourceBinding?.documentId, document.id);
  assert.equal(receipt.value.sourceBinding?.documentRevision, document.revisionToken);
  assert.deepEqual(receipt.value.sourceBinding?.selection, {
    coordinate: "utf16-code-unit",
    start: 0,
    end: document.body.length
  });
  assert.match(receipt.value.sourceBinding?.contentHash || "", /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(receipt.value).includes("FORGED_CLIENT_BACKGROUND"), false);
  assert.equal(receipt.value.sources.some((source) => source.ownerId === plannedEvent.id), true);

  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const exploration = authorControl.readStoryExploration({ projectId: project.id });
  assert.ok(exploration);
  const runOwner = authorControl.readStoryExplorationRunOwner({ projectId: project.id, explorationId: exploration.id });
  const runPack = readNuwaRunPack(operations.resolveProjectWorkspacePath({ projectId: project.id }), runOwner.runId);
  const plannedNote = runPack.snapshot.notes.find((note) => note.id === plannedEvent.id);
  assert.ok(plannedNote);
  assert.equal(runPack.snapshot.selectedNoteRefs.includes(plannedNote.relativePath), true);
  assert.equal(runPack.run.plan.tasks.every((task) => task.allowedNoteRefs.includes(plannedNote.relativePath)), true);

  const replay = await postJson(baseUrl, "/__local/story-studio/model-service/golden-loop/run", request);
  assert.equal(replay.status, 503);
  assert.equal((await listReceipts(baseUrl, project.id)).length, 1);

  const providerStatus = await getJson(baseUrl, "/__local/story-studio/model-service/status");
  assert.equal(providerStatus.status, 200);
  assert.equal(providerStatus.payload.data.providers.find((provider: { id: string }) => provider.id === "siliconflow")?.callCount, 0);

  const blockedLiveAttempt = await postJson(baseUrl, "/__local/story-studio/model-service/golden-loop/run", {
    ...request,
    executionMode: "live-pilot-r2"
  });
  assert.equal(blockedLiveAttempt.status, 412);
  assert.match(String((blockedLiveAttempt.payload as { error?: string }).error || ""), /LIVE_SMOKE_BLOCKED_PRICE_UNVERIFIED/u);
  assert.equal((await listReceipts(baseUrl, project.id)).length, 1);
  assert.equal((providerStatus.payload.data as { livePilot?: { priceStatus: string } }).livePilot?.priceStatus, "unverified");
});

async function postJson(baseUrl: string, pathname: string, body: unknown): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(baseUrl + pathname, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-world-os-local-control-token": CONTROL_TOKEN
    },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() as Record<string, unknown> };
}

async function getJson(baseUrl: string, pathname: string): Promise<{ status: number; payload: { data: { providers: Array<{ id: string; callCount: number }> } } }> {
  const response = await fetch(baseUrl + pathname, {
    headers: { "x-world-os-local-control-token": CONTROL_TOKEN }
  });
  return {
    status: response.status,
    payload: await response.json() as { data: { providers: Array<{ id: string; callCount: number }> } }
  };
}

async function listReceipts(baseUrl: string, projectId: string): Promise<Array<{ id: string }>> {
  const response = await postJson(baseUrl, "/__local/story-studio/tianyi/receipt/list", { projectId });
  assert.equal(response.status, 200);
  return response.payload.data as Array<{ id: string }>;
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
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
    if (child.exitCode !== null) throw new Error("Story Studio server exited before becoming ready.");
    try {
      if ((await fetch(baseUrl + "/__local/story-studio/bootstrap")).ok) return;
    } catch {
      // The process is still binding its loopback port.
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for Story Studio source-authority test server.");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
