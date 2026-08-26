import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  Eye,
  FastForward,
  Flag,
  Gauge,
  GitBranch,
  History,
  ListTree,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  StepForward,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import type {
  GoldenLoopCandidate,
  GoldenLoopCandidateReviewHistoryEntry,
  GoldenLoopResult,
  NuwaResultReceipt,
  StoryExploration,
  OutputArtifactType,
  TianyiNuwaExecutionBrief
  ,NuwaDirectorActionR1
  ,NuwaDirectorStateR1
} from "../lib/localTransport";
import type { NuwaSceneComparisonR0, NuwaSceneReplayR0, NuwaSceneSimulationReadModelR0 } from "../../../../src/nuwaSceneRuntimeContracts.ts";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { PageContextDock, type PageContextDockLens, type PageContextDockState } from "./PageContextDock";
import { type NuwaWorkspaceStage } from "./nuwaRouteState";

export type NuwaPageDockLens = "context" | "observation" | "branch" | "review" | "control";
type StreamFilter = "all" | "dialogue" | "actions" | "inner" | "environment" | "changes";
type RehearsalRevision = NonNullable<StoryExploration["rehearsal"]>["revisions"][number];
type RehearsalEvent = RehearsalRevision["orderedEvents"][number];

export function NuwaPrimaryWorkspace(props: {
  projectTitle: string;
  contextLabel: string;
  contextDetail: string;
  sourceLabel: string;
  approvedBriefAvailable: boolean;
  boundBrief: TianyiNuwaExecutionBrief | null;
  boundExploration: StoryExploration | null;
  boundResultReceipt: NuwaResultReceipt | null;
  boundBusy: boolean;
  boundError: string;
  providerReady: boolean;
  providerModelId?: string | null;
  livePilotPriceStatus?: "verified" | "unverified";
  livePilotFixtureReady?: boolean;
  attentionContextHash?: string | null;
  result: GoldenLoopResult | null;
  history: GoldenLoopCandidateReviewHistoryEntry[];
  rejectedCandidateIds: string[];
  acceptedCandidateIds: string[];
  busy: boolean;
  error: string;
  goal: string;
  onGoal(value: string): void;
  onStartNew(source: "approved-brief" | "direct"): void;
  onRun(): void;
  onCancel(): void;
  onRunBound(): void;
  onSynthesizeBound(): void;
  onSubmitBoundRoute(routeId: string): void;
  onRejectBoundRoute?(routeId: string): void;
  onCancelBound(): void;
  onReject(candidateId: string): void;
  onReview(candidate: GoldenLoopCandidate): void;
  onAbandonReview(): void;
  onOpenHistory(entry: GoldenLoopCandidateReviewHistoryEntry): void;
  onReopenImpactReview(reviewId: string): void;
  onPrepareBrief(): void;
  onReturnSource(): void;
  dockState: PageContextDockState<NuwaPageDockLens>;
  onDockState(state: PageContextDockState<NuwaPageDockLens>): void;
  onOpenTianyi(): void;
  onOpenEventLine(): void;
  onOpenLibrary(): void;
  onChooseUnit(): void;
  standaloneExploration?: StoryExploration | null;
  onStartStandalone(input: { story: string; authorGoal: string; characterNames: string[]; depth: "short" | "medium" | "long" }): void;
  onRunStandalone(): void;
  onSynthesizeStandalone(): void;
  onSendStandaloneToCreation(route: { id: string; title: string; summary: string }, type: OutputArtifactType): void;
  onSaveTemporaryCharacter?(input: { explorationId: string; displayName: string }): Promise<void>;
  onCreateFromPossibility?(candidate: GoldenLoopCandidate): void;
  sceneRuntime?: NuwaSceneSimulationReadModelR0 | null;
  sceneRuntimeComparison?: NuwaSceneComparisonR0 | null;
  sceneRuntimeReplay?: NuwaSceneReplayR0 | null;
  sceneRuntimeBusy?: boolean;
  sceneRuntimeError?: string;
  onSceneRuntimeAction?(action: "start" | "step" | "play" | "pause" | "stop" | "checkpoint" | "intervene" | "fork" | "compare" | "replay" | "candidate", input?: { checkpointId?: string; instruction?: string; modifiedSoftGoal?: string; injectSecretTo?: string[] }): void;
  onSelectSceneRun?(runId: string): void;
  directorState?: NuwaDirectorStateR1 | null;
  directorBusy?: boolean;
  directorError?: string;
  onDirectorAction?(action: NuwaDirectorActionR1): void;
  stage?: NuwaWorkspaceStage;
  onStageChange?(stage: NuwaWorkspaceStage): void;
  recoveryNotice?: string | null;
  onDismissRecoveryNotice?(): void;
  permissionControl?: ReactNode;
}) {
  const unit = props.boundBrief?.authorApprovalState === "approved" && props.boundExploration
    ? props.boundExploration
    : null;
  const stage = props.stage || "rehearsal";
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [unitSidebarOpen, setUnitSidebarOpen] = useState(false);
  const unitSidebarTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setSelectedRouteId(null);
  }, [unit?.id]);

  useEffect(() => {
    if (!unitSidebarOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setUnitSidebarOpen(false);
      window.requestAnimationFrame(() => unitSidebarTriggerRef.current?.focus());
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [unitSidebarOpen]);

  const title = "女娲 · 单元排演";
  const status = unit ? unitStatusLabel(unit.status) : "等待单元";

  return <section
    className="workbench nuwa-primary-workspace"
    data-testid="nuwa-primary-workspace"
    data-nuwa-surface={unit ? stage : "no-unit"}
    data-nuwa-has-unit={unit ? "true" : "false"}
  >
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="女娲"
      title={title}
      context={unit ? `当前单元 · ${unit.source.sceneTitle}` : props.contextLabel}
      status={<span className={unit?.status === "stale" ? "is-quiet" : unit ? "is-confirmed" : "is-quiet"}>{status}</span>}
      icon={<Sparkles />}
      prototype="workbench"
      className="nuwa-primary-header"
      onOpenNavigation={() => setUnitSidebarOpen(true)}
      actions={<div className="nuwa-header-actions">
        {props.permissionControl}
        {unit ? <button type="button" aria-label={props.dockState.open ? "关闭页面工具" : "打开页面工具"} aria-pressed={props.dockState.open} onClick={() => {
          props.onDockState({ open: !props.dockState.open, activeLens: props.dockState.activeLens });
        }}><Settings2 />页面工具</button> : null}
        <button type="button" className="nuwa-return-source" aria-label="返回天意工作台" title="返回天意工作台" onClick={() => props.onPrepareBrief()}><ArrowLeft />返回天意工作台</button>
      </div>}
    />

    {unit ? <NuwaStageStrip stage={stage} unit={unit} onStageChange={props.onStageChange} /> : null}
    {props.recoveryNotice ? <div className="nuwa-context-recovery" role="status"><span>{props.recoveryNotice}</span><button type="button" onClick={props.onDismissRecoveryNotice}>知道了</button></div> : null}

    {(stage === "director" || stage === "longform") && props.directorState ? <main className="nuwa-runtime-main nuwa-director-main">
      {stage === "director" ? <NuwaDirectorPermissionWorkspace state={props.directorState} busy={props.directorBusy || false} error={props.directorError || ""} onAction={props.onDirectorAction || (() => undefined)} /> : <NuwaLongformWorkspace state={props.directorState} busy={props.directorBusy || false} error={props.directorError || ""} onAction={props.onDirectorAction || (() => undefined)} />}
    </main> : unit && props.boundBrief ? <div
      className="nuwa-runtime-shell"
      data-page-dock-open={props.dockState.open ? "true" : "false"}
      data-page-dock-lens={props.dockState.activeLens}
    >
      <button
        ref={unitSidebarTriggerRef}
        type="button"
        className="nuwa-unit-sidebar-trigger"
        aria-expanded={unitSidebarOpen}
        aria-controls="nuwa-unit-context"
        onClick={() => setUnitSidebarOpen(true)}
      ><ListTree />本单元</button>
      <UnitContextSidebar
        open={unitSidebarOpen}
        brief={props.boundBrief}
        exploration={unit}
        onReturnSource={props.onReturnSource}
        onClose={() => {
          setUnitSidebarOpen(false);
          window.requestAnimationFrame(() => unitSidebarTriggerRef.current?.focus());
        }}
      />
      <main className="nuwa-runtime-main">
        {stage === "director" ? <NuwaDirectorPermissionWorkspace state={props.directorState || null} busy={props.directorBusy || false} error={props.directorError || ""} onAction={props.onDirectorAction || (() => undefined)} /> : stage === "longform" ? <NuwaLongformWorkspace state={props.directorState || null} busy={props.directorBusy || false} error={props.directorError || ""} onAction={props.onDirectorAction || (() => undefined)} /> : stage === "simulation" ? <NuwaSceneSimulationWorkspace
          runtime={props.sceneRuntime || null}
          comparison={props.sceneRuntimeComparison || null}
          replay={props.sceneRuntimeReplay || null}
          busy={props.sceneRuntimeBusy || false}
          error={props.sceneRuntimeError || ""}
          onAction={props.onSceneRuntimeAction || (() => undefined)}
          onSelectRun={props.onSelectSceneRun || (() => undefined)}
        /> : stage === "rehearsal" ? <RehearsalWorkspace
          brief={props.boundBrief}
          exploration={unit}
          receipt={props.boundResultReceipt}
          busy={props.boundBusy}
          error={props.boundError}
          filter={streamFilter}
          onFilter={setStreamFilter}
          onRun={props.onRunBound}
          onSynthesize={props.onSynthesizeBound}
          onCancel={props.onCancelBound}
          onOpenDock={(lens) => props.onDockState({ open: true, activeLens: lens })}
          onOpenTianyi={props.onOpenTianyi}
        /> : stage === "comparison" ? <NuwaCandidateComparison
          exploration={unit}
          selectedRouteId={selectedRouteId}
          onSelectRoute={setSelectedRouteId}
          onReview={() => props.onStageChange?.("review")}
          onReject={props.onRejectBoundRoute}
        /> : stage === "review" ? <NuwaCandidateReviewStage
          exploration={unit}
          receipt={props.boundResultReceipt}
          selectedRouteId={selectedRouteId}
          busy={props.boundBusy}
          onSelectRoute={setSelectedRouteId}
          onSubmit={props.onSubmitBoundRoute}
        /> : <NuwaHistoricalRehearsals
          exploration={unit}
          history={props.history}
          onOpenHistory={(entry) => {
            props.onOpenHistory(entry);
            props.onStageChange?.("comparison");
          }}
        />}
      </main>
      <NuwaPageDock
        state={props.dockState}
        brief={props.boundBrief}
        exploration={unit}
        receipt={props.boundResultReceipt}
        selectedRouteId={selectedRouteId}
        busy={props.boundBusy}
        onState={props.onDockState}
        onSelectRoute={setSelectedRouteId}
        onSubmitRoute={props.onSubmitBoundRoute}
        onRun={props.onRunBound}
        onSynthesize={props.onSynthesizeBound}
        onCancel={props.onCancelBound}
      />
    </div> : props.standaloneExploration ? <NuwaStandaloneRehearsal
      exploration={props.standaloneExploration}
      busy={props.busy}
      error={props.error}
      onRun={props.onRunStandalone}
      onSynthesize={props.onSynthesizeStandalone}
      onSendToCreation={props.onSendStandaloneToCreation}
      onOpenTianyi={props.onOpenTianyi}
      onSaveTemporaryCharacter={props.onSaveTemporaryCharacter}
    /> : stage === "history" ? <NuwaHistoricalRehearsals
      exploration={null}
      history={props.history}
      onOpenHistory={(entry) => {
        props.onOpenHistory(entry);
        props.onStageChange?.("comparison");
      }}
    /> : stage === "comparison" && props.result ? <NuwaCandidateReviewRecord
      contextLabel={props.contextLabel}
      contextDetail={props.contextDetail}
      result={props.result}
      history={props.history}
      rejectedCandidateIds={props.rejectedCandidateIds}
      acceptedCandidateIds={props.acceptedCandidateIds}
      error={props.error}
      busy={props.busy}
      onReturnTianyi={props.onPrepareBrief}
      onOpenHistory={props.onOpenHistory}
      onReject={props.onReject}
      onReview={props.onReview}
      onAbandon={props.onAbandonReview}
      onOpenTianyi={props.onOpenTianyi}
      onCreateFromPossibility={props.onCreateFromPossibility}
    /> : <NuwaNoUnitState
      contextLabel={props.contextLabel}
      goal={props.goal}
      providerReady={props.providerReady}
      providerModelId={props.providerModelId}
      livePilotPriceStatus={props.livePilotPriceStatus}
      livePilotFixtureReady={props.livePilotFixtureReady}
      attentionContextHash={props.attentionContextHash}
      busy={props.busy}
      error={props.error}
      onGoal={props.onGoal}
      onRun={props.onRun}
      onChooseUnit={props.onChooseUnit}
      onReturnStory={props.onOpenEventLine}
      onOpenLibrary={props.onOpenLibrary}
      onStartStandalone={props.onStartStandalone}
    />}
  </section>;
}

function UnitContextSidebar(props: {
  open: boolean;
  brief: TianyiNuwaExecutionBrief;
  exploration: StoryExploration;
  onReturnSource(): void;
  onClose(): void;
}) {
  const latest = latestRehearsalRevision(props.exploration);
  return <aside id="nuwa-unit-context" className="nuwa-unit-context" data-mobile-open={props.open ? "true" : "false"} aria-label="本单元上下文">
    <header><div><small>当前单元</small><strong>{props.exploration.source.sceneTitle}</strong></div><button type="button" className="nuwa-unit-sidebar-close" aria-label="关闭本单元导航" onClick={props.onClose}><X /></button></header>
    <section className="nuwa-unit-scope-summary"><div><small>当前场景</small><strong>{props.exploration.source.sceneTitle}</strong></div><div><small>当前版本</small><strong>{latest ? `排演第 ${latest.runRevision} 版` : "等待首个版本"}</strong></div><div><small>最近检查点</small><strong>{latest ? checkpointLabel(latest) : "尚未建立"}</strong></div></section>
    <section className="nuwa-unit-context-content"><header><UsersRound /><strong>参与角色</strong><span>{latest?.roster.length || props.exploration.specialists.length}</span></header><AgentRoster exploration={props.exploration} revision={latest} /></section>
    <section className="nuwa-unit-revisions"><header><History /><strong>版本</strong><span>{props.exploration.rehearsal?.revisions.length || 0}</span></header>{props.exploration.rehearsal?.revisions.length ? props.exploration.rehearsal.revisions.slice().reverse().map((revision) => <div key={revision.runRevision}><span>第 {revision.runRevision} 版</span><small>{rehearsalStatusLabel(revision.status)}</small></div>) : <p>当前 Run Pack 尚无人物排演版本。</p>}</section>
    <footer><small>所有内容均属于</small><strong>{props.exploration.source.sceneTitle}</strong><span>简报第 {props.brief.revision} 版 · 不直接写入 Canon</span><button type="button" onClick={props.onReturnSource}><ArrowLeft />返回当前作品</button></footer>
  </aside>;
}

function AgentRoster(props: { exploration: StoryExploration; revision: RehearsalRevision | null }) {
  if (props.revision?.roster.length) return <div className="nuwa-roster-list">{props.revision.roster.map((agent, index) => <article key={agent.objectId}><span>{agent.displayName.slice(0, 1)}</span><div><strong>{agent.displayName}</strong><small>正式人物 Agent</small></div><em>{index === 0 ? "主要" : "参与"}</em></article>)}</div>;
  return <div className="nuwa-roster-list">{props.exploration.specialists.map((specialist) => <article key={specialist.label}><span><Bot /></span><div><strong>{specialist.label}</strong><small>{specialist.purpose}</small></div><em>{specialist.status}</em></article>)}</div>;
}

function EventContext(props: { revision: RehearsalRevision | null; exploration: StoryExploration }) {
  const events = props.revision?.orderedEvents || [];
  return <div className="nuwa-context-summary"><dl><div><dt>排演记录</dt><dd>{events.length || props.exploration.activity?.length || 0}</dd></div><div><dt>事件候选</dt><dd>{props.exploration.routes.length}</dd></div><div><dt>当前状态</dt><dd>{unitStatusLabel(props.exploration.status)}</dd></div></dl><p>候选只属于本单元，须经过影响评审与作者确认。</p></div>;
}

function MemoryContext(props: { revision: RehearsalRevision | null }) {
  const deltas = props.revision?.memoryDeltas || [];
  return deltas.length ? <div className="nuwa-context-card-list">{deltas.map((delta) => <article key={delta.deltaId}><strong>{delta.agentRef.displayName}</strong><p>{delta.proposedAfter}</p><small>{reviewStatusLabel(delta.reviewStatus)}</small></article>)}</div> : <p className="nuwa-context-empty">本单元尚无待评审的记忆变化。</p>;
}

function VariableContext(props: { revision: RehearsalRevision | null }) {
  const variables = props.revision?.temporaryVariables || [];
  const boosts = props.revision?.creativeBoosts || [];
  return variables.length || boosts.length ? <div className="nuwa-context-card-list">{variables.map((variable) => <article key={variable.variableId}><strong>{variable.name}</strong><p>{variable.value}</p><small>{variable.scope === "current_unit" ? "当前单元" : "当前版本"} · {variable.enabled ? "启用" : "停用"}</small></article>)}{boosts.map((boost) => <article key={boost.boostId}><strong>{boost.label}</strong><p>{boost.instruction}</p><small>创意加成 · {boost.enabled ? "启用" : "停用"}</small></article>)}</div> : <p className="nuwa-context-empty">本单元没有临时变量或创意加成。</p>;
}

function RehearsalWorkspace(props: {
  brief: TianyiNuwaExecutionBrief;
  exploration: StoryExploration;
  receipt: NuwaResultReceipt | null;
  busy: boolean;
  error: string;
  filter: StreamFilter;
  onFilter(filter: StreamFilter): void;
  onRun(): void;
  onSynthesize(): void;
  onCancel(): void;
  onOpenDock(lens: NuwaPageDockLens): void;
  onOpenTianyi(): void;
}) {
  const latest = latestRehearsalRevision(props.exploration);
  const allEvents = latest?.orderedEvents || [];
  const maximumSequence = allEvents.at(-1)?.sequence || 0;
  const [playbackSequence, setPlaybackSequence] = useState(maximumSequence);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaybackSequence(maximumSequence);
    setPlaying(false);
  }, [latest?.runRevision, maximumSequence]);
  useEffect(() => {
    if (!playing || playbackSequence >= maximumSequence) return;
    const timer = window.setTimeout(() => setPlaybackSequence((sequence) => Math.min(maximumSequence, sequence + 1)), 620);
    return () => window.clearTimeout(timer);
  }, [maximumSequence, playbackSequence, playing]);
  useEffect(() => {
    if (playing && playbackSequence >= maximumSequence) setPlaying(false);
  }, [maximumSequence, playbackSequence, playing]);
  const events = filteredEvents(allEvents.filter((event) => event.sequence <= playbackSequence), props.filter);
  const fallback = props.exploration.activity || [];
  return <section className="nuwa-rehearsal-surface" aria-labelledby="nuwa-unit-title">
    <header className="nuwa-unit-command-bar">
      <div className="nuwa-player-identity"><small>当前单元</small><h1 id="nuwa-unit-title">{props.exploration.source.sceneTitle}</h1><span>简报第 {props.brief.revision} 版 · {latest ? `排演第 ${latest.runRevision} 版` : "等待首个排演版本"}</span></div>
      <div className="nuwa-player-progress" aria-live="polite"><span><strong>{unitStatusLabel(props.exploration.status)}</strong><small>{latest ? `序列 ${playbackSequence} / ${maximumSequence}` : `${props.exploration.progress.completed} / ${props.exploration.progress.total} 项检查`}</small></span><progress max={Math.max(1, maximumSequence || props.exploration.progress.total)} value={maximumSequence ? playbackSequence : props.exploration.progress.completed} /></div>
      <PlayerControls
        exploration={props.exploration}
        busy={props.busy}
        hasRevision={Boolean(latest)}
        playing={playing}
        sequence={playbackSequence}
        maximumSequence={maximumSequence}
        checkpointSequence={latest ? previousCheckpointSequence(latest, playbackSequence) : 0}
        onPlay={() => {
          if (!latest && props.exploration.canRun) props.onRun();
          else if (playbackSequence >= maximumSequence) setPlaybackSequence(0);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onStep={() => { setPlaying(false); setPlaybackSequence((sequence) => Math.min(maximumSequence, sequence + 1)); }}
        onFastForward={() => { setPlaying(false); setPlaybackSequence(maximumSequence); }}
        onRollback={() => { setPlaying(false); setPlaybackSequence(latest ? previousCheckpointSequence(latest, playbackSequence) : 0); }}
        onReset={() => { setPlaying(false); setPlaybackSequence(0); }}
        onFinish={() => { if (props.busy) props.onCancel(); else { setPlaying(false); setPlaybackSequence(maximumSequence); } }}
      />
    </header>
    <section className="nuwa-stream-panel">
      <header><div><p className="eyebrow">故事模拟流</p><h2>本单元排演记录</h2></div><nav aria-label="排演记录筛选">{(["all", "dialogue", "actions", "inner", "environment", "changes"] as StreamFilter[]).map((filter) => <button type="button" key={filter} className={props.filter === filter ? "is-active" : ""} aria-pressed={props.filter === filter} onClick={() => props.onFilter(filter)}>{streamFilterLabel(filter)}</button>)}</nav><button type="button" className="icon-action" aria-label="打开观察工具" title="打开观察工具" onClick={() => props.onOpenDock("observation")}><Eye /></button></header>
      {props.error ? <div className="nuwa-runtime-error" role="alert"><strong>本次排演未完成</strong><p>{props.error}</p></div> : null}
      <ol className="nuwa-rehearsal-stream" aria-label="本单元有序排演记录">
        {events.map((event) => <RehearsalEventItem key={event.eventId} event={event} revision={latest!} />)}
        {!latest && fallback.map((event) => <li key={`${event.runId}:${event.sequence}`} className="is-system" data-event-type={event.eventType}><span className="nuwa-event-avatar"><Sparkles /></span><article><header><strong>{event.actor}</strong><time>#{event.sequence}</time></header><p>{event.summary}</p><footer><span>专业检查</span><small>{event.sourceLabel}</small></footer></article></li>)}
      </ol>
      {!events.length && !fallback.length ? <div className="nuwa-stream-empty"><Sparkles /><strong>等待本单元开始排演</strong><p>开始后，真实 Run Pack 记录会按顺序出现在这里；不会虚构人物对白或行动。</p></div> : null}
      {props.exploration.routes.length ? <section className="nuwa-stream-candidates" aria-label="候选路线"><header><div><small>事件候选</small><strong>{props.exploration.routes.length} 条路线等待作者查看</strong></div><button type="button" className="secondary-action" onClick={() => props.onOpenDock("branch")}><GitBranch />在右栏查看</button></header>{props.exploration.routes.slice(0, 2).map((route) => <article key={route.id}><span><Sparkles /></span><div><strong>{route.title}</strong><p>{route.summary}</p></div><em>候选</em></article>)}</section> : null}
    </section>
    <footer className="nuwa-rehearsal-footer"><button type="button" onClick={props.onOpenTianyi} data-tianyi-drawer-trigger aria-label="打开天意助手询问本单元"><MessageCircle />向天意询问本单元</button><span>{props.receipt?.staleState === "stale" ? "来源已变化，需要重新检查" : "本单元自动保存 · 播放控制不会改写排演记录"}</span></footer>
  </section>;
}

function PlayerControls(props: {
  exploration: StoryExploration;
  busy: boolean;
  hasRevision: boolean;
  playing: boolean;
  sequence: number;
  maximumSequence: number;
  checkpointSequence: number;
  onPlay(): void;
  onPause(): void;
  onStep(): void;
  onFastForward(): void;
  onRollback(): void;
  onReset(): void;
  onFinish(): void;
}) {
  const canPlayback = props.hasRevision && props.maximumSequence > 0;
  return <div className="nuwa-player-controls" role="group" aria-label="排演播放器控制">
    <button type="button" aria-label="回到上一个检查点" title="回到上一个检查点（只改变查看位置）" disabled={!canPlayback || props.sequence === 0} onClick={props.onRollback}><RotateCcw /></button>
    <button type="button" aria-label="重置本版回放" title="重置本版回放（不删除历史）" disabled={!canPlayback || props.sequence === 0} onClick={props.onReset}><History /></button>
    {props.playing ? <button type="button" className="is-primary" aria-label="暂停回放" title="暂停回放" onClick={props.onPause}><Pause /></button> : <button type="button" className="is-primary" aria-label={props.exploration.canRun && !props.hasRevision ? "开始排演" : "继续回放"} title={props.exploration.canRun && !props.hasRevision ? "开始排演" : "继续回放"} disabled={props.busy || (!canPlayback && !props.exploration.canRun)} onClick={props.onPlay}><Play /></button>}
    <button type="button" aria-label="单步推进" title="单步推进" disabled={!canPlayback || props.sequence >= props.maximumSequence} onClick={props.onStep}><StepForward /></button>
    <button type="button" aria-label="快进到本版末尾" title="快进只改变查看位置，不会跳过候选评审" disabled={!canPlayback || props.sequence >= props.maximumSequence} onClick={props.onFastForward}><FastForward /></button>
    <button type="button" aria-label={props.busy ? "结束排演" : "结束回放"} title={props.busy ? "结束当前排演" : "查看本版末尾"} disabled={!props.busy && !canPlayback} onClick={props.onFinish}><Flag /></button>
  </div>;
}

function RehearsalEventItem(props: { event: RehearsalEvent; revision: RehearsalRevision }) {
  const actor = props.event.actorAgentRef?.displayName || eventActorLabel(props.event.eventType);
  return <li className={`is-${eventCategory(props.event.eventType)}`} data-event-type={props.event.eventType}>
    <span className="nuwa-event-avatar">{props.event.actorAgentRef ? actor.slice(0, 1) : <Sparkles />}</span>
    <article><header><strong>{actor}</strong><time>#{props.event.sequence}</time></header><p>{eventSummary(props.event, props.revision)}</p><footer><span>{eventTypeLabel(props.event.eventType)}</span><small>排演第 {props.event.runRevision} 版</small></footer></article>
  </li>;
}

function NuwaPageDock(props: {
  state: PageContextDockState<NuwaPageDockLens>;
  brief: TianyiNuwaExecutionBrief;
  exploration: StoryExploration;
  receipt: NuwaResultReceipt | null;
  selectedRouteId: string | null;
  busy: boolean;
  onState(state: PageContextDockState<NuwaPageDockLens>): void;
  onSelectRoute(routeId: string): void;
  onSubmitRoute(routeId: string): void;
  onRun(): void;
  onSynthesize(): void;
  onCancel(): void;
}) {
  const latest = latestRehearsalRevision(props.exploration);
  const selected = props.exploration.routes.find((route) => route.id === props.selectedRouteId) || null;
  const canSubmit = Boolean(selected && props.exploration.canSubmitRoute && props.receipt?.impactReviewEligible && props.receipt.staleState === "current");
  const pendingReviews = props.exploration.routes.length + (latest?.memoryDeltas.filter((delta) => delta.reviewStatus === "pending").length || 0) + (latest?.relationshipDeltas.filter((delta) => delta.reviewStatus === "pending").length || 0);
  const lenses: PageContextDockLens<NuwaPageDockLens>[] = [
    { id: "context", label: "上下文", icon: <BookOpen />, content: <NuwaContextLens brief={props.brief} exploration={props.exploration} receipt={props.receipt} revision={latest} /> },
    { id: "observation", label: "观察", icon: <Eye />, badge: (latest?.memoryDeltas.length || 0) + (latest?.relationshipDeltas.length || 0), content: <NuwaObservationLens exploration={props.exploration} revision={latest} /> },
    { id: "branch", label: "分支", icon: <GitBranch />, badge: Math.max(0, (props.exploration.rehearsal?.revisions.length || 1) - 1) + props.exploration.routes.length, content: <NuwaBranchLens exploration={props.exploration} selectedRouteId={props.selectedRouteId} onSelect={props.onSelectRoute} /> },
    { id: "review", label: "评审", icon: <Check />, badge: pendingReviews, content: <NuwaReviewLens exploration={props.exploration} receipt={props.receipt} revision={latest} selected={selected} canSubmit={canSubmit} onSelect={props.onSelectRoute} onSubmit={props.onSubmitRoute} /> },
    { id: "control", label: "控制", icon: <Gauge />, badge: latest?.interventionProposals.filter((proposal) => proposal.status === "pending").length || 0, content: <NuwaControlLens exploration={props.exploration} revision={latest} busy={props.busy} onRun={props.onRun} onSynthesize={props.onSynthesize} onCancel={props.onCancel} /> }
  ];
  return <PageContextDock
    pageId="nuwa"
    label="女娲页面右栏"
    state={props.state}
    lenses={lenses}
    onState={props.onState}
  />;
}

function NuwaContextLens(props: { brief: TianyiNuwaExecutionBrief; exploration: StoryExploration; receipt: NuwaResultReceipt | null; revision: RehearsalRevision | null }) {
  return <div className="nuwa-dock-stack"><section><small>当前单元与简报</small><strong>{props.exploration.source.sceneTitle}</strong><p>执行简报第 {props.brief.revision} 版 · {props.revision ? `排演第 ${props.revision.runRevision} 版` : "尚未排演"}</p></section><section><small>实际读取范围</small><dl><div><dt>参与角色</dt><dd>{props.revision?.roster.length || props.exploration.specialists.length}</dd></div><div><dt>来源回执</dt><dd>{props.receipt?.sourceRefs.length || 0}</dd></div><div><dt>作者约束</dt><dd>{props.brief.mustKeep.length + props.brief.mustAvoid.length}</dd></div><div><dt>前序版本</dt><dd>{Math.max(0, (props.exploration.rehearsal?.revisions.length || 1) - 1)}</dd></div></dl></section><section><small>来源状态</small><strong>{props.receipt?.staleState === "current" ? "当前来源有效" : props.receipt?.staleState === "stale" ? "来源已变化" : "等待结果回执"}</strong><p>这里只投影现有 Brief、Run Pack 与 Result Receipt，不复制第二份上下文。</p></section></div>;
}

function NuwaObservationLens(props: { exploration: StoryExploration; revision: RehearsalRevision | null }) {
  return <div className="nuwa-dock-stack"><section><small>参与 Agent</small><AgentRoster exploration={props.exploration} revision={props.revision} /></section><section><small>记忆变化</small><MemoryContext revision={props.revision} /></section><section><small>临时变量与创意加成</small><VariableContext revision={props.revision} /></section>{props.revision?.relationshipDeltas.length ? <section><small>关系变化</small><div className="nuwa-context-card-list">{props.revision.relationshipDeltas.map((delta) => <article key={delta.deltaId}><strong>{delta.sourceAgentRef.displayName} → {delta.targetAgentRef.displayName}</strong><p>{delta.proposedAfter}</p><small>{reviewStatusLabel(delta.reviewStatus)}</small></article>)}</div></section> : null}</div>;
}

function NuwaBranchLens(props: { exploration: StoryExploration; selectedRouteId: string | null; onSelect(routeId: string): void }) {
  return <div className="nuwa-dock-stack"><section><small>不可变版本</small><div className="nuwa-dock-revisions">{props.exploration.rehearsal?.revisions.slice().reverse().map((revision) => <article key={revision.runRevision}><strong>排演第 {revision.runRevision} 版</strong><span>{rehearsalStatusLabel(revision.status)}</span><small>{revision.parentRunRevision ? `继承第 ${revision.parentRunRevision} 版` : "初始版本"}</small></article>) || <p>还没有排演版本。</p>}</div></section><section><small>候选分支</small>{props.exploration.routes.length ? <div className="nuwa-dock-routes">{props.exploration.routes.map((route) => <button type="button" key={route.id} className={route.id === props.selectedRouteId ? "is-selected" : ""} aria-pressed={route.id === props.selectedRouteId} onClick={() => props.onSelect(route.id)}><strong>{route.title}</strong><span>{route.summary}</span></button>)}</div> : <p className="nuwa-context-empty">当前没有候选分支；主画面不会常驻空的比较步骤。</p>}</section></div>;
}

function NuwaReviewLens(props: { exploration: StoryExploration; receipt: NuwaResultReceipt | null; revision: RehearsalRevision | null; selected: StoryExploration["routes"][number] | null; canSubmit: boolean; onSelect(routeId: string): void; onSubmit(routeId: string): void }) {
  return <div className="nuwa-dock-stack"><section><small>事件候选</small>{props.exploration.routes.length ? <div className="nuwa-dock-routes">{props.exploration.routes.map((route) => <button type="button" key={route.id} className={route.id === props.selected?.id ? "is-selected" : ""} aria-pressed={route.id === props.selected?.id} onClick={() => props.onSelect(route.id)}><strong>{route.title}</strong><span>{route.summary}</span></button>)}</div> : <p className="nuwa-context-empty">当前没有待评审候选。</p>}</section>{props.selected ? <section><small>影响摘要</small><strong>{props.selected.title}</strong><p>{props.selected.immediateConsequence}</p><p>{props.selected.mediumTermConsequence}</p><button type="button" className="primary-action" disabled={!props.canSubmit} onClick={() => props.onSubmit(props.selected!.id)}>送入影响评审<ArrowRight /></button><em>{props.canSubmit ? "仍需作者确认，不会直接写入 Canon。" : "当前来源或结果回执尚不满足评审条件。"}</em></section> : null}<section><small>待作者审查的变化</small><dl><div><dt>记忆</dt><dd>{props.revision?.memoryDeltas.filter((delta) => delta.reviewStatus === "pending").length || 0}</dd></div><div><dt>关系</dt><dd>{props.revision?.relationshipDeltas.filter((delta) => delta.reviewStatus === "pending").length || 0}</dd></div><div><dt>结果回执</dt><dd>{props.receipt?.impactReviewEligible ? "可进入评审" : "等待"}</dd></div></dl></section></div>;
}

function NuwaControlLens(props: { exploration: StoryExploration; revision: RehearsalRevision | null; busy: boolean; onRun(): void; onSynthesize(): void; onCancel(): void }) {
  return <div className="nuwa-dock-stack"><section><small>运行控制</small><strong>所有操作只作用于当前单元</strong><p>排演版本保持不可变；候选仍须经过影响评审与作者确认。</p><div className="nuwa-dock-actions">{props.busy ? <button type="button" className="secondary-action danger-text" onClick={props.onCancel}><CircleStop />结束排演</button> : props.exploration.canRun ? <button type="button" className="primary-action" onClick={props.onRun}><Play />开始排演</button> : props.exploration.canSynthesize ? <button type="button" className="primary-action" onClick={props.onSynthesize}><Sparkles />整理候选</button> : <span><Clock3 />等待下一状态</span>}</div></section><section><small>临时变量与创意加成</small><VariableContext revision={props.revision} /></section><section><small>干预提案</small>{props.revision?.interventionProposals.length ? <div className="nuwa-context-card-list">{props.revision.interventionProposals.map((proposal) => <article key={proposal.interventionId}><strong>{proposal.targetAgentRef.displayName}</strong><p>{proposal.proposedChange}</p><small>{interventionStatusLabel(proposal.status)}</small></article>)}</div> : <p className="nuwa-context-empty">没有待处理的角色干预提案。</p>}</section></div>;
}

function NuwaStageStrip(props: { stage: NuwaWorkspaceStage; unit: StoryExploration | null; onStageChange?(stage: NuwaWorkspaceStage): void }) {
  const stages: { id: NuwaWorkspaceStage; label: string; detail: string }[] = [
    { id: "rehearsal", label: "排演现场", detail: props.unit ? unitStatusLabel(props.unit.status) : "先选择 Unit" },
    { id: "comparison", label: "候选比较", detail: props.unit?.routes.length ? `${props.unit.routes.length} 条候选` : "等待候选" },
    { id: "simulation", label: "场景推演", detail: "角色行动与世界裁决" },
    { id: "director", label: "导演权限", detail: "当前 Run 的有限授权" },
    { id: "longform", label: "长篇编排", detail: "分阶段作者检查点" },
    { id: "review", label: "候选审查", detail: "送入影响评审前" },
    { id: "history", label: "历史排演", detail: "只读记录" }
  ];
  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, current: NuwaWorkspaceStage) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as const).includes(event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End")) return;
    event.preventDefault();
    const currentIndex = stages.findIndex((item) => item.id === current);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? stages.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + stages.length) % stages.length;
    const next = stages[nextIndex].id;
    props.onStageChange?.(next);
    window.requestAnimationFrame(() => document.getElementById(`nuwa-stage-${next}`)?.focus());
  };
  const current = stages.find((item) => item.id === props.stage) || stages[0]!;
  return <section className="nuwa-run-progress" aria-label="当前女娲运行">
    <div className="nuwa-run-progress-summary"><span><small>当前 Run</small><strong>{current.label}</strong><em>{current.detail}</em></span><span className="nuwa-stage-handoff"><Check />影响评审 / 作者确认</span></div>
    <details className="nuwa-run-details"><summary>运行详情</summary><nav aria-label="女娲运行详情" role="tablist">
      {stages.map((item) => <button id={`nuwa-stage-${item.id}`} key={item.id} type="button" role="tab" aria-selected={props.stage === item.id} aria-controls="nuwa-stage-panel" tabIndex={props.stage === item.id ? 0 : -1} className={props.stage === item.id ? "is-active" : ""} onKeyDown={(event) => moveFocus(event, item.id)} onClick={() => props.onStageChange?.(item.id)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}
    </nav></details>
  </section>;
}

const directorPermissionLabels: Record<NuwaDirectorStateR1["permissions"][number]["kind"], string> = {
  "read-context": "读取本次上下文",
  "create-proposal": "生成可拒绝提案",
  "rehearse-sandbox": "在 Run 沙箱排演",
  "predict-future": "预测后续可能",
  "enrich-branch": "丰富已有分支",
  "create-temporary-agent": "创建临时 Agent",
  "add-side-line": "提议支线",
  "add-hidden-line": "提议暗线",
  "add-main-line": "提议主线",
  "create-creation-draft": "创建创作草稿",
  "modify-creative-brief": "修订创作简报"
};

function NuwaDirectorPermissionWorkspace(props: { state: NuwaDirectorStateR1 | null; busy: boolean; error: string; onAction(action: NuwaDirectorActionR1): void }) {
  const [agentName, setAgentName] = useState("夜巡人");
  const [agentPurpose, setAgentPurpose] = useState("检查当前单元中的钟楼路径与目击信息。");
  if (!props.state) return <section id="nuwa-stage-panel" className="nuwa-stage-panel nuwa-director-workspace" role="tabpanel"><div className="nuwa-stage-empty"><Bot /><strong>先建立或选择一次排演</strong><p>导演权限只属于明确的 Run Pack，不存在全局默认授权。</p></div></section>;
  const activeAgents = props.state.temporaryAgents.filter((agent) => agent.status === "active");
  return <section id="nuwa-stage-panel" className="nuwa-stage-panel nuwa-director-workspace" role="tabpanel" aria-label="女娲导演权限">
    <header><div><p className="eyebrow">导演权限 R1</p><h1>女娲可以做什么，由作者在本次 Run 内决定</h1><p>权限过期、撤销或超出预算时 fail-closed。女娲永远不能确认 Canon、删除数据或发布。</p></div><span className="nuwa-run-disclaimer">这是一次排演 Run，不是故事事实。</span></header>
    {props.error ? <p className="nuwa-runtime-error" role="alert">{props.error}</p> : null}
    <div className="nuwa-director-grid">
      <section><h2>可授权能力</h2><div className="nuwa-director-permissions">{props.state.permissions.map((permission) => <label key={permission.kind}><span><strong>{directorPermissionLabels[permission.kind]}</strong><small>{permission.kind === "predict-future" ? "默认关闭 · 不代表概率" : permission.kind === "modify-creative-brief" ? "默认关闭 · 修订后必须再确认" : "仅当前 Run"}</small></span><input type="checkbox" checked={permission.status === "granted"} disabled={props.busy} onChange={(event) => props.onAction({ action: "set-permission", kind: permission.kind, granted: event.target.checked, reason: event.target.checked ? "作者在导演面板显式授权。" : "作者在导演面板显式撤销。" })} /></label>)}</div></section>
      <aside><section><small>作用域与预算</small><dl><div><dt>步数</dt><dd>{props.state.scope.maxSteps}</dd></div><div><dt>Provider 调用</dt><dd>{props.state.scope.maxCalls}</dd></div><div><dt>费用上限</dt><dd>{props.state.scope.maxCost} {props.state.scope.costCurrency}</dd></div><div><dt>临时 Agent</dt><dd>{activeAgents.length} / {props.state.scope.maxConcurrentAgents}</dd></div></dl></section><section><small>永不可授权</small><p>确认正史 · 永久删除 · 发布部署 · 跨项目读取 · 安装能力 · 修改自身权限 · 突破预算</p></section><details><summary>来源与技术详情</summary><p>Run {props.state.scope.runId}</p><p>修订 {props.state.revision} · 过期 {props.state.scope.expiresAt}</p></details></aside>
    </div>
    <section className="nuwa-temporary-agents"><header><div><small>临时 Agent</small><h2>只在本次 Run 内生成提案</h2></div></header><div className="nuwa-temporary-agent-form"><input aria-label="临时 Agent 名称" value={agentName} onChange={(event) => setAgentName(event.target.value)} /><input aria-label="临时 Agent 任务" value={agentPurpose} onChange={(event) => setAgentPurpose(event.target.value)} /><button type="button" className="secondary-action" disabled={props.busy || !agentName.trim() || !agentPurpose.trim()} onClick={() => props.onAction({ action: "create-temporary-agent", displayName: agentName, purpose: agentPurpose })}><UsersRound />建立临时 Agent</button></div><div className="nuwa-temporary-agent-list">{props.state.temporaryAgents.map((agent) => <article key={agent.agentId}><div><strong>{agent.displayName}</strong><p>{agent.purpose}</p><small>{agent.status === "active" ? "运行中 · 仅 Run-local proposal" : `已结束 · ${agent.status}`}</small></div>{agent.status === "active" ? <button type="button" disabled={props.busy} onClick={() => props.onAction({ action: "end-temporary-agent", agentId: agent.agentId, agentStatus: "cancelled" })}>结束</button> : null}</article>)}{props.state.temporaryAgents.length === 0 ? <p>尚未建立临时 Agent。正式角色不会被复制或自动 Agent 化。</p> : null}</div></section>
  </section>;
}

const longformStageLabels: Record<NonNullable<NuwaDirectorStateR1["longformJob"]>["currentStage"], string> = {
  "author-intent": "作者意图",
  "creative-brief": "创作简报",
  "world-character-seeds": "世界与人物种子",
  "event-line-spine": "事件线骨架",
  "rehearsal-comparison": "排演与比较",
  "author-checkpoint": "作者检查点",
  "ready-event-line": "可审核事件线",
  "creation-draft": "创作草稿"
};

function NuwaLongformWorkspace(props: { state: NuwaDirectorStateR1 | null; busy: boolean; error: string; onAction(action: NuwaDirectorActionR1): void }) {
  const [title, setTitle] = useState("钟楼故事 · 长篇分阶段编排");
  const job = props.state?.longformJob || null;
  if (!props.state) return <section id="nuwa-stage-panel" className="nuwa-stage-panel" role="tabpanel"><div className="nuwa-stage-empty"><ListTree /><strong>先选择一次 Run</strong><p>长篇编排必须绑定当前作品与明确 Run Pack。</p></div></section>;
  return <section id="nuwa-stage-panel" className="nuwa-stage-panel nuwa-longform-workspace" role="tabpanel" aria-label="长篇分阶段编排">
    <header><div><p className="eyebrow">整本作品编排骨架 R1</p><h1>分阶段推进，不把一次大模型回答伪装成整本创作</h1><p>每个阶段只产生可审核投影；创作简报修订、作者检查点和后续写入仍需要显式确认。</p></div><span className="nuwa-run-disclaimer">Provider 调用 0 · 本轮仅确定性骨架</span></header>
    {props.error ? <p className="nuwa-runtime-error" role="alert">{props.error}</p> : null}
    {!job ? <div className="nuwa-longform-create"><label><span>编排任务</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><button type="button" className="primary-action" disabled={props.busy || !title.trim()} onClick={() => props.onAction({ action: "create-longform-job", title })}>建立分阶段 Job</button></div> : <><ol className="nuwa-longform-stages">{Object.entries(longformStageLabels).map(([stage, label], index) => { const completed = job.completedStages.includes(stage as typeof job.currentStage); const active = job.currentStage === stage; return <li key={stage} className={active ? "is-active" : completed ? "is-complete" : ""}><span>{completed ? <Check /> : index + 1}</span><div><strong>{label}</strong><small>{active ? job.status === "paused" ? "已暂停" : "当前阶段" : completed ? "已留存回执" : "尚未开始"}</small></div></li>; })}</ol><section className="nuwa-longform-current"><small>当前</small><h2>{longformStageLabels[job.currentStage]}</h2><p>{job.currentStage === "creative-brief" ? "创作简报必须由作者再次确认，不能被女娲自行改写。" : job.currentStage === "author-checkpoint" ? "请作者审查世界、人物、事件线和排演差异后再继续。" : "本阶段只产生下一阶段的可追溯输入，不写入 Canon。"}</p><div>{job.status === "paused" ? <button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onAction({ action: "resume-longform-job" })}>继续</button> : !["completed", "cancelled", "failed"].includes(job.status) ? <><button type="button" className="secondary-action" disabled={props.busy} onClick={() => props.onAction({ action: "pause-longform-job" })}>暂停</button><button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onAction({ action: "advance-longform-job", ...(job.currentStage === "creative-brief" ? { confirmCreativeBrief: true } : {}), ...(job.currentStage === "author-checkpoint" ? { confirmAuthorCheckpoint: true } : {}) })}>{job.currentStage === "creative-brief" || job.currentStage === "author-checkpoint" ? "确认并继续" : "完成本阶段"}</button><button type="button" className="secondary-action danger-text" disabled={props.busy} onClick={() => props.onAction({ action: "cancel-longform-job" })}>取消 Job</button></> : <strong>{job.status === "completed" ? "分阶段骨架已完成；后续写入仍需要作者控制。" : "Job 已结束。"}</strong>}</div></section><details><summary>编排回执</summary><p>Job {job.jobId} · 修订 {props.state.revision} · Provider 调用 {job.providerCalls}</p><p>已完成：{job.completedStages.map((stage) => longformStageLabels[stage]).join("、") || "无"}</p></details></>}
  </section>;
}

function NuwaSceneSimulationWorkspace(props: {
  runtime: NuwaSceneSimulationReadModelR0 | null;
  comparison: NuwaSceneComparisonR0 | null;
  replay: NuwaSceneReplayR0 | null;
  busy: boolean;
  error: string;
  onAction(action: "start" | "step" | "play" | "pause" | "stop" | "checkpoint" | "intervene" | "fork" | "compare" | "replay" | "candidate", input?: { checkpointId?: string; instruction?: string; modifiedSoftGoal?: string; injectSecretTo?: string[] }): void;
  onSelectRun(runId: string): void;
}) {
  const [view, setView] = useState<"stage" | "events" | "diff">("stage");
  const [selectedActorId, setSelectedActorId] = useState<string>("character.linyuan");
  const [interventionText, setInterventionText] = useState("让林远先确认阿岚是否愿意继续共享线索。");
  const [injectSecretToGatekeeper, setInjectSecretToGatekeeper] = useState(false);
  const runtime = props.runtime;
  const checkpoint = runtime?.checkpoints.at(-1) || null;
  const selectedActor = runtime?.actors.find((actor) => actor.actorRef.id === selectedActorId) || runtime?.actors[0] || null;
  if (!runtime) return <main id="nuwa-stage-panel" className="nuwa-scene-simulation nuwa-scene-empty" role="tabpanel" aria-label="场景推演"><header><div><p className="eyebrow">场景推演 R0</p><h1>让角色在有限认知下行动</h1><p>这是一次排演 Run，不是故事事实。先建立开发夹具，再单步观察角色、世界裁决和信息传播。</p></div><span>Provider 调用 0</span></header><section className="nuwa-scene-start-card"><strong>钟楼外寻找阿岚</strong><p>1 个 Unit · 2 个 Beat · 3 个 Actor · 3 个被动 Entity · 8 步确定性策略。</p><button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onAction("start")}><Play />建立场景 Run</button></section>{props.error ? <p className="nuwa-runtime-error" role="alert">{props.error}</p> : null}</main>;
  return <main id="nuwa-stage-panel" className="nuwa-scene-simulation" role="tabpanel" aria-label="场景推演"><header className="nuwa-scene-header"><div><p className="eyebrow">场景推演</p><h1>{runtime.scenario.title}</h1><p>这是一次排演 Run，不是故事事实。运行结果只能进入候选审核。</p></div><dl><div><dt>状态</dt><dd>{sceneRunStatusLabel(runtime.status)}</dd></div><div><dt>步数</dt><dd>{Math.min(runtime.ledger.length, runtime.director.maxSteps)} / {runtime.director.maxSteps}</dd></div><div><dt>成本</dt><dd>Provider 0 · 调用 0</dd></div></dl></header><section className="nuwa-scene-toolbar" aria-label="场景推演控制"><button type="button" className="primary-action" disabled={props.busy || runtime.status === "completed"} onClick={() => props.onAction("step")}><StepForward />单步</button><button type="button" className="secondary-action" disabled={props.busy || runtime.status === "completed"} onClick={() => props.onAction("play")}><Play />播放</button><button type="button" className="secondary-action" disabled={props.busy || runtime.status === "completed"} onClick={() => props.onAction("pause")}><Pause />暂停</button><button type="button" className="secondary-action" disabled={props.busy} onClick={() => props.onAction("checkpoint")}><Flag />建立检查点</button><button type="button" className="secondary-action" disabled={props.busy || !checkpoint} onClick={() => props.onAction("fork", { checkpointId: checkpoint?.checkpointId })}><GitBranch />从检查点分支</button><button type="button" className="secondary-action" disabled={props.busy || !runtime.parentRunId} onClick={() => props.onAction("compare")}><ArrowRight />比较父子 Run</button><button type="button" className="secondary-action" disabled={props.busy} onClick={() => props.onAction("replay")}><RotateCcw />回放</button>{runtime.status === "completed" ? <button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onAction("candidate")}><Check />提炼候选</button> : null}</section>{props.error ? <p className="nuwa-runtime-error" role="alert">{props.error}</p> : null}<nav className="nuwa-scene-view-tabs" aria-label="场景推演视图"><button type="button" className={view === "stage" ? "is-active" : ""} onClick={() => setView("stage")}>场景舞台</button><button type="button" className={view === "events" ? "is-active" : ""} onClick={() => setView("events")}>事件流</button><button type="button" className={view === "diff" ? "is-active" : ""} onClick={() => setView("diff")}>世界状态差异</button></nav><div className="nuwa-scene-grid"><aside className="nuwa-scene-left"><section><small>场景</small><strong>{runtime.scenario.title}</strong><span>{sceneUnitLabel(runtime.scenario.unitRef.id)} · {runtime.scenario.beatRefs.length} 个节拍</span></section><section><small>运行谱系</small><strong>{runtime.parentRunId ? "子 Run · 分支" : "父 Run"}</strong><span>{runtime.parentCheckpointId ? `继承第 ${runtime.checkpoints.find((item) => item.checkpointId === runtime.parentCheckpointId)?.step ?? 0} 步检查点` : "共享前缀从第 0 步开始"}</span>{runtime.children.map((child) => <button type="button" key={child.runId} onClick={() => props.onSelectRun(child.runId)}><span>子 Run</span><strong>{sceneRunStatusLabel(child.status)}</strong><small>选择查看分支</small></button>)}</section><section><small>检查点</small>{runtime.checkpoints.length ? runtime.checkpoints.map((item, index) => <button type="button" key={item.checkpointId} className={checkpoint?.checkpointId === item.checkpointId ? "is-selected" : ""} onClick={() => undefined}><strong>检查点 {index + 1}</strong><span>第 {item.step} 步</span></button>) : <span>尚未建立</span>}</section><section><small>角色</small>{runtime.actors.map((actor) => <button type="button" key={actor.actorRef.id} className={selectedActor?.actorRef.id === actor.actorRef.id ? "is-selected" : ""} onClick={() => setSelectedActorId(actor.actorRef.id)}><strong>{actor.displayName}</strong><span>{sceneLocationLabel(runtime.sandboxState.locations[actor.actorRef.id.replace("character.", "actor.") as keyof typeof runtime.sandboxState.locations] || actor.locationRef)}</span></button>)}</section></aside><section className="nuwa-scene-center">{view === "stage" ? <div className="nuwa-scene-stage-map"><div className="nuwa-scene-location"><span>钟楼外</span>{runtime.actors.filter((actor) => actor.locationRef === "location.clocktower-exterior" || runtime.sandboxState.locations[actor.actorRef.id.replace("character.", "actor.") as keyof typeof runtime.sandboxState.locations] === "location.clocktower-exterior").map((actor) => <button type="button" key={actor.actorRef.id} className={selectedActor?.actorRef.id === actor.actorRef.id ? "is-selected" : ""} onClick={() => setSelectedActorId(actor.actorRef.id)}>{actor.displayName}</button>)}</div><div className="nuwa-scene-route">可达 ↔</div><div className="nuwa-scene-location"><span>钟楼门侧</span>{runtime.actors.filter((actor) => runtime.sandboxState.locations[actor.actorRef.id.replace("character.", "actor.") as keyof typeof runtime.sandboxState.locations] === "location.clocktower-gate").map((actor) => <button type="button" key={actor.actorRef.id} className={selectedActor?.actorRef.id === actor.actorRef.id ? "is-selected" : ""} onClick={() => setSelectedActorId(actor.actorRef.id)}>{actor.displayName}</button>)}</div><div className="nuwa-scene-entity-strip">{runtime.scenario.passiveEntities.map((entity) => <span key={entity.entityRef.id}>{entity.displayName} · {entity.state}</span>)}</div></div> : view === "events" ? <ol className="nuwa-scene-event-list">{runtime.ledger.map((event) => <li key={event.eventId}><header><strong>第 {event.step} 步 · {sceneActorLabel(event.action.actorRef.id, runtime.actors)}</strong><span className={event.outcome === "accepted" ? "is-accepted" : "is-rejected"}>{event.outcome === "accepted" ? "已裁决" : "已拒绝"}</span></header><p>{event.action.statedIntent}</p><small>{event.resolverReason}</small>{event.observations.map((receipt) => <em key={receipt.receiptId}>信息传递：{sceneActorLabel(receipt.receivingActorRef.id, runtime.actors)} 获得 {sceneKnowledgeLabel(receipt.knowledgeRef)}</em>)}</li>)}{runtime.ledger.length === 0 ? <li className="nuwa-scene-event-empty">尚未产生事件；单步后这里显示事件流。</li> : null}</ol> : <div className="nuwa-scene-diff-list">{runtime.ledger.map((event) => <article key={event.eventId}><strong>第 {event.step} 步</strong><p>{event.resolverReason}</p><span>{Object.entries(event.appliedStateDelta.locations).map(([actor, location]) => `${sceneActorLabel(actor, runtime.actors)} → ${sceneLocationLabel(location)}`).join("；") || "沙箱位置不变"}</span><span>{Object.entries(event.appliedStateDelta.resources).map(([resource, amount]) => `${sceneResourceLabel(resource)} ${amount}`).join("；") || "资源不变"}</span></article>)}</div>}</section><aside className="nuwa-scene-right">{selectedActor ? <><section><small>当前角色</small><h2>{selectedActor.displayName}</h2><p>{selectedActor.currentGoal}</p><dl><div><dt>位置</dt><dd>{sceneLocationLabel(runtime.sandboxState.locations[selectedActor.actorRef.id.replace("character.", "actor.") as keyof typeof runtime.sandboxState.locations])}</dd></div><div><dt>资源</dt><dd>{Object.entries(selectedActor.resources).map(([key, value]) => `${sceneResourceLabel(key)} ${value}`).join("、") || "无"}</dd></div></dl></section><section><small>已知</small>{selectedActor.beliefs.confirmedFacts.map((fact) => <span className="nuwa-knowledge-chip" key={fact}>{fact}</span>)}</section><section><small>未知</small><p>{selectedActor.beliefs.hypotheses.join("、") || "未收到的信息不可见"}</p></section><section><small>误解（不是事实）</small><p>{selectedActor.beliefs.misunderstandings.join("、") || "暂无"}</p></section></> : null}<section className="nuwa-scene-intervention"><small>作者干预</small><textarea value={interventionText} onChange={(event) => setInterventionText(event.target.value)} rows={3} /><label><input type="checkbox" checked={injectSecretToGatekeeper} onChange={(event) => setInjectSecretToGatekeeper(event.target.checked)} /> 仅在分支中把秘密传给守门人</label><button type="button" className="secondary-action" disabled={props.busy || !checkpoint} onClick={() => props.onAction("intervene", { checkpointId: checkpoint?.checkpointId, instruction: interventionText, modifiedSoftGoal: interventionText, ...(injectSecretToGatekeeper ? { injectSecretTo: ["actor.gatekeeper"] } : {}) })}>写入可逆干预</button><p>干预不会改写旧事件；从检查点创建分支后才继续行动。</p></section></aside></div>{props.comparison ? <section className="nuwa-scene-compare-card"><header><strong>父 / 子 Run 比较</strong><span>共享前缀 {props.comparison.sharedPrefixStep} 步 · 分歧 {props.comparison.divergenceStep || "尚未"}</span></header><p>{props.comparison.causalChain.join(" → ")}</p><ul>{props.comparison.stateChanges.map((item) => <li key={item}>{item}</li>)}</ul><p>{props.comparison.informationPropagation.join("；") || "信息传播没有新增差异。"}</p></section> : null}{props.replay ? <p className={`nuwa-scene-replay ${props.replay.matches ? "is-ok" : "is-failed"}`}>回放 {props.replay.matches ? "通过" : "失败"} · 重新生成动作 0 <details><summary>回放校验详情</summary><span>state hash {props.replay.stateHash}</span><span>ledger hash {props.replay.ledgerHash}</span></details></p> : null}</main>;
}

function sceneRunStatusLabel(status: NuwaSceneSimulationReadModelR0["status"]): string {
  return ({ planned: "未开始", running: "运行中", paused: "已暂停", completed: "已完成", stopped: "已停止", failed: "失败", stale: "来源已过期" } as Record<NuwaSceneSimulationReadModelR0["status"], string>)[status];
}

function sceneActorLabel(actorId: string, actors: NuwaSceneSimulationReadModelR0["actors"]): string {
  return actors.find((actor) => actor.actorRef.id === actorId)?.displayName || ({ "actor.linyuan": "林远", "actor.arlan": "阿岚", "actor.gatekeeper": "守门人", "character.linyuan": "林远", "character.arlan": "阿岚", "character.gatekeeper": "守门人" } as Record<string, string>)[actorId] || "角色";
}

function sceneLocationLabel(locationId: string | undefined): string {
  return ({ "location.clocktower-exterior": "钟楼外", "location.clocktower-gate": "钟楼门侧", "location.clocktower-roof": "钟楼顶层" } as Record<string, string>)[locationId || ""] || "未标注位置";
}

function sceneResourceLabel(resourceId: string): string {
  return ({ "item.signal-lantern": "信号灯", "item.silver-key": "银钥匙", "resource.time": "时间" } as Record<string, string>)[resourceId] || "资源";
}

function sceneKnowledgeLabel(knowledgeRef: string): string {
  return ({ "secret.arlan-location": "阿岚所在位置", "fact.clocktower-open": "钟楼门已打开" } as Record<string, string>)[knowledgeRef] || "一条新信息";
}

function sceneUnitLabel(unitId: string): string {
  return ({ "unit.clocktower-search-arlan": "钟楼外寻找阿岚" } as Record<string, string>)[unitId] || "当前故事单元";
}

function NuwaNoUnitState(props: { contextLabel: string; goal: string; providerReady: boolean; providerModelId?: string | null; livePilotPriceStatus?: "verified" | "unverified"; livePilotFixtureReady?: boolean; attentionContextHash?: string | null; busy: boolean; error: string; onGoal(value: string): void; onRun(): void; onChooseUnit(): void; onReturnStory(): void; onOpenLibrary(): void; onStartStandalone(input: { story: string; authorGoal: string; characterNames: string[]; depth: "short" | "medium" | "long" }): void }) {
  const [mode, setMode] = useState<"choice" | "standalone">("choice");
  const [story, setStory] = useState("");
  const [goal, setGoal] = useState("看看接下来会发生什么");
  const [names, setNames] = useState("");
  const [depth, setDepth] = useState<"short" | "medium" | "long">("short");
  if (mode === "standalone") return <main id="nuwa-stage-panel" className="nuwa-no-unit nuwa-standalone-start" role="tabpanel" aria-label="新建独立排演"><section><small>新建独立排演</small><h1>把一个故事带进排演</h1><p>先准备本次输入和参与角色；没有资料匹配的角色只会作为本次排演的临时角色保存。</p><label><span>输入一段故事、场景、冲突或设想</span><textarea value={story} rows={8} onChange={(event) => setStory(event.target.value)} placeholder="例如：午夜钟响后，守夜人发现印章被调换…" /></label><label><span>这次想看什么</span><select value={goal} onChange={(event) => setGoal(event.target.value)}><option>看看接下来会发生什么</option><option>测试某个角色会怎么选择</option><option>比较几种故事可能</option><option>续写这一段故事</option></select></label><label><span>重点角色（可选，用顿号或逗号分隔）</span><input value={names} onChange={(event) => setNames(event.target.value)} placeholder="例如：顾沉、无灯者" /></label><label><span>推演长度</span><select value={depth} onChange={(event) => setDepth(event.target.value as typeof depth)}><option value="short">短</option><option value="medium">中</option><option value="long">长</option></select></label><footer><button type="button" className="secondary-action" onClick={() => setMode("choice")}>返回</button><button type="button" className="primary-action" disabled={!story.trim()} onClick={() => props.onStartStandalone({ story, authorGoal: goal, characterNames: names.split(/[、，,]/u).map((item) => item.trim()).filter(Boolean), depth })}><Sparkles />准备排演</button></footer></section></main>;
  if (mode === "choice") return <NuwaPreparationState
    contextLabel={props.contextLabel}
    goal={props.goal}
    providerReady={props.providerReady}
    livePilotFixtureReady={props.livePilotFixtureReady}
    attentionContextHash={props.attentionContextHash}
    busy={props.busy}
    error={props.error}
    onGoal={props.onGoal}
    onRun={props.onRun}
    onChooseUnit={props.onChooseUnit}
    onReturnStory={props.onReturnStory}
    onOpenLibrary={props.onOpenLibrary}
    onStartStandalone={() => setMode("standalone")}
  />;
  const priceLabel = props.livePilotPriceStatus === "verified" ? "已配置 USD 单价" : "价格未验证 · 上限 $0.50";
  const contextReady = Boolean(props.attentionContextHash);
  const fixtureReady = props.livePilotFixtureReady === true;
  const runReady = props.providerReady && contextReady && fixtureReady;
  return <main id="nuwa-stage-panel" className="nuwa-no-unit" role="tabpanel" aria-label="排演现场"><section><Sparkles /><p className="eyebrow">女娲 · 排演现场</p><h1>从一个故事开始</h1><p>可以从当前故事进入，也可以直接带着一段场景或设想开始独立排演。</p><div className="nuwa-empty-actions"><button type="button" className="primary-action" onClick={props.onChooseUnit}>从当前故事排演<ArrowRight /></button><button type="button" className="primary-action" onClick={() => setMode("standalone")}>新建独立排演<Sparkles /></button><button type="button" className="secondary-action" onClick={props.onReturnStory}>返回当前故事</button><button type="button" className="secondary-action" onClick={props.onOpenLibrary}>查看相关资料</button></div><section className="nuwa-live-pilot-launch" aria-label="真实模型实验"><header><div><p className="eyebrow">真实模型实验</p><h2>让女娲比较三条未来</h2></div><span className={runReady ? "is-ready" : "is-blocked"}>{!props.providerReady ? "等待 Provider" : !fixtureReady ? "等待开发夹具" : !contextReady ? "等待 Attention Context" : "可开始"}</span></header><p>同一份来源上下文，沿保守推进、主动介入、延迟观察三条轴各生成一次候选。候选仍须经过作者审查。</p><dl><div><dt>Provider / model</dt><dd>{props.providerReady ? props.providerModelId || "SiliconFlow · 未选择模型" : "未连接"}</dd></div><div><dt>候选 / 最大调用</dt><dd>3 / 4 次</dd></div><div><dt>预算</dt><dd>{priceLabel}</dd></div><div><dt>上下文</dt><dd>{props.attentionContextHash ? "来源已绑定" : "等待经批准的 Attention Context"}</dd></div></dl><details className="nuwa-live-pilot-details"><summary>来源与技术详情</summary><dl><div><dt>Context hash</dt><dd>{props.attentionContextHash || "尚未生成"}</dd></div></dl></details><label><span>作者问题</span><textarea value={props.goal} onChange={(event) => props.onGoal(event.target.value)} placeholder="例如：如果此刻公开水源投毒，三条未来会如何分化？" /></label>{props.error ? <p className="form-error" role="alert">{props.error}</p> : null}<button type="button" className="primary-action" disabled={!runReady || !props.goal.trim() || props.busy} onClick={props.onRun}><Sparkles />{props.busy ? "正在准备真实推演" : runReady ? "开始真实推演" : !props.providerReady ? "先连接 SiliconFlow" : !fixtureReady ? "仅开发夹具可用" : "先确认 Attention Context"}</button></section><dl><div><dt>当前来源</dt><dd>{props.contextLabel}</dd></div><div><dt>事实边界</dt><dd>Run / Candidate 不是 Canon</dd></div></dl></section></main>;
}

function NuwaPreparationState(props: { contextLabel: string; goal: string; providerReady: boolean; livePilotFixtureReady?: boolean; attentionContextHash?: string | null; busy: boolean; error: string; onGoal(value: string): void; onRun(): void; onChooseUnit(): void; onReturnStory(): void; onOpenLibrary(): void; onStartStandalone(): void }) {
  const showDeveloperDetails = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "nuwa";
  return <main id="nuwa-stage-panel" className="nuwa-no-unit nuwa-preparation-state" role="tabpanel" aria-label="场景排演准备" data-nuwa-inner-workspace="true" data-nuwa-empty-state="scenario-preparation">
    <section className="nuwa-preparation-card">
      <Sparkles /><p className="eyebrow">女娲 · 场景排演</p><h1>从一个故事开始</h1>
      <p>选择一个故事来源，说明你想观察的问题，再开始一次可回看的排演。结果不会自动成为故事事实。</p>
      <ol className="nuwa-preparation-steps" aria-label="开始排演的步骤"><li><strong>1</strong>选择故事来源</li><li><strong>2</strong>说明想观察的问题</li><li><strong>3</strong>开始排演并查看影响</li></ol>
      <div className="nuwa-empty-actions"><button type="button" className="primary-action" onClick={props.onChooseUnit}>选择故事来源<ArrowRight /></button><button type="button" className="secondary-action" onClick={props.onStartStandalone}>新建独立排演<Sparkles /></button></div>
      <div className="nuwa-preparation-tertiary-actions"><button type="button" onClick={props.onReturnStory}>返回当前故事</button><button type="button" onClick={props.onOpenLibrary}>查看相关资料</button></div>
      <label className="nuwa-preparation-question"><span>作者问题（可选）</span><textarea value={props.goal} onChange={(event) => props.onGoal(event.target.value)} rows={3} placeholder="例如：如果守夜人先公开秘密，场景会如何分化？" /></label>
      {props.error ? <p className="form-error" role="alert">{props.error}</p> : null}
      {showDeveloperDetails ? <details className="nuwa-live-pilot-details"><summary>Provider 试验（仅开发状态）</summary><p>本入口不会自动调用 Provider；当前只显示连接前提，运行仍需作者显式开始。</p><dl><div><dt>Provider</dt><dd>{props.providerReady ? "已配置" : "未连接"}</dd></div><div><dt>开发夹具</dt><dd>{props.livePilotFixtureReady ? "可用" : "未准备"}</dd></div><div><dt>来源上下文</dt><dd>{props.attentionContextHash ? "已绑定" : "等待绑定"}</dd></div></dl><button type="button" className="secondary-action" disabled={props.busy || !props.goal.trim()} onClick={props.onRun}>开始受控排演</button></details> : null}
      <dl className="nuwa-preparation-meta"><div><dt>当前来源</dt><dd>{props.contextLabel}</dd></div><div><dt>事实边界</dt><dd>排演结果不会自动成为故事事实</dd></div></dl>
    </section>
  </main>;
}

function NuwaStandaloneRehearsal(props: { exploration: StoryExploration; busy: boolean; error: string; onRun(): void; onSynthesize(): void; onOpenTianyi(): void; onSendToCreation(route: { id: string; title: string; summary: string }, type: OutputArtifactType): void; onSaveTemporaryCharacter?(input: { explorationId: string; displayName: string }): Promise<void> }) {
  const sandbox = props.exploration.standaloneSandbox;
  const [creationTarget, setCreationTarget] = useState<OutputArtifactType>("novel");
  const [savedTemporaryNames, setSavedTemporaryNames] = useState<string[]>([]);
  const labels: Record<OutputArtifactType, string> = { novel: "小说", screenplay: "剧本", storyboard: "分镜", comic: "漫画", "motion-comic": "漫剧", "interactive-drama": "互动剧" };
  return <main id="nuwa-stage-panel" className="nuwa-standalone-rehearsal" role="tabpanel" aria-label="独立排演"><header><div><small>独立排演</small><h1>本次故事实验</h1><p>所有角色、可能性与续写都只属于本次排演，尚未进入已确认故事。</p></div><button type="button" className="secondary-action" onClick={props.onOpenTianyi}><MessageCircle />询问天意</button></header><section><h2>作者输入</h2><p>{sandbox?.story || props.exploration.source.authorGoal}</p></section><section><h2>角色准备</h2><div className="nuwa-standalone-agent-list">{sandbox?.agents.length ? sandbox.agents.map((agent) => <article key={agent.id}><strong>{agent.displayName}</strong><small>{agent.kind === "temporary-character" ? "临时角色 · 仅用于本次排演" : "已有角色 · 只读快照"}</small>{agent.kind === "temporary-character" && props.onSaveTemporaryCharacter ? <button type="button" className="secondary-action" disabled={props.busy || savedTemporaryNames.includes(agent.displayName)} onClick={() => void props.onSaveTemporaryCharacter?.({ explorationId: props.exploration.id, displayName: agent.displayName }).then(() => setSavedTemporaryNames((current) => [...current, agent.displayName]))}>{savedTemporaryNames.includes(agent.displayName) ? "已建立角色候选" : "保存为角色候选"}</button> : null}</article>) : <p>尚未指定重点角色；可以在后续排演前补充。</p>}</div></section>{props.error ? <p className="nuwa-runtime-error" role="alert">{props.error}</p> : null}<section className="nuwa-standalone-actions">{props.exploration.status === "planned" ? <button type="button" className="primary-action" disabled={props.busy} onClick={props.onRun}>开始排演</button> : props.exploration.status === "ready-to-synthesize" ? <button type="button" className="primary-action" disabled={props.busy} onClick={props.onSynthesize}>整理故事可能</button> : null}</section>{props.exploration.routes.length ? <section><h2>故事可能</h2><p>选择一种平级成品类型；这会建立可追溯的来源，但不会确认故事事实。</p><label className="nuwa-creation-target"><span>发送到创作</span><select value={creationTarget} onChange={(event) => setCreationTarget(event.target.value as OutputArtifactType)}>{Object.entries(labels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label><div className="nuwa-route-comparison">{props.exploration.routes.map((route) => <article key={route.id}><strong>{route.title}</strong><p>{route.summary}</p><small>仍是排演结果，尚未进入已确认故事。</small><button type="button" className="secondary-action" disabled={props.busy} onClick={() => props.onSendToCreation({ id: route.id, title: route.title, summary: route.summary }, creationTarget)}>发送到{labels[creationTarget]}</button></article>)}</div></section> : null}</main>;
}

function NuwaCandidateComparison(props: { exploration: StoryExploration; selectedRouteId: string | null; onSelectRoute(routeId: string): void; onReview(): void; onReject?(routeId: string): void }) {
  const selected = props.exploration.routes.find((route) => route.id === props.selectedRouteId) || props.exploration.routes[0] || null;
  return <section id="nuwa-stage-panel" className="nuwa-stage-panel nuwa-candidate-comparison" role="tabpanel" aria-label="候选比较"><header><div><p className="eyebrow">候选比较</p><h1>三条不同的可逆未来</h1><p>只比较本 Unit 的可逆候选；候选仍不是故事事实，这里先比较叙事方向，再进入既有 Candidate Review。</p></div><span>{props.exploration.routes.length} 条候选</span></header>{props.exploration.routes.length ? <><div className="nuwa-route-comparison">{props.exploration.routes.map((route) => <button type="button" key={route.id} className={`${route.id === selected?.id ? "is-selected " : ""}${route.candidateStatus === "rejected" ? "is-rejected" : ""}`} aria-pressed={route.id === selected?.id} onClick={() => props.onSelectRoute(route.id)}><span>{route.candidateStatus === "rejected" ? "已淘汰" : route.candidateStatus === "promoted" ? "已晋升" : "候选路线"}</span><strong>{route.authorView?.direction || route.title}</strong><p>{route.authorView?.keyAction || route.summary}</p><dl><div><dt>眼前结果</dt><dd>{route.authorView?.directResult || route.immediateConsequence}</dd></div><div><dt>后续压力</dt><dd>{route.authorView?.downstreamImpact || route.mediumTermConsequence}</dd></div><div><dt>差异</dt><dd>{route.authorView?.causalDifference || route.longTermPressure}</dd></div></dl></button>)}</div>{selected?.authorView ? <section className="nuwa-selected-future" aria-label="选中候选详情"><small>作者视角</small><strong>{selected.authorView.direction}</strong><p>{selected.authorView.keyAction}</p><p>{selected.authorView.causalDifference}</p><details><summary>推演详情（默认收起）</summary><p>风险：{selected.authorView.risks.join("；") || "待作者检查"}</p><p>未知：{selected.authorView.unknowns.join("；") || "暂无新增未知"}</p>{selected.candidateRun ? <p>技术记录：seed {selected.candidateRun.seed} · Run Pack {selected.candidateRun.runId} · trace {selected.candidateRun.traceHash}</p> : null}</details></section> : null}<footer>{selected && selected.candidateStatus !== "rejected" && selected.candidateStatus !== "promoted" && props.onReject ? <button type="button" className="secondary-action" onClick={() => props.onReject?.(selected.id)}><X />淘汰这条候选</button> : null}<button type="button" className="primary-action" disabled={!selected || selected.candidateStatus === "rejected" || selected.candidateStatus === "promoted"} onClick={props.onReview}>进入候选审查<ArrowRight /></button></footer></> : <div className="nuwa-stage-empty"><Sparkles /><strong>本次尚无可比较候选</strong><p>不会伪造候选内容；完成当前排演后，真实 Result Receipt 会在这里出现。</p></div>}</section>;
}

function NuwaCandidateReviewStage(props: { exploration: StoryExploration; receipt: NuwaResultReceipt | null; selectedRouteId: string | null; busy: boolean; onSelectRoute(routeId: string): void; onSubmit(routeId: string): void }) {
  const revision = latestRehearsalRevision(props.exploration);
  const selected = props.exploration.routes.find((route) => route.id === props.selectedRouteId) || props.exploration.routes[0] || null;
  const canSubmit = Boolean(selected && props.exploration.canSubmitRoute && props.receipt?.impactReviewEligible && props.receipt.staleState === "current");
  return <section id="nuwa-stage-panel" className="nuwa-stage-panel nuwa-candidate-review-stage" role="tabpanel" aria-label="候选审查"><header><div><p className="eyebrow">Candidate Review</p><h1>作者审查候选影响</h1><p>送入 Impact Review 不等于确认，更不会直接写入 Canon。</p></div></header><NuwaReviewLens exploration={props.exploration} receipt={props.receipt} revision={revision} selected={selected} canSubmit={canSubmit && !props.busy} onSelect={props.onSelectRoute} onSubmit={props.onSubmit} /></section>;
}

function NuwaHistoricalRehearsals(props: { exploration: StoryExploration | null; history: GoldenLoopCandidateReviewHistoryEntry[]; onOpenHistory(entry: GoldenLoopCandidateReviewHistoryEntry): void }) {
  const revisions = props.exploration?.rehearsal?.revisions.slice().reverse() || [];
  return <section id="nuwa-stage-panel" className="nuwa-stage-panel nuwa-history-stage" role="tabpanel" aria-label="历史排演"><header><div><p className="eyebrow">历史排演</p><h1>已保存的记录</h1><p>查看历史不会重新执行 Provider，也不会改变原记录。</p></div></header><div className="nuwa-history-columns"><section><small>当前 Unit 的版本</small>{revisions.length ? revisions.map((revision) => <article key={revision.runRevision}><strong>排演第 {revision.runRevision} 版</strong><span>{rehearsalStatusLabel(revision.status)}</span><p>{revision.orderedEvents.length} 条已保存记录 · {revision.candidateRefs.length} 条候选引用</p></article>) : <p>当前 Unit 尚无已保存版本。</p>}</section><section><small>Candidate Review 历史</small>{props.history.length ? props.history.map((entry) => <button type="button" key={entry.id} onClick={() => props.onOpenHistory(entry)}><span>{lifecycleLabel(entry.lifecycleStatus)}</span><strong>{authorGoalSummary(entry.result.contextPack.authorIntent)}</strong><ChevronRight /></button>) : <p>当前作品没有可恢复的 Candidate Review。</p>}</section></div></section>;
}

function NuwaCandidateReviewRecord(props: {
  contextLabel: string;
  contextDetail: string;
  result: GoldenLoopResult | null;
  history: GoldenLoopCandidateReviewHistoryEntry[];
  rejectedCandidateIds: string[];
  acceptedCandidateIds: string[];
  error: string;
  busy: boolean;
  onReturnTianyi(): void;
  onOpenHistory(entry: GoldenLoopCandidateReviewHistoryEntry): void;
  onReject(candidateId: string): void;
  onReview(candidate: GoldenLoopCandidate): void;
  onAbandon(): void;
  onOpenTianyi(): void;
  onCreateFromPossibility?(candidate: GoldenLoopCandidate): void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.result?.nuwa.candidates.find((candidate) => candidate.id === selectedId) || null;
  if (!props.result) return null;
  return <main id="nuwa-stage-panel" className="nuwa-legacy-review" role="tabpanel" aria-label="候选比较"><header><div><p className="eyebrow">可恢复 Candidate Review</p><h1>{authorGoalSummary(props.result.contextPack.authorIntent)}</h1><p>打开不会重新执行排演；候选仍须进入既有影响评审。</p></div><button type="button" className="secondary-action" data-tianyi-drawer-trigger onClick={props.onOpenTianyi}><MessageCircle />询问天意</button></header>{props.error ? <div className="nuwa-runtime-error" role="alert"><strong>记录恢复失败</strong><p>{props.error}</p></div> : null}{props.result.provider.livePilot ? <details className="nuwa-live-pilot-details"><summary>真实模型实验技术详情</summary><dl><div><dt>Provider / model</dt><dd>{props.result.provider.livePilot.modelId}</dd></div><div><dt>调用</dt><dd>{props.result.provider.livePilot.receipts.length} / {props.result.provider.livePilot.maxCalls}</dd></div><div><dt>上下文</dt><dd>{props.result.provider.livePilot.contextHash}</dd></div><div><dt>随机种子</dt><dd>{props.result.provider.livePilot.seedSupport}</dd></div><div><dt>差异检查</dt><dd>{props.result.provider.livePilot.divergence.distinct ? "通过" : "未通过"}</dd></div></dl></details> : null}<div className="nuwa-route-comparison">{props.result.nuwa.candidates.map((candidate) => <button type="button" key={candidate.id} className={candidate.id === selectedId ? "is-selected" : ""} aria-pressed={candidate.id === selectedId} onClick={() => setSelectedId(candidate.id)}><span>{props.acceptedCandidateIds.includes(candidate.id) ? "已送评审" : props.rejectedCandidateIds.includes(candidate.id) ? "已拒绝" : "等待比较"}</span><strong>{candidate.authorView?.direction || candidate.title}</strong><p>{candidate.authorView?.keyAction || candidate.change}</p><dl><div><dt>变化后</dt><dd>{candidate.authorView?.directResult || candidate.after}</dd></div><div><dt>风险</dt><dd>{candidate.authorView?.downstreamImpact || candidate.risk}</dd></div></dl></button>)}</div>{selected && !props.acceptedCandidateIds.includes(selected.id) && !props.rejectedCandidateIds.includes(selected.id) ? <footer><button type="button" className="secondary-action danger-text" disabled={props.busy} onClick={() => props.onReject(selected.id)}><X />拒绝候选</button><button type="button" className="secondary-action" disabled={props.busy} onClick={() => props.onCreateFromPossibility?.(selected)}><BookOpen />用这个可能性创作</button><button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onReview(selected)}><Check />送入影响评审</button></footer> : null}<button type="button" className="nuwa-abandon-link" disabled={props.busy} onClick={props.onAbandon}>放弃本轮记录</button></main>;
}

function latestRehearsalRevision(exploration: StoryExploration): RehearsalRevision | null {
  const rehearsal = exploration.rehearsal;
  if (!rehearsal || rehearsal.latestRevision == null) return null;
  return rehearsal.revisions.find((revision) => revision.runRevision === rehearsal.latestRevision) || null;
}

function filteredEvents(events: RehearsalEvent[], filter: StreamFilter): RehearsalEvent[] {
  if (filter === "all") return events;
  if (filter === "dialogue") return events.filter((event) => event.eventType === "agent_speech");
  if (filter === "actions") return events.filter((event) => event.eventType === "agent_action" || event.eventType === "agent_coordination");
  if (filter === "inner") return events.filter((event) => ["conscious_thought", "inner_monologue", "subconscious_tendency", "psychological_state"].includes(event.eventType));
  if (filter === "environment") return events.filter((event) => event.eventType === "environment_change" || event.eventType === "narration");
  return events.filter((event) => ["memory_delta", "relationship_delta", "temporary_variable_applied", "creative_boost_applied", "intervention_proposed", "intervention_applied", "candidate_emitted"].includes(event.eventType));
}

function eventSummary(event: RehearsalEvent, revision: RehearsalRevision): string {
  if (event.eventType === "agent_speech") return event.payload.text;
  if (["conscious_thought", "inner_monologue", "subconscious_tendency", "psychological_state", "narration", "run_note"].includes(event.eventType)) return (event.payload as { text: string }).text;
  if (event.eventType === "agent_action" || event.eventType === "environment_change" || event.eventType === "agent_coordination") return event.payload.description;
  if (event.eventType === "system_checkpoint") return event.payload.label;
  if (event.eventType === "memory_delta") return revision.memoryDeltas.find((delta) => delta.deltaId === event.payload.deltaId)?.proposedAfter || "产生一条待评审的记忆变化。";
  if (event.eventType === "relationship_delta") return revision.relationshipDeltas.find((delta) => delta.deltaId === event.payload.deltaId)?.proposedAfter || "产生一条待评审的关系变化。";
  if (event.eventType === "temporary_variable_applied") return `应用临时变量：${revision.temporaryVariables.find((item) => item.variableId === event.payload.variableId)?.name || event.payload.variableId}`;
  if (event.eventType === "creative_boost_applied") return `应用创意加成：${revision.creativeBoosts.find((item) => item.boostId === event.payload.boostId)?.label || event.payload.boostId}`;
  if (event.eventType === "intervention_proposed" || event.eventType === "intervention_applied") return revision.interventionProposals.find((item) => item.interventionId === event.payload.interventionId)?.proposedChange || "记录一条可逆的角色干预。";
  if (event.eventType === "candidate_emitted") return `形成事件候选：${event.payload.candidateRef}`;
  return "记录本单元状态。";
}

function eventCategory(type: RehearsalEvent["eventType"]): "dialogue" | "action" | "change" | "system" {
  if (type === "agent_speech") return "dialogue";
  if (["agent_action", "environment_change", "agent_coordination", "conscious_thought", "inner_monologue", "subconscious_tendency", "psychological_state", "narration"].includes(type)) return "action";
  if (type === "run_note" || type === "system_checkpoint") return "system";
  return "change";
}

function eventActorLabel(type: RehearsalEvent["eventType"]): string {
  if (type === "environment_change") return "环境";
  if (type === "narration") return "叙事";
  if (type === "agent_coordination") return "Agent 调度";
  if (type === "system_checkpoint") return "检查点";
  if (type === "candidate_emitted") return "女娲";
  return "系统";
}

function eventTypeLabel(type: RehearsalEvent["eventType"]): string {
  return ({
    agent_speech: "对话", agent_action: "行动", environment_change: "环境变化", memory_delta: "记忆变化",
    conscious_thought: "显性想法", inner_monologue: "内心独白", subconscious_tendency: "潜意识倾向", psychological_state: "心理状态",
    narration: "场景叙事", agent_coordination: "Agent 调度", system_checkpoint: "系统检查点",
    relationship_delta: "关系变化", temporary_variable_applied: "临时变量", creative_boost_applied: "创意加成",
    intervention_proposed: "干预提案", intervention_applied: "干预回执", candidate_emitted: "事件候选", run_note: "排演记录"
  } as Record<RehearsalEvent["eventType"], string>)[type];
}

function streamFilterLabel(filter: StreamFilter): string {
  return ({ all: "全部", dialogue: "对白", actions: "行动", inner: "内心", environment: "环境", changes: "变化" })[filter];
}

function previousCheckpointSequence(revision: RehearsalRevision, sequence: number): number {
  return revision.orderedEvents.filter((event) => event.eventType === "system_checkpoint" && event.sequence < sequence).at(-1)?.sequence || 0;
}

function checkpointLabel(revision: RehearsalRevision): string {
  const checkpoint = revision.orderedEvents.filter((event) => event.eventType === "system_checkpoint").at(-1);
  return checkpoint?.eventType === "system_checkpoint" ? checkpoint.payload.label : `序列 ${revision.orderedEvents.at(-1)?.sequence || 0}`;
}

function unitStatusLabel(status: StoryExploration["status"]): string {
  return ({ planned: "等待开始", running: "排演中", "ready-to-synthesize": "等待整理候选", "ready-for-review": "等待比较候选", "submitted-to-impact": "已送入影响评审", cancelled: "已取消", stale: "来源已变化" } as Record<StoryExploration["status"], string>)[status];
}

function rehearsalStatusLabel(status: RehearsalRevision["status"]): string {
  return ({ planned: "计划中", running: "排演中", completed: "已完成", failed: "失败", cancelled: "已取消", "ready-for-candidate-review": "待评审" } as Record<RehearsalRevision["status"], string>)[status];
}

function reviewStatusLabel(status: "pending" | "approved" | "rejected"): string {
  return ({ pending: "待作者评审", approved: "已批准进入后续评审", rejected: "已拒绝" })[status];
}

function interventionStatusLabel(status: RehearsalRevision["interventionProposals"][number]["status"]): string {
  return ({ pending: "待确认", approved: "已批准用于下一版本", rejected: "已拒绝", applied_to_run_revision: "已应用到明确版本" })[status];
}

function lifecycleLabel(status: string): string {
  return ({ awaiting: "等待作者比较", rejected: "候选已拒绝", accepted: "已送入影响评审", abandoned: "作者已放弃", superseded: "已被后续排演取代" } as Record<string, string>)[status] || "历史记录";
}

function authorGoalSummary(value: string | null | undefined): string {
  const firstLine = typeof value === "string"
    ? value.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || "未命名排演"
    : "未命名排演";
  return firstLine.length > 96 ? `${firstLine.slice(0, 93).trimEnd()}…` : firstLine;
}
