import { useEffect, useReducer, useState } from "react";

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
import { ProjectDirectorySlot, RightPanelDock, ShellPanelControls } from "./panels/ShellPanelSlots";
import { ShellCommandPalette } from "./commands/ShellCommandPalette";
import { ShellWorkspaceOutlet } from "./workspace/ShellWorkspaceOutlet";
import { createInitialShellLayout, reduceShellLayout } from "./layoutProtocol";
import { resolveInitialShellTheme, type ShellTheme } from "./theme/theme";
import { useI18n } from "./i18n/I18nProvider";

export function TianyanR0Shell() {
  const { locale, t, toggleLocale } = useI18n();
  const shellLab = new URLSearchParams(window.location.search).get("shellLab") === "1";
  const [activeId, setActiveId] = useState(() => resolveStoryStudioShellLocation(window.location.pathname));
  const [railPreference, setRailPreference] = useState<ShellRailPreference>(() => {
    const requested = new URLSearchParams(window.location.search).get("rail");
    return requested === "collapsed" || requested === "expanded" ? requested : "auto";
  });
  const [autoCollapseRail, setAutoCollapseRail] = useState(() => window.matchMedia(SHELL_RAIL_AUTO_COLLAPSE_QUERY).matches);
  const [theme, setTheme] = useState<ShellTheme>(resolveInitialShellTheme);
  const [commandOpen, setCommandOpen] = useState(false);
  const [canShowParallelPanels, setCanShowParallelPanels] = useState(() => window.matchMedia("(min-width: 100rem)").matches);
  const [lastRightPanel, setLastRightPanel] = useState<"global-tianyi" | "page-inspector">("page-inspector");
  const [layout, dispatchLayout] = useReducer(reduceShellLayout, shellLab && window.matchMedia("(min-width: 100rem)").matches, createInitialShellLayout);
  const activeDestination = storyStudioShellDestinationById(activeId);
  const rightPanelCount = Number(layout["global-tianyi"].visible) + Number(layout["page-inspector"].visible);
  const railCollapsed = resolveShellRailCollapsed(railPreference, autoCollapseRail);

  useEffect(() => {
    const handlePopState = () => setActiveId(resolveStoryStudioShellLocation(window.location.pathname));
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
    const media = window.matchMedia("(min-width: 100rem)");
    const updateParallelCapability = () => {
      setCanShowParallelPanels(media.matches);
      if (!media.matches && layout["global-tianyi"].visible && layout["page-inspector"].visible) {
        dispatchLayout({ type: "hide", panel: lastRightPanel === "global-tianyi" ? "page-inspector" : "global-tianyi" });
      }
    };
    updateParallelCapability();
    media.addEventListener("change", updateParallelCapability);
    return () => media.removeEventListener("change", updateParallelCapability);
  }, [lastRightPanel, layout]);

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

  const toggleTheme = () => setTheme((current) => current === "cloud-ink" ? "night-paper" : "cloud-ink");
  const toggleRail = () => setRailPreference(nextShellRailPreference(railCollapsed));

  const togglePanel = (panel: "project-directory" | "global-tianyi" | "page-inspector") => {
    if (panel === "project-directory" || canShowParallelPanels) {
      dispatchLayout({ type: "toggle", panel });
      return;
    }
    const other = panel === "global-tianyi" ? "page-inspector" : "global-tianyi";
    setLastRightPanel(panel);
    if (layout[panel].visible) {
      dispatchLayout({ type: "hide", panel });
      return;
    }
    dispatchLayout({ type: "hide", panel: other });
    dispatchLayout({ type: "show", panel });
  };

  return <div
    className="tianyan-r0-shell"
    data-testid="tianyan-r0-shell"
    data-theme={theme}
    data-locale={locale}
    data-rail-collapsed={railCollapsed}
    data-directory-visible={layout["project-directory"].visible}
    data-right-panel-count={rightPanelCount}
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
    <GlobalStatusBar theme={theme} onToggleTheme={toggleTheme} />
    {layout["project-directory"].visible && <ProjectDirectorySlot onClose={() => dispatchLayout({ type: "hide", panel: "project-directory" })} />}
    <ShellWorkspaceOutlet destination={activeDestination} shellLab={shellLab} />
    <RightPanelDock
      layout={layout}
      onCloseGlobalTianyi={() => dispatchLayout({ type: "hide", panel: "global-tianyi" })}
      onClosePageInspector={() => dispatchLayout({ type: "hide", panel: "page-inspector" })}
    />
    <ShellPanelControls
      layout={layout}
      onToggleProjectDirectory={() => togglePanel("project-directory")}
      onToggleGlobalTianyi={() => togglePanel("global-tianyi")}
      onTogglePageInspector={() => togglePanel("page-inspector")}
    />
    <ShellCommandPalette
      open={commandOpen}
      railCollapsed={railCollapsed}
      panelVisibility={{
        "project-directory": layout["project-directory"].visible,
        "global-tianyi": layout["global-tianyi"].visible,
        "page-inspector": layout["page-inspector"].visible
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
