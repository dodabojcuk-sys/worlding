import { useCallback, useEffect, useState } from "react";
import { archiveStoryUnit, confirmRelationCandidate, createRelationCandidate, createStoryModelingRunTransport, createStoryUnit, createWorldObject, executeStoryModelingRunTransport, getBootstrap, getCreationSourcePortState, getObjectCatalog, getTemporalGraphRevision, getTemporalProjectionByRevision, getVerifiedCanonEvent, getVerifiedCanonEventList, getWorldLibrary, listRelations, listRelationTypes, listStoryLogicReviews, listStoryModelingRuns, listStoryUnits, listTemporalProjectionRuns, planStoryModeling, rejectRelationCandidate, reviewStoryLogicFinding, stopStoryModelingRunTransport, updateObjectCatalog, updateRelationCandidate, updateStoryUnit, type RelationRecord, type RelationTypeDefinition, type StoryLogicReviewProjection, type StoryModelingPlanProjection, type StoryModelingRunProjection, type StoryUnit, type VerifiedCanonEventListRead, type WorldObject } from "../../lib/localTransport";
import { eventWorkspaceProjectionSummaries, type EventLineEventSummary } from "../eventLineCommittedEvents";
import { EventLineWorkbench, type EventDraftInput } from "../EventLineWorkbench";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { eventDraftPayload } from "./eventDraftPayload";
import type { StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference.ts";
import { useI18n } from "../../product-shell/i18n/I18nProvider";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";

/** Adapter for the established Event projection and Workspace write command. */
export function R0EventLineProjection(props: { runtime: TianyanShellRuntimeState; onOpenTianyi(reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[], predictionSourceUnitSummary?: string): void; selectedEventId?: string | null }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ projectId: string | null; title: string; events: EventLineEventSummary[]; storyUnits: StoryUnit[]; perspectiveObjects: PerspectiveObjectRef[]; modelingRuns: StoryModelingRunProjection[]; logicReviews: StoryLogicReviewProjection[]; list: VerifiedCanonEventListRead | { status: "loading" }; unit: string | null; relations: RelationRecord[]; relationTypes: RelationTypeDefinition[] }>({ projectId: null, title: "", events: [], storyUnits: [], perspectiveObjects: [], modelingRuns: [], logicReviews: [], list: { status: "loading" }, unit: null, relations: [], relationTypes: [] });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const project = props.runtime.project ?? (await getBootstrap()).activeProject;
      if (!project) {
        setState({ projectId: null, title: "", events: [], storyUnits: [], perspectiveObjects: [], modelingRuns: [], logicReviews: [], list: { status: "loading" }, unit: null, relations: [], relationTypes: [] });
        setLoadState("empty");
        return;
      }
      const [library, list, units, relationList, relationTypes, modelingRuns, logicReviews] = await Promise.all([getWorldLibrary(project.id), getVerifiedCanonEventList(project.id), listStoryUnits(project.id), listRelations({ projectId: project.id }), listRelationTypes(project.id), props.runtime.withConnection((token) => listStoryModelingRuns(project.id, token)), props.runtime.withConnection((token) => listStoryLogicReviews(project.id, token))]);
      // The workspace owner exposes both author drafts and verified Canon events.
      // Only Author Control may give an event the confirmed identity; the graph is
      // still a projection of these same stable Event objects.
      const events = list.status === "ready"
        ? eventWorkspaceProjectionSummaries(library.objects, list.eventIds)
        : [];
      const perspectiveObjects: PerspectiveObjectRef[] = library.objects.flatMap((object) => object.type === "character" || object.type === "location" || object.type === "item" ? [{ id: object.id, type: object.type, label: object.title, ownerId: project.id, version: object.revisionToken, scope: "project" as const, formal: true }] : []);
      setState({ projectId: project.id, title: project.title, events, storyUnits: units, perspectiveObjects, modelingRuns, logicReviews, list, unit: units[0]?.title ?? null, relations: relationList.relations, relationTypes: relationTypes.types });
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
  const readTemporalProjectionCache = useCallback((eventRefs: StoryStudioEventReference[]) => {
    const projectId = state.projectId;
    if (!projectId) throw new Error("Temporal projection requires an open project.");
    return props.runtime.withConnection(async (token) => {
      const revision = await getTemporalGraphRevision({ projectId, eventRefs, token });
      const cached = await getTemporalProjectionByRevision({ projectId, graphRevisionHash: revision.graphRevisionHash, token });
      if (cached && !cached.stale) return { status: "current" as const, run: cached, changedEventCount: 0 };
      const stale = (await listTemporalProjectionRuns(projectId, token)).find((run) => run.status === "ready") ?? null;
      return stale
        ? { status: "stale" as const, run: { ...stale, stale: true }, changedEventCount: Math.max(1, revision.eventCount) }
        : { status: "missing" as const, run: null, changedEventCount: revision.eventCount };
    });
  }, [props.runtime.withConnection, state.projectId]);
  const planModeling = useCallback((input: Parameters<typeof planStoryModeling>[0] extends infer T ? Omit<T & object, "token"> : never): Promise<StoryModelingPlanProjection> => {
    if (!state.projectId) throw new Error("Story modeling requires an open project.");
    return props.runtime.withConnection((token) => planStoryModeling({ ...input, projectId: state.projectId!, token } as Parameters<typeof planStoryModeling>[0]));
  }, [props.runtime.withConnection, state.projectId]);
  const runModeling = useCallback((request: import("../../../../../src/storyContracts/storyModeling.ts").StoryModelingRequest): Promise<StoryModelingRunProjection> => {
    if (!state.projectId) throw new Error("Story modeling requires an open project.");
    return props.runtime.withConnection(async (token) => {
      const suffix = crypto.randomUUID();
      const run = await createStoryModelingRunTransport({ request, runId: `story-modeling-run.${suffix}`, token });
      return run.status === "ready" ? run : executeStoryModelingRunTransport({ projectId: state.projectId!, runId: run.runId, token });
    });
  }, [props.runtime.withConnection, state.projectId]);
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
  const createUnit = async (title: string) => { await props.runtime.withConnection((token) => createStoryUnit({ projectId: state.projectId!, title, summary: "", token })); await load(); };
  const renameUnit = async (unitId: string, nextTitle: string) => { const unit = state.storyUnits.find((item) => item.id === unitId); if (!unit) throw new Error("Story Unit is not available for rename in the current project."); await props.runtime.withConnection((token) => updateStoryUnit({ projectId: state.projectId!, unitId: unit.id, expectedVersion: unit.version, title: nextTitle, token })); await load(); };
  const archiveUnitById = async (unitId: string) => { const unit = state.storyUnits.find((item) => item.id === unitId); if (!unit) throw new Error("Story Unit is not available for archive in the current project."); await props.runtime.withConnection((token) => archiveStoryUnit({ projectId: state.projectId!, unitId: unit.id, expectedVersion: unit.version, token })); await load(); };
  const trashDraftEvent = async (eventId: string) => {
    const event = state.events.find((item) => item.id === eventId);
    if (!event || event.status !== "draft") throw new Error("Only an author draft Event can enter the Recycle Bin.");
    const source = await getCreationSourcePortState({ projectId: state.projectId! });
    if (!source.root) throw new Error("The root work version is unavailable; no Recycle Bin state was written.");
    const catalog = await getObjectCatalog(state.projectId!, source.root.id);
    await props.runtime.withConnection((token) => updateObjectCatalog({ projectId: state.projectId!, workVersionId: source.root!.id, expectedRevision: catalog.revision, operation: "trash", objectType: "event", objectIds: [event.id], trashedFrom: "active", token }));
    await load();
  };
  return <EventLineWorkbench embedded projectId={state.projectId} projectTitle={state.title} events={state.events} storyUnits={state.storyUnits} perspectiveObjects={state.perspectiveObjects} modelingRuns={state.modelingRuns} logicReviews={state.logicReviews} relations={state.relations} relationTypes={state.relationTypes} listState={state.list} onReadEvent={(eventId) => getVerifiedCanonEvent(state.projectId!, eventId)} onRetry={() => void load().catch(() => undefined)} goldenLoop={null} rejectedCandidateIds={[]} acceptedCandidateIds={[]} currentFocusLabel={state.title} currentUnitLabel={state.unit} selectedEventId={props.selectedEventId ?? undefined} onOpenTianyi={props.onOpenTianyi} onReadTemporalProjectionCache={readTemporalProjectionCache} onPlanStoryModeling={planModeling} onExecuteStoryModeling={runModeling} onStopStoryModeling={(runId) => props.runtime.withConnection((token) => stopStoryModelingRunTransport({ projectId: state.projectId!, runId, token })).then(async (run) => { await load(); return run; })} onReviewLogicFinding={(finding) => props.runtime.withConnection((token) => reviewStoryLogicFinding({ projectId: state.projectId!, findingId: finding.findingId, source: finding.source, evidenceRefs: finding.evidenceRefs, authorStatus: finding.authorStatus, token })).then(async (record) => { await load(); return record; })} onSaveEvent={saveDraftEvent} onTrashDraftEvent={trashDraftEvent} onCreateUnit={createUnit} onRenameUnit={renameUnit} onArchiveUnit={archiveUnitById} onCreateGraphRelation={({ sourceEventId, targetEventId, relationTypeId, sourceRef }) => {
    const type = state.relationTypes.find((candidate) => candidate.relationTypeId === relationTypeId) ?? state.relationTypes[0];
    if (!type) throw new Error("A relation type is required before linking events; no relation was written.");
    return props.runtime.withConnection((token) => createRelationCandidate({ projectId: state.projectId!, sourceObjectId: sourceEventId, targetObjectId: targetEventId, relationTypeId: type.relationTypeId, relationLabelSnapshot: type.label, direction: "forward", sourceRef: sourceRef ?? "event-graph-author-link", operationId: `event-graph-link-${crypto.randomUUID()}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); });
  }} onConfirmGraphRelation={(relation) => props.runtime.withConnection((token) => confirmRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: `event-graph-confirm-${relation.relationId}-${relation.revision}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onUpdateGraphRelation={(relation) => props.runtime.withConnection((token) => updateRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, relationTypeId: relation.relationTypeId, direction: relation.direction, operationId: `event-graph-update-${relation.relationId}-${relation.revision}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onApproveModifiedGraphRelation={(relation) => props.runtime.withConnection(async (token) => {
    const updated = await updateRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, relationTypeId: relation.relationTypeId, direction: relation.direction, operationId: `event-graph-update-approve-${relation.relationId}-${relation.revision}`, token });
    return confirmRelationCandidate({ projectId: state.projectId!, relationId: updated.relation.relationId, expectedRelationRevision: updated.relation.revision, operationId: `event-graph-confirm-updated-${updated.relation.relationId}-${updated.relation.revision}`, token });
  }).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onRejectGraphRelation={(relation) => props.runtime.withConnection((token) => rejectRelationCandidate({ projectId: state.projectId!, relationId: relation.relationId, expectedRelationRevision: relation.revision, operationId: `event-graph-reject-${relation.relationId}-${relation.revision}`, token })).then(() => { window.dispatchEvent(new Event("story-studio-pending-review-changed")); load(); })} onContinueReview={() => undefined} />;
}
