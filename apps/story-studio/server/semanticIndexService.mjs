/**
 * 派生语义索引服务（R3.1）：把语义索引缓存合同接到真实磁盘缓存。
 * - 缓存目录遵循作品工作区规范：<root>/<projectId>/.world-os/cache/semantic-index/
 * - 索引是可重建的派生缓存，不是事实 Owner；不进入 WorkVersion digest，不强制进入 .tianyan 导出
 * - 原子写：唯一 tmp → 写入 → fsync → rename（并发安全，不跟随 symlink）
 * - 读取损坏/缺失 → 返回 null，调用方 fail-open 到关键词检索，不损坏作品
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, openSync, closeSync, fsyncSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { projectWorldReferences } from "../../../src/storyContracts/worldReferenceProjection.ts";
import { chunkEvent, chunkWorldObject } from "../../../src/storyContracts/semanticChunking.ts";
import { resolveIndexEligibility } from "../../../src/storyContracts/indexEligibility.ts";
import { contentHashOf } from "../../../src/storyContracts/semanticIndexCache.ts";

const SEMANTIC_INDEX_FORMAT = "tianyan-semantic-index-cache/v1";
/** 统一默认 generation：rebuild/load/路由共用，禁止 undefined 进入文件名。 */
export const DEFAULT_SEMANTIC_INDEX_GENERATION = "none-v0";

export function createSemanticIndexService({ operations, projectPrivacyPolicy }) {
  const policyOf = (projectId) => {
    if (typeof projectPrivacyPolicy === "function") return projectPrivacyPolicy(projectId);
    return projectPrivacyPolicy ?? "unknown";
  };

  /** 词法+realpath 边界：目录必须落在 rootPath 内，且既有路径组件不得含 symlink 逃逸。 */
  function assertPathInside(rootPath, dir) {
    const rootResolved = path.resolve(rootPath);
    const dirResolved = path.resolve(dir);
    const relative = path.relative(rootResolved, dirResolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("语义索引缓存路径越界。");
    }
    // 逐级检查既有组件的 realpath（symlink 逃逸防护）
    let current = rootResolved;
    const realRoot = fsRealPathSafe(rootResolved) ?? rootResolved;
    const parts = dirResolved.slice(rootResolved.length).split(path.sep).filter(Boolean);
    let walked = rootResolved;
    for (const part of parts) {
      walked = path.join(walked, part);
      if (fsLstatIsSymlink(walked)) throw new Error("语义索引缓存路径越界。");
      const realWalked = fsRealPathSafe(walked);
      if (realWalked && !realWalked.startsWith(realRoot)) throw new Error("语义索引缓存路径越界。");
    }
    void current;
  }

  function fsRealPathSafe(target) {
    try { return realpathSync(target); } catch { return null; }
  }

  function fsLstatIsSymlink(target) {
    try { return lstatSync(target).isSymbolicLink(); } catch { return false; }
  }

  const projectDir = (rootPath, projectId) => {
    if (typeof projectId !== "string" || projectId.length === 0 || projectId.includes("..") || path.isAbsolute(projectId)) {
      throw new Error("语义索引缓存路径越界。");
    }
    const dir = path.join(path.resolve(rootPath), projectId, ".world-os", "cache", "semantic-index");
    assertPathInside(rootPath, dir);
    return dir;
  };

  const fileName = (workVersionId, branchId, generation) =>
    `index-${workVersionId}-${branchId}-${generation}.json`.replace(/[^a-zA-Z0-9._-]/gu, "_");

  function atomicWrite(file, payload) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeFileSync(fd, payload, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (fsLstatIsSymlink(file)) throw new Error("语义索引缓存路径越界。");
    renameSync(tmp, file);
  }

  function readCache(rootPath, projectId, workVersionId, branchId, generation) {
    const file = path.join(projectDir(rootPath, projectId), fileName(workVersionId, branchId, generation));
    if (!existsSync(file)) return null;
    try {
      if (fsLstatIsSymlink(file)) return null;
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed.format !== SEMANTIC_INDEX_FORMAT) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function buildEntryChunks(object, projectId, projectPrivacyPolicy) {
    const nature = projectWorldReferences([object])[0] ?? null;
    const knownTo = nature?.knowledge.filter((item) => item.state === "known").map((item) => item.character) ?? [];
    const unknownTo = nature?.knowledge.filter((item) => item.state !== "known").map((item) => item.character) ?? [];
    const chunkInput = { ...object, informationNature: nature?.nature ?? null, knownTo, unknownTo };
    const chunker = object.type === "event" ? chunkEvent : chunkWorldObject;
    const policy = projectPrivacyPolicy ?? policyOf(projectId);
    const eligibility = resolveIndexEligibility({ informationNature: nature?.nature ?? null, objectType: object.type, tags: object.tags, projectPrivacyPolicy: policy });
    return chunker(chunkInput).map((chunk) => ({ ...chunk, eligibility: eligibility.eligibility, eligibilityReason: eligibility.reason }));
  }

  /** 重建/增量构建。计数口径：
   * totalBefore = 上次缓存的区块数；kept + updated + added = totalAfter；
   * removed 单列（totalBefore 中消失的区块，含对象删除与 DO_NOT_INDEX 降级）；
   * changedKeys = updated + added + removed 的去重键列表。 */
  function rebuild({ rootPath, projectId, workVersionId, branchId = "当前主线", generation = DEFAULT_SEMANTIC_INDEX_GENERATION, force = false, projectPrivacyPolicy }) {
    const previous = readCache(rootPath, projectId, workVersionId, branchId, generation);
    const previousEntries = previous?.entries ?? {};
    const totalBefore = Object.keys(previousEntries).length;
    const dir = projectDir(rootPath, projectId);
    const file = path.join(dir, fileName(workVersionId, branchId, generation));
    const objects = operations.listWorldObjects({ projectId, includeArchived: false }).map((summary) => {
      try {
        const full = operations.readWorldObject({ projectId, objectId: summary.id });
        return { ...summary, body: full.body ?? null };
      } catch {
        return { ...summary, body: null };
      }
    });
    const entries = {};
    const changedKeys = new Set();
    const now = new Date().toISOString();
    const stats = { totalBefore, totalAfter: 0, chunks: 0, kept: 0, updated: 0, added: 0, removed: 0, changedKeys, remoteEligible: 0, localOnly: 0, lexicalOnly: 0, doNotIndex: 0, objects: objects.length };
    for (const object of objects) {
      const objectChunks = buildEntryChunks(object, projectId, projectPrivacyPolicy);
      for (const chunk of objectChunks) {
        // 内容指纹包含信息性质与索引资格：tags 重分类必须反映到缓存，否则权限过滤会读到过时资格。
        const contentHash = contentHashOf(`${chunk.title}\n${chunk.lexicalText}\n${chunk.informationNature ?? ""}\n${chunk.eligibility}`);
        const previousEntry = previousEntries[chunk.sectionId];
        // DO_NOT_INDEX 的区块从不落盘；若上次缓存存在同名区块，计为 removed。
        if (chunk.eligibility === "DO_NOT_INDEX") {
          stats.doNotIndex += 1;
          continue;
        }
        else if (chunk.eligibility === "LOCAL_ONLY") stats.localOnly += 1;
        else if (chunk.eligibility === "LEXICAL_ONLY") stats.lexicalOnly += 1;
        else stats.remoteEligible += 1;
        const unchanged = !force && previousEntry && previousEntry.contentHash === contentHash;
        entries[chunk.sectionId] = unchanged ? { ...previousEntry, sourceRevision: object.revisionToken ?? previousEntry.sourceRevision } : {
          projectId, workVersionId, branchId, sourceOwner: object.type === "event" ? "event" : "world-object",
          objectId: object.id, sectionId: chunk.sectionId, sourceRevision: object.revisionToken ?? 0,
          contentHash, objectType: object.type, authority: chunk.authority, informationNature: chunk.informationNature,
          eligibility: chunk.eligibility, eligibilityReason: chunk.eligibilityReason,
          worldTime: null, sceneKeys: object.tags.filter((tag) => tag.startsWith("单元：")).map((tag) => tag.slice(3)),
          visibility: { knownTo: chunk.knownTo, unknownTo: chunk.unknownTo },
          title: object.title, lexicalText: chunk.lexicalText,
          embeddingProfileId: generation === "none-v0" ? "none" : generation, dimensions: 0, vector: null,
        };
        if (unchanged) stats.kept += 1;
        else {
          stats[previousEntry ? "updated" : "added"] += 1;
          changedKeys.add(chunk.sectionId);
        }
        stats.chunks += 1;
      }
    }
    // 对象/区块消失：上次存在但本次不再产出的区块计为 removed（含对象被删除与 DO_NOT_INDEX 降级）。
    for (const key of Object.keys(previousEntries)) {
      if (!entries[key]) { stats.removed += 1; changedKeys.add(key); }
    }
    stats.totalAfter = Object.keys(entries).length;
    stats.changedKeys = Array.from(changedKeys).sort();
    // manifest 摘要：递归稳定序列化（键排序），绑定全部 entries 内容；不含 createdAt 等非内容字段。
    const manifest = {
      format: SEMANTIC_INDEX_FORMAT, projectId, workVersionId, branchId,
      embeddingProfileId: generation === "none-v0" ? "none" : generation, generation, dimensions: 0,
      sourceRevisionDigest: revisionDigestOf(Object.values(entries)),
      contentHash: contentHashOf(stableStringify(entries)), createdAt: now,
    };
    atomicWrite(file, JSON.stringify({ format: SEMANTIC_INDEX_FORMAT, manifest, entries }, null, 1));
    return { manifest, stats, entries };
  }

  function revisionDigestOf(entries) {
    const tokens = Array.from(new Set(Object.values(entries).map((entry) => String(entry.sourceRevision ?? "")))).sort();
    return contentHashOf(tokens.join("\n"));
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  /** fail-open 读取：按 workVersion/branch/generation 精确定位；缺失/损坏返回对应状态，调用方回退关键词检索。 */
  function load(rootPath, projectId, workVersionId, branchId, generation = DEFAULT_SEMANTIC_INDEX_GENERATION) {
    try {
      const dir = projectDir(rootPath, projectId);
      const file = path.join(dir, fileName(workVersionId, branchId, generation));
      if (!existsSync(file)) return { status: "missing" };
      if (fsLstatIsSymlink(file)) return { status: "corrupt" };
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed.format !== SEMANTIC_INDEX_FORMAT) return { status: "corrupt" };
      return { status: "ready", manifest: parsed.manifest, entries: parsed.entries };
    } catch {
      return { status: "corrupt" };
    }
  }

  function clear(rootPath, projectId) {
    const dir = projectDir(rootPath, projectId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  /** 只读访问持久化缓存（路径边界在 projectDir 内校验），供验收与诊断使用。 */
  function readPersistedCache(rootPath, projectId, workVersionId, branchId, generation = DEFAULT_SEMANTIC_INDEX_GENERATION) {
    const file = path.join(projectDir(rootPath, projectId), fileName(workVersionId, branchId, generation));
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  /** 持久化缓存文件路径（边界校验后返回），供诊断与验收断言使用。 */
  function persistedCachePath(rootPath, projectId, workVersionId, branchId, generation = DEFAULT_SEMANTIC_INDEX_GENERATION) {
    const dir = projectDir(rootPath, projectId);
    return path.join(dir, fileName(workVersionId, branchId, generation));
  }

  /** 仅供测试：把缓存文件写成损坏内容以验证 fail-open。 */
  function corruptPersistedCacheForTest(rootPath, projectId, workVersionId, branchId, generation = DEFAULT_SEMANTIC_INDEX_GENERATION) {
    const dir = projectDir(rootPath, projectId);
    const file = path.join(dir, fileName(workVersionId, branchId, generation));
    if (existsSync(file)) writeFileSync(file, "{broken-json", "utf8");
  }

  return { rebuild, load, clear, projectDir, readPersistedCache, persistedCachePath, corruptPersistedCacheForTest };
}
