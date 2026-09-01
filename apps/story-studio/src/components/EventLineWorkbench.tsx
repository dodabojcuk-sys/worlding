import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  CircleDot,
  FileText,
  GitBranch,
  Layers3,
  Link2,
  ListFilter,
  LocateFixed,
  MapPin,
  MessageCircle,
  Network,
  PanelRight,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  UsersRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { GoldenLoopCandidate, GoldenLoopResult } from "../lib/goldenLoopContract";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { workspaceDockCoordinator } from "../product-shell/WorkspaceDockCoordinator";
import {
  createStoryStudioEventReference,
  type StoryStudioEventReference
} from "../../../../src/storyContracts/storyStudioEventReference";

import {
  confirmedEventRelationProjection,
  eventLineSemanticNode,
  eventLineEventMetadata,
  isVerifiedCanonEventDetail,
  type CanonReadFailure,
  type CanonReadFailureKind,
  type EventLineEventDetail,
  type EventLineEventSummary,
  type VerifiedCanonEventDetailRead,
  type VerifiedCanonEventListRead
} from "./eventLineCommittedEvents";
import { PageContextDock, type PageContextDockLens, type PageContextDockState } from "./PageContextDock";
import { buildEventLocalIndicators, type EventSemanticNode } from "../../../../src/storyContracts/eventSemanticHierarchy";
import { EventGraphCanvas } from "./event-observation/EventGraphCanvas";
import { EventTimelineProjection } from "./event-observation/EventTimelineProjection";
import type { RelationReadProjectionR0 } from "../../../../src/storyControlSurface/storyStudioRelationOperations.ts";

export type EventLinePageDockLens = "detail" | "relations" | "branches" | "review" | "create";
export type EventDraftInput = {
  title: string;
  summary: string;
  storyUnit: string;
  focus: string;
  storyTime: string;
  location: string;
  participants: string[];
  tags: string[];
  note: string;
};
type EventLineFilter =
  | { kind: "all" }
  | { kind: "current-unit" }
  | { kind: "unit"; value: string }
  | { kind: "character"; value: string }
  | { kind: "location"; value: string }
  | { kind: "pending" };

type EventCandidateStatus = "awaiting" | "rejected" | "submitted-to-impact";

export function EventLineWorkbench(props: {
  embedded?: boolean;
  projectId: string;
  projectTitle: string;
  events: EventLineEventSummary[];
  relations?: RelationReadProjectionR0[];
  listState: VerifiedCanonEventListRead | { status: "loading" };
  onReadEvent(eventId: string): Promise<VerifiedCanonEventDetailRead>;
  onRetry(): void;
  goldenLoop: GoldenLoopResult | null;
  rejectedCandidateIds: string[];
  acceptedCandidateIds: string[];
  currentFocusLabel: string;
  currentUnitLabel: string | null;
  selectedEventId?: string | null;
  roleLens?: string | null;
  onSelectedEventId?(eventId: string | null): void;
  onOpenTianyi(reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[]): void;
  onCreateFromEvent?(event: EventLineEventSummary): void;
  onSaveEvent?(input: EventDraftInput): Promise<EventLineEventSummary>;
  onCreateGraphRelation?(input: { sourceEventId: string; targetEventId: string }): Promise<void>;
  onConfirmGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onUpdateGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onApproveModifiedGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onRejectGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onContinueReview(): void;
}) {
  const eventIds = props.events.map((event) => event.id).join("\u0000");
  const [localSelectedEventId, setLocalSelectedEventId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, EventLineEventDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<CanonReadFailure | null>(null);
  const [filter, setFilter] = useState<EventLineFilter>(() => props.roleLens ? { kind: "character", value: props.roleLens } : { kind: "all" });
  const [compact, setCompact] = useState(false);
  const [projectionMode, setProjectionMode] = useState<EventWorkspaceView>(() => readProjectionMode(props.projectId));
  const [scopeOpen, setScopeOpen] = useState(false);
  const [dockState, setDockState] = useState<PageContextDockState<EventLinePageDockLens>>(() => ({ open: Boolean(props.selectedEventId), activeLens: "detail" }));
  const [creationNotice, setCreationNotice] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [invalidRecordWarningDismissed, setInvalidRecordWarningDismissed] = useState(false);
  const requestSequence = useRef(0);
  const spineRef = useRef<HTMLDivElement>(null);
  const pendingSpineAnchorRef = useRef<{ eventId: string | null; offset: number; scrollTop: number } | null>(null);
  const scopeTriggerRef = useRef<HTMLButtonElement>(null);
  const initialRouteEventIdRef = useRef(props.selectedEventId ?? null);
  const initialRouteDockOpenedRef = useRef(false);
  const onReadEvent = useRef(props.onReadEvent);
  onReadEvent.current = props.onReadEvent;
  const selectedEventId = props.selectedEventId === undefined ? localSelectedEventId : props.selectedEventId;
  const setSelectedEventId = (eventId: string | null) => {
    if (props.selectedEventId === undefined) setLocalSelectedEventId(eventId);
    props.onSelectedEventId?.(eventId);
  };

  useEffect(() => {
    if (props.selectedEventId === undefined) {
      setLocalSelectedEventId((current) => props.events.some((event) => event.id === current) ? current : null);
    }
    setDetailsById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => props.events.some((event) => event.id === id))));
  }, [eventIds, props.projectId, props.events, props.selectedEventId, props.onSelectedEventId]);

  useEffect(() => {
    if (props.roleLens) setFilter({ kind: "character", value: props.roleLens });
    else if (filter.kind === "character") setFilter({ kind: "all" });
  }, [props.roleLens]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    let cancelled = false;
    if (!selectedEventId) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    if (detailsById[selectedEventId]) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    if (!isConfirmedEventSummary(props.events.find((event) => event.id === selectedEventId))) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    if (!props.events.some((event) => event.id === selectedEventId)) {
      if (props.listState.status === "loading") {
        setDetailLoading(true);
        setDetailError(null);
        return;
      }
      setDetailLoading(false);
      setDetailError({ kind: "invalid-record", message: "所选事件已不在当前已确认记录中。" });
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    void onReadEvent.current(selectedEventId)
      .then((next) => {
        if (cancelled || sequence !== requestSequence.current) return;
        if (next.status === "error") {
          setDetailError(next.error);
          return;
        }
        if (next.event.id !== selectedEventId || !isVerifiedCanonEventDetail(next.event)) {
          setDetailError({ kind: "invalid-record", message: "事件详情不再符合已确认记录条件。" });
          return;
        }
        setDetailsById((current) => ({ ...current, [next.event.id]: next.event }));
      })
      .catch(() => {
        if (!cancelled && sequence === requestSequence.current) {
          setDetailError({ kind: "repository-io", message: "无法连接本地事件读取服务，详情未被当作空记录。" });
        }
      })
      .finally(() => {
        if (!cancelled && sequence === requestSequence.current) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [detailsById, eventIds, props.events, props.listState.status, props.projectId, selectedEventId]);

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

  const candidates = props.goldenLoop?.nuwa.candidates ?? [];
  const metadataById = useMemo(() => Object.fromEntries(props.events.map((event) => [event.id, eventLineEventMetadata(event)])), [eventIds, props.events]);
  const unitLabels = useMemo(() => unique(props.events.flatMap((event) => metadataById[event.id]?.unitLabel ?? [])), [eventIds, metadataById, props.events]);
  const characterLabels = useMemo(() => unique(props.events.flatMap((event) => metadataById[event.id]?.characterLabels ?? [])), [eventIds, metadataById, props.events]);
  const locationLabels = useMemo(() => unique(props.events.flatMap((event) => metadataById[event.id]?.locationLabels ?? [])), [eventIds, metadataById, props.events]);
  const pendingCandidateCount = candidates.filter((candidate) => candidateStatus(candidate.id, props.rejectedCandidateIds, props.acceptedCandidateIds) === "awaiting").length;
  const visibleEvents = props.events.filter((event) => eventMatchesFilter(event, filter, props.currentUnitLabel, metadataById[event.id], props.goldenLoop));
  const groupedEvents = groupEventsByUnit(visibleEvents, metadataById);
  const selectedEvent = props.events.find((event) => event.id === selectedEventId) ?? null;
  const selectedDetail = selectedEventId ? detailsById[selectedEventId] ?? null : null;
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  const selectedEventRef = selectedEvent && (selectedEvent.status === "planned" || selectedEvent.status === "committed")
    ? createStoryStudioEventReference({ projectId: props.projectId, event: selectedEvent, requestedUse: "constraint" })
    : null;
  const relations = confirmedEventRelationProjection(selectedDetail);
  const formalRelations = props.relations ?? [];
  const creationOpen = dockState.open && dockState.activeLens === "create";

  const requestDockState = useCallback((next: PageContextDockState<EventLinePageDockLens>, anchorEventId = selectedEventId) => {
    if (next.open) window.dispatchEvent(new Event("story-studio-close-mobile-context"));
    if (next.open !== dockState.open) {
      const spine = spineRef.current;
      const anchor = anchorEventId
        ? spine?.querySelector<HTMLElement>(`[data-confirmed-event-id="${CSS.escape(anchorEventId)}"]`)
        : null;
      pendingSpineAnchorRef.current = {
        eventId: anchorEventId,
        offset: anchor && spine ? anchor.getBoundingClientRect().top - spine.getBoundingClientRect().top : 0,
        scrollTop: spine?.scrollTop ?? 0
      };
    }
    if (next.open) workspaceDockCoordinator.openPageInspector(
      "event-line",
      next.activeLens === "create" ? "EVENT_CREATE" : next.activeLens === "review" ? "RELATION_REVIEW" : "EVENT_DETAILS"
    );
    else workspaceDockCoordinator.closePageInspector("event-line");
    setDockState(next);
  }, [dockState.open, selectedEventId]);

  useEffect(() => {
    const routeEventId = initialRouteEventIdRef.current;
    if (initialRouteDockOpenedRef.current || !routeEventId || selectedEventId !== routeEventId || !props.events.some((event) => event.id === routeEventId)) return;
    initialRouteDockOpenedRef.current = true;
    requestDockState({ open: true, activeLens: "detail" }, routeEventId);
  }, [eventIds, props.events, requestDockState, selectedEventId]);

  useEffect(() => {
    const pending = pendingSpineAnchorRef.current;
    if (!pending) return;
    let frame = window.requestAnimationFrame(() => {
      const spine = spineRef.current;
      const anchor = pending.eventId
        ? spine?.querySelector<HTMLElement>(`[data-confirmed-event-id="${CSS.escape(pending.eventId)}"]`)
        : null;
      if (!spine) return;
      spine.scrollTop = anchor
        ? Math.max(0, spine.scrollTop + anchor.getBoundingClientRect().top - spine.getBoundingClientRect().top - pending.offset)
        : pending.scrollTop;
      pendingSpineAnchorRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dockState]);

  const openEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    requestDockState({ open: true, activeLens: "detail" }, eventId);
  };
  const openGraphEvent = (eventId: string) => {
    setSelectedEventId(eventId);
  };
  const beginEventCreate = () => {
    if (!props.onSaveEvent) return;
    setCreationError(null);
    setCreationNotice(null);
    requestDockState({ open: true, activeLens: "create" });
  };
  const closeEventCreate = () => {
    if (creatingEvent) return;
    setCreationError(null);
    requestDockState({ open: false, activeLens: "detail" });
  };
  const saveEventDraft = async (input: EventDraftInput) => {
    if (!props.onSaveEvent || creatingEvent) return;
    setCreatingEvent(true);
    setCreationError(null);
    try {
      const created = await props.onSaveEvent(input);
      setSelectedEventId(created.id);
      setCreationNotice("事件草稿已保存，并已定位到当前工作区。");
      requestDockState({ open: true, activeLens: "detail" }, created.id);
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "保存事件草稿失败；已保留输入，可重试。");
    } finally {
      setCreatingEvent(false);
    }
  };
  const selectView = (next: EventWorkspaceView) => {
    requestDockState({ open: false, activeLens: "detail" });
    if (next === "graph") {
      window.dispatchEvent(new Event("story-studio-close-project-directory"));
    }
    setProjectionMode(next);
  };
  useEffect(() => { writeProjectionMode(props.projectId, projectionMode); }, [projectionMode, props.projectId]);
  useEffect(() => { setInvalidRecordWarningDismissed(false); }, [props.listState.status === "ready" ? props.listState.invalidRecordCount : 0, props.projectId]);
  const openCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    requestDockState({ open: true, activeLens: "review" });
  };
  const revealCurrentEvent = () => {
    if (!selectedEvent) return;
    setFilter({ kind: "all" });
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-confirmed-event-id="${CSS.escape(selectedEvent.id)}"]`)?.scrollIntoView({ block: "center" }));
  };

  const dockLenses: PageContextDockLens<EventLinePageDockLens>[] = [
    ...(props.onSaveEvent ? [{ id: "create" as const, label: "新建事件", icon: <FileText />, content: <EventCreateInspector busy={creatingEvent} error={creationError} defaultStoryUnit={props.currentUnitLabel ?? ""} onCancel={closeEventCreate} onSave={(input) => void saveEventDraft(input)} /> }] : []),
    { id: "detail", label: "详情", icon: <FileText />, content: <EventDetailDock event={selectedEvent} detail={selectedDetail} loading={detailLoading} error={detailError} metadata={selectedEvent ? metadataById[selectedEvent.id] : null} onOpenTianyi={() => props.onOpenTianyi(selectedEventRef ?? undefined)} onCreateFromEvent={props.onCreateFromEvent} /> },
    { id: "relations", label: "关联", icon: <Link2 />, content: <EventRelationsDock event={selectedEvent} incoming={relations.incoming} outgoing={relations.outgoing} formalRelations={formalRelations.filter((relation) => relation.reviewState === "confirmed" && (relation.sourceObjectId === selectedEvent?.id || relation.targetObjectId === selectedEvent?.id))} /> },
    { id: "branches", label: "候选", icon: <GitBranch />, badge: pendingCandidateCount, content: <EventBranchesDock candidates={candidates} rejectedIds={props.rejectedCandidateIds} acceptedIds={props.acceptedCandidateIds} selectedId={selectedCandidateId} onSelect={openCandidate} /> },
    { id: "review", label: "评审", icon: <ShieldCheck />, badge: pendingCandidateCount, content: <EventReviewDock candidate={selectedCandidate} status={selectedCandidate ? candidateStatus(selectedCandidate.id, props.rejectedCandidateIds, props.acceptedCandidateIds) : null} onContinueReview={props.onContinueReview} /> }
  ];

  return <section className="workbench event-line-workbench" data-testid="event-line-workbench" data-event-observation-renderer="spine" data-projection-mode={projectionMode}>
    {!props.embedded ? <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="事件线"
      title="事件脉络"
      context={`当前工作 · ${props.currentFocusLabel}`}
      status={<span className="is-confirmed">{props.events.length} 条已确认事件</span>}
      prototype="workbench"
      icon={<BookOpen />}
      className="event-line-header"
      onOpenNavigation={() => setScopeOpen(true)}
      actions={<div className="event-line-header-actions">
        {props.onSaveEvent ? <button type="button" className="primary-action" onClick={beginEventCreate}><FileText />新增事件</button> : null}
        <button type="button" aria-label={dockState.open ? "关闭页面工具" : "打开页面工具"} aria-pressed={dockState.open} onClick={() => requestDockState({ ...dockState, open: !dockState.open })}><Settings2 />页面工具</button>
        <button type="button" data-tianyi-drawer-trigger aria-label="打开天意助手" onClick={() => props.onOpenTianyi(selectedEventRef ?? undefined)}><MessageCircle />天意</button>
      </div>}
    /> : null}
    <div className={`event-line-shell ${props.embedded ? "is-embedded" : ""}`} data-page-dock-open={dockState.open ? "true" : "false"}>
      {!props.embedded ? <><button ref={scopeTriggerRef} type="button" className="event-line-scope-trigger" aria-expanded={scopeOpen} aria-controls="event-line-page-scope" onClick={() => setScopeOpen(true)}><ListFilter />故事范围</button>
      <EventLineScope
        open={scopeOpen}
        projectTitle={props.projectTitle}
        currentFocusLabel={props.currentFocusLabel}
        currentUnitLabel={props.currentUnitLabel}
        confirmedCount={props.events.length}
        pendingCandidateCount={pendingCandidateCount}
        unitLabels={unitLabels}
        characterLabels={characterLabels}
        locationLabels={locationLabels}
        filter={filter}
        onFilter={(next) => { setFilter(next); setScopeOpen(false); }}
        onClose={() => { setScopeOpen(false); window.requestAnimationFrame(() => scopeTriggerRef.current?.focus()); }}
      />
      {scopeOpen ? <button type="button" className="event-line-scope-backdrop" aria-label="关闭故事范围" onClick={() => setScopeOpen(false)} /> : null}</> : null}
      <main className="event-line-spine-main" ref={spineRef}>
        <header className="event-line-spine-toolbar" aria-label="事件视图工具栏">
          <nav className="event-line-view-switch" aria-label="事件视图">
            <button type="button" aria-pressed={projectionMode === "spine"} onClick={() => selectView("spine")}><Layers3 />故事脊柱</button>
            <button type="button" aria-pressed={projectionMode === "graph"} onClick={() => selectView("graph")}><Network />关系图</button>
            <button type="button" aria-pressed={projectionMode === "timeline"} onClick={() => selectView("timeline")}><Clock3 />时间轴</button>
          </nav>
          <div className="event-line-view-actions">{props.onSaveEvent ? <button type="button" className="primary-action" onClick={beginEventCreate}><FileText />新增事件</button> : null}{projectionMode === "spine" ? <button type="button" aria-pressed={compact} onClick={() => setCompact((value) => !value)}><ScanLine />紧凑显示</button> : null}<button type="button" disabled={!selectedEvent} onClick={revealCurrentEvent}><LocateFixed />聚焦当前</button></div>
        </header>
        {creationNotice ? <p className="event-line-creation-notice" role="status">{creationNotice}<button type="button" aria-label="关闭提示" onClick={() => setCreationNotice(null)}><X /></button></p> : null}
        <EventLineListState state={props.listState} invalidRecordCount={props.listState.status === "ready" ? props.listState.invalidRecordCount : 0} eventCount={props.events.length} warningDismissed={invalidRecordWarningDismissed} onDismissWarning={() => setInvalidRecordWarningDismissed(true)} onRetry={props.onRetry} />
        {projectionMode === "graph" ? <EventGraphCanvas projectId={props.projectId} events={props.events} relations={formalRelations} selectedEventId={selectedEventId} onSelectEvent={openGraphEvent} onClearSelection={() => setSelectedEventId(null)} onCreateEvent={beginEventCreate} createOpen={creationOpen} onCloseCreate={closeEventCreate} createInspector={props.onSaveEvent ? <EventCreateInspector busy={creatingEvent} error={creationError} defaultStoryUnit={props.currentUnitLabel ?? ""} onCancel={closeEventCreate} onSave={(input) => void saveEventDraft(input)} /> : null} onOpenStorySpine={() => selectView("spine")} onOpenTimeline={() => selectView("timeline")} onCreateRelation={props.onCreateGraphRelation} onConfirmRelation={props.onConfirmGraphRelation} onUpdateRelation={props.onUpdateGraphRelation} onApproveModifiedRelation={props.onApproveModifiedGraphRelation} onRejectRelation={props.onRejectGraphRelation} onOpenTianyi={(eventIds) => {
          const references = (eventIds ?? []).flatMap((eventId) => {
            const event = props.events.find((item) => item.id === eventId);
            return event && (event.status === "planned" || event.status === "committed") ? [createStoryStudioEventReference({ projectId: props.projectId, event, requestedUse: "constraint" })] : [];
          });
          props.onOpenTianyi(references.length ? references : undefined, undefined, references.map((reference) => props.events.find((event) => event.id === reference.eventId)?.title ?? reference.eventId));
        }} /> : null}
        {projectionMode === "timeline" ? <EventTimelineProjection events={props.events} relations={formalRelations} selectedEventId={selectedEventId} onSelect={openEvent} /> : null}
        {projectionMode === "spine" && props.events.length > 0 && visibleEvents.length === 0 ? <section className="event-line-empty-filter" data-testid="event-line-filter-empty"><ListFilter /><strong>当前筛选没有匹配的事件</strong><p>筛选只改变本机观察范围；返回“全部脊柱”即可恢复。</p><button type="button" onClick={() => setFilter({ kind: "all" })}>查看全部脊柱</button></section> : null}
        {projectionMode === "spine" && props.events.length === 0 ? <section className="event-line-empty" data-testid="event-line-empty"><BookOpen /><strong>从第一个事件开始</strong><p>先记录作者已知的情节，之后再补充时间、地点、人物和关系。</p>{props.onSaveEvent ? <button type="button" className="primary-action" onClick={beginEventCreate}><FileText />创建第一个事件</button> : null}</section> : null}
        {projectionMode === "spine" && visibleEvents.length > 0 ? <div className={`event-line-spine ${compact ? "is-compact" : ""}`} data-testid="confirmed-story-spine" aria-label="故事脊柱">
          {groupedEvents.map((group) => <section className="event-line-unit" key={group.label} data-current-unit={group.label === props.currentUnitLabel ? "true" : "false"}>
            <header><span><Layers3 /></span><div><small>{group.label === props.currentUnitLabel ? "故事单元 · 当前故事范围" : "故事单元"}</small><h2>{group.label}</h2></div><strong>{group.setPoints.reduce((count, item) => count + item.events.length, 0)} 个已确认事件</strong></header>
            {group.setPoints.map((setPoint) => <section className="event-line-set-point" key={setPoint.label}><header><span><CircleDot /></span><div><small>集点</small><h3>{setPoint.label}</h3></div><strong>{setPoint.events.length} 个节点</strong></header><ol>{setPoint.events.map((event) => <EventSpineNode
                key={event.id}
                event={event}
                detail={detailsById[event.id] ?? null}
                metadata={metadataById[event.id]}
                sequence={props.events.findIndex((item) => item.id === event.id) + 1}
                selected={event.id === selectedEventId}
                current={event.id === selectedEventId}
                candidateMarker={eventCandidateMarker(event, props.goldenLoop, props.rejectedCandidateIds, props.acceptedCandidateIds)}
                onOpen={() => openEvent(event.id)}
              />)}</ol></section>)}
          </section>)}
        </div> : null}
        {projectionMode === "spine" ? <CandidateBranchRegion candidates={candidates} rejectedIds={props.rejectedCandidateIds} acceptedIds={props.acceptedCandidateIds} onOpen={openCandidate} /> : null}
      </main>
      {projectionMode !== "graph" ? <PageContextDock pageId="event-line" label="事件线页面" state={dockState} lenses={dockLenses} onState={requestDockState} /> : null}
    </div>
  </section>;
}

function EventLineScope(props: {
  open: boolean;
  projectTitle: string;
  currentFocusLabel: string;
  currentUnitLabel: string | null;
  confirmedCount: number;
  pendingCandidateCount: number;
  unitLabels: readonly string[];
  characterLabels: readonly string[];
  locationLabels: readonly string[];
  filter: EventLineFilter;
  onFilter(filter: EventLineFilter): void;
  onClose(): void;
}) {
  return <aside id="event-line-page-scope" className="event-line-page-scope" data-mobile-open={props.open ? "true" : "false"} aria-label="事件线故事范围">
    <header><div><small>当前作品</small><strong>{props.projectTitle}</strong></div><button type="button" aria-label="关闭故事范围" onClick={props.onClose}><X /></button></header>
    <section className="event-line-scope-current"><small>当前工作</small><strong>{props.currentFocusLabel}</strong><span>{props.currentUnitLabel ? `当前故事范围 · ${props.currentUnitLabel}` : "当前故事范围尚未指定"}</span></section>
    <nav aria-label="事件线筛选">
      <ScopeButton active={props.filter.kind === "all"} icon={<BookOpen />} label="全部脊柱" count={props.confirmedCount} onClick={() => props.onFilter({ kind: "all" })} />
      <ScopeButton active={props.filter.kind === "current-unit"} icon={<LocateFixed />} label="当前 Unit" onClick={() => props.onFilter({ kind: "current-unit" })} />
      <ScopeButton active={props.filter.kind === "pending"} icon={<GitBranch />} label="候选 / 待影响" count={props.pendingCandidateCount} onClick={() => props.onFilter({ kind: "pending" })} />
    </nav>
    <ScopeGroup label="故事范围" empty="已确认事件尚未携带故事范围标签">{props.unitLabels.map((label) => <ScopeButton key={label} active={props.filter.kind === "unit" && props.filter.value === label} label={label} onClick={() => props.onFilter({ kind: "unit", value: label })} />)}</ScopeGroup>
    <ScopeGroup label="角色" empty="正式事件尚未携带角色标签">{props.characterLabels.map((label) => <ScopeButton key={label} active={props.filter.kind === "character" && props.filter.value === label} icon={<UsersRound />} label={label} onClick={() => props.onFilter({ kind: "character", value: label })} />)}</ScopeGroup>
    <ScopeGroup label="地点" empty="正式事件尚未携带地点标签">{props.locationLabels.map((label) => <ScopeButton key={label} active={props.filter.kind === "location" && props.filter.value === label} icon={<MapPin />} label={label} onClick={() => props.onFilter({ kind: "location", value: label })} />)}</ScopeGroup>
    <footer><ShieldCheck /><span>{props.confirmedCount} 条正式事件</span><GitBranch /><span>{props.pendingCandidateCount} 条候选待处理</span></footer>
  </aside>;
}

function EventCreateInspector(props: { busy: boolean; error: string | null; defaultStoryUnit: string; onCancel(): void; onSave(input: EventDraftInput): void }) {
  const [values, setValues] = useState<EventDraftInput>(() => ({ title: "", summary: "", storyUnit: props.defaultStoryUnit, focus: "", storyTime: "", location: "", participants: [], tags: [], note: "" }));
  const [participantText, setParticipantText] = useState("");
  const [tagText, setTagText] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const update = <K extends keyof EventDraftInput>(key: K, value: EventDraftInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = values.title.trim();
    if (!title) { setTitleError("请填写事件标题后再保存草稿。"); return; }
    setTitleError(null);
    props.onSave({ ...values, title, summary: values.summary.trim(), storyUnit: values.storyUnit.trim(), focus: values.focus.trim(), storyTime: values.storyTime.trim(), location: values.location.trim(), note: values.note.trim(), participants: splitAuthorList(participantText), tags: splitAuthorList(tagText) });
  };
  return <form className="event-create-inspector" aria-label="新建事件" onSubmit={submit}>
    <section><small>作者创建</small><h2>新建事件</h2><p>先保存为草稿。它不会修改正式故事、创建关系或调用天意。</p></section>
    <label><span>事件标题 <b aria-hidden="true">*</b></span><input autoFocus value={values.title} onChange={(event) => update("title", event.target.value)} maxLength={80} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? "event-create-title-error" : undefined} disabled={props.busy} /></label>
    <label><span>发生了什么</span><textarea value={values.summary} onChange={(event) => update("summary", event.target.value)} rows={4} maxLength={1200} disabled={props.busy} /></label>
    <div className="event-create-grid"><label><span>故事单元</span><input value={values.storyUnit} onChange={(event) => update("storyUnit", event.target.value)} disabled={props.busy} /></label><label><span>焦点</span><input value={values.focus} onChange={(event) => update("focus", event.target.value)} disabled={props.busy} /></label><label><span>故事时间</span><input value={values.storyTime} onChange={(event) => update("storyTime", event.target.value)} placeholder="未知也可以留空" disabled={props.busy} /></label><label><span>地点</span><input value={values.location} onChange={(event) => update("location", event.target.value)} placeholder="未知也可以留空" disabled={props.busy} /></label></div>
    <label><span>涉及人物</span><input value={participantText} onChange={(event) => setParticipantText(event.target.value)} placeholder="用逗号分隔，可留空" disabled={props.busy} /></label>
    <label><span>标签</span><input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="用逗号分隔，可留空" disabled={props.busy} /></label>
    <label><span>作者备注</span><textarea value={values.note} onChange={(event) => update("note", event.target.value)} rows={3} maxLength={1200} disabled={props.busy} /></label>
    {titleError ? <p id="event-create-title-error" className="event-create-error" role="alert">{titleError}</p> : null}
    {props.error ? <p className="event-create-error" role="alert">{props.error}</p> : null}
    <footer><button type="button" onClick={props.onCancel} disabled={props.busy}>取消</button><button type="submit" className="primary-action" disabled={props.busy}>{props.busy ? "正在保存…" : "保存草稿"}</button></footer>
  </form>;
}

function ScopeGroup(props: { label: string; empty: string; children: ReactNode }) {
  const empty = Array.isArray(props.children) && props.children.length === 0;
  return <section className="event-line-scope-group"><small>{props.label}</small>{empty ? <p>{props.empty}</p> : props.children}</section>;
}

function ScopeButton(props: { active: boolean; icon?: ReactNode; label: string; count?: number; onClick(): void }) {
  return <button type="button" className={props.active ? "is-active" : ""} aria-pressed={props.active} onClick={props.onClick}>{props.icon ?? <CircleDot />}<span>{props.label}</span>{typeof props.count === "number" ? <small>{props.count}</small> : null}</button>;
}

function EventSpineNode(props: {
  event: EventLineEventSummary;
  detail: EventLineEventDetail | null;
  metadata: ReturnType<typeof eventLineEventMetadata>;
  sequence: number;
  selected: boolean;
  current: boolean;
  candidateMarker: EventCandidateStatus | null;
  onOpen(): void;
}) {
  const summary = props.detail ? authorEventBody(props.detail.body)[0] : eventSummaryFromTags(props.event.tags);
  const semantic = props.detail ? eventLineSemanticNode(props.detail) : eventLineSemanticNode(props.event);
  return <li className={props.selected ? "is-selected" : ""} data-confirmed-event-id={props.event.id} data-current-event={props.current ? "true" : "false"} data-event-status={semantic.status}>
    <span className="event-line-spine-node" aria-hidden="true">{props.sequence}</span>
    <button type="button" onClick={props.onOpen} aria-label={`查看正式事件：${props.event.title}`}>
      <header><span className={semantic.status === "confirmed" ? "event-line-canon-state" : "event-line-candidate-marker"}><CheckCircle2 />{eventRecordLabel(semantic.status)}</span><span className="event-line-hierarchy-state">{semantic.storyLine.label} · {semanticStatusLabel(semantic.status)}</span>{props.current ? <span className="event-line-current-state"><LocateFixed />当前</span> : null}{props.candidateMarker ? <span className="event-line-candidate-marker"><GitBranch />{candidateStatusLabel(props.candidateMarker)}</span> : null}</header>
      <h3>{props.event.title}</h3>
      <p>{summary}</p>
      <dl>
        <div><dt>层级</dt><dd>{props.metadata.unitLabel ?? "未指定故事单元"} · {props.metadata.setPointLabel ?? "未指定集点"}</dd></div>
        <div><dt><UsersRound />参与</dt><dd>{props.metadata.characterLabels.length ? props.metadata.characterLabels.join("、") : "未提供"}</dd></div>
        <div><dt><Clock3 />时间</dt><dd>{semantic.time.label}</dd></div>
        <div><dt>依据</dt><dd>{semantic.source.ref === props.event.id ? "Event 来源已核验" : authorSourceRef(semantic.source.ref)}</dd></div>
      </dl>
    </button>
  </li>;
}

function CandidateBranchRegion(props: { candidates: readonly GoldenLoopCandidate[]; rejectedIds: readonly string[]; acceptedIds: readonly string[]; onOpen(id: string): void }) {
  if (!props.candidates.length) return null;
  return <section className="event-line-candidate-region" aria-labelledby="event-line-candidates-title" data-testid="event-line-candidate-region">
    <header><div><p className="eyebrow">独立候选投影</p><h2 id="event-line-candidates-title">尚未成为故事事实的候选分支</h2><p>候选不会进入上方正式脊柱；送入影响评审仍不等于正式事实。</p></div><span><GitBranch />{props.candidates.length} 条</span></header>
    <div>{props.candidates.map((candidate) => {
      const status = candidateStatus(candidate.id, props.rejectedIds, props.acceptedIds);
      return <button type="button" key={candidate.id} data-candidate-id={candidate.id} data-candidate-status={status} onClick={() => props.onOpen(candidate.id)}><span>{candidateStatusLabel(status)}</span><strong>{candidate.title}</strong><p>{candidate.change}</p><small>{candidateAffectedLabel(candidate)}</small><ArrowRight /></button>;
    })}</div>
  </section>;
}

function EventDetailDock(props: { event: EventLineEventSummary | null; detail: EventLineEventDetail | null; loading: boolean; error: CanonReadFailure | null; metadata: ReturnType<typeof eventLineEventMetadata> | null; onOpenTianyi(): void; onCreateFromEvent?(event: EventLineEventSummary): void }) {
  if (!props.event) return <DockEmpty icon={<FileText />} title="选择一个正式事件" body="事件详情只从已核验 Canon 读取，不会从相邻节点推断。" />;
  const semantic = eventLineSemanticNode(props.detail ?? props.event);
  const indicators = buildEventLocalIndicators(props.detail ? { id: props.detail.id, title: props.detail.title, tags: props.detail.tags, properties: props.detail.properties, body: props.detail.body, revision: props.detail.revisionToken, status: props.detail.status } : { id: props.event.id, title: props.event.title, tags: props.event.tags, revision: props.event.revisionToken, status: props.event.status });
  return <div className="event-line-dock-stack" data-testid="event-line-detail">
    <section><small>{eventRecordLabel(semantic.status)}</small><h2>{props.event.title}</h2><p>{semantic.status === "confirmed" ? <>作者确认 · 正式事件读取已核验<span className="sr-only">Canon 读取已核验</span></> : "作者尚未确认 · 保持为非正式投影"}</p></section>
    {props.loading ? <section aria-live="polite" data-testid="event-line-detail-loading"><RefreshCw /><p>正在读取正式详情…</p></section> : null}
    {props.error ? <section className="is-error" role="alert" data-testid="event-line-detail-error" data-error-kind={props.error.kind}><AlertTriangle /><strong>{canonReadFailureLabel(props.error.kind)}</strong><p>{props.error.message}</p></section> : null}
    {props.detail ? <><section><small>摘要</small>{authorEventBody(props.detail.body).map((paragraph, index) => <p key={`${index}:${paragraph}`}>{paragraph}</p>)}</section><section><small>语义层级</small><dl><div><dt>故事单元</dt><dd>{semantic.storyUnit.label}</dd></div><div><dt>集点</dt><dd>{semantic.setPoint.label}</dd></div><div><dt>故事线</dt><dd>{semantic.storyLine.label}</dd></div><div><dt>状态</dt><dd>{semanticStatusLabel(semantic.status)}</dd></div><div><dt>世界时间</dt><dd>{semantic.time.label}</dd></div><div><dt>来源版本</dt><dd>{authorSourceVersion(semantic.source.version)}</dd></div></dl></section><section><small>参与者与开放问题</small><p>{semantic.participants.length ? `参与者：${semantic.participants.join("、")}` : "参与者未知"}</p><p>{semantic.openQuestions.length ? `开放问题：${semantic.openQuestions.join("；")}` : "开放问题：暂无来源记录"}</p></section><SourceTechnicalDetails source={semantic.source} /><details className="event-line-indicator-details" open><summary>局部指标（只读）</summary><div className="event-line-indicator-grid">{indicators.map((item) => <article key={item.id} data-indicator-state={item.value === null ? "unknown" : "known"}><strong>{item.label}</strong><span>{item.valueLabel}</span><small>{item.value === null ? item.unknownReason : item.explanation}</small></article>)}</div></details></> : null}
    <button type="button" className="event-line-dock-primary" data-tianyi-drawer-trigger onClick={props.onOpenTianyi}><MessageCircle />带着这个事件问天意</button>
    {props.onCreateFromEvent && <button type="button" className="secondary-action" onClick={() => props.onCreateFromEvent?.(props.event!)}><BookOpen />创作所选内容</button>}
  </div>;
}

function EventRelationsDock(props: { event: EventLineEventSummary | null; incoming: readonly EventLineEventSummary[]; outgoing: readonly EventLineEventSummary[]; formalRelations: readonly RelationReadProjectionR0[] }) {
  if (!props.event) return <DockEmpty icon={<Link2 />} title="先选择正式事件" body="关联面只显示已保存的正式关系投影。" />;
  return <div className="event-line-dock-stack"><section><small>关系边界</small><h2>{props.event.title}</h2><p>相邻顺序不是因果；以下只展示现有 Relation owner 的已确认记录。</p></section><RelationGroup label="关联到本事件" events={props.incoming} /><RelationGroup label="本事件关联到" events={props.outgoing} />{props.formalRelations.map((relation) => <section key={relation.relationId}><small>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</small><p><Link2 />{relation.sourceObjectId === props.event!.id ? "本事件 → " : "→ 本事件 · "}{relation.sourceObjectId === props.event!.id ? relation.targetObjectId : relation.sourceObjectId}</p><small>{relation.evidenceWarnings.length ? `${relation.evidenceWarnings.length} 条证据待核验` : "关系证据已由 Owner 投影"}</small></section>)}{props.incoming.length + props.outgoing.length + props.formalRelations.length === 0 ? <section className="is-empty"><Link2 /><strong>没有已记录的正式关联</strong><p>事件线没有为这条记录补造因果边。</p></section> : null}</div>;
}

function RelationGroup(props: { label: string; events: readonly EventLineEventSummary[] }) {
  if (!props.events.length) return null;
  return <section><small>{props.label}</small>{props.events.map((event) => <p key={event.id}><Link2 />{event.title}</p>)}</section>;
}

function EventBranchesDock(props: { candidates: readonly GoldenLoopCandidate[]; rejectedIds: readonly string[]; acceptedIds: readonly string[]; selectedId: string | null; onSelect(id: string): void }) {
  if (!props.candidates.length) return <DockEmpty icon={<GitBranch />} title="当前没有候选分支" body="这里不会为填满界面而生成候选。" />;
  return <div className="event-line-dock-stack"><section><small>非 Canon 区域</small><h2>候选分支</h2><p>候选身份与正式 Event 身份始终分离。</p></section><div className="event-line-dock-candidates">{props.candidates.map((candidate) => {
    const status = candidateStatus(candidate.id, props.rejectedIds, props.acceptedIds);
    return <button type="button" key={candidate.id} className={candidate.id === props.selectedId ? "is-selected" : ""} aria-pressed={candidate.id === props.selectedId} onClick={() => props.onSelect(candidate.id)}><span>{candidateStatusLabel(status)}</span><strong>{candidate.title}</strong><p>{candidate.after}</p></button>;
  })}</div></div>;
}

function EventReviewDock(props: { candidate: GoldenLoopCandidate | null; status: EventCandidateStatus | null; onContinueReview(): void }) {
  // Candidate 不是故事事实；进入 Impact Review 仍不等于 Canon.
  if (!props.candidate) return <DockEmpty icon={<ShieldCheck />} title="选择一个候选" body="候选将在这里形成只读评审摘要，不会出现直接写入 Canon 的操作。" />;
  return <div className="event-line-dock-stack" data-testid="event-line-candidate-review"><section><small>{props.status ? candidateStatusLabel(props.status) : "候选"}</small><h2>{props.candidate.title}</h2><p>{props.candidate.change}</p></section><section><small>可能变化</small><p>{props.candidate.after}</p></section><section><small>影响与风险</small><p>{props.candidate.impact || "影响摘要将在现有评审链中核验。"}</p><p>{props.candidate.risk || "风险摘要尚未随候选投影提供。"}</p></section><section className="event-line-review-boundary"><ShieldCheck /><strong>候选不是故事事实</strong><p>进入影响评审仍不等于正式事实；写入仍只经过作者确认链。</p></section><button type="button" className="event-line-dock-primary" onClick={props.onContinueReview}>进入现有影响评审链<ArrowRight /></button></div>;
}

function SourceTechnicalDetails(props: { source: EventSemanticNode["source"] }) {
  const [copied, setCopied] = useState(false);
  const sourceText = [props.source.ref, props.source.hash, props.source.version].filter(Boolean).join("\n");
  const copySource = async () => {
    if (!sourceText) return;
    try {
      await navigator.clipboard.writeText(sourceText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return <details className="event-line-source-details"><summary>来源与技术详情</summary><dl><div><dt>来源标识</dt><dd>{props.source.ref || "未提供"}</dd></div><div><dt>来源校验</dt><dd>{props.source.hash || "未提供"}</dd></div><div><dt>完整版本</dt><dd>{props.source.version || "未提供"}</dd></div></dl><button type="button" className="secondary-action" disabled={!sourceText} onClick={() => void copySource()}>{copied ? "已复制来源标识" : "复制来源标识"}</button></details>;
}

function DockEmpty(props: { icon: ReactNode; title: string; body: string }) {
  return <div className="event-line-dock-empty">{props.icon}<strong>{props.title}</strong><p>{props.body}</p></div>;
}

function EventLineListState(props: { state: VerifiedCanonEventListRead | { status: "loading" }; invalidRecordCount: number; eventCount: number; warningDismissed: boolean; onDismissWarning(): void; onRetry(): void }) {
  if (props.state.status === "loading") return <p className="event-line-state" data-testid="event-line-list-loading">正在核验已确认事件…</p>;
  if (props.state.status === "error") return <div className="event-line-state is-error" role="alert" data-testid="event-line-list-error" data-error-kind={props.state.error.kind}><strong>{canonReadFailureLabel(props.state.error.kind)}</strong><span>{props.state.error.message}</span><button type="button" onClick={props.onRetry}><RefreshCw />重新读取</button></div>;
  if (props.invalidRecordCount > 0) return <>{!props.warningDismissed ? <div className="event-line-state is-warning is-dismissible" role="alert" data-testid="event-line-invalid-records"><AlertTriangle aria-hidden="true" /><div><strong>发现 {props.invalidRecordCount} 条未通过验证的确认外观记录</strong><span>这些记录已排除，不会伪装成正式事实。</span></div><button type="button" className="event-line-warning-retry" onClick={props.onRetry}><RefreshCw />重新核验</button><button type="button" className="event-line-warning-dismiss" aria-label="关闭核验警告" onClick={props.onDismissWarning}><X /></button></div> : null}{props.eventCount === 0 ? <p className="event-line-state" data-testid="event-line-no-verified-records">当前没有通过完整作者确认链验证的事件。</p> : null}</>;
  if (props.eventCount === 0) return <section className="event-line-empty" data-testid="event-line-empty"><BookOpen /><strong>还没有已确认事件</strong><p>先新建一个故事可能，或从已有内容开始排演；只有作者完成影响确认后才会出现在这里。</p></section>;
  return null;
}

function eventMatchesFilter(event: EventLineEventSummary, filter: EventLineFilter, currentUnitLabel: string | null, metadata: ReturnType<typeof eventLineEventMetadata>, result: GoldenLoopResult | null): boolean {
  if (filter.kind === "all") return true;
  if (filter.kind === "current-unit") return Boolean(currentUnitLabel && metadata.unitLabel === currentUnitLabel);
  if (filter.kind === "unit") return metadata.unitLabel === filter.value;
  if (filter.kind === "character") return metadata.characterLabels.includes(filter.value);
  if (filter.kind === "location") return metadata.locationLabels.includes(filter.value);
  return eventCandidateMarker(event, result, [], []) !== null;
}

function groupEventsByUnit(events: readonly EventLineEventSummary[], metadataById: Record<string, ReturnType<typeof eventLineEventMetadata>>): Array<{ label: string; setPoints: Array<{ label: string; events: EventLineEventSummary[] }> }> {
  const groups = new Map<string, Map<string, EventLineEventSummary[]>>();
  for (const event of events) {
    const label = metadataById[event.id]?.unitLabel ?? "未归入故事范围";
    const setPoint = metadataById[event.id]?.setPointLabel ?? metadataById[event.id]?.sceneLabel ?? "未指定集点";
    const group = groups.get(label) ?? new Map<string, EventLineEventSummary[]>();
    group.set(setPoint, [...(group.get(setPoint) ?? []), event]);
    groups.set(label, group);
  }
  return [...groups].map(([label, setPoints]) => ({ label, setPoints: [...setPoints].map(([setPointLabel, grouped]) => ({ label: setPointLabel, events: grouped })) }));
}

function eventCandidateMarker(event: EventLineEventSummary, result: GoldenLoopResult | null, rejectedIds: readonly string[], acceptedIds: readonly string[]): EventCandidateStatus | null {
  if (!result) return null;
  const sourceMatch = result.contextPack.sources.some((source) => source.id === event.id || source.label === event.title || source.content?.includes(event.id));
  const affected = result.nuwa.candidates.filter((candidate) => candidate.affectedObjects?.includes(event.id) || candidate.affectedObjects?.includes(event.title));
  const matches = sourceMatch ? result.nuwa.candidates : affected;
  if (!matches.length) return null;
  if (matches.some((candidate) => acceptedIds.includes(candidate.id))) return "submitted-to-impact";
  if (matches.every((candidate) => rejectedIds.includes(candidate.id))) return "rejected";
  return "awaiting";
}

function candidateStatus(id: string, rejectedIds: readonly string[], acceptedIds: readonly string[]): EventCandidateStatus {
  if (rejectedIds.includes(id)) return "rejected";
  if (acceptedIds.includes(id)) return "submitted-to-impact";
  return "awaiting";
}

function candidateStatusLabel(status: EventCandidateStatus): string {
  if (status === "rejected") return "已拒绝 · 未写入";
  if (status === "submitted-to-impact") return "已送影响评审 · 非 Canon";
  return "等待评审 · 非 Canon";
}

function semanticStatusLabel(status: ReturnType<typeof eventLineSemanticNode>["status"]): string {
  if (status === "confirmed") return "已确认";
  if (status === "candidate") return "待审候选";
  if (status === "prediction") return "待审推测";
  if (status === "unknown") return "状态未知";
  return "已归档";
}

function eventRecordLabel(status: ReturnType<typeof eventLineSemanticNode>["status"]): string {
  return status === "confirmed" ? "正式事件" : "事件投影";
}

function candidateAffectedLabel(candidate: GoldenLoopCandidate): string {
  const affected = candidate.affectedObjects ?? [];
  const authorLabels = affected.filter((item) => !/^(?:event[.:]|event-)/iu.test(item));
  if (authorLabels.length) return authorLabels.join(" · ");
  if (affected.length) return `${affected.length} 条正式事件来源`;
  return "影响对象待评审";
}

function confirmedChangeCount(event: EventLineEventSummary, detail: EventLineEventDetail | null): number | null {
  const tagCount = event.tags.filter((tag) => /^(?:Change|变化|变更)[：:]/iu.test(tag)).length;
  if (tagCount) return tagCount;
  const value = detail?.properties.changes ?? detail?.properties.change;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "string" && value.trim()) return 1;
  return null;
}

function canonReadFailureLabel(kind: CanonReadFailureKind): string {
  return ({
    "authority-failure": "作者确认链发生冲突",
    "parse-failure": "确认记录无法解析",
    "invalid-record": "确认记录结构无效",
    "repository-io": "本地仓库读取失败",
    "project-boundary": "项目边界校验失败"
  } as Record<CanonReadFailureKind, string>)[kind];
}

function authorEventBody(value: string): string[] {
  const paragraphs = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !/^(?:[-*]\s*)?(?:变更来源：|evidence[-:])/iu.test(line))
    .map((line) => line.replace(/^[-*]\s+/u, ""))
    .map((line) => {
      const dependency = line.match(/^event\.([^ ]+) is pulled into the preview as a dependency\.$/iu);
      return dependency ? `已有事件“${dependency[1]}”作为这次变化的依据。` : line;
    });
  return paragraphs.length ? paragraphs.slice(0, 6) : ["这条事件尚未提供正文说明。"];
}

function eventSummaryFromTags(tags: readonly string[]): string {
  const summary = tags.find((tag) => /^(?:观测摘要|摘要)[：:]/u.test(tag));
  return summary?.replace(/^(?:观测摘要|摘要)[：:]/u, "").trim() || "这条事件暂未提供作者摘要。";
}

function isConfirmedEventSummary(event: EventLineEventSummary | undefined): boolean {
  return Boolean(event && event.status === "committed" && event.tags.includes("作者确认"));
}

function splitAuthorList(value: string): string[] {
  return [...new Set(value.split(/[，,]/u).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

export type EventWorkspaceView = "spine" | "graph" | "timeline";
function projectionModeKey(projectId: string): string { return `tianyan.event-line-view/v1:${projectId}`; }
export function readProjectionMode(projectId: string): EventWorkspaceView {
  try {
    const view = new URLSearchParams(window.location.search).get("eventView");
    if (view === "graph" || view === "timeline" || view === "spine") return view;
    const stored = window.localStorage.getItem(projectionModeKey(projectId));
    return stored === "graph" || stored === "timeline" ? stored : "spine";
  } catch { return "spine"; }
}
export function writeProjectionMode(projectId: string, mode: EventWorkspaceView): void {
  try { window.localStorage.setItem(projectionModeKey(projectId), mode); } catch {}
}

function authorSourceRef(value: string | null | undefined): string {
  if (!value) return "来源未提供";
  const fixtureMatch = value.match(/^fixture-source-(\d+)$/u);
  return fixtureMatch ? `作者来源 ${fixtureMatch[1]}` : value;
}

function authorSourceVersion(value: string | null | undefined): string {
  if (!value) return "未提供";
  const repeated = value.match(/^(\d)\1{7,}$/u);
  if (repeated) return repeated[1]!;
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "zh-CN"));
}
