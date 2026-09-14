import test from "node:test";
import assert from "node:assert/strict";

import { createTianyiContinuationDraft, prepareTianyiContinuationRequest } from "../../src/storyContinuity/tianyiContinuationRequest.ts";

const response = `1. 潮汐停灯：守灯人必须维持航标，船工却要熄灯阻止追兵入港。\n2. 山路来信：送信者必须把证词带进镇，守路人却要封路保护藏身者。\n3. 河口空席：两家争夺唯一席位，见证人拒绝替任何一方背书。`;

test("continuation resolves an ordinal to the actual title and body in the bound reply", () => {
  const draft = `${createTianyiContinuationDraft("message-7", response)}只修改第二个构想，让双方都有合理动机。`;
  const prepared = prepareTianyiContinuationRequest({ draft, currentResponseMessageId: "message-7", currentResponseText: response });
  assert.equal(prepared.kind, "continuation");
  assert.equal(prepared.target?.ideaIndex, 1);
  assert.equal(prepared.target?.title, "山路来信");
  assert.match(prepared.requestText, /指定构想：第2项《山路来信》/u);
  assert.match(prepared.requestText, /守路人却要封路保护藏身者/u);
  assert.match(prepared.requestText, /不要改写来源回复中的其他构想/u);
  assert.match(prepared.requestText, /来源回复 ID：message-7/u);
});

test("continuation resolves a real title without hard-coding fixture titles", () => {
  const custom = `## 玻璃桥下\n甲必须过桥，乙却必须封桥。\n\n## 盐仓夜班\n守仓人必须开门，巡夜人却不得放行。`;
  const draft = `${createTianyiContinuationDraft("message-8", custom)}只修改《盐仓夜班》，保留地点。`;
  const prepared = prepareTianyiContinuationRequest({ draft, currentResponseMessageId: "message-8", currentResponseText: custom });
  assert.equal(prepared.target?.title, "盐仓夜班");
  assert.equal(prepared.target?.ideaIndex, 1);
});

test("continuation ignores excluded titles and resolves common item ordinals", () => {
  const excluded = prepareTianyiContinuationRequest({
    draft: "不要修改《潮汐停灯》，只修改《山路来信》。",
    continuationSource: { responseMessageId: "message-7", responseText: response }
  });
  assert.equal(excluded.kind, "continuation");
  assert.equal(excluded.target?.title, "山路来信");

  const ordinal = prepareTianyiContinuationRequest({
    draft: "只修改第二项，让双方都有合理动机。",
    continuationSource: { responseMessageId: "message-7", responseText: response }
  });
  assert.equal(ordinal.kind, "continuation");
  assert.equal(ordinal.target?.title, "山路来信");
});

test("continuation asks the author when title and ordinal conflict", () => {
  const prepared = prepareTianyiContinuationRequest({
    draft: "只修改第二项《潮汐停灯》。",
    continuationSource: { responseMessageId: "message-7", responseText: response }
  });
  assert.equal(prepared.kind, "needs-selection");
  if (prepared.kind !== "needs-selection") return;
  assert.equal(prepared.candidates.length, 3);
  assert.match(prepared.reason, /标题与序号/u);
});

test("continuation keeps whole-reply editing explicit and selected target identity separate", () => {
  const whole = prepareTianyiContinuationRequest({
    draft: "润色整条回复，保留三个构想。",
    continuationSource: { responseMessageId: "message-7", responseText: response }
  });
  assert.equal(whole.kind, "continuation");
  assert.equal(whole.target, null);

  const selected = prepareTianyiContinuationRequest({
    draft: "把冲突改成两难选择。",
    continuationSource: { responseMessageId: "message-7", responseText: response, selectedTargetIndex: 1 }
  });
  assert.equal(selected.kind, "continuation");
  assert.equal(selected.target?.title, "山路来信");
});

test("continuation refuses missing instructions, stale replies, and absent targets", () => {
  assert.throws(() => prepareTianyiContinuationRequest({ draft: createTianyiContinuationDraft("message-7", response), currentResponseMessageId: "message-7", currentResponseText: response }), /请先写下/u);
  assert.throws(() => prepareTianyiContinuationRequest({ draft: `${createTianyiContinuationDraft("message-7", response)}只修改第二个构想。`, currentResponseMessageId: "message-9", currentResponseText: response }), /目标已变化/u);
  assert.throws(() => prepareTianyiContinuationRequest({ draft: `${createTianyiContinuationDraft("message-7", response)}只修改《不存在的标题》。`, currentResponseMessageId: "message-7", currentResponseText: response }), /没有在来源回复中找到/u);
});

test("ordinary questions remain unchanged", () => {
  const prepared = prepareTianyiContinuationRequest({ draft: "整理雾港目前已知的信息。" });
  assert.deepEqual(prepared, { kind: "ordinary", requestText: "整理雾港目前已知的信息。", target: null });
});
