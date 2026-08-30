import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { useWorkspaceDockSlot } from "../product-shell/WorkspaceDockCoordinator";

export type PageContextDockState<T extends string> = {
  open: boolean;
  activeLens: T;
};

export type PageContextDockLens<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
  badge?: number;
  external?: boolean;
  content: ReactNode;
};

/**
 * Page-owned auxiliary tools share one responsive/focus owner. Pages register
 * lenses and content; the dock itself has no knowledge of Nuwa or Tianyi.
 */
export function PageContextDock<T extends string>(props: {
  pageId: string;
  label: string;
  state: PageContextDockState<T>;
  lenses: PageContextDockLens<T>[];
  onState(state: PageContextDockState<T>): void;
  onSelect?(lens: PageContextDockLens<T>, open: boolean): void;
}) {
  const triggerRefs = useRef(new Map<T, HTMLButtonElement>());
  const sharedSlot = useWorkspaceDockSlot();
  const activeLens = props.lenses.find((lens) => lens.id === props.state.activeLens) ?? props.lenses[0];
  const showsInternalPanel = Boolean(props.state.open && activeLens && !activeLens.external);
  const commitState = (next: PageContextDockState<T>) => {
    props.onState(next);
  };

  useEffect(() => {
    if (sharedSlot.ownerId === props.pageId && sharedSlot.mode !== "NONE" && sharedSlot.mode !== "TIANYI") return;
    if (props.state.open) commitState({ ...props.state, open: false });
  }, [props.pageId, props.state, sharedSlot]);

  useEffect(() => {
    if (!showsInternalPanel) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      commitState({ ...props.state, open: false });
      window.requestAnimationFrame(() => triggerRefs.current.get(props.state.activeLens)?.focus());
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props.onState, props.state, showsInternalPanel]);

  const select = (lens: PageContextDockLens<T>) => {
    const open = lens.id !== props.state.activeLens || !props.state.open;
    commitState({ activeLens: lens.id, open });
    props.onSelect?.(lens, open);
  };
  const close = () => {
    commitState({ ...props.state, open: false });
    props.onSelect?.(activeLens, false);
    window.requestAnimationFrame(() => triggerRefs.current.get(props.state.activeLens)?.focus());
  };

  return <aside
    className="page-context-dock"
    data-page-dock={props.pageId}
    data-page-dock-open={props.state.open ? "true" : "false"}
    data-page-dock-lens={activeLens?.id ?? "none"}
    data-page-dock-external={activeLens?.external && props.state.open ? "true" : "false"}
    data-right-dock-slot="page-context"
    aria-label={props.label}
  >
    <nav className="page-context-dock-rail" aria-label={`${props.label}工具`}>
      {props.lenses.map((lens) => <button
        ref={(element) => { if (element) triggerRefs.current.set(lens.id, element); }}
        type="button"
        key={lens.id}
        className={props.state.open && props.state.activeLens === lens.id ? "is-active" : ""}
        aria-label={lens.label}
        title={lens.label}
        aria-pressed={props.state.open && props.state.activeLens === lens.id}
        aria-controls={lens.external ? undefined : `${props.pageId}-page-dock-panel`}
        onClick={() => select(lens)}
      >{lens.icon}{lens.badge ? <span className="page-context-dock-badge" aria-label={`${lens.badge} 项待处理`}>{lens.badge}</span> : null}<small>{lens.label}</small></button>)}
    </nav>
    {showsInternalPanel && activeLens ? <section
      id={`${props.pageId}-page-dock-panel`}
      className="page-context-dock-panel"
      role="dialog"
      aria-modal="false"
      aria-label={`${activeLens.label}工具`}
    >
      <header><div>{activeLens.icon}<strong>{activeLens.label}</strong></div><button type="button" aria-label={`关闭${activeLens.label}`} title={`关闭${activeLens.label}`} onClick={close}><X /></button></header>
      <div className="page-context-dock-body">{activeLens.content}</div>
    </section> : null}
  </aside>;
}
