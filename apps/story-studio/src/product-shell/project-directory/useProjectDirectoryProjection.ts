import { useEffect, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getWorldLibrary, listAgentRecognitionProposals, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createEmptyProjectDirectoryProjection, createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import type { TranslationKey } from "../i18n/translations";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; error: boolean };
/** Read-only aggregation adapter. It deliberately has no write token or domain mutation. */
export function useProjectDirectoryProjection(project: StoryStudioProject | null, t: (key: TranslationKey) => string, runtime?: Pick<TianyanShellRuntimeState, "withConnection">): DirectoryLoadState {
  const [state, setState] = useState<DirectoryLoadState>(() => ({ projectId: null, projection: createEmptyProjectDirectoryProjection(t), error: false }));
  useEffect(() => {
    if (!project) { setState({ projectId: null, projection: createEmptyProjectDirectoryProjection(t), error: false }); return; }
    let current = true; setState({ projectId: project.id, projection: null, error: false });
    void Promise.all([getWorldLibrary(project.id), listStoryUnits(project.id), getCreationSourcePortState({ projectId: project.id }), listSourceImportReviews(project.id), getGoldenLoopCandidateReview(project.id), runtime ? runtime.withConnection((token) => listAgentRecognitionProposals(project.id, token)) : Promise.resolve([])]).then(([library, units, source, imports, review, proposals]) => {
      if (!current || library.project.id !== project.id) return;
      const pending = imports.flatMap((item) => item.candidates).filter((item) => item.status === "pending").length + (review?.candidates.filter((item) => item.status === "awaiting").length ?? 0) + proposals.filter((item) => item.status === "pending" || item.status === "edited").length;
      setState({ projectId: project.id, projection: createProjectDirectoryViewModel(t, { library, units, sources: imports, workVersionId: source.root?.id ?? null, pendingCount: pending }), error: false });
    }).catch(() => { if (current) setState({ projectId: project.id, projection: null, error: true }); });
    return () => { current = false; };
  }, [project?.id, runtime, t]);
  return state;
}
