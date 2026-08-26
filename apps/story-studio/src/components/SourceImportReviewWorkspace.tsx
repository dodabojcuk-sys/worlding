import { Check, ChevronRight, FilePlus2, FileSearch, GitMerge, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SourceImportCandidateR0, SourceImportDocumentR0 } from "../lib/localTransport";

const KIND_LABELS: Record<SourceImportCandidateR0["kind"], string> = {
  actor: "人物",
  entity: "对象",
  fact: "事实",
  event: "事件",
  unit: "故事单元",
  beat: "节拍"
};

const STATUS_LABELS: Record<SourceImportCandidateR0["status"], string> = {
  pending: "待审核",
  accepted: "已送入作者控制",
  rejected: "已拒绝",
  merged: "已合并",
  stale: "来源已过期"
};

export function SourceImportReviewWorkspace(props: {
  projectTitle: string;
  documents: SourceImportDocumentR0[];
  activeDocumentId: string | null;
  busy: boolean;
  error: string;
  onClose(): void;
  onSelect(sourceDocumentId: string): void;
  onImport(file: File): Promise<void>;
  onExtract(document: SourceImportDocumentR0): Promise<void>;
  onDecide(document: SourceImportDocumentR0, candidate: SourceImportCandidateR0, decision: "accepted" | "rejected" | "merged", targetObjectId?: string | null): Promise<void>;
  onHandoff(document: SourceImportDocumentR0, candidate: SourceImportCandidateR0, authorQuestion: string): Promise<void>;
}) {
  const importRef = useRef<HTMLInputElement>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | SourceImportCandidateR0["kind"] | SourceImportCandidateR0["status"]>("all");
  const [authorQuestion, setAuthorQuestion] = useState("这个故事单元在有限信息下会走向哪里？");
  const sourceSegmentRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const document = props.documents.find((item) => item.sourceDocumentId === props.activeDocumentId) || props.documents[0] || null;
  const revision = document?.revisions.find((item) => item.revisionId === document.currentRevisionId) || null;
  const candidates = useMemo(() => {
    if (!document) return [];
    return document.candidates.filter((candidate) => filter === "all" || candidate.kind === filter || candidate.status === filter);
  }, [document, filter]);
  const selectedCandidate = candidates.find((candidate) => candidate.candidateId === selectedCandidateId) || document?.candidates.find((candidate) => candidate.candidateId === selectedCandidateId) || candidates[0] || null;

  useEffect(() => {
    const blockId = selectedCandidate?.anchor.blockId;
    if (blockId) sourceSegmentRefs.current[blockId]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedCandidate?.candidateId]);

  return <main className="source-import-review" aria-label="资料导入审核">
    <header className="source-import-header">
      <div><p className="eyebrow">资料 · 作者审核</p><h1>导入作品，先看来源</h1><p>原文保持只读。只有作者明确审核的候选，才会进入后续控制流程。</p></div>
      <div className="source-import-header-actions"><input ref={importRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void props.onImport(file); }} /><button type="button" className="secondary-action" disabled={props.busy} onClick={() => importRef.current?.click()}><FilePlus2 />导入 Markdown / TXT</button><button type="button" className="icon-action" aria-label="返回资料库" onClick={props.onClose}><X /></button></div>
    </header>
    {props.error ? <p className="source-import-error" role="alert">{props.error}</p> : null}
    <div className="source-import-grid">
      <aside className="source-import-sources" aria-label="来源列表">
        <header><strong>来源</strong><span>{props.documents.length}</span></header>
        {props.documents.length ? props.documents.map((item) => <button type="button" key={item.sourceDocumentId} className={item.sourceDocumentId === document?.sourceDocumentId ? "is-active" : ""} onClick={() => props.onSelect(item.sourceDocumentId)}><FileSearch /><span><strong>{item.title}</strong><small>{item.format.toUpperCase()} · {item.revisions.length} 个修订</small></span><ChevronRight /></button>) : <p className="source-import-empty">还没有导入作品。</p>}
      </aside>
      <section className="source-import-original" aria-label="只读原文">
        {document && revision ? <><header><div><small>只读原文</small><h2>{document.title}</h2></div><span className="source-import-safe"><ShieldCheck />来源已保全</span></header><div className="source-import-meta"><span>当前修订 {document.revisions.findIndex((item) => item.revisionId === document.currentRevisionId) + 1}</span><span>{revision.segments.length} 个段落</span><span>{revision.content.length.toLocaleString("zh-CN")} 字</span></div><div className="source-import-text" role="document" aria-label="不可变来源原文">{revision.segments.map((segment, index) => { const highlighted = selectedCandidate?.anchor.blockId === segment.blockId; const matching = document.candidates.filter((candidate) => candidate.anchor.blockId === segment.blockId); return <span key={segment.blockId}><span ref={(element) => { sourceSegmentRefs.current[segment.blockId] = element; }} className={highlighted ? "is-highlighted" : ""} role={matching.length ? "button" : undefined} tabIndex={matching.length ? 0 : undefined} onClick={() => { const first = matching[0]; if (first) setSelectedCandidateId(first.candidateId); }} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && matching[0]) { event.preventDefault(); setSelectedCandidateId(matching[0].candidateId); } }}>{segment.text}</span>{index < revision.segments.length - 1 ? "\n" : null}</span>; })}</div><details className="source-import-technical"><summary>来源与技术详情</summary><dl><div><dt>文件</dt><dd>{document.filename}</dd></div><div><dt>修订摘要</dt><dd>{revision.revisionHash.slice(0, 16)}…</dd></div><div><dt>原文模式</dt><dd>{document.mode === "reference-only" ? "仅作参考" : "提取审核"}</dd></div></dl></details></> : <div className="source-import-empty large"><FileSearch /><strong>选择一份来源开始审核</strong><span>原文不会自动写入正史或女娲。</span></div>}
      </section>
      <aside className="source-import-candidates" aria-label="候选审核">
        <header><div><small>候选</small><h2>提取并审核</h2></div>{document ? <button type="button" className="secondary-action" disabled={props.busy} onClick={() => void props.onExtract(document)}><RefreshCw />{document.candidates.length ? "重新提取" : "开始提取"}</button> : null}</header>
        {document?.candidates.length ? <><div className="source-import-filters"><button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>全部</button>{(Object.keys(KIND_LABELS) as SourceImportCandidateR0["kind"][]).map((kind) => <button type="button" key={kind} className={filter === kind ? "is-active" : ""} onClick={() => setFilter(kind)}>{KIND_LABELS[kind]}</button>)}<button type="button" className={filter === "pending" ? "is-active" : ""} onClick={() => setFilter("pending")}>待审核</button></div><div className="source-import-candidate-list">{candidates.map((candidate) => <button type="button" key={candidate.candidateId} className={`source-import-candidate ${selectedCandidate?.candidateId === candidate.candidateId ? "is-selected" : ""}`} onClick={() => setSelectedCandidateId(candidate.candidateId)}><span className="source-import-kind">{KIND_LABELS[candidate.kind]}</span><span><strong>{candidate.displayName}</strong><small>{STATUS_LABELS[candidate.status]}</small></span><ChevronRight /></button>)}{candidates.length === 0 ? <p className="source-import-empty">没有匹配的候选。</p> : null}</div></> : <div className="source-import-empty"><FileSearch /><strong>先提取候选</strong><span>确定性提取只使用原文，不调用模型。</span></div>}
        {selectedCandidate ? <section className="source-import-candidate-detail"><div className="source-import-detail-title"><span className="source-import-kind">{KIND_LABELS[selectedCandidate.kind]}</span><h3>{selectedCandidate.displayName}</h3></div><p>{selectedCandidate.summary}</p><small>证据：{selectedCandidate.excerpt}</small><span className={`source-import-status is-${selectedCandidate.status}`}>{STATUS_LABELS[selectedCandidate.status]}</span>{selectedCandidate.duplicateMatches.length ? <div className="source-import-duplicates"><strong>可能重复</strong>{selectedCandidate.duplicateMatches.map((match) => <span key={match.objectId}>{match.displayName}<small>{match.reason}</small></span>)}</div> : null}<div className="source-import-actions">{selectedCandidate.status === "pending" ? <><button type="button" className="primary-action" disabled={props.busy} onClick={() => void props.onDecide(document!, selectedCandidate, "accepted")}><Check />送入作者控制</button><button type="button" className="secondary-action" disabled={props.busy} onClick={() => void props.onDecide(document!, selectedCandidate, "rejected")}><X />拒绝</button>{selectedCandidate.duplicateMatches.length && selectedCandidate.kind === "actor" ? <button type="button" className="secondary-action" disabled={props.busy} onClick={() => void props.onDecide(document!, selectedCandidate, "merged", selectedCandidate.duplicateMatches[0].objectId)}><GitMerge />合并到现有人物</button> : null}</> : null}{selectedCandidate.kind === "unit" && (selectedCandidate.status === "accepted" || selectedCandidate.status === "merged") ? <><label className="source-import-question"><span>交给女娲前的作者问题</span><textarea value={authorQuestion} rows={2} onChange={(event) => setAuthorQuestion(event.target.value)} /></label><button type="button" className="primary-action" disabled={props.busy} onClick={() => void props.onHandoff(document!, selectedCandidate, authorQuestion)}><Send />交给女娲排演</button></> : null}</div><details className="source-import-technical"><summary>查看来源锚点</summary><dl><div><dt>行</dt><dd>{selectedCandidate.anchor.lineStart}–{selectedCandidate.anchor.lineEnd}</dd></div><div><dt>区块</dt><dd>{selectedCandidate.anchor.blockId || "纯文本段落"}</dd></div><div><dt>候选 ID</dt><dd>{selectedCandidate.candidateId}</dd></div></dl></details></section> : null}
      </aside>
    </div>
  </main>;
}
