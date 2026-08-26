import {
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Filter,
  Focus,
  GitMerge,
  Hand,
  Layers3,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type {
  AddPlanningEventResult,
  PlanningEventTimelineResult,
  TimelineDocument,
  TimelineEntry,
  TimelineTrackView,
  TimelineValidationResult,
  WorldObjectSummary
} from "../lib/localTransport";
import {
  createStoryStudioEventReference,
  type StoryStudioEventReference
} from "../../../../src/storyContracts/storyStudioEventReference";
import {
  buildTimelineProjection,
  createTimelineDependency,
  dependencyOrderWarning,
  incidentTimelineDependencies,
  moveTimelineEntry,
  removeTimelineDependency,
  removeTimelineEntryWithDependencies,
  reorderTimelineEntry,
  type TimelineProjectedEntry
} from "../lib/timelineProjection";
import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";

type TimelineTool = "select" | "pan" | "planning" | "dependency" | "tracks" | "filter";

export function TimelineEditor(props: {
  projectId: string;
  document: TimelineDocument;
  objects: WorldObjectSummary[];
  selection: WorkspaceSelection;
  canUndo: boolean;
  canRedo: boolean;
  storedOperationReady: boolean;
  onChange(document: TimelineDocument): void;
  onUndo(): void;
  onRedo(): void;
  onSelectObject(object: WorldObjectSummary): void;
  onOpenObject(object: WorldObjectSummary): void;
  onCreatePlanningEvent(document: TimelineDocument, title: string, body: string): Promise<PlanningEventTimelineResult>;
  onAddExistingPlanningEvent(document: TimelineDocument, planningEventId: string): Promise<AddPlanningEventResult>;
  onValidate(document: TimelineDocument): Promise<TimelineValidationResult>;
  onReviewPlanningEvent(planningEventId: string): Promise<void>;
  onAbandonPlanningEvent(planningEventId: string): Promise<{ conflict: boolean }>;
  candidateObjectIds: string[];
  onGiveToTianyi(reference: StoryStudioEventReference): void;
}) {
  const objectsById = useMemo(() => new Map(props.objects.map((object) => [object.id, object])), [props.objects]);
  const filterObjects = useMemo(() => props.objects.filter((object) => object.type === "character" || object.type === "location"), [props.objects]);
  const [tool, setTool] = useState<TimelineTool>("select");
  const [searchQuery, setSearchQuery] = useState("");
  const [existingEventId, setExistingEventId] = useState("");
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ eventId: string; placement: "before" | "after" } | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planBody, setPlanBody] = useState("");
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningResult, setPlanningResult] = useState<PlanningEventTimelineResult | null>(null);
  const [planningError, setPlanningError] = useState("");
  const [dependencyDependentId, setDependencyDependentId] = useState("");
  const [prerequisiteEventId, setPrerequisiteEventId] = useState("");
  const [dependencyError, setDependencyError] = useState("");
  const [dependencyBusy, setDependencyBusy] = useState(false);
  const [pendingDeleteEventId, setPendingDeleteEventId] = useState<string | null>(null);
  const [pendingAbandonEventId, setPendingAbandonEventId] = useState<string | null>(null);
  const [planningActionBusy, setPlanningActionBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const projection = useMemo(
    () => buildTimelineProjection(props.document, props.objects, searchQuery),
    [props.document, props.objects, searchQuery]
  );
  const availableCanon = useMemo(() => props.objects.filter((object) => object.type === "event" && object.status === "committed" && object.tags.includes("作者确认") && !props.document.content.entries.some((entry) => entry.eventId === object.id)), [props.objects, props.document.content.entries]);
  const orderedEntries = useMemo(
    () => [...props.document.content.entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    [props.document.content.entries]
  );
  const activeDependentId = dependencyDependentId || (props.selection.objectId && props.document.content.entries.some((entry) => entry.eventId === props.selection.objectId) ? props.selection.objectId : orderedEntries[0]?.eventId || "");

  function setTimelineContent(content: Partial<TimelineDocument["content"]>) {
    props.onChange({ ...props.document, content: { ...props.document.content, ...content } });
  }

  function chooseTool(next: TimelineTool) {
    setTool((current) => current === next && (next === "planning" || next === "dependency" || next === "tracks" || next === "filter") ? "select" : next);
  }

  function toggleTrack(kind: "canon" | "planning" | "character" | "location", refId: string | null, enabled: boolean) {
    const existing = props.document.content.trackViews.find((track) => track.kind === kind && track.refId === refId);
    if (existing) {
      setTimelineContent({
        trackViews: props.document.content.trackViews.map((track) => track.id === existing.id ? { ...track, visible: enabled } : track)
      });
      return;
    }
    if (!enabled) return;
    const track: TimelineTrackView = {
      id: nextId(`track.${kind}`, props.document.content.trackViews.map((item) => item.id)),
      kind,
      refId,
      order: props.document.content.trackViews.length,
      visible: true,
      collapsed: false
    };
    setTimelineContent({ trackViews: [...props.document.content.trackViews, track] });
  }

  function addCustomTrack() {
    const index = props.document.content.lanes.length + 1;
    const laneId = nextId("lane", props.document.content.lanes.map((lane) => lane.id));
    const lane = { id: laneId, title: `轨道 ${index}`, color: laneColor(index), order: props.document.content.lanes.length };
    const track: TimelineTrackView = {
      id: nextId("track.custom", props.document.content.trackViews.map((item) => item.id)),
      kind: "custom",
      refId: laneId,
      order: props.document.content.trackViews.length,
      visible: true,
      collapsed: false
    };
    setTimelineContent({ lanes: [...props.document.content.lanes, lane], trackViews: [...props.document.content.trackViews, track] });
  }

  function toggleTrackCollapsed(trackId: string) {
    setTimelineContent({ trackViews: props.document.content.trackViews.map((track) => track.id === trackId ? { ...track, collapsed: !track.collapsed } : track) });
  }

  function focusTrack(trackId: string) {
    setTimelineContent({ viewport: { ...props.document.content.viewport, focusedTrackId: props.document.content.viewport.focusedTrackId === trackId ? null : trackId } });
  }

  function addExistingCanon(eventId = existingEventId) {
    if (!eventId) return;
    const entry: TimelineEntry = {
      id: nextId("entry", props.document.content.entries.map((item) => item.id)),
      eventId,
      laneId: props.document.content.lanes[0]?.id || "lane.canon",
      order: props.document.content.entries.length
    };
    setTimelineContent({ entries: [...props.document.content.entries, entry] });
    setExistingEventId("");
  }

  function assignCustomLane(entryId: string, laneId: string) {
    setTimelineContent({ entries: props.document.content.entries.map((entry) => entry.id === entryId ? { ...entry, laneId } : entry) });
  }

  function moveEntry(eventId: string, delta: -1 | 1) {
    props.onChange(moveTimelineEntry(props.document, eventId, delta));
  }

  async function addDependency() {
    if (!activeDependentId || !prerequisiteEventId) return;
    if (activeDependentId === prerequisiteEventId) {
      setDependencyError("一个事件不能依赖它自己。");
      return;
    }
    if (props.document.content.dependencies.some((dependency) => dependency.fromEventId === prerequisiteEventId && dependency.toEventId === activeDependentId)) {
      setDependencyError("这条前置依赖已经存在。");
      return;
    }
    setDependencyBusy(true);
    try {
      const candidate = createTimelineDependency(props.document, prerequisiteEventId, activeDependentId);
      const validation = await props.onValidate(candidate);
      if (!validation.valid) {
        setDependencyError(productDependencyError(validation.reason));
        return;
      }
      props.onChange(candidate);
      setDependencyError("");
      setPrerequisiteEventId("");
    } catch (error) {
      setDependencyError(error instanceof Error ? error.message : "无法校验这条依赖。");
    } finally {
      setDependencyBusy(false);
    }
  }

  function requestRemoveEntry(eventId: string) {
    if (incidentTimelineDependencies(props.document, eventId).length > 0) {
      setPendingDeleteEventId(eventId);
      return;
    }
    props.onChange(removeTimelineEntryWithDependencies(props.document, eventId));
  }

  function finishDrop(targetEventId: string) {
    if (!draggedEventId || !dropTarget || targetEventId !== dropTarget.eventId) return;
    props.onChange(reorderTimelineEntry(props.document, draggedEventId, targetEventId, dropTarget.placement));
    setDraggedEventId(null);
    setDropTarget(null);
  }

  async function createPlan() {
    if (!planTitle.trim() || !props.storedOperationReady) return;
    setPlanningBusy(true);
    setPlanningError("");
    try {
      const result = await props.onCreatePlanningEvent(props.document, planTitle.trim(), planBody.trim());
      setPlanningResult(result);
      if (result.timelineEntryAdded) {
        setPlanTitle("");
        setPlanBody("");
      }
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : "无法保存规划事件。");
    } finally {
      setPlanningBusy(false);
    }
  }

  async function recoverPlanningEvent() {
    if (!planningResult?.recoveryAction) return;
    setPlanningBusy(true);
    setPlanningError("");
    try {
      const result = await props.onAddExistingPlanningEvent(props.document, planningResult.planningEventId);
      if (result.timelineEntryAdded) setPlanningResult(null);
      else setPlanningError("时间线仍有外部修改，请重新读取后再试。");
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : "无法把规划事件加入时间线。");
    } finally {
      setPlanningBusy(false);
    }
  }

  async function openPlanningReview(eventId: string) {
    setPlanningActionBusy(true);
    setPlanningError("");
    try {
      await props.onReviewPlanningEvent(eventId);
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : "无法打开正史评审。");
    } finally {
      setPlanningActionBusy(false);
    }
  }

  async function abandonPlanningEvent() {
    if (!pendingAbandonEventId) return;
    setPlanningActionBusy(true);
    setPlanningError("");
    try {
      const result = await props.onAbandonPlanningEvent(pendingAbandonEventId);
      if (result.conflict) setPlanningError("规划事件已在磁盘中改变，请重新读取后再试。");
      else setPendingAbandonEventId(null);
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : "无法放弃这项规划。");
    } finally {
      setPlanningActionBusy(false);
    }
  }

  function panPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (tool !== "pan" || !scrollRef.current) return;
    panRef.current = { x: event.clientX, y: event.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function panPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x);
    scrollRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y);
  }

  return <section className={`timeline-editor density-${props.document.content.viewport.density} ${props.document.content.viewport.focusedTrackId ? "has-focused-track" : ""}`} data-testid="timeline-editor" onKeyDown={(event) => {
    if (event.key === "Escape") setTool("select");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? props.onRedo() : props.onUndo();
    }
  }}>
    <header className="timeline-toolbar" aria-label="时间线工具">
      <div className="timeline-tool-group" aria-label="作者工具">
        <ToolButton label="选择" active={tool === "select"} onClick={() => chooseTool("select")}><MousePointer2 /></ToolButton>
        <ToolButton label="平移" active={tool === "pan"} onClick={() => chooseTool("pan")}><Hand /></ToolButton>
        <ToolButton label="添加规划事件" active={tool === "planning"} disabled={!props.storedOperationReady} onClick={() => chooseTool("planning")}><CalendarPlus /></ToolButton>
        <ToolButton label="添加前置事件" active={tool === "dependency"} disabled={props.document.content.entries.length < 2} onClick={() => chooseTool("dependency")}><GitMerge /></ToolButton>
        <ToolButton label="轨道" active={tool === "tracks"} onClick={() => chooseTool("tracks")}><Layers3 /></ToolButton>
        <ToolButton label="筛选" active={tool === "filter"} onClick={() => chooseTool("filter")}><Filter /></ToolButton>
      </div>
      <label className="timeline-search"><Search /><input aria-label="搜索时间线事件" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜索事件、标签或引用对象" /></label>
      <div className="timeline-view-tools" aria-label="视图工具">
        <ToolButton label={props.document.content.viewport.density === "compact" ? "使用舒适密度" : "使用紧凑密度"} active={props.document.content.viewport.density === "compact"} onClick={() => setTimelineContent({ viewport: { ...props.document.content.viewport, density: props.document.content.viewport.density === "compact" ? "comfortable" : "compact" } })}><Minus /></ToolButton>
        <ToolButton label="缩小" onClick={() => props.onChange({ ...props.document, viewport: { ...props.document.viewport, zoom: Math.max(.6, props.document.viewport.zoom - .1) } })}><ZoomOut /></ToolButton>
        <ToolButton label="放大" onClick={() => props.onChange({ ...props.document, viewport: { ...props.document.viewport, zoom: Math.min(1.6, props.document.viewport.zoom + .1) } })}><ZoomIn /></ToolButton>
        <ToolButton label="适应时间线" onClick={() => props.onChange({ ...props.document, viewport: { x: 0, y: 0, zoom: 1 } })}><Focus /></ToolButton>
        <ToolButton label="撤销" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 /></ToolButton>
        <ToolButton label="重做" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 /></ToolButton>
      </div>
    </header>

    {tool === "planning" && <aside className="timeline-popover timeline-planning-popover" aria-label="添加规划事件">
      <header><div><small>作者规划</small><strong>添加一个可能发生的事件</strong></div><button type="button" aria-label="关闭规划事件" onClick={() => setTool("select")}><Minus /></button></header>
      <label>标题<input aria-label="规划事件标题" value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} maxLength={100} /></label>
      <label>规划说明<textarea aria-label="规划事件说明" value={planBody} onChange={(event) => setPlanBody(event.target.value)} placeholder="写下这件事可能如何发生。内容保存在事件 Markdown 中。" /></label>
      {!props.storedOperationReady && <p className="timeline-inline-warning">请先保存当前时间线修改，再创建规划事件。</p>}
      {planningResult?.timelineEntryAdded && <p className="timeline-inline-success">规划事件已保存，并加入当前时间线。</p>}
      {planningResult?.timelineConflict && <div className="timeline-partial-result"><strong>规划事件已保存</strong><span>时间线在此期间被外部修改，事件尚未加入当前时间线。</span><button type="button" disabled={planningBusy} onClick={() => void recoverPlanningEvent()}><RotateCcw />重新加载后加入此时间线</button></div>}
      {planningError && <p className="timeline-inline-warning" role="alert">{planningError}</p>}
      <button type="button" className="primary-action" disabled={!planTitle.trim() || planningBusy || !props.storedOperationReady} onClick={() => void createPlan()}>{planningBusy ? "正在保存" : "保存规划事件"}</button>
    </aside>}

    {tool === "tracks" && <TrackSelector document={props.document} objects={filterObjects} onToggle={toggleTrack} onAddCustom={addCustomTrack} onClose={() => setTool("select")} />}
    {tool === "filter" && <FilterPanel document={props.document} objects={filterObjects} onChange={setTimelineContent} onClose={() => setTool("select")} />}
    {tool === "dependency" && <aside className="timeline-popover timeline-dependency-picker" aria-label="添加前置事件">
      <header><div><small>事件依赖</small><strong>添加一个前置事件</strong></div><button type="button" aria-label="关闭依赖选择器" onClick={() => setTool("select")}><Minus /></button></header>
      <label>当前事件<select aria-label="依赖事件" value={activeDependentId} onChange={(event) => { setDependencyDependentId(event.target.value); setDependencyError(""); }}><option value="">选择当前事件</option>{orderedEntries.map((entry) => <option value={entry.eventId} key={entry.id}>{objectsById.get(entry.eventId)?.title || "事件已缺失"}</option>)}</select></label>
      <label>前置事件<select aria-label="前置事件" value={prerequisiteEventId} onChange={(event) => { setPrerequisiteEventId(event.target.value); setDependencyError(""); }}><option value="">选择必须先发生的事件</option>{orderedEntries.filter((entry) => entry.eventId !== activeDependentId).map((entry) => <option value={entry.eventId} key={entry.id}>{objectsById.get(entry.eventId)?.title || "事件已缺失"}</option>)}</select></label>
      <p className="timeline-dependency-copy">前置事件必须先发生。最终合法性在保存时由世界文档仓库校验。</p>
      {dependencyError && <p className="timeline-inline-warning" role="alert">{dependencyError}</p>}
      <button type="button" className="primary-action" disabled={!activeDependentId || !prerequisiteEventId || dependencyBusy} onClick={() => void addDependency()}><GitMerge />{dependencyBusy ? "正在校验" : "添加前置事件"}</button>
    </aside>}
    {pendingDeleteEventId && <aside className="timeline-popover timeline-delete-confirm" role="dialog" aria-label="移除事件和依赖">
      <header><div><small>移除事件</small><strong>{objectsById.get(pendingDeleteEventId)?.title || "失效事件"}</strong></div><button type="button" aria-label="取消移除事件" onClick={() => setPendingDeleteEventId(null)}><Minus /></button></header>
      <p>这个事件连接了 {incidentTimelineDependencies(props.document, pendingDeleteEventId).length} 条依赖。是否同时移除这些依赖并从时间线删除事件？</p>
      <div className="timeline-confirm-actions"><button type="button" className="secondary-action" onClick={() => setPendingDeleteEventId(null)}>取消</button><button type="button" className="primary-action" onClick={() => { props.onChange(removeTimelineEntryWithDependencies(props.document, pendingDeleteEventId)); setPendingDeleteEventId(null); }}>同时移除依赖后删除</button></div>
    </aside>}
    {pendingAbandonEventId && <aside className="timeline-popover timeline-delete-confirm" role="dialog" aria-label="放弃规划事件">
      <header><div><small>规划事件</small><strong>{objectsById.get(pendingAbandonEventId)?.title || "规划事件"}</strong></div><button type="button" aria-label="取消放弃规划" onClick={() => setPendingAbandonEventId(null)}><Minus /></button></header>
      <p>放弃会把事件标记为已放弃，保留 Markdown 正文与历史，不会删除文件或修改当前时间线。</p>
      <div className="timeline-confirm-actions"><button type="button" className="secondary-action" onClick={() => setPendingAbandonEventId(null)}>取消</button><button type="button" className="primary-action" disabled={planningActionBusy} onClick={() => void abandonPlanningEvent()}>{planningActionBusy ? "正在保存" : "确认放弃规划"}</button></div>
    </aside>}

    <div className="timeline-context-strip">
      <span><strong>{props.document.content.entries.length}</strong> 个存储事件</span>
      <span><strong>{projection.projectedCardCount}</strong> 个轨道投影</span>
      <span>标题、人物与地点来自当前 Markdown</span>
      {availableCanon.length > 0 && <div className="timeline-existing-adder"><select aria-label="选择已确认事件" value={existingEventId} onChange={(event) => setExistingEventId(event.target.value)}><option value="">有 {availableCanon.length} 个未加入的正史事件</option>{availableCanon.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}</select><button type="button" disabled={!existingEventId} onClick={() => addExistingCanon()}><Plus />放入时间线</button></div>}
      <button type="button" onClick={addCustomTrack}><Plus />新建轨道</button>
      {searchQuery && <button type="button" onClick={() => setSearchQuery("")}>清除临时搜索</button>}
    </div>

    <div className={`timeline-lanes ${tool === "pan" ? "is-panning" : ""}`} ref={scrollRef} onPointerDown={panPointerDown} onPointerMove={panPointerMove} onPointerUp={() => { panRef.current = null; }}>
      <div className="timeline-scale" style={{ transform: `scale(${props.document.viewport.zoom})`, transformOrigin: "top left" }}>
        <DependencyBand document={props.document} objectsById={objectsById} onRemove={(dependencyId) => props.onChange(removeTimelineDependency(props.document, dependencyId))} />
        {projection.tracks.map((track) => <section className={`timeline-lane track-${track.track.kind} ${props.document.content.viewport.focusedTrackId === track.track.id ? "is-focused" : ""} ${track.track.collapsed ? "is-collapsed" : ""}`} key={track.track.id} style={{ "--lane-color": track.color } as React.CSSProperties} data-track-id={track.track.id}>
          <header><span className="timeline-lane-dot" /><strong>{track.title}</strong><small>{track.missingReference ? "引用对象已缺失" : `${track.entries.length} 个事件`}</small><span className="timeline-track-actions"><button type="button" onClick={() => focusTrack(track.track.id)} aria-label={`聚焦${track.title}`}>{props.document.content.viewport.focusedTrackId === track.track.id ? "取消聚焦" : "聚焦"}</button><button type="button" onClick={() => toggleTrackCollapsed(track.track.id)} aria-label={`${track.track.collapsed ? "展开" : "折叠"}${track.title}`}>{track.track.collapsed ? "展开" : "折叠"}</button></span></header>
          {!track.track.collapsed && <div className="timeline-track">
            {track.entries.map((item) => <TimelineCard
              key={`${track.track.id}:${item.entry.id}`}
              item={item}
              objectsById={objectsById}
              selected={props.selection.objectId === item.entry.eventId}
              candidate={props.candidateObjectIds.includes(item.entry.eventId)}
              index={orderedEntries.findIndex((entry) => entry.id === item.entry.id)}
              total={orderedEntries.length}
              dragged={draggedEventId === item.entry.eventId}
              dropTarget={dropTarget?.eventId === item.entry.eventId ? dropTarget.placement : null}
              onSelect={() => item.event && props.onSelectObject(item.event)}
              onOpen={() => item.event && props.onOpenObject(item.event)}
              onSelectReference={(object) => props.onSelectObject(object)}
              onMove={(delta) => moveEntry(item.entry.eventId, delta)}
              customLanes={props.document.content.lanes.filter((lane) => lane.id !== "lane.canon")}
              onAssignLane={(laneId) => assignCustomLane(item.entry.id, laneId)}
              onRemove={() => requestRemoveEntry(item.entry.eventId)}
              showPlanningActions={track.track.kind === "planning"}
              onReviewPlanning={() => void openPlanningReview(item.entry.eventId)}
              onAbandonPlanning={() => setPendingAbandonEventId(item.entry.eventId)}
              onAddEnteredCanon={() => addExistingCanon(item.enteredCanonEventId || "")}
              enteredCanonInTimeline={Boolean(item.enteredCanonEventId && props.document.content.entries.some((entry) => entry.eventId === item.enteredCanonEventId))}
              onGiveToTianyi={() => {
                if (item.event?.type === "event") {
                  props.onGiveToTianyi(createStoryStudioEventReference({ projectId: props.projectId, event: item.event, requestedUse: "constraint" }));
                }
              }}
              onDragStart={() => setDraggedEventId(item.entry.eventId)}
              onDragOver={(event) => {
                if (!draggedEventId || draggedEventId === item.entry.eventId) return;
                event.preventDefault();
                const box = event.currentTarget.getBoundingClientRect();
                setDropTarget({ eventId: item.entry.eventId, placement: event.clientX < box.left + box.width / 2 ? "before" : "after" });
              }}
              onDrop={() => finishDrop(item.entry.eventId)}
            />)}
            {track.entries.length === 0 && <div className="timeline-empty-lane">{emptyTrackCopy(track.track.kind, projection.entries.length)}</div>}
          </div>}
        </section>)}
        {projection.unprojectedEntries.length > 0 && <section className="timeline-source-state" aria-label="来源状态">
          <header><AlertTriangle /><span><strong>来源状态</strong><small>这些时间线引用仍被保留，但当前 Markdown 不再符合投影条件。</small></span></header>
          <div>{projection.unprojectedEntries.map((item) => <article key={item.entry.id} data-event-id={item.entry.eventId}>
            <span><strong>{item.event?.title || "事件已缺失"}</strong><small>{statusLabel(item.status)}</small></span>
            <div>{item.event && <button type="button" onClick={() => props.onOpenObject(item.event!)}>打开来源卡</button>}<button type="button" onClick={() => requestRemoveEntry(item.entry.eventId)}>从时间线清理</button></div>
          </article>)}</div>
        </section>}
        {projection.tracks.length === 0 && <div className="timeline-workspace-empty"><Layers3 /><strong>没有可见轨道</strong><span>从轨道选择器恢复正史、规划或对象轨。</span></div>}
      </div>
    </div>
  </section>;
}

function TimelineCard(props: {
  item: TimelineProjectedEntry;
  objectsById: Map<string, WorldObjectSummary>;
  selected: boolean;
  candidate: boolean;
  index: number;
  total: number;
  dragged: boolean;
  dropTarget: "before" | "after" | null;
  onSelect(): void;
  onOpen(): void;
  onSelectReference(object: WorldObjectSummary): void;
  onMove(delta: -1 | 1): void;
  customLanes: TimelineDocument["content"]["lanes"];
  onAssignLane(laneId: string): void;
  onRemove(): void;
  showPlanningActions: boolean;
  onReviewPlanning(): void;
  onAbandonPlanning(): void;
  onAddEnteredCanon(): void;
  enteredCanonInTimeline: boolean;
  onGiveToTianyi(): void;
  onDragStart(): void;
  onDragOver(event: React.DragEvent<HTMLElement>): void;
  onDrop(): void;
}) {
  const characters = props.item.characterIds.map((id) => props.objectsById.get(id)?.title || "对象已缺失");
  const locations = props.item.locationIds.map((id) => props.objectsById.get(id)?.title || "对象已缺失");
  const status = statusLabel(props.item.status);
  return <article
    className={`timeline-entry ${props.selected ? "is-selected" : ""} ${props.candidate ? "is-candidate" : ""} ${props.dragged ? "is-dragging" : ""} ${props.dropTarget ? `drop-${props.dropTarget}` : ""}`}
    data-event-id={props.item.entry.eventId}
    data-entry-id={props.item.entry.id}
    draggable={Boolean(props.item.event)}
    onDragStart={props.onDragStart}
    onDragOver={props.onDragOver}
    onDrop={props.onDrop}
  >
    <button type="button" className="timeline-entry-main" onClick={props.onSelect} onDoubleClick={props.onOpen} disabled={!props.item.event}>
      <small>{String(props.item.entry.order + 1).padStart(2, "0")}</small>
      <strong>{props.item.event?.title || "事件已缺失"}</strong>
      <span className={`timeline-status status-${props.item.status}`}>{status}</span>
      <span>{characters.length ? characters.join("、") : "没有人物"} · {locations.length ? locations.join("、") : "地点尚未指定"}</span>
      {props.item.plannedFromEventId && <span>来自规划：{props.objectsById.get(props.item.plannedFromEventId)?.title || "原规划已缺失"}</span>}
      {props.item.enteredCanonEventId && <span className="timeline-canon-link">已进入正史：{props.objectsById.get(props.item.enteredCanonEventId)?.title || "正史事件已创建"}</span>}
      {props.item.dependencyOrderWarning && <span className="timeline-order-warning">依赖顺序需要检查</span>}
    </button>
    {props.item.characterIds.length > 0 && <div className="timeline-reference-chips" aria-label="事件人物">{props.item.characterIds.map((id) => {
      const object = props.objectsById.get(id);
      return <button type="button" disabled={!object} onClick={() => object && props.onSelectReference(object)} key={id}>{object?.title || "对象已缺失"}</button>;
    })}</div>}
    <div className="timeline-entry-actions">
      <button type="button" onClick={() => props.onMove(-1)} disabled={props.index <= 0} aria-label="向前移动事件" title="Move before"><ChevronLeft /></button>
      <button type="button" onClick={() => props.onMove(1)} disabled={props.index < 0 || props.index >= props.total - 1} aria-label="向后移动事件" title="Move after"><ChevronRight /></button>
      <button type="button" onClick={props.onOpen} disabled={!props.item.event} aria-label="打开事件卡" title="打开事件卡"><BookOpen /></button>
      <button type="button" onClick={props.onGiveToTianyi} aria-label="把时间线事件交给天意" title="交给天意"><Sparkles /></button>
      {props.showPlanningActions && props.item.status === "planned" && !props.item.enteredCanonEventId && <button type="button" onClick={props.onReviewPlanning} disabled={!props.item.event} aria-label="送入正史评审" title="送入正史评审"><GitMerge /></button>}
      {props.showPlanningActions && props.item.enteredCanonEventId && !props.enteredCanonInTimeline && <button type="button" onClick={props.onAddEnteredCanon} aria-label="加入此时间线" title="加入此时间线"><Plus /></button>}
      {props.showPlanningActions && props.item.status === "planned" && <button type="button" onClick={props.onAbandonPlanning} disabled={!props.item.event} aria-label="放弃规划" title="放弃规划"><Trash2 /></button>}
      {props.customLanes.length > 0 && <select aria-label={`${props.item.event?.title || props.item.entry.eventId}轨道`} value={props.item.entry.laneId} onChange={(event) => props.onAssignLane(event.target.value)}><option value="lane.canon">默认展示</option>{props.customLanes.map((lane) => <option value={lane.id} key={lane.id}>{lane.title}</option>)}</select>}
      <button type="button" onClick={props.onRemove} aria-label="从时间线移除" title="从时间线移除"><Trash2 /></button>
    </div>
  </article>;
}

function DependencyBand(props: {
  document: TimelineDocument;
  objectsById: Map<string, WorldObjectSummary>;
  onRemove(dependencyId: string): void;
}) {
  if (props.document.content.dependencies.length === 0) return null;
  const ordered = [...props.document.content.entries].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const orderByEvent = new Map(ordered.map((entry, index) => [entry.eventId, index]));
  const sourceStatusByEvent = new Map(props.document.diagnostics.timeline.entryStates.map((entry) => [entry.eventId, entry.status]));
  const width = Math.max(720, ordered.length * 230 + 160);
  return <section className="timeline-dependency-band" data-testid="timeline-dependencies">
    <header><GitMerge /><strong>事件依赖</strong><span>前置事件 → 当前事件</span></header>
    <svg viewBox={`0 0 ${width} 72`} width={width} height="72" role="img" aria-label="事件依赖连线">
      <defs><marker id="timeline-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" /></marker></defs>
      {props.document.content.dependencies.map((dependency, index) => {
        const from = orderByEvent.get(dependency.fromEventId);
        const to = orderByEvent.get(dependency.toEventId);
        if (from == null || to == null) return <path key={dependency.id} d={`M40 ${18 + index * 8} H140`} className="is-missing" />;
        const x1 = 150 + from * 230;
        const x2 = 150 + to * 230;
        const y = 24 + (index % 4) * 10;
        return <path key={dependency.id} d={`M${x1} ${y} C${x1 + (x2 - x1) / 2} ${y - 18}, ${x1 + (x2 - x1) / 2} ${y + 18}, ${x2} ${y}`} className={dependencyOrderWarning(props.document, dependency) ? "has-order-warning" : ""} markerEnd="url(#timeline-arrow)" />;
      })}
    </svg>
    <div className="timeline-dependency-list">{props.document.content.dependencies.map((dependency) => {
      const prerequisite = sourceStatusByEvent.get(dependency.fromEventId) === "missing" ? null : props.objectsById.get(dependency.fromEventId);
      const dependent = sourceStatusByEvent.get(dependency.toEventId) === "missing" ? null : props.objectsById.get(dependency.toEventId);
      const missing = !prerequisite || !dependent;
      const warning = dependencyOrderWarning(props.document, dependency);
      return <article className={`${missing ? "is-missing" : ""} ${warning ? "has-order-warning" : ""}`} key={dependency.id}>
        {warning ? <AlertTriangle /> : <GitMerge />}
        <span><strong>{prerequisite?.title || "前置事件已缺失"} → {dependent?.title || "当前事件已缺失"}</strong><small>{missing ? "依赖端点失效，可清理" : warning ? "当前事件排在前置事件之前，请检查顺序" : "必须按此顺序发生"}</small></span>
        <button type="button" aria-label="移除依赖" title="移除依赖" onClick={() => props.onRemove(dependency.id)}><Trash2 /></button>
      </article>;
    })}</div>
  </section>;
}

function TrackSelector(props: {
  document: TimelineDocument;
  objects: WorldObjectSummary[];
  onToggle(kind: "canon" | "planning" | "character" | "location", refId: string | null, enabled: boolean): void;
  onAddCustom(): void;
  onClose(): void;
}) {
  function checked(kind: TimelineTrackView["kind"], refId: string | null) {
    return props.document.content.trackViews.some((track) => track.kind === kind && track.refId === refId && track.visible);
  }
  return <aside className="timeline-popover timeline-track-selector" aria-label="轨道选择器">
    <header><div><small>轨道</small><strong>选择时间线视角</strong></div><button type="button" aria-label="关闭轨道选择器" onClick={props.onClose}><Minus /></button></header>
    <fieldset><legend>状态</legend><label><input type="checkbox" checked={checked("canon", null)} onChange={(event) => props.onToggle("canon", null, event.target.checked)} />正史</label><label><input type="checkbox" checked={checked("planning", null)} onChange={(event) => props.onToggle("planning", null, event.target.checked)} />规划</label></fieldset>
    <fieldset><legend>人物</legend>{props.objects.filter((object) => object.type === "character").map((object) => <label key={object.id}><input type="checkbox" checked={checked("character", object.id)} onChange={(event) => props.onToggle("character", object.id, event.target.checked)} />{object.title}</label>)}</fieldset>
    <fieldset><legend>地点</legend>{props.objects.filter((object) => object.type === "location").map((object) => <label key={object.id}><input type="checkbox" checked={checked("location", object.id)} onChange={(event) => props.onToggle("location", object.id, event.target.checked)} />{object.title}</label>)}</fieldset>
    <fieldset><legend>展示</legend>{props.document.content.trackViews.filter((track) => track.kind === "custom").map((track) => <span key={track.id}>{props.document.content.lanes.find((lane) => lane.id === track.refId)?.title || "展示轨道"}</span>)}<button type="button" className="secondary-action" onClick={props.onAddCustom}><Plus />添加展示轨道</button></fieldset>
  </aside>;
}

function FilterPanel(props: {
  document: TimelineDocument;
  objects: WorldObjectSummary[];
  onChange(content: Partial<TimelineDocument["content"]>): void;
  onClose(): void;
}) {
  const filters = props.document.content.filters;
  return <aside className="timeline-popover timeline-filter-panel" aria-label="时间线筛选">
    <header><div><small>筛选</small><strong>缩小当前视图</strong></div><button type="button" aria-label="关闭筛选" onClick={props.onClose}><Minus /></button></header>
    <label>状态<select aria-label="时间线状态筛选" value={filters.mode} onChange={(event) => props.onChange({ filters: { ...filters, mode: event.target.value as "all" | "canon" | "planning" } })}><option value="all">全部</option><option value="canon">正史</option><option value="planning">规划</option></select></label>
    <fieldset><legend>人物与地点</legend>{props.objects.map((object) => <label key={object.id}><input type="checkbox" checked={filters.objectIds.includes(object.id)} onChange={(event) => props.onChange({ filters: { ...filters, objectIds: event.target.checked ? [...filters.objectIds, object.id] : filters.objectIds.filter((id) => id !== object.id) } })} />{object.title}</label>)}</fieldset>
    {(filters.mode !== "all" || filters.objectIds.length > 0) && <button type="button" className="secondary-action" onClick={() => props.onChange({ filters: { mode: "all", objectIds: [] } })}><Trash2 />清除筛选</button>}
  </aside>;
}

function ToolButton(props: { label: string; active?: boolean; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  return <button type="button" className={`timeline-tool ${props.active ? "is-active" : ""}`} aria-label={props.label} title={props.label} aria-pressed={props.active || false} disabled={props.disabled} onClick={props.onClick}>{props.children}</button>;
}

function statusLabel(status: TimelineProjectedEntry["status"]): string {
  return status === "canonical" ? "正史" : status === "planned" ? "规划" : status === "missing" ? "事件已缺失" : "来源不再符合条件";
}

function productDependencyError(reason: string | null): string {
  if (!reason) return "这条依赖无法建立。";
  if (/cycle|loop/i.test(reason)) return "无法添加此前置事件，因为它会形成循环依赖。";
  if (/duplicate/i.test(reason)) return "这条前置依赖已经存在。";
  if (/self/i.test(reason)) return "一个事件不能依赖它自己。";
  if (/direction/i.test(reason)) return "规划事件不能成为已确认正史事件的前置条件。";
  return "这条依赖不符合当前时间线的约束。";
}

function emptyTrackCopy(kind: TimelineTrackView["kind"], visibleEntryCount: number): string {
  if (visibleEntryCount === 0) return "当前筛选下没有事件";
  if (kind === "canon") return "没有符合条件的正史事件";
  if (kind === "planning") return "有规划事件时会显示在这里";
  if (kind === "location") return "没有事件引用这个地点";
  if (kind === "character") return "没有事件引用这个人物";
  return "把事件分配到这条展示轨道";
}

function nextId(prefix: string, existing: string[]): string {
  for (let index = 1; index < 10_000; index += 1) {
    const id = `${prefix}.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error(`Could not create ${prefix} id.`);
}

function laneColor(index: number): string {
  return ["#63c3b5", "#d08b43", "#b49ad6", "#9fb7d1", "#d5c27a"][index % 5];
}
