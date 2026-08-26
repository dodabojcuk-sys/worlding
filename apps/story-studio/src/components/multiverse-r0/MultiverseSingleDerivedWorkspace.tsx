import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  GitBranch,
  History,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MultiverseSingleDerivedFixture } from "../../lib/localTransport";
import { WorkspaceHeader } from "../../product-shell/WorkspaceHeader";

const CHANGE_ID = "fixture.change.event.old-name-check";

type Action = "create-root" | "save-derived" | "prepare-review" | "prepare-impact" | "reject" | "confirm";
type View = "versions" | "compare" | "candidate" | "impact" | "history";

export function MultiverseSingleDerivedWorkspace(props: {
  projectId: string;
  surface: "multiverse" | "nuwa";
  load(surface?: "nuwa", fixtureCase?: "missing-source" | "stale"): Promise<MultiverseSingleDerivedFixture>;
  operate(action: Action, input?: Record<string, unknown>): Promise<MultiverseSingleDerivedFixture>;
  onOpenNuwa(): void;
  onReturnMultiverse(view: View): void;
  onOpenEventLine(eventId: string, returnState: { url: string; scrollTop: number }, authorControlReceiptId: string): void;
  onOpenWorkDock(prompt: string): void;
}) {
  const url = new URL(window.location.href);
  const fixtureCase = url.searchParams.get("case") === "missing-source" ? "missing-source" : url.searchParams.get("case") === "stale" ? "stale" : undefined;
  const requestedView = readView(url.searchParams.get("view"));
  const [data, setData] = useState<MultiverseSingleDerivedFixture | null>(null);
  const [view, setViewState] = useState<View>(requestedView);
  const [selected, setSelected] = useState(url.searchParams.get("selected") === CHANGE_ID);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void props.load(props.surface === "nuwa" ? "nuwa" : undefined, fixtureCase).then((next) => {
      if (!cancelled) {
        setData(next);
        if (next.review.stage === "integrated" && requestedView === "versions") setViewState("compare");
      }
    }).catch((cause) => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [props.projectId, props.surface, fixtureCase]);

  useEffect(() => {
    if (!data || props.surface !== "multiverse") return;
    const restore = window.history.state?.multiverseReturn as { scrollTop?: number } | null;
    if (!restore?.scrollTop) return;
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = restore.scrollTop || 0; });
  }, [data, props.surface]);

  useEffect(() => {
    if (!saveConfirmOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSaveConfirmOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [saveConfirmOpen]);

  const effectiveView = useMemo<View>(() => {
    if (view === "versions" || view === "history") return view;
    if (data?.review.stage === "impact-review" || data?.review.stage === "integrated") return view === "compare" ? "compare" : "impact";
    if (data?.review.stage === "candidate-review" || data?.review.stage === "rejected") return view === "compare" ? "compare" : "candidate";
    return view;
  }, [data?.review.stage, view]);

  function setView(next: View) {
    setViewState(next);
    const route = new URL(window.location.href);
    route.searchParams.set("view", next);
    if (selected) route.searchParams.set("selected", CHANGE_ID);
    else route.searchParams.delete("selected");
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: props.surface, multiverseView: next }, "", `${route.pathname}${route.search}`);
  }

  async function act(action: Action, input: Record<string, unknown> = {}, nextView?: View) {
    setBusy(true);
    setError("");
    try {
      const next = await props.operate(action, input);
      setData(next);
      if (nextView) setView(nextView);
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <section className="multiverse-r0-loading"><Sparkles /><strong>正在找回作品版本</strong><p>{error || "正在核对版本来源与已保存的作者选择…"}</p></section>;

  if (props.surface === "nuwa") return <NuwaSaveSurface
    data={data}
    busy={busy}
    error={error}
    confirmOpen={saveConfirmOpen}
    onConfirmOpen={setSaveConfirmOpen}
    onSave={(versionName) => { void act("save-derived", { versionName, sourceRevision: data.nuwa?.saveConfirmation.sourceRevision, changeId: CHANGE_ID }).then((saved) => { if (saved) props.onReturnMultiverse("versions"); }); }}
    onBack={() => props.onReturnMultiverse("versions")}
    onOpenWorkDock={props.onOpenWorkDock}
  />;

  return <section className="workbench multiverse-r0-workspace" data-testid="multiverse-single-derived-workspace" data-view={effectiveView} data-review-stage={data.review.stage}>
    <WorkspaceHeader
      projectTitle={data.project.title}
      sectionLabel="多元"
      title="作品版本"
      context="一条主线 · 一条直接走向"
      status={<span className={data.review.stage === "integrated" ? "is-confirmed" : "is-candidate"}>{data.review.stage === "integrated" ? "已融入主线" : data.derived ? "等待作者选择" : data.root ? "主线基线已建立" : "尚未建立版本基线"}</span>}
      icon={<GitBranch />}
      prototype="workbench"
      className="multiverse-r0-header"
      actions={<div className="multiverse-r0-header-actions"><span><ShieldCheck />只有作者确认才会改变当前故事</span><button type="button" data-testid="multiverse-open-work-dock" onClick={() => props.onOpenWorkDock("解释当前版本差异、来源和写入边界")}><MessageCircle />打开工作助手</button></div>}
    />

    {error ? <div className="multiverse-r0-error" role="alert"><AlertTriangle />{error}</div> : null}
    {data.blockers.missingSource || data.blockers.staleSelection ? <div className="multiverse-r0-blocker" role="alert"><AlertTriangle /><div><strong>{data.blockers.missingSource ? "来源版本的引用不完整" : "已选变化已过期"}</strong><p>本次无法继续审查或写入；当前故事保持不变。</p></div></div> : null}

    <div className="multiverse-r0-layout">
      <aside className="multiverse-r0-versions" aria-label="作品版本列表">
        <header><small>当前作品</small><strong>版本与走向</strong></header>
        {data.root ? <VersionCard label="当前主线" name={data.root.name} revision={data.root.revision} active={!data.derived || effectiveView === "versions"} detail={data.root.revision === 2 ? "已融入 1 条作者选定的事件" : "作品版本基线"} /> : <div className="multiverse-r0-side-empty">尚未建立主线基线</div>}
        {data.derived ? <VersionCard label="其他走向" name={data.derived.name} revision={data.derived.revision} active={effectiveView !== "versions"} detail={data.derived.status === "integrated" ? "已选择其中 1 条变化融入主线" : data.derived.status === "source-updated" ? `依然保留在主线第 ${data.derived.pinnedRootRevision} 版` : `来自主线第 ${data.derived.pinnedRootRevision} 版`} /> : data.root ? <div className="multiverse-r0-side-empty">这里还没有其他走向。<br />可以从已完成的女娲临时走向显式保存。</div> : null}
        {data.derived ? <nav><button className={effectiveView === "compare" ? "is-active" : ""} type="button" onClick={() => setView("compare")}><BookOpen />版本对照</button><button className={effectiveView === "history" ? "is-active" : ""} type="button" onClick={() => setView("history")}><History />融入记录</button></nav> : null}
      </aside>

      <main className="multiverse-r0-main" ref={scrollRef}>
        {!data.root ? <RootEmpty busy={busy} onCreate={() => void act("create-root")} /> : !data.derived ? <DerivedEmpty onOpenNuwa={props.onOpenNuwa} /> : effectiveView === "versions" ? <VersionOverview data={data} onCompare={() => setView("compare")} /> : effectiveView === "compare" ? <CompareSurface data={data} selected={selected} busy={busy} onSelected={(checked) => {
          setSelected(checked);
          const route = new URL(window.location.href);
          if (checked) route.searchParams.set("selected", CHANGE_ID);
          else route.searchParams.delete("selected");
          window.history.replaceState({ ...(window.history.state ?? {}), multiverseSelected: checked }, "", `${route.pathname}${route.search}`);
        }} onReview={() => void act("prepare-review", { selectedChangeIds: [CHANGE_ID] }, "candidate")} onImpact={() => setView("impact")} /> : effectiveView === "candidate" ? <CandidateReview data={data} busy={busy} onBack={() => setView("compare")} onReject={() => void act("reject", {}, "candidate")} onImpact={() => void act("prepare-impact", {}, "impact")} /> : effectiveView === "impact" ? <ImpactReview data={data} busy={busy} onBack={() => setView("candidate")} onReject={() => void act("reject", {}, "candidate")} onConfirm={() => void act("confirm", { selectedChangeIds: [CHANGE_ID] }, "impact")} onEvent={() => {
          if (!data.review.appliedEventId) return;
          const current = new URL(window.location.href);
          current.searchParams.set("view", "compare");
          current.searchParams.set("selected", CHANGE_ID);
          if (!data.review.changeSetId) return;
          props.onOpenEventLine(data.review.appliedEventId, { url: `${current.pathname}${current.search}`, scrollTop: scrollRef.current?.scrollTop || 0 }, data.review.changeSetId);
        }} /> : <HistorySurface data={data} onCompare={() => setView("compare")} />}
      </main>
    </div>
  </section>;
}

function RootEmpty(props: { busy: boolean; onCreate(): void }) {
  return <section className="multiverse-r0-empty" data-testid="multiverse-empty-root"><span><GitBranch /></span><small>当前作品还没有版本基线</small><h1>为当前作品建立版本基线</h1><p>建立后，你才能把女娲中的一条临时走向保存成可对照的作品版本。这个动作不会改变正文。</p><button type="button" className="primary-action" disabled={props.busy} onClick={props.onCreate}><Check />明确建立主线基线</button></section>;
}

function DerivedEmpty(props: { onOpenNuwa(): void }) {
  return <section className="multiverse-r0-empty" data-testid="multiverse-empty-derived"><span><Sparkles /></span><small>主线基线已准备</small><h1>这里还没有其他走向…</h1><p>前往女娲，查看已完成的隔离临时走向。只有你选择“保存为多元版本”并确认来源后，它才会出现在这里。</p><button type="button" className="primary-action" onClick={props.onOpenNuwa}><Sparkles />打开女娲临时走向<ArrowRight /></button></section>;
}

function NuwaSaveSurface(props: { data: MultiverseSingleDerivedFixture; busy: boolean; error: string; confirmOpen: boolean; onConfirmOpen(open: boolean): void; onSave(versionName: string): void; onBack(): void; onOpenWorkDock(prompt: string): void }) {
  const source = props.data.nuwa;
  const [versionName, setVersionName] = useState(source?.saveConfirmation.versionName ?? "");
  if (!source) return <section className="multiverse-r0-loading"><Sparkles /><strong>正在找回女娲临时走向</strong></section>;
  const run = source.run;
  return <section className="workbench multiverse-r0-workspace multiverse-r0-nuwa" data-testid="multiverse-nuwa-save" data-run-id={run.runId}>
    <WorkspaceHeader projectTitle={props.data.project.title} sectionLabel="女娲" title="旧名线索纠正后的临时走向" context="已完成 · 未改变当前故事" status={<span className="is-candidate">可保存为多元版本</span>} icon={<Sparkles />} prototype="workbench" className="multiverse-r0-header" actions={<div className="multiverse-r0-header-actions"><button type="button" onClick={() => props.onOpenWorkDock("解释这条女娲临时走向的来源和不变项")}><MessageCircle />打开工作助手</button></div>} />
    {props.error ? <div className="multiverse-r0-error" role="alert"><AlertTriangle />{props.error}</div> : null}
    <main className="multiverse-r0-nuwa-main"><button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />返回多元</button><section className="multiverse-r0-nuwa-summary"><small>已完成的隔离走向</small><h1>先核对旧名守夜记录</h1><p>女娲保留了原始排演，并从第 2 步之后建立了一条纠正走向。寄信人身份和精确时间仍然未知。</p><div className="multiverse-r0-nuwa-line"><article><span>1</span><strong>铜钥匙交接</strong><small>与当前故事一致</small></article><ArrowRight /><article><span>2</span><strong>询问阿芜亲历的记录</strong><small>临时走向</small></article><ArrowRight /><article><span>3</span><strong>先核对旧名守夜记录</strong><small>事件候选</small></article></div><div className="multiverse-r0-write-zero"><ShieldCheck /><div><strong>当前故事没有发生变化</strong><p>这条走向仍只存在于隔离排演中；Event、Character、WorldState 与 Relation 正式写入都是 0。</p></div></div><button type="button" className="primary-action" data-testid="save-as-multiverse" onClick={() => props.onConfirmOpen(true)}><GitBranch />保存为多元版本</button><details><summary>来源与技术详情</summary><code>{run.runId}</code><code>{run.handoff?.sourceBranchId}</code><code>{run.handoff?.sourceStepId}</code></details></section></main>
    {props.confirmOpen ? <div className="multiverse-r0-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onConfirmOpen(false); }}><section className="multiverse-r0-confirm" role="dialog" aria-modal="true" aria-labelledby="multiverse-save-title"><header><div><small>保存前确认</small><h2 id="multiverse-save-title">建立一个直接派生版本</h2></div><button type="button" aria-label="关闭确认" onClick={() => props.onConfirmOpen(false)}><X /></button></header><dl><div><dt><label htmlFor="multiverse-version-name">版本名称</label></dt><dd><input id="multiverse-version-name" value={versionName} maxLength={80} autoFocus onChange={(event) => setVersionName(event.currentTarget.value)} /></dd></div><div><dt>来源主线</dt><dd>当前作品主线 · 第 {source.saveConfirmation.sourceRevision} 版</dd></div><div><dt>选中走向</dt><dd>{source.saveConfirmation.sourcePath}</dd></div><div><dt>事件候选</dt><dd>{source.saveConfirmation.eventCandidate}</dd></div></dl><div className="multiverse-r0-confirm-boundary"><ShieldCheck /><p><strong>此时仍不会改变当前故事</strong>保存后只会建立一个可对照的直接走向；要等你在多元中再次审查和确认，才能融入主线。</p></div><footer><button type="button" className="secondary-action" onClick={() => props.onConfirmOpen(false)}>取消</button><button type="button" className="primary-action" disabled={props.busy || !versionName.trim()} onClick={() => props.onSave(versionName.trim())}><Check />确认保存这个版本</button></footer></section></div> : null}
  </section>;
}

function VersionOverview(props: { data: MultiverseSingleDerivedFixture; onCompare(): void }) {
  return <section className="multiverse-r0-overview"><small>作品版本</small><h1>一条主线，一条已保存的其他走向</h1><p>这条走向从主线第 1 版直接产生，保留了女娲排演来源。它不是当前故事，也不会自动跟随主线改变。</p><div className="multiverse-r0-lineage"><VersionNode label="主线" name={props.data.root!.name} revision={props.data.root!.revision} /><ArrowRight /><VersionNode label="直接走向" name={props.data.derived!.name} revision={props.data.derived!.revision} /></div><section className="multiverse-r0-provenance"><BookOpen /><div><strong>来自主线第 {props.data.derived!.pinnedRootRevision} 版</strong><p>女娲临时走向：旧名线索纠正后的结果。当前故事仍未改变。</p></div></section><button type="button" className="primary-action" onClick={props.onCompare}>打开版本对照<ArrowRight /></button></section>;
}

function CompareSurface(props: { data: MultiverseSingleDerivedFixture; selected: boolean; busy: boolean; onSelected(checked: boolean): void; onReview(): void; onImpact(): void }) {
  const compare = props.data.compare!;
  const integrated = props.data.review.stage === "integrated";
  return <section className="multiverse-r0-compare" data-testid="multiverse-semantic-compare"><header><div><small>作者对照</small><h1>版本对照</h1><p>同时看见这条走向建立时的主线、当前主线，以及派生走向提出的变化。</p></div><span>{integrated ? "已融入 1 条变化" : "可选 1 条变化"}</span></header><div className="multiverse-r0-three-way"><article><small>建立时的主线</small><strong>第 {compare.base.revision} 版</strong><p>{compare.base.label}</p></article><article><small>当前主线</small><strong>第 {compare.current.revision} 版</strong><p>{compare.current.label}</p></article><article><small>其他走向</small><strong>{compare.derived.label}</strong><p>依然基于主线第 {compare.derived.pinnedRevision} 版</p></article></div><section className="multiverse-r0-signal-summary" aria-label="语义比较维度"><header><div><small>语义范围</small><h2>变化、未知与影响范围</h2></div><span>只有事件变化可选择</span></header><div>{compare.signals.map((signal) => <article key={signal.dimension} className={`is-${signal.state}`}><span>{dimensionLabel(signal.dimension)}</span><strong>{stateLabel(signal.state)}</strong><p>{signal.summary}</p></article>)}</div></section><div className="multiverse-r0-diff-list">{compare.rows.map((row) => <article key={row.owner} className={`is-${row.state} ${row.selectable ? "is-selectable" : ""}`}><header><span className="multiverse-r0-owner">{ownerLabel(row.owner)}</span><span className="multiverse-r0-state">{stateLabel(row.state)}</span>{row.selectable ? <label><input type="checkbox" checked={props.selected} disabled={integrated} onChange={(event) => props.onSelected(event.currentTarget.checked)} /><span>{integrated ? "已融入" : "选择这条变化"}</span></label> : null}</header><div><section><small>建立时</small><p>{row.base}</p></section><section><small>当前主线</small><p>{row.current}</p></section><section><small>这条走向提出</small><p>{row.derived}</p></section></div>{row.owner === "Event" ? <footer><BookOpen />来源：灯塔守夜记录残页、阿芜现场观察</footer> : null}</article>)}</div>{integrated ? <div className="multiverse-r0-integrated"><CheckCircle2 /><div><strong>所选事件已融入当前主线</strong><p>主线已从第 1 版进入第 2 版；这条派生走向仍保留在来源第 1 版。</p></div><button type="button" onClick={props.onImpact}>查看确认回执<ArrowRight /></button></div> : <footer className="multiverse-r0-action-bar"><div><strong>{props.selected ? "已选择 1 条 Event 变化" : "请选择要审查的变化"}</strong><p>Character、WorldState 与 Relation 不会写入。</p></div><button type="button" className="primary-action" disabled={!props.selected || props.busy || props.data.blockers.missingSource || props.data.blockers.staleSelection} onClick={props.onReview}>审查所选变化<ArrowRight /></button></footer>}</section>;
}

function CandidateReview(props: { data: MultiverseSingleDerivedFixture; busy: boolean; onBack(): void; onReject(): void; onImpact(): void }) {
  const rejected = props.data.review.stage === "rejected";
  return <section className="multiverse-r0-review"><header><div><small>作者审查 · 所选变化</small><h1>先核对旧名守夜记录</h1><p>这是从版本对照中选中的 Event 变化。它仍不是当前故事事实。</p></div><span>{rejected ? "已放弃" : "等待影响审查"}</span></header><ReviewSection title="这条变化会做什么" body="在铜钥匙交接之后、进入灯塔之前，增加一次旧名守夜记录核对。" /><ReviewSection title="使用的作者来源" body="灯塔守夜记录残页；阿芜只复述自己亲历的观察。" /><ReviewSection title="仍然未知" body="寄信人身份；旧名出现的精确世界时间。" /><ReviewSection title="不会改变" body="角色当前状态、灯塔历史、世界状态与现有关系事实。" /><footer><button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />返回版本对照</button><button type="button" className="secondary-action" disabled={props.busy || rejected} onClick={props.onReject}><X />放弃这条变化</button><button type="button" className="primary-action" disabled={props.busy || rejected} onClick={props.onImpact}>继续影响审查<ArrowRight /></button></footer></section>;
}

function ImpactReview(props: { data: MultiverseSingleDerivedFixture; busy: boolean; onBack(): void; onReject(): void; onConfirm(): void; onEvent(): void }) {
  const integrated = props.data.review.stage === "integrated";
  return <section className="multiverse-r0-impact"><header><div><small>作者审查 · 影响范围</small><h1>确认后，当前作品会发生什么</h1><p>{integrated ? "作者已确认这条变化，完整回执和版本来源均已保留。" : "只有下列 Event 会成为当前故事事实。请在确认前核对不变项与未知项。"}</p></div><span>{integrated ? "已确认并融入" : "等待最终确认"}</span></header><div className="multiverse-r0-impact-grid"><ImpactColumn title="当前事实" items={["沈砚已持有潮纹铜钥匙", "灯塔行动尚未确定"]} /><ImpactColumn title="确认后的变化" items={["新增事件：先核对旧名守夜记录"]} /><ImpactColumn title="保持不变" items={["角色状态不写入", "世界状态不写入", "关系事实不写入"]} /><ImpactColumn title="未知与冲突" items={["寄信人身份仍未知", "精确世界时间仍未知"]} /></div><section className="multiverse-r0-write-plan"><div><strong>正式写入计划</strong><p>Event 1 · 主线版本修订 1 · Character 0 · WorldState 0 · Relation 0 · 其他 0</p></div><div><strong>版本结果</strong><p>主线从第 1 版进入第 2 版；派生走向继续锁定来源第 1 版。</p></div></section>{integrated ? <section className="multiverse-r0-receipt"><CheckCircle2 /><div><strong>融入已完成</strong><p>新事件已通过作者确认链加入事件线；重复确认不会产生第二条事件或第三个版本修订。</p></div><button type="button" className="primary-action" onClick={props.onEvent}>在事件线中查看<ArrowRight /></button></section> : <footer><button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />返回所选变化</button><button type="button" className="secondary-action" disabled={props.busy} onClick={props.onReject}><X />放弃这条变化</button><button type="button" className="primary-action" disabled={props.busy} onClick={props.onConfirm}><Check />确认并融入当前版本</button></footer>}</section>;
}

function HistorySurface(props: { data: MultiverseSingleDerivedFixture; onCompare(): void }) {
  const integrated = props.data.review.stage === "integrated";
  return <section className="multiverse-r0-history"><header><History /><div><small>版本历史</small><h1>主线的作者选择</h1><p>只显示已有 Owner 的回执与版本修订，不会补造另一套差异记录。</p></div></header>{integrated ? <ol><li><span>2</span><article><small>主线第 2 版</small><strong>融入“先核对旧名守夜记录”</strong><p>来自“旧名守夜记录走向”的 1 条 Event 变化；其他正式写入为 0。</p></article></li><li><span>1</span><article><small>主线第 1 版</small><strong>建立当前作品版本基线</strong><p>后来的派生走向仍锁定在这个来源版本。</p></article></li></ol> : <section className="multiverse-r0-empty-history"><RotateCcw /><strong>还没有变化融入主线</strong><p>完成作者审查与确认后，这里会显示可追溯的版本修订。</p></section>}<button type="button" className="secondary-action" onClick={props.onCompare}><ArrowLeft />返回版本对照</button></section>;
}

function VersionCard(props: { label: string; name: string; revision: number; active: boolean; detail: string }) { return <article className={`multiverse-r0-version-card ${props.active ? "is-active" : ""}`}><small>{props.label}</small><strong>{props.name}</strong><p>{props.detail}</p><span>第 {props.revision} 版</span></article>; }
function VersionNode(props: { label: string; name: string; revision: number }) { return <article><small>{props.label}</small><strong>{props.name}</strong><span>第 {props.revision} 版</span></article>; }
function ReviewSection(props: { title: string; body: string }) { return <section><h2>{props.title}</h2><p>{props.body}</p></section>; }
function ImpactColumn(props: { title: string; items: string[] }) { return <section><strong>{props.title}</strong><ul>{props.items.map((item) => <li key={item}>{item}</li>)}</ul></section>; }
function ownerLabel(owner: "Event" | "Character" | "WorldState" | "Relation") { return owner === "Event" ? "事件" : owner === "Character" ? "角色" : owner === "WorldState" ? "世界状态" : "关系"; }
function stateLabel(state: "changed" | "unchanged" | "unknown" | "conflict" | "stale" | "insufficient" | "integrated") { return state === "changed" ? "发生改变" : state === "unchanged" ? "保持不变" : state === "unknown" ? "仍然未知" : state === "conflict" ? "存在冲突" : state === "stale" ? "来源已过期" : state === "insufficient" ? "证据不足" : "已融入"; }

function dimensionLabel(dimension: string) {
  return ({ "Event hierarchy": "事件层级", "Narrative order": "叙事顺序", "World time": "世界时间", "Character action": "角色行动", "Character State": "人物状态", "Character knowledge": "知识、信念与误解", "Character Fate": "人物命运", WorldState: "世界状态", Relation: "关系", "Items and places": "物品与地点", "Source and evidence": "来源与证据", "Open questions": "开放问题", Conflict: "冲突", "Stale source": "过期来源", "Missing evidence": "缺失证据", "Creation regeneration": "创作输出" } as Record<string, string>)[dimension] ?? dimension;
}
function readView(value: string | null): View { return value === "compare" || value === "candidate" || value === "impact" || value === "history" ? value : "versions"; }
function message(error: unknown) { return error instanceof Error ? error.message : String(error || "操作暂时无法完成。"); }
