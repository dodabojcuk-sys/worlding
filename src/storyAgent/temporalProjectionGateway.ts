import type { TianyiAgentRuntimeEvent } from "../storyContracts/tianyiAgentMode.ts";
import type {
  TemporalProjectionRequest,
  TemporalProjectionResult
} from "../storyContracts/temporalProjection.ts";

export type TemporalProjectionEvidenceEvent = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  storyOrder: number | null;
  authoredTimeLabel: string | null;
  authoredTimeKind: "exact" | "relative" | "range" | "unknown";
};

export type TemporalProjectionEvidenceRelation = {
  id: string;
  sourceEventId: string;
  targetEventId: string;
  label: string;
  strictBefore: boolean;
  confirmed: boolean;
};

export type TemporalProjectionGatewayInput = {
  request: TemporalProjectionRequest;
  events: TemporalProjectionEvidenceEvent[];
  relations: TemporalProjectionEvidenceRelation[];
  runtime?: {
    runId: string;
    attemptId: string;
    signal?: AbortSignal;
    onEvent?(event: TianyiAgentRuntimeEvent): Promise<void> | void;
  };
};

export type TemporalProjectionGateway = {
  generate(input: TemporalProjectionGatewayInput): Promise<TemporalProjectionResult>;
};

/** Pure deterministic semantic fixture used behind the real Pi loop. */
export function createDeterministicTemporalProjectionGateway(): TemporalProjectionGateway {
  return {
    async generate(input) {
      const eventById = new Map(input.events.map((event) => [event.id, event]));
      const strictRelations = input.relations.filter((relation) => relation.strictBefore && eventById.has(relation.sourceEventId) && eventById.has(relation.targetEventId));
      const cycleIds = temporalCycleEventIds(input.events.map((event) => event.id), strictRelations);
      const anchors = input.events
        .filter((event) => event.authoredTimeKind !== "unknown" && event.authoredTimeLabel)
        .map((event, index) => ({ event, sort: authoredTimeSort(event.authoredTimeLabel!, index) }))
        .sort((left, right) => left.sort - right.sort || left.event.title.localeCompare(right.event.title, "zh-CN"));
      const anchorPosition = new Map(anchors.map(({ event }, index) => [event.id, anchors.length === 1 ? 500 : 100 + index * (800 / (anchors.length - 1))]));
      const relationBefore = adjacency(strictRelations, "out");
      const relationAfter = adjacency(strictRelations, "in");
      const placements = input.request.eventRefs.map((reference) => {
        const event = eventById.get(reference.eventId);
        if (!event) throw new Error("Temporal projection evidence is missing a current Event.");
        if (cycleIds.has(event.id)) {
          return placement(reference, event, "conflict", 920, "temporal-segment.conflict", null, [], [], null, strictRelations.filter((relation) => cycleIds.has(relation.sourceEventId) && cycleIds.has(relation.targetEventId)).map((relation) => relation.id), "严格时间关系形成循环，需要作者先处理冲突。", []);
        }
        const authored = anchorPosition.get(event.id);
        if (authored !== undefined) {
          return placement(reference, event, "anchored", authored, "temporal-segment.authored", null, [], [], 1, [`event-time.${event.id}`], `正式时间已确认：${event.authoredTimeLabel}`, []);
        }
        const beforeAnchors = reachableAnchors(event.id, relationAfter, anchorPosition);
        const afterAnchors = reachableAnchors(event.id, relationBefore, anchorPosition);
        const beforePosition = maximumPosition(beforeAnchors, anchorPosition);
        const afterPosition = minimumPosition(afterAnchors, anchorPosition);
        const relationEvidence = strictRelations.filter((relation) => relation.sourceEventId === event.id || relation.targetEventId === event.id).map((relation) => relation.id);
        if (beforePosition !== null || afterPosition !== null) {
          const low = beforePosition ?? Math.max(40, (afterPosition ?? 500) - 180);
          const high = afterPosition ?? Math.min(960, (beforePosition ?? 500) + 180);
          const start = Math.min(low + 28, high - 12);
          const end = Math.max(start + 18, high - 28);
          const position = (start + end) / 2;
          const ambiguous = (!beforeAnchors.length || !afterAnchors.length) && end - start > 220;
          const summary = beforeAnchors.length && afterAnchors.length
            ? `AI 结合前后锚点，将它放在 ${eventById.get(beforeAnchors[0]!)?.title ?? "前置事件"} 与 ${eventById.get(afterAnchors[0]!)?.title ?? "后置事件"} 之间。`
            : beforeAnchors.length
              ? `AI 根据关系证据，将它放在 ${eventById.get(beforeAnchors[0]!)?.title ?? "已知事件"} 之后。`
              : `AI 根据关系证据，将它放在 ${eventById.get(afterAnchors[0]!)?.title ?? "已知事件"} 之前。`;
          return placement(reference, event, ambiguous ? "ambiguous" : "inferred", position, ambiguous ? "temporal-segment.ambiguous" : "temporal-segment.inferred", { start, end }, beforeAnchors, afterAnchors, ambiguous ? .52 : .82, relationEvidence, summary, ambiguous ? [{ relativePosition: start, label: "区间起点" }, { relativePosition: end, label: "区间终点" }] : []);
        }
        if (relationEvidence.length) {
          const position = 160 + topologicalIndex(event.id, input.events.map((item) => item.id), strictRelations) * 120;
          return placement(reference, event, "inferred", Math.min(position, 840), "temporal-segment.inferred", { start: Math.max(80, position - 55), end: Math.min(900, position + 55) }, [], [], .63, relationEvidence, "AI 依据已确认的相对关系定位，正式时间仍未确认。", []);
        }
        if (event.storyOrder !== null) {
          const position = 140 + event.storyOrder * 92;
          return placement(reference, event, "ambiguous", Math.min(position, 860), "temporal-segment.ambiguous", { start: Math.max(80, position - 90), end: Math.min(920, position + 90) }, [], [], .38, [`story-order.${event.id}`], "只有故事顺序这一项弱证据，当前位置仅供对照。", [{ relativePosition: Math.max(80, position - 90), label: "可选起点" }, { relativePosition: Math.min(920, position + 90), label: "可选终点" }]);
        }
        return placement(reference, event, "unplaced", 980, "temporal-segment.unplaced", null, [], [], null, [], "暂无足够证据定位，保留在同一关系画布边缘。", []);
      });
      const conflicts = cycleIds.size
        ? [{ id: "temporal-conflict.strict-cycle", eventIds: [...cycleIds].sort(), summary: "严格时间先后关系形成循环，投影不会强行排序。", evidenceRefs: strictRelations.filter((relation) => cycleIds.has(relation.sourceEventId) && cycleIds.has(relation.targetEventId)).map((relation) => relation.id) }]
        : [];
      return {
        placements,
        segments: [
          { id: "temporal-segment.authored", order: 0, label: "已确认时间锚点", kind: "authored_anchor", startAnchorEventIds: anchors.slice(0, 1).map(({ event }) => event.id), endAnchorEventIds: anchors.slice(-1).map(({ event }) => event.id), confidence: 1 },
          { id: "temporal-segment.inferred", order: 1, label: "语义推进", kind: "inferred_phase", startAnchorEventIds: anchors.slice(0, 1).map(({ event }) => event.id), endAnchorEventIds: anchors.slice(-1).map(({ event }) => event.id), confidence: .78 },
          { id: "temporal-segment.ambiguous", order: 2, label: "模糊推断区间", kind: "interval", startAnchorEventIds: [], endAnchorEventIds: [], confidence: .45 },
          { id: "temporal-segment.conflict", order: 3, label: "需要作者处理", kind: "unresolved", startAnchorEventIds: [], endAnchorEventIds: [], confidence: null },
          { id: "temporal-segment.unplaced", order: 4, label: "暂无法定位", kind: "unresolved", startAnchorEventIds: [], endAnchorEventIds: [], confidence: null }
        ],
        conflicts
      };
    }
  };
}

function placement(
  versionedEventRef: TemporalProjectionRequest["eventRefs"][number],
  event: TemporalProjectionEvidenceEvent,
  placementKind: "anchored" | "inferred" | "ambiguous" | "conflict" | "unplaced",
  relativePosition: number,
  segmentId: string,
  inferredWindow: { start: number; end: number } | null,
  anchorBeforeEventIds: string[],
  anchorAfterEventIds: string[],
  confidence: number | null,
  evidenceRefs: string[],
  authorFacingSummary: string,
  alternatives: Array<{ relativePosition: number; label: string }>,
) {
  return {
    versionedEventRef,
    placementKind,
    relativePosition,
    segmentId,
    authoredTimeLabel: event.authoredTimeLabel,
    inferredWindow,
    anchorBeforeEventIds,
    anchorAfterEventIds,
    confidence,
    evidenceRefs,
    authorFacingSummary,
    alternatives
  };
}

function authoredTimeSort(label: string, fallback: number): number { const parts = label.match(/\d+/gu); return parts?.length ? Number(parts[0]) * 10_000 + Number(parts[1] ?? 0) : 100_000 + fallback; }
function adjacency(relations: readonly TemporalProjectionEvidenceRelation[], direction: "in" | "out") { const result = new Map<string, string[]>(); for (const relation of relations) { const from = direction === "out" ? relation.sourceEventId : relation.targetEventId; const to = direction === "out" ? relation.targetEventId : relation.sourceEventId; result.set(from, [...(result.get(from) ?? []), to]); } return result; }
function reachableAnchors(start: string, graph: ReadonlyMap<string, string[]>, anchors: ReadonlyMap<string, number>): string[] { const queue = [...(graph.get(start) ?? [])], seen = new Set<string>(), found: string[] = []; while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); if (anchors.has(id)) found.push(id); else queue.push(...(graph.get(id) ?? [])); } return found.sort(); }
function maximumPosition(ids: readonly string[], positions: ReadonlyMap<string, number>): number | null { const values = ids.map((id) => positions.get(id)).filter((value): value is number => value !== undefined); return values.length ? Math.max(...values) : null; }
function minimumPosition(ids: readonly string[], positions: ReadonlyMap<string, number>): number | null { const values = ids.map((id) => positions.get(id)).filter((value): value is number => value !== undefined); return values.length ? Math.min(...values) : null; }
function topologicalIndex(target: string, eventIds: readonly string[], relations: readonly TemporalProjectionEvidenceRelation[]): number { const indegree = new Map(eventIds.map((id) => [id, 0])); const out = adjacency(relations, "out"); relations.forEach((relation) => indegree.set(relation.targetEventId, (indegree.get(relation.targetEventId) ?? 0) + 1)); const queue = eventIds.filter((id) => indegree.get(id) === 0).sort(); const ordered: string[] = []; while (queue.length) { const id = queue.shift()!; ordered.push(id); for (const next of out.get(id) ?? []) { indegree.set(next, (indegree.get(next) ?? 1) - 1); if (indegree.get(next) === 0) queue.push(next); } } return Math.max(0, ordered.indexOf(target)); }
function temporalCycleEventIds(eventIds: readonly string[], relations: readonly TemporalProjectionEvidenceRelation[]): Set<string> { const indegree = new Map(eventIds.map((id) => [id, 0])); const out = adjacency(relations, "out"); relations.forEach((relation) => indegree.set(relation.targetEventId, (indegree.get(relation.targetEventId) ?? 0) + 1)); const queue = eventIds.filter((id) => indegree.get(id) === 0); while (queue.length) { const id = queue.shift()!; for (const next of out.get(id) ?? []) { indegree.set(next, (indegree.get(next) ?? 1) - 1); if (indegree.get(next) === 0) queue.push(next); } } return new Set(eventIds.filter((id) => (indegree.get(id) ?? 0) > 0)); }
