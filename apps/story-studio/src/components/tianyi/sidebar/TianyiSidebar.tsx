import { Sparkles, X } from "lucide-react";
import { useState } from "react";

import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { TianyiSidebarComposer } from "../composer/TianyiSidebarComposer";
import type { CapabilityMenuItem } from "../capability-launcher/capabilityMenuTypes";
import { TianyiModeSwitch, type TianyiSidebarMode } from "./TianyiModeSwitch";

export function TianyiSidebar(props: {
  workspace: TianyiContextualSpaceId;
  pageLabel: string;
  sharedSessionIdentity: string;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<TianyiSidebarMode>("dialogue");
  const [task, setTask] = useState<CapabilityMenuItem | null>(null);
  const selectTask = (item: CapabilityMenuItem | null) => {
    setTask(item);
    if (item?.requiredMode === "agent") setMode("agent");
  };
  return <aside className="tianyi-sidebar" aria-label={t("panel.globalTianyi")} data-tianyi-mode={mode} data-shared-session-id={props.sharedSessionIdentity}>
    <header className="tianyi-sidebar-header">
      <div className="tianyi-sidebar-heading"><Sparkles aria-hidden="true" /><strong>{t("space.tianyi")}</strong></div>
      <TianyiModeSwitch mode={mode} onMode={setMode} />
      <button type="button" aria-label={t("panel.closeGlobalTianyi")} title={t("panel.closeGlobalTianyi")} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <section className="tianyi-sidebar-stage">
      {mode === "dialogue"
        ? <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>{t("tianyi.sharedConversation")}</strong><p>{t("tianyi.noTransport")}</p><small>{t("tianyi.sessionIdentity")}: {props.sharedSessionIdentity}</small></div>
        : <div className="tianyi-agent-stage"><span>{t("tianyi.currentPage")}: {props.pageLabel}</span><strong>{task ? t(task.labelKey as TranslationKey) : t("tianyi.chooseCapability")}</strong><p>{task ? t("tianyi.taskPrepared") : t("tianyi.agentEmpty")}</p><small>{t("tianyi.sessionUnchanged")}</small></div>}
    </section>
    <TianyiSidebarComposer
      workspace={props.workspace}
      task={task}
      onTask={selectTask}
      context={{ page: props.pageLabel, selection: t("context.noneSelected"), referencedSources: 0, memoryState: "not-connected", excludedScope: t("context.otherBranches"), usage: null, budget: null }}
    />
  </aside>;
}
