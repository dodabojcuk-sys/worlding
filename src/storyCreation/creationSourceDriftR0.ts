import {
  buildOwnerReferencedSemanticCompare,
  type OwnerReferencedSemanticCompare,
  type OwnerReferencedSemanticDifference
} from "../storyWorkspace/ownerReferencedSemanticCompare.ts";

export const CREATION_SOURCE_RECONCILIATION_CONFIRMABLE_IDS = [
  "creation.source-diff.event.lighthouse-window",
  "creation.source-diff.story-unit.old-name-purpose",
  "creation.source-diff.event.direct-entry-removed"
] as const;

export type CreationSourceDriftCompareR0 = OwnerReferencedSemanticCompare & {
  version: "tianyan-creation-source-drift-compare/r0";
  status: "ready" | "blocked_concurrency" | "blocked_missing_reference" | "blocked_corrupt_reference";
  sourceStatus: "historical_valid";
  artifactImpactDifferenceIds: string[];
  confirmableDifferenceIds: string[];
  unresolvedDifferenceIds: string[];
  blockerMessage: string | null;
};

export function buildCreationSourceDriftCompareR0(input: {
  baseRevision: number;
  currentRevision: number;
  baseManifestDigest: string;
  currentManifestDigest: string;
  baseOwnerDigests: Record<string, string>;
  currentOwnerDigests: Record<string, string>;
  missingReference?: boolean;
  corruptReference?: boolean;
  concurrentCurrentRevision?: number | null;
}): CreationSourceDriftCompareR0 {
  const blockedRevision = input.concurrentCurrentRevision ?? input.currentRevision;
  const status = input.missingReference
    ? "blocked_missing_reference"
    : input.corruptReference
      ? "blocked_corrupt_reference"
      : blockedRevision !== input.currentRevision
        ? "blocked_concurrency"
        : "ready";
  const differences = semanticDifferences({ missingReference: input.missingReference, corruptReference: input.corruptReference });
  const compare = buildOwnerReferencedSemanticCompare({
    baseRevision: input.baseRevision,
    currentRevision: blockedRevision,
    baseManifestDigest: input.baseManifestDigest,
    currentManifestDigest: input.currentManifestDigest,
    baseOwnerDigests: input.baseOwnerDigests,
    currentOwnerDigests: input.currentOwnerDigests,
    differences
  });
  return {
    ...compare,
    version: "tianyan-creation-source-drift-compare/r0",
    status,
    sourceStatus: "historical_valid",
    artifactImpactDifferenceIds: differences.filter((entry) => entry.affectsArtifact).map((entry) => entry.id),
    confirmableDifferenceIds: status === "ready" ? differences.filter((entry) => entry.authorConfirmable).map((entry) => entry.id) : [],
    unresolvedDifferenceIds: differences.filter((entry) => ["unknown", "conflict", "missing"].includes(entry.kind)).map((entry) => entry.id),
    blockerMessage: status === "blocked_concurrency"
      ? "主线已再次更新，请重新核对"
      : status === "blocked_missing_reference"
        ? "来源记录缺失，无法重新核对"
        : status === "blocked_corrupt_reference"
          ? "来源完整性检查失败，无法重新核对"
          : null
  };
}

export function validateCreationSourceReconciliationSelection(compare: CreationSourceDriftCompareR0, selectedDifferenceIds: readonly string[]): string[] {
  if (compare.status !== "ready") throw new Error(compare.blockerMessage || "Creation source reconciliation is blocked.");
  const selected = [...new Set(selectedDifferenceIds.map((value) => String(value).trim()).filter(Boolean))].sort();
  if (!selected.length) throw new Error("Select at least one source difference to confirm.");
  const allowed = new Set(compare.confirmableDifferenceIds);
  if (selected.some((id) => !allowed.has(id))) throw new Error("A selected source difference is no longer available.");
  return selected;
}

function semanticDifferences(input: { missingReference?: boolean; corruptReference?: boolean }): OwnerReferencedSemanticDifference[] {
  const evidenceBlocked = input.missingReference || input.corruptReference;
  return [
    {
      id: "creation.source-diff.event.lighthouse-window",
      kind: "added",
      state: "changed",
      dimension: "Event hierarchy",
      ownerKind: "event-hierarchy",
      summary: "当前主线新增了灯塔入口开放前的巡检窗口。",
      sourceRefs: ["event:fixture.event.lighthouse-window"],
      affectsArtifact: true,
      authorConfirmable: !evidenceBlocked
    },
    {
      id: "creation.source-diff.event.direct-entry-removed",
      kind: "removed",
      state: "changed",
      dimension: "Narrative order",
      ownerKind: "event-hierarchy",
      summary: "原先紧接核对记录后的直接进入灯塔计划，已不在当前来源范围。",
      sourceRefs: ["event:fixture.event.direct-entry-placeholder"],
      affectsArtifact: true,
      authorConfirmable: !evidenceBlocked
    },
    {
      id: "creation.source-diff.story-unit.old-name-purpose",
      kind: "changed",
      state: "changed",
      dimension: "Story Unit",
      ownerKind: "story-structure",
      summary: "“核对旧名”从进入灯塔前的准备动作，调整为先判断记录是否可信。",
      sourceRefs: ["story-unit:fixture.story-unit.watch-record"],
      affectsArtifact: true,
      authorConfirmable: !evidenceBlocked
    },
    {
      id: "creation.source-diff.character.knowledge-boundary",
      kind: "unchanged",
      state: "unchanged",
      dimension: "Character knowledge",
      ownerKind: "character-state",
      summary: "阿芜仍不知道寄信人身份；人物知识边界保持不变。",
      sourceRefs: ["character:fixture.character.a-wu"],
      affectsArtifact: false,
      authorConfirmable: false
    },
    {
      id: "creation.source-diff.character.fate",
      kind: "unchanged",
      state: "unchanged",
      dimension: "Character Fate",
      ownerKind: "character-state",
      summary: "人物命运节点没有新增或推进。",
      sourceRefs: ["character:fixture.character.shen-yan"],
      affectsArtifact: false,
      authorConfirmable: false
    },
    {
      id: "creation.source-diff.world-state",
      kind: "unchanged",
      state: "unchanged",
      dimension: "WorldState",
      ownerKind: "world-state",
      summary: "灯塔历史与世界状态保持不变。",
      sourceRefs: ["world-state:fixture:unchanged"],
      affectsArtifact: false,
      authorConfirmable: false
    },
    {
      id: "creation.source-diff.relation",
      kind: "unchanged",
      state: "unchanged",
      dimension: "Relation",
      ownerKind: "relation",
      summary: "沈砚与阿芜的正式关系没有变化。",
      sourceRefs: ["relation:fixture:unchanged"],
      affectsArtifact: false,
      authorConfirmable: false
    },
    {
      id: "creation.source-diff.world-time",
      kind: "unknown",
      state: "unknown",
      dimension: "World time",
      ownerKind: "event-hierarchy",
      summary: "灯塔巡检窗口的精确世界时间仍未知。",
      sourceRefs: ["source-anchor:fixture.world-time.unknown"],
      affectsArtifact: true,
      authorConfirmable: false
    },
    {
      id: "creation.source-diff.source-conflict",
      kind: "conflict",
      state: "conflict",
      dimension: "Source conflict",
      ownerKind: "source-anchors",
      summary: "旧名残页的记录人身份存在两个未裁决来源说法。",
      sourceRefs: ["source-anchor:fixture.old-name-ledger"],
      affectsArtifact: true,
      authorConfirmable: false
    },
    {
      id: "creation.source-diff.missing-evidence",
      kind: "missing",
      state: evidenceBlocked ? "insufficient" : "unknown",
      dimension: "Missing evidence",
      ownerKind: "source-anchors",
      summary: evidenceBlocked ? "来源清单或摘要指纹无法验证。" : "旧名首次出现的精确日期仍缺少证据。",
      sourceRefs: ["source-anchor:fixture.old-name-date"],
      affectsArtifact: true,
      authorConfirmable: false
    }
  ];
}
