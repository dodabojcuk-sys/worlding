import type { PredictionRunStatus } from "../../../../../../src/storyContracts/multiNodePrediction.ts";

export type TianyiPredictionViewState = "task" | "running" | "overview" | "focus" | "review" | "receipt";
export type TianyiPredictionStage = "task" | "running" | "candidates" | "review";

export function predictionViewStateFromPersistence(input: {
  runStatus: PredictionRunStatus | null;
  hasBundle: boolean;
  selectedPathId: string | null;
  hasReceipt: boolean;
}): TianyiPredictionViewState {
  if (input.hasReceipt) return "receipt";
  if (input.runStatus === "generating" || input.runStatus === "validating") return "running";
  if (input.runStatus === "ready" && input.hasBundle) return input.selectedPathId ? "focus" : "overview";
  return "task";
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
