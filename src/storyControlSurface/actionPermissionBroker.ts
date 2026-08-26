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
};

type BrokerState = {
  version: "story-studio-action-permission-broker/v1";
  profile: AgentPermissionProfile;
  updatedAt: string;
  receipts: ActionPermissionReceipt[];
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
    if (!existsSync(filePath)) return { version: "story-studio-action-permission-broker/v1", profile: "general", updatedAt: now(), receipts: [] };
    const value = JSON.parse(readFileSync(filePath, "utf8")) as Partial<BrokerState>;
    if (value.version !== "story-studio-action-permission-broker/v1" || !isProfile(value.profile) || !Array.isArray(value.receipts)) throw new Error("Action permission record is invalid.");
    return { version: value.version, profile: value.profile, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now(), receipts: value.receipts.slice(-200) };
  }

  function save(projectId: string, state: BrokerState): BrokerState {
    const filePath = statePath(projectId);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, filePath);
    return state;
  }

  function record(projectId: string, request: { actor: ActionPermissionReceipt["actor"]; action: AgentActionKind; targets?: string[]; targetType?: string; checkpointId?: string | null; estimatedProviderCost?: number; authorConfirmed?: boolean }): ActionPermissionReceipt {
    const current = read(projectId);
    const decision = decide(current.profile, request.action);
    const actionClass = classify(request.action);
    const requiresConfirmation = decision.outcome === "requires-author";
    const receipt: ActionPermissionReceipt = {
      id: `activity-${createHash("sha256").update(`${projectId}:${request.actor}:${request.action}:${now()}:${randomUUID()}`).digest("hex").slice(0, 20)}`,
      recordedAt: now(), actor: request.actor, action: request.action,
      targets: [...new Set((request.targets || []).map((value) => String(value).trim()).filter(Boolean))].slice(0, 24),
      outcome: requiresConfirmation && request.authorConfirmed ? "allowed" : decision.outcome,
      reason: requiresConfirmation && request.authorConfirmed ? `${decision.reason} 当前操作已由作者明确发起。` : decision.reason,
      reversible: !protectedActions.has(request.action), checkpointId: request.checkpointId || null,
      actionClass, projectScope: projectId, targetType: request.targetType || "project", riskLevel: riskFor(request.action), estimatedProviderCost: Math.max(0, Number(request.estimatedProviderCost || 0)), requiredPermission: requiredPermission(request.action)
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
    record
  };
}

function isProfile(value: unknown): value is AgentPermissionProfile {
  return value === "general" || value === "auto-review" || value === "full-access";
}

function decide(profile: AgentPermissionProfile, action: AgentActionKind): Pick<ActionPermissionReceipt, "outcome" | "reason"> {
  if (protectedActions.has(action)) return { outcome: "requires-author", reason: "此操作受硬保护，始终需要作者明确确认。" };
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
