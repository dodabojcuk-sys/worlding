import { useEffect, useState } from "react";

import type { TianyiContextualSpaceId } from "../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import { TianyiSidebar, type TianyiSidebarContextRequest } from "../components/tianyi/sidebar/TianyiSidebar";

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
import type { StoryStudioEventReference } from "../../../../src/storyContracts/storyStudioEventReference.ts";
import { useWorkspaceDockSlot, workspaceDockCoordinator } from "./WorkspaceDockCoordinator";

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
  const isSettingsRoute = () => window.location.pathname === "/settings" || window.location.pathname.startsWith("/settings/");
  const [settingsOpen, setSettingsOpen] = useState(isSettingsRoute);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchRequest, setSearchRequest] = useState<GlobalSearchOpenRequest | null>(null);
  const [tianyiContextRequest, setTianyiContextRequest] = useState<TianyiSidebarContextRequest | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(() => resolveInitialDirectoryOpen(window.matchMedia(SHELL_DIRECTORY_OVERLAY_QUERY).matches));
  const dock = useDockLayoutState();
  const rightWorkSurface = useWorkspaceDockSlot();
  const tianyiOpen = rightWorkSurface.mode === "TIANYI";
  const activeDestination = storyStudioShellDestinationById(activeId);
  const capabilityWorkspace: TianyiContextualSpaceId = activeId === "collections" ? "writing" : activeId;
  const railCollapsed = resolveShellRailCollapsed(railPreference, autoCollapseRail);

  useEffect(() => {
    const handlePopState = () => {
      setActiveId(resolveStoryStudioShellLocation(window.location.pathname));
      setSettingsOpen(isSettingsRoute());
      setAccountOpen(false);
      setLocationRevision((value) => value + 1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const closeProjectDirectory = () => setDirectoryOpen(false);
    window.addEventListener("story-studio-close-project-directory", closeProjectDirectory);
    return () => window.removeEventListener("story-studio-close-project-directory", closeProjectDirectory);
  }, []);

  useEffect(() => {
    const receiveKnowledgeContext = (event: Event) => {
      const detail = (event as CustomEvent<{ eventRefs?: StoryStudioEventReference[]; selectionId?: string | null; knowledgeView?: { observerId: string; observerLabel: string; hiddenEventCount: number } }>).detail;
      if (!detail?.knowledgeView) return;
      setTianyiContextRequest((current) => {
        const explicitMultiNodeContext = Boolean(current?.predictionSourceLabels?.length || (current?.eventRefs?.length ?? 0) > 1);
        if (current && explicitMultiNodeContext) return { ...current, knowledgeView: detail.knowledgeView };
        return {
          productMode: "world",
          activeOwner: { kind: detail.selectionId ? "world-object" : "project", id: detail.selectionId ?? props.runtime.project?.id ?? null },
          selection: { documentId: null, objectId: detail.selectionId ?? null, timelinePointId: null },
          sourceRefs: [],
          memorySelections: [],
          enabledSkillRefs: [],
          eventRefs: detail.eventRefs ?? [],
          knowledgeView: detail.knowledgeView
        };
      });
    };
    window.addEventListener("story-studio-event-line-knowledge-context", receiveKnowledgeContext);
    return () => window.removeEventListener("story-studio-event-line-knowledge-context", receiveKnowledgeContext);
  }, [props.runtime.project?.id]);

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

  useEffect(() => {
    if (activeId !== "event-line" && rightWorkSurface.mode !== "NONE" && rightWorkSurface.mode !== "TIANYI") {
      workspaceDockCoordinator.close();
    }
  }, [activeId, rightWorkSurface.mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("tianyiSession");
    const candidateId = params.get("tianyiCandidate");
    if (sessionId && sessionId !== props.runtime.tianyiConversationId) props.runtime.setTianyiConversationId(sessionId);
    if (candidateId && candidateId !== props.runtime.activeTianyiCandidateId) props.runtime.setActiveTianyiCandidateId(candidateId);
  }, [activeId, locationRevision, props.runtime]);

  useEffect(() => {
    if (rightWorkSurface.mode !== "NONE" && window.matchMedia("(max-width: 90rem)").matches) {
      setDirectoryOpen(false);
    }
  }, [rightWorkSurface.mode]);

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
    const destination = node.id.startsWith("directory.story") || node.id.startsWith("unit:") ? "event-line" : "library";
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
    if (!isSettingsRoute()) window.history.pushState({}, "", "/settings");
    setSettingsOpen(true);
    setAccountOpen(false);
    setDirectoryOpen(false);
    workspaceDockCoordinator.close();
  };
  const openAccount = () => {
    setAccountOpen(true);
    setSettingsOpen(false);
    setDirectoryOpen(false);
    workspaceDockCoordinator.close();
  };
  const openTianyi = (reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[], predictionSourceUnitSummary?: string, knowledgeView?: { observerId: string; observerLabel: string; hiddenEventCount: number }) => {
    const eventRefs = reference ? (Array.isArray(reference) ? reference : [reference]) : [];
    setTianyiContextRequest(reference || knowledgeView ? {
      productMode: "world",
      activeOwner: { kind: "world-object", id: eventRefs[0]?.eventId ?? null },
      selection: { documentId: null, objectId: eventRefs[0]?.eventId ?? null, timelinePointId: null },
      sourceRefs: [], memorySelections: [], enabledSkillRefs: [], eventRefs, predictionSourceLabels, predictionSourceUnitSummary, knowledgeView
    } : null);
    if (initialDraft !== undefined) {
      if (predictionSourceLabels?.length) props.runtime.setPageAgentTaskDraft(initialDraft);
      else props.runtime.setWorkComposerDraft(initialDraft);
    }
    if (window.matchMedia("(max-width: 90rem)").matches) setDirectoryOpen(false);
    workspaceDockCoordinator.openQuickTianyi();
  };

  const toggleTianyi = () => {
    if (!tianyiOpen && window.matchMedia("(max-width: 90rem)").matches) setDirectoryOpen(false);
    if (tianyiOpen) workspaceDockCoordinator.closeQuickTianyi();
    else workspaceDockCoordinator.openQuickTianyi();
  };
  const togglePanel = (panel: "project-directory" | "global-tianyi") => panel === "project-directory" ? setDirectoryOpen((open) => !open) : toggleTianyi();

  return <div
    className="tianyan-r0-shell"
    data-testid="tianyan-r0-shell"
    data-theme={theme}
    data-locale={locale}
    data-rail-collapsed={railCollapsed}
    data-directory-visible={directoryOpen}
    data-dock-panel-count={dock.state.openPanelIds.length}
    data-tianyi-open={tianyiOpen}
    data-right-work-surface={rightWorkSurface.mode}
    data-settings-open={settingsOpen}
    data-account-open={accountOpen}
    data-connection-state={props.runtime.connectionState}
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
      tianyiOpen={tianyiOpen}
      searchContext={searchContext}
      searchRequest={searchRequest}
      onSearchNavigate={navigateSearchResult}
      onOpenProject={props.runtime.openProject}
      onToggleTheme={toggleTheme}
      onToggleDirectory={() => setDirectoryOpen((open) => !open)}
      onToggleTianyi={toggleTianyi}
    />
    {!settingsOpen && !accountOpen && directoryOpen && (characterDirectoryOpen ? <CharacterDirectoryPanel runtime={props.runtime} selectedId={directorySelection} onBack={closeCharacterDirectory} onSelect={selectCharacter} onRequestScopedSearch={() => requestSearch("characters")} /> : <ProjectDirectoryPanel runtime={props.runtime} project={props.runtime.project} mode={locationParams.get("directoryReview") === "pending" ? "pending" : "classified"} onClose={() => setDirectoryOpen(false)} onModeChange={(mode: ProjectDirectoryMode) => { const params = new URLSearchParams(window.location.search); if (mode === "pending") params.set("directoryReview", "pending"); else params.delete("directoryReview"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); }} onNavigate={navigateDirectory} onOpenReference={openDirectoryReference} selectedObjectId={directorySelection ?? directorySourceSelection} onCreateProject={props.runtime.createProject} />)}
    <ShellWorkspaceOutlet destination={activeDestination} shellLab={shellLab} settingsOpen={settingsOpen} accountOpen={accountOpen} runtime={props.runtime} onOpenTianyi={openTianyi} directoryObjectId={locationParams.get("directoryType") === "character" ? null : directorySelection} />
    {!settingsOpen && !accountOpen && <RightDock layout={dock.state} onToggle={dock.togglePanel} onResize={dock.resizePanel} />}
    {!settingsOpen && !accountOpen && characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && <CharacterInspectorLoader key={`${directorySelection}:${locationRevision}`} runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterInspector} onOpenFull={openCharacterProfileEditor} />}
    {!settingsOpen && !accountOpen && characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && locationParams.get("directoryEdit") === "character" && <CharacterProfileEditor runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterProfileEditor} />}
    {!settingsOpen && !accountOpen && activeId !== "tianyi" && tianyiOpen && <TianyiSidebar workspace={capabilityWorkspace} pageLabel={t(activeDestination.labelKey as Parameters<typeof t>[0])} runtime={props.runtime} agentAvailable={activeId === "event-line"} contextRequest={tianyiContextRequest} onClose={() => workspaceDockCoordinator.closeQuickTianyi()} onOpenSettings={openSettings} />}
    <ShellCommandPalette
      open={commandOpen}
      railCollapsed={railCollapsed}
      panelVisibility={{
        "project-directory": directoryOpen,
        "global-tianyi": tianyiOpen
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
