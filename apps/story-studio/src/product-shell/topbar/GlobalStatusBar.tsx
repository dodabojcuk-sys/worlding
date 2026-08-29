import { FolderTree } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { GlobalSearchControl } from "../global-search/GlobalSearchControl";
import { createGlobalSearchEngine } from "../global-search/globalSearchEngine";
import { createProductGlobalSearchReadAdapter } from "../global-search/globalSearchReadAdapter";
import type { GlobalSearchContext, GlobalSearchOpenRequest, GlobalSearchResult } from "../global-search/globalSearchTypes";
import { useI18n } from "../i18n/I18nProvider";

export function GlobalStatusBar(props: {
  directoryOpen: boolean;
  searchContext: GlobalSearchContext;
  searchRequest: GlobalSearchOpenRequest | null;
  onSearchNavigate(result: GlobalSearchResult): void;
  onToggleDirectory(): void;
}) {
  const { t } = useI18n();
  const directoryToggleRef = useRef<HTMLButtonElement>(null);
  const searchEngine = useMemo(() => createGlobalSearchEngine(createProductGlobalSearchReadAdapter()), []);
  const searchLabels = useMemo(() => ({
    trigger: t("globalSearch.trigger"),
    placeholder: t("globalSearch.placeholder"),
    dialogLabel: t("globalSearch.dialogLabel"),
    close: t("common.close"),
    noResults: t("globalSearch.noResults"),
    scopeGlobal: t("globalSearch.scope.global"),
    scopeDirectory: t("globalSearch.scope.directory"),
    scopeCharacters: t("globalSearch.scope.characters"),
    resultCount: (count: number) => t("globalSearch.resultCount").replace("{count}", String(count)),
    resultType: {
      workspace: t("globalSearch.type.workspace"),
      object: t("globalSearch.type.object"),
      source: t("globalSearch.type.source"),
      command: t("globalSearch.type.command")
    },
    matchReason: {
      title: t("globalSearch.match.title"),
      alias: t("globalSearch.match.alias"),
      tag: t("globalSearch.match.tag"),
      type: t("globalSearch.match.type"),
      command: t("globalSearch.match.command")
    }
  }), [t]);

  useEffect(() => {
    const closeDirectoryFromEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !props.directoryOpen) return;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.closest(".project-directory-panel")) return;
      event.preventDefault();
      props.onToggleDirectory();
      window.requestAnimationFrame(() => directoryToggleRef.current?.focus());
    };
    window.addEventListener("keydown", closeDirectoryFromEscape);
    return () => window.removeEventListener("keydown", closeDirectoryFromEscape);
  }, [props.directoryOpen, props.onToggleDirectory]);

  return <header className="shell-topbar" aria-label={t("topbar.status")}>
    <div className="shell-topbar-actions">
      <GlobalSearchControl engine={searchEngine} context={props.searchContext} labels={searchLabels} openRequest={props.searchRequest} onNavigate={props.onSearchNavigate} />
      <button ref={directoryToggleRef} type="button" className="shell-topbar-panel-toggle" data-panel-toggle="project-directory" aria-pressed={props.directoryOpen} aria-label={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} title={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} onClick={props.onToggleDirectory}><FolderTree aria-hidden="true" /><span>{t("directory.label")}</span></button>
    </div>
  </header>;
}
