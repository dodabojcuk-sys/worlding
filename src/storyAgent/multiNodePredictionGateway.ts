import type { TianyiAgentRuntimeEvent } from "../storyContracts/tianyiAgentMode.ts";
import type { MultiNodePredictionRequest, PredictionBundle, PredictionNode } from "../storyContracts/multiNodePrediction.ts";

export type MultiNodePredictionRuntimeContext = {
  runId: string;
  attemptId: string;
  workVersionId: string;
  sessionId: string;
  signal?: AbortSignal;
  onEvent?(event: TianyiAgentRuntimeEvent): Promise<void> | void;
};

/** Product-owned seam for a future Pi adapter; R0 deliberately uses no Provider. */
export type MultiNodePredictionGateway = {
  generate(input: { request: MultiNodePredictionRequest; knownEvents: Array<{ id: string; title: string }>; bundleId: string; runtime?: MultiNodePredictionRuntimeContext }): Promise<PredictionBundle>;
};

export function createDeterministicMultiNodePredictionGateway(): MultiNodePredictionGateway {
  return {
    async generate({ request, knownEvents, bundleId }) {
      const identityFor = (title: string, differenceReason: string) => {
        const existing = knownEvents.find((event) => event.title === title) ?? null;
        if (!existing) return { kind: "create-new-with-difference" as const, existingEventId: null, differenceReason };
        return request.sourceEventRefs.some((reference) => reference.eventId === existing.id)
          ? { kind: "merge-review" as const, existingEventId: existing.id, differenceReason: null }
          : { kind: "reference-existing" as const, existingEventId: existing.id, differenceReason: null };
      };
      const nodes: PredictionNode[] = [
        { id: "prediction-node.lighthouse-fire", pathIds: ["prediction-path.lighthouse", "prediction-path.conflict"], title: "灯塔失火", summary: "冲突在灯塔升级，迫使人物选择新的行动。", narrativeTime: "第2夜", identityResolution: identityFor("灯塔失火", "与来源事件的封锁结果不同。"), timeConsistency: { kind: "consistent", label: "第2夜", reason: null } },
        { id: "prediction-node.harbor-departure", pathIds: ["prediction-path.lighthouse"], title: "雾港启航", summary: "候选路线进入雾港的离港决定。", narrativeTime: null, identityResolution: identityFor("雾港启航", "是推演后的新离港选择。"), timeConsistency: { kind: "unknown", label: "时间未定", reason: "来源不足以确定世界时间。" } },
        { id: "prediction-node.rain-trace", pathIds: ["prediction-path.rain"], title: "雨夜追踪", summary: "另一条路径沿异常信号展开追踪。", narrativeTime: "第3夜", identityResolution: identityFor("雨夜追踪", "与既有来源节点的后果不同。"), timeConsistency: { kind: "consistent", label: "第3夜", reason: null } },
        { id: "prediction-node.signal-merge", pathIds: ["prediction-path.lighthouse", "prediction-path.rain"], title: "异常信号增强", summary: "两条候选在异常信号处合流。", narrativeTime: "第4夜", identityResolution: { kind: "create-new-with-difference", existingEventId: null, differenceReason: "是候选路径的合流结果。" }, timeConsistency: { kind: "consistent", label: "第4夜", reason: null } },
        { id: "prediction-node.reversed-signal", pathIds: ["prediction-path.conflict"], title: "旧信号回流", summary: "此分支与已知时间顺序冲突，仅用于提示作者先处理矛盾。", narrativeTime: "第1夜", identityResolution: { kind: "create-new-with-difference", existingEventId: null, differenceReason: "这是独立的冲突样本，不会静默写入草稿。" }, timeConsistency: { kind: "conflict", label: "时间冲突", reason: "候选后果早于所选来源事件。" } }
      ];
      return {
        bundleId,
        sourceSnapshot: request.sourceEventRefs,
        predictionMode: request.predictionMode,
        nodes,
        edges: [
          edge(request, "prediction-edge.fire-harbor", "prediction-node.lighthouse-fire", "prediction-node.harbor-departure", "后续", ["prediction-path.lighthouse"], "封锁升级促使人物作出离港决定。", "促使"),
          edge(request, "prediction-edge.rain-merge", "prediction-node.rain-trace", "prediction-node.signal-merge", "合流", ["prediction-path.rain"], "追踪结果增强了异常信号。", null),
          edge(request, "prediction-edge.harbor-merge", "prediction-node.harbor-departure", "prediction-node.signal-merge", "合流", ["prediction-path.lighthouse"], "启航决定与异常信号汇合。", null),
          edge(request, "prediction-edge.fire-reversed", "prediction-node.lighthouse-fire", "prediction-node.reversed-signal", "冲突分支", ["prediction-path.conflict"], "该连线只标记冲突分支，不推断正式关系。", null)
        ],
        paths: [
          { id: "prediction-path.lighthouse", title: "灯塔路线", candidateNodeIds: ["prediction-node.lighthouse-fire", "prediction-node.harbor-departure", "prediction-node.signal-merge"], candidateEdgeIds: ["prediction-edge.fire-harbor", "prediction-edge.harbor-merge"] },
          { id: "prediction-path.rain", title: "雨夜路线", candidateNodeIds: ["prediction-node.rain-trace", "prediction-node.signal-merge"], candidateEdgeIds: ["prediction-edge.rain-merge"] },
          { id: "prediction-path.conflict", title: "时间冲突路径", candidateNodeIds: ["prediction-node.lighthouse-fire", "prediction-node.reversed-signal"], candidateEdgeIds: ["prediction-edge.fire-reversed"] }
        ]
      };
    }
  };
}

function edge(request: MultiNodePredictionRequest, id: string, sourceCandidateId: string, targetCandidateId: string, label: string, pathIds: string[], rationale: string, relationTypeLabel: string | null) {
  return {
    id, sourceCandidateId, targetCandidateId, label, direction: "forward" as const, pathIds,
    sourceEvidence: { sourceEventIds: request.sourceEventRefs.map((reference) => reference.eventId), rationale },
    relationTypeHint: relationTypeLabel ? { resolution: "exact" as const, label: relationTypeLabel } : { resolution: "unresolved" as const, label: null }
  };
}
