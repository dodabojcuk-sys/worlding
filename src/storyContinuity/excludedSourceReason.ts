export const EXCLUDED_SOURCE_CATEGORIES = [
  "not-selected",
  "not-authorized",
  "stale",
  "deleted",
  "scope-mismatch",
  "duplicate",
  "sensitivity-redacted",
  "unsupported"
] as const;

export type ExcludedSourceCategory = typeof EXCLUDED_SOURCE_CATEGORIES[number];

/**
 * Keeps the precise machine reason in the Receipt while projecting it into the
 * frozen author-facing provenance categories. Unknown reasons fail closed so a
 * new backend reason cannot silently inherit a generic label.
 */
export function categorizeExcludedSourceReason(reason: string): ExcludedSourceCategory {
  if (["source-count-limit", "total-excerpt-limit", "not-selected"].includes(reason)) return "not-selected";
  if (["memory-not-active-approved", "missing-or-revoked-grant", "source-excluded", "not-authorized"].includes(reason)) return "not-authorized";
  if (["stale-grant", "source-stale", "stale"].includes(reason)) return "stale";
  if (["memory-missing-or-deleted", "source-missing", "source-deleted", "deleted"].includes(reason)) return "deleted";
  if (["grant-owner-mismatch", "scope-mismatch"].includes(reason)) return "scope-mismatch";
  if (["duplicate", "duplicate-source"].includes(reason)) return "duplicate";
  if (/^(?:ordinary|personal|personal-sensitive|sensitive|restricted)-(?:default-deny|raw-excerpt-denied)$/u.test(reason) || reason === "empty-after-redaction" || reason === "sensitivity-redacted") return "sensitivity-redacted";
  if (["source-material-unavailable", "source-unavailable", "unsupported"].includes(reason)) return "unsupported";
  throw new Error(`Unsupported excluded-source reason: ${reason}`);
}
