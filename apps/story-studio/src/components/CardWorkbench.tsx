import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  GitFork,
  GripVertical,
  Image,
  ImagePlus,
  ListTree,
  LayoutPanelLeft,
  LayoutPanelTop,
  Link2,
  Map,
  Network,
  PanelTop,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Shapes,
  Sparkles,
  Tags,
  Trash2,
  X
} from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  appendStoryCardSection,
  listUnplacedStoryCardSections,
  nextStoryCardSectionId,
  readStoryCardContent,
  replaceStoryCardContent
} from "../../../../src/storyCardPresentation/storyCardSectionAnchors";
import { convertCharacterProperty } from "../../../../src/storyCardPresentation/characterProperties";

import {
  visualAssetUrl,
  type ObjectCardBlock,
  type ObjectCardBlockType,
  type ObjectCardComposition,
  type ObjectVisualReference,
  type VisualAsset,
  type VisualDocumentType,
  type WorldObject,
  type AgentTypeDefinition,
  type WorldObjectSummary,
  type CharacterProperty,
  type CharacterPropertyType,
  type CardTemplate,
  type CharacterTemplateDiff
  , type TianyiObjectContextRef
} from "../lib/localTransport";
import { writeTianyiObjectContextDrag } from "./tianyiObjectContext";
import type { StoryStudioEventReference } from "../../../../src/storyContracts/storyStudioEventReference";
import type { StoryStudioObjectProfile } from "../../../../src/storyContracts/storyStudioObjectProfile.ts";
import { objectTypeLabel } from "../worldObjectCatalog";
import { DocumentHeaderActions } from "./DocumentHeaderActions";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { CharacterProjectionBlock, CharacterStoryReferenceSummary, RelationGroupBlock } from "./CharacterWorldProjectionBlocks";
import { WorldDocumentTabs, type WorldDocumentTab } from "./WorldDocumentTabs";
import { AgentTypeObjectBinding } from "./AgentTypeObjectBinding";
import { ObjectProfileEditor, createEmptyObjectProfile } from "./ObjectProfileEditor";
import { ItemHolderProjection, LocationTopologyProjection } from "./LocationTopologyProjection";

export type ObjectDraft = {
  title: string;
  status: string;
  tags: string;
  aliases: string;
  subtype: string;
  typedProperties: CharacterProperty[];
  profile: StoryStudioObjectProfile | null;
  body: string;
  card: ObjectCardComposition;
};

export type ObjectAuthorityMode = "ordinary" | "planning-event" | "verified-canon" | "canon-verification-unavailable" | "invalid-canon-claim";

type SaveState = "saved" | "unsaved" | "saving" | "conflict";

const blockCatalog: Array<{ type: ObjectCardBlockType; label: string; description: string; icon: ReactNode }> = [
  { type: "text", label: "文本", description: "角色正文与故事设定", icon: <FileText /> },
  { type: "secret", label: "秘密", description: "仅完整卡片显示的 Markdown 秘密", icon: <EyeOff /> },
  { type: "character-arc", label: "角色弧线", description: "可重复的 Markdown 角色弧线", icon: <RefreshCw /> },
  { type: "property-group", label: "属性组", description: "稳定分组与有序属性键", icon: <ListTree /> },
  { type: "relation-group", label: "关系组", description: "只读投影已确认 Graph 关系", icon: <GitFork /> },
  { type: "properties", label: "属性", description: "状态、标签与别名", icon: <Settings2 /> },
  { type: "media", label: "媒体", description: "本地图片与视觉参考", icon: <Image /> },
  { type: "connections", label: "关系", description: "链接与被引用资料", icon: <Link2 /> },
  { type: "map", label: "地图", description: "出现于哪些地图文档", icon: <Map /> },
  { type: "graph", label: "图谱", description: "出现于哪些关系图谱", icon: <GitFork /> },
  { type: "timeline", label: "时间线", description: "出现于哪些正史时间线", icon: <Clock3 /> },
  { type: "tree", label: "树", description: "出现于哪些关系树", icon: <Network /> },
  { type: "canvas", label: "画布", description: "出现于哪些画布", icon: <Shapes /> }
];

export function CardWorkbench(props: {
  projectId: string;
  projectTitle: string;
  object: WorldObject | null;
  objects: WorldObjectSummary[];
  relations: import("../lib/localTransport").RelationRecord[];
  visualDocuments: Array<{ id: string; relativePath: string; title: string; type: VisualDocumentType }>;
  templates: CardTemplate[];
  tabs: WorldDocumentTab[];
  draft: ObjectDraft | null;
  saveState: SaveState;
  conflictKind: "markdown" | "presentation" | "partial" | null;
  conflictObject: WorldObject | null;
  authorityMode: ObjectAuthorityMode;
  agentTypes: AgentTypeDefinition[];
  agentTypeBusy: boolean;
  agentTypeError: string;
  onDraft(value: ObjectDraft): void;
  onSave(): void;
  onSaveAgentType(input: { agentTypeId: string | null; fieldValues: Record<string, string | number | boolean | null> }): Promise<void>;
  onReloadConflict(): void;
  onOpenObject(object: WorldObjectSummary): void;
  onOpenRelation(relationId: string): void;
  onOpenWorldTab(tab: WorldDocumentTab): void;
  onCloseWorldTab(tab: WorldDocumentTab): void;
  onOpenVisualReference(reference: ObjectVisualReference, context?: { objectId: string; source: "map-marker" | "graph-node" | "graph-edge" | "canvas-node" | "timeline-event" | "tree-node"; documentId: string; blockId?: string | null; relationId?: string | null }): void;
  onImportImage(file: File): Promise<VisualAsset>;
  onCreateObject(): void;
  onCreateVisual(type: VisualDocumentType): void;
  onCreateFolder(): void;
  onRevisionHistory(): void;
  onSaveTemplate(label: string): Promise<CardTemplate>;
  onPreviewTemplate(template: CardTemplate): Promise<CharacterTemplateDiff>;
  onApplyTemplate(template: CardTemplate): Promise<void>;
  onTemplateHistory(template: CardTemplate): void;
  onAbandonPlanning(object: WorldObject): void;
  onDuplicateObject(): void;
  onArchiveObject(): void;
  onRestoreObject(): void;
  onDeleteObject(): void;
  onPlanningLifecycle(action: "pause" | "resume" | "abandon"): void;
  onCloseDocument(): void;
  onOpenLibrary(): void;
  onMode(mode: "library" | VisualDocumentType): void;
  onOpenRules(): void;
  tianyiContextRef: TianyiObjectContextRef | null;
  eventReference: StoryStudioEventReference | null;
  onGiveToTianyi(ref: TianyiObjectContextRef): void;
  onGiveEventToTianyi(reference: StoryStudioEventReference): void;
  onOpenCharacterState?(): void;
}) {
  const object = props.object;
  const draft = props.draft;
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [assetError, setAssetError] = useState("");
  const [assetBusy, setAssetBusy] = useState(false);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(props.templates[0]?.id || "");
  const [templateDiff, setTemplateDiff] = useState<CharacterTemplateDiff | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function updateCard(card: ObjectCardComposition) {
    if (draft) props.onDraft({ ...draft, card });
  }

  function addBlock(type: ObjectCardBlockType) {
    if (!draft || (object?.type !== "character" && (type === "secret" || type === "character-arc" || type === "property-group" || type === "relation-group"))) return;
    if (!(["text", "secret", "character-arc", "property-group", "relation-group"] as ObjectCardBlockType[]).includes(type) && draft.card.blocks.some((block) => block.kind === type)) return;
    let body = draft.body;
    let contentRef: string | undefined;
    if (type === "text" || type === "secret" || type === "character-arc") {
      const sectionId = nextStoryCardSectionId(body, type);
      body = appendStoryCardSection(body, { id: sectionId, kind: type });
      contentRef = `markdown-section.${sectionId}`;
    }
    const block: ObjectCardBlock = {
      id: nextBlockInstanceId(draft.card.objectId, type, draft.card.blocks.map((item) => item.id)),
      kind: type,
      ...(contentRef ? { contentRef } : type === "property-group" ? { label: "新属性组", propertyKeys: [] } : type === "relation-group" ? { label: "核心关系", relationConfig: { sourceDocumentIds: [], directions: [], relationTypes: [], edgeIds: [] } } : { presentationRef: presentationRefFor(type) }),
      collapsed: type === "secret",
      size: type === "text" || type === "character-arc" ? "large" : "medium"
    };
    props.onDraft({ ...draft, body, card: { ...draft.card, blocks: [...draft.card.blocks, block] } });
  }

  function removeBlock(blockId: string) {
    if (!draft || draft.card.blocks.length === 1) return;
    updateCard({ ...draft.card, blocks: draft.card.blocks.filter((block) => block.id !== blockId) });
  }

  function reorderBlock(targetId: string) {
    if (!draft || !draggedBlock || draggedBlock === targetId) return;
    const dragged = draft.card.blocks.find((block) => block.id === draggedBlock);
    if (!dragged) return;
    const blocks = draft.card.blocks.filter((block) => block.id !== draggedBlock);
    const targetIndex = blocks.findIndex((block) => block.id === targetId);
    blocks.splice(targetIndex, 0, dragged);
    updateCard({ ...draft.card, blocks });
    setDraggedBlock(null);
  }

  function updateBlock(blockId: string, patch: Partial<Pick<ObjectCardBlock, "collapsed" | "size">>) {
    if (!draft) return;
    updateCard({ ...draft.card, blocks: draft.card.blocks.map((block) => block.id === blockId ? { ...block, ...patch } : block) });
  }

  function replaceBlock(block: ObjectCardBlock) {
    if (!draft) return;
    updateCard({ ...draft.card, blocks: draft.card.blocks.map((item) => item.id === block.id ? block : item) });
  }

  function moveBlock(blockId: string, direction: -1 | 1) {
    if (!draft) return;
    const index = draft.card.blocks.findIndex((block) => block.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.card.blocks.length) return;
    const blocks = [...draft.card.blocks];
    const [block] = blocks.splice(index, 1);
    blocks.splice(target, 0, block);
    updateCard({ ...draft.card, blocks });
  }

  async function importImage(file: File, target: "portrait" | "cover" | "media") {
    if (!draft) return;
    setAssetBusy(true);
    setAssetError("");
    try {
      const asset = await props.onImportImage(file);
      const mediaAssets = [...new Set([...draft.card.visual.mediaAssets, asset.relativePath])];
      updateCard({
        ...draft.card,
        visual: { ...draft.card.visual, mediaAssets },
        ...(target === "cover" ? { cover: { assetRef: asset.relativePath, fit: "cover" as const, position: { x: 0.5, y: 0.5 } } } : {}),
        ...(target === "portrait" ? { portrait: { assetRef: asset.relativePath, fit: "cover" as const, position: { x: 0.5, y: 0.5 } } } : {})
      });
    } catch (cause) {
      setAssetError(cause instanceof Error ? cause.message : "无法导入图片。");
    } finally {
      setAssetBusy(false);
    }
  }

  return <section className="workbench object-card-workbench">
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="资料" title={object?.title || "世界资料"} context={object ? "当前资料对象" : "尚未选择资料"} status="本地保存" prototype="editor" icon={<BookOpen />} onOpenNavigation={props.onOpenLibrary} actions={<>{props.tianyiContextRef && <button type="button" draggable onDragStart={(event) => writeTianyiObjectContextDrag(event.dataTransfer, props.tianyiContextRef!)} onClick={() => props.onGiveToTianyi(props.tianyiContextRef!)}><Sparkles />问天意</button>}{props.eventReference && <button type="button" onClick={() => props.onGiveEventToTianyi(props.eventReference!)}><Sparkles />问天意</button>}<div className="library-mode-switch" role="group" aria-label="资料模式"><span aria-current="page">资料库</span><button type="button" onClick={props.onOpenRules}>规则管理</button></div><details className="document-launcher"><summary>资料库视图</summary><div><button type="button" className="is-active" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("library"); }}>资料卡片</button><button type="button" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("map"); }}><Map />地图</button><button type="button" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("graph"); }}><GitFork />图谱</button><button type="button" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("canvas"); }}><LayoutPanelTop />资料画布</button><button type="button" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("timeline"); }}><Clock3 />时间线</button><button type="button" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("tree"); }}><Network />树</button></div></details><select className="mobile-document-select mobile-only" aria-label="世界文档" value="library" onChange={(event) => props.onMode(event.target.value as "library" | "map" | "graph" | "canvas" | "timeline" | "tree")}><option value="library">资料卡片</option><option value="map">地图</option><option value="graph">图谱</option><option value="canvas">资料画布</option><option value="timeline">时间线</option><option value="tree">树</option></select></>} />

    <WorldDocumentTabs tabs={props.tabs} activeId={object?.id || null} onOpen={props.onOpenWorldTab} onClose={props.onCloseWorldTab} onCreateObject={props.onCreateObject} onCreateVisual={props.onCreateVisual} onCreateFolder={props.onCreateFolder} />

    {!object || !draft ? <article className="world-empty-state" data-testid="world-empty-state">
      <span className="empty-symbol"><PanelTop /></span>
      <p className="eyebrow">世界资料</p>
      <h1>资料库还没有内容</h1>
      <p>从角色、地点、物品、事件、规则或伏笔开始。</p>
      <button type="button" className="primary-action" onClick={props.onCreateObject}><Plus />新建资料</button>
    </article> : <article className={`object-card-document is-${draft.card.layout}`} data-testid="card-editor" data-object-source={object.source} data-object-id={object.id} data-authority-mode={props.authorityMode}>
      <DocumentHeaderActions
        title={draft.title}
        typeLabel={`${objectTypeLabel(object.type)}卡片`}
        saveState={props.saveState}
        saveLabel={saveStateLabel(props.saveState)}
        tutorial="用内容块组织正文、属性、媒体与跨视图引用。所有正文仍保存在这张卡片的 Markdown 中。"
        onRevisionHistory={props.onRevisionHistory}
        onClose={props.onCloseDocument}
        onOpenLibrary={props.onOpenLibrary}
      />
      <div className="object-lifecycle-actions" aria-label="资料生命周期操作">
        <button type="button" onClick={props.onDuplicateObject}>复制资料</button>
        {object.status === "archived"
          ? <button type="button" onClick={props.onRestoreObject}>恢复资料</button>
          : <button type="button" onClick={props.onArchiveObject}>归档资料</button>}
        <button type="button" className="danger-action" onClick={() => setConfirmDelete(true)}>删除资料</button>
      </div>
      <div className="card-status-region">
      {props.saveState === "conflict" && <div className="conflict-banner" role="alert">
        <AlertTriangle /><div><strong>{props.conflictKind === "presentation" || props.conflictKind === "partial" ? "卡片构成已在磁盘中变化" : "角色内容已在磁盘中变化"}</strong><p>{props.conflictKind === "partial" ? "角色内容已经保存，但卡片构成发生冲突；新内容保留在未放置内容中。" : props.conflictKind === "presentation" ? "角色 Markdown 未被改写。重新读取后可再次调整卡片构成。" : "你的卡片文字尚未写入。重新读取不会覆盖磁盘版本。"}</p></div>
        <button type="button" onClick={props.onReloadConflict}>重新读取磁盘版本</button>
      </div>}

      {draft.card.diagnostics.length > 0 && <div className="card-diagnostic-list" role="status" data-testid="card-diagnostics">{draft.card.diagnostics.map((diagnostic, index) => <p key={`${diagnostic.code}-${diagnostic.blockId || diagnostic.sectionId || index}`}><AlertTriangle />{diagnostic.message}</p>)}</div>}
      {props.authorityMode !== "ordinary" && <div className={`card-authority-boundary is-${props.authorityMode}`} role={props.authorityMode === "invalid-canon-claim" ? "alert" : "note"} data-testid="card-authority-boundary">
        <AlertTriangle /><span><strong>{authorityModeLabel(props.authorityMode)}</strong><small>{authorityModeDescription(props.authorityMode)}</small></span>
      </div>}
      </div>

      <header className="object-card-toolbar">
        <div className="card-status-summary" data-testid="card-status-summary">
          <span>{objectTypeLabel(object.type)} · {saveStateLabel(props.saveState)}</span>
          {draft.card.source === "virtual-v1" && <details className="card-migration-details" data-testid="card-migration-notice"><summary>v1 虚拟构成</summary><div><RefreshCw /><span>显式保存后才会创建独立卡片文件，并清理旧表现字段。</span></div></details>}
          {draft.card.migration.cleanupPending && draft.card.source === "presentation-json" && <details className="card-migration-details" role="status"><summary>字段清理待完成</summary><div><AlertTriangle /><span>重新载入后保存可安全重试；角色内容不会回滚。</span></div></details>}
        </div>
        <div className="object-card-tools">
          <div className="segmented-control" aria-label="卡片方向">
            <button type="button" className={draft.card.layout === "horizontal" ? "is-active" : ""} onClick={() => updateCard({ ...draft.card, layout: "horizontal" })} title="横向卡片"><LayoutPanelLeft /></button>
            <button type="button" className={draft.card.layout === "vertical" ? "is-active" : ""} onClick={() => updateCard({ ...draft.card, layout: "vertical" })} title="纵向卡片"><LayoutPanelTop /></button>
          </div>
          <details className="block-add-menu">
            <summary><Plus />添加内容</summary>
            <div>{blockCatalog.map((item) => <button type="button" disabled={(!(["text", "secret", "character-arc", "property-group", "relation-group"] as ObjectCardBlockType[]).includes(item.type) && draft.card.blocks.some((block) => block.kind === item.type)) || ((item.type === "secret" || item.type === "character-arc" || item.type === "property-group" || item.type === "relation-group") && object.type !== "character")} onClick={() => addBlock(item.type)} key={item.type}>{item.icon}<span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>
          </details>
          {object.type === "character" && props.onOpenCharacterState && <button type="button" className="secondary-action" onClick={props.onOpenCharacterState} data-testid="open-character-state"><Clock3 />当前状态</button>}
          {object.type === "character" && <button type="button" className="secondary-action" onClick={() => { setTemplateOpen((current) => !current); setTemplateError(""); }} data-testid="toggle-card-templates"><ListTree />本地模板</button>}
          <button type="button" className="primary-action save-action" disabled={props.saveState === "saved" || props.saveState === "saving" || props.saveState === "conflict" || !draft.title.trim()} onClick={props.onSave} data-testid="save-object">
            {props.saveState === "saving" ? <RefreshCw className="spin" /> : <Save />}{props.saveState === "saved" ? "已保存" : "保存卡片"}
          </button>
          {object.type === "event" && object.tags.includes("作者规划") && !object.tags.includes("作者确认") && <>
            {object.status === "planned" && <button type="button" className="secondary-action" onClick={() => props.onPlanningLifecycle("pause")}>暂停故事可能</button>}
            {(object.status === "paused" || object.status === "abandoned") && <button type="button" className="secondary-action" onClick={() => props.onPlanningLifecycle("resume")}>恢复故事可能</button>}
            {object.status === "planned" && <button type="button" className="secondary-action" onClick={() => setConfirmAbandon(true)}>放弃故事可能</button>}
          </>}
        </div>
      </header>
      {templateOpen && object.type === "character" && <CharacterTemplatePanel
        templates={props.templates}
        selectedTemplateId={selectedTemplateId}
        label={templateLabel}
        diff={templateDiff}
        busy={templateBusy}
        error={templateError}
        onSelect={(value) => { setSelectedTemplateId(value); setTemplateDiff(null); }}
        onLabel={setTemplateLabel}
        onSave={async () => {
          if (!templateLabel.trim()) return;
          setTemplateBusy(true); setTemplateError("");
          try { const saved = await props.onSaveTemplate(templateLabel.trim()); setSelectedTemplateId(saved.id); setTemplateLabel(""); }
          catch (cause) { setTemplateError(cause instanceof Error ? cause.message : "无法保存模板。"); }
          finally { setTemplateBusy(false); }
        }}
        onPreview={async () => {
          const selected = props.templates.find((template) => template.id === selectedTemplateId);
          if (!selected) return;
          setTemplateBusy(true); setTemplateError("");
          try { setTemplateDiff(await props.onPreviewTemplate(selected)); }
          catch (cause) { setTemplateError(cause instanceof Error ? cause.message : "无法预览模板差异。"); }
          finally { setTemplateBusy(false); }
        }}
        onApply={async () => {
          const selected = props.templates.find((template) => template.id === selectedTemplateId);
          if (!selected || !templateDiff) return;
          setTemplateBusy(true); setTemplateError("");
          try { await props.onApplyTemplate(selected); setTemplateDiff(null); }
          catch (cause) { setTemplateError(cause instanceof Error ? cause.message : "无法应用模板。"); }
          finally { setTemplateBusy(false); }
        }}
        onHistory={() => { const selected = props.templates.find((template) => template.id === selectedTemplateId); if (selected) props.onTemplateHistory(selected); }}
      />}
      {confirmAbandon && <div className="object-card-abandon-confirm" role="dialog" aria-label="放弃规划确认"><span>放弃会保留这份事件 Markdown、正文和历史，只把它标记为已放弃。</span><button type="button" onClick={() => setConfirmAbandon(false)}>取消</button><button type="button" className="primary-action" onClick={() => { setConfirmAbandon(false); props.onPlanningLifecycle("abandon"); }}>确认放弃规划</button></div>}
      {confirmDelete && <div className="object-card-abandon-confirm" role="dialog" aria-label="删除资料确认"><span>删除会移除这份资料及其本地修订记录。{object.backlinks.length || object.visualReferences.length ? `受影响引用：${[...object.backlinks.map((item) => item.title), ...object.visualReferences.map((item) => item.title)].join("、")}。这些引用不会被静默改写，之后会显示为缺失引用。` : "当前没有检测到资料或视觉文档引用。"}</span><button type="button" onClick={() => setConfirmDelete(false)}>取消</button><button type="button" className="danger-action" onClick={() => { setConfirmDelete(false); props.onDeleteObject(); }}>确认删除</button></div>}

      <div className="object-card-stage">
        <aside className="object-identity-panel">
          <div className="identity-image-stack">
            <CardIdentityImage label="角色肖像" image={draft.card.portrait} projectId={props.projectId} title={draft.title} busy={assetBusy} onImport={(file) => void importImage(file, "portrait")} onChange={(image) => updateCard({ ...draft.card, portrait: image })} />
            <CardIdentityImage label="卡片封面" image={draft.card.cover} projectId={props.projectId} title={draft.title} busy={assetBusy} onImport={(file) => void importImage(file, "cover")} onChange={(image) => updateCard({ ...draft.card, cover: image })} />
            {draft.card.portrait && draft.card.cover?.assetRef !== draft.card.portrait.assetRef && <button type="button" className="secondary-action reuse-identity-image" onClick={() => updateCard({ ...draft.card, cover: { ...draft.card.portrait!, position: { ...draft.card.portrait!.position } } })}>将角色肖像同时用于封面</button>}
          </div>
          <div className="object-identity-copy">
            <p className="eyebrow">{objectTypeLabel(object.type)}</p>
            <input className="card-title-input" value={draft.title} maxLength={80} onChange={(event) => props.onDraft({ ...draft, title: event.target.value })} aria-label="条目标题" />
            <p className="object-id-copy" data-object-id={object.id}>{displayObjectId(object.id)}</p>
            {object.type === "character" && <label className="identity-subtype-field localized-enum-field"><span>角色子类型</span><span className="localized-enum-preview" aria-hidden="true">{displayEnumLabel(draft.subtype) || "未填写"}</span><input value={draft.subtype} maxLength={80} onChange={(event) => props.onDraft({ ...draft, subtype: event.target.value })} placeholder="例如：调查者" /></label>}
            <div className="identity-chip-row">{splitDraftList(draft.aliases).map((alias) => <span key={alias}>{alias}</span>)}</div>
          </div>
          {assetError && <p className="inline-error" role="alert">{assetError}</p>}
        </aside>

        <section className="object-block-list" aria-label="卡片内容块">
          {draft.card.blocks.map((block) => <CardBlockShell
            key={block.id}
            block={block}
            removable={draft.card.blocks.length > 1}
            onRemove={() => removeBlock(block.id)}
            onDuplicate={block.kind === "text" || block.kind === "secret" || block.kind === "character-arc" || block.kind === "relation-group" ? () => addBlock(block.kind) : null}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onCollapse={() => updateBlock(block.id, { collapsed: !block.collapsed })}
            onSize={(size) => updateBlock(block.id, { size })}
            onDragStart={() => setDraggedBlock(block.id)}
            onDrop={() => reorderBlock(block.id)}
          >
            {block.kind === "text" && <TextBlock block={block} draft={draft} onDraft={props.onDraft} />}
            {block.kind === "secret" && <TextBlock block={block} draft={draft} onDraft={props.onDraft} />}
            {block.kind === "character-arc" && <TextBlock block={block} draft={draft} onDraft={props.onDraft} />}
            {block.kind === "property-group" && <CharacterPropertyGroup block={block} draft={draft} objects={props.objects} onDraft={props.onDraft} />}
            {block.kind === "relation-group" && <RelationGroupBlock block={block} object={object} visualDocuments={props.visualDocuments} onChange={replaceBlock} onOpen={props.onOpenVisualReference} />}
            {block.kind === "properties" && <PropertiesBlock draft={draft} object={object} relations={props.relations} objects={props.objects} authorityMode={props.authorityMode} agentTypes={props.agentTypes} agentTypeBusy={props.agentTypeBusy} agentTypeError={props.agentTypeError} onSaveAgentType={props.onSaveAgentType} onDraft={props.onDraft} onOpenObject={props.onOpenObject} onOpenRelation={props.onOpenRelation} />}
            {block.kind === "connections" && <><ConnectionsBlock object={object} onOpenObject={props.onOpenObject} /><CharacterStoryReferenceSummary object={object} objects={props.objects} onOpenObject={props.onOpenObject} /></>}
            {block.kind === "media" && <MediaBlock projectId={props.projectId} draft={draft} busy={assetBusy} onImport={(file) => void importImage(file, "media")} onDraft={props.onDraft} />}
            {block.kind === "map" && <ObjectProjectionBlock type="map" object={object} objects={props.objects} onOpen={props.onOpenVisualReference} onOpenObject={props.onOpenObject} />}
            {block.kind === "graph" && <ObjectProjectionBlock type="graph" object={object} objects={props.objects} onOpen={props.onOpenVisualReference} onOpenObject={props.onOpenObject} />}
            {block.kind === "timeline" && <ObjectProjectionBlock type="timeline" object={object} objects={props.objects} onOpen={props.onOpenVisualReference} onOpenObject={props.onOpenObject} />}
            {block.kind === "tree" && <ObjectProjectionBlock type="tree" object={object} objects={props.objects} onOpen={props.onOpenVisualReference} onOpenObject={props.onOpenObject} />}
            {block.kind === "canvas" && <ObjectProjectionBlock type="canvas" object={object} objects={props.objects} onOpen={props.onOpenVisualReference} onOpenObject={props.onOpenObject} />}
          </CardBlockShell>)}
          {listUnplacedStoryCardSections(draft.body, draft.card.blocks.flatMap((block) => block.contentRef ? [block.contentRef] : [])).length > 0 && <section className="unplaced-card-content" data-testid="unplaced-card-content"><header><FileText /><strong>未放置内容</strong></header>{listUnplacedStoryCardSections(draft.body, draft.card.blocks.flatMap((block) => block.contentRef ? [block.contentRef] : [])).map((section) => <div key={section.id}><span>{section.kind === "secret" ? "秘密" : section.kind === "character-arc" ? "角色弧线" : "正文"}</span><strong>{section.heading}</strong><button type="button" onClick={() => {
            const block: ObjectCardBlock = { id: nextBlockInstanceId(draft.card.objectId, section.kind, draft.card.blocks.map((item) => item.id)), kind: section.kind, contentRef: `markdown-section.${section.id}`, collapsed: section.kind === "secret", size: section.kind === "text" || section.kind === "character-arc" ? "large" : "medium" };
            updateCard({ ...draft.card, blocks: [...draft.card.blocks, block] });
          }}>添加到卡片</button></div>)}</section>}
          {draft.typedProperties.some((property) => !draft.card.blocks.some((block) => block.kind === "property-group" && block.propertyKeys?.includes(property.key))) && <section className="unplaced-card-content" data-testid="unplaced-properties"><header><ListTree /><strong>未放置属性</strong></header>{draft.typedProperties.filter((property) => !draft.card.blocks.some((block) => block.kind === "property-group" && block.propertyKeys?.includes(property.key))).map((property) => <div key={property.key}><span>{property.type}</span><strong>{property.label}</strong><button type="button" onClick={() => {
            const firstGroup = draft.card.blocks.find((block) => block.kind === "property-group");
            if (firstGroup) updateCard({ ...draft.card, blocks: draft.card.blocks.map((block) => block.id === firstGroup.id ? { ...block, propertyKeys: [...(block.propertyKeys || []), property.key] } : block) });
            else addBlock("property-group");
          }}>加入属性组</button></div>)}</section>}
        </section>
      </div>
    </article>}
  </section>;
}

function CardBlockShell(props: {
  block: ObjectCardBlock;
  removable: boolean;
  children: ReactNode;
  onRemove(): void;
  onDuplicate: (() => void) | null;
  onMoveUp(): void;
  onMoveDown(): void;
  onCollapse(): void;
  onSize(size: ObjectCardBlock["size"]): void;
  onDragStart(): void;
  onDrop(): void;
}) {
  const item = blockCatalog.find((entry) => entry.type === props.block.kind)!;
  return <section className={`object-card-block is-${props.block.size} ${props.block.collapsed ? "is-collapsed" : ""}`} data-block-type={props.block.kind} data-block-id={props.block.id} draggable onDragStart={props.onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={props.onDrop}>
    <header><span className="block-drag-handle" title="拖动排序"><GripVertical /></span>{item.icon}<strong>{item.label}</strong><span className="block-description">{item.description}</span><select aria-label={`${item.label}区块尺寸`} value={props.block.size} onChange={(event) => props.onSize(event.target.value as ObjectCardBlock["size"])}><option value="small">紧凑</option><option value="medium">标准</option><option value="large">宽幅</option></select><button type="button" className="icon-action block-move-action" onClick={props.onMoveUp} aria-label={`上移${item.label}块`}><ArrowUp /></button><button type="button" className="icon-action block-move-action" onClick={props.onMoveDown} aria-label={`下移${item.label}块`}><ArrowDown /></button>{props.onDuplicate && <button type="button" className="icon-action" onClick={props.onDuplicate} aria-label={`复制${item.label}块`} title="复制为空白区块"><Copy /></button>}<button type="button" className="icon-action" onClick={props.onCollapse} aria-label={`${props.block.collapsed ? "展开" : "收起"}${item.label}块`}>{props.block.collapsed ? <Eye /> : <EyeOff />}</button><button type="button" className="icon-action" disabled={!props.removable} onClick={props.onRemove} aria-label={`移除${item.label}块`}><Trash2 /></button></header>
    {!props.block.collapsed && <div className="object-card-block-body">{props.children}</div>}
  </section>;
}

function TextBlock(props: { block: ObjectCardBlock; draft: ObjectDraft; onDraft(value: ObjectDraft): void }) {
  const contentRef = props.block.contentRef || "";
  const content = readStoryCardContent(props.draft.body, contentRef);
  if (!content.found) return <div className="missing-card-content" role="status"><AlertTriangle /><strong>引用的 Markdown 内容不存在</strong><p>{contentRef} 会保留在卡片中，修复锚点后可继续编辑。</p></div>;
  const label = props.block.kind === "secret" ? "Markdown 秘密" : props.block.kind === "character-arc" ? content.section?.heading || "Markdown 角色弧线" : content.section?.heading || "Markdown 正文";
  return <label className="object-text-editor"><span>{label}</span><textarea value={content.content} onChange={(event) => props.onDraft({ ...props.draft, body: replaceStoryCardContent(props.draft.body, contentRef, event.target.value) })} spellCheck data-testid={props.block.kind === "secret" ? "secret-editor" : props.block.kind === "character-arc" ? "character-arc-editor" : "markdown-editor"} /><small>{props.block.kind === "secret" ? "秘密正文只保存在角色 Markdown；Compact Dock 不显示。" : props.block.kind === "character-arc" ? "角色弧线正文只保存在角色 Markdown，可创建多个独立区块。" : <>使用 <code>[[条目标题]]</code> 引用世界中的其他对象。</>}</small></label>;
}

function CharacterPropertyGroup(props: { block: ObjectCardBlock; draft: ObjectDraft; objects: WorldObjectSummary[]; onDraft(value: ObjectDraft): void }) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CharacterPropertyType>("text");
  const [propertyError, setPropertyError] = useState("");
  const propertyByKey = new globalThis.Map(props.draft.typedProperties.map((property) => [property.key, property]));
  const groupKeys = props.block.propertyKeys || [];

  function updateGroup(patch: Partial<Pick<ObjectCardBlock, "label" | "propertyKeys">>) {
    props.onDraft({ ...props.draft, card: { ...props.draft.card, blocks: props.draft.card.blocks.map((block) => block.id === props.block.id ? { ...block, ...patch } : block) } });
  }

  function updateProperty(propertyKey: string, patch: Partial<CharacterProperty>) {
    props.onDraft({ ...props.draft, typedProperties: props.draft.typedProperties.map((property) => property.key === propertyKey ? { ...property, ...patch } : property) });
  }

  function removeProperty(property: CharacterProperty) {
    const valueWarning = property.value === null ? "" : "及其 Markdown 值";
    if (!window.confirm(`删除属性“${property.label}”${valueWarning}？分组引用会保留为可修复的缺失项。`)) return;
    props.onDraft({ ...props.draft, typedProperties: props.draft.typedProperties.filter((item) => item.key !== property.key) });
  }

  function changeType(property: CharacterProperty, nextType: CharacterPropertyType) {
    if (property.type === nextType) return;
    setPropertyError("");
    try {
      const selectedReference = property.type === "object-reference-list" && nextType === "object-reference" && Array.isArray(property.value) && property.value.length > 1
        ? window.prompt("请选择要保留的对象引用 ID：", property.value[0]) || undefined
        : undefined;
      if (property.type === "object-reference-list" && nextType === "object-reference" && Array.isArray(property.value) && property.value.length > 1 && !selectedReference) return;
      const confirmTextConversion = (property.type === "number" || property.type === "boolean") && (nextType === "text" || nextType === "date-like-text")
        ? window.confirm("将数值转换为文本会保留当前可读值，是否继续？")
        : false;
      if ((property.type === "number" || property.type === "boolean") && (nextType === "text" || nextType === "date-like-text") && !confirmTextConversion) return;
      const enumOptions = nextType === "enum"
        ? typeof property.value === "string" && property.value ? [property.value] : ["选项 1"]
        : undefined;
      const converted = convertCharacterProperty({
        key: property.key,
        label: property.label,
        type: property.type,
        enumOptions: property.enumOptions,
        value: property.value
      }, nextType, { confirmTextConversion, selectedReference, enumOptions });
      updateProperty(property.key, { type: converted.type, value: converted.value, enumOptions: converted.enumOptions });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      setPropertyError(detail.includes("number") ? "当前值无法严格解析为有限数字，属性类型未修改。" : detail.includes("enum") ? "当前值不在新的枚举选项中，属性类型未修改。" : "当前值无法无损转换为所选类型，属性类型未修改。");
    }
  }

  function moveKey(propertyKey: string, direction: -1 | 1) {
    const index = groupKeys.indexOf(propertyKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groupKeys.length) return;
    const next = [...groupKeys];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    updateGroup({ propertyKeys: next });
  }

  function addProperty() {
    const normalizedKey = key.trim();
    if (!/^[a-z][a-z0-9-]{0,31}$/u.test(normalizedKey) || propertyByKey.has(normalizedKey) || !label.trim()) return;
    const property: CharacterProperty = { key: normalizedKey, label: label.trim(), type, enumOptions: type === "enum" ? ["选项 1"] : [], value: null, references: [] };
    props.onDraft({ ...props.draft, typedProperties: [...props.draft.typedProperties, property], card: { ...props.draft.card, blocks: props.draft.card.blocks.map((block) => block.id === props.block.id ? { ...block, propertyKeys: [...groupKeys, normalizedKey] } : block) } });
    setKey(""); setLabel(""); setType("text");
  }

  const ungrouped = props.draft.typedProperties.filter((property) => !groupKeys.includes(property.key));
  return <div className="character-property-group" data-testid="property-group" data-group-id={props.block.id}>
    <label className="property-group-label"><span>属性组名称</span><input value={props.block.label || ""} maxLength={80} onChange={(event) => updateGroup({ label: event.target.value })} /></label>
    <div className="typed-property-list">{groupKeys.map((propertyKey) => {
      const property = propertyByKey.get(propertyKey);
      if (!property) return <div className="missing-property-definition" role="status" key={propertyKey}><AlertTriangle /><span><strong>{propertyKey}</strong> 的 Markdown 属性定义不存在。</span><label><span>修复为</span><select value="" onChange={(event) => {
        const replacement = event.target.value;
        if (!replacement) return;
        updateGroup({ propertyKeys: groupKeys.map((item) => item === propertyKey ? replacement : item) });
      }}><option value="">选择另一属性…</option>{props.draft.typedProperties.filter((candidate) => !groupKeys.includes(candidate.key)).map((candidate) => <option value={candidate.key} key={candidate.key}>{candidate.label}</option>)}</select></label><button type="button" onClick={() => updateGroup({ propertyKeys: groupKeys.filter((item) => item !== propertyKey) })}>从分组移除</button></div>;
      return <section className="typed-property-row" data-property-key={property.key} key={property.key}>
        <header><code>{property.key}</code><input value={property.label} maxLength={80} aria-label={`${property.key}属性标签`} onChange={(event) => updateProperty(property.key, { label: event.target.value })} /><select aria-label={`${property.label}属性类型`} value={property.type} onChange={(event) => changeType(property, event.target.value as CharacterPropertyType)}>{propertyTypeOptions.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select><button type="button" onClick={() => moveKey(property.key, -1)} aria-label={`上移${property.label}`}><ArrowUp /></button><button type="button" onClick={() => moveKey(property.key, 1)} aria-label={`下移${property.label}`}><ArrowDown /></button><button type="button" onClick={() => removeProperty(property)} aria-label={`删除${property.label}`}><Trash2 /></button></header>
        <CharacterPropertyValue property={property} objects={props.objects} onChange={(patch) => updateProperty(property.key, patch)} />
      </section>;
    })}</div>
    {propertyError && <p className="inline-error" role="alert">{propertyError}</p>}
    {ungrouped.length > 0 && <label className="add-existing-property"><span>加入已有属性</span><select value="" onChange={(event) => { if (event.target.value) updateGroup({ propertyKeys: [...groupKeys, event.target.value] }); }}><option value="">选择属性…</option>{ungrouped.map((property) => <option value={property.key} key={property.key}>{property.label}</option>)}</select></label>}
    <div className="new-property-row"><input value={key} onChange={(event) => setKey(event.target.value)} placeholder="property-key" aria-label="新属性键" /><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="属性标签" aria-label="新属性标签" /><select value={type} onChange={(event) => setType(event.target.value as CharacterPropertyType)}>{propertyTypeOptions.map(([value, title]) => <option value={value} key={value}>{title}</option>)}</select><button type="button" className="secondary-action" disabled={!key.trim() || !label.trim() || propertyByKey.has(key.trim())} onClick={addProperty}><Plus />添加属性</button></div>
  </div>;
}

function CharacterPropertyValue(props: { property: CharacterProperty; objects: WorldObjectSummary[]; onChange(patch: Partial<CharacterProperty>): void }) {
  const property = props.property;
  if (property.type === "boolean") return <label><span>值</span><select value={property.value === null ? "" : property.value ? "true" : "false"} onChange={(event) => props.onChange({ value: event.target.value === "" ? null : event.target.value === "true" })}><option value="">未填写</option><option value="true">true</option><option value="false">false</option></select></label>;
  if (property.type === "enum") return <div className="enum-property-value"><label><span>选项</span><input value={property.enumOptions.join(", ")} onChange={(event) => {
    const options = splitDraftList(event.target.value);
    if (property.value !== null && !options.includes(String(property.value))) return;
    props.onChange({ enumOptions: options });
  }} /></label><label><span>值</span><select value={String(property.value || "")} onChange={(event) => props.onChange({ value: event.target.value || null })}><option value="">未填写</option>{property.enumOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label></div>;
  if (property.type === "object-reference") return <label><span>对象引用</span><select value={String(property.value || "")} onChange={(event) => props.onChange({ value: event.target.value || null })}><option value="">未填写</option>{property.references.filter((reference) => reference.missing).map((reference) => <option value={reference.id} key={reference.id}>已缺失 · {reference.id}</option>)}{props.objects.map((object) => <option value={object.id} key={object.id}>{object.title} · {objectTypeLabel(object.type)}</option>)}</select>{property.references.some((reference) => reference.missing) && <small className="missing-reference-copy">引用对象已缺失，ID 仍保留。</small>}</label>;
  if (property.type === "object-reference-list") return <label><span>多对象引用</span><select multiple value={Array.isArray(property.value) ? property.value : []} onChange={(event) => props.onChange({ value: [...event.currentTarget.selectedOptions].map((option) => option.value) })}>{property.references.filter((reference) => reference.missing).map((reference) => <option value={reference.id} key={reference.id}>已缺失 · {reference.id}</option>)}{props.objects.map((object) => <option value={object.id} key={object.id}>{object.title} · {objectTypeLabel(object.type)}</option>)}</select></label>;
  return <label><span>值</span><input type={property.type === "number" ? "number" : "text"} value={property.value === null ? "" : String(property.value)} onChange={(event) => props.onChange({ value: event.target.value === "" ? null : property.type === "number" ? Number(event.target.value) : event.target.value })} placeholder={property.type === "date-like-text" ? "例如：雾历十三年" : "未填写"} /></label>;
}

function CardIdentityImage(props: { label: string; image: ObjectCardComposition["portrait"]; projectId: string; title: string; busy: boolean; onImport(file: File): void; onChange(image: ObjectCardComposition["portrait"]): void }) {
  return <section className="identity-image-editor" data-image-role={props.label === "角色肖像" ? "portrait" : "cover"}><header><strong>{props.label}</strong>{props.image && <button type="button" onClick={() => props.onChange(null)}>移除</button>}</header><div className="object-cover">{props.image ? <img src={visualAssetUrl(props.projectId, props.image.assetRef)} alt={`${props.title} ${props.label}`} style={{ objectFit: props.image.fit, objectPosition: `${props.image.position.x * 100}% ${props.image.position.y * 100}%` }} /> : <Image aria-hidden="true" />}<label className="cover-upload"><ImagePlus />{props.busy ? "正在导入" : props.image ? "更换" : "添加"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={props.busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.currentTarget.value = ""; }} /></label></div>{props.image && <div className="image-crop-controls"><label><span>填充</span><select value={props.image.fit} onChange={(event) => props.onChange({ ...props.image!, fit: event.target.value as "cover" | "contain" })}><option value="cover">cover</option><option value="contain">contain</option></select></label><label><span>水平焦点</span><input type="range" min="0" max="1" step="0.05" value={props.image.position.x} onChange={(event) => props.onChange({ ...props.image!, position: { ...props.image!.position, x: Number(event.target.value) } })} /></label><label><span>垂直焦点</span><input type="range" min="0" max="1" step="0.05" value={props.image.position.y} onChange={(event) => props.onChange({ ...props.image!, position: { ...props.image!.position, y: Number(event.target.value) } })} /></label></div>}</section>;
}

function CharacterTemplatePanel(props: { templates: CardTemplate[]; selectedTemplateId: string; label: string; diff: CharacterTemplateDiff | null; busy: boolean; error: string; onSelect(value: string): void; onLabel(value: string): void; onSave(): void; onPreview(): void; onApply(): void; onHistory(): void }) {
  const selected = props.templates.find((template) => template.id === props.selectedTemplateId) || props.templates[0];
  return <section className="character-template-panel" data-testid="character-template-panel"><div className="template-save-column"><h3>保存当前结构</h3><p>只提取内容槽位、属性定义、区块与视觉默认值；不包含角色值、正文或图片。</p><label><span>模板名称</span><input value={props.label} maxLength={80} onChange={(event) => props.onLabel(event.target.value)} placeholder="例如：调查员" /></label><button type="button" className="secondary-action" disabled={!props.label.trim() || props.busy} onClick={props.onSave}><Save />保存为本地模板</button></div><div className="template-apply-column"><h3>应用本地模板</h3>{props.templates.length ? <><label><span>模板</span><select value={selected?.id || ""} onChange={(event) => props.onSelect(event.target.value)}>{props.templates.map((template) => <option value={template.id} key={template.id}>{template.label}</option>)}</select></label>{selected && <div className="template-structure-summary"><span>{selected.sections.length} 个内容槽位</span><span>{selected.propertyDefinitions.length} 个属性定义</span><span>{selected.blocks.length} 个区块</span></div>}<div className="template-actions"><button type="button" onClick={props.onHistory}>历史</button><button type="button" className="secondary-action" disabled={props.busy} onClick={props.onPreview}>预览差异</button></div>{props.diff && <div className="template-diff-preview" data-testid="template-diff-preview"><strong>{props.diff.hasChanges ? "只会新增缺失结构" : "当前卡片已具备所有结构"}</strong><section><b>将添加</b><span>内容槽位 +{props.diff.missingSections.length}</span><span>属性定义 +{props.diff.missingPropertyDefinitions.length}</span><span>卡片区块 +{props.diff.missingBlocks.length}</span></section><section><b>将保留</b><span>现有正文、属性值、区块 ID 与顺序、角色肖像和卡片封面</span></section><section><b>不会修改</b><span>已有属性类型、对象引用、关系、布局和视觉设置</span></section><span>类型冲突 {props.diff.propertyTypeConflicts.length}</span><span>覆盖 0</span><button type="button" className="primary-action" disabled={props.busy || !props.diff.hasChanges} onClick={props.onApply}>确认应用</button></div>}</> : <p className="block-empty-copy">还没有本地模板。</p>}</div>{props.error && <p className="inline-error" role="alert">{props.error}</p>}</section>;
}

const propertyTypeOptions: Array<[CharacterPropertyType, string]> = [["text", "文本"], ["number", "数字"], ["boolean", "布尔"], ["date-like-text", "日期样式文本"], ["object-reference", "对象引用"], ["object-reference-list", "多对象引用"], ["enum", "枚举"]];

function PropertiesBlock(props: { draft: ObjectDraft; object: WorldObject; objects: WorldObjectSummary[]; relations: import("../lib/localTransport").RelationRecord[]; authorityMode: ObjectAuthorityMode; agentTypes: AgentTypeDefinition[]; agentTypeBusy: boolean; agentTypeError: string; onSaveAgentType(input: { agentTypeId: string | null; fieldValues: Record<string, string | number | boolean | null> }): Promise<void>; onDraft(value: ObjectDraft): void; onOpenObject(object: WorldObjectSummary): void; onOpenRelation(relationId: string): void }) {
  const authorityTags = splitDraftList(props.draft.tags).filter((tag) => tag === "作者规划" || tag === "作者确认");
  const ordinaryTags = splitDraftList(props.draft.tags).filter((tag) => tag !== "作者规划" && tag !== "作者确认");
  const authorityControlled = props.authorityMode === "planning-event" || props.authorityMode === "verified-canon" || props.authorityMode === "canon-verification-unavailable";
  const invalidClaim = props.authorityMode === "invalid-canon-claim";

  function updateOrdinaryTags(value: string): void {
    props.onDraft({ ...props.draft, tags: [...authorityTags, ...splitDraftList(value)].join(", ") });
  }

  return <div className="object-property-grid">
    <section className="object-type-property-block" data-testid="object-type-property-block" aria-label="自定义类型属性">
      <AgentTypeObjectBinding object={props.object} agentTypes={props.agentTypes} busy={props.agentTypeBusy} error={props.agentTypeError} onSave={props.onSaveAgentType} />
      {props.object.type === "event" && !authorityControlled
        ? <label><span>事件状态</span><select value={props.draft.status} data-testid="object-status-field" onChange={(event) => props.onDraft({ ...props.draft, status: event.target.value })}>{eventLifecycleOptions(props.draft.status).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small>成为已确认事件必须通过影响确认。</small></label>
        : <label className="localized-enum-field"><span>状态</span><span className="localized-enum-preview" aria-hidden="true">{displayEnumLabel(props.draft.status) || "未填写"}</span><input value={props.draft.status} readOnly={authorityControlled} data-testid="object-status-field" onChange={(event) => props.onDraft({ ...props.draft, status: event.target.value })} /></label>}
    </section>
    <label><span>{authorityControlled ? "普通标签" : "标签"}</span><input value={authorityControlled ? ordinaryTags.join(", ") : props.draft.tags} data-testid="object-tags-field" onChange={(event) => authorityControlled ? updateOrdinaryTags(event.target.value) : props.onDraft({ ...props.draft, tags: event.target.value })} placeholder="用逗号分隔" /></label>
    <label><span>别名</span><input value={props.draft.aliases} onChange={(event) => props.onDraft({ ...props.draft, aliases: event.target.value })} placeholder="用逗号分隔" /></label>
    {authorityControlled && <p className="authority-field-note" data-testid="authority-field-note"><strong>{authorityTags.join(" · ")}</strong>{props.authorityMode === "verified-canon" ? "这条事实已经由作者确认；普通标签仍可编辑。" : "这条内容仍在作者审查中；普通标签仍可编辑。"}</p>}
    {invalidClaim && <p className="authority-field-note is-error" role="alert">这条事件带有确认外观，但未通过权威链验证；保存前请改为普通状态并移除“作者规划 / 作者确认”标签。通用卡片不能认领确认身份。</p>}
    {props.object.type === "event" && props.authorityMode === "ordinary" && <p className="authority-field-note">普通事件资料可以编辑；成为正式故事事实前仍需经过作者审查。</p>}
    {(props.object.type === "character" || props.object.type === "item" || props.object.type === "location") && <ObjectProfileEditor objectType={props.object.type} profile={props.draft.profile || createEmptyObjectProfile(props.object.type)} onChange={(profile) => props.onDraft({ ...props.draft, profile })} />}
    {props.object.type === "item" && <ItemHolderProjection item={props.object} objects={props.objects} relations={props.relations} onOpenObject={props.onOpenObject} onOpenRelation={props.onOpenRelation} />}
    {props.object.type === "location" && <LocationTopologyProjection objects={props.objects} relations={props.relations} onOpenObject={props.onOpenObject} onOpenRelation={props.onOpenRelation} />}
    {Object.entries(props.object.properties).filter(([key]) => !isInternalProtocolProperty(key)).map(([key, value]) => <dl className="property-row" key={key}><dt>{authorPropertyLabel(key)}</dt><dd>{Array.isArray(value) ? value.map((item) => displayEnumLabel(String(item))).join(" · ") : displayEnumLabel(String(value))}</dd></dl>)}
    {Object.entries(props.object.properties).some(([key]) => isInternalProtocolProperty(key)) && <details className="card-technical-details"><summary>技术详情</summary>{Object.entries(props.object.properties).filter(([key]) => isInternalProtocolProperty(key)).map(([key, value]) => <dl className="property-row" key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.map((item) => displayEnumLabel(String(item))).join(" · ") : displayEnumLabel(String(value))}</dd></dl>)}</details>}
  </div>;
}

function authorityModeLabel(mode: Exclude<ObjectAuthorityMode, "ordinary">): string {
  if (mode === "verified-canon") return "已由作者确认";
  if (mode === "planning-event") return "等待作者确认";
  if (mode === "canon-verification-unavailable") return "确认状态暂时无法核验";
  return "确认状态需要处理";
}

function authorityModeDescription(mode: Exclude<ObjectAuthorityMode, "ordinary">): string {
  if (mode === "verified-canon") return "这条内容已成为正式故事事实；正文与普通资料仍可编辑。";
  if (mode === "planning-event") return "这条内容仍是候选，进入正式故事前需要影响评审与作者确认。";
  if (mode === "canon-verification-unavailable") return "暂时无法确认这条内容的状态；受保护字段保持只读。";
  return "这条内容尚未通过确认；请先移除错误的确认标记，再按普通资料继续编辑。";
}

function isInternalProtocolProperty(key: string): boolean {
  return ["apply_intent_hash", "apply_operation_key", "author_decision_ref", "planned_from", "provenance", "source_change_set_id", "source_change_set_revision"].includes(key);
}

function authorPropertyLabel(key: string): string {
  return ({ status: "状态", summary: "摘要", note: "备注", location: "地点", date: "时间" } as Record<string, string>)[key] || "补充资料";
}

function ConnectionsBlock(props: { object: WorldObject; onOpenObject(object: WorldObjectSummary): void }) {
  return <div className="connection-columns">
    <ReferenceGroup title="关联资料" items={props.object.linkedObjects} onOpen={props.onOpenObject} />
    <ReferenceGroup title="被引用于" items={props.object.backlinks} onOpen={props.onOpenObject} />
  </div>;
}

function ReferenceGroup(props: { title: string; items: WorldObjectSummary[]; onOpen(object: WorldObjectSummary): void }) {
  return <section><h3>{props.title}<span>{props.items.length}</span></h3>{props.items.length ? props.items.map((item) => <button type="button" className="reference-button" onClick={() => props.onOpen(item)} key={item.id}><span>{item.title}</span><small>{objectTypeLabel(item.type)}</small><ChevronRight /></button>) : <p className="block-empty-copy">还没有相关对象</p>}</section>;
}

function MediaBlock(props: { projectId: string; draft: ObjectDraft; busy: boolean; onImport(file: File): void; onDraft(value: ObjectDraft): void }) {
  function removeAsset(asset: string) {
    props.onDraft({ ...props.draft, card: { ...props.draft.card, visual: { ...props.draft.card.visual, mediaAssets: props.draft.card.visual.mediaAssets.filter((item) => item !== asset) } } });
  }
  return <div className="media-block-content">
    <div className="media-grid">{props.draft.card.visual.mediaAssets.map((asset) => <figure key={asset}><img src={visualAssetUrl(props.projectId, asset)} alt="对象媒体" /><figcaption><span>{asset.split("/").at(-1)}</span><button type="button" onClick={() => removeAsset(asset)} aria-label="移除图片"><X /></button></figcaption></figure>)}</div>
    <label className="secondary-action media-upload"><ImagePlus />{props.busy ? "正在导入" : "添加本地图片"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={props.busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) props.onImport(file); event.currentTarget.value = ""; }} /></label>
  </div>;
}

function ObjectProjectionBlock(props: {
  type: "map" | "graph" | "timeline" | "tree" | "canvas";
  object: WorldObject;
  objects: WorldObjectSummary[];
  onOpen(reference: ObjectVisualReference, context?: { objectId: string; source: "map-marker" | "graph-node" | "graph-edge" | "canvas-node" | "timeline-event" | "tree-node"; documentId: string; blockId?: string | null; relationId?: string | null }): void;
  onOpenObject(object: WorldObjectSummary): void;
}) {
  return props.object.type === "character"
    ? <CharacterProjectionBlock type={props.type} object={props.object} objects={props.objects} onOpen={props.onOpen} onOpenObject={props.onOpenObject} />
    : <VisualReferenceBlock type={props.type} references={props.object.visualReferences} onOpen={props.onOpen} />;
}

function VisualReferenceBlock(props: { type: "map" | "graph" | "timeline" | "tree" | "canvas"; references: ObjectVisualReference[]; onOpen(reference: ObjectVisualReference): void }) {
  const references = props.references.filter((reference) => reference.type === props.type);
  const label = props.type === "map" ? "地图" : props.type === "graph" ? "关系图谱" : props.type === "timeline" ? "时间线" : props.type === "tree" ? "树" : "画布";
  const icon = props.type === "map" ? <Map /> : props.type === "graph" ? <GitFork /> : props.type === "timeline" ? <Clock3 /> : props.type === "tree" ? <Network /> : <LayoutPanelTop />;
  return references.length ? <div className="visual-reference-list">{references.map((reference) => <button type="button" onClick={() => props.onOpen(reference)} key={reference.relativePath}><span>{icon}<strong>{reference.title}</strong></span><small>这个对象已出现在{label}中</small><ChevronRight /></button>)}</div> : <p className="block-empty-copy">这个对象还没有出现在任何{label}中。你可以从{label}工作区放入它。</p>;
}

function splitDraftList(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))];
}

function displayEnumLabel(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return ({
    active: "进行中",
    inactive: "未启用",
    archived: "已归档",
    planned: "规划中",
    possible: "故事可能",
    "rehearsal-candidate": "排演候选",
    "pending-impact-review": "待影响确认",
    committed: "已确认",
    paused: "已暂停",
    abandoned: "已放弃",
    draft: "草稿",
    character: "角色",
    investigator: "调查员",
    protagonist: "主角",
    antagonist: "对手",
    supporting: "配角",
    location: "地点",
    event: "事件",
    item: "物品",
    faction: "组织",
    rule: "规则",
    foreshadow: "伏笔"
  } as Record<string, string>)[normalized] ?? value;
}

function eventLifecycleOptions(current: string): Array<[string, string]> {
  const options: Array<[string, string]> = [
    ["possible", "故事可能"],
    ["rehearsal-candidate", "排演候选"],
    ["pending-impact-review", "待影响确认"],
    ["paused", "已暂停"],
    ["abandoned", "已放弃"],
    ["archived", "已归档"]
  ];
  return options.some(([value]) => value === current) ? options : [[current, displayEnumLabel(current)], ...options];
}

function displayObjectId(value: string): string {
  const [kind, ...identity] = value.split(".");
  if (!identity.length) return displayEnumLabel(value);
  return `${displayEnumLabel(kind)} · ${identity.join(".")}`;
}

function closeDocumentLauncher(button: HTMLButtonElement) {
  button.closest("details")?.removeAttribute("open");
}

function saveStateLabel(value: SaveState): string {
  return ({ saved: "已保存", unsaved: "有未保存修改", saving: "正在保存", conflict: "等待处理冲突" })[value];
}

function presentationRefFor(type: ObjectCardBlockType): string {
  const value = ({
    properties: "object.properties",
    connections: "object.connections",
    media: "object.media",
    map: "projection.map-appearances",
    graph: "projection.graph-relations",
    timeline: "projection.timeline-participation",
    tree: "projection.tree-appearances",
    canvas: "projection.canvas-appearances"
  } as Partial<Record<ObjectCardBlockType, string>>)[type];
  if (!value) throw new Error("Content blocks require a Markdown reference.");
  return value;
}

function nextBlockInstanceId(objectId: string, kind: ObjectCardBlockType, existingIds: string[]): string {
  const stableObject = objectId.normalize("NFC").replace(/[^\p{L}\p{N}._-]/gu, "-").slice(0, 48);
  for (let ordinal = 1; ordinal <= 96; ordinal += 1) {
    const candidate = `card-block.${stableObject}.${kind}.${String(ordinal).padStart(2, "0")}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
  throw new Error("Could not create a stable card block identifier.");
}
