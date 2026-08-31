import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Clock3, Layers3 } from "lucide-react";

import { GraphPort, NodeShell } from "./NodeShell";

export type CandidateEventNodeData = {
  title: string; time: string; status: string; runId?: string; pathLabel?: string; reviewSelected?: boolean;
};

export function CandidateEventNode(props: NodeProps<Node<CandidateEventNodeData>>) {
  return <NodeShell family="candidate-event" status={props.data.status} selected={props.data.reviewSelected} ariaLabel={`${props.data.title}，${props.data.status}`}>
    <GraphPort type="target" position={Position.Left} connectable={false} label="候选路径输入" />
    <GraphPort type="source" position={Position.Right} connectable={false} label="候选路径输出" />
    <span className="graph-node-candidate-label">候选／尚未写入事件线</span>
    <strong>{props.data.title}</strong>
    <span><Clock3 aria-hidden="true" />{props.data.time}</span>
    <span><Layers3 aria-hidden="true" />{props.data.pathLabel} · Run {props.data.runId?.slice(-8) ?? ""}</span>
    <span>{props.data.reviewSelected ? "已选择，等待作者保存" : "已从本次审阅排除"}</span>
  </NodeShell>;
}
