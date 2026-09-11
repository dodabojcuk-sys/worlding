import { useEffect, useRef, useState } from "react";
import { GitBranch, RefreshCw, ShieldCheck } from "lucide-react";

import { createMultiverseWorkVersion, getMultiverseB1Fixture, getMultiverseWorkVersions, runMultiverseB1Fixture, type MultiverseB1Fixture, type MultiverseWorkVersion } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

/** B1-A is a version-selection surface only; existing Owners still own story facts. */
export function MultiverseB1Workspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [versions, setVersions] = useState<MultiverseWorkVersion[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fixture, setFixture] = useState<MultiverseB1Fixture | null>(null);
  const [fixtureBusy, setFixtureBusy] = useState(false);
  const [fixtureError, setFixtureError] = useState("");
  const fixtureEnabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("b1Fixture") === "1";
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
  useEffect(() => {
    setFixture(null); setFixtureError("");
    if (!projectId || !fixtureEnabled) return;
    void getMultiverseB1Fixture(projectId).then((next) => {
      if (props.runtime.project?.id === projectId) setFixture(next);
    }).catch((reason: unknown) => {
      if (props.runtime.project?.id === projectId) setFixtureError(messageFor(reason));
    });
  }, [fixtureEnabled, projectId, props.runtime.project?.id]);
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
  const runFixture = (action: "setup" | "merge" | "compensate") => {
    setFixtureBusy(true); setFixtureError("");
    void props.runtime.withConnection((token) => runMultiverseB1Fixture({ projectId, action, token })).then(({ view }) => {
      if (props.runtime.project?.id === projectId) { setFixture(view); void reload(projectId); }
    }).catch((reason: unknown) => {
      if (props.runtime.project?.id === projectId) setFixtureError(messageFor(reason));
    }).finally(() => setFixtureBusy(false));
  };
  return <main className="shell-workspace" aria-label="多元"><section className="shell-workspace-stage" data-testid="multiverse-b1-workspace">
    <p className="shell-workspace-eyebrow">同源故事版本</p><h1>多元</h1><p className="shell-workspace-summary">从明确的主故事版本创建 IF。当前切片只建立稳定版本身份和分叉点；不会复制或改写 Event、Relation、世界状态与人物知情。</p>
    <div className="creation-source-summary" aria-label="版本状态"><article><GitBranch /><div><small>当前主版本</small><strong>{root ? `${root.identity.displayName} · r${root.identity.currentRevision}` : "尚未建立"}</strong><span>{root ? "IF 将冻结此 manifest" : "请先在创作中建立主故事版本"}</span></div></article><article><ShieldCheck /><div><small>IF 数量</small><strong>{versions.filter((item) => item.identity.kind === "derived").length}</strong><span>旧版本与其父版本保持可追溯</span></div></article></div>
    {error ? <p className="creation-source-message is-error" role="alert">{error}</p> : null}
    <section className="creation-source-scope" aria-label="创建 IF"><label><span>IF 名称</span><input aria-label="IF 名称" value={name} maxLength={120} disabled={!root || busy} onChange={(event) => setName(event.target.value)} placeholder="例如：阿芜持有铜钥匙" /></label><button type="button" className="primary-action" disabled={!root || busy || !name.trim()} onClick={create}><GitBranch />创建 IF</button><button type="button" disabled={busy} onClick={() => void reload(projectId)}><RefreshCw />刷新版本</button></section>
    <section className="creation-source-package" aria-label="作品版本"><h2>作品版本</h2>{versions.length ? <ul>{versions.map((version) => <li key={version.identity.workVersionId}><strong>{version.identity.displayName}</strong> · {version.identity.kind === "root" ? "主版本" : "IF"} · r{version.identity.currentRevision}{version.identity.parentVersionId ? <small> · 从 {version.identity.parentVersionId} r{version.identity.parentBaseRevision} 分叉</small> : null}<small> · {version.staleness.state === "current" ? "来源当前" : version.staleness.state === "stale" ? "父版本已有后续修订；比较须冻结原基点" : "父版本引用不可用，已停止比较"}</small></li>)}</ul> : <p>当前作品尚未建立可读取的正式版本。</p>}</section>
    {fixtureEnabled ? <B1Rehearsal fixture={fixture} busy={fixtureBusy} error={fixtureError} onRun={runFixture} /> : null}
  </section></main>;
}

function B1Rehearsal(props: { fixture: MultiverseB1Fixture | null; busy: boolean; error: string; onRun: (action: "setup" | "merge" | "compensate") => void }) {
  const { fixture } = props;
  return <section className="creation-source-package" aria-label="B1 隔离排演" data-testid="multiverse-b1-rehearsal">
    <p className="shell-workspace-eyebrow">开发验证夹具</p><h2>B1 铜钥匙融入排演</h2><p>仅在明确命名的隔离项目和本地假 Adapter 启用；所有写入仍经过正式 Event、Relation、世界状态及叙事位置 Owner。</p>
    {props.error ? <p className="creation-source-message is-error" role="alert">{props.error}</p> : null}
    <p><button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onRun("setup")}>建立隔离故事与 IF</button>{" "}<button type="button" disabled={props.busy || !fixture?.comparison} onClick={() => props.onRun("merge")}>融入全部可用差异</button>{" "}<button type="button" disabled={props.busy || fixture?.execution?.status !== "applied"} onClick={() => props.onRun("compensate")}>补偿本批融入</button></p>
    {fixture ? <>
      <dl><dt>主线基点</dt><dd>{versionText(fixture.root)}</dd><dt>源 IF</dt><dd>{fixture.derived ? `${fixture.derived.workVersionId} · 从 r${fixture.derived.parentBaseRevision}` : "尚未建立"}</dd><dt>冻结比较</dt><dd>{fixture.comparison ? `${fixture.comparison.compareDigest.slice(0, 16)}…` : "先建立隔离故事"}</dd></dl>
      {fixture.comparison ? <section aria-label="IF 差异与选择"><h3>IF 与主线的差异</h3><ul>{fixture.comparison.differences.map((difference) => <li key={difference.changeId}><strong>{difference.ownerKind}</strong> · {difference.summary} · {difference.selection === "available" ? "已选择融入" : difference.selection}{difference.dependencyIds.length ? <small> · 依赖 {difference.dependencyIds.join("、")}</small> : null}</li>)}</ul></section> : null}
      <section aria-label="Owner 分项回执"><h3>正式融入结果</h3>{fixture.execution ? <><p><strong>{fixture.execution.status}</strong>{fixture.execution.failure ? ` · ${fixture.execution.failure}` : ""}</p><ul>{fixture.execution.ownerReceipts.map((receipt) => <li key={receipt.changeId}>{receipt.ownerKind} · {receipt.targetRef} · 回执 {receipt.receiptRef}</li>)}</ul><p>结果版本：{versionText(fixture.execution.resultVersion)}；补偿版本：{versionText(fixture.execution.compensationResultVersion)}</p></> : <p>尚未融入；IF 与目标主线仍独立。</p>}</section>
    </> : <p>正在读取隔离夹具；未启用或项目不符合隔离条件时会显示明确原因。</p>}
  </section>;
}

function versionText(value: { workVersionId: string; revision: number; manifestDigest: string } | null) { return value ? `${value.workVersionId} · r${value.revision} · ${value.manifestDigest.slice(0, 16)}…` : "无"; }

function messageFor(reason: unknown) { return reason instanceof Error && reason.message ? reason.message : "IF 操作未完成；当前作品没有被改写。"; }
