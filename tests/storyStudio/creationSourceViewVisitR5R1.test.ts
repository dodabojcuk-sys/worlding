import assert from "node:assert/strict";
import test from "node:test";

import { isCurrentCreationSourceViewVisit, nextCreationSourceViewVisit, sameCreationSourceScope } from "../../apps/story-studio/src/components/creation/creationSourceViewVisit.ts";

test("A to B to A creates a new visit, so the first A write/read response cannot repaint the second A screen", () => {
  const firstA = { projectId: "project-a", generation: 0 };
  const b = nextCreationSourceViewVisit(firstA, "project-b");
  const secondA = nextCreationSourceViewVisit(b, "project-a");
  assert.equal(isCurrentCreationSourceViewVisit(secondA, firstA), false);
  assert.equal(isCurrentCreationSourceViewVisit(secondA, secondA), true);
});

test("download scope only becomes current when its Story Unit and all selected formal events match", () => {
  assert.equal(sameCreationSourceScope(["event-a", "event-b"], ["event-b", "event-a"]), true);
  assert.equal(sameCreationSourceScope(["event-a"], ["event-b"]), false);
  assert.equal(sameCreationSourceScope(["event-a", "event-b"], ["event-a"]), false);
});
