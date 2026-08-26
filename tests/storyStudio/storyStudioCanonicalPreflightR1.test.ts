import assert from "node:assert/strict";
import test from "node:test";

import {
  TIANYAN_ALLOWED_CANONICAL_BRANCHES,
  verifyStoryStudioCanonicalPreflight
} from "../../scripts/verify-story-studio-canonical.mjs";

test("development preflight proves independent canonical identity and accepted ancestry", () => {
  const result = verifyStoryStudioCanonicalPreflight(process.cwd());
  assert.equal(result.root, process.cwd());
  assert.equal(result.commonDir, `${process.cwd()}/.git`);
  assert.ok(TIANYAN_ALLOWED_CANONICAL_BRANCHES.includes(result.branch));
  assert.equal(result.acceptedBase, "ed4981c31722cfc57e706c34a5a9f696b1ae614b");
});
