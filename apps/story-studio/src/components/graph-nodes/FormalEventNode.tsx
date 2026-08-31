import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Clock3, Expand, MapPin } from "lucide-react";

import { GraphPort, NodeShell } from "./NodeShell";

export type FormalEventNodeData = {
  title: string; time: string; location: string; status: string; focused: boolean; selected: boolean; predictionSelected?: boolean;
  remote?: boolean; direction?: "past" | "future"; count?: number;
};

export function FormalEventNode(props: NodeProps<Node<FormalEventNodeData>>) {
  const label = props.data.remote ? (props.data.direction === "past" ? "远处前因 " : "远处后果 ") + String(props.data.count ?? 0) : props.data.status;
  const family = props.data.remote ? "remote-event" : props.data.status === "草稿" || props.data.status === "待审" ? "draft-event" : "formal-event";
  return <NodeShell family={family} status={props.data.status} selected={props.data.selected || props.data.focused} ariaLabel={`${props.data.title}，${label}，${props.data.time}`}>
    {props.data.remote ? <><GraphPort type="target" position={Position.Left} connectable={false} label="远端投影输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="远端投影输出" /></> : <><GraphPort type="target" position={Position.Left} label="事件输入" /><GraphPort type="target" position={Position.Top} label="上方输入" /><GraphPort type="source" position={Position.Right} label="事件输出" /><GraphPort type="source" position={Position.Bottom} label="下方输出" /></>}
    <span className="graph-node-state-strip">{label}</span>
    <strong>{props.data.title}</strong>
    <span><Clock3 aria-hidden="true" />{props.data.time}</span>
    <span>{props.data.remote ? <Expand aria-hidden="true" /> : <MapPin aria-hidden="true" />}{props.data.remote ? "点击查看投影范围" : props.data.location}</span>
  </NodeShell>;
}
