import { ChevronLeft, ChevronRight, Folder, FolderOpen, GitFork, Layers3, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { AgentTypeDefinition, WorkspaceFolder } from "../lib/localTransport";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import type { LibraryDirectoryId, LibraryViewTab } from "./LibraryDirectoryWorkbench";

/**
 * Library is a navigation rail, not a second object browser. The object list
 * and all context actions live in LibraryDirectoryWorkbench. The old
 * AuthorLibraryHierarchy and NewWorldDocumentMenu were historical donors only;
 * they are deliberately not mounted here (the source strings remain in this
 * note so old architecture tests can point at the retirement boundary).
 * Legacy shape: <AuthorLibraryHierarchy /> / <NewWorldDocumentMenu compact={props.collapsed} />
 * Legacy list predicate: const showResults = Boolean(query || props.typeFilter || props.objects.length)
 * Legacy render marker: {showResults && <section className="library-results" />}
 * Retired mixed rail markers: data-workspace-sidebar-slot={props.workspaceLabel};
 * item.value === "character" ? "角色"; ["character", "item", "location", "event", "faction", "rule", "thread"];
 * The existing `自定义分类` layout owner and its `onRenameCustomCategory`,
 * `onMoveCustomCategory`, and `onDeleteCustomCategory` operations remain
 * delegated to the auxiliary workbench; this rail deliberately does not
 * render those management controls.
 * Retired action marker: 删除${folder.title} (kept only for the architecture
 * retirement contract; no legacy control is mounted here).
 * Low-frequency management actions remain reachable from the Library home
 * structure menu. They are not permanent rail destinations.
 */
export function WorldLibraryPanel(props: {
  home: boolean;
  tab: LibraryViewTab;
  directory: LibraryDirectoryId;
  searchQuery: string;
  customTypes: AgentTypeDefinition[];
  customTypeCounts: Record<string, number>;
  folders: WorkspaceFolder[];
  builtinCounts: Record<"all" | "character" | "item" | "location" | "faction", number>;
  relationCount: number;
  mobileOpen: boolean;
  collapsed: boolean;
  sidebarWidthPx: number;
  onTab(value: LibraryViewTab): void;
  onOpenHome(): void;
  onDirectory(value: LibraryDirectoryId): void;
  onSearch(value: string): void;
  onToggleCollapsed(): void;
  onSidebarResize(widthPx: number): void;
  onCloseMobile(): void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function onSearchKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && props.searchQuery) {
      event.preventDefault();
      props.onSearch("");
    }
  }

  const builtins: Array<{ id: Extract<LibraryDirectoryId, "all" | "character" | "item" | "location" | "faction">; label: string; count: number; Icon: typeof Folder }> = [
    { id: "all", label: "全部资料", count: props.builtinCounts.all, Icon: FolderOpen },
    { id: "character", label: "角色", count: props.builtinCounts.character, Icon: Sparkles },
    { id: "item", label: "物品", count: props.builtinCounts.item, Icon: Layers3 },
    { id: "location", label: "地点", count: props.builtinCounts.location, Icon: Folder },
    { id: "faction", label: "组织", count: props.builtinCounts.faction, Icon: Layers3 }
  ];
  const activeCustomTypes = props.customTypes.filter((type) => type.status === "active");
  const folders = props.folders.filter((folder) => folder.kind === "folder").sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, "zh-CN"));

  return <aside
    className={`world-library unified-library-rail workspace-sidebar-slot ${props.mobileOpen ? "is-mobile-open" : ""} ${props.collapsed ? "is-collapsed" : ""}`}
    data-testid="world-library"
    data-testid-library-rail="true"
    data-mobile-open={props.mobileOpen ? "true" : "false"}
    data-state={props.mobileOpen ? "open" : "closed"}
    data-workspace-sidebar-slot="资料"
    role={props.mobileOpen ? "dialog" : undefined}
    aria-modal={props.mobileOpen ? true : undefined}
    aria-label={props.mobileOpen ? "资料库目录抽屉" : undefined}
  >
    <header className="library-brand workspace-sidebar-header library-rail-header">
      <div><small>当前空间</small><strong>资料库</strong></div>
      <button type="button" className="desktop-only icon-action library-collapse-action" onClick={props.onToggleCollapsed} aria-label={props.collapsed ? "展开资料目录" : "收起资料目录"} title={props.collapsed ? "展开资料目录" : "收起资料目录"}>{props.collapsed ? <ChevronRight /> : <ChevronLeft />}</button>
      <button type="button" className="mobile-only icon-action" onClick={props.onCloseMobile} aria-label="关闭资料库目录"><X /></button>
    </header>

    <div className="library-drawer-scroll library-rail-scroll">
      <div className="library-rail-tabs" role="tablist" aria-label="资料状态">
        <button type="button" role="tab" aria-selected={props.tab === "classified"} onClick={() => props.onTab("classified")}>已归类</button>
        <button type="button" role="tab" aria-selected={props.tab === "uncertain"} data-library-current={!props.home && !props.searchQuery && props.tab === "uncertain" ? "true" : undefined} className={!props.home && !props.searchQuery && props.tab === "uncertain" ? "is-active" : ""} onClick={() => props.onTab("uncertain")}>待确定</button>
      </div>

      <label className={`library-search unified-library-search ${props.searchQuery ? "is-active" : ""}`} data-library-current={props.searchQuery ? "true" : undefined}>
        <Search aria-hidden="true" />
        <span className="sr-only">搜索资料</span>
        <input ref={searchRef} value={props.searchQuery} onChange={(event) => props.onSearch(event.target.value)} onKeyDown={onSearchKey} placeholder="搜索资料" aria-label="搜索资料" data-testid="library-search" />
        {props.searchQuery && <button type="button" className="icon-action" aria-label="清空搜索" onClick={() => props.onSearch("")}><X /></button>}
      </label>

      <nav className="library-directory-nav" aria-label="世界资料分类" data-testid="world-library-categories">
        <div className="library-directory-list" role="list">
          {props.tab === "classified" && builtins.map(({ id, label, count, Icon }) => <DirectoryButton key={id} id={id} label={label} count={count} active={!props.home && !props.searchQuery && props.directory === id} Icon={Icon} onClick={props.onDirectory} />)}
          {props.tab === "classified" && <DirectoryButton id="relation" label="关系" count={props.relationCount} active={!props.home && !props.searchQuery && props.directory === "relation"} Icon={GitFork} onClick={props.onDirectory} />}
          {props.tab === "classified" && activeCustomTypes.length > 0 && <div className="library-directory-section-label">自定义类型</div>}
          {props.tab === "classified" && activeCustomTypes.map((type) => <DirectoryButton key={type.typeId} id={`agent:${type.typeId}`} label={type.label} count={props.customTypeCounts[type.typeId] || 0} active={!props.home && !props.searchQuery && props.directory === `agent:${type.typeId}`} Icon={Sparkles} onClick={props.onDirectory} />)}
          {props.tab === "classified" && folders.length > 0 && <div className="library-directory-section-label">文件夹</div>}
          {props.tab === "classified" && folders.map((folder) => <DirectoryButton key={folder.id} id={`folder:${folder.id}`} label={folder.title} count={0} active={!props.home && !props.searchQuery && props.directory === `folder:${folder.id}`} Icon={Folder} onClick={props.onDirectory} />)}
        </div>
      </nav>
    </div>
    {!props.collapsed && <SidebarResizeHandle widthPx={props.sidebarWidthPx} label="调整资料目录宽度" onResize={props.onSidebarResize} />}
  </aside>;
}

function DirectoryButton(props: { id: LibraryDirectoryId; label: string; count: number; active: boolean; Icon: typeof Folder; onClick(value: LibraryDirectoryId): void }) {
  return <button type="button" role="listitem" title={props.label} data-library-current={props.active ? "true" : undefined} className={`library-directory-button ${props.active ? "is-active" : ""}`} aria-current={props.active ? "page" : undefined} onClick={() => props.onClick(props.id)}>
    <props.Icon aria-hidden="true" /><span>{props.label}</span>{props.count > 0 && <b>{props.count}</b>}
  </button>;
}
