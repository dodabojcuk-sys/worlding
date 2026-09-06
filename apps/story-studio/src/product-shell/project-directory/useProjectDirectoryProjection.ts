import { useEffect, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getTianyiStoryIntakeRuns, getVerifiedCanonEventList, getWorldLibrary, listAgentRecognitionProposals, listRelations, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createEmptyProjectDirectoryProjection, createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import { buildPendingReviewAggregation, type PendingReviewAggregation } from "./pendingReviewAggregation";
import type { TranslationKey } from "../i18n/translations";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; pending: PendingReviewAggregation | null; error: boolean; pendingStatus: "idle" | "loading" | "ready" | "failed" };
const projectionCache = new Map<string, DirectoryLoadState>();

function createLoadingDirectoryProjection(projectId: string, t: (key: TranslationKey) => string): ProjectDirectoryProjection {
  return { ...createEmptyProjectDirectoryProjection(t), projectId };
}

/** Read-only aggregation adapter. It deliberately has no write token or domain mutation. */
export function useProjectDirectoryProjection(project: StoryStudioProject | null, t: (key: TranslationKey) => string, runtime?: Pick<TianyanShellRuntimeState, "withConnection" | "tianyiConversationId">): DirectoryLoadState {
  const [state, setState] = useState<DirectoryLoadState>(() => project ? projectionCache.get(project.id) ?? { projectId: project.id, projection: createLoadingDirectoryProjection(project.id, t), pending: null, error: false, pendingStatus: "idle" } : { projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false, pendingStatus: "idle" });
  const [pendingRevision, setPendingRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPendingRevision((revision) => revision + 1);
    window.addEventListener("story-studio-pending-review-changed", refresh);
    return () => window.removeEventListener("story-studio-pending-review-changed", refresh);
  }, []);
  useEffect(() => {
    if (!project) { setState({ projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false, pendingStatus: "idle" }); return; }
    const cached = projectionCache.get(project.id);
    let current = true; setState(cached ? { ...cached, error: false, pendingStatus: "loading" } : { projectId: project.id, projection: createLoadingDirectoryProjection(project.id, t), pending: null, error: false, pendingStatus: "loading" });
    void getWorldLibrary(project.id).then((library) => {
      if (!current || library.project.id !== project.id) return;
      const makeState = (input: { workVersionId: string | null; imports: Awaited<ReturnType<typeof listSourceImportReviews>>; review: Awaited<ReturnType<typeof getGoldenLoopCandidateReview>>; relations: Awaited<ReturnType<typeof listRelations>>["relations"]; verifiedEventIds: readonly string[]; proposals: Awaited<ReturnType<typeof listAgentRecognitionProposals>>; storyIntakeRuns: Awaited<ReturnType<typeof getTianyiStoryIntakeRuns>>; pendingStatus: DirectoryLoadState["pendingStatus"]; error?: boolean }): DirectoryLoadState => {
        const pending = buildPendingReviewAggregation({ projectId: project.id, workVersionId: input.workVersionId, imports: input.imports, golden: input.review, proposals: input.proposals, relations: input.relations, storyIntakeRuns: input.storyIntakeRuns.map((run) => ({ projectId: run.projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, runId: run.runId, updatedAt: run.updatedAt, storyIntakeEnvelope: run.storyIntakeEnvelope })) });
        return { projectId: project.id, projection: createProjectDirectoryViewModel(t, { library, units, sources: input.imports, workVersionId: input.workVersionId, pendingCount: pending.pendingCount, verifiedEventIds: input.verifiedEventIds }), pending, error: input.error ?? false, pendingStatus: input.pendingStatus };
      };
      let units: Awaited<ReturnType<typeof listStoryUnits>> = [];
      type ProjectionInput = Parameters<typeof makeState>[0];
      const baseInput: Omit<ProjectionInput, "pendingStatus" | "error"> = { workVersionId: null, imports: [], review: null, relations: [], verifiedEventIds: [], proposals: [], storyIntakeRuns: [] };
      let input: ProjectionInput = { ...baseInput, pendingStatus: "loading" };
      const render = () => {
        const next = makeState(input);
        projectionCache.set(project.id, next);
        setState(next);
        return next;
      };
      const base = render();
      void listStoryUnits(project.id).then((nextUnits) => {
        if (!current) return;
        units = nextUnits;
        render();
      }).catch(() => {
        if (!current) return;
        input = { ...input, error: true, pendingStatus: "failed" };
        render();
      });
      void Promise.all([getCreationSourcePortState({ projectId: project.id }), listSourceImportReviews(project.id), getGoldenLoopCandidateReview(project.id), listRelations({ projectId: project.id, reviewState: "candidate" }), getVerifiedCanonEventList(project.id)]).then(([source, imports, review, relations, verifiedEvents]) => {
        if (!current) return;
        const enrichedInput = { workVersionId: source.root?.id ?? null, imports, review, relations: relations.relations, verifiedEventIds: verifiedEvents.status === "ready" ? verifiedEvents.eventIds : [], proposals: [], storyIntakeRuns: [] };
        input = { ...enrichedInput, pendingStatus: runtime ? "loading" : "ready" };
        const enriched = render();
        if (!runtime) return;
        void Promise.all([runtime.withConnection((token) => listAgentRecognitionProposals(project.id, token)), enrichedInput.workVersionId ? runtime.withConnection((token) => getTianyiStoryIntakeRuns({ projectId: project.id, workVersionId: enrichedInput.workVersionId!, token })) : Promise.resolve([])]).then(([proposals, storyIntakeRuns]) => {
          if (!current) return;
          input = { ...enrichedInput, proposals, storyIntakeRuns, pendingStatus: "ready" };
          render();
        }).catch(() => { if (current) { input = { ...input, error: true, pendingStatus: "failed" }; render(); } });
      }).catch(() => { if (current) { input = { ...input, error: true, pendingStatus: "failed" }; render(); } });
    }).catch(() => { if (current) setState(cached ? { ...cached, error: true, pendingStatus: "failed" } : { projectId: project.id, projection: createLoadingDirectoryProjection(project.id, t), pending: null, error: true, pendingStatus: "failed" }); });
    return () => { current = false; };
  }, [pendingRevision, project?.id, runtime, t]);
  return state;
}
