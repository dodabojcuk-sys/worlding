import { Position, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight, Layers3 } from "lucide-react";

import { GraphPort, NodeShell } from "./NodeShell";

export type CollectionPointNodeData = { title: string; eventCount: number; expanded: boolean; onToggle?(): void };

export function CollectionPointNode(props: NodeProps<Node<CollectionPointNodeData>>) {
  return <NodeShell family="collection-point" status={props.data.expanded ? "expanded" : "collapsed"} ariaLabel={`可选集点：${props.data.title}，包含 ${props.data.eventCount} 个节点`}>
    <GraphPort type="target" position={Position.Left} connectable={false} label="集点引用输入" />
    <GraphPort type="source" position={Position.Right} connectable={false} label="集点引用输出" />
    <button type="button" aria-expanded={props.data.expanded} onClick={(event) => { event.stopPropagation(); props.data.onToggle?.(); }}>
      <Layers3 aria-hidden="true" /><span><small>可选集点 · 不复制 Event</small><strong>{props.data.title}</strong><em>{props.data.eventCount} 个节点</em></span>{props.data.expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </button>
  </NodeShell>;
}
