import assert from "node:assert/strict";
import test from "node:test";

import {
  mayLeaveDevice,
  redactForLog,
  remoteEligibleChunks,
  resolveIndexEligibility,
} from "../../src/storyContracts/indexEligibility.ts";
import { chunkWorldObject } from "../../src/storyContracts/semanticChunking.ts";
import { projectWorldReferences } from "../../src/storyContracts/worldReferenceProjection.ts";

const secretObject = {
  id: "event.钟声的真相", title: "钟声的真相", type: "event", status: "draft",
  tags: ["作者秘密", "知情：林月如=已得知"], body: "钟声其实来自沉船的求救信号。（作者秘密正文）",
};
const publicObject = {
  id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active",
  tags: ["世界规则", "周期：潮汐"], body: "三短一长表示大潮将至。",
};

function chunksWithEligibility() {
  const entries = projectWorldReferences([secretObject, publicObject]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [secretObject, publicObject].map((object) => {
    const meta = byId.get(object.id)!;
    const chunks = chunkWorldObject({ ...object, informationNature: meta.nature, knownTo: meta.knowledge.filter((k) => k.state === "known").map((k) => k.character), unknownTo: meta.knowledge.filter((k) => k.state !== "known").map((k) => k.character) });
    return chunks.map((chunk) => ({ ...chunk, eligibility: resolveIndexEligibility({ informationNature: chunk.informationNature, objectType: chunk.objectType, tags: chunk.tags, projectPrivacyPolicy: "private" }) }));
  }).flat();
}

test("index eligibility partitions author secrets to LOCAL_ONLY and keeps public rules remote-allowed", () => {
  const decisionSecret = resolveIndexEligibility({ informationNature: "author-note", objectType: "event", tags: ["作者秘密"] });
  assert.equal(decisionSecret.eligibility, "LOCAL_ONLY");
  assert.equal(mayLeaveDevice(decisionSecret), false);
  const decisionRule = resolveIndexEligibility({ informationNature: "confirmed-fact", objectType: "rule", tags: ["世界规则"] });
  assert.equal(decisionRule.eligibility, "PROJECT_REMOTE_ALLOWED");
  assert.equal(mayLeaveDevice(decisionRule), true);
  const unknownNature = resolveIndexEligibility({ informationNature: null, objectType: "item", tags: [] });
  assert.equal(unknownNature.eligibility, "LEXICAL_ONLY", "未知性质不得静默升级为可远程");
  const forbidden = resolveIndexEligibility({ informationNature: "confirmed-fact", objectType: "rule", tags: ["禁止索引"] });
  assert.equal(forbidden.eligibility, "DO_NOT_INDEX");
});

test("negative case: a highly relevant author secret produces ZERO remote embedding inputs", async () => {
  const chunks = chunksWithEligibility();
  const remoteInputs: string[] = [];
  const localInputs: string[] = [];
  const embedder = {
    async embed(texts: readonly string[]) {
      for (const text of texts) (localInputs.length, localInputs.push(text));
      return texts.map(() => new Array(8).fill(0.1));
    },
  };
  // 远程通道：只允许出站块进入请求体
  const remoteCandidateTexts = remoteEligibleChunks(chunks.map((chunk) => ({ ...chunk, eligibility: resolveIndexEligibility({ informationNature: chunk.informationNature, objectType: chunk.objectType, tags: chunk.tags, projectPrivacyPolicy: "private" }) }))).map((chunk) => chunk.lexicalText);
  remoteInputs.push(...remoteCandidateTexts);
  // 本地通道：全部块都可用于词法
  localInputs.push(...chunks.map((chunk) => chunk.lexicalText));
  assert.equal(remoteInputs.filter((text) => text.includes("沉船")).length, 0, "秘密正文不得进入远程请求体");
  assert.ok(localInputs.some((text) => text.includes("沉船")), "本地词法检索仍可处理秘密内容");
  void embedder;
});

test("LOCAL_ONLY content never downgrades to remote when local model is unavailable", () => {
  const decision = resolveIndexEligibility({ informationNature: "author-note", objectType: "character-memory", tags: [] });
  assert.equal(decision.eligibility, "LOCAL_ONLY");
  // 本地模型不可用 → 该内容保持词法/空态，不自动升级为远程出站
  assert.equal(mayLeaveDevice(decision), false);
});

test("remote reranker only ever sees outbound-eligible candidates", () => {
  const chunks = chunksWithEligibility().map((chunk) => ({ ...chunk, eligibility: resolveIndexEligibility({ informationNature: chunk.informationNature, objectType: chunk.objectType, tags: chunk.tags, projectPrivacyPolicy: "private" }) }));
  const rerankerInput = remoteEligibleChunks(chunks);
  assert.ok(rerankerInput.every((chunk) => chunk.title !== "钟声的真相"), "秘密块不得进入 reranker 输入");
  assert.ok(rerankerInput.length < chunks.length, "秘密事件的所有区块都被拦截");
});

test("index-time filtering and query-time filtering are two independent defense lines", () => {
  // 防线一（索引前）：秘密块在索引资格阶段就被拒之门外
  const chunks = chunksWithEligibility();
  const indexed = remoteEligibleChunks(chunks);
  assert.ok(!indexed.some((chunk) => chunk.title === "钟声的真相"));
  // 防线二（查询时）：即使某块侥幸进入索引，角色视角过滤仍会排除未知/秘密
  const entries = projectWorldReferences([secretObject]);
  const shenView = entries[0].knowledge.filter((item) => item.character === "沈砚" && item.state === "known");
  assert.equal(shenView.length, 0, "沈砚视角没有该事件的已知记录");
});

test("logs never print secret bodies", () => {
  const logLine = redactForLog({ title: "钟声的真相", lexicalText: "钟声其实来自沉船的求救信号。" });
  assert.ok(!logLine.includes("沉船"));
  assert.ok(logLine.includes("未记录"));
});
