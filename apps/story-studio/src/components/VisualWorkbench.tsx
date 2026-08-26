import { AlertTriangle, ArrowLeftRight, BookOpen, Clock3, Columns2, GitFork, Map, Network, Plus, RefreshCw, Save, Shapes } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { useDocumentHistory } from "../hooks/useDocumentHistory";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import type {
  CanvasDocument,
  GraphDocument,
  IntelligenceOverlay,
  MapDocument,
  PlanningEventTimelineResult,
  AddPlanningEventResult,
  TimelineDocument,
  TimelineValidationResult,
  VisualAsset,
  VisualDocument,
  VisualDocumentType,
  WorldObject,
  WorldObjectSummary,
  TianyiObjectContextRef
} from "../lib/localTransport";
import type { StoryStudioEventReference } from "../../../../src/storyContracts/storyStudioEventReference";
import { ObjectCardDock } from "./ObjectCardDock";
import { DocumentHeaderActions } from "./DocumentHeaderActions";
import type { WorkspaceSelection, WorkspaceSelectionSource } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import { WorldDocumentTabs, type WorldDocumentTab } from "./WorldDocumentTabs";

const MapEditor = lazy(() => import("./MapEditor").then((module) => ({ default: module.MapEditor })));
const GraphEditor = lazy(() => import("./GraphEditor").then((module) => ({ default: module.GraphEditor })));
const CanvasEditor = lazy(() => import("./CanvasEditor").then((module) => ({ default: module.CanvasEditor })));
const TimelineEditor = lazy(() => import("./TimelineEditor").then((module) => ({ default: module.TimelineEditor })));
const TreeEditor = lazy(() => import("./TreeEditor").then((module) => ({ default: module.TreeEditor })));

type VisualSaveState = "saved" | "unsaved" | "saving" | "conflict";

export type VisualTianyiHandoff =
  | { kind: "visual"; ref: TianyiObjectContextRef }
  | { kind: "event"; reference: StoryStudioEventReference };

export function VisualWorkbench(props: {
  projectId: string;
  projectTitle: string;
  mode: VisualDocumentType;
  worldTabs: WorldDocumentTab[];
  documents: VisualDocument[];
  primaryDocument: VisualDocument | null;
  secondaryDocument: VisualDocument | null;
  splitView: boolean;
  objects: WorldObjectSummary[];
  inspectedObject: WorldObject | null;
  selection: WorkspaceSelection;
  intelligenceOverlay: IntelligenceOverlay | null;
  onMode(mode: "library" | VisualDocumentType): void;
  onCreate(type: VisualDocumentType): void;
  onOpen(document: VisualDocument, pane: "primary" | "secondary"): void;
  onOpenWorldTab(tab: WorldDocumentTab): void;
  onCloseWorldTab(tab: WorldDocumentTab): void;
  onSplit(enabled: boolean, secondaryDocument?: VisualDocument): void;
  onSwap(): void;
  onSave(document: VisualDocument): Promise<{ conflict: boolean; document: VisualDocument }>;
  onImportAsset(file: File): Promise<VisualAsset>;
  onImportImage(file: File): Promise<VisualAsset>;
  onOpenObject(object: WorldObjectSummary): void;
  onSelectObject(object: WorldObjectSummary, source: WorkspaceSelectionSource, documentId: string, blockId?: string | null): void;
  onSelectRelation(source: WorkspaceSelectionSource, documentId: string, relationId: string): void;
  onOpenFullObject(object: WorldObject): void;
  onOpenVisualReference(reference: WorldObject["visualReferences"][number]): void;
  onCloseObject(): void;
  onOpenLibrary(): void;
  onCreateFolder(): void;
  onRevisionHistory(document: VisualDocument): void;
  onCreateTimelinePlanningEvent(document: TimelineDocument, title: string, body: string): Promise<PlanningEventTimelineResult>;
  onAddExistingTimelinePlanningEvent(document: TimelineDocument, planningEventId: string): Promise<AddPlanningEventResult>;
  onValidateTimelineDocument(document: TimelineDocument): Promise<TimelineValidationResult>;
  onReviewTimelinePlanningEvent(planningEventId: string): Promise<void>;
  onAbandonTimelinePlanningEvent(planningEventId: string): Promise<{ conflict: boolean }>;
  onGiveToTianyi(input: VisualTianyiHandoff): void;
}) {
  const [documentSaveStates, setDocumentSaveStates] = useState<Record<string, VisualSaveState>>({});
  const modeDocuments = props.documents.filter((document) => document.type === props.mode);
  const primary = props.primaryDocument?.type === props.mode ? props.primaryDocument : modeDocuments[0] || null;

  function toggleSplit() {
    if (props.splitView) {
      props.onSplit(false);
      return;
    }
    const preferredTypes: VisualDocumentType[] = props.mode === "graph" ? ["tree", "map"] : props.mode === "tree" ? ["graph", "timeline"] : props.mode === "timeline" ? ["tree", "map"] : props.mode === "map" ? ["timeline", "tree", "graph"] : ["map", "graph"];
    const other = preferredTypes.flatMap((type) => props.documents.filter((document) => document.type === type)).find((document) => document.relativePath !== primary?.relativePath);
    if (!other) {
      props.onCreate(preferredTypes[0]);
      return;
    }
    props.onSplit(true, other);
  }

  return <section className="workbench visual-workbench" data-testid="visual-workbench" data-split={props.splitView}>
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="资料" title={primary?.title || visualLabel(props.mode)} context={props.mode === "timeline" ? "时间线表示故事何时发生" : `${visualLabel(props.mode)}专业画布`} status={primary ? "本地保存" : "尚未创建"} prototype="editor" icon={<BookOpen />} className="visual-workbench-bar" onOpenNavigation={props.onOpenLibrary} actions={<div className="workbench-end-actions"><details className="document-launcher"><summary>{visualLabel(props.mode)}</summary><div><button type="button" onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("library"); }}>资料卡片</button><button type="button" className={props.mode === "map" ? "is-active" : ""} onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("map"); }}><Map />地图</button><button type="button" className={props.mode === "graph" ? "is-active" : ""} onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("graph"); }}><GitFork />图谱</button><button type="button" className={props.mode === "canvas" ? "is-active" : ""} onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("canvas"); }}><Shapes />画布</button><button type="button" className={props.mode === "timeline" ? "is-active" : ""} onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("timeline"); }}><Clock3 />时间线</button><button type="button" className={props.mode === "tree" ? "is-active" : ""} onClick={(event) => { closeDocumentLauncher(event.currentTarget); props.onMode("tree"); }}><Network />树</button></div></details><select className="mobile-document-select mobile-only" aria-label="世界文档" value={props.mode} onChange={(event) => props.onMode(event.target.value as "library" | VisualDocumentType)}><option value="library">资料卡片</option><option value="map">地图</option><option value="graph">图谱</option><option value="canvas">画布</option><option value="timeline">时间线</option><option value="tree">树</option></select>{props.splitView && <button type="button" className="split-action" onClick={props.onSwap} title="交换左右文档"><ArrowLeftRight />交换</button>}<button type="button" className={`split-action ${props.splitView ? "is-active" : ""}`} onClick={toggleSplit}><Columns2 />{props.splitView ? "退出分屏" : "分屏"}</button></div>} />

    <WorldDocumentTabs tabs={props.worldTabs} activeId={primary?.id || null} onOpen={props.onOpenWorldTab} onClose={props.onCloseWorldTab} onCreateObject={() => props.onMode("library")} onCreateVisual={props.onCreate} onCreateFolder={props.onCreateFolder} />

    {!primary ? <article className="visual-empty-state">
      {visualIcon(props.mode)}
      <p className="eyebrow">{visualEmptyCopy(props.mode).eyebrow}</p>
      <h1>{visualEmptyCopy(props.mode).title}</h1>
      <p>{visualEmptyCopy(props.mode).description}</p>
      <button type="button" className="primary-action" onClick={() => props.onCreate(props.mode)}><Plus />创建第一份{visualLabel(props.mode)}</button>
    </article> : <div className={`visual-content ${props.inspectedObject ? "has-object-dock" : ""}`}><div className={`visual-panes ${props.splitView && props.secondaryDocument ? "is-split" : ""}`}>
      <VisualPane
        key={primary.relativePath}
        projectId={props.projectId}
        document={primary}
        documents={props.documents}
        objects={props.objects}
        onSave={props.onSave}
        onCreateTimelinePlanningEvent={props.onCreateTimelinePlanningEvent}
        onAddExistingTimelinePlanningEvent={props.onAddExistingTimelinePlanningEvent}
        onValidateTimelineDocument={props.onValidateTimelineDocument}
        onReviewTimelinePlanningEvent={props.onReviewTimelinePlanningEvent}
        onAbandonTimelinePlanningEvent={props.onAbandonTimelinePlanningEvent}
        onImportAsset={props.onImportAsset}
        onImportImage={props.onImportImage}
        onOpenObject={props.onOpenObject}
        selection={props.selection}
        onSelectObject={props.onSelectObject}
        onSelectRelation={props.onSelectRelation}
        intelligenceOverlay={props.intelligenceOverlay}
        onClose={() => props.onCloseWorldTab({ kind: "visual", id: primary.id, title: primary.title, type: primary.type, relativePath: primary.relativePath })}
        onRevisionHistory={() => props.onRevisionHistory(primary)}
        onOpenLibrary={props.onOpenLibrary}
        documentSaveStates={documentSaveStates}
        onSaveState={(relativePath, state) => setDocumentSaveStates((current) => current[relativePath] === state ? current : { ...current, [relativePath]: state })}
        onGiveToTianyi={props.onGiveToTianyi}
      />
      {props.splitView && props.secondaryDocument && <VisualPane
        key={props.secondaryDocument.relativePath}
        projectId={props.projectId}
        document={props.secondaryDocument}
        documents={props.documents}
        objects={props.objects}
        onSave={props.onSave}
        onCreateTimelinePlanningEvent={props.onCreateTimelinePlanningEvent}
        onAddExistingTimelinePlanningEvent={props.onAddExistingTimelinePlanningEvent}
        onValidateTimelineDocument={props.onValidateTimelineDocument}
        onReviewTimelinePlanningEvent={props.onReviewTimelinePlanningEvent}
        onAbandonTimelinePlanningEvent={props.onAbandonTimelinePlanningEvent}
        onImportAsset={props.onImportAsset}
        onImportImage={props.onImportImage}
        onOpenObject={props.onOpenObject}
        selection={props.selection}
        onSelectObject={props.onSelectObject}
        onSelectRelation={props.onSelectRelation}
        intelligenceOverlay={props.intelligenceOverlay}
        onClose={() => props.onCloseWorldTab({ kind: "visual", id: props.secondaryDocument!.id, title: props.secondaryDocument!.title, type: props.secondaryDocument!.type, relativePath: props.secondaryDocument!.relativePath })}
        onRevisionHistory={() => props.onRevisionHistory(props.secondaryDocument!)}
        onOpenLibrary={props.onOpenLibrary}
        documentSaveStates={documentSaveStates}
        onSaveState={(relativePath, state) => setDocumentSaveStates((current) => current[relativePath] === state ? current : { ...current, [relativePath]: state })}
        onGiveToTianyi={props.onGiveToTianyi}
      />}
    </div>{props.inspectedObject && <ObjectCardDock
      projectId={props.projectId}
      object={props.inspectedObject}
      selection={props.selection}
      onClose={props.onCloseObject}
      onOpenFull={() => props.onOpenFullObject(props.inspectedObject!)}
      onOpenObject={props.onOpenObject}
      onOpenVisual={props.onOpenVisualReference}
    />}</div>}
  </section>;
}

function VisualPane(props: {
  projectId: string;
  document: VisualDocument;
  documents: VisualDocument[];
  objects: WorldObjectSummary[];
  onSave(document: VisualDocument): Promise<{ conflict: boolean; document: VisualDocument }>;
  onCreateTimelinePlanningEvent(document: TimelineDocument, title: string, body: string): Promise<PlanningEventTimelineResult>;
  onAddExistingTimelinePlanningEvent(document: TimelineDocument, planningEventId: string): Promise<AddPlanningEventResult>;
  onValidateTimelineDocument(document: TimelineDocument): Promise<TimelineValidationResult>;
  onReviewTimelinePlanningEvent(planningEventId: string): Promise<void>;
  onAbandonTimelinePlanningEvent(planningEventId: string): Promise<{ conflict: boolean }>;
  onImportAsset(file: File): Promise<VisualAsset>;
  onImportImage(file: File): Promise<VisualAsset>;
  onOpenObject(object: WorldObjectSummary): void;
  selection: WorkspaceSelection;
  onSelectObject(object: WorldObjectSummary, source: WorkspaceSelectionSource, documentId: string, blockId?: string | null): void;
  onSelectRelation(source: WorkspaceSelectionSource, documentId: string, relationId: string): void;
  intelligenceOverlay: IntelligenceOverlay | null;
  onClose(): void;
  onRevisionHistory(): void;
  onOpenLibrary(): void;
  documentSaveStates: Record<string, VisualSaveState>;
  onSaveState(relativePath: string, state: VisualSaveState): void;
  onGiveToTianyi(input: VisualTianyiHandoff): void;
}) {
  const history = useDocumentHistory(props.document);
  const [saveState, setSaveState] = useState<VisualSaveState>("saved");
  const [conflictDocument, setConflictDocument] = useState<VisualDocument | null>(null);
  const [saveError, setSaveError] = useState("");
  const loadedDocumentRef = useRef({ relativePath: props.document.relativePath, contentHash: props.document.contentHash });

  useEffect(() => {
    const pathChanged = loadedDocumentRef.current.relativePath !== props.document.relativePath;
    const hashChanged = loadedDocumentRef.current.contentHash !== props.document.contentHash;
    if (!pathChanged && !hashChanged) return;
    // Project refreshes may observe the external version while the author is
    // resolving a conflict. Keep the local history until they choose a branch.
    if (!pathChanged && saveState !== "saved") return;
    history.reset(props.document);
    loadedDocumentRef.current = { relativePath: props.document.relativePath, contentHash: props.document.contentHash };
    setSaveState("saved");
    setConflictDocument(null);
    setSaveError("");
  }, [props.document.relativePath, props.document.contentHash, saveState, history.reset]);

  useEffect(() => {
    props.onSaveState(props.document.relativePath, saveState);
  }, [props.document.relativePath, props.onSaveState, saveState]);

  function change(document: VisualDocument) {
    history.commit(document);
    setSaveState("unsaved");
    setSaveError("");
  }

  async function save() {
    setSaveState("saving");
    setSaveError("");
    try {
      const result = await props.onSave(history.present);
      if (result.conflict) {
        setConflictDocument(result.document);
        setSaveState("conflict");
      } else {
        history.reset(result.document);
        setConflictDocument(null);
        setSaveState("saved");
      }
    } catch (error) {
      setSaveState("unsaved");
      setSaveError(error instanceof Error ? error.message : "无法保存这份文档。");
    }
  }

  function undo() {
    history.undo();
    setSaveState("unsaved");
    setSaveError("");
  }

  function redo() {
    history.redo();
    setSaveState("unsaved");
    setSaveError("");
  }

  async function importMapImage(file: File) {
    if (history.present.type !== "map") return;
    const dimensions = await readImageDimensions(file);
    const asset = await props.onImportAsset(file);
    const backgroundId = nextBackgroundId(history.present.content.backgrounds.map((background) => background.id));
    const background = {
      id: backgroundId,
      title: file.name.replace(/\.[^.]+$/u, "") || `背景 ${history.present.content.backgrounds.length + 1}`,
      assetPath: asset.relativePath,
      mimeType: asset.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      opacity: 1,
      visible: true
    };
    change({
      ...history.present,
      content: {
        ...history.present.content,
        baseImage: { assetPath: asset.relativePath, mimeType: asset.mimeType, width: dimensions.width, height: dimensions.height },
        backgrounds: [...history.present.content.backgrounds, background],
        activeBackgroundId: backgroundId
      },
      viewport: { x: 0, y: 0, zoom: 1 }
    } as MapDocument);
  }

  return <article className="visual-pane" data-document-type={history.present.type} data-document-path={history.present.relativePath}>
    <div className="visual-pane-document-header"><DocumentHeaderActions title={history.present.title} typeLabel={`${visualLabel(history.present.type)}文档`} saveState={saveState} saveLabel={visualSaveLabel(saveState)} tutorial={visualTutorial(history.present.type)} onRevisionHistory={props.onRevisionHistory} onClose={props.onClose} onOpenLibrary={props.onOpenLibrary} /><button type="button" className="primary-action visual-save-action" disabled={saveState === "saved" || saveState === "saving" || saveState === "conflict"} onClick={() => void save()}>{saveState === "saving" ? <RefreshCw className="spin" /> : <Save />}{saveState === "saving" ? "保存中" : "保存"}</button></div>
    {saveState === "conflict" && conflictDocument && <div className="visual-conflict-banner" role="alert" data-testid="visual-conflict-banner"><AlertTriangle /><span><strong>磁盘中的文档已经改变</strong><small>当前修改没有覆盖外部内容。</small></span><button type="button" onClick={() => { history.reset(conflictDocument); setConflictDocument(null); setSaveState("saved"); }}>重新读取磁盘版本</button><button type="button" onClick={() => { history.reset(conflictDocument); setConflictDocument(null); setSaveState("saved"); }}>放弃内存修改</button></div>}
    {saveError && <div className="visual-validation-banner" role="alert" data-testid="visual-validation-banner"><AlertTriangle /><span><strong>这次修改还不能保存</strong><small>{saveError}</small></span><button type="button" aria-label="关闭保存错误" onClick={() => setSaveError("")}>关闭</button></div>}
    {props.intelligenceOverlay && <div className={`visual-intelligence-overlay ${history.present.type === "map" && !props.intelligenceOverlay.mapProjection.hasSpatialChanges ? "is-no-spatial-change" : ""}`} data-testid="intelligence-overlay"><span><strong>{history.present.type === "map" && !props.intelligenceOverlay.mapProjection.hasSpatialChanges ? "没有新增地图变化" : "候选路线预览"}</strong><small>{history.present.type === "map" ? props.intelligenceOverlay.mapProjection.message : `${props.intelligenceOverlay.evidence.length} 条证据 · ${props.intelligenceOverlay.risks.length} 项风险 · 只读`}</small></span></div>}
    <div className="visual-editor-stage">
      <Suspense fallback={<div className="visual-editor-loading"><RefreshCw className="spin" />正在打开视觉编辑器</div>}>
      {history.present.type === "map" ? <MapEditor
        projectId={props.projectId}
        document={history.present}
        objects={props.objects}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onChange={change}
        onUndo={undo}
        onRedo={redo}
        onSave={() => void save()}
        onImportImage={(file) => void importMapImage(file)}
        selection={props.selection}
        onSelectObject={(object) => props.onSelectObject(object, "map-marker", history.present.id)}
        candidateObjectIds={props.intelligenceOverlay?.candidateChanges.map((item) => item.objectId) || []}
        onGiveToTianyi={props.onGiveToTianyi}
      /> : history.present.type === "graph" ? <GraphEditor
        document={history.present}
        objects={props.objects}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onChange={change}
        onUndo={undo}
        onRedo={redo}
        selection={props.selection}
        onSelectObject={(object) => props.onSelectObject(object, "graph-node", history.present.id)}
        onSelectRelation={(relationId) => props.onSelectRelation("graph-edge", history.present.id, relationId)}
        onOpenObject={props.onOpenObject}
        candidateObjectIds={props.intelligenceOverlay?.candidateChanges.map((item) => item.objectId) || []}
      /> : history.present.type === "canvas" ? <CanvasEditor
        projectId={props.projectId}
        document={history.present as CanvasDocument}
        objects={props.objects}
        selection={props.selection}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onChange={change}
        onUndo={undo}
        onRedo={redo}
        onImportImage={props.onImportImage}
        onSelectObject={(object, nodeId) => props.onSelectObject(object, "canvas-node", history.present.id, nodeId)}
        onSelectRelation={(relationId) => props.onSelectRelation("canvas-edge", history.present.id, relationId)}
        onOpenObject={props.onOpenObject}
        candidateObjectIds={props.intelligenceOverlay?.candidateChanges.map((item) => item.objectId) || []}
      /> : history.present.type === "timeline" ? <TimelineEditor
        projectId={props.projectId}
        document={history.present}
        objects={props.objects}
        selection={props.selection}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onChange={change}
        onUndo={undo}
        onRedo={redo}
        storedOperationReady={saveState === "saved"}
        onCreatePlanningEvent={props.onCreateTimelinePlanningEvent}
        onAddExistingPlanningEvent={props.onAddExistingTimelinePlanningEvent}
        onValidate={props.onValidateTimelineDocument}
        onReviewPlanningEvent={props.onReviewTimelinePlanningEvent}
        onAbandonPlanningEvent={props.onAbandonTimelinePlanningEvent}
        onSelectObject={(object) => props.onSelectObject(object, "timeline-event", history.present.id)}
        onOpenObject={props.onOpenObject}
        candidateObjectIds={props.intelligenceOverlay?.candidateChanges.map((item) => item.objectId) || []}
        onGiveToTianyi={(reference) => props.onGiveToTianyi({ kind: "event", reference })}
      /> : <TreeEditor
        document={history.present}
        graphs={props.documents.filter((document): document is GraphDocument => document.type === "graph")}
        objects={props.objects}
        selection={props.selection}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onChange={change}
        onUndo={undo}
        onRedo={redo}
        onSelectObject={(object) => props.onSelectObject(object, "tree-node", history.present.id)}
        onSelectRelation={(relationId) => props.onSelectRelation("tree-edge", history.present.id, relationId)}
        onOpenObject={props.onOpenObject}
        onSaveSourceGraph={async (document) => {
          const result = await props.onSave(document);
          if (result.document.type !== "graph") throw new Error("关系来源必须是图谱文档。");
          return { conflict: result.conflict, document: result.document };
        }}
        sourceGraphWritable={!history.present.content.sourceGraphPath || (props.documentSaveStates[history.present.content.sourceGraphPath] || "saved") === "saved"}
        candidateObjectIds={props.intelligenceOverlay?.candidateChanges.map((item) => item.objectId) || []}
      />}
      </Suspense>
    </div>
  </article>;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取地图图片尺寸。")); };
    image.src = url;
  });
}

function visualSaveLabel(state: VisualSaveState): string {
  return ({ saved: "已保存", unsaved: "有未保存修改", saving: "正在保存", conflict: "等待处理冲突" })[state];
}

function visualLabel(type: VisualDocumentType): string {
  return type === "map" ? "地图" : type === "graph" ? "图谱" : type === "canvas" ? "画布" : type === "timeline" ? "时间线" : "树";
}

function visualIcon(type: VisualDocumentType) {
  return type === "map" ? <Map /> : type === "graph" ? <GitFork /> : type === "canvas" ? <Shapes /> : type === "timeline" ? <Clock3 /> : <Network />;
}

function visualEmptyCopy(type: VisualDocumentType): { eyebrow: string; title: string; description: string } {
  if (type === "map") return { eyebrow: "空间世界", title: "把地点放进一张真实地图", description: "上传自己的底图，建立图层、标记、区域和标签。" };
  if (type === "graph") return { eyebrow: "关系世界", title: "让人物、势力和事件形成关系", description: "拖入世界对象，连接关系，并保存可恢复的布局。" };
  if (type === "canvas") return { eyebrow: "自由画布", title: "把对象、图片与线索放在一起", description: "自由组织世界对象、文字和本地图片，不复制对象正文。" };
  if (type === "timeline") return { eyebrow: "正史时间", title: "把作者确认的事件排成故事时间线", description: "候选与放弃的路线不会混入正史。" };
  return { eyebrow: "关系树", title: "从已有图谱查看家族与组织结构", description: "树只投影已有关系，不创建第二套人物或关系真值。" };
}

function visualTutorial(type: VisualDocumentType): string {
  if (type === "map") return "用地点标记、区域、标签和图层组织空间。地图只引用世界对象，不复制对象正文。";
  if (type === "graph") return "连接真实世界对象并编辑关系类型。节点位置保存在图谱，人物与事件正文仍由 Markdown 持有。";
  if (type === "canvas") return "把对象、图片与文字组织成自由画布。对象节点保持稳定 ID。";
  if (type === "timeline") return "只把作者确认的正史事件放入轨道；候选路线不会自动进入时间线。";
  return "从现有图谱投影家族或组织层级；Tree 不创建第二套关系真值。";
}

function closeDocumentLauncher(button: HTMLButtonElement) {
  button.closest("details")?.removeAttribute("open");
}

function nextBackgroundId(existing: string[]): string {
  for (let index = 1; index < 10_000; index += 1) {
    const id = `background.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error("Could not create background id.");
}
