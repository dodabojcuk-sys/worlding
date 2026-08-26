import { Clock3, FilePlus2, FileText, FolderPlus, GitFork, Map, Network, Plus, Shapes } from "lucide-react";
import type { ReactNode } from "react";

import type { VisualDocumentType } from "../lib/localTransport";

export function NewWorldDocumentMenu(props: {
  compact?: boolean;
  onCreateObject(): void;
  onCreateVisual(type: VisualDocumentType): void;
  onCreateFolder(): void;
}) {
  return <details className={`new-world-document-menu ${props.compact ? "is-compact" : ""}`}>
    <summary aria-label={props.compact ? "新建资料" : undefined} title="新建资料">{props.compact ? <Plus /> : <FilePlus2 />}<span>新建资料</span></summary>
    <div className="new-world-document-grid" role="menu" aria-label="新建资料">
      <DocumentAction icon={<FileText />} label="资料" detail="角色、地点、物品与故事资料" onClick={props.onCreateObject} />
      <DocumentAction icon={<Map />} label="地图" detail="地点、区域与图层" onClick={() => props.onCreateVisual("map")} />
      <DocumentAction icon={<Shapes />} label="画布" detail="自由组织线索与素材" onClick={() => props.onCreateVisual("canvas")} />
      <DocumentAction icon={<GitFork />} label="关系图谱" detail="人物、势力与事件关系" onClick={() => props.onCreateVisual("graph")} />
      <DocumentAction icon={<Network />} label="Tree" detail="从图谱投影层级结构" onClick={() => props.onCreateVisual("tree")} />
      <DocumentAction icon={<Clock3 />} label="Timeline" detail="作者确认的正史事件" onClick={() => props.onCreateVisual("timeline")} />
      <DocumentAction icon={<FolderPlus />} label="文件夹" detail="整理世界文档" onClick={props.onCreateFolder} />
    </div>
  </details>;
}

function DocumentAction(props: { icon: ReactNode; label: string; detail: string; onClick(): void }) {
  return <button type="button" role="menuitem" onClick={(event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    props.onClick();
  }}>{props.icon}<span><strong>{props.label}</strong><small>{props.detail}</small></span></button>;
}
