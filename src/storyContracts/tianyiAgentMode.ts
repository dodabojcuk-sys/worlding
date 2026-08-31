import type { StoryStudioEventReference } from "./storyStudioEventReference.ts";

export const TIANYI_DOCK_MODES = ["dialogue", "agent"] as const;
export type TianyiDockMode = typeof TIANYI_DOCK_MODES[number];

export type TianyiDialogueModeState = {
  mode: "dialogue";
  dialogueSessionId: string | null;
  dialogueComposerDraft: string;
};

export type TianyiCandidateReviewState = {
  runId: string | null;
  pathId: string | null;
  selectedCandidateNodeIds: string[];
};

export type TianyiAgentModeState = {
  mode: "agent";
  agentSessionId: string | null;
  activeAgentRunId: string | null;
  agentTaskDraft: string;
  selectedSourceEventRefs: StoryStudioEventReference[];
  candidateReviewState: TianyiCandidateReviewState;
};

export const TIANYI_GRAPH_LAYERS = ["EVENT_GRAPH", "CANDIDATE_EVENT_OVERLAY", "AGENT_EXECUTION_GRAPH"] as const;
export type TianyiGraphLayer = typeof TIANYI_GRAPH_LAYERS[number];

export const TIANYI_NODE_FAMILIES = [
  "FORMAL_EVENT_NODE",
  "CANDIDATE_EVENT_NODE",
  "COLLECTION_POINT_NODE",
  "AGENT_PROCESS_NODE",
  "AGENT_TOOL_NODE",
  "AGENT_GATE_NODE",
  "AGENT_RESULT_NODE"
] as const;
export type TianyiNodeFamily = typeof TIANYI_NODE_FAMILIES[number];

export const TIAN_YI_AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_for_tool",
  "validating",
  "candidates_ready",
  "failed",
  "stopped",
  "adopted_partially",
  "adopted_fully",
  "abandoned"
] as const;
export type TianyiAgentRunStatus = typeof TIAN_YI_AGENT_RUN_STATUSES[number];
export type TianyiExecutionNodeStatus = "waiting" | "running" | "success" | "warning" | "blocked" | "failed" | "stopped";
export type TianyiExecutionNodeKind = "process" | "tool" | "gate" | "result";

export type TianyiAgentExecutionNode = {
  id: string;
  kind: TianyiExecutionNodeKind;
  title: string;
  summary: string;
  status: TianyiExecutionNodeStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  toolName: string | null;
  callCount: number;
  safeInput: Record<string, unknown> | null;
  safeOutput: Record<string, unknown> | null;
};

export type TianyiAgentExecutionEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  status: "waiting" | "active" | "complete" | "failed" | "stopped";
  label: string;
};

export type TianyiAgentRuntimeEvent =
  | { type: "TianyiAgentRunStarted"; runId: string; attemptId: string; recordedAt: string }
  | { type: "TianyiAgentNodeStarted"; runId: string; attemptId: string; nodeId: string; nodeKind: "process" | "result"; title: string; recordedAt: string }
  | { type: "TianyiAgentNodeCompleted"; runId: string; attemptId: string; nodeId: string; status: "success" | "warning" | "blocked"; summary: string; recordedAt: string }
  | { type: "TianyiAgentToolStarted"; runId: string; attemptId: string; nodeId: string; toolName: string; safeInput: Record<string, unknown>; recordedAt: string }
  | { type: "TianyiAgentToolCompleted"; runId: string; attemptId: string; nodeId: string; toolName: string; safeOutput: Record<string, unknown>; recordedAt: string }
  | { type: "TianyiAgentGateCompleted"; runId: string; attemptId: string; nodeId: string; gate: "identity" | "time" | "consistency"; outcome: "pass" | "warning" | "blocked"; summary: string; recordedAt: string }
  | { type: "TianyiAgentCandidatesReady"; runId: string; attemptId: string; nodeId: string; pathCount: number; warningCount: number; recordedAt: string }
  | { type: "TianyiAgentRunFailed"; runId: string; attemptId: string; reason: string; retryable: boolean; timedOut: boolean; recordedAt: string }
  | { type: "TianyiAgentRunStopped"; runId: string; attemptId: string; reason: string; recordedAt: string };

export type TianyiAgentExecutionAttempt = {
  attemptId: string;
  status: TianyiAgentRunStatus;
  createdAt: string;
  completedAt: string | null;
  timeoutMs: number;
  events: TianyiAgentRuntimeEvent[];
  nodes: TianyiAgentExecutionNode[];
  edges: TianyiAgentExecutionEdge[];
};

export type TianyiAgentExecutionProjection = {
  version: "tianyi-agent-execution-projection/v1";
  projectId: string;
  runId: string;
  activeAttemptId: string;
  attempts: TianyiAgentExecutionAttempt[];
};

export function assertTianyiModeStateIsolation(input: { dialogue: TianyiDialogueModeState; agent: TianyiAgentModeState }): void {
  if (input.dialogue.mode !== "dialogue" || input.agent.mode !== "agent") throw new Error("Tianyi mode state is invalid.");
  if (input.dialogue.dialogueSessionId && input.dialogue.dialogueSessionId === input.agent.agentSessionId) throw new Error("Dialogue and Agent sessions must be independent.");
  if (input.dialogue.dialogueComposerDraft && input.dialogue.dialogueComposerDraft === input.agent.agentTaskDraft) throw new Error("Dialogue and Agent drafts must be independent values.");
  const dialogueKeys = new Set(Object.keys(input.dialogue));
  for (const key of ["agentSessionId", "activeAgentRunId", "agentTaskDraft", "selectedSourceEventRefs", "candidateReviewState"]) if (dialogueKeys.has(key)) throw new Error("Dialogue mode contains Agent state.");
  const agentKeys = new Set(Object.keys(input.agent));
  for (const key of ["dialogueSessionId", "dialogueComposerDraft", "messages", "composerDraft", "sessionId"]) if (agentKeys.has(key)) throw new Error("Agent mode contains dialogue state.");
}

export function assertTianyiGraphLayerNode(layer: TianyiGraphLayer, family: TianyiNodeFamily): void {
  const allowed: Record<TianyiGraphLayer, readonly TianyiNodeFamily[]> = {
    EVENT_GRAPH: ["FORMAL_EVENT_NODE", "COLLECTION_POINT_NODE"],
    CANDIDATE_EVENT_OVERLAY: ["CANDIDATE_EVENT_NODE"],
    AGENT_EXECUTION_GRAPH: ["AGENT_PROCESS_NODE", "AGENT_TOOL_NODE", "AGENT_GATE_NODE", "AGENT_RESULT_NODE"]
  };
  if (!allowed[layer].includes(family)) throw new Error(`${family} cannot appear in ${layer}.`);
}

export function validateTianyiAgentExecutionProjection(value: TianyiAgentExecutionProjection): TianyiAgentExecutionProjection {
  if (value.version !== "tianyi-agent-execution-projection/v1" || !value.projectId || !value.runId || !value.activeAttemptId) throw new Error("Agent execution projection is invalid.");
  if (!value.attempts.length || !value.attempts.some((attempt) => attempt.attemptId === value.activeAttemptId)) throw new Error("Agent execution attempt is missing.");
  for (const attempt of value.attempts) {
    if (!TIAN_YI_AGENT_RUN_STATUSES.includes(attempt.status) || attempt.timeoutMs < 1 || !Number.isFinite(attempt.timeoutMs)) throw new Error("Agent execution attempt is invalid.");
    const nodeIds = new Set(attempt.nodes.map((node) => node.id));
    if (nodeIds.size !== attempt.nodes.length) throw new Error("Agent execution nodes must be unique.");
    for (const node of attempt.nodes) {
      if (!["process", "tool", "gate", "result"].includes(node.kind)) throw new Error("Agent execution node kind is invalid.");
      if (node.kind === "tool" && !node.toolName) throw new Error("Agent tool node requires a tool name.");
      assertNoPrivateRuntimeData(node);
    }
    for (const edge of attempt.edges) if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) throw new Error("Agent execution edge is invalid.");
    for (const event of attempt.events) assertNoPrivateRuntimeData(event);
  }
  return structuredClone(value);
}

function assertNoPrivateRuntimeData(value: unknown): void {
  const forbidden = /^(?:prompt|systemPrompt|model|provider|apiKey|secret|credential|rawResponse|chainOfThought|privateReasoning|internalMessage)$/iu;
  const walk = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(walk);
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (forbidden.test(key)) throw new Error("Agent execution projection exposes private runtime data.");
      walk(child);
    }
  };
  walk(value);
}
