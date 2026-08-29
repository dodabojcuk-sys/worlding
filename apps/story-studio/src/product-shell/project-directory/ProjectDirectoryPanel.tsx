import { Search, X } from "lucide-react";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";

import { PendingReviewEntry } from "./PendingReviewEntry";
import { ProjectDirectoryTree } from "./ProjectDirectoryTree";
import { useProjectDirectoryProjection } from "./useProjectDirectoryProjection";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectDirectoryPanel(props: { project: Parameters<typeof useProjectDirectoryProjection>[0]; onClose(): void; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void; onOpenPending(): void; onRequestSearch(): void; selectedObjectId: string | null }) {
  const { t } = useI18n();
  const state = useProjectDirectoryProjection(props.project, t);
  return <aside className="project-directory-panel" aria-label={t("panel.projectDirectory")} data-story-fact-owner="false">
    <header>
      <h2>{t("panel.projectDirectory")}</h2>
      <div>
        <button type="button" className="project-directory-search-entry" aria-label={t("globalSearch.directoryTrigger")} title={t("globalSearch.directoryTrigger")} onClick={props.onRequestSearch}><Search aria-hidden="true" /></button>
        <PendingReviewEntry count={state.projection?.pendingCount ?? 0} onOpen={props.onOpenPending} />
        <button type="button" className="project-directory-close" aria-label={t("panel.closeProjectDirectory")} title={t("panel.closeProjectDirectory")} onClick={props.onClose}><X aria-hidden="true" /></button>
      </div>
    </header>
    <div className="project-directory-section-title"><strong>{t("directory.classified")}</strong><span>{state.projection?.classifiedCount ?? 0}</span></div>
    {state.projection && <ProjectDirectoryTree groups={state.projection.groups} selectedObjectId={props.selectedObjectId} onNavigate={props.onNavigate} onOpenReference={props.onOpenReference} />}
    {state.error && <p className="project-directory-empty">{t("directory.unavailable")}</p>}
    {state.projection?.groups.length === 0 && <p className="project-directory-empty">{t("directory.empty")}</p>}
  </aside>;
}
