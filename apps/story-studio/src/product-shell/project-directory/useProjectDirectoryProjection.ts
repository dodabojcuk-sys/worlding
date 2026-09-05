import { useEffect, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getTianyiStoryIntakeRuns, getVerifiedCanonEventList, getWorldLibrary, listAgentRecognitionProposals, listRelations, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createEmptyProjectDirectoryProjection, createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import { buildPendingReviewAggregation, type PendingReviewAggregation } from "./pendingReviewAggregation";
import type { TranslationKey } from "../i18n/translations";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; pending: PendingReviewAggregation | null; error: boolean };
/** Read-only aggregation adapter. It deliberately has no write token or domain mutation. */
export function useProjectDirectoryProjection(project: StoryStudioProject | null, t: (key: TranslationKey) => string, runtime?: Pick<TianyanShellRuntimeState, "withConnection" | "tianyiConversationId">): DirectoryLoadState {
  const [state, setState] = useState<DirectoryLoadState>(() => ({ projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false }));
  const [pendingRevision, setPendingRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPendingRevision((revision) => revision + 1);
    window.addEventListener("story-studio-pending-review-changed", refresh);
    return () => window.removeEventListener("story-studio-pending-review-changed", refresh);
  }, []);
  useEffect(() => {
    if (!project) { setState({ projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false }); return; }
    let current = true; setState({ projectId: project.id, projection: null, pending: null, error: false });
    void Promise.all([getWorldLibrary(project.id), listStoryUnits(project.id), getCreationSourcePortState({ projectId: project.id }), listSourceImportReviews(project.id), getGoldenLoopCandidateReview(project.id), runtime ? runtime.withConnection((token) => listAgentRecognitionProposals(project.id, token)) : Promise.resolve([]), listRelations({ projectId: project.id, reviewState: "candidate" }), getVerifiedCanonEventList(project.id)]).then(async ([library, units, source, imports, review, proposals, relations, verifiedEvents]) => {
      if (!current || library.project.id !== project.id) return;
      const workVersionId = source.root?.id ?? null;
      const storyIntakeRuns = runtime && workVersionId
        ? await runtime.withConnection((token) => getTianyiStoryIntakeRuns({ projectId: project.id, workVersionId, token })).catch(() => [])
        : [];
      if (!current) return;
      const pending = buildPendingReviewAggregation({ projectId: project.id, workVersionId, imports, golden: review, proposals, relations: relations.relations, storyIntakeRuns: storyIntakeRuns.map((run) => ({ projectId: run.projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, runId: run.runId, updatedAt: run.updatedAt, storyIntakeEnvelope: run.storyIntakeEnvelope })) });
      setState({ projectId: project.id, projection: createProjectDirectoryViewModel(t, { library, units, sources: imports, workVersionId, pendingCount: pending.pendingCount, verifiedEventIds: verifiedEvents.status === "ready" ? verifiedEvents.eventIds : [] }), pending, error: false });
    }).catch(() => { if (current) setState({ projectId: project.id, projection: null, pending: null, error: true }); });
    return () => { current = false; };
  }, [pendingRevision, project?.id, runtime, t]);
  return state;
}
