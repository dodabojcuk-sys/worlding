import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Tianyi Agent transport persists a fixture run through Session/Archive and recovers after restart", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-agent-transport-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const token = "tianyi-agent-transport-token";
  const port = 4300 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;
  createStoryStudioWorkspaceOperations({ rootPath, stateFilePath }).createProject({ title: "Agent 夹具", folderSlug: "agent-fixture" });
  let server = startServer(rootPath, stateFilePath, token, port);
  try {
    await waitForServer(baseUrl, server);
    const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: baseUrl };
    const opened = await post(`${baseUrl}/__local/story-studio/tianyi/session/open`, { projectId: "agent-fixture", operationId: "operation.agent.open" }, headers);
    assert.equal(opened.status, 200);
    const sessionId = (await opened.json() as { data: { sessionId: string } }).data.sessionId;
    const workVersionId = "work-version.unversioned";
    const started = await post(`${baseUrl}/__local/story-studio/tianyi-agent/run/start`, { projectId: "agent-fixture", workVersionId, sessionId, task: "检查角色知识边界", currentPage: "/tianyi", operationId: "operation.agent.start" }, headers);
    assert.equal(started.status, 201);
    const startProjection = (await started.json() as { data: any }).data;
    assert.equal(startProjection.status, "awaiting_author");

    const approved = await post(`${baseUrl}/__local/story-studio/tianyi-agent/run/approve`, { projectId: "agent-fixture", workVersionId, sessionId, runId: startProjection.runId, stepId: startProjection.plan[0].stepId, operationId: "operation.agent.approve" }, headers);
    assert.equal(approved.status, 200);
    const contextProjection = (await approved.json() as { data: any }).data;
    assert.equal(contextProjection.contextManifest.sessionId, sessionId);
    const analyzed = await post(`${baseUrl}/__local/story-studio/tianyi-agent/run/stream`, { projectId: "agent-fixture", workVersionId, sessionId, runId: startProjection.runId, operationId: "operation.agent.analyze" }, { ...headers, accept: "application/x-ndjson" });
    assert.equal(analyzed.status, 200);
    const analyzedMessages = (await analyzed.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: any });
    const analyzedProjection = analyzedMessages.find((message) => message.type === "projection")?.data;
    assert.ok(analyzedProjection);
    assert.equal(analyzedProjection.candidates.length, 3);
    assert.equal(analyzedProjection.candidates.find((candidate: any) => candidate.kind === "unknown").targetOwnerKind, "candidate-only");

    const handedOff = await post(`${baseUrl}/__local/story-studio/tianyi-agent/candidate/handoff`, { projectId: "agent-fixture", workVersionId, sessionId, runId: startProjection.runId, candidateId: analyzedProjection.candidates[0].candidateId, operationId: "operation.agent.handoff" }, headers);
    assert.equal(handedOff.status, 200);
    const handedOffProjection = (await handedOff.json() as { data: any }).data;
    assert.equal(handedOffProjection.candidates[0].state, "handed-off");
    assert.equal(handedOffProjection.candidates[0].ownerReceipt.owner, "agent-recognition-proposal");

    await terminateChildProcess(server, { label: "Tianyi Agent transport server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    server = startServer(rootPath, stateFilePath, token, port);
    await waitForServer(baseUrl, server);
    const recovered = await fetch(`${baseUrl}/__local/story-studio/tianyi-agent/run/projection?projectId=agent-fixture&workVersionId=${encodeURIComponent(workVersionId)}&sessionId=${encodeURIComponent(sessionId)}&runId=${encodeURIComponent(startProjection.runId)}`, { headers });
    assert.equal(recovered.status, 200);
    const recoveredProjection = (await recovered.json() as { data: any }).data;
    assert.equal(recoveredProjection.runId, startProjection.runId);
    assert.equal(recoveredProjection.candidates[0].ownerReceipt.id, handedOffProjection.candidates[0].ownerReceipt.id);
  } finally {
    await terminateChildProcess(server, { label: "Tianyi Agent transport server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 }).catch(() => undefined);
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("Tianyi Agent transport streams Pi fake-provider events before its durable projection", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-agent-stream-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const token = "tianyi-agent-stream-token";
  const port = 4700 + Math.floor(Math.random() * 200);
  const baseUrl = `http://127.0.0.1:${port}`;
  createStoryStudioWorkspaceOperations({ rootPath, stateFilePath }).createProject({ title: "Agent 流夹具", folderSlug: "agent-stream" });
  const server = startServer(rootPath, stateFilePath, token, port, { TIANYAN_AGENT_FAKE_PROVIDER_STREAM: "1" });
  try {
    await waitForServer(baseUrl, server);
    const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: baseUrl };
    const opened = await post(`${baseUrl}/__local/story-studio/tianyi/session/open`, { projectId: "agent-stream", operationId: "operation.agent.stream.open" }, headers);
    const sessionId = (await opened.json() as { data: { sessionId: string } }).data.sessionId;
    const workVersionId = "work-version.unversioned";
    const started = await post(`${baseUrl}/__local/story-studio/tianyi-agent/run/start`, { projectId: "agent-stream", workVersionId, sessionId, task: "检查引用边界", currentPage: "/tianyi", operationId: "operation.agent.stream.start" }, headers);
    const startProjection = (await started.json() as { data: any }).data;
    const approved = await post(`${baseUrl}/__local/story-studio/tianyi-agent/run/approve`, { projectId: "agent-stream", workVersionId, sessionId, runId: startProjection.runId, stepId: startProjection.plan[0].stepId, operationId: "operation.agent.stream.approve" }, headers);
    assert.equal(approved.status, 200);

    const response = await post(`${baseUrl}/__local/story-studio/tianyi-agent/run/stream`, { projectId: "agent-stream", workVersionId, sessionId, runId: startProjection.runId, operationId: "operation.agent.stream.continue" }, { ...headers, accept: "application/x-ndjson" });
    assert.equal(response.status, 200);
    const messages = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; data?: any });
    const projectionIndex = messages.findIndex((message) => message.type === "projection");
    const textEvents = messages.filter((message) => message.type === "event" && message.data?.type === "text-delta");
    assert.ok(projectionIndex > 0, "The durable projection must follow streamed events.");
    assert.equal(textEvents.length, 3);
    assert.equal(messages.slice(0, projectionIndex).every((message) => message.type === "event"), true);
    assert.equal(messages[projectionIndex].data.model.runtime, "pi");
    assert.equal(messages[projectionIndex].data.model.providerId, "local-fake");
    assert.equal(messages[projectionIndex].data.observability.streamEventCount >= textEvents.length, true);
  } finally {
    await terminateChildProcess(server, { label: "Tianyi Agent stream server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 }).catch(() => undefined);
    await rm(rootPath, { recursive: true, force: true });
  }
});

function startServer(rootPath: string, stateFilePath: string, token: string, port: number, extraEnv: Record<string, string> = {}) {
  return spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      WORLD_OS_STORY_STUDIO_ROOT: rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: token,
      PORT: String(port),
      PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY",
      TIANYAN_CREDENTIAL_BACKEND: "LOCAL_FILE_DEVELOPMENT_ONLY",
      TIANYAN_PROVIDER_APP_DATA_ROOT: path.join(rootPath, "provider-app"),
      TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Tianyi Agent transport server exited early.");
    try { if ((await fetch(`${baseUrl}/__local/story-studio/bootstrap`)).ok) return; } catch { /* retry until the child is listening */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Tianyi Agent transport server did not start.");
}

async function post(url: string, body: unknown, headers: Record<string, string>) {
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}
