import assert from "node:assert/strict";
import test from "node:test";

import { createTianyiProductTools } from "../../src/storyAgent/tianyiProductTools.ts";
import { createWorkspacePathPolicy } from "../../src/storyWorkspace/workspacePathPolicy.ts";

const scope = { projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.fixture", runId: "run.fixture" };
const approvalReceiptId = `receipt.tianyi-agent-approval.${"a".repeat(24)}`;

test("artifact tool writes only after approval through the Workspace owner and keeps provenance", async () => {
  const writes: unknown[] = [];
  const checked: unknown[] = [];
  const tools = createTianyiProductTools({
    scope,
    workspacePathPolicy: { assertArtifactRelativePath(input) { checked.push(input); assert.match(input.relativeId, /^artifacts\//u); } },
    createArtifact(input) { writes.push(input); return { id: "artifact.fixture", relativeId: "artifacts/fixture.md" }; },
    async createEntityProposal() { throw new Error("not used"); },
    async createEventGraphCandidate() { throw new Error("not used"); }
  });
  const artifact = tools.find((tool) => tool.name === "create_artifact")!;
  await assert.rejects(artifact.execute({ toolCallId: "call.no-approval", arguments: { type: "screenplay", title: "草稿", content: "正文" }, approvalReceiptId: null }), /审批回执/);
  assert.equal(writes.length, 0);
  const result = await artifact.execute({ toolCallId: "call.approved", arguments: { type: "screenplay", title: "草稿", content: "正文" }, approvalReceiptId });
  assert.equal(writes.length, 1);
  assert.equal(checked.length, 1);
  assert.deepEqual((writes[0] as any).generationBrief, { owner: "tianyi-agent-runtime", projectId: scope.projectId, workVersionId: scope.workVersionId, runId: scope.runId, sourceReceiptId: approvalReceiptId });
  assert.equal((writes[0] as any).workVersionId, scope.workVersionId);
  assert.equal((result as any).relativeId, "artifacts/fixture.md");
  assert.equal((result as any).canonStatus, "not-canon");
  assert.equal(JSON.stringify(result).includes("/home/"), false);
});

test("storage-owned WorkspacePathPolicy rejects traversal, absolute paths and non-artifact roots", () => {
  const policy = createWorkspacePathPolicy();
  assert.doesNotThrow(() => policy.assertArtifactRelativePath({ projectId: "project-fixture", artifactId: "artifact.fixture", relativeId: "artifacts/artifact.fixture.md" }));
  assert.throws(() => policy.assertArtifactRelativePath({ projectId: "project-fixture", artifactId: "artifact.fixture", relativeId: "/tmp/artifact.fixture.md" }), /relative path/iu);
  assert.throws(() => policy.assertArtifactRelativePath({ projectId: "project-fixture", artifactId: "artifact.fixture", relativeId: "artifacts/../secrets/artifact.fixture.md" }), /relative path/iu);
  assert.throws(() => policy.assertArtifactRelativePath({ projectId: "project-fixture", artifactId: "artifact.fixture", relativeId: "world/artifact.fixture.md" }), /artifacts boundary/iu);
});

test("entity tool only hands approved character/item/location proposals to pending owner", async () => {
  const proposals: unknown[] = [];
  const tools = createTianyiProductTools({
    scope,
    createArtifact() { throw new Error("not used"); },
    async createEntityProposal(input) { proposals.push(input); return { proposalId: "proposal.fixture", status: "pending" }; },
    async createEventGraphCandidate() { throw new Error("not used"); }
  });
  const proposal = tools.find((tool) => tool.name === "propose_entity_candidate")!;
  await assert.rejects(proposal.execute({ toolCallId: "call.rejected", arguments: { kind: "character", title: "守门人" }, approvalReceiptId: null }), /审批回执/);
  assert.equal(proposals.length, 0);
  const result = await proposal.execute({ toolCallId: "call.accepted", arguments: { kind: "character", title: "守门人" }, approvalReceiptId });
  assert.equal((result as any).status, "pending");
  assert.equal((proposals[0] as any).workVersionId, scope.workVersionId);
  await assert.rejects(proposal.execute({ toolCallId: "call.canon", arguments: { kind: "event", title: "直接进正史" }, approvalReceiptId }), /安全的现有资料 Owner/);
  assert.equal(proposals.length, 1);
});

test("event graph tool submits only an approved relation candidate to the existing Relation owner", async () => {
  const candidates: unknown[] = [];
  const tools = createTianyiProductTools({
    scope,
    createArtifact() { throw new Error("not used"); },
    async createEntityProposal() { throw new Error("not used"); },
    async createEventGraphCandidate(input) { candidates.push(input); return { relationId: "relation.fixture", reviewState: "candidate" }; }
  });
  const tool = tools.find((candidate) => candidate.name === "submit_event_graph_candidate")!;
  const argumentsValue = { sourceEventId: "event.fixture.one", targetEventId: "event.fixture.two", relationTypeId: "relation-type.fixture", direction: "forward" };
  await assert.rejects(tool.execute({ toolCallId: "call.no-approval", arguments: argumentsValue, approvalReceiptId: null }), /审批回执/);
  assert.equal(candidates.length, 0);
  const result = await tool.execute({ toolCallId: "call.approved", arguments: argumentsValue, approvalReceiptId });
  assert.equal((result as { reviewState: string }).reviewState, "candidate");
  assert.equal((candidates[0] as { sourceEventId: string }).sourceEventId, "event.fixture.one");
  assert.equal((candidates[0] as { sourceReceiptId: string }).sourceReceiptId, approvalReceiptId);
  await assert.rejects(tool.execute({ toolCallId: "call.loop", arguments: { ...argumentsValue, targetEventId: argumentsValue.sourceEventId }, approvalReceiptId }), /不同的正式事件/);
  assert.equal(candidates.length, 1);
});
