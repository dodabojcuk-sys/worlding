import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow,
  type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance,
  useEdgesState, useNodesState
} from "@xyflow/react";
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, CircleDot, Clock3, Expand, Eye,
  FileText, Filter, Focus, Layers3, Link2, MapPin, Maximize2, Network,
  PanelLeftClose, PanelRightClose, Plus, RefreshCw, Sparkles, Tag, UsersRound, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { PredictionRun } from "../../../../../src/storyContracts/multiNodePrediction.ts";
import type { TianyiAgentExecutionProjection, TianyiGraphLayer } from "../../../../../src/storyContracts/tianyiAgentMode.ts";
import { eventLineEventMetadata, eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";
import { useWorkspaceDockSlot, workspaceDockCoordinator, type RightWorkSurfaceMode } from "../../product-shell/WorkspaceDockCoordinator";
import { CandidateEventNode } from "../graph-nodes/CandidateEventNode";
import { FormalEventNode } from "../graph-nodes/FormalEventNode";
import { AgentExecutionGraph } from "../tianyi/execution/AgentExecutionGraph";

type Selection =
  | { kind: "node"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "remote"; direction: "past" | "future"; count: number }
  | null;
type NodeData = {
  title: string; time: string; location: string; status: string; focused: boolean; selected: boolean; predictionSelected?: boolean;
  remote?: boolean; candidate?: boolean; direction?: "past" | "future"; count?: number; runId?: string; pathCount?: number;
  pathLabel?: string; reviewSelected?: boolean; scopeLabel?: string; sourceSummary?: boolean; sourceCount?: number; onExpandSources?: () => void;
};
type PredictionSelectionDetail = { runId: string; pathId: string; selectedCandidateNodeIds: string[]; origin: "tianyi" | "canvas" };
type Layout = { version: "tianyan-event-graph-layout/v2"; positions: Record<string, { x: number; y: number }> };
const nodeTypes = { event: FormalEventNode, prediction: CandidateEventNode, predictionScope: PredictionScopeNode, predictionSourceSummary: PredictionSourceSummaryNode };

export function EventGraphCanvas(props: {
  projectId: string;
  events: readonly EventLineEventSummary[];
  relations: readonly RelationReadProjectionR0[];
  selectedEventId: string | null;
  onSelectEvent(eventId: string): void;
  onClearSelection(): void;
  onCreateRelation?(input: { sourceEventId: string; targetEventId: string }): Promise<void> | void;
  onConfirmRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onUpdateRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onApproveModifiedRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onRejectRelation?(relation: RelationReadProjectionR0): Promise<void> | void;
  onOpenStorySpine?(): void;
  onOpenTimeline?(): void;
  onCreateEvent?(): void;
  createOpen?: boolean;
  createInspector?: ReactNode;
  onCloseCreate?(): void;
  onOpenTianyi?(eventIds?: string[]): void;
}) {
  const [view, setView] = useState<"global" | "focus">("global");
  const [focusId, setFocusId] = useState<string | null>(props.selectedEventId);
  const [depth, setDepth] = useState(1);
  const [selection, setSelection] = useState<Selection>(props.selectedEventId ? { kind: "node", id: props.selectedEventId } : null);
  const [predictionSelectionIds, setPredictionSelectionIds] = useState<string[]>([]);
  const [predictionRun, setPredictionRun] = useState<PredictionRun | null>(null);
  const [predictionPathId, setPredictionPathId] = useState<string | null>(null);
  const [predictionSelectedNodeIds, setPredictionSelectedNodeIds] = useState<string[]>([]);
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
  const [busy, setBusy] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const globalViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const railViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const restoreGlobalViewport = useRef(false);
  const restoreRailViewport = useRef(false);
  const relationSelectionActive = useRef(false);
  const layout = useMemo(() => readLayout(props.projectId), [props.projectId, layoutRevision]);
  const densityFixture = useMemo(() => isDensityFixture() ? syntheticDensityFixture() : null, []);
  const graphEvents = densityFixture?.events ?? props.events;
  const graphRelations = densityFixture?.relations ?? props.relations;
  const expandPredictionSources = useCallback(() => setPredictionSourcesExpanded(true), []);
  const collapsePredictionSources = narrowPrediction && Boolean(predictionPathId) && !predictionSourcesExpanded;
  const graph = useMemo(() => deriveGraph(graphEvents, graphRelations, view, focusId, depth, layout.positions, selection, new Set(predictionSelectionIds), predictionRun, predictionPathId, new Set(predictionSelectedNodeIds), collapsePredictionSources, expandPredictionSources), [collapsePredictionSources, depth, expandPredictionSources, focusId, graphEvents, graphRelations, layout.positions, predictionPathId, predictionRun, predictionSelectedNodeIds, predictionSelectionIds, selection, view]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);
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
    const query = window.matchMedia("(max-width: 75rem)");
    const update = () => setNarrowPrediction(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (narrowPrediction && predictionPathId) setPredictionSourcesExpanded(false);
  }, [narrowPrediction, predictionPathId]);

  useEffect(() => { setNodes(graph.nodes); setEdges(graph.edges); }, [graph.edges, graph.nodes, setEdges, setNodes]);
  useEffect(() => {
    if (props.selectedEventId) {
      if (relationSelectionActive.current) return;
      setSelection((current) => current?.kind === "relation" ? current : { kind: "node", id: props.selectedEventId! });
      openInspector("EVENT_DETAILS");
    }
  }, [openInspector, props.selectedEventId]);
  useEffect(() => {
    if (props.createOpen) openInspector("EVENT_CREATE");
  }, [openInspector, props.createOpen]);
  useEffect(() => {
    if (!flow || !graph.nodes.length) return;
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
          if (predictionPathId) fitPredictionProjection(flow, graph.nodes);
          else if (view === "focus") void fitFocusProjection(flow, graph.nodes, railOpen);
          else void flow.fitView({ padding: railOpen ? 0.24 : 0.08, duration: 0, maxZoom: 1.05 });
        }
      }, 180);
    });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [flow, graph.nodes, inspectorOpen, predictionPathId, railOpen, view]);

  const persistLayout = useCallback(() => {
    const positions = Object.fromEntries(nodes.filter((node) => !node.id.startsWith("projection.remote")).map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]));
    writeLayout(props.projectId, positions);
  }, [nodes, props.projectId]);
  const focus = (eventId: string) => {
    if (view === "global") globalViewport.current = flow?.getViewport() ?? null;
    setFocusId(eventId); setDepth(1); setView("focus"); setSelection({ kind: "node", id: eventId }); openInspector("EVENT_DETAILS"); props.onSelectEvent(eventId);
  };
  const selectNode = (eventId: string) => { relationSelectionActive.current = false; setSelection({ kind: "node", id: eventId }); openInspector("EVENT_DETAILS"); props.onSelectEvent(eventId); };
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
  const predictionSources = predictionSelectionIds.map((id) => graphEvents.find((event) => event.id === id)).filter((event): event is EventLineEventSummary => Boolean(event));
  const addCurrentToPrediction = () => {
    if (!currentEvent) return;
    setPredictionSelectionIds((current) => current.includes(currentEvent.id) || current.length >= 4 ? current : [...current, currentEvent.id]);
  };
  const togglePredictionCandidate = (candidateId: string) => {
    if (!predictionRun || !predictionPathId) return;
    const next = predictionSelectedNodeIds.includes(candidateId) ? predictionSelectedNodeIds.filter((id) => id !== candidateId) : [...predictionSelectedNodeIds, candidateId];
    setPredictionSelectedNodeIds(next);
    const detail: PredictionSelectionDetail = { runId: predictionRun.runId, pathId: predictionPathId, selectedCandidateNodeIds: next, origin: "canvas" };
    (window as Window & { __storyStudioPredictionSelection?: PredictionSelectionDetail }).__storyStudioPredictionSelection = detail;
    window.dispatchEvent(new CustomEvent("story-studio-prediction-review-selection", { detail }));
  };
  const remote = selection?.kind === "remote" ? selection : null;
  const candidateCount = graphRelations.filter((relation) => relation.reviewState === "candidate").length;

  if (graphLayer === "AGENT_EXECUTION_GRAPH") {
    return executionProjection ? <AgentExecutionGraph projection={executionProjection} onReturn={() => setGraphLayer("EVENT_GRAPH")} onOpenCandidates={() => setGraphLayer("EVENT_GRAPH")} onStop={() => window.dispatchEvent(new CustomEvent("story-studio-stop-agent-execution"))} onRetry={() => window.dispatchEvent(new CustomEvent("story-studio-retry-agent-execution"))} /> : <section className="agent-execution-workspace is-empty" aria-label="Agent 执行过程" data-graph-layer="AGENT_EXECUTION_GRAPH"><header><div><small>天意 Agent</small><strong>Agent 执行过程</strong><span>运行事件尚未到达</span></div><nav><button type="button" onClick={() => setGraphLayer("EVENT_GRAPH")}><ArrowLeft />返回事件图</button></nav></header><p>执行图只由实际 Run 事件构建，不显示静态装饰流程。</p></section>;
  }

  return <section className={"event-graph-workspace " + (inspectorOpen ? "has-inspector" : "")} aria-label="事件关系工作区" data-event-graph-owner="projection" data-graph-layer="EVENT_GRAPH" data-candidate-overlay={predictionPathId ? "visible" : "hidden"} data-graph-view={view} data-event-graph-density={densityFixture ? "synthetic-50" : undefined}>
    <header className="event-graph-commandbar">
      <button type="button" className="event-graph-directory-toggle" aria-label={railOpen ? "收起事件目录" : "展开事件目录"} aria-pressed={railOpen} onClick={toggleRail}>{railOpen ? <PanelLeftClose /> : <Network />}</button>
      <nav className="event-graph-view-switch" aria-label="事件视图">
        <button type="button" aria-pressed="false" onClick={() => props.onOpenStorySpine?.()}><Layers3 />故事脊柱</button>
        <button type="button" className="is-active" aria-pressed="true" onClick={returnGlobal}><Network />关系图</button>
        <button type="button" aria-pressed="false" onClick={() => props.onOpenTimeline?.()}><Clock3 />时间轴</button>
      </nav>
      <div className="event-graph-command-actions">
        <button type="button" aria-label="新增事件" title="新增事件" onClick={() => props.onCreateEvent?.() ?? setNotice("当前无法打开新建事件。")}><Plus /><span>新增事件</span></button>
        {view === "focus" ? <button type="button" aria-label="返回全局" title="返回全局" onClick={returnGlobal}><ArrowLeft /><span>返回全局</span></button> : null}
        <button type="button" aria-label="聚焦当前" title="聚焦当前" disabled={!currentEvent} onClick={() => currentEvent ? focus(currentEvent.id) : undefined}><Focus /><span>聚焦当前</span></button>
        {view === "focus" ? <button type="button" aria-label="展开一层" title="展开一层" onClick={() => setDepth((value) => Math.min(value + 1, 3))}><Layers3 /><span>展开一层</span></button> : null}
        <button type="button" aria-label="自动布局" title="自动布局" onClick={() => { writeLayout(props.projectId, {}); setLayoutRevision((value) => value + 1); setNotice("已恢复自动布局；本机手动位置已清除。"); }}><RefreshCw /><span>自动布局</span></button>
        <button type="button" aria-label="筛选" title="筛选" aria-expanded={filterOpen} onClick={() => setFilterOpen((value) => !value)}><Filter /><span>筛选</span></button>
        <button type="button" aria-label="适应视图" onClick={() => void flow?.fitView({ padding: 0.16, duration: 160, maxZoom: 1.05 })}><Maximize2 /><span>适应视图</span></button>
        <button type="button" aria-label={miniMapOpen ? "隐藏小地图" : "显示小地图"} aria-pressed={miniMapOpen} onClick={() => setMiniMapOpen((open) => !open)}><MapPin /><span>小地图</span></button>
        <button type="button" aria-label="将当前事件加入推演范围" disabled={!currentEvent || predictionSelectionIds.length >= 4 || predictionSelectionIds.includes(currentEvent?.id ?? "")} onClick={addCurrentToPrediction}><Plus /><span>加入推演范围</span></button>
        <button type="button" aria-label="推演所选节点" disabled={!predictionSelectionIds.length} onClick={() => props.onOpenTianyi?.(predictionSelectionIds)}><Sparkles /><span>推演 {predictionSelectionIds.length}</span></button>
        <button type="button" aria-label={inspectorOpen ? "收起检查器" : "展开检查器"} aria-pressed={inspectorOpen} onClick={() => inspectorOpen ? closeInspector() : openInspector(selection?.kind === "relation" ? "RELATION_REVIEW" : props.createOpen ? "EVENT_CREATE" : "EVENT_DETAILS")}>{inspectorOpen ? <PanelRightClose /> : <ChevronLeft />}</button>
      </div>
    </header>
    {predictionSources.length ? <section className="event-graph-prediction-scope" aria-label="推演范围" aria-live="polite"><strong>推演范围 {predictionSources.length}/4</strong>{predictionSources.map((event, index) => <span key={event.id} title={event.title} aria-label={`第 ${index + 1} 个推演依据：${event.title}`}><b>{index + 1}</b>{event.title}<button type="button" title={`移出推演范围：${event.title}`} aria-label={`移出推演范围：${event.title}`} onClick={() => setPredictionSelectionIds((current) => current.filter((id) => id !== event.id))}><X /></button></span>)}{narrowPrediction && predictionPathId ? <button type="button" className="event-graph-source-collapse" aria-expanded={predictionSourcesExpanded} onClick={() => setPredictionSourcesExpanded((expanded) => !expanded)}>{predictionSourcesExpanded ? `折叠为 ${predictionSources.length} 个推演依据` : `展开 ${predictionSources.length} 个推演依据`}</button> : null}<button type="button" onClick={() => setPredictionSelectionIds([])}>清空</button></section> : null}
    {filterOpen ? <div className="event-graph-filter-row" role="status"><Filter /><span>当前展示全部正式事件、待确认关系与远端投影；筛选只改变本机观察范围。</span><button type="button" onClick={() => setFilterOpen(false)}>完成</button></div> : null}
    {notice ? <p className="event-graph-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X /></button></p> : null}
    <div className="event-graph-main">
      <EventUnitDirectory events={graphEvents} selectedEventId={selection?.kind === "node" ? selection.id : null} predictionSelectionIds={predictionSelectionIds} onSelect={selectNode} onTogglePrediction={(eventId) => setPredictionSelectionIds((current) => current.includes(eventId) ? current.filter((id) => id !== eventId) : current.length < 4 ? [...current, eventId] : current)} />
      <aside className={"event-graph-local-rail " + (railOpen ? "is-open" : "")} aria-label="事件图局部目录" data-event-graph-drawer={railOpen ? "open" : "closed"}>
        <button type="button" className="is-active"><Network /><span>关系图</span></button>
        <button type="button" onClick={() => props.onOpenStorySpine?.()}><Layers3 /><span>故事脊柱</span></button>
        <button type="button" onClick={() => props.onCreateEvent?.() ?? setNotice("当前无法打开新建事件。")}><Plus /><span>新增事件</span></button>
        <button type="button" onClick={() => { const relation = graphRelations.find((item) => item.reviewState === "candidate"); if (relation) { restoreRailViewport.current = false; railViewport.current = null; setSelection({ kind: "relation", id: relation.relationId }); openInspector("RELATION_REVIEW"); setRailOpen(false); } else setNotice("当前没有待确认关系。"); }}><CircleDot /><span>待确认 {candidateCount}</span></button>
      </aside>
      <div className="event-graph-flow" onPointerUp={persistLayout}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect}
          onNodeClick={(event, node) => {
            if (node.id.startsWith("projection.remote")) {
              setSelection({ kind: "remote", direction: node.data.direction ?? "future", count: node.data.count ?? 0 }); openInspector("EVENT_DETAILS");
            } else if (node.data.candidate) {
              togglePredictionCandidate(node.id);
              setNotice("已同步更新候选节点的审阅选择；它仍未写入事件线。");
            } else {
              if (event.shiftKey) setPredictionSelectionIds((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : current.length < 4 ? [...current, node.id] : current);
              else selectNode(node.id);
            }
          }}
          onNodeDoubleClick={(_, node) => { if (!node.id.startsWith("projection.remote")) focus(node.id); }}
          onEdgeClick={(_, edge) => { relationSelectionActive.current = true; setSelection({ kind: "relation", id: edge.id }); openInspector("RELATION_REVIEW"); }}
          onPaneClick={() => { setSelection(null); closeInspector(); props.onClearSelection(); }}
          onInit={setFlow} fitView minZoom={0.25} maxZoom={1.8}
          nodesConnectable={Boolean(props.onCreateRelation)}
          connectionLineStyle={{ stroke: "var(--color-accent)", strokeWidth: 1.5 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="rgba(20, 125, 120, 0.13)" />
          <Controls showInteractive={false} />
          {miniMapOpen ? <MiniMap pannable zoomable nodeColor={(node) => node.data?.candidate ? "#d9911d" : node.data?.remote ? "#77a6a1" : "#147d78"} /> : null}
        </ReactFlow>
        <GraphLegend />
      </div>
      {inspectorOpen && props.createOpen && props.createInspector ? <aside className="event-graph-inspector event-create-graph-inspector" aria-label="新建事件检查器"><InspectorHeader title="新建事件" subtitle="保存为草稿后会出现在故事脊柱与关系图中" onClose={() => props.onCloseCreate?.()} />{props.createInspector}</aside> : null}
      {inspectorOpen && !props.createOpen ? <GraphInspector
        event={currentEvent} relation={currentRelation} remote={remote} events={graphEvents} relations={graphRelations} busy={busy}
        onClose={closeInspector} onFocus={focus} onOpenTianyi={(eventId) => props.onOpenTianyi?.(eventId ? [eventId] : undefined)}
        onConfirm={(relation) => void act(relation, "confirm")} onUpdate={(relation) => void act(relation, "update")} onApproveModified={(relation) => void act(relation, "approve-modified")}
        onReject={(relation) => void act(relation, "reject")} onDefer={() => setNotice("候选已保留在待确认中，尚未成为正式关系。")}
        onExpand={() => { setDepth((value) => Math.min(value + 1, 3)); setSelection(focusId ? { kind: "node", id: focusId } : null); }}
      /> : null}
    </div>
  </section>;
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

function EventUnitDirectory(props: {
  events: readonly EventLineEventSummary[];
  selectedEventId: string | null;
  predictionSelectionIds: readonly string[];
  onSelect(eventId: string): void;
  onTogglePrediction(eventId: string): void;
}) {
  const units = useMemo(() => {
    const grouped = new Map<string, { direct: EventLineEventSummary[]; setPoints: Map<string, EventLineEventSummary[]> }>();
    for (const event of props.events) {
      const metadata = eventLineEventMetadata(event);
      const label = metadata.unitLabel ?? "未归入单元";
      const unit = grouped.get(label) ?? { direct: [], setPoints: new Map<string, EventLineEventSummary[]>() };
      if (metadata.setPointLabel) unit.setPoints.set(metadata.setPointLabel, [...(unit.setPoints.get(metadata.setPointLabel) ?? []), event]);
      else unit.direct.push(event);
      grouped.set(label, unit);
    }
    return [...grouped.entries()];
  }, [props.events]);
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

function GraphLegend() {
  return <aside className="event-graph-legend" aria-label="关系图图例"><span><i className="formal" />正式关系</span><span><i className="candidate" />待确认</span><span><i className="remote" />远端投影</span></aside>;
}

function GraphInspector(props: {
  event: EventLineEventSummary | null; relation: RelationReadProjectionR0 | null; remote: Extract<Selection, { kind: "remote" }> | null;
  events: readonly EventLineEventSummary[]; relations: readonly RelationReadProjectionR0[]; busy: string | null;
  onClose(): void; onFocus(id: string): void; onOpenTianyi?(id?: string): void; onConfirm(relation: RelationReadProjectionR0): void;
  onUpdate(relation: RelationReadProjectionR0): void; onApproveModified(relation: RelationReadProjectionR0): void; onReject(relation: RelationReadProjectionR0): void; onDefer(): void; onExpand(): void;
}) {
  const [tab, setTab] = useState<"overview" | "story" | "relations" | "analysis" | "tianyi">("overview");
  useEffect(() => { setTab("overview"); }, [props.event?.id, props.relation?.relationId, props.remote?.direction]);
  if (props.relation) return <RelationInspector {...props} relation={props.relation} />;
  if (props.remote) return <aside className="event-graph-inspector" aria-label="远端关系簇检查器"><InspectorHeader title={props.remote.direction === "past" ? "远处前因" : "远处后果"} subtitle={String(props.remote.count) + " 条同一数据源中的远端投影"} onClose={props.onClose} /><section className="event-graph-inspector-empty"><Network /><strong>这是画布聚合，不是新的 Relation</strong><p>展开一层只会扩大当前本机投影范围，不会创建或修改任何事件与关系。</p><button type="button" className="primary-action" onClick={props.onExpand}><Layers3 />展开一层</button></section></aside>;
  if (!props.event) return <aside className="event-graph-inspector" aria-label="事件线概览"><InspectorHeader title="事件线" subtitle="选择事件或关系查看上下文" onClose={props.onClose} /><section className="event-graph-inspector-empty"><Network /><strong>关系图已准备好</strong><p>点击节点查看详情；拖线只会生成待确认候选，不会直接写入正式关系。</p><dl><div><dt>正式关系</dt><dd>{props.relations.filter((item) => item.reviewState === "confirmed").length}</dd></div><div><dt>待确认</dt><dd>{props.relations.filter((item) => item.reviewState === "candidate").length}</dd></div></dl></section></aside>;
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

function RelationInspector(props: Omit<Parameters<typeof GraphInspector>[0], "relation"> & { relation: RelationReadProjectionR0 }) {
  const source = props.events.find((event) => event.id === props.relation.sourceObjectId)?.title ?? "来源事件不可用";
  const target = props.events.find((event) => event.id === props.relation.targetObjectId)?.title ?? "目标事件不可用";
  const pending = props.relation.reviewState === "candidate";
  const isBusy = props.busy === props.relation.relationId;
  const [direction, setDirection] = useState(props.relation.direction);
  useEffect(() => { setDirection(props.relation.direction); }, [props.relation.direction, props.relation.relationId]);
  const editedRelation = direction === props.relation.direction ? props.relation : { ...props.relation, direction };
  return <aside className="event-graph-inspector" aria-label={pending ? "待确认关系检查器" : "正式关系检查器"}>
    <InspectorHeader title={pending ? "关系候选" : "正式关系"} subtitle={pending ? "尚未成为正式关系" : "已由作者确认"} onClose={props.onClose} />
    <div className="event-graph-inspector-body relation-inspector">
      <section className={pending ? "event-graph-relation-status is-candidate" : "event-graph-relation-status is-confirmed"}>{pending ? "待确认 · 候选关系" : "已确认 · 正式关系"}</section>
      <Facts facts={[[<ArrowRight />, "来源事件", source], [<ArrowRight />, "目标事件", target], [<Link2 />, "关系类型", props.relation.currentTypeLabel ?? props.relation.relationLabelSnapshot], [<ArrowRight />, "方向", directionLabel(props.relation.direction)], [<FileText />, "说明", relationReason(props.relation)]]} />
      <TextBlock title="证据或来源" text={evidenceLabel(props.relation)} />
      {pending ? <><TextBlock title="影响范围" text={"确认后将在“" + source + "”与“" + target + "”之间建立一条正式关系；作者确认前，正式关系不会增加。"} /><label className="event-graph-candidate-editor">修改方向<select aria-label="候选关系方向" value={direction} disabled={isBusy} onChange={(event) => setDirection(event.target.value as RelationReadProjectionR0["direction"])}><option value="forward">来源 → 目标</option><option value="reverse">目标 → 来源</option><option value="both">双向</option><option value="none">未指定方向</option></select></label><footer className="event-graph-candidate-actions"><button type="button" className="primary-action" disabled={isBusy} onClick={() => props.onConfirm(props.relation)}><Check />通过并保存</button><button type="button" disabled={isBusy} onClick={() => props.onApproveModified(editedRelation)}><Eye />修改后通过</button><button type="button" className="danger-action" disabled={isBusy} onClick={() => props.onReject(props.relation)}><X />拒绝</button><button type="button" disabled={isBusy} onClick={props.onDefer}>暂不处理</button></footer></> : null}
    </div>
  </aside>;
}

function InspectorHeader(props: { title: string; subtitle: string; onClose(): void; extra?: ReactNode }) {
  return <header className="event-graph-inspector-header"><div><h2>{props.title}</h2><p>{props.subtitle}</p></div><div>{props.extra}<button type="button" aria-label="关闭检查器" onClick={props.onClose}><X /></button></div></header>;
}
function Tab(props: { active: boolean; children: ReactNode; onClick(): void }) { return <button type="button" className={props.active ? "is-active" : ""} aria-pressed={props.active} onClick={props.onClick}>{props.children}</button>; }
function Facts(props: { facts: Array<[ReactNode, string, string]> }) { return <dl className="event-graph-facts">{props.facts.map(([icon, label, value]) => <div key={label}><dt>{icon}{label}</dt><dd>{value}</dd></div>)}</dl>; }
function TextBlock(props: { title: string; text: string }) { return <section className="event-graph-text-block"><h3>{props.title}</h3><p>{props.text}</p></section>; }

function deriveGraph(events: readonly EventLineEventSummary[], relations: readonly RelationReadProjectionR0[], view: "global" | "focus", focusId: string | null, depth: number, positions: Layout["positions"], selection: Selection, predictionSelectionIds: ReadonlySet<string>, predictionRun: PredictionRun | null, predictionPathId: string | null, predictionSelectedNodeIds: ReadonlySet<string>, collapsePredictionSources: boolean, onExpandPredictionSources: () => void): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const ids = new Set(events.map((event) => event.id));
  const validFocus = focusId && ids.has(focusId) ? focusId : null;
  const active = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && !relation.archived && relation.reviewState !== "rejected");
  const activePath = predictionRun?.status === "ready" && predictionRun.bundle && predictionPathId ? predictionRun.bundle.paths.find((path) => path.id === predictionPathId) ?? null : null;
  // Keep every formal Event available while the author is still assembling
  // the prediction scope. At narrow widths the Unit directory may be hidden,
  // so filtering the canvas after the first selection would make the second
  // source impossible to choose. Source focusing starts only with a real path.
  const sourceIds = activePath && predictionRun ? new Set(predictionRun.sourceSnapshot.map((source) => source.eventId)) : null;
  const visible = sourceIds ?? (view === "global" || !validFocus ? ids : focusIds(validFocus, active, depth));
  const remote = view === "focus" && validFocus ? remoteIds(validFocus, ids, visible, active) : { past: new Set<string>(), future: new Set<string>() };
  const focusLayout = view === "focus" && validFocus ? focusProjectionLayout(events.filter((event) => visible.has(event.id)), validFocus, active, remote) : null;
  const visibleEvents = events.filter((event) => visible.has(event.id));
  const nodes: Node<NodeData>[] = collapsePredictionSources ? [] : visibleEvents.map((event, index) => {
    const metadata = eventLineEventMetadata(event);
    const semantic = eventLineSemanticNode(event);
    const predictionPosition = sourceIds ? { x: 50, y: 95 + index * 125 } : null;
    const focused = event.id === validFocus;
    return { id: event.id, type: "event", className: `event-graph-node ${focused ? "is-focused" : ""}`, position: predictionPosition ?? focusLayout?.positions[event.id] ?? positions[event.id] ?? gridPosition(index, events.length), data: { title: event.title, time: semantic.time.label, location: metadata.locationLabels[0] ?? "地点未提供", status: semantic.status === "confirmed" ? "已确认" : "待审", focused, selected: selection?.kind === "node" && selection.id === event.id, predictionSelected: predictionSelectionIds.has(event.id) } } satisfies Node<NodeData>;
  });
  if (remote.past.size) nodes.push(remoteNode("past", remote.past.size, selection, focusLayout?.remote.past));
  if (remote.future.size) nodes.push(remoteNode("future", remote.future.size, selection, focusLayout?.remote.future));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = active.filter((relation) => nodeIds.has(relation.sourceObjectId) && nodeIds.has(relation.targetObjectId)).map((relation) => relationEdge(relation, selection));
  if (validFocus && remote.past.size) edges.push(remoteEdge("past", validFocus));
  if (validFocus && remote.future.size) edges.push(remoteEdge("future", validFocus));
  if (sourceIds && collapsePredictionSources) {
    nodes.push({ id: `prediction-source-summary.${predictionRun?.runId ?? "selection"}`, type: "predictionSourceSummary", draggable: false, connectable: false, selectable: false, position: { x: 42, y: 164 }, data: { title: "", time: "", location: "", status: "", focused: false, selected: false, sourceSummary: true, sourceCount: visibleEvents.length, onExpandSources: onExpandPredictionSources } });
  } else if (sourceIds) {
    nodes.push({ id: `prediction-scope.${predictionRun?.runId ?? "selection"}`, type: "predictionScope", draggable: false, connectable: false, selectable: false, position: { x: 24, y: 38 }, style: { width: 246, height: Math.max(390, visibleEvents.length * 125 + 50) }, data: { title: "", time: "", location: "", status: "", focused: false, selected: false, scopeLabel: `推演依据 · ${visibleEvents.length} 个节点` } });
  }
  if (activePath && predictionRun?.bundle) {
    const candidateIds = new Set(activePath.candidateNodeIds);
    const pathNodes = activePath.candidateNodeIds.map((id) => predictionRun.bundle!.nodes.find((node) => node.id === id)).filter((node): node is NonNullable<typeof node> => Boolean(node));
    pathNodes.forEach((node, index) => {
      const reviewSelected = predictionSelectedNodeIds.has(node.id);
      nodes.push({ id: node.id, type: "prediction", className: `event-graph-prediction-node ${reviewSelected ? "is-review-selected" : "is-review-excluded"}`, draggable: false, connectable: false, selectable: true, position: collapsePredictionSources ? { x: 210 + index * 165, y: 155 } : { x: 315 + index * 185, y: 155 }, data: { title: node.title, time: node.timeConsistency.kind === "unknown" ? "时间未定" : node.timeConsistency.label, location: "候选预览", status: node.identityResolution.kind === "unresolved" ? "候选 · 身份待决 · 尚未写入" : node.timeConsistency.kind === "conflict" ? "候选 · 时间冲突 · 尚未写入" : "候选 · 尚未写入事件线", focused: false, selected: false, candidate: true, runId: predictionRun.runId, pathLabel: activePath.title, reviewSelected } });
    });
    predictionRun.bundle.edges.filter((edge) => candidateIds.has(edge.sourceCandidateId) && candidateIds.has(edge.targetCandidateId)).forEach((edge) => edges.push({ id: edge.id, source: edge.sourceCandidateId, target: edge.targetCandidateId, type: "smoothstep", label: edge.label, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#d9911d", strokeWidth: 1.9, strokeDasharray: "7 5", opacity: .84 }, labelStyle: { fill: "#a75c00", fontSize: 11 }, labelBgStyle: { fill: "#fbfaf6", fillOpacity: .92 } }));
    const first = pathNodes[0];
    if (collapsePredictionSources) {
      const summaryId = `prediction-source-summary.${predictionRun.runId}`;
      if (first) edges.push({ id: `prediction-source-summary-edge.${predictionRun.runId}.${first.id}`, source: summaryId, target: first.id, type: "smoothstep", label: "推演预览", style: { stroke: "#147d78", strokeWidth: 1.35, strokeDasharray: "3 5", opacity: .72 }, markerEnd: { type: MarkerType.ArrowClosed } });
    } else {
      predictionRun.sourceSnapshot.forEach((source, index) => { if (ids.has(source.eventId) && first) edges.push({ id: `prediction-source.${source.eventId}.${first.id}`, source: source.eventId, target: first.id, type: "smoothstep", label: index === 0 ? "推演预览" : undefined, style: { stroke: "#147d78", strokeWidth: 1.35, strokeDasharray: "3 5", opacity: .72 }, markerEnd: { type: MarkerType.ArrowClosed } }); });
    }
  }
  return { nodes, edges };
}

function relationEdge(relation: RelationReadProjectionR0, selection: Selection): Edge {
  const pending = relation.reviewState === "candidate";
  const selected = selection?.kind === "relation" && selection.id === relation.relationId;
  return { id: relation.relationId, source: relation.sourceObjectId, target: relation.targetObjectId, type: "smoothstep", label: pending ? "待确认 · " + (relation.currentTypeLabel ?? relation.relationLabelSnapshot) : relation.currentTypeLabel ?? relation.relationLabelSnapshot, markerEnd: relation.direction === "none" ? undefined : { type: MarkerType.ArrowClosed }, style: pending ? { stroke: "#d9911d", strokeWidth: selected ? 2.5 : 1.7, strokeDasharray: "7 5" } : { stroke: selected ? "#147d78" : "#1c3448", strokeWidth: selected ? 2.5 : 1.7 }, labelStyle: { fill: pending ? "#a75c00" : "#314250", fontSize: 11, fontWeight: selected ? 700 : 600 }, labelBgStyle: { fill: "#fbfaf6", fillOpacity: 0.96 }, labelBgPadding: [4, 3] };
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
function gridPosition(index: number, total: number) { const columns = total > 24 ? 6 : total > 10 ? 5 : 4; return { x: 90 + (index % columns) * 225, y: 170 + Math.floor(index / columns) * 175 }; }
function focusProjectionLayout(events: readonly EventLineEventSummary[], focusId: string, relations: readonly RelationReadProjectionR0[], remote: { past: ReadonlySet<string>; future: ReadonlySet<string> }) {
  const inbound = events.filter((event) => event.id !== focusId && relations.some((relation) => relation.sourceObjectId === event.id && relation.targetObjectId === focusId));
  const outbound = events.filter((event) => event.id !== focusId && relations.some((relation) => relation.sourceObjectId === focusId && relation.targetObjectId === event.id));
  const assigned = new Set([focusId, ...inbound.map((event) => event.id), ...outbound.map((event) => event.id)]);
  const remaining = events.filter((event) => !assigned.has(event.id));
  const positions: Record<string, { x: number; y: number }> = { [focusId]: { x: 500, y: 260 } };
  inbound.forEach((event, index) => { positions[event.id] = { x: 60, y: 100 + index * 170 }; });
  outbound.forEach((event, index) => { positions[event.id] = { x: 940, y: 100 + index * 170 }; });
  remaining.forEach((event, index) => { positions[event.id] = { x: 500, y: 70 + index * 170 }; });
  const remoteY = (count: number) => Math.max(450, 100 + Math.max(0, count - 1) * 170 + 180);
  return {
    positions,
    // The focus card's centre is deliberately aligned with the visual centre
    // of the complete projection bounds. React Flow then fits that same set to
    // the live canvas width (including an open inspector) without hiding a
    // remote cluster beneath it.
    remote: {
      past: remote.past.size ? { x: 40, y: remoteY(inbound.length) } : undefined,
      future: remote.future.size ? { x: 960, y: remoteY(outbound.length) } : undefined
    }
  };
}
function fitFocusProjection(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[], drawerOpen: boolean) {
  const canvas = document.querySelector<HTMLElement>(".event-graph-flow")?.getBoundingClientRect();
  if (!canvas || !nodes.length) return;
  // These are the measured outer card dimensions at zoom 1. The focus layout
  // intentionally remains independent from saved coordinates, while viewport
  // fitting is calculated from the current DOM canvas after its inspector has
  // taken its real width.
  const nodeWidth = 234;
  const nodeHeight = 144;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const maxX = Math.max(...nodes.map((node) => node.position.x + nodeWidth));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxY = Math.max(...nodes.map((node) => node.position.y + nodeHeight));
  const horizontalPadding = drawerOpen ? 170 : 52;
  const verticalPadding = 46;
  const zoom = Math.min(1.05, (canvas.width - horizontalPadding * 2) / Math.max(1, maxX - minX), (canvas.height - verticalPadding * 2) / Math.max(1, maxY - minY));
  const x = (canvas.width - (maxX - minX) * zoom) / 2 - minX * zoom;
  const y = (canvas.height - (maxY - minY) * zoom) / 2 - minY * zoom;
  void flow.setViewport({ x, y, zoom: Math.max(0.25, zoom) }, { duration: 0 });
}
function fitPredictionProjection(flow: ReactFlowInstance<Node<NodeData>, Edge>, nodes: readonly Node<NodeData>[]) {
  const canvas = document.querySelector<HTMLElement>(".event-graph-flow")?.getBoundingClientRect();
  if (!canvas || !nodes.length) return;
  const hasSourceSummary = nodes.some((node) => node.type === "predictionSourceSummary");
  const dimensions = (node: Node<NodeData>) => node.type === "predictionScope"
    ? { width: Number(node.style?.width) || 246, height: Number(node.style?.height) || 425 }
    : node.type === "predictionSourceSummary" ? { width: 160, height: 82 }
    : node.type === "prediction" ? { width: hasSourceSummary ? 156 : 168, height: 126 } : { width: 204, height: 112 };
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + dimensions(node).width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + dimensions(node).height));
  const paddingX = hasSourceSummary ? 44 : 26;
  const paddingY = 34;
  const fittedZoom = Math.min(1, (canvas.width - paddingX * 2) / Math.max(1, maxX - minX), (canvas.height - paddingY * 2) / Math.max(1, maxY - minY));
  const zoom = hasSourceSummary ? Math.max(.82, fittedZoom) : Math.max(.45, fittedZoom);
  const x = (canvas.width - (maxX - minX) * zoom) / 2 - minX * zoom;
  const y = (canvas.height - (maxY - minY) * zoom) / 2 - minY * zoom;
  void flow.setViewport({ x, y, zoom }, { duration: 0 });
}
function isDensityFixture() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("eventGraphFixture") === "density50";
}
function syntheticDensityFixture(): { events: EventLineEventSummary[]; relations: RelationReadProjectionR0[] } {
  const events = Array.from({ length: 50 }, (_, index) => ({
    id: `synthetic-density-event-${index + 1}`,
    type: "event",
    title: `密度事件 ${String(index + 1).padStart(2, "0")}`,
    status: "committed",
    tags: ["作者确认", `时间：第${index + 1}回`, `地点：区域 ${index % 7 + 1}`],
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
  for (let index = 1; index < 50; index += 1) relations.push(makeRelation(index, index + 1));
  for (let index = 2; index < 45; index += 6) relations.push(makeRelation(index, index + 5));
  relations.push(makeRelation(18, 28, true));
  return { events, relations };
}
function directionLabel(direction: RelationReadProjectionR0["direction"]) { return direction === "reverse" ? "目标 → 来源" : direction === "both" ? "双向" : direction === "none" ? "未指定方向" : "来源 → 目标"; }
function relationReason(relation: RelationReadProjectionR0) { const source = typeof relation.provenance.sourceRef === "string" ? relation.provenance.sourceRef : ""; return /pi|agent|tianyi/iu.test(source) ? "由天意提出，等待作者确认" : "由作者操作提出，等待作者确认"; }
function evidenceLabel(relation: RelationReadProjectionR0) { return relation.evidenceWarnings.length ? String(relation.evidenceWarnings.length) + " 条证据仍需核验。" : relation.evidenceRefs.length ? "已有可追溯的关系证据。" : "当前未附加额外证据。"; }
function layoutKey(projectId: string) { return "tianyan.event-graph-layout/v2:" + projectId; }
function readLayout(projectId: string): Layout { try { const value = window.localStorage.getItem(layoutKey(projectId)); const parsed = value ? JSON.parse(value) as Partial<Layout> : null; if (parsed?.version === "tianyan-event-graph-layout/v2" && parsed.positions && typeof parsed.positions === "object") return { version: parsed.version, positions: parsed.positions as Layout["positions"] }; } catch {} return { version: "tianyan-event-graph-layout/v2", positions: {} }; }
function writeLayout(projectId: string, positions: Layout["positions"]) { try { window.localStorage.setItem(layoutKey(projectId), JSON.stringify({ version: "tianyan-event-graph-layout/v2", positions } satisfies Layout)); } catch {} }
