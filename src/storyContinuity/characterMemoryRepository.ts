import { createHash } from "node:crypto";

import type { ContinuityContext } from "./continuityFilesystem.ts";
import type { OwnerCodec } from "./continuityOwnerRepository.ts";
import { createOwner, listOwnerRevisions, readOwner, updateOwner } from "./continuityOwnerRepository.ts";
import {
  CHARACTER_MEMORY_LEDGER_VERSION,
  type CharacterHeardMemoryRecord,
  type CharacterMemoryLedger,
  type CharacterMemorySourceIdentity
} from "./continuityTypes.ts";
import { parseStrictJson, requireMachineId, requireProjectId, stableJson } from "./continuityValidation.ts";

const MAXIMUM_BYTES = 8 * 1024 * 1024;
const MAX_RECORDS = 4_000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const characterMemoryLedgerCodec: OwnerCodec<CharacterMemoryLedger> = {
  kind: "character-memory-ledger",
  maximumBytes: MAXIMUM_BYTES,
  normalizeSource(source, location) {
    const value = normalizeLedger(parseStrictJson(source, MAXIMUM_BYTES, "Character Memory ledger"), {
      ownerId: location.owner.id,
      projectId: location.owner.projectId ?? undefined
    });
    return { value, source: stableJson(value) };
  },
  serialize(value) {
    return stableJson(normalizeLedger(value));
  }
};

export type CharacterMemoryRunProjection = {
  runId: string;
  sourceIdentity: CharacterMemorySourceIdentity | null;
  scene: { sceneRef: { id: string; revision: string }; observedAt: string };
  steps: Array<{
    stepId: string;
    committedAt: string;
    heardStatements: Array<{ recipientId: string; speakerId: string; statement: string; sourceStepId: string; sourceRevision: string }>;
  }>;
};

export function characterMemoryOwnerId(recipientId: string): string {
  const recipient = foreignId(recipientId, "Character identifier");
  return `character-memory-ledger.${createHash("sha256").update(recipient).digest("hex").slice(0, 32)}`;
}

export async function synchronizeCharacterHeardMemories(context: ContinuityContext, run: CharacterMemoryRunProjection): Promise<CharacterMemoryLedger[]> {
  requireProjectContext(context);
  const sourceIdentity = run.sourceIdentity ? normalizeSourceIdentity(run.sourceIdentity) : null;
  if (!sourceIdentity) return [];
  const runId = foreignId(run.runId, "Nuwa Run identifier");
  const scene = normalizeScene({ sceneRef: run.scene.sceneRef, observedAt: run.scene.observedAt });
  const byRecipient = new Map<string, CharacterHeardMemoryRecord[]>();
  for (const step of run.steps) {
    const stepId = foreignId(step.stepId, "Nuwa step identifier");
    const recordedAt = timestamp(step.committedAt, "Nuwa step timestamp");
    for (const heard of step.heardStatements ?? []) {
      if (heard.sourceStepId !== stepId) throw new Error("Character Memory source step does not match its Run step.");
      const recipientId = foreignId(heard.recipientId, "Character Memory recipient");
      const speakerId = foreignId(heard.speakerId, "Character Memory speaker");
      if (recipientId === speakerId) throw new Error("Character Memory recipient cannot be its speaker.");
      const record: CharacterHeardMemoryRecord = {
        id: memoryRecordId(runId, stepId, recipientId, heard.sourceRevision),
        epistemicState: "heard",
        recipientId,
        speakerId,
        statement: boundedText(heard.statement, "Character Memory statement", 4_000),
        sourceRunId: runId,
        sourceStepId: stepId,
        sourceStepRevision: foreignId(heard.sourceRevision, "Nuwa step revision"),
        sourceScene: scene,
        sourceIdentity,
        validity: { state: "active", invalidatedAt: null, invalidatedByOperationId: null, reason: null },
        recordedAt
      };
      byRecipient.set(recipientId, [...(byRecipient.get(recipientId) ?? []), record]);
    }
  }
  const ledgers: CharacterMemoryLedger[] = [];
  for (const [recipientId, records] of byRecipient) {
    ledgers.push(await appendRecords(context, recipientId, records, `nuwa-memory-sync.${shortHash({ runId, recipientId, recordIds: records.map((record) => record.id) })}`));
  }
  return ledgers;
}

export async function listRecallableCharacterMemories(context: ContinuityContext, input: { recipientId: string; sourceIdentity: CharacterMemorySourceIdentity | null; observedAt: string }): Promise<CharacterHeardMemoryRecord[]> {
  requireProjectContext(context);
  if (!input.sourceIdentity) return [];
  const recipientId = foreignId(input.recipientId, "Character Memory recipient");
  const ledger = await readOwner(context, characterMemoryOwnerId(recipientId), characterMemoryLedgerCodec);
  if (!ledger || ledger.value.recipientId !== recipientId) return [];
  const targetIdentity = normalizeSourceIdentity(input.sourceIdentity);
  const observedAt = timestamp(input.observedAt, "Character Memory recall timestamp");
  return ledger.value.records
    .filter((record) => record.validity.state === "active" && isCharacterMemoryVisibleInSource(record.sourceIdentity, targetIdentity) && record.sourceScene.observedAt <= observedAt)
    .map((record) => structuredClone(record));
}

export async function invalidateCharacterMemoriesByRun(context: ContinuityContext, input: { runId: string; invalidatedAt: string; operationId: string }): Promise<CharacterMemoryLedger[]> {
  requireProjectContext(context);
  const runId = foreignId(input.runId, "Nuwa Run identifier");
  const invalidatedAt = timestamp(input.invalidatedAt, "Character Memory invalidation timestamp");
  const operationId = requireMachineId(input.operationId, "Character Memory invalidation operation");
  const changed: CharacterMemoryLedger[] = [];
  const ids = await import("./continuityFilesystem.ts").then(({ listOwnerIds }) => listOwnerIds(context, "character-memory-ledger"));
  for (const ownerId of ids) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await readOwner(context, ownerId, characterMemoryLedgerCodec);
      if (!current) break;
      const hasActive = current.value.records.some((record) => record.sourceRunId === runId && record.validity.state === "active");
      if (!hasActive) break;
      const value: CharacterMemoryLedger = {
        ...current.value,
        records: current.value.records.map((record) => record.sourceRunId === runId && record.validity.state === "active"
          ? { ...record, validity: { state: "invalidated", invalidatedAt, invalidatedByOperationId: operationId, reason: "source-rollback" } }
          : record)
      };
      const write = await updateOwner(context, ownerId, current.contentHash, value, characterMemoryLedgerCodec, { source: "update", recordedAt: invalidatedAt, operationId });
      if (write.ok && write.current) { changed.push(write.current.value); break; }
      if (!write.conflict) throw new Error("Character Memory invalidation failed.");
      if (attempt === 3) throw new Error("Character Memory invalidation conflicted repeatedly.");
    }
  }
  return changed;
}

export async function readCharacterMemoryLedger(context: ContinuityContext, recipientId: string) {
  requireProjectContext(context);
  return readOwner(context, characterMemoryOwnerId(recipientId), characterMemoryLedgerCodec);
}

export async function listCharacterMemoryLedgerRevisions(context: ContinuityContext, recipientId: string) {
  return listOwnerRevisions(context, characterMemoryOwnerId(recipientId), characterMemoryLedgerCodec);
}

async function appendRecords(context: ContinuityContext, recipientId: string, records: CharacterHeardMemoryRecord[], operationId: string): Promise<CharacterMemoryLedger> {
  const ownerId = characterMemoryOwnerId(recipientId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readOwner(context, ownerId, characterMemoryLedgerCodec);
    const existing = new Map((current?.value.records ?? []).map((record) => [record.id, record]));
    for (const record of records) {
      const prior = existing.get(record.id);
      if (prior && stableJson({ ...prior, validity: record.validity }) !== stableJson(record)) throw new Error("Character Memory source identity was replayed with different content.");
      if (!prior) existing.set(record.id, record);
    }
    if (current && existing.size === current.value.records.length) return current.value;
    const value: CharacterMemoryLedger = normalizeLedger({
      version: CHARACTER_MEMORY_LEDGER_VERSION,
      ownerId,
      projectId: context.projectId,
      recipientId,
      state: "active",
      records: [...existing.values()].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id))
    });
    const write = current
      ? await updateOwner(context, ownerId, current.contentHash, value, characterMemoryLedgerCodec, { source: "append", recordedAt: records.at(-1)?.recordedAt ?? new Date().toISOString(), operationId })
      : await createOwner(context, ownerId, value, characterMemoryLedgerCodec, { source: "create", recordedAt: records.at(-1)?.recordedAt ?? new Date().toISOString(), operationId });
    if (write.ok && write.current) return write.current.value;
    if (!write.conflict) throw new Error("Character Memory append failed.");
    if (attempt === 3) throw new Error("Character Memory append conflicted repeatedly.");
  }
  throw new Error("Character Memory append failed.");
}

function normalizeLedger(value: unknown, expected: { ownerId?: string; projectId?: string } = {}): CharacterMemoryLedger {
  const input = plainObject(value, "Character Memory ledger");
  exactFields(input, ["version", "ownerId", "projectId", "recipientId", "state", "records"], "Character Memory ledger");
  if (input.version !== CHARACTER_MEMORY_LEDGER_VERSION || input.state !== "active") throw new Error("Character Memory ledger version or state is invalid.");
  const ownerId = requireMachineId(input.ownerId, "Character Memory owner");
  const projectId = requireProjectId(input.projectId);
  const recipientId = foreignId(input.recipientId, "Character Memory recipient");
  if (expected.ownerId && ownerId !== expected.ownerId || expected.projectId && projectId !== expected.projectId || ownerId !== characterMemoryOwnerId(recipientId)) throw new Error("Character Memory ledger does not match its owner path.");
  if (!Array.isArray(input.records) || input.records.length > MAX_RECORDS) throw new Error("Character Memory ledger records are invalid.");
  const records = input.records.map(normalizeRecord);
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Character Memory record identity is duplicated.");
  if (records.some((record) => record.recipientId !== recipientId)) throw new Error("Character Memory record belongs to another recipient.");
  const sorted = records.slice().sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));
  return { version: CHARACTER_MEMORY_LEDGER_VERSION, ownerId, projectId, recipientId, state: "active", records: sorted };
}

function normalizeRecord(value: unknown): CharacterHeardMemoryRecord {
  const input = plainObject(value, "Character Memory record");
  exactFields(input, ["id", "epistemicState", "recipientId", "speakerId", "statement", "sourceRunId", "sourceStepId", "sourceStepRevision", "sourceScene", "sourceIdentity", "validity", "recordedAt"], "Character Memory record");
  if (input.epistemicState !== "heard") throw new Error("Character Memory epistemic state is invalid.");
  const recipientId = foreignId(input.recipientId, "Character Memory recipient");
  const speakerId = foreignId(input.speakerId, "Character Memory speaker");
  const sourceRunId = foreignId(input.sourceRunId, "Nuwa Run identifier");
  const sourceStepId = foreignId(input.sourceStepId, "Nuwa step identifier");
  const sourceStepRevision = foreignId(input.sourceStepRevision, "Nuwa step revision");
  const id = requireMachineId(input.id, "Character Memory record identifier");
  if (id !== memoryRecordId(sourceRunId, sourceStepId, recipientId, sourceStepRevision)) throw new Error("Character Memory record identity is invalid.");
  const validity = plainObject(input.validity, "Character Memory validity");
  exactFields(validity, ["state", "invalidatedAt", "invalidatedByOperationId", "reason"], "Character Memory validity");
  if (validity.state !== "active" && validity.state !== "invalidated") throw new Error("Character Memory validity state is invalid.");
  if (validity.state === "active" && (validity.invalidatedAt !== null || validity.invalidatedByOperationId !== null || validity.reason !== null)) throw new Error("Active Character Memory cannot carry invalidation metadata.");
  if (validity.state === "invalidated" && validity.reason !== "source-rollback") throw new Error("Invalidated Character Memory requires a rollback reason.");
  return {
    id,
    epistemicState: "heard",
    recipientId,
    speakerId,
    statement: boundedText(input.statement, "Character Memory statement", 4_000),
    sourceRunId,
    sourceStepId,
    sourceStepRevision,
    sourceScene: normalizeScene(input.sourceScene),
    sourceIdentity: normalizeSourceIdentity(input.sourceIdentity),
    validity: validity.state === "active"
      ? { state: "active", invalidatedAt: null, invalidatedByOperationId: null, reason: null }
      : { state: "invalidated", invalidatedAt: timestamp(validity.invalidatedAt, "Character Memory invalidation timestamp"), invalidatedByOperationId: requireMachineId(validity.invalidatedByOperationId, "Character Memory invalidation operation"), reason: "source-rollback" },
    recordedAt: timestamp(input.recordedAt, "Character Memory recorded timestamp")
  };
}

function normalizeScene(value: unknown) {
  const input = plainObject(value, "Character Memory source scene");
  const source = Object.hasOwn(input, "sceneRef") ? plainObject(input.sceneRef, "Character Memory scene reference") : input;
  if (Object.hasOwn(input, "sceneRef")) exactFields(input, ["sceneRef", "observedAt"], "Character Memory source scene");
  else exactFields(input, ["id", "revision", "observedAt"], "Character Memory source scene");
  if (Object.hasOwn(input, "sceneRef")) exactFields(source, ["id", "revision"], "Character Memory scene reference");
  return { id: foreignId(source.id, "Character Memory scene identifier"), revision: foreignId(source.revision, "Character Memory scene revision"), observedAt: timestamp(input.observedAt, "Character Memory scene timestamp") };
}

function normalizeSourceIdentity(value: unknown): CharacterMemorySourceIdentity {
  const input = plainObject(value, "Character Memory source identity");
  exactFields(input, ["kind", "workVersionId", "revision"], "Character Memory source identity");
  if (input.kind !== "root" && input.kind !== "derived" && input.kind !== "unversioned-draft") throw new Error("Character Memory source kind is invalid.");
  return { kind: input.kind, workVersionId: foreignId(input.workVersionId, "Work version identifier"), revision: foreignId(input.revision, "Work version revision") };
}

/**
 * Version compatibility is shared by role recall and author-facing history.
 * Callers must still apply their own recipient/project boundary before exposing
 * a record.  Derived work versions deliberately require an exact revision so
 * an IF cannot drift with later parent changes.
 */
export function isCharacterMemoryVisibleInSource(source: CharacterMemorySourceIdentity, target: CharacterMemorySourceIdentity): boolean {
  if (source.kind !== target.kind || source.workVersionId !== target.workVersionId) return false;
  if (source.kind !== "root") return source.revision === target.revision;
  const left = Number(source.revision);
  const right = Number(target.revision);
  return Number.isSafeInteger(left) && Number.isSafeInteger(right) ? left <= right : source.revision === target.revision;
}

function memoryRecordId(runId: string, stepId: string, recipientId: string, sourceRevision: string): string {
  return `character-memory.${shortHash({ runId, stepId, recipientId, sourceRevision })}`;
}

function shortHash(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 40); }
function requireProjectContext(context: ContinuityContext): void { if (context.scope !== "project" || !context.projectId) throw new Error("Character Memory requires a project-local continuity context."); }
function foreignId(value: unknown, label: string): string { if (typeof value !== "string") throw new Error(`${label} is invalid.`); const text = value.normalize("NFC").trim(); if (!text || text.length > 240 || /[\u0000-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`); return text; }
function boundedText(value: unknown, label: string, maximum: number): string { if (typeof value !== "string") throw new Error(`${label} is invalid.`); const text = value.normalize("NFC").trim(); if (!text || [...text].length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) throw new Error(`${label} is invalid.`); return text; }
function timestamp(value: unknown, label: string): string { if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`); return value; }
function plainObject(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`); return value as Record<string, unknown>; }
function exactFields(value: Record<string, unknown>, fields: string[], label: string): void { const allowed = new Set(fields); if (Object.keys(value).some((key) => !allowed.has(key)) || fields.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} fields are invalid.`); }
