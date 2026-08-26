import { ChevronDown, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";

import type { ProductWorkspaceMode } from "./navigation/topLevelDestinationRegistry";
import { projectDisplayTitle } from "./projectTitleProjection";

export function GlobalHeader(props: {
  projectTitle: unknown;
  mode: ProductWorkspaceMode;
  modeLabel?: string;
  onToggleTianyi(): void;
  tianyiOpen: boolean;
  projects: Array<{ id: string; title: unknown; status?: string }>;
  activeProjectId: string | null;
  onSwitchProject(projectId: string): void;
  onOpenSettings(): void;
}) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const projectTitle = projectDisplayTitle(props.projectTitle, props.activeProjectId !== null);
  const labels: Record<ProductWorkspaceMode, string> = {
    world: "世界", tianyi: "天意", "event-line": "事件线", nuwa: "女娲", multiverse: "多元", library: "资料", writing: "创作", data: "数据"
  };
  return <header className="global-workspace-header" data-global-header="true">
    <div className="global-workspace-breadcrumb" data-global-header-region="left" aria-label="当前位置"><span>{props.modeLabel || labels[props.mode]}</span></div>
    <div className="global-workspace-title" data-testid="global-workspace-title" data-global-header-region="center">
      <button type="button" className="global-project-title-trigger" aria-label="切换当前作品" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)}><strong title={projectTitle} data-testid="global-project-label">{projectTitle}</strong><ChevronDown aria-hidden="true" /></button>
      <button type="button" className="global-header-settings" aria-label="打开设置" title="设置" onClick={props.onOpenSettings}><Settings2 /></button>
      {projectMenuOpen && <section className="global-project-title-menu" data-testid="global-project-title-menu" role="dialog" aria-label="作品切换器"><strong>切换作品</strong>{props.projects.map((project) => <button type="button" className={project.id === props.activeProjectId ? "is-current" : ""} aria-current={project.id === props.activeProjectId ? "true" : undefined} key={project.id} onClick={() => { setProjectMenuOpen(false); if (project.id !== props.activeProjectId) props.onSwitchProject(project.id); }}><span>{projectDisplayTitle(project.title)}</span><small>{project.status || "本地项目"}</small></button>)}</section>}
    </div>
    <button type="button" className="global-tianyi-trigger" aria-label={props.tianyiOpen ? "关闭天意助手" : "打开天意助手"} aria-expanded={props.tianyiOpen} aria-controls="tianyi-quick-assistant" data-testid="tianyi-quick-launcher" data-global-tianyi-trigger="true" data-global-header-region="right" onClick={props.onToggleTianyi}><Sparkles aria-hidden="true" /><span>天意</span></button>
  </header>;
}
