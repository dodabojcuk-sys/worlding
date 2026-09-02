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
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
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
import type { RelationReadProjectionR0, RelationTypeDefinitionR0 } from "../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TemporalProjectionRun } from "../../../../src/storyContracts/temporalProjection.ts";
import type { StoryCollectionPoint, StoryLogicReviewProjection, StoryModelingPlanProjection, StoryModelingRunProjection, StoryUnit } from "../lib/localTransport";
import type { PerspectiveMatch, StoryLogicFinding, StoryModelingPerspectiveRef, StoryModelingRequest, StoryModelingScope, StoryModelingTool } from "../../../../src/storyContracts/storyModeling.ts";
import { runLocalStoryLogicChecks } from "../../../../src/storyContracts/storyLogicChecks.ts";
import { buildPerspectiveComparison, buildSinglePerspectiveProjection, listPerspectiveObjects, perspectiveModeForSelection, type PerspectiveObjectRef, type PerspectiveProjectionMatch, type PerspectiveVisibility } from "../../../../src/storyContracts/eventPerspectiveProjection.ts";

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
  storyUnits?: StoryUnit[];
  perspectiveObjects?: readonly PerspectiveObjectRef[];
  modelingRuns?: readonly StoryModelingRunProjection[];
  logicReviews?: readonly StoryLogicReviewProjection[];
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
  onOpenTianyi(reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[], predictionSourceUnitSummary?: string): void;
  onCreateFromEvent?(event: EventLineEventSummary): void;
  onSaveEvent?(input: EventDraftInput): Promise<EventLineEventSummary>;
  onTrashDraftEvent?(eventId: string): Promise<void>;
  onCreateUnit?(title: string): Promise<void>;
  onRenameUnit?(unitId: string, nextTitle: string): Promise<void>;
  onArchiveUnit?(unitId: string): Promise<void>;
  onCreateCollectionPoint?(input: { title: string; eventIds: string[] }): Promise<void>;
  onUpdateCollectionPoint?(input: { unitId: string; point: StoryCollectionPoint; title?: string; eventIds?: string[]; collapsed?: boolean; layout?: { x: number; y: number; pinned?: boolean } }): Promise<void>;
  onDissolveCollectionPoint?(input: { unitId: string; point: StoryCollectionPoint }): Promise<void>;
  onCreateGraphRelation?(input: { sourceEventId: string; targetEventId: string; relationTypeId?: string | null; sourceRef?: string }): Promise<void>;
  relationTypes?: readonly RelationTypeDefinitionR0[];
  onConfirmGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onUpdateGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onApproveModifiedGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onRejectGraphRelation?(relation: RelationReadProjectionR0): Promise<void>;
  onContinueReview(): void;
  onReadTemporalProjectionCache?(eventRefs: StoryStudioEventReference[]): Promise<{ status: "current" | "stale" | "missing"; run: TemporalProjectionRun | null; changedEventCount: number }>;
  onPlanStoryModeling?(input: { projectId: string; tool: StoryModelingTool; scope: StoryModelingScope; eventRefs: StoryStudioEventReference[]; previousManifestDigest?: string | null; structuralChange?: boolean }): Promise<StoryModelingPlanProjection>;
  onExecuteStoryModeling?(request: StoryModelingRequest): Promise<StoryModelingRunProjection>;
  onStopStoryModeling?(runId: string): Promise<StoryModelingRunProjection>;
  onReviewLogicFinding?(finding: Pick<StoryLogicFinding, "findingId" | "source" | "evidenceRefs"> & { authorStatus: "ignored" | "resolved" }): Promise<StoryLogicReviewProjection>;
}) {
  const eventIds = props.events.map((event) => event.id).join("\u0000");
  const [localSelectedEventId, setLocalSelectedEventId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, EventLineEventDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<CanonReadFailure | null>(null);
  const [filter, setFilter] = useState<EventLineFilter>(() => props.roleLens ? { kind: "character", value: props.roleLens } : { kind: "all" });
  const [projectionMode, setProjectionMode] = useState<EventWorkspaceView>(() => readProjectionMode(props.projectId));
  const [temporalRun, setTemporalRun] = useState<TemporalProjectionRun | null>(null);
  const [temporalState, setTemporalState] = useState<"idle" | "loading" | "ready" | "stale" | "missing" | "failed" | "provider-unavailable">("idle");
  const [temporalMessage, setTemporalMessage] = useState<string | null>(null);
  const [modelingTool, setModelingTool] = useState<StoryModelingTool | null>(null);
  const [modelingScopeKind, setModelingScopeKind] = useState<StoryModelingScope["kind"]>("incremental");
  const [modelingPlan, setModelingPlan] = useState<StoryModelingPlanProjection | null>(null);
  const [modelingPlanState, setModelingPlanState] = useState<"idle" | "loading" | "ready" | "running" | "failed">("idle");
  const [modelingRun, setModelingRun] = useState<StoryModelingRunProjection | null>(null);
  const [aiToolbarExpanded, setAiToolbarExpanded] = useState(false);
  const [logicPanelOpen, setLogicPanelOpen] = useState(false);
  const [logicSelectionIds, setLogicSelectionIds] = useState<string[]>([]);
  const [activeModelingEventRefs, setActiveModelingEventRefs] = useState<StoryStudioEventReference[]>([]);
  const [activePerspectiveRefs, setActivePerspectiveRefs] = useState<StoryModelingPerspectiveRef[]>([]);
  const [spineZoom, setSpineZoom] = useState<"far" | "medium" | "near">("medium");
  const [unitCreateOpen, setUnitCreateOpen] = useState(false);
  const [unitActionMessage, setUnitActionMessage] = useState<string | null>(null);
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
  const groupedEvents = groupEventsByUnit(visibleEvents, metadataById, props.storyUnits ?? []);
  const storyUnitByTitle = useMemo(() => new Map((props.storyUnits ?? []).map((unit) => [unit.title, unit])), [props.storyUnits]);
  const selectedEvent = props.events.find((event) => event.id === selectedEventId) ?? null;
  const selectedDetail = selectedEventId ? detailsById[selectedEventId] ?? null : null;
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  const selectedEventRef = selectedEvent && (selectedEvent.status === "draft" || selectedEvent.status === "planned" || selectedEvent.status === "committed")
    ? createStoryStudioEventReference({ projectId: props.projectId, event: selectedEvent, requestedUse: "constraint" })
    : null;
  const relations = confirmedEventRelationProjection(selectedDetail);
  const formalRelations = props.relations ?? [];
  const localLogicFindings = useMemo(() => {
    const scopedIds = new Set(logicSelectionIds);
    const scopedEvents = logicSelectionIds.length ? props.events.filter((event) => scopedIds.has(event.id)) : props.events;
    const scopedRelations = logicSelectionIds.length ? formalRelations.filter((relation) => scopedIds.has(relation.sourceObjectId) && scopedIds.has(relation.targetObjectId)) : formalRelations;
    return runLocalStoryLogicChecks({
    events: scopedEvents.map((event) => ({ id: event.id, revisionToken: event.revisionToken, status: event.status, tags: event.tags })),
    relations: scopedRelations.map((relation) => ({ relationId: relation.relationId, sourceEventId: relation.sourceObjectId, targetEventId: relation.targetObjectId, reviewState: relation.reviewState, relationTypeId: relation.relationTypeId, relationTypeResolution: relation.relationTypeResolution, temporalOrder: relation.temporal?.orderConstraint ?? null })),
    unitIds: unitLabels
  });
  }, [eventIds, formalRelations, logicSelectionIds, props.events, unitLabels]);
  const reviewedLogicFindings = useMemo(() => {
    const reviews = new Map((props.logicReviews ?? []).map((review) => [review.findingId, review.authorStatus]));
    return localLogicFindings.map((finding) => ({ ...finding, authorStatus: reviews.get(finding.findingId) ?? finding.authorStatus }));
  }, [localLogicFindings, props.logicReviews]);
  const creationOpen = dockState.open && dockState.activeLens === "create";
  const modelingEventRefs = useMemo(() => props.events.flatMap((event) => event.status === "draft" || event.status === "planned" || event.status === "committed" ? [createStoryStudioEventReference({ projectId: props.projectId, event, requestedUse: "constraint" })] : []), [eventIds, props.events, props.projectId]);
  useEffect(() => {
    const latest = props.modelingRuns?.[0] ?? null;
    if (!latest || modelingPlanState === "running") return;
    setModelingRun(latest);
    if (["infer-temporal-position", "check-temporal-conflicts", "update-changed-scope"].includes(latest.tool) && latest.result) {
      setTemporalRun(modelingRunToTemporalProjection(latest, modelingEventRefs));
      setTemporalState(latest.status === "ready" ? "ready" : "stale");
      setTemporalMessage(latest.status === "ready" ? "已恢复上次只读时间建模结果。" : "已恢复历史时间结果，当前来源需要重新核对。");
    }
  }, [modelingPlanState, modelingEventRefs, props.modelingRuns]);
  const modelingRefsForIds = useCallback((eventIds: readonly string[]) => {
    const ids = new Set(eventIds);
    return modelingEventRefs.filter((reference) => ids.has(reference.eventId));
  }, [modelingEventRefs]);
  useEffect(() => {
    const receive = (event: Event) => {
      const run = (event as CustomEvent<StoryModelingRunProjection>).detail;
      if (!run || run.projectId !== props.projectId) return;
      setModelingRun(run);
      if (run.status === "created" || run.status === "running") {
        setModelingTool(null);
        setModelingPlanState("idle");
        setAiToolbarExpanded(true);
      }
    };
    window.addEventListener("story-studio-modeling-run-progress", receive);
    return () => window.removeEventListener("story-studio-modeling-run-progress", receive);
  }, [props.projectId]);

  const scopeFor = useCallback((kind: StoryModelingScope["kind"], refs: readonly StoryStudioEventReference[] = activeModelingEventRefs.length ? activeModelingEventRefs : modelingEventRefs): StoryModelingScope => {
    const sourceIds = refs.map((reference) => `event-source.${reference.eventId}`);
    if (kind === "full-book") return { kind, sourceIds };
    if (kind === "selection") {
      const selectedRefs = refs.length ? [...refs] : selectedEventRef ? [selectedEventRef] : modelingEventRefs;
      return { kind, sourceIds: selectedRefs.map((reference) => `event-source.${reference.eventId}`), eventRefs: selectedRefs, unitIds: selectedEvent && metadataById[selectedEvent.id]?.unitLabel ? [metadataById[selectedEvent.id]!.unitLabel!] : [] };
    }
    const changed = selectedEventRef ? [`event-source.${selectedEventRef.eventId}`] : sourceIds.slice(-1);
    const dependency = selectedEventRef ? sourceIds.filter((id) => !changed.includes(id)).slice(-2) : sourceIds.slice(-3, -1);
    return { kind, changedSourceIds: changed, dependencySourceIds: dependency };
  }, [activeModelingEventRefs, metadataById, modelingEventRefs, selectedEvent, selectedEventRef]);

  const openModelingTool = useCallback(async (tool: StoryModelingTool, options?: { eventRefs?: StoryStudioEventReference[]; perspectiveRefs?: StoryModelingPerspectiveRef[] }) => {
    const refs = options?.eventRefs?.length ? options.eventRefs : modelingEventRefs;
    if (!props.onPlanStoryModeling || !refs.length) return;
    setActiveModelingEventRefs(refs);
    setActivePerspectiveRefs(options?.perspectiveRefs ?? []);
    setModelingTool(tool);
    const initialKind: StoryModelingScope["kind"] = options?.eventRefs?.length ? "selection" : "incremental";
    setModelingScopeKind(initialKind);
    setModelingPlanState("loading");
    try {
      const plan = await props.onPlanStoryModeling({ projectId: props.projectId, tool, scope: scopeFor(initialKind, refs), eventRefs: refs, previousManifestDigest: modelingRun?.sourceManifestDigest ?? null });
      setModelingPlan(plan);
      setModelingPlanState("ready");
    } catch {
      setModelingPlan(null);
      setModelingPlanState("failed");
    }
  }, [modelingEventRefs, modelingRun?.sourceManifestDigest, props.onPlanStoryModeling, props.projectId, scopeFor]);

  const changeModelingScope = useCallback(async (kind: StoryModelingScope["kind"]) => {
    if (!modelingTool || !props.onPlanStoryModeling) return;
    setModelingScopeKind(kind);
    setModelingPlanState("loading");
    try {
      const refs = activeModelingEventRefs.length ? activeModelingEventRefs : modelingEventRefs;
      const plan = await props.onPlanStoryModeling({ projectId: props.projectId, tool: modelingTool, scope: scopeFor(kind, refs), eventRefs: refs, previousManifestDigest: modelingRun?.sourceManifestDigest ?? null, structuralChange: kind === "full-book" });
      setModelingPlan(plan);
      setModelingPlanState("ready");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "本次故事建模失败。";
      setModelingPlanState("failed");
      if (["infer-temporal-position", "check-temporal-conflicts", "update-changed-scope"].includes(modelingTool)) {
        setTemporalState(/provider|credential|model/iu.test(reason) ? "provider-unavailable" : "failed");
        setTemporalMessage(reason);
      }
    }
  }, [activeModelingEventRefs, modelingEventRefs, modelingRun?.sourceManifestDigest, modelingTool, props.onPlanStoryModeling, props.projectId, scopeFor]);

  const confirmModeling = useCallback(async () => {
    if (!modelingTool || !modelingPlan || !props.onExecuteStoryModeling || modelingPlanState !== "ready") return;
    setModelingPlanState("running");
    try {
      const refs = activeModelingEventRefs.length ? activeModelingEventRefs : modelingEventRefs;
      const request: StoryModelingRequest = { projectId: props.projectId, operationId: `story-modeling-operation.${crypto.randomUUID()}`, tool: modelingTool, trigger: "author-requested", scope: modelingPlan.scope, manifest: modelingPlan.manifest, eventRefs: refs, selectedPerspectiveRefs: activePerspectiveRefs, estimate: modelingPlan.estimate, authorConfirmedAt: new Date().toISOString() };
      const run = await props.onExecuteStoryModeling(request);
      setModelingRun(run);
      (window as Window & { __storyStudioStoryModelingRun?: StoryModelingRunProjection }).__storyStudioStoryModelingRun = run;
      window.dispatchEvent(new CustomEvent("story-studio-story-modeling-run", { detail: run }));
      if (run.tool === "infer-temporal-position" && run.result) {
        const temporal = modelingRunToTemporalProjection(run, refs);
        setTemporalRun(temporal);
        setTemporalState("ready");
        setTemporalMessage(run.provider?.executionKind === "test-provider" ? "测试 Provider 已生成只读时间候选；未写入正式时间。" : "故事建模已生成只读时间候选；未写入正式时间。");
      }
      setModelingPlanState("idle");
      setModelingTool(null);
    } catch { setModelingPlanState("failed"); }
  }, [activeModelingEventRefs, activePerspectiveRefs, modelingEventRefs, modelingPlan, modelingPlanState, modelingTool, props.onExecuteStoryModeling, props.projectId]);

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
  const openTianyiForEvents = (eventIds: readonly string[], intent: "explain" | "predict") => {
    const references = eventIds.flatMap((eventId) => {
      const event = props.events.find((item) => item.id === eventId);
      return event && (event.status === "draft" || event.status === "planned" || event.status === "committed") ? [createStoryStudioEventReference({ projectId: props.projectId, event, requestedUse: "constraint" })] : [];
    });
    const units = unique(eventIds.flatMap((eventId) => metadataById[eventId]?.unitLabel ?? []));
    const unitSummary = units.length === 1 ? `单元 · ${units[0]}` : units.length > 1 ? `${units.length} 个单元` : "当前事件范围";
    const labels = references.map((reference) => props.events.find((event) => event.id === reference.eventId)?.title ?? reference.eventId);
    const initialDraft = intent === "explain" ? `请解释这些事件在当前故事中的联系：${labels.join("、")}` : undefined;
    props.onOpenTianyi(references.length ? references : undefined, initialDraft, labels, unitSummary);
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
    if (next === "graph" || next === "timeline" || next === "perspective") {
      window.dispatchEvent(new Event("story-studio-close-project-directory"));
    }
    setProjectionMode(next);
  };
  useEffect(() => { writeProjectionMode(props.projectId, projectionMode); }, [projectionMode, props.projectId]);
  useEffect(() => {
    if (projectionMode !== "timeline" || !props.onReadTemporalProjectionCache) return;
    const refs = props.events.flatMap((event) => event.status === "draft" || event.status === "planned" || event.status === "committed" ? [createStoryStudioEventReference({ projectId: props.projectId, event, requestedUse: "constraint" })] : []);
    if (!refs.length) { setTemporalState("idle"); setTemporalMessage("当前没有可用的版本化事件依据。"); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTemporalState("loading");
      setTemporalMessage("正在读取本图修订的本地缓存；不会启动 AI 分析。");
      void props.onReadTemporalProjectionCache!(refs).then((cache) => {
        if (cancelled) return;
        setTemporalRun(cache.run);
        setTemporalState(cache.status === "current" ? "ready" : cache.status);
        setTemporalMessage(cache.status === "current"
          ? "正在显示当前缓存投影；切换、缩放和刷新不会启动新 Run。"
          : cache.status === "stale"
            ? `正在显示旧投影；约 ${cache.changedEventCount} 个事件或依赖已变化，可由作者选择更新范围。`
            : "尚无 AI 时间投影；当前显示正式事件与关系生成的基础布局。");
        const run = cache.run;
        if (!run) return;
        const host = window as Window & { __storyStudioTemporalProjectionRun?: TemporalProjectionRun };
        host.__storyStudioTemporalProjectionRun = run;
        window.dispatchEvent(new CustomEvent("story-studio-temporal-projection-run", { detail: run }));
      }).catch((error) => {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : "本地时间投影服务暂不可用。";
        setTemporalState(/provider|credential|model/iu.test(reason) ? "provider-unavailable" : "failed");
        setTemporalMessage(`缓存读取失败：${reason}当前仍可使用基础布局；没有启动 Provider，也没有写入时间事实。`);
      });
    }, 380);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [eventIds, projectionMode, props.onReadTemporalProjectionCache, props.projectId]);
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
  const openEventInView = (eventId: string, view: "graph" | "timeline") => {
    setSelectedEventId(eventId);
    requestDockState({ open: false, activeLens: "detail" }, eventId);
    selectView(view);
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
          <div className="event-line-view-navigation">
            <nav className="event-line-view-switch is-primary" aria-label="事件线一级视图">
              <button type="button" aria-pressed={projectionMode === "spine"} onClick={() => selectView("spine")}><Layers3 />故事结构</button>
              <button type="button" aria-pressed={projectionMode !== "spine"} onClick={() => selectView(projectionMode === "spine" ? "graph" : projectionMode)}><Network />事件画布</button>
            </nav>
            {projectionMode !== "spine" ? <nav className="event-line-view-switch is-secondary" aria-label="事件画布观察维度">
              <button type="button" aria-pressed={projectionMode === "graph"} onClick={() => selectView("graph")}><Network />关系</button>
              <button type="button" aria-pressed={projectionMode === "timeline"} onClick={() => selectView("timeline")}><Clock3 />时间</button>
              <button type="button" aria-pressed={projectionMode === "perspective"} onClick={() => selectView("perspective")}><UsersRound />视角</button>
            </nav> : null}
          </div>
          <div className="event-line-view-actions">{props.onSaveEvent ? <button type="button" className="primary-action" onClick={beginEventCreate}><FileText />新增事件</button> : null}{projectionMode === "spine" ? <><button type="button" aria-pressed={unitCreateOpen} onClick={() => setUnitCreateOpen((value) => !value)}><Plus />新建单元</button><label className="story-spine-zoom"><span>层级</span><select value={spineZoom} onChange={(event) => setSpineZoom(event.target.value as typeof spineZoom)}><option value="far">远景 · 单元</option><option value="medium">中景 · 关键事件</option><option value="near">近景 · 全部事件</option></select></label></> : null}<button type="button" disabled={!selectedEvent} onClick={revealCurrentEvent}><LocateFixed />聚焦当前</button></div>
        </header>
        {creationNotice ? <p className="event-line-creation-notice" role="status">{creationNotice}<button type="button" aria-label="关闭提示" onClick={() => setCreationNotice(null)}><X /></button></p> : null}
        <EventLineListState state={props.listState} invalidRecordCount={props.listState.status === "ready" ? props.listState.invalidRecordCount : 0} eventCount={props.events.length} warningDismissed={invalidRecordWarningDismissed} onDismissWarning={() => setInvalidRecordWarningDismissed(true)} onRetry={props.onRetry} />
        {projectionMode === "graph" || projectionMode === "timeline" ? <EventGraphCanvas mode={projectionMode === "timeline" ? "temporal" : "graph"} temporalRun={temporalRun} temporalState={temporalState} temporalMessage={temporalMessage} projectId={props.projectId} events={props.events} storyUnits={props.storyUnits} relations={formalRelations} relationTypes={props.relationTypes ?? []} selectedEventId={selectedEventId} onSelectEvent={openGraphEvent} onClearSelection={() => setSelectedEventId(null)} onCreateEvent={beginEventCreate} onTrashDraftEvent={props.onTrashDraftEvent} onCreateCollectionPoint={props.onCreateCollectionPoint} onUpdateCollectionPoint={props.onUpdateCollectionPoint} onDissolveCollectionPoint={props.onDissolveCollectionPoint} createOpen={creationOpen} onCloseCreate={closeEventCreate} createInspector={props.onSaveEvent ? <EventCreateInspector busy={creatingEvent} error={creationError} defaultStoryUnit={props.currentUnitLabel ?? ""} onCancel={closeEventCreate} onSave={(input) => void saveEventDraft(input)} /> : null} onOpenStorySpine={() => selectView("spine")} onOpenTimeline={() => selectView("timeline")} onReturnGraph={() => selectView("graph")} onCreateRelation={props.onCreateGraphRelation} onConfirmRelation={props.onConfirmGraphRelation} onUpdateRelation={props.onUpdateGraphRelation} onApproveModifiedRelation={props.onApproveModifiedGraphRelation} onRejectRelation={props.onRejectGraphRelation} onOpenLogicCheck={(eventIds) => { setLogicSelectionIds(eventIds); setLogicPanelOpen(true); }} onExplainWithTianyi={(eventIds) => openTianyiForEvents(eventIds ?? [], "explain")} onOpenTianyi={(eventIds) => openTianyiForEvents(eventIds ?? [], "predict")} /> : null}
        {projectionMode === "perspective" ? <PerspectiveLens events={props.events} objects={props.perspectiveObjects ?? []} relations={formalRelations} aiMatches={modelingRun?.tool === "analyze-perspective" ? modelingRun.result?.perspectiveMatches ?? [] : []} onOpenAi={(selected) => void openModelingTool("analyze-perspective", { perspectiveRefs: selected.map((object) => ({ objectId: object.id, objectType: object.type, ownerId: object.ownerId ?? props.projectId, version: object.version ?? "unknown", scope: object.scope ?? "project", label: object.label })) })} /> : null}
        {projectionMode === "spine" && props.events.length > 0 && visibleEvents.length === 0 ? <section className="event-line-empty-filter" data-testid="event-line-filter-empty"><ListFilter /><strong>当前筛选没有匹配的事件</strong><p>筛选只改变本机观察范围；返回“全部脊柱”即可恢复。</p><button type="button" onClick={() => setFilter({ kind: "all" })}>查看全部脊柱</button></section> : null}
        {projectionMode === "spine" && props.events.length === 0 ? <section className="event-line-empty" data-testid="event-line-empty"><BookOpen /><strong>从第一个事件开始</strong><p>先记录作者已知的情节，之后再补充时间、地点、人物和关系。</p>{props.onSaveEvent ? <button type="button" className="primary-action" onClick={beginEventCreate}><FileText />创建第一个事件</button> : null}</section> : null}
        {projectionMode === "spine" && unitCreateOpen ? <UnitCreateBar busy={false} onCancel={() => setUnitCreateOpen(false)} onCreate={async (title) => { if (!props.onCreateUnit) return; try { await props.onCreateUnit(title); setUnitActionMessage(`已创建单元“${title}”。`); setUnitCreateOpen(false); } catch (error) { setUnitActionMessage(error instanceof Error ? error.message : "新建单元失败。"); } }} /> : null}
        {projectionMode === "spine" && unitActionMessage ? <p className="unit-action-message" role="status">{unitActionMessage}<button type="button" aria-label="关闭单元操作提示" onClick={() => setUnitActionMessage(null)}><X /></button></p> : null}
        {projectionMode === "spine" && visibleEvents.length > 0 ? <div className={`event-line-spine story-spine-map is-${spineZoom}`} data-testid="confirmed-story-spine" aria-label="故事脊柱主控结构" data-spine-zoom={spineZoom}>
          {groupedEvents.map((group, unitIndex) => { const unit = storyUnitByTitle.get(group.label) ?? null; return <StorySpineUnit key={group.label} group={group} unit={unit} unitIndex={unitIndex} current={group.label === props.currentUnitLabel} zoom={spineZoom} events={props.events} detailsById={detailsById} metadataById={metadataById} selectedEventId={selectedEventId} goldenLoop={props.goldenLoop} rejectedCandidateIds={props.rejectedCandidateIds} acceptedCandidateIds={props.acceptedCandidateIds} onOpenEvent={openEvent} onOpenGraph={(eventId) => openEventInView(eventId, "graph")} onOpenTimeline={(eventId) => openEventInView(eventId, "timeline")} onOpenUnitGraph={() => { const eventId = group.direct[0]?.id ?? group.setPoints[0]?.events[0]?.id; if (eventId) openEventInView(eventId, "graph"); }} onOpenUnitTimeline={() => { const eventId = group.direct[0]?.id ?? group.setPoints[0]?.events[0]?.id; if (eventId) openEventInView(eventId, "timeline"); }} onRename={async (nextTitle) => { if (!props.onRenameUnit || !unit) return; try { await props.onRenameUnit(unit.id, nextTitle); setUnitActionMessage(`单元已重命名为“${nextTitle}”。`); } catch (error) { setUnitActionMessage(error instanceof Error ? error.message : "重命名单元失败。"); } }} onArchive={async () => { if (!props.onArchiveUnit || !unit) return; try { await props.onArchiveUnit(unit.id); setUnitActionMessage(`单元“${group.label}”已归档；事件仍由原 owner 保留。`); } catch (error) { setUnitActionMessage(error instanceof Error ? error.message : "归档单元失败。"); } }} />; })}
        </div> : null}
        {projectionMode === "spine" ? <CandidateBranchRegion candidates={candidates} rejectedIds={props.rejectedCandidateIds} acceptedIds={props.acceptedCandidateIds} onOpen={openCandidate} /> : null}
      </main>
      <StoryModelingToolbar view={projectionMode} expanded={aiToolbarExpanded} onExpanded={setAiToolbarExpanded} disabled={!modelingEventRefs.length || !props.onPlanStoryModeling} onTool={(tool) => void openModelingTool(tool)} onOpenLocalLogic={() => { setLogicSelectionIds([]); setLogicPanelOpen(true); }} localFindingCount={reviewedLogicFindings.length} run={modelingRun} history={props.modelingRuns ?? []} onStop={props.onStopStoryModeling ? async () => { if (!modelingRun || !["created", "running"].includes(modelingRun.status)) return; const stopped = await props.onStopStoryModeling!(modelingRun.runId); setModelingRun(stopped); setModelingPlanState("idle"); } : undefined} />
      {projectionMode !== "graph" ? <PageContextDock pageId="event-line" label="事件线页面" state={dockState} lenses={dockLenses} onState={requestDockState} /> : null}
    </div>
    {modelingTool ? <StoryModelingConfirmation tool={modelingTool} scopeKind={modelingScopeKind} plan={modelingPlan} state={modelingPlanState} onScope={(kind) => void changeModelingScope(kind)} onCancel={() => { if (modelingPlanState === "running") return; setModelingTool(null); setModelingPlanState("idle"); }} onConfirm={() => void confirmModeling()} /> : null}
    {logicPanelOpen ? <StoryLogicPanel findings={reviewedLogicFindings} aiFindings={(modelingRun?.tool === "run-logic-check" ? modelingRun.result?.logicFindings ?? [] : []).map((finding) => ({ ...finding, authorStatus: props.logicReviews?.find((review) => review.findingId === finding.findingId)?.authorStatus ?? finding.authorStatus }))} onReview={props.onReviewLogicFinding} onClose={() => setLogicPanelOpen(false)} onRunAi={() => { setLogicPanelOpen(false); void openModelingTool("run-logic-check", { eventRefs: modelingRefsForIds(logicSelectionIds) }); }} onLocate={(eventId) => { setLogicPanelOpen(false); openEventInView(eventId, "graph"); }} /> : null}
  </section>;
}

function StoryModelingToolbar(props: { view: EventWorkspaceView; expanded: boolean; disabled: boolean; localFindingCount: number; run: StoryModelingRunProjection | null; history: readonly StoryModelingRunProjection[]; onExpanded(value: boolean): void; onTool(tool: StoryModelingTool): void; onOpenLocalLogic(): void; onStop?(): Promise<void> }) {
  const tools: Record<EventWorkspaceView, Array<{ id: StoryModelingTool; label: string }>> = {
    spine: [
      { id: "analyze-core-story", label: "分析核心故事线" },
      { id: "suggest-unit-boundaries", label: "建议单元边界" },
      { id: "check-structure-breaks", label: "检查结构断点" },
      { id: "compare-branch-units", label: "比较分支单元" }
    ],
    graph: [
      { id: "smart-relations", label: "智能连线" },
      { id: "check-broken-links", label: "检查断链" },
      { id: "suggest-causal-relations", label: "补充因果候选" }
    ],
    timeline: [
      { id: "infer-temporal-position", label: "推断时间位置" },
      { id: "check-temporal-conflicts", label: "检查时间冲突" },
      { id: "update-changed-scope", label: "更新变化范围" }
    ],
    perspective: [{ id: "analyze-perspective", label: "深度分析当前视角" }]
  };
  return <aside className={`story-modeling-toolbar ${props.expanded ? "is-expanded" : "is-collapsed"}`} aria-label="故事建模 AI 工具" data-testid="story-modeling-toolbar">
    <button type="button" className="story-modeling-toolbar-toggle" aria-expanded={props.expanded} onClick={() => props.onExpanded(!props.expanded)}><Sparkles /><span>AI 工具</span><b>{props.expanded ? "关闭" : "打开"}</b></button>
    {props.expanded ? <div className="story-modeling-toolbar-actions"><button type="button" onClick={props.onOpenLocalLogic}><ShieldCheck />本地逻辑检测{props.localFindingCount ? ` · ${props.localFindingCount}` : ""}</button>{tools[props.view].map((tool) => <button key={tool.id} type="button" disabled={props.disabled} onClick={() => props.onTool(tool.id)}><Sparkles />{tool.label}</button>)}</div> : null}
    {props.expanded && props.run ? <div className="story-modeling-last-run"><strong>{props.run.status === "ready" ? "本次建模已完成" : props.run.status === "running" || props.run.status === "created" ? "正在分批建模" : props.run.status === "stopped" ? "本次建模已停止" : "本次建模未完成"}</strong><span>{props.run.progress.completedBatches}/{props.run.progress.totalBatches} 批 · {props.run.progress.stage} · {props.run.progress.inputTokens + props.run.progress.outputTokens} tokens</span>{(props.run.status === "running" || props.run.status === "created") && props.onStop ? <button type="button" onClick={() => void props.onStop?.()}>停止本次建模</button> : null}<span>候选/投影仍未写入正式 Event、Relation、Canon 或 WorldState</span></div> : null}
    {props.expanded && props.history.length ? <details className="story-modeling-history"><summary>历史结果 · {props.history.length}</summary>{props.history.slice(0, 8).map((run) => <p key={run.runId}><strong>{modelingToolLabel(run.tool)}</strong><span>{run.status === "ready" ? "已完成" : run.status === "stopped" ? "已停止" : run.status === "failed" ? "失败" : "进行中"} · {run.progress.completedBatches}/{run.progress.totalBatches} 批</span></p>)}</details> : null}
  </aside>;
}

function PerspectiveLens(props: { events: readonly EventLineEventSummary[]; objects: readonly PerspectiveObjectRef[]; relations: readonly RelationReadProjectionR0[]; aiMatches: readonly PerspectiveMatch[]; onOpenAi(selected: readonly PerspectiveObjectRef[]): void }) {
  const evidenceObjects = useMemo(() => listPerspectiveObjects(props.events), [props.events]);
  const objects = props.objects;
  const [selected, setSelected] = useState<PerspectiveObjectRef[]>([]);
  const mode = perspectiveModeForSelection(selected);
  const projection = useMemo(() => {
    const relations = props.relations.map((relation) => ({ sourceEventId: relation.sourceObjectId, targetEventId: relation.targetObjectId, reviewState: relation.reviewState }));
    return mode === "single"
      ? buildSinglePerspectiveProjection({ events: props.events, relations, selected: selected[0]!, aiMatches: props.aiMatches })
      : mode === "compare"
        ? buildPerspectiveComparison({ events: props.events, relations, selected, aiMatches: props.aiMatches })
        : [];
  }, [mode, props.aiMatches, props.events, props.relations, selected]);
  const toggle = (object: PerspectiveObjectRef) => setSelected((current) => current.some((item) => item.id === object.id) ? current.filter((item) => item.id !== object.id) : current.length < 5 ? [...current, object] : current);
  return <section className="event-perspective-workspace" aria-label="事件视角轴" data-provider-calls-on-open="0">
    <span className="sr-only">选择 1–5 个人物、地点或物品；切换不会调用 AI</span>
    <aside className="event-perspective-picker"><header><UsersRound /><div><strong>视角观察</strong><span>1 个对象单独查看，2–5 个对象并排比较</span></div></header>{(["character", "location", "item"] as const).map((type) => <fieldset key={type}><legend>{type === "character" ? "人物" : type === "location" ? "地点" : "物品"}</legend>{objects.filter((object) => object.type === type).map((object) => <label key={object.id}><input type="checkbox" checked={selected.some((item) => item.id === object.id)} disabled={!selected.some((item) => item.id === object.id) && selected.length >= 5} onChange={() => toggle(object)} />{object.label}</label>)}{objects.every((object) => object.type !== type) ? <small>当前正式 Owner 中暂无{type === "character" ? "人物" : type === "location" ? "地点" : "物品"}；Event 标签仅作证据。</small> : null}</fieldset>)}{evidenceObjects.length ? <small className="event-perspective-evidence-note">Event 中识别到 {evidenceObjects.length} 个证据标记，未自动创建正式对象。</small> : null}</aside>
    <div className="event-perspective-canvas"><header><div><small>只读投影 · 切换零调用 · {mode === "single" ? "单对象" : mode === "compare" ? "对象比较" : "等待选择"}</small><h2>{mode === "single" ? `从 ${selected[0]!.label} 看故事` : mode === "compare" ? `${selected.map((item) => item.label).join(" × ")} 的知情比较` : "选择一个视角对象即可查看"}</h2></div><button type="button" disabled={!mode} onClick={() => props.onOpenAi(selected)}><Sparkles />深度分析</button></header>{!mode ? <div className="event-perspective-empty"><CircleDot /><strong>选择一个正式对象</strong><p>基础投影会立即显示，不会产生 Provider 调用。</p></div> : <><div className="event-perspective-results">{projection.map((item) => <article key={item.eventId} className={`is-${item.shared ? "shared" : "divergent"}`}><small>{mode === "single" ? perspectiveVisibilityLabel(item.matches[0]!.visibility) : item.shared ? "共同知情" : "知情差异"}</small><h3>{item.title}</h3><ul>{item.matches.map((match) => <li key={match.object.id} data-visibility={match.visibility}><strong>{match.object.label}</strong><span>{perspectiveVisibilityLabel(match.visibility)} · {perspectiveRelationLabel(match.relationKind)}</span><em>{Math.round(match.confidence * 100)}%</em></li>)}</ul><p>{evidenceSummary(item.matches)}</p></article>)}</div><p className="event-perspective-prose-note">第一人称改写属于“多元”的派生副本；此处只呈现可追溯的知情视角。</p></>}</div>
  </section>;
}

function StoryLogicPanel(props: { findings: readonly StoryLogicFinding[]; aiFindings: readonly StoryLogicFinding[]; onReview?(finding: Pick<StoryLogicFinding, "findingId" | "source" | "evidenceRefs"> & { authorStatus: "ignored" | "resolved" }): Promise<unknown>; onClose(): void; onRunAi(): void; onLocate(eventId: string): void }) {
  const all = [...props.findings, ...props.aiFindings];
  return <div className="story-logic-backdrop" role="presentation"><section className="story-logic-panel" role="dialog" aria-modal="true" aria-labelledby="story-logic-title"><header><div><small>剧情逻辑检测</small><h2 id="story-logic-title">本地完整性与 AI 语义检查</h2></div><button type="button" aria-label="关闭逻辑检测" onClick={props.onClose}><X /></button></header><div className="story-logic-levels"><article><ShieldCheck /><strong>本地完整性</strong><span>确定性检查 · 0 tokens · 自动可用</span></article><article><Sparkles /><strong>AI 语义逻辑</strong><span>仅在作者确认范围与费用后运行</span></article></div>{all.length ? <div className="story-logic-findings">{all.map((finding) => <article key={finding.findingId} className={`is-${finding.severity} is-${finding.authorStatus}`}><header><strong>{logicKindLabel(finding.kind)}</strong><span>{finding.source === "local" ? "本地确定性" : `AI 候选 · ${Math.round(finding.confidence * 100)}%`} · {finding.authorStatus === "pending" ? "待处理" : finding.authorStatus === "ignored" ? "已忽略" : "已处理"}</span></header><p>{finding.rationale}</p><small>{finding.impact}</small><footer>{finding.affectedEventIds[0] ? <button type="button" onClick={() => props.onLocate(finding.affectedEventIds[0]!)}><LocateFixed />定位事件</button> : null}<button type="button" disabled title="修复建议只生成候选；当前 owner 合同尚未开放自动修复">生成修复候选</button><button type="button" disabled={!props.onReview} aria-pressed={finding.authorStatus === "ignored"} onClick={() => void props.onReview?.({ findingId: finding.findingId, source: finding.source, evidenceRefs: finding.evidenceRefs, authorStatus: "ignored" })}>忽略</button><button type="button" disabled={!props.onReview} aria-pressed={finding.authorStatus === "resolved"} onClick={() => void props.onReview?.({ findingId: finding.findingId, source: finding.source, evidenceRefs: finding.evidenceRefs, authorStatus: "resolved" })}>标记已处理</button></footer></article>)}</div> : <p className="story-logic-clear"><CheckCircle2 />当前本地完整性检查未发现问题。</p>}<footer><button type="button" onClick={props.onClose}>关闭</button><button type="button" className="primary-action" onClick={props.onRunAi}><Sparkles />配置 AI 语义检查</button></footer></section></div>;
}

function perspectiveRelationLabel(kind: PerspectiveProjectionMatch["relationKind"]): string { return kind === "formal-participation" ? "正式参与" : kind === "formal-relation-impact" ? "正式关系影响" : kind === "upstream" ? "上游影响" : kind === "downstream" ? "下游影响" : kind === "none" ? "角色未知" : "AI 推断"; }
function perspectiveVisibilityLabel(kind: PerspectiveVisibility): string { return ({ experienced: "亲历", witnessed: "目击", informed: "正式关系告知", known: "已知", misunderstood: "误解", unknown: "未知", "blind-spot": "角色未知 · 作者可见盲区" })[kind]; }
function evidenceSummary(matches: readonly PerspectiveProjectionMatch[]): string { const eventCount = new Set(matches.flatMap((match) => match.evidenceRefs).filter((ref) => ref.startsWith("event:"))).size; const ownerCount = new Set(matches.map((match) => `${match.object.ownerId ?? match.object.id}@${match.object.version ?? "unknown"}`)).size; return `证据：${eventCount} 个事件来源 · ${ownerCount} 个 Owner 版本`; }
function logicKindLabel(kind: StoryLogicFinding["kind"]): string { return ({ "dangling-relation": "悬空关系", "stale-version": "版本已变化", "duplicate-id": "身份重复", "temporal-cycle": "时间循环", "orphan-unit-reference": "单元引用缺失", "deleted-reference": "引用对象已删除", "unresolved-relation-type": "关系类型待确认", "stale-cache": "缓存已过期", "causal-gap": "因果缺口", "motivation-break": "动机断裂", "knowledge-boundary": "知情边界", "item-continuity": "物品连续性", "location-continuity": "地点连续性", "temporal-plausibility": "时间合理性", "setup-payoff": "伏笔回收", "storyline-disconnect": "线索脱节", "emotion-pace-arc": "情绪节奏弧" })[kind]; }

function UnitCreateBar(props: { busy: boolean; onCancel(): void; onCreate(title: string): Promise<void> }) {
  const [title, setTitle] = useState("");
  return <form className="unit-create-bar" onSubmit={(event) => { event.preventDefault(); const value = title.trim(); if (value) void props.onCreate(value); }}><label><span>新单元名称</span><input autoFocus value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="例如：雾港封锁" /></label><button type="button" onClick={props.onCancel}>取消</button><button type="submit" className="primary-action" disabled={props.busy || !title.trim()}>创建单元</button></form>;
}

function StorySpineUnit(props: {
  group: ReturnType<typeof groupEventsByUnit>[number]; unit: StoryUnit | null; unitIndex: number; current: boolean; zoom: "far" | "medium" | "near";
  events: readonly EventLineEventSummary[]; detailsById: Record<string, EventLineEventDetail>; metadataById: Record<string, ReturnType<typeof eventLineEventMetadata>>; selectedEventId: string | null;
  goldenLoop: GoldenLoopResult | null; rejectedCandidateIds: readonly string[]; acceptedCandidateIds: readonly string[];
  onOpenEvent(id: string): void; onOpenGraph(id: string): void; onOpenTimeline(id: string): void; onOpenUnitGraph(): void; onOpenUnitTimeline(): void; onRename(title: string): Promise<void>; onArchive(): Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.group.label.replace(/^单元\s*\d+\s*·\s*/u, ""));
  const allEvents = [...props.group.direct, ...props.group.setPoints.flatMap((item) => item.events)];
  const visibleDirect = props.zoom === "near" ? props.group.direct : props.group.direct.slice(0, props.zoom === "medium" ? 3 : 0);
  const visibleSetPoints = props.zoom === "near" ? props.group.setPoints : props.zoom === "medium" ? props.group.setPoints.map((item) => ({ ...item, events: item.events.slice(0, 2) })) : [];
  const tags = allEvents.flatMap((event) => event.tags);
  const summary = allEvents.map((event) => eventSummaryFromTags(event.tags)).find(Boolean) ?? `${allEvents.length} 个事件构成当前叙事范围。`;
  const confirmed = allEvents.filter((event) => eventLineSemanticNode(event).status === "confirmed").length;
  const candidate = allEvents.length - confirmed;
  const conflicts = tags.filter((tag) => /冲突|conflict/iu.test(tag)).length;
  const branch = props.unit?.kind === "branch";
  return <section className={`story-spine-unit ${branch ? "is-branch-unit" : "is-main-unit"}`} data-current-unit={props.current ? "true" : "false"} data-unit-id={props.unit?.id ?? `unresolved-story-unit.${props.unitIndex + 1}`}>
    <div className="story-spine-trunk-marker"><span>{String(props.unitIndex + 1).padStart(2, "0")}</span></div>
    <article className="story-spine-unit-card">
      <header><div><small>{branch ? "分支单元" : props.current ? "主干单元 · 当前范围" : "主干单元"}</small>{editing ? <form onSubmit={(event) => { event.preventDefault(); const next = title.trim(); if (next) void props.onRename(next).then(() => setEditing(false)); }}><input aria-label={`重命名单元 ${props.group.label}`} value={title} onChange={(event) => setTitle(event.target.value)} /><button type="submit">保存</button><button type="button" onClick={() => setEditing(false)}>取消</button></form> : <h2>{props.group.label}</h2>}<p>{props.unit?.summary || summary}</p></div><span className="story-spine-sync-state"><CheckCircle2 />{props.unit ? storyUnitStatusLabel(props.unit.status) : "尚未绑定 Unit Owner"}</span></header>
      <dl className="story-spine-unit-semantics"><div><dt>单元目标</dt><dd>{props.unit?.objective || "未设置"}</dd></div><div><dt>核心冲突</dt><dd>{props.unit?.coreConflict || "未设置"}</dd></div><div><dt>关键转折</dt><dd>{props.unit?.turningPoint || "未设置"}</dd></div><div><dt>结果 / 开放钩子</dt><dd>{props.unit?.openHook || "未设置"}</dd></div></dl>
      <div className="story-spine-unit-stats"><span>已确认 <b>{confirmed}</b></span><span>候选 <b>{candidate}</b></span><span>冲突 <b>{conflicts}</b></span><span>来源：{branch ? `分支于 ${props.unit?.parentUnitId ?? "未设置"}` : "主故事"}</span>{props.unit?.mergeTargetUnitId ? <span>合流至：{props.unit.mergeTargetUnitId}</span> : null}</div>
      <nav className="story-spine-unit-actions" aria-label={`${props.group.label} 单元操作`}><button type="button" onClick={props.onOpenUnitGraph}><Network />在关系图中查看</button><button type="button" onClick={props.onOpenUnitTimeline}><Clock3 />在时间轴中查看</button><button type="button" onClick={() => setEditing(true)}>重命名</button><button type="button" onClick={() => void props.onArchive()}>归档</button></nav>
      {props.zoom !== "far" ? <div className="story-spine-events">
        {visibleDirect.length ? <section className="event-line-direct-nodes"><header><div><small>直接属于单元</small><h3>关键事件</h3></div><strong>{props.group.direct.length} 个节点</strong></header><ol>{visibleDirect.map((event) => <EventSpineNode key={event.id} event={event} detail={props.detailsById[event.id] ?? null} metadata={props.metadataById[event.id]} sequence={props.events.findIndex((item) => item.id === event.id) + 1} selected={event.id === props.selectedEventId} current={event.id === props.selectedEventId} candidateMarker={eventCandidateMarker(event, props.goldenLoop, props.rejectedCandidateIds, props.acceptedCandidateIds)} onOpen={() => props.onOpenEvent(event.id)} onOpenGraph={() => props.onOpenGraph(event.id)} onOpenTimeline={() => props.onOpenTimeline(event.id)} />)}</ol></section> : null}
        {visibleSetPoints.map((setPoint) => <section className="event-line-set-point" key={setPoint.label}><header><span><CircleDot /></span><div><small>可选集点</small><h3>{setPoint.label}</h3></div><strong>{setPoint.events.length} 个节点</strong></header><ol>{setPoint.events.map((event) => <EventSpineNode key={event.id} event={event} detail={props.detailsById[event.id] ?? null} metadata={props.metadataById[event.id]} sequence={props.events.findIndex((item) => item.id === event.id) + 1} selected={event.id === props.selectedEventId} current={event.id === props.selectedEventId} candidateMarker={eventCandidateMarker(event, props.goldenLoop, props.rejectedCandidateIds, props.acceptedCandidateIds)} onOpen={() => props.onOpenEvent(event.id)} onOpenGraph={() => props.onOpenGraph(event.id)} onOpenTimeline={() => props.onOpenTimeline(event.id)} />)}</ol></section>)}
      </div> : null}
    </article>
  </section>;
}

function storyUnitStatusLabel(status: StoryUnit["status"]): string { return ({ draft: "草稿单元", active: "与正式事件同步", candidate: "候选结构", conflict: "结构冲突", archived: "已归档" })[status]; }

function StoryModelingConfirmation(props: { tool: StoryModelingTool; scopeKind: StoryModelingScope["kind"]; plan: StoryModelingPlanProjection | null; state: "idle" | "loading" | "ready" | "running" | "failed"; onScope(kind: StoryModelingScope["kind"]): void; onCancel(): void; onConfirm(): void }) {
  const estimate = props.plan?.estimate;
  const toolLabel = modelingToolLabel(props.tool);
  const recommendation = props.plan?.recommendation.scopeKind === "reuse-cache" ? "复用缓存" : props.plan?.recommendation.scopeKind === "incremental" ? "增量建模" : props.plan?.recommendation.scopeKind === "selection" ? "选定范围" : "全书建模";
  return <div className="story-modeling-confirmation-backdrop" role="presentation">
    <section className="story-modeling-confirmation" role="dialog" aria-modal="true" aria-labelledby="story-modeling-confirmation-title" data-testid="story-modeling-confirmation">
      <header><div><small>作者确认后才会运行</small><h2 id="story-modeling-confirmation-title">{toolLabel}</h2></div><button type="button" aria-label="取消故事建模" disabled={props.state === "running"} onClick={props.onCancel}><X /></button></header>
      {props.state === "loading" ? <p role="status">正在读取版本化来源并计算范围与费用预估…</p> : null}
      {props.state === "failed" ? <p className="story-modeling-error" role="alert">无法完成本次预估；尚未调用 Provider，也没有创建 Run。</p> : null}
      {props.plan && estimate ? <>
        <section className="story-modeling-recommendation"><small>当前建议</small><strong>{recommendation}</strong><p>{props.plan.recommendation.reason} 作者仍可改选其他范围。</p></section>
        <fieldset><legend>运行范围</legend><label><input type="radio" name="story-modeling-scope" checked={props.scopeKind === "incremental"} onChange={() => props.onScope("incremental")} />增量建模</label><label><input type="radio" name="story-modeling-scope" checked={props.scopeKind === "selection"} onChange={() => props.onScope("selection")} />选定范围</label><label><input type="radio" name="story-modeling-scope" checked={props.scopeKind === "full-book"} onChange={() => props.onScope("full-book")} />全书建模</label></fieldset>
        <dl className="story-modeling-estimate"><div><dt>原始来源</dt><dd>{estimate.originalSourceCount} 个章节/场景/导入文档</dd></div><div><dt>结构化依据</dt><dd>{estimate.structuredEventCount} 个 Event</dd></div><div><dt>影响事件</dt><dd>{estimate.eventCount} 个</dd></div><div><dt>依赖</dt><dd>{estimate.dependencyCount} 个</dd></div><div><dt>Provider 请求</dt><dd>{estimate.providerRequestRange.min}–{estimate.providerRequestRange.max} 次</dd></div><div><dt>输入 tokens</dt><dd>{estimate.inputTokenRange.min.toLocaleString()}–{estimate.inputTokenRange.max.toLocaleString()}</dd></div><div><dt>输出 tokens</dt><dd>{estimate.outputTokenRange.min.toLocaleString()}–{estimate.outputTokenRange.max.toLocaleString()}</dd></div><div><dt>合计 tokens</dt><dd>{estimate.totalTokenRange.min.toLocaleString()}–{estimate.totalTokenRange.max.toLocaleString()}</dd></div><div><dt>预计费用</dt><dd>{estimate.cost.status === "available" ? `$${estimate.cost.min.toFixed(4)}–$${estimate.cost.max.toFixed(4)} USD` : "费用暂无法换算（当前模型缺少价格元数据）"}</dd></div></dl>
        <section className="story-modeling-output"><strong>将产生什么</strong><p>{props.tool === "smart-relations" || props.tool === "suggest-causal-relations" ? "带方向、类型建议、置信度、理由和来源证据的关系候选。" : props.tool === "infer-temporal-position" ? "时间推断点、推断区间、冲突与未定位托盘中的只读投影。" : "带来源引用与置信度的结构候选和只读故事投影。"}</p><p><ShieldCheck />不会自动写入 Event、正式 Relation、Canon 或 WorldState。</p></section>
      </> : null}
      <footer><button type="button" disabled={props.state === "running"} onClick={props.onCancel}>取消</button><button type="button" className="primary-action" disabled={props.state !== "ready"} onClick={props.onConfirm}>{props.state === "running" ? "正在运行…" : "确认运行一次"}</button></footer>
    </section>
  </div>;
}

function modelingToolLabel(tool: StoryModelingTool): string {
  return ({ "analyze-core-story": "分析核心故事线", "suggest-unit-boundaries": "建议单元边界", "check-structure-breaks": "检查结构断点", "compare-branch-units": "比较分支单元", "smart-relations": "智能连线", "check-broken-links": "检查断链", "suggest-causal-relations": "补充因果候选", "infer-temporal-position": "推断时间位置", "check-temporal-conflicts": "检查时间冲突", "update-changed-scope": "更新变化范围", "run-logic-check": "运行剧情逻辑检查", "analyze-perspective": "深度分析当前视角" })[tool];
}

function modelingRunToTemporalProjection(run: StoryModelingRunProjection, refs: StoryStudioEventReference[]): TemporalProjectionRun {
  const placementById = new Map(run.result?.temporalPlacements.map((item) => [item.eventId, item]) ?? []);
  return {
    version: "tianyan-temporal-projection/v1",
    runId: `temporal-run.${run.runId.slice("story-modeling-run.".length)}`,
    projectId: run.projectId,
    graphRevisionHash: run.sourceManifestDigest.slice(7),
    operationId: run.operationId,
    trigger: run.trigger,
    sourceSnapshot: refs,
    status: "ready",
    createdAt: run.createdAt,
    stale: false,
    placements: refs.map((reference, index) => {
      const candidate = placementById.get(reference.eventId);
      const kind = candidate?.kind === "interval" ? "ambiguous" : candidate?.kind ?? "unplaced";
      return { versionedEventRef: reference, placementKind: kind, relativePosition: candidate?.x ?? 160 + index * 180, segmentId: kind === "anchored" ? "temporal-segment.authored" : kind === "conflict" ? "temporal-segment.conflict" : kind === "unplaced" ? "temporal-segment.unplaced" : "temporal-segment.inferred", authoredTimeLabel: kind === "anchored" ? candidate?.label ?? null : null, inferredWindow: candidate?.interval ?? (kind === "inferred" ? { start: Math.max(0, (candidate?.x ?? 0) - 40), end: (candidate?.x ?? 0) + 40 } : null), anchorBeforeEventIds: [], anchorAfterEventIds: [], confidence: candidate?.confidence ?? null, evidenceRefs: candidate?.sourceRefs ?? [], authorFacingSummary: candidate?.label ?? "暂无足够证据定位。", alternatives: [] };
    }),
    segments: [
      { id: "temporal-segment.authored", order: 0, label: "正式时间锚点", kind: "authored_anchor", startAnchorEventIds: [], endAnchorEventIds: [], confidence: 1 },
      { id: "temporal-segment.inferred", order: 1, label: "推断时间区间", kind: "interval", startAnchorEventIds: [], endAnchorEventIds: [], confidence: .72 },
      { id: "temporal-segment.conflict", order: 2, label: "时间冲突", kind: "unresolved", startAnchorEventIds: [], endAnchorEventIds: [], confidence: null },
      { id: "temporal-segment.unplaced", order: 3, label: "未定位托盘", kind: "unresolved", startAnchorEventIds: [], endAnchorEventIds: [], confidence: null }
    ],
    conflicts: run.result?.temporalPlacements.filter((item) => item.kind === "conflict").map((item) => ({ id: `temporal-conflict.${item.eventId}`, eventIds: [item.eventId, refs.find((ref) => ref.eventId !== item.eventId)?.eventId ?? item.eventId], summary: item.label, evidenceRefs: item.sourceRefs })) ?? [],
    failureReason: null
  };
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
  onOpenGraph(): void;
  onOpenTimeline(): void;
}) {
  const summary = props.detail ? authorEventBody(props.detail.body)[0] : eventSummaryFromTags(props.event.tags);
  const semantic = props.detail ? eventLineSemanticNode(props.detail) : eventLineSemanticNode(props.event);
  return <li className={props.selected ? "is-selected" : ""} data-confirmed-event-id={props.event.id} data-current-event={props.current ? "true" : "false"} data-event-status={semantic.status}>
    <span className="event-line-spine-node" aria-hidden="true">{props.sequence}</span>
    <button type="button" onClick={props.onOpen} aria-label={`查看正式事件：${props.event.title}`}>
      <header><span className={semantic.status === "confirmed" ? "event-line-canon-state" : "event-line-candidate-marker"}><CheckCircle2 />{eventRecordLabel(semantic.status)}</span><span><Clock3 />{semantic.time.label}</span>{props.current ? <span className="event-line-current-state"><LocateFixed />当前</span> : null}{props.candidateMarker ? <span className="event-line-candidate-marker"><GitBranch />{candidateStatusLabel(props.candidateMarker)}</span> : null}</header>
      <h3 title={props.event.title}>{props.event.title}</h3>
      {summary ? <p>{summary}</p> : null}
      <footer><span><UsersRound />{props.metadata.characterLabels.length ? props.metadata.characterLabels.join("、") : "人物未标注"}</span><span>{props.metadata.setPointLabel ? `集点 · ${props.metadata.setPointLabel}` : "直接属于单元"}</span></footer>
    </button>
    <nav className="event-spine-cross-view" aria-label={`${props.event.title} 跨视图定位`}><button type="button" onClick={props.onOpenGraph}><Network />关系图</button><button type="button" onClick={props.onOpenTimeline}><Clock3 />时间轴</button></nav>
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

function groupEventsByUnit(events: readonly EventLineEventSummary[], metadataById: Record<string, ReturnType<typeof eventLineEventMetadata>>, units: readonly StoryUnit[]): Array<{ label: string; direct: EventLineEventSummary[]; setPoints: Array<{ label: string; events: EventLineEventSummary[] }> }> {
  const groups = new Map<string, { direct: EventLineEventSummary[]; setPoints: Map<string, EventLineEventSummary[]> }>();
  const formalUnitByEvent = new Map<string, StoryUnit>();
  for (const unit of [...units].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))) for (const eventId of unit.linkedEntityIds) {
    if (!formalUnitByEvent.has(eventId)) formalUnitByEvent.set(eventId, unit);
  }
  for (const event of events) {
    const formalUnit = formalUnitByEvent.get(event.id);
    const label = formalUnit?.title ?? metadataById[event.id]?.unitLabel ?? "未归入故事范围";
    const setPoint = formalUnit?.collectionPoints?.find((point) => point.eventIds.includes(event.id))?.title ?? null;
    const group = groups.get(label) ?? { direct: [], setPoints: new Map<string, EventLineEventSummary[]>() };
    if (setPoint) group.setPoints.set(setPoint, [...(group.setPoints.get(setPoint) ?? []), event]);
    else group.direct.push(event);
    groups.set(label, group);
  }
  return [...groups].map(([label, group]) => ({ label, direct: group.direct, setPoints: [...group.setPoints].map(([setPointLabel, grouped]) => ({ label: setPointLabel, events: grouped })) }));
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
  return summary?.replace(/^(?:观测摘要|摘要)[：:]/u, "").trim() || "";
}

function isConfirmedEventSummary(event: EventLineEventSummary | undefined): boolean {
  return Boolean(event && event.status === "committed" && event.tags.includes("作者确认"));
}

function splitAuthorList(value: string): string[] {
  return [...new Set(value.split(/[，,]/u).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

export type EventWorkspaceView = "spine" | "graph" | "timeline" | "perspective";
function projectionModeKey(projectId: string): string { return `tianyan.event-line-view/v1:${projectId}`; }
export function readProjectionMode(projectId: string): EventWorkspaceView {
  try {
    const view = new URLSearchParams(window.location.search).get("eventView");
    if (view === "graph" || view === "timeline" || view === "perspective" || view === "spine") return view;
    const stored = window.localStorage.getItem(projectionModeKey(projectId));
    return stored === "graph" || stored === "timeline" || stored === "perspective" ? stored : "spine";
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
