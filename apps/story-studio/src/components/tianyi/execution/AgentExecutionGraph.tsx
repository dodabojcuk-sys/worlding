import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Braces, CheckCircle2, CircleDashed, GitBranch, LocateFixed, OctagonX, RotateCcw, ShieldCheck, Square, UserCheck, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { TianyiAgentExecutionNode, TianyiAgentExecutionProjection } from "../../../../../../src/storyContracts/tianyiAgentMode.ts";
import { GraphPort, NodeShell } from "../../graph-nodes/NodeShell";

type HumanReviewNode = Omit<TianyiAgentExecutionNode, "kind"> & { kind: "human-review" };
type ExecutionNodeData = (TianyiAgentExecutionNode | HumanReviewNode) & { onOpenCandidates?(): void };
const nodeTypes = { process: AgentProcessNode, tool: AgentToolNode, gate: AgentGateNode, result: AgentResultNode, "human-review": AgentHumanReviewNode };

export function AgentExecutionGraph(props: { projection: TianyiAgentExecutionProjection; onReturn(): void; onOpenCandidates(): void; onStop?(): void; onRetry?(): void }) {
  const attempt = props.projection.attempts.find((item) => item.attemptId === props.projection.activeAttemptId) ?? props.projection.attempts.at(-1)!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<ExecutionNodeData>, Edge> | null>(null);
  const selected = graphNodeData(selectedId, attempt.nodes, props.onOpenCandidates, attempt.status);
  const terminalEvent = [...attempt.events].reverse().find((event) => event.type === "TianyiAgentRunFailed" || event.type === "TianyiAgentRunStopped");
  const graph = useMemo(() => executionGraph(attempt.nodes, attempt.edges, props.onOpenCandidates), [attempt.edges, attempt.nodes, props.onOpenCandidates]);
  const focusNode = useCallback((which: "first" | "current") => {
    if (!flow || !graph.nodes.length) return;
    let node = graph.nodes[0]!;
    if (which === "current") {
      node = graph.nodes.at(-1)!;
      for (let index = graph.nodes.length - 1; index >= 0; index -= 1) {
        if (graph.nodes[index]!.data.status === "running") { node = graph.nodes[index]!; break; }
      }
    }
    const canvas = document.querySelector<HTMLElement>(".agent-execution-flow")?.getBoundingClientRect();
    const readableZoom = .9;
    const renderedNodeWidth = executionNodeWidth(node.data.kind) * readableZoom;
    const safeHorizontalInset = 24;
    const availableContextOffset = canvas
      ? Math.max(0, canvas.width / 2 - renderedNodeWidth / 2 - safeHorizontalInset)
      : 0;
    const precedingContextOffset = which === "current" ? Math.min(34, availableContextOffset) : 0;
    void flow.setCenter(node.position.x + executionNodeWidth(node.data.kind) / 2 - precedingContextOffset, node.position.y + 62, { zoom: readableZoom, duration: 180 });
  }, [flow, graph.nodes]);
  useEffect(() => {
    if (!flow || !graph.nodes.length) return;
    const frame = window.requestAnimationFrame(() => focusNode(attempt.status === "candidates_ready" ? "current" : "first"));
    return () => window.cancelAnimationFrame(frame);
  }, [attempt.attemptId, attempt.status, flow, focusNode, graph.nodes.length]);
  return <section className="agent-execution-workspace" aria-label="Agent 执行过程" data-graph-layer="AGENT_EXECUTION_GRAPH">
    <header><div><small>天意 Agent</small><strong>Agent 执行过程</strong><span>本次推演 · {runStatusLabel(attempt.status)} · 从左到右</span></div><nav><button type="button" onClick={props.onReturn}><ArrowLeft aria-hidden="true" />返回事件图</button>{["running", "waiting_for_tool", "validating"].includes(attempt.status) ? <button type="button" className="is-stop" onClick={props.onStop}><Square aria-hidden="true" />停止本次推演</button> : null}{["failed", "stopped"].includes(attempt.status) ? <button type="button" onClick={props.onRetry}><RotateCcw aria-hidden="true" />重新推演</button> : null}</nav></header>
    {terminalEvent ? <p className="agent-execution-outcome" role={terminalEvent.type === "TianyiAgentRunFailed" ? "alert" : "status"} data-outcome={terminalEvent.type === "TianyiAgentRunFailed" ? terminalEvent.timedOut ? "timeout" : "failed" : "stopped"}><strong>{terminalEvent.type === "TianyiAgentRunFailed" ? terminalEvent.timedOut ? "运行超时" : "运行失败" : "作者已停止"}</strong><span>{terminalEvent.reason}</span><small>未产生正式 Event、Relation、Canon 或 WorldState 写入。</small></p> : null}
    <div className={`agent-execution-main ${selected ? "has-detail" : ""}`}>
      <div className="agent-execution-flow"><div className="agent-execution-lane-guide" aria-hidden="true"><ArrowRight />从左到右执行 · 画布可平移</div><div className="agent-execution-locator" aria-label="执行图定位"><button type="button" onClick={() => focusNode("first")}><LocateFixed />查看起点</button><button type="button" onClick={() => focusNode("current")}><LocateFixed />查看当前</button></div><ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onInit={setFlow} onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)} defaultViewport={{ x: 32, y: 90, zoom: .9 }} minZoom={.89} maxZoom={1.35} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background gap={22} size={1} color="rgba(20, 125, 120, .12)" /><Controls showInteractive={false} /></ReactFlow></div>
      {selected ? <aside className="agent-execution-detail" aria-label={`${selected.title} 运行详情`}><header><div><small>{nodeFamilyLabel(selected.kind)}</small><strong>{selected.title}</strong></div><button type="button" aria-label="关闭节点详情" onClick={() => setSelectedId(null)}>×</button></header><p>{selected.summary}</p><dl><div><dt>当前状态</dt><dd>{nodeStatusLabel(selected.status)}</dd></div><div><dt>处理用时</dt><dd>{selected.durationMs === null ? "未记录" : `${selected.durationMs} 毫秒`}</dd></div><div><dt>处理次数</dt><dd>{selected.callCount || 1}</dd></div></dl>{selected.safeInput ? <section><strong>本步核对内容</strong><ul>{formatSafeFacts(selected.safeInput)}</ul></section> : null}{selected.safeOutput ? <section><strong>本步处理结果</strong><ul>{formatSafeFacts(selected.safeOutput)}</ul></section> : null}<details><summary>查看技术回执</summary><pre>{formatSafe({ input: selected.safeInput, output: selected.safeOutput })}</pre></details><small>技术回执已脱敏，不显示 Prompt、密钥、原始 Provider 响应或模型私有思维链。</small></aside> : null}
    </div>
  </section>;
}

function AgentProcessNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-process" status={props.data.status} selected={props.selected} running={props.data.status === "running"} ariaLabel={`${props.data.title}，${nodeStatusLabel(props.data.status)}`}><GraphPort type="target" position={Position.Left} connectable={false} label="处理输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="处理输出" /><div className="agent-node-icon"><GitBranch aria-hidden="true" /><span>处理</span></div><div><small>推演步骤</small><strong>{props.data.title}</strong><span>{props.data.summary}</span></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentToolNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-tool" status={props.data.status} selected={props.selected} running={props.data.status === "running"} ariaLabel={`${props.data.title}，工具调用 ${props.data.callCount} 次`}><GraphPort type="target" position={Position.Left} connectable={false} label="工具输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="工具输出" /><span className="agent-tool-mark"><Wrench aria-hidden="true" /></span><div><small>受控工具 · 只读</small><strong>{props.data.title}</strong><span>{props.data.callCount} 次处理</span></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentGateNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-gate" status={props.data.status} selected={props.selected} running={props.data.status === "running"} ariaLabel={`${props.data.title}，${nodeStatusLabel(props.data.status)}`}><GraphPort type="target" position={Position.Left} connectable={false} label="检查输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="通过或警告输出" /><span className="agent-gate-mark"><ShieldCheck aria-hidden="true" /></span><div><small>一致性门禁 · 通过 / 提醒 / 阻断</small><strong>{props.data.title}</strong><span>{props.data.summary}</span></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentResultNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-result" status={props.data.status} selected={props.selected} ariaLabel={`${props.data.title}，${props.data.summary}`}><GraphPort type="target" position={Position.Left} connectable={false} label="结果输入" /><span className="agent-result-mark"><Braces aria-hidden="true" /></span><div><small>推演结果 · 仍是候选</small><strong>{props.data.title}</strong><span>{props.data.summary}</span><button type="button" onClick={(event) => { event.stopPropagation(); props.data.onOpenCandidates?.(); }}>回到事件图审阅候选</button></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function AgentHumanReviewNode(props: NodeProps<Node<ExecutionNodeData>>) {
  return <NodeShell family="agent-human-review" status={props.data.status} selected={props.selected} ariaLabel={`${props.data.title}，作者审核检查点`}><GraphPort type="target" position={Position.Left} connectable={false} label="候选结果输入" /><span className="agent-human-review-mark"><UserCheck aria-hidden="true" /></span><div><small>作者检查点 · 不自动写入</small><strong>{props.data.title}</strong><span>{props.data.summary}</span><button type="button" onClick={(event) => { event.stopPropagation(); props.data.onOpenCandidates?.(); }}>打开候选审阅</button></div><NodeStatus status={props.data.status} /></NodeShell>;
}
function NodeStatus(props: { status: ExecutionNodeData["status"] }) {
  const Icon = props.status === "success" ? CheckCircle2 : props.status === "warning" || props.status === "blocked" ? AlertTriangle : props.status === "failed" ? OctagonX : props.status === "stopped" ? Square : CircleDashed;
  return <span className="agent-node-status" data-status={props.status}><Icon aria-hidden="true" />{nodeStatusLabel(props.status)}</span>;
}
function nodeStatusLabel(status: ExecutionNodeData["status"]): string { return status === "waiting" ? "等待" : status === "running" ? "运行中" : status === "success" ? "完成" : status === "warning" ? "有警告" : status === "blocked" ? "已阻断" : status === "failed" ? "失败" : "已停止"; }
function runStatusLabel(status: string): string { return status === "candidates_ready" ? "候选已就绪" : status === "waiting_for_tool" ? "等待工具" : status === "validating" ? "一致性检查" : status === "failed" ? "运行失败" : status === "stopped" ? "已停止" : status === "running" ? "运行中" : status; }
function formatSafe(value: Record<string, unknown> | null): string { return value ? JSON.stringify(value, null, 2) : "无可显示内容"; }
function formatSafeFacts(value: Record<string, unknown>) { return Object.entries(value).map(([key, item]) => <li key={key}><span>{safeFactLabel(key)}</span><strong>{safeFactValue(item)}</strong></li>); }
function safeFactLabel(key: string): string { return ({ sourceCount: "依据数量", authorGoalPresent: "作者目标", predictionMode: "推演方式", resolvedCount: "已核对依据", staleCount: "过期依据", projectIdMatches: "作品范围", inspectedSourceCount: "检查范围", relationWrites: "正式关系写入", statusKinds: "时间状态", timeWrites: "时间写入", identityGate: "身份检查", timeGate: "时间检查", canonWrites: "Canon 写入", worldStateWrites: "WorldState 写入", bundleId: "候选结果组", pathCount: "候选路径", candidateNodeCount: "候选节点", formalWrites: "正式数据写入", operation: "处理类型", access: "访问边界", input: "输入", output: "输出" } as Record<string, string>)[key] ?? key; }
function safeFactValue(value: unknown): string { if (typeof value === "boolean") return value ? "已确认" : "无"; if (Array.isArray(value)) return value.map((item) => String(item)).join("、"); if (value === null || value === undefined) return "无"; return String(value); }
function nodeFamilyLabel(kind: ExecutionNodeData["kind"]): string { return kind === "process" ? "推演步骤" : kind === "tool" ? "受控工具" : kind === "gate" ? "一致性检查" : kind === "human-review" ? "作者检查点" : "候选结果"; }
function humanReviewNode(status: string, onOpenCandidates: () => void): HumanReviewNode & { onOpenCandidates(): void } { return { id: "execution-view.human-review", kind: "human-review", title: "等待作者审阅", summary: "候选只在作者选择后才进入草稿写入门禁。", status: status === "candidates_ready" ? "waiting" : ["failed", "stopped"].includes(status) ? "stopped" : "waiting", startedAt: null, completedAt: null, durationMs: null, toolName: null, callCount: 0, safeInput: null, safeOutput: null, onOpenCandidates }; }
function graphNodeData(selectedId: string | null, nodes: TianyiAgentExecutionNode[], onOpenCandidates: () => void, status: string): ExecutionNodeData | null { if (!selectedId) return null; return nodes.find((node) => node.id === selectedId) ?? (selectedId === "execution-view.human-review" ? humanReviewNode(status, onOpenCandidates) : null); }
function executionGraph(nodes: TianyiAgentExecutionNode[], edges: TianyiAgentExecutionProjection["attempts"][number]["edges"], onOpenCandidates: () => void): { nodes: Node<ExecutionNodeData>[]; edges: Edge[] } {
  const review = humanReviewNode(nodes.some((node) => node.kind === "result" && node.status === "success") ? "candidates_ready" : "running", onOpenCandidates);
  const viewNodes: ExecutionNodeData[] = [...nodes.map((node) => ({ ...node, onOpenCandidates })), review];
  const result = [...nodes].reverse().find((node) => node.kind === "result");
  return {
    nodes: viewNodes.map((node, index) => ({ id: node.id, type: node.kind, position: { x: index * 270, y: executionNodeLane(node.kind, index) }, data: node })),
    edges: [...edges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, type: "smoothstep", label: edge.label, animated: edge.status === "active", markerEnd: { type: MarkerType.ArrowClosed }, className: `agent-execution-edge is-${edge.status}` })), ...(result ? [{ id: `execution-view.${result.id}.human-review`, source: result.id, target: review.id, type: "smoothstep", label: "等待作者", markerEnd: { type: MarkerType.ArrowClosed }, className: "agent-execution-edge is-waiting" }] : [])]
  };
}
function executionNodeLane(kind: ExecutionNodeData["kind"], index: number): number { return kind === "tool" ? 170 : kind === "gate" ? 38 : kind === "result" ? 102 : kind === "human-review" ? 88 : index === 0 ? 70 : 88; }
function executionNodeWidth(kind: ExecutionNodeData["kind"]): number { return kind === "result" ? 256 : kind === "human-review" ? 236 : kind === "process" ? 220 : kind === "gate" ? 218 : 192; }
