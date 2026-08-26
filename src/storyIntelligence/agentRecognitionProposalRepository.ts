import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  atomicWriteSecure,
  readSecurePathUtf8,
  withContinuityLock
} from "../storyContinuity/continuityFilesystem.ts";
import {
  assertBoundedTree,
  normalizeNfc,
  parseStrictJson,
  requireHash,
  requireMachineId,
  requireProjectId,
  sha256,
  stableJson
} from "../storyContinuity/continuityValidation.ts";

export const AGENT_RECOGNITION_PROPOSAL_STORE_VERSION = "story-studio-agent-recognition-proposals/v1" as const;
export const AGENT_RECOGNITION_APPLICATION_RECEIPT_VERSION = "story-studio-agent-recognition-application-receipt/v1" as const;

const PROPOSAL_ROOT = path.join(".world-os", "story-intelligence", "agent-recognition-proposals");
const MAX_STORE_BYTES = 4 * 1024 * 1024;
const MAX_PROPOSALS = 2_000;
const MAX_EVIDENCE_ITEMS = 16;
const MAX_DUPLICATE_MATCHES = 32;
const MAX_SUGGESTED_FIELDS = 64;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const AGENT_RECOGNITION_OBJECT_KINDS = [
  "character",
  "location",
  "item",
  "rule",
  "custom_object"
] as const;

export const AGENT_RECOGNITION_PROPOSAL_STATUSES = [
  "pending",
  "edited",
  "confirming",
  "confirmed",
  "merging",
  "merged",
  "ignored"
] as const;

export type AgentRecognitionObjectKind = typeof AGENT_RECOGNITION_OBJECT_KINDS[number];
export type AgentRecognitionProposalStatus = typeof AGENT_RECOGNITION_PROPOSAL_STATUSES[number];
export type AgentRecognitionApplicationMode = "confirm" | "merge";
export type AgentRecognitionJsonValue = null | boolean | number | string | AgentRecognitionJsonValue[] | { [key: string]: AgentRecognitionJsonValue };

export type AgentRecognitionEvidence = {
  sourceRef: string;
  excerpt: string;
};

export type AgentRecognitionDuplicateMatch = {
  objectId: string;
  objectKind: AgentRecognitionObjectKind;
  displayName: string;
  reason: string;
};

export type AgentRecognitionTargetObjectRef = {
  projectId: string;
  objectId: string;
  objectKind: AgentRecognitionObjectKind;
};

export type AgentRecognitionApplicationReceipt = {
  version: typeof AGENT_RECOGNITION_APPLICATION_RECEIPT_VERSION;
  operationId: string;
  mode: AgentRecognitionApplicationMode;
  proposalId: string;
  proposalRevision: number;
  targetObjectRef: AgentRecognitionTargetObjectRef;
  appliedAt: string;
};

export type AgentRecognitionApplicationIntent = {
  operationId: string;
  mode: AgentRecognitionApplicationMode;
  proposalRevision: number;
  targetObjectId: string;
  startedAt: string;
};

export type AgentRecognitionProposalError = {
  code: string;
  message: string;
  operationId: string;
  occurredAt: string;
};

export type AgentRecognitionProposal = {
  proposalId: string;
  projectId: string;
  storyId: string;
  tianyiSessionId: string;
  sourceEventId: string;
  sourceReceiptId: string;
  sourceWorkspace: string;
  objectKind: AgentRecognitionObjectKind;
  suggestedName: string;
  suggestedFields: Record<string, AgentRecognitionJsonValue>;
  evidence: AgentRecognitionEvidence[];
  uncertainties: string[];
  duplicateMatches: AgentRecognitionDuplicateMatch[];
  status: AgentRecognitionProposalStatus;
  revision: number;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  targetObjectRef: AgentRecognitionTargetObjectRef | null;
  applicationReceipt: AgentRecognitionApplicationReceipt | null;
  activeApplication: AgentRecognitionApplicationIntent | null;
  lastError: AgentRecognitionProposalError | null;
};

export type AgentRecognitionProposalStore = {
  version: typeof AGENT_RECOGNITION_PROPOSAL_STORE_VERSION;
  projectId: string;
  proposals: AgentRecognitionProposal[];
};

export type CreateAgentRecognitionProposalInput = Omit<
  AgentRecognitionProposal,
  "proposalId" | "status" | "revision" | "idempotencyKey" | "createdAt" | "updatedAt" |
  "targetObjectRef" | "applicationReceipt" | "activeApplication" | "lastError"
> & {
  now: string;
};

export async function readAgentRecognitionProposalStore(input: {
  workspacePath: string;
  projectId: string;
}): Promise<AgentRecognitionProposalStore> {
  const projectId = requireProjectId(input.projectId);
  const root = workspaceRoot(input.workspacePath);
  const source = await readSecurePathUtf8(root, proposalStorePath(root), MAX_STORE_BYTES);
  if (source == null) return emptyStore(projectId);
  return normalizeAgentRecognitionProposalStore(parseStrictJson(source, MAX_STORE_BYTES, "Agent recognition proposal store"), projectId);
}

export async function listAgentRecognitionProposals(input: {
  workspacePath: string;
  projectId: string;
}): Promise<AgentRecognitionProposal[]> {
  return structuredClone((await readAgentRecognitionProposalStore(input)).proposals);
}

export async function readAgentRecognitionProposal(input: {
  workspacePath: string;
  projectId: string;
  proposalId: string;
}): Promise<AgentRecognitionProposal> {
  const proposalId = requireMachineId(input.proposalId, "Agent proposal identifier");
  const proposal = (await readAgentRecognitionProposalStore(input)).proposals.find((candidate) => candidate.proposalId === proposalId);
  if (!proposal) throw new Error(`Agent recognition proposal does not exist: ${proposalId}.`);
  return structuredClone(proposal);
}

export async function createAgentRecognitionProposal(input: {
  workspacePath: string;
  proposal: CreateAgentRecognitionProposalInput;
}): Promise<{ created: boolean; proposal: AgentRecognitionProposal }> {
  const normalized = normalizeCreateInput(input.proposal);
  return withStoreLock(input.workspacePath, normalized.projectId, async () => {
    const store = await readAgentRecognitionProposalStore({ workspacePath: input.workspacePath, projectId: normalized.projectId });
    const existing = store.proposals.find((candidate) => candidate.idempotencyKey === normalized.idempotencyKey);
    if (existing) {
      if (stableProposalIdentity(existing) !== stableProposalIdentity(normalized)) {
        throw new Error("Agent recognition proposal idempotency key is already bound to different content.");
      }
      return { created: false, proposal: structuredClone(existing) };
    }
    if (store.proposals.length >= MAX_PROPOSALS) throw new Error("Agent recognition proposal store has reached its bounded capacity.");
    const { now, ...proposalInput } = normalized;
    const proposal: AgentRecognitionProposal = {
      ...proposalInput,
      proposalId: proposalIdForKey(normalized.idempotencyKey),
      status: "pending",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      targetObjectRef: null,
      applicationReceipt: null,
      activeApplication: null,
      lastError: null
    };
    const next = { ...store, proposals: [...store.proposals, proposal].sort(compareProposals) };
    await writeStore(input.workspacePath, next);
    return { created: true, proposal: structuredClone(proposal) };
  });
}

export async function editAgentRecognitionProposal(input: {
  workspacePath: string;
  projectId: string;
  proposalId: string;
  expectedRevision: number;
  suggestedName: string;
  suggestedFields: Record<string, AgentRecognitionJsonValue>;
  uncertainties: string[];
  duplicateMatches: AgentRecognitionDuplicateMatch[];
  now: string;
}): Promise<AgentRecognitionProposal> {
  const projectId = requireProjectId(input.projectId);
  return mutateProposal(input.workspacePath, projectId, input.proposalId, (proposal) => {
    assertRevision(proposal, input.expectedRevision);
    if (proposal.status !== "pending" && proposal.status !== "edited") throw new Error(`Agent recognition proposal cannot be edited from ${proposal.status}.`);
    const revision = proposal.revision + 1;
    const suggestedName = boundedText(input.suggestedName, "Suggested object name", 120);
    const suggestedFields = normalizeSuggestedFields(input.suggestedFields);
    const next: AgentRecognitionProposal = {
      ...proposal,
      suggestedName,
      suggestedFields,
      uncertainties: textList(input.uncertainties, "Proposal uncertainties", 32, 500),
      duplicateMatches: normalizeDuplicateMatches(input.duplicateMatches),
      status: "edited",
      revision,
      idempotencyKey: createAgentRecognitionProposalIdempotencyKey({
        projectId: proposal.projectId,
        storyId: proposal.storyId,
        tianyiSessionId: proposal.tianyiSessionId,
        sourceEventId: proposal.sourceEventId,
        objectKind: proposal.objectKind,
        suggestedName,
        proposalRevision: revision
      }),
      updatedAt: timestamp(input.now, "Proposal update time"),
      lastError: null
    };
    return next;
  });
}

export async function ignoreAgentRecognitionProposal(input: {
  workspacePath: string;
  projectId: string;
  proposalId: string;
  expectedRevision: number;
  now: string;
}): Promise<AgentRecognitionProposal> {
  const projectId = requireProjectId(input.projectId);
  return mutateProposal(input.workspacePath, projectId, input.proposalId, (proposal) => {
    assertRevision(proposal, input.expectedRevision);
    if (proposal.status !== "pending" && proposal.status !== "edited") throw new Error(`Agent recognition proposal cannot be ignored from ${proposal.status}.`);
    return { ...proposal, status: "ignored", updatedAt: timestamp(input.now, "Proposal ignore time"), lastError: null };
  });
}

export async function beginAgentRecognitionApplication(input: {
  workspacePath: string;
  projectId: string;
  proposalId: string;
  expectedRevision: number;
  mode: AgentRecognitionApplicationMode;
  operationId: string;
  targetObjectId: string;
  now: string;
}): Promise<AgentRecognitionProposal> {
  const projectId = requireProjectId(input.projectId);
  return mutateProposal(input.workspacePath, projectId, input.proposalId, (proposal) => {
    const operationId = requireMachineId(input.operationId, "Agent proposal application operation");
    if (proposal.applicationReceipt?.operationId === operationId) return proposal;
    if (proposal.activeApplication) {
      if (proposal.activeApplication.operationId !== operationId || proposal.activeApplication.mode !== input.mode) {
        throw new Error("Agent recognition proposal already has a different application in progress.");
      }
      return proposal;
    }
    assertRevision(proposal, input.expectedRevision);
    if (proposal.status !== "pending" && proposal.status !== "edited") throw new Error(`Agent recognition proposal cannot begin ${input.mode} from ${proposal.status}.`);
    if (input.mode === "merge" && proposal.objectKind !== "character") throw new Error("Only character proposals support the current object merge application port.");
    return {
      ...proposal,
      status: input.mode === "confirm" ? "confirming" : "merging",
      activeApplication: {
        operationId,
        mode: input.mode,
        proposalRevision: proposal.revision,
        targetObjectId: boundedReferenceText(input.targetObjectId, "Target object identifier", 160),
        startedAt: timestamp(input.now, "Application start time")
      },
      updatedAt: timestamp(input.now, "Application start time"),
      lastError: null
    };
  });
}

export async function completeAgentRecognitionApplication(input: {
  workspacePath: string;
  projectId: string;
  proposalId: string;
  operationId: string;
  targetObjectRef: AgentRecognitionTargetObjectRef;
  now: string;
}): Promise<AgentRecognitionProposal> {
  const projectId = requireProjectId(input.projectId);
  return mutateProposal(input.workspacePath, projectId, input.proposalId, (proposal) => {
    const operationId = requireMachineId(input.operationId, "Agent proposal application operation");
    if (proposal.applicationReceipt?.operationId === operationId) return proposal;
    const active = proposal.activeApplication;
    if (!active || active.operationId !== operationId) throw new Error("Agent recognition proposal application intent is missing or mismatched.");
    const targetObjectRef = normalizeTargetObjectRef(input.targetObjectRef);
    if (targetObjectRef.projectId !== proposal.projectId || targetObjectRef.objectKind !== proposal.objectKind || targetObjectRef.objectId !== active.targetObjectId) {
      throw new Error("Agent recognition application target does not match its durable intent.");
    }
    const appliedAt = timestamp(input.now, "Application completion time");
    return {
      ...proposal,
      status: active.mode === "confirm" ? "confirmed" : "merged",
      targetObjectRef,
      applicationReceipt: {
        version: AGENT_RECOGNITION_APPLICATION_RECEIPT_VERSION,
        operationId,
        mode: active.mode,
        proposalId: proposal.proposalId,
        proposalRevision: active.proposalRevision,
        targetObjectRef,
        appliedAt
      },
      activeApplication: null,
      lastError: null,
      updatedAt: appliedAt
    };
  });
}

export async function failAgentRecognitionApplication(input: {
  workspacePath: string;
  projectId: string;
  proposalId: string;
  operationId: string;
  code: string;
  message: string;
  now: string;
}): Promise<AgentRecognitionProposal> {
  const projectId = requireProjectId(input.projectId);
  return mutateProposal(input.workspacePath, projectId, input.proposalId, (proposal) => {
    const operationId = requireMachineId(input.operationId, "Agent proposal application operation");
    if (!proposal.activeApplication || proposal.activeApplication.operationId !== operationId) {
      throw new Error("Agent recognition proposal application intent is missing or mismatched.");
    }
    const occurredAt = timestamp(input.now, "Application failure time");
    return {
      ...proposal,
      status: proposal.revision > 1 ? "edited" : "pending",
      activeApplication: null,
      lastError: {
        code: boundedMachineText(input.code, "Application failure code", 80),
        message: boundedText(input.message, "Application failure message", 500),
        operationId,
        occurredAt
      },
      updatedAt: occurredAt
    };
  });
}

export function createAgentRecognitionProposalIdempotencyKey(input: {
  projectId: string;
  storyId: string;
  tianyiSessionId: string;
  sourceEventId: string;
  objectKind: AgentRecognitionObjectKind;
  suggestedName: string;
  proposalRevision: number;
}): string {
  const identity = {
    projectId: requireProjectId(input.projectId),
    storyId: requireMachineId(input.storyId, "Story identifier"),
    tianyiSessionId: requireMachineId(input.tianyiSessionId, "Tianyi Session identifier"),
    sourceEventId: requireMachineId(input.sourceEventId, "Source event identifier"),
    objectKind: objectKind(input.objectKind),
    normalizedIdentity: normalizeIdentity(input.suggestedName),
    proposalRevision: positiveInteger(input.proposalRevision, "Proposal revision")
  };
  return sha256(stableJson(identity));
}

export function normalizeAgentRecognitionProposalStore(value: unknown, expectedProjectId?: string): AgentRecognitionProposalStore {
  const input = exactObject(value, ["version", "projectId", "proposals"], "Agent recognition proposal store");
  if (input.version !== AGENT_RECOGNITION_PROPOSAL_STORE_VERSION) throw new Error("Agent recognition proposal store version is unsupported.");
  const projectId = requireProjectId(input.projectId);
  if (expectedProjectId && projectId !== expectedProjectId) throw new Error("Agent recognition proposal store belongs to another project.");
  if (!Array.isArray(input.proposals) || input.proposals.length > MAX_PROPOSALS) throw new Error("Agent recognition proposal collection is invalid.");
  const proposals = input.proposals.map(normalizeProposal).sort(compareProposals);
  if (new Set(proposals.map((proposal) => proposal.proposalId)).size !== proposals.length) throw new Error("Agent recognition proposal identifiers must be unique.");
  if (new Set(proposals.map((proposal) => proposal.idempotencyKey)).size !== proposals.length) throw new Error("Agent recognition proposal idempotency keys must be unique.");
  if (proposals.some((proposal) => proposal.projectId !== projectId)) throw new Error("Agent recognition proposal crosses its project owner.");
  return { version: AGENT_RECOGNITION_PROPOSAL_STORE_VERSION, projectId, proposals };
}

function normalizeCreateInput(input: CreateAgentRecognitionProposalInput): CreateAgentRecognitionProposalInput & { idempotencyKey: string } {
  const projectId = requireProjectId(input.projectId);
  const storyId = requireMachineId(input.storyId, "Story identifier");
  const tianyiSessionId = requireMachineId(input.tianyiSessionId, "Tianyi Session identifier");
  const sourceEventId = requireMachineId(input.sourceEventId, "Source event identifier");
  const kind = objectKind(input.objectKind);
  const suggestedName = boundedText(input.suggestedName, "Suggested object name", 120);
  const normalized = {
    projectId,
    storyId,
    tianyiSessionId,
    sourceEventId,
    sourceReceiptId: requireMachineId(input.sourceReceiptId, "Source Receipt identifier"),
    sourceWorkspace: boundedMachineText(input.sourceWorkspace, "Source workspace", 80),
    objectKind: kind,
    suggestedName,
    suggestedFields: normalizeSuggestedFields(input.suggestedFields),
    evidence: normalizeEvidence(input.evidence),
    uncertainties: textList(input.uncertainties, "Proposal uncertainties", 32, 500),
    duplicateMatches: normalizeDuplicateMatches(input.duplicateMatches),
    now: timestamp(input.now, "Proposal creation time")
  };
  return {
    ...normalized,
    idempotencyKey: createAgentRecognitionProposalIdempotencyKey({
      projectId,
      storyId,
      tianyiSessionId,
      sourceEventId,
      objectKind: kind,
      suggestedName,
      proposalRevision: 1
    })
  };
}

function normalizeProposal(value: unknown): AgentRecognitionProposal {
  const input = exactObject(value, [
    "proposalId", "projectId", "storyId", "tianyiSessionId", "sourceEventId", "sourceReceiptId", "sourceWorkspace",
    "objectKind", "suggestedName", "suggestedFields", "evidence", "uncertainties", "duplicateMatches", "status", "revision",
    "idempotencyKey", "createdAt", "updatedAt", "targetObjectRef", "applicationReceipt", "activeApplication", "lastError"
  ], "Agent recognition proposal");
  const status = proposalStatus(input.status);
  const proposal: AgentRecognitionProposal = {
    proposalId: requireMachineId(input.proposalId, "Agent proposal identifier"),
    projectId: requireProjectId(input.projectId),
    storyId: requireMachineId(input.storyId, "Story identifier"),
    tianyiSessionId: requireMachineId(input.tianyiSessionId, "Tianyi Session identifier"),
    sourceEventId: requireMachineId(input.sourceEventId, "Source event identifier"),
    sourceReceiptId: requireMachineId(input.sourceReceiptId, "Source Receipt identifier"),
    sourceWorkspace: boundedMachineText(input.sourceWorkspace, "Source workspace", 80),
    objectKind: objectKind(input.objectKind),
    suggestedName: boundedText(input.suggestedName, "Suggested object name", 120),
    suggestedFields: normalizeSuggestedFields(input.suggestedFields),
    evidence: normalizeEvidence(input.evidence),
    uncertainties: textList(input.uncertainties, "Proposal uncertainties", 32, 500),
    duplicateMatches: normalizeDuplicateMatches(input.duplicateMatches),
    status,
    revision: positiveInteger(input.revision, "Proposal revision"),
    idempotencyKey: requireHash(input.idempotencyKey, "Proposal idempotency key"),
    createdAt: timestamp(input.createdAt, "Proposal creation time"),
    updatedAt: timestamp(input.updatedAt, "Proposal update time"),
    targetObjectRef: input.targetObjectRef == null ? null : normalizeTargetObjectRef(input.targetObjectRef),
    applicationReceipt: input.applicationReceipt == null ? null : normalizeApplicationReceipt(input.applicationReceipt),
    activeApplication: input.activeApplication == null ? null : normalizeApplicationIntent(input.activeApplication),
    lastError: input.lastError == null ? null : normalizeProposalError(input.lastError)
  };
  assertProposalState(proposal);
  return proposal;
}

function normalizeApplicationReceipt(value: unknown): AgentRecognitionApplicationReceipt {
  const input = exactObject(value, ["version", "operationId", "mode", "proposalId", "proposalRevision", "targetObjectRef", "appliedAt"], "Agent recognition application receipt");
  if (input.version !== AGENT_RECOGNITION_APPLICATION_RECEIPT_VERSION) throw new Error("Agent recognition application receipt version is unsupported.");
  return {
    version: AGENT_RECOGNITION_APPLICATION_RECEIPT_VERSION,
    operationId: requireMachineId(input.operationId, "Application operation identifier"),
    mode: applicationMode(input.mode),
    proposalId: requireMachineId(input.proposalId, "Agent proposal identifier"),
    proposalRevision: positiveInteger(input.proposalRevision, "Proposal revision"),
    targetObjectRef: normalizeTargetObjectRef(input.targetObjectRef),
    appliedAt: timestamp(input.appliedAt, "Application receipt time")
  };
}

function normalizeApplicationIntent(value: unknown): AgentRecognitionApplicationIntent {
  const input = exactObject(value, ["operationId", "mode", "proposalRevision", "targetObjectId", "startedAt"], "Agent recognition application intent");
  return {
    operationId: requireMachineId(input.operationId, "Application operation identifier"),
    mode: applicationMode(input.mode),
    proposalRevision: positiveInteger(input.proposalRevision, "Proposal revision"),
    targetObjectId: boundedReferenceText(input.targetObjectId, "Target object identifier", 160),
    startedAt: timestamp(input.startedAt, "Application start time")
  };
}

function normalizeProposalError(value: unknown): AgentRecognitionProposalError {
  const input = exactObject(value, ["code", "message", "operationId", "occurredAt"], "Agent recognition proposal error");
  return {
    code: boundedMachineText(input.code, "Application failure code", 80),
    message: boundedText(input.message, "Application failure message", 500),
    operationId: requireMachineId(input.operationId, "Application operation identifier"),
    occurredAt: timestamp(input.occurredAt, "Application failure time")
  };
}

function assertProposalState(proposal: AgentRecognitionProposal): void {
  const active = proposal.status === "confirming" || proposal.status === "merging";
  const terminal = proposal.status === "confirmed" || proposal.status === "merged";
  if (active !== Boolean(proposal.activeApplication)) throw new Error("Agent recognition proposal application state is inconsistent.");
  if (terminal !== Boolean(proposal.applicationReceipt && proposal.targetObjectRef)) throw new Error("Agent recognition proposal terminal state is inconsistent.");
  if (!terminal && (proposal.applicationReceipt || proposal.targetObjectRef)) throw new Error("Non-terminal Agent recognition proposals cannot own an applied target.");
  if (proposal.activeApplication && proposal.activeApplication.proposalRevision !== proposal.revision) throw new Error("Agent recognition application intent revision is stale.");
  if (proposal.applicationReceipt && (proposal.applicationReceipt.proposalId !== proposal.proposalId || proposal.applicationReceipt.targetObjectRef.projectId !== proposal.projectId)) {
    throw new Error("Agent recognition application receipt crosses its proposal owner.");
  }
}

async function mutateProposal(
  workspacePath: string,
  projectId: string,
  rawProposalId: string,
  mutation: (proposal: AgentRecognitionProposal) => AgentRecognitionProposal
): Promise<AgentRecognitionProposal> {
  const proposalId = requireMachineId(rawProposalId, "Agent proposal identifier");
  return withStoreLock(workspacePath, projectId, async () => {
    const store = await readAgentRecognitionProposalStore({ workspacePath, projectId });
    const index = store.proposals.findIndex((proposal) => proposal.proposalId === proposalId);
    if (index < 0) throw new Error(`Agent recognition proposal does not exist: ${proposalId}.`);
    const nextProposal = normalizeProposal(mutation(structuredClone(store.proposals[index])));
    const proposals = store.proposals.slice();
    proposals[index] = nextProposal;
    await writeStore(workspacePath, { ...store, proposals: proposals.sort(compareProposals) });
    return structuredClone(nextProposal);
  });
}

async function writeStore(workspacePath: string, store: AgentRecognitionProposalStore): Promise<void> {
  const normalized = normalizeAgentRecognitionProposalStore(store, store.projectId);
  const source = `${stableJson(normalized)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAX_STORE_BYTES) throw new Error("Agent recognition proposal store is too large.");
  const root = workspaceRoot(workspacePath);
  await atomicWriteSecure(root, proposalStorePath(root), source);
}

function proposalStorePath(workspacePath: string): string {
  return path.join(path.resolve(workspacePath), PROPOSAL_ROOT, "proposals.json");
}

function emptyStore(projectId: string): AgentRecognitionProposalStore {
  return { version: AGENT_RECOGNITION_PROPOSAL_STORE_VERSION, projectId, proposals: [] };
}

function withStoreLock<T>(workspacePath: string, projectId: string, task: () => Promise<T>): Promise<T> {
  return withContinuityLock(workspaceRoot(workspacePath), `agent-recognition-proposals:${projectId}`, task);
}

function workspaceRoot(workspacePath: string): string {
  const configured = path.resolve(workspacePath);
  if (!existsSync(configured) || lstatSync(configured).isSymbolicLink() || !lstatSync(configured).isDirectory()) {
    throw new Error("Agent recognition proposal workspace must be an existing non-symlink directory.");
  }
  return realpathSync(configured);
}

function stableProposalIdentity(value: Pick<AgentRecognitionProposal, "projectId" | "storyId" | "tianyiSessionId" | "sourceEventId" | "sourceReceiptId" | "sourceWorkspace" | "objectKind" | "suggestedName" | "suggestedFields" | "evidence" | "uncertainties" | "duplicateMatches">): string {
  return stableJson({
    projectId: value.projectId,
    storyId: value.storyId,
    tianyiSessionId: value.tianyiSessionId,
    sourceEventId: value.sourceEventId,
    sourceReceiptId: value.sourceReceiptId,
    sourceWorkspace: value.sourceWorkspace,
    objectKind: value.objectKind,
    suggestedName: value.suggestedName,
    suggestedFields: value.suggestedFields,
    evidence: value.evidence,
    uncertainties: value.uncertainties,
    duplicateMatches: value.duplicateMatches
  });
}

function proposalIdForKey(key: string): string {
  if (!HASH_PATTERN.test(key)) throw new Error("Agent recognition proposal key is invalid.");
  return `agent-proposal.${key.slice(0, 24)}`;
}

function normalizeEvidence(value: unknown): AgentRecognitionEvidence[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_ITEMS) throw new Error("Agent recognition evidence is invalid.");
  return value.map((entry) => {
    const item = exactObject(entry, ["sourceRef", "excerpt"], "Agent recognition evidence");
    return {
      sourceRef: boundedMachineText(item.sourceRef, "Evidence source reference", 200),
      excerpt: boundedText(item.excerpt, "Evidence excerpt", 800)
    };
  });
}

function normalizeDuplicateMatches(value: unknown): AgentRecognitionDuplicateMatch[] {
  if (!Array.isArray(value) || value.length > MAX_DUPLICATE_MATCHES) throw new Error("Agent recognition duplicate matches are invalid.");
  const matches = value.map((entry) => {
    const item = exactObject(entry, ["objectId", "objectKind", "displayName", "reason"], "Agent recognition duplicate match");
    return {
      objectId: boundedReferenceText(item.objectId, "Duplicate object identifier", 160),
      objectKind: objectKind(item.objectKind),
      displayName: boundedText(item.displayName, "Duplicate display name", 120),
      reason: boundedText(item.reason, "Duplicate match reason", 500)
    };
  });
  if (new Set(matches.map((match) => `${match.objectKind}:${match.objectId}`)).size !== matches.length) throw new Error("Agent recognition duplicate matches must be unique.");
  return matches;
}

function normalizeSuggestedFields(value: unknown): Record<string, AgentRecognitionJsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Suggested object fields are invalid.");
  assertBoundedTree(value);
  const entries = Object.entries(value);
  if (entries.length > MAX_SUGGESTED_FIELDS) throw new Error("Suggested object fields are too numerous.");
  const normalized: Record<string, AgentRecognitionJsonValue> = {};
  for (const [rawKey, child] of entries) {
    const key = boundedMachineText(rawKey, "Suggested field name", 80);
    if (FORBIDDEN_KEYS.has(key)) throw new Error("Suggested object fields contain a forbidden key.");
    normalized[key] = normalizeJsonValue(child, 0);
  }
  return normalized;
}

function normalizeJsonValue(value: unknown, depth: number): AgentRecognitionJsonValue {
  if (depth > 6) throw new Error("Suggested object fields are too deeply nested.");
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Suggested object field number is invalid.");
    return value;
  }
  if (typeof value === "string") return boundedText(value, "Suggested object field text", 4_000);
  if (Array.isArray(value)) {
    if (value.length > 64) throw new Error("Suggested object field array is too large.");
    return value.map((child) => normalizeJsonValue(child, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 64) throw new Error("Suggested object field object is too large.");
    const normalized: Record<string, AgentRecognitionJsonValue> = {};
    for (const [rawKey, child] of entries) {
      const key = boundedMachineText(rawKey, "Suggested nested field name", 80);
      if (FORBIDDEN_KEYS.has(key)) throw new Error("Suggested object fields contain a forbidden key.");
      normalized[key] = normalizeJsonValue(child, depth + 1);
    }
    return normalized;
  }
  throw new Error("Suggested object field value is invalid.");
}

function normalizeTargetObjectRef(value: unknown): AgentRecognitionTargetObjectRef {
  const input = exactObject(value, ["projectId", "objectId", "objectKind"], "Agent recognition target object reference");
  return {
    projectId: requireProjectId(input.projectId),
    objectId: boundedReferenceText(input.objectId, "Target object identifier", 160),
    objectKind: objectKind(input.objectKind)
  };
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => FORBIDDEN_KEYS.has(key)) || keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw new Error(`${label} fields are invalid.`);
  }
  return record;
}

function textList(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} are invalid.`);
  return value.map((entry) => boundedText(entry, label, maximumLength));
}

function boundedText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = normalizeNfc(value).trim();
  if (!normalized || [...normalized].length > maximumLength) throw new Error(`${label} is invalid.`);
  return normalized;
}

function boundedMachineText(value: unknown, label: string, maximumLength: number): string {
  const text = boundedText(value, label, maximumLength);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:/@+-]*$/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function boundedReferenceText(value: unknown, label: string, maximumLength: number): string {
  const text = boundedText(value, label, maximumLength);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function objectKind(value: unknown): AgentRecognitionObjectKind {
  if (!AGENT_RECOGNITION_OBJECT_KINDS.includes(value as AgentRecognitionObjectKind)) throw new Error("Agent recognition object kind is invalid.");
  return value as AgentRecognitionObjectKind;
}

function proposalStatus(value: unknown): AgentRecognitionProposalStatus {
  if (!AGENT_RECOGNITION_PROPOSAL_STATUSES.includes(value as AgentRecognitionProposalStatus)) throw new Error("Agent recognition proposal status is invalid.");
  return value as AgentRecognitionProposalStatus;
}

function applicationMode(value: unknown): AgentRecognitionApplicationMode {
  if (value !== "confirm" && value !== "merge") throw new Error("Agent recognition application mode is invalid.");
  return value;
}

function normalizeIdentity(value: string): string {
  return boundedText(value, "Suggested object name", 120).toLocaleLowerCase("zh-CN").replace(/\s+/gu, " ");
}

function assertRevision(proposal: AgentRecognitionProposal, expectedRevision: number): void {
  if (proposal.revision !== positiveInteger(expectedRevision, "Expected proposal revision")) throw new Error("Agent recognition proposal revision conflict.");
}

function compareProposals(left: AgentRecognitionProposal, right: AgentRecognitionProposal): number {
  return left.createdAt.localeCompare(right.createdAt) || left.proposalId.localeCompare(right.proposalId);
}
