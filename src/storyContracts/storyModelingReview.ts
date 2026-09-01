import type { SmartRelationCandidate } from "./storyModeling.ts";

export type SmartRelationExistingEdge = {
  sourceEventId: string;
  targetEventId: string;
  direction: SmartRelationCandidate["direction"];
};

export function dedupeSmartRelationCandidates(input: { candidates: SmartRelationCandidate[]; existing: SmartRelationExistingEdge[] }): SmartRelationCandidate[] {
  const existing = new Set(input.existing.map(relationEdgeKey));
  const seen = new Set<string>();
  return input.candidates.filter((candidate) => {
    const key = relationEdgeKey(candidate);
    if (existing.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function reviewSmartRelationCandidates(input: { candidates: SmartRelationCandidate[]; candidateIds: string[]; decision: "accepted" | "rejected"; suggestedTypeId?: string | null; suggestedTypeLabel?: string }): SmartRelationCandidate[] {
  const ids = new Set(uniqueIds(input.candidateIds));
  if ([...ids].some((id) => !input.candidates.some((candidate) => candidate.candidateId === id))) throw new Error("Story modeling Relation review contains an unknown candidate.");
  return input.candidates.map((candidate) => ids.has(candidate.candidateId) ? { ...candidate, reviewState: input.decision, suggestedTypeId: input.suggestedTypeId === undefined ? candidate.suggestedTypeId : input.suggestedTypeId, suggestedTypeLabel: input.suggestedTypeLabel === undefined ? candidate.suggestedTypeLabel : text(input.suggestedTypeLabel) } : candidate);
}

function relationEdgeKey(edge: SmartRelationExistingEdge): string {
  if (edge.direction === "undirected") return [edge.sourceEventId, edge.targetEventId].sort().join("\u0000") + "\u0000undirected";
  return `${edge.sourceEventId}\u0000${edge.targetEventId}\u0000${edge.direction}`;
}
function uniqueIds(value: string[]): string[] {
  if (!Array.isArray(value)) throw new Error("Story modeling Relation review list is invalid.");
  const result = value.map((item) => text(item));
  if (new Set(result).size !== result.length) throw new Error("Story modeling Relation review list contains duplicates.");
  return result;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Story modeling Relation review text is invalid.");
  const result = value.normalize("NFC").trim();
  if (!result || [...result].length > 200 || /[\u0000-\u001F\u007F]/u.test(result)) throw new Error("Story modeling Relation review text is invalid.");
  return result;
}
