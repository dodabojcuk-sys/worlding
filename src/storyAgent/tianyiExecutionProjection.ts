import { validateTianyiAgentExecutionProjection, type TianyiAgentExecutionAttempt, type TianyiAgentExecutionEdge, type TianyiAgentExecutionNode, type TianyiAgentExecutionProjection, type TianyiAgentRuntimeEvent } from "../storyContracts/tianyiAgentMode.ts";

export function projectTianyiAgentExecution(input: { projectId: string; runId: string; attemptId: string; timeoutMs: number; events: TianyiAgentRuntimeEvent[]; previousAttempts?: TianyiAgentExecutionAttempt[] }): TianyiAgentExecutionProjection {
  const events = input.events.filter((event) => event.runId === input.runId && event.attemptId === input.attemptId);
  const nodes = new Map<string, TianyiAgentExecutionNode>();
  const order: string[] = [];
  const ensure = (node: TianyiAgentExecutionNode) => {
    if (!nodes.has(node.id)) order.push(node.id);
    nodes.set(node.id, { ...(nodes.get(node.id) ?? node), ...node });
  };
  for (const event of events) {
    if (event.type === "TianyiAgentNodeStarted") ensure(node(event.nodeId, event.nodeKind, event.title, "运行中", "running", event.recordedAt, null, null, null, 0, null, null));
    else if (event.type === "TianyiAgentNodeCompleted") {
      const current = nodes.get(event.nodeId) ?? node(event.nodeId, "process", event.nodeId, event.summary, "waiting", null, null, null, null, 0, null, null);
      ensure({ ...current, summary: event.summary, status: event.status, completedAt: event.recordedAt, durationMs: duration(current.startedAt, event.recordedAt) });
    } else if (event.type === "TianyiAgentToolStarted") ensure(node(event.nodeId, "tool", toolTitle(event.toolName), "受控工具正在运行", "running", event.recordedAt, null, null, event.toolName, 1, event.safeInput, null));
    else if (event.type === "TianyiAgentToolCompleted") {
      const current = nodes.get(event.nodeId) ?? node(event.nodeId, "tool", toolTitle(event.toolName), "受控工具", "waiting", null, null, null, event.toolName, 1, null, null);
      ensure({ ...current, summary: "受控工具调用完成", status: "success", completedAt: event.recordedAt, durationMs: duration(current.startedAt, event.recordedAt), safeOutput: event.safeOutput });
    } else if (event.type === "TianyiAgentGateCompleted") {
      ensure(node(event.nodeId, "gate", gateTitle(event.gate), event.summary, event.outcome === "pass" ? "success" : event.outcome === "warning" ? "warning" : "blocked", event.recordedAt, event.recordedAt, 0, null, 1, null, { outcome: event.outcome }));
    } else if (event.type === "TianyiAgentCandidatesReady") {
      ensure(node(event.nodeId, "result", "候选路径已就绪", `${event.pathCount} 条路径 · ${event.warningCount} 项需审阅`, "success", event.recordedAt, event.recordedAt, 0, null, 1, null, { pathCount: event.pathCount, warningCount: event.warningCount }));
    }
  }
  const orderedNodes = order.map((id) => nodes.get(id)!);
  const terminal = events.at(-1);
  const status = terminal?.type === "TianyiAgentCandidatesReady" ? "candidates_ready"
    : terminal?.type === "TianyiAgentRunFailed" ? "failed"
      : terminal?.type === "TianyiAgentRunStopped" ? "stopped"
        : terminal?.type === "TianyiAgentGateCompleted" ? "validating"
          : orderedNodes.some((item) => item.kind === "tool" && item.status === "running") ? "waiting_for_tool"
            : events.length ? "running" : "queued";
  const attempt: TianyiAgentExecutionAttempt = {
    attemptId: input.attemptId,
    status,
    createdAt: events[0]?.recordedAt ?? new Date(0).toISOString(),
    completedAt: ["candidates_ready", "failed", "stopped"].includes(status) ? terminal?.recordedAt ?? null : null,
    timeoutMs: input.timeoutMs,
    events: structuredClone(events),
    nodes: orderedNodes,
    edges: edges(orderedNodes, status)
  };
  const attempts = [...(input.previousAttempts ?? []).filter((item) => item.attemptId !== input.attemptId), attempt];
  return validateTianyiAgentExecutionProjection({ version: "tianyi-agent-execution-projection/v1", projectId: input.projectId, runId: input.runId, activeAttemptId: input.attemptId, attempts });
}

function node(id: string, kind: TianyiAgentExecutionNode["kind"], title: string, summary: string, status: TianyiAgentExecutionNode["status"], startedAt: string | null, completedAt: string | null, durationMs: number | null, toolName: string | null, callCount: number, safeInput: Record<string, unknown> | null, safeOutput: Record<string, unknown> | null): TianyiAgentExecutionNode {
  return { id, kind, title, summary, status, startedAt, completedAt, durationMs, toolName, callCount, safeInput, safeOutput };
}
function edges(nodes: TianyiAgentExecutionNode[], status: TianyiAgentExecutionAttempt["status"]): TianyiAgentExecutionEdge[] {
  return nodes.slice(1).map((target, index) => ({
    id: `agent-edge.${index + 1}`,
    sourceNodeId: nodes[index]!.id,
    targetNodeId: target.id,
    status: index === nodes.length - 2 && !["candidates_ready", "failed", "stopped"].includes(status) ? "active" : status === "failed" ? "failed" : status === "stopped" ? "stopped" : "complete",
    label: target.kind === "tool" ? "调用" : target.kind === "gate" ? "检查" : target.kind === "result" ? "输出" : "继续"
  }));
}
function duration(startedAt: string | null, completedAt: string): number | null { return startedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null; }
function toolTitle(name: string): string { return ({ load_context_pack: "读取 ContextPack", resolve_versioned_event_refs: "核对版本化事件依据", inspect_event_relations: "检查事件关系", inspect_time_constraints: "检查时间约束", evaluate_story_consistency: "评估故事一致性", emit_candidate_subgraph: "输出候选子图" } as Record<string, string>)[name] ?? name; }
function gateTitle(gate: "identity" | "time" | "consistency"): string { return gate === "identity" ? "身份与版本门禁" : gate === "time" ? "时间一致性门禁" : "故事一致性门禁"; }
