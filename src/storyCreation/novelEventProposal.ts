import {
  blockText,
  replaceBlockTextPreservingReferences,
  validateNovelDocumentModelR1,
  withRevision,
  type NovelDocumentModelR1
} from "./novelDocumentModelR1.ts";

export const NOVEL_EVENT_PROPOSAL_VERSION = "tianyan-novel-event-proposal/v2" as const;
export const LEGACY_NOVEL_EVENT_PROPOSAL_VERSION = "tianyan-novel-event-proposal/v1" as const;

export type NovelNarrativeDiff = {
  removed: string;
  preserved: string;
  added: string;
};

export type NovelEventProposal = {
  version: typeof NOVEL_EVENT_PROPOSAL_VERSION;
  proposalId: string;
  sourceEventId: string;
  sourceEventRevision: string;
  targetDocumentId: string;
  targetBlockId: string;
  /** Author-visible content before the proposal. */
  beforeContent: string;
  /** Author-visible content after the proposal; no ids, hashes or debug text. */
  proposedNarrativeContent: string;
  changeSummary: string;
  sourceEventRefs: Array<{ eventId: string; revision: string; kind: "confirmed-event" }>;
  provenance: {
    sourceKind: "confirmed-event";
    sourceId: string;
    sourceRevision: string;
    generatedBy: "deterministic-event-projection";
  };
  technicalMetadata: {
    generatedAt: string;
    legacySource?: { version: typeof LEGACY_NOVEL_EVENT_PROPOSAL_VERSION; rawAfterHash: string };
  };
  generatedAt: string;
  status: "pending" | "accepted" | "rejected";
  decisionAt?: string;
  /** v1-compatible aliases. They intentionally contain narrative only. */
  before: string;
  after: string;
};

export function createNovelEventProposal(input: {
  proposalId: string;
  sourceEventId: string;
  sourceEventRevision: string;
  targetDocumentId: string;
  targetBlockId: string;
  before: string;
  eventTitle: string;
  eventBody: string;
  generatedAt: string;
}): NovelEventProposal {
  const before = boundedText(input.before, "proposal before", 20_000);
  const title = cleanNarrative(input.eventTitle, "event title", 240);
  const body = cleanNarrative(input.eventBody, "event body", 4_000);
  const narrativeAddition = [title, body].filter(Boolean).join("：");
  const proposedNarrativeContent = boundedText(`${before}${before && narrativeAddition ? "\n\n" : ""}${narrativeAddition}`, "proposal narrative", 24_000);
  const generatedAt = bounded(input.generatedAt, "proposal generatedAt", 64);
  const sourceEventId = bounded(input.sourceEventId, "source event id", 180);
  const sourceEventRevision = bounded(input.sourceEventRevision, "source event revision", 180);
  return {
    version: NOVEL_EVENT_PROPOSAL_VERSION,
    proposalId: bounded(input.proposalId, "proposal id", 180),
    sourceEventId,
    sourceEventRevision,
    targetDocumentId: bounded(input.targetDocumentId, "target document id", 180),
    targetBlockId: bounded(input.targetBlockId, "target block id", 180),
    beforeContent: before,
    proposedNarrativeContent,
    changeSummary: `将已确认事件转写为当前段落中的叙事内容：${title || "补充情节信息"}`,
    sourceEventRefs: [{ eventId: sourceEventId, revision: sourceEventRevision, kind: "confirmed-event" }],
    provenance: {
      sourceKind: "confirmed-event",
      sourceId: sourceEventId,
      sourceRevision: sourceEventRevision,
      generatedBy: "deterministic-event-projection"
    },
    technicalMetadata: { generatedAt },
    generatedAt,
    status: "pending",
    before,
    after: proposedNarrativeContent
  };
}

export function validateNovelEventProposal(value: unknown): NovelEventProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Novel Event proposal is invalid.");
  const input = value as Record<string, unknown>;
  if (input.version === LEGACY_NOVEL_EVENT_PROPOSAL_VERSION) return normalizeLegacyProposal(input);
  if (input.version !== NOVEL_EVENT_PROPOSAL_VERSION) throw new Error("Novel Event proposal version is unsupported.");
  const provenance = exactObject(input.provenance, ["sourceKind", "sourceId", "sourceRevision", "generatedBy"], "Novel Event proposal provenance");
  if (provenance.sourceKind !== "confirmed-event" || provenance.generatedBy !== "deterministic-event-projection") throw new Error("Novel Event proposal provenance is invalid.");
  const status = input.status;
  if (status !== "pending" && status !== "accepted" && status !== "rejected") throw new Error("Novel Event proposal status is invalid.");
  const sourceEventRefs = Array.isArray(input.sourceEventRefs) ? input.sourceEventRefs.map((ref) => {
    const item = exactObject(ref, ["eventId", "revision", "kind"], "Novel Event proposal source reference");
    if (item.kind !== "confirmed-event") throw new Error("Novel Event proposal source reference is invalid.");
    return { eventId: bounded(item.eventId, "proposal source event id", 180), revision: bounded(item.revision, "proposal source revision", 180), kind: "confirmed-event" as const };
  }) : [];
  if (!sourceEventRefs.length) throw new Error("Novel Event proposal source references are invalid.");
  const technical = exactObject(input.technicalMetadata, ["generatedAt"], "Novel Event proposal technical metadata", ["legacySource"]);
  const beforeContent = boundedText(input.beforeContent, "proposal before content", 20_000);
  const proposedNarrativeContent = cleanNarrative(input.proposedNarrativeContent, "proposal narrative content", 24_000);
  const result: NovelEventProposal = {
    version: NOVEL_EVENT_PROPOSAL_VERSION,
    proposalId: bounded(input.proposalId, "proposal id", 180),
    sourceEventId: bounded(input.sourceEventId, "source event id", 180),
    sourceEventRevision: bounded(input.sourceEventRevision, "source event revision", 180),
    targetDocumentId: bounded(input.targetDocumentId, "target document id", 180),
    targetBlockId: bounded(input.targetBlockId, "target block id", 180),
    beforeContent,
    proposedNarrativeContent,
    changeSummary: boundedText(input.changeSummary, "proposal change summary", 1_000),
    sourceEventRefs,
    provenance: {
      sourceKind: "confirmed-event",
      sourceId: bounded(provenance.sourceId, "provenance source id", 180),
      sourceRevision: bounded(provenance.sourceRevision, "provenance source revision", 180),
      generatedBy: "deterministic-event-projection"
    },
    technicalMetadata: {
      generatedAt: bounded(technical.generatedAt, "proposal generatedAt", 64),
      ...(technical.legacySource === undefined ? {} : { legacySource: normalizeLegacySource(technical.legacySource) })
    },
    generatedAt: bounded(input.generatedAt, "proposal generatedAt", 64),
    status,
    ...(input.decisionAt === undefined ? {} : { decisionAt: bounded(input.decisionAt, "proposal decisionAt", 64) }),
    before: beforeContent,
    after: proposedNarrativeContent
  };
  if (result.before !== result.beforeContent || result.after !== result.proposedNarrativeContent) {
    throw new Error("Novel Event proposal narrative aliases must match the clean author content.");
  }
  return result;
}

export function buildNovelNarrativeDiff(before: string, after: string): NovelNarrativeDiff {
  const left = boundedText(before, "diff before", 20_000);
  const right = boundedText(after, "diff after", 24_000);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  return {
    removed: left.slice(prefix, left.length - suffix || undefined),
    preserved: left.slice(Math.max(0, prefix - 80), Math.min(left.length, left.length - suffix + 80)),
    added: right.slice(prefix, right.length - suffix || undefined)
  };
}

export function acceptNovelEventProposal(model: NovelDocumentModelR1, value: NovelEventProposal, decidedAt: string): { model: NovelDocumentModelR1; proposal: NovelEventProposal } {
  const proposal = validateNovelEventProposal(value);
  if (proposal.status === "rejected") throw new Error("Rejected Novel Event proposal cannot be accepted.");
  if (model.documentId !== proposal.targetDocumentId) throw new Error("Novel Event proposal target document is stale.");
  const target = model.blocks[proposal.targetBlockId];
  if (!target || target.kind !== "paragraph" || blockText(target) !== proposal.beforeContent) throw new Error("Novel Event proposal target block is stale.");
  const nextModel = withRevision(
    validateNovelDocumentModelR1(replaceBlockTextPreservingReferences(model, proposal.targetBlockId, proposal.proposedNarrativeContent)),
    "proposal",
    decidedAt
  );
  return { model: nextModel, proposal: { ...proposal, status: "accepted", decisionAt: decidedAt } };
}

export function rejectNovelEventProposal(value: NovelEventProposal, decidedAt: string): NovelEventProposal {
  const proposal = validateNovelEventProposal(value);
  if (proposal.status === "accepted") throw new Error("Accepted Novel Event proposal cannot be rejected.");
  return { ...proposal, status: "rejected", decisionAt: decidedAt };
}

function normalizeLegacyProposal(input: Record<string, unknown>): NovelEventProposal {
  const provenance = exactObject(input.provenance, ["sourceKind", "sourceId", "sourceRevision", "generatedBy"], "Legacy Novel Event proposal provenance");
  if (provenance.sourceKind !== "confirmed-event" || provenance.generatedBy !== "deterministic-event-projection") throw new Error("Legacy Novel Event proposal provenance is invalid.");
  const status = input.status;
  if (status !== "pending" && status !== "accepted" && status !== "rejected") throw new Error("Legacy Novel Event proposal status is invalid.");
  const beforeContent = boundedText(input.before, "legacy proposal before", 20_000);
  const rawAfter = boundedText(input.after, "legacy proposal after", 24_000);
  const proposedNarrativeContent = cleanLegacyAfter(rawAfter, beforeContent);
  const sourceEventId = bounded(input.sourceEventId, "source event id", 180);
  const sourceEventRevision = bounded(input.sourceEventRevision, "source event revision", 180);
  const generatedAt = bounded(input.generatedAt, "proposal generatedAt", 64);
  return {
    version: NOVEL_EVENT_PROPOSAL_VERSION,
    proposalId: bounded(input.proposalId, "proposal id", 180),
    sourceEventId,
    sourceEventRevision,
    targetDocumentId: bounded(input.targetDocumentId, "target document id", 180),
    targetBlockId: bounded(input.targetBlockId, "target block id", 180),
    beforeContent,
    proposedNarrativeContent,
    changeSummary: "将已确认事件转写为当前段落中的叙事内容。",
    sourceEventRefs: [{ eventId: sourceEventId, revision: sourceEventRevision, kind: "confirmed-event" }],
    provenance: {
      sourceKind: "confirmed-event",
      sourceId: bounded(provenance.sourceId, "provenance source id", 180),
      sourceRevision: bounded(provenance.sourceRevision, "provenance source revision", 180),
      generatedBy: "deterministic-event-projection"
    },
    technicalMetadata: { generatedAt, legacySource: { version: LEGACY_NOVEL_EVENT_PROPOSAL_VERSION, rawAfterHash: hashLegacy(rawAfter) } },
    generatedAt,
    status,
    ...(input.decisionAt === undefined ? {} : { decisionAt: bounded(input.decisionAt, "proposal decisionAt", 64) }),
    before: beforeContent,
    after: proposedNarrativeContent
  };
}

function cleanLegacyAfter(rawAfter: string, before: string): string {
  const suffix = rawAfter.startsWith(before) ? rawAfter.slice(before.length).replace(/^\s+/u, "") : rawAfter;
  const cleaned = cleanNarrative(suffix.replace(/^【已确认事件[^】]*】/u, ""), "legacy proposal narrative", 24_000);
  return cleaned ? `${before}${before && cleaned ? "\n\n" : ""}${cleaned}` : before;
}

function normalizeLegacySource(value: unknown): { version: typeof LEGACY_NOVEL_EVENT_PROPOSAL_VERSION; rawAfterHash: string } {
  const source = exactObject(value, ["version", "rawAfterHash"], "Novel Event proposal legacy source");
  return { version: source.version === LEGACY_NOVEL_EVENT_PROPOSAL_VERSION ? source.version : (() => { throw new Error("Legacy Novel Event proposal source is invalid."); })(), rawAfterHash: bounded(source.rawAfterHash, "legacy raw after hash", 128) };
}

function cleanNarrative(value: unknown, label: string, maximum: number): string {
  return boundedText(value, label, maximum)
    .replace(/^\s*#+\s*作者选择\s*\n+\s*[^\n]+/gimu, "")
    .replace(/作者选择\s*[^，。\n]+?(?=\s+已确认的事件变化)/gu, "")
    .replace(/已确认的事件变化\s*/gu, "")
    .replace(/作者选择\s*[^，。\n]+$/gu, "")
    .replace(/^\s*#+\s*(?:已确认的事件变化|证据引用)\s*$/gimu, "")
    .replace(/^\s*[-*]?\s*中等风险\s*$/gimu, "")
    .replace(/^\s*[-*]?\s*(?:event|evidence-event|snapshot-evidence)[\w.:-]*[^\n]*$/gimu, "")
    .replace(/^\s*(?:事件记录|变更来源)：[^\n]*$/gimu, "")
    .replace(/中等风险[^。\n]*(?:。|$)/giu, "")
    .replace(/证据引用[^。\n]*(?:。|$)/giu, "")
    .replace(/事件记录：[^。\n]*(?:。|$)/gu, "")
    .replace(/变更来源：[^。\n]*(?:。|$)/gu, "")
    .replace(/\b(?:event|evidence-event|snapshot-evidence|source|trace|candidate|run|provenance|debug|change-set)[\w.:-]*\b[^。\n]*(?:[。.]|$)/giu, "")
    .replace(/\b(?:author-confirmed|snapshot-evidence|source-revision|revision|trace-hash|provenance|debug|change-set)\s*[:=][^\n]*/giu, "")
    .replace(/\b(?:snapshot|hash|eventId|event-id|sourceId|source-id)\s*[:=]\s*[A-Za-z0-9._:-]+/giu, "")
    .replace(/(^|\n)[ \t]*[-*#>`]+[ \t]*/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function exactObject(value: unknown, required: readonly string[], label: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(record).some((key) => !allowed.has(key)) || required.some((key) => !Object.hasOwn(record, key))) throw new Error(`${label} fields are invalid.`);
  return record;
}

function bounded(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  return boundedText(value, label, maximum).trim();
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.normalize("NFC");
  if ([...normalized].length > maximum || /[\u0000\u007F]/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function hashLegacy(value: string): string {
  const seeds = [0x811c9dc5, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35];
  return seeds.map((seed, lane) => {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index) + lane;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }).join("");
}
