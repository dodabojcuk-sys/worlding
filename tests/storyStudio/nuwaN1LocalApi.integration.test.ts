import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

const TOKEN = "nuwa-n1-local-test-token";

test("Nuwa N1 local API is explicit about provider availability and keeps a fake tool loop scoped, recoverable, and candidate-only", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([once(child, "exit"), delay(2_000)]);
    }
    rmSync(value.root, { recursive: true, force: true });
  });

  const unavailable = await start(value, false);
  child = unavailable.child;
  const bootstrap = await getJson(unavailable.baseUrl, `/__local/story-studio/nuwa-n1/bootstrap?projectId=${value.project.id}`);
  assert.equal(bootstrap.status, 200);
  assert.equal((bootstrap.payload.data as { availability: { kind: string } }).availability.kind, "unavailable");
  const unavailableSetup = await postJson(unavailable.baseUrl, "/__local/story-studio/nuwa-n1/setup", value.request("setup-unavailable"));
  assert.equal(unavailableSetup.status, 200);
  assert.equal((unavailableSetup.payload.data as { setup: { contextPreview: Array<{ knowledgeSubjects: string[] }> } }).setup.contextPreview[0]?.knowledgeSubjects.length, 1);
  const unavailableCreate = await postJson(unavailable.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("create-unavailable"));
  assert.equal(unavailableCreate.status, 503);
  child.kill("SIGTERM");
  await once(child, "exit");

  const enabled = await start(value, true);
  child = enabled.child;
  const setup = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/setup", value.request("setup-fake"));
  assert.equal(setup.status, 200);
  const preview = (setup.payload.data as { availability: { kind: string; label: string; providerCalls: number }; setup: { contextPreview: Array<{ actorId: string; knowledgeSubjects: string[] }> } });
  assert.equal(preview.availability.kind, "local-fake");
  assert.match(preview.availability.label, /本地工程演练/u);
  assert.equal(preview.availability.providerCalls, 0);
  assert.deepEqual(preview.setup.contextPreview.map((item) => item.knowledgeSubjects.length), [1, 0], "only the formal knowledge subject receives the selected event evidence");

  const objectsBefore = value.operations.listWorldObjects({ projectId: value.project.id }).length;
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("create-fake"));
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  let model = created.payload.data as NuwaReadModel;
  assert.equal(model.run.status, "ready");
  assert.equal(model.run.provider.providerCalls, 0);

  const firstStep = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "step-first" });
  assert.equal(firstStep.status, 200, JSON.stringify(firstStep.payload));
  model = firstStep.payload.data as NuwaReadModel;
  assert.equal(model.run.steps.length, 1);
  assert.equal(model.run.steps[0]?.tool.name, "read_role_context", "the fake adapter must take the actual scoped tool round trip");
  assert.equal(model.run.dispatches, 2);
  assert.deepEqual(model.contextInspector.actors.map((actor) => [actor.actorId, actor.knowledgeSubjects.length]), [[value.characters[0].id, 1], [value.characters[1].id, 0]], "the author inspector keeps both formal roles visibly distinct after the Run starts");
  assert.equal(JSON.stringify(model).includes("CANARY_OTHER_CHARACTER_SECRET"), false);
  assert.equal(JSON.stringify(model).includes("CANARY_AUTHOR_FUTURE"), false);

  const candidate = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/candidate", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "candidate-first", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(candidate.status, 201, JSON.stringify(candidate.payload));
  model = candidate.payload.data as NuwaReadModel;
  assert.equal(model.candidate.formalWrites, 0);
  assert.equal(model.review.status, "awaiting");
  assert.equal(value.operations.listWorldObjects({ projectId: value.project.id }).length, objectsBefore, "candidate handoff cannot create a formal world object");

  const pause = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/pause", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "pause-first" });
  assert.equal(pause.status, 200);
  model = pause.payload.data as NuwaReadModel;
  assert.equal(model.run.status, "paused");
  const resume = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/resume", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "resume-first" });
  assert.equal(resume.status, 200);
  model = resume.payload.data as NuwaReadModel;
  const stop = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/stop", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "stop-first" });
  assert.equal(stop.status, 200);
  model = stop.payload.data as NuwaReadModel;
  assert.equal(model.run.status, "cancelled");
  const duplicateStop = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/stop", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision - 1, operationId: "stop-first" });
  assert.equal(duplicateStop.status, 200, "the original cancel operation is idempotent");
  const lateStep = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "late-step" });
  assert.equal(lateStep.status, 400, "a late execution result cannot reactivate a cancelled Run");

  const crossProject = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/setup", {
    projectId: value.otherProject.id,
    participants: [{ id: value.characters[0].id, revision: value.characters[0].revisionToken }, { id: value.otherCharacters[1].id, revision: value.otherCharacters[1].revisionToken }],
    storyUnit: { id: value.otherUnit.id, revision: value.otherUnit.version },
    goal: "跨项目同名角色不应串联。",
    operationId: "cross-project"
  });
  assert.equal(crossProject.status, 409);

  child.kill("SIGTERM");
  await once(child, "exit");
  const restarted = await start(value, true);
  child = restarted.child;
  const recovered = await getJson(restarted.baseUrl, `/__local/story-studio/nuwa-n1/latest?projectId=${value.project.id}`);
  assert.equal(recovered.status, 200);
  assert.equal(((recovered.payload.data as NuwaReadModel).run?.runId), model.run.runId);
  assert.equal((recovered.payload.data as NuwaReadModel).run?.status, "cancelled");
  assert.equal(value.authorControl.listCandidateReviews({ projectId: value.project.id }).length, 1);
});

type NuwaReadModel = {
  run: { runId: string; status: string; revision: number; dispatches: number; steps: Array<{ stepId: string; tool: { name: string } }>; provider: { providerCalls: number } };
  contextInspector: { actors: Array<{ actorId: string; knowledgeSubjects: string[] }> };
  candidate: { formalWrites: number };
  review: { status: string };
};

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-n1-local-api-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "女娲 N1 本地接口", folderSlug: "nuwa-n1-local-api", genre: "mystery", ambience: "rain" });
  const otherProject = operations.createProject({ title: "女娲 N1 同名隔离", folderSlug: "nuwa-n1-other", genre: "mystery", ambience: "rain" });
  const characters = [
    operations.createWorldObject({ projectId: project.id, type: "character", title: "林昭", body: "CANARY_AUTHOR_FUTURE\n林昭只知道亲眼看见的事。" }),
    operations.createWorldObject({ projectId: project.id, type: "character", title: "阿芜", body: "CANARY_OTHER_CHARACTER_SECRET\n阿芜只听到传闻。" })
  ];
  const knownEvent = operations.createWorldObject({ projectId: project.id, type: "event", title: "钟声在桥上消失", body: "正式事件；正文不进入角色请求。" });
  setKnowledgeSubject(operations.resolveProjectWorkspacePath({ projectId: project.id }), knownEvent.id, characters[0]!.id);
  const unit = operations.createStoryUnit({ projectId: project.id, title: "旧桥钟声", linkedEntityIds: [knownEvent.id] });
  const otherCharacters = [
    operations.createWorldObject({ projectId: otherProject.id, type: "character", title: "林昭", body: "同名但属于另一个项目。" }),
    operations.createWorldObject({ projectId: otherProject.id, type: "character", title: "阿芜", body: "同名但属于另一个项目。" })
  ];
  const otherUnit = operations.createStoryUnit({ projectId: otherProject.id, title: "另一座旧桥" });
  return {
    root, rootPath, stateFilePath, operations, authorControl, project, otherProject, characters, otherCharacters, unit, otherUnit,
    request(operationId: string) {
      const current = characters.map((character) => operations.readWorldObject({ projectId: project.id, objectId: character.id }));
      const currentUnit = operations.readStoryUnit({ projectId: project.id, unitId: unit.id });
      return { projectId: project.id, participants: current.map((character) => ({ id: character.id, revision: character.revisionToken })), storyUnit: { id: currentUnit.id, revision: currentUnit.version }, goal: "在旧桥前辨认钟声来源，但不得把传闻当成事实。", operationId };
    }
  };
}

function setKnowledgeSubject(workspacePath: string, eventId: string, subjectId: string) {
  const target = findNoteById(workspacePath, eventId);
  if (!target) throw new Error(`Could not find workspace note ${eventId}.`);
  const source = readFileSync(target, "utf8");
  writeFileSync(target, source.replace(/^---\n([\s\S]*?)\n---/u, (_match, frontmatter) => `---\n${frontmatter}\nknowledge_subjects:\n  - ${subjectId}\n---`), "utf8");
}

function findNoteById(root: string, id: string): string | null {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findNoteById(target, id);
      if (found) return found;
    } else if (entry.isFile() && entry.name.endsWith(".md") && readFileSync(target, "utf8").includes(`\nid: ${id}\n`)) {
      return target;
    }
  }
  return null;
}

async function start(value: ReturnType<typeof fixture>, fake: boolean) {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      WORLD_OS_STORY_STUDIO_ROOT: value.rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: value.stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: TOKEN,
      TIANYAN_CREDENTIAL_BACKEND: "LOCAL_FILE_DEVELOPMENT_ONLY",
      TIANYAN_PROVIDER_APP_DATA_ROOT: path.join(value.root, "provider-app"),
      TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1",
      ...(fake ? { TIANYAN_NUWA_N1_FAKE_PROVIDER: "1" } : {})
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(baseUrl, child);
  return { baseUrl, child };
}

async function postJson(baseUrl: string, pathname: string, body: unknown) {
  const response = await fetch(baseUrl + pathname, { method: "POST", headers: { "content-type": "application/json", "x-world-os-local-control-token": TOKEN }, body: JSON.stringify(body) });
  return { status: response.status, payload: await response.json() as Record<string, unknown> };
}

async function getJson(baseUrl: string, pathname: string) {
  const response = await fetch(baseUrl + pathname, { headers: { "x-world-os-local-control-token": TOKEN } });
  return { status: response.status, payload: await response.json() as Record<string, unknown> };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(baseUrl: string, child: ChildProcess) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Story Studio server exited before becoming ready.");
    try { if ((await fetch(baseUrl + "/__local/story-studio/bootstrap")).ok) return; } catch { /* still binding */ }
    await delay(50);
  }
  throw new Error("Timed out waiting for Nuwa N1 local API server.");
}

function delay(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
