import { useEffect, useMemo, useState } from "react";

import { getAgentPermissionState, type AgentActivityReceipt } from "../../lib/localTransport";
import { useI18n } from "../../product-shell/i18n/I18nProvider";

type LogFilter = "all" | AgentActivityReceipt["action"];

/** Read-only projection of existing author-action receipts. This never owns a
 * story event, copies a receipt, or invents demo activity when none exists. */
export function EngineeringLogPanel(props: { projectId: string | null }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<readonly AgentActivityReceipt[]>([]);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [loading, setLoading] = useState(Boolean(props.projectId));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!props.projectId) { setEntries([]); setLoading(false); return; }
    setLoading(true); setError("");
    void getAgentPermissionState(props.projectId).then((state) => {
      if (!active) return;
      setEntries([...state.receipts].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)));
    }).catch(() => { if (active) setError("暂时无法读取当前作品的操作回执。可关闭后重试。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.projectId]);
  const actions = useMemo(() => [...new Set(entries.map((entry) => entry.action))], [entries]);
  const visible = filter === "all" ? entries : entries.filter((entry) => entry.action === filter);
  const exportLog = () => {
    const safe = visible.map((entry) => ({ time: entry.recordedAt, action: entry.action, result: entry.outcome, objectType: entry.targetType, objectCount: entry.targets.length, receiptId: entry.id, estimatedProviderCost: entry.estimatedProviderCost }));
    const blob = new Blob([JSON.stringify({ version: "tianyan-author-operation-log-export/v1", projectId: props.projectId, entries: safe }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "tianyan-operation-log.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <section className="engineering-log-panel" aria-label={t("log.label")} data-receipt-projection="author-action-receipts">
    <div className="page-tool-filter-row">
      <label><span className="sr-only">操作类型</span><select aria-label="操作类型" value={filter} onChange={(event) => setFilter(event.target.value as LogFilter)}><option value="all">{t("log.allTypes")}</option>{actions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></label>
      <button type="button" disabled={!visible.length} onClick={exportLog}>导出脱敏日志</button>
    </div>
    {loading ? <p role="status">正在读取当前作品的操作回执…</p> : error ? <p className="tianyi-error" role="alert">{error}</p> : !visible.length ? <p role="status">暂无记录。当前作品尚未采集可展示的操作回执。</p> : <ol className="engineering-log-stream">
      {visible.map((entry) => <li key={entry.id}>
        <time dateTime={entry.recordedAt}>{new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }).format(new Date(entry.recordedAt))}</time>
        <div><strong>{actionLabel(entry.action)}</strong><span>{entry.targetType} · {entry.targets.length ? `${entry.targets.length} 个关联对象` : "当前作品"}</span></div>
        <em data-status={entry.outcome === "allowed" ? "complete" : entry.outcome === "blocked" ? "pending" : "hint"}>{outcomeLabel(entry.outcome)}</em>
      </li>)}
    </ol>}
  </section>;
}

function actionLabel(action: AgentActivityReceipt["action"]): string {
  return ({ "read-context": "读取上下文", "draft-write": "保存草稿", "library-write": "建立候选资料", "temporary-character": "创建临时角色", "rehearsal-run": "运行女娲排演", "event-impact-review": "查看影响", "confirmed-event": "确认正式事件", "permanent-delete": "永久删除", "branch-merge": "合并分支", "external-action": "外部操作" } as const)[action];
}
function outcomeLabel(outcome: AgentActivityReceipt["outcome"]): string { return outcome === "allowed" ? "已完成" : outcome === "blocked" ? "已阻止" : "等待作者"; }
