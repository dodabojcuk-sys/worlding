/**
 * 世界构建因果—演化投影（R2）：把既有 WorldObject（markdown 正文 + 标签 + 状态）
 * 投影为「因果—演化卡」与确定性 WorldContextPack。只读、纯函数、无副作用——
 * 不建立第二事实库、不写入"当前状态事实表"、不调用 Provider。
 *
 * 诚实原则：每个字段要么携带来源（object-body / tags），要么 text=null（界面显示
 * 「尚未记录」）；绝不把候选当成主线事实、绝不生成无来源内容。
 */

import { projectWorldReferences, type WorldReferenceCategory, type WorldReferenceEntry, type WorldReferenceNature } from "./worldReferenceProjection.ts";

export const WORLD_CAUSAL_EVOLUTION_VERSION = "tianyan-world-causal-evolution/r0" as const;

export type CausalScopeLevel = "macro" | "meso" | "micro";
export type CausalExpression = "continuous" | "discrete" | "set-membership" | "rule-boundary";
export type CausalChangeKind = "fixed" | "periodic" | "event-triggered" | "mixed";
export type CausalAuthority = "author" | "confirmed-event" | "planned" | "candidate";

export interface CausalField {
  text: string | null;
  source: "object-body" | "tags" | null;
}

export interface CausalEvolutionSection {
  heading: string;
  text: string;
}

export interface CausalDimensions {
  scopeLevel: CausalScopeLevel;
  expression: CausalExpression;
  changeKind: CausalChangeKind;
  bounds: string[] | null;
  authority: CausalAuthority;
  worldTime: string | null;
  branchLabel: string;
}

export interface CausalTimeFrame {
  label: "起源" | "演化节点" | "当前状态" | "规划/候选";
  title: string;
  detail: string | null;
  eventId: string | null;
  frameAuthority: "confirmed-event" | "planned" | "candidate";
}

export interface CausalEvolutionCard {
  version: typeof WORLD_CAUSAL_EVOLUTION_VERSION;
  objectId: string;
  title: string;
  categoryLabel: string;
  definition: CausalField;
  scope: CausalField;
  origin: CausalField;
  mechanism: CausalField;
  interests: CausalField;
  evolutionNotes: CausalField;
  variants: CausalField;
  sections: CausalEvolutionSection[];
  dimensions: CausalDimensions;
  timeFrames: CausalTimeFrame[];
  sourceRef: string;
}

export interface CausalEvolutionObjectInput {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  aliases?: string[];
  body?: string | null;
  relativeId?: string | null;
}

const CATEGORY_LABELS: Record<WorldReferenceCategory, string> = { character: "人物", location: "地点", faction: "组织", item: "物件", rule: "规则", clue: "线索" };

function parseBodySections(body: string | null | undefined): CausalEvolutionSection[] {
  if (!body) return [];
  const sections: CausalEvolutionSection[] = [];
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentHeading) sections.push({ heading: currentHeading, text: buffer.join("\n").trim() });
  };
  for (const line of body.split(/\r?\n/u)) {
    const headingMatch = line.match(/^#{1,3}\s*(.+?)\s*$/u);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1];
      buffer = [];
    } else if (currentHeading) {
      buffer.push(line);
    }
  }
  flush();
  return sections.filter((section) => section.text.length > 0);
}

function sectionText(sections: readonly CausalEvolutionSection[], headings: readonly string[]): CausalField {
  const found = sections.find((section) => headings.some((heading) => section.heading.includes(heading)));
  return found ? { text: found.text, source: "object-body" } : { text: null, source: null };
}

function deriveDimensions(tags: readonly string[], type: string, status: string, branchLabel: string): CausalDimensions {
  const has = (needle: string) => tags.some((tag) => tag.includes(needle));
  const scopeLevel: CausalScopeLevel = type === "rule" ? "macro" : type === "item" ? "micro" : "meso";
  const expression: CausalExpression = type === "rule" ? "rule-boundary" : type === "item" ? "discrete" : "set-membership";
  const periodic = has("潮汐") || has("周期") || has("季节");
  const eventTriggered = has("事件触发") || tags.some((tag) => tag.startsWith("起源"));
  const changeKind: CausalChangeKind = periodic && eventTriggered ? "mixed" : periodic ? "periodic" : eventTriggered ? "event-triggered" : "fixed";
  const bounds = tags.filter((tag) => tag.startsWith("禁忌") || tag.startsWith("例外") || tag.startsWith("边界"));
  const timeTag = tags.find((tag) => tag.startsWith("时间："));
  return {
    scopeLevel,
    expression,
    changeKind,
    bounds: bounds.length ? bounds : null,
    authority: status === "active" ? "author" : "candidate",
    worldTime: timeTag ? timeTag.slice(3).trim() : null,
    branchLabel,
  };
}

const ORIGIN_HEADINGS = ["起源", "原因", "由来"];
const MECHANISM_HEADINGS = ["机制", "运作", "维持"];
const INTERESTS_HEADINGS = ["利益", "代价", "受益"];
const EVOLUTION_HEADINGS = ["演化", "历史阶段"];
const VARIANT_HEADINGS = ["变体", "例外", "禁忌"];

/** 因果—演化卡：A 定义与范围 / B 起源与原因 / C 运作机制 / D 利益与代价 / E 演化 / F 变体。
 * 每个字段要么来自对象 markdown 正文（来源=object-body），要么 text=null（尚未记录）。 */
export function projectCausalEvolution(object: CausalEvolutionObjectInput, branchLabel = "当前主线"): CausalEvolutionCard {
  const sections = parseBodySections(object.body);
  const definition = sectionText(sections, ["定义"]);
  const scope = sectionText(sections, ["范围", "适用"]);
  const dimensions = deriveDimensions(object.tags ?? [], object.type, object.status, branchLabel);
  return {
    version: WORLD_CAUSAL_EVOLUTION_VERSION,
    objectId: object.id,
    title: object.title,
    categoryLabel: CATEGORY_LABELS[(object.type === "event" || object.type === "thread" ? "clue" : object.type) as WorldReferenceCategory] ?? object.type,
    definition,
    scope,
    origin: sectionText(sections, ORIGIN_HEADINGS),
    mechanism: sectionText(sections, MECHANISM_HEADINGS),
    interests: sectionText(sections, INTERESTS_HEADINGS),
    evolutionNotes: sectionText(sections, EVOLUTION_HEADINGS),
    variants: sectionText(sections, VARIANT_HEADINGS),
    sections,
    dimensions,
    timeFrames: [],
    sourceRef: object.relativeId ?? object.id,
  };
}

/** 时间与关键帧（只读）：起源事件 → 演化节点 → 当前状态；planned/candidate 诚实空态由调用方以空数据表达。 */
export function attachTimeFrames(card: CausalEvolutionCard, relatedClues: ReadonlyArray<{ id: string; title: string; status: string; tags: string[]; summary?: string | null }>): CausalEvolutionCard {
  const timeTagOf = (tags: readonly string[]) => tags.find((tag) => tag.startsWith("时间："))?.slice(3).trim() ?? null;
  const frames: CausalTimeFrame[] = [];
  for (const clue of relatedClues) {
    if (clue.status !== "active") continue;
    const label: CausalTimeFrame["label"] = /起源|确立|建立|成立/u.test(clue.title) ? "起源" : "演化节点";
    frames.push({ label, title: clue.title, detail: clue.summary ?? timeTagOf(clue.tags), eventId: clue.id, frameAuthority: "confirmed-event" });
  }
  if (card.dimensions.authority === "author") frames.push({ label: "当前状态", title: `${card.title}（现行）`, detail: card.dimensions.worldTime, eventId: null, frameAuthority: "confirmed-event" });
  return { ...card, timeFrames: frames };
}

// ── WorldContextPack（确定性只读投影，可与世界资料过滤组合） ──

export const WORLD_CONTEXT_PACK_VERSION = "tianyan-world-context-pack/r0" as const;

export interface WorldContextPackInput {
  sceneTitle: string | null;
  characterTitle: string | null;
  taskKeyword: string | null;
  scopeLevel?: CausalScopeLevel | "all";
  /** 已投影的世界参考条目（来自既有 world-library） */
  entries: WorldReferenceEntry[];
}

export interface WorldContextPack {
  version: typeof WORLD_CONTEXT_PACK_VERSION;
  scopeLevel: CausalScopeLevel | "all";
  publicFacts: WorldReferenceEntry[];
  roleAllowedFacts: WorldReferenceEntry[];
  hardRules: WorldReferenceEntry[];
  currentPressures: WorldReferenceEntry[];
  relatedLocations: WorldReferenceEntry[];
  relatedFactions: WorldReferenceEntry[];
  relevantEvents: WorldReferenceEntry[];
  excludedSecrets: Array<{ title: string; reason: WorldReferenceNature | "character-unknown" }>;
  sourceRefs: string[];
}

function entryMentions(entry: WorldReferenceEntry, needles: readonly string[]): boolean {
  return needles.some((needle) => needle && (entry.title.includes(needle) || entry.relatedKeys.some((key) => key.includes(needle))));
}

/** 世界上下文包：按当前角色/场景/任务过滤，不向角色泄漏作者秘密与未知信息；
 * 不全量塞世界资料——只输出与其相关的切片，来源 ref 可回溯到 world-library 条目。 */
export function buildWorldContextPack(input: WorldContextPackInput): WorldContextPack {
  const needles = [input.sceneTitle, input.characterTitle, input.taskKeyword].map((value) => value?.trim() ?? "").filter(Boolean);
  const publicFacts = input.entries.filter((entry) => entry.nature !== "author-note" && entry.nature !== "rumor");
  const roleAllowed = input.characterTitle
    ? publicFacts.filter((entry) => {
      const knowledge = entry.knowledge.find((item) => item.character === input.characterTitle);
      if (!knowledge) return entry.category !== "clue";
      return knowledge.state === "known";
    })
    : publicFacts;
  const excludedSecrets: WorldContextPack["excludedSecrets"] = input.entries
    .filter((entry) => !roleAllowed.includes(entry))
    .map((entry) => ({
      title: entry.title,
      reason: entry.nature === "author-note" ? "author-note" : entry.nature === "rumor" ? "rumor" : "character-unknown",
    }));
  const scopeLevel = input.scopeLevel ?? "all";
  const scopeFiltered = scopeLevel === "all"
    ? roleAllowed
    : roleAllowed.filter((entry) => {
      // macro=规则；meso=地点/组织/线索；micro=物件（与因果卡的维度推导一致）
      const level = entry.category === "rule" ? "macro" : entry.category === "item" ? "micro" : "meso";
      return level === scopeLevel;
    });
  const related = scopeFiltered.filter((entry) => entryMentions(entry, needles));
  const pack: Omit<WorldContextPack, "sourceRefs"> = {
    version: WORLD_CONTEXT_PACK_VERSION,
    scopeLevel,
    publicFacts: publicFacts.filter((entry) => scopeLevel === "all" || (entry.category === "rule" ? "macro" : entry.category === "item" ? "micro" : "meso") === scopeLevel),
    roleAllowedFacts: scopeFiltered,
    hardRules: scopeFiltered.filter((entry) => entry.category === "rule"),
    currentPressures: scopeFiltered.filter((entry) => entry.tags.some((tag) => tag.startsWith("压力") || tag.startsWith("冲突") || tag.includes("未解决"))),
    relatedLocations: related.filter((entry) => entry.category === "location"),
    relatedFactions: related.filter((entry) => entry.category === "faction"),
    relevantEvents: related.filter((entry) => entry.category === "clue"),
    excludedSecrets,
  };
  return { ...pack, sourceRefs: [...pack.roleAllowedFacts.map((entry) => entry.id), ...pack.excludedSecrets.map((item) => item.title)] };
}

export type { WorldReferenceEntry, WorldReferenceNature };
