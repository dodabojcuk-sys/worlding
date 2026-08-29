import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDeterministicStoryStudioAgentDraft,
  validateStoryStudioAgentDraftOutput,
  type StoryStudioAgentDraftRequest
} from "../../src/storyContracts/storyStudioAgentDraft.ts";
import { createStoryStudioAgentDraftProposal, createStoryStudioAgentProposalOperations } from "../../src/storyControlSurface/storyStudioAgentProposalOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("deterministic Agent draft is schema-bound, source-scoped, and never writes a formal object before review", async () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-agent-core-object-draft-"));
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".studio-state.json") });
  const project = workspace.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const request: StoryStudioAgentDraftRequest = {
    operationId: "operation.library-agent-draft.fixture-1",
    projectId: project.id,
    requestedObjectType: "character",
    mode: "extract",
    authorIntent: "林远是守灯人",
    sourceScope: "fixture:scene-1",
    sourceText: "林远在旧灯塔等待回港的船。",
    existingObjectSummaries: [],
    allowedFieldSchema: ["story-role", "summary", "life", "motivation"],
    noWritePolicy: true
  };
  const output = createDeterministicStoryStudioAgentDraft(request);
  assert.equal(validateStoryStudioAgentDraftOutput(output).proposedProfile.authorConfirmed, false);
  const before = workspace.listWorldObjects({ projectId: project.id });
  const created = await createStoryStudioAgentDraftProposal({ workspacePath: path.join(rootPath, project.id), request, output, now: "2026-08-21T00:00:00.000Z" });
  assert.equal(created.proposal.status, "pending");
  assert.deepEqual(workspace.listWorldObjects({ projectId: project.id }), before);
  assert.equal(created.proposal.suggestedFields.proposedRelations instanceof Array, true);
  assert.equal(created.proposal.evidence[0]?.sourceRef, "fixture:scene-1");
});

test("author confirmation creates one item or location through the existing World Object owner and preserves profile provenance", async () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-agent-core-object-confirm-"));
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, ".studio-state.json") });
  const project = workspace.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const proposalOperations = createStoryStudioAgentProposalOperations({
    rootPath,
    workspaceOperations: {
      createCharacterFromAgentProposalOnce: workspace.createCharacterFromAgentProposalOnce,
      createWorldObjectFromAgentProposalOnce: workspace.createWorldObjectFromAgentProposalOnce,
      mergeAgentProposalIntoCharacterOnce: workspace.mergeAgentProposalIntoCharacterOnce,
      readWorldObject: workspace.readWorldObject
    }
  });
  const eventBefore = workspace.listWorldObjects({ projectId: project.id, type: "event" });

  for (const [objectType, title] of [["item", "旧钥匙"], ["location", "旧灯塔"]] as const) {
    const request: StoryStudioAgentDraftRequest = {
      operationId: `operation.library-agent-draft.${objectType}`,
      projectId: project.id,
      requestedObjectType: objectType,
      mode: "draft",
      authorIntent: title,
      sourceScope: `fixture:${objectType}`,
      sourceText: `${title}在当前故事范围内仍有未知。`,
      existingObjectSummaries: [],
      allowedFieldSchema: objectType === "item" ? ["category", "purpose", "description"] : ["location-type", "description", "atmosphere", "region"],
      noWritePolicy: true
    };
    const output = createDeterministicStoryStudioAgentDraft(request);
    const proposal = await createStoryStudioAgentDraftProposal({ workspacePath: path.join(rootPath, project.id), request, output, now: "2026-08-21T00:00:00.000Z" });
    const application = {
      objectType,
      title,
      status: "active",
      tags: ["fixture"],
      aliases: [],
      body: `# ${title}\n\n隔离测试资料。\n`,
      profile: { ...output.proposedProfile, authorConfirmed: true }
    } as const;
    const first = await proposalOperations.confirmObject({ projectId: project.id, proposalId: proposal.proposal.proposalId, expectedProposalRevision: proposal.proposal.revision, operationId: `operation.library-agent-confirm.${objectType}`, object: application, now: "2026-08-21T00:01:00.000Z" });
    const retry = await proposalOperations.confirmObject({ projectId: project.id, proposalId: proposal.proposal.proposalId, expectedProposalRevision: proposal.proposal.revision, operationId: `operation.library-agent-confirm.${objectType}`, object: application, now: "2026-08-21T00:01:00.000Z" });
    assert.equal(first.receipt.operationId, retry.receipt.operationId);
    assert.equal(first.proposal.status, "confirmed");
    assert.equal(first.proposal.targetObjectRef?.objectKind, objectType);
    const objects = workspace.listWorldObjects({ projectId: project.id, type: objectType });
    assert.equal(objects.length, 1);
    const read = workspace.readWorldObject({ projectId: project.id, objectId: first.proposal.targetObjectRef!.objectId });
    assert.equal(read.profile?.version, "story-studio-object-profile/v1");
    assert.equal(read.profile?.authorConfirmed, true);
    assert.equal(read.profile?.fields[objectType === "item" ? "purpose" : "description"]?.source, "source-anchor");
  }

  assert.deepEqual(workspace.listWorldObjects({ projectId: project.id, type: "event" }), eventBefore);
  assert.equal(workspace.listWorldObjects({ projectId: project.id }).filter((object) => object.type === "character").length, 0);
});
