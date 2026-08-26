import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createTianyiGroundedContextRequest } from "../../apps/story-studio/src/lib/tianyiGroundedContextRequest.ts";
import {
  createMemory,
  initializePersona,
  initializeRelationshipPolicy,
  MEMORY_VERSION,
  stableJson,
  type MemoryItem,
  type TianyiGroundedContextRequest,
  type TianyiObjectContextRef
} from "../../src/storyContinuity/index.ts";
import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createStoryStudioEventReference } from "../../src/storyContracts/storyStudioEventReference.ts";
import { updateWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

const RECORDED_AT = "2026-07-31T00:00:00.000Z";
const PRIVATE_SCENE = "PRIVATE_SCENE_SECRET_E1";
const PRIVATE_CHARACTER_A = "PRIVATE_CHARACTER_A_SECRET_E1";
const PRIVATE_MEMORY_A = "PRIVATE_MEMORY_A_SECRET_E1";

test("E1 subject-scoped grounded packet is deterministic, leak-free, receipt-equivalent and restart-stable", async () => {
  const fixture = await createE1Fixture();
  const packetCapture: Array<Array<{ role: string; content: string }>> = [];
  const gateway = groundedGateway(packetCapture);
  try {
    const tianyi = createStoryStudioTianyiOperations({
      rootPath: fixture.rootPath,
      stateFilePath: fixture.stateFilePath,
      now: () => RECORDED_AT,
      modelGateway: gateway
    });

    const preflightBefore = await ownerInventory(fixture.rootPath);
    await assert.rejects(
      tianyi.runTianyiGroundedAnswer!({
        operationId: "operation.e1.invalid-missing-subject",
        submissionId: "submission.e1.invalid-missing-subject",
        profileId: "loopback-test",
        question: "invalid",
        contextRequest: {
          version: "story-tianyi-grounded-context-request/v1",
          projectId: fixture.projectId,
          sessionId: "session.ghost",
          taskKind: "grounded-answer",
          accessMode: "character",
          subjectRef: null,
          sceneRef: fixture.sceneRef,
          explicitRefs: []
        } as TianyiGroundedContextRequest
      }),
      /requires an explicit character subject/u
    );
    await assert.rejects(
      tianyi.runTianyiGroundedAnswer!({
        operationId: "operation.e1.invalid-missing-access",
        submissionId: "submission.e1.invalid-missing-access",
        profileId: "loopback-test",
        question: "invalid",
        contextRequest: {
          version: "story-tianyi-grounded-context-request/v1",
          projectId: fixture.projectId,
          sessionId: "session.ghost",
          taskKind: "grounded-answer",
          subjectRef: fixture.subjectRef,
          sceneRef: fixture.sceneRef,
          explicitRefs: []
        } as TianyiGroundedContextRequest
      }),
      /fields are invalid/u
    );
    await assert.rejects(
      tianyi.runTianyiGroundedAnswer!({
        operationId: "operation.e1.invalid-access-mode",
        submissionId: "submission.e1.invalid-access-mode",
        profileId: "loopback-test",
        question: "invalid",
        contextRequest: {
          version: "story-tianyi-grounded-context-request/v1",
          projectId: fixture.projectId,
          sessionId: "session.ghost",
          taskKind: "grounded-answer",
          accessMode: "observer",
          subjectRef: fixture.subjectRef,
          sceneRef: fixture.sceneRef,
          explicitRefs: []
        } as unknown as TianyiGroundedContextRequest
      }),
      /access mode is invalid/u
    );
    await assert.rejects(
      tianyi.runTianyiGroundedAnswer!({
        operationId: "operation.e1.invalid-task-kind",
        submissionId: "submission.e1.invalid-task-kind",
        profileId: "loopback-test",
        question: "invalid",
        contextRequest: {
          version: "story-tianyi-grounded-context-request/v1",
          projectId: fixture.projectId,
          sessionId: "session.ghost",
          taskKind: "summarize",
          accessMode: "character",
          subjectRef: fixture.subjectRef,
          sceneRef: fixture.sceneRef,
          explicitRefs: []
        } as unknown as TianyiGroundedContextRequest
      }),
      /task kind is invalid/u
    );
    await assert.rejects(
      tianyi.runTianyiGroundedAnswer!({
        operationId: "operation.e1.invalid-cross-subject",
        submissionId: "submission.e1.invalid-cross-subject",
        profileId: "loopback-test",
        question: "invalid",
        contextRequest: {
          version: "story-tianyi-grounded-context-request/v1",
          projectId: fixture.projectId,
          sessionId: "session.ghost",
          taskKind: "grounded-answer",
          accessMode: "character",
          subjectRef: { ...fixture.subjectRef, projectId: "project-b" },
          sceneRef: fixture.sceneRef,
          explicitRefs: []
        }
      }),
      /belongs to another project/u
    );
    assert.deepEqual(await ownerInventory(fixture.rootPath), preflightBefore, "invalid access must allocate no Session or Receipt");
    assert.equal(gateway.calls(), 0, "invalid access must make zero provider calls");

    const opened = await tianyi.openTianyiSession({ projectId: fixture.projectId, operationId: "operation.e1.session-open" });
    const request: TianyiGroundedContextRequest = {
      version: "story-tianyi-grounded-context-request/v1",
      projectId: fixture.projectId,
      sessionId: opened.sessionId,
      taskKind: "grounded-answer",
      accessMode: "character",
      subjectRef: fixture.subjectRef,
      sceneRef: fixture.sceneRef,
      explicitRefs: fixture.explicitRefs,
      eventRefs: fixture.eventRefs
    };
    const protectedBefore = await protectedFingerprint(fixture.projectPath);
    const result = await tianyi.runTianyiGroundedAnswer!({
      operationId: "operation.e1.grounded-answer",
      submissionId: "submission.e1.grounded-answer",
      profileId: "loopback-test",
      question: "以角色 B 的视角说明当前可确认的事实。",
      contextRequest: request
    });
    assert.equal(result.status, "current");
    assert.equal(result.attemptCount, 1);
    assert.equal(gateway.calls(), 1);

  const includedTypes = new Set(result.sourceManifest.included.map((entry) => `${entry.lane}:${entry.sourceType}`));
    assert.equal(includedTypes.has("scene:scene"), true);
    assert.equal(includedTypes.has("subject:world-object"), true);
    assert.equal(includedTypes.has("constraint:rule"), true);
  assert.equal(includedTypes.has("memory:memory"), true);
  assert.equal(includedTypes.has("evidence:world-object"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "SUBJECT_KNOWLEDGE_UNPROVEN"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "INACTIVE_RULE"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "RULE_SCOPE_MISMATCH"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "UNAPPROVED_MEMORY"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "TASK_IRRELEVANT"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "STALE_REFERENCE"), true);
    assert.equal(result.sourceManifest.excluded.some((entry) => entry.reasonCode === "CROSS_PROJECT_REFERENCE"), true);
    assert.equal(result.sourceManifest.budgetOmitted.some((entry) => entry.reasonCode === "BUDGET_OMITTED"), true);
    assert.equal(result.sourceManifest.conflicting.some((entry) => entry.reasonCode === "SOURCE_CONFLICT"), true);

    const packetText = JSON.stringify(packetCapture);
    for (const marker of [PRIVATE_SCENE, PRIVATE_CHARACTER_A, PRIVATE_MEMORY_A]) {
      assert.equal(packetText.includes(marker), false, `${marker} must not enter the provider packet`);
    }
    const packetSourceKeys = extractPacketSourceKeys(packetCapture[0]);
    assert.deepEqual(packetSourceKeys, result.sourceManifest.included.map((entry) => entry.sourceKey));

    const receiptRead = await tianyi.readTianyiReceipt({
      projectId: fixture.projectId,
      receiptId: result.receiptId,
      contextRequest: fixture.legacyContextRequest
    });
    assert.ok(receiptRead);
    assert.equal(receiptRead.receipt.version, "story-tianyi-context-receipt/v5");
    assert.deepEqual(receiptRead.receipt.sources, result.sourceManifest.included);
    assert.deepEqual(receiptRead.receipt.sourceManifest, result.sourceManifest);
    for (const marker of [PRIVATE_SCENE, PRIVATE_CHARACTER_A, PRIVATE_MEMORY_A]) {
      assert.equal(JSON.stringify(receiptRead).includes(marker), false, `${marker} must not enter Receipt v4`);
    }
    assert.equal(await protectedFingerprint(fixture.projectPath), protectedBefore, "grounded answer must not write Canon, Event, Memory or Candidate owners");

    const restartedCapture: Array<Array<{ role: string; content: string }>> = [];
    const restarted = createStoryStudioTianyiOperations({
      rootPath: fixture.rootPath,
      stateFilePath: fixture.stateFilePath,
      now: () => RECORDED_AT,
      modelGateway: groundedGateway(restartedCapture)
    });
    const restartedResult = await restarted.runTianyiGroundedAnswer!({
      operationId: "operation.e1.restart-answer",
      submissionId: "submission.e1.grounded-answer",
      profileId: "loopback-test",
      question: "以角色 B 的视角说明当前可确认的事实。",
      contextRequest: request
    });
    assert.equal(restartedResult.sourceManifest.digest, result.sourceManifest.digest);
    assert.deepEqual(restartedResult.sourceManifest, result.sourceManifest);

    const quickRequest = createTianyiGroundedContextRequest({
      projectId: fixture.projectId,
      sessionId: opened.sessionId,
      access: { accessMode: "character", subjectRef: fixture.subjectRef },
      activeContextRef: fixture.sceneRef,
      objectContextRefs: fixture.explicitRefs,
      eventRefs: fixture.eventRefs
    });
    const fullRequest = createTianyiGroundedContextRequest({
      projectId: fixture.projectId,
      sessionId: opened.sessionId,
      access: { accessMode: "character", subjectRef: fixture.subjectRef },
      activeContextRef: fixture.sceneRef,
      objectContextRefs: fixture.explicitRefs,
      eventRefs: fixture.eventRefs
    });
    assert.deepEqual(fullRequest, quickRequest, "Quick and Full Tianyi must compile the same Session/task/viewpoint/refs");

    const maliciousCapture: Array<Array<{ role: string; content: string }>> = [];
    const malicious = createStoryStudioTianyiOperations({
      rootPath: fixture.rootPath,
      stateFilePath: fixture.stateFilePath,
      now: () => RECORDED_AT,
      modelGateway: groundedGateway(maliciousCapture, { malicious: true })
    });
    const protectedBeforeMalicious = await protectedFingerprint(fixture.projectPath);
    await assert.rejects(
      malicious.runTianyiGroundedAnswer!({
        operationId: "operation.e1.malicious-answer",
        submissionId: "submission.e1.malicious-answer",
        profileId: "loopback-test",
        question: "return malicious field",
        contextRequest: request
      }),
      /failed grounded validation/u
    );
    assert.equal(maliciousCapture.length, 2, "invalid provider output gets exactly one repair attempt");
    assert.equal(await protectedFingerprint(fixture.projectPath), protectedBeforeMalicious, "malicious output must not write Canon, Event, Memory or Candidate owners");
    assert.equal((await malicious.listTianyiReceipts({ projectId: fixture.projectId })).length, 1, "restart recovery must reuse the one valid Receipt and invalid output must persist none");

    await writeE1Evidence({
      packetCapture,
      result,
      receipt: receiptRead.receipt,
      preflightProviderCalls: 0,
      validProviderCalls: gateway.calls(),
      maliciousProviderCalls: maliciousCapture.length,
      session: await restarted.readTianyiSessionMetadata({ projectId: fixture.projectId, sessionId: opened.sessionId }),
      protectedBefore,
      protectedAfter: await protectedFingerprint(fixture.projectPath)
    });
  } finally {
    const evidenceRoot = process.env.TIANYAN_CONTEXT_GATE_EVIDENCE_DIR;
    if (process.env.TIANYAN_CONTEXT_GATE_RETAIN_FIXTURE === "1" && evidenceRoot) {
      await rename(fixture.rootPath, path.join(evidenceRoot, "synthetic-browser-root"));
      await rename(fixture.stateFilePath, path.join(evidenceRoot, "synthetic-browser-state.json"));
    } else {
      await rm(fixture.rootPath, { recursive: true, force: true });
      await rm(fixture.stateFilePath, { force: true });
    }
  }
});

async function createE1Fixture() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-grounded-e1-"));
  const stateFilePath = path.join(tmpdir(), `tianyi-grounded-e1-state-${path.basename(rootPath)}.json`);
  const projectId = "project-a";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "E1 Project", folderSlug: projectId });
  const projectPath = workspace.resolveProjectWorkspacePath({ projectId });
  const chapter = workspace.createWritingDocument({ projectId, type: "chapter", title: "Chapter" });

  const characterA = workspace.createWorldObject({ projectId, type: "character", title: "Character A", status: "committed", tags: [], aliases: [], body: PRIVATE_CHARACTER_A });
  const characterB = workspace.createWorldObject({ projectId, type: "character", title: "Character B", status: "committed", tags: [], aliases: [], body: "Character B public self context." });
  const stale = workspace.createWorldObject({ projectId, type: "location", title: "Stale Place", status: "committed", tags: [], aliases: [], body: "Old location state." });
  const conflict = workspace.createWorldObject({ projectId, type: "location", title: "Conflicting Place", status: "committed", tags: [], aliases: [], body: "Conflicting location state." });
  const plannedEvent = workspace.createWorldObject({ projectId, type: "event", title: "Planned Event", status: "planned", tags: ["作者规划"], aliases: [], body: "A planned event is visible only through its explicit reference." });
  const activeRule = workspace.createWorldObject({ projectId, type: "rule", title: "Active Rule", status: "locked", tags: ["active"], aliases: [], body: "The subject must preserve the confirmed distance constraint." });
  const inactiveRule = workspace.createWorldObject({ projectId, type: "rule", title: "Inactive Rule", status: "inactive", tags: ["active"], aliases: [], body: "Inactive rule." });
  const draftRule = workspace.createWorldObject({ projectId, type: "rule", title: "Draft Rule", status: "drafting", tags: ["active"], aliases: [], body: "Draft rule." });
  const unrelatedRule = workspace.createWorldObject({ projectId, type: "rule", title: "Unrelated Rule", status: "locked", tags: ["active"], aliases: [], body: "Unrelated rule." });
  const largeRule = workspace.createWorldObject({ projectId, type: "rule", title: "Large Rule", status: "locked", tags: ["active"], aliases: [], body: `Large rule ${"x".repeat(60_000)}` });

  const withKnowledge = <T extends { relativeId: string; revisionToken: string; id: string }>(value: T, subjects: string[]) => {
    const write = updateWorkspaceNote(projectPath, {
      relativePath: value.relativeId,
      expectedContentHash: value.revisionToken,
      frontmatter: { knowledge_subjects: subjects }
    });
    assert.equal(write.ok, true);
  };
  withKnowledge(characterA, [characterA.id]);
  withKnowledge(characterB, [characterB.id]);
  withKnowledge(stale, [characterB.id]);
  withKnowledge(conflict, [characterB.id]);
  for (const rule of [activeRule, inactiveRule, draftRule, unrelatedRule, largeRule]) withKnowledge(rule, [characterB.id]);
  withKnowledge(plannedEvent, [characterB.id]);

  const staleBefore = workspace.readWorldObject({ projectId, objectId: stale.id });
  const staleAfter = workspace.updateWorldObject({
    projectId,
    objectId: staleBefore.id,
    expectedHash: staleBefore.revisionToken,
    presentationExpectedHash: staleBefore.card.revisionToken,
    writeMarkdown: true,
    writePresentation: false,
    title: staleBefore.title,
    status: staleBefore.status,
    tags: staleBefore.tags,
    aliases: staleBefore.aliases,
    body: "Current location state.",
    card: staleBefore.card
  }).object;
  const scene = workspace.createWritingDocument({ projectId, type: "scene", title: "Private Scene", chapterId: chapter.id });
  const linkedRules = [activeRule, inactiveRule, draftRule, largeRule].map((rule) => `[[${rule.relativeId}]]`).join("\n");
  const sceneWrite = updateWorkspaceNote(projectPath, {
    relativePath: scene.relativeId,
    expectedContentHash: scene.revisionToken,
    frontmatter: { status: "committed", knowledge_subjects: [characterB.id] },
    body: `# Private Scene\n\n${PRIVATE_SCENE}\n\n${linkedRules}\n`
  });
  assert.equal(sceneWrite.ok, true);
  const currentScene = workspace.readWritingDocument({ projectId, documentId: scene.id });
  workspace.openWritingDocument({ projectId, documentId: scene.id });

  const currentA = workspace.readWorldObject({ projectId, objectId: characterA.id });
  const currentB = workspace.readWorldObject({ projectId, objectId: characterB.id });
  const currentConflict = workspace.readWorldObject({ projectId, objectId: conflict.id });
  const currentPlannedEvent = workspace.readWorldObject({ projectId, objectId: plannedEvent.id });
  const subjectRef = objectRef(projectId, currentB);
  const sceneRef = writingRef(projectId, currentScene);
  const explicitRefs: TianyiObjectContextRef[] = [
    objectRef(projectId, currentA),
    { ...objectRef(projectId, staleAfter), contentHash: staleBefore.revisionToken },
    objectRef(projectId, currentConflict),
    { ...objectRef(projectId, currentConflict), contentHash: "b".repeat(64) },
    { ...objectRef(projectId, staleAfter), projectId: "project-b", contentHash: "c".repeat(64) }
  ];
  const eventRefs = [createStoryStudioEventReference({ projectId, event: currentPlannedEvent, requestedUse: "constraint" })];

  const continuity = { rootPath, agentId: "agent.tianyi", scope: "project" as const, projectId };
  const global = { rootPath, agentId: "agent.tianyi", scope: "author-global" as const };
  await initializePersona(global, { source: "create", recordedAt: RECORDED_AT, operationId: "operation.e1.persona" });
  await initializeRelationshipPolicy(global, { source: "create", recordedAt: RECORDED_AT, operationId: "operation.e1.policy" });
  await createMemory(continuity, memory("memory.000001", projectId, "Safe B memory.", [currentScene.id, currentB.id], [currentB.id]), { source: "create", recordedAt: RECORDED_AT, operationId: "operation.e1.memory-safe" });
  await createMemory(continuity, memory("memory.000002", projectId, PRIVATE_MEMORY_A, [currentScene.id, currentA.id], [currentA.id]), { source: "create", recordedAt: RECORDED_AT, operationId: "operation.e1.memory-secret" });
  await createMemory(continuity, memory("memory.000003", projectId, "Unrelated B memory.", ["unrelated-source"], [currentB.id]), { source: "create", recordedAt: RECORDED_AT, operationId: "operation.e1.memory-unrelated" });
  await createMemory(continuity, { ...memory("memory.000004", projectId, "Unapproved memory.", [currentScene.id], [currentB.id]), state: "revoked" }, { source: "create", recordedAt: RECORDED_AT, operationId: "operation.e1.memory-unapproved" });

  const legacyContextRequest = {
    productMode: "writing" as const,
    activeOwner: { kind: "writing-document" as const, id: currentScene.id },
    selection: { documentId: currentScene.id, objectId: null, timelinePointId: null },
    sourceRefs: [],
    memorySelections: [],
    enabledSkillRefs: []
  };
  return { rootPath, stateFilePath, projectId, projectPath, workspace, subjectRef, sceneRef, explicitRefs, eventRefs, legacyContextRequest };
}

function objectRef(projectId: string, object: { id: string; type: string; revisionToken: string; title: string }): TianyiObjectContextRef {
  return {
    version: "story-tianyi-object-context-ref/v1",
    ownerType: "markdown-object",
    objectType: object.type as TianyiObjectContextRef["objectType"],
    stableId: object.id,
    projectId,
    ownerId: object.id,
    contentHash: object.revisionToken,
    state: "current",
    inclusion: "included",
    label: object.title
  };
}

function writingRef(projectId: string, document: { id: string; revisionToken: string; title: string }): TianyiObjectContextRef {
  return {
    version: "story-tianyi-object-context-ref/v1",
    ownerType: "markdown-writing",
    objectType: "scene",
    stableId: document.id,
    projectId,
    ownerId: document.id,
    contentHash: document.revisionToken,
    state: "current",
    inclusion: "included",
    label: document.title
  };
}

function memory(id: string, projectId: string, body: string, sourceRefs: string[], knowledgeSubjects: string[]): MemoryItem {
  return {
    world_os: MEMORY_VERSION,
    id,
    type: "tianyi-memory",
    agent_id: "agent.tianyi",
    scope: "project",
    project_id: projectId,
    kind: "continuity-note",
    sensitivity: "ordinary",
    approval_state: "author-approved",
    model_involvement: "deterministic-fixture",
    created_revision: 1,
    last_confirmed_revision: 1,
    review_after: "none",
    expires_after: "none",
    state: "active",
    source_refs: sourceRefs,
    knowledge_subject_refs: knowledgeSubjects,
    body
  };
}

function groundedGateway(
  captures: Array<Array<{ role: string; content: string }>>,
  options: { malicious?: boolean } = {}
) {
  return {
    calls: () => captures.length,
    metadata() {
      return { profiles: [{ id: "loopback-test", providerId: "loopback", modelId: "synthetic/e1" }] };
    },
    async openChatStream(input: { messages: Array<{ role: "system" | "user" | "assistant"; content: string }> }) {
      captures.push(structuredClone(input.messages));
      const system = input.messages[0]?.content ?? "";
      const included = parseSystemJson(system, "includedSources must equal exactly: ");
      const excluded = parseSystemJson(system, "excludedSources must equal exactly: ");
      const payload = options.malicious
        ? {
            summary: "malicious",
            claims: [],
            status: "unknown",
            sourceRefs: [],
            uncertaintyReason: "invalid",
            includedSources: included,
            excludedSources: excluded,
            canonMutation: { write: true }
          }
        : {
            summary: "角色 B 只能基于已授权来源确认当前约束。",
            claims: [{ statement: "当前约束已由活动规则确认。", status: "fact", sourceRefs: included.slice(0, 1), uncertaintyReason: null }],
            status: "fact",
            sourceRefs: included.slice(0, 1),
            uncertaintyReason: null,
            includedSources: included,
            excludedSources: excluded
          };
      const source = JSON.stringify(payload);
      return {
        events: (async function* () {
          yield { type: "chunk" as const, text: source, usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } };
          yield { type: "done" as const };
        })()
      };
    }
  };
}

function parseSystemJson(source: string, prefix: string) {
  const line = source.split("\n").find((item) => item.startsWith(prefix));
  if (!line) throw new Error(`Missing provider contract line: ${prefix}`);
  return JSON.parse(line.slice(prefix.length)) as unknown[];
}

function extractPacketSourceKeys(messages: Array<{ role: string; content: string }>): string[] {
  const user = messages.find((message) => message.role === "user")?.content ?? "";
  return [...user.matchAll(/--- SOURCE ([^ ]+) \|/gu)].map((match) => match[1]);
}

async function ownerInventory(rootPath: string) {
  const files = await walk(rootPath);
  return files.filter((file) => {
    return /\/continuity\/agents\/[^/]+\/(?:sessions|receipts)\//u.test(`/${file}`)
      || /\/continuity-id-reservations\/[^/]+\/(?:session|receipt)\./u.test(`/${file}`);
  });
}

async function protectedFingerprint(projectPath: string): Promise<string> {
  const files = (await walk(projectPath)).filter((file) => {
    return /^(?:world|writing)\//u.test(file)
      || /\/(?:memories|candidates)\//u.test(file)
      || /\/history\/(?:memories|candidates)\//u.test(file);
  });
  const hash = createHash("sha256");
  for (const relative of files) {
    hash.update(relative);
    hash.update(await readFile(path.join(projectPath, relative)));
  }
  return hash.digest("hex");
}

async function walk(root: string, relative = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await walk(root, next));
    else if (entry.isFile() && (await stat(path.join(root, next))).isFile()) result.push(next.split(path.sep).join("/"));
  }
  return result.sort();
}

async function writeE1Evidence(value: Record<string, unknown>): Promise<void> {
  const target = process.env.TIANYAN_CONTEXT_GATE_EVIDENCE_DIR;
  if (!target) return;
  await mkdir(target, { recursive: true });
  await Promise.all([
    writeFile(path.join(target, "provider-packet.json"), stableJson(value.packetCapture), "utf8"),
    writeFile(path.join(target, "source-manifest.json"), stableJson((value.result as { sourceManifest: unknown }).sourceManifest), "utf8"),
    writeFile(path.join(target, "context-receipt-v4.json"), stableJson(value.receipt), "utf8"),
    writeFile(path.join(target, "provider-call-counts.json"), stableJson({
      preflight: value.preflightProviderCalls,
      valid: value.validProviderCalls,
      malicious: value.maliciousProviderCalls
    }), "utf8"),
    writeFile(path.join(target, "session-receipt.json"), stableJson(value.session), "utf8"),
    writeFile(path.join(target, "protected-owner-fingerprints.json"), stableJson({
      before: value.protectedBefore,
      after: value.protectedAfter
    }), "utf8")
  ]);
}
