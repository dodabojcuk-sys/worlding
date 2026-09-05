import assert from "node:assert/strict";
import test from "node:test";

import { buildEventLocalIndicators, buildEventSemanticHierarchy, buildEventSemanticNode } from "../../src/storyContracts/eventSemanticHierarchy.ts";

test("Event semantic hierarchy reuses event ids and keeps adjacency separate from causality", () => {
  const hierarchy = buildEventSemanticHierarchy([
    { id: "event.a", title: "收到信", tags: ["Unit：潮痕", "Set Point：来信", "Story Line：主线", "Time：18:20"], revision: "r1", status: "committed" },
    { id: "event.b", title: "打开灯塔", tags: ["作者确认", "Unit：潮痕", "Set Point：灯塔", "Story Line：主线", "Time：未知"], properties: { causedBy: "event.a" }, revision: "r2", status: "committed" }
  ]);
  assert.deepEqual(hierarchy.storyUnits[0]?.eventIds, ["event.a", "event.b"]);
  assert.equal(hierarchy.setPoints.length, 2);
  assert.equal(hierarchy.nodes[1]?.id, "event.b");
  assert.equal(hierarchy.nodes[1]?.status, "confirmed");
  assert.equal(hierarchy.nodes[0]?.storyLine.kind, "main", "Chinese 主线 is the formal main track, not a custom branch.");
  assert.equal(hierarchy.nodes[1]?.time.kind, "unknown");
  assert.ok(hierarchy.edges.some((edge) => edge.kind === "causal" && edge.source === "event.a" && edge.target === "event.b"));
  assert.ok(hierarchy.edges.some((edge) => edge.kind === "adjacent" && edge.label.includes("非因果")));
});

test("local indicators stay unknown without evidence and expose provenance when present", () => {
  const unknown = buildEventLocalIndicators({ id: "event.unknown", title: "未说明", tags: [], revision: "r1" });
  assert.equal(unknown.find((item) => item.id.endsWith(":emotion"))?.value, null);
  assert.equal(unknown.find((item) => item.id.endsWith(":emotion"))?.unknownReason, "当前 Event 没有足够来源证据。");
  const sourced = buildEventLocalIndicators({ id: "event.sourced", title: "有证据", properties: { emotion: "压抑", openQuestions: ["谁在说话？"], foreshadowPlanted: "true" }, revision: "r2", source: { ref: "archive:1", hash: "hash:1", version: "v2", excerpt: "原话" } });
  const emotion = sourced.find((item) => item.id.endsWith(":emotion"));
  assert.equal(emotion?.valueLabel, "压抑");
  assert.equal(emotion?.ruleModelAuthor, "author");
  assert.deepEqual(emotion?.sourceRefs, ["archive:1"]);
  assert.equal(sourced.find((item) => item.id.endsWith(":open-questions"))?.value, 1);
});

test("status and story-line labels distinguish prediction from confirmed fact", () => {
  const node = buildEventSemanticNode({ id: "event.prediction", title: "可能发生", tags: ["状态：预测", "Story Line：隐线"], revision: "r1" });
  assert.equal(node.status, "prediction");
  assert.equal(node.storyLine.kind, "hidden");
});

test("ISO calendar dates remain exact while explicit intervals remain ranges", () => {
  const exact = buildEventSemanticNode({ id: "event.exact", title: "精确日期", tags: ["时间：2026-09-03"] });
  const range = buildEventSemanticNode({ id: "event.range", title: "日期区间", tags: ["时间：2026-09-02 00:00 – 2026-09-03 00:00"] });
  const relative = buildEventSemanticNode({ id: "event.relative", title: "相对日期", tags: ["时间：之后三天"] });

  assert.equal(exact.time.kind, "exact");
  assert.equal(exact.time.start, "2026-09-03");
  assert.equal(range.time.kind, "range");
  assert.equal(range.time.start, "2026-09-02 00:00");
  assert.equal(range.time.end, "2026-09-03 00:00");
  assert.equal(relative.time.kind, "relative");
});
