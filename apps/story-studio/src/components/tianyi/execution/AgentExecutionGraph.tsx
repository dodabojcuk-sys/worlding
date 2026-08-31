import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, ArrowLeft, Braces, CheckCircle2, CircleDashed, GitBranch, OctagonX, RotateCcw, ShieldCheck, Square, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import type { TianyiAgentExecutionNode, TianyiAgentExecutionProjection } from "../../../../../../src/storyContracts/tianyiAgentMode.ts";
import { GraphPort, NodeShell } from "../../graph-nodes/NodeShell";

type ExecutionNodeData = TianyiAgentExecutionNode & { onOpenCandidates?(): void };
const nodeTypes = { process: AgentProcessNode, tool: AgentToolNode, gate: AgentGateNode, result: AgentResultNode };

export function AgentExecutionGraph(props: { projection: TianyiAgentExecutionProjection; onReturn(): void; onOpenCandidates(): void; onStop?(): void; onRetry?(): void }) {
  const attempt = props.projection.attempts.find((item) => item.attemptId === props.projection.activeAttemptId) ?? props.projection.attempts.at(-1)!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = attempt.nodes.find((node) => node.id === selectedId) ?? null;
  const terminalEvent = [...attempt.events].reverse().find((event) => event.type === "TianyiAgentRunFailed" || event.type === "TianyiAgentRunStopped");
  const graph = useMemo(() => executionGraph(attempt.nodes, attempt.edges, props.onOpenCandidates), [attempt.edges, attempt.nodes, props.onOpenCandidates]);
  return <section className="agent-execution-workspace" aria-label="Agent 执行过程" data-graph-layer="AGENT_EXECUTION_GRAPH">
    <header><div><small>天意 Agent</small><strong>Agent 执行过程</strong><span>Attempt {attempt.attemptId.slice(-8)} · {runStatusLabel(attempt.status)}</span></div><nav><button type="button" onClick={props.onReturn}><ArrowLeft aria-hidden="true" />返回事件图</button>{["running", "waiting_for_tool", "validating"].includes(attempt.status) ? <button type="button" className="is-stop" onClick={props.onStop}><Square aria-hidden="true" />停止</button> : null}{["failed", "stopped"].includes(attempt.status) ? <button type="button" onClick={props.onRetry}><RotateCcw aria-hidden="true" />新 Attempt 重试</button> : null}</nav></header>
    {terminalEvent ? <p className="agent-execution-outcome" role={terminalEvent.type === "TianyiAgentRunFailed" ? "alert" : "status"} data-outcome={terminalEvent.type === "TianyiAgentRunFailed" ? terminalEvent.timedOut ? "timeout" : "failed" : "stopped"}><strong>{terminalEvent.type === "TianyiAgentRunFailed" ? terminalEvent.timedOut ? "运行超时" : "运行失败" : "作者已停止"}</strong><span>{terminalEvent.reason}</span><small>未产生正式 Event、Relation、Canon 或 WorldState 写入。</small></p> : null}
    <div className={`agent-execution-main ${selected ? "has-detail" : ""}`}>
      <div className="agent-execution-flow"><ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)} fitView fitViewOptions={{ padding: .14, maxZoom: 1 }} minZoom={.45} maxZoom={1.45} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background gap={22} size={1} color="rgba(20, 125, 120, .12)" /><Controls showInteractive={false} /></ReactFlow></div>
      {selected ? <aside className="agent-execution-detail" aria-label={`${selected.title} 运行详情`}><header><strong>{selected.title}</strong><button type="button" aria-label="关闭节点详情" onClick={() => setSelectedId(null)}>×</button></header><dl><div><dt>状态</dt><dd>{nodeStatusLabel(selected.status)}</dd></div><div><dt>耗时</dt><dd>{selected.durationMs === null ? "—" : `${selected.durationMs} ms`}</dd></div><div><dt>调用次数</dt><dd>{selected.callCount}</dd></div></dl><section><strong>输入摘要</strong><pre>{formatSafe(selected.safeInput)}</pre></section><section><strong>脱敏输出</strong><pre>{formatSafe(selected.safeOutput)}</pre></section><small>不显示 Prompt、密钥、原始 Provider 响应或模型私有思维链。</small></aside> : null}
    </div>
  </section>;
}

function AgentProcessNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-process" status={props.data.status} running={props.data.status === "running"} ariaLabel={`${props.data.title}，${nodeStatusLabel(props.data.status)}`}><GraphPort type="target" position={Position.Left} connectable={false} label="处理输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="处理输出" /><div className="agent-node-icon"><GitBranch aria-hidden="true" /></div><div><small>处理步骤</small><strong>{props.data.title}</strong><span>{props.data.summary}</span></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentToolNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-tool" status={props.data.status} running={props.data.status === "running"} ariaLabel={`${props.data.title}，工具调用 ${props.data.callCount} 次`}><GraphPort type="target" position={Position.Left} connectable={false} label="工具输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="工具输出" /><Wrench aria-hidden="true" /><div><small>受控工具</small><strong>{props.data.title}</strong><span>{props.data.callCount} 次调用</span></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentGateNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-gate" status={props.data.status} running={props.data.status === "running"} ariaLabel={`${props.data.title}，${nodeStatusLabel(props.data.status)}`}><GraphPort type="target" position={Position.Left} connectable={false} label="检查输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="通过或警告输出" /><ShieldCheck aria-hidden="true" /><div><small>一致性门禁</small><strong>{props.data.title}</strong><span>{props.data.summary}</span></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentResultNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-result" status={props.data.status} ariaLabel={`${props.data.title}，${props.data.summary}`}><GraphPort type="target" position={Position.Left} connectable={false} label="结果输入" /><Braces aria-hidden="true" /><div><small>运行结果 · 不是 Event</small><strong>{props.data.title}</strong><span>{props.data.summary}</span><button type="button" onClick={(event) => { event.stopPropagation(); props.data.onOpenCandidates?.(); }}>返回事件图并审阅候选</button></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function NodeStatus(props: { status: TianyiAgentExecutionNode["status"] }) {
  const Icon = props.status === "success" ? CheckCircle2 : props.status === "warning" || props.status === "blocked" ? AlertTriangle : props.status === "failed" ? OctagonX : props.status === "stopped" ? Square : CircleDashed;
  return <span className="agent-node-status" data-status={props.status}><Icon aria-hidden="true" />{nodeStatusLabel(props.status)}</span>;
}
function nodeStatusLabel(status: TianyiAgentExecutionNode["status"]): string { return status === "waiting" ? "等待" : status === "running" ? "运行中" : status === "success" ? "完成" : status === "warning" ? "有警告" : status === "blocked" ? "已阻断" : status === "failed" ? "失败" : "已停止"; }
function runStatusLabel(status: string): string { return status === "candidates_ready" ? "候选已就绪" : status === "waiting_for_tool" ? "等待工具" : status === "validating" ? "一致性检查" : status === "failed" ? "运行失败" : status === "stopped" ? "已停止" : status === "running" ? "运行中" : status; }
function formatSafe(value: Record<string, unknown> | null): string { return value ? JSON.stringify(value, null, 2) : "无可显示内容"; }
function executionGraph(nodes: TianyiAgentExecutionNode[], edges: TianyiAgentExecutionProjection["attempts"][number]["edges"], onOpenCandidates: () => void): { nodes: Node<ExecutionNodeData>[]; edges: Edge[] } {
  const columns = 4;
  return {
    nodes: nodes.map((node, index) => {
      const row = Math.floor(index / columns);
      const columnInRow = index % columns;
      const column = row % 2 === 0 ? columnInRow : columns - 1 - columnInRow;
      return { id: node.id, type: node.kind, position: { x: column * 245, y: row * 185 }, data: { ...node, onOpenCandidates } };
    }),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, type: "smoothstep", label: edge.label, animated: edge.status === "active", markerEnd: { type: MarkerType.ArrowClosed }, className: `agent-execution-edge is-${edge.status}` }))
  };
}
