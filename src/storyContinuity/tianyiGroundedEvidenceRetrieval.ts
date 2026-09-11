/**
 * Deterministic, local evidence ranking for Tianyi's author work surface.
 *
 * This is deliberately a selection helper, not an index or source owner. The
 * caller still sends only version-bound StoryStudioEventReference values to
 * the Grounded Context Gate, which re-reads every source before any bytes can
 * reach a model.
 */
/** Keep automatic selection inside the same request contract as explicit refs. */
export const TIANYI_GROUNDED_EVIDENCE_LIMIT = 6;

export type TianyiGroundedEvidenceScope = "current-story" | "current-unit" | "selected-events";

export type TianyiGroundedEvidenceEvent = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "planned" | "committed";
  revisionToken: string;
};

export type TianyiGroundedEvidenceItem = {
  event: TianyiGroundedEvidenceEvent;
  score: number;
  reason: string;
  excerpt: string;
  pinned: boolean;
};

export type TianyiGroundedEvidenceSelection = {
  scope: TianyiGroundedEvidenceScope;
  question: string;
  selected: TianyiGroundedEvidenceItem[];
  omittedCount: number;
  availableCount: number;
  automaticMatchCount: number;
};

/**
 * Scores title/body terms without network or model work. Explicitly selected
 * events are retained even when their wording does not match the question;
 * pinned events are ordered ahead of ordinary ranked results.
 */
export function selectTianyiGroundedEvidence(input: {
  scope: TianyiGroundedEvidenceScope;
  question: string;
  events: readonly TianyiGroundedEvidenceEvent[];
  explicitEventIds?: readonly string[];
  pinnedEventIds?: readonly string[];
  removedEventIds?: readonly string[];
  limit?: number;
}): TianyiGroundedEvidenceSelection {
  const limit = requireLimit(input.limit ?? TIANYI_GROUNDED_EVIDENCE_LIMIT);
  const question = normalizeQuestion(input.question);
  const explicit = new Set(input.explicitEventIds ?? []);
  const pinned = new Set(input.pinnedEventIds ?? []);
  const removed = new Set(input.removedEventIds ?? []);
  const candidates = input.events
    .filter((event) => !removed.has(event.id))
    .map((event) => scoreEvent(event, question, pinned.has(event.id)))
    .sort((left, right) => {
      const leftExplicit = explicit.has(left.event.id);
      const rightExplicit = explicit.has(right.event.id);
      if (leftExplicit !== rightExplicit) return leftExplicit ? -1 : 1;
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      if (left.score !== right.score) return right.score - left.score;
      return left.event.id.localeCompare(right.event.id, "zh-CN");
    });

  const forced = candidates.filter((item) => explicit.has(item.event.id) || pinned.has(item.event.id));
  const rankedMatches = candidates.filter((item) => !explicit.has(item.event.id) && !pinned.has(item.event.id) && item.score > 0);
  // Explicit selection and pinning are author boundaries. The caller must keep
  // them within the shared request contract; unrelated automatic events never
  // fill a result merely because the current scope is non-empty.
  if (forced.length > limit) throw new Error("Tianyi grounded explicit evidence exceeds the request limit.");
  const selected = [...forced, ...rankedMatches].slice(0, limit);
  return {
    scope: input.scope,
    question,
    selected,
    omittedCount: Math.max(0, candidates.length - selected.length),
    availableCount: candidates.length,
    automaticMatchCount: rankedMatches.length
  };
}

function scoreEvent(event: TianyiGroundedEvidenceEvent, question: string, pinned: boolean): TianyiGroundedEvidenceItem {
  const normalizedTitle = normalizeText(event.title);
  const normalizedBody = normalizeText(event.body);
  const terms = queryTerms(question);
  const titleMatches = terms.filter((term) => normalizedTitle.includes(term));
  const bodyMatches = terms.filter((term) => normalizedBody.includes(term));
  const exactQuestion = question.length > 1 && normalizedBody.includes(question);
  const score = titleMatches.length * 12 + bodyMatches.length * 4 + (exactQuestion ? 8 : 0);
  const matched = titleMatches[0] ?? bodyMatches[0] ?? null;
  return {
    event,
    score,
    pinned,
    reason: matched ? `匹配“${matched}”${titleMatches.length ? "（标题）" : "（正文）"}` : "作为当前范围内的可核验事件保留",
    excerpt: excerptAround(event.body, matched),
  };
}

function normalizeQuestion(value: string): string {
  return normalizeText(value).slice(0, 4_000);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("zh-CN");
}

function queryTerms(question: string): string[] {
  const words = question.match(/[\p{Script=Han}]{2,}|[\p{L}\p{N}_-]{2,}/gu) ?? [];
  const terms = new Set<string>();
  for (const word of words) {
    terms.add(word);
    if (/^[\p{Script=Han}]+$/u.test(word) && word.length > 2) {
      for (let width = Math.min(4, word.length); width >= 2; width -= 1) {
        for (let index = 0; index <= word.length - width; index += 1) terms.add(word.slice(index, index + width));
      }
    }
  }
  return [...terms].filter((term) => term.length > 1).sort((left, right) => right.length - left.length || left.localeCompare(right, "zh-CN"));
}

function excerptAround(body: string, matched: string | null): string {
  const compact = body.replace(/\s+/gu, " ").trim();
  if (!compact) return "正文为空；仅保留事件身份与修订。";
  const found = matched ? compact.toLocaleLowerCase("zh-CN").indexOf(matched) : -1;
  if (found < 0) return compact.slice(0, 180);
  const start = Math.max(0, found - 48);
  const end = Math.min(compact.length, found + matched!.length + 110);
  return `${start ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;
}

function requireLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 64) throw new Error("Tianyi grounded evidence limit is invalid.");
  return value;
}
