import { createHash } from "node:crypto";
import type { AgentRuntimeResult, AgentRuntimeStreamEvent } from "./agentRuntimePlugin.ts";
import type { TianyiSimulationContextPack } from "./tianyiSimulationSourceContract.ts";
import { confirmStoryIntakeCandidate, migrateStoryIntakeEnvelopeV1, rebaseStoryIntakeEnvelopeAfterUndo, undoStoryIntakeCandidateApplication, updateStoryIntakeCandidateLifecycle, type StoryIntakeBaseVersion, type StoryIntakeCandidate, type StoryIntakeEnvelope, type StoryIntakeLifecycleStatus, type StoryIntakeSourceRef } from "../storyContracts/storyIntakeEnvelope.ts";

export type TianyiAgentRunStatus =
  | "idle"
  | "planning"
  | "awaiting_author"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TianyiAgentToolClassification = "read" | "proposal";
export type TianyiAgentPermissionProfile = "step-by-step" | "conservative" | "proactive";

export type TianyiAgentContextManifest = {
  version: "tianyi-agent-context-manifest/v1";
  projectId: string;
  workVersionId: string;
  sessionId: string;
  currentPage: string;
  selectedObjectIds: string[];
  sourceRefs: Array<{ id: string; label: string; hash: string; state: "current" | "stale" | "excluded" }>;
  authorSourceRefs: string[];
  excludedRefs: Array<{ id: string; reason: string }>;
  unresolvedQuestions: string[];
  estimatedTokens: number;
  compaction: {
    state: "none" | "available" | "applied";
    summaryVersion: number;
    preservedAnchors: string[];
    receiptId: string | null;
  };
  simulationContextPack?: TianyiSimulationContextPack | null;
  storyIntakeSource?: { version: "tianyan-story-intake-context/v1"; sourceRef: StoryIntakeSourceRef; sourceLength: number } | null;
};

export type TianyiAgentStreamEvent = AgentRuntimeStreamEvent;

export type TianyiAgentPlanStep = {
  stepId: string;
  title: string;
  kind: "read-context" | "model-analysis" | "candidate-proposal" | "owner-handoff" | "product-tool";
  classification: TianyiAgentToolClassification;
  requiredPermission: "none" | "author-approval";
  status: "pending" | "awaiting_author" | "approved" | "rejected" | "completed" | "failed";
  toolName?: string;
  error?: string | null;
};

export type TianyiAgentToolCall = {
  callId: string;
  toolName: string;
  classification: TianyiAgentToolClassification;
  status: "requested" | "approved" | "rejected" | "completed" | "failed";
  arguments: Record<string, unknown>;
  output: Record<string, unknown> | null;
  receiptId: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type TianyiAgentCandidate = {
  candidateId: string;
  kind: "character" | "item" | "location" | "rule" | "event" | "relation" | "unknown";
  title: string;
  summary: string;
  sourceRefs: string[];
  uncertainties: string[];
  targetOwnerKind: "agent-recognition-proposal" | "event-review" | "relation-owner" | "candidate-only";
  state: "pending" | "handed-off" | "rejected" | "deferred";
  ownerReceipt: { owner: string; id: string; revision: number | null } | null;
};

export type TianyiAgentRunProjection = {
  version: "tianyi-agent-run-projection/v1";
  runId: string;
  projectId: string;
  workVersionId: string;
  sessionId: string;
  task: string;
  currentPage: string;
  contextRequest: Record<string, unknown> | null;
  status: TianyiAgentRunStatus;
  contextManifest: TianyiAgentContextManifest | null;
  resultSummary: string | null;
  model: { providerId: string | null; profileId: string | null; modelId: string | null; runtime: "fixture" | "provider" | "pi" };
  budget: { maxProviderCalls: number; maxOutputTokens: number; providerCalls: number; estimatedTokens: number };
  observability: { traceId: string | null; latencyMs: number | null; promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; streamEventCount: number };
  executionIdentity: { requestedProviderId: string | null; requestedModelId: string | null; responseModelId: string | null; runId: string; stepId: string | null };
  permissionProfile: TianyiAgentPermissionProfile;
  plan: TianyiAgentPlanStep[];
  toolCalls: TianyiAgentToolCall[];
  approvals: Array<{ stepId: string; decision: "approved" | "rejected"; operationId: string; receiptId: string; recordedAt: string }>;
  steering: Array<{ instruction: string; operationId: string; recordedAt: string }>;
  candidates: TianyiAgentCandidate[];
  storyIntakeEnvelope: StoryIntakeEnvelope | null;
  receipts: Array<{ receiptId: string; kind: "tool" | "runtime" | "owner" | "compaction"; label: string; operationId: string; recordedAt: string }>;
  stopReason: string | null;
  error: { category: "provider-unavailable" | "provider-failed" | "tool-failed" | "invalid-tool-call" | "conflict" | "cancelled" | "unknown"; code: string; message: string; retryable: boolean; retryBoundary: "none" | "author-explicit" } | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type TianyiAgentRuntimeEvent = {
  version: "tianyi-agent-runtime-event/v1";
  runId: string;
  workVersionId: string;
  operationId: string;
  kind: "snapshot" | "stream" | "tool-call" | "approval" | "steering" | "receipt";
  streamEvent?: TianyiAgentStreamEvent;
  projection: TianyiAgentRunProjection;
  recordedAt: string;
};

export type TianyiAgentToolDefinition = {
  name: string;
  label: string;
  classification: TianyiAgentToolClassification;
  owner: "tianyi-context" | "story-control-surface";
  requiredPermission: "none" | "author-approval";
  scope: "current-session" | "current-project";
  timeoutMs: number;
  inputSchema: { type: "object"; required: string[]; properties: Record<string, { type: "string" | "array" | "object"; maxLength?: number }> };
  idempotency: "operation-id";
};

export const TIANYI_AGENT_TOOL_REGISTRY: readonly TianyiAgentToolDefinition[] = Object.freeze([
  {
    name: "propose_story_intake",
    label: "提出结构化故事候选",
    classification: "proposal",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-session",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["candidates"], properties: { candidates: { type: "array", maxLength: 64 } } },
    idempotency: "operation-id"
  },
  {
    name: "read_context_manifest",
    label: "查看当前引用范围",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "author-approval",
    scope: "current-session",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "read_story_selection",
    label: "查看当前选择",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-session",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "read_related_world_objects",
    label: "查看相关人物与资料",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-project",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "read_event_line_projection",
    label: "查看局部事件线",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-project",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "read_event_focus_context",
    label: "查看事件焦点关联",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-project",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "read_pending_candidates",
    label: "查看待确认候选",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-session",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "read_open_questions",
    label: "查看开放问题",
    classification: "read",
    owner: "tianyi-context",
    requiredPermission: "none",
    scope: "current-session",
    timeoutMs: 3_000,
    inputSchema: { type: "object", required: [], properties: {} },
    idempotency: "operation-id"
  },
  {
    name: "create_artifact",
    label: "创建普通创作产物",
    classification: "proposal",
    owner: "story-control-surface",
    requiredPermission: "author-approval",
    scope: "current-project",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["type", "title", "content"], properties: { type: { type: "string", maxLength: 32 }, title: { type: "string", maxLength: 100 }, content: { type: "string", maxLength: 12_000 } } },
    idempotency: "operation-id"
  },
  {
    name: "propose_entity_candidate",
    label: "准备人物或资料候选",
    classification: "proposal",
    owner: "tianyi-context",
    requiredPermission: "author-approval",
    scope: "current-project",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["kind", "title"], properties: { kind: { type: "string", maxLength: 48 }, title: { type: "string", maxLength: 160 } } },
    idempotency: "operation-id"
  },
  {
    name: "propose_event_candidate",
    label: "准备事件候选",
    classification: "proposal",
    owner: "tianyi-context",
    requiredPermission: "author-approval",
    scope: "current-project",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string", maxLength: 160 } } },
    idempotency: "operation-id"
  },
  {
    name: "submit_event_graph_candidate",
    label: "提交事件关系候选",
    classification: "proposal",
    owner: "story-control-surface",
    requiredPermission: "author-approval",
    scope: "current-project",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["sourceEventId", "targetEventId", "relationTypeId"], properties: { sourceEventId: { type: "string", maxLength: 160 }, targetEventId: { type: "string", maxLength: 160 }, relationTypeId: { type: "string", maxLength: 160 }, direction: { type: "string", maxLength: 16 } } },
    idempotency: "operation-id"
  },
  {
    name: "suggest_context_adjustment",
    label: "建议调整引用范围",
    classification: "proposal",
    owner: "tianyi-context",
    requiredPermission: "author-approval",
    scope: "current-session",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["reason"], properties: { reason: { type: "string", maxLength: 500 } } },
    idempotency: "operation-id"
  },
  {
    name: "find_duplicate_candidates",
    label: "查找重复候选",
    classification: "proposal",
    owner: "story-control-surface",
    requiredPermission: "author-approval",
    scope: "current-project",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["candidateId"], properties: { candidateId: { type: "string", maxLength: 96 } } },
    idempotency: "operation-id"
  },
  {
    name: "prepare_owner_handoff",
    label: "准备候选交给现有资料审核",
    classification: "proposal",
    owner: "story-control-surface",
    requiredPermission: "author-approval",
    scope: "current-project",
    timeoutMs: 5_000,
    inputSchema: { type: "object", required: ["candidateId"], properties: { candidateId: { type: "string", maxLength: 96 } } },
    idempotency: "operation-id"
  }
]);

export type TianyiAgentRuntimePersistence = {
  appendEvent(event: TianyiAgentRuntimeEvent): Promise<{ alreadyCompleted: boolean; receiptId: string }>;
  readEvents(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<TianyiAgentRuntimeEvent[]>;
  /** The Archive owner may expose a read-only current-work-version discovery. */
  findLatestStoryIntakeRun?(input: { projectId: string; workVersionId: string }): Promise<TianyiAgentRuntimeEvent | null>;
  /** Read-only discovery of every current-work-version Story Intake run. */
  listStoryIntakeRuns?(input: { projectId: string; workVersionId: string }): Promise<TianyiAgentRuntimeEvent[]>;
};

export type TianyiAgentRuntimeDependencies = {
  now?: () => string;
  persistence: TianyiAgentRuntimePersistence;
  buildContextManifest(input: { projectId: string; workVersionId: string; sessionId: string; currentPage: string; task: string; contextRequest?: Record<string, unknown> }): Promise<TianyiAgentContextManifest>;
  runProvider?(input: { runId: string; attemptId: string; projectId: string; workVersionId: string; sessionId: string; currentPage: string; task: string; contextManifest: TianyiAgentContextManifest; steering: string[]; maxOutputTokens: number; retry: boolean; signal?: AbortSignal; onExecutionIdentity(identity: { providerId: string; profileId: string; modelId: string }): Promise<void>; authorizeTool(call: { toolName: string; arguments: Record<string, unknown> }): Promise<{ allowed: boolean; reason?: string; approvalRequired?: boolean; approvalReceiptId?: string }>; onEvent(event: AgentRuntimeStreamEvent): Promise<void> }): Promise<AgentRuntimeResult & { providerId: string; profileId: string; modelId: string; responseModelId: string | null; storyIntakeEnvelope?: StoryIntakeEnvelope | null }>;
  cancelProvider?(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<boolean> | boolean;
  fixtureResponse?(input: { task: string; contextManifest: TianyiAgentContextManifest; steering: string[] }): Promise<{ text: string; candidates: TianyiAgentCandidate[] }>;
  handoffCandidate?(input: { projectId: string; sessionId: string; runId: string; candidate: TianyiAgentCandidate; operationId: string }): Promise<{ owner: string; id: string; revision: number | null }>;
  confirmStoryIntakeCandidate?(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidate: StoryIntakeCandidate; envelope: StoryIntakeEnvelope; operationId: string; expectedTargetObjectId?: string }): Promise<NonNullable<StoryIntakeCandidate["formalApplication"]>>;
};

export type TianyiAgentRuntimePort = {
  startRun(input: { projectId: string; workVersionId: string; sessionId: string; task: string; currentPage: string; contextRequest?: Record<string, unknown>; permissionProfile?: TianyiAgentPermissionProfile; operationId: string }): Promise<TianyiAgentRunProjection>;
  continueRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; signal?: AbortSignal; onEvent?(event: TianyiAgentStreamEvent): Promise<void> | void }): Promise<TianyiAgentRunProjection>;
  steerRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; instruction: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  approveStep(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; stepId: string; operationId: string; signal?: AbortSignal }): Promise<TianyiAgentRunProjection>;
  rejectStep(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; stepId: string; reason?: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  pauseRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  resumeRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; signal?: AbortSignal }): Promise<TianyiAgentRunProjection>;
  cancelRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; operationId: string; reason?: string }): Promise<TianyiAgentRunProjection>;
  recoverRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection | null>;
  getRunProjection(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection | null>;
  findLatestStoryIntakeRun(input: { projectId: string; workVersionId: string }): Promise<TianyiAgentRunProjection | null>;
  listStoryIntakeRuns(input: { projectId: string; workVersionId: string }): Promise<TianyiAgentRunProjection[]>;
  readRunEvents(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<TianyiAgentRuntimeEvent[]>;
  decideStoryIntakeCandidate(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidateId: string; lifecycleStatus: StoryIntakeLifecycleStatus; operationId: string; expectedTargetObjectId?: string }): Promise<TianyiAgentRunProjection>;
  recordStoryIntakeApplication(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidateId: string; application: NonNullable<StoryIntakeCandidate["formalApplication"]>; operationId: string }): Promise<TianyiAgentRunProjection>;
  undoStoryIntakeApplication(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidateId: string; receiptId: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  rebaseStoryIntakeAfterUndo(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; baseVersion: StoryIntakeBaseVersion; operationId: string }): Promise<TianyiAgentRunProjection>;
};

export type AgentRuntimePort = TianyiAgentRuntimePort;

export function createTianyiAgentRuntimePort(dependencies: TianyiAgentRuntimeDependencies): AgentRuntimePort & { readonly runtimeId: "tianyi.agent-runtime"; readonly runtimeVersion: "r0.6"; handoffCandidate(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidateId: string; operationId: string }): Promise<TianyiAgentRunProjection> } {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const cache = new Map<string, TianyiAgentRunProjection>();
  const saveQueues = new Map<string, Promise<void>>();

  async function load(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection | null> {
    const key = runKey(input.projectId, input.workVersionId, input.sessionId, input.runId);
    const current = cache.get(key);
    if (current) return structuredClone(current);
    const events = await dependencies.persistence.readEvents(input);
    const latestEvent = events.at(-1);
    const latest = latestEvent ? normalizeRecoveredProjection(latestEvent.projection, input.workVersionId) : null;
    if (latest && latest.workVersionId !== input.workVersionId) return null;
    if (latest) cache.set(key, latest);
    return latest ? structuredClone(latest) : null;
  }

  async function findLatestStoryIntakeRun(input: { projectId: string; workVersionId: string }): Promise<TianyiAgentRunProjection | null> {
    const event = await dependencies.persistence.findLatestStoryIntakeRun?.(input);
    if (!event) return null;
    const projection = normalizeRecoveredProjection(event.projection, input.workVersionId);
    const envelope = projection.storyIntakeEnvelope;
    if (!envelope || projection.projectId !== input.projectId || projection.workVersionId !== input.workVersionId || projection.sessionId !== envelope.sessionId || projection.runId !== envelope.runId || envelope.projectId !== input.projectId || envelope.baseVersion.workVersionId !== input.workVersionId) return null;
    cache.set(runKey(projection.projectId, projection.workVersionId, projection.sessionId, projection.runId), projection);
    return structuredClone(projection);
  }

  async function listStoryIntakeRuns(input: { projectId: string; workVersionId: string }): Promise<TianyiAgentRunProjection[]> {
    const latest = dependencies.persistence.listStoryIntakeRuns ? null : await dependencies.persistence.findLatestStoryIntakeRun?.(input);
    const events = dependencies.persistence.listStoryIntakeRuns ? await dependencies.persistence.listStoryIntakeRuns(input) : latest ? [latest] : [];
    const projections: TianyiAgentRunProjection[] = [];
    for (const event of events) {
      if (!event) continue;
      const projection = normalizeRecoveredProjection(event.projection, input.workVersionId);
      const envelope = projection.storyIntakeEnvelope;
      if (!envelope || projection.projectId !== input.projectId || projection.workVersionId !== input.workVersionId || projection.sessionId !== envelope.sessionId || projection.runId !== envelope.runId || envelope.projectId !== input.projectId || envelope.baseVersion.workVersionId !== input.workVersionId) continue;
      cache.set(runKey(projection.projectId, projection.workVersionId, projection.sessionId, projection.runId), projection);
      projections.push(structuredClone(projection));
    }
    return projections.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || `${right.sessionId}:${right.runId}`.localeCompare(`${left.sessionId}:${left.runId}`));
  }

  async function save(projection: TianyiAgentRunProjection, operationId: string, kind: TianyiAgentRuntimeEvent["kind"] = "snapshot", streamEvent?: TianyiAgentStreamEvent): Promise<TianyiAgentRunProjection> {
    const key = runKey(projection.projectId, projection.workVersionId, projection.sessionId, projection.runId);
    const previous = saveQueues.get(key) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(() => saveUnlocked(projection, operationId, kind, streamEvent));
    const tail = task.then(() => undefined, () => undefined);
    saveQueues.set(key, tail);
    try {
      return await task;
    } finally {
      if (saveQueues.get(key) === tail) saveQueues.delete(key);
    }
  }

  async function saveUnlocked(projection: TianyiAgentRunProjection, operationId: string, kind: TianyiAgentRuntimeEvent["kind"], streamEvent?: TianyiAgentStreamEvent): Promise<TianyiAgentRunProjection> {
    const key = runKey(projection.projectId, projection.workVersionId, projection.sessionId, projection.runId);
    const current = cache.get(key);
    // A run can receive a buffered stream completion after the author has
    // successfully cancelled it.  The stream was started from an older
    // projection, so appending that projection would otherwise resurrect the
    // run as awaiting_author/completed.  Cancellation is terminal for this
    // attempt; a new attempt must use the explicit resume/retry route and a
    // new persisted transition instead.
    if (current?.status === "cancelled" && projection.status !== "cancelled") return structuredClone(current);
    const recordedAt = now();
    const receiptId = deterministicId("receipt.tianyi-agent-runtime", projection.runId, operationId, String(projection.revision + 1));
    const next = structuredClone({
      ...projection,
      revision: projection.revision + 1,
      updatedAt: recordedAt,
      receipts: [...projection.receipts, {
        receiptId,
        kind: "runtime" as const,
        label: kind === "snapshot" ? "运行状态回执" : kind === "stream" ? "流式事件回执" : kind === "tool-call" ? "工具回执" : kind === "approval" ? "审批回执" : kind === "steering" ? "纠正回执" : "运行回执",
        operationId,
        recordedAt
      }].slice(-4)
    });
    const receipt = await dependencies.persistence.appendEvent({ version: "tianyi-agent-runtime-event/v1", runId: next.runId, workVersionId: next.workVersionId, operationId, kind, ...(streamEvent ? { streamEvent } : {}), projection: next, recordedAt });
    if (receipt.alreadyCompleted) {
      const existing = await load({ projectId: next.projectId, workVersionId: next.workVersionId, sessionId: next.sessionId, runId: next.runId });
      if (existing) return existing;
    }
    cache.set(key, next);
    return structuredClone(next);
  }

  async function requireRun(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection> {
    const run = await load(input);
    if (!run) throw new Error("Agent 运行尚未开始。");
    if (run.projectId !== input.projectId || run.workVersionId !== input.workVersionId || run.sessionId !== input.sessionId) throw new Error("Agent Run 不属于当前项目、工作版本或 Session。");
    return run;
  }

  function planFor(runId: string, storyIntake: boolean): TianyiAgentPlanStep[] {
    if (storyIntake) return [
      { stepId: `${runId}.context`, title: "读取本轮已保存的作者原话", kind: "read-context", classification: "read", requiredPermission: "none", status: "pending", toolName: "read_context_manifest", error: null },
      { stepId: `${runId}.analysis`, title: "Pi Agent 结构化识别", kind: "model-analysis", classification: "read", requiredPermission: "none", status: "pending", error: null },
      { stepId: `${runId}.candidates`, title: "形成带精确来源的故事候选", kind: "candidate-proposal", classification: "proposal", requiredPermission: "none", status: "pending", toolName: "propose_story_intake", error: null }
    ];
    return [
      { stepId: `${runId}.context`, title: "确认当前引用范围", kind: "read-context", classification: "read", requiredPermission: "author-approval", status: "awaiting_author", toolName: "read_context_manifest", error: null },
      { stepId: `${runId}.analysis`, title: "基于来源分析任务", kind: "model-analysis", classification: "read", requiredPermission: "none", status: "pending", error: null },
      { stepId: `${runId}.candidates`, title: "形成带来源的候选", kind: "candidate-proposal", classification: "proposal", requiredPermission: "author-approval", status: "pending", toolName: "prepare_owner_handoff", error: null }
    ];
  }

  async function startRun(input: Parameters<TianyiAgentRuntimePort["startRun"]>[0]): Promise<TianyiAgentRunProjection> {
    const task = normalizeTask(input.task);
    const currentPage = normalizeCurrentPage(input.currentPage);
    const permissionProfile = normalizePermissionProfile(input.permissionProfile);
    const workVersionId = normalizeWorkVersionId(input.workVersionId);
    const storyIntake = isStoryIntakeContextRequest(input.contextRequest);
    const runId = deterministicId("tianyi-agent-run", input.projectId, workVersionId, input.sessionId, input.operationId);
    const existing = await load({ projectId: input.projectId, workVersionId, sessionId: input.sessionId, runId });
    if (existing) return existing;
    const timestamp = now();
    const projection: TianyiAgentRunProjection = {
      version: "tianyi-agent-run-projection/v1", runId, projectId: input.projectId, workVersionId, sessionId: input.sessionId, task,
      currentPage, contextRequest: input.contextRequest ?? null, status: "planning", contextManifest: null, resultSummary: null,
      model: { providerId: null, profileId: null, modelId: null, runtime: dependencies.runProvider ? "pi" : "fixture" },
      budget: { maxProviderCalls: storyIntake ? 3 : 1, maxOutputTokens: storyIntake ? 1_024 : 512, providerCalls: 0, estimatedTokens: 0 },
      observability: { traceId: null, latencyMs: null, promptTokens: null, completionTokens: null, totalTokens: null, streamEventCount: 0 },
      executionIdentity: { requestedProviderId: null, requestedModelId: null, responseModelId: null, runId, stepId: null },
      permissionProfile, plan: planFor(runId, storyIntake), toolCalls: [], approvals: [], steering: [], candidates: [], storyIntakeEnvelope: null, receipts: [], stopReason: null, error: null, revision: 0, createdAt: timestamp, updatedAt: timestamp
    };
    return save({ ...projection, status: storyIntake ? "running" : "awaiting_author" }, input.operationId);
  }

  async function executeContextStep(run: TianyiAgentRunProjection, operationId: string): Promise<TianyiAgentRunProjection> {
    const step = run.plan.find((item) => item.kind === "read-context");
    if (!step) return run;
    const manifest = await dependencies.buildContextManifest({ projectId: run.projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, currentPage: run.currentPage, task: run.task, contextRequest: run.contextRequest ?? undefined });
    if (manifest.projectId !== run.projectId || manifest.workVersionId !== run.workVersionId || manifest.sessionId !== run.sessionId) throw new Error("Agent 上下文投影跨越了项目、工作版本或 Session 边界。");
    // The host prepares this receipt locally.  Pi receives no read tool and
    // cannot expand the allowed scope after the author has approved it.
    const toolSpecs = [["read_context_manifest", {
      manifestVersion: manifest.version,
      snapshotId: manifest.simulationContextPack?.snapshotId ?? null,
      sourceCount: manifest.simulationContextPack?.sources.length ?? 0,
      estimatedTokens: manifest.simulationContextPack?.estimatedTokens ?? manifest.estimatedTokens
    }]] as const;
    const calls = toolSpecs.map(([toolName, output]) => {
      const callId = deterministicId("tianyi-agent-tool", run.runId, toolName, operationId);
      const existingCall = run.toolCalls.find((call) => call.callId === callId);
      return existingCall ?? { callId, toolName, classification: "read" as const, status: "completed" as const, arguments: {}, output, receiptId: deterministicId("receipt.tianyi-agent-tool", callId), error: null, startedAt: now(), completedAt: now() };
    });
    const callIds = new Set(calls.map((call) => call.callId));
    const next = { ...run, contextManifest: manifest, toolCalls: [...run.toolCalls.filter((item) => !callIds.has(item.callId)), ...calls], plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "completed" as const } : item), status: "running" as const };
    return save(next, operationId, "tool-call");
  }

  async function executeAnalysis(run: TianyiAgentRunProjection, operationId: string, signal?: AbortSignal, onEvent?: (event: TianyiAgentStreamEvent) => Promise<void> | void): Promise<TianyiAgentRunProjection> {
    if (!run.contextManifest) throw new Error("必须先读取当前引用范围。");
    const step = run.plan.find((item) => item.kind === "model-analysis");
    if (!step || step.status === "completed") return run;
    if (signal?.aborted) throw abortError();
    let text = "";
    let runtime: TianyiAgentRunProjection["model"]["runtime"] = "fixture";
    let providerCalls = 0;
    if (dependencies.runProvider && run.budget.providerCalls < run.budget.maxProviderCalls) {
      try {
        const result = await dependencies.runProvider({
          runId: run.runId,
          attemptId: operationId,
          projectId: run.projectId,
          workVersionId: run.workVersionId,
          sessionId: run.sessionId,
          currentPage: run.currentPage,
          task: run.task,
          contextManifest: run.contextManifest,
          steering: run.steering.map((item) => item.instruction),
          maxOutputTokens: run.budget.maxOutputTokens,
          retry: run.status === "failed" || run.budget.providerCalls > 0 || run.toolCalls.some((call) => call.status === "approved"),
          signal,
          async onExecutionIdentity(identity) {
            run = await save({
              ...run,
              model: { providerId: identity.providerId, profileId: identity.profileId, modelId: identity.modelId, runtime: "pi" },
              executionIdentity: { ...run.executionIdentity, requestedProviderId: identity.providerId, requestedModelId: identity.modelId, stepId: step.stepId }
            }, deterministicId("operation.tianyi-agent.execution-identity", run.runId, operationId));
          },
          async authorizeTool(call) {
            const definition = validateTianyiAgentToolCall(call);
            if (definition.name === "read_context_manifest") {
              const approval = run.approvals.find((item) => item.stepId === `${run.runId}.context` && item.decision === "approved");
              return approval ? { allowed: true, approvalReceiptId: approval.receiptId } : { allowed: false, reason: "当前引用范围尚未获得作者批准。", approvalRequired: true };
            }
            if (definition.name === "propose_story_intake" && run.currentPage === "/tianyi" && run.contextManifest.storyIntakeSource) return { allowed: true };
            if (definition.classification === "read") return { allowed: true };
            const matching = run.toolCalls.find((item) => item.toolName === call.toolName && stableArguments(item.arguments) === stableArguments(call.arguments));
            if (matching?.status === "approved" && matching.receiptId) return { allowed: true, approvalReceiptId: matching.receiptId };
            if (matching?.status === "rejected") return { allowed: false, reason: "作者已拒绝这次工具调用。" };
            return { allowed: false, reason: "这次受控产品工具必须先获得作者审批。", approvalRequired: true };
          },
          async onEvent(event) {
            const toolCalls = event.type === "tool-call-end"
              ? run.toolCalls.map((call) => call.toolName === event.toolName && call.status === "approved" ? { ...call, status: event.isError ? "failed" as const : "completed" as const, error: event.isError ? "受控产品工具执行失败。" : null, completedAt: event.recordedAt } : call)
              : run.toolCalls;
            run = await save({
              ...run,
              toolCalls,
              executionIdentity: event.type === "response-metadata" ? { ...run.executionIdentity, responseModelId: event.responseModelId } : run.executionIdentity,
              observability: { ...run.observability, streamEventCount: run.observability.streamEventCount + 1 }
            }, `${operationId}.stream.${event.sequence}`, "stream", event);
            await onEvent?.(event);
          }
        });
        text = result.text;
        providerCalls = result.providerCalls;
        runtime = "pi";
        run = {
          ...run,
          model: { providerId: result.providerId, profileId: result.profileId, modelId: result.modelId, runtime },
          budget: { ...run.budget, providerCalls: run.budget.providerCalls + providerCalls },
          observability: { ...run.observability, traceId: result.traceId, latencyMs: result.latencyMs, ...(result.usage ?? { promptTokens: null, completionTokens: null, totalTokens: null }) },
          executionIdentity: { requestedProviderId: result.providerId, requestedModelId: result.modelId, responseModelId: result.responseModelId, runId: run.runId, stepId: step.stepId },
          storyIntakeEnvelope: result.storyIntakeEnvelope ?? run.storyIntakeEnvelope,
          error: null
        };
      } catch (cause) {
        const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
        if (!(cause instanceof Error && cause.name === "ProviderUnavailable") && code !== "provider-unavailable") throw cause;
        throw cause;
      }
    }
    const storyIntake = Boolean(run.contextManifest.storyIntakeSource);
    if (!text && !storyIntake && dependencies.fixtureResponse) {
      const result = await dependencies.fixtureResponse({ task: run.task, contextManifest: run.contextManifest, steering: run.steering.map((item) => item.instruction) });
      text = result.text;
      run = { ...run, candidates: result.candidates };
    }
    if (storyIntake && !run.storyIntakeEnvelope) {
      const error = Object.assign(new Error("Pi Agent 没有返回通过 Schema 校验的结构化故事候选。"), { code: "invalid-tool-call", retryable: true });
      throw error;
    }
    const candidates = storyIntake ? run.candidates : run.candidates.length ? run.candidates : parseCandidateText(text, run.contextManifest);
    const next = { ...run, resultSummary: text.trim().slice(0, 2_400) || "分析已完成；具体候选仍需作者审查。", candidates, plan: run.plan.map((item) => storyIntake && (item.kind === "model-analysis" || item.kind === "candidate-proposal") ? { ...item, status: "completed" as const } : item.stepId === step.stepId ? { ...item, status: "completed" as const } : item), status: storyIntake ? "completed" as const : "awaiting_author" as const, stopReason: storyIntake ? "结构化故事候选已生成，等待作者审查或送入待归档。" : run.stopReason, budget: { ...run.budget, estimatedTokens: Math.min(32_000, run.budget.estimatedTokens + Math.ceil(text.length / 4)) } };
    return save(next, operationId);
  }

  async function continueRun(input: Parameters<TianyiAgentRuntimePort["continueRun"]>[0]): Promise<TianyiAgentRunProjection> {
    let run = await requireRun(input);
    if (["completed", "cancelled"].includes(run.status)) return run;
    try {
      if (run.status === "paused") run = { ...run, status: "running", error: null };
      if (run.status === "awaiting_author" && run.plan.some((step) => step.status === "awaiting_author")) return run;
      if (!run.contextManifest) return await executeContextStep(run, input.operationId);
      if (run.plan.some((step) => step.kind === "model-analysis" && step.status !== "completed")) return await executeAnalysis(run, input.operationId, input.signal, input.onEvent);
      const next = { ...run, status: "completed" as const, stopReason: "作者可继续审查候选；本次 Agent 分析已完成。" };
      return save(next, input.operationId);
    } catch (cause) {
      // Provider callbacks durably save execution identity and stream progress.
      // Reload that latest projection before recording a terminal failure so an
      // exception cannot overwrite already-persisted evidence with stale state.
      const latest = await load({ projectId: run.projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, runId: run.runId });
      if (latest && latest.revision > run.revision) run = latest;
      const message = cause instanceof Error ? cause.message : "Agent 运行未完成。";
      const source = cause as { code?: unknown; retryable?: unknown; toolCall?: { toolName?: unknown; arguments?: unknown } } | null;
      const code = typeof source?.code === "string" ? source.code : "unknown";
      if (code === "tool-approval-required" && source?.toolCall && typeof source.toolCall.toolName === "string" && source.toolCall.arguments && typeof source.toolCall.arguments === "object" && !Array.isArray(source.toolCall.arguments)) {
        const definition = validateTianyiAgentToolCall({ toolName: source.toolCall.toolName, arguments: source.toolCall.arguments });
        const callId = deterministicId("tianyi-agent-provider-tool", run.runId, definition.name, stableArguments(source.toolCall.arguments as Record<string, unknown>));
        const stepId = `${run.runId}.tool.${callId}`;
        const existingCall = run.toolCalls.find((item) => item.callId === callId);
        const toolCall: TianyiAgentToolCall = existingCall ?? { callId, toolName: definition.name, classification: definition.classification, status: "requested", arguments: structuredClone(source.toolCall.arguments as Record<string, unknown>), output: null, receiptId: null, error: null, startedAt: now(), completedAt: null };
        const step: TianyiAgentPlanStep = { stepId, title: definition.label, kind: "product-tool", classification: definition.classification, requiredPermission: "author-approval", status: "awaiting_author", toolName: definition.name, error: null };
        return save({ ...run, status: "awaiting_author", toolCalls: [...run.toolCalls.filter((item) => item.callId !== callId), toolCall], plan: [...run.plan.filter((item) => item.stepId !== stepId), step], stopReason: "受控产品工具正在等待作者审批。", error: null }, input.operationId, "tool-call");
      }
      const category: NonNullable<TianyiAgentRunProjection["error"]>["category"] = input.signal?.aborted || (cause instanceof Error && cause.name === "AbortError") || code === "cancelled" ? "cancelled" : cause instanceof Error && cause.name === "ProviderUnavailable" || code === "provider-unavailable" ? "provider-unavailable" : code === "provider-failed" ? "provider-failed" : code === "invalid-tool-call" ? "invalid-tool-call" : "tool-failed";
      if (category === "cancelled") {
        const latest = await load({ projectId: input.projectId, workVersionId: input.workVersionId, sessionId: input.sessionId, runId: input.runId });
        if (latest?.status === "cancelled") return latest;
      }
      const retryable = category !== "cancelled" && source?.retryable !== false;
      return save({ ...run, status: category === "cancelled" ? "paused" : "failed", stopReason: category === "cancelled" ? "作者停止了本次运行。" : null, error: { category, code, message, retryable, retryBoundary: retryable ? "author-explicit" : "none" } }, input.operationId);
    }
  }

  async function approveStep(input: Parameters<TianyiAgentRuntimePort["approveStep"]>[0]): Promise<TianyiAgentRunProjection> {
    let run = await requireRun(input);
    const step = run.plan.find((item) => item.stepId === input.stepId);
    if (!step) throw new Error("Agent 步骤不存在。");
    const previous = run.approvals.find((item) => item.stepId === step.stepId && item.decision === "approved");
    const approval = previous ?? { stepId: step.stepId, decision: "approved" as const, operationId: input.operationId, receiptId: deterministicId("receipt.tianyi-agent-approval", run.runId, step.stepId), recordedAt: now() };
    run = { ...run, approvals: [...run.approvals.filter((item) => item.stepId !== step.stepId), approval], plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "approved" as const } : item), toolCalls: step.kind === "product-tool" ? run.toolCalls.map((call) => call.toolName === step.toolName && call.status === "requested" ? { ...call, status: "approved" as const, receiptId: approval.receiptId } : call) : run.toolCalls, status: "running", error: null };
    run = await save(run, input.operationId, "approval");
    return continueRun({ projectId: input.projectId, workVersionId: input.workVersionId, sessionId: input.sessionId, runId: input.runId, operationId: `${input.operationId}.continue`, signal: input.signal });
  }

  async function rejectStep(input: Parameters<TianyiAgentRuntimePort["rejectStep"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    const step = run.plan.find((item) => item.stepId === input.stepId);
    if (!step) throw new Error("Agent 步骤不存在。");
    const next = { ...run, plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "rejected" as const, error: input.reason || "作者拒绝了这一步。" } : item), toolCalls: step.kind === "product-tool" ? run.toolCalls.map((call) => call.toolName === step.toolName && call.status === "requested" ? { ...call, status: "rejected" as const, error: input.reason || "作者拒绝了这一步。", completedAt: now() } : call) : run.toolCalls, status: "paused" as const, stopReason: input.reason || "作者拒绝了这一步。" };
    return save(next, input.operationId, "approval");
  }

  async function steerRun(input: Parameters<TianyiAgentRuntimePort["steerRun"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (["completed", "cancelled"].includes(run.status)) return run;
    const instruction = normalizeTask(input.instruction);
    const steering = run.steering.some((item) => item.operationId === input.operationId) ? run.steering : [...run.steering, { instruction, operationId: input.operationId, recordedAt: now() }];
    return save({ ...run, steering, status: run.status === "paused" ? "paused" : "awaiting_author", stopReason: null }, input.operationId, "steering");
  }

  async function pauseRun(input: Parameters<TianyiAgentRuntimePort["pauseRun"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (["completed", "cancelled"].includes(run.status)) return run;
    return save({ ...run, status: "paused", stopReason: "作者暂停了运行。" }, input.operationId);
  }

  async function resumeRun(input: Parameters<TianyiAgentRuntimePort["resumeRun"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (run.status !== "paused") return run;
    const next = await save({ ...run, status: "running", stopReason: null, error: null }, input.operationId);
    return continueRun({ ...input, operationId: `${input.operationId}.continue`, runId: next.runId });
  }

  async function cancelRun(input: Parameters<TianyiAgentRuntimePort["cancelRun"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    // A completion that is already durable wins a late cancel request.  This
    // is distinct from the in-flight cancellation path, which must become a
    // terminal cancelled projection.
    if (run.status === "completed" || run.status === "cancelled") return run;
    await dependencies.cancelProvider?.({ projectId: input.projectId, workVersionId: input.workVersionId, sessionId: input.sessionId, runId: input.runId });
    return save({ ...run, status: "cancelled", stopReason: input.reason || "作者取消了运行。", error: { category: "cancelled", code: "cancelled", message: input.reason || "作者取消了运行。", retryable: false, retryBoundary: "none" } }, input.operationId);
  }

  async function handoffCandidate(input: { projectId: string; workVersionId: string; sessionId: string; runId: string; candidateId: string; operationId: string }): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    const candidate = run.candidates.find((item) => item.candidateId === input.candidateId);
    if (!candidate) throw new Error("Agent 候选不存在。");
    if (candidate.state === "handed-off" && candidate.ownerReceipt) return run;
    if (!dependencies.handoffCandidate) throw new Error("该候选暂时没有可用的现有 Owner。");
    const receipt = await dependencies.handoffCandidate({ projectId: input.projectId, sessionId: input.sessionId, runId: input.runId, candidate, operationId: input.operationId });
    const next = { ...run, candidates: run.candidates.map((item) => item.candidateId === candidate.candidateId ? { ...item, state: "handed-off" as const, ownerReceipt: receipt } : item) };
    return save(next, input.operationId, "receipt");
  }

  async function decideStoryIntakeCandidate(input: Parameters<TianyiAgentRuntimePort["decideStoryIntakeCandidate"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (!run.storyIntakeEnvelope) throw new Error("Story Intake 候选包尚未生成。");
    const candidate = run.storyIntakeEnvelope.candidates.find((item) => item.candidateId === input.candidateId);
    if (!candidate) throw new Error("Story Intake 候选不存在。");
    if (input.lifecycleStatus === "confirmed" && candidate.lifecycleStatus === "confirmed" && candidate.formalApplication) return run;
    const storyIntakeEnvelope = input.lifecycleStatus === "confirmed"
      ? confirmStoryIntakeCandidate(run.storyIntakeEnvelope, input.candidateId, await (dependencies.confirmStoryIntakeCandidate?.({ projectId: input.projectId, workVersionId: input.workVersionId, sessionId: input.sessionId, runId: input.runId, candidate, envelope: run.storyIntakeEnvelope, operationId: input.operationId, expectedTargetObjectId: input.expectedTargetObjectId }) ?? Promise.reject(new Error("当前没有可用的 Story Intake 正式 Writer 适配器。"))))
      : updateStoryIntakeCandidateLifecycle(run.storyIntakeEnvelope, input.candidateId, input.lifecycleStatus);
    return save({ ...run, storyIntakeEnvelope }, input.operationId, "receipt");
  }

  async function recordStoryIntakeApplication(input: Parameters<TianyiAgentRuntimePort["recordStoryIntakeApplication"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (!run.storyIntakeEnvelope) throw new Error("Story Intake 候选包尚未生成。");
    const storyIntakeEnvelope = confirmStoryIntakeCandidate(run.storyIntakeEnvelope, input.candidateId, input.application);
    return save({ ...run, storyIntakeEnvelope }, input.operationId, "receipt");
  }

  async function undoStoryIntakeApplication(input: Parameters<TianyiAgentRuntimePort["undoStoryIntakeApplication"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (!run.storyIntakeEnvelope) throw new Error("Story Intake 候选包尚未生成。");
    const storyIntakeEnvelope = undoStoryIntakeCandidateApplication(run.storyIntakeEnvelope, input.candidateId, input.receiptId);
    return save({ ...run, storyIntakeEnvelope }, input.operationId, "receipt");
  }

  async function rebaseStoryIntakeAfterUndo(input: Parameters<TianyiAgentRuntimePort["rebaseStoryIntakeAfterUndo"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    if (!run.storyIntakeEnvelope) throw new Error("Story Intake 候选包尚未生成。");
    const storyIntakeEnvelope = rebaseStoryIntakeEnvelopeAfterUndo(run.storyIntakeEnvelope, input.baseVersion);
    return save({ ...run, storyIntakeEnvelope }, input.operationId, "receipt");
  }

  const readRunEvents = (input: { projectId: string; workVersionId: string; sessionId: string; runId: string }) => dependencies.persistence.readEvents(input);
  return Object.freeze({ runtimeId: "tianyi.agent-runtime" as const, runtimeVersion: "r0.6" as const, startRun, continueRun, steerRun, approveStep, rejectStep, pauseRun, resumeRun, cancelRun, recoverRun: load, getRunProjection: load, findLatestStoryIntakeRun, listStoryIntakeRuns, readRunEvents, handoffCandidate, decideStoryIntakeCandidate, recordStoryIntakeApplication, undoStoryIntakeApplication, rebaseStoryIntakeAfterUndo });
}

function runKey(projectId: string, workVersionId: string, sessionId: string, runId: string): string { return `${projectId}:${workVersionId}:${sessionId}:${runId}`; }
function normalizeTask(value: unknown): string { const text = typeof value === "string" ? value.trim() : ""; if (!text || text.length > 4_000) throw new Error("Agent 任务不能为空或过长。"); return text; }
function normalizeWorkVersionId(value: unknown): string { const text = typeof value === "string" ? value.trim() : ""; if (!text || text.length > 160 || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/iu.test(text)) throw new Error("Agent 工作版本无效。"); return text; }
function normalizeCurrentPage(value: unknown): string { const page = typeof value === "string" && value.trim() ? value.trim() : "/tianyi"; if (!/^\/(?:tianyi|world|event-line|library|creation|nuwa)(?:[/?#]|$)/u.test(page)) throw new Error("Agent 当前页面不在受控工作区内。"); return page.slice(0, 240); }
function normalizePermissionProfile(value: unknown): TianyiAgentPermissionProfile { return value === undefined || value === null ? "step-by-step" : value === "step-by-step" || value === "conservative" || value === "proactive" ? value : (() => { throw new Error("Agent 权限档案不受支持。"); })(); }
function deterministicId(prefix: string, ...parts: string[]): string { return `${prefix}.${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`; }
function stableArguments(value: Record<string, unknown>): string { return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => { result[key] = value[key]; return result; }, {})); }
function abortError(): Error { const error = new Error("Provider 请求已停止。"); error.name = "AbortError"; return error; }
function normalizeRecoveredProjection(projection: TianyiAgentRunProjection, workVersionId: string): TianyiAgentRunProjection {
  const legacy = projection as TianyiAgentRunProjection & { workVersionId?: string; observability?: TianyiAgentRunProjection["observability"] };
  return {
    ...projection,
    workVersionId: legacy.workVersionId ?? workVersionId,
    contextManifest: projection.contextManifest ? { ...projection.contextManifest, workVersionId: projection.contextManifest.workVersionId ?? workVersionId } : null,
    observability: legacy.observability ?? { traceId: null, latencyMs: null, promptTokens: null, completionTokens: null, totalTokens: null, streamEventCount: 0 },
    executionIdentity: projection.executionIdentity ?? { requestedProviderId: projection.model.providerId, requestedModelId: projection.model.modelId, responseModelId: null, runId: projection.runId, stepId: null },
    storyIntakeEnvelope: migrateStoryIntakeEnvelopeV1(projection.storyIntakeEnvelope ?? null)
  };
}
function isStoryIntakeContextRequest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as { storyIntake?: unknown };
  return Boolean(request.storyIntake && typeof request.storyIntake === "object" && !Array.isArray(request.storyIntake));
}
function parseCandidateText(text: string, manifest: TianyiAgentContextManifest): TianyiAgentCandidate[] {
  const title = text.trim().slice(0, 80) || "待作者确认的分析建议";
  return [{ candidateId: deterministicId("candidate.tianyi-agent", title, manifest.sessionId), kind: "unknown", title, summary: text.trim().slice(0, 800) || "当前没有可安全归类的建议。", sourceRefs: manifest.authorSourceRefs.slice(0, 8), uncertainties: ["候选类型和正式归属仍需作者确认。"], targetOwnerKind: "candidate-only", state: "pending", ownerReceipt: null }];
}

export function validateTianyiAgentToolCall(input: { toolName: string; arguments: unknown }): TianyiAgentToolDefinition {
  const definition = TIANYI_AGENT_TOOL_REGISTRY.find((tool) => tool.name === input.toolName);
  if (!definition) throw new Error("未声明的 Agent 工具已被拒绝。");
  if (!input.arguments || typeof input.arguments !== "object" || Array.isArray(input.arguments)) throw new Error("Agent 工具参数必须是 JSON 对象。");
  const args = input.arguments as Record<string, unknown>;
  if (definition.name === "create_artifact" && !["screenplay", "storyboard", "comic", "motion-comic", "interactive-drama"].includes(String(args.type ?? ""))) throw new Error("Agent 普通产物类型不受支持。");
  if (definition.name === "propose_entity_candidate" && !["character", "item", "location"].includes(String(args.kind ?? ""))) throw new Error("Agent 候选类型没有安全的现有资料 Owner。");
  if (definition.name === "submit_event_graph_candidate") {
    if (args.sourceEventId === args.targetEventId) throw new Error("事件关系候选必须连接两条不同的正式事件。");
    if (args.direction !== undefined && !["forward", "reverse", "both", "none"].includes(String(args.direction))) throw new Error("事件关系方向不受支持。");
  }
  const keys = Object.keys(args);
  const allowed = new Set(Object.keys(definition.inputSchema.properties));
  if (keys.some((key) => !allowed.has(key))) throw new Error("Agent 工具包含未声明字段。");
  if (keys.some((key) => /(?:path|url|shell|command|exec|script|header|token|credential)/iu.test(key))) throw new Error("Agent 工具参数包含未授权的外部执行字段。");
  for (const required of definition.inputSchema.required) if (!(required in args)) throw new Error("Agent 工具缺少必填参数。");
  for (const [key, value] of Object.entries(args)) {
    const schema = definition.inputSchema.properties[key];
    if (schema.type === "string" && typeof value !== "string") throw new Error("Agent 工具参数类型不正确。");
    if (schema.type === "array" && !Array.isArray(value)) throw new Error("Agent 工具参数类型不正确。");
    if (schema.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("Agent 工具参数类型不正确。");
    const size = typeof value === "string" || Array.isArray(value) ? value.length : 0;
    if (schema.maxLength && size > schema.maxLength) throw new Error("Agent 工具参数超出长度限制。");
    if (typeof value === "string" && /(?:https?:\/\/|\\\\|\b(?:bash|sh|zsh|powershell|python|node)\b)/iu.test(value)) throw new Error("Agent 工具参数包含未授权的外部执行内容。");
  }
  return definition;
}

export function compactTianyiAgentContext(input: { manifest: TianyiAgentContextManifest; summary: string; receiptId: string }): TianyiAgentContextManifest {
  const summary = input.summary.trim().slice(0, 1_200);
  if (!summary) throw new Error("上下文压缩摘要不能为空。");
  return { ...structuredClone(input.manifest), compaction: { state: "applied", summaryVersion: input.manifest.compaction.summaryVersion + 1, preservedAnchors: [...new Set([...input.manifest.compaction.preservedAnchors, ...input.manifest.authorSourceRefs])].slice(0, 32), receiptId: input.receiptId }, estimatedTokens: Math.min(input.manifest.estimatedTokens, 2_000) };
}
