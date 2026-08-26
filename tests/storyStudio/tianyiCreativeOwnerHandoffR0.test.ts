import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Creative supported candidates hand off to the existing Agent proposal owner and recover its receipt", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-creative-owner-handoff-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "creative-owner-fixture";
  const token = "creative-owner-handoff-token";
  const port = 47_000 + (process.pid % 1_000);
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "创意 Owner 夹具", folderSlug: projectId });
  const env = { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token };
  let server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: base };
  const fixture = {
    reply: "先把人物提案交给既有审核，不把猜测写成事实。",
    summary: "守夜人可能掌握一枚未登记的钥匙。",
    themes: ["来源锚定的身份线索"],
    openQuestions: ["钥匙是否属于守夜人？"],
    candidates: [
      { kind: "character", title: "守夜人", summary: "可能掌握未登记的钥匙。", uncertainties: ["身份尚未确认"] },
      { kind: "inspiration", title: "潮湿的钥匙声", summary: "作为氛围意象保留。", uncertainties: ["没有唯一资料 Owner"] }
    ]
  };
  try {
    await waitForServer(base);
    const opened = await post(`${base}/__local/story-studio/tianyi/session/open`, { projectId, operationId: "creative-owner-open", retentionMode: "normal" }, headers);
    assert.equal(opened.status, 200);
    const sessionId = (await opened.json() as { data: { sessionId: string } }).data.sessionId;
    const captured = await post(`${base}/__local/story-studio/tianyi/creative/capture`, { projectId, sessionId, operationId: "creative-owner-capture", submissionId: "creative-owner-submission", text: "守夜人把一枚钥匙藏在潮湿的井边。", collaborate: true }, headers);
    assert.equal(captured.status, 200);
    const source = (await captured.json() as { data: { source: { sessionId: string; eventId: string; contentHash: string } } }).data.source;
    const extracted = await post(`${base}/__local/story-studio/tianyi/creative/extract`, { projectId, sessionId, operationId: "creative-owner-extract", source, fixture }, headers);
    assert.equal(extracted.status, 200);
    const projection = (await extracted.json() as { data: { projection: { candidates: Array<{ candidateId: string; kind: string }> } } }).data.projection;
    const character = projection.candidates.find((candidate) => candidate.kind === "character");
    assert.ok(character);
    const handedOff = await post(`${base}/__local/story-studio/tianyi/creative/candidate/handoff`, { projectId, sessionId, candidateId: character.candidateId, operationId: "creative-owner-handoff", }, headers);
    assert.equal(handedOff.status, 200);
    const handoffData = (await handedOff.json() as { data: { ownerReceipt: { owner: string; id: string; revision: number }; projection: { candidates: Array<{ candidateId: string; state: string; ownerReceipt: { id: string } | null }> } } }).data;
    assert.equal(handoffData.ownerReceipt.owner, "agent-recognition-proposal");
    assert.equal(handoffData.ownerReceipt.revision, 1);
    assert.equal(handoffData.projection.candidates.find((candidate) => candidate.candidateId === character.candidateId)?.state, "handed-off");
    const retry = await post(`${base}/__local/story-studio/tianyi/creative/candidate/handoff`, { projectId, sessionId, candidateId: character.candidateId, operationId: "creative-owner-handoff", }, headers);
    assert.equal(retry.status, 200);
    const proposals = await fetch(`${base}/__local/story-studio/agent-recognition/proposals?projectId=${projectId}`, { headers });
    assert.equal(proposals.status, 200);
    const proposalData = (await proposals.json() as { data: Array<{ proposalId: string; tianyiSessionId: string; sourceEventId: string; status: string }> }).data;
    assert.equal(proposalData.length, 1);
    assert.equal(proposalData[0]?.proposalId, handoffData.ownerReceipt.id);
    assert.equal(proposalData[0]?.tianyiSessionId, sessionId);
    assert.equal(proposalData[0]?.sourceEventId, source.eventId);
    assert.equal(proposalData[0]?.status, "pending");

    await terminateChildProcess(server, { label: "Creative owner handoff test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env, stdio: "ignore" });
    await waitForServer(base);
    const recovered = await post(`${base}/__local/story-studio/tianyi/creative/projection`, { projectId, sessionId }, headers);
    assert.equal(recovered.status, 200);
    const recoveredProjection = (await recovered.json() as { data: { candidates: Array<{ candidateId: string; state: string; ownerReceipt: { owner: string; id: string; revision: number } | null }> } }).data;
    const recoveredCandidate = recoveredProjection.candidates.find((candidate) => candidate.candidateId === character.candidateId);
    assert.equal(recoveredCandidate?.state, "handed-off");
    assert.deepEqual(recoveredCandidate?.ownerReceipt, handoffData.ownerReceipt);
  } finally {
    await terminateChildProcess(server, { label: "Creative owner handoff test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await rm(rootPath, { recursive: true, force: true });
  }
});

async function post(url: string, body: unknown, headers: Record<string, string>) {
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function waitForServer(base: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/__local/story-studio/bootstrap`)).ok) return;
    } catch { /* retry until the bounded deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Creative owner handoff test server did not start.");
}
