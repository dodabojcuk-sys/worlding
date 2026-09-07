import { useEffect, useRef, useState } from "react";
import { Download, FilePlus2, GitBranch, RefreshCw, ShieldCheck } from "lucide-react";

import { getCreationSourcePortState, listStoryUnits, runCreationSourcePortAction, type CreationSourcePortAction, type CreationSourcePortState, type StoryUnit } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** Renders the existing WorkVersion/OutputArtifact source projection; it owns neither. */
export function CreationSourceWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [state, setState] = useState<CreationSourcePortState | null>(null);
  const [storyUnits, setStoryUnits] = useState<readonly StoryUnit[]>([]);
  const [storyUnitId, setStoryUnitId] = useState<string | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);
  const activeProjectId = useRef<string | null>(projectId);
  const refresh = async (scope: { storyUnitId?: string; eventIds?: string[] } = {}) => {
    const requestedProjectId = projectId;
    if (!requestedProjectId) return;
    const generation = ++requestGeneration.current;
    setError("");
    try {
      const next = await getCreationSourcePortState({ projectId: requestedProjectId, storyUnitId: scope.storyUnitId ?? storyUnitId ?? undefined, eventIds: scope.eventIds ?? eventIds });
      if (activeProjectId.current !== requestedProjectId || requestGeneration.current !== generation || next.project.id !== requestedProjectId) return;
      setState(next);
      setStoryUnitId(next.storyUnit?.id ?? null);
      if (!scope.eventIds || !scope.eventIds.length) setEventIds(next.events.map((event) => event.id));
      else setEventIds(scope.eventIds);
    }
    catch (reason) { if (activeProjectId.current === requestedProjectId && requestGeneration.current === generation) setError(messageFor(reason)); }
  };
  useEffect(() => {
    activeProjectId.current = projectId;
    requestGeneration.current += 1;
    setState(null); setStoryUnits([]); setStoryUnitId(null); setEventIds([]); setError("");
    if (projectId) {
      const requestedProjectId = projectId;
      void listStoryUnits(requestedProjectId).then((items) => {
        if (activeProjectId.current === requestedProjectId) setStoryUnits(items.filter((item) => item.lifecycle !== "archived"));
      }).catch(() => {
        if (activeProjectId.current === requestedProjectId) setStoryUnits([]);
      });
      void refresh({ eventIds: [] });
    }
    // The selected project's identity is the read boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const act = (action: CreationSourcePortAction) => {
    const requestedProjectId = projectId;
    if (!requestedProjectId) return;
    const generation = ++requestGeneration.current;
    setBusy(true); setError("");
    void props.runtime.withConnection((token) => runCreationSourcePortAction({ projectId: requestedProjectId, action, storyUnitId: storyUnitId ?? undefined, eventIds, token }))
      .then((next) => {
        if (activeProjectId.current !== requestedProjectId || requestGeneration.current !== generation || next.project.id !== requestedProjectId) return;
        setState(next);
      }).catch((reason: unknown) => {
        if (activeProjectId.current === requestedProjectId && requestGeneration.current === generation) setError(messageFor(reason));
      }).finally(() => {
        if (activeProjectId.current === requestedProjectId && requestGeneration.current === generation) setBusy(false);
      });
  };
  const download = () => {
    if (!state?.package || !projectId || state.project.id !== projectId) return;
    const sourceNote = `\n<!-- tianyan-neutral-story-package: ${state.package.id}\ncontent-hash: ${state.package.digest}\nsource-receipts: ${state.package.sourceAnchors.map((item) => item.anchorId).join(", ") || "none"}\n-->\n`;
    const blob = new Blob([state.package.storyMarkdown.trimEnd(), sourceNote], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "tianyan-story-package.md"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const sourceRequestBlocker = (state as (CreationSourcePortState & { sourceRequestBlocker?: { authorMessage: string } | null }) | null)?.sourceRequestBlocker ?? null;
  if (!projectId) return <main className="shell-workspace shell-workspace-writing"><section className="creation-source-workspace is-unavailable"><h1>先打开一个作品</h1><p>创作来源必须绑定当前作品的主故事版本；这里不会创建独立副本。</p></section></main>;
  if (!state && !error) return <main className="shell-workspace shell-workspace-writing"><section className="creation-source-workspace is-loading" role="status"><RefreshCw /><p>正在读取当前作品的创作来源…</p></section></main>;
  return <main className="shell-workspace shell-workspace-writing" aria-label="创作"><section className="creation-source-workspace" data-testid="creation-source-workspace" data-package-id={state?.package?.id}>
    <header><div><small>创作来源 · 当前作品</small><h1>创作</h1><p>默认只读取可验证的故事单元与已确认事件；中性故事包不会写入 Canon，也不会调用 Provider。</p></div><button type="button" onClick={() => void refresh()} disabled={busy}><RefreshCw />刷新来源</button></header>
    {error ? <p className="creation-source-message is-error" role="alert">{error}</p> : null}
    {sourceRequestBlocker ? <p className="creation-source-message is-error" role="alert">{sourceRequestBlocker.authorMessage}</p> : null}
    {state ? <><section className="creation-source-summary" aria-label="创作来源状态">
      <article><GitBranch /><div><small>主故事版本</small><strong>{state.root ? `${state.root.name} · r${state.root.revision}` : "尚未建立"}</strong><span>{state.root ? "版本来源可追溯" : "建立后才可生成正式创作稿"}</span></div></article>
      <article><ShieldCheck /><div><small>当前范围</small><strong>{state.storyUnit?.title ?? "尚无可用故事单元"}</strong><span>{state.events.length ? `${state.events.length} 个已确认事件` : "尚无可验证的已确认事件"}</span></div></article>
      <article><FilePlus2 /><div><small>创作稿</small><strong>{state.artifact?.title ?? "尚未建立"}</strong><span>{state.artifact ? `已绑定 ${state.artifact.provenance.workVersionSource?.neutralStoryPackageId ?? "来源包"}` : "建立操作会留下 OutputArtifact 回执"}</span></div></article>
    </section>
    <section className="creation-source-scope" aria-label="创作范围">
      <label><span>作品版本</span><strong>{state.root ? `${state.root.name} · r${state.root.revision}` : "尚未建立主版本"}</strong><small>此切片只允许当前正式主版本，派生版本和候选不会被静默混入。</small></label>
      <label><span>故事单元</span><select aria-label="故事单元" value={storyUnitId ?? ""} disabled={busy || !storyUnits.length} onChange={(event) => { const next = event.target.value; setStoryUnitId(next); setEventIds([]); void refresh({ storyUnitId: next, eventIds: [] }); }}><option value="">选择故事单元</option>{storyUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title} · {unit.lifecycle}</option>)}</select></label>
      <fieldset><legend>已确认事件（至少一项）</legend>{state.events.map((event) => <label key={event.id}><input type="checkbox" checked={eventIds.includes(event.id)} onChange={() => { const next = eventIds.includes(event.id) ? eventIds.filter((id) => id !== event.id) : [...eventIds, event.id]; if (!next.length) { setError("创作范围至少保留一个已确认事件。"); return; } setEventIds(next); void refresh({ storyUnitId: storyUnitId ?? undefined, eventIds: next }); }} />{event.title} · {event.revision}</label>)}<small>候选事件与作者意图不会进入默认包；需要时必须在独立候选附录流程中明确确认。</small></fieldset>
    </section>
    {!state.root ? <button type="button" className="primary-action" disabled={busy || Boolean(sourceRequestBlocker)} onClick={() => act("create-root")}><GitBranch />建立主故事版本</button> : !state.artifact ? <button type="button" className="primary-action" disabled={busy || !state.package} onClick={() => act("create-artifact")}><FilePlus2 />建立受版本约束的创作稿</button> : null}
    {state.package ? <section className="creation-source-package" aria-label="中性故事包"><header><div><small>中性故事包</small><h2>{state.package.scope.label}</h2><p><code>{state.package.id}</code> · <code>{state.package.digest}</code></p></div><button type="button" className="primary-action" onClick={download}><Download />下载 Markdown</button></header>{state.package.warnings.length ? <p className="creation-source-message">{state.package.warnings.join("；")}</p> : null}<p>下载文件包含包标识、内容摘要与来源回执索引；完整 provenance 和只读投影由已绑定的创作稿保留。</p><pre>{state.package.storyMarkdown}</pre></section> : <p className="creation-source-message">{state.root ? "当前主版本还缺少可验证的故事单元或已确认事件，暂不能导出。" : "建立主故事版本后将显示中性故事包预览。"}</p>}
    </> : null}
  </section></main>;
}
function messageFor(reason: unknown) { return reason instanceof Error && reason.message ? reason.message : "创作来源操作没有完成；现有作品未被改写。"; }
