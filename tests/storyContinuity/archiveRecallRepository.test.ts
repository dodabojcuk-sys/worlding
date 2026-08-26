import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  INTERACTION_EVENT_VERSION,
  appendSessionEvent,
  createSession,
  getArchiveRecallIndexLocation,
  hardDeleteSession,
  hardDeleteSessionMessage,
  listSessionMetadata,
  readSession,
  rebuildArchiveRecallIndex,
  resolveArchiveRecallMessages,
  searchArchiveRecall,
  type ContinuityContext,
  type InteractionEvent
} from "../../src/storyContinuity/index.ts";

const RECORDED_AT = "2026-07-15T08:00:00.000Z";
const AGENT_ID = "agent.tianyi";

test("derived Recall Index searches bounded NFC Chinese text with stable filters and exact provenance", async () => {
  const rootPath = await createWorkspace();
  const context = projectContext(rootPath, "project-a");
  try {
    const session = await seedConversation(context, "雾中灯塔的灯光决定保持熄灭", "The selected source confirms the lighthouse decision.");
    await rebuildArchiveRecallIndex(context, { builtAt: RECORDED_AT });

    const chinese = await searchArchiveRecall(context, {
      authorizedProjectIds: ["project-a"],
      query: "灯光 决定",
      filters: { actor: "author", sessionId: session.id, sourceRef: "scene-01" },
      limit: 20
    });
    assert.equal(chinese.status, "current");
    assert.equal(chinese.results.length, 1);
    assert.equal(chinese.results[0].sessionId, session.id);
    assert.equal(chinese.results[0].eventId, session.authorEventId);
    assert.equal(chinese.results[0].sequence, 2);
    assert.equal(chinese.results[0].actor, "author");
    assert.equal(chinese.results[0].relatedReceiptId, "receipt.000001");
    assert.ok([...chinese.results[0].excerpt].length <= 240);
    assert.deepEqual(chinese.results[0].sourceRefs, ["scene-01"]);

    const compatibility = await searchArchiveRecall(context, {
      authorizedProjectIds: ["project-a"],
      query: "霧中燈塔",
      filters: {},
      limit: 20
    });
    assert.equal(compatibility.results.length, 0, "NFKC must not invent simplified/traditional equivalence");

    const fullWidth = await seedConversation(context, "ＡＢＣ continuity", "Fixture response");
    await rebuildArchiveRecallIndex(context, { builtAt: "2026-07-15T08:05:00.000Z" });
    const normalized = await searchArchiveRecall(context, {
      authorizedProjectIds: ["project-a"],
      query: "abc",
      filters: { sessionId: fullWidth.id },
      limit: 20
    });
    assert.equal(normalized.results[0].eventId, fullWidth.authorEventId);

    const bounded = await searchArchiveRecall(context, {
      authorizedProjectIds: ["project-a"],
      query: "fixture",
      filters: { classification: "confirmed-fact", actor: "tianyi" },
      limit: 1
    });
    assert.equal(bounded.results.length, 1);
    assert.equal(bounded.results[0].actor, "tianyi");
    assert.deepEqual(bounded.results, [...bounded.results].sort((left, right) => left.rank - right.rank));
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("Recall Index is project-default-deny and reports missing, corrupt, and invalid without scanning fallback", async () => {
  const rootPath = await createWorkspace();
  const projectA = projectContext(rootPath, "project-a");
  const projectB = projectContext(rootPath, "project-b");
  try {
    await seedConversation(projectA, "PROJECT_A_PRIVATE_CANARY", "Project A response");
    await seedConversation(projectB, "PROJECT_B_PRIVATE_CANARY", "Project B response");

    const missing = await searchArchiveRecall(projectA, { authorizedProjectIds: ["project-a"], query: "canary", filters: {}, limit: 20 });
    assert.equal(missing.status, "missing");
    assert.deepEqual(missing.results, []);
    await assert.rejects(
      searchArchiveRecall(projectA, { authorizedProjectIds: ["project-a", "project-b"], query: "canary", filters: {}, limit: 20 }),
      /current project only/i
    );
    await assert.rejects(
      searchArchiveRecall(projectA, { authorizedProjectIds: ["project-b"], query: "canary", filters: {}, limit: 20 }),
      /current project only/i
    );

    await rebuildArchiveRecallIndex(projectA, { builtAt: RECORDED_AT });
    const isolated = await searchArchiveRecall(projectA, { authorizedProjectIds: ["project-a"], query: "PROJECT_B_PRIVATE_CANARY", filters: {}, limit: 20 });
    assert.equal(isolated.results.length, 0);

    const location = await getArchiveRecallIndexLocation(projectA);
    await writeFile(location.absolutePath, "{broken", "utf8");
    const corrupt = await searchArchiveRecall(projectA, { authorizedProjectIds: ["project-a"], query: "canary", filters: {}, limit: 20 });
    assert.equal(corrupt.status, "corrupt");
    assert.deepEqual(corrupt.results, []);

    await rebuildArchiveRecallIndex(projectA, { builtAt: RECORDED_AT });
    await seedConversation(projectA, "NEW_UNINDEXED_MESSAGE", "Response");
    const invalid = await searchArchiveRecall(projectA, { authorizedProjectIds: ["project-a"], query: "new", filters: {}, limit: 20 });
    assert.equal(invalid.status, "invalid");
    assert.deepEqual(invalid.results, []);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("exact message deletion preserves order and identity while purging content and rebuild residue", async () => {
  const rootPath = await createWorkspace();
  const context = projectContext(rootPath, "project-a");
  try {
    const seeded = await seedConversation(context, "DELETE_MESSAGE_CANARY", "Surviving response");
    await rebuildArchiveRecallIndex(context, { builtAt: RECORDED_AT });
    const before = await readFile((await getArchiveRecallIndexLocation(context)).absolutePath, "utf8");
    assert.match(before, /delete_message_canary/i);

    const current = await readSession(context, seeded.id);
    assert.ok(current);
    const deleted = await hardDeleteSessionMessage(context, seeded.id, {
      eventId: seeded.authorEventId,
      expectedContentHash: current.contentHash,
      deletedAt: "2026-07-15T08:10:00.000Z",
      operationId: "operation.message-delete"
    });
    assert.equal(deleted.ok, true);
    assert.equal(deleted.alreadyCompleted, false);

    const afterDelete = await readSession(context, seeded.id);
    assert.ok(afterDelete);
    assert.equal(afterDelete.value[1].eventId, seeded.authorEventId);
    assert.equal(afterDelete.value[1].sequence, 2);
    assert.equal(afterDelete.value[1].type, "message-deleted");
    assert.equal(afterDelete.value[1].content, "");
    assert.equal(afterDelete.value[2].sequence, 3);
    assert.doesNotMatch(JSON.stringify(afterDelete.value), /DELETE_MESSAGE_CANARY/u);

    const location = await getArchiveRecallIndexLocation(context);
    await assert.rejects(readFile(location.absolutePath, "utf8"), /ENOENT/u);
    await rebuildArchiveRecallIndex(context, { builtAt: "2026-07-15T08:11:00.000Z" });
    const rebuilt = await readFile(location.absolutePath, "utf8");
    assert.doesNotMatch(rebuilt, /DELETE_MESSAGE_CANARY|delete_message_canary/u);
    const search = await searchArchiveRecall(context, { authorizedProjectIds: ["project-a"], query: "delete_message_canary", filters: {}, limit: 20 });
    assert.equal(search.results.length, 0);

    const retry = await hardDeleteSessionMessage(context, seeded.id, {
      eventId: seeded.authorEventId,
      expectedContentHash: current.contentHash,
      deletedAt: "2026-07-15T08:10:00.000Z",
      operationId: "operation.message-delete"
    });
    assert.equal(retry.ok, true);
    assert.equal(retry.alreadyCompleted, true);

    const sources = await resolveArchiveRecallMessages(context, [{ sessionId: seeded.id, eventId: seeded.authorEventId, contentHash: "0".repeat(64) }]);
    assert.equal(sources[0].state, "deleted");
    assert.equal(sources[0].excerpt, null);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("Session hard delete removes it from rebuilt search and leaves only a content-free tombstone", async () => {
  const rootPath = await createWorkspace();
  const context = projectContext(rootPath, "project-a");
  try {
    const seeded = await seedConversation(context, "DELETE_SESSION_CANARY", "Response");
    await rebuildArchiveRecallIndex(context, { builtAt: RECORDED_AT });
    const current = await readSession(context, seeded.id);
    assert.ok(current);
    const deleted = await hardDeleteSession(context, seeded.id, {
      expectedContentHash: current.contentHash,
      deletedAt: "2026-07-15T08:20:00.000Z",
      operationId: "operation.session-delete"
    });
    assert.equal(deleted.ok, true);
    assert.equal(await readSession(context, seeded.id), null);
    assert.doesNotMatch(JSON.stringify(deleted), /DELETE_SESSION_CANARY/u);

    await rebuildArchiveRecallIndex(context, { builtAt: "2026-07-15T08:21:00.000Z" });
    const search = await searchArchiveRecall(context, { authorizedProjectIds: ["project-a"], query: "delete_session_canary", filters: {}, limit: 20 });
    assert.equal(search.results.length, 0);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

async function seedConversation(context: ContinuityContext, authorText: string, responseText: string) {
  const existing = await listSessionMetadata(context);
  const sequence = existing.length + 1;
  const id = `session.${String(sequence).padStart(6, "0")}`;
  const opened = event(id, 1, "session-opened", "system", JSON.stringify({ projectId: context.projectId, agentId: AGENT_ID }), `operation.open-${sequence}`);
  const created = await createSession(context, opened, metadata(`operation.open-${sequence}`));
  assert.equal(created.ok, true);
  let current = created.ok ? created.current : null;
  assert.ok(current);
  const authorEventId = `event.author-${sequence}`;
  const author = event(id, 2, "author-message", "author", JSON.stringify({
    version: "tianyi-question-operation/v1",
    request: { authorQuery: authorText },
    receiptId: "receipt.000001",
    contextRequest: {
      productMode: "writing",
      activeOwner: { kind: "writing-document", id: "scene-01" },
      selection: { documentId: "scene-01", objectId: null, timelinePointId: null },
      sourceRefs: [{ id: "scene-01", kind: "writing-document", origin: "active-owner" }],
      memorySelections: [],
      enabledSkillRefs: []
    }
  }), `operation.question-${sequence}`, authorEventId);
  const authorWrite = await appendSessionEvent(context, id, current.contentHash, 2, author, metadata(`operation.question-${sequence}`));
  assert.equal(authorWrite.ok, true);
  current = authorWrite.ok ? authorWrite.current : null;
  assert.ok(current);
  const responseEventId = `event.response-${sequence}`;
  const response = event(id, 3, "tianyi-response", "tianyi", JSON.stringify({ version: "tianyi-response-operation/v1", visibleResponse: responseText, status: "current", failure: null, memoryProposals: [] }), `operation.question-${sequence}`, responseEventId, "receipt.000001", ["confirmed-fact"]);
  const responseWrite = await appendSessionEvent(context, id, current.contentHash, 3, response, metadata(`operation.question-${sequence}`));
  assert.equal(responseWrite.ok, true);
  return { id, authorEventId, responseEventId };
}

function event(sessionId: string, sequence: number, type: InteractionEvent["type"], actor: InteractionEvent["actor"], content: string, operationId: string, eventId = `event.${type}-${sequence}`, receiptId: string | null = null, responseClassifications: InteractionEvent["responseClassifications"] = []): InteractionEvent {
  return { version: INTERACTION_EVENT_VERSION, eventId, sessionId, sequence, type, recordedAt: new Date(Date.parse(RECORDED_AT) + sequence * 1_000).toISOString(), actor, content, responseClassifications, memoryCandidateIds: [], receiptId, operationId };
}

function metadata(operationId: string) {
  return { source: "append" as const, recordedAt: RECORDED_AT, operationId };
}

function projectContext(rootPath: string, projectId: string): ContinuityContext {
  return { rootPath, agentId: AGENT_ID, scope: "project", projectId };
}

async function createWorkspace(): Promise<string> {
  const rootPath = await mkdtemp(path.join(tmpdir(), "archive-recall-"));
  for (const projectId of ["project-a", "project-b"]) {
    await mkdir(path.join(rootPath, projectId), { recursive: true });
    await writeFile(path.join(rootPath, projectId, "project.md"), `---\nworld_os: story-project/v1\nid: ${projectId}\ntitle: Project\n---\n`, "utf8");
  }
  return rootPath;
}
