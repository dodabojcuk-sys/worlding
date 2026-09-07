import { useEffect, useState } from "react";
import { Download, FilePlus2, GitBranch, RefreshCw, ShieldCheck } from "lucide-react";

import { getCreationSourcePortState, runCreationSourcePortAction, type CreationSourcePortAction, type CreationSourcePortState } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** Renders the existing WorkVersion/OutputArtifact source projection; it owns neither. */
export function CreationSourceWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [state, setState] = useState<CreationSourcePortState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    if (!projectId) return;
    setError("");
    try { setState(await getCreationSourcePortState({ projectId })); }
    catch (reason) { setError(messageFor(reason)); }
  };
  useEffect(() => {
    setState(null); setError("");
    if (projectId) void refresh();
    // The selected project's identity is the read boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const act = (action: CreationSourcePortAction) => {
    if (!projectId) return;
    setBusy(true); setError("");
    void props.runtime.withConnection((token) => runCreationSourcePortAction({ projectId, action, token }))
      .then(setState).catch((reason: unknown) => setError(messageFor(reason))).finally(() => setBusy(false));
  };
  const download = () => {
    if (!state?.package) return;
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
    {!state.root ? <button type="button" className="primary-action" disabled={busy || Boolean(sourceRequestBlocker)} onClick={() => act("create-root")}><GitBranch />建立主故事版本</button> : !state.artifact ? <button type="button" className="primary-action" disabled={busy || !state.package} onClick={() => act("create-artifact")}><FilePlus2 />建立受版本约束的创作稿</button> : null}
    {state.package ? <section className="creation-source-package" aria-label="中性故事包"><header><div><small>中性故事包</small><h2>{state.package.scope.label}</h2><p><code>{state.package.id}</code> · <code>{state.package.digest}</code></p></div><button type="button" className="primary-action" onClick={download}><Download />下载 Markdown</button></header>{state.package.warnings.length ? <p className="creation-source-message">{state.package.warnings.join("；")}</p> : null}<p>下载文件包含包标识、内容摘要与来源回执索引；完整 provenance 和只读投影由已绑定的创作稿保留。</p><pre>{state.package.storyMarkdown}</pre></section> : <p className="creation-source-message">{state.root ? "当前主版本还缺少可验证的故事单元或已确认事件，暂不能导出。" : "建立主故事版本后将显示中性故事包预览。"}</p>}
    </> : null}
  </section></main>;
}
function messageFor(reason: unknown) { return reason instanceof Error && reason.message ? reason.message : "创作来源操作没有完成；现有作品未被改写。"; }
