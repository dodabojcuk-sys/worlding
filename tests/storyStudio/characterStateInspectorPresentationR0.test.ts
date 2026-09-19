import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCharacterStateInspectorView,
  type CharacterStateInspectorInput
} from "../../apps/story-studio/src/components/entity-dock/characterStateInspectorPresentation.ts";
import type { EventKnowledgeState } from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";

const LEAKY_TITLE = "寄信人身份·作者备注标题";
const LEAKY_BODY = "只有作者看得到的正文段落。";

const event = (eventId: string, state: EventKnowledgeState) => ({
  eventId,
  title: `${eventId} 的标题`,
  knowledgeState: state,
  body: LEAKY_BODY
});

const roleFacing = (overrides: Partial<CharacterStateInspectorInput> = {}): CharacterStateInspectorInput => ({
  observerKind: "character",
  visibleEvents: [],
  hiddenCount: 0,
  projectionRevision: null,
  exclusions: [],
  ...overrides
});

test("已亲历、已目击、已得知构成知识行，标签沿用契约词表", () => {
  const view = buildCharacterStateInspectorView(roleFacing({
    visibleEvents: [event("ev.seen", "witnessed"), event("ev.led", "informed"), event("ev.done", "experienced")]
  }));

  assert.deepEqual(view.knowledge.map((line) => [line.eventId, line.label, line.statement]), [
    ["ev.seen", "已目击", "ev.seen 的标题"],
    ["ev.led", "已得知", "ev.led 的标题"],
    ["ev.done", "已亲历", "ev.done 的标题"]
  ]);
  assert.deepEqual(view.belief, []);
  assert.equal(view.writes, 0);
  assert.equal(view.providerCalls, 0);
});

test("相信、怀疑、被误导、已否定停在 belief 一格，不升级为知识", () => {
  const view = buildCharacterStateInspectorView(roleFacing({
    visibleEvents: [
      event("ev.believe", "believes"),
      event("ev.suspect", "suspects"),
      event("ev.misled", "misled"),
      event("ev.denied", "denied")
    ]
  }));

  assert.deepEqual(view.knowledge, []);
  assert.deepEqual(view.belief.map((line) => line.label), ["相信", "怀疑", "被误导", "已否定"]);
  assert.deepEqual(view.belief.map((line) => line.eventId), ["ev.believe", "ev.suspect", "ev.misled", "ev.denied"]);
});

test("未知是一格内容而不是空白，且不泄露该角色看不到的事件身份", () => {
  const view = buildCharacterStateInspectorView(roleFacing({
    visibleEvents: [event("ev.known", "informed")],
    hiddenCount: 3
  }));

  assert.equal(view.unknown.count, 3);
  assert.match(view.unknown.text, /3 项/);
  assert.equal(view.unknown.identitiesShown, false);
  assert.equal(view.knowledge.length, 1);

  const authorView = buildCharacterStateInspectorView(roleFacing({
    observerKind: "author",
    visibleEvents: [event("ev.gap", "unknown"), event("ev.known", "informed")]
  }));
  assert.deepEqual(authorView.knowledge.map((line) => line.eventId), ["ev.known"]);
  assert.equal(authorView.unknown.count, 1);
});

test("作者全知正文与排除项标题不进入状态视图，只保留理由与计数", () => {
  const view = buildCharacterStateInspectorView(roleFacing({
    visibleEvents: [event("ev.known", "experienced")],
    exclusions: [
      { title: LEAKY_TITLE, reason: "author-note" },
      { title: "另一条传闻", reason: "rumor" },
      { title: "又一条传闻", reason: "rumor" }
    ]
  }));

  assert.deepEqual(view.exclusions, [
    { reason: "author-note", count: 1, label: "作者备注" },
    { reason: "rumor", count: 2, label: "传闻" },
    { reason: "character-unknown", count: 0, label: "该角色未知" }
  ]);
  const serialised = JSON.stringify(view);
  assert.ok(!serialised.includes(LEAKY_TITLE));
  assert.ok(!serialised.includes(LEAKY_BODY));
  assert.ok(!serialised.includes("另一条传闻"));
});

test("矛盾来源并列保留，不替作者挑一条", () => {
  const view = buildCharacterStateInspectorView(roleFacing({
    visibleEvents: [event("ev.a", "contradicted"), event("ev.b", "contradicted")]
  }));

  assert.deepEqual(view.knowledge, []);
  assert.deepEqual(view.contradictions.map((line) => line.eventId), ["ev.a", "ev.b"]);
});

test("没有时点来源就明写没有，不拿叙事顺序冒充世界时间", () => {
  const view = buildCharacterStateInspectorView(roleFacing({ visibleEvents: [event("ev.known", "informed")] }));

  assert.equal(view.asOf, null);
  assert.equal(view.asOfText, "无世界时间依据（当前来源只有叙事顺序）");

  const withRevision = buildCharacterStateInspectorView(roleFacing({ projectionRevision: "a1b2c3d4" }));
  assert.equal(withRevision.projectionRevision, "a1b2c3d4");
  assert.equal(buildCharacterStateInspectorView(roleFacing()).projectionRevision, null);
});

test("状态页签接上真实只读视图，且不再声明没有生产喂入", () => {
  const dock = readFileSync("apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx", "utf8");

  assert.match(dock, /buildCharacterStateInspectorView/);
  assert.match(dock, /data-testid="character-state-inspector"/);
  assert.match(dock, /tab === "心理与状态" \? <CharacterStateTab view=\{stateView\} sourced=\{Boolean\(knowledge\)\} \/>/);
  assert.doesNotMatch(dock, /当前没有生产喂入/);
  // 不引入第二数据源：状态页签只用已经加载的知情投影与上下文包。
  assert.doesNotMatch(dock, /readWorldStateN4|getCharacterStateImpactFixture|applyWorldStateN4/);
  // 技术标识不直出：沿用工作台既有的「来源标识」折叠口径，且不给状态页签新增样式类。
  assert.match(dock, /<details><summary>来源标识<\/summary>\{anchors\.map/);
  assert.doesNotMatch(dock, /<dd>\{line\.statement\}<small>\{line\.sourceAnchor\}<\/small><\/dd>/);
  const stateTab = dock.slice(dock.indexOf("function CharacterStateTab"), dock.indexOf("function OverviewTab"));
  assert.equal(stateTab.match(/className="[^"]*"/g)?.filter((entry) => entry !== 'className="entity-dock-section"').length ?? 0, 0);
});
