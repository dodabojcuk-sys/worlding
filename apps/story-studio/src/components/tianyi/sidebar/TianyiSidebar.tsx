import { Check, ChevronRight, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TianyiContextualSpaceId } from "../../../../../../src/storyAgent/contextualCapabilityRegistry.ts";
import {
  getTianyiSessionMetadata,
  handoffTianyiAgentCandidate,
  openTianyiSession,
  recoverTianyiAgentRun,
  runTianyiQuestion,
  startTianyiAgentRun,
  approveTianyiAgentStep,
  streamTianyiAgentRun,
  type TianyiAgentRunProjection,
  type TianyiSessionMetadata
} from "../../../lib/localTransport";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { TianyiSidebarComposer } from "../composer/TianyiSidebarComposer";
import type { CapabilityMenuItem } from "../capability-launcher/capabilityMenuTypes";
import { TianyiModeSwitch, type TianyiSidebarMode } from "./TianyiModeSwitch";
import { agentPermissionProfileForIntent, createTianyiSubmitGate, currentTianyiAgentStep, tianyiAgentRunStorageKey } from "../tianyiAgentRunViewModel";

export function TianyiSidebar(props: {
  workspace: TianyiContextualSpaceId;
  pageLabel: string;
  runtime: TianyanShellRuntimeState;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<TianyiSidebarMode>("dialogue");
  const [task, setTask] = useState<CapabilityMenuItem | null>(null);
  const [session, setSession] = useState<TianyiSessionMetadata | null>(null);
  const [run, setRun] = useState<TianyiAgentRunProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const submitGate = useRef(createTianyiSubmitGate()).current;
  const project = props.runtime.project;
  const workVersionId = props.runtime.workVersionId ?? "work-version.unversioned";
  const contextRequest = useMemo(() => project ? {
    productMode: props.workspace === "nuwa" ? "intelligence" as const : "world" as const,
    activeOwner: { kind: "project" as const, id: project.id },
    selection: { documentId: null, objectId: null, timelinePointId: null },
    sourceRefs: [], memorySelections: [], enabledSkillRefs: []
  } : null, [project, props.workspace]);
  const modelLabel = useMemo(() => {
    const profile = props.runtime.modelStatus?.profile.profile;
    if (!profile?.enabled) return null;
    return props.runtime.modelStatus?.profiles.find((item) => item.modelId === profile.modelId)?.label ?? profile.modelId;
  }, [props.runtime.modelStatus]);
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
    if (!project || !props.runtime.sharedSessionId) { setSession(null); return; }
    let active = true;
    void props.runtime.withConnection((token) => getTianyiSessionMetadata(project.id, props.runtime.sharedSessionId, token)).then((value) => {
      if (active) setSession(Array.isArray(value) ? value.find((item) => item.id === props.runtime.sharedSessionId) ?? null : value);
    }).catch(() => { if (active) setSession(null); });
    return () => { active = false; };
  }, [project, props.runtime, props.runtime.sharedSessionId]);

  useEffect(() => {
    if (!project || !props.runtime.sharedSessionId) { setRun(null); return; }
    const key = tianyiAgentRunStorageKey(project.id, workVersionId, props.runtime.sharedSessionId);
    const runId = window.sessionStorage.getItem(key);
    if (!runId) return;
    let active = true;
    void props.runtime.withConnection((token) => recoverTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: props.runtime.sharedSessionId!, runId, token })).then((value) => {
      if (active) setRun(value);
    }).catch(() => { if (active) setRun(null); });
    return () => { active = false; };
  }, [project, props.runtime, props.runtime.sharedSessionId, workVersionId]);

  const selectTask = (item: CapabilityMenuItem | null) => {
    setTask(item);
    if (item?.requiredMode === "agent") setMode("agent");
  };
  const ensureSession = async () => {
    if (!project) throw new Error(t("tianyi.noActiveProject"));
    if (props.runtime.sharedSessionId) return props.runtime.sharedSessionId;
    const opened = await props.runtime.withConnection((token) => openTianyiSession(project.id, operationId("open-session"), token));
    props.runtime.setSharedSessionId(opened.sessionId);
    return opened.sessionId;
  };
  const refreshSession = async (sessionId: string) => {
    if (!project) return;
    const value = await props.runtime.withConnection((token) => getTianyiSessionMetadata(project.id, sessionId, token));
    setSession(Array.isArray(value) ? value.find((item) => item.id === sessionId) ?? null : value);
  };
  const submit = () => void (async () => {
    if ((!props.runtime.sharedDraft.trim() && !task) || !project || !contextRequest || !submitGate.tryEnter()) return;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureSession();
      if (mode === "dialogue") {
        await props.runtime.withConnection((token) => runTianyiQuestion({ projectId: project.id, sessionId, operationId: operationId("question"), request: { authorQuery: props.runtime.sharedDraft.trim() }, contextRequest, token }));
        props.runtime.setSharedDraft("");
        await refreshSession(sessionId);
      } else {
        const taskText = [task ? t(task.labelKey as TranslationKey) : "", props.runtime.sharedDraft.trim()].filter(Boolean).join("：");
        const projection = await props.runtime.withConnection((token) => startTianyiAgentRun({ projectId: project.id, workVersionId, sessionId, task: taskText, currentPage: window.location.pathname, contextRequest, permissionProfile: agentPermissionProfile, operationId: operationId("agent-start"), token }));
        window.sessionStorage.setItem(tianyiAgentRunStorageKey(project.id, workVersionId, sessionId), projection.runId);
        setRun(projection); setTask(null); props.runtime.setSharedDraft("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed"));
    } finally { submitGate.leave(); setBusy(false); }
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
    if (!project || !props.runtime.sharedSessionId || !run || busy) return;
    setBusy(true); setError("");
    try {
      const awaiting = run.plan.find((step) => step.status === "awaiting_author");
      const next = await props.runtime.withConnection((token) => awaiting
        ? approveTianyiAgentStep({ projectId: project.id, workVersionId, sessionId: props.runtime.sharedSessionId!, runId: run.runId, stepId: awaiting.stepId, operationId: operationId("agent-approve"), token })
        : streamTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: props.runtime.sharedSessionId!, runId: run.runId, operationId: operationId("agent-continue"), token, onEvent() {} }));
      setRun(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed")); } finally { setBusy(false); }
  })();
  const handoffCandidate = (candidateId: string) => void (async () => {
    if (!project || !props.runtime.sharedSessionId || !run || busy) return;
    setBusy(true); setError("");
    try {
      setRun(await props.runtime.withConnection((token) => handoffTianyiAgentCandidate({ projectId: project.id, workVersionId, sessionId: props.runtime.sharedSessionId!, runId: run.runId, candidateId, operationId: operationId("candidate-handoff"), token })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("tianyi.actionFailed")); } finally { setBusy(false); }
  })();
  const currentStep = currentTianyiAgentStep(run);
  const runtimeContext = { page: props.pageLabel, selection: t("context.noneSelected"), referencedSources: contextRequest?.sourceRefs.length ?? 0, memoryState: "not-connected" as const, excludedScope: t("context.otherBranches"), usage: run ? String(run.contextManifest?.estimatedTokens ?? 0) : null, budget: run ? String(run.budget.maxOutputTokens) : null };
  return <aside className="tianyi-sidebar" aria-label={t("panel.globalTianyi")} data-tianyi-mode={mode} data-shared-session-id={props.runtime.sharedSessionId ?? "not-started"} data-session-owner="story-continuity/session">
    <header className="tianyi-sidebar-header">
      <div className="tianyi-sidebar-heading"><Sparkles aria-hidden="true" /><strong>{t("space.tianyi")}</strong></div>
      <TianyiModeSwitch mode={mode} onMode={setMode} />
      <button type="button" aria-label={t("panel.closeGlobalTianyi")} title={t("panel.closeGlobalTianyi")} onClick={props.onClose}><X aria-hidden="true" /></button>
    </header>
    <section className="tianyi-sidebar-stage">
      {mode === "dialogue" ? <section className="tianyi-sidebar-conversation" aria-label={t("tianyi.sharedConversation")}>
        {session?.visibleMessages.length ? session.visibleMessages.map((message) => <article key={message.eventId} className={`tianyi-sidebar-message is-${message.actor}`}><small>{message.actor === "author" ? t("tianyi.author") : t("space.tianyi")}</small><p>{message.visibleContent}</p></article>) : <div className="tianyi-sidebar-empty"><Sparkles aria-hidden="true" /><strong>{t("tianyi.sharedConversation")}</strong><p>{project ? t("tianyi.conversationReady") : t("tianyi.noActiveProject")}</p><small>{t("tianyi.sessionUnchanged")}</small></div>}
      </section> : <section className="tianyi-agent-stage tianyi-agent-compact" aria-label={t("tianyi.agent")}>
        <span>{t("tianyi.currentPage")}: {props.pageLabel}</span>
        {!run ? <><strong>{task ? t(task.labelKey as TranslationKey) : t("tianyi.chooseCapability")}</strong><p>{task ? t("tianyi.taskPrepared") : t("tianyi.agentEmpty")}</p></> : <>
          <div className="tianyi-agent-run-status"><strong>{run.task}</strong><span>{t("tianyi.agentStatus")}: {t(`tianyi.run.${run.status}` as TranslationKey)}</span></div>
          {currentStep && <button type="button" className="tianyi-agent-confirm" disabled={busy} onClick={advanceRun}>{busy ? <LoaderCircle className="is-spinning" /> : <Check />}{t("tianyi.confirmNextStep")}: {currentStep.title}</button>}
          {!currentStep && !["completed", "cancelled"].includes(run.status) && <button type="button" className="tianyi-agent-confirm" disabled={busy} onClick={advanceRun}>{busy ? <LoaderCircle className="is-spinning" /> : <ChevronRight />}{t("tianyi.continueRun")}</button>}
          {run.candidates.length > 0 && <section className="tianyi-agent-candidate-summary"><strong>{t("tianyi.candidateSummary")}</strong>{run.candidates.map((candidate) => <article key={candidate.candidateId}><span>{candidate.title}</span>{candidate.ownerReceipt ? <small>{t("tianyi.handedOff")}</small> : candidate.targetOwnerKind === "agent-recognition-proposal" ? <button type="button" disabled={busy} onClick={() => handoffCandidate(candidate.candidateId)}>{t("tianyi.handoffForReview")}</button> : <small>{t("tianyi.candidateOnly")}</small>}</article>)}</section>}
          <details open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}><summary>{t("tianyi.runDetails")}</summary><dl><div><dt>{t("tianyi.sources")}</dt><dd>{run.contextManifest?.sourceRefs.length ?? 0}</dd></div><div><dt>{t("tianyi.receipts")}</dt><dd>{run.receipts.length}</dd></div><div><dt>{t("tianyi.runId")}</dt><dd>{run.runId}</dd></div></dl></details>
        </>}
      </section>}
      {error && <p className="tianyi-error" role="alert">{error}</p>}
    </section>
    <TianyiSidebarComposer
      workspace={props.workspace}
      task={task}
      draft={props.runtime.sharedDraft}
      modelLabel={modelLabel}
      permission={permission}
      disabled={busy || !project || !contextRequest}
      submit={submit}
      onPermission={selectPermission}
      onDraft={props.runtime.setSharedDraft}
      onTask={selectTask}
      context={runtimeContext}
    />
  </aside>;
}
