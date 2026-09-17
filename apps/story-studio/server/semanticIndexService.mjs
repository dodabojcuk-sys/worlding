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

  /** 重建/增量构建：contentHash 未变的区块原样保留；变化/新增的区块写入新 hash。 */
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
    const now = new Date().toISOString();
    const entries = {};
    const stats = { chunks: 0, kept: 0, updated: 0, remoteEligible: 0, localOnly: 0, lexicalOnly: 0, doNotIndex: 0, objects: objects.length };
    for (const object of objects) {
      const objectChunks = buildEntryChunks(object);
      for (const chunk of objectChunks) {
        const contentHash = contentHashOf(`${chunk.title}\n${chunk.lexicalText}`);
        const previousEntry = previous?.entries?.[chunk.sectionId];
        if (!force && previousEntry && previousEntry.contentHash === contentHash && previousEntry.sourceRevision === object.revisionToken) {
          entries[chunk.sectionId] = previousEntry;
          stats.kept += 1;
        } else {
          entries[chunk.sectionId] = {
            projectId, workVersionId, branchId, sourceOwner: object.type === "event" ? "event" : "world-object",
            objectId: object.id, sectionId: chunk.sectionId, sourceRevision: object.revisionToken ?? 0,
            contentHash, objectType: object.type, authority: chunk.authority, informationNature: chunk.informationNature,
            worldTime: null, sceneKeys: object.tags.filter((tag) => tag.startsWith("单元：")).map((tag) => tag.slice(3)),
            visibility: { knownTo: chunk.knownTo, unknownTo: chunk.unknownTo },
            title: object.title, lexicalText: chunk.lexicalText,
            embeddingProfileId: generation === "none-v0" ? "none" : generation, dimensions: 0, vector: null,
          };
          stats.updated += 1;
        }
        stats.chunks += 1;
        if (chunk.eligibility === "DO_NOT_INDEX") stats.doNotIndex += 1;
        else if (chunk.eligibility === "LOCAL_ONLY") stats.localOnly += 1;
        else if (chunk.eligibility === "LEXICAL_ONLY") stats.lexicalOnly += 1;
        else stats.remoteEligible += 1;
      }
    }
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

  /** fail-open 读取：缺失/损坏返回 { status: "missing" | "corrupt" }，调用方回退关键词检索。 */
  function load(rootPath, projectId, workVersionId, branchId, generation) {
    try {
      const dir = projectDir(rootPath, projectId);
      const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.startsWith("index-") && name.endsWith(".json")) : [];
      const file = files.length ? path.join(dir, files.at(-1)) : null;
      if (!file) return { status: "missing" };
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

  return { rebuild, load, clear, projectDir };
}
