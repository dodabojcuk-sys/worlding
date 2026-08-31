import { useCallback, useEffect, useState } from "react";
import { confirmRelationCandidate, createRelationCandidate, createWorldObject, getBootstrap, getVerifiedCanonEvent, getVerifiedCanonEventList, getWorldLibrary, listRelations, listRelationTypes, listStoryUnits, rejectRelationCandidate, updateRelationCandidate, type RelationRecord, type RelationTypeDefinition, type VerifiedCanonEventListRead, type WorldObject } from "../../lib/localTransport";
import { eventWorkspaceProjectionSummaries, type EventLineEventSummary } from "../eventLineCommittedEvents";
import { EventLineWorkbench, type EventDraftInput } from "../EventLineWorkbench";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { eventDraftPayload } from "./eventDraftPayload";
import type { StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference.ts";
import { useI18n } from "../../product-shell/i18n/I18nProvider";

/** Adapter for the established Event projection and Workspace write command. */
export function R0EventLineProjection(props: { runtime: TianyanShellRuntimeState; onOpenTianyi(reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[]): void; selectedEventId?: string | null }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ projectId: string | null; title: string; events: EventLineEventSummary[]; list: VerifiedCanonEventListRead | { status: "loading" }; unit: string | null; relations: RelationRecord[]; relationTypes: RelationTypeDefinition[] }>({ projectId: null, title: "", events: [], list: { status: "loading" }, unit: null, relations: [], relationTypes: [] });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const project = props.runtime.project ?? (await getBootstrap()).activeProject;
      if (!project) {
        setState({ projectId: null, title: "", events: [], list: { status: "loading" }, unit: null, relations: [], relationTypes: [] });
        setLoadState("empty");
        return;
      }
      const [library, list, units, relationList, relationTypes] = await Promise.all([getWorldLibrary(project.id), getVerifiedCanonEventList(project.id), listStoryUnits(project.id), listRelations({ projectId: project.id }), listRelationTypes(project.id)]);
      // The workspace owner exposes both author drafts and verified Canon events.
      // Only Author Control may give an event the confirmed identity; the graph is
      // still a projection of these same stable Event objects.
      const events = list.status === "ready"
        ? eventWorkspaceProjectionSummaries(library.objects, list.eventIds)
        : [];
      setState({ projectId: project.id, title: project.title, events, list, unit: units[0]?.title ?? null, relations: relationList.relations, relationTypes: relationTypes.types });
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      throw error;
    }
  }, [props.runtime.project]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === state.projectId) void load().catch(() => undefined);
    };
    window.addEventListener("story-studio-prediction-drafts-created", refresh);
    return () => window.removeEventListener("story-studio-prediction-drafts-created", refresh);
  }, [load, state.projectId]);
  if (!state.projectId) {
    if (loadState === "loading") return <div className="event-line-loading" aria-live="polite">{t("eventLine.loading")}</div>;
    if (loadState === "error" || props.runtime.connectionState === "unavailable") return <section className="event-line-unavailable" role="alert"><strong>{t("eventLine.unavailable")}</strong><p>{t("eventLine.unavailableHint")}</p><button type="button" onClick={() => { props.runtime.retryConnection(); void load().catch(() => undefined); }}>{t("directory.retryConnection")}</button></section>;
    return <section className="event-line-unavailable" data-testid="event-line-no-project"><strong>{t("eventLine.noProject")}</strong><p>{t("eventLine.noProjectHint")}</p></section>;
  }
  const saveDraftEvent = async (input: EventDraftInput): Promise<WorldObject> => {
    const { tags, body } = eventDraftPayload(input);
    const created = await props.runtime.withConnection((token) => createWorldObject({ projectId: state.projectId!, type: "event", title: input.title, status: "draft", tags, body, token }));
    await load();
    return created;
  };
  return <EventLineWorkbench embedded projectId={state.projectId} projectTitle={state.title} events={state.events} relations={state.relations} listState={state.list} onReadEvent={(eventId) => getVerifiedCanonEvent(state.projectId!, eventId)} onRetry={() => void load().catch(() => undefined)} goldenLoop={null} rejectedCandidateIds={[]} acceptedCandidateIds={[]} currentFocusLabel={state.title} currentUnitLabel={state.unit} selectedEventId={props.selectedEventId ?? undefined} onOpenTianyi={props.onOpenTianyi} onSaveEvent={saveDraftEvent} onCreateGraphRelation={({ sourceEventId, targetEventId }) => {
    const type = state.relationTypes[0];
    if (!type) throw new Error("A relation type is required before linking events; no relation was written.");
    return props.runtime.withConnection((token) => createRelationCandidate({ projectId: state.projectId!, sourceObjectId: sourceEventId, targetObjectId: targetEventId, relationTypeId: type.relationTypeId, relationLabelSnapshot: type.label, direction: "forward", sourceRef: "event-graph-author-link", operationId: `event-graph-link-${crypto.randomUUID()}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); });
  }} onConfirmGraphRelation={(relation) => props.runtime.withConnection((token) => confirmRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: `event-graph-confirm-${relation.relationId}-${relation.revision}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onUpdateGraphRelation={(relation) => props.runtime.withConnection((token) => updateRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, direction: relation.direction, operationId: `event-graph-update-${relation.relationId}-${relation.revision}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onApproveModifiedGraphRelation={(relation) => props.runtime.withConnection(async (token) => {
    const updated = await updateRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, direction: relation.direction, operationId: `event-graph-update-approve-${relation.relationId}-${relation.revision}`, token });
    return confirmRelationCandidate({ projectId: state.projectId!, relationId: updated.relation.relationId, expectedRelationRevision: updated.relation.revision, operationId: `event-graph-confirm-updated-${updated.relation.relationId}-${updated.relation.revision}`, token });
  }).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onRejectGraphRelation={(relation) => props.runtime.withConnection((token) => rejectRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: `event-graph-reject-${relation.relationId}-${relation.revision}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onContinueReview={() => undefined} />;
}
