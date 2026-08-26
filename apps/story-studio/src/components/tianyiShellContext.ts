import type { WorkspaceSelection, WorkspaceSelectionSource } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import type {
  ImpactReview,
  StoryStudioProject,
  VisualDocument,
  VisualDocumentType,
  VisualWorkbenchBootstrap,
  WorldObject,
  WorldObjectSummary,
  WritingDocument,
  TianyiContextRequest,
  StoryStudioIntelligenceMode
} from "../lib/localTransport";
import type { IntelligenceDocument } from "./IntelligenceWorkbench";
import type { StoryStudioEventReference } from "../../../../src/storyContracts/storyStudioEventReference";

export type TianyiShellContext = {
  mode: StoryStudioIntelligenceMode;
  contextKind: "project" | "scene" | "object" | "visual-document" | "visual-selection" | "review" | "unavailable";
  contextLabel: string;
  sourceLabels: string[];
  canOpenSource: boolean;
};

export type TianyiShellContextInput = {
  mode: StoryStudioIntelligenceMode;
  project: StoryStudioProject;
  showWorldHome: boolean;
  workspaceMode: "library" | VisualDocumentType;
  activeObject: WorldObject | null;
  visualWorkbench: VisualWorkbenchBootstrap | null;
  visualObject: WorldObject | null;
  objects: WorldObjectSummary[];
  selection: WorkspaceSelection;
  writingDocument: WritingDocument | null;
  intelligenceDocument: IntelligenceDocument;
  impactReview: ImpactReview | null;
  /** Present only when the visible context is an event selected by the author. */
  eventReference?: StoryStudioEventReference | null;
  /** Presentation-only label for an event handed off from Event Line. */
  eventLabel?: string | null;
};

export function deriveTianyiShellContext(input: TianyiShellContextInput): TianyiShellContext {
  if (input.mode === "localization" || input.mode === "publish") return unavailableTianyiContext(input.mode);

  if (input.mode === "writing") {
    if (!input.writingDocument) return unavailableTianyiContext(input.mode);
    return {
      mode: input.mode,
      contextKind: "scene",
      contextLabel: input.writingDocument.title,
      sourceLabels: ["写作", input.writingDocument.type === "scene" ? "当前场景" : "当前章节"],
      canOpenSource: true
    };
  }

  if (input.mode === "intelligence") {
    const sceneTitle = input.intelligenceDocument === "impact-review"
      ? input.impactReview?.source.sceneTitle || input.writingDocument?.title
      : input.writingDocument?.title;
    const contextLabel = ({
      "impact-review": "影响评审",
      supervisor: "女娲",
      "review-history": "评审记录"
    })[input.intelligenceDocument];
    return {
      mode: input.mode,
      contextKind: "review",
      contextLabel,
      sourceLabels: ["推演", ...(input.intelligenceDocument !== "review-history" && sceneTitle ? [sceneTitle] : [])],
      canOpenSource: true
    };
  }

  if (input.eventReference) {
    return {
      mode: input.mode,
      contextKind: "object",
      contextLabel: input.eventLabel || "事件线当前事件",
      sourceLabels: ["事件线", "已授权事件"],
      canOpenSource: true
    };
  }

  if (input.showWorldHome) {
    return { mode: input.mode, contextKind: "project", contextLabel: input.project.title, sourceLabels: ["世界", "当前项目"], canOpenSource: true };
  }

  if (input.workspaceMode === "library") {
    if (!input.activeObject) return unavailableTianyiContext(input.mode);
    return {
      mode: input.mode,
      contextKind: "object",
      contextLabel: input.activeObject.title,
      sourceLabels: ["世界资料", objectTypeLabel(input.activeObject.type)],
      canOpenSource: true
    };
  }

  const activeDocuments = [input.visualWorkbench?.primaryDocument, input.visualWorkbench?.splitView ? input.visualWorkbench.secondaryDocument : null]
    .filter((document): document is VisualDocument => Boolean(document));
  const selectionDocument = activeDocuments.find((document) => document.id === input.selection.documentId);
  if (selectionDocument && isVisualSelectionSource(input.selection.source) && input.selection.objectId) {
    const selectedObject = input.visualObject?.id === input.selection.objectId
      ? input.visualObject
      : input.objects.find((object) => object.id === input.selection.objectId) || null;
    if (!selectedObject) return unavailableTianyiContext(input.mode);
    return {
      mode: input.mode,
      contextKind: "visual-selection",
      contextLabel: selectedObject.title,
      sourceLabels: [visualDocumentTypeLabel(selectionDocument.type), objectTypeLabel(selectedObject.type)],
      canOpenSource: true
    };
  }

  const primary = input.visualWorkbench?.primaryDocument;
  if (!primary || primary.type !== input.workspaceMode) return unavailableTianyiContext(input.mode);
  return {
    mode: input.mode,
    contextKind: "visual-document",
    contextLabel: primary.title,
    sourceLabels: ["视觉文档", visualDocumentTypeLabel(primary.type)],
    canOpenSource: true
  };
}

export function unavailableTianyiContext(mode: StoryStudioIntelligenceMode): TianyiShellContext {
  return { mode, contextKind: "unavailable", contextLabel: "", sourceLabels: [], canOpenSource: false };
}

export function deriveTianyiContextRequest(input: TianyiShellContextInput): TianyiContextRequest | null {
  if (input.mode === "localization" || input.mode === "publish") return null;
  if (input.mode === "writing") {
    if (!input.writingDocument) return null;
    return contextRequest(input.mode, "writing-document", input.writingDocument.id, {
      documentId: input.writingDocument.id,
      sourceRefs: [
        ...input.writingDocument.guard.rules.map((rule) => ({ id: rule.id, kind: "locked-rule", origin: "locked-rule" })),
        ...input.writingDocument.guard.threads.map((thread) => ({ id: thread.id, kind: "unresolved-thread", origin: "unresolved-thread" }))
      ]
    });
  }
  if (input.mode === "intelligence") return contextRequest(input.mode, input.writingDocument?.type === "scene" ? "writing-document" : "project", input.writingDocument?.type === "scene" ? input.writingDocument.id : input.project.id, input.writingDocument?.type === "scene" ? { documentId: input.writingDocument.id } : {});
  if (input.eventReference) return contextRequest(input.mode, "world-object", input.eventReference.eventId, {
    objectId: input.eventReference.eventId,
    eventRefs: [input.eventReference]
  });
  if (input.showWorldHome) return contextRequest(input.mode, "project", input.project.id);
  if (input.workspaceMode === "library") {
    if (input.activeObject) return contextRequest(input.mode, "world-object", input.activeObject.id, {
      objectId: input.activeObject.id,
      eventRefs: input.activeObject.type === "event" && eventReferenceOf(input)?.eventId === input.activeObject.id
        ? [eventReferenceOf(input)!]
        : []
    });
    if (eventReferenceOf(input)) return contextRequest(input.mode, "world-object", eventReferenceOf(input)!.eventId, {
      objectId: eventReferenceOf(input)!.eventId,
      eventRefs: [eventReferenceOf(input)!]
    });
    return null;
  }
  const activeDocuments = [input.visualWorkbench?.primaryDocument, input.visualWorkbench?.splitView ? input.visualWorkbench.secondaryDocument : null].filter((document): document is VisualDocument => Boolean(document));
  const selectionDocument = activeDocuments.find((document) => document.id === input.selection.documentId);
  if (selectionDocument && isVisualSelectionSource(input.selection.source) && input.selection.objectId) {
    const selectedObject = input.visualObject?.id === input.selection.objectId ? input.visualObject : input.objects.find((object) => object.id === input.selection.objectId) || null;
    return selectedObject ? contextRequest(input.mode, "visual-document", selectionDocument.id, {
      documentId: selectionDocument.id,
      objectId: selectedObject.id,
      sourceRefs: [{ id: selectedObject.id, kind: "selection", origin: "shared-selection" }],
      eventRefs: selectedObject.type === "event" && eventReferenceOf(input)?.eventId === selectedObject.id
        ? [eventReferenceOf(input)!]
        : []
    }) : null;
  }
  const primary = input.visualWorkbench?.primaryDocument;
  return primary && primary.type === input.workspaceMode ? contextRequest(input.mode, "visual-document", primary.id, { documentId: primary.id }) : null;
}

function contextRequest(
  productMode: StoryStudioIntelligenceMode,
  kind: TianyiContextRequest["activeOwner"]["kind"],
  id: string,
  input: {
    documentId?: string | null;
    objectId?: string | null;
    timelinePointId?: string | null;
    sourceRefs?: TianyiContextRequest["sourceRefs"];
    eventRefs?: StoryStudioEventReference[];
  } = {}
): TianyiContextRequest {
  return {
    productMode,
    activeOwner: { kind, id },
    selection: { documentId: input.documentId ?? null, objectId: input.objectId ?? null, timelinePointId: input.timelinePointId ?? null },
    sourceRefs: input.sourceRefs ?? [],
    memorySelections: [],
    enabledSkillRefs: [],
    ...(input.eventRefs?.length ? { eventRefs: input.eventRefs } : {})
  };
}

function eventReferenceOf(input: TianyiShellContextInput): StoryStudioEventReference | null {
  return input.eventReference ?? null;
}

function isVisualSelectionSource(source: WorkspaceSelectionSource): boolean {
  return ["map-marker", "graph-node", "graph-edge", "canvas-node", "canvas-edge", "timeline-event", "tree-node", "tree-edge"].includes(source);
}

function visualDocumentTypeLabel(type: VisualDocumentType): string {
  return ({ map: "地图", graph: "图谱", canvas: "画布", timeline: "时间线", tree: "树" })[type];
}

function objectTypeLabel(type: WorldObjectSummary["type"]): string {
  return ({ character: "人物", location: "地点", event: "事件", item: "物品", faction: "势力", rule: "规则", thread: "伏笔" })[type];
}
