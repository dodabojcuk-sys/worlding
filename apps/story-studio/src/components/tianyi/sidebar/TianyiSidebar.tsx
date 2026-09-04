import { Check, ChevronRight, ChevronDown, Clock3, LoaderCircle, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import type { StoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import type { TemporalProjectionRun } from "../../../../../../src/storyContracts/temporalProjection.ts";
import {
  getTianyiSessionMetadata,
  handoffTianyiAgentCandidate,
  listTemporalProjectionRuns,
  openTianyiSession,
  recoverTianyiAgentRun,
  streamTianyiGroundedAnswer,
  startTianyiAgentRun,
  approveTianyiAgentStep,
  rejectTianyiAgentStep,
  cancelTianyiAgentRun,
  streamTianyiAgentRun,
  type TianyiAgentRunProjection,
  type TianyiSessionMetadata
} from "../../../lib/localTransport";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { TianyiSidebarComposer } from "../composer/TianyiSidebarComposer";
import type { CapabilityMenuItem } from "../capability-launcher/capabilityMenuTypes";
import { TianyiAgentPanel } from "./TianyiAgentPanel";
import { TianyiWorkPanel } from "./TianyiWorkPanel";
import { TianyiModeSwitch, type TianyiSidebarMode } from "./TianyiModeSwitch";
import { agentPermissionProfileForIntent, createTianyiSubmitGate, currentTianyiAgentStep, tianyiAgentRunStorageKey } from "../tianyiAgentRunViewModel";
import { TianyiAdoptionPanel } from "../workspace/TianyiAdoptionPanel";

export type TianyiSidebarContextRequest = {
  productMode: "world" | "writing" | "intelligence" | "localization" | "publish";
  activeOwner: { kind: "project" | "writing-document" | "world-object" | "visual-document"; id: string | null };
  selection: { documentId: string | null; objectId: string | null; timelinePointId: string | null };
  sourceRefs: Array<{ id: string; kind: string; origin: string }>;
  memorySelections: Array<{ id: string; scope: "author-global" | "project" }>;
  enabledSkillRefs: Array<{ id: string; version: string }>;
  eventRefs?: StoryStudioEventReference[];
  predictionSourceLabels?: string[];
  predictionSourceUnitSummary?: string;
  knowledgeView?: { observerId: string; observerLabel: string; hiddenEventCount: number };
};

export function TianyiSidebar(props: {
  workspace: TianyiContextualSpaceId;
  pageLabel: string;
  runtime: TianyanShellRuntimeState;
  agentAvailable: boolean;
  contextRequest?: TianyiSidebarContextRequest | null;
  onClose(): void;
  onOpenSettings(): void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<TianyiSidebarMode>("work");
  const [task, setTask] = useState<CapabilityMenuItem | null>(null);
  const [session, setSession] = useState<TianyiSessionMetadata | null>(null);
  const [run, setRun] = useState<TianyiAgentRunProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [scope, setScope] = useState<"nearby" | "line" | "selected">("nearby");
  const [freedom, setFreedom] = useState<"strict" | "balanced" | "free">("balanced");
  const [streamText, setStreamText] = useState("");
  const [predictionRunning, setPredictionRunning] = useState(false);
  const [temporalProjectionRun, setTemporalProjectionRun] = useState<TemporalProjectionRun | null>(() => {
    const replay = (window as Window & { __storyStudioTemporalProjectionRun?: TemporalProjectionRun }).__storyStudioTemporalProjectionRun;
    return replay ?? null;
  });
  const submitGate = useRef(createTianyiSubmitGate()).current;
  const streamController = useRef<AbortController | null>(null);
  const stopping = useRef(false);
  const project = props.runtime.project;
  const workVersionId = props.runtime.workVersionId ?? "work-version.unversioned";
  const contextRequest = useMemo(() => props.contextRequest ?? (project ? {
    productMode: props.workspace === "nuwa" ? "intelligence" as const : "world" as const,
    activeOwner: { kind: "project" as const, id: project.id },
    selection: { documentId: null, objectId: null, timelinePointId: null },
    sourceRefs: [], memorySelections: [], enabledSkillRefs: []
  } : null), [project, props.contextRequest, props.workspace]);
  const modelLabel = useMemo(() => {
    const profile = props.runtime.modelStatus?.profile.profile;
    if (!profile?.enabled) return null;
    return props.runtime.modelStatus?.profiles.find((item) => item.modelId === profile.modelId)?.label ?? profile.modelId;
  }, [props.runtime.modelStatus]);
  const providerReady = props.runtime.modelStatus?.tianyiDialogue.ready === true;
  const permission = props.runtime.permissionState?.profile === "full-access"
    ? "authorized-edit"
    : props.runtime.permissionState?.profile === "auto-review"
      ? "candidate"
      : "read-only";
  const agentPermissionProfile = props.runtime.permissionState?.profile === "full-access"
    ? "proactive"
    : props.runtime.permissionState?.profile === "auto-review"
      ? "conservative"
      : "step-by-step";
  const operationId = (label: string) => `operation.tianyan-shell.${label}.${crypto.randomUUID()}`;

  useEffect(() => {
    if (contextRequest?.eventRefs?.length) setMode("agent");
  }, [contextRequest?.eventRefs?.length]);

  useEffect(() => {
    if (!props.agentAvailable) setMode("work");
  }, [props.agentAvailable]);

  useEffect(() => {
    const receive = (event: Event) => setPredictionRunning(Boolean((event as CustomEvent<{ running?: boolean }>).detail?.running));
    window.addEventListener("story-studio-prediction-agent-state", receive);
    return () => window.removeEventListener("story-studio-prediction-agent-state", receive);
  }, []);

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<TemporalProjectionRun>).detail;
      if (next?.projectId === project?.id) setTemporalProjectionRun(next);
    };
    const replay = (window as Window & { __storyStudioTemporalProjectionRun?: TemporalProjectionRun }).__storyStudioTemporalProjectionRun;
    if (replay && replay.projectId === project?.id) setTemporalProjectionRun(replay);
    window.addEventListener("story-studio-temporal-projection-run", receive);
    return () => window.removeEventListener("story-studio-temporal-projection-run", receive);
  }, [project?.id]);

  useEffect(() => {
    if (mode !== "agent" || !project) return;
    let active = true;
    void props.runtime.withConnection((token) => listTemporalProjectionRuns(project.id, token)).then((runs) => {
      if (!active) return;
      const current = runs.find((candidate) => candidate.status === "ready" && !candidate.stale) ?? runs[0] ?? null;
      setTemporalProjectionRun(current);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [mode, project, props.runtime]);

  useEffect(() => {
    if (!project || !props.runtime.tianyiConversationId) { setSession(null); return; }
    let active = true;
    void props.runtime.withConnection((token) => getTianyiSessionMetadata(project.id, props.runtime.tianyiConversationId!, token)).then((value) => {
      if (active) setSession(Array.isArray(value) ? value.find((item) => item.id === props.runtime.tianyiConversationId) ?? null : value);
    }).catch(() => { if (active) setSession(null); });
    return () => { active = false; };
  }, [project, props.runtime, props.runtime.tianyiConversationId]);

  useEffect(() => {
    if (!project || !props.runtime.tianyiConversationId) { setRun(null); return; }
    const key = tianyiAgentRunStorageKey(project.id, workVersionId, props.runtime.tianyiConversationId);
    const runId = props.runtime.activePageAgentRunId ?? window.sessionStorage.getItem(key);
    if (!runId) return;
    let active = true;
    void props.runtime.withConnection((token) => recoverTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: props.runtime.tianyiConversationId!, runId, token })).then((value) => {
      if (active) setRun(value);
    }).catch(() => { if (active) setRun(null); });
    return () => { active = false; };
  }, [project, props.runtime, props.runtime.activePageAgentRunId, props.runtime.tianyiConversationId, workVersionId]);

  const selectTask = (item: CapabilityMenuItem | null) => {
    setTask(item);
    if (item?.requiredMode === "agent") setMode("agent");
  };
  const ensureConversation = async () => {
    if (!project) throw new Error(t("tianyi.noActiveProject"));
    if (props.runtime.tianyiConversationId) return props.runtime.tianyiConversationId;
    const opened = await props.runtime.withConnection((token) => openTianyiSession(project.id, operationId("open-session"), token));
    props.runtime.setTianyiConversationId(opened.sessionId);
    return opened.sessionId;
  };
  const refreshSession = async (sessionId: string) => {
    if (!project) return;
    const value = await props.runtime.withConnection((token) => getTianyiSessionMetadata(project.id, sessionId, token));
    setSession(Array.isArray(value) ? value.find((item) => item.id === sessionId) ?? null : value);
  };
  const submitWork = () => void (async () => {
    if (!providerReady) {
      setError(t("tianyi.providerUnavailable"));
      return;
    }
    if (!props.runtime.workComposerDraft.trim() || !project || !contextRequest || !submitGate.tryEnter()) return;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureConversation();
      const selectedModelId = props.runtime.modelStatus?.profile.profile?.modelId;
      const profileId = props.runtime.modelStatus?.profiles.find((item) => item.modelId === selectedModelId)?.id;
      if (!profileId) throw new Error(t("tianyi.providerUnavailable"));
      const question = props.runtime.workComposerDraft.trim();
      const result = await props.runtime.withConnection((token) => streamTianyiGroundedAnswer({
        operationId: operationId("grounded-answer"),
        submissionId: operationId("grounded-submission"),
        profileId,
        question,
        contextRequest: {
          version: "story-tianyi-grounded-context-request/v1",
          projectId: project.id,
          sessionId,
          taskKind: "grounded-answer",
          accessMode: "author",
          subjectRef: null,
          sceneRef: null,
          explicitRefs: [],
          ...(contextRequest.eventRefs?.length ? { eventRefs: contextRequest.eventRefs } : {})
        },
        token
      }));
      if (result.status !== "current" || !result.answer) throw new Error(t("tianyi.actionFailed"));
      props.runtime.setWorkComposerDraft("");
      await refreshSession(sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed"));
    } finally { submitGate.leave(); setBusy(false); }
  })();
  const submitAgent = () => void (async () => {
    if (!providerReady) { setError(t("tianyi.providerUnavailable")); return; }
    if ((!props.runtime.pageAgentTaskDraft.trim() && !task) || !project || !contextRequest || !submitGate.tryEnter()) return;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureConversation();
      const taskText = [task ? t(task.labelKey as TranslationKey) : "", props.runtime.pageAgentTaskDraft.trim(), t(`tianyi.simulation.scopeTask.${scope}` as TranslationKey), t(`tianyi.simulation.freedomTask.${freedom}` as TranslationKey)].filter(Boolean).join("\n");
      const projection = await props.runtime.withConnection((token) => startTianyiAgentRun({ projectId: project.id, workVersionId, sessionId, task: taskText, currentPage: window.location.pathname, contextRequest, permissionProfile: agentPermissionProfile, operationId: operationId("agent-start"), token }));
      window.sessionStorage.setItem(tianyiAgentRunStorageKey(project.id, workVersionId, sessionId), projection.runId);
      props.runtime.setActivePageAgentRunId(projection.runId);
      setRun(projection); setTask(null); props.runtime.setPageAgentTaskDraft("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed")); }
    finally { submitGate.leave(); setBusy(false); }
  })();
  const selectPermission = (intent: "read-only" | "suggest" | "candidate" | "authorized-edit") => void (async () => {
    const profile = agentPermissionProfileForIntent(intent);
    if (!profile) return;
    setError("");
    try {
      await props.runtime.setPermissionProfile(profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed"));
    }
  })();
  const advanceRun = () => void (async () => {
    if (!project || !props.runtime.tianyiConversationId || !run || busy) return;
    setBusy(true); setError("");
    try {
      const awaiting = run.plan.find((step) => step.status === "awaiting_author");
      setStreamText("");
      const next = await props.runtime.withConnection((token) => {
        if (awaiting) return approveTianyiAgentStep({ projectId: project.id, workVersionId, sessionId: props.runtime.tianyiConversationId!, runId: run.runId, stepId: awaiting.stepId, operationId: operationId("agent-approve"), token });
        const controller = new AbortController();
        streamController.current = controller;
        return streamTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: props.runtime.tianyiConversationId!, runId: run.runId, operationId: operationId("agent-continue"), token, signal: controller.signal, onEvent(event) { if (event.type === "text-delta") setStreamText((current) => current + event.delta); } });
      });
      setRun(next);
    } catch (cause) { if (!stopping.current) setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed")); } finally { streamController.current = null; setBusy(false); }
  })();
  const rejectStep = () => void (async () => {
    const awaiting = currentTianyiAgentStep(run);
    if (!project || !props.runtime.tianyiConversationId || !run || !awaiting || busy) return;
    setBusy(true); setError("");
    try {
      setRun(await props.runtime.withConnection((token) => rejectTianyiAgentStep({ projectId: project.id, workVersionId, sessionId: props.runtime.tianyiConversationId!, runId: run.runId, stepId: awaiting.stepId, reason: t("tianyi.rejectNextStep"), operationId: operationId("agent-reject"), token })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed")); } finally { setBusy(false); }
  })();
  const stopRun = () => void (async () => {
    if (!project || !props.runtime.tianyiConversationId || !run) return;
    stopping.current = true;
    const activeStream = streamController.current;
    // Stop the in-flight stream before persisting cancellation so a late
    // streamed projection cannot overwrite the terminal cancelled state.
    activeStream?.abort();
    try {
      const cancelled = await props.runtime.withConnection((token) => cancelTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: props.runtime.tianyiConversationId!, runId: run.runId, reason: t("tianyi.stopRun"), operationId: operationId("agent-cancel"), token }));
      setRun(cancelled);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed"));
    } finally {
      stopping.current = false;
      streamController.current = null;
      setBusy(false);
    }
  })();
  const handoffCandidate = (candidateId: string) => void (async () => {
    if (!project || !props.runtime.tianyiConversationId || !run || busy) return;
    setBusy(true); setError("");
    try {
      setRun(await props.runtime.withConnection((token) => handoffTianyiAgentCandidate({ projectId: project.id, workVersionId, sessionId: props.runtime.tianyiConversationId!, runId: run.runId, candidateId, operationId: operationId("candidate-handoff"), token })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed")); } finally { setBusy(false); }
  })();
  const currentStep = currentTianyiAgentStep(run);
  const awaitingTool = currentStep?.toolName ? run?.toolCalls.find((tool) => tool.toolName === currentStep.toolName && tool.status !== "completed") ?? null : null;
  const simulationPack = run?.contextManifest?.simulationContextPack ?? null;
  const sourceCounts = simulationPack?.sources.reduce<Record<string, number>>((counts, source) => ({ ...counts, [source.sourceRole]: (counts[source.sourceRole] ?? 0) + 1 }), {}) ?? {};
  const runtimeContext = { page: props.pageLabel, selection: t("context.noneSelected"), referencedSources: simulationPack?.sources.length ?? contextRequest?.sourceRefs.length ?? 0, memoryState: "not-connected" as const, excludedScope: t("context.otherBranches"), usage: run ? String(simulationPack?.estimatedTokens ?? run.contextManifest?.estimatedTokens ?? 0) : null, budget: run ? String(run.budget.maxProviderCalls) : null };
  const agentRunning = predictionRunning || busy || Boolean(props.runtime.activePageAgentRunId) || Boolean(run && !["completed", "cancelled", "failed"].includes(run.status));
  const currentTemporalProjection = temporalProjectionRun && temporalProjectionRun.projectId === project?.id ? temporalProjectionRun : null;
  const temporalRunCard = currentTemporalProjection ? <section className={`tianyi-temporal-run-card is-${currentTemporalProjection.status}`} aria-label={t("tianyi.temporal.ready")}>
      <header><Clock3 aria-hidden="true" /><div><strong>{currentTemporalProjection.conflicts.length ? t("tianyi.temporal.conflict") : currentTemporalProjection.stale ? t("tianyi.temporal.stale") : t("tianyi.temporal.ready")}</strong><small>{t("tianyi.temporal.counts").replace("{placements}", String(currentTemporalProjection.placements.length)).replace("{conflicts}", String(currentTemporalProjection.conflicts.length))}</small></div></header>
      <p>{t("tianyi.temporal.readOnly")}</p>
      <details><summary>{t("tianyi.temporal.receipt")}</summary><dl><div><dt>{t("tianyi.temporal.run")}</dt><dd>{currentTemporalProjection.runId}</dd></div><div><dt>{t("tianyi.temporal.revision")}</dt><dd>{currentTemporalProjection.graphRevisionHash}</dd></div></dl></details>
    </section> : null;
  const generalAgentRun = <section className="tianyi-agent-stage tianyi-agent-compact" aria-label={t("tianyi.agent")}>
    <span>{t("tianyi.currentPage")}: {props.pageLabel}</span>
    {!providerReady ? <div className="tianyi-provider-unavailable" data-provider-state="unconfigured"><strong>{t("tianyi.providerUnavailableTitle")}</strong><p>{t("tianyi.providerUnavailable")}</p><button type="button" onClick={props.onOpenSettings}>{t("tianyi.openProviderSettings")}</button></div> : !run ? <><strong>{task ? t(task.labelKey as TranslationKey) : t("tianyi.chooseCapability")}</strong><p>{task ? t("tianyi.taskPrepared") : t("tianyi.agentEmpty")}</p></> : <>
      <div className="tianyi-agent-run-status"><strong>{run.task}</strong><span>{t("tianyi.agentStatus")}: {t(`tianyi.run.${run.status}` as TranslationKey)}</span></div>
      {busy ? <button type="button" className="tianyi-agent-confirm is-stop" onClick={stopRun}><Square />{t("tianyi.stopRun")}</button> : currentStep ? <section className="tianyi-agent-approval" aria-label={t("tianyi.toolApproval")}><strong>{t("tianyi.toolApproval")}</strong><dl><div><dt>{t("tianyi.toolName")}</dt><dd>{currentStep.toolName ?? currentStep.title}</dd></div><div><dt>{t("tianyi.toolImpact")}</dt><dd>{currentStep.classification === "proposal" ? t("tianyi.toolImpactProposal") : t("tianyi.toolImpactRead")}</dd></div>{awaitingTool && <div><dt>{t("tianyi.toolParameters")}</dt><dd>{Object.keys(awaitingTool.arguments).join("、") || t("context.noneSelected")}</dd></div>}</dl><div className="tianyi-agent-approval-actions"><button type="button" className="tianyi-agent-confirm" onClick={advanceRun}><Check />{t("tianyi.confirmNextStep")}</button><button type="button" className="tianyi-agent-reject" onClick={rejectStep}>{t("tianyi.rejectNextStep")}</button></div></section> : !["completed", "cancelled"].includes(run.status) && <button type="button" className="tianyi-agent-confirm" onClick={advanceRun}><ChevronRight />{run.status === "failed" ? t("tianyi.retryRun") : t("tianyi.continueRun")}</button>}
      {streamText && <p className="tianyi-agent-streaming" aria-live="polite"><LoaderCircle className={busy ? "is-spinning" : undefined} aria-hidden="true" />{streamText}</p>}
      {run.candidates.length > 0 && <section className="tianyi-agent-candidate-summary" data-simulation-candidate-review="true"><strong>{t("tianyi.candidateSummary")}</strong>{run.candidates.map((candidate) => <article key={candidate.candidateId}><span>{candidate.title}</span><p>{candidate.summary}</p><dl className="tianyi-simulation-candidate-sections"><div><dt>{t("tianyi.simulation.evidence")}</dt><dd>{simulationPack?.sources.filter((source) => source.sourceRole === "EVIDENCE" || source.sourceRole === "CONSTRAINT").map((source) => source.displayTitle).join("、") || t("tianyi.simulation.noEvidence")}</dd></div><div><dt>{t("tianyi.simulation.assumptions")}</dt><dd>{simulationPack?.intent === "DIVERGENCE" ? t("tianyi.simulation.divergence") : t("tianyi.simulation.noUpgrade")}</dd></div><div><dt>{t("tianyi.simulation.missing")}</dt><dd>{simulationPack?.sourceState === "READY" ? t("tianyi.simulation.ready") : t("tianyi.simulation.needAnchor")}</dd></div><div><dt>{t("tianyi.simulation.conflicts")}</dt><dd>{simulationPack?.sourceState === "CONFLICTED" ? t("tianyi.simulation.conflicted") : t("tianyi.simulation.noConflictDecision")}</dd></div><div><dt>{t("tianyi.simulation.impact")}</dt><dd>{candidate.targetOwnerKind === "relation-owner" ? t("tianyi.simulation.relationImpact") : t("tianyi.simulation.candidateImpact")}</dd></div></dl>{candidate.ownerReceipt ? <small>{t("tianyi.handedOff")}</small> : candidate.targetOwnerKind === "agent-recognition-proposal" ? <button type="button" disabled={busy} onClick={() => handoffCandidate(candidate.candidateId)}>{t("tianyi.handoffForReview")}</button> : <small>{t("tianyi.candidateOnly")}</small>}</article>)}</section>}
      <details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}><summary>{t("tianyi.runDetails")}</summary><dl><div><dt>{t("tianyi.sources")}</dt><dd>{run.contextManifest?.sourceRefs.length ?? 0}</dd></div><div><dt>{t("tianyi.receipts")}</dt><dd>{run.receipts.length}</dd></div><div><dt>{t("tianyi.runId")}</dt><dd>{run.runId}</dd></div></dl></details>
    </>}
  </section>;
  const agentComposer = <>
    <section className="tianyi-simulation-source-control" data-simulation-source-state={simulationPack?.sourceState ?? "PENDING"}>
      <button type="button" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>{t("tianyi.simulation.anchor").replace("{anchor}", String(sourceCounts.ANCHOR ?? 0)).replace("{evidence}", String(sourceCounts.EVIDENCE ?? 0)).replace("{constraint}", String(sourceCounts.CONSTRAINT ?? 0)).replace("{inspiration}", String(sourceCounts.INSPIRATION ?? 0))}<ChevronDown aria-hidden="true" /></button>
      <div className="tianyi-simulation-controls"><label>{t("tianyi.simulation.scope")}<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="nearby">{t("tianyi.simulation.scope.nearby")}</option><option value="line">{t("tianyi.simulation.scope.line")}</option><option value="selected">{t("tianyi.simulation.scope.selected")}</option></select></label><label>{t("tianyi.simulation.freedom")}<select value={freedom} onChange={(event) => setFreedom(event.target.value as typeof freedom)}><option value="strict">{t("tianyi.simulation.freedom.strict")}</option><option value="balanced">{t("tianyi.simulation.freedom.balanced")}</option><option value="free">{t("tianyi.simulation.freedom.free")}</option></select></label></div>
      {sourcesOpen && <div className="tianyi-simulation-source-drawer" aria-label={t("tianyi.sources")}><strong>{t("tianyi.simulation.snapshot")}</strong>{simulationPack ? <>{simulationPack.sources.map((source) => <article key={source.sourceId}><b>{source.sourceRole}</b><span>{source.displayTitle}</span><small>{t("tianyi.simulation.sent").replace("{authority}", source.authorityLevel)}</small></article>)}{simulationPack.omitted.map((source) => <article key={source.sourceId} data-source-omitted="true"><b>EXCLUDED</b><span>{source.sourceId}</span><small>{source.reason}</small></article>)}</> : <p>{t("tianyi.simulation.pendingSnapshot")}</p>}</div>}
    </section>
    <TianyiSidebarComposer workspace={props.workspace} task={task} draft={props.runtime.pageAgentTaskDraft} modelLabel={modelLabel} permission={permission} disabled={busy || !project || !contextRequest || !providerReady} submit={submitAgent} onPermission={selectPermission} onDraft={props.runtime.setPageAgentTaskDraft} onTask={selectTask} context={runtimeContext} />
  </>;
  return <aside className="tianyi-sidebar" aria-label={t("panel.globalTianyi")} data-tianyi-mode={mode} data-tianyi-conversation-id={props.runtime.tianyiConversationId ?? "not-started"} data-work-lane="shared" data-page-agent-session-owner="none" data-session-owner="story-continuity/session" data-knowledge-observer={contextRequest?.knowledgeView?.observerId ?? "author"}>
    <header className="tianyi-sidebar-header">
      <div className="tianyi-sidebar-heading"><Sparkles aria-hidden="true" /><strong>{t("space.tianyi")}</strong></div>
      <TianyiModeSwitch mode={mode} agentAvailable={props.agentAvailable} agentRunning={agentRunning} onMode={setMode} />
      <button type="button" aria-label={t("panel.closeGlobalTianyi")} title={t("panel.closeGlobalTianyi")} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <section className="tianyi-sidebar-stage">
      {contextRequest?.knowledgeView ? <p className="tianyi-knowledge-scope" data-testid="page-agent-knowledge-scope"><strong>{contextRequest.knowledgeView.observerLabel}</strong> · {t("tianyi.knowledgeScope")}{contextRequest.knowledgeView.hiddenEventCount ? `；${t("tianyi.knowledgeExcluded").replace("{count}", String(contextRequest.knowledgeView.hiddenEventCount))}` : ""}</p> : null}
      {mode === "work" ? <><TianyiAdoptionPanel runtime={props.runtime} compact /><TianyiWorkPanel projectReady={Boolean(project)} providerReady={providerReady} session={session} draft={props.runtime.workComposerDraft} busy={busy} error={error} pageAgentRunRetained={agentRunning} onDraft={props.runtime.setWorkComposerDraft} onSubmit={submitWork} onOpenSettings={props.onOpenSettings} onSwitchToAgent={() => setMode("agent")} /></> : <TianyiAgentPanel runtime={props.runtime} eventRefs={contextRequest?.eventRefs ?? []} sourceLabels={contextRequest?.predictionSourceLabels} sourceUnitSummary={contextRequest?.predictionSourceUnitSummary} temporalRun={temporalRunCard} generalRun={generalAgentRun} composer={agentComposer} error={error} />}
    </section>
  </aside>;
}
