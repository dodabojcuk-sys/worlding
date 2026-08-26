import { AlertTriangle, ArrowLeft, BrainCircuit, Check, ChevronRight, FileClock, Scale, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import type { AuthorChangeSet, ImpactReview, NuwaResultReceipt, ReviewHistory, StoryExploration, TianyiNuwaExecutionBrief, WritingDocument } from "../lib/localTransport";
import { TianyiBriefSourceSummary } from "./tianyi/TianyiBriefSourceSummary";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";

export type IntelligenceDocument = "impact-review" | "supervisor" | "review-history";

export function IntelligenceWorkbench(props: {
  projectTitle: string;
  currentScene: WritingDocument | null;
  review: ImpactReview | null;
  changeSet: AuthorChangeSet | null;
  exploration: StoryExploration | null;
  executionBrief: TianyiNuwaExecutionBrief | null;
  resultReceipt: NuwaResultReceipt | null;
  history: ReviewHistory | null;
  document: IntelligenceDocument;
  busy: boolean;
  error: string;
  onDocument(document: IntelligenceDocument): void;
  onOpenLibrary(): void;
  onCreateReview(goal: string): void;
  onChoose(optionId: string, action: "adopt" | "adjust" | "preserve", authorContent?: string): void;
  onCreateChangeSet(): void;
  onDryRunChangeSet(): void;
  onApplyChangeSet(): void;
  onAbandonChangeSet(): void;
  onCreateExploration(goal: string): void;
  onRunExploration(): void;
  onSynthesizeExploration(): void;
  onSubmitExplorationRoute(routeId: string): void;
  onCancelExploration(): void;
  onReturnWriting(): void;
  onReturnDestination(receipt: NuwaResultReceipt): void;
  onReopenReview(reviewId: string, changeSetId: string | null): void;
}) {
  const [goal, setGoal] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [authorContent, setAuthorContent] = useState("");

  useEffect(() => {
    setGoal(props.review?.source.authorGoal || sceneGoal(props.currentScene));
    setSelectedOptionId(props.review?.options.find((option) => option.selected)?.id || props.review?.options[1]?.id || props.review?.options[0]?.id || "");
    setAdjusting(false);
    setAuthorContent("");
  }, [props.review?.id, props.currentScene?.id]);

  return <section className="workbench intelligence-workbench" data-testid="intelligence-workbench">
    <WorkspaceHeader projectTitle={props.projectTitle} sectionLabel="女娲" title="影响评审" context={props.review?.source.sceneTitle || props.currentScene?.title || "当前世界变化"} status={<span className={props.changeSet?.status === "applied" ? "is-confirmed" : "is-decision"}>{props.changeSet?.status === "applied" ? "已确认" : props.review?.status === "stale" ? "历史只读" : "等待作者决定"}</span>} prototype="workbench" icon={<BrainCircuit />} className="intelligence-workbench-bar" onOpenNavigation={props.onOpenLibrary} actions={<button type="button" className="intelligence-return" onClick={props.onReturnWriting}><ArrowLeft />返回女娲</button>} />
    <nav className="intelligence-document-nav" aria-label="推演文档">
      <button type="button" className={props.document === "impact-review" ? "is-active" : ""} onClick={() => props.onDocument("impact-review")}><Scale />影响评审</button>
      <button type="button" className={props.document === "review-history" ? "is-active" : ""} onClick={() => props.onDocument("review-history")}><FileClock />评审记录</button>
    </nav>

    {props.document === "supervisor" ? <SupervisorSurface
        scene={props.currentScene}
        exploration={props.exploration}
        executionBrief={props.executionBrief}
        resultReceipt={props.resultReceipt}
        busy={props.busy}
        error={props.error}
        onCreate={props.onCreateExploration}
        onRun={props.onRunExploration}
        onSynthesize={props.onSynthesizeExploration}
        onSubmitRoute={props.onSubmitExplorationRoute}
        onCancel={props.onCancelExploration}
        onImpactReview={() => props.onDocument("impact-review")}
        onReturnDestination={props.onReturnDestination}
      />
      : props.document === "review-history" ? <ReviewHistorySurface history={props.history} onReopen={props.onReopenReview} />
      : !props.review ? <ReviewComposer scene={props.currentScene} goal={goal} busy={props.busy} error={props.error} onGoal={setGoal} onCreate={() => props.onCreateReview(goal)} />
      : <ImpactReviewSurface
        review={props.review}
        changeSet={props.changeSet}
        selectedOptionId={selectedOptionId}
        adjusting={adjusting}
        authorContent={authorContent}
        busy={props.busy}
        error={props.error}
        onSelectedOption={setSelectedOptionId}
        onAdjusting={setAdjusting}
        onAuthorContent={setAuthorContent}
        onChoose={props.onChoose}
        onCreateChangeSet={props.onCreateChangeSet}
        onDryRunChangeSet={props.onDryRunChangeSet}
        onApplyChangeSet={props.onApplyChangeSet}
        onAbandonChangeSet={props.onAbandonChangeSet}
        onNewReview={() => { setGoal(props.review!.source.authorGoal); props.onCreateReview(props.review!.source.authorGoal); }}
      />}
  </section>;
}

function SupervisorSurface(props: {
  scene: WritingDocument | null;
  exploration: StoryExploration | null;
  executionBrief: TianyiNuwaExecutionBrief | null;
  resultReceipt: NuwaResultReceipt | null;
  busy: boolean;
  error: string;
  onCreate(goal: string): void;
  onRun(): void;
  onSynthesize(): void;
  onSubmitRoute(routeId: string): void;
  onCancel(): void;
  onImpactReview(): void;
  onReturnDestination(receipt: NuwaResultReceipt): void;
}) {
  const [goal, setGoal] = useState("");
  const [routeId, setRouteId] = useState("");

  useEffect(() => {
    setGoal(props.exploration?.source.authorGoal || sceneGoal(props.scene));
    setRouteId(props.exploration?.routes.find((route) => route.selected)?.id || "");
  }, [props.exploration?.id, props.exploration?.status, props.scene?.id]);

  const inspectableHistoricalResult = Boolean(props.executionBrief && props.resultReceipt && props.exploration?.status === "stale");
  if (!props.exploration || (["cancelled", "stale"].includes(props.exploration.status) && !inspectableHistoricalResult)) {
    return <main className="supervisor-composer"><section>
      <div className="supervisor-mark"><Sparkles /><span><strong>女娲</strong><small>故事推演监督者</small></span></div>
      <p className="eyebrow">{props.exploration?.status === "stale" ? "需要重新规划" : "当前场景"}</p>
      <h1>{props.scene?.title || "先选择一个场景"}</h1>
      <p>女娲会分解目标、召集受限专业检查、核验证据，再把候选未来交还给作者。</p>
      <label><span>你想比较什么故事变化？</span><textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：比较部分透露地下室线索后的不同长期走向。" /></label>
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      <button type="button" className="primary-action" disabled={!props.scene || !goal.trim() || props.busy} onClick={() => props.onCreate(goal)}>{props.busy ? "正在规划" : "让女娲规划"}</button>
    </section></main>;
  }

  const exploration = props.exploration;
  return <main className="supervisor-workspace" data-exploration-status={exploration.status}>
    {props.executionBrief && <BridgeContractPanel brief={props.executionBrief} receipt={props.resultReceipt} onReturnDestination={props.onReturnDestination} />}
    <header className="supervisor-heading">
      <div className="supervisor-mark"><Sparkles /><span><strong>{exploration.supervisor.label}</strong><small>{exploration.supervisor.role}</small></span></div>
      <div><p className="eyebrow">作者目标</p><h1>{props.executionBrief?.authorGoal ?? exploration.source.authorGoal}</h1><small>{exploration.source.sceneTitle} · 作者决定始终保留</small></div>
      <div className="supervisor-progress"><strong>{exploration.progress.completed}/{exploration.progress.total}</strong><span>{exploration.progress.coverage}覆盖</span></div>
    </header>
    <section className="specialist-lane">
      <header><strong>专业检查</strong><span>所有结果先返回女娲，不直接改变故事</span></header>
      <div>{exploration.specialists.map((specialist) => <article className={specialist.status === "已核验" ? "is-complete" : ""} key={specialist.label}><span>{specialist.requirement === "required" ? "必要" : "补充"}</span><strong>{specialist.label}</strong><p>{specialist.purpose}</p><small>{specialist.status}</small></article>)}</div>
    </section>
    {exploration.routes.length > 0 && <section className="candidate-route-grid">
      <header><strong>Candidate Review · 候选未来</strong><span>AI 只提出候选；作者明确选择后才进入影响评审</span></header>
      <div>{exploration.routes.map((route) => <button type="button" className={route.id === routeId ? "is-selected" : ""} onClick={() => setRouteId(route.id)} key={route.id}><span>{route.id.replace("route-", "路线 ")}</span><strong>{route.title}</strong><p>{route.summary}</p><dl><dt>眼前</dt><dd>{route.immediateConsequence}</dd><dt>长期</dt><dd>{route.longTermPressure}</dd></dl>{route.risks.length > 0 && <em>{route.risks.length} 项风险</em>}{route.id === routeId && <Check />}</button>)}</div>
    </section>}
    <aside className="supervisor-capability"><ShieldCheck /><span><strong>{exploration.capability.label}</strong><small>{exploration.capability.detail}</small></span></aside>
    {props.error && <p className="form-error supervisor-error" role="alert">{props.error}</p>}
    <footer className="supervisor-actions">
      {exploration.canRun && <button type="button" className="primary-action" disabled={props.busy} onClick={props.onRun}>{props.busy ? "专业检查中" : "开始推演"}</button>}
      {exploration.canSynthesize && <button type="button" className="primary-action" disabled={props.busy} onClick={props.onSynthesize}>{props.busy ? "正在整理" : "整理候选路线"}</button>}
      {exploration.canSubmitRoute && <button type="button" className="primary-action" disabled={!routeId || props.busy || Boolean(props.resultReceipt && !props.resultReceipt.impactReviewEligible)} onClick={() => props.onSubmitRoute(routeId)}>{props.busy ? "正在提交" : props.resultReceipt && !props.resultReceipt.impactReviewEligible ? "结果回执不可进入影响评审" : "确认候选并进入影响评审"}</button>}
      {exploration.status === "submitted-to-impact" && <button type="button" className="primary-action" onClick={props.onImpactReview}>查看影响评审</button>}
      {!exploration.routes.length && exploration.status !== "submitted-to-impact" && <button type="button" className="secondary-action" onClick={props.onCancel} disabled={props.busy}>取消本次推演</button>}
    </footer>
  </main>;
}

function BridgeContractPanel(props: { brief: TianyiNuwaExecutionBrief; receipt: NuwaResultReceipt | null; onReturnDestination(receipt: NuwaResultReceipt): void }) {
  return <section className="nuwa-bridge-contract" data-execution-brief-revision={props.brief.revision} data-result-state={props.receipt?.staleState ?? "pending"}>
    <div><p className="eyebrow">执行简报 · 版本 {props.brief.revision}</p><strong>{props.brief.authorGoal}</strong><small>{props.brief.authorApprovalState === "approved" ? "作者已批准" : "等待作者批准"} · {Math.max(0, props.brief.allowedAgents.length - 1)} 项专业检查 · {props.brief.allowedSkills.length} 项本地能力</small></div>
    <TianyiBriefSourceSummary brief={props.brief} />
    {props.receipt ? <div className={`nuwa-result-receipt is-${props.receipt.staleState}`}><span>结果回执</span><strong>{props.receipt.candidateRouteIds.length} 条候选路线 · {resultStateLabel(props.receipt.staleState)}</strong><small>{props.receipt.impactReviewEligible ? "可由作者显式进入影响评审" : "已失效或部分完成的结果不可进入影响评审"}</small><p>实际来源：当前写作上下文 {props.receipt.sourceRefs.some((ref) => ref.startsWith("story.")) ? 1 : 0} · 额外来源 {props.receipt.sourceRefs.filter((ref) => !ref.startsWith("story.")).length}</p><details><summary>查看来源详情</summary><p>{props.receipt.sourceRefs.length ? props.receipt.sourceRefs.join(" · ") : "没有已验证来源"}</p></details><button type="button" onClick={() => props.onReturnDestination(props.receipt!)}>返回原创作位置</button></div> : <div><span>结果回执</span><strong>等待女娲返回</strong><small>不会自动选择路线或建立变更单</small></div>}
  </section>;
}

function resultStateLabel(state: NuwaResultReceipt["staleState"]): string {
  return ({ current: "当前结果", stale: "已失效", partial: "部分完成" })[state];
}

function ReviewComposer(props: { scene: WritingDocument | null; goal: string; busy: boolean; error: string; onGoal(value: string): void; onCreate(): void }) {
  return <main className="impact-composer">
    <section>
      <p className="eyebrow">当前场景</p>
      <h1>{props.scene?.title || "先在写作中选择一个场景"}</h1>
      <p>描述你想改变的故事走向。系统只分析后果，不会修改正文或世界事实。</p>
      <label><span>这一次想让故事发生什么变化？</span><textarea value={props.goal} onChange={(event) => props.onGoal(event.target.value)} placeholder="例如：林远告诉阿岚地下室存在，但只透露部分线索。" /></label>
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      <button type="button" className="primary-action" disabled={!props.scene || !props.goal.trim() || props.busy} onClick={props.onCreate}><BrainCircuit />{props.busy ? "正在分析" : "分析这个变化"}</button>
    </section>
  </main>;
}

function ImpactReviewSurface(props: {
  review: ImpactReview;
  changeSet: AuthorChangeSet | null;
  selectedOptionId: string;
  adjusting: boolean;
  authorContent: string;
  busy: boolean;
  error: string;
  onSelectedOption(value: string): void;
  onAdjusting(value: boolean): void;
  onAuthorContent(value: string): void;
  onChoose(optionId: string, action: "adopt" | "adjust" | "preserve", authorContent?: string): void;
  onCreateChangeSet(): void;
  onDryRunChangeSet(): void;
  onApplyChangeSet(): void;
  onAbandonChangeSet(): void;
  onNewReview(): void;
}) {
  const selected = props.review.options.find((option) => option.id === props.selectedOptionId) || props.review.options[0];
  const locked = props.review.status === "stale";
  const completed = props.changeSet?.status === "applied";
  const readOnly = locked || completed;
  return <main className="impact-review-layout" data-review-status={props.review.status}>
    <header className="impact-review-summary">
      <div><p className="eyebrow">影响评审 · 作者最终决定前</p><h1>{selected?.summary || props.review.source.authorGoal}</h1><p>{props.review.source.sceneTitle} · {props.review.source.originLabel}</p></div>
      <span className={completed ? "is-confirmed" : ""}>{completed ? "已确认并写入世界事件" : locked ? "历史只读" : "尚未写入故事事实"}</span>
    </header>
    {locked && <div className="impact-stale-banner" role="status"><AlertTriangle /><span><strong>这是一份历史只读评审</strong><small>故事资料已经改变；保留当时依据，但不会允许旧结果写入当前世界。</small></span><button type="button" onClick={props.onNewReview}>基于当前世界重新分析</button></div>}

    <section className="impact-review-body">
    <section className="impact-preview-column">
      <section className="impact-source-summary"><div><span>作者目标</span><strong>{authorGoalLabel(props.review.source.authorGoal)}</strong></div><div className="impact-object-list">{props.review.source.involvedObjects.map((object) => <span key={object.id}>{object.title}</span>)}</div></section>
      <header><span><p className="eyebrow">世界变化预览</p><h2>{selected?.label || "选择一条走向"}</h2></span><small>{props.review.impact.evidenceCoverage}</small></header>
      <div className="impact-before-after">
        <PreviewStage label="变化前" title="现在的世界" items={props.review.preview?.before || currentStateFallback(props.review)} />
        <ChevronRight className="impact-stage-arrow" />
        <PreviewStage label="拟议变化" title="拟议变化" items={props.review.preview?.change || [selected?.summary || "先选择一条候选走向"]} accent />
        <ChevronRight className="impact-stage-arrow" />
        <PreviewStage label="变化后" title={props.changeSet?.status === "applied" ? "事件记录后的预计影响" : "如果采用"} items={props.changeSet?.status === "applied" ? props.changeSet.application.projectedEffects : props.review.preview?.after || [selected?.consequence || "采用前不会改变世界"]} />
      </div>
      <div className="impact-detail-grid">
        <ImpactList title="风险" items={props.review.impact.risks} tone="risk" />
        <ImpactList title="机会" items={props.review.impact.opportunities} tone="opportunity" />
        <ImpactList title="长期压力" items={props.review.preview?.longTermPressure || []} />
        <ImpactList title="未知与假设" items={props.review.preview?.assumptions || []} />
      </div>
      <details className="impact-source-details"><summary>查看证据、保留谜题与来源详情</summary>
        <section><strong>保留的谜题</strong>{props.review.preview?.preservedMysteries.length ? props.review.preview.preservedMysteries.map((item) => <p key={item}>{item}</p>) : <p>没有额外谜题。</p>}</section>
        <section><strong>不可越过的规则</strong>{props.review.source.lockedRules.map((rule) => <p className="impact-locked-rule" key={rule}><ShieldCheck />{rule}</p>)}</section>
        <section><strong>证据来源</strong>{props.review.evidence.slice(0, 8).map((item, index) => <article key={`${item.title}-${index}`}><strong>{item.title}</strong><p>{item.explanation}</p><small>{item.sources.join("、")}</small></article>)}</section>
        <section className="impact-technical-details"><strong>技术标识</strong><code>{props.review.id}</code><code>{props.review.source.id}</code>{props.review.source.involvedObjects.map((object) => <code key={object.id}>{object.id}</code>)}</section>
      </details>
    </section>

    <aside className="impact-choice-column">
      <ReviewLifecycleRail review={props.review} changeSet={props.changeSet} />
      {readOnly ? <section className="impact-read-only-choice"><p className="eyebrow">只读摘要</p><h2>{props.review.authorChoice?.label || selected?.label || "保留当时决定"}</h2><p>{selected?.summary || "这份历史评审不会再接受修改。"}</p><span>{completed ? "世界事件已记录，不能从历史评审重复写入。" : "故事资料已经变化，需要基于当前世界重新评审。"}</span></section> : <><p className="eyebrow">作者选择</p><h2>你希望世界往哪里走？</h2><div className="impact-options">{props.review.options.map((option) => <button type="button" className={props.selectedOptionId === option.id ? "is-selected" : ""} onClick={() => props.onSelectedOption(option.id)} key={option.id}><span><strong>{option.label}</strong><small>{option.summary}</small></span><em data-risk={option.riskLevel}>{riskLabel(option.riskLevel)}</em>{props.selectedOptionId === option.id && <Check />}</button>)}</div></>}
      {!readOnly && props.adjusting && <label className="impact-adjustment"><span>你想怎样调整这条路径？</span><textarea value={props.authorContent} onChange={(event) => props.onAuthorContent(event.target.value)} /></label>}
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      {!readOnly && props.review.authorChoice && <div className="impact-choice-result"><Check /><span><strong>作者已选择路线：{props.review.authorChoice.label}</strong><small>这一步仍不是故事事实；只有确认应用受保护变化才会写入。</small></span></div>}
      {props.changeSet && <ChangeSetPanel changeSet={props.changeSet} />}
      <div className="impact-choice-actions">
        {!readOnly && !props.review.authorChoice && <button type="button" className="primary-action" disabled={!selected || props.busy || (props.adjusting && !props.authorContent.trim())} onClick={() => props.onChoose(selected.id, props.adjusting ? "adjust" : "adopt", props.authorContent)}>{props.busy ? "正在记录" : props.adjusting ? "采用调整后的路径" : "采用此走向"}</button>}
        {props.review.canCreateChangeSet && !props.changeSet && <button type="button" className="primary-action" disabled={props.busy || locked} onClick={props.onCreateChangeSet}>{props.busy ? "正在建立" : "建立受保护的变更单"}</button>}
        {props.changeSet?.status === "pending" && <button type="button" className="primary-action" disabled={props.busy} onClick={props.onApplyChangeSet}>{props.busy ? "正在应用" : "确认写入世界事件"}</button>}
        {!readOnly && !props.review.authorChoice && <button type="button" onClick={() => props.onAdjusting(!props.adjusting)}>调整路径</button>}
        {!readOnly && !props.review.authorChoice && <button type="button" onClick={() => selected && props.onChoose(selected.id, "preserve")} disabled={props.busy}>保持当前世界</button>}
        {props.changeSet?.status === "pending" && <button type="button" onClick={props.onDryRunChangeSet} disabled={props.busy}>重新检查文件版本</button>}
        {props.changeSet && !["applied", "abandoned"].includes(props.changeSet.status) && <button type="button" onClick={props.onAbandonChangeSet} disabled={props.busy}>放弃这次变化</button>}
      </div>
    </aside>
    </section>
  </main>;
}

function ReviewLifecycleRail(props: { review: ImpactReview; changeSet: AuthorChangeSet | null }) {
  const steps = [
    { label: "候选已送审", complete: true },
    { label: "作者已选路线", complete: Boolean(props.review.authorChoice) },
    { label: "确认内容已建立", complete: Boolean(props.changeSet) },
    { label: "故事事实已确认", complete: props.changeSet?.status === "applied" }
  ];
  return <ol className="impact-lifecycle-rail" aria-label="候选确认进度">{steps.map((step, index) => <li className={step.complete ? "is-complete" : ""} key={step.label}><span>{step.complete ? <Check /> : index + 1}</span><strong>{step.label}</strong></li>)}</ol>;
}

function ChangeSetPanel(props: { changeSet: AuthorChangeSet }) {
  const labels = { pending: "等待作者执行", applying: "正在写入", applied: "已写入世界事件", abandoned: "已放弃", stale: "已过期" };
  return <section className={`change-set-panel is-${props.changeSet.status}`} data-testid="author-change-set">
    <header><span><strong>受保护的确认内容</strong><small>{labels[props.changeSet.status]}</small></span><em>{props.changeSet.changes.length} 项变化</em></header>
    {props.changeSet.changes.slice(0, 3).map((change) => <p key={change.id}>{authorFacingImpactText(change.summary)}<small>{change.evidenceCount} 条证据</small></p>)}
    <footer>{props.changeSet.application.reason}</footer>
    {props.changeSet.status === "applied" && <div className="change-set-applied"><Check /><span><strong>世界事件已记录</strong><small>时间线已同步 · 场景正文未修改 · 既有对象卡未修改</small>{props.changeSet.application.appliedEventId && <details><summary>查看技术事件标识</summary><code>{props.changeSet.application.appliedEventId}</code></details>}</span></div>}
  </section>;
}

function ReviewHistorySurface(props: { history: ReviewHistory | null; onReopen(reviewId: string, changeSetId: string | null): void }) {
  return <main className="review-history-surface" data-testid="review-history">
    <header><p className="eyebrow">评审记录</p><h1>作者做过的世界选择</h1><span>读取本地评审与变更工件，不重放分析。</span></header>
    {!props.history?.entries.length ? <article className="review-history-empty"><FileClock /><strong>还没有评审记录</strong><p>从当前场景发起一次影响评审后，这里会保留作者选择。</p></article>
      : <section className="review-history-list">{props.history.entries.map((entry, index) => <article className={entry.stale ? "is-stale" : ""} key={`${entry.sourceScene}-${index}`}>
        <header><span>{entry.sourceKind}</span><strong>{entry.sourceScene}</strong>{entry.stale && <em>故事资料已变化</em>}</header>
        <p>{authorGoalLabel(entry.authorGoal)}</p>
        <dl><dt>作者选择</dt><dd>{entry.authorChoice}</dd><dt>证据覆盖</dt><dd>{entry.evidenceCoverage}</dd><dt>变更状态</dt><dd>{entry.changeStatus}</dd><dt>世界记录</dt><dd>{entry.eventStatus}</dd></dl>
        <footer><button type="button" className="secondary-action" onClick={() => props.onReopen(entry.reviewId, entry.changeSetId)}>重新打开评审</button></footer>
      </article>)}</section>}
  </main>;
}

function PreviewStage(props: { label: string; title: string; items: string[]; accent?: boolean }) {
  return <article className={`impact-preview-stage ${props.accent ? "is-accent" : ""}`}><span>{props.label}</span><strong>{props.title}</strong>{props.items.length ? props.items.slice(0, 4).map((item) => <p key={item}>{authorFacingImpactText(item)}</p>) : <p>暂无明确变化</p>}</article>;
}

function ImpactList(props: { title: string; items: string[]; tone?: string }) {
  return <section className={`impact-list ${props.tone ? `is-${props.tone}` : ""}`}><strong>{props.title}</strong>{props.items.length ? props.items.slice(0, 4).map((item) => <p key={item}>{item}</p>) : <p>暂无</p>}</section>;
}

function currentStateFallback(review: ImpactReview): string[] {
  return [
    ...review.source.involvedObjects.map((object) => `${object.title}：保持当前状态`),
    ...review.source.lockedRules.map((rule) => `规则：${rule}`)
  ];
}

function riskLabel(level: "low" | "medium" | "high"): string {
  return ({ low: "低风险", medium: "中风险", high: "高风险" })[level];
}

function authorGoalLabel(value: string): string {
  const humanLines = value
    .replace(/\s*Provider profile:.*$/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("-") && !/^(writing|object|event|receipt|runpack):/i.test(line));
  const summary = (humanLines[0] || "保留作者目标").split(/\s+-\s+/)[0].trim();
  return summary.length > 120 ? `${summary.slice(0, 117).trimEnd()}…` : summary;
}

function authorFacingImpactText(value: string): string {
  const dependency = value.match(/^event\.([^ ]+) is pulled into the preview as a dependency\.$/i);
  if (dependency) return `已有事件“${dependency[1]}”将作为这次变化的依据。`;
  return value.replace(/^(event|object|writing)\.([^:]+):\s*/i, "$2：");
}

function sceneGoal(scene: WritingDocument | null): string {
  if (!scene) return "";
  const section = scene.body.match(/##\s*场景目标\s*\n+([^#]+)/)?.[1]?.trim();
  return section || "";
}

function UnavailablePanel(props: { title: string; detail: string }) {
  return <article className="intelligence-unavailable"><BrainCircuit /><p className="eyebrow">诚实边界</p><h1>{props.title}</h1><p>{props.detail}</p></article>;
}
