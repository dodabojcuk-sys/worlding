import { Braces, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "../../../product-shell/i18n/I18nProvider";

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
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => !rootRef.current?.contains(event.target as Node) && setOpen(false);
    const closeEscape = (event: globalThis.KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  return <div className="composer-runtime-control context-control" ref={rootRef}>
    <button type="button" aria-expanded={open} aria-label={t("context.title")} title={t("context.title")} onClick={() => setOpen((value) => !value)}><Braces aria-hidden="true" /><span>{t("context.label")}</span><ChevronDown aria-hidden="true" /></button>
    {open && <section role="dialog" aria-label={t("context.title")}>
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
    </section>}
  </div>;
}
