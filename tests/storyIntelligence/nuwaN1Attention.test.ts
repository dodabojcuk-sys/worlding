import assert from "node:assert/strict";
import test from "node:test";

import { selectNuwaN1Attention, type NuwaN1AttentionCandidate } from "../../src/storyIntelligence/nuwaN1Attention.ts";

const source = (id: string, summary: string, serializedBytes: number, required = false): NuwaN1AttentionCandidate => ({ key: `knowledge:${id}`, kind: "knowledge", sourceId: id, summary, serializedBytes, required });

test("N2B selects required and older goal-relevant authorized sources deterministically within budget", () => {
  const candidates = [
    source("event.scene", "当前场景：雾港断桥开始震动", 120, true),
    ...Array.from({ length: 18 }, (_, index) => source(`event.unrelated.${String(index).padStart(2, "0")}`, `很长但无关的集市历史 ${index}`, 105)),
    source("event.old-bell", "很早以前桥下钟声来自废塔的机械装置", 130)
  ];
  const input = { goal: "核实桥下钟声来源", sceneLabel: "雾港断桥", candidates, baseBytes: 1_900, maxInputTokens: 4_096, outputReserveTokens: 1_024, metadataReserveBytes: 900 };
  const first = selectNuwaN1Attention(input);
  const second = selectNuwaN1Attention({ ...input, candidates: [...candidates].reverse() });
  assert.deepEqual(first, second, "selection is stable even when an authorized source reader returns a different order");
  assert.deepEqual(first.selected.slice(0, 2).map((item) => [item.sourceId, item.reason]), [["event.scene", "current-scene-required"], ["event.old-bell", "goal-keyword-match"]]);
  assert.ok(first.budget.selectedSourceBytes <= first.budget.sourceBudgetBytes);
  assert.ok(first.excluded.count > 0, "irrelevant authorized history is not sent as one large bundle");
});

test("N2B changing the lawful goal changes ranking without adding an unavailable secret", () => {
  const candidates = [source("event.bell", "钟声来自桥下装置", 220), source("event.witness", "证人准备从北门撤离", 220)];
  const base = { sceneLabel: "雾港", candidates, baseBytes: 2_750, maxInputTokens: 4_096, outputReserveTokens: 1_024, metadataReserveBytes: 900 };
  const bell = selectNuwaN1Attention({ ...base, goal: "核实钟声" });
  const witness = selectNuwaN1Attention({ ...base, goal: "保护证人撤离" });
  assert.equal(bell.selected[0]?.sourceId, "event.bell");
  assert.equal(witness.selected[0]?.sourceId, "event.witness");
  assert.equal(JSON.stringify({ bell, witness }).includes("event.secret-never-authorized"), false);
});

test("N2B reports required-source overflow instead of truncating mandatory meaning", () => {
  const result = selectNuwaN1Attention({ goal: "继续", sceneLabel: "断桥", candidates: [source("event.must-a", "必需 A", 700, true), source("event.must-b", "必需 B", 700, true)], baseBytes: 2_200, maxInputTokens: 4_096, outputReserveTokens: 1_024, metadataReserveBytes: 900 });
  assert.equal(result.budget.requiredOverflow, true);
  assert.deepEqual(result.selected, []);
});
