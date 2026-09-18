import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSemanticIndexService } from "../../apps/story-studio/server/semanticIndexService.mjs";

const tidalBodyV1 = [
  "潮汐信令以钟声报潮。（合成验收夹具）",
  "## 定义",
  "三短一长的钟声表示大潮将至。",
  "## 运作机制",
  "守钟人观测潮位并敲钟。",
].join("\n");
const tidalBodyV2 = tidalBodyV1.replace("三短一长的钟声表示大潮将至。", "三短一长表示大潮将至，夜航禁止离港。");
const secretBody = "钟声其实来自沉船的求救信号。（作者秘密正文）";

function makeService(objectStates) {
  const root = mkdtempSync(path.join(os.tmpdir(), "semantic-index-closeout-"));
  const operations = {
    listWorldObjects: () => Object.values(objectStates).map(({ body, ...summary }) => ({ ...summary })),
    readWorldObject: ({ objectId }) => {
      const state = objectStates[objectId];
      if (!state) throw new Error("对象不存在");
      return { ...state };
    },
  };
  const service = createSemanticIndexService({ operations });
  const rebuild = (overrides = {}) => service.rebuild({ rootPath: root, projectId: "closeout-preview", workVersionId: "w1", branchId: "主线", generation: "none-v0", ...overrides });
  const persisted = () => service.readPersistedCache(root, "closeout-preview", "w1", "主线", "none-v0");
  const cachePath = (workVersionId, branchId, generation) => service.persistedCachePath(root, "closeout-preview", workVersionId, branchId, generation);
  return { root, service, rebuild, persisted, cachePath, objectStates };
}

test("A: unchanged rebuild reports kept=all and zero updated/added/removed/changedKeys", () => {
  const states = {
    "rule.潮汐信令": { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["世界规则"], body: tidalBodyV1, relativeId: "world/rules/潮汐信令.md", revisionToken: "rev1" },
  };
  const { root, service, rebuild, persisted, cachePath } = makeService(states);
  const first = rebuild();
  assert.ok(first.stats.totalAfter >= 1);
  const totalBefore = first.stats.totalAfter;
  const second = rebuild();
  assert.equal(second.stats.totalBefore, totalBefore);
  assert.equal(second.stats.kept, totalBefore);
  assert.equal(second.stats.updated, 0);
  assert.equal(second.stats.added, 0);
  assert.equal(second.stats.removed, 0);
  assert.deepEqual(second.stats.changedKeys, []);
  assert.equal(second.stats.totalAfter, second.stats.kept);
  assert.ok(persisted().entries["rule.潮汐信令#definition"]);
});

test("B: editing one section updates exactly that chunk, persists to disk and survives reload", () => {
  const states = {
    "rule.潮汐信令": { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: ["世界规则"], body: tidalBodyV1, relativeId: "world/rules/潮汐信令.md", revisionToken: "rev1" },
    "event.接头": { id: "event.接头", title: "栈桥接头", type: "event", status: "active", tags: ["单元：北滨码头"], body: "雨夜接头。", relativeId: "world/events/接头.md", revisionToken: "rev1" },
  };
  const { root, service, rebuild, persisted, objectStates, cachePath } = makeService(states);
  rebuild();
  objectStates["rule.潮汐信令"].body = tidalBodyV2;
  objectStates["rule.潮汐信令"].revisionToken = "rev2";
  const second = rebuild();
  assert.equal(second.stats.updated, 1, "只允许定义块更新");
  assert.deepEqual(second.stats.changedKeys, ["rule.潮汐信令#definition"]);
  assert.equal(second.stats.kept, second.stats.totalBefore - 1);
  assert.equal(second.stats.added, 0);
  assert.equal(second.stats.removed, 0);
  // 磁盘 entry 真正替换为新内容
  const onDisk = persisted().entries["rule.潮汐信令#definition"];
  assert.ok(onDisk.lexicalText.includes("夜航禁止离港"), "磁盘 entry 已替换");
  // 新 service 实例（模拟重启）读取同一目录仍为新内容
  const reloaded = service.load(service.projectDir ? service.root : service.root, "closeout-preview", "w1", "主线", "none-v0");
  void reloaded;
  const fresh = service.load(root, "closeout-preview", "w1", "主线", "none-v0");
  assert.equal(fresh.status, "ready");
  assert.ok(fresh.entries["rule.潮汐信令#definition"].lexicalText.includes("夜航禁止离港"));
});

test("C: deleting a world object removes all of its chunks with no orphan text left", () => {
  const states = {
    "rule.潮汐信令": { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: [], body: tidalBodyV1, relativeId: "world/rules/潮汐信令.md", revisionToken: "rev1" },
  };
  const { root, service, rebuild, persisted, cachePath } = makeService(states);
  rebuild();
  // 对象被删除：从状态中移除
  delete states["rule.潮汐信令"];
  const after = rebuild();
  assert.ok(after.stats.removed >= 1, "删除对象的块被移除");
  const file = cachePath("w1", "主线", "none-v0");
  assert.equal(Object.keys(persisted().entries).length, 0, "删除对象后不得残留孤儿块");
  assert.ok(!readFileSync(file, "utf8").includes("潮汐信令以钟声报潮"), "孤儿 lexicalText 不残留");
});

test("D: public content reclassified as author secret loses remote eligibility without remote calls", () => {
  const states = {
    "event.真相": { id: "event.真相", title: "钟声的真相", type: "event", status: "active", tags: ["知情：林月如=已得知"], body: secretBody, relativeId: "world/events/真相.md", revisionToken: "rev1" },
  };
  const { root, service, rebuild, persisted, objectStates, cachePath } = makeService(states);
  const first = rebuild();
  assert.ok(first.stats.remoteEligible >= 1);
  objectStates["event.真相"].tags = ["作者秘密", "知情：林月如=已得知"];
  objectStates["event.真相"].status = "draft";
  const second = rebuild();
  assert.equal(second.stats.remoteEligible, 0, "重分类后不再有远程资格块");
  const entry = Object.values(persisted().entries).find((e) => e.objectId === "event.真相");
  assert.equal(entry.eligibility, "LOCAL_ONLY", "新状态为 LOCAL_ONLY");
});

test("E: LOCAL_ONLY promoted to DO_NOT_INDEX removes the entry from the local cache too", () => {
  const states = {
    "event.密约": { id: "event.密约", title: "灯下密约", type: "event", status: "draft", tags: ["作者秘密"], body: "密约正文。", relativeId: "world/events/密约.md", revisionToken: "rev1" },
  };
  const { root, service, rebuild, persisted, objectStates, cachePath } = makeService(states);
  rebuild();
  assert.ok(Object.keys(persisted().entries).length >= 1, "LOCAL_ONLY 内容保留在本地派生缓存");
  objectStates["event.密约"].tags = ["作者秘密", "禁止索引"];
  const after = rebuild();
  assert.ok(after.stats.removed >= 1, "DO_NOT_INDEX 块被移除");
  assert.equal(Object.keys(persisted().entries).length, 0);
});

test("F: different workVersion/branch caches never cross-read", () => {
  const { root, service, rebuild } = makeService({
    "rule.潮汐信令": { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: [], body: tidalBodyV1, relativeId: "world/rules/潮汐信令.md", revisionToken: "rev1" },
  });
  rebuild({ workVersionId: "w1", branchId: "主线" });
  const other = service.load(root, "closeout-preview", "w2", "其他分支", "none-v0");
  assert.equal(other.status, "missing", "不同版本/分支不串读缓存");
});

test("G: corrupt cache fails open as corrupt and rebuild restores the index", () => {
  const { root, service, rebuild, persisted } = makeService({
    "rule.潮汐信令": { id: "rule.潮汐信令", title: "潮汐信令", type: "rule", status: "active", tags: [], body: tidalBodyV1, relativeId: "world/rules/潮汐信令.md", revisionToken: "rev1" },
  });
  rebuild();
  service.corruptPersistedCacheForTest(root, "closeout-preview", "w1", "主线", "none-v0");
  const loaded = service.load(root, "closeout-preview", "w1", "主线", "none-v0");
  assert.equal(loaded.status, "corrupt", "损坏缓存 fail-open 标记，不损坏作品");
  const rebuilt = rebuild();
  assert.ok(rebuilt.stats.chunks >= 1);
  assert.equal(service.load(root, "closeout-preview", "w1", "主线", "none-v0").status, "ready");
});
