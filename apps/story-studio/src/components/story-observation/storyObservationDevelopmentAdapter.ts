import {
  STORY_OBSERVATION_PROPOSAL_PATCH_VERSION,
  storyObservationStableHash,
  type StoryObservationProposalOperation,
  type StoryObservationProposalPatch,
  type StoryObservationSelectionContext
} from "../../../../../src/storyContracts/storyObservationProposalPatch.ts";

import type { StoryObservationModel, StoryObservationNode } from "./storyObservationProjection.ts";

/**
 * Isolated R0 adapter for interaction validation only. It is never used as a
 * production AI fallback and reports zero Provider calls in the patch itself.
 */
export function createStoryObservationDevelopmentPatch(input: {
  projectId: string;
  model: StoryObservationModel;
  selection: StoryObservationSelectionContext;
  createdAt?: string;
}): StoryObservationProposalPatch {
  const selectedNodes = input.model.nodes.filter((node) => node.status === "confirmed" && input.selection.nodeIds.includes(node.id));
  const contextSeed = {
    projectId: input.projectId,
    canonVersion: input.model.canonVersion,
    selection: input.selection
  };
  const stable = storyObservationStableHash(contextSeed);
  const sources = selectedNodes.length > 0
    ? selectedNodes.slice(0, 12).map((node) => sourceFromNode(node))
    : [{
      id: `time-window-${stable}`,
      type: "selection-window",
      label: input.selection.timeWindow
        ? `时间窗口 ${input.selection.timeWindow.startLabel} – ${input.selection.timeWindow.endLabel}`
        : "当前故事观测选区",
      excerpt: "该适配器只携带稳定节点 ID、当前筛选与时间窗口，不复制完整故事原文。"
    }];
  const operations = input.selection.timeWindow
    ? timeWindowOperations(stable, input.selection, selectedNodes)
    : nodeSelectionOperations(stable, input.selection, selectedNodes);
  return {
    version: STORY_OBSERVATION_PROPOSAL_PATCH_VERSION,
    patchId: `story-observation-patch-${stable}`,
    projectId: input.projectId,
    baseCanonVersion: input.model.canonVersion,
    contextId: `story-observation-context-${stable}`,
    selection: input.selection,
    sources,
    unknowns: [
      "真实 Tianyi 结构化 Proposal Patch 运行端口尚未接入。",
      "任何未被来源明确提供的世界时间均保持未定。"
    ],
    prohibitedChanges: [
      "不直接写入 Canon",
      "不修改 confirmed Event",
      "不改写 WorldState",
      "不将画布坐标当作故事事实"
    ],
    operations,
    adapter: { kind: "development-deterministic", providerCalls: 0 },
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

function nodeSelectionOperations(
  stable: string,
  selection: StoryObservationSelectionContext,
  nodes: readonly StoryObservationNode[]
): StoryObservationProposalOperation[] {
  const affectedNodeIds = nodes.map((node) => node.id);
  const subject = nodes.map((node) => node.title).join("、") || "所选节点";
  const evidence = nodes.map((node) => `${node.title}：${node.summary.slice(0, 180)}`);
  return [
    {
      operationId: `observation-route-${stable}-a`,
      kind: "add-event",
      title: "推进一条可回收的后续线索",
      change: `在${subject}之后建立一个待评审的后续事件。`,
      after: "保留当前事实，只增加一条能被后文验证的可选推进。",
      rationale: "使下一步与已选事件建立明确来源，同时保留作者拒绝的余地。",
      confidence: 0.68,
      risk: "可能过早固定尚未决定的动机。",
      affectedNodeIds,
      evidence,
      conflicts: ["需复核是否与未显示的伏笔冲突。"],
      timeEstimate: { label: "时间未定", precision: "unknown" }
    },
    {
      operationId: `observation-route-${stable}-b`,
      kind: "add-relation",
      title: "先补全前因，不新增故事事实",
      change: `为${subject}之间提议一条候选语义关系。`,
      after: "画布显示虚线关系，在通过影响评审前不改变任何事件。",
      rationale: "当后续方向仍不稳定时，关系候选比直接新增事件更可逆。",
      confidence: 0.61,
      risk: "关系类型可能因观测者不同而变化。",
      affectedNodeIds,
      evidence,
      conflicts: [],
      timeEstimate: null
    },
    {
      operationId: `observation-route-${stable}-c`,
      kind: "flag-conflict",
      title: "保持当前事实，标记逻辑空缺",
      change: "不新增节点或关系，只把需要作者回答的冲突送入评审。",
      after: "故事投影保持原样，待作者明确未决问题。",
      rationale: "当证据不足时，拒绝自动补齐比增加伪事实更安全。",
      confidence: 0.82,
      risk: "故事推进会暂时停留在当前节点。",
      affectedNodeIds,
      evidence,
      conflicts: ["所选节点的先后或因果仍需作者判断。"],
      timeEstimate: null
    }
  ];
}

function timeWindowOperations(
  stable: string,
  selection: StoryObservationSelectionContext,
  nodes: readonly StoryObservationNode[]
): StoryObservationProposalOperation[] {
  const affectedNodeIds = nodes.map((node) => node.id);
  const window = selection.timeWindow;
  const label = window ? `${window.startLabel} – ${window.endLabel}` : "所选时间窗口";
  const evidence = nodes.length > 0
    ? nodes.map((node) => `${node.title}：${node.time.label}`)
    : [`时间窗口：${label}`];
  return [
    {
      operationId: `observation-time-${stable}-a`,
      kind: "add-event",
      title: "在时间空档中提出一个可能节点",
      change: `在 ${label} 中预览一个 AI 候选事件。`,
      after: "候选节点保持虚框，且不会自动获得精确世界时间。",
      rationale: "用可见的时间窗口界定推演范围，避免对整个故事做无边界推断。",
      confidence: 0.57,
      risk: "空档可能是有意留白，不应自动补齐。",
      affectedNodeIds,
      evidence,
      conflicts: ["需检查是否破坏节奏或伏笔。"],
      timeEstimate: { label, precision: "range" }
    },
    {
      operationId: `observation-time-${stable}-b`,
      kind: "change-time",
      title: "仅建议时间范围，保留不确定度",
      change: `为所选事件提议 ${label} 的时间范围。`,
      after: "在评审通过前，Event 的原有时间属性保持不变。",
      rationale: "横向拖动表达修改意图，但不应绕过作者确认。",
      confidence: 0.64,
      risk: "改动可能影响同时事件和前置关系。",
      affectedNodeIds,
      evidence,
      conflicts: ["需检查当前 timeline requires 依赖。"],
      timeEstimate: { label, precision: "range" }
    },
    {
      operationId: `observation-time-${stable}-c`,
      kind: "flag-conflict",
      title: "保留时间未定",
      change: "不赋予事件任何伪造的具体时点。",
      after: "待作者补充世界时间来源后再进行对齐。",
      rationale: "缺失权威时间字段时，诚实的未定状态优先于强行排序。",
      confidence: 0.9,
      risk: "时间线将保留未定区域。",
      affectedNodeIds,
      evidence,
      conflicts: [],
      timeEstimate: { label: "时间未定", precision: "unknown" }
    }
  ];
}

function sourceFromNode(node: StoryObservationNode): StoryObservationProposalPatch["sources"][number] {
  return {
    id: node.eventId || node.id,
    type: "verified-canon-event",
    label: node.title,
    excerpt: node.summary.slice(0, 1_000)
  };
}
