import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthorLibraryHierarchy, type AuthorContextCounts, type AuthorContextTarget } from "./AuthorLibraryHierarchy";

/**
 * A short-lived read-only access point for the existing author taxonomy.
 * It intentionally owns only disclosure and search presentation state; the
 * selected target is resolved by the current workspace and existing owners.
 */
export function AuthorContextSelector(props: {
  counts: AuthorContextCounts;
  onSelect(target: AuthorContextTarget): void;
  containedByMobileDrawer?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = "author-context-selector";
  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return <section className="author-context-selector" data-testid="author-context-selector">
    <button ref={triggerRef} type="button" className="secondary-action" aria-expanded={open} aria-controls={dialogId} onClick={() => setOpen((current) => !current)}><Plus />{props.label || "添加上下文"}</button>
    {open ? <section id={dialogId} className="author-context-selector-panel" role={props.containedByMobileDrawer ? undefined : "dialog"} aria-label="选择作者上下文">
      <header><div><small>按需引用</small><strong>资料、剧情与设定</strong></div><button type="button" className="icon-action" aria-label="关闭上下文选择" onClick={close}><X /></button></header>
      <AuthorLibraryHierarchy counts={props.counts} onSelect={(target) => { props.onSelect(target); close(); }} />
    </section> : null}
  </section>;
}
