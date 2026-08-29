import { useEffect, useState } from "react";
import { getCreationSourcePortState, getGoldenLoopCandidateReview, getWorldLibrary, listSourceImportReviews, listStoryUnits, type StoryStudioProject } from "../../lib/localTransport";
import type { ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { createProjectDirectoryViewModel } from "./projectDirectoryViewModel";
import type { TranslationKey } from "../i18n/translations";

export type DirectoryLoadState = { projectId: string | null; projection: ProjectDirectoryProjection | null; error: boolean };
/** Read-only aggregation adapter. It deliberately has no write token or domain mutation. */
export function useProjectDirectoryProjection(project: StoryStudioProject | null, t: (key: TranslationKey) => string): DirectoryLoadState {
  const [state, setState] = useState<DirectoryLoadState>({ projectId: null, projection: null, error: false });
  useEffect(() => {
    if (!project) { setState({ projectId: null, projection: null, error: false }); return; }
    let current = true; setState({ projectId: project.id, projection: null, error: false });
    void Promise.all([getWorldLibrary(project.id), listStoryUnits(project.id), getCreationSourcePortState({ projectId: project.id }), listSourceImportReviews(project.id), getGoldenLoopCandidateReview(project.id)]).then(([library, units, source, imports, review]) => {
      if (!current || library.project.id !== project.id) return;
      const pending = imports.flatMap((item) => item.candidates).filter((item) => item.status === "pending").length + (review?.candidates.filter((item) => item.status === "awaiting").length ?? 0);
      setState({ projectId: project.id, projection: createProjectDirectoryViewModel(t, { library, units, workVersionId: source.root?.id ?? null, pendingCount: pending }), error: false });
    }).catch(() => { if (current) setState({ projectId: project.id, projection: null, error: true }); });
    return () => { current = false; };
  }, [project?.id, t]);
  return state;
}
