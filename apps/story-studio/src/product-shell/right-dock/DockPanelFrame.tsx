import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";

export function DockPanelFrame(props: { id: string; title: string; description: string; onClose(): void; children: ReactNode }) {
  const { t } = useI18n();
  return <section className="dock-panel-frame" aria-label={props.description} data-dock-panel-id={props.id}>
    <header>
      <div><strong>{props.title}</strong><small>{props.description}</small></div>
      <button type="button" aria-label={`${t("common.close")} ${props.title}`} title={`${t("common.close")} ${props.title}`} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <div className="dock-panel-content">{props.children}</div>
  </section>;
}
