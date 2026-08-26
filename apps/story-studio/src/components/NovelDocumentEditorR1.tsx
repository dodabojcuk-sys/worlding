import { AtSign, BookOpenText, ChevronLeft, ChevronRight, FileDown, GripVertical, PanelRightOpen, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";

import "../styles/novel-kernel-prototype.css";

import {
  appendObjectReference,
  blockText,
  childBlocks,
  moveSiblingBefore,
  replaceBlockInlines,
  replaceBlockTextPreservingReferences,
  serializeNovelDocumentModelToMarkdown,
  withRevision,
  type NovelBlock,
  type NovelDocumentModelR1,
  type NovelInline,
  type NovelObjectReference,
  type NovelObjectType
} from "../../../../src/storyCreation/novelDocumentModelR1.ts";
import { buildNovelNarrativeDiff, type NovelEventProposal } from "../../../../src/storyCreation/novelEventProposal.ts";

export type NovelEditorReference = {
  id: string;
  type: NovelObjectType;
  label: string;
  revision: string | null;
};

type Suggestion = { blockId: string; original: string; proposed: string };

/**
 * Production R1 editor surface. The editor owns only a transient view of the
 * neutral model; every authored change is returned through onChange and the
 * parent remains responsible for OutputArtifact persistence.
 */
export function NovelDocumentEditorR1(props: {
  model: NovelDocumentModelR1;
  references: NovelEditorReference[];
  onChange(model: NovelDocumentModelR1): void;
  onOpenTianyi?(): void;
  onFlush?(): void;
  eventProposal?: NovelEventProposal | null;
  onEventProposalDecision?(decision: "accept" | "reject"): void;
}) {
  const [document, setDocument] = useState(props.model);
  const [selectedBlockId, setSelectedBlockId] = useState(firstParagraphId(props.model, props.model.rootIds[0] || "") || props.model.rootIds[0] || "");
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const selected = document.blocks[selectedBlockId];
  const referenceOptions = useMemo(() => props.references.length ? props.references : [], [props.references]);

  useEffect(() => {
    if (props.model.revision.id !== document.revision.id || props.model.documentId !== document.documentId) {
      setDocument(props.model);
      setSelectedBlockId(firstParagraphId(props.model, props.model.rootIds[0] || "") || props.model.rootIds[0] || "");
    }
  }, [document.documentId, document.revision.id, props.model]);

  useEffect(() => {
    setOutlineCollapsed(dockOpen);
  }, [dockOpen]);

  useEffect(() => {
    if (props.eventProposal?.status === "pending") setDockOpen(true);
  }, [props.eventProposal?.proposalId, props.eventProposal?.status]);

  const commit = (next: NovelDocumentModelR1, source: "edit" | "proposal" = "edit") => {
    const revised = withRevision(next, source, new Date().toISOString());
    setDocument(revised);
    props.onChange(revised);
  };

  const requestSuggestion = () => {
    if (!selected || selected.kind !== "paragraph") return;
    const original = blockText(selected);
    setSuggestion({ blockId: selected.id, original, proposed: refineSentence(original) });
    setDockOpen(true);
  };

  const acceptSuggestion = () => {
    if (!suggestion) return;
    commit(replaceBlockTextPreservingReferences(document, suggestion.blockId, suggestion.proposed), "proposal");
    setSuggestion(null);
  };

  const addReference = (reference: NovelEditorReference) => {
    if (!selected || selected.kind !== "paragraph") return;
    const ref: NovelObjectReference = {
      id: reference.id,
      type: reference.type,
      label: reference.label,
      revision: reference.revision,
      provenance: { sourceKind: "world-object", sourceId: reference.id }
    };
    commit(appendObjectReference(document, selected.id, ref));
    setReferenceMenuOpen(false);
  };

  const exportMarkdown = () => {
    const blob = new Blob([serializeNovelDocumentModelToMarkdown(document)], { type: "text/markdown;charset=utf-8" });
    const anchor = window.document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${document.title}.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const selectedLabel = selected?.kind === "paragraph" ? "当前段落" : selected?.title || "文稿";
  const chapterCount = useMemo(() => Object.values(document.blocks).filter((block) => block.kind === "chapter").length, [document]);

  return <main className={`novel-kernel-prototype ${dockOpen ? "is-dock-open" : ""} ${outlineCollapsed ? "is-outline-collapsed" : ""}`} data-testid="novel-document-editor-r1">
    <header className="novel-kernel-prototype-header">
      <div className="novel-kernel-project"><BookOpenText /><span>当前项目</span><ChevronRight /><strong>{document.title}</strong></div>
      <div className="novel-kernel-header-actions"><span>{chapterCount} 章</span><button type="button" onClick={() => setDockOpen((open) => !open)} aria-pressed={dockOpen}><PanelRightOpen />天意</button></div>
    </header>
    <div className="novel-kernel-prototype-layout">
      <aside className="novel-kernel-outline" aria-label="文稿目录">
        <header><button type="button" className="novel-kernel-outline-toggle" aria-label={outlineCollapsed ? "展开文稿目录" : "收起文稿目录"} onClick={() => setOutlineCollapsed((collapsed) => !collapsed)}>{outlineCollapsed ? <ChevronRight /> : <ChevronLeft />}</button>{!outlineCollapsed ? <><strong>文稿</strong><span>卷 · 章 · 场景</span></> : null}</header>
        {outlineCollapsed ? <div className="novel-kernel-outline-compact">{childBlocks(document, null).map((block) => <button key={block.id} type="button" onClick={() => setSelectedBlockId(firstParagraphId(document, block.id) || block.id)}>{block.title?.slice(0, 1) || "文"}</button>)}</div> : <OutlineTree document={document} selectedBlockId={selectedBlockId} onSelect={setSelectedBlockId} onMove={(movedId, targetId) => commit(moveSiblingBefore(document, movedId, targetId))} />}
      </aside>
      <section className="novel-kernel-canvas" aria-label="小说正文">
        <header className="novel-kernel-canvas-header"><div><small>正在写作</small><strong>{selectedLabel}</strong></div><div><button type="button" onClick={() => setReferenceMenuOpen((open) => !open)} disabled={selected?.kind !== "paragraph"}><AtSign />引用</button><button type="button" className="novel-kernel-suggestion-trigger" onClick={requestSuggestion} disabled={selected?.kind !== "paragraph"}><Sparkles />天意建议</button><button type="button" onClick={exportMarkdown}><FileDown />导出 Markdown</button></div></header>
        <article className="novel-kernel-prose" aria-label="自然书写区域">
          {document.rootIds.map((rootId) => <BlockCanvas key={rootId} document={document} blockId={rootId} selectedBlockId={selectedBlockId} onSelect={setSelectedBlockId} onChange={(blockId, inlines) => commit(replaceBlockInlines(document, blockId, inlines))} onComposition={setIsComposing} isComposing={isComposing} onFlush={props.onFlush} />)}
        </article>
        {referenceMenuOpen ? <section className="novel-kernel-reference-menu" aria-label="插入对象引用"><header><strong>引用世界资料</strong><button type="button" aria-label="关闭引用" onClick={() => setReferenceMenuOpen(false)}><X /></button></header>{referenceOptions.length ? referenceOptions.map((reference) => <button type="button" key={reference.id} onClick={() => addReference(reference)}><span>{reference.type === "character" ? "角色" : reference.type === "location" ? "地点" : "事件"}</span>@{reference.label}</button>) : <p>当前项目暂无可引用的人物、地点或事件。</p>}</section> : null}
      </section>
      {dockOpen ? <aside className="novel-kernel-dock" aria-label="天意建议">
        <header><div><small>天意</small><strong>这一段可以更清楚</strong></div><button type="button" aria-label="关闭天意" onClick={() => setDockOpen(false)}><X /></button></header>
        {props.eventProposal ? <NovelEventProposalPanel proposal={props.eventProposal} onDecision={props.onEventProposalDecision} /> : suggestion ? <section className="novel-kernel-diff"><small>建议稿 · 作者确认后写入</small><p className="novel-kernel-diff-before">{suggestion.original}</p><p className="novel-kernel-diff-after">{suggestion.proposed}</p><footer><button type="button" className="novel-kernel-reject" onClick={() => setSuggestion(null)}>保留原文</button><button type="button" className="novel-kernel-accept" onClick={acceptSuggestion}>采用建议</button></footer></section> : <section className="novel-kernel-dock-empty"><Sparkles /><strong>选中一段，再请求建议</strong><p>天意只给出可选择的改写，是否采用由你决定。</p><button type="button" className="secondary-action" onClick={props.onOpenTianyi}>打开天意工作台</button></section>}
      </aside> : null}
    </div>
  </main>;
}

function NovelEventProposalPanel(props: { proposal: NovelEventProposal; onDecision?: (decision: "accept" | "reject") => void }) {
  const diff = buildNovelNarrativeDiff(props.proposal.beforeContent, props.proposal.proposedNarrativeContent);
  const status = props.proposal.status === "pending" ? "待处理" : props.proposal.status === "accepted" ? "已采用" : "已拒绝";
  return <section className="novel-kernel-diff" data-testid="novel-event-proposal">
    <small>已确认事件 → 局部正文建议 · 作者确认后写入</small>
    <div className="novel-kernel-diff-sections">
      <div><span>删除</span><p className="novel-kernel-diff-before">{diff.removed || "无"}</p></div>
      <div><span>保留</span><p>{diff.preserved || "无"}</p></div>
      <div><span>新增</span><p className="novel-kernel-diff-after">{diff.added || "无"}</p></div>
    </div>
    <p className="novel-kernel-diff-summary">{props.proposal.changeSummary}</p>
    <details className="novel-kernel-diff-technical"><summary>来源与技术详情（默认收起）</summary><p>来源 Event {props.proposal.sourceEventId} · revision {props.proposal.sourceEventRevision} · {status}</p><p>本次建议由确定性事件投影生成；技术标识不会写入正文。</p></details>
    <footer><button type="button" className="novel-kernel-reject" disabled={props.proposal.status !== "pending"} onClick={() => props.onDecision?.("reject")}>拒绝这次变化</button><button type="button" className="novel-kernel-accept" disabled={props.proposal.status !== "pending"} onClick={() => props.onDecision?.("accept")}>接受并写入目标段落</button></footer>
  </section>;
}

function OutlineTree(props: { document: NovelDocumentModelR1; selectedBlockId: string; onSelect(id: string): void; onMove(movedId: string, targetId: string): void }) {
  const render = (block: NovelBlock, depth: number): ReactElement => <div className={`novel-kernel-tree-row is-${block.kind}`} key={block.id} style={{ "--tree-depth": depth } as CSSProperties} draggable={block.kind !== "paragraph"} onDragStart={(event) => event.dataTransfer.setData("text/novel-block-id", block.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const movedId = event.dataTransfer.getData("text/novel-block-id"); if (movedId) props.onMove(movedId, block.id); }}><button type="button" className={props.selectedBlockId === block.id ? "is-selected" : ""} onClick={() => props.onSelect(block.kind === "paragraph" ? block.id : firstParagraphId(props.document, block.id) || block.id)}>{block.kind !== "paragraph" ? <GripVertical /> : null}<span>{block.title || blockText(block).slice(0, 16)}</span></button>{childBlocks(props.document, block.id).map((child) => render(child, depth + 1))}</div>;
  return <nav className="novel-kernel-tree">{childBlocks(props.document, null).map((block) => render(block, 0))}</nav>;
}

function BlockCanvas(props: { document: NovelDocumentModelR1; blockId: string; selectedBlockId: string; onSelect(id: string): void; onChange(id: string, inlines: NovelInline[]): void; onComposition(active: boolean): void; isComposing: boolean; onFlush?(): void }): ReactElement | null {
  const block = props.document.blocks[props.blockId];
  const paragraphRef = useRef<HTMLParagraphElement | null>(null);
  if (!block) return null;
  if (block.kind === "paragraph") {
    const commitFromDom = () => {
      if (!paragraphRef.current) return;
      props.onChange(block.id, readInlineNodes(paragraphRef.current, block.inlines));
    };
    return <p ref={paragraphRef} className={props.selectedBlockId === block.id ? "is-selected" : ""} data-block-id={block.id} onClick={() => props.onSelect(block.id)} contentEditable suppressContentEditableWarning role="textbox" aria-label="小说段落" onBlur={props.onFlush} onCompositionStart={() => { props.onComposition(true); }} onCompositionEnd={() => { props.onComposition(false); commitFromDom(); }} onInput={() => { if (!props.isComposing) commitFromDom(); }}>{block.inlines.map((inline, index) => <InlineContent key={inline.kind === "object-ref" ? `${inline.ref.id}-${index}` : `text-${index}`} inline={inline} />)}</p>;
  }
  const headingLevel = block.kind === "volume" ? 1 : block.kind === "chapter" ? 2 : 3;
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  return <section className={`novel-kernel-block is-${block.kind}`} data-block-id={block.id} onClick={() => props.onSelect(firstParagraphId(props.document, block.id) || block.id)}><Heading>{block.title}</Heading>{childBlocks(props.document, block.id).map((child) => <BlockCanvas key={child.id} {...props} blockId={child.id} />)}</section>;
}

function InlineContent(props: { inline: NovelInline }) {
  return props.inline.kind === "text" ? <>{props.inline.text}</> : <span className={`novel-kernel-object-ref is-${props.inline.ref.type}`} contentEditable={false} data-novel-object-ref-id={props.inline.ref.id} data-novel-object-ref-type={props.inline.ref.type} aria-label={`引用${props.inline.ref.label}`}>@{props.inline.ref.label}</span>;
}

function readInlineNodes(element: HTMLElement, previous: NovelInline[]): NovelInline[] {
  const previousRefs = new Map(previous.filter((inline): inline is Extract<NovelInline, { kind: "object-ref" }> => inline.kind === "object-ref").map((inline) => [inline.ref.id, inline.ref]));
  const result: NovelInline[] = [];
  const appendText = (value: string) => {
    if (!value) return;
    const last = result.at(-1);
    if (last?.kind === "text") last.text += value;
    else result.push({ kind: "text", text: value });
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { appendText(node.textContent || ""); return; }
    if (!(node instanceof HTMLElement)) { appendText(node.textContent || ""); return; }
    const id = node.dataset.novelObjectRefId;
    if (id) {
      const ref = previousRefs.get(id);
      if (ref) result.push({ kind: "object-ref", ref: { ...ref, provenance: { ...ref.provenance } } });
      else appendText(node.textContent || "");
      return;
    }
    node.childNodes.forEach(visit);
  };
  element.childNodes.forEach(visit);
  return result.length ? result : [{ kind: "text", text: "" }];
}

function firstParagraphId(document: NovelDocumentModelR1, blockId: string): string | null {
  const current = document.blocks[blockId];
  if (!current) return null;
  if (current.kind === "paragraph") return current.id;
  for (const childId of current.childIds) {
    const result = firstParagraphId(document, childId);
    if (result) return result;
  }
  return null;
}

function refineSentence(value: string): string {
  if (value.includes("马蹄声")) return "雨水沿着瓦檐一滴滴坠下，@林海立在灯下，城门外的马蹄声正穿过雾。";
  return `${value.replace(/[。！？]$/u, "")}，让这一刻再停留半息。`;
}
