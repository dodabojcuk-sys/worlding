import { stableHash } from "./storySnapshotBuilder.ts";
import type { StorySnapshot } from "./storyIntelligenceTypes.ts";

export const NUWA_STORY_RECALL_PROJECTION_VERSION = "story-studio-nuwa-story-recall-projection/v1" as const;

export type NuwaStoryRecallProjection = {
  version: typeof NUWA_STORY_RECALL_PROJECTION_VERSION;
  snapshotHash: string;
  entries: Array<{ id: string; label: string; sourceIds: string[]; sourceRevision: string; state: "confirmed" | "unresolved" }>;
  projectionHash: string;
  rebuildable: true;
  writesCanonicalMemory: false;
};

/** Rebuilds author-facing recall from existing snapshot evidence only. */
export function buildNuwaStoryRecallProjection(input: { snapshot: StorySnapshot; acceptedCandidateSourceIds?: string[] }): NuwaStoryRecallProjection {
  const accepted = new Set(input.acceptedCandidateSourceIds ?? []);
  const entries = [
    ...input.snapshot.recentAcceptedChanges.map((note) => ({ id: `confirmed-${note.id}`, label: note.title, sourceIds: [note.id], sourceRevision: input.snapshot.snapshotHash, state: "confirmed" as const })),
    ...input.snapshot.openThreads.map((note) => ({ id: `unresolved-${note.id}`, label: note.title, sourceIds: [note.id], sourceRevision: input.snapshot.snapshotHash, state: "unresolved" as const }))
  ].filter((entry) => entry.sourceIds.some((sourceId) => accepted.size === 0 || accepted.has(sourceId)));
  const payload = { version: NUWA_STORY_RECALL_PROJECTION_VERSION, snapshotHash: input.snapshot.snapshotHash, entries, rebuildable: true as const, writesCanonicalMemory: false as const };
  return { ...payload, projectionHash: stableHash(payload) };
}

export function projectNuwaStoryRecallForAuthor(projection: NuwaStoryRecallProjection) {
  return projection.entries.map((entry) => ({ label: entry.label, state: entry.state === "confirmed" ? "已确认" : "未解线索" }));
}
