/**
 * 世界参考投影（R1）：把既有 WorldObject（含事件线索）按「类别 + 信息性质」
 * 投影为作者可读的世界参考条目。只读、纯函数、无副作用——不建立第二事实库；
 * 所有输入都来自既有 world-library 事实链。
 *
 * 该模块同时是后续角色 Agent 升级的数据接口草案：
 * - 角色 Agent 只允许消费 knowledge（角色已知/未知）与 confirmed-fact/rule 投影；
 * - author-note（作者备注/作者秘密）与 rumor 必须排除在角色上下文之外；
 * - 详见 docs/product/WORLD_REFERENCE_AND_CHARACTER_AGENT_PREP_R0.md。
 */

export type WorldReferenceCategory = "character" | "location" | "faction" | "item" | "rule" | "clue";

export type WorldReferenceNature =
  | "confirmed-fact"
  | "pending-clue"
  | "rumor"
  | "author-note";

export type WorldReferenceKnowledgeState = "known" | "unknown" | "uncertain";

export interface WorldReferenceKnowledge {
  character: string;
  state: WorldReferenceKnowledgeState;
}

export interface WorldReferenceEntry {
  id: string;
  title: string;
  category: WorldReferenceCategory;
  nature: WorldReferenceNature;
  status: string;
  /** 每个角色的知情状态（仅当对象带「知情：<角色>=<状态>」标签时出现） */
  knowledge: WorldReferenceKnowledge[];
  /** 作者可读的原始标签（保留来源语义，不做改写） */
  tags: string[];
  /** 反查键：标题、别名与标签中出现的对象名（人物：X / 单元：X / 地点：X 等） */
  relatedKeys: string[];
  updatedAt?: string;
}

export interface WorldReferenceInput {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  aliases?: string[];
  updatedAt?: string;
}

export const WORLD_REFERENCE_CATEGORY_LABELS: Record<WorldReferenceCategory, string> = {
  character: "人物",
  location: "地点",
  faction: "组织",
  item: "物件",
  rule: "规则",
  clue: "线索",
};

export const WORLD_REFERENCE_NATURE_LABELS: Record<WorldReferenceNature, string> = {
  "confirmed-fact": "已确认事实",
  "pending-clue": "待确认线索",
  rumor: "传闻 · 不确定",
  "author-note": "作者备注",
};

const CATEGORY_BY_TYPE = new Map<string, WorldReferenceCategory>([
  ["character", "character"],
  ["location", "location"],
  ["faction", "faction"],
  ["item", "item"],
  ["rule", "rule"],
  ["event", "clue"],
  ["thread", "clue"],
]);

const KNOWLEDGE_STATE_BY_TAG: Record<string, WorldReferenceKnowledgeState> = {
  已得知: "known",
  已知: "known",
  未知: "unknown",
  怀疑: "uncertain",
  被误导: "uncertain",
  误解: "uncertain",
};

function splitTagValues(raw: string): string[] {
  return raw.split(/[、，,;；]/u).map((part) => part.trim()).filter(Boolean);
}

/** 从一条标签里提取反查键：支持「人物：X、Y」「知情：X=已得知」「单元：北滨码头」。 */
function relatedKeysFromTag(tag: string): string[] {
  const keys: string[] = [];
  const split = tag.split(/[:：]/u);
  if (split.length < 2) return keys;
  for (const part of split.slice(1)) {
    for (const value of splitTagValues(part)) {
      const name = value.split(/=/u)[0]?.trim();
      if (name && !/^(已得知|已知|未知|怀疑|被误导|误解)$/u.test(name)) keys.push(name);
    }
  }
  return keys;
}

export function classifyWorldReference(input: WorldReferenceInput): WorldReferenceEntry | null {
  const category = CATEGORY_BY_TYPE.get(input.type);
  if (!category) return null;
  const tags = input.tags ?? [];
  const lowerTags = tags.map((tag) => tag.trim());
  const knowledge: WorldReferenceKnowledge[] = [];
  const relatedKeys = new Set<string>([input.title, ...(input.aliases ?? [])]);

  for (const tag of lowerTags) {
    for (const key of relatedKeysFromTag(tag)) relatedKeys.add(key);
    if (tag.startsWith("知情：") || tag.startsWith("知情:")) {
      const body = tag.slice(3);
      const name = body.split(/[=＝]/u)[0]?.trim();
      const rawState = body.split(/[=＝]/u)[1]?.trim() ?? "";
      const state = KNOWLEDGE_STATE_BY_TAG[rawState];
      if (name && state) knowledge.push({ character: name, state });
    }
  }

  // 信息性质（按优先级，完全由既有标签/状态推导，不引入新事实）：
  // 作者秘密/作者备注 > 传闻·不确定（推测/时间未知/相对锚点） > 待确认线索（草稿事件/故事线） > 已确认事实。
  let nature: WorldReferenceNature = "confirmed-fact";
  if (lowerTags.some((tag) => tag === "作者秘密" || tag === "作者备注")) nature = "author-note";
  else if (lowerTags.some((tag) => tag.startsWith("推测") || tag === "时间：未知" || tag.startsWith("相对锚点"))) nature = "rumor";
  else if ((input.type === "event" || input.type === "thread") && input.status !== "active") nature = "pending-clue";

  return {
    id: input.id,
    title: input.title,
    category,
    nature,
    status: input.status,
    knowledge,
    tags: lowerTags,
    relatedKeys: Array.from(relatedKeys),
    updatedAt: input.updatedAt,
  };
}

export function projectWorldReferences(inputs: readonly WorldReferenceInput[]): WorldReferenceEntry[] {
  return inputs.map((input) => classifyWorldReference(input)).filter((entry): entry is WorldReferenceEntry => entry !== null);
}

/** 反查：标题、别名或标签中引用了 related 的条目。 */
export function worldReferencesRelatedTo(entries: readonly WorldReferenceEntry[], related: string): WorldReferenceEntry[] {
  const key = related.trim();
  if (!key) return [];
  return entries.filter((entry) => entry.relatedKeys.some((candidate) => candidate === key));
}

/** 角色 Agent 预备接口：作者备注与传闻不得进入角色上下文；只保留该角色允许知道的条目。 */
export function characterAllowedReferences(entries: readonly WorldReferenceEntry[], character: string): WorldReferenceEntry[] {
  return entries.filter((entry) => {
    if (entry.nature === "author-note" || entry.nature === "rumor") return false;
    const knowledge = entry.knowledge.find((item) => item.character === character);
    if (!knowledge) return entry.category === "rule" || entry.category === "location" || entry.category === "faction";
    return knowledge.state === "known";
  });
}
