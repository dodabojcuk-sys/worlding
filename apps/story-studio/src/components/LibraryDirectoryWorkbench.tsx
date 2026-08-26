import { Archive, ChevronDown, FileSearch, Folder, FolderPlus, Map, Package, Pencil, Plus, Search, Shapes, Sparkles, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import type {
  AgentTypeDefinition,
  ClassifiedAgentLibraryProjection,
  UncertainAgentLibraryProjection,
  VisualDocumentType,
  WorkspaceFolder,
  WorldObjectSummary,
  WorldObjectType
} from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { authorFacingObjectTags } from "../worldObjectCatalog";

export type LibraryViewTab = "classified" | "uncertain";
export type LibraryDirectoryId = "all" | "character" | "item" | "location" | "faction" | "relation" | `agent:${string}` | `folder:${string}` | "agent-types" | "recent" | "unfiled" | "import" | "folders" | "visual";

export type LibraryListItem = {
  object: WorldObjectSummary;
  typeLabel: string;
  statusLabel?: string;
  sourceLabel?: string;
  retired?: boolean;
};

export type LibraryUncertainItem =
  | { kind: "world-object"; id: string; title: string; subtitle: string; object: WorldObjectSummary | null; reason: string }
  | { kind: "proposal"; id: string; title: string; subtitle: string; reason: string; status: string }
  | { kind: "relation"; id: string; relationId: string; title: string; subtitle: string; reason: string };

const DIRECTORY_LABELS: Record<Extract<LibraryDirectoryId, "all" | "character" | "item" | "location" | "faction">, string> = {
  all: "全部资料",
  character: "角色",
  item: "物品",
  location: "地点",
  faction: "组织"
};

const DIRECTORY_ICONS = {
  all: Folder,
  character: UserRound,
  item: Package,
  location: Map,
  faction: UsersRound
} as const;

const AUXILIARY_DIRECTORY_LABELS: Record<Extract<LibraryDirectoryId, "agent-types" | "recent" | "unfiled" | "import" | "folders" | "visual">, string> = {
  "agent-types": "自定义类型",
  recent: "最近更新",
  unfiled: "未归档",
  import: "导入与审核",
  folders: "文件夹与分类",
  visual: "视觉文档"
};

export function libraryDirectoryLabel(id: LibraryDirectoryId, customTypes: AgentTypeDefinition[] = [], folders: WorkspaceFolder[] = []): string {
  if (id.startsWith("agent:")) return customTypes.find((type) => type.typeId === id.slice("agent:".length))?.label || "自定义类型";
  if (id.startsWith("folder:")) return folders.find((folder) => folder.kind === "folder" && folder.id === id.slice("folder:".length))?.title || "文件夹";
  if (id === "agent-types" || id === "recent" || id === "unfiled" || id === "import" || id === "folders" || id === "visual") return AUXILIARY_DIRECTORY_LABELS[id];
  return DIRECTORY_LABELS[id as keyof typeof DIRECTORY_LABELS] || id;
}

export function LibraryDirectoryWorkbench(props: {
  projectTitle: string;
  tab: LibraryViewTab;
  directory: LibraryDirectoryId;
  searchQuery: string;
  items: LibraryListItem[];
  uncertainItems: LibraryUncertainItem[];
  classifiedProjection: ClassifiedAgentLibraryProjection | null;
  uncertainProjection: UncertainAgentLibraryProjection | null;
  customTypes: AgentTypeDefinition[];
  folders: WorkspaceFolder[];
  visualDocuments: Array<{ id: string; relativePath: string; title: string; type: VisualDocumentType }>;
  sourceImportCount: number;
  loading?: boolean;
  error?: string;
  onOpenObject(object: WorldObjectSummary): void;
  onOpenRelation?(relationId: string): void;
  onCreateObject(type?: WorldObjectType, agentTypeId?: string): void;
  onOpenImportReview(): void;
  onImportFile(file: File): Promise<void>;
  onCreateFolder(): void;
  onCreateVisual(type: VisualDocumentType): void;
  onOpenVisual(document: { id: string; relativePath: string; title: string; type: VisualDocumentType }): void;
  onCreateCustomCategory(title: string): Promise<void>;
  onRenameCustomCategory(id: string, title: string): Promise<void>;
  onMoveCustomCategory(id: string, direction: "up" | "down"): Promise<void>;
  onDeleteCustomCategory(id: string): Promise<void>;
  onOpenNavigation(): void;
  focusRequest?: number;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLElement>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryTitle, setEditingCategoryTitle] = useState("");
  const customCategories = props.folders.filter((folder) => folder.kind === "custom-category").sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const folders = props.folders.filter((folder) => folder.kind !== "custom-category");
  const hasSearch = Boolean(props.searchQuery.trim());
  const isAuxiliary = props.directory === "import" || props.directory === "folders" || props.directory === "visual";
  const title = hasSearch
    ? "搜索结果"
    : props.tab === "uncertain"
      ? "待确定"
      : libraryDirectoryLabel(props.directory, props.customTypes, props.folders);
  const count = props.tab === "uncertain"
    ? props.uncertainItems.length
    : isAuxiliary
      ? props.directory === "import"
        ? props.sourceImportCount
        : props.directory === "folders"
          ? props.folders.length
          : props.visualDocuments.length
      : props.items.length;
  const primary = primaryAction(props.directory, props.tab, hasSearch, props.customTypes);
  const emptyState = emptyStateFor(props.directory, props.tab, props.searchQuery, props.customTypes, props.folders);

  useEffect(() => {
    if ((props.focusRequest || 0) <= 0) return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [props.focusRequest]);

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = categoryDraft.trim();
    if (!title) return;
    void props.onCreateCustomCategory(title).then(() => {
      setCategoryDraft("");
      setCreatingCategory(false);
    });
  }

  return <section className="workbench library-directory-workbench" data-testid="library-directory-workbench">
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="资料"
      title={title}
      context={directoryContextLabel(props.directory, props.tab, props.searchQuery, count)}
      status={props.loading ? "正在读取" : "本地目录"}
      prototype="hub"
      icon={directoryIcon(props.directory, props.tab, hasSearch)}
      onOpenNavigation={props.onOpenNavigation}
      titleRef={headingRef}
      titleAsHeading
      titleTestId="library-directory-heading"
      actions={<>
        {primary.kind === "create" && <button type="button" className="primary-action" onClick={() => props.onCreateObject(primary.type, primary.agentTypeId)}><Plus />{primary.label}</button>}
        {primary.kind === "review" && <button type="button" className="primary-action" onClick={props.onOpenImportReview}><FileSearch />{primary.label}</button>}
        {primary.kind === "import" && <button type="button" className="primary-action" onClick={() => importRef.current?.click()}><Upload />{primary.label}</button>}
      </>}
    />

    <input ref={importRef} className="sr-only" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) void props.onImportFile(file);
    }} />

    {props.error && <p className="library-directory-error" role="alert">{props.error}</p>}
    {props.tab === "uncertain" && !isAuxiliary ? <div className="library-directory-content">
      <p className="library-directory-info-note">只读投影；候选必须在现有审核工作区处理。</p>
      <UncertainList items={props.uncertainItems} emptyState={emptyState} onOpenObject={props.onOpenObject} onOpenReview={props.onOpenImportReview} onOpenRelation={props.onOpenRelation} />
    </div>
      : isAuxiliary
        ? <AuxiliaryView
          directory={props.directory as Extract<LibraryDirectoryId, "import" | "folders" | "visual">}
          folders={folders}
          customCategories={customCategories}
          visualDocuments={props.visualDocuments}
          sourceImportCount={props.sourceImportCount}
          importRef={importRef}
          creatingCategory={creatingCategory}
          categoryDraft={categoryDraft}
          editingCategoryId={editingCategoryId}
          editingCategoryTitle={editingCategoryTitle}
          onSetCategoryDraft={setCategoryDraft}
          onSetCreatingCategory={setCreatingCategory}
          onSetEditingCategoryId={setEditingCategoryId}
          onSetEditingCategoryTitle={setEditingCategoryTitle}
          onSubmitCategory={submitCategory}
          onOpenImportReview={props.onOpenImportReview}
          onCreateFolder={props.onCreateFolder}
          onCreateVisual={props.onCreateVisual}
          onOpenVisual={props.onOpenVisual}
          onRenameCustomCategory={props.onRenameCustomCategory}
          onMoveCustomCategory={props.onMoveCustomCategory}
          onDeleteCustomCategory={props.onDeleteCustomCategory}
        />
      : <LibraryObjectList items={props.items} emptyState={emptyState} onOpenObject={props.onOpenObject} />}
  </section>;
}

function primaryAction(directory: LibraryDirectoryId, tab: LibraryViewTab, hasSearch: boolean, customTypes: AgentTypeDefinition[]): { kind: "create"; label: string; type?: WorldObjectType; agentTypeId?: string } | { kind: "review"; label: string } | { kind: "import"; label: string } | { kind: "none" } {
  if (directory === "agent-types" || directory === "import" || directory === "folders" || directory === "visual" || directory === "recent" || directory === "unfiled") return { kind: "none" };
  if (tab === "uncertain") return { kind: "review", label: "打开审核" };
  if (hasSearch || directory === "all") return { kind: "create", label: "新建资料" };
  if (directory === "character" || directory === "item" || directory === "location" || directory === "faction") {
    return { kind: "create", label: `新建${DIRECTORY_LABELS[directory]}`, type: directory === "faction" ? "faction" : directory };
  }
  if (directory.startsWith("agent:")) {
    const type = customTypes.find((candidate) => candidate.typeId === directory.slice("agent:".length) && candidate.status === "active");
    if (type) return { kind: "create", label: `新建${type.label}`, type: sourceTypeForCapability(type.baseCapability), agentTypeId: type.typeId };
  }
  return { kind: "create", label: "新建资料" };
}

function sourceTypeForCapability(capability: AgentTypeDefinition["baseCapability"]): WorldObjectType {
  return capability === "role" ? "character" : capability === "item" ? "item" : capability === "location" ? "location" : "faction";
}

type LibraryEmptyState = { icon: ReactNode; title: string; description: string };

function directoryIcon(directory: LibraryDirectoryId, tab: LibraryViewTab, hasSearch: boolean): ReactNode {
  if (hasSearch || tab === "uncertain") return <Search aria-hidden="true" />;
  if (directory === "import") return <FileSearch aria-hidden="true" />;
  if (directory === "recent") return <Archive aria-hidden="true" />;
  if (directory === "unfiled") return <Folder aria-hidden="true" />;
  if (directory === "folders") return <Folder aria-hidden="true" />;
  if (directory === "visual") return <Shapes aria-hidden="true" />;
  if (directory.startsWith("folder:")) return <Folder aria-hidden="true" />;
  if (directory.startsWith("agent:")) return <Sparkles aria-hidden="true" />;
  const Icon = DIRECTORY_ICONS[directory as keyof typeof DIRECTORY_ICONS] || Folder;
  return <Icon aria-hidden="true" />;
}

function directoryContextLabel(directory: LibraryDirectoryId, tab: LibraryViewTab, query: string, count: number): string {
  if (query.trim()) return `${count} 项资料 · “${query.trim()}”`;
  if (tab === "uncertain") return `${count} 项待审核`;
  if (directory === "recent") return `${count} 项最近更新`;
  if (directory === "unfiled") return `${count} 项未归档`;
  if (directory === "import") return `${count} 个来源`;
  if (directory === "visual") return `${count} 份文档`;
  if (directory === "folders") return `${count} 项整理`;
  if (directory.startsWith("folder:")) return `${count} 项资料`;
  return `${count} 项资料`;
}

function emptyStateFor(directory: LibraryDirectoryId, tab: LibraryViewTab, query: string, customTypes: AgentTypeDefinition[], folders: WorkspaceFolder[] = []): LibraryEmptyState {
  if (query.trim()) return { icon: <Search aria-hidden="true" />, title: "没有找到匹配资料", description: "试试缩短关键词，或换一种写法。" };
  if (tab === "uncertain") return { icon: <Search aria-hidden="true" />, title: "目前没有待确定内容", description: "新的识别候选或类型冲突会出现在这里。" };
  if (directory === "all") return { icon: <Folder aria-hidden="true" />, title: "这个作品还没有资料", description: "新建第一份资料，或从文稿中导入。" };
  if (directory === "recent") return { icon: <Archive aria-hidden="true" />, title: "还没有最近更新", description: "资料更新后会出现在这里。" };
  if (directory === "unfiled") return { icon: <Folder aria-hidden="true" />, title: "目前没有未归档资料", description: "新导入或尚未整理的资料会出现在这里。" };
  if (directory.startsWith("folder:")) {
    const label = libraryDirectoryLabel(directory, customTypes, folders);
    return { icon: <Folder aria-hidden="true" />, title: `“${label}”还没有资料`, description: "将资料归档到这个文件夹后，会出现在这里。" };
  }
  if (directory.startsWith("agent:")) {
    const label = customTypes.find((type) => type.typeId === directory.slice("agent:".length))?.label || "自定义类型";
    return { icon: <Sparkles aria-hidden="true" />, title: `这个${label}还没有资料`, description: "创建资料，或从“导入与审核”整理已有内容。" };
  }
  const label = libraryDirectoryLabel(directory, customTypes, folders);
  return { icon: directoryIcon(directory, tab, false), title: `还没有${label}`, description: `创建第一个${label}，或从“导入与审核”整理已有资料。` };
}

function EmptyStateView(props: { state: LibraryEmptyState }) {
  return <div className="library-directory-empty"><span className="library-directory-empty-icon">{props.state.icon}</span><strong>{props.state.title}</strong><small>{props.state.description}</small></div>;
}

function LibraryObjectList(props: { items: LibraryListItem[]; emptyState: LibraryEmptyState; onOpenObject(object: WorldObjectSummary): void }) {
  return <main className="library-directory-main" aria-label="资料列表" data-testid="library-directory-list">
    {props.items.length === 0 ? <EmptyStateView state={props.emptyState} /> : <div className="library-object-list" role="list">
      {props.items.map((item) => <button type="button" role="listitem" className="library-object-row" key={item.object.id} onClick={() => props.onOpenObject(item.object)} data-object-id={item.object.id}>
        <span className="library-object-icon"><ObjectIcon type={item.object.type} /></span>
        <span className="library-object-copy"><strong>{item.object.title}</strong><small>{item.typeLabel}{item.statusLabel ? ` · ${item.statusLabel}` : ""}{item.sourceLabel ? ` · ${item.sourceLabel}` : ""}</small></span>
        <span className="library-object-meta">{item.retired ? "类型已停用" : authorFacingObjectTags(item.object.tags).slice(0, 2).join(" · ")}</span>
      </button>)}
    </div>}
  </main>;
}

function UncertainList(props: { items: LibraryUncertainItem[]; emptyState: LibraryEmptyState; onOpenObject(object: WorldObjectSummary): void; onOpenReview(): void; onOpenRelation?(relationId: string): void }) {
  return <main className="library-directory-main" aria-label="待确定资料列表" data-testid="library-uncertain-list">
    {props.items.length === 0 ? <EmptyStateView state={props.emptyState} /> : <div className="library-object-list" role="list">
      {props.items.map((item) => <button type="button" role="listitem" className="library-object-row is-uncertain" key={`${item.kind}:${item.id}`} onClick={() => item.kind === "world-object" && item.object ? props.onOpenObject(item.object) : item.kind === "relation" ? props.onOpenRelation?.(item.relationId) : props.onOpenReview()}>
        <span className="library-object-icon"><Search /></span>
        <span className="library-object-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
        <span className="library-object-meta">{item.kind === "proposal" ? "候选审核" : item.kind === "relation" ? "关系候选" : "待确定"}</span>
      </button>)}
    </div>}
  </main>;
}

function AuxiliaryView(props: {
  directory: Extract<LibraryDirectoryId, "import" | "folders" | "visual">;
  folders: WorkspaceFolder[];
  customCategories: WorkspaceFolder[];
  visualDocuments: Array<{ id: string; relativePath: string; title: string; type: VisualDocumentType }>;
  sourceImportCount: number;
  importRef: RefObject<HTMLInputElement | null>;
  creatingCategory: boolean;
  categoryDraft: string;
  editingCategoryId: string | null;
  editingCategoryTitle: string;
  onSetCategoryDraft(value: string): void;
  onSetCreatingCategory(value: boolean): void;
  onSetEditingCategoryId(value: string | null): void;
  onSetEditingCategoryTitle(value: string): void;
  onSubmitCategory(event: FormEvent<HTMLFormElement>): void;
  onOpenImportReview(): void;
  onCreateFolder(): void;
  onCreateVisual(type: VisualDocumentType): void;
  onOpenVisual(document: { id: string; relativePath: string; title: string; type: VisualDocumentType }): void;
  onRenameCustomCategory(id: string, title: string): Promise<void>;
  onMoveCustomCategory(id: string, direction: "up" | "down"): Promise<void>;
  onDeleteCustomCategory(id: string): Promise<void>;
}) {
  if (props.directory === "import") return <main className="library-directory-main library-auxiliary-main" aria-label="导入与审核" data-testid="library-import-main">
    <div className="library-auxiliary-hero"><FileSearch /><div><h2>导入与审核</h2><p>先保留原文，再由作者决定是否提取候选。导入不会自动写入故事事实。</p></div></div>
    <div className="library-auxiliary-actions"><button type="button" className="primary-action" onClick={() => props.importRef.current?.click()}><Upload />导入 TXT / Markdown</button><button type="button" className="secondary-action" onClick={props.onOpenImportReview}><FileSearch />打开审核工作区{props.sourceImportCount ? ` · ${props.sourceImportCount}` : ""}</button></div>
    <details className="library-source-note"><summary>来源保全说明</summary><p>原文以只读来源修订保存；只有作者在审核工作区明确提取并决定，才会进入现有 Author Control。</p></details>
  </main>;
  if (props.directory === "visual") return <main className="library-directory-main library-auxiliary-main" aria-label="视觉文档" data-testid="library-visual-main">
    <div className="library-auxiliary-heading"><div><h2>视觉文档</h2><p>地图、画布、图谱和时间线继续由现有 VisualDocument owner 管理。</p></div><button type="button" className="primary-action" onClick={() => props.onCreateVisual("map")}><Plus />新建视觉文档</button></div>
    {props.visualDocuments.length ? <div className="library-auxiliary-list" role="list">{props.visualDocuments.map((document) => <button type="button" role="listitem" key={document.id} onClick={() => props.onOpenVisual(document)}><Shapes /><span><strong>{document.title}</strong><small>{visualLabel(document.type)}</small></span></button>)}</div> : <div className="library-directory-empty"><Shapes /><strong>还没有视觉文档</strong><small>从标题栏创建一份地图或其他现有视觉文档。</small></div>}
  </main>;
  return <main className="library-directory-main library-auxiliary-main" aria-label="文件夹与分类" data-testid="library-folders-main">
    <div className="library-auxiliary-heading"><div><h2>文件夹与分类</h2><p>文件夹和自定义资料分类仍属于现有 workspace layout owner，不是 Agent Type。</p></div><div className="library-auxiliary-actions"><button type="button" className="primary-action" onClick={props.onCreateFolder}><FolderPlus />新建文件夹</button><button type="button" className="secondary-action" onClick={() => props.onSetCreatingCategory(true)}><Plus />新建分类</button></div></div>
    {props.creatingCategory && <form className="library-category-form" onSubmit={props.onSubmitCategory}><input autoFocus value={props.categoryDraft} onChange={(event) => props.onSetCategoryDraft(event.target.value)} placeholder="分类名称" aria-label="自定义资料分类名称" /><button type="submit" className="primary-action">保存</button><button type="button" className="secondary-action" onClick={() => props.onSetCreatingCategory(false)}>取消</button></form>}
    {props.customCategories.length > 0 && <section className="library-auxiliary-section"><header><strong>自定义资料分类</strong><small>{props.customCategories.length}</small></header>{props.customCategories.map((folder, index) => <div className="library-managed-row" key={folder.id}>{props.editingCategoryId === folder.id ? <form className="library-category-form" onSubmit={(event) => { event.preventDefault(); const title = props.editingCategoryTitle.trim(); if (title) void props.onRenameCustomCategory(folder.id, title).then(() => props.onSetEditingCategoryId(null)); }}><input autoFocus value={props.editingCategoryTitle} onChange={(event) => props.onSetEditingCategoryTitle(event.target.value)} aria-label="重命名自定义资料分类" /><button type="submit" className="primary-action">保存</button></form> : <><Folder /><strong>{folder.title}</strong><div><button type="button" className="icon-action" aria-label={`重命名${folder.title}`} onClick={() => { props.onSetEditingCategoryId(folder.id); props.onSetEditingCategoryTitle(folder.title); }}><Pencil /></button><button type="button" className="icon-action" aria-label={`上移${folder.title}`} disabled={index === 0} onClick={() => void props.onMoveCustomCategory(folder.id, "up")}><ChevronDown className="is-up" /></button><button type="button" className="icon-action" aria-label={`下移${folder.title}`} disabled={index === props.customCategories.length - 1} onClick={() => void props.onMoveCustomCategory(folder.id, "down")}><ChevronDown /></button><button type="button" className="icon-action" aria-label={`删除${folder.title}`} onClick={() => void props.onDeleteCustomCategory(folder.id)}><X /></button></div></>}</div>)}</section>}
    {props.folders.length > 0 && <section className="library-auxiliary-section"><header><strong>文件夹</strong><small>{props.folders.length}</small></header>{props.folders.map((folder) => <div className="library-managed-row is-readonly" key={folder.id}><Folder /><strong>{folder.title}</strong><small>资料文件夹</small></div>)}</section>}
    {!props.customCategories.length && !props.folders.length && <div className="library-directory-empty"><Archive /><strong>还没有文件夹或分类</strong><small>需要整理时再从这里创建，不会改变 Agent Type Catalog。</small></div>}
  </main>;
}

function ObjectIcon(props: { type: WorldObjectType }) {
  const Icon = props.type === "character" ? UserRound : props.type === "item" ? Package : props.type === "location" ? Map : props.type === "faction" ? UsersRound : Folder;
  return <Icon aria-hidden="true" />;
}

function visualLabel(type: VisualDocumentType): string {
  return type === "map" ? "地图" : type === "graph" ? "关系图谱" : type === "canvas" ? "资料画布" : type === "timeline" ? "时间线" : "Tree";
}
