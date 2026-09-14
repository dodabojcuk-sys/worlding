import test from "node:test";
import assert from "node:assert/strict";
import { readCreativeComposerDraft, writeCreativeComposerDraftBody } from "../../apps/story-studio/src/components/tianyi/workspace/creativeComposerDraft.ts";

test("saved Tianyi reply opens as editable body while preserving source identity in the existing slot", () => {
  const saved = "创意草稿 · 来自天意回复 event.answer-1\n来源：北湾区域、雾港\n\n1. 河道断流：正文";
  assert.deepEqual(readCreativeComposerDraft(saved), { body: "1. 河道断流：正文", source: { responseMessageId: "event.answer-1", labels: "北湾区域、雾港" } });
  assert.equal(writeCreativeComposerDraftBody(saved, "1. 河道断流：修改后的正文"), "创意草稿 · 来自天意回复 event.answer-1\n来源：北湾区域、雾港\n\n1. 河道断流：修改后的正文");
});

test("ordinary creative drafts remain byte-for-byte editable without invented provenance", () => {
  const draft = "没有来源头的作者草稿\n第二段";
  assert.deepEqual(readCreativeComposerDraft(draft), { body: draft, source: null });
  assert.equal(writeCreativeComposerDraftBody(draft, "作者修改"), "作者修改");
});
