import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getNuwaN1Bootstrap, listStoryModelingRuns, type NuwaN1Bootstrap, type StoryModelingRunProjection } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "./TianyanShellRuntime";

const runStatusLabel: Record<string, string> = {
  created: "已建立", running: "运行中", ready: "已完成", failed: "失败", stopped: "已停止",
  paused: "已暂停", blocked: "需处理", cancelled: "已取消", completed: "已完成"
};

/** Read-only index over existing RunPack and StoryModeling records; it owns no task state. */
export function WorkspaceRunRecords(props: {
  runtime: TianyanShellRuntimeState;
  scope: "all" | "nuwa" | "event-line";
  onClose(): void;
}) {
  const projectId = props.runtime.project?.id ?? null;
  const [nuwa, setNuwa] = useState<NuwaN1Bootstrap["runs"]>([]);
  const [modeling, setModeling] = useState<StoryModelingRunProjection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [props.onClose]);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.allSettled([
      getNuwaN1Bootstrap(projectId),
      props.runtime.withConnection((token) => listStoryModelingRuns(projectId, token))
    ]).then(([runs, plans]) => {
      if (!active) return;
      setLoading(false);
      if (runs.status === "fulfilled") setNuwa(runs.value.runs ?? []);
      if (plans.status === "fulfilled") setModeling(plans.value);
      if (runs.status === "rejected" || plans.status === "rejected") setError("部分运行记录暂时无法读取；已显示可用来源。");
    });
    return () => { active = false; };
  }, [projectId, props.runtime.withConnection]);
  const showNuwa = props.scope !== "event-line";
  const showModeling = props.scope !== "nuwa";
  return <section className="shell-run-records" role="dialog" aria-modal="true" aria-label={props.scope === "all" ? "任务与运行" : "当前功能运行记录"}>
    <header><div><small>当前项目 · 已有记录</small><h2>{props.scope === "all" ? "任务与运行" : "运行记录"}</h2></div><button type="button" ref={closeRef} onClick={props.onClose} aria-label="关闭运行记录"><X /></button></header>
    {!projectId ? <p>先选择项目。</p> : <>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">正在读取当前项目的运行记录…</p> : null}
      {showNuwa && !loading ? <section><h3>女娲排演</h3>{nuwa?.length ? <ol>{nuwa.map((run) => <li key={run.runId}><a href={`/nuwa?runId=${encodeURIComponent(run.runId)}`} title={run.runId}><strong>{run.label}</strong><span>{runStatusLabel[run.status] ?? run.status} · {new Date(run.createdAt).toLocaleString()}</span></a></li>)}</ol> : <p>没有可读取的女娲 Run。</p>}</section> : null}
      {showModeling && !loading ? <section><h3>事件线建模</h3>{modeling.length ? <ol>{modeling.map((run) => <li key={run.runId}><details><summary title={run.runId}><strong>{run.tool}</strong><span>{runStatusLabel[run.status] ?? run.status} · {new Date(run.createdAt).toLocaleString()}</span></summary><p>记录：{run.runId}</p><p>进度：{run.progress.completedBatches}/{run.progress.totalBatches} 批 · {run.progress.stage}</p>{run.failureReason ? <p role="alert">{run.failureReason}</p> : null}<a href="/event-line?eventTask=story">打开事件线工作区</a></details></li>)}</ol> : <p>没有可读取的事件线建模 Run。</p>}</section> : null}
      <p className="shell-run-records-scope">目前汇总女娲 RunPack 与事件线建模记录；其他空间尚无统一查询入口。点击女娲记录返回同一 Run。</p>
    </>}
  </section>;
}
