import { useI18n } from "../../../product-shell/i18n/I18nProvider";

export type TianyiSidebarMode = "work" | "agent";

export function TianyiModeSwitch(props: { mode: TianyiSidebarMode; agentAvailable: boolean; agentRunning?: boolean; onMode(mode: TianyiSidebarMode): void }) {
  const { t } = useI18n();
  return <div className="tianyi-mode-switch" role="tablist" aria-label={t("tianyi.sidebarMode")}>
    <button type="button" role="tab" aria-selected={props.mode === "work"} onClick={() => props.onMode("work")}>{t("tianyi.work")}</button>
    {props.agentAvailable ? <button type="button" role="tab" aria-selected={props.mode === "agent"} aria-label={props.agentRunning ? `${t("tianyi.agent")}，运行中` : t("tianyi.agent")} onClick={() => props.onMode("agent")}>{t("tianyi.agent")}{props.agentRunning ? <span className="tianyi-mode-running" aria-hidden="true">运行中</span> : null}</button> : null}
  </div>;
}
