/**
 * 派生语义索引服务（R3.1）：把语义索引缓存合同接到真实磁盘缓存。
 * - 缓存目录遵循作品工作区规范：<root>/<projectId>/.world-os/cache/semantic-index/
 * - 索引是可重建的派生缓存，不是事实 Owner；不进入 WorkVersion digest，不强制进入 .tianyan 导出
 * - 原子写：tmp → fsync → rename；路径 join 后必须仍位于缓存目录内（防 traversal/symlink 逃逸）
 * - 读取损坏/缺失 → 返回 null，调用方 fail-open 到关键词检索，不损坏作品
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, openSync, closeSync, fsyncSync } from "node:fs";
import path from "node:path";

import { projectWorldReferences } from "../../../src/storyContracts/worldReferenceProjection.ts";
import { chunkEvent, chunkWorldObject } from "../../../src/storyContracts/semanticChunking.ts";
import { resolveIndexEligibility } from "../../../src/storyContracts/indexEligibility.ts";
import { contentHashOf } from "../../../src/storyContracts/semanticIndexCache.ts";

const SEMANTIC_INDEX_FORMAT = "tianyan-semantic-index-cache/v1";

export function createSemanticIndexService({ operations }) {
  const projectDir = (rootPath, projectId) => {
    const dir = path.join(rootPath, projectId, ".world-os", "cache", "semantic-index");
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(rootPath))) throw new Error("语义索引缓存路径越界。");
    return resolved;
  };
  const fileName = (workVersionId, branchId, generation) => `index-${workVersionId}-${branchId}-${generation}.json`.replace(/[^a-zA-Z0-9._-]/gu, "_");

  function atomicWrite(file, payload) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    const fd = openSync(tmp, "w");
    try {
      writeFileSync(fd, payload, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
  }

  function readCache(rootPath, projectId, workVersionId, branchId, generation) {
    const file = path.join(projectDir(rootPath, projectId), fileName(workVersionId, branchId, generation));
    if (!existsSync(file)) return null;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed.format !== SEMANTIC_INDEX_FORMAT) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function buildEntryChunks(object) {
    const nature = projectWorldReferences([object])[0] ?? null;
    const knownTo = nature?.knowledge.filter((item) => item.state === "known").map((item) => item.character) ?? [];
    const unknownTo = nature?.knowledge.filter((item) => item.state !== "known").map((item) => item.character) ?? [];
    const chunkInput = { ...object, informationNature: nature?.nature ?? null, knownTo, unknownTo };
    const chunker = object.type === "event" ? chunkEvent : chunkWorldObject;
    const eligibility = resolveIndexEligibility({ informationNature: nature?.nature ?? null, objectType: object.type, tags: object.tags, projectPrivacyPolicy: "private" });
    return chunker(chunkInput).map((chunk) => ({ ...chunk, eligibility: eligibility.eligibility, eligibilityReason: eligibility.reason }));
  }

  /** 重建/增量构建。计数口径（自洽且可回归验证）：
   * totalBefore = 上次缓存的区块数；totalAfter = 本次缓存的区块数；
   * kept + updated + added = totalAfter；removed 单列（totalBefore 中被移除的区块）；
   * changedKeys = updated + added + removed 的 sectionId 列表。
   * 另：DO_NOT_INDEX 区块从不落盘；对象被删除时其全部区块计为 removed。 */
  function rebuild({ rootPath, projectId, workVersionId, branchId = "当前主线", generation = "none-v0", force = false }) {
    const summaries = operations.listWorldObjects({ projectId, includeArchived: false });
    // 分块需要对象正文（结构化章节来源）；逐对象读取完整 WorldObject。
    const objects = summaries.map((summary) => {
      try {
        const full = operations.readWorldObject({ projectId, objectId: summary.id });
        return { ...summary, body: full.body ?? null };
      } catch {
        return { ...summary, body: null };
      }
    });
    const dir = projectDir(rootPath, projectId);
    const file = path.join(dir, fileName(workVersionId, branchId, generation));
    const previous = readCache(rootPath, projectId, workVersionId, branchId, generation);
    const previousEntries = previous?.entries ?? {};
    const totalBefore = Object.keys(previousEntries).length;
    const now = new Date().toISOString();
    const entries = {};
    const changedKeys = [];
    const stats = { totalBefore, totalAfter: 0, chunks: 0, kept: 0, updated: 0, added: 0, removed: 0, changedKeys, remoteEligible: 0, localOnly: 0, lexicalOnly: 0, doNotIndex: 0, objects: objects.length };
    for (const object of objects) {
      const objectChunks = buildEntryChunks(object);
      for (const chunk of objectChunks) {
        // 内容指纹包含信息性质与索引资格：tags 重分类必须反映到缓存，否则权限过滤会读到过时资格。
        const contentHash = contentHashOf(`${chunk.title}\n${chunk.lexicalText}\n${chunk.informationNature ?? ""}\n${chunk.eligibility}`);
        const previousEntry = previousEntries[chunk.sectionId];
        // DO_NOT_INDEX 的区块从不落盘；若上次缓存存在同名区块，计为 removed。
        if (chunk.eligibility === "DO_NOT_INDEX") {
          stats.doNotIndex += 1;
          if (previousEntries[chunk.sectionId]) { stats.removed += 1; changedKeys.push(chunk.sectionId); }
          continue;
        }
        // 内容指纹未变即保留（sourceRevision 仅刷新元数据）；指纹变化才重嵌入。
        const unchanged = !force && previousEntry && previousEntry.contentHash === contentHash;
        entries[chunk.sectionId] = unchanged ? { ...previousEntry, eligibility: chunk.eligibility, eligibilityReason: chunk.eligibilityReason, sourceRevision: object.revisionToken ?? previousEntry.sourceRevision } : {
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
          changedKeys.push(chunk.sectionId);
        }
        stats.chunks += 1;
        if (chunk.eligibility === "DO_NOT_INDEX") stats.doNotIndex += 1;
        else if (chunk.eligibility === "LOCAL_ONLY") stats.localOnly += 1;
        else if (chunk.eligibility === "LEXICAL_ONLY") stats.lexicalOnly += 1;
        else stats.remoteEligible += 1;
      }
    }
    // 对象/区块消失：上次存在但本次不再产出的区块计为 removed（含对象被删除）。
    for (const key of Object.keys(previousEntries)) {
      if (!entries[key]) { stats.removed += 1; changedKeys.push(key); }
    }
    stats.totalAfter = Object.keys(entries).length;
    changedKeys.sort();
    const manifest = {
      format: SEMANTIC_INDEX_FORMAT, projectId, workVersionId, branchId,
      embeddingProfileId: generation === "none-v0" ? "none" : generation, generation, dimensions: 0,
      sourceRevision: Math.max(0, ...Object.values(entries).map((entry) => entry.sourceRevision)),
      contentHash: contentHashOf(stableStringify(entries)), createdAt: now,
    };
    atomicWrite(file, JSON.stringify({ format: SEMANTIC_INDEX_FORMAT, manifest, entries }, null, 1));
    return { manifest, stats, entries };
  }

  function stableStringify(value) {
    return JSON.stringify(value, Object.keys(value ?? {}).sort());
  }

  /** fail-open 读取：按 workVersion/branch/generation 精确定位缓存文件；
   * 缺失/损坏返回对应状态，调用方回退关键词检索，不损坏作品。 */
  function load(rootPath, projectId, workVersionId, branchId, generation) {
    try {
      const dir = projectDir(rootPath, projectId);
      const file = path.join(dir, fileName(workVersionId, branchId, generation));
      if (!existsSync(file)) return { status: "missing" };
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

  /** 持久化缓存文件路径（边界校验后返回），供诊断与验收断言使用。 */
  function persistedCachePath(rootPath, projectId, workVersionId, branchId, generation) {
    const dir = projectDir(rootPath, projectId);
    return path.join(dir, fileName(workVersionId, branchId, generation));
  }

  /** 只读访问持久化缓存（路径边界在 projectDir 内校验），供验收与诊断使用。 */
  function readPersistedCache(rootPath, projectId, workVersionId, branchId, generation) {
    const file = path.join(projectDir(rootPath, projectId), fileName(workVersionId, branchId, generation));
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  }

  /** 仅供测试：把缓存文件写成损坏内容以验证 fail-open。 */
  function corruptPersistedCacheForTest(rootPath, projectId, workVersionId, branchId, generation) {
    const dir = projectDir(rootPath, projectId);
    const file = path.join(dir, fileName(workVersionId, branchId, generation));
    if (existsSync(file)) writeFileSync(file, "{broken-json", "utf8");
  }

  return { rebuild, load, clear, projectDir, readPersistedCache, persistedCachePath, corruptPersistedCacheForTest };
}
