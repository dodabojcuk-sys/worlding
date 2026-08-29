import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";

import { PendingReviewEntry } from "./PendingReviewEntry";
import { ProjectDirectoryTree } from "./ProjectDirectoryTree";
import { filterProjectDirectory } from "./projectDirectoryViewModel";
import { useProjectDirectoryProjection } from "./useProjectDirectoryProjection";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectDirectoryPanel(props: { project: Parameters<typeof useProjectDirectoryProjection>[0]; onClose(): void; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void; onOpenPending(): void; selectedObjectId: string | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const state = useProjectDirectoryProjection(props.project, t);
  const filtered = useMemo(() => state.projection ? filterProjectDirectory(state.projection, query) : null, [state.projection, query]);
  return <aside className="project-directory-panel" aria-label={t("panel.projectDirectory")} data-story-fact-owner="false">
    <header>
      <h2>{t("panel.projectDirectory")}</h2>
      <div>
        <PendingReviewEntry count={state.projection?.pendingCount ?? 0} onOpen={props.onOpenPending} />
        <button type="button" className="project-directory-close" aria-label={t("panel.closeProjectDirectory")} title={t("panel.closeProjectDirectory")} onClick={props.onClose}><X aria-hidden="true" /></button>
      </div>
    </header>
    <label className="project-directory-search">
      <Search aria-hidden="true" />
      <span className="shell-visually-hidden">{t("directory.search")}</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("directory.searchPlaceholder")} />
      <SlidersHorizontal aria-hidden="true" />
    </label>
    <div className="project-directory-section-title"><strong>{t("directory.classified")}</strong><span>{state.projection?.classifiedCount ?? 0}</span></div>
    {filtered && <ProjectDirectoryTree groups={filtered.groups} selectedObjectId={props.selectedObjectId} onNavigate={props.onNavigate} onOpenReference={props.onOpenReference} />}
    {state.error && <p className="project-directory-empty">{t("directory.unavailable")}</p>}
    {filtered?.groups.length === 0 && <p className="project-directory-empty">{t("directory.empty")}</p>}
  </aside>;
}
