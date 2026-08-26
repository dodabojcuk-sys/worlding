import { stableHash } from "./storySnapshotBuilder.ts";

export const NUWA_DIRECTOR_R1_VERSION = "story-studio-nuwa-director-r1/v1" as const;

export const NUWA_DIRECTOR_PERMISSION_KINDS = [
  "read-context",
  "create-proposal",
  "rehearse-sandbox",
  "predict-future",
  "enrich-branch",
  "create-temporary-agent",
  "add-side-line",
  "add-hidden-line",
  "add-main-line",
  "create-creation-draft",
  "modify-creative-brief"
] as const;

export const NUWA_DIRECTOR_NEVER_DELEGABLE = [
  "confirm-canon",
  "permanent-delete",
  "publish-or-deploy",
  "cross-project-read",
  "install-skill",
  "change-director-permissions",
  "escape-budget"
] as const;

export type NuwaDirectorPermissionKindR1 = (typeof NUWA_DIRECTOR_PERMISSION_KINDS)[number];
export type NuwaDirectorPermissionStatusR1 = "granted" | "revoked";

export type NuwaDirectorScopeR1 = {
  projectId: string;
  runId: string;
  eventLineId: string | null;
  unitId: string | null;
  expiresAt: string;
  maxSteps: number;
  maxCalls: number;
  maxCost: number;
  costCurrency: "CNY";
  maxConcurrentAgents: number;
  allowedOutputs: Array<"proposal" | "candidate" | "creation-draft">;
};

export type NuwaDirectorPermissionR1 = {
  kind: NuwaDirectorPermissionKindR1;
  status: NuwaDirectorPermissionStatusR1;
  grantedAt: string | null;
  revokedAt: string | null;
};

export type NuwaDirectorReceiptR1 = {
  receiptId: string;
  action: "grant" | "revoke" | "deny" | "temporary-agent-created" | "temporary-agent-ended" | "job-created" | "job-advanced" | "job-paused" | "job-resumed" | "job-cancelled";
  subject: string;
  reason: string;
  createdAt: string;
};

export type NuwaTemporaryAgentR1 = {
  agentId: string;
  displayName: string;
  purpose: string;
  status: "active" | "completed" | "cancelled" | "expired";
  createdAt: string;
  endedAt: string | null;
  outputScope: "run-local-proposal";
};

export const NUWA_LONGFORM_STAGES_R1 = [
  "author-intent",
  "creative-brief",
  "world-character-seeds",
  "event-line-spine",
  "rehearsal-comparison",
  "author-checkpoint",
  "ready-event-line",
  "creation-draft"
] as const;

export type NuwaLongformStageR1 = (typeof NUWA_LONGFORM_STAGES_R1)[number];

export type NuwaLongformJobR1 = {
  jobId: string;
  title: string;
  status: "planned" | "running" | "paused" | "completed" | "cancelled" | "failed";
  currentStage: NuwaLongformStageR1;
  completedStages: NuwaLongformStageR1[];
  authorCheckpointRequired: boolean;
  creativeBriefRevision: number;
  creativeBriefConfirmedRevision: number | null;
  providerCalls: 0;
  createdAt: string;
  updatedAt: string;
};

export type NuwaDirectorStateR1 = {
  version: typeof NUWA_DIRECTOR_R1_VERSION;
  revision: number;
  scope: NuwaDirectorScopeR1;
  permissions: NuwaDirectorPermissionR1[];
  temporaryAgents: NuwaTemporaryAgentR1[];
  longformJob: NuwaLongformJobR1 | null;
  receipts: NuwaDirectorReceiptR1[];
  updatedAt: string;
};

const DEFAULT_GRANTED = new Set<NuwaDirectorPermissionKindR1>(["read-context", "create-proposal", "rehearse-sandbox"]);

export function createNuwaDirectorStateR1(input: {
  projectId: string;
  runId: string;
  eventLineId?: string | null;
  unitId?: string | null;
  createdAt?: string;
  expiresAt?: string;
}): NuwaDirectorStateR1 {
  const createdAt = validTimestamp(input.createdAt ?? new Date().toISOString(), "createdAt");
  const expiresAt = validTimestamp(input.expiresAt ?? new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(), "expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw new Error("Director scope must expire after it is created.");
  const scope: NuwaDirectorScopeR1 = {
    projectId: stableId(input.projectId, "projectId"),
    runId: stableId(input.runId, "runId"),
    eventLineId: input.eventLineId ? stableId(input.eventLineId, "eventLineId") : null,
    unitId: input.unitId ? stableId(input.unitId, "unitId") : null,
    expiresAt,
    maxSteps: 48,
    maxCalls: 0,
    maxCost: 0,
    costCurrency: "CNY",
    maxConcurrentAgents: 3,
    allowedOutputs: ["proposal", "candidate", "creation-draft"]
  };
  const permissions = NUWA_DIRECTOR_PERMISSION_KINDS.map((kind) => ({
    kind,
    status: DEFAULT_GRANTED.has(kind) ? "granted" as const : "revoked" as const,
    grantedAt: DEFAULT_GRANTED.has(kind) ? createdAt : null,
    revokedAt: DEFAULT_GRANTED.has(kind) ? null : createdAt
  }));
  return validateNuwaDirectorStateR1({ version: NUWA_DIRECTOR_R1_VERSION, revision: 1, scope, permissions, temporaryAgents: [], longformJob: null, receipts: [], updatedAt: createdAt });
}

export function validateNuwaDirectorStateR1(value: NuwaDirectorStateR1): NuwaDirectorStateR1 {
  if (value.version !== NUWA_DIRECTOR_R1_VERSION) throw new Error("Unsupported Nuwa Director state version.");
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new Error("Director revision must be a positive integer.");
  stableId(value.scope.projectId, "projectId");
  stableId(value.scope.runId, "runId");
  validTimestamp(value.scope.expiresAt, "expiresAt");
  if (value.scope.maxCalls !== 0 || value.scope.maxCost !== 0 || value.scope.costCurrency !== "CNY") throw new Error("R1 Director must remain provider-free and cost-free.");
  if (!Number.isInteger(value.scope.maxSteps) || value.scope.maxSteps < 1 || value.scope.maxSteps > 200) throw new Error("Director step budget is invalid.");
  if (!Number.isInteger(value.scope.maxConcurrentAgents) || value.scope.maxConcurrentAgents < 1 || value.scope.maxConcurrentAgents > 5) throw new Error("Director temporary Agent limit is invalid.");
  if (value.permissions.length !== NUWA_DIRECTOR_PERMISSION_KINDS.length || new Set(value.permissions.map((item) => item.kind)).size !== value.permissions.length) throw new Error("Director permissions must contain each supported permission exactly once.");
  for (const permission of value.permissions) if (!NUWA_DIRECTOR_PERMISSION_KINDS.includes(permission.kind)) throw new Error("Unknown Director permission.");
  if (value.temporaryAgents.filter((agent) => agent.status === "active").length > value.scope.maxConcurrentAgents) throw new Error("Director temporary Agent limit exceeded.");
  for (const agent of value.temporaryAgents) {
    stableId(agent.agentId, "agentId");
    if (agent.outputScope !== "run-local-proposal") throw new Error("Temporary Agents may only create Run-local proposals.");
  }
  if (value.longformJob) validateLongformJob(value.longformJob);
  validTimestamp(value.updatedAt, "updatedAt");
  return structuredClone(value);
}

export function setNuwaDirectorPermissionR1(state: NuwaDirectorStateR1, input: { kind: NuwaDirectorPermissionKindR1; granted: boolean; reason: string; now?: string }): NuwaDirectorStateR1 {
  if (!NUWA_DIRECTOR_PERMISSION_KINDS.includes(input.kind)) return appendDenied(state, String(input.kind), "该能力不在可授权集合中。", input.now);
  const now = validTimestamp(input.now ?? new Date().toISOString(), "now");
  if (Date.parse(now) >= Date.parse(state.scope.expiresAt)) return appendDenied(state, input.kind, "授权范围已经过期。", now);
  const permissions = state.permissions.map((item) => item.kind === input.kind ? {
    ...item,
    status: input.granted ? "granted" as const : "revoked" as const,
    grantedAt: input.granted ? now : item.grantedAt,
    revokedAt: input.granted ? null : now
  } : item);
  return nextState(state, { permissions, receipt: receipt(input.granted ? "grant" : "revoke", input.kind, input.reason, now), now });
}

export function assertNuwaDirectorPermissionR1(state: NuwaDirectorStateR1, kind: NuwaDirectorPermissionKindR1, now = new Date().toISOString()): void {
  validTimestamp(now, "now");
  if (Date.parse(now) >= Date.parse(state.scope.expiresAt)) throw new Error("Nuwa Director scope has expired.");
  if (state.permissions.find((item) => item.kind === kind)?.status !== "granted") throw new Error(`Nuwa Director permission is not granted: ${kind}.`);
}

export function createNuwaTemporaryAgentR1(state: NuwaDirectorStateR1, input: { displayName: string; purpose: string; now?: string }): NuwaDirectorStateR1 {
  const now = validTimestamp(input.now ?? new Date().toISOString(), "now");
  assertNuwaDirectorPermissionR1(state, "create-temporary-agent", now);
  if (state.temporaryAgents.filter((agent) => agent.status === "active").length >= state.scope.maxConcurrentAgents) throw new Error("Nuwa Director temporary Agent limit exceeded.");
  const displayName = requiredText(input.displayName, "displayName", 60);
  const purpose = requiredText(input.purpose, "purpose", 240);
  const agentId = `temporary-agent.${stableHash({ runId: state.scope.runId, displayName, purpose, revision: state.revision }).slice(0, 16)}`;
  if (state.temporaryAgents.some((agent) => agent.agentId === agentId)) throw new Error("Temporary Agent already exists in this Run.");
  const agent: NuwaTemporaryAgentR1 = { agentId, displayName, purpose, status: "active", createdAt: now, endedAt: null, outputScope: "run-local-proposal" };
  return nextState(state, { temporaryAgents: [...state.temporaryAgents, agent], receipt: receipt("temporary-agent-created", agentId, "仅在当前 Run 内参与提案。", now), now });
}

export function endNuwaTemporaryAgentR1(state: NuwaDirectorStateR1, input: { agentId: string; status: "completed" | "cancelled"; now?: string }): NuwaDirectorStateR1 {
  const now = validTimestamp(input.now ?? new Date().toISOString(), "now");
  let found = false;
  const temporaryAgents = state.temporaryAgents.map((agent) => {
    if (agent.agentId !== input.agentId) return agent;
    found = true;
    if (agent.status !== "active") throw new Error("Temporary Agent has already ended.");
    return { ...agent, status: input.status, endedAt: now };
  });
  if (!found) throw new Error("Temporary Agent does not exist in this Run.");
  return nextState(state, { temporaryAgents, receipt: receipt("temporary-agent-ended", input.agentId, input.status, now), now });
}

export function createNuwaLongformJobR1(state: NuwaDirectorStateR1, input: { title: string; now?: string }): NuwaDirectorStateR1 {
  assertNuwaDirectorPermissionR1(state, "create-proposal", input.now);
  if (state.longformJob && !["completed", "cancelled", "failed"].includes(state.longformJob.status)) throw new Error("A longform orchestration job is already active in this Run.");
  const now = validTimestamp(input.now ?? new Date().toISOString(), "now");
  const title = requiredText(input.title, "title", 120);
  const jobId = `longform.${stableHash({ runId: state.scope.runId, title, revision: state.revision }).slice(0, 16)}`;
  const longformJob: NuwaLongformJobR1 = { jobId, title, status: "planned", currentStage: "author-intent", completedStages: [], authorCheckpointRequired: false, creativeBriefRevision: 1, creativeBriefConfirmedRevision: null, providerCalls: 0, createdAt: now, updatedAt: now };
  return nextState(state, { longformJob, receipt: receipt("job-created", jobId, "建立分阶段编排，不执行一次性整本生成。", now), now });
}

export function advanceNuwaLongformJobR1(state: NuwaDirectorStateR1, input: { confirmCreativeBrief?: boolean; confirmAuthorCheckpoint?: boolean; now?: string }): NuwaDirectorStateR1 {
  const job = state.longformJob;
  if (!job) throw new Error("Longform orchestration job does not exist.");
  if (["completed", "cancelled", "failed"].includes(job.status)) throw new Error("Longform orchestration job cannot advance.");
  if (job.status === "paused") throw new Error("Resume the longform orchestration job before advancing.");
  const now = validTimestamp(input.now ?? new Date().toISOString(), "now");
  if (job.currentStage === "creative-brief" && job.creativeBriefConfirmedRevision !== job.creativeBriefRevision && !input.confirmCreativeBrief) throw new Error("Creative Brief requires explicit author confirmation before advancing.");
  if (job.currentStage === "author-checkpoint" && !input.confirmAuthorCheckpoint) throw new Error("Author checkpoint requires explicit confirmation before advancing.");
  const index = NUWA_LONGFORM_STAGES_R1.indexOf(job.currentStage);
  const isLast = index === NUWA_LONGFORM_STAGES_R1.length - 1;
  const completedStages = job.completedStages.includes(job.currentStage) ? job.completedStages : [...job.completedStages, job.currentStage];
  const nextStage = isLast ? job.currentStage : NUWA_LONGFORM_STAGES_R1[index + 1];
  const longformJob: NuwaLongformJobR1 = {
    ...job,
    status: isLast ? "completed" : "running",
    currentStage: nextStage,
    completedStages,
    authorCheckpointRequired: !isLast && nextStage === "author-checkpoint",
    creativeBriefConfirmedRevision: job.currentStage === "creative-brief" && input.confirmCreativeBrief ? job.creativeBriefRevision : job.creativeBriefConfirmedRevision,
    updatedAt: now
  };
  return nextState(state, { longformJob, receipt: receipt("job-advanced", job.jobId, `进入 ${nextStage}`, now), now });
}

export function setNuwaLongformJobStatusR1(state: NuwaDirectorStateR1, input: { action: "pause" | "resume" | "cancel"; now?: string }): NuwaDirectorStateR1 {
  const job = state.longformJob;
  if (!job) throw new Error("Longform orchestration job does not exist.");
  const now = validTimestamp(input.now ?? new Date().toISOString(), "now");
  if (input.action === "resume" && job.status !== "paused") throw new Error("Only a paused longform job can resume.");
  if (input.action === "pause" && !["planned", "running"].includes(job.status)) throw new Error("Only an active longform job can pause.");
  if (input.action === "cancel" && ["completed", "cancelled", "failed"].includes(job.status)) throw new Error("Longform job has already ended.");
  const status = input.action === "pause" ? "paused" as const : input.action === "resume" ? "running" as const : "cancelled" as const;
  const action = input.action === "pause" ? "job-paused" as const : input.action === "resume" ? "job-resumed" as const : "job-cancelled" as const;
  return nextState(state, { longformJob: { ...job, status, updatedAt: now }, receipt: receipt(action, job.jobId, input.action, now), now });
}

function validateLongformJob(job: NuwaLongformJobR1): void {
  stableId(job.jobId, "jobId");
  if (!NUWA_LONGFORM_STAGES_R1.includes(job.currentStage)) throw new Error("Unknown longform stage.");
  if (job.providerCalls !== 0) throw new Error("R1 longform orchestration cannot call a Provider.");
  if (new Set(job.completedStages).size !== job.completedStages.length || job.completedStages.some((stage) => !NUWA_LONGFORM_STAGES_R1.includes(stage))) throw new Error("Longform stage history is invalid.");
}

function appendDenied(state: NuwaDirectorStateR1, subject: string, reason: string, now = new Date().toISOString()): NuwaDirectorStateR1 {
  const timestamp = validTimestamp(now, "now");
  return nextState(state, { receipt: receipt("deny", subject, reason, timestamp), now: timestamp });
}

function nextState(state: NuwaDirectorStateR1, input: { permissions?: NuwaDirectorPermissionR1[]; temporaryAgents?: NuwaTemporaryAgentR1[]; longformJob?: NuwaLongformJobR1; receipt: NuwaDirectorReceiptR1; now: string }): NuwaDirectorStateR1 {
  return validateNuwaDirectorStateR1({ ...state, revision: state.revision + 1, ...(input.permissions ? { permissions: input.permissions } : {}), ...(input.temporaryAgents ? { temporaryAgents: input.temporaryAgents } : {}), ...(input.longformJob ? { longformJob: input.longformJob } : {}), receipts: [...state.receipts, input.receipt], updatedAt: input.now });
}

function receipt(action: NuwaDirectorReceiptR1["action"], subject: string, reason: string, createdAt: string): NuwaDirectorReceiptR1 {
  return { receiptId: `director-receipt.${stableHash({ action, subject, reason, createdAt }).slice(0, 18)}`, action, subject, reason: requiredText(reason, "reason", 300), createdAt };
}

function stableId(value: string, label: string): string {
  if (!/^[a-zA-Z0-9._:-]{1,180}$/u.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function requiredText(value: string, label: string, max: number): string {
  const text = value.normalize("NFC").trim();
  if (!text || text.length > max) throw new Error(`Invalid ${label}.`);
  return text;
}

function validTimestamp(value: string, label: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${label}.`);
  return value;
}
