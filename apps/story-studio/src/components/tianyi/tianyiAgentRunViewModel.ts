import type { TianyiAgentRunProjection } from "../../lib/localTransport";

/** Shared presentation selectors for full Tianyi and the compact shell projection. */
export function tianyiAgentRunStorageKey(projectId: string, sessionId: string | null): string {
  return `tianyi-agent-run:${projectId}:${sessionId ?? "none"}`;
}

export function currentTianyiAgentStep(run: TianyiAgentRunProjection | null) {
  return run?.plan.find((step) => step.status === "awaiting_author") ?? null;
}
