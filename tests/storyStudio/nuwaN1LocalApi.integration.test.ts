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
import { readNuwaN1Run } from "../../src/storyIntelligence/nuwaN1Runtime.ts";

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
  const preview = (setup.payload.data as { availability: { kind: string; label: string; providerCalls: number }; setup: { contextPreview: Array<{ actorId: string; localGoal: string; profileBasis: { core: string | null; boundaries: string | null; sourceRevision: string }; knowledgeItems: Array<{ summary: string }>; beliefItems: Array<{ summary: string }> }> } });
  assert.equal(preview.availability.kind, "local-fake");
  assert.match(preview.availability.label, /本地工程演练/u);
  assert.equal(preview.availability.providerCalls, 0);
  assert.deepEqual(preview.setup.contextPreview.map((item) => item.knowledgeItems.length), [1, 0], "only the formal knowledge subject receives the selected event evidence");
  assert.deepEqual(preview.setup.contextPreview.map((item) => item.beliefItems.length), [0, 1], "suspected or misled evidence remains a belief instead of becoming a confirmed fact");
  assert.deepEqual(preview.setup.contextPreview.map((item) => item.localGoal), ["核实钟声是否来自桥下", "确保退路不被切断"], "each actor receives the author's distinct scene goal");
  assert.deepEqual(preview.setup.contextPreview.map((item) => [item.profileBasis.core, item.profileBasis.boundaries]), [["先求证再行动", "不拿同伴冒险换取线索"], ["先保全退路", "不独自追击未知目标"]]);
  assert.equal(JSON.stringify(preview).includes("未经 Canon 验证的规划线索"), false, "a linked draft Event cannot enter a role Provider context");

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
  const frozenFirstBasis = model.contextInspector.actors[0]!.profileBasis;
  const editedCharacter = value.operations.readWorldObject({ projectId: value.project.id, objectId: value.characters[0]!.id });
  value.operations.updateWorldObject({ projectId: value.project.id, objectId: editedCharacter.id, expectedHash: editedCharacter.revisionToken, title: editedCharacter.title, status: editedCharacter.status, tags: editedCharacter.tags, aliases: editedCharacter.aliases, body: editedCharacter.body, subtype: editedCharacter.subtype, typedProperties: editedCharacter.typedProperties, profile: characterProfile("改为先行动后核实", "不得回头", "CANARY_AUTHOR_PROFILE_SECRET_EDITED"), card: editedCharacter.card });

  const firstStep = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "step-first" });
  assert.equal(firstStep.status, 200, JSON.stringify(firstStep.payload));
  model = firstStep.payload.data as NuwaReadModel;
  assert.equal(model.run.steps.length, 1, JSON.stringify(model));
  assert.equal(model.run.steps[0]?.tool.name, "read_role_context", "the fake adapter must take the actual scoped tool round trip");
  assert.equal(model.run.dispatches, 2);
  assert.deepEqual(model.contextInspector.actors[0]!.profileBasis, frozenFirstBasis, "editing the character after Run creation cannot rewrite the frozen actor basis");
  assert.deepEqual(model.contextInspector.actors.map((actor) => [actor.actorId, actor.knowledgeItems.length]), [[value.characters[0].id, 1], [value.characters[1].id, 1]], "the recipient sees the explicitly delivered statement through the same context compiler used by the tool loop");
  assert.match(model.contextInspector.actors[0]?.knowledgeItems[0]?.summary ?? "", /^已得知：钟声在桥上消失/u);
  assert.match(model.contextInspector.actors[1]?.beliefItems[0]?.summary ?? "", /^被误导：潮声来自废塔/u);
  assert.equal(JSON.stringify(model).includes("CANARY_OTHER_CHARACTER_SECRET"), false);
  assert.equal(JSON.stringify(model).includes("CANARY_AUTHOR_FUTURE"), false);
  assert.equal(JSON.stringify(model).includes("CANARY_AUTHOR_PROFILE_SECRET"), false);

  const candidate = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/candidate", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "candidate-first", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(candidate.status, 201, JSON.stringify(candidate.payload));
  model = candidate.payload.data as NuwaReadModel;
  assert.equal(model.candidate.formalWrites, 0);
  assert.equal(model.review.status, "awaiting");
  const storedReview = value.authorControl.listCandidateReviews({ projectId: value.project.id })[0]!;
  const storedCandidate = (storedReview.result.nuwa as { candidates: Array<{ evidence: string[] }> }).candidates[0]!;
  const expectedEvidenceIds = model.run.steps[0]!.contextEvidenceRefs.map((ref) => ref.sourceId);
  assert.deepEqual(storedCandidate.evidence, expectedEvidenceIds, "Candidate Review keeps the selected step's exact persisted context evidence");
  assert.deepEqual((storedReview.result.contextPack as { sources: Array<{ id: string }> }).sources.map((source) => source.id), expectedEvidenceIds, "Candidate Review ContextPack excludes unused initial facts and unselected-step evidence");
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

  assert.equal((await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.otherProject.id, profile: "full-access" })).status, 200);
  const otherCurrentCharacters = value.otherCharacters.map((character) => value.operations.readWorldObject({ projectId: value.otherProject.id, objectId: character.id }));
  const otherCurrentUnit = value.operations.readStoryUnit({ projectId: value.otherProject.id, unitId: value.otherUnit.id });
  const unversionedFullAccess = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", {
    projectId: value.otherProject.id,
    participants: otherCurrentCharacters.map((character) => ({ id: character.id, revision: character.revisionToken })),
    storyUnit: { id: otherCurrentUnit.id, revision: otherCurrentUnit.version },
    goal: "没有正式主版本时不得授予自动写入权限。",
    operationId: "unversioned-full-access-must-block"
  });
  assert.equal(unversionedFullAccess.status, 409, JSON.stringify(unversionedFullAccess.payload));
  assert.match(JSON.stringify(unversionedFullAccess.payload), /正式主版本/u);
  const noUnversionedRun = await getJson(enabled.baseUrl, `/__local/story-studio/nuwa-n1/latest?projectId=${value.otherProject.id}`);
  assert.equal((noUnversionedRun.payload.data as NuwaReadModel).run, null, "the rejected full-access request cannot leave an unversioned Run behind");

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

test("Nuwa N1 idempotent create reconciles a missing full-access authorization", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    rmSync(value.root, { recursive: true, force: true });
  });
  const enabled = await start(value, true);
  child = enabled.child;
  const request = value.request("create-reconcile-authorization");
  assert.equal((await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "general" })).status, 200);
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", request);
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal((created.payload.data as NuwaReadModel).authorization, null);
  assert.equal((await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" })).status, 200);
  const replayed = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", request);
  assert.equal(replayed.status, 201, JSON.stringify(replayed.payload));
  assert.equal((replayed.payload.data as NuwaReadModel).authorization?.status, "active");
  assert.deepEqual((replayed.payload.data as NuwaReadModel).authorization?.actorIds, value.characters.map((character) => character.id));
});

test("Nuwa N4 only gives a role world state and formal relation evidence it legally knows, without rewriting an existing Run", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    rmSync(value.root, { recursive: true, force: true });
  });

  const server = await start(value, true);
  child = server.child;
  const before = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("n4-frozen-before-state"));
  assert.equal(before.status, 201, JSON.stringify(before.payload));
  const frozen = before.payload.data as NuwaReadModel;
  assert.equal(frozen.contextInspector.actors.every((actor) => actor.knowledgeItems.every((item) => item.visibility !== "world-state" && item.visibility !== "relation")), true);

  const northGate = value.operations.createWorldObject({ projectId: value.project.id, type: "location", title: "北闸" });
  const copperKey = value.operations.createWorldObject({ projectId: value.project.id, type: "item", title: "铜钥匙" });
  const knownEvent = value.operations.readWorldObject({ projectId: value.project.id, objectId: value.knownEvent.id });
  const eventEvidence = { kind: "confirmed-event" as const, event: { id: knownEvent.id, revision: knownEvent.revisionToken } };
  value.operations.applyWorldStateN4({
    projectId: value.project.id, objectId: northGate.id, expectedObjectRevision: northGate.revisionToken, expectedRevision: 0,
    operationId: "n4.north-gate.closed", effectiveAt: "2000-01-01T00:00:00Z", now: "2000-01-01T00:00:01Z",
    value: { kind: "passage", state: "closed" }, evidence: eventEvidence
  });
  value.operations.applyWorldStateN4({
    projectId: value.project.id, objectId: copperKey.id, expectedObjectRevision: copperKey.revisionToken, expectedRevision: 0,
    operationId: "n4.copper-key.held", effectiveAt: "2000-01-01T00:00:00Z", now: "2000-01-01T00:00:02Z",
    value: { kind: "holder", state: "held", holder: { id: value.characters[0]!.id, revision: value.characters[0]!.revisionToken } }, evidence: eventEvidence
  });
  const relationCandidate = value.relations.createRelationCandidate({
    projectId: value.project.id, operationId: "n4.formal-relationship", sourceObjectId: value.characters[0]!.id, targetObjectId: value.characters[1]!.id,
    relationTypeId: value.sceneRelationType.type.relationTypeId, direction: "forward",
    evidenceRefs: [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: value.project.id, eventId: knownEvent.id, revisionToken: knownEvent.revisionToken, state: "committed", requestedUse: "constraint" } }]
  });
  value.relations.confirmRelationCandidate({ projectId: value.project.id, relationId: relationCandidate.relation.relationId, expectedRelationRevision: relationCandidate.relation.revision, operationId: "n4.formal-relationship.confirm" });

  child.kill("SIGTERM");
  await once(child, "exit");
  const restarted = await start(value, true);
  child = restarted.child;
  const preserved = await getJson(restarted.baseUrl, `/__local/story-studio/nuwa-n1/latest?projectId=${value.project.id}`);
  assert.equal(preserved.status, 200);
  const frozenAfterState = preserved.payload.data as NuwaReadModel;
  assert.equal(frozenAfterState.run.runId, frozen.run.runId);
  assert.equal(frozenAfterState.contextInspector.actors.every((actor) => actor.knowledgeItems.every((item) => item.visibility !== "world-state" && item.visibility !== "relation")), true, "a previously created Run keeps its frozen context");

  assert.equal((await postJson(restarted.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" })).status, 200);
  const after = await postJson(restarted.baseUrl, "/__local/story-studio/nuwa-n1/create", {
    ...value.request("n4-new-state-context"),
    goal: "北闸已封，林昭持有铜钥匙；林昭需要考虑与阿芜的正式关系后交接钥匙并寻找替代路线。"
  });
  assert.equal(after.status, 201, JSON.stringify(after.payload));
  const next = after.payload.data as NuwaReadModel;
  const linzhao = next.contextInspector.actors.find((actor) => actor.actorId === value.characters[0]!.id)!;
  const awu = next.contextInspector.actors.find((actor) => actor.actorId === value.characters[1]!.id)!;
  assert.equal(linzhao.knowledgeItems.filter((item) => item.visibility === "world-state").length, 2, JSON.stringify(linzhao.knowledgeItems));
  assert.equal(linzhao.knowledgeItems.some((item) => item.visibility === "world-state" && item.summary.includes("北闸通行状态：封闭")), true);
  assert.equal(linzhao.knowledgeItems.some((item) => item.visibility === "world-state" && item.summary.includes("铜钥匙持有状态")), true);
  const stored = readNuwaN1Run(value.operations.resolveProjectWorkspacePath({ projectId: value.project.id }), next.run.runId)!;
  const storedLinzhao = stored.actors.find((actor) => actor.character.id === value.characters[0]!.id)!;
  const storedAwu = stored.actors.find((actor) => actor.character.id === value.characters[1]!.id)!;
  assert.equal(storedLinzhao.knownFacts.filter((item) => item.visibility === "relation").length, 1, "the relation remains a traceable legal source even when the N1 attention budget concentrates on the two state facts");
  assert.equal(storedAwu.knownFacts.some((item) => item.visibility === "world-state" || item.visibility === "relation"), false, "attention and participation do not disclose an Event-backed world fact to another role");
  assert.equal(awu.knowledgeItems.some((item) => item.visibility === "world-state" || item.visibility === "relation"), false);
  const firstStateStep = await postJson(restarted.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: next.run.runId, expectedRevision: next.run.revision, operationId: "n4-state-handoff-step" });
  assert.equal(firstStateStep.status, 200, JSON.stringify(firstStateStep.payload));
  let stepped = firstStateStep.payload.data as NuwaReadModel;
  assert.ok(stepped.run.steps[0], JSON.stringify(firstStateStep.payload));
  // Lin Zhao acts in turns one and three.  Repeated compatible handoffs are
  // still scene evidence, but must remain one reversible world-state write.
  stepped = (await postJson(restarted.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: stepped.run.runId, expectedRevision: stepped.run.revision, operationId: "n4-state-handoff-step-two" })).payload.data as NuwaReadModel;
  stepped = (await postJson(restarted.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: stepped.run.runId, expectedRevision: stepped.run.revision, operationId: "n4-state-handoff-step-three" })).payload.data as NuwaReadModel;
  assert.equal(stepped.run.steps.length, 3);
  const autoApplied = await postJson(restarted.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: stepped.run.runId, expectedRevision: stepped.run.revision, operationId: "n4-state-handoff-apply", selectedStepIds: [stepped.run.steps[0]!.stepId, stepped.run.steps[2]!.stepId] });
  assert.equal(autoApplied.status, 201, JSON.stringify(autoApplied.payload));
  const automatic = autoApplied.payload.data as NuwaReadModel & { automaticApplication: { worldStateChanges: Array<{ objectId: string; changeId: string }> } };
  assert.equal(automatic.automaticApplication.worldStateChanges.length, 1);
  const transferred = value.operations.readWorldStateN4({ projectId: value.project.id, objectId: copperKey.id, observedAt: new Date().toISOString() });
  assert.deepEqual(transferred.value, { kind: "holder", state: "held", holder: { id: value.characters[1]!.id, revision: value.operations.readWorldObject({ projectId: value.project.id, objectId: value.characters[1]!.id }).revisionToken } });
  const rolledBack = await postJson(restarted.baseUrl, "/__local/story-studio/nuwa-n1/auto-rollback", { projectId: value.project.id, runId: stepped.run.runId, receiptId: automatic.automaticApplication.receiptId, operationId: "n4-state-handoff-rollback" });
  assert.equal(rolledBack.status, 200, JSON.stringify(rolledBack.payload));
  const restored = value.operations.readWorldStateN4({ projectId: value.project.id, objectId: copperKey.id, observedAt: new Date().toISOString() });
  assert.deepEqual(restored.value, { kind: "holder", state: "held", holder: { id: value.characters[0]!.id, revision: value.operations.readWorldObject({ projectId: value.project.id, objectId: value.characters[0]!.id }).revisionToken } });

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
  const rootVersion = createCreationSourceSelectionPort({ operations: value.operations }).resolveRootWorkVersion(value.project.id);
  assert.ok(rootVersion);
  const unitBeforeArrangement = value.operations.readStoryUnit({ projectId: value.project.id, unitId: value.unit.id });
  const createdArrangement = value.operations.createNarrativeArrangement({ projectId: value.project.id, workVersionId: rootVersion.identity.workVersionId, narrativePathId: value.unit.id, ownerStoryUnitId: value.unit.id, expectedOwnerVersion: unitBeforeArrangement.version, expectedRevision: 0, operationId: "fixture.arrangement.create", authorActionId: "fixture.arrangement.create", createdAt: "2026-09-08T00:00:00.000Z" });
  assert.equal(createdArrangement.conflict, false);
  assert.ok(createdArrangement.arrangement);
  const seededPlacement = value.operations.insertNarrativePlacement({ projectId: value.project.id, workVersionId: rootVersion.identity.workVersionId, narrativePathId: value.unit.id, expectedOwnerVersion: createdArrangement.ownerVersion, expectedRevision: createdArrangement.arrangement.currentRevision, operationId: "fixture.arrangement.insert", authorActionId: "fixture.arrangement.insert", sourceKind: "author-action", sourceRef: "fixture-existing-placement", createdAt: "2026-09-08T00:00:01.000Z", eventId: unitBeforeArrangement.linkedEntityIds[0]!, storyUnitId: value.unit.id, role: "primary", position: { kind: "end" } });
  assert.equal(seededPlacement.conflict, false);
  const existingPlacementId = seededPlacement.receipt!.afterPlacementIds.find((placementId) => !seededPlacement.receipt!.beforePlacementIds.includes(placementId));
  assert.ok(existingPlacementId);
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
  const result = applied.payload.data as NuwaReadModel & { automaticApplication: { decisionSource: string; authorizationId: string; eventId: string; storyUnitId: string; materialObjectId: string; relationId: string; relationStatus: string; narrativePlacementIds: string[] } };
  assert.equal(result.automaticApplication.decisionSource, "nuwa-scope-authorization");
  assert.equal(result.automaticApplication.storyUnitId, value.unit.id);
  assert.equal(result.automaticApplication.narrativePlacementIds.length, 1, "the application receipt records only this batch's inserted placement");
  assert.equal(result.automaticApplication.narrativePlacementIds.includes(existingPlacementId), false, "pre-existing author placements do not enter the Nuwa batch receipt");
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
  const result = recovered.payload.data as NuwaReadModel & { automaticApplication: { status: string; rollback: { compensation: { changeSetId: string }; resultVersion: { revision: number } }; eventId: string; authorizationId: string } };
  assert.equal(result.automaticApplication.status, "rolled-back");
  assert.equal(result.automaticApplication.rollback.resultVersion.revision, automatic.resultVersion.revision + 1);
  const compensation = value.authorControl.readAuthorChangeSet({ projectId: value.project.id, changeSetId: result.automaticApplication.rollback.compensation.changeSetId });
  assert.equal(compensation?.authorDecision.source, "nuwa-scope-authorization");
  assert.equal(compensation?.authorDecision.authorizationId, result.automaticApplication.authorizationId, "rollback retains the scope authorization it compensates");
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

test("Nuwa N1 rejects an expired high-permission scope before automatic application", async (t) => {
  const value = fixture();
  let child: ChildProcess | null = null;
  t.after(async () => { if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); } rmSync(value.root, { recursive: true, force: true }); });
  const enabled = await start(value, true); child = enabled.child;
  await postJson(enabled.baseUrl, "/__local/story-studio/agent-permissions/profile", { projectId: value.project.id, profile: "full-access" });
  const created = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("expired-scope-create"));
  let model = created.payload.data as NuwaReadModel;
  model = (await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "expired-scope-step" })).payload.data as NuwaReadModel;
  const permissionPath = path.join(value.operations.resolveProjectWorkspacePath({ projectId: value.project.id }), ".world-os", "author-control", "action-permissions.json");
  const permissionState = JSON.parse(readFileSync(permissionPath, "utf8")) as { nuwaAuthorizations: Array<{ expiresAt: string | null }> };
  permissionState.nuwaAuthorizations[0]!.expiresAt = "2000-01-01T00:00:00.000Z";
  writeFileSync(permissionPath, JSON.stringify(permissionState, null, 2) + "\n", "utf8");
  const objectCount = value.operations.listWorldObjects({ projectId: value.project.id }).length;
  const applied = await postJson(enabled.baseUrl, "/__local/story-studio/nuwa-n1/auto-apply", { projectId: value.project.id, runId: model.run.runId, expectedRevision: model.run.revision, operationId: "expired-scope-apply", selectedStepIds: [model.run.steps[0]!.stepId] });
  assert.equal(applied.status, 403, JSON.stringify(applied.payload));
  assert.equal(value.operations.listWorldObjects({ projectId: value.project.id }).length, objectCount, "expired authorization cannot create formal objects");
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

test("Nuwa N2C recalls A-to-B heard memory in a later scene after server restart while C remains unaware", async (t) => {
  const value = fixture({ threeActors: true });
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child?.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), delay(2_000)]); }
    rmSync(value.root, { recursive: true, force: true });
  });
  let server = await start(value, true); child = server.child;
  const firstCreate = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/create", value.request("n2c-scene-one-create"));
  assert.equal(firstCreate.status, 201, JSON.stringify(firstCreate.payload));
  let first = firstCreate.payload.data as NuwaReadModel;
  const firstStep = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: first.run.runId, expectedRevision: first.run.revision, operationId: "n2c-scene-one-step" });
  assert.equal(firstStep.status, 200, JSON.stringify(firstStep.payload));
  first = firstStep.payload.data as NuwaReadModel;
  const delivered = first.run.steps[0]!.heardStatements[0]!;
  assert.equal(delivered.recipientId, value.characters[1]!.id);
  assert.equal(first.contextInspector.actors[2]!.memoryItems.length, 0);
  const paused = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/pause", { projectId: value.project.id, runId: first.run.runId, expectedRevision: first.run.revision, operationId: "n2c-scene-one-pause" });
  assert.equal(paused.status, 200, JSON.stringify(paused.payload));
  first = paused.payload.data as NuwaReadModel;
  const refreshed = await getJson(server.baseUrl, `/__local/story-studio/nuwa-n1/read?projectId=${value.project.id}&runId=${first.run.runId}`);
  assert.equal(refreshed.status, 200);
  assert.equal((refreshed.payload.data as NuwaReadModel).run.steps[0]!.heardStatements[0]!.statement, delivered.statement);
  const resumed = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/resume", { projectId: value.project.id, runId: first.run.runId, expectedRevision: first.run.revision, operationId: "n2c-scene-one-resume" });
  assert.equal(resumed.status, 200, JSON.stringify(resumed.payload));
  first = resumed.payload.data as NuwaReadModel;
  const stopped = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/stop", { projectId: value.project.id, runId: first.run.runId, expectedRevision: first.run.revision, operationId: "n2c-scene-one-stop" });
  assert.equal(stopped.status, 200, JSON.stringify(stopped.payload));

  child.kill("SIGTERM");
  await once(child, "exit");
  child = null;
  const secondUnit = value.operations.createStoryUnit({ projectId: value.project.id, title: "钟楼后的第二场" });
  server = await start(value, true); child = server.child;
  const participants = value.characters.slice(1).map((character, index) => {
    const current = value.operations.readWorldObject({ projectId: value.project.id, objectId: character.id });
    return { id: current.id, revision: current.revisionToken, localGoal: index === 0 ? "回想上一场听到的钟声线索" : "确认自己是否知道钟声线索" };
  });
  const secondRequest = { projectId: value.project.id, participants, storyUnit: { id: secondUnit.id, revision: secondUnit.version }, goal: "在第二场依据各自实际听闻判断钟声线索。", operationId: "n2c-scene-two" };
  const setup = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/setup", secondRequest);
  assert.equal(setup.status, 200, JSON.stringify(setup.payload));
  const preview = setup.payload.data as { setup: { contextPreview: Array<{ actorId: string; memoryItems: Array<{ summary: string; source: { memoryId: string; speakerId: string; sourceRunId: string; sourceStepId: string; sceneId: string; sceneObservedAt: string; workVersionId: string; workRevision: string; validity: string } }> }> } };
  assert.equal(preview.setup.contextPreview[0]!.memoryItems.length, 1, "B receives the persisted heard record in the later scene");
  assert.equal(preview.setup.contextPreview[0]!.memoryItems[0]!.summary.includes(delivered.statement), true);
  assert.deepEqual(preview.setup.contextPreview[0]!.memoryItems[0]!.source, {
    memoryId: preview.setup.contextPreview[0]!.memoryItems[0]!.source.memoryId,
    speakerId: value.characters[0]!.id,
    sourceRunId: first.run.runId,
    sourceStepId: first.run.steps[0]!.stepId,
    sceneId: value.unit.id,
    sceneObservedAt: preview.setup.contextPreview[0]!.memoryItems[0]!.source.sceneObservedAt,
    workVersionId: preview.setup.contextPreview[0]!.memoryItems[0]!.source.workVersionId,
    workRevision: preview.setup.contextPreview[0]!.memoryItems[0]!.source.workRevision,
    validity: "active"
  });
  assert.equal(preview.setup.contextPreview[1]!.memoryItems.length, 0, "C remains unaware because no delivery named C");

  const secondCreate = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/create", { ...secondRequest, operationId: "n2c-scene-two-create" });
  assert.equal(secondCreate.status, 201, JSON.stringify(secondCreate.payload));
  const second = secondCreate.payload.data as NuwaReadModel;
  assert.equal(second.contextInspector.actors[0]!.profileBasis.core, "先保全退路", "B's author-owned profile basis remains connected to the recalled input");
  assert.equal(second.contextInspector.actors[0]!.memoryItems[0]!.source.sourceRunId, first.run.runId);
  assert.equal(second.contextInspector.actors[0]!.memoryItems[0]!.selectedByAttention, true, "the goal-relevant memory is selected by the bounded attention layer");
  const recalledStep = await postJson(server.baseUrl, "/__local/story-studio/nuwa-n1/step", { projectId: value.project.id, runId: second.run.runId, expectedRevision: second.run.revision, operationId: "n2c-scene-two-step" });
  assert.equal(recalledStep.status, 200, JSON.stringify(recalledStep.payload));
  const recalled = recalledStep.payload.data as NuwaReadModel;
  assert.equal(recalled.run.steps[0]!.actorId, value.characters[1]!.id);
  assert.equal(recalled.run.steps[0]!.contextEvidenceRefs.some((ref) => ref.visibility === "heard" && ref.summary.includes(delivered.statement)), true, "B's actual role-context tool receives the valid cross-scene memory");
});

type NuwaReadModel = {
  run: { runId: string; status: string; revision: number; dispatches: number; providerDispatches: number; scene: { storyUnitId: string }; pendingCue: { operationId: string; instruction: string } | null; steps: Array<{ stepId: string; actorId: string; speech: string | null; heardStatements: Array<{ recipientId: string; speakerId: string; statement: string; sourceStepId: string; sourceRevision: string }>; contextEvidenceRefs: Array<{ sourceId: string; summary: string; visibility: string }>; tool: { name: string } }>; provider: { providerCalls: number; kind?: string } };
  contextInspector: { actors: Array<{ actorId: string; localGoal: string; profileBasis: { core: string | null; boundaries: string | null; sourceRevision: string }; knowledgeItems: Array<{ id: string; summary: string; sourceRevision: string; visibility: string }>; beliefItems: Array<{ summary: string }>; memoryItems: Array<{ id: string; summary: string; source: { memoryId: string; speakerId: string; sourceRunId: string; sourceStepId: string; sceneId: string; sceneObservedAt: string; workVersionId: string; workRevision: string; validity: string }; selectedByAttention?: boolean }> }> };
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
    operations.createWorldObject({ projectId: project.id, type: "character", title: "林昭", body: "CANARY_AUTHOR_FUTURE\n林昭只知道亲眼看见的事。", profile: characterProfile("先求证再行动", "不拿同伴冒险换取线索", "CANARY_AUTHOR_PROFILE_SECRET") }),
    operations.createWorldObject({ projectId: project.id, type: "character", title: "阿芜", body: "CANARY_OTHER_CHARACTER_SECRET\n阿芜只听到传闻。", profile: characterProfile("先保全退路", "不独自追击未知目标", "CANARY_OTHER_PROFILE_SECRET") }),
    ...(options.threeActors ? [operations.createWorldObject({ projectId: project.id, type: "character", title: "丙", body: "丙没有听到桥上的私下谈话。" })] : [])
  ];
  const knownEvent = createVerifiedCanonEvent(operations, authorControl, project.id, { title: "钟声在桥上消失", body: "正式事件；正文不进入角色请求。", tags: [] });
  setKnowledgeSubject(operations.resolveProjectWorkspacePath({ projectId: project.id }), knownEvent.id, characters[0]!.id);
  const misledEvent = createVerifiedCanonEvent(operations, authorControl, project.id, { title: "潮声来自废塔", tags: [`知情：${characters[1]!.id}=被误导`], body: "误导内容不是世界真相，但属于阿芜当前持有的信念。" });
  setKnowledgeSubject(operations.resolveProjectWorkspacePath({ projectId: project.id }), misledEvent.id, characters[1]!.id, `知情：${characters[1]!.id}=被误导`);
  const draftEvent = operations.createWorldObject({ projectId: project.id, type: "event", title: "未经 Canon 验证的规划线索", status: "planned", body: "这份草案不得进入角色 Provider 上下文。" });
  setKnowledgeSubject(operations.resolveProjectWorkspacePath({ projectId: project.id }), draftEvent.id, characters[0]!.id);
  const unit = operations.createStoryUnit({ projectId: project.id, title: "旧桥钟声", linkedEntityIds: [knownEvent.id, misledEvent.id, draftEvent.id] });
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
    root, rootPath, stateFilePath, operations, authorControl, relations, sceneRelationType, project, otherProject, characters, otherCharacters, knownEvent, unit, otherUnit,
    request(operationId: string) {
      const current = characters.map((character) => operations.readWorldObject({ projectId: project.id, objectId: character.id }));
      const currentUnit = operations.readStoryUnit({ projectId: project.id, unitId: unit.id });
      const localGoals = ["核实钟声是否来自桥下", "确保退路不被切断", "确认自己是否听到对话"];
      return { projectId: project.id, participants: current.map((character, index) => ({ id: character.id, revision: character.revisionToken, localGoal: localGoals[index] })), storyUnit: { id: currentUnit.id, revision: currentUnit.version }, goal: "在旧桥前辨认钟声来源，但不得把传闻当成事实。", operationId };
    }
  };
}

function characterProfile(core: string, boundaries: string, secret: string) {
  return {
    objectType: "character" as const,
    fields: {
      character_core: { label: "角色核心", value: core, source: "author" as const, confidence: "high" as const, sourceAnchors: [] },
      boundaries: { label: "底线", value: boundaries, source: "author" as const, confidence: "high" as const, sourceAnchors: [] },
      private_notes: { label: "作者秘密", value: secret, source: "author" as const, confidence: "high" as const, sourceAnchors: [] }
    },
    authorConfirmed: true
  };
}

function createVerifiedCanonEvent(operations: ReturnType<typeof createStoryStudioWorkspaceOperations>, authorControl: ReturnType<typeof createStoryStudioAuthorControl>, projectId: string, input: { title: string; body: string; tags: string[] }) {
  const planning = operations.createWorldObject({ projectId, type: "event", title: input.title, body: input.body, tags: [...input.tags, "作者规划"], status: "planned" });
  const review = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
  const option = review.options[0]!;
  authorControl.chooseImpactRoute({ projectId, reviewId: review.id, optionId: option.id, action: "adopt" });
  const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: review.id });
  authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
  const canon = operations.listWorldObjects({ projectId, type: "event" })
    .map((event) => operations.readWorldObject({ projectId, objectId: event.id }))
    .find((event) => event.properties.source_change_set_id === changeSet.id);
  if (!canon) throw new Error(`Could not create verified Canon Event for ${input.title}.`);
  return canon;
}

function setKnowledgeSubject(workspacePath: string, eventId: string, subjectId: string, explicitStateTag?: string) {
  const target = findNoteById(workspacePath, eventId);
  if (!target) throw new Error(`Could not find workspace note ${eventId}.`);
  const source = readFileSync(target, "utf8");
  writeFileSync(target, source.replace(/^---\n([\s\S]*?)\n---/u, (_match, originalFrontmatter) => {
    const frontmatter = explicitStateTag
      ? originalFrontmatter.replace(/(^tags:\n(?:  - .*\n)*)/mu, (tags) => `${tags}  - ${explicitStateTag}\n`)
      : originalFrontmatter;
    return `---\n${frontmatter}\nknowledge_subjects:\n  - ${subjectId}\n---`;
  }), "utf8");
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
