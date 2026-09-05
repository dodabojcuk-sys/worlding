import { Archive, ArrowRight, BookOpen, Check, CircleStop, FilePlus2, History, Link2, LoaderCircle, Paperclip, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  captureTianyiCreativeAuthorSource,
  cancelTianyiAgentRun,
  continueTianyiAgentRun,
  decideTianyiStoryIntakeCandidate,
  decideTianyiCreativeCandidate,
  extractTianyiCreativeProjection,
  getTianyiCreativeProjection,
  getTianyiSessionMetadata,
  handoffTianyiCreativeCandidate,
  openTianyiSession,
  recoverTianyiAgentRun,
  startTianyiAgentRun,
  streamTianyiAgentRun,
  type StoryIntakeCandidateTypeProjection,
  type StoryIntakeCandidateProjection,
  type StoryIntakeLifecycleStatusProjection,
  type TianyiAgentRunProjection,
  type TianyiCreativeProjection,
  type TianyiSessionMetadata
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { tianyiStoryIntakeRunStorageKey } from "../../../product-shell/runtime/tianyiShellSessionRecovery";

type Lane = "creative" | "work";

export function TianyiConversationWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const { runtime } = props;
  const { t } = useI18n();
  const project = runtime.project;
  const [lane, setLane] = useState<Lane>(() => new URLSearchParams(window.location.search).get("tianyiLane") === "work" ? "work" : "creative");
  const [projection, setProjection] = useState<TianyiCreativeProjection | null>(null);
  const [metadata, setMetadata] = useState<TianyiSessionMetadata | null>(null);
  const [intakeRun, setIntakeRun] = useState<TianyiAgentRunProjection | null>(null);
  const [intakeStreamText, setIntakeStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const intakeAbort = useRef<AbortController | null>(null);
  const legacyFixture = new URLSearchParams(window.location.search).get("testFixture") === "legacy-three-candidates";
  const workVersionId = runtime.workVersionId ?? "work-version.unversioned";

  useEffect(() => {
    const restoreRequestedLane = () => {
      if (window.location.pathname === "/tianyi" && new URLSearchParams(window.location.search).get("tianyiLane") === "work") setLane("work");
    };
    restoreRequestedLane();
    window.addEventListener("popstate", restoreRequestedLane);
    return () => window.removeEventListener("popstate", restoreRequestedLane);
  }, []);

  const operationId = (label: string) => `operation.tianyi.${label}.${crypto.randomUUID()}`;
  const changeLane = (nextLane: Lane) => {
    setLane(nextLane);
    const url = new URL(window.location.href);
    url.searchParams.set("tianyiLane", nextLane);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const ensureConversation = useCallback(async () => {
    if (!project) throw new Error(t("tianyi.workspace.noProject"));
    if (runtime.tianyiConversationId) return runtime.tianyiConversationId;
    const opened = await runtime.withConnection((token) => openTianyiSession(project.id, operationId("open"), token));
    runtime.setTianyiConversationId(opened.sessionId);
    return opened.sessionId;
  }, [project, runtime, t]);

  const refresh = useCallback(async (sessionId: string, candidateId = runtime.activeTianyiCandidateId) => {
    if (!project) return;
    const [nextProjection, nextMetadata] = await runtime.withConnection((token) => Promise.all([
      getTianyiCreativeProjection(project.id, sessionId, token),
      getTianyiSessionMetadata(project.id, sessionId, token)
    ]));
    setProjection(nextProjection);
    setMetadata(Array.isArray(nextMetadata) ? nextMetadata.find((item) => item.id === sessionId) ?? null : nextMetadata);
    const activeCandidate = candidateId ?? nextProjection?.candidates.find((item) => item.state === "handed-off")?.candidateId ?? null;
    if (activeCandidate) runtime.setActiveTianyiCandidateId(activeCandidate);
  }, [project, runtime]);

  useEffect(() => {
    if (!runtime.tianyiConversationId || !project) return;
    void refresh(runtime.tianyiConversationId).catch(() => undefined);
  }, [project, refresh, runtime.tianyiConversationId]);

  useEffect(() => {
    const sessionId = runtime.tianyiConversationId;
    if (!sessionId || !project) return;
    const runId = window.sessionStorage.getItem(tianyiStoryIntakeRunStorageKey(project.id, workVersionId, sessionId));
    if (!runId) return;
    void runtime.withConnection((token) => recoverTianyiAgentRun({ projectId: project.id, workVersionId, sessionId, runId, token })).then(setIntakeRun).catch(() => undefined);
  }, [project, runtime, runtime.tianyiConversationId, workVersionId]);

  const streamIntakeRun = async (sessionId: string, runId: string, label: string, prepareContext = true) => {
    if (!project) return;
    const controller = new AbortController();
    intakeAbort.current = controller;
    setIntakeStreamText("");
    const next = await runtime.withConnection(async (token) => {
      if (prepareContext) {
        const contextualized = await continueTianyiAgentRun({ projectId: project.id, workVersionId, sessionId, runId, operationId: operationId(`${label}.context`), token });
        setIntakeRun(contextualized);
      }
      return streamTianyiAgentRun({
        projectId: project.id, workVersionId, sessionId, runId,
        operationId: operationId(`${label}.stream`), token, signal: controller.signal,
        onEvent(event) { if (event.type === "text-delta") setIntakeStreamText((value) => value + event.delta); }
      });
    });
    setIntakeRun(next);
    intakeAbort.current = null;
  };

  const submitCreative = async () => {
    const text = runtime.creativeComposerDraft.trim();
    if (!text || !project || busy) return;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureConversation();
      const captureOperationId = operationId("capture");
      const captured = await runtime.withConnection((token) => captureTianyiCreativeAuthorSource({
        projectId: project.id,
        sessionId,
        operationId: captureOperationId,
        submissionId: operationId("submission"),
        text,
        collaborate: false,
        token
      }));
      runtime.setCreativeComposerDraft("");
      if (legacyFixture) {
        const extracted = await runtime.withConnection((token) => extractTianyiCreativeProjection({ projectId: project.id, sessionId, operationId: operationId("extract"), source: captured.source, fixture: deterministicThreeCandidates(text, t), token }));
        setProjection(extracted.projection);
        await refresh(sessionId);
      } else {
        const run = await runtime.withConnection((token) => startTianyiAgentRun({
          projectId: project.id, workVersionId, sessionId, currentPage: "/tianyi",
          task: "把本轮已保存的作者原话整理为带精确来源的结构化故事候选。",
          contextRequest: { storyIntake: { version: "tianyan-story-intake-request/v1", sourceRef: captured.source } },
          permissionProfile: "conservative", operationId: operationId("story-intake.start"), token
        }));
        window.sessionStorage.setItem(tianyiStoryIntakeRunStorageKey(project.id, workVersionId, sessionId), run.runId);
        setIntakeRun(run);
        await refresh(sessionId);
        await streamIntakeRun(sessionId, run.runId, "story-intake");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.workspace.prepareFailed")); }
    finally { setBusy(false); }
  };

  const stopStoryIntake = async () => {
    if (!project || !runtime.tianyiConversationId || !intakeRun || !busy) return;
    intakeAbort.current?.abort();
    const next = await runtime.withConnection((token) => cancelTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: runtime.tianyiConversationId!, runId: intakeRun.runId, reason: "作者停止了本次 Story Intake。", operationId: operationId("story-intake.stop"), token }));
    setIntakeRun(next);
  };

  const retryStoryIntake = async () => {
    if (!runtime.tianyiConversationId || !intakeRun || busy) return;
    setBusy(true); setError("");
    try { await streamIntakeRun(runtime.tianyiConversationId, intakeRun.runId, "story-intake.retry", false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Story Intake 重试失败。"); }
    finally { setBusy(false); }
  };

  const decideIntakeCandidate = async (candidateId: string, lifecycleStatus: StoryIntakeLifecycleStatusProjection) => {
    if (!project || !runtime.tianyiConversationId || !intakeRun || busy) return;
    setBusy(true); setError("");
    try {
      const next = await runtime.withConnection((token) => decideTianyiStoryIntakeCandidate({ projectId: project.id, workVersionId, sessionId: runtime.tianyiConversationId!, runId: intakeRun.runId, candidateId, lifecycleStatus, operationId: operationId(`story-intake.${lifecycleStatus}`), token }));
      setIntakeRun(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "候选状态更新失败。"); }
    finally { setBusy(false); }
  };

  const preserveCandidate = async (candidateId: string) => {
    if (!project || !runtime.tianyiConversationId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await runtime.withConnection((token) => decideTianyiCreativeCandidate({ projectId: project.id, sessionId: runtime.tianyiConversationId!, candidateId, operationId: operationId("preserve"), decision: "deferred", token }));
      setProjection(result.projection);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.workspace.preserveFailed")); }
    finally { setBusy(false); }
  };

  const moveCandidateToWork = async (candidateId: string) => {
    if (!project || !runtime.tianyiConversationId || busy) return;
    setBusy(true); setError("");
    try {
      const result = await runtime.withConnection((token) => handoffTianyiCreativeCandidate({ projectId: project.id, sessionId: runtime.tianyiConversationId!, candidateId, operationId: operationId("handoff"), token }));
      runtime.setActiveTianyiCandidateId(candidateId);
      setProjection(result.projection);
      changeLane("work");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.workspace.handoffFailed")); }
    finally { setBusy(false); }
  };

  const openEventLine = () => {
    if (!runtime.tianyiConversationId || !runtime.activeTianyiCandidateId) return;
    const params = new URLSearchParams({ tianyiSession: runtime.tianyiConversationId, tianyiCandidate: runtime.activeTianyiCandidateId });
    window.history.pushState({}, "", `/event-line?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeCandidate = useMemo(() => projection?.candidates.find((item) => item.candidateId === runtime.activeTianyiCandidateId) ?? null, [projection, runtime.activeTianyiCandidateId]);
  const intakeGroups = useMemo(() => {
    const candidates = intakeRun?.storyIntakeEnvelope?.candidates ?? [];
    return STORY_INTAKE_GROUP_ORDER.map((type) => ({ type, candidates: candidates.filter((candidate) => candidate.type === type) })).filter((group) => STORY_INTAKE_PRIMARY_GROUPS.has(group.type) || group.candidates.length > 0);
  }, [intakeRun]);
  const draft = lane === "creative" ? runtime.creativeComposerDraft : runtime.workComposerDraft;
  const setDraft = lane === "creative" ? runtime.setCreativeComposerDraft : runtime.setWorkComposerDraft;

  if (!project) return <main className="shell-workspace tianyi-workspace"><section className="tianyi-workspace-empty"><Sparkles /><h1>{t("space.tianyi")}</h1><p>{t("tianyi.workspace.noProject")}</p></section></main>;

  return <main className="shell-workspace tianyi-workspace" aria-label={t("tianyi.workspaceLabel")} data-tianyi-conversation-id={runtime.tianyiConversationId ?? "not-started"} data-active-lane={lane}>
    <header className="tianyi-workspace-header">
      <div><small>TIANYI CONVERSATION</small><h1>{t("space.tianyi")}</h1></div>
      <div className="tianyi-lane-switch" role="tablist" aria-label={t("tianyi.workspace.modeLabel")}>
        <button type="button" role="tab" aria-selected={lane === "creative"} onClick={() => changeLane("creative")}>{t("tianyi.workspace.creativeMode")}</button>
        <button type="button" role="tab" aria-selected={lane === "work"} onClick={() => changeLane("work")}>{t("tianyi.workspace.workMode")}</button>
      </div>
      <p><History />{t("tianyi.workspace.continuity")}</p>
    </header>

    <div className="tianyi-workspace-body">
      <section className="tianyi-conversation-column">
        <section className="tianyi-visible-history" aria-label={t("tianyi.workspace.historyLabel")}>
          {metadata?.visibleMessages.length ? metadata.visibleMessages.map((message) => <article key={message.eventId} className={`is-${message.actor}`}><span>{message.actor === "author" ? t("tianyi.author") : t("space.tianyi")}</span><p>{message.visibleContent}</p></article>) : <div className="tianyi-conversation-welcome"><Sparkles /><h2>{t("tianyi.workspace.welcomeTitle")}</h2><p>{t("tianyi.workspace.welcomeBody")}</p><small>{t("tianyi.workspace.localOnly")}</small></div>}
        </section>

        {lane === "creative" ? <section className="tianyi-lane-stage" aria-label={t("tianyi.workspace.creativeMode")}>
          <div className="tianyi-stage-heading"><div><small>CREATIVE LANE</small><h2>{t("tianyi.workspace.creativeTitle")}</h2></div><span>{t("tianyi.workspace.creativeGuide")}</span></div>
          {legacyFixture ? <p className="tianyi-fixture-notice" role="status">测试夹具模式 · 固定三候选不是 AI 识别结果</p> : null}
          {!legacyFixture && intakeRun ? <section className="tianyi-intake-run" data-story-intake-status={intakeRun.status} aria-label="Story Intake 运行">
            <header><div><strong>Pi Agent · Story Intake</strong><p>{storyIntakeStatusLabel(intakeRun)}</p></div><span>{intakeRun.model.runtime === "pi" ? "Pi Runtime" : "未接入"}</span></header>
            {intakeRun.status === "running" ? <div className="tianyi-intake-progress"><LoaderCircle className="is-spinning" /><span>正在识别人物、物品、地点、事件与故事路径……</span><button type="button" onClick={stopStoryIntake}><CircleStop />停止</button></div> : null}
            {intakeStreamText ? <p className="tianyi-intake-explanation">{intakeStreamText}</p> : null}
            {intakeRun.error ? <div className="tianyi-intake-failure" role="alert"><p>{intakeRun.error.message}</p>{intakeRun.error.retryable ? <button type="button" onClick={retryStoryIntake}><RotateCcw />重试</button> : null}</div> : null}
            {intakeRun.storyIntakeEnvelope ? <>
              <div className="tianyi-intake-boundary"><span>Canon 写入 0 · 已确认资料对象 {intakeRun.storyIntakeEnvelope.formalStoryWrites}</span><span>基于 {intakeRun.storyIntakeEnvelope.baseVersion.workVersionId}@r{intakeRun.storyIntakeEnvelope.baseVersion.revision}</span></div>
              <dl className="tianyi-intake-runtime-audit" aria-label="Pi 运行回执">
                <div><dt>请求</dt><dd>{intakeRun.executionIdentity.requestedProviderId ?? "unknown"} / {intakeRun.executionIdentity.requestedModelId ?? "unknown"}</dd></div>
                <div><dt>响应模型</dt><dd>{intakeRun.executionIdentity.responseModelId ?? "unknown"}</dd></div>
                <div><dt>Run / Step</dt><dd>{intakeRun.executionIdentity.runId} / {intakeRun.executionIdentity.stepId ?? "unknown"}</dd></div>
                <div><dt>耗时</dt><dd>{intakeRun.observability.latencyMs === null ? "unknown" : `${intakeRun.observability.latencyMs} ms`}</dd></div>
                <div><dt>Token</dt><dd>{intakeRun.observability.totalTokens === null ? "unknown" : intakeRun.observability.totalTokens}</dd></div>
                <div><dt>失败码</dt><dd>{intakeRun.error?.code ?? "none"}</dd></div>
              </dl>
              <div className="tianyi-intake-groups">{intakeGroups.map((group) => <section key={group.type} data-intake-type={group.type}><header><h3>{storyIntakeGroupLabel(group.type)}</h3><span>{group.candidates.length}</span></header><div>{group.candidates.length ? group.candidates.map((candidate) => <StoryIntakeCandidateCard key={candidate.candidateId} candidate={candidate} busy={busy} onDecision={decideIntakeCandidate} />) : <p className="tianyi-intake-empty">本轮未识别出该类候选</p>}</div></section>)}</div>
            </> : null}
          </section> : null}
          {projection?.summary ? <article className="tianyi-summary-card"><strong>{t("tianyi.workspace.summary")}</strong><p>{projection.summary}</p><small>{t("tianyi.workspace.source")}: {projection.summarySourceRefs[0]?.eventId.slice(0, 12)} · {t(projection.summaryState === "current" ? "tianyi.workspace.currentVersion" : "tianyi.workspace.refreshSummary")}</small></article> : null}
          {legacyFixture && projection?.candidates.length ? <div className="tianyi-candidate-grid" aria-label={t("tianyi.workspace.candidateRegistry")}>{projection.candidates.map((candidate, index) => <article key={candidate.candidateId} data-candidate-state={candidate.state}><header><span>{t("tianyi.workspace.direction")} {index + 1}</span><small>{t(candidate.state === "deferred" ? "tianyi.workspace.preserved" : candidate.state === "handed-off" ? "tianyi.workspace.handedOff" : "tianyi.workspace.candidate")}</small></header><h3>{candidate.title}</h3><p>{candidate.summary}</p><small>{candidate.uncertainties.join(" · ")}</small><footer>{candidate.state === "pending" ? <><button type="button" onClick={() => preserveCandidate(candidate.candidateId)}>{t("tianyi.workspace.preserve")}</button><button type="button" className="primary-action" onClick={() => moveCandidateToWork(candidate.candidateId)}>{t("tianyi.workspace.enterWork")}<ArrowRight /></button></> : candidate.state === "handed-off" ? <button type="button" onClick={() => { runtime.setActiveTianyiCandidateId(candidate.candidateId); changeLane("work"); }}>{t("tianyi.workspace.continueWork")}</button> : <span>{t("tianyi.workspace.restoreHint")}</span>}</footer></article>)}</div> : null}
        </section> : <section className="tianyi-lane-stage" aria-label={t("tianyi.workspace.workMode")}>
          <div className="tianyi-stage-heading"><div><small>WORK LANE</small><h2>{activeCandidate?.title ?? t("tianyi.workspace.chooseCandidate")}</h2></div><span>{t("tianyi.workspace.workGuide")}</span></div>
          <div className="tianyi-work-contract">
            <dl><div><dt>{t("tianyi.workspace.workTarget")}</dt><dd>{activeCandidate?.summary ?? t("tianyi.workspace.chooseFromRegistry")}</dd></div><div><dt>{t("tianyi.workspace.targetStory")}</dt><dd>{project.title}</dd></div><div><dt>{t("tianyi.workspace.baseVersion")}</dt><dd>{runtime.workVersionLabel ?? t("tianyi.workspace.currentMainline")}</dd></div><div><dt>ContextPack</dt><dd>{runtime.sharedTianyiReferences.length ? t("tianyi.workspace.referenceCount").replace("{count}", String(runtime.sharedTianyiReferences.length)) : t("tianyi.workspace.authorScope")}</dd></div></dl>
            <label>{t("tianyi.workspace.workScope")}<select value={runtime.workScope} onChange={(event) => runtime.setWorkScope(event.target.value as TianyanShellRuntimeState["workScope"])}><option value="current-story">{t("tianyi.workspace.scope.story")}</option><option value="current-unit">{t("tianyi.workspace.scope.unit")}</option><option value="selected-events">{t("tianyi.workspace.scope.events")}</option></select></label>
          </div>
          {activeCandidate ? <TianyiAdoptionPanel runtime={runtime} onOpenEventLine={openEventLine} /> : <p className="tianyi-work-empty">{t("tianyi.workspace.workEmpty")}</p>}
        </section>}

        {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
        <section className="tianyi-workspace-composer">
          <textarea aria-label={t(lane === "creative" ? "tianyi.workspace.creativeDraft" : "tianyi.workspace.workDraft")} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder={t(lane === "creative" ? "tianyi.workspace.creativePlaceholder" : "tianyi.workspace.workPlaceholder")} />
          <div><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `attachment:${crypto.randomUUID()}`, label: t("tianyi.workspace.demoAttachment"), kind: "attachment" })}><Paperclip />{t("tianyi.workspace.attachment")}</button><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `source:${crypto.randomUUID()}`, label: t("tianyi.workspace.demoSource"), kind: "source" })}><Link2 />{t("tianyi.workspace.sourceAction")}</button>{lane === "creative" ? <button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}{legacyFixture ? t("tianyi.workspace.createCandidates") : "整理为故事候选"}</button> : <button type="button" className="tianyi-send" disabled={!draft.trim()} onClick={() => runtime.setWorkComposerDraft(draft)}><Send />{t("tianyi.workspace.refineCandidate")}</button>}</div>
        </section>
      </section>

      <aside className="tianyi-current-context" aria-label={t("tianyi.workspace.currentView")}>
        <header><strong>{t("tianyi.workspace.currentView")}</strong><small>{t("tianyi.workspace.readOnly")}</small></header>
        <section><BookOpen /><div><strong>{t("tianyi.workspace.context")}</strong><p>{project.title}</p><small>{runtime.workVersionLabel ?? t("tianyi.workspace.currentStory")}</small></div></section>
        <section><FilePlus2 /><div><strong>{t("tianyi.workspace.sharedReferences")}</strong>{runtime.sharedTianyiReferences.length ? runtime.sharedTianyiReferences.map((item) => <p key={item.id}>{item.label}</p>) : <p>{t("tianyi.workspace.noReferences")}</p>}</div></section>
        <section><Sparkles /><div><strong>{t("tianyi.workspace.candidateRegistry")}</strong><p>{t("tianyi.workspace.candidateCount").replace("{count}", String(intakeRun?.storyIntakeEnvelope?.candidates.length ?? projection?.candidates.length ?? 0))}</p><small>{t("tianyi.workspace.sharedVisibility")}</small></div></section>
      </aside>
    </div>
  </main>;
}

const STORY_INTAKE_GROUP_ORDER: StoryIntakeCandidateTypeProjection[] = ["character", "item", "location", "event", "relation", "story_unit", "narrative_path_membership", "unresolved"];
const STORY_INTAKE_PRIMARY_GROUPS = new Set<StoryIntakeCandidateTypeProjection>(STORY_INTAKE_GROUP_ORDER);
function storyIntakeGroupLabel(type: StoryIntakeCandidateTypeProjection): string { return ({ character: "人物", item: "物品", location: "地点", event: "事件", relation: "关系", story_unit: "故事单元", narrative_path_membership: "故事路径成员", unresolved: "未解问题" } satisfies Record<StoryIntakeCandidateTypeProjection, string>)[type]; }
function storyIntakeStatusLabel(run: TianyiAgentRunProjection): string { return ({ idle: "尚未开始", planning: "准备中", awaiting_author: "等待作者", running: "真实运行中", paused: "已停止", completed: "已完成", failed: "失败 · 原话已保留", cancelled: "已停止 · 可重新发起" } satisfies Record<TianyiAgentRunProjection["status"], string>)[run.status]; }

function StoryIntakeCandidateCard(props: { candidate: StoryIntakeCandidateProjection; busy: boolean; onDecision(candidateId: string, status: StoryIntakeLifecycleStatusProjection): void }) {
  const candidate = props.candidate;
  const title = candidate.proposedName ?? candidate.proposedTitle ?? "未命名候选";
  return <article className="tianyi-intake-candidate" data-candidate-state={candidate.lifecycleStatus}>
    <header><strong>{title}</strong><span>{Math.round(candidate.confidence * 100)}%</span></header>
    <p>{candidate.summary}</p>
    <p className="tianyi-intake-identity">身份判定：{candidate.identityDecision === "propose_new" ? "建议新建" : candidate.identityDecision === "link_existing" ? `关联已有对象 ${candidate.existingEntityMatch?.title ?? ""}` : "有歧义，需作者决定"}</p>
    {candidate.narrativePath ? <p className="tianyi-intake-path">同版本路径 · {candidate.narrativePath.label}</p> : null}
    <blockquote><small>原文证据 {candidate.sourceSpan.start}–{candidate.sourceSpan.end}</small><p>{candidate.sourceSpan.excerpt}</p></blockquote>
    <details><summary>不确定性、警告与提议关系</summary><ul>{candidate.uncertainties.map((uncertainty) => <li key={uncertainty}>{uncertainty}</li>)}{candidate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>{candidate.proposedRelations.length ? <p>{candidate.proposedRelations.length} 条待审关系</p> : null}</details>
    <footer>{candidate.lifecycleStatus === "confirmed" ? <span><Check />已由作者确认为资料对象 · 回执 {candidate.formalApplication?.receiptId}</span> : candidate.lifecycleStatus === "pending-archive" ? <span><Archive />已送入待归档 · 未采纳</span> : candidate.lifecycleStatus === "rejected" ? <span>已拒绝</span> : <><button type="button" disabled={props.busy} onClick={() => props.onDecision(candidate.candidateId, "rejected")}><X />拒绝</button><button type="button" disabled={props.busy} onClick={() => props.onDecision(candidate.candidateId, "deferred")}>暂时保留</button><button type="button" className="primary-action" disabled={props.busy} onClick={() => props.onDecision(candidate.candidateId, "pending-archive")}><Archive />送入待归档</button>{["character", "item", "location"].includes(candidate.type) && candidate.identityDecision === "propose_new" ? <button type="button" disabled={props.busy} onClick={() => props.onDecision(candidate.candidateId, "confirmed")}><Check />逐项确认</button> : <span>当前类型仍只能保留为候选</span>}</>}</footer>
  </article>;
}

function deterministicThreeCandidates(text: string, t: (key: TranslationKey) => string) {
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 180);
  return {
    reply: t("tianyi.workspace.reply"),
    summary: t("tianyi.workspace.generatedSummary").replace("{excerpt}", excerpt),
    themes: [t("tianyi.workspace.theme.motive"), t("tianyi.workspace.theme.rule"), t("tianyi.workspace.theme.time")],
    openQuestions: [t("tianyi.workspace.question")],
    candidates: [
      { kind: "event", title: t("tianyi.workspace.candidate1Title"), summary: t("tianyi.workspace.candidate1Summary").replace("{excerpt}", excerpt), uncertainties: [t("tianyi.workspace.candidate1Uncertainty")] },
      { kind: "event", title: t("tianyi.workspace.candidate2Title"), summary: t("tianyi.workspace.candidate2Summary").replace("{excerpt}", excerpt), uncertainties: [t("tianyi.workspace.candidate2Uncertainty")] },
      { kind: "event", title: t("tianyi.workspace.candidate3Title"), summary: t("tianyi.workspace.candidate3Summary").replace("{excerpt}", excerpt), uncertainties: [t("tianyi.workspace.candidate3Uncertainty")] }
    ]
  };
}
