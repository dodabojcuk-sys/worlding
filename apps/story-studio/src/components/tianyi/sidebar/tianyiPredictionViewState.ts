import type { PredictionRunStatus } from "../../../../../../src/storyContracts/multiNodePrediction.ts";

export type TianyiPredictionViewState = "task" | "running" | "overview" | "focus" | "review" | "receipt";
export type TianyiPredictionStage = "task" | "running" | "candidates" | "review";
export type TianyiPredictionTerminalRunStatus = Extract<PredictionRunStatus, "abandoned" | "stale">;

// Component refs disappear whenever the shell remounts. Keep this UI-only,
// browser-lifetime fence separate from the persisted Run owner so a response
// captured before an author-terminal update cannot revive that Run afterwards.
const terminalPredictionRunStatuses = new Map<string, TianyiPredictionTerminalRunStatus>();

function terminalPredictionRunKey(projectId: string, runId: string): string {
  return `${projectId}:${runId}`;
}

export function predictionRunStatusAfterTerminalFence(input: {
  projectId: string;
  runId: string;
  incomingStatus: PredictionRunStatus;
}): PredictionRunStatus {
  const key = terminalPredictionRunKey(input.projectId, input.runId);
  const remembered = terminalPredictionRunStatuses.get(key) ?? null;
  // Explicit abandonment is the author decision that supersedes a stale
  // projection, matching the persisted Run owner's stale -> abandoned rule.
  if (input.incomingStatus === "abandoned") {
    terminalPredictionRunStatuses.set(key, "abandoned");
    return "abandoned";
  }
  if (remembered === "abandoned") return "abandoned";
  if (input.incomingStatus === "stale") {
    terminalPredictionRunStatuses.set(key, "stale");
    return "stale";
  }
  return remembered ?? input.incomingStatus;
}

export function predictionViewStateFromPersistence(input: {
  runStatus: PredictionRunStatus | null;
  hasBundle: boolean;
  selectedPathId: string | null;
  hasReceipt: boolean;
}): TianyiPredictionViewState {
  if (input.runStatus === "abandoned" || input.runStatus === "stale") return "task";
  if (input.hasReceipt) return "receipt";
  if (input.runStatus === "generating" || input.runStatus === "validating") return "running";
  if (input.runStatus === "ready" && input.hasBundle) return input.selectedPathId ? "focus" : "overview";
  return "task";
}

/** A retained draft receipt is historical evidence, not permission to reopen a terminal Run. */
export function predictionViewStateFromDraftedReceiptRecovery(input: {
  runStatus: PredictionRunStatus | null;
  hasDraftedReceipt: boolean;
}): "receipt" | null {
  if (!input.hasDraftedReceipt || input.runStatus === "abandoned" || input.runStatus === "stale") return null;
  return "receipt";
}

/** Owner-terminal Runs are monotonic: a delayed pre-terminal read cannot reactivate them. */
export function shouldApplyPredictionRunSnapshot(input: {
  terminalStatus: TianyiPredictionTerminalRunStatus | null;
  incomingStatus: PredictionRunStatus;
}): boolean {
  return input.terminalStatus === null
    || input.terminalStatus === input.incomingStatus
    || (input.terminalStatus === "stale" && input.incomingStatus === "abandoned");
}

/**
 * A local POST can persist the Owner write before its HTTP response reaches
 * the browser. Recover only the exact terminal Run; never infer success from
 * elapsed time or from a different history entry.
 */
export async function resolvePredictionAbandonment<T extends { runId: string; status: PredictionRunStatus }>(input: {
  runId: string;
  command: Promise<T>;
  readOwner: () => Promise<T | null>;
  wait: () => Promise<void>;
  isActive: () => boolean;
}): Promise<T> {
  const recover = async (): Promise<T> => {
    while (input.isActive()) {
      try {
        const persisted = await input.readOwner();
        if (persisted?.runId === input.runId && persisted.status === "abandoned") return persisted;
      } catch { /* a transient read cannot replace the command outcome */ }
      await input.wait();
    }
    return await new Promise<T>(() => undefined);
  };
  try {
    return await Promise.race([input.command, recover()]);
  } catch (error) {
    const persisted = await input.readOwner().catch(() => null);
    if (persisted?.runId === input.runId && persisted.status === "abandoned") return persisted;
    throw error;
  }
}

export function predictionStageForView(view: TianyiPredictionViewState): TianyiPredictionStage {
  if (view === "running") return "running";
  if (view === "overview" || view === "focus") return "candidates";
  if (view === "review" || view === "receipt") return "review";
  return "task";
}

export function predictionViewAfterPathSelection(pathId: string | null): TianyiPredictionViewState {
  return pathId ? "focus" : "overview";
}

export function predictionViewAfterEscape(view: TianyiPredictionViewState): TianyiPredictionViewState {
  return view === "focus" || view === "review" ? "overview" : view;
}

export function predictionSourceSummary(count: number, unitSummary?: string): string {
  const scope = unitSummary?.trim() || "当前事件范围";
  return `${count} 个节点 · ${scope}`;
}
