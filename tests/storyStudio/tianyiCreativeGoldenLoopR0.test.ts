import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Tianyi Creative Golden Loop preserves source, reviews candidates, and recovers owner receipts", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-creative-golden-loop-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "tianyi-creative-golden-fixture";
  const token = "tianyi-creative-golden-token";
  const port = 48_000 + (process.pid % 1_000);
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "天意创意 Golden Loop 夹具", folderSlug: projectId });
  const existingCharacter = workspace.createWorldObject({
    projectId,
    type: "character",
    title: "林峤",
    status: "active",
    tags: ["fixture"],
    aliases: [],
    body: "# 林峤\n\n既有角色资料，仅用于隔离合并验收。\n"
  });
  const env = {
    ...process.env,
    PORT: String(port),
    WORLD_OS_STORY_STUDIO_ROOT: rootPath,
    WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
    WORLD_OS_LOCAL_CONTROL_TOKEN: token
  };
  let server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env, stdio: "ignore" });
  const origin = `http://127.0.0.1:${port}`;
  const base = `${origin}/__local/story-studio`;
  const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin };
  const sourceText = "林峤在暴雨前把一枚旧钥匙交给守夜人。\n地点是北岸码头，规则是潮汐退去前不能点灯。🌧️\n他们也许互相信任，但这可能只是一个剧情想法，仍有一个关系问题待确认。";
  const fixture = {
    reply: "我保留了这段原话；以下内容都只是带来源的候选，尚未写入 Canon、Event、Relation 或长期 Memory。",
    summary: "林峤把旧钥匙交给守夜人，北岸码头受潮汐点灯规则约束；关系与事件仍待作者确认。",
    themes: ["钥匙与信任", "潮汐规则"],
    openQuestions: ["林峤为什么要交出钥匙？", "他们的关系是否真实？"],
    candidates: [
      { kind: "character", title: "守夜人", summary: "可能接到林峤交出的旧钥匙。", uncertainties: ["身份与动机尚未确认"] },
      { kind: "character", title: "林峤", summary: "可能是旧钥匙的持有人。", uncertainties: ["是否为既有角色仍需合并审查"] },
      { kind: "item", title: "旧钥匙", summary: "被交接的物品。", uncertainties: ["用途未知"] },
      { kind: "location", title: "北岸码头", summary: "交接发生的地点。", uncertainties: ["是否需要建立地点对象"] },
      { kind: "rule", title: "潮汐退去前不能点灯", summary: "一个尚待确认的设定规则。", uncertainties: ["规则是否属于正式世界设定"] },
      { kind: "event", title: "暴雨前的钥匙交接", summary: "可能发生的事件。", uncertainties: ["事件尚未被作者确认"] },
      { kind: "relation", title: "林峤与守夜人的信任", summary: "可能存在的关系。", uncertainties: ["关系方向和强度未知"] },
      { kind: "plot-idea", title: "钥匙交接只是试探", summary: "一个剧情发展想法。", uncertainties: ["没有唯一语义 Owner"] },
      { kind: "inspiration", title: "雨声里的钥匙碰撞", summary: "保留为氛围灵感。", uncertainties: ["没有唯一资料 Owner"] }
    ]
  };

  try {
    await waitForServer(origin);

    const identity = await post(`${base}/tianyi/identity`, { projectId }, headers);
    assert.equal(identity.status, 200);
    const identityData = await readJson<{ data: { modelCalls: number; runtime: { mode: string } } }>(identity);
    assert.equal(identityData.data.modelCalls, 0);
    assert.equal(identityData.data.runtime.mode, "deterministic");

    const opened = await post(`${base}/tianyi/session/open`, { projectId, operationId: "creative-golden-open", retentionMode: "normal" }, headers);
    assert.equal(opened.status, 200);
    const openedData = await readJson<{ data: { sessionId: string } }>(opened);
    const sessionId = openedData.data.sessionId;

    const captured = await post(`${base}/tianyi/creative/capture`, {
      projectId,
      sessionId,
      operationId: "creative-golden-capture",
      submissionId: "creative-golden-submission",
      text: sourceText,
      collaborate: true
    }, headers);
    assert.equal(captured.status, 200);
    const capturedData = await readJson<{ data: { source: { sessionId: string; eventId: string; contentHash: string } } }>(captured);
    assert.equal(capturedData.data.source.sessionId, sessionId);
    assert.match(capturedData.data.source.contentHash, /^[a-f0-9]{64}$/u);

    const extracted = await post(`${base}/tianyi/creative/extract`, { projectId, sessionId, operationId: "creative-golden-extract", source: capturedData.data.source, fixture }, headers);
    assert.equal(extracted.status, 200);
    const extractedData = await readJson<{ data: { projection: CreativeProjection } }>(extracted);
    const initial = extractedData.data.projection;
    assert.equal(initial.lifecycle, "review-ready");
    assert.equal(initial.originals[0]?.text, sourceText);
    assert.equal(initial.responses[0]?.text, fixture.reply);
    assert.equal(initial.summaryState, "current");
    assert.equal(initial.summarySourceRefs[0]?.eventId, capturedData.data.source.eventId);
    assert.equal(initial.candidates.length, fixture.candidates.length);
    assert.equal(initial.candidates.find((candidate) => candidate.kind === "relation")?.targetOwnerKind, "relation-owner");
    assert.equal(initial.candidates.find((candidate) => candidate.kind === "inspiration")?.targetOwnerKind, "candidate-only");

    const byKind = (kind: string) => {
      const candidate = initial.candidates.find((item) => item.kind === kind);
      assert.ok(candidate, `missing ${kind} candidate`);
      return candidate;
    };
    const accepted = byKind("character");
    const mergeCandidate = initial.candidates.find((candidate) => candidate.title === "林峤");
    assert.ok(mergeCandidate);
    const item = byKind("item");
    const location = byKind("location");
    const rule = byKind("rule");
    const event = byKind("event");
    const relation = byKind("relation");
    const plotIdea = byKind("plot-idea");
    const inspiration = byKind("inspiration");

    const acceptedHandoff = await handoff(base, projectId, sessionId, accepted.candidateId, "creative-golden-accept", headers);
    assert.equal(acceptedHandoff.ownerReceipt.owner, "agent-recognition-proposal");
    assert.equal(acceptedHandoff.projection.candidates.find((candidate) => candidate.candidateId === accepted.candidateId)?.state, "handed-off");

    const edited = await post(`${base}/tianyi/creative/candidate/edit`, {
      projectId,
      sessionId,
      candidateId: item.candidateId,
      operationId: "creative-golden-edit-item",
      expectedRevision: item.revision,
      title: "旧钥匙（作者修订）",
      summary: "作者补充：钥匙可能打开北岸码头的旧闸门。",
      uncertainties: ["钥匙对应的闸门仍待确认"]
    }, headers);
    assert.equal(edited.status, 200);
    const editedData = await readJson<{ data: { projection: CreativeProjection } }>(edited);
    assert.equal(editedData.data.projection.candidates.find((candidate) => candidate.candidateId === item.candidateId)?.revision, item.revision + 1);
    const editedHandoff = await handoff(base, projectId, sessionId, item.candidateId, "creative-golden-edit-accept", headers);
    assert.equal(editedHandoff.ownerReceipt.owner, "agent-recognition-proposal");

    const mergeHandoff = await handoff(base, projectId, sessionId, mergeCandidate.candidateId, "creative-golden-merge-candidate", headers);
    assert.equal(mergeHandoff.ownerReceipt.owner, "agent-recognition-proposal");
    const proposalList = await fetch(`${base}/agent-recognition/proposals?projectId=${projectId}`, { headers });
    assert.equal(proposalList.status, 200);
    const proposals = (await readJson<{ data: Array<{ proposalId: string; suggestedName: string; revision: number; status: string }> }>(proposalList)).data;
    const mergeProposal = proposals.find((proposal) => proposal.suggestedName === "林峤");
    assert.ok(mergeProposal);
    const merged = await post(`${base}/agent-recognition/proposals/merge`, {
      projectId,
      proposalId: mergeProposal.proposalId,
      expectedProposalRevision: mergeProposal.revision,
      operationId: "creative-golden-merge-owner",
      targetObjectId: existingCharacter.id,
      expectedTargetRevision: existingCharacter.revisionToken,
      character: {
        title: existingCharacter.title,
        status: existingCharacter.status,
        tags: [...existingCharacter.tags, "创意合并"],
        aliases: [...existingCharacter.aliases, "林峤"],
        body: `${existingCharacter.body}\n\n作者审查补充：旧钥匙与守夜人。\n`
      }
    }, headers);
    assert.equal(merged.status, 200);
    const mergedData = await readJson<{ data: { proposal: { status: string; applicationReceipt: { mode: string; targetObjectRef: { objectId: string } } | null } } }>(merged);
    assert.equal(mergedData.data.proposal.status, "merged");
    assert.equal(mergedData.data.proposal.applicationReceipt?.mode, "merge");
    assert.equal(mergedData.data.proposal.applicationReceipt?.targetObjectRef.objectId, existingCharacter.id);

    const locationHandoff = await handoff(base, projectId, sessionId, location.candidateId, "creative-golden-location-accept", headers);
    assert.equal(locationHandoff.ownerReceipt.owner, "agent-recognition-proposal");

    for (const [candidate, decision, operationId] of [
      [rule, "deferred", "creative-golden-defer-rule"],
      [relation, "deferred", "creative-golden-defer-relation"],
      [inspiration, "deferred", "creative-golden-defer-inspiration"],
      [event, "rejected", "creative-golden-reject-event"],
      [plotIdea, "rejected", "creative-golden-reject-plot"]
    ] as const) {
      const decided = await post(`${base}/tianyi/creative/candidate/decision`, { projectId, sessionId, candidateId: candidate.candidateId, operationId, decision }, headers);
      assert.equal(decided.status, 200);
    }
    const reviewReady = await post(`${base}/tianyi/creative/projection`, { projectId, sessionId }, headers);
    const reviewData = await readJson<{ data: CreativeProjection }>(reviewReady);
    const relationReview = reviewData.data.candidates.find((candidate) => candidate.candidateId === relation.candidateId);
    const inspirationReview = reviewData.data.candidates.find((candidate) => candidate.candidateId === inspiration.candidateId);
    assert.equal(relationReview?.state, "deferred");
    assert.equal(relationReview?.targetOwnerKind, "relation-owner");
    assert.equal(relationReview?.ownerReceipt, null);
    assert.equal(inspirationReview?.targetOwnerKind, "candidate-only");
    assert.equal(inspirationReview?.ownerReceipt, null);
    assert.equal(reviewData.data.candidates.filter((candidate) => candidate.state === "pending").length, 0);

    const eventsBeforeRestart = await post(`${base}/tianyi/session/events`, { projectId, sessionId, startSequence: 1, limit: 200 }, headers);
    assert.equal(eventsBeforeRestart.status, 200);
    const archiveBeforeRestart = await readJson<{ data: { events: Array<{ actor: string; visibleContent: string | null }> } }>(eventsBeforeRestart);
    assert.ok(archiveBeforeRestart.data.events.some((event) => event.actor === "author" && event.visibleContent === sourceText));
    assert.ok(archiveBeforeRestart.data.events.some((event) => event.actor === "tianyi" && event.visibleContent === fixture.reply));

    const paused = await post(`${base}/tianyi/creative/pause`, { projectId, sessionId, operationId: "creative-golden-pause" }, headers);
    assert.equal(paused.status, 200);
    assert.equal((await readJson<{ data: { projection: CreativeProjection } }>(paused)).data.projection.lifecycle, "paused");

    await terminateChildProcess(server, { label: "Tianyi Creative Golden Loop server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env, stdio: "ignore" });
    await waitForServer(origin);

    const recovered = await post(`${base}/tianyi/creative/recover`, { projectId, sessionId, operationId: "creative-golden-recover" }, headers);
    assert.equal(recovered.status, 200);
    const recoveredProjection = (await readJson<{ data: { projection: CreativeProjection } }>(recovered)).data.projection;
    assert.equal(recoveredProjection.lifecycle, "review-ready");
    assert.equal(recoveredProjection.originals[0]?.text, sourceText);
    assert.equal(recoveredProjection.candidates.find((candidate) => candidate.candidateId === accepted.candidateId)?.ownerReceipt?.owner, "agent-recognition-proposal");
    assert.equal(recoveredProjection.candidates.find((candidate) => candidate.candidateId === relation.candidateId)?.state, "deferred");

    const metadata = await post(`${base}/tianyi/session/metadata`, { projectId, sessionId }, headers);
    assert.equal(metadata.status, 200);
    const metadataData = await readJson<{ data: { id: string } }>(metadata);
    assert.equal(metadataData.data.id, sessionId);
    const resumedProposals = await fetch(`${base}/agent-recognition/proposals?projectId=${projectId}`, { headers });
    assert.equal((await readJson<{ data: unknown[] }>(resumedProposals)).data.length, 4);

    const completed = await post(`${base}/tianyi/creative/complete`, { projectId, sessionId, operationId: "creative-golden-complete" }, headers);
    assert.equal(completed.status, 200);
    const completedData = await readJson<{ data: { close: { closed: boolean }; projection: CreativeProjection } }>(completed);
    assert.equal(completedData.data.close.closed, true);
    assert.equal(completedData.data.projection.lifecycle, "completed");
    assert.equal(completedData.data.projection.archived, false);
    const closeRetry = await post(`${base}/tianyi/creative/complete`, { projectId, sessionId, operationId: "creative-golden-complete" }, headers);
    assert.equal(closeRetry.status, 200);
    assert.equal((await readJson<{ data: { alreadyCompleted: boolean } }>(closeRetry)).data.alreadyCompleted, true);
    const archived = await post(`${base}/tianyi/creative/projection`, { projectId, sessionId }, headers);
    const archivedData = await readJson<{ data: CreativeProjection }>(archived);
    assert.equal(archivedData.data.lifecycle, "completed");
    assert.equal(archivedData.data.archived, true);
    assert.equal(archivedData.data.summary, fixture.summary);
  } finally {
    await terminateChildProcess(server, { label: "Tianyi Creative Golden Loop server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    await rm(rootPath, { recursive: true, force: true });
  }
});

type CreativeProjection = {
  lifecycle: string;
  archived: boolean;
  originals: Array<{ text: string; eventId: string; contentHash: string }>;
  responses: Array<{ text: string }>;
  summary: string | null;
  summaryState: string;
  summarySourceRefs: Array<{ eventId: string; contentHash: string }>;
  candidates: Array<{
    candidateId: string;
    kind: string;
    title: string;
    revision: number;
    state: string;
    targetOwnerKind: string;
    ownerReceipt: { owner: string; id: string; revision: number | null } | null;
  }>;
};

async function handoff(base: string, projectId: string, sessionId: string, candidateId: string, operationId: string, headers: Record<string, string>) {
  const response = await post(`${base}/tianyi/creative/candidate/handoff`, { projectId, sessionId, candidateId, operationId }, headers);
  assert.equal(response.status, 200);
  return readJson<{ data: { ownerReceipt: { owner: string; id: string; revision: number | null }; projection: CreativeProjection } }>(response).then((result) => result.data);
}

async function post(url: string, body: unknown, headers: Record<string, string>) {
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function waitForServer(origin: string) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/__local/story-studio/bootstrap`)).ok) return;
    } catch { /* retry until the bounded deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Tianyi Creative Golden Loop server did not start.");
}
