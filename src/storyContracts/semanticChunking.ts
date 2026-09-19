/**
 * 语义分块（R3）：把既有 WorldObject / Event / CharacterMemory 的只读投影
 * 切成带 objectId + sectionId + sourceRefs 的结构化语义块。禁止按固定字符数
 * 粗暴切分；每块保留信息性质与权威（author/candidate），供权限过滤先于向量召回。
 * 分块是派生缓存输入，不是事实 Owner；不进入事实快照 digest。
 */

import type { WorldReferenceNature } from "./worldReferenceProjection.ts";

export type SemanticChunkSection =
  | "summary" | "definition" | "scope" | "origin" | "mechanism" | "benefit-cost"
  | "evolution" | "variants" | "pressure" | "story-entry" | "source"
  | "fact" | "participants" | "location" | "world-time" | "result" | "knowledge-boundary"
  | "experienced" | "witnessed" | "heard" | "belief" | "suspicion" | "misinformation";

export interface SemanticChunk {
  objectId: string;
  sectionId: string;
  title: string;
  objectType: string;
  authority: "author" | "candidate";
  informationNature: WorldReferenceNature;
  /** 权限过滤元数据：知情该事实的角色（世界条目） */
  knownTo: string[];
  /** 该角色明确未知（世界条目） */
  unknownTo: string[];
  lexicalText: string;
  sourceRefs: string[];
}

type WorldObjectInput = {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  aliases?: string[];
  body?: string | null;
  relativeId?: string | null;
  informationNature: WorldReferenceNature;
  knownTo: string[];
  unknownTo: string[];
};

type EventInput = WorldObjectInput;

type MemoryInput = {
  id: string;
  characterTitle: string;
  label: string;
  title: string;
  summary: string;
  validity: string;
  occurredAt: string | null;
  informationNature: WorldReferenceNature;
};

const SOURCE_SECTION_BY_HEADING: ReadonlyArray<{ match: readonly string[]; section: SemanticChunkSection }> = [
  { match: ["定义"], section: "definition" },
  { match: ["范围", "适用"], section: "scope" },
  { match: ["起源", "原因", "由来"], section: "origin" },
  { match: ["机制", "运作", "维持"], section: "mechanism" },
  { match: ["利益", "代价", "受益"], section: "benefit-cost" },
  { match: ["演化", "历史"], section: "evolution" },
  { match: ["变体", "例外", "禁忌"], section: "variants" },
];

function parseSections(body: string | null | undefined): Array<{ heading: string | null; text: string }> {
  if (!body) return [];
  const out: Array<{ heading: string | null; text: string }> = [];
  let heading: string | null = null;
  let buffer: string[] = [];
  const flush = () => { if (heading && buffer.join("\n").trim()) out.push({ heading, text: buffer.join("\n").trim() }); };
  for (const line of body.split(/\r?\n/u)) {
    const match = line.match(/^#{1,3}\s*(.+?)\s*$/u);
    if (match) { flush(); heading = match[1]; buffer = []; } else if (heading) buffer.push(line);
    else if (line.trim()) out.push({ heading: null, text: line.trim() });
  }
  flush();
  return out;
}

function makeChunk(base: Omit<SemanticChunk, "sectionId">, section: SemanticChunkSection): SemanticChunk {
  return { ...base, sectionId: `${base.objectId}#${section}` };
}

export function chunkWorldObject(object: WorldObjectInput): SemanticChunk[] {
  const authority = object.status === "active" ? "author" as const : "candidate" as const;
  const base = { objectId: object.id, title: object.title, objectType: object.type, authority, informationNature: object.informationNature, knownTo: object.knownTo, unknownTo: object.unknownTo, sourceRefs: [object.relativeId ?? object.id] };
  const chunks: SemanticChunk[] = [];
  const sections = parseSections(object.body);
  const summaryLine = sections.find((section) => section.heading === null)?.text ?? sections[0]?.text ?? null;
  if (summaryLine) chunks.push(makeChunk({ ...base, lexicalText: `${object.title} ${(object.aliases ?? []).join(" ")} ${summaryLine}` }, "summary"));
  for (const section of sections) {
    const mapped = SOURCE_SECTION_BY_HEADING.find((entry) => entry.match.some((needle) => section.heading?.includes(needle)));
    if (!mapped) continue;
    chunks.push(makeChunk({ ...base, lexicalText: `${object.title} ${section.text}` }, mapped.section));
  }
  for (const tag of object.tags) {
    if (tag.startsWith("压力") || tag.startsWith("冲突")) chunks.push(makeChunk({ ...base, lexicalText: `${object.title} ${tag}` }, "pressure"));
    if (tag.startsWith("单元") || tag.startsWith("故事线")) chunks.push(makeChunk({ ...base, lexicalText: `${object.title} ${tag}` }, "story-entry"));
  }
  chunks.push(makeChunk({ ...base, lexicalText: `${object.title} 来源 本机工程 markdown` }, "source"));
  return chunks;
}

export function chunkEvent(event: EventInput): SemanticChunk[] {
  const authority = event.status === "active" ? "author" as const : "candidate" as const;
  const base = { objectId: event.id, title: event.title, objectType: event.type, authority, informationNature: event.informationNature, knownTo: event.knownTo, unknownTo: event.unknownTo, sourceRefs: [event.relativeId ?? event.id] };
  const tagValue = (prefix: string) => event.tags.find((tag) => tag.startsWith(prefix))?.slice(prefix.length).trim() ?? null;
  const bodyFirst = parseSections(event.body).find((section) => section.heading === null)?.text ?? null;
  const chunks: SemanticChunk[] = [];
  const fact = bodyFirst ?? event.title;
  chunks.push(makeChunk({ ...base, lexicalText: `${event.title} ${fact}` }, "fact"));
  const participants = tagValue("人物：") ?? tagValue("目击：");
  if (participants) chunks.push(makeChunk({ ...base, lexicalText: `${event.title} 参与者 ${participants}` }, "participants"));
  const location = tagValue("地点：");
  if (location) chunks.push(makeChunk({ ...base, lexicalText: `${event.title} 地点 ${location}` }, "location"));
  const worldTime = tagValue("时间：");
  if (worldTime) chunks.push(makeChunk({ ...base, lexicalText: `${event.title} 时间 ${worldTime}` }, "world-time"));
  chunks.push(makeChunk({ ...base, lexicalText: `${event.title} 状态 ${event.status === "active" ? "已确认" : "草稿候选"}` }, "result"));
  const knownTag = event.tags.find((tag) => tag.startsWith("知情："));
  if (knownTag) chunks.push(makeChunk({ ...base, lexicalText: `${event.title} ${knownTag}` }, "knowledge-boundary"));
  return chunks;
}

const MEMORY_SECTION_BY_KIND: Record<string, SemanticChunkSection> = { experienced: "experienced", witnessed: "witnessed", heard: "heard", belief: "belief" };

export function chunkMemory(memory: MemoryInput): SemanticChunk {
  const invalidated = memory.validity === "invalidated";
  const suspicion = /怀疑|存疑/u.test(memory.summary);
  const misinformation = /误导/u.test(memory.summary) || memory.label.includes("误导");
  const section: SemanticChunkSection = invalidated ? "misinformation" : suspicion ? "suspicion" : misinformation ? "misinformation" : MEMORY_SECTION_BY_KIND[memory.label] ?? "heard";
  return {
    objectId: memory.id,
    sectionId: `${memory.id}#${section}`,
    title: memory.title,
    objectType: "character-memory",
    authority: "candidate",
    informationNature: memory.informationNature,
    knownTo: [memory.characterTitle],
    unknownTo: [],
    lexicalText: `${memory.title} ${memory.summary}`,
    sourceRefs: [memory.id],
  };
}
