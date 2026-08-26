import assert from "node:assert/strict";
import test from "node:test";

import { createTianyiOperationId, createTianyiSelectionRef } from "../../apps/story-studio/src/components/tianyi/tianyiOperationId.ts";

test("Tianyi UI operation IDs remain unique for consecutive same-tick actions", () => {
  const values = Array.from({ length: 100 }, () => createTianyiOperationId("memory candidate"));
  assert.equal(new Set(values).size, values.length);
  assert.equal(values.every((value) => /^operation\.memory-candidate\.[a-f0-9-]{36}$/u.test(value)), true);
});

test("Tianyi Brief selection references remain unique for consecutive same-tick drafts", () => {
  const values = Array.from({ length: 100 }, () => createTianyiSelectionRef());
  assert.equal(new Set(values).size, values.length);
  assert.equal(values.every((value) => /^selection\.[a-f0-9-]{36}$/u.test(value)), true);
});
