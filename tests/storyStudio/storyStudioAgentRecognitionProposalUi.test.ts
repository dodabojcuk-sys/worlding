import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createAgentRecognitionProposal } from "../../src/storyIntelligence/agentRecognitionProposalRepository.ts";

test("official Agent proposal facade exposes only durable character review and converges duplicate confirms", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-agent-ui-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const port = 46_000 + (process.pid % 1_000);
  const token = "agent-proposal-ui-token";
  const projectId = "mist-lighthouse";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: projectId });
  const created = await createAgentRecognitionProposal({ workspacePath: path.join(rootPath, projectId), proposal: {
    projectId, storyId: "story.mist-lighthouse", tianyiSessionId: "session.000001", sourceEventId: "event.000001", sourceReceiptId: "receipt.000001", sourceWorkspace: "tianyi",
    objectKind: "character", suggestedName: "守夜人", suggestedFields: { status: "active", role: "守夜人" }, evidence: [{ sourceRef: "session.000001:event.000001", excerpt: "守夜人知道印章被调换。" }], uncertainties: ["他是同谋还是被胁迫"], duplicateMatches: [], now: "2026-08-15T00:00:00.000Z"
  } });
  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}/__local/story-studio`;
  const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: `http://127.0.0.1:${port}` };
  try {
    await waitForServer(base);
    const listed = await fetch(`${base}/agent-recognition/proposals?projectId=${projectId}`, { headers });
    assert.equal(listed.status, 200);
    assert.equal(((await listed.json()) as { data: Array<{ proposalId: string }> }).data[0]?.proposalId, created.proposal.proposalId);
    const confirmBody = { projectId, proposalId: created.proposal.proposalId, expectedProposalRevision: 1, operationId: `agent-proposal-confirm-${created.proposal.proposalId}-r1`, character: { title: "守夜人", status: "active", tags: ["天意识别确认"], aliases: [], body: "# 守夜人\n\n守夜人知道印章被调换。\n" } };
    const first = await post(`${base}/agent-recognition/proposals/confirm`, confirmBody, headers);
    const retry = await post(`${base}/agent-recognition/proposals/confirm`, confirmBody, headers);
    assert.equal(first.status, 200);
    assert.equal(retry.status, 200);
    const result = await first.json() as { data: { proposal: { status: string; targetObjectRef: { objectId: string } } } };
    assert.equal(result.data.proposal.status, "confirmed");
    assert.equal(workspace.listWorldObjects({ projectId, type: "character" }).filter((item) => item.id === result.data.proposal.targetObjectRef.objectId).length, 1);
    const existing = workspace.createWorldObject({ projectId, type: "character", title: "林峤", status: "active", tags: ["主角"], aliases: [], body: "# 林峤\n\n原有资料。\n" });
    const mergeProposal = await createAgentRecognitionProposal({ workspacePath: path.join(rootPath, projectId), proposal: {
      projectId, storyId: "story.mist-lighthouse", tianyiSessionId: "session.000001", sourceEventId: "event.000002", sourceReceiptId: "receipt.000002", sourceWorkspace: "tianyi",
      objectKind: "character", suggestedName: "港口守夜人", suggestedFields: { status: "active", role: "守夜人" }, evidence: [{ sourceRef: "archive.000002", excerpt: "她曾在港口见过守夜人。" }], uncertainties: [], duplicateMatches: [{ objectId: existing.id, objectKind: "character", displayName: existing.title, reason: "作者需要决定是否为同一人物" }], now: "2026-08-15T00:01:00.000Z"
    } });
    const merged = await post(`${base}/agent-recognition/proposals/merge`, { projectId, proposalId: mergeProposal.proposal.proposalId, expectedProposalRevision: 1, operationId: `agent-proposal-merge-${mergeProposal.proposal.proposalId}-r1`, targetObjectId: existing.id, expectedTargetRevision: existing.revisionToken, character: { title: "港口守夜人", status: "active", tags: ["港口"], aliases: [], body: "# 港口守夜人\n\n提案补充。\n" } }, headers);
    assert.equal(merged.status, 200);
    const mergedData = await merged.json() as { data: { proposal: { status: string; targetObjectRef: { objectId: string } } } };
    assert.equal(mergedData.data.proposal.status, "merged");
    assert.equal(mergedData.data.proposal.targetObjectRef.objectId, existing.id);
    const eventAttempt = await post(`${base}/agent-recognition/proposals/edit`, { projectId, proposalId: created.proposal.proposalId, expectedRevision: 1, suggestedName: "事件", suggestedFields: { kind: "event" }, uncertainties: [], duplicateMatches: [] }, headers);
    assert.equal(eventAttempt.status, 400);
  } finally {
    await terminateChildProcess(server, { label: "Agent proposal UI test server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("Agent recognition review remains outside the Tianyi page while the Dock exposes only contextual Agent scope", async () => {
  const { readFile } = await import("node:fs/promises");
  const workspace = await readFile("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const sidebar = await readFile("apps/story-studio/src/components/tianyi/TianyiConversationRail.tsx", "utf8");
  const dock = await readFile("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");
  const review = await readFile("apps/story-studio/src/components/tianyi/TianyiAgentProposalReview.tsx", "utf8");
  assert.doesNotMatch(sidebar, /待确认|已有 Agent|proposal\.objectKind/u);
  assert.doesNotMatch(workspace, /TianyiAgentProposalReview|>Agent</u);
  assert.match(dock, /tianyi-dock-work-panel/u);
  assert.match(dock, /当前范围/u);
  assert.doesNotMatch(dock, /applyAuthorChangeSet|CanonWriter|fetch\(/u);
  assert.match(review, /确认创建人物/u);
  assert.match(review, /合并到已有 Agent/u);
  assert.match(review, /标记识别错误/u);
  assert.match(review, /不会创建人物，也不会写入事件线或 Canon/u);
  assert.doesNotMatch(review, /repository|localStorage|indexedDB|createWorldObject/iu);
});

async function post(url: string, body: unknown, headers: Record<string, string>) { return fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); }
async function waitForServer(base: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) { try { if ((await fetch(`${base}/bootstrap`)).ok) return; } catch { /* retry */ } await new Promise((resolve) => setTimeout(resolve, 40)); }
  throw new Error("Agent proposal UI test server did not start.");
}
