import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTianyiGraphLayerNode,
  assertTianyiModeStateIsolation,
  TIANYI_GRAPH_LAYERS,
  TIANYI_NODE_FAMILIES,
  validateTianyiAgentExecutionProjection,
  type TianyiAgentExecutionProjection
} from "../../src/storyContracts/tianyiAgentMode.ts";

test("dialogue and Agent state keep independent sessions, drafts and task state", () => {
  assert.doesNotThrow(() => assertTianyiModeStateIsolation({
    dialogue: { mode: "dialogue", dialogueSessionId: "dialogue.session", dialogueComposerDraft: "解释当前事件" },
    agent: { mode: "agent", agentSessionId: "agent.session", activeAgentRunId: "prediction-run.one", agentTaskDraft: "推演后续", selectedSourceEventRefs: [], candidateReviewState: { runId: null, pathId: null, selectedCandidateNodeIds: [] } }
  }));
  assert.throws(() => assertTianyiModeStateIsolation({
    dialogue: { mode: "dialogue", dialogueSessionId: "same", dialogueComposerDraft: "对话" },
    agent: { mode: "agent", agentSessionId: "same", activeAgentRunId: null, agentTaskDraft: "任务", selectedSourceEventRefs: [], candidateReviewState: { runId: null, pathId: null, selectedCandidateNodeIds: [] } }
  }), /independent/u);
});

test("three graph layers accept only their own semantic node families", () => {
  assert.deepEqual(TIANYI_GRAPH_LAYERS, ["EVENT_GRAPH", "CANDIDATE_EVENT_OVERLAY", "AGENT_EXECUTION_GRAPH"]);
  assert.equal(TIANYI_NODE_FAMILIES.length, 7);
  assert.doesNotThrow(() => assertTianyiGraphLayerNode("EVENT_GRAPH", "FORMAL_EVENT_NODE"));
  assert.doesNotThrow(() => assertTianyiGraphLayerNode("CANDIDATE_EVENT_OVERLAY", "CANDIDATE_EVENT_NODE"));
  assert.doesNotThrow(() => assertTianyiGraphLayerNode("AGENT_EXECUTION_GRAPH", "AGENT_TOOL_NODE"));
  assert.throws(() => assertTianyiGraphLayerNode("EVENT_GRAPH", "AGENT_PROCESS_NODE"), /cannot appear/u);
  assert.throws(() => assertTianyiGraphLayerNode("CANDIDATE_EVENT_OVERLAY", "FORMAL_EVENT_NODE"), /cannot appear/u);
});

test("execution projection rejects private Pi, Provider and reasoning data", () => {
  const projection: TianyiAgentExecutionProjection = {
    version: "tianyi-agent-execution-projection/v1",
    projectId: "project-fixture",
    runId: "prediction-run.fixture",
    activeAttemptId: "agent-attempt.fixture.1",
    attempts: [{
      attemptId: "agent-attempt.fixture.1", status: "candidates_ready", createdAt: "2026-08-31T00:00:00.000Z", completedAt: "2026-08-31T00:00:01.000Z", timeoutMs: 5_000,
      events: [{ type: "TianyiAgentCandidatesReady", runId: "prediction-run.fixture", attemptId: "agent-attempt.fixture.1", nodeId: "agent-result.candidates", pathCount: 3, warningCount: 1, recordedAt: "2026-08-31T00:00:01.000Z" }],
      nodes: [{ id: "agent-result.candidates", kind: "result", title: "候选路径", summary: "3 条路径", status: "success", startedAt: null, completedAt: "2026-08-31T00:00:01.000Z", durationMs: null, toolName: null, callCount: 0, safeInput: null, safeOutput: { pathCount: 3 } }],
      edges: []
    }]
  };
  assert.deepEqual(validateTianyiAgentExecutionProjection(projection), projection);
  assert.throws(() => validateTianyiAgentExecutionProjection({ ...projection, attempts: [{ ...projection.attempts[0]!, nodes: [{ ...projection.attempts[0]!.nodes[0]!, safeOutput: { chainOfThought: "hidden" } }] }] }), /private runtime/u);
});
