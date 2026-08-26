import { ArrowRight, FolderOpen, Plus } from "lucide-react";

import { projectDisplayTitle } from "./projectTitleProjection";

export function ProjectCenter(props: {
  projects: Array<{ id: string; title: string; status?: string }>;
  activeProjectId: string | null;
  onOpen(projectId: string): void;
  onCreate(): void;
  onBack(): void;
}) {
  return <main className="project-center" data-testid="project-center">
    <header><p className="eyebrow" data-testid="project-selection-label">{props.activeProjectId === null ? "选择作品" : "作品中心"}</p><h1>选择或创建作品</h1><p>这里管理进入工作区前的作品选择；工作区内的切换器只用于切换已有作品。</p></header>
    <section className="project-center-list" aria-label="已有作品">
      {props.projects.map((project) => <button type="button" key={project.id} aria-current={project.id === props.activeProjectId ? "true" : undefined} onClick={() => props.onOpen(project.id)}><FolderOpen /><span><strong>{projectDisplayTitle(project.title)}</strong><small>{project.status || "本地项目"}</small></span>{project.id === props.activeProjectId ? <em>当前</em> : <ArrowRight />}</button>)}
    </section>
    <footer><button type="button" className="primary-action" onClick={props.onCreate}><Plus />新建作品</button><button type="button" className="secondary-action" onClick={props.onBack}>返回当前工作区</button></footer>
  </main>;
}
