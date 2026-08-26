import { createHash } from "node:crypto";

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
};

export type TianyiAgentPlanStep = {
  stepId: string;
  title: string;
  kind: "read-context" | "model-analysis" | "candidate-proposal" | "owner-handoff";
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
  sessionId: string;
  task: string;
  currentPage: string;
  contextRequest: Record<string, unknown> | null;
  status: TianyiAgentRunStatus;
  contextManifest: TianyiAgentContextManifest | null;
  resultSummary: string | null;
  model: { providerId: string | null; profileId: string | null; modelId: string | null; runtime: "fixture" | "provider" | "pi" };
  budget: { maxProviderCalls: number; maxOutputTokens: number; providerCalls: number; estimatedTokens: number };
  permissionProfile: TianyiAgentPermissionProfile;
  plan: TianyiAgentPlanStep[];
  toolCalls: TianyiAgentToolCall[];
  approvals: Array<{ stepId: string; decision: "approved" | "rejected"; operationId: string; receiptId: string; recordedAt: string }>;
  steering: Array<{ instruction: string; operationId: string; recordedAt: string }>;
  candidates: TianyiAgentCandidate[];
  receipts: Array<{ receiptId: string; kind: "tool" | "runtime" | "owner" | "compaction"; label: string; operationId: string; recordedAt: string }>;
  stopReason: string | null;
  error: { category: "provider-unavailable" | "tool-failed" | "invalid-tool-call" | "conflict" | "cancelled" | "unknown"; message: string; retryable: boolean } | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type TianyiAgentRuntimeEvent = {
  version: "tianyi-agent-runtime-event/v1";
  runId: string;
  operationId: string;
  kind: "snapshot" | "tool-call" | "approval" | "steering" | "receipt";
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
  readEvents(input: { projectId: string; sessionId: string; runId: string }): Promise<TianyiAgentRuntimeEvent[]>;
};

export type TianyiAgentRuntimeDependencies = {
  now?: () => string;
  persistence: TianyiAgentRuntimePersistence;
  buildContextManifest(input: { projectId: string; sessionId: string; currentPage: string; task: string; contextRequest?: Record<string, unknown> }): Promise<TianyiAgentContextManifest>;
  runProvider?(input: { runId: string; currentPage: string; task: string; contextManifest: TianyiAgentContextManifest; steering: string[]; maxOutputTokens: number; retry: boolean; signal?: AbortSignal }): Promise<{ providerId: string; profileId: string; modelId: string; text: string; providerCalls: number }>;
  fixtureResponse?(input: { task: string; contextManifest: TianyiAgentContextManifest; steering: string[] }): Promise<{ text: string; candidates: TianyiAgentCandidate[] }>;
  handoffCandidate?(input: { projectId: string; sessionId: string; runId: string; candidate: TianyiAgentCandidate; operationId: string }): Promise<{ owner: string; id: string; revision: number | null }>;
};

export type TianyiAgentRuntimePort = {
  startRun(input: { projectId: string; sessionId: string; task: string; currentPage: string; contextRequest?: Record<string, unknown>; permissionProfile?: TianyiAgentPermissionProfile; operationId: string }): Promise<TianyiAgentRunProjection>;
  continueRun(input: { projectId: string; sessionId: string; runId: string; operationId: string; signal?: AbortSignal }): Promise<TianyiAgentRunProjection>;
  steerRun(input: { projectId: string; sessionId: string; runId: string; instruction: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  approveStep(input: { projectId: string; sessionId: string; runId: string; stepId: string; operationId: string; signal?: AbortSignal }): Promise<TianyiAgentRunProjection>;
  rejectStep(input: { projectId: string; sessionId: string; runId: string; stepId: string; reason?: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  pauseRun(input: { projectId: string; sessionId: string; runId: string; operationId: string }): Promise<TianyiAgentRunProjection>;
  resumeRun(input: { projectId: string; sessionId: string; runId: string; operationId: string; signal?: AbortSignal }): Promise<TianyiAgentRunProjection>;
  cancelRun(input: { projectId: string; sessionId: string; runId: string; operationId: string; reason?: string }): Promise<TianyiAgentRunProjection>;
  recoverRun(input: { projectId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection | null>;
  getRunProjection(input: { projectId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection | null>;
};

export function createPiAgentRuntimeAdapter(dependencies: TianyiAgentRuntimeDependencies): TianyiAgentRuntimePort & { readonly adapterId: "pi.agent-core"; readonly adapterVersion: "r0"; handoffCandidate(input: { projectId: string; sessionId: string; runId: string; candidateId: string; operationId: string }): Promise<TianyiAgentRunProjection> } {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const cache = new Map<string, TianyiAgentRunProjection>();

  async function load(input: { projectId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection | null> {
    const key = runKey(input.projectId, input.sessionId, input.runId);
    const current = cache.get(key);
    if (current) return structuredClone(current);
    const events = await dependencies.persistence.readEvents(input);
    const latest = events.at(-1)?.projection ?? null;
    if (latest) cache.set(key, latest);
    return latest ? structuredClone(latest) : null;
  }

  async function save(projection: TianyiAgentRunProjection, operationId: string, kind: TianyiAgentRuntimeEvent["kind"] = "snapshot"): Promise<TianyiAgentRunProjection> {
    const recordedAt = now();
    const receiptId = deterministicId("receipt.tianyi-agent-runtime", projection.runId, operationId, String(projection.revision + 1));
    const next = structuredClone({
      ...projection,
      revision: projection.revision + 1,
      updatedAt: recordedAt,
      receipts: [...projection.receipts, {
        receiptId,
        kind: "runtime" as const,
        label: kind === "snapshot" ? "运行状态回执" : kind === "tool-call" ? "工具回执" : kind === "approval" ? "审批回执" : kind === "steering" ? "纠正回执" : "运行回执",
        operationId,
        recordedAt
      }]
    });
    const receipt = await dependencies.persistence.appendEvent({ version: "tianyi-agent-runtime-event/v1", runId: next.runId, operationId, kind, projection: next, recordedAt });
    if (receipt.alreadyCompleted) {
      const existing = await load({ projectId: next.projectId, sessionId: next.sessionId, runId: next.runId });
      if (existing) return existing;
    }
    cache.set(runKey(next.projectId, next.sessionId, next.runId), next);
    return structuredClone(next);
  }

  async function requireRun(input: { projectId: string; sessionId: string; runId: string }): Promise<TianyiAgentRunProjection> {
    const run = await load(input);
    if (!run) throw new Error("Agent 运行尚未开始。");
    if (run.projectId !== input.projectId || run.sessionId !== input.sessionId) throw new Error("Agent Run 不属于当前 Session。");
    return run;
  }

  function planFor(runId: string): TianyiAgentPlanStep[] {
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
    const runId = deterministicId("tianyi-agent-run", input.sessionId, input.operationId);
    const existing = await load({ projectId: input.projectId, sessionId: input.sessionId, runId });
    if (existing) return existing;
    const timestamp = now();
    const projection: TianyiAgentRunProjection = {
      version: "tianyi-agent-run-projection/v1", runId, projectId: input.projectId, sessionId: input.sessionId, task,
      currentPage, contextRequest: input.contextRequest ?? null, status: "planning", contextManifest: null, resultSummary: null,
      model: { providerId: null, profileId: null, modelId: null, runtime: "fixture" },
      budget: { maxProviderCalls: 6, maxOutputTokens: 512, providerCalls: 0, estimatedTokens: 0 },
      permissionProfile, plan: planFor(runId), toolCalls: [], approvals: [], steering: [], candidates: [], receipts: [], stopReason: null, error: null, revision: 0, createdAt: timestamp, updatedAt: timestamp
    };
    return save({ ...projection, status: "awaiting_author" }, input.operationId);
  }

  async function executeContextStep(run: TianyiAgentRunProjection, operationId: string): Promise<TianyiAgentRunProjection> {
    const step = run.plan.find((item) => item.kind === "read-context");
    if (!step) return run;
    const manifest = await dependencies.buildContextManifest({ projectId: run.projectId, sessionId: run.sessionId, currentPage: run.currentPage, task: run.task, contextRequest: run.contextRequest ?? undefined });
    const toolSpecs = run.currentPage === "/event-line"
      ? [
        ["read_context_manifest", { manifestVersion: manifest.version, sourceCount: manifest.sourceRefs.length, estimatedTokens: manifest.estimatedTokens }],
        ["read_story_selection", { selectedObjectIds: manifest.selectedObjectIds }],
        ["read_event_line_projection", { sourceRefs: manifest.sourceRefs.map((source) => source.id), narrativeTime: "read-only" }],
        ["read_open_questions", { unresolvedQuestions: manifest.unresolvedQuestions }]
      ] as const
      : [["read_context_manifest", { manifestVersion: manifest.version, sourceCount: manifest.sourceRefs.length, estimatedTokens: manifest.estimatedTokens }]] as const;
    const calls = toolSpecs.map(([toolName, output]) => {
      const callId = deterministicId("tianyi-agent-tool", run.runId, toolName, operationId);
      const existingCall = run.toolCalls.find((call) => call.callId === callId);
      return existingCall ?? { callId, toolName, classification: "read" as const, status: "completed" as const, arguments: {}, output, receiptId: deterministicId("receipt.tianyi-agent-tool", callId), error: null, startedAt: now(), completedAt: now() };
    });
    const callIds = new Set(calls.map((call) => call.callId));
    const next = { ...run, contextManifest: manifest, toolCalls: [...run.toolCalls.filter((item) => !callIds.has(item.callId)), ...calls], plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "completed" as const } : item), status: "running" as const };
    return save(next, operationId, "tool-call");
  }

  async function executeAnalysis(run: TianyiAgentRunProjection, operationId: string, signal?: AbortSignal): Promise<TianyiAgentRunProjection> {
    if (!run.contextManifest) throw new Error("必须先读取当前引用范围。");
    const step = run.plan.find((item) => item.kind === "model-analysis");
    if (!step || step.status === "completed") return run;
    if (signal?.aborted) throw abortError();
    let text = "";
    let runtime: TianyiAgentRunProjection["model"]["runtime"] = "fixture";
    let providerCalls = 0;
    if (dependencies.runProvider && run.budget.providerCalls < run.budget.maxProviderCalls) {
      try {
        const result = await dependencies.runProvider({ runId: run.runId, currentPage: run.currentPage, task: run.task, contextManifest: run.contextManifest, steering: run.steering.map((item) => item.instruction), maxOutputTokens: run.budget.maxOutputTokens, retry: run.budget.providerCalls > 0, signal });
        text = result.text;
        providerCalls = result.providerCalls;
        runtime = "pi";
        run = { ...run, model: { providerId: result.providerId, profileId: result.profileId, modelId: result.modelId, runtime }, budget: { ...run.budget, providerCalls: run.budget.providerCalls + providerCalls } };
      } catch (cause) {
        if (!(cause instanceof Error && cause.name === "ProviderUnavailable") || !dependencies.fixtureResponse) throw cause;
      }
    }
    if (!text && dependencies.fixtureResponse) {
      const result = await dependencies.fixtureResponse({ task: run.task, contextManifest: run.contextManifest, steering: run.steering.map((item) => item.instruction) });
      text = result.text;
      run = { ...run, candidates: result.candidates };
    }
    const candidates = run.candidates.length ? run.candidates : parseCandidateText(text, run.contextManifest);
    const next = { ...run, resultSummary: text.trim().slice(0, 2_400) || "分析已完成；具体候选仍需作者审查。", candidates, plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "completed" as const } : item), status: "awaiting_author" as const, budget: { ...run.budget, estimatedTokens: Math.min(32_000, run.budget.estimatedTokens + Math.ceil(text.length / 4)) } };
    return save(next, operationId);
  }

  async function continueRun(input: Parameters<TianyiAgentRuntimePort["continueRun"]>[0]): Promise<TianyiAgentRunProjection> {
    let run = await requireRun(input);
    if (["completed", "cancelled"].includes(run.status)) return run;
    try {
      if (run.status === "paused") run = { ...run, status: "running", error: null };
      if (run.status === "awaiting_author" && run.plan.some((step) => step.status === "awaiting_author")) return run;
      if (!run.contextManifest) return executeContextStep(run, input.operationId);
      if (run.plan.some((step) => step.kind === "model-analysis" && step.status !== "completed")) return executeAnalysis(run, input.operationId, input.signal);
      const next = { ...run, status: "completed" as const, stopReason: "作者可继续审查候选；本次 Agent 分析已完成。" };
      return save(next, input.operationId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Agent 运行未完成。";
      const category: NonNullable<TianyiAgentRunProjection["error"]>["category"] = input.signal?.aborted || (cause instanceof Error && cause.name === "AbortError") ? "cancelled" : cause instanceof Error && cause.name === "ProviderUnavailable" ? "provider-unavailable" : "tool-failed";
      return save({ ...run, status: category === "cancelled" ? "paused" : "failed", stopReason: category === "cancelled" ? "作者停止了本次运行。" : null, error: { category, message, retryable: category !== "cancelled" } }, input.operationId);
    }
  }

  async function approveStep(input: Parameters<TianyiAgentRuntimePort["approveStep"]>[0]): Promise<TianyiAgentRunProjection> {
    let run = await requireRun(input);
    const step = run.plan.find((item) => item.stepId === input.stepId);
    if (!step) throw new Error("Agent 步骤不存在。");
    const previous = run.approvals.find((item) => item.stepId === step.stepId && item.decision === "approved");
    const approval = previous ?? { stepId: step.stepId, decision: "approved" as const, operationId: input.operationId, receiptId: deterministicId("receipt.tianyi-agent-approval", run.runId, step.stepId), recordedAt: now() };
    run = { ...run, approvals: [...run.approvals.filter((item) => item.stepId !== step.stepId), approval], plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "approved" as const } : item), status: "running", error: null };
    run = await save(run, input.operationId, "approval");
    return continueRun({ projectId: input.projectId, sessionId: input.sessionId, runId: input.runId, operationId: `${input.operationId}.continue`, signal: input.signal });
  }

  async function rejectStep(input: Parameters<TianyiAgentRuntimePort["rejectStep"]>[0]): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    const step = run.plan.find((item) => item.stepId === input.stepId);
    if (!step) throw new Error("Agent 步骤不存在。");
    const next = { ...run, plan: run.plan.map((item) => item.stepId === step.stepId ? { ...item, status: "rejected" as const, error: input.reason || "作者拒绝了这一步。" } : item), status: "paused" as const, stopReason: input.reason || "作者拒绝了这一步。" };
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
    if (run.status === "cancelled") return run;
    return save({ ...run, status: "cancelled", stopReason: input.reason || "作者取消了运行。", error: { category: "cancelled", message: input.reason || "作者取消了运行。", retryable: false } }, input.operationId);
  }

  async function handoffCandidate(input: { projectId: string; sessionId: string; runId: string; candidateId: string; operationId: string }): Promise<TianyiAgentRunProjection> {
    const run = await requireRun(input);
    const candidate = run.candidates.find((item) => item.candidateId === input.candidateId);
    if (!candidate) throw new Error("Agent 候选不存在。");
    if (candidate.state === "handed-off" && candidate.ownerReceipt) return run;
    if (!dependencies.handoffCandidate) throw new Error("该候选暂时没有可用的现有 Owner。");
    const receipt = await dependencies.handoffCandidate({ projectId: input.projectId, sessionId: input.sessionId, runId: input.runId, candidate, operationId: input.operationId });
    const next = { ...run, candidates: run.candidates.map((item) => item.candidateId === candidate.candidateId ? { ...item, state: "handed-off" as const, ownerReceipt: receipt } : item) };
    return save(next, input.operationId, "receipt");
  }

  return Object.freeze({ adapterId: "pi.agent-core" as const, adapterVersion: "r0" as const, startRun, continueRun, steerRun, approveStep, rejectStep, pauseRun, resumeRun, cancelRun, recoverRun: load, getRunProjection: load, handoffCandidate });
}

function runKey(projectId: string, sessionId: string, runId: string): string { return `${projectId}:${sessionId}:${runId}`; }
function normalizeTask(value: unknown): string { const text = typeof value === "string" ? value.trim() : ""; if (!text || text.length > 4_000) throw new Error("Agent 任务不能为空或过长。"); return text; }
function normalizeCurrentPage(value: unknown): string { const page = typeof value === "string" && value.trim() ? value.trim() : "/tianyi"; if (!/^\/(?:tianyi|world|event-line|library|creation|nuwa)(?:[/?#]|$)/u.test(page)) throw new Error("Agent 当前页面不在受控工作区内。"); return page.slice(0, 240); }
function normalizePermissionProfile(value: unknown): TianyiAgentPermissionProfile { return value === undefined || value === null ? "step-by-step" : value === "step-by-step" || value === "conservative" || value === "proactive" ? value : (() => { throw new Error("Agent 权限档案不受支持。"); })(); }
function deterministicId(prefix: string, ...parts: string[]): string { return `${prefix}.${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`; }
function abortError(): Error { const error = new Error("Provider 请求已停止。"); error.name = "AbortError"; return error; }
function parseCandidateText(text: string, manifest: TianyiAgentContextManifest): TianyiAgentCandidate[] {
  const title = text.trim().slice(0, 80) || "待作者确认的分析建议";
  return [{ candidateId: deterministicId("candidate.tianyi-agent", title, manifest.sessionId), kind: "unknown", title, summary: text.trim().slice(0, 800) || "当前没有可安全归类的建议。", sourceRefs: manifest.authorSourceRefs.slice(0, 8), uncertainties: ["候选类型和正式归属仍需作者确认。"], targetOwnerKind: "candidate-only", state: "pending", ownerReceipt: null }];
}

export function validateTianyiAgentToolCall(input: { toolName: string; arguments: unknown }): TianyiAgentToolDefinition {
  const definition = TIANYI_AGENT_TOOL_REGISTRY.find((tool) => tool.name === input.toolName);
  if (!definition) throw new Error("未声明的 Agent 工具已被拒绝。");
  if (!input.arguments || typeof input.arguments !== "object" || Array.isArray(input.arguments)) throw new Error("Agent 工具参数必须是 JSON 对象。");
  const args = input.arguments as Record<string, unknown>;
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
