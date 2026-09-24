import { useEffect, useState } from "react";
import { getNuwaN1Bootstrap } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";

type RunLink = { runId: string; label: string; status: string; createdAt: string };

/** Run shortcuts only. Tianyi conversations belong to Tianyi's own directory. */
export function NuwaRunDirectory({ runtime }: { runtime: TianyanShellRuntimeState }) {
  const projectId = runtime.project?.id ?? null;
  const [runs, setRuns] = useState<RunLink[]>([]);
  const [error, setError] = useState(false);
  const [limit, setLimit] = useState(12);
  const activeRunId = new URLSearchParams(window.location.search).get("runId");
  useEffect(() => {
    if (!projectId) { setRuns([]); return; }
    let active = true;
    void getNuwaN1Bootstrap(projectId).then((read) => {
      if (active) { setRuns(read.runs ?? []); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [projectId]);
  const statusLabel: Record<string, string> = { ready: "就绪", running: "排演中", paused: "已暂停", completed: "已完成", cancelled: "已停止", blocked: "需处理" };
  return <div className="nuwa-run-directory" aria-label="女娲排演快捷列表">
    {error ? <p role="alert">排演目录读取失败，可进入女娲管理页重试。</p> : null}
    {runs.slice(0, limit).map((run) => <button type="button" key={run.runId} title={`${run.label} · ${run.runId}`} aria-current={activeRunId === run.runId ? "page" : undefined} onClick={() => window.location.assign(`/nuwa?runId=${encodeURIComponent(run.runId)}`)}><span>{run.label}</span><small>{statusLabel[run.status] ?? run.status}{Number.isNaN(Date.parse(run.createdAt)) ? "" : ` · ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(run.createdAt))}`}</small></button>)}
    {runs.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 12)}>显示更多排演</button> : null}
  </div>;
}
