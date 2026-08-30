import type { MultiNodePredictionRequest, PredictionBundle, PredictionNode } from "../storyContracts/multiNodePrediction.ts";

/** Product-owned seam for a future Pi adapter; R0 deliberately uses no Provider. */
export type MultiNodePredictionGateway = {
  generate(input: { request: MultiNodePredictionRequest; sourceTitles: string[]; bundleId: string }): Promise<PredictionBundle>;
};

export function createDeterministicMultiNodePredictionGateway(): MultiNodePredictionGateway {
  return {
    async generate({ request, sourceTitles, bundleId }) {
      const existingHarbor = sourceTitles.includes("雾港启航");
      const nodes: PredictionNode[] = [
        { id: "prediction-node.lighthouse-fire", title: "灯塔失火", summary: "冲突在灯塔升级，迫使人物选择新的行动。", narrativeTime: "第2夜", identityResolution: { kind: "create-new-with-difference", existingEventId: null, differenceReason: "与来源事件的封锁结果不同。" }, timeConsistency: { kind: "consistent", label: "第2夜", reason: null } },
        { id: "prediction-node.harbor-departure", title: "雾港启航", summary: "候选路线进入雾港的离港决定。", narrativeTime: null, identityResolution: existingHarbor ? { kind: "unresolved", existingEventId: null, differenceReason: null } : { kind: "create-new-with-difference", existingEventId: null, differenceReason: "是推演后的新离港选择。" }, timeConsistency: { kind: "unknown", label: "时间未定", reason: "来源不足以确定世界时间。" } },
        { id: "prediction-node.rain-trace", title: "雨夜追踪", summary: "另一条路径沿异常信号展开追踪。", narrativeTime: "第3夜", identityResolution: { kind: "create-new-with-difference", existingEventId: null, differenceReason: "与既有来源节点的后果不同。" }, timeConsistency: { kind: "consistent", label: "第3夜", reason: null } },
        { id: "prediction-node.signal-merge", title: "异常信号增强", summary: "两条候选在异常信号处合流。", narrativeTime: "第4夜", identityResolution: { kind: "create-new-with-difference", existingEventId: null, differenceReason: "是候选路径的合流结果。" }, timeConsistency: { kind: "consistent", label: "第4夜", reason: null } }
      ];
      return {
        bundleId,
        sourceSnapshot: request.sourceEventRefs,
        predictionMode: request.predictionMode,
        nodes,
        edges: [
          { id: "prediction-edge.fire-harbor", sourceCandidateId: "prediction-node.lighthouse-fire", targetCandidateId: "prediction-node.harbor-departure", label: "后续" },
          { id: "prediction-edge.rain-merge", sourceCandidateId: "prediction-node.rain-trace", targetCandidateId: "prediction-node.signal-merge", label: "合流" },
          { id: "prediction-edge.harbor-merge", sourceCandidateId: "prediction-node.harbor-departure", targetCandidateId: "prediction-node.signal-merge", label: "合流" }
        ],
        paths: [
          { id: "prediction-path.lighthouse", title: "灯塔路线", candidateNodeIds: ["prediction-node.lighthouse-fire", "prediction-node.harbor-departure", "prediction-node.signal-merge"], candidateEdgeIds: ["prediction-edge.fire-harbor", "prediction-edge.harbor-merge"] },
          { id: "prediction-path.rain", title: "雨夜路线", candidateNodeIds: ["prediction-node.rain-trace", "prediction-node.signal-merge"], candidateEdgeIds: ["prediction-edge.rain-merge"] }
        ]
      };
    }
  };
}
