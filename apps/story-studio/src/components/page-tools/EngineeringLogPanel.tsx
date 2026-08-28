import type { EngineeringLogEntry } from "./pageToolTypes";
import { useI18n } from "../../product-shell/i18n/I18nProvider";

export function EngineeringLogPanel(props: { entries?: readonly EngineeringLogEntry[] }) {
  const { t } = useI18n();
  const entries = props.entries ?? [
    { id: "receipt-1024", time: "10:24", action: t("log.actionSwitchView"), object: t("log.objectEventLine"), status: "complete" },
    { id: "receipt-1018", time: "10:18", action: t("log.actionFocusDirectory"), object: t("log.objectStoryStructure"), status: "complete" },
    { id: "receipt-1012", time: "10:12", action: t("log.actionInspectStructure"), object: t("log.objectCurrentPage"), status: "hint" },
    { id: "receipt-1005", time: "10:05", action: t("log.actionAddReference"), object: t("log.objectSelected"), status: "complete" },
    { id: "receipt-0958", time: "09:58", action: t("log.actionRestorePosition"), object: t("log.objectLocalWorkspace"), status: "complete" }
  ] satisfies readonly EngineeringLogEntry[];
  const statusLabel = (status: EngineeringLogEntry["status"]) => status === "complete" ? t("log.statusComplete") : status === "hint" ? t("log.statusHint") : t("directory.pending");
  return <section className="engineering-log-panel" aria-label={t("log.label")} data-receipt-projection="local-demo">
    <div className="page-tool-filter-row">
      <button type="button">{t("log.allTypes")}</button>
      <span>{t("log.receiptProjection")}</span>
    </div>
    <ol className="engineering-log-stream">
      {entries.map((entry) => <li key={entry.id}>
        <time>{entry.time}</time>
        <div><strong>{entry.action}</strong><span>{entry.object}</span></div>
        <em data-status={entry.status}>{statusLabel(entry.status)}</em>
      </li>)}
    </ol>
  </section>;
}
