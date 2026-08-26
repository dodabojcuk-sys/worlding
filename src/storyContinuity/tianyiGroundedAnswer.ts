export const TIANYI_GROUNDED_ANSWER_VERSION = "story-tianyi-grounded-answer/v1" as const;

export const TIANYI_CLAIM_STATUSES = ["fact", "candidate", "inference", "unknown"] as const;
export type TianyiClaimStatus = typeof TIANYI_CLAIM_STATUSES[number];

export type TianyiGroundedClaim = {
  statement: string;
  status: TianyiClaimStatus;
  sourceRefs: string[];
  uncertaintyReason: string | null;
};

export type TianyiGroundedAnswer = {
  summary: string;
  claims: TianyiGroundedClaim[];
  status: TianyiClaimStatus;
  sourceRefs: string[];
  uncertaintyReason: string | null;
  includedSources: string[];
  excludedSources: Array<{ sourceRef: string; reason: string }>;
};

export type TianyiGroundedAnswerValidationContext = {
  includedSourceRefs: string[];
  excludedSources: Array<{ sourceRef: string; reason: string }>;
};

export type TianyiGroundedValidationDiagnostic = {
  version: "story-tianyi-grounded-validation-diagnostic/v1";
  stage: "json" | "root" | "claim" | "source-set" | "semantic";
  fieldPath: string;
  expected: string;
  actual: string;
  missingSourceRefs: string[];
  unexpectedSourceRefs: string[];
  detail: string;
};

const MAX_SUMMARY_CHARS = 4_000;
const MAX_CLAIMS = 12;
const MAX_CLAIM_CHARS = 1_200;
const MAX_REASON_CHARS = 600;
const MAX_SOURCE_REFS = 512;
const SOURCE_REF_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,511}$/u;

/**
 * Strict schema and domain validation for provider output. JSON parsing alone
 * is deliberately insufficient: citations and epistemic states must match the
 * exact server-resolved transfer set.
 */
export function normalizeTianyiGroundedAnswer(
  value: unknown,
  context: TianyiGroundedAnswerValidationContext
): TianyiGroundedAnswer {
  const included = uniqueSourceRefs(context.includedSourceRefs, "included source references");
  const excluded = normalizeExcludedSources(context.excludedSources);
  const input = plainObject(value, "Tianyi grounded answer");
  exact(input, [
    "summary", "claims", "status", "sourceRefs", "uncertaintyReason",
    "includedSources", "excludedSources"
  ], "Tianyi grounded answer");

  const answer: TianyiGroundedAnswer = {
    summary: text(input.summary, "Grounded answer summary", MAX_SUMMARY_CHARS),
    claims: array(input.claims, "Grounded answer claims", MAX_CLAIMS).map(normalizeClaim),
    status: oneOf(input.status, TIANYI_CLAIM_STATUSES, "Grounded answer status"),
    sourceRefs: uniqueSourceRefs(input.sourceRefs, "Grounded answer source references"),
    uncertaintyReason: nullableText(input.uncertaintyReason, "Grounded answer uncertainty reason", MAX_REASON_CHARS),
    includedSources: uniqueSourceRefs(input.includedSources, "Grounded answer included sources"),
    excludedSources: normalizeExcludedSources(input.excludedSources)
  };

  if (!sameArray(answer.includedSources, included)) throw new Error("Grounded answer included sources do not match the actual transfer set.");
  if (!sameExclusions(answer.excludedSources, excluded)) throw new Error("Grounded answer excluded sources do not match the actual exclusion set.");
  const includedSet = new Set(included);
  const excludedSet = new Set(excluded.map((item) => item.sourceRef));
  for (const sourceRef of answer.sourceRefs) {
    if (!includedSet.has(sourceRef)) throw new Error("Grounded answer cites a source that was not included.");
  }
  for (const claim of answer.claims) validateClaimSemantics(claim, includedSet, excludedSet);

  const claimRefs = [...new Set(answer.claims.flatMap((claim) => claim.sourceRefs))];
  if (answer.sourceRefs.some((ref) => !claimRefs.includes(ref))) throw new Error("Grounded answer top-level citations are not used by any claim.");
  if (answer.status === "fact" && !answer.claims.some((claim) => claim.status === "fact")) throw new Error("A factual answer requires at least one factual claim.");
  if (answer.status === "unknown") {
    if (!answer.uncertaintyReason) throw new Error("An unknown answer requires an uncertainty reason.");
    if (answer.claims.some((claim) => claim.status === "fact")) throw new Error("An unknown answer cannot contain confirmed factual claims.");
  }
  if (included.length === 0 && answer.status !== "unknown") throw new Error("An answer without included evidence must be unknown.");
  return answer;
}

export function parseAndNormalizeTianyiGroundedAnswer(
  source: string,
  context: TianyiGroundedAnswerValidationContext
): TianyiGroundedAnswer {
  let value: unknown;
  try {
    value = JSON.parse(extractProviderJsonObject(source));
  } catch {
    throw new Error("Provider answer is not valid JSON.");
  }
  return normalizeTianyiGroundedAnswer(value, context);
}

/**
 * Builds a bounded, prompt-safe repair diagnostic. It never includes the raw
 * Provider output or source contents; only schema location, value kind and
 * source identifiers from the already authorized manifest are retained.
 */
export function describeTianyiGroundedValidationFailure(
  source: string,
  context: TianyiGroundedAnswerValidationContext,
  cause: unknown
): TianyiGroundedValidationDiagnostic {
  const base = {
    version: "story-tianyi-grounded-validation-diagnostic/v1" as const,
    missingSourceRefs: [] as string[],
    unexpectedSourceRefs: [] as string[],
    detail: cause instanceof Error ? cause.message.slice(0, 240) : "Grounded validation failed."
  };
  let value: unknown;
  try {
    value = JSON.parse(extractProviderJsonObject(source));
  } catch {
    return { ...base, stage: "json", fieldPath: "$", expected: "one JSON object", actual: "non-JSON text" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...base, stage: "root", fieldPath: "$", expected: "plain object", actual: valueKind(value) };
  }
  const record = value as Record<string, unknown>;
  const rootFields = ["summary", "claims", "status", "sourceRefs", "uncertaintyReason", "includedSources", "excludedSources"];
  const missingFields = rootFields.filter((field) => !(field in record));
  const unexpectedFields = Object.keys(record).filter((field) => !rootFields.includes(field));
  if (missingFields.length || unexpectedFields.length) {
    return {
      ...base,
      stage: "root",
      fieldPath: "$",
      expected: `exact fields: ${rootFields.join(",")}`,
      actual: `missing=${missingFields.join(",") || "none"}; unexpected=${unexpectedFields.join(",") || "none"}`
    };
  }
  for (const [field, expected] of [["summary", "string"], ["claims", "array"], ["status", "string"], ["sourceRefs", "array"], ["includedSources", "array"], ["excludedSources", "array"]] as const) {
    const actual = record[field];
    const valid = expected === "array" ? Array.isArray(actual) : typeof actual === expected;
    if (!valid) return { ...base, stage: "root", fieldPath: `$.${field}`, expected, actual: valueKind(actual) };
  }
  const included = stringItems(record.includedSources);
  const expectedIncluded = context.includedSourceRefs;
  const missingSourceRefs = expectedIncluded.filter((ref) => !included.includes(ref)).slice(0, 32);
  const unexpectedSourceRefs = included.filter((ref) => !expectedIncluded.includes(ref)).slice(0, 32);
  if (missingSourceRefs.length || unexpectedSourceRefs.length) {
    return { ...base, stage: "source-set", fieldPath: "$.includedSources", expected: "exact ordered Context Pack source IDs", actual: "source set differs", missingSourceRefs, unexpectedSourceRefs };
  }
  const claims = record.claims as unknown[];
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index];
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
      return { ...base, stage: "claim", fieldPath: `$.claims[${index}]`, expected: "plain object", actual: valueKind(claim) };
    }
    const claimRecord = claim as Record<string, unknown>;
    for (const [field, expected] of [["statement", "string"], ["status", "string"], ["sourceRefs", "array"]] as const) {
      const actual = claimRecord[field];
      const valid = expected === "array" ? Array.isArray(actual) : typeof actual === expected;
      if (!valid) return { ...base, stage: "claim", fieldPath: `$.claims[${index}].${field}`, expected, actual: valueKind(actual) };
    }
    const unavailable = stringItems(claimRecord.sourceRefs).filter((ref) => !expectedIncluded.includes(ref)).slice(0, 32);
    if (unavailable.length) {
      return { ...base, stage: "source-set", fieldPath: `$.claims[${index}].sourceRefs`, expected: "IDs from includedSources", actual: "contains unavailable source IDs", unexpectedSourceRefs: unavailable };
    }
  }
  return { ...base, stage: "semantic", fieldPath: "$", expected: "grounded classification and uncertainty rules", actual: "schema-valid but semantically invalid" };
}

/**
 * Some OpenAI-compatible providers still wrap a JSON-mode response in a
 * Markdown fence or a short natural-language preface.  We recover only one
 * balanced top-level object and keep the schema/source validation below as the
 * authority; this never turns an arbitrary answer into an accepted result.
 */
function extractProviderJsonObject(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1]?.trim();
  if (fenced?.startsWith("{")) return fenced;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function stringItems(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, MAX_SOURCE_REFS) : [];
}

function normalizeClaim(value: unknown): TianyiGroundedClaim {
  const input = plainObject(value, "Tianyi grounded claim");
  exact(input, ["statement", "status", "sourceRefs", "uncertaintyReason"], "Tianyi grounded claim");
  return {
    statement: text(input.statement, "Grounded claim statement", MAX_CLAIM_CHARS),
    status: oneOf(input.status, TIANYI_CLAIM_STATUSES, "Grounded claim status"),
    sourceRefs: uniqueSourceRefs(input.sourceRefs, "Grounded claim source references"),
    uncertaintyReason: nullableText(input.uncertaintyReason, "Grounded claim uncertainty reason", MAX_REASON_CHARS)
  };
}

function validateClaimSemantics(claim: TianyiGroundedClaim, included: Set<string>, excluded: Set<string>): void {
  for (const sourceRef of claim.sourceRefs) {
    if (!included.has(sourceRef) || excluded.has(sourceRef)) throw new Error("Grounded claim cites excluded or unavailable evidence.");
  }
  if (claim.status === "fact" && claim.sourceRefs.length === 0) throw new Error("A factual claim requires current evidence.");
  if (claim.status === "unknown") {
    if (claim.sourceRefs.length > 0) throw new Error("An unknown claim cannot cite evidence as confirmation.");
    if (!claim.uncertaintyReason) throw new Error("An unknown claim requires an uncertainty reason.");
  }
  if ((claim.status === "candidate" || claim.status === "inference") && !claim.uncertaintyReason) {
    throw new Error("Candidate and inference claims require an uncertainty reason.");
  }
}

function normalizeExcludedSources(value: unknown): Array<{ sourceRef: string; reason: string }> {
  const seen = new Set<string>();
  return array(value, "Grounded answer excluded sources", MAX_SOURCE_REFS).map((item) => {
    const input = plainObject(item, "Grounded answer excluded source");
    exact(input, ["sourceRef", "reason"], "Grounded answer excluded source");
    const result = { sourceRef: sourceRef(input.sourceRef), reason: text(input.reason, "Grounded answer exclusion reason", 160) };
    if (seen.has(result.sourceRef)) throw new Error("Grounded answer contains duplicate excluded sources.");
    seen.add(result.sourceRef);
    return result;
  });
}

function uniqueSourceRefs(value: unknown, label: string): string[] {
  return unique(array(value, label, MAX_SOURCE_REFS).map(sourceRef));
}

function sourceRef(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_REF_PATTERN.test(value)) throw new Error("Grounded answer source reference is invalid.");
  return value;
}

function unique(values: string[]): string[] {
  if (new Set(values).size !== values.length) throw new Error("Grounded answer contains duplicate source references.");
  return values;
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameExclusions(left: Array<{ sourceRef: string; reason: string }>, right: Array<{ sourceRef: string; reason: string }>): boolean {
  return left.length === right.length && left.every((value, index) => value.sourceRef === right[index]?.sourceRef && value.reason === right[index]?.reason);
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: string[], label: string): void {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) throw new Error(`${label} fields are invalid.`);
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} are invalid.`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || [...value].length > maximum) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function nullableText(value: unknown, label: string, maximum: number): string | null {
  return value === null ? null : text(value, label, maximum);
}
