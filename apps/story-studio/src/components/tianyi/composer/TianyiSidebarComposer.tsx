import { Mic, Send, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { CapabilityLauncher } from "../capability-launcher/CapabilityLauncher";
import type { CapabilityMenuItem, CapabilityPermissionIntent } from "../capability-launcher/capabilityMenuTypes";
import { ContextControl, type TianyiComposerContextViewModel } from "./ContextControl";
import { ModelSelector } from "./ModelSelector";
import { PermissionControl } from "./PermissionControl";

export function TianyiSidebarComposer(props: {
  workspace: TianyiContextualSpaceId;
  task: CapabilityMenuItem | null;
  context: TianyiComposerContextViewModel;
  draft: string;
  modelLabel: string | null;
  permission: CapabilityPermissionIntent;
  disabled?: boolean;
  submit(): void;
  onPermission(intent: CapabilityPermissionIntent): void;
  onDraft(value: string): void;
  onTask(item: CapabilityMenuItem | null): void;
}) {
  const { t } = useI18n();
  const [notice, setNotice] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!props.draft.trim() && !props.task) return;
    setNotice("");
    props.submit();
  };
  return <form className="tianyi-sidebar-composer" onSubmit={submit} data-automatic-provider-calls="0">
    {props.task && <div className="tianyi-task-chip"><span>{t(props.task.labelKey as TranslationKey)}</span><small>{t("tianyi.taskPrepared")}</small><button type="button" aria-label={t("tianyi.removeTask")} title={t("tianyi.removeTask")} onClick={() => props.onTask(null)}><X aria-hidden="true" /></button></div>}
    <label><span className="shell-visually-hidden">{t("tianyi.composerLabel")}</span><textarea rows={3} value={props.draft} disabled={props.disabled} onChange={(event) => { props.onDraft(event.target.value); setNotice(""); }} placeholder={t("tianyi.composerPlaceholder")} /></label>
    {notice && <output>{notice}</output>}
    <footer>
      <CapabilityLauncher workspace={props.workspace} onSelect={props.onTask} onManageMore={() => setNotice(t("capability.manageNotice"))} />
      <PermissionControl value={props.permission} onIntent={props.onPermission} />
      <ContextControl context={props.context} onManage={() => setNotice(t("context.manageNotice"))} />
      <ModelSelector label={props.modelLabel} readOnly />
      <span className="composer-flex-spacer" />
      <button type="button" className="composer-icon-control" aria-label={t("tianyi.microphone")} title={t("tianyi.microphone")} disabled><Mic aria-hidden="true" /></button>
      <button type="submit" className="composer-send-control" aria-label={t("tianyi.send")} title={t("tianyi.send")} disabled={props.disabled || (!props.draft.trim() && !props.task)}><Send aria-hidden="true" /></button>
    </footer>
  </form>;
}
