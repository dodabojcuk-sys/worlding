import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("TIANYAN_PRODUCT_CORE.md", "utf8");

test("product core freezes timeline as an independent projection of shared Event identity", () => {
  assert.match(core, /独立时间编排组件/u);
  assert.match(core, /引用同一批 Event ID/u);
  assert.match(core, /连续 X 轴/u);
  assert.match(core, /正式时间未确认 · AI 推断位置/u);
  assert.match(core, /graphRevisionHash/u);
  assert.match(core, /Provider 调用与新建 Agent Run 都必须为零/u);
  assert.match(core, /本地确定性“基础布局”/u);
  assert.match(core, /作者明确点击 AI 工具、确认范围与费用预估/u);
  assert.doesNotMatch(core, /每个有效图修订只能自动创建一次/u);
  assert.doesNotMatch(core, /“时间未定”是所有已知时间之后的最后一个同级背景隔栏/u);
});

test("semantic temporal placement remains a read-only Agent projection", () => {
  assert.match(core, /不得将推断静默写入 Event、Canon 或 WorldState/u);
  assert.match(core, /Dialogue 模式保持普通对话/u);
  assert.match(core, /author-retry 显式重试/u);
});
