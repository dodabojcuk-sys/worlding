// Read-only projection: confirmed faction→member relations become labeled,
// translucent scope regions behind the relation graph.  This is a view over
// the existing Relation owner — it never creates, edits, or interprets
// membership, and a scope's geometry never asserts story facts (R2A §5.2).

export type FactionScopeInputRelation = {
  relationId: string;
  sourceObjectId: string;
  targetObjectId: string;
  reviewState: string;
  relationLabelSnapshot: string;
  currentTypeLabel?: string | null;
};

export type FactionScopeInputObject = {
  id: string;
  type: string;
  title: string;
  archived?: boolean;
};

export type FactionScope = {
  orgId: string;
  label: string;
  hue: number;
  memberIds: readonly string[];
};

export function factionScopes(
  relations: readonly FactionScopeInputRelation[],
  objects: readonly FactionScopeInputObject[]
): FactionScope[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const membersByOrg = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (relation.reviewState !== "confirmed") continue;
    const source = byId.get(relation.sourceObjectId);
    const target = byId.get(relation.targetObjectId);
    if (!source || !target) continue;
    if (source.archived || target.archived) continue;
    let orgId: string | null = null;
    let memberId: string | null = null;
    if (source.type === "faction" && target.type !== "faction") {
      orgId = source.id;
      memberId = target.id;
    } else if (target.type === "faction" && source.type !== "faction") {
      orgId = target.id;
      memberId = source.id;
    }
    if (!orgId || !memberId) continue;
    let members = membersByOrg.get(orgId);
    if (!members) { members = new Set(); membersByOrg.set(orgId, members); }
    members.add(memberId);
  }
  const labelByOrg = new Map(objects.filter((object) => object.type === "faction").map((object) => [object.id, object.title]));
  return [...membersByOrg.entries()]
    .map(([orgId, members], index) => ({
      orgId,
      label: labelByOrg.get(orgId) ?? "未命名阵营",
      hue: scopeHue(orgId, index),
      memberIds: [...members].sort()
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function scopeHue(orgId: string, index: number): number {
  let hash = 0;
  for (const character of orgId) hash = (hash * 31 + character.codePointAt(0)!) % 360;
  // Spread consecutive scopes apart so same-letter ids do not collide visually.
  return (hash + index * 47) % 360;
}
