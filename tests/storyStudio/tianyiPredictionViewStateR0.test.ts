import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  predictionSourceSummary,
  predictionStageForView,
  predictionViewAfterEscape,
  predictionViewAfterPathSelection,
  predictionViewStateFromDraftedReceiptRecovery,
  predictionViewStateFromPersistence
} from "../../apps/story-studio/src/components/tianyi/sidebar/tianyiPredictionViewState.ts";

test("persistent Run state maps to a view without inventing domain progress", () => {
  assert.equal(predictionViewStateFromPersistence({ runStatus: null, hasBundle: false, selectedPathId: null, hasReceipt: false }), "task");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "generating", hasBundle: false, selectedPathId: null, hasReceipt: false }), "running");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "validating", hasBundle: false, selectedPathId: null, hasReceipt: false }), "running");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "ready", hasBundle: true, selectedPathId: null, hasReceipt: false }), "overview");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "ready", hasBundle: true, selectedPathId: "prediction-path.one", hasReceipt: false }), "focus");
  assert.equal(predictionViewStateFromPersistence({ runStatus: "ready", hasBundle: true, selectedPathId: "prediction-path.one", hasReceipt: true }), "receipt");
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

test("the drafted receipt recovery effect invalidates stale responses after a terminal Run update", () => {
  const panel = readFileSync("apps/story-studio/src/components/tianyi/sidebar/MultiNodePredictionPanel.tsx", "utf8");
  assert.match(panel, /predictionViewStateFromDraftedReceiptRecovery\(\{ runStatus: run\.status/u);
  assert.match(panel, /receiptRecoveryGeneration\.current !== generation/u);
  assert.match(panel, /setObservedRun\(abandoned\)/u);
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
