import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createTianyiProductTools } from "../../src/storyAgent/tianyiProductTools.ts";
import { createStoryStudioAgentProposalOperations } from "../../src/storyControlSurface/storyStudioAgentProposalOperations.ts";
import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  createAgentRecognitionProposal,
  editAgentRecognitionProposal,
  listAgentRecognitionProposals
} from "../../src/storyIntelligence/agentRecognitionProposalRepository.ts";
import { readWorkspaceLayout } from "../../src/storyWorkspace/workspaceLayoutRepository.mjs";
import { createWorkspacePackagePort } from "../../src/storyWorkspace/workspacePackagePort.mjs";
import { createWorkspacePathPolicy } from "../../src/storyWorkspace/workspacePathPolicy.ts";
import { createStoryStudioWorkVersionAuthority } from "../../src/storyWorkspace/workVersionAuthority.ts";

const NOW = "2026-08-29T12:00:00.000Z";
const PROJECT_ID = "r06-storage-agent-roundtrip";
const APPROVAL_RECEIPT = `receipt.tianyi-agent-approval.${"a".repeat(24)}`;

test("storage, Agent, pending confirmation and continuity survive restart plus .tianyan roundtrip", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "tianyan-r06-roundtrip-"));
  const sourceLibrary = path.join(fixtureRoot, "source-library");
  const targetLibrary = path.join(fixtureRoot, "empty-library");
  const backupRoot = path.join(fixtureRoot, "backup");
  await Promise.all([mkdir(sourceLibrary), mkdir(targetLibrary), mkdir(backupRoot)]);
  const sourceState = path.join(fixtureRoot, "source-state.json");
  const targetState = path.join(fixtureRoot, "target-state.json");
  try {
    const operations = createStoryStudioWorkspaceOperations({ rootPath: sourceLibrary, stateFilePath: sourceState });
    operations.createProject({ title: "雾港守夜人", folderSlug: PROJECT_ID });
    const projectPath = path.join(sourceLibrary, PROJECT_ID);

    const character = operations.createCharacterCard({
      projectId: PROJECT_ID,
      title: "林昭",
      mode: "guided",
      subtype: "叙述视角",
      tags: ["守夜人", "雾港"],
      aliases: ["阿昭"],
      background: "负责记录雾港每一次潮汐异象。"
    }).object;
    const category = operations.createWorkspaceFolder({ projectId: PROJECT_ID, title: "核心人物", kind: "custom-category" });
    const event = operations.createWorldObject({ projectId: PROJECT_ID, type: "event", title: "林昭核对潮汐记录", status: "planned", tags: ["往返验收"] });
    const sourceRef = { sourceKind: "event-line" as const, ownerId: "story-studio.event", entityId: event.id, entityVersion: event.revisionToken, capturedAt: NOW, staleState: "fresh" as const };
    operations.createStoryUnit({
      projectId: PROJECT_ID,
      title: "潮汐记录",
      summary: "林昭发现昨夜的潮位记录被改写。",
      sourceRefs: [sourceRef],
      items: [{ id: "story-item.tide-log", kind: "event-scope", authority: "author-intent", possibilityStatus: "selected-for-output", content: { summary: "核对潮位记录" }, sourceRefs: [sourceRef], createdBy: "author" }]
    });
    const creation = createCreationSourceSelectionPort({ operations });
    creation.createRoot(PROJECT_ID);
    const workVersion = creation.resolveRootWorkVersion(PROJECT_ID);
    assert.ok(workVersion);
    operations.updateObjectCatalog({
      projectId: PROJECT_ID,
      workVersionId: workVersion.identity.workVersionId,
      expectedRevision: 0,
      operation: "set-category",
      objectType: "character",
      objectIds: [character.id],
      categoryId: category.folder.id
    });

    const sessionId = "session.r06-roundtrip";
    const runId = "run.r06-roundtrip";
    const tools = createTianyiProductTools({
      scope: { projectId: PROJECT_ID, workVersionId: workVersion.identity.workVersionId, sessionId, runId },
      workspacePathPolicy: createWorkspacePathPolicy(),
      createArtifact(command) { return operations.createOutputArtifact(command); },
      async createEntityProposal(command) {
        const created = await createAgentRecognitionProposal({
          workspacePath: projectPath,
          proposal: {
            projectId: PROJECT_ID,
            storyId: `story.${PROJECT_ID}`,
            tianyiSessionId: command.sessionId,
            sourceEventId: `agent-run-${command.runId}`,
            sourceReceiptId: command.sourceReceiptId,
            sourceWorkspace: "tianyi-agent-provider-tool",
            objectKind: command.kind,
            suggestedName: command.title,
            suggestedFields: { workVersionId: command.workVersionId, runId: command.runId },
            evidence: [{ sourceRef: `${command.sessionId}:${command.runId}`, excerpt: "作者批准的 Agent Run 提议。" }],
            uncertainties: ["身份仍需作者核对。"],
            duplicateMatches: [],
            now: NOW
          }
        });
        return { proposalId: created.proposal.proposalId, status: created.proposal.status };
      }
    });
    const artifactTool = tools.find((tool) => tool.name === "create_artifact")!;
    const proposalTool = tools.find((tool) => tool.name === "propose_entity_candidate")!;
    const artifactResult = await artifactTool.execute({ toolCallId: "call.artifact", arguments: { type: "screenplay", title: "潮汐记录剧本", content: "林昭在灯下展开潮汐册。" }, approvalReceiptId: APPROVAL_RECEIPT }) as { artifactId: string };
    const proposalResult = await proposalTool.execute({ toolCallId: "call.proposal", arguments: { kind: "character", title: "无名守灯人" }, approvalReceiptId: APPROVAL_RECEIPT }) as { proposalId: string };
    const pending = await listAgentRecognitionProposals({ workspacePath: projectPath, projectId: PROJECT_ID });
    assert.equal(pending.find((item) => item.proposalId === proposalResult.proposalId)?.status, "pending");
    const edited = await editAgentRecognitionProposal({
      workspacePath: projectPath,
      projectId: PROJECT_ID,
      proposalId: proposalResult.proposalId,
      expectedRevision: 1,
      suggestedName: "许灯",
      suggestedFields: { workVersionId: workVersion.identity.workVersionId, runId },
      uncertainties: [],
      duplicateMatches: [],
      now: "2026-08-29T12:01:00.000Z"
    });
    const proposalOperations = createStoryStudioAgentProposalOperations({ rootPath: sourceLibrary, workspaceOperations: operations });
    const confirmed = await proposalOperations.confirmCharacter({
      projectId: PROJECT_ID,
      proposalId: edited.proposalId,
      expectedProposalRevision: edited.revision,
      operationId: "operation.r06.author-confirm",
      character: { title: edited.suggestedName, status: "active", tags: ["Agent 候选", "作者确认"], aliases: [], body: "# 许灯\n\n由作者在统一待确认中编辑并通过。" },
      now: "2026-08-29T12:02:00.000Z"
    });
    assert.equal(confirmed.proposal.status, "confirmed");
    assert.equal(operations.readWorldObject({ projectId: PROJECT_ID, objectId: confirmed.receipt.targetObjectRef.objectId }).title, "许灯");

    const tianyi = createStoryStudioTianyiOperations({ rootPath: sourceLibrary, stateFilePath: sourceState, now: () => NOW });
    const opened = await tianyi.openTianyiSession({ projectId: PROJECT_ID, operationId: "operation.r06.session-open" });
    const contextRequest = { productMode: "world" as const, activeOwner: { kind: "project" as const, id: PROJECT_ID }, selection: { documentId: null, objectId: null, timelinePointId: null }, sourceRefs: [], memorySelections: [], enabledSkillRefs: [] };
    const question = await tianyi.runTianyiQuestion({ projectId: PROJECT_ID, sessionId: opened.sessionId, operationId: "operation.r06.author-question", request: { boundedAction: "fixture.current" }, contextRequest });
    assert.equal(question.status, "current");
    assert.match(question.receiptId, /^receipt\./u);
    const runtimeReceipt = await tianyi.appendTianyiAgentRuntimeEvent({
      projectId: PROJECT_ID,
      workVersionId: workVersion.identity.workVersionId,
      sessionId: opened.sessionId,
      runId,
      operationId: "operation.r06.agent-run",
      kind: "receipt",
      projection: { status: "completed", artifactId: artifactResult.artifactId, sourceReceiptId: APPROVAL_RECEIPT },
      recordedAt: "2026-08-29T12:03:00.000Z"
    });
    assert.match(runtimeReceipt.receiptId, /^receipt\.tianyi-agent\./u);
    await tianyi.rebuildTianyiArchiveRecall({ projectId: PROJECT_ID });

    await Promise.all([
      mkdir(path.join(projectPath, ".world-os/cache"), { recursive: true }),
      mkdir(path.join(projectPath, ".world-os/locks"), { recursive: true }),
      mkdir(path.join(projectPath, ".world-os/runs"), { recursive: true }),
      mkdir(path.join(projectPath, "credentials"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(path.join(projectPath, ".world-os/cache/archive-index.json"), "cache"),
      writeFile(path.join(projectPath, ".world-os/locks/write.lock"), "lock"),
      writeFile(path.join(projectPath, ".world-os/runs/partial.json"), "partial"),
      writeFile(path.join(projectPath, "credentials/provider.json"), "credential")
    ]);

    // A fresh object graph simulates stopping and restarting the service before export.
    const restartedOperations = createStoryStudioWorkspaceOperations({ rootPath: sourceLibrary, stateFilePath: sourceState });
    const restartedTianyi = createStoryStudioTianyiOperations({ rootPath: sourceLibrary, stateFilePath: sourceState, now: () => NOW });
    assert.equal(restartedOperations.readWorldObject({ projectId: PROJECT_ID, objectId: character.id }).subtype, "叙述视角");
    assert.equal((await restartedTianyi.readTianyiAgentRuntimeEvents({ projectId: PROJECT_ID, workVersionId: workVersion.identity.workVersionId, sessionId: opened.sessionId, runId })).length, 1);

    const sourcePackagePort = createWorkspacePackagePort({ libraryRoot: sourceLibrary, backupRoot, resolveProjectPath: ({ projectId }: { projectId: string }) => path.join(sourceLibrary, projectId) });
    const exported = sourcePackagePort.exportProject({ projectId: PROJECT_ID, workVersionIds: [workVersion.identity.workVersionId] });
    const packageText = await readFile(exported.packagePath, "utf8");
    const packageValue = JSON.parse(packageText) as { manifest: { files: Array<{ path: string }> }; files: Array<{ path: string; data: string }> };
    const packagePaths = packageValue.manifest.files.map((file) => file.path);
    assert.equal(packagePaths.some((entry) => entry.startsWith("continuity/")), true, "Session, Archive and receipts must be portable");
    assert.equal(packagePaths.some((entry) => entry.includes("work-versions")), true);
    assert.equal(packagePaths.some((entry) => /(?:credentials?|secrets?|cache|locks?|runs)(?:\/|$)/iu.test(entry) || /\.lock$/iu.test(entry)), false);
    const decodedPackage = packageValue.files.map((file) => Buffer.from(file.data, "base64").toString("utf8")).join("\n");
    assert.equal(decodedPackage.includes(sourceLibrary), false);
    assert.equal(decodedPackage.includes(fixtureRoot), false);
    assert.equal(decodedPackage.includes("credential"), false);

    const targetPackagePort = createWorkspacePackagePort({ libraryRoot: targetLibrary, resolveProjectPath: ({ projectId }: { projectId: string }) => path.join(targetLibrary, projectId) });
    assert.equal(targetPackagePort.importProject({ packageText }).projectId, PROJECT_ID);
    assert.throws(() => targetPackagePort.importProject({ packageText }), /already exists/iu);

    // Reopening after import proves the destination is a normal Workspace, not a parallel store.
    const importedOperations = createStoryStudioWorkspaceOperations({ rootPath: targetLibrary, stateFilePath: targetState });
    importedOperations.openProject({ projectId: PROJECT_ID });
    const importedProjectPath = path.join(targetLibrary, PROJECT_ID);
    const importedTianyi = createStoryStudioTianyiOperations({ rootPath: targetLibrary, stateFilePath: targetState, now: () => NOW });
    const importedCharacter = importedOperations.readWorldObject({ projectId: PROJECT_ID, objectId: character.id });
    assert.equal(importedCharacter.subtype, "叙述视角");
    assert.deepEqual(importedCharacter.tags, ["守夜人", "雾港"]);
    assert.equal(readWorkspaceLayout(importedProjectPath).folders.some((folder) => folder.id === category.folder.id && folder.kind === "custom-category"), true);
    assert.equal(importedOperations.readObjectCatalog({ projectId: PROJECT_ID, workVersionId: workVersion.identity.workVersionId }).records.some((record) => record.objectId === character.id && record.categoryId === category.folder.id), true);
    assert.equal(createStoryStudioWorkVersionAuthority({ projectRoot: importedProjectPath }).listVersions().some((item) => item.identity.workVersionId === workVersion.identity.workVersionId), true);
    assert.equal(importedOperations.listOutputArtifacts({ projectId: PROJECT_ID }).some((artifact) => artifact.id === artifactResult.artifactId && artifact.generationBrief?.sourceReceiptId === APPROVAL_RECEIPT), true);
    const importedProposal = (await listAgentRecognitionProposals({ workspacePath: importedProjectPath, projectId: PROJECT_ID })).find((item) => item.proposalId === edited.proposalId);
    assert.equal(importedProposal?.status, "confirmed");
    assert.equal(importedOperations.readWorldObject({ projectId: PROJECT_ID, objectId: confirmed.receipt.targetObjectRef.objectId }).title, "许灯");
    const importedArchive = await importedTianyi.readTianyiSessionEvents({ projectId: PROJECT_ID, sessionId: opened.sessionId, startSequence: 1, limit: 100 });
    assert.equal(importedArchive?.events.some((event) => event.type === "author-message" || event.type === "bounded-action"), true);
    assert.equal(importedArchive?.events.some((event) => event.type === "tianyi-response"), true);
    assert.equal((await importedTianyi.readTianyiAgentRuntimeEvents({ projectId: PROJECT_ID, workVersionId: workVersion.identity.workVersionId, sessionId: opened.sessionId, runId })).length, 1);
    assert.equal((await importedTianyi.listTianyiReceipts({ projectId: PROJECT_ID })).some((receipt) => receipt.id === question.receiptId), true);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
