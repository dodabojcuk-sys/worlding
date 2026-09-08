import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearPredictionAbandonmentPending,
  isPredictionAbandonmentPending,
  markPredictionAbandonmentPending,
  predictionSourceSummary,
  predictionStageForView,
  predictionRunStatusAfterTerminalFence,
  resolvePredictionAbandonment,
  shouldApplyPredictionRunSnapshot,
  predictionViewAfterEscape,
  predictionViewAfterPathSelection,
  predictionViewStateFromDraftedReceiptRecovery,
  predictionViewStateFromPersistence
} from "../../apps/story-studio/src/components/tianyi/sidebar/tianyiPredictionViewState.ts";

test("pending abandonment identity survives a panel instance and remains project scoped", () => {
  const projectId = "project.pending-abandonment";
  const runId = "prediction-run.pending-abandonment";
  clearPredictionAbandonmentPending(projectId, runId);
  markPredictionAbandonmentPending(projectId, runId);
  assert.equal(isPredictionAbandonmentPending(projectId, runId), true);
  assert.equal(isPredictionAbandonmentPending("project.other", runId), false);
  assert.equal(isPredictionAbandonmentPending(projectId, "prediction-run.other"), false);
  clearPredictionAbandonmentPending(projectId, runId);
  assert.equal(isPredictionAbandonmentPending(projectId, runId), false);
});

test("persistent Run state maps to a view without inventing domain progress", () => {
  assert.equal(predictionViewStateFromPersistence({ runStatus: null, hasBundle: false, selectedPathId: null, hasReceipt: false }), "task");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "generating", hasBundle: false, selectedPathId: null, hasReceipt: false }), "running");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "validating", hasBundle: false, selectedPathId: null, hasReceipt: false }), "running");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "ready", hasBundle: true, selectedPathId: null, hasReceipt: false }), "overview");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "ready", hasBundle: true, selectedPathId: "prediction-path.one", hasReceipt: false }), "focus");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "ready", hasBundle: true, selectedPathId: "prediction-path.one", hasReceipt: true }), "receipt");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "abandoned", hasBundle: true, selectedPathId: "prediction-path.one", hasReceipt: true }), "task");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "stale", hasBundle: true, selectedPathId: "prediction-path.one", hasReceipt: true }), "task");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "failed", hasBundle: false, selectedPathId: null, hasReceipt: false }), "task");
});

test("candidate navigation keeps a separate presentation state", () => {
  assert.equal(predictionViewAfterPathSelection("prediction-path.one"), "focus");
  assert.equal(predictionViewAfterPathSelection(null), "overview");
  assert.equal(predictionViewAfterEscape("focus"), "overview");
  assert.equal(predictionViewAfterEscape("review"), "overview");
  assert.equal(predictionViewAfterEscape("running"), "running");
});

test("drafted receipt recovery never reopens a terminal abandoned or stale Run", () => {
  assert.equal(predictionViewStateFromDraftedReceiptRecovery({ runStatus: "ready", hasDraftedReceipt: true }), "receipt");
  assert.equal(predictionViewStateFromDraftedReceiptRecovery({ runStatus: "abandoned", hasDraftedReceipt: true }), null);
  assert.equal(predictionViewStateFromDraftedReceiptRecovery({ runStatus: "stale", hasDraftedReceipt: true }), null);
  assert.equal(predictionViewStateFromDraftedReceiptRecovery({ runStatus: "ready", hasDraftedReceipt: false }), null);
});

test("an older non-terminal Run snapshot cannot overwrite a terminal owner state", () => {
  assert.equal(shouldApplyPredictionRunSnapshot({ terminalStatus: "abandoned", incomingStatus: "ready" }), false);
  assert.equal(shouldApplyPredictionRunSnapshot({ terminalStatus: "stale", incomingStatus: "ready" }), false);
  assert.equal(shouldApplyPredictionRunSnapshot({ terminalStatus: "abandoned", incomingStatus: "abandoned" }), true);
  assert.equal(shouldApplyPredictionRunSnapshot({ terminalStatus: "stale", incomingStatus: "abandoned" }), true);
  assert.equal(shouldApplyPredictionRunSnapshot({ terminalStatus: null, incomingStatus: "ready" }), true);
});

test("a persisted abandonment recovers the exact Run while its command response is still pending", async () => {
  const runId = "prediction-run.response-lost";
  let reads = 0;
  const never = new Promise<never>(() => undefined);
  const recovered = await resolvePredictionAbandonment({
    runId,
    command: never,
    async readOwner() {
      reads += 1;
      return { runId, status: reads === 1 ? "ready" as const : "abandoned" as const };
    },
    async wait() { /* advance the deterministic test loop without wall-clock delay */ },
    isActive: () => true
  });
  assert.equal(reads, 2);
  assert.deepEqual(recovered, { runId, status: "abandoned" });
});

test("a terminal prediction fence survives a panel remount and projects an older ready replay as terminal", () => {
  const projectId = "project.remount-terminal-fence";
  const runId = "prediction-run.remount-terminal-fence";
  assert.equal(predictionRunStatusAfterTerminalFence({ projectId, runId, incomingStatus: "abandoned" }), "abandoned");
  // A new panel instance has no local refs. Its replay/history reader must still
  // see the author-terminal projection rather than reactivate the ready bundle.
  assert.equal(predictionRunStatusAfterTerminalFence({ projectId, runId, incomingStatus: "ready" }), "abandoned");
  assert.equal(shouldApplyPredictionRunSnapshot({ terminalStatus: "abandoned", incomingStatus: "abandoned" }), true);
});

test("the drafted receipt recovery effect invalidates stale responses after a terminal Run update", () => {
  const panel = readFileSync("apps/story-studio/src/components/tianyi/sidebar/MultiNodePredictionPanel.tsx", "utf8");
  assert.match(panel, /predictionViewStateFromDraftedReceiptRecovery\(\{ runStatus: run\.status/u);
  assert.match(panel, /receiptRecoveryGeneration\.current !== generation/u);
  assert.match(panel, /setObservedRun\(abandoned\)/u);
  assert.match(panel, /shouldApplyPredictionRunSnapshot\(\{ terminalStatus, incomingStatus: observed\.status \}\)/u);
  assert.match(panel, /predictionRunStatusAfterTerminalFence\(\{ projectId: project\.id, runId: next\.runId, incomingStatus: next\.status \}\)/u);
  assert.match(panel, /const status = predictionRunStatusAfterTerminalFence\(\{ projectId, runId: replay\.runId, incomingStatus: replay\.status \}\)/u);
  assert.match(panel, /historyLoadGeneration\.current \+= 1/u);
  assert.match(panel, /runRecoveryGeneration\.current \+= 1/u);
  assert.match(panel, /terminalRunIds\.current\.has\(detail\?\.runId \|\| ""\)/u);
  assert.match(panel, /if \(!run \|\| terminalRunIds\.current\.has\(detail\?\.runId \|\| ""\) \|\| \["abandoned", "stale"\]\.includes\(run\.status\) \|\| detail\?\.origin !== "canvas"/u);
  assert.match(panel, /if \(!run \|\| !\["abandoned", "stale"\]\.includes\(run\.status\)\) return;/u);
  assert.match(panel, /const observedReady = setObservedRun\(ready\) \?\? ready;/u);
  assert.match(panel, /predictionViewStateFromPersistence\(\{ runStatus: observedReady\.status, hasBundle: Boolean\(observedReady\.bundle\), selectedPathId: null, hasReceipt: false \}\)/u);
});

test("the four author stages remain stable across detailed candidate views", () => {
  assert.equal(predictionStageForView("task"), "task");
  assert.equal(predictionStageForView("running"), "running");
  assert.equal(predictionStageForView("overview"), "candidates");
  assert.equal(predictionStageForView("focus"), "candidates");
  assert.equal(predictionStageForView("review"), "review");
  assert.equal(predictionStageForView("receipt"), "review");
});

test("Tianyi receives a compact count and Unit summary instead of a duplicate source list", () => {
  assert.equal(predictionSourceSummary(3, "单元 01 · 雾港"), "3 个节点 · 单元 01 · 雾港");
  assert.equal(predictionSourceSummary(2), "2 个节点 · 当前事件范围");
});
