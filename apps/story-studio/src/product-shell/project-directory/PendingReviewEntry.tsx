import { Inbox } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

export function PendingReviewEntry(props: { count: number; batchCount: number; onOpen?(): void }) {
  const { t } = useI18n();
  const replace = (key: "directory.pendingEntryAria" | "directory.pendingEntryBatches", values: Record<string, number>) => Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), t(key));
  const ariaLabel = props.batchCount ? `${t("directory.pendingLabel")} · ${replace("directory.pendingEntryAria", { count: props.count, batches: props.batchCount })}` : `${t("directory.pendingLabel")} ${props.count}`;
  return <button type="button" className="pending-review-entry" aria-label={ariaLabel} title={t("directory.pendingContinueLatest")} onClick={props.onOpen}>
    <Inbox aria-hidden="true" />
    <span><strong>{t("directory.pending")}</strong><small>{props.batchCount ? `${replace("directory.pendingEntryBatches", { count: props.batchCount })} · ${t("directory.pendingContinueLatest")}` : t("directory.pendingEntryNoBatches")}</small></span>
    <strong>{props.count}</strong>
  </button>;
}
