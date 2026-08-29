import { ChevronDown, Cpu } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import { ComposerPopover } from "./ComposerPopover";

export type TianyiModelOption = { id: string; label: string };

export function ModelSelector(props: { label: string | null; readOnly?: boolean; value?: string; options?: readonly TianyiModelOption[]; onIntent?: (value: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const options = props.options ?? [];
  const selected = options.find((option) => option.id === props.value);
  const label = props.label ?? selected?.label ?? (options.length ? t("model.auto") : `${t("model.auto")} · ${t("common.notConnected")}`);
  const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <div className="composer-runtime-control model-selector">
    <button ref={triggerRef} type="button" aria-expanded={open} aria-label={t("model.title")} title={props.readOnly ? t("model.readOnly") : t("model.title")} disabled={props.readOnly} onClick={() => setOpen((value) => !value)}><Cpu aria-hidden="true" /><span>{label}</span><ChevronDown aria-hidden="true" /></button>
    {!props.readOnly && open && <ComposerPopover anchorRef={triggerRef} ariaLabel={t("model.title")} className="composer-runtime-popover model-popover" onClose={close}>
      <strong>{t("model.title")}</strong>
      {options.length
        ? <><button type="button" onClick={() => { props.onIntent?.("auto"); close(); }}>{t("model.auto")}</button>{options.map((option) => <button type="button" key={option.id} onClick={() => { props.onIntent?.(option.id); close(); }}>{option.label}</button>)}</>
        : <p>{t("model.noProvider")}</p>}
    </ComposerPopover>}
  </div>;
}
