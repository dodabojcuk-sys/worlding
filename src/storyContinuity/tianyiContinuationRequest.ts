import { recognizeTianyiCreationIdeas } from "./tianyiCreationResultEvidence.ts";

const continuationMarker = /^继续修改这条回复（([^）]+)）：\n\n([\s\S]*?)\n\n我的修改要求：([\s\S]*)$/u;

export interface TianyiContinuationTarget {
  responseMessageId: string;
  ideaIndex: number;
  title: string;
  body: string;
}

export interface TianyiContinuationSource {
  responseMessageId: string;
  responseText: string;
  selectedTargetIndex?: number | null;
}

export type PreparedTianyiContinuation =
  | { kind: "ordinary"; requestText: string; target: null }
  | { kind: "continuation"; requestText: string; target: TianyiContinuationTarget | null }
  | { kind: "needs-selection"; requestText: string; target: null; source: TianyiContinuationSource; candidates: TianyiContinuationTarget[]; reason: string };

/** Legacy draft envelope. New UI stores source identity separately from editable author text. */
export function createTianyiContinuationDraft(responseMessageId: string, responseText: string): string {
  return `继续修改这条回复（${responseMessageId}）：\n\n${responseText.trim()}\n\n我的修改要求：`;
}

export function prepareTianyiContinuationRequest(input: {
  draft: string;
  continuationSource?: TianyiContinuationSource | null;
  currentResponseMessageId?: string | null;
  currentResponseText?: string | null;
}): PreparedTianyiContinuation {
  const draft = input.draft.trim();
  const legacy = draft.match(continuationMarker);
  const source = input.continuationSource ?? (legacy ? {
    responseMessageId: legacy[1]?.trim() ?? "",
    responseText: legacy[2]?.trim() ?? ""
  } : null);
  const instruction = legacy ? legacy[3]?.trim() ?? "" : draft;
  if (!source) return { kind: "ordinary", requestText: draft, target: null };
  if (!instruction) throw new Error("请先写下要怎样修改这条回复；原回复和草稿都已保留。");

  const responseMessageId = source.responseMessageId.trim();
  const sourceText = source.responseText.trim();
  if (!responseMessageId || !sourceText) throw new Error("续改来源不完整；没有发送请求，原回复和草稿都已保留。");
  if (input.currentResponseMessageId && responseMessageId !== input.currentResponseMessageId) {
    throw new Error("续改目标已变化；没有把旧回复的要求发送到新回复。请重新选择“继续修改这条回复”。");
  }
  if (input.currentResponseText && sourceText !== input.currentResponseText.trim()) {
    throw new Error("续改来源正文已变化；没有发送请求。请从当前回复重新开始续改。");
  }

  const evidence = recognizeTianyiCreationIdeas({ markdown: sourceText });
  if (!evidence) return { kind: "continuation", target: null, requestText: buildRequest({ responseMessageId, sourceText, instruction }) };
  const candidates = evidence.ideas.map((idea, ideaIndex): TianyiContinuationTarget => ({ responseMessageId, ideaIndex, title: idea.title, body: idea.body }));
  const resolved = source.selectedTargetIndex === undefined
    ? resolveTargetIndex(instruction, candidates.map((candidate) => candidate.title))
    : source.selectedTargetIndex;
  if (resolved === "invalid") throw new Error("没有在来源回复中找到指定构想；未发送请求。请写明现有标题或正确序号。");
  if (resolved !== null && typeof resolved === "object") {
    return { kind: "needs-selection", requestText: instruction, target: null, source, candidates, reason: resolved.reason };
  }
  if (resolved === null) return { kind: "continuation", target: null, requestText: buildRequest({ responseMessageId, sourceText, instruction }) };
  const target = candidates[resolved];
  if (!target) throw new Error("没有在来源回复中找到指定构想；未发送请求。请写明现有标题或正确序号。");
  return { kind: "continuation", target, requestText: buildRequest({ responseMessageId, sourceText, instruction, target }) };
}

function buildRequest(input: { responseMessageId: string; sourceText: string; instruction: string; target?: TianyiContinuationTarget }): string {
  const target = input.target
    ? `\n指定构想：第${input.target.ideaIndex + 1}项《${input.target.title}》\n指定构想原文：\n${input.target.body}\n要求：只修改这项；不要改写来源回复中的其他构想。`
    : "";
  return `继续加工已保存的天意回复。\n来源回复 ID：${input.responseMessageId}${target}\n\n作者的修改要求：\n${input.instruction}\n\n来源回复全文（保持可追溯，不覆盖原回复）：\n${input.sourceText}`;
}

type TargetResolution = number | null | "invalid" | { reason: string };

function resolveTargetIndex(instruction: string, titles: readonly string[]): TargetResolution {
  if (/整条回复|全文|全部(?:构想|方案|场景)|所有(?:构想|方案|场景)/u.test(instruction)) return null;
  const mentionedTitleIndexes: number[] = [];
  let unknownPositiveTitle = false;
  for (const match of instruction.matchAll(/《([^》]+)》/gu)) {
    const title = match[1]?.trim();
    if (!title || isExcludedMention(instruction, match.index ?? 0)) continue;
    const matches = titles.flatMap((candidate, index) => candidate === title ? [index] : []);
    if (matches.length === 1) mentionedTitleIndexes.push(matches[0]!);
    else if (matches.length > 1) return { reason: `来源回复中有多个同名的《${title}》，请选择要修改的具体一项。` };
    else unknownPositiveTitle = true;
  }
  if (unknownPositiveTitle) return "invalid";
  const ordinalIndexes: number[] = [];
  for (const match of instruction.matchAll(/第\s*([一二三四五六七八九十\d]+)\s*(?:个|项|段|条)?\s*(?:构想|方案|场景)?/gu)) {
    if (isExcludedMention(instruction, match.index ?? 0)) continue;
    const ordinal = parseOrdinal(match[1] ?? "");
    if (!ordinal || ordinal > titles.length) return "invalid";
    ordinalIndexes.push(ordinal - 1);
  }
  const indexes = [...new Set([...mentionedTitleIndexes, ...ordinalIndexes])];
  if (indexes.length === 1) return indexes[0]!;
  if (indexes.length > 1) return { reason: "标题与序号指向了不同构想，发送前请选择这次真正要修改的一项。" };
  if (/修改|改写|调整|续写|润色|重写/u.test(instruction) && titles.length > 1) {
    return { reason: "这条回复包含多个构想，请选择这次要修改的一项；若要改整条，请在要求中明确写“整条回复”。" };
  }
  return null;
}

function isExcludedMention(instruction: string, index: number): boolean {
  const prefix = instruction.slice(Math.max(0, index - 12), index).replace(/\s+/gu, "");
  return /(?:不要|不需|无需|别|排除)(?:再)?(?:修改|改写|调整|续写|润色|重写)?$/u.test(prefix);
}

function parseOrdinal(value: string): number | null {
  if (/^\d+$/u.test(value)) return Number(value);
  const values: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (values[value]) return values[value];
  if (value.startsWith("十")) return 10 + (values[value.slice(1)] ?? 0);
  if (value.endsWith("十")) return (values[value.slice(0, -1)] ?? 0) * 10;
  const [tens, ones] = value.split("十");
  return tens && ones ? (values[tens] ?? 0) * 10 + (values[ones] ?? 0) : null;
}
