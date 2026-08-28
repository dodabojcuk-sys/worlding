import { Inbox } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

export function PendingReviewEntry(props: { count: number; onOpen?(): void }) {
  const { t } = useI18n();
  return <button type="button" className="pending-review-entry" aria-label={`${t("directory.pendingLabel")} ${props.count}`} onClick={props.onOpen}>
    <Inbox aria-hidden="true" />
    <span>{t("directory.pending")}</span>
    <strong>{props.count}</strong>
  </button>;
}
