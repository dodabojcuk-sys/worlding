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
  resolveShellRailCollapsed,
  SHELL_RAIL_AUTO_COLLAPSE_QUERY,
  type ShellRailPreference
} from "./navigation/responsiveRailState";
import { ProductShellNavigation } from "./navigation/ProductShellNavigation";
import { GlobalStatusBar } from "./topbar/GlobalStatusBar";
import { ProjectDirectoryPanel } from "./project-directory/ProjectDirectoryPanel";
import { CharacterDirectoryPanel } from "./project-directory/character/CharacterDirectoryPanel";
import { CharacterInspectorLoader } from "./project-directory/character/CharacterInspectorCard";
import { RightDock } from "./right-dock/RightDock";
import { useDockLayoutState } from "./right-dock/useDockLayoutState";
import { ShellCommandPalette } from "./commands/ShellCommandPalette";
import { ShellWorkspaceOutlet } from "./workspace/ShellWorkspaceOutlet";
import { resolveInitialShellTheme, type ShellTheme } from "./theme/theme";
import { useI18n } from "./i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "./runtime/TianyanShellRuntime";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../src/storyContracts/projectDirectoryContract.ts";
import { storyStudioWorkspaceRoute } from "./navigation/topLevelDestinationRegistry";

export function TianyanR0Shell(props: { runtime: TianyanShellRuntimeState }) {
  const { locale, t, toggleLocale } = useI18n();
  const shellLab = new URLSearchParams(window.location.search).get("shellLab") === "1";
  const [activeId, setActiveId] = useState(() => resolveStoryStudioShellLocation(window.location.pathname));
  const [locationRevision, setLocationRevision] = useState(0);
  const [railPreference, setRailPreference] = useState<ShellRailPreference>(() => {
    const requested = new URLSearchParams(window.location.search).get("rail");
    return requested === "collapsed" || requested === "expanded" ? requested : "auto";
  });
  const [autoCollapseRail, setAutoCollapseRail] = useState(() => window.matchMedia(SHELL_RAIL_AUTO_COLLAPSE_QUERY).matches);
  const [theme, setTheme] = useState<ShellTheme>(resolveInitialShellTheme);
  const [commandOpen, setCommandOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const dock = useDockLayoutState();
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", openCommandPalette);
    return () => window.removeEventListener("keydown", openCommandPalette);
  }, []);

  useEffect(() => {
    document.title = `${t(activeDestination.labelKey as Parameters<typeof t>[0])} · ${t("brand.name")}`;
  }, [activeDestination.labelKey, t]);

  const navigate = (destination: StoryStudioShellDestination) => {
    const query = shellLab ? window.location.search : "";
    window.history.pushState({}, "", `${destination.route}${query}`);
    setActiveId(destination.id);
  };
  const locationParams = new URLSearchParams(window.location.search);
  const directorySelection = locationParams.get("directoryObject");
  const characterDirectoryOpen = locationParams.get("directoryView") === "characters";
  const navigateDirectory = (node: ProjectDirectoryNode) => {
    if (node.id === "directory.library.character") {
      const params = new URLSearchParams(window.location.search); params.set("directoryView", "characters"); params.delete("directoryObject");
      window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); return;
    }
    const destination = node.id.startsWith("directory.story") ? "event-line" : "library";
    const route = storyStudioWorkspaceRoute(destination);
    window.history.pushState({}, "", route);
    setActiveId(destination);
  };
  const selectCharacter = (objectId: string) => { const params = new URLSearchParams(window.location.search); params.set("directoryView", "characters"); params.set("directoryObject", objectId); params.set("directoryType", "character"); window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); };
  const closeCharacterInspector = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryObject"); params.delete("directoryType"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const closeCharacterDirectory = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryView"); params.delete("directoryObject"); params.delete("directoryType"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const openDirectoryReference = (reference: ProjectDirectoryStableReference) => {
    const destination = reference.objectType === "event" || reference.objectType === "story-unit" ? "event-line" : "library";
    const params = new URLSearchParams({ directoryObject: reference.objectId, directoryProject: reference.projectId, directoryVersion: reference.version, directoryType: reference.objectType });
    window.history.pushState({}, "", `${storyStudioWorkspaceRoute(destination)}?${params.toString()}`);
    setActiveId(destination);
  };
  const openPendingReviews = () => { window.history.pushState({}, "", `${storyStudioWorkspaceRoute("data")}?directoryView=pending`); setActiveId("data"); };

  const toggleTheme = () => setTheme((current) => current === "cloud-ink" ? "night-paper" : "cloud-ink");
  const toggleRail = () => setRailPreference(nextShellRailPreference(railCollapsed));

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
  >
    <ProductShellNavigation
      active={activeId}
      collapsed={railCollapsed}
      onSelect={navigate}
      onToggleCollapsed={toggleRail}
      onOpenCommand={() => setCommandOpen(true)}
      onSettings={() => undefined}
      onAccount={() => undefined}
    />
    <GlobalStatusBar theme={theme} projectName={props.runtime.project?.title} workVersionLabel={props.runtime.workVersionLabel} directoryOpen={directoryOpen} tianyiOpen={dock.state.isTianyiOpen} onToggleTheme={toggleTheme} onToggleDirectory={() => setDirectoryOpen((open) => !open)} onToggleTianyi={dock.toggleTianyi} />
    {directoryOpen && (characterDirectoryOpen ? <CharacterDirectoryPanel runtime={props.runtime} selectedId={directorySelection} onBack={closeCharacterDirectory} onSelect={selectCharacter} onRequestScopedSearch={(request) => window.dispatchEvent(new CustomEvent("tianyan:scoped-search-request", { detail: request }))} /> : <ProjectDirectoryPanel project={props.runtime.project} onClose={() => setDirectoryOpen(false)} onNavigate={navigateDirectory} onOpenReference={openDirectoryReference} onOpenPending={openPendingReviews} selectedObjectId={directorySelection} />)}
    <ShellWorkspaceOutlet destination={activeDestination} shellLab={shellLab} onOpenTianyi={() => dock.setTianyiOpen(true)} directoryObjectId={locationParams.get("directoryType") === "character" ? null : directorySelection} />
    <RightDock layout={dock.state} onToggle={dock.togglePanel} onResize={dock.resizePanel} />
    {characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && <CharacterInspectorLoader key={`${directorySelection}:${locationRevision}`} runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterInspector} />}
    {dock.state.isTianyiOpen && <TianyiSidebar workspace={capabilityWorkspace} pageLabel={t(activeDestination.labelKey as Parameters<typeof t>[0])} runtime={props.runtime} onClose={() => dock.setTianyiOpen(false)} />}
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
