import { ChevronDown, Cpu } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "../../../product-shell/i18n/I18nProvider";

export type TianyiModelOption = { id: string; label: string };

export function ModelSelector(props: { value: string; options: readonly TianyiModelOption[]; onIntent(value: string): void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = props.options.find((option) => option.id === props.value);
  const label = selected?.label ?? (props.options.length ? t("model.auto") : `${t("model.auto")} · ${t("common.notConnected")}`);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => !rootRef.current?.contains(event.target as Node) && setOpen(false);
    const closeEscape = (event: globalThis.KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  return <div className="composer-runtime-control model-selector" ref={rootRef}>
    <button type="button" aria-expanded={open} aria-label={t("model.title")} title={t("model.title")} onClick={() => setOpen((value) => !value)}><Cpu aria-hidden="true" /><span>{label}</span><ChevronDown aria-hidden="true" /></button>
    {open && <section role="dialog" aria-label={t("model.title")}>
      <strong>{t("model.title")}</strong>
      {props.options.length
        ? <><button type="button" onClick={() => { props.onIntent("auto"); setOpen(false); }}>{t("model.auto")}</button>{props.options.map((option) => <button type="button" key={option.id} onClick={() => { props.onIntent(option.id); setOpen(false); }}>{option.label}</button>)}</>
        : <p>{t("model.noProvider")}</p>}
    </section>}
  </div>;
}
