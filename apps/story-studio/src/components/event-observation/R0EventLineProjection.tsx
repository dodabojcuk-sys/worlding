import { useEffect, useState } from "react";
import { getBootstrap, getVerifiedCanonEvent, getVerifiedCanonEventList, getWorldLibrary, listStoryUnits, type VerifiedCanonEventListRead } from "../../lib/localTransport";
import { verifiedCanonEventSummaries, type EventLineEventSummary } from "../eventLineCommittedEvents";
import { EventLineWorkbench } from "../EventLineWorkbench";

/** Read-only Event/Canon projection; it retains the established event read owner. */
export function R0EventLineProjection(props: { onOpenTianyi(): void; selectedEventId?: string | null }) {
  const [state, setState] = useState<{ projectId: string | null; title: string; events: EventLineEventSummary[]; list: VerifiedCanonEventListRead | { status: "loading" }; unit: string | null }>({ projectId: null, title: "", events: [], list: { status: "loading" }, unit: null });
  const load = () => void getBootstrap().then(async (bootstrap) => {
    const project = bootstrap.activeProject; if (!project) return;
    const [library, list, units] = await Promise.all([getWorldLibrary(project.id), getVerifiedCanonEventList(project.id), listStoryUnits(project.id)]);
    setState({ projectId: project.id, title: project.title, events: list.status === "ready" ? verifiedCanonEventSummaries(library.objects, list.eventIds) : [], list, unit: units[0]?.title ?? null });
  }).catch(() => undefined);
  useEffect(load, []);
  if (!state.projectId) return <div className="event-line-loading" aria-live="polite">Loading event line…</div>;
  return <EventLineWorkbench embedded projectId={state.projectId} projectTitle={state.title} events={state.events} listState={state.list} onReadEvent={(eventId) => getVerifiedCanonEvent(state.projectId!, eventId)} onRetry={load} goldenLoop={null} rejectedCandidateIds={[]} acceptedCandidateIds={[]} currentFocusLabel={state.title} currentUnitLabel={state.unit} selectedEventId={props.selectedEventId} onOpenTianyi={props.onOpenTianyi} onContinueReview={() => undefined} />;
}
