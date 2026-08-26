import { AlertTriangle, ArrowLeft, ArrowRight, BookOpenText, Check, CheckCircle2, Clock3, FileText, History, Link2, MessageCircle, PanelRight, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { WorkVersionBoundCreationFixture } from "../../lib/localTransport";

type Surface = "creation" | "event" | "story-unit";
type Action = "create-root" | "create-artifact" | "save-artifact" | "reconcile" | "advance-root" | "archive-root" | "reconcile-source";
type OperationInput = { text?: string; selectedDifferenceIds?: string[]; expectedRootRevision?: number };

export function WorkVersionBoundCreationWorkspace(props: {
  projectId: string;
  routeKind: "normal" | "fixture";
  surface: Surface;
  load(fixtureCase?: "missing" | "corrupt" | "concurrency"): Promise<WorkVersionBoundCreationFixture>;
  operate(action: Action, input?: OperationInput): Promise<WorkVersionBoundCreationFixture>;
  onOpenEvent(eventId: string, snapshot: CreationReturnSnapshot): void;
  onOpenStoryUnit(storyUnitId: string, snapshot: CreationReturnSnapshot): void;
  onReturn(snapshot: CreationReturnSnapshot): void;
  onOpenWorkDock(prompt: string): void;
}) {
  const [state, setState] = useState<WorkVersionBoundCreationFixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("雨声停在窗沿，沈砚把旧名守夜记录轻轻压在灯下。");
  const [sourceExpanded, setSourceExpanded] = useState(() => readReturnSnapshot(props.projectId)?.sourceExpanded ?? true);
  const [technicalExpanded, setTechnicalExpanded] = useState(() => readReturnSnapshot(props.projectId)?.technicalExpanded ?? false);
  const [selectedDifferenceIds, setSelectedDifferenceIds] = useState<string[]>([]);
  const rootRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const currentUrl = new URL(window.location.href);
  const view = currentUrl.searchParams.get("view") || "source";
  const requestedFixtureCase = currentUrl.searchParams.get("case");
  const fixtureCase = props.routeKind === "fixture" && (requestedFixtureCase === "missing" || requestedFixtureCase === "corrupt" || requestedFixtureCase === "concurrency") ? requestedFixtureCase : undefined;
  const returned = currentUrl.searchParams.get("returned") === "1";
  const legacySourceBlocked = props.routeKind === "normal" && currentUrl.searchParams.get("legacySource") === "blocked";

  const load = async () => {
    setError("");
    try { setState(await props.load(fixtureCase)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  useEffect(() => { void load(); }, [props.projectId, fixtureCase, props.surface]);

  useEffect(() => {
    if (state?.artifact) setText(state.authorText);
  }, [state?.artifact?.currentRevisionId, state?.authorText]);

  useLayoutEffect(() => {
    if (props.surface !== "creation" || !state?.artifact) return;
    const snapshot = readReturnSnapshot(props.projectId);
    if (!snapshot || snapshot.returnView !== view) return;
    setSourceExpanded(snapshot.sourceExpanded);
    setTechnicalExpanded(snapshot.technicalExpanded);
    if (rootRef.current) rootRef.current.scrollTop = snapshot.scrollTop;
    if (snapshot.focus === "source-details") document.querySelector<HTMLElement>("[data-testid='creation-source-range-summary']")?.focus({ preventScroll: true });
    else if (snapshot.focus === "editor") {
      editorRef.current?.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      editorRef.current?.focus();
    }
  }, [returned, view, props.projectId, props.surface, state?.artifact?.currentRevisionId]);

  useEffect(() => {
    const snapshot = readReturnSnapshot(props.projectId);
    if (snapshot?.selectedDifferenceIds?.length) setSelectedDifferenceIds(snapshot.selectedDifferenceIds);
    else if (state?.sourceCompare?.confirmableDifferenceIds.length) setSelectedDifferenceIds(state.sourceCompare.confirmableDifferenceIds.slice(0, 2));
  }, [props.projectId, state?.sourceCompare?.currentManifestDigest]);

  const operate = async (action: Action, input: OperationInput = {}) => {
    if (busy) return false;
    setBusy(true); setError("");
    try { setState(await props.operate(action, input)); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false; }
    finally { setBusy(false); }
  };

  const navigateView = (nextView: string, extra: Record<string, string> = {}) => {
    const next = new URL(window.location.href);
    next.pathname = "/creation";
    next.search = "";
    if (props.routeKind === "fixture") next.searchParams.set("fixture", "work-version-creation");
    next.searchParams.set("view", nextView);
    if (state?.artifact) next.searchParams.set("artifact", state.artifact.id);
    Object.entries(extra).forEach(([key, value]) => next.searchParams.set(key, value));
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "writing" }, "", `${next.pathname}${next.search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const snapshot = (override: Partial<CreationReturnSnapshot> = {}): CreationReturnSnapshot => ({
    version: "tianyan-creation-return-location/r0",
    projectId: props.projectId,
    returnView: view === "scope" || view === "confirm" ? view : view === "editor" ? "editor" : "source-details",
    artifactId: state?.artifact?.id || "",
    artifactRevisionId: state?.artifact?.currentRevisionId || "",
    selectedStoryUnitId: state?.storyUnit.id || "",
    selectedEventId: state?.events[0]?.id || null,
    scrollTop: Math.round(rootRef.current?.scrollTop || 0),
    focus: document.activeElement === editorRef.current ? "editor" : "source-details",
    selectionStart: editorRef.current?.selectionStart || 0,
    selectionEnd: editorRef.current?.selectionEnd || 0,
    sourceExpanded,
    technicalExpanded,
    selectedDifferenceIds,
    ...override
  });

  const persistLocation = (override: Partial<CreationReturnSnapshot> = {}) => {
    sessionStorage.setItem(returnKey(props.projectId), JSON.stringify(snapshot(override)));
  };

  const toggleDifference = (id: string) => {
    const next = selectedDifferenceIds.includes(id) ? selectedDifferenceIds.filter((value) => value !== id) : [...selectedDifferenceIds, id].sort();
    setSelectedDifferenceIds(next);
    persistLocation({ selectedDifferenceIds: next, focus: "source-details" });
  };

  const openSource = (kind: "event" | "story-unit", id: string) => {
    const value = snapshot();
    sessionStorage.setItem(returnKey(props.projectId), JSON.stringify(value));
    if (kind === "event") props.onOpenEvent(id, value);
    else props.onOpenStoryUnit(id, value);
  };

  if (!state && error) return <main className="work-version-creation-state" data-testid="creation-source-unavailable"><AlertTriangle /><strong>还不能建立创作来源</strong><p role="alert">{error}</p><span>页面保持只读，没有创建作品版本或创作稿。</span></main>;
  if (!state) return <main className="work-version-creation-state" data-testid="creation-source-loading"><RefreshCw className="is-spinning" /><strong>正在核对作品主线与创作来源…</strong></main>;
  const sourceRequestBlocker = "sourceRequestBlocker" in state
    ? (state as WorkVersionBoundCreationFixture & { sourceRequestBlocker?: { kind: "derived-source" | "missing-source"; authorMessage: string } | null }).sourceRequestBlocker
    : null;
  if (sourceRequestBlocker) return sourceRequestBlocker.kind === "missing-source"
    ? <main className="work-version-creation-state" data-testid="creation-source-unavailable"><AlertTriangle /><strong>还不能建立创作来源</strong><p role="alert">{sourceRequestBlocker.authorMessage}</p><span>页面保持只读，没有创建作品版本或创作稿。</span></main>
    : <main className="work-version-creation-state" data-testid="creation-derived-source-blocked"><AlertTriangle /><strong>{sourceRequestBlocker.authorMessage}</strong><p>当前创作稿和作者正文没有发生写入。返回普通创作入口后，可继续使用当前作品主线。</p></main>;
  if (props.surface === "event") return <SourceDrilldown kind="event" state={state} snapshot={readReturnSnapshot(props.projectId)} onReturn={props.onReturn} />;
  if (props.surface === "story-unit") return <SourceDrilldown kind="story-unit" state={state} snapshot={readReturnSnapshot(props.projectId)} onReturn={props.onReturn} />;

  const validation = state.sourceValidation;
  const statusClass = validation ? `is-${validation.status}` : "is-pending";
  const revisionCount = state.revisionHistory?.revisions.length || 0;
  const authorStatus = validation?.authorMessage || (state.root ? "等待创建创作稿" : "尚未建立当前作品主线");
  const hasArtifact = Boolean(state.artifact);
  const sourceLabel = state.artifact?.provenance.workVersionSource ? `来自当前作品主线 · 第 ${state.artifact.provenance.workVersionSource.pinnedRevision} 版` : "尚未创建创作稿";
  const showPackage = ["scope", "confirm"].includes(view);
  const showArtifact = hasArtifact && ["created", "editor", "revisions"].includes(view);
  const showArtifactHeader = hasArtifact && !["source", "scope", "confirm"].includes(view);
  const compare = state.sourceCompare;
  const reconciliation = state.reconciliation;

  return <main ref={rootRef} onScroll={() => persistLocation()} className="work-version-creation-workspace" data-testid="work-version-bound-creation" data-route-kind={props.routeKind} data-view={view} data-source-status={validation?.status || "pending"} data-artifact-id={state.artifact?.id || ""} data-artifact-revision-id={state.artifact?.currentRevisionId || ""} data-selected-story-unit-id={state.storyUnit.id} data-selected-event-id={state.events[0]?.id || ""} data-multiverse-expansion="HOLD" data-derived-source-count={state.derivedVersionCount}>
    <header className="work-version-creation-header">
      <div><small>创作 · {state.project.title}</small><h1>{showArtifactHeader ? state.artifact?.title : "从当前作品主线开始创作"}</h1><p>{showArtifactHeader ? sourceLabel : "先确认故事范围，再建立一份可编辑的创作稿。创作稿不会改写故事事实。"}</p></div>
      <button type="button" className="secondary-action" data-testid="open-creation-work-dock" onClick={() => props.onOpenWorkDock("解释当前创作稿的来源，并检查来源是否仍完整。") }><PanelRight />打开天意工作</button>
    </header>

    {returned ? <p className="creation-return-restored" data-testid="creation-return-restored"><CheckCircle2 />已回到原创作位置 · 创作稿、修订、选区与来源详情均已恢复</p> : null}
    {legacySourceBlocked ? <p className="work-version-creation-error" data-testid="creation-legacy-nuwa-runid-blocked" role="alert"><AlertTriangle />这个历史排演没有完整作品版本来源，请重新选择当前作品主线。</p> : null}
    {error ? <p className="work-version-creation-error" role="alert"><AlertTriangle />{error}</p> : null}

    <section className="creation-source-banner" data-testid="creation-root-source">
      <div><span className={`creation-source-status ${statusClass}`}><ShieldCheck />{authorStatus}</span><strong>{state.root?.name || "当前作品主线"}</strong><small>{state.root ? `作品主线版本 · 第 ${state.root.revision} 版` : "需要一次明确作者动作建立当前作品主线"}</small></div>
      <dl><div><dt>故事范围</dt><dd>{state.storyUnit.title}</dd></div><div><dt>已确认选择</dt><dd>{state.events.length} 个事件引用</dd></div><div><dt>写回故事</dt><dd>不会</dd></div></dl>
    </section>

    {!state.root && view === "root-confirm" ? <section className="creation-source-confirm" data-testid="creation-root-create-confirm">
      <header><div><small>正式建立作品主线前</small><h2>建立当前作品主线快照</h2><p>请先核对这次写入的范围。确认后会建立一条作品主线版本记录。</p></div><ShieldCheck /></header>
      <div className="creation-source-confirm-grid"><section><h3>将会发生</h3><ul><li>沿用当前作品的版本记录</li><li>记录现有故事范围的稳定引用与完整性</li><li>建立一个可供创作稿固定引用的主线版本</li></ul></section><section><h3>不会发生</h3><ul><li>不会复制或改写故事正文</li><li>不会写入事件、人物、世界状态或关系</li><li>不会调用真实模型、插件或旧女娲运行身份</li></ul></section></div>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("source")}>返回</button><button type="button" className="primary-action" disabled={busy} onClick={() => void operate("create-root").then((ok) => ok && navigateView("source"))}>{busy ? "正在建立…" : "明确建立当前作品主线"}<ArrowRight /></button></footer>
    </section> : !state.root ? <section className="creation-source-primary-card"><BookOpenText /><div><small>第一步</small><h2>建立当前作品主线快照</h2><p>只记录现有故事记录的稳定引用与完整性，不复制故事正文。</p></div><button type="button" className="primary-action" disabled={busy} onClick={() => navigateView("root-confirm")}>核对并建立当前作品主线<ArrowRight /></button></section> : view === "source" ? <section className="creation-source-primary-card"><Link2 /><div><small>来源已就绪</small><h2>选择一个故事范围</h2><p>{state.storyUnit.summary}</p><span>未知项会保留；不会写入已确认事实、事件、世界状态、人物或关系。</span></div><button type="button" className="primary-action" onClick={() => navigateView("scope")}>查看来源范围<ArrowRight /></button></section> : null}

    {showPackage ? <section className="creation-package-preview" data-testid="creation-package-preview">
      <header><div><small>来源范围</small><h2>{state.package?.scope.label}</h2></div><span><Check />只读故事包已准备</span></header>
      <div className="creation-package-columns"><section><h3>故事范围</h3><p>{state.storyUnit.summary}</p><button type="button" onClick={() => openSource("story-unit", state.storyUnit.id)}><FileText />打开故事单元</button></section><section><h3>已引用事件</h3>{state.events.map((event) => <button type="button" key={event.id} onClick={() => openSource("event", event.id)}><Clock3 /><span>{event.title}<small>{event.status}</small></span></button>)}</section><section><h3>仍然未知</h3><p>寄信人身份、旧名出现的精确世界时间。</p><h3>不会写入</h3><p>已确认事实 · 事件 · 世界状态 · 人物 · 关系</p></section></div>
      <details className="neutral-technical-details"><summary>技术详情</summary><dl><div><dt>故事包</dt><dd>{state.package?.id}</dd></div><div><dt>内容指纹</dt><dd>{state.package?.digest}</dd></div><div><dt>来源锚点</dt><dd>{state.package?.sourceAnchors.map((item) => item.anchorId).join(" · ")}</dd></div></dl></details>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("source")}>返回选择</button>{view === "scope" ? <button type="button" className="primary-action" onClick={() => navigateView("confirm")}>选择小说 / 通用文稿<ArrowRight /></button> : <button type="button" className="primary-action" disabled={busy} onClick={() => void operate("create-artifact").then((ok) => ok && navigateView("created"))}>{busy ? "正在创建…" : "明确创建创作稿"}<ArrowRight /></button>}</footer>
    </section> : null}

    {showArtifact ? <section className="creation-artifact-layout">
      <article className="creation-artifact-editor" data-testid="creation-artifact-editor">
        <header><div><small>小说 · 通用文稿</small><strong>{state.artifact?.title}</strong></div><span><Check />已保存 · {revisionCount} 个修订</span></header>
        {view === "revisions" ? <RevisionHistory state={state} onBack={() => navigateView("editor")} /> : <>
          <label><span>作者正文</span><textarea ref={editorRef} value={view === "created" && revisionCount < 2 ? "" : text} onChange={(event) => setText(event.target.value)} onFocus={() => persistLocation({ focus: "editor" })} onSelect={() => persistLocation({ focus: "editor", selectionStart: editorRef.current?.selectionStart || 0, selectionEnd: editorRef.current?.selectionEnd || 0 })} placeholder="从空白开始写下作者正文…" /></label>
          <footer><button type="button" className="secondary-action" onClick={() => navigateView("revisions")}><History />修订记录</button><button type="button" className="secondary-action" onClick={() => navigateView("source-details")}><Link2 />来源与版本</button><button type="button" className="primary-action" disabled={busy || !text.trim()} onClick={() => void operate("save-artifact", { text }).then((ok) => ok && navigateView("editor"))}><Save />{busy ? "保存中…" : "保存作者修订"}</button></footer>
        </>}
      </article>
      <aside className="creation-source-sidecard">
        <small>创建时使用的版本</small><strong>当前作品主线 · 第 {state.artifact?.provenance.workVersionSource?.pinnedRevision} 版</strong><p>{validation?.authorMessage}</p>
        <button type="button" onClick={() => navigateView("source-details")}>查看来源与版本<ArrowRight /></button>
      </aside>
    </section> : null}

    {view === "source-details" && state.artifact ? <section className={`creation-source-details ${statusClass}`} data-testid="creation-source-details">
      <header><div><small>来源与版本</small><h2>{reconciliation?.status === "completed" ? `这份创作稿已重新核对到主线第 ${state.artifact.provenance.workVersionSource?.pinnedRevision} 版` : validation?.authorMessage}</h2><p>{reconciliation?.status === "completed" ? "正文未自动改写；作者只重新核对了来源范围。旧修订与第 1 版来源仍可回看。" : "创作稿正文与作者修订始终可读；来源不会自动更新或重新生成。"}</p></div><span>{validation?.sourceDependentOperationsAllowed ? <><CheckCircle2 />来源可复核</> : <><AlertTriangle />依赖来源的操作已阻断</>}</span></header>
      <details open={sourceExpanded} onToggle={(event) => { setSourceExpanded(event.currentTarget.open); persistLocation({ sourceExpanded: event.currentTarget.open, focus: "source-details" }); }}><summary data-testid="creation-source-range-summary">来源范围</summary><dl><div><dt>作品主线版本</dt><dd>{state.root?.name}</dd></div><div><dt>创建时使用的版本</dt><dd>第 {state.artifact.provenance.workVersionSource?.pinnedRevision} 版</dd></div><div><dt>故事单元</dt><dd><button type="button" data-testid="creation-source-story-unit-link" data-story-unit-id={state.storyUnit.id} onClick={() => openSource("story-unit", state.storyUnit.id)}>{state.storyUnit.title}</button></dd></div><div><dt>事件</dt><dd>{state.events.map((event) => <button type="button" data-testid="creation-source-event-link" data-event-id={event.id} key={event.id} onClick={() => openSource("event", event.id)}>{event.title}</button>)}</dd></div><div><dt>故事包</dt><dd>{validation?.status === "unverifiable_missing" ? "来源记录缺失" : validation?.status === "unverifiable_corrupt" ? "来源完整性检查失败" : state.package?.digest === state.artifact.provenance.workVersionSource?.neutralStoryPackageDigest ? "来源完整" : "来源完整性检查失败"}</dd></div></dl></details>
      <details className="neutral-technical-details" open={technicalExpanded} onToggle={(event) => { setTechnicalExpanded(event.currentTarget.open); persistLocation({ technicalExpanded: event.currentTarget.open, focus: "source-details" }); }}><summary>技术详情</summary><dl><div><dt>作品版本 ID</dt><dd>{state.artifact.provenance.workVersionSource?.workVersionId}</dd></div><div><dt>来源清单</dt><dd>{state.artifact.provenance.workVersionSource?.manifestId}</dd></div><div><dt>来源清单指纹</dt><dd>{state.artifact.provenance.workVersionSource?.manifestDigest}</dd></div><div><dt>创作稿修订</dt><dd>{state.artifact.currentRevisionId}</dd></div><div><dt>创建回执</dt><dd>{state.artifact.provenance.workVersionSource?.creationOperationReceipt.operationId}</dd></div></dl></details>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("editor")}>返回编辑</button>{props.routeKind === "fixture" && state.root?.revision === 2 && validation?.status === "current" ? <button type="button" className="secondary-action" disabled={busy} onClick={() => void operate("advance-root").then((ok) => ok && navigateView("source-details", { advanced: "1" }))}>推进隔离主线</button> : null}{compare ? <button type="button" className="primary-action" onClick={() => navigateView("source-compare")}>查看主线变化<ArrowRight /></button> : null}{reconciliation?.status === "completed" ? <button type="button" className="primary-action" onClick={() => navigateView("source-history")}>查看新旧来源<ArrowRight /></button> : null}</footer>
    </section> : null}

    {view === "source-compare" && state.artifact && compare ? <section className="creation-source-compare" data-testid="creation-source-drift-compare" data-compare-status={compare.status}>
      <header><div><small>来源变化</small><h2>第 {compare.baseRevision} 版来源与当前主线第 {compare.currentRevision} 版</h2><p>这份创作稿不会自动变化。你可以继续沿用旧来源，或明确重新核对。</p></div><span className={`creation-source-status is-${compare.status === "ready" ? "historical_valid" : "unverifiable_missing"}`}>{compare.status === "ready" ? <><CheckCircle2 />可由作者核对</> : <><AlertTriangle />{compare.blockerMessage}</>}</span></header>
      <div className="creation-source-version-strip"><article><small>创作稿当前来源</small><strong>主线第 {compare.baseRevision} 版</strong><p>历史来源完整、可复核</p></article><ArrowRight /><article><small>当前作品主线</small><strong>主线第 {compare.currentRevision} 版</strong><p>{compare.status === "blocked_concurrency" ? "已再次变化，需要重新打开对照" : "有更新可核对"}</p></article></div>
      <CreationDifferenceGroups compare={compare} selected={selectedDifferenceIds} onToggle={toggleDifference} />
      <details className="neutral-technical-details"><summary>技术详情</summary><dl><div><dt>对照方式</dt><dd>不可变来源清单 · 权威来源引用语义对照</dd></div><div><dt>基准指纹</dt><dd>{compare.baseManifestDigest}</dd></div><div><dt>当前指纹</dt><dd>{compare.currentManifestDigest}</dd></div></dl></details>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("source-details")}>返回来源详情</button><button type="button" className="secondary-action" onClick={() => navigateView("keep-old-source")}>继续沿用第 {compare.baseRevision} 版</button><button type="button" className="primary-action" disabled={compare.status !== "ready" || selectedDifferenceIds.length === 0} onClick={() => navigateView("source-reconciliation-confirm")}>重新核对到第 {compare.currentRevision} 版<ArrowRight /></button></footer>
    </section> : null}

    {view === "keep-old-source" && state.artifact && compare ? <section className="creation-source-decision" data-testid="creation-keep-old-source-zero-write">
      <CheckCircle2 /><div><small>作者选择已保留在当前页面</small><h2>继续沿用主线第 {compare.baseRevision} 版来源</h2><p>创作稿、来源绑定和作品主线都没有发生写入。你可以之后再次查看主线变化。</p><dl><div><dt>OutputArtifact 新修订</dt><dd>0</dd></div><div><dt>WorkVersion 新修订</dt><dd>0</dd></div><div><dt>故事事实写入</dt><dd>0</dd></div></dl></div><button type="button" className="secondary-action" onClick={() => navigateView("source-compare")}>返回对照</button>
    </section> : null}

    {view === "source-reconciliation-confirm" && state.artifact && compare ? <section className="creation-source-confirm" data-testid="creation-source-reconciliation-confirm">
      <header><div><small>正式建立新修订前</small><h2>重新核对到主线第 {compare.currentRevision} 版</h2><p>这不会自动改写正文，也不会把创作稿内容加入故事事实。</p></div><ShieldCheck /></header>
      <div className="creation-source-confirm-grid"><section><h3>将会发生</h3><ul><li>建立一个新的创作稿修订</li><li>新修订固定引用主线第 {compare.currentRevision} 版</li><li>作品主线追加一次创作稿引用</li><li>旧修订与第 {compare.baseRevision} 版来源继续保留</li></ul></section><section><h3>不会发生</h3><ul><li>不会自动修改作者正文</li><li>不会写入事件、人物、世界状态或关系</li><li>不会调用真实模型或插件</li></ul></section></div>
      <section className="creation-source-confirmed-list"><h3>作者确认核对的变化</h3>{compare.differences.filter((item) => selectedDifferenceIds.includes(item.id)).map((item) => <p key={item.id}><Check />{item.summary}</p>)}<h3>仍未解决</h3>{compare.differences.filter((item) => compare.unresolvedDifferenceIds.includes(item.id)).map((item) => <p key={item.id}><AlertTriangle />{item.summary}</p>)}</section>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("source-compare")}>返回变化对照</button><button type="button" className="primary-action" disabled={busy || compare.status !== "ready" || selectedDifferenceIds.length === 0} onClick={() => void operate("reconcile-source", { selectedDifferenceIds, expectedRootRevision: compare.currentRevision }).then((ok) => ok && navigateView("source-reconciliation-completed"))}>{busy ? "正在建立新修订…" : "建立新的创作稿修订"}<ArrowRight /></button></footer>
    </section> : null}

    {view === "source-reconciliation-completed" && state.artifact && reconciliation ? <section className="creation-source-completed" data-testid="creation-source-reconciliation-completed">
      <header><CheckCircle2 /><div><small>来源重新核对完成</small><h2>正文未自动改写；作者只重新核对了来源范围</h2><p>新创作稿修订固定引用主线第 {reconciliation.receipt.toRevision} 版；当前主线第 {state.root?.revision} 版只增加了该修订引用。</p></div></header>
      <dl><div><dt>旧创作稿修订</dt><dd>完整保留</dd></div><div><dt>新创作稿修订</dt><dd>已建立</dd></div><div><dt>旧来源</dt><dd>主线第 {reconciliation.receipt.fromRevision} 版</dd></div><div><dt>新来源</dt><dd>主线第 {reconciliation.receipt.toRevision} 版</dd></div><div><dt>正文</dt><dd>{reconciliation.bodyUnchanged ? "保持不变" : "已修改"}</dd></div><div><dt>未解决问题</dt><dd>{reconciliation.receipt.unresolvedDifferenceIds.length} 项继续保留</dd></div></dl>
      <details className="neutral-technical-details"><summary>技术详情</summary><dl><div><dt>旧创作稿修订</dt><dd>{reconciliation.receipt.originalArtifactRevisionId}</dd></div><div><dt>新创作稿修订</dt><dd>{reconciliation.receipt.newArtifactRevisionId}</dd></div><div><dt>来源重新核对回执</dt><dd>{reconciliation.receipt.idempotencyKey}</dd></div><div><dt>WorkVersion receipt</dt><dd>{reconciliation.receipt.expectedWorkVersionReceiptId}</dd></div><div><dt>语义对照指纹</dt><dd>{reconciliation.receipt.semanticDiffDigest}</dd></div></dl></details>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("editor")}>返回创作稿</button><button type="button" className="primary-action" onClick={() => navigateView("source-history")}>查看新旧来源<ArrowRight /></button></footer>
    </section> : null}

    {view === "source-history" && state.artifact && reconciliation ? <section className="creation-source-history" data-testid="creation-source-reconciliation-history">
      <header><div><small>来源与创作稿修订历史</small><h2>旧来源与新来源都被保留</h2><p>来源重新核对建立了新修订，没有覆盖旧修订。</p></div><History /></header>
      <ol><li><span>旧</span><div><strong>重新核对前的创作稿修订</strong><p>固定引用主线第 {reconciliation.receipt.fromRevision} 版</p></div></li><li><span>新</span><div><strong>重新核对后建立的创作稿修订</strong><p>固定引用主线第 {reconciliation.receipt.toRevision} 版 · 正文保持不变</p></div></li><li><span>主线</span><div><strong>当前作品主线 · 第 {state.root?.revision} 版</strong><p>只引用新创作稿修订，不成为该修订的来源</p></div></li></ol>
      <details className="neutral-technical-details"><summary>技术详情</summary><dl><div><dt>旧创作稿修订</dt><dd>{reconciliation.receipt.originalArtifactRevisionId}</dd></div><div><dt>新创作稿修订</dt><dd>{reconciliation.receipt.newArtifactRevisionId}</dd></div></dl></details>
      <footer><button type="button" className="secondary-action" onClick={() => navigateView("source-details")}>返回来源详情</button></footer>
    </section> : null}

    {view === "legacy" ? <section className="creation-legacy-source" data-testid="creation-legacy-zero-write"><FileText /><div><small>兼容创作稿</small><h2>{state.legacyArtifact?.title || "早期创作稿"}</h2><p>早期创作稿 · 尚未绑定作品版本</p><span>打开此页面不会迁移或写入；正文仍可读取。</span></div></section> : null}
  </main>;
}

export type CreationReturnSnapshot = {
  version: "tianyan-creation-return-location/r0";
  projectId: string;
  returnView: "scope" | "confirm" | "editor" | "source-details";
  artifactId: string;
  artifactRevisionId: string;
  selectedStoryUnitId: string;
  selectedEventId: string | null;
  scrollTop: number;
  focus: "editor" | "source-details";
  selectionStart: number;
  selectionEnd: number;
  sourceExpanded: boolean;
  technicalExpanded: boolean;
  selectedDifferenceIds: string[];
};

function CreationDifferenceGroups(props: {
  compare: NonNullable<WorkVersionBoundCreationFixture["sourceCompare"]>;
  selected: string[];
  onToggle(id: string): void;
}) {
  const groups = [
    { key: "added", label: "新增内容", kinds: ["added"] },
    { key: "removed", label: "已删除内容", kinds: ["removed"] },
    { key: "changed", label: "发生变化", kinds: ["changed"] },
    { key: "unchanged", label: "保持不变", kinds: ["unchanged"] },
    { key: "unknown", label: "未知项", kinds: ["unknown"] },
    { key: "conflict", label: "来源冲突", kinds: ["conflict"] },
    { key: "missing", label: "缺少证据", kinds: ["missing"] }
  ] as const;
  return <div className="creation-source-difference-groups">{groups.map((group) => {
    const items = props.compare.differences.filter((difference) => (group.kinds as readonly string[]).includes(difference.kind));
    return <section key={group.key} data-difference-group={group.key}><header><h3>{group.label}</h3><span>{items.length} 项</span></header>{items.length ? items.map((difference) => <label key={difference.id} className={difference.authorConfirmable ? "is-confirmable" : "is-read-only"}><input type="checkbox" checked={props.selected.includes(difference.id)} disabled={!difference.authorConfirmable || props.compare.status !== "ready"} onChange={() => props.onToggle(difference.id)} /><span><strong>{difference.dimension}</strong><p>{difference.summary}</p>{difference.affectsArtifact ? <small>可能影响当前创作稿，需要作者判断</small> : <small>只读影响 · 不产生正式写入</small>}</span></label>) : <p className="creation-source-none">当前没有此类差异。</p>}</section>;
  })}</div>;
}

function SourceDrilldown(props: { kind: "event" | "story-unit"; state: WorkVersionBoundCreationFixture; snapshot: CreationReturnSnapshot | null; onReturn(snapshot: CreationReturnSnapshot): void }) {
  const event = props.state.events.find((item) => item.id === props.snapshot?.selectedEventId) || props.state.events[0];
  const title = props.kind === "event" ? event?.title : props.state.storyUnit.title;
  return <main className="creation-source-drilldown" data-testid={`creation-${props.kind}-drilldown`}><header><button type="button" className="secondary-action" onClick={() => props.snapshot && props.onReturn(props.snapshot)}><ArrowLeft />返回创作稿</button><div><small>{props.kind === "event" ? "事件线 · 精确来源" : "故事库 · 故事单元"}</small><h1>{title}</h1></div></header><section><span className="creation-source-status is-current"><CheckCircle2 />来源引用完整</span><p>{props.kind === "event" ? "这是创作稿创建时明确选择的事件引用。它仍由现有事件记录持有；创作稿没有复制或修改事件正文。" : props.state.storyUnit.summary}</p><dl><div><dt>稳定引用</dt><dd>{props.kind === "event" ? event?.id : props.state.storyUnit.id}</dd></div><div><dt>创建时修订</dt><dd>{props.kind === "event" ? event?.revision : props.state.storyUnit.version}</dd></div><div><dt>创作稿修订</dt><dd>{props.snapshot?.artifactRevisionId}</dd></div></dl></section></main>;
}

function RevisionHistory(props: { state: WorkVersionBoundCreationFixture; onBack(): void }) {
  const revisions = useMemo(() => props.state.revisionHistory?.revisions || [], [props.state.revisionHistory]);
  return <section className="creation-revision-history" data-testid="creation-artifact-revision-history"><header><div><small>创作稿修订</small><h2>作者修订记录</h2></div><button type="button" className="secondary-action" onClick={props.onBack}>返回正文</button></header><ol>{revisions.map((revision) => <li key={revision.id}><span>{revision.sequence}</span><div><strong>{revision.source === "create" ? "创建空白创作稿" : "保存作者修订"}</strong><small>{revision.id} · {revision.recordedAt}</small></div></li>)}</ol></section>;
}

function returnKey(projectId: string) { return `story-studio:work-version-creation-return:${projectId}`; }
function readReturnSnapshot(projectId: string): CreationReturnSnapshot | null {
  try { const value = JSON.parse(sessionStorage.getItem(returnKey(projectId)) || "null") as CreationReturnSnapshot | null; return value?.version === "tianyan-creation-return-location/r0" && value.projectId === projectId ? value : null; }
  catch { return null; }
}
