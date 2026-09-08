import assert from "node:assert/strict";
import test from "node:test";

import { projectProjectionInvalidationMode } from "../../apps/story-studio/src/lib/projectProjectionInvalidation.ts";

test("only actual projection owners fence World Library and Story Unit reads", () => {
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/world-objects/update", "POST"), "boundary");
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/story-units/update", "POST"), "boundary");
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/nuwa-n1/auto-apply", "POST"), "boundary");
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/nuwa-n1/continuous", "POST"), "completion", "a slow Provider-backed operation invalidates only after its optional owner write completes");
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/model-service/minimal-inference", "POST"), "none");
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/tianyi/prediction/abandon", "POST"), "none");
  assert.equal(projectProjectionInvalidationMode("/__local/story-studio/world-library", "GET"), "none");
});
