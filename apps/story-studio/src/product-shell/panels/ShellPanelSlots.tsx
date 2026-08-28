import { FolderTree, PanelRight, Sparkles, X } from "lucide-react";

import type { TianyanR0ShellLayoutState } from "../../../../../src/storyContracts/tianyanR0ShellContract.ts";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectDirectorySlot(props: { onClose(): void }) {
  const { t } = useI18n();
  return <aside className="shell-project-directory" aria-label={t("panel.projectDirectoryDescription")}>
    <header className="shell-slot-header">
      <div><FolderTree aria-hidden="true" /><span>{t("panel.projectDirectory")}</span></div>
      <button type="button" className="shell-icon-button" aria-label={t("panel.closeProjectDirectory")} title={t("panel.closeProjectDirectory")} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <div className="shell-slot-empty"><span>{t("panel.slotBoundary")}</span></div>
  </aside>;
}

export function ShellPanelControls(props: {
  layout: TianyanR0ShellLayoutState;
  onToggleGlobalTianyi(): void;
  onTogglePageInspector(): void;
  onToggleProjectDirectory(): void;
}) {
  const { t } = useI18n();
  const directoryVisible = props.layout["project-directory"].visible;
  const tianyiVisible = props.layout["global-tianyi"].visible;
  const inspectorVisible = props.layout["page-inspector"].visible;
  return <aside className="shell-panel-controls" aria-label={t("panel.controls")}>
    <button type="button" aria-pressed={directoryVisible} aria-label={t(directoryVisible ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} title={t(directoryVisible ? "panel.closeProjectDirectory" : "panel.openProjectDirectory")} onClick={props.onToggleProjectDirectory}><FolderTree aria-hidden="true" /><span>{t("panel.projectDirectory")}</span></button>
    <button type="button" aria-pressed={tianyiVisible} aria-label={t(tianyiVisible ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} title={t(tianyiVisible ? "panel.closeGlobalTianyi" : "panel.openGlobalTianyi")} onClick={props.onToggleGlobalTianyi}><Sparkles aria-hidden="true" /><span>{t("panel.globalTianyi")}</span></button>
    <button type="button" aria-pressed={inspectorVisible} aria-label={t(inspectorVisible ? "panel.closePageInspector" : "panel.openPageInspector")} title={t(inspectorVisible ? "panel.closePageInspector" : "panel.openPageInspector")} onClick={props.onTogglePageInspector}><PanelRight aria-hidden="true" /><span>{t("panel.pageInspector")}</span></button>
  </aside>;
}

export function RightPanelDock(props: {
  layout: TianyanR0ShellLayoutState;
  onCloseGlobalTianyi(): void;
  onClosePageInspector(): void;
}) {
  const { t } = useI18n();
  const slots = [
    props.layout["global-tianyi"].visible ? {
      id: "global-tianyi",
      icon: Sparkles,
      title: t("panel.globalTianyi"),
      description: t("panel.globalTianyiDescription"),
      closeLabel: t("panel.closeGlobalTianyi"),
      onClose: props.onCloseGlobalTianyi
    } : null,
    props.layout["page-inspector"].visible ? {
      id: "page-inspector",
      icon: PanelRight,
      title: t("panel.pageInspector"),
      description: t("panel.pageInspectorDescription"),
      closeLabel: t("panel.closePageInspector"),
      onClose: props.onClosePageInspector
    } : null
  ].filter((slot): slot is NonNullable<typeof slot> => Boolean(slot));

  if (slots.length === 0) return null;
  return <aside className="shell-right-panel-dock" aria-label={t("panel.controls")} data-panel-count={slots.length}>
    {slots.map((slot) => {
      const Icon = slot.icon;
      return <section className="shell-right-slot" aria-label={slot.description} key={slot.id}>
        <header className="shell-slot-header">
          <div><Icon aria-hidden="true" /><span>{slot.title}</span></div>
          <button type="button" className="shell-icon-button" aria-label={slot.closeLabel} title={slot.closeLabel} onClick={slot.onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="shell-slot-empty"><span>{t("panel.slotBoundary")}</span></div>
      </section>;
    })}
  </aside>;
}
