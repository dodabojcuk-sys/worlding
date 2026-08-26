import type { ContinuityContext } from "./continuityFilesystem.ts";
import {
  createGlobalMemoryGrant,
  hardDeleteGlobalMemoryGrant,
  hardDeleteMemory,
  listGlobalMemoryGrantRevisions,
  listGlobalMemoryGrants,
  listMemories,
  listMemoryRevisions,
  previewGlobalMemoryGrantRevision,
  previewMemoryRevision,
  readGlobalMemoryGrant,
  readMemory,
  restoreGlobalMemoryGrantRevision,
  restoreMemoryRevision,
  revokeGlobalMemoryGrant,
  revokeMemory,
  updateMemory
} from "./memoryGrantRepositories.ts";
import { GLOBAL_MEMORY_GRANT_VERSION, type MemoryItem } from "./continuityTypes.ts";

export function createTianyiMemoryOperations(options: { rootPath: string; agentId?: string; now?: () => string }) {
  const agentId = requireId(options.agentId ?? "agent.tianyi");
  const now = options.now ?? (() => new Date().toISOString());
  const projectContext = (projectId: string): ContinuityContext => ({ rootPath: options.rootPath, agentId, scope: "project", projectId: requireProjectId(projectId) });
  const memoryContext = (projectId: string, scope: "author-global" | "project"): ContinuityContext => scope === "author-global" ? { rootPath: options.rootPath, agentId, scope } : projectContext(projectId);

  async function readTianyiMemory(input: { projectId: string; scope: "author-global" | "project"; memoryId: string }) {
    const result = await readMemory(memoryContext(input.projectId, input.scope), requireId(input.memoryId));
    return result ? dto(result) : null;
  }

  async function listTianyiMemories(input: { projectId: string; scope: "author-global" | "project" }) {
    return (await listMemories(memoryContext(input.projectId, input.scope))).map(dto);
  }

  async function editTianyiMemory(input: { projectId: string; scope: "author-global" | "project"; memoryId: string; expectedHash: string; operationId: string; statement: string; kind: MemoryItem["kind"]; sensitivity: MemoryItem["sensitivity"] }) {
    if (input.sensitivity === "restricted") throw new Error("Restricted Memory cannot be persisted.");
    const context = memoryContext(input.projectId, input.scope);
    const current = await readMemory(context, requireId(input.memoryId));
    if (!current) return conflict("memory", null, input.expectedHash);
    const value: MemoryItem = { ...current.value, body: requireStatement(input.statement), kind: input.kind, sensitivity: input.sensitivity, last_confirmed_revision: current.value.last_confirmed_revision + 1 };
    return result("memory", await updateMemory(context, input.memoryId, requireHash(input.expectedHash), value, { recordedAt: timestamp(now()), operationId: requireId(input.operationId) }), input.expectedHash);
  }

  async function revokeTianyiMemory(input: { projectId: string; scope: "author-global" | "project"; memoryId: string; expectedHash: string; operationId: string }) {
    return result("memory", await revokeMemory(memoryContext(input.projectId, input.scope), requireId(input.memoryId), requireHash(input.expectedHash), { recordedAt: timestamp(now()), operationId: requireId(input.operationId) }), input.expectedHash);
  }

  async function restoreTianyiMemory(input: { projectId: string; scope: "author-global" | "project"; memoryId: string; expectedHash: string; revisionId: string; operationId: string }) {
    return result("memory", await restoreMemoryRevision(memoryContext(input.projectId, input.scope), requireId(input.memoryId), requireHash(input.expectedHash), requireId(input.revisionId), { recordedAt: timestamp(now()), operationId: requireId(input.operationId) }), input.expectedHash);
  }

  async function hardDeleteTianyiMemory(input: { projectId: string; scope: "author-global" | "project"; memoryId: string; expectedHash: string; operationId: string }) {
    const write = await hardDeleteMemory(memoryContext(input.projectId, input.scope), requireId(input.memoryId), { expectedContentHash: requireHash(input.expectedHash), deletedAt: timestamp(now()), operationId: requireId(input.operationId) });
    return { owner: "memory", attempted: true, saved: write.ok, conflicted: write.conflict, rejected: false, alreadyCompleted: false, currentHash: null, expectedHash: input.expectedHash, recoveryAction: write.conflict ? "reload-owner-and-retry" : null, tombstone: write.ok ? write.tombstone : null };
  }

  async function listTianyiMemoryRevisions(input: { projectId: string; scope: "author-global" | "project"; memoryId: string }) {
    return listMemoryRevisions(memoryContext(input.projectId, input.scope), requireId(input.memoryId));
  }

  async function previewTianyiMemoryRevision(input: { projectId: string; scope: "author-global" | "project"; memoryId: string; revisionId: string }) {
    const preview = await previewMemoryRevision(memoryContext(input.projectId, input.scope), requireId(input.memoryId), requireId(input.revisionId));
    return { revision: preview.revision, source: preview.source };
  }

  async function listTianyiGlobalMemoryGrants(input: { projectId: string }) {
    return (await listGlobalMemoryGrants(projectContext(input.projectId))).map(dto);
  }

  async function createTianyiGlobalMemoryGrant(input: { projectId: string; memoryId: string; memoryContentHash: string; operationId: string }) {
    const context = projectContext(input.projectId);
    const memoryId = requireId(input.memoryId);
    const grant = await createGlobalMemoryGrant(context, { version: GLOBAL_MEMORY_GRANT_VERSION, id: `grant.${memoryId.split(".").at(-1)}`, agentId, memoryId, memoryContentHash: requireHash(input.memoryContentHash), projectId: input.projectId, state: "active", approvedRevision: 1 }, { source: "create", recordedAt: timestamp(now()), operationId: requireId(input.operationId) });
    return result("global-memory-grant", grant, null);
  }

  async function revokeTianyiGlobalMemoryGrant(input: { projectId: string; memoryId: string; expectedHash: string; operationId: string }) {
    return result("global-memory-grant", await revokeGlobalMemoryGrant(projectContext(input.projectId), requireId(input.memoryId), requireHash(input.expectedHash), { recordedAt: timestamp(now()), operationId: requireId(input.operationId) }), input.expectedHash);
  }

  async function restoreTianyiGlobalMemoryGrant(input: { projectId: string; memoryId: string; expectedHash: string; revisionId: string; operationId: string }) {
    return result("global-memory-grant", await restoreGlobalMemoryGrantRevision(projectContext(input.projectId), requireId(input.memoryId), requireHash(input.expectedHash), requireId(input.revisionId), { recordedAt: timestamp(now()), operationId: requireId(input.operationId) }), input.expectedHash);
  }

  async function hardDeleteTianyiGlobalMemoryGrant(input: { projectId: string; memoryId: string; expectedHash: string; operationId: string }) {
    const write = await hardDeleteGlobalMemoryGrant(projectContext(input.projectId), requireId(input.memoryId), { expectedContentHash: requireHash(input.expectedHash), deletedAt: timestamp(now()), operationId: requireId(input.operationId) });
    return { owner: "global-memory-grant", attempted: true, saved: write.ok, conflicted: write.conflict, rejected: false, alreadyCompleted: false, currentHash: null, expectedHash: input.expectedHash, recoveryAction: write.conflict ? "reload-owner-and-retry" : null, tombstone: write.ok ? write.tombstone : null };
  }

  async function listTianyiGlobalMemoryGrantRevisions(input: { projectId: string; memoryId: string }) { return listGlobalMemoryGrantRevisions(projectContext(input.projectId), requireId(input.memoryId)); }
  async function previewTianyiGlobalMemoryGrantRevision(input: { projectId: string; memoryId: string; revisionId: string }) { const preview = await previewGlobalMemoryGrantRevision(projectContext(input.projectId), requireId(input.memoryId), requireId(input.revisionId)); return { revision: preview.revision, source: preview.source }; }
  async function readTianyiGlobalMemoryGrant(input: { projectId: string; memoryId: string }) { const grant = await readGlobalMemoryGrant(projectContext(input.projectId), requireId(input.memoryId)); return grant ? dto(grant) : null; }

  return { readTianyiMemory, listTianyiMemories, editTianyiMemory, revokeTianyiMemory, restoreTianyiMemory, hardDeleteTianyiMemory, listTianyiMemoryRevisions, previewTianyiMemoryRevision, listTianyiGlobalMemoryGrants, readTianyiGlobalMemoryGrant, createTianyiGlobalMemoryGrant, revokeTianyiGlobalMemoryGrant, restoreTianyiGlobalMemoryGrant, hardDeleteTianyiGlobalMemoryGrant, listTianyiGlobalMemoryGrantRevisions, previewTianyiGlobalMemoryGrantRevision };
}

function dto<T>(result: { value: T; contentHash: string; byteLength: number }) { return { value: structuredClone(result.value), contentHash: result.contentHash, byteLength: result.byteLength }; }
function result(owner: string, write: { ok: boolean; conflict: boolean; current?: { contentHash: string } | null }, expectedHash: string | null) { return { owner, attempted: true, saved: write.ok, conflicted: write.conflict, rejected: false, alreadyCompleted: false, currentHash: write.current?.contentHash ?? null, expectedHash, recoveryAction: write.conflict ? "reload-owner-and-retry" : null }; }
function conflict(owner: string, currentHash: string | null, expectedHash: string | null) { return { owner, attempted: true, saved: false, conflicted: true, rejected: false, alreadyCompleted: false, currentHash, expectedHash, recoveryAction: "reload-owner-and-retry" }; }
function requireId(value: unknown): string { if (typeof value !== "string" || value.length > 96 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)) throw new Error("Product identifier is invalid."); return value; }
function requireProjectId(value: unknown): string { if (typeof value !== "string" || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) throw new Error("Project identifier is invalid."); return value; }
function requireHash(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("Expected hash is invalid."); return value; }
function timestamp(value: string): string { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) throw new Error("Operation timestamp is invalid."); return value; }
function requireStatement(value: unknown): string { if (typeof value !== "string") throw new Error("Memory statement is invalid."); const text = value.normalize("NFC").trim(); if (!text || [...text].length > 2_000 || /\n\s*\n|^#{1,6}\s|^```/mu.test(text)) throw new Error("Memory statement is invalid."); return text; }
