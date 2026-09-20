/**
 * 派生语义索引缓存（R3）：Embedding 索引是可重建的派生缓存，不是事实 Owner。
 * - contentHash 未变 → 不重复嵌入（原样保留向量）；
 * - sourceRevision 变化 → 仅更新对应区块；
 * - 模型/generation 变化 → 全部向量失效，进入新 generation；
 * - 索引不进入事实快照 digest、不导出为作品权威内容；
 * - 序列化为纯函数（原子落盘由调用方以 tmp+rename 完成；本模块不做 IO）。
 * 兼容既有 EmbeddingIndexManifest 的 generation 语义（storyContinuity/embeddingIndexBinding.ts）。
 */

import { stableJson } from "../storyContinuity/continuityValidation.ts";

export const SEMANTIC_INDEX_CACHE_VERSION = "tianyan-semantic-index-cache/v1" as const;

export interface SemanticIndexEntry {
  projectId: string;
  workVersionId: string;
  branchId: string;
  sourceOwner: "world-object" | "event" | "character-memory";
  objectId: string;
  sectionId: string;
  sourceRevision: number;
  contentHash: string;
  objectType: string;
  authority: string;
  informationNature: string;
  worldTime: string | null;
  sceneKeys: string[];
  visibility: { knownTo: string[]; unknownTo: string[] };
  title: string;
  lexicalText: string;
  embeddingProfileId: string;
  dimensions: number;
  vector: number[] | null;
}

export interface SemanticIndexCache {
  version: typeof SEMANTIC_INDEX_CACHE_VERSION;
  projectId: string;
  workVersionId: string;
  branchId: string;
  generationId: string;
  embeddingProfileId: string;
  dimensions: number;
  entries: Record<string, SemanticIndexEntry>;
}

export function contentHashOf(text: string): string {
  // 与仓库一致的确定性内容指纹：先做 UTF-8 稳定序列化再取 FNV-1a 64bit 十六进制。
  const bytes = new TextEncoder().encode(stableJson(text));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function generationIdOf(profileId: string, dimensions: number, chunkingVersion: string): string {
  return contentHashOf(`${profileId}:${dimensions}:${chunkingVersion}`).slice(0, 12);
}

export function createSemanticIndexCache(input: { projectId: string; workVersionId: string; branchId: string; embeddingProfileId: string; dimensions: number; chunkingVersion?: string }): SemanticIndexCache {
  return {
    version: SEMANTIC_INDEX_CACHE_VERSION,
    projectId: input.projectId,
    workVersionId: input.workVersionId,
    branchId: input.branchId,
    generationId: generationIdOf(input.embeddingProfileId, input.dimensions, input.chunkingVersion ?? "semantic-chunking/v1"),
    embeddingProfileId: input.embeddingProfileId,
    dimensions: input.dimensions,
    entries: {},
  };
}

export type IndexUpdateAction = "kept" | "updated" | "embedded" | "invalidated-generation";

/** 增量更新：contentHash 未变 → kept（保留向量）；hash 或 revision 变化 → 需要重嵌入
 *（向量由调用方写入；本函数只标记 pendingEmbedding=true 的占位条目）。 */
export function upsertSemanticEntry(cache: SemanticIndexCache, entry: SemanticIndexEntry): { cache: SemanticIndexCache; action: IndexUpdateAction } {
  if (cache.generationId !== generationIdOf(cache.embeddingProfileId, cache.dimensions, "semantic-chunking/v1")) {
    throw new Error("generation 不匹配；请先 switchGeneration 建立新缓存。");
  }
  const key = entry.sectionId;
  const existing = cache.entries[key];
  if (existing && existing.contentHash === entry.contentHash && existing.sourceRevision === entry.sourceRevision) {
    return { cache, action: "kept" };
  }
  const action: IndexUpdateAction = existing ? "updated" : "embedded";
  return {
    cache: { ...cache, entries: { ...cache.entries, [key]: { ...entry } } },
    action,
  };
}

/** 模型/generation 切换：向量全部失效（dimensions/profile 更新，vector 清空），条目与 hash 保留以便重嵌。 */
export function switchGeneration(cache: SemanticIndexCache, embeddingProfileId: string, dimensions: number): SemanticIndexCache {
  const next = createSemanticIndexCache({ projectId: cache.projectId, workVersionId: cache.workVersionId, branchId: cache.branchId, embeddingProfileId, dimensions });
  const entries: Record<string, SemanticIndexEntry> = {};
  for (const [key, entry] of Object.entries(cache.entries)) {
    entries[key] = { ...entry, embeddingProfileId, dimensions, vector: null };
  }
  return { ...next, entries };
}

/** 派生缓存的可逆序列化（原子落盘由调用方 tmp+rename 完成；损坏输入返回 null 而非抛错）。 */
export function serializeSemanticIndexCache(cache: SemanticIndexCache): string {
  return JSON.stringify(cache);
}

export function parseSemanticIndexCache(raw: string | null): SemanticIndexCache | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SemanticIndexCache;
    if (parsed.version !== SEMANTIC_INDEX_CACHE_VERSION || typeof parsed.entries !== "object" || parsed.entries === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 路径安全：缓存文件名折叠连续点并替换受控字符外内容（防 symlink/path traversal）。 */
export function semanticIndexCacheFileName(projectId: string, generationId: string): string {
  const sanitize = (value: string) => value.replace(/\.{2,}/gu, ".").replace(/[^a-zA-Z0-9._-]/gu, "_");
  return `semantic-index-${sanitize(projectId)}-${sanitize(generationId)}.json`;
}
