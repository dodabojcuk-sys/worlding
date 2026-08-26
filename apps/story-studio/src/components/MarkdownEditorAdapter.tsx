import { Eye, FileDown, FileUp, Pencil, Plus, Redo2, Search, Sparkles, Trash2, Undo2 } from "lucide-react";
import { createElement, useMemo, useRef, useState } from "react";

import { appendMarkdownHeading, markdownHeadingAtOffset, markdownOutline, markdownWordCount, removeMarkdownSection, renameMarkdownHeading, reorderMarkdownSection } from "../../../../src/storyCreation/markdownDocumentModel";
import { applyCompositionEvent, type CompositionState } from "../../../../src/storyCreation/compositionBuffer";

export function MarkdownEditorAdapter(props: { value: string; onChange(value: string): void; onFlush(): void; onTianyi(selection: { start: number; end: number; text: string }): void }) {
  const [draft, setDraft] = useState(props.value);
  const [preview, setPreview] = useState(false);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [history, setHistory] = useState<string[]>([props.value]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const composition = useRef<CompositionState>({ active: false, value: props.value });
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const outline = useMemo(() => markdownOutline(draft).filter((item) => !query || item.title.toLowerCase().includes(query.toLowerCase())), [draft, query]);
  const count = useMemo(() => markdownWordCount(draft), [draft]);
  const commit = (value: string, record = true) => {
    setDraft(value);
    if (record) { const next = [...history.slice(0, historyIndex + 1), value].slice(-100); setHistory(next); setHistoryIndex(next.length - 1); }
    if (!composition.current.active) props.onChange(value);
  };
  const moveHistory = (index: number) => { const value = history[index]; if (value === undefined) return; setHistoryIndex(index); setDraft(value); props.onChange(value); };
  const importFile = (file: File | null) => { if (!file) return; void file.text().then((value) => commit(value)); };
  const download = () => { const blob = new Blob([draft], { type: "text/markdown;charset=utf-8" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "document.md"; anchor.click(); URL.revokeObjectURL(anchor.href); };
  return <main className="creation-surface novel-markdown-surface" data-creation-surface="novel" data-editor-adapter="native-markdown-r0">
    <aside aria-label="卷章与场景文稿树"><header><strong>文稿树</strong><button type="button" aria-label="新增章节" onClick={() => commit(appendMarkdownHeading(draft, 2, `新章节 ${outline.length + 1}`))}><Plus /></button></header><label><Search /><input aria-label="搜索文稿树" value={query} onChange={(event) => setQuery(event.target.value)} /></label>{outline.map((item) => <div className="creation-outline-item" draggable key={item.id} style={{ paddingLeft: `${item.depth * 7}px` }} onDragStart={(event) => event.dataTransfer.setData("text/markdown-heading", item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const moved = event.dataTransfer.getData("text/markdown-heading"); if (moved && moved !== item.id) commit(reorderMarkdownSection(draft, moved, item.id)); }}><button type="button" className={markdownHeadingAtOffset(draft, selection.start)?.id === item.id ? "is-active" : ""} onClick={() => { textarea.current?.focus(); textarea.current?.setSelectionRange(item.start, item.start); }}><span>{item.title}</span><small>H{item.depth}</small></button><button type="button" aria-label={`重命名${item.title}`} onClick={() => { const title = window.prompt("重命名章节", item.title); if (title?.trim()) commit(renameMarkdownHeading(draft, item.id, title)); }}><Pencil /></button><button type="button" aria-label={`删除${item.title}`} onClick={() => { if (window.confirm(`删除“${item.title}”及其正文？此操作可以用撤销恢复。`)) commit(removeMarkdownSection(draft, item.id)); }}><Trash2 /></button></div>)}{!outline.length ? <p>添加章节，开始写作。</p> : null}</aside>
    <article className="markdown-editor-pane"><header><div><button type="button" onClick={() => moveHistory(historyIndex - 1)} disabled={historyIndex <= 0}><Undo2 />撤销</button><button type="button" onClick={() => moveHistory(historyIndex + 1)} disabled={historyIndex >= history.length - 1}><Redo2 />重做</button><button type="button" onClick={() => setPreview((value) => !value)}><Eye />{preview ? "编辑" : "预览"}</button><label className="markdown-file-action"><FileUp />导入 .md<input type="file" accept=".md,.markdown,text/markdown,text/plain" onChange={(event) => importFile(event.target.files?.[0] || null)} /></label><button type="button" onClick={download}><FileDown />导出 .md</button></div><span>{count.characters.toLocaleString("zh-CN")} 字</span></header>
      {preview ? <div className="markdown-safe-preview" aria-label="正文预览">{renderMarkdown(draft)}</div> : <textarea ref={textarea} className="prose-editor markdown-source-editor" aria-label="小说正文" value={draft} onCompositionStart={() => { composition.current = applyCompositionEvent(composition.current, { type: "start" }).state; }} onCompositionEnd={(event) => { const result = applyCompositionEvent(composition.current, { type: "end", value: event.currentTarget.value }); composition.current = result.state; if (result.commit !== null) commit(result.commit); }} onChange={(event) => { const result = applyCompositionEvent(composition.current, { type: "change", value: event.target.value }); composition.current = result.state; setDraft(result.state.value); if (result.commit !== null) commit(result.commit); }} onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} onBlur={props.onFlush} placeholder="# 卷一\n\n## 第一章\n\n从这里开始……" />}
      <footer><span>选中一段文字，再向天意征求意见。</span><button type="button" className="secondary-action" onClick={() => props.onTianyi({ ...selection, text: draft.slice(selection.start, selection.end) })}><Sparkles />将选区交给天意</button></footer>
    </article>
  </main>;
}

function renderMarkdown(source: string) {
  return source.split(/\n{2,}/u).map((block, index) => { const heading = block.match(/^(#{1,6})\s+(.+)$/u); if (heading) return createElement(`h${Math.min(6, heading[1].length)}`, { key: index }, heading[2]); return <p key={index}>{block.split("\n").map((line, lineIndex) => <span key={lineIndex}>{line}{lineIndex < block.split("\n").length - 1 ? <br /> : null}</span>)}</p>; });
}
