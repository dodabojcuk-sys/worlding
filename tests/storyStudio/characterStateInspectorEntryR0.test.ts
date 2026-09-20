import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  closeEntityDock,
  ENTITY_DOCK_CHARACTER_TABS,
  getEntityDockState,
  openEntityDock,
  setEntityDockTab
} from "../../apps/story-studio/src/components/entity-dock/entityInspectorDockStore.ts";

// 页签与展开状态由 store 单例持有，因此入口可以只接线、不复制第二个工作台。
// 该模块在 openEntityDock 里读 document.activeElement（关闭时归还焦点），这里给一个最小 Mock。
class FakeElement {
  isConnected = true;
  focusCalls = 0;
  focus() { this.focusCalls += 1; }
}
const focusedElement = new FakeElement();
const globals = globalThis as Record<string, unknown>;
globals.HTMLElement = FakeElement;
globals.document = { activeElement: focusedElement };

test("角色工作面入口把既有工作台直接展开到心理与状态", () => {
  openEntityDock({ kind: "character", objectId: "character.林月如", openedFrom: "character-workspace", status: "expanded", tab: "心理与状态" });

  const state = getEntityDockState();
  assert.equal(state.status, "expanded");
  assert.equal(state.tab, "心理与状态");
  assert.equal(state.objectId, "character.林月如");
  assert.equal(state.openedFrom, "character-workspace");
  assert.equal(state.sceneTitle, null);
  assert.ok(ENTITY_DOCK_CHARACTER_TABS.includes("心理与状态"));
});

test("未指定页签的既有入口行为不变，换角色回到总览而不是上一页签", () => {
  openEntityDock({ kind: "character", objectId: "character.沈砚", openedFrom: "nuwa", sceneTitle: "渡口的传闻" });

  const nuwaStyle = getEntityDockState();
  assert.equal(nuwaStyle.status, "peek");
  assert.equal(nuwaStyle.tab, "总览");
  assert.equal(nuwaStyle.sceneTitle, "渡口的传闻");

  setEntityDockTab("记忆");
  assert.equal(getEntityDockState().tab, "记忆");
  assert.equal(getEntityDockState().status, "peek", "换页签不改变展开状态");

  openEntityDock({ kind: "character", objectId: "character.阿岚", openedFrom: "nuwa" });
  assert.equal(getEntityDockState().tab, "总览");
});

test("同一入口重复点击仍落回心理与状态，关闭只收起并把焦点还给触发按钮", () => {
  openEntityDock({ kind: "character", objectId: "character.林月如", openedFrom: "character-workspace", status: "expanded", tab: "心理与状态" });
  setEntityDockTab("来源与权限");

  openEntityDock({ kind: "character", objectId: "character.林月如", openedFrom: "character-workspace", status: "expanded", tab: "心理与状态" });
  assert.equal(getEntityDockState().tab, "心理与状态");

  closeEntityDock();
  assert.equal(getEntityDockState().status, "closed");
  assert.equal(focusedElement.focusCalls, 1);

  setEntityDockTab("记忆");
  assert.equal(getEntityDockState().tab, "心理与状态", "工作台关闭时不接受页签写入");
});

const dock = readFileSync("apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx", "utf8");
const workspace = readFileSync("apps/story-studio/src/product-shell/project-directory/character/CharacterWorkspace.tsx", "utf8");
const nuwa = readFileSync("apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx", "utf8");

test("页签表只有一份契约，角色工作台的页签状态来自 store 而不是组件私有 state", () => {
  assert.match(dock, /const DOCK_TABS = ENTITY_DOCK_CHARACTER_TABS;/);
  assert.doesNotMatch(dock, /\[\s*"总览",\s*"档案",\s*"心理与状态"/);
  assert.doesNotMatch(dock, /useState<DockTab>/);
  assert.match(dock, /tab=\{state\.tab\}/);
  assert.match(dock, /onClick=\{\(\) => setEntityDockTab\(name\)\}/);
  // 入口落地依赖这一行原样存在：它仍是同一个只读视图，没有第二份实现。
  assert.match(dock, /tab === "心理与状态" \? <CharacterStateTab view=\{stateView\} sourced=\{Boolean\(knowledge\)\} \/>/);
  assert.doesNotMatch(dock.slice(dock.indexOf("function WorldEntityDock")), /props\.tab/);
});

test("入口只是接线：不跳转、不写入、不复制状态视图、不加样式类", () => {
  assert.match(workspace, /import \{ openEntityDock \} from "\.\.\/\.\.\/\.\.\/components\/entity-dock\/entityInspectorDockStore";/);
  assert.match(workspace, /openEntityDock\(\{ kind: "character", objectId: props\.objectId, openedFrom: "character-workspace", status: "expanded", tab: "心理与状态" \}\)/);
  assert.match(workspace, /<button type="button" data-testid="character-open-state-inspector" onClick=\{openStateInspector\}><Brain aria-hidden="true" \/>查看角色状态<\/button>/);

  const handler = workspace.slice(workspace.indexOf("const openStateInspector"), workspace.indexOf("const changeSearch"));
  assert.doesNotMatch(handler, /location\.|fetch\(|saveWorldObject|updateWorldObject|window\./);
  assert.ok(!/data-testid="character-open-state-inspector"[^>]*className=/.test(workspace), "入口按钮复用既有 actions 容器样式，不新增类");
  assert.doesNotMatch(workspace, /buildCharacterStateInspectorView|CharacterStateTab/);
});

test("禁止面：女娲、Server、Transport 与知识模型都不因这次接线而改变", () => {
  assert.doesNotMatch(nuwa, /openEntityDock\(\{[^)]*tab:/s);
  assert.doesNotMatch(nuwa, /status: "expanded"/);
  const transport = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const knowledge = readFileSync("src/storyContracts/eventStoryCrossingKnowledge.ts", "utf8");
  for (const source of [transport, server, knowledge]) {
    assert.doesNotMatch(source, /character-state-inspector|查看角色状态/);
  }
});
