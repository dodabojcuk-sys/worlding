import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type Edge,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  AlertTriangle,
  BookOpen,
  Box,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Eye,
  FileSearch,
  Focus,
  GitBranch,
  History,
  Layers3,
  Link2,
  LocateFixed,
  MapPin,
  MessageCircle,
  MousePointer2,
  PanelRight,
  RefreshCw,
  Route,
  ScanLine,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { GoldenLoopCandidateReview, GoldenLoopResult } from "../../lib/goldenLoopContract";
import type {
  VerifiedCanonEventListRead,
  VisualDocument,
  WorldObject
} from "../../lib/localTransport";
import { WorkspaceHeader } from "../../product-shell/WorkspaceHeader";
import {
  createStoryStudioEventReference,
  type StoryStudioEventReference
} from "../../../../../src/storyContracts/storyStudioEventReference";
import {
  storyObservationStableHash,
  type StoryObservationClueSource,
  type StoryObservationProjectionMode,
  type StoryObservationProposalPatch
} from "../../../../../src/storyContracts/storyObservationProposalPatch.ts";
import {
  eventLineEventMetadata,
  isVerifiedCanonEventDetail,
  type CanonReadFailure,
  type EventLineEventSummary,
  type VerifiedCanonEventDetailRead
} from "../eventLineCommittedEvents";
import { PageContextDock, type PageContextDockLens, type PageContextDockState } from "../PageContextDock";
import { workspaceDockCoordinator } from "../../product-shell/WorkspaceDockCoordinator";

import { createStoryObservationDevelopmentPatch } from "./storyObservationDevelopmentAdapter";
import {
  buildStoryObservationModel,
  createStoryObservationSelectionContext,
  layoutStoryObservationNodes,
  storyObservationHiddenDescendants,
  timeWindowFromPercents,
  visibleStoryObservationRelations,
  type StoryObservationLayoutNode,
  type StoryObservationModel,
  type StoryObservationNode,
  type StoryObservationRelation,
  type StoryObservationCanvasScale
} from "./storyObservationProjection";
import {
  StoryObservationNodeComponent,
  type StoryObservationFlowNode
} from "./StoryObservationNode";
import {
  effectiveCanvasSafeRect,
  minimumCanvasViewportShift,
  type CanvasSafeRect
} from "./effectiveCanvasSafeRect";

type StoryObservationDockLens = "detail" | "impact" | "branches" | "review";
export type StoryObservationReviewSubmission = {
  result: GoldenLoopResult;
  review: GoldenLoopCandidateReview;
};
type TimeChangePreview = {
  nodeId: string;
  originalLabel: string;
  proposedLabel: string;
  deltaPixels: number;
};

const DEFAULT_CLUE_SOURCES: StoryObservationClueSource[] = ["causality", "character", "object", "location", "foreshadow"];
const CLUE_SOURCE_PRESENTATION: Array<{ id: StoryObservationClueSource; label: string; icon: ReactNode }> = [
  { id: "causality", label: "因果", icon: <Route /> },
  { id: "character", label: "角色", icon: <UsersRound /> },
  { id: "object", label: "物品", icon: <Box /> },
  { id: "location", label: "地点", icon: <MapPin /> },
  { id: "foreshadow", label: "伏笔", icon: <GitBranch /> },
  { id: "custom", label: "自定义", icon: <Layers3 /> }
];
const RELATION_COLORS: Record<StoryObservationRelation["kind"], string> = {
  narrative: "#5e8ff4",
  causality: "#dc665d",
  character: "#9d79df",
  object: "#34b6cf",
  location: "#d1a247",
  foreshadow: "#6fa858",
  custom: "#82958f"
};
const nodeTypes = { "story-observation": StoryObservationNodeComponent };
const CANVAS_SAFE_AREA_PADDING = 12;

export function StoryObservationCanvas(props: {
  embedded?: boolean;
  projectionMode?: StoryObservationProjectionMode;
  selectedEventId?: string | null;
  roleLens?: string | null;
  onSelectedEventId?(eventId: string | null): void;
  projectId: string;
  projectTitle: string;
  events: EventLineEventSummary[];
  listState: VerifiedCanonEventListRead | { status: "loading" };
  visualDocuments: VisualDocument[];
  goldenLoop: GoldenLoopResult | null;
  currentFocusLabel: string;
  currentUnitLabel: string | null;
  onReadEvent(eventId: string): Promise<VerifiedCanonEventDetailRead>;
  onRetry(): void;
  onOpenTianyi(reference?: StoryStudioEventReference): void;
  onSubmitProposal(patch: StoryObservationProposalPatch): Promise<StoryObservationReviewSubmission>;
  onContinueReview(result: GoldenLoopResult): void;
}) {
  const [mode, setMode] = useState<StoryObservationProjectionMode>(() => props.projectionMode ?? "event-line");
  const [canvasScale, setCanvasScale] = useState<StoryObservationCanvasScale>("focus");
  const [clueSources, setClueSources] = useState<Set<StoryObservationClueSource>>(() => new Set(DEFAULT_CLUE_SOURCES));
  const [observer, setObserver] = useState("author-omniscient");
  const [detailsById, setDetailsById] = useState<Record<string, WorldObject>>({});
  const [detailFailures, setDetailFailures] = useState<Record<string, CanonReadFailure>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedRelationIds, setSelectedRelationIds] = useState<string[]>([]);
  const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(() => new Set());
  const [localPositions, setLocalPositions] = useState<Record<StoryObservationProjectionMode, Record<string, { x: number; y: number }>>>(() => ({ "event-line": {}, timeline: {} }));
  const [timeWindow, setTimeWindow] = useState<{ startLabel: string; endLabel: string } | null>(null);
  const [timeChangePreview, setTimeChangePreview] = useState<TimeChangePreview | null>(null);
  const [proposalPatch, setProposalPatch] = useState<StoryObservationProposalPatch | null>(null);
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(null);
  const [editingOperationId, setEditingOperationId] = useState<string | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<StoryObservationReviewSubmission | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const [possibleWorldRequested, setPossibleWorldRequested] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [minimapRequested, setMinimapRequested] = useState(true);
  const [flowReady, setFlowReady] = useState(false);
  const [dockState, setDockState] = useState<PageContextDockState<StoryObservationDockLens>>(() => ({ open: Boolean(props.selectedEventId), activeLens: "detail" }));
  const flowInstanceRef = useRef<ReactFlowInstance<StoryObservationFlowNode, Edge> | null>(null);
  const canvasPanelRef = useRef<HTMLElement>(null);
  const pendingViewportAnchorRef = useRef<{ viewport: { x: number; y: number; zoom: number }; world: { x: number; y: number }; screen: { x: number; y: number }; selectedId: string | null } | null>(null);
  const rangeStartPercentRef = useRef<number | null>(null);
  const rangePointerRef = useRef<number | null>(null);
  const eventRequestSequence = useRef(0);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);
  const scopeSelectionRef = useRef<string | null>(null);
  const onReadEventRef = useRef(props.onReadEvent);

  const scopedEvents = useMemo(() => props.roleLens
    ? props.events.filter((event) => eventLineEventMetadata(event).characterLabels.includes(props.roleLens!))
    : props.events, [props.events, props.roleLens]);
  const eventIdentity = scopedEvents.map((event) => `${event.id}:${event.revisionToken}`).join("\u0000");
  const visualIdentity = props.visualDocuments.map((document) => `${document.id}:${document.contentHash}`).join("\u0000");
  const detailIdentity = Object.values(detailsById).map((event) => `${event.id}:${event.revisionToken}`).sort().join("\u0000");
  const clueSourceIdentity = [...clueSources].sort().join("\u0000");
  useEffect(() => { onReadEventRef.current = props.onReadEvent; }, [props.onReadEvent]);
  useEffect(() => {
    if (props.projectionMode) setMode(props.projectionMode);
  }, [props.projectionMode]);
  useEffect(() => {
    const requestSequence = ++eventRequestSequence.current;
    const missing = scopedEvents.filter((event) => !detailsById[event.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    setLoadingDetails(true);
    void Promise.all(missing.map(async (event) => {
      try {
        const read = await onReadEventRef.current(event.id);
        if (read.status === "error") return { eventId: event.id, error: read.error } as const;
        if (!isVerifiedCanonEventDetail(read.event) || read.event.id !== event.id) {
          return { eventId: event.id, error: { kind: "invalid-record", message: "事件详情不符合已确认读取合同。" } as CanonReadFailure } as const;
        }
        return { eventId: event.id, detail: read.event } as const;
      } catch {
        return { eventId: event.id, error: { kind: "repository-io", message: "事件详情暂时无法读取。" } as CanonReadFailure } as const;
      }
    })).then((results) => {
      if (cancelled || requestSequence !== eventRequestSequence.current) return;
      const nextDetails: Record<string, WorldObject> = {};
      const nextFailures: Record<string, CanonReadFailure> = {};
      for (const result of results) {
        if ("detail" in result && result.detail) nextDetails[result.eventId] = result.detail;
        if ("error" in result && result.error) nextFailures[result.eventId] = result.error;
      }
      setDetailsById((current) => ({ ...current, ...nextDetails }));
      setDetailFailures((current) => ({ ...current, ...nextFailures }));
    }).finally(() => {
      if (!cancelled && requestSequence === eventRequestSequence.current) setLoadingDetails(false);
    });
    return () => { cancelled = true; };
  }, [eventIdentity, detailsById]);

  useEffect(() => {
    const eventIds = new Set(scopedEvents.map((event) => event.id));
    setDetailsById((current) => Object.fromEntries(Object.entries(current).filter(([eventId]) => eventIds.has(eventId))));
    setDetailFailures((current) => Object.fromEntries(Object.entries(current).filter(([eventId]) => eventIds.has(eventId))));
    setSelectedNodeIds((current) => current.filter((eventId) => eventIds.has(eventId) || eventId.startsWith("candidate:")));
  }, [eventIdentity]);

  useEffect(() => {
    if (!scopeOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setScopeOpen(false);
      window.requestAnimationFrame(() => scopeTriggerRef.current?.focus());
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [scopeOpen]);

  useEffect(() => {
    const closeTransientOverlays = () => setScopeOpen(false);
    window.addEventListener("story-studio-close-mobile-overlays", closeTransientOverlays);
    return () => window.removeEventListener("story-studio-close-mobile-overlays", closeTransientOverlays);
  }, []);

  const model = useMemo(() => buildStoryObservationModel({
    events: scopedEvents,
    detailsById,
    visualDocuments: props.visualDocuments,
    proposalPatch
  }), [detailIdentity, eventIdentity, proposalPatch, visualIdentity]);
  useEffect(() => {
    if (!props.selectedEventId || !scopedEvents.some((event) => event.id === props.selectedEventId)) return;
    setSelectedNodeIds((current) => current.length === 1 && current[0] === props.selectedEventId ? current : [props.selectedEventId!]);
    setSelectedRelationIds([]);
  }, [props.selectedEventId, scopedEvents]);
  const visibleRelations = useMemo(() => visibleStoryObservationRelations(model.relations, clueSources), [clueSourceIdentity, model.relations]);
  const hiddenNodeIds = useMemo(() => storyObservationHiddenDescendants(collapsedRootIds, visibleRelations), [collapsedRootIds, visibleRelations]);
  const layoutNodes = useMemo(() => layoutStoryObservationNodes(model, mode, canvasScale), [canvasScale, mode, model]);

  const flowNodes = useMemo<StoryObservationFlowNode[]>(() => {
    const positionOverrides = localPositions[mode];
    return layoutNodes.filter((node) => !hiddenNodeIds.has(node.id)).map((node) => ({
      id: node.id,
      type: "story-observation" as const,
      position: positionOverrides[node.id] ?? node.position,
      data: {
        observation: node,
        hiddenDescendantCount: collapsedRootIds.has(node.id)
          ? storyObservationHiddenDescendants(new Set([node.id]), visibleRelations).size
          : 0,
        density: canvasScale
      },
      style: { width: node.width },
      draggable: node.status === "confirmed"
    }));
  }, [canvasScale, collapsedRootIds, hiddenNodeIds, layoutNodes, localPositions, mode, visibleRelations]);

  const visibleNodeIds = useMemo(() => new Set(flowNodes.map((node) => node.id)), [flowNodes]);
  const minimapVisible = minimapRequested && canvasSize.width >= 900;

  const keepSelectedNodeWithinSafeArea = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const panel = canvasPanelRef.current;
    const instance = flowInstanceRef.current;
    const selectedElement = panel?.querySelector<HTMLElement>(".react-flow__node.selected");
    if (!panel || !instance || !selectedElement) return;

    const overlayElements = [
      ...panel.querySelectorAll<HTMLElement>(".react-flow__minimap, .react-flow__controls, .story-observation-floating-actions, .story-observation-undetermined-label"),
      ...document.querySelectorAll<HTMLElement>("[data-right-dock-slot], .page-context-dock")
    ];
    const safeArea = effectiveCanvasSafeRect({
      canvasRect: canvasRect(panel),
      overlayRects: overlayElements.map(canvasRect),
      padding: CANVAS_SAFE_AREA_PADDING
    });
    const shift = minimumCanvasViewportShift({
      selectedRect: canvasRect(selectedElement),
      safeArea,
      padding: CANVAS_SAFE_AREA_PADDING
    });
    if (shift.x === 0 && shift.y === 0) return;

    const viewport = instance.getViewport();
    void instance.setViewport({
      x: viewport.x + shift.x,
      y: viewport.y + shift.y,
      zoom: viewport.zoom
    });
  }, [selectedNodeIds]);

  const captureViewportAnchor = useCallback(() => {
    const panel = canvasPanelRef.current;
    const instance = flowInstanceRef.current;
    if (!panel || !instance) return;
    const viewport = instance.getViewport();
    const selectedId = selectedNodeIds.find((id) => flowNodes.some((node) => node.id === id)) ?? null;
    const selected = selectedId ? flowNodes.find((node) => node.id === selectedId) ?? null : null;
    const rect = panel.getBoundingClientRect();
    const world = selected
      ? { x: selected.position.x + (Number(selected.style?.width) || 0) / 2, y: selected.position.y + 63 }
      : { x: (rect.width / 2 - viewport.x) / viewport.zoom, y: (rect.height / 2 - viewport.y) / viewport.zoom };
    pendingViewportAnchorRef.current = {
      viewport,
      world,
      screen: { x: selected ? viewport.x + world.x * viewport.zoom : rect.width / 2, y: selected ? viewport.y + world.y * viewport.zoom : rect.height / 2 },
      selectedId
    };
  }, [flowNodes, selectedNodeIds]);

  const requestDockState = useCallback((next: PageContextDockState<StoryObservationDockLens>) => {
    if (next.open) window.dispatchEvent(new Event("story-studio-close-mobile-context"));
    if (next.open !== dockState.open) captureViewportAnchor();
    if (next.open) workspaceDockCoordinator.openPageInspector("story-observation");
    else workspaceDockCoordinator.closePageInspector("story-observation");
    setDockState(next);
  }, [captureViewportAnchor, dockState.open]);

  useLayoutEffect(() => {
    const panel = canvasPanelRef.current;
    if (!panel) return;
    const measure = () => {
      const rect = panel.getBoundingClientRect();
      setCanvasSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      const anchor = pendingViewportAnchorRef.current;
      const instance = flowInstanceRef.current;
      if (!anchor || !instance || rect.width === 0 || rect.height === 0) return;
      pendingViewportAnchorRef.current = null;
      window.requestAnimationFrame(() => {
        const screen = anchor.selectedId ? anchor.screen : { x: rect.width / 2, y: rect.height / 2 };
        void instance.setViewport({ x: screen.x - anchor.world.x * anchor.viewport.zoom, y: screen.y - anchor.world.y * anchor.viewport.zoom, zoom: anchor.viewport.zoom });
        window.requestAnimationFrame(keepSelectedNodeWithinSafeArea);
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [keepSelectedNodeWithinSafeArea]);

  useLayoutEffect(() => {
    if (!flowReady) return;
    const frame = window.requestAnimationFrame(keepSelectedNodeWithinSafeArea);
    return () => window.cancelAnimationFrame(frame);
  }, [flowReady, keepSelectedNodeWithinSafeArea, minimapVisible]);

  const focusNode = useCallback((nodeId: string) => {
    const visible = new Set<string>([nodeId]);
    for (let layer = 0; layer < 2; layer += 1) {
      for (const relation of visibleRelations.filter((relation) => relation.kind === "narrative")) {
        if (visible.has(relation.source)) visible.add(relation.target);
        if (visible.has(relation.target)) visible.add(relation.source);
      }
    }
    setCanvasScale("focus");
    window.requestAnimationFrame(() => {
      void flowInstanceRef.current?.fitView({
        nodes: flowNodes.filter((node) => visible.has(node.id)).map((node) => ({ id: node.id })),
        padding: 0.26,
        maxZoom: 1.04,
        duration: 280
      });
    });
  }, [flowNodes, visibleRelations]);

  const showOverview = useCallback(() => {
    setCanvasScale("overview");
    window.requestAnimationFrame(() => {
      void flowInstanceRef.current?.fitView({ padding: 0.16, maxZoom: 0.82, duration: 280 });
    });
  }, []);

  useEffect(() => {
    if (!flowReady || canvasScale !== "focus" || selectedNodeIds.length > 0) return;
    const target = model.nodes.find((node) => node.title === props.currentFocusLabel.replace(/\s*·\s*立即揭示$/u, "") && isSemanticConfirmed(node))
      ?? model.nodes.find((node) => node.metadata.unitLabel === props.currentUnitLabel && isSemanticConfirmed(node))
      ?? model.nodes.find((node) => isSemanticConfirmed(node));
    if (!target) return;
    setSelectedNodeIds([target.id]);
    props.onSelectedEventId?.(target.id);
    focusNode(target.id);
  }, [canvasScale, flowReady, focusNode, model.nodes, props.currentUnitLabel, selectedNodeIds.length]);

  const flowEdges = useMemo<Edge[]>(() => visibleRelations.flatMap((relation) => {
    if (!visibleNodeIds.has(relation.source) || !visibleNodeIds.has(relation.target)) return [];
    const relatedToSelection = selectedRelationIds.includes(relation.id) || selectedNodeIds.includes(relation.source) || selectedNodeIds.includes(relation.target);
    return [{
    id: relation.id,
    source: relation.source,
    target: relation.target,
    label: relatedToSelection ? relation.label : undefined,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: RELATION_COLORS[relation.kind], width: 14, height: 14 },
    style: {
      stroke: RELATION_COLORS[relation.kind],
      strokeWidth: relation.kind === "narrative" ? 3.1 : relatedToSelection ? 2 : 1.35,
      strokeDasharray: relation.kind === "narrative" || relation.status === "confirmed" ? undefined : relation.status === "candidate" ? "4 6" : "8 5",
      opacity: relation.kind === "narrative" ? 0.98 : relatedToSelection ? 0.9 : 0.48
    },
    labelStyle: { fill: "#9fb0aa", fontSize: 10 },
    labelBgStyle: { fill: "#07110f", fillOpacity: 0.86 },
    labelBgPadding: [5, 3] as [number, number],
    selectable: true
    }];
  }), [selectedNodeIds, selectedRelationIds, visibleNodeIds, visibleRelations]);

  const selectedNode = selectedNodeIds.map((id) => model.nodes.find((node) => node.id === id)).find(Boolean) ?? null;
  const selectedRelation = selectedRelationIds.map((id) => model.relations.find((relation) => relation.id === id)).find(Boolean) ?? null;
  const selectedSummary = selectedNode?.eventId ? scopedEvents.find((event) => event.id === selectedNode.eventId) ?? null : null;
  const selectedReference = selectedSummary
    ? createStoryStudioEventReference({ projectId: props.projectId, event: selectedSummary, requestedUse: "constraint" })
    : null;
  const selectedOperation = proposalPatch?.operations.find((operation) => operation.operationId === selectedOperationId) ?? proposalPatch?.operations[0] ?? null;

  const onNodeDragStop = useCallback((_event: MouseEvent | TouchEvent, flowNode: StoryObservationFlowNode) => {
    const base = layoutNodes.find((node) => node.id === flowNode.id);
    if (!base) return;
    if (mode === "timeline" && Math.abs(flowNode.position.x - base.position.x) >= 36) {
      const delta = flowNode.position.x - base.position.x;
      setTimeChangePreview({
        nodeId: flowNode.id,
        originalLabel: base.time.label,
        proposedLabel: timelineDragLabel(base, delta),
        deltaPixels: Math.round(delta)
      });
      requestDockState({ open: true, activeLens: "impact" });
      setStatusMessage("横向拖动已转为时间变更预览；Event 未被修改。");
      setLocalPositions((current) => ({
        ...current,
        timeline: { ...current.timeline, [flowNode.id]: { x: base.position.x, y: flowNode.position.y } }
      }));
      return;
    }
    setLocalPositions((current) => ({
      ...current,
      [mode]: { ...current[mode], [flowNode.id]: flowNode.position }
    }));
  }, [layoutNodes, mode]);

  const toggleClueSource = (source: StoryObservationClueSource) => {
    setClueSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const generateProposal = (selectionOverride?: { startLabel: string; endLabel: string } | null) => {
    const confirmedNodeIds = selectedNodeIds.filter((id) => model.nodes.some((node) => node.id === id && isSemanticConfirmed(node)));
    const selectedWindow = selectionOverride === undefined ? timeWindow : selectionOverride;
    if (confirmedNodeIds.length === 0 && !selectedWindow) {
      setStatusMessage("请先圈选节点、关系，或在时间尺上拖出一个范围。");
      return;
    }
    const selection = createStoryObservationSelectionContext({
      projection: mode,
      nodeIds: confirmedNodeIds,
      relationIds: selectedRelationIds,
      timeWindow: selectedWindow,
      clueSources: [...clueSources],
      observer
    });
    const patch = createStoryObservationDevelopmentPatch({ projectId: props.projectId, model, selection });
    setProposalPatch(patch);
    setSelectedOperationId(patch.operations[0]?.operationId ?? null);
    setEditingOperationId(null);
    setReviewSubmission(null);
    setProposalError("");
    requestDockState({ open: true, activeLens: "branches" });
    setStatusMessage(`已生成 ${patch.operations.length} 个可审查候选；Provider 调用为 0。`);
  };

  const rejectProposal = () => {
    setProposalPatch(null);
    setSelectedOperationId(null);
    setEditingOperationId(null);
    setReviewSubmission(null);
    setProposalError("");
    setPossibleWorldRequested(false);
    setStatusMessage("候选已拒绝；Canon、WorldState 与已确认 Event 均未变化。");
  };

  const reviseSelectedOperation = (after: string) => {
    if (!proposalPatch || !selectedOperation) return;
    const operations = proposalPatch.operations.map((operation) => operation.operationId === selectedOperation.operationId
      ? { ...operation, after }
      : operation);
    const revisionHash = storyObservationStableHash({ basePatchId: proposalPatch.patchId, operationId: selectedOperation.operationId, after });
    setProposalPatch({
      ...proposalPatch,
      patchId: `story-observation-patch-${revisionHash}`,
      contextId: `story-observation-context-${revisionHash}`,
      operations,
      createdAt: new Date().toISOString()
    });
    setReviewSubmission(null);
  };

  const submitProposal = async () => {
    if (!proposalPatch || proposalBusy) return;
    setProposalBusy(true);
    setProposalError("");
    try {
      const submission = await props.onSubmitProposal(proposalPatch);
      setReviewSubmission(submission);
      requestDockState({ open: true, activeLens: "review" });
      setStatusMessage(`已进入 Candidate Review：${submission.review.id}；尚未写入 Canon。`);
    } catch (cause) {
      setProposalError(cause instanceof Error ? cause.message : "候选未能进入评审链。");
    } finally {
      setProposalBusy(false);
    }
  };

  const toggleCollapseSelected = () => {
    const target = selectedNodeIds.find((id) => model.nodes.some((node) => node.id === id && isSemanticConfirmed(node)));
    if (!target) return;
    setCollapsedRootIds((current) => {
      const next = new Set(current);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };

  const focusCurrentStory = () => {
    const target = model.nodes.find((node) => node.title === props.currentFocusLabel.replace(/\s*·\s*立即揭示$/u, "") && isSemanticConfirmed(node))
      ?? model.nodes.find((node) => node.metadata.unitLabel === props.currentUnitLabel && isSemanticConfirmed(node))
      ?? model.nodes.find((node) => isSemanticConfirmed(node));
    if (!target) return;
    setSelectedNodeIds([target.id]);
    props.onSelectedEventId?.(target.id);
    setCollapsedRootIds(new Set());
    focusNode(target.id);
  };

  const beginTimeRange = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== "timeline") return;
    const percent = pointerPercent(event);
    rangeStartPercentRef.current = percent;
    rangePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setTimeWindow({ startLabel: timeLabelFromPercent(percent), endLabel: timeLabelFromPercent(percent) });
  };
  const updateTimeRange = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (rangePointerRef.current !== event.pointerId || rangeStartPercentRef.current === null) return;
    const current = pointerPercent(event);
    setTimeWindow(timeWindowFromPercents(rangeStartPercentRef.current, current));
  };
  const finishTimeRange = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (rangePointerRef.current !== event.pointerId || rangeStartPercentRef.current === null) return;
    const next = timeWindowFromPercents(rangeStartPercentRef.current, pointerPercent(event));
    rangeStartPercentRef.current = null;
    rangePointerRef.current = null;
    setTimeWindow(next);
    setStatusMessage(`已选择时间窗口 ${next.startLabel} – ${next.endLabel}。`);
  };

  const dockLenses: PageContextDockLens<StoryObservationDockLens>[] = [
    {
      id: "detail",
      label: "事件详情",
      icon: <FileSearch />,
      content: <ObservationDetailDock
        node={selectedNode}
        relation={selectedRelation}
        failure={selectedNode?.eventId ? detailFailures[selectedNode.eventId] ?? null : null}
        loading={loadingDetails}
        onOpenTianyi={() => props.onOpenTianyi(selectedReference ?? undefined)}
      />
    },
    {
      id: "impact",
      label: "影响",
      icon: <Link2 />,
      content: <ObservationImpactDock
        selectedNodeIds={selectedNodeIds}
        relations={visibleRelations}
        sourceCounts={model.sourceCounts}
        timeChangePreview={timeChangePreview}
        onCancelTimeChange={() => { setTimeChangePreview(null); setStatusMessage("已取消时间变更预览；Event 未改变。"); }}
        onProposeTimeChange={() => {
          if (!timeChangePreview) return;
          const nextWindow = { startLabel: timeChangePreview.originalLabel, endLabel: timeChangePreview.proposedLabel };
          setTimeWindow(nextWindow);
          generateProposal(nextWindow);
          setTimeChangePreview(null);
        }}
      />
    },
    {
      id: "branches",
      label: "候选",
      icon: <GitBranch />,
      badge: proposalPatch?.operations.length ?? 0,
      content: <ObservationProposalDock
        patch={proposalPatch}
        selectedOperationId={selectedOperation?.operationId ?? null}
        editingOperationId={editingOperationId}
        possibleWorldRequested={possibleWorldRequested}
        busy={proposalBusy}
        error={proposalError}
        onSelect={setSelectedOperationId}
        onEdit={setEditingOperationId}
        onRevise={reviseSelectedOperation}
        onReject={rejectProposal}
        onContinue={() => generateProposal()}
        onPossibleWorld={() => {
          setPossibleWorldRequested(true);
          setStatusMessage("可能世界请求只保留在本地 ViewState；R0 没有建立第二 WorldState。");
        }}
        onSubmit={() => void submitProposal()}
      />
    },
    {
      id: "review",
      label: "评审",
      icon: <ShieldCheck />,
      badge: reviewSubmission ? 1 : props.goldenLoop?.nuwa.candidates.length ?? 0,
      content: <ObservationReviewDock
        submission={reviewSubmission}
        existingResult={props.goldenLoop}
        onContinue={() => reviewSubmission ? props.onContinueReview(reviewSubmission.result) : undefined}
      />
    }
  ];

  return <section className="workbench story-observation-workbench" data-testid="story-observation-canvas" data-event-observation-renderer={mode === "timeline" ? "timeline" : "canvas"} data-projection={mode} data-story-observation-readable="true">
    {!props.embedded ? <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="事件线"
      title="故事观测画布"
      context={`当前故事 · ${props.currentFocusLabel}`}
      status={<span className="story-observation-header-status"><span />隔离 R0 · 只读投影</span>}
      prototype="workbench"
      icon={<BookOpen />}
      className="story-observation-header"
      onOpenNavigation={() => setScopeOpen(true)}
      actions={<div className="story-observation-header-actions">
        <button type="button" onClick={focusCurrentStory}><LocateFixed />回到当前故事</button>
      </div>}
    /> : null}
    <div className={`story-observation-shell ${props.embedded ? "is-embedded" : ""}`} data-page-dock-open={dockState.open ? "true" : "false"}>
      {!props.embedded ? <><button ref={scopeTriggerRef} type="button" className="story-observation-scope-trigger" aria-expanded={scopeOpen} onClick={() => setScopeOpen(true)}><Layers3 />故事视野</button>
      <ObservationScope
        open={scopeOpen}
        projectTitle={props.projectTitle}
        currentFocusLabel={props.currentFocusLabel}
        currentUnitLabel={props.currentUnitLabel}
        nodes={model.nodes}
          selectedNodeIds={selectedNodeIds}
          onSelectNode={(nodeId) => {
          // This is a page-level reading selection. React Flow can emit a
          // transient empty selection while it reconciles visual nodes, which
          // must not erase the author's selected confirmed Event.
          scopeSelectionRef.current = nodeId;
            setSelectedNodeIds([nodeId]);
            props.onSelectedEventId?.(nodeId);
            setSelectedRelationIds([]);
            setScopeOpen(false);
            focusNode(nodeId);
        }}
        onClose={() => { setScopeOpen(false); window.requestAnimationFrame(() => scopeTriggerRef.current?.focus()); }}
      />
      {scopeOpen ? <button type="button" className="story-observation-scope-backdrop" aria-label="关闭故事视野" onClick={() => setScopeOpen(false)} /> : null}</> : null}
      <main className="story-observation-main">
        <header className="story-observation-controls">
          {!props.embedded ? <div className="story-observation-projection-tabs" role="tablist" aria-label="观测角度">
            <button id="story-observation-event-line-tab" type="button" role="tab" aria-selected={mode === "event-line"} aria-controls="story-observation-canvas-panel" onClick={() => { setMode("event-line"); setTimeWindow(null); }}>事件线</button>
            <button id="story-observation-timeline-tab" type="button" role="tab" aria-selected={mode === "timeline"} aria-controls="story-observation-canvas-panel" onClick={() => setMode("timeline")}>时间线</button>
          </div> : null}
          <div className="story-observation-source-row" aria-label="线索来源">
            <small>线索来源</small>
            {CLUE_SOURCE_PRESENTATION.map((source) => <button type="button" key={source.id} aria-pressed={clueSources.has(source.id)} onClick={() => toggleClueSource(source.id)}>{source.icon}<span>{source.label}</span><small>{model.sourceCounts[source.id]}</small></button>)}
            {!props.embedded ? <label><Eye /><span className="sr-only">观测者</span><select value={observer} onChange={(event) => setObserver(event.target.value)}><option value="author-omniscient">作者视野</option><option value="characters-only">角色所知</option><option value="evidence-only">只看证据</option></select><ChevronDown /></label> : null}
          </div>
          <div className="story-observation-view-row">
            <div><span><CircleDot />{model.nodes.filter(isSemanticConfirmed).length} 个正式事件</span><span><Link2 />{visibleRelations.length} 条当前关系</span>{loadingDetails ? <span><RefreshCw className="is-spinning" />读取时间与关联</span> : null}</div>
            <div><button type="button" aria-pressed={canvasScale === "overview"} onClick={showOverview}><ScanLine />概览</button><button type="button" aria-pressed={canvasScale === "focus"} onClick={focusCurrentStory}><Focus />聚焦当前</button><button type="button" aria-pressed={minimapRequested} onClick={() => setMinimapRequested((current) => !current)}><MapPin />缩略图</button><button type="button" disabled={selectedNodeIds.length === 0} aria-pressed={selectedNodeIds.some((id) => collapsedRootIds.has(id))} onClick={toggleCollapseSelected}><GitBranch />折叠支链</button><button type="button" aria-pressed={dockState.open} onClick={() => requestDockState({ ...dockState, open: !dockState.open })}><PanelRight />页面工具</button></div>
          </div>
        </header>

        {mode === "timeline" ? <div
          className="story-observation-time-ruler"
          data-testid="story-observation-time-ruler"
          onPointerDown={beginTimeRange}
          onPointerMove={updateTimeRange}
          onPointerUp={finishTimeRange}
          onPointerCancel={() => { rangeStartPercentRef.current = null; rangePointerRef.current = null; }}
        ><span>18:00</span><span>20:00</span><span>22:00</span><strong><Clock3 />当前世界时</strong><span>00:00</span><span>02:00</span>{timeWindow ? <mark style={timeWindowStyle(timeWindow)}>{timeWindow.startLabel} – {timeWindow.endLabel}</mark> : null}</div> : null}

        <section ref={canvasPanelRef} id="story-observation-canvas-panel" className="story-observation-canvas-panel" data-canvas-scale={canvasScale} data-canvas-available-width={canvasSize.width} data-canvas-available-height={canvasSize.height} data-minimap-visible={minimapVisible} role="tabpanel" aria-labelledby={mode === "event-line" ? "story-observation-event-line-tab" : "story-observation-timeline-tab"}>
          <ObservationListState state={props.listState} eventCount={props.events.length} onRetry={props.onRetry} />
          {props.listState.status === "ready" && props.events.length > 0 ? <ReactFlow<StoryObservationFlowNode, Edge>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeDragStop={onNodeDragStop}
            onInit={(instance) => {
              flowInstanceRef.current = instance;
              setFlowReady(true);
            }}
            onMoveEnd={() => {
              window.requestAnimationFrame(keepSelectedNodeWithinSafeArea);
            }}
            onSelectionChange={({ nodes, edges }) => {
              const nextNodeIds = nodes.map((node) => node.id);
              const nextRelationIds = edges.map((edge) => edge.id);
              const pendingScopeSelection = scopeSelectionRef.current;
              if (pendingScopeSelection && nextNodeIds.length === 0) {
                // The page list already owns this selection.  Ignore React
                // Flow's transient empty reconciliation rather than setting
                // state again from inside its controlled selection callback.
                return;
              }
              // React Flow can report an empty selection while it reconciles a
              // stable canvas after a list selection.  Clearing through that
              // transient report makes the proposal action look unavailable;
              // authors use the explicit clear action for an intentional reset.
              if (nextNodeIds.length === 0 && nextRelationIds.length === 0 && selectedNodeIds.length > 0) {
                return;
              }
              scopeSelectionRef.current = null;
              setSelectedNodeIds((current) => sameOrderedIds(current, nextNodeIds) ? current : nextNodeIds);
              setSelectedRelationIds((current) => sameOrderedIds(current, nextRelationIds) ? current : nextRelationIds);
              props.onSelectedEventId?.(nextNodeIds.find((id) => scopedEvents.some((event) => event.id === id)) ?? null);
            }}
            onNodeClick={(_event, node) => {
              focusNode(node.id);
              requestDockState({ open: true, activeLens: "detail" });
            }}
            onEdgeClick={() => {
              requestDockState({ open: true, activeLens: "impact" });
            }}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            multiSelectionKeyCode={["Meta", "Control"]}
            deleteKeyCode={null}
            minZoom={0.42}
            maxZoom={1.8}
            aria-label={mode === "event-line" ? "事件线故事观测画布" : "世界时间线观测画布"}
          >
            <Background color="rgba(109, 142, 133, .12)" gap={26} size={1} />
            {minimapVisible ? <MiniMap
              pannable
              zoomable
              ariaLabel="故事观测小地图"
              nodeColor={(node) => (node.data.observation as StoryObservationLayoutNode).status === "candidate" ? "#a77bd8" : "#2f8176"}
              maskColor="rgba(3, 10, 14, .72)"
            /> : null}
            <Controls showInteractive={false} />
          </ReactFlow> : null}
          <div className="story-observation-floating-actions">
            <button type="button" disabled={selectedNodeIds.length === 0 && !timeWindow} onClick={() => generateProposal()}><Sparkles />{timeWindow ? "预测此时间范围" : "预测所选后续"}</button>
            <button type="button" onClick={() => {
              scopeSelectionRef.current = null;
              flowInstanceRef.current?.setNodes((current) => current.map((node) => ({ ...node, selected: false })));
              flowInstanceRef.current?.setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
              setSelectedNodeIds([]);
              setSelectedRelationIds([]);
              props.onSelectedEventId?.(null);
              setTimeWindow(null);
            }}><MousePointer2 />清除选区</button>
          </div>
          {mode === "timeline" ? <div className="story-observation-undetermined-label"><TimerReset /><strong>时间未定</strong><span>未提供权威世界时间的事件保留在此处</span></div> : null}
        </section>
        <footer className="story-observation-status" aria-live="polite"><ShieldCheck />{statusMessage || "画布只投影已确认事件；坐标、筛选与折叠均不写入 Canon。"}</footer>
      </main>
      <PageContextDock pageId="story-observation" label="故事观测画布" state={dockState} lenses={dockLenses} onState={requestDockState} />
    </div>
  </section>;
}

function ObservationScope(props: {
  open: boolean;
  projectTitle: string;
  currentFocusLabel: string;
  currentUnitLabel: string | null;
  nodes: readonly StoryObservationNode[];
  selectedNodeIds: readonly string[];
  onSelectNode(nodeId: string): void;
  onClose(): void;
}) {
  const confirmed = props.nodes.filter(isSemanticConfirmed);
  return <aside id="story-observation-page-scope" className={`story-observation-scope ${props.open ? "is-open" : ""}`} aria-label="故事视野">
    <header><div><small>故事视野</small><strong>{props.projectTitle}</strong></div><button type="button" aria-label="关闭故事视野" onClick={props.onClose}><X /></button></header>
    <section><small>当前故事</small><strong>{props.currentFocusLabel}</strong><span>{props.currentUnitLabel || "尚未绑定叙事单元"}</span></section>
    <nav aria-label="世界投影">
      <button type="button" className="is-active"><CircleDot /><span>默认世界</span><small>{confirmed.length}</small></button>
      <button type="button" disabled title="R0 不建立第二 WorldState"><GitBranch /><span>可能世界由评审链决定</span></button>
    </nav>
    <div className="story-observation-scope-list"><small>已确认事件</small>{confirmed.map((node) => <button type="button" key={node.id} className={props.selectedNodeIds.includes(node.id) ? "is-active" : ""} onClick={() => props.onSelectNode(node.id)}><span>{node.title}</span><small>{node.time.label}</small></button>)}</div>
    <footer><ShieldCheck /><span>事件和 WorldState 继续由现有 Owner 管理</span></footer>
  </aside>;
}

function ObservationDetailDock(props: {
  node: StoryObservationNode | null;
  relation: StoryObservationRelation | null;
  failure: CanonReadFailure | null;
  loading: boolean;
  onOpenTianyi(): void;
}) {
  if (props.relation) return <div className="story-observation-dock-stack"><section><small>当前关系</small><h2>{props.relation.label}</h2><dl><div><dt>来源</dt><dd>{props.relation.sourceKind}</dd></div><div><dt>语义</dt><dd>{props.relation.kind}</dd></div><div><dt>状态</dt><dd>{props.relation.status === "confirmed" ? "已确认" : props.relation.status === "candidate" ? "候选" : "投影推断"}</dd></div></dl></section></div>;
  if (!props.node) return <DockEmpty icon={<MousePointer2 />} title="选择一个事件" description="点击节点或圈选局部故事，查看来源与时间语义。" />;
  return <div className="story-observation-dock-stack">
    <section className={props.node.status === "candidate" ? "is-candidate" : ""}><small>{props.node.sourceLabel}</small><h2>{props.node.title}</h2><p>{props.node.summary}</p></section>
    {props.failure ? <section className="is-error" role="alert"><AlertTriangle /><strong>来源详情当前不可用</strong><p>{props.failure.message}</p></section> : null}
    <section><small>世界时间</small><dl><div><dt>发生时间</dt><dd>{props.node.time.label}</dd></div><div><dt>精度</dt><dd>{timePrecisionLabel(props.node.time.precision)}</dd></div><div><dt>持续</dt><dd>{props.node.time.end !== null && props.node.time.start !== null ? `${Math.round(props.node.time.end - props.node.time.start)} 分钟` : "未提供"}</dd></div><div><dt>来源字段</dt><dd>{props.node.time.sourceKey || "无，未伪造时间"}</dd></div></dl></section>
    <section><small>稳定引用</small><dl><div><dt>Event ID</dt><dd>{props.node.eventId || "候选尚无 Event ID"}</dd></div><div><dt>Revision</dt><dd>{props.node.revisionToken || "未进入 Canon"}</dd></div></dl>{props.node.eventId ? <button type="button" onClick={props.onOpenTianyi}><MessageCircle />带此事件询问天意</button> : null}</section>
    {props.loading ? <p className="story-observation-loading"><RefreshCw className="is-spinning" />正在补充已验证来源…</p> : null}
  </div>;
}

function ObservationImpactDock(props: {
  selectedNodeIds: readonly string[];
  relations: readonly StoryObservationRelation[];
  sourceCounts: StoryObservationModel["sourceCounts"];
  timeChangePreview: TimeChangePreview | null;
  onCancelTimeChange(): void;
  onProposeTimeChange(): void;
}) {
  const touching = props.relations.filter((relation) => props.selectedNodeIds.includes(relation.source) || props.selectedNodeIds.includes(relation.target));
  return <div className="story-observation-dock-stack">
    {props.timeChangePreview ? <section className="story-observation-time-preview"><small>时间变更预览</small><h2>{props.timeChangePreview.originalLabel} → {props.timeChangePreview.proposedLabel}</h2><p>横向拖动不会直接修改 Event。继续后只会生成 Proposal Patch，交由审核链决定。</p><div><button type="button" onClick={props.onCancelTimeChange}>取消</button><button type="button" onClick={props.onProposeTimeChange}>建立候选变更</button></div></section> : null}
    <section><small>选区影响</small><h2>{props.selectedNodeIds.length} 个节点 · {touching.length} 条相关关系</h2><p>关闭线索来源只会收起对齐区域，不会删除底层事件或关系。</p></section>
    <section><small>当前线索分布</small><dl>{Object.entries(props.sourceCounts).map(([source, count]) => <div key={source}><dt>{clueSourceLabel(source as StoryObservationClueSource)}</dt><dd>{count}</dd></div>)}</dl></section>
    <section><small>关系来源</small>{touching.length > 0 ? <ul>{touching.slice(0, 12).map((relation) => <li key={relation.id}><span style={{ color: RELATION_COLORS[relation.kind] }}>{relation.label}</span><small>{relation.sourceKind} · {relation.status}</small></li>)}</ul> : <p>当前选区没有可见关系。</p>}</section>
  </div>;
}

function ObservationProposalDock(props: {
  patch: StoryObservationProposalPatch | null;
  selectedOperationId: string | null;
  editingOperationId: string | null;
  possibleWorldRequested: boolean;
  busy: boolean;
  error: string;
  onSelect(operationId: string): void;
  onEdit(operationId: string | null): void;
  onRevise(after: string): void;
  onReject(): void;
  onContinue(): void;
  onPossibleWorld(): void;
  onSubmit(): void;
}) {
  if (!props.patch) return <DockEmpty icon={<Sparkles />} title="尚无候选提案" description="圈选节点或时间窗口后，可预览结构化 Proposal Patch。" />;
  const selected = props.patch.operations.find((operation) => operation.operationId === props.selectedOperationId) ?? props.patch.operations[0];
  return <div className="story-observation-proposal-dock">
    <section className="story-observation-adapter-notice"><BrainCircuit /><div><strong>结构化开发适配器</strong><p>仅用于隔离 R0 验证交互；Provider 调用 0，不是正式 Tianyi 运行结果。</p></div></section>
    <div className="story-observation-proposal-list" role="listbox" aria-label="Proposal Patch 候选操作">{props.patch.operations.map((operation) => <button type="button" role="option" aria-selected={operation.operationId === selected?.operationId} key={operation.operationId} onClick={() => props.onSelect(operation.operationId)}><span>{proposalOperationLabel(operation.kind)}</span><strong>{operation.title}</strong><small>置信度 {Math.round(operation.confidence * 100)}% · 待评审</small></button>)}</div>
    {selected ? <section className="story-observation-proposal-detail"><small>选中候选</small><h2>{selected.title}</h2><p>{selected.rationale}</p>{props.editingOperationId === selected.operationId ? <label><span>候选结果</span><textarea defaultValue={selected.after} onBlur={(event) => props.onRevise(event.target.value)} /></label> : <blockquote>{selected.after}</blockquote>}<dl><div><dt>风险</dt><dd>{selected.risk}</dd></div><div><dt>影响节点</dt><dd>{selected.affectedNodeIds.length}</dd></div><div><dt>时间</dt><dd>{selected.timeEstimate?.label || "不改时间"}</dd></div></dl><button type="button" onClick={() => props.onEdit(props.editingOperationId === selected.operationId ? null : selected.operationId)}>修改候选</button></section> : null}
    {props.possibleWorldRequested ? <p className="story-observation-possible-world"><GitBranch />可能世界请求只在当前 ViewState 标记，未创建第二 WorldState。</p> : null}
    {props.error ? <p className="story-observation-proposal-error" role="alert"><AlertTriangle />{props.error}</p> : null}
    <footer><button type="button" onClick={props.onReject}>拒绝</button><button type="button" onClick={props.onPossibleWorld}>建立可能世界请求</button><button type="button" onClick={props.onContinue}>继续推演</button><button type="button" disabled={props.busy} onClick={props.onSubmit}>{props.busy ? "送入中…" : "送入 Candidate Review"}</button></footer>
  </div>;
}

function ObservationReviewDock(props: {
  submission: StoryObservationReviewSubmission | null;
  existingResult: GoldenLoopResult | null;
  onContinue(): void;
}) {
  if (!props.submission && !props.existingResult) return <DockEmpty icon={<ShieldCheck />} title="候选尚未进入评审" description="Proposal Patch 只是画布预览；送入评审后仍需经过影响评审和作者确认。" />;
  const review = props.submission?.review;
  const result = props.submission?.result ?? props.existingResult;
  return <div className="story-observation-dock-stack"><section><small>Candidate Review</small><h2>{review ? "候选已送入评审" : "已有候选评审"}</h2><p>{review?.status === "awaiting" || result?.review?.status === "awaiting" ? "等待比较与影响评审。" : "请在既有评审链中查看状态。"}</p><dl><div><dt>候选数</dt><dd>{result?.nuwa.candidates.length ?? 0}</dd></div><div><dt>Provider 调用</dt><dd>{result?.provider.calls.length ?? 0}</dd></div><div><dt>Canon 写入</dt><dd>0</dd></div></dl><small>评审编号：{review?.id || result?.review?.id || "未创建"}</small><button type="button" onClick={props.onContinue} disabled={!props.submission}><ShieldCheck />继续影响评审</button></section></div>;
}

function proposalOperationLabel(kind: StoryObservationProposalPatch["operations"][number]["kind"]): string {
  return ({ "add-event": "新增后续事件", "add-relation": "补充前因", "flag-conflict": "发现逻辑冲突", "change-time": "调整时间候选" })[kind];
}

function DockEmpty(props: { icon: ReactNode; title: string; description: string }) {
  return <section className="story-observation-dock-empty">{props.icon}<strong>{props.title}</strong><p>{props.description}</p></section>;
}

function ObservationListState(props: {
  state: VerifiedCanonEventListRead | { status: "loading" };
  eventCount: number;
  onRetry(): void;
}) {
  if (props.state.status === "loading") return <section className="story-observation-canvas-state"><RefreshCw className="is-spinning" /><strong>正在核对已确认事件</strong></section>;
  if (props.state.status === "error") return <section className="story-observation-canvas-state is-error" role="alert"><AlertTriangle /><strong>无法建立安全投影</strong><p>{props.state.error.message}</p><button type="button" onClick={props.onRetry}><RefreshCw />重新读取</button></section>;
  if (props.eventCount === 0) return <section className="story-observation-canvas-state"><CircleDot /><strong>尚无已确认事件</strong><p>候选不会被当作事实放入画布。</p></section>;
  return null;
}

function timelineDragLabel(node: StoryObservationLayoutNode, deltaPixels: number): string {
  const minutes = Math.round(deltaPixels * 2);
  if (node.time.start === null) return `待作者指定（画布偏移 ${minutes >= 0 ? "+" : ""}${minutes} 分钟）`;
  const shifted = node.time.start + minutes;
  const normalized = ((Math.round(shifted) % 1_440) + 1_440) % 1_440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function canvasRect(element: Element): CanvasSafeRect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function pointerPercent(event: ReactPointerEvent<HTMLElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
}

function timeLabelFromPercent(percent: number): string {
  const startMinutes = 18 * 60;
  const totalMinutes = 8 * 60;
  const value = (startMinutes + Math.round(Math.max(0, Math.min(1, percent)) * totalMinutes / 15) * 15) % 1_440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeWindowStyle(window: { startLabel: string; endLabel: string }): { left: string; width: string } {
  const start = timeLabelToPercent(window.startLabel);
  const end = timeLabelToPercent(window.endLabel);
  return { left: `${Math.min(start, end) * 100}%`, width: `${Math.max(0.02, Math.abs(end - start)) * 100}%` };
}

function timeLabelToPercent(label: string): number {
  const match = label.match(/^(\d{2}):(\d{2})$/u);
  if (!match) return 0;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  const adjusted = minutes < 18 * 60 ? minutes + 1_440 : minutes;
  return Math.max(0, Math.min(1, (adjusted - 18 * 60) / (8 * 60)));
}

function timePrecisionLabel(precision: StoryObservationNode["time"]["precision"]): string {
  return precision === "exact" ? "精确" : precision === "approximate" ? "约略" : precision === "range" ? "范围" : "未定";
}

function isSemanticConfirmed(node: Pick<StoryObservationNode, "status" | "semanticStatus">): boolean {
  return node.status === "confirmed" && (node.semanticStatus ?? "confirmed") === "confirmed";
}

function clueSourceLabel(source: StoryObservationClueSource): string {
  return CLUE_SOURCE_PRESENTATION.find((item) => item.id === source)?.label ?? source;
}

function sameOrderedIds(current: readonly string[], next: readonly string[]): boolean {
  return current.length === next.length && current.every((id, index) => id === next[index]);
}
