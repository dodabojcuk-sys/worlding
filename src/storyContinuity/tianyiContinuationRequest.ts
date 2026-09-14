import { recognizeTianyiCreationIdeas } from "./tianyiCreationResultEvidence.ts";

const continuationMarker = /^继续修改这条回复（([^）]+)）：\n\n([\s\S]*?)\n\n我的修改要求：([\s\S]*)$/u;

export interface TianyiContinuationTarget {
  responseMessageId: string;
  ideaIndex: number;
  title: string;
  body: string;
}

export type PreparedTianyiContinuation =
  | { kind: "ordinary"; requestText: string; target: null }
  | { kind: "continuation"; requestText: string; target: TianyiContinuationTarget | null };

export function createTianyiContinuationDraft(responseMessageId: string, responseText: string): string {
  return `继续修改这条回复（${responseMessageId}）：\n\n${responseText.trim()}\n\n我的修改要求：`;
}

export function prepareTianyiContinuationRequest(input: {
  draft: string;
  currentResponseMessageId?: string | null;
  currentResponseText?: string | null;
}): PreparedTianyiContinuation {
  const draft = input.draft.trim();
  const match = draft.match(continuationMarker);
  if (!match) return { kind: "ordinary", requestText: draft, target: null };

  const responseMessageId = match[1]?.trim() ?? "";
  const sourceText = match[2]?.trim() ?? "";
  const instruction = match[3]?.trim() ?? "";
  if (!instruction) throw new Error("请先写下要怎样修改这条回复；原回复和草稿都已保留。");
  if (!responseMessageId || !sourceText) throw new Error("续改来源不完整；没有发送请求，原回复和草稿都已保留。");
  if (input.currentResponseMessageId && responseMessageId !== input.currentResponseMessageId) {
    throw new Error("续改目标已变化；没有把旧回复的要求发送到新回复。请重新选择“继续修改这条回复”。");
  }
  if (input.currentResponseText && sourceText !== input.currentResponseText.trim()) {
    throw new Error("续改来源正文已变化；没有发送请求。请从当前回复重新开始续改。");
  }

  const evidence = recognizeTianyiCreationIdeas({ markdown: sourceText });
  const targetIndex = resolveTargetIndex(instruction, evidence?.ideas.map((idea) => idea.title) ?? []);
  if (targetIndex === "invalid") throw new Error("没有在来源回复中找到指定构想；未发送请求。请写明现有标题或正确序号。");
  if (targetIndex === null || !evidence) {
    return {
      kind: "continuation",
      target: null,
      requestText: buildRequest({ responseMessageId, sourceText, instruction })
    };
  }

  const idea = evidence.ideas[targetIndex];
  if (!idea) throw new Error("没有在来源回复中找到指定构想；未发送请求。请写明现有标题或正确序号。");
  const target: TianyiContinuationTarget = {
    responseMessageId,
    ideaIndex: targetIndex,
    title: idea.title,
    body: idea.body
  };
  return {
    kind: "continuation",
    target,
    requestText: buildRequest({ responseMessageId, sourceText, instruction, target })
  };
}

function buildRequest(input: {
  responseMessageId: string;
  sourceText: string;
  instruction: string;
  target?: TianyiContinuationTarget;
}): string {
  const target = input.target
    ? `\n指定构想：第${input.target.ideaIndex + 1}项《${input.target.title}》\n指定构想原文：\n${input.target.body}\n要求：只修改这项；不要改写来源回复中的其他构想。`
    : "";
  return `继续加工已保存的天意回复。\n来源回复 ID：${input.responseMessageId}${target}\n\n作者的修改要求：\n${input.instruction}\n\n来源回复全文（保持可追溯，不覆盖原回复）：\n${input.sourceText}`;
}

function resolveTargetIndex(instruction: string, titles: readonly string[]): number | null | "invalid" {
  const titled = [...instruction.matchAll(/《([^》]+)》/gu)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value));
  if (titled.length) {
    const index = titles.findIndex((title) => titled.some((candidate) => candidate === title));
    return index >= 0 ? index : "invalid";
  }
  const ordinal = instruction.match(/第\s*([一二三四五六七八九十\d]+)\s*(?:个|项|段|条)?\s*(?:构想|方案|场景)/u)?.[1];
  if (!ordinal) return null;
  const number = parseOrdinal(ordinal);
  return number && number <= titles.length ? number - 1 : "invalid";
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
