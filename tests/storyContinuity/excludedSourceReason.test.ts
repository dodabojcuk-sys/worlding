import assert from "node:assert/strict";
import test from "node:test";

import { categorizeExcludedSourceReason } from "../../src/storyContinuity/index.ts";

test("excluded-source reasons retain source-specific provenance categories", () => {
  const corpus = {
    "source-count-limit": "not-selected",
    "total-excerpt-limit": "not-selected",
    "memory-not-active-approved": "not-authorized",
    "missing-or-revoked-grant": "not-authorized",
    "stale-grant": "stale",
    "source-stale": "stale",
    "memory-missing-or-deleted": "deleted",
    "source-deleted": "deleted",
    "grant-owner-mismatch": "scope-mismatch",
    "duplicate-source": "duplicate",
    "personal-default-deny": "sensitivity-redacted",
    "personal-sensitive-raw-excerpt-denied": "sensitivity-redacted",
    "source-material-unavailable": "unsupported"
  } as const;
  for (const [reason, expected] of Object.entries(corpus)) assert.equal(categorizeExcludedSourceReason(reason), expected, reason);
});

test("unknown or generic excluded-source reasons fail closed", () => {
  for (const reason of ["not-used", "failed-validation", "unknown", ""]) {
    assert.throws(() => categorizeExcludedSourceReason(reason), /Unsupported excluded-source reason/);
  }
});
