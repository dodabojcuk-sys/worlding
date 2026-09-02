import type { StoryModelingRequest, StoryModelingResult, StoryModelingSource } from "../storyContracts/storyModeling.ts";

export type StoryModelingEvidenceSource = StoryModelingSource & { content: string };

export type StoryModelingGatewayResult = {
  provider: { providerId: string; modelId: string; executionKind: "real-provider" | "test-provider" };
  usage: { providerRequests: number; inputTokens: number; outputTokens: number };
  result: StoryModelingResult;
};

export type StoryModelingBatchProgress = {
  batchIndex: number;
  inputTokens: number;
  outputTokens: number;
  result: StoryModelingResult;
};

export type StoryModelingGateway = {
  generate(input: { request: StoryModelingRequest; runId: string; signal: AbortSignal; sources: StoryModelingEvidenceSource[]; completedBatches?: StoryModelingBatchProgress[]; onBatch?(progress: StoryModelingBatchProgress): void | Promise<void> }): Promise<StoryModelingGatewayResult>;
};

export function createUnavailableStoryModelingGateway(): StoryModelingGateway {
  return { async generate() { throw new Error("Story modeling Provider is not configured; the base layout remains available."); } };
}

/** Networkless, explicitly labelled test Provider used only by isolated test/evidence runtimes. */
export function createStoryModelingTestGateway(): StoryModelingGateway {
  return {
    async generate({ request, runId, signal, onBatch }) {
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
      const result: StoryModelingResult = {
        tool: request.tool,
        structureFindings: structureFindingsForTool(request.tool, runId, request.manifest.sources.slice(0, 4).map((source) => source.sourceId)),
        temporalPlacements: ["infer-temporal-position", "check-temporal-conflicts", "update-changed-scope"].includes(request.tool) ? temporalPlacements : [],
        relationCandidates: ["smart-relations", "check-broken-links", "suggest-causal-relations"].includes(request.tool) ? relationCandidates : [],
        logicFindings: request.tool === "run-logic-check" || request.tool === "check-structure-breaks" ? [{ findingId: `logic-finding.${runId}.causal`, kind: "causal-gap", source: "ai", severity: "warning", confidence: .74, affectedEventIds: ids.slice(0, 2), affectedUnitIds: [], affectedAgentIds: [], evidenceRefs: ids.slice(0, 2).map((id) => `event:${id}`), rationale: "两个相邻事件缺少作者已确认的因果过程。", impact: "读者可能无法理解行动为何在此刻发生。", authorStatus: "pending" }] : [],
        perspectiveMatches: request.tool === "analyze-perspective" && ids[0] ? request.selectedPerspectiveRefs.map((ref, index) => ({ matchId: `perspective-match.${runId}.${index + 1}`, perspectiveType: ref.objectType, perspectiveObjectId: ref.objectId, eventId: ids[index % ids.length]!, relationKind: "ai-inferred", knowledgeState: index % 2 ? "misunderstood" : "unknown", confidence: .68, evidenceRefs: [`event:${ids[index % ids.length]}`], rationale: "测试 Provider 只返回可审阅的视角匹配。" })) : []
      };
      await onBatch?.({ batchIndex: 0, inputTokens: Math.min(request.estimate.inputTokenRange.max, Math.max(128, request.estimate.inputTokenRange.min)), outputTokens: Math.min(request.estimate.outputTokenRange.max, 256), result });
      return {
        provider: { providerId: "tianyi-test-provider", modelId: "networkless-story-modeling-fixture", executionKind: "test-provider" },
        usage: { providerRequests: Math.min(request.estimate.providerRequestRange.max, Math.max(1, request.scope.kind === "full-book" ? 3 : 1)), inputTokens: Math.min(request.estimate.inputTokenRange.max, Math.max(128, request.estimate.inputTokenRange.min)), outputTokens: Math.min(request.estimate.outputTokenRange.max, 256) },
        result
      };
    }
  };
}

function structureFindingsForTool(tool: StoryModelingRequest["tool"], runId: string, sourceRefs: string[]): StoryModelingResult["structureFindings"] {
  if (tool === "analyze-core-story") return [{ id: `modeling-finding.${runId}.core`, kind: "core-line", title: "核心推进线候选", summary: "危机从暗号泄露推进到仓库封锁，并留下港口启航的开放钩子。", confidence: .78, sourceRefs }];
  if (tool === "suggest-unit-boundaries") return [{ id: `modeling-finding.${runId}.unit`, kind: "unit-boundary", title: "单元边界候选", summary: "在仓库封锁后形成可审阅的单元分界，不会直接改动 Unit。", confidence: .73, sourceRefs }];
  if (tool === "check-structure-breaks") return [{ id: `modeling-finding.${runId}.break`, kind: "structure-break", title: "结构断点候选", summary: "开放钩子与后续行动之间缺少已确认过渡。", confidence: .71, sourceRefs }];
  if (tool === "compare-branch-units") return [{ id: `modeling-finding.${runId}.branch`, kind: "branch-comparison", title: "分支单元对照", summary: "分支与主干保持独立来源，候选差异等待作者审阅。", confidence: .76, sourceRefs }];
  return [];
}
