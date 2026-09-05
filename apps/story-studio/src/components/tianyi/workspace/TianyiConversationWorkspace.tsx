import { ArrowRight, BookOpen, CircleStop, FilePlus2, History, Link2, LoaderCircle, MessageSquareText, Paperclip, RotateCcw, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  captureTianyiCreativeAuthorSource,
  cancelTianyiAgentRun,
  continueTianyiAgentRun,
  decideTianyiStoryIntakeCandidate,
  decideTianyiCreativeCandidate,
  extractTianyiCreativeProjection,
  getTianyiCreativeProjection,
  getLatestTianyiStoryIntakeRun,
  getTianyiSessionMetadata,
  handoffTianyiCreativeCandidate,
  openTianyiSession,
  recoverTianyiAgentRun,
  startTianyiAgentRun,
  streamTianyiAgentRun,
  streamTianyiGroundedAnswer,
  type StoryIntakeLifecycleStatusProjection,
  type TianyiAgentRunProjection,
  type TianyiCreativeProjection,
  type TianyiSessionMetadata
} from "../../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";
import { StoryIntakeReviewSurface } from "./StoryIntakeReviewSurface";
import { StoryIntakeWorkSurface } from "./StoryIntakeWorkSurface";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { tianyiStoryIntakeRunStorageKey } from "../../../product-shell/runtime/tianyiShellSessionRecovery";
import {
  createActiveStoryIntakeCandidateRef,
  filterStoryIntakeSelection,
  parseActiveStoryIntakeCandidateRef,
  resolveActiveStoryIntakeCandidate,
  selectStoryIntakeCandidateScope,
  serializeActiveStoryIntakeCandidateRef,
  storyIntakeCandidateRefStorageKey,
  storyIntakeRecoveryMessage,
  storyIntakeSelectionStorageKey,
  type ActiveStoryIntakeCandidateRef
} from "./storyIntakeWorkspaceState";

type Lane = "creative" | "review" | "work";

export function TianyiConversationWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const { runtime } = props;
  const { t } = useI18n();
  const project = runtime.project;
  const [lane, setLane] = useState<Lane>(() => requestedLane());
  const [projection, setProjection] = useState<TianyiCreativeProjection | null>(null);
  const [metadata, setMetadata] = useState<TianyiSessionMetadata | null>(null);
  const [intakeRun, setIntakeRun] = useState<TianyiAgentRunProjection | null>(null);
  const [intakeStreamText, setIntakeStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeIntakeRef, setActiveIntakeRef] = useState<ActiveStoryIntakeCandidateRef | null>(null);
  const [selectedIntakeCandidateIds, setSelectedIntakeCandidateIds] = useState<string[]>([]);
  const intakeAbort = useRef<AbortController | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const legacyFixture = new URLSearchParams(window.location.search).get("testFixture") === "legacy-three-candidates";
  const workVersionId = runtime.workVersionId ?? "work-version.unversioned";
  const dialogueRuntime = runtime.modelStatus?.tianyiDialogue.runtime ?? "unavailable";

  useEffect(() => {
    intakeAbort.current?.abort();
    setProjection(null);
    setMetadata(null);
    setIntakeRun(null);
    setIntakeStreamText("");
    setActiveIntakeRef(null);
    setSelectedIntakeCandidateIds([]);
    setError("");
  }, [project?.id]);

  useEffect(() => {
    const restoreRequestedLane = () => {
      if (window.location.pathname === "/tianyi") setLane(requestedLane());
    };
    restoreRequestedLane();
    window.addEventListener("popstate", restoreRequestedLane);
    window.addEventListener("tianyan-location-change", restoreRequestedLane);
    return () => {
      window.removeEventListener("popstate", restoreRequestedLane);
      window.removeEventListener("tianyan-location-change", restoreRequestedLane);
    };
  }, []);

  const operationId = (label: string) => `operation.tianyi.${label}.${crypto.randomUUID()}`;
  const scrollTarget = (targetLane: Lane) => workspaceRef.current?.querySelector<HTMLElement>(targetLane === "creative" ? ".tianyi-conversation-column" : targetLane === "review" ? ".story-intake-ledger" : ".story-intake-arrangement") ?? null;
  const scrollStorageKey = (targetLane: Lane) => `tianyi-lane-scroll:${project?.id ?? "no-project"}:${runtime.tianyiConversationId ?? intakeRun?.sessionId ?? "no-session"}:${targetLane}`;
  const saveLaneScroll = (targetLane: Lane) => {
    const target = scrollTarget(targetLane);
    if (target) window.sessionStorage.setItem(scrollStorageKey(targetLane), String(Math.max(0, Math.round(target.scrollTop))));
  };
  const changeLane = (nextLane: Lane) => {
    saveLaneScroll(lane);
    setLane(nextLane);
    const url = new URL(window.location.href);
    url.searchParams.set("tianyiLane", nextLane);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = scrollTarget(lane);
      if (!target) return;
      const stored = Number(window.sessionStorage.getItem(scrollStorageKey(lane)) ?? 0);
      if (Number.isFinite(stored)) target.scrollTop = stored;
      const persist = () => window.sessionStorage.setItem(scrollStorageKey(lane), String(Math.max(0, Math.round(target.scrollTop))));
      target.addEventListener("scroll", persist, { passive: true });
      (target as HTMLElement & { __tianyiScrollCleanup?: () => void }).__tianyiScrollCleanup = () => target.removeEventListener("scroll", persist);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      const target = scrollTarget(lane) as (HTMLElement & { __tianyiScrollCleanup?: () => void }) | null;
      target?.__tianyiScrollCleanup?.();
      saveLaneScroll(lane);
    };
  }, [lane, project?.id, runtime.tianyiConversationId, intakeRun?.runId]);

  const persistIntakeRef = useCallback((ref: ActiveStoryIntakeCandidateRef | null) => {
    setActiveIntakeRef(ref);
    const sessionId = ref?.sessionId ?? runtime.tianyiConversationId;
    if (!project || !sessionId) return;
    const key = storyIntakeCandidateRefStorageKey(project.id, sessionId);
    if (ref) window.sessionStorage.setItem(key, serializeActiveStoryIntakeCandidateRef(ref));
    else window.sessionStorage.removeItem(key);
  }, [project, runtime.tianyiConversationId]);
  const ensureConversation = useCallback(async () => {
    if (!project) throw new Error(t("tianyi.workspace.noProject"));
    if (runtime.tianyiConversationId) return runtime.tianyiConversationId;
    const recoveredSessionId = intakeRun?.storyIntakeEnvelope?.sessionId;
    if (recoveredSessionId) {
      runtime.setTianyiConversationId(recoveredSessionId);
      return recoveredSessionId;
    }
    const opened = await runtime.withConnection((token) => openTianyiSession(project.id, operationId("open"), token));
    runtime.setTianyiConversationId(opened.sessionId);
    return opened.sessionId;
  }, [intakeRun?.storyIntakeEnvelope?.sessionId, project, runtime, t]);

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
    if (!project || runtime.tianyiConversationId || !runtime.workVersionId) return;
    let active = true;
    void runtime.withConnection((token) => getLatestTianyiStoryIntakeRun({ projectId: project.id, workVersionId: runtime.workVersionId!, token })).then((recovered) => {
      if (!active || !recovered?.storyIntakeEnvelope) return;
      if (recovered.projectId !== project.id || recovered.workVersionId !== runtime.workVersionId || recovered.sessionId !== recovered.storyIntakeEnvelope.sessionId || recovered.runId !== recovered.storyIntakeEnvelope.runId) return;
      window.sessionStorage.setItem(tianyiStoryIntakeRunStorageKey(project.id, recovered.workVersionId, recovered.sessionId), recovered.runId);
      setIntakeRun(recovered);
      runtime.setTianyiConversationId(recovered.sessionId);
      setError("");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [project, runtime, runtime.tianyiConversationId, runtime.workVersionId]);

  useEffect(() => {
    const sessionId = runtime.tianyiConversationId;
    if (!sessionId || !project) return;
    let active = true;
    const runId = window.sessionStorage.getItem(tianyiStoryIntakeRunStorageKey(project.id, workVersionId, sessionId));
    if (!runId) {
      if (lane !== "creative") setError("未找到可恢复的候选批次；原文仍保留，请回到创意重新整理。");
      return;
    }
    void runtime.withConnection((token) => recoverTianyiAgentRun({ projectId: project.id, workVersionId, sessionId, runId, token })).then((next) => {
      if (!active) return;
      setIntakeRun(next);
      if (!next?.storyIntakeEnvelope) {
        if (lane !== "creative") setError("候选批次已丢失或尚未完成；未写入任何内容，请回到创意恢复。");
        return;
      }
      setError("");
      const envelope = next.storyIntakeEnvelope;
      const restoredRef = parseActiveStoryIntakeCandidateRef(window.sessionStorage.getItem(storyIntakeCandidateRefStorageKey(project.id, sessionId)), project.id);
      const requestedCandidateId = new URLSearchParams(window.location.search).get("tianyiCandidate");
      const requestedCandidate = requestedCandidateId ? envelope.candidates.find((candidate) => candidate.candidateId === requestedCandidateId) : null;
      if (requestedCandidate) {
        const requestedRef = createActiveStoryIntakeCandidateRef(envelope, requestedCandidate.candidateId);
        setActiveIntakeRef(requestedRef);
        window.sessionStorage.setItem(storyIntakeCandidateRefStorageKey(project.id, sessionId), serializeActiveStoryIntakeCandidateRef(requestedRef));
      } else if (restoredRef) setActiveIntakeRef(restoredRef);
      const selectionKey = storyIntakeSelectionStorageKey(project.id, sessionId, runId);
      try {
        const storedIds = JSON.parse(window.sessionStorage.getItem(selectionKey) ?? "[]") as unknown;
        if (Array.isArray(storedIds)) {
          const valid = storedIds.filter((id): id is string => typeof id === "string" && envelope.candidates.some((candidate) => candidate.candidateId === id));
          setSelectedIntakeCandidateIds(valid.length ? valid : requestedCandidate ? [requestedCandidate.candidateId] : []);
        }
      } catch { setSelectedIntakeCandidateIds([]); }
    }).catch((cause) => { if (active && lane !== "creative") setError(cause instanceof Error ? cause.message : "候选批次恢复失败。"); });
    return () => { active = false; };
  }, [project, runtime, runtime.tianyiConversationId, workVersionId]);

  useEffect(() => {
    const envelope = intakeRun?.storyIntakeEnvelope;
    if (!envelope || !project) return;
    const selectionKey = storyIntakeSelectionStorageKey(project.id, envelope.sessionId, envelope.runId);
    try {
      const storedIds = JSON.parse(window.sessionStorage.getItem(selectionKey) ?? "[]") as unknown;
      setSelectedIntakeCandidateIds(Array.isArray(storedIds)
        ? filterStoryIntakeSelection(envelope, storedIds.filter((id): id is string => typeof id === "string"))
        : []);
    } catch { setSelectedIntakeCandidateIds([]); }
  }, [intakeRun?.runId, intakeRun?.storyIntakeEnvelope?.envelopeId, project]);

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
    if (next.storyIntakeEnvelope) {
      window.dispatchEvent(new Event("story-studio-pending-review-changed"));
      changeLane("review");
    }
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

  const submitConversation = async (conversationLane: "creative" | "work") => {
    const text = (conversationLane === "creative" ? runtime.creativeComposerDraft : runtime.workComposerDraft).trim();
    if (!text || !project || busy) return;
    setBusy(true); setError("");
    try {
      if (dialogueRuntime === "unavailable") throw new Error("当前没有可用的真实 Provider；草稿仍保留，未发送也未生成本地假回复。");
      const sessionId = await ensureConversation();
      const selectedModelId = runtime.modelStatus?.profile.profile?.modelId;
      const profileId = runtime.modelStatus?.profiles.find((item) => item.modelId === selectedModelId)?.id;
      const localFakeRuntime = dialogueRuntime === "local-fake";
      if (dialogueRuntime === "provider" && runtime.modelStatus?.tianyiDialogue.ready && profileId) {
        const result = await runtime.withConnection((token) => streamTianyiGroundedAnswer({
          operationId: operationId("conversation.answer"),
          submissionId: operationId("conversation.submission"),
          profileId,
          question: text,
          contextRequest: {
            version: "story-tianyi-grounded-context-request/v1",
            projectId: project.id,
            sessionId,
            taskKind: "grounded-answer",
            accessMode: "author",
            subjectRef: null,
            sceneRef: null,
            explicitRefs: []
          },
          token
        }));
        if (result.status !== "current" || !result.answer) throw new Error("天意回答未完整落盘；已保留原问题，可按回执重试。");
      } else if (localFakeRuntime) {
        const captured = await runtime.withConnection((token) => captureTianyiCreativeAuthorSource({
          projectId: project.id,
          sessionId,
          operationId: operationId("conversation.local.capture"),
          submissionId: operationId("conversation.local.submission"),
          text,
          collaborate: false,
          token
        }));
        const scopeTitles = selectedIntakeCandidates.map((candidate) => candidate.proposedName ?? candidate.proposedTitle).filter(Boolean).slice(0, 4);
        await runtime.withConnection((token) => extractTianyiCreativeProjection({
          projectId: project.id,
          sessionId,
          operationId: operationId("conversation.local.reply"),
          source: captured.source,
          fixture: localConversationFixture(text, project.title, scopeTitles),
          token
        }));
      } else throw new Error("当前没有可用的真实 Provider；草稿仍保留，未发送也未生成本地假回复。");
      if (conversationLane === "creative") runtime.setCreativeComposerDraft("");
      else runtime.setWorkComposerDraft("");
      await refresh(sessionId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "对话失败；草稿与已有候选仍然保留。"); }
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
      window.dispatchEvent(new Event("story-studio-pending-review-changed"));
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

  const focusIntakeCandidate = (candidateId: string) => {
    const envelope = intakeRun?.storyIntakeEnvelope;
    if (!envelope) return;
    const ref = createActiveStoryIntakeCandidateRef(envelope, candidateId);
    persistIntakeRef(ref);
    runtime.setActiveTianyiCandidateId(null);
  };

  const toggleIntakeCandidate = (candidateId: string) => {
    const envelope = intakeRun?.storyIntakeEnvelope;
    if (!envelope || !project) return;
    setSelectedIntakeCandidateIds((current) => {
      const validCurrent = filterStoryIntakeSelection(envelope, current);
      const next = validCurrent.includes(candidateId)
        ? validCurrent.filter((id) => id !== candidateId)
        : [...validCurrent, candidateId];
      window.sessionStorage.setItem(storyIntakeSelectionStorageKey(project.id, envelope.sessionId, envelope.runId), JSON.stringify(next));
      return next;
    });
    focusIntakeCandidate(candidateId);
  };

  const moveIntakeCandidatesToWork = (candidateIds: readonly string[]) => {
    const envelope = intakeRun?.storyIntakeEnvelope;
    if (!envelope || !project) return;
    const candidates = selectStoryIntakeCandidateScope(envelope, candidateIds);
    const ids = candidates.map((candidate) => candidate.candidateId);
    const ref = createActiveStoryIntakeCandidateRef(envelope, ids[0]!);
    setSelectedIntakeCandidateIds(ids);
    window.sessionStorage.setItem(storyIntakeSelectionStorageKey(project.id, envelope.sessionId, envelope.runId), JSON.stringify(ids));
    persistIntakeRef(ref);
    runtime.setActiveTianyiCandidateId(null);
    changeLane("work");
  };

  const openEventLine = () => {
    if (intakeRun?.storyIntakeEnvelope) {
      // Envelope references are owned by the Story Intake Review/Work surface.
      // Clearing the legacy candidate slot prevents EventLine from querying the
      // separate CreativeProjection repository for an Envelope candidate ID.
      runtime.setActiveTianyiCandidateId(null);
      window.history.pushState({}, "", "/event-line");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    const sessionId = intakeRun?.storyIntakeEnvelope?.sessionId ?? runtime.tianyiConversationId;
    const candidateId = activeIntakeRef?.candidateId ?? runtime.activeTianyiCandidateId;
    if (!sessionId || !candidateId) return;
    const params = new URLSearchParams({ tianyiSession: sessionId, tianyiCandidate: candidateId });
    window.history.pushState({}, "", `/event-line?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const activeLegacyCandidate = useMemo(() => projection?.candidates.find((item) => item.candidateId === runtime.activeTianyiCandidateId) ?? null, [projection, runtime.activeTianyiCandidateId]);
  const activeIntakeResolution = useMemo(() => {
    const envelope = intakeRun?.storyIntakeEnvelope;
    if (!project || !envelope || !activeIntakeRef) return null;
    return resolveActiveStoryIntakeCandidate({ projectId: project.id, workVersionId, sessionId: envelope.sessionId, envelope, ref: activeIntakeRef });
  }, [activeIntakeRef, intakeRun, project, workVersionId]);
  const activeIntakeCandidate = activeIntakeResolution?.status === "ready" ? activeIntakeResolution.candidate : null;
  const selectedIntakeCandidates = useMemo(() => {
    const envelope = intakeRun?.storyIntakeEnvelope;
    if (!envelope) return [];
    try { return selectStoryIntakeCandidateScope(envelope, selectedIntakeCandidateIds.length ? selectedIntakeCandidateIds : activeIntakeCandidate ? [activeIntakeCandidate.candidateId] : []); }
    catch { return activeIntakeCandidate ? [activeIntakeCandidate] : []; }
  }, [activeIntakeCandidate, intakeRun, selectedIntakeCandidateIds]);
  const draft = lane === "creative" ? runtime.creativeComposerDraft : runtime.workComposerDraft;
  const setDraft = lane === "creative" ? runtime.setCreativeComposerDraft : runtime.setWorkComposerDraft;
  const intakeCandidateCount = intakeRun?.storyIntakeEnvelope?.candidates.length ?? projection?.candidates.length ?? 0;
  const task = lane === "creative"
    ? { eyebrow: "连续创作", title: "保留原话，和天意一起展开故事", detail: runtime.tianyiConversationId ? `当前对话已保存 · ${intakeCandidateCount ? `已有 ${intakeCandidateCount} 项候选` : "可随时整理候选"}` : "从一段真实故事内容开始" }
    : lane === "review"
      ? { eyebrow: "候选审阅", title: `连续阅读并处理 ${intakeCandidateCount} 项候选`, detail: t("tianyi.workspace.continuity") }
      : { eyebrow: "候选工作", title: `编排当前 ${selectedIntakeCandidates.length} 项，再决定是否采纳`, detail: "先看结构化影响；只有明确范围会交给既有 Owner" };

  if (!project) return <main className="shell-workspace tianyi-workspace"><section className="tianyi-workspace-empty"><Sparkles /><h1>{t("space.tianyi")}</h1><p>{t("tianyi.workspace.noProject")}</p></section></main>;

  return <main ref={workspaceRef} className="shell-workspace tianyi-workspace" aria-label={t("tianyi.workspaceLabel")} data-tianyi-conversation-id={runtime.tianyiConversationId ?? intakeRun?.storyIntakeEnvelope?.sessionId ?? "not-started"} data-active-lane={lane}>
    <header className="tianyi-workspace-header">
          <div><small>作者工作台</small><h1>天意</h1></div>
      <div className="tianyi-lane-switch" role="tablist" aria-label={t("tianyi.workspace.modeLabel")}>
        <button type="button" role="tab" aria-selected={lane === "creative"} onClick={() => changeLane("creative")}><span>{t("tianyi.workspace.creativeMode")}</span><small>展开想法</small></button>
        <button type="button" role="tab" aria-selected={lane === "review"} disabled={!intakeRun?.storyIntakeEnvelope} onClick={() => changeLane("review")}><span>审阅</span><small>把关取舍</small></button>
        <button type="button" role="tab" aria-selected={lane === "work"} disabled={!activeIntakeRef && !activeLegacyCandidate && selectedIntakeCandidateIds.length === 0} onClick={() => activeIntakeRef || activeLegacyCandidate ? changeLane("work") : moveIntakeCandidatesToWork(selectedIntakeCandidateIds)}><span>{t("tianyi.workspace.workMode")}</span><small>推进落地</small></button>
      </div>
      <button type="button" className="tianyi-conversation-anchor" onClick={() => changeLane("creative")} aria-current={lane === "creative" ? "page" : undefined}><History /><span>{lane === "creative" ? "当前长对话" : "返回长对话"}</span><small>草稿与来源保持</small></button>
    </header>

    <section className="tianyi-task-header" aria-label="当前任务">
      <div><small>{task.eyebrow}</small><h2>{task.title}</h2><p>{task.detail}</p></div>
      <div className="tianyi-task-status"><span>{project.title}</span><span>{runtime.workVersionLabel ?? "当前主线"}</span>{intakeRun?.storyIntakeEnvelope ? <span>批次已恢复</span> : null}</div>
    </section>

    <div className="tianyi-workspace-body" data-full-work-surface={lane !== "creative"}>
      <section className="tianyi-conversation-column">
        {lane === "creative" ? <section className="tianyi-visible-history" aria-label={t("tianyi.workspace.historyLabel")}>
          {metadata?.visibleMessages.length ? metadata.visibleMessages.map((message) => <article key={message.eventId} className={`is-${message.actor}`}><span>{message.actor === "author" ? t("tianyi.author") : t("space.tianyi")}</span><p>{message.visibleContent}</p></article>) : <div className="tianyi-conversation-welcome"><Sparkles /><h2>{t("tianyi.workspace.welcomeTitle")}</h2><p>{t("tianyi.workspace.welcomeBody")}</p><small>{t("tianyi.workspace.localOnly")}</small></div>}
        </section> : null}

        {lane === "creative" ? <section className="tianyi-lane-stage" aria-label={t("tianyi.workspace.creativeMode")}>
          <div className="tianyi-stage-heading"><div><small>CREATIVE LANE</small><h2>{t("tianyi.workspace.creativeTitle")}</h2></div><span>{t("tianyi.workspace.creativeGuide")}</span></div>
          {legacyFixture ? <p className="tianyi-fixture-notice" role="status">测试夹具模式 · 固定三候选不是 AI 识别结果</p> : null}
          {!legacyFixture && intakeRun ? <section className="tianyi-intake-run" data-story-intake-status={intakeRun.status} aria-label="Story Intake 运行">
            <header><div><strong>Story Intake</strong><p>{storyIntakeStatusLabel(intakeRun)}</p></div><span>{storyIntakeRuntimeLabel(intakeRun)}</span></header>
            {intakeRun.status === "running" ? <div className="tianyi-intake-progress"><LoaderCircle className="is-spinning" /><span>正在识别人物、物品、地点、事件与故事路径……</span><button type="button" onClick={stopStoryIntake}><CircleStop />停止</button></div> : null}
            {intakeStreamText ? <p className="tianyi-intake-explanation">{intakeStreamText}</p> : null}
            {intakeRun.error ? <div className="tianyi-intake-failure" role="alert"><p>{intakeRun.error.message}</p>{intakeRun.error.retryable ? <button type="button" onClick={retryStoryIntake}><RotateCcw />重试</button> : null}</div> : null}
            {intakeRun.storyIntakeEnvelope ? <>
              <div className="tianyi-intake-boundary"><span>Canon 写入 0 · 已确认资料对象 {intakeRun.storyIntakeEnvelope.formalStoryWrites}</span><span>基于 {intakeRun.storyIntakeEnvelope.baseVersion.workVersionId}@r{intakeRun.storyIntakeEnvelope.baseVersion.revision}</span></div>
              <div className="tianyi-intake-ready"><div><strong>{intakeRun.storyIntakeEnvelope.candidates.length} 项故事候选已准备好</strong><p>原文、来源和候选状态已保留；进入审阅不会写入正式故事。</p></div><button type="button" className="primary-action" onClick={() => changeLane("review")}>审阅这批候选<ArrowRight /></button></div>
              <details className="tianyi-intake-runtime-details"><summary>来源与运行诊断</summary><dl className="tianyi-intake-runtime-audit" aria-label="Pi 运行回执"><div><dt>请求</dt><dd>{intakeRun.executionIdentity.requestedProviderId ?? "unknown"} / {intakeRun.executionIdentity.requestedModelId ?? "unknown"}</dd></div><div><dt>响应模型</dt><dd>{intakeRun.executionIdentity.responseModelId ?? "unknown"}</dd></div><div><dt>Run / Step</dt><dd>{intakeRun.executionIdentity.runId} / {intakeRun.executionIdentity.stepId ?? "unknown"}</dd></div><div><dt>耗时</dt><dd>{intakeRun.observability.latencyMs === null ? "unknown" : `${intakeRun.observability.latencyMs} ms`}</dd></div><div><dt>Token</dt><dd>{intakeRun.observability.totalTokens === null ? "unknown" : intakeRun.observability.totalTokens}</dd></div><div><dt>失败码</dt><dd>{intakeRun.error?.code ?? "none"}</dd></div></dl></details>
            </> : null}
          </section> : null}
          {projection?.summary ? <article className="tianyi-summary-card"><strong>{t("tianyi.workspace.summary")}</strong><p>{projection.summary}</p><small>{t("tianyi.workspace.source")}: {projection.summarySourceRefs[0]?.eventId.slice(0, 12)} · {t(projection.summaryState === "current" ? "tianyi.workspace.currentVersion" : "tianyi.workspace.refreshSummary")}</small></article> : null}
          {legacyFixture && projection?.candidates.length ? <div className="tianyi-candidate-grid" aria-label={t("tianyi.workspace.candidateRegistry")}>{projection.candidates.map((candidate, index) => <article key={candidate.candidateId} data-candidate-state={candidate.state}><header><span>{t("tianyi.workspace.direction")} {index + 1}</span><small>{t(candidate.state === "deferred" ? "tianyi.workspace.preserved" : candidate.state === "handed-off" ? "tianyi.workspace.handedOff" : "tianyi.workspace.candidate")}</small></header><h3>{candidate.title}</h3><p>{candidate.summary}</p><small>{candidate.uncertainties.join(" · ")}</small><footer>{candidate.state === "pending" ? <><button type="button" onClick={() => preserveCandidate(candidate.candidateId)}>{t("tianyi.workspace.preserve")}</button><button type="button" className="primary-action" onClick={() => moveCandidateToWork(candidate.candidateId)}>{t("tianyi.workspace.enterWork")}<ArrowRight /></button></> : candidate.state === "handed-off" ? <button type="button" onClick={() => { runtime.setActiveTianyiCandidateId(candidate.candidateId); changeLane("work"); }}>{t("tianyi.workspace.continueWork")}</button> : <span>{t("tianyi.workspace.restoreHint")}</span>}</footer></article>)}</div> : null}
        </section> : lane === "review" && intakeRun?.storyIntakeEnvelope ? <StoryIntakeReviewSurface
          run={intakeRun}
          selectedCandidateIds={selectedIntakeCandidateIds}
          focusedCandidateId={activeIntakeCandidate?.candidateId ?? intakeRun.storyIntakeEnvelope.candidates[0]?.candidateId ?? null}
          busy={busy}
          onToggle={toggleIntakeCandidate}
          onFocus={focusIntakeCandidate}
          onEnterWork={moveIntakeCandidatesToWork}
          onDecision={decideIntakeCandidate}
          onBackToConversation={() => changeLane("creative")}
        /> : <section className="tianyi-lane-stage" aria-label={t("tianyi.workspace.workMode")}>
          {activeIntakeCandidate && intakeRun?.storyIntakeEnvelope ? <StoryIntakeWorkSurface
            runtime={runtime}
            run={intakeRun}
            candidates={selectedIntakeCandidates}
            activeCandidate={activeIntakeCandidate}
            conversationMessages={metadata?.visibleMessages ?? []}
            conversationBusy={busy}
            conversationRuntimeLabel={dialogueRuntime === "local-fake" ? "本地假服务 · 非真实 Pi" : dialogueRuntime === "provider" ? "已配置 Provider · 仅在明确发送时调用" : "当前没有可用的真实 Provider · 发送将保留草稿并停止"}
            onBackToReview={() => changeLane("review")}
            onOpenEventLine={openEventLine}
            onRunChanged={(next) => { setIntakeRun(next); window.dispatchEvent(new Event("story-studio-pending-review-changed")); }}
            onSendConversation={() => void submitConversation("work")}
            onIncludeCandidate={(candidateId) => toggleIntakeCandidate(candidateId)}
            onLocateCandidate={(candidateId) => { focusIntakeCandidate(candidateId); changeLane("review"); }}
          /> : activeIntakeResolution ? <div className="story-intake-recovery" role="alert"><strong>无法恢复原候选</strong><p>{storyIntakeRecoveryMessage(activeIntakeResolution.status)}</p><button type="button" onClick={() => changeLane("review")}>返回当前批次审阅</button></div> : <>
            <div className="tianyi-stage-heading"><div><small>WORK LANE</small><h2>{activeLegacyCandidate?.title ?? t("tianyi.workspace.chooseCandidate")}</h2></div><span>{t("tianyi.workspace.workGuide")}</span></div>
            <div className="tianyi-work-contract"><dl><div><dt>{t("tianyi.workspace.workTarget")}</dt><dd>{activeLegacyCandidate?.summary ?? t("tianyi.workspace.chooseFromRegistry")}</dd></div><div><dt>{t("tianyi.workspace.targetStory")}</dt><dd>{project.title}</dd></div><div><dt>{t("tianyi.workspace.baseVersion")}</dt><dd>{runtime.workVersionLabel ?? t("tianyi.workspace.currentMainline")}</dd></div><div><dt>ContextPack</dt><dd>{runtime.sharedTianyiReferences.length ? t("tianyi.workspace.referenceCount").replace("{count}", String(runtime.sharedTianyiReferences.length)) : t("tianyi.workspace.authorScope")}</dd></div></dl><label>{t("tianyi.workspace.workScope")}<select value={runtime.workScope} onChange={(event) => runtime.setWorkScope(event.target.value as TianyanShellRuntimeState["workScope"])}><option value="current-story">{t("tianyi.workspace.scope.story")}</option><option value="current-unit">{t("tianyi.workspace.scope.unit")}</option><option value="selected-events">{t("tianyi.workspace.scope.events")}</option></select></label></div>
            {activeLegacyCandidate ? <TianyiAdoptionPanel runtime={runtime} onOpenEventLine={openEventLine} /> : <p className="tianyi-work-empty">{t("tianyi.workspace.workEmpty")}</p>}
          </>}
        </section>}

        {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
        {lane === "creative" ? <section className="tianyi-workspace-composer">
          <p className="tianyi-dialogue-runtime" role="status">{dialogueRuntime === "local-fake" ? "本地假服务 · 非真实 Pi；发送仅用于本地连续性测试。" : dialogueRuntime === "provider" ? "已配置 Provider；仅在明确发送时调用。" : "当前没有可用的真实 Provider；草稿会保留，发送不会生成假回复。"}</p>
          <textarea aria-label={t(lane === "creative" ? "tianyi.workspace.creativeDraft" : "tianyi.workspace.workDraft")} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder={t(lane === "creative" ? "tianyi.workspace.creativePlaceholder" : "tianyi.workspace.workPlaceholder")} />
          <div><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `attachment:${crypto.randomUUID()}`, label: t("tianyi.workspace.demoAttachment"), kind: "attachment" })}><Paperclip />{t("tianyi.workspace.attachment")}</button><button type="button" onClick={() => runtime.addSharedTianyiReference({ id: `source:${crypto.randomUUID()}`, label: t("tianyi.workspace.demoSource"), kind: "source" })}><Link2 />{t("tianyi.workspace.sourceAction")}</button>{legacyFixture ? <button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}{t("tianyi.workspace.createCandidates")}</button> : <><button type="button" disabled={!draft.trim() || busy} onClick={() => void submitConversation("creative")}><MessageSquareText />发送消息</button><button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}整理为故事候选</button></>}</div>
        </section> : null}
      </section>

      {lane === "creative" ? <aside className="tianyi-current-context" aria-label={t("tianyi.workspace.currentView")}>
        <header><strong>{t("tianyi.workspace.currentView")}</strong><small>{t("tianyi.workspace.readOnly")}</small></header>
        <section><BookOpen /><div><strong>{t("tianyi.workspace.context")}</strong><p>{project.title}</p><small>{runtime.workVersionLabel ?? t("tianyi.workspace.currentStory")}</small></div></section>
        <section><FilePlus2 /><div><strong>{t("tianyi.workspace.sharedReferences")}</strong>{runtime.sharedTianyiReferences.length ? runtime.sharedTianyiReferences.map((item) => <p key={item.id}>{item.label}</p>) : <p>{t("tianyi.workspace.noReferences")}</p>}</div></section>
        <section><Sparkles /><div><strong>{t("tianyi.workspace.candidateRegistry")}</strong><p>{t("tianyi.workspace.candidateCount").replace("{count}", String(intakeRun?.storyIntakeEnvelope?.candidates.length ?? projection?.candidates.length ?? 0))}</p><small>{t("tianyi.workspace.sharedVisibility")}</small></div></section>
      </aside> : null}
    </div>
  </main>;
}

function storyIntakeStatusLabel(run: TianyiAgentRunProjection): string {
  if (run.status === "running" && run.model.providerId === "local-fake") return "本地假服务运行中";
  return ({ idle: "尚未开始", planning: "准备中", awaiting_author: "等待作者", running: "Provider 运行中", paused: "已停止", completed: "已完成", failed: "失败 · 原话已保留", cancelled: "已停止 · 可重新发起" } satisfies Record<TianyiAgentRunProjection["status"], string>)[run.status];
}
function storyIntakeRuntimeLabel(run: TianyiAgentRunProjection): string {
  if (run.model.providerId === "local-fake") return "本地假服务 · 非真实 Pi";
  return run.model.runtime === "pi" ? "Pi Runtime" : run.model.runtime === "provider" ? "Provider" : "测试夹具";
}

function requestedLane(): Lane {
  const requested = new URLSearchParams(window.location.search).get("tianyiLane");
  return requested === "review" || requested === "work" ? requested : "creative";
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

function localConversationFixture(text: string, projectTitle: string, scopeTitles: readonly (string | null | undefined)[]) {
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 180);
  const scope = scopeTitles.filter((title): title is string => Boolean(title)).join("、") || "当前故事范围";
  return {
    reply: `已围绕《${projectTitle}》的${scope}保留你的问题。本地假服务只验证连续对话与恢复，不代表真实 Pi 推理结果。`,
    summary: `当前对话焦点：${excerpt}`,
    themes: ["当前故事范围"],
    openQuestions: [excerpt],
    candidates: []
  };
}
