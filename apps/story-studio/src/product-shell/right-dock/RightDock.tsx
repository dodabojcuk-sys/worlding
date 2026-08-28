import { DockPanelStack } from "./DockPanelStack";
import { DockToolRail } from "./DockToolRail";
import type { DockLayoutState, DockToolId } from "./types";

export function RightDock(props: {
  layout: DockLayoutState;
  onToggle(toolId: DockToolId): void;
  onResize(toolId: DockToolId, size: number): void;
}) {
  return <>
    <DockPanelStack openPanelIds={props.layout.openPanelIds} panelSizes={props.layout.panelSizes} onClose={props.onToggle} onResize={props.onResize} />
    <DockToolRail openPanelIds={props.layout.openPanelIds} onToggle={props.onToggle} />
  </>;
}
