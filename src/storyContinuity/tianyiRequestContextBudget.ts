import { CONTINUITY_ID_PATTERN, CONTINUITY_MAX_ID_LENGTH } from "./continuityTypes.ts";

export const TIANYI_REQUEST_CONTEXT_BUDGET_PROJECTION_VERSION = "story-tianyi-request-context-budget-projection/v1" as const;
export const TIANYI_REQUEST_CONTEXT_ESTIMATOR = "nfc-unicode-code-points-v1" as const;
export const TIANYI_REQUEST_CONTEXT_ESTIMATE_UNIT = "unicode-code-point" as const;

const MAX_HARD_BUDGET_UNITS = 2_000_000;
const MAX_CURRENT_CONTEXT_ITEMS = 16;
const MAX_AUTHOR_SELECTED_SOURCES = 64;
const MAX_AUTHORIZED_MEMORIES = 32;
const MAX_RECENT_MESSAGES = 128;
const MAX_CANDIDATE_CODE_POINTS = 1_000_000;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export type TianyiRequestSourceRole = "current-context" | "author-selected-source" | "authorized-memory";
export type TianyiRequestContextExclusionReason =
  | "hard-budget-exceeded"
  | "projection-blocked"
  | "recent-message-window-closed"
  | "required-context-exceeds-hard-budget";

export type TianyiRequestContextBlockedReason =
  | "required-current-context-missing"
  | "required-context-exceeds-hard-budget";

export type TianyiRequestCurrentContext = {
  id: string;
  contentHash: string;
  content: string;
  state: "current";
};

export type TianyiRequestAuthorSelectedSource = TianyiRequestCurrentContext & {
  authorSelected: true;
};

export type TianyiRequestAuthorizedMemory = TianyiRequestCurrentContext & {
  scope: "project" | "author-global";
  authorization: "authorized";
  grantHash: string | null;
};

export type TianyiRequestRecentMessage = TianyiRequestCurrentContext & {
  sessionId: string;
  sequence: number;
};

export type TianyiRequestContextBudgetInput = {
  hardBudgetUnits: number;
  currentContext: TianyiRequestCurrentContext[];
  authorSelectedSources: TianyiRequestAuthorSelectedSource[];
  authorizedMemories: TianyiRequestAuthorizedMemory[];
  recentMessages: TianyiRequestRecentMessage[];
};

export type TianyiRequestContextIncludedSource = {
  id: string;
  role: TianyiRequestSourceRole;
  estimatedUnits: number;
};

export type TianyiRequestContextExcludedSource = TianyiRequestContextIncludedSource & {
  reason: TianyiRequestContextExclusionReason;
};

export type TianyiRequestContextIncludedMessage = {
  id: string;
  sessionId: string;
  sequence: number;
  estimatedUnits: number;
};

export type TianyiRequestContextExcludedMessage = TianyiRequestContextIncludedMessage & {
  reason: TianyiRequestContextExclusionReason;
};

export type TianyiRequestContextBudgetProjection = {
  version: typeof TIANYI_REQUEST_CONTEXT_BUDGET_PROJECTION_VERSION;
  status: "ready" | "blocked";
  blockedReason: TianyiRequestContextBlockedReason | null;
  budget: {
    estimator: typeof TIANYI_REQUEST_CONTEXT_ESTIMATOR;
    unit: typeof TIANYI_REQUEST_CONTEXT_ESTIMATE_UNIT;
    hardLimitUnits: number;
    estimatedInputUnits: number;
    estimatedIncludedUnits: number;
    remainingUnits: number;
  };
  sources: {
    included: TianyiRequestContextIncludedSource[];
    excluded: TianyiRequestContextExcludedSource[];
  };
  messages: {
    included: TianyiRequestContextIncludedMessage[];
    excluded: TianyiRequestContextExcludedMessage[];
  };
  archivePolicy: "preserve-complete-archive";
  semanticCompressionApplied: false;
  deterministic: true;
};

type NormalizedSource = TianyiRequestContextIncludedSource & { content: string };
type NormalizedMessage = TianyiRequestContextIncludedMessage & { content: string };

/**
 * Estimates provider-neutral request units without tokenization or semantic
 * compression. The estimate is the NFC-normalized Unicode code-point count,
 * with an empty item charged one unit so zero-length candidates cannot bypass
 * the hard request budget.
 */
export function estimateTianyiRequestContextUnits(content: string): number {
  if (typeof content !== "string") throw new Error("Tianyi request context content is invalid.");
  const normalized = normalizeNfc(content);
  const count = Array.from(normalized).length;
  if (count > MAX_CANDIDATE_CODE_POINTS) throw new Error("Tianyi request context content is too large.");
  return Math.max(1, count);
}

/**
 * Builds an ephemeral request-level projection. It owns no Session, Archive,
 * Memory, Context Receipt, or story content and performs no persistence. Every
 * candidate is either included whole or excluded with an explicit reason.
 */
export function buildTianyiRequestContextBudgetProjection(rawInput: TianyiRequestContextBudgetInput): TianyiRequestContextBudgetProjection {
  const input = normalizeInput(rawInput);
  const current = input.currentContext.map((item) => source(item, "current-context")).sort(compareSources);
  const selected = input.authorSelectedSources.map((item) => source(item, "author-selected-source")).sort(compareSources);
  const memories = input.authorizedMemories.map((item) => source(item, "authorized-memory")).sort(compareSources);
  const messages = input.recentMessages.map(message).sort(compareMessagesChronologically);
  assertUniqueSources([...current, ...selected, ...memories]);
  assertUniqueMessages(messages);

  const estimatedInputUnits = [...current, ...selected, ...memories, ...messages]
    .reduce((total, item) => total + item.estimatedUnits, 0);
  if (current.length === 0) {
    return blockedProjection(input.hardBudgetUnits, estimatedInputUnits, "required-current-context-missing", current, selected, memories, messages);
  }

  const requiredUnits = current.reduce((total, item) => total + item.estimatedUnits, 0);
  if (requiredUnits > input.hardBudgetUnits) {
    return blockedProjection(input.hardBudgetUnits, estimatedInputUnits, "required-context-exceeds-hard-budget", current, selected, memories, messages);
  }

  const includedSources: TianyiRequestContextIncludedSource[] = current.map(withoutContent);
  const excludedSources: TianyiRequestContextExcludedSource[] = [];
  let used = requiredUnits;

  for (const candidate of [...selected, ...memories]) {
    if (used + candidate.estimatedUnits <= input.hardBudgetUnits) {
      includedSources.push(withoutContent(candidate));
      used += candidate.estimatedUnits;
    } else {
      excludedSources.push({ ...withoutContent(candidate), reason: "hard-budget-exceeded" });
    }
  }

  const includedMessages: TianyiRequestContextIncludedMessage[] = [];
  const excludedMessages: TianyiRequestContextExcludedMessage[] = [];
  let recentWindowClosed = false;
  for (const candidate of [...messages].sort(compareMessagesNewestFirst)) {
    if (!recentWindowClosed && used + candidate.estimatedUnits <= input.hardBudgetUnits) {
      includedMessages.push(withoutMessageContent(candidate));
      used += candidate.estimatedUnits;
      continue;
    }
    const reason = recentWindowClosed ? "recent-message-window-closed" : "hard-budget-exceeded";
    excludedMessages.push({ ...withoutMessageContent(candidate), reason });
    recentWindowClosed = true;
  }

  return {
    version: TIANYI_REQUEST_CONTEXT_BUDGET_PROJECTION_VERSION,
    status: "ready",
    blockedReason: null,
    budget: budget(input.hardBudgetUnits, estimatedInputUnits, used),
    sources: { included: includedSources, excluded: excludedSources },
    messages: {
      included: includedMessages.sort(compareMessagesChronologically),
      excluded: excludedMessages.sort(compareMessagesChronologically)
    },
    archivePolicy: "preserve-complete-archive",
    semanticCompressionApplied: false,
    deterministic: true
  };
}

function normalizeInput(value: TianyiRequestContextBudgetInput): TianyiRequestContextBudgetInput {
  const input = plainObject(value, "Tianyi request context budget input");
  exact(input, ["hardBudgetUnits", "currentContext", "authorSelectedSources", "authorizedMemories", "recentMessages"], "Tianyi request context budget input");
  const hardBudgetUnits = positiveInteger(input.hardBudgetUnits, "Tianyi request hard budget", MAX_HARD_BUDGET_UNITS);
  return {
    hardBudgetUnits,
    currentContext: boundedArray(input.currentContext, "Tianyi current context", MAX_CURRENT_CONTEXT_ITEMS).map((item) => normalizeCurrent(item, "Tianyi current context")),
    authorSelectedSources: boundedArray(input.authorSelectedSources, "Tianyi author-selected sources", MAX_AUTHOR_SELECTED_SOURCES).map(normalizeSelected),
    authorizedMemories: boundedArray(input.authorizedMemories, "Tianyi authorized Memories", MAX_AUTHORIZED_MEMORIES).map(normalizeMemory),
    recentMessages: boundedArray(input.recentMessages, "Tianyi recent messages", MAX_RECENT_MESSAGES).map(normalizeMessage)
  };
}

function normalizeCurrent(value: unknown, label: string): TianyiRequestCurrentContext {
  const item = plainObject(value, label);
  exact(item, ["id", "contentHash", "content", "state"], label);
  if (item.state !== "current") throw new Error(`${label} is not current.`);
  return {
    id: requireMachineId(item.id, `${label} identifier`),
    contentHash: requireHash(item.contentHash, `${label} content hash`),
    content: normalizedContent(item.content, label),
    state: "current"
  };
}

function normalizeSelected(value: unknown): TianyiRequestAuthorSelectedSource {
  const label = "Tianyi author-selected source";
  const item = plainObject(value, label);
  exact(item, ["id", "contentHash", "content", "state", "authorSelected"], label);
  if (item.authorSelected !== true) throw new Error("Tianyi source lacks explicit author selection.");
  return { ...normalizeCurrentFields(item, label), authorSelected: true };
}

function normalizeMemory(value: unknown): TianyiRequestAuthorizedMemory {
  const label = "Tianyi authorized Memory";
  const item = plainObject(value, label);
  exact(item, ["id", "contentHash", "content", "state", "scope", "authorization", "grantHash"], label);
  if (item.authorization !== "authorized") throw new Error("Tianyi Memory is not authorized.");
  if (item.scope !== "project" && item.scope !== "author-global") throw new Error("Tianyi Memory scope is invalid.");
  const grantHash = item.grantHash === null ? null : requireHash(item.grantHash, "Tianyi Memory grant hash");
  if (item.scope === "project" && grantHash !== null) throw new Error("Project Memory cannot carry a global grant hash.");
  if (item.scope === "author-global" && grantHash === null) throw new Error("Author-global Memory requires a current project grant hash.");
  return { ...normalizeCurrentFields(item, label), scope: item.scope, authorization: "authorized", grantHash };
}

function normalizeMessage(value: unknown): TianyiRequestRecentMessage {
  const label = "Tianyi recent message";
  const item = plainObject(value, label);
  exact(item, ["id", "contentHash", "content", "state", "sessionId", "sequence"], label);
  return {
    ...normalizeCurrentFields(item, label),
    sessionId: requireMachineId(item.sessionId, "Tianyi message Session identifier"),
    sequence: positiveInteger(item.sequence, "Tianyi message sequence", Number.MAX_SAFE_INTEGER)
  };
}

function normalizeCurrentFields(item: Record<string, unknown>, label: string): TianyiRequestCurrentContext {
  if (item.state !== "current") throw new Error(`${label} is not current.`);
  return {
    id: requireMachineId(item.id, `${label} identifier`),
    contentHash: requireHash(item.contentHash, `${label} content hash`),
    content: normalizedContent(item.content, label),
    state: "current"
  };
}

function source(value: TianyiRequestCurrentContext, role: TianyiRequestSourceRole): NormalizedSource {
  return { id: value.id, role, content: value.content, estimatedUnits: estimateTianyiRequestContextUnits(value.content) };
}

function message(value: TianyiRequestRecentMessage): NormalizedMessage {
  return { id: value.id, sessionId: value.sessionId, sequence: value.sequence, content: value.content, estimatedUnits: estimateTianyiRequestContextUnits(value.content) };
}

function blockedProjection(
  hardLimitUnits: number,
  estimatedInputUnits: number,
  blockedReason: TianyiRequestContextBlockedReason,
  current: NormalizedSource[],
  selected: NormalizedSource[],
  memories: NormalizedSource[],
  messages: NormalizedMessage[]
): TianyiRequestContextBudgetProjection {
  const requiredReason = blockedReason === "required-context-exceeds-hard-budget"
    ? "required-context-exceeds-hard-budget"
    : "projection-blocked";
  return {
    version: TIANYI_REQUEST_CONTEXT_BUDGET_PROJECTION_VERSION,
    status: "blocked",
    blockedReason,
    budget: budget(hardLimitUnits, estimatedInputUnits, 0),
    sources: {
      included: [],
      excluded: [
        ...current.map((item) => ({ ...withoutContent(item), reason: requiredReason } as TianyiRequestContextExcludedSource)),
        ...[...selected, ...memories].map((item) => ({ ...withoutContent(item), reason: "projection-blocked" as const }))
      ]
    },
    messages: {
      included: [],
      excluded: messages.map((item) => ({ ...withoutMessageContent(item), reason: "projection-blocked" }))
    },
    archivePolicy: "preserve-complete-archive",
    semanticCompressionApplied: false,
    deterministic: true
  };
}

function budget(hardLimitUnits: number, estimatedInputUnits: number, estimatedIncludedUnits: number): TianyiRequestContextBudgetProjection["budget"] {
  return {
    estimator: TIANYI_REQUEST_CONTEXT_ESTIMATOR,
    unit: TIANYI_REQUEST_CONTEXT_ESTIMATE_UNIT,
    hardLimitUnits,
    estimatedInputUnits,
    estimatedIncludedUnits,
    remainingUnits: hardLimitUnits - estimatedIncludedUnits
  };
}

function withoutContent(value: NormalizedSource): TianyiRequestContextIncludedSource {
  return { id: value.id, role: value.role, estimatedUnits: value.estimatedUnits };
}

function withoutMessageContent(value: NormalizedMessage): TianyiRequestContextIncludedMessage {
  return { id: value.id, sessionId: value.sessionId, sequence: value.sequence, estimatedUnits: value.estimatedUnits };
}

function assertUniqueSources(values: NormalizedSource[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw new Error(`Duplicate Tianyi request source identifier: ${value.id}`);
    seen.add(value.id);
  }
}

function assertUniqueMessages(values: NormalizedMessage[]): void {
  const ids = new Set<string>();
  const sequences = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`Duplicate Tianyi request message identifier: ${value.id}`);
    ids.add(value.id);
    const sequenceKey = `${value.sessionId}:${value.sequence}`;
    if (sequences.has(sequenceKey)) throw new Error(`Duplicate Tianyi request message sequence: ${sequenceKey}`);
    sequences.add(sequenceKey);
  }
}

function normalizedContent(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} content is invalid.`);
  const normalized = normalizeNfc(value);
  if (Array.from(normalized).length > MAX_CANDIDATE_CODE_POINTS) throw new Error(`${label} content is too large.`);
  return normalized;
}

function boundedArray(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  for (const key of Object.keys(value)) if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`${label} contains a dangerous key.`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${label} contains an unknown field.`);
  for (const key of keys) if (!(key in value)) throw new Error(`${label} is missing ${key}.`);
}

function positiveInteger(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function compareMessagesNewestFirst(left: NormalizedMessage, right: NormalizedMessage): number {
  return right.sequence - left.sequence || compareIds(right.id, left.id);
}

function compareMessagesChronologically(left: TianyiRequestContextIncludedMessage, right: TianyiRequestContextIncludedMessage): number {
  return left.sequence - right.sequence || compareIds(left.id, right.id);
}

function compareSources(left: NormalizedSource, right: NormalizedSource): number {
  return compareIds(left.id, right.id);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNfc(value: string): string {
  const normalized = value.normalize("NFC");
  if (hasMalformedUnicode(normalized)) throw new Error("Tianyi request context text contains malformed Unicode.");
  return normalized;
}

function requireMachineId(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = normalizeNfc(value);
  if (normalized.length > CONTINUITY_MAX_ID_LENGTH || !CONTINUITY_ID_PATTERN.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function requireHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function hasMalformedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}
