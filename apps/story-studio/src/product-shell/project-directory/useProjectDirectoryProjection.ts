import { useEffect, useRef, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getTianyiStoryIntakeRuns, getVerifiedCanonEventList, getWorldLibrary, listAgentRecognitionProposals, listRelations, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createEmptyProjectDirectoryProjection, createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import { buildPendingReviewAggregation, type PendingReviewAggregation } from "./pendingReviewAggregation";
import type { TranslationKey } from "../i18n/translations";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; pending: PendingReviewAggregation | null; error: boolean; pendingStatus: "idle" | "loading" | "ready" | "failed" };
const projectionCache = new Map<string, DirectoryLoadState>();
type DirectoryCoreRead = {
  library: Awaited<ReturnType<typeof getWorldLibrary>>;
  units: Awaited<ReturnType<typeof listStoryUnits>>;
};
const coreLoads = new Map<string, Promise<DirectoryCoreRead>>();

function readDirectoryCore(projectId: string): Promise<DirectoryCoreRead> {
  const existing = coreLoads.get(projectId);
  if (existing) return existing;
  const load = Promise.all([
    getWorldLibrary(projectId),
    listStoryUnits(projectId)
  ]).then(([library, units]) => ({
    library,
    units
  })).finally(() => { coreLoads.delete(projectId); });
  coreLoads.set(projectId, load);
  return load;
}

function createLoadingDirectoryProjection(projectId: string, t: (key: TranslationKey) => string): ProjectDirectoryProjection {
  return { ...createEmptyProjectDirectoryProjection(t), projectId };
}

/** Read-only aggregation adapter. It deliberately has no write token or domain mutation. */
export function useProjectDirectoryProjection(project: StoryStudioProject | null, t: (key: TranslationKey) => string, runtime?: Pick<TianyanShellRuntimeState, "withConnection" | "tianyiConversationId">): DirectoryLoadState {
  const withConnection = runtime?.withConnection;
  const translate = useRef(t);
  const connection = useRef(withConnection);
  translate.current = t;
  connection.current = withConnection;
  const [state, setState] = useState<DirectoryLoadState>(() => project ? projectionCache.get(project.id) ?? { projectId: project.id, projection: createLoadingDirectoryProjection(project.id, t), pending: null, error: false, pendingStatus: "idle" } : { projectId: null, projection: createEmptyProjectDirectoryProjection(t), pending: null, error: false, pendingStatus: "idle" });
  const [pendingRevision, setPendingRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPendingRevision((revision) => revision + 1);
    window.addEventListener("story-studio-pending-review-changed", refresh);
    return () => window.removeEventListener("story-studio-pending-review-changed", refresh);
  }, []);
  useEffect(() => {
    if (!project) { setState({ projectId: null, projection: createEmptyProjectDirectoryProjection(translate.current), pending: null, error: false, pendingStatus: "idle" }); return; }
    const projectId = project.id;
    // This effect owns its read.  A shared "current project" ref can briefly
    // move during Shell recovery and discard a valid response for the very
    // project that is again on screen, leaving the directory's loading shell
    // indefinitely.  Only an actual cleanup of this read makes it obsolete.
    let cancelled = false;
    const isCurrentProject = () => !cancelled;
    const cached = projectionCache.get(projectId);
    setState(cached ? { ...cached, error: false, pendingStatus: "loading" } : { projectId, projection: createLoadingDirectoryProjection(projectId, translate.current), pending: null, error: false, pendingStatus: "loading" });
    void readDirectoryCore(projectId).then((core) => {
      if (!isCurrentProject() || core.library.project.id !== projectId) return;
      const makeState = (input: { workVersionId: string | null; imports: Awaited<ReturnType<typeof listSourceImportReviews>>; review: Awaited<ReturnType<typeof getGoldenLoopCandidateReview>>; relations: Awaited<ReturnType<typeof listRelations>>["relations"]; verifiedEventIds: readonly string[]; proposals: Awaited<ReturnType<typeof listAgentRecognitionProposals>>; storyIntakeRuns: Awaited<ReturnType<typeof getTianyiStoryIntakeRuns>>; pendingStatus: DirectoryLoadState["pendingStatus"]; error?: boolean }): DirectoryLoadState => {
        const pending = buildPendingReviewAggregation({ projectId, workVersionId: input.workVersionId, imports: input.imports, golden: input.review, proposals: input.proposals, relations: input.relations, storyIntakeRuns: input.storyIntakeRuns.map((run) => ({ projectId: run.projectId, workVersionId: run.workVersionId, sessionId: run.sessionId, runId: run.runId, updatedAt: run.updatedAt, storyIntakeEnvelope: run.storyIntakeEnvelope })) });
        return { projectId, projection: createProjectDirectoryViewModel(translate.current, { library: core.library, units: core.units, sources: input.imports, workVersionId: input.workVersionId, pendingCount: pending.pendingCount, verifiedEventIds: input.verifiedEventIds }), pending, error: input.error ?? false, pendingStatus: input.pendingStatus };
      };
      type ProjectionInput = Parameters<typeof makeState>[0];
      const baseInput: Omit<ProjectionInput, "pendingStatus" | "error"> = { workVersionId: null, imports: [], review: null, relations: [], verifiedEventIds: [], proposals: [], storyIntakeRuns: [] };
      let input: ProjectionInput = { ...baseInput, pendingStatus: "loading" };
      const render = () => {
        const next = makeState(input);
        projectionCache.set(projectId, next);
        setState(next);
        return next;
      };
      render();
      void Promise.all([getCreationSourcePortState({ projectId }), listSourceImportReviews(projectId), getGoldenLoopCandidateReview(projectId), listRelations({ projectId, reviewState: "candidate" }), getVerifiedCanonEventList(projectId)]).then(([source, imports, review, relations, verifiedEvents]) => {
        if (!isCurrentProject()) return;
        const enrichedInput = { workVersionId: source.root?.id ?? null, imports, review, relations: relations.relations, verifiedEventIds: verifiedEvents.status === "ready" ? verifiedEvents.eventIds : [], proposals: [], storyIntakeRuns: [] };
        const latestConnection = connection.current;
        input = { ...enrichedInput, pendingStatus: latestConnection ? "loading" : "ready" };
        render();
        if (!latestConnection) return;
        void Promise.all([latestConnection((token) => listAgentRecognitionProposals(projectId, token)), enrichedInput.workVersionId ? latestConnection((token) => getTianyiStoryIntakeRuns({ projectId, workVersionId: enrichedInput.workVersionId!, token })) : Promise.resolve([])]).then(([proposals, storyIntakeRuns]) => {
          if (!isCurrentProject()) return;
          input = { ...enrichedInput, proposals, storyIntakeRuns, pendingStatus: "ready" };
          render();
        }).catch(() => { if (isCurrentProject()) { input = { ...input, error: true, pendingStatus: "failed" }; render(); } });
      }).catch(() => { if (isCurrentProject()) { input = { ...input, error: true, pendingStatus: "failed" }; render(); } });
    }).catch(() => { if (isCurrentProject()) setState(cached ? { ...cached, error: true, pendingStatus: "failed" } : { projectId, projection: createLoadingDirectoryProjection(projectId, translate.current), pending: null, error: true, pendingStatus: "failed" }); });
    return () => { cancelled = true; };
  }, [pendingRevision, project?.id]);
  return state;
}
