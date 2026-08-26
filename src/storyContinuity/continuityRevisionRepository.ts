import path from "node:path";

import {
  atomicWriteSecure,
  ensureSecureDirectory,
  readSecurePathUtf8,
  removeSecureTree,
  type ResolvedContinuityOwner
} from "./continuityFilesystem.ts";
import {
  HISTORY_VERSION,
  type ContinuityHistoryManifest,
  type ContinuityOwnerRef,
  type ContinuityRevision
} from "./continuityTypes.ts";
import { parseStrictJson, requireHash, sha256, stableJson } from "./continuityValidation.ts";

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REVISION_ID_PATTERN = /^revision\.\d{6}$/u;

export type RecordRevisionInput = {
  source: ContinuityRevision["source"];
  recordedAt: string;
  restoredFromRevisionId?: string | null;
  operationId?: string | null;
};

export async function recordContinuityRevision(location: ResolvedContinuityOwner, content: string, input: RecordRevisionInput): Promise<ContinuityRevision> {
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_SNAPSHOT_BYTES) throw new Error("Continuity revision snapshot is too large.");
  const manifest = await readContinuityHistoryManifest(location);
  const contentHash = sha256(content);
  const latest = manifest.revisions.at(-1);
  if (latest?.contentHash === contentHash) return structuredClone(latest);
  const sequence = manifest.nextSequence;
  const revision: ContinuityRevision = {
    id: `revision.${String(sequence).padStart(6, "0")}`,
    sequence,
    contentHash,
    byteLength,
    source: input.source,
    recordedAt: requireTimestamp(input.recordedAt),
    restoredFromRevisionId: input.restoredFromRevisionId == null ? null : requireRevisionId(input.restoredFromRevisionId),
    operationId: input.operationId == null ? null : requireOperationId(input.operationId)
  };
  await ensureSecureDirectory(location.configuredRoot, path.join(location.historyRoot, "revisions"));
  await atomicWriteSecure(location.configuredRoot, snapshotPath(location, revision.id), content, { replace: false });
  const next: ContinuityHistoryManifest = {
    ...manifest,
    nextSequence: sequence + 1,
    revisions: [...manifest.revisions, revision]
  };
  await atomicWriteSecure(location.configuredRoot, manifestPath(location), stableJson(next));
  return structuredClone(revision);
}

export async function listContinuityRevisions(location: ResolvedContinuityOwner): Promise<ContinuityRevision[]> {
  return structuredClone((await readContinuityHistoryManifest(location)).revisions);
}

export async function previewContinuityRevision(location: ResolvedContinuityOwner, revisionId: string): Promise<{ revision: ContinuityRevision; source: string }> {
  const id = requireRevisionId(revisionId);
  const manifest = await readContinuityHistoryManifest(location);
  const revision = manifest.revisions.find((item) => item.id === id);
  if (!revision) throw new Error("Continuity revision does not exist.");
  const source = await readSecurePathUtf8(location.configuredRoot, snapshotPath(location, id), MAX_SNAPSHOT_BYTES);
  if (source === null || sha256(source) !== revision.contentHash || Buffer.byteLength(source, "utf8") !== revision.byteLength) {
    throw new Error("Continuity revision snapshot failed integrity validation.");
  }
  return { revision: structuredClone(revision), source };
}

export async function latestContinuityRevisionSequence(location: ResolvedContinuityOwner): Promise<number> {
  return (await readContinuityHistoryManifest(location)).revisions.at(-1)?.sequence ?? 0;
}

export async function purgeContinuityHistory(location: ResolvedContinuityOwner): Promise<void> {
  await removeSecureTree(location.configuredRoot, location.historyRoot);
}

async function readContinuityHistoryManifest(location: ResolvedContinuityOwner): Promise<ContinuityHistoryManifest> {
  const source = await readSecurePathUtf8(location.configuredRoot, manifestPath(location), MAX_MANIFEST_BYTES);
  if (source === null) return defaultManifest(location.owner);
  const value = parseStrictJson(source, MAX_MANIFEST_BYTES, "Continuity history manifest");
  const manifest = requirePlainObject(value, "Continuity history manifest");
  requireExactFields(manifest, new Set(["version", "owner", "nextSequence", "revisions"]), "Continuity history manifest");
  if (manifest.version !== HISTORY_VERSION) throw new Error("Continuity history version is unsupported.");
  const owner = normalizeOwner(manifest.owner);
  if (!sameOwner(owner, location.owner)) throw new Error("Continuity history owner does not match its path.");
  if (typeof manifest.nextSequence !== "number" || !Number.isSafeInteger(manifest.nextSequence) || manifest.nextSequence < 1) throw new Error("Continuity history sequence is invalid.");
  if (!Array.isArray(manifest.revisions) || manifest.revisions.length > 20_000) throw new Error("Continuity history revisions are invalid.");
  const revisions = manifest.revisions.map(normalizeRevision);
  for (let index = 0; index < revisions.length; index += 1) {
    if (revisions[index].sequence !== index + 1 || revisions[index].id !== `revision.${String(index + 1).padStart(6, "0")}`) throw new Error("Continuity history sequence is not monotonic.");
  }
  if (manifest.nextSequence !== revisions.length + 1) throw new Error("Continuity history next sequence is invalid.");
  return { version: HISTORY_VERSION, owner, nextSequence: manifest.nextSequence, revisions };
}

function defaultManifest(owner: ContinuityOwnerRef): ContinuityHistoryManifest {
  return { version: HISTORY_VERSION, owner: structuredClone(owner), nextSequence: 1, revisions: [] };
}

function normalizeOwner(value: unknown): ContinuityOwnerRef {
  const input = requirePlainObject(value, "Continuity history owner");
  requireExactFields(input, new Set(["kind", "id", "agentId", "scope", "projectId"]), "Continuity history owner");
  if (!["persona", "relationship-policy", "memory", "global-memory-grant", "session", "context-receipt", "stopping-point"].includes(String(input.kind))) throw new Error("Continuity history owner kind is invalid.");
  if (typeof input.id !== "string" || typeof input.agentId !== "string") throw new Error("Continuity history owner identifier is invalid.");
  if (input.scope !== "author-global" && input.scope !== "project") throw new Error("Continuity history owner scope is invalid.");
  if (input.projectId !== null && typeof input.projectId !== "string") throw new Error("Continuity history project identifier is invalid.");
  return input as ContinuityOwnerRef;
}

function normalizeRevision(value: unknown): ContinuityRevision {
  const input = requirePlainObject(value, "Continuity revision");
  requireExactFields(input, new Set(["id", "sequence", "contentHash", "byteLength", "source", "recordedAt", "restoredFromRevisionId", "operationId"]), "Continuity revision");
  const id = requireRevisionId(input.id);
  if (typeof input.sequence !== "number" || !Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new Error("Continuity revision sequence is invalid.");
  if (typeof input.byteLength !== "number" || !Number.isSafeInteger(input.byteLength) || input.byteLength < 0 || input.byteLength > MAX_SNAPSHOT_BYTES) throw new Error("Continuity revision size is invalid.");
  if (!["create", "update", "revoke", "restore", "append", "immutable-create"].includes(String(input.source))) throw new Error("Continuity revision source is invalid.");
  return {
    id,
    sequence: input.sequence,
    contentHash: requireHash(input.contentHash, "Continuity revision hash"),
    byteLength: input.byteLength,
    source: input.source as ContinuityRevision["source"],
    recordedAt: requireTimestamp(input.recordedAt),
    restoredFromRevisionId: input.restoredFromRevisionId === null ? null : requireRevisionId(input.restoredFromRevisionId),
    operationId: input.operationId === null ? null : requireOperationId(input.operationId)
  };
}

function sameOwner(left: ContinuityOwnerRef, right: ContinuityOwnerRef): boolean {
  return left.kind === right.kind && left.id === right.id && left.agentId === right.agentId && left.scope === right.scope && left.projectId === right.projectId;
}

function manifestPath(location: ResolvedContinuityOwner): string {
  return path.join(location.historyRoot, "manifest.json");
}

function snapshotPath(location: ResolvedContinuityOwner, revisionId: string): string {
  return path.join(location.historyRoot, "revisions", `${requireRevisionId(revisionId)}.snapshot`);
}

function requireRevisionId(value: unknown): string {
  if (typeof value !== "string" || !REVISION_ID_PATTERN.test(value)) throw new Error("Continuity revision identifier is invalid.");
  return value;
}

function requireOperationId(value: unknown): string {
  if (typeof value !== "string" || value.length > 180 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)) throw new Error("Continuity operation identifier is invalid.");
  return value;
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new Error("Continuity revision timestamp is invalid.");
  return value;
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

function requireExactFields(value: Record<string, unknown>, fields: Set<string>, label: string): void {
  for (const key of Object.keys(value)) if (!fields.has(key)) throw new Error(`${label} contains an unknown field.`);
  for (const field of fields) if (!Object.hasOwn(value, field)) throw new Error(`${label} is missing a required field.`);
}
