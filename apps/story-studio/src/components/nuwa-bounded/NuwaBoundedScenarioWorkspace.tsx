import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleStop,
  GitBranch,
  Layers3,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  StepForward,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { NuwaBoundedFixture, NuwaBoundedProjection } from "../../lib/localTransport";
import { WorkspaceHeader } from "../../product-shell/WorkspaceHeader";

type Surface = "stage" | "branch" | "compare" | "overlay" | "candidate" | "impact" | "replay";
type FixtureAction = "start" | "step" | "play" | "pause" | "resume" | "cancel" | "fork" | "select-branch" | "view" | "handoff" | "replay" | "prepare-review" | "prepare-impact" | "reject" | "confirm";

export function NuwaBoundedScenarioWorkspace(props: {
  projectId: string;
  projectTitle: string;
  load(fixtureCase?: "missing-source" | "stale"): Promise<NuwaBoundedFixture>;
  operate(action: FixtureAction, input?: Record<string, unknown>): Promise<NuwaBoundedFixture>;
  onOpenWorkDock(prompt: string): void;
  onOpenEventLine(eventId?: string | null): void;
}) {
  const route = new URL(window.location.href);
  const requestedView = route.searchParams.get("view");
  const fixtureCase = route.searchParams.get("case") === "missing-source" ? "missing-source" : route.searchParams.get("case") === "stale" ? "stale" : undefined;
  const [data, setData] = useState<NuwaBoundedFixture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [surface, setSurface] = useState<Surface>(() => routeSurface(requestedView));
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(true);

  useEffect(() => {
    setSurface(routeSurface(requestedView));
  }, [requestedView]);

  useEffect(() => {
    let cancelled = false;
    void props.load(fixtureCase).then((next) => {
      if (cancelled) return;
      setData(next);
      setSelectedStepId(routeSelectedStep(requestedView, next.run) || next.run.viewState.selectedStepId || next.run.activeBranch.steps.at(-1)?.stepId || null);
    }).catch((cause) => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [props.projectId, fixtureCase]);

  const run = data?.run || null;
  const selectedStep = useMemo(() => run?.branches.flatMap((branch) => branch.steps).find((step) => step.stepId === selectedStepId) || run?.selectedStep || null, [run, selectedStepId]);
  const hasTemporaryBranch = Boolean(run?.branches.some((branch) => branch.kind === "temporary"));
  const canCompare = Boolean(run && run.branches.length >= 2 && run.branches.every((branch) => branch.status === "completed"));

  async function act(action: FixtureAction, input: Record<string, unknown> = {}, nextSurface?: Surface) {
    setBusy(true);
    setError("");
    try {
      const next = await props.operate(action, input);
      setData(next);
      const requested = action === "fork" ? next.run.activeBranch.steps.at(-1)?.stepId : next.run.viewState.selectedStepId || next.run.activeBranch.steps.at(-1)?.stepId;
      if (requested) setSelectedStepId(requested);
      if (nextSurface) setSurface(nextSurface);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  function selectStep(stepId: string) {
    setSelectedStepId(stepId);
    void act("view", { operationId: `view:step:${stepId}`, view: { selectedStepId: stepId } });
  }

  if (!data || !run) return <section className="nuwa-bounded-loading"><Sparkles /><strong>正在恢复排演现场</strong><p>{error || "正在找回上次停留的位置…"}</p></section>;

  const snapshot = run.snapshot!;
  const formalWrites = data.review.eventWrites;
  return <section className="workbench nuwa-bounded-workspace" data-testid="nuwa-bounded-workspace" data-run-status={run.lifecycle} data-review-stage={data.review.stage} data-surface={surface}>
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="女娲"
      title="潮痕来信 · 排演现场"
      context="灯塔行动前 · 当前故事切片"
      status={<span className={run.handoff?.status === "integrated" ? "is-confirmed" : run.integrityStatus === "current" ? "is-candidate" : "is-quiet"}>{run.handoff?.status === "integrated" ? "已加入事件线" : lifecycleLabel(run.lifecycle)}</span>}
      icon={<Sparkles />}
      prototype="workbench"
      className="nuwa-bounded-header"
      actions={<div className="nuwa-bounded-header-actions"><span><ShieldCheck />所有变化均需作者确认</span><button type="button" data-testid="nuwa-open-work-dock" onClick={() => props.onOpenWorkDock("解释女娲当前步骤，并检查角色知识边界") }><MessageCircle />打开天意助手</button></div>}
    />

    <div className="nuwa-bounded-status-ribbon" role="status">
      <span className="is-baseline">当前故事</span><ArrowRight /><span className={run.activeBranch.kind === "temporary" ? "is-temporary" : "is-rehearsal"}>{run.activeBranch.kind === "temporary" ? "临时走向" : "排演现场"}</span><ArrowRight /><span className={run.handoff ? "is-candidate" : "is-quiet"}>{run.handoff?.status === "integrated" ? "已加入事件线" : run.handoff ? "等待作者审查" : "尚未送审"}</span>
      <em>{run.activeBranch.kind === "temporary" ? "正在查看纠正后的走向" : "正在查看原始排演"}</em>
    </div>

    {run.submissionBlocker ? <div className="nuwa-bounded-fail-closed" role="alert"><AlertTriangle /><div><strong>暂时不能送入作者审查</strong><p>{authorBlocker(run.submissionBlocker)}</p></div><span>当前故事未改变</span></div> : null}
    {error ? <div className="nuwa-bounded-error" role="alert"><AlertTriangle />{error}</div> : null}

    <div className="nuwa-bounded-shell" data-scope-open={scopeOpen ? "true" : "false"}>
      <aside className="nuwa-bounded-scope" aria-label="当前排演范围">
        <button className="nuwa-bounded-scope-toggle" type="button" aria-expanded={scopeOpen} onClick={() => setScopeOpen((open) => !open)}><BookOpen /><strong>当前排演范围</strong><ChevronDown /></button>
        {scopeOpen ? <div className="nuwa-bounded-scope-content">
          <ScopeItem label="当前故事段落" value="潮痕来信 · 灯塔行动前" />
          <ScopeItem label="起点事件" value={snapshot.confirmedEvents[0]?.title || "未知"} tone="baseline" />
          <ScopeItem label="参与角色" value={snapshot.participatingCharacters.map((item) => item.displayName).join("、")} />
          <ScopeItem label="作者目标" value={snapshot.authorGoal} />
          <section><small>角色此时知道</small>{snapshot.characterKnowledgeBoundaries.map((boundary) => <article key={boundary.characterId} className="nuwa-scope-character"><strong>{boundary.displayName}</strong><p>{boundary.claims.filter((claim) => claim.stance !== "unknown").map((claim) => claim.label).join("；")}</p><em>未知：{boundary.claims.filter((claim) => claim.stance === "unknown").map((claim) => claim.label).join("、")}</em></article>)}</section>
          <section><small>引用来源</small>{snapshot.selectedSources.map((source) => <span className={source.available ? "is-source" : "is-missing"} key={source.sourceAnchorId}>{source.available ? <Check /> : <X />}{source.label}</span>)}</section>
          <section><small>明确排除 / 禁止改变</small><ul>{snapshot.forbiddenChanges.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <dl><div><dt>最大步数</dt><dd>{snapshot.maximumSteps}</dd></div><div><dt>最大分支</dt><dd>{snapshot.maximumBranches}</dd></div><div><dt>世界时间</dt><dd>未知（不插值）</dd></div></dl>
          <details><summary>技术详情</summary><code>{snapshot.integrity}</code><p>{snapshot.selectedSources.length} 个 allowlisted anchors · source revision {snapshot.sourceRevision.slice(0, 12)}</p></details>
        </div> : null}
      </aside>

      <main className="nuwa-bounded-main">
        <nav className="nuwa-bounded-tools" aria-label="页面辅助工具">
          <button type="button" className={surface === "stage" ? "is-active" : ""} onClick={() => setSurface("stage")}>排演现场</button>
          <button type="button" className={surface === "branch" ? "is-active" : ""} onClick={() => setSurface("branch")}>临时走向</button>
          <button type="button" className={surface === "compare" ? "is-active" : ""} disabled={!canCompare} title={hasTemporaryBranch && !canCompare ? "完成两个走向后比较" : undefined} onClick={() => setSurface("compare")}>结果对照</button>
          <button type="button" className={surface === "overlay" ? "is-active" : ""} onClick={() => setSurface("overlay")}>事件候选</button>
          <button type="button" className={surface === "candidate" || surface === "impact" ? "is-active" : ""} onClick={() => setSurface(data.review.stage === "impact-review" || data.review.stage === "integrated" ? "impact" : "candidate")}>作者审查</button>
          <button type="button" className={surface === "replay" ? "is-active" : ""} onClick={() => void act("replay", {}, "replay")}>回放记录</button>
        </nav>

        <RunControls run={run} busy={busy} onAct={(action, input, nextSurface) => void act(action, input || {}, nextSurface)} />

        {surface === "stage" ? <StageSurface run={run} selectedStepId={selectedStepId} onSelectStep={selectStep} /> : null}
        {surface === "branch" ? <BranchSurface run={run} busy={busy} onAct={(action, input, next) => void act(action, input || {}, next)} /> : null}
        {surface === "compare" ? <CompareSurface run={run} /> : null}
        {surface === "overlay" ? <OverlaySurface run={run} onOpenStep={(stepId) => { setSelectedStepId(stepId); setSurface("stage"); }} /> : null}
        {surface === "candidate" ? <CandidateSurface data={data} busy={busy} onBack={() => setSurface("stage")} onAct={(action, next) => void act(action, {}, next)} /> : null}
        {surface === "impact" ? <ImpactSurface data={data} busy={busy} onAct={(action) => void act(action, {}, "impact")} onOpenEventLine={props.onOpenEventLine} /> : null}
        {surface === "replay" ? <ReplaySurface run={run} /> : null}
      </main>

      <aside className="nuwa-bounded-detail" aria-label="选中排演步骤详情">
        <StepDetail step={selectedStep} />
        <section className="nuwa-bounded-write-totals"><small>正式故事变化</small><strong>{formalWrites ? "已由作者确认 1 条事件" : "当前故事尚未改变"}</strong><details><summary>技术详情</summary><dl><div><dt>Event</dt><dd>{formalWrites}</dd></div><div><dt>World</dt><dd>0</dd></div><div><dt>Relation</dt><dd>0</dd></div><div><dt>Memory</dt><dd>0</dd></div></dl></details></section>
      </aside>
    </div>
  </section>;
}

function RunControls(props: { run: NuwaBoundedProjection; busy: boolean; onAct(action: FixtureAction, input?: Record<string, unknown>, surface?: Surface): void }) {
  const run = props.run;
  const active = run.activeBranch;
  return <section className="nuwa-bounded-controls" aria-label="女娲运行控制">
    <div><strong>{lifecycleLabel(run.lifecycle)}</strong><span>步骤 {active.steps.length} / {run.snapshot?.maximumSteps || 0}</span><progress value={active.steps.length} max={run.snapshot?.maximumSteps || 4} /></div>
    <div className="nuwa-bounded-control-buttons">
      {run.lifecycle === "ready" ? <button className="primary-action" type="button" disabled={props.busy} onClick={() => props.onAct("start")}><Play />开始排演</button> : null}
      {run.lifecycle === "running" ? <><button className="primary-action" type="button" disabled={props.busy} onClick={() => props.onAct("step")}><StepForward />单步</button><button type="button" disabled={props.busy} onClick={() => props.onAct("play")}><Play />连续运行</button><button type="button" disabled={props.busy} onClick={() => props.onAct("pause")}><Pause />暂停</button><button type="button" disabled={props.busy} onClick={() => props.onAct("cancel")}><CircleStop />取消</button></> : null}
      {run.lifecycle === "paused" ? <><button className="primary-action" type="button" disabled={props.busy} onClick={() => props.onAct("resume")}><Play />继续</button>{active.kind === "original" && active.steps.length >= 2 && run.branches.length < 2 ? <button type="button" disabled={props.busy} onClick={() => props.onAct("fork", { sourceBranchId: active.branchId, sequence: 2, instruction: "不要展示完整来信，只询问阿芜亲历的守夜记录。" }, "branch")}><GitBranch />从第二步建立临时走向</button> : null}</> : null}
      {run.lifecycle === "completed" && active.kind === "original" && run.branches.length < 2 ? <button className="primary-action" type="button" disabled={props.busy} onClick={() => props.onAct("fork", { sourceBranchId: active.branchId, sequence: 2, instruction: "不要展示完整来信，只询问阿芜亲历的守夜记录。" }, "branch")}><GitBranch />从第二步建立临时走向</button> : null}
      {run.lifecycle === "completed" && active.kind === "temporary" && !run.handoff ? <button className="primary-action" type="button" disabled={props.busy || !run.canHandoff} onClick={() => props.onAct("handoff", {}, "candidate")}><Check />将选中结果送入审查</button> : null}
    </div>
  </section>;
}

function StageSurface(props: { run: NuwaBoundedProjection; selectedStepId: string | null; onSelectStep(stepId: string): void }) {
  const steps = props.run.activeBranch.steps;
  return <section className="nuwa-bounded-stage" aria-label="排演舞台">
    <header><div><small>{props.run.activeBranch.kind === "temporary" ? "临时走向" : "原始排演"}</small><h1>{authorBranchLabel(props.run.activeBranch.label)}</h1><p>按故事顺序阅读角色回应、行动与环境变化。越过角色知识边界的内容会被明确挡下。</p></div><span>{steps.length} 个步骤</span></header>
    <ol className="nuwa-bounded-step-list">{steps.map((step) => <li key={step.stepId}><button type="button" className={`${step.stepId === props.selectedStepId ? "is-selected " : ""}${step.status === "rejected" ? "is-rejected" : ""}`} aria-pressed={step.stepId === props.selectedStepId} onClick={() => props.onSelectStep(step.stepId)}>
      <span className="nuwa-step-sequence">{step.sequence}</span><div><header><strong>{step.directorBeat}</strong><em>{step.status === "rejected" ? "知识越界 · 已挡下" : step.proposedEvents.length ? "形成事件候选" : "排演进行中"}</em></header>
      <div className="nuwa-stage-responses">
        {step.dialogue.map((dialogue) => <article className="is-dialogue" key={`${step.stepId}-${dialogue.characterId}`}><MessageCircle /><div><small>{characterLabel(dialogue.characterId)} · 对话</small><blockquote>“{dialogue.text}”</blockquote></div></article>)}
        {step.actions.map((action) => <article className="is-action" key={`${step.stepId}-${action}`}><StepForward /><div><small>角色行动</small><p>{action}</p></div></article>)}
        {step.observations.map((observation) => <StageObservation key={`${step.stepId}-${observation}`} text={observation} rejected={step.status === "rejected"} />)}
        {step.proposedEvents.map((candidate) => <article className="is-candidate" key={candidate.candidateId}><Sparkles /><div><small>候选结果</small><p>{candidate.title}</p></div></article>)}
      </div>
      <footer>{step.sourceAnchors.length ? <span><BookOpen />{step.sourceAnchors.length} 个作者来源</span> : <span><AlertTriangle />没有可用来源</span>}{step.constraintChecks.some((check) => check.outcome === "warning") ? <span className="is-warning"><AlertTriangle />仍有信息不足</span> : null}{step.status === "rejected" ? <span className="is-warning"><ShieldCheck />当前故事与角色认知均未改变</span> : null}</footer></div>
    </button></li>)}{steps.length === 0 ? <li className="nuwa-bounded-empty-stage"><Sparkles /><strong>{props.run.lifecycle === "running" ? "正在等待第一步" : "排演范围已准备好"}</strong><p>{props.run.lifecycle === "running" ? "排演已经开始，但还没有产生任何角色回应或环境变化。选择“单步”查看第一步。" : "点击“开始排演”，再使用单步观察角色如何在自己的知识边界内行动。"}</p></li> : null}</ol>
  </section>;
}

function BranchSurface(props: { run: NuwaBoundedProjection; busy: boolean; onAct(action: FixtureAction, input?: Record<string, unknown>, surface?: Surface): void }) {
  return <section className="nuwa-bounded-branches"><header><div><small>临时走向</small><h1>原来的排演不会被覆盖</h1><p>从第二步之后尝试导演纠正；此前内容保持一致，作者可以随时返回原来的结果。</p></div></header><div className="nuwa-branch-lineage">{props.run.branches.map((branch) => <article key={branch.branchId} className={branch.branchId === props.run.activeBranchId ? "is-active" : ""}><span>{branch.kind === "original" ? "原始排演" : "纠正后的临时走向"}</span><strong>{authorBranchLabel(branch.label)}</strong><p>{branch.parentBranchId ? `从第 ${branch.forkPoint} 步之后开始改变` : "保留最初排演结果"}</p><dl><div><dt>状态</dt><dd>{lifecycleLabel(branch.status)}</dd></div><div><dt>步骤</dt><dd>{branch.steps.length}</dd></div></dl>{branch.steering.map((item) => <div className="nuwa-steering" key={item.steeringId}><Sparkles /><p><strong>导演纠正</strong>{item.instruction}</p><small>只影响第 {item.fromStep + 1} 步之后</small></div>)}{branch.branchId !== props.run.activeBranchId ? <button type="button" disabled={props.busy} onClick={() => props.onAct("select-branch", { branchId: branch.branchId }, "branch")}>查看这个走向</button> : <em>当前走向</em>}<details><summary>技术详情</summary><code>{branch.branchId}</code><p>{branch.parentBranchId || "root"}</p></details></article>)}</div></section>;
}

function CompareSurface(props: { run: NuwaBoundedProjection }) {
  const comparison = props.run.comparison;
  if (!comparison) return <Empty title="先建立临时走向" detail="完成原始排演后，从第二步建立临时走向并继续，才能比较两种故事结果。" />;
  const changedRows = comparison.rows.filter((row) => row.left !== row.right);
  const unchangedRows = comparison.rows.filter((row) => row.left === row.right);
  return <section className="nuwa-bounded-compare"><header><div><small>结果对照</small><h1>作者先看得懂两个结果怎么不同</h1><p>前 {comparison.sharedPrefixStep} 步完全相同。纠正后的走向没有泄露阿芜不知道的信息，并把旧名线索转成一次共同核对。</p></div><span>原始排演 ↔ 临时走向</span></header><div className="nuwa-ending-pair"><article><small>原始排演结果</small><p>{comparison.endings.left}</p></article><article><small>纠正后的结果</small><p>{comparison.endings.right}</p></article></div><section className="nuwa-compare-summary"><article><strong>发生改变</strong><ul>{changedRows.slice(0, 5).map((row) => <li key={row.category}><b>{comparisonCategory(row.category)}</b>{row.right}</li>)}</ul></article><article><strong>保持不变</strong><ul>{unchangedRows.map((row) => <li key={row.category}><b>{comparisonCategory(row.category)}</b>{row.right}</li>)}</ul></article></section><details className="nuwa-compare-table-wrap"><summary>查看完整技术对照</summary><table><thead><tr><th>语义类别</th><th>原始排演</th><th>临时走向</th><th>状态</th></tr></thead><tbody>{comparison.rows.map((row) => <tr key={row.category}><th>{comparisonCategory(row.category)}</th><td>{row.left}</td><td>{row.right}</td><td><span className={`is-${row.status}`}>{comparisonStatus(row.status)}</span></td></tr>)}</tbody></table></details></section>;
}

function OverlaySurface(props: { run: NuwaBoundedProjection; onOpenStep(stepId: string): void }) {
  const overlay = props.run.overlay;
  return <section className="nuwa-event-overlay"><header><div><small>事件候选</small><h1>当前故事与排演结果分开显示</h1><p>虚线位置只是排演提出的可能事件；在作者确认前，它不会进入事件线或改变当前故事。</p></div><Layers3 /></header><div className="nuwa-overlay-line"><span className="nuwa-overlay-track" />{overlay?.confirmedBaseline.map((event) => <article className="is-confirmed" key={event.eventId}><span>{event.narrativeOrder}</span><div><small>当前故事中的事件</small><strong>{event.title}</strong><p>{event.worldTime ? `时间：${event.worldTime}` : "作者尚未指定时间"}</p><details><summary>技术详情</summary><code>{event.eventId}</code></details></div></article>)}{overlay?.candidates.map((candidate) => <article className="is-candidate" key={`${candidate.sourceBranchId}-${candidate.candidateId}`}><span>{candidate.narrativeOrder}</span><div><small>{candidate.sourceBranchId.includes("temporary") ? "临时走向提出" : "原始排演提出"}</small><strong>{candidate.title}</strong><p>建议接在“沈砚持有潮纹铜钥匙”之后 · 作者尚未指定时间</p><em>{authorAdjacency(candidate.adjacency)}</em><button type="button" onClick={() => props.onOpenStep(candidate.sourceStepId)}>查看排演来源<ArrowRight /></button><details><summary>技术详情</summary><code>{candidate.candidateId}</code><code>{candidate.sourceStepId}</code></details></div></article>)}</div></section>;
}

function CandidateSurface(props: { data: NuwaBoundedFixture; busy: boolean; onBack(): void; onAct(action: FixtureAction, surface?: Surface): void }) {
  const handoff = props.data.run.handoff;
  if (!handoff) return <Empty title="尚未选择候选" detail="完成临时走向后，选择来源完整的结果并送入作者审查。" />;
  const sourceStep = props.data.run.branches.flatMap((branch) => branch.steps).find((step) => step.stepId === handoff.sourceStepId);
  const sourceLabels = sourceStep?.sourceAnchors.map(sourceAnchorLabel) || [];
  return <section className="nuwa-candidate-review"><header><div><small>作者审查 · 候选内容</small><h1>{props.data.review.impactPreview.title}</h1><p>这是排演提出的可能变化。它还没有进入当前故事。</p></div><span>{props.data.review.stage === "candidate-review" ? "等待作者判断" : "已准备审查"}</span></header><section className="nuwa-candidate-change"><h2>这个候选会让故事发生什么</h2><p>沈砚与阿芜在进入灯塔前，先核对阿芜亲历过的旧名守夜记录；寄信人身份与精确时间继续保持未知。</p></section><section><h2>与当前故事的差异</h2><ul>{handoff.baselineDiff.map((item) => <li key={item}>{authorReviewText(item)}</li>)}</ul></section><section className="nuwa-review-source"><h2>使用的作者来源</h2>{sourceLabels.map((label) => <p key={label}><BookOpen />{label}</p>)}</section><section><h2>仍未确定</h2><ul>{handoff.unresolvedConflicts.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h2>会影响的内容</h2><p>事件线：在铜钥匙交接之后增加一次旧名记录核对。</p><p>角色：{handoff.affectedCharacters.map(characterLabel).join("、")}。</p><p>不会改变：寄信人身份、灯塔历史、现有关系事实。</p></section><details><summary>技术详情</summary><code>{handoff.sourceRunId}</code><code>{handoff.sourceBranchId}</code><code>{handoff.sourceStepId}</code></details><footer><button type="button" className="secondary-action" disabled={props.busy} onClick={props.onBack}><RotateCcw />返回排演修改</button><button type="button" className="secondary-action" disabled={props.busy || props.data.review.stage === "rejected"} onClick={() => props.onAct("reject", "candidate")}><X />放弃这个候选</button>{props.data.review.stage === "handoff-prepared" ? <button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onAct("prepare-review", "candidate")}>开始作者审查<ArrowRight /></button> : <button type="button" className="primary-action" disabled={props.busy || props.data.review.stage === "rejected"} onClick={() => props.onAct("prepare-impact", "impact")}>进入影响审查<ArrowRight /></button>}</footer></section>;
}

function ImpactSurface(props: { data: NuwaBoundedFixture; busy: boolean; onAct(action: FixtureAction): void; onOpenEventLine(eventId?: string | null): void }) {
  const preview = props.data.review.impactPreview;
  const integrated = props.data.review.stage === "integrated";
  return <section className="nuwa-impact-review"><header><div><small>作者审查 · 影响范围</small><h1>{preview.title}</h1><p>{integrated ? "作者已确认这一条事件。原始排演与临时走向仍可回看。" : "请先区分当前事实、可能变化和仍然未知，再决定是否加入事件线。"}</p></div><span className={integrated ? "is-integrated" : "is-awaiting"}>{integrated ? "已加入事件线" : "等待作者确认"}</span></header><div className="nuwa-impact-grid"><ImpactColumn title="当前事实" items={[...preview.characterStateBefore, ...preview.characterFateBefore]} /><ImpactColumn title="确认后可能变化" items={[...preview.characterStateAfter, ...preview.characterFateAfter]} /><ImpactColumn title="保持不变" items={["寄信人身份不会被确认", "灯塔历史与世界状态不变", "现有关系事实不变"]} /><ImpactColumn title="未知与冲突" items={preview.unresolvedConflicts} /></div><section className="nuwa-impact-details"><div><strong>受影响内容</strong><p>事件线增加一条“先核对旧名守夜记录”；沈砚与阿芜的当前故事位置不变。</p></div><div><strong>恢复点</strong><p>可回到确认前的事件线；原始排演与纠正后的走向都保留。</p></div><div><strong>正式变化数量</strong><p>{integrated ? "已写入事件线 1 条；其他正式变化 0。" : "确认后写入事件线 1 条；其他正式变化 0。"}</p></div></section><details><summary>技术详情</summary><p>{preview.rollback}</p><ol>{preview.ownerWritePlan.map((item) => <li key={item}>{item}</li>)}</ol></details><footer>{integrated ? <><div className="nuwa-confirmation-receipt"><Check /><span><strong>事件已由作者确认</strong><small>旧名守夜记录核对 · 作者尚未指定时间</small></span></div><button type="button" className="primary-action" onClick={() => props.onOpenEventLine(props.data.review.appliedEventId)}>查看事件线<ArrowRight /></button></> : <><button type="button" className="secondary-action" disabled={props.busy} onClick={() => props.onAct("reject")}><X />放弃这个候选</button><button type="button" className="primary-action" disabled={props.busy || props.data.review.stage !== "impact-review"} onClick={() => props.onAct("confirm")}><Check />确认并加入事件线</button></>}</footer></section>;
}

function ReplaySurface(props: { run: NuwaBoundedProjection }) {
  const stepCount = props.run.branches.reduce((count, branch) => count + branch.steps.length, 0);
  return <section className="nuwa-replay-surface"><header><RotateCcw /><div><small>回放记录</small><h1>排演内容已按原顺序找回</h1><p>回放只读取已保存的排演记录，不会产生新动作，也不会改变当前故事。</p></div></header><div className={props.run.replay.matches ? "nuwa-replay-ok" : "nuwa-replay-failed"}><Check /><div><strong>{props.run.replay.matches ? "回放完整，内容与确认前一致" : "回放校验未通过"}</strong><p>{props.run.branches.length} 个走向 · 共 {stepCount} 个已保存步骤</p></div></div><dl><div><dt>原始排演</dt><dd>{props.run.branches[0]?.steps.length || 0} 步</dd></div><div><dt>临时走向</dt><dd>{props.run.branches.find((branch) => branch.kind === "temporary")?.steps.length || 0} 步</dd></div><div><dt>当前状态</dt><dd>{lifecycleLabel(props.run.lifecycle)} · 可继续查看</dd></div></dl><details><summary>技术详情</summary><code>{props.run.replay.stepsIntegrity}</code><code>{props.run.replay.receiptIntegrity}</code><p>{props.run.receipts.length} receipts · provider calls {props.run.replay.providerCalls}</p></details></section>;
}

function StepDetail(props: { step: NuwaBoundedProjection["selectedStep"] }) {
  const step = props.step;
  if (!step) return <section className="nuwa-step-detail-empty"><Sparkles /><strong>选择一个步骤</strong><p>这里解释它为何出现、使用了哪些来源、角色知道什么，以及变化是否仍是候选。</p></section>;
  return <><section className="nuwa-step-detail-head"><small>选中步骤 · {step.sequence}</small><h2>{step.directorBeat}</h2><span className={step.status === "rejected" ? "is-rejected" : "is-accepted"}>{step.status === "rejected" ? "知识越界，已挡下" : "排演内容已保留"}</span></section><section><small>为什么出现</small><p>{step.constraintChecks.map((check) => authorConstraintText(check.explanation)).join("；")}</p></section><section><small>角色当时知道</small>{Object.entries(step.knowledgeBefore).map(([characterId, claims]) => <p key={characterId}><strong>{characterLabel(characterId)}</strong> {claims.map(claimLabel).join("、") || "无明确知识"}</p>)}</section><section><small>这一步之后</small>{Object.entries(step.knowledgeAfter).map(([characterId, claims]) => <p key={characterId}><strong>{characterLabel(characterId)}</strong> {claims.map(claimLabel).join("、") || "没有获得新信息"}</p>)}</section><section><small>边界检查</small>{step.constraintChecks.map((check) => <span className={`is-${check.outcome}`} key={check.checkId}>{check.outcome === "pass" ? <Check /> : <AlertTriangle />}{check.label} · {check.outcome === "pass" ? "符合作者约束" : check.outcome === "warning" ? "仍需作者判断" : "已挡下"}</span>)}</section><section><small>使用的作者来源</small>{step.sourceAnchors.map((source) => <p key={source}><BookOpen />{sourceAnchorLabel(source)}</p>)}</section>{step.proposedEvents.length ? <section className="nuwa-step-candidates"><small>只是候选</small>{step.proposedEvents.map((candidate) => <p key={candidate.candidateId}><strong>{candidate.title}</strong>尚未进入当前故事</p>)}</section> : null}<details><summary>技术详情</summary><code>{step.stepId}</code><code>{step.receipt.receiptId}</code><code>{step.receipt.integrity}</code></details></>;
}

function StageObservation(props: { text: string; rejected: boolean }) {
  if (props.rejected) return <article className="is-rule-block"><ShieldCheck /><div><small>规则阻断</small><p>{props.text}</p></div></article>;
  if (props.text.includes("铜钥匙")) return <article className="is-object"><BookOpen /><div><small>物品响应 · 铜钥匙</small><p>{props.text}</p></div></article>;
  if (props.text.includes("灯塔入口")) return <article className="is-location"><Layers3 /><div><small>地点响应 · 灯塔入口</small><p>{props.text}</p></div></article>;
  if (props.text.includes("海雾")) return <article className="is-environment"><Layers3 /><div><small>环境变化</small><p>{props.text}</p></div></article>;
  if (props.text.includes("未知") || props.text.includes("没有日期")) return <article className="is-unknown"><AlertTriangle /><div><small>仍然未知</small><p>{props.text}</p></div></article>;
  return <article className="is-observation"><Sparkles /><div><small>现场观察</small><p>{props.text}</p></div></article>;
}

function ScopeItem(props: { label: string; value: string; tone?: "baseline" }) { return <section className={props.tone ? `is-${props.tone}` : ""}><small>{props.label}</small><strong>{props.value}</strong></section>; }
function ImpactColumn(props: { title: string; items: string[] }) { return <section><small>{props.title}</small>{props.items.map((item) => <p key={item}>{item}</p>)}</section>; }
function Empty(props: { title: string; detail: string }) { return <section className="nuwa-bounded-empty"><Sparkles /><strong>{props.title}</strong><p>{props.detail}</p></section>; }

function routeSurface(view: string | null): Surface {
  if (view === "branch" || view === "correction") return "branch";
  if (view === "compare") return "compare";
  if (view === "overlay") return "overlay";
  if (view === "candidate") return "candidate";
  if (view === "impact" || view === "confirmed") return "impact";
  if (view === "replay") return "replay";
  return "stage";
}

function routeSelectedStep(view: string | null, run: NuwaBoundedProjection): string | null {
  if (view === "knowledge-rejection") return run.branches.flatMap((branch) => branch.steps).find((step) => step.status === "rejected")?.stepId || null;
  if (view === "step-detail") return run.activeBranch.steps.find((step) => step.status === "accepted")?.stepId || null;
  if (view === "correction") return run.branches.find((branch) => branch.kind === "temporary")?.steps.find((step) => step.createdBy === "author-steering")?.stepId || null;
  return null;
}

function lifecycleLabel(status: NuwaBoundedProjection["lifecycle"]): string { return ({ draft: "草稿", ready: "已就绪", running: "运行中", paused: "已暂停", completed: "已完成", cancelled: "已取消", failed: "失败", superseded: "已被后续结果取代" } as const)[status]; }
function characterLabel(id: string): string { return id.endsWith("shen-yan") ? "沈砚" : id.endsWith("a-wu") ? "阿芜" : id; }
function claimLabel(id: string): string { return ({ "claim.letter-warning": "来信警告", "claim.copper-key": "铜钥匙在手", "claim.lighthouse-plan": "灯塔计划", "claim.old-name-fragment": "旧名记录残片", "claim.old-name-shape": "旧名残笔形状", "claim.old-name-ledger": "旧名曾见于守夜记录" } as Record<string, string>)[id] || id; }
function comparisonCategory(category: string): string { return ({ event: "事件", "character-action": "角色行动", knowledge: "角色知识", belief: "角色信念", "world-state": "世界状态", relation: "关系", object: "对象", "open-question": "开放问题", source: "来源", "rule-conflict": "规则冲突" } as Record<string, string>)[category] || category; }
function comparisonStatus(status: string): string { return ({ "confirmed-baseline": "已确认基线", "nuwa-rehearsal": "女娲排演", "temporary-branch": "临时分支", "pending-review": "待审候选", rejected: "已拒绝" } as Record<string, string>)[status] || status; }
function authorBranchLabel(label: string): string { return label.replaceAll("临时分支", "临时走向"); }
function sourceAnchorLabel(source: string): string { return ({ "source.anchor.tide-letter": "匿名来信原文", "source.anchor.key-transfer": "潮纹铜钥匙交接记录", "source.anchor.watch-ledger-fragment": "阿芜见过的守夜记录残页", "source.anchor.a-wu-observation": "阿芜的亲历观察" } as Record<string, string>)[source] || "已授权的故事来源"; }
function authorReviewText(text: string): string { return text.replaceAll("Candidate", "候选").replaceAll("Run", "排演").replaceAll("原始排演步骤", "原来的排演内容"); }
function authorAdjacency(text: string): string { return text.replaceAll("Impact Review", "影响审查"); }
function authorConstraintText(text: string): string {
  return text
    .replaceAll("状态 delta 为 0", "当前故事与角色认知均未改变")
    .replaceAll("只产生 Candidate ID；Event owner 写入为 0", "只形成事件候选，当前故事尚未改变")
    .replaceAll("Run", "排演")
    .replaceAll("Candidate", "候选");
}
function authorBlocker(text: string): string {
  if (text.includes("missing-reference") || text.includes("引用来源缺失")) return "排演使用的作者来源已经缺失，请重新选择来源后再送审。";
  if (text.includes("stale") || text.includes("revision")) return "当前故事在排演之后发生了变化，请先刷新排演范围。";
  return "排演来源未通过一致性检查，请刷新后再试。";
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
