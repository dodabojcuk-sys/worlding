import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacterContextPack, type CharacterContextPackInput } from "../../src/storyContracts/characterContextPack.ts";
import { projectWorldReferences } from "../../src/storyContracts/worldReferenceProjection.ts";

const worldObjects = [
  { id: "location.北滨码头", title: "北滨码头", type: "location", status: "active", tags: ["港区"], aliases: [] },
  { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["单元：北滨码头"], aliases: [] },
  { id: "event.接头", title: "栈桥接头", type: "event", status: "active", tags: ["知情：林月如=已得知", "知情：沈砚=未知"], aliases: [] },
  { id: "event.真相", title: "钟声的真相", type: "event", status: "draft", tags: ["作者秘密", "知情：林月如=已得知"], aliases: [] },
  { id: "event.传闻", title: "渡口的传闻", type: "event", status: "draft", tags: ["推测：摆渡人", "时间：未知"], aliases: [] },
];
const references = projectWorldReferences(worldObjects);

function packFor(characterTitle: string): ReturnType<typeof buildCharacterContextPack> {
  const input: CharacterContextPackInput = {
    characterTitle,
    sceneFrame: { title: "北滨码头", worldTimeLabel: "第三年秋 · 夜" },
    goal: "核实钟声来源。",
    profileCore: "护主心切", boundaries: "不伤害无辜",
    worldReferences: references,
    relations: [{ other: "沈砚", typeLabel: "旧识", directionLabel: "双向" }],
    memories: [
      { id: "m1", label: "亲历", title: "栈桥接头", summary: "雨夜的栈桥接头。", occurredAt: "第三年秋 · 夜", validity: "active" },
      { id: "m2", label: "听闻", title: "外海灯语", summary: "外海传来新的灯语，与码头无关的旧事。", occurredAt: "第三年夏", validity: "active" },
      { id: "m3", label: "亲历", title: "潮汐信令演练", summary: "在北滨码头演练过潮汐信令。", occurredAt: "第三年秋", validity: "active" },
      { id: "m4", label: "听闻", title: "失效的旧情报", summary: "已回溯的旧情报。", occurredAt: "第三年春", validity: "invalidated" },
    ],
    visibleEventTitles: ["栈桥接头"],
  };
  return buildCharacterContextPack(input);
}

test("character known facts and safe rules enter the context pack", () => {
  const pack = packFor("林月如");
  const titles = pack.includedFacts.map((fact) => fact.title);
  assert.ok(titles.includes("北滨码头"), "current scene location is included");
  assert.ok(titles.includes("潮汐信令"), "world rules are included");
  assert.ok(titles.includes("栈桥接头"), "a fact the character knows (知情=已得知) is included");
  assert.ok(pack.visibleEvents.includes("栈桥接头"));
  assert.equal(pack.providerCalls, 0);
});

test("author secrets and character-unknown facts are excluded with reasons", () => {
  const lin = packFor("林月如");
  const linExcluded = Object.fromEntries(lin.excluded.map((item) => [item.title, item.reason]));
  assert.equal(linExcluded["钟声的真相"], "author-note", "author secrets never enter, even when the character knows them");
  assert.equal(linExcluded["渡口的传闻"], "rumor");

  const shen = packFor("沈砚");
  const shenTitles = shen.includedFacts.map((fact) => fact.title);
  assert.ok(!shenTitles.includes("栈桥接头"), "沈砚 must not read the fact marked 知情：沈砚=未知");
  assert.ok(shen.excluded.some((item) => item.title === "栈桥接头" && item.reason === "character-unknown"));
  assert.notDeepEqual(lin.includedFacts.map((f) => f.title).sort(), shen.includedFacts.map((f) => f.title).sort(), "different characters get different packs");
});

test("memory retrieval returns only scene-related records, never the full ledger", () => {
  const pack = packFor("林月如");
  const memoryTitles = pack.includedMemories.map((memory) => memory.title);
  assert.deepEqual(memoryTitles, ["栈桥接头", "潮汐信令演练"], "only scene/fact-related active memories are retrieved");
  assert.ok(pack.includedMemories.length < 4, "the full ledger is not dumped into the pack");
  assert.ok(!memoryTitles.includes("失效的旧情报"), "invalidated memories are never retrieved");
  // deterministic: same input twice → identical estimated token count
  assert.equal(packFor("林月如").estimatedTokens, pack.estimatedTokens);
  assert.ok(pack.estimatedTokens > 0);
});
