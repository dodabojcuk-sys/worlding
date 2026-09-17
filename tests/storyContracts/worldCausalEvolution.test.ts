import assert from "node:assert/strict";
import test from "node:test";

import {
  attachTimeFrames,
  buildWorldContextPack,
  projectCausalEvolution,
} from "../../src/storyContracts/worldCausalEvolution.ts";
import { projectWorldReferences } from "../../src/storyContracts/worldReferenceProjection.ts";

const tidalBody = [
  "潮汐信令是北溟港以钟声报潮的公共信令。",
  "## 定义",
  "三短一长的钟声表示大潮将至，所有渡船必须回港。",
  "## 适用范围",
  "北溟港及周围半个时辰水路内的船只。",
  "## 起源与原因",
  "三十年前的沉船夜之后由港务设立。",
  "## 运作机制",
  "由港务塔的守钟人观测潮位并敲钟。",
  "## 利益与代价",
  "船主受益；守钟人承担夜班代价。",
  "## 演化",
  "从两短一长改为三短一长。",
  "## 变体与例外",
  "战时改用鼓声；私渡不遵守。",
].join("\n");

const tidal = { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["世界规则", "单元：北滨码头", "时间：第三年秋"], body: tidalBody, relativeId: "world/rules/潮汐信令.md" };

test("causal evolution card parses body sections with sources and honest gaps", () => {
  const card = projectCausalEvolution(tidal);
  assert.equal(card.version, "tianyan-world-causal-evolution/r0");
  assert.equal(card.definition.source, "object-body");
  assert.ok(card.definition.text?.includes("三短一长"));
  assert.equal(card.origin.text?.includes("沉船夜"), true);
  assert.equal(card.mechanism.text?.includes("守钟人"), true);
  assert.equal(card.interests.text?.includes("船主受益"), true);
  assert.equal(card.variants.text?.includes("战时改用鼓声"), true);
  // 无对应章节的字段必须诚实为空
  assert.equal(card.scope.text, null);
  assert.equal(card.scope.source, null);
  assert.equal(card.sourceRef, "world/rules/潮汐信令.md");
});

test("causal dimensions derive scope level, expression, change kind, authority and world time", () => {
  const card = projectCausalEvolution(tidal);
  assert.equal(card.dimensions.scopeLevel, "macro");
  assert.equal(card.dimensions.expression, "rule-boundary");
  assert.equal(card.dimensions.changeKind, "periodic");
  assert.equal(card.dimensions.authority, "author");
  assert.equal(card.dimensions.worldTime, "第三年秋");
  assert.equal(card.dimensions.branchLabel, "当前主线");
  const draft = projectCausalEvolution({ ...tidal, status: "draft" });
  assert.equal(draft.dimensions.authority, "candidate");
});

test("time frames attach origin/evolution from related confirmed clues with event links", () => {
  const card = projectCausalEvolution(tidal);
  const framed = attachTimeFrames(card, [
    { id: "event.信令确立", title: "潮汐信令确立", status: "active", tags: ["时间：第三年前"], summary: "沉船夜后设立。" },
    { id: "event.鼓声改令", title: "战时鼓声改令", status: "draft", tags: [] },
  ]);
  assert.deepEqual(framed.timeFrames.map((frame) => frame.label), ["起源", "当前状态"]);
  assert.equal(framed.timeFrames[0].eventId, "event.信令确立");
  assert.equal(framed.timeFrames[0].frameAuthority, "confirmed-event");
});

test("world context pack excludes secrets/unknown with reasons and filters by scope and relatedness", () => {
  const entries = projectWorldReferences([
    { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["单元：北滨码头"] },
    { id: "location.北滨码头", title: "北滨码头", type: "location", status: "active", tags: ["港区"] },
    { id: "event.接头", title: "栈桥接头", type: "event", status: "active", tags: ["知情：林月如=已得知", "知情：沈砚=未知", "单元：北滨码头"] },
    { id: "event.真相", title: "钟声的真相", type: "event", status: "draft", tags: ["作者秘密"] },
    { id: "event.传闻", title: "渡口的传闻", type: "event", status: "draft", tags: ["推测：摆渡人"] },
  ]);
  const pack = buildWorldContextPack({ sceneTitle: "北滨码头", characterTitle: "林月如", taskKeyword: null, entries });
  assert.ok(pack.hardRules.some((entry) => entry.title === "潮汐信令"));
  assert.ok(pack.relatedLocations.some((entry) => entry.title === "北滨码头"));
  assert.ok(pack.relevantEvents.some((entry) => entry.title === "栈桥接头"), "林月如 knows the event, so it is relevant");
  assert.ok(!pack.roleAllowedFacts.some((entry) => entry.title === "钟声的真相"), "author secrets never enter");
  assert.ok(pack.excludedSecrets.some((item) => item.title === "钟声的真相" && item.reason === "author-note"));
  const shenPack = buildWorldContextPack({ sceneTitle: "北滨码头", characterTitle: "沈砚", taskKeyword: null, entries });
  assert.ok(shenPack.excludedSecrets.some((item) => item.title === "栈桥接头" && item.reason === "character-unknown"), "沈砚 must not receive the unknown event");
  const macroPack = buildWorldContextPack({ sceneTitle: null, characterTitle: null, taskKeyword: null, scopeLevel: "macro", entries });
  assert.deepEqual(macroPack.roleAllowedFacts.map((entry) => entry.category), ["rule"], "macro scope keeps rules only");
});
