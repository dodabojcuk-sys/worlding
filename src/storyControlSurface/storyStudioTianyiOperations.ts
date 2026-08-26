import { createStoryStudioWorkspaceOperations, type StoryStudioWorldObject, type StoryStudioWritingDocument, type StoryStudioVisualDocument } from "./storyStudioWorkspaceOperations.ts";
import {
  assertStoryStudioEventReferenceEligibility,
  normalizeStoryStudioEventReference,
  storyStudioEventReferenceKey,
  type StoryStudioEventReference
} from "../storyContracts/storyStudioEventReference.ts";
import {
  TIANYI_FIXTURE_ADAPTER_VERSION,
  buildTianyiContextProjection,
  createTianyiMemoryOperations,
  createTianyiResumeOperations,
  createTianyiSessionOperations,
  defaultTianyiPersona,
  defaultTianyiRelationshipPolicy,
  deriveReceiptCurrentStatus,
  exportContinuityPack,
  ensureTianyiIdentityReady,
  listMemories,
  listGlobalMemoryGrants,
  listOwnerTombstoneIds,
  listReceiptMetadata,
  listSessionMetadata,
  listStoppingPoints,
  listStoppingPointRevisions,
  readMemory,
  readMemoryTombstone,
  readPersona,
  readReceipt,
  readRelationshipPolicy,
  readSession,
  readSessionRange,
  readSessionTombstone,
  readStoppingPointTombstone,
  restoreStoppingPointRevision,
  revokeStoppingPoint,
  hardDeleteStoppingPoint,
  hardDeleteSession,
  hardDeleteSessionMessage,
  stageContinuityPack,
  resolveTianyiMemoryProjection,
  createTianyiGroundedAnswerOperations,
  appendSessionEvent,
  sha256,
  stableJson,
  archiveEventHash,
  rebuildArchiveRecallIndex,
  removeArchiveRecallIndex,
  resolveArchiveRecallMessages,
  searchArchiveRecall,
  visibleArchiveEventContent,
  type TianyiContextProjection,
  type TianyiContextRequest,
  type InteractionEvent,
  type TianyiProjectionSource,
  type TianyiRawSourceMaterial
  , type TianyiGroundedModelGateway
  , type TianyiObjectContextRef
  , type TianyiGroundedContextRequest
  , type TianyiGroundedReasonCode
  , type TianyiGroundedResolvedCandidate
  , compileTianyiGroundedContext
  , normalizeTianyiGroundedContextRequest
  , tianyiObjectContextRefKey
  , normalizeTianyiObjectContextRefs
} from "../storyContinuity/index.ts";

export function createStoryStudioTianyiOperations(options: {
  rootPath: string;
  stateFilePath: string;
  agentId?: string;
  now?: () => string;
  localControlToken?: string;
  modelGateway?: TianyiGroundedModelGateway;
  /** Injected Canon-read verifier; this adapter never becomes a Canon owner. */
  verifyCanonEventRead?(input: { projectId: string; eventId: string }): boolean;
}) {
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: options.rootPath, stateFilePath: options.stateFilePath });
  const agentId = options.agentId ?? "agent.tianyi";
  const now = options.now ?? (() => new Date().toISOString());

  async function buildProjection(projectId: string, rawRequest: TianyiContextRequest): Promise<TianyiContextProjection> {
    projectId = requireProjectId(projectId);
    const request = normalizeContextRequest(rawRequest, projectId);
    await ensureIdentity(projectId);
    const persona = await readPersona({ rootPath: options.rootPath, agentId, scope: "author-global" });
    const policy = await readRelationshipPolicy({ rootPath: options.rootPath, agentId, scope: "author-global" });
    if (!persona || !policy || persona.value.status !== "active") throw new Error("Tianyi Persona or Relationship Policy is unavailable.");
    const memoryProjection = await resolveTianyiMemoryProjection({ rootPath: options.rootPath, projectId, agentId, selections: request.memorySelections });
    const eventReferences = new Map((request.eventRefs ?? []).map((reference) => [reference.eventId, reference]));
    const refs = dedupeRefs([
      ...(request.activeOwner.id && request.activeOwner.kind !== "project" ? [{ id: request.activeOwner.id, kind: request.activeOwner.kind, origin: "active-owner" }] : []),
      ...request.sourceRefs
    ]);
    const sources: TianyiProjectionSource[] = [];
    for (const ref of refs) {
      const source = await resolveProjectionSource(projectId, ref, eventReferences);
      if (source) sources.push(source);
    }
    for (const reference of eventReferences.values()) {
      const origin = request.activeOwner.kind === "world-object" && request.activeOwner.id === reference.eventId
        ? "active-owner"
        : "shared-selection";
      sources.push(resolveEventProjectionSource(projectId, reference, origin));
    }
    sources.push(...memoryProjection.sources);
    return buildTianyiContextProjection({
      projectId,
      productMode: request.productMode,
      activeSurface: {
        ownerKind: request.activeOwner.kind,
        ownerId: request.activeOwner.id === null
          ? null
          : projectionOwnerId(projectId, request.activeOwner.kind, request.activeOwner.id, eventReferences)
      },
      selection: {
        documentId: request.selection.documentId === null ? null : sourceAlias("visual-document", request.selection.documentId),
        objectId: request.selection.objectId === null
          ? null
          : projectionWorldObjectId(projectId, request.selection.objectId, eventReferences),
        timelinePointId: request.selection.timelinePointId === null ? null : sourceAlias("selection", request.selection.timelinePointId)
      },
      sources,
      approvedMemoryRefs: memoryProjection.approvedMemoryRefs,
      persona: { revision: persona.value.persona_revision, contentHash: persona.contentHash },
      relationshipPolicy: { revision: policy.value.policyRevision, contentHash: policy.contentHash },
      enabledSkillRefs: request.enabledSkillRefs,
      runtime: { adapterId: "tianyi.fixture", adapterVersion: TIANYI_FIXTURE_ADAPTER_VERSION },
      lockedRuleIds: sources.filter((source) => source.ownerKind === "locked-rule").map((source) => source.id),
      unresolvedThreadIds: sources.filter((source) => source.ownerKind === "unresolved-thread").map((source) => source.id),
      reviewEvidenceIds: sources.filter((source) => source.ownerKind === "review-evidence").map((source) => source.id)
    });
  }

  async function readSourceMaterial(projectId: string, projection: TianyiContextProjection): Promise<TianyiRawSourceMaterial[]> {
    const result: TianyiRawSourceMaterial[] = [];
    for (const source of projection.sources) {
      if (source.state !== "current" || source.exclusionReason) continue;
      if (source.ownerKind === "memory") {
        const approved = projection.approvedMemoryRefs.find((memory) => memory.id === source.id);
        if (!approved) continue;
        const context = approved.scope === "author-global" ? { rootPath: options.rootPath, agentId, scope: "author-global" as const } : { rootPath: options.rootPath, agentId, scope: "project" as const, projectId };
        const memory = await readMemory(context, source.id);
        if (memory) result.push({ id: source.id, kind: "memory", hash: memory.contentHash, content: memory.value.body, classification: memory.value.sensitivity === "ordinary" ? "ordinary" : memory.value.sensitivity === "restricted" ? "restricted" : "personal-sensitive" });
        continue;
      }
      const material = await resolveStoryMaterial(projectId, source);
      if (material) result.push(material);
    }
    return result;
  }

  async function readSourceTarget(projectId: string, sourceId: string) {
    const writingBootstrap = workspace.getWritingBootstrap({ projectId });
    const writingSummary = writingBootstrap.chapters.flatMap((chapter) => [chapter, ...chapter.scenes]).find((item) => sourceAlias("writing-document", item.id) === sourceId);
    if (writingSummary) {
      const writing = workspace.readWritingDocument({ projectId, documentId: writingSummary.id });
      return { id: sourceId, hash: writing.revisionToken, label: writing.title, target: { kind: "writing-document" as const, id: writing.id } };
    }
    const event = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects.find((item) => item.type === "event" && eventProjectionSourceId(projectId, item.id, item.revisionToken) === sourceId);
    if (event) {
      const current = workspace.readWorldObject({ projectId, objectId: event.id });
      return { id: sourceId, hash: current.revisionToken, label: current.title, target: { kind: "world-object" as const, id: current.id } };
    }
    const object = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects.find((item) => ["world-object", "selection", "writing-guard"].some((kind) => sourceAlias(kind, item.id) === sourceId));
    if (object) { const current = workspace.readWorldObject({ projectId, objectId: object.id }); return { id: sourceId, hash: current.revisionToken, label: current.title, target: { kind: "world-object" as const, id: current.id } }; }
    const visual = workspace.listVisualDocuments({ projectId }).find((item) => sourceAlias("visual-document", item.id) === sourceId);
    return visual ? { id: sourceId, hash: visual.contentHash, label: visual.title, target: { kind: "visual-document" as const, id: visual.id } } : null;
  }

  const sessions = createTianyiSessionOperations({
    rootPath: options.rootPath,
    agentId,
    now: options.now,
    buildProjection,
    readSourceMaterial,
    resolveArchiveMessages: (projectId, refs) => resolveArchiveRecallMessages(projectContext(projectId), refs),
    localControlToken: options.localControlToken,
    modelGateway: options.modelGateway
  });
  const memories = createTianyiMemoryOperations({ rootPath: options.rootPath, agentId, now: options.now });
  const resume = createTianyiResumeOperations({ rootPath: options.rootPath, agentId, readSource: readSourceTarget });
  const grounded = options.modelGateway ? createTianyiGroundedAnswerOperations({
    rootPath: options.rootPath,
    agentId,
    now: options.now,
    gateway: options.modelGateway,
    compileGroundedContext
  }) : null;

  async function getTianyiIdentity(input: { projectId: string }) {
    requireProjectId(input.projectId);
    const context = { rootPath: options.rootPath, agentId, scope: "author-global" as const };
    const [persona, policy, globalMemories, projectGrants] = await Promise.all([
      readPersona(context),
      readRelationshipPolicy(context),
      listMemories(context),
      listGlobalMemoryGrants({ rootPath: options.rootPath, agentId, scope: "project", projectId: input.projectId })
    ]);
    const personaValue = persona?.value ?? defaultTianyiPersona(agentId);
    const policyValue = policy?.value ?? defaultTianyiRelationshipPolicy(agentId);
    return {
      agentId,
      displayName: personaValue.display_name,
      personaRevision: personaValue.persona_revision,
      relationshipPolicyRevision: policyValue.policyRevision,
      workingStyle: personaValue.working_style,
      refusalBoundaries: personaValue.refusal_boundaries,
      exitControls: policyValue.exitControls,
      aiIdentityDisclosure: true,
      runtime: { mode: "deterministic" as const, adapterId: "tianyi.fixture" as const, adapterVersion: TIANYI_FIXTURE_ADAPTER_VERSION },
      networkTransfer: "none" as const,
      modelCalls: 0,
      persisted: Boolean(persona && policy),
      globalMemoryCount: globalMemories.filter((item) => item.value.state === "active").length,
      activeProjectGrantCount: projectGrants.filter((item) => item.value.state === "active").length
    };
  }

  async function listTianyiReceipts(input: { projectId: string }) {
    const context = projectContext(input.projectId);
    const result = [];
    for (const item of await listReceiptMetadata(context)) {
      const receipt = await readReceipt(context, item.id);
      if (receipt) result.push({ id: receipt.value.id, sessionId: receipt.value.sessionId, generatedAt: receipt.value.generationTimestamp, sourceCount: receipt.value.sources.length, archiveMessageCount: "archiveMessageRefs" in receipt.value ? receipt.value.archiveMessageRefs.length : 0, approvedMemoryCount: receipt.value.approvedMemoryIds.length, classifications: receipt.value.responseClassifications, historicalStale: receipt.value.stale });
    }
    return result.sort((left, right) => right.id.localeCompare(left.id));
  }

  async function listTianyiStoppingPoints(input: { projectId: string }) {
    const projectId = requireProjectId(input.projectId);
    const result = [];
    for (const item of await listStoppingPoints(projectContext(projectId))) {
      const source = await readSourceTarget(projectId, item.value.source_id);
      result.push({
        id: item.value.id,
        statement: item.value.body,
        state: item.value.state,
        sourceId: item.value.source_id,
        sourceLabel: source?.label ?? "Unavailable source",
        sourceStatus: source === null ? "missing" as const : source.hash === item.value.source_hash ? "current" as const : "stale" as const,
        sourceTarget: source?.target ?? null,
        sourceHash: item.value.source_hash,
        contentHash: item.contentHash,
        revision: item.value.created_revision
      });
    }
    return result;
  }

  async function revokeTianyiStoppingPoint(input: { projectId: string; stoppingPointId: string; expectedHash: string; operationId: string }) {
    const write = await revokeStoppingPoint(projectContext(input.projectId), requireId(input.stoppingPointId), requireHash(input.expectedHash), { recordedAt: now(), operationId: requireId(input.operationId) });
    return ownerWriteResult("stopping-point", write, input.expectedHash);
  }

  async function restoreTianyiStoppingPoint(input: { projectId: string; stoppingPointId: string; expectedHash: string; revisionId: string; operationId: string }) {
    const write = await restoreStoppingPointRevision(projectContext(input.projectId), requireId(input.stoppingPointId), requireHash(input.expectedHash), requireId(input.revisionId), { recordedAt: now(), operationId: requireId(input.operationId) });
    return ownerWriteResult("stopping-point", write, input.expectedHash);
  }

  async function hardDeleteTianyiStoppingPoint(input: { projectId: string; stoppingPointId: string; expectedHash: string; operationId: string }) {
    const write = await hardDeleteStoppingPoint(projectContext(input.projectId), requireId(input.stoppingPointId), { expectedContentHash: requireHash(input.expectedHash), deletedAt: now(), operationId: requireId(input.operationId) });
    return { owner: "stopping-point", attempted: true, saved: write.ok, conflicted: write.conflict, rejected: false, alreadyCompleted: false, currentHash: null, expectedHash: input.expectedHash, recoveryAction: write.conflict ? "reload-owner-and-retry" : null, tombstone: write.ok ? write.tombstone : null };
  }

  async function listTianyiStoppingPointRevisions(input: { projectId: string; stoppingPointId: string }) {
    return listStoppingPointRevisions(projectContext(input.projectId), requireId(input.stoppingPointId));
  }

  async function listTianyiTombstones(input: { projectId: string }) {
    const contexts = [
      { rootPath: options.rootPath, agentId, scope: "project" as const, projectId: requireProjectId(input.projectId) },
      { rootPath: options.rootPath, agentId, scope: "author-global" as const }
    ];
    const result = [];
    for (const context of contexts) {
      for (const id of await listOwnerTombstoneIds(context, "memory")) {
        const tombstone = await readMemoryTombstone(context, id);
        if (tombstone) result.push({ ...tombstone, ownerKind: "memory" as const });
      }
    }
    const project = projectContext(input.projectId);
    for (const id of await listOwnerTombstoneIds(project, "stopping-point")) {
      const tombstone = await readStoppingPointTombstone(project, id);
      if (tombstone) result.push({ ...tombstone, ownerKind: "stopping-point" as const });
    }
    for (const id of await listOwnerTombstoneIds(project, "session")) {
      const tombstone = await readSessionTombstone(project, id);
      if (tombstone) result.push({ ...tombstone, ownerKind: "session" as const });
    }
    return result.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));
  }

  async function readTianyiSessionEvents(input: { projectId: string; sessionId: string; startSequence: number; limit: number }) {
    const archive = await readSessionRange(projectContext(input.projectId), requireId(input.sessionId), input.startSequence, input.limit);
    if (!archive) return null;
    return {
      id: input.sessionId,
      contentHash: archive.contentHash,
      events: archive.value.map((event) => ({ eventId: event.eventId, sequence: event.sequence, type: event.type, recordedAt: event.recordedAt, actor: event.actor, summary: eventSummary(event), visibleContent: visibleArchiveEventContent(event), contentHash: archiveEventHash(event), deleted: event.type === "message-deleted", classifications: event.responseClassifications, memoryCandidateIds: event.memoryCandidateIds, receiptId: event.receiptId }))
    };
  }

  /**
   * Agent runtime state is projected into the existing Tianyi Session/Archive
   * owner. The runtime never gets a second database: each snapshot is a
   * versioned `runtime-changed` interaction event with the normal owner hash,
   * sequence and operation-id conflict boundary.
   */
  async function appendTianyiAgentRuntimeEvent(input: {
    projectId: string;
    sessionId: string;
    runId: string;
    operationId: string;
    kind: "snapshot" | "tool-call" | "approval" | "steering" | "receipt";
    projection: Record<string, unknown>;
    recordedAt?: string;
  }) {
    const project = projectContext(input.projectId);
    const sessionId = requireId(input.sessionId);
    const runId = requireId(input.runId);
    const operationId = requireId(input.operationId);
    const recordedAt = input.recordedAt ?? now();
    const runtimeReceiptId = `receipt.tianyi-agent.${sha256(`${input.projectId}\u0000${sessionId}\u0000${runId}\u0000${operationId}`).slice(0, 24)}`;
    const readCurrent = async () => {
      const current = await readSession(project, sessionId);
      if (!current) throw new Error("Tianyi Agent 运行依附的 Session 不存在。");
      if (current.value.some((event) => event.type === "session-closed")) throw new Error("已关闭 Session 不能继续 Agent 运行。");
      return current;
    };
    let current = await readCurrent();
    const existing = current.value.find((event) => event.type === "runtime-changed" && event.operationId === operationId && parseAgentRuntimeEvent(event.content)?.runId === runId);
    if (existing) return { alreadyCompleted: true, receiptId: parseAgentRuntimeEvent(existing.content)?.receiptId ?? runtimeReceiptId, contentHash: current.contentHash };
    const event = {
      version: "story-tianyi-interaction-event/v1" as const,
      eventId: `event.tianyi-agent-runtime.${sha256(`${sessionId}\u0000${operationId}`).slice(0, 24)}`,
      sessionId,
      sequence: current.value.length + 1,
      type: "runtime-changed" as const,
      recordedAt,
      actor: "system" as const,
      content: stableJson({ version: "tianyi-agent-runtime-event/v1", runId, operationId, kind: input.kind, receiptId: runtimeReceiptId, projection: input.projection, recordedAt }),
      responseClassifications: [],
      memoryCandidateIds: [],
      receiptId: runtimeReceiptId,
      operationId
    } satisfies InteractionEvent;
    const write = await appendSessionEvent(project, sessionId, current.contentHash as string, event.sequence, event, { recordedAt, operationId });
    if (!write.ok) {
      current = await readCurrent();
      const converged = current.value.find((item) => item.type === "runtime-changed" && item.operationId === operationId && parseAgentRuntimeEvent(item.content)?.runId === runId);
      if (converged) return { alreadyCompleted: true, receiptId: parseAgentRuntimeEvent(converged.content)?.receiptId ?? runtimeReceiptId, contentHash: current.contentHash };
      throw new Error("Agent 运行回执写入冲突；请重新读取后再试。");
    }
    return { alreadyCompleted: false, receiptId: runtimeReceiptId, contentHash: write.current?.contentHash ?? null };
  }

  async function readTianyiAgentRuntimeEvents(input: { projectId: string; sessionId: string; runId: string }) {
    const session = await readSession(projectContext(input.projectId), requireId(input.sessionId));
    if (!session) return [];
    return session.value
      .filter((event) => event.type === "runtime-changed")
      .map((event) => parseAgentRuntimeEvent(event.content))
      .filter((event): event is NonNullable<ReturnType<typeof parseAgentRuntimeEvent>> => Boolean(event) && event.runId === input.runId)
      .map((event) => ({ ...event, contentHash: session.contentHash }));
  }

  async function rebuildTianyiArchiveRecall(input: { projectId: string }) {
    const index = await rebuildArchiveRecallIndex(projectContext(input.projectId), { builtAt: now() });
    return { status: "current" as const, builtAt: index.builtAt, sessionCount: index.sessions.length, messageCount: index.entries.length };
  }

  async function searchTianyiArchiveRecall(input: { projectId: string; authorizedProjectIds: string[]; query: string; filters: Record<string, unknown>; limit?: number }) {
    return searchArchiveRecall(projectContext(input.projectId), {
      authorizedProjectIds: input.authorizedProjectIds,
      query: input.query,
      filters: input.filters,
      limit: input.limit
    });
  }

  async function hardDeleteTianyiArchiveMessage(input: { projectId: string; sessionId: string; eventId: string; expectedHash: string; operationId: string }) {
    const result = await hardDeleteSessionMessage(projectContext(input.projectId), requireId(input.sessionId), {
      eventId: requireId(input.eventId),
      expectedContentHash: requireHash(input.expectedHash),
      deletedAt: now(),
      operationId: requireId(input.operationId)
    });
    return result.ok
      ? { owner: "archive-message", attempted: !result.alreadyCompleted, saved: true, conflicted: false, rejected: false, alreadyCompleted: result.alreadyCompleted, currentHash: result.current.contentHash, expectedHash: input.expectedHash, recoveryAction: null, deletedEventId: result.deletedEventId }
      : { owner: "archive-message", attempted: true, saved: false, conflicted: true, rejected: false, alreadyCompleted: false, currentHash: result.current?.contentHash ?? null, expectedHash: input.expectedHash, recoveryAction: "reload-owner-and-retry", deletedEventId: input.eventId };
  }

  async function hardDeleteTianyiSession(input: { projectId: string; sessionId: string; expectedHash: string; operationId: string }) {
    const project = projectContext(input.projectId);
    const sessionId = requireId(input.sessionId);
    const operationId = requireId(input.operationId);
    const existingTombstone = await readSessionTombstone(project, sessionId);
    if (existingTombstone?.operationId === operationId) return { owner: "archive-session", attempted: false, saved: true, conflicted: false, rejected: false, alreadyCompleted: true, currentHash: null, expectedHash: input.expectedHash, recoveryAction: null, tombstone: existingTombstone };
    const result = await hardDeleteSession(project, sessionId, { expectedContentHash: requireHash(input.expectedHash), deletedAt: now(), operationId });
    return result.ok
      ? { owner: "archive-session", attempted: true, saved: true, conflicted: false, rejected: false, alreadyCompleted: false, currentHash: null, expectedHash: input.expectedHash, recoveryAction: null, tombstone: result.tombstone }
      : { owner: "archive-session", attempted: true, saved: false, conflicted: true, rejected: false, alreadyCompleted: false, currentHash: (await readSession(project, sessionId))?.contentHash ?? null, expectedHash: input.expectedHash, recoveryAction: "reload-owner-and-retry", tombstone: null };
  }

  async function invalidateTianyiArchiveRecall(input: { projectId: string }) {
    return { removed: await removeArchiveRecallIndex(projectContext(input.projectId)) };
  }

  async function exportTianyiPack(input: { projectId: string; packId: string; ownerKinds: string[]; includePersonal: boolean; includeSensitive: boolean; sensitiveSecondConfirmation: boolean }) {
    const projectId = requireProjectId(input.projectId);
    const allowedKinds = new Set(["identity", "project-memory", "global-memory", "grant", "session", "receipt", "stopping-point"]);
    if (!Array.isArray(input.ownerKinds) || input.ownerKinds.some((kind) => !allowedKinds.has(kind))) throw new Error("Continuity Pack owner selection is invalid.");
    const selected = new Set(input.ownerKinds);
    const project = projectContext(projectId);
    const global = { rootPath: options.rootPath, agentId, scope: "author-global" as const };
    const selections: Array<{ kind: "persona" | "relationship-policy" | "memory" | "global-memory-grant" | "session" | "context-receipt" | "stopping-point"; id: string; scope: "author-global" | "project"; projectId?: string }> = [];
    if (selected.has("identity")) {
      if (await readPersona(global)) selections.push({ kind: "persona", id: agentId, scope: "author-global" });
      if (await readRelationshipPolicy(global)) selections.push({ kind: "relationship-policy", id: agentId, scope: "author-global" });
    }
    if (selected.has("project-memory")) for (const item of await listMemories(project)) selections.push({ kind: "memory", id: item.value.id, scope: "project", projectId });
    if (selected.has("global-memory")) for (const item of await listMemories(global)) selections.push({ kind: "memory", id: item.value.id, scope: "author-global" });
    if (selected.has("grant")) for (const item of await listGlobalMemoryGrants(project)) selections.push({ kind: "global-memory-grant", id: item.value.memoryId, scope: "project", projectId });
    if (selected.has("session")) for (const item of await listSessionMetadata(project)) selections.push({ kind: "session", id: item.id, scope: "project", projectId });
    if (selected.has("receipt")) for (const item of await listReceiptMetadata(project)) selections.push({ kind: "context-receipt", id: item.id, scope: "project", projectId });
    if (selected.has("stopping-point")) for (const item of await listStoppingPoints(project)) selections.push({ kind: "stopping-point", id: item.value.id, scope: "project", projectId });
    if (selections.length === 0) throw new Error("Continuity Pack selection is empty.");
    const createdAt = (options.now ?? (() => new Date().toISOString()))();
    const exported = await exportContinuityPack(options.rootPath, { packId: requireId(input.packId), createdAt, agentId, selections, includePersonal: input.includePersonal === true, includeSensitive: input.includeSensitive === true, sensitiveSecondConfirmation: input.sensitiveSecondConfirmation === true });
    return { packId: exported.manifest.packId, createdAt: exported.manifest.createdAt, projectIds: exported.manifest.projectIds, includes: exported.manifest.includes, fileCount: exported.manifest.files.length, byteSize: exported.manifest.files.reduce((sum, item) => sum + item.bytes, 0), manifestHash: sha256(stableJson(exported.manifest)), integrityStatus: "valid" as const };
  }

  async function stageTianyiPack(input: { projectId: string; sourcePackId: string; importId: string }) {
    requireProjectId(input.projectId);
    const staged = await stageContinuityPack(options.rootPath, { sourcePackId: requireId(input.sourcePackId), importId: requireId(input.importId) });
    return { importId: staged.inventory.importId, integrityStatus: staged.inventory.integrityStatus, sensitivitySummary: staged.inventory.sensitivitySummary, validationErrors: staged.inventory.validationErrors, canonicalOverwriteCount: 0, importedSkillAuthorityCount: 0, entries: staged.inventory.entries.map((item) => ({ kind: item.kind, id: item.id, scope: item.scope, projectId: item.projectId, sensitivity: item.sensitivity })) };
  }

  async function getTianyiContextProjection(input: { projectId: string; contextRequest: TianyiContextRequest }) { return buildProjection(requireProjectId(input.projectId), input.contextRequest); }
  async function resolveTianyiObjectContextRefs(input: { projectId: string; objectContextRefs: TianyiObjectContextRef[] }) {
    const refs = normalizeTianyiObjectContextRefs(input.objectContextRefs);
    return resolveObjectContextReferenceStates(requireProjectId(input.projectId), refs);
  }
  async function readTianyiReceipt(input: { projectId: string; receiptId: string; contextRequest: TianyiContextRequest }) {
    const receipt = await readReceipt({ rootPath: options.rootPath, agentId, scope: "project", projectId: requireProjectId(input.projectId) }, requireId(input.receiptId));
    if (!receipt) return null;
    const projection = await buildProjection(input.projectId, input.contextRequest);
    const sourceDetails = [];
    for (const source of receipt.value.sources) {
      if ("sourceKey" in source) {
        sourceDetails.push({ id: source.sourceKey, label: `${source.sourceType}: ${source.sourceId}`, currentState: receipt.value.stale ? "stale" : "current", target: null });
      } else if ("sourceRef" in source) {
        sourceDetails.push({ id: source.sourceRef, label: source.label, currentState: source.state, target: null });
      } else {
        const projected = projection.sources.find((item) => item.id === source.id);
        const target = await readSourceTarget(input.projectId, source.id);
        sourceDetails.push({ id: source.id, label: projected?.label ?? source.kind, currentState: projected?.state ?? "missing", target: target?.target ?? null });
      }
    }
    const archiveMessageDetails = "archiveMessageRefs" in receipt.value
      ? await resolveArchiveRecallMessages(projectContext(input.projectId), receipt.value.archiveMessageRefs.map((ref) => ({ sessionId: ref.sessionId, eventId: ref.eventId, contentHash: ref.contentHash })))
      : [];
    return { receipt: receipt.value, contentHash: receipt.contentHash, currentStatus: receipt.value.version === "story-tianyi-context-receipt/v3" || receipt.value.version === "story-tianyi-context-receipt/v4" || receipt.value.version === "story-tianyi-context-receipt/v5" ? (receipt.value.stale ? "stale" : "current") : deriveReceiptCurrentStatus(receipt.value, projection), sourceDetails, archiveMessageDetails };
  }

  return { ...sessions, ...memories, ...resume, ...(grounded ?? {}), getTianyiIdentity, getTianyiContextProjection, resolveTianyiObjectContextRefs, readTianyiReceipt, listTianyiReceipts, listTianyiStoppingPoints, revokeTianyiStoppingPoint, restoreTianyiStoppingPoint, hardDeleteTianyiStoppingPoint, listTianyiStoppingPointRevisions, listTianyiTombstones, readTianyiSessionEvents, appendTianyiAgentRuntimeEvent, readTianyiAgentRuntimeEvents, rebuildTianyiArchiveRecall, searchTianyiArchiveRecall, invalidateTianyiArchiveRecall, hardDeleteTianyiArchiveMessage, hardDeleteTianyiSession, exportTianyiPack, stageTianyiPack };

  function projectContext(projectId: string) { return { rootPath: options.rootPath, agentId, scope: "project" as const, projectId: requireProjectId(projectId) }; }

  async function compileGroundedContext(rawRequest: TianyiGroundedContextRequest) {
    const request = normalizeTianyiGroundedContextRequest(rawRequest);
    const candidates: TianyiGroundedResolvedCandidate[] = [];
    if (request.sceneRef) candidates.push(resolveGroundedObjectCandidate(request, request.sceneRef, "scene"));
    if (request.subjectRef) candidates.push(resolveGroundedObjectCandidate(request, request.subjectRef, "subject"));
    for (const ref of request.explicitRefs) candidates.push(resolveGroundedObjectCandidate(request, ref, "evidence"));
    for (const reference of request.eventRefs ?? []) candidates.push(resolveGroundedEventCandidate(request, reference));

    const scene = request.sceneRef?.ownerType === "markdown-writing"
      ? safeReadWriting(request.projectId, request.sceneRef.ownerId)
      : null;
    for (const summary of workspace.getStoryStudioWorldLibraryBootstrap({ projectId: request.projectId }).objects) {
      if (summary.type !== "rule") continue;
      const rule = workspace.readWorldObject({ projectId: request.projectId, objectId: summary.id });
      const ref: TianyiObjectContextRef = {
        version: "story-tianyi-object-context-ref/v1",
        ownerType: "markdown-object",
        objectType: "rule",
        stableId: rule.id,
        projectId: request.projectId,
        ownerId: rule.id,
        contentHash: rule.revisionToken,
        state: "current",
        inclusion: "included",
        label: rule.title
      };
      candidates.push(resolveGroundedObjectCandidate(request, ref, "constraint", scene));
    }

    const projectMemories = await listMemories(projectContext(request.projectId));
    const globalContext = { rootPath: options.rootPath, agentId, scope: "author-global" as const };
    const [globalMemories, grants] = await Promise.all([
      listMemories(globalContext),
      listGlobalMemoryGrants(projectContext(request.projectId))
    ]);
    const grantsByMemoryId = new Map(grants.map((grant) => [grant.value.memoryId, grant]));
    const taskRefs = groundedTaskRefs(request);
    for (const memory of [...projectMemories, ...globalMemories]) {
      const grant = memory.value.scope === "author-global" ? grantsByMemoryId.get(memory.value.id) : null;
      const grantCurrent = memory.value.scope === "project"
        || Boolean(grant && grant.value.state === "active" && grant.value.memoryContentHash === memory.contentHash);
      const approved = memory.value.state === "active"
        && memory.value.approval_state === "author-approved"
        && memory.value.sensitivity === "ordinary"
        && grantCurrent;
      const relevant = memory.value.source_refs.some((ref) => taskRefs.has(ref));
      candidates.push({
        sourceType: "memory",
        projectId: memory.value.scope === "project" ? memory.value.project_id : request.projectId,
        sourceId: memory.value.id,
        sourceKey: `${request.projectId}:memory:${memory.value.scope}:${memory.value.id}`,
        contentHash: memory.contentHash,
        requestedContentHash: memory.contentHash,
        lane: "memory",
        wireContent: approved && relevant ? memory.value.body : null,
        knowledgeSubjectRefs: memory.value.knowledge_subject_refs ?? [],
        preAuthorizationReason: !approved ? "UNAPPROVED_MEMORY" : !relevant ? "TASK_IRRELEVANT" : null
      });
    }
    return compileTianyiGroundedContext({ request, candidates });
  }

  function resolveGroundedObjectCandidate(
    request: TianyiGroundedContextRequest,
    ref: TianyiObjectContextRef,
    lane: TianyiGroundedResolvedCandidate["lane"],
    knownScene: StoryStudioWritingDocument | null = null
  ): TianyiGroundedResolvedCandidate {
    const sourceType = ref.ownerType === "markdown-writing"
      ? ref.objectType === "scene" ? "scene" : "writing"
      : ref.objectType === "rule" ? "rule" : "world-object";
    const base = {
      sourceType,
      projectId: ref.projectId,
      sourceId: ref.stableId,
      sourceKey: tianyiObjectContextRefKey(ref),
      requestedContentHash: ref.contentHash,
      lane
    } satisfies Pick<TianyiGroundedResolvedCandidate, "sourceType" | "projectId" | "sourceId" | "sourceKey" | "requestedContentHash" | "lane">;
    if (ref.projectId !== request.projectId) {
      return { ...base, contentHash: ref.contentHash, wireContent: null, knowledgeSubjectRefs: [], preAuthorizationReason: "CROSS_PROJECT_REFERENCE" };
    }
    try {
      if (ref.ownerType === "markdown-object") {
        const object = workspace.readWorldObject({ projectId: request.projectId, objectId: ref.ownerId });
        if (object.type === "event") {
          return { ...base, contentHash: object.revisionToken, wireContent: null, knowledgeSubjectRefs: [], preAuthorizationReason: "SOURCE_MISSING" };
        }
        if (object.id !== ref.stableId || object.type !== ref.objectType) {
          return { ...base, contentHash: ref.contentHash, wireContent: null, knowledgeSubjectRefs: [], preAuthorizationReason: "SOURCE_MISSING" };
        }
        const scene = knownScene ?? (request.sceneRef ? safeReadWriting(request.projectId, request.sceneRef.ownerId) : null);
        const ruleReason = object.type === "rule" ? groundedRuleReason(object, scene) : null;
        return {
          ...base,
          contentHash: object.revisionToken,
          wireContent: ruleReason ? null : `${object.title}\nType: ${object.type}\nStatus: ${object.status}\nTags: ${object.tags.join(", ")}\n${object.body}`,
          knowledgeSubjectRefs: object.knowledgeSubjects,
          preAuthorizationReason: ruleReason
        };
      }
      if (ref.ownerType === "markdown-writing") {
        const document = workspace.readWritingDocument({ projectId: request.projectId, documentId: ref.ownerId });
        if (
          (ref.objectType !== "scene" && ref.objectType !== "chapter")
          || document.id !== ref.stableId
          || document.type !== ref.objectType
        ) {
          return { ...base, contentHash: ref.contentHash, wireContent: null, knowledgeSubjectRefs: [], preAuthorizationReason: "SOURCE_MISSING" };
        }
        const wireContent = request.accessMode === "character"
          ? stableJson({
              version: "story-tianyi-character-writing-projection/v1",
              writingId: document.id,
              writingType: document.type,
              writingStatus: document.status,
              subjectId: request.subjectRef?.stableId ?? null
            })
          : `${document.title}\nType: ${document.type}\nStatus: ${document.status}\n${document.body}`;
        return {
          ...base,
          contentHash: document.revisionToken,
          wireContent,
          knowledgeSubjectRefs: document.knowledgeSubjects,
          preAuthorizationReason: null
        };
      }
      const visual = workspace.listVisualDocuments({ projectId: request.projectId }).find((item) => item.id === ref.ownerId);
      if (!visual || visual.contentHash !== ref.contentHash) {
        return { ...base, contentHash: visual?.contentHash ?? ref.contentHash, wireContent: null, knowledgeSubjectRefs: [], preAuthorizationReason: visual ? "STALE_REFERENCE" : "SOURCE_MISSING" };
      }
      return {
        ...base,
        contentHash: visual.contentHash,
        wireContent: `${visual.title}\nType: ${visual.type}\n${stableJson(visual.content)}`,
        knowledgeSubjectRefs: [],
        preAuthorizationReason: null
      };
    } catch {
      return { ...base, contentHash: ref.contentHash, wireContent: null, knowledgeSubjectRefs: [], preAuthorizationReason: "SOURCE_MISSING" };
    }
  }

  function resolveGroundedEventCandidate(
    request: TianyiGroundedContextRequest,
    reference: StoryStudioEventReference
  ): TianyiGroundedResolvedCandidate {
    let event: StoryStudioWorldObject;
    try {
      event = workspace.readWorldObject({ projectId: request.projectId, objectId: reference.eventId });
    } catch {
      throw new Error("Tianyi grounded event reference is unavailable.");
    }
    try {
      assertStoryStudioEventReferenceEligibility({
        reference,
        event,
        consumer: "tianyi-grounded",
        canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId: request.projectId, eventId: event.id }))
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "event reference is invalid";
      throw new Error(`Tianyi grounded event reference rejected: ${reason}`);
    }
    return {
      sourceType: "world-object",
      projectId: request.projectId,
      sourceId: event.id,
      sourceKey: storyStudioEventReferenceKey(reference),
      contentHash: event.revisionToken,
      requestedContentHash: reference.revisionToken,
      lane: "evidence",
      wireContent: `${event.title}\nType: event\nStatus: ${event.status}\nTags: ${event.tags.join(", ")}\n${event.body}`,
      knowledgeSubjectRefs: event.knowledgeSubjects,
      preAuthorizationReason: null
    };
  }

  function groundedRuleReason(object: StoryStudioWorldObject, scene: StoryStudioWritingDocument | null): TianyiGroundedReasonCode | null {
    if (object.status !== "locked" || !object.tags.includes("active")) return "INACTIVE_RULE";
    if (!scene || !scene.linkedRuleIds.includes(object.id)) return "RULE_SCOPE_MISMATCH";
    return null;
  }

  function safeReadWriting(projectId: string, documentId: string): StoryStudioWritingDocument | null {
    try {
      return workspace.readWritingDocument({ projectId, documentId });
    } catch {
      return null;
    }
  }

  function groundedTaskRefs(request: TianyiGroundedContextRequest): Set<string> {
    const refs = [request.subjectRef, request.sceneRef, ...request.explicitRefs].filter((ref): ref is TianyiObjectContextRef => ref !== null);
    return new Set([
      ...refs.flatMap((ref) => [ref.stableId, ref.ownerId, tianyiObjectContextRefKey(ref)]),
      ...(request.eventRefs ?? []).flatMap((reference) => [reference.eventId, storyStudioEventReferenceKey(reference)])
    ]);
  }

  async function resolveObjectContextReferenceStates(projectId: string, refs: TianyiObjectContextRef[]): Promise<TianyiObjectContextRef[]> {
    const currentProjectId = requireProjectId(projectId);
    const visuals = workspace.listVisualDocuments({ projectId: currentProjectId });
    const writingSummaries = workspace.getWritingBootstrap({ projectId: currentProjectId }).chapters.flatMap((chapter) => [chapter, ...chapter.scenes]);
    return refs.map((ref) => {
      if (ref.projectId !== currentProjectId) return excludedObjectContextRef(ref, "unauthorized");
      try {
        if (ref.ownerType === "markdown-object") {
          if (ref.objectType === "event") return excludedObjectContextRef(ref, "unauthorized");
          const object = workspace.readWorldObject({ projectId: currentProjectId, objectId: ref.ownerId });
          if (object.id !== ref.stableId || object.type !== ref.objectType) return excludedObjectContextRef(ref, "missing");
          if (object.revisionToken !== ref.contentHash) return excludedObjectContextRef(ref, "stale");
          return includedObjectContextRef(ref);
        }
        if (ref.ownerType === "markdown-writing") {
          const summary = writingSummaries.find((item) => item.id === ref.ownerId);
          const isSelection = ref.objectType === "selection";
          if (!summary || (!isSelection && (summary.id !== ref.stableId || summary.type !== ref.objectType))) return excludedObjectContextRef(ref, "missing");
          const document = workspace.readWritingDocument({ projectId: currentProjectId, documentId: summary.id });
          if (document.revisionToken !== ref.contentHash) return excludedObjectContextRef(ref, "stale");
          if (isSelection && !parseSelectionStableId(ref.stableId, document.body.length)) return excludedObjectContextRef(ref, "missing");
          return includedObjectContextRef(ref);
        }
        const document = visuals.find((item) => item.id === ref.ownerId);
        if (!document || (ref.ownerType === "visual-map" && document.type !== "map") || (ref.ownerType === "visual-timeline" && document.type !== "timeline")) {
          return excludedObjectContextRef(ref, "missing");
        }
        if (document.contentHash !== ref.contentHash) return excludedObjectContextRef(ref, "stale");
        if (ref.ownerType === "visual-map") {
          const collection = ref.objectType === "map-marker" ? document.content.markers : document.content.regions;
          const item = Array.isArray(collection) ? collection.find((candidate) => isStableVisualItem(candidate, ref.stableId)) : null;
          return item ? includedObjectContextRef(ref) : excludedObjectContextRef(ref, "missing");
        }
        const entries = Array.isArray(document.content.entries) ? document.content.entries : [];
        const entry = entries.find((candidate) => isStableVisualItem(candidate, ref.stableId));
        return entry ? includedObjectContextRef(ref) : excludedObjectContextRef(ref, "missing");
      } catch {
        return excludedObjectContextRef(ref, "missing");
      }
    });
  }

  async function ensureIdentity(projectId: string) {
    return ensureTianyiIdentityReady({
      rootPath: options.rootPath,
      agentId,
      projectId,
      recordedAt: now()
    });
  }

  async function resolveProjectionSource(
    projectId: string,
    ref: { id: string; kind: string; origin: string },
    eventReferences: ReadonlyMap<string, StoryStudioEventReference>
  ): Promise<TianyiProjectionSource | null> {
    const productId = requireStableId(ref.id);
    const id = sourceAlias(ref.kind, productId);
    const origin = requireOrigin(ref.origin);
    if (ref.kind === "world-object" || ref.kind === "selection") {
      let object: StoryStudioWorldObject;
      try {
        object = workspace.readWorldObject({ projectId, objectId: productId });
      } catch {
        return missingSource(id, ref.kind === "selection" ? "selection" : "world-object", origin);
      }
      if (object.type === "event") {
        if (!eventReferences.has(object.id)) {
          throw new Error("Tianyi event sources require an explicit Story Studio event reference.");
        }
        return null;
      }
      return currentSource(id, ref.kind === "selection" ? "selection" : "world-object", object.revisionToken, object.title, "story-source", origin);
    }
    try {
      if (ref.kind === "writing-document") {
        const document = workspace.getWritingBootstrap({ projectId }).activeDocument;
        if (!document || document.id !== productId) return missingSource(id, "writing-document", origin);
        return currentSource(id, "writing-document", document.revisionToken, document.title, "story-source", origin);
      }
      if (ref.kind === "visual-document") {
        const document = workspace.listVisualDocuments({ projectId }).find((item) => item.id === productId);
        return document ? currentSource(id, "visual-document", document.contentHash, document.title, "story-source", origin) : missingSource(id, "visual-document", origin);
      }
      const guard = workspace.getWritingBootstrap({ projectId }).activeDocument?.guard;
      if (ref.kind === "locked-rule") {
        const rule = guard?.rules.find((item) => item.id === productId);
        return rule ? currentSource(id, "locked-rule", sha256(stableJson(rule)), rule.title, "rule", origin) : missingSource(id, "locked-rule", origin);
      }
      if (ref.kind === "unresolved-thread") {
        const thread = guard?.threads.find((item) => item.id === productId);
        return thread ? currentSource(id, "unresolved-thread", sha256(stableJson(thread)), thread.title, "story-source", origin) : missingSource(id, "unresolved-thread", origin);
      }
      if (ref.kind === "writing-guard") {
        const object = [...(guard?.characters ?? []), ...(guard?.locations ?? []), ...(guard?.events ?? [])].find((item) => item.id === productId);
        return object ? currentSource(id, "writing-guard", sha256(stableJson(object)), object.title, "story-source", origin) : missingSource(id, "writing-guard", origin);
      }
      if (ref.kind === "review-evidence") return { ...missingSource(id, "review-evidence", origin), state: "unavailable", classification: "review-evidence", exclusionReason: "review-evidence-unavailable" };
    } catch { return missingSource(id, normalizeKind(ref.kind), origin); }
    throw new Error("Tianyi source kind is invalid.");
  }

  function resolveEventProjectionSource(
    projectId: string,
    reference: StoryStudioEventReference,
    origin: TianyiProjectionSource["origin"]
  ): TianyiProjectionSource {
    if (reference.projectId !== projectId) throw new Error("Tianyi event reference belongs to another project.");
    let event: StoryStudioWorldObject;
    try {
      event = workspace.readWorldObject({ projectId, objectId: reference.eventId });
    } catch {
      throw new Error("Tianyi event reference is unavailable.");
    }
    try {
      assertStoryStudioEventReferenceEligibility({
        reference,
        event,
        consumer: "tianyi-grounded",
        canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId, eventId: event.id }))
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "event reference is invalid";
      throw new Error(`Tianyi event reference rejected: ${reason}`);
    }
    return currentSource(
      eventProjectionSourceId(projectId, event.id, event.revisionToken),
      "world-object",
      event.revisionToken,
      event.title,
      "story-source",
      origin
    );
  }

  async function resolveStoryMaterial(projectId: string, source: TianyiProjectionSource): Promise<TianyiRawSourceMaterial | null> {
    if (source.ownerKind === "writing-document") {
      const document = workspace.getWritingBootstrap({ projectId }).activeDocument;
      return document && sourceAlias("writing-document", document.id) === source.id ? materialFromWriting(document, source.id) : null;
    }
    if (source.ownerKind === "world-object") {
      const event = resolveEventMaterial(projectId, source);
      if (event) return materialFromObject(event, source.id);
    }
    if (source.ownerKind === "world-object" || source.ownerKind === "selection" || source.ownerKind === "writing-guard") {
      const object = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects.find((item) => sourceAlias(source.ownerKind === "selection" ? "selection" : source.ownerKind, item.id) === source.id || sourceAlias("world-object", item.id) === source.id || sourceAlias("writing-guard", item.id) === source.id);
      try {
        const current = object ? workspace.readWorldObject({ projectId, objectId: object.id }) : null;
        return current && current.type !== "event" ? materialFromObject(current, source.id) : null;
      } catch { return null; }
    }
    if (source.ownerKind === "visual-document") {
      const document = workspace.listVisualDocuments({ projectId }).find((item) => sourceAlias("visual-document", item.id) === source.id);
      return document ? materialFromVisual(document, source.id) : null;
    }
    const guard = workspace.getWritingBootstrap({ projectId }).activeDocument?.guard;
    if (source.ownerKind === "locked-rule") {
      const value = guard?.rules.find((item) => sourceAlias("locked-rule", item.id) === source.id);
      return value ? { id: source.id, kind: "locked-rule", hash: source.hash, content: `${value.title}\n${value.summary}`, classification: "ordinary" } : null;
    }
    if (source.ownerKind === "unresolved-thread") {
      const value = guard?.threads.find((item) => sourceAlias("unresolved-thread", item.id) === source.id);
      return value ? { id: source.id, kind: "unresolved-thread", hash: source.hash, content: `${value.title}\n${value.summary}`, classification: "ordinary" } : null;
    }
    return null;
  }

  function resolveEventMaterial(projectId: string, source: TianyiProjectionSource): StoryStudioWorldObject | null {
    for (const summary of workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects) {
      if (summary.type !== "event") continue;
      try {
        const event = workspace.readWorldObject({ projectId, objectId: summary.id });
        if (eventProjectionSourceId(projectId, event.id, event.revisionToken) === source.id && event.revisionToken === source.hash) return event;
      } catch {
        // A deleted event is not usable source material.
      }
    }
    return null;
  }

  function projectionOwnerId(
    projectId: string,
    kind: TianyiContextRequest["activeOwner"]["kind"],
    id: string,
    eventReferences: ReadonlyMap<string, StoryStudioEventReference>
  ): string {
    if (kind !== "world-object") return sourceAlias(kind, id);
    return projectionWorldObjectId(projectId, id, eventReferences);
  }

  function projectionWorldObjectId(
    projectId: string,
    objectId: string,
    eventReferences: ReadonlyMap<string, StoryStudioEventReference>
  ): string {
    const reference = eventReferences.get(objectId);
    if (reference) return eventProjectionSourceId(projectId, reference.eventId, reference.revisionToken);
    try {
      const object = workspace.readWorldObject({ projectId, objectId });
      if (object.type === "event") throw new Error("Tianyi event sources require an explicit Story Studio event reference.");
    } catch (cause) {
      if (cause instanceof Error && /explicit Story Studio event reference/u.test(cause.message)) throw cause;
    }
    return sourceAlias("world-object", objectId);
  }
}

export type StoryStudioTianyiOperations = ReturnType<typeof createStoryStudioTianyiOperations>;

function ownerWriteResult(owner: string, write: { ok: boolean; conflict: boolean; current?: { contentHash: string } | null }, expectedHash: string) {
  return { owner, attempted: true, saved: write.ok, conflicted: write.conflict, rejected: false, alreadyCompleted: false, currentHash: write.current?.contentHash ?? null, expectedHash, recoveryAction: write.conflict ? "reload-owner-and-retry" : null };
}

function normalizeContextRequest(value: TianyiContextRequest, expectedProjectId: string): TianyiContextRequest {
  const object = exactObject(value, ["productMode", "activeOwner", "selection", "sourceRefs", "memorySelections", "enabledSkillRefs", "eventRefs"], true);
  if (!["world", "writing", "intelligence", "localization", "publish"].includes(String(object.productMode))) throw new Error("Tianyi product mode is invalid.");
  const active = exactObject(object.activeOwner, ["kind", "id"]);
  if (!["project", "writing-document", "world-object", "visual-document"].includes(String(active.kind))) throw new Error("Tianyi active owner kind is invalid.");
  const selection = exactObject(object.selection, ["documentId", "objectId", "timelinePointId"]);
  const sourceRefs = array(object.sourceRefs, 64).map((item) => { const ref = exactObject(item, ["id", "kind", "origin"]); return { id: requireStableId(ref.id), kind: requireSourceKind(ref.kind), origin: requireOrigin(ref.origin) }; });
  const memorySelections = array(object.memorySelections, 32).map((item) => { const ref = exactObject(item, ["id", "scope"]); if (ref.scope !== "author-global" && ref.scope !== "project") throw new Error("Memory scope is invalid."); return { id: requireId(ref.id), scope: ref.scope as "author-global" | "project" }; });
  const enabledSkillRefs = array(object.enabledSkillRefs, 32).map((item) => { const ref = exactObject(item, ["id", "version"]); return { id: requireId(ref.id), version: requireText(ref.version, 40) }; });
  const eventRefs = Object.hasOwn(object, "eventRefs")
    ? normalizeContextEventReferences(object.eventRefs, expectedProjectId)
    : undefined;
  return {
    productMode: object.productMode as TianyiContextRequest["productMode"],
    activeOwner: { kind: active.kind as TianyiContextRequest["activeOwner"]["kind"], id: active.id === null ? null : requireStableId(active.id) },
    selection: { documentId: nullableStableId(selection.documentId), objectId: nullableStableId(selection.objectId), timelinePointId: nullableStableId(selection.timelinePointId) },
    sourceRefs,
    memorySelections,
    enabledSkillRefs,
    ...(eventRefs ? { eventRefs } : {})
  };
}

/**
 * Event handoffs remain references until the server re-reads them in
 * `resolveEventProjectionSource`.  A request may name an event once only;
 * accepting two expected versions would make its source identity ambiguous.
 */
function normalizeContextEventReferences(value: unknown, expectedProjectId: string): StoryStudioEventReference[] {
  const seenEventIds = new Set<string>();
  return array(value, 4).map((item) => {
    const reference = normalizeStoryStudioEventReference(item);
    if (reference.projectId !== expectedProjectId) throw new Error("Tianyi event reference belongs to another project.");
    if (reference.requestedUse !== "constraint") throw new Error("Tianyi event reference use must be constraint.");
    if (seenEventIds.has(reference.eventId)) throw new Error("Tianyi event reference is duplicated.");
    seenEventIds.add(reference.eventId);
    return reference;
  });
}

function currentSource(id: string, ownerKind: TianyiProjectionSource["ownerKind"], hash: string, label: string, classification: TianyiProjectionSource["classification"], origin: TianyiProjectionSource["origin"]): TianyiProjectionSource { return { id, ownerKind, hash, label: requireText(label, 120), state: "current", classification, origin, exclusionReason: null }; }
function missingSource(id: string, ownerKind: TianyiProjectionSource["ownerKind"], origin: TianyiProjectionSource["origin"]): TianyiProjectionSource { return { id, ownerKind, hash: sha256(`missing:${ownerKind}:${id}`), label: `Unavailable ${id}`, state: "missing", classification: ownerKind === "locked-rule" ? "rule" : ownerKind === "review-evidence" ? "review-evidence" : "story-source", origin, exclusionReason: "source-missing" }; }
function materialFromWriting(value: StoryStudioWritingDocument, id: string): TianyiRawSourceMaterial { return { id, kind: "writing-document", hash: value.revisionToken, content: value.body, classification: "ordinary" }; }
function materialFromObject(value: StoryStudioWorldObject, id: string): TianyiRawSourceMaterial { return { id, kind: "world-object", hash: value.revisionToken, content: value.body, classification: "ordinary" }; }
function materialFromVisual(value: StoryStudioVisualDocument, id: string): TianyiRawSourceMaterial { return { id, kind: "visual-document", hash: value.contentHash, content: `${value.title}\nType: ${value.type}\nObjects: ${value.objectRefs.join(", ")}`, classification: "ordinary" }; }
function includedObjectContextRef(ref: TianyiObjectContextRef): TianyiObjectContextRef { return { ...ref, state: "current", inclusion: "included" }; }
function excludedObjectContextRef(ref: TianyiObjectContextRef, state: "stale" | "missing" | "unauthorized"): TianyiObjectContextRef { return { ...ref, state, inclusion: "excluded" }; }
function isStableVisualItem(value: unknown, stableId: string): boolean { return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { id?: unknown }).id === stableId); }
function parseSelectionStableId(stableId: string, bodyLength: number): { start: number; end: number } | null {
  const match = /^selection\.(\d+)\.(\d+)$/u.exec(stableId);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= bodyLength ? { start, end } : null;
}
function eventSummary(event: InteractionEvent): string {
  if (event.type === "session-opened") return "本次创作已由作者开始。";
  if (event.type === "author-message") return event.content.includes("tianyi-creative-author-source/v1") ? "作者原话已先保存到现有天意 Archive。" : "作者提交了一条有边界的上下文问题。";
  if (event.type === "creative-response") return "天意已基于已保存原话给出创意整理回应。";
  if (event.type === "creative-summary-revised") return "当前理解已作为可追溯投影更新。";
  if (event.type === "creative-candidate-proposed") return "天意提出了一条带来源的创意候选。";
  if (event.type === "creative-candidate-decided") return "作者已审查一条创意候选。";
  if (event.type === "creative-session-paused") return "创意会话已暂停，原话与候选均可恢复。";
  if (event.type === "creative-session-completed") return "创意会话已整理完成，等待或已进入归档。";
  if (event.type === "bounded-action") return "作者运行了一项有边界的上下文操作。";
  if (event.type === "tianyi-response") return "天意生成了一条本地确定性回应。";
  if (event.type === "memory-candidate-proposed") return "天意提出了一条待作者决定的记忆候选。";
  if (event.type === "memory-candidate-decided") return "作者已决定一条记忆候选。";
  if (event.type === "stopping-point-proposed") return "天意提出了一个待作者决定的停点。";
  if (event.type === "stopping-point-decided") return "作者已决定一个停点候选。";
  if (event.type === "runtime-changed") return "本次记录检测到运行方式变化。";
  if (event.type === "source-returned") return "作者返回了一条精确 Archive 来源。";
  if (event.type === "nuwa-result-returned") return "女娲候选路线已返回本次天意创作记录。";
  if (event.type === "session-rolled-over") return "本次创作已显式续接到另一个 Session。";
  if (event.type === "retained-message") return "作者从临时 Session 中明确保留了一条可见消息。";
  if (event.type === "message-deleted") return "这条消息已由作者彻底删除。";
  return "本次创作已由作者结束。";
}
function dedupeRefs<T extends { id: string }>(refs: T[]): T[] { const seen = new Set<string>(); return refs.filter((ref) => !seen.has(ref.id) && Boolean(seen.add(ref.id))); }
function exactObject(value: unknown, keys: string[], optionalEventRefs = false): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Tianyi request object is invalid.");
  }
  const object = value as Record<string, unknown>;
  const hasUnexpectedKey = Object.keys(object).some((key) => !keys.includes(key));
  const hasMissingRequiredKey = keys.some((key) => key !== "eventRefs" || !optionalEventRefs ? !Object.hasOwn(object, key) : false);
  if (hasUnexpectedKey || hasMissingRequiredKey) throw new Error("Tianyi request fields are invalid.");
  return object;
}
function array(value: unknown, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) throw new Error("Tianyi request list is invalid."); return value; }
function requireText(value: unknown, maximum: number): string { if (typeof value !== "string") throw new Error("Tianyi request text is invalid."); const text = value.normalize("NFC").trim(); if (!text || [...text].length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new Error("Tianyi request text is invalid."); return text; }
function requireId(value: unknown): string { const text = requireText(value, 96); if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(text)) throw new Error("Product identifier is invalid."); return text; }
function requireHash(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("Expected hash is invalid."); return value; }
function requireStableId(value: unknown): string { const text = requireText(value, 160); if (/[\\/]/u.test(text)) throw new Error("Product stable identifier is invalid."); return text; }
function nullableStableId(value: unknown): string | null { return value === null ? null : requireStableId(value); }
function requireProjectId(value: unknown): string { const text = requireText(value, 64); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(text)) throw new Error("Project identifier is invalid."); return text; }
function requireOrigin(value: unknown): TianyiProjectionSource["origin"] { if (!["active-owner", "shared-selection", "writing-guard", "locked-rule", "unresolved-thread", "review-evidence", "explicit-memory"].includes(String(value))) throw new Error("Tianyi source origin is invalid."); return value as TianyiProjectionSource["origin"]; }
function requireSourceKind(value: unknown): string { if (!["writing-document", "world-object", "visual-document", "selection", "writing-guard", "locked-rule", "unresolved-thread", "review-evidence"].includes(String(value))) throw new Error("Tianyi source kind is invalid."); return String(value); }
function normalizeKind(value: string): TianyiProjectionSource["ownerKind"] { return requireSourceKind(value) as TianyiProjectionSource["ownerKind"]; }
function sourceAlias(kind: string, id: string): string { return `source.${sha256(`${kind}\u0000${id}`).slice(0, 24)}`; }
function eventProjectionSourceId(projectId: string, eventId: string, revisionToken: string): string { return sourceAlias("event-reference", `${projectId}:${eventId}:${revisionToken}`); }

function parseAgentRuntimeEvent(value: string): {
  version: "tianyi-agent-runtime-event/v1";
  runId: string;
  operationId: string;
  kind: "snapshot" | "tool-call" | "approval" | "steering" | "receipt";
  receiptId: string;
  projection: Record<string, unknown>;
  recordedAt: string;
} | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.version !== "tianyi-agent-runtime-event/v1" || typeof parsed.runId !== "string" || typeof parsed.operationId !== "string" || typeof parsed.receiptId !== "string" || typeof parsed.recordedAt !== "string" || !parsed.projection || typeof parsed.projection !== "object" || Array.isArray(parsed.projection)) return null;
    if (!["snapshot", "tool-call", "approval", "steering", "receipt"].includes(String(parsed.kind))) return null;
    return parsed as unknown as {
      version: "tianyi-agent-runtime-event/v1";
      runId: string;
      operationId: string;
      kind: "snapshot" | "tool-call" | "approval" | "steering" | "receipt";
      receiptId: string;
      projection: Record<string, unknown>;
      recordedAt: string;
    };
  } catch {
    return null;
  }
}
