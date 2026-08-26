import { Clock3, Eye, Flag, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { alignCharacterCardHistory, type CharacterHistoryOwner } from "../../../../src/storyCardPresentation/characterCardHistoryProjection";
import type { DocumentRevisionHistory, DocumentRevisionPreview } from "../lib/localTransport";

export function CharacterCardHistoryPanel(props: {
  open: boolean;
  title: string;
  markdown: DocumentRevisionHistory | null;
  presentation: DocumentRevisionHistory | null;
  preview: { owner: CharacterHistoryOwner; value: DocumentRevisionPreview } | null;
  busy: boolean;
  error: string;
  onClose(): void;
  onPreview(owner: CharacterHistoryOwner, revisionId: string): void;
  onMilestone(owner: CharacterHistoryOwner, revisionId: string, title: string): void;
  onRestore(owner: CharacterHistoryOwner, revisionId: string): void;
}) {
  const [milestone, setMilestone] = useState<{ owner: CharacterHistoryOwner; revisionId: string } | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [restore, setRestore] = useState<{ owner: CharacterHistoryOwner; revisionId: string } | null>(null);
  if (!props.open) return null;
  const actions = props.markdown && props.presentation ? alignCharacterCardHistory({ markdown: props.markdown, presentation: props.presentation }) : [];
  return <aside className="document-revision-panel character-card-history-panel" aria-label="人物卡组合历史" data-testid="character-card-history-panel">
    <header><span><Clock3 /><strong>人物卡历史</strong><small>{props.title} · 两个独立所有者</small></span><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭人物卡历史"><X /></button></header>
    {props.error && <p className="revision-error" role="alert">{props.error}</p>}
    {props.preview && <section className="revision-preview" data-testid="character-card-history-preview"><header><span><Eye />{ownerLabel(props.preview.owner)}预览</span><strong>{props.preview.value.summary}</strong></header>{props.preview.value.semanticChanges.length > 0 && <div className="revision-semantic-changes">{props.preview.value.semanticChanges.map((change, index) => <div key={`${change.kind}-${index}`}><span>{change.label}</span><p>{change.detail}</p></div>)}</div>}<details className="revision-source-preview"><summary>查看源数据</summary><pre>{props.preview.value.preview}</pre></details></section>}
    <section className="revision-list combined-history-list"><h2>最近作者操作</h2>{actions.map((action) => <article key={action.id} data-history-owner-count={action.entries.length}>
      <header><strong>{action.entries.length > 1 ? "同一次作者操作" : action.entries[0]?.summary}</strong><small>{formatTime(action.recordedAt)}</small></header>
      <div className="combined-history-owner-list">{action.entries.map((entry) => <section key={`${entry.owner}:${entry.revision.id}`} data-history-owner={entry.owner}><div><strong>{ownerLabel(entry.owner)}</strong><small>{entry.summary}</small>{entry.milestoneTitles.map((title) => <em key={title}><Flag />{title}</em>)}</div><div className="revision-row-actions"><button type="button" onClick={() => props.onPreview(entry.owner, entry.revision.id)}><Eye />预览</button><button type="button" onClick={() => { setMilestone({ owner: entry.owner, revisionId: entry.revision.id }); setMilestoneTitle(""); }}><Flag />里程碑</button><button type="button" onClick={() => setRestore({ owner: entry.owner, revisionId: entry.revision.id })}><RotateCcw />恢复此所有者</button></div>
        {milestone?.owner === entry.owner && milestone.revisionId === entry.revision.id && <div className="revision-inline-form"><input value={milestoneTitle} maxLength={80} onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="里程碑名称" /><button type="button" disabled={!milestoneTitle.trim() || props.busy} onClick={() => { props.onMilestone(entry.owner, entry.revision.id, milestoneTitle.trim()); setMilestone(null); }}>创建</button></div>}
        {restore?.owner === entry.owner && restore.revisionId === entry.revision.id && <div className="revision-restore-confirm"><p>只恢复{ownerLabel(entry.owner)}，并追加新版本；另一所有者不会被写入。</p><button type="button" onClick={() => setRestore(null)}>取消</button><button type="button" className="primary-action" disabled={props.busy} onClick={() => { props.onRestore(entry.owner, entry.revision.id); setRestore(null); }}>确认独立恢复</button></div>}
      </section>)}</div>
    </article>)}{!props.busy && actions.length === 0 && <p className="revision-empty">还没有可对齐的人物卡历史。</p>}</section>
  </aside>;
}

function ownerLabel(owner: CharacterHistoryOwner): string {
  return owner === "markdown" ? "人物内容" : "卡片构成";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
