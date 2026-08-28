import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Tianyi Event candidate reaches the existing review and sole Event writer without duplicates", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-event-m0-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "tianyi-event-m0";
  const token = "tianyi-event-m0-token";
  const port = 48_000 + (process.pid % 1_000);
  createStoryStudioWorkspaceOperations({ rootPath, stateFilePath }).createProject({ title: "天意事件 M0", folderSlug: projectId });
  const env = { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token };
  let server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: base };
  try {
    await waitForServer(base);
    const opened = await post(`${base}/__local/story-studio/tianyi/session/open`, { projectId, operationId: "event-open", retentionMode: "normal" }, headers);
    const sessionId = (await opened.json() as { data: { sessionId: string } }).data.sessionId;
    const captured = await post(`${base}/__local/story-studio/tianyi/creative/capture`, { projectId, sessionId, operationId: "event-capture", submissionId: "event-submission", text: "钟楼熄灯后，守夜人把钥匙交给阿岚。", collaborate: true }, headers);
    const source = (await captured.json() as { data: { source: unknown } }).data.source;
    const extracted = await post(`${base}/__local/story-studio/tianyi/creative/extract`, { projectId, sessionId, operationId: "event-extract", source, fixture: { reply: "整理事件。", summary: "钥匙转交。", themes: [], openQuestions: ["钥匙用途"], candidates: [{ kind: "event", title: "钟楼钥匙转交", summary: "守夜人把钥匙交给阿岚。", uncertainties: ["钥匙用途尚未确认"] }] } }, headers);
    assert.equal(extracted.status, 200);
    const candidate = (await extracted.json() as { data: { projection: { candidates: Array<{ candidateId: string; kind: string }> } } }).data.projection.candidates.find((item) => item.kind === "event");
    assert.ok(candidate);
    const handoff = await post(`${base}/__local/story-studio/tianyi/creative/candidate/handoff`, { projectId, sessionId, candidateId: candidate.candidateId, operationId: "event-handoff" }, headers);
    assert.equal(handoff.status, 200);
    const handoffData = (await handoff.json() as { data: { ownerReceipt: { owner: string }; eventReview: { proposal: { origin: { sessionId: string }; unknowns: string[] }; reviewContext: { project: { displayName: string }; source: { versionLabel: string; freshness: string }; writeTarget: { displayName: string }; safety: string } } } }).data;
    assert.equal(handoffData.ownerReceipt.owner, "candidate-review");
    assert.equal(handoffData.eventReview.proposal.origin.sessionId, sessionId);
    assert.deepEqual(handoffData.eventReview.proposal.unknowns, ["钥匙用途尚未确认"]);
    assert.equal(handoffData.eventReview.reviewContext.project.displayName, "天意事件 M0");
    assert.match(handoffData.eventReview.reviewContext.source.versionLabel, /^当前来源版本/u);
    assert.equal(handoffData.eventReview.reviewContext.source.freshness, "current");
    assert.equal(handoffData.eventReview.reviewContext.writeTarget.displayName, "当前作品 · 事件线");
    assert.equal(handoffData.eventReview.reviewContext.safety, "候选，不会自动写入故事事实");
    const impact = await post(`${base}/__local/story-studio/tianyi/creative/candidate/event-review/begin-impact`, { projectId, sessionId, candidateId: candidate.candidateId }, headers);
    assert.equal(impact.status, 200);
    const impactData = (await impact.json() as { data: { impact: { options: Array<{ id: string }> } } }).data;
    const confirmed = await post(`${base}/__local/story-studio/tianyi/creative/candidate/event-review/confirm`, { projectId, sessionId, candidateId: candidate.candidateId, optionId: impactData.impact.options[0].id }, headers);
    assert.equal(confirmed.status, 200);
    const finalData = (await confirmed.json() as { data: { confirmedEvents: Array<{ id: string }> } }).data;
    assert.equal(finalData.confirmedEvents.length, 1);
    const retry = await post(`${base}/__local/story-studio/tianyi/creative/candidate/event-review/confirm`, { projectId, sessionId, candidateId: candidate.candidateId, optionId: impactData.impact.options[0].id }, headers);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { data: { confirmedEvents: unknown[] } }).data.confirmedEvents.length, 1);
    const newerSource = await post(`${base}/__local/story-studio/tianyi/creative/capture`, { projectId, sessionId, operationId: "event-newer-source", submissionId: "event-newer-submission", text: "钟楼记录被重新发现，需要重新整理。", collaborate: false }, headers);
    assert.equal(newerSource.status, 200);
    const staleReview = await post(`${base}/__local/story-studio/tianyi/creative/candidate/event-review`, { projectId, sessionId, candidateId: candidate.candidateId }, headers);
    assert.equal(staleReview.status, 400, "A stale source must not re-enter the Event review or confirmation path.");
    assert.match(JSON.stringify(await staleReview.json()), /来源版本已过期/u);
    const detail = await fetch(`${base}/__local/story-studio/event-line/event?projectId=${projectId}&eventId=${finalData.confirmedEvents[0].id}`, { headers });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as { data: { status: string } }).data.status, "ready");
  } finally {
    await terminateChildProcess(server, { label: "Tianyi Event M0 server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await rm(rootPath, { recursive: true, force: true });
  }
});

async function post(url: string, body: unknown, headers: Record<string, string>) { return fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); }
async function waitForServer(base: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) { try { if ((await fetch(`${base}/__local/story-studio/bootstrap`)).ok) return; } catch { /* bounded retry */ } await new Promise((resolve) => setTimeout(resolve, 40)); }
  throw new Error("Tianyi Event M0 test server did not start.");
}
