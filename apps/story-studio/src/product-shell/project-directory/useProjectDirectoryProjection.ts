import { useEffect, useRef, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getTianyiStoryIntakeRuns, getVerifiedCanonEventList, getWorldLibrary, listAgentRecognitionProposals, listRelations, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createEmptyProjectDirectoryProjection, createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import { buildPendingReviewAggregation, type PendingReviewAggregation } from "./pendingReviewAggregation";
import type { TranslationKey } from "../i18n/translations";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import { recordDirectoryReadDiagnostic } from "../../lib/directoryReadDiagnostics";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; pending: PendingReviewAggregation | null; error: boolean; pendingStatus: "idle" | "loading" | "ready" | "failed" };
const projectionCache = new Map<string, DirectoryLoadState>();
const emptyCoreRetries = new Map<string, number>();
const emptyCoreRetryDelays = [120, 240, 480, 960, 1_920, 3_840] as const;
type DirectoryCoreRead = {
  library: Awaited<ReturnType<typeof getWorldLibrary>>;
  units: Awaited<ReturnType<typeof listStoryUnits>>;
};
const coreLoads = new Map<string, Promise<DirectoryCoreRead>>();
let directoryCoreReadSequence = 0;
let directoryEffectSequence = 0;

function readDirectoryCore(projectId: string): Promise<DirectoryCoreRead> {
  const existing = coreLoads.get(projectId);
  if (existing) {
    recordDirectoryReadDiagnostic({ phase: "core-reuse", projectId, outcome: "loading" });
    return existing;
  }
  const readId = `directory-core-${++directoryCoreReadSequence}`;
  const startedAt = performance.now();
  recordDirectoryReadDiagnostic({ phase: "core-start", projectId, readId, outcome: "loading" });
  const load = Promise.all([
    getWorldLibrary(projectId).then((library) => {
      recordDirectoryReadDiagnostic({ phase: "library-complete", projectId, readId, responseProjectId: library.project.id, objectCount: library.objects.length, outcome: library.objects.length ? "ready" : "empty", durationMs: Math.round(performance.now() - startedAt) });
      return library;
    }),
    listStoryUnits(projectId).then((units) => {
      recordDirectoryReadDiagnostic({ phase: "units-complete", projectId, readId, unitCount: units.length, outcome: units.length ? "ready" : "empty", durationMs: Math.round(performance.now() - startedAt) });
      return units;
    })
  ]).then(([library, units]) => ({
    library,
    units
  })).then((core) => {
    recordDirectoryReadDiagnostic({ phase: "core-complete", projectId, readId, responseProjectId: core.library.project.id, objectCount: core.library.objects.length, unitCount: core.units.length, outcome: core.library.objects.length || core.units.length ? "ready" : "empty", durationMs: Math.round(performance.now() - startedAt) });
    return core;
  }).catch((error: unknown) => {
    recordDirectoryReadDiagnostic({ phase: "core-failed", projectId, readId, outcome: "failed", reason: error instanceof Error ? error.name : "unknown", durationMs: Math.round(performance.now() - startedAt) });
    throw error;
  }).finally(() => {
    coreLoads.delete(projectId);
    recordDirectoryReadDiagnostic({ phase: "core-release", projectId, readId, durationMs: Math.round(performance.now() - startedAt) });
  });
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
    const effectId = `directory-effect-${++directoryEffectSequence}`;
    // This effect owns its read.  A shared "current project" ref can briefly
    // move during Shell recovery and discard a valid response for the very
    // project that is again on screen, leaving the directory's loading shell
    // indefinitely.  Only an actual cleanup of this read makes it obsolete.
    let cancelled = false;
    let emptyCoreRetryTimer: number | null = null;
    const isCurrentProject = () => !cancelled;
    const cached = projectionCache.get(projectId);
    recordDirectoryReadDiagnostic({ phase: "effect-start", projectId, effectId, classifiedCount: cached?.projection?.classifiedCount ?? 0, outcome: "loading" });
    setState(cached ? { ...cached, error: false, pendingStatus: "loading" } : { projectId, projection: createLoadingDirectoryProjection(projectId, translate.current), pending: null, error: false, pendingStatus: "loading" });
    void readDirectoryCore(projectId).then((core) => {
      if (!isCurrentProject() || core.library.project.id !== projectId) {
        recordDirectoryReadDiagnostic({ phase: "core-discard", projectId, effectId, responseProjectId: core.library.project.id, objectCount: core.library.objects.length, unitCount: core.units.length, outcome: "discarded", reason: cancelled ? "effect-cleanup" : "project-mismatch" });
        return;
      }
      // A newly active project can expose the directory before its local read
      // projection has caught up. Never turn that transient, fully empty
      // snapshot into a durable empty directory. The bootstrap's summary can
      // be just as stale as this first projection, so it must not decide
      // whether recovery is allowed. This remains bounded: a genuinely empty
      // project settles after the same short, read-only backoff window.
      const emptyCore = core.library.objects.length === 0 && core.units.length === 0;
      const retries = emptyCoreRetries.get(projectId) ?? 0;
      if (emptyCore && retries < emptyCoreRetryDelays.length) {
        emptyCoreRetries.set(projectId, retries + 1);
        emptyCoreRetryTimer = window.setTimeout(() => {
          if (isCurrentProject()) setPendingRevision((revision) => revision + 1);
        }, emptyCoreRetryDelays[retries]);
        recordDirectoryReadDiagnostic({ phase: "empty-retry-scheduled", projectId, effectId, objectCount: 0, unitCount: 0, outcome: "empty", reason: `attempt-${retries + 1}` });
        return;
      }
      if (!emptyCore) emptyCoreRetries.delete(projectId);
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
        recordDirectoryReadDiagnostic({ phase: "state-commit", projectId, effectId, responseProjectId: next.projection?.projectId ?? null, objectCount: core.library.objects.length, unitCount: core.units.length, classifiedCount: next.projection?.classifiedCount ?? 0, outcome: next.error ? "failed" : "ready", reason: next.pendingStatus });
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
    }).catch((error: unknown) => { if (isCurrentProject()) { recordDirectoryReadDiagnostic({ phase: "state-failed", projectId, effectId, outcome: "failed", reason: error instanceof Error ? error.name : "unknown" }); setState(cached ? { ...cached, error: true, pendingStatus: "failed" } : { projectId, projection: createLoadingDirectoryProjection(projectId, translate.current), pending: null, error: true, pendingStatus: "failed" }); } });
    return () => {
      cancelled = true;
      if (emptyCoreRetryTimer !== null) window.clearTimeout(emptyCoreRetryTimer);
      recordDirectoryReadDiagnostic({ phase: "effect-cleanup", projectId, effectId, outcome: "cancelled" });
    };
  // Tree navigation is presentation state. It must not cancel a project-level
  // read or its bounded empty-snapshot recovery while an author moves from
  // the root into Story Units.
  }, [pendingRevision, project?.id]);
  return state;
}
