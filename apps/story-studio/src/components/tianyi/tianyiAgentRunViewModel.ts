import type { AgentPermissionProfile, TianyiAgentRunProjection } from "../../lib/localTransport";
import type { CapabilityPermissionIntent } from "./capability-launcher/capabilityMenuTypes";

/** Shared presentation selectors for full Tianyi and the compact shell projection. */
export function tianyiAgentRunStorageKey(projectId: string, workVersionId: string, sessionId: string | null): string {
  return `tianyi-agent-run:${projectId}:${workVersionId}:${sessionId ?? "none"}`;
}

export function currentTianyiAgentStep(run: TianyiAgentRunProjection | null) {
  return run?.plan.find((step) => step.status === "awaiting_author") ?? null;
}

/**
 * Browser recovery and stream completion are independent reads of the same
 * durable run.  A stale response must not make a successfully cancelled run
 * actionable again.
 */
export function shouldCommitTianyiAgentRunProjection(current: TianyiAgentRunProjection | null, next: TianyiAgentRunProjection): boolean {
  if (!current || current.runId !== next.runId) return true;
  if (current.status === "cancelled" && next.status !== "cancelled") return false;
  return next.revision >= current.revision;
}

/** Only intents backed by the established permission broker are selectable. */
export function agentPermissionProfileForIntent(intent: CapabilityPermissionIntent): AgentPermissionProfile | null {
  if (intent === "read-only") return "general";
  if (intent === "candidate") return "auto-review";
  return null;
}

/** Synchronous guard for an author action while React state is still updating. */
export function createTianyiSubmitGate() {
  let inFlight = false;
  return {
    tryEnter() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    leave() { inFlight = false; },
    get inFlight() { return inFlight; }
  };
}
