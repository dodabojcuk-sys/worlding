import type { GraphDocument, GraphEdge, GraphRelationProposal } from "./localTransport";

export type RelationPlacement = "above" | "right" | "below" | "left";
export type RelationTraversalMode = "outgoing" | "undirected";

export const RELATION_TEMPLATES = [
  { group: "通用", relation: "关联", direction: "none" },
  { group: "人物", relation: "亲子", direction: "forward" },
  { group: "人物", relation: "伴侣", direction: "both" },
  { group: "人物", relation: "师承", direction: "forward" },
  { group: "阵营", relation: "盟友", direction: "both" },
  { group: "阵营", relation: "敌对", direction: "both" },
  { group: "阵营", relation: "隶属", direction: "forward" },
  { group: "叙事", relation: "守护", direction: "forward" },
  { group: "叙事", relation: "知道", direction: "forward" },
  { group: "叙事", relation: "发生于", direction: "forward" },
  { group: "叙事", relation: "持有", direction: "forward" }
] as const satisfies ReadonlyArray<{ group: string; relation: string; direction: GraphEdge["direction"] }>;

export function createRelationProposal(input: {
  document: GraphDocument;
  anchorObjectId: string;
  targetObjectId: string;
  relation: string;
  direction: GraphEdge["direction"];
  placement: RelationPlacement;
  origin: GraphRelationProposal["origin"];
  sourceDocumentId: string | null;
}): { document: GraphDocument; proposal: GraphRelationProposal } {
  if (input.anchorObjectId === input.targetObjectId) throw new Error("关系两端必须是不同对象。");
  const nodes = [...input.document.content.nodes];
  const anchor = nodes.find((node) => node.objectId === input.anchorObjectId);
  if (!anchor) throw new Error("当前对象不在来源图谱中。");
  let target = nodes.find((node) => node.objectId === input.targetObjectId);
  if (!target) {
    const offset = placementOffset(input.placement);
    target = {
      id: nextId("node", nodes.map((node) => node.id)),
      objectId: input.targetObjectId,
      x: anchor.x + offset.x,
      y: anchor.y + offset.y
    };
    nodes.push(target);
  }
  const relationshipIds = [...input.document.content.edges, ...(input.document.content.proposals || [])].map((item) => item.id);
  const proposal: GraphRelationProposal = {
    id: nextId("proposal", relationshipIds),
    source: anchor.id,
    target: target.id,
    relation: input.relation,
    direction: input.direction,
    origin: input.origin,
    sourceDocumentId: input.sourceDocumentId
  };
  return {
    proposal,
    document: {
      ...input.document,
      content: {
        ...input.document.content,
        nodes,
        proposals: [...(input.document.content.proposals || []), proposal]
      }
    }
  };
}

export function acceptRelationProposal(document: GraphDocument, proposalId: string): { document: GraphDocument; edge: GraphEdge } {
  const proposal = (document.content.proposals || []).find((item) => item.id === proposalId);
  if (!proposal) throw new Error("关系提案不存在。");
  const duplicate = document.content.edges.some((edge) => sameRelationship(edge, proposal));
  if (duplicate) throw new Error("这条关系已经存在。");
  const edge: GraphEdge = {
    id: nextId("edge", document.content.edges.map((item) => item.id)),
    ...(proposal.relationId ? { relationId: proposal.relationId } : {}),
    source: proposal.source,
    target: proposal.target,
    relation: proposal.relation,
    direction: proposal.direction
  };
  return {
    edge,
    document: {
      ...document,
      content: {
        ...document.content,
        edges: [...document.content.edges, edge],
        proposals: document.content.proposals.filter((item) => item.id !== proposalId)
      }
    }
  };
}

export function rejectRelationProposal(document: GraphDocument, proposalId: string): GraphDocument {
  return {
    ...document,
    content: {
      ...document.content,
      proposals: (document.content.proposals || []).filter((item) => item.id !== proposalId)
    }
  };
}

export function immediateNeighborhood(document: GraphDocument, objectId: string, validObjectIds?: ReadonlySet<string>, mode: RelationTraversalMode = "outgoing"): Set<string> {
  const node = document.content.nodes.find((item) => item.objectId === objectId);
  if (!node || (validObjectIds && !validObjectIds.has(node.objectId))) return new Set();
  const nodeIds = new Set([node.id]);
  for (const edge of document.content.edges) {
    for (const neighborId of edgeNeighbors(edge, node.id, mode)) {
      const neighbor = document.content.nodes.find((item) => item.id === neighborId);
      if (neighbor && (!validObjectIds || validObjectIds.has(neighbor.objectId))) nodeIds.add(neighbor.id);
    }
  }
  return nodeIds;
}

export function shortestRelationshipPath(document: GraphDocument, startObjectId: string, endObjectId: string, validObjectIds?: ReadonlySet<string>, mode: RelationTraversalMode = "outgoing"): { nodeIds: string[]; edgeIds: string[] } | null {
  const start = document.content.nodes.find((node) => node.objectId === startObjectId);
  const end = document.content.nodes.find((node) => node.objectId === endObjectId);
  if (!start || !end || (validObjectIds && (!validObjectIds.has(start.objectId) || !validObjectIds.has(end.objectId)))) return null;
  if (start.id === end.id) return { nodeIds: [start.id], edgeIds: [] };
  const queue = [start.id];
  const previous = new Map<string, { nodeId: string; edgeId: string }>();
  const visited = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of document.content.edges) {
      for (const neighbor of edgeNeighbors(edge, current, mode)) {
        if (visited.has(neighbor)) continue;
        const neighborNode = document.content.nodes.find((node) => node.id === neighbor);
        if (!neighborNode || (validObjectIds && !validObjectIds.has(neighborNode.objectId))) continue;
        visited.add(neighbor);
        previous.set(neighbor, { nodeId: current, edgeId: edge.id });
        if (neighbor === end.id) return rebuildPath(start.id, end.id, previous);
        queue.push(neighbor);
      }
    }
  }
  return null;
}

function edgeNeighbors(edge: GraphEdge, nodeId: string, mode: RelationTraversalMode): string[] {
  if (mode === "undirected") {
    if (edge.source === nodeId) return edge.target === nodeId ? [] : [edge.target];
    if (edge.target === nodeId) return [edge.source];
    return [];
  }
  if (edge.direction === "reverse") return edge.target === nodeId ? [edge.source] : [];
  if (edge.direction === "forward") return edge.source === nodeId ? [edge.target] : [];
  if (edge.source === nodeId) return edge.target === nodeId ? [] : [edge.target];
  if (edge.target === nodeId) return [edge.source];
  return [];
}

function rebuildPath(startId: string, endId: string, previous: Map<string, { nodeId: string; edgeId: string }>): { nodeIds: string[]; edgeIds: string[] } {
  const nodeIds = [endId];
  const edgeIds: string[] = [];
  let cursor = endId;
  while (cursor !== startId) {
    const step = previous.get(cursor);
    if (!step) throw new Error("关系路径不完整。");
    edgeIds.unshift(step.edgeId);
    nodeIds.unshift(step.nodeId);
    cursor = step.nodeId;
  }
  return { nodeIds, edgeIds };
}

function sameRelationship(left: GraphEdge, right: GraphEdge): boolean {
  return left.source === right.source && left.target === right.target && left.relation === right.relation && left.direction === right.direction;
}

function placementOffset(placement: RelationPlacement): { x: number; y: number } {
  if (placement === "above") return { x: 0, y: -160 };
  if (placement === "below") return { x: 0, y: 160 };
  if (placement === "left") return { x: -260, y: 0 };
  return { x: 260, y: 0 };
}

function nextId(prefix: string, existing: string[]): string {
  for (let index = 1; index < 10_000; index += 1) {
    const id = `${prefix}.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error(`Could not create ${prefix} id.`);
}
