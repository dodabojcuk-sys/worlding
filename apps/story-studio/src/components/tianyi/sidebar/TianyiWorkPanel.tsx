import { ArrowRight, Send, Sparkles } from "lucide-react";
import type { FormEvent, KeyboardEvent } from "react";

import type { TianyiSessionMetadata } from "../../../lib/localTransport";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";

export function TianyiWorkPanel(props: {
  projectReady: boolean;
  providerReady: boolean;
  agentAvailable: boolean;
  session: TianyiSessionMetadata | null;
  draft: string;
  busy: boolean;
  error: string;
  pageAgentRunRetained: boolean;
  onDraft(value: string): void;
  onSubmit(): void;
  onOpenSettings(): void;
  onSwitchToAgent(): void;
}) {
  const { t } = useI18n();
  const executionIntent = /(?:推演|预测|执行|运行|生成候选路径)/u.test(props.draft);
  const submit = (event: FormEvent) => { event.preventDefault(); props.onSubmit(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    props.onSubmit();
  };
  return <section className="tianyi-dialogue-panel" aria-label={t("tianyi.workLane.label")} data-work-lane="shared" data-page-agent-dispatch="forbidden">
    {props.pageAgentRunRetained ? <section className="tianyi-dialogue-background-task" role="status"><strong>{t("tianyi.workLane.runRetained")}</strong><p>{t("tianyi.workLane.runRetainedHint")}</p></section> : null}
    <section className="tianyi-sidebar-conversation" aria-label={t("tianyi.workLane.history")}>
      {!props.projectReady ? <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>{t("tianyi.workLane.start")}</strong><p>{t("tianyi.workLane.openProject")}</p></div>
        : props.session?.visibleMessages.length ? props.session.visibleMessages.map((message) => <article key={message.eventId} className={`tianyi-sidebar-message is-${message.actor}`}><small>{message.actor === "author" ? t("tianyi.author") : t("space.tianyi")}</small><p>{message.visibleContent}</p></article>)
          : <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>{t("tianyi.workLane.title")}</strong><p>{t("tianyi.workLane.shared")}</p><small>{t("tianyi.workLane.candidateBoundary")}</small></div>}
    </section>
    {props.error ? <p className="tianyi-error" role="alert">{props.error}</p> : null}
    {executionIntent && props.agentAvailable ? <section className="tianyi-dialogue-agent-handoff" role="note"><strong>{t("tianyi.workLane.needsAgent")}</strong><p>{t("tianyi.workLane.needsAgentHint")}</p><button type="button" onClick={props.onSwitchToAgent}>{t("tianyi.workLane.toAgent")}<ArrowRight aria-hidden="true" /></button></section> : null}
    <form className="tianyi-dialogue-composer" onSubmit={submit} data-agent-dispatch="forbidden">
      <label><span className="shell-visually-hidden">{t("tianyi.workLane.input")}</span><textarea rows={3} value={props.draft} disabled={props.busy || !props.projectReady || !props.providerReady} placeholder={t("tianyi.workLane.placeholder")} onKeyDown={keyDown} onChange={(event) => props.onDraft(event.target.value)} /></label>
      <button type="submit" aria-label={t("tianyi.workLane.send")} title={t("tianyi.workLane.send")} disabled={props.busy || !props.draft.trim() || !props.projectReady || !props.providerReady}><Send aria-hidden="true" /></button>
    </form>
    {!props.providerReady && props.projectReady ? <div className="tianyi-provider-unavailable" data-provider-state="unconfigured"><strong>{t("tianyi.workLane.providerTitle")}</strong><p>{t("tianyi.workLane.providerBody")}</p><button type="button" onClick={props.onOpenSettings}>{t("tianyi.workLane.providerSettings")}</button></div> : null}
  </section>;
}
