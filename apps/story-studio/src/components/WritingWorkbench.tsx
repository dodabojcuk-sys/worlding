import { AlertTriangle, BookOpenText, BrainCircuit, CheckCircle2, History, Link2, LoaderCircle, MessageCircle, Save, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import type { WritingDocument, WorldObjectSummary } from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";

type WritingSaveState = "saved" | "unsaved" | "saving" | "conflict";
type WritingTool = "objects" | "guard" | "exploration" | "history";
export type WritingEditorInteraction = { focused: boolean; selectionStart: number; selectionEnd: number; scrollTop: number };
export type WritingEditorRestoreSnapshot = WritingEditorInteraction & { requestId: number };

export function WritingWorkbench(props: {
  projectId: string;
  projectTitle: string;
  chapterId: string | null;
  chapterTitle: string | null;
  document: WritingDocument | null;
  confirmedEvents: WorldObjectSummary[];
  selection: WorkspaceSelection;
  saveState: WritingSaveState;
  scrollTop: number;
  editorFocusRequest: number;
  editorRestoreSnapshot: WritingEditorRestoreSnapshot | null;
  conflictDocument: WritingDocument | null;
  onBody(body: string): void;
  onStatus(status: string): void;
  onSave(): void;
  onReloadConflict(): void;
  onOpenObject(object: WorldObjectSummary): void;
  onSelectObject(object: WorldObjectSummary): void;
  onScrollTop(value: number): void;
  onEditorInteraction(value: WritingEditorInteraction): void;
  onOpenNavigator(): void;
  onOpenImpactReview(): void;
  onOpenCreativeTianyi(): void;
  onPrepareTianyi(): void;
  onOpenTianyi(): void;
  onOpenHistory(): void;
  startWritingBusy: boolean;
  startWritingError: string;
  onStartWriting(): void;
}) {
  const document = props.document;
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const editorInteractionRef = useRef<WritingEditorInteraction | null>(null);
  const [activeTool, setActiveTool] = useState<WritingTool | null>(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.scrollTop = props.scrollTop;
  }, [document?.id, props.scrollTop]);

  useEffect(() => {
    setActiveTool(null);
  }, [document?.id]);

  useEffect(() => {
    if (props.editorFocusRequest <= 0 || !editorRef.current) return;
    const editor = editorRef.current;
    window.requestAnimationFrame(() => {
      editor.focus({ preventScroll: true });
      const end = editor.value.length;
      editor.setSelectionRange(end, end);
      editor.scrollTop = editor.scrollHeight;
      props.onScrollTop(editor.scrollTop);
    });
  }, [props.editorFocusRequest]);

  useEffect(() => {
    const snapshot = props.editorRestoreSnapshot;
    const editor = editorRef.current;
    if (!snapshot || !editor) return;
    window.requestAnimationFrame(() => {
      const start = Math.min(editor.value.length, Math.max(0, snapshot.selectionStart));
      const end = Math.min(editor.value.length, Math.max(start, snapshot.selectionEnd));
      editor.setSelectionRange(start, end);
      editor.scrollTop = Math.max(0, snapshot.scrollTop);
      if (snapshot.focused) editor.focus({ preventScroll: true });
      props.onScrollTop(editor.scrollTop);
      props.onEditorInteraction({ focused: snapshot.focused, selectionStart: start, selectionEnd: end, scrollTop: editor.scrollTop });
    });
  }, [document?.id, props.editorRestoreSnapshot?.requestId]);

  function captureEditorInteraction(): void {
    const editor = editorRef.current;
    if (!editor) return;
    editorInteractionRef.current = {
      focused: window.document.activeElement === editor,
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
      scrollTop: editor.scrollTop
    };
  }

  function reportEditorInteraction(editor: HTMLTextAreaElement, focused = window.document.activeElement === editor): void {
    props.onEditorInteraction({ focused, selectionStart: editor.selectionStart, selectionEnd: editor.selectionEnd, scrollTop: editor.scrollTop });
  }

  function toggleTool(tool: WritingTool): void {
    const snapshot = editorInteractionRef.current;
    setActiveTool((current) => current === tool ? null : tool);
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor || !snapshot) return;
      editor.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      editor.scrollTop = snapshot.scrollTop;
      if (snapshot.focused) editor.focus({ preventScroll: true });
      editorInteractionRef.current = null;
    });
  }

  const locationLabel = document
    ? [props.chapterTitle, document.type === "scene" ? document.title : null].filter(Boolean).join(" / ") || document.title
    : "创作工作区";

  return <section
    className="workbench writing-workbench"
    data-testid="writing-workbench"
    data-project-id={props.projectId}
    data-document-id={document?.id || ""}
    data-chapter-id={props.chapterId || ""}
    data-scene-id={document?.type === "scene" ? document.id : ""}
  >
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="创作" title={locationLabel} context={document?.title || "尚未选择文档"} status={writingSaveLabel(props.saveState)} prototype="editor" icon={<BookOpenText />} className="writing-workbench-bar" onOpenNavigation={props.onOpenNavigator} actions={<span className={`save-state is-${props.saveState}`} role="status" aria-live="polite">{writingSaveLabel(props.saveState)}</span>} />
    {!document ? <article className="writing-empty-state"><BookOpenText /><h1>从第一章开始写作</h1><p>一次建立默认章节和第一个场景，然后直接把光标放进正文。</p><button type="button" className="primary-action" data-testid="start-writing" onClick={props.onStartWriting} disabled={props.startWritingBusy}>{props.startWritingBusy ? <LoaderCircle className="spin" /> : <BookOpenText />}{props.startWritingBusy ? "正在准备写作" : "开始写作"}</button>{props.startWritingError && <p className="writing-start-error" role="alert">{props.startWritingError}</p>}</article> : <div className="writing-layout" data-writing-tool={activeTool ?? "closed"}>
      <main className="draft-writing-surface">
        {props.saveState === "conflict" && props.conflictDocument && <div className="writing-conflict" role="alert"><AlertTriangle /><span><strong>磁盘中的草稿已经改变</strong><small>当前文字没有覆盖外部版本。</small></span><button type="button" onClick={props.onReloadConflict}>重新读取</button></div>}
        <header className="draft-document-heading">
          <div><span>{document.type === "chapter" ? "章节" : "场景"}</span><strong>{document.title}</strong></div>
          <label>状态<select value={document.status} onChange={(event) => props.onStatus(event.target.value)}><option value="drafting">写作中</option><option value="reviewing">待检查</option><option value="revising">修订中</option><option value="completed">已完成</option></select></label>
        </header>
        <section className="writing-confirmed-events" data-testid="writing-confirmed-events" aria-label="已确认事件包">
          <span><CheckCircle2 /><strong>已确认事件</strong><small>仅包含作者已经采用的事实</small></span>
          <div>{props.confirmedEvents.length ? props.confirmedEvents.map((event) => <button type="button" key={event.id} onClick={() => props.onOpenObject(event)}>{event.title}</button>) : <small>作者确认事件后，将在这里作为写作投影出现。</small>}</div>
        </section>
        <textarea ref={editorRef} className="draft-markdown-editor" value={document.body} onScroll={(event) => { props.onScrollTop(event.currentTarget.scrollTop); reportEditorInteraction(event.currentTarget); }} onSelect={(event) => reportEditorInteraction(event.currentTarget)} onFocus={(event) => reportEditorInteraction(event.currentTarget, true)} onBlur={(event) => reportEditorInteraction(event.currentTarget, false)} onChange={(event) => props.onBody(event.target.value)} spellCheck aria-label="Markdown 草稿" placeholder="# 当前场景\n\n从这里开始写……" />
        <footer className="draft-writing-footer">
          <span>使用 <code>[[对象标题]]</code> 把世界资料带入当前场景。</span>
          <button type="button" className="primary-action" disabled={props.saveState === "saved" || props.saveState === "saving" || props.saveState === "conflict"} onClick={props.onSave}><Save />{writingSaveActionLabel(props.saveState)}</button>
        </footer>
      </main>
      <aside className={`writing-tools ${activeTool ? "is-open" : ""}`} data-testid="writing-tools">
        {activeTool && <div className="writing-context-panel" role="region" aria-label={writingToolLabel(activeTool)} data-testid="writing-tool-panel">
        {activeTool === "objects" && <section className="writing-context-section">
          <header><Link2 /><strong>当前场景对象</strong><span>{document.mentionedObjects.length}</span></header>
          <ObjectLinks objects={document.mentionedObjects} selection={props.selection} onSelect={props.onSelectObject} onOpen={props.onOpenObject} />
          {!document.mentionedObjects.length && <p>在草稿中输入 <code>[[对象标题]]</code> 建立上下文。</p>}
        </section>}
        {activeTool === "guard" && <section className="writing-context-section world-guard-section">
          <header><ShieldCheck /><strong>世界守卫</strong></header>
          <GuardGroup title="人物" objects={document.guard.characters} onOpen={props.onOpenObject} />
          <GuardGroup title="地点" objects={document.guard.locations} onOpen={props.onOpenObject} />
          <GuardGroup title="事件" objects={document.guard.events} onOpen={props.onOpenObject} />
          {document.guard.rules.map((rule) => <article className="guard-fact" key={rule.id}><CheckCircle2 /><span><strong>{rule.title}</strong><small>{rule.summary}</small></span></article>)}
          {document.guard.threads.map((thread) => <article className="guard-fact is-thread" key={thread.id}><Sparkles /><span><strong>{thread.title}</strong><small>{thread.summary}</small></span></article>)}
          {!document.guard.characters.length && !document.guard.locations.length && !document.guard.events.length && !document.guard.rules.length && !document.guard.threads.length && <p>链接人物、地点、事件、规则或伏笔后，这里会显示约束。</p>}
        </section>}
        {activeTool === "exploration" && <section className="writing-context-section writing-bridge-section">
          <header><BrainCircuit /><strong>故事推演</strong></header>
          <p>带着当前场景和已链接的世界事实查看后果。任何候选变化都必须由作者选择。</p>
          <div><button type="button" onClick={props.onOpenImpactReview}>继续影响评审</button><button type="button" onClick={props.onOpenCreativeTianyi}>向天意说明推演意图</button></div>
        </section>}
        {activeTool === "history" && <section className="writing-context-section writing-bridge-section">
          <header><History /><strong>创作历史</strong></header>
          <p>查看已经完成的影响评审、作者选择与世界事件记录。</p>
          <div><button type="button" onClick={props.onOpenHistory}>查看评审历史</button></div>
        </section>}
        </div>}
        <nav className="writing-tool-rail" aria-label="当前写作工具" data-testid="writing-tool-rail" data-navigation-scope="contextual">
          <button type="button" aria-label="打开快速天意" title="打开快速天意" data-tool-group="partner" onPointerDown={() => { captureEditorInteraction(); props.onPrepareTianyi(); }} onClick={props.onOpenTianyi}><MessageCircle /><span>天意</span></button>
          <WritingToolButton tool="objects" label="场景资料" group="context" activeTool={activeTool} count={document.mentionedObjects.length} icon={<Link2 />} onPointerDown={captureEditorInteraction} onToggle={toggleTool} />
          <WritingToolButton tool="guard" label="连续性" group="context" activeTool={activeTool} icon={<ShieldCheck />} onPointerDown={captureEditorInteraction} onToggle={toggleTool} />
          <WritingToolButton tool="exploration" label="推演" group="workflow" activeTool={activeTool} icon={<BrainCircuit />} onPointerDown={captureEditorInteraction} onToggle={toggleTool} />
          <WritingToolButton tool="history" label="历史" group="workflow" activeTool={activeTool} icon={<History />} onPointerDown={captureEditorInteraction} onToggle={toggleTool} />
        </nav>
      </aside>
    </div>}
  </section>;
}

function WritingToolButton(props: {
  tool: WritingTool;
  label: string;
  group: "context" | "workflow";
  activeTool: WritingTool | null;
  count?: number;
  icon: ReactNode;
  onPointerDown(): void;
  onToggle(tool: WritingTool): void;
}) {
  const active = props.activeTool === props.tool;
  const actionLabel = active ? `关闭${props.label}` : `打开${props.label}`;
  return <button type="button" aria-label={actionLabel} title={actionLabel} aria-pressed={active} data-tool-group={props.group} onPointerDown={props.onPointerDown} onClick={() => props.onToggle(props.tool)}>{props.icon}<span>{props.label}</span>{props.count !== undefined && <small>{props.count}</small>}</button>;
}

function writingToolLabel(tool: WritingTool): string {
  return ({ objects: "当前场景对象", guard: "世界守卫", exploration: "故事推演", history: "创作历史" } as const)[tool];
}

function ObjectLinks(props: { objects: WorldObjectSummary[]; selection: WorkspaceSelection; onSelect(object: WorldObjectSummary): void; onOpen(object: WorldObjectSummary): void }) {
  return <div className="writing-object-links">{props.objects.map((object) => <button type="button" className={props.selection.objectId === object.id ? "is-selected" : ""} onClick={() => props.onSelect(object)} onDoubleClick={() => props.onOpen(object)} key={object.id}><span><strong>{object.title}</strong><small>{worldObjectTypeLabel(object.type)}</small></span></button>)}</div>;
}

function GuardGroup(props: { title: string; objects: WorldObjectSummary[]; onOpen(object: WorldObjectSummary): void }) {
  if (!props.objects.length) return null;
  return <div className="guard-group"><span>{props.title}</span>{props.objects.map((object) => <button type="button" onClick={() => props.onOpen(object)} key={object.id}>{object.title}</button>)}</div>;
}

function writingSaveLabel(state: WritingSaveState): string {
  return ({ saved: "已保存", unsaved: "有未保存修改", saving: "正在保存", conflict: "等待处理冲突" })[state];
}

function writingSaveActionLabel(state: WritingSaveState): string {
  return ({ saved: "已保存", unsaved: "保存草稿", saving: "正在保存", conflict: "处理冲突后保存" })[state];
}

function worldObjectTypeLabel(type: WorldObjectSummary["type"]): string {
  return ({ character: "人物", location: "地点", event: "事件", item: "物品", faction: "势力", rule: "规则", thread: "伏笔" } as const)[type];
}
