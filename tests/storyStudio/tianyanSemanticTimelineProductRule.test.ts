import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const core = readFileSync("TIANYAN_PRODUCT_CORE.md", "utf8");

test("product core freezes the semantic timeline as the Event Graph foreground over screen-style time projection", () => {
  assert.match(core, /Event Graph 的语义时间投影/u);
  assert.match(core, /屏风式背景投影/u);
  assert.match(core, /连续坐标区间/u);
  assert.match(core, /正式时间未确认 · AI 推断位置/u);
  assert.match(core, /graphRevisionHash/u);
  assert.match(core, /每个有效图修订只能自动创建一次/u);
  assert.doesNotMatch(core, /“时间未定”是所有已知时间之后的最后一个同级背景隔栏/u);
});

test("semantic temporal placement remains a read-only Agent projection", () => {
  assert.match(core, /不得将推断静默写入 Event、Canon 或 WorldState/u);
  assert.match(core, /Dialogue 模式保持普通对话/u);
  assert.match(core, /自动失败不得循环重试/u);
});
