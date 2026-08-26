import {
  listOwnerIds,
  readSecureUtf8,
  resolveContinuityOwner,
  securePathExists,
  withOwnerLock,
  writeSecureUtf8,
  type ContinuityContext,
  type ResolvedContinuityOwner
} from "./continuityFilesystem.ts";
import {
  listContinuityRevisions,
  previewContinuityRevision,
  recordContinuityRevision,
  type RecordRevisionInput
} from "./continuityRevisionRepository.ts";
import type {
  ContinuityOwnerKind,
  ContinuityReadResult,
  ContinuityRevision,
  ContinuityWriteResult
} from "./continuityTypes.ts";
import { requireHash, sha256 } from "./continuityValidation.ts";

export type OwnerCodec<T> = {
  kind: ContinuityOwnerKind;
  maximumBytes: number;
  normalizeSource(source: string, location: ResolvedContinuityOwner): { value: T; source: string };
  serialize(value: T, location: ResolvedContinuityOwner): string;
};

export type OwnerWriteMetadata = RecordRevisionInput;

export async function readOwner<T>(context: ContinuityContext, ownerId: string, codec: OwnerCodec<T>): Promise<ContinuityReadResult<T> | null> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId);
  return readResolvedOwner(location, codec);
}

export async function listOwners<T>(context: ContinuityContext, codec: OwnerCodec<T>): Promise<Array<ContinuityReadResult<T>>> {
  const ids = await listOwnerIds(context, codec.kind);
  const result: Array<ContinuityReadResult<T>> = [];
  for (const id of ids) {
    const owner = await readOwner(context, id, codec);
    if (owner) result.push(owner);
  }
  return result;
}

export async function createOwner<T>(context: ContinuityContext, ownerId: string, value: T, codec: OwnerCodec<T>, metadata: OwnerWriteMetadata): Promise<ContinuityWriteResult<T>> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId, { createDirectories: true });
  return withOwnerLock(location, async () => {
    const current = await readResolvedOwner(location, codec);
    if (current || await securePathExists(location.configuredRoot, location.tombstonePath)) {
      return { ok: false, conflict: true, code: "continuity-conflict", current };
    }
    const normalized = normalizeSerialized(value, codec, location);
    await writeSecureUtf8(location, normalized.source);
    const revision = await recordContinuityRevision(location, normalized.source, metadata);
    return { ok: true, conflict: false, current: asReadResult(location, normalized.value, normalized.source), revision };
  });
}

export async function updateOwner<T>(context: ContinuityContext, ownerId: string, expectedContentHash: string, value: T, codec: OwnerCodec<T>, metadata: OwnerWriteMetadata): Promise<ContinuityWriteResult<T>> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId, { createDirectories: true });
  const expected = requireHash(expectedContentHash);
  return withOwnerLock(location, async () => {
    const current = await readResolvedOwner(location, codec);
    if (!current || current.contentHash !== expected) return { ok: false, conflict: true, code: "continuity-conflict", current };
    const normalized = normalizeSerialized(value, codec, location);
    await writeSecureUtf8(location, normalized.source);
    const revision = await recordContinuityRevision(location, normalized.source, metadata);
    return { ok: true, conflict: false, current: asReadResult(location, normalized.value, normalized.source), revision };
  });
}

export async function listOwnerRevisions(context: ContinuityContext, ownerId: string, codec: OwnerCodec<unknown>): Promise<ContinuityRevision[]> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId);
  return listContinuityRevisions(location);
}

export async function previewOwnerRevision(context: ContinuityContext, ownerId: string, revisionId: string, codec: OwnerCodec<unknown>): Promise<{ revision: ContinuityRevision; source: string }> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId);
  return previewContinuityRevision(location, revisionId);
}

export async function restoreOwnerRevision<T>(context: ContinuityContext, ownerId: string, expectedContentHash: string, revisionId: string, codec: OwnerCodec<T>, metadata: Omit<OwnerWriteMetadata, "source" | "restoredFromRevisionId">): Promise<ContinuityWriteResult<T>> {
  const location = await resolveContinuityOwner(context, codec.kind, ownerId, { createDirectories: true });
  const expected = requireHash(expectedContentHash);
  return withOwnerLock(location, async () => {
    const current = await readResolvedOwner(location, codec);
    if (!current || current.contentHash !== expected) return { ok: false, conflict: true, code: "continuity-conflict", current };
    const snapshot = await previewContinuityRevision(location, revisionId);
    const normalized = codec.normalizeSource(snapshot.source, location);
    await writeSecureUtf8(location, normalized.source);
    const revision = await recordContinuityRevision(location, normalized.source, {
      ...metadata,
      source: "restore",
      restoredFromRevisionId: snapshot.revision.id
    });
    return { ok: true, conflict: false, current: asReadResult(location, normalized.value, normalized.source), revision };
  });
}

export async function readResolvedOwner<T>(location: ResolvedContinuityOwner, codec: OwnerCodec<T>): Promise<ContinuityReadResult<T> | null> {
  const source = await readSecureUtf8(location, codec.maximumBytes);
  if (source === null) return null;
  const normalized = codec.normalizeSource(source, location);
  if (source !== normalized.source) throw new Error("Continuity owner is not in canonical form.");
  return asReadResult(location, normalized.value, source);
}

function normalizeSerialized<T>(value: T, codec: OwnerCodec<T>, location: ResolvedContinuityOwner): { value: T; source: string } {
  const serialized = codec.serialize(value, location);
  if (Buffer.byteLength(serialized, "utf8") > codec.maximumBytes) throw new Error("Continuity owner exceeds its size limit.");
  return codec.normalizeSource(serialized, location);
}

function asReadResult<T>(location: ResolvedContinuityOwner, value: T, source: string): ContinuityReadResult<T> {
  return {
    owner: structuredClone(location.owner),
    value: structuredClone(value),
    contentHash: sha256(source),
    relativePath: location.relativePath,
    byteLength: Buffer.byteLength(source, "utf8")
  };
}
