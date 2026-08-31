import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const canvas = source("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx");
const execution = source("apps/story-studio/src/components/tianyi/execution/AgentExecutionGraph.tsx");
const formalEvent = source("apps/story-studio/src/components/graph-nodes/FormalEventNode.tsx");
const candidateEvent = source("apps/story-studio/src/components/graph-nodes/CandidateEventNode.tsx");
const collectionPoint = source("apps/story-studio/src/components/graph-nodes/CollectionPointNode.tsx");
const nodeShell = source("apps/story-studio/src/components/graph-nodes/NodeShell.tsx");
const styles = source("apps/story-studio/src/styles/event-line-projection.css");
const predictionPanel = source("apps/story-studio/src/components/tianyi/sidebar/MultiNodePredictionPanel.tsx");

test("event, candidate overlay and Agent execution remain three explicit graph layers", () => {
  assert.match(canvas, /data-graph-layer="EVENT_GRAPH"/u);
  assert.match(canvas, /data-candidate-overlay=\{predictionPathId \? "visible" : "hidden"\}/u);
  assert.match(execution, /data-graph-layer="AGENT_EXECUTION_GRAPH"/u);
  assert.match(canvas, /<AgentExecutionGraph/u);
  assert.match(execution, /\u8fd4\u56de\u4e8b\u4ef6\u56fe/u);
  assert.match(canvas, /\u6267\u884c\u56fe\u53ea\u7531\u5b9e\u9645/u);
});

test("seven semantic node families have distinct product components", () => {
  assert.match(formalEvent, /family = props\.data\.remote \? "remote-event" : props\.data\.status === "\u8349\u7a3f"[\s\S]*"draft-event" : "formal-event"/u);
  assert.match(candidateEvent, /family="candidate-event"/u);
  assert.match(candidateEvent, /\u5019\u9009\uff0f\u5c1a\u672a\u5199\u5165/u);
  assert.match(collectionPoint, /family="collection-point"/u);
  assert.match(collectionPoint, /\u53ef\u9009\u96c6\u70b9 \u00b7 \u4e0d\u590d\u5236 Event/u);
  for (const family of ["agent-process", "agent-tool", "agent-gate", "agent-result"]) assert.match(execution, new RegExp(`family="${family}"`, "u"));
  assert.doesNotMatch(execution, /PredictionGraphNode|EventGraphNode/u);
});

test("shared ports expose 24px targets while families retain readable dimensions and states", () => {
  assert.match(nodeShell, /className="graph-node-port"/u);
  assert.match(nodeShell, /aria-label=\{props\.label\}/u);
  assert.match(styles, /\.graph-node-port\.react-flow__handle \{ inline-size: 1\.5rem; block-size: 1\.5rem;/u);
  assert.match(styles, /\.is-candidate-event \{ inline-size: 11\.25rem;/u);
  assert.match(styles, /\.is-agent-process \{[\s\S]*inline-size: 13\.75rem;/u);
  assert.match(styles, /\.is-agent-tool \{[\s\S]*border-radius: 1\.15rem/u);
  assert.match(styles, /\.is-agent-gate \{[\s\S]*border-radius: \.25rem \.9rem \.25rem \.9rem/u);
  assert.match(styles, /\.is-agent-result \{[\s\S]*inline-size: 16rem;/u);
  assert.match(styles, /\.agent-execution-edge\.is-active path \{ stroke-dasharray/u);
  assert.match(styles, /\.graph-node-shell:focus-visible/u);
});

test("execution detail is safe and never presents private runtime internals", () => {
  assert.match(execution, /safeInput/u);
  assert.match(execution, /safeOutput/u);
  assert.match(execution, /\u4e0d\u663e\u793a Prompt\u3001\u5bc6\u94a5\u3001\u539f\u59cb Provider \u54cd\u5e94\u6216\u6a21\u578b\u79c1\u6709\u601d\u7ef4\u94fe/u);
  assert.doesNotMatch(execution, /systemPrompt|chainOfThought|rawResponse|apiKey/u);
});

test("execution graph stop, retry, polling and refresh recovery remain product-owned", () => {
  assert.match(canvas, /story-studio-stop-agent-execution/u);
  assert.match(canvas, /story-studio-retry-agent-execution/u);
  assert.match(predictionPanel, /beginExecutionPolling/u);
  assert.match(predictionPanel, /getMultiNodePredictionExecution/u);
  assert.match(predictionPanel, /stopMultiNodePredictionRun/u);
  assert.match(predictionPanel, /retryMultiNodePredictionRun/u);
  assert.match(execution, /index \* 270/u);
  assert.match(execution, /\u4ece\u5de6\u5230\u53f3\u6267\u884c/u);
  assert.match(predictionPanel, /\u91cd\u65b0\u63a8\u6f14/u);
  assert.doesNotMatch(predictionPanel, /@earendil-works\/pi-/u);
});
