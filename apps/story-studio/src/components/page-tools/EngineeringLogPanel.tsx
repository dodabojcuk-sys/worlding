import { useEffect, useMemo, useState } from "react";

import { getAgentPermissionState, type AgentActivityReceipt } from "../../lib/localTransport";
import { useI18n } from "../../product-shell/i18n/I18nProvider";

type LogFilter = "all" | AgentActivityReceipt["action"];
type OutcomeFilter = "all" | AgentActivityReceipt["outcome"];

/** Read-only projection of existing author-action receipts. This never owns a
 * story event, copies a receipt, or invents demo activity when none exists. */
export function EngineeringLogPanel(props: { projectId: string | null }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<readonly AgentActivityReceipt[]>([]);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [targetType, setTargetType] = useState("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(props.projectId));
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!props.projectId) { setEntries([]); setExpandedId(null); setLoading(false); return; }
    // A receipt from project A must not stay exportable while project B loads.
    setEntries([]); setExpandedId(null); setLoading(true); setError("");
    void getAgentPermissionState(props.projectId).then((state) => {
      if (!active) return;
      setEntries([...state.receipts].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)));
    }).catch(() => { if (active) setError("暂时无法读取当前作品的操作回执。可关闭后重试。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.projectId]);
  const actions = useMemo(() => [...new Set(entries.map((entry) => entry.action))], [entries]);
  const targetTypes = useMemo(() => [...new Set(entries.map((entry) => entry.targetType))].sort((left, right) => left.localeCompare(right, "zh-CN")), [entries]);
  const visible = entries.filter((entry) => (filter === "all" || entry.action === filter)
    && (outcome === "all" || entry.outcome === outcome)
    && (targetType === "all" || entry.targetType === targetType)
    && (!query.trim() || `${entry.id} ${entry.targetType} ${entry.targets.join(" ")} ${entry.reason}`.toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN"))));
  const exportLog = () => {
    const safe = visible.map((entry) => ({ time: entry.recordedAt, action: entry.action, result: entry.outcome, objectType: entry.targetType, objectCount: entry.targets.length, receiptId: entry.id, estimatedProviderCost: entry.estimatedProviderCost }));
    const blob = new Blob([JSON.stringify({ version: "tianyan-author-operation-log-export/v1", projectId: props.projectId, entries: safe }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "tianyan-operation-log.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <section className="engineering-log-panel" aria-label={t("log.label")} data-receipt-projection="author-action-receipts" data-provider-calls="0">
    <div className="page-tool-filter-row">
      <label><span className="sr-only">操作类型</span><select aria-label="操作类型" value={filter} onChange={(event) => setFilter(event.target.value as LogFilter)}><option value="all">{t("log.allTypes")}</option>{actions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></label>
      <label><span className="sr-only">结果</span><select aria-label="结果" value={outcome} onChange={(event) => setOutcome(event.target.value as OutcomeFilter)}><option value="all">全部结果</option><option value="allowed">已获准</option><option value="requires-author">等待作者</option><option value="blocked">已阻止</option></select></label>
      <label><span className="sr-only">对象类型</span><select aria-label="对象类型" value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="all">全部对象</option>{targetTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span className="sr-only">检索回执</span><input aria-label="检索回执" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="对象、运行或回执 ID" /></label>
      <button type="button" disabled={!visible.length} onClick={exportLog}>导出脱敏日志</button>
    </div>
    {loading ? <p role="status">正在读取当前作品的操作回执…</p> : error ? <p className="tianyi-error" role="alert">{error}</p> : !visible.length ? <p role="status">暂无记录。当前作品尚未采集可展示的操作回执。</p> : <ol className="engineering-log-stream">
      {visible.map((entry) => <li key={entry.id}>
        <time dateTime={entry.recordedAt}>{new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }).format(new Date(entry.recordedAt))}</time>
        <div><strong>{actionLabel(entry.action)}</strong><span>{entry.targetType} · {entry.targets.length ? `${entry.targets.length} 个关联对象` : "当前作品"}</span></div>
        <em data-status={entry.outcome === "allowed" ? "complete" : entry.outcome === "blocked" ? "pending" : "hint"}>{outcomeLabel(entry.outcome)}</em>
        <button type="button" className="engineering-log-detail-toggle" aria-expanded={expandedId === entry.id} onClick={() => setExpandedId((current) => current === entry.id ? null : entry.id)}>{expandedId === entry.id ? "收起回执" : "查看回执"}</button>
        {expandedId === entry.id ? <dl className="engineering-log-receipt" aria-label="操作回执详情"><div><dt>回执 ID</dt><dd><code>{entry.id}</code></dd></div><div><dt>执行者</dt><dd>{entry.actor}</dd></div><div><dt>目标</dt><dd>{entry.targets.length ? entry.targets.join("、") : "当前作品"}</dd></div><div><dt>检查点</dt><dd>{entry.checkpointId ?? "未指定"}</dd></div><div><dt>理由</dt><dd>{entry.reason}</dd></div><div><dt>可逆性</dt><dd>{entry.reversible ? "可逆" : "不可逆或需额外确认"}</dd></div><div><dt>预估 Provider 成本</dt><dd>{entry.estimatedProviderCost === 0 ? "未记录（许可回执不代表调用或费用）" : String(entry.estimatedProviderCost)}</dd></div></dl> : null}
      </li>)}
    </ol>}
  </section>;
}

function actionLabel(action: AgentActivityReceipt["action"]): string {
  return ({ "read-context": "读取上下文", "draft-write": "保存草稿", "library-write": "建立候选资料", "temporary-character": "创建临时角色", "rehearsal-run": "运行女娲排演", "event-impact-review": "查看影响", "confirmed-event": "确认正式事件", "permanent-delete": "永久删除", "branch-merge": "合并分支", "external-action": "外部操作", "review-write": "提交审查", "candidate-review": "候选审查", "rehearsal-intervention": "排演干预", "rehearsal-branch": "排演分支" } as Record<string, string>)[action] ?? action;
}
function outcomeLabel(outcome: AgentActivityReceipt["outcome"]): string { return outcome === "allowed" ? "已获准" : outcome === "blocked" ? "已阻止" : "等待作者"; }
