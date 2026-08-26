export type OwnerReferencedSemanticCompareState =
  | "changed"
  | "unchanged"
  | "unknown"
  | "conflict"
  | "stale"
  | "insufficient"
  | "integrated";

export type OwnerReferencedDifferenceKind =
  | "added"
  | "removed"
  | "changed"
  | "unchanged"
  | "unknown"
  | "conflict"
  | "missing";

export type OwnerReferencedSemanticDifference = {
  id: string;
  kind: OwnerReferencedDifferenceKind;
  state: OwnerReferencedSemanticCompareState;
  dimension: string;
  ownerKind: string;
  summary: string;
  sourceRefs: string[];
  affectsArtifact: boolean;
  authorConfirmable: boolean;
};

export type OwnerReferencedSemanticCompare = {
  schemaVersion: "tianyan-owner-referenced-semantic-compare/r0";
  baseRevision: number;
  currentRevision: number;
  baseManifestDigest: string;
  currentManifestDigest: string;
  ownerDigestChanges: Array<{ ownerKind: string; changed: boolean }>;
  differences: OwnerReferencedSemanticDifference[];
};

/**
 * Validates and projects semantic differences against immutable owner digests.
 * Callers supply author-readable domain semantics, while this shared primitive
 * proves the BASE/CURRENT owner references and never persists a delta owner.
 */
export function buildOwnerReferencedSemanticCompare(input: {
  baseRevision: number;
  currentRevision: number;
  baseManifestDigest: string;
  currentManifestDigest: string;
  baseOwnerDigests: Record<string, string>;
  currentOwnerDigests: Record<string, string>;
  differences: OwnerReferencedSemanticDifference[];
}): OwnerReferencedSemanticCompare {
  if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 1) throw new Error("Semantic compare base revision is invalid.");
  if (!Number.isSafeInteger(input.currentRevision) || input.currentRevision < input.baseRevision) throw new Error("Semantic compare current revision is invalid.");
  requireDigest(input.baseManifestDigest, "Base manifest digest");
  requireDigest(input.currentManifestDigest, "Current manifest digest");
  const ownerKinds = [...new Set([...Object.keys(input.baseOwnerDigests), ...Object.keys(input.currentOwnerDigests)])].sort();
  if (!ownerKinds.length) throw new Error("Semantic compare requires owner references.");
  const ownerDigestChanges = ownerKinds.map((ownerKind) => {
    const base = requireDigest(input.baseOwnerDigests[ownerKind], `${ownerKind} base owner digest`);
    const current = requireDigest(input.currentOwnerDigests[ownerKind], `${ownerKind} current owner digest`);
    return { ownerKind, changed: base !== current };
  });
  const changedOwners = new Set(ownerDigestChanges.filter((entry) => entry.changed).map((entry) => entry.ownerKind));
  const ids = new Set<string>();
  const differences = input.differences.map((difference) => {
    const id = requireText(difference.id, "Semantic difference identifier", 180);
    if (ids.has(id)) throw new Error("Semantic difference identifiers must be unique.");
    ids.add(id);
    const ownerKind = requireText(difference.ownerKind, "Semantic difference owner", 120);
    if (!ownerKinds.includes(ownerKind)) throw new Error(`Semantic difference references unknown owner ${ownerKind}.`);
    if (["added", "removed", "changed"].includes(difference.kind) && !changedOwners.has(ownerKind)) {
      throw new Error(`Semantic difference ${id} is not backed by an owner digest change.`);
    }
    return {
      ...difference,
      id,
      dimension: requireText(difference.dimension, "Semantic difference dimension", 120),
      ownerKind,
      summary: requireText(difference.summary, "Semantic difference summary", 600),
      sourceRefs: normalizeTextList(difference.sourceRefs)
    };
  });
  return {
    schemaVersion: "tianyan-owner-referenced-semantic-compare/r0",
    baseRevision: input.baseRevision,
    currentRevision: input.currentRevision,
    baseManifestDigest: input.baseManifestDigest,
    currentManifestDigest: input.currentManifestDigest,
    ownerDigestChanges,
    differences
  };
}

function requireDigest(value: unknown, label: string): string {
  const digest = String(value ?? "").trim();
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} is invalid.`);
  return digest;
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error("Semantic difference source references are invalid.");
  return [...new Set(value.map((entry) => requireText(entry, "Semantic difference source reference", 240)))].sort();
}
