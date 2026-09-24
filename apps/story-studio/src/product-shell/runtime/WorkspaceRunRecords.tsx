import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getNuwaN1Bootstrap, getNuwaN1Run, listStoryModelingRuns, type NuwaN1Bootstrap, type NuwaN1ReadModel, type StoryModelingRunProjection } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "./TianyanShellRuntime";

const runStatusLabel: Record<string, string> = {
  created: "已建立", running: "运行中", ready: "已完成", failed: "失败", stopped: "已停止",
  paused: "已暂停", blocked: "需处理", cancelled: "已取消", completed: "已完成"
};

/** Read-only index over existing RunPack and StoryModeling records; it owns no task state. */
export function WorkspaceRunRecords(props: {
  runtime: TianyanShellRuntimeState;
  scope: "all" | "current" | "nuwa" | "event-line";
  currentRunId?: string | null;
  onClose(): void;
}) {
  const projectId = props.runtime.project?.id ?? null;
  const [nuwa, setNuwa] = useState<NuwaN1Bootstrap["runs"]>([]);
  const [modeling, setModeling] = useState<StoryModelingRunProjection[]>([]);
  const [current, setCurrent] = useState<NuwaN1ReadModel | null>(null);
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
    if (props.scope === "current") {
      if (!props.currentRunId) { setLoading(false); setError("当前页面没有选中的排演。"); return; }
      void getNuwaN1Run(projectId, props.currentRunId).then((read) => { if (active) { setCurrent(read); setLoading(false); } }).catch(() => { if (active) { setError("当前排演记录暂时无法读取；原 Run 未改变。"); setLoading(false); } });
      return () => { active = false; };
    }
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
  }, [projectId, props.currentRunId, props.scope, props.runtime.withConnection]);
  const showNuwa = props.scope === "all" || props.scope === "nuwa";
  const showModeling = props.scope === "all" || props.scope === "event-line";
  const listedNuwaRuns = props.scope === "nuwa" ? (nuwa ?? []).filter((run) => run.runId !== props.currentRunId) : nuwa ?? [];
  return <section className="shell-run-records" role="dialog" aria-modal="true" aria-label={props.scope === "all" ? "任务与运行" : props.scope === "current" ? "当前排演记录" : "当前功能运行记录"}>
    <header><div><small>当前项目 · 已有记录</small><h2>{props.scope === "all" ? "任务与运行" : props.scope === "current" ? "当前排演" : "功能历史"}</h2></div><button type="button" ref={closeRef} onClick={props.onClose} aria-label="关闭运行记录"><X aria-hidden="true" />关闭</button></header>
    {!projectId ? <p>先选择项目。</p> : <>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">正在读取当前项目的运行记录…</p> : null}
      {props.scope === "current" && !loading && current?.run ? <section><h3>{current.run.scene.label}</h3><p>{runStatusLabel[current.run.status] ?? current.run.status} · 已保存 {current.run.steps.length}{current.authorization ? `/${current.authorization.maxSteps}` : ""} 步</p><p>版本修订 {current.run.revision} · {current.receipts.length} 条操作回执</p><a href={`/nuwa?runId=${encodeURIComponent(current.run.runId)}`}>返回此排演与结果</a><details><summary>技术标识</summary><code>{current.run.runId}</code></details></section> : null}
      {showNuwa && !loading ? <section><h3>{props.scope === "nuwa" && props.currentRunId ? "其他女娲排演" : "女娲排演"}</h3>{listedNuwaRuns.length ? <ol>{listedNuwaRuns.map((run) => <li key={run.runId}><a href={`/nuwa?runId=${encodeURIComponent(run.runId)}`} title={run.runId}><strong>{run.label}</strong><span>{runStatusLabel[run.status] ?? run.status} · {new Date(run.createdAt).toLocaleString()}</span></a></li>)}</ol> : <p>{props.scope === "nuwa" && props.currentRunId ? "当前项目没有其他女娲 Run。" : "没有可读取的女娲 Run。"}</p>}</section> : null}
      {showModeling && !loading ? <section><h3>事件线建模</h3>{modeling.length ? <ol>{modeling.map((run) => <li key={run.runId}><details><summary title={run.runId}><strong>{run.tool}</strong><span>{runStatusLabel[run.status] ?? run.status} · {new Date(run.createdAt).toLocaleString()}</span></summary><p>记录：{run.runId}</p><p>进度：{run.progress.completedBatches}/{run.progress.totalBatches} 批 · {run.progress.stage}</p>{run.failureReason ? <p role="alert">{run.failureReason}</p> : null}<a href="/event-line?eventTask=story">打开事件线工作区</a></details></li>)}</ol> : <p>没有可读取的事件线建模 Run。</p>}</section> : null}
      {props.scope === "all" ? <p className="shell-run-records-scope">目前汇总女娲 RunPack 与事件线建模记录；其他空间尚无统一查询入口。</p> : null}
    </>}
  </section>;
}
