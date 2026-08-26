import { Menu } from "lucide-react";
import type { ReactNode, RefObject } from "react";

export function WorkspaceHeader(props: {
  projectTitle: string;
  title: string;
  icon: ReactNode;
  sectionLabel?: string;
  context?: string;
  status?: ReactNode;
  prototype?: "hub" | "workbench" | "editor";
  actions?: ReactNode;
  className?: string;
  onOpenNavigation?(): void;
  titleRef?: RefObject<HTMLElement | null>;
  titleAsHeading?: boolean;
  titleTestId?: string;
}) {
  return <header className={`workbench-bar workspace-header ${props.className || ""}`.trim()} data-page-prototype={props.prototype || "workbench"} data-module-toolbar="true" data-module={props.sectionLabel || props.title}>
    {props.onOpenNavigation ? <button type="button" className="mobile-only icon-action" onClick={props.onOpenNavigation} aria-label="打开项目导航"><Menu /></button> : null}
    <div className="workbench-project workbench-location">{props.icon}<span className="workbench-header-copy"><strong ref={props.titleRef} tabIndex={props.titleRef ? -1 : undefined} role={props.titleAsHeading ? "heading" : undefined} aria-level={props.titleAsHeading ? 1 : undefined} data-testid={props.titleTestId}>{props.title}</strong>{props.context ? <em>{props.context}</em> : null}</span></div>
    {props.status ? <div className="workspace-header-status">{props.status}</div> : <span className="workspace-header-spacer" />}
    <div className="workbench-header-actions">{props.actions}</div>
  </header>;
}
