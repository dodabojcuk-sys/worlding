import type { WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";

export type MapRelatedCharacter = {
  character: WorldObjectSummary;
  relations: readonly RelationReadProjectionR0[];
};

/**
 * Derives people from explicit, confirmed Relation Owner records only. Map
 * proximity, drawing labels and prose mentions deliberately do not participate.
 */
export function mapRelatedCharacters(
  locationId: string | null | undefined,
  objects: readonly WorldObjectSummary[],
  relations: readonly RelationReadProjectionR0[]
): MapRelatedCharacter[] {
  if (!locationId) return [];
  const activeCharacters = new Map(
    objects.filter((object) => object.type === "character" && object.status !== "archived").map((object) => [object.id, object])
  );
  const grouped = new Map<string, RelationReadProjectionR0[]>();
  for (const relation of relations) {
    if (relation.reviewState !== "confirmed" || relation.archived) continue;
    const otherId = relation.sourceObjectId === locationId
      ? relation.targetObjectId
      : relation.targetObjectId === locationId
        ? relation.sourceObjectId
        : null;
    if (!otherId || !activeCharacters.has(otherId)) continue;
    grouped.set(otherId, [...(grouped.get(otherId) ?? []), relation]);
  }
  return [...grouped.entries()]
    .map(([characterId, characterRelations]) => ({ character: activeCharacters.get(characterId)!, relations: characterRelations }))
    .sort((left, right) => left.character.title.localeCompare(right.character.title, "zh-CN"));
}

export function mapRelationDirection(
  relation: RelationReadProjectionR0,
  labels: ReadonlyMap<string, string>
): string {
  const source = labels.get(relation.sourceObjectId) ?? "未解析对象";
  const target = labels.get(relation.targetObjectId) ?? "未解析对象";
  if (relation.direction === "both") return `${source} ↔ ${target}`;
  if (relation.direction === "reverse") return `${target} → ${source}`;
  if (relation.direction === "forward") return `${source} → ${target}`;
  return `${source} — ${target}（方向未记录）`;
}

export function confirmedEventReference(relation: RelationReadProjectionR0): { eventId: string; revision: string } | null {
  const evidence = relation.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference as
    | { eventId?: string; revision?: string; revisionToken?: string }
    | undefined;
  const revision = evidence?.revision ?? evidence?.revisionToken;
  return evidence?.eventId && revision ? { eventId: evidence.eventId, revision } : null;
}
