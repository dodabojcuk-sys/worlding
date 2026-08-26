import { ArrowLeft, BookOpen, Eye, Layers3, PanelsTopLeft, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { GoldenLoopResult } from "../lib/goldenLoopContract";
import type { VerifiedCanonEventListRead, VisualDocument } from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import type { StoryStudioEventReference } from "../../../../src/storyContracts/storyStudioEventReference";
import { eventLineEventMetadata, type EventLineEventSummary, type VerifiedCanonEventDetailRead } from "./eventLineCommittedEvents";
import { EventLineWorkbench } from "./EventLineWorkbench";
import { StoryObservationCanvas, type StoryObservationReviewSubmission } from "./story-observation/StoryObservationCanvas";
import type { StoryObservationProposalPatch } from "../../../../src/storyContracts/storyObservationProposalPatch";
import { resolveEventObservationView, type EventObservationView } from "./event-observation/eventObservationRoute";

export type { EventObservationView } from "./event-observation/eventObservationRoute";

function setCanonicalView(view: EventObservationView): void {
  const url = new URL(window.location.href);
  if (url.pathname.replace(/\/+$/u, "") !== "/event-line") return;
  url.searchParams.set("view", view);
  url.searchParams.delete("storyCanvas");
  window.history.replaceState({ ...(window.history.state ?? {}), workspace: "event-line", view }, "", `${url.pathname}${url.search}${url.hash}`);
}

/** One formal /event-line host. It owns only presentation state: projection,
 * lens and selected Event ID. The renderers remain projections over the
 * existing Event/WorldState/Candidate owners. */
export function EventObservationWorkspace(props: {
  projectId: string;
  projectTitle: string;
  events: EventLineEventSummary[];
  listState: VerifiedCanonEventListRead | { status: "loading" };
  visualDocuments: VisualDocument[];
  goldenLoop: GoldenLoopResult | null;
  rejectedCandidateIds: string[];
  acceptedCandidateIds: string[];
  currentFocusLabel: string;
  currentUnitLabel: string | null;
  storedView: EventObservationView | null;
  onViewChange(next: EventObservationView): void;
  onReadEvent(eventId: string): Promise<VerifiedCanonEventDetailRead>;
  onRetry(): void;
  onOpenTianyi(reference?: StoryStudioEventReference): void;
  onCreateFromEvent?(event: EventLineEventSummary): void;
  onCreateEvent?(): void;
  onSubmitProposal(patch: StoryObservationProposalPatch): Promise<StoryObservationReviewSubmission>;
  onContinueReview(result?: GoldenLoopResult): void;
  returnToData?: { label: string; onReturn(): void } | null;
}) {
  const initial = resolveEventObservationView(window.location.search, props.storedView);
  const [view, setView] = useState<EventObservationView>(() => initial.view);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(() => {
    const requested = new URL(window.location.href).searchParams.get("event");
    if (requested) return requested;
    return new URL(window.location.href).searchParams.get("fixture") === "event-hierarchy" ? props.events[0]?.id ?? null : null;
  });
  const [roleLens, setRoleLens] = useState<string | null>(null);
  const roleLabels = useMemo(() => [...new Set(props.events.flatMap((event) => eventLineEventMetadata(event).characterLabels))], [props.events]);

  useEffect(() => {
    const syncRouteView = () => {
      const requested = resolveEventObservationView(window.location.search, props.storedView);
      const next = requested.view;
      setView(next);
      if (!requested.explicit || requested.legacyCanvas) setCanonicalView(next);
    };
    syncRouteView();
    window.addEventListener("popstate", syncRouteView);
    return () => window.removeEventListener("popstate", syncRouteView);
  }, [props.projectId, props.storedView]);

  useEffect(() => {
    const requestedEventId = new URL(window.location.href).searchParams.get("event");
    if (requestedEventId && props.events.some((event) => event.id === requestedEventId)) {
      if (selectedEventId !== requestedEventId) setSelectedEventId(requestedEventId);
      return;
    }
    if (selectedEventId && !props.events.some((event) => event.id === selectedEventId)) setSelectedEventId(null);
  }, [props.events, selectedEventId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedEventId) url.searchParams.set("event", selectedEventId);
    else url.searchParams.delete("event");
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "event-line", selectedEventId }, "", `${url.pathname}${url.search}${url.hash}`);
  }, [selectedEventId]);

  const chooseView = (next: EventObservationView) => {
    setView(next);
    props.onViewChange(next);
    setCanonicalView(next);
  };
  const onViewTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, current: EventObservationView) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const views: EventObservationView[] = ["spine", "canvas", "timeline"];
    const currentIndex = views.indexOf(current);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : views.length - 1)) % views.length;
    const next = views[nextIndex]!;
    chooseView(next);
    window.requestAnimationFrame(() => document.getElementById(`event-observation-${next}-tab`)?.focus());
  };

  return <section className="workbench event-observation-workspace" data-testid="event-observation-workspace" data-event-observation-view={view} data-selected-event-id={selectedEventId || ""}>
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="事件线"
      title="事件观测"
      status={<span className="is-confirmed">同一批已确认事件的三种投影</span>}
      prototype="workbench"
      icon={<BookOpen />}
      className="event-observation-header"
      actions={<div className="event-observation-header-actions">
        {props.returnToData ? <button type="button" className="secondary-action event-return-to-data" onClick={props.returnToData.onReturn}><ArrowLeft />{props.returnToData.label}</button> : null}
        {props.onCreateEvent ? <button type="button" className="primary-action" onClick={props.onCreateEvent}><BookOpen />新建事件</button> : null}
        <div className="event-observation-view-tabs" role="tablist" aria-label="事件观测视图">
          <button id="event-observation-spine-tab" type="button" role="tab" aria-selected={view === "spine"} aria-controls="event-observation-renderer" onKeyDown={(event) => onViewTabKeyDown(event, "spine")} onClick={() => chooseView("spine")}><Layers3 />脉络</button>
          <button id="event-observation-canvas-tab" type="button" role="tab" aria-selected={view === "canvas"} aria-controls="event-observation-renderer" onKeyDown={(event) => onViewTabKeyDown(event, "canvas")} onClick={() => chooseView("canvas")}><PanelsTopLeft />画布</button>
          <button id="event-observation-timeline-tab" type="button" role="tab" aria-selected={view === "timeline"} aria-controls="event-observation-renderer" onKeyDown={(event) => onViewTabKeyDown(event, "timeline")} onClick={() => chooseView("timeline")}><Eye />时间</button>
        </div>
        <label className="event-observation-role-lens"><UserRound /><span className="sr-only">角色视角</span><select value={roleLens ?? ""} onChange={(event) => setRoleLens(event.target.value || null)} aria-label="角色视角"><option value="">全部 / 主线</option>{roleLabels.map((label) => <option value={label} key={label}>{label}视角</option>)}</select></label>
      </div>}
    />
    <div className="event-observation-layout">
      <div id="event-observation-renderer" className="event-observation-renderer" role="tabpanel" aria-labelledby={`event-observation-${view}-tab`}>
        {view === "spine" ? <EventLineWorkbench
        embedded
        projectId={props.projectId}
        projectTitle={props.projectTitle}
        events={props.events}
        listState={props.listState}
        onReadEvent={props.onReadEvent}
        onRetry={props.onRetry}
        goldenLoop={props.goldenLoop}
        rejectedCandidateIds={props.rejectedCandidateIds}
        acceptedCandidateIds={props.acceptedCandidateIds}
        currentFocusLabel={props.currentFocusLabel}
        currentUnitLabel={props.currentUnitLabel}
        selectedEventId={selectedEventId}
        roleLens={roleLens}
        onSelectedEventId={setSelectedEventId}
        onOpenTianyi={props.onOpenTianyi}
        onCreateFromEvent={props.onCreateFromEvent}
        onCreateEvent={props.onCreateEvent}
        onContinueReview={() => props.onContinueReview()}
        /> : <StoryObservationCanvas
        embedded
        projectionMode={view === "canvas" ? "event-line" : "timeline"}
        selectedEventId={selectedEventId}
        roleLens={roleLens}
        onSelectedEventId={setSelectedEventId}
        projectId={props.projectId}
        projectTitle={props.projectTitle}
        events={props.events}
        listState={props.listState}
        visualDocuments={props.visualDocuments}
        goldenLoop={props.goldenLoop}
        currentFocusLabel={props.currentFocusLabel}
        currentUnitLabel={props.currentUnitLabel}
        onReadEvent={props.onReadEvent}
        onRetry={props.onRetry}
        onOpenTianyi={props.onOpenTianyi}
        onSubmitProposal={props.onSubmitProposal}
        onContinueReview={props.onContinueReview}
        />}
      </div>
    </div>
  </section>;
}
