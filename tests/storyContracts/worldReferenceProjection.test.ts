import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAllowedReferences,
  classifyWorldReference,
  projectWorldReferences,
  worldReferencesRelatedTo,
} from "../../src/storyContracts/worldReferenceProjection.ts";

test("world reference classification maps categories and derives natures from existing tags", () => {
  const confirmed = classifyWorldReference({ id: "character.林月如", title: "林月如", type: "character", status: "active", tags: [] });
  assert.equal(confirmed?.category, "character");
  assert.equal(confirmed?.nature, "confirmed-fact");

  const rule = classifyWorldReference({ id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["世界规则"] });
  assert.equal(rule?.category, "rule");
  assert.equal(rule?.nature, "confirmed-fact");

  const draftEvent = classifyWorldReference({ id: "event.钟声", title: "钟声起因", type: "event", status: "draft", tags: ["作者草稿"] });
  assert.equal(draftEvent?.category, "clue");
  assert.equal(draftEvent?.nature, "pending-clue");

  const rumor = classifyWorldReference({ id: "event.传闻", title: "码头传闻", type: "event", status: "draft", tags: ["推测：摆渡人"] });
  assert.equal(rumor?.nature, "rumor");

  const secret = classifyWorldReference({ id: "event.秘密", title: "灯下密约", type: "event", status: "draft", tags: ["作者秘密", "知情：林月如=已得知"] });
  assert.equal(secret?.nature, "author-note");
  assert.deepEqual(secret?.knowledge, [{ character: "林月如", state: "known" }]);
});

test("world reference knowledge parsing distinguishes known, unknown and misled", () => {
  const entry = classifyWorldReference({
    id: "event.警告", title: "阿芜留下警告", type: "event", status: "draft",
    tags: ["知情：林月如=已得知", "知情：沈砚=未知", "知情：白瑛=被误导"],
  });
  assert.deepEqual(entry?.knowledge, [
    { character: "林月如", state: "known" },
    { character: "沈砚", state: "unknown" },
    { character: "白瑛", state: "uncertain" },
  ]);
});

test("world reference related lookup resolves titles, aliases and tag references", () => {
  const entries = projectWorldReferences([
    { id: "event.接头", title: "栈桥接头", type: "event", status: "draft", tags: ["单元：北滨码头", "人物：林月如、沈砚"] },
    { id: "location.北滨码头", title: "北滨码头", type: "location", status: "active", tags: ["港区"], aliases: ["旧渡口"] },
    { id: "item.钥匙", title: "黄铜钥匙", type: "item", status: "active", tags: ["物品：黄铜钥匙"] },
  ]);
  assert.deepEqual(worldReferencesRelatedTo(entries, "北滨码头").map((entry) => entry.id), ["event.接头", "location.北滨码头"]);
  assert.deepEqual(worldReferencesRelatedTo(entries, "林月如").map((entry) => entry.id), ["event.接头"]);
  assert.deepEqual(worldReferencesRelatedTo(entries, "旧渡口").map((entry) => entry.id), ["location.北滨码头"]);
  assert.equal(worldReferencesRelatedTo(entries, "黄铜钥匙").length, 1);
  assert.equal(worldReferencesRelatedTo(entries, "").length, 0);
});

test("character agent preparation excludes author notes, rumors and unknown knowledge", () => {
  const entries = projectWorldReferences([
    { id: "rule.潮汐", title: "潮汐信令", type: "rule", status: "active", tags: [] },
    { id: "event.公开", title: "公开接头", type: "event", status: "active", tags: ["知情：林月如=已得知", "知情：沈砚=未知"] },
    { id: "event.秘密", title: "灯下密约", type: "event", status: "draft", tags: ["作者秘密"] },
    { id: "event.传闻", title: "码头传闻", type: "event", status: "draft", tags: ["推测：摆渡人"] },
  ]);
  const allowed = characterAllowedReferences(entries, "林月如");
  assert.deepEqual(allowed.map((entry) => entry.id), ["rule.潮汐", "event.公开"]);
  const shenAllowed = characterAllowedReferences(entries, "沈砚");
  assert.deepEqual(shenAllowed.map((entry) => entry.id), ["rule.潮汐"], "a character must not read events marked unknown to them");
});
