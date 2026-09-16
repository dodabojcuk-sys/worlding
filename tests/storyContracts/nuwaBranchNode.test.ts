import assert from "node:assert/strict";
import test from "node:test";

import {
  mintNuwaNodeId,
  mintNuwaSceneKey,
  nuwaBranchEventId,
  normalizeNuwaBranchNode,
  normalizeBlocks,
  renderNuwaBranchNodeBody,
  nuwaBranchNodeDigest
} from "../../src/storyContracts/nuwaBranchNode.ts";

const branchId = "work-version.derived.0123456789abcdef0123456789abcdef";
const unitId = "story-unit.单元一";

function validNode(overrides: Record<string, unknown> = {}) {
  const creationOperationId = "nuwa-branch.node.create.test1";
  return {
    schemaVersion: "tianyan-nuwa-branch-node/v1",
    nodeId: mintNuwaNodeId(branchId, creationOperationId),
    eventId: nuwaBranchEventId(mintNuwaNodeId(branchId, creationOperationId)),
    branchWorkVersionId: branchId,
    unitId,
    narrativePathId: unitId,
    sceneKey: mintNuwaSceneKey(branchId, "nuwa-branch.scene.create.test1"),
    title: "码头夜谈",
    blocks: [
      { kind: "narration", text: "海雾漫上栈桥。" },
      { kind: "dialogue", speakerId: "character.林月如", text: "你果然来了。", heardBy: ["character.沈砚"], delivery: "spoken" }
    ],
    worldTime: { kind: "unknown" },
    characterRefs: ["character.林月如", "character.沈砚"],
    provenance: [{ kind: "author-edit", authorActionId: "author.node.create", at: "2026-09-16T16:00:00.000Z" }],
    reviewState: "draft",
    contentRevision: 1,
    creationOperationId,
    createdAt: "2026-09-16T16:00:00.000Z",
    updatedAt: "2026-09-16T16:00:00.000Z",
    ...overrides
  };
}

test("node and scene identities are minted once and independent of content or source steps", () => {
  const nodeId = mintNuwaNodeId(branchId, "op.a");
  assert.equal(nodeId, mintNuwaNodeId(branchId, "op.a"));
  assert.notEqual(nodeId, mintNuwaNodeId(branchId, "op.b"));
  assert.notEqual(nodeId, mintNuwaNodeId("work-version.derived.ffffffffffffffffffffffffffffffff", "op.a"));
  const sceneKey = mintNuwaSceneKey(branchId, "scene.op.1");
  assert.match(sceneKey, /^nuwa-scene\.[a-f0-9]{32}$/);
  assert.match(nodeId, /^nuwa-node\.[a-f0-9]{32}$/);
});

test("all five block kinds normalize; dialogue keeps speaker, heardBy and delivery", () => {
  const blocks = normalizeBlocks([
    { kind: "narration", text: "夜色。" },
    { kind: "description", text: "咸腥的风。" },
    { kind: "action", characterId: "character.沈砚", text: "按住斗篷。" },
    { kind: "dialogue", speakerId: "character.林月如", text: "时间不多。", heardBy: ["character.沈砚"], delivery: "aside" },
    { kind: "dialogue", speakerId: "unknown:pending-bind", text: "……", heardBy: [], delivery: "spoken" },
    { kind: "psychology", characterId: null, text: "她想起那年洪水。" }
  ]);
  assert.equal(blocks.length, 6);
  assert.equal((blocks[3] as { heardBy: string[] }).heardBy[0], "character.沈砚");
  assert.throws(() => normalizeBlocks([{ kind: "dialogue", speakerId: "unknown:pending-bind", text: "x", heardBy: ["character.沈砚"], delivery: "spoken" }]), /unbound speaker/);
  assert.throws(() => normalizeBlocks([{ kind: "dialogue", speakerId: "character.林月如", text: "x", heardBy: [], delivery: "whisper" }]), /delivery/);
  assert.throws(() => normalizeBlocks([{ kind: "monologue", text: "x" }]), /kind is invalid/);
});

test("node normalization enforces schema, two review states, world time kinds and blocks", () => {
  const node = normalizeNuwaBranchNode(validNode());
  assert.equal(node.reviewState, "draft");
  assert.equal(normalizeNuwaBranchNode(validNode({ reviewState: "branch-adopted" })).reviewState, "branch-adopted");
  assert.throws(() => normalizeNuwaBranchNode(validNode({ reviewState: "merged" })), /review state/);
  assert.throws(() => normalizeNuwaBranchNode(validNode({ reviewState: "stale" })), /review state/);
  assert.equal(normalizeNuwaBranchNode(validNode({ worldTime: { kind: "explicit", label: "第三年秋", sortKey: "0003-秋" } })).worldTime.kind, "explicit");
  assert.throws(() => normalizeNuwaBranchNode(validNode({ worldTime: { kind: "explicit", label: "无锚点" } })), /sortKey/);
  assert.throws(() => normalizeNuwaBranchNode(validNode({ nodeId: "event.not-minted" })), /minted/);
  assert.throws(() => normalizeNuwaBranchNode(validNode({ sceneKey: "scene-3" })), /minted/);
  assert.throws(() => normalizeNuwaBranchNode(validNode({ blocks: [] })), /blocks are invalid/);
  assert.throws(() => normalizeNuwaBranchNode(validNode({ schemaVersion: "tianyan-nuwa-branch-node/v0" })), /schema/);
});

test("identity survives content edits: nodeId and sceneKey stay, provenance and revision move", () => {
  const before = normalizeNuwaBranchNode(validNode());
  const after = normalizeNuwaBranchNode(validNode({
    blocks: [{ kind: "dialogue", speakerId: "character.林月如", text: "你果然来了。改了一句。", heardBy: ["character.沈砚"], delivery: "spoken" }],
    contentRevision: 2,
    provenance: [
      { kind: "nuwa-run", runId: "nuwa-run-20260916a", stepIds: ["step.1", "step.2"], handoffId: "handoff.1" },
      { kind: "author-edit", authorActionId: "author.node.edit.1", at: "2026-09-16T16:10:00.000Z" }
    ]
  }));
  assert.equal(after.nodeId, before.nodeId);
  assert.equal(after.sceneKey, before.sceneKey);
  assert.equal(after.contentRevision, 2);
  assert.equal(after.provenance.length, 2);
  assert.notEqual(nuwaBranchNodeDigest(before), nuwaBranchNodeDigest(after));
});

test("body rendering is a deterministic projection of the blocks", () => {
  const node = normalizeNuwaBranchNode(validNode());
  const rendered = renderNuwaBranchNodeBody(node);
  assert.match(rendered, /# 码头夜谈/);
  assert.match(rendered, /海雾漫上栈桥。/);
  assert.match(rendered, /character\.林月如：“你果然来了。”/);
  assert.equal(rendered, renderNuwaBranchNodeBody(normalizeNuwaBranchNode(validNode())));
});
