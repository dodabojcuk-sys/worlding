import { allocateMonotonicOwnerId, listOwnerIds, resolveContinuityOwner, type ContinuityContext } from "./continuityFilesystem.ts";
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
import type { ContextReceipt, StoppingPoint } from "./continuityTypes.ts";
import {
  normalizeContextReceipt,
  normalizeStoppingPointSource,
  serializeStoppingPoint,
  stableJson
} from "./continuityValidation.ts";

const RECEIPT_CODEC: OwnerCodec<ContextReceipt> = {
  kind: "context-receipt",
  maximumBytes: 128 * 1024,
  normalizeSource(source, location) {
    const value = normalizeContextReceipt(JSON.parse(source) as unknown, {
      receiptId: location.owner.id,
      agentId: location.owner.agentId,
      projectId: location.owner.projectId ?? undefined
    });
    return { value, source: stableJson(value) };
  },
  serialize(value) {
    return stableJson(normalizeContextReceipt(value));
  }
};

const STOPPING_POINT_CODEC: OwnerCodec<StoppingPoint> = {
  kind: "stopping-point",
  maximumBytes: 32 * 1024,
  normalizeSource(source, location) {
    return normalizeStoppingPointSource(source, {
      stoppingPointId: location.owner.id,
      agentId: location.owner.agentId,
      projectId: location.owner.projectId ?? undefined
    });
  },
  serialize(value) {
    return serializeStoppingPoint(value);
  }
};

export async function allocateReceiptId(context: ContinuityContext): Promise<string> {
  return allocateMonotonicOwnerId(context, "context-receipt");
}

export async function createReceipt(context: ContinuityContext, receipt: ContextReceipt, metadata: OwnerWriteMetadata) {
  requireProjectContext(context);
  return createOwner(context, receipt.id, receipt, RECEIPT_CODEC, { ...metadata, source: "immutable-create" });
}

export async function readReceipt(context: ContinuityContext, receiptId: string) {
  requireProjectContext(context);
  return readOwner(context, receiptId, RECEIPT_CODEC);
}

export async function listReceiptMetadata(context: ContinuityContext) {
  requireProjectContext(context);
  const ids = await listOwnerIds(context, "context-receipt");
  return Promise.all(ids.map(async (id) => ({ id, relativePath: (await resolveContinuityOwner(context, "context-receipt", id)).relativePath })));
}

export async function listReceiptRevisions(context: ContinuityContext, receiptId: string) {
  return listOwnerRevisions(context, receiptId, RECEIPT_CODEC);
}

export async function previewReceiptRevision(context: ContinuityContext, receiptId: string, revisionId: string) {
  return previewOwnerRevision(context, receiptId, revisionId, RECEIPT_CODEC);
}

export async function deleteReceipt(context: ContinuityContext, receiptId: string, input: HardDeleteInput) {
  return hardDeleteOwner(context, receiptId, RECEIPT_CODEC, input);
}

export async function readReceiptTombstone(context: ContinuityContext, receiptId: string) {
  return readOwnerTombstone(context, receiptId, RECEIPT_CODEC);
}

export async function allocateStoppingPointId(context: ContinuityContext): Promise<string> {
  return allocateMonotonicOwnerId(context, "stopping-point");
}

export async function createStoppingPoint(context: ContinuityContext, stoppingPoint: StoppingPoint, metadata: OwnerWriteMetadata) {
  requireProjectContext(context);
  return createOwner(context, stoppingPoint.id, stoppingPoint, STOPPING_POINT_CODEC, { ...metadata, source: "create" });
}

export async function readStoppingPoint(context: ContinuityContext, stoppingPointId: string) {
  requireProjectContext(context);
  return readOwner(context, stoppingPointId, STOPPING_POINT_CODEC);
}

export async function listStoppingPoints(context: ContinuityContext) {
  requireProjectContext(context);
  return listOwners(context, STOPPING_POINT_CODEC);
}

export async function updateStoppingPoint(context: ContinuityContext, stoppingPointId: string, expectedContentHash: string, value: StoppingPoint, metadata: Omit<OwnerWriteMetadata, "source">) {
  return updateOwner(context, stoppingPointId, expectedContentHash, value, STOPPING_POINT_CODEC, { ...metadata, source: "update" });
}

export async function revokeStoppingPoint(context: ContinuityContext, stoppingPointId: string, expectedContentHash: string, metadata: Omit<OwnerWriteMetadata, "source">) {
  const current = await readStoppingPoint(context, stoppingPointId);
  if (!current) return { ok: false as const, conflict: true as const, code: "continuity-conflict" as const, current: null };
  return updateOwner(context, stoppingPointId, expectedContentHash, { ...current.value, state: "revoked" }, STOPPING_POINT_CODEC, { ...metadata, source: "revoke" });
}

export async function listStoppingPointRevisions(context: ContinuityContext, stoppingPointId: string) {
  return listOwnerRevisions(context, stoppingPointId, STOPPING_POINT_CODEC);
}

export async function previewStoppingPointRevision(context: ContinuityContext, stoppingPointId: string, revisionId: string) {
  return previewOwnerRevision(context, stoppingPointId, revisionId, STOPPING_POINT_CODEC);
}

export async function restoreStoppingPointRevision(context: ContinuityContext, stoppingPointId: string, expectedContentHash: string, revisionId: string, metadata: Omit<OwnerWriteMetadata, "source" | "restoredFromRevisionId">) {
  return restoreOwnerRevision(context, stoppingPointId, expectedContentHash, revisionId, STOPPING_POINT_CODEC, metadata);
}

export async function hardDeleteStoppingPoint(context: ContinuityContext, stoppingPointId: string, input: HardDeleteInput) {
  return hardDeleteOwner(context, stoppingPointId, STOPPING_POINT_CODEC, input);
}

export async function readStoppingPointTombstone(context: ContinuityContext, stoppingPointId: string) {
  return readOwnerTombstone(context, stoppingPointId, STOPPING_POINT_CODEC);
}

function requireProjectContext(context: ContinuityContext): void {
  if (context.scope !== "project" || !context.projectId) throw new Error("A project-local continuity context is required.");
}

export const contextReceiptCodec = RECEIPT_CODEC;
export const stoppingPointCodec = STOPPING_POINT_CODEC;
