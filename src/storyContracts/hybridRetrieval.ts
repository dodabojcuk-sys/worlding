/**
 * 混合语义检索（R3）：精确 → 关键词 → Dense → RRF 融合 → 去重 → Token 预算装配。
 * 知识边界与作者秘密过滤先于任何向量召回（秘密文本不进入 Embedding 输入）。
 * Embedder 可注入：未提供时语义通道诚实不可用，只保留精确/关键词检索。
 * Embedding 只输出 semanticScore；Significance/Retrievability 等记忆评分留待未来接口（不实现衰减写库）。
 */

import type { SemanticChunk } from "./semanticChunking.ts";

export interface HybridRetriever {
  /** 返回每段文本的向量；profile 未配置时不会被调用。 */
  embed(texts: readonly string[]): Promise<number[][]>;
}

export interface HybridRetrievalInput {
  query: string;
  chunks: readonly SemanticChunk[];
  characterTitle?: string | null;
  sceneTitle?: string | null;
  topK?: number;
  tokenBudget?: number;
  embedder?: HybridRetriever;
  semanticEnabled?: boolean;
  /** 评测用通道开关（默认全开）；生产路径不要传。 */
  channels?: { exact?: boolean; keyword?: boolean; dense?: boolean };
}

export type RetrievalReason =
  | "精确标题命中" | "别名命中" | "标识命中" | "关键词命中" | "语义相近"
  | "同一场景" | "角色可知" | "标签命中";

export type ExclusionReason =
  | "作者备注" | "传闻 · 不确定" | "该角色未知" | "预算排除" | "已去重";

export interface RetrievalHit {
  chunk: SemanticChunk;
  score: number;
  reasons: RetrievalReason[];
}

export interface RetrievalExclusion {
  sectionId: string;
  title: string;
  reason: ExclusionReason;
}

export interface HybridRetrievalResult {
  hits: RetrievalHit[];
  excluded: RetrievalExclusion[];
  meta: {
    semanticAvailable: boolean;
    exactCount: number;
    keywordCount: number;
    denseCount: number;
    candidateCount: number;
    totalTokens: number;
  };
}

const RRF_K = 60;
const MMR_LAMBDA = 0.72;

function tokenEstimate(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).length / 3) + 1;
}

function terms(query: string): string[] {
  const raw = query.split(/[\s，。；、？？！!？,.;?!"'：:（）()\[\]【】]+/u).map((term) => term.trim()).filter((term) => term.length >= 2);
  // 中文无词界：为每个连续 CJK 段补充 2-gram，保证关键词通道可命中
  const grams: string[] = [];
  for (const term of raw) {
    grams.push(term);
    if (/^[\u4e00-\u9fff]/u.test(term)) {
      for (let index = 0; index < term.length - 1; index += 1) grams.push(term.slice(index, index + 2));
    }
  }
  return Array.from(new Set(grams));
}

function cosine(left: number[], right: number[]): number {
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

/** 确定性 lexical 邻近度（字符 bigram Jaccard），供 MMR 去重使用，替代任意向量。 */
function lexicalOverlap(left: SemanticChunk, right: SemanticChunk): number {
  const bigrams = (text: string) => {
    const set = new Set<string>();
    for (let index = 0; index < text.length - 1; index += 1) set.add(text.slice(index, index + 2));
    return set;
  };
  const a = bigrams(`${left.title}${left.lexicalText}`);
  const b = bigrams(`${right.title}${right.lexicalText}`);
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

export async function retrieveHybrid(input: HybridRetrievalInput): Promise<HybridRetrievalResult> {
  const query = input.query.trim();
  const topK = input.topK ?? 10;
  const tokenBudget = input.tokenBudget ?? 1200;
  const semanticEnabled = (input.semanticEnabled ?? false) && Boolean(input.embedder);
  const channels = input.channels ?? { exact: true, keyword: true, dense: true };
  const queryTerms = terms(query);

  // 1–2. 硬过滤 + 知识边界（先于任何向量召回）。
  const candidates: SemanticChunk[] = [];
  const excluded: RetrievalExclusion[] = [];
  for (const chunk of input.chunks) {
    if (chunk.informationNature === "author-note") { excluded.push({ sectionId: chunk.sectionId, title: chunk.title, reason: "作者备注" }); continue; }
    if (chunk.informationNature === "rumor") { excluded.push({ sectionId: chunk.sectionId, title: chunk.title, reason: "传闻 · 不确定" }); continue; }
    if (input.characterTitle && chunk.unknownTo.includes(input.characterTitle)) { excluded.push({ sectionId: chunk.sectionId, title: chunk.title, reason: "该角色未知" }); continue; }
    candidates.push(chunk);
  }

  const reasons = new Map<string, RetrievalReason[]>();
  const record = (chunk: SemanticChunk, reason: RetrievalReason) => {
    const list = reasons.get(chunk.sectionId) ?? [];
    list.push(reason);
    reasons.set(chunk.sectionId, list);
  };

  // 3. 精确：标题 / 别名 / 标识 相等（通过 sectionId 前缀即 objectId）。
  const exactHits: SemanticChunk[] = [];
  if (channels.exact !== false) {
    for (const chunk of candidates) {
      if (chunk.title === query) { exactHits.push(chunk); record(chunk, "精确标题命中"); }
      else if (chunk.sectionId.startsWith(query)) record(chunk, "标识命中");
    }
  }

  // 4. 关键词：query 词项在 lexicalText/title 的命中数。
  const keywordScored: Array<{ chunk: SemanticChunk; score: number }> = [];
  if (channels.keyword !== false) {
    for (const chunk of candidates) {
      const haystack = `${chunk.title} ${chunk.lexicalText}`;
      const score = queryTerms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
      if (score > 0) {
        keywordScored.push({ chunk, score });
        record(chunk, queryTerms.some((term) => chunk.title.includes(term)) ? "关键词命中" : "标签命中");
      }
    }
    keywordScored.sort((left, right) => right.score - left.score || left.chunk.sectionId.localeCompare(right.chunk.sectionId));
  }
  if (input.sceneTitle) {
    for (const chunk of candidates) {
      if (`${chunk.title} ${chunk.lexicalText}`.includes(input.sceneTitle)) record(chunk, "同一场景");
    }
  }

  // 5. Dense：embedder 存在且启用时才调用（输入不含被排除的秘密块）。
  let denseHits: Array<{ chunk: SemanticChunk; score: number }> = [];
  if (semanticEnabled && channels.dense !== false && input.embedder && query.length > 0) {
    const vectors = await input.embedder.embed([query, ...candidates.map((chunk) => `${chunk.title} ${chunk.lexicalText}`)]);
    const queryVector = vectors[0];
    denseHits = candidates
      .map((chunk, index) => ({ chunk, score: cosine(queryVector, vectors[index + 1]) }))
      .filter((item) => item.score > 0.05)
      .sort((left, right) => right.score - left.score);
    for (const item of denseHits.slice(0, topK)) record(item.chunk, "语义相近");
  }

  // 6. RRF 融合三条通道。
  const rrf = new Map<string, { chunk: SemanticChunk; score: number }>();
  const addChannel = (ranked: readonly SemanticChunk[]) => {
    ranked.forEach((chunk, index) => {
      const entry = rrf.get(chunk.sectionId) ?? { chunk, score: 0 };
      entry.score += 1 / (RRF_K + index + 1);
      rrf.set(chunk.sectionId, entry);
    });
  };
  addChannel(exactHits);
  addChannel(keywordScored.map((item) => item.chunk));
  addChannel(denseHits.map((item) => item.chunk));
  const fused = Array.from(rrf.values()).sort((left, right) => right.score - left.score || left.chunk.sectionId.localeCompare(right.chunk.sectionId));

  // 7. 可选 Reranker：R3 切片未接真实 Reranker，保持 RRF 序（接口位已留）。
  // 8. MMR 式去重 + 预算装配。
  const hits: RetrievalHit[] = [];
  const picked: SemanticChunk[] = [];
  let totalTokens = 0;
  const budgetExcluded: RetrievalExclusion[] = [];
  const dedupExcluded: RetrievalExclusion[] = [];
  for (const { chunk } of fused) {
    if (hits.length >= topK) { budgetExcluded.push({ sectionId: chunk.sectionId, title: chunk.title, reason: "预算排除" }); continue; }
    const sameObject = picked.some((candidate) => candidate.objectId === chunk.objectId);
    const redundancy = Math.max(
      picked.reduce((max, candidate) => Math.max(max, lexicalOverlap(candidate, chunk)), 0),
      picked.length && sameObject ? 0.9 : 0,
    );
    if (picked.length && redundancy > 0.82) { dedupExcluded.push({ sectionId: chunk.sectionId, title: chunk.title, reason: "已去重" }); continue; }
    const cost = tokenEstimate(`${chunk.title} ${chunk.lexicalText}`);
    if (totalTokens + cost > tokenBudget) { budgetExcluded.push({ sectionId: chunk.sectionId, title: chunk.title, reason: "预算排除" }); continue; }
    totalTokens += cost;
    picked.push(chunk);
    hits.push({ chunk, score: rrf.get(chunk.sectionId)?.score ?? 0, reasons: (reasons.get(chunk.sectionId) ?? []).slice(0, 3) });
    if (input.characterTitle && chunk.knownTo.includes(input.characterTitle)) {
      const hit = hits[hits.length - 1];
      if (!hit.reasons.includes("角色可知")) hit.reasons.push("角色可知");
    }
  }

  return {
    hits,
    excluded: [...excluded, ...dedupExcluded, ...budgetExcluded],
    meta: {
      semanticAvailable: semanticEnabled,
      exactCount: exactHits.length,
      keywordCount: keywordScored.length,
      denseCount: denseHits.length,
      candidateCount: candidates.length,
      totalTokens,
    },
  };
}
