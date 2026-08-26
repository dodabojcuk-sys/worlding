import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sha256 } from "../storyContinuity/continuityValidation.ts";
import { stableHash } from "../storyIntelligence/storySnapshotBuilder.ts";

/**
 * Source import is a project-local review projection. It preserves the source
 * verbatim and only stores review metadata beside the existing workspace owner;
 * it never becomes a Canon, Event, WorldState, Relation, Novel, or Run owner.
 */
export const SOURCE_IMPORT_REVIEW_R0_VERSION = "tianyan-source-import-review-r0/v1" as const;
export const SOURCE_IMPORT_EXTRACTOR_R0 = "deterministic-source-extractor-r0" as const;

export type SourceImportModeR0 = "reference-only" | "extract-review";
export type SourceImportCandidateKindR0 = "actor" | "entity" | "fact" | "event" | "unit" | "beat";
export type SourceImportCandidateStatusR0 = "pending" | "accepted" | "rejected" | "merged" | "stale";

export type SourceAnchorR0 = {
  sourceDocumentId: string;
  revisionId: string;
  revisionHash: string;
  lineStart: number;
  lineEnd: number;
  charStart: number;
  charEnd: number;
  excerptHash: string;
  excerpt: string;
  blockId: string | null;
};

export type SourceSegmentR0 = {
  blockId: string;
  lineStart: number;
  lineEnd: number;
  charStart: number;
  charEnd: number;
  headingLevel: number | null;
  text: string;
};

export type SourceRevisionR0 = {
  revisionId: string;
  revisionHash: string;
  format: "md" | "txt";
  content: string;
  segments: SourceSegmentR0[];
  importedAt: string;
};

export type SourceImportDuplicateMatchR0 = {
  objectId: string;
  objectType: "character" | "location" | "item" | "event" | "rule" | "thread" | "faction";
  displayName: string;
  reason: string;
};

export type SourceImportCandidateR0 = {
  candidateId: string;
  kind: SourceImportCandidateKindR0;
  displayName: string;
  summary: string;
  anchor: SourceAnchorR0;
  excerpt: string;
  extractionReason: string;
  revisionId: string;
  revisionHash: string;
  provenance: {
    extractor: typeof SOURCE_IMPORT_EXTRACTOR_R0;
    sourceDocumentId: string;
    sourceRevisionHash: string;
  };
  status: SourceImportCandidateStatusR0;
  duplicateMatches: SourceImportDuplicateMatchR0[];
  targetObjectId: string | null;
  authorControlReviewId: string | null;
};

export type SourceImportRevisionReceiptR0 = {
  sourceDocumentId: string;
  revisionId: string;
  revisionHash: string;
  importedAt: string;
  sourceMode: SourceImportModeR0;
  libraryObjectId: string | null;
};

export type SourceImportHandoffR0 = {
  handoffId: string;
  unitCandidateId: string;
  sourceDocumentId: string;
  revisionId: string;
  revisionHash: string;
  executionBriefId: string;
  attentionContextHash: string;
  authorQuestion: string;
  createdAt: string;
};

export type SourceImportDocumentR0 = {
  version: typeof SOURCE_IMPORT_REVIEW_R0_VERSION;
  sourceDocumentId: string;
  projectId: string;
  filename: string;
  title: string;
  format: "md" | "txt";
  mode: SourceImportModeR0;
  currentRevisionId: string;
  currentRevisionHash: string;
  revisions: SourceRevisionR0[];
  candidates: SourceImportCandidateR0[];
  revisionReceipts: SourceImportRevisionReceiptR0[];
  handoffs: SourceImportHandoffR0[];
  createdAt: string;
  updatedAt: string;
  libraryObjectId: string | null;
};

export type SourceImportKnownObjectR0 = {
  id: string;
  type: SourceImportDuplicateMatchR0["objectType"];
  title: string;
  aliases?: string[];
};

export type ImportSourceDocumentInputR0 = {
  projectPath: string;
  projectId: string;
  filename: string;
  title?: string;
  content: string;
  mode?: SourceImportModeR0;
  now?: string;
  libraryObjectId?: string | null;
};

export type ExtractSourceCandidatesInputR0 = {
  projectPath: string;
  projectId: string;
  sourceDocumentId: string;
  knownObjects?: SourceImportKnownObjectR0[];
  now?: string;
};

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_REVISIONS = 64;
const MAX_CANDIDATES = 2_000;
const SOURCE_DIRECTORY = path.join(".world-os", "story-intelligence", "source-import-reviews");
const FILENAME_PATTERN = /^[^/\\\0]{1,180}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
let writeSequence = 0;

export function sourceImportPath(projectPath: string, sourceDocumentId: string): string {
  return path.join(projectPath, SOURCE_DIRECTORY, `${sourceDocumentId}.json`);
}

export function importSourceDocumentR0(input: ImportSourceDocumentInputR0): { document: SourceImportDocumentR0; idempotent: boolean; newRevision: boolean } {
  const projectId = requireId(input.projectId, "Project identifier");
  const filename = requireFilename(input.filename);
  const content = requireContent(input.content);
  const now = requireTimestamp(input.now ?? new Date().toISOString());
  const format = formatForFilename(filename);
  const sourceDocumentId = `source.${stableHash({ projectId, filename: filename.normalize("NFC") }).slice(0, 24)}`;
  const existing = readSourceImportR0(input.projectPath, sourceDocumentId);
  const revisionHash = sha256(content);
  if (existing && existing.projectId !== projectId) throw new Error("Source document belongs to another project.");
  if (existing && existing.currentRevisionHash === revisionHash) {
    if (input.libraryObjectId && !existing.libraryObjectId) {
      const updated = writeSourceImportR0(input.projectPath, { ...existing, libraryObjectId: input.libraryObjectId, updatedAt: now });
      return { document: updated, idempotent: true, newRevision: false };
    }
    return { document: existing, idempotent: true, newRevision: false };
  }
  if (existing && existing.revisions.length >= MAX_REVISIONS) throw new Error("Source document revision history is full; export or archive it before importing again.");
  const revisionId = `revision.${revisionHash.slice(0, 24)}`;
  const revision: SourceRevisionR0 = {
    revisionId,
    revisionHash,
    format,
    content,
    segments: buildSegments(sourceDocumentId, revisionId, revisionHash, content),
    importedAt: now
  };
  const document: SourceImportDocumentR0 = existing
    ? {
      ...existing,
      mode: input.mode ?? existing.mode,
      currentRevisionId: revisionId,
      currentRevisionHash: revisionHash,
      revisions: [...existing.revisions, revision],
      candidates: existing.candidates.map((candidate) => candidate.revisionHash === existing.currentRevisionHash && candidate.status === "pending" ? { ...candidate, status: "stale" as const } : candidate),
      revisionReceipts: [...existing.revisionReceipts, { sourceDocumentId, revisionId, revisionHash, importedAt: now, sourceMode: input.mode ?? existing.mode, libraryObjectId: input.libraryObjectId ?? null }],
      updatedAt: now,
      libraryObjectId: existing.libraryObjectId ?? input.libraryObjectId ?? null
    }
    : {
      version: SOURCE_IMPORT_REVIEW_R0_VERSION,
      sourceDocumentId,
      projectId,
      filename,
      title: input.title?.trim() || filename.replace(/\.(?:md|markdown|txt)$/iu, ""),
      format,
      mode: input.mode ?? "reference-only",
      currentRevisionId: revisionId,
      currentRevisionHash: revisionHash,
      revisions: [revision],
      candidates: [],
      revisionReceipts: [{ sourceDocumentId, revisionId, revisionHash, importedAt: now, sourceMode: input.mode ?? "reference-only", libraryObjectId: input.libraryObjectId ?? null }],
      handoffs: [],
      createdAt: now,
      updatedAt: now,
      libraryObjectId: input.libraryObjectId ?? null
    };
  return { document: writeSourceImportR0(input.projectPath, document), idempotent: false, newRevision: true };
}

export function listSourceImportDocumentsR0(projectPath: string, projectId?: string): SourceImportDocumentR0[] {
  const directory = path.join(projectPath, SOURCE_DIRECTORY);
  if (!existsSync(directory)) return [];
  return readFileNames(directory)
    .map((filename) => readSourceImportR0(projectPath, filename.replace(/\.json$/u, "")))
    .filter((document): document is SourceImportDocumentR0 => Boolean(document && (!projectId || document.projectId === projectId)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.sourceDocumentId.localeCompare(right.sourceDocumentId));
}

export function readSourceImportR0(projectPath: string, sourceDocumentId: string): SourceImportDocumentR0 | null {
  const target = sourceImportPath(projectPath, requireId(sourceDocumentId, "Source document identifier"));
  if (!existsSync(target)) return null;
  const value = JSON.parse(readFileSync(target, "utf8")) as unknown;
  return normalizeDocument(value);
}

export function extractSourceCandidatesR0(input: ExtractSourceCandidatesInputR0): SourceImportDocumentR0 {
  const document = readSourceImportR0(input.projectPath, input.sourceDocumentId);
  if (!document || document.projectId !== input.projectId) throw new Error("Source document is unavailable.");
  const revision = document.revisions.find((item) => item.revisionId === document.currentRevisionId);
  if (!revision || revision.revisionHash !== document.currentRevisionHash) throw new Error("Current source revision is unavailable; extraction stopped.");
  const now = requireTimestamp(input.now ?? new Date().toISOString());
  const candidates = deterministicCandidates(document, revision, input.knownObjects ?? []);
  const previousByKey = new Map<string, SourceImportCandidateR0>(document.candidates.filter((candidate) => candidate.revisionId === revision.revisionId).map((candidate) => [candidateKey(candidate), candidate] as [string, SourceImportCandidateR0]));
  const merged = candidates.map((candidate) => previousByKey.get(candidateKey(candidate)) ? { ...candidate, ...previousByKey.get(candidateKey(candidate)) } : candidate);
  const next: SourceImportDocumentR0 = {
    ...document,
    mode: "extract-review",
    candidates: [...document.candidates.filter((candidate) => candidate.revisionId !== revision.revisionId), ...merged].slice(0, MAX_CANDIDATES),
    updatedAt: now
  };
  return writeSourceImportR0(input.projectPath, next);
}

export function decideSourceCandidateR0(input: {
  projectPath: string;
  projectId: string;
  sourceDocumentId: string;
  candidateId: string;
  decision: "accepted" | "rejected" | "merged";
  targetObjectId?: string | null;
  authorControlReviewId?: string | null;
  now?: string;
}): SourceImportDocumentR0 {
  const document = readSourceImportR0(input.projectPath, input.sourceDocumentId);
  if (!document || document.projectId !== input.projectId) throw new Error("Source document is unavailable.");
  const candidate = document.candidates.find((item) => item.candidateId === input.candidateId);
  if (!candidate) throw new Error("Source candidate does not exist.");
  if (candidate.revisionHash !== document.currentRevisionHash) throw new Error("Source candidate is stale; review the current revision instead.");
  if (candidate.status !== "pending" && candidate.status !== input.decision) throw new Error("Source candidate already has a different author decision.");
  if (input.decision === "merged" && !input.targetObjectId?.trim()) throw new Error("Merge requires an explicit existing object target.");
  if (input.decision !== "merged" && input.targetObjectId) throw new Error("Only merge decisions may carry a target object.");
  const now = requireTimestamp(input.now ?? new Date().toISOString());
  const candidates = document.candidates.map((item) => item.candidateId === candidate.candidateId
    ? { ...item, status: input.decision, targetObjectId: input.targetObjectId ?? null, authorControlReviewId: input.authorControlReviewId ?? item.authorControlReviewId }
    : item);
  return writeSourceImportR0(input.projectPath, { ...document, candidates, updatedAt: now });
}

export function attachAuthorControlReviewR0(input: {
  projectPath: string;
  projectId: string;
  sourceDocumentId: string;
  candidateIds: string[];
  reviewId: string;
  now?: string;
}): SourceImportDocumentR0 {
  const document = readSourceImportR0(input.projectPath, input.sourceDocumentId);
  if (!document || document.projectId !== input.projectId) throw new Error("Source document is unavailable.");
  const candidateIds = new Set(input.candidateIds);
  if (!candidateIds.size) throw new Error("At least one source candidate is required for Author Control.");
  const missing = [...candidateIds].find((candidateId) => !document.candidates.some((candidate) => candidate.candidateId === candidateId));
  if (missing) throw new Error("Author Control candidate is not part of this source document.");
  const now = requireTimestamp(input.now ?? new Date().toISOString());
  return writeSourceImportR0(input.projectPath, {
    ...document,
    candidates: document.candidates.map((candidate) => candidateIds.has(candidate.candidateId) ? { ...candidate, authorControlReviewId: input.reviewId } : candidate),
    updatedAt: now
  });
}

export function createSourceImportHandoffR0(input: {
  projectPath: string;
  projectId: string;
  sourceDocumentId: string;
  unitCandidateId: string;
  executionBriefId: string;
  attentionContextHash: string;
  authorQuestion: string;
  now?: string;
}): SourceImportDocumentR0 {
  const document = readSourceImportR0(input.projectPath, input.sourceDocumentId);
  if (!document || document.projectId !== input.projectId) throw new Error("Source document is unavailable.");
  const candidate = document.candidates.find((item) => item.candidateId === input.unitCandidateId);
  if (!candidate || candidate.kind !== "unit") throw new Error("Only a reviewed Unit can be handed to Nuwa.");
  if (candidate.status !== "accepted" && candidate.status !== "merged") throw new Error("Unit must be explicitly reviewed before Nuwa handoff.");
  if (candidate.revisionHash !== document.currentRevisionHash) throw new Error("Unit source revision is stale; handoff stopped.");
  const now = requireTimestamp(input.now ?? new Date().toISOString());
  const handoffId = `handoff.${stableHash({ sourceDocumentId: input.sourceDocumentId, unitCandidateId: input.unitCandidateId, executionBriefId: input.executionBriefId, revision: candidate.revisionHash }).slice(0, 24)}`;
  if (document.handoffs.some((handoff) => handoff.handoffId === handoffId)) return document;
  const handoff: SourceImportHandoffR0 = {
    handoffId,
    unitCandidateId: input.unitCandidateId,
    sourceDocumentId: document.sourceDocumentId,
    revisionId: candidate.revisionId,
    revisionHash: candidate.revisionHash,
    executionBriefId: requireId(input.executionBriefId, "Execution Brief identifier"),
    attentionContextHash: requireHash(input.attentionContextHash, "Attention Context hash"),
    authorQuestion: requireText(input.authorQuestion, "Author question", 1000),
    createdAt: now
  };
  return writeSourceImportR0(input.projectPath, { ...document, handoffs: [...document.handoffs, handoff], updatedAt: now });
}

function deterministicCandidates(document: SourceImportDocumentR0, revision: SourceRevisionR0, knownObjects: SourceImportKnownObjectR0[]): SourceImportCandidateR0[] {
  const candidates: SourceImportCandidateR0[] = [];
  for (const segment of revision.segments) {
    const trimmed = segment.text.replace(/^#+\s*/u, "").trim();
    if (!trimmed) continue;
    if (segment.headingLevel === 1) candidates.push(candidateFromSegment(document, revision, segment, "unit", trimmed, "一级标题确定性映射为 Story Unit 候选。", knownObjects));
    if (segment.headingLevel === 2) candidates.push(candidateFromSegment(document, revision, segment, "beat", trimmed, "二级标题确定性映射为 Beat 候选。", knownObjects));
    const patterns: Array<[SourceImportCandidateKindR0, RegExp, string]> = [
      ["actor", /(?:人物|角色)\s*[:：]\s*([^，。；\n]+)/u, "显式人物标签。"],
      ["entity", /(?:地点|物品|实体)\s*[:：]\s*([^，。；\n]+)/u, "显式对象标签。"],
      ["fact", /(?:事实|秘密|规则)\s*[:：]\s*([^。；\n]+)/u, "显式事实或秘密标签。"],
      ["event", /事件\s*[:：]\s*([^。；\n]+)/u, "显式事件标签。"]
    ];
    for (const [kind, pattern, reason] of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) candidates.push(candidateFromSegment(document, revision, segment, kind, match[1].trim(), reason, knownObjects));
    }
    for (const match of trimmed.matchAll(/@([\p{L}\p{N}·_-]{2,40})/gu)) {
      const label = match[1]?.trim();
      if (label) candidates.push(candidateFromSegment(document, revision, segment, "actor", label, "作者显式 @ 引用。", knownObjects));
    }
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateFromSegment(document: SourceImportDocumentR0, revision: SourceRevisionR0, segment: SourceSegmentR0, kind: SourceImportCandidateKindR0, displayName: string, extractionReason: string, knownObjects: SourceImportKnownObjectR0[]): SourceImportCandidateR0 {
  const anchor = anchorForSegment(document.sourceDocumentId, revision, segment);
  const duplicateMatches = (kind === "actor" || kind === "entity")
    ? knownObjects.filter((object) => object.title.normalize("NFC") === displayName.normalize("NFC") || (object.aliases || []).some((alias) => alias.normalize("NFC") === displayName.normalize("NFC"))).slice(0, 8).map((object) => ({ objectId: object.id, objectType: object.type, displayName: object.title, reason: "名称或别名完全相同；仅提示可能重复，不自动合并。" }))
    : [];
  return {
    candidateId: `candidate.${stableHash({ sourceDocumentId: document.sourceDocumentId, revisionId: revision.revisionId, kind, displayName, anchor: anchor.excerptHash }).slice(0, 24)}`,
    kind,
    displayName: displayName.slice(0, 160),
    summary: segment.text.slice(0, 240),
    anchor,
    excerpt: anchor.excerpt,
    extractionReason,
    revisionId: revision.revisionId,
    revisionHash: revision.revisionHash,
    provenance: { extractor: SOURCE_IMPORT_EXTRACTOR_R0, sourceDocumentId: document.sourceDocumentId, sourceRevisionHash: revision.revisionHash },
    status: "pending",
    duplicateMatches,
    targetObjectId: null,
    authorControlReviewId: null
  };
}

function buildSegments(sourceDocumentId: string, revisionId: string, revisionHash: string, content: string): SourceSegmentR0[] {
  const lines = content.split(/\n/u);
  let offset = 0;
  return lines.map((line, index) => {
    const charStart = offset;
    const charEnd = charStart + line.length;
    offset = charEnd + 1;
    const heading = line.match(/^(#{1,6})\s+/u);
    return {
      blockId: `block.${stableHash({ sourceDocumentId, revisionId, revisionHash, line: index + 1, lineHash: sha256(line) }).slice(0, 20)}`,
      lineStart: index + 1,
      lineEnd: index + 1,
      charStart,
      charEnd,
      headingLevel: heading ? heading[1].length : null,
      text: line
    };
  });
}

function anchorForSegment(sourceDocumentId: string, revision: SourceRevisionR0, segment: SourceSegmentR0): SourceAnchorR0 {
  const excerpt = segment.text.slice(0, 480);
  return {
    sourceDocumentId,
    revisionId: revision.revisionId,
    revisionHash: revision.revisionHash,
    lineStart: segment.lineStart,
    lineEnd: segment.lineEnd,
    charStart: segment.charStart,
    charEnd: segment.charEnd,
    excerptHash: sha256(excerpt),
    excerpt,
    blockId: segment.blockId
  };
}

function candidateKey(candidate: Pick<SourceImportCandidateR0, "kind" | "displayName" | "revisionId">): string {
  return `${candidate.revisionId}:${candidate.kind}:${candidate.displayName.normalize("NFC")}`;
}

function writeSourceImportR0(projectPath: string, document: SourceImportDocumentR0): SourceImportDocumentR0 {
  const target = sourceImportPath(projectPath, document.sourceDocumentId);
  const directory = path.dirname(target);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${String(++writeSequence).padStart(6, "0")}`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);
  return structuredClone(document);
}

function readFileNames(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
}

function normalizeDocument(value: unknown): SourceImportDocumentR0 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Source import record is malformed.");
  const document = value as Partial<SourceImportDocumentR0>;
  if (document.version !== SOURCE_IMPORT_REVIEW_R0_VERSION) throw new Error("Unsupported source import record version.");
  if (typeof document.sourceDocumentId !== "string" || typeof document.projectId !== "string" || !Array.isArray(document.revisions) || !Array.isArray(document.candidates) || !Array.isArray(document.handoffs)) throw new Error("Source import record is incomplete.");
  return structuredClone(document as SourceImportDocumentR0);
}

function requireFilename(value: unknown): string {
  if (typeof value !== "string" || !FILENAME_PATTERN.test(value.trim()) || !/\.(?:md|markdown|txt)$/iu.test(value.trim())) throw new Error("Only TXT and Markdown imports are supported.");
  return value.trim();
}

function requireContent(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") > MAX_SOURCE_BYTES) throw new Error("Imported text is invalid.");
  return value;
}

function formatForFilename(filename: string): "md" | "txt" {
  return /\.txt$/iu.test(filename) ? "txt" : "md";
}

function requireTimestamp(value: string): string {
  if (!TIMESTAMP_PATTERN.test(value)) throw new Error("Timestamp is invalid.");
  return value;
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,180}$/u.test(value.trim())) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function requireText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function requireHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}
