import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";

const VIEWPORT_GUTTER = 12;
const POPOVER_GAP = 8;

type ComposerPopoverProps = {
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  className: string;
  children: ReactNode;
  onClose(): void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * Shared fixed overlay for Tianyi composer controls. Rendering at document.body
 * keeps it outside the sidebar and composer overflow boundaries.
 */
export function ComposerPopover(props: ComposerPopoverProps) {
  const popoverRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const position = () => {
      const anchor = props.anchorRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const opensAbove = anchor.top - POPOVER_GAP - height >= VIEWPORT_GUTTER;
      const top = opensAbove
        ? anchor.top - POPOVER_GAP - height
        : Math.min(viewportHeight - height - VIEWPORT_GUTTER, anchor.bottom + POPOVER_GAP);
      const left = Math.max(VIEWPORT_GUTTER, Math.min(anchor.right - width, viewportWidth - width - VIEWPORT_GUTTER));
      popover.style.top = `${Math.max(VIEWPORT_GUTTER, top)}px`;
      popover.style.left = `${left}px`;
    };
    position();
    const resizeObserver = new ResizeObserver(position);
    resizeObserver.observe(popoverRef.current!);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [props.anchorRef]);

  useEffect(() => {
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !props.anchorRef.current?.contains(target)) props.onClose();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onClose();
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeIfOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [props]);

  return createPortal(
    <section ref={popoverRef} className={`composer-popover ${props.className}`} role="dialog" aria-label={props.ariaLabel} tabIndex={-1} onKeyDown={props.onKeyDown}>
      {props.children}
    </section>,
    document.body
  );
}
