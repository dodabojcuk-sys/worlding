import { Archive, CheckCircle2, CircleDot, ListChecks, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import type { R9AProjectBackup, R9AWorkflowState, R9AWorkflowTask } from "../lib/localTransport";

export function R9AWorkflowCenter(props: {
  open: boolean;
  projectTitle: string;
  workflow: R9AWorkflowState | null;
  backups: R9AProjectBackup[];
  onCreateTask(input: { title: string; lane: R9AWorkflowTask["lane"] }): Promise<void>;
  onSetTaskState(task: R9AWorkflowTask, state: R9AWorkflowTask["state"]): Promise<void>;
  onCreateBackup(title: string): Promise<void>;
  onRestoreBackup(backupId: string): Promise<void>;
  onClose(): void;
}) {
  const [title, setTitle] = useState("");
  const [lane, setLane] = useState<R9AWorkflowTask["lane"]>("library");
  const [backupTitle, setBackupTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    void action().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "操作未完成。")).finally(() => setBusy(false));
  };
  if (!props.open) return null;
  return <div className="dialog-backdrop r9a-workflow-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section className="r9a-workflow-center" role="dialog" aria-modal="true" aria-labelledby="r9a-workflow-title" data-testid="r9a-workflow-center">
    <header><div><small>项目管理 · {props.projectTitle}</small><h2 id="r9a-workflow-title">任务与受保护恢复</h2><p>任务只保存协调状态；事件、排演和成品仍由原有 owner 管理。</p></div><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭项目管理"><X /></button></header>
    <div className="r9a-workflow-grid">
      <section><h3><CircleDot />任务中心</h3><form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; run(async () => { await props.onCreateTask({ title: title.trim(), lane }); setTitle(""); }); }}><input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="下一项可回滚工作" aria-label="任务标题" /><select value={lane} onChange={(event) => setLane(event.target.value as R9AWorkflowTask["lane"])} aria-label="任务工作区"><option value="library">资料</option><option value="relationship">关系</option><option value="event">事件</option><option value="nuwa">女娲</option><option value="creation">创作</option><option value="recovery">恢复</option><option value="multiverse">多元</option></select><button type="submit" className="primary-action" disabled={busy}>添加任务</button></form><div className="r9a-workflow-task-list">{props.workflow?.tasks.length ? props.workflow.tasks.map((task) => <article key={task.id}><div><strong>{task.title}</strong><small>{task.lane} · {task.state}</small></div><select value={task.state} disabled={busy} aria-label={`${task.title}状态`} onChange={(event) => run(() => props.onSetTaskState(task, event.target.value as R9AWorkflowTask["state"]))}><option value="queued">待处理</option><option value="active">进行中</option><option value="blocked">阻塞</option><option value="done">完成</option></select></article>) : <p>尚未记录任务。这里不会生成或修改故事事实。</p>}</div></section>
      <section><h3><Archive />项目备份</h3><p>备份为本地加法快照。恢复只覆写快照中已有文件，且总会先建立恢复前检查点。</p><form onSubmit={(event) => { event.preventDefault(); const nextTitle = backupTitle.trim() || `手动备份 ${new Date().toLocaleString("zh-CN")}`; run(async () => { await props.onCreateBackup(nextTitle); setBackupTitle(""); }); }}><input value={backupTitle} maxLength={160} onChange={(event) => setBackupTitle(event.target.value)} placeholder="备份说明（可选）" aria-label="备份说明" /><button type="submit" className="secondary-action" disabled={busy}>创建备份</button></form><div className="r9a-backup-list">{props.backups.length ? props.backups.map((backup) => <article key={backup.id}><div><strong>{backup.title}</strong><small>{backup.kind === "pre-restore-checkpoint" ? "恢复前检查点" : "手动备份"} · {new Date(backup.createdAt).toLocaleString("zh-CN")} · {backup.fileCount} 文件</small></div><button type="button" className="secondary-action" disabled={busy} onClick={() => { if (!window.confirm(`恢复“${backup.title}”会先建立新的恢复前检查点。继续吗？`)) return; run(() => props.onRestoreBackup(backup.id)); }}><ShieldCheck />受保护恢复</button></article>) : <p>尚无项目备份。</p>}</div></section>
    </div>
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    <footer><CheckCircle2 /> 不删除既有备份、不调用真实 Provider、不直接写入 Canon。</footer>
    </section>
  </div>;
}
