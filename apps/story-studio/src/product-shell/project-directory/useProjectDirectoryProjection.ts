import { useEffect, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getTianyiStoryIntakeRuns, getVerifiedCanonEventList, getWorldLibrary, listAgentRecognitionProposals, listRelations, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createEmptyProjectDirectoryProjection, createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import { buildPendingReviewAggregation, type PendingReviewAggregation } from "./pendingReviewAggregation";
import type { TranslationKey } from "../i18n/translations";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; pending: PendingReviewAggregation | null; error: boolean; pendingStatus: "idle" | "loading" | "ready" | "failed" };
const projectionCache = new Map<string, DirectoryLoadState>();

/** Read-only aggregation adapter. It deliberately has no write token or domain mutation. */
export function useProjectDirectoryProjection(project: StoryStudioProject | null, t: (key: TranslationKey) => string, runtime?: Pick<TianyanShellRuntimeState, "withConnection" | "tianyiConversationId">): DirectoryLoadState {
  const [state, setState] = useState<DirectoryLoadState>(() => project ? projectionCache.get(project.id) ?? { projectId: project.id, projection: null, pending: null, error: false, pendingStatus: "idle" } : { projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false, pendingStatus: "idle" });
  const [pendingRevision, setPendingRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPendingRevision((revision) => revision + 1);
    window.addEventListener("story-studio-pending-review-changed", refresh);
    return () => window.removeEventListener("story-studio-pending-review-changed", refresh);
  }, []);
  useEffect(() => {
    if (!project) { setState({ projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false, pendingStatus: "idle" }); return; }
    const cached = projectionCache.get(project.id);
    let current = true; setState(cached ? { ...cached, error: false, pendingStatus: "loading" } : { projectId: project.id, projection: null, pending: null, error: false, pendingStatus: "loading" });
    void Promise.all([getWorldLibrary(project.id), listStoryUnits(project.id), getCreationSourcePortState({ projectId: project.id }), listSourceImportReviews(project.id), getGoldenLoopCandidateReview(project.id), runtime ? runtime.withConnection((token) => listAgentRecognitionProposals(project.id, token)) : Promise.resolve([]), listRelations({ projectId: project.id, reviewState: "candidate" }), getVerifiedCanonEventList(project.id)]).then(async ([library, units, source, imports, review, proposals, relations, verifiedEvents]) => {
      if (!current || library.project.id !== project.id) return;
      const workVersionId = source.root?.id ?? null;
      const storyIntakeRuns = runtime && workVersionId
        ? await runtime.withConnection((token) => getTianyiStoryIntakeRuns({ projectId: project.id, workVersionId, token }))
        : [];
      if (!current) return;
      const pending = buildPendingReviewAggregation({ projectId: project.id, workVersionId, imports, golden: review, proposals, relations: relations.relations, storyIntakeRuns: storyIntakeRuns.map((run) => ({ projectId: run.projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, runId: run.runId, updatedAt: run.updatedAt, storyIntakeEnvelope: run.storyIntakeEnvelope })) });
      const next: DirectoryLoadState = { projectId: project.id, projection: createProjectDirectoryViewModel(t, { library, units, sources: imports, workVersionId, pendingCount: pending.pendingCount, verifiedEventIds: verifiedEvents.status === "ready" ? verifiedEvents.eventIds : [] }), pending, error: false, pendingStatus: "ready" };
      projectionCache.set(project.id, next);
      setState(next);
    }).catch(() => { if (current) setState(cached ? { ...cached, error: true, pendingStatus: "failed" } : { projectId: project.id, projection: null, pending: null, error: true, pendingStatus: "failed" }); });
    return () => { current = false; };
  }, [pendingRevision, project?.id, runtime, t]);
  return state;
}
