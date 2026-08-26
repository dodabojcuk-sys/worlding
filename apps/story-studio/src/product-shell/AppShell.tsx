import type { CSSProperties, ReactNode } from "react";

import type { ProductWorkspaceMode } from "./navigation/topLevelDestinationRegistry";

export function AppShell(props: {
  children: ReactNode;
  projectSource: string;
  productMode: ProductWorkspaceMode;
  uiFontSize: string;
  editorFontSize: string;
  sidebarWidth: string;
  sidebarCollapsed: boolean;
  editorWidth: string;
  creationView?: "center" | "artifact" | "media";
  tianyiQuickPlacement: string;
  style: CSSProperties;
}) {
  return <main
    className="story-studio-shell app-shell"
    data-app-shell="tianyan-unified-product-shell-r0"
    data-project-source={props.projectSource}
    data-ui-font-size={props.uiFontSize}
    data-editor-font-size={props.editorFontSize}
    data-sidebar-width={props.sidebarWidth}
    data-sidebar-collapsed={props.sidebarCollapsed ? "true" : "false"}
    data-editor-width={props.editorWidth}
    data-creation-view={props.creationView || ""}
    data-outer-sidebar="visible"
    data-product-mode={props.productMode}
    data-tianyi-quick-placement={props.tianyiQuickPlacement}
    style={props.style}
  >{props.children}</main>;
}
