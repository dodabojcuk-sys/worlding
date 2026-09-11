import type { RelationReadProjectionR0 } from "../storyControlSurface/storyStudioRelationOperations.ts";

export type RelationTemporalComparisonKind = "added" | "ended" | "changed" | "maintained";

export type RelationTemporalComparisonRow = {
  lineageId: string;
  kind: RelationTemporalComparisonKind;
  before: RelationReadProjectionR0 | null;
  after: RelationReadProjectionR0 | null;
};

export type RelationTemporalUnknown = {
  relation: RelationReadProjectionR0;
  reason: "missing-valid-from" | "invalid-world-time" | "uncertain-world-time";
};

export type RelationTemporalConflict = {
  lineageId: string;
  at: "t1" | "t2";
  relations: RelationReadProjectionR0[];
};

export type RelationTemporalComparison = {
  version: "story-relation-temporal-comparison/v1";
  t1: string;
  t2: string;
  rows: RelationTemporalComparisonRow[];
  unknown: RelationTemporalUnknown[];
  conflicts: RelationTemporalConflict[];
};

/**
 * A read-only projection over Relation Owner records. World-valid time is the
 * only comparison coordinate: repository timestamps, array order and archived
 * state never become story time.
 */
export function compareRelationsAtWorldTimes(
  relations: readonly RelationReadProjectionR0[],
  t1: string,
  t2: string
): RelationTemporalComparison {
  const first = requireWorldTime(t1, "T1");
  const second = requireWorldTime(t2, "T2");
  if (first > second) throw new Error("T1 must not be later than T2.");

  const confirmed = relations.filter((relation) => relation.reviewState === "confirmed");
  const byId = new Map(confirmed.map((relation) => [relation.relationId, relation]));
  const unknown: RelationTemporalUnknown[] = [];
  const known = confirmed.filter((relation) => {
    const reason = relationWorldTimeUnknownReason(relation);
    if (reason) unknown.push({ relation, reason });
    return !reason;
  });
  const lineages = new Map<string, RelationReadProjectionR0[]>();
  for (const relation of known) {
    const lineageId = relationLineageId(relation, byId);
    lineages.set(lineageId, [...(lineages.get(lineageId) ?? []), relation]);
  }

  const rows: RelationTemporalComparisonRow[] = [];
  const conflicts: RelationTemporalConflict[] = [];
  for (const [lineageId, items] of lineages) {
    const before = items.filter((relation) => relationActiveAtWorldTime(relation, first));
    const after = items.filter((relation) => relationActiveAtWorldTime(relation, second));
    if (before.length > 1) conflicts.push({ lineageId, at: "t1", relations: stableRelations(before) });
    if (after.length > 1) conflicts.push({ lineageId, at: "t2", relations: stableRelations(after) });
    if (before.length > 1 || after.length > 1) continue;
    const beforeRelation = before[0] ?? null;
    const afterRelation = after[0] ?? null;
    if (!beforeRelation && !afterRelation) continue;
    const kind: RelationTemporalComparisonKind = !beforeRelation
      ? "added"
      : !afterRelation
        ? "ended"
        : sameRelationMeaning(beforeRelation, afterRelation)
          ? "maintained"
          : "changed";
    rows.push({ lineageId, kind, before: beforeRelation, after: afterRelation });
  }

  return {
    version: "story-relation-temporal-comparison/v1",
    t1,
    t2,
    rows: rows.sort((left, right) => `${left.kind}:${left.lineageId}`.localeCompare(`${right.kind}:${right.lineageId}`)),
    unknown: unknown.sort((left, right) => left.relation.relationId.localeCompare(right.relation.relationId)),
    conflicts: conflicts.sort((left, right) => `${left.at}:${left.lineageId}`.localeCompare(`${right.at}:${right.lineageId}`))
  };
}

export function relationWorldTimeOptions(relations: readonly RelationReadProjectionR0[]): string[] {
  return [...new Set(relations.flatMap((relation) => [relation.temporal?.validFrom, relation.temporal?.validTo])
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value)))))]
    .sort((left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right));
}

/** Shared read-only world-time rule for comparison and author projections.
 * `validTo` is inclusive; archive is repository lifecycle, not story time. */
export function relationWorldTimeUnknownReason(relation: RelationReadProjectionR0): RelationTemporalUnknown["reason"] | null {
  const temporal = relation.temporal;
  if (!temporal?.validFrom) return "missing-valid-from";
  const from = Date.parse(temporal.validFrom);
  const to = temporal.validTo ? Date.parse(temporal.validTo) : null;
  if (!Number.isFinite(from) || (to !== null && !Number.isFinite(to))) return "invalid-world-time";
  if (temporal.confidence === "unknown") return "uncertain-world-time";
  return null;
}

export function relationActiveAtWorldTime(relation: RelationReadProjectionR0, value: string | number): boolean {
  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time) || relationWorldTimeUnknownReason(relation)) return false;
  const temporal = relation.temporal!;
  const from = Date.parse(temporal.validFrom!);
  const to = temporal.validTo ? Date.parse(temporal.validTo) : null;
  return from <= time && (to === null || time <= to);
}

function relationLineageId(relation: RelationReadProjectionR0, byId: ReadonlyMap<string, RelationReadProjectionR0>): string {
  let current = relation;
  const visited = new Set<string>();
  while (current.supersedesRelationId && !visited.has(current.relationId)) {
    visited.add(current.relationId);
    const parent = byId.get(current.supersedesRelationId);
    if (!parent) break;
    current = parent;
  }
  return current.relationId;
}

function sameRelationMeaning(left: RelationReadProjectionR0, right: RelationReadProjectionR0): boolean {
  return left.sourceObjectId === right.sourceObjectId
    && left.targetObjectId === right.targetObjectId
    && left.relationTypeId === right.relationTypeId
    && left.direction === right.direction;
}

function stableRelations(relations: readonly RelationReadProjectionR0[]): RelationReadProjectionR0[] {
  return [...relations].sort((left, right) => left.relationId.localeCompare(right.relationId));
}

function requireWorldTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value || !Number.isFinite(parsed)) throw new Error(`${label} is not a valid world time.`);
  return parsed;
}
