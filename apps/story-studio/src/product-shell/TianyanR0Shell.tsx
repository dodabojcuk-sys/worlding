import { useEffect, useRef, useState } from "react";

import type { TianyiContextualSpaceId } from "../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import { TianyiSidebar, type TianyiKnowledgeViewContext, type TianyiSidebarContextRequest } from "../components/tianyi/sidebar/TianyiSidebar";

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
import { PendingReviewWorkspace } from "./project-directory/PendingReviewPanel";
import type { StoryIntakeReviewTarget } from "./project-directory/pendingReviewAggregation";
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
import { cssLength, resolveShellFocusLayout, type ShellFocusLayout } from "./layout/shellFocusLayout";
import { tianyiStoryIntakeRunStorageKey } from "./runtime/tianyiShellSessionRecovery";
import {
  readDirectoryWorkspaceState,
  resolveDirectoryPresentation,
  writeDirectoryWorkspaceState,
  type DirectoryWorkspaceState,
  type DirectoryTemporarySurface
} from "./project-directory/directoryWorkspaceState";

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
  const initialDirectoryOpen = (() => {
    const params = new URLSearchParams(window.location.search);
    const requestedByStableUrl = ["directoryView", "directoryObject", "directorySource", "directoryReview"].some((key) => params.has(key));
    return requestedByStableUrl || resolveInitialDirectoryOpen(window.matchMedia(SHELL_DIRECTORY_OVERLAY_QUERY).matches);
  })();
  const [directoryState, setDirectoryState] = useState<DirectoryWorkspaceState>(() => readDirectoryWorkspaceState(props.runtime.project?.id ?? null, initialDirectoryOpen));
  const directoryStateProjectId = useRef<string | null>(props.runtime.project?.id ?? null);
  const [workspaceDirectorySuppressed, setWorkspaceDirectorySuppressed] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const [focusLayout, setFocusLayout] = useState<ShellFocusLayout>("focused");
  const dock = useDockLayoutState();
  const rightWorkSurface = useWorkspaceDockSlot();
  const tianyiOpen = rightWorkSurface.mode === "TIANYI";
  const activeDestination = storyStudioShellDestinationById(activeId);
  const capabilityWorkspace: TianyiContextualSpaceId = activeId === "collections" ? "writing" : activeId;
  const railCollapsed = resolveShellRailCollapsed(railPreference, autoCollapseRail);
  const locationParams = new URLSearchParams(window.location.search);
  const pendingReviewOpen = activeId === "tianyi" && locationParams.get("directoryReview") === "pending";
  const directorySelection = locationParams.get("directoryObject");
  const directorySourceSelection = locationParams.get("directorySource");
  const characterDirectoryOpen = locationParams.get("directoryView") === "characters" || directoryState.path[0] === "characters";
  const resolvedDirectorySelection = directorySelection ?? directoryState.selectedObjectId;
  const temporaryDirectorySurface: DirectoryTemporarySurface = settingsOpen
    ? "settings"
    : accountOpen
      ? "account"
      : pendingReviewOpen
        ? "central-review"
        : workspaceDirectorySuppressed
          ? "workspace-overlay"
          : focusLayout !== "wide" && rightWorkSurface.mode === "TIANYI"
            ? "tianyi"
            : focusLayout !== "wide" && (dock.state.activeToolId !== null || Boolean(directorySourceSelection))
              ? "right-inspector"
              : "none";
  const directoryPreferredOpen = directoryState.preferredOpen;
  const directoryStateReady = directoryStateProjectId.current === (props.runtime.project?.id ?? null);
  const directoryPresented = resolveDirectoryPresentation({ preferredOpen: directoryPreferredOpen, temporarySurface: temporaryDirectorySurface });

  const updateDirectoryState = (next: DirectoryWorkspaceState) => {
    setDirectoryState(next);
    writeDirectoryWorkspaceState(props.runtime.project?.id ?? null, next);
  };
  const setDirectoryPreferredOpen = (preferredOpen: boolean) => updateDirectoryState({ ...directoryState, preferredOpen });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => setFocusLayout(resolveShellFocusLayout({
      shellWidth: shell.getBoundingClientRect().width,
      railWidth: cssLength(shell, "--rail-current"),
      directoryWidth: cssLength(shell, "--directory-width"),
      contextDockWidth: cssLength(shell, "--dock-stack-width"),
      toolRailWidth: cssLength(shell, "--panel-controls-width")
    }));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [locale, railCollapsed]);

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
    const closeProjectDirectory = () => setWorkspaceDirectorySuppressed(true);
    const restoreProjectDirectory = () => setWorkspaceDirectorySuppressed(false);
    window.addEventListener("story-studio-close-project-directory", closeProjectDirectory);
    window.addEventListener("story-studio-restore-project-directory", restoreProjectDirectory);
    return () => {
      window.removeEventListener("story-studio-close-project-directory", closeProjectDirectory);
      window.removeEventListener("story-studio-restore-project-directory", restoreProjectDirectory);
    };
  }, []);

  useEffect(() => {
    const nextProjectId = props.runtime.project?.id ?? null;
    if (directoryStateProjectId.current === nextProjectId) return;
    writeDirectoryWorkspaceState(directoryStateProjectId.current, directoryState);
    directoryStateProjectId.current = nextProjectId;
    setDirectoryState(readDirectoryWorkspaceState(nextProjectId, initialDirectoryOpen));
    setWorkspaceDirectorySuppressed(false);
  }, [props.runtime.project?.id]);

  useEffect(() => {
    const receiveKnowledgeContext = (event: Event) => {
      const detail = (event as CustomEvent<{ eventRefs?: StoryStudioEventReference[]; selectionId?: string | null; knowledgeView?: TianyiKnowledgeViewContext }>).detail;
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
    if (rightWorkSurface.mode !== "NONE") {
      dock.closePanel();
    }
  }, [focusLayout, rightWorkSurface.mode]);

  useEffect(() => {
    const shell = shellRef.current;
    const workspace = shell?.querySelector<HTMLElement>(".shell-workspace");
    if (!workspace) return;
    const overlayOpen = focusLayout === "narrow" && (directoryPresented || dock.state.activeToolId !== null || rightWorkSurface.mode === "TIANYI");
    workspace.toggleAttribute("inert", overlayOpen);
    if (overlayOpen) workspace.setAttribute("aria-hidden", "true");
    else workspace.removeAttribute("aria-hidden");
    return () => { workspace.removeAttribute("inert"); workspace.removeAttribute("aria-hidden"); };
  }, [directoryPresented, dock.state.activeToolId, focusLayout, rightWorkSurface.mode]);

  useEffect(() => {
    if (focusLayout !== "narrow") return;
    const overlaySelector = rightWorkSurface.mode === "TIANYI" ? ".tianyi-sidebar" : dock.state.activeToolId ? ".dock-panel-stack" : directoryPresented ? ".project-directory-panel" : null;
    if (!overlaySelector) return;
    const overlay = shellRef.current?.querySelector<HTMLElement>(overlaySelector);
    if (!overlay) return;
    const focusableSelector = "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";
    const focusables = () => Array.from(overlay.querySelectorAll<HTMLElement>(focusableSelector)).filter((item) => item.getClientRects().length > 0);
    window.requestAnimationFrame(() => focusables()[0]?.focus());
    const containFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        if (rightWorkSurface.mode !== "NONE") workspaceDockCoordinator.close();
        else if (dock.state.activeToolId) dock.closePanel();
        else {
          setDirectoryPreferredOpen(false);
          window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-panel-toggle="project-directory"]')?.focus());
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); overlay.focus(); return; }
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!overlay.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", containFocus);
    return () => window.removeEventListener("keydown", containFocus);
  }, [directoryPresented, dock.state.activeToolId, focusLayout, rightWorkSurface.mode]);

  const navigate = (destination: StoryStudioShellDestination) => {
    if (destination.id === "event-line") props.runtime.setActiveTianyiCandidateId(null);
    const query = shellLab ? window.location.search : "";
    window.history.pushState({}, "", `${destination.route}${query}`);
    setActiveId(destination.id);
    setSettingsOpen(false);
    setAccountOpen(false);
    dock.closePanel();
    workspaceDockCoordinator.close();
    setWorkspaceDirectorySuppressed(false);
  };
  const searchContext = props.runtime.project
    ? { projectId: props.runtime.project.id, workVersionId: props.runtime.workVersionId ?? "work-version.unversioned" }
    : { projectId: null, workVersionId: null };
  const requestSearch = (scope: GlobalSearchScope) => setSearchRequest((current) => ({ requestId: (current?.requestId ?? 0) + 1, scope }));
  const navigateSearchResult = (result: GlobalSearchResult) => {
    const params = new URLSearchParams(result.target.query ?? {});
    if (shellLab) params.set("shellLab", "1");
    const query = params.size ? `?${params.toString()}` : "";
    window.history.pushState({}, "", `${result.target.route}${query}`);
    setActiveId(resolveStoryStudioShellLocation(result.target.route));
    if (result.target.query && (result.target.query.directoryObject || result.target.query.directorySource)) setDirectoryPreferredOpen(true);
    setLocationRevision((value) => value + 1);
  };
  const navigateDirectory = (node: ProjectDirectoryNode) => {
    if (node.id === "directory.library.character") {
      const params = new URLSearchParams(window.location.search); params.set("directoryView", "characters"); params.delete("directoryObject");
      updateDirectoryState({ ...directoryState, path: ["characters"] });
      window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); return;
    }
    // Group/category presses only drill within the directory. At overlay widths,
    // navigating the workspace here would also close the directory before the
    // author can reach a nested entry.
    if (node.children) return;
    const destination = node.id.startsWith("directory.story") || node.id.startsWith("unit:") ? "event-line" : "library";
    const route = storyStudioWorkspaceRoute(destination);
    window.history.pushState({}, "", route);
    setActiveId(destination);
  };
  const selectCharacter = (objectId: string) => { updateDirectoryState({ ...directoryState, path: ["characters"], selectedObjectId: objectId }); const params = new URLSearchParams(window.location.search); params.set("directoryView", "characters"); params.set("directoryObject", objectId); params.set("directoryType", "character"); window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); };
  const closeCharacterInspector = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryObject"); params.delete("directoryType"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const openCharacterProfileEditor = () => { const params = new URLSearchParams(window.location.search); params.set("directoryEdit", "character"); window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`); setLocationRevision((value) => value + 1); };
  const closeCharacterProfileEditor = () => { const params = new URLSearchParams(window.location.search); params.delete("directoryEdit"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const closeCharacterDirectory = () => { updateDirectoryState({ ...directoryState, path: [] }); const params = new URLSearchParams(window.location.search); params.delete("directoryView"); params.delete("directoryObject"); params.delete("directoryType"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); };
  const openDirectoryReference = (reference: ProjectDirectoryStableReference) => {
    const destination = reference.objectType === "event" || reference.objectType === "story-unit" ? "event-line" : "library";
    const params = reference.objectType === "source-document"
      ? new URLSearchParams({ directorySource: reference.objectId, directoryProject: reference.projectId, directoryWorkVersion: reference.workVersionId ?? "work-version.unversioned", directoryVersion: reference.version })
      : new URLSearchParams({ directoryObject: reference.objectId, directoryProject: reference.projectId, directoryVersion: reference.version, directoryType: reference.objectType });
    window.history.pushState({}, "", `${storyStudioWorkspaceRoute(destination)}?${params.toString()}`);
    setActiveId(destination);
  };
  const openPendingReview = (target: StoryIntakeReviewTarget | null) => {
    const params = target
      ? new URLSearchParams({ tianyiLane: "review", directoryMode: "pending", pendingProject: target.projectId, pendingWorkVersion: target.workVersionId, tianyiSession: target.sessionId, tianyiRun: target.runId, tianyiEnvelope: target.envelopeId, tianyiCandidate: target.candidateId })
      : new URLSearchParams({ directoryReview: "pending", directoryMode: "pending" });
    if (!target && props.runtime.project) params.set("pendingProject", props.runtime.project.id);
    if (!target && props.runtime.workVersionId) params.set("pendingWorkVersion", props.runtime.workVersionId);
    if (target) {
      // Session Archive discovery is authoritative; this restores only the
      // existing central Review's browser compatibility hint.
      window.sessionStorage.setItem(tianyiStoryIntakeRunStorageKey(target.projectId, target.workVersionId, target.sessionId), target.runId);
      props.runtime.setTianyiConversationId(target.sessionId);
      props.runtime.setActiveTianyiCandidateId(null);
    }
    window.history.pushState({}, "", `/tianyi?${params.toString()}`);
    window.dispatchEvent(new Event("tianyan-location-change"));
    setActiveId("tianyi");
    setSettingsOpen(false);
    setAccountOpen(false);
    dock.closePanel();
    setLocationRevision((value) => value + 1);
  };
  const closePendingReview = () => {
    window.history.pushState({}, "", "/tianyi?directoryMode=pending");
    setActiveId("tianyi");
    setLocationRevision((value) => value + 1);
  };
  const openPendingRelationReview = () => {
    const params = new URLSearchParams({ eventTask: "story", eventAdvanced: "graph", eventPending: "relations", directoryMode: "pending" });
    window.history.pushState({}, "", `/event-line?${params.toString()}`);
    window.dispatchEvent(new Event("tianyan-location-change"));
    props.runtime.setActiveTianyiCandidateId(null);
    setActiveId("event-line");
    setSettingsOpen(false);
    setAccountOpen(false);
    setWorkspaceDirectorySuppressed(true);
    dock.closePanel();
    setLocationRevision((value) => value + 1);
  };

  const toggleTheme = () => setTheme((current) => current === "cloud-ink" ? "night-paper" : "cloud-ink");
  const toggleRail = () => setRailPreference(nextShellRailPreference(railCollapsed));
  const openSettings = () => {
    if (!isSettingsRoute()) window.history.pushState({}, "", "/settings");
    setSettingsOpen(true);
    setAccountOpen(false);
    workspaceDockCoordinator.close();
  };
  const openAccount = () => {
    setAccountOpen(true);
    setSettingsOpen(false);
    workspaceDockCoordinator.close();
  };
  const openTianyi = (reference?: StoryStudioEventReference | StoryStudioEventReference[], initialDraft?: string, predictionSourceLabels?: string[], predictionSourceUnitSummary?: string, knowledgeView?: TianyiKnowledgeViewContext) => {
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
    dock.closePanel();
    workspaceDockCoordinator.openQuickTianyi();
  };

  const toggleTianyi = () => {
    if (activeId === "tianyi") return;
    dock.closePanel();
    if (tianyiOpen) workspaceDockCoordinator.closeQuickTianyi();
    else workspaceDockCoordinator.openQuickTianyi();
  };
  const toggleDirectory = () => {
    if (!directoryPresented) {
      setDirectoryPreferredOpen(true);
      setWorkspaceDirectorySuppressed(false);
      if (focusLayout !== "wide") {
        dock.closePanel();
        workspaceDockCoordinator.close();
      }
      return;
    }
    setDirectoryPreferredOpen(false);
    if (directoryPresented && focusLayout !== "wide") {
      dock.closePanel();
      workspaceDockCoordinator.close();
    }
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-panel-toggle="project-directory"]')?.focus());
  };
  const togglePageTool = (toolId: Parameters<typeof dock.togglePanel>[0]) => {
    if (dock.state.activeToolId !== toolId) {
      workspaceDockCoordinator.close();
    }
    dock.togglePanel(toolId);
  };
  const togglePanel = (panel: "project-directory" | "tianyi-agent") => panel === "project-directory" ? toggleDirectory() : toggleTianyi();

  return <div
    ref={shellRef}
    className="tianyan-r0-shell"
    data-testid="tianyan-r0-shell"
    data-theme={theme}
    data-locale={locale}
    data-rail-collapsed={railCollapsed}
    data-directory-visible={directoryPresented}
    data-directory-preferred-open={directoryPreferredOpen}
    data-dock-panel-count={dock.state.openPanelIds.length}
    data-active-dock-tool={dock.state.activeToolId ?? "none"}
    data-tianyi-open={tianyiOpen}
    data-right-work-surface={rightWorkSurface.mode}
    data-shell-focus-layout={focusLayout}
    data-settings-open={settingsOpen}
    data-account-open={accountOpen}
    data-work-version-id={props.runtime.workVersionId ?? ""}
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
      directoryOpen={directoryPreferredOpen}
      tianyiOpen={tianyiOpen}
      tianyiActionAvailable={activeId !== "tianyi"}
      searchContext={searchContext}
      searchRequest={searchRequest}
      onSearchNavigate={navigateSearchResult}
      onOpenProject={props.runtime.openProject}
      onToggleTheme={toggleTheme}
      onToggleDirectory={toggleDirectory}
      onToggleTianyi={toggleTianyi}
      onOpenPendingReview={() => openPendingReview(null)}
    />
    {!settingsOpen && !accountOpen && directoryPresented && directoryStateReady && (characterDirectoryOpen ? <CharacterDirectoryPanel key={props.runtime.project?.id ?? "no-project"} runtime={props.runtime} selectedId={resolvedDirectorySelection} directoryState={directoryState} onDirectoryState={updateDirectoryState} onBack={closeCharacterDirectory} onSelect={selectCharacter} onRequestScopedSearch={() => requestSearch("characters")} /> : <ProjectDirectoryPanel key={props.runtime.project?.id ?? "no-project"} runtime={props.runtime} project={props.runtime.project} mode={locationParams.get("directoryMode") === "pending" ? "pending" : "classified"} directoryState={directoryState} onDirectoryState={updateDirectoryState} onClose={toggleDirectory} onModeChange={(mode: ProjectDirectoryMode) => { const params = new URLSearchParams(window.location.search); if (mode === "pending") params.set("directoryMode", "pending"); else params.delete("directoryMode"); window.history.pushState({}, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`); setLocationRevision((value) => value + 1); }} onOpenPendingReview={openPendingReview} onOpenRelationReview={openPendingRelationReview} onNavigate={navigateDirectory} onOpenReference={openDirectoryReference} selectedObjectId={directorySelection ?? directorySourceSelection} onCreateProject={props.runtime.createProject} />)}
    {pendingReviewOpen ? <PendingReviewWorkspace runtime={props.runtime} onOpenSource={openDirectoryReference} onOpenStoryIntakeReview={openPendingReview} onClose={closePendingReview} /> : <ShellWorkspaceOutlet destination={activeDestination} shellLab={shellLab} settingsOpen={settingsOpen} accountOpen={accountOpen} runtime={props.runtime} onOpenTianyi={openTianyi} onOpenPendingReview={() => openPendingReview(null)} directoryObjectId={locationParams.get("directoryType") === "character" ? null : directorySelection} />}
    {!settingsOpen && !accountOpen && <RightDock compact={focusLayout !== "wide"} modal={focusLayout === "narrow"} layout={dock.state} onToggle={togglePageTool} onResize={dock.resizePanel} />}
    {!settingsOpen && !accountOpen && characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && <CharacterInspectorLoader key={`${directorySelection}:${locationRevision}`} runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterInspector} onOpenFull={openCharacterProfileEditor} />}
    {!settingsOpen && !accountOpen && characterDirectoryOpen && directorySelection && locationParams.get("directoryType") === "character" && locationParams.get("directoryEdit") === "character" && <CharacterProfileEditor runtime={props.runtime} objectId={directorySelection} onClose={closeCharacterProfileEditor} />}
    {!settingsOpen && !accountOpen && activeId !== "tianyi" && tianyiOpen && <TianyiSidebar overlay={focusLayout !== "wide"} modal={focusLayout === "narrow"} workspace={capabilityWorkspace} pageLabel={t(activeDestination.labelKey as Parameters<typeof t>[0])} runtime={props.runtime} agentAvailable={activeId === "event-line"} contextRequest={tianyiContextRequest} onClose={() => workspaceDockCoordinator.closeQuickTianyi()} onOpenSettings={openSettings} />}
    <ShellCommandPalette
      open={commandOpen}
      railCollapsed={railCollapsed}
      panelVisibility={{
        "project-directory": directoryPreferredOpen,
        "tianyi-agent": tianyiOpen
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
