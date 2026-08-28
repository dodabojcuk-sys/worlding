import { useI18n } from "../../../product-shell/i18n/I18nProvider";

export type TianyiSidebarMode = "dialogue" | "agent";

export function TianyiModeSwitch(props: { mode: TianyiSidebarMode; onMode(mode: TianyiSidebarMode): void }) {
  const { t } = useI18n();
  return <div className="tianyi-mode-switch" role="tablist" aria-label={t("tianyi.sidebarMode")}>
    <button type="button" role="tab" aria-selected={props.mode === "dialogue"} onClick={() => props.onMode("dialogue")}>{t("tianyi.dialogue")}</button>
    <button type="button" role="tab" aria-selected={props.mode === "agent"} onClick={() => props.onMode("agent")}>{t("tianyi.agent")}</button>
  </div>;
}
