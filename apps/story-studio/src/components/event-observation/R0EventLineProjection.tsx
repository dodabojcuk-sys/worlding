import { useEffect, useState } from "react";
import { createRelationCandidate, getBootstrap, getVerifiedCanonEvent, getVerifiedCanonEventList, getWorldLibrary, listRelations, listRelationTypes, listStoryUnits, type RelationRecord, type RelationTypeDefinition, type VerifiedCanonEventListRead } from "../../lib/localTransport";
import { verifiedCanonEventSummaries, type EventLineEventSummary } from "../eventLineCommittedEvents";
import { EventLineWorkbench } from "../EventLineWorkbench";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** Read-only Event/Canon projection; it retains the established event read owner. */
export function R0EventLineProjection(props: { runtime: TianyanShellRuntimeState; onOpenTianyi(): void; selectedEventId?: string | null }) {
  const [state, setState] = useState<{ projectId: string | null; title: string; events: EventLineEventSummary[]; list: VerifiedCanonEventListRead | { status: "loading" }; unit: string | null; relations: RelationRecord[]; relationTypes: RelationTypeDefinition[] }>({ projectId: null, title: "", events: [], list: { status: "loading" }, unit: null, relations: [], relationTypes: [] });
  const load = () => void getBootstrap().then(async (bootstrap) => {
    const project = bootstrap.activeProject; if (!project) return;
    const [library, list, units, relationList, relationTypes] = await Promise.all([getWorldLibrary(project.id), getVerifiedCanonEventList(project.id), listStoryUnits(project.id), listRelations({ projectId: project.id }), listRelationTypes(project.id)]);
    setState({ projectId: project.id, title: project.title, events: list.status === "ready" ? verifiedCanonEventSummaries(library.objects, list.eventIds) : [], list, unit: units[0]?.title ?? null, relations: relationList.relations, relationTypes: relationTypes.types });
  }).catch(() => undefined);
  useEffect(load, []);
  if (!state.projectId) return <div className="event-line-loading" aria-live="polite">Loading event line…</div>;
  return <EventLineWorkbench embedded projectId={state.projectId} projectTitle={state.title} events={state.events} relations={state.relations} listState={state.list} onReadEvent={(eventId) => getVerifiedCanonEvent(state.projectId!, eventId)} onRetry={load} goldenLoop={null} rejectedCandidateIds={[]} acceptedCandidateIds={[]} currentFocusLabel={state.title} currentUnitLabel={state.unit} selectedEventId={props.selectedEventId} onOpenTianyi={props.onOpenTianyi} onCreateGraphRelation={({ sourceEventId, targetEventId }) => {
    const type = state.relationTypes[0];
    if (!type) throw new Error("A relation type is required before linking events; no relation was written.");
    return props.runtime.withConnection((token) => createRelationCandidate({ projectId: state.projectId!, sourceObjectId: sourceEventId, targetObjectId: targetEventId, relationTypeId: type.relationTypeId, relationLabelSnapshot: type.label, direction: "forward", sourceRef: "event-graph-author-link", operationId: `event-graph-link-${crypto.randomUUID()}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); });
  }} onContinueReview={() => undefined} />;
}
