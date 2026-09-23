import { useEffect, useState } from "react";
import { ArrowRight, History, Plus } from "lucide-react";
import { getNuwaN1Bootstrap, type NuwaN1Bootstrap } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

const runStatusLabel: Record<string, string> = {
  draft: "草稿",
  ready: "待开始",
  running: "排演中",
  paused: "已暂停",
  blocked: "需处理",
  completed: "已完成",
  cancelled: "已取消",
};

/** Management view over the existing RunPack index; run execution remains in NuwaN1Workspace. */
export function NuwaManagementWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [bootstrap, setBootstrap] = useState<NuwaN1Bootstrap | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void getNuwaN1Bootstrap(projectId).then((read) => { if (active) setBootstrap(read); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [projectId]);
  const runs = bootstrap?.runs ?? [];
  const current = runs.find((run) => run.runId === bootstrap?.latestRunId) ?? runs[0] ?? null;
  return <main className="shell-workspace shell-workspace-nuwa nuwa-management" aria-label="女娲管理">
    <header><div><small>当前项目 · {props.runtime.project?.title ?? "未选择项目"}</small><h1>女娲</h1><p>从已有排演继续，或明确建立新的范围排演。浏览记录不会调用模型。</p></div><a className="primary-action" href="/nuwa?nuwaView=new"><Plus aria-hidden="true" />新建排演</a></header>
    {error ? <p role="alert">排演列表暂时无法读取；原 Run 未改变。</p> : !bootstrap ? <p role="status">正在读取排演记录…</p> : <>
      <section aria-label="当前排演"><h2>当前排演</h2>{current ? <a className="nuwa-management-current" href={`/nuwa?runId=${encodeURIComponent(current.runId)}`}><strong>{current.label}</strong><span>{runStatusLabel[current.status] ?? current.status} · {new Date(current.createdAt).toLocaleString()}</span><ArrowRight aria-hidden="true" /></a> : <p>还没有排演；可以从新建流程选择故事范围。</p>}</section>
      <section aria-label="历史排演"><h2><History aria-hidden="true" />历史排演</h2>{runs.length ? <ol>{runs.map((run) => <li key={run.runId}><a href={`/nuwa?runId=${encodeURIComponent(run.runId)}`} title={run.runId}><strong>{run.label}</strong><span>{runStatusLabel[run.status] ?? run.status} · {new Date(run.createdAt).toLocaleString()}</span></a></li>)}</ol> : <p>暂无历史排演。</p>}</section>
    </>}
  </main>;
}
