import { useState } from "react";

import { DockPanelStack } from "./DockPanelStack";
import { DockToolRail } from "./DockToolRail";
import type { DockLayoutState, DockToolId } from "./types";

export function RightDock(props: {
  layout: DockLayoutState;
  onToggle(toolId: DockToolId): void;
  onResize(toolId: DockToolId, size: number): void;
}) {
  // This is intentionally local presentation state: changing rail density must
  // not mutate the shared dock layout or change a user's panel arrangement.
  const [toolRailExpanded, setToolRailExpanded] = useState(false);
  return <>
    <DockPanelStack openPanelIds={props.layout.openPanelIds} panelSizes={props.layout.panelSizes} onClose={props.onToggle} onResize={props.onResize} />
    <DockToolRail expanded={toolRailExpanded} openPanelIds={props.layout.openPanelIds} onToggle={props.onToggle} onToggleExpanded={() => setToolRailExpanded((expanded) => !expanded)} />
  </>;
}
