import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ProductWorkspaceMode } from "./navigation/topLevelDestinationRegistry";

/**
 * Shared Shell-owned frame for the second column.  Modules provide only their
 * contextual content; width, stage placement, and responsive behavior remain
 * owned by the App Shell.
 */
export function ModuleSidebarHost(props: {
  mode: ProductWorkspaceMode;
  children: ReactNode;
  mobileOpen?: boolean;
}) {
  const hostRef = useRef<HTMLElement | null>(null);
  const restoredTabIndexesRef = useRef(new Map<HTMLElement, string | null>());
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const sync = () => setMobileViewport(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  const mobileClosed = mobileViewport && !props.mobileOpen;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (mobileClosed) host.setAttribute("inert", "");
    else host.removeAttribute("inert");
  }, [mobileClosed]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const restoreTabIndexes = () => {
      for (const [element, tabIndex] of restoredTabIndexesRef.current) {
        if (tabIndex == null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", tabIndex);
      }
      restoredTabIndexesRef.current.clear();
    };

    if (!mobileClosed) {
      restoreTabIndexes();
      return;
    }

    const disableTabStops = () => {
      const candidates = host.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]");
      for (const element of candidates) {
        if (!restoredTabIndexesRef.current.has(element)) {
          restoredTabIndexesRef.current.set(element, element.getAttribute("tabindex"));
        }
        if (element.getAttribute("tabindex") !== "-1") element.setAttribute("tabindex", "-1");
      }
    };

    disableTabStops();
    const observer = new MutationObserver(disableTabStops);
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["tabindex"] });
    return () => {
      observer.disconnect();
      restoreTabIndexes();
    };
  }, [mobileClosed]);

  return <section
    ref={hostRef}
    className="module-sidebar-host"
    data-module-sidebar-host="true"
    data-workspace-sidebar-slot={props.mode}
    data-mobile-open={props.mobileOpen ? "true" : "false"}
    data-mobile-closed={mobileClosed ? "true" : "false"}
    aria-hidden={mobileClosed ? "true" : undefined}
    aria-label="模块上下文栏"
  >{props.children}</section>;
}
