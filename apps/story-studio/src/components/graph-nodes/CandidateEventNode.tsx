import { Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Clock3, Link2, Sparkles } from "lucide-react";

import { GraphPort, NodeShell } from "./NodeShell";

export type CandidateEventNodeData = {
  title: string; time: string; status: string; runId?: string; pathLabel?: string; reviewSelected?: boolean;
  candidateKind?: "new" | "existing-reference" | "conflict"; sharedAcrossPaths?: number;
};

export function CandidateEventNode(props: NodeProps<Node<CandidateEventNodeData>>) {
  const kind = props.data.candidateKind ?? "new";
  const Icon = kind === "existing-reference" ? Link2 : kind === "conflict" ? AlertTriangle : Sparkles;
  const family = kind === "existing-reference" ? "candidate-existing-reference" : kind === "conflict" ? "candidate-conflict" : "candidate-event";
  return <NodeShell family={family} status={props.data.status} selected={props.data.reviewSelected} ariaLabel={`${props.data.title}，${props.data.status}`}>
    <GraphPort type="target" position={Position.Left} connectable={false} label="候选路径输入" />
    <GraphPort type="source" position={Position.Right} connectable={false} label="候选路径输出" />
    <header className="graph-node-candidate-header"><Icon aria-hidden="true" /><span>{kind === "existing-reference" ? "已有事件引用" : kind === "conflict" ? "阻断候选" : "新候选事件"}</span></header>
    <span className="graph-node-candidate-label">候选 · 尚未写入事件线</span>
    <strong title={props.data.title}>{props.data.title}</strong>
    <span><Clock3 aria-hidden="true" />{props.data.time}</span>
    <span>{props.data.pathLabel}{props.data.sharedAcrossPaths && props.data.sharedAcrossPaths > 1 ? " · 合流节点" : ""}</span>
    <span>{kind === "existing-reference" ? "仅建立引用，不新建事件" : kind === "conflict" ? "需返回修正后才能采纳" : props.data.reviewSelected ? "已选择，等待作者审阅" : "已从本次审阅排除"}</span>
  </NodeShell>;
}
