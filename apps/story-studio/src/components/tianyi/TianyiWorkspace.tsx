import { BookOpen, Check, CircleHelp, Inbox, LoaderCircle, Menu, RotateCcw, Sparkles } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import type { TianyiShellContext } from "../tianyiShellContext";
import type { ModelServiceStatus, StoryExploration, TianyiContextRequest, TianyiNuwaExecutionBrief, TianyiReceiptRead } from "../../lib/localTransport";
import { WorkspaceHeader } from "../../product-shell/WorkspaceHeader";
import { TianyiBriefReview } from "./TianyiBriefReview";
import { TianyiComposer } from "./TianyiComposer";
import { TianyiConversationRail } from "./TianyiConversationRail";
import { TianyiConversationThread } from "./TianyiConversationThread";
import { TianyiCreativeWorkspace } from "./TianyiCreativeWorkspace";
import { TianyiSourceInspector } from "./TianyiSourceInspector";
import { TIANYI_TRANSPORT_DESCRIPTIONS, TIANYI_TRANSPORT_LABELS, resolveTianyiTransportState, type TianyiTransportState } from "./tianyiTransportPresentation";
import { useTianyiV2SessionController, type TianyiV2Operations, type TianyiV3RecoveryAction, type TianyiV3RecoveryIssue, type TianyiV3RecoverySignals } from "./useTianyiSessionController";
import "../../styles/tianyi.css";

export type TianyiCollaborationMode = "creative" | "conversation";

const COLLABORATION_MODE_COPY: Record<TianyiCollaborationMode, { label: string; description: string }> = {
  creative: { label: "创意", description: "构思与扩展候选；不会直接写入故事事实。" },
  conversation: { label: "对话", description: "精细处理当前故事；任何修改先预览并由作者确认。" },
};

export function TianyiWorkspace(props: {
  projectId: string;
  projectTitle: string;
  context: TianyiShellContext;
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
  mode: TianyiCollaborationMode;
  onMode(mode: TianyiCollaborationMode): void;
  providerStatus?: ModelServiceStatus | null;
  onOpenLibrary(): void;
  onOpenWriting(): void;
  onOpenEventLine(eventId: string): void;
  onCreateFromTianyi(): void;
  onReturnProject(): void;
  onOpenWorkDock(): void;
  permissionControl?: ReactNode;
  recoverySignals?: TianyiV3RecoverySignals;
  onRecoveryAction?(action: TianyiV3RecoveryAction): void;
}) {
  const controller = useTianyiV2SessionController(props);
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);
  const [sourceInspectorOpen, setSourceInspectorOpen] = useState(false);
  const [sourceInspectorLoading, setSourceInspectorLoading] = useState(false);
  const [sourceReceipt, setSourceReceipt] = useState<TianyiReceiptRead | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const hasConversationHistory = Boolean(controller.session || controller.sessions.length);
  const contextLabel = props.context.contextLabel?.trim() && props.context.contextLabel !== "0" ? props.context.contextLabel : "当前作品";
  const intelligenceSceneLabel = props.context.mode === "intelligence" ? props.context.sourceLabels[1]?.trim() : "";
  const currentContextLabel = intelligenceSceneLabel || contextLabel;
  const sourceContextLabel = intelligenceSceneLabel || (contextLabel === "当前作品" ? "尚未选择章节" : contextLabel);
  const contextUnavailable = props.context.contextKind === "unavailable" || !props.baseContextRequest;
  const briefState = controller.executionBrief?.authorApprovalState === "approved" ? "approved" : controller.executionBrief ? "draft" : "idle";
  const transportState = resolveTianyiTransportState({
    loading: controller.loading,
    busy: controller.busy,
    providerReady: props.providerStatus?.tianyiDialogue.ready ?? null,
    error: controller.error,
    recoveryKind: controller.recoveryIssue?.kind,
    stopped: controller.transportState === "stopped",
    retrying: controller.transportState === "retrying"
  });
  const openSourceInspector = (trigger: HTMLButtonElement, receiptId: string) => {
    sourceTriggerRef.current = trigger;
    setSourceInspectorOpen(true);
    setSourceInspectorLoading(true);
    setSourceReceipt(null);
    void controller.readReceiptDetail(receiptId).then(setSourceReceipt).catch(() => setSourceReceipt(null)).finally(() => setSourceInspectorLoading(false));
  };
  const useExample = (value: string) => {
    controller.setDraft(value);
    controller.setSendMode("ask");
    if (!controller.session) void controller.openSession();
  };

  return <section className="workbench tianyi-workspace" data-testid="tianyi-workspace">
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="天意"
      title="天意"
      context={currentContextLabel}
      status={<TianyiTransportBadge state={transportState} />}
      prototype="workbench"
      icon={<BookOpen />}
      onOpenNavigation={props.onOpenLibrary}
      actions={<>
        {hasConversationHistory ? <button type="button" className="secondary-action tianyi-mobile-rail-trigger" onClick={() => { setContextOpen(false); setRailOpen(true); }}><Menu />会话</button> : null}
        <button type="button" className="secondary-action" onClick={() => { setRailOpen(false); setContextOpen((current) => !current); }} title="打开当前上下文" aria-expanded={contextOpen}>上下文</button>
        <button type="button" className="secondary-action" onClick={props.onOpenWorkDock} title="打开天意工作"><Sparkles />工作</button>
      </>}
      />
    <TianyiWorkspaceControlStrip mode={props.mode} onMode={props.onMode} state={transportState} contextLabel={currentContextLabel} />
    <div className={`tianyi-conversation-layout ${hasConversationHistory ? "has-history" : "is-empty-history"}`}>
      {hasConversationHistory ? <aside className={`tianyi-conversation-rail ${railOpen ? "is-open" : ""}`} aria-label="天意上下文栏">
        <TianyiConversationRail
          currentSession={controller.session}
          recentSessions={controller.sessions}
          projectTitle={props.projectTitle}
          sceneLabel={sourceContextLabel}
          briefState={briefState}
          busy={controller.busy}
          onCreateSession={() => void controller.openSession()}
          onSelectSession={(sessionId) => { props.onSharedSessionId(sessionId); controller.selectSession(sessionId); setRailOpen(false); }}
          onReturnProject={props.onReturnProject}
        />
        <button type="button" className="tianyi-rail-close" onClick={() => setRailOpen(false)}>关闭会话栏</button>
      </aside> : null}
      {railOpen && <button className="tianyi-mobile-backdrop" type="button" aria-label="关闭会话栏" onClick={() => setRailOpen(false)} />}
      <main className="tianyi-conversation-main" aria-live="polite">
        {props.mode === "creative" ? <TianyiCreativeWorkspace projectId={props.projectId} token={props.token} sessionId={props.sharedSessionId} operations={props.operations} onSessionId={props.onSharedSessionId} sharedDraft={props.sharedDraft} onDraft={props.onSharedDraft} onOpenEventLine={props.onOpenEventLine} withConnection={props.withConnection} /> : <>
        {controller.loading && <div className="tianyi-conversation-loading"><LoaderCircle className="is-spinning" /><strong>正在恢复可继续的天意对话</strong></div>}
        {!controller.loading && contextUnavailable && <MissingContextState onOpenWriting={props.onOpenWriting} />}
        {!controller.loading && !contextUnavailable && <>
          {controller.session
            ? <TianyiConversationThread messages={controller.session.visibleMessages} streamingText={controller.streamingText} onOpenSource={openSourceInspector} />
            : <NewConversationState busy={controller.busy} onOpenSession={() => void controller.openSession()} onExample={useExample} />}
          {controller.latestResponse && !controller.session?.visibleMessages.some((message) => message.actor === "tianyi" && message.visibleContent === controller.latestResponse?.summary) && <TianyiLatestResponse answer={controller.latestResponse} />}
          <TianyiComposer
            draft={controller.draft}
            hasSession={Boolean(controller.session)}
            canStartSession={!contextUnavailable}
            transportNote={TIANYI_TRANSPORT_DESCRIPTIONS[transportState]}
            busy={controller.busy}
            sendMode={controller.sendMode}
            onSendMode={controller.setSendMode}
            onDraftChange={controller.setDraft}
            onSend={(mode) => void controller.send(mode)}
            onStop={controller.stopGeneration}
          />
        </>}
        {controller.recoveryIssue && <RecoveryIssueNotice issue={controller.recoveryIssue} onRecover={() => void controller.runRecoveryAction(controller.recoveryIssue!.action)} />}
        {controller.error && <div className="tianyi-error" role="alert"><CircleHelp />{controller.error}<button type="button" className="icon-action" onClick={() => void controller.refresh()} aria-label="重新读取当前对话" title="重新读取当前对话"><RotateCcw /></button></div>}
        {controller.status && <p className="tianyi-status-line" role="status"><Check />{controller.status}</p>}
        </>}
      </main>
      <aside className={`tianyi-context-dock ${contextOpen ? "is-open" : ""}`} aria-label="当前上下文">
        <header><span><BookOpen />当前上下文</span><button type="button" className="icon-action" aria-label="关闭上下文" onClick={() => setContextOpen(false)}>×</button></header>
        <section><small>当前作品</small><strong>{props.projectTitle}</strong><span>{sourceContextLabel}</span></section>
        <section><small>当前来源</small><p>{props.context.sourceLabels.join(" · ") || "尚未附加来源"}</p></section>
        <section><small>执行简报</small><p>{controller.executionBrief ? `${controller.executionBrief.authorGoal} · ${briefState === "approved" ? "已批准" : "待审核"}` : "尚未创建"}</p><button type="button" className="secondary-action" disabled={!controller.session || controller.busy} onClick={() => { setContextOpen(false); controller.beginCloseReview(); }}><Check />整理简报</button></section>
        <section><small>创作出口</small><p>从当前对话进入创作中心；不会自动改写正文。</p><button type="button" className="secondary-action" disabled={controller.busy} onClick={props.onCreateFromTianyi}><BookOpen />从对话开始创作</button></section>
        <section><small>权限与模型</small>{props.permissionControl}<p>{TIANYI_TRANSPORT_DESCRIPTIONS[transportState]}</p><p>打开工作台不会自动调用 Provider。</p></section>
        <details><summary>来源与技术详情</summary><p>来源、revision、receipt、ID 与 hash 只在这里查看，不占据对话首屏。</p></details>
      </aside>
      {controller.briefReviewOpen && controller.briefDraft && <aside className="tianyi-brief-drawer" aria-label="执行简报检查"><TianyiBriefReview draft={controller.briefDraft} stage={controller.briefStage} brief={controller.executionBrief} briefDirty={controller.briefDirty} sourceLabels={props.context.sourceLabels} sourceReceiptIds={controller.sourceReceiptIds} sourceCount={controller.sourceReceiptIds.length} devReceiptFixture={controller.devReceiptFixture} attentionContextHash={controller.attentionContextHash} busy={controller.busy} onUpdate={controller.updateBriefDraft} onStageChange={controller.setBriefStage} onSave={() => void controller.saveBrief()} onApprove={() => void controller.approveBrief()} onStart={() => void controller.startNuwa()} onBack={controller.closeBriefReview} /></aside>}
    </div>
    {sourceInspectorOpen && <TianyiSourceInspector receipt={sourceReceipt} loading={sourceInspectorLoading} sourceCount={controller.sourceReceiptIds.length} sourceLabels={props.context.sourceLabels} returnFocusRef={sourceTriggerRef} onClose={() => setSourceInspectorOpen(false)} />}
  </section>;
}

function TianyiLatestResponse(props: { answer: NonNullable<ReturnType<typeof useTianyiV2SessionController>["latestResponse"]> }) {
  return <section className="tianyi-grounded-answer" data-testid="tianyi-latest-response" data-grounded-status={props.answer.status} aria-label="天意最新回应">
    <strong>天意</strong>
    <p>{props.answer.summary}</p>
    <div>{props.answer.claims.map((claim, index) => <span data-claim-status={claim.status} key={`${claim.status}-${index}`}>{claim.status === "fact" ? "事实" : claim.status === "candidate" ? "候选" : claim.status === "inference" ? "推断" : "未知"}</span>)}</div>
    <small>{props.answer.includedSources.length} 个已用来源 · {props.answer.excludedSources.length} 个未用来源</small>
  </section>;
}

function TianyiTransportBadge(props: { state: TianyiTransportState }) {
  return <span className={`tianyi-status is-${props.state}`} data-testid="tianyi-transport-status" data-transport-state={props.state}><Sparkles />{TIANYI_TRANSPORT_LABELS[props.state]}</span>;
}

function TianyiWorkspaceControlStrip(props: { mode: TianyiCollaborationMode; onMode(mode: TianyiCollaborationMode): void; state: TianyiTransportState; contextLabel: string }) {
  const modeCopy = COLLABORATION_MODE_COPY[props.mode] ?? COLLABORATION_MODE_COPY.conversation;
  return <section className="tianyi-workspace-control-strip" aria-label="天意协作状态">
    <div className="tianyi-mode-control">
      <span className="tianyi-control-eyebrow">工作方式</span>
      <div role="tablist" aria-label="天意工作方式">
        {(Object.keys(COLLABORATION_MODE_COPY) as TianyiCollaborationMode[]).map((mode) => <button type="button" role="tab" key={mode} aria-selected={props.mode === mode} className={props.mode === mode ? "is-active" : ""} onClick={() => props.onMode(mode)}>{COLLABORATION_MODE_COPY[mode].label}</button>)}
      </div>
      <small data-testid="tianyi-mode-description">{modeCopy.description}</small>
    </div>
    <div className="tianyi-workspace-context-summary"><span className="tianyi-control-eyebrow">当前上下文</span><strong>{props.contextLabel}</strong><small>{TIANYI_TRANSPORT_LABELS[props.state]}</small></div>
  </section>;
}

function NewConversationState(props: { busy: boolean; onOpenSession(): void; onExample(value: string): void }) {
  const examples = ["阿岚还不知道旧信的秘密，她接下来可能怎么行动？", "如果林远提前公开印章，哪些人物关系会改变？", "帮我检查这一场景是否存在信息泄漏。"];
  return <div className="tianyi-conversation-empty"><Inbox /><div><small>从一个问题开始</small><h1>告诉天意，你希望故事接下来如何生长……</h1><p>天意只会依据作者明确附加的当前作品、章节、人物、事件和来源回应。</p></div><button type="button" className="primary-action" onClick={props.onOpenSession} disabled={props.busy}><Sparkles />开始新对话</button><div className="tianyi-example-questions">{examples.map((example) => <button key={example} type="button" onClick={() => props.onExample(example)}>{example}</button>)}</div></div>;
}

function MissingContextState(props: { onOpenWriting(): void }) {
  return <div className="tianyi-conversation-empty" role="status"><Inbox /><div><small>需要一个明确上下文</small><h1>先选择要讨论的内容</h1><p>天意不会绕过来源边界推测世界事实。</p></div><button type="button" className="primary-action" onClick={props.onOpenWriting}><BookOpen />返回创作选择场景</button></div>;
}

function RecoveryIssueNotice(props: { issue: TianyiV3RecoveryIssue; onRecover(): void }) {
  return <div className="tianyi-recovery" role="alert"><CircleHelp /><span><strong>{props.issue.message}</strong><small>未完成操作没有被当作成功。</small></span><button type="button" className="secondary-action" onClick={props.onRecover}>恢复</button></div>;
}
