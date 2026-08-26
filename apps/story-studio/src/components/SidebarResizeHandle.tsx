import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import {
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_STANDARD_WIDTH_PX,
  clampSidebarWidth,
  snapSidebarWidth
} from "../lib/sidebarLayout.ts";

const KEYBOARD_STEP_PX = 16;

type DragSnapshot = {
  pointerId: number;
  startClientX: number;
  startWidthPx: number;
};

export function SidebarResizeHandle(props: {
  widthPx: number;
  label: string;
  onResize(widthPx: number): void;
}) {
  const dragRef = useRef<DragSnapshot | null>(null);

  function preview(target: HTMLElement, widthPx: number): void {
    target.closest<HTMLElement>(".story-studio-shell")?.style.setProperty("--sidebar-preview-width", `${clampSidebarWidth(widthPx)}px`);
  }

  function clearPreview(target: HTMLElement): void {
    const shell = target.closest<HTMLElement>(".story-studio-shell");
    window.requestAnimationFrame(() => shell?.style.removeProperty("--sidebar-preview-width"));
  }

  function commit(target: HTMLElement, widthPx: number): void {
    const nextWidth = snapSidebarWidth(widthPx);
    preview(target, nextWidth);
    props.onResize(nextWidth);
    clearPreview(target);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidthPx: clampSidebarWidth(props.widthPx)
    };
    event.currentTarget.classList.add("is-resizing");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    preview(event.currentTarget, drag.startWidthPx + event.clientX - drag.startClientX);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.classList.remove("is-resizing");
    commit(event.currentTarget, drag.startWidthPx + event.clientX - drag.startClientX);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handlePointerCancel(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.classList.remove("is-resizing");
    preview(event.currentTarget, props.widthPx);
    clearPreview(event.currentTarget);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const step = event.shiftKey ? KEYBOARD_STEP_PX * 2 : KEYBOARD_STEP_PX;
    const nextWidth = event.key === "ArrowLeft"
      ? props.widthPx - step
      : event.key === "ArrowRight"
        ? props.widthPx + step
        : event.key === "Home"
          ? SIDEBAR_MIN_WIDTH_PX
          : event.key === "End"
            ? SIDEBAR_MAX_WIDTH_PX
            : event.key === "Enter"
              ? SIDEBAR_STANDARD_WIDTH_PX
              : null;
    if (nextWidth === null) return;
    event.preventDefault();
    commit(event.currentTarget, nextWidth);
  }

  const widthPx = clampSidebarWidth(props.widthPx);
  return <div
    className="desktop-only sidebar-resize-handle"
    role="separator"
    aria-label={props.label}
    aria-orientation="vertical"
    aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
    aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
    aria-valuenow={widthPx}
    aria-valuetext={`${widthPx} 像素`}
    tabIndex={0}
    data-testid="sidebar-resize-handle"
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    onPointerCancel={handlePointerCancel}
    onKeyDown={handleKeyDown}
  />;
}
