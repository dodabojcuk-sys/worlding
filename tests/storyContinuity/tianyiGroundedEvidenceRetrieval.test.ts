import assert from "node:assert/strict";
import test from "node:test";

import { selectTianyiGroundedEvidence } from "../../src/storyContinuity/tianyiGroundedEvidenceRetrieval.ts";

const events = Array.from({ length: 12 }, (_, index) => ({
  id: `event.${String(index + 1).padStart(2, "0")}`,
  title: `铺垫 ${index + 1}`,
  body: `这是第 ${index + 1} 条普通事件。`,
  status: "committed" as const,
  revisionToken: `${String(index + 1).padStart(2, "0")}`.repeat(32)
}));
events[8] = {
  id: "event.key-transfer",
  title: "铜钥匙交接",
  body: "北闸关闭之前，阿芜将铜钥匙正式交给林昭，并留下交接依据。",
  status: "committed",
  revisionToken: "a".repeat(64)
};

test("question retrieval reaches a decisive event beyond the old first-six cap", () => {
  const result = selectTianyiGroundedEvidence({
    scope: "current-story",
    question: "北闸关闭之前，铜钥匙交给了谁？",
    events
  });
  assert.equal(result.selected[0]?.event.id, "event.key-transfer");
  assert.match(result.selected[0]?.excerpt ?? "", /林昭/u);
  assert.match(result.selected[0]?.reason ?? "", /铜钥匙|北闸/u);
});

test("explicit selected evidence survives a low relevance score while removal and pinning remain deterministic", () => {
  const result = selectTianyiGroundedEvidence({
    scope: "selected-events",
    question: "北闸关闭之前，铜钥匙交给了谁？",
    events,
    explicitEventIds: ["event.01", "event.key-transfer"],
    pinnedEventIds: ["event.key-transfer"],
    removedEventIds: ["event.02"]
  });
  assert.deepEqual(result.selected.slice(0, 2).map((item) => item.event.id), ["event.key-transfer", "event.01"]);
  assert.equal(result.selected.some((item) => item.event.id === "event.02"), false);
});

test("changing the question changes deterministic evidence selection without retaining an old preview", () => {
  const other = { ...events[10]!, id: "event.north-gate", title: "北闸恢复通行", body: "北闸恢复通行后，林昭带队离开。", revisionToken: "b".repeat(64) };
  const source = [...events, other];
  const transfer = selectTianyiGroundedEvidence({ scope: "current-story", question: "铜钥匙交给了谁", events: source });
  const gate = selectTianyiGroundedEvidence({ scope: "current-story", question: "北闸何时恢复通行", events: source });
  assert.equal(transfer.selected[0]?.event.id, "event.key-transfer");
  assert.equal(gate.selected[0]?.event.id, "event.north-gate");
});

test("automatic retrieval does not fill a non-empty scope with zero-score events", () => {
  const result = selectTianyiGroundedEvidence({
    scope: "current-story",
    question: "完全无关的星际航线",
    events
  });
  assert.equal(result.availableCount, events.length);
  assert.equal(result.automaticMatchCount, 0);
  assert.deepEqual(result.selected, []);
});

test("explicit zero-score evidence remains available within the shared request limit", () => {
  const result = selectTianyiGroundedEvidence({
    scope: "selected-events",
    question: "完全无关的星际航线",
    events,
    explicitEventIds: ["event.01"]
  });
  assert.equal(result.selected[0]?.event.id, "event.01");
  assert.match(result.selected[0]?.reason ?? "", /当前范围/u);
  assert.throws(() => selectTianyiGroundedEvidence({
    scope: "selected-events",
    question: "无关",
    events,
    explicitEventIds: events.slice(0, 7).map((event) => event.id)
  }), /exceeds the request limit/u);
});
