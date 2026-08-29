import { ChevronDown, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import type { CapabilityPermissionIntent } from "../capability-launcher/capabilityMenuTypes";
import { ComposerPopover } from "./ComposerPopover";

const options: readonly { id: CapabilityPermissionIntent; labelKey: TranslationKey; descriptionKey: TranslationKey; disabled?: boolean }[] = [
  { id: "read-only", labelKey: "permission.readOnly", descriptionKey: "permission.readOnlyDescription" },
  { id: "suggest", labelKey: "permission.suggest", descriptionKey: "permission.suggestDescription" },
  { id: "candidate", labelKey: "permission.candidate", descriptionKey: "permission.candidateDescription" },
  { id: "authorized-edit", labelKey: "permission.authorizedEdit", descriptionKey: "permission.authorizedEditDescription", disabled: true }
];

export function PermissionControl(props: { value: CapabilityPermissionIntent; onIntent(value: CapabilityPermissionIntent): void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((item) => item.id === props.value)!;
  const close = () => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); };
  return <div className="composer-runtime-control permission-control">
    <button ref={triggerRef} type="button" aria-expanded={open} aria-label={t("permission.title")} title={t("permission.title")} onClick={() => setOpen((value) => !value)}><ShieldCheck aria-hidden="true" /><span>{t(current.labelKey)}</span><ChevronDown aria-hidden="true" /></button>
    {open && <ComposerPopover anchorRef={triggerRef} ariaLabel={t("permission.title")} className="composer-runtime-popover permission-popover" onClose={close}>
      <strong>{t("permission.title")}</strong>
      {options.map((option) => <button type="button" key={option.id} disabled={option.disabled} aria-pressed={props.value === option.id} onClick={() => { props.onIntent(option.id); close(); }}>
        <span>{t(option.labelKey)}</span><small>{t(option.descriptionKey)}</small>
      </button>)}
    </ComposerPopover>}
  </div>;
}
