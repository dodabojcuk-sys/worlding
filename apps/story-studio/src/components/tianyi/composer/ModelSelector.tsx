import { ChevronDown, Cpu } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import { ComposerPopover } from "./ComposerPopover";

export type TianyiModelOption = { id: string; label: string };

export function ModelSelector(props: { value: string; options: readonly TianyiModelOption[]; onIntent(value: string): void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = props.options.find((option) => option.id === props.value);
  const label = selected?.label ?? (props.options.length ? t("model.auto") : `${t("model.auto")} · ${t("common.notConnected")}`);
  const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <div className="composer-runtime-control model-selector">
    <button ref={triggerRef} type="button" aria-expanded={open} aria-label={t("model.title")} title={t("model.title")} onClick={() => setOpen((value) => !value)}><Cpu aria-hidden="true" /><span>{label}</span><ChevronDown aria-hidden="true" /></button>
    {open && <ComposerPopover anchorRef={triggerRef} ariaLabel={t("model.title")} className="composer-runtime-popover model-popover" onClose={close}>
      <strong>{t("model.title")}</strong>
      {props.options.length
        ? <><button type="button" onClick={() => { props.onIntent("auto"); close(); }}>{t("model.auto")}</button>{props.options.map((option) => <button type="button" key={option.id} onClick={() => { props.onIntent(option.id); close(); }}>{option.label}</button>)}</>
        : <p>{t("model.noProvider")}</p>}
    </ComposerPopover>}
  </div>;
}
