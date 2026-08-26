import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTianyiRequestContextBudgetProjection,
  estimateTianyiRequestContextUnits,
  type TianyiRequestContextBudgetInput
} from "../../src/storyContinuity/tianyiRequestContextBudget.ts";

const HASH = "a".repeat(64);
const GRANT_HASH = "b".repeat(64);

test("request budget projection is deterministic, provider-neutral, and priority ordered", () => {
  const input = fixture(24);
  const first = buildTianyiRequestContextBudgetProjection(input);
  const second = buildTianyiRequestContextBudgetProjection({
    ...structuredClone(input),
    authorSelectedSources: [...input.authorSelectedSources].reverse(),
    authorizedMemories: [...input.authorizedMemories].reverse(),
    recentMessages: [...input.recentMessages].reverse()
  });

  assert.deepEqual(first, second);
  assert.equal(first.status, "ready");
  assert.deepEqual(first.sources.included.map((item) => item.id), ["scene.current", "object.a", "object.b", "memory.a", "memory.z"]);
  assert.deepEqual(first.sources.excluded, []);
  assert.deepEqual(first.messages.included.map((item) => item.id), ["event.4"]);
  assert.deepEqual(first.messages.excluded.map((item) => [item.id, item.reason]), [
    ["event.1", "recent-message-window-closed"],
    ["event.2", "recent-message-window-closed"],
    ["event.3", "hard-budget-exceeded"]
  ]);
  assert.deepEqual(first.budget, {
    estimator: "nfc-unicode-code-points-v1",
    unit: "unicode-code-point",
    hardLimitUnits: 24,
    estimatedInputUnits: 35,
    estimatedIncludedUnits: 22,
    remainingUnits: 2
  });
  assert.equal(first.archivePolicy, "preserve-complete-archive");
  assert.equal(first.semanticCompressionApplied, false);
});

test("required current context is atomic and blocks rather than truncating", () => {
  const input = fixture(5);
  input.currentContext = [current("scene.current", "123456")];
  const projection = buildTianyiRequestContextBudgetProjection(input);

  assert.equal(projection.status, "blocked");
  assert.equal(projection.blockedReason, "required-context-exceeds-hard-budget");
  assert.equal(projection.budget.estimatedIncludedUnits, 0);
  assert.deepEqual(projection.sources.included, []);
  assert.equal(projection.sources.excluded.find((item) => item.id === "scene.current")?.reason, "required-context-exceeds-hard-budget");
  assert.ok(projection.sources.excluded.filter((item) => item.id !== "scene.current").every((item) => item.reason === "projection-blocked"));
  assert.ok(projection.messages.excluded.every((item) => item.reason === "projection-blocked"));
});

test("missing required context blocks the entire request projection", () => {
  const input = fixture(40);
  input.currentContext = [];
  const projection = buildTianyiRequestContextBudgetProjection(input);

  assert.equal(projection.status, "blocked");
  assert.equal(projection.blockedReason, "required-current-context-missing");
  assert.equal(projection.sources.included.length, 0);
  assert.equal(projection.messages.included.length, 0);
  assert.ok(projection.sources.excluded.every((item) => item.reason === "projection-blocked"));
});

test("whole candidates are excluded explicitly and the caller-owned Archive input is untouched", () => {
  const input = fixture(15);
  input.authorSelectedSources = [selected("object.oversized", "x".repeat(20)), selected("object.small", "12")];
  input.authorizedMemories = [];
  input.recentMessages[0]!.content = "ARCHIVE_CANARY";
  const before = structuredClone(input);
  deepFreeze(input);

  const projection = buildTianyiRequestContextBudgetProjection(input);

  assert.deepEqual(input, before);
  assert.deepEqual(projection.sources.included.map((item) => item.id), ["scene.current", "object.small"]);
  assert.deepEqual(projection.sources.excluded, [{ id: "object.oversized", role: "author-selected-source", estimatedUnits: 20, reason: "hard-budget-exceeded" }]);
  assert.equal(projection.archivePolicy, "preserve-complete-archive");
  assert.equal(JSON.stringify(projection).includes("ARCHIVE_CANARY"), false, "projection must return references and estimates, not copied Archive prose");
});

test("authorized Memory proof and exact candidate identity fail closed", () => {
  const missingGrant = structuredClone(fixture(40)) as unknown as { authorizedMemories: Array<Record<string, unknown>> };
  missingGrant.authorizedMemories[0]!.grantHash = null;
  missingGrant.authorizedMemories[0]!.scope = "author-global";
  assert.throws(() => buildTianyiRequestContextBudgetProjection(missingGrant as unknown as TianyiRequestContextBudgetInput), /requires a current project grant hash/i);

  const unauthorized = structuredClone(fixture(40)) as unknown as { authorizedMemories: Array<Record<string, unknown>> };
  unauthorized.authorizedMemories[0]!.authorization = "unauthorized";
  assert.throws(() => buildTianyiRequestContextBudgetProjection(unauthorized as unknown as TianyiRequestContextBudgetInput), /not authorized/i);

  const duplicate = fixture(40);
  duplicate.authorSelectedSources.push(selected("scene.current", "duplicate"));
  assert.throws(() => buildTianyiRequestContextBudgetProjection(duplicate), /Duplicate Tianyi request source identifier/);
});

test("unit estimation is NFC-stable and never returns a zero-cost item", () => {
  assert.equal(estimateTianyiRequestContextUnits(""), 1);
  assert.equal(estimateTianyiRequestContextUnits("é"), 1);
  assert.equal(estimateTianyiRequestContextUnits("e\u0301"), 1);
  assert.equal(estimateTianyiRequestContextUnits("故事"), 2);
});

function fixture(hardBudgetUnits: number): TianyiRequestContextBudgetInput {
  return {
    hardBudgetUnits,
    currentContext: [current("scene.current", "1234")],
    authorSelectedSources: [selected("object.b", "1234"), selected("object.a", "123")],
    authorizedMemories: [memory("memory.z", "123456", "author-global"), memory("memory.a", "123", "project")],
    recentMessages: [
      message("event.2", 2, "123456"),
      message("event.4", 4, "12"),
      message("event.1", 1, "123"),
      message("event.3", 3, "1234")
    ]
  };
}

function current(id: string, content: string) {
  return { id, contentHash: HASH, content, state: "current" as const };
}

function selected(id: string, content: string) {
  return { ...current(id, content), authorSelected: true as const };
}

function memory(id: string, content: string, scope: "project" | "author-global") {
  return {
    ...current(id, content),
    scope,
    authorization: "authorized" as const,
    grantHash: scope === "author-global" ? GRANT_HASH : null
  };
}

function message(id: string, sequence: number, content: string) {
  return { ...current(id, content), sessionId: "session.000001", sequence };
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}
