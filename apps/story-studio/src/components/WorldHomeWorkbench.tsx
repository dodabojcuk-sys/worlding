import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileSearch,
  FileText,
  GitFork,
  HardDrive,
  Map,
  Network,
  RefreshCw,
  Shapes,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import { useMemo, useState } from "react";

import type {
  StorageTransparency,
  StoryStudioProject,
  VisualDocumentType,
  WorldObjectSummary,
  WorldObjectType,
  WritingDocument,
  WritingDocumentSummary
} from "../lib/localTransport";
import type { WorldDocumentTab } from "./WorldDocumentTabs";
import { NewWorldDocumentMenu } from "./NewWorldDocumentMenu";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";

export function WorldHomeWorkbench(props: {
  project: StoryStudioProject;
  tabs: WorldDocumentTab[];
  counts: Record<WorldObjectType, number>;
  objects: WorldObjectSummary[];
  activeWritingChapter: (WritingDocumentSummary & { scenes: WritingDocumentSummary[] }) | null;
  activeWritingDocument: WritingDocument | null;
  confirmedEvents: WorldObjectSummary[];
  candidateCount: number;
  providerConnected: boolean;
  storage: StorageTransparency | null;
  storageLoading: boolean;
  storageError: string;
  onOpenLibrary(): void;
  onOpen(tab: WorldDocumentTab): void;
  onContinueWriting(): void;
  onOpenEventLine(): void;
  onOpenObject(object: WorldObjectSummary): void;
  onGiveToTianyi(object?: WorldObjectSummary): void;
  onCreateObject(): void;
  onCreateVisual(type: VisualDocumentType): void;
  onCreateFolder(): void;
  onStorageSettings(): void;
}) {
  const [focusedObjectId, setFocusedObjectId] = useState<string | null>(null);
  const recent = props.tabs.slice(0, 4);
  const objectCount = Object.values(props.counts).reduce((sum, value) => sum + value, 0);
  const focusedObject = props.objects.find((object) => object.id === focusedObjectId) || null;
  const mentionedIds = new Set(props.activeWritingDocument?.mentionedObjects.map((object) => object.id) || []);
  const focusItems = useMemo(() => uniqueObjects([
    ...(props.activeWritingDocument?.mentionedObjects || []),
    ...props.confirmedEvents,
    ...props.objects.filter((object) => object.type === "character"),
    ...props.objects.filter((object) => ["event", "rule", "item", "thread"].includes(object.type))
  ]).slice(0, 9), [props.activeWritingDocument, props.confirmedEvents, props.objects]);
  const related = focusedObject ? props.objects.filter((object) => {
    if (object.id === focusedObject.id) return false;
    if (mentionedIds.has(focusedObject.id) && mentionedIds.has(object.id)) return true;
    return focusedObject.tags.some((tag) => object.tags.includes(tag));
  }).slice(0, 4) : [];
  const currentActors = uniqueObjects([
    ...(props.activeWritingDocument?.mentionedObjects.filter((object) => object.type === "character") || []),
    ...props.objects.filter((object) => object.type === "character")
  ]).slice(0, 4);
  const excerpt = writingExcerpt(props.activeWritingDocument?.body || "");
  const writingAction = props.activeWritingDocument
    ? { label: "继续写作", detail: "回到当前写作" }
    : props.activeWritingChapter
      ? { label: "选择章节", detail: "选择要继续的章节" }
      : { label: "开始写作", detail: "从创作 Hub 选择一种写作方式" };

  return <section className="workbench world-home-workbench" data-testid="world-home">
    <WorkspaceHeader projectTitle={props.project.title} sectionLabel="世界" title="世界概览" context={props.activeWritingDocument?.title || "当前项目"} status={`${props.confirmedEvents.length} 条已确认事件`} prototype="hub" icon={<BookOpen />} onOpenNavigation={props.onOpenLibrary} />
    <main className="world-pulse-stage">
      <header className="world-pulse-heading">
        <span><Activity /><strong>世界脉搏</strong><small>只读投影 · 世界正在回应当前写作</small></span>
        <em className={props.providerConnected ? "is-connected" : ""}><CircleDot />{props.providerConnected ? "模型协作可用" : "本地世界"}</em>
      </header>

      <div className="world-pulse-grid">
        <section className="world-pulse-current" aria-labelledby="world-pulse-current-title">
          <p className="eyebrow">当前写作</p>
          <h1 id="world-pulse-current-title">{props.activeWritingDocument?.title || props.project.title}</h1>
          <p className="world-pulse-location">
            {props.activeWritingChapter?.title || "尚未选择章节"}
            {props.activeWritingDocument ? ` · ${props.activeWritingDocument.type === "scene" ? "场景" : "章节"}` : " · 世界首页"}
          </p>
          <p className="world-pulse-excerpt">{excerpt || "正文尚未开始。世界资料会在作者创建后出现在这里。"}</p>
          <div className="world-pulse-actions">
            <button type="button" className="primary-action" data-testid="world-pulse-continue-writing" aria-label={writingAction.detail} onClick={props.onContinueWriting}>{writingAction.label}<ArrowRight /></button>
            <button type="button" className="secondary-action" onClick={props.onOpenEventLine}>查看事件线</button>
            <button type="button" className="secondary-action" onClick={() => props.onGiveToTianyi(focusedObject || props.confirmedEvents[0] || props.objects[0])} disabled={!focusedObject && !props.confirmedEvents.length && !props.objects.length}><Sparkles />问天意</button>
          </div>
          <dl className="world-pulse-metrics">
            <div><dt>已确认事件</dt><dd>{props.confirmedEvents.length}</dd></div>
            <div><dt>候选变化</dt><dd>{Math.max(0, props.candidateCount)}</dd></div>
            <div><dt>当前人物</dt><dd>{currentActors.length}</dd></div>
            <div><dt>世界资料</dt><dd>{objectCount}</dd></div>
          </dl>
        </section>

        {focusedObject ? <WorldLocalFocus
          object={focusedObject}
          related={related}
          mentionedInWriting={mentionedIds.has(focusedObject.id)}
          confirmedEvent={props.confirmedEvents.some((event) => event.id === focusedObject.id)}
          onFocus={(object) => setFocusedObjectId(object.id)}
          onClose={() => setFocusedObjectId(null)}
          onOpen={() => props.onOpenObject(focusedObject)}
          onTianyi={() => props.onGiveToTianyi(focusedObject)}
        /> : <section className="world-pulse-focus" aria-labelledby="world-pulse-focus-title">
          <header><span><FileSearch /></span><div><p className="eyebrow">局部世界聚焦</p><h2 id="world-pulse-focus-title">从当前任务进入世界</h2></div></header>
          <p>选择人物、事件或证据，只展开与当前写作有明确连接的局部邻域。</p>
          {focusItems.length ? <div className="world-pulse-focus-list">{focusItems.map((object) => <button
            type="button"
            key={object.id}
            data-focus-type={object.type}
            onClick={() => setFocusedObjectId(object.id)}
          ><span>{focusIcon(object.type)}</span><span><strong>{object.title}</strong><small>{focusLabel(object, mentionedIds, props.confirmedEvents)}</small></span><ChevronRight /></button>)}</div> : <div className="world-pulse-empty"><FileSearch /><strong>还没有可聚焦资料</strong><span>缺失信息保持为空，不生成虚构关系。</span></div>}
        </section>}
      </div>

      <section className="world-pulse-strip" aria-label="当前世界状态">
        <article><Clock3 /><span><small>写作位置</small><strong>{props.activeWritingDocument?.title || "尚未开始"}</strong></span></article>
        <article><CheckCircle2 /><span><small>最近确认</small><strong>{props.confirmedEvents[0]?.title || "暂无已确认事件"}</strong></span></article>
        <article><Sparkles /><span><small>待作者审查</small><strong>{props.candidateCount > 0 ? `${props.candidateCount} 条候选变化` : "没有待审查候选"}</strong></span></article>
      </section>

      <section className="world-pulse-lower">
        <div className="world-pulse-actors">
          <header><span><UserRound />当前人物</span><small>{currentActors.length ? "来自当前写作提及与已有资料" : "尚未确认"}</small></header>
          {currentActors.length ? <div>{currentActors.map((object) => <button type="button" key={object.id} onClick={() => setFocusedObjectId(object.id)}><span>{object.title.slice(0, 1)}</span><strong>{object.title}</strong></button>)}</div> : <p>创建人物或在正文中提及后，这里会显示真实引用。</p>}
        </div>
        <div className="world-home-recents">
          <header><span><Clock3 />最近文档</span><NewWorldDocumentMenu compact onCreateObject={props.onCreateObject} onCreateVisual={props.onCreateVisual} onCreateFolder={props.onCreateFolder} /></header>
          {recent.length ? recent.map((tab) => <button type="button" onClick={() => props.onOpen(tab)} key={`${tab.kind}:${tab.id}`}>{homeDocumentIcon(tab)}<span><strong>{tab.title}</strong><small>{homeDocumentType(tab)}</small></span><ArrowRight /></button>) : <p>打开或创建一份世界文档后，它会出现在这里。</p>}
        </div>
      </section>

      <button type="button" className={`world-home-storage-summary ${props.storageError ? "is-error" : ""}`} onClick={props.onStorageSettings} aria-label="查看当前故事位置与备份说明">
        <span className="storage-summary-icon">{props.storageLoading ? <RefreshCw className="spin" /> : <HardDrive />}</span>
        <span><strong>{props.storage?.persistenceState === "verified-local" ? "已保存到本地" : props.storageError ? "暂时无法确认故事位置" : "正在确认故事位置"}</strong><small>{props.storage?.persistenceState === "verified-local" ? `本地工作区 · ${props.project.title}` : props.storageError || "读取本地存储状态…"}</small></span>
        {props.storage?.persistenceState === "verified-local" ? <CheckCircle2 /> : <ChevronRight />}
      </button>
    </main>
  </section>;
}

function WorldLocalFocus(props: {
  object: WorldObjectSummary;
  related: WorldObjectSummary[];
  mentionedInWriting: boolean;
  confirmedEvent: boolean;
  onFocus(object: WorldObjectSummary): void;
  onClose(): void;
  onOpen(): void;
  onTianyi(): void;
}) {
  const canAskTianyi = ["character", "location", "event", "item", "rule"].includes(props.object.type);
  return <aside className="world-local-focus" data-testid="world-local-focus" data-focus-object-id={props.object.id}>
    <header><span>{focusIcon(props.object.type)}</span><div><p className="eyebrow">{worldObjectTypeLabel(props.object.type)}</p><h2>{props.object.title}</h2></div><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭局部聚焦"><X /></button></header>
    <div className="world-local-focus-status"><span>{props.confirmedEvent ? "已确认事件" : props.object.status || "状态未知"}</span>{props.object.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
    <dl>
      <div><dt>Object</dt><dd>{worldObjectTypeLabel(props.object.type)} · {props.object.title}</dd></div>
      <div><dt>Relation</dt><dd>{props.mentionedInWriting ? "当前正文明确提及" : props.related.length ? "与局部资料共享明确标签" : "尚无可验证关系"}</dd></div>
      <div><dt>Time</dt><dd>{props.confirmedEvent ? "已经作者确认" : "未进入已确认事件线"}</dd></div>
      <div><dt>Intent</dt><dd>{props.object.type === "character" ? "尚未由作者确认当前意图" : "不适用或未知"}</dd></div>
    </dl>
    <section><header><strong>局部邻域</strong><small>只显示明确引用</small></header>{props.related.length ? <div>{props.related.map((object) => <button type="button" onClick={() => props.onFocus(object)} key={object.id}><span>{focusIcon(object.type)}</span><span><strong>{object.title}</strong><small>{worldObjectTypeLabel(object.type)}</small></span></button>)}</div> : <p>没有可验证的相邻资料。世界不会用假关系填满空白。</p>}</section>
    <footer>{canAskTianyi ? <button type="button" className="secondary-action" onClick={props.onTianyi}><Sparkles />带着此焦点问天意</button> : null}<button type="button" className="primary-action" onClick={props.onOpen}>打开完整资料<ArrowRight /></button></footer>
  </aside>;
}

function uniqueObjects(objects: WorldObjectSummary[]): WorldObjectSummary[] {
  return objects.filter((object, index, all) => all.findIndex((candidate) => candidate.id === object.id) === index);
}

function writingExcerpt(body: string): string {
  return body.replace(/^---[\s\S]*?---/u, "").replace(/^#+\s.*$/gmu, "").replace(/\s+/gu, " ").trim().slice(0, 220);
}

function focusLabel(object: WorldObjectSummary, mentionedIds: Set<string>, confirmedEvents: WorldObjectSummary[]): string {
  if (confirmedEvents.some((event) => event.id === object.id)) return "已确认事件";
  if (mentionedIds.has(object.id)) return "当前正文提及";
  return worldObjectTypeLabel(object.type);
}

function focusIcon(type: WorldObjectType) {
  if (type === "character") return <UserRound />;
  if (type === "event") return <Clock3 />;
  if (type === "location") return <Map />;
  return <FileSearch />;
}

function worldObjectTypeLabel(type: WorldObjectType): string {
  return ({ character: "人物", location: "地点", event: "事件", item: "物件 / 证据", faction: "阵营", rule: "规则 / 证据", thread: "线索" } as Record<WorldObjectType, string>)[type];
}

function homeDocumentIcon(tab: WorldDocumentTab) {
  if (tab.kind === "object") return <FileText />;
  const type = tab.type as VisualDocumentType;
  return type === "map" ? <Map /> : type === "graph" ? <GitFork /> : type === "canvas" ? <Shapes /> : type === "timeline" ? <Clock3 /> : <Network />;
}

function homeDocumentType(tab: WorldDocumentTab) {
  if (tab.kind === "object") return "世界卡片";
  return tab.type === "map" ? "地图" : tab.type === "graph" ? "关系图谱" : tab.type === "canvas" ? "画布" : tab.type === "timeline" ? "时间线" : "Tree";
}
