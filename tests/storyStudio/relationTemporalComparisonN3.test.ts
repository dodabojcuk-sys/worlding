import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  compareRelationsAtWorldTimes,
  relationActiveAtWorldTime,
  relationWorldTimeUnknownReason,
  relationWorldTimeOptions
} from "../../src/storyContracts/relationTemporalComparison.ts";
import type { RelationReadProjectionR0 } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";

const progression = readFileSync("apps/story-studio/src/components/event-observation/StoryProgressionWorkspace.tsx", "utf8");
const comparisonContract = readFileSync("src/storyContracts/relationTemporalComparison.ts", "utf8");

function relation(input: {
  id: string;
  from?: string | null;
  to?: string | null;
  type?: string;
  supersedes?: string | null;
  confidence?: "high" | "medium" | "low" | "unknown";
  archived?: boolean;
}): RelationReadProjectionR0 {
  return {
    relationId: input.id,
    sourceObjectId: "character.a",
    targetObjectId: "character.b",
    relationTypeId: input.type ?? "relation-type.ally",
    relationLabelSnapshot: input.type ?? "同盟",
    direction: "forward",
    reviewState: "confirmed",
    evidenceRefs: [{ kind: "confirmed-event", reference: { eventId: `event.${input.id}` } }],
    provenance: { kind: "manual-author" },
    sourceRevision: "fixture",
    revision: 1,
    archived: input.archived ?? false,
    supersedesRelationId: input.supersedes ?? null,
    decisionReceipt: null,
    temporal: input.from === undefined ? null : {
      version: "story-relation-temporal/v1",
      validFrom: input.from ?? null,
      validTo: input.to ?? null,
      confidence: input.confidence ?? "high",
      sourceAnchors: []
    },
    currentTypeLabel: input.type ?? "同盟",
    relationType: null,
    relationTypeResolution: "resolved",
    evidenceWarnings: []
  };
}

test("N3 relation comparison reports added, ended and maintained from world-valid time", () => {
  const comparison = compareRelationsAtWorldTimes([
    relation({ id: "maintained", from: "2026-01-01T00:00:00.000Z" }),
    { ...relation({ id: "added", from: "2026-01-08T00:00:00.000Z" }), sourceObjectId: "character.c" },
    { ...relation({ id: "ended", from: "2026-01-01T00:00:00.000Z", to: "2026-01-04T00:00:00.000Z", archived: true }), targetObjectId: "character.d" }
  ], "2026-01-02T00:00:00.000Z", "2026-01-09T00:00:00.000Z");
  assert.deepEqual(comparison.rows.map((row) => [row.lineageId, row.kind]).sort(), [
    ["added", "added"],
    ["ended", "ended"],
    ["maintained", "maintained"]
  ]);
});

test("N3 relation comparison follows correction lineage and keeps unknown time separate", () => {
  const comparison = compareRelationsAtWorldTimes([
    relation({ id: "old", from: "2026-01-01T00:00:00.000Z", to: "2026-01-05T00:00:00.000Z", type: "relation-type.ally" }),
    relation({ id: "new", from: "2026-01-06T00:00:00.000Z", type: "relation-type.rival", supersedes: "old" }),
    relation({ id: "unknown", from: null }),
    relation({ id: "uncertain", from: "2026-01-01T00:00:00.000Z", confidence: "unknown" })
  ], "2026-01-02T00:00:00.000Z", "2026-01-09T00:00:00.000Z");
  assert.equal(comparison.rows.find((row) => row.lineageId === "old")?.kind, "changed");
  assert.deepEqual(comparison.unknown.map((item) => [item.relation.relationId, item.reason]), [
    ["uncertain", "uncertain-world-time"],
    ["unknown", "missing-valid-from"]
  ]);
});

test("N3 relation comparison surfaces overlapping correction records as conflict", () => {
  const comparison = compareRelationsAtWorldTimes([
    relation({ id: "old", from: "2026-01-01T00:00:00.000Z" }),
    relation({ id: "new", from: "2026-01-05T00:00:00.000Z", type: "relation-type.rival", supersedes: "old" })
  ], "2026-01-02T00:00:00.000Z", "2026-01-09T00:00:00.000Z");
  assert.deepEqual(comparison.conflicts.map((item) => [item.lineageId, item.at, item.relations.map((relation) => relation.relationId)]), [
    ["old", "t2", ["new", "old"]]
  ]);
  assert.equal(comparison.rows.length, 0);
});

test("N3 relation comparison ignores record timestamps and retains archived world-time evidence", () => {
  const archived = relation({ id: "archived", from: "2026-01-01T00:00:00.000Z", archived: true });
  archived.decisionReceipt = { receiptId: "receipt.system-late", action: "archive", actor: "author", operationId: "operation.system-late", inputRevision: 1, resultRevision: 2, timestamp: "2099-01-01T00:00:00.000Z" };
  const comparison = compareRelationsAtWorldTimes([archived], "2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z");
  assert.equal(comparison.rows[0]?.kind, "maintained");
  assert.deepEqual(relationWorldTimeOptions([archived]), ["2026-01-01T00:00:00.000Z"]);
});

test("shared historical relation reader includes an archived relation and validTo boundary without string ordering", () => {
  const archived = relation({ id: "archived-boundary", from: "2026-01-01T01:00:00+01:00", to: "2026-01-01T02:00:00+01:00", archived: true });
  assert.equal(relationActiveAtWorldTime(archived, "2026-01-01T01:00:00.000Z"), true);
  assert.equal(relationActiveAtWorldTime(archived, "2026-01-01T01:00:00.001Z"), false);
  assert.equal(relationWorldTimeUnknownReason(relation({ id: "unknown-boundary", from: null })), "missing-valid-from");
  assert.equal(relationActiveAtWorldTime(relation({ id: "invalid-boundary", from: "not-a-time" }), "2026-01-01T00:00:00.000Z"), false);
});

test("N3 relationship workspace exposes the Owner-backed dual-world-time author flow", () => {
  assert.match(progression, /includeArchived: true/u);
  assert.match(progression, /data-work-version-id=\{props\.workVersionId/u);
  assert.match(progression, /\[props\.projectId, props\.workVersionId, props\.relations\]/u);
  assert.match(progression, /compareRelationsAtWorldTimes/u);
  assert.match(progression, /人物或对象/u);
  assert.match(progression, /开始 T1/u);
  assert.match(progression, /后来 T2/u);
  assert.match(progression, /系统记录时间、归档动作、人物听闻和图形位置/u);
  assert.match(progression, /时间未知/u);
  assert.match(progression, /时间冲突/u);
  assert.match(progression, /event-line\?eventTask=story&eventId=/u);
  assert.match(progression, /new URLSearchParams\(\{[\s\S]*runId: nuwaRunId/u);
  assert.doesNotMatch(comparisonContract, /fetch\(|localStorage|sessionStorage|providerGateway/u);
});
