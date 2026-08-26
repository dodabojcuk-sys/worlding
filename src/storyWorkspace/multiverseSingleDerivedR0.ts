export const MULTIVERSE_SINGLE_DERIVED_FIXTURE = "multiverse-single-derived" as const;
export const MULTIVERSE_EVENT_CHANGE_ID = "fixture.change.event.old-name-check" as const;

import type { OwnerReferencedSemanticCompareState } from "./ownerReferencedSemanticCompare.ts";

export type SemanticCompareState = OwnerReferencedSemanticCompareState;

export type SemanticCompareSignal = {
  dimension: "Event hierarchy" | "Narrative order" | "World time" | "Character action" | "Character State" | "Character knowledge" | "Character Fate" | "WorldState" | "Relation" | "Items and places" | "Source and evidence" | "Open questions" | "Conflict" | "Stale source" | "Missing evidence" | "Creation regeneration";
  state: SemanticCompareState;
  summary: string;
};

export type SemanticCompareRow = {
  owner: "Event" | "Character" | "WorldState" | "Relation";
  state: SemanticCompareState;
  base: string;
  current: string;
  derived: string;
  selectable: boolean;
  changeId: string | null;
  sourceRefs: string[];
};

export type MultiverseSemanticCompare = {
  version: "tianyan-multiverse-semantic-compare-r0/v1";
  base: { label: string; revision: number };
  current: { label: string; revision: number };
  derived: { label: string; pinnedRevision: number };
  rows: SemanticCompareRow[];
  signals: SemanticCompareSignal[];
};

/**
 * Builds the bounded three-way author projection. It references existing owner
 * identities and never persists a second delta model.
 */
export function buildSingleDerivedSemanticCompare(input: {
  rootRevision: number;
  derivedPinnedRevision: number;
  integrated: boolean;
  missingSource?: boolean;
  staleSelection?: boolean;
}): MultiverseSemanticCompare {
  const eventState: SemanticCompareState = input.missingSource
    ? "insufficient"
    : input.staleSelection
      ? "stale"
      : input.integrated
        ? "integrated"
        : "changed";
  const eventCurrent = input.integrated
    ? "已确认：先核对旧名守夜记录"
    : "铜钥匙交接后，尚未安排旧名记录核对";
  return {
    version: "tianyan-multiverse-semantic-compare-r0/v1",
    base: { label: "来源版本建立时", revision: input.derivedPinnedRevision },
    current: { label: "当前主线", revision: input.rootRevision },
    derived: { label: "旧名守夜记录走向", pinnedRevision: input.derivedPinnedRevision },
    rows: [
      {
        owner: "Event",
        state: eventState,
        base: "铜钥匙交接后，灯塔行动待定",
        current: eventCurrent,
        derived: "建议在进入灯塔前，先核对旧名守夜记录",
        selectable: !input.integrated && !input.missingSource && !input.staleSelection,
        changeId: MULTIVERSE_EVENT_CHANGE_ID,
        sourceRefs: ["source.anchor.watch-ledger-fragment", "source.anchor.a-wu-observation"]
      },
      {
        owner: "Character",
        state: "unchanged",
        base: "沈砚与阿芜仍在灯塔行动前",
        current: "沈砚与阿芜仍在灯塔行动前",
        derived: "不改写角色状态或知识",
        selectable: false,
        changeId: null,
        sourceRefs: ["fixture.character.shen-yan", "fixture.character.a-wu"]
      },
      {
        owner: "WorldState",
        state: "unchanged",
        base: "灯塔历史与世界状态未改变",
        current: "灯塔历史与世界状态未改变",
        derived: "不产生世界状态写入",
        selectable: false,
        changeId: null,
        sourceRefs: ["fixture.world.lighthouse-history"]
      },
      {
        owner: "Relation",
        state: "unknown",
        base: "当前合作关系不变",
        current: "当前合作关系不变",
        derived: "共同核对可能影响后续关系，本次不确认",
        selectable: false,
        changeId: null,
        sourceRefs: ["fixture.relation.shen-yan-a-wu"]
      }
    ],
    signals: [
      { dimension: "Event hierarchy", state: input.integrated ? "integrated" : "changed", summary: "在铜钥匙交接之后、灯塔行动之前增加一条待确认事件。" },
      { dimension: "Narrative order", state: input.integrated ? "integrated" : "changed", summary: "只调整两项既有行动之间的叙事顺序。" },
      { dimension: "World time", state: "unknown", summary: "作者尚未指定精确世界时间。" },
      { dimension: "Character action", state: input.integrated ? "integrated" : "changed", summary: "沈砚与阿芜共同核对旧名守夜记录。" },
      { dimension: "Character State", state: "unchanged", summary: "当前故事位置、目标与承诺不写入。" },
      { dimension: "Character knowledge", state: "unknown", summary: "阿芜只复述亲历观察；寄信人身份仍未知。" },
      { dimension: "Character Fate", state: "unchanged", summary: "不新增或推进人物命运节点。" },
      { dimension: "WorldState", state: "unchanged", summary: "灯塔历史与世界状态不写入。" },
      { dimension: "Relation", state: "unchanged", summary: "现有关系事实不写入。" },
      { dimension: "Items and places", state: "unchanged", summary: "潮纹铜钥匙与灯塔位置保持不变。" },
      { dimension: "Source and evidence", state: input.missingSource ? "insufficient" : "unchanged", summary: input.missingSource ? "来源锚点或版本清单缺失。" : "引用守夜记录残页与阿芜现场观察。" },
      { dimension: "Open questions", state: "unknown", summary: "寄信人身份和旧名出现时间仍是开放问题。" },
      { dimension: "Conflict", state: "unchanged", summary: "当前未发现需要作者二选一的事实冲突。" },
      { dimension: "Stale source", state: input.staleSelection ? "stale" : "unchanged", summary: input.staleSelection ? "当前主线已变化，必须重新比较。" : "来源仍钉住且可复核。" },
      { dimension: "Missing evidence", state: input.missingSource ? "insufficient" : "unchanged", summary: input.missingSource ? "缺少继续审查所需的稳定引用。" : "本轮所需证据引用完整。" },
      { dimension: "Creation regeneration", state: "unchanged", summary: "现有创作输出不需要重新生成。" }
    ]
  };
}

export function validateSingleEventSelection(compare: MultiverseSemanticCompare, selectedChangeIds: readonly string[]): SemanticCompareRow {
  const normalized = [...new Set(selectedChangeIds.map((value) => String(value).trim()).filter(Boolean))];
  if (normalized.length !== 1 || normalized[0] !== MULTIVERSE_EVENT_CHANGE_ID) {
    throw new Error("R0 requires exactly one author-selected Event difference.");
  }
  const row = compare.rows.find((item) => item.changeId === normalized[0]);
  if (!row || row.owner !== "Event" || !row.selectable || row.state !== "changed") {
    throw new Error("Selected Event difference is unavailable, stale, or blocked.");
  }
  return structuredClone(row);
}
