import { ChevronRight, Clock3, FileText, GitFork, Map, Network, Shapes, X } from "lucide-react";

import type { VisualDocumentType } from "../lib/localTransport";
import { NewWorldDocumentMenu } from "./NewWorldDocumentMenu";

export type WorldDocumentTab = {
  kind: "object" | "visual";
  id: string;
  title: string;
  type: string;
  relativePath?: string;
};

export function WorldDocumentTabs(props: {
  tabs: WorldDocumentTab[];
  activeId: string | null;
  onOpen(tab: WorldDocumentTab): void;
  onClose(tab: WorldDocumentTab): void;
  onCreateObject(): void;
  onCreateVisual(type: VisualDocumentType): void;
  onCreateFolder(): void;
}) {
  return <div className="document-tabs-shell">
    <nav className="document-tabs unified-document-tabs" aria-label="已打开世界文档">
      {props.tabs.map((tab) => <div className={tab.id === props.activeId ? "is-active" : ""} key={`${tab.kind}:${tab.id}`}>
        <button type="button" onClick={() => props.onOpen(tab)}>{tabIcon(tab)}<span>{tab.title}</span></button>
        <button type="button" className="tab-close-action" aria-label={`关闭 ${tab.title}`} onClick={() => props.onClose(tab)}><X /></button>
      </div>)}
      <NewWorldDocumentMenu compact onCreateObject={props.onCreateObject} onCreateVisual={props.onCreateVisual} onCreateFolder={props.onCreateFolder} />
    </nav>
    <span className="document-tabs-overflow-hint" aria-hidden="true"><ChevronRight /></span>
  </div>;
}

function tabIcon(tab: WorldDocumentTab) {
  if (tab.kind === "object") return <FileText />;
  const type = tab.type as VisualDocumentType;
  return type === "map" ? <Map /> : type === "graph" ? <GitFork /> : type === "canvas" ? <Shapes /> : type === "timeline" ? <Clock3 /> : <Network />;
}
