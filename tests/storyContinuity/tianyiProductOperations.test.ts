import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createStoryStudioEventReference } from "../../src/storyContracts/storyStudioEventReference.ts";
import { initializePersona, initializeRelationshipPolicy } from "../../src/storyContinuity/index.ts";

const RECORDED_AT = "2026-07-14T19:00:00.000Z";

test("identity preview is read-only and the first explicit question initializes durable identity", async () => {
  const fixture = await createFixture(false);
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const before = await listFiles(fixture.rootPath);
    const identity = await tianyi.getTianyiIdentity({ projectId: fixture.projectId });
    assert.equal(identity.persisted, false);
    assert.equal(identity.runtime.adapterId, "tianyi.fixture");
    assert.deepEqual(await listFiles(fixture.rootPath), before);

    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.identity-open" });
    const response = await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.identity-question", request: { boundedAction: "fixture.current" }, contextRequest: fixture.contextRequest });
    assert.equal(response.status, "current");
    assert.equal((await tianyi.getTianyiIdentity({ projectId: fixture.projectId })).persisted, true);
  } finally {
    await makeWritable(fixture.rootPath);
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("local Tianyi resolves an event only from a version-bound server reference", async () => {
  const fixture = await createFixture();
  try {
    const event = fixture.workspace.createPlanningEvent({
      projectId: fixture.projectId,
      title: "钟楼封锁",
      body: "SERVER_EVENT_BODY：钟楼封锁尚未进入正史，也不能修改时间线。"
    });
    const reference = createStoryStudioEventReference({
      projectId: fixture.projectId,
      event,
      requestedUse: "constraint"
    });
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const eventContext = {
      productMode: "world" as const,
      activeOwner: { kind: "world-object" as const, id: event.id },
      selection: { documentId: null, objectId: event.id, timelinePointId: null },
      sourceRefs: [],
      memorySelections: [],
      enabledSkillRefs: [],
      eventRefs: [reference]
    };

    const projection = await tianyi.getTianyiContextProjection({ projectId: fixture.projectId, contextRequest: eventContext });
    assert.equal(projection.sources.length, 1);
    assert.equal(projection.sources[0]?.hash, event.revisionToken);
    assert.notEqual(projection.sources[0]?.id, event.id, "projection identity must remain an internal server alias");

    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.event-reference-open" });
    const result = await tianyi.runTianyiQuestion({
      projectId: fixture.projectId,
      sessionId: opened.sessionId,
      operationId: "operation.event-reference-question",
      request: { boundedAction: "fixture.current" },
      contextRequest: eventContext
    });
    assert.equal(result.status, "current");
    assert.equal(result.question?.receipt.sources[0]?.hash, event.revisionToken);

    await assert.rejects(
      () => tianyi.getTianyiContextProjection({
        projectId: fixture.projectId,
        contextRequest: (() => {
          const { eventRefs: _eventRefs, ...legacyEventContext } = eventContext;
          return legacyEventContext;
        })()
      }),
      /explicit Story Studio event reference/u
    );

    const changed = fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: event.id,
      expectedHash: event.revisionToken,
      writeMarkdown: true,
      writePresentation: false,
      title: event.title,
      status: event.status,
      tags: event.tags,
      aliases: event.aliases,
      body: "SERVER_EVENT_BODY：钟楼封锁的边界已修改。",
      card: event.card
    }).object;
    assert.notEqual(changed.revisionToken, reference.revisionToken);
    await assert.rejects(
      () => tianyi.getTianyiContextProjection({ projectId: fixture.projectId, contextRequest: eventContext }),
      /event reference rejected: .*stale/u
    );
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("grounded provider answer reuses Session and Receipt owners with reference-only sources and zero Story writes", async () => {
  const fixture = await createFixture();
  try {
    const character = fixture.workspace.createWorldObject({ projectId: fixture.projectId, type: "character", title: "林岚" });
    const updated = fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: character.id,
      expectedHash: character.revisionToken,
      presentationExpectedHash: character.card.revisionToken,
      writeMarkdown: true,
      writePresentation: false,
      title: character.title,
      status: "committed",
      tags: ["假背叛"],
      aliases: [],
      body: "林岚与顾寒共同确认：背叛只是双方同意的假背叛计划。",
      card: character.card
    }).object;
    const objectRef = { version: "story-tianyi-object-context-ref/v1" as const, ownerType: "markdown-object" as const, objectType: "character" as const, stableId: updated.id, projectId: fixture.projectId, ownerId: updated.id, contentHash: updated.revisionToken, state: "current" as const, inclusion: "included" as const, label: updated.title };
    const sourceRef = `${fixture.projectId}:markdown-object:${updated.id}:character:${updated.id}`;
    const gateway = fakeGroundedGateway((messages, call) => {
      if (call === 1) return { summary: "invalid first attempt" };
      const included = messages[0].content.includes(`includedSources must equal exactly: [\"${sourceRef}\"]`);
      return included ? {
        summary: "林岚的背叛是双方已确认的假背叛计划。",
        claims: [{ statement: "假背叛计划已经由林岚与顾寒确认。", status: "fact", sourceRefs: [sourceRef], uncertaintyReason: null }],
        status: "fact",
        sourceRefs: [sourceRef],
        uncertaintyReason: null,
        includedSources: [sourceRef],
        excludedSources: []
      } : {
        summary: "现有证据不足以确认背叛原因。",
        claims: [{ statement: "无法确认背叛原因。", status: "unknown", sourceRefs: [], uncertaintyReason: "必要人物资料未包含。" }],
        status: "unknown",
        sourceRefs: [],
        uncertaintyReason: "必要人物资料未包含。",
        includedSources: [],
        excludedSources: [{ sourceRef, reason: "STALE_REFERENCE" }]
      };
    });
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT, modelGateway: gateway });
    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.grounded-open" });
    const beforeFiles = await listFiles(fixture.rootPath);
    const beforeHash = fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: updated.id }).revisionToken;
    const result = await tianyi.runTianyiGroundedAnswer!({
      operationId: "operation.grounded-answer",
      submissionId: "submission.grounded-answer",
      profileId: "siliconflow-test",
      question: "林岚为什么背叛顾寒？",
      contextRequest: { version: "story-tianyi-grounded-context-request/v1", projectId: fixture.projectId, sessionId: opened.sessionId, taskKind: "grounded-answer", accessMode: "author", subjectRef: null, sceneRef: null, explicitRefs: [objectRef] }
    });
    assert.equal(result.answer?.status, "fact");
    assert.equal(result.attemptCount, 2, "schema-invalid provider output receives exactly one bounded repair");
    assert.equal(result.includedSources.length, 1);
    assert.equal(result.authorMessageId.startsWith("event."), true);
    assert.equal(result.responseMessageId?.startsWith("event."), true);
    const receipt = await tianyi.readTianyiReceipt({ projectId: fixture.projectId, receiptId: result.receiptId, contextRequest: fixture.contextRequest });
    assert.equal(receipt?.receipt.version, "story-tianyi-context-receipt/v5");
    assert.equal(JSON.stringify(receipt?.receipt).includes("共同确认"), false, "Receipt must not copy canonical prose");
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: updated.id }).revisionToken, beforeHash);
    assert.equal((await tianyi.listTianyiMemories({ projectId: fixture.projectId, scope: "project" })).length, 0);
    const retry = await tianyi.runTianyiGroundedAnswer!({
      operationId: "operation.grounded-answer",
      submissionId: "submission.grounded-answer",
      profileId: "siliconflow-test",
      question: "林岚为什么背叛顾寒？",
      contextRequest: { version: "story-tianyi-grounded-context-request/v1", projectId: fixture.projectId, sessionId: opened.sessionId, taskKind: "grounded-answer", accessMode: "author", subjectRef: null, sceneRef: null, explicitRefs: [objectRef] }
    });
    assert.equal(retry.alreadyCompleted, true);
    const metadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId });
    assert.equal(metadata?.visibleMessages.length, 2, "idempotent retry must not duplicate Archive events");
    const changed = fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: updated.id,
      expectedHash: beforeHash,
      presentationExpectedHash: updated.card.revisionToken,
      writeMarkdown: true,
      writePresentation: false,
      title: updated.title,
      status: updated.status,
      tags: updated.tags,
      aliases: updated.aliases,
      body: `${updated.body}\n计划的联络暗号已经改变。`,
      card: updated.card
    }).object;
    const changedHash = changed.revisionToken;
    const staleResult = await tianyi.runTianyiGroundedAnswer!({
      operationId: "operation.grounded-answer-stale",
      submissionId: "submission.grounded-answer-stale",
      profileId: "siliconflow-test",
      question: "林岚为什么背叛顾寒？",
      contextRequest: { version: "story-tianyi-grounded-context-request/v1", projectId: fixture.projectId, sessionId: opened.sessionId, taskKind: "grounded-answer", accessMode: "author", subjectRef: null, sceneRef: null, explicitRefs: [objectRef] }
    });
    assert.equal(staleResult.answer?.status, "unknown", "a stale necessary source must not confirm the plan");
    assert.equal(staleResult.includedSources.length, 0);
    assert.equal(staleResult.excludedSources[0]?.reasonCode, "STALE_REFERENCE");
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: updated.id }).revisionToken, changedHash, "Tianyi must not write the owner while resolving stale evidence");
    const afterFiles = await listFiles(fixture.rootPath);
    assert.equal(afterFiles.filter((file) => file.includes("/memory/")).length, beforeFiles.filter((file) => file.includes("/memory/")).length);
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("grounded answer includes an explicitly selected chapter as current writing evidence", async () => {
  const fixture = await createFixture();
  try {
    const chapter = fixture.workspace.createWritingDocument({ projectId: fixture.projectId, type: "chapter", title: "旧印章" });
    const updated = fixture.workspace.updateWritingDocument({
      projectId: fixture.projectId,
      documentId: chapter.id,
      expectedHash: chapter.revisionToken,
      status: "drafting",
      body: "# 旧印章\n\n阿岚把旧信与印章一同带离钟楼。\n"
    }).document;
    const chapterRef = {
      version: "story-tianyi-object-context-ref/v1" as const,
      ownerType: "markdown-writing" as const,
      objectType: "chapter" as const,
      stableId: updated.id,
      projectId: fixture.projectId,
      ownerId: updated.id,
      contentHash: updated.revisionToken,
      state: "current" as const,
      inclusion: "included" as const,
      label: updated.title
    };
    const sourceRef = `${fixture.projectId}:markdown-writing:${updated.id}:chapter:${updated.id}`;
    let observedPrompt = "";
    const gateway = fakeGroundedGateway((messages) => {
      observedPrompt = messages.map((message) => message.content).join("\n");
      return {
        summary: "阿岚已把旧信与印章带离钟楼。",
        claims: [{ statement: "阿岚带走了旧信与印章。", status: "fact", sourceRefs: [sourceRef], uncertaintyReason: null }],
        status: "fact",
        sourceRefs: [sourceRef],
        uncertaintyReason: null,
        includedSources: [sourceRef],
        excludedSources: []
      };
    });
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT, modelGateway: gateway });
    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.chapter-grounded-open" });
    const result = await tianyi.runTianyiGroundedAnswer!({
      operationId: "operation.chapter-grounded-answer",
      submissionId: "submission.chapter-grounded-answer",
      profileId: "siliconflow-test",
      question: "阿岚带走了什么？",
      contextRequest: { version: "story-tianyi-grounded-context-request/v1", projectId: fixture.projectId, sessionId: opened.sessionId, taskKind: "grounded-answer", accessMode: "author", subjectRef: null, sceneRef: null, explicitRefs: [chapterRef] }
    });
    assert.equal(result.includedSources[0]?.sourceType, "writing");
    assert.match(observedPrompt, /阿岚把旧信与印章一同带离钟楼/u);
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("product Pack operations export explicit owners and return read-only staging DTOs", async () => {
  const fixture = await createFixture();
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.pack-open" });
    const response = await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.pack-question", request: { boundedAction: "fixture.current" }, contextRequest: fixture.contextRequest });
    assert.ok(response.receiptId);
    const exported = await tianyi.exportTianyiPack({ projectId: fixture.projectId, packId: "pack.000001", ownerKinds: ["identity", "session", "receipt"], includePersonal: false, includeSensitive: false, sensitiveSecondConfirmation: false });
    assert.equal(exported.integrityStatus, "valid");
    assert.equal(exported.fileCount, 4);
    assert.equal("relativePath" in exported, false);
    const staged = await tianyi.stageTianyiPack({ projectId: fixture.projectId, sourcePackId: exported.packId, importId: "import.000001" });
    assert.equal(staged.integrityStatus, "valid");
    assert.equal(staged.entries.length, exported.fileCount);
    assert.equal(staged.canonicalOverwriteCount, 0);
    assert.equal(staged.importedSkillAuthorityCount, 0);
    assert.equal(JSON.stringify(staged).includes(fixture.rootPath), false);
  } finally {
    await makeWritable(fixture.rootPath);
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("sessions persist candidates, require consent, resume after restart, and stop all normal append after close", async () => {
  const fixture = await createFixture();
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.session-open" });
    assert.equal(opened.conflict, false);

    const current = await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.question-current", request: { boundedAction: "fixture.current" }, contextRequest: fixture.contextRequest });
    assert.equal(current.status, "current");
    assert.equal(current.question?.receipt.sources.length, 1);
    assert.equal(current.question?.receipt.sources[0].excerpt.includes("Opening source"), true);

    await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.question-reject", request: { boundedAction: "fixture.memory-candidate" }, contextRequest: fixture.contextRequest });
    let metadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId });
    const rejectedCandidate = metadata?.memoryCandidates[0];
    assert.ok(rejectedCandidate);
    const rejected = await tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: opened.sessionId, candidateId: rejectedCandidate.candidateId, operationId: "operation.reject-candidate", decision: "rejected", secondConfirmation: false, createProjectGrant: false, contextRequest: fixture.contextRequest });
    assert.equal(rejected.durableMemoryCount, 0);
    assert.equal((await tianyi.listTianyiMemories({ projectId: fixture.projectId, scope: "project" })).length, 0);

    await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.question-accept", request: { boundedAction: "fixture.memory-candidate" }, contextRequest: fixture.contextRequest });
    metadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId });
    const acceptedCandidate = metadata?.memoryCandidates.find((candidate) => candidate.candidateId !== rejectedCandidate.candidateId);
    assert.ok(acceptedCandidate);
    await assert.rejects(() => tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: opened.sessionId, candidateId: acceptedCandidate.candidateId, operationId: "operation.accept-personal", decision: "accepted", edits: { statement: acceptedCandidate.statement, scope: "project", kind: "working-preference", sensitivity: "personal" }, secondConfirmation: false, createProjectGrant: false, contextRequest: fixture.contextRequest }), /second confirmation/i);
    const accepted = await tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: opened.sessionId, candidateId: acceptedCandidate.candidateId, operationId: "operation.accept-candidate", decision: "accepted", edits: { statement: "The author reviews source evidence before revising.", scope: "project", kind: "working-preference", sensitivity: "ordinary" }, secondConfirmation: false, createProjectGrant: false, contextRequest: fixture.contextRequest });
    assert.equal(accepted.durableMemoryCount, 1);
    const retry = await tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: opened.sessionId, candidateId: acceptedCandidate.candidateId, operationId: "operation.accept-candidate", decision: "accepted", edits: { statement: "The author reviews source evidence before revising.", scope: "project", kind: "working-preference", sensitivity: "ordinary" }, secondConfirmation: false, createProjectGrant: false, contextRequest: fixture.contextRequest });
    assert.equal(retry.ownerResults.some((result) => result.alreadyCompleted), true);
    assert.equal((await tianyi.listTianyiMemories({ projectId: fixture.projectId, scope: "project" })).length, 1);

    const close = await tianyi.prepareTianyiSessionClose({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.prepare-close", contextRequest: fixture.contextRequest });
    assert.ok(close.stoppingPointCandidate);
    await tianyi.decideTianyiStoppingPointCandidate({ projectId: fixture.projectId, sessionId: opened.sessionId, candidateId: close.stoppingPointCandidate.candidateId, operationId: "operation.accept-stopping", decision: "accepted", contextRequest: fixture.contextRequest });
    const finalized = await tianyi.finalizeTianyiSessionClose({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.finalize-close" });
    assert.equal(finalized.closed, true);
    await assert.rejects(() => tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.after-close", request: { boundedAction: "fixture.current" }, contextRequest: fixture.contextRequest }), /closed/i);

    const restarted = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const restartedMetadata = await restarted.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId });
    assert.equal(restartedMetadata?.closed, true);
    assert.equal((await restarted.getTianyiProjectResume({ projectId: fixture.projectId, agentId: "agent.tianyi" })).status, "current");

    const [stoppingPoint] = await restarted.listTianyiStoppingPoints({ projectId: fixture.projectId });
    assert.ok(stoppingPoint);
    assert.equal(stoppingPoint.sourceLabel, "Opening");
    assert.equal(stoppingPoint.sourceStatus, "current");
    assert.deepEqual(stoppingPoint.sourceTarget, { kind: "writing-document", id: fixture.contextRequest.activeOwner.id });
    const chapterId = fixture.workspace.getWritingBootstrap({ projectId: fixture.projectId }).chapters[0].id;
    const otherScene = fixture.workspace.createWritingDocument({ projectId: fixture.projectId, type: "scene", title: "Elsewhere", chapterId });
    fixture.workspace.openWritingDocument({ projectId: fixture.projectId, documentId: otherScene.id });
    const [stoppingPointAfterSourceSwitch] = await restarted.listTianyiStoppingPoints({ projectId: fixture.projectId });
    assert.equal(stoppingPointAfterSourceSwitch.sourceStatus, "current", "an existing source must not become missing when another document is active");
    assert.equal(stoppingPointAfterSourceSwitch.sourceLabel, "Opening");
    fixture.workspace.openWritingDocument({ projectId: fixture.projectId, documentId: fixture.contextRequest.activeOwner.id });
    const stoppingRevisions = await restarted.listTianyiStoppingPointRevisions({ projectId: fixture.projectId, stoppingPointId: stoppingPoint.id });
    const acceptedRevision = stoppingRevisions.find((revision) => revision.source === "create");
    assert.ok(acceptedRevision);
    const revokedStoppingPoint = await restarted.revokeTianyiStoppingPoint({ projectId: fixture.projectId, stoppingPointId: stoppingPoint.id, expectedHash: stoppingPoint.contentHash, operationId: "operation.stopping-revoke" });
    assert.equal(revokedStoppingPoint.saved, true);
    assert.equal((await restarted.getTianyiProjectResume({ projectId: fixture.projectId, agentId: "agent.tianyi" })).status, "revoked");
    const [revokedPoint] = await restarted.listTianyiStoppingPoints({ projectId: fixture.projectId });
    const restoredStoppingPoint = await restarted.restoreTianyiStoppingPoint({ projectId: fixture.projectId, stoppingPointId: revokedPoint.id, expectedHash: revokedPoint.contentHash, revisionId: acceptedRevision.id, operationId: "operation.stopping-restore" });
    assert.equal(restoredStoppingPoint.saved, true);
    assert.equal((await restarted.getTianyiProjectResume({ projectId: fixture.projectId, agentId: "agent.tianyi" })).status, "current");

    const writing = fixture.workspace.getWritingBootstrap({ projectId: fixture.projectId }).activeDocument;
    assert.ok(writing);
    fixture.workspace.updateWritingDocument({ projectId: fixture.projectId, documentId: writing.id, expectedHash: writing.revisionToken, status: "drafting", body: "# Opening\n\nChanged after close.\n" });
    assert.equal((await restarted.getTianyiProjectResume({ projectId: fixture.projectId, agentId: "agent.tianyi" })).status, "stale");
    const [stalePoint] = await restarted.listTianyiStoppingPoints({ projectId: fixture.projectId });
    assert.equal(stalePoint.sourceStatus, "stale");
    const deletedStoppingPoint = await restarted.hardDeleteTianyiStoppingPoint({ projectId: fixture.projectId, stoppingPointId: stalePoint.id, expectedHash: stalePoint.contentHash, operationId: "operation.stopping-delete" });
    assert.equal(deletedStoppingPoint.saved, true);
    assert.equal((await restarted.listTianyiStoppingPoints({ projectId: fixture.projectId })).length, 0);
    assert.equal((await restarted.listTianyiTombstones({ projectId: fixture.projectId })).some((item) => item.ownerKind === "stopping-point" && item.id === stalePoint.id), true);
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("Archive Recall feeds exact v2 Receipt provenance and missed-memory consent without cross-project or canonical writes", async () => {
  const fixture = await createFixture();
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const sourceSession = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.recall-source-open" });
    await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: sourceSession.sessionId, operationId: "operation.recall-source-question", request: { authorQuery: "Remember the exact lighthouse source decision." }, contextRequest: fixture.contextRequest });
    const rebuilt = await tianyi.rebuildTianyiArchiveRecall({ projectId: fixture.projectId });
    assert.equal(rebuilt.status, "current");
    const searched = await tianyi.searchTianyiArchiveRecall({ projectId: fixture.projectId, authorizedProjectIds: [fixture.projectId], query: "exact lighthouse", filters: { actor: "author" }, limit: 20 });
    assert.equal(searched.status, "current");
    assert.equal(searched.results.length, 1);
    const recalled = searched.results[0];
    await assert.rejects(
      tianyi.searchTianyiArchiveRecall({ projectId: fixture.projectId, authorizedProjectIds: [fixture.projectId, "project-b"], query: "lighthouse", filters: {}, limit: 20 }),
      /current project only/i
    );

    const currentSession = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.recall-current-open" });
    const response = await tianyi.runTianyiQuestion({
      projectId: fixture.projectId,
      sessionId: currentSession.sessionId,
      operationId: "operation.recall-memory-question",
      request: { boundedAction: "fixture.memory-candidate" },
      contextRequest: fixture.contextRequest,
      archiveMessageRefs: [{ sessionId: recalled.sessionId, eventId: recalled.eventId, contentHash: recalled.contentHash }]
    });
    assert.equal(response.question?.receipt.version, "story-tianyi-context-receipt/v2");
    assert.deepEqual("archiveMessageRefs" in response.question!.receipt ? response.question!.receipt.archiveMessageRefs.map((item) => item.eventId) : [], [recalled.eventId]);
    const receipt = await tianyi.readTianyiReceipt({ projectId: fixture.projectId, receiptId: response.receiptId, contextRequest: fixture.contextRequest });
    assert.equal(receipt?.archiveMessageDetails[0].state, "current");
    assert.equal(receipt?.archiveMessageDetails[0].eventId, recalled.eventId);

    const metadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: currentSession.sessionId });
    const candidate = metadata?.memoryCandidates[0];
    assert.ok(candidate);
    assert.equal(candidate.sources[0].id, recalled.eventId);
    assert.equal(candidate.sources[0].kind, "archive-message");
    const rejected = await tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: currentSession.sessionId, candidateId: candidate.candidateId, operationId: "operation.recall-memory-reject", decision: "rejected", secondConfirmation: false, createProjectGrant: false, contextRequest: fixture.contextRequest });
    assert.equal(rejected.durableMemoryCount, 0);

    await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: currentSession.sessionId, operationId: "operation.recall-memory-question-two", request: { boundedAction: "fixture.memory-candidate" }, contextRequest: fixture.contextRequest, archiveMessageRefs: [{ sessionId: recalled.sessionId, eventId: recalled.eventId, contentHash: recalled.contentHash }] });
    const nextMetadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: currentSession.sessionId });
    const acceptedCandidate = nextMetadata?.memoryCandidates.find((item) => item.candidateId !== candidate.candidateId);
    assert.ok(acceptedCandidate);
    const accepted = await tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: currentSession.sessionId, candidateId: acceptedCandidate.candidateId, operationId: "operation.recall-memory-accept", decision: "accepted", edits: { statement: "The author wants exact source decisions recalled before revision.", scope: "project", kind: "working-preference", sensitivity: "ordinary" }, secondConfirmation: false, createProjectGrant: false, contextRequest: fixture.contextRequest });
    assert.equal(accepted.durableMemoryCount, 1);
    const [memory] = await tianyi.listTianyiMemories({ projectId: fixture.projectId, scope: "project" });
    assert.deepEqual(memory.value.source_refs, [recalled.eventId]);

    const sourceMetadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: sourceSession.sessionId });
    assert.ok(sourceMetadata?.contentHash);
    const deleted = await tianyi.hardDeleteTianyiArchiveMessage({ projectId: fixture.projectId, sessionId: sourceSession.sessionId, eventId: recalled.eventId, expectedHash: sourceMetadata.contentHash, operationId: "operation.recall-source-delete" });
    assert.equal(deleted.saved, true);
    const afterDelete = await tianyi.readTianyiReceipt({ projectId: fixture.projectId, receiptId: response.receiptId, contextRequest: fixture.contextRequest });
    assert.equal(afterDelete?.archiveMessageDetails[0].state, "deleted");
    assert.equal((await tianyi.listTianyiMemories({ projectId: fixture.projectId, scope: "project" })).length, 1, "retained Memory must not cascade-delete with its source message");
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("temporary Sessions write zero Archive/Receipt, retain only exact selection, never enter Pack, and disappear on close/restart", async () => {
  const fixture = await createFixture();
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.temporary-open", retentionMode: "temporary" });
    assert.equal(opened.retentionMode, "temporary");
    assert.equal(opened.archiveWriteCount, 0);
    const response = await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.temporary-question", request: { authorQuery: "TEMP_AUTHOR_SELECTED_CANARY" }, contextRequest: fixture.contextRequest });
    assert.equal(response.archiveWriteCount, 0);
    assert.equal(response.receiptWriteCount, 0);
    const retry = await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.temporary-question", request: { authorQuery: "TEMP_AUTHOR_SELECTED_CANARY" }, contextRequest: fixture.contextRequest });
    assert.deepEqual(retry.question, response.question, "temporary idempotent retry must return the complete fixture result");
    assert.equal(retry.archiveWriteCount, 0);
    assert.equal(retry.receiptWriteCount, 0);
    assert.equal((await tianyi.listTianyiReceipts({ projectId: fixture.projectId })).length, 0);
    assert.deepEqual(await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId }), []);
    const temporary = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId });
    assert.equal(temporary?.retentionMode, "temporary");
    assert.equal(temporary?.recoverable, false);
    assert.equal(temporary?.packEligible, false);
    assert.equal(temporary?.visibleMessages.length, 2);
    await assert.rejects(
      tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.temporary-candidate", request: { boundedAction: "fixture.memory-candidate" }, contextRequest: fixture.contextRequest }),
      /do not propose Memory candidates/i
    );

    const retained = await tianyi.retainTemporarySessionMessages({ projectId: fixture.projectId, sessionId: opened.sessionId, eventIds: [temporary!.visibleMessages[0].eventId], operationId: "operation.temporary-retain" });
    assert.equal(retained.retainedEventIds.length, 1);
    assert.equal(retained.session.retentionMode, "normal");
    assert.equal(retained.session.visibleMessages.length, 1);
    assert.match(retained.session.visibleMessages[0].visibleContent, /TEMP_AUTHOR_SELECTED_CANARY/u);
    assert.doesNotMatch(JSON.stringify(retained.session), /selected Archive messages and current source/u);
    const retainedRetry = await tianyi.retainTemporarySessionMessages({ projectId: fixture.projectId, sessionId: opened.sessionId, eventIds: [temporary!.visibleMessages[0].eventId], operationId: "operation.temporary-retain" });
    assert.equal(retainedRetry.archiveWriteCount, 0);
    assert.equal(retainedRetry.session.visibleMessages.length, 1);

    const pack = await tianyi.exportTianyiPack({ projectId: fixture.projectId, packId: "pack.000001", ownerKinds: ["session"], includePersonal: false, includeSensitive: false, sensitiveSecondConfirmation: false });
    assert.equal(pack.fileCount, 1, "Pack contains one retained normal Session owner, never the temporary Session");
    const closed = await tianyi.finalizeTianyiSessionClose({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.temporary-close" });
    assert.equal(closed.temporary, true);
    assert.equal(await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId }), null);
    const restarted = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    assert.equal(await restarted.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId }), null);
    assert.doesNotMatch((await listFiles(fixture.rootPath)).join("\n"), /temporary-session/u);
  } finally {
    await makeWritable(fixture.rootPath);
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("source return records an exact message action and normal Session rollover keeps bidirectional links", async () => {
  const fixture = await createFixture();
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const source = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.return-source-open" });
    await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: source.sessionId, operationId: "operation.return-source-question", request: { authorQuery: "Return to this exact archive message." }, contextRequest: fixture.contextRequest });
    await tianyi.rebuildTianyiArchiveRecall({ projectId: fixture.projectId });
    const recalled = (await tianyi.searchTianyiArchiveRecall({ projectId: fixture.projectId, authorizedProjectIds: [fixture.projectId], query: "exact archive", filters: { actor: "author" }, limit: 20 })).results[0];
    assert.ok(recalled);

    const current = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.return-current-open" });
    const returned = await tianyi.recordTianyiSourceReturn({ projectId: fixture.projectId, sessionId: current.sessionId, targetSessionId: recalled.sessionId, targetEventId: recalled.eventId, targetContentHash: recalled.contentHash, operationId: "operation.return-exact-message" });
    assert.equal(returned.archiveWriteCount, 1);
    const returnedRetry = await tianyi.recordTianyiSourceReturn({ projectId: fixture.projectId, sessionId: current.sessionId, targetSessionId: recalled.sessionId, targetEventId: recalled.eventId, targetContentHash: recalled.contentHash, operationId: "operation.return-exact-message" });
    assert.equal(returnedRetry.archiveWriteCount, 0);
    const currentEvents = await tianyi.readTianyiSessionEvents({ projectId: fixture.projectId, sessionId: current.sessionId, startSequence: 1, limit: 20 });
    assert.equal(currentEvents?.events.some((event) => event.type === "source-returned"), true);

    const rolled = await tianyi.rolloverTianyiSession({ projectId: fixture.projectId, sessionId: current.sessionId, operationId: "operation.rollover-normal" });
    assert.equal(rolled.archiveWriteCount, 4);
    assert.notEqual(rolled.session.id, current.sessionId);
    assert.equal(rolled.session.closed, false);
    const previous = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: current.sessionId });
    assert.equal(previous?.closed, true);
    const previousEvents = await tianyi.readTianyiSessionEvents({ projectId: fixture.projectId, sessionId: current.sessionId, startSequence: 1, limit: 20 });
    const nextEvents = await tianyi.readTianyiSessionEvents({ projectId: fixture.projectId, sessionId: rolled.session.id, startSequence: 1, limit: 20 });
    assert.equal(previousEvents?.events.some((event) => event.type === "session-rolled-over"), true);
    assert.equal(nextEvents?.events.some((event) => event.type === "session-rolled-over"), true);
    const rolledRetry = await tianyi.rolloverTianyiSession({ projectId: fixture.projectId, sessionId: current.sessionId, operationId: "operation.rollover-normal" });
    assert.equal(rolledRetry.archiveWriteCount, 0);
    assert.equal(rolledRetry.session.id, rolled.session.id);
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

test("Memory lifecycle invalidates global grants and hard delete leaves no active owner", async () => {
  const fixture = await createFixture();
  try {
    const tianyi = createStoryStudioTianyiOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, now: () => RECORDED_AT });
    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.global-open" });
    await tianyi.runTianyiQuestion({ projectId: fixture.projectId, sessionId: opened.sessionId, operationId: "operation.global-proposal", request: { boundedAction: "fixture.memory-candidate" }, contextRequest: fixture.contextRequest });
    const metadata = await tianyi.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId });
    const candidate = metadata?.memoryCandidates[0];
    assert.ok(candidate);
    const accepted = await tianyi.decideTianyiMemoryCandidate({ projectId: fixture.projectId, sessionId: opened.sessionId, candidateId: candidate.candidateId, operationId: "operation.global-accept", decision: "accepted", edits: { statement: "The author prefers visible source evidence.", scope: "author-global", kind: "working-preference", sensitivity: "ordinary" }, secondConfirmation: false, createProjectGrant: true, contextRequest: fixture.contextRequest });
    assert.ok(accepted.memoryId);
    const memory = await tianyi.readTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId });
    const grant = await tianyi.readTianyiGlobalMemoryGrant({ projectId: fixture.projectId, memoryId: accepted.memoryId });
    assert.ok(memory);
    assert.ok(grant);

    const edited = await tianyi.editTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId, expectedHash: memory.contentHash, operationId: "operation.global-edit", statement: "The author checks visible source evidence before editing.", kind: "working-preference", sensitivity: "ordinary" });
    assert.equal(edited.saved, true);
    const projection = await tianyi.getTianyiContextProjection({ projectId: fixture.projectId, contextRequest: { ...fixture.contextRequest, memorySelections: [{ id: accepted.memoryId, scope: "author-global" }] } });
    assert.equal(projection.approvedMemoryRefs.length, 0);
    assert.equal(projection.sources.find((source) => source.id === accepted.memoryId)?.exclusionReason, "stale-grant");

    const current = await tianyi.readTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId });
    assert.ok(current);
    const revoked = await tianyi.revokeTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId, expectedHash: current.contentHash, operationId: "operation.global-revoke" });
    assert.equal(revoked.saved, true);
    const revisions = await tianyi.listTianyiMemoryRevisions({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId });
    const activeRevision = revisions.find((revision) => revision.source === "update");
    assert.ok(activeRevision);
    const revokedCurrent = await tianyi.readTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId });
    assert.ok(revokedCurrent);
    const restored = await tianyi.restoreTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId, expectedHash: revokedCurrent.contentHash, revisionId: activeRevision.id, operationId: "operation.global-restore" });
    assert.equal(restored.saved, true);
    const restoredCurrent = await tianyi.readTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId });
    assert.ok(restoredCurrent);
    const deleted = await tianyi.hardDeleteTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId, expectedHash: restoredCurrent.contentHash, operationId: "operation.global-delete" });
    assert.equal(deleted.saved, true);
    assert.equal(await tianyi.readTianyiMemory({ projectId: fixture.projectId, scope: "author-global", memoryId: accepted.memoryId }), null);
  } finally {
    await rm(fixture.rootPath, { recursive: true, force: true });
    await rm(fixture.stateFilePath, { force: true });
  }
});

async function createFixture(initializeIdentity = true) {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-product-"));
  const stateFilePath = path.join(tmpdir(), `tianyi-product-state-${path.basename(rootPath)}.json`);
  const projectId = "project-a";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "Project A", folderSlug: projectId });
  const chapter = workspace.createWritingDocument({ projectId, type: "chapter", title: "Chapter" });
  const scene = workspace.createWritingDocument({ projectId, type: "scene", title: "Opening", chapterId: chapter.id });
  workspace.updateWritingDocument({ projectId, documentId: scene.id, expectedHash: scene.revisionToken, status: "drafting", body: "# Opening\n\nOpening source evidence.\n" });
  workspace.openWritingDocument({ projectId, documentId: scene.id });
  const globalContext = { rootPath, agentId: "agent.tianyi", scope: "author-global" as const };
  if (initializeIdentity) {
    await initializePersona(globalContext, { source: "create", recordedAt: RECORDED_AT, operationId: "operation.persona" });
    await initializeRelationshipPolicy(globalContext, { source: "create", recordedAt: RECORDED_AT, operationId: "operation.policy" });
  }
  const contextRequest = {
    productMode: "writing" as const,
    activeOwner: { kind: "writing-document" as const, id: scene.id },
    selection: { documentId: scene.id, objectId: null, timelinePointId: null },
    sourceRefs: [],
    memorySelections: [],
    enabledSkillRefs: []
  };
  return { rootPath, stateFilePath, projectId, workspace, contextRequest };
}

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, next));
    if (entry.isFile()) result.push(next.split(path.sep).join("/"));
  }
  return result.sort();
}

async function makeWritable(root: string): Promise<void> {
  await chmod(root, 0o700).catch(() => undefined);
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await makeWritable(target);
    else await chmod(target, 0o600).catch(() => undefined);
  }
}

function fakeGroundedGateway(answer: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, call: number) => unknown) {
  let call = 0;
  return {
    metadata() { return { profiles: [{ id: "siliconflow-test", providerId: "siliconflow", modelId: "test/model" }] }; },
    async openChatStream(input: { messages: Array<{ role: "system" | "user" | "assistant"; content: string }> }) {
      call += 1;
      const source = JSON.stringify(answer(input.messages, call));
      return { events: (async function* () { yield { type: "chunk" as const, text: source, usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 } }; yield { type: "done" as const }; })() };
    }
  };
}
