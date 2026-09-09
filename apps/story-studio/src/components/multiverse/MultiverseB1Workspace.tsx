import { useEffect, useRef, useState } from "react";
import { GitBranch, RefreshCw, ShieldCheck } from "lucide-react";

import { createMultiverseWorkVersion, getMultiverseWorkVersions, type MultiverseWorkVersion } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** B1-A is a version-selection surface only; existing Owners still own story facts. */
export function MultiverseB1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [versions, setVersions] = useState<MultiverseWorkVersion[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const reload = async (requestedProjectId: string) => {
    const current = ++revision.current;
    try {
      const next = await getMultiverseWorkVersions(requestedProjectId);
      if (revision.current === current && projectId === requestedProjectId) { setVersions(next); setError(""); }
    } catch (reason) {
      if (revision.current === current && projectId === requestedProjectId) setError(messageFor(reason));
    }
  };
  useEffect(() => {
    revision.current += 1;
    setVersions([]); setError(""); setName("");
    if (projectId) void reload(projectId);
    // The selected project identity is the stale-response boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1><p>IF 必须从当前作品的正式主版本创建。</p></section></main>;
  const root = versions.find((item) => item.identity.kind === "root" && item.identity.status === "active") ?? null;
  const create = () => {
    if (!root || !name.trim()) return;
    setBusy(true); setError("");
    const displayName = name.trim();
    const idempotencyKey = `multiverse-b1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    void props.runtime.withConnection((token) => createMultiverseWorkVersion({
      projectId,
      displayName,
      parentVersionId: root.identity.workVersionId,
      expectedParentRevision: root.identity.currentRevision,
      expectedParentManifestId: root.identity.headManifestId,
      idempotencyKey,
      token
    })).then((result) => {
      if (props.runtime.project?.id !== projectId) return;
      setVersions(result.versions); setName("");
    }).catch((reason: unknown) => {
      if (props.runtime.project?.id === projectId) setError(messageFor(reason));
    }).finally(() => setBusy(false));
  };
  return <main className="shell-workspace" aria-label="多元"><section className="shell-workspace-stage" data-testid="multiverse-b1-workspace">
    <p className="shell-workspace-eyebrow">同源故事版本</p><h1>多元</h1><p className="shell-workspace-summary">从明确的主故事版本创建 IF。当前切片只建立稳定版本身份和分叉点；不会复制或改写 Event、Relation、世界状态与人物知情。</p>
    <div className="creation-source-summary" aria-label="版本状态"><article><GitBranch /><div><small>当前主版本</small><strong>{root ? `${root.identity.displayName} · r${root.identity.currentRevision}` : "尚未建立"}</strong><span>{root ? "IF 将冻结此 manifest" : "请先在创作中建立主故事版本"}</span></div></article><article><ShieldCheck /><div><small>IF 数量</small><strong>{versions.filter((item) => item.identity.kind === "derived").length}</strong><span>旧版本与其父版本保持可追溯</span></div></article></div>
    {error ? <p className="creation-source-message is-error" role="alert">{error}</p> : null}
    <section className="creation-source-scope" aria-label="创建 IF"><label><span>IF 名称</span><input aria-label="IF 名称" value={name} maxLength={120} disabled={!root || busy} onChange={(event) => setName(event.target.value)} placeholder="例如：阿芜持有铜钥匙" /></label><button type="button" className="primary-action" disabled={!root || busy || !name.trim()} onClick={create}><GitBranch />创建 IF</button><button type="button" disabled={busy} onClick={() => void reload(projectId)}><RefreshCw />刷新版本</button></section>
    <section className="creation-source-package" aria-label="作品版本"><h2>作品版本</h2>{versions.length ? <ul>{versions.map((version) => <li key={version.identity.workVersionId}><strong>{version.identity.displayName}</strong> · {version.identity.kind === "root" ? "主版本" : "IF"} · r{version.identity.currentRevision}{version.identity.parentVersionId ? <small> · 从 {version.identity.parentVersionId} r{version.identity.parentBaseRevision} 分叉</small> : null}<small> · {version.staleness.state === "current" ? "来源当前" : version.staleness.state === "stale" ? "父版本已有后续修订；比较须冻结原基点" : "父版本引用不可用，已停止比较"}</small></li>)}</ul> : <p>当前作品尚未建立可读取的正式版本。</p>}</section>
  </section></main>;
}

function messageFor(reason: unknown) { return reason instanceof Error && reason.message ? reason.message : "IF 操作未完成；当前作品没有被改写。"; }
