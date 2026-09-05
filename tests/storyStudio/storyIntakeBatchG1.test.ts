import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { terminateChildProcess } from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";
import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("an explicit Story Intake scope reaches existing Owners, persists its receipt, and undoes after restart", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "story-intake-batch-g1-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "story-intake-batch-g1";
  const token = "story-intake-batch-g1-token";
  const port = 57_000 + (process.pid % 1_000);
  const base = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: base };
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "Story Intake 批次", folderSlug: projectId });
  const archivedLinzhao = operations.createWorldObject({ projectId, type: "character", title: "林昭", status: "draft" });
  operations.updateWorldObject({
    projectId,
    objectId: archivedLinzhao.id,
    expectedHash: archivedLinzhao.revisionToken,
    title: archivedLinzhao.title,
    status: "archived",
    tags: archivedLinzhao.tags,
    aliases: archivedLinzhao.aliases,
    body: archivedLinzhao.body
  });
  const seedEvent = operations.createWorldObject({ projectId, type: "event", title: "旧城夜航仍在运行", status: "planned", tags: ["Fixture"] });
  operations.createStoryUnit({ projectId, title: "已有主线", linkedEntityIds: [seedEvent.id] });
  const rootVersion = createCreationSourceSelectionPort({ operations }).createRoot(projectId);
  let server = startServer(rootPath, stateFilePath, token, port);
  try {
    await waitForServer(base);
    const opened = await post(`${base}/__local/story-studio/tianyi/session/open`, { projectId, operationId: "batch.open" }, headers);
    const sessionId = (await opened.json() as { data: { sessionId: string } }).data.sessionId;
    const text = "林昭在雾港灯塔亲眼看见守夜钟失踪。海风卷进钟楼，旧城航线在午夜同时中断。阿芜从码头工人口中得知此事，却误以为顾澜偷走了钟；顾澜当时正在封锁线外修理引航灯，没有人能证明她进入过钟楼。林昭决定先追查守夜钟的去向，再查明航线中断是否与钟声有关。第二天清晨，潮汐记录出现一段被人为改写的空白，旧码头与灯塔之间形成两条互相矛盾的目击路径。";
    const captured = await post(`${base}/__local/story-studio/tianyi/creative/capture`, { projectId, sessionId, operationId: "batch.capture", submissionId: "batch.source", text, collaborate: false }, headers);
    const source = (await captured.json() as { data: { source: unknown } }).data.source;
    const workVersionId = rootVersion.identity.workVersionId;
    const started = await post(`${base}/__local/story-studio/tianyi-agent/run/start`, { projectId, workVersionId, sessionId, task: "整理为故事候选", currentPage: "/tianyi", contextRequest: { storyIntake: { version: "tianyan-story-intake-request/v1", sourceRef: source } }, permissionProfile: "conservative", operationId: "batch.start" }, headers);
    const runId = (await started.json() as { data: { runId: string } }).data.runId;
    await post(`${base}/__local/story-studio/tianyi-agent/run/continue`, { projectId, workVersionId, sessionId, runId, operationId: "batch.context" }, headers);
    const streamed = await post(`${base}/__local/story-studio/tianyi-agent/run/stream`, { projectId, workVersionId, sessionId, runId, operationId: "batch.stream" }, { ...headers, accept: "application/x-ndjson" });
    const messages = (await streamed.text()).trim().split("\n").map((line) => JSON.parse(line));
    const run = messages.find((message) => message.type === "projection").data;
    const pick = (type: string) => run.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.type === type);
    const selected = run.storyIntakeEnvelope.candidates.filter((candidate: any) => candidate.type !== "item");
    assert.equal(selected.every(Boolean), true);
    const candidateIds = selected.map((candidate: any) => candidate.candidateId);

    await terminateChildProcess(server, { label: "Story Intake batch pre-preview restart", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    server = startServer(rootPath, stateFilePath, token, port);
    await waitForServer(base);

    const arrangementCrashOperationId = "batch.confirm.arrangement-create-crash";
    const arrangementCrashReceiptId = `story-intake-batch.${createHash("sha256").update(arrangementCrashOperationId, "utf8").digest("hex").slice(0, 32)}`;
    const arrangementCreateOperationId = "story-intake-batch.arrangement-create.interrupted";
    const arrangementTarget = operations.listStoryUnits({ projectId }).find((unit) => unit.title === "已有主线")!;
    const leakedArrangement = operations.createNarrativeArrangement({ projectId, workVersionId, narrativePathId: arrangementTarget.id, ownerStoryUnitId: arrangementTarget.id, expectedOwnerVersion: arrangementTarget.version, expectedRevision: 0, operationId: arrangementCreateOperationId, authorActionId: `${arrangementCreateOperationId}.author`, createdAt: new Date().toISOString() });
    assert.equal(leakedArrangement.conflict, false);
    const receiptDirectory = path.join(rootPath, projectId, ".world-os", "workspace", "story-intake-batch-receipts");
    await mkdir(receiptDirectory, { recursive: true });
    const arrangementCrashReceiptPath = path.join(receiptDirectory, `${arrangementCrashReceiptId}.json`);
    await writeFile(arrangementCrashReceiptPath, `${JSON.stringify({ version: "tianyan-story-intake-batch-receipt/v1", receiptId: arrangementCrashReceiptId, previewId: "story-intake-preview.arrangement-interrupted", projectId, workVersionId, sessionId, runId, envelopeId: run.storyIntakeEnvelope.envelopeId, candidateIds: [pick("narrative_path_membership").candidateId], omittedCandidateIds: [], status: "applying", items: [], intents: [], undo: { arrangement: { storyUnitId: arrangementTarget.id, beforeRevision: 0, receiptId: null, createdByBatch: true, createOperationId: arrangementCreateOperationId, insertOperationId: "story-intake-batch.arrangement-insert.not-reached" }, storyUnit: null, eventCandidateId: null }, recordedAt: new Date().toISOString(), undoneAt: null }, null, 2)}\n`, "utf8");
    const recoveredArrangementCrash = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("narrative_path_membership").candidateId], position: "end", previewId: "story-intake-preview.arrangement-interrupted", expectedBaseRevision: rootVersion.identity.currentRevision, operationId: arrangementCrashOperationId }, headers);
    assert.equal(recoveredArrangementCrash.status, 409);
    assert.equal(operations.readNarrativeArrangement({ projectId, workVersionId, narrativePathId: arrangementTarget.id }).arrangement, null, "an empty NarrativeArrangement created before a process crash must be discarded by its exact create operation");
    assert.equal(JSON.parse(await readFile(arrangementCrashReceiptPath, "utf8")).status, "failed-compensated");

    const position = "start";
    const previewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds, position }, headers);
    assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
    const preview = (await previewResponse.json() as { data: any }).data;
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.conflicts));
    assert.deepEqual(preview.candidateIds, candidateIds);
    assert.equal(preview.impact.events, 2, "one explicit author scope may contain multiple Event candidates");
    assert.equal(preview.impact.storyUnits, 1);
    assert.equal(preview.impact.narrativePlacements, 1);
    assert.equal(preview.impact.relations, 3, "every proposed link with both endpoints in scope must be visible in the structured impact");
    assert.equal(preview.storyUnit.position, "start");

    await terminateChildProcess(server, { label: "Story Intake batch post-preview restart", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    server = startServer(rootPath, stateFilePath, token, port);
    await waitForServer(base);

    const awu = run.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.proposedName === "阿芜");
    const relationDependencyPreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [awu.candidateId], position: "end" }, headers);
    const relationDependencyPreview = (await relationDependencyPreviewResponse.json() as { data: any }).data;
    assert.equal(relationDependencyPreview.canConfirm, false, "missing relation endpoints must block an accidental partial confirmation");
    assert.equal(relationDependencyPreview.conflicts.some((message: string) => message.includes("纳入所需候选")), true);
    const excludedRelationKeys = awu.proposedRelations.map((link: any, index: number) => `${awu.candidateId}:${link.relation}:${link.targetCandidateId}:${index}`);
    const excludedRelationPreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [awu.candidateId], excludedRelationKeys, position: "end" }, headers);
    const excludedRelationPreview = (await excludedRelationPreviewResponse.json() as { data: any }).data;
    assert.equal(excludedRelationPreview.canConfirm, true, "an explicit relation exclusion may unblock the selected candidate without smuggling endpoints into scope");
    assert.equal(excludedRelationPreview.impact.relations, 0);

    const objectsBeforeRejectedConfirm = operations.listWorldObjects({ projectId }).length;
    const rejectedConfirm = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds, position, previewId: `${preview.previewId}.tampered`, expectedBaseRevision: preview.baseVersion.revision, operationId: "batch.confirm.tampered" }, headers);
    assert.notEqual(rejectedConfirm.status, 200);
    assert.equal(operations.listWorldObjects({ projectId }).length, objectsBeforeRejectedConfirm, "an invalid preview must fail before any story write");

    const partialScope = [pick("item"), pick("location")];
    assert.equal(partialScope.every(Boolean), true);
    const partialIds = partialScope.map((candidate: any) => candidate.candidateId);
    const partialPreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: partialIds, position: "end" }, headers);
    const partialPreview = (await partialPreviewResponse.json() as { data: any }).data;
    assert.equal(partialPreview.canConfirm, true);
    const duplicateLocation = operations.createWorldObject({ projectId, type: "location", title: pick("location").proposedName, status: "draft" });
    const duplicateAwarePreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: partialIds, position: "end" }, headers);
    const duplicateAwarePreview = (await duplicateAwarePreviewResponse.json() as { data: any }).data;
    assert.equal(duplicateAwarePreview.canConfirm, false, "an existing same-name entity must be reported by structured impact before confirmation starts");
    assert.equal(duplicateAwarePreview.conflicts.some((message: string) => message.includes(`${pick("location").proposedName}：当前作品已有同名地点`)), true);
    const failedPartial = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds: partialIds, position: "end", previewId: partialPreview.previewId, expectedBaseRevision: partialPreview.baseVersion.revision, operationId: "batch.confirm.compensated" }, headers);
    assert.notEqual(failedPartial.status, 200);
    const recoveredRunResponse = await post(`${base}/__local/story-studio/tianyi-agent/run/recover`, { projectId, workVersionId, sessionId, runId }, headers);
    const recoveredRun = (await recoveredRunResponse.json() as { data: any }).data;
    assert.equal(recoveredRun.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.candidateId === partialIds[0]).lifecycleStatus, "pending-review", "an earlier Owner write must be compensated when a later Owner rejects the batch");
    assert.equal(operations.listWorldObjects({ projectId, type: "item" }).filter((object) => object.title === pick("item").proposedName && object.status !== "archived").length, 0);
    const rootAfterFailedBatch = createCreationSourceSelectionPort({ operations }).resolveRootWorkVersion(projectId)!;
    assert.equal(recoveredRun.storyIntakeEnvelope.baseVersion.revision, rootAfterFailedBatch.identity.currentRevision, "a fully compensated failed batch must revalidate the retained Envelope so the author can continue without a new Provider run");

    const locationBinding = [{ candidateId: pick("location").candidateId, targetObjectId: duplicateLocation.id }];
    const identityBindingPreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("location").candidateId], entityBindings: locationBinding, position: "end" }, headers);
    const identityBindingPreview = (await identityBindingPreviewResponse.json() as { data: any }).data;
    assert.equal(identityBindingPreview.canConfirm, true, "the author may explicitly bind an entity candidate to one existing same-type object");
    assert.equal(identityBindingPreview.entityBindings[0].targetObjectId, duplicateLocation.id);
    const identityBindingConfirmResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("location").candidateId], entityBindings: locationBinding, position: "end", previewId: identityBindingPreview.previewId, expectedBaseRevision: identityBindingPreview.baseVersion.revision, operationId: "batch.confirm.identity-binding" }, headers);
    assert.equal(identityBindingConfirmResponse.status, 200, await identityBindingConfirmResponse.clone().text());
    const identityBindingConfirmation = (await identityBindingConfirmResponse.json() as { data: any }).data;
    assert.equal(identityBindingConfirmation.receipt.items[0].targetId, duplicateLocation.id);
    assert.equal(operations.listWorldObjects({ projectId, type: "location" }).filter((object) => object.title === pick("location").proposedName && object.status !== "archived").length, 1, "identity binding must not create a second repository object");
    const identityBindingUndoResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/undo`, { projectId, workVersionId, sessionId, runId, receiptId: identityBindingConfirmation.receipt.receiptId, operationId: "batch.undo.identity-binding" }, headers);
    assert.equal(identityBindingUndoResponse.status, 200, await identityBindingUndoResponse.clone().text());
    assert.equal(operations.readWorldObject({ projectId, objectId: duplicateLocation.id }).status, "draft", "undoing an identity link must not mutate the existing object");

    const incompleteOperationId = "batch.confirm.incomplete-intent-conflict";
    const incompleteReceiptId = `story-intake-batch.${createHash("sha256").update(incompleteOperationId, "utf8").digest("hex").slice(0, 32)}`;
    const incompleteReceiptPath = path.join(receiptDirectory, `${incompleteReceiptId}.json`);
    await writeFile(incompleteReceiptPath, `${JSON.stringify({
      version: "tianyan-story-intake-batch-receipt/v1",
      receiptId: incompleteReceiptId,
      previewId: "story-intake-preview.incomplete-intent-conflict",
      projectId,
      workVersionId,
      sessionId,
      runId,
      envelopeId: run.storyIntakeEnvelope.envelopeId,
      candidateIds: [pick("location").candidateId],
      omittedCandidateIds: candidateIds.filter((candidateId: string) => candidateId !== pick("location").candidateId),
      status: "recovery-required",
      items: [],
      intents: [{ owner: "story-workspace-object", candidateId: pick("location").candidateId, objectType: "location", title: pick("location").proposedName, proposalId: "agent-proposal.not-applied", operationId: "story-intake-batch.entity.not-applied", targetId: duplicateLocation.id, expectedObject: { status: "active", tags: ["天意 Story Intake"], aliases: [], body: "未发生的预写目标" }, completed: false }],
      undo: { arrangement: null, storyUnit: null, eventCandidateIds: [], relations: [] },
      recordedAt: new Date().toISOString(),
      undoneAt: null
    }, null, 2)}\n`, "utf8");
    const recoverablePreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("location").candidateId], position: "end" }, headers);
    const recoverablePreview = (await recoverablePreviewResponse.json() as { data: any }).data;
    assert.equal(recoverablePreview.activeReceipt.status, "recovery-required", "a failed compensation must remain reachable from the exact candidate scope after refresh");
    const recoveredIncomplete = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/undo`, { projectId, workVersionId, sessionId, runId, receiptId: incompleteReceiptId, operationId: `${incompleteOperationId}.recover` }, headers);
    assert.equal(recoveredIncomplete.status, 200, await recoveredIncomplete.clone().text());
    assert.equal(operations.readWorldObject({ projectId, objectId: duplicateLocation.id }).status, "draft", "compensation must not archive a conflicting object when the corresponding Owner application was never recorded");
    assert.equal(JSON.parse(await readFile(incompleteReceiptPath, "utf8")).status, "undone");
    operations.updateWorldObject({ projectId, objectId: duplicateLocation.id, expectedHash: duplicateLocation.revisionToken, title: duplicateLocation.title, status: "archived", tags: duplicateLocation.tags, aliases: duplicateLocation.aliases, body: duplicateLocation.body });

    const crashOperationId = "batch.confirm.crash-recovery";
    const crashReceiptId = `story-intake-batch.${createHash("sha256").update(crashOperationId, "utf8").digest("hex").slice(0, 32)}`;
    const interruptedEntityOperationId = "story-intake-batch.entity.interrupted";
    const confirmedBeforeReceiptItem = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/candidate/decision`, { projectId, workVersionId, sessionId, runId, candidateId: pick("item").candidateId, lifecycleStatus: "confirmed", operationId: interruptedEntityOperationId }, headers);
    assert.equal(confirmedBeforeReceiptItem.status, 200, await confirmedBeforeReceiptItem.clone().text());
    const interruptedRun = (await confirmedBeforeReceiptItem.json() as { data: any }).data;
    const interruptedCandidate = interruptedRun.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.candidateId === pick("item").candidateId);
    assert.equal(interruptedCandidate.lifecycleStatus, "confirmed");
    const leakedAfterOwnerWrite = operations.readWorldObject({ projectId, objectId: interruptedCandidate.formalApplication.objectId });
    const concurrentSeed = operations.createWorldObject({ projectId, type: "item", title: "并发对象临时名", status: "active" });
    const concurrentUpdate = operations.updateWorldObject({ projectId, objectId: concurrentSeed.id, expectedHash: concurrentSeed.revisionToken, title: pick("item").proposedName, status: "active", tags: concurrentSeed.tags, aliases: concurrentSeed.aliases, body: concurrentSeed.body });
    assert.equal(concurrentUpdate.conflict, false);
    const concurrentSameName = concurrentUpdate.object;
    const crashReceiptPath = path.join(receiptDirectory, `${crashReceiptId}.json`);
    await writeFile(crashReceiptPath, `${JSON.stringify({
      version: "tianyan-story-intake-batch-receipt/v1",
      receiptId: crashReceiptId,
      previewId: "story-intake-preview.interrupted",
      projectId,
      workVersionId,
      sessionId,
      runId,
      envelopeId: run.storyIntakeEnvelope.envelopeId,
      candidateIds: [pick("item").candidateId],
      omittedCandidateIds: candidateIds.filter((candidateId: string) => candidateId !== pick("item").candidateId),
      status: "applying",
      items: [],
      intents: [{ owner: "story-workspace-object", candidateId: pick("item").candidateId, objectType: "item", title: pick("item").proposedName, proposalId: interruptedCandidate.formalApplication.proposalId, operationId: interruptedEntityOperationId, targetId: leakedAfterOwnerWrite.id, expectedObject: { status: "active", tags: ["天意 Story Intake"], aliases: [], body: `# ${pick("item").proposedName}\n\n${pick("item").summary}\n\n## 来源证据\n\n${pick("item").sourceEvidence.excerpt}` }, completed: false }],
      undo: { arrangement: null, storyUnit: null, eventCandidateId: null },
      recordedAt: new Date().toISOString(),
      undoneAt: null
    }, null, 2)}\n`, "utf8");
    const recoveredCrash = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("item").candidateId], position: "end", previewId: "story-intake-preview.interrupted", expectedBaseRevision: preview.baseVersion.revision, operationId: crashOperationId }, headers);
    assert.equal(recoveredCrash.status, 409, "reusing an interrupted operation must recover it instead of resuming unknown writes");
    assert.equal(operations.readWorldObject({ projectId, objectId: leakedAfterOwnerWrite.id }).status, "archived", "an Owner write completed before a process crash must be found from the durable intent and compensated");
    assert.equal(operations.readWorldObject({ projectId, objectId: concurrentSameName.id }).status, "active", "recovery must not archive a concurrent same-name object outside the exact prewritten target");
    assert.equal(JSON.parse(await readFile(crashReceiptPath, "utf8")).status, "failed-compensated", "crash recovery must persist a terminal receipt state");
    operations.updateWorldObject({ projectId, objectId: concurrentSameName.id, expectedHash: concurrentSameName.revisionToken, title: concurrentSameName.title, status: "archived", tags: concurrentSameName.tags, aliases: concurrentSameName.aliases, body: concurrentSameName.body });
    const recoveredAfterEntityCrash = await post(`${base}/__local/story-studio/tianyi-agent/run/recover`, { projectId, workVersionId, sessionId, runId }, headers);
    const recoveredEntityRun = (await recoveredAfterEntityCrash.json() as { data: any }).data;
    const recoveredEntityCandidate = recoveredEntityRun.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.candidateId === pick("item").candidateId);
    assert.equal(recoveredEntityCandidate.lifecycleStatus, "pending-review", "intent recovery must restore the persisted Envelope lifecycle even when receipt.items was never written");
    assert.equal(recoveredEntityCandidate.formalApplication, null);

    const confirmResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds, position, previewId: preview.previewId, expectedBaseRevision: preview.baseVersion.revision, operationId: "batch.confirm" }, headers);
    assert.equal(confirmResponse.status, 200, await confirmResponse.clone().text());
    const confirmed = (await confirmResponse.json() as { data: any }).data;
    assert.equal(confirmed.receipt.status, "active");
    assert.equal(confirmed.receipt.position, "start", "the active receipt must retain the applied narrative position across refresh");
    assert.equal(confirmed.receipt.storyUnit.title, "已有主线", "bounded exploration must read its formal Story Unit snapshot from the active receipt");
    assert.deepEqual(confirmed.receipt.candidateIds, candidateIds);
    assert.equal(confirmed.receipt.omittedCandidateIds.length, run.storyIntakeEnvelope.candidates.length - candidateIds.length);
    assert.equal(confirmed.receipt.items.some((item: any) => item.owner === "story-studio-event-owner"), true);
    assert.equal(confirmed.receipt.items.some((item: any) => item.owner === "story-unit-owner"), true);
    assert.equal(confirmed.receipt.items.some((item: any) => item.owner === "narrative-arrangement-owner"), true);
    assert.equal(confirmed.receipt.items.some((item: any) => item.owner === "relation-owner"), true, "selected links must enter the sole Relation owner as unresolved candidates");
    const relationBeforeUndo = (await (await fetch(`${base}/__local/story-studio/relations?projectId=${projectId}&includeArchived=true`)).json() as { data: { relations: any[] } }).data.relations.find((relation: any) => relation.provenance?.sourceRef?.includes(run.storyIntakeEnvelope.envelopeId));
    assert.equal(relationBeforeUndo.reviewState, "candidate");
    assert.equal(confirmed.run.storyIntakeEnvelope.candidates.filter((candidate: any) => candidate.lifecycleStatus === "confirmed").length, 8);
    assert.equal(confirmed.run.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.type === "unresolved").lifecycleStatus, "pending-review");
    const refreshWithLostRelationState = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds, excludedRelationKeys: [excludedRelationKeys[0]], position }, headers);
    const refreshedActiveReceipt = (await refreshWithLostRelationState.json() as { data: any }).data.activeReceipt;
    assert.equal(refreshedActiveReceipt.receiptId, confirmed.receipt.receiptId, "refresh must recover the active batch receipt before restoring its exact relation exclusions");
    assert.deepEqual(refreshedActiveReceipt.excludedRelationKeys, [], "the persisted receipt remains the authority for the exact submitted relation scope");
    const unit = operations.listStoryUnits({ projectId }).find((candidate) => candidate.title === "已有主线");
    assert.ok(unit);
    assert.equal(unit.sourceRefs.some((sourceRef) => sourceRef.entityId === run.storyIntakeEnvelope.envelopeId), true);
    const arrangement = operations.readNarrativeArrangement({ projectId, workVersionId, narrativePathId: unit.id });
    assert.equal(arrangement.projection.placed.length, 2, "the selected Event candidates share one Story Unit arrangement without becoming duplicate repositories");
    const activeReceiptLog = JSON.parse(await readFile(path.join(receiptDirectory, `${confirmed.receipt.receiptId}.json`), "utf8"));
    assert.equal(activeReceiptLog.undo.arrangement.createdByBatch, true, "insert completion must retain the create-before-write recovery identity");
    assert.equal(activeReceiptLog.undo.arrangement.createOperationId.startsWith("story-intake-batch.arrangement-create."), true);
    assert.equal(activeReceiptLog.undo.arrangement.insertOperationIds.length, 2);
    assert.equal(activeReceiptLog.undo.arrangement.insertOperationIds.every((operationId: string) => operationId.startsWith("story-intake-batch.arrangement-insert.")), true);

    await terminateChildProcess(server, { label: "Story Intake batch server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 });
    server = startServer(rootPath, stateFilePath, token, port);
    await waitForServer(base);
    const activeReceiptPath = path.join(receiptDirectory, `${confirmed.receipt.receiptId}.json`);
    const exactActiveReceipt = JSON.parse(await readFile(activeReceiptPath, "utf8"));
    await writeFile(activeReceiptPath, `${JSON.stringify({ ...exactActiveReceipt, resultBaseRevision: exactActiveReceipt.resultBaseRevision - 1 }, null, 2)}\n`, "utf8");
    const staleUndo = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/undo`, { projectId, workVersionId, sessionId, runId, receiptId: confirmed.receipt.receiptId, operationId: "batch.undo.stale" }, headers);
    assert.equal(staleUndo.status, 409, "undo must stop before touching an exact receipt when the current WorkVersion no longer matches its result revision");
    await writeFile(activeReceiptPath, `${JSON.stringify(exactActiveReceipt, null, 2)}\n`, "utf8");
    const undoResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/undo`, { projectId, workVersionId, sessionId, runId, receiptId: confirmed.receipt.receiptId, operationId: "batch.undo" }, headers);
    assert.equal(undoResponse.status, 200, await undoResponse.clone().text());
    const undone = (await undoResponse.json() as { data: any }).data;
    assert.equal(undone.receipt.status, "undone");
    assert.equal(undone.run.storyIntakeEnvelope.candidates.filter((candidate: any) => candidate.lifecycleStatus === "confirmed").length, 0);
    const restoredUnit = operations.readStoryUnit({ projectId, unitId: unit.id });
    assert.equal(restoredUnit.lifecycle, "draft");
    assert.equal(restoredUnit.sourceRefs.some((sourceRef) => sourceRef.entityId === run.storyIntakeEnvelope.envelopeId), false);
    assert.equal(operations.readNarrativeArrangement({ projectId, workVersionId, narrativePathId: unit.id }).arrangement, null, "undo must discard an empty Arrangement that this batch created after rolling back its Placement");
    const relationAfterUndo = (await (await fetch(`${base}/__local/story-studio/relations?projectId=${projectId}&includeArchived=true`)).json() as { data: { relations: any[] } }).data.relations.find((relation: any) => relation.relationId === relationBeforeUndo.relationId);
    assert.equal(relationAfterUndo.reviewState, "rejected", "undo must compensate the exact unresolved Relation candidate");
    assert.equal(relationAfterUndo.archived, true);
    const rootAfterUndo = createCreationSourceSelectionPort({ operations }).resolveRootWorkVersion(projectId)!;
    assert.equal(undone.run.storyIntakeEnvelope.baseVersion.revision, rootAfterUndo.identity.currentRevision, "exact compensation must revalidate the same retained candidate envelope against the new current root");
    const remainingCandidate = run.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.type === "item");
    const continuationPreview = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [remainingCandidate.candidateId], position: "end" }, headers);
    const continuation = (await continuationPreview.json() as { data: any }).data;
    assert.equal(continuation.canConfirm, true, "after undo the author can continue with a remaining candidate without calling the Provider or duplicating the envelope");
    const replayedEventPreviewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("event").candidateId], position: "end" }, headers);
    const replayedEventPreview = (await replayedEventPreviewResponse.json() as { data: any }).data;
    assert.equal(replayedEventPreview.canConfirm, true, "after exact compensation the original Event candidate can be reviewed again without another Provider extraction");
    const readoptResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds: [pick("event").candidateId], excludedRelationKeys: [], position: "end", previewId: replayedEventPreview.previewId, expectedBaseRevision: replayedEventPreview.baseVersion.revision, operationId: "batch.readopt.original-event" }, headers);
    assert.equal(readoptResponse.status, 200, await readoptResponse.clone().text());
    const readopted = (await readoptResponse.json() as { data: any }).data;
    assert.equal(readopted.receipt.status, "active");
    assert.equal(readopted.receipt.items[0].targetId, confirmed.receipt.items.find((item: any) => item.candidateId === pick("event").candidateId).targetId, "re-adoption reuses the Event Owner identity instead of creating a duplicate Event");
  } finally {
    await terminateChildProcess(server, { label: "Story Intake batch server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 }).catch(() => undefined);
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("Agent proposal creation rejects a canonical object id already declared at another path", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "story-intake-id-collision-g1-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "story-intake-id-collision-g1";
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  try {
    operations.createProject({ title: "Story Intake ID 冲突", folderSlug: projectId });
    const targetObjectId = "item.agent-proposal-c0287cecaeb04e332aafd722";
    const preexisting = operations.createWorldObject({ projectId, type: "item", title: targetObjectId.slice("item.".length), status: "active" });
    assert.equal(preexisting.id, targetObjectId);
    assert.notEqual(preexisting.relativeId, `world/items/${targetObjectId}.md`);

    const attempt = operations.createWorldObjectFromAgentProposalOnce({
      projectId,
      targetObjectId,
      objectType: "item",
      proposalId: "agent-proposal.c0287cecaeb04e332aafd722",
      proposalRevision: 1,
      operationId: "story-intake-batch.entity.id-collision",
      title: "守夜钟",
      status: "active",
      tags: ["天意 Story Intake"],
      aliases: [],
      body: "# 守夜钟\n\n失踪物品。"
    });

    assert.equal(attempt.conflict, true);
    assert.equal(attempt.object, null);
    assert.equal(operations.listWorldObjects({ projectId, type: "item" }).filter((object) => object.id === targetObjectId).length, 1, "the proposal Owner must not create a second Markdown object with the same canonical id");
    assert.equal(operations.readWorldObject({ projectId, objectId: targetObjectId }).relativeId, preexisting.relativeId);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("an omitted or missing relation candidate endpoint can bind one existing project object, persist the exact scope, and undo that exact Relation Owner record", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "story-intake-existing-relation-binding-g1-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "story-intake-existing-relation-binding-g1";
  const token = "story-intake-existing-relation-binding-g1-token";
  const port = 58_000 + (process.pid % 1_000);
  const base = `http://127.0.0.1:${port}`;
  const headers = { "content-type": "application/json", "x-world-os-local-control-token": token, origin: base };
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "Story Intake 已有对象关系绑定", folderSlug: projectId });
  const seedEvent = operations.createWorldObject({ projectId, type: "event", title: "既有主线事件", status: "planned" });
  operations.createStoryUnit({ projectId, title: "已有主线", linkedEntityIds: [seedEvent.id] });
  const existingGulan = operations.createWorldObject({ projectId, type: "character", title: "既有引航人", status: "active" });
  const rootVersion = createCreationSourceSelectionPort({ operations }).createRoot(projectId);
  let server: ReturnType<typeof startServer> | undefined;
  try {
    server = startServer(rootPath, stateFilePath, token, port);
    await waitForServer(base);
    const opened = await post(`${base}/__local/story-studio/tianyi/session/open`, { projectId, operationId: "existing-binding.open" }, headers);
    const sessionId = (await opened.json() as { data: { sessionId: string } }).data.sessionId;
    const captured = await post(`${base}/__local/story-studio/tianyi/creative/capture`, { projectId, sessionId, operationId: "existing-binding.capture", submissionId: "existing-binding.source", text: "林昭在雾港灯塔亲眼看见守夜钟失踪。海风卷进钟楼，旧城航线在午夜同时中断。阿芜从码头工人口中得知此事，却误以为顾澜偷走了钟；顾澜当时正在封锁线外修理引航灯，没有人能证明她进入过钟楼。林昭决定先追查守夜钟的去向，再查明航线中断是否与钟声有关。第二天清晨，潮汐记录出现一段被人为改写的空白，旧码头与灯塔之间形成两条互相矛盾的目击路径。", collaborate: false }, headers);
    const source = (await captured.json() as { data: { source: unknown } }).data.source;
    const workVersionId = rootVersion.identity.workVersionId;
    const started = await post(`${base}/__local/story-studio/tianyi-agent/run/start`, { projectId, workVersionId, sessionId, task: "整理为故事候选", currentPage: "/tianyi", contextRequest: { storyIntake: { version: "tianyan-story-intake-request/v1", sourceRef: source } }, permissionProfile: "conservative", operationId: "existing-binding.start" }, headers);
    const runId = (await started.json() as { data: { runId: string } }).data.runId;
    await post(`${base}/__local/story-studio/tianyi-agent/run/continue`, { projectId, workVersionId, sessionId, runId, operationId: "existing-binding.context" }, headers);
    const streamed = await post(`${base}/__local/story-studio/tianyi-agent/run/stream`, { projectId, workVersionId, sessionId, runId, operationId: "existing-binding.stream" }, { ...headers, accept: "application/x-ndjson" });
    const run = (await streamed.text()).trim().split("\n").map((line) => JSON.parse(line)).find((message) => message.type === "projection").data;
    const awu = run.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.proposedName === "阿芜");
    const gulan = run.storyIntakeEnvelope.candidates.find((candidate: any) => candidate.proposedName === "顾澜");
    assert.ok(awu && gulan);
    const relationIndex = awu.proposedRelations.findIndex((link: any) => link.targetCandidateId === gulan.candidateId);
    assert.notEqual(relationIndex, -1, "the fixture must expose an omitted candidate endpoint for binding recovery");
    const relation = awu.proposedRelations[relationIndex];
    const relationKey = `${awu.candidateId}:${relation.relation}:${relation.targetCandidateId}:${relationIndex}`;
    const excludedRelationKeys = awu.proposedRelations.map((link: any, index: number) => `${awu.candidateId}:${link.relation}:${link.targetCandidateId}:${index}`).filter((key: string) => key !== relationKey);
    const relationBindings = [{ relationKey, targetObjectId: existingGulan.id }];

    const invalidBinding = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [awu.candidateId], excludedRelationKeys, relationBindings: [{ relationKey, targetObjectId: "character.not-in-current-project" }], position: "end" }, headers);
    assert.notEqual(invalidBinding.status, 200, "cross-project or missing object ids must fail before previewing a write");
    const previewResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/preview`, { projectId, workVersionId, sessionId, runId, candidateIds: [awu.candidateId], excludedRelationKeys, relationBindings, position: "end" }, headers);
    assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
    const preview = (await previewResponse.json() as { data: any }).data;
    assert.equal(preview.canConfirm, true, JSON.stringify(preview.conflicts));
    assert.deepEqual(preview.relationBindings, [{ relationKey, targetObjectId: existingGulan.id, targetObjectTitle: "既有引航人", targetObjectType: "character", targetObjectRevision: existingGulan.revisionToken }]);

    const confirmResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/confirm`, { projectId, workVersionId, sessionId, runId, candidateIds: [awu.candidateId], excludedRelationKeys, relationBindings, position: "end", previewId: preview.previewId, expectedBaseRevision: preview.baseVersion.revision, operationId: "existing-binding.confirm" }, headers);
    assert.equal(confirmResponse.status, 200, await confirmResponse.clone().text());
    const confirmed = (await confirmResponse.json() as { data: any }).data;
    assert.deepEqual(confirmed.receipt.relationBindings, preview.relationBindings, "the receipt must preserve the author-selected existing-object binding scope");
    const boundRelationItem = confirmed.receipt.items.find((item: any) => item.owner === "relation-owner");
    const persistedRelation = (await (await fetch(`${base}/__local/story-studio/relations?projectId=${projectId}&includeArchived=true`)).json() as { data: { relations: any[] } }).data.relations.find((item: any) => item.relationId === boundRelationItem.targetId);
    assert.equal(persistedRelation.targetObjectId, existingGulan.id, "the sole Relation Owner must receive the existing object id, not a copied candidate object");

    const undoResponse = await post(`${base}/__local/story-studio/tianyi-agent/story-intake/batch/undo`, { projectId, workVersionId, sessionId, runId, receiptId: confirmed.receipt.receiptId, operationId: "existing-binding.undo" }, headers);
    assert.equal(undoResponse.status, 200, await undoResponse.clone().text());
    const compensatedRelation = (await (await fetch(`${base}/__local/story-studio/relations?projectId=${projectId}&includeArchived=true`)).json() as { data: { relations: any[] } }).data.relations.find((item: any) => item.relationId === boundRelationItem.targetId);
    assert.equal(compensatedRelation.reviewState, "rejected");
    assert.equal(compensatedRelation.archived, true, "undo must compensate only the relation created through the stored binding scope");
  } finally {
    await terminateChildProcess(server, { label: "Story Intake existing relation binding server", gracefulTimeoutMs: 2_000, forceTimeoutMs: 2_000 }).catch(() => undefined);
    await rm(rootPath, { recursive: true, force: true });
  }
});

function startServer(rootPath: string, stateFilePath: string, token: string, port: number) {
  return spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token, PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY", TIANYAN_AGENT_FAKE_PROVIDER_STREAM: "1", TIANYAN_CREDENTIAL_BACKEND: "LOCAL_FILE_DEVELOPMENT_ONLY", TIANYAN_PROVIDER_APP_DATA_ROOT: path.join(rootPath, "provider-app"), TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1" }, stdio: process.env.TIANYAN_G1_TEST_DEBUG === "1" ? "inherit" : "ignore" });
}
async function post(url: string, body: unknown, headers: Record<string, string>) { return fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); }
async function waitForServer(base: string) { const deadline = Date.now() + 8_000; while (Date.now() < deadline) { try { if ((await fetch(`${base}/__local/story-studio/bootstrap`)).ok) return; } catch { /* bounded retry */ } await new Promise((resolve) => setTimeout(resolve, 40)); } throw new Error("Story Intake batch test server did not start."); }
