import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventStoryCrossingKnowledgeProjection,
  storylineLabels
} from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";

const secret = "真正的航海图藏在雾灯匣夹层";
const events = [
  { id: "event.cross", title: "林昭在灯塔找到密信", status: "draft", revisionToken: "r1", tags: ["故事线：主故事线|人物线 · 林昭", "知情：林昭=已亲历", "知情：阿芜=未知", "知情：读者=已得知"], body: "交叉事件正文" },
  { id: "event.secret", title: secret, status: "draft", revisionToken: "r2", tags: ["故事线：调查线 · 雾港", "作者秘密", "知情：林昭=未知", "知情：阿芜=相信", "读者未知"], body: `${secret}，不能越过知识边界。` },
  { id: "event.misled", title: "阿芜相信潮汐来自外海", status: "draft", revisionToken: "r3", tags: ["故事线：人物线 · 林昭|调查线 · 雾港", "知情：阿芜=被误导", "知情：林昭=怀疑", "知情：读者=未知"], body: "错误信念不覆盖真实 Event。" }
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
