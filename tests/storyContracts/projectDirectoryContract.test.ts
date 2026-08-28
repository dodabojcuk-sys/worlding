import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  projectDirectoryContainsStableReferences,
  type ProjectDirectoryProjection
} from "../../src/storyContracts/projectDirectoryContract.ts";

test("project directory contract is a stable read-only navigation projection", () => {
  const projection: ProjectDirectoryProjection = {
    pendingCount: 2,
    classifiedCount: 1,
    groups: [{
      id: "group.library",
      label: "资料",
      kind: "group",
      children: [{
        id: "reference.character.lin-zhao",
        label: "林昭",
        kind: "reference",
        reference: { objectId: "character.lin-zhao", version: "v3", sourceId: "source.chapter-1" }
      }]
    }]
  };
  assert.equal(projectDirectoryContainsStableReferences(projection), true);
  assert.equal(projectDirectoryContainsStableReferences({ ...projection, groups: [{ id: "broken", label: "缺少引用", kind: "reference" }] }), false);
});

test("project directory contract owns no story facts or file-system tree", () => {
  const source = readFileSync("src/storyContracts/projectDirectoryContract.ts", "utf8");
  assert.doesNotMatch(source, /canonWriter|writeCanon|eventOwner|worldStateOwner|storyBody|relativePath|absolutePath/u);
  assert.match(source, /objectId/);
  assert.match(source, /version/);
  assert.match(source, /sourceId/);
});
