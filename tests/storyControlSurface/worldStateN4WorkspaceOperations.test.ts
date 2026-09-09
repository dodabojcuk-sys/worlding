import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "tianyan-world-state-n4-"));
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".app-state.json") });
  const project = operations.createProject({ title: "雾港", folderSlug: "fog-port" });
  const gate = operations.createWorldObject({ projectId: project.id, type: "location", title: "北闸" });
  const key = operations.createWorldObject({ projectId: project.id, type: "item", title: "铜钥匙" });
  const awu = operations.createWorldObject({ projectId: project.id, type: "character", title: "阿芜" });
  const event = operations.createWorldObject({ projectId: project.id, type: "event", title: "北闸封闭", status: "committed" });
  return { operations, project, gate, key, awu, event };
}

test("N4 WorldState owner persists only bounded state with a current confirmed Event and stable references", () => {
  const input = fixture();
  const gate = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.gate.id });
  const event = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.event.id });
  const applied = input.operations.applyWorldStateN4({
    projectId: input.project.id, objectId: gate.id, expectedObjectRevision: gate.revisionToken, expectedRevision: 0,
    operationId: "n4.gate.closed", effectiveAt: "2026-09-09T01:00:00Z", now: "2026-09-09T01:00:01Z",
    value: { kind: "passage", state: "closed" }, evidence: { kind: "confirmed-event", event: { id: event.id, revision: event.revisionToken } }
  });
  assert.equal(applied.idempotent, false);
  assert.deepEqual(applied.projection.value, { kind: "passage", state: "closed" });
  assert.equal(input.operations.readWorldStateN4({ projectId: input.project.id, objectId: gate.id, observedAt: "2026-09-09T00:59:00Z" }).status, "unknown");

  const key = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.key.id });
  const holder = input.operations.readWorldObject({ projectId: input.project.id, objectId: input.awu.id });
  const keyApplied = input.operations.applyWorldStateN4({
    projectId: input.project.id, objectId: key.id, expectedObjectRevision: key.revisionToken, expectedRevision: 1,
    operationId: "n4.key.awu", effectiveAt: "2026-09-09T01:00:00Z", now: "2026-09-09T01:00:02Z",
    value: { kind: "holder", state: "held", holder: { id: holder.id, revision: holder.revisionToken } }, evidence: { kind: "confirmed-event", event: { id: event.id, revision: event.revisionToken } }
  });
  assert.deepEqual(keyApplied.projection.value, { kind: "holder", state: "held", holder: { id: holder.id, revision: holder.revisionToken } });
  assert.throws(() => input.operations.applyWorldStateN4({
    projectId: input.project.id, objectId: key.id, expectedObjectRevision: key.revisionToken, expectedRevision: 2,
    operationId: "n4.key.invalid", effectiveAt: "2026-09-09T01:00:00Z", now: "2026-09-09T01:00:03Z",
    value: { kind: "passage", state: "open" }, evidence: { kind: "confirmed-event", event: { id: event.id, revision: event.revisionToken } }
  }), /Passage state/i);
});
