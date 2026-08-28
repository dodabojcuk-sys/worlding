import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ExecutionBriefDraftInput,
  type ExecutionBriefChanges,
  type StoryExploration,
  type TianyiContextRequest,
  type TianyiCreativeProjection,
  type TianyiCreativeEventReview,
  type TianyiCreativeSourceRef,
  type TianyiGroundedAnswerResult,
  type TianyiAgentRunProjection,
  type TianyiNuwaExecutionBrief,
  type TianyiReceiptRead,
  type TianyiSessionMetadata,
  type TianyiVisibleMessage
} from "../../lib/localTransport";
import { selectResumableTianyiSession, selectSharedTianyiSession } from "../tianyiSessionResume";
import type { TianyiComposerSendMode } from "./composer/TianyiComposer";
import { deriveTianyiThreadBriefDraft, mapTianyiThreadBriefChanges, type TianyiThreadBriefDraft } from "./tianyiConversationBrief";
import type { TianyiTransportState } from "./tianyiTransportPresentation";

export type TianyiV3RecoveryAction = "recheck-source" | "reload-compare-brief" | "reread-tianyi-session" | "retry-send" | "retry-approve" | "retry-start";
export type TianyiV3RecoveryIssueKind = "source-stale" | "brief-revision-conflict" | "nuwa-return-recovery-failed" | "send-failed" | "approve-failed" | "start-failed" | "brief-dirty" | "brief-missing" | "brief-revision-unavailable" | "brief-not-approvable" | "brief-not-approved" | "start-in-progress";

export type TianyiV3RecoveryIssue = {
  kind: TianyiV3RecoveryIssueKind;
  message: string;
  action: TianyiV3RecoveryAction;
};

/**
 * Integration supplies only observed freshness/recovery facts. The leaf never
 * infers stale sources or revision conflicts from an arbitrary error string.
 */
export type TianyiV3RecoverySignals = {
  sourceState?: "current" | "stale";
  briefRevisionState?: "current" | "conflict";
  nuwaReturnRecoveryState?: "available" | "failed";
};

export type TianyiV3OperationName = "approve" | "start";
export type TianyiV3OperationResult<T = void> = { ok: true; value: T } | { ok: false; issue: TianyiV3RecoveryIssue };

export type TianyiV3OperationBoundaryInput = {
  operation: TianyiV3OperationName;
  briefDirty: boolean;
  brief: TianyiNuwaExecutionBrief | null;
  recoverySignals?: TianyiV3RecoverySignals;
  startInFlight: boolean;
};

const recoveryMessage: Record<TianyiV3RecoveryIssueKind, string> = {
  "source-stale": "来源内容已经变化，请重新检查来源后再继续。",
  "brief-revision-conflict": "最新执行简报已变化；已保留当前草稿，请载入最新版本并比较。",
  "nuwa-return-recovery-failed": "未能恢复原天意会话，请重新读取本次天意。",
  "send-failed": "发送未完成；你的输入仍在这里，可以重新发送。",
  "approve-failed": "确认简报未完成；当前简报仍未批准，可以重新确认。",
  "start-failed": "进入女娲未完成；已批准的简报保持不变，可以重新进入女娲。",
  "brief-dirty": "简报有未保存修改；请先保存为新版本。",
  "brief-missing": "当前没有可继续操作的执行简报。",
  "brief-revision-unavailable": "当前简报版本不可用；请重新读取本次天意。",
  "brief-not-approvable": "当前版本不是可确认的草稿。",
  "brief-not-approved": "请先确认当前简报版本，再交给女娲。",
  "start-in-progress": "当前简报正在进入女娲，请勿重复提交。"
};

const recoveryAction: Record<TianyiV3RecoveryIssueKind, TianyiV3RecoveryAction> = {
  "source-stale": "recheck-source",
  "brief-revision-conflict": "reload-compare-brief",
  "nuwa-return-recovery-failed": "reread-tianyi-session",
  "send-failed": "retry-send",
  "approve-failed": "retry-approve",
  "start-failed": "retry-start",
  "brief-dirty": "reload-compare-brief",
  "brief-missing": "reread-tianyi-session",
  "brief-revision-unavailable": "reread-tianyi-session",
  "brief-not-approvable": "reload-compare-brief",
  "brief-not-approved": "reload-compare-brief",
  "start-in-progress": "retry-start"
};

export function tianyiV3RecoveryIssue(kind: TianyiV3RecoveryIssueKind): TianyiV3RecoveryIssue {
  return { kind, message: recoveryMessage[kind], action: recoveryAction[kind] };
}

export function validateTianyiV3OperationBoundary(input: TianyiV3OperationBoundaryInput): TianyiV3OperationResult<void> {
  const signals = input.recoverySignals;
  if (input.briefDirty) return { ok: false, issue: tianyiV3RecoveryIssue("brief-dirty") };
  if (signals?.sourceState === "stale") return { ok: false, issue: tianyiV3RecoveryIssue("source-stale") };
  if (signals?.briefRevisionState === "conflict") return { ok: false, issue: tianyiV3RecoveryIssue("brief-revision-conflict") };
  if (!input.brief) return { ok: false, issue: tianyiV3RecoveryIssue("brief-missing") };
  if (!Number.isInteger(input.brief.revision) || input.brief.revision < 1) return { ok: false, issue: tianyiV3RecoveryIssue("brief-revision-unavailable") };
  if (input.operation === "approve" && input.brief.authorApprovalState !== "draft") return { ok: false, issue: tianyiV3RecoveryIssue("brief-not-approvable") };
  if (input.operation === "start" && input.brief.authorApprovalState !== "approved") return { ok: false, issue: tianyiV3RecoveryIssue("brief-not-approved") };
  if (input.operation === "start" && input.startInFlight) return { ok: false, issue: tianyiV3RecoveryIssue("start-in-progress") };
  return { ok: true, value: undefined };
}

/** The controller and contract tests share this hard boundary around external operations. */
export async function runTianyiV3GuardedOperation<T>(input: TianyiV3OperationBoundaryInput, operation: () => Promise<T>): Promise<TianyiV3OperationResult<T>> {
  const boundary = validateTianyiV3OperationBoundary(input);
  if (!boundary.ok) return boundary;
  return { ok: true, value: await operation() };
}

export async function runTianyiV3RecoveryAction(action: TianyiV3RecoveryAction, handlers: {
  onRetrySend(): Promise<TianyiV3OperationResult>;
  onRetryApprove(): Promise<TianyiV3OperationResult>;
  onRetryStart(): Promise<TianyiV3OperationResult>;
  onExternalRecovery?(action: "recheck-source" | "reload-compare-brief" | "reread-tianyi-session"): void;
}): Promise<TianyiV3OperationResult> {
  if (action === "retry-send") return handlers.onRetrySend();
  if (action === "retry-approve") return handlers.onRetryApprove();
  if (action === "retry-start") return handlers.onRetryStart();
  if (!handlers.onExternalRecovery) return { ok: false, issue: tianyiV3RecoveryIssue(action === "recheck-source" ? "source-stale" : action === "reload-compare-brief" ? "brief-revision-conflict" : "nuwa-return-recovery-failed") };
  handlers.onExternalRecovery(action);
  return { ok: true, value: undefined };
}

export type TianyiV2Operations = {
  getSessionMetadata(projectId: string, sessionId: string | null, token: string): Promise<TianyiSessionMetadata | TianyiSessionMetadata[] | null>;
  readReceipt(projectId: string, receiptId: string, contextRequest: TianyiContextRequest, token: string): Promise<TianyiReceiptRead | null>;
  readLatestBrief(projectId: string, token: string): Promise<TianyiNuwaExecutionBrief | null>;
  openSession(projectId: string, operationId: string, token: string): Promise<{ sessionId: string }>;
  captureCreativeSource(input: { projectId: string; sessionId: string; operationId: string; submissionId: string; text: string; collaborate: boolean; token: string }): Promise<{ source: TianyiCreativeSourceRef; alreadyCompleted: boolean }>;
  extractCreative(input: { projectId: string; sessionId: string; operationId: string; source: TianyiCreativeSourceRef; token: string }): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }>;
  readCreative(projectId: string, sessionId: string, token: string): Promise<TianyiCreativeProjection | null>;
  editCreative(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; expectedRevision: number; title: string; summary: string; uncertainties: string[]; token: string }): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }>;
  decideCreative(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; decision: "rejected" | "deferred"; token: string }): Promise<{ projection: TianyiCreativeProjection }>;
  handoffCreative(input: { projectId: string; sessionId: string; candidateId: string; operationId: string; token: string }): Promise<{ projection: TianyiCreativeProjection; ownerReceipt: { owner: string; id: string; revision: number | null }; eventReview?: TianyiCreativeEventReview }>;
  readCreativeEventReview(input: { projectId: string; sessionId: string; candidateId: string; token: string }): Promise<TianyiCreativeEventReview>;
  beginCreativeEventImpact(input: { projectId: string; sessionId: string; candidateId: string; token: string }): Promise<TianyiCreativeEventReview>;
  rejectCreativeEvent(input: { projectId: string; sessionId: string; candidateId: string; token: string }): Promise<TianyiCreativeEventReview>;
  confirmCreativeEvent(input: { projectId: string; sessionId: string; candidateId: string; optionId: string; token: string }): Promise<TianyiCreativeEventReview>;
  pauseCreative(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ projection: TianyiCreativeProjection }>;
  markCreativeProviderUnavailable(input: { projectId: string; sessionId: string; operationId: string; stage: "response" | "extraction"; message?: string; token: string }): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }>;
  recoverCreative(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ projection: TianyiCreativeProjection; alreadyCompleted: boolean }>;
  completeCreative(projectId: string, sessionId: string, operationId: string, token: string): Promise<{ projection: TianyiCreativeProjection }>;
  /** The App facade owns the real grounded/streaming operation and its source contract. */
  runGroundedQuestion(input: {
    projectId: string;
    sessionId: string;
    operationId: string;
    submissionId: string;
    explicitRetry: boolean;
    profileId?: string;
    question: string;
    token: string;
    signal?: AbortSignal;
    onDraft?(event: { attempt: number; text: string }): void;
  }): Promise<TianyiGroundedAnswerResult>;
  createBrief(input: ExecutionBriefDraftInput & { token: string }): Promise<TianyiNuwaExecutionBrief>;
  reviseBrief(input: { projectId: string; briefId: string; expectedHash: string; changes: ExecutionBriefChanges; token: string }): Promise<TianyiNuwaExecutionBrief>;
  approveBrief(input: { projectId: string; briefId: string; revision: number; expectedHash: string; expectedSourceSetHash: string; token: string }): Promise<TianyiNuwaExecutionBrief>;
  startBrief(projectId: string, briefId: string, revision: number, token: string): Promise<StoryExploration>;
  startAgentRun(input: { projectId: string; sessionId: string; task: string; currentPage: string; contextRequest?: Record<string, unknown>; permissionProfile?: "step-by-step" | "conservative" | "proactive"; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  continueAgentRun(input: { projectId: string; sessionId: string; runId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  approveAgentStep(input: { projectId: string; sessionId: string; runId: string; stepId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  rejectAgentStep(input: { projectId: string; sessionId: string; runId: string; stepId: string; reason?: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  steerAgentRun(input: { projectId: string; sessionId: string; runId: string; instruction: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  pauseAgentRun(input: { projectId: string; sessionId: string; runId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  resumeAgentRun(input: { projectId: string; sessionId: string; runId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  cancelAgentRun(input: { projectId: string; sessionId: string; runId: string; reason?: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
  recoverAgentRun(input: { projectId: string; sessionId: string; runId: string; token: string }): Promise<TianyiAgentRunProjection | null>;
  getAgentRunProjection(input: { projectId: string; sessionId: string; runId: string; token: string }): Promise<TianyiAgentRunProjection | null>;
  handoffAgentCandidate(input: { projectId: string; sessionId: string; runId: string; candidateId: string; operationId: string; token: string }): Promise<TianyiAgentRunProjection>;
};

export type TianyiV2ControllerProps = {
  projectId: string;
  baseContextRequest: TianyiContextRequest | null;
  token: string;
  withConnection<T>(action: (token: string) => Promise<T>): Promise<T>;
  operations: TianyiV2Operations;
  executionBrief: TianyiNuwaExecutionBrief | null;
  onExecutionBrief(brief: TianyiNuwaExecutionBrief): void;
  onOpenNuwa(brief: TianyiNuwaExecutionBrief, exploration: StoryExploration): void;
  sharedSessionId: string | null;
  onSharedSessionId(sessionId: string | null): void;
  sharedDraft: string;
  onSharedDraft(value: string): void;
  recoverySignals?: TianyiV3RecoverySignals;
  onRecoveryAction?(action: TianyiV3RecoveryAction): void;
};

export type TianyiV2SessionController = {
  sendMode: TianyiComposerSendMode;
  setSendMode(mode: TianyiComposerSendMode): void;
  session: TianyiSessionMetadata | null;
  sessions: TianyiSessionMetadata[];
  loading: boolean;
  busy: boolean;
  error: string;
  status: string;
  transportState: TianyiTransportState;
  streamingText: string;
  recoveryIssue: TianyiV3RecoveryIssue | null;
  draft: string;
  setDraft(value: string): void;
  openSession(): Promise<void>;
  selectSession(sessionId: string): void;
  send(mode?: TianyiComposerSendMode): Promise<TianyiV3OperationResult>;
  refresh(): Promise<void>;
  authorMessages: TianyiVisibleMessage[];
  tianyiMessages: TianyiVisibleMessage[];
  sourceReceiptIds: string[];
  devReceiptFixture: boolean;
  attentionContextHash: string | null;
  latestResponse: TianyiGroundedAnswerResult["answer"];
  readReceiptDetail(receiptId: string): Promise<TianyiReceiptRead | null>;
  executionBrief: TianyiNuwaExecutionBrief | null;
  briefDraft: TianyiThreadBriefDraft | null;
  briefReviewOpen: boolean;
  briefStage: "compose" | "inspect" | "handoff";
  briefDirty: boolean;
  beginCloseReview(): void;
  closeBriefReview(): void;
  setBriefStage(stage: "compose" | "inspect" | "handoff"): void;
  updateBriefDraft(patch: Partial<Omit<TianyiThreadBriefDraft, "omittedItems">>): void;
  saveBrief(): Promise<void>;
  approveBrief(): Promise<TianyiV3OperationResult>;
  startNuwa(): Promise<TianyiV3OperationResult>;
  stopGeneration(): void;
  runRecoveryAction(action: TianyiV3RecoveryAction): Promise<TianyiV3OperationResult>;
};

export function useTianyiV2SessionController(props: TianyiV2ControllerProps): TianyiV2SessionController {
  const [sendMode, setSendMode] = useState<TianyiComposerSendMode>("ask");
  const [session, setSession] = useState<TianyiSessionMetadata | null>(null);
  const [sessions, setSessions] = useState<TianyiSessionMetadata[]>([]);
  const [latestResponse, setLatestResponse] = useState<TianyiGroundedAnswerResult["answer"]>(null);
  const [briefDraft, setBriefDraft] = useState<TianyiThreadBriefDraft | null>(null);
  const [projectedBrief, setProjectedBrief] = useState<TianyiNuwaExecutionBrief | null>(null);
  const [briefReviewOpen, setBriefReviewOpen] = useState(false);
  const [briefStage, setBriefStage] = useState<"compose" | "inspect" | "handoff">("compose");
  const [briefDirty, setBriefDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [transportState, setTransportState] = useState<TianyiTransportState>("idle");
  const [streamingText, setStreamingText] = useState("");
  const mountedProjectRef = useRef<string | null>(null);
  const startInFlightRef = useRef(false);
  const sessionOpenAttemptRef = useRef<string | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const draftRef = useRef(props.sharedDraft);
  const streamingAttemptRef = useRef(0);
  const sendAttemptRef = useRef<{ query: string; operationId: string; submissionId: string } | null>(null);
  const refreshRequestedForAttemptRef = useRef<string | null>(null);
  const [recoveryIssue, setRecoveryIssue] = useState<TianyiV3RecoveryIssue | null>(null);
  const devReceiptFixture = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fixture") === "receipt-backed";
  const devFixtureReceiptId = "receipt.dev.receipt-backed";
  const devFixtureStorageKey = `tianyan-dev-receipt-fixture:${props.projectId}`;
  const sourceState = props.recoverySignals?.sourceState ?? "current";
  const briefRevisionState = props.recoverySignals?.briefRevisionState ?? "current";
  const nuwaReturnRecoveryState = props.recoverySignals?.nuwaReturnRecoveryState ?? "available";
  const activeBrief = selectCurrentBriefProjection(props.executionBrief, projectedBrief, session?.id ?? null);

  useEffect(() => {
    draftRef.current = props.sharedDraft;
  }, [props.sharedDraft]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!props.token) return;
    const hydrating = !props.sharedSessionId && !sendAttemptRef.current;
    if (hydrating) setLoading(true);
    if (hydrating) setTransportState("connecting");
    setError("");
    let failed = false;
    try {
      const value = await props.withConnection((token) => props.operations.getSessionMetadata(props.projectId, props.sharedSessionId, token));
      const selected = props.sharedSessionId
        ? selectSharedTianyiSession(value, props.sharedSessionId)
        : selectResumableTianyiSession(value);
      if (props.sharedSessionId && !selected) props.onSharedSessionId(null);
      if (selected) {
        setSession(selected);
        props.onSharedSessionId(selected.id);
        setSessions(Array.isArray(value) ? value : [selected]);
      } else {
        setSession(null);
        setSessions(Array.isArray(value) ? value : []);
      }
      try {
        const latestBrief = await props.withConnection((token) => props.operations.readLatestBrief(props.projectId, token));
        if (latestBrief) {
          setProjectedBrief(latestBrief);
          if (!props.executionBrief || props.executionBrief.briefId !== latestBrief.briefId || props.executionBrief.revision !== latestBrief.revision || props.executionBrief.authorApprovalState !== latestBrief.authorApprovalState) props.onExecutionBrief(latestBrief);
        }
      } catch {
        // Brief recovery is best effort; conversation hydration must remain usable.
        setStatus("当前执行简报暂未恢复；仍可继续记录，稍后可重试。");
      }
    } catch (cause) {
      failed = true;
      setError(messageOf(cause));
      setTransportState("disconnected");
    } finally {
      setLoading(false);
      if (hydrating && !failed) setTransportState("idle");
    }
  }, [props]);

  useEffect(() => {
    if (mountedProjectRef.current === props.projectId) return;
    mountedProjectRef.current = props.projectId;
    setSession(null);
    setSessions([]);
    setLatestResponse(null);
    setBriefDraft(null);
    setProjectedBrief(null);
    setBriefReviewOpen(false);
    setBriefStage("compose");
    setBriefDirty(false);
    setSendMode("ask");
    setTransportState("idle");
    setStreamingText("");
    sendAttemptRef.current = null;
    stopRequestedRef.current = false;
    generationControllerRef.current?.abort();
    generationControllerRef.current = null;
  }, [props.projectId]);

  useEffect(() => {
    const externalIssue = sourceState === "stale"
      ? tianyiV3RecoveryIssue("source-stale")
      : briefRevisionState === "conflict"
        ? tianyiV3RecoveryIssue("brief-revision-conflict")
        : nuwaReturnRecoveryState === "failed"
          ? tianyiV3RecoveryIssue("nuwa-return-recovery-failed")
          : null;
    setRecoveryIssue((current) => externalIssue || (current && ["source-stale", "brief-revision-conflict", "nuwa-return-recovery-failed"].includes(current.kind) ? null : current));
  }, [briefRevisionState, nuwaReturnRecoveryState, sourceState]);

  useEffect(() => {
    void refresh();
    // The App facade functions are intentionally injected and may be recreated
    // by unrelated shell state; Session hydration follows identity inputs only.
  }, [props.projectId, props.sharedSessionId, props.token]);

  const openSession = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setTransportState("connecting");
    setError("");
    try {
      const operationId = sessionOpenAttemptRef.current
        ?? `tianyi.session-open.${stableTextKey(props.projectId)}.${Date.now().toString(36)}`;
      sessionOpenAttemptRef.current = operationId;
      const opened = await props.withConnection((token) => props.operations.openSession(props.projectId, operationId, token));
      const metadata = await props.withConnection((token) => props.operations.getSessionMetadata(props.projectId, opened.sessionId, token));
      const next = selectSharedTianyiSession(metadata, opened.sessionId);
      if (!next) throw new Error("天意对话已开始，但无法读取当前状态。");
      setSession(next);
      setSessions((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      props.onSharedSessionId(next.id);
      sessionOpenAttemptRef.current = null;
      setTransportState("idle");
      setStatus("新的天意对话已开始；记录和协作将共享它。");
    } catch (cause) {
      setError(messageOf(cause));
      setTransportState("failed");
    } finally {
      setBusy(false);
    }
  }, [busy, props]);

  const selectSession = useCallback((sessionId: string): void => {
    // Completed sessions remain selectable as read-only projections so that
    // their summaries, receipts, and source history can be reopened across
    // Creative and Conversation. Sending from a closed session still creates
    // a new session below; selection itself must not hide archived history.
    const selected = sessions.find((candidate) => candidate.id === sessionId);
    if (!selected) return;
    setSession(selected);
    props.onSharedSessionId(selected.id);
    setStatus("已回到这次天意对话；记录与协作仍共享同一条历史。");
  }, [props, sessions]);

  const send = useCallback(async (requestedMode: TianyiComposerSendMode = sendMode): Promise<TianyiV3OperationResult> => {
    const query = props.sharedDraft.trim();
    if (busy || !query) return { ok: false, issue: tianyiV3RecoveryIssue("send-failed") };
    if (!props.baseContextRequest) {
      setError("当前没有可授权给天意的来源范围。");
      return { ok: false, issue: tianyiV3RecoveryIssue("send-failed") };
    }
    setBusy(true);
    setError("");
    setStreamingText("");
    stopRequestedRef.current = false;
    const retry = sendAttemptRef.current?.query === query && recoveryIssue?.kind === "send-failed";
    setTransportState(retry ? "retrying" : "streaming");
    let activeSession = session && !session.closed ? session : null;
    const controller = new AbortController();
    generationControllerRef.current = controller;
    setStatus(requestedMode === "record" ? "正在把作者记录加入当前会话。" : "天意正在基于当前来源生成回应。");
    try {
      if (!activeSession) {
        const operationId = sessionOpenAttemptRef.current
          ?? `tianyi.session-open.${stableTextKey(props.projectId)}.${Date.now().toString(36)}`;
        sessionOpenAttemptRef.current = operationId;
        const opened = await props.withConnection((token) => props.operations.openSession(props.projectId, operationId, token));
        const metadata = await props.withConnection((token) => props.operations.getSessionMetadata(props.projectId, opened.sessionId, token));
        const next = selectSharedTianyiSession(metadata, opened.sessionId);
        if (!next) throw new Error("天意对话已开始，但无法读取当前状态。");
        activeSession = next;
        setSession(next);
        setSessions((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        props.onSharedSessionId(next.id);
        sessionOpenAttemptRef.current = null;
      }
      if (!activeSession) throw new Error("天意对话已开始，但当前状态不可用。");
      const attempt = retry && sendAttemptRef.current
        ? sendAttemptRef.current
        : {
            query,
            operationId: `tianyi-v2.grounded.${activeSession.id}.${activeSession.eventCount}.${stableTextKey(query)}`,
            submissionId: `tianyi-v2.submission.${activeSession.id}.${Date.now().toString(36)}.${stableTextKey(query)}`
          };
      sendAttemptRef.current = attempt;
      streamingAttemptRef.current = 0;
      refreshRequestedForAttemptRef.current = null;
      const currentSession: TianyiSessionMetadata = activeSession;
      const operation = await props.withConnection((token) => props.operations.runGroundedQuestion({
        projectId: props.projectId,
        sessionId: currentSession.id,
        operationId: attempt.operationId,
        submissionId: attempt.submissionId,
        explicitRetry: retry,
        question: query,
        token,
        signal: controller.signal,
        onDraft: (event) => {
          const changedAttempt = streamingAttemptRef.current !== event.attempt;
          streamingAttemptRef.current = event.attempt;
          setStreamingText((current) => changedAttempt ? event.text : `${current}${event.text}`);
          if (refreshRequestedForAttemptRef.current !== attempt.submissionId) {
            refreshRequestedForAttemptRef.current = attempt.submissionId;
            void refresh();
          }
        }
      }));
      setLatestResponse(operation.answer);
      if (draftRef.current.trim() === query) props.onSharedDraft("");
      await refresh();
      setLoading(false);
      setRecoveryIssue((current) => current?.kind === "send-failed" ? null : current);
      setStatus(requestedMode === "record"
        ? draftRef.current.trim() ? "作者记录已加入当前会话；下一段未发送内容仍保留。" : "作者记录已加入当前会话。"
        : "天意回应已加入同一条对话。");
      sendAttemptRef.current = null;
      setTransportState("ready");
      return { ok: true, value: undefined };
    } catch {
      const stopped = stopRequestedRef.current || controller.signal.aborted;
      setRecoveryIssue(tianyiV3RecoveryIssue("send-failed"));
      setError("");
      setStreamingText("");
      setLoading(false);
      setTransportState(stopped ? "stopped" : "failed");
      setStatus(stopped ? "本次回答已停止；你的输入仍保留。" : "发送未完成；你的输入仍保留。若作者记录已保存，会在重新读取后显示；重新发送只会重试这次回答。");
      if (!stopped) {
        try {
          await refresh();
        } catch {
          // Recovery remains explicit; the draft must stay intact even if a
          // metadata refresh is unavailable.
        }
      }
      return { ok: false, issue: tianyiV3RecoveryIssue("send-failed") };
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
      setBusy(false);
      setLoading(false);
    }
  }, [busy, props, recoveryIssue?.kind, refresh, sendMode, session]);

  const beginCloseReview = useCallback((): void => {
    if (!session || !props.baseContextRequest) {
      setError("当前还没有可收束的天意对话。");
      return;
    }
    const draft = deriveTianyiThreadBriefDraft({ session, contextRequest: props.baseContextRequest, brief: activeBrief });
    if (devReceiptFixture) {
      const stored = window.sessionStorage.getItem(devFixtureStorageKey) === "pinned" ? [devFixtureReceiptId] : [];
      setBriefDraft({ ...draft, pinnedSourceReceiptIds: stored, includeCurrentSources: stored.length > 0 });
    } else {
      setBriefDraft(draft);
    }
    setBriefStage(activeBrief?.authorApprovalState === "approved" ? "handoff" : activeBrief ? "inspect" : "compose");
    setBriefDirty(false);
    setBriefReviewOpen(true);
    setError("");
    setStatus("正在整理简报；当前对话保持开放，未纳入项不会写入资料。");
  }, [activeBrief, devFixtureReceiptId, devFixtureStorageKey, devReceiptFixture, props.baseContextRequest, session]);

  const closeBriefReview = useCallback((): void => {
    setBriefReviewOpen(false);
    setStatus("已回到当前线程；简报草稿仍保留在侧面检查区。");
  }, []);

  const updateBriefDraft = useCallback((patch: Partial<Omit<TianyiThreadBriefDraft, "omittedItems">>): void => {
    setBriefDraft((current) => current ? { ...current, ...patch } : current);
    if (devReceiptFixture && patch.pinnedSourceReceiptIds) {
      window.sessionStorage.setItem(devFixtureStorageKey, patch.pinnedSourceReceiptIds.includes(devFixtureReceiptId) ? "pinned" : "unpinned");
    }
    setBriefDirty(true);
  }, [devFixtureReceiptId, devFixtureStorageKey, devReceiptFixture]);

  const inspectBriefRevision = useCallback(async (brief: TianyiNuwaExecutionBrief): Promise<TianyiV3RecoveryIssue | null> => {
    const latest = await props.withConnection((token) => props.operations.readLatestBrief(props.projectId, token));
    if (!latest
      || latest.briefId !== brief.briefId
      || latest.revision !== brief.revision
      || latest.expectedHashes.brief !== brief.expectedHashes.brief) {
      return tianyiV3RecoveryIssue("brief-revision-conflict");
    }
    return null;
  }, [props]);

  const inspectFreshness = useCallback(async (brief: TianyiNuwaExecutionBrief): Promise<TianyiV3RecoveryIssue | null> => {
    const revisionIssue = await inspectBriefRevision(brief);
    if (revisionIssue) return revisionIssue;
    if (!props.baseContextRequest) return tianyiV3RecoveryIssue("source-stale");
    const receipts = await Promise.all(brief.selectedContextReceiptIds.map((receiptId) =>
      props.withConnection((token) => props.operations.readReceipt(
        props.projectId,
        receiptId,
        props.baseContextRequest!,
        token
      ))
    ));
    return receipts.some((receipt) => !receipt || receipt.currentStatus === "stale")
      ? tianyiV3RecoveryIssue("source-stale")
      : null;
  }, [inspectBriefRevision, props]);

  const saveBrief = useCallback(async (): Promise<void> => {
    if (busy || !session || !props.baseContextRequest || !briefDraft) return;
    setBusy(true);
    setError("");
    try {
      if (activeBrief) {
        const revisionIssue = await inspectBriefRevision(activeBrief);
        if (revisionIssue) {
          setRecoveryIssue(revisionIssue);
          setStatus("");
          return;
        }
      }
      const changes = mapTianyiThreadBriefChanges({ session, contextRequest: props.baseContextRequest, draft: briefDraft });
      const nextBrief = activeBrief
        ? await props.withConnection((token) => props.operations.reviseBrief({
            projectId: props.projectId,
            briefId: activeBrief.briefId,
            expectedHash: activeBrief.expectedHashes.brief,
            changes,
            token
          }))
        : await props.withConnection((token) => props.operations.createBrief({
            projectId: props.projectId,
            ...changes,
            operationId: `tianyi-v2.brief.${session.id}`,
            originatingTianyiSessionId: session.id,
            token
          } as ExecutionBriefDraftInput & { token: string }));
      props.onExecutionBrief(nextBrief);
      setProjectedBrief(nextBrief);
      setBriefStage("inspect");
      setBriefDirty(false);
      setRecoveryIssue(null);
      setStatus(`执行简报草稿已保存为版本 ${nextBrief.revision}；尚未批准。`);
    } catch (cause) {
      if (activeBrief) {
        try {
          const revisionIssue = await inspectBriefRevision(activeBrief);
          if (revisionIssue) {
            setRecoveryIssue(revisionIssue);
            setError("");
            return;
          }
        } catch {
          // Preserve the original operation failure when the comparison read
          // itself is unavailable.
        }
      }
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }, [activeBrief, briefDraft, busy, inspectBriefRevision, props, session]);

  const approveBrief = useCallback(async (): Promise<TianyiV3OperationResult> => {
    const input: TianyiV3OperationBoundaryInput = { operation: "approve", briefDirty, brief: activeBrief, recoverySignals: props.recoverySignals, startInFlight: false };
    if (busy) return { ok: false, issue: tianyiV3RecoveryIssue("approve-failed") };
    const boundary = validateTianyiV3OperationBoundary(input);
    if (!boundary.ok) {
      setRecoveryIssue(boundary.issue);
      setError("");
      return boundary;
    }
    setBusy(true);
    setError("");
    try {
      const freshnessIssue = await inspectFreshness(activeBrief!);
      if (freshnessIssue) {
        setRecoveryIssue(freshnessIssue);
        return { ok: false, issue: freshnessIssue };
      }
      const result = await runTianyiV3GuardedOperation(input, () => props.withConnection((token) => props.operations.approveBrief({
        projectId: props.projectId,
        briefId: activeBrief!.briefId,
        revision: activeBrief!.revision,
        expectedHash: activeBrief!.expectedHashes.brief,
        expectedSourceSetHash: activeBrief!.expectedHashes.sourceSet,
        token
      })));
      if (!result.ok) {
        setRecoveryIssue(result.issue);
        return result;
      }
      props.onExecutionBrief(result.value);
      setProjectedBrief(result.value);
      setBriefStage("handoff");
      setRecoveryIssue(null);
      setStatus("执行简报已批准；现在可以进入现有女娲入口。");
      return { ok: true, value: undefined };
    } catch {
      let issue = tianyiV3RecoveryIssue("approve-failed");
      try {
        issue = await inspectFreshness(activeBrief!) ?? issue;
      } catch {
        // The original approval failure remains the truthful recovery state.
      }
      setRecoveryIssue(issue);
      setError("");
      return { ok: false, issue };
    } finally {
      setBusy(false);
    }
  }, [activeBrief, briefDirty, busy, inspectFreshness, props]);

  const startNuwa = useCallback(async (): Promise<TianyiV3OperationResult> => {
    const input: TianyiV3OperationBoundaryInput = { operation: "start", briefDirty, brief: activeBrief, recoverySignals: props.recoverySignals, startInFlight: startInFlightRef.current };
    if (busy) return { ok: false, issue: tianyiV3RecoveryIssue("start-in-progress") };
    const boundary = validateTianyiV3OperationBoundary(input);
    if (!boundary.ok) {
      setRecoveryIssue(boundary.issue);
      setError("");
      return boundary;
    }
    startInFlightRef.current = true;
    setBusy(true);
    setError("");
    try {
      const freshnessIssue = await inspectFreshness(activeBrief!);
      if (freshnessIssue) {
        setRecoveryIssue(freshnessIssue);
        return { ok: false, issue: freshnessIssue };
      }
      const result = await runTianyiV3GuardedOperation({ ...input, startInFlight: false }, () => props.withConnection((token) => props.operations.startBrief(props.projectId, activeBrief!.briefId, activeBrief!.revision, token)));
      if (!result.ok) {
        setRecoveryIssue(result.issue);
        return result;
      }
      props.onOpenNuwa(activeBrief!, result.value);
      setRecoveryIssue(null);
      return { ok: true, value: undefined };
    } catch {
      let issue = tianyiV3RecoveryIssue("start-failed");
      try {
        issue = await inspectFreshness(activeBrief!) ?? issue;
      } catch {
        // The original start failure remains the truthful recovery state.
      }
      setRecoveryIssue(issue);
      setError("");
      setStatus(issue.kind === "start-failed" ? "女娲启动未完成；简报仍已批准，可以只重试交给女娲。" : "");
      return { ok: false, issue };
    } finally {
      startInFlightRef.current = false;
      setBusy(false);
    }
  }, [activeBrief, briefDirty, busy, inspectFreshness, props]);

  const runRecoveryAction = useCallback(async (action: TianyiV3RecoveryAction): Promise<TianyiV3OperationResult> => {
    if (action === "recheck-source") {
      props.onRecoveryAction?.(action);
      if (!activeBrief) return { ok: false, issue: tianyiV3RecoveryIssue("brief-missing") };
      try {
        const issue = await inspectFreshness(activeBrief);
        if (issue) {
          setRecoveryIssue(issue);
          return { ok: false, issue };
        }
        setRecoveryIssue(null);
        setStatus("来源已重新检查，可以继续确认当前简报。");
        return { ok: true, value: undefined };
      } catch {
        const issue = tianyiV3RecoveryIssue("source-stale");
        setRecoveryIssue(issue);
        return { ok: false, issue };
      }
    }
    if (action === "reload-compare-brief") {
      props.onRecoveryAction?.(action);
      try {
        const latest = await props.withConnection((token) => props.operations.readLatestBrief(props.projectId, token));
        if (!latest) {
          const issue = tianyiV3RecoveryIssue("brief-missing");
          setRecoveryIssue(issue);
          return { ok: false, issue };
        }
        props.onExecutionBrief(latest);
        setProjectedBrief(latest);
        setRecoveryIssue(null);
        setStatus("已载入最新简报版本；你的未保存草稿仍保留，可逐项比较后再保存。");
        return { ok: true, value: undefined };
      } catch {
        const issue = tianyiV3RecoveryIssue("brief-revision-conflict");
        setRecoveryIssue(issue);
        return { ok: false, issue };
      }
    }
    if (action === "reread-tianyi-session") {
      props.onRecoveryAction?.(action);
      await refresh();
      setRecoveryIssue(null);
      setStatus("已重新读取原天意会话；没有新建第二条历史。");
      return { ok: true, value: undefined };
    }
    return runTianyiV3RecoveryAction(action, { onRetrySend: send, onRetryApprove: approveBrief, onRetryStart: startNuwa });
  }, [activeBrief, approveBrief, inspectFreshness, props, refresh, send, startNuwa]);

  const readReceiptDetail = useCallback(async (receiptId: string): Promise<TianyiReceiptRead | null> => {
    if (!props.baseContextRequest) return null;
    return props.withConnection((token) => props.operations.readReceipt(
      props.projectId,
      receiptId,
      props.baseContextRequest!,
      token
    ));
  }, [props]);

  const stopGeneration = useCallback((): void => {
    stopRequestedRef.current = true;
    generationControllerRef.current?.abort();
    setTransportState("stopped");
  }, []);

  const authorMessages = useMemo(() => session?.visibleMessages.filter((message) => message.actor === "author") ?? [], [session]);
  const tianyiMessages = useMemo(() => session?.visibleMessages.filter((message) => message.actor === "tianyi") ?? [], [session]);
  const sourceReceiptIds = useMemo(() => {
    const ids = [...new Set(session?.visibleMessages.map((message) => message.receiptId).filter((value): value is string => Boolean(value)) ?? [])];
    return devReceiptFixture && !ids.includes(devFixtureReceiptId) ? [...ids, devFixtureReceiptId] : ids;
  }, [devFixtureReceiptId, devReceiptFixture, session]);
  const attentionContextHash = useMemo(() => {
    if (!devReceiptFixture) return activeBrief?.attentionContext ? `capsule:${activeBrief.attentionContext.capsuleHash || "unknown"}` : null;
    const pinned = briefDraft?.pinnedSourceReceiptIds || (window.sessionStorage.getItem(devFixtureStorageKey) === "pinned" ? [devFixtureReceiptId] : []);
    return devFixtureAttentionHash(pinned);
  }, [activeBrief?.attentionContext, briefDraft?.pinnedSourceReceiptIds, devFixtureReceiptId, devFixtureStorageKey, devReceiptFixture]);

  return {
    sendMode,
    setSendMode,
    session,
    sessions,
    loading,
    busy,
    error,
    status,
    transportState,
    streamingText,
    recoveryIssue,
    draft: props.sharedDraft,
    setDraft: props.onSharedDraft,
    openSession,
    selectSession,
    send,
    refresh,
    authorMessages,
    tianyiMessages,
    sourceReceiptIds,
    devReceiptFixture,
    attentionContextHash,
    latestResponse,
    readReceiptDetail,
    executionBrief: activeBrief,
    briefDraft,
    briefReviewOpen,
    briefStage,
    briefDirty,
    beginCloseReview,
    closeBriefReview,
    setBriefStage,
    updateBriefDraft,
    saveBrief,
    approveBrief,
    startNuwa,
    stopGeneration,
    runRecoveryAction
  };
}

function devFixtureAttentionHash(sourceIds: string[]): string {
  const input = sourceIds.slice().sort().join("|") || "none";
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return `dev-fixture-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function selectCurrentBriefProjection(
  external: TianyiNuwaExecutionBrief | null,
  local: TianyiNuwaExecutionBrief | null,
  sessionId: string | null
): TianyiNuwaExecutionBrief | null {
  if (!sessionId) return null;
  const candidates = [external, local].filter((brief): brief is TianyiNuwaExecutionBrief => brief?.originatingTianyiSessionId === sessionId);
  return candidates.sort((left, right) => right.revision - left.revision || (right.authorApprovalState === "approved" ? 1 : 0) - (left.authorApprovalState === "approved" ? 1 : 0))[0] ?? null;
}

function stableTextKey(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(36);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "天意操作未完成，请重试。";
}
