import type {
  TianyiObjectContextRef,
  VisualDocument,
  WorldObjectSummary,
  WritingDocument
} from "../lib/localTransport";

export const TIANYI_OBJECT_CONTEXT_MIME = "application/x-story-studio-tianyi-object-context-ref";

export function worldObjectContextRef(projectId: string, object: WorldObjectSummary): TianyiObjectContextRef | null {
  // Story events use StoryStudioEventReference instead. Generic context refs
  // may carry display labels, so they are deliberately not an event handoff.
  if (!(["character", "location", "item", "rule"] as string[]).includes(object.type)) return null;
  return baseRef({
    projectId,
    ownerType: "markdown-object",
    objectType: object.type as "character" | "location" | "item" | "rule",
    stableId: object.id,
    ownerId: object.id,
    contentHash: object.revisionToken,
    label: object.title
  });
}

export function writingContextRef(projectId: string, document: WritingDocument): TianyiObjectContextRef {
  return baseRef({
    projectId,
    ownerType: "markdown-writing",
    objectType: document.type,
    stableId: document.id,
    ownerId: document.id,
    contentHash: document.revisionToken,
    label: document.title
  });
}

export function writingSelectionContextRef(
  projectId: string,
  document: WritingDocument,
  start: number,
  end: number
): TianyiObjectContextRef | null {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > document.body.length) return null;
  return baseRef({
    projectId,
    ownerType: "markdown-writing",
    objectType: "selection",
    stableId: `selection.${start}.${end}`,
    ownerId: document.id,
    contentHash: document.revisionToken,
    label: `当前选区 · ${document.title}`
  });
}

export function visualContextRefs(projectId: string, document: VisualDocument, objects: WorldObjectSummary[] = []): TianyiObjectContextRef[] {
  const labels = new Map(objects.map((object) => [object.id, object.title]));
  if (document.type === "map") return [
    ...document.content.markers.map((marker) => baseRef({
      projectId,
      ownerType: "visual-map",
      objectType: "map-marker",
      stableId: marker.id,
      ownerId: document.id,
      contentHash: document.contentHash,
      label: `地图标记 · ${labels.get(marker.objectId) || marker.objectId}`
    })),
    ...document.content.regions.map((region) => baseRef({
      projectId,
      ownerType: "visual-map",
      objectType: "map-region",
      stableId: region.id,
      ownerId: document.id,
      contentHash: document.contentHash,
      label: `地图区域 · ${region.title}`
    }))
  ];
  // A timeline entry is a projection, not an event authority. Direct timeline
  // handoffs construct a StoryStudioEventReference from the resolved event.
  if (document.type === "timeline") return [];
  return [];
}

export function parseDroppedTianyiObjectContext(dataTransfer: DataTransfer): TianyiObjectContextRef | null {
  const source = dataTransfer.getData(TIANYI_OBJECT_CONTEXT_MIME);
  if (!source) return null;
  try {
    const value = JSON.parse(source) as TianyiObjectContextRef;
    return value.version === "story-tianyi-object-context-ref/v1" ? value : null;
  } catch { return null; }
}

export function writeTianyiObjectContextDrag(dataTransfer: DataTransfer, ref: TianyiObjectContextRef): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(TIANYI_OBJECT_CONTEXT_MIME, JSON.stringify(ref));
  dataTransfer.setData("text/plain", ref.label);
}

export function tianyiObjectContextKey(ref: TianyiObjectContextRef): string {
  return `${ref.projectId}:${ref.ownerType}:${ref.ownerId}:${ref.objectType}:${ref.stableId}`;
}

function baseRef(input: Omit<TianyiObjectContextRef, "version" | "state" | "inclusion">): TianyiObjectContextRef {
  return { version: "story-tianyi-object-context-ref/v1", state: "current", inclusion: "included", ...input };
}
