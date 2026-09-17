import assert from "node:assert/strict";
import test from "node:test";

import {
  projectBranchNodesToScene,
  projectRunStepsToLiveBlocks,
  composeNuwaSceneWorkspace
} from "../../apps/story-studio/src/components/nuwa/nuwaSceneWorkspaceModel.ts";

const titles = new Map([["character.林月如", "林月如"], ["character.沈砚", "沈砚"]]);
const branchNode = {
  nodeId: "nuwa-node.aaaabbbb",
  title: "栈桥相遇",
  blocks: [
    { kind: "description", text: "海雾漫上木栈桥。" },
    { kind: "dialogue", speakerId: "character.林月如", text: "你果然来了。", heardBy: ["character.沈砚"], delivery: "spoken" },
    { kind: "action", characterId: "character.沈砚", text: "按住斗篷。", characterId2: undefined },
    { kind: "psychology", characterId: null, text: "她想起那年洪水。" }
  ],
  reviewState: "draft",
  sceneKey: "nuwa-scene.test1234",
  contentRevision: 1
};
const runStep = {
  sequence: 1,
  actorId: "character.林月如",
  intent: "核对现场",
  speech: "我只把钟声的线索告诉你。",
  action: { action: "observe", targetId: null },
  observableResult: "角色完成一次受限观察。"
};

test("projectBranchNodesToScene: 项目角色名并保留块类型", () => {
  const result = projectBranchNodesToScene([branchNode], titles);
  assert.equal(result.length, 1);
  assert.equal(result[0].blocks[0].kind, "description");
  assert.equal(result[0].blocks[1].characterTitle, "林月如");
  assert.deepEqual(result[0].blocks[1].heardByTitles, ["沈砚"]);
  assert.ok(result[0].blocks.every((b) => b.source === "persisted"));
});

test("projectRunStepsToLiveBlocks: 步骤投影为候选内容", () => {
  const result = projectRunStepsToLiveBlocks([runStep], titles);
  assert.equal(result.length, 1);
  assert.equal(result[0].actorTitle, "林月如");
  assert.ok(result[0].speech);
});

test("composeNuwaSceneWorkspace: 同输入同输出，persisted 与 run-candidate 分层", () => {
  const persisted = projectBranchNodesToScene([branchNode], titles);
  const live = projectRunStepsToLiveBlocks([runStep], titles);
  const vm = composeNuwaSceneWorkspace({ sceneKey: "scene.k", sceneTitle: "北滨码头", branchNodes: persisted, runSteps: live, runState: "running" });
  assert.equal(vm.persistedNodes.length, 1);
  assert.equal(vm.liveRunSteps.length, 1);
  assert.equal(vm.runState, "running");
  assert.deepEqual(vm.persistedNodes[0].blocks.find((b) => b.kind === "dialogue").heardByTitles, ["沈砚"]);
});

test("未知角色 ID 不抛错，原样返回", () => {
  const result = projectBranchNodesToScene([{ ...branchNode, blocks: [{ kind: "dialogue", speakerId: "unknown.char", text: "？", heardBy: [], delivery: "spoken" }] }], titles);
  assert.equal(result[0].blocks[0].characterTitle, "unknown.char");
});
