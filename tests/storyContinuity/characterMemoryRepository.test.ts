import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  invalidateCharacterMemoriesByRun,
  listCharacterMemoryLedgerRevisions,
  listRecallableCharacterMemories,
  readCharacterMemoryLedger,
  synchronizeCharacterHeardMemories,
  type ContinuityContext
} from "../../src/storyContinuity/index.ts";

const roots: string[] = [];
const FIRST_SCENE_TIME = "2026-09-09T10:00:00.000Z";
const LATER_SCENE_TIME = "2026-09-09T11:00:00.000Z";

test("N2C persists raw heard provenance once and recalls it only for the recipient in a valid later scene", async () => {
  const rootPath = fixtureRoot();
  const context = projectContext(rootPath, "story-a");
  const run = heardRun();

  await synchronizeCharacterHeardMemories(context, run);
  await synchronizeCharacterHeardMemories(context, run);

  const b = await listRecallableCharacterMemories(context, { recipientId: "character.b", sourceIdentity: rootIdentity("2"), observedAt: LATER_SCENE_TIME });
  const c = await listRecallableCharacterMemories(context, { recipientId: "character.c", sourceIdentity: rootIdentity("2"), observedAt: LATER_SCENE_TIME });
  assert.equal(b.length, 1);
  assert.equal(b[0]?.statement, "钥匙藏在旧钟后面。");
  assert.equal(b[0]?.speakerId, "character.a");
  assert.equal(b[0]?.recipientId, "character.b");
  assert.equal(b[0]?.epistemicState, "heard");
  assert.deepEqual(b[0]?.sourceScene, { id: "story-unit.scene-1", revision: "1", observedAt: FIRST_SCENE_TIME });
  assert.deepEqual(b[0]?.sourceIdentity, rootIdentity("1"));
  assert.equal(c.length, 0, "a non-recipient must remain unaware");
  assert.equal((await listCharacterMemoryLedgerRevisions(context, "character.b")).length, 1, "retry must not append twice");
});

test("N2C excludes future, other-work-version, other-project, and invalidated records while retaining history", async () => {
  const rootPath = fixtureRoot();
  const context = projectContext(rootPath, "story-a");
  await synchronizeCharacterHeardMemories(context, heardRun());

  assert.equal((await listRecallableCharacterMemories(context, { recipientId: "character.b", sourceIdentity: rootIdentity("2"), observedAt: "2026-09-09T09:59:59.000Z" })).length, 0);
  assert.equal((await listRecallableCharacterMemories(context, { recipientId: "character.b", sourceIdentity: { kind: "root", workVersionId: "work.if-branch", revision: "2" }, observedAt: LATER_SCENE_TIME })).length, 0);
  assert.equal((await listRecallableCharacterMemories(projectContext(rootPath, "story-b"), { recipientId: "character.b", sourceIdentity: rootIdentity("2"), observedAt: LATER_SCENE_TIME })).length, 0);

  await invalidateCharacterMemoriesByRun(context, { runId: "nuwa-n1.run-1", invalidatedAt: "2026-09-09T12:00:00.000Z", operationId: "nuwa-memory-rollback.000001" });
  await invalidateCharacterMemoriesByRun(context, { runId: "nuwa-n1.run-1", invalidatedAt: "2026-09-09T12:00:00.000Z", operationId: "nuwa-memory-rollback.000001" });
  await synchronizeCharacterHeardMemories(context, heardRun());
  assert.equal((await listRecallableCharacterMemories(context, { recipientId: "character.b", sourceIdentity: rootIdentity("3"), observedAt: "2026-09-09T13:00:00.000Z" })).length, 0);
  const historical = await readCharacterMemoryLedger(context, "character.b");
  assert.equal(historical?.value.records.length, 1);
  assert.deepEqual(historical?.value.records[0]?.validity, { state: "invalidated", invalidatedAt: "2026-09-09T12:00:00.000Z", invalidatedByOperationId: "nuwa-memory-rollback.000001", reason: "source-rollback" });
  assert.equal((await listCharacterMemoryLedgerRevisions(context, "character.b")).length, 2);
});

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixtureRoot(): string {
  const rootPath = mkdtempSync(path.join(tmpdir(), "character-memory-"));
  roots.push(rootPath);
  for (const projectId of ["story-a", "story-b"]) {
    mkdirSync(path.join(rootPath, projectId), { recursive: true });
    writeFileSync(path.join(rootPath, projectId, "project.md"), `---\nid: ${projectId}\n---\n`, "utf8");
  }
  return rootPath;
}

function projectContext(rootPath: string, projectId: string): ContinuityContext {
  return { rootPath, agentId: "agent.nuwa", scope: "project", projectId };
}

function rootIdentity(revision: string) {
  return { kind: "root" as const, workVersionId: "work.main", revision };
}

function heardRun() {
  return {
    runId: "nuwa-n1.run-1",
    sourceIdentity: rootIdentity("1"),
    scene: { sceneRef: { id: "story-unit.scene-1", revision: "1" }, observedAt: FIRST_SCENE_TIME },
    steps: [{
      stepId: "nuwa-n1-step.000001",
      committedAt: FIRST_SCENE_TIME,
      heardStatements: [{ recipientId: "character.b", speakerId: "character.a", statement: "钥匙藏在旧钟后面。", sourceStepId: "nuwa-n1-step.000001", sourceRevision: "revision.000001" }]
    }]
  };
}
