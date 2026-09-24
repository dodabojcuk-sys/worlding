import { useEffect, useState, type RefObject } from "react";
import { cssLength } from "./shellFocusLayout";

/** Presentation-only reservation. Compute with the preferred directory width,
 * not its currently hidden width, so temporary suppression cannot oscillate. */
export function useNuwaWidthReservation(shellRef: RefObject<HTMLDivElement | null>, enabled: boolean, directoryPreferred: boolean, tianyiOpen: boolean) {
  const [shortage, setShortage] = useState(false);
  const [directoryPriority, setDirectoryPriority] = useState(false);
  useEffect(() => {
    if (!enabled) { setShortage(false); setDirectoryPriority(false); return; }
    const shell = shellRef.current;
    if (!shell) return;
    let observedBody: HTMLElement | null = null;
    const measure = () => {
      const body = shell.querySelector<HTMLElement>(".nuwa-n1-body");
      if (body && body !== observedBody) { if (observedBody) resize.unobserve(observedBody); resize.observe(body); observedBody = body; }
      const required = Number(body?.dataset.preferredWidth || 480);
      const directoryWidth = cssLength(shell, "--directory-width") || 240;
      const tianyiWidth = tianyiOpen ? cssLength(shell, "--tianyi-sidebar-width") || 348 : 0;
      const available = shell.getBoundingClientRect().width - cssLength(shell, "--rail-current") - cssLength(shell, "--panel-controls-width") - (directoryPreferred ? directoryWidth : 0) - tianyiWidth - 48;
      setShortage(available < required);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(shell);
    const mutation = new MutationObserver(measure);
    mutation.observe(shell, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-preferred-width", "data-directory-visible"] });
    measure();
    return () => { resize.disconnect(); mutation.disconnect(); };
  }, [enabled, directoryPreferred, tianyiOpen, shellRef]);
  return { suppressDirectory: enabled && shortage && !directoryPriority, prioritizeDirectory: () => setDirectoryPriority(true), tianyiOverlay: enabled && directoryPreferred && directoryPriority && shortage && tianyiOpen };
}
