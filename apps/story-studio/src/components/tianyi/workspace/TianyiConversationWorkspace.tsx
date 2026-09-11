import { ArrowRight, BookOpen, CircleStop, FilePlus2, History, LoaderCircle, MessageSquareText, RotateCcw, Send, Sparkles } from "lucide-react";
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
  getVerifiedCanonEvent,
  getVerifiedCanonEventList,
  handoffTianyiCreativeCandidate,
  listStoryUnits,
  openTianyiSession,
  readTianyiGroundedAnswer,
  recoverTianyiAgentRun,
  startTianyiAgentRun,
  streamTianyiAgentRun,
  streamTianyiGroundedAnswer,
  type StoryIntakeLifecycleStatusProjection,
  type TianyiAgentRunProjection,
  type TianyiCreativeProjection,
  type TianyiSessionMetadata,
  type StoryUnit,
  type WorldObject
} from "../../../lib/localTransport";
import { createStoryStudioEventReference } from "../../../../../../src/storyContracts/storyStudioEventReference.ts";
import {
  selectTianyiGroundedEvidence
} from "../../../../../../src/storyContinuity/tianyiGroundedEvidenceRetrieval.ts";
import type { TianyanShellRuntimeState } from "../../../product-shell/runtime/TianyanShellRuntime";
import { TianyiAdoptionPanel } from "./TianyiAdoptionPanel";
import { StoryIntakeReviewSurface } from "./StoryIntakeReviewSurface";
import { StoryIntakeWorkSurface } from "./StoryIntakeWorkSurface";
import { useI18n } from "../../../product-shell/i18n/I18nProvider";
import type { TranslationKey } from "../../../product-shell/i18n/translations";
import { tianyiConversationStorageKey, tianyiStoryIntakeRunStorageKey } from "../../../product-shell/runtime/tianyiShellSessionRecovery";
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
type ConversationProjectVisit = { projectId: string | null; workVersionId: string; generation: number };
/** Must stay at or below the Grounded Context Gate's server-enforced cap. */
const MAX_GLOBAL_WORK_EVENT_REFS = 6;

function sameConversationProjectVisit(current: ConversationProjectVisit, expected: ConversationProjectVisit) {
  return current.projectId === expected.projectId && current.workVersionId === expected.workVersionId && current.generation === expected.generation;
}

export function TianyiConversationWorkspace(props: { runtime: TianyanShellRuntimeState; onOpenPendingReview(): void }) {
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
  const [workContextEvents, setWorkContextEvents] = useState<WorldObject[]>([]);
  const [workContextUnits, setWorkContextUnits] = useState<StoryUnit[]>([]);
  const [selectedWorkUnitId, setSelectedWorkUnitId] = useState<string | null>(null);
  const [selectedWorkEventIds, setSelectedWorkEventIds] = useState<string[]>([]);
  const [pinnedWorkEventIds, setPinnedWorkEventIds] = useState<string[]>([]);
  const [removedWorkEventIds, setRemovedWorkEventIds] = useState<string[]>([]);
  const [lastGroundedAnswer, setLastGroundedAnswer] = useState<Awaited<ReturnType<typeof streamTianyiGroundedAnswer>> | null>(null);
  const [lastGroundedQuestion, setLastGroundedQuestion] = useState("");
  const [workContextState, setWorkContextState] = useState<"loading" | "ready" | "failed">("loading");
  const workVersionId = runtime.workVersionId ?? "work-version.unversioned";
  const intakeAbort = useRef<AbortController | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const conversationProjectVisit = useRef({ projectId: project?.id ?? null, workVersionId, generation: 0 });
  if (conversationProjectVisit.current.projectId !== (project?.id ?? null) || conversationProjectVisit.current.workVersionId !== workVersionId) {
    conversationProjectVisit.current = { projectId: project?.id ?? null, workVersionId, generation: conversationProjectVisit.current.generation + 1 };
  }
  const legacyFixture = new URLSearchParams(window.location.search).get("testFixture") === "legacy-three-candidates";
  const dialogueRuntime = runtime.modelStatus?.tianyiDialogue.runtime ?? "unavailable";

  useEffect(() => {
    intakeAbort.current?.abort();
    setProjection(null);
    setMetadata(null);
    setIntakeRun(null);
    setIntakeStreamText("");
    setActiveIntakeRef(null);
    setSelectedIntakeCandidateIds([]);
    setWorkContextEvents([]);
    setWorkContextUnits([]);
    setSelectedWorkUnitId(null);
    setSelectedWorkEventIds([]);
    setPinnedWorkEventIds([]);
    setRemovedWorkEventIds([]);
    setLastGroundedAnswer(null);
    setLastGroundedQuestion("");
    setBusy(false);
    setError("");
  }, [project?.id, workVersionId]);

  const globalWorkTargetIds = useMemo(() => {
    const currentUnit = workContextUnits.find((unit) => unit.id === selectedWorkUnitId) ?? null;
    return runtime.workScope === "current-story"
      ? workContextEvents.map((event) => event.id)
      : runtime.workScope === "current-unit"
        ? currentUnit?.linkedEntityIds ?? []
        : selectedWorkEventIds;
  }, [runtime.workScope, selectedWorkEventIds, selectedWorkUnitId, workContextEvents, workContextUnits]);
  const scopedWorkEvents = useMemo(() => workContextEvents.filter((event) => globalWorkTargetIds.includes(event.id)), [globalWorkTargetIds, workContextEvents]);
  const globalWorkEvidence = useMemo(() => selectTianyiGroundedEvidence({
    scope: runtime.workScope,
    question: runtime.workComposerDraft,
    events: runtime.workComposerDraft.trim() ? scopedWorkEvents.map((event) => ({
      id: event.id,
      title: event.title,
      body: event.body,
      status: event.status as "draft" | "planned" | "committed",
      revisionToken: event.revisionToken
    })) : [],
    explicitEventIds: runtime.workScope === "selected-events" ? selectedWorkEventIds : [],
    pinnedEventIds: pinnedWorkEventIds,
    removedEventIds: removedWorkEventIds
  }), [pinnedWorkEventIds, removedWorkEventIds, runtime.workComposerDraft, runtime.workScope, scopedWorkEvents, selectedWorkEventIds]);
  const globalWorkEvents = useMemo(() => globalWorkEvidence.selected.map((item) => workContextEvents.find((event) => event.id === item.event.id)).filter((event): event is WorldObject => Boolean(event)), [globalWorkEvidence.selected, workContextEvents]);
  const globalWorkEventRefs = useMemo(() => {
    if (!project) return [];
    return globalWorkEvents.map((event) => createStoryStudioEventReference({ projectId: project.id, event, requestedUse: "constraint" }));
  }, [globalWorkEvents, project]);
  // Pins and explicit selection travel through the same server request.  Keep
  // the client affordance below the Gate's hard limit instead of silently
  // dropping a seventh author choice at send time.
  const explicitWorkEventCount = useMemo(() => new Set([
    ...pinnedWorkEventIds,
    ...(runtime.workScope === "selected-events" ? selectedWorkEventIds : [])
  ]).size, [pinnedWorkEventIds, runtime.workScope, selectedWorkEventIds]);
  const explicitWorkEventSlots = Math.max(0, MAX_GLOBAL_WORK_EVENT_REFS - explicitWorkEventCount);
  const omittedGlobalWorkEventCount = globalWorkEvidence.omittedCount;

  function toggleSelectedWorkEvent(eventId: string) {
    if (selectedWorkEventIds.includes(eventId)) {
      setSelectedWorkEventIds((current) => current.filter((id) => id !== eventId));
      return;
    }
    if (explicitWorkEventCount >= MAX_GLOBAL_WORK_EVENT_REFS) {
      setError(`本次最多明确指定 ${MAX_GLOBAL_WORK_EVENT_REFS} 项依据；请先取消一项再继续。`);
      return;
    }
    setSelectedWorkEventIds((current) => [...current, eventId]);
  }

  function togglePinnedWorkEvent(eventId: string) {
    if (pinnedWorkEventIds.includes(eventId)) {
      setPinnedWorkEventIds((current) => current.filter((id) => id !== eventId));
      return;
    }
    if (explicitWorkEventCount >= MAX_GLOBAL_WORK_EVENT_REFS) {
      setError(`本次最多明确指定 ${MAX_GLOBAL_WORK_EVENT_REFS} 项依据；请先取消一项再继续。`);
      return;
    }
    setPinnedWorkEventIds((current) => [...current, eventId]);
  }

  const globalWorkContextLabel = runtime.workScope === "current-story"
    ? workContextState === "loading" ? "当前故事 · 正在读取正式事件"
      : workContextState === "failed" ? "当前故事 · 读取失败，尚未形成上下文"
        : globalWorkEventRefs.length ? `当前故事 · 按问题选中 ${globalWorkEventRefs.length}/${globalWorkEvidence.availableCount} 项正式事件`
          : "当前故事 · 暂无可引用的正式事件"
    : runtime.workScope === "current-unit"
      ? `${workContextUnits.find((unit) => unit.id === selectedWorkUnitId)?.title ?? "尚未选择故事单元"} · 按问题选中 ${globalWorkEventRefs.length} 项正式事件`
      : `已选事件 · 按问题选中 ${globalWorkEventRefs.length}/${globalWorkEvidence.availableCount} 项`;

  const refreshWorkContext = useCallback(async () => {
    if (!project) return;
    const projectId = project.id;
    // A context read is stale only after its project or work-version identity
    // changes.  Do not invalidate it merely because another render refreshes
    // local work controls: that used to discard completed Event reads and
    // leave the author-facing workspace permanently in "loading".
    const visit = { ...conversationProjectVisit.current };
    setWorkContextState("loading");
    try {
      // The directory is intentionally only a summary projection, while this
      // work mode needs authoritative Event prose.  Start from Canon's
      // verified Event list, then use that same owner for each detail read.
      // This excludes planning drafts and keeps IF/mainline scope at the
      // existing Canon boundary instead of recreating a second event store.
      const [list, units] = await Promise.all([
        getVerifiedCanonEventList(projectId, runtime.workVersionId),
        listStoryUnits(projectId)
      ]);
      if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      if (list.status !== "ready") throw new Error(list.error.message);
      const events: WorldObject[] = [];
      for (let offset = 0; offset < list.eventIds.length; offset += 4) {
        const reads = await Promise.all(list.eventIds.slice(offset, offset + 4).map((eventId) => getVerifiedCanonEvent(projectId, eventId, runtime.workVersionId)));
        for (const read of reads) {
          if (read.status !== "ready") throw new Error(read.error.message);
          events.push(read.event);
        }
      }
      if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      setWorkContextEvents(events);
      setWorkContextUnits(units);
      setSelectedWorkUnitId((current) => current && units.some((unit) => unit.id === current) ? current : units[0]?.id ?? null);
      setSelectedWorkEventIds((current) => current.filter((id) => events.some((event) => event.id === id)).slice(0, MAX_GLOBAL_WORK_EVENT_REFS));
      setPinnedWorkEventIds((current) => current.filter((id) => events.some((event) => event.id === id)));
      setRemovedWorkEventIds((current) => current.filter((id) => events.some((event) => event.id === id)));
      setWorkContextState("ready");
    } catch {
      if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setWorkContextState("failed");
    }
  }, [project?.id, workVersionId]);

  useEffect(() => {
    if (!project) return;
    void refreshWorkContext();
  }, [project?.id, refreshWorkContext]);

  // An exclusion is an instruction for this question and scope only; carrying
  // it into the next question would silently change a new author request.
  useEffect(() => {
    setRemovedWorkEventIds([]);
  }, [runtime.workComposerDraft, runtime.workScope, selectedWorkUnitId, workVersionId]);

  useEffect(() => {
    setPinnedWorkEventIds([]);
  }, [runtime.workScope, selectedWorkUnitId, workVersionId]);

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
  const scrollTarget = (targetLane: Lane) => workspaceRef.current?.querySelector<HTMLElement>(targetLane === "creative" ? ".tianyi-conversation-column" : targetLane === "review" ? ".story-intake-ledger" : activeIntakeCandidate ? ".story-intake-arrangement" : ".tianyi-global-work-scroll") ?? null;
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
  // Runtime bootstrap normally restores this pointer.  Keep the Work surface
  // independently resilient to its asynchronous project bootstrap so a
  // completed grounded-answer receipt remains recoverable after refresh.
  useEffect(() => {
    if (!project || runtime.tianyiConversationId) return;
    const savedSessionId = window.sessionStorage.getItem(tianyiConversationStorageKey(project.id));
    if (savedSessionId) runtime.setTianyiConversationId(savedSessionId);
  }, [project?.id, runtime, runtime.tianyiConversationId]);
  const ensureConversation = useCallback(async (visit = conversationProjectVisit.current): Promise<string | null> => {
    if (!project) throw new Error(t("tianyi.workspace.noProject"));
    if (visit.projectId !== project.id || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return null;
    if (runtime.tianyiConversationId) return runtime.tianyiConversationId;
    const recoveredSessionId = intakeRun?.storyIntakeEnvelope?.sessionId;
    if (recoveredSessionId) {
      if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return null;
      runtime.setTianyiConversationId(recoveredSessionId);
      return recoveredSessionId;
    }
    const opened = await runtime.withConnection((token) => openTianyiSession(project.id, operationId("open"), token));
    if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return null;
    runtime.setTianyiConversationId(opened.sessionId);
    return opened.sessionId;
  }, [intakeRun?.storyIntakeEnvelope?.sessionId, project, runtime, t]);

  const refresh = useCallback(async (sessionId: string, candidateId = runtime.activeTianyiCandidateId, visit = conversationProjectVisit.current) => {
    if (!project) return;
    const projectId = project.id;
    if (visit.projectId !== projectId || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
    // A Work-only conversation has no obligation to have a Creative
    // projection.  Its durable metadata (and therefore its frozen grounded
    // receipt) must still recover after refresh when that optional projection
    // is unavailable.
    const nextMetadata = await runtime.withConnection((token) => getTianyiSessionMetadata(projectId, sessionId, token));
    if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
    setMetadata(Array.isArray(nextMetadata) ? nextMetadata.find((item) => item.id === sessionId) ?? null : nextMetadata);
    let nextProjection: TianyiCreativeProjection | null = null;
    try {
      nextProjection = await runtime.withConnection((token) => getTianyiCreativeProjection(projectId, sessionId, token));
    } catch {
      // Creative lanes can remain unavailable without hiding a saved Work
      // receipt; opening a Creative action will surface its own error.
    }
    if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
    setProjection(nextProjection);
    const activeCandidate = candidateId ?? nextProjection?.candidates.find((item) => item.state === "handed-off")?.candidateId ?? null;
    if (activeCandidate) runtime.setActiveTianyiCandidateId(activeCandidate);
  }, [project, runtime]);

  useEffect(() => {
    if (!runtime.tianyiConversationId || !project) return;
    void refresh(runtime.tianyiConversationId).catch(() => undefined);
  }, [project, refresh, runtime.tianyiConversationId]);

  useEffect(() => {
    const attempt = metadata?.groundedAttempts.filter((item) => item.state === "COMPLETED").at(-1);
    const sessionId = runtime.tianyiConversationId;
    const visit = conversationProjectVisit.current;
    if (!project || !sessionId || !attempt || attempt.questionAttemptKey === lastGroundedAnswer?.questionAttemptKey) return;
    let active = true;
    void runtime.withConnection((token) => readTianyiGroundedAnswer({
      projectId: project.id,
      sessionId,
      questionAttemptKey: attempt.questionAttemptKey,
      token
    })).then((result) => {
      if (!active || !result || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      setLastGroundedAnswer(result);
      setLastGroundedQuestion(attempt.question);
    }).catch((cause) => {
      if (active && sameConversationProjectVisit(conversationProjectVisit.current, visit)) setError(cause instanceof Error ? cause.message : "已保存回答无法安全恢复。");
    });
    return () => { active = false; };
  }, [lastGroundedAnswer?.questionAttemptKey, metadata?.groundedAttempts, project, runtime, workVersionId]);

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
    const requested = new URLSearchParams(window.location.search);
    const hasExplicitIntakeTarget = Boolean(requested.get("tianyiEnvelope") || requested.get("tianyiCandidate") || requested.get("tianyiRun"));
    const requestedRunId = requested.get("tianyiRun");
    const runId = requestedRunId ?? window.sessionStorage.getItem(tianyiStoryIntakeRunStorageKey(project.id, workVersionId, sessionId));
    if (!runId) {
      if (lane === "review" || hasExplicitIntakeTarget) setError("未找到可恢复的候选批次；原文仍保留，请回到创意重新整理。");
      return;
    }
    void runtime.withConnection((token) => recoverTianyiAgentRun({ projectId: project.id, workVersionId, sessionId, runId, token })).then((next) => {
      if (!active) return;
      setIntakeRun(next);
      if (!next?.storyIntakeEnvelope) {
        if (lane === "review" || hasExplicitIntakeTarget) setError("候选批次已丢失或尚未完成；未写入任何内容，请回到创意恢复。");
        return;
      }
      const envelope = next.storyIntakeEnvelope;
      const requestedProjectId = requested.get("pendingProject");
      const requestedWorkVersionId = requested.get("pendingWorkVersion");
      const requestedSessionId = requested.get("tianyiSession");
      const requestedEnvelopeId = requested.get("tianyiEnvelope");
      if (hasExplicitIntakeTarget && (requestedProjectId !== project.id || requestedWorkVersionId !== workVersionId || requestedSessionId !== sessionId || requestedRunId !== runId || requestedEnvelopeId !== envelope.envelopeId)) {
        setActiveIntakeRef(null);
        setSelectedIntakeCandidateIds([]);
        setError("待确认入口对应的候选批次已变化或无法恢复；没有写入任何内容，请回到待确认重新选择。");
        return;
      }
      setError("");
      const restoredRef = parseActiveStoryIntakeCandidateRef(window.sessionStorage.getItem(storyIntakeCandidateRefStorageKey(project.id, sessionId)), project.id);
      const requestedCandidateId = requested.get("tianyiCandidate");
      const requestedCandidate = requestedCandidateId ? envelope.candidates.find((candidate) => candidate.candidateId === requestedCandidateId) : null;
      if (hasExplicitIntakeTarget && requestedCandidateId && !requestedCandidate) {
        setActiveIntakeRef(null);
        setSelectedIntakeCandidateIds([]);
        setError("待确认入口对应的候选已不存在；没有写入任何内容，请回到待确认重新选择。");
        return;
      }
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
  }, [lane, project, runtime, runtime.tianyiConversationId, workVersionId]);

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

  const streamIntakeRun = async (sessionId: string, runId: string, label: string, prepareContext = true, visit = conversationProjectVisit.current) => {
    if (!project || visit.projectId !== project.id || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
    const projectId = project.id;
    const frozenWorkVersionId = workVersionId;
    const controller = new AbortController();
    intakeAbort.current = controller;
    setIntakeStreamText("");
    const next = await runtime.withConnection(async (token) => {
      if (prepareContext) {
        const contextualized = await continueTianyiAgentRun({ projectId, workVersionId: frozenWorkVersionId, sessionId, runId, operationId: operationId(`${label}.context`), token });
        if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return null;
        setIntakeRun(contextualized);
      }
      return streamTianyiAgentRun({
        projectId, workVersionId: frozenWorkVersionId, sessionId, runId,
        operationId: operationId(`${label}.stream`), token, signal: controller.signal,
        onEvent(event) { if (event.type === "text-delta" && sameConversationProjectVisit(conversationProjectVisit.current, visit)) setIntakeStreamText((value) => value + event.delta); }
      });
    });
    if (!next || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
    setIntakeRun(next);
    if (next.storyIntakeEnvelope) window.dispatchEvent(new Event("story-studio-pending-review-changed"));
    if (intakeAbort.current === controller) intakeAbort.current = null;
  };

  const submitCreative = async () => {
    const text = runtime.creativeComposerDraft.trim();
    if (!text || !project || busy) return;
    const visit = conversationProjectVisit.current;
    const projectId = project.id;
    const frozenWorkVersionId = workVersionId;
    setBusy(true); setError("");
    try {
      const sessionId = await ensureConversation(visit);
      if (!sessionId || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      const captureOperationId = operationId("capture");
      const captured = await runtime.withConnection((token) => captureTianyiCreativeAuthorSource({
        projectId,
        sessionId,
        operationId: captureOperationId,
        submissionId: operationId("submission"),
        text,
        collaborate: false,
        token
      }));
      if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      runtime.setCreativeComposerDraft("");
      if (legacyFixture) {
        const extracted = await runtime.withConnection((token) => extractTianyiCreativeProjection({ projectId, sessionId, operationId: operationId("extract"), source: captured.source, fixture: deterministicThreeCandidates(text, t), token }));
        if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
        setProjection(extracted.projection);
        await refresh(sessionId, runtime.activeTianyiCandidateId, visit);
      } else {
        const run = await runtime.withConnection((token) => startTianyiAgentRun({
          projectId, workVersionId: frozenWorkVersionId, sessionId, currentPage: "/tianyi",
          task: "把本轮已保存的作者原话整理为带精确来源的结构化故事候选。",
          contextRequest: { storyIntake: { version: "tianyan-story-intake-request/v1", sourceRef: captured.source } },
          permissionProfile: "conservative", operationId: operationId("story-intake.start"), token
        }));
        if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
        window.sessionStorage.setItem(tianyiStoryIntakeRunStorageKey(projectId, frozenWorkVersionId, sessionId), run.runId);
        setIntakeRun(run);
        await refresh(sessionId, runtime.activeTianyiCandidateId, visit);
        await streamIntakeRun(sessionId, run.runId, "story-intake", true, visit);
      }
    } catch (cause) { if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setError(cause instanceof Error ? cause.message : t("tianyi.workspace.prepareFailed")); }
    finally { if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setBusy(false); }
  };

  const submitConversation = async (conversationLane: "creative" | "work") => {
    const text = (conversationLane === "creative" ? runtime.creativeComposerDraft : runtime.workComposerDraft).trim();
    if (!text || !project || busy) return;
    const visit = conversationProjectVisit.current;
    setBusy(true); setError("");
    try {
      if (dialogueRuntime === "unavailable") throw new Error("当前没有可用的真实 Provider；草稿仍保留，未发送也未生成本地假回复。");
      if (conversationLane === "work" && workContextState === "failed") throw new Error("工作依据读取失败；草稿已保留。请重新读取正式事件后再发送，避免把失败误作无上下文。");
      if (conversationLane === "work" && runtime.workScope !== "current-story" && globalWorkEventRefs.length === 0) throw new Error("当前工作范围没有可追溯的正式事件；请选择故事单元或事件后再发送。");
      const sessionId = await ensureConversation(visit);
      if (!sessionId || !sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      const selectedModelId = runtime.modelStatus?.profile.profile?.modelId;
      const profileId = runtime.modelStatus?.profiles.find((item) => item.modelId === selectedModelId)?.id;
      const localFakeRuntime = dialogueRuntime === "local-fake";
      if ((dialogueRuntime === "provider" && runtime.modelStatus?.tianyiDialogue.ready && profileId) || (localFakeRuntime && conversationLane === "work")) {
        const result = await runtime.withConnection((token) => streamTianyiGroundedAnswer({
          operationId: operationId("conversation.answer"),
          submissionId: operationId("conversation.submission"),
          profileId: localFakeRuntime ? "local-fake-grounded-answer" : profileId!,
          question: text,
          contextRequest: {
            version: "story-tianyi-grounded-context-request/v1",
            projectId: project.id,
            sessionId,
            taskKind: "grounded-answer",
            accessMode: "author",
            subjectRef: null,
            sceneRef: null,
            explicitRefs: [],
            ...(conversationLane === "work" && globalWorkEventRefs.length ? { eventRefs: globalWorkEventRefs } : {})
          },
          token
        }));
        if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
        if (result.status !== "current" || !result.answer) throw new Error("天意回答未完整落盘；已保留原问题，可按回执重试。");
        if (conversationLane === "work") {
          setLastGroundedAnswer(result);
          setLastGroundedQuestion(text);
        }
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
      if (!sameConversationProjectVisit(conversationProjectVisit.current, visit)) return;
      if (conversationLane === "creative") runtime.setCreativeComposerDraft("");
      else runtime.setWorkComposerDraft("");
      await refresh(sessionId, runtime.activeTianyiCandidateId, visit);
    } catch (cause) { if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setError(cause instanceof Error ? cause.message : "对话失败；草稿与已有候选仍然保留。"); }
    finally { if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setBusy(false); }
  };

  const stopStoryIntake = async () => {
    if (!project || !runtime.tianyiConversationId || !intakeRun || !busy) return;
    intakeAbort.current?.abort();
    const next = await runtime.withConnection((token) => cancelTianyiAgentRun({ projectId: project.id, workVersionId, sessionId: runtime.tianyiConversationId!, runId: intakeRun.runId, reason: "作者停止了本次 Story Intake。", operationId: operationId("story-intake.stop"), token }));
    setIntakeRun(next);
  };

  const retryStoryIntake = async () => {
    if (!runtime.tianyiConversationId || !intakeRun || busy) return;
    const visit = conversationProjectVisit.current;
    setBusy(true); setError("");
    try { await streamIntakeRun(runtime.tianyiConversationId, intakeRun.runId, "story-intake.retry", false, visit); }
    catch (cause) { if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setError(cause instanceof Error ? cause.message : "Story Intake 重试失败。"); }
    finally { if (sameConversationProjectVisit(conversationProjectVisit.current, visit)) setBusy(false); }
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

  const openGroundedEvidenceEvent = (source: { projectId: string; sourceId: string; contentHash: string }) => {
    const current = new URL(window.location.href);
    current.pathname = "/tianyi";
    current.searchParams.set("tianyiLane", "work");
    if (runtime.tianyiConversationId) current.searchParams.set("tianyiSession", runtime.tianyiConversationId);
    const params = new URLSearchParams({
      projectId: source.projectId,
      workVersionId,
      eventId: source.sourceId,
      eventRevision: source.contentHash,
      tianyiReturn: `${current.pathname}${current.search}`
    });
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
      : selectedIntakeCandidates.length
        ? { eyebrow: "候选工作", title: `编排当前 ${selectedIntakeCandidates.length} 项，再决定是否采纳`, detail: "先看结构化影响；只有明确范围会交给既有 Owner" }
        : { eyebrow: "全局工作", title: "围绕当前故事持续推进", detail: "可讨论、核对范围或添加引用；没有候选也不会关闭工作上下文" };

  if (!project) return <main className="shell-workspace tianyi-workspace"><section className="tianyi-workspace-empty"><Sparkles /><h1>{t("space.tianyi")}</h1><p>{t("tianyi.workspace.noProject")}</p></section></main>;

  return <main ref={workspaceRef} className="shell-workspace tianyi-workspace" aria-label={t("tianyi.workspaceLabel")} data-tianyi-conversation-id={runtime.tianyiConversationId ?? intakeRun?.storyIntakeEnvelope?.sessionId ?? "not-started"} data-active-lane={lane}>
    <header className="tianyi-workspace-header">
          <div><small>作者工作台</small><h1>天意</h1></div>
      <div className="tianyi-lane-switch" role="tablist" aria-label={t("tianyi.workspace.modeLabel")}>
        <button type="button" role="tab" aria-selected={lane === "creative"} onClick={() => changeLane("creative")}><span>{t("tianyi.workspace.creativeMode")}</span><small>展开想法</small></button>
        <button type="button" role="tab" aria-selected={lane === "work"} onClick={() => changeLane("work")}><span>{t("tianyi.workspace.workMode")}</span><small>推进落地</small></button>
      </div>
      <div className="tianyi-header-actions">
        <button type="button" className="tianyi-pending-anchor" onClick={props.onOpenPendingReview}>待确认<span>{intakeCandidateCount ? `${intakeCandidateCount} 项候选` : "查看全部"}</span></button>
        <button type="button" className="tianyi-conversation-anchor" onClick={() => changeLane("creative")} aria-current={lane === "creative" ? "page" : undefined}><History /><span>{lane === "creative" ? "当前长对话" : "返回长对话"}</span><small>草稿与来源保持</small></button>
      </div>
    </header>

    <section className="tianyi-task-header" aria-label="当前任务">
      <div><small>{task.eyebrow}</small><h2>{task.title}</h2><p>{task.detail}</p></div>
      <div className="tianyi-task-status"><span>{project.title}</span><span>{runtime.workVersionLabel ?? "当前主线"}</span>{intakeRun?.storyIntakeEnvelope ? <span>批次已恢复</span> : null}</div>
    </section>

    <div className="tianyi-workspace-body" data-full-work-surface={lane !== "creative"} data-global-work={lane === "work" && !activeIntakeCandidate ? "true" : undefined}>
      <section className="tianyi-conversation-column">
        <div className={`tianyi-work-content${lane === "work" && !activeIntakeCandidate ? " tianyi-global-work-scroll" : ""}`}>
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
              <div className="tianyi-intake-ready"><div><strong>{intakeRun.storyIntakeEnvelope.candidates.length} 项故事候选已准备好</strong><p>原文、来源和候选状态已保留；审阅只是当前批次的任务，不会切换成另一条会话。</p></div><button type="button" className="primary-action" onClick={() => changeLane("review")}>审阅这批候选<ArrowRight /></button></div>
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
            <div className="tianyi-stage-heading"><div><small>WORK LANE</small><h2>{activeLegacyCandidate?.title ?? "当前故事工作上下文"}</h2></div><span>{activeLegacyCandidate ? t("tianyi.workspace.workGuide") : "先明确范围，再决定是否需要整理候选"}</span></div>
            <div className="tianyi-work-contract"><dl><div><dt>{t("tianyi.workspace.workTarget")}</dt><dd>{activeLegacyCandidate?.summary ?? "围绕作者原话与当前故事持续讨论；不会因没有候选而中断。"}</dd></div><div><dt>{t("tianyi.workspace.targetStory")}</dt><dd>{project.title}</dd></div><div><dt>{t("tianyi.workspace.baseVersion")}</dt><dd>{runtime.workVersionLabel ?? t("tianyi.workspace.currentMainline")}</dd></div><div><dt>ContextPack</dt><dd>{activeLegacyCandidate ? (runtime.sharedTianyiReferences.length ? t("tianyi.workspace.referenceCount").replace("{count}", String(runtime.sharedTianyiReferences.length)) : t("tianyi.workspace.authorScope")) : globalWorkContextLabel}</dd></div></dl><label>{t("tianyi.workspace.workScope")}<select value={runtime.workScope} onChange={(event) => runtime.setWorkScope(event.target.value as TianyanShellRuntimeState["workScope"])}><option value="current-story">{t("tianyi.workspace.scope.story")}</option><option value="current-unit">{t("tianyi.workspace.scope.unit")}</option><option value="selected-events">{t("tianyi.workspace.scope.events")}</option></select></label></div>
            {!activeLegacyCandidate ? <details className="tianyi-work-context-picker" open>
              <summary>工作依据 · {globalWorkContextLabel}</summary>
              {runtime.workScope === "current-unit" ? <label>故事单元<select value={selectedWorkUnitId ?? ""} onChange={(event) => setSelectedWorkUnitId(event.target.value || null)}><option value="">尚未选择</option>{workContextUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label> : null}
              {runtime.workScope === "selected-events" ? <fieldset><legend>显式选择至多 {MAX_GLOBAL_WORK_EVENT_REFS} 项正式事件（不会因低相关度被丢弃）</legend><p aria-live="polite">已明确指定 {explicitWorkEventCount}/{MAX_GLOBAL_WORK_EVENT_REFS} 项；还可加入 {explicitWorkEventSlots} 项。</p>{workContextEvents.map((event) => <label key={event.id}><input type="checkbox" data-event-id={event.id} checked={selectedWorkEventIds.includes(event.id)} onChange={() => toggleSelectedWorkEvent(event.id)} />{event.title} · {event.status}</label>)}</fieldset> : null}
              {workContextState === "loading" ? <p>正在读取当前项目的正式事件；发送暂不把它当成无上下文。</p> : workContextState === "failed" ? <p>正式事件暂时读取失败。草稿不会丢失；<button type="button" onClick={() => void refreshWorkContext()}>重新读取</button>后再发送。</p> : !runtime.workComposerDraft.trim() ? <p>输入一个问题后，天意会在当前范围内检索依据；预览不调用 Provider，只有点击发送才进入既有回答链。</p> : <><p>本次按问题选中 {globalWorkEvents.length} 项可校验 Event；服务端会在发送前重新核验项目、状态和修订。</p>{globalWorkEvidence.selected.length ? <ul className="tianyi-work-context-events tianyi-grounded-evidence-preview">{globalWorkEvidence.selected.map((item) => <li key={`${item.event.id}:${item.event.revisionToken}`}><div><strong>{item.event.title}</strong><span>{item.event.status} · {item.reason}</span><p>{item.excerpt}</p></div><nav><button type="button" onClick={() => togglePinnedWorkEvent(item.event.id)}>{item.pinned ? "取消置顶" : "置顶"}</button><button type="button" onClick={() => setRemovedWorkEventIds((current) => [...new Set([...current, item.event.id])])}>移除</button><button type="button" onClick={() => project && openGroundedEvidenceEvent({ projectId: project.id, sourceId: item.event.id, contentHash: item.event.revisionToken })}>查看来源</button></nav></li>)}</ul> : <p>{globalWorkEvidence.availableCount ? "范围内存在正式事件，但本问题没有匹配依据；可切换到“所选事件”明确指定来源。" : "当前范围没有正式事件；可以继续提问，但回答会明确来源不足。"}</p>}{omittedGlobalWorkEventCount ? <p>另有 {omittedGlobalWorkEventCount} 项未进入本次上下文；可切换范围、置顶，或在“所选事件”明确指定。</p> : null}{removedWorkEventIds.length ? <button type="button" className="tianyi-grounded-restore" onClick={() => setRemovedWorkEventIds([])}>恢复本问已移除的来源</button> : null}</>}
              {runtime.sharedTianyiReferences.length ? <p>此前的未绑定引用不会参与本次发送；上传与来源绑定尚未接通，当前不再创建演示引用。</p> : null}
            </details> : null}
            {activeLegacyCandidate ? <TianyiAdoptionPanel runtime={runtime} onOpenEventLine={openEventLine} /> : <>
              <section className="tianyi-visible-history tianyi-work-history" aria-label="当前工作对话">
                {metadata?.visibleMessages.length ? metadata.visibleMessages.map((message) => <article key={message.eventId} className={`is-${message.actor}`}><span>{message.actor === "author" ? t("tianyi.author") : t("space.tianyi")}</span><p>{message.visibleContent}</p></article>) : <p className="tianyi-work-empty">这里没有待处理候选。你仍可就当前故事提问、补充引用或设定下一步范围。</p>}
              </section>
              {lastGroundedAnswer ? <section className="tianyi-grounded-answer-receipt" aria-label="本问来源回执"><header><div><small>已保存回答回执</small><h3>“{lastGroundedQuestion}”</h3></div><span>{lastGroundedAnswer.providerDispatchCount} 次模型发送</span></header><p>{lastGroundedAnswer.answer?.summary}</p><dl><div><dt>Receipt</dt><dd>{lastGroundedAnswer.receiptId}</dd></div><div><dt>来源清单校验</dt><dd>{lastGroundedAnswer.sourceManifest.digest}</dd></div></dl><ul>{lastGroundedAnswer.includedSources.map((source) => <li key={source.sourceKey}>{lastGroundedAnswer.sourceManifest.request.eventRefs?.includes(source.sourceKey) ? <button type="button" onClick={() => openGroundedEvidenceEvent(source)}>{source.sourceId}</button> : <strong>{source.sourceId}</strong>}<span>修订 {source.contentHash.slice(0, 12)} · {source.lane}</span></li>)}</ul></section> : null}
            </>}
          </>}
        </section>}
          {error ? <p className="tianyi-workspace-error" role="alert">{error}</p> : null}
        </div>
        {(lane === "creative" || (lane === "work" && !activeIntakeCandidate)) ? <section className="tianyi-workspace-composer">
          <p className="tianyi-dialogue-runtime" role="status">{dialogueRuntime === "local-fake" ? "本地假服务 · 非真实 Pi；发送仅用于本地连续性测试。" : dialogueRuntime === "provider" ? "已配置 Provider；仅在明确发送时调用。" : "当前没有可用的真实 Provider；草稿会保留，发送不会生成假回复。"}</p>
          <textarea aria-label={t(lane === "creative" ? "tianyi.workspace.creativeDraft" : "tianyi.workspace.workDraft")} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder={t(lane === "creative" ? "tianyi.workspace.creativePlaceholder" : "tianyi.workspace.workPlaceholder")} />
          <div>{lane === "work" ? <button type="button" className="tianyi-send" disabled={!draft.trim() || busy || workContextState === "loading" || workContextState === "failed"} onClick={() => void submitConversation("work")}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}发送到当前工作</button> : legacyFixture ? <button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}{t("tianyi.workspace.createCandidates")}</button> : <><button type="button" disabled={!draft.trim() || busy} onClick={() => void submitConversation("creative")}><MessageSquareText />发送消息</button><button type="button" className="tianyi-send" disabled={!draft.trim() || busy} onClick={submitCreative}>{busy ? <LoaderCircle className="is-spinning" /> : <Send />}整理为故事候选</button></>}</div>
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
