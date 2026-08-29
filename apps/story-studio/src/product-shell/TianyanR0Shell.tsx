import { useEffect, useState } from "react";

import type { TianyiContextualSpaceId } from "../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import { TianyiSidebar } from "../components/tianyi/sidebar/TianyiSidebar";

import {
  resolveStoryStudioShellLocation,
  storyStudioShellDestinationById,
  type StoryStudioShellDestination
} from "./navigation/topLevelDestinationRegistry";
import {
  nextShellRailPreference,
  resolveInitialDirectoryOpen,
  resolveShellRailCollapsed,
  SHELL_DIRECTORY_OVERLAY_QUERY,
  SHELL_RAIL_AUTO_COLLAPSE_QUERY,
  type ShellRailPreference
} from "./navigation/responsiveRailState";
import { ProductShellNavigation } from "./navigation/ProductShellNavigation";
import { GlobalStatusBar } from "./topbar/GlobalStatusBar";
import { ProjectDirectoryPanel, type ProjectDirectoryMode } from "./project-directory/ProjectDirectoryPanel";
import { CharacterDirectoryPanel } from "./project-directory/character/CharacterDirectoryPanel";
import { CharacterInspectorLoader } from "./project-directory/character/CharacterInspectorCard";
import { CharacterProfileEditor } from "./project-directory/character/CharacterProfileEditor";
import { RightDock } from "./right-dock/RightDock";
import { useDockLayoutState } from "./right-dock/useDockLayoutState";
import { ShellCommandPalette } from "./commands/ShellCommandPalette";
import { ShellWorkspaceOutlet } from "./workspace/ShellWorkspaceOutlet";
import { resolveInitialShellTheme, type ShellTheme } from "./theme/theme";
import { useI18n } from "./i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "./runtime/TianyanShellRuntime";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../src/storyContracts/projectDirectoryContract.ts";
import { storyStudioWorkspaceRoute } from "./navigation/topLevelDestinationRegistry";
import type { GlobalSearchOpenRequest, GlobalSearchResult, GlobalSearchScope } from "./global-search/globalSearchTypes";

export function TianyanR0Shell(props: { runtime: TianyanShellRuntimeState }) {
  const { locale, t, toggleLocale } = useI18n();
  const shellLab = new URLSearchParams(window.location.search).get("shellLab") === "1";
  const [activeId, setActiveId] = useState(() => resolveStoryStudioShellLocation(window.location.pathname));
  const [locationRevision, setLocationRevision] = useState(0);
  const [railPreference, setRailPreference] = useState<ShellRailPreference>(() => {
    const requested = new URLSearchParams(window.location.search).get("rail");
    // A full, named space rail is the desktop default.  Compact mode is an
    // author choice, not a side effect of opening the product at a narrower
    // desktop width.
    return requested === "collapsed" || requested === "expanded" ? requested : "expanded";
  });
  const [autoCollapseRail, setAutoCollapseRail] = useState(() => window.matchMedia(SHELL_RAIL_AUTO_COLLAPSE_QUERY).matches);
  const [theme, setTheme] = useState<ShellTheme>(resolveInitialShellTheme);
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchRequest, setSearchRequest] = useState<GlobalSearchOpenRequest | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(() => resolveInitialDirectoryOpen(window.matchMedia(SHELL_DIRECTORY_OVERLAY_QUERY).matches));
  const dock = useDockLayoutState(!window.matchMedia(SHELL_DIRECTORY_OVERLAY_QUERY).matches);
  const activeDestination = storyStudioShellDestinationById(activeId);
  const capabilityWorkspace: TianyiContextualSpaceId = activeId === "collections" ? "writing" : activeId;
  const railCollapsed = resolveShellRailCollapsed(railPreference, autoCollapseRail);

  useEffect(() => {
    const handlePopState = () => { setActiveId(resolveStoryStudioShellLocation(window.location.pathname)); setLocationRevision((value) => value + 1); };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(SHELL_RAIL_AUTO_COLLAPSE_QUERY);
    const updateAutoCollapse = () => setAutoCollapseRail(media.matches);
    updateAutoCollapse();
    media.addEventListener("change", updateAutoCollapse);
    return () => media.removeEventListener("change", updateAutoCollapse);
  }, []);

  useEffect(() => {
    const openCommandPalette = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", openCommandPalette);
    return () => window.removeEventListener("keydown", openCommandPalette);
  }, []);

  useEffect(() => {
    const labelKey = accountOpen ? "nav.account" : settingsOpen ? "nav.settings" : activeDestination.labelKey;
    document.title = `${t(labelKey as Parameters<typeof t>[0])} · ${t("brand.name")}`;
  }, [accountOpen, activeDestination.labelKey, settingsOpen, t]);

  const navigate = (destination: StoryStudioShellDestination) => {
    const query = shellLab ? window.location.search : "";
    window.history.pushState({}, "", `${destination.route}${query}`);
    setActiveId(destination.id);
    setSettingsOpen(false);
    setAccountOpen(false);
  };
  const locationParams = new URLSearchParams(window.location.search);
  const directorySelection = locationParams.get("directoryObject");
  const directorySourceSelection = locationParams.get("directorySource");
  const characterDirectoryOpen = locationParams.get("directoryView") === "characters";
  const searchContext = props.runtime.project
    ? { projectId: props.runtime.project.id, workVersionId: props.runtime.workVersionId ?? "work-version.unversioned" }
    : { projectId: null, workVersionId: null };
  const requestSearch = (scope: GlobalSearchScope) => setSearchRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1, scope }));
  const closeOverlayDirectory = () => {
    if (window.matchMedia(SHELL_DIRECTORY_OVERLAY_QUERY).matches) setDirectoryOpen(false);
  };
  const navigateSearchResult = (result: GlobalSearchResult) => {
    const params = new URLSearchParams(result.target.query ?? {});
    if (shellLab) params.set("shellLab", "1");
    const query = params.size ? `?${params.toString()}` : "";
    window.history.pushState({}, "", `${result.target.route}${query}`);
    setActiveId(resolveStoryStudioShellLocation(result.target.route));
    if (result.target.query && (result.target.query.directoryObject || result.target.query.directorySource)) setDirectoryOpen(!window.matchMedia(SHELL_DIRECTORY_OVERLAY_QUERY).matches);
    setLocationRevision((value) => value + 1);
  };
  const navigateDirectory = (node: ProjectDirectoryNode) => {
    if (node.id === "directory.library.character") {
      const params = new URLSearchParams(window.location.search); params.set("directoryView", "characters"); params.delete("directoryObject");
      window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); return;
    }
    const destination = node.id.startsWith("directory.story") ? "event-line" : "library";
    const route = storyStudioWorkspaceRoute(destination);
    window.history.pushState({}, "", route);
    setActiveId(destination);
    closeOverlayDirectory();
  };
  const selectCharacter = (objectId: string) => { const params = new URLSearchParams(window.location.search); params.set("directoryView", "characters"); params.set("directoryObject", objectId); params.set("directoryType", "character"); window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); closeOverlayDirectory(); };
  const closeCharacterInspector = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryObject"); params.delete("directoryType"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const openCharacterProfileEditor = () => { const params = new URLSearchParams(window.location.search); params.set("directoryEdit", "character"); window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); };
  const closeCharacterProfileEditor = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryEdit"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const closeCharacterDirectory = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryView"); params.delete("directoryObject"); params.delete("directoryType"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const openDirectoryReference = (reference: ProjectDirectoryStableReference) => {
    const destination = reference.objectType === "event" || reference.objectType === "story-unit" ? "event-line" : "library";
    const params = reference.objectType === "source-document"
      ? new URLSearchParams({ directorySource: reference.objectId, directoryProject: reference.projectId, directoryWorkVersion: reference.workVersionId ?? "work-version.unversioned", directoryVersion: reference.version })
      : new URLSearchParams({ directoryObject: reference.objectId, directoryProject: reference.projectId, directoryVersion: reference.version, directoryType: reference.objectType });
    window.history.pushState({}, "", `${storyStudioWorkspaceRoute(destination)}?${params.toString()}`);
    setActiveId(destination);
    closeOverlayDirectory();
  };

  const toggleTheme = () => setTheme((current) => current === "cloud-ink" ? "night-paper" : "cloud-ink");
  const toggleRail = () => setRailPreference(nextShellRailPreference(railCollapsed));
  const openSettings = () => {
    setSettingsOpen(true);
    setAccountOpen(false);
    setDirectoryOpen(false);
    dock.setTianyiOpen(false);
  };
  const openAccount = () => {
    setAccountOpen(true);
    setSettingsOpen(false);
    setDirectoryOpen(false);
    dock.setTianyiOpen(false);
  };

  const togglePanel = (panel: "project-directory" | "global-tianyi") => panel === "project-directory" ? setDirectoryOpen((open) => !open) : dock.toggleTianyi();

  return <div
    className="tianyan-r0-shell"
    data-testid="tianyan-r0-shell"
    data-theme={theme}
    data-locale={locale}
    data-rail-collapsed={railCollapsed}
    data-directory-visible={directoryOpen}
    data-dock-panel-count={dock.state.openPanelIds.length}
    data-tianyi-open={dock.state.isTianyiOpen}
    data-settings-open={settingsOpen}
    data-account-open={accountOpen}
  >
    <ProductShellNavigation
      active={activeId}
      settingsOpen={settingsOpen}
      accountOpen={accountOpen}
      collapsed={railCollapsed}
      onSelect={navigate}
      onToggleCollapsed={toggleRail}
      onSettings={openSettings}
      onAccount={openAccount}
    />
    <GlobalStatusBar
      theme={theme}
      projectId={props.runtime.project?.id ?? null}
      projectName={props.runtime.project?.title}
      projects={props.runtime.projects}
      workVersionLabel={props.runtime.workVersionLabel}
      directoryOpen={directoryOpen}
      tianyiOpen={dock.state.isTianyiOpen}
      searchContext={searchContext}
      searchRequest={searchRequest}
      onSearchNavigate={navigateSearchResult}
      onOpenProject={props.runtime.openProject}
      onToggleTheme={toggleTheme}
      onToggleDirectory={() => setDirectoryOpen((open) => !open)}
      onToggleTianyi={dock.toggleTianyi}
    />
    {!settingsOpen && !accountOpen && directoryOpen && (characterDirectoryOpen ? <CharacterDirectoryPanel runtime={props.runtime} selectedId={directorySelection} onBack={closeCharacterDirectory} onSelect={selectCharacter} onRequestScopedSearch={() => requestSearch("characters")} /> : <ProjectDirectoryPanel runtime={props.runtime} project={props.runtime.project} mode={locationParams.get("directoryReview") === "pending" ? "pending" : "classified"} onClose={() => setDirectoryOpen(false)} onModeChange={(mode: ProjectDirectoryMode) => { const params = new URLSearchParams(window.location.search); if (mode === "pending") params.set("directoryReview", "pending"); else params.delete("directoryReview"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); }} onNavigate={navigateDirectory} onOpenReference={openDirectoryReference} selectedObjectId={directorySelection ?? directorySourceSelection} onCreateProject={props.runtime.createProject} />)}
    <ShellWorkspaceOutlet destination={activeDestination} shellLab={shellLab} settingsOpen={settingsOpen} accountOpen={accountOpen} onOpenTianyi={() => dock.setTianyiOpen(true)} directoryObjectId={locationParams.get("directoryType") === "character" ? null : directorySelection} />
    {!settingsOpen && !accountOpen && <RightDock layout={dock.state} onToggle={dock.togglePanel} onResize={dock.resizePanel} />}
    {!settingsOpen && !accountOpen && characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && <CharacterInspectorLoader key={`${directorySelection}:${locationRevision}`} runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterInspector} onOpenFull={openCharacterProfileEditor} />}
    {!settingsOpen && !accountOpen && characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && locationParams.get("directoryEdit") === "character" && <CharacterProfileEditor runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterProfileEditor} />}
    {!settingsOpen && !accountOpen && dock.state.isTianyiOpen && <TianyiSidebar workspace={capabilityWorkspace} pageLabel={t(activeDestination.labelKey as Parameters<typeof t>[0])} runtime={props.runtime} onClose={() => dock.setTianyiOpen(false)} onOpenSettings={openSettings} />}
    <ShellCommandPalette
      open={commandOpen}
      railCollapsed={railCollapsed}
      panelVisibility={{
        "project-directory": directoryOpen,
        "global-tianyi": dock.state.isTianyiOpen
      }}
      theme={theme}
      onClose={() => setCommandOpen(false)}
      onNavigate={navigate}
      onToggleRail={toggleRail}
      onTogglePanel={togglePanel}
      onToggleLocale={toggleLocale}
      onToggleTheme={toggleTheme}
    />
  </div>;
}
