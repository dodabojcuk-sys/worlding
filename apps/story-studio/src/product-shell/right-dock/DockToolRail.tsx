import { PAGE_TOOL_REGISTRY } from "../../components/page-tools/pageToolRegistry";
import { useI18n } from "../i18n/I18nProvider";
import type { DockToolId } from "./types";

export function DockToolRail(props: { openPanelIds: readonly DockToolId[]; onToggle(toolId: DockToolId): void }) {
  const { t } = useI18n();
  return <aside className="dock-tool-rail" aria-label={t("dock.tools")}>
    {PAGE_TOOL_REGISTRY.map((tool) => {
      const Icon = tool.icon;
      const active = props.openPanelIds.includes(tool.id);
      return <button
        type="button"
        key={tool.id}
        aria-label={t(tool.labelKey)}
        title={`${t(tool.labelKey)} · ${t(tool.descriptionKey)}`}
        aria-pressed={active}
        data-tool-id={tool.id}
        data-availability={tool.availability}
        onClick={() => props.onToggle(tool.id)}
      >
        <Icon aria-hidden="true" />
        <span>{t(tool.labelKey)}</span>
        {tool.availability === "not-connected" && <small>{t("tool.notConnected")}</small>}
      </button>;
    })}
  </aside>;
}
