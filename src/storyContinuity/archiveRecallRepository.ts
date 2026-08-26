import path from "node:path";

import {
  atomicWriteSecure,
  prepareContinuityIndexRoot,
  readSecurePathUtf8,
  removeSecureTree,
  securePathExists,
  withContinuityLock,
  type ContinuityContext
} from "./continuityFilesystem.ts";
import { listSessionMetadata, readSession } from "./interactionArchiveRepository.ts";
import type {
  InteractionEvent,
  MemorySensitivity,
  TianyiResponseClassification
} from "./continuityTypes.ts";
import {
  normalizeNfc,
  parseStrictJson,
  requireHash,
  requireMachineId,
  requireProjectId,
  sha256,
  stableJson
} from "./continuityValidation.ts";

export const ARCHIVE_RECALL_INDEX_VERSION = "story-tianyi-archive-recall-index/v1" as const;
export const ARCHIVE_RECALL_DEFAULT_LIMIT = 20;
export const ARCHIVE_RECALL_MAX_LIMIT = 50;
export const ARCHIVE_RECALL_MAX_EXCERPT_GRAPHEMES = 240;

const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_INDEX_SESSIONS = 1_000;
const MAX_INDEX_ENTRIES = 50_000;
const MAX_QUERY_GRAPHEMES = 240;

export type ArchiveRecallCandidateState = "none" | "pending" | "accepted" | "rejected";
export type ArchiveRecallIndexStatus = "current" | "missing" | "corrupt" | "invalid";

export type ArchiveRecallIndexEntry = {
  projectId: string;
  sessionId: string;
  eventId: string;
  sequence: number;
  recordedAt: string;
  actor: "author" | "tianyi";
  eventType: "author-message" | "tianyi-response" | "bounded-action" | "retained-message" | "nuwa-result-returned";
  contentHash: string;
  normalizedText: string;
  relatedReceiptId: string | null;
  sourceRefs: string[];
  responseClassifications: TianyiResponseClassification[];
  memoryCandidateState: ArchiveRecallCandidateState;
  sensitivity: MemorySensitivity;
  memoryCreated: boolean;
};

export type ArchiveRecallIndex = {
  version: typeof ARCHIVE_RECALL_INDEX_VERSION;
  projectId: string;
  agentId: string;
  builtAt: string;
  sessions: Array<{ sessionId: string; contentHash: string }>;
  entries: ArchiveRecallIndexEntry[];
};

export type ArchiveRecallSearchFilters = {
  startTime?: string;
  endTime?: string;
  sessionId?: string;
  actor?: "author" | "tianyi";
  sourceRef?: string;
  classification?: TianyiResponseClassification;
  memoryCandidateState?: ArchiveRecallCandidateState;
  sensitivity?: MemorySensitivity;
  memoryCreated?: boolean;
};

export type ArchiveRecallResult = Omit<ArchiveRecallIndexEntry, "normalizedText"> & {
  rank: number;
  excerpt: string;
  sourceState: "current";
  openTarget: { projectId: string; sessionId: string; eventId: string };
};

export type ArchiveRecallResolvedMessage = {
  projectId: string;
  sessionId: string;
  eventId: string;
  sequence: number | null;
  actor: "author" | "tianyi" | null;
  recordedAt: string | null;
  contentHash: string | null;
  state: "current" | "stale" | "deleted" | "missing";
  excerpt: string | null;
};

export async function getArchiveRecallIndexLocation(context: ContinuityContext): Promise<{ configuredRoot: string; absolutePath: string }> {
  requireProjectContext(context);
  const { configuredRoot, indexRoot } = await prepareContinuityIndexRoot(context.rootPath);
  const projectId = requireProjectId(context.projectId);
  const agentId = requireMachineId(context.agentId, "Archive Recall Agent identifier");
  const absolutePath = path.join(indexRoot, "archive-recall", projectId, `${sha256(agentId)}.json`);
  return { configuredRoot, absolutePath };
}

export async function removeArchiveRecallIndex(context: ContinuityContext): Promise<boolean> {
  const location = await getArchiveRecallIndexLocation(context);
  if (!await securePathExists(location.configuredRoot, location.absolutePath)) return false;
  await removeSecureTree(location.configuredRoot, location.absolutePath);
  return true;
}

export async function rebuildArchiveRecallIndex(context: ContinuityContext, input: { builtAt: string }): Promise<ArchiveRecallIndex> {
  requireProjectContext(context);
  const builtAt = requireTimestamp(input.builtAt, "Archive Recall build time");
  const location = await getArchiveRecallIndexLocation(context);
  const lockKey = `archive-recall:${context.projectId}:${context.agentId}`;
  return withContinuityLock(location.configuredRoot, lockKey, async () => {
    const sessions = await readCanonicalSessions(context);
    const entries: ArchiveRecallIndexEntry[] = [];
    for (const session of sessions.values) entries.push(...indexSession(context.projectId as string, session.events));
    if (entries.length > MAX_INDEX_ENTRIES) throw new Error("Archive Recall index has too many visible messages.");
    entries.sort(compareCanonicalEntry);
    const index = normalizeArchiveRecallIndex({
      version: ARCHIVE_RECALL_INDEX_VERSION,
      projectId: context.projectId,
      agentId: context.agentId,
      builtAt,
      sessions: sessions.fingerprints,
      entries
    }, context);
    await atomicWriteSecure(location.configuredRoot, location.absolutePath, stableJson(index));
    return structuredClone(index);
  });
}

export async function readArchiveRecallIndex(context: ContinuityContext): Promise<{ status: ArchiveRecallIndexStatus; index: ArchiveRecallIndex | null }> {
  requireProjectContext(context);
  const location = await getArchiveRecallIndexLocation(context);
  const source = await readSecurePathUtf8(location.configuredRoot, location.absolutePath, MAX_INDEX_BYTES);
  if (source === null) return { status: "missing", index: null };
  let index: ArchiveRecallIndex;
  try {
    index = normalizeArchiveRecallIndex(parseStrictJson(source, MAX_INDEX_BYTES, "Archive Recall index"), context);
    if (stableJson(index) !== source) throw new Error("Archive Recall index is not canonical.");
  } catch {
    return { status: "corrupt", index: null };
  }
  const current = await readCanonicalSessions(context);
  return sameFingerprints(index.sessions, current.fingerprints)
    ? { status: "current", index }
    : { status: "invalid", index: null };
}

export async function searchArchiveRecall(context: ContinuityContext, input: {
  authorizedProjectIds: string[];
  query: string;
  filters: ArchiveRecallSearchFilters;
  limit?: number;
}): Promise<{ status: ArchiveRecallIndexStatus; results: ArchiveRecallResult[] }> {
  requireProjectContext(context);
  requireCurrentProjectAuthorization(context.projectId as string, input.authorizedProjectIds);
  const query = normalizeSearchText(input.query, true);
  const terms = query.split(" ").filter(Boolean);
  const filters = normalizeFilters(input.filters);
  const limit = input.limit ?? ARCHIVE_RECALL_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ARCHIVE_RECALL_MAX_LIMIT) throw new Error("Archive Recall result limit is invalid.");
  const read = await readArchiveRecallIndex(context);
  if (read.status !== "current" || !read.index) return { status: read.status, results: [] };

  const ranked = read.index.entries
    .filter((entry) => matchesTerms(entry.normalizedText, terms))
    .filter((entry) => matchesFilters(entry, filters))
    .map((entry) => ({ entry, score: scoreEntry(entry.normalizedText, query, terms) }))
    .sort((left, right) => right.score - left.score || right.entry.recordedAt.localeCompare(left.entry.recordedAt) || compareCanonicalEntry(left.entry, right.entry))
    .slice(0, limit);
  const results: ArchiveRecallResult[] = [];
  for (let index = 0; index < ranked.length; index += 1) {
    const entry = ranked[index].entry;
    const session = await readSession(context, entry.sessionId);
    const event = session?.value.find((item) => item.eventId === entry.eventId);
    const visible = event ? visibleArchiveEventContent(event) : null;
    if (!event || !visible || archiveEventHash(event) !== entry.contentHash) continue;
    const { normalizedText: _normalizedText, ...safeEntry } = entry;
    results.push({
      ...structuredClone(safeEntry),
      rank: results.length + 1,
      excerpt: takeGraphemes(visible, ARCHIVE_RECALL_MAX_EXCERPT_GRAPHEMES),
      sourceState: "current",
      openTarget: { projectId: entry.projectId, sessionId: entry.sessionId, eventId: entry.eventId }
    });
  }
  return { status: "current", results };
}

export async function resolveArchiveRecallMessages(context: ContinuityContext, refs: Array<{ sessionId: string; eventId: string; contentHash: string }>): Promise<ArchiveRecallResolvedMessage[]> {
  requireProjectContext(context);
  if (!Array.isArray(refs) || refs.length > 8) throw new Error("Archive Recall message selection is invalid.");
  const seen = new Set<string>();
  const result: ArchiveRecallResolvedMessage[] = [];
  for (const ref of refs) {
    const sessionId = requireMachineId(ref.sessionId, "Archive Recall Session identifier");
    const eventId = requireMachineId(ref.eventId, "Archive Recall event identifier");
    const expectedHash = requireHash(ref.contentHash, "Archive Recall event hash");
    const key = `${sessionId}:${eventId}`;
    if (seen.has(key)) throw new Error("Archive Recall message selection contains a duplicate.");
    seen.add(key);
    const session = await readSession(context, sessionId);
    const event = session?.value.find((item) => item.eventId === eventId);
    if (!event) {
      result.push({ projectId: context.projectId as string, sessionId, eventId, sequence: null, actor: null, recordedAt: null, contentHash: null, state: "missing", excerpt: null });
      continue;
    }
    if (event.type === "message-deleted") {
      result.push({ projectId: context.projectId as string, sessionId, eventId, sequence: event.sequence, actor: null, recordedAt: event.recordedAt, contentHash: archiveEventHash(event), state: "deleted", excerpt: null });
      continue;
    }
    const visible = visibleArchiveEventContent(event);
    if (!visible || (event.actor !== "author" && event.actor !== "tianyi")) {
      result.push({ projectId: context.projectId as string, sessionId, eventId, sequence: event.sequence, actor: null, recordedAt: event.recordedAt, contentHash: archiveEventHash(event), state: "missing", excerpt: null });
      continue;
    }
    const contentHash = archiveEventHash(event);
    result.push({
      projectId: context.projectId as string,
      sessionId,
      eventId,
      sequence: event.sequence,
      actor: event.actor,
      recordedAt: event.recordedAt,
      contentHash,
      state: contentHash === expectedHash ? "current" : "stale",
      excerpt: takeGraphemes(visible, ARCHIVE_RECALL_MAX_EXCERPT_GRAPHEMES)
    });
  }
  return result;
}

export function visibleArchiveEventContent(event: InteractionEvent): string | null {
  if (event.type === "author-message") {
    const content = parseObject(event.content);
    if (content?.version === "tianyi-creative-author-source/v1" && typeof content.text === "string") {
      return content.text;
    }
    const request = parseObject(content?.request);
    return typeof request?.authorQuery === "string" ? normalizeVisibleText(request.authorQuery) : null;
  }
  if (event.type === "creative-response") {
    const content = parseObject(event.content);
    return typeof content?.text === "string" ? normalizeVisibleText(content.text) : null;
  }
  if (event.type === "tianyi-response") {
    const content = parseObject(event.content);
    return typeof content?.visibleResponse === "string" ? normalizeVisibleText(content.visibleResponse) : null;
  }
  if (event.type === "bounded-action") {
    const content = parseObject(event.content);
    const request = parseObject(content?.request);
    return typeof request?.boundedAction === "string" ? `Bounded action: ${normalizeVisibleText(request.boundedAction)}` : null;
  }
  if (event.type === "retained-message") {
    const content = parseObject(event.content);
    return typeof content?.visibleContent === "string" ? normalizeVisibleText(content.visibleContent) : null;
  }
  if (event.type === "nuwa-result-returned") {
    const content = parseObject(event.content);
    return typeof content?.visibleResponse === "string" ? normalizeVisibleText(content.visibleResponse) : null;
  }
  return null;
}

export function archiveEventHash(event: InteractionEvent): string {
  return sha256(stableJson(event));
}

function indexSession(projectId: string, events: InteractionEvent[]): ArchiveRecallIndexEntry[] {
  const sourceRefsByOperation = new Map<string, string[]>();
  const candidateByOperation = deriveCandidateMetadata(events);
  for (const event of events) {
    if (event.type !== "author-message" && event.type !== "bounded-action") continue;
    sourceRefsByOperation.set(event.operationId, deriveSourceRefs(event));
  }
  const result: ArchiveRecallIndexEntry[] = [];
  for (const event of events) {
    const visible = visibleArchiveEventContent(event);
    if (!visible || (event.actor !== "author" && event.actor !== "tianyi")) continue;
    const candidate = candidateByOperation.get(event.operationId) ?? { state: "none" as const, sensitivity: "ordinary" as const, memoryCreated: false };
    result.push({
      projectId,
      sessionId: event.sessionId,
      eventId: event.eventId,
      sequence: event.sequence,
      recordedAt: event.recordedAt,
      actor: event.actor,
      eventType: event.type as ArchiveRecallIndexEntry["eventType"],
      contentHash: archiveEventHash(event),
      normalizedText: normalizeSearchText(visible, false),
      relatedReceiptId: event.receiptId ?? relatedReceipt(events, event.operationId),
      sourceRefs: sourceRefsByOperation.get(event.operationId) ?? [],
      responseClassifications: [...event.responseClassifications],
      memoryCandidateState: candidate.state,
      sensitivity: candidate.sensitivity,
      memoryCreated: candidate.memoryCreated
    });
  }
  return result;
}

function deriveCandidateMetadata(events: InteractionEvent[]): Map<string, { state: ArchiveRecallCandidateState; sensitivity: MemorySensitivity; memoryCreated: boolean }> {
  const byCandidate = new Map<string, { operationId: string; sensitivity: MemorySensitivity; state: ArchiveRecallCandidateState; memoryCreated: boolean }>();
  for (const event of events) {
    if (event.type !== "memory-candidate-proposed") continue;
    const proposal = parseObject(event.content);
    const candidateId = typeof proposal?.candidateId === "string" ? proposal.candidateId : event.memoryCandidateIds[0];
    if (!candidateId) continue;
    const sensitivity = isSensitivity(proposal?.sensitivity) ? proposal.sensitivity : "ordinary";
    byCandidate.set(candidateId, { operationId: event.operationId, sensitivity, state: "pending", memoryCreated: false });
  }
  for (const event of events) {
    if (event.type !== "memory-candidate-decided") continue;
    const decision = parseObject(event.content);
    const candidateId = typeof decision?.candidateId === "string" ? decision.candidateId : event.memoryCandidateIds[0];
    const current = candidateId ? byCandidate.get(candidateId) : undefined;
    if (!current) continue;
    current.state = decision?.decision === "accepted" ? "accepted" : "rejected";
    current.memoryCreated = current.state === "accepted" && typeof decision?.memoryId === "string";
  }
  const byOperation = new Map<string, { state: ArchiveRecallCandidateState; sensitivity: MemorySensitivity; memoryCreated: boolean }>();
  for (const candidate of byCandidate.values()) {
    const prior = byOperation.get(candidate.operationId);
    if (!prior || candidateRank(candidate.state) > candidateRank(prior.state)) byOperation.set(candidate.operationId, { state: candidate.state, sensitivity: candidate.sensitivity, memoryCreated: candidate.memoryCreated });
    else if (candidate.memoryCreated) prior.memoryCreated = true;
  }
  return byOperation;
}

function deriveSourceRefs(event: InteractionEvent): string[] {
  const content = parseObject(event.content);
  const request = parseObject(content?.contextRequest);
  if (!request) return [];
  const refs: string[] = [];
  const active = parseObject(request.activeOwner);
  if (typeof active?.id === "string") refs.push(active.id);
  if (Array.isArray(request.sourceRefs)) for (const item of request.sourceRefs) {
    const ref = parseObject(item);
    if (typeof ref?.id === "string") refs.push(ref.id);
  }
  return [...new Set(refs)].slice(0, 64);
}

async function readCanonicalSessions(context: ContinuityContext): Promise<{
  fingerprints: Array<{ sessionId: string; contentHash: string }>;
  values: Array<{ sessionId: string; events: InteractionEvent[] }>;
}> {
  const metadata = await listSessionMetadata(context);
  if (metadata.length > MAX_INDEX_SESSIONS) throw new Error("Archive Recall has too many Sessions for a bounded rebuild.");
  const fingerprints: Array<{ sessionId: string; contentHash: string }> = [];
  const values: Array<{ sessionId: string; events: InteractionEvent[] }> = [];
  for (const item of metadata) {
    const session = await readSession(context, item.id);
    if (!session) continue;
    fingerprints.push({ sessionId: item.id, contentHash: session.contentHash });
    values.push({ sessionId: item.id, events: session.value });
  }
  return { fingerprints, values };
}

function normalizeArchiveRecallIndex(value: unknown, context: ContinuityContext): ArchiveRecallIndex {
  const input = exactObject(value, ["version", "projectId", "agentId", "builtAt", "sessions", "entries"], "Archive Recall index");
  if (input.version !== ARCHIVE_RECALL_INDEX_VERSION) throw new Error("Archive Recall index version is unsupported.");
  const projectId = requireProjectId(input.projectId);
  const agentId = requireMachineId(input.agentId, "Archive Recall Agent identifier");
  if (projectId !== context.projectId || agentId !== context.agentId) throw new Error("Archive Recall index owner does not match its path.");
  if (!Array.isArray(input.sessions) || input.sessions.length > MAX_INDEX_SESSIONS) throw new Error("Archive Recall Session fingerprints are invalid.");
  const sessions = input.sessions.map((item) => {
    const row = exactObject(item, ["sessionId", "contentHash"], "Archive Recall Session fingerprint");
    return { sessionId: requireMachineId(row.sessionId, "Archive Recall Session identifier"), contentHash: requireHash(row.contentHash) };
  });
  if (!Array.isArray(input.entries) || input.entries.length > MAX_INDEX_ENTRIES) throw new Error("Archive Recall index entries are invalid.");
  const entries = input.entries.map((item) => normalizeIndexEntry(item, projectId));
  if (new Set(entries.map((item) => `${item.sessionId}:${item.eventId}`)).size !== entries.length) throw new Error("Archive Recall index contains duplicate messages.");
  if ([...entries].sort(compareCanonicalEntry).some((entry, index) => entry.eventId !== entries[index].eventId)) throw new Error("Archive Recall index ordering is invalid.");
  return { version: ARCHIVE_RECALL_INDEX_VERSION, projectId, agentId, builtAt: requireTimestamp(input.builtAt, "Archive Recall build time"), sessions, entries };
}

function normalizeIndexEntry(value: unknown, projectId: string): ArchiveRecallIndexEntry {
  const input = exactObject(value, [
    "projectId", "sessionId", "eventId", "sequence", "recordedAt", "actor", "eventType", "contentHash", "normalizedText",
    "relatedReceiptId", "sourceRefs", "responseClassifications", "memoryCandidateState", "sensitivity", "memoryCreated"
  ], "Archive Recall index entry");
  if (input.projectId !== projectId) throw new Error("Archive Recall entry project is invalid.");
  if (!Number.isSafeInteger(input.sequence) || Number(input.sequence) < 1) throw new Error("Archive Recall entry sequence is invalid.");
  if (input.actor !== "author" && input.actor !== "tianyi") throw new Error("Archive Recall entry actor is invalid.");
  if (!["author-message", "tianyi-response", "bounded-action", "retained-message", "nuwa-result-returned"].includes(String(input.eventType))) throw new Error("Archive Recall entry type is invalid.");
  if (!Array.isArray(input.sourceRefs) || input.sourceRefs.length > 64 || input.sourceRefs.some((item) => typeof item !== "string" || [...item].length > 160)) throw new Error("Archive Recall entry sources are invalid.");
  if (!Array.isArray(input.responseClassifications) || input.responseClassifications.some((item) => !["confirmed-fact", "inference", "candidate-suggestion", "unavailable-evidence"].includes(String(item)))) throw new Error("Archive Recall classifications are invalid.");
  if (!["none", "pending", "accepted", "rejected"].includes(String(input.memoryCandidateState))) throw new Error("Archive Recall candidate state is invalid.");
  if (!isSensitivity(input.sensitivity)) throw new Error("Archive Recall sensitivity is invalid.");
  if (typeof input.memoryCreated !== "boolean") throw new Error("Archive Recall Memory state is invalid.");
  const normalizedText = normalizeSearchText(input.normalizedText, false);
  return {
    projectId,
    sessionId: requireMachineId(input.sessionId, "Archive Recall Session identifier"),
    eventId: requireMachineId(input.eventId, "Archive Recall event identifier"),
    sequence: Number(input.sequence),
    recordedAt: requireTimestamp(input.recordedAt, "Archive Recall event time"),
    actor: input.actor,
    eventType: input.eventType as ArchiveRecallIndexEntry["eventType"],
    contentHash: requireHash(input.contentHash),
    normalizedText,
    relatedReceiptId: input.relatedReceiptId === null ? null : requireMachineId(input.relatedReceiptId, "Archive Recall Receipt identifier"),
    sourceRefs: input.sourceRefs.map(String),
    responseClassifications: input.responseClassifications as TianyiResponseClassification[],
    memoryCandidateState: input.memoryCandidateState as ArchiveRecallCandidateState,
    sensitivity: input.sensitivity,
    memoryCreated: input.memoryCreated
  };
}

function normalizeFilters(value: ArchiveRecallSearchFilters): ArchiveRecallSearchFilters {
  const input = exactObject(value, ["startTime", "endTime", "sessionId", "actor", "sourceRef", "classification", "memoryCandidateState", "sensitivity", "memoryCreated"], "Archive Recall filters", true);
  const result: ArchiveRecallSearchFilters = {};
  if (input.startTime !== undefined) result.startTime = requireTimestamp(input.startTime, "Archive Recall start time");
  if (input.endTime !== undefined) result.endTime = requireTimestamp(input.endTime, "Archive Recall end time");
  if (result.startTime && result.endTime && result.startTime > result.endTime) throw new Error("Archive Recall time range is invalid.");
  if (input.sessionId !== undefined) result.sessionId = requireMachineId(input.sessionId, "Archive Recall Session filter");
  if (input.actor !== undefined) { if (input.actor !== "author" && input.actor !== "tianyi") throw new Error("Archive Recall actor filter is invalid."); result.actor = input.actor; }
  if (input.sourceRef !== undefined) result.sourceRef = requireBoundedText(input.sourceRef, 160, "Archive Recall source filter");
  if (input.classification !== undefined) { if (!["confirmed-fact", "inference", "candidate-suggestion", "unavailable-evidence"].includes(String(input.classification))) throw new Error("Archive Recall classification filter is invalid."); result.classification = input.classification as TianyiResponseClassification; }
  if (input.memoryCandidateState !== undefined) { if (!["none", "pending", "accepted", "rejected"].includes(String(input.memoryCandidateState))) throw new Error("Archive Recall candidate filter is invalid."); result.memoryCandidateState = input.memoryCandidateState as ArchiveRecallCandidateState; }
  if (input.sensitivity !== undefined) { if (!isSensitivity(input.sensitivity)) throw new Error("Archive Recall sensitivity filter is invalid."); result.sensitivity = input.sensitivity; }
  if (input.memoryCreated !== undefined) { if (typeof input.memoryCreated !== "boolean") throw new Error("Archive Recall Memory filter is invalid."); result.memoryCreated = input.memoryCreated; }
  return result;
}

function matchesFilters(entry: ArchiveRecallIndexEntry, filters: ArchiveRecallSearchFilters): boolean {
  return (!filters.startTime || entry.recordedAt >= filters.startTime)
    && (!filters.endTime || entry.recordedAt <= filters.endTime)
    && (!filters.sessionId || entry.sessionId === filters.sessionId)
    && (!filters.actor || entry.actor === filters.actor)
    && (!filters.sourceRef || entry.sourceRefs.includes(filters.sourceRef))
    && (!filters.classification || entry.responseClassifications.includes(filters.classification))
    && (!filters.memoryCandidateState || entry.memoryCandidateState === filters.memoryCandidateState)
    && (!filters.sensitivity || entry.sensitivity === filters.sensitivity)
    && (filters.memoryCreated === undefined || entry.memoryCreated === filters.memoryCreated);
}

function normalizeSearchText(value: unknown, query: boolean): string {
  if (typeof value !== "string") throw new Error(query ? "Archive Recall query is invalid." : "Archive Recall searchable text is invalid.");
  const normalized = normalizeNfc(value).normalize("NFKC").toLocaleLowerCase("und").replace(/[\u0000-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim();
  if (!normalized || [...normalized].length > (query ? MAX_QUERY_GRAPHEMES : 24_000)) throw new Error(query ? "Archive Recall query is invalid." : "Archive Recall searchable text is invalid.");
  return normalized;
}

function normalizeVisibleText(value: string): string {
  const text = normalizeNfc(value).trim();
  if (!text || [...text].length > 24_000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new Error("Archive visible message is invalid.");
  return text;
}

function matchesTerms(text: string, terms: string[]): boolean { return terms.every((term) => text.includes(term)); }
function scoreEntry(text: string, query: string, terms: string[]): number { return (text.includes(query) ? 10_000 : 0) + terms.filter((term) => text.includes(term)).length; }
function compareCanonicalEntry(left: ArchiveRecallIndexEntry, right: ArchiveRecallIndexEntry): number { return left.sessionId.localeCompare(right.sessionId) || left.sequence - right.sequence || left.eventId.localeCompare(right.eventId); }
function sameFingerprints(left: ArchiveRecallIndex["sessions"], right: ArchiveRecallIndex["sessions"]): boolean { return stableJson(left) === stableJson(right); }
function relatedReceipt(events: InteractionEvent[], operationId: string): string | null { return events.find((event) => event.operationId === operationId && event.receiptId)?.receiptId ?? null; }
function candidateRank(value: ArchiveRecallCandidateState): number { return ({ none: 0, pending: 1, rejected: 2, accepted: 3 })[value]; }
function isSensitivity(value: unknown): value is MemorySensitivity { return ["ordinary", "personal", "sensitive", "restricted"].includes(String(value)); }
function parseObject(value: unknown): Record<string, unknown> | null { if (typeof value === "string") { try { return parseObject(JSON.parse(value)); } catch { return null; } } return value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype ? value as Record<string, unknown> : null; }
function takeGraphemes(value: string, maximum: number): string { return [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(value)].slice(0, maximum).map((item) => item.segment).join(""); }
function requireTimestamp(value: unknown, label: string): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`); return value; }
function requireBoundedText(value: unknown, maximum: number, label: string): string { if (typeof value !== "string") throw new Error(`${label} is invalid.`); const text = normalizeNfc(value).trim(); if (!text || [...text].length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new Error(`${label} is invalid.`); return text; }
function exactObject(value: unknown, fields: string[], label: string, optional = false): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); const input = value as Record<string, unknown>; if (Object.keys(input).some((key) => !fields.includes(key)) || (!optional && fields.some((key) => !Object.hasOwn(input, key)))) throw new Error(`${label} fields are invalid.`); return input; }
function requireCurrentProjectAuthorization(projectId: string, value: unknown): void { if (!Array.isArray(value) || value.length !== 1 || value[0] !== projectId) throw new Error("Archive Recall is authorized for the current project only."); }
function requireProjectContext(context: ContinuityContext): void { if (context.scope !== "project" || !context.projectId) throw new Error("Archive Recall is project-local only."); }
