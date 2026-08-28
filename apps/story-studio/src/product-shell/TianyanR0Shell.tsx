import { useEffect, useReducer, useState } from "react";

import {
  resolveStoryStudioShellLocation,
  storyStudioShellDestinationById,
  type StoryStudioShellDestination
} from "./navigation/topLevelDestinationRegistry";
import { ProductShellNavigation } from "./navigation/ProductShellNavigation";
import { GlobalStatusBar } from "./topbar/GlobalStatusBar";
import { ProjectDirectorySlot, RightPanelDock, ShellPanelControls } from "./panels/ShellPanelSlots";
import { ShellWorkspaceOutlet } from "./workspace/ShellWorkspaceOutlet";
import { createInitialShellLayout, reduceShellLayout } from "./layoutProtocol";
import { resolveInitialShellTheme, type ShellTheme } from "./theme/theme";
import { useI18n } from "./i18n/I18nProvider";

export function TianyanR0Shell() {
  const { locale, t } = useI18n();
  const shellLab = new URLSearchParams(window.location.search).get("shellLab") === "1";
  const [activeId, setActiveId] = useState(() => resolveStoryStudioShellLocation(window.location.pathname));
  const [railCollapsed, setRailCollapsed] = useState(() => new URLSearchParams(window.location.search).get("rail") === "collapsed");
  const [theme, setTheme] = useState<ShellTheme>(resolveInitialShellTheme);
  const [layout, dispatchLayout] = useReducer(reduceShellLayout, shellLab, createInitialShellLayout);
  const activeDestination = storyStudioShellDestinationById(activeId);
  const rightPanelCount = Number(layout["global-tianyi"].visible) + Number(layout["page-inspector"].visible);

  useEffect(() => {
    const handlePopState = () => setActiveId(resolveStoryStudioShellLocation(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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
      onToggleCollapsed={() => setRailCollapsed((current) => !current)}
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
      onToggleProjectDirectory={() => dispatchLayout({ type: "toggle", panel: "project-directory" })}
      onToggleGlobalTianyi={() => dispatchLayout({ type: "toggle", panel: "global-tianyi" })}
      onTogglePageInspector={() => dispatchLayout({ type: "toggle", panel: "page-inspector" })}
    />
  </div>;
}
