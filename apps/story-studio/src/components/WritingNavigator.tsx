import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FileText, Menu, Plus } from "lucide-react";

import type { OutputArtifact, OutputArtifactType, WritingBootstrap, WritingDocumentSummary } from "../lib/localTransport";
import type { AuthorContextCounts, AuthorContextTarget } from "../product-shell/AuthorLibraryHierarchy";
import { AuthorContextSelector } from "../product-shell/AuthorContextSelector";
import { SidebarResizeHandle } from "./SidebarResizeHandle";

// Historical onCreateArtifact callers are intentionally redirected to the
// neutral Story Package output flow; no legacy writer is reintroduced here.

const types: Array<{ id: OutputArtifactType; label: string; structure: string }> = [
  { id: "novel", label: "小说", structure: "卷、章与场景" },
  { id: "screenplay", label: "剧本", structure: "集、幕与场" },
  { id: "storyboard", label: "分镜", structure: "序列与镜头" },
  { id: "comic", label: "漫画", structure: "话、页与格" },
  { id: "motion-comic", label: "漫剧", structure: "集与镜头" },
  { id: "interactive-drama", label: "互动剧", structure: "章节、场景与选择" }
];

export function WritingNavigator(props: {
  writing: WritingBootstrap;
  mobileOpen: boolean;
  collapsed: boolean;
  sidebarWidthPx: number;
  activeType: OutputArtifactType;
  creationMode: "output" | "editor";
  activeArtifactId: string | null;
  outputArtifacts: OutputArtifact[];
  contextCounts: AuthorContextCounts;
  onOpen(document: WritingDocumentSummary): void;
  onCreateChapter(): void;
  onCreateScene(chapterId: string): void;
  onOpenOutputArtifact(artifact: OutputArtifact): void;
  onOpenTypeMenu(): void;
  onOpenCreationOutput(): void;
  onCloseMobile(): void;
  onToggleCollapsed(): void;
  onSidebarResize(widthPx: number): void;
  onSelectContext(target: AuthorContextTarget): void;
}) {
  const activeId = props.writing.activeDocument?.id || null;
  const activeType = types.find((type) => type.id === props.activeType)!;
  const outputMode = props.creationMode === "output";
  const artifacts = props.outputArtifacts.filter((artifact) => (outputMode || artifact.type === props.activeType) && artifact.lifecycle !== "archived");
  const displayType = outputMode ? "故事包" : activeType.label;
  const useNovelTree = !outputMode && props.activeType === "novel" && !props.activeArtifactId;
  return <aside
    className={`writing-navigator workspace-sidebar-slot ${props.mobileOpen ? "is-mobile-open" : ""} ${props.collapsed ? "is-collapsed" : ""}`}
    data-testid="writing-navigator"
    data-mobile-open={props.mobileOpen ? "true" : "false"}
    data-state={props.mobileOpen ? "open" : "closed"}
    data-workspace-sidebar-slot="创作"
    role={props.mobileOpen ? "dialog" : undefined}
    aria-modal={props.mobileOpen ? true : undefined}
    aria-label={props.mobileOpen ? "创作结构抽屉" : undefined}
  >
    <header>
      <div className="workspace-sidebar-header creation-sidebar-type"><small>创作</small><button type="button" onClick={props.onOpenTypeMenu} aria-haspopup="menu" aria-label={`切换创作类型，当前${displayType}`}><strong>{displayType}</strong><ChevronDown /></button></div>
      <button type="button" className="desktop-only icon-action writing-collapse-action" onClick={props.onToggleCollapsed} aria-label={props.collapsed ? "展开创作结构" : "收起创作结构"} title={props.collapsed ? "展开创作结构" : "收起创作结构"}>{props.collapsed ? <ChevronRight /> : <ChevronLeft />}</button>
      <button type="button" className="mobile-only icon-action" onClick={props.onCloseMobile} aria-label="关闭创作结构"><Menu /></button>
    </header>
    <div className="creation-sidebar-actions"><button type="button" className="primary-action" onClick={props.onOpenCreationOutput}><ExternalLink />选择故事成果</button><small>{outputMode ? "故事包 → 外部工具" : activeType.structure}</small></div>
    {artifacts.length ? <section className="writing-output-artifacts" aria-label={`${displayType}输出产物`}><small>最近打开</small>{artifacts.map((artifact) => <button type="button" key={artifact.id} className={artifact.id === props.activeArtifactId ? "is-active" : ""} onClick={() => props.onOpenOutputArtifact(artifact)}><FileText /><span><strong>{artifact.title}</strong><small>{artifact.lifecycle === "draft" ? "编辑中" : artifact.lifecycle === "archived" ? "已归档" : "最近更新"}</small></span></button>)}</section> : <section className="creation-sidebar-empty"><BookOpen /><strong>{outputMode ? "尚未选择输出产物" : `还没有${activeType.label}`}</strong><p>{outputMode ? "在主区域选择故事成果、输出方向和外部工具。" : "从当前故事开始，或创建一份空白成品。"}</p></section>}
    {useNovelTree ? <nav aria-label="小说章节与场景">
      {props.writing.chapters.map((chapter) => <section className="writing-tree-chapter" key={chapter.id}>
        <div>
          <button type="button" className={chapter.id === activeId ? "is-active" : ""} onClick={() => props.onOpen(chapter)} aria-label={chapter.title} title={chapter.title}><ChevronRight /><span><strong>{chapter.title}</strong><small>{writingStatusLabel(chapter.status)}</small></span></button>
          <button type="button" className="icon-action" onClick={() => props.onCreateScene(chapter.id)} aria-label={`在${chapter.title}中新建场景`}><Plus /></button>
        </div>
        {chapter.scenes.map((scene) => <button type="button" className={`writing-tree-scene ${scene.id === activeId ? "is-active" : ""}`} onClick={() => props.onOpen(scene)} aria-label={scene.title} title={scene.title} key={scene.id}><FileText className="writing-scene-icon" /><span>{scene.title}</span><small>{writingStatusLabel(scene.status)}</small></button>)}
      </section>)}
      {!props.writing.chapters.length && <p className="writing-tree-empty">新建一份小说，或先创建一章。</p>}
    </nav> : null}
    {!props.collapsed && <AuthorContextSelector counts={props.contextCounts} onSelect={props.onSelectContext} containedByMobileDrawer={props.mobileOpen} />}
    {!props.collapsed && <SidebarResizeHandle widthPx={props.sidebarWidthPx} label="调整创作结构侧栏宽度" onResize={props.onSidebarResize} />}
  </aside>;
}

export function creationTypeLabel(type: OutputArtifactType): string { return types.find((candidate) => candidate.id === type)?.label || "创作"; }
export const creationTypes = types;
function writingStatusLabel(value: string): string { return ({ drafting: "写作中", reviewing: "待检查", revising: "修订中", completed: "已完成" } as Record<string, string>)[value] ?? "编辑中"; }
