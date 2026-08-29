import { Braces, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import { ComposerPopover } from "./ComposerPopover";

export type TianyiComposerContextViewModel = {
  page: string;
  selection: string;
  referencedSources: number;
  memoryState: "enabled" | "disabled" | "not-connected";
  excludedScope: string;
  usage: string | null;
  budget: string | null;
};

export function ContextControl(props: { context: TianyiComposerContextViewModel }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <div className="composer-runtime-control context-control">
    <button ref={triggerRef} type="button" aria-expanded={open} aria-label={t("context.title")} title={t("context.title")} onClick={() => setOpen((value) => !value)}><Braces aria-hidden="true" /><span>{t("context.label")}</span><ChevronDown aria-hidden="true" /></button>
    {open && <ComposerPopover anchorRef={triggerRef} ariaLabel={t("context.title")} className="composer-runtime-popover context-popover" onClose={close}>
      <strong>{t("context.title")}</strong>
      <dl>
        <div><dt>{t("context.currentPage")}</dt><dd>{props.context.page}</dd></div>
        <div><dt>{t("context.selection")}</dt><dd>{props.context.selection}</dd></div>
        <div><dt>{t("context.references")}</dt><dd>{props.context.referencedSources}</dd></div>
        <div><dt>{t("context.memory")}</dt><dd>{props.context.memoryState === "not-connected" ? t("common.notConnected") : props.context.memoryState === "enabled" ? t("common.enabled") : t("common.disabled")}</dd></div>
        <div><dt>{t("context.excluded")}</dt><dd>{props.context.excludedScope}</dd></div>
        <div><dt>{t("context.usage")}</dt><dd>{props.context.usage ?? t("common.pendingConnection")}</dd></div>
        <div><dt>{t("context.budget")}</dt><dd>{props.context.budget ?? t("common.pendingConnection")}</dd></div>
      </dl>
    </ComposerPopover>}
  </div>;
}
