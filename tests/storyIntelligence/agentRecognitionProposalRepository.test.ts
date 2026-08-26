import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAgentProposalOperations } from "../../src/storyControlSurface/storyStudioAgentProposalOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  AGENT_RECOGNITION_PROPOSAL_STORE_VERSION,
  beginAgentRecognitionApplication,
  createAgentRecognitionProposal,
  createAgentRecognitionProposalIdempotencyKey,
  editAgentRecognitionProposal,
  ignoreAgentRecognitionProposal,
  readAgentRecognitionProposal,
  readAgentRecognitionProposalStore
} from "../../src/storyIntelligence/agentRecognitionProposalRepository.ts";

const PROJECT_ID = "mist-lighthouse";
const T0 = "2026-08-14T10:00:00.000Z";
const T1 = "2026-08-14T10:01:00.000Z";

test("Agent proposal empty read is zero-write and V1 roundtrip is restart-stable", async () => {
  const fixture = createFixture("roundtrip");
  try {
    const before = relativeFiles(fixture.projectPath);
    assert.deepEqual(await readAgentRecognitionProposalStore({ workspacePath: fixture.projectPath, projectId: PROJECT_ID }), {
      version: AGENT_RECOGNITION_PROPOSAL_STORE_VERSION,
      projectId: PROJECT_ID,
      proposals: []
    });
    assert.deepEqual(relativeFiles(fixture.projectPath), before);

    const created = await createProposal(fixture.projectPath);
    const restarted = await readAgentRecognitionProposalStore({ workspacePath: fixture.projectPath, projectId: PROJECT_ID });
    assert.equal(created.created, true);
    assert.equal(restarted.proposals[0].proposalId, created.proposal.proposalId);
    assert.equal(restarted.proposals[0].status, "pending");
    assert.equal(restarted.proposals[0].evidence[0].excerpt, "守夜人知道印章被调换。");
    assert.equal(readFileSync(storePath(fixture.projectPath), "utf8").includes("完整故事正文"), false);
  } finally {
    fixture.cleanup();
  }
});

test("duplicate recognition create is durable-idempotent while distinct sources remain independent", async () => {
  const fixture = createFixture("duplicate");
  try {
    const first = await createProposal(fixture.projectPath);
    const second = await createProposal(fixture.projectPath);
    const differentSource = await createProposal(fixture.projectPath, { sourceEventId: "event.000002", sourceReceiptId: "receipt.000002" });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.proposal.proposalId, first.proposal.proposalId);
    assert.notEqual(differentSource.proposal.proposalId, first.proposal.proposalId);
    assert.equal((await readAgentRecognitionProposalStore({ workspacePath: fixture.projectPath, projectId: PROJECT_ID })).proposals.length, 2);
    assert.equal(createAgentRecognitionProposalIdempotencyKey({
      projectId: PROJECT_ID,
      storyId: "story.mist-lighthouse",
      tianyiSessionId: "session.000001",
      sourceEventId: "event.000001",
      objectKind: "character",
      suggestedName: " 守夜人 ",
      proposalRevision: 1
    }), first.proposal.idempotencyKey);
  } finally {
    fixture.cleanup();
  }
});

test("proposal parser rejects corrupt, oversized, deep, dangerous, and Event-shaped stores", async () => {
  const fixture = createFixture("invalid");
  try {
    mkdirSync(path.dirname(storePath(fixture.projectPath)), { recursive: true });
    writeFileSync(storePath(fixture.projectPath), "{not-json", "utf8");
    await assert.rejects(() => readAgentRecognitionProposalStore({ workspacePath: fixture.projectPath, projectId: PROJECT_ID }), /JSON|parse/i);
    writeFileSync(storePath(fixture.projectPath), "x".repeat(4 * 1024 * 1024 + 1), "utf8");
    await assert.rejects(() => readAgentRecognitionProposalStore({ workspacePath: fixture.projectPath, projectId: PROJECT_ID }), /size|large|limit/i);
    rmSync(storePath(fixture.projectPath), { force: true });
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 9; index += 1) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    await assert.rejects(() => createProposal(fixture.projectPath, { suggestedFields: deep }), /deep/i);
    await assert.rejects(() => createProposal(fixture.projectPath, { objectKind: "event" as never }), /object kind/i);
    await assert.rejects(() => createProposal(fixture.projectPath, { suggestedFields: JSON.parse('{"__proto__":{"polluted":true}}') }), /forbidden|field|invalid/i);
  } finally {
    fixture.cleanup();
  }
});

test("proposal edit increments revision and invalid state transitions fail closed", async () => {
  const fixture = createFixture("state-machine");
  try {
    const first = (await createProposal(fixture.projectPath)).proposal;
    const edited = await editAgentRecognitionProposal({
      workspacePath: fixture.projectPath,
      projectId: PROJECT_ID,
      proposalId: first.proposalId,
      expectedRevision: 1,
      suggestedName: "守夜人林峤",
      suggestedFields: { status: "active", motive: "尚不确定" },
      uncertainties: ["是否受胁迫"],
      duplicateMatches: [],
      now: T1
    });
    assert.equal(edited.status, "edited");
    assert.equal(edited.revision, 2);
    assert.notEqual(edited.idempotencyKey, first.idempotencyKey);
    await assert.rejects(() => editAgentRecognitionProposal({
      workspacePath: fixture.projectPath,
      projectId: PROJECT_ID,
      proposalId: first.proposalId,
      expectedRevision: 1,
      suggestedName: "过期编辑",
      suggestedFields: {},
      uncertainties: [],
      duplicateMatches: [],
      now: T1
    }), /revision conflict/i);
    const ignored = await ignoreAgentRecognitionProposal({ workspacePath: fixture.projectPath, projectId: PROJECT_ID, proposalId: edited.proposalId, expectedRevision: 2, now: T1 });
    assert.equal(ignored.status, "ignored");
    await assert.rejects(() => beginAgentRecognitionApplication({
      workspacePath: fixture.projectPath,
      projectId: PROJECT_ID,
      proposalId: edited.proposalId,
      expectedRevision: 2,
      mode: "confirm",
      operationId: "agent-apply.ignored",
      targetObjectId: "character.agent-proposal-0123456789abcdef01234567",
      now: T1
    }), /cannot begin/i);
  } finally {
    fixture.cleanup();
  }
});

test("confirm retries and reload converge on one formal character and one receipt", async () => {
  const fixture = createFixture("confirm");
  try {
    const proposal = (await createProposal(fixture.projectPath)).proposal;
    const operations = createStoryStudioAgentProposalOperations({ rootPath: fixture.rootPath, workspaceOperations: fixture.workspace });
    const command = {
      projectId: PROJECT_ID,
      proposalId: proposal.proposalId,
      expectedProposalRevision: proposal.revision,
      operationId: "agent-apply.confirm-0001",
      character: characterApplication("守夜人"),
      now: T1
    };
    const first = await operations.confirmCharacter(command);
    const retry = await createStoryStudioAgentProposalOperations({
      rootPath: fixture.rootPath,
      workspaceOperations: createStoryStudioWorkspaceOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath })
    }).confirmCharacter(command);
    assert.equal(first.proposal.status, "confirmed");
    assert.deepEqual(retry.receipt, first.receipt);
    assert.equal(fixture.workspace.listWorldObjects({ projectId: PROJECT_ID, type: "character" }).filter((object) => object.id === first.receipt.targetObjectRef.objectId).length, 1);
    assert.match(readFileSync(path.join(fixture.projectPath, `world/characters/${first.receipt.targetObjectRef.objectId}.md`), "utf8"), /agent_proposal_operation_ids/);
    assert.equal(existsSync(path.join(fixture.projectPath, ".world-os", "author-control")), false);
  } finally {
    fixture.cleanup();
  }
});

test("interrupted confirm resumes with the durable operation without duplicating a character", async () => {
  const fixture = createFixture("confirm-resume");
  try {
    const proposal = (await createProposal(fixture.projectPath)).proposal;
    let calls = 0;
    const throwingPort = {
      ...fixture.workspace,
      createCharacterFromAgentProposalOnce(input: Parameters<typeof fixture.workspace.createCharacterFromAgentProposalOnce>[0]) {
        calls += 1;
        const result = fixture.workspace.createCharacterFromAgentProposalOnce(input);
        if (calls === 1) throw new Error("simulated post-create interruption");
        return result;
      }
    };
    const operations = createStoryStudioAgentProposalOperations({ rootPath: fixture.rootPath, workspaceOperations: throwingPort });
    const command = {
      projectId: PROJECT_ID,
      proposalId: proposal.proposalId,
      expectedProposalRevision: proposal.revision,
      operationId: "agent-apply.confirm-resume",
      character: characterApplication("守夜人"),
      now: T1
    };
    await assert.rejects(() => operations.confirmCharacter(command), /simulated/);
    assert.equal((await readAgentRecognitionProposal({ workspacePath: fixture.projectPath, projectId: PROJECT_ID, proposalId: proposal.proposalId })).status, "pending");
    const retried = await operations.confirmCharacter(command);
    assert.equal(retried.proposal.status, "confirmed");
    assert.equal(fixture.workspace.listWorldObjects({ projectId: PROJECT_ID, type: "character" }).filter((object) => object.id === retried.receipt.targetObjectRef.objectId).length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("merge retries target the same formal character and preserve the existing object owner", async () => {
  const fixture = createFixture("merge");
  try {
    const target = fixture.workspace.createWorldObject({ projectId: PROJECT_ID, type: "character", title: "林峤", body: "# 林峤\n\n原有人物资料。\n" });
    const proposal = (await createProposal(fixture.projectPath, {
      duplicateMatches: [{ objectId: target.id, objectKind: "character", displayName: target.title, reason: "同一称呼，需要作者判断" }]
    })).proposal;
    const operations = createStoryStudioAgentProposalOperations({ rootPath: fixture.rootPath, workspaceOperations: fixture.workspace });
    const command = {
      projectId: PROJECT_ID,
      proposalId: proposal.proposalId,
      expectedProposalRevision: proposal.revision,
      operationId: "agent-apply.merge-0001",
      targetObjectId: target.id,
      expectedTargetRevision: target.revisionToken,
      character: { ...characterApplication("林峤"), body: "# 林峤\n\n原有人物资料。\n\n补充：他知道印章被调换。\n" },
      now: T1
    };
    const first = await operations.mergeCharacter(command);
    const retry = await operations.mergeCharacter(command);
    assert.equal(first.proposal.status, "merged");
    assert.deepEqual(retry.receipt, first.receipt);
    assert.equal(first.receipt.targetObjectRef.objectId, target.id);
    assert.equal(fixture.workspace.listWorldObjects({ projectId: PROJECT_ID, type: "character" }).length, 1);
    assert.match(fixture.workspace.readWorldObject({ projectId: PROJECT_ID, objectId: target.id }).body, /印章被调换/);
  } finally {
    fixture.cleanup();
  }
});

function createFixture(name: string) {
  const rootPath = mkdtempSync(path.join(tmpdir(), `agent-recognition-${name}-`));
  const stateFilePath = path.join(rootPath, ".studio-state.json");
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: PROJECT_ID });
  return {
    rootPath,
    projectPath: path.join(rootPath, PROJECT_ID),
    stateFilePath,
    workspace,
    cleanup: () => rmSync(rootPath, { recursive: true, force: true })
  };
}

function createProposal(workspacePath: string, overrides: Record<string, unknown> = {}) {
  return createAgentRecognitionProposal({
    workspacePath,
    proposal: {
      projectId: PROJECT_ID,
      storyId: "story.mist-lighthouse",
      tianyiSessionId: "session.000001",
      sourceEventId: "event.000001",
      sourceReceiptId: "receipt.000001",
      sourceWorkspace: "tianyi",
      objectKind: "character",
      suggestedName: "守夜人",
      suggestedFields: { status: "active", role: "守夜人" },
      evidence: [{ sourceRef: "session.000001:event.000001", excerpt: "守夜人知道印章被调换。" }],
      uncertainties: ["他是同谋还是被胁迫"],
      duplicateMatches: [],
      now: T0,
      ...overrides
    } as never
  });
}

function characterApplication(title: string) {
  return { title, status: "active", tags: ["天意识别确认"], aliases: [], body: `# ${title}\n\n守夜人知道印章被调换。\n` };
}

function storePath(workspacePath: string): string {
  return path.join(workspacePath, ".world-os", "story-intelligence", "agent-recognition-proposals", "proposals.json");
}

function relativeFiles(root: string): string[] {
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? visit(absolute) : [path.relative(root, absolute)];
  });
  return visit(root).sort();
}
