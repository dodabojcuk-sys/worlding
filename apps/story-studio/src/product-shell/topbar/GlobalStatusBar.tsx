import { Check, ChevronDown, CloudOff, FolderTree, Languages, MoonStar, MoreHorizontal, Sparkles, SunMedium } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GlobalSearchControl } from "../global-search/GlobalSearchControl";
import { createGlobalSearchEngine } from "../global-search/globalSearchEngine";
import { createProductGlobalSearchReadAdapter } from "../global-search/globalSearchReadAdapter";
import type { GlobalSearchContext, GlobalSearchOpenRequest, GlobalSearchResult } from "../global-search/globalSearchTypes";
import { useI18n } from "../i18n/I18nProvider";
import { SHELL_THEME_REGISTRY, type ShellTheme } from "../theme/theme";

export function GlobalStatusBar(props: {
  theme: ShellTheme;
  projectName?: string;
  projectId: string | null;
  projects: ReadonlyArray<{ id: string; title: string }>;
  workVersionLabel: string | null;
  directoryOpen: boolean;
  tianyiOpen: boolean;
  searchContext: GlobalSearchContext;
  searchRequest: GlobalSearchOpenRequest | null;
  onSearchNavigate(result: GlobalSearchResult): void;
  onOpenProject(projectId: string): Promise<void>;
  onToggleTheme(): void;
  onToggleDirectory(): void;
  onToggleTianyi(): void;
}) {
  const { t, toggleLocale } = useI18n();
  const directoryToggleRef = useRef<HTMLButtonElement>(null);
  const projectToggleRef = useRef<HTMLButtonElement>(null);
  const moreToggleRef = useRef<HTMLButtonElement>(null);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [projectOpenError, setProjectOpenError] = useState<string | null>(null);
  const themeLabel = t(SHELL_THEME_REGISTRY[props.theme].labelKey);
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
      if (event.defaultPrevented || event.key !== "Escape" || !props.directoryOpen) return;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.closest(".project-directory-panel")) return;
      event.preventDefault();
      props.onToggleDirectory();
      window.requestAnimationFrame(() => directoryToggleRef.current?.focus());
    };
    window.addEventListener("keydown", closeDirectoryFromEscape);
    return () => window.removeEventListener("keydown", closeDirectoryFromEscape);
  }, [props.directoryOpen, props.onToggleDirectory]);

  useEffect(() => {
    if (!projectSelectorOpen) return;
    const closeProjectSelector = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setProjectSelectorOpen(false);
      window.requestAnimationFrame(() => projectToggleRef.current?.focus());
    };
    window.addEventListener("keydown", closeProjectSelector);
    return () => window.removeEventListener("keydown", closeProjectSelector);
  }, [projectSelectorOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOverflow = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      window.requestAnimationFrame(() => moreToggleRef.current?.focus());
    };
    window.addEventListener("keydown", closeOverflow);
    return () => window.removeEventListener("keydown", closeOverflow);
  }, [moreOpen]);

  return <header className="shell-topbar" aria-label={t("topbar.status")}>
    <div className="shell-topbar-context shell-project-selector">
      <button
        ref={projectToggleRef}
        type="button"
        className="shell-context-control"
        title={t("topbar.project")}
        aria-label={t("topbar.selectProject")}
        aria-haspopup="menu"
        aria-controls="shell-project-selector-menu"
        aria-expanded={projectSelectorOpen}
        onClick={() => setProjectSelectorOpen((open) => !open)}
      >
        <span><strong>{props.projectName ?? t("topbar.projectName")}</strong>{props.workVersionLabel && <i>{props.workVersionLabel}</i>}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {projectSelectorOpen && <section id="shell-project-selector-menu" className="shell-project-selector-menu" role="menu" aria-label={t("topbar.projects")}>
        {props.projects.length === 0 && <p>{t("topbar.noProjectOptions")}</p>}
        {props.projects.map((project) => <button
          key={project.id}
          type="button"
          role="menuitemradio"
          aria-checked={project.id === props.projectId}
          onClick={() => {
            setProjectOpenError(null);
            void props.onOpenProject(project.id)
              .then(() => setProjectSelectorOpen(false))
              .catch(() => setProjectOpenError(t("topbar.projectOpenFailed")));
          }}
        >{project.title}</button>)}
        {projectOpenError && <p role="alert">{projectOpenError}</p>}
      </section>}
    </div>
    <div className="shell-topbar-actions">
      <GlobalSearchControl engine={searchEngine} context={props.searchContext} labels={searchLabels} openRequest={props.searchRequest} onNavigate={props.onSearchNavigate} />
      <div className="shell-topbar-secondary">
        <button type="button" className="shell-topbar-text-control" aria-label={t("topbar.language")} title={t("topbar.language")} onClick={toggleLocale}><Languages aria-hidden="true" /><span>{t("topbar.languageValue")}</span></button>
        <button type="button" className="shell-topbar-text-control" aria-label={t("topbar.theme")} title={t("topbar.theme")} onClick={props.onToggleTheme}>
          {props.theme === "cloud-ink" ? <SunMedium aria-hidden="true" /> : <MoonStar aria-hidden="true" />}<span>{themeLabel}</span>
        </button>
        <span className="shell-topbar-divider" aria-hidden="true" />
        <div className="shell-runtime-status" aria-label={t("topbar.localStatus")} title={t("topbar.localStatus")}><Check aria-hidden="true" /><span>{t("topbar.localOnly")}</span></div>
        <div className="shell-runtime-status is-offline" aria-label={t("topbar.syncStatus")} title={t("topbar.syncStatus")}><CloudOff aria-hidden="true" /><span>{t("common.notConnected")}</span></div>
        <span className="shell-topbar-divider" aria-hidden="true" />
      </div>
      <button ref={directoryToggleRef} type="button" className="shell-topbar-panel-toggle" data-panel-toggle="project-directory" aria-pressed={props.directoryOpen} aria-label={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} title={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} onClick={props.onToggleDirectory}><FolderTree aria-hidden="true" /><span>{t("directory.label")}</span></button>
      <button type="button" className="shell-topbar-panel-toggle" data-panel-toggle="global-tianyi" aria-pressed={props.tianyiOpen} aria-label={t(props.tianyiOpen ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} title={t(props.tianyiOpen ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} onClick={props.onToggleTianyi}><Sparkles aria-hidden="true" /><span>{t("space.tianyi")}</span></button>
      <div className="shell-topbar-more">
        <button ref={moreToggleRef} type="button" className="shell-topbar-text-control" aria-label={t("topbar.more")} title={t("topbar.more")} aria-haspopup="menu" aria-controls="shell-topbar-overflow-menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal aria-hidden="true" /></button>
        {moreOpen && <section id="shell-topbar-overflow-menu" className="shell-topbar-overflow-menu" role="menu" aria-label={t("topbar.more")}>
          <button type="button" role="menuitem" onClick={() => { toggleLocale(); setMoreOpen(false); }}><Languages aria-hidden="true" /><span>{t("topbar.languageValue")}</span></button>
          <button type="button" role="menuitem" onClick={() => { props.onToggleTheme(); setMoreOpen(false); }}>{props.theme === "cloud-ink" ? <SunMedium aria-hidden="true" /> : <MoonStar aria-hidden="true" />}<span>{themeLabel}</span></button>
          <div className="shell-runtime-status" aria-label={t("topbar.localStatus")}><Check aria-hidden="true" /><span>{t("topbar.localOnly")}</span></div>
          <div className="shell-runtime-status is-offline" aria-label={t("topbar.syncStatus")}><CloudOff aria-hidden="true" /><span>{t("common.notConnected")}</span></div>
        </section>}
      </div>
    </div>
  </header>;
}
