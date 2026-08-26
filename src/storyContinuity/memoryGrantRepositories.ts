import { allocateMonotonicOwnerId, type ContinuityContext } from "./continuityFilesystem.ts";
import { hardDeleteOwner, readOwnerTombstone, type HardDeleteInput } from "./continuityDeletion.ts";
import type { OwnerCodec, OwnerWriteMetadata } from "./continuityOwnerRepository.ts";
import {
  createOwner,
  listOwnerRevisions,
  listOwners,
  previewOwnerRevision,
  readOwner,
  restoreOwnerRevision,
  updateOwner
} from "./continuityOwnerRepository.ts";
import type { GlobalMemoryGrant, MemoryItem } from "./continuityTypes.ts";
import {
  normalizeGlobalMemoryGrant,
  normalizeMemorySource,
  serializeMemory,
  stableJson
} from "./continuityValidation.ts";

const MEMORY_CODEC: OwnerCodec<MemoryItem> = {
  kind: "memory",
  maximumBytes: 32 * 1024,
  normalizeSource(source, location) {
    return normalizeMemorySource(source, {
      agentId: location.owner.agentId,
      memoryId: location.owner.id,
      scope: location.owner.scope,
      projectId: location.owner.projectId ?? undefined
    });
  },
  serialize(value) {
    return serializeMemory(value);
  }
};

const GRANT_CODEC: OwnerCodec<GlobalMemoryGrant> = {
  kind: "global-memory-grant",
  maximumBytes: 32 * 1024,
  normalizeSource(source, location) {
    const value = normalizeGlobalMemoryGrant(JSON.parse(source) as unknown, {
      agentId: location.owner.agentId,
      memoryId: location.owner.id,
      projectId: location.owner.projectId ?? undefined
    });
    return { value, source: stableJson(value) };
  },
  serialize(value) {
    return stableJson(normalizeGlobalMemoryGrant(value));
  }
};

export async function allocateMemoryId(context: ContinuityContext): Promise<string> {
  return allocateMonotonicOwnerId(context, "memory");
}

export async function createMemory(context: ContinuityContext, memory: MemoryItem, metadata: OwnerWriteMetadata) {
  assertDurableMemory(memory);
  return createOwner(context, memory.id, memory, MEMORY_CODEC, { ...metadata, source: "create" });
}

export async function readMemory(context: ContinuityContext, memoryId: string) {
  return readOwner(context, memoryId, MEMORY_CODEC);
}

export async function listMemories(context: ContinuityContext) {
  return listOwners(context, MEMORY_CODEC);
}

export async function updateMemory(context: ContinuityContext, memoryId: string, expectedContentHash: string, memory: MemoryItem, metadata: Omit<OwnerWriteMetadata, "source">) {
  assertDurableMemory(memory);
  if (memory.id !== memoryId) throw new Error("Memory identifier does not match the requested owner.");
  return updateOwner(context, memoryId, expectedContentHash, memory, MEMORY_CODEC, { ...metadata, source: "update" });
}

export async function revokeMemory(context: ContinuityContext, memoryId: string, expectedContentHash: string, metadata: Omit<OwnerWriteMetadata, "source">) {
  const current = await readMemory(context, memoryId);
  if (!current) return { ok: false as const, conflict: true as const, code: "continuity-conflict" as const, current: null };
  return updateOwner(context, memoryId, expectedContentHash, { ...current.value, state: "revoked" }, MEMORY_CODEC, { ...metadata, source: "revoke" });
}

export async function listMemoryRevisions(context: ContinuityContext, memoryId: string) {
  return listOwnerRevisions(context, memoryId, MEMORY_CODEC);
}

export async function previewMemoryRevision(context: ContinuityContext, memoryId: string, revisionId: string) {
  return previewOwnerRevision(context, memoryId, revisionId, MEMORY_CODEC);
}

export async function restoreMemoryRevision(context: ContinuityContext, memoryId: string, expectedContentHash: string, revisionId: string, metadata: Omit<OwnerWriteMetadata, "source" | "restoredFromRevisionId">) {
  return restoreOwnerRevision(context, memoryId, expectedContentHash, revisionId, MEMORY_CODEC, metadata);
}

export async function hardDeleteMemory(context: ContinuityContext, memoryId: string, input: HardDeleteInput) {
  return hardDeleteOwner(context, memoryId, MEMORY_CODEC, input);
}

export async function readMemoryTombstone(context: ContinuityContext, memoryId: string) {
  return readOwnerTombstone(context, memoryId, MEMORY_CODEC);
}

export async function createGlobalMemoryGrant(projectContext: ContinuityContext, grant: GlobalMemoryGrant, metadata: OwnerWriteMetadata) {
  requireProjectContext(projectContext);
  const globalMemory = await readMemory({ rootPath: projectContext.rootPath, agentId: projectContext.agentId, scope: "author-global" }, grant.memoryId);
  if (!globalMemory || globalMemory.value.state !== "active" || globalMemory.value.approval_state !== "author-approved" || globalMemory.contentHash !== grant.memoryContentHash) {
    throw new Error("Global Memory grant does not match an active approved Memory.");
  }
  return createOwner(projectContext, grant.memoryId, grant, GRANT_CODEC, { ...metadata, source: "create" });
}

export async function readGlobalMemoryGrant(projectContext: ContinuityContext, memoryId: string) {
  requireProjectContext(projectContext);
  return readOwner(projectContext, memoryId, GRANT_CODEC);
}

export async function listGlobalMemoryGrants(projectContext: ContinuityContext) {
  requireProjectContext(projectContext);
  return listOwners(projectContext, GRANT_CODEC);
}

export async function revokeGlobalMemoryGrant(projectContext: ContinuityContext, memoryId: string, expectedContentHash: string, metadata: Omit<OwnerWriteMetadata, "source">) {
  const current = await readGlobalMemoryGrant(projectContext, memoryId);
  if (!current) return { ok: false as const, conflict: true as const, code: "continuity-conflict" as const, current: null };
  return updateOwner(projectContext, memoryId, expectedContentHash, { ...current.value, state: "revoked" }, GRANT_CODEC, { ...metadata, source: "revoke" });
}

export async function listGlobalMemoryGrantRevisions(projectContext: ContinuityContext, memoryId: string) {
  requireProjectContext(projectContext);
  return listOwnerRevisions(projectContext, memoryId, GRANT_CODEC);
}

export async function previewGlobalMemoryGrantRevision(projectContext: ContinuityContext, memoryId: string, revisionId: string) {
  requireProjectContext(projectContext);
  return previewOwnerRevision(projectContext, memoryId, revisionId, GRANT_CODEC);
}

export async function restoreGlobalMemoryGrantRevision(projectContext: ContinuityContext, memoryId: string, expectedContentHash: string, revisionId: string, metadata: Omit<OwnerWriteMetadata, "source" | "restoredFromRevisionId">) {
  return restoreOwnerRevision(projectContext, memoryId, expectedContentHash, revisionId, GRANT_CODEC, metadata);
}

export async function hardDeleteGlobalMemoryGrant(projectContext: ContinuityContext, memoryId: string, input: HardDeleteInput) {
  return hardDeleteOwner(projectContext, memoryId, GRANT_CODEC, input);
}

export async function readAuthorizedGlobalMemory(projectContext: ContinuityContext, memoryId: string) {
  requireProjectContext(projectContext);
  const grant = await readGlobalMemoryGrant(projectContext, memoryId);
  if (!grant || grant.value.state !== "active") return { authorized: false as const, reason: "missing-or-revoked-grant" as const, memory: null };
  const memory = await readMemory({ rootPath: projectContext.rootPath, agentId: projectContext.agentId, scope: "author-global" }, memoryId);
  if (!memory || memory.value.state !== "active" || memory.value.approval_state !== "author-approved") return { authorized: false as const, reason: "memory-unavailable" as const, memory: null };
  if (memory.contentHash !== grant.value.memoryContentHash) return { authorized: false as const, reason: "stale-grant" as const, memory: null };
  return { authorized: true as const, reason: null, memory };
}

function assertDurableMemory(memory: MemoryItem): void {
  if (memory.approval_state !== "author-approved") throw new Error("Only author-approved Memory may be persisted.");
  if (memory.sensitivity === "restricted") throw new Error("Restricted Memory cannot be persisted.");
}

function requireProjectContext(context: ContinuityContext): void {
  if (context.scope !== "project" || !context.projectId) throw new Error("A project-local continuity context is required.");
}

export const memoryCodec = MEMORY_CODEC;
export const globalMemoryGrantCodec = GRANT_CODEC;
