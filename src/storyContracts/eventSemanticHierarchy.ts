/**
 * Read-only semantic projections for the Event owner.
 *
 * This module deliberately contains no persistence or mutation. It gives the
 * spine, canvas, timeline and Data surfaces one vocabulary while preserving
 * the existing Event id and owner as the source of truth.
 */

export type EventSemanticStatus = "confirmed" | "candidate" | "prediction" | "unknown";
export type EventNarrativeTimeKind = "exact" | "relative" | "range" | "unknown";
export type EventStoryLineKind = "main" | "side" | "hidden" | "character" | "location" | "item" | "foreshadow" | "custom";
export type EventSemanticEdgeKind = "causal" | "impact" | "info-flow" | "item-transfer" | "relation-change" | "adjacent";
export type EventIndicatorScope = "event-node" | "continuous-segment" | "set-point" | "story-unit";

export type EventSemanticSource = {
  ref: string;
  hash: string | null;
  version: string | null;
  excerpt: string | null;
};

export type EventNarrativeTime = {
  kind: EventNarrativeTimeKind;
  label: string;
  start: string | null;
  end: string | null;
  source: string | null;
};

export type EventSemanticNode = {
  id: string;
  title: string;
  storyUnit: { id: string; label: string };
  setPoint: { id: string; label: string };
  storyLine: { id: string; label: string; kind: EventStoryLineKind };
  status: EventSemanticStatus;
  participants: string[];
  locations: string[];
  time: EventNarrativeTime;
  source: EventSemanticSource;
  revision: string;
  openQuestions: string[];
  foreshadow: { planted: boolean; recovered: boolean };
};

export type EventSemanticEdge = {
  id: string;
  source: string;
  target: string;
  kind: EventSemanticEdgeKind;
  label: string;
  status: "confirmed" | "candidate" | "unknown";
  sourceRef: string | null;
};

export type EventSemanticHierarchy = {
  storyUnits: Array<{ id: string; label: string; eventIds: string[] }>;
  setPoints: Array<{ id: string; label: string; storyUnitId: string; eventIds: string[] }>;
  nodes: EventSemanticNode[];
  edges: EventSemanticEdge[];
};

export type EventSemanticInput = {
  id: string;
  title: string;
  tags?: readonly string[];
  properties?: Readonly<Record<string, string | string[] | number | boolean | null | undefined>>;
  body?: string;
  revision?: string | null;
  status?: string | null;
  source?: Partial<EventSemanticSource> | null;
};

export type EventLocalIndicator = {
  id: string;
  label: string;
  value: number | null;
  valueLabel: string;
  scope: EventIndicatorScope;
  sourceRefs: string[];
  version: string;
  calculationOrJudgment: string;
  ruleModelAuthor: "rule" | "model" | "author" | "unknown";
  confidence: "high" | "medium" | "low" | "unknown";
  unknownReason: string | null;
  explanation: string;
};

const DEFAULT_SOURCE_VERSION = "event-semantic-projection-r0";

export function buildEventSemanticNode(input: EventSemanticInput): EventSemanticNode {
  const tags = input.tags ?? [];
  const properties = input.properties ?? {};
  const storyUnitLabel = readValue(properties, ["storyUnit", "storyUnitLabel", "unit", "unitLabel"]) ?? taggedValue(tags, ["Story Unit", "Unit", "单元"]) ?? "未归入故事单元";
  const setPointLabel = readValue(properties, ["setPoint", "setPointLabel", "集点"]) ?? taggedValue(tags, ["Set Point", "集点", "Scene", "场景"]) ?? "未指定集点";
  const storyLineLabel = readValue(properties, ["storyLine", "storyLineLabel", "line", "lineLabel"]) ?? taggedValue(tags, ["Story Line", "Line", "故事线"]) ?? "主线";
  const storyLineKind = parseStoryLineKind(readValue(properties, ["storyLineKind", "lineKind"]) ?? taggedValue(tags, ["Story Line Kind", "Line Kind", "线类型"]) ?? storyLineLabel);
  const sourceRef = input.source?.ref ?? readValue(properties, ["sourceRef", "source", "sourceKey"]) ?? taggedValue(tags, ["Source", "来源"]) ?? input.id;
  const sourceHash = input.source?.hash ?? readValue(properties, ["sourceHash", "contentHash", "hash"]);
  const sourceVersion = input.source?.version ?? readValue(properties, ["sourceVersion", "version"]) ?? input.revision ?? null;
  const excerpt = input.source?.excerpt ?? readValue(properties, ["sourceExcerpt", "excerpt"]) ?? firstBodyLine(input.body);
  const timeValue = readValue(properties, ["narrativeTime", "worldTime", "time", "timeLabel"]) ?? taggedValue(tags, ["Time", "时间", "World Time", "世界时间"]);
  const time = parseNarrativeTime(timeValue, readValue(properties, ["timeStart", "startTime"]), readValue(properties, ["timeEnd", "endTime"]), sourceRef);
  const participants = readValues(properties, ["participants", "characters", "characterLabels"]).concat(taggedValues(tags, ["Character", "Actor", "角色", "人物"]));
  const locations = readValues(properties, ["locations", "locationLabels"]).concat(taggedValues(tags, ["Location", "地点", "场所"]));
  const openQuestions = readValues(properties, ["openQuestions", "unresolvedQuestions", "questions"]).concat(taggedValues(tags, ["Open Question", "开放问题", "Question"]));
  const foreshadowPlanted = readBoolean(properties, ["foreshadowPlanted", "plantedForeshadow"]) || tags.some((tag) => /(?:伏笔|foreshadow)[：:]?\s*(?:埋下|planted)/iu.test(tag));
  const foreshadowRecovered = readBoolean(properties, ["foreshadowRecovered", "recoveredForeshadow"]) || tags.some((tag) => /(?:伏笔|foreshadow)[：:]?\s*(?:回收|recovered)/iu.test(tag));
  const status = parseStatus(input.status, tags);
  return {
    id: input.id,
    title: input.title,
    storyUnit: { id: stableRef("story-unit", storyUnitLabel), label: storyUnitLabel },
    setPoint: { id: stableRef("set-point", `${storyUnitLabel}:${setPointLabel}`), label: setPointLabel },
    storyLine: { id: stableRef("story-line", storyLineLabel), label: storyLineLabel, kind: storyLineKind },
    status,
    participants: unique(participants),
    locations: unique(locations),
    time,
    source: { ref: sourceRef, hash: sourceHash, version: sourceVersion, excerpt },
    revision: input.revision ?? "unknown",
    openQuestions: unique(openQuestions),
    foreshadow: { planted: foreshadowPlanted, recovered: foreshadowRecovered }
  };
}

export function buildEventSemanticHierarchy(inputs: readonly EventSemanticInput[]): EventSemanticHierarchy {
  const nodes = inputs.map(buildEventSemanticNode);
  const storyUnitMap = new Map<string, { id: string; label: string; eventIds: string[] }>();
  const setPointMap = new Map<string, { id: string; label: string; storyUnitId: string; eventIds: string[] }>();
  for (const node of nodes) {
    const unit = storyUnitMap.get(node.storyUnit.id) ?? { id: node.storyUnit.id, label: node.storyUnit.label, eventIds: [] };
    unit.eventIds.push(node.id);
    storyUnitMap.set(unit.id, unit);
    const setPoint = setPointMap.get(node.setPoint.id) ?? { id: node.setPoint.id, label: node.setPoint.label, storyUnitId: node.storyUnit.id, eventIds: [] };
    setPoint.eventIds.push(node.id);
    setPointMap.set(setPoint.id, setPoint);
  }
  const edges: EventSemanticEdge[] = [];
  for (const input of inputs) {
    const node = nodes.find((candidate) => candidate.id === input.id);
    if (!node) continue;
    const properties = input.properties ?? {};
    for (const [key, kind] of [["causes", "causal"], ["causedBy", "causal"], ["impacts", "impact"], ["infoFlowTo", "info-flow"], ["itemTransferTo", "item-transfer"], ["relationChangeTo", "relation-change"]] as const) {
      for (const target of readValues(properties, [key])) {
        const targetNode = nodes.find((candidate) => candidate.id === target || candidate.title === target);
        const targetId = targetNode?.id ?? target;
        const source = key === "causedBy" ? targetId : node.id;
        const destination = key === "causedBy" ? node.id : targetId;
        if (!targetId || source === destination) continue;
        edges.push({ id: stableRef("event-edge", `${source}:${destination}:${kind}`), source, target: destination, kind, label: edgeLabel(kind), status: targetNode ? (node.status === "confirmed" && targetNode.status === "confirmed" ? "confirmed" : "candidate") : "unknown", sourceRef: node.source.ref });
      }
    }
  }
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1]!;
    const current = nodes[index]!;
    edges.push({ id: stableRef("event-adjacency", `${previous.id}:${current.id}`), source: previous.id, target: current.id, kind: "adjacent", label: "叙事相邻（非因果）", status: "unknown", sourceRef: null });
  }
  return { storyUnits: [...storyUnitMap.values()], setPoints: [...setPointMap.values()], nodes, edges };
}

export function buildEventLocalIndicators(input: EventSemanticInput, scope: EventIndicatorScope = "event-node"): EventLocalIndicator[] {
  const node = buildEventSemanticNode(input);
  const properties = input.properties ?? {};
  const sourceRefs = [node.source.ref];
  const indicator = (id: string, label: string, value: number | null, valueLabel: string, explanation: string, calculationOrJudgment: string, ruleModelAuthor: EventLocalIndicator["ruleModelAuthor"] = "rule", confidence: EventLocalIndicator["confidence"] = value === null ? "unknown" : "medium", unknownReason: string | null = value === null ? "当前 Event 没有足够来源证据。" : null): EventLocalIndicator => ({ id: `${node.id}:${id}`, label, value, valueLabel, scope, sourceRefs, version: DEFAULT_SOURCE_VERSION, calculationOrJudgment, ruleModelAuthor, confidence, unknownReason, explanation });
  const explicit = (keys: string[]): string | null => readValue(properties, keys);
  const fromEvidence = (keys: string[], id: string, label: string, explanation: string): EventLocalIndicator => {
    const value = explicit(keys);
    return value !== null ? indicator(id, label, Number.isFinite(Number(value)) ? Number(value) : null, value, explanation, "读取 Event 已保存字段", "author", "high", Number.isFinite(Number(value)) ? null : "作者字段不是可计算数值。") : indicator(id, label, null, "未知", explanation, "没有可用字段", "unknown", "unknown");
  };
  const openQuestionCount = node.openQuestions.length;
  return [
    fromEvidence(["emotion", "emotionLabel", "情绪"], "emotion", "情绪强度", "只显示作者或来源明确标注的情绪，不从事件标题推断。"),
    fromEvidence(["conflict", "conflictLevel", "冲突"], "conflict", "冲突强度", "只显示已保存的冲突描述或作者判断。"),
    fromEvidence(["pacing", "pacingLabel", "节奏"], "pacing", "节奏", "没有节拍或时长证据时保持未知。"),
    fromEvidence(["infoDensity", "informationDensity", "信息密度"], "info-density", "信息密度", "基于来源字段的局部信息密度，不代表全章评分。"),
    fromEvidence(["richness", "richnessLabel", "丰富度"], "richness", "丰富度", "只读取已有来源覆盖度，不生成全局质量分。"),
    indicator("open-questions", "开放问题", openQuestionCount, openQuestionCount ? `${openQuestionCount} 个` : "0 个", openQuestionCount ? "由 Event 的开放问题来源列表计数。" : "当前 Event 没有记录开放问题。", "读取来源锚定问题列表", "author", "high"),
    indicator("foreshadow-planted", "伏笔埋下", node.foreshadow.planted ? 1 : null, node.foreshadow.planted ? "已记录" : "未知", "只有来源明确标记时才显示伏笔状态。", "读取伏笔标签", node.foreshadow.planted ? "author" : "unknown", node.foreshadow.planted ? "high" : "unknown", node.foreshadow.planted ? null : "没有伏笔埋设来源。"),
    indicator("foreshadow-recovered", "伏笔回收", node.foreshadow.recovered ? 1 : null, node.foreshadow.recovered ? "已记录" : "未知", "只有来源明确标记时才显示伏笔状态。", "读取伏笔标签", node.foreshadow.recovered ? "author" : "unknown", node.foreshadow.recovered ? "high" : "unknown", node.foreshadow.recovered ? null : "没有伏笔回收来源。")
  ];
}

function parseNarrativeTime(value: string | null, start: string | null, end: string | null, source: string): EventNarrativeTime {
  if (start || end) return { kind: "range", label: [start, end].filter(Boolean).join(" – ") || "时间范围未知", start, end, source };
  if (!value) return { kind: "unknown", label: "未知时间", start: null, end: null, source: null };
  const trimmed = value.trim();
  if (/^(?:unknown|未知|未定|不明)$/iu.test(trimmed)) return { kind: "unknown", label: "未知时间", start: null, end: null, source: null };
  if (/^\d{4}(?:[-/.年]\d{1,2})(?:[-/.月]\d{1,2}日?)?(?:[ T]\d{1,2}(?::\d{2}){0,2})?$/u.test(trimmed)) {
    return { kind: "exact", label: trimmed, start: trimmed, end: trimmed, source };
  }
  if (/^(?:约|大约|之后|之前|before|after|around|相对)/iu.test(trimmed)) return { kind: "relative", label: trimmed, start: null, end: null, source };
  if (/(?:\s+[\-–—]\s+|[~～]|\s*(?:至|到)\s*)/u.test(trimmed)) {
    const [rangeStart, rangeEnd] = trimmed.split(/(?:\s+[\-–—]\s+|[~～]|\s*(?:至|到)\s*)/u).map((item) => item.trim());
    return { kind: "range", label: trimmed, start: rangeStart || null, end: rangeEnd || null, source };
  }
  return { kind: "exact", label: trimmed, start: trimmed, end: trimmed, source };
}

function parseStatus(status: string | null | undefined, tags: readonly string[]): EventSemanticStatus {
  const explicitStatus = status?.trim() ?? "";
  if (/(?:prediction|预测)/iu.test(explicitStatus)) return "prediction";
  if (/(?:candidate|候选)/iu.test(explicitStatus)) return "candidate";
  if (/(?:unknown|未知|未定|不明)/iu.test(explicitStatus)) return "unknown";
  if (/(?:confirmed|已确认|作者确认)/iu.test(explicitStatus)) return "confirmed";
  if (/committed/iu.test(explicitStatus) && tags.includes("作者确认")) return "confirmed";

  const raw = tags.join(" ");
  if (/(?:prediction|预测)/iu.test(raw)) return "prediction";
  if (/(?:candidate|候选)/iu.test(raw)) return "candidate";
  if (/(?:unknown|未知)/iu.test(raw)) return "unknown";
  return "confirmed";
}

function parseStoryLineKind(value: string | null): EventStoryLineKind {
  if (!value) return "main";
  const lower = value.toLowerCase();
  if (/(?:side|支线)/u.test(value)) return "side";
  if (/(?:hidden|隐线)/u.test(value)) return "hidden";
  if (/(?:character|角色)/u.test(value)) return "character";
  if (/(?:location|地点)/u.test(value)) return "location";
  if (/(?:item|物品)/u.test(value)) return "item";
  if (/(?:foreshadow|伏笔)/u.test(value)) return "foreshadow";
  return lower === "main" || /主线/u.test(value) ? "main" : "custom";
}

function edgeLabel(kind: EventSemanticEdgeKind): string {
  return ({ causal: "因果", impact: "影响", "info-flow": "信息流", "item-transfer": "物品转移", "relation-change": "关系变化", adjacent: "叙事相邻（非因果）" } as Record<EventSemanticEdgeKind, string>)[kind];
}

function stableRef(prefix: string, value: string): string {
  return `${prefix}:${value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/gu, "") || "unknown"}`;
}

function readValue(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

function readValues(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): string[] {
  const values: string[] = [];
  for (const key of keys) {
    const value = properties[key];
    if (Array.isArray(value)) values.push(...value.filter((item): item is string => typeof item === "string").flatMap(splitValues));
    else if (typeof value === "string") values.push(...splitValues(value));
  }
  return unique(values);
}

function readBoolean(properties: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return keys.some((key) => properties[key] === true || properties[key] === "true" || properties[key] === "yes" || properties[key] === "是");
}

function taggedValue(tags: readonly string[], prefixes: readonly string[]): string | null {
  return taggedValues(tags, prefixes)[0] ?? null;
}

function taggedValues(tags: readonly string[], prefixes: readonly string[]): string[] {
  return unique(tags.flatMap((tag) => prefixes.flatMap((prefix) => {
    const match = tag.match(new RegExp(`^${escapeRegExp(prefix)}[：:]\\s*(.+)$`, "iu"));
    return match?.[1] ? splitValues(match[1]) : [];
  })));
}

function splitValues(value: string): string[] { return value.split(/[,，、;；|]/u).map((item) => item.trim()).filter(Boolean); }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function firstBodyLine(body: string | undefined): string | null { return body?.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? null; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
