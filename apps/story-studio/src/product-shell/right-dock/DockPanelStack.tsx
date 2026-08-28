import { EngineeringLogPanel } from "../../components/page-tools/EngineeringLogPanel";
import { ExpertAnalysisPanel } from "../../components/page-tools/ExpertAnalysisPanel";
import { pageToolById } from "../../components/page-tools/pageToolRegistry";
import { DockPanelFrame } from "./DockPanelFrame";
import { DockResizeHandle } from "./DockResizeHandle";
import type { DockToolId } from "./types";
import { useI18n } from "../i18n/I18nProvider";

export function DockPanelStack(props: {
  openPanelIds: readonly DockToolId[];
  panelSizes: Partial<Record<DockToolId, number>>;
  onClose(toolId: DockToolId): void;
  onResize(toolId: DockToolId, size: number): void;
}) {
  const { t } = useI18n();
  if (props.openPanelIds.length === 0) return null;
  return <aside className="dock-panel-stack" aria-label={t("dock.openPanels")} data-panel-count={props.openPanelIds.length}>
    {props.openPanelIds.map((toolId, index) => {
      const tool = pageToolById(toolId);
      const size = props.panelSizes[toolId] ?? 260;
      return <div className="dock-panel-stack-item" key={toolId} style={index < props.openPanelIds.length - 1 ? { blockSize: `${size}px` } : undefined}>
        <DockPanelFrame id={tool.id} title={t(tool.labelKey)} description={t(tool.descriptionKey)} onClose={() => props.onClose(toolId)}>
          {toolId === "engineering-log" ? <EngineeringLogPanel />
            : toolId === "expert-analysis" ? <ExpertAnalysisPanel />
              : <section className="page-tool-not-connected"><strong>{t(tool.labelKey)}</strong><p>{t(tool.descriptionKey)}。{t("dock.notConnectedSuffix")}</p></section>}
        </DockPanelFrame>
        {index < props.openPanelIds.length - 1 && <DockResizeHandle label={`${t("dock.resizeTool")} ${t(tool.labelKey)}`} size={size} onSize={(next) => props.onResize(toolId, next)} />}
      </div>;
    })}
  </aside>;
}
