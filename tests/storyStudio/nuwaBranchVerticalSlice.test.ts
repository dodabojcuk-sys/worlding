import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkVersionAuthority } from "../../src/storyWorkspace/workVersionAuthority.ts";

process.env.TIANYAN_NUWA_N1_FAKE_PROVIDER = "1";

const { createNuwaN1Port } = await import("../../apps/story-studio/server/nuwaN1Port.mjs");
const { createCreationSourceSelectionPort } = await import("../../apps/story-studio/server/creationSourceSelectionPort.mjs");

function digestHex(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

test("女娲分支纵向切片：分支→场景→两节点→改对白→autosave→checkpoint→主线隔离→重启往返", async () => {
  const rootPath = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-branch-slice-"));
  const stateFilePath = path.join(rootPath, ".studio-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "分支切片隔离作品", folderSlug: "nuwa-branch-slice" });
  const projectPath = operations.resolveProjectWorkspacePath({ projectId: project.id });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const creationSourceSelectionPort = createCreationSourceSelectionPort({ operations, relationOperations: null, canonReadProjection: null, projectionSalt: () => null });
  const nuwaN1Port = createNuwaN1Port({
    operations,
    authorControl,
    continuityRootPath: null,
    relationOperations: null,
    creationSourceSelectionPort,
    fakeProviderAllowed: true
  });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath });
  const projectId = project.id;

  // ── 来源单元与正式角色（主线种子，只通过既有 Owner）────────────────
  const unit = operations.createStoryUnit({ projectId, title: "北滨码头", kind: "main", order: 0 });
  const speaker = operations.createWorldObject({ projectId, type: "character", title: "林月如", status: "confirmed" });
  const hearer = operations.createWorldObject({ projectId, type: "character", title: "沈砚", status: "confirmed" });

  const creationPort = creationSourceSelectionPort;
  const root = creationPort.createRoot(projectId);
  const rootRevisionBefore = root.identity.currentRevision;
  const rootManifestBefore = root.manifest.canonicalDigest;
  const unitBefore = operations.readStoryUnit({ projectId, unitId: unit.id });
  const mainlineEventsBefore = operations.listWorldObjects({ projectId }).filter((item) => item.type === "event").map((item) => item.id).sort();

  // ── 建立女娲分支（作者显式保存；幂等键固定）──────────────────────
  const branchCreated = nuwaN1Port.createBranch({ projectId, displayName: "码头夜谈分支", operationId: "nuwa-branch.create.slice" });
  const branchId = branchCreated.branch.workVersionId;
  assert.equal(branchCreated.branch.derivation?.purpose, "nuwa-branch");
  assert.equal(branchCreated.branch.currentRevision, 1, "创建即首个修订");
  const branchReplayed = nuwaN1Port.createBranch({ projectId, displayName: "码头夜谈分支", operationId: "nuwa-branch.create.slice.again" });
  assert.equal(branchReplayed.branch.workVersionId, branchId, "同来源重复保存必须命中同一分支身份");

  // ── 场景铸造一次，两个完整混合节点 ───────────────────────────────
  const worldTime = { kind: "explicit", label: "第三年秋 · 夜", sortKey: "0003-autumn" };
  const nodeA = nuwaN1Port.createBranchNode({
    projectId,
    branchWorkVersionId: branchId,
    unitId: unit.id,
    title: "栈桥相遇",
    blocks: [
      { kind: "description", text: "海雾漫上木栈桥，渔火在雨里晕开。" },
      { kind: "dialogue", speakerId: speaker.id, text: "你果然来了。", heardBy: [hearer.id], delivery: "spoken" }
    ],
    worldTime,
    characterRefs: [speaker.id, hearer.id],
    runProvenance: { runId: "nuwa-run-slice-a", stepIds: ["step.a1", "step.a2"], handoffId: null },
    operationId: "nuwa-branch.node.create.a"
  });
  assert.equal(nodeA.replayed, false);
  const sceneKey = nodeA.sceneKey;
  assert.match(sceneKey, /^nuwa-scene\.[a-f0-9]{32}$/);
  assert.match(nodeA.node.nodeId, /^nuwa-node\.[a-f0-9]{32}$/);

  const nodeB = nuwaN1Port.createBranchNode({
    projectId,
    branchWorkVersionId: branchId,
    unitId: unit.id,
    title: "旧名的分量",
    blocks: [
      { kind: "narration", text: "沈砚按住斗篷，没有立刻回答。" },
      { kind: "psychology", characterId: hearer.id, text: "旧名被说破的瞬间，他想起守夜记录。" },
      { kind: "dialogue", speakerId: hearer.id, text: "我说过，会给你答案。", heardBy: [speaker.id], delivery: "spoken" }
    ],
    worldTime,
    characterRefs: [speaker.id, hearer.id],
    runProvenance: { runId: "nuwa-run-slice-a", stepIds: ["step.b1"], handoffId: null },
    existingSceneKey: sceneKey,
    operationId: "nuwa-branch.node.create.b"
  });
  assert.equal(nodeB.sceneKey, sceneKey, "第二个节点必须留在同一稳定场景");

  // ── 修改一句对白：自动保存只加内容修订，零 WorkVersion revision ──
  const branchBeforeEdits = authority.getVersion(branchId);
  const editedBlocks = nodeB.node.blocks.map((block) => block.kind === "dialogue" ? { ...block, text: "我说过，会给你答案——现在就是。" } : block);
  const edited = nuwaN1Port.updateBranchNodeContent({
    projectId, branchWorkVersionId: branchId, nodeId: nodeB.node.nodeId,
    expectedContentRevision: nodeB.node.contentRevision, blocks: editedBlocks, operationId: "nuwa-branch.content.edit1"
  });
  assert.equal(edited.node.contentRevision, nodeB.node.contentRevision + 1);
  assert.equal(edited.node.blocks.find((block) => block.kind === "dialogue")?.text, "我说过，会给你答案——现在就是。");
  assert.equal(authority.getVersion(branchId).identity.currentRevision, branchBeforeEdits.identity.currentRevision, "autosave 不得产生 WorkVersion revision");
  // 幂等重放：同一 operationId 命中同一内容修订
  const replayedEdit = nuwaN1Port.updateBranchNodeContent({
    projectId, branchWorkVersionId: branchId, nodeId: nodeB.node.nodeId,
    expectedContentRevision: nodeB.node.contentRevision, blocks: editedBlocks, operationId: "nuwa-branch.content.edit1"
  });
  assert.equal(replayedEdit.node.contentRevision, edited.node.contentRevision);
  // 过期修订冲突被拒
  assert.throws(() => nuwaN1Port.updateBranchNodeContent({
    projectId, branchWorkVersionId: branchId, nodeId: nodeB.node.nodeId,
    expectedContentRevision: nodeB.node.contentRevision, blocks: editedBlocks, operationId: "nuwa-branch.content.stale"
  }), /冲突|变化/);

  // ── 一次显式 checkpoint：恰好 +1 revision，带节点溯源 ────────────
  const checkpoint = nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "阶段一", operationId: "nuwa-branch.checkpoint.1" });
  assert.equal(checkpoint.checkpoint.revision, branchBeforeEdits.identity.currentRevision + 1);
  assert.equal(checkpoint.checkpoint.provenanceCount, 2);
  const afterCheckpoint = authority.getVersion(branchId);
  assert.equal(afterCheckpoint.identity.currentRevision, branchBeforeEdits.identity.currentRevision + 1);
  assert.equal(afterCheckpoint.manifest.optionalNuwaProvenanceRefs.length, 2);
  assert.ok(afterCheckpoint.manifest.optionalNuwaProvenanceRefs.every((ref) => ref.canonicalDigest === digestHex(ref.canonicalDigest) || /^[a-f0-9]{64}$/.test(ref.canonicalDigest)));
  // 重复 checkpoint 同一幂等键不重复建版
  // 网络重试场景：客户端以同一请求体重发（同键、同 expectedRevision）。
  const checkpointReplay = nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "阶段一", expectedRevision: branchBeforeEdits.identity.currentRevision, operationId: "nuwa-branch.checkpoint.1.replay" });
  assert.equal(checkpointReplay.checkpoint.revision, afterCheckpoint.identity.currentRevision, "同幂等键重试不得重复建版");
  // 键复用但状态已前进（不同负载）必须被拒，而不是静默再建一版。
  assert.throws(() => nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "阶段一", operationId: "nuwa-branch.checkpoint.1.reuse" }), /不同负载|different payload|already used/i);

  // ── 编排：分支 Placement 就绪；重复创建节点不重复 ─────────────────
  const arrangement = operations.readNarrativeArrangement({ projectId, workVersionId: branchId, narrativePathId: unit.id });
  assert.equal(arrangement.arrangement?.currentRevision, 3, "编排创建+两个 Placement = 3 个修订");
  assert.deepEqual(arrangement.projection.placed.map((item) => item.eventId).sort(), [nodeA.node.eventId, nodeB.node.eventId].sort());
  const nodeAReplay = nuwaN1Port.createBranchNode({
    projectId, branchWorkVersionId: branchId, unitId: unit.id, title: "栈桥相遇",
    blocks: [{ kind: "description", text: "不同内容" }], worldTime, characterRefs: [],
    runProvenance: null, existingSceneKey: sceneKey, operationId: "nuwa-branch.node.create.a"
  });
  assert.equal(nodeAReplay.replayed, true, "同操作幂等重放");
  assert.equal(operations.readNarrativeArrangement({ projectId, workVersionId: branchId, narrativePathId: unit.id }).arrangement?.currentRevision, 3, "重放不得新增 Placement");

  // ── 主线隔离：root/单元/主线事件集全部不变 ────────────────────────
  const rootAfter = authority.getVersion(root.identity.workVersionId);
  assert.equal(rootAfter.identity.currentRevision, rootRevisionBefore, "root WorkVersion revision 不得变化");
  assert.equal(rootAfter.manifest.canonicalDigest, rootManifestBefore, "root manifest 不得变化");
  const unitAfter = operations.readStoryUnit({ projectId, unitId: unit.id });
  assert.equal(unitAfter.version, unitBefore.version, "主线单元版本不得变化");
  assert.deepEqual(unitAfter.linkedEntityIds, unitBefore.linkedEntityIds, "主线单元 linkedEntityIds 不得变化");
  const mainlineEventsAfter = operations.listWorldObjects({ projectId }).filter((item) => item.type === "event").map((item) => item.id).sort();
  assert.deepEqual(mainlineEventsAfter, mainlineEventsBefore, "主线事件集不得出现分支节点");
  const mainlineArrangement = operations.readNarrativeArrangement({ projectId, workVersionId: root.identity.workVersionId, narrativePathId: unit.id });
  assert.equal(mainlineArrangement.arrangement, null, "主线来源视图不得出现分支编排");

  // ── 重启往返：全新进程级实例重读同一磁盘状态 ─────────────────────
  const operationsRestarted = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const portRestarted = createNuwaN1Port({
    operations: operationsRestarted,
    authorControl: createStoryStudioAuthorControl({ rootPath, stateFilePath }),
    continuityRootPath: null,
    relationOperations: null,
    creationSourceSelectionPort: createCreationSourceSelectionPort({ operations: operationsRestarted, relationOperations: null, canonReadProjection: null, projectionSalt: () => null }),
    fakeProviderAllowed: true
  });
  const branchRead = portRestarted.readBranch({ projectId, branchWorkVersionId: branchId });
  assert.equal(branchRead.nodes.length, 2);
  const reloadedB = branchRead.nodes.find((node) => node.nodeId === nodeB.node.nodeId);
  assert.ok(reloadedB);
  assert.equal(reloadedB.sceneKey, sceneKey, "sceneKey 重启不变");
  assert.deepEqual(reloadedB.blocks, edited.node.blocks, "完整 blocks 逐字往返，不退化为摘要");
  assert.equal(reloadedB.blocks.find((block) => block.kind === "dialogue")?.text, "我说过，会给你答案——现在就是。");
  const branchList = portRestarted.listBranches({ projectId });
  assert.equal(branchList.branches.length, 1);
  assert.equal(branchList.branches[0]!.staleness.state, "current", "来源未变化时分支不显示过期");
});
