import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkVersionAuthority } from "../../src/storyWorkspace/workVersionAuthority.ts";
import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

const { createNuwaN1Port } = await import("../../apps/story-studio/server/nuwaN1Port.mjs");
const { createCreationSourceSelectionPort } = await import("../../apps/story-studio/server/creationSourceSelectionPort.mjs");
const { createWorkspacePackagePort } = await import("../../src/storyWorkspace/workspacePackagePort.mjs");

function buildEnv(rootPath: string) {
  const stateFilePath = path.join(rootPath, ".studio-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const creationSourceSelectionPort = createCreationSourceSelectionPort({ operations, relationOperations: null, canonReadProjection: null, projectionSalt: () => null });
  const nuwaN1Port = createNuwaN1Port({ operations, authorControl, continuityRootPath: null, relationOperations: null, creationSourceSelectionPort, fakeProviderAllowed: true });
  return { operations, nuwaN1Port, creationSourceSelectionPort };
}

test("时间与幂等语义：调用方稳定时间、拒绝缺失与倒退、重放确定、checkpoint 快照可恢复不同对白", async () => {
  const rootPath = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-closeout-"));
  const operations0 = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".studio-state.json") });
  const project = operations0.createProject({ title: "收口隔离作品", folderSlug: "closeout" });
  const projectId = project.id;
  const { operations, nuwaN1Port, creationSourceSelectionPort } = buildEnv(rootPath);
  const projectPath = operations.resolveProjectWorkspacePath({ projectId });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath });
  const unit = operations.createStoryUnit({ projectId, title: "单元甲", kind: "main", order: 0 });
  const speaker = operations.createWorldObject({ projectId, type: "character", title: "阿芜", status: "confirmed" });

  const root = creationSourceSelectionPort.createRoot(projectId);
  const rootRevision = root.identity.currentRevision;

  // 缺失 createdAt 必须拒绝；不得借用根版本时间
  assert.throws(() => nuwaN1Port.createBranch({ projectId, displayName: "分支甲", operationId: "op.b1" } as never), /UTC ISO|无效/);
  const branch = nuwaN1Port.createBranch({ projectId, displayName: "分支甲", createdAt: "2026-09-17T01:30:00.000Z", operationId: "op.b1" });
  const branchId = branch.branch.workVersionId;
  // 早于主线当前修订时间必须拒绝
  assert.throws(() => nuwaN1Port.createBranch({ projectId, displayName: "分支乙", createdAt: "2020-01-01T00:00:00.000Z", operationId: "op.b2" } as never), /早于/);

  const blocksA = [
    { kind: "narration", text: "版本 A 的开场。" },
    { kind: "dialogue", speakerId: speaker.id, text: "对白 A。", heardBy: [], delivery: "spoken" }
  ];
  const node = nuwaN1Port.createBranchNode({
    projectId, branchWorkVersionId: branchId, unitId: unit.id, title: "同场节点",
    blocks: blocksA, worldTime: { kind: "unknown" }, characterRefs: [speaker.id], runProvenance: null,
    operationId: "op.node.1"
  });

  // checkpoint 缺失时间必须拒绝；早于分支头部必须拒绝
  assert.throws(() => nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "ck-A", operationId: "op.ck.a" } as never), /UTC ISO|无效/);
  assert.throws(() => nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "ck-A", createdAt: "2020-01-01T00:00:00.000Z", operationId: "op.ck.a" } as never), /早于/);

  // A：checkpoint 版本 A
  const checkpointA = nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "ck-A", createdAt: "2026-09-17T01:40:00.000Z", operationId: "op.ck.a" });
  assert.equal(checkpointA.checkpoint.revision, 2);
  const revisionAtA = checkpointA.checkpoint.revision;
  const digestAtA = checkpointA.checkpoint.snapshotDigest;

  // C：自动保存对白 B（不 checkpoint）——WorkVersion delta 0
  const blocksB = node.node.blocks.map((block) => block.kind === "dialogue" ? { ...block, text: "对白 B（已修改）。" } : block);
  nuwaN1Port.updateBranchNodeContent({ projectId, branchWorkVersionId: branchId, nodeId: node.node.nodeId, expectedContentRevision: node.node.contentRevision, blocks: blocksB, operationId: "op.content.b" });

  // D：WorkVersion head 仍绑定 A——快照文件与 provenance digest 未变
  const headBetween = authority.getVersion(branchId);
  const headBetweenTime = headBetween.revision.createdAt;
  const snapshotsBetween = operations.listNuwaBranchCheckpoints({ projectId, branchWorkVersionId: branchId });
  assert.equal(snapshotsBetween.length, 1);
  assert.equal(snapshotsBetween[0]!.revision, revisionAtA);
  assert.deepEqual(snapshotsBetween[0]!.nodes.find((item) => item.nodeId === node.node.nodeId)?.blocks, blocksA, "head 检查点仍绑定版本 A 内容");
  // provenance 逐节点 digest 必须精确绑定检查点快照中的节点内容（canonical JSON）
  const { stableJson } = await import("../../src/storyContinuity/continuityValidation.ts");
  const digestOfNode = (nodeRecord: unknown) => createHash("sha256").update(stableJson(nodeRecord), "utf8").digest("hex");
  const snapshotANode = snapshotsBetween[0]!.nodes.find((item) => item.nodeId === node.node.nodeId)!;
  assert.equal(headBetween.manifest.optionalNuwaProvenanceRefs[0]!.canonicalDigest, digestOfNode({ nodeId: snapshotANode.nodeId, contentRevision: snapshotANode.contentRevision, blocks: snapshotANode.blocks, reviewState: snapshotANode.reviewState }));

  // E：checkpoint B
  const checkpointB = nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "ck-B", createdAt: "2026-09-17T01:50:00.000Z", operationId: "op.ck.b" });
  assert.equal(checkpointB.checkpoint.revision, revisionAtA + 1, "每个 checkpoint 各自 delta 1");
  assert.notEqual(checkpointB.checkpoint.snapshotDigest, digestAtA, "对应快照 digest 变化");
  assert.ok(Date.parse(checkpointB.checkpoint.createdAt) > Date.parse(checkpointA.checkpoint.createdAt), "不同 checkpoint 时间反映各自真实动作时间且不倒退");

  // F：provenance 精确指向对应节点内容修订（A/B 检查点 provenance digest 不同）
  const headB = authority.getVersion(branchId);
  const refDigests = headB.manifest.optionalNuwaProvenanceRefs.map((ref) => ref.canonicalDigest);
  assert.equal(new Set(refDigests).size, refDigests.length, "每个节点修订的溯源 digest 互不相同");
  // B 检查点快照可恢复对白 B；A 检查点仍可恢复对白 A
  const snapshots = operations.listNuwaBranchCheckpoints({ projectId, branchWorkVersionId: branchId });
  const snapshotA = snapshots.find((item) => item.revision === revisionAtA)!;
  const snapshotB = snapshots.find((item) => item.revision === checkpointB.checkpoint.revision)!;
  const dialogueOf = (snapshot: typeof snapshotA) => snapshot.nodes.find((item) => item.nodeId === node.node.nodeId)!.blocks.find((block) => block.kind === "dialogue")!.text;
  assert.equal(dialogueOf(snapshotA), "对白 A。", "checkpoint A 可恢复对白 A");
  assert.equal(dialogueOf(snapshotB), "对白 B（已修改）。", "checkpoint B 可恢复对白 B");

  // I/J：autosave 仍为 delta 0（checkpoint 之间由上方 revision 断言覆盖）
  const currentBranch = authority.getVersion(branchId);
  assert.equal(currentBranch.identity.currentRevision, revisionAtA + 1);
  void currentBranch;

  // 网络重试：同一负载（同键同时间同 expectedRevision）重放不建版
  const replay = nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "ck-B", createdAt: "2026-09-17T01:50:00.000Z", expectedRevision: revisionAtA, operationId: "op.ck.b.retry" });
  assert.equal(replay.checkpoint.revision, checkpointB.checkpoint.revision, "receipt 重放仍幂等");
});

test("可移植往返：.tianyan 导出→新根导入→分支身份/节点/Placement/检查点/主线全部保真", async () => {
  const libraryRoot = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-closeout-lib-"));
  const backupRoot = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-closeout-bak-"));
  const stateFilePath = path.join(libraryRoot, ".studio-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath: libraryRoot, stateFilePath });
  const project = operations.createProject({ title: "可移植往返作品", folderSlug: "roundtrip" });
  const projectId = project.id;
  const { nuwaN1Port, creationSourceSelectionPort } = buildEnv(libraryRoot);
  const unit = operations.createStoryUnit({ projectId, title: "单元乙", kind: "main", order: 0 });
  const speaker = operations.createWorldObject({ projectId, type: "character", title: "沈砚", status: "confirmed" });
  creationSourceSelectionPort.createRoot(projectId);
  const branch = nuwaN1Port.createBranch({ projectId, displayName: "往返分支", createdAt: "2026-09-17T02:00:00.000Z", operationId: "op.rt.b" });
  const branchId = branch.branch.workVersionId;
  const node = nuwaN1Port.createBranchNode({
    projectId, branchWorkVersionId: branchId, unitId: unit.id, title: "往返节点",
    blocks: [
      { kind: "description", text: "往返前的完整描写。" },
      { kind: "dialogue", speakerId: speaker.id, text: "往返对白。", heardBy: [], delivery: "spoken" }
    ],
    worldTime: { kind: "explicit", label: "第二年", sortKey: "0002" },
    characterRefs: [speaker.id], runProvenance: { runId: "nuwa-run-rt", stepIds: ["step.rt1"], handoffId: null },
    operationId: "op.rt.node"
  });
  nuwaN1Port.checkpointBranch({ projectId, branchWorkVersionId: branchId, idempotencyKey: "rt-ck", createdAt: "2026-09-17T02:10:00.000Z", operationId: "op.rt.ck" });
  const mainlineUnitBefore = operations.readStoryUnit({ projectId, unitId: unit.id });
  const rootBefore = creationSourceSelectionPort.resolveRootWorkVersion(projectId)!;

  const packagePort = createWorkspacePackagePort({ libraryRoot, resolveProjectPath: ({ projectId: id }) => operations.resolveProjectWorkspacePath({ projectId: id }), backupRoot });
  const exported = packagePort.exportProject({ projectId });
  assert.ok(existsSync(exported.packagePath));
  const packageText = readFileSync(exported.packagePath, "utf8");

  const newLibrary = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-closeout-new-"));
  const importPort = createWorkspacePackagePort({ libraryRoot: newLibrary, resolveProjectPath: ({ projectId: id }) => path.join(newLibrary, id), backupRoot: null });
  const imported = importPort.importProject({ packageText });
  assert.equal(imported.projectId, projectId);

  const operationsNew = createStoryStudioWorkspaceOperations({ rootPath: newLibrary, stateFilePath: path.join(newLibrary, ".studio-state.json") });
  operationsNew.openProject({ projectId });
  const { nuwaN1Port: portNew, creationSourceSelectionPort: creationNew } = buildEnv(newLibrary);
  const projectPathNew = operationsNew.resolveProjectWorkspacePath({ projectId });
  const authorityNew = createStoryStudioWorkVersionAuthority({ projectRoot: projectPathNew });
  const branchReadNew = portNew.readBranch({ projectId, branchWorkVersionId: branchId });
  assert.equal(branchReadNew.branch.workVersionId, branchId, "分支 WorkVersion 身份保真");
  assert.equal(branchReadNew.branch.derivation?.purpose, "nuwa-branch", "derivation 保真");
  assert.equal(branchReadNew.nodes.length, 1);
  const reloaded = branchReadNew.nodes[0]!;
  assert.equal(reloaded.nodeId, node.node.nodeId, "nodeId 保真");
  assert.equal(reloaded.sceneKey, node.node.sceneKey, "sceneKey 保真");
  assert.deepEqual(reloaded.blocks, node.node.blocks, "完整 blocks 保真");
  assert.equal(reloaded.provenance.find((item) => item.kind === "nuwa-run")?.runId, "nuwa-run-rt", "provenance 保真");
  const arrangementNew = operationsNew.readNarrativeArrangement({ projectId, workVersionId: branchId, narrativePathId: unit.id });
  assert.deepEqual(arrangementNew.projection.placed.map((item) => item.eventId), [node.node.eventId], "Placement 保真");
  const checkpointsNew = operationsNew.listNuwaBranchCheckpoints({ projectId, branchWorkVersionId: branchId });
  assert.equal(checkpointsNew.length, 1, "checkpoint 历史保真");
  assert.deepEqual(checkpointsNew[0]!.nodes[0]!.blocks, node.node.blocks);
  const rootNew = creationNew.resolveRootWorkVersion(projectId)!;
  assert.equal(rootNew.identity.currentRevision, rootBefore.identity.currentRevision, "主线 root 修订不变");
  const unitNew = operationsNew.readStoryUnit({ projectId, unitId: unit.id });
  assert.equal(unitNew.version, mainlineUnitBefore.version);
  assert.deepEqual(unitNew.linkedEntityIds, mainlineUnitBefore.linkedEntityIds);
  const exportedRaw = JSON.parse(packageText) as { manifest: { excludedPrefixes: string[] } };
  assert.ok(exportedRaw.manifest.excludedPrefixes.includes(".world-os/runs/"), "运行目录仍被排除");
  assert.ok(exportedRaw.files.some((file: { path: string }) => file.path.includes("nuwa-branches")), "分支存储进入包");
  void speaker; void existsSync;
});
