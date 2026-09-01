import assert from "node:assert/strict";
import test from "node:test";

import {
  predictionSourceSummary,
  predictionStageForView,
  predictionViewAfterEscape,
  predictionViewAfterPathSelection,
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
