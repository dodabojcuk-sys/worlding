export const STORY_STUDIO_SELECTION_SOURCES = [
  "library",
  "card",
  "map-marker",
  "graph-node",
  "graph-edge",
  "canvas-node",
  "canvas-edge",
  "timeline-event",
  "tree-node",
  "tree-edge",
  "writing-mention"
] as const;

export type WorkspaceSelectionSource = typeof STORY_STUDIO_SELECTION_SOURCES[number];

export type WorkspaceSelection = {
  objectId: string | null;
  source: WorkspaceSelectionSource;
  documentId: string | null;
  blockId: string | null;
  relationId: string | null;
};

export const EMPTY_WORKSPACE_SELECTION: WorkspaceSelection = Object.freeze({
  objectId: null,
  source: "library",
  documentId: null,
  blockId: null,
  relationId: null
});

export function createWorkspaceSelection(input: Partial<WorkspaceSelection> = {}): WorkspaceSelection {
  const source = STORY_STUDIO_SELECTION_SOURCES.includes(input.source as WorkspaceSelectionSource)
    ? input.source as WorkspaceSelectionSource
    : "library";
  return {
    objectId: optionalId(input.objectId),
    source,
    documentId: optionalId(input.documentId),
    blockId: optionalId(input.blockId),
    relationId: optionalId(input.relationId)
  };
}

export function selectWorkspaceObject(input: {
  objectId: string;
  source: WorkspaceSelectionSource;
  documentId?: string | null;
  blockId?: string | null;
  relationId?: string | null;
}): WorkspaceSelection {
  return createWorkspaceSelection(input);
}

export function scopeSelectionToDocument(selection: WorkspaceSelection, documentId: string | null): WorkspaceSelection {
  if (!documentId) return { ...selection, documentId: null, relationId: null, blockId: null };
  if (selection.documentId === documentId) return { ...selection };
  return { ...selection, documentId, relationId: null, blockId: null };
}

export function clearWorkspaceSelection(source: WorkspaceSelectionSource = "library"): WorkspaceSelection {
  return { ...EMPTY_WORKSPACE_SELECTION, source };
}

function optionalId(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).normalize("NFC").trim();
  if (!text || text.length > 280 || /[\u0000-\u001f]/.test(text)) throw new Error("Workspace selection identifier is invalid.");
  return text;
}
