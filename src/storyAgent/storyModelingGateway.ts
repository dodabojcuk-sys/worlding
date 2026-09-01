import type { StoryModelingRequest, StoryModelingResult } from "../storyContracts/storyModeling.ts";

export type StoryModelingGatewayResult = {
  provider: { providerId: string; modelId: string; executionKind: "real-provider" | "test-provider" };
  usage: { providerRequests: number; inputTokens: number; outputTokens: number };
  result: StoryModelingResult;
};

export type StoryModelingGateway = {
  generate(input: { request: StoryModelingRequest; runId: string; signal: AbortSignal }): Promise<StoryModelingGatewayResult>;
};

export function createUnavailableStoryModelingGateway(): StoryModelingGateway {
  return { async generate() { throw new Error("Story modeling Provider is not configured; the base layout remains available."); } };
}

/** Networkless, explicitly labelled test Provider used only by isolated test/evidence runtimes. */
export function createStoryModelingTestGateway(): StoryModelingGateway {
  return {
    async generate({ request, runId, signal }) {
      if (signal.aborted) throw new Error("Story modeling test Provider was stopped.");
      const ids = request.eventRefs.map((ref) => ref.eventId);
      const temporalPlacements = ids.map((eventId, index) => ({
        eventId,
        kind: index === ids.length - 1 ? "conflict" as const : index === 1 ? "interval" as const : index === 0 ? "anchored" as const : "inferred" as const,
        x: 160 + index * 220,
        y: 110 + (index % 3) * 140,
        label: index === ids.length - 1 ? "时间证据冲突" : index === 1 ? "第1夜后半段" : index === 0 ? "封锁前" : `阶段 ${index + 1}`,
        interval: index === 1 ? { start: 300, end: 480 } : null,
        confidence: index === ids.length - 1 ? null : Math.max(.52, .92 - index * .08),
        sourceRefs: [`manifest:${request.manifest.manifestId}`, `event:${eventId}`]
      }));
      const relationCandidates = ids.slice(0, -1).map((sourceEventId, index) => ({
        candidateId: `modeling-relation.${runId}.${index + 1}`,
        sourceEventId,
        targetEventId: ids[index + 1]!,
        suggestedTypeId: index === 1 ? null : "causes",
        suggestedTypeLabel: index === 1 ? "类型待确认" : "推动",
        direction: "forward" as const,
        confidence: Math.max(.55, .86 - index * .09),
        rationale: index === 1 ? "两段来源存在连续行动，但关系类型仍需作者判断。" : "后续事件延续了前一事件的直接压力。",
        evidenceRefs: [`event:${sourceEventId}`, `event:${ids[index + 1]}`],
        reviewState: "candidate" as const,
        sourceRunId: runId
      }));
      return {
        provider: { providerId: "tianyi-test-provider", modelId: "networkless-story-modeling-fixture", executionKind: "test-provider" },
        usage: { providerRequests: Math.min(request.estimate.providerRequestRange.max, Math.max(1, request.scope.kind === "full-book" ? 3 : 1)), inputTokens: Math.min(request.estimate.inputTokenRange.max, Math.max(128, request.estimate.inputTokenRange.min)), outputTokens: Math.min(request.estimate.outputTokenRange.max, 256) },
        result: {
          structureFindings: [{ id: `modeling-finding.${runId}.core`, kind: "core-line", title: "核心推进线候选", summary: "危机从暗号泄露推进到仓库封锁，并留下港口启航的开放钩子。", confidence: .78, sourceRefs: request.manifest.sources.slice(0, 4).map((source) => source.sourceId) }],
          temporalPlacements,
          relationCandidates
        }
      };
    }
  };
}
