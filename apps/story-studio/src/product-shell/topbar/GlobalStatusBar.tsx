import { Check, ChevronDown, FolderTree, Languages, MoonStar, Settings2, Sparkles, SunMedium } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../i18n/I18nProvider";
import type { ShellTheme } from "../theme/theme";

export function GlobalStatusBar(props: {
  theme: ShellTheme;
  directoryOpen: boolean;
  tianyiOpen: boolean;
  onToggleTheme(): void;
  onToggleDirectory(): void;
  onToggleTianyi(): void;
}) {
  const { t, toggleLocale } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);

  return <header className="shell-topbar" aria-label={t("topbar.status")}>
    <div className="shell-topbar-context">
      <button type="button" className="shell-context-control" title={t("topbar.project")}>
        <span><strong>{t("topbar.projectName")}</strong><i aria-hidden="true">·</i><em>{t("topbar.versionName")}</em></span>
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
    <div className="shell-topbar-actions">
      <div className="shell-runtime-status" title={t("topbar.status")}><Check aria-hidden="true" /><span>{t("topbar.localOnly")}</span></div>
      <button type="button" className="shell-topbar-panel-toggle" aria-pressed={props.directoryOpen} aria-label={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} title={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} onClick={props.onToggleDirectory}><FolderTree aria-hidden="true" /><span>{t("panel.projectDirectory")}</span></button>
      <button type="button" className="shell-topbar-panel-toggle" aria-pressed={props.tianyiOpen} aria-label={t(props.tianyiOpen ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} title={t(props.tianyiOpen ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} onClick={props.onToggleTianyi}><Sparkles aria-hidden="true" /><span>{t("space.tianyi")}</span></button>
      <div className="shell-tools-menu">
        <button type="button" className="shell-tools-trigger" aria-label={t("topbar.tools")} title={t("topbar.tools")} aria-expanded={toolsOpen} onClick={() => setToolsOpen((open) => !open)}>
          <Settings2 aria-hidden="true" />
        </button>
        {toolsOpen && <div className="shell-tools-popover" role="menu" aria-label={t("topbar.tools")}>
          <button type="button" role="menuitem" onClick={() => { toggleLocale(); setToolsOpen(false); }}><Languages aria-hidden="true" /><span>{t("topbar.languageValue")}</span></button>
          <button type="button" role="menuitem" onClick={() => { props.onToggleTheme(); setToolsOpen(false); }}>
            {props.theme === "cloud-ink" ? <MoonStar aria-hidden="true" /> : <SunMedium aria-hidden="true" />}<span>{t(props.theme === "cloud-ink" ? "topbar.themeNight" : "topbar.themeCloud")}</span>
          </button>
        </div>}
      </div>
    </div>
  </header>;
}
