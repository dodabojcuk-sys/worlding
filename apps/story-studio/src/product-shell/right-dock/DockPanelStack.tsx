import { EngineeringLogPanel } from "../../components/page-tools/EngineeringLogPanel";
import { ExpertAnalysisPanel } from "../../components/page-tools/ExpertAnalysisPanel";
import { pageToolById } from "../../components/page-tools/pageToolRegistry";
import { DockPanelFrame } from "./DockPanelFrame";
import type { DockToolId } from "./types";
import { useI18n } from "../i18n/I18nProvider";

export function DockPanelStack(props: {
  overlay: boolean;
  modal: boolean;
  openPanelIds: readonly DockToolId[];
  panelSizes: Partial<Record<DockToolId, number>>;
  onClose(toolId: DockToolId): void;
  onResize(toolId: DockToolId, size: number): void;
}) {
  const { t } = useI18n();
  const toolId = props.openPanelIds.at(-1);
  if (!toolId) return null;
  const tool = pageToolById(toolId);
  return <aside className="dock-panel-stack" aria-label={t("dock.openPanels")} role={props.overlay ? "dialog" : undefined} aria-modal={props.modal || undefined} data-panel-count="1" data-active-tool-id={toolId}>
      <div className="dock-panel-stack-item" key={toolId}>
        <DockPanelFrame id={tool.id} title={t(tool.labelKey)} description={t(tool.descriptionKey)} onClose={() => props.onClose(toolId)}>
          {toolId === "engineering-log" ? <EngineeringLogPanel />
            : toolId === "expert-analysis" ? <ExpertAnalysisPanel />
              : <section className="page-tool-not-connected"><strong>{t(tool.labelKey)}</strong><p>{t(tool.descriptionKey)}. {t("dock.notConnectedSuffix")}</p></section>}
        </DockPanelFrame>
      </div>
  </aside>;
}
