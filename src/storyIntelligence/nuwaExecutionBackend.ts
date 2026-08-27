import { accessSync, constants as fsConstants, statSync } from "node:fs";
import path from "node:path";

import { STORY_MEMORY_RECALL_SKILL_ID } from "../skillControl/storyMemoryRecallSkillManifest.ts";
import { runDeterministicNuwaTask } from "./nuwaRunner.ts";
import { stableHash, stableJson } from "./storySnapshotBuilder.ts";
import { buildNuwaTaskContextPack, type NuwaTaskContextPack } from "./nuwaTaskContextPack.ts";
import {
  applyStoryMemoryRecallToNuwaResult,
  recallNuwaEvidenceWithSkill,
  type NuwaStoryMemoryRecallDiagnostic,
  type NuwaStoryMemoryRecallOptions
} from "./nuwaStoryMemoryRecall.ts";
import type { NuwaAgentResult, NuwaAgentTask, NuwaPlan, StorySnapshot } from "./storyIntelligenceTypes.ts";

export const NUWA_BACKEND_IDS = ["deterministic", "external-run-pack", "codex-cli"] as const;
export type NuwaExecutionBackendId = (typeof NUWA_BACKEND_IDS)[number];
export type NuwaExecutionProfile = "economy" | "balanced" | "quality";
export type NuwaBackendAvailability = "available" | "disabled" | "unavailable";
export type NuwaTaskExecutionStatus =
  | "task-created"
  | "task-running"
  | "result-produced"
  | "result-imported"
  | "schema-validated"
  | "evidence-validated"
  | "accepted-by-nuwa"
  | "rejected"
  | "cancelled"
  | "queued";

export type NuwaBackendDescriptor = {
  id: NuwaExecutionBackendId;
  label: string;
  availability: NuwaBackendAvailability;
  optInRequired: boolean;
  remoteExecution: boolean;
  supportsExport: boolean;
  implementationVersion: string;
  modelIdentity: string;
  diagnostic?: string;
};

export type NuwaExecutionEvent = {
  version: "world-os-nuwa-execution-event-v1";
  type:
    | "backend-selected"
    | "task-started"
    | "result-produced"
    | "result-imported"
    | "result-validated"
    | "result-accepted"
    | "cache-hit"
    | "cache-miss"
    | "task-queued"
    | "task-rejected"
    | "task-cancelled"
    | "replan-requested";
  runId: string;
  taskId?: string;
  backendId: NuwaExecutionBackendId;
  detail: string;
};

export type NuwaTaskExecution = {
  taskId: string;
  role: NuwaAgentTask["role"];
  status: NuwaTaskExecutionStatus;
  taskHash: string;
  result?: NuwaAgentResult;
  diagnostic?: string;
  attempts: number;
  requirement: NuwaAgentTask["requirement"];
  cacheHit: boolean;
  validationStatus: "not-applicable" | "pending" | "accepted-by-nuwa" | "rejected";
  reasonCategory?: "backend-unavailable" | "timeout" | "stale-cache" | "invalid-result" | "external-pending";
  capability?: NuwaStoryMemoryRecallDiagnostic;
};

export type NuwaCacheIdentity = {
  version: "world-os-nuwa-cache-identity-v1";
  snapshotHash: string;
  taskHash: string;
  backendId: NuwaExecutionBackendId;
  backendImplementationVersion: string;
  backendProfile: NuwaExecutionProfile;
  modelIdentity: string;
  taskSchemaVersion: "world-os-nuwa-agent-task-v1";
  resultSchemaVersion: "world-os-nuwa-agent-result-v1";
  instructionVersion: "world-os-nuwa-specialist-instruction-v1";
  contextPackVersion: "world-os-nuwa-task-context-pack-v1";
};

export type NuwaCacheEntry = {
  version: "world-os-nuwa-cache-entry-v1";
  cacheKey: string;
  identity: NuwaCacheIdentity;
  validationStatus: "accepted-by-nuwa";
  result: NuwaAgentResult;
  capability?: NuwaStoryMemoryRecallDiagnostic;
};

export type NuwaAgentExecutionBackend = {
  descriptor: NuwaBackendDescriptor;
  executeTask(input: {
    plan: NuwaPlan;
    snapshot: StorySnapshot;
    task: NuwaAgentTask;
    context: NuwaTaskContextPack;
    profile: NuwaExecutionProfile;
    signal?: AbortSignal;
  }): Promise<NuwaTaskExecution>;
};

export type NuwaExecutionOutcome = {
  backend: NuwaBackendDescriptor;
  profile: NuwaExecutionProfile;
  executions: NuwaTaskExecution[];
  events: NuwaExecutionEvent[];
  results: NuwaAgentResult[];
  completed: boolean;
  replanRequested: boolean;
  missingRequiredRoles: NuwaAgentTask["role"][];
  missingOptionalRoles: NuwaAgentTask["role"][];
};

export type NuwaCodexCliCapabilities = {
  executable: string | null;
  execAvailable: boolean;
  readOnlySandbox: boolean;
  structuredOutput: boolean;
  ephemeral: boolean;
  safeExperimentalPath: boolean;
  diagnostic: string;
};

export type CodexCliExecutor = (input: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const PROFILE_LIMITS: Record<NuwaExecutionProfile, { maxConcurrent: number; maxAttempts: number }> = {
  economy: { maxConcurrent: 1, maxAttempts: 1 },
  balanced: { maxConcurrent: 2, maxAttempts: 2 },
  quality: { maxConcurrent: 2, maxAttempts: 2 }
};

export function discoverNuwaCodexCliCapabilities(input: { executable?: string; env?: NodeJS.ProcessEnv } = {}): NuwaCodexCliCapabilities {
  const env = input.env ?? process.env;
  const resolved = resolveCodexExecutable(input.executable, env);
  if (!resolved.executable) {
    return {
      executable: null,
      execAvailable: false,
      readOnlySandbox: false,
      structuredOutput: false,
      ephemeral: false,
      safeExperimentalPath: false,
      diagnostic: resolved.diagnostic
    };
  }
  const executable = resolved.executable;
  return {
    executable,
    execAvailable: true,
    readOnlySandbox: true,
    structuredOutput: true,
    ephemeral: true,
    safeExperimentalPath: false,
    diagnostic: "EXPERIMENTALLY_UNSAFE: CLI flags exist, but filesystem read isolation and an isolated authentication HOME are not proven."
  };
}

export function listNuwaExecutionBackends(input: { env?: NodeJS.ProcessEnv; codexExecutable?: string } = {}): NuwaBackendDescriptor[] {
  const capabilities = discoverNuwaCodexCliCapabilities({ executable: input.codexExecutable, env: input.env });
  return [deterministicDescriptor(), externalDescriptor(), {
    id: "codex-cli",
    label: "Codex 协作推演",
    availability: capabilities.executable ? "unavailable" : "disabled",
    optInRequired: true,
    remoteExecution: true,
    supportsExport: false,
    implementationVersion: "codex-cli-disabled-v1",
    modelIdentity: "unconfigured",
    diagnostic: capabilities.diagnostic
  }];
}

export function createNuwaExecutionBackend(input: {
  id?: NuwaExecutionBackendId;
  env?: NodeJS.ProcessEnv;
  codexExecutable?: string;
  executeCodex?: CodexCliExecutor;
  storyMemoryRecall?: NuwaStoryMemoryRecallOptions;
} = {}): NuwaAgentExecutionBackend {
  const id = input.id ?? "deterministic";
  if (id === "deterministic") return createDeterministicBackend(input.storyMemoryRecall);
  if (id === "external-run-pack") return createExternalRunPackBackend();
  return createDisabledCodexBackend({ env: input.env, executable: input.codexExecutable });
}

export async function executeNuwaPlanWithBackend(input: {
  plan: NuwaPlan;
  snapshot: StorySnapshot;
  backend: NuwaAgentExecutionBackend;
  profile?: NuwaExecutionProfile;
  cachedResults?: Record<string, NuwaCacheEntry>;
  signal?: AbortSignal;
  taskTimeoutMs?: number;
}): Promise<NuwaExecutionOutcome> {
  if (input.plan.snapshotHash !== input.snapshot.snapshotHash) throw new Error("Nuwa execution requires the plan snapshot.");
  const profile = input.profile ?? "balanced";
  const events: NuwaExecutionEvent[] = [event(input.plan.runId, undefined, input.backend.descriptor.id, "backend-selected", input.backend.descriptor.label)];
  const contexts = input.plan.tasks.map((task) => {
    const context = buildNuwaTaskContextPack({ plan: input.plan, snapshot: input.snapshot, task });
    const identity = buildNuwaCacheIdentity({ snapshot: input.snapshot, context, backend: input.backend.descriptor, profile });
    return { task, context, identity, cacheKey: stableCacheKey(identity) };
  });
  const executions: NuwaTaskExecution[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < contexts.length) {
      const index = cursor++;
      const { task, context, identity, cacheKey } = contexts[index];
      if (input.signal?.aborted) {
        executions.push(taskExecution(task, context, "cancelled", { attempts: 0, diagnostic: "Execution cancelled before task start." }));
        events.push(event(input.plan.runId, task.taskId, input.backend.descriptor.id, "task-cancelled", "Cancelled before start."));
        continue;
      }
      const cached = input.cachedResults?.[cacheKey];
      if (isMatchingValidatedCache(cached, identity, cacheKey)) {
        executions.push(taskExecution(task, context, "accepted-by-nuwa", {
          attempts: 0,
          result: structuredClone(cached.result),
          ...(cached.capability ? { capability: structuredClone(cached.capability) } : {}),
          cacheHit: true,
          validationStatus: "accepted-by-nuwa"
        }));
        events.push(event(input.plan.runId, task.taskId, input.backend.descriptor.id, "cache-hit", "Reused a validated result with matching execution identity."));
        continue;
      }
      events.push(event(input.plan.runId, task.taskId, input.backend.descriptor.id, "cache-miss", "No validated cache entry matched all identity fields."));
      events.push(event(input.plan.runId, task.taskId, input.backend.descriptor.id, "task-started", "Started with a bounded task context."));
      let execution: NuwaTaskExecution | null = null;
      for (let attempt = 1; attempt <= PROFILE_LIMITS[profile].maxAttempts; attempt += 1) {
        execution = await executeWithTimeout({
          run: () => input.backend.executeTask({ plan: input.plan, snapshot: input.snapshot, task, context, profile, signal: input.signal }),
          timeoutMs: input.taskTimeoutMs ?? 30_000,
          task,
          context,
          signal: input.signal
        });
        execution.attempts = attempt;
        if (execution.status !== "rejected") break;
      }
      const resolved = execution ?? taskExecution(task, context, "rejected", { diagnostic: "Backend returned no result.", attempts: PROFILE_LIMITS[profile].maxAttempts, validationStatus: "rejected" });
      executions.push(resolved);
      const eventType = resolved.status === "result-produced" ? "result-produced" : resolved.status === "queued" ? "task-queued" : resolved.status === "cancelled" ? "task-cancelled" : "task-rejected";
      events.push(event(input.plan.runId, task.taskId, input.backend.descriptor.id, eventType, resolved.diagnostic ?? resolved.status));
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROFILE_LIMITS[profile].maxConcurrent, contexts.length) }, worker));
  executions.sort((left, right) => left.taskId.localeCompare(right.taskId));
  const usableRoles = new Set(executions
    .filter((item) => item.status === "result-produced" || item.status === "accepted-by-nuwa")
    .map((item) => item.role));
  const missingRequiredRoles = input.plan.tasks.filter((task) => task.requirement === "required" && !usableRoles.has(task.role)).map((task) => task.role);
  const missingOptionalRoles = input.plan.tasks.filter((task) => task.requirement === "optional" && !usableRoles.has(task.role)).map((task) => task.role);
  const replanRequested = executions.some((item) => item.status === "rejected" || item.status === "cancelled");
  if (replanRequested) events.push(event(input.plan.runId, undefined, input.backend.descriptor.id, "replan-requested", "One bounded replan may be requested after rejected tasks are reviewed."));
  return {
    backend: input.backend.descriptor,
    profile,
    executions,
    events,
    results: executions.filter((item) => item.status === "result-produced" || item.status === "accepted-by-nuwa").flatMap((item) => item.result ? [item.result] : []),
    completed: missingRequiredRoles.length === 0 && missingOptionalRoles.length === 0,
    replanRequested,
    missingRequiredRoles,
    missingOptionalRoles
  };
}

export function buildNuwaCacheIdentity(input: {
  snapshot: StorySnapshot;
  context: NuwaTaskContextPack;
  backend: NuwaBackendDescriptor;
  profile: NuwaExecutionProfile;
}): NuwaCacheIdentity {
  return {
    version: "world-os-nuwa-cache-identity-v1",
    snapshotHash: input.snapshot.snapshotHash,
    taskHash: input.context.taskHash,
    backendId: input.backend.id,
    backendImplementationVersion: input.backend.implementationVersion,
    backendProfile: input.profile,
    modelIdentity: input.backend.modelIdentity,
    taskSchemaVersion: "world-os-nuwa-agent-task-v1",
    resultSchemaVersion: "world-os-nuwa-agent-result-v1",
    instructionVersion: "world-os-nuwa-specialist-instruction-v1",
    contextPackVersion: input.context.version
  };
}

export function stableCacheKey(identity: NuwaCacheIdentity): string {
  return stableHash(identity);
}

function createDeterministicBackend(storyMemoryRecall?: NuwaStoryMemoryRecallOptions): NuwaAgentExecutionBackend {
  return {
    descriptor: deterministicDescriptor(storyMemoryRecall),
    async executeTask(input) {
      if (input.signal?.aborted) return taskExecution(input.task, input.context, "cancelled", { attempts: 0, diagnostic: "Execution cancelled." });
      const baseResult = runDeterministicNuwaTask({ task: input.task, plan: input.plan, snapshot: input.snapshot });
      if (input.task.role === "evidence-critic" && input.task.capabilityRequirements.includes(STORY_MEMORY_RECALL_SKILL_ID)) {
        const recall = await recallNuwaEvidenceWithSkill({ task: input.task, context: input.context, options: storyMemoryRecall });
        return taskExecution(input.task, input.context, "result-produced", {
          result: applyStoryMemoryRecallToNuwaResult({ result: baseResult, recalledEvidence: recall.evidence }),
          validationStatus: "pending",
          capability: recall.diagnostic,
          diagnostic: recall.diagnostic.product.copy
        });
      }
      return taskExecution(input.task, input.context, "result-produced", {
        result: baseResult,
        validationStatus: "pending"
      });
    }
  };
}

function createExternalRunPackBackend(): NuwaAgentExecutionBackend {
  return {
    descriptor: externalDescriptor(),
    async executeTask(input) {
      return taskExecution(input.task, input.context, "queued", {
        diagnostic: "External result is pending import and Nuwa validation.",
        reasonCategory: "external-pending"
      });
    }
  };
}

function createDisabledCodexBackend(input: { env?: NodeJS.ProcessEnv; executable?: string }): NuwaAgentExecutionBackend {
  const capabilities = discoverNuwaCodexCliCapabilities({ executable: input.executable, env: input.env });
  const descriptor = listNuwaExecutionBackends({ env: input.env, codexExecutable: input.executable }).find((item) => item.id === "codex-cli")!;
  return {
    descriptor,
    async executeTask(taskInput) {
      if (taskInput.signal?.aborted) return taskExecution(taskInput.task, taskInput.context, "cancelled", { attempts: 0, diagnostic: "Execution cancelled." });
      return taskExecution(taskInput.task, taskInput.context, "rejected", {
        diagnostic: capabilities.diagnostic,
        validationStatus: "rejected",
        reasonCategory: "backend-unavailable"
      });
    }
  };
}

function deterministicDescriptor(storyMemoryRecall?: NuwaStoryMemoryRecallOptions): NuwaBackendDescriptor {
  const capabilityIdentity = stableHash({
    skillRegistry: storyMemoryRecall?.skillRegistry ?? "default",
    pluginRegistry: storyMemoryRecall?.pluginRegistry ?? "default",
    policy: storyMemoryRecall?.policy ?? "default",
    budget: storyMemoryRecall?.budget ?? "default",
    toggles: storyMemoryRecall?.toggles ?? "default-active",
    memoryAdapter: storyMemoryRecall?.memoryAdapterFactory ? "injected" : "memory-palace"
  });
  return {
    id: "deterministic",
    label: "本地规则推演",
    availability: "available",
    optInRequired: false,
    remoteExecution: false,
    supportsExport: false,
    implementationVersion: "deterministic-v2-story-memory-recall-v1",
    modelIdentity: `deterministic-rules-v1:${capabilityIdentity}`
  };
}

function externalDescriptor(): NuwaBackendDescriptor {
  return {
    id: "external-run-pack",
    label: "外部结果待核验",
    availability: "available",
    optInRequired: false,
    remoteExecution: false,
    supportsExport: true,
    implementationVersion: "external-run-pack-v1",
    modelIdentity: "external-unvalidated"
  };
}

function isMatchingValidatedCache(entry: NuwaCacheEntry | undefined, identity: NuwaCacheIdentity, cacheKey: string): entry is NuwaCacheEntry {
  return Boolean(entry
    && entry.validationStatus === "accepted-by-nuwa"
    && entry.cacheKey === cacheKey
    && stableCacheKey(entry.identity) === cacheKey
    && stableJson(entry.identity) === stableJson(identity));
}

function taskExecution(task: NuwaAgentTask, context: NuwaTaskContextPack, status: NuwaTaskExecutionStatus, overrides: Partial<NuwaTaskExecution>): NuwaTaskExecution {
  return {
    taskId: task.taskId,
    role: task.role,
    status,
    taskHash: context.taskHash,
    attempts: 1,
    requirement: task.requirement,
    cacheHit: false,
    validationStatus: status === "rejected" ? "rejected" : "not-applicable",
    ...overrides
  };
}

function executeWithTimeout(input: {
  run: () => Promise<NuwaTaskExecution>;
  timeoutMs: number;
  task: NuwaAgentTask;
  context: NuwaTaskContextPack;
  signal?: AbortSignal;
}): Promise<NuwaTaskExecution> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: NuwaTaskExecution) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
      resolve(value);
    };
    const cancel = () => finish(taskExecution(input.task, input.context, "cancelled", { attempts: 0, diagnostic: "Execution cancelled." }));
    const timer = setTimeout(() => finish(taskExecution(input.task, input.context, "rejected", {
      diagnostic: "Backend task timed out.",
      validationStatus: "rejected",
      reasonCategory: "timeout"
    })), Math.max(1, input.timeoutMs));
    input.signal?.addEventListener("abort", cancel, { once: true });
    input.run().then(finish, (error) => finish(taskExecution(input.task, input.context, "rejected", {
      diagnostic: sanitizeDiagnostic(error instanceof Error ? error.message : String(error)),
      validationStatus: "rejected"
    })));
  });
}

function event(runId: string, taskId: string | undefined, backendId: NuwaExecutionBackendId, type: NuwaExecutionEvent["type"], detail: string): NuwaExecutionEvent {
  return { version: "world-os-nuwa-execution-event-v1", type, runId, ...(taskId ? { taskId } : {}), backendId, detail: sanitizeDiagnostic(detail) };
}

export function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/(?:api[_-]?key|access[_-]?token|token|secret|authorization|cookie)\s*[:=]\s*\S+/gi, "redacted")
    .replace(/\/Users\/[^/\s]+/g, "~")
    .slice(0, 240);
}

function resolveCodexExecutable(explicit: string | undefined, env: NodeJS.ProcessEnv): { executable: string | null; diagnostic: string } {
  const configured = typeof explicit === "string"
    ? { source: "Explicit Codex CLI configuration", value: explicit }
    : typeof env.WORLD_OS_NUWA_CODEX_PATH === "string"
      ? { source: "WORLD_OS_NUWA_CODEX_PATH", value: env.WORLD_OS_NUWA_CODEX_PATH }
      : null;
  if (configured) {
    const candidate = normalizeExecutablePath(configured.value);
    if (!candidate || !isExecutableFile(candidate)) return { executable: null, diagnostic: `${configured.source} is empty, missing, or not executable.` };
    return { executable: candidate, diagnostic: `${configured.source} resolved.` };
  }

  const fromPath = findCodexOnPath(env);
  if (fromPath) return { executable: fromPath, diagnostic: "Codex CLI executable resolved from PATH." };
  const known = findKnownCodexExecutable();
  if (known) return { executable: known, diagnostic: "Codex CLI executable resolved from a known platform installation." };
  return { executable: null, diagnostic: "Codex CLI executable was not found or is not executable." };
}

function findCodexOnPath(env: NodeJS.ProcessEnv): string | null {
  const pathValue = env.PATH || env.Path || "";
  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry.trim()) continue;
    for (const extension of extensions) {
      const candidate = path.resolve(entry, `codex${extension}`);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

function findKnownCodexExecutable(): string | null {
  const candidates = process.platform === "darwin"
    ? ["/Applications/ChatGPT.app/Contents/Resources/codex"]
    : process.platform === "linux"
      ? ["/usr/lib/chatgpt/resources/codex"]
      : [];
  return candidates.find(isExecutableFile) || null;
}

function normalizeExecutablePath(value: string): string | null {
  const normalized = value.trim();
  return normalized ? path.resolve(normalized) : null;
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
