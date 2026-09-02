import { Position, type Node, type NodeProps } from "@xyflow/react";
import { Anchor, Clock3, Diamond, Expand, MapPin, Sparkles } from "lucide-react";

import { GraphPort, NodeShell } from "./NodeShell";

export type FormalEventNodeData = {
  title: string; time: string; location: string; status: string; focused: boolean; selected: boolean; predictionSelected?: boolean;
  remote?: boolean; direction?: "past" | "future"; count?: number;
  temporal?: boolean;
  temporalKind?: "anchored" | "inferred" | "ambiguous" | "conflict" | "unplaced";
  temporalSummary?: string;
  temporalAnchors?: string;
  temporalConfidence?: string;
  semanticZoom?: "far" | "medium" | "near";
  eventRole?: "ordinary" | "turning";
};

export function FormalEventNode(props: NodeProps<Node<FormalEventNodeData>>) {
  const label = props.data.remote ? (props.data.direction === "past" ? "远处前因 " : "远处后果 ") + String(props.data.count ?? 0) : props.data.status;
  const family = props.data.remote ? "remote-event" : props.data.status === "草稿" || props.data.status === "待审" ? "draft-event" : props.data.eventRole === "turning" ? "turning-event" : "formal-event";
  const zoom = props.data.semanticZoom ?? "medium";
  const temporalLabel = props.data.temporalKind === "anchored" ? "明确时间锚点" : props.data.temporalKind === "conflict" ? "时间冲突" : props.data.temporalKind === "unplaced" ? "暂无法定位" : props.data.temporalKind === "ambiguous" ? "AI 模糊区间" : "AI 推断位置";
  return <NodeShell family={family} status={props.data.status} selected={props.data.selected || props.data.focused} ariaLabel={`${props.data.title}，${label}，${props.data.time}${props.data.temporal ? `，${temporalLabel}` : ""}`}>
    {props.data.remote ? <><GraphPort type="target" position={Position.Left} connectable={false} label="远端投影输入" /><GraphPort type="source" position={Position.Right} connectable={false} label="远端投影输出" /></> : <><GraphPort type="target" position={Position.Left} label="事件输入" /><GraphPort type="target" position={Position.Top} label="上方输入" /><GraphPort type="source" position={Position.Right} label="事件输出" /><GraphPort type="source" position={Position.Bottom} label="下方输出" /></>}
    <span className="graph-node-state-strip">{props.data.eventRole === "turning" ? <Diamond aria-hidden="true" /> : null}{props.data.eventRole === "turning" ? "关键转折 · " : ""}{label}</span>
    <strong>{props.data.title}</strong>
    {zoom !== "far" ? <span className="graph-node-time-state"><Clock3 aria-hidden="true" />{props.data.temporal && props.data.temporalKind !== "anchored" ? "正式时间未确认 · " + temporalLabel : props.data.time}</span> : null}
    {zoom !== "far" ? <span>{props.data.remote ? <Expand aria-hidden="true" /> : props.data.temporal ? <Sparkles aria-hidden="true" /> : <MapPin aria-hidden="true" />}{props.data.remote ? "点击查看投影范围" : props.data.temporal ? temporalLabel : props.data.location}</span> : null}
    {zoom === "near" && props.data.temporal ? <div className="graph-node-temporal-detail"><span><Anchor aria-hidden="true" />{props.data.temporalAnchors || "暂无前后锚点"}</span><span>{props.data.temporalConfidence || "置信度待判定"}</span><p>{props.data.temporalSummary}</p></div> : null}
  </NodeShell>;
}
