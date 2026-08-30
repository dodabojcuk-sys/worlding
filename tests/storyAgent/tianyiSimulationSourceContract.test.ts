import assert from "node:assert/strict";
import test from "node:test";
import { buildTianyiSimulationContextPack, inferTianyiSimulationIntent } from "../../src/storyAgent/tianyiSimulationSourceContract.ts";

const source = (sourceId: string, authorityLevel: "canon" | "confirmed-event" | "draft" | "candidate" | "derived-branch" | "creation-projection") => ({
  sourceId, sourceType: "event", authorityLevel, revisionOrDigest: `${sourceId}-r1`, displayTitle: sourceId, inclusionReason: "事件线邻近内容", branchOrUniverse: null
});

test("simulation ContextPack freezes an explicit allowlist and excludes unselected branches", () => {
  const pack = buildTianyiSimulationContextPack({ entryPoint: "event-line", intent: "PAYOFF", anchorId: "event-a", strict: true, sources: [source("event-a", "confirmed-event"), source("canon-rule", "canon"), source("other-universe", "derived-branch"), source("rejected", "candidate")] });
  assert.equal(pack.sourceState, "READY");
  assert.deepEqual(pack.sources.map((item) => item.sourceId), ["event-a", "canon-rule"]);
  assert.equal(pack.sources[0]?.sourceRole, "ANCHOR");
  assert.equal(pack.sources[1]?.sourceRole, "CONSTRAINT");
  assert.equal(pack.omitted.length, 2);
  assert.equal(pack.maxProviderCalls, 1);
});

test("strict simulation without an anchor is insufficient and does not create an allowlist", () => {
  const pack = buildTianyiSimulationContextPack({ entryPoint: "tianyi", intent: "INFERENCE", strict: true, sources: [source("canon-rule", "canon")] });
  assert.equal(pack.sourceState, "INSUFFICIENT");
  assert.equal(pack.sources.some((item) => item.sourceRole === "ANCHOR"), false);
});

test("an author-selected draft remains an Anchor without acquiring Canon authority", () => {
  const pack = buildTianyiSimulationContextPack({ entryPoint: "event-line", intent: "FORECAST", strict: true, anchorId: "draft-event", sources: [
    { ...source("draft-event", "creation-projection"), authorityLevel: "draft" },
    source("unselected-pending", "candidate")
  ] });
  assert.equal(pack.sourceState, "READY");
  assert.deepEqual(pack.sources.map((item) => [item.sourceId, item.sourceRole, item.authorityLevel]), [["draft-event", "ANCHOR", "draft"]]);
  assert.equal(pack.omitted[0]?.sourceId, "unselected-pending");
});

test("an author-selected pending candidate remains an Anchor without acquiring confirmed authority", () => {
  const pack = buildTianyiSimulationContextPack({ entryPoint: "tianyi", intent: "DIVERGENCE", strict: true, anchorId: "pending-relation", sources: [
    source("pending-relation", "candidate"),
    source("unselected-branch", "derived-branch")
  ] });
  assert.equal(pack.sourceState, "READY");
  assert.deepEqual(pack.sources.map((item) => [item.sourceId, item.sourceRole, item.authorityLevel]), [["pending-relation", "ANCHOR", "candidate"]]);
  assert.deepEqual(pack.omitted, [{ sourceId: "unselected-branch", reason: "默认隔离的派生或未确认内容" }]);
});

test("simulation direction is inferred locally without an extra provider call", () => {
  assert.equal(inferTianyiSimulationIntent("这条缺页线索以后可以怎么回收？"), "PAYOFF");
  assert.equal(inferTianyiSimulationIntent("只根据现在的证据，谁最可能接触过它？"), "INFERENCE");
  assert.equal(inferTianyiSimulationIntent("给我一个完全不同的新思路"), "DIVERGENCE");
});
