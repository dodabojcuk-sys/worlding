import { ArrowUpRight, CircleOff, Compass, GripVertical, ListChecks, MessageCircle, Pin, PinOff, Send, Square, WandSparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import {
  type TianyiGroundedAccessSelection,
  type TianyiContextRequest,
  type TianyiGroundedAnswerResult,
  type TianyiObjectContextRef,
  type ModelServiceStatus,
  type TianyiSessionMetadata
} from "../lib/localTransport";
import type { TianyiShellContext } from "./tianyiShellContext";
import {
  clampTianyiPinnedWidth,
  preserveTianyiScrollAnchor,
  resolveTianyiResponsivePanelMode,
  resizeTianyiPinnedWidth,
  summarizeTianyiContext,
  TIANYI_PINNED_WIDTH_MAX,
  TIANYI_PINNED_WIDTH_MIN,
  type TianyiResponsivePanelMode,
  type TianyiQuickPlacement
} from "./tianyiShellPresentation";
import { selectSharedTianyiSession } from "./tianyiSessionResume";
import { TianyiObjectContextChips } from "./TianyiObjectContextChips";
import { createTianyiOperationId, createTianyiSubmissionId } from "./tianyi/tianyiOperationId";
import { TianyiGroundedAccessSelector } from "./tianyi/TianyiGroundedAccessSelector";
import type { ProductWorkspaceMode } from "../product-shell/navigation/topLevelDestinationRegistry";
import { getTianyiContextualCapability } from "../../../../src/storyAgent/contextualCapabilityRegistry";
import { TianyiAgentManagementSurface } from "./tianyi/TianyiCreativeWorkspace";
import type { TianyiV2Operations } from "./tianyi/useTianyiSessionController";

export type TianyiDockMode = "dialogue" | "work";

export function TianyiQuickAssistant(props: {
  placement: TianyiQuickPlacement;
  mode: TianyiDockMode;
  workspace: ProductWorkspaceMode;
  pinnedWidth: number;
  projectId: string;
  token: string;
  context: TianyiShellContext;
  contextRequest: TianyiContextRequest | null;
  objectContextRefs: TianyiObjectContextRef[];
  availableContextRefs: TianyiObjectContextRef[];
  groundedAccess: TianyiGroundedAccessSelection;
  availableGroundedSubjects: TianyiObjectContextRef[];
  sessionId: string | null;
  draft: string;
  uiFontSize: "small" | "standard" | "large" | "xlarge";
  editorFontSize: "small" | "standard" | "large" | "xlarge";
  withConnection<T>(action: (token: string) => Promise<T>): Promise<T>;
  getSessionMetadata(projectId: string, sessionId: string | null, token: string): Promise<TianyiSessionMetadata | TianyiSessionMetadata[] | null>;
  getModelServiceStatus(token: string): Promise<ModelServiceStatus>;
  agentOperations: TianyiV2Operations;
  baseContextRequest: TianyiContextRequest | null;
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
  onSessionId(sessionId: string | null): void;
  onDraft(value: string): void;
  onEnsureNormalSession(token: string): Promise<string>;
  onAddContextRef(ref: TianyiObjectContextRef): void;
  onRemoveContextRef(ref: TianyiObjectContextRef): void;
  onGroundedAccess(value: TianyiGroundedAccessSelection): void;
  onPlacement(placement: TianyiQuickPlacement): void;
  onMode(mode: TianyiDockMode): void;
  onPinnedWidth(width: number): void;
  onOpenFull(): void;
  onClose(): void;
}) {
  const [session, setSession] = useState<TianyiSessionMetadata | null>(null);
  const [providerStatus, setProviderStatus] = useState<ModelServiceStatus | null>(null);
  const [profileId, setProfileId] = useState("");
  const [error, setError] = useState("");
  const [streamDraft, setStreamDraft] = useState("");
  const [groundedResult, setGroundedResult] = useState<TianyiGroundedAnswerResult | null>(null);
  const [fixtureWorkResult, setFixtureWorkResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const restoreComposerFocusRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const draftAttemptRef = useRef(0);
  const draftRef = useRef(props.draft);
  const isOpen = props.placement !== "closed";
  const isCharacterFateFixture = props.workspace === "data" && new URL(window.location.href).searchParams.get("view") === "character-fate" && new URL(window.location.href).searchParams.get("fixture") === "character-fate";
  const isCharacterStateFixture = props.workspace === "library" && new URL(window.location.href).searchParams.get("view") === "character-state" && new URL(window.location.href).searchParams.get("fixture") === "character-state";
  const isNuwaBoundedFixture = props.workspace === "nuwa" && new URL(window.location.href).searchParams.get("fixture") === "nuwa-bounded";
  const isMultiverseSingleDerivedFixture = (props.workspace === "multiverse" || props.workspace === "nuwa") && new URL(window.location.href).searchParams.get("fixture") === "multiverse-single-derived";
  const isWorkVersionCreationFixture = props.workspace === "writing" && new URL(window.location.href).searchParams.get("fixture") === "work-version-creation";
  const isOfflineFixture = isNuwaBoundedFixture || isMultiverseSingleDerivedFixture || isWorkVersionCreationFixture;
  const isCanvasWorkspace = props.workspace === "event-line" || props.workspace === "nuwa" || props.workspace === "multiverse" || isCharacterFateFixture || isCharacterStateFixture || isWorkVersionCreationFixture;
  const [responsivePanelMode, setResponsivePanelMode] = useState<TianyiResponsivePanelMode>(props.placement === "pinned" ? "right-dock" : "floating");

  useEffect(() => {
    draftRef.current = props.draft;
  }, [props.draft]);

  // A floating assistant would cover the canvas' selection, proposal and
  // review controls. Canvas workspaces therefore keep Tianyi in the shared
  // dock geometry; narrow layouts resolve that dock without losing its state.
  useEffect(() => {
    if (isCanvasWorkspace && props.placement === "floating") props.onPlacement("pinned");
  }, [isCanvasWorkspace, props.onPlacement, props.placement]);

  useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      returnFocusRef.current = activeElement?.matches("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])")
        ? activeElement
        : document.querySelector<HTMLElement>("[data-testid='tianyi-quick-launcher']");
      wasOpenRef.current = true;
      return;
    }
    if (isOpen || !wasOpenRef.current) return;
    wasOpenRef.current = false;
    const previousTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    const target = previousTarget?.isConnected
      ? previousTarget
      : document.querySelector<HTMLElement>("[data-testid='tianyi-quick-launcher']");
    target?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    setSession(null);
    setProviderStatus(null);
    setProfileId("");
    setError("");
    setStreamDraft("");
    setGroundedResult(null);
    setFixtureWorkResult(null);
    setPendingSubmissionId(null);
    draftAttemptRef.current = 0;
    scrollTopRef.current = 0;
  }, [props.projectId]);

  useEffect(() => {
    if (!isOpen) return;
    if (props.mode === "dialogue") inputRef.current?.focus();
    let cancelled = false;
    void props.withConnection((token) => props.getSessionMetadata(props.projectId, props.sessionId, token))
      .then((value) => {
        if (cancelled) return;
        const resumable = selectSharedTianyiSession(value, props.sessionId);
        if (!resumable) {
          setSession(null);
          props.onSessionId(null);
          return;
        }
        setSession(resumable);
        props.onSessionId(resumable.id);
      })
      .catch(() => undefined);
    void props.withConnection((token) => props.getModelServiceStatus(token))
      .then((value) => {
        if (cancelled) return;
        setProviderStatus(value);
        setProfileId((current) => current || value.profiles[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setProviderStatus(null);
      });
    return () => { cancelled = true; };
  }, [isOpen, props.mode, props.projectId, props.sessionId]);

  useEffect(() => {
    const pending = session?.groundedAttempts.slice().reverse().find((attempt) => attempt.retryRequired);
    if (!pending) {
      setPendingSubmissionId(null);
      return;
    }
    props.onDraft(pending.question);
    setProfileId(pending.profileId);
    setPendingSubmissionId(pending.submissionId);
    setError("上一次模型交付结果未知。只有点击“明确重试”才会再次发送，且上游可能收到重复请求。");
  }, [props.onDraft, session?.contentHash]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const targetScrollTop = pendingScrollRestoreRef.current ?? scrollTopRef.current;
    const restoreScroll = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = targetScrollTop;
    };
    restoreScroll();
    const firstFrame = window.requestAnimationFrame(() => {
      restoreScroll();
      window.requestAnimationFrame(() => {
        restoreScroll();
        pendingScrollRestoreRef.current = null;
      });
    });
    if (restoreComposerFocusRef.current) {
      restoreComposerFocusRef.current = false;
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    }
    return () => window.cancelAnimationFrame(firstFrame);
  }, [isOpen, props.placement]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const backdrop = backdropRef.current;
    const shell = backdrop?.closest<HTMLElement>(".story-studio-shell");
    if (!shell) return;
    const resolveMode = () => resolveTianyiResponsivePanelMode({
      placement: props.placement,
      productMode: shell.dataset.productMode || "",
      shellWidth: shell.getBoundingClientRect().width,
      navigationWidth: 0,
      pinnedWidth: clampTianyiPinnedWidth(props.pinnedWidth),
      pageDockWidth: 0
    });
    const measure = () => {
      const nextMode = resolveMode();
      setResponsivePanelMode(nextMode);
      delete shell.dataset.tianyiPanelMode;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      delete shell.dataset.tianyiPanelMode;
    };
  }, [isOpen, props.onPlacement, props.pinnedWidth, props.placement]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSurface();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, props.context.mode, props.onClose, props.onPlacement]);

  useEffect(() => {
    if (!isOpen || !isWorkVersionCreationFixture || !window.matchMedia("(max-width: 1120px)").matches) return;
    const backdrop = backdropRef.current;
    const host = backdrop?.closest<HTMLElement>(".global-tianyi-dock-host") || backdrop;
    const stage = host?.parentElement;
    const assistant = backdrop?.querySelector<HTMLElement>("#tianyi-quick-assistant");
    if (!stage || !host || !assistant) return;
    const focusTarget = returnFocusRef.current;
    const background = [...stage.children].filter((item): item is HTMLElement => item instanceof HTMLElement && item !== host);
    const previous = background.map((item) => ({ item, inert: item.inert, ariaHidden: item.getAttribute("aria-hidden") }));
    background.forEach((item) => { item.inert = true; item.setAttribute("aria-hidden", "true"); });
    const focusable = () => [...assistant.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")].filter((item) => item.getClientRects().length > 0);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    assistant.addEventListener("keydown", trapFocus);
    window.requestAnimationFrame(() => assistant.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")?.focus({ preventScroll: true }));
    return () => {
      assistant.removeEventListener("keydown", trapFocus);
      previous.forEach(({ item, inert, ariaHidden }) => {
        item.inert = inert;
        if (ariaHidden == null) item.removeAttribute("aria-hidden"); else item.setAttribute("aria-hidden", ariaHidden);
      });
      window.setTimeout(() => focusTarget?.isConnected && focusTarget.focus({ preventScroll: true }), 0);
    };
  }, [isOpen, isWorkVersionCreationFixture]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);
  useEffect(() => () => generationControllerRef.current?.abort(), []);

  if (!isOpen) return null;

  async function submit(): Promise<void> {
    if (!props.contextRequest) {
      setError("当前没有可授权的创作上下文。");
      return;
    }
    if (!providerStatus?.tianyiDialogue.ready) {
      setError("尚未连接可安全生成回答的模型。当前只能检查上下文，不能生成回答。");
      return;
    }
    const authorQuestion = props.draft.trim();
    if (!authorQuestion || generating) return;
    setGenerating(true);
    setError("");
    setStreamDraft("");
    setGroundedResult(null);
    const controller = new AbortController();
    generationControllerRef.current = controller;
    try {
      const result = await props.withConnection(async (token) => {
        let activeSessionId = session?.retentionMode === "normal" ? session.id : null;
        if (!activeSessionId) {
          activeSessionId = await props.onEnsureNormalSession(token);
          props.onSessionId(activeSessionId);
        }
        const submissionId = pendingSubmissionId ?? createTianyiSubmissionId();
        if (!pendingSubmissionId) setPendingSubmissionId(submissionId);
        return props.runGroundedQuestion({
          operationId: createTianyiOperationId("grounded-answer"),
          submissionId,
          explicitRetry: pendingSubmissionId !== null,
          profileId,
          question: authorQuestion,
          projectId: props.projectId,
          sessionId: activeSessionId,
          token,
          signal: controller.signal,
          onDraft: (event) => {
            const changedAttempt = draftAttemptRef.current !== event.attempt;
            draftAttemptRef.current = event.attempt;
            setStreamDraft((current) => changedAttempt ? event.text : `${current}${event.text}`);
          }
        });
      });
      setGroundedResult(result);
      setStreamDraft("");
      const metadata = await props.withConnection((token) => props.getSessionMetadata(props.projectId, result.sessionId, token));
      if (metadata && !Array.isArray(metadata)) setSession(metadata);
      props.onSessionId(result.sessionId);
      if (draftRef.current.trim() === authorQuestion) props.onDraft("");
      setPendingSubmissionId(null);
    } catch (cause) {
      setStreamDraft("");
      setError(cause instanceof Error ? cause.message : "天意真实回答未完成。");
    } finally {
      generationControllerRef.current = null;
      setGenerating(false);
    }
  }

  const providerConfigured = providerStatus?.providers.some((provider) => provider.configured) === true;
  const generationReady = providerStatus?.tianyiDialogue.ready === true;
  const contextSummary = summarizeTianyiContext(props.context);
  const pinnedWidth = clampTianyiPinnedWidth(props.pinnedWidth);
  const surfaceStyle = { "--tianyi-quick-width": `${pinnedWidth}px` } as CSSProperties;

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (props.placement !== "pinned") return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = pinnedWidth;
    event.currentTarget.setPointerCapture?.(pointerId);
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      props.onPinnedWidth(resizeTianyiPinnedWidth(startWidth, startX, moveEvent.clientX));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      resizeCleanupRef.current = null;
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId === pointerId) cleanup();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    resizeCleanupRef.current = cleanup;
  }

  function resizeFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (props.placement !== "pinned") return;
    const nextWidth = event.key === "ArrowLeft"
      ? pinnedWidth + 10
      : event.key === "ArrowRight"
        ? pinnedWidth - 10
        : event.key === "Home"
          ? TIANYI_PINNED_WIDTH_MIN
          : event.key === "End"
            ? TIANYI_PINNED_WIDTH_MAX
            : null;
    if (nextWidth === null) return;
    event.preventDefault();
    props.onPinnedWidth(clampTianyiPinnedWidth(nextWidth));
  }

  function changePlacement(): void {
    if (isCanvasWorkspace) return;
    const scrollElement = scrollRef.current;
    const currentScrollTop = scrollElement
      ? preserveTianyiScrollAnchor({
        currentScrollTop: scrollElement.scrollTop,
        scrollHeight: scrollElement.scrollHeight,
        clientHeight: scrollElement.clientHeight,
        previousAnchor: scrollTopRef.current
      })
      : scrollTopRef.current;
    scrollTopRef.current = currentScrollTop;
    pendingScrollRestoreRef.current = currentScrollTop;
    props.onPlacement(props.placement === "pinned" ? "floating" : "pinned");
  }

  function closeSurface(): void {
    if (props.context.mode === "intelligence") {
      const focusTarget = returnFocusRef.current?.isConnected
        ? returnFocusRef.current
        : document.querySelector<HTMLElement>("[data-testid='tianyi-quick-launcher']");
      props.onPlacement("closed");
      window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), 0);
      return;
    }
    props.onClose();
  }

  return <div ref={backdropRef} className={`tianyi-quick-backdrop is-${props.placement} is-${responsivePanelMode}`} role="presentation" data-right-dock-slot="tianyi" data-tianyi-placement={props.placement} data-tianyi-panel-mode={responsivePanelMode} data-tianyi-fixture={isWorkVersionCreationFixture ? "work-version-creation" : isMultiverseSingleDerivedFixture ? "multiverse-single-derived" : isNuwaBoundedFixture ? "nuwa-bounded" : "none"} style={surfaceStyle} onMouseDown={(event) => { if (event.target === event.currentTarget) closeSurface(); }}>
    <aside id="tianyi-quick-assistant" className={`tianyi-quick-assistant is-${props.placement} is-${responsivePanelMode}`} role="dialog" aria-modal={isWorkVersionCreationFixture && window.matchMedia("(max-width: 1120px)").matches} aria-labelledby="tianyi-quick-title" data-testid="tianyi-quick-assistant" data-tianyi-placement={props.placement} data-tianyi-panel-mode={responsivePanelMode} data-ui-font-size={props.uiFontSize} data-editor-font-size={props.editorFontSize} data-tianyi-session={session?.id ?? props.sessionId ?? "not-started"} data-tianyi-session-owner="story-continuity/session" data-tianyi-memory-owner="story-continuity/memory" data-tianyi-archive-owner="story-continuity/archive" data-tianyi-receipt-owner="story-continuity/receipt">
      {props.placement === "pinned" && <button type="button" className="tianyi-quick-resize-handle" role="separator" aria-orientation="vertical" aria-label="调整天意面板宽度" aria-valuemin={TIANYI_PINNED_WIDTH_MIN} aria-valuemax={TIANYI_PINNED_WIDTH_MAX} aria-valuenow={pinnedWidth} onPointerDown={beginResize} onKeyDown={resizeFromKeyboard}><GripVertical /></button>}
      <header>
        <span><Compass /><span><strong id="tianyi-quick-title">天意</strong><small>{props.context.mode === "intelligence" ? "当前单元的页面助手" : "当前工作现场的快速助手"}</small></span></span>
        <span className="tianyi-quick-header-actions">
          {!isCanvasWorkspace ? <button type="button" className="icon-action tianyi-quick-pin-action" onPointerDown={() => { restoreComposerFocusRef.current = document.activeElement === inputRef.current; }} onClick={changePlacement} aria-label={props.placement === "pinned" ? "取消固定快速天意" : "固定快速天意"} aria-pressed={props.placement === "pinned"}>{props.placement === "pinned" ? <PinOff /> : <Pin />}</button> : null}
          <button type="button" className="icon-action" onClick={props.onOpenFull} aria-label="进入完整天意"><ArrowUpRight /></button>
          <button type="button" className="icon-action" onClick={closeSurface} aria-label="关闭天意助手" title="关闭天意助手"><X /></button>
        </span>
      </header>
      <div ref={scrollRef} className="tianyi-quick-scroll" onScroll={(event) => {
        if (pendingScrollRestoreRef.current !== null) return;
        scrollTopRef.current = event.currentTarget.scrollTop;
      }}>
        <div className="tianyi-quick-modes" role="tablist" aria-label="天意工作方式">
          <button type="button" id="tianyi-dock-dialogue-tab" role="tab" aria-controls="tianyi-dock-dialogue-panel" aria-selected={props.mode === "dialogue"} className={props.mode === "dialogue" ? "is-active" : ""} onClick={() => props.onMode("dialogue")}><MessageCircle />对话</button>
          <button type="button" id="tianyi-dock-work-tab" role="tab" aria-controls="tianyi-dock-work-panel" aria-selected={props.mode === "work"} className={props.mode === "work" ? "is-active" : ""} onClick={() => props.onMode("work")}><ListChecks />工作</button>
        </div>
        {props.mode === "dialogue" && <section id="tianyi-dock-dialogue-panel" className="tianyi-quick-dialogue" role="tabpanel" aria-labelledby="tianyi-dock-dialogue-tab">
          <section className="tianyi-quick-context" aria-label="当前上下文"><span>正在查看：</span><strong>{contextSummary.label}</strong>{contextSummary.sources && <small>{contextSummary.sources}</small>}</section>
          {session?.visibleMessages.length ? <section className="tianyi-quick-messages" aria-label="当前对话">{session.visibleMessages.slice(-6).map((message) => <article className={`is-${message.actor}`} key={message.eventId}><small>{message.actor === "author" ? "你" : "天意"}</small><p>{message.visibleContent}</p></article>)}</section> : <p className="tianyi-quick-empty">围绕当前现场提问，对话会在快速天意与完整天意之间连续保留。</p>}
          {error && <p className="tianyi-error" role="alert">{error}</p>}
          {generating && <section className="tianyi-grounded-draft" aria-live="polite"><strong>天意正在生成并核对来源…</strong>{streamDraft && <pre>{streamDraft}</pre>}</section>}
          {groundedResult?.answer && <section className="tianyi-grounded-answer" data-grounded-status={groundedResult.answer.status}><strong>天意</strong><p>{groundedResult.answer.summary}</p><div>{groundedResult.answer.claims.map((claim, index) => <span data-claim-status={claim.status} key={`${claim.status}-${index}`}>{claim.status === "fact" ? "事实" : claim.status === "candidate" ? "候选" : claim.status === "inference" ? "推断" : "未知"}</span>)}</div><small>{groundedResult.includedSources.length} 个已用来源 · {groundedResult.excludedSources.length} 个未用来源</small></section>}
        </section>}
        {props.mode === "work" && <section id="tianyi-dock-work-panel" className="tianyi-dock-work-panel" role="tabpanel" aria-labelledby="tianyi-dock-work-tab">
          <section className="tianyi-quick-context" aria-label="当前工作范围"><span>当前范围：</span><strong>{contextSummary.label}</strong>{contextSummary.sources && <small>{contextSummary.sources}</small>}</section>
          {isWorkVersionCreationFixture ? <WorkVersionCreationFixtureWorkDock result={fixtureWorkResult} onResult={setFixtureWorkResult} onDraft={props.onDraft} /> : isMultiverseSingleDerivedFixture ? <MultiverseSingleDerivedWorkDock result={fixtureWorkResult} onResult={setFixtureWorkResult} onDraft={props.onDraft} /> : isNuwaBoundedFixture ? <NuwaBoundedFixtureWorkDock result={fixtureWorkResult} onResult={setFixtureWorkResult} onDraft={props.onDraft} /> : <>{isCharacterFateFixture ? <CharacterFateFixtureWorkDock result={fixtureWorkResult} onResult={setFixtureWorkResult} onDraft={props.onDraft} /> : isCharacterStateFixture ? <CharacterStateFixtureWorkDock result={fixtureWorkResult} onResult={setFixtureWorkResult} onDraft={props.onDraft} /> : <>
            <TianyiAgentManagementSurface projectId={props.projectId} token={props.token} sessionId={props.sessionId} sourceCount={props.contextRequest?.sourceRefs.length ?? 0} providerReady={providerStatus?.tianyiDialogue.ready ?? null} operations={props.agentOperations} baseContextRequest={props.baseContextRequest} sharedDraft={props.draft} onDraft={props.onDraft} onSessionId={(sessionId) => props.onSessionId(sessionId)} withConnection={props.withConnection} presentation="dock" currentPage={props.workspace === "event-line" ? "/event-line" : "/tianyi"} />
            <TianyiObjectContextChips refs={props.objectContextRefs} availableRefs={props.availableContextRefs} onAdd={props.onAddContextRef} onRemove={props.onRemoveContextRef} />
            <TianyiGroundedAccessSelector value={props.groundedAccess} subjects={props.availableGroundedSubjects} onChange={props.onGroundedAccess} />
          </>}<section className="tianyi-dock-work-presets" aria-label="当前空间的工作能力"><header><WandSparkles /><span><strong>{getTianyiContextualCapability(props.workspace).displayName}工作</strong><small>{getTianyiContextualCapability(props.workspace).scopeLabel}</small></span></header><div>{getTianyiContextualCapability(props.workspace).capabilities.map((capability) => <button type="button" className="secondary-action" key={capability.id} onClick={() => props.onDraft(capability.label)}>{capability.label}</button>)}</div></section></>}
        </section>}
      </div>
      {props.mode === "dialogue" && <footer>
        {isWorkVersionCreationFixture ? <section className="tianyi-quick-model-status is-compact" data-model-status="offline-fixture" aria-label="本次创作来源数据状态"><CircleOff /><span><strong>本次只使用确定性来源检查</strong><small>不调用真实模型，不执行适配器，也不修改故事事实。</small></span></section> : isNuwaBoundedFixture ? <section className="tianyi-quick-model-status is-compact" data-model-status="offline-fixture" aria-label="本次排演数据状态"><CircleOff /><span><strong>本次排演使用离线演示数据</strong><small>不调用真实模型；这里可以准备问题，但不会发送。</small></span></section> : isMultiverseSingleDerivedFixture ? <section className="tianyi-quick-model-status is-compact" data-model-status="offline-fixture" aria-label="本次版本数据状态"><CircleOff /><span><strong>本次只读取隔离演示数据</strong><small>不调用真实模型；这里可以准备问题，但不会发送。</small></span></section> : <section className="tianyi-quick-model-status is-compact" data-model-status={generationReady ? "ready" : providerConfigured ? "transfer-pending" : "not-configured"} aria-label="真实模型状态">
          <CircleOff /><span><strong>{generationReady ? "模型已连接" : providerConfigured ? "模型已配置，天意连接尚未启用" : "尚未连接模型"}</strong><small>{generationReady ? "可以基于已授权上下文提问。" : providerConfigured ? "故事内容仍保留在本地，启用安全传输前不会上传。" : "当前只能检查上下文，不能生成回答。"}</small></span>
        </section>}
        <label htmlFor="tianyi-quick-question">问天意</label>
        <textarea ref={inputRef} id="tianyi-quick-question" value={props.draft} rows={3} maxLength={4000} placeholder={isOfflineFixture ? "离线演示中可先记录问题…" : generationReady ? "围绕当前来源提问…" : "连接模型后可在这里准备问题"} disabled={!props.contextRequest} onChange={(event) => { props.onDraft(event.target.value); setError(""); setPendingSubmissionId(null); }} onKeyDown={(event) => { if (!isOfflineFixture && (event.metaKey || event.ctrlKey) && event.key === "Enter" && props.draft.trim()) void submit(); }} />
        {!isOfflineFixture ? <label className="tianyi-quick-profile" htmlFor="tianyi-quick-profile">模型<select id="tianyi-quick-profile" value={profileId} disabled={!providerStatus?.profiles.length || !generationReady} onChange={(event) => setProfileId(event.target.value)}><option value="">未连接</option>{providerStatus?.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.label}</option>)}</select></label> : null}
        <div>{isOfflineFixture ? <button type="button" className="primary-action" disabled><Send />离线演示不发送</button> : generating ? <button type="button" aria-label="停止天意回答" onClick={() => generationControllerRef.current?.abort()}><Square />停止</button> : <button type="button" className="primary-action" aria-label={pendingSubmissionId ? "明确重试快速天意问题" : "提交快速天意问题"} disabled={!props.draft.trim() || !generationReady} onClick={() => void submit()}><Send />{pendingSubmissionId ? "明确重试" : "发送"}</button>}</div>
      </footer>}
    </aside>
  </div>;
}

function NuwaBoundedFixtureWorkDock(props: { result: string | null; onResult(value: string): void; onDraft(value: string): void }) {
  const actions = [
    ["解释当前步骤", "当前步骤让沈砚展示可见的潮纹与行动，阿芜只回应自己能观察到的内容。没有把完整来信或寄信人身份交给阿芜。"],
    ["检查角色知识边界", "阿芜可以说自己见过守夜记录残页，但不能确认寄信人。被挡下的越界判断没有改变任何角色认知。"],
    ["列出两个结果的差异", "原始排演保留信纸上的旧名痕迹；临时走向改为两人先核对守夜记录。铜钥匙、灯塔历史与寄信人未知均保持不变。"],
    ["查找仍然未知", "寄信人身份、旧名出现的精确时间、守夜记录的完整出处仍未确定。"],
    ["准备导演纠正", "建议：不要展示完整来信，只询问阿芜亲历的守夜记录；纠正只影响后续步骤。"]
  ] as const;
  return <section className="nuwa-bounded-work-dock-fixture" data-testid="nuwa-bounded-work-dock-fixture" data-real-provider-calls="0"><header><WandSparkles /><span><strong>离线排演助手</strong><small>本次排演使用离线演示数据</small></span></header><p>未调用真实模型。以下结果只解释当前排演，不会改变故事。</p><div>{actions.map(([label, result]) => <button type="button" className="secondary-action" onClick={() => props.onResult(result)} key={label}>{label}</button>)}</div><button type="button" className="secondary-action" onClick={() => props.onDraft("请把导演纠正写成：不要展示完整来信，只询问阿芜亲历的守夜记录。")}>把纠正写入问题草稿</button>{props.result && <article aria-live="polite"><strong>离线解释</strong><p>{props.result}</p><small>没有发送任何模型请求</small></article>}</section>;
}

function WorkVersionCreationFixtureWorkDock(props: { result: string | null; onResult(value: string): void; onDraft(value: string): void }) {
  const actions = [
    ["解释旧来源与当前主线", "这份创作稿最初固定引用主线第 1 版；当前主线已到第 3 版。旧来源仍完整，不是损坏，也不会自动更新正文。"],
    ["列出新增、删除和变化", "当前主线增加灯塔巡检窗口，移除直接进入灯塔的旧计划，并调整了核对旧名的目的。"],
    ["列出保持不变", "人物知识边界、人物命运、世界状态和正式关系都保持不变，本轮只读展示影响。"],
    ["查找未知、冲突与缺口", "灯塔巡检时间仍未知；旧名记录人存在来源冲突；旧名首次出现日期缺少证据。"],
    ["解释为什么不能重新核对", "若主线在打开对照后再次变化，或来源清单缺失、指纹不一致，系统会阻断确认并要求重新打开对照。"],
    ["准备重新核对审查", "重新核对只追加一个创作稿修订并固定引用主线第 3 版；正文不会自动改写，旧修订仍保留。"],
    ["解释写入边界", "确认后只追加 OutputArtifact 修订与 WorkVersion 引用修订；Canon、Event、WorldState、Character、Relation 写入均为 0。"]
  ] as const;
  return <section className="nuwa-bounded-work-dock-fixture" data-testid="work-version-creation-work-dock" data-real-provider-calls="0"><header><WandSparkles /><span><strong>离线创作来源助手</strong><small>确定性读取隔离演示数据 · Provider 0 · 插件 0</small></span></header><p>它可以解释来源差异和写入边界，但不会自动修改正文或替作者确认。</p><div>{actions.map(([label, result]) => <button type="button" className="secondary-action" onClick={() => props.onResult(result)} key={label}>{label}</button>)}</div><button type="button" className="secondary-action" onClick={() => props.onDraft("请准备来源重新核对审查，但不要修改正文、来源或作品主线。")}>把审查问题放入草稿</button>{props.result && <article aria-live="polite"><strong>确定性检查结果</strong><p>{props.result}</p><small>REAL_PROVIDER_CALLS=0 · PLUGIN_EXECUTIONS=0 · STORY_DOMAIN_WRITES=0</small></article>}</section>;
}

function MultiverseSingleDerivedWorkDock(props: { result: string | null; onResult(value: string): void; onDraft(value: string): void }) {
  const actions = [
    ["解释版本来源", "这条走向由当前主线第 1 版直接派生，来源是独立女娲 Run 中已完成的旧名线索纠正走向。"],
    ["列出所选变化", "只有一条 Event 变化：在进入灯塔前先核对旧名守夜记录。Character、WorldState 与 Relation 不写入。"],
    ["检查未知与冲突", "寄信人身份和旧名出现的精确世界时间仍未知；不能把推测变成事实。"],
    ["说明正式写入计划", "只有作者最终确认后写入 Event 1 条，并追加主线版本修订 1 次；其他正式写入为 0。"],
    ["解释版本锁定", "主线融入后从第 1 版进入第 2 版，派生走向仍锁定在来源第 1 版，不会自动同步。"]
  ] as const;
  return <section className="nuwa-bounded-work-dock-fixture" data-testid="multiverse-single-derived-work-dock" data-real-provider-calls="0"><header><WandSparkles /><span><strong>离线版本助手</strong><small>本次只读取隔离演示数据，不调用真实模型</small></span></header><p>它可以解释来源、差异和写入边界，但不能替你完成任何正式写入。</p><div>{actions.map(([label, result]) => <button type="button" className="secondary-action" onClick={() => props.onResult(result)} key={label}>{label}</button>)}</div><button type="button" className="secondary-action" onClick={() => props.onDraft("请解释当前版本对照中唯一可选的 Event 变化，不执行写入。")}>把问题放入草稿</button>{props.result && <article aria-live="polite"><strong>离线解释</strong><p>{props.result}</p><small>REAL_PROVIDER_CALLS=0 · FORMAL_WRITES=0</small></article>}</section>;
}

function CharacterFateFixtureWorkDock(props: { result: string | null; onResult(value: string): void; onDraft(value: string): void }) {
  const actions = [
    ["解释当前轨迹", "沈砚的实际变化来自收信、钥匙交接与有条件信任；灯塔行动仍是规划，潮声低语仍是候选。"],
    ["列出关键转折", "关键转折：#1 雾港来信改变信息边界；#2 铜钥匙交接改变持有与信任；#5 账册产生来源冲突。"],
    ["对照实际与规划", "实际：已收信并取得钥匙。规划：调查灯塔第三层。规划未被表述为已发生。"],
    ["查找证据缺口", "证据缺口：潮声低语的世界时间未知；账册主条目与旁注冲突；钥匙来源 v1 已过期。"],
    ["检查角色知识越界", "沈砚尚不知道寄信人、钥匙能打开的门，也未亲历阿芜声称的低语；这些不能进入已确认知识。"]
  ] as const;
  return <section className="character-fate-work-dock-fixture" data-testid="character-fate-work-dock-fixture" data-provider-runtime="deterministic-fixture" data-real-provider-calls="0"><header><WandSparkles /><span><strong>角色命运分析 · Fixture</strong><small>确定性隔离运行时；不调用真实 Provider</small></span></header><div>{actions.map(([label, result]) => <button type="button" className="secondary-action" onClick={() => props.onResult(result)} key={label}>{label}</button>)}</div><button type="button" className="secondary-action" onClick={() => props.onDraft("准备一个补充潮声低语时间与来源的候选，只送入现有 Candidate/Impact Review，不写入正式故事。")}>准备来源补充候选</button>{props.result && <article aria-live="polite"><strong>确定性分析结果</strong><p>{props.result}</p><small>WORK_DOCK_REAL_PROVIDER_RESULT=NO_THIS_TASK</small></article>}</section>;
}

function CharacterStateFixtureWorkDock(props: { result: string | null; onResult(value: string): void; onDraft(value: string): void }) {
  const actions = [
    ["检查角色知识边界", "已验证：沈砚知道来信警告。越界：寄信人身份仍未知；对旧守塔人的判断只是怀疑，不能成为世界事实。"],
    ["列出明确未知", "寄信人身份、旧名出现的精确世界时间、阿芜未说出的私密判断均保持未知。"],
    ["查找来源冲突", "账册主条目记为守夜第三夜，旁注记为第五夜；两侧有效来源同时保留，等待作者判断。"],
    ["查看关系认知差异", "沈砚认为两人是有条件合作；阿芜认为可以分享钥匙线索，但不能分享私密判断。Relation truth 未被改写。"],
    ["打开相关事件", "相关 Event：雾港来信、铜钥匙交到手中、潮桥上的有条件信任；稳定 Event ID 可下钻。"]
  ] as const;
  return <section className="character-state-work-dock-fixture" data-testid="character-state-work-dock-fixture" data-provider-runtime="deterministic-fixture" data-real-provider-calls="0"><header><WandSparkles /><span><strong>角色状态检查 · Fixture</strong><small>确定性只读工具；不调用真实 Provider</small></span></header><div>{actions.map(([label, value]) => <button type="button" className="secondary-action" onClick={() => props.onResult(value)} key={label}>{label}</button>)}</div><button type="button" className="secondary-action" onClick={() => props.onDraft("准备一个角色状态补充候选，只进入现有 Candidate/Impact Review，不直接写入正式故事。")}>准备状态补充候选</button>{props.result && <article aria-live="polite"><strong>确定性检查结果</strong><p>{props.result}</p><small>WORK_DOCK_REAL_PROVIDER_RESULT=NO_THIS_TASK · writes=0</small></article>}</section>;
}
