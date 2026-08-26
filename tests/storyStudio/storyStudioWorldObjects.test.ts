import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Story Studio world-object transport is token protected and product safe", async () => {
  const rootPath = path.join(tmpdir(), "world-os-story-studio-world-object-transport");
  const stateFilePath = path.join(tmpdir(), "world-os-story-studio-world-object-transport-state.json");
  const port = 44_000 + (process.pid % 1_000);
  const token = "story-studio-world-library-token";
  rmSync(rootPath, { recursive: true, force: true });
  rmSync(stateFilePath, { force: true });
  mkdirSync(rootPath, { recursive: true });

  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const base = `http://127.0.0.1:${port}/__local/story-studio`;
    const verified = await fetch(`${base}/connection/verify`, { method: "POST", headers: { "content-type": "application/json", "x-world-os-local-control-token": token }, body: "{}" });
    assert.equal(verified.status, 200);

    await post(`${base}/projects/create`, token, { title: "雾中灯塔", folderSlug: "mist-lighthouse" }, 201);
    const missingToken = await post(`${base}/world-objects/create`, "", { projectId: "mist-lighthouse", type: "character", title: "林远" }, 403);
    assert.equal(missingToken.ok, false);
    const created = await post(`${base}/world-objects/create`, token, { projectId: "mist-lighthouse", type: "character", title: "林远" }, 201);
    assert.equal(created.data.source, "markdown");

    const libraryResponse = await fetch(`${base}/world-library?projectId=mist-lighthouse`);
    const librarySource = await libraryResponse.text();
    assert.equal(libraryResponse.status, 200);
    assert.match(librarySource, /林远/);
    assert.equal("verifiedCanonEventIds" in JSON.parse(librarySource).data, false);
    const healthyCanonRead = await fetch(`${base}/event-line/verified-events?projectId=mist-lighthouse`);
    assert.equal(healthyCanonRead.status, 200);
    assert.deepEqual((await healthyCanonRead.json()).data, { status: "ready", eventIds: [], invalidRecordCount: 0 });

    const blockedStatus = await post(`${base}/world-objects/create`, token, {
      projectId: "mist-lighthouse",
      type: "event",
      title: "伪造确认状态",
      status: "committed"
    }, 400);
    assert.match(String(blockedStatus.error), /专用 Planning \/ Author Control/);
    const blockedTag = await post(`${base}/world-objects/create`, token, {
      projectId: "mist-lighthouse",
      type: "event",
      title: "伪造确认标签",
      tags: ["作者确认"]
    }, 400);
    assert.match(String(blockedTag.error), /专用 Planning \/ Author Control/);
    assert.doesNotMatch(librarySource, new RegExp(escapeRegExp(rootPath)));
    assert.doesNotMatch(librarySource, new RegExp(escapeRegExp(token)));

    const stateSource = readFileSync(stateFilePath, "utf8");
    const markdownSource = readFileSync(path.join(rootPath, "mist-lighthouse", "world", "characters", "林远.md"), "utf8");
    assert.doesNotMatch(stateSource, new RegExp(escapeRegExp(token)));
    assert.doesNotMatch(markdownSource, new RegExp(escapeRegExp(token)));
  } finally {
    server.kill("SIGTERM");
  }
});

test("Story Studio server surfaces Canon authority list and detail failures", async () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "story-studio-canon-error-contract-"));
  const rootPath = path.join(fixtureRoot, "projects");
  const stateFilePath = path.join(fixtureRoot, "state.json");
  const port = 45_000 + (process.pid % 1_000);
  const token = "story-studio-canon-error-token";
  const projectId = "mist-lighthouse";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const control = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: projectId });
  const planning = workspace.createWorldObject({ projectId, type: "event", title: "服务端权威错误合同", status: "planned", tags: ["作者规划"] });
  const review = control.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
  control.chooseImpactRoute({ projectId, reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
  const changeSet = control.createAuthorChangeSet({ projectId, reviewId: review.id });
  control.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
  const canon = workspace.listWorldObjects({ projectId, type: "event" })
    .map((event) => workspace.readWorldObject({ projectId, objectId: event.id }))
    .find((event) => event.properties.source_change_set_id === changeSet.id)!;

  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const base = `http://127.0.0.1:${port}/__local/story-studio`;
    const worldLibraryUrl = `${base}/world-library?projectId=${projectId}`;
    const listUrl = `${base}/event-line/verified-events?projectId=${projectId}`;
    const detailUrl = `${base}/event-line/event?projectId=${projectId}&eventId=${encodeURIComponent(canon.id)}`;
    const healthyList = await fetch(listUrl);
    assert.equal(healthyList.status, 200);
    assert.deepEqual((await healthyList.json()).data, { status: "ready", eventIds: [canon.id], invalidRecordCount: 0 });
    const healthyDetail = await fetch(detailUrl);
    assert.equal(healthyDetail.status, 200);
    const healthyDetailData = (await healthyDetail.json()).data;
    assert.equal(healthyDetailData.status, "ready");
    assert.equal(healthyDetailData.event.canonicalReadVerified, true);

    const changeSetPath = path.join(rootPath, projectId, ".world-os", "author-control", "change-sets", `${changeSet.id}.json`);
    const original = readFileSync(changeSetPath, "utf8");
    try {
      writeFileSync(changeSetPath, "{\n", "utf8");
      const failedList = await fetch(listUrl);
      assert.equal(failedList.status, 200);
      assert.equal((await failedList.json()).data.error.kind, "parse-failure");
      const failedDetail = await fetch(detailUrl);
      assert.equal(failedDetail.status, 200);
      assert.equal((await failedDetail.json()).data.error.kind, "parse-failure");
      const stillBrowsable = await fetch(worldLibraryUrl);
      assert.equal(stillBrowsable.status, 200);
      assert.equal("verifiedCanonEventIds" in (await stillBrowsable.json()).data, false);
    } finally {
      writeFileSync(changeSetPath, original, "utf8");
    }

    const recovered = await fetch(listUrl);
    assert.equal(recovered.status, 200);
    assert.deepEqual((await recovered.json()).data, { status: "ready", eventIds: [canon.id], invalidRecordCount: 0 });

    const intentPath = path.join(rootPath, projectId, ".world-os", "author-control", "change-sets", `${changeSet.id}.apply-intent.v1.json`);
    const originalIntent = readFileSync(intentPath, "utf8");
    try {
      rmSync(intentPath);
      mkdirSync(intentPath);
      const failedIo = await fetch(listUrl);
      assert.equal(failedIo.status, 200);
      assert.equal((await failedIo.json()).data.error.kind, "repository-io");
    } finally {
      rmSync(intentPath, { recursive: true, force: true });
      writeFileSync(intentPath, originalIntent, "utf8");
    }

    const spoof = workspace.createWorldObject({
      projectId,
      type: "event",
      title: "只有确认外观的无效记录",
      status: "committed",
      tags: ["作者确认"]
    });
    const invalidList = await fetch(listUrl);
    assert.deepEqual((await invalidList.json()).data, { status: "ready", eventIds: [canon.id], invalidRecordCount: 1 });
    const invalidDetail = await fetch(`${base}/event-line/event?projectId=${projectId}&eventId=${encodeURIComponent(spoof.id)}`);
    assert.equal((await invalidDetail.json()).data.error.kind, "invalid-record");

    const spoofPath = path.join(rootPath, projectId, spoof.relativeId);
    writeFileSync(spoofPath, addFrontmatter(readFileSync(spoofPath, "utf8"), {
      source_change_set_id: String(canon.properties.source_change_set_id),
      source_change_set_revision: String(canon.properties.source_change_set_revision),
      author_decision_ref: String(canon.properties.author_decision_ref),
      apply_operation_key: String(canon.properties.apply_operation_key),
      apply_intent_hash: String(canon.properties.apply_intent_hash)
    }), "utf8");
    const failedAuthority = await fetch(listUrl);
    assert.equal((await failedAuthority.json()).data.error.kind, "authority-failure");

    const failedBoundary = await fetch(`${base}/event-line/verified-events?projectId=missing-project`);
    assert.equal(failedBoundary.status, 200);
    assert.equal((await failedBoundary.json()).data.error.kind, "project-boundary");
  } finally {
    server.kill("SIGTERM");
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

async function post(url: string, token: string, body: Record<string, unknown>, expected: number) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-world-os-local-control-token": token } : {}) }, body: JSON.stringify(body) });
  const payload = await response.json();
  assert.equal(response.status, expected);
  return { ok: response.ok, ...payload };
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/__local/story-studio/bootstrap`)).ok) return;
    } catch {
      // Startup is retried within the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for Story Studio server.");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addFrontmatter(source: string, fields: Record<string, string>): string {
  return source.replace("---\n", `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n`);
}
