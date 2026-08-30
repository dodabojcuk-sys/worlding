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
import { eventLineEventMetadata, eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

type Selection =
  | { kind: "node"; id: string }
  | { kind: "relation"; id: string }
  | { kind: "remote"; direction: "past" | "future"; count: number }
  | null;
type NodeData = {
  title: string; time: string; location: string; status: string; focused: boolean; selected: boolean;
  remote?: boolean; direction?: "past" | "future"; count?: number;
};
type Layout = { version: "tianyan-event-graph-layout/v2"; positions: Record<string, { x: number; y: number }> };
const nodeTypes = { event: EventGraphNode };

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
  onCreateEvent?(): void;
  onOpenTianyi?(eventId?: string): void;
}) {
  const [view, setView] = useState<"global" | "focus">("global");
  const [focusId, setFocusId] = useState<string | null>(props.selectedEventId);
  const [depth, setDepth] = useState(1);
  const [selection, setSelection] = useState<Selection>(props.selectedEventId ? { kind: "node", id: props.selectedEventId } : null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const globalViewport = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const layout = useMemo(() => readLayout(props.projectId), [props.projectId, layoutRevision]);
  const graph = useMemo(() => deriveGraph(props.events, props.relations, view, focusId, depth, layout.positions, selection), [depth, focusId, layout.positions, props.events, props.relations, selection, view]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges);

  useEffect(() => { setNodes(graph.nodes); setEdges(graph.edges); }, [graph.edges, graph.nodes, setEdges, setNodes]);
  useEffect(() => {
    if (props.selectedEventId) setSelection((current) => current?.kind === "relation" ? current : { kind: "node", id: props.selectedEventId! });
  }, [props.selectedEventId]);
  useEffect(() => {
    if (!flow || !graph.nodes.length) return;
    const frame = window.requestAnimationFrame(() => {
      if (view === "global" && globalViewport.current) void flow.setViewport(globalViewport.current, { duration: 140 });
      else void flow.fitView({ padding: view === "focus" ? 0.27 : 0.16, duration: 160, maxZoom: 1.05 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flow, graph.nodes.length, view]);

  const persistLayout = useCallback(() => {
    const positions = Object.fromEntries(nodes.filter((node) => !node.id.startsWith("projection.remote")).map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]));
    writeLayout(props.projectId, positions);
  }, [nodes, props.projectId]);
  const focus = (eventId: string) => {
    if (view === "global") globalViewport.current = flow?.getViewport() ?? null;
    setFocusId(eventId); setDepth(1); setView("focus"); setSelection({ kind: "node", id: eventId }); props.onSelectEvent(eventId);
  };
  const selectNode = (eventId: string) => { setSelection({ kind: "node", id: eventId }); setInspectorOpen(true); props.onSelectEvent(eventId); };
  const returnGlobal = () => { setView("global"); setSelection(focusId ? { kind: "node", id: focusId } : null); };
  const connect = async (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    if (!props.onCreateRelation) { setNotice("关系候选入口不可用；没有写入正式关系。"); return; }
    try { await props.onCreateRelation({ sourceEventId: connection.source, targetEventId: connection.target }); setNotice("关系候选已进入待确认，尚未写入正式 Relation。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "关系候选未能创建；没有写入正式 Relation。"); }
  };
  const act = async (relation: RelationReadProjectionR0, kind: "confirm" | "update" | "approve-modified" | "reject") => {
    const handler = kind === "confirm" ? props.onConfirmRelation : kind === "update" ? props.onUpdateRelation : kind === "approve-modified" ? props.onApproveModifiedRelation : props.onRejectRelation;
    if (!handler) { setNotice("该作者操作当前不可用；没有写入正式关系。"); return; }
    setBusy(relation.relationId);
    try {
      await handler(relation);
      setNotice(kind === "confirm" || kind === "approve-modified" ? "已由既有 Relation owner 确认并保存。" : kind === "reject" ? "候选已拒绝，未写入正式 Relation。" : "候选已更新，请再次确认。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "作者操作失败；没有写入正式 Relation。"); }
    finally { setBusy(null); }
  };
  const currentEvent = selection?.kind === "node" ? props.events.find((event) => event.id === selection.id) ?? null : null;
  const currentRelation = selection?.kind === "relation" ? props.relations.find((relation) => relation.relationId === selection.id) ?? null : null;
  const remote = selection?.kind === "remote" ? selection : null;
  const candidateCount = props.relations.filter((relation) => relation.reviewState === "candidate").length;

  return <section className={"event-graph-workspace " + (inspectorOpen ? "has-inspector" : "")} aria-label="事件关系工作区" data-event-graph-owner="projection" data-graph-view={view}>
    <header className="event-graph-commandbar">
      <button type="button" className="event-graph-directory-toggle" aria-label={railOpen ? "收起事件目录" : "展开事件目录"} aria-pressed={railOpen} onClick={() => setRailOpen((value) => !value)}>{railOpen ? <PanelLeftClose /> : <Network />}</button>
      <div className="event-graph-view-switch">
        <button type="button" className={view === "global" ? "is-active" : ""} aria-pressed={view === "global"} onClick={returnGlobal}><Network />关系图</button>
        <button type="button" className={view === "focus" ? "is-active" : ""} aria-pressed={view === "focus"} onClick={() => focusId ? setView("focus") : setNotice("请先选择一个事件作为焦点。")}><Focus />焦点关系</button>
        <button type="button" onClick={() => props.onCreateEvent?.() ?? setNotice("新建事件仍使用既有作者创建链；本图不会写入事实。")}><Plus />新增事件</button>
      </div>
      <div className="event-graph-command-actions">
        {view === "focus" ? <button type="button" onClick={returnGlobal}><ArrowLeft />返回全局</button> : null}
        {view === "focus" ? <button type="button" onClick={() => setDepth((value) => Math.min(value + 1, 3))}><Layers3 />展开一层</button> : null}
        <button type="button" onClick={() => { writeLayout(props.projectId, {}); setLayoutRevision((value) => value + 1); setNotice("已恢复自动布局；本机手动位置已清除。"); }}><RefreshCw />自动布局</button>
        <button type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen((value) => !value)}><Filter />筛选</button>
        <button type="button" aria-label="适应画布" onClick={() => void flow?.fitView({ padding: 0.16, duration: 160, maxZoom: 1.05 })}><Maximize2 /></button>
        <button type="button" aria-label={inspectorOpen ? "收起检查器" : "展开检查器"} aria-pressed={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? <PanelRightClose /> : <ChevronLeft />}</button>
      </div>
    </header>
    {filterOpen ? <div className="event-graph-filter-row" role="status"><Filter /><span>当前展示全部正式事件、待确认关系与远端投影；筛选只改变本机观察范围。</span><button type="button" onClick={() => setFilterOpen(false)}>完成</button></div> : null}
    {notice ? <p className="event-graph-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X /></button></p> : null}
    <div className="event-graph-main">
      <aside className={"event-graph-local-rail " + (railOpen ? "is-open" : "")} aria-label="事件图局部目录">
        <button type="button" className="is-active"><Network /><span>关系图</span></button>
        <button type="button" onClick={() => props.onOpenStorySpine?.()}><Layers3 /><span>故事脊柱</span></button>
        <button type="button" onClick={() => props.onCreateEvent?.() ?? setNotice("新建事件使用既有作者创建链；本图不写入 Event。")}><Plus /><span>新增事件</span></button>
        <button type="button" onClick={() => { const relation = props.relations.find((item) => item.reviewState === "candidate"); if (relation) { setSelection({ kind: "relation", id: relation.relationId }); setInspectorOpen(true); } else setNotice("当前没有待确认关系。"); }}><CircleDot /><span>待确认 {candidateCount}</span></button>
      </aside>
      <div className="event-graph-flow" onPointerUp={persistLayout}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect}
          onNodeClick={(_, node) => {
            if (node.id.startsWith("projection.remote")) {
              setSelection({ kind: "remote", direction: node.data.direction ?? "future", count: node.data.count ?? 0 }); setInspectorOpen(true);
            } else selectNode(node.id);
          }}
          onNodeDoubleClick={(_, node) => { if (!node.id.startsWith("projection.remote")) focus(node.id); }}
          onEdgeClick={(_, edge) => { setSelection({ kind: "relation", id: edge.id }); setInspectorOpen(true); }}
          onPaneClick={() => { setSelection(null); props.onClearSelection(); }}
          onInit={setFlow} fitView minZoom={0.25} maxZoom={1.8}
          nodesConnectable={Boolean(props.onCreateRelation)}
          connectionLineStyle={{ stroke: "var(--color-accent)", strokeWidth: 1.5 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="rgba(20, 125, 120, 0.13)" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(node) => node.data?.remote ? "#77a6a1" : "#147d78"} />
        </ReactFlow>
        <GraphLegend />
      </div>
      {inspectorOpen ? <GraphInspector
        event={currentEvent} relation={currentRelation} remote={remote} events={props.events} relations={props.relations} busy={busy}
        onClose={() => setInspectorOpen(false)} onFocus={focus} onOpenTianyi={props.onOpenTianyi}
        onConfirm={(relation) => void act(relation, "confirm")} onUpdate={(relation) => void act(relation, "update")} onApproveModified={(relation) => void act(relation, "approve-modified")}
        onReject={(relation) => void act(relation, "reject")} onDefer={() => setNotice("候选已保留在待确认中，尚未写入正式 Relation。")}
        onExpand={() => { setDepth((value) => Math.min(value + 1, 3)); setSelection(focusId ? { kind: "node", id: focusId } : null); }}
      /> : null}
    </div>
  </section>;
}

function EventGraphNode(props: NodeProps<Node<NodeData>>) {
  const label = props.data.remote ? (props.data.direction === "past" ? "远处前因 " : "远处后果 ") + String(props.data.count ?? 0) : props.data.status;
  return <article className={"event-graph-node " + (props.data.focused ? "is-focused " : "") + (props.data.selected ? "is-selected " : "") + (props.data.remote ? "is-remote" : "")}>
    {!props.data.remote ? <><Handle type="target" position={Position.Top} /><Handle type="source" position={Position.Right} /><Handle type="source" position={Position.Bottom} /><Handle type="target" position={Position.Left} /></> : <><Handle type="target" position={Position.Left} isConnectable={false} /><Handle type="source" position={Position.Right} isConnectable={false} /></>}
    <small>{label}</small><strong>{props.data.title}</strong><span><Clock3 />{props.data.time}</span>
    <span>{props.data.remote ? <Expand /> : <MapPin />}{props.data.remote ? "点击查看投影范围" : props.data.location}</span>
  </article>;
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
      {tab === "story" ? <TextBlock title="节点剧情" text="当前工作区只读展示已确认事件的语义投影；完整正文和编辑仍沿用既有事件 owner。" /> : null}
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
    <InspectorHeader title={pending ? "关系候选" : "正式关系"} subtitle={pending ? "尚未写入正式 Relation" : "已由作者确认"} onClose={props.onClose} />
    <div className="event-graph-inspector-body relation-inspector">
      <section className={pending ? "event-graph-relation-status is-candidate" : "event-graph-relation-status is-confirmed"}>{pending ? "待确认 · 候选关系" : "已确认 · 正式关系"}</section>
      <Facts facts={[[<ArrowRight />, "来源事件", source], [<ArrowRight />, "目标事件", target], [<Link2 />, "关系类型", props.relation.currentTypeLabel ?? props.relation.relationLabelSnapshot], [<ArrowRight />, "方向", directionLabel(props.relation.direction)], [<FileText />, "说明", relationReason(props.relation)]]} />
      <TextBlock title="证据或来源" text={evidenceLabel(props.relation)} />
      {pending ? <><TextBlock title="影响范围" text={"确认后将在“" + source + "”与“" + target + "”之间建立一条正式关系；作者确认前，正式 Relation 不会增加。"} /><label className="event-graph-candidate-editor">修改方向<select aria-label="候选关系方向" value={direction} disabled={isBusy} onChange={(event) => setDirection(event.target.value as RelationReadProjectionR0["direction"])}><option value="forward">来源 → 目标</option><option value="reverse">目标 → 来源</option><option value="both">双向</option><option value="none">未指定方向</option></select></label><footer className="event-graph-candidate-actions"><button type="button" className="primary-action" disabled={isBusy} onClick={() => props.onConfirm(props.relation)}><Check />通过并保存</button><button type="button" disabled={isBusy} onClick={() => props.onApproveModified(editedRelation)}><Eye />修改后通过</button><button type="button" className="danger-action" disabled={isBusy} onClick={() => props.onReject(props.relation)}><X />拒绝</button><button type="button" disabled={isBusy} onClick={props.onDefer}>暂不处理</button></footer></> : null}
    </div>
  </aside>;
}

function InspectorHeader(props: { title: string; subtitle: string; onClose(): void; extra?: ReactNode }) {
  return <header className="event-graph-inspector-header"><div><h2>{props.title}</h2><p>{props.subtitle}</p></div><div>{props.extra}<button type="button" aria-label="关闭检查器" onClick={props.onClose}><X /></button></div></header>;
}
function Tab(props: { active: boolean; children: ReactNode; onClick(): void }) { return <button type="button" className={props.active ? "is-active" : ""} aria-pressed={props.active} onClick={props.onClick}>{props.children}</button>; }
function Facts(props: { facts: Array<[ReactNode, string, string]> }) { return <dl className="event-graph-facts">{props.facts.map(([icon, label, value]) => <div key={label}><dt>{icon}{label}</dt><dd>{value}</dd></div>)}</dl>; }
function TextBlock(props: { title: string; text: string }) { return <section className="event-graph-text-block"><h3>{props.title}</h3><p>{props.text}</p></section>; }

function deriveGraph(events: readonly EventLineEventSummary[], relations: readonly RelationReadProjectionR0[], view: "global" | "focus", focusId: string | null, depth: number, positions: Layout["positions"], selection: Selection): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const ids = new Set(events.map((event) => event.id));
  const validFocus = focusId && ids.has(focusId) ? focusId : null;
  const active = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && !relation.archived && relation.reviewState !== "rejected");
  const visible = view === "global" || !validFocus ? ids : focusIds(validFocus, active, depth);
  const remote = view === "focus" && validFocus ? remoteIds(validFocus, ids, visible, active) : { past: new Set<string>(), future: new Set<string>() };
  const nodes: Node<NodeData>[] = events.filter((event) => visible.has(event.id)).map((event, index) => {
    const metadata = eventLineEventMetadata(event);
    const semantic = eventLineSemanticNode(event);
    return { id: event.id, type: "event", position: positions[event.id] ?? (view === "focus" && validFocus ? focusPosition(index, event.id, validFocus, active) : gridPosition(index, events.length)), data: { title: event.title, time: semantic.time.label, location: metadata.locationLabels[0] ?? "地点未提供", status: semantic.status === "confirmed" ? "已确认" : "待审", focused: event.id === validFocus, selected: selection?.kind === "node" && selection.id === event.id } } satisfies Node<NodeData>;
  });
  if (remote.past.size) nodes.push(remoteNode("past", remote.past.size, selection));
  if (remote.future.size) nodes.push(remoteNode("future", remote.future.size, selection));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = active.filter((relation) => nodeIds.has(relation.sourceObjectId) && nodeIds.has(relation.targetObjectId)).map((relation) => relationEdge(relation, selection));
  if (validFocus && remote.past.size) edges.push(remoteEdge("past", validFocus));
  if (validFocus && remote.future.size) edges.push(remoteEdge("future", validFocus));
  return { nodes, edges };
}

function relationEdge(relation: RelationReadProjectionR0, selection: Selection): Edge {
  const pending = relation.reviewState === "candidate";
  const selected = selection?.kind === "relation" && selection.id === relation.relationId;
  return { id: relation.relationId, source: relation.sourceObjectId, target: relation.targetObjectId, type: "smoothstep", label: pending ? "待确认 · " + (relation.currentTypeLabel ?? relation.relationLabelSnapshot) : relation.currentTypeLabel ?? relation.relationLabelSnapshot, markerEnd: relation.direction === "none" ? undefined : { type: MarkerType.ArrowClosed }, style: pending ? { stroke: "#d9911d", strokeWidth: selected ? 2.5 : 1.7, strokeDasharray: "7 5" } : { stroke: selected ? "#147d78" : "#1c3448", strokeWidth: selected ? 2.5 : 1.7 }, labelStyle: { fill: pending ? "#a75c00" : "#314250", fontSize: 11, fontWeight: selected ? 700 : 600 }, labelBgStyle: { fill: "#fbfaf6", fillOpacity: 0.96 }, labelBgPadding: [4, 3] };
}
function remoteNode(direction: "past" | "future", count: number, selection: Selection): Node<NodeData> {
  const id = "projection.remote." + direction;
  return { id, type: "event", position: direction === "past" ? { x: 80, y: 74 } : { x: 960, y: 500 }, data: { title: direction === "past" ? "远处前因" : "远处后果", time: direction === "past" ? "更早之前" : "后续范围", location: "", status: "远端投影", focused: false, selected: selection?.kind === "remote" && selection.direction === direction, remote: true, direction, count } };
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
function gridPosition(index: number, total: number) { const columns = total > 24 ? 6 : total > 10 ? 5 : 4; return { x: 90 + (index % columns) * 265, y: 170 + Math.floor(index / columns) * 190 }; }
function focusPosition(index: number, eventId: string, focusId: string, relations: readonly RelationReadProjectionR0[]) { if (eventId === focusId) return { x: 550, y: 290 }; return { x: relations.some((relation) => relation.sourceObjectId === eventId && relation.targetObjectId === focusId) ? 170 : 930, y: 110 + index * 155 }; }
function directionLabel(direction: RelationReadProjectionR0["direction"]) { return direction === "reverse" ? "目标 → 来源" : direction === "both" ? "双向" : direction === "none" ? "未指定方向" : "来源 → 目标"; }
function relationReason(relation: RelationReadProjectionR0) { const source = typeof relation.provenance.sourceRef === "string" ? relation.provenance.sourceRef : ""; return /pi|agent|tianyi/iu.test(source) ? "由天意提出，等待作者确认" : "由作者操作提出，等待作者确认"; }
function evidenceLabel(relation: RelationReadProjectionR0) { return relation.evidenceWarnings.length ? String(relation.evidenceWarnings.length) + " 条证据仍需核验。" : relation.evidenceRefs.length ? "已有关系证据，由既有 Relation owner 投影。" : "当前未附加额外证据。"; }
function layoutKey(projectId: string) { return "tianyan.event-graph-layout/v2:" + projectId; }
function readLayout(projectId: string): Layout { try { const value = window.localStorage.getItem(layoutKey(projectId)); const parsed = value ? JSON.parse(value) as Partial<Layout> : null; if (parsed?.version === "tianyan-event-graph-layout/v2" && parsed.positions && typeof parsed.positions === "object") return { version: parsed.version, positions: parsed.positions as Layout["positions"] }; } catch {} return { version: "tianyan-event-graph-layout/v2", positions: {} }; }
function writeLayout(projectId: string, positions: Layout["positions"]) { try { window.localStorage.setItem(layoutKey(projectId), JSON.stringify({ version: "tianyan-event-graph-layout/v2", positions } satisfies Layout)); } catch {} }
