/**
 * 北溟夜航黄金查询集（R3 评测用，合成验收夹具数据）：
 * 每条查询给出应召回的世界条目标题（entry-level）与可选的角色视角。
 * 用于比较 纯关键词 / 纯 Embedding / 混合 / 混合+Reranker 四种策略。
 */

export interface GoldenQuery {
  id: string;
  query: string;
  characterTitle: string | null;
  sceneTitle: string | null;
  /** 期望召回的条目标题（Recall/MRR 的判定集合） */
  expectedTitles: string[];
}

export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  { id: "q01", query: "为什么潮汐信令会建立？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令", "潮汐信令确立"] },
  { id: "q02", query: "谁从潮汐信令中获益？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
  { id: "q03", query: "当前北滨码头有哪些规则？", characterTitle: null, sceneTitle: "北滨码头", expectedTitles: ["潮汐信令", "北滨码头"] },
  { id: "q04", query: "林月如知道但沈砚不知道什么？", characterTitle: "沈砚", sceneTitle: "北滨码头", expectedTitles: ["栈桥接头"] },
  { id: "q05", query: "与钟声真相相似的线索有哪些？", characterTitle: "林月如", sceneTitle: null, expectedTitles: ["钟声线", "渡口的传闻"] },
  { id: "q06", query: "当前场景可用的世界冲突有哪些？", characterTitle: null, sceneTitle: "北滨码头", expectedTitles: ["钟塔维护争执"] },
  { id: "q07", query: "哪些资料是作者秘密？", characterTitle: null, sceneTitle: null, expectedTitles: ["钟声的真相"] },
  { id: "q08", query: "黄铜钥匙和哪些事件相关？", characterTitle: null, sceneTitle: null, expectedTitles: ["黄铜钥匙"] },
  { id: "q09", query: "潮汐信令如何运作？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
  { id: "q10", query: "潮汐信令谁在维持？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令", "北溟漕帮"] },
  { id: "q11", query: "潮汐信令的代价由谁承担？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
  { id: "q12", query: "潮汐信令有哪些例外和禁忌？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
  { id: "q13", query: "北溟漕帮是什么组织？", characterTitle: null, sceneTitle: null, expectedTitles: ["北溟漕帮"] },
  { id: "q14", query: "北溟漕帮和码头有什么关系？", characterTitle: null, sceneTitle: "北滨码头", expectedTitles: ["北溟漕帮", "北滨码头"] },
  { id: "q15", query: "北滨码头在哪里？", characterTitle: null, sceneTitle: null, expectedTitles: ["北滨码头"] },
  { id: "q16", query: "林月如是谁？", characterTitle: "林月如", sceneTitle: null, expectedTitles: ["林月如"] },
  { id: "q17", query: "沈砚知道什么？", characterTitle: "沈砚", sceneTitle: null, expectedTitles: ["沈砚"] },
  { id: "q18", query: "钟声线的故事线进展如何？", characterTitle: null, sceneTitle: null, expectedTitles: ["钟声线"] },
  { id: "q19", query: "栈桥接头发生了什么？", characterTitle: null, sceneTitle: "北滨码头", expectedTitles: ["栈桥接头"] },
  { id: "q20", query: "钟声的真相是什么？", characterTitle: "林月如", sceneTitle: null, expectedTitles: ["钟声的真相"] },
  { id: "q21", query: "渡口有什么传闻？", characterTitle: null, sceneTitle: null, expectedTitles: ["渡口的传闻"] },
  { id: "q22", query: "潮汐信令是什么时候确立的？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令确立"] },
  { id: "q23", query: "钟声节律有没有变化？", characterTitle: null, sceneTitle: null, expectedTitles: ["钟声节律改制", "潮汐信令"] },
  { id: "q24", query: "钟塔现在有什么压力？", characterTitle: null, sceneTitle: null, expectedTitles: ["钟塔维护争执"] },
  { id: "q25", query: "黄铜钥匙在谁手里？", characterTitle: null, sceneTitle: null, expectedTitles: ["黄铜钥匙", "林月如"] },
  { id: "q26", query: "雨夜的栈桥上发生了什么？", characterTitle: null, sceneTitle: "北滨码头", expectedTitles: ["栈桥接头", "北滨码头"] },
  { id: "q27", query: "哪些事实和北滨码头相关？", characterTitle: null, sceneTitle: "北滨码头", expectedTitles: ["北滨码头", "潮汐信令"] },
  { id: "q28", query: "沈砚怀疑什么？", characterTitle: "沈砚", sceneTitle: null, expectedTitles: ["渡口的传闻"] },
  { id: "q29", query: "潮汐信令在大潮时怎么报信？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
  { id: "q30", query: "私渡的船会遇到什么限制？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
  { id: "q31", query: "林月如和沈砚是什么关系？", characterTitle: null, sceneTitle: null, expectedTitles: ["林月如", "沈砚"] },
  { id: "q32", query: "守钟人的夜班是怎么回事？", characterTitle: null, sceneTitle: null, expectedTitles: ["潮汐信令"] },
];

/** 作者秘密标题（任何策略命中即记为泄漏）。 */
export const SECRET_TITLES: readonly string[] = ["钟声的真相"];
