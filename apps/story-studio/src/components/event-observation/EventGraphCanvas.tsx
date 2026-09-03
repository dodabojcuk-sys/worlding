import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow,
  type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance,
  useEdgesState, useNodesState
} from "@xyflow/react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronLeft, CircleDot, Clock3, Expand, Eye,
  FileText, Filter, Focus, GitBranch, GripHorizontal, Layers3, Link2, MapPin, Maximize2, Network,
  Minus, PanelLeftClose, PanelRightClose, Plus, RefreshCw, ShieldCheck, Sparkles, Tag, UsersRound, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { RelationReadProjectionR0, RelationTypeDefinitionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { PredictionRun } from "../../../../../src/storyContracts/multiNodePrediction.ts";
import { buildEventNarrativeLayout, buildNarrativeNavigation } from "../../../../../src/storyContracts/eventNarrativeLayout.ts";
import type { SmartRelationCandidate, StoryModelingRun } from "../../../../../src/storyContracts/storyModeling.ts";
import { dedupeSmartRelationCandidates, reviewSmartRelationCandidates } from "../../../../../src/storyContracts/storyModelingReview.ts";
import type { TemporalPlacement, TemporalProjectionRun, TemporalSegment } from "../../../../../src/storyContracts/temporalProjection.ts";
import { temporalTrackProjection } from "../../../../../src/storyContracts/temporalCoordinateTracks.ts";
import { buildFocusTrajectoryOverlay, type FocusTrajectoryRenderState } from "../../../../../src/storyContracts/eventObservation.ts";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";
import type { TianyiAgentExecutionProjection, TianyiGraphLayer } from "../../../../../src/storyContracts/tianyiAgentMode.ts";
import { eventLineEventMetadata, eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";
import { useWorkspaceDockSlot, workspaceDockCoordinator, type RightWorkSurfaceMode } from "../../product-shell/WorkspaceDockCoordinator";
import { CandidateEventNode } from "../graph-nodes/CandidateEventNode";
import { CollectionPointNode, type CollectionPointNodeData } from "../graph-nodes/CollectionPointNode";
import { FormalEventNode } from "../graph-nodes/FormalEventNode";
import { AgentExecutionGraph } from "../tianyi/execution/AgentExecutionGraph";
import type { NarrativeArrangementRead, NarrativePlacementRole, StoryCollectionPoint, StoryUnit } from "../../lib/localTransport";

type Selection =
  | { kind: "node"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "smart-relation"; id: string }
  | { kind: "collection-point"; id: string }
  | { kind: "remote"; direction: "past" | "future"; count: number }
  | null;
type NodeData = {
  title: string; time: string; location: string; status: string; focused: boolean; selected: boolean; predictionSelected?: boolean;
  remote?: boolean; candidate?: boolean; direction?: "past" | "future"; count?: number; runId?: string; pathCount?: number;
  pathLabel?: string; reviewSelected?: boolean; scopeLabel?: string; sourceSummary?: boolean; sourceCount?: number; onExpandSources?: () => void;
  candidateKind?: "new" | "existing-reference" | "conflict"; sharedAcrossPaths?: number;
  temporal?: boolean; temporalKind?: TemporalPlacement["placementKind"]; temporalSummary?: string; temporalAnchors?: string; temporalConfidence?: string; semanticZoom?: "far" | "medium" | "near";
  screen?: boolean; screenLabel?: string; screenKind?: TemporalSegment["kind"]; screenConfidence?: string;
  collectionPoint?: boolean; unitId?: string; eventCount?: number; expanded?: boolean; onToggle?: () => void;
  trackId?: string; trackLabel?: string;
  eventRole?: "ordinary" | "turning";
  portMode?: "narrative" | "relation"; branching?: boolean;
};
type PredictionSelectionDetail = { runId: string; pathId: string; selectedCandidateNodeIds: string[]; origin: "tianyi" | "canvas" };
type PredictionViewDetail = { runId: string; view: "task" | "running" | "overview" | "focus" | "review" | "receipt"; pathId: string | null };
type LayoutSnapshot = { sourceVersion: string; positions: Record<string, { x: number; y: number }> };
type Layout = { version: "tianyan-event-graph-layout/v3"; sourceVersion: string; positions: Record<string, { x: number; y: number }>; history: LayoutSnapshot[] };
const nodeTypes = { event: FormalEventNode, prediction: CandidateEventNode, collectionPoint: CollectionPointGraphNode, narrativeTrack: NarrativeTrackNode, predictionScope: PredictionScopeNode, predictionSourceSummary: PredictionSourceSummaryNode, temporalScreen: TemporalScreenNode };

function CollectionPointGraphNode(props: NodeProps<Node<NodeData>>) {
  return <CollectionPointNode {...props as unknown as NodeProps<Node<CollectionPointNodeData>>} />;
}

function NarrativeTrackNode(props: NodeProps<Node<NodeData>>) { return <span className="event-narrative-track-label"><GitBranch aria-hidden="true" />{props.data.trackLabel}</span>; }

export type EventGraphCanvasProps = {
  projectId: string;
  events: readonly EventLineEventSummary[];
  relations: readonly RelationReadProjectionR0[];
  relationTypes: readonly RelationTypeDefinitionR0[];
  storyUnits?: readonly StoryUnit[];
  selectedEventId: string | null;
  onSelectEvent(eventId: string): void;
  onClearSelection(): void;
  onCreateRelation?(input: { sourceEventId: string; targetEventId: string; relationTypeId?: string | null; sourceRef?: string }): Promise<void> | void;
  onConfirmRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onUpdateRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onApproveModifiedRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onRejectRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onOpenStorySpine?(): void;
  onOpenTimeline?(): void;
  onCreateEvent?(): void;
  onTrashDraftEvent?(eventId: string): Promise<void>;
  createOpen?: boolean;
  createInspector?: ReactNode;
  onCloseCreate?(): void;
  onOpenTianyi?(eventIds?: string[]): void;
  onExplainWithTianyi?(eventIds?: string[]): void;
  onOpenLogicCheck?(eventIds: string[]): void;
  onCreateCollectionPoint?(input: { title: string; eventIds: string[] }): Promise<void>;
  onUpdateCollectionPoint?(input: { unitId: string; point: StoryCollectionPoint; title?: string; eventIds?: string[]; collapsed?: boolean; layout?: { x: number; y: number; pinned?: boolean } }): Promise<void>;
  onDissolveCollectionPoint?(input: { unitId: string; point: StoryCollectionPoint }): Promise<void>;
  mode?: "graph" | "temporal";
  canvasKind?: "narrative" | "relation";
  temporalRun?: TemporalProjectionRun | null;
  temporalState?: "idle" | "loading" | "ready" | "stale" | "missing" | "failed" | "provider-unavailable";
  temporalMessage?: string | null;
  onReturnGraph?(): void;
  narrativeSurface?: {
    narratives: readonly NarrativeArrangementRead[];
    focusObjects: readonly PerspectiveObjectRef[];
    currentUnitLabel: string | null;
    detailsOpen: boolean;
    onArrange(selection: { eventId: string; placementId: string | null }): void;
    onOpenStaging(): void;
  };
};

export function EventGraphCanvas(props: EventGraphCanvasProps) {
  return props.narrativeSurface ? <NarrativeArrangementGraphCanvas {...props} surface={props.narrativeSurface} /> : <LegacyEventGraphCanvas {...props} />;
}

function LegacyEventGraphCanvas(props: EventGraphCanvasProps) {
  const mode = props.mode ?? "graph";
  const canvasKind = props.canvasKind ?? "relation";
  const [view, setView] = useState<"global" | "focus">("global");
  const [focusId, setFocusId] = useState<string | null>(props.selectedEventId);
  const [depth, setDepth] = useState(1);
  const [selection, setSelection] = useState<Selection>(props.selectedEventId ? { kind: "node", id: props.selectedEventId } : null);
  const [workspaceSelectionIds, setWorkspaceSelectionIds] = useState<string[]>(props.selectedEventId ? [props.selectedEventId] : []);
  const [spacePanning, setSpacePanning] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [predictionSelectionIds, setPredictionSelectionIds] = useState<string[]>([]);
  const [predictionRun, setPredictionRun] = useState<PredictionRun | null>(null);
  const [storyModelingRun, setStoryModelingRun] = useState<StoryModelingRun | null>(null);
  const [smartRelationReviews, setSmartRelationReviews] = useState<SmartRelationCandidate[]>([]);
  const [smartRelationSelection, setSmartRelationSelection] = useState<string[]>([]);
  const [predictionPathId, setPredictionPathId] = useState<string | null>(null);
  const [predictionSelectedNodeIds, setPredictionSelectedNodeIds] = useState<string[]>([]);
  const [predictionViewState, setPredictionViewState] = useState<PredictionViewDetail["view"]>("task");
  const [narrowPrediction, setNarrowPrediction] = useState(() => window.matchMedia("(max-width: 75rem)").matches);
  const [predictionSourcesExpanded, setPredictionSourcesExpanded] = useState(false);
  const [graphLayer, setGraphLayer] = useState<TianyiGraphLayer>("EVENT_GRAPH");
  const [executionProjection, setExecutionProjection] = useState<TianyiAgentExecutionProjection | null>(null);
  const [miniMapOpen, setMiniMapOpen] = useState(() => !window.matchMedia("(max-width: 75rem)").matches);
  const rightWorkSurface = useWorkspaceDockSlot();
  const inspectorOpen = rightWorkSurface.ownerId === "event-line" && rightWorkSurface.mode !== "NONE" && rightWorkSurface.mode !== "TIANYI";
  const [railOpen, setRailOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [collectionPointDraftOpen, setCollectionPointDraftOpen] = useState(false);
  const [collectionPointTitle, setCollectionPointTitle] = useState("");
  const [collectionPointRename, setCollectionPointRename] = useState<{ unitId: string; point: StoryCollectionPoint; title: string } | null>(null);
  const [activeNarrativeTrackId, setActiveNarrativeTrackId] = useState("main");
  const [otherBranchesCollapsed, setOtherBranchesCollapsed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const [semanticZoom, setSemanticZoom] = useState<"far" | "medium" | "near">("medium");
  const [temporalViewport, setTemporalViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const globalViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const railViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const restoreGlobalViewport = useRef(false);
  const restoreRailViewport = useRef(false);
  const temporalAutoFitKey = useRef<string | null>(null);
  const relationSelectionActive = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuTriggerRef = useRef<HTMLElement | null>(null);
  const contextMenuWasOpen = useRef(false);
  const layout = useMemo(() => readLayout(props.projectId, canvasKind), [canvasKind, props.projectId, layoutRevision]);
  const densityFixture = useMemo(() => isDensityFixture() ? syntheticDensityFixture() : null, []);
  const graphEvents = densityFixture?.events ?? props.events;
  const graphRelations = densityFixture?.relations ?? props.relations;
  const graphSourceVersion = graphEvents.map((event) => `${event.id}@${event.revisionToken}`).join("|");
  const expandPredictionSources = useCallback(() => setPredictionSourcesExpanded(true), []);
  const collapsePredictionSources = narrowPrediction && ["overview", "focus", "review"].includes(predictionViewState) && !predictionSourcesExpanded;
  const predictionDirectoryCollapsed = ["overview", "focus", "review"].includes(predictionViewState);
  const storyUnits = densityFixture?.storyUnits ?? props.storyUnits ?? [];
  const narrativeNavigation = useMemo(() => buildNarrativeNavigation({
    events: graphEvents.map((event, order) => { const semantic = eventLineSemanticNode(event); const branch = semantic.storyLine.kind !== "main"; return { id: event.id, sourceVersion: event.revisionToken, order, trackKind: branch ? "branch" as const : "main" as const, trackId: branch ? semantic.storyLine.id : null }; }),
    relations: graphRelations.map((relation) => ({ sourceEventId: relation.sourceObjectId, targetEventId: relation.targetObjectId, confirmed: relation.reviewState === "confirmed" && !relation.archived }))
  }), [graphEvents, graphRelations]);
  const graph = useMemo(() => deriveGraph(graphEvents, graphRelations, storyUnits, canvasKind, view, focusId, depth, layout.positions, selection, new Set(workspaceSelectionIds), new Set(predictionSelectionIds), predictionRun, predictionPathId, predictionViewState, new Set(predictionSelectedNodeIds), collapsePredictionSources, expandPredictionSources, mode, props.temporalRun ?? null, semanticZoom, (unitId, point) => void props.onUpdateCollectionPoint?.({ unitId, point, collapsed: !point.collapsed })), [canvasKind, collapsePredictionSources, depth, expandPredictionSources, focusId, graphEvents, graphRelations, layout.positions, mode, predictionPathId, predictionRun, predictionSelectedNodeIds, predictionSelectionIds, predictionViewState, props.onUpdateCollectionPoint, props.temporalRun, selection, semanticZoom, storyUnits, view, workspaceSelectionIds]);
  const displayedGraph = useMemo(() => {
    if (!otherBranchesCollapsed || mode !== "graph" || canvasKind !== "narrative" || ["overview", "focus", "review"].includes(predictionViewState)) return graph;
    const visibleNodeIds = new Set(graph.nodes.filter((node) => !node.data.trackId || node.data.trackId === "main" || node.data.trackId === activeNarrativeTrackId).map((node) => node.id));
    return { nodes: graph.nodes.filter((node) => visibleNodeIds.has(node.id)), edges: graph.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) };
  }, [activeNarrativeTrackId, canvasKind, graph, mode, otherBranchesCollapsed, predictionViewState]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(displayedGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(displayedGraph.edges);
  const temporalNodesRef = useRef<readonly Node<NodeData>[]>(graph.nodes);
  const openInspector = useCallback((mode: Extract<RightWorkSurfaceMode, "EVENT_DETAILS" | "EVENT_CREATE" | "RELATION_REVIEW">) => {
    workspaceDockCoordinator.openPageInspector("event-line", mode);
  }, []);
  const closeInspector = useCallback(() => workspaceDockCoordinator.closePageInspector("event-line"), []);

  useEffect(() => {
    const receive = (event: Event) => {
      const run = (event as CustomEvent<PredictionRun>).detail;
      if (run?.projectId === props.projectId) setPredictionRun(run);
    };
    const replay = (window as Window & { __storyStudioPredictionRun?: PredictionRun }).__storyStudioPredictionRun;
    if (replay?.projectId === props.projectId) setPredictionRun(replay);
    window.addEventListener("story-studio-multi-node-prediction-run", receive);
    return () => window.removeEventListener("story-studio-multi-node-prediction-run", receive);
  }, [props.projectId]);

  useEffect(() => {
    const apply = (run: StoryModelingRun | undefined) => {
      if (!run || run.projectId !== props.projectId || run.tool !== "smart-relations" || run.status !== "ready") return;
      setStoryModelingRun(run);
      const candidates = dedupeSmartRelationCandidates({ candidates: run.result?.relationCandidates ?? [], existing: graphRelations.map((relation) => ({ sourceEventId: relation.sourceObjectId, targetEventId: relation.targetObjectId, direction: relation.direction === "none" || relation.direction === "both" ? "undirected" as const : relation.direction === "reverse" ? "reverse" as const : "forward" as const })) });
      setSmartRelationReviews(candidates);
      setSmartRelationSelection([]);
    };
    const receive = (event: Event) => apply((event as CustomEvent<StoryModelingRun>).detail);
    apply((window as Window & { __storyStudioStoryModelingRun?: StoryModelingRun }).__storyStudioStoryModelingRun);
    window.addEventListener("story-studio-story-modeling-run", receive);
    return () => window.removeEventListener("story-studio-story-modeling-run", receive);
  }, [graphRelations, props.projectId]);

  useEffect(() => {
    const receiveProjection = (event: Event) => {
      const projection = (event as CustomEvent<TianyiAgentExecutionProjection>).detail;
      if (projection?.projectId === props.projectId) setExecutionProjection(projection);
    };
    const openExecution = () => setGraphLayer("AGENT_EXECUTION_GRAPH");
    const replay = (window as Window & { __storyStudioAgentExecutionProjection?: TianyiAgentExecutionProjection }).__storyStudioAgentExecutionProjection;
    if (replay?.projectId === props.projectId) setExecutionProjection(replay);
    window.addEventListener("story-studio-agent-execution-projection", receiveProjection);
    window.addEventListener("story-studio-open-agent-execution", openExecution);
    return () => {
      window.removeEventListener("story-studio-agent-execution-projection", receiveProjection);
      window.removeEventListener("story-studio-open-agent-execution", openExecution);
    };
  }, [props.projectId]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<PredictionSelectionDetail>).detail;
      if (!predictionRun || detail?.runId !== predictionRun.runId) return;
      setPredictionPathId(detail.pathId);
      setPredictionSelectedNodeIds(detail.selectedCandidateNodeIds);
      setGraphLayer("EVENT_GRAPH");
    };
    const replay = (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection;
    if (predictionRun && replay?.runId === predictionRun.runId) {
      setPredictionPathId(replay.pathId);
      setPredictionSelectedNodeIds(replay.selectedCandidateNodeIds);
      setGraphLayer("EVENT_GRAPH");
    }
    window.addEventListener("story-studio-prediction-review-selection", receive);
    return () => window.removeEventListener("story-studio-prediction-review-selection", receive);
  }, [predictionRun]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<PredictionViewDetail>).detail;
      if (!predictionRun || detail?.runId !== predictionRun.runId) return;
      setPredictionViewState(detail.view);
      setPredictionPathId(detail.pathId);
      if (["overview", "focus", "review"].includes(detail.view)) setGraphLayer("EVENT_GRAPH");
    };
    const returnToFormalGraph = () => { setPredictionViewState("task"); setGraphLayer("EVENT_GRAPH"); };
    const replay = (window as Window & { __storyStudioPredictionView?: PredictionViewDetail }).__storyStudioPredictionView;
    if (predictionRun && replay?.runId === predictionRun.runId) { setPredictionViewState(replay.view); setPredictionPathId(replay.pathId); }
    window.addEventListener("story-studio-prediction-view-state", receive);
    window.addEventListener("story-studio-prediction-return-event-graph", returnToFormalGraph);
    return () => { window.removeEventListener("story-studio-prediction-view-state", receive); window.removeEventListener("story-studio-prediction-return-event-graph", returnToFormalGraph); };
  }, [predictionRun]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 75rem)");
    const update = () => setNarrowPrediction(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (narrowPrediction && predictionPathId) setPredictionSourcesExpanded(false);
  }, [narrowPrediction, predictionPathId]);
  useEffect(() => {
    if (mode !== "temporal") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      props.onReturnGraph?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, props.onReturnGraph]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code === "Space" && !target?.closest("input, textarea, select, button, [contenteditable=true]")) { event.preventDefault(); setSpacePanning(true); }
      if (event.key === "Escape" && contextMenu) { event.preventDefault(); setContextMenu(null); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePanning(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [contextMenu]);
  useEffect(() => {
    if (contextMenu) {
      contextMenuWasOpen.current = true;
      const frame = window.requestAnimationFrame(() => contextMenuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    if (contextMenuWasOpen.current) {
      contextMenuWasOpen.current = false;
      contextMenuTriggerRef.current?.focus();
    }
  }, [contextMenu]);

  useEffect(() => {
    temporalNodesRef.current = displayedGraph.nodes;
    setNodes(displayedGraph.nodes);
    setEdges(displayedGraph.edges);
  }, [displayedGraph.edges, displayedGraph.nodes, setEdges, setNodes]);
  useEffect(() => {
    const smartEdges: Edge[] = smartRelationReviews.filter((candidate) => candidate.reviewState === "candidate").map((candidate) => ({
      id: candidate.candidateId,
      source: candidate.sourceEventId,
      target: candidate.targetEventId,
      type: "smoothstep",
      className: "smart-relation-candidate-edge",
      label: `${candidate.suggestedTypeLabel} · ${Math.round(candidate.confidence * 100)}%`,
      markerEnd: candidate.direction === "undirected" ? undefined : { type: MarkerType.ArrowClosed },
      style: { stroke: "#c47b16", strokeWidth: 2, strokeDasharray: "7 5" },
      labelStyle: { fill: "#8c520b", fontSize: 12, fontWeight: 700 },
      labelBgStyle: { fill: "#fbfaf6", fillOpacity: .95 },
      data: { smartRelation: true }
    }));
    const visibleIds = new Set(displayedGraph.nodes.map((node) => node.id));
    setEdges([...displayedGraph.edges, ...smartEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))]);
  }, [displayedGraph.edges, displayedGraph.nodes, setEdges, smartRelationReviews]);
  useEffect(() => {
    if (props.selectedEventId) {
      if (relationSelectionActive.current) return;
      setSelection((current) => current?.kind === "relation" ? current : { kind: "node", id: props.selectedEventId! });
      setWorkspaceSelectionIds((current) => current.includes(props.selectedEventId!) ? current : [props.selectedEventId!]);
      openInspector("EVENT_DETAILS");
    }
  }, [openInspector, props.selectedEventId]);
  useEffect(() => {
    if (props.createOpen) openInspector("EVENT_CREATE");
  }, [openInspector, props.createOpen]);
  useEffect(() => {
    if (!flow || !displayedGraph.nodes.length) return;
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      // React Flow replaces its internal nodes and observes the grid resize
      // after this component renders. Delay until both measurements settle so
      // focus + inspector state never uses the previous, wider canvas bounds.
      timer = window.setTimeout(() => {
        if (restoreGlobalViewport.current && globalViewport.current) {
          restoreGlobalViewport.current = false;
          void flow.setViewport(globalViewport.current, { duration: 140 });
        } else if (restoreRailViewport.current && railViewport.current) {
          restoreRailViewport.current = false;
          void flow.setViewport(railViewport.current, { duration: 140 });
        } else {
          if (mode === "temporal") {
            const key = `${props.temporalRun?.runId ?? "base"}:${props.selectedEventId ?? "overview"}`;
            if (temporalAutoFitKey.current !== key) {
              temporalAutoFitKey.current = key;
              fitTemporalProjection(flow, displayedGraph.nodes, props.selectedEventId);
            }
          }
          else if (["overview", "focus", "review"].includes(predictionViewState)) fitPredictionProjection(flow, displayedGraph.nodes);
          else if (view === "focus") void fitFocusProjection(flow, displayedGraph.nodes, railOpen);
          else if (canvasKind === "narrative") fitNarrativeProjection(flow, displayedGraph.nodes, narrativeNavigation);
          else void flow.fitView({ padding: railOpen ? 0.24 : 0.08, duration: 0, maxZoom: 1.05 });
        }
      }, 180);
    });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [canvasKind, displayedGraph.nodes, flow, inspectorOpen, mode, narrativeNavigation, predictionViewState, props.selectedEventId, railOpen, view]);
  useEffect(() => { if (mode !== "temporal") temporalAutoFitKey.current = null; }, [mode]);
  useEffect(() => {
    if (mode !== "temporal" || !flow) return;
    const canvas = document.querySelector<HTMLElement>(".event-graph-workspace.is-temporal .event-graph-flow");
    if (!canvas || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fitTemporalProjection(flow, temporalNodesRef.current, props.selectedEventId), 140);
    });
    observer.observe(canvas);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [flow, mode, props.selectedEventId]);

  const persistMovedEvents = useCallback((movedNode: Node<NodeData>) => {
    const movedIds = new Set(movedNode.selected ? workspaceSelectionIds : [movedNode.id]);
    const positions = { ...layout.positions };
    for (const node of nodes) if (node.type === "event" && movedIds.has(node.id)) positions[node.id] = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
    positions[movedNode.id] = { x: Math.round(movedNode.position.x), y: Math.round(movedNode.position.y) };
    writeLayout(props.projectId, canvasKind, positions, graphSourceVersion);
    setLayoutRevision((value) => value + 1);
  }, [canvasKind, graphSourceVersion, layout.positions, nodes, props.projectId, workspaceSelectionIds]);
  const activateNarrativeTrack = (eventId: string) => setActiveNarrativeTrackId(narrativeNavigation.trackByEventId[eventId] ?? "main");
  const focus = (eventId: string) => {
    if (view === "global") globalViewport.current = flow?.getViewport() ?? null;
    activateNarrativeTrack(eventId); setFocusId(eventId); setDepth(1); setView("focus"); setSelection({ kind: "node", id: eventId }); setWorkspaceSelectionIds([eventId]); openInspector("EVENT_DETAILS"); props.onSelectEvent(eventId);
  };
  const selectNode = (eventId: string) => { relationSelectionActive.current = false; activateNarrativeTrack(eventId); setSelection({ kind: "node", id: eventId }); setWorkspaceSelectionIds([eventId]); openInspector("EVENT_DETAILS"); props.onSelectEvent(eventId); };
  const toggleWorkspaceNode = (eventId: string) => { relationSelectionActive.current = false; activateNarrativeTrack(eventId); setWorkspaceSelectionIds((current) => current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]); setSelection({ kind: "node", id: eventId }); };
  const returnGlobal = () => { restoreGlobalViewport.current = true; setView("global"); setSelection(focusId ? { kind: "node", id: focusId } : null); };
  const toggleRail = () => {
    if (railOpen) {
      restoreRailViewport.current = true;
      setRailOpen(false);
    } else {
      railViewport.current = flow?.getViewport() ?? null;
      setRailOpen(true);
    }
  };
  const connect = async (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    if (!props.onCreateRelation) { setNotice("关系候选入口不可用；没有成为正式关系。"); return; }
    try { await props.onCreateRelation({ sourceEventId: connection.source, targetEventId: connection.target }); setNotice("关系候选已进入待确认，尚未成为正式关系。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "关系候选未能创建；没有成为正式关系。"); }
  };
  const act = async (relation: RelationReadProjectionR0, kind: "confirm" | "update" | "approve-modified" | "reject") => {
    const handler = kind === "confirm" ? props.onConfirmRelation : kind === "update" ? props.onUpdateRelation : kind === "approve-modified" ? props.onApproveModifiedRelation : props.onRejectRelation;
    if (!handler) { setNotice("该作者操作当前不可用；没有成为正式关系。"); return; }
    setBusy(relation.relationId);
    try {
      await handler(relation);
      setNotice(kind === "confirm" || kind === "approve-modified" ? "作者确认后，关系已保存。" : kind === "reject" ? "候选已拒绝，未成为正式关系。" : "候选已更新，请再次确认。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "作者操作失败；没有成为正式关系。"); }
    finally { setBusy(null); }
  };
  const currentEvent = selection?.kind === "node" ? graphEvents.find((event) => event.id === selection.id) ?? null : null;
  const currentRelation = selection?.kind === "relation" ? graphRelations.find((relation) => relation.relationId === selection.id) ?? null : null;
  const currentSmartRelation = selection?.kind === "smart-relation" ? smartRelationReviews.find((relation) => relation.candidateId === selection.id) ?? null : null;
  const currentCollectionPoint = selection?.kind === "collection-point" ? storyUnits.flatMap((unit) => (unit.collectionPoints ?? []).map((point) => ({ unit, point }))).find(({ point }) => point.id === selection.id) ?? null : null;
  const predictionSources = predictionSelectionIds.map((id) => graphEvents.find((event) => event.id === id)).filter((event): event is EventLineEventSummary => Boolean(event));
  const addCurrentToPrediction = () => {
    if (!currentEvent) return;
    setPredictionSelectionIds((current) => current.includes(currentEvent.id) || current.length >= 4 ? current : [...current, currentEvent.id]);
  };
  const createCollectionPoint = async () => {
    if (!props.onCreateCollectionPoint || workspaceSelectionIds.length < 2 || !collectionPointTitle.trim()) return;
    setBusy("collection-point-create");
    try {
      await props.onCreateCollectionPoint({ title: collectionPointTitle.trim(), eventIds: workspaceSelectionIds });
      setCollectionPointDraftOpen(false); setCollectionPointTitle(""); setWorkspaceSelectionIds([]); setNotice("集点已保存；Event 身份与正式 Relation 端点未改变。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "集点未能保存。"); }
    finally { setBusy(null); }
  };
  const renameCollectionPoint = async (title: string) => {
    if (!collectionPointRename || !props.onUpdateCollectionPoint) return;
    setBusy("collection-point-rename");
    try {
      await props.onUpdateCollectionPoint({ unitId: collectionPointRename.unitId, point: collectionPointRename.point, title });
      setCollectionPointRename(null);
      setNotice("集点已重命名；Event 身份与正式 Relation 端点未改变。");
      window.requestAnimationFrame(() => contextMenuTriggerRef.current?.focus());
    } catch (error) { setNotice(error instanceof Error ? error.message : "集点未能重命名。"); }
    finally { setBusy(null); }
  };
  const moveCollectionPointRight = async () => {
    if (!currentCollectionPoint || !props.onUpdateCollectionPoint) return;
    setBusy("collection-point-move");
    try {
      await props.onUpdateCollectionPoint({ unitId: currentCollectionPoint.unit.id, point: currentCollectionPoint.point, layout: { x: Math.round(currentCollectionPoint.point.layout.x + 80), y: currentCollectionPoint.point.layout.y, pinned: true } });
      setNotice("集点位置已保存；Event 身份与正式 Relation 端点未改变。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "集点位置未能保存。"); }
    finally { setBusy(null); }
  };
  const togglePredictionCandidate = (candidateId: string) => {
    if (!predictionRun || !predictionPathId) return;
    const next = predictionSelectedNodeIds.includes(candidateId) ? predictionSelectedNodeIds.filter((id) => id !== candidateId) : [...predictionSelectedNodeIds, candidateId];
    setPredictionSelectedNodeIds(next);
    const detail: PredictionSelectionDetail = { runId: predictionRun.runId, pathId: predictionPathId, selectedCandidateNodeIds: next, origin: "canvas" };
    (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection = detail;
    window.dispatchEvent(new CustomEvent("story-studio-prediction-review-selection", { detail }));
  };
  const chooseCandidatePath = (candidateId: string) => {
    if (!predictionRun?.bundle) return;
    const path = predictionRun.bundle.paths.find((item) => item.candidateNodeIds.includes(candidateId));
    if (!path) return;
    const detail: PredictionSelectionDetail = { runId: predictionRun.runId, pathId: path.id, selectedCandidateNodeIds: path.candidateNodeIds, origin: "canvas" };
    setPredictionPathId(path.id); setPredictionSelectedNodeIds(path.candidateNodeIds); setPredictionViewState("focus");
    (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection = detail;
    window.dispatchEvent(new CustomEvent("story-studio-prediction-review-selection", { detail }));
  };
  const remote = selection?.kind === "remote" ? selection : null;
  const candidateCount = graphRelations.filter((relation) => relation.reviewState === "candidate").length;
  const reviewSmartRelations = (decision: "accepted" | "rejected") => setSmartRelationReviews((current) => reviewSmartRelationCandidates({ candidates: current, candidateIds: smartRelationSelection, decision }));
  const acceptSmartRelations = async () => {
    if (!props.onCreateRelation || !smartRelationSelection.length) return;
    const selected = smartRelationReviews.filter((item) => smartRelationSelection.includes(item.candidateId));
    if (selected.some((candidate) => !candidate.suggestedTypeId)) { setNotice("所选候选中存在“类型待确认”；本批次 0 条进入关系审查区。"); return; }
    setBusy("smart-relations");
    let succeeded = 0;
    try {
      for (const candidate of selected) {
        await props.onCreateRelation({ sourceEventId: candidate.sourceEventId, targetEventId: candidate.targetEventId, relationTypeId: candidate.suggestedTypeId, sourceRef: `story-modeling:${storyModelingRun?.runId ?? candidate.sourceRunId}:${candidate.candidateId}` });
        succeeded += 1;
      }
      reviewSmartRelations("accepted");
      setNotice(`批次结果：${succeeded} 条已进入待确认，0 条失败；正式 Relation 仍为 0 次自动写入。`);
    } catch (error) { setNotice(`批次结果：${succeeded} 条已进入待确认，${selected.length - succeeded} 条未写入。${error instanceof Error ? error.message : "请根据逐项回执重试。"}`); }
    finally { setBusy(null); }
  };

  if (graphLayer === "AGENT_EXECUTION_GRAPH") {
    return executionProjection ? <AgentExecutionGraph projection={executionProjection} onReturn={() => setGraphLayer("EVENT_GRAPH")} onOpenCandidates={() => setGraphLayer("EVENT_GRAPH")} onStop={() => window.dispatchEvent(new CustomEvent("story-studio-stop-agent-execution"))} onRetry={() => window.dispatchEvent(new CustomEvent("story-studio-retry-agent-execution"))} /> : <section className="agent-execution-workspace is-empty" aria-label="Agent 执行过程" data-graph-layer="AGENT_EXECUTION_GRAPH"><header><div><small>天意 Agent</small><strong>Agent 执行过程</strong><span>运行事件尚未到达</span></div><nav><button type="button" onClick={() => setGraphLayer("EVENT_GRAPH")}><ArrowLeft />返回事件图</button></nav></header><p>执行图只由实际 Run 事件构建，不显示静态装饰流程。</p></section>;
  }

  const temporalPlacement = currentEvent ? props.temporalRun?.placements.find((item) => item.versionedEventRef.eventId === currentEvent.id) ?? null : null;
  const contextNode = contextMenu?.nodeId ? nodes.find((node) => node.id === contextMenu.nodeId) ?? null : null;
  const contextEvent = contextNode ? graphEvents.find((event) => event.id === contextNode.id) ?? null : null;
  const selectedWorkspaceEvents = workspaceSelectionIds.filter((id) => graphEvents.some((event) => event.id === id));
  const navigationEventId = selection?.kind === "node" ? selection.id : props.selectedEventId ?? narrativeNavigation.branchPoints[0]?.eventId ?? null;
  const navigationOrder = navigationEventId ? narrativeNavigation.eventOrderById[navigationEventId] ?? -1 : -1;
  const previousBranchPoint = [...narrativeNavigation.branchPoints].reverse().find((point) => (narrativeNavigation.eventOrderById[point.eventId] ?? -1) < navigationOrder) ?? null;
  const currentOrNextBranchPoint = narrativeNavigation.branchPoints.find((point) => (narrativeNavigation.eventOrderById[point.eventId] ?? -1) >= navigationOrder) ?? narrativeNavigation.branchPoints[0] ?? null;
  const nextMergePoint = narrativeNavigation.mergePoints.find((point) => (narrativeNavigation.eventOrderById[point.eventId] ?? -1) > navigationOrder) ?? null;
  const focusNarrativeAnchor = (eventId: string | null) => {
    if (!eventId || !flow) return;
    const node = nodes.find((item) => item.id === eventId);
    if (!node) return;
    activateNarrativeTrack(eventId);
    setSelection({ kind: "node", id: eventId });
    setWorkspaceSelectionIds([eventId]);
    props.onSelectEvent(eventId);
    void flow.setCenter(node.position.x + 117, node.position.y + 76, { zoom: 1, duration: 220 });
  };
  const focusActiveTrack = () => {
    if (!flow) return;
    const trackNodes = nodes.filter((node) => node.type === "event" && node.data.trackId === activeNarrativeTrackId);
    if (!trackNodes.length) return;
    focusNarrativeRange(flow, trackNodes);
  };

  return <section className={`event-graph-workspace ${inspectorOpen ? "has-inspector" : ""} ${mode === "temporal" ? "is-temporal" : canvasKind === "narrative" ? "is-narrative" : "is-relational"}`} aria-label={mode === "temporal" ? "时间线工作区" : canvasKind === "narrative" ? "水平事件编排工作区" : "事件关系工作区"} data-event-graph-owner="projection" data-graph-layer="EVENT_GRAPH" data-event-foreground={mode === "temporal" ? "temporal-projection" : "formal"} data-temporal-background={mode === "temporal" ? "screens" : "none"} data-temporal-state={mode === "temporal" ? props.temporalState ?? "idle" : undefined} data-view-switch-provider-calls="0" data-view-switch-agent-runs="0" data-candidate-overlay={["overview", "focus", "review"].includes(predictionViewState) ? "visible" : "hidden"} data-prediction-view={predictionViewState} data-unit-directory={mode === "temporal" || predictionDirectoryCollapsed ? "temporarily-collapsed" : "restored"} data-graph-view={view} data-canvas-kind={canvasKind} data-event-graph-density={densityFixture ? "synthetic-50" : undefined}>
    <header className="event-graph-commandbar">
      <button type="button" className="event-graph-directory-toggle" aria-label={railOpen ? "收起事件目录" : "展开事件目录"} aria-pressed={railOpen} onClick={toggleRail}>{railOpen ? <PanelLeftClose /> : <Network />}</button>
      <strong className="event-graph-command-title">{mode === "temporal" ? "时间编排" : canvasKind === "narrative" ? "事件线编排" : "关系观察"}</strong>
      <div className="event-graph-command-actions">
        <button type="button" aria-label="新增事件" title="新增事件" onClick={() => props.onCreateEvent?.() ?? setNotice("当前无法打开新建事件。")}><Plus /><span>新增事件</span></button>
        {view === "focus" ? <button type="button" aria-label="返回全局" title="返回全局" onClick={returnGlobal}><ArrowLeft /><span>返回全局</span></button> : null}
        <button type="button" aria-label="聚焦当前" title="聚焦当前" disabled={!currentEvent} onClick={() => {
          if (!currentEvent) return;
          if (mode === "temporal") {
            selectNode(currentEvent.id);
            setSemanticZoom("medium");
            const currentNode = nodes.find((node) => node.id === currentEvent.id);
            if (currentNode) void flow?.setCenter(currentNode.position.x + 147, currentNode.position.y + 70, { zoom: 1, duration: 0 });
          } else focus(currentEvent.id);
        }}><Focus /><span>聚焦当前</span></button>
        {view === "focus" ? <button type="button" aria-label="展开一层" title="展开一层" onClick={() => setDepth((value) => Math.min(value + 1, 3))}><Layers3 /><span>展开一层</span></button> : null}
        {mode === "graph" ? <><button type="button" aria-label="自动布局" title="自动布局" onClick={() => { writeLayout(props.projectId, canvasKind, {}, graphSourceVersion); setLayoutRevision((value) => value + 1); setNotice(canvasKind === "narrative" ? "已以当前来源版本重新水平编排；上一版位置可恢复。" : "已重新整理关系投影；上一版位置可恢复。"); }}><RefreshCw /><span>自动布局</span></button>{layout.history.length ? <button type="button" aria-label="恢复上一版布局" onClick={() => { restorePreviousLayout(props.projectId, canvasKind); setLayoutRevision((value) => value + 1); setNotice("已恢复上一版布局。"); }}><ArrowLeft /><span>恢复上一版</span></button> : null}</> : null}
        <button type="button" aria-label="筛选" title="筛选" aria-expanded={filterOpen} onClick={() => setFilterOpen((value) => !value)}><Filter /><span>筛选</span></button>
        <button type="button" aria-label={mode === "temporal" ? "时间总览" : "适应视图"} onClick={() => {
          if (mode === "temporal" && flow) {
            setSemanticZoom("medium");
            fitTemporalProjection(flow, nodes, null);
          } else void flow?.fitView({ padding: 0.16, duration: 160, maxZoom: 1.05 });
        }}><Maximize2 /><span>{mode === "temporal" ? "时间总览" : "适应视图"}</span></button>
        <button type="button" aria-label={miniMapOpen ? "隐藏小地图" : "显示小地图"} aria-pressed={miniMapOpen} onClick={() => setMiniMapOpen((open) => !open)}><MapPin /><span>小地图</span></button>
        {mode === "graph" ? <><button type="button" aria-label="将当前事件加入推演范围" disabled={!currentEvent || predictionSelectionIds.length >= 4 || predictionSelectionIds.includes(currentEvent?.id ?? "")} onClick={addCurrentToPrediction}><Plus /><span>加入推演范围</span></button>
        <button type="button" aria-label="推演所选节点" disabled={!predictionSelectionIds.length} onClick={() => props.onOpenTianyi?.(predictionSelectionIds)}><Sparkles /><span>推演 {predictionSelectionIds.length}</span></button></> : null}
        <button type="button" aria-label={inspectorOpen ? "收起检查器" : "展开检查器"} aria-pressed={inspectorOpen} onClick={() => inspectorOpen ? closeInspector() : openInspector(selection?.kind === "relation" ? "RELATION_REVIEW" : props.createOpen ? "EVENT_CREATE" : "EVENT_DETAILS")}>{inspectorOpen ? <PanelRightClose /> : <ChevronLeft />}</button>
      </div>
    </header>
    {mode === "graph" && canvasKind === "narrative" && !["overview", "focus", "review"].includes(predictionViewState) ? <nav className="event-narrative-navigator" aria-label="分支与合流导航" data-active-track={activeNarrativeTrackId}>
      <span><GitBranch />当前轨道：{activeNarrativeTrackId === "main" ? "主线" : graphEvents.find((event) => (eventLineSemanticNode(event).storyLine.id === activeNarrativeTrackId)) ? eventLineSemanticNode(graphEvents.find((event) => eventLineSemanticNode(event).storyLine.id === activeNarrativeTrackId)!).storyLine.label : "分支"}</span>
      <button type="button" disabled={!previousBranchPoint} onClick={() => focusNarrativeAnchor(previousBranchPoint?.eventId ?? null)}><ArrowLeft />上一分叉</button>
      <button type="button" disabled={!currentOrNextBranchPoint} onClick={() => focusNarrativeAnchor(currentOrNextBranchPoint?.eventId ?? null)}><GitBranch />跳到分叉</button>
      <button type="button" disabled={!nextMergePoint} onClick={() => focusNarrativeAnchor(nextMergePoint?.eventId ?? null)}><ArrowRight />下一合流</button>
      <button type="button" onClick={focusActiveTrack}><Focus />聚焦当前轨道</button>
      <button type="button" aria-pressed={otherBranchesCollapsed} onClick={() => setOtherBranchesCollapsed((value) => !value)}><Layers3 />{otherBranchesCollapsed ? "展开其他分支" : "折叠其他分支"}</button>
    </nav> : null}
    {mode === "temporal" ? <div className={`temporal-canvas-status is-${props.temporalState ?? "idle"}`} role="status" aria-live="polite"><Sparkles aria-hidden="true" /><div><strong>{props.temporalState === "loading" ? "正在读取时间投影缓存" : props.temporalState === "missing" ? "基础布局" : props.temporalState === "failed" ? "时间投影暂不可读" : props.temporalRun?.conflicts.length ? "需要作者处理冲突" : props.temporalRun?.stale ? "旧投影 · 待更新" : props.temporalRun ? "时间投影已更新" : "基础布局"}</strong><span>{props.temporalMessage ?? (props.temporalRun ? "时间位置是只读投影，不会改写正式时间。" : "基于正式事件与关系展示；尚未执行 AI 分析。")}</span></div></div> : null}
    {predictionSources.length ? <section className="event-graph-prediction-scope" aria-label="推演范围" aria-live="polite"><strong>推演范围 {predictionSources.length}/4</strong>{predictionSources.map((event, index) => <span key={event.id} title={event.title} aria-label={`第 ${index + 1} 个推演依据：${event.title}`}><b>{index + 1}</b>{event.title}<button type="button" title={`移出推演范围：${event.title}`} aria-label={`移出推演范围：${event.title}`} onClick={() => setPredictionSelectionIds((current) => current.filter((id) => id !== event.id))}><X /></button></span>)}{narrowPrediction && predictionPathId ? <button type="button" className="event-graph-source-collapse" aria-expanded={predictionSourcesExpanded} onClick={() => setPredictionSourcesExpanded((expanded) => !expanded)}>{predictionSourcesExpanded ? `折叠为 ${predictionSources.length} 个推演依据` : `展开 ${predictionSources.length} 个推演依据`}</button> : null}<button type="button" onClick={() => setPredictionSelectionIds([])}>清空</button></section> : null}
    {selectedWorkspaceEvents.length > 1 ? <section className="event-graph-selection-bar" aria-label="画布多选操作" data-testid="event-graph-selection-bar"><strong>已选择 {selectedWorkspaceEvents.length} 个事件</strong>{collectionPointDraftOpen ? <form className="event-graph-collection-create" onSubmit={(event) => { event.preventDefault(); void createCollectionPoint(); }}><label><span className="sr-only">集点名称</span><input autoFocus value={collectionPointTitle} maxLength={100} placeholder="集点名称" onChange={(event) => setCollectionPointTitle(event.target.value)} /></label><button type="submit" disabled={!collectionPointTitle.trim() || busy === "collection-point-create"}>保存集点</button><button type="button" onClick={() => { setCollectionPointDraftOpen(false); setCollectionPointTitle(""); }}>取消</button></form> : <button type="button" disabled={!props.onCreateCollectionPoint} onClick={() => setCollectionPointDraftOpen(true)}><Layers3 />创建集点</button>}<button type="button" onClick={() => props.onOpenTianyi?.(selectedWorkspaceEvents)}><Sparkles />围绕所选预测</button><button type="button" onClick={() => props.onOpenLogicCheck?.(selectedWorkspaceEvents)}><ShieldCheck />剧情逻辑检测</button><button type="button" onClick={() => { setWorkspaceSelectionIds([]); setCollectionPointDraftOpen(false); }}><X />清除选择</button></section> : null}
    {filterOpen ? <div className="event-graph-filter-row" role="status"><Filter /><span>当前展示全部正式事件、待确认关系与远端投影；筛选只改变本机观察范围。</span><button type="button" onClick={() => setFilterOpen(false)}>完成</button></div> : null}
    {notice ? <p className="event-graph-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X /></button></p> : null}
    <div className="event-graph-main">
      {mode === "graph" ? <EventUnitDirectory events={graphEvents} storyUnits={storyUnits} selectedEventId={selection?.kind === "node" ? selection.id : null} predictionSelectionIds={predictionSelectionIds} onSelect={selectNode} onTogglePrediction={(eventId) => setPredictionSelectionIds((current) => current.includes(eventId) ? current.filter((id) => id !== eventId) : current.length < 4 ? [...current, eventId] : current)} /> : null}
      <aside className={"event-graph-local-rail " + (railOpen ? "is-open" : "")} aria-label="事件图局部目录" data-event-graph-drawer={railOpen ? "open" : "closed"}>
        <button type="button" className="is-active">{mode === "temporal" ? <Clock3 /> : canvasKind === "narrative" ? <GitBranch /> : <Network />}<span>{mode === "temporal" ? "时间投影" : canvasKind === "narrative" ? "事件线" : "关系图"}</span></button>
        <button type="button" onClick={() => props.onOpenStorySpine?.()}><Layers3 /><span>故事脊柱</span></button>
        <button type="button" onClick={() => props.onCreateEvent?.() ?? setNotice("当前无法打开新建事件。")}><Plus /><span>新增事件</span></button>
        <button type="button" onClick={() => { const relation = graphRelations.find((item) => item.reviewState === "candidate" && item.relationTypeResolution === "unresolved") ?? graphRelations.find((item) => item.reviewState === "candidate"); if (relation) { restoreRailViewport.current = false; railViewport.current = null; setSelection({ kind: "relation", id: relation.relationId }); openInspector("RELATION_REVIEW"); setRailOpen(false); } else setNotice("当前没有待确认关系。"); }}><CircleDot /><span>待确认 {candidateCount}</span></button>
      </aside>
      <div className={`event-graph-flow ${spacePanning ? "is-space-panning" : ""}`} tabIndex={0} onDoubleClickCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".react-flow__pane") && !target.closest(".react-flow__node")) props.onCreateEvent?.();
      }} onKeyDown={(event) => {
        if (!(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
        event.preventDefault();
        contextMenuTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : event.currentTarget;
        const activeId = workspaceSelectionIds.at(-1) ?? props.selectedEventId;
        const host = event.currentTarget.getBoundingClientRect();
        setContextMenu({ x: Math.round(host.width / 2), y: Math.round(host.height / 2), nodeId: activeId ?? null });
      }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect}
          onNodeClick={(event, node) => {
            if (node.data.collectionPoint) {
              setSelection({ kind: "collection-point", id: node.id }); setContextMenu(null);
            } else if (node.id.startsWith("projection.remote")) {
              setSelection({ kind: "remote", direction: node.data.direction ?? "future", count: node.data.count ?? 0 }); openInspector("EVENT_DETAILS");
            } else if (node.data.candidate) {
              if (predictionViewState === "overview") { chooseCandidatePath(node.id); setNotice("已聚焦候选所在路径；它仍未写入事件线。"); }
              else { togglePredictionCandidate(node.id); setNotice("已同步更新候选节点的审阅选择；它仍未写入事件线。"); }
            } else {
              if (event.shiftKey || event.ctrlKey || event.metaKey) toggleWorkspaceNode(node.id);
              else selectNode(node.id);
            }
          }}
          onNodeDragStop={(_, node) => {
            if (!node.data.collectionPoint) { if (node.type === "event") persistMovedEvents(node); return; }
            const match = storyUnits.flatMap((unit) => (unit.collectionPoints ?? []).map((point) => ({ unit, point }))).find(({ point }) => point.id === node.id);
            if (match) void props.onUpdateCollectionPoint?.({ unitId: match.unit.id, point: match.point, layout: { x: Math.round(node.position.x), y: Math.round(node.position.y), pinned: true } }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : "集点位置未能保存。"));
          }}
          onNodeDoubleClick={(_, node) => { if (!node.id.startsWith("projection.remote")) focus(node.id); }}
          onEdgeClick={(_, edge) => { relationSelectionActive.current = true; setSelection({ kind: edge.data?.smartRelation ? "smart-relation" : "relation", id: edge.id }); openInspector("RELATION_REVIEW"); }}
          onNodeContextMenu={(event, node) => { event.preventDefault(); contextMenuTriggerRef.current = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".react-flow__node") : null; if (node.data.collectionPoint) setSelection({ kind: "collection-point", id: node.id }); else if (!workspaceSelectionIds.includes(node.id) && !node.data.candidate) setWorkspaceSelectionIds([node.id]); const host = document.querySelector<HTMLElement>(".event-graph-flow")?.getBoundingClientRect(); setContextMenu({ x: Math.max(8, event.clientX - (host?.left ?? 0)), y: Math.max(8, event.clientY - (host?.top ?? 0)), nodeId: node.id }); }}
          onPaneContextMenu={(event) => { event.preventDefault(); contextMenuTriggerRef.current = event.target instanceof HTMLElement ? event.target : null; const host = document.querySelector<HTMLElement>(".event-graph-flow")?.getBoundingClientRect(); setContextMenu({ x: Math.max(8, event.clientX - (host?.left ?? 0)), y: Math.max(8, event.clientY - (host?.top ?? 0)), nodeId: null }); }}
          onPaneClick={() => {
            setContextMenu(null); setSelection(null); setWorkspaceSelectionIds([]); closeInspector(); props.onClearSelection();
          }}
          onInit={setFlow}
          fitView={mode !== "temporal"}
          minZoom={mode === "temporal" ? 0.58 : ["overview", "focus", "review"].includes(predictionViewState) ? 0.94 : canvasKind === "narrative" ? 0.86 : 0.25}
          maxZoom={1.8}
          onMove={(_, viewport) => {
            setSemanticZoom(viewport.zoom < (canvasKind === "narrative" ? .92 : .72) ? "far" : viewport.zoom > 1.12 ? "near" : "medium");
            if (mode === "temporal") setTemporalViewport(viewport);
          }}
          nodesDraggable={mode === "graph"}
          nodesConnectable={mode === "graph" && Boolean(props.onCreateRelation)}
          selectionOnDrag={!spacePanning}
          panOnDrag={spacePanning ? [0, 1, 2] : [1, 2]}
          multiSelectionKeyCode={["Shift", "Control", "Meta"]}
          onSelectionChange={({ nodes: selectedNodes }) => { const ids = selectedNodes.filter((node) => graphEvents.some((event) => event.id === node.id)).map((node) => node.id); if (ids.length) setWorkspaceSelectionIds((current) => [...new Set([...current, ...ids])]); }}
          connectionLineStyle={{ stroke: "var(--color-accent)", strokeWidth: 1.5 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color={mode === "temporal" ? "rgba(45, 74, 83, 0.08)" : "rgba(20, 125, 120, 0.13)"} />
          <Controls showInteractive={false} />
          {miniMapOpen ? <MiniMap pannable zoomable aria-label="事件轨道小地图" nodeColor={(node) => node.data?.candidate ? "#d9911d" : node.data?.remote ? "#77a6a1" : canvasKind === "narrative" && node.data?.trackId === activeNarrativeTrackId ? "#0d716d" : canvasKind === "narrative" && node.data?.trackId ? "#aeb9b6" : "#147d78"} nodeStrokeWidth={canvasKind === "narrative" ? 3 : 1} /> : null}
        </ReactFlow>
        {mode === "temporal" ? <TemporalCoordinateOverlay run={props.temporalRun ?? null} events={graphEvents} nodes={nodes} selectedEventId={currentEvent?.id ?? null} viewport={temporalViewport} zoomLevel={semanticZoom} /> : null}
        <GraphLegend temporal={mode === "temporal"} hasTemporalProjection={Boolean(props.temporalRun)} />
        {currentCollectionPoint ? <div className="event-graph-collection-tools" aria-label={`集点工具：${currentCollectionPoint.point.title}`}><button type="button" disabled={busy === "collection-point-move"} onClick={() => void moveCollectionPointRight()}>向右移动集点</button></div> : null}
        {contextMenu ? <div ref={contextMenuRef} className="event-graph-context-menu" role="menu" aria-label={currentCollectionPoint ? "可选集点菜单" : contextNode?.data.candidate ? "候选事件菜单" : contextEvent?.status === "draft" ? "草稿事件菜单" : "正式事件菜单"} style={{ left: contextMenu.x, top: contextMenu.y }} onKeyDown={(event) => { if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return; event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')]; const index = items.indexOf(document.activeElement as HTMLButtonElement); items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }}>
          {currentCollectionPoint ? <><button type="button" role="menuitem" onClick={() => { void props.onUpdateCollectionPoint?.({ unitId: currentCollectionPoint.unit.id, point: currentCollectionPoint.point, collapsed: !currentCollectionPoint.point.collapsed }); setContextMenu(null); }}>{currentCollectionPoint.point.collapsed ? "展开集点" : "折叠集点"}</button><button type="button" role="menuitem" onClick={() => { setCollectionPointRename({ unitId: currentCollectionPoint.unit.id, point: currentCollectionPoint.point, title: currentCollectionPoint.point.title }); setContextMenu(null); }}>重命名集点</button><button type="button" role="menuitem" disabled={selectedWorkspaceEvents.length < 2} onClick={() => { void props.onUpdateCollectionPoint?.({ unitId: currentCollectionPoint.unit.id, point: currentCollectionPoint.point, eventIds: selectedWorkspaceEvents }); setContextMenu(null); }}>用当前选择替换成员</button><button type="button" role="menuitem" onClick={() => { void props.onDissolveCollectionPoint?.({ unitId: currentCollectionPoint.unit.id, point: currentCollectionPoint.point }); setContextMenu(null); }}>解散集点（保留 Event）</button></> : contextEvent ? <><button type="button" role="menuitem" onClick={() => { selectNode(contextEvent.id); setContextMenu(null); }}>打开</button><button type="button" role="menuitem" onClick={() => { selectNode(contextEvent.id); openInspector("EVENT_DETAILS"); setContextMenu(null); }}>检查详情</button>{selectedWorkspaceEvents.length > 1 ? <button type="button" role="menuitem" disabled={!props.onCreateCollectionPoint} onClick={() => { setCollectionPointDraftOpen(true); setContextMenu(null); }}>创建集点</button> : null}<button type="button" role="menuitem" onClick={() => { props.onExplainWithTianyi?.(selectedWorkspaceEvents.length ? selectedWorkspaceEvents : [contextEvent.id]); setContextMenu(null); }}>交给 Agent 解释</button><button type="button" role="menuitem" onClick={() => { props.onOpenTianyi?.(selectedWorkspaceEvents.length ? selectedWorkspaceEvents : [contextEvent.id]); setContextMenu(null); }}>围绕所选节点推演</button><button type="button" role="menuitem" onClick={() => { props.onOpenLogicCheck?.(selectedWorkspaceEvents.length ? selectedWorkspaceEvents : [contextEvent.id]); setContextMenu(null); }}>剧情逻辑检测</button><button type="button" role="menuitem" onClick={() => { focus(contextEvent.id); setContextMenu(null); }}>在当前视图聚焦</button>{contextEvent.status === "draft" ? <button type="button" role="menuitem" disabled={!props.onTrashDraftEvent} onClick={() => { void props.onTrashDraftEvent?.(contextEvent.id).then(() => setNotice("草稿已进入回收站。"), (error: unknown) => setNotice(error instanceof Error ? error.message : "草稿未能进入回收站。")); setContextMenu(null); }}>移入回收站</button> : <button type="button" role="menuitem" disabled title="正式 Event 只提供归档、作废与影响预览，不允许硬删除">正式事件不可删除</button>}</> : contextNode?.data.candidate ? <><button type="button" role="menuitem" onClick={() => { chooseCandidatePath(contextNode.id); setContextMenu(null); }}>聚焦候选路径</button><button type="button" role="menuitem" disabled title="候选丢弃必须由当前 Prediction owner 处理">丢弃候选</button></> : <><button type="button" role="menuitem" onClick={() => { props.onCreateEvent?.(); setContextMenu(null); }}>在此创建事件草稿</button><button type="button" role="menuitem" onClick={() => { props.onOpenLogicCheck?.(selectedWorkspaceEvents); setContextMenu(null); }}>检查当前画布逻辑</button><button type="button" role="menuitem" disabled title="按住左键拖动即可框选；按住 Space 或中键拖动画布">框选与平移提示</button></>}
        </div> : null}
        {mode === "graph" && smartRelationReviews.length ? <SmartRelationReviewTray candidates={smartRelationReviews} selectedIds={smartRelationSelection} relationTypes={props.relationTypes} busy={busy === "smart-relations"} onSelection={setSmartRelationSelection} onChangeType={(candidateId, relationTypeId) => setSmartRelationReviews((current) => current.map((candidate) => candidate.candidateId === candidateId ? { ...candidate, suggestedTypeId: relationTypeId || null, suggestedTypeLabel: props.relationTypes.find((type) => type.relationTypeId === relationTypeId)?.label ?? "类型待确认" } : candidate))} onAccept={() => void acceptSmartRelations()} onReject={() => reviewSmartRelations("rejected")} /> : null}
      </div>
      {inspectorOpen && props.createOpen && props.createInspector ? <aside className="event-graph-inspector event-create-graph-inspector" aria-label="新建事件检查器"><InspectorHeader title="新建事件" subtitle="保存为草稿后会出现在故事脊柱与关系图中" onClose={() => props.onCloseCreate?.()} />{props.createInspector}</aside> : null}
      {inspectorOpen && !props.createOpen && !currentSmartRelation ? <GraphInspector
        event={currentEvent} relation={currentRelation} remote={remote} events={graphEvents} relations={graphRelations} relationTypes={props.relationTypes} busy={busy}
        temporalPlacement={mode === "temporal" ? temporalPlacement : null} temporalStale={Boolean(props.temporalRun?.stale)}
        onClose={closeInspector} onFocus={focus} onOpenTianyi={(eventId) => props.onOpenTianyi?.(eventId ? [eventId] : undefined)}
        onReturnGraph={() => props.onReturnGraph?.()}
        onConfirm={(relation) => void act(relation, "confirm")} onUpdate={(relation) => void act(relation, "update")} onApproveModified={(relation) => void act(relation, "approve-modified")}
        onReject={(relation) => void act(relation, "reject")} onDefer={() => setNotice("候选已保留在待确认中，尚未成为正式关系。")}
        onExpand={() => { setDepth((value) => Math.min(value + 1, 3)); setSelection(focusId ? { kind: "node", id: focusId } : null); }}
      /> : null}
      {inspectorOpen && currentSmartRelation ? <SmartRelationInspector candidate={currentSmartRelation} events={graphEvents} onClose={closeInspector} /> : null}
    </div>
    {collectionPointRename ? <CollectionPointRenameDialog title={collectionPointRename.title} busy={busy === "collection-point-rename"} onCancel={() => { setCollectionPointRename(null); window.requestAnimationFrame(() => contextMenuTriggerRef.current?.focus()); }} onConfirm={renameCollectionPoint} /> : null}
  </section>;
}

type FormalNarrativePlacementData = {
  kind: "placement";
  eventId: string;
  placementId: string;
  title: string;
  summary: string;
  time: string;
  unitLabel: string;
  role: NarrativePlacementRole;
  status: "confirmed" | "draft" | "conflict";
  displayIndex: number;
  selected: boolean;
  detail: "far" | "medium" | "near";
  branching: boolean;
  onOpen(): void;
  onArrange(): void;
};
type FormalNarrativeTopologyData = {
  kind: "topology";
  topology: "unit" | "branch" | "merge" | "collapsed" | "unresolved";
  label: string;
  detail: string;
  onToggle?: () => void;
};
type FormalNarrativeFocusData = {
  kind: "focus";
  state: FocusTrajectoryRenderState;
  label: string;
  objectType: PerspectiveObjectRef["type"];
  conflict: boolean;
};
type FormalNarrativeNodeData = FormalNarrativePlacementData | FormalNarrativeTopologyData | FormalNarrativeFocusData;
type FormalNarrativePlacement = {
  placementId: string;
  eventId: string;
  storyUnitId: string;
  narrativePathId: string;
  narrativeIndex: number;
  role: NarrativePlacementRole;
  event: EventLineEventSummary;
};

const formalNarrativeNodeTypes = {
  narrativePlacement: FormalNarrativePlacementNode,
  narrativeTopology: FormalNarrativeTopologyNode,
  narrativeFocus: FormalNarrativeFocusNode
};

function NarrativeArrangementGraphCanvas(props: EventGraphCanvasProps & { surface: NonNullable<EventGraphCanvasProps["narrativeSurface"]> }) {
  const [flow, setFlow] = useState<ReactFlowInstance<Node<FormalNarrativeNodeData>, Edge> | null>(null);
  const [detail, setDetail] = useState<"far" | "medium" | "near">("far");
  const [miniMapOpen, setMiniMapOpen] = useState(() => !window.matchMedia("(max-width: 75rem)").matches);
  const [collapsedUnitIds, setCollapsedUnitIds] = useState<Set<string>>(() => new Set());
  const eventById = useMemo(() => new Map(props.events.map((event) => [event.id, event])), [props.events]);
  const unitById = useMemo(() => new Map((props.storyUnits ?? []).map((unit) => [unit.id, unit])), [props.storyUnits]);
  const placements = useMemo<FormalNarrativePlacement[]>(() => props.surface.narratives.flatMap((read) => read.projection.placed.flatMap((placement) => {
    const event = eventById.get(placement.eventId);
    return event ? [{ ...placement, event, narrativePathId: read.projection.narrativePathId }] : [];
  })), [eventById, props.surface.narratives]);
  const branchUnits = useMemo(() => (props.storyUnits ?? []).filter((unit) => unit.kind === "branch" && unit.status !== "archived").sort((left, right) => left.order - right.order), [props.storyUnits]);
  const projection = useMemo(() => buildFormalNarrativeGraph({
    placements,
    units: props.storyUnits ?? [],
    focusObjects: props.surface.focusObjects,
    selectedEventId: props.selectedEventId,
    detail,
    collapsedUnitIds,
    onSelectEvent: props.onSelectEvent,
    onArrange: props.surface.onArrange,
    onToggleBranch: (unitId) => setCollapsedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId); else next.add(unitId);
      return next;
    })
  }), [collapsedUnitIds, detail, placements, props.selectedEventId, props.storyUnits, props.surface.focusObjects, props.surface.onArrange, props.onSelectEvent]);
  const focusEvent = useCallback((eventId: string | null, duration = 260) => {
    if (!flow || !eventId) return;
    const target = projection.nodes.find((node) => node.data.kind === "placement" && node.data.eventId === eventId);
    if (!target) return;
    void flow.setCenter(target.position.x + 118, target.position.y + 72, { zoom: Math.max(.88, flow.getZoom()), duration });
  }, [flow, projection.nodes]);
  useEffect(() => {
    if (!props.surface.detailsOpen || !props.selectedEventId) return;
    const timer = window.setTimeout(() => focusEvent(props.selectedEventId, 220), 90);
    return () => window.clearTimeout(timer);
  }, [focusEvent, props.selectedEventId, props.surface.detailsOpen]);
  useEffect(() => {
    const receive = (event: Event) => {
      const eventId = (event as CustomEvent<{ eventId?: string }>).detail?.eventId ?? props.selectedEventId;
      focusEvent(eventId ?? null);
    };
    window.addEventListener("story-studio-event-line-focus-current", receive);
    return () => window.removeEventListener("story-studio-event-line-focus-current", receive);
  }, [focusEvent, props.selectedEventId]);
  const toggleAllBranches = () => setCollapsedUnitIds((current) => current.size === branchUnits.length ? new Set() : new Set(branchUnits.map((unit) => unit.id)));

  return <section className="formal-narrative-workspace" data-testid="formal-narrative-event-graph" data-event-line-renderer="EventGraphCanvas" data-narrative-order-owner="NarrativeArrangementProjection" data-placement-count={placements.length} data-focus-track-count={props.surface.focusObjects.length}>
    <header className="formal-narrative-toolbar">
      <div><small>叙事坐标 · 左向右推进</small><strong>{props.surface.currentUnitLabel ?? "全书事件线"}</strong><span>{placements.length} 个正式 Placement · {branchUnits.length} 条支线</span></div>
      <nav aria-label="事件线画布控制">
        {branchUnits.length ? <button type="button" aria-pressed={collapsedUnitIds.size === branchUnits.length} onClick={toggleAllBranches}><GitBranch />{collapsedUnitIds.size === branchUnits.length ? "展开支线" : "折叠支线"}</button> : null}
        <button type="button" disabled={!props.selectedEventId} onClick={() => focusEvent(props.selectedEventId)}><Focus />定位所选</button>
        <button type="button" onClick={() => void flow?.fitView({ padding: .12, duration: 280, maxZoom: 1.05 })}><Maximize2 />全书位置</button>
        <button type="button" aria-pressed={miniMapOpen} onClick={() => setMiniMapOpen((open) => !open)}><MapPin />缩略导航</button>
      </nav>
    </header>
    <div className="formal-narrative-flow" tabIndex={0} aria-label="NarrativeArrangement 图形事件线，可缩放和平移">
      <ReactFlow<Node<FormalNarrativeNodeData>, Edge>
        nodes={projection.nodes}
        edges={projection.edges}
        nodeTypes={formalNarrativeNodeTypes}
        onInit={(instance) => {
          setFlow(instance);
          void instance.fitView({ padding: .12, maxZoom: .75, duration: 0 });
        }}
        onMove={(_, viewport) => setDetail(viewport.zoom < .68 ? "far" : viewport.zoom > 1.12 ? "near" : "medium")}
        onNodeClick={(_, node) => { if (node.data.kind === "placement") node.data.onOpen(); else if (node.data.kind === "topology") node.data.onToggle?.(); }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        minZoom={.24}
        maxZoom={1.55}
        defaultViewport={{ x: 28, y: 18, zoom: .86 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color="rgba(20, 96, 92, .11)" />
        <Controls showInteractive={false} position="bottom-left" />
        {miniMapOpen ? <MiniMap pannable zoomable aria-label="NarrativeArrangement 缩略导航" nodeColor={(node) => node.data?.kind === "placement" ? node.data.status === "conflict" ? "#b94a48" : node.data.status === "draft" ? "#9ca8a5" : "#147d78" : node.data?.kind === "focus" ? "#d9911d" : "#b8c6c2"} nodeStrokeWidth={2} /> : null}
      </ReactFlow>
      {!placements.length ? <div className="formal-narrative-empty" role="status"><GripHorizontal /><small>NarrativeArrangement 尚未建立</small><strong>尚未建立叙事编排</strong><p>{props.events.length} 个 Event 与 {(props.storyUnits ?? []).filter((unit) => unit.status !== "archived").length} 个 Story Unit 仍可核对；系统不会替作者猜顺序。</p><button type="button" className="primary-action" onClick={props.surface.onOpenStaging}>安排第一个事件</button></div> : null}
      {projection.unresolvedBranchCount ? <p className="formal-narrative-warning"><AlertTriangle />{projection.unresolvedBranchCount} 个分叉或合流端点缺少可定位的正式 Placement，未绘制虚假连线。</p> : null}
    </div>
    <footer className="formal-narrative-legend"><span><i className="main" />叙事推进（非因果）</span><span><i className="branch" />分叉</span><span><i className="merge" />合流</span><span><i className="gap" />unknown 保持断开</span><strong>节点位置只读自 NarrativeArrangement；拖动画布不会写入。</strong></footer>
  </section>;
}

function buildFormalNarrativeGraph(input: {
  placements: readonly FormalNarrativePlacement[];
  units: readonly StoryUnit[];
  focusObjects: readonly PerspectiveObjectRef[];
  selectedEventId: string | null;
  detail: FormalNarrativePlacementData["detail"];
  collapsedUnitIds: ReadonlySet<string>;
  onSelectEvent(eventId: string): void;
  onArrange(selection: { eventId: string; placementId: string | null }): void;
  onToggleBranch(unitId: string): void;
}): { nodes: Node<FormalNarrativeNodeData>[]; edges: Edge[]; unresolvedBranchCount: number } {
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const mainPlacements = input.placements.filter((placement) => unitById.get(placement.storyUnitId)?.kind !== "branch");
  const branchUnits = input.units.filter((unit) => unit.kind === "branch" && unit.status !== "archived").sort((left, right) => left.order - right.order);
  const branchPlacements = new Map(branchUnits.map((unit) => [unit.id, input.placements.filter((placement) => placement.storyUnitId === unit.id)]));
  const anchorIndex = new Map(branchUnits.map((unit) => [unit.id, mainPlacements.findIndex((placement) => placement.eventId === unit.branchPointEventId)]));
  const extraSlotsAt = new Map<number, number>();
  for (const unit of branchUnits) {
    const index = anchorIndex.get(unit.id) ?? -1;
    if (index < 0) continue;
    extraSlotsAt.set(index, Math.max(extraSlotsAt.get(index) ?? 0, (branchPlacements.get(unit.id)?.length ?? 0) + 1));
  }
  const xStep = 250;
  const startX = 170;
  const mainY = 165;
  const mainX = mainPlacements.map((_, index) => startX + (index + [...extraSlotsAt.entries()].filter(([anchor]) => anchor < index).reduce((sum, [, slots]) => sum + slots, 0)) * xStep);
  const placementPosition = new Map<string, { x: number; y: number }>();
  const nodes: Node<FormalNarrativeNodeData>[] = [];
  const edges: Edge[] = [];
  const makePlacementNode = (placement: FormalNarrativePlacement, position: { x: number; y: number }, displayIndex: number, branching: boolean): Node<FormalNarrativeNodeData> => {
    placementPosition.set(placement.placementId, position);
    const unit = unitById.get(placement.storyUnitId);
    const semantic = eventLineSemanticNode(placement.event);
    const status = /(?:冲突|conflict)/iu.test(placement.event.tags.join(" ")) ? "conflict" : placement.event.status === "draft" ? "draft" : "confirmed";
    return {
      id: placement.placementId,
      type: "narrativePlacement",
      position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: `formal-narrative-placement-node is-${status} is-${input.detail}`,
      data: {
        kind: "placement",
        eventId: placement.eventId,
        placementId: placement.placementId,
        title: placement.event.title,
        summary: placementSummary(placement.event),
        time: semantic.time.label,
        unitLabel: unit?.title ?? "Story Unit 待恢复",
        role: placement.role,
        status,
        displayIndex,
        selected: input.selectedEventId === placement.eventId,
        detail: input.detail,
        branching,
        onOpen: () => input.onSelectEvent(placement.eventId),
        onArrange: () => input.onArrange({ eventId: placement.eventId, placementId: placement.placementId })
      }
    };
  };
  for (const [index, placement] of mainPlacements.entries()) {
    const branching = branchUnits.some((unit) => unit.branchPointEventId === placement.eventId);
    nodes.push(makePlacementNode(placement, { x: mainX[index]!, y: mainY }, index + 1, branching));
    if (index > 0) edges.push({ id: `narrative-main:${mainPlacements[index - 1]!.placementId}:${placement.placementId}`, source: mainPlacements[index - 1]!.placementId, target: placement.placementId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-main", label: input.detail === "near" ? "叙事推进" : undefined });
  }
  for (const unit of input.units.filter((candidate) => candidate.kind === "main" && candidate.status !== "archived").sort((left, right) => left.order - right.order)) {
    const first = mainPlacements.findIndex((placement) => placement.storyUnitId === unit.id);
    if (first < 0) continue;
    nodes.push({ id: `unit:${unit.id}`, type: "narrativeTopology", position: { x: mainX[first]! - 10, y: 42 }, selectable: false, draggable: false, data: { kind: "topology", topology: "unit", label: unit.title, detail: `主线单元 · ${mainPlacements.filter((placement) => placement.storyUnitId === unit.id).length} 个 Placement` } });
  }
  let unresolvedBranchCount = 0;
  for (const [branchIndex, unit] of branchUnits.entries()) {
    const items = branchPlacements.get(unit.id) ?? [];
    const anchor = anchorIndex.get(unit.id) ?? -1;
    const branchY = mainY + 265 + branchIndex * 245;
    const anchorX = anchor >= 0 ? mainX[anchor]! : (mainX.at(-1) ?? startX) + xStep;
    if (anchor < 0) unresolvedBranchCount += 1;
    const collapsed = input.collapsedUnitIds.has(unit.id);
    const unitNodeId = `branch-unit:${unit.id}`;
    nodes.push({ id: unitNodeId, type: "narrativeTopology", position: { x: anchorX + 58, y: branchY - 84 }, data: { kind: "topology", topology: anchor < 0 ? "unresolved" : "branch", label: unit.title, detail: `${items.length} 个 Placement · ${collapsed ? "已折叠" : "已展开"}`, onToggle: () => input.onToggleBranch(unit.id) } });
    const mergeTargetIndex = unit.mergeTargetUnitId
      ? mainPlacements.findIndex((placement, index) => index > anchor && placement.storyUnitId === unit.mergeTargetUnitId)
      : -1;
    const mergeTarget = mergeTargetIndex >= 0 ? mainPlacements[mergeTargetIndex]! : null;
    const mergeNodeId = `merge:${unit.id}`;
    const mergeX = mergeTarget ? mainX[mergeTargetIndex]! - 110 : anchorX + Math.max(1.7, items.length + .65) * xStep;
    if (unit.mergeTargetUnitId && mergeTarget) {
      nodes.push({ id: mergeNodeId, type: "narrativeTopology", position: { x: mergeX, y: mainY + 34 }, data: { kind: "topology", topology: "merge", label: `合流至 ${unitById.get(unit.mergeTargetUnitId)?.title ?? "目标单元"}`, detail: "Story Unit 声明的合流" } });
    } else if (unit.mergeTargetUnitId) {
      unresolvedBranchCount += 1;
    }
    if (collapsed) {
      const capsuleId = `branch-capsule:${unit.id}`;
      nodes.push({ id: capsuleId, type: "narrativeTopology", position: { x: anchorX + xStep, y: branchY }, data: { kind: "topology", topology: "collapsed", label: unit.title, detail: `${items.length} 个 Placement · 点击局部展开`, onToggle: () => input.onToggleBranch(unit.id) } });
      if (anchor >= 0) edges.push({ id: `branch-enter:${unit.id}`, source: mainPlacements[anchor]!.placementId, target: capsuleId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-branch" });
      if (mergeTarget) {
        edges.push({ id: `branch-merge:${unit.id}`, source: capsuleId, target: mergeNodeId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-merge" });
        edges.push({ id: `merge-return:${unit.id}`, source: mergeNodeId, target: mergeTarget.placementId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-merge" });
      }
      continue;
    }
    for (const [index, placement] of items.entries()) {
      nodes.push(makePlacementNode(placement, { x: anchorX + (index + 1) * xStep, y: branchY }, index + 1, false));
      if (index > 0) edges.push({ id: `branch:${unit.id}:${items[index - 1]!.placementId}:${placement.placementId}`, source: items[index - 1]!.placementId, target: placement.placementId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-branch" });
    }
    if (anchor >= 0 && items.length) edges.push({ id: `branch-enter:${unit.id}`, source: mainPlacements[anchor]!.placementId, target: items[0]!.placementId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-branch", label: input.detail !== "far" ? "分叉" : undefined });
    if (items.length && mergeTarget) {
      edges.push({ id: `branch-merge:${unit.id}`, source: items.at(-1)!.placementId, target: mergeNodeId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-merge", label: input.detail !== "far" ? "合流" : undefined });
      edges.push({ id: `merge-return:${unit.id}`, source: mergeNodeId, target: mergeTarget.placementId, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed }, className: "formal-narrative-edge is-merge" });
    }
  }
  const visiblePathGroups = new Map<string, FormalNarrativePlacement[]>();
  for (const placement of input.placements) {
    if (input.collapsedUnitIds.has(placement.storyUnitId) || !placementPosition.has(placement.placementId)) continue;
    const list = visiblePathGroups.get(placement.storyUnitId) ?? [];
    list.push(placement);
    visiblePathGroups.set(placement.storyUnitId, list);
  }
  const focusY = mainY + Math.max(1, branchUnits.length) * 265 + 245;
  for (const [objectIndex, object] of input.focusObjects.slice(0, 3).entries()) {
    const laneY = focusY + objectIndex * 96;
    nodes.push({ id: `focus-label:${object.id}`, type: "narrativeTopology", position: { x: 18, y: laneY - 8 }, selectable: false, draggable: false, data: { kind: "topology", topology: "unit", label: object.label, detail: object.type === "character" ? "人物轨迹" : object.type === "location" ? "地点出现" : "物品流转" } });
    for (const pathPlacements of visiblePathGroups.values()) {
      const overlay = buildFocusTrajectoryOverlay({ anchors: pathPlacements.map((placement) => ({ anchorId: placement.placementId, event: placement.event })), objects: input.focusObjects, focusObjectIds: [object.id] });
      for (const point of overlay.points) {
        const position = placementPosition.get(point.anchorId);
        if (!position) continue;
        nodes.push({ id: point.pointId, type: "narrativeFocus", position: { x: position.x + 92, y: laneY }, draggable: false, selectable: false, data: { kind: "focus", state: point.state, label: `${point.objectLabel} · ${trajectoryStateLabel(point.state)}`, objectType: point.objectType, conflict: point.conflict } });
      }
      for (const segment of overlay.segments) edges.push({ id: segment.segmentId, source: segment.sourcePointId, target: segment.targetPointId, type: "straight", className: `formal-focus-edge ${segment.weak ? "is-weak" : ""}`, animated: false });
    }
  }
  return { nodes, edges, unresolvedBranchCount };
}

function FormalNarrativePlacementNode(props: NodeProps<Node<FormalNarrativeNodeData>>) {
  if (props.data.kind !== "placement") return null;
  const data = props.data;
  return <article className={`formal-narrative-card is-${data.status} is-${data.detail} ${data.selected ? "is-selected" : ""}`} data-placement-id={data.placementId} data-confirmed-event-id={data.eventId}>
    <Handle type="target" position={Position.Left} isConnectable={false} className="formal-narrative-port" />
    <Handle type="source" position={Position.Right} isConnectable={false} className="formal-narrative-port" />
    {data.branching ? <Handle type="source" position={Position.Bottom} isConnectable={false} className="formal-narrative-port is-branch" /> : null}
    <button type="button" className="formal-narrative-card-main" onClick={(event) => { event.stopPropagation(); data.onOpen(); }} aria-label={`打开 Event：${data.title}`}><span>{data.status === "conflict" ? "冲突" : data.status === "draft" ? "作者草稿" : "正式 Event"}</span><b>{String(data.displayIndex).padStart(2, "0")}</b><strong>{data.title}</strong>{data.detail !== "far" ? <small>{data.unitLabel} · {placementRoleLabel(data.role)}</small> : null}{data.detail === "near" ? <><p>{data.summary}</p><time>{data.time}</time></> : null}</button>
    {data.detail === "near" ? <button type="button" className="formal-narrative-arrange" onClick={(event) => { event.stopPropagation(); data.onArrange(); }}><GripHorizontal />编排位置</button> : null}
  </article>;
}

function FormalNarrativeTopologyNode(props: NodeProps<Node<FormalNarrativeNodeData>>) {
  if (props.data.kind !== "topology") return null;
  const data = props.data;
  const handles = data.topology === "merge" || data.topology === "collapsed" ? <><Handle type="target" position={Position.Left} isConnectable={false} className="formal-topology-port" /><Handle type="source" position={Position.Right} isConnectable={false} className="formal-topology-port" /></> : null;
  const content = <>{handles}<span>{data.topology === "branch" || data.topology === "collapsed" ? <GitBranch /> : data.topology === "merge" ? <ArrowRight /> : data.topology === "unresolved" ? <AlertTriangle /> : <Layers3 />}</span><div><strong>{data.label}</strong><small>{data.detail}</small></div></>;
  return data.onToggle ? <button type="button" className={`formal-topology-node is-${data.topology}`} onClick={(event) => { event.stopPropagation(); data.onToggle?.(); }}>{content}</button> : <div className={`formal-topology-node is-${data.topology}`}>{content}</div>;
}

function FormalNarrativeFocusNode(props: NodeProps<Node<FormalNarrativeNodeData>>) {
  if (props.data.kind !== "focus") return null;
  const data = props.data;
  return <span className={`formal-focus-point is-${data.state} ${data.conflict ? "has-conflict" : ""}`} aria-label={data.label}><Handle type="target" position={Position.Left} isConnectable={false} className="formal-focus-port" />{data.state === "direct" ? <Check /> : data.state === "witnessed" ? <Eye /> : data.state === "explicit-absence" ? <Minus /> : <GripHorizontal />}<Handle type="source" position={Position.Right} isConnectable={false} className="formal-focus-port" /></span>;
}

function placementSummary(event: EventLineEventSummary): string {
  return event.tags.find((tag) => /^(?:摘要|Summary)[：:]/iu.test(tag))?.replace(/^[^：:]+[：:]\s*/u, "") ?? "打开 Event 查看来源、事实与影响。";
}
function placementRoleLabel(role: NarrativePlacementRole): string {
  return ({ primary: "主要呈现", flashback: "倒叙", recap: "回看", reveal: "再次揭示", reinterpretation: "重新解释" } as const)[role];
}
function trajectoryStateLabel(state: FocusTrajectoryRenderState): string {
  return state === "direct" ? "参与" : state === "witnessed" ? "见证" : state === "explicit-absence" ? "明确缺席" : state === "weak" ? "听闻/推测" : "unknown";
}

function CollectionPointRenameDialog(props: { title: string; busy: boolean; onCancel(): void; onConfirm(title: string): Promise<void> }) {
  const [title, setTitle] = useState(props.title);
  return <div className="event-graph-dialog-backdrop" role="presentation"><form className="event-graph-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-point-rename-title" onSubmit={(event) => { event.preventDefault(); const next = title.trim(); if (next) void props.onConfirm(next); }} onKeyDown={(event) => { if (event.key === "Escape" && !props.busy) { event.preventDefault(); props.onCancel(); } }}>
    <header><div><small>可选集点</small><h2 id="collection-point-rename-title">重命名集点</h2></div><button type="button" aria-label="关闭重命名对话框" disabled={props.busy} onClick={props.onCancel}><X /></button></header>
    <label><span>集点名称</span><input autoFocus maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <p>重命名只修改集点标签，不复制 Event，不改变正式 Relation 端点。</p>
    <footer><button type="button" disabled={props.busy} onClick={props.onCancel}>取消</button><button type="submit" className="primary-action" disabled={props.busy || !title.trim()}>{props.busy ? "正在保存…" : "保存名称"}</button></footer>
  </form></div>;
}

function PredictionScopeNode(props: NodeProps<Node<NodeData>>) {
  return <section className="event-graph-prediction-source-group" aria-label={props.data.scopeLabel}>
    <strong>{props.data.scopeLabel}</strong><small>正式事件 · 共同组成推演依据</small>
  </section>;
}

function PredictionSourceSummaryNode(props: NodeProps<Node<NodeData>>) {
  return <button type="button" className="event-graph-prediction-source-summary" aria-label={`展开 ${props.data.sourceCount ?? 0} 个推演依据`} aria-expanded="false" onClick={(event) => { event.stopPropagation(); props.data.onExpandSources?.(); }}>
    <Handle type="source" position={Position.Right} isConnectable={false} /><Layers3 /><span><strong>{props.data.sourceCount ?? 0} 个推演依据</strong><small>正式事件摘要 · 点击展开</small></span><Expand />
  </button>;
}

function TemporalScreenNode(props: NodeProps<Node<NodeData>>) {
  return <section className={`temporal-screen is-${props.data.screenKind ?? "inferred_phase"}`} aria-hidden="true"><header><small>{props.data.screenKind === "authored_anchor" ? "可信时间锚点" : props.data.screenKind === "interval" ? "推断区间" : props.data.screenKind === "unresolved" ? "需要作者处理" : "语义阶段"}</small><strong>{props.data.screenLabel}</strong>{props.data.screenConfidence ? <span>{props.data.screenConfidence}</span> : null}</header></section>;
}

function TemporalCoordinateOverlay(props: {
  run: TemporalProjectionRun | null;
  events: readonly EventLineEventSummary[];
  nodes: readonly Node<NodeData>[];
  selectedEventId: string | null;
  viewport: { x: number; y: number; zoom: number };
  zoomLevel: "far" | "medium" | "near";
}) {
  const placements = props.run?.placements ?? [];
  const visibleSegments = (props.run?.segments ?? []).filter((segment) => placements.some((placement) => placement.segmentId === segment.id));
  const segmentTicks = visibleSegments.map((segment, index) => {
    const positions = placements.filter((placement) => placement.segmentId === segment.id && placement.placementKind !== "unplaced").map((placement) => placement.relativePosition);
    const relative = positions.length ? Math.min(...positions) : index * 260;
    return { id: segment.id, label: segment.label, kind: segment.kind, x: (70 + relative * 1.12) * props.viewport.zoom + props.viewport.x };
  });
  const tracks = temporalTrackProjection(props.zoomLevel);
  const selectedNode = props.selectedEventId ? props.nodes.find((node) => node.id === props.selectedEventId) : null;
  const selectedTitle = props.selectedEventId ? props.events.find((event) => event.id === props.selectedEventId)?.title : null;
  const selectedX = selectedNode ? (selectedNode.position.x + 102) * props.viewport.zoom + props.viewport.x : null;
  const selectedY = selectedNode ? (selectedNode.position.y + 70) * props.viewport.zoom + props.viewport.y : null;
  const unresolvedCount = placements.filter((placement) => placement.placementKind === "unplaced").length;
  const conflictCount = placements.filter((placement) => placement.placementKind === "conflict").length;
  return <div className="temporal-coordinate-overlay" aria-label="二维时间坐标" data-zoom-density={props.zoomLevel}>
    <div className="temporal-top-ruler" aria-label="时间标尺">
      <strong>时间</strong>
      {(segmentTicks.length ? segmentTicks : [{ id: "base", label: "故事阶段未定", kind: "unresolved" as const, x: 96 }]).map((tick) => <span key={tick.id} className={`is-${tick.kind}`} style={{ transform: `translateX(${Math.round(tick.x)}px)` }}><i />{tick.label}</span>)}
    </div>
    <div className="temporal-left-scale" aria-label="阶段内相对顺序">
      <strong>相对顺序</strong>
      {tracks.map((track) => <span key={track.id} data-track-id={track.id} data-detail={track.detail} style={{ transform: `translateY(${Math.round(track.coordinateY * props.viewport.zoom + props.viewport.y)}px)` }}><i />{track.label}</span>)}
    </div>
    {selectedX !== null && selectedY !== null ? <div className="temporal-crosshair" aria-label={`已定位事件：${selectedTitle ?? "当前事件"}`} style={{ "--crosshair-x": `${Math.round(selectedX)}px`, "--crosshair-y": `${Math.round(selectedY)}px` } as CSSProperties}><span>{selectedTitle}</span></div> : null}
    {unresolvedCount ? <aside className="temporal-unplaced-tray" aria-label="未定位事件"><strong>未定位</strong><span>{unresolvedCount} 个事件保留在托盘，未被塞到时间末尾。</span></aside> : null}
    {conflictCount ? <aside className="temporal-conflict-zone" aria-label="时间冲突区"><AlertTriangle /><strong>冲突区</strong><span>{conflictCount} 个事件等待作者修正</span></aside> : null}
  </div>;
}

function EventUnitDirectory(props: {
  events: readonly EventLineEventSummary[];
  storyUnits: readonly StoryUnit[];
  selectedEventId: string | null;
  predictionSelectionIds: readonly string[];
  onSelect(eventId: string): void;
  onTogglePrediction(eventId: string): void;
}) {
  const units = useMemo(() => {
    const grouped = new Map<string, { direct: EventLineEventSummary[]; setPoints: Map<string, EventLineEventSummary[]> }>();
    for (const event of props.events) {
      const metadata = eventLineEventMetadata(event);
      const formalUnit = props.storyUnits.find((unit) => unit.linkedEntityIds.includes(event.id));
      const label = formalUnit?.title ?? metadata.unitLabel ?? "未归入单元";
      const unit = grouped.get(label) ?? { direct: [], setPoints: new Map<string, EventLineEventSummary[]>() };
      const collectionTitle = formalUnit?.collectionPoints?.find((point) => point.eventIds.includes(event.id))?.title;
      if (collectionTitle) unit.setPoints.set(collectionTitle, [...(unit.setPoints.get(collectionTitle) ?? []), event]);
      else unit.direct.push(event);
      grouped.set(label, unit);
    }
    return [...grouped.entries()];
  }, [props.events, props.storyUnits]);
  const item = (event: EventLineEventSummary) => {
    const selected = props.predictionSelectionIds.includes(event.id);
    const semantic = eventLineSemanticNode(event);
    return <li key={event.id} className={props.selectedEventId === event.id ? "is-focused" : ""}>
      <button type="button" className="event-unit-focus" title={event.title} aria-label={`${event.title}，${semantic.time.label}`} onClick={() => props.onSelect(event.id)}><span title={event.title}>{event.title}</span><small>{semantic.time.label}</small></button>
      <button type="button" className="event-unit-prediction-toggle" title={`${selected ? "移出" : "加入"}推演范围：${event.title}`} aria-pressed={selected} aria-label={`${selected ? "移出" : "加入"}推演范围：${event.title}`} disabled={!selected && props.predictionSelectionIds.length >= 4} onClick={() => props.onTogglePrediction(event.id)}>{selected ? <Check /> : <Plus />}</button>
    </li>;
  };
  return <aside className="event-unit-directory" aria-label="单元目录"><header><Layers3 /><strong>单元</strong></header>{units.map(([label, unit], index) => <section key={label}><h2 title={label} aria-label={`单元 ${String(index + 1).padStart(2, "0")}：${label}`}>单元 {String(index + 1).padStart(2, "0")} · {label}</h2>{unit.direct.length ? <ul aria-label={`${label}的直接节点`}>{unit.direct.map(item)}</ul> : null}{[...unit.setPoints.entries()].map(([setPoint, events]) => <div className="event-unit-set-point" key={setPoint}><h3 title={setPoint} aria-label={`可选集点：${setPoint}`}>集点 · {setPoint}</h3><ul aria-label={`${setPoint}集点内节点`}>{events.map(item)}</ul></div>)}</section>)}</aside>;
}

function GraphLegend(props: { temporal?: boolean; hasTemporalProjection?: boolean }) {
  return <aside className="event-graph-legend" aria-label={props.temporal ? "语义时间图图例" : "关系图图例"}><span><i className="formal" />正式关系</span><span><i className="candidate" />待确认</span>{props.temporal ? <><span><i className="temporal-inferred" />{props.hasTemporalProjection ? "AI 推断位置" : "基础布局"}</span><span><i className="temporal-conflict" />时间冲突</span></> : <span><i className="remote" />远端投影</span>}</aside>;
}

function SmartRelationReviewTray(props: {
  candidates: readonly SmartRelationCandidate[];
  selectedIds: readonly string[];
  relationTypes: readonly RelationTypeDefinitionR0[];
  busy: boolean;
  onSelection(ids: string[]): void;
  onChangeType(candidateId: string, relationTypeId: string): void;
  onAccept(): void;
  onReject(): void;
}) {
  const pending = props.candidates.filter((candidate) => candidate.reviewState === "candidate");
  return <aside className="smart-relation-review-tray" aria-label="智能连线候选审查" data-formal-relation-writes="0">
    <header><div><Sparkles /><span><strong>智能连线候选</strong><small>{pending.length} 条待审查 · 尚未成为正式关系</small></span></div><button type="button" disabled={!pending.length} onClick={() => props.onSelection(props.selectedIds.length === pending.length ? [] : pending.map((candidate) => candidate.candidateId))}>{props.selectedIds.length === pending.length ? "取消全选" : "全选"}</button></header>
    <div className="smart-relation-review-list">{props.candidates.map((candidate) => <label key={candidate.candidateId} className={`is-${candidate.reviewState}`}>
      <input type="checkbox" checked={props.selectedIds.includes(candidate.candidateId)} disabled={candidate.reviewState !== "candidate" || props.busy} onChange={() => props.onSelection(props.selectedIds.includes(candidate.candidateId) ? props.selectedIds.filter((id) => id !== candidate.candidateId) : [...props.selectedIds, candidate.candidateId])} />
      <span><strong>{candidate.suggestedTypeLabel}</strong><small>{Math.round(candidate.confidence * 100)}% · {candidate.rationale}</small></span>
      <select aria-label={`修改候选关系类型：${candidate.candidateId}`} value={candidate.suggestedTypeId ?? ""} disabled={candidate.reviewState !== "candidate" || props.busy} onChange={(event) => props.onChangeType(candidate.candidateId, event.target.value)}><option value="">类型待确认</option>{props.relationTypes.filter((type) => type.lifecycle === "active").map((type) => <option key={type.relationTypeId} value={type.relationTypeId}>{type.label}</option>)}</select>
    </label>)}</div>
    <footer><button type="button" className="primary-action" disabled={!props.selectedIds.length || props.busy || props.candidates.some((candidate) => props.selectedIds.includes(candidate.candidateId) && !candidate.suggestedTypeId)} title={props.candidates.some((candidate) => props.selectedIds.includes(candidate.candidateId) && !candidate.suggestedTypeId) ? "请先确认每条候选的关系类型" : undefined} onClick={props.onAccept}><Check />接受为待确认</button><button type="button" disabled={!props.selectedIds.length || props.busy} onClick={props.onReject}><X />批量拒绝</button></footer>
  </aside>;
}

function SmartRelationInspector(props: { candidate: SmartRelationCandidate; events: readonly EventLineEventSummary[]; onClose(): void }) {
  const title = (eventId: string) => props.events.find((event) => event.id === eventId)?.title ?? eventId;
  return <aside className="event-graph-inspector" aria-label="智能连线候选检查器">
    <InspectorHeader title="关系候选" subtitle="AI 建议 · 尚未成为正式 Relation" onClose={props.onClose} />
    <div className="event-graph-inspector-body relation-inspector">
      <section className="event-graph-relation-status is-candidate">待确认 · {props.candidate.suggestedTypeLabel}</section>
      <Facts facts={[[<ArrowRight />, "来源事件", title(props.candidate.sourceEventId)], [<ArrowRight />, "目标事件", title(props.candidate.targetEventId)], [<Link2 />, "方向", props.candidate.direction === "undirected" ? "方向待确认" : "来源 → 目标"], [<Sparkles />, "置信度", `${Math.round(props.candidate.confidence * 100)}%`]]} />
      <TextBlock title="建议理由" text={props.candidate.rationale} />
      <TextBlock title="来源证据" text={props.candidate.evidenceRefs.join("、")} />
      <TextBlock title="写入边界" text="批量接受只会建立待确认 Relation candidate；未执行作者确认前，正式 Relation 不会增加。" />
    </div>
  </aside>;
}

function GraphInspector(props: {
  event: EventLineEventSummary | null; relation: RelationReadProjectionR0 | null; remote: Extract<Selection, { kind: "remote" }> | null;
  events: readonly EventLineEventSummary[]; relations: readonly RelationReadProjectionR0[]; relationTypes: readonly RelationTypeDefinitionR0[]; busy: string | null;
  onClose(): void; onFocus(id: string): void; onOpenTianyi?(id?: string): void; onConfirm(relation: RelationReadProjectionR0): void;
  onUpdate(relation: RelationReadProjectionR0): void; onApproveModified(relation: RelationReadProjectionR0): void; onReject(relation: RelationReadProjectionR0): void; onDefer(): void; onExpand(): void;
  temporalPlacement?: TemporalPlacement | null; temporalStale?: boolean; onReturnGraph?(): void;
}) {
  const [tab, setTab] = useState<"overview" | "story" | "relations" | "analysis" | "tianyi">("overview");
  useEffect(() => { setTab("overview"); }, [props.event?.id, props.relation?.relationId, props.remote?.direction]);
  if (props.relation) return <RelationInspector {...props} relation={props.relation} />;
  if (props.remote) return <aside className="event-graph-inspector" aria-label="远端关系簇检查器"><InspectorHeader title={props.remote.direction === "past" ? "远处前因" : "远处后果"} subtitle={String(props.remote.count) + " 条同一数据源中的远端投影"} onClose={props.onClose} /><section className="event-graph-inspector-empty"><Network /><strong>这是画布聚合，不是新的 Relation</strong><p>展开一层只会扩大当前本机投影范围，不会创建或修改任何事件与关系。</p><button type="button" className="primary-action" onClick={props.onExpand}><Layers3 />展开一层</button></section></aside>;
  if (!props.event) return <aside className="event-graph-inspector" aria-label="事件线概览"><InspectorHeader title="事件线" subtitle="选择事件或关系查看上下文" onClose={props.onClose} /><section className="event-graph-inspector-empty"><Network /><strong>关系图已准备好</strong><p>点击节点查看详情；拖线只会生成待确认候选，不会直接写入正式关系。</p><dl><div><dt>正式关系</dt><dd>{props.relations.filter((item) => item.reviewState === "confirmed").length}</dd></div><div><dt>待确认</dt><dd>{props.relations.filter((item) => item.reviewState === "candidate").length}</dd></div></dl></section></aside>;
  if (props.temporalPlacement) return <TemporalPositionInspector event={props.event} placement={props.temporalPlacement} events={props.events} stale={Boolean(props.temporalStale)} onClose={props.onClose} onFocus={props.onFocus} onOpenTianyi={props.onOpenTianyi} onReturnGraph={props.onReturnGraph} />;
  const semantic = eventLineSemanticNode(props.event);
  const metadata = eventLineEventMetadata(props.event);
  const relations = props.relations.filter((item) => item.sourceObjectId === props.event!.id || item.targetObjectId === props.event!.id);
  return <aside className="event-graph-inspector" aria-label={"事件检查器：" + props.event.title}>
    <InspectorHeader title={props.event.title} subtitle={semantic.storyUnit.label + " · " + semantic.setPoint.label} onClose={props.onClose} extra={<button type="button" onClick={() => props.onFocus(props.event!.id)}><Focus />聚焦关系</button>} />
    <nav className="event-graph-inspector-tabs" aria-label="事件检查器标签">
      <Tab active={tab === "overview"} onClick={() => setTab("overview")}>概览</Tab><Tab active={tab === "story"} onClick={() => setTab("story")}>节点剧情</Tab><Tab active={tab === "relations"} onClick={() => setTab("relations")}>关系 {relations.length}</Tab><Tab active={tab === "analysis"} onClick={() => setTab("analysis")}>叙事分析</Tab><Tab active={tab === "tianyi"} onClick={() => setTab("tianyi")}>天意</Tab>
    </nav>
    <div className="event-graph-inspector-body">
      {tab === "overview" ? <><Facts facts={[[<Clock3 />, "故事时间", semantic.time.label], [<Layers3 />, "叙事位置", semantic.storyUnit.label + " · " + semantic.setPoint.label], [<UsersRound />, "涉及人物", metadata.characterLabels.length ? metadata.characterLabels.join("、") : "未提供"], [<MapPin />, "地点", metadata.locationLabels.length ? metadata.locationLabels.join("、") : "未提供"], [<Tag />, "标签", props.event.tags.filter((tag) => !/^作者确认$/u.test(tag)).slice(0, 4).join(" · ") || "未提供"]]} /><TextBlock title="备注" text={semantic.openQuestions.length ? semantic.openQuestions.join("；") : "当前节点没有补充备注。"} /></> : null}
      {tab === "story" ? <TextBlock title="节点剧情" text="当前工作区只读展示已确认事件；完整正文和编辑仍沿用原有事件编辑流程。" /> : null}
      {tab === "relations" ? <section className="event-graph-relation-list">{relations.length ? relations.map((relation) => <article key={relation.relationId}><span className={relation.reviewState === "candidate" ? "is-candidate" : "is-confirmed"}>{relation.reviewState === "candidate" ? "待确认" : "正式关系"}</span><strong>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</strong><small>{relation.sourceObjectId === props.event!.id ? "由当前事件指向关联事件" : "由关联事件指向当前事件"}</small></article>) : <p>还没有与本事件相关的已记录关系。</p>}</section> : null}
      {tab === "analysis" ? <TextBlock title="叙事分析" text="相邻事件不自动构成因果。天意提出的关系会先显示为待确认，再由作者决定是否写入。" /> : null}
      {tab === "tianyi" ? <section className="event-graph-inspector-empty"><Sparkles /><strong>带着当前节点问天意</strong><p>天意只能读取当前允许的事件焦点，并且关系建议仍会进入待确认。</p><button type="button" className="primary-action" onClick={() => props.onOpenTianyi?.(props.event!.id)}>打开天意</button></section> : null}
    </div>
  </aside>;
}

function TemporalPositionInspector(props: { event: EventLineEventSummary; placement: TemporalPlacement; events: readonly EventLineEventSummary[]; stale: boolean; onClose(): void; onFocus(id: string): void; onOpenTianyi?(id?: string): void; onReturnGraph?(): void }) {
  const eventTitle = (id: string) => props.events.find((event) => event.id === id)?.title ?? "已记录锚点";
  const kind = props.placement.placementKind === "anchored" ? "明确锚点" : props.placement.placementKind === "inferred" ? "AI 推断" : props.placement.placementKind === "ambiguous" ? "模糊区间" : props.placement.placementKind === "conflict" ? "冲突" : "暂无法定位";
  const anchorIds = [...props.placement.anchorBeforeEventIds, ...props.placement.anchorAfterEventIds];
  return <aside className="event-graph-inspector temporal-position-inspector" aria-label={`时间位置检查器：${props.event.title}`}>
    <InspectorHeader title={props.event.title} subtitle="时间位置 · 只读投影" onClose={props.onClose} extra={<button type="button" onClick={() => props.onFocus(props.event.id)}><Focus />聚焦节点</button>} />
    <div className="event-graph-inspector-body">
      <section className={`temporal-inspector-state is-${props.placement.placementKind}`}><Clock3 /><div><small>正式时间</small><strong>{props.placement.authoredTimeLabel ? `已确认 · ${props.placement.authoredTimeLabel}` : "未确认"}</strong><span>当前显示位置：{kind}</span></div></section>
      <Facts facts={[[<ArrowLeft />, "前置锚点", props.placement.anchorBeforeEventIds.length ? props.placement.anchorBeforeEventIds.map(eventTitle).join("、") : "暂无"], [<ArrowRight />, "后置锚点", props.placement.anchorAfterEventIds.length ? props.placement.anchorAfterEventIds.map(eventTitle).join("、") : "暂无"], [<Sparkles />, "置信度", props.placement.confidence === null ? "待判定" : `${Math.round(props.placement.confidence * 100)}%`], [<FileText />, "投影状态", props.stale ? "已过期，等待新投影" : "当前"]]} />
      <TextBlock title="主要证据" text={props.placement.authorFacingSummary} />
      {props.placement.alternatives.length ? <section><small>可选位置</small>{props.placement.alternatives.map((alternative) => <p key={`${alternative.relativePosition}:${alternative.label}`}>{alternative.label}</p>)}</section> : null}
      {props.placement.placementKind === "conflict" ? <section className="temporal-inspector-conflict" role="alert"><AlertTriangle /><strong>当前不能强行排序</strong><p>请先在 Agent 中检查严格先后关系；本页没有写入任何正式时间。</p></section> : null}
      <div className="temporal-inspector-actions">
        {anchorIds[0] ? <button type="button" onClick={() => props.onFocus(anchorIds[0]!)}><Focus />聚焦相关锚点</button> : null}
        {props.placement.placementKind === "conflict" ? <button type="button" onClick={() => props.onOpenTianyi?.(props.event.id)}><AlertTriangle />查看冲突</button> : null}
        <button type="button" onClick={() => props.onOpenTianyi?.(props.event.id)}><Sparkles />在 Agent 中重新推断此节点</button>
        <button type="button" onClick={() => props.onReturnGraph?.()}><Network />返回关系图</button>
      </div>
    </div>
  </aside>;
}

function RelationInspector(props: Omit<Parameters<typeof GraphInspector>[0], "relation"> & { relation: RelationReadProjectionR0 }) {
  const source = props.events.find((event) => event.id === props.relation.sourceObjectId)?.title ?? "来源事件不可用";
  const target = props.events.find((event) => event.id === props.relation.targetObjectId)?.title ?? "目标事件不可用";
  const pending = props.relation.reviewState === "candidate";
  const unresolvedType = props.relation.relationTypeResolution === "unresolved" || props.relation.relationTypeId === "relation-type.unresolved";
  const isBusy = props.busy === props.relation.relationId;
  const [direction, setDirection] = useState(props.relation.direction);
  const [relationTypeId, setRelationTypeId] = useState(unresolvedType ? "" : props.relation.relationTypeId);
  useEffect(() => { setDirection(props.relation.direction); setRelationTypeId(unresolvedType ? "" : props.relation.relationTypeId); }, [props.relation.direction, props.relation.relationId, props.relation.relationTypeId, unresolvedType]);
  const editedRelation = { ...props.relation, direction, relationTypeId: relationTypeId || props.relation.relationTypeId };
  return <aside className="event-graph-inspector" aria-label={pending ? "待确认关系检查器" : "正式关系检查器"}>
    <InspectorHeader title={pending ? "关系候选" : "正式关系"} subtitle={pending ? "尚未成为正式关系" : "已由作者确认"} onClose={props.onClose} />
    <div className="event-graph-inspector-body relation-inspector">
      <section className={pending ? "event-graph-relation-status is-candidate" : "event-graph-relation-status is-confirmed"}>{unresolvedType ? "待确认 · 关系类型待确认" : pending ? "待确认 · 候选关系" : "已确认 · 正式关系"}</section>
      <Facts facts={[[<ArrowRight />, "来源事件", source], [<ArrowRight />, "目标事件", target], [<Link2 />, "关系类型", props.relation.currentTypeLabel ?? props.relation.relationLabelSnapshot], [<ArrowRight />, "方向", directionLabel(props.relation.direction)], [<FileText />, "说明", relationReason(props.relation)]]} />
      <TextBlock title="证据或来源" text={evidenceLabel(props.relation)} />
      {pending ? <><TextBlock title="影响范围" text={"确认后将在“" + source + "”与“" + target + "”之间建立一条正式关系；作者确认前，正式关系不会增加。"} />{unresolvedType ? <label className="event-graph-candidate-editor">选择已有关系类型<select aria-label="候选关系类型" value={relationTypeId} disabled={isBusy} onChange={(event) => setRelationTypeId(event.target.value)}><option value="">关系类型待确认</option>{props.relationTypes.filter((type) => type.lifecycle === "active").map((type) => <option key={type.relationTypeId} value={type.relationTypeId}>{type.label}</option>)}</select></label> : null}<label className="event-graph-candidate-editor">修改方向<select aria-label="候选关系方向" value={direction} disabled={isBusy} onChange={(event) => setDirection(event.target.value as RelationReadProjectionR0["direction"])}><option value="forward">来源 → 目标</option><option value="reverse">目标 → 来源</option><option value="both">双向</option><option value="none">未指定方向</option></select></label><footer className="event-graph-candidate-actions"><button type="button" className="primary-action" disabled={isBusy || unresolvedType} title={unresolvedType ? "请先选择已有关系类型" : undefined} onClick={() => props.onConfirm(props.relation)}><Check />通过并保存</button><button type="button" disabled={isBusy || (unresolvedType && !relationTypeId)} onClick={() => props.onApproveModified(editedRelation)}><Eye />{unresolvedType ? "选择类型后通过" : "修改后通过"}</button><button type="button" className="danger-action" disabled={isBusy} onClick={() => props.onReject(props.relation)}><X />拒绝</button><button type="button" disabled={isBusy} onClick={props.onDefer}>暂不处理</button></footer></> : null}
    </div>
  </aside>;
}

function InspectorHeader(props: { title: string; subtitle: string; onClose(): void; extra?: ReactNode }) {
  return <header className="event-graph-inspector-header"><div><h2>{props.title}</h2><p>{props.subtitle}</p></div><div>{props.extra}<button type="button" aria-label="关闭检查器" onClick={props.onClose}><X /></button></div></header>;
}
function Tab(props: { active: boolean; children: ReactNode; onClick(): void }) { return <button type="button" className={props.active ? "is-active" : ""} aria-pressed={props.active} onClick={props.onClick}>{props.children}</button>; }
function Facts(props: { facts: Array<[ReactNode, string, string]> }) { return <dl className="event-graph-facts">{props.facts.map(([icon, label, value]) => <div key={label}><dt>{icon}{label}</dt><dd>{value}</dd></div>)}</dl>; }
function TextBlock(props: { title: string; text: string }) { return <section className="event-graph-text-block"><h3>{props.title}</h3><p>{props.text}</p></section>; }

function deriveGraph(events: readonly EventLineEventSummary[], relations: readonly RelationReadProjectionR0[], storyUnits: readonly StoryUnit[], canvasKind: "narrative" | "relation", view: "global" | "focus", focusId: string | null, depth: number, positions: Layout["positions"], selection: Selection, workspaceSelectionIds: ReadonlySet<string>, predictionSelectionIds: ReadonlySet<string>, predictionRun: PredictionRun | null, predictionPathId: string | null, predictionViewState: PredictionViewDetail["view"], predictionSelectedNodeIds: ReadonlySet<string>, collapsePredictionSources: boolean, onExpandPredictionSources: () => void, mode: "graph" | "temporal", temporalRun: TemporalProjectionRun | null, semanticZoom: "far" | "medium" | "near", onToggleCollectionPoint: (unitId: string, point: StoryCollectionPoint) => void): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const ids = new Set(events.map((event) => event.id));
  const validFocus = focusId && ids.has(focusId) ? focusId : null;
  const active = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && !relation.archived && relation.reviewState !== "rejected");
  const activePath = predictionRun?.status === "ready" && predictionRun.bundle && predictionPathId ? predictionRun.bundle.paths.find((path) => path.id === predictionPathId) ?? null : null;
  const predictionVisible = predictionRun?.status === "ready" && predictionRun.bundle && ["overview", "focus", "review"].includes(predictionViewState);
  // Keep every formal Event available while the author is still assembling
  // the prediction scope. At narrow widths the Unit directory may be hidden,
  // so filtering the canvas after the first selection would make the second
  // source impossible to choose. Source focusing starts only with a real path.
  // Runs written before source snapshots became mandatory remain reviewable.
  // Their candidate graph is still useful, while the missing snapshot must not
  // crash the Event workspace or be fabricated from current Event versions.
  const predictionSources = predictionRun?.sourceSnapshot ?? [];
  const sourceIds = predictionVisible && predictionRun ? new Set(predictionSources.map((source) => source.eventId)) : null;
  const visible = mode === "temporal" ? ids : sourceIds ?? (view === "global" || !validFocus ? ids : focusIds(validFocus, active, depth));
  const remote = mode === "graph" && view === "focus" && validFocus ? remoteIds(validFocus, ids, visible, active) : { past: new Set<string>(), future: new Set<string>() };
  const focusLayout = mode === "graph" && view === "focus" && validFocus ? focusProjectionLayout(events.filter((event) => visible.has(event.id)), validFocus, active, remote) : null;
  const visibleEvents = events.filter((event) => visible.has(event.id));
  const collectionPoints = mode === "graph" && canvasKind === "narrative" && !predictionVisible && view === "global" ? storyUnits.flatMap((unit) => (unit.collectionPoints ?? []).map((point) => ({ unitId: unit.id, point }))).filter(({ point }) => point.eventIds.some((eventId) => visible.has(eventId))) : [];
  const collapsedMembership = new Map<string, string>();
  const collectionMemberPositions = new Map<string, { x: number; y: number }>();
  collectionPoints.forEach(({ point }, pointIndex) => {
    const base = collectionPointPosition(point, pointIndex);
    if (point.collapsed) point.eventIds.forEach((eventId) => collapsedMembership.set(eventId, point.id));
    else point.eventIds.forEach((eventId, index) => collectionMemberPositions.set(eventId, { x: base.x + 28 + (index % 2) * 226, y: base.y + 72 + Math.floor(index / 2) * 158 }));
  });
  const temporalByEvent = new Map(temporalRun?.placements.map((placement) => [placement.versionedEventRef.eventId, placement]) ?? []);
  const temporalPositions = temporalEventPositions(visibleEvents, temporalByEvent, semanticZoom);
  const narrativeLayout = mode === "graph" && canvasKind === "narrative" ? buildEventNarrativeLayout({
    events: visibleEvents.map((event, order) => {
      const semantic = eventLineSemanticNode(event);
      const branch = canvasKind === "narrative" && semantic.storyLine.kind !== "main";
      return { id: event.id, sourceVersion: event.revisionToken, order, trackKind: branch ? "branch" as const : "main" as const, trackId: branch ? semantic.storyLine.id : null, pinnedPosition: positions[event.id] ?? null };
    }),
    relations: active.map((relation) => ({ sourceEventId: relation.sourceObjectId, targetEventId: relation.targetObjectId, confirmed: relation.reviewState === "confirmed" }))
  }) : null;
  const eventNodes: Node<NodeData>[] = collapsePredictionSources ? [] : visibleEvents.filter((event) => !collapsedMembership.has(event.id)).map((event, index) => {
    const metadata = eventLineEventMetadata(event);
    const semantic = eventLineSemanticNode(event);
    const predictionPosition = sourceIds ? { x: 50, y: 95 + index * 142 } : null;
    const temporal = temporalByEvent.get(event.id) ?? null;
    const temporalPosition = temporal ? temporalPositions.get(event.id) ?? null : null;
    const focused = event.id === validFocus;
    const temporalAnchors = temporal ? [...temporal.anchorBeforeEventIds, ...temporal.anchorAfterEventIds].map((id) => events.find((item) => item.id === id)?.title ?? "已记录锚点").join("、") : "";
    const graphPosition = canvasKind === "narrative" ? narrativeLayout?.positions[event.id] : positions[event.id] ?? relationGraphPosition(index);
    const trackId = semantic.storyLine.kind === "main" ? "main" : semantic.storyLine.id;
    return { id: event.id, type: "event", className: `event-graph-node ${focused ? "is-focused" : ""} ${temporal ? `is-temporal-${temporal.placementKind}` : ""}`, position: mode === "temporal" ? temporalPosition ?? positions[event.id] ?? developmentGridFallback(index) : collectionMemberPositions.get(event.id) ?? predictionPosition ?? focusLayout?.positions[event.id] ?? graphPosition ?? developmentGridFallback(index), data: { title: event.title, time: semantic.time.label, location: metadata.locationLabels[0] ?? "地点未提供", status: semantic.status === "confirmed" ? "已确认" : "待审", focused, selected: workspaceSelectionIds.has(event.id), predictionSelected: predictionSelectionIds.has(event.id), temporal: mode === "temporal" && Boolean(temporal), temporalKind: temporal?.placementKind, temporalSummary: temporal?.authorFacingSummary, temporalAnchors, temporalConfidence: temporal?.confidence === null || temporal?.confidence === undefined ? "置信度待判定" : `置信度 ${Math.round(temporal.confidence * 100)}%`, semanticZoom, trackId, eventRole: event.tags.some((tag) => /(?:关键转折|转折|turning point)/iu.test(tag)) ? "turning" : "ordinary", portMode: canvasKind, branching: active.filter((relation) => relation.sourceObjectId === event.id && relation.reviewState === "confirmed").length > 1 } } satisfies Node<NodeData>;
  });
  const collectionNodes: Node<NodeData>[] = collectionPoints.map(({ unitId, point }, pointIndex) => {
    const rows = Math.ceil(point.eventIds.length / 2);
    const firstMember = events.find((event) => point.eventIds.includes(event.id));
    const storyLine = firstMember ? eventLineSemanticNode(firstMember).storyLine : null;
    const trackId = storyLine?.kind === "main" || !storyLine ? "main" : storyLine.id;
    return { id: point.id, type: "collectionPoint", className: `event-graph-collection-point ${point.collapsed ? "is-collapsed" : "is-expanded"}`, position: collectionPointPosition(point, pointIndex), style: point.collapsed ? { width: 224, height: 76 } : { width: 482, height: 86 + rows * 158 }, zIndex: point.collapsed ? 1 : -2, data: { title: point.title, time: "", location: "", status: "可选集点", focused: false, selected: selection?.kind === "collection-point" && selection.id === point.id, collectionPoint: true, unitId, eventCount: point.eventIds.length, expanded: !point.collapsed, trackId, onToggle: () => onToggleCollectionPoint(unitId, point) } };
  });
  const trackLabelById = new Map(visibleEvents.map((event) => { const storyLine = eventLineSemanticNode(event).storyLine; return [storyLine.kind === "main" ? "main" : storyLine.id, storyLine.label] as const; }));
  const trackNodes: Node<NodeData>[] = mode === "graph" && canvasKind === "narrative" && !predictionVisible && view === "global" ? (narrativeLayout?.tracks ?? []).map((track) => ({ id: `narrative-track.${track.id}`, type: "narrativeTrack", draggable: false, selectable: false, connectable: false, focusable: false, position: { x: 24, y: track.y - 52 }, zIndex: -4, data: { title: "", time: "", location: "", status: "", focused: false, selected: false, trackId: track.id, trackLabel: track.kind === "main" ? "主线" : trackLabelById.get(track.id) ?? "分支轨道" } })) : [];
  const screenNodes: Node<NodeData>[] = mode === "temporal" && temporalRun?.status === "ready" ? temporalScreenNodes(temporalRun, visibleEvents.length) : [];
  const nodes: Node<NodeData>[] = [...screenNodes, ...trackNodes, ...collectionNodes, ...eventNodes];
  if (remote.past.size) nodes.push(remoteNode("past", remote.past.size, selection, focusLayout?.remote.past));
  if (remote.future.size) nodes.push(remoteNode("future", remote.future.size, selection, focusLayout?.remote.future));
  const nodeIds = new Set(eventNodes.map((node) => node.id));
  const projectedEdgeKeys = new Set<string>();
  const edges: Edge[] = active.flatMap((relation): Edge[] => {
    const source = collapsedMembership.get(relation.sourceObjectId) ?? relation.sourceObjectId;
    const target = collapsedMembership.get(relation.targetObjectId) ?? relation.targetObjectId;
    if (source === target || (!nodeIds.has(relation.sourceObjectId) && !collapsedMembership.has(relation.sourceObjectId)) || (!nodeIds.has(relation.targetObjectId) && !collapsedMembership.has(relation.targetObjectId))) return [];
    const key = `${source}\u0000${target}\u0000${relation.relationTypeId}`;
    if (projectedEdgeKeys.has(key)) return [];
    projectedEdgeKeys.add(key);
    return [{ ...relationEdge(relation, selection, mode === "temporal" && temporalByEvent.get(relation.sourceObjectId)?.segmentId !== temporalByEvent.get(relation.targetObjectId)?.segmentId), id: source === relation.sourceObjectId && target === relation.targetObjectId ? relation.relationId : `collection-projection.${relation.relationId}`, source, target, label: source === relation.sourceObjectId && target === relation.targetObjectId ? relation.currentTypeLabel ?? relation.relationLabelSnapshot : "集点折叠投影 · 端点未改" }];
  });
  if (validFocus && remote.past.size) edges.push(remoteEdge("past", validFocus));
  if (validFocus && remote.future.size) edges.push(remoteEdge("future", validFocus));
  if (sourceIds && collapsePredictionSources) {
    nodes.push({ id: `prediction-source-summary.${predictionRun?.runId ?? "selection"}`, type: "predictionSourceSummary", draggable: false, connectable: false, selectable: false, position: { x: 42, y: 164 }, data: { title: "", time: "", location: "", status: "", focused: false, selected: false, sourceSummary: true, sourceCount: visibleEvents.length, onExpandSources: onExpandPredictionSources } });
  } else if (sourceIds) {
    nodes.push({ id: `prediction-scope.${predictionRun?.runId ?? "selection"}`, type: "predictionScope", draggable: false, connectable: false, selectable: false, position: { x: 24, y: 38 }, style: { width: 246, height: Math.max(410, visibleEvents.length * 142 + 50) }, data: { title: "", time: "", location: "", status: "", focused: false, selected: false, scopeLabel: `推演依据 · ${visibleEvents.length} 个节点` } });
  }
  if (predictionVisible && predictionRun?.bundle) {
    const overview = predictionViewState === "overview";
    const paths = overview ? predictionRun.bundle.paths : activePath ? [activePath] : [];
    const candidateIds = new Set(paths.flatMap((path) => path.candidateNodeIds));
    const candidateEdgeIds = new Set(paths.flatMap((path) => path.candidateEdgeIds));
    const pathMembership = new Map<string, typeof paths>();
    paths.forEach((path) => path.candidateNodeIds.forEach((nodeId) => pathMembership.set(nodeId, [...(pathMembership.get(nodeId) ?? []), path])));
    const pathNodes = [...candidateIds].map((id) => predictionRun.bundle!.nodes.find((node) => node.id === id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
    pathNodes.forEach((node, index) => {
      const reviewSelected = predictionSelectedNodeIds.has(node.id);
      const memberships = pathMembership.get(node.id) ?? [];
      const laneIndexes = memberships.map((path) => paths.indexOf(path)).filter((lane) => lane >= 0);
      const firstPath = memberships[0];
      const indexInPath = firstPath?.candidateNodeIds.indexOf(node.id) ?? index;
      const lane = laneIndexes.length ? laneIndexes.reduce((sum, value) => sum + value, 0) / laneIndexes.length : 0;
      const candidateKind = node.timeConsistency.kind === "conflict" || node.identityResolution.kind === "unresolved" ? "conflict" : node.identityResolution.kind === "reference-existing" ? "existing-reference" : "new";
      const displayedSelected = overview || reviewSelected;
      const laneLabel = memberships.length > 1
        ? `共享于 ${memberships.map((path) => `路径 ${paths.indexOf(path) + 1}`).join("、")}`
        : firstPath ? `路径 ${paths.indexOf(firstPath) + 1} · ${firstPath.title}` : "候选路径";
      nodes.push({ id: node.id, type: "prediction", className: `event-graph-prediction-node is-${candidateKind} ${displayedSelected ? "is-review-selected" : "is-review-excluded"}`, draggable: false, connectable: false, selectable: true, position: overview ? { x: (collapsePredictionSources ? 244 : 292) + indexInPath * 232, y: 56 + lane * 190 } : collapsePredictionSources ? { x: 244 + index * 232, y: 155 } : { x: 292 + index * 232, y: 155 }, data: { title: node.title, time: node.timeConsistency.kind === "unknown" ? "时间未定" : node.timeConsistency.label, location: "候选预览", status: node.identityResolution.kind === "unresolved" ? "候选 · 身份待决 · 尚未写入" : node.timeConsistency.kind === "conflict" ? "候选 · 时间冲突 · 尚未写入" : "候选 · 尚未写入事件线", focused: false, selected: false, candidate: true, candidateKind, sharedAcrossPaths: memberships.length, runId: predictionRun.runId, pathLabel: laneLabel, reviewSelected: displayedSelected } });
    });
    predictionRun.bundle.edges.filter((edge) => candidateEdgeIds.has(edge.id)).forEach((edge) => edges.push({ id: edge.id, source: edge.sourceCandidateId, target: edge.targetCandidateId, type: "smoothstep", label: !edge.relationTypeHint || edge.relationTypeHint.resolution === "unresolved" ? `${edge.label} · 关系类型待确认` : edge.label, markerEnd: edge.direction === "none" ? undefined : { type: MarkerType.ArrowClosed }, style: { stroke: "#d9911d", strokeWidth: 1.9, strokeDasharray: "7 5", opacity: .84 }, labelStyle: { fill: "#a75c00", fontSize: 12 }, labelBgStyle: { fill: "#fbfaf6", fillOpacity: .92 } }));
    const roots = [...new Set(paths.map((path) => path.candidateNodeIds[0]).filter((id): id is string => Boolean(id)))];
    if (collapsePredictionSources) {
      const summaryId = `prediction-source-summary.${predictionRun.runId}`;
      roots.forEach((root, index) => edges.push({ id: `prediction-source-summary-edge.${predictionRun.runId}.${root}`, source: summaryId, target: root, type: "smoothstep", label: index === 0 ? "推演预览" : undefined, style: { stroke: "#147d78", strokeWidth: 1.35, strokeDasharray: "3 5", opacity: .72 }, markerEnd: { type: MarkerType.ArrowClosed } }));
    } else {
      predictionSources.forEach((source, sourceIndex) => roots.forEach((root, rootIndex) => { if (ids.has(source.eventId)) edges.push({ id: `prediction-source.${source.eventId}.${root}`, source: source.eventId, target: root, type: "smoothstep", label: sourceIndex === 0 && rootIndex === 0 ? "共同推演依据" : undefined, style: { stroke: "#147d78", strokeWidth: 1.35, strokeDasharray: "3 5", opacity: .58 }, markerEnd: { type: MarkerType.ArrowClosed } }); }));
    }
  }
  return { nodes, edges };
}

function temporalScreenNodes(run: TemporalProjectionRun, eventCount: number): Node<NodeData>[] {
  const ranges: Record<TemporalSegment["kind"], { x: number; width: number }> = {
    authored_anchor: { x: 34, width: 360 },
    inferred_phase: { x: 330, width: 650 },
    interval: { x: 780, width: 400 },
    unresolved: { x: 1060, width: 330 }
  };
  return run.segments.filter((segment) => run.placements.some((placement) => placement.segmentId === segment.id)).map((segment, index) => {
    const base = ranges[segment.kind];
    const unresolvedOffset = segment.kind === "unresolved" ? run.segments.filter((item) => item.kind === "unresolved").findIndex((item) => item.id === segment.id) * 235 : 0;
    return { id: `temporal-screen.${segment.id}`, type: "temporalScreen", className: "temporal-screen-node", position: { x: base.x + unresolvedOffset, y: 28 }, style: { width: segment.kind === "unresolved" ? 220 : base.width, height: Math.max(620, 230 + Math.ceil(eventCount / 4) * 168) }, draggable: false, connectable: false, selectable: false, focusable: false, zIndex: -10 - index, data: { title: "", time: "", location: "", status: "", focused: false, selected: false, screen: true, screenLabel: segment.label, screenKind: segment.kind, screenConfidence: segment.confidence === null ? undefined : `置信度 ${Math.round(segment.confidence * 100)}%` } };
  });
}

function temporalEventPositions(events: readonly EventLineEventSummary[], placements: ReadonlyMap<string, TemporalPlacement>, semanticZoom: "far" | "medium" | "near"): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const laneRightEdges: number[] = [];
  const cardWidth = 246;
  const horizontalGap = 32;
  const laneHeight = semanticZoom === "near" ? 292 : semanticZoom === "far" ? 132 : 190;
  const ordered = events.flatMap((event) => {
    const placement = placements.get(event.id);
    return placement ? [{ eventId: event.id, placement }] : [];
  }).sort((left, right) => left.placement.relativePosition - right.placement.relativePosition || left.eventId.localeCompare(right.eventId));
  const located = ordered.filter(({ placement }) => placement.placementKind !== "unplaced" && placement.placementKind !== "conflict");
  const detached = ordered.filter(({ placement }) => placement.placementKind === "unplaced" || placement.placementKind === "conflict");
  for (const { eventId, placement } of located) {
    const x = 70 + placement.relativePosition * 1.12;
    let lane = laneRightEdges.findIndex((rightEdge) => rightEdge + horizontalGap <= x);
    if (lane < 0) lane = laneRightEdges.length;
    laneRightEdges[lane] = x + cardWidth;
    positions.set(eventId, { x, y: 150 + lane * laneHeight });
  }
  const locatedMaxX = located.length ? Math.max(...located.map(({ placement }) => 70 + placement.relativePosition * 1.12)) : 70;
  detached.forEach(({ eventId, placement }, index) => {
    const conflict = placement.placementKind === "conflict";
    positions.set(eventId, {
      x: locatedMaxX + 330 + (index % 2) * (cardWidth + horizontalGap),
      y: conflict ? 165 + Math.floor(index / 2) * laneHeight : 520 + Math.floor(index / 2) * laneHeight
    });
  });
  return positions;
}

function relationEdge(relation: RelationReadProjectionR0, selection: Selection, crossTemporalScreen = false): Edge {
  const pending = relation.reviewState === "candidate";
  const selected = selection?.kind === "relation" && selection.id === relation.relationId;
  return { id: relation.relationId, source: relation.sourceObjectId, target: relation.targetObjectId, type: "smoothstep", className: crossTemporalScreen ? "temporal-cross-screen-edge" : undefined, label: pending ? "待确认 · " + (relation.currentTypeLabel ?? relation.relationLabelSnapshot) : relation.currentTypeLabel ?? relation.relationLabelSnapshot, markerEnd: relation.direction === "none" ? undefined : { type: MarkerType.ArrowClosed }, style: pending ? { stroke: "#d9911d", strokeWidth: selected ? 2.5 : 1.7, strokeDasharray: "7 5" } : { stroke: selected ? "#147d78" : "#1c3448", strokeWidth: selected ? 2.5 : 1.7 }, labelStyle: { fill: pending ? "#a75c00" : "#314250", fontSize: 11, fontWeight: selected ? 700 : 600 }, labelBgStyle: { fill: "#fbfaf6", fillOpacity: 0.96 }, labelBgPadding: [4, 3] };
}
function remoteNode(direction: "past" | "future", count: number, selection: Selection, position?: { x: number; y: number }): Node<NodeData> {
  const id = "projection.remote." + direction;
  return { id, type: "event", className: "event-graph-node is-remote", position: position ?? (direction === "past" ? { x: 40, y: 450 } : { x: 960, y: 450 }), data: { title: direction === "past" ? "远处前因" : "远处后果", time: direction === "past" ? "更早之前" : "后续范围", location: "", status: "远端投影", focused: false, selected: selection?.kind === "remote" && selection.direction === direction, remote: true, direction, count } };
}
function remoteEdge(direction: "past" | "future", focusId: string): Edge { return { id: "projection.remote-edge." + direction, source: direction === "past" ? "projection.remote." + direction : focusId, target: direction === "past" ? focusId : "projection.remote." + direction, type: "smoothstep", label: "远端投影", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#147d78", strokeWidth: 1.35, strokeDasharray: "3 5" }, labelStyle: { fill: "#147d78", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "#fbfaf6", fillOpacity: 0.94 }, labelBgPadding: [4, 3] }; }
function focusIds(focusId: string, relations: readonly RelationReadProjectionR0[], depth: number) {
  const visible = new Set([focusId]); let frontier = new Set([focusId]);
  for (let step = 0; step < depth; step += 1) { const next = new Set<string>(); for (const relation of relations) { if (frontier.has(relation.sourceObjectId)) next.add(relation.targetObjectId); if (frontier.has(relation.targetObjectId)) next.add(relation.sourceObjectId); } for (const id of next) visible.add(id); frontier = next; }
  return visible;
}
function remoteIds(focusId: string, eventIds: ReadonlySet<string>, visible: ReadonlySet<string>, relations: readonly RelationReadProjectionR0[]) {
  const past = new Set<string>(), future = new Set<string>(), inbound = new Map<string, string[]>(), outbound = new Map<string, string[]>();
  for (const relation of relations) { outbound.set(relation.sourceObjectId, [...(outbound.get(relation.sourceObjectId) ?? []), relation.targetObjectId]); inbound.set(relation.targetObjectId, [...(inbound.get(relation.targetObjectId) ?? []), relation.sourceObjectId]); }
  const visit = (lookup: ReadonlyMap<string, string[]>, target: Set<string>) => { const queue = [...(lookup.get(focusId) ?? [])], seen = new Set<string>(); while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); if (!visible.has(id) && eventIds.has(id)) target.add(id); for (const next of lookup.get(id) ?? []) queue.push(next); } };
  visit(inbound, past); visit(outbound, future); return { past, future };
}
function collectionPointPosition(point: StoryCollectionPoint, index: number) { return point.layout.x || point.layout.y ? { x: point.layout.x, y: point.layout.y } : { x: 80 + index * 520, y: 100 + (index % 2) * 330 }; }
/** Development-only fallback for malformed fixtures; product layout uses buildEventNarrativeLayout. */
function developmentGridFallback(index: number) { return { x: 90 + index * 270, y: 160 }; }
function relationGraphPosition(index: number) { return { x: 90 + (index % 3) * 280, y: 92 + Math.floor(index / 3) * 184 }; }
function focusProjectionLayout(events: readonly EventLineEventSummary[], focusId: string, relations: readonly RelationReadProjectionR0[], remote: { past: ReadonlySet<string>; future: ReadonlySet<string> }) {
  const inbound = events.filter((event) => event.id !== focusId && relations.some((relation) => relation.sourceObjectId === event.id && relation.targetObjectId === focusId));
  const outbound = events.filter((event) => event.id !== focusId && relations.some((relation) => relation.sourceObjectId === focusId && relation.targetObjectId === event.id));
  const assigned = new Set([focusId, ...inbound.map((event) => event.id), ...outbound.map((event) => event.id)]);
  const remaining = events.filter((event) => !assigned.has(event.id));
  const positions: Record<string, { x: number; y: number }> = { [focusId]: { x: 400, y: 260 } };
  inbound.forEach((event, index) => { positions[event.id] = { x: 60, y: 100 + index * 170 }; });
  outbound.forEach((event, index) => { positions[event.id] = { x: 720, y: 100 + index * 170 }; });
  remaining.forEach((event, index) => { positions[event.id] = { x: 400, y: 70 + index * 170 }; });
  const remoteY = (count: number) => Math.max(450, 100 + Math.max(0, count - 1) * 170 + 180);
  return {
    positions,
    // The focus card's centre is deliberately aligned with the visual centre
    // of the complete projection bounds. React Flow then fits that same set to
    // the live canvas width (including an open inspector) without hiding a
    // remote cluster beneath it.
    remote: {
      past: remote.past.size ? { x: 40, y: remoteY(inbound.length) } : undefined,
      future: remote.future.size ? { x: 740, y: remoteY(outbound.length) } : undefined
    }
  };
}
function fitFocusProjection(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[], drawerOpen: boolean) {
  if (!nodes.length) return;
  // React Flow owns the live viewport dimensions. Asking the instance to fit
  // the explicit focus projection avoids measuring a clipped ancestor when
  // the workspace inspector or local directory is layered over the canvas.
  void flow.fitView({
    nodes: nodes.map((node) => ({ id: node.id })),
    padding: drawerOpen ? .18 : .08,
    minZoom: .25,
    maxZoom: 1.05,
    duration: 0
  });
}
function fitPredictionProjection(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[]) {
  const canvas = document.querySelector<HTMLElement>(".event-graph-flow")?.getBoundingClientRect();
  if (!canvas || !nodes.length) return;
  // Source context and the candidate lanes are one authored comparison range.
  // At wide widths the range is centered together; at narrow widths its start
  // remains readable and later nodes stay reachable by panning.
  const focusNodes = nodes;
  const dimensions = (node: Node<NodeData>) => node.type === "predictionScope"
    ? { width: Number(node.style?.width) || 246, height: Number(node.style?.height) || 425 }
    : node.type === "predictionSourceSummary" ? { width: 176, height: 82 }
    : node.type === "prediction" ? { width: 192, height: 132 } : { width: 204, height: 112 };
  const minX = Math.min(...focusNodes.map((node) => node.position.x));
  const minY = Math.min(...focusNodes.map((node) => node.position.y));
  const maxX = Math.max(...focusNodes.map((node) => node.position.x + dimensions(node).width));
  const maxY = Math.max(...focusNodes.map((node) => node.position.y + dimensions(node).height));
  const paddingX = 26;
  const paddingY = 34;
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const fittedZoom = Math.min(1, (canvas.width - paddingX * 2) / Math.max(1, contentWidth), (canvas.height - paddingY * 2) / Math.max(1, contentHeight));
  // Candidate cards are authored at 192px. Keeping the automatic viewport at
  // or above .95 preserves at least 182px of rendered width. When the whole
  // path is wider than the live canvas, align its beginning and leave the rest
  // available by panning instead of shrinking every card into unreadability.
  const zoom = Math.max(.95, fittedZoom);
  const x = contentWidth * zoom > canvas.width - paddingX * 2
    ? paddingX - minX * zoom
    : (canvas.width - contentWidth * zoom) / 2 - minX * zoom;
  const y = (canvas.height - contentHeight * zoom) / 2 - minY * zoom;
  void flow.setViewport({ x, y, zoom }, { duration: 0 });
}
function fitNarrativeProjection(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[], navigation: ReturnType<typeof buildNarrativeNavigation>) {
  const canvas = document.querySelector<HTMLElement>('[data-canvas-kind="narrative"] .event-graph-flow')?.getBoundingClientRect();
  const content = nodes.filter((node) => node.type === "event" || node.type === "narrativeTrack");
  if (!canvas || !content.length) return;
  const firstBranch = navigation.branchPoints[0];
  const branchTargetId = firstBranch?.targetEventIds.find((id) => navigation.trackByEventId[id] !== navigation.trackByEventId[firstBranch.eventId]) ?? firstBranch?.targetEventIds[0];
  const initialRange = firstBranch && branchTargetId ? nodes.filter((node) => node.id === firstBranch.eventId || node.id === branchTargetId) : [];
  if (initialRange.length === 2) {
    focusNarrativeRange(flow, initialRange, canvas);
    return;
  }
  const dimensions = (node: Node<NodeData>) => node.type === "narrativeTrack" ? { width: 148, height: 30 } : { width: 234, height: 164 };
  const minX = Math.min(...content.map((node) => node.position.x));
  const minY = Math.min(...content.map((node) => node.position.y));
  const maxY = Math.max(...content.map((node) => node.position.y + dimensions(node).height));
  const zoom = .9;
  const padding = 28;
  const contentHeight = (maxY - minY) * zoom;
  const y = contentHeight <= canvas.height - padding * 2
    ? (canvas.height - contentHeight) / 2 - minY * zoom
    : padding - minY * zoom;
  // Wide narrative paths start at the authored beginning and remain pannable;
  // they are never centered as one tiny, unreadable wall of cards.
  void flow.setViewport({ x: padding - minX * zoom, y, zoom }, { duration: 0 });
}
function focusNarrativeRange(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[], measuredCanvas?: DOMRect) {
  const canvas = measuredCanvas ?? document.querySelector<HTMLElement>('[data-canvas-kind="narrative"] .event-graph-flow')?.getBoundingClientRect();
  if (!canvas || !nodes.length) return;
  const zoom = .92;
  const width = 234;
  const height = 164;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + height));
  const contentWidth = (maxX - minX) * zoom;
  const contentHeight = (maxY - minY) * zoom;
  const x = Math.max(28 - minX * zoom, (canvas.width - contentWidth) / 2 - minX * zoom);
  const y = Math.max(28 - minY * zoom, (canvas.height - contentHeight) / 2 - minY * zoom);
  void flow.setViewport({ x, y, zoom }, { duration: 220 });
}
function fitTemporalProjection(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[], selectedEventId: string | null) {
  const canvas = document.querySelector<HTMLElement>(".event-graph-workspace.is-temporal .event-graph-flow")?.getBoundingClientRect();
  if (!canvas) return;
  const events = nodes.filter((node) => node.type === "event");
  if (!events.length) return;
  const leftInset = 96;
  const rightInset = 28;
  const topInset = 58;
  const bottomInset = 34;
  const availableWidth = Math.max(1, canvas.width - leftInset - rightInset);
  const availableHeight = Math.max(1, canvas.height - topInset - bottomInset);
  const selected = selectedEventId ? events.find((node) => node.id === selectedEventId) : null;
  if (selected) {
    void flow.setViewport({ x: leftInset + availableWidth / 2 - (selected.position.x + 147), y: topInset + availableHeight / 2 - (selected.position.y + 70), zoom: 1 }, { duration: 0 });
    return;
  }
  const minX = Math.min(...events.map((node) => node.position.x));
  const maxX = Math.max(...events.map((node) => node.position.x + 294));
  const minY = Math.min(...events.map((node) => node.position.y));
  const maxY = Math.max(...events.map((node) => node.position.y + 144));
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const zoom = Math.max(.84, Math.min(1, availableWidth / Math.max(1, contentWidth), availableHeight / Math.max(1, contentHeight)));
  const x = contentWidth * zoom > availableWidth
    ? leftInset - minX * zoom
    : leftInset + (availableWidth - contentWidth * zoom) / 2 - minX * zoom;
  const y = contentHeight * zoom > availableHeight
    ? topInset - minY * zoom
    : topInset + (availableHeight - contentHeight * zoom) / 2 - minY * zoom;
  void flow.setViewport({ x, y, zoom }, { duration: 0 });
}
function isDensityFixture() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("eventGraphFixture") === "density50";
}
function syntheticDensityFixture(): { events: EventLineEventSummary[]; relations: RelationReadProjectionR0[]; storyUnits: StoryUnit[] } {
  const events = Array.from({ length: 50 }, (_, index) => ({
    id: `synthetic-density-event-${index + 1}`,
    type: "event",
    title: `密度事件 ${String(index + 1).padStart(2, "0")}`,
    status: index === 46 ? "draft" : "committed",
    tags: [index === 46 ? "状态：候选" : "作者确认", `时间：第${index + 1}回`, `地点：区域 ${index % 7 + 1}`, `故事线：${index < 20 ? "主线" : index < 30 ? "支线·船坞" : index < 40 ? "支线·灯塔" : "隐线·潮声"}`, ...(index === 47 ? ["状态：未知", "时间冲突：需要作者处理"] : [])],
    revisionToken: `synthetic-${index + 1}`
  } as EventLineEventSummary));
  const makeRelation = (source: number, target: number, candidate = false) => ({
    relationId: `synthetic-density-relation-${source}-${target}`,
    sourceObjectId: events[source - 1]!.id,
    targetObjectId: events[target - 1]!.id,
    relationTypeId: "synthetic-density-type",
    relationLabelSnapshot: "促使",
    currentTypeLabel: "促使",
    direction: "forward",
    reviewState: candidate ? "candidate" : "confirmed",
    evidenceRefs: [], evidenceWarnings: [], provenance: { sourceRef: "local-synthetic-density" }, sourceRevision: "synthetic", revision: 1,
    archived: false, supersedesRelationId: null, decisionReceipt: null, relationType: null,
    createdAt: "local", updatedAt: "local", operationReceipt: null
  } as unknown as RelationReadProjectionR0);
  const relations: RelationReadProjectionR0[] = [];
  for (let index = 1; index < 20; index += 1) relations.push(makeRelation(index, index + 1));
  [[3, 21, 30, 8], [7, 31, 40, 14], [12, 41, 50, 19]].forEach(([branchAt, start, end, mergeAt]) => { relations.push(makeRelation(branchAt!, start!)); for (let index = start!; index < end!; index += 1) relations.push(makeRelation(index, index + 1)); relations.push(makeRelation(end!, mergeAt!)); });
  relations.push(makeRelation(18, 28, true));
  const collectionPoints: StoryCollectionPoint[] = [[4, 5], [12, 13, 14], [24, 25], [35, 36, 37]].map((members, index) => ({ id: `synthetic-collection-point-${index + 1}`, title: `编排集点 ${index + 1}`, eventIds: members.map((member) => events[member - 1]!.id), order: index, collapsed: index === 2, sourceVersionRef: "synthetic-density-r9", revision: 1, layout: { x: 900 + index * 560, y: 650 + index % 2 * 360, pinned: false }, lastOperationId: `synthetic-collection-point-${index + 1}.create` }));
  const now = "2026-09-02T00:00:00.000Z";
  const storyUnits: StoryUnit[] = [{ id: "synthetic-story-unit-density", relativeId: "story-units/synthetic-density.md", title: "长夜将明·密度校验", summary: "主线、三条分支、合流、四个集点与候选冲突的隔离测试。", kind: "main", parentUnitId: null, branchPointEventId: null, mergeTargetUnitId: null, order: 0, sourceVersionRef: "synthetic-density-r9", status: "active", objective: "验证水平叙事编排", coreConflict: "多分支密度", turningPoint: "第 12 事件", openHook: "候选冲突", lifecycle: "active", sourceRefs: [], items: [], collectionPoints, linkedEntityIds: events.map((event) => event.id), unresolvedQuestionIds: [], generationConstraints: {}, version: "synthetic-density-r9", createdAt: now, updatedAt: now, source: "markdown" }];
  return { events, relations, storyUnits };
}
function directionLabel(direction: RelationReadProjectionR0["direction"]) { return direction === "reverse" ? "目标 → 来源" : direction === "both" ? "双向" : direction === "none" ? "未指定方向" : "来源 → 目标"; }
function relationReason(relation: RelationReadProjectionR0) { const source = typeof relation.provenance.sourceRef === "string" ? relation.provenance.sourceRef : ""; return /pi|agent|tianyi/iu.test(source) ? "由天意提出，等待作者确认" : "由作者操作提出，等待作者确认"; }
function evidenceLabel(relation: RelationReadProjectionR0) { return relation.evidenceWarnings.length ? String(relation.evidenceWarnings.length) + " 条证据仍需核验。" : relation.evidenceRefs.length ? "已有可追溯的关系证据。" : "当前未附加额外证据。"; }
function layoutKey(projectId: string, canvasKind: "narrative" | "relation") { return `tianyan.event-graph-layout/v3:${canvasKind}:${projectId}`; }
function readLayout(projectId: string, canvasKind: "narrative" | "relation"): Layout {
  try {
    const value = window.localStorage.getItem(layoutKey(projectId, canvasKind));
    const parsed = value ? JSON.parse(value) as Partial<Layout> : null;
    if (parsed?.version === "tianyan-event-graph-layout/v3" && parsed.positions && typeof parsed.positions === "object") return { version: parsed.version, sourceVersion: typeof parsed.sourceVersion === "string" ? parsed.sourceVersion : "unknown", positions: parsed.positions as Layout["positions"], history: Array.isArray(parsed.history) ? parsed.history.slice(-5) as LayoutSnapshot[] : [] };
    const legacy = canvasKind === "relation" ? window.localStorage.getItem("tianyan.event-graph-layout/v2:" + projectId) : null;
    const legacyLayout = legacy ? JSON.parse(legacy) as { positions?: Layout["positions"] } : null;
    if (legacyLayout?.positions) return { version: "tianyan-event-graph-layout/v3", sourceVersion: "legacy-v2", positions: legacyLayout.positions, history: [] };
  } catch {}
  return { version: "tianyan-event-graph-layout/v3", sourceVersion: "unknown", positions: {}, history: [] };
}
function writeLayout(projectId: string, canvasKind: "narrative" | "relation", positions: Layout["positions"], sourceVersion: string) {
  try {
    const current = readLayout(projectId, canvasKind);
    const changed = JSON.stringify(current.positions) !== JSON.stringify(positions) || current.sourceVersion !== sourceVersion;
    const history = changed && Object.keys(current.positions).length ? [...current.history, { sourceVersion: current.sourceVersion, positions: current.positions }].slice(-5) : current.history;
    window.localStorage.setItem(layoutKey(projectId, canvasKind), JSON.stringify({ version: "tianyan-event-graph-layout/v3", sourceVersion, positions, history } satisfies Layout));
  } catch {}
}
function restorePreviousLayout(projectId: string, canvasKind: "narrative" | "relation") {
  try {
    const current = readLayout(projectId, canvasKind);
    const previous = current.history.at(-1);
    if (!previous) return;
    window.localStorage.setItem(layoutKey(projectId, canvasKind), JSON.stringify({ version: "tianyan-event-graph-layout/v3", sourceVersion: previous.sourceVersion, positions: previous.positions, history: current.history.slice(0, -1) } satisfies Layout));
  } catch {}
}
