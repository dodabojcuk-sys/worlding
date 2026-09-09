import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type AgentPermissionProfile = "general" | "auto-review" | "full-access";
export type AgentActionKind =
  | "read-context"
  | "draft-write"
  | "library-write"
  | "temporary-character"
  | "rehearsal-run"
  | "event-impact-review"
  | "confirmed-event"
  | "permanent-delete"
  | "branch-merge"
  | "external-action";

export type ActionPermissionReceipt = {
  id: string;
  recordedAt: string;
  actor: "tianyi" | "nuwa" | "author";
  action: AgentActionKind;
  targets: string[];
  outcome: "allowed" | "requires-author" | "blocked";
  reason: string;
  reversible: boolean;
  checkpointId: string | null;
  actionClass: "read" | "draft" | "persistent" | "review" | "protected" | "external";
  projectScope: string;
  targetType: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  estimatedProviderCost: number;
  requiredPermission: AgentPermissionProfile | "author-confirmation";
  decisionSource: "author-action" | "nuwa-scope-authorization" | "policy";
  authorizationId: string | null;
};

export type NuwaFullAccessAuthorization = {
  id: string;
  subject: "nuwa-n1";
  projectId: string;
  runId: string;
  storyUnitId: string;
  storyUnitRevision: string;
  actorIds: string[];
  /** An optional, author-selected active RelationType.  Null deliberately
   * means that this scope may not infer a relation label from model text. */
  relationTypeId: string | null;
  relationTypeRevision: number | null;
  allowedActions: Array<Extract<AgentActionKind, "confirmed-event" | "library-write" | "event-impact-review">>;
  maxSteps: number;
  maxProviderDispatches: number;
  status: "active" | "revoked" | "expired";
  grantedAt: string;
  expiresAt: string | null;
  grantedBy: "author";
  sourceOperationId: string;
  revokedAt: string | null;
  revokeReason: string | null;
};

type BrokerState = {
  version: "story-studio-action-permission-broker/v1";
  profile: AgentPermissionProfile;
  updatedAt: string;
  receipts: ActionPermissionReceipt[];
  nuwaAuthorizations: NuwaFullAccessAuthorization[];
};

const protectedActions = new Set<AgentActionKind>(["confirmed-event", "permanent-delete", "branch-merge", "external-action"]);
const autoAllowed = new Set<AgentActionKind>(["read-context", "draft-write", "temporary-character", "rehearsal-run"]);

/**
 * The one project-local permission owner for Tianyi and Nuwa. It has no
 * authority over World, Event, Canon, or document persistence: callers still
 * perform writes through their existing owners after this broker decides.
 */
export function createActionPermissionBroker(input: { resolveProjectPath(projectId: string): string; now?: () => string }) {
  const now = input.now ?? (() => new Date().toISOString());

  function statePath(projectId: string): string {
    return path.join(input.resolveProjectPath(projectId), ".world-os", "author-control", "action-permissions.json");
  }

  function read(projectId: string): BrokerState {
    const filePath = statePath(projectId);
    if (!existsSync(filePath)) return { version: "story-studio-action-permission-broker/v1", profile: "general", updatedAt: now(), receipts: [], nuwaAuthorizations: [] };
    const value = JSON.parse(readFileSync(filePath, "utf8")) as Partial<BrokerState>;
    if (value.version !== "story-studio-action-permission-broker/v1" || !isProfile(value.profile) || !Array.isArray(value.receipts)) throw new Error("Action permission record is invalid.");
    return {
      version: value.version,
      profile: value.profile,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now(),
      receipts: value.receipts.slice(-200).map(normalizeReceipt),
      nuwaAuthorizations: Array.isArray(value.nuwaAuthorizations) ? value.nuwaAuthorizations.map((entry) => normalizeAuthorization(projectId, entry)) : []
    };
  }

  function save(projectId: string, state: BrokerState): BrokerState {
    const filePath = statePath(projectId);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, filePath);
    return state;
  }

  function record(projectId: string, request: { actor: ActionPermissionReceipt["actor"]; action: AgentActionKind; targets?: string[]; targetType?: string; checkpointId?: string | null; estimatedProviderCost?: number; authorConfirmed?: boolean; authorConfirmationChannel?: "trusted-server-route"; authorizationId?: string | null }): ActionPermissionReceipt {
    const current = read(projectId);
    const authorization = request.authorizationId ? activeAuthorization(current, request.authorizationId, now()) : null;
    const decision = decide(current.profile, request.action, request.actor, authorization, request.targets || [], request.targetType || "project");
    const actionClass = classify(request.action);
    const requiresConfirmation = decision.outcome === "requires-author";
    const authorAction = requiresConfirmation && request.authorConfirmed === true && (request.actor === "author" || request.authorConfirmationChannel === "trusted-server-route");
    const receipt: ActionPermissionReceipt = {
      id: `activity-${createHash("sha256").update(`${projectId}:${request.actor}:${request.action}:${now()}:${randomUUID()}`).digest("hex").slice(0, 20)}`,
      recordedAt: now(), actor: request.actor, action: request.action,
      targets: [...new Set((request.targets || []).map((value) => String(value).trim()).filter(Boolean))].slice(0, 24),
      outcome: authorAction ? "allowed" : decision.outcome,
      reason: authorAction ? `${decision.reason} 当前操作已由作者明确发起。` : decision.reason,
      reversible: !protectedActions.has(request.action), checkpointId: request.checkpointId || null,
      actionClass, projectScope: projectId, targetType: request.targetType || "project", riskLevel: riskFor(request.action), estimatedProviderCost: Math.max(0, Number(request.estimatedProviderCost || 0)), requiredPermission: requiredPermission(request.action),
      decisionSource: authorAction ? "author-action" : authorization && decision.outcome === "allowed" ? "nuwa-scope-authorization" : "policy",
      authorizationId: authorization && decision.outcome === "allowed" ? authorization.id : null
    };
    save(projectId, { ...current, updatedAt: receipt.recordedAt, receipts: [...current.receipts, receipt].slice(-200) });
    return receipt;
  }

  return {
    read,
    setProfile(inputValue: { projectId: string; profile: AgentPermissionProfile }) {
      if (!isProfile(inputValue.profile)) throw new Error("Unknown agent permission profile.");
      const current = read(inputValue.projectId);
      return save(inputValue.projectId, { ...current, profile: inputValue.profile, updatedAt: now() });
    },
    grantNuwaFullAccess(inputValue: { projectId: string; runId: string; storyUnitId: string; storyUnitRevision: string; actorIds: string[]; relationTypeId?: string | null; relationTypeRevision?: number | null; sourceOperationId: string; maxSteps?: number; maxProviderDispatches?: number; expiresAt?: string | null }) {
      const current = read(inputValue.projectId);
      if (current.profile !== "full-access") throw new Error("只有高权限档位可以建立女娲正式写入范围授权。");
      const actorIds = [...new Set(inputValue.actorIds.map((value) => String(value).trim()).filter(Boolean))];
      if (!inputValue.runId || !inputValue.storyUnitId || !inputValue.storyUnitRevision || actorIds.length < 2 || actorIds.length > 3) throw new Error("女娲范围授权缺少稳定运行、故事单元或角色范围。");
      if (!inputValue.sourceOperationId || inputValue.sourceOperationId.length > 160) throw new Error("女娲范围授权缺少稳定开始操作身份。");
      const relationTypeId = inputValue.relationTypeId == null ? null : String(inputValue.relationTypeId).trim();
      const relationTypeRevision = relationTypeId == null ? null : Number(inputValue.relationTypeRevision);
      if (relationTypeId === "" || (relationTypeRevision != null && (!Number.isSafeInteger(relationTypeRevision) || relationTypeRevision < 1))) throw new Error("女娲范围授权的关系类型版本无效。");
      const existing = current.nuwaAuthorizations.find((entry) => entry.sourceOperationId === inputValue.sourceOperationId);
      if (existing) return existing;
      const grantedAt = now();
      const authorization: NuwaFullAccessAuthorization = {
        id: `nuwa-scope.${createHash("sha256").update(`${inputValue.projectId}:${inputValue.sourceOperationId}:${inputValue.storyUnitId}:${inputValue.storyUnitRevision}`).digest("hex").slice(0, 20)}`,
        subject: "nuwa-n1", projectId: inputValue.projectId, runId: inputValue.runId, storyUnitId: inputValue.storyUnitId, storyUnitRevision: inputValue.storyUnitRevision, actorIds, relationTypeId, relationTypeRevision,
        allowedActions: ["confirmed-event", "library-write", "event-impact-review"], maxSteps: bounded(inputValue.maxSteps, 6), maxProviderDispatches: bounded(inputValue.maxProviderDispatches, 12),
        status: "active", grantedAt, expiresAt: inputValue.expiresAt || null, grantedBy: "author", sourceOperationId: inputValue.sourceOperationId, revokedAt: null, revokeReason: null
      };
      save(inputValue.projectId, { ...current, updatedAt: grantedAt, nuwaAuthorizations: [...current.nuwaAuthorizations, authorization].slice(-40) });
      return authorization;
    },
    revokeNuwaFullAccess(inputValue: { projectId: string; authorizationId: string; reason: string }) {
      const current = read(inputValue.projectId);
      const revokedAt = now();
      let found = false;
      const nuwaAuthorizations = current.nuwaAuthorizations.map((entry) => {
        if (entry.id !== inputValue.authorizationId) return entry;
        found = true;
        return { ...entry, status: "revoked" as const, revokedAt, revokeReason: requiredReason(inputValue.reason) };
      });
      if (!found) throw new Error("女娲范围授权不存在。");
      return save(inputValue.projectId, { ...current, updatedAt: revokedAt, nuwaAuthorizations });
    },
    record
  };
}

function isProfile(value: unknown): value is AgentPermissionProfile {
  return value === "general" || value === "auto-review" || value === "full-access";
}

function decide(profile: AgentPermissionProfile, action: AgentActionKind, actor: ActionPermissionReceipt["actor"], authorization: NuwaFullAccessAuthorization | null, targets: string[], targetType: string): Pick<ActionPermissionReceipt, "outcome" | "reason"> {
  if (protectedActions.has(action)) {
    if (action === "confirmed-event" && profile === "full-access" && actor === "nuwa" && authorization && authorization.allowedActions.includes("confirmed-event") && targetType === "nuwa-run" && matchesNuwaScope(authorization, targets)) {
      return { outcome: "allowed", reason: "女娲在作者已生效的范围授权内执行可回溯正式故事写入。" };
    }
    return { outcome: "requires-author", reason: "此操作受硬保护，始终需要作者明确确认。" };
  }
  if (profile === "full-access" && actor === "nuwa" && authorization && authorization.allowedActions.includes(action as "library-write" | "event-impact-review") && targetType === "nuwa-run" && matchesNuwaScope(authorization, targets)) {
    return { outcome: "allowed", reason: "女娲在作者已生效的范围授权内执行允许的可回溯故事变化。" };
  }
  if (profile === "full-access") return { outcome: "allowed", reason: "当前项目已授予完全访问；操作仍保留可读回执。" };
  if (profile === "auto-review" && autoAllowed.has(action)) return { outcome: "allowed", reason: "自动审查允许此类低风险、可撤销操作。" };
  if (action === "read-context") return { outcome: "allowed", reason: "读取当前页面和作者明确选择的上下文始终受限允许。" };
  return { outcome: "requires-author", reason: "当前权限需要作者逐次确认此持久或高影响操作。" };
}

function classify(action: AgentActionKind): ActionPermissionReceipt["actionClass"] {
  if (action === "read-context") return "read";
  if (action === "draft-write" || action === "temporary-character") return "draft";
  if (action === "event-impact-review") return "review";
  if (action === "external-action") return "external";
  if (protectedActions.has(action)) return "protected";
  return "persistent";
}
function riskFor(action: AgentActionKind): ActionPermissionReceipt["riskLevel"] {
  if (action === "external-action" || action === "permanent-delete") return "critical";
  if (protectedActions.has(action)) return "high";
  if (action === "library-write" || action === "event-impact-review") return "medium";
  return "low";
}
function requiredPermission(action: AgentActionKind): ActionPermissionReceipt["requiredPermission"] {
  if (protectedActions.has(action)) return "author-confirmation";
  if (autoAllowed.has(action)) return "auto-review";
  return "general";
}

function normalizeReceipt(value: ActionPermissionReceipt): ActionPermissionReceipt {
  return { ...value, decisionSource: value.decisionSource || "policy", authorizationId: value.authorizationId || null };
}

function normalizeAuthorization(projectId: string, value: unknown): NuwaFullAccessAuthorization {
  if (!value || typeof value !== "object") throw new Error("Nuwa scope authorization is invalid.");
  const item = value as Partial<NuwaFullAccessAuthorization>;
  if (item.subject !== "nuwa-n1" || item.projectId !== projectId || !item.id || !item.runId || !item.storyUnitId || !item.storyUnitRevision || !Array.isArray(item.actorIds) || !Array.isArray(item.allowedActions) || !["active", "revoked", "expired"].includes(String(item.status))) throw new Error("Nuwa scope authorization is invalid.");
  return {
    id: item.id, subject: "nuwa-n1", projectId, runId: item.runId, storyUnitId: item.storyUnitId, storyUnitRevision: item.storyUnitRevision, actorIds: item.actorIds.map(String), relationTypeId: typeof item.relationTypeId === "string" && item.relationTypeId.trim() ? item.relationTypeId : null, relationTypeRevision: Number.isSafeInteger(item.relationTypeRevision) && Number(item.relationTypeRevision) > 0 ? Number(item.relationTypeRevision) : null,
    allowedActions: item.allowedActions.filter((action): action is NuwaFullAccessAuthorization["allowedActions"][number] => action === "confirmed-event" || action === "library-write" || action === "event-impact-review"),
    maxSteps: bounded(item.maxSteps, 6), maxProviderDispatches: bounded(item.maxProviderDispatches, 12), status: item.status as NuwaFullAccessAuthorization["status"],
    grantedAt: String(item.grantedAt || ""), expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : null, grantedBy: "author", sourceOperationId: String(item.sourceOperationId || ""),
    revokedAt: typeof item.revokedAt === "string" ? item.revokedAt : null, revokeReason: typeof item.revokeReason === "string" ? item.revokeReason : null
  };
}

function activeAuthorization(state: BrokerState, authorizationId: string, at: string): NuwaFullAccessAuthorization | null {
  const authorization = state.nuwaAuthorizations.find((item) => item.id === authorizationId) || null;
  if (!authorization || authorization.status !== "active") return null;
  if (authorization.expiresAt && Date.parse(authorization.expiresAt) <= Date.parse(at)) return null;
  return authorization;
}

function matchesNuwaScope(authorization: NuwaFullAccessAuthorization, targets: string[]): boolean {
  return targets.includes(authorization.runId) && targets.includes(authorization.storyUnitId) && authorization.actorIds.every((actorId) => targets.includes(actorId));
}

function bounded(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 12 ? number : fallback;
}

function requiredReason(value: string): string {
  const reason = String(value || "").trim();
  if (!reason || reason.length > 500) throw new Error("撤销原因无效。");
  return reason;
}
