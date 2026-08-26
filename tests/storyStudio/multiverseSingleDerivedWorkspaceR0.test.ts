import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createMultiverseConfirmedEventLineFixture } from "../../apps/story-studio/src/components/event-observation/eventLineFixture.ts";

const workspace = readFileSync(path.join(process.cwd(), "apps/story-studio/src/components/multiverse-r0/MultiverseSingleDerivedWorkspace.tsx"), "utf8");
const app = readFileSync(path.join(process.cwd(), "apps/story-studio/src/App.tsx"), "utf8");
const dock = readFileSync(path.join(process.cwd(), "apps/story-studio/src/components/TianyiQuickAssistant.tsx"), "utf8");
const server = readFileSync(path.join(process.cwd(), "apps/story-studio/server/server.mjs"), "utf8");

test("Multiverse keeps the existing top-level route and shell", () => assert.match(app, /productMode === "multiverse" && fixtureKind === "multiverse-single-derived"/));
test("Nuwa save stays in the existing Nuwa top-level route", () => assert.match(app, /productMode === "nuwa" && fixtureKind === "multiverse-single-derived"/));
test("empty root has explicit author copy and action", () => assert.match(workspace, /为当前作品建立版本基线[\s\S]*明确建立主线基线/));
test("empty derived has the required author-facing sentence", () => assert.match(workspace, /这里还没有其他走向…/));
test("Nuwa exposes Save as multiverse version", () => assert.match(workspace, /保存为多元版本/));
test("Nuwa requires an author-editable derived version name before save", () => {
  assert.match(workspace, /id="multiverse-version-name"/);
  assert.match(workspace, /onSave\(versionName: string\)/);
  assert.match(workspace, /!versionName\.trim\(\)/);
});
test("save confirmation shows name source path candidate and no current change", () => {
  for (const text of ["版本名称", "来源主线", "选中走向", "事件候选", "此时仍不会改变当前故事"]) assert.match(workspace, new RegExp(text));
});
test("compare is explicitly three-way", () => {
  for (const text of ["建立时的主线", "当前主线", "其他走向"]) assert.match(workspace, new RegExp(text));
});
test("compare exposes changed unchanged unknown and conflict author labels", () => {
  for (const text of ["发生改变", "保持不变", "仍然未知", "存在冲突", "来源已过期", "证据不足", "已融入"]) assert.match(workspace, new RegExp(text));
});
test("compare exposes all required semantic categories", () => {
  for (const text of ["事件层级", "叙事顺序", "世界时间", "角色行动", "人物状态", "知识、信念与误解", "人物命运", "物品与地点", "来源与证据", "开放问题", "缺失证据", "创作输出"]) assert.match(workspace, new RegExp(text));
});
test("only fixed Event change ID is selected", () => assert.match(workspace, /fixture\.change\.event\.old-name-check/));
test("Candidate and Impact review remain explicit screens", () => assert.match(workspace, /审查所选变化[\s\S]*继续影响审查/));
test("final action uses exact author integration copy", () => assert.match(workspace, /确认并融入当前版本/));
test("Impact Review states one Event and zero other owner writes", () => assert.match(workspace, /Event 1 · 主线版本修订 1 · Character 0 · WorldState 0 · Relation 0 · 其他 0/));
test("Event Line return keeps an exact Multiverse return state", () => assert.match(app, /returnTo: "multiverse-single-derived"[\s\S]*multiverseReturn: returnState/));
test("Event Line fallback restores compare source derived and selection", () => assert.match(app, /\/multiverse\?fixture=multiverse-single-derived&view=compare&source=fixture\.version\.root&derived=fixture\.version\.old-name-ledger&selected=fixture\.change\.event\.old-name-check/));
test("Event Line receives the existing AuthorControl receipt reference", () => assert.match(app, /next\.searchParams\.set\("receipt", authorControlReceiptId\)/));
test("Multiverse Event Line is author-readable and keeps formal provenance", () => {
  const eventId = "event.author-confirmed-fixture";
  const fixture = createMultiverseConfirmedEventLineFixture("fixture-project", eventId, "author-change-set-fixture");
  const event = fixture.details[eventId];
  assert.match(event?.body || "", /来自作者保留的“旧名守夜记录走向”/);
  assert.deepEqual(event?.properties.participants, ["沈砚", "阿芜"]);
  assert.equal(event?.properties.sourceRef, "多元派生版本：旧名守夜记录走向");
  assert.equal(event?.properties.sourceHash, "author-change-set-fixture");
});
test("Work Dock is an offline version assistant", () => assert.match(dock, /离线版本助手[\s\S]*本次只读取隔离演示数据，不调用真实模型/));
test("Work Dock declares zero Provider calls and cannot formally write", () => assert.match(dock, /data-real-provider-calls="0"[\s\S]*不能替你完成任何正式写入/));
test("server mutation route is fail-closed behind an explicit fixture gate", () => assert.match(server, /TIANYAN_MULTIVERSE_SINGLE_DERIVED_FIXTURE_R0 !== "1"/));
test("server accepts no free-form merge or synchronization action", () => assert.doesNotMatch(server.match(/multiverse-single-derived-fixture\/[\s\S]{0,2200}/)?.[0] || "", /merge|rebase|sync/));
