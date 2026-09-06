import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventStoryCrossingKnowledgeProjection,
  storylineLabels
} from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";

const secret = "真正的航海图藏在雾灯匣夹层";
const events = [
  { id: "event.cross", title: "林昭在灯塔找到密信", status: "draft", revisionToken: "r1", tags: ["故事线：主故事线|人物线 · 林昭", "知情：character.lin=已亲历", "知情：character.wu=未知", "知情：读者=已得知"], knowledgeSubjectIds: ["character.lin"], body: "交叉事件正文" },
  { id: "event.secret", title: secret, status: "draft", revisionToken: "r2", tags: ["故事线：调查线 · 雾港", "作者秘密", "知情：character.lin=未知", "知情：character.wu=相信", "读者未知"], knowledgeSubjectIds: ["character.wu"], body: `${secret}，不能越过知识边界。` },
  { id: "event.misled", title: "阿芜相信潮汐来自外海", status: "draft", revisionToken: "r3", tags: ["故事线：人物线 · 林昭|调查线 · 雾港", "知情：character.wu=被误导", "知情：character.lin=怀疑", "知情：读者=未知"], knowledgeSubjectIds: ["character.lin", "character.wu"], body: "错误信念不覆盖真实 Event。" }
];
const characters = [{ id: "character.lin", label: "林昭", revisionToken: "c1" }, { id: "character.wu", label: "阿芜", revisionToken: "c2" }];

test("one Event can project into multiple storylines without duplication", () => {
  assert.deepEqual(storylineLabels(events[0].tags), ["主故事线", "人物线 · 林昭"]);
  const projection = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "author", events, characters });
  assert.equal(projection.visibleEvents.filter((event) => event.eventId === "event.cross").length, 1);
  assert.deepEqual(projection.visibleEvents.find((event) => event.eventId === "event.cross")?.storylineLabels, ["主故事线", "人物线 · 林昭"]);
  assert.equal(projection.owner, "Event+NarrativeArrangement+CharacterStateProjectionPort");
  assert.equal(projection.writes, 0);
});

test("restricted projection excludes hidden claim text rather than styling it", () => {
  const projection = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "character.lin", events, characters });
  assert.deepEqual(projection.hiddenEventIds, ["event.secret"]);
  assert.equal(JSON.stringify(projection).includes(secret), false);
  assert.equal(projection.visibleEvents.some((event) => event.eventId === "event.misled" && event.knowledgeState === "suspects"), true);
  assert.ok(projection.characterStateProjectionRevision);
});

test("author sees facts while a misled character sees sourced belief state", () => {
  const author = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "author", events, characters });
  const wu = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "character.wu", events, characters });
  assert.equal(author.visibleEvents.some((event) => event.title === secret), true);
  assert.equal(wu.visibleEvents.find((event) => event.eventId === "event.secret")?.knowledgeState, "believes");
  assert.equal(wu.visibleEvents.find((event) => event.eventId === "event.misled")?.knowledgeState, "misled");
  assert.deepEqual(wu.visibleEvents.find((event) => event.eventId === "event.misled")?.sourceEventIds, ["event:event.misled"]);
});

test("reader projection omits reader-hidden Event body and title", () => {
  const projection = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "reader", events, characters });
  assert.equal(projection.visibleEvents.some((event) => event.eventId === "event.cross"), true);
  assert.equal(projection.hiddenCount, 2);
  assert.equal(JSON.stringify(projection).includes(secret), false);
});

test("author comparison keeps the union and marks each character's knowledge difference", () => {
  const projection = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "author", observerIds: ["character.lin", "character.wu"], events, characters });
  assert.equal(projection.mode, "compare");
  assert.deepEqual(projection.observers.map((observer) => observer.id), ["character.lin", "character.wu"]);
  assert.equal(projection.audience, "author-comparison");
  const cross = projection.visibleEvents.find((event) => event.eventId === "event.cross");
  assert.ok(cross);
  assert.deepEqual(cross.perspectives.map((item) => [item.observerLabel, item.state]), [["林昭", "experienced"], ["阿芜", "unknown"]]);
  const misled = projection.visibleEvents.find((event) => event.eventId === "event.misled");
  assert.ok(misled);
  assert.deepEqual(misled.perspectives.map((item) => [item.observerLabel, item.state]), [["林昭", "suspects"], ["阿芜", "misled"]]);
  assert.equal(projection.visibleEvents.some((event) => event.eventId === "event.secret"), true);
  assert.equal(projection.hiddenCount, 0);
});

test("role-facing single projection still discards another character's secret before API or ContextPack", () => {
  const projection = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "character.lin", events, characters });
  assert.equal(projection.audience, "role");
  assert.equal(JSON.stringify(projection).includes(secret), false);
});

test("same-name formal characters are isolated by stable id and labels never choose the first match", () => {
  const duplicated = [{ id: "character.guard", label: "林昭", revisionToken: "g1" }, { id: "character.cartographer", label: "林昭", revisionToken: "c1" }];
  const scoped = [{ id: "event.same-name", title: "只有守卫亲历", status: "draft", revisionToken: "e1", tags: ["知情：character.guard=已亲历", "知情：林昭=已亲历"], knowledgeSubjectIds: ["character.guard"], body: "同名消歧证据" }];
  const guard = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "character.guard", events: scoped, characters: duplicated });
  const cartographer = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "character.cartographer", events: scoped, characters: duplicated });
  const ambiguous = buildEventStoryCrossingKnowledgeProjection({ projectId: "p1", observerId: "林昭", events: scoped, characters: duplicated });
  assert.equal(guard.visibleEvents[0]?.knowledgeState, "experienced");
  assert.equal(cartographer.visibleEvents.length, 0);
  assert.equal(ambiguous.observer.kind, "reader");
  assert.equal(ambiguous.visibleEvents.length, 0);
});
