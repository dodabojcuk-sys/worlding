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
  const [view, setView] = useState<"current" | "pinned">("current");
  const [writeOperation, setWriteOperation] = useState<{ projectId: string; id: number } | null>(null);
  const [error, setError] = useState("");
  const readGeneration = useRef(0);
  const listGeneration = useRef(0);
  const operationGeneration = useRef(0);
  const activeProjectId = useRef<string | null>(projectId);
  // Render-time identity closes the tiny A→B window before effects have run.
  activeProjectId.current = projectId;
  const busy = writeOperation?.projectId === projectId;
  const refresh = async (requestedProjectId: string, scope: { storyUnitId?: string; eventIds?: string[]; view?: "current" | "pinned" } = {}) => {
    if (!requestedProjectId) return;
    const generation = ++readGeneration.current;
    setError("");
    try {
      const next = await getCreationSourcePortState({ projectId: requestedProjectId, storyUnitId: scope.storyUnitId, eventIds: scope.eventIds, view: scope.view ?? view });
      if (activeProjectId.current !== requestedProjectId || readGeneration.current !== generation || next.project.id !== requestedProjectId) return;
      setState(next);
      setView(next.packageMode === "pinned-artifact" ? "pinned" : "current");
      if (next.packageMode === "current-selection") {
        setStoryUnitId(next.storyUnit?.id ?? null);
        setEventIds(next.selectedEventIds);
      }
    }
    catch (reason) { if (activeProjectId.current === requestedProjectId && readGeneration.current === generation) setError(messageFor(reason)); }
  };
  useEffect(() => {
    activeProjectId.current = projectId;
    readGeneration.current += 1;
    listGeneration.current += 1;
    setState(null); setStoryUnits([]); setStoryUnitId(null); setEventIds([]); setView("current"); setWriteOperation(null); setError("");
    if (projectId) {
      const requestedProjectId = projectId;
      const generation = ++listGeneration.current;
      void listStoryUnits(requestedProjectId).then((items) => {
        if (activeProjectId.current === requestedProjectId && listGeneration.current === generation) setStoryUnits(items.filter((item) => item.lifecycle !== "archived"));
      }).catch(() => {
        if (activeProjectId.current === requestedProjectId && listGeneration.current === generation) setStoryUnits([]);
      });
      // New projects always issue an initial, project-only request. Never let
      // the prior render's unit/event selection leak into this first read.
      void refresh(requestedProjectId, { view: "current" });
    }
    // The selected project's identity is the read boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const act = (action: CreationSourcePortAction) => {
    const requestedProjectId = projectId;
    if (!requestedProjectId) return;
    const operationId = ++operationGeneration.current;
    const selectedStoryUnitId = storyUnitId ?? undefined;
    const selectedEventIds = [...eventIds];
    setWriteOperation({ projectId: requestedProjectId, id: operationId }); setError("");
    void props.runtime.withConnection((token) => runCreationSourcePortAction({ projectId: requestedProjectId, action, storyUnitId: selectedStoryUnitId, eventIds: selectedEventIds, token }))
      .then((next) => {
        if (activeProjectId.current !== requestedProjectId || next.project.id !== requestedProjectId) return;
        setState(next);
        setView(next.packageMode === "pinned-artifact" ? "pinned" : "current");
      }).catch((reason: unknown) => {
        if (activeProjectId.current === requestedProjectId) setError(messageFor(reason));
      }).finally(() => {
        setWriteOperation((current) => current?.projectId === requestedProjectId && current.id === operationId ? null : current);
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
    <header><div><small>创作来源 · 当前作品</small><h1>创作</h1><p>默认只读取可验证的故事单元与已确认事件；中性故事包不会写入 Canon，也不会调用 Provider。</p></div><button type="button" onClick={() => void refresh(projectId, { storyUnitId: storyUnitId ?? undefined, eventIds, view })} disabled={busy}><RefreshCw />刷新来源</button></header>
    {error ? <p className="creation-source-message is-error" role="alert">{error}</p> : null}
    {sourceRequestBlocker ? <p className="creation-source-message is-error" role="alert">{sourceRequestBlocker.authorMessage}</p> : null}
    {state ? <><section className="creation-source-summary" aria-label="创作来源状态">
      <article><GitBranch /><div><small>主故事版本</small><strong>{state.root ? `${state.root.name} · r${state.root.revision}` : "尚未建立"}</strong><span>{state.root ? "版本来源可追溯" : "建立后才可生成正式创作稿"}</span></div></article>
      <article><ShieldCheck /><div><small>{state.packageMode === "pinned-artifact" ? "固定稿范围" : "当前范围"}</small><strong>{state.storyUnit?.title ?? "尚无可用故事单元"}</strong><span>{state.selectedEventIds.length ? `${state.selectedEventIds.length} 个已确认事件` : "尚无可验证的已确认事件"}</span></div></article>
      <article><FilePlus2 /><div><small>创作稿</small><strong>{state.artifact?.title ?? "尚未建立"}</strong><span>{state.artifact ? `已绑定 ${state.artifact.provenance.workVersionSource?.neutralStoryPackageId ?? "来源包"}` : "建立操作会留下 OutputArtifact 回执"}</span></div></article>
    </section>
    <section className="creation-source-scope" aria-label="创作范围">
      <label><span>作品版本</span><strong>{state.root ? `${state.root.name} · r${state.root.revision}` : "尚未建立主版本"}</strong><small>此切片只允许当前正式主版本，派生版本和候选不会被静默混入。</small></label>
      {state.packageMode === "pinned-artifact" ? <p className="creation-source-message">当前显示的是固定创作稿在建立时保存的只读来源包。<button type="button" onClick={() => void refresh(projectId, { storyUnitId: storyUnitId ?? undefined, eventIds, view: "current" })} disabled={busy}>查看当前选择</button></p> : state.artifact ? <p className="creation-source-message">当前选择是新版本预览，不会改写既有固定稿。<button type="button" onClick={() => void refresh(projectId, { view: "pinned" })} disabled={busy}>查看固定创作稿</button></p> : null}
      <label><span>故事单元</span><select aria-label="故事单元" value={storyUnitId ?? ""} disabled={busy || state.packageMode === "pinned-artifact" || !storyUnits.length} onChange={(event) => { const next = event.target.value; setStoryUnitId(next); setEventIds([]); setView("current"); void refresh(projectId, { storyUnitId: next, eventIds: [], view: "current" }); }}><option value="">选择故事单元</option>{storyUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title} · {unit.lifecycle}</option>)}</select></label>
      <fieldset><legend>已确认事件（至少一项）</legend>{state.availableEvents.map((event) => <label key={event.id}><input type="checkbox" disabled={busy || state.packageMode === "pinned-artifact"} checked={state.packageMode === "pinned-artifact" ? state.selectedEventIds.includes(event.id) : eventIds.includes(event.id)} onChange={() => { const next = eventIds.includes(event.id) ? eventIds.filter((id) => id !== event.id) : [...eventIds, event.id]; if (!next.length) { setError("创作范围至少保留一个已确认事件。"); return; } setEventIds(next); setView("current"); void refresh(projectId, { storyUnitId: storyUnitId ?? undefined, eventIds: next, view: "current" }); }} />{event.title} · {event.revision}</label>)}<small>候选事件、作者意图、含未选来源的混合片段和单元摘要不会进入默认包。</small></fieldset>
    </section>
    {!state.root ? <button type="button" className="primary-action" disabled={busy || Boolean(sourceRequestBlocker)} onClick={() => act("create-root")}><GitBranch />建立主故事版本</button> : !state.artifact ? <button type="button" className="primary-action" disabled={busy || !state.package} onClick={() => act("create-artifact")}><FilePlus2 />建立受版本约束的创作稿</button> : null}
    {state.package ? <section className="creation-source-package" aria-label="中性故事包"><header><div><small>{state.packageMode === "pinned-artifact" ? "固定创作稿 · 只读来源包" : "当前选择 · 新来源预览"}</small><h2>{state.package.scope.label}</h2><p><code>{state.package.id}</code> · <code>{state.package.digest}</code></p></div><button type="button" className="primary-action" onClick={download}><Download />下载 Markdown</button></header>{state.package.warnings.length ? <p className="creation-source-message">{state.package.warnings.join("；")}</p> : null}<p>{state.packageMode === "pinned-artifact" ? "下载内容严格来自这份创作稿建立时保存的快照。" : "这是当前选择的新版本预览；它不会改写既有固定稿。"} 下载文件包含包标识、内容摘要与来源回执索引。</p><pre>{state.package.storyMarkdown}</pre></section> : <p className="creation-source-message">{state.root ? "当前主版本还缺少可验证的故事单元或已确认事件，暂不能导出。" : "建立主故事版本后将显示中性故事包预览。"}</p>}
    </> : null}
  </section></main>;
}
function messageFor(reason: unknown) { return reason instanceof Error && reason.message ? reason.message : "创作来源操作没有完成；现有作品未被改写。"; }
