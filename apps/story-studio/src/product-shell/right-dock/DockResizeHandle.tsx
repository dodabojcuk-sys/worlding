import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

export function DockResizeHandle(props: { label: string; size: number; onSize(size: number): void }) {
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    cleanupRef.current?.();
    const startY = event.clientY;
    const startSize = props.size;
    const move = (moveEvent: globalThis.PointerEvent) => props.onSize(startSize + moveEvent.clientY - startY);
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      cleanupRef.current = null;
    };
    cleanupRef.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    props.onSize(props.size + (event.key === "ArrowDown" ? 16 : -16));
  };
  return <button
    type="button"
    className="dock-resize-handle"
    role="separator"
    aria-orientation="horizontal"
    aria-label={props.label}
    aria-valuenow={props.size}
    aria-valuemin={160}
    aria-valuemax={640}
    onPointerDown={beginResize}
    onKeyDown={keyDown}
  ><span aria-hidden="true" /></button>;
}
