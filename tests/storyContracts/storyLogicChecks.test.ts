import assert from "node:assert/strict";
import test from "node:test";

import { runLocalStoryLogicChecks } from "../../src/storyContracts/storyLogicChecks.ts";

test("local story checks are deterministic, network-free and detect structural integrity failures", () => {
  const findings = runLocalStoryLogicChecks({
    events: [
      { id: "event.a", revisionToken: "r2", status: "committed", tags: ["单元：雾港"] },
      { id: "event.b", revisionToken: "r1", status: "committed", tags: [] }
    ],
    relations: [
      { relationId: "relation.1", sourceEventId: "event.a", targetEventId: "event.b", reviewState: "confirmed", relationTypeId: "before" },
      { relationId: "relation.2", sourceEventId: "event.b", targetEventId: "event.a", reviewState: "confirmed", relationTypeId: "before" },
      { relationId: "relation.3", sourceEventId: "event.a", targetEventId: "event.missing", reviewState: "candidate", relationTypeId: null, relationTypeResolution: "unresolved" }
    ],
    unitIds: ["仓库"],
    cachedEventRevisions: { "event.a": "r1" }
  });
  assert.deepEqual([...new Set(findings.map((finding) => finding.kind))].sort(), ["dangling-relation", "orphan-unit-reference", "stale-version", "temporal-cycle", "unresolved-relation-type"].sort());
  assert.equal(findings.every((finding) => finding.source === "local" && finding.confidence === 1), true);
});
