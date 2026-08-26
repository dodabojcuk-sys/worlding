import { sha256 } from "./continuityValidation.ts";
import { archiveEventHash, visibleArchiveEventContent, type ArchiveRecallResolvedMessage } from "./archiveRecallRepository.ts";
import {
  allocateSessionId,
  appendSessionEvent,
  createSession,
  listSessionMetadata,
  readSession
} from "./interactionArchiveRepository.ts";
import { allocateReceiptId, createReceipt, createStoppingPoint, allocateStoppingPointId, readReceipt } from "./receiptStoppingRepositories.ts";
import { allocateMemoryId, createGlobalMemoryGrant, createMemory, readGlobalMemoryGrant, readMemory } from "./memoryGrantRepositories.ts";
import { GLOBAL_MEMORY_GRANT_VERSION, INTERACTION_EVENT_VERSION, MEMORY_VERSION, STOPPING_POINT_VERSION, type InteractionEvent, type MemoryItem } from "./continuityTypes.ts";
import { runTianyiDeterministicQuestion, type TianyiQuestionResult } from "./tianyiContextQuestion.ts";
import type { TianyiRawSourceMaterial } from "./boundedSourceMaterial.ts";
import type { TianyiContextProjection } from "./tianyiContextProjection.ts";
import type { TianyiRuntimeInput } from "./tianyiFixtureAdapter.ts";
import type { ContinuityContext } from "./continuityFilesystem.ts";
import type { StoryStudioEventReference } from "../storyContracts/storyStudioEventReference.ts";
import type { TianyiGroundedModelGateway } from "./tianyiGroundedAnswerOperation.ts";

export type TianyiContextRequest = {
  productMode: "world" | "writing" | "intelligence" | "localization" | "publish";
  activeOwner: { kind: "project" | "writing-document" | "world-object" | "visual-document"; id: string | null };
  selection: { documentId: string | null; objectId: string | null; timelinePointId: string | null };
  sourceRefs: Array<{ id: string; kind: string; origin: string }>;
  memorySelections: Array<{ id: string; scope: "author-global" | "project" }>;
  enabledSkillRefs: Array<{ id: string; version: string }>;
  /** Optional only so archived pre-Phase 1B requests remain readable. */
  eventRefs?: StoryStudioEventReference[];
};

export type TianyiOwnerOperationResult = {
  owner: string;
  attempted: boolean;
  saved: boolean;
  conflicted: boolean;
  rejected: boolean;
  alreadyCompleted: boolean;
  currentHash: string | null;
  expectedHash: string | null;
  recoveryAction: string | null;
};

type MemoryProposal = {
  version: "tianyi-memory-candidate/v1";
  candidateId: string;
  statement: string;
  scope: "author-global" | "project";
  kind: MemoryItem["kind"];
  sensitivity: MemoryItem["sensitivity"];
  sources: Array<{ id: string; hash: string; kind: "story-source" | "archive-message"; sessionId: string | null }>;
  runtimeInvolvement: "deterministic-fixture";
  sessionId: string;
  operationId: string;
  personaRevision: number;
  relationshipPolicyRevision: number;
};

type StoppingProposal = {
  version: "tianyi-stopping-point-candidate/v1";
  candidateId: string;
  sourceId: string;
  sourceHash: string;
  statement: string;
  unresolvedThreadIds: string[];
  sessionId: string;
  operationId: string;
};

type QuestionArchiveContent = {
  version: "tianyi-question-operation/v1";
  request: TianyiRuntimeInput["request"];
  receiptId: string;
  contextRequest: TianyiContextRequest;
  archiveMessageRefs?: Array<{ sessionId: string; eventId: string; contentHash: string }>;
};

type ResponseArchiveContent = {
  version: "tianyi-response-operation/v1";
  visibleResponse: string;
  status: TianyiQuestionResult["status"];
  failure: TianyiQuestionResult["failure"];
  memoryProposals: MemoryProposal[];
};

export function createTianyiSessionOperations(dependencies: {
  rootPath: string;
  agentId?: string;
  now?: () => string;
  buildProjection(projectId: string, request: TianyiContextRequest): Promise<TianyiContextProjection>;
  readSourceMaterial(projectId: string, projection: TianyiContextProjection): Promise<TianyiRawSourceMaterial[]>;
  localControlToken?: string;
  modelGateway?: TianyiGroundedModelGateway;
  resolveArchiveMessages?(projectId: string, refs: Array<{ sessionId: string; eventId: string; contentHash: string }>): Promise<ArchiveRecallResolvedMessage[]>;
}) {
  const agentId = requireId(dependencies.agentId ?? "agent.tianyi", "Agent identifier");
  const now = dependencies.now ?? (() => new Date().toISOString());
  type TemporarySession = { id: string; projectId: string; openedAt: string; events: InteractionEvent[]; questions: Map<string, TianyiQuestionResult> };
  const temporarySessions = new Map<string, TemporarySession>();

  function context(projectId: string): ContinuityContext {
    return { rootPath: dependencies.rootPath, agentId, scope: "project", projectId: requireProjectId(projectId) };
  }

  async function openTianyiSession(input: { projectId: string; operationId: string; retentionMode?: "normal" | "temporary" }) {
    const projectContext = context(input.projectId);
    const operationId = requireId(input.operationId, "Operation identifier");
    const retentionMode = input.retentionMode ?? "normal";
    if (retentionMode !== "normal" && retentionMode !== "temporary") throw new Error("Tianyi Session retention mode is invalid.");
    if (retentionMode === "temporary") {
      const sessionId = deterministicId("temporary-session", input.projectId, operationId);
      const existing = temporarySessions.get(sessionId);
      if (existing) return { sessionId, contentHash: null, alreadyCompleted: true, conflict: false, retentionMode: "temporary" as const, archiveWriteCount: 0 };
      const recordedAt = requireTimestamp(now());
      temporarySessions.set(sessionId, { id: sessionId, projectId: input.projectId, openedAt: recordedAt, events: [makeEvent({ sessionId, sequence: 1, type: "session-opened", actor: "system", content: json({ projectId: input.projectId, agentId, retentionMode: "temporary" }), operationId, recordedAt })], questions: new Map() });
      return { sessionId, contentHash: null, alreadyCompleted: false, conflict: false, retentionMode: "temporary" as const, archiveWriteCount: 0 };
    }
    for (const metadata of await listSessionMetadata(projectContext)) {
      const existing = await readSession(projectContext, metadata.id);
      if (existing?.value.some((event) => event.type === "session-opened" && event.operationId === operationId)) {
        return { sessionId: metadata.id, contentHash: existing.contentHash, alreadyCompleted: true, retentionMode: "normal" as const, archiveWriteCount: 0 };
      }
    }
    const sessionId = await allocateSessionId(projectContext);
    const recordedAt = requireTimestamp(now());
    const event = makeEvent({ sessionId, sequence: 1, type: "session-opened", actor: "system", content: json({ projectId: input.projectId, agentId }), operationId, recordedAt });
    const result = await createSession(projectContext, event, { source: "create", recordedAt, operationId });
    if (!result.ok) return { sessionId, contentHash: result.current?.contentHash ?? null, alreadyCompleted: false, conflict: true };
    return { sessionId, contentHash: result.current.contentHash, alreadyCompleted: false, conflict: false, retentionMode: "normal" as const, archiveWriteCount: 1 };
  }

  async function runTianyiQuestion(input: {
    projectId: string;
    sessionId: string;
    operationId: string;
    request: TianyiRuntimeInput["request"];
    contextRequest: TianyiContextRequest;
    archiveMessageRefs?: Array<{ sessionId: string; eventId: string; contentHash: string }>;
  }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    const temporary = temporarySessions.get(sessionId);
    if (temporary) return runTemporaryQuestion(temporary, input);
    let session = await requireOpenSession(projectContext, sessionId);
    const priorAuthorEvent = session.value.find((event) => (event.type === "author-message" || event.type === "bounded-action") && event.operationId === operationId);
    let archiveContent: QuestionArchiveContent;
    const ownerResults: TianyiOwnerOperationResult[] = [];
    if (priorAuthorEvent) {
      archiveContent = parseQuestionContent(priorAuthorEvent.content);
      ownerResults.push(completed("archive-author", session.contentHash));
    } else {
      const receiptId = await allocateReceiptId(projectContext);
      archiveContent = { version: "tianyi-question-operation/v1", request: structuredClone(input.request), receiptId, contextRequest: structuredClone(input.contextRequest), ...(input.archiveMessageRefs?.length ? { archiveMessageRefs: structuredClone(input.archiveMessageRefs) } : {}) };
      const type = "authorQuery" in input.request ? "author-message" : "bounded-action";
      const authorAppend = await append(projectContext, session, makeEvent({
        sessionId,
        sequence: session.value.length + 1,
        type,
        actor: "author",
        content: json(archiveContent),
        operationId,
        recordedAt: requireTimestamp(now())
      }));
      ownerResults.push(authorAppend.result);
      if (!authorAppend.session) return { status: "partial", ownerResults, receiptId, question: null };
      session = authorAppend.session;
    }

    const existingResponse = session.value.find((event) => event.type === "tianyi-response" && event.operationId === operationId);
    if (existingResponse) {
      const response = parseResponseContent(existingResponse.content);
      const receipt = await readReceipt(projectContext, archiveContent.receiptId);
      ownerResults.push(completed("receipt", receipt?.contentHash ?? null), completed("archive-response", session.contentHash));
      return { status: response.status, ownerResults, receiptId: archiveContent.receiptId, question: response };
    }

    const archiveMessages = await requireCurrentArchiveMessages(input.projectId, archiveContent.archiveMessageRefs ?? []);
    const question = await runTianyiDeterministicQuestion({
      agentId,
      sessionId,
      receiptId: archiveContent.receiptId,
      generationTimestamp: requireTimestamp(now()),
      request: archiveContent.request,
      buildProjection: () => dependencies.buildProjection(input.projectId, archiveContent.contextRequest),
      readSourceMaterial: (projection) => dependencies.readSourceMaterial(input.projectId, projection),
      archiveMessages,
      recheckArchiveMessages: async () => requireCurrentArchiveMessages(input.projectId, archiveContent.archiveMessageRefs ?? []),
      localControlToken: dependencies.localControlToken
    });
    const proposals = question.memoryCandidates.map((candidate, index): MemoryProposal => ({
      version: "tianyi-memory-candidate/v1",
      candidateId: deterministicId("candidate.memory", operationId, String(index + 1)),
      statement: candidate.statement,
      scope: candidate.scope,
      kind: candidate.kind as MemoryItem["kind"],
      sensitivity: candidate.sensitivity,
      sources: candidate.sourceRefs.map((id) => {
        const story = question.receipt.sources.find((source) => "sourceKey" in source ? source.sourceKey === id || source.sourceId === id : "sourceRef" in source ? source.sourceRef === id : source.id === id);
        const archive = "archiveMessageRefs" in question.receipt ? question.receipt.archiveMessageRefs.find((source) => source.eventId === id) : undefined;
        return story
          ? { id, hash: "contentHash" in story ? story.contentHash : story.hash, kind: "story-source" as const, sessionId: null }
          : archive
            ? { id, hash: archive.contentHash, kind: "archive-message" as const, sessionId: archive.sessionId }
            : { id, hash: sha256(`missing:${id}`), kind: "story-source" as const, sessionId: null };
      }),
      runtimeInvolvement: "deterministic-fixture",
      sessionId,
      operationId,
      personaRevision: question.receipt.personaRevision,
      relationshipPolicyRevision: question.receipt.relationshipPolicyRevision
    })).map((proposal) => findDuplicateProposal(session.value, proposal) ?? proposal);

    const existingReceipt = await readReceipt(projectContext, archiveContent.receiptId);
    if (existingReceipt) {
      ownerResults.push(completed("receipt", existingReceipt.contentHash));
    } else {
      const receiptWrite = await createReceipt(projectContext, question.receipt, { source: "immutable-create", recordedAt: requireTimestamp(now()), operationId });
      ownerResults.push(writeResult("receipt", receiptWrite, null));
      if (!receiptWrite.ok) return { status: "partial", ownerResults, receiptId: archiveContent.receiptId, question };
    }

    session = await requireOpenSession(projectContext, sessionId);
    const responseContent: ResponseArchiveContent = { version: "tianyi-response-operation/v1", visibleResponse: question.visibleResponse, status: question.status, failure: question.failure, memoryProposals: proposals };
    const responseAppend = await append(projectContext, session, makeEvent({
      sessionId,
      sequence: session.value.length + 1,
      type: "tianyi-response",
      actor: "tianyi",
      content: json(responseContent),
      responseClassifications: question.classifications,
      memoryCandidateIds: proposals.map((proposal) => proposal.candidateId),
      receiptId: archiveContent.receiptId,
      operationId,
      recordedAt: requireTimestamp(now())
    }));
    ownerResults.push(responseAppend.result);
    if (!responseAppend.session) return { status: "partial", ownerResults, receiptId: archiveContent.receiptId, question };
    session = responseAppend.session;
    for (const proposal of proposals) {
      if (session.value.some((event) => event.type === "memory-candidate-proposed" && event.memoryCandidateIds.includes(proposal.candidateId))) continue;
      const proposalAppend = await append(projectContext, session, makeEvent({
        sessionId,
        sequence: session.value.length + 1,
        type: "memory-candidate-proposed",
        actor: "tianyi",
        content: json(proposal),
        memoryCandidateIds: [proposal.candidateId],
        operationId,
        recordedAt: requireTimestamp(now()),
        receiptId: archiveContent.receiptId
      }));
      ownerResults.push(proposalAppend.result);
      if (!proposalAppend.session) break;
      session = proposalAppend.session;
    }
    return { status: question.status, ownerResults, receiptId: archiveContent.receiptId, question };
  }

  async function prepareTianyiSessionClose(input: { projectId: string; sessionId: string; operationId: string; contextRequest: TianyiContextRequest }) {
    const operation = await runTianyiQuestion({ ...input, request: { boundedAction: "fixture.session-close" } });
    const projectContext = context(input.projectId);
    let session = await requireOpenSession(projectContext, input.sessionId);
    const prior = session.value.find((event) => event.type === "stopping-point-proposed" && event.operationId === input.operationId);
    if (prior) return { ...operation, stoppingPointCandidate: parseStoppingProposal(prior.content), alreadyCompleted: true };
    const projection = await dependencies.buildProjection(input.projectId, input.contextRequest);
    const source = projection.sources.find((item) => item.state === "current" && !item.exclusionReason);
    if (!source) return { ...operation, stoppingPointCandidate: null, alreadyCompleted: false };
    const candidate: StoppingProposal = {
      version: "tianyi-stopping-point-candidate/v1",
      candidateId: deterministicId("candidate.stopping", input.operationId),
      sourceId: source.id,
      sourceHash: source.hash,
      statement: operation.question?.visibleResponse ?? "Session close is ready for author review.",
      unresolvedThreadIds: projection.unresolvedThreadIds,
      sessionId: input.sessionId,
      operationId: input.operationId
    };
    session = await requireOpenSession(projectContext, input.sessionId);
    const appended = await append(projectContext, session, makeEvent({ sessionId: input.sessionId, sequence: session.value.length + 1, type: "stopping-point-proposed", actor: "tianyi", content: json(candidate), operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
    return { ...operation, ownerResults: [...operation.ownerResults, appended.result], stoppingPointCandidate: candidate, alreadyCompleted: false };
  }

  async function decideTianyiMemoryCandidate(input: {
    projectId: string;
    sessionId: string;
    candidateId: string;
    operationId: string;
    decision: "accepted" | "rejected";
    edits?: { statement: string; scope: "author-global" | "project"; kind: MemoryItem["kind"]; sensitivity: MemoryItem["sensitivity"] };
    secondConfirmation: boolean;
    createProjectGrant: boolean;
    contextRequest: TianyiContextRequest;
  }) {
    const projectContext = context(input.projectId);
    const session = await readSession(projectContext, requireId(input.sessionId, "Session identifier"));
    if (!session) throw new Error("Tianyi session does not exist.");
    const proposalEvent = session.value.find((event) => event.type === "memory-candidate-proposed" && event.memoryCandidateIds.includes(input.candidateId));
    if (!proposalEvent) throw new Error("Memory candidate does not exist.");
    const proposal = parseMemoryProposal(proposalEvent.content);
    const existingDecision = session.value.find((event) => event.type === "memory-candidate-decided" && event.memoryCandidateIds.includes(input.candidateId));
    if (input.decision === "rejected") {
      if (existingDecision) return { candidate: proposal, ownerResults: [completed("archive-decision", session.contentHash)], durableMemoryCount: 0 };
      const appended = await append(projectContext, await requireOpenSession(projectContext, input.sessionId), makeEvent({ sessionId: input.sessionId, sequence: session.value.length + 1, type: "memory-candidate-decided", actor: "author", content: json({ candidateId: input.candidateId, decision: "rejected" }), memoryCandidateIds: [input.candidateId], operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
      return { candidate: proposal, ownerResults: [appended.result], durableMemoryCount: 0 };
    }
    let finalValue = input.edits ?? { statement: proposal.statement, scope: proposal.scope, kind: proposal.kind, sensitivity: proposal.sensitivity };
    finalValue = { statement: requireStatement(finalValue.statement), scope: requireScope(finalValue.scope), kind: requireMemoryKind(finalValue.kind), sensitivity: requireSensitivity(finalValue.sensitivity) };
    if (finalValue.sensitivity === "restricted") throw new Error("Restricted Memory cannot be persisted.");
    if ((finalValue.sensitivity === "personal" || finalValue.sensitivity === "sensitive") && input.secondConfirmation !== true) throw new Error("Sensitive Memory requires a second confirmation.");
    const projection = await dependencies.buildProjection(input.projectId, input.contextRequest);
    const archiveSources = proposal.sources.filter((source) => source.kind === "archive-message" && source.sessionId).map((source) => ({ sessionId: source.sessionId as string, eventId: source.id, contentHash: source.hash }));
    const resolvedArchiveSources = await requireCurrentArchiveMessages(input.projectId, archiveSources);
    const staleSources = proposal.sources.filter((source) => source.kind === "story-source" && projection.sources.find((item) => item.id === source.id)?.hash !== source.hash);
    if (resolvedArchiveSources.length !== archiveSources.length) staleSources.push(...proposal.sources.filter((source) => source.kind === "archive-message"));
    if (staleSources.length > 0) throw new Error("Memory candidate sources are stale.");
    let memoryId = "";
    let createProjectGrant = input.createProjectGrant;
    let decisionResult: TianyiOwnerOperationResult;
    if (existingDecision) {
      const decision = parseDecision(existingDecision.content);
      if (decision.decision !== "accepted" || !decision.memoryId) throw new Error("Memory candidate already has a different decision.");
      memoryId = decision.memoryId;
      if (decision.finalValue) finalValue = decision.finalValue;
      createProjectGrant = decision.createProjectGrant === true;
      decisionResult = completed("archive-decision", session.contentHash);
    } else {
      const memoryContext = finalValue.scope === "author-global" ? { rootPath: dependencies.rootPath, agentId, scope: "author-global" as const } : projectContext;
      memoryId = await allocateMemoryId(memoryContext);
      const current = await requireOpenSession(projectContext, input.sessionId);
      const appended = await append(projectContext, current, makeEvent({ sessionId: input.sessionId, sequence: current.value.length + 1, type: "memory-candidate-decided", actor: "author", content: json({ candidateId: input.candidateId, decision: "accepted", memoryId, finalValue, createProjectGrant: input.createProjectGrant }), memoryCandidateIds: [input.candidateId], operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
      decisionResult = appended.result;
      if (!appended.session) return { candidate: proposal, finalValue, memoryId, ownerResults: [decisionResult], durableMemoryCount: 0 };
    }
    const memoryContext = finalValue.scope === "author-global" ? { rootPath: dependencies.rootPath, agentId, scope: "author-global" as const } : projectContext;
    const existingMemory = await readMemory(memoryContext, memoryId);
    let memoryResult: TianyiOwnerOperationResult;
    if (existingMemory) {
      memoryResult = completed("memory", existingMemory.contentHash);
    } else {
      const memory: MemoryItem = { world_os: MEMORY_VERSION, id: memoryId, type: "tianyi-memory", agent_id: agentId, scope: finalValue.scope, project_id: finalValue.scope === "author-global" ? "none" : input.projectId, kind: finalValue.kind, sensitivity: finalValue.sensitivity, approval_state: "author-approved", model_involvement: "deterministic-fixture", created_revision: 1, last_confirmed_revision: 1, review_after: "none", expires_after: "none", state: "active", source_refs: proposal.sources.map((source) => source.id), knowledge_subject_refs: [], body: requireStatement(finalValue.statement) };
      memoryResult = writeResult("memory", await createMemory(memoryContext, memory, { source: "create", recordedAt: requireTimestamp(now()), operationId: input.operationId }), null);
    }
    const ownerResults = [decisionResult, memoryResult];
    if (finalValue.scope === "author-global" && createProjectGrant) {
      const savedMemory = await readMemory(memoryContext, memoryId);
      const existingGrant = await readGlobalMemoryGrant(projectContext, memoryId);
      if (existingGrant) ownerResults.push(completed("global-memory-grant", existingGrant.contentHash));
      else if (savedMemory) ownerResults.push(writeResult("global-memory-grant", await createGlobalMemoryGrant(projectContext, { version: GLOBAL_MEMORY_GRANT_VERSION, id: deterministicId("grant", memoryId, input.projectId), agentId, memoryId, memoryContentHash: savedMemory.contentHash, projectId: input.projectId, state: "active", approvedRevision: 1 }, { source: "create", recordedAt: requireTimestamp(now()), operationId: input.operationId }), null));
    }
    return { candidate: proposal, finalValue, memoryId, ownerResults, durableMemoryCount: (await readMemory(memoryContext, memoryId)) ? 1 : 0 };
  }

  async function reviewTianyiMemoryCandidate(input: { projectId: string; sessionId: string; candidateId: string; contextRequest: TianyiContextRequest }) {
    const projectContext = context(input.projectId);
    const session = await readSession(projectContext, requireId(input.sessionId, "Session identifier"));
    if (!session) throw new Error("Tianyi session does not exist.");
    const event = session.value.find((item) => item.type === "memory-candidate-proposed" && item.memoryCandidateIds.includes(input.candidateId));
    if (!event) throw new Error("Memory candidate does not exist.");
    const candidate = parseMemoryProposal(event.content);
    const projection = await dependencies.buildProjection(input.projectId, input.contextRequest);
    const sources = [];
    for (const source of candidate.sources) {
      if (source.kind === "archive-message" && source.sessionId) {
        const [resolved] = await resolveArchiveMessages(input.projectId, [{ sessionId: source.sessionId, eventId: source.id, contentHash: source.hash }]);
        sources.push({ ...source, state: resolved?.state === "current" ? "current" as const : resolved?.state === "deleted" ? "deleted" as const : resolved?.state === "missing" ? "missing" as const : "stale" as const });
      } else {
        sources.push({ ...source, state: projection.sources.find((item) => item.id === source.id)?.hash === source.hash ? "current" as const : "stale" as const });
      }
    }
    return { ...candidate, sources, currentState: sources.every((source) => source.state === "current") ? "current" as const : "stale" as const };
  }

  async function decideTianyiStoppingPointCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; decision: "accepted" | "rejected"; contextRequest: TianyiContextRequest }) {
    const projectContext = context(input.projectId);
    const session = await readSession(projectContext, input.sessionId);
    if (!session) throw new Error("Tianyi session does not exist.");
    const proposalEvent = session.value.find((event) => event.type === "stopping-point-proposed" && parseStoppingProposal(event.content).candidateId === input.candidateId);
    if (!proposalEvent) throw new Error("Stopping point candidate does not exist.");
    const proposal = parseStoppingProposal(proposalEvent.content);
    const existingDecision = session.value.find((event) => event.type === "stopping-point-decided" && event.content.includes(input.candidateId));
    if (existingDecision) return { candidate: proposal, ownerResults: [completed("archive-decision", session.contentHash)], stoppingPointId: parseDecision(existingDecision.content).stoppingPointId ?? null };
    const current = await requireOpenSession(projectContext, input.sessionId);
    if (input.decision === "rejected") {
      const appended = await append(projectContext, current, makeEvent({ sessionId: input.sessionId, sequence: current.value.length + 1, type: "stopping-point-decided", actor: "author", content: json({ candidateId: input.candidateId, decision: "rejected" }), operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
      return { candidate: proposal, ownerResults: [appended.result], stoppingPointId: null };
    }
    const projection = await dependencies.buildProjection(input.projectId, input.contextRequest);
    if (projection.sources.find((source) => source.id === proposal.sourceId)?.hash !== proposal.sourceHash) throw new Error("Stopping point source is stale.");
    const stoppingPointId = await allocateStoppingPointId(projectContext);
    const appended = await append(projectContext, current, makeEvent({ sessionId: input.sessionId, sequence: current.value.length + 1, type: "stopping-point-decided", actor: "author", content: json({ candidateId: input.candidateId, decision: "accepted", stoppingPointId }), operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
    const ownerResults = [appended.result];
    if (appended.session) ownerResults.push(writeResult("stopping-point", await createStoppingPoint(projectContext, { world_os: STOPPING_POINT_VERSION, id: stoppingPointId, agent_id: agentId, project_id: input.projectId, source_id: proposal.sourceId, source_hash: proposal.sourceHash, state: "active", created_revision: 1, body: requireStatement(proposal.statement) }, { source: "create", recordedAt: requireTimestamp(now()), operationId: input.operationId }), null));
    return { candidate: proposal, ownerResults, stoppingPointId };
  }

  async function finalizeTianyiSessionClose(input: { projectId: string; sessionId: string; operationId: string }) {
    const temporary = temporarySessions.get(input.sessionId);
    if (temporary) {
      if (temporary.projectId !== input.projectId) throw new Error("Temporary Session project does not match.");
      temporarySessions.delete(input.sessionId);
      return { closed: true, temporary: true, ownerResult: completed("temporary-session-close", null), archiveWriteCount: 0 };
    }
    const projectContext = context(input.projectId);
    const existingSession = await readSession(projectContext, requireId(input.sessionId, "Session identifier"));
    if (!existingSession) throw new Error("Tianyi session does not exist.");
    if (existingSession.value.some((event) => event.type === "session-closed")) return { closed: true, ownerResult: completed("archive-session-close", existingSession.contentHash) };
    let session = await requireOpenSession(projectContext, input.sessionId);
    const proposals = session.value.filter((event) => event.type === "memory-candidate-proposed" || event.type === "stopping-point-proposed");
    const decisions = session.value.filter((event) => event.type === "memory-candidate-decided" || event.type === "stopping-point-decided");
    for (const proposal of proposals) {
      const candidateId = proposal.type === "memory-candidate-proposed" ? parseMemoryProposal(proposal.content).candidateId : parseStoppingProposal(proposal.content).candidateId;
      if (!decisions.some((event) => event.content.includes(candidateId))) throw new Error("Every session-close candidate requires an author decision.");
    }
    const appended = await append(projectContext, session, makeEvent({ sessionId: input.sessionId, sequence: session.value.length + 1, type: "session-closed", actor: "system", content: "Session closed by the author.", operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
    return { closed: Boolean(appended.session), ownerResult: appended.result };
  }

  async function readTianyiSessionMetadata(input: { projectId: string; sessionId?: string }) {
    if (input.sessionId && temporarySessions.has(input.sessionId)) {
      const temporary = temporarySessions.get(input.sessionId) as NonNullable<ReturnType<typeof temporarySessions.get>>;
      if (temporary.projectId !== input.projectId) throw new Error("Temporary Session project does not match.");
      return sessionDto(temporary.events, null, "temporary");
    }
    const projectContext = context(input.projectId);
    if (input.sessionId) {
      const session = await readSession(projectContext, requireId(input.sessionId, "Session identifier"));
      if (!session) return null;
      return sessionDto(session.value, session.contentHash, "normal");
    }
    const result = [];
    for (const item of await listSessionMetadata(projectContext)) {
      const session = await readSession(projectContext, item.id);
      if (session) result.push(sessionDto(session.value, session.contentHash, "normal"));
    }
    return result;
  }

  async function retainTemporarySessionMessages(input: { projectId: string; sessionId: string; eventIds: string[]; operationId: string }) {
    const temporary = temporarySessions.get(requireId(input.sessionId, "Temporary Session identifier"));
    if (!temporary || temporary.projectId !== input.projectId) throw new Error("Temporary Session is unavailable.");
    if (!Array.isArray(input.eventIds) || input.eventIds.length < 1 || input.eventIds.length > 8) throw new Error("Temporary message selection is invalid.");
    const selectedIds = new Set(input.eventIds.map((id) => requireId(id, "Temporary event identifier")));
    if (selectedIds.size !== input.eventIds.length) throw new Error("Temporary message selection is duplicated.");
    const selected = temporary.events.filter((event) => selectedIds.has(event.eventId) && visibleArchiveEventContent(event));
    if (selected.length !== selectedIds.size) throw new Error("Temporary message selection contains an unavailable event.");
    const operationId = requireId(input.operationId, "Operation identifier");
    const opened = await openTianyiSession({ projectId: input.projectId, operationId: deterministicId("operation.retain-open", operationId), retentionMode: "normal" });
    let current = await requireOpenSession(context(input.projectId), opened.sessionId);
    let archiveWriteCount = opened.archiveWriteCount;
    for (const source of selected.sort((left, right) => left.sequence - right.sequence)) {
      const visibleContent = visibleArchiveEventContent(source);
      if (!visibleContent || (source.actor !== "author" && source.actor !== "tianyi")) continue;
      if (current.value.some((event) => event.type === "retained-message" && event.operationId === operationId && parseRetainedMessageSourceId(event.content) === source.eventId)) continue;
      const appended = await append(context(input.projectId), current, makeEvent({
        sessionId: opened.sessionId,
        sequence: current.value.length + 1,
        type: "retained-message",
        actor: source.actor,
        content: json({ version: "tianyi-retained-message/v1", sourceTemporarySessionId: temporary.id, sourceTemporaryEventId: source.eventId, visibleContent }),
        operationId,
        recordedAt: requireTimestamp(now())
      }));
      if (!appended.session) throw new Error("Temporary message retention was only partially saved.");
      current = appended.session;
      archiveWriteCount += 1;
    }
    return { session: sessionDto(current.value, current.contentHash, "normal"), retainedEventIds: selected.map((event) => event.eventId), archiveWriteCount, alreadyCompleted: archiveWriteCount === 0 };
  }

  async function recordTianyiSourceReturn(input: { projectId: string; sessionId: string; targetSessionId: string; targetEventId: string; targetContentHash: string; operationId: string }) {
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    const temporary = temporarySessions.get(sessionId);
    if (temporary?.events.some((item) => item.type === "source-returned" && item.operationId === operationId)) return { retentionMode: "temporary" as const, archiveWriteCount: 0, recorded: true, alreadyCompleted: true };
    const projectContext = context(input.projectId);
    const persisted = temporary ? null : await readSession(projectContext, sessionId);
    const existing = persisted?.value.find((item) => item.type === "source-returned" && item.operationId === operationId);
    if (existing) return { retentionMode: "normal" as const, archiveWriteCount: 0, recorded: true, alreadyCompleted: true, contentHash: persisted?.contentHash ?? null };
    const [target] = await requireCurrentArchiveMessages(input.projectId, [{ sessionId: input.targetSessionId, eventId: input.targetEventId, contentHash: input.targetContentHash }]);
    const event = (sequence: number) => makeEvent({
      sessionId,
      sequence,
      type: "source-returned",
      actor: "author",
      content: json({ version: "tianyi-source-return/v1", targetSessionId: target.sessionId, targetEventId: target.eventId, targetContentHash: target.contentHash }),
      operationId,
      recordedAt: requireTimestamp(now())
    });
    if (temporary) {
      if (temporary.projectId !== input.projectId) throw new Error("Temporary Session project does not match.");
      temporary.events.push(event(temporary.events.length + 1));
      return { retentionMode: "temporary" as const, archiveWriteCount: 0, recorded: true, alreadyCompleted: false };
    }
    if (!persisted) throw new Error("Tianyi session does not exist.");
    if (persisted.value.some((item) => item.type === "session-closed")) throw new Error("Tianyi session is closed.");
    const appended = await append(projectContext, persisted, event(persisted.value.length + 1));
    if (!appended.session) throw new Error("Archive source-return action conflicted.");
    return { retentionMode: "normal" as const, archiveWriteCount: 1, recorded: true, alreadyCompleted: false, contentHash: appended.session.contentHash };
  }

  async function recordTianyiNuwaResult(input: { projectId: string; sessionId: string; resultReceiptId: string; candidateRouteCount: number; operationId: string }) {
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    const resultReceiptId = requireId(input.resultReceiptId, "Nuwa Result Receipt identifier");
    if (!Number.isInteger(input.candidateRouteCount) || input.candidateRouteCount < 0 || input.candidateRouteCount > 5) throw new Error("Nuwa candidate route count is invalid.");
    const temporary = temporarySessions.get(sessionId);
    if (temporary) {
      if (temporary.projectId !== input.projectId) throw new Error("Temporary Session project does not match.");
      return { retentionMode: "temporary" as const, archiveWriteCount: 0, recorded: false, alreadyCompleted: false };
    }
    const projectContext = context(input.projectId);
    const persisted = await readSession(projectContext, sessionId);
    const existing = persisted?.value.find((item) => item.type === "nuwa-result-returned" && item.operationId === operationId);
    if (existing) return { retentionMode: "normal" as const, archiveWriteCount: 0, recorded: true, alreadyCompleted: true, contentHash: persisted?.contentHash ?? null };
    if (!persisted) throw new Error("Tianyi session does not exist.");
    if (persisted.value.some((item) => item.type === "session-closed")) throw new Error("Tianyi session is closed.");
    const appended = await append(projectContext, persisted, makeEvent({
      sessionId,
      sequence: persisted.value.length + 1,
      type: "nuwa-result-returned",
      actor: "tianyi",
      content: json({
        version: "tianyi-nuwa-result-completion/v1",
        resultReceiptId,
        candidateRouteCount: input.candidateRouteCount,
        visibleResponse: `女娲已返回 ${input.candidateRouteCount} 条候选路线。请在推演工作区查看 Result Receipt；不会自动选择路线或进入影响评审。`
      }),
      responseClassifications: ["candidate-suggestion"],
      operationId,
      recordedAt: requireTimestamp(now())
    }));
    if (!appended.session) throw new Error("Tianyi Nuwa result completion conflicted.");
    return { retentionMode: "normal" as const, archiveWriteCount: 1, recorded: true, alreadyCompleted: false, contentHash: appended.session.contentHash };
  }

  async function rolloverTianyiSession(input: { projectId: string; sessionId: string; operationId: string }) {
    if (temporarySessions.has(input.sessionId)) throw new Error("Temporary Sessions cannot roll over; retain selected messages into a new normal Session instead.");
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    let current = await readSession(projectContext, sessionId);
    if (!current) throw new Error("Tianyi session does not exist.");
    const existingForward = current.value.find((event) => event.type === "session-rolled-over" && event.operationId === operationId && parseRolloverLink(event.content).direction === "forward");
    if (!existingForward) {
      if (current.value.some((event) => event.type === "session-closed")) throw new Error("Tianyi session is closed.");
      const dto = sessionDto(current.value, current.contentHash, "normal");
      const pending = dto.memoryCandidates.filter((candidate) => !dto.decidedCandidateIds.includes(candidate.candidateId));
      if (pending.length > 0) throw new Error("Decide every Memory candidate before Session rollover.");
    }
    const opened = await openTianyiSession({ projectId: input.projectId, operationId: deterministicId("operation.rollover-open", operationId), retentionMode: "normal" });
    if (existingForward && parseRolloverLink(existingForward.content).sessionId !== opened.sessionId) throw new Error("Session rollover operation points to a different Session.");
    let archiveWriteCount = opened.archiveWriteCount;
    if (!existingForward) {
      const forward = await append(projectContext, current, makeEvent({ sessionId, sequence: current.value.length + 1, type: "session-rolled-over", actor: "system", content: json({ version: "tianyi-session-rollover/v1", direction: "forward", sessionId: opened.sessionId }), operationId, recordedAt: requireTimestamp(now()) }));
      if (!forward.session) throw new Error("Session rollover forward link conflicted.");
      current = forward.session;
      archiveWriteCount += 1;
    }
    if (!current.value.some((event) => event.type === "session-closed" && event.operationId === operationId)) {
      const closed = await append(projectContext, current, makeEvent({ sessionId, sequence: current.value.length + 1, type: "session-closed", actor: "system", content: "Session closed by explicit rollover.", operationId, recordedAt: requireTimestamp(now()) }));
      if (!closed.session) throw new Error("Session rollover close conflicted.");
      current = closed.session;
      archiveWriteCount += 1;
    }
    let next = await requireOpenSession(projectContext, opened.sessionId);
    if (!next.value.some((event) => event.type === "session-rolled-over" && event.operationId === operationId && parseRolloverLink(event.content).direction === "backward")) {
      const backward = await append(projectContext, next, makeEvent({ sessionId: opened.sessionId, sequence: next.value.length + 1, type: "session-rolled-over", actor: "system", content: json({ version: "tianyi-session-rollover/v1", direction: "backward", sessionId }), operationId, recordedAt: requireTimestamp(now()) }));
      if (!backward.session) throw new Error("Session rollover backward link conflicted.");
      next = backward.session;
      archiveWriteCount += 1;
    }
    return { previousSessionId: sessionId, session: sessionDto(next.value, next.contentHash, "normal"), archiveWriteCount, alreadyCompleted: archiveWriteCount === 0 };
  }

  async function runTemporaryQuestion(temporary: TemporarySession, input: { projectId: string; sessionId: string; operationId: string; request: TianyiRuntimeInput["request"]; contextRequest: TianyiContextRequest; archiveMessageRefs?: Array<{ sessionId: string; eventId: string; contentHash: string }> }) {
    if (temporary.projectId !== input.projectId) throw new Error("Temporary Session project does not match.");
    if ("boundedAction" in input.request && input.request.boundedAction === "fixture.memory-candidate") throw new Error("Temporary Sessions do not propose Memory candidates.");
    const prior = temporary.events.find((event) => (event.type === "author-message" || event.type === "bounded-action") && event.operationId === input.operationId);
    if (prior) {
      const response = temporary.events.find((event) => event.type === "tianyi-response" && event.operationId === input.operationId);
      const question = temporary.questions.get(input.operationId) ?? null;
      return { status: question?.status ?? "partial", ownerResults: [completed("temporary-session", null)], receiptId: response?.receiptId ?? deterministicId("temporary-receipt", input.operationId), question, retentionMode: "temporary" as const, archiveWriteCount: 0, receiptWriteCount: 0 };
    }
    const archiveMessages = await requireCurrentArchiveMessages(input.projectId, input.archiveMessageRefs ?? []);
    const receiptId = deterministicId("temporary-receipt", temporary.id, input.operationId);
    const authorEvent = makeEvent({ sessionId: temporary.id, sequence: temporary.events.length + 1, type: "authorQuery" in input.request ? "author-message" : "bounded-action", actor: "author", content: json({ version: "tianyi-question-operation/v1", request: input.request, receiptId, contextRequest: input.contextRequest, archiveMessageRefs: input.archiveMessageRefs ?? [] }), operationId: input.operationId, recordedAt: requireTimestamp(now()) });
    temporary.events.push(authorEvent);
    const question = await runTianyiDeterministicQuestion({
      agentId,
      sessionId: temporary.id,
      receiptId,
      generationTimestamp: requireTimestamp(now()),
      request: input.request,
      buildProjection: () => dependencies.buildProjection(input.projectId, input.contextRequest),
      readSourceMaterial: (projection) => dependencies.readSourceMaterial(input.projectId, projection),
      archiveMessages,
      recheckArchiveMessages: () => requireCurrentArchiveMessages(input.projectId, input.archiveMessageRefs ?? []),
      localControlToken: dependencies.localControlToken,
      outputBudget: { maxVisibleChars: 2_000, maxMemoryCandidates: 0 }
    });
    temporary.questions.set(input.operationId, question);
    temporary.events.push(makeEvent({ sessionId: temporary.id, sequence: temporary.events.length + 1, type: "tianyi-response", actor: "tianyi", content: json({ version: "tianyi-response-operation/v1", visibleResponse: question.visibleResponse, status: question.status, failure: question.failure, memoryProposals: [] }), responseClassifications: question.classifications, receiptId, operationId: input.operationId, recordedAt: requireTimestamp(now()) }));
    return { status: question.status, ownerResults: [completed("temporary-session", null)], receiptId, question, retentionMode: "temporary" as const, archiveWriteCount: 0, receiptWriteCount: 0 };
  }

  /**
   * Creative capture deliberately lives beside the existing Session and
   * Archive operations. It never has a client-side persistence fallback. The
   * author source event is the first durable result; a Provider request, when
   * explicitly requested and configured, happens only after that append.
   */
  async function appendCreativeState(projectContext: ContinuityContext, session: NonNullable<Awaited<ReturnType<typeof readSession>>>, state: Exclude<CreativeLifecycleState, "idle" | "archived">, operationId: string, details: Record<string, unknown> = {}) {
    const stateOperationId = deterministicId("operation.creative-state", operationId, state);
    const existing = session.value.find((event) => event.type === "creative-session-state" && event.operationId === stateOperationId);
    if (existing) return { session, result: completed("archive-creative-session-state", session.contentHash), alreadyCompleted: true };
    const appended = await append(projectContext, session, makeEvent({
      sessionId: session.value[0]?.sessionId ?? (() => { throw new Error("Creative session has no opening event."); })(),
      sequence: session.value.length + 1,
      type: "creative-session-state",
      actor: "system",
      content: json({ version: "tianyi-creative-session-state/v1", state, ...details }),
      operationId: stateOperationId,
      recordedAt: requireTimestamp(now())
    }));
    if (!appended.session) throw new Error("Creative lifecycle state conflicted; reload before retrying.");
    return { session: appended.session, result: appended.result, alreadyCompleted: false };
  }

  async function captureTianyiCreativeAuthorSource(input: {
    projectId: string;
    sessionId: string;
    operationId: string;
    submissionId: string;
    text: string;
    collaborate: boolean;
  }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    const submissionId = requireId(input.submissionId, "Creative submission identifier");
    const text = requireCreativeText(input.text);
    let session = await requireOpenSession(projectContext, sessionId);
    const existing = session.value.find((event) => event.type === "author-message" && event.operationId === operationId && isCreativeAuthorSource(event));
    if (existing) {
      const source = parseCreativeAuthorSource(existing.content);
      if (source.submissionId !== submissionId || source.text !== text || source.collaborate !== input.collaborate) throw new Error("Creative submission identifier was reused with different source.");
      return { source: creativeSourceRef(existing), alreadyCompleted: true, ownerResult: completed("archive-author-source", session.contentHash) };
    }
    const event = makeEvent({
      sessionId,
      sequence: session.value.length + 1,
      type: "author-message",
      actor: "author",
      content: json({ version: "tianyi-creative-author-source/v1", submissionId, text, collaborate: input.collaborate === true }),
      operationId,
      recordedAt: requireTimestamp(now())
    });
    const appended = await append(projectContext, session, event);
    if (!appended.session) {
      session = await requireOpenSession(projectContext, sessionId);
      const converged = session.value.find((item) => item.type === "author-message" && item.operationId === operationId && isCreativeAuthorSource(item));
      if (converged) return { source: creativeSourceRef(converged), alreadyCompleted: true, ownerResult: completed("archive-author-source", session.contentHash) };
      throw new Error("Creative author source append conflicted; reload before retrying.");
    }
    const state = await appendCreativeState(projectContext, appended.session, "capturing", operationId, { sourceEventId: event.eventId, sourceContentHash: archiveEventHash(event) });
    return { source: creativeSourceRef(event), alreadyCompleted: false, ownerResult: appended.result, stateOwnerResult: state.result };
  }

  function providerConfigured(): boolean {
    try {
      return Boolean(dependencies.modelGateway?.metadata().providers?.some((provider) => provider.id === "siliconflow" && provider.configured === true));
    } catch {
      return false;
    }
  }

  async function resolveCreativeEnvelope(source: { text: string; collaborate: boolean }, text: string, operationId: string) {
    if (!source.collaborate || !providerConfigured() || !dependencies.modelGateway) return normalizeCreativeFixture(defaultCreativeFixture(text));
    const profile = dependencies.modelGateway.metadata().profiles.find((candidate) => candidate.providerId === "siliconflow") || dependencies.modelGateway.metadata().profiles[0];
    if (!profile) throw new Error("当前 Provider 没有可用的天意模型档案。");
    const stream = await dependencies.modelGateway.openChatStream({
      profileId: profile.id,
      responseFormat: "json-object",
      messages: [
        { role: "system", content: "你是天意创意整理助手。只返回一个 JSON 对象，不要 Markdown、代码围栏或解释文字。输出字段必须严格为 reply、summary、themes、openQuestions、candidates。themes 和 openQuestions 必须是字符串数组；candidates 必须是数组，每项严格为 kind、title、summary、uncertainties，其中 uncertainties 必须始终是字符串数组（即使只有一项，也不能写成字符串）。kind 只能是 character、item、location、organization、rule、event、relation、plot-idea、inspiration、custom-agent、unknown。必须给每个候选至少一条 uncertainty。任何内容都只是候选，不得声称已经写入故事。示例结构：{\"reply\":\"...\",\"summary\":\"...\",\"themes\":[\"...\"],\"openQuestions\":[\"...\"],\"candidates\":[{\"kind\":\"character\",\"title\":\"...\",\"summary\":\"...\",\"uncertainties\":[\"仍待作者确认\"]}]}" },
        { role: "user", content: `请整理以下作者原话，保留不确定性并给出最多 8 个短主题、最多 8 个开放问题和最多 12 个候选。作者原话：\n${text}` }
      ],
      idempotencyKey: `tianyi-creative.${operationId}`,
      budgetScope: "tianyi-creative-source"
    });
    let raw = "";
    for await (const event of stream.events) {
      if (event.type === "chunk" && typeof event.text === "string") raw += event.text;
      if (event.type === "done" && typeof event.text === "string") raw += event.text;
      if (raw.length > 24_000) throw new Error("Provider creative response exceeded the safe size limit.");
    }
    if (!raw.trim()) throw new Error("Provider creative response was empty.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("Provider creative response was not valid JSON."); }
    return normalizeCreativeFixture(parsed);
  }

  async function extractTianyiCreativeProjection(input: {
    projectId: string;
    sessionId: string;
    operationId: string;
    source: { eventId: string; contentHash: string };
    fixture?: unknown;
  }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    let session = await requireOpenSession(projectContext, sessionId);
    const sourceEvent = session.value.find((event) => event.eventId === input.source.eventId && event.type === "author-message" && isCreativeAuthorSource(event));
    if (!sourceEvent || creativeSourceRef(sourceEvent).contentHash !== requireCreativeHash(input.source.contentHash)) throw new Error("Creative source is stale, unavailable, or belongs to a different Session.");
    const completedState = session.value.find((event) => event.type === "creative-session-state" && event.operationId === deterministicId("operation.creative-state", operationId, "review-ready"));
    if (completedState) return { projection: projectCreativeSession(session.value, session.contentHash), alreadyCompleted: true, ownerResults: [completed("archive-creative-projection", session.contentHash)] };
    const source = parseCreativeAuthorSource(sourceEvent.content);
    const respondingState = await appendCreativeState(projectContext, session, "responding", operationId, { sourceEventId: sourceEvent.eventId, sourceContentHash: archiveEventHash(sourceEvent) });
    session = respondingState.session;
    const envelope = input.fixture !== undefined
      ? normalizeCreativeFixture(input.fixture)
      : await resolveCreativeEnvelope(source, source.text, operationId);
    const responseRuntime = input.fixture === undefined && source.collaborate && providerConfigured() ? "provider" : "fixture";
    const sourceRef = creativeSourceRef(sourceEvent);
    const existingResponse = session.value.find((event) => event.type === "creative-response" && event.operationId === operationId);
    let appended = existingResponse ? { session, result: completed("archive-creative-response", session.contentHash) } : await append(projectContext, session, makeEvent({
      sessionId,
      sequence: session.value.length + 1,
      type: "creative-response",
      actor: "tianyi",
      content: json({ version: "tianyi-creative-response/v1", text: envelope.reply, runtime: responseRuntime, sourceRefs: [sourceRef] }),
      responseClassifications: ["candidate-suggestion"],
      operationId,
      recordedAt: requireTimestamp(now())
    }));
    if (!appended.session) throw new Error("Creative response append conflicted; original source remains safe.");
    session = appended.session;
    const extractingState = await appendCreativeState(projectContext, session, "extracting", operationId, { sourceEventId: sourceEvent.eventId, sourceContentHash: archiveEventHash(sourceEvent) });
    session = extractingState.session;
    const summary = makeEvent({
      sessionId,
      sequence: session.value.length + 1,
      type: "creative-summary-revised",
      actor: "tianyi",
      content: json({ version: "tianyi-creative-summary/v1", summaryId: deterministicId("creative-summary", operationId), summary: envelope.summary, themes: envelope.themes, openQuestions: envelope.openQuestions, sourceRefs: [sourceRef] }),
      responseClassifications: ["candidate-suggestion"],
      operationId,
      recordedAt: requireTimestamp(now())
    });
    const results = [appended.result, respondingState.result, extractingState.result];
    const existingSummary = session.value.find((event) => event.type === "creative-summary-revised" && event.operationId === operationId);
    appended = existingSummary ? { session, result: completed("archive-creative-projection", session.contentHash) } : await append(projectContext, session, summary);
    results.push(appended.result);
    if (!appended.session) throw new Error("Creative summary append conflicted; original source and response remain safe.");
    session = appended.session;
    for (const candidate of envelope.candidates) {
      const candidateId = deterministicId("creative-candidate", operationId, candidate.kind, candidate.title);
      if (session.value.some((event) => event.type === "creative-candidate-proposed" && parseCreativeCandidate(event.content).candidateId === candidateId)) continue;
      const event = makeEvent({
        sessionId,
        sequence: session.value.length + 1,
        type: "creative-candidate-proposed",
        actor: "tianyi",
        content: json({ version: "tianyi-creative-candidate/v1", candidateId, ...candidate, sourceExcerpt: source.text.slice(0, 480), sourceRefs: [sourceRef], targetOwnerKind: creativeTargetOwner(candidate.kind), duplicateHints: [], reviewStatus: "pending" }),
        responseClassifications: ["candidate-suggestion"],
        operationId,
        recordedAt: requireTimestamp(now())
      });
      appended = await append(projectContext, session, event);
      results.push(appended.result);
      if (!appended.session) throw new Error("Creative candidate append conflicted; completed projection remains recoverable.");
      session = appended.session;
    }
    const readyState = await appendCreativeState(projectContext, session, "review-ready", operationId, { sourceEventId: sourceEvent.eventId, sourceContentHash: archiveEventHash(sourceEvent) });
    results.push(readyState.result);
    return { projection: projectCreativeSession(readyState.session.value, readyState.session.contentHash), alreadyCompleted: false, ownerResults: results };
  }

  async function readTianyiCreativeProjection(input: { projectId: string; sessionId: string }) {
    const session = await readSession(context(input.projectId), requireId(input.sessionId, "Session identifier"));
    return session ? projectCreativeSession(session.value, session.contentHash) : null;
  }

  async function editTianyiCreativeCandidate(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; expectedRevision: number; title: string; summary: string; uncertainties: string[] }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const candidateId = requireId(input.candidateId, "Creative candidate identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new Error("Creative candidate revision is invalid.");
    const session = await requireOpenSession(projectContext, sessionId);
    const proposal = session.value.find((event) => event.type === "creative-candidate-proposed" && parseCreativeCandidate(event.content).candidateId === candidateId);
    if (!proposal) throw new Error("Creative candidate does not exist.");
    const candidate = parseCreativeCandidate(proposal.content);
    if (session.value.some((event) => event.type === "creative-candidate-decided" && parseCreativeDecision(event.content).candidateId === candidateId)) throw new Error("Creative candidate has already been decided and cannot be edited here.");
    const latestEdit = [...session.value].reverse().find((event) => event.type === "creative-candidate-edited" && parseCreativeCandidateEdit(event.content).candidateId === candidateId);
    const currentRevision = latestEdit ? parseCreativeCandidateEdit(latestEdit.content).revision : proposal.sequence;
    if (currentRevision !== input.expectedRevision) throw new Error("Creative candidate revision is stale; reload before editing.");
    const existing = session.value.find((event) => event.type === "creative-candidate-edited" && event.operationId === operationId);
    if (existing) return { projection: projectCreativeSession(session.value, session.contentHash), alreadyCompleted: true };
    const normalized = { candidateId, revision: currentRevision + 1, title: requireCreativeShortText(input.title, "Creative candidate title", 120), summary: requireCreativeShortText(input.summary, "Creative candidate summary", 800), uncertainties: requireCreativeTextArray(input.uncertainties, "Creative candidate uncertainties", 8, 240), sourceRefs: candidate.sourceRefs };
    const appended = await append(projectContext, session, makeEvent({ sessionId, sequence: session.value.length + 1, type: "creative-candidate-edited", actor: "author", content: json({ version: "tianyi-creative-candidate-edit/v1", ...normalized }), operationId, recordedAt: requireTimestamp(now()) }));
    if (!appended.session) throw new Error("Creative candidate edit conflicted; reload before retrying.");
    return { projection: projectCreativeSession(appended.session.value, appended.session.contentHash), alreadyCompleted: false };
  }

  async function decideTianyiCreativeCandidate(input: {
    projectId: string;
    sessionId: string;
    candidateId: string;
    operationId: string;
    decision: "rejected" | "deferred" | "handed-off";
    ownerReceipt?: { owner: string; id: string; revision: number | null };
  }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const candidateId = requireId(input.candidateId, "Creative candidate identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    let session = await requireOpenSession(projectContext, sessionId);
    const candidate = session.value.find((event) => event.type === "creative-candidate-proposed" && parseCreativeCandidate(event.content).candidateId === candidateId);
    if (!candidate) throw new Error("Creative candidate does not exist.");
    const parsedCandidate = parseCreativeCandidate(candidate.content);
    const latestSource = [...session.value].reverse().find((event) => event.type === "author-message" && isCreativeAuthorSource(event));
    if (input.decision === "handed-off" && (!latestSource || parsedCandidate.sourceRefs.every((ref) => ref.eventId !== latestSource.eventId || ref.contentHash !== archiveEventHash(latestSource)))) throw new Error("Creative candidate source is stale; re-extract from the latest author source before handoff.");
    const existing = session.value.find((event) => event.type === "creative-candidate-decided" && parseCreativeDecision(event.content).candidateId === candidateId);
    if (existing) return { projection: projectCreativeSession(session.value, session.contentHash), alreadyCompleted: true, ownerResult: completed("archive-creative-candidate-decision", session.contentHash) };
    if (input.decision === "handed-off" && !input.ownerReceipt) throw new Error("Creative owner handoff requires a persisted owner receipt.");
    const receipt = input.ownerReceipt ? { owner: requireCreativeOwner(input.ownerReceipt.owner), id: requireId(input.ownerReceipt.id, "Creative owner receipt identifier"), revision: input.ownerReceipt.revision === null ? null : requireRevision(input.ownerReceipt.revision) } : null;
    const appended = await append(projectContext, session, makeEvent({
      sessionId,
      sequence: session.value.length + 1,
      type: "creative-candidate-decided",
      actor: "author",
      content: json({ version: "tianyi-creative-candidate-decision/v1", candidateId, decision: input.decision, ownerReceipt: receipt }),
      operationId,
      recordedAt: requireTimestamp(now())
    }));
    if (!appended.session) throw new Error("Creative candidate decision conflicted; reload before retrying.");
    return { projection: projectCreativeSession(appended.session.value, appended.session.contentHash), alreadyCompleted: false, ownerResult: appended.result };
  }

  async function pauseTianyiCreativeSession(input: { projectId: string; sessionId: string; operationId: string }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    const session = await requireOpenSession(projectContext, sessionId);
    if (session.value.some((event) => event.type === "creative-session-paused" && event.operationId === operationId)) return { projection: projectCreativeSession(session.value, session.contentHash), alreadyCompleted: true };
    const currentProjection = projectCreativeSession(session.value, session.contentHash);
    const lastEvent = session.value.at(-1);
    const appended = await append(projectContext, session, makeEvent({ sessionId, sequence: session.value.length + 1, type: "creative-session-paused", actor: "author", content: json({ version: "tianyi-creative-pause/v1", lastSafePoint: lastEvent ? { eventId: lastEvent.eventId, sequence: lastEvent.sequence, contentHash: archiveEventHash(lastEvent) } : null, unresolvedCount: currentProjection.pendingCount, pendingCandidateRefs: currentProjection.candidates.filter((candidate) => candidate.state === "pending").map((candidate) => candidate.candidateId) }), operationId, recordedAt: requireTimestamp(now()) }));
    if (!appended.session) throw new Error("Creative pause conflicted; reload before retrying.");
    return { projection: projectCreativeSession(appended.session.value, appended.session.contentHash), alreadyCompleted: false };
  }

  async function markTianyiCreativeProviderUnavailable(input: { projectId: string; sessionId: string; operationId: string; stage: "response" | "extraction"; message?: string }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    if (input.stage !== "response" && input.stage !== "extraction") throw new Error("Creative provider-unavailable stage is invalid.");
    const session = await requireOpenSession(projectContext, sessionId);
    const existing = session.value.find((event) => event.type === "creative-provider-unavailable" && event.operationId === operationId);
    if (existing) return { projection: projectCreativeSession(session.value, session.contentHash), alreadyCompleted: true };
    const latestSource = [...session.value].reverse().find((event) => event.type === "author-message" && isCreativeAuthorSource(event));
    const appended = await append(projectContext, session, makeEvent({ sessionId, sequence: session.value.length + 1, type: "creative-provider-unavailable", actor: "system", content: json({ version: "tianyi-creative-provider-unavailable/v1", stage: input.stage, message: input.message?.trim() || "原话已保存，分析未运行。", retryable: true, sourceRef: latestSource ? creativeSourceRef(latestSource) : null }), operationId, recordedAt: requireTimestamp(now()) }));
    if (!appended.session) throw new Error("Creative provider-unavailable marker conflicted; original source remains safe.");
    return { projection: projectCreativeSession(appended.session.value, appended.session.contentHash), alreadyCompleted: false };
  }

  async function recoverTianyiCreativeSession(input: { projectId: string; sessionId: string; operationId: string }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    let session = await requireOpenSession(projectContext, sessionId);
    const existing = session.value.find((event) => event.type === "creative-session-recovered" && event.operationId === operationId);
    if (existing) return { projection: projectCreativeSession(session.value, session.contentHash), alreadyCompleted: true };
    const before = projectCreativeSession(session.value, session.contentHash);
    const recovering = await append(projectContext, session, makeEvent({ sessionId, sequence: session.value.length + 1, type: "creative-session-recovering", actor: "system", content: json({ version: "tianyi-creative-session-recovering/v1", lastSafePoint: session.value.at(-1) ? { eventId: session.value.at(-1)!.eventId, sequence: session.value.at(-1)!.sequence, contentHash: archiveEventHash(session.value.at(-1)!) } : null, unresolvedCount: before.pendingCount, pendingCandidateRefs: before.candidates.filter((candidate) => candidate.state === "pending").map((candidate) => candidate.candidateId) }), operationId, recordedAt: requireTimestamp(now()) }));
    if (!recovering.session) throw new Error("Creative recovery conflicted; reload before retrying.");
    session = recovering.session;
    const resumed = await append(projectContext, session, makeEvent({ sessionId, sequence: session.value.length + 1, type: "creative-session-recovered", actor: "system", content: json({ version: "tianyi-creative-session-recovered/v1", resumeState: before.lifecycle, unresolvedCount: before.pendingCount, pendingCandidateRefs: before.candidates.filter((candidate) => candidate.state === "pending").map((candidate) => candidate.candidateId) }), operationId: deterministicId("operation.creative-recovered", operationId), recordedAt: requireTimestamp(now()) }));
    if (!resumed.session) throw new Error("Creative recovery completion conflicted; reload before retrying.");
    return { projection: projectCreativeSession(resumed.session.value, resumed.session.contentHash), alreadyCompleted: false };
  }

  async function completeTianyiCreativeSession(input: { projectId: string; sessionId: string; operationId: string }) {
    const projectContext = context(input.projectId);
    const sessionId = requireId(input.sessionId, "Session identifier");
    const operationId = requireId(input.operationId, "Operation identifier");
    const existingSession = await readSession(projectContext, sessionId);
    if (!existingSession) throw new Error("Tianyi session does not exist.");
    if (existingSession.value.some((event) => event.type === "creative-session-completed" && event.operationId === operationId)) {
      return { projection: projectCreativeSession(existingSession.value, existingSession.contentHash), close: await finalizeTianyiSessionClose({ projectId: input.projectId, sessionId, operationId: deterministicId("operation.creative-close", operationId) }), alreadyCompleted: true };
    }
    let session = await requireOpenSession(projectContext, sessionId);
    const projection = projectCreativeSession(session.value, session.contentHash);
    if (projection.summaryState === "stale") throw new Error("Creative summary is stale; re-extract from the latest author source before close.");
    if (projection.candidates.some((candidate) => candidate.state === "pending")) throw new Error("Pending Creative candidates must be rejected, deferred, or handed off before close.");
    if (!session.value.some((event) => event.type === "creative-session-completed" && event.operationId === operationId)) {
      const appended = await append(projectContext, session, makeEvent({ sessionId, sequence: session.value.length + 1, type: "creative-session-completed", actor: "author", content: json({ version: "tianyi-creative-final-summary/v1", summary: projection.summary, themes: projection.themes, openQuestions: projection.openQuestions, candidateCount: projection.candidates.length }), operationId, recordedAt: requireTimestamp(now()) }));
      if (!appended.session) throw new Error("Creative completion conflicted; reload before retrying.");
      session = appended.session;
    }
    const close = await finalizeTianyiSessionClose({ projectId: input.projectId, sessionId, operationId: deterministicId("operation.creative-close", operationId) });
    return { projection: projectCreativeSession(session.value, session.contentHash), close };
  }

  async function resolveArchiveMessages(projectId: string, refs: Array<{ sessionId: string; eventId: string; contentHash: string }>) {
    if (refs.length === 0) return [];
    if (!dependencies.resolveArchiveMessages) throw new Error("Archive Recall is unavailable.");
    return dependencies.resolveArchiveMessages(projectId, refs);
  }

  async function requireCurrentArchiveMessages(projectId: string, refs: Array<{ sessionId: string; eventId: string; contentHash: string }>): Promise<TianyiRuntimeInput["archiveMessages"]> {
    const resolved = await resolveArchiveMessages(projectId, refs);
    if (resolved.some((item) => item.state !== "current" || item.sequence === null || item.actor === null || item.recordedAt === null || item.contentHash === null || item.excerpt === null)) throw new Error("Selected Archive message is stale, deleted, or unavailable.");
    return resolved.map((item) => ({ projectId: item.projectId, sessionId: item.sessionId, eventId: item.eventId, sequence: item.sequence as number, actor: item.actor as "author" | "tianyi", recordedAt: item.recordedAt as string, contentHash: item.contentHash as string, excerpt: item.excerpt as string }));
  }

  return { openTianyiSession, runTianyiQuestion, captureTianyiCreativeAuthorSource, extractTianyiCreativeProjection, readTianyiCreativeProjection, editTianyiCreativeCandidate, decideTianyiCreativeCandidate, pauseTianyiCreativeSession, markTianyiCreativeProviderUnavailable, recoverTianyiCreativeSession, completeTianyiCreativeSession, prepareTianyiSessionClose, reviewTianyiMemoryCandidate, decideTianyiMemoryCandidate, decideTianyiStoppingPointCandidate, finalizeTianyiSessionClose, readTianyiSessionMetadata, retainTemporarySessionMessages, recordTianyiSourceReturn, recordTianyiNuwaResult, rolloverTianyiSession };
}

async function requireOpenSession(context: ContinuityContext, sessionId: string) {
  const session = await readSession(context, requireId(sessionId, "Session identifier"));
  if (!session) throw new Error("Tianyi session does not exist.");
  if (session.value.some((event) => event.type === "session-closed")) throw new Error("Tianyi session is closed.");
  return session;
}

async function append(context: ContinuityContext, session: NonNullable<Awaited<ReturnType<typeof readSession>>>, event: InteractionEvent) {
  const result = await appendSessionEvent(context, event.sessionId, session.contentHash, event.sequence, event, { recordedAt: event.recordedAt, operationId: event.operationId });
  if (!result.ok) return { result: writeResult(`archive-${event.type}`, result, session.contentHash), session: null };
  return { result: writeResult(`archive-${event.type}`, result, session.contentHash), session: result.current };
}

function makeEvent(input: { sessionId: string; sequence: number; type: InteractionEvent["type"]; actor: InteractionEvent["actor"]; content: string; operationId: string; recordedAt: string; responseClassifications?: InteractionEvent["responseClassifications"]; memoryCandidateIds?: string[]; receiptId?: string | null }): InteractionEvent {
  return { version: INTERACTION_EVENT_VERSION, eventId: deterministicId("event", input.operationId, input.type, String(input.sequence)), sessionId: input.sessionId, sequence: input.sequence, type: input.type, recordedAt: input.recordedAt, actor: input.actor, content: input.content, responseClassifications: input.responseClassifications ?? [], memoryCandidateIds: input.memoryCandidateIds ?? [], receiptId: input.receiptId ?? null, operationId: input.operationId };
}

function writeResult(owner: string, result: { ok: boolean; conflict: boolean; current?: { contentHash: string } | null }, expectedHash: string | null): TianyiOwnerOperationResult {
  return { owner, attempted: true, saved: result.ok, conflicted: result.conflict, rejected: false, alreadyCompleted: false, currentHash: result.current?.contentHash ?? null, expectedHash, recoveryAction: result.conflict ? "reload-owner-and-retry" : null };
}

function completed(owner: string, currentHash: string | null): TianyiOwnerOperationResult {
  return { owner, attempted: false, saved: true, conflicted: false, rejected: false, alreadyCompleted: true, currentHash, expectedHash: null, recoveryAction: null };
}

function sessionDto(events: InteractionEvent[], contentHash: string | null, retentionMode: "normal" | "temporary") {
  const memoryCandidates = events.filter((event) => event.type === "memory-candidate-proposed").map((event) => parseMemoryProposal(event.content));
  const stoppingPointCandidates = events.filter((event) => event.type === "stopping-point-proposed").map((event) => parseStoppingProposal(event.content));
  const decidedCandidateIds = events.filter((event) => event.type === "memory-candidate-decided" || event.type === "stopping-point-decided").flatMap((event) => {
    try { const value = JSON.parse(event.content) as { candidateId?: unknown }; return typeof value.candidateId === "string" ? [value.candidateId] : []; } catch { return []; }
  });
  const visibleMessages = events.flatMap((event) => {
    const visibleContent = visibleArchiveEventContent(event);
    return visibleContent && (event.actor === "author" || event.actor === "tianyi") ? [{ eventId: event.eventId, sequence: event.sequence, actor: event.actor, recordedAt: event.recordedAt, visibleContent, receiptId: event.receiptId }] : [];
  });
  const groundedAttempts = retentionMode === "normal" ? groundedAttemptMetadata(events) : [];
  return { id: events[0]?.sessionId ?? null, contentHash, eventCount: events.length, openedAt: events[0]?.recordedAt ?? null, closed: events.some((event) => event.type === "session-closed"), retentionMode, recoverable: retentionMode === "normal", packEligible: retentionMode === "normal", candidateCount: memoryCandidates.length + stoppingPointCandidates.length, memoryCandidates, stoppingPointCandidates, decidedCandidateIds, visibleMessages, groundedAttempts };
}

function groundedAttemptMetadata(events: InteractionEvent[]) {
  const attempts = [];
  for (const event of events) {
    if (event.type !== "author-message") continue;
    let value: {
      version?: unknown;
      request?: { authorQuery?: unknown };
      profileId?: unknown;
      submissionId?: unknown;
      questionAttemptKey?: unknown;
      responseMessageId?: unknown;
    };
    try {
      value = JSON.parse(event.content) as typeof value;
    } catch {
      // Other author-message schemas are unrelated to grounded recovery.
      continue;
    }
    if (
      value.version !== "tianyi-grounded-question-operation/v3"
      || typeof value.request?.authorQuery !== "string"
      || typeof value.profileId !== "string"
      || typeof value.submissionId !== "string"
      || typeof value.questionAttemptKey !== "string"
      || typeof value.responseMessageId !== "string"
    ) continue;
    let state: "PREPARED" | "PROVIDER_UNCERTAIN" | "RESULT_STAGED" | "RECEIPT_COMMITTED_UNACKNOWLEDGED" | "COMPLETED" = "PREPARED";
    for (const marker of events) {
      if (marker.type !== "grounded-attempt") continue;
      const record = JSON.parse(marker.content) as {
        version?: unknown;
        questionAttemptKey?: unknown;
        state?: typeof state;
      };
      if (
        record.version !== "tianyi-grounded-attempt-state/v1"
        || typeof record.questionAttemptKey !== "string"
        || !["PREPARED", "PROVIDER_UNCERTAIN", "RESULT_STAGED", "RECEIPT_COMMITTED_UNACKNOWLEDGED", "COMPLETED"].includes(String(record.state))
      ) {
        throw new Error("Grounded attempt state is invalid.");
      }
      if (record.questionAttemptKey === value.questionAttemptKey) state = record.state as typeof state;
    }
    if (events.some((candidate) => candidate.type === "tianyi-response" && candidate.eventId === value.responseMessageId)) state = "COMPLETED";
    attempts.push({
      submissionId: value.submissionId,
      questionAttemptKey: value.questionAttemptKey,
      question: value.request.authorQuery,
      profileId: value.profileId,
      state,
      retryRequired: state === "PREPARED" || state === "PROVIDER_UNCERTAIN"
    });
  }
  return attempts;
}

function findDuplicateProposal(events: InteractionEvent[], proposal: MemoryProposal): MemoryProposal | null {
  const key = proposalKey(proposal);
  for (const event of events) {
    if (event.type !== "memory-candidate-proposed") continue;
    const existing = parseMemoryProposal(event.content);
    const rejected = events.some((decision) => decision.type === "memory-candidate-decided" && decision.memoryCandidateIds.includes(existing.candidateId) && parseDecision(decision.content).decision === "rejected");
    if (!rejected && proposalKey(existing) === key) return existing;
  }
  return null;
}

function proposalKey(proposal: MemoryProposal): string {
  return `${proposal.statement.normalize("NFKC").toLocaleLowerCase("und").replace(/\s+/gu, " ").trim()}\u0000${proposal.sources.map((source) => `${source.kind}:${source.sessionId ?? "none"}:${source.id}:${source.hash}`).sort().join("|")}`;
}

function parseQuestionContent(value: string): QuestionArchiveContent { return parseVersioned(value, "tianyi-question-operation/v1") as QuestionArchiveContent; }
function parseResponseContent(value: string): ResponseArchiveContent { return parseVersioned(value, "tianyi-response-operation/v1") as ResponseArchiveContent; }
function parseMemoryProposal(value: string): MemoryProposal { return parseVersioned(value, "tianyi-memory-candidate/v1") as MemoryProposal; }
function parseStoppingProposal(value: string): StoppingProposal { return parseVersioned(value, "tianyi-stopping-point-candidate/v1") as StoppingProposal; }
function parseRetainedMessageSourceId(value: string): string | null {
  try {
    const parsed = parseVersioned(value, "tianyi-retained-message/v1");
    return typeof parsed.sourceTemporaryEventId === "string" ? parsed.sourceTemporaryEventId : null;
  } catch { return null; }
}
function parseRolloverLink(value: string): { direction: "forward" | "backward"; sessionId: string } {
  const parsed = parseVersioned(value, "tianyi-session-rollover/v1");
  if ((parsed.direction !== "forward" && parsed.direction !== "backward") || typeof parsed.sessionId !== "string") throw new Error("Tianyi Session rollover link is invalid.");
  return { direction: parsed.direction, sessionId: requireId(parsed.sessionId, "Rollover Session identifier") };
}
function parseDecision(value: string): { decision: string; memoryId?: string; stoppingPointId?: string; finalValue?: { statement: string; scope: "author-global" | "project"; kind: MemoryItem["kind"]; sensitivity: MemoryItem["sensitivity"] }; createProjectGrant?: boolean } { return JSON.parse(value) as { decision: string; memoryId?: string; stoppingPointId?: string; finalValue?: { statement: string; scope: "author-global" | "project"; kind: MemoryItem["kind"]; sensitivity: MemoryItem["sensitivity"] }; createProjectGrant?: boolean }; }

type CreativeSourceRef = { sessionId: string; eventId: string; contentHash: string };
type CreativeCandidateKind = "character" | "item" | "location" | "organization" | "rule" | "event" | "relation" | "plot-idea" | "inspiration" | "custom-agent" | "unknown";
type CreativeCandidateFixture = { kind: CreativeCandidateKind; title: string; summary: string; uncertainties: string[] };
type CreativeLifecycleState = "idle" | "capturing" | "responding" | "extracting" | "review-ready" | "paused" | "recovering" | "provider-unavailable" | "completed" | "archived";

function isCreativeAuthorSource(event: InteractionEvent): boolean {
  try { return parseCreativeAuthorSource(event.content).version === "tianyi-creative-author-source/v1"; } catch { return false; }
}
function parseCreativeAuthorSource(value: string): { version: "tianyi-creative-author-source/v1"; submissionId: string; text: string; collaborate: boolean } {
  const parsed = parseVersioned(value, "tianyi-creative-author-source/v1");
  return { version: "tianyi-creative-author-source/v1", submissionId: requireId(parsed.submissionId, "Creative submission identifier"), text: requireCreativeText(parsed.text), collaborate: parsed.collaborate === true };
}
function creativeSourceRef(event: InteractionEvent): CreativeSourceRef { return { sessionId: event.sessionId, eventId: event.eventId, contentHash: archiveEventHash(event) }; }
function parseCreativeCandidate(value: string): { candidateId: string; kind: CreativeCandidateKind; title: string; summary: string; uncertainties: string[]; sourceExcerpt: string; targetOwnerKind: string; duplicateHints: string[]; reviewStatus: "pending" | "rejected" | "deferred" | "handed-off"; sourceRefs: CreativeSourceRef[] } {
  const parsed = parseVersioned(value, "tianyi-creative-candidate/v1");
  return {
    candidateId: requireId(parsed.candidateId, "Creative candidate identifier"),
    kind: requireCreativeKind(parsed.kind),
    title: requireCreativeShortText(parsed.title, "Creative candidate title", 120),
    summary: requireCreativeShortText(parsed.summary, "Creative candidate summary", 800),
    uncertainties: requireCreativeTextArray(parsed.uncertainties, "Creative candidate uncertainties", 8, 240),
    sourceExcerpt: requireCreativeExcerpt(parsed.sourceExcerpt),
    targetOwnerKind: requireCreativeOwnerKind(parsed.targetOwnerKind),
    duplicateHints: requireCreativeTextArray(parsed.duplicateHints, "Creative candidate duplicate hints", 16, 240),
    reviewStatus: requireCreativeReviewStatus(parsed.reviewStatus),
    sourceRefs: parseCreativeSourceRefs(parsed.sourceRefs)
  };
}
function parseCreativeDecision(value: string): { candidateId: string; decision: "rejected" | "deferred" | "handed-off"; ownerReceipt: { owner: string; id: string; revision: number | null } | null } {
  const parsed = parseVersioned(value, "tianyi-creative-candidate-decision/v1");
  const receipt = parsed.ownerReceipt;
  if (receipt !== null && (!receipt || typeof receipt !== "object" || Array.isArray(receipt))) throw new Error("Creative owner receipt is invalid.");
  const record = receipt as Record<string, unknown> | null;
  const decision = parsed.decision;
  if (decision !== "rejected" && decision !== "deferred" && decision !== "handed-off") throw new Error("Creative candidate decision is invalid.");
  return { candidateId: requireId(parsed.candidateId, "Creative candidate identifier"), decision, ownerReceipt: record ? { owner: requireCreativeOwner(record.owner), id: requireId(record.id, "Creative owner receipt identifier"), revision: record.revision === null ? null : requireRevision(record.revision) } : null };
}
function parseCreativeCandidateEdit(value: string): { candidateId: string; revision: number; title: string; summary: string; uncertainties: string[]; sourceRefs: CreativeSourceRef[] } {
  const parsed = parseVersioned(value, "tianyi-creative-candidate-edit/v1");
  return { candidateId: requireId(parsed.candidateId, "Creative candidate identifier"), revision: requireRevision(parsed.revision), title: requireCreativeShortText(parsed.title, "Creative candidate title", 120), summary: requireCreativeShortText(parsed.summary, "Creative candidate summary", 800), uncertainties: requireCreativeTextArray(parsed.uncertainties, "Creative candidate uncertainties", 8, 240), sourceRefs: parseCreativeSourceRefs(parsed.sourceRefs) };
}
function projectCreativeSession(events: InteractionEvent[], contentHash: string) {
  const originals = events.filter((event) => event.type === "author-message" && isCreativeAuthorSource(event)).map((event) => ({ ...creativeSourceRef(event), text: parseCreativeAuthorSource(event.content).text, recordedAt: event.recordedAt }));
  const responses = events.filter((event) => event.type === "creative-response").flatMap((event) => {
    try { const parsed = parseVersioned(event.content, "tianyi-creative-response/v1"); return typeof parsed.text === "string" ? [{ eventId: event.eventId, text: parsed.text, runtime: parsed.runtime === "provider" ? "provider" as const : "fixture" as const, recordedAt: event.recordedAt }] : []; } catch { return []; }
  });
  const summaryEvent = [...events].reverse().find((event) => event.type === "creative-summary-revised");
  let summary: string | null = null;
  let themes: string[] = [];
  let openQuestions: string[] = [];
  let summarySourceRefs: CreativeSourceRef[] = [];
  if (summaryEvent) {
    const parsed = parseVersioned(summaryEvent.content, "tianyi-creative-summary/v1");
    summary = requireCreativeShortText(parsed.summary, "Creative summary", 1_600);
    themes = requireCreativeTextArray(parsed.themes, "Creative themes", 8, 120);
    openQuestions = requireCreativeTextArray(parsed.openQuestions, "Creative open questions", 8, 240);
    summarySourceRefs = parseCreativeSourceRefs(parsed.sourceRefs);
  }
  const decisions = new Map<string, ReturnType<typeof parseCreativeDecision>>();
  for (const event of events) if (event.type === "creative-candidate-decided") decisions.set(parseCreativeDecision(event.content).candidateId, parseCreativeDecision(event.content));
  const edits = new Map<string, ReturnType<typeof parseCreativeCandidateEdit>>();
  for (const event of events) if (event.type === "creative-candidate-edited") edits.set(parseCreativeCandidateEdit(event.content).candidateId, parseCreativeCandidateEdit(event.content));
  const candidates = events.filter((event) => event.type === "creative-candidate-proposed").map((event) => {
    const candidate = parseCreativeCandidate(event.content);
    const edit = edits.get(candidate.candidateId);
    const decision = decisions.get(candidate.candidateId);
    return { ...candidate, ...(edit ? { title: edit.title, summary: edit.summary, uncertainties: edit.uncertainties, revision: edit.revision } : { revision: event.sequence }), state: decision?.decision ?? "pending", reviewStatus: decision?.decision ?? "pending", ownerReceipt: decision?.ownerReceipt ?? null };
  });
  const lastOriginal = originals.at(-1);
  const stale = Boolean(summaryEvent && lastOriginal && lastOriginal.eventId !== summarySourceRefs.at(-1)?.eventId && events.find((event) => event.eventId === lastOriginal.eventId)!.sequence > summaryEvent.sequence);
  const completed = events.some((event) => event.type === "creative-session-completed");
  const archived = events.some((event) => event.type === "session-closed");
  const latestPause = [...events].reverse().find((event) => event.type === "creative-session-paused");
  const latestRecovery = [...events].reverse().find((event) => event.type === "creative-session-recovering");
  const latestRecovered = [...events].reverse().find((event) => event.type === "creative-session-recovered");
  const latestProviderUnavailable = [...events].reverse().find((event) => event.type === "creative-provider-unavailable");
  const latestState = [...events].reverse().find((event) => event.type === "creative-session-state");
  const lastOriginalEvent = [...events].reverse().find((event) => event.type === "author-message" && isCreativeAuthorSource(event));
  const state = latestState ? parseCreativeState(latestState.content).state : null;
  const recoveryPending = Boolean(latestRecovery && (!latestRecovered || latestRecovery.sequence > latestRecovered.sequence));
  const pausePending = Boolean(latestPause && (!latestState || latestPause.sequence > latestState.sequence) && (!latestProviderUnavailable || latestPause.sequence > latestProviderUnavailable.sequence) && (!latestRecovered || latestPause.sequence > latestRecovered.sequence) && !completed);
  const providerPending = Boolean(latestProviderUnavailable && (!latestState || latestProviderUnavailable.sequence > latestState.sequence) && (!latestPause || latestProviderUnavailable.sequence > latestPause.sequence) && (!latestRecovered || latestProviderUnavailable.sequence > latestRecovered.sequence));
  const lifecycle: CreativeLifecycleState = completed ? "completed" : archived ? "archived" : recoveryPending ? "recovering" : pausePending ? "paused" : providerPending ? "provider-unavailable" : state ?? (lastOriginalEvent ? "capturing" : "idle");
  const safeEvent = latestPause ?? latestProviderUnavailable ?? latestRecovery ?? latestState ?? lastOriginalEvent ?? null;
  const safePoint = safeEvent ? { eventId: safeEvent.eventId, sequence: safeEvent.sequence, contentHash: archiveEventHash(safeEvent) } : null;
  const pendingCandidateRefs = candidates.filter((candidate) => candidate.state === "pending").map((candidate) => candidate.candidateId);
  return { version: "tianyi-creative-session-projection/v1" as const, sessionId: events[0]?.sessionId ?? null, sessionContentHash: contentHash, lifecycle, archived, originals, responses, summary, themes, openQuestions, summarySourceRefs, summaryState: summary ? stale ? "stale" as const : "current" as const : "missing" as const, candidates, pendingCount: pendingCandidateRefs.length, pendingCandidateRefs, unresolvedCount: pendingCandidateRefs.length, lastSafePoint: safePoint, providerUnavailable: lifecycle === "provider-unavailable" ? { stage: latestProviderUnavailable ? parseCreativeProviderUnavailable(latestProviderUnavailable.content).stage : "response" as const, message: latestProviderUnavailable ? parseCreativeProviderUnavailable(latestProviderUnavailable.content).message : "原话已保存，分析未运行。", retryable: true } : null };
}
function parseCreativeState(value: string): { state: Exclude<CreativeLifecycleState, "idle" | "archived"> } {
  const parsed = parseVersioned(value, "tianyi-creative-session-state/v1");
  const state = parsed.state;
  if (typeof state !== "string") throw new Error("Creative lifecycle state is invalid.");
  const allowed: Array<Exclude<CreativeLifecycleState, "idle" | "archived">> = ["capturing", "responding", "extracting", "review-ready", "paused", "recovering", "provider-unavailable", "completed"];
  if (!allowed.includes(state as Exclude<CreativeLifecycleState, "idle" | "archived">)) throw new Error("Creative lifecycle state is invalid.");
  return { state: state as Exclude<CreativeLifecycleState, "idle" | "archived"> };
}
function parseCreativeProviderUnavailable(value: string): { stage: "response" | "extraction"; message: string; retryable: boolean } {
  const parsed = parseVersioned(value, "tianyi-creative-provider-unavailable/v1");
  if (parsed.stage !== "response" && parsed.stage !== "extraction") throw new Error("Creative provider-unavailable stage is invalid.");
  if (typeof parsed.message !== "string" || !parsed.message.trim()) throw new Error("Creative provider-unavailable message is invalid.");
  return { stage: parsed.stage, message: parsed.message, retryable: parsed.retryable === true };
}
function defaultCreativeFixture(text: string) {
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 160);
  return { reply: "我已经保留了你的原话。我们可以先从人物动机、冲突与场景三个方向继续展开。", summary: `当前想法：${excerpt}`, themes: ["尚待展开的故事核心"], openQuestions: ["主角最不愿失去的是什么？"], candidates: [{ kind: "unknown", title: "待作者确认的灵感", summary: excerpt, uncertainties: ["尚未映射到唯一资料 Owner。"] }] };
}
function normalizeCreativeFixture(value: unknown): { reply: string; summary: string; themes: string[]; openQuestions: string[]; candidates: CreativeCandidateFixture[] } {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Creative fixture output is invalid.");
  const input = value as Record<string, unknown>;
  const expected = ["reply", "summary", "themes", "openQuestions", "candidates"];
  if (Object.keys(input).some((key) => !expected.includes(key)) || expected.some((key) => !Object.hasOwn(input, key))) throw new Error("Creative fixture output fields are invalid.");
  if (!Array.isArray(input.candidates) || input.candidates.length > 12) throw new Error("Creative fixture candidates are invalid.");
  return {
    reply: requireCreativeShortText(input.reply, "Creative reply", 1_600),
    summary: requireCreativeShortText(input.summary, "Creative summary", 1_600),
    themes: requireCreativeTextArray(input.themes, "Creative themes", 8, 120),
    openQuestions: requireCreativeTextArray(input.openQuestions, "Creative open questions", 8, 240),
    candidates: input.candidates.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.getPrototypeOf(item) !== Object.prototype) throw new Error("Creative fixture candidate is invalid.");
      const candidate = item as Record<string, unknown>;
      const expectedCandidate = ["kind", "title", "summary", "uncertainties"];
      if (Object.keys(candidate).some((key) => !expectedCandidate.includes(key)) || expectedCandidate.some((key) => !Object.hasOwn(candidate, key))) throw new Error("Creative fixture candidate fields are invalid.");
      return { kind: requireCreativeKind(candidate.kind), title: requireCreativeShortText(candidate.title, "Creative candidate title", 120), summary: requireCreativeShortText(candidate.summary, "Creative candidate summary", 800), uncertainties: requireCreativeTextArray(candidate.uncertainties, "Creative candidate uncertainties", 8, 240) };
    })
  };
}
function parseCreativeSourceRefs(value: unknown): CreativeSourceRef[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) throw new Error("Creative source references are invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Creative source reference is invalid.");
    const ref = item as Record<string, unknown>;
    return { sessionId: requireId(ref.sessionId, "Creative source Session identifier"), eventId: requireId(ref.eventId, "Creative source event identifier"), contentHash: requireCreativeHash(ref.contentHash) };
  });
}
function requireCreativeText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Creative author source is invalid.");
  const text = value.normalize("NFC");
  if (!text.trim() || [...text].length > 6_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new Error("Creative author source is invalid.");
  return text;
}
function requireCreativeHash(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("Creative source hash is invalid."); return value; }
function requireCreativeExcerpt(value: unknown): string { if (typeof value !== "string" || !value.trim() || [...value].length > 480 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) throw new Error("Creative candidate source excerpt is invalid."); return value.normalize("NFC"); }
function requireCreativeShortText(value: unknown, label: string, maximum: number): string { if (typeof value !== "string") throw new Error(`${label} is invalid.`); const text = value.normalize("NFC").trim(); if (!text || [...text].length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new Error(`${label} is invalid.`); return text; }
function requireCreativeTextArray(value: unknown, label: string, maximumItems: number, maximumText: number): string[] { if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} are invalid.`); const result = value.map((item) => requireCreativeShortText(item, label, maximumText)); if (new Set(result).size !== result.length) throw new Error(`${label} are duplicated.`); return result; }
function requireCreativeKind(value: unknown): CreativeCandidateKind { const kinds: CreativeCandidateKind[] = ["character", "item", "location", "organization", "rule", "event", "relation", "plot-idea", "inspiration", "custom-agent", "unknown"]; if (!kinds.includes(value as CreativeCandidateKind)) throw new Error("Creative candidate kind is invalid."); return value as CreativeCandidateKind; }
function creativeTargetOwner(kind: CreativeCandidateKind): string { if (["character", "item", "location", "rule", "custom-agent", "organization"].includes(kind)) return "agent-recognition-proposal"; if (kind === "event" || kind === "plot-idea") return "candidate-review"; if (kind === "relation") return "relation-owner"; return "candidate-only"; }
function requireCreativeOwnerKind(value: unknown): string { const kinds = ["agent-recognition-proposal", "candidate-review", "relation-owner", "candidate-only"]; if (!kinds.includes(String(value))) throw new Error("Creative candidate target owner is invalid."); return String(value); }
function requireCreativeReviewStatus(value: unknown): "pending" | "rejected" | "deferred" | "handed-off" { if (!["pending", "rejected", "deferred", "handed-off"].includes(String(value))) throw new Error("Creative candidate review status is invalid."); return value as "pending" | "rejected" | "deferred" | "handed-off"; }
function requireCreativeOwner(value: unknown): string { return ["agent-recognition-proposal", "candidate-review", "source-import", "relation-owner"].includes(String(value)) ? String(value) : (() => { throw new Error("Creative owner receipt owner is invalid."); })(); }
function requireRevision(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error("Creative owner receipt revision is invalid."); return value as number; }

function parseVersioned(value: string, version: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype || (parsed as { version?: unknown }).version !== version) throw new Error("Tianyi Archive proposal is invalid.");
  return parsed as Record<string, unknown>;
}

function json(value: unknown): string { return JSON.stringify(value); }
function deterministicId(prefix: string, ...parts: string[]): string { return `${prefix}.${sha256(parts.join("\u0000")).slice(0, 24)}`; }
function requireId(value: unknown, label: string): string { if (typeof value !== "string" || value.length > 96 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)) throw new Error(`${label} is invalid.`); return value; }
function requireProjectId(value: unknown): string { if (typeof value !== "string" || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) throw new Error("Project identifier is invalid."); return value; }
function requireTimestamp(value: string): string { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) throw new Error("Operation timestamp is invalid."); return value; }
function requireStatement(value: unknown): string { if (typeof value !== "string") throw new Error("Candidate statement is invalid."); const text = value.normalize("NFC").trim(); if (!text || [...text].length > 2_000 || /\n\s*\n|^#{1,6}\s|^```/mu.test(text) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new Error("Candidate statement is invalid."); return text; }
function requireScope(value: unknown): "author-global" | "project" { if (value !== "author-global" && value !== "project") throw new Error("Memory scope is invalid."); return value; }
function requireMemoryKind(value: unknown): MemoryItem["kind"] { if (!["working-preference", "shared-decision", "unresolved-thread", "author-provided-fact", "continuity-note"].includes(String(value))) throw new Error("Memory kind is invalid."); return value as MemoryItem["kind"]; }
function requireSensitivity(value: unknown): MemoryItem["sensitivity"] { if (!["ordinary", "personal", "sensitive", "restricted"].includes(String(value))) throw new Error("Memory sensitivity is invalid."); return value as MemoryItem["sensitivity"]; }
