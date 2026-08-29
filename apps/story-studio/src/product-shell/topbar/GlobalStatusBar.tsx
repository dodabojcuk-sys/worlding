import { Check, ChevronDown, CloudOff, FolderTree, Languages, MoonStar, Sparkles, SunMedium } from "lucide-react";

import { useI18n } from "../i18n/I18nProvider";
import { SHELL_THEME_REGISTRY, type ShellTheme } from "../theme/theme";

export function GlobalStatusBar(props: {
  theme: ShellTheme;
  projectName?: string;
  workVersionLabel: string | null;
  directoryOpen: boolean;
  tianyiOpen: boolean;
  onToggleTheme(): void;
  onToggleDirectory(): void;
  onToggleTianyi(): void;
}) {
  const { t, toggleLocale } = useI18n();
  const themeLabel = t(SHELL_THEME_REGISTRY[props.theme].labelKey);

  return <header className="shell-topbar" aria-label={t("topbar.status")}>
    <div className="shell-topbar-context">
      <button type="button" className="shell-context-control" title={t("topbar.project")}>
        <span><strong>{props.projectName ?? t("topbar.projectName")}</strong>{props.workVersionLabel && <i>{props.workVersionLabel}</i>}</span>
        <ChevronDown aria-hidden="true" />
      </button>
    </div>
    <div className="shell-topbar-actions">
      <button type="button" className="shell-topbar-text-control" aria-label={t("topbar.language")} title={t("topbar.language")} onClick={toggleLocale}><Languages aria-hidden="true" /><span>{t("topbar.languageValue")}</span></button>
      <button type="button" className="shell-topbar-text-control" aria-label={t("topbar.theme")} title={t("topbar.theme")} onClick={props.onToggleTheme}>
        {props.theme === "cloud-ink" ? <SunMedium aria-hidden="true" /> : <MoonStar aria-hidden="true" />}<span>{themeLabel}</span>
      </button>
      <span className="shell-topbar-divider" aria-hidden="true" />
      <div className="shell-runtime-status" aria-label={t("topbar.localStatus")} title={t("topbar.localStatus")}><Check aria-hidden="true" /><span>{t("topbar.localOnly")}</span></div>
      <div className="shell-runtime-status is-offline" aria-label={t("topbar.syncStatus")} title={t("topbar.syncStatus")}><CloudOff aria-hidden="true" /><span>{t("common.notConnected")}</span></div>
      <span className="shell-topbar-divider" aria-hidden="true" />
      <button type="button" className="shell-topbar-panel-toggle" aria-pressed={props.directoryOpen} aria-label={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} title={t(props.directoryOpen ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} onClick={props.onToggleDirectory}><FolderTree aria-hidden="true" /><span>{t("panel.projectDirectory")}</span></button>
      <button type="button" className="shell-topbar-panel-toggle" aria-pressed={props.tianyiOpen} aria-label={t(props.tianyiOpen ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} title={t(props.tianyiOpen ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} onClick={props.onToggleTianyi}><Sparkles aria-hidden="true" /><span>{t("space.tianyi")}</span></button>
    </div>
  </header>;
}
