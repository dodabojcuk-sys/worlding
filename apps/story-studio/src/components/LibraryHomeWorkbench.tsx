import { Archive, ChevronDown, FileSearch, Folder, FolderOpen, GitFork, Map, Package, Plus, Shapes, UserRound, UsersRound } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import type { AgentTypeDefinition, WorldObjectSummary, WorldObjectType } from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { authorFacingObjectTypeLabel } from "../worldObjectCatalog";
import type { LibraryDirectoryId, LibraryViewTab } from "./LibraryDirectoryWorkbench";

type HomeIcon = typeof Folder;

export function LibraryHomeWorkbench(props: {
  projectTitle: string;
  objects: WorldObjectSummary[];
  uncertainCount: number;
  unfiledCount: number;
  customTypes: AgentTypeDefinition[];
  customTypeCounts: Record<string, number>;
  builtinCounts: Record<"all" | "character" | "item" | "location" | "faction", number>;
  relationCount: number;
  recentObjects: WorldObjectSummary[];
  visualDocumentCount: number;
  sourceImportCount: number;
  foldersCount: number;
  onCreateObject(): void;
  onOpenDirectory(directory: LibraryDirectoryId): void;
  onOpenTab(tab: LibraryViewTab): void;
  onOpenAuxiliary(directory: Extract<LibraryDirectoryId, "folders" | "visual">): void;
  onOpenImportReview(): void;
  onOpenObject(object: WorldObjectSummary): void;
  onOpenNavigation(): void;
  focusRequest?: number;
}) {
  const headingRef = useHeadingFocus(props.focusRequest);
  const [structureOpen, setStructureOpen] = useState(false);
  const structureTriggerRef = useRef<HTMLButtonElement>(null);
  const activeCustomTypes = props.customTypes.filter((type) => type.status === "active");
  const hasObjects = props.objects.length > 0;
  const typeCards: Array<{ id: LibraryDirectoryId; label: string; count: number; Icon: HomeIcon }> = [
    { id: "all", label: "全部资料", count: props.builtinCounts.all, Icon: FolderOpen },
    { id: "character", label: "角色", count: props.builtinCounts.character, Icon: UserRound },
    { id: "item", label: "物品", count: props.builtinCounts.item, Icon: Package },
    { id: "location", label: "地点", count: props.builtinCounts.location, Icon: Map },
    { id: "faction", label: "组织", count: props.builtinCounts.faction, Icon: UsersRound },
    { id: "relation", label: "关系", count: props.relationCount, Icon: GitFork }
  ];

  return <section className="workbench library-home-workbench" data-testid="library-home-workbench">
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="资料"
      title="资料库"
      context="管理作品中的角色、物品、地点、组织和其他资料"
      status="本地目录"
      prototype="hub"
      icon={<FolderOpen aria-hidden="true" />}
      onOpenNavigation={props.onOpenNavigation}
      titleRef={headingRef}
      titleAsHeading
      titleTestId="library-home-heading"
      actions={<button type="button" className="primary-action" onClick={props.onCreateObject}><Plus />新建资料</button>}
    />

    <main className="library-home-main" aria-label="资料库首页">
      {!hasObjects && <div className="library-home-empty" data-testid="library-home-empty">
        <span className="library-home-empty-icon"><Folder aria-hidden="true" /></span>
        <span><strong>这个作品还没有资料</strong><small>先新建第一份资料；分类和资料结构会在需要时保持可用。</small></span>
        <button type="button" className="secondary-action" onClick={props.onCreateObject}><Plus />新建第一份资料</button>
      </div>}

      <section className="library-home-section" aria-labelledby="library-home-browse-title">
        <SectionHeading id="library-home-browse-title" title="按类型浏览" />
        <div className="library-home-type-grid" data-testid="library-home-type-grid">
          {typeCards.map(({ id, label, count, Icon }) => <HomeTypeButton key={id} label={label} count={count} Icon={Icon} onClick={() => props.onOpenDirectory(id)} />)}
          {activeCustomTypes.map((type) => <HomeTypeButton key={type.typeId} label={type.label} count={props.customTypeCounts[type.typeId] || 0} Icon={Shapes} onClick={() => props.onOpenDirectory(`agent:${type.typeId}`)} />)}
        </div>
      </section>

      {props.recentObjects.length > 0 && <section className="library-home-section" aria-labelledby="library-home-recent-title" data-testid="library-home-recent">
        <div className="library-home-section-heading"><SectionHeading id="library-home-recent-title" title="最近更新" /><button type="button" className="library-home-section-link" onClick={() => props.onOpenDirectory("recent")}>查看全部</button></div>
        <div className="library-home-recent-list" role="list">
          {props.recentObjects.map((object) => <button key={object.id} type="button" role="listitem" className="library-home-recent-row" onClick={() => props.onOpenObject(object)}>
            <ObjectTypeIcon type={object.type} />
            <span><strong>{object.title}</strong><small>{authorFacingObjectTypeLabel({ sourceType: object.type, agentTypeId: object.agentTypeId, agentTypes: props.customTypes }).label}</small></span>
          </button>)}
        </div>
      </section>}

      <section className="library-home-section" aria-labelledby="library-home-organize-title">
        <SectionHeading id="library-home-organize-title" title="继续整理" />
        <div className="library-home-organize-grid" data-testid="library-home-organize">
          <HomeOrganizeButton label="待确定" detail={`${props.uncertainCount} 项待处理`} Icon={FileSearch} onClick={() => props.onOpenTab("uncertain")} />
          <HomeOrganizeButton label="未归档" detail={`${props.unfiledCount} 项未归档`} Icon={Archive} onClick={() => props.onOpenDirectory("unfiled")} />
          <HomeOrganizeButton label="导入与审核" detail={props.sourceImportCount ? `${props.sourceImportCount} 个来源` : "保留原文并整理候选"} Icon={FileSearch} onClick={props.onOpenImportReview} />
        </div>
      </section>

      <section className="library-home-structure" aria-labelledby="library-home-structure-title" data-testid="library-home-structure">
        <button
          type="button"
          id="library-home-structure-title"
          ref={structureTriggerRef}
          className="library-home-structure-disclosure"
          aria-expanded={structureOpen}
          aria-controls="library-home-structure-actions"
          onClick={() => {
            const nextOpen = !structureOpen;
            setStructureOpen(nextOpen);
            if (!nextOpen) window.requestAnimationFrame(() => structureTriggerRef.current?.focus({ preventScroll: true }));
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && structureOpen) {
              event.preventDefault();
              setStructureOpen(false);
              window.requestAnimationFrame(() => structureTriggerRef.current?.focus({ preventScroll: true }));
            }
          }}
        >
          <span><strong>资料结构</strong><small>自定义类型 · 文件夹与分类 · 视觉文档</small></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {structureOpen && <div id="library-home-structure-actions" className="library-home-structure-menu" role="region" aria-labelledby="library-home-structure-title">
          <button type="button" onClick={() => props.onOpenDirectory("agent-types")}><Shapes aria-hidden="true" /><span><strong>管理自定义类型</strong><small>{activeCustomTypes.length} 个已启用类型</small></span></button>
          <button type="button" onClick={() => props.onOpenAuxiliary("folders")}><Folder aria-hidden="true" /><span><strong>管理文件夹与分类</strong><small>{props.foldersCount} 个文件夹</small></span></button>
          <button type="button" onClick={() => props.onOpenAuxiliary("visual")}><Shapes aria-hidden="true" /><span><strong>管理视觉文档</strong><small>{props.visualDocumentCount} 份文档</small></span></button>
        </div>}
      </section>
    </main>
  </section>;
}

function useHeadingFocus(focusRequest: number | undefined): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusRequest) return;
    const frame = window.requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);
  return ref;
}

function SectionHeading(props: { id: string; title: string }) {
  return <h2 id={props.id} className="library-home-section-title">{props.title}</h2>;
}

function HomeTypeButton(props: { label: string; count: number; Icon: HomeIcon; onClick(): void }) {
  return <button type="button" className="library-home-type-button" title={`${props.label} · ${props.count} 项资料`} onClick={props.onClick}>
    <props.Icon aria-hidden="true" /><span><strong>{props.label}</strong><small>{props.count} 项资料</small></span>
  </button>;
}

function HomeOrganizeButton(props: { label: string; detail: string; Icon: HomeIcon; onClick(): void }) {
  return <button type="button" className="library-home-organize-button" title={`${props.label} · ${props.detail}`} onClick={props.onClick}>
    <props.Icon aria-hidden="true" /><span><strong>{props.label}</strong><small>{props.detail}</small></span>
  </button>;
}

function ObjectTypeIcon(props: { type: WorldObjectType }) {
  const Icon = props.type === "character" ? UserRound : props.type === "item" ? Package : props.type === "location" ? Map : props.type === "faction" ? UsersRound : props.type === "event" ? FileSearch : props.type === "rule" ? Folder : Shapes;
  return <Icon aria-hidden="true" />;
}
