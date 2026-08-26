import assert from "node:assert/strict";
import test from "node:test";

import { alignCharacterCardHistory } from "../../src/storyCardPresentation/characterCardHistoryProjection.ts";

test("combined card history aligns shared operations without merging owner ledgers", () => {
  const history = alignCharacterCardHistory({
    markdown: { revisions: [revision("revision.2", "save", "operation.shared", "2026-07-13T10:00:00.000Z"), revision("revision.1", "create", "operation.create", "2026-07-13T09:00:00.000Z")], milestones: [{ id: "milestone.1", title: "Content ready", revisionId: "revision.2", sequence: 1 }] },
    presentation: { revisions: [revision("revision.3", "restore", null, "2026-07-13T11:00:00.000Z"), revision("revision.2", "save", "operation.shared", "2026-07-13T10:00:00.000Z"), revision("revision.1", "create", "operation.create", "2026-07-13T09:00:00.000Z")], milestones: [] }
  });
  assert.equal(history.length, 3);
  assert.deepEqual(history.find((action) => action.operationId === "operation.shared")?.entries.map((entry) => entry.owner), ["markdown", "presentation"]);
  assert.deepEqual(history.find((action) => action.operationId === "operation.shared")?.entries[0].milestoneTitles, ["Content ready"]);
  assert.equal(history[0].entries.length, 1);
  assert.equal(history[0].entries[0].owner, "presentation");
  assert.match(history[0].entries[0].summary, /追加新版本/u);
});

function revision(id: string, source: "create" | "save" | "restore", operationId: string | null, recordedAt: string) {
  return { id, sequence: Number(id.split(".").at(-1)), source, recordedAt, restoredFromRevisionId: null, operationId };
}
