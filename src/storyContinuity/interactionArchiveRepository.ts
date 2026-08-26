import path from "node:path";

import {
  allocateMonotonicOwnerId,
  listOwnerIds,
  purgeTemporaryFiles,
  resolveContinuityOwner,
  withOwnerLock,
  writeSecureUtf8,
  type ContinuityContext
} from "./continuityFilesystem.ts";
import {
  hardDeleteOwner,
  purgeDerivedIndexes,
  purgeStagedOwnerCopies,
  readOwnerTombstone,
  type HardDeleteInput
} from "./continuityDeletion.ts";
import type { OwnerCodec, OwnerWriteMetadata } from "./continuityOwnerRepository.ts";
import {
  createOwner,
  listOwnerRevisions,
  previewOwnerRevision,
  readOwner,
  readResolvedOwner,
  updateOwner
} from "./continuityOwnerRepository.ts";
import { purgeContinuityHistory, recordContinuityRevision } from "./continuityRevisionRepository.ts";
import type { InteractionEvent } from "./continuityTypes.ts";
import { normalizeInteractionEvent, requireHash, stableJson } from "./continuityValidation.ts";

const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const MAX_EVENT_BYTES = 32 * 1024;
const MAX_EVENTS = 5_000;

const ARCHIVE_CODEC: OwnerCodec<InteractionEvent[]> = {
  kind: "session",
  maximumBytes: MAX_SESSION_BYTES,
  normalizeSource(source, location) {
    const lines = source.endsWith("\n") ? source.slice(0, -1).split("\n") : source.split("\n");
    if (lines.length > MAX_EVENTS) throw new Error("Interaction Archive has too many events.");
    const events = lines.filter(Boolean).map((line, index) => {
      if (Buffer.byteLength(line, "utf8") > MAX_EVENT_BYTES) throw new Error("Interaction event is too large.");
      return normalizeInteractionEvent(JSON.parse(line) as unknown, { sessionId: location.owner.id, sequence: index + 1 });
    });
    if (new Set(events.map((event) => event.eventId)).size !== events.length) throw new Error("Interaction event identifiers must be unique.");
    const canonical = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    if (Buffer.byteLength(canonical, "utf8") > MAX_SESSION_BYTES) throw new Error("Interaction Archive is too large.");
    return { value: events, source: canonical };
  },
  serialize(events, location) {
    return `${events.map((event, index) => JSON.stringify(normalizeInteractionEvent(event, { sessionId: location.owner.id, sequence: index + 1 }))).join("\n")}\n`;
  }
};

export async function allocateSessionId(context: ContinuityContext): Promise<string> {
  return allocateMonotonicOwnerId(context, "session");
}

export async function createSession(context: ContinuityContext, event: InteractionEvent, metadata: OwnerWriteMetadata) {
  requireProjectContext(context);
  if (event.type !== "session-opened" || event.sequence !== 1) throw new Error("A session must begin with sequence 1 session-opened.");
  return createOwner(context, event.sessionId, [event], ARCHIVE_CODEC, { ...metadata, source: "create" });
}

export async function appendSessionEvent(context: ContinuityContext, sessionId: string, expectedContentHash: string, expectedNextSequence: number, event: InteractionEvent, metadata: Omit<OwnerWriteMetadata, "source">) {
  requireProjectContext(context);
  const current = await readSession(context, sessionId);
  if (!current || current.contentHash !== expectedContentHash || current.value.length + 1 !== expectedNextSequence) {
    return { ok: false as const, conflict: true as const, code: "continuity-conflict" as const, current };
  }
  normalizeInteractionEvent(event, { sessionId, sequence: expectedNextSequence });
  return updateOwner(context, sessionId, expectedContentHash, [...current.value, event], ARCHIVE_CODEC, { ...metadata, source: "append" });
}

export async function readSession(context: ContinuityContext, sessionId: string) {
  requireProjectContext(context);
  return readOwner(context, sessionId, ARCHIVE_CODEC);
}

export async function readSessionRange(context: ContinuityContext, sessionId: string, startSequence: number, limit: number) {
  if (!Number.isSafeInteger(startSequence) || startSequence < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Interaction Archive range is invalid.");
  const current = await readSession(context, sessionId);
  if (!current) return null;
  return { ...current, value: current.value.slice(startSequence - 1, startSequence - 1 + limit) };
}

export async function listSessionMetadata(context: ContinuityContext) {
  requireProjectContext(context);
  const ids = await listOwnerIds(context, "session");
  const result: Array<{ id: string; relativePath: string }> = [];
  for (const id of ids) {
    const location = await resolveContinuityOwner(context, "session", id);
    result.push({ id, relativePath: location.relativePath });
  }
  return result;
}

export async function listSessionRevisions(context: ContinuityContext, sessionId: string) {
  return listOwnerRevisions(context, sessionId, ARCHIVE_CODEC);
}

export async function previewSessionRevision(context: ContinuityContext, sessionId: string, revisionId: string) {
  return previewOwnerRevision(context, sessionId, revisionId, ARCHIVE_CODEC);
}

export async function hardDeleteSession(context: ContinuityContext, sessionId: string, input: HardDeleteInput) {
  return hardDeleteOwner(context, sessionId, ARCHIVE_CODEC, input);
}

export async function hardDeleteSessionMessage(context: ContinuityContext, sessionId: string, input: {
  eventId: string;
  expectedContentHash: string;
  deletedAt: string;
  operationId: string;
}) {
  requireProjectContext(context);
  const location = await resolveContinuityOwner(context, "session", sessionId, { createDirectories: true });
  const expectedContentHash = requireHash(input.expectedContentHash, "Archive Session expected hash");
  const eventId = requireArchiveId(input.eventId, "Archive event identifier");
  const operationId = requireArchiveId(input.operationId, "Archive deletion operation identifier");
  const deletedAt = requireArchiveTimestamp(input.deletedAt);
  return withOwnerLock(location, async () => {
    const current = await readResolvedOwner(location, ARCHIVE_CODEC);
    if (!current) return { ok: false as const, conflict: true as const, code: "continuity-conflict" as const, current: null };
    const index = current.value.findIndex((event) => event.eventId === eventId);
    if (index < 0) throw new Error("Archive message does not exist.");
    const selected = current.value[index];
    const alreadyCompleted = selected.type === "message-deleted" && selected.operationId === operationId;
    if (!alreadyCompleted && current.contentHash !== expectedContentHash) {
      return { ok: false as const, conflict: true as const, code: "continuity-conflict" as const, current };
    }
    if (!alreadyCompleted && !["author-message", "tianyi-response", "bounded-action", "retained-message"].includes(selected.type)) {
      throw new Error("Only a visible Archive message can be deleted individually.");
    }
    if (!alreadyCompleted) {
      const marker: InteractionEvent = {
        version: selected.version,
        eventId: selected.eventId,
        sessionId: selected.sessionId,
        sequence: selected.sequence,
        type: "message-deleted",
        recordedAt: selected.recordedAt,
        actor: "system",
        content: "",
        responseClassifications: [],
        memoryCandidateIds: [],
        receiptId: null,
        operationId
      };
      const next = [...current.value];
      next[index] = marker;
      const source = ARCHIVE_CODEC.serialize(next, location);
      const normalized = ARCHIVE_CODEC.normalizeSource(source, location);
      await writeSecureUtf8(location, normalized.source);
    }
    await purgeContinuityHistory(location);
    await purgeTemporaryFiles(location.configuredRoot, path.dirname(location.absolutePath), path.basename(location.absolutePath));
    await purgeDerivedIndexes(location);
    await purgeStagedOwnerCopies(location);
    const surviving = await readResolvedOwner(location, ARCHIVE_CODEC);
    if (!surviving) throw new Error("Archive message deletion did not preserve the Session owner.");
    await recordContinuityRevision(location, ARCHIVE_CODEC.serialize(surviving.value, location), {
      source: "update",
      recordedAt: deletedAt,
      operationId
    });
    return { ok: true as const, conflict: false as const, alreadyCompleted, current: surviving, deletedEventId: eventId };
  });
}

export async function readSessionTombstone(context: ContinuityContext, sessionId: string) {
  return readOwnerTombstone(context, sessionId, ARCHIVE_CODEC);
}

function requireProjectContext(context: ContinuityContext): void {
  if (context.scope !== "project" || !context.projectId) throw new Error("Interaction Archive is project-local only.");
}

export const interactionArchiveCodec = ARCHIVE_CODEC;

function requireArchiveId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 180 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function requireArchiveTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) throw new Error("Archive deletion timestamp is invalid.");
  return value;
}
