import type { WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { EventStoryCrossingKnowledgeProjection } from "../../../../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import type { CharacterMemoryQueryProjection } from "../../../../../src/storyContinuity/characterMemoryQuery.ts";

export type CharacterDockSnapshotScope = {
  projectId: string;
  objectId: string;
  workVersionId: string | null;
};

export interface CharacterDockRead {
  title: string;
  revisionToken: string;
  subtype: string | null;
  status: string;
  portraitAssetRef: string | null;
  profileCore: string | null;
  boundaries: string | null;
  participations: Array<{ eventId: string }>;
}

type CharacterObject = {
  id: string;
  type: string;
  title: string;
  revisionToken: string;
  subtype?: string | null;
  status: string;
  card: { portrait?: { assetRef?: string | null } | null };
  profile?: { authorConfirmed?: boolean; fields?: Record<string, { source?: string; value?: unknown }> | null } | null;
  worldProjection?: { timelineParticipations?: Array<{ eventId: string }> } | null;
};
type WorldLibrary = { objects: WorldObjectSummary[] };
type RelationRead = { relations: RelationReadProjectionR0[] };

export type CharacterDockSnapshotLoaders = {
  readCharacter(projectId: string, objectId: string): Promise<CharacterObject>;
  readWorldLibrary(projectId: string): Promise<WorldLibrary>;
  readKnowledge(projectId: string, objectId: string): Promise<EventStoryCrossingKnowledgeProjection>;
  readRelations(scope: CharacterDockSnapshotScope): Promise<RelationRead>;
  readMemories(projectId: string, objectId: string, workVersionId: string | null): Promise<CharacterMemoryQueryProjection>;
};

export type CharacterDockReadSnapshot = {
  read: CharacterDockRead;
  knowledge: EventStoryCrossingKnowledgeProjection;
  relations: RelationReadProjectionR0[];
  memoryQuery: CharacterMemoryQueryProjection;
  worldObjects: WorldObjectSummary[];
  sourceMetadata: {
    characterRevisionToken: string;
    knowledgeProjectionRevision: string | null;
    workVersionId: string | null;
  };
};

/** Reads every source used by the state/context/gateway projections before returning one snapshot. */
export async function loadCharacterDockSnapshot(scope: CharacterDockSnapshotScope, loaders: CharacterDockSnapshotLoaders): Promise<CharacterDockReadSnapshot> {
  const [object, library, knowledge, relationRead, memoryQuery] = await Promise.all([
    loaders.readCharacter(scope.projectId, scope.objectId),
    loaders.readWorldLibrary(scope.projectId),
    loaders.readKnowledge(scope.projectId, scope.objectId),
    loaders.readRelations(scope),
    loaders.readMemories(scope.projectId, scope.objectId, scope.workVersionId),
  ]);
  if (object.type !== "character" || object.id !== scope.objectId) throw new Error("The selected object is not the requested character.");
  if (knowledge.observer.id !== object.id) throw new Error("The character knowledge projection belongs to another observer.");
  return {
    read: {
      title: object.title,
      revisionToken: object.revisionToken,
      subtype: object.subtype ?? null,
      status: object.status,
      portraitAssetRef: object.card.portrait?.assetRef ?? null,
      profileCore: profileValue(object, "character_core"),
      boundaries: profileValue(object, "boundaries"),
      participations: (object.worldProjection?.timelineParticipations ?? []).map((item) => ({ eventId: item.eventId })),
    },
    knowledge,
    relations: relationRead.relations,
    memoryQuery,
    worldObjects: library.objects,
    sourceMetadata: {
      characterRevisionToken: object.revisionToken,
      knowledgeProjectionRevision: knowledge.characterStateProjectionRevision ?? null,
      workVersionId: scope.workVersionId,
    },
  };
}

export type CharacterDockSnapshotController = {
  run(mode: "initial" | "refresh"): Promise<void>;
  invalidate(): void;
  dispose(): void;
};

/** Generation-guarded atomic commit controller; stale reads never reach React state. */
export function createCharacterDockSnapshotController<T>(input: {
  load(): Promise<T>;
  commit(snapshot: T, mode: "initial" | "refresh"): void;
  onInitialFailure(error: unknown): void;
  onRefreshFailure(error: unknown): void;
}): CharacterDockSnapshotController {
  let generation = 0;
  let disposed = false;
  return {
    async run(mode) {
      if (disposed) return;
      const currentGeneration = ++generation;
      try {
        const snapshot = await input.load();
        if (disposed || currentGeneration !== generation) return;
        input.commit(snapshot, mode);
      } catch (error) {
        if (disposed || currentGeneration !== generation) return;
        if (mode === "initial") input.onInitialFailure(error);
        else input.onRefreshFailure(error);
      }
    },
    invalidate() { generation += 1; },
    dispose() { disposed = true; generation += 1; },
  };
}

function profileValue(object: { profile?: { authorConfirmed?: boolean; fields?: Record<string, { source?: string; value?: unknown }> | null } | null }, key: string): string | null {
  const field = object.profile?.authorConfirmed === true ? object.profile.fields?.[key] : null;
  return field?.source === "author" && typeof field.value === "string" ? field.value : null;
}
