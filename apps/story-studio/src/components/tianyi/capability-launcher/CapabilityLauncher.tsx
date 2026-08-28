import { BookOpen, Boxes, FilePlus2, GitBranch, Plus, Quote, Search, Telescope, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { createCapabilityMenuRegistry } from "./capabilityMenuRegistry";
import type { CapabilityMenuItem } from "./capabilityMenuTypes";

const icons = { route: GitBranch, telescope: Telescope, library: BookOpen, create: FilePlus2, quote: Quote, skill: Boxes, workflow: Workflow };

export function CapabilityLauncher(props: {
  workspace: TianyiContextualSpaceId;
  onSelect(item: CapabilityMenuItem): void;
  onManageMore(): void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const registry = useMemo(() => createCapabilityMenuRegistry({ workspace: props.workspace }), [props.workspace]);
  const normalized = query.trim().toLocaleLowerCase();
  const visible = registry.filter((item) => normalized
    ? t(item.labelKey as TranslationKey).toLocaleLowerCase().includes(normalized) || item.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(normalized))
    : showAll || item.recommended).slice(0, normalized || showAll ? registry.length : 4);

  const close = () => {
    setOpen(false);
    setQuery("");
    setShowAll(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => searchRef.current?.focus());
    const outside = (event: PointerEvent) => !rootRef.current?.contains(event.target as Node) && close();
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const items = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-capability-item]") ?? [])];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = current < 0 ? 0 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
    event.preventDefault();
  };

  return <div className="capability-launcher" ref={rootRef} onKeyDown={keyDown}>
    <button ref={triggerRef} type="button" className="composer-icon-control" aria-label={t("capability.open")} title={t("capability.open")} aria-expanded={open} onClick={() => setOpen((current) => !current)}><Plus aria-hidden="true" /></button>
    {open && <section className="capability-menu" role="dialog" aria-label={t("capability.title")}>
      <label><Search aria-hidden="true" /><span className="shell-visually-hidden">{t("capability.search")}</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("capability.search")} /></label>
      <p>{normalized || showAll ? t("capability.all") : t("capability.recommended")}</p>
      <div role="menu">
        {visible.map((item) => {
          const Icon = icons[item.icon];
          return <button type="button" role="menuitem" data-capability-item={item.id} key={item.id} onClick={() => { props.onSelect(item); close(); }}>
            <Icon aria-hidden="true" /><span>{t(item.labelKey as TranslationKey)}</span>
            {item.availability !== "available" && <small>{t("capability.notConnected")}</small>}
          </button>;
        })}
      </div>
      {!normalized && !showAll && <button type="button" className="capability-browse-all" onClick={() => setShowAll(true)}>{t("capability.browseAll")}</button>}
      <button type="button" className="capability-manage" onClick={() => { props.onManageMore(); close(); }}>{t("capability.manageMore")}</button>
    </section>}
  </div>;
}
