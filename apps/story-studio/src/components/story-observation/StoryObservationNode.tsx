import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CircleDot, Diamond, FileSearch, GitMerge, Layers3, Sparkles, Waypoints } from "lucide-react";

import type { StoryObservationLayoutNode } from "./storyObservationProjection";

export type StoryObservationFlowNodeData = Record<string, unknown> & {
  observation: StoryObservationLayoutNode;
  hiddenDescendantCount: number;
  density: "overview" | "focus";
};

export type StoryObservationFlowNode = Node<StoryObservationFlowNodeData, "story-observation">;

export function StoryObservationNodeComponent(props: NodeProps<StoryObservationFlowNode>) {
  const node = props.data.observation;
  const semanticStatus = node.semanticStatus ?? (node.status === "candidate" ? "candidate" : "confirmed");
  const semanticStatusLabel = semanticStatus === "confirmed" ? "已确认" : semanticStatus === "candidate" ? "待审候选" : semanticStatus === "prediction" ? "待审推测" : semanticStatus === "unknown" ? "状态未知" : "已归档";
  const semanticRecordLabel = semanticStatus === "confirmed" ? "正式事件" : "事件投影";
  const Icon = node.kind === "decision" ? Diamond
    : node.kind === "state" ? Waypoints
      : node.kind === "evidence" ? FileSearch
        : node.kind === "hub" ? GitMerge
          : node.kind === "cluster" ? Layers3
            : node.kind === "candidate" ? Sparkles
              : CircleDot;
  return <article
    className={`story-observation-node story-observation-node--${node.kind}`}
    data-observation-node-id={node.id}
    data-observation-event-id={node.eventId ?? "candidate"}
    data-observation-status={node.status}
    data-observation-density={props.data.density}
    aria-label={`${node.status === "candidate" ? "AI 候选" : semanticRecordLabel}：${node.title}`}
  >
    <Handle id="target-left" type="target" position={Position.Left} aria-label="关系输入" />
    <Handle id="target-top" type="target" position={Position.Top} aria-label="上方关系输入" />
    <header>
      <span className="story-observation-node-kind"><Icon aria-hidden="true" /></span>
      <div><small>{node.status === "candidate" ? "候选 · 待评审" : `${nodeKindLabel(node.kind)} · ${semanticStatusLabel}`}</small><strong>{node.title}</strong></div>
    </header>
    <p>{node.summary}</p>
    <footer>
      <span>{node.time.label}</span>
      {props.data.hiddenDescendantCount > 0 ? <strong>+{props.data.hiddenDescendantCount} 条折叠支链</strong> : null}
    </footer>
    <Handle id="source-right" type="source" position={Position.Right} aria-label="关系输出" />
    <Handle id="source-bottom" type="source" position={Position.Bottom} aria-label="下方关系输出" />
  </article>;
}

function nodeKindLabel(kind: StoryObservationLayoutNode["kind"]): string {
  return ({ fact: "事实", decision: "决定", state: "状态", evidence: "证据", hub: "合流", cluster: "事件簇", candidate: "候选" })[kind];
}
