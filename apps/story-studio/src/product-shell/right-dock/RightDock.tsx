import { DockPanelStack } from "./DockPanelStack";
import { DockToolRail } from "./DockToolRail";
import type { DockLayoutState, DockToolId } from "./types";
import { useEffect } from "react";

export function RightDock(props: {
  layout: DockLayoutState;
  compact: boolean;
  modal: boolean;
  onToggle(toolId: DockToolId): void;
  onResize(toolId: DockToolId, size: number): void;
}) {
  // This is intentionally local presentation state: changing rail density must
  // not mutate the shared dock layout or change a user's panel arrangement.
  useEffect(() => {
    if (!props.layout.activeToolId) return;
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !focused.closest(".dock-panel-stack")) return;
      event.preventDefault();
      props.onToggle(props.layout.activeToolId!);
    };
    window.addEventListener("keydown", closeFromEscape);
    return () => window.removeEventListener("keydown", closeFromEscape);
  }, [props.layout.activeToolId, props.onToggle]);
  return <>
    <DockPanelStack overlay={props.compact} modal={props.modal} openPanelIds={props.layout.openPanelIds} panelSizes={props.layout.panelSizes} onClose={props.onToggle} onResize={props.onResize} />
    <DockToolRail compact={props.compact} expanded={false} activeToolId={props.layout.activeToolId} onToggle={props.onToggle} onToggleExpanded={() => undefined} />
  </>;
}
