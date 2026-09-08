import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioRelationOperations } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { buildStorySnapshot } from "../../src/storyIntelligence/storySnapshotBuilder.ts";

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
  assert.equal((unavailableSetup.payload.data as { setup: { contextPreview: Array<{ knowledgeItems: Array<{ summary: string }>; beliefItems: Array<{ summary: string }> }> } }).setup.contextPreview[0]?.knowledgeItems.length, 1);
  const unavailableCreate = await postJson(unavailable.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("create-unavailable"));
  assert.equal(unavailableCreate.status, 503);
  child.kill("SIGTERM");
  await once(child, "exit");

  const enabled = await start(value, true);
  child = enabled.child;
  const setup = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/setup", value.request("setup-fake"));
  assert.equal(setup.status, 200);
  const preview = (setup.payload.data as { availability: { kind: string; label: string; providerCalls: number }; setup: { contextPreview: Array<{ actorId: string; knowledgeItems: Array<{ summary: string }>; beliefItems: Array<{ summary: string }> }> } });
  assert.equal(preview.availability.kind, "local-fake");
  assert.match(preview.availability.label, /本地工程演练/u);
  assert.equal(preview.availability.providerCalls, 0);
  assert.deepEqual(preview.setup.contextPreview.map((item) => item.knowledgeItems.length), [1, 0], "only the formal knowledge subject receives the selected event evidence");
  assert.deepEqual(preview.setup.contextPreview.map((item) => item.beliefItems.length), [0, 1], "suspected or misled evidence remains a belief instead of becoming a confirmed fact");

  const objectsBefore = value.operations.listWorldObjects({ projectId: value.project.id }).length;
  const formalSnapshotBefore = buildStorySnapshot({ workspacePath: value.operations.resolveProjectWorkspacePath({ projectId: value.project.id }) }).snapshotHash;
  const storyUnitVersionBefore = value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id }).version;
  const permission = await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  assert.equal(permission.status, 200);
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("create-fake"));
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  let model = created.payload.data as NuwaReadModel;
  assert.equal(model.run.status, "ready");
  assert.equal(model.run.provider.providerCalls, 0);
  assert.equal(model.authorization?.status, "active");
  assert.equal(model.authorization?.storyUnitId, value.unit.id);
  assert.deepEqual(model.authorization?.actorIds, value.characters.map((character) => character.id));

  const firstStep = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "step-first" });
  assert.equal(firstStep.status, 200, JSON.stringify(firstStep.payload));
  model = firstStep.payload.data as NuwaReadModel;
  assert.equal(model.run.steps.length, 1, JSON.stringify(model));
  assert.equal(model.run.steps[0]?.tool.name, "read_role_context", "the fake adapter must take the actual scoped tool round trip");
  assert.equal(model.run.dispatches, 2);
  assert.deepEqual(model.contextInspector.actors.map((actor) => [actor.actorId, actor.knowledgeItems.length]), [[value.characters[0].id, 1], [value.characters[1].id, 1]], "the recipient sees the explicitly delivered statement through the same context compiler used by the tool loop");
  assert.equal(model.contextInspector.actors[0]?.knowledgeItems[0]?.summary, "已亲历：钟声在桥上消失");
  assert.equal(model.contextInspector.actors[1]?.beliefItems[0]?.summary, "被误导：潮声来自废塔");
  assert.equal(JSON.stringify(model).includes("CANARY_OTHER_CHARACTER_SECRET"), false);
  assert.equal(JSON.stringify(model).includes("CANARY_AUTHOR_FUTURE"), false);

  const candidate = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/candidate", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "candidate-first", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(candidate.status, 201, JSON.stringify(candidate.payload));
  model = candidate.payload.data as NuwaReadModel;
  assert.equal(model.candidate.formalWrites, 0);
  assert.equal(model.review.status, "awaiting");
  assert.equal(value.operations.listWorldObjects({ projectId: value.project.id }).length, objectsBefore, "candidate handoff cannot create a formal world object");
  assert.equal(buildStorySnapshot({ workspacePath: value.operations.resolveProjectWorkspacePath({ projectId: value.project.id }) }).snapshotHash, formalSnapshotBefore, "candidate handoff cannot mutate formal Event, World, Canon, or narrative source content");
  assert.equal(value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id }).version, storyUnitVersionBefore, "candidate handoff cannot mutate the formal Story Unit or arrangement binding");

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
  assert.equal(model.authorization?.status, "revoked", "stopping a high-permission Run revokes later automatic formal writes");
  const duplicateStop = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/stop", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision - 1, operationId: "stop-first" });
  assert.equal(duplicateStop.status, 200, "the original cancel operation is idempotent");
  const lateStep = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "late-step" });
  assert.equal(lateStep.status, 400, "a late execution result cannot reactivate a cancelled Run");

  const forgedAuthorActivity = await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/activity", {
    projectId: value.project.id,
    actor: "nuwa",
    action: "confirmed-event",
    targetType: "nuwa-run",
    targets: [model.run.runId, value.unit.id, ...value.characters.map((character) => character.id)],
    authorConfirmed: true
  });
  assert.equal(forgedAuthorActivity.status, 403, "the browser activity route cannot forge an author confirmation");

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

test("Nuwa N1 reaches a loopback HTTP/SSE host through Gateway and Pi for alternating actors", async (t) => {
  const value = fixture();
  const host = await startSseHost();
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    await new Promise<void>((resolve, reject) => host.server.close((error) => error ? reject(error) : resolve()));
    rmSync(value.root, { recursive: true, force: true });
  });

  const running = await start(value, false, host.baseUrl);
  child = running.child;
  const created = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("http-sse-create"));
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  let model = created.payload.data as NuwaReadModel;
  assert.equal(model.run.provider.kind, "local-pi-host");
  for (let step = 1; step <= 3; step += 1) {
    const response = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: `http-sse-step-${step}` });
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    model = response.payload.data as NuwaReadModel;
  }
  assert.equal(model.run.steps.length, 3);
  assert.deepEqual(model.run.steps.map((step) => step.actorId), [value.characters[0].id, value.characters[1].id, value.characters[0].id]);
  assert.equal(model.run.providerDispatches, 6, "only actual HTTP/SSE model sends consume the N1 Provider dispatch budget");
  assert.equal(host.requests.length, 6, "each durable N1 step performs exactly the required tool call and one result call through HTTP/SSE");
  assert.deepEqual(host.requests.map((request) => request.toolLoopTurn), [false, true, false, true, false, true]);
  assert.equal(host.requests.every((request) => request.messages.length > 0), true, "every HTTP/SSE call receives the Pi-built Gateway transcript");
  assert.equal(JSON.stringify(host.requests).includes("CANARY_OTHER_CHARACTER_SECRET"), false);
  const modelStatus = await getJson(running.baseUrl, "/__local/story-studio/model-service/status");
  assert.equal(modelStatus.status, 200);
  const budgetLedger = (modelStatus.payload.data as { budgetLedger: { counts: { generationCalls: number; totalCalls: number; toolLoopTurns: number }; limits: { generationCalls: number; totalCalls: number }; reservationCount: number } }).budgetLedger;
  assert.deepEqual(budgetLedger.counts, { setupCalls: 0, generationCalls: 6, toolLoopTurns: 3, retryCalls: 0, totalCalls: 6 });
  assert.deepEqual(budgetLedger.limits, { generationCalls: 12, totalCalls: 12 });
  assert.equal(budgetLedger.reservationCount, host.requests.length, "every loopback send is reserved by the isolated Gateway ledger");
});

test("Nuwa N1 full access automatically applies one selected Run result through the existing formal Event chain", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    rmSync(value.root, { recursive: true, force: true });
  });
  const enabled = await start(value, true);
  child = enabled.child;
  assert.equal((await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" })).status, 200);
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("auto-apply-create"));
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  let model = created.payload.data as NuwaReadModel;
  const stepped = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "auto-apply-step" });
  assert.equal(stepped.status, 200, JSON.stringify(stepped.payload));
  model = stepped.payload.data as NuwaReadModel;
  const applied = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "auto-apply-result", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(applied.status, 201, JSON.stringify(applied.payload));
  const result = applied.payload.data as NuwaReadModel & { automaticApplication: { decisionSource: string; authorizationId: string; eventId: string; storyUnitId: string; materialObjectId: string; relationId: string; relationStatus: string } };
  assert.equal(result.automaticApplication.decisionSource, "nuwa-scope-authorization");
  assert.equal(result.automaticApplication.storyUnitId, value.unit.id);
  const event = value.operations.readWorldObject({ projectId: value.project.id, objectId: result.automaticApplication.eventId });
  assert.equal(event.status, "committed");
  assert.equal(event.properties?.planned_from, result.automaticApplication.planningEventId);
  assert.match(value.operations.readWorldObject({ projectId: value.project.id, objectId: result.automaticApplication.planningEventId }).body, /来源女娲 Run/u);
  const unit = value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id });
  assert.equal(unit.linkedEntityIds.includes(event.id), true);
  const material = value.operations.readWorldObject({ projectId: value.project.id, objectId: result.automaticApplication.materialObjectId });
  assert.equal(material.type, "location");
  const relation = value.relations.readRelation({ projectId: value.project.id, relationId: result.automaticApplication.relationId });
  assert.equal(result.automaticApplication.relationStatus, "confirmed");
  assert.equal(relation.relation.reviewState, "confirmed");
  assert.equal(relation.relation.sourceObjectId, event.id);
  assert.equal(relation.relation.targetObjectId, material.id);
  assert.equal(relation.relation.relationTypeId, value.sceneRelationType.type.relationTypeId);
  assert.equal(relation.relation.evidenceWarnings.every((warning) => warning.eligible), true, "the formal relation remains backed by the same committed Event");
  const permissions = await getJson(enabled.baseUrl, `/__local/story-studio/agent-permissions?projectId=${encodeURIComponent(value.project.id)}`);
  assert.equal((permissions.payload.data as { receipts: Array<{ decisionSource: string; authorizationId: string | null }> }).receipts.some((receipt) => receipt.decisionSource === "nuwa-scope-authorization" && receipt.authorizationId === result.automaticApplication.authorizationId), true);
  const objectCount = value.operations.listWorldObjects({ projectId: value.project.id }).length;
  const replayed = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "auto-apply-result", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(replayed.status, 201, JSON.stringify(replayed.payload));
  const replayedResult = replayed.payload.data as NuwaReadModel & { automaticApplication: { receiptId: string; eventId: string; materialObjectId: string; narrativePlacementIds: string[] } };
  assert.equal(replayedResult.automaticApplication.eventId, result.automaticApplication.eventId, "a lost response retry returns the original Event");
  assert.equal(replayedResult.automaticApplication.materialObjectId, result.automaticApplication.materialObjectId, "a lost response retry returns the original material");
  assert.equal(value.operations.listWorldObjects({ projectId: value.project.id }).length, objectCount, "same operation replay creates no new world objects");
  const mismatched = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "auto-apply-result", selectedStepIds: ["different-step"] });
  assert.equal(mismatched.status, 409, "the same operation identity cannot be rebound to different content");
});

test("Nuwa N1 freezes a same-Run draft then recovers one durable automatic-batch rollback", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => { if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); } rmSync(value.root, { recursive: true, force: true }); });
  const enabled = await start(value, true, undefined, false, true); child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("rollback-create"));
  let model = created.payload.data as NuwaReadModel;
  model = (await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "rollback-step" })).payload.data as NuwaReadModel;
  const applied = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "rollback-apply", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(applied.status, 201, JSON.stringify(applied.payload));
  const automatic = (applied.payload.data as NuwaReadModel & { automaticApplication: { receiptId: string; eventId: string; relationId: string; materialObjectId: string; narrativePlacementIds: string[]; resultVersion: { workVersionId: string; revision: number } } }).automaticApplication;
  const frozen = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-freeze-draft", { projectId: value.project.id, runId: model.run.runId, receiptId: automatic.receiptId, operationId: "rollback-freeze" });
  assert.equal(frozen.status, 201, JSON.stringify(frozen.payload));
  const draft = (frozen.payload.data as NuwaReadModel & { automaticApplication: { fixedDraft: { artifactId: string } } }).automaticApplication.fixedDraft;
  const source = createCreationSourceSelectionPort({ operations: value.operations });
  const pinnedBefore = await source.read(value.project.id, { artifactId: draft.artifactId, view: "pinned" });
  assert.equal(pinnedBefore.packageMode, "pinned-artifact");
  assert.match(pinnedBefore.package.storyMarkdown, /来源步骤|旧桥/u, "the real fixed Markdown is built from the same formal Event source");

  const rollbackRequest = { projectId: value.project.id, runId: model.run.runId, receiptId: automatic.receiptId, operationId: "rollback-automatic-batch" };
  const interrupted = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-rollback", rollbackRequest);
  assert.equal(interrupted.status, 409, "an interrupted rollback reports recovery instead of claiming the batch is fully reverted");
  const recovered = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-rollback", rollbackRequest);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.payload));
  const result = recovered.payload.data as NuwaReadModel & { automaticApplication: { status: string; rollback: { resultVersion: { revision: number } }; eventId: string } };
  assert.equal(result.automaticApplication.status, "rolled-back");
  assert.equal(result.automaticApplication.rollback.resultVersion.revision, automatic.resultVersion.revision + 1);
  assert.equal(value.relations.readRelation({ projectId: value.project.id, relationId: automatic.relationId }).relation.archived, true);
  assert.equal(value.operations.readWorldObject({ projectId: value.project.id, objectId: automatic.materialObjectId }).status, "archived");
  assert.equal(value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id }).linkedEntityIds.includes(automatic.eventId), false);
  const arrangement = value.operations.readNarrativeArrangement({ projectId: value.project.id, workVersionId: automatic.resultVersion.workVersionId, narrativePathId: value.unit.id });
  const currentArrangement = arrangement.arrangement?.revisions.find((revision) => revision.revision === arrangement.arrangement?.currentRevision);
  assert.equal(currentArrangement?.placements.some((placement) => automatic.narrativePlacementIds.includes(placement.placementId)), false);
  assert.equal(value.operations.readWorldObject({ projectId: value.project.id, objectId: automatic.eventId }).status, "committed", "the original formal Event remains historical evidence instead of being deleted");
  const pinnedAfter = await source.read(value.project.id, { artifactId: draft.artifactId, view: "pinned" });
  assert.equal(pinnedAfter.package.storyMarkdown, pinnedBefore.package.storyMarkdown, "the old fixed Markdown stays frozen after the formal compensation");
  const replayed = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-rollback", rollbackRequest);
  assert.equal(replayed.status, 200);
  assert.equal((replayed.payload.data as NuwaReadModel & { automaticApplication: { rollback: { resultVersion: { revision: number } } } }).automaticApplication.rollback.resultVersion.revision, result.automaticApplication.rollback.resultVersion.revision, "a lost response retry returns the original compensation result");
  const refreshed = await getJson(enabled.baseUrl, `/__local/story-studio/nuwa-n1/read?projectId=${encodeURIComponent(value.project.id)}&runId=${encodeURIComponent(model.run.runId)}`);
  assert.equal(refreshed.status, 200);
  assert.equal((refreshed.payload.data as NuwaReadModel & { automaticApplication: { status: string } }).automaticApplication.status, "rolled-back", "refresh finds the durable receipt rather than guessing from UI state");
});

test("Nuwa N1 refuses automatic-batch rollback when a later author version exists", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => { if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); } rmSync(value.root, { recursive: true, force: true }); });
  const enabled = await start(value, true); child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("rollback-drift-create"));
  let model = created.payload.data as NuwaReadModel;
  model = (await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "rollback-drift-step" })).payload.data as NuwaReadModel;
  const applied = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "rollback-drift-apply", selectedStepIds: [model.run.steps[0]!.stepId] });
  const automatic = (applied.payload.data as NuwaReadModel & { automaticApplication: { receiptId: string; resultVersion: { revision: number } } }).automaticApplication;
  const source = createCreationSourceSelectionPort({ operations: value.operations });
  source.appendStructuredStoryRevision(value.project.id, { expectedRevision: automatic.resultVersion.revision, authorActionId: "author.after-nuwa", idempotencyKey: "author.after-nuwa", createdAt: new Date().toISOString(), semanticDeltaRefs: ["author-change:kept"] });
  const blocked = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-rollback", { projectId: value.project.id, runId: model.run.runId, receiptId: automatic.receiptId, operationId: "rollback-drift" });
  assert.equal(blocked.status, 409);
  assert.equal(value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id }).linkedEntityIds.includes(automatic.eventId), true, "a later author version is retained and no batch side effect is guessed");
});

test("Nuwa N1 blocks a changed Story Unit before formal application writes", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => { if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); } rmSync(value.root, { recursive: true, force: true }); });
  const enabled = await start(value, true); child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("version-drift-create"));
  let model = created.payload.data as NuwaReadModel;
  model = (await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "version-drift-step" })).payload.data as NuwaReadModel;
  const before = value.operations.listWorldObjects({ projectId: value.project.id }).length;
  const currentUnit = value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id });
  value.operations.updateStoryUnit({ projectId: value.project.id, unitId: currentUnit.id, expectedVersion: currentUnit.version, summary: "作者已在开始后更新故事单元。" });
  const blocked = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "version-drift-apply", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(blocked.status, 409);
  assert.equal(value.operations.listWorldObjects({ projectId: value.project.id }).length, before, "a preflight version conflict creates no Event, material, or planning object");
});

test("Nuwa N1 resumes a persisted automatic application after relation confirmation fails", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => { if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); } rmSync(value.root, { recursive: true, force: true }); });
  const enabled = await start(value, true, undefined, true); child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("relation-recovery-create"));
  let model = created.payload.data as NuwaReadModel;
  model = (await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "relation-recovery-step" })).payload.data as NuwaReadModel;
  const request = { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "relation-recovery-apply", selectedStepIds: [model.run.steps[0]!.stepId] };
  const interrupted = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", request);
  assert.equal(interrupted.status, 409, "the injected relation interruption leaves a recovery receipt instead of claiming no write");
  const objectsAfterFailure = value.operations.listWorldObjects({ projectId: value.project.id }).length;
  assert.equal(value.relations.listRelations({ projectId: value.project.id }).relations.length, 0);
  const recovered = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", request);
  assert.equal(recovered.status, 201, JSON.stringify(recovered.payload));
  const result = recovered.payload.data as NuwaReadModel & { automaticApplication: { status: string; eventId: string; relationId: string; narrativePlacementIds: string[]; resultVersion: { revision: number } } };
  assert.equal(result.automaticApplication.status, "applied");
  assert.equal(value.operations.listWorldObjects({ projectId: value.project.id }).length, objectsAfterFailure, "recovery resumes existing Event and material instead of duplicating them");
  assert.equal(value.relations.listRelations({ projectId: value.project.id }).relations.length, 1);
  assert.equal(result.automaticApplication.narrativePlacementIds.length, 1);
  assert.equal(result.automaticApplication.resultVersion.revision, 2, "the immutable source version advances only after the complete receipt");
});

test("Nuwa N1 respects an explicit no-relation scope even when one active type exists", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => { if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); } rmSync(value.root, { recursive: true, force: true }); });
  const enabled = await start(value, true); child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", { ...value.request("no-relation-create"), relationTypeId: null });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  let model = created.payload.data as NuwaReadModel;
  const stepped = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "no-relation-step" });
  model = stepped.payload.data as NuwaReadModel;
  const applied = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "no-relation-apply", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(applied.status, 201, JSON.stringify(applied.payload));
  const result = applied.payload.data as NuwaReadModel & { automaticApplication: { relationId: string | null; relationStatus: string } };
  assert.equal(result.automaticApplication.relationId, null);
  assert.equal(result.automaticApplication.relationStatus, "not-configured");
  assert.equal(value.relations.listRelations({ projectId: value.project.id }).relations.length, 0);
});

test("Nuwa N1 continuous endpoint advances on the server and applies the completed high-permission Run without browser step polling", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    rmSync(value.root, { recursive: true, force: true });
  });
  const enabled = await start(value, true);
  child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("continuous-create"));
  const model = created.payload.data as NuwaReadModel;
  const continuous = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/continuous", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "continuous-run" });
  assert.equal(continuous.status, 200, JSON.stringify(continuous.payload));
  const result = continuous.payload.data as NuwaReadModel & { automaticApplication: { eventId: string; planningEventId: string } };
  assert.equal(result.run.status, "completed");
  assert.equal(result.run.steps.length, 6);
  assert.ok(result.automaticApplication.eventId);
  const planning = value.operations.readWorldObject({ projectId: value.project.id, objectId: result.automaticApplication.planningEventId });
  for (const step of result.run.steps) assert.match(planning.body, new RegExp(step.stepId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), "every completed step is retained in the formal application source");
});

test("Nuwa N1 stop aborts an in-flight loopback stream without sending a follow-up tool result", async (t) => {
  const value = fixture();
  const host = await startSseHost({ holdFirstResponse: true });
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    await new Promise<void>((resolve, reject) => host.server.close((error) => error ? reject(error) : resolve()));
    rmSync(value.root, { recursive: true, force: true });
  });

  const running = await start(value, false, host.baseUrl);
  child = running.child;
  const created = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("http-sse-cancel-create"));
  let model = created.payload.data as NuwaReadModel;
  const stepping = postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-cancel-step" });
  await host.firstRequestSeen;
  const duplicate = postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-cancel-step" });
  const conflicting = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-conflicting-step" });
  assert.equal(conflicting.status, 409, "a different operation cannot replace the active Run execution");
  const invalidStop = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/stop", { projectId: value.project.id, runId: model.run.runId, expectedRevision: 0, operationId: "http-sse-invalid-stop" });
  assert.equal(invalidStop.status, 400, "an invalid Stop is rejected before it can abort the live stream");
  const stopped = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/stop", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-cancel-stop" });
  assert.equal(stopped.status, 200);
  model = stopped.payload.data as NuwaReadModel;
  assert.equal(model.run.status, "cancelled");
  const stepResult = await stepping;
  const duplicateResult = await duplicate;
  assert.equal(stepResult.status, 200, JSON.stringify(stepResult.payload));
  assert.equal(duplicateResult.status, 200, JSON.stringify(duplicateResult.payload));
  assert.deepEqual(duplicateResult.payload, stepResult.payload, "same-operation delivery joins the original executor instead of replacing its cancel handle");
  assert.equal((stepResult.payload.data as NuwaReadModel).run.status, "cancelled");
  await host.firstResponseClosed;
  assert.equal(host.requests.length, 1, "cancellation reaches the active HTTP/SSE stream before a tool-result turn can be sent");
  assert.equal((stepResult.payload.data as NuwaReadModel).run.steps.length, 0, "a late stream result cannot commit a scene step after cancellation");
});

test("Nuwa N1 preserves an in-flight author cue for the next bounded step", async (t) => {
  const value = fixture();
  const host = await startSseHost({ holdFirstResponse: true });
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    await new Promise<void>((resolve, reject) => host.server.close((error) => error ? reject(error) : resolve()));
    rmSync(value.root, { recursive: true, force: true });
  });
  const running = await start(value, false, host.baseUrl);
  child = running.child;
  const created = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("http-sse-cue-create"));
  let model = created.payload.data as NuwaReadModel;
  const inFlight = postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-cue-step-one" });
  await host.firstRequestSeen;
  const live = await getJson(running.baseUrl, `/__local/story-studio/nuwa-n1/read?projectId=${value.project.id}&runId=${model.run.runId}`);
  assert.equal(live.status, 200);
  model = live.payload.data as NuwaReadModel;
  const cue = "CANARY_IN_FLIGHT_AUTHOR_CUE";
  const cued = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/cue", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-cue-author", instruction: cue });
  assert.equal(cued.status, 200, JSON.stringify(cued.payload));
  host.releaseFirstResponse();
  const firstResult = await inFlight;
  assert.equal(firstResult.status, 200, JSON.stringify(firstResult.payload));
  model = firstResult.payload.data as NuwaReadModel;
  assert.equal(model.run.steps.length, 0, "a cue that arrived after context construction is not falsely consumed by that turn");
  assert.equal(model.run.pendingCue?.instruction, cue, "the newer author cue remains durable for a later step");
  const next = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "http-sse-cue-step-two" });
  assert.equal(next.status, 200, JSON.stringify(next.payload));
  assert.equal((next.payload.data as NuwaReadModel).run.steps.length, 1);
  assert.equal(JSON.stringify(host.requests.slice(2)).includes(cue), true, "the next turn receives the preserved cue through its frozen role context");
});

test("Nuwa N1 continuous execution gives an in-flight cue a new durable step identity instead of replaying a zero-progress turn", async (t) => {
  const value = fixture();
  const host = await startSseHost({ holdFirstResponse: true });
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    await new Promise<void>((resolve, reject) => host.server.close((error) => error ? reject(error) : resolve()));
    rmSync(value.root, { recursive: true, force: true });
  });
  const running = await start(value, false, host.baseUrl); child = running.child;
  const created = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("continuous-cue-create"));
  const initial = created.payload.data as NuwaReadModel;
  const completing = postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/continuous", { projectId: value.project.id, runId: initial.run.runId, expectedRevision: initial.run.revision, operationId: "continuous-cue-run" });
  await host.firstRequestSeen;
  const live = await getJson(running.baseUrl, `/__local/story-studio/nuwa-n1/read?projectId=${value.project.id}&runId=${initial.run.runId}`);
  const cue = "CANARY_CONTINUOUS_CUE";
  const cued = await postJson(running.baseUrl, "/__local/story-studio/nuwa-n1/cue", { projectId: value.project.id, runId: initial.run.runId, expectedRevision: (live.payload.data as NuwaReadModel).run.revision, operationId: "continuous-cue-author", instruction: cue });
  assert.equal(cued.status, 200, JSON.stringify(cued.payload));
  host.releaseFirstResponse();
  const completed = await completing;
  assert.equal(completed.status, 200, JSON.stringify(completed.payload));
  const result = completed.payload.data as NuwaReadModel;
  assert.equal(result.run.status, "blocked", "the deliberately consumed in-flight Provider request remains counted instead of being silently erased");
  assert.equal(result.run.steps.length, 5, "the remaining transport budget is used by fresh post-cue turns, not a replay loop");
  assert.equal(JSON.stringify(host.requests.slice(2)).includes(cue), true, "the post-cue continuous attempt receives the author instruction");
  assert.equal(host.requests.length, 12, "the cue interruption consumes one accounted send and the following five turns consume the remaining eleven sends");
});

test("Nuwa N1 records an explicit heard statement for only its stable-ID recipient and preserves it across pause, read, resume, and retry", async (t) => {
  const value = fixture({ threeActors: true });
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    rmSync(value.root, { recursive: true, force: true });
  });
  const enabled = await start(value, true); child = enabled.child;
  assert.equal((await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" })).status, 200);
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("heard-three-create"));
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  let model = created.payload.data as NuwaReadModel;
  const first = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "heard-three-first" });
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  model = first.payload.data as NuwaReadModel;
  const statement = model.run.steps[0]!;
  const delivery = statement.heardStatements[0];
  assert.deepEqual({ recipientId: delivery?.recipientId, speakerId: delivery?.speakerId, statement: delivery?.statement, sourceStepId: delivery?.sourceStepId }, { recipientId: value.characters[1].id, speakerId: value.characters[0].id, statement: "我只把钟声的线索告诉你。", sourceStepId: statement.stepId });
  assert.equal(delivery?.sourceRevision, model.contextInspector.actors[1]!.knowledgeItems.find((item) => item.id === `heard.${statement.stepId}.${value.characters[1].id}`)?.sourceRevision, "heard delivery retains the immutable source version shown to the recipient");
  assert.equal(model.contextInspector.actors[1]!.knowledgeItems.some((item) => item.id === `heard.${statement.stepId}.${value.characters[1].id}` && item.visibility === "heard"), true, "乙的当前检查器来自实际角色上下文并保留 heard，而不是升级为正式事实");
  assert.equal(model.contextInspector.actors[2]!.knowledgeItems.some((item) => item.id.startsWith("heard.")), false, "丙未被递送该说法");

  const duplicate = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision - 1, operationId: "heard-three-first" });
  assert.equal(duplicate.status, 200, JSON.stringify(duplicate.payload));
  assert.equal((duplicate.payload.data as NuwaReadModel).run.steps.length, 1, "the same step operation cannot duplicate a delivery");

  const paused = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/pause", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "heard-three-pause" });
  assert.equal(paused.status, 200);
  model = paused.payload.data as NuwaReadModel;
  const refreshed = await getJson(enabled.baseUrl, `/__local/story-studio/nuwa-n1/read?projectId=${value.project.id}&runId=${model.run.runId}`);
  assert.equal(refreshed.status, 200);
  assert.equal((refreshed.payload.data as NuwaReadModel).contextInspector.actors[1]!.knowledgeItems.some((item) => item.id === `heard.${statement.stepId}.${value.characters[1].id}`), true, "a refresh keeps the persisted heard evidence");
  const resumed = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/resume", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "heard-three-resume" });
  assert.equal(resumed.status, 200);
  model = resumed.payload.data as NuwaReadModel;
  const second = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "heard-three-second" });
  assert.equal(second.status, 200, JSON.stringify(second.payload));
  model = second.payload.data as NuwaReadModel;
  assert.equal(model.run.steps[1]!.actorId, value.characters[1].id);
  assert.equal(model.run.steps[1]!.contextEvidenceRefs.some((ref) => ref.sourceId === statement.stepId && ref.visibility === "heard" && ref.summary.includes(statement.speech!)), true, "乙的 actual tool context contains the delivered statement with its source step");
  const third = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "heard-three-third" });
  assert.equal(third.status, 200, JSON.stringify(third.payload));
  model = third.payload.data as NuwaReadModel;
  assert.equal(model.run.steps[2]!.actorId, value.characters[2].id);
  assert.equal(model.run.steps[2]!.contextEvidenceRefs.some((ref) => ref.sourceId === statement.stepId || ref.summary.includes(statement.speech!)), false, "丙的 actual tool context excludes the undisclosed statement");
});

type NuwaReadModel = {
  run: { runId: string; status: string; revision: number; dispatches: number; providerDispatches: number; scene: { storyUnitId: string }; pendingCue: { operationId: string; instruction: string } | null; steps: Array<{ stepId: string; actorId: string; speech: string | null; heardStatements: Array<{ recipientId: string; speakerId: string; statement: string; sourceStepId: string; sourceRevision: string }>; contextEvidenceRefs: Array<{ sourceId: string; summary: string; visibility: string }>; tool: { name: string } }>; provider: { providerCalls: number; kind?: string } };
  contextInspector: { actors: Array<{ actorId: string; knowledgeItems: Array<{ id: string; summary: string; sourceRevision: string; visibility: string }>; beliefItems: Array<{ summary: string }> }> };
  candidate: { formalWrites: number };
  review: { status: string };
  authorization?: { id: string; status: string; storyUnitId: string; actorIds: string[] } | null;
};

function fixture(options: { threeActors?: boolean } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-n1-local-api-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "女娲 N1 本地接口", folderSlug: "nuwa-n1-local-api", genre: "mystery", ambience: "rain" });
  const otherProject = operations.createProject({ title: "女娲 N1 同名隔离", folderSlug: "nuwa-n1-other", genre: "mystery", ambience: "rain" });
  const characters = [
    operations.createWorldObject({ projectId: project.id, type: "character", title: "林昭", body: "CANARY_AUTHOR_FUTURE\n林昭只知道亲眼看见的事。" }),
    operations.createWorldObject({ projectId: project.id, type: "character", title: "阿芜", body: "CANARY_OTHER_CHARACTER_SECRET\n阿芜只听到传闻。" }),
    ...(options.threeActors ? [operations.createWorldObject({ projectId: project.id, type: "character", title: "丙", body: "丙没有听到桥上的私下谈话。" })] : [])
  ];
  const knownEvent = operations.createWorldObject({ projectId: project.id, type: "event", title: "钟声在桥上消失", body: "正式事件；正文不进入角色请求。" });
  setKnowledgeSubject(operations.resolveProjectWorkspacePath({ projectId: project.id }), knownEvent.id, characters[0]!.id);
  const misledEvent = operations.createWorldObject({ projectId: project.id, type: "event", title: "潮声来自废塔", tags: [`知情：${characters[1]!.id}=被误导`], body: "误导内容不是世界真相，但属于阿芜当前持有的信念。" });
  setKnowledgeSubject(operations.resolveProjectWorkspacePath({ projectId: project.id }), misledEvent.id, characters[1]!.id);
  const unit = operations.createStoryUnit({ projectId: project.id, title: "旧桥钟声", linkedEntityIds: [knownEvent.id, misledEvent.id] });
  createCreationSourceSelectionPort({ operations }).createRoot(project.id);
  const relations = createStoryStudioRelationOperations({
    workspaceOperations: operations,
    verifyCanonEventRead: ({ projectId, eventId }) => authorControl.verifyCanonEventRead({ projectId, eventId })
  });
  const sceneRelationType = relations.createRelationType({ projectId: project.id, operationId: "fixture.relation-type.scene", label: "发生于" });
  const otherCharacters = [
    operations.createWorldObject({ projectId: otherProject.id, type: "character", title: "林昭", body: "同名但属于另一个项目。" }),
    operations.createWorldObject({ projectId: otherProject.id, type: "character", title: "阿芜", body: "同名但属于另一个项目。" })
  ];
  const otherUnit = operations.createStoryUnit({ projectId: otherProject.id, title: "另一座旧桥" });
  return {
    root, rootPath, stateFilePath, operations, authorControl, relations, sceneRelationType, project, otherProject, characters, otherCharacters, unit, otherUnit,
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

async function start(value: ReturnType<typeof fixture>, fake: boolean, localPiHostUrl?: string, failRelationOnce = false, failRollbackOnce = false) {
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
      , ...(localPiHostUrl ? { TIANYAN_NUWA_N1_LOCAL_PI_HOST_URL: localPiHostUrl, TIANYAN_PROVIDER_BUDGET_TEST_MODE: "1" } : {})
      , ...(failRelationOnce ? { TIANYAN_NUWA_N1_TEST_FAIL_RELATION_ONCE: "1" } : {})
      , ...(failRollbackOnce ? { TIANYAN_NUWA_N1_TEST_FAIL_ROLLBACK_ONCE: "1" } : {})
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

async function startSseHost(options: { holdFirstResponse?: boolean } = {}): Promise<{ baseUrl: string; server: HttpServer; requests: Array<{ idempotencyKey: string | null; toolLoopTurn: boolean; messages: unknown[] }>; firstRequestSeen: Promise<void>; firstResponseClosed: Promise<void>; releaseFirstResponse(): void }> {
  const requests: Array<{ idempotencyKey: string | null; toolLoopTurn: boolean; messages: unknown[] }> = [];
  let resolveFirstRequestSeen: (() => void) | null = null;
  const firstRequestSeen = new Promise<void>((resolve) => { resolveFirstRequestSeen = resolve; });
  let resolveFirstResponseClosed: (() => void) | null = null;
  const firstResponseClosed = new Promise<void>((resolve) => { resolveFirstResponseClosed = resolve; });
  let releaseFirstResponse: (() => void) | null = null;
  const heldFirstResponse = new Promise<void>((resolve) => { releaseFirstResponse = resolve; });
  const server = createHttpServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/chat/completions") { response.statusCode = 404; response.end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages?: unknown[]; tool_choice?: unknown };
    const toolLoopTurn = Array.isArray(payload.messages) && payload.messages.some((message) => (message as { role?: string }).role === "tool");
    requests.push({ idempotencyKey: request.headers["idempotency-key"]?.toString() || null, toolLoopTurn, messages: payload.messages || [] });
    if (requests.length === 1) resolveFirstRequestSeen?.();
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "x-request-id": `local-sse-${requests.length}` });
    if (options.holdFirstResponse && requests.length === 1) {
      response.once("close", () => resolveFirstResponseClosed?.());
      await heldFirstResponse;
      if (response.destroyed) return;
    }
    if (!toolLoopTurn) {
      response.write(`data: ${JSON.stringify({ model: "nuwa-n1-sse-fixture", choices: [{ delta: { tool_calls: [{ index: 0, id: `tool.${requests.length}`, type: "function", function: { name: "read_role_context", arguments: "{}" } }] }, finish_reason: "tool_calls" }] })}\n\n`);
    } else {
      const result = JSON.stringify({ intent: "只依据本角色工具上下文观察", speech: null, action: { action: "observe", targetId: null }, observableResult: "完成一项受限观察。" });
      response.write(`data: ${JSON.stringify({ model: "nuwa-n1-sse-fixture", choices: [{ delta: { content: result }, finish_reason: "stop" }], usage: { prompt_tokens: 24, completion_tokens: 16, total_tokens: 40 } })}\n\n`);
    }
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server, requests, firstRequestSeen, firstResponseClosed, releaseFirstResponse() { releaseFirstResponse?.(); } };
}
