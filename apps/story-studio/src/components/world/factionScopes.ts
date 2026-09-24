// Read-only projection: confirmed member relations between a faction object
// and a person become labeled, translucent scope regions behind the relation
// graph.  This is a view over the existing Relation owner — it never creates,
// edits, or interprets membership, and a scope's geometry never asserts story
// facts (R2A §5.2 / UI R1 §5).
//
// Semantics: membership requires an EXPLICIT member relation-type mapping
// (stable relationTypeIds).  Any confirmed relation touching a faction that is
// not in the mapping — 追捕、资助、结盟、拥有地点 — is not membership.  Without
// a verified mapping the projection is paused and returns no scopes; the
// minimal owner extension is a per-project faction member-type setting.

export type FactionScopeInputRelation = {
  relationId: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationTypeId: string;
  reviewState: string;
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

export type FactionScopeInputPersonType = "character";

export function factionScopes(
  relations: readonly FactionScopeInputRelation[],
  objects: readonly FactionScopeInputObject[],
  options: { memberRelationTypeIds: readonly string[]; personType?: FactionScopeInputPersonType }
): FactionScope[] {
  const memberTypes = new Set(options.memberRelationTypeIds);
  if (memberTypes.size === 0) return []; // no verified member mapping → paused
  const personType = options.personType ?? "character";
  const byId = new Map(objects.map((object) => [object.id, object]));
  const membersByOrg = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (relation.reviewState !== "confirmed") continue;
    if (!memberTypes.has(relation.relationTypeId)) continue;
    const source = byId.get(relation.sourceObjectId);
    const target = byId.get(relation.targetObjectId);
    if (!source || !target || source.archived || target.archived) continue;
    let orgId: string | null = null;
    let memberId: string | null = null;
    if (source.type === "faction" && target.type === personType) { orgId = source.id; memberId = target.id; }
    else if (target.type === "faction" && source.type === personType) { orgId = target.id; memberId = source.id; }
    if (!orgId || !memberId) continue; // faction↔faction, faction↔location etc. are not membership
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

// Stable per-org hue: bound to faction identity, not array order, so
// filtering/reordering other scopes never recolors this one.
export function scopeHue(orgId: string, index: number): number {
  let hash = 0;
  for (const character of orgId) hash = (hash * 31 + character.codePointAt(0)!) % 360;
  return (hash + index * 47) % 360;
}
