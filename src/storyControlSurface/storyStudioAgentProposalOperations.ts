import { createHash } from "node:crypto";
import path from "node:path";

import {
  beginAgentRecognitionApplication,
  completeAgentRecognitionApplication,
  createAgentRecognitionProposal,
  failAgentRecognitionApplication,
  readAgentRecognitionProposal,
  type AgentRecognitionApplicationReceipt,
  type AgentRecognitionProposal
} from "../storyIntelligence/agentRecognitionProposalRepository.ts";
import {
  validateStoryStudioAgentDraftOutput,
  type StoryStudioAgentDraftOutput,
  type StoryStudioAgentDraftRequest
} from "../storyContracts/storyStudioAgentDraft.ts";
import {
  normalizeStoryStudioObjectProfile,
  type StoryStudioObjectProfile,
  type StoryStudioObjectProfileInput
} from "../storyContracts/storyStudioObjectProfile.ts";
import type { StoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";

export type AgentProposalCharacterApplication = {
  title: string;
  status: string;
  tags: string[];
  aliases: string[];
  body: string;
  profile?: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null;
};

export type AgentProposalObjectApplication = AgentProposalCharacterApplication & {
  objectType: "character" | "item" | "location";
};

export type StoryStudioAgentProposalOperations = ReturnType<typeof createStoryStudioAgentProposalOperations>;

export async function createStoryStudioAgentDraftProposal(input: {
  workspacePath: string;
  request: StoryStudioAgentDraftRequest;
  output: StoryStudioAgentDraftOutput;
  now: string;
}): Promise<{ created: boolean; proposal: AgentRecognitionProposal; output: StoryStudioAgentDraftOutput }> {
  const output = validateStoryStudioAgentDraftOutput(input.output);
  if (output.operationId !== input.request.operationId || output.requestedObjectType !== input.request.requestedObjectType) {
    throw new Error("Agent draft output does not match its request.");
  }
  const identity = createHash("sha256").update(`${input.request.projectId}:${input.request.operationId}:${output.suggestedName}`).digest("hex").slice(0, 24);
  const excerpt = input.request.sourceText.normalize("NFC").trim().slice(0, 480) || input.request.authorIntent.normalize("NFC").trim().slice(0, 480);
  const result = await createAgentRecognitionProposal({
    workspacePath: input.workspacePath,
    proposal: {
      projectId: input.request.projectId,
      storyId: `story.${input.request.projectId}`,
      tianyiSessionId: `agent-draft-${identity}`,
      sourceEventId: `agent-draft-source-${identity}`,
      sourceReceiptId: `agent-draft-receipt-${identity}`,
      sourceWorkspace: "library-agent-draft",
      objectKind: output.requestedObjectType,
      suggestedName: output.suggestedName,
      suggestedFields: {
        proposedProfile: output.proposedProfile,
        proposedAliases: output.proposedAliases,
        proposedRelations: output.proposedRelations,
        proposedCustomTypes: output.proposedCustomTypes,
        confidence: output.confidence,
        warnings: output.warnings
      },
      evidence: output.evidenceAnchors.map((sourceRef) => ({ sourceRef, excerpt })),
      uncertainties: output.unresolvedQuestions,
      duplicateMatches: input.request.existingObjectSummaries
        .filter((object) => [object.title, ...object.aliases].some((label) => label.normalize("NFC") === output.suggestedName.normalize("NFC")))
        .map((object) => ({ objectId: object.id, objectKind: output.requestedObjectType, displayName: object.title, reason: "名称或别名可能重复；请作者在审查阶段决定是否继续。" })),
      now: input.now
    }
  });
  return { ...result, output };
}

/**
 * Applies an author-confirmed recognition proposal through the existing Story
 * Workspace object owner. The proposal repository records workflow state only;
 * it never creates or edits a formal object itself.
 */
export function createStoryStudioAgentProposalOperations(input: {
  rootPath: string;
  workspaceOperations: Pick<
    StoryStudioWorkspaceOperations,
    "createCharacterFromAgentProposalOnce" | "createWorldObjectFromAgentProposalOnce" | "mergeAgentProposalIntoCharacterOnce" | "readWorldObject"
  >;
}) {
  return {
    async confirmCharacter(command: {
      projectId: string;
      proposalId: string;
      expectedProposalRevision: number;
      operationId: string;
      character: AgentProposalCharacterApplication;
      now: string;
    }): Promise<{ proposal: AgentRecognitionProposal; receipt: AgentRecognitionApplicationReceipt }> {
      const workspacePath = projectWorkspacePath(input.rootPath, command.projectId);
      const current = await readAgentRecognitionProposal({ workspacePath, projectId: command.projectId, proposalId: command.proposalId });
      assertCharacterProposal(current);
      const targetObjectId = targetCharacterId(current.proposalId);
      const begun = await beginAgentRecognitionApplication({
        workspacePath,
        projectId: command.projectId,
        proposalId: command.proposalId,
        expectedRevision: command.expectedProposalRevision,
        mode: "confirm",
        operationId: command.operationId,
        targetObjectId,
        now: command.now
      });
      if (begun.applicationReceipt) return terminalResult(begun, command.operationId);
      try {
        const result = input.workspaceOperations.createCharacterFromAgentProposalOnce({
          projectId: command.projectId,
          targetObjectId,
          proposalId: begun.proposalId,
          proposalRevision: begun.revision,
          operationId: command.operationId,
          ...normalizeCharacterApplication(command.character)
        });
        if (result.conflict || !result.object) throw new Error("The formal character owner rejected the proposal application as a conflict.");
        const proposal = await completeAgentRecognitionApplication({
          workspacePath,
          projectId: command.projectId,
          proposalId: begun.proposalId,
          operationId: command.operationId,
          targetObjectRef: { projectId: command.projectId, objectId: result.object.id, objectKind: "character" },
          now: command.now
        });
        return terminalResult(proposal, command.operationId);
      } catch (error) {
        await failIfStillActive({ workspacePath, proposal: begun, operationId: command.operationId, now: command.now, error });
        throw error;
      }
    },

    async confirmObject(command: {
      projectId: string;
      proposalId: string;
      expectedProposalRevision: number;
      operationId: string;
      object: AgentProposalObjectApplication;
      now: string;
    }): Promise<{ proposal: AgentRecognitionProposal; receipt: AgentRecognitionApplicationReceipt }> {
      const workspacePath = projectWorkspacePath(input.rootPath, command.projectId);
      const current = await readAgentRecognitionProposal({ workspacePath, projectId: command.projectId, proposalId: command.proposalId });
      assertObjectProposal(current, command.object.objectType);
      const targetObjectId = targetObjectIdFor(command.object.objectType, current.proposalId);
      const begun = await beginAgentRecognitionApplication({
        workspacePath,
        projectId: command.projectId,
        proposalId: command.proposalId,
        expectedRevision: command.expectedProposalRevision,
        mode: "confirm",
        operationId: command.operationId,
        targetObjectId,
        now: command.now
      });
      if (begun.applicationReceipt) return terminalResult(begun, command.operationId);
      try {
        const application = normalizeObjectApplication(command.object);
        const result = command.object.objectType === "character"
          ? input.workspaceOperations.createCharacterFromAgentProposalOnce({
            projectId: command.projectId,
            targetObjectId,
            proposalId: begun.proposalId,
            proposalRevision: begun.revision,
            operationId: command.operationId,
            ...application
          })
          : input.workspaceOperations.createWorldObjectFromAgentProposalOnce({
            projectId: command.projectId,
            targetObjectId,
            objectType: command.object.objectType,
            proposalId: begun.proposalId,
            proposalRevision: begun.revision,
            operationId: command.operationId,
            ...application
          });
        if (result.conflict || !result.object) throw new Error("The formal World Object owner rejected the proposal application as a conflict.");
        const proposal = await completeAgentRecognitionApplication({
          workspacePath,
          projectId: command.projectId,
          proposalId: begun.proposalId,
          operationId: command.operationId,
          targetObjectRef: { projectId: command.projectId, objectId: result.object.id, objectKind: command.object.objectType },
          now: command.now
        });
        return terminalResult(proposal, command.operationId);
      } catch (error) {
        await failIfStillActive({ workspacePath, proposal: begun, operationId: command.operationId, now: command.now, error });
        throw error;
      }
    },

    async mergeCharacter(command: {
      projectId: string;
      proposalId: string;
      expectedProposalRevision: number;
      operationId: string;
      targetObjectId: string;
      expectedTargetRevision: string;
      character: AgentProposalCharacterApplication;
      now: string;
    }): Promise<{ proposal: AgentRecognitionProposal; receipt: AgentRecognitionApplicationReceipt }> {
      const workspacePath = projectWorkspacePath(input.rootPath, command.projectId);
      const current = await readAgentRecognitionProposal({ workspacePath, projectId: command.projectId, proposalId: command.proposalId });
      assertCharacterProposal(current);
      const target = input.workspaceOperations.readWorldObject({ projectId: command.projectId, objectId: command.targetObjectId });
      if (target.type !== "character") throw new Error("Agent recognition merge target must be an existing character.");
      const begun = await beginAgentRecognitionApplication({
        workspacePath,
        projectId: command.projectId,
        proposalId: command.proposalId,
        expectedRevision: command.expectedProposalRevision,
        mode: "merge",
        operationId: command.operationId,
        targetObjectId: target.id,
        now: command.now
      });
      if (begun.applicationReceipt) return terminalResult(begun, command.operationId);
      try {
        const result = input.workspaceOperations.mergeAgentProposalIntoCharacterOnce({
          projectId: command.projectId,
          targetObjectId: target.id,
          expectedHash: command.expectedTargetRevision,
          proposalId: begun.proposalId,
          proposalRevision: begun.revision,
          operationId: command.operationId,
          ...normalizeCharacterApplication(command.character)
        });
        if (result.conflict) throw new Error("The formal character changed before the proposal could be merged.");
        const proposal = await completeAgentRecognitionApplication({
          workspacePath,
          projectId: command.projectId,
          proposalId: begun.proposalId,
          operationId: command.operationId,
          targetObjectRef: { projectId: command.projectId, objectId: result.object.id, objectKind: "character" },
          now: command.now
        });
        return terminalResult(proposal, command.operationId);
      } catch (error) {
        await failIfStillActive({ workspacePath, proposal: begun, operationId: command.operationId, now: command.now, error });
        throw error;
      }
    }
  };
}

function normalizeCharacterApplication(value: AgentProposalCharacterApplication): AgentProposalCharacterApplication {
  const title = boundedText(value.title, "Character title", 80);
  const status = boundedText(value.status, "Character status", 64);
  const tags = boundedTextList(value.tags, "Character tags", 40, 80);
  const aliases = boundedTextList(value.aliases, "Character aliases", 40, 80);
  if (typeof value.body !== "string" || Buffer.byteLength(value.body, "utf8") > 512 * 1024) throw new Error("Character body is invalid.");
  return { title, status, tags, aliases, body: value.body, profile: normalizeOptionalProfile(value.profile, "character") };
}

function normalizeObjectApplication(value: AgentProposalObjectApplication): AgentProposalCharacterApplication & { profile?: StoryStudioObjectProfile | null } {
  const title = boundedText(value.title, "Object title", 80);
  const status = boundedText(value.status, "Object status", 64);
  const tags = boundedTextList(value.tags, "Object tags", 40, 80);
  const aliases = boundedTextList(value.aliases, "Object aliases", 40, 80);
  if (typeof value.body !== "string" || Buffer.byteLength(value.body, "utf8") > 512 * 1024) throw new Error("Object body is invalid.");
  return { title, status, tags, aliases, body: value.body, profile: normalizeOptionalProfile(value.profile, value.objectType) };
}

function targetCharacterId(proposalId: string): string {
  const digest = createHash("sha256").update(proposalId).digest("hex").slice(0, 24);
  return `character.agent-proposal-${digest}`;
}

function targetObjectIdFor(objectType: AgentProposalObjectApplication["objectType"], proposalId: string): string {
  if (objectType === "character") return targetCharacterId(proposalId);
  const digest = createHash("sha256").update(`${objectType}:${proposalId}`).digest("hex").slice(0, 24);
  return `${objectType}.agent-proposal-${digest}`;
}

function projectWorkspacePath(rootPath: string, projectId: string): string {
  const root = path.resolve(rootPath);
  const target = path.resolve(root, projectId);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Agent proposal project path is outside the configured root.");
  return target;
}

function assertCharacterProposal(proposal: AgentRecognitionProposal): void {
  if (proposal.objectKind !== "character") throw new Error("Only character Agent proposals have a formal object application port in this slice.");
}

function assertObjectProposal(proposal: AgentRecognitionProposal, objectType: AgentProposalObjectApplication["objectType"]): void {
  if (proposal.objectKind !== objectType) throw new Error(`Agent proposal object kind must be ${objectType}.`);
}

function normalizeOptionalProfile(value: StoryStudioObjectProfileInput | StoryStudioObjectProfile | null | undefined, objectType: AgentProposalObjectApplication["objectType"]): StoryStudioObjectProfile | null {
  if (value == null) return null;
  const profile = normalizeStoryStudioObjectProfile(value);
  if (profile.objectType !== objectType) throw new Error("Agent proposal profile type does not match the object kind.");
  if (profile.authorConfirmed !== true) return { ...profile, authorConfirmed: true };
  return profile;
}

function terminalResult(proposal: AgentRecognitionProposal, operationId: string): { proposal: AgentRecognitionProposal; receipt: AgentRecognitionApplicationReceipt } {
  if (!proposal.applicationReceipt || proposal.applicationReceipt.operationId !== operationId) {
    throw new Error("Agent recognition proposal terminal receipt is missing or belongs to another operation.");
  }
  return { proposal, receipt: proposal.applicationReceipt };
}

async function failIfStillActive(input: {
  workspacePath: string;
  proposal: AgentRecognitionProposal;
  operationId: string;
  now: string;
  error: unknown;
}): Promise<void> {
  const current = await readAgentRecognitionProposal({
    workspacePath: input.workspacePath,
    projectId: input.proposal.projectId,
    proposalId: input.proposal.proposalId
  });
  if (current.activeApplication?.operationId !== input.operationId) return;
  await failAgentRecognitionApplication({
    workspacePath: input.workspacePath,
    projectId: input.proposal.projectId,
    proposalId: input.proposal.proposalId,
    operationId: input.operationId,
    code: "formal-object-application-failed",
    message: input.error instanceof Error ? input.error.message : "The formal object application failed.",
    now: input.now
  });
}

function boundedText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = value.normalize("NFC").trim();
  if (!text || [...text].length > maximumLength) throw new Error(`${label} is invalid.`);
  return text;
}

function boundedTextList(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} are invalid.`);
  return [...new Set(value.map((item) => boundedText(item, label, maximumLength)))];
}
