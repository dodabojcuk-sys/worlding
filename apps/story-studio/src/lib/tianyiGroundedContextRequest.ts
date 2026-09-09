import type {
  TianyiGroundedAccessSelection,
  TianyiGroundedContextRequest,
  TianyiObjectContextRef
} from "./localTransport";
import {
  storyStudioEventReferenceKey,
  type StoryStudioEventReference
} from "../../../../src/storyContracts/storyStudioEventReference.ts";

export function createTianyiGroundedContextRequest(input: {
  projectId: string;
  sessionId: string;
  access: TianyiGroundedAccessSelection;
  activeContextRef: TianyiObjectContextRef | null;
  objectContextRefs: TianyiObjectContextRef[];
  eventRefs?: StoryStudioEventReference[];
}): TianyiGroundedContextRequest {
  const candidates = [input.activeContextRef, ...input.objectContextRefs]
    .filter((ref): ref is TianyiObjectContextRef => ref !== null);
  const sceneRef = candidates.find((ref) => ref.ownerType === "markdown-writing" && ref.objectType === "scene") ?? null;
  const subjectKey = input.access.subjectRef ? objectContextKey(input.access.subjectRef) : null;
  const sceneKey = sceneRef ? objectContextKey(sceneRef) : null;
  const explicit = new Map<string, TianyiObjectContextRef>();
  for (const ref of candidates) {
    const key = objectContextKey(ref);
    if (key !== subjectKey && key !== sceneKey && !explicit.has(key)) explicit.set(key, ref);
  }
  const eventRefs = new Map<string, StoryStudioEventReference>();
  for (const reference of input.eventRefs ?? []) {
    const key = storyStudioEventReferenceKey(reference);
    if (!eventRefs.has(key)) eventRefs.set(key, reference);
  }
  return {
    version: "story-tianyi-grounded-context-request/v1",
    projectId: input.projectId,
    sessionId: input.sessionId,
    taskKind: "grounded-answer",
    accessMode: input.access.accessMode,
    subjectRef: input.access.subjectRef,
    sceneRef,
    explicitRefs: [...explicit.values()].slice(0, 5),
    ...(eventRefs.size ? { eventRefs: [...eventRefs.values()].slice(0, 6) } : {})
  };
}

function objectContextKey(ref: TianyiObjectContextRef): string {
  return `${ref.projectId}:${ref.ownerType}:${ref.ownerId}:${ref.objectType}:${ref.stableId}`;
}
