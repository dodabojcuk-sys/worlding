/**
 * 角色上下文包（ContextPack）R0：确定性的角色执行上下文预览。
 * 只读、纯函数、同输入必得同输出；不调用 Provider、不写入任何事实。
 *
 * 知识边界（硬约束）：
 * - 作者备注/作者秘密（author-note）永不进入；
 * - 传闻·不确定（rumor）永不进入；
 * - `知情：<角色>=未知/怀疑` 的世界事实对该角色不可见；
 * - 只检索与当前场景/已纳入事实相关的记忆，不返回全部记忆。
 * 复用 worldReferenceProjection 的 characterAllowedReferences 分类。
 * 详见 docs/product/WORLD_REFERENCE_AND_CHARACTER_AGENT_PREP_R0.md。
 */

import { characterAllowedReferences, type WorldReferenceEntry } from "./worldReferenceProjection.ts";

export const CHARACTER_CONTEXT_PACK_VERSION = "tianyan-character-context-pack/r0" as const;

export type ContextPackExclusionReason = "author-note" | "rumor" | "character-unknown";

export interface ContextPackFactItem {
  title: string;
  categoryLabel: string;
  knowledgeLabel: string | null;
}

export interface ContextPackMemoryItem {
  id: string;
  label: string;
  title: string;
  summary: string;
  occurredAt: string | null;
  validity: string;
}

export interface ContextPackRelationItem {
  other: string;
  typeLabel: string;
  directionLabel: string;
}

export interface ContextPackExclusion {
  title: string;
  reason: ContextPackExclusionReason;
}

export interface CharacterContextPackInput {
  characterTitle: string;
  sceneFrame: { title: string; worldTimeLabel: string } | null;
  goal: string | null;
  profileCore: string | null;
  boundaries: string | null;
  /** 世界参考投影条目（已经由 world-library 事实推导性质/知情） */
  worldReferences: WorldReferenceEntry[];
  /** 正式关系快照（Relation Owner 已确认记录） */
  relations: ContextPackRelationItem[];
  /** 该角色的全部可召回记忆（本函数负责相关检索） */
  memories: ContextPackMemoryItem[];
  /** 事件线知识投影已经裁定该角色可见的事件标题 */
  visibleEventTitles: string[];
  /** 连续性回退：仅当调用方明确要求时，零命中后才以最近有效记忆补位；默认 "none" 返回 0 条。 */
  memoryFallback?: "none" | "recent";
}

export interface CharacterContextPack {
  version: typeof CHARACTER_CONTEXT_PACK_VERSION;
  characterTitle: string;
  sceneFrame: CharacterContextPackInput["sceneFrame"];
  goal: string | null;
  kernel: { core: string | null; boundaries: string | null };
  includedFacts: ContextPackFactItem[];
  includedMemories: ContextPackMemoryItem[];
  relationSnapshot: ContextPackRelationItem[];
  visibleEvents: string[];
  excluded: ContextPackExclusion[];
  estimatedTokens: number;
  providerCalls: 0;
}

const MAX_RETRIEVED_MEMORIES = 6;
const CATEGORY_LABELS: Record<string, string> = { character: "人物", location: "地点", faction: "组织", item: "物件", rule: "规则", clue: "线索" };

/** 保守 token 估算：UTF-8 字节数 ÷ 3，向上取整；不是计费 token。 */
function estimateTokens(pack: Omit<CharacterContextPack, "estimatedTokens" | "providerCalls">): number {
  const bytes = new TextEncoder().encode(JSON.stringify(pack)).length;
  return Math.ceil(bytes / 3);
}

export function buildCharacterContextPack(input: CharacterContextPackInput): CharacterContextPack {
  const { characterTitle } = input;
  // 1. 知识边界裁剪：作者备注/传闻/该角色未知 全部排除（含排除理由）。
  const allowed = characterAllowedReferences(input.worldReferences, characterTitle);
  const allowedTitles = new Set(allowed.map((entry) => entry.title));
  const excluded: ContextPackExclusion[] = input.worldReferences
    .filter((entry) => !allowedTitles.has(entry.title))
    .map((entry): ContextPackExclusion => ({
      title: entry.title,
      reason: entry.nature === "author-note" ? "author-note" : entry.nature === "rumor" ? "rumor" : "character-unknown",
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));

  const includedFacts: ContextPackFactItem[] = allowed
    .map((entry) => ({
      title: entry.title,
      categoryLabel: CATEGORY_LABELS[entry.category] ?? entry.category,
      knowledgeLabel: entry.knowledge.find((item) => item.character === characterTitle)?.state === "known" ? "该角色已知" : null,
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));

  // 2. 记忆检索：只取与当前场景或已纳入事实/可见事件相关的记忆，不返回全部；
  // 零命中时默认返回 0 条。只有调用方显式传 memoryFallback="recent"（continuity 回退）
  // 才以最近有效记忆补位；该回退不写任何事实。
  const sceneTitle = input.sceneFrame?.title ?? "";
  const needles = [sceneTitle, ...input.visibleEventTitles, ...includedFacts.map((fact) => fact.title)]
    .map((needle) => needle.trim())
    .filter(Boolean);
  const activeMemories = input.memories.filter((memory) => memory.validity !== "invalidated");
  const matched = activeMemories.filter((memory) => needles.some((needle) => `${memory.title}${memory.summary}`.includes(needle)));
  const orderedSource = matched.length || input.memoryFallback !== "recent" ? matched : [...activeMemories].sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));
  const relatedMemories = orderedSource.slice(0, MAX_RETRIEVED_MEMORIES);

  const partial: Omit<CharacterContextPack, "estimatedTokens" | "providerCalls"> = {
    version: CHARACTER_CONTEXT_PACK_VERSION,
    characterTitle,
    sceneFrame: input.sceneFrame,
    goal: input.goal,
    kernel: { core: input.profileCore, boundaries: input.boundaries },
    includedFacts,
    includedMemories: relatedMemories,
    relationSnapshot: input.relations,
    visibleEvents: [...input.visibleEventTitles].sort((left, right) => left.localeCompare(right, "zh-CN")),
    excluded,
  };
  return { ...partial, estimatedTokens: estimateTokens(partial), providerCalls: 0 };
}
