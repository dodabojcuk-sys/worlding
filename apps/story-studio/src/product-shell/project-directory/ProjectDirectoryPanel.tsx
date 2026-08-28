import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PendingReviewEntry } from "./PendingReviewEntry";
import { ProjectDirectoryTree } from "./ProjectDirectoryTree";
import { createProjectDirectoryViewModel, filterProjectDirectory } from "./projectDirectoryViewModel";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectDirectoryPanel(props: { onClose(): void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const projection = useMemo(() => createProjectDirectoryViewModel(t), [t]);
  const filtered = useMemo(() => filterProjectDirectory(projection, query), [projection, query]);
  return <aside className="project-directory-panel" aria-label={t("panel.projectDirectory")} data-story-fact-owner="false">
    <header>
      <h2>{t("panel.projectDirectory")}</h2>
      <div>
        <PendingReviewEntry count={projection.pendingCount} />
        <button type="button" className="project-directory-close" aria-label={t("panel.closeProjectDirectory")} title={t("panel.closeProjectDirectory")} onClick={props.onClose}><X aria-hidden="true" /></button>
      </div>
    </header>
    <label className="project-directory-search">
      <Search aria-hidden="true" />
      <span className="shell-visually-hidden">{t("directory.search")}</span>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("directory.searchPlaceholder")} />
      <SlidersHorizontal aria-hidden="true" />
    </label>
    <div className="project-directory-section-title"><strong>{t("directory.classified")}</strong><span>{projection.classifiedCount}</span></div>
    <ProjectDirectoryTree groups={filtered.groups} />
    {filtered.groups.length === 0 && <p className="project-directory-empty">{t("directory.empty")}</p>}
  </aside>;
}
