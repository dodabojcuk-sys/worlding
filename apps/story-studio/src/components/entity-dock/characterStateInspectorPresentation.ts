import { knowledgeStateLabel, type EventKnowledgeState, type KnowledgeObserver } from "../../../../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import type { ContextPackExclusion, ContextPackExclusionReason } from "../../../../../src/storyContracts/characterContextPack.ts";

export const CHARACTER_STATE_INSPECTOR_VIEW_VERSION = "tianyan-character-state-inspector-view/r0" as const;

export type CharacterStateInspectorEventInput = {
  eventId: string;
  title: string;
  knowledgeState: EventKnowledgeState;
  /** 契约对非作者观察者恒为 null；本视图无论如何不读它。 */
  body: string | null;
};

export type CharacterStateInspectorInput = {
  observerKind: KnowledgeObserver["kind"];
  visibleEvents: readonly CharacterStateInspectorEventInput[];
  hiddenCount: number;
  projectionRevision: string | null;
  exclusions: readonly ContextPackExclusion[];
};

export type CharacterStateInspectorLine = {
  eventId: string;
  label: string;
  statement: string;
  sourceAnchor: string;
};

export type CharacterStateInspectorView = {
  version: typeof CHARACTER_STATE_INSPECTOR_VIEW_VERSION;
  knowledge: CharacterStateInspectorLine[];
  belief: CharacterStateInspectorLine[];
  contradictions: CharacterStateInspectorLine[];
  unknown: { count: number; identitiesShown: false; text: string };
  exclusions: Array<{ reason: ContextPackExclusionReason; label: string; count: number }>;
  projectionRevision: string | null;
  asOf: null;
  asOfText: string;
  writes: 0;
  providerCalls: 0;
};

/** 与 eventStoryCrossingKnowledge.ts:275 / characterStateProjection.ts:165 同一套划分，不另造词表。 */
const BELIEF_STATES: readonly EventKnowledgeState[] = ["believes", "suspects", "misled", "denied"];
const KNOWLEDGE_STATES: readonly EventKnowledgeState[] = ["experienced", "witnessed", "informed"];
const EXCLUSION_ORDER: ReadonlyArray<{ reason: ContextPackExclusionReason; label: string }> = [
  { reason: "author-note", label: "作者备注" },
  { reason: "rumor", label: "传闻" },
  { reason: "character-unknown", label: "该角色未知" }
];

/**
 * 只读地把知情投影已经跨界的字段整理成「他知道 / 他相信 / 互相矛盾 / 他不知道」。
 * 不推断缺失维度，不读正文，不输出被排除项的标题。
 */
export function buildCharacterStateInspectorView(input: CharacterStateInspectorInput): CharacterStateInspectorView {
  const line = (event: CharacterStateInspectorEventInput): CharacterStateInspectorLine => ({
    eventId: event.eventId,
    label: knowledgeStateLabel(event.knowledgeState),
    statement: event.title,
    sourceAnchor: `event:${event.eventId}`
  });
  const visible = input.visibleEvents ?? [];
  const knowledge = visible.filter((event) => KNOWLEDGE_STATES.includes(event.knowledgeState)).map(line);
  const belief = visible.filter((event) => BELIEF_STATES.includes(event.knowledgeState)).map(line);
  const contradictions = visible.filter((event) => event.knowledgeState === "contradicted").map(line);
  const hiddenCount = Math.max(0, Number.isSafeInteger(input.hiddenCount) ? input.hiddenCount : 0);
  const unknownCount = visible.filter((event) => event.knowledgeState === "unknown").length + hiddenCount;
  const counts = new Map<ContextPackExclusionReason, number>();
  for (const exclusion of input.exclusions ?? []) counts.set(exclusion.reason, (counts.get(exclusion.reason) ?? 0) + 1);

  return {
    version: CHARACTER_STATE_INSPECTOR_VIEW_VERSION,
    knowledge,
    belief,
    contradictions,
    unknown: {
      count: unknownCount,
      identitiesShown: false,
      text: input.observerKind === "author"
        ? `${unknownCount} 项标注为未知。`
        : `${unknownCount} 项对该角色未知；其标题与正文不进入本面板。`
    },
    exclusions: EXCLUSION_ORDER.map((entry) => ({ reason: entry.reason, label: entry.label, count: counts.get(entry.reason) ?? 0 })),
    projectionRevision: input.projectionRevision ?? null,
    asOf: null,
    asOfText: "无世界时间依据（当前来源只有叙事顺序）",
    writes: 0,
    providerCalls: 0
  };
}
