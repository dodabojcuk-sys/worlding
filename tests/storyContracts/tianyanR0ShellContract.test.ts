import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TIAN_YAN_R0_ENGINEERING_DIRECTORY,
  TIAN_YAN_R0_SPACES
} from "../../src/storyContracts/tianyanR0ShellContract.ts";
import { R0_DEFAULT_PANEL_PLACEMENTS } from "../../apps/story-studio/src/product-shell/layoutProtocol.ts";

test("R0 fixes eight global spaces and keeps collection inside creation", () => {
  assert.deepEqual(TIAN_YAN_R0_SPACES.map((space) => space.label), ["世界", "天意", "事件线", "多元", "女娲", "资料", "创作", "数据"]);
  const creation = TIAN_YAN_R0_ENGINEERING_DIRECTORY.find((node) => node.id === "creation");
  assert.equal(creation?.children?.some((node) => node.label === "合册"), true);
});

test("R0 directory labels confirmed, pending, and extensible information without story state", () => {
  const statuses = new Set<string>();
  const visit = (nodes: typeof TIAN_YAN_R0_ENGINEERING_DIRECTORY): void => {
    for (const node of nodes) {
      statuses.add(node.status);
      if (node.children) visit(node.children as typeof TIAN_YAN_R0_ENGINEERING_DIRECTORY);
    }
  };
  visit(TIAN_YAN_R0_ENGINEERING_DIRECTORY);
  assert.deepEqual([...statuses].sort(), ["confirmed", "extensible", "pending"]);
});

test("layout protocol anticipates floating and side changes while R0 defaults remain docked", () => {
  assert.deepEqual(R0_DEFAULT_PANEL_PLACEMENTS.map((placement) => placement.panel), ["directory", "page-tools", "global-tianyi", "page-log"]);
  assert.equal(R0_DEFAULT_PANEL_PLACEMENTS.every((placement) => placement.mode === "docked"), true);
});

test("Pi adapter is candidate-and-receipt only and shell exposes independent panels", () => {
  const adapter = readFileSync("src/storyAgent/piAgentAdapter.ts", "utf8");
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  assert.match(adapter, /proposals: readonly PiAgentProposal\[\]/);
  assert.match(adapter, /Pi Agent 的可替换运行底座合同/);
  assert.match(shell, /showPageTools/);
  assert.match(shell, /showGlobalTianyi/);
  assert.match(shell, /showPageLog/);
  assert.match(shell, /PRIMARY CONVERSATION SPACE/);
});
