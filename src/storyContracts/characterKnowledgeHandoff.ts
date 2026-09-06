import type { TianyiObjectContextRef } from "../storyContinuity/tianyiObjectContext.ts";
import type { EventStoryCrossingKnowledgeProjection } from "./eventStoryCrossingKnowledge.ts";
import type { PerspectiveObjectRef } from "./eventPerspectiveProjection.ts";

export const CHARACTER_KNOWLEDGE_HANDOFF_VERSION = "tianyan-character-knowledge-handoff/v1" as const;

export type CharacterKnowledgeHandoff = {
  version: typeof CHARACTER_KNOWLEDGE_HANDOFF_VERSION;
  observerId: string;
  observerLabel: string;
  hiddenEventCount: number;
  contextAccess: "author" | "character" | "display-only";
  subjectRef: TianyiObjectContextRef | null;
};

/**
 * Converts a read-only Event knowledge projection into the only model handoff
 * allowed by the UI. Author comparison stays author-scoped; a single formal
 * role receives one current stable SubjectRef; reader and stale roles remain
 * display-only. No story prose crosses this handoff.
 */
export function createCharacterKnowledgeHandoff(input: {
  projectId: string;
  projection: EventStoryCrossingKnowledgeProjection | null;
  characters: readonly PerspectiveObjectRef[];
}): CharacterKnowledgeHandoff {
  const projection = input.projection;
  const observerId = projection?.mode === "compare"
    ? projection.observers.map((observer) => observer.id).join(",")
    : projection?.observer.id ?? "author";
  const observerLabel = projection?.mode === "compare"
    ? `比较视角 · ${projection.observers.map((observer) => observer.label).join("、")}`
    : projection?.observer.label ?? "作者全知";
  if (!projection || projection.observer.kind === "author" || projection.mode === "compare") {
    return { version: CHARACTER_KNOWLEDGE_HANDOFF_VERSION, observerId, observerLabel, hiddenEventCount: projection?.hiddenCount ?? 0, contextAccess: "author", subjectRef: null };
  }
  if (projection.observer.kind === "reader") {
    return { version: CHARACTER_KNOWLEDGE_HANDOFF_VERSION, observerId, observerLabel, hiddenEventCount: projection.hiddenCount, contextAccess: "display-only", subjectRef: null };
  }
  const role = input.characters.find((object) => object.formal === true && object.type === "character" && object.id === projection.observer.id) ?? null;
  if (!role || !isCurrentRevision(role.version)) {
    return { version: CHARACTER_KNOWLEDGE_HANDOFF_VERSION, observerId, observerLabel, hiddenEventCount: projection.hiddenCount, contextAccess: "display-only", subjectRef: null };
  }
  return {
    version: CHARACTER_KNOWLEDGE_HANDOFF_VERSION,
    observerId,
    observerLabel,
    hiddenEventCount: projection.hiddenCount,
    contextAccess: "character",
    subjectRef: {
      version: "story-tianyi-object-context-ref/v1",
      ownerType: "markdown-object",
      objectType: "character",
      stableId: role.id,
      projectId: input.projectId,
      ownerId: role.id,
      contentHash: role.version!,
      state: "current",
      inclusion: "included",
      label: role.label
    }
  };
}

function isCurrentRevision(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
