import { Clock3, Eye, Flag, RefreshCw, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import type { DocumentRevisionHistory, DocumentRevisionPreview } from "../lib/localTransport";

export function DocumentRevisionPanel(props: {
  open: boolean;
  title: string;
  history: DocumentRevisionHistory | null;
  preview: DocumentRevisionPreview | null;
  sourceDrift?: string[];
  busy: boolean;
  error: string;
  onClose(): void;
  onPreview(revisionId: string): void;
  onCreateMilestone(revisionId: string, title: string): void;
  onRestore(revisionId: string): void;
}) {
  const [milestoneRevision, setMilestoneRevision] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [restoreRevision, setRestoreRevision] = useState<string | null>(null);
  if (!props.open) return null;

  return <aside className="document-revision-panel" aria-label="修订历史" data-testid="revision-history-panel">
    <header><span><Clock3 /><strong>修订历史</strong><small>{props.title}</small></span><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭修订历史"><X /></button></header>
    {props.busy && !props.history ? <div className="revision-loading"><RefreshCw className="spin" />正在读取版本</div> : null}
    {props.error && <p className="revision-error" role="alert">{props.error}</p>}
    {props.preview && <section className="revision-preview" data-testid="revision-preview">
      <header><span><Eye />版本 {props.preview.revision.sequence}</span><strong>{props.preview.summary}</strong></header>
      {props.preview.semanticChanges.length > 0 && <div className="revision-semantic-changes" data-testid="revision-semantic-changes">{props.preview.semanticChanges.map((change, index) => <div key={`${change.kind}-${change.label}-${index}`} data-semantic-kind={change.kind}><span>{change.label}</span><p>{change.detail}</p></div>)}</div>}
      <details className="revision-source-preview"><summary>查看源数据</summary><pre>{props.preview.preview}</pre>{props.preview.previewTruncated && <small>预览已截断，恢复仍使用完整版本。</small>}</details>
    </section>}
    {props.sourceDrift && props.sourceDrift.length > 0 && <section className="revision-current-source-drift" data-testid="revision-current-source-drift"><header><strong>当前来源状态</strong><small>这是此刻 Markdown 来源的状态，不属于任何历史版本。</small></header>{props.sourceDrift.map((item) => <p key={item}>{item}</p>)}</section>}
    <section className="revision-list">
      <h2>最近版本</h2>
      {props.history?.revisions.map((revision) => {
        const milestone = props.history?.milestones.find((item) => item.revisionId === revision.id);
        return <article key={revision.id} data-revision-id={revision.id}>
          <div><strong>版本 {revision.sequence}</strong><small>{revisionSourceLabel(revision.source)} · {formatRevisionTime(revision.recordedAt)}</small>{milestone && <em><Flag />{milestone.title}</em>}</div>
          <div className="revision-row-actions"><button type="button" onClick={() => props.onPreview(revision.id)}><Eye />预览</button><button type="button" onClick={() => { setMilestoneRevision(revision.id); setMilestoneTitle(""); }}><Flag />里程碑</button><button type="button" onClick={() => setRestoreRevision(revision.id)}><RotateCcw />恢复</button></div>
          {milestoneRevision === revision.id && <div className="revision-inline-form"><input value={milestoneTitle} maxLength={80} onChange={(event) => setMilestoneTitle(event.target.value)} placeholder="里程碑名称" /><button type="button" disabled={!milestoneTitle.trim() || props.busy} onClick={() => { props.onCreateMilestone(revision.id, milestoneTitle.trim()); setMilestoneRevision(null); }}>创建</button></div>}
          {restoreRevision === revision.id && <div className="revision-restore-confirm"><p>恢复会把这个版本写成新的当前版本，后续历史不会删除。</p><button type="button" className="secondary-action" onClick={() => setRestoreRevision(null)}>取消</button><button type="button" className="primary-action" disabled={props.busy} onClick={() => { props.onRestore(revision.id); setRestoreRevision(null); }}>确认恢复</button></div>}
        </article>;
      })}
      {props.history && props.history.revisions.length === 0 && <p className="revision-empty">这份文档还没有保存历史。</p>}
    </section>
  </aside>;
}

function revisionSourceLabel(source: string) {
  return source === "create" ? "创建" : source === "save" ? "保存" : source === "restore" ? "恢复" : "历史基线";
}

function formatRevisionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
