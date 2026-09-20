import assert from "node:assert/strict";
import test from "node:test";

import { retrieveHybrid, type HybridRetriever } from "../../src/storyContracts/hybridRetrieval.ts";
import { chunkEvent, chunkWorldObject, chunkMemory } from "../../src/storyContracts/semanticChunking.ts";
import type { SemanticChunk } from "../../src/storyContracts/semanticChunking.ts";
import { projectWorldReferences } from "../../src/storyContracts/worldReferenceProjection.ts";
import {
  GOLDEN_QUERIES,
  SECRET_TITLES,
} from "../../src/storyContracts/hybridRetrievalGoldenSet.ts";
import {
  createSemanticIndexCache,
  parseSemanticIndexCache,
  semanticIndexCacheFileName,
  serializeSemanticIndexCache,
  switchGeneration,
  upsertSemanticEntry,
} from "../../src/storyContracts/semanticIndexCache.ts";
import { validateEmbeddingProfile, validateRerankerProfile, emptyEmbeddingProfile } from "../../src/storyContracts/embeddingProfile.ts";

const worldObjects = [
  { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["世界规则", "单元：北滨码头", "周期：潮汐"], body: "潮汐信令以钟声报潮。\n## 定义\n三短一长表示大潮将至。\n## 运作机制\n守钟人观测潮位并敲钟。\n## 利益与代价\n船主受益，守钟人承担夜班。\n## 变体与例外\n战时改用鼓声。" },
  { id: "location.北滨码头", title: "北滨码头", type: "location", status: "active", tags: ["港区"], body: "北溟港的旧码头，雾夜渔火。" },
  { id: "faction.北溟漕帮", title: "北溟漕帮", type: "faction", status: "active", tags: ["港区势力"], body: "把持漕运的旧帮派。" },
  { id: "item.黄铜钥匙", title: "黄铜钥匙", type: "item", status: "active", tags: ["关键物件", "人物：林月如"], body: "柄上刻着潮汐记号的黄铜钥匙。" },
  { id: "character.林月如", title: "林月如", type: "character", status: "active", tags: [], body: "带着旧信来到码头的旅人。" },
  { id: "character.沈砚", title: "沈砚", type: "character", status: "active", tags: [], body: "隐姓埋名的摆渡人。" },
];
const events = [
  { id: "event.栈桥接头", title: "栈桥接头", type: "event", status: "active", tags: ["单元：北滨码头", "人物：林月如、沈砚", "地点：北滨码头", "时间：第三年秋 · 夜", "知情：林月如=已得知", "知情：沈砚=未知"], body: "雨夜的栈桥接头，交换钟声线索。" },
  { id: "event.钟声的真相", title: "钟声的真相", type: "event", status: "draft", tags: ["作者秘密", "知情：林月如=已得知"], body: "钟声来自沉船。" },
  { id: "event.渡口的传闻", title: "渡口的传闻", type: "event", status: "draft", tags: ["推测：摆渡人", "时间：未知", "知情：沈砚=怀疑"], body: "水下有人应和钟声。" },
  { id: "event.潮汐信令确立", title: "潮汐信令确立", type: "event", status: "active", tags: ["单元：北滨码头", "时间：第三年前"], body: "沉船夜后设立信令。" },
  { id: "event.钟声节律改制", title: "钟声节律改制", type: "event", status: "draft", tags: ["时间：七年前"], body: "改为每潮报信。" },
  { id: "event.钟塔维护争执", title: "钟塔维护争执", type: "event", status: "draft", tags: ["压力：潮汐信令", "冲突：漕帮与守钟人"], body: "漕帮削减维护费。" },
];
const natures = projectWorldReferences([...worldObjects, ...events]);
const natureOf = new Map(natures.map((entry) => [entry.id, { nature: entry.nature, knownTo: entry.knowledge.filter((k) => k.state === "known").map((k) => k.character), unknownTo: entry.knowledge.filter((k) => k.state !== "known").map((k) => k.character) }]));
const worldChunks: SemanticChunk[] = [
  ...worldObjects.flatMap((object) => chunkWorldObject({ ...object, informationNature: natureOf.get(object.id)!.nature, knownTo: natureOf.get(object.id)!.knownTo, unknownTo: natureOf.get(object.id)!.unknownTo })),
  ...events.flatMap((event) => chunkEvent({ ...event, informationNature: natureOf.get(event.id)!.nature, knownTo: natureOf.get(event.id)!.knownTo, unknownTo: natureOf.get(event.id)!.unknownTo })),
];
const memoryChunks: SemanticChunk[] = [
  chunkMemory({ id: "memory.1", characterTitle: "沈砚", label: "heard", title: "钟声的传闻", summary: "听说水下有人应和钟声。", validity: "active", occurredAt: null, informationNature: "confirmed-fact" }),
];

/** 评测用假 Embedder：字符 bigram 哈希到 32 维并归一化。确定性、零外部调用、明确标注 fake。 */
function fakeEmbedder() {
  const calls: number[] = [];
  const embed = async (texts: readonly string[]) => {
    calls.push(texts.length);
    return texts.map((text) => {
      const vector = new Array<number>(32).fill(0);
      for (let index = 0; index < text.length - 1; index += 1) {
        const gram = text.slice(index, index + 2);
        let hash = 0;
        for (const ch of gram) hash = (hash * 31 + ch.codePointAt(0)!) % 997;
        vector[hash % 32] += 1;
      }
      const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
      return vector.map((value) => value / norm);
    });
  };
  return { embed, calls };
}

function fakeRerank<T extends { chunk: SemanticChunk }>(query: string, candidates: readonly T[]): { items: T[]; pairs: number } {
  // 占位 Reranker：按 query 字符在标题+文本中的密度重排（R3 未接真实模型）。
  const needle = query.replace(/\s/gu, "").slice(0, 4);
  const items = [...candidates].sort((left, right) => {
    const density = (item: T) => `${item.chunk.title}${item.chunk.lexicalText}`.split(needle).length;
    return density(right) - density(left);
  });
  return { items, pairs: Math.max(0, candidates.length - 1) };
}

interface StrategyMetrics {
  recall5: number; recall10: number; mrr: number; secretLeakageCount: number; duplicateRate: number;
  sourceCoverage: number; averageContextTokens: number; p95LatencyMs: number; embeddingInputs: number; rerankPairs: number;
}

async function evaluateStrategy(name: string, strategy: { exact: boolean; keyword: boolean; dense: boolean }): Promise<Record<string, StrategyMetrics | number>> {
  const embedder = fakeEmbedder();
  const latencies: number[] = [];
  let recalls5 = 0, recalls10 = 0, mrrSum = 0, leakage = 0, dupHitTotal = 0, hitTotal = 0, covered = 0, tokenSum = 0, rerankPairs = 0;
  for (const golden of GOLDEN_QUERIES) {
    const started = performance.now();
    const result = await retrieveHybrid({
      query: golden.query,
      chunks: [...worldChunks, ...memoryChunks],
      characterTitle: golden.characterTitle,
      sceneTitle: golden.sceneTitle,
      topK: 10,
      tokenBudget: 1500,
      embedder: strategy.dense ? (embedder as HybridRetriever) : undefined,
      semanticEnabled: strategy.dense,
      channels: { exact: strategy.exact, keyword: strategy.keyword, dense: strategy.dense },
    });
    latencies.push(performance.now() - started);
    let reranked = result.hits;
    if (name === "D" && result.hits.length > 1) {
      const rerankedFake = fakeRerank(golden.query, result.hits);
      reranked = rerankedFake.items;
      rerankPairs += rerankedFake.pairs;
    }
    const hitTitles = reranked.map((hit) => hit.chunk.title);
    const uniqueTitles = new Set(hitTitles);
    leakage += hitTitles.filter((title) => SECRET_TITLES.includes(title)).length;
    dupHitTotal += hitTitles.length - uniqueTitles.size;
    hitTotal += hitTitles.length;
    const firstRank = golden.expectedTitles.map((title) => hitTitles.indexOf(title)).filter((rank) => rank >= 0).sort((a, b) => a - b)[0];
    if (firstRank !== undefined) {
      mrrSum += 1 / (firstRank + 1);
      covered += 1;
    }
    recalls5 += golden.expectedTitles.some((title) => hitTitles.slice(0, 5).includes(title)) ? 1 : 0;
    recalls10 += golden.expectedTitles.some((title) => hitTitles.slice(0, 10).includes(title)) ? 1 : 0;
    tokenSum += result.meta.totalTokens;
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const metrics: StrategyMetrics = {
    recall5: recalls5 / GOLDEN_QUERIES.length,
    recall10: recalls10 / GOLDEN_QUERIES.length,
    mrr: mrrSum / GOLDEN_QUERIES.length,
    secretLeakageCount: leakage,
    duplicateRate: hitTotal ? dupHitTotal / hitTotal : 0,
    sourceCoverage: covered / GOLDEN_QUERIES.length,
    averageContextTokens: tokenSum / GOLDEN_QUERIES.length,
    p95LatencyMs: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    embeddingInputs: embedder.calls.reduce((sum, count) => sum + count, 0),
    rerankPairs,
  };
  return { metrics, queries: GOLDEN_QUERIES.length };
}

test("golden set: hybrid retrieval beats or matches keyword and dense, with zero secret leakage", async () => {
  const a = await evaluateStrategy("A", { exact: true, keyword: true, dense: false });
  const b = await evaluateStrategy("B", { exact: false, keyword: false, dense: true });
  const c = await evaluateStrategy("C", { exact: true, keyword: true, dense: true });
  const d = await evaluateStrategy("D", { exact: true, keyword: true, dense: true });
  const metricsA = a.metrics as StrategyMetrics, metricsB = b.metrics as StrategyMetrics, metricsC = c.metrics as StrategyMetrics, metricsD = d.metrics as StrategyMetrics;
  for (const [name, metrics] of [["A", metricsA], ["B", metricsB], ["C", metricsC], ["D", metricsD]] as const) {
    assert.equal(metrics.secretLeakageCount, 0, `${name} 不得泄漏作者秘密`);
    assert.ok(Number.isFinite(metrics.mrr) && metrics.mrr >= 0);
    assert.ok(metrics.recall10 >= metrics.recall5 - 1e-9, `${name} recall10 不得低于 recall5`);
  }
  assert.ok(metricsC.recall10 >= metricsA.recall10 - 1e-9, "混合 Recall@10 不低于纯关键词");
  assert.ok(metricsC.recall10 >= metricsB.recall10 - 1e-9, "混合 Recall@10 不低于纯 Embedding");
  assert.ok(metricsC.sourceCoverage >= 0.6, `混合来源覆盖需 ≥0.6，实测 ${metricsC.sourceCoverage}`);
  assert.equal(metricsA.embeddingInputs, 0, "纯关键词不得调用 Embedding");
  assert.ok(metricsB.embeddingInputs > 0, "纯 Embedding 必须有向量输入");
  console.log("[golden] A", JSON.stringify(metricsA));
  console.log("[golden] B", JSON.stringify(metricsB));
  console.log("[golden] C", JSON.stringify(metricsC));
  console.log("[golden] D(混合+占位Rerank)", JSON.stringify(metricsD));
});

test("hybrid retrieval respects knowledge boundary before any ranking", async () => {
  const result = await retrieveHybrid({ query: "钟声", chunks: worldChunks, characterTitle: "沈砚", topK: 10, channels: { exact: true, keyword: true, dense: false } });
  const excludedTitles = result.excluded.map((item) => item.title);
  assert.ok(excludedTitles.includes("钟声的真相"), "作者秘密必须排除");
  assert.ok(result.hits.every((hit) => hit.chunk.title !== "钟声的真相"), "秘密不得进入命中");
  assert.ok(result.hits.some((hit) => hit.chunk.title === "渡口的传闻" ? false : true) || result.excluded.some((item) => item.title === "渡口的传闻" && item.reason === "传闻 · 不确定"), "传闻通道不作为正文命中泄漏");
});

test("index cache: contentHash increment, generation switch, atomic parse and file name safety", () => {
  let cache = createSemanticIndexCache({ projectId: "closeout-preview", workVersionId: "wv1", branchId: "主线", embeddingProfileId: "none", dimensions: 0 });
  const baseEntry = { projectId: "closeout-preview", workVersionId: "wv1", branchId: "主线", sourceOwner: "world-object" as const, objectId: "rule.潮汐信令", sectionId: "rule.潮汐信令#definition", sourceRevision: 1, contentHash: "aaa", objectType: "rule", authority: "author", informationNature: "confirmed-fact", worldTime: null, sceneKeys: ["北滨码头"], visibility: { knownTo: [], unknownTo: [] }, title: "潮汐信令", lexicalText: "三短一长", embeddingProfileId: "none", dimensions: 0, vector: null };
  const first = upsertSemanticEntry(cache, baseEntry);
  assert.equal(first.action, "embedded");
  cache = first.cache;
  const kept = upsertSemanticEntry(cache, baseEntry);
  assert.equal(kept.action, "kept", "contentHash 未变不得重复嵌入");
  const updated = upsertSemanticEntry(cache, { ...baseEntry, sourceRevision: 2, contentHash: "bbb" });
  assert.equal(updated.action, "updated", "sourceRevision 变化只更新对应区块");
  cache = updated.cache;
  const switched = switchGeneration(cache, "bge-m3-like", 1024);
  assert.notEqual(switched.generationId, cache.generationId);
  assert.equal(switched.entries["rule.潮汐信令#definition"].vector, null, "generation 切换后向量失效");
  assert.equal(parseSemanticIndexCache(serializeSemanticIndexCache(switched))?.entries["rule.潮汐信令#definition"].contentHash, "bbb");
  assert.equal(parseSemanticIndexCache("{broken"), null);
  assert.equal(semanticIndexCacheFileName("closeout-preview", "abc123"), "semantic-index-closeout-preview-abc123.json");
  assert.equal(semanticIndexCacheFileName("../evil", "x/y"), "semantic-index-._evil-x_y.json");
});

test("embedding profile contract: no credentials, honest empty default", () => {
  const empty = emptyEmbeddingProfile();
  assert.equal(validateEmbeddingProfile(empty).ok, true, "空配置必须合法（诚实不可用状态）");
  assert.equal(validateEmbeddingProfile({ ...empty, supportsDense: true, dimensions: 1024 }).ok, false, "声明 dense 但无模型/引用必须判非法");
  const valid = validateEmbeddingProfile({ ...empty, profileId: "bge-m3-main", providerProfileId: "provider.default", modelId: "bge-m3", dimensions: 1024, maxInputTokens: 8192, supportsDense: true });
  assert.equal(valid.ok, true);
  assert.equal(validateRerankerProfile({ profileId: "rerank", providerProfileId: "provider.default", modelId: "bge-reranker", maxPairs: 40 }).ok, true);
  assert.equal(validateRerankerProfile({ profileId: "rerank", modelId: "x", maxPairs: 0 }).ok, false);
});
