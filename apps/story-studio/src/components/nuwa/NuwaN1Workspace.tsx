import { readConversationRunIds, rememberConversationRun } from "../../product-shell/runtime/tianyiShellSessionRecovery";
import { resolveNuwaPaneWidths } from "./nuwaAuxiliaryLayout";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CirclePause, CirclePlay, Eye, FileClock, FilePlus2, GitBranch, History, Map as MapIcon, MessageSquarePlus, Network, OctagonX, PanelRight, Play, RefreshCw, Send, Settings2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import {
  autoApplyNuwaN1Result,
  createNuwaN1Candidate,
  createNuwaN1Run,
  cueNuwaN1Run,
  decideNuwaN1Director,
  freezeNuwaN1AutomaticDraft,
  getNuwaN1Bootstrap,
  getNuwaN1Latest,
  getNuwaN1Run,
  getMultiverseWorkVersions,
  replayNuwaN1Run,
  rollbackNuwaN1AutomaticApplication,
  runNuwaN1Action,
  runNuwaN1Continuously,
  suggestNuwaN1Director,
  setupNuwaN1,
  type NuwaN1Bootstrap,
  type NuwaN1CueAddressee,
  type NuwaN1ReadModel,
  type NuwaN1Run,
  type NuwaN1Setup,
  type NuwaN1ScopeSelection,
  type NuwaN1Step,
  type MultiverseWorkVersion
} from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { useWorkspaceSurface, workspaceSurfaceManager } from "../../product-shell/WorkspaceDockCoordinator";
import { clampNuwaAuxiliaryWidth, readNuwaAuxiliaryLayout, writeNuwaAuxiliaryLayout, type NuwaAuxiliaryLayout } from "./nuwaAuxiliaryLayout";
import type { BrowsedEvent } from "./NuwaEventLineRail";
import type { StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference";

const MAX_PARTICIPANTS = 3;
const MIN_PARTICIPANTS = 2;
function canResumeDispatchBlockedRun(run: NuwaN1Run): boolean {
  const last = run.attempts.at(-1);
  if (run.status !== "blocked" || run.providerDispatchEvidence !== "complete" || run.providerDispatches >= 12
    || run.attempts.some((attempt) => attempt.outcome === "pending")
    || last?.outcome !== "failed" || last.tool.status !== "completed") return false;
  if (!last) return false;
  const budgetBlocked = last.dispatches.some((dispatch) => dispatch.phase === "continue-after-tool" && dispatch.status === "failed" && dispatch.detail === "continue-after-tool failed: Provider request budget is exhausted; dispatch was blocked before transport.")
    && last.dispatches.some((dispatch) => dispatch.phase === "provider" && dispatch.status === "completed");
  const transportUnavailable = last.dispatches.some((dispatch) => dispatch.phase === "continue-after-tool" && dispatch.status === "failed" && dispatch.detail === "continue-after-tool failed: 当前模型服务暂时不可用。")
    && last.dispatches.some((dispatch) => dispatch.phase === "provider" && dispatch.status === "unknown" && dispatch.detail === "当前模型服务暂时不可用。");
  return budgetBlocked || transportUnavailable;
}
type FormalNodePreselect = { projectId: string; storyUnitId: string; eventId: string; narrativePathId: string; workVersionId: string | null };

function isSelectableWorkVersion(version: MultiverseWorkVersion) {
  return version.identity.status === "active"
    && (version.identity.kind === "root" || version.identity.kind === "derived");
}

function readFormalNodePreselect(projectId: string): FormalNodePreselect | null {
  const key = `tianyan-nuwa-n1-preselect-context:${projectId}`;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const input = value as Partial<FormalNodePreselect>;
    if (input.projectId !== projectId || !input.storyUnitId || !input.eventId || !input.narrativePathId) return null;
    window.sessionStorage.removeItem(key);
    return { projectId, storyUnitId: input.storyUnitId, eventId: input.eventId, narrativePathId: input.narrativePathId, workVersionId: typeof input.workVersionId === "string" ? input.workVersionId : null };
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function NuwaN1Workspace(props: { runtime: TianyanShellRuntimeState; onOpenTianyi?(reference: StoryStudioEventReference, initialDraft: string, sourceLabels?: string[]): void }) {
  const projectId = props.runtime.project?.id ?? null;
  const projectIdRef = useRef(projectId);
  const operationGeneration = useRef(0);
  const cueTargetRef = useRef<HTMLSelectElement | null>(null);
  projectIdRef.current = projectId;
  const [bootstrap, setBootstrap] = useState<NuwaN1Bootstrap | null>(null);
  const [run, setRun] = useState<NuwaN1ReadModel | null>(null);
  const [setup, setSetup] = useState<NuwaN1Setup | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [participantGoals, setParticipantGoals] = useState<Record<string, string>>({});
  const [storyUnitId, setStoryUnitId] = useState("");
  const [storylineKey, setStorylineKey] = useState("");
  const [scopeMode, setScopeMode] = useState<NuwaN1ScopeSelection["mode"]>("bounded");
  const [endStoryUnitId, setEndStoryUnitId] = useState("");
  const [relationTypeId, setRelationTypeId] = useState<string | null>(null);
  const [workVersions, setWorkVersions] = useState<MultiverseWorkVersion[]>([]);
  const [workVersionId, setWorkVersionId] = useState("");
  const [goal, setGoal] = useState("");
  const [cue, setCue] = useState("");
  const [cueTarget, setCueTarget] = useState<"" | NuwaN1CueAddressee["kind"]>("");
  const [cueDrafts, setCueDrafts] = useState<Record<string, string>>({});
  const [cueActorIds, setCueActorIds] = useState<string[]>([]);
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { setSelectionMode(false); setSettingsOpen(false); }, [run?.run?.runId]);
  const draftKey = projectId && run?.run?.runId ? `tianyan-nuwa-draft:${projectId}:${run.run.runId}` : null;
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
  useEffect(() => {
    let saved: { cue?: string; target?: typeof cueTarget; cueDrafts?: Record<string, string>; actorIds?: string[]; selectedStepIds?: string[] } = {};
    try { saved = JSON.parse(draftKey ? (window.localStorage.getItem(draftKey) ?? window.sessionStorage.getItem(draftKey)) ?? "{}" : "{}") ?? {}; } catch { /* malformed local draft is not dispatched */ }
    const target = ["nuwa", "actors", "all-actors"].includes(saved.target ?? "") ? saved.target! : "";
    const drafts = Object.fromEntries(Object.entries(saved.cueDrafts ?? {}).filter(([key, value]) => ["", "nuwa", "actors", "all-actors"].includes(key) && typeof value === "string").map(([key, value]) => [key, value.slice(0, 800)]));
    setCueDrafts(drafts);
    setCue(typeof drafts[target] === "string" ? drafts[target] : typeof saved.cue === "string" ? saved.cue.slice(0, 800) : "");
    setCueTarget(target);
    setCueActorIds(Array.isArray(saved.actorIds) ? saved.actorIds.filter((id) => run?.run?.participants.some((actor) => actor.id === id)) : []);
    if (Array.isArray(saved.selectedStepIds)) setSelectedStepIds(saved.selectedStepIds.filter((id) => run?.run?.steps.some((step) => step.stepId === id)));
    setLoadedDraftKey(draftKey);
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return;
    try { window.localStorage.setItem(draftKey, JSON.stringify({ cue, cueDrafts: { ...cueDrafts, [cueTarget]: cue }, target: cueTarget, actorIds: cueActorIds, selectedStepIds })); } catch { /* storage unavailable; current draft remains in memory */ }
  }, [draftKey, loadedDraftKey, cue, cueDrafts, cueTarget, cueActorIds, selectedStepIds]);
  const changeCueTarget = (next: typeof cueTarget) => {
    setCueDrafts((current) => ({ ...current, [cueTarget]: cue }));
    setCue(cueDrafts[next] ?? "");
    setCueTarget(next);
    setCueActorIds([]);
  };
  const [inspectorTab, setInspectorTab] = useState<"context" | "step" | "log">("context");
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queuedParticipantId, setQueuedParticipantId] = useState<string | null>(null);
  const [formalNodePreselect, setFormalNodePreselect] = useState<FormalNodePreselect | null>(null);
  const [browsedEvent, setBrowsedEvent] = useState<BrowsedEvent | null>(null);
  useEffect(() => {
    const browse = (event: Event) => setBrowsedEvent((event as CustomEvent<BrowsedEvent | null>).detail);
    window.addEventListener("tianyan-nuwa-browse-event", browse);
    return () => window.removeEventListener("tianyan-nuwa-browse-event", browse);
  }, []);
  const [auxiliary, setAuxiliary] = useState<NuwaAuxiliaryLayout>(() => readNuwaAuxiliaryLayout(projectId));
  const workspaceSurface = useWorkspaceSurface();
  const inspectorOpen = workspaceSurface.activeSurface?.kind === "nuwa-inspector";
  const previousDirector = [...(run?.run?.directorHistory ?? [])].reverse().find((item) => item.status === "adopted");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const mobileReadRef = useRef<HTMLDivElement | null>(null);
  const mobileReadKey = projectId && run?.run?.runId ? `tianyan-nuwa-mobile-read:${projectId}:${run.run.runId}` : null;
  useEffect(() => {
    if (!mobileReadKey || !run?.run || !window.matchMedia("(max-width: 520px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      const scroll = mobileReadRef.current;
      if (!scroll) return;
      const saved = Number(window.sessionStorage.getItem(mobileReadKey));
      if (Number.isFinite(saved) && saved > 0) scroll.scrollTop = saved;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mobileReadKey, Boolean(run?.run)]);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [eventDrawer, setEventDrawer] = useState(false);
  const panes = resolveNuwaPaneWidths(bodyWidth, false, auxiliary.auxiliaryWidth, false);
  const eventVisible = auxiliary.auxiliaryOpen && eventDrawer;
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => setBodyWidth(body.getBoundingClientRect().width));
    observer.observe(body);
    return () => observer.disconnect();
  }, [Boolean(bootstrap)]);

  useEffect(() => {
    setAuxiliary(readNuwaAuxiliaryLayout(projectId));
    setEventDrawer(false);
    setBrowsedEvent(null);
  }, [projectId]);
  const updateAuxiliary = (next: Partial<NuwaAuxiliaryLayout>) => setAuxiliary((current) => {
    const merged: NuwaAuxiliaryLayout = { auxiliaryOpen: next.auxiliaryOpen ?? current.auxiliaryOpen, auxiliaryWidth: clampNuwaAuxiliaryWidth(next.auxiliaryWidth ?? current.auxiliaryWidth) };
    writeNuwaAuxiliaryLayout(projectIdRef.current, merged);
    return merged;
  });

  const openInspector = (context: { actorId?: string | null; stepId?: string | null } = {}) => {
    setEventDrawer(false);
    workspaceSurfaceManager.openSurface({
      kind: "nuwa-inspector",
      context: {
        projectId,
        workVersionId: workVersionId || null,
        runId: run?.run?.runId ?? null,
        actorId: context.actorId ?? selectedActorId,
        stepId: context.stepId ?? selectedStepId
      }
    });
  };

  useEffect(() => {
    operationGeneration.current += 1;
    let active = true;
    setBootstrap(null); setRun(null); setSetup(null); setParticipantIds([]); setParticipantGoals({}); setStoryUnitId(""); setStorylineKey(""); setScopeMode("bounded"); setEndStoryUnitId(""); setRelationTypeId(null); setWorkVersions([]); setWorkVersionId(""); setGoal(""); setSelectedStepIds([]); setSelectedActorId(null); workspaceSurfaceManager.closeSurface("nuwa-inspector"); setBusy(false); setInterrupting(false); setError(null); setNotice(null); setQueuedParticipantId(null); setFormalNodePreselect(null);
    if (!projectId) return () => { active = false; };
    const conversationId = props.runtime.tianyiConversationId;
    const newRunRequested = new URLSearchParams(window.location.search).get("nuwaView") === "new";
    const requestedRunId = new URLSearchParams(window.location.search).get("runId")?.trim() || (conversationId ? readConversationRunIds(window.localStorage, projectId, conversationId).at(-1) : null) || null;
    void Promise.all([getNuwaN1Bootstrap(projectId), requestedRunId && !newRunRequested ? getNuwaN1Run(projectId, requestedRunId) : getNuwaN1Latest(projectId, conversationId), getMultiverseWorkVersions(projectId)]).then(([nextBootstrap, latestRead, versions]) => {
      if (!active) return;
      const latest = newRunRequested ? { ...latestRead, run: null } : latestRead;
      setBootstrap(nextBootstrap);
      setWorkVersions(versions);
      setWorkVersionId(versions.find((version) => isSelectableWorkVersion(version) && version.identity.kind === "root")?.identity.workVersionId ?? "");
      setRun(latest.run ? latest : null);
      if (latest.run && conversationId) rememberConversationRun(window.localStorage, projectId, conversationId, latest.run.runId);
      const requestedParticipantId = window.sessionStorage.getItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      const requestedFormalNode = readFormalNodePreselect(projectId);
      if (!latest.run && requestedFormalNode?.workVersionId && versions.some((version) => version.identity.workVersionId === requestedFormalNode.workVersionId && isSelectableWorkVersion(version))) setWorkVersionId(requestedFormalNode.workVersionId);
      const requestedParticipant = requestedParticipantId && nextBootstrap.participants.some((participant) => participant.id === requestedParticipantId) ? requestedParticipantId : null;
      const queuedParticipant = latest.run ? requestedParticipant : null;
      setQueuedParticipantId(queuedParticipant);
      if (requestedParticipantId && (!requestedParticipant || !latest.run)) window.sessionStorage.removeItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      setParticipantIds(latest.run?.participants.map((participant) => participant.id) ?? (requestedParticipant ? [requestedParticipant] : []));
      setParticipantGoals(Object.fromEntries(latest.run?.participants.map((participant) => [participant.id, participant.localGoal ?? ""]) ?? []));
      const latestScope = latest.run?.scope;
      const defaultStoryline = nextBootstrap.storylines[0];
      const preselectedLine = requestedFormalNode ? nextBootstrap.storylines.find((line) => line.units.some((unit) => unit.id === requestedFormalNode.storyUnitId)) ?? null : null;
      setFormalNodePreselect(requestedFormalNode);
      const requireExplicitLine = newRunRequested && !requestedFormalNode;
      const nextStoryUnitId = latestScope?.scenes[0]?.storyUnit.id ?? latest.run?.scene.storyUnitId ?? requestedFormalNode?.storyUnitId ?? (requireExplicitLine ? "" : defaultStoryline?.units[0]?.id) ?? "";
      setStorylineKey(latestScope?.storylineKey ?? preselectedLine?.key ?? (requireExplicitLine ? "" : defaultStoryline?.key) ?? "");
      setScopeMode(latestScope?.mode ?? "bounded");
      setStoryUnitId(nextStoryUnitId);
      // A fresh bounded selection needs an explicit end unit; defaulting it to
      // the resolved start unit keeps the primary action reachable without the
      // author re-selecting the same unit by hand.
      setEndStoryUnitId(latestScope ? (latestScope.mode === "bounded" ? (latestScope.scenes.at(-1)?.storyUnit.id ?? "") : "") : nextStoryUnitId);
      setRelationTypeId(latest.authorization?.relationTypeId ?? (nextBootstrap.relationTypes.length === 1 ? nextBootstrap.relationTypes[0]!.id : null));
      setGoal(latest.run?.goal ?? "让两位角色在当前场景中决定下一步行动。");
      setSelectedStepIds(latest.run?.steps.slice(-1).map((step) => step.stepId) ?? []);
      setSelectedStepId(latest.run?.steps.at(-1)?.stepId ?? null);
      setSelectedActorId(latest.run?.steps.at(-1)?.actorId ?? latest.run?.participants[0]?.id ?? requestedParticipant);
      if (requestedFormalNode) setNotice(`已从正式故事节点带入范围：${nextBootstrap.storyUnits.find((unit) => unit.id === requestedFormalNode.storyUnitId)?.title ?? "当前单元"}。这是排演来源上下文，不会改写正式节点。`);
      else if (requestedParticipant) setNotice(latest.run
        ? `已从角色档案保留 ${nextBootstrap.participants.find((participant) => participant.id === requestedParticipant)?.title ?? "该角色"}；新建排演时会自动加入。`
        : `已从角色档案加入 ${nextBootstrap.participants.find((participant) => participant.id === requestedParticipant)?.title ?? "该角色"}；再选择 1–2 位正式角色即可开始。`);
    }).catch((reason: unknown) => {
      if (active) setError(messageFor(reason, "女娲工作面未能读取本地作品；现有作品没有被修改。"));
    });
    return () => { active = false; };
  }, [projectId]);

  const selectedStoryline = useMemo(() => bootstrap?.storylines.find((line) => line.key === storylineKey) ?? null, [bootstrap?.storylines, storylineKey]);
  const scopeUnits = selectedStoryline?.units ?? [];
  const selectedScope = useMemo<NuwaN1ScopeSelection | null>(() => storyUnitId && storylineKey && (scopeMode === "continuous" || endStoryUnitId) ? { storylineKey, startStoryUnitId: storyUnitId, endStoryUnitId: scopeMode === "bounded" ? endStoryUnitId : null, mode: scopeMode } : null, [endStoryUnitId, scopeMode, storyUnitId, storylineKey]);
  const canPrepare = participantIds.length >= MIN_PARTICIPANTS && Boolean(selectedScope) && Boolean(goal.trim()) && participantIds.every((id) => Boolean(participantGoals[id]?.trim()));
  const selectableWorkVersions = useMemo(() => workVersions.filter(isSelectableWorkVersion), [workVersions]);
  const selectedStep = run?.run?.steps.find((step) => step.stepId === selectedStepId) ?? null;
  const actorContext = useMemo(() => {
    if (run?.contextInspector && run.run) {
      return run.contextInspector.actors.map((context) => ({
        actorId: context.actorId,
        actorLabel: run.run!.participants.find((participant) => participant.id === context.actorId)?.title ?? "当前角色",
        localGoal: context.localGoal,
        coreSummary: context.coreSummary,
        profileBasis: context.profileBasis,
        attention: context.attention,
        knowledgeItems: context.knowledgeItems,
        beliefItems: context.beliefItems,
        memoryItems: context.memoryItems,
        evidenceRefs: context.evidenceRefs.map((reference) => reference.id),
        excludedCount: context.excludedCount
      }));
    }
    return setup?.setup.contextPreview.map((actor) => ({
      ...actor,
      actorLabel: bootstrap?.participants.find((participant) => participant.id === actor.actorId)?.title ?? "角色"
    })) ?? [];
  }, [bootstrap?.participants, run?.contextInspector, run?.run, setup?.setup.contextPreview]);

  function actorContextFor(actorId: string) {
    return actorContext.find((actor) => actor.actorId === actorId) ?? null;
  }
  const selectedActorContext = selectedActorId ? actorContextFor(selectedActorId) : null;

  const updateRun = (next: NuwaN1ReadModel) => {
    if (!next.run) {
      setRun(null);
      return;
    }
    setRun(next);
    if (new URLSearchParams(window.location.search).get("nuwaView") === "new") {
      const url = new URL(window.location.href);
      url.searchParams.delete("nuwaView");
      url.searchParams.set("runId", next.run.runId);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (projectId && props.runtime.tianyiConversationId) rememberConversationRun(window.localStorage, projectId, props.runtime.tianyiConversationId, next.run.runId);
    setSetup(null);
    const latestStep = next.run.steps.at(-1);
    if (latestStep) {
      setSelectedStepId(latestStep.stepId);
      const nextSteps = next.run.steps;
      setSelectedStepIds((current) => current.length ? current.filter((id) => nextSteps.some((step) => step.stepId === id)) : [latestStep.stepId]);
    }
  };
  const beginOperation = () => ({ projectId: projectIdRef.current, generation: operationGeneration.current });
  const isCurrentOperation = (scope: ReturnType<typeof beginOperation>) => scope.projectId === projectIdRef.current && scope.generation === operationGeneration.current;
  const act = async (operation: () => Promise<NuwaN1ReadModel>, message?: string | ((next: NuwaN1ReadModel) => string)) => {
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    try {
      const next = await operation();
      if (!isCurrentOperation(scope)) return;
      updateRun(next);
      if (message) setNotice(typeof message === "function" ? message(next) : message);
    }
    catch (reason) { if (isCurrentOperation(scope)) setError(messageFor(reason, "本次女娲操作没有完成；未写入正式故事。")); }
    finally { if (isCurrentOperation(scope)) setBusy(false); }
  };
  const prepare = async () => {
    if (!projectId || !canPrepare) return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    try {
      const participants = selectedParticipants(bootstrap, participantIds, participantGoals);
      const storyUnit = selectedStoryUnit(bootstrap, storyUnitId);
      if (!storyUnit || !selectedScope) throw new Error("当前事件线范围已不可用，请重新选择后再准备。");
      const next = await props.runtime.withConnection((token) => setupNuwaN1({ projectId, conversationId: props.runtime.tianyiConversationId, participants, storyUnit, scope: selectedScope, goal: goal.trim(), workVersionId: workVersionId || null, operationId: newOperationId(), token }));
      if (!isCurrentOperation(scope)) return;
      setSetup(next); setNotice("上下文预览已生成；角色只会收到各自允许的依据。"); openInspector(); setInspectorTab("context");
    } catch (reason) { if (isCurrentOperation(scope)) setError(messageFor(reason, "准备上下文失败；没有启动排演。")); }
    finally { if (isCurrentOperation(scope)) setBusy(false); }
  };
  const create = () => {
    if (!projectId || !canPrepare) return;
    const participants = selectedParticipants(bootstrap, participantIds, participantGoals);
    const storyUnit = selectedStoryUnit(bootstrap, storyUnitId);
    if (!storyUnit || !selectedScope) return;
    void act(() => props.runtime.withConnection((token) => createNuwaN1Run({ projectId, conversationId: props.runtime.tianyiConversationId, participants, storyUnit, scope: selectedScope, goal: goal.trim(), relationTypeId, workVersionId: workVersionId || null, operationId: newOperationId(), token })), "已建立排演；尚未发送模型请求。");
  };
  const runAction = (action: "step" | "pause" | "resume" | "stop" | "replay") => {
    if (!projectId || !run) return;
    if (action === "replay") {
      void act(() => props.runtime.withConnection((token) => replayNuwaN1Run({ projectId, runId: run.run!.runId, token })), "已按记录回放；没有再次请求 Provider。");
      return;
    }
    if (action === "pause" || action === "stop") {
      const current = run.run!;
      const scope = beginOperation();
      setInterrupting(true); setError(null); setNotice(null);
      void props.runtime.withConnection((token) => runNuwaN1Action({ projectId, runId: current.runId, expectedRevision: current.revision, action, operationId: newOperationId(), token }))
        .then((next) => { if (isCurrentOperation(scope)) updateRun(next); })
        .catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, action === "stop" ? "停止请求没有完成；请刷新后核对 Run 状态。" : "暂停请求没有完成；请刷新后核对 Run 状态。")); })
        .finally(() => { if (isCurrentOperation(scope)) setInterrupting(false); });
      return;
    }
    void act(() => props.runtime.withConnection((token) => runNuwaN1Action({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, action, operationId: newOperationId(), token })), undefined);
  };
  const runContinuously = () => {
    if (!projectId || !run?.run) return;
    void act(
      () => props.runtime.withConnection((token) => runNuwaN1Continuously({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, operationId: newOperationId(), token })),
      (next) => next.run?.status !== "completed"
        ? `连续排演已停止于“${next.run?.status ?? "未知"}”；未显示为完成或已自动应用。`
        : next.automaticApplication?.status === "applied"
          ? "连续排演已完成，并已按范围授权自动应用正式结果。"
          : "连续排演已完成；结果仍停留在 Run 中等待选择。"
    );
  };
  const beginAnotherRun = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("runId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setRun(null); setSetup(null); setSelectedStepIds([]); setSelectedStepId(null); setSelectedActorId(null); setCue(""); setCueTarget(""); setCueActorIds([]); setParticipantGoals({}); setError(null); setBrowsedEvent(null);
    if (queuedParticipantId && projectId) {
      setParticipantIds([queuedParticipantId]);
      window.sessionStorage.removeItem(`tianyan-nuwa-n1-preselect:${projectId}`);
      const participant = bootstrap?.participants.find((item) => item.id === queuedParticipantId);
      setQueuedParticipantId(null);
      setNotice(`旧 Run 仍可从运行记录回看；已将 ${participant?.title ?? "角色档案中的角色"} 加入新的范围排演。`);
      return;
    }
    setNotice("旧 Run 仍可从运行记录回看；现在可以选择新的事件线与单元范围建立排演。");
  };
  const cueAddressee: NuwaN1CueAddressee | null = cueTarget === "nuwa" || cueTarget === "all-actors"
    ? { kind: cueTarget }
    : cueTarget === "actors" && cueActorIds.length ? { kind: "actors", actorIds: cueActorIds } : null;
  const sendCue = (event: FormEvent) => {
    event.preventDefault();
    if (!projectId || !run || !cue.trim() || !cueAddressee) return;
    const submittedCue = cue.trim();
    void act(async () => {
      const next = await props.runtime.withConnection((token) => cueAddressee.kind === "nuwa"
        ? suggestNuwaN1Director({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, instruction: submittedCue, operationId: newOperationId(), token })
        : cueNuwaN1Run({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, instruction: submittedCue, addressee: cueAddressee, operationId: newOperationId(), token }));
      if (next.run?.directorAdjustment?.status !== "failed") setCue("");
      return next;
    }, (next) => cueAddressee.kind === "nuwa" ? directorNotice(next.run?.directorAdjustment) : cueDeliveryNotice(next.run?.pendingCue?.addressee ?? null, new Map((next.run?.participants ?? []).map((participant) => [participant.id, participant.title]))));
  };
  const decideDirector = (decision: "adopt" | "discard") => {
    if (!projectId || !run?.run?.directorAdjustment) return;
    void act(() => props.runtime.withConnection((token) => decideNuwaN1Director({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, decision, operationId: newOperationId(), token })), (next) => directorNotice(next.run?.directorAdjustment));
  };
  const sendCandidate = () => {
    if (!projectId || !run || !selectedStepIds.length) return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => createNuwaN1Candidate({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, selectedStepIds, operationId: newOperationId(), token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result); setNotice(`已将“${result.candidate.candidates[0]?.title ?? "选定结果"}”送入待确认；尚未写入正式故事。`);
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "候选未能送入待确认；正式故事没有变化。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const autoApply = () => {
    if (!projectId || !run || !selectedStepIds.length || run.authorization?.status !== "active") return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => autoApplyNuwaN1Result({ projectId, runId: run.run!.runId, expectedRevision: run.run!.revision, selectedStepIds, operationId: newOperationId(), token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result);
      setNotice(`已按高权限范围自动写入正式 Event 并纳入当前故事单元（${result.automaticApplication.eventId}）；来源 Run、授权、影响审查与变更集均可追溯。`);
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "自动应用未完成；请刷新核对已保存回执，系统不会把未完成状态显示为已写入。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const freezeDraft = () => {
    const application = run?.automaticApplication;
    if (!projectId || !run?.run || !application) return;
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => freezeNuwaN1AutomaticDraft({ projectId, runId: run.run!.runId, receiptId: application.receiptId, operationId: newOperationId(), token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result);
      setNotice(`已固定 ${result.automaticApplication.fixedDraft?.artifactId ?? "当前版本"}；之后回溯不会改写这份稿。`);
    }).catch((reason: unknown) => { if (isCurrentOperation(scope)) setError(messageFor(reason, "固定稿未能建立；当前故事没有被改写。")); }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const rollbackApplication = () => {
    const application = run?.automaticApplication;
    if (!projectId || !run?.run || !application) return;
    const operationId = application.rollback?.status === "recovery-required" ? application.rollback.operationId : newOperationId();
    const scope = beginOperation();
    setBusy(true); setError(null); setNotice(null);
    void props.runtime.withConnection((token) => rollbackNuwaN1AutomaticApplication({ projectId, runId: run.run!.runId, receiptId: application.receiptId, operationId, token })).then((result) => {
      if (!isCurrentOperation(scope)) return;
      updateRun(result);
      setNotice(`已完成补偿回溯；新的正式版本为 r${result.automaticApplication.rollback?.resultVersion?.revision ?? "?"}，Run 与 heard 历史仍保留。`);
    }).catch((reason: unknown) => {
      if (!isCurrentOperation(scope)) return;
      setError(messageFor(reason, "回溯未完整结束；请在本页恢复同一回执，系统不会显示为已全部回溯。"));
      // The durable receipt may have advanced to recovery-required even when
      // this write request fails.  Refresh it before another click so the
      // recovery keeps its original idempotency key.
      void getNuwaN1Run(projectId, run.run!.runId).then((latest) => {
        if (isCurrentOperation(scope)) updateRun(latest);
      }).catch(() => { /* Keep the original failure visible if refresh is unavailable. */ });
    }).finally(() => { if (isCurrentOperation(scope)) setBusy(false); });
  };
  const openFixedDraft = () => {
    const artifactId = run?.automaticApplication?.fixedDraft?.artifactId;
    if (!projectId || !artifactId) return;
    window.sessionStorage.setItem(`tianyan-creation-source-artifact:${projectId}`, artifactId);
    // Keep the exact pinned identity in the route as well as the one-shot
    // handoff.  A Creation mount may otherwise see several historical drafts
    // after a refresh and correctly refuse to guess which one to open.
    window.location.assign(`/creation?projectId=${encodeURIComponent(projectId)}&artifactId=${encodeURIComponent(artifactId)}`);
  };
  const openApplicationEvent = () => {
    const eventId = run?.automaticApplication?.eventId;
    if (!eventId) return;
    window.location.assign(`/event-line?eventTask=story&eventId=${encodeURIComponent(eventId)}`);
  };
  const openApplicationRelation = () => {
    const relationId = run?.automaticApplication?.relationId;
    if (!relationId || !run?.run) return;
    window.location.assign(`/event-line?eventTask=relationship&relationId=${encodeURIComponent(relationId)}&nuwaRunId=${encodeURIComponent(run.run.runId)}`);
  };

  if (!projectId) return <NuwaUnavailable title="先打开一个作品" detail="女娲排演必须绑定当前作品、正式角色和故事单元；这里不会创建独立的故事副本或角色仓库。" />;
  if (!bootstrap && !error) return <NuwaUnavailable title="正在读取女娲排演" detail="正在恢复当前作品的最新 Run；读取本身不会调用 Provider。" loading />;

  const availability = bootstrap?.availability;
  const localFake = availability?.kind === "local-fake";
  // Availability says whether this explicitly configured executor can start a
  // bounded Run.  It is not a synonym for the zero-call fixture executor.
  const executable = Boolean(availability && availability.kind !== "unavailable");
  const status = run?.run?.status ?? "ready";
  if (window.matchMedia("(max-width: 520px)").matches) return <main className="mobile-nuwa" aria-label="女娲" data-testid="mobile-nuwa-template" data-run-id={run?.run?.runId ?? ""}>
    {!run?.run ? <div className="mobile-nuwa-scroll"><section className="mobile-nuwa-unit"><small>新建排演</small><h1>先确定故事范围</h1><p>事件线 → 单元 → 正式角色。本轮结果先成为候选。</p><label>作品版本<select aria-label="作品版本" value={workVersionId} disabled={busy} onChange={(event) => { setWorkVersionId(event.target.value); setSetup(null); }}>{selectableWorkVersions.map((version) => <option key={version.identity.workVersionId} value={version.identity.workVersionId}>{version.identity.displayName} · r{version.identity.currentRevision}</option>)}</select></label><label>事件线<select aria-label="事件线" value={storylineKey} disabled={busy} onChange={(event) => { const next = bootstrap?.storylines.find((line) => line.key === event.target.value); setStorylineKey(event.target.value); setStoryUnitId(next?.units[0]?.id ?? ""); setEndStoryUnitId(next?.units[0]?.id ?? ""); setSetup(null); }}><option value="">请选择事件线</option>{bootstrap?.storylines.map((line) => <option key={line.key} value={line.key}>{line.title}</option>)}</select></label><label>从单元开始<select aria-label="从单元开始" value={storyUnitId} disabled={busy || !scopeUnits.length} onChange={(event) => { setStoryUnitId(event.target.value); setEndStoryUnitId(event.target.value); setSetup(null); }}>{scopeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label><label>推演范围<select aria-label="推演范围" value={scopeMode} disabled={busy} onChange={(event) => { setScopeMode(event.target.value as NuwaN1ScopeSelection["mode"]); setSetup(null); }}><option value="bounded">到指定单元</option><option value="continuous">持续推演（本轮预算内）</option></select></label>{scopeMode === "bounded" ? <label>到单元结束<select aria-label="到单元结束" value={endStoryUnitId} disabled={busy || !scopeUnits.length} onChange={(event) => { setEndStoryUnitId(event.target.value); setSetup(null); }}>{scopeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label> : null}<label>局部目标<input value={goal} maxLength={240} disabled={busy} onChange={(event) => { setGoal(event.target.value); setSetup(null); }} placeholder="这次排演要探索什么？" /></label></section><div className="mobile-nuwa-section"><strong>当前参与角色</strong><small>选择 2–3 位正式角色</small></div><div className="mobile-nuwa-cast">{bootstrap?.participants.map((participant) => <label key={participant.id}><input type="checkbox" checked={participantIds.includes(participant.id)} disabled={busy || (!participantIds.includes(participant.id) && participantIds.length >= MAX_PARTICIPANTS)} onChange={() => { setParticipantIds((current) => current.includes(participant.id) ? current.filter((id) => id !== participant.id) : [...current, participant.id]); setSetup(null); }} /><b>{participant.title.slice(0, 1)}</b><span>{participant.title}</span></label>)}</div>{participantIds.map((id) => <label className="mobile-nuwa-goal" key={id}>{bootstrap?.participants.find((item) => item.id === id)?.title}的本场目标<input value={participantGoals[id] ?? ""} maxLength={800} onChange={(event) => { setParticipantGoals((current) => ({ ...current, [id]: event.target.value })); setSetup(null); }} /></label>)}{setup ? <section className="mobile-nuwa-process"><strong>发送前上下文预览</strong><p>{setup.setup.contextPreview.map((actor) => `${bootstrap?.participants.find((item) => item.id === actor.actorId)?.title}：${actor.localGoal}`).join("；")}</p></section> : null}{error ? <p role="alert" className="mobile-nuwa-error">{error}</p> : null}<div className="mobile-nuwa-actions"><button type="button" disabled={!canPrepare || busy} onClick={prepare}>查看上下文</button><button type="button" disabled={!canPrepare || busy || !executable} onClick={create}>开始排演</button></div></div> : <>
      <div className="mobile-nuwa-scroll" ref={mobileReadRef} onScroll={(event) => { if (mobileReadKey) window.sessionStorage.setItem(mobileReadKey, String(event.currentTarget.scrollTop)); }}><section className="mobile-nuwa-unit"><small>当前单元 · {statusLabel(status)}</small><h1>{run.run.scene.label}</h1><div className="mobile-nuwa-unit-chips"><span>{run.run.scope.storylineLabel}</span><span>{run.run.scope.currentSceneIndex + 1}/{run.run.scope.scenes.length} 单元</span><span>{run.run.steps.length}/{runStepBudget(run.run)} 步</span></div><button type="button" onClick={() => window.dispatchEvent(new Event("tianyan-nuwa-open-structure"))}>查看这一单元的故事结构 ›</button></section><div className="mobile-nuwa-primary-actions" aria-label="本次排演操作">{run.run.status === "paused" ? <button type="button" disabled={busy || interrupting} onClick={() => runAction("resume")}>恢复排演</button> : run.run.status === "ready" || run.run.status === "running" ? <><button type="button" disabled={busy || interrupting} onClick={runContinuously}>继续排演</button><button type="button" disabled={interrupting} onClick={() => runAction("pause")}>暂停排演</button></> : <span>本次排演已结束；可阅读结果或从记录中建立新 Run。</span>}</div><div className="mobile-nuwa-section"><strong>当前参与角色</strong><small>{run.run.participants.length} 个 Agent</small></div><div className="mobile-nuwa-cast">{run.run.participants.map((participant) => <button type="button" key={participant.id} onClick={() => { setSelectedActorId(participant.id); setInspectorTab("context"); openInspector({ actorId: participant.id }); }}><b>{participant.title.slice(0, 1)}</b><span>{participant.title}</span></button>)}</div><div className="mobile-nuwa-section"><strong>正在发生的故事</strong><small>{run.run.steps.length} 段</small></div><div className="mobile-nuwa-stream">{run.run.steps.map((step) => { const actor = run.run!.participants.find((item) => item.id === step.actorId); return <article key={step.stepId} className="mobile-nuwa-step"><div className="mobile-nuwa-step-head"><span>{actor?.title.slice(0, 1) ?? "角"}</span><button type="button" onClick={() => { setSelectedStepId(step.stepId); setSelectedActorId(step.actorId); setInspectorTab("step"); openInspector({ actorId: step.actorId, stepId: step.stepId }); }}>{actor?.title ?? "角色"} · 第 {step.sequence} 步 · 查看来源</button></div>{step.speech ? <p className="mobile-nuwa-speech">{step.speech}</p> : null}{step.observableResult ? <div className="mobile-nuwa-prose"><small>动作 / 结果</small><p>{step.observableResult}</p></div> : null}{selectionMode ? <label><input type="checkbox" checked={selectedStepIds.includes(step.stepId)} onChange={() => setSelectedStepIds((current) => current.includes(step.stepId) ? current.filter((id) => id !== step.stepId) : [...current, step.stepId])} />选择此结果</label> : null}</article>; })}{!run.run.steps.length ? <p>本次排演尚无已保存步骤。</p> : null}{run.run.directorAdjustment ? <details className="mobile-nuwa-process"><summary>女娲推演记录 · 导演调整 · {directorStatusLabel(run.run.directorAdjustment.status, run.run.directorAdjustment.appliesFromStep, run.run.directorAdjustment.appliedStepId)}</summary><p>作者原话：{run.run.directorAdjustment.instruction}</p><p>建议：{run.run.directorAdjustment.proposedAdjustment ?? "尚未生成"}</p>{run.run.directorAdjustment.status === "suggested" ? <div><button type="button" disabled={busy} onClick={() => decideDirector("adopt")}>采纳调整</button><button type="button" disabled={busy} onClick={() => decideDirector("discard")}>放弃</button></div> : null}</details> : null}{run.run.pendingCue ? <details className="mobile-nuwa-process"><summary>女娲插入记录 · 待生效提示</summary><p>{run.run.pendingCue.instruction}</p></details> : null}</div>{notice ? <p role="status" className="mobile-nuwa-note">{notice}</p> : null}{error ? <p role="alert" className="mobile-nuwa-error">{error}</p> : null}<div className="mobile-nuwa-section"><strong>选择结果</strong><button type="button" onClick={() => setSelectionMode((value) => !value)}>{selectionMode ? "完成选择" : `选择结果 · ${selectedStepIds.length} 已选`}</button></div>{selectionMode && selectedStepIds.length ? <div className="mobile-nuwa-actions"><button type="button" disabled={busy || !["completed", "cancelled"].includes(run.run.status)} onClick={sendCandidate}>送入待确认</button>{run.authorization?.status === "active" ? <button type="button" disabled={busy || !["completed", "cancelled"].includes(run.run.status)} onClick={autoApply}>按授权应用</button> : null}</div> : null}<details className="mobile-nuwa-process"><summary>更多排演操作与历史</summary><div className="mobile-nuwa-actions">{run.run.status === "ready" || run.run.status === "running" ? <button type="button" disabled={busy} onClick={() => runAction("step")}>单步排演</button> : null}{["ready", "running", "paused"].includes(run.run.status) ? <button type="button" disabled={interrupting} onClick={() => runAction("stop")}>停止本次 Run</button> : null}<button type="button" onClick={() => { setSelectedActorId(null); setInspectorTab("log"); openInspector(); }}>来源与历史</button></div></details><details className="mobile-nuwa-process"><summary>运行技术详情</summary><p>Run {run.run.runId} · 修订 {run.run.revision} · 模型发送 {run.run.providerDispatches} 次</p></details></div>
      <form className="mobile-nuwa-composer" onSubmit={sendCue}><label>作者输入 · 非角色对白<select aria-label="作者提示接收对象" ref={cueTargetRef} value={cueTarget} disabled={busy || !["ready", "running", "paused"].includes(run.run.status)} onChange={(event) => changeCueTarget(event.target.value as "" | NuwaN1CueAddressee["kind"])}><option value="">选择接收对象</option><option value="nuwa">导演调整建议 · 女娲</option><option value="actors">本场提示 · 指定角色</option><option value="all-actors">本场提示 · 全体角色</option></select></label><small className="mobile-nuwa-cue-hint">{cueTarget === "nuwa" ? "发送后生成导演建议，需作者采纳；不会立即改变排演。" : cueTarget ? "提示只在本次 Run 的本场范围内送达；不写入角色长期记忆。" : "先选择接收对象。发送结果会显示在故事流上方。"}</small>{cueTarget === "actors" ? <div className="mobile-nuwa-cue-cast">{run.run.participants.map((participant) => <label key={participant.id}><input type="checkbox" checked={cueActorIds.includes(participant.id)} onChange={() => setCueActorIds((current) => current.includes(participant.id) ? current.filter((id) => id !== participant.id) : [...current, participant.id])} />{participant.title}</label>)}</div> : null}<div><textarea aria-label="女娲作者指令" value={cue} onChange={(event) => setCue(event.target.value)} disabled={busy || !["ready", "running", "paused"].includes(run.run.status)} maxLength={800} rows={1} placeholder={cueTarget === "nuwa" ? "给女娲提出本场导演调整建议；采纳后才生效" : cueTarget ? "只向所选接收对象提供本场有限提示；不是角色对白" : "先选择接收对象；这里不提供自由角色聊天"} /><button type="submit" aria-label="发送女娲指令" disabled={busy || !cue.trim() || !cueAddressee}>➤</button></div></form>
    </>}
    {inspectorOpen ? <aside className="mobile-nuwa-inspector" role="dialog" aria-label="女娲来源与历史"><header><strong>{inspectorTab === "log" ? "排演历史" : inspectorTab === "step" ? "步骤来源" : "角色与来源"}</strong><button type="button" onClick={() => workspaceSurfaceManager.closeSurface("nuwa-inspector")}>关闭</button></header><nav><button type="button" onClick={() => setInspectorTab("context")}>角色</button><button type="button" onClick={() => setInspectorTab("step")}>步骤</button><button type="button" onClick={() => setInspectorTab("log")}>历史</button></nav>{inspectorTab === "context" ? <ContextInspector actors={selectedActorContext ? [selectedActorContext] : actorContext} mode={run?.run ? "committed" : "preview"} participantLabels={new Map(bootstrap?.participants.map((item) => [item.id, item.title]) ?? [])} sceneLabels={new Map(bootstrap?.storyUnits.map((item) => [item.id, item.title]) ?? [])} /> : inspectorTab === "step" ? <StepInspector step={selectedStep} participantLabels={new Map(run?.run?.participants.map((item) => [item.id, item.title]) ?? [])} /> : <LogInspector run={run} />}</aside> : null}
  </main>;
  return <main className="shell-workspace shell-workspace-nuwa" aria-label="女娲">
    <section className={`nuwa-n1-workspace ${run?.run ? "has-run" : ""}`} data-testid="nuwa-n1-workspace" data-run-id={run?.run?.runId ?? ""} data-run-status={status} data-provider-calls={run?.run?.providerDispatches ?? 0}>
      <nav className="nuwa-workspace-return" aria-label="女娲页面"><a href="/nuwa?nuwaView=manage">返回女娲</a>{run?.run ? <span>当前排演 · {run.run.runId.slice(-6)}</span> : <span>新建排演 · 尚未运行</span>}</nav>
      {!run?.run ? <header className="nuwa-n1-header"><h1>女娲</h1><p>选择故事范围后开始排演</p></header> : null}

      {notice ? <p className="nuwa-n1-message is-notice" role="status"><CheckCircle2 />{notice}</p> : null}
      {run?.authorization ? <p className="nuwa-n1-message is-notice" data-testid="nuwa-n1-authorization"><ShieldCheck />{run.authorization.status === "active" ? `高权限自动执行已授权：当前 Run、${run.authorization.storyUnitId} 与 ${run.authorization.actorIds.length} 位角色；最多 ${run.authorization.maxSteps} 步 / ${run.authorization.maxProviderDispatches} 次模型发送，可随时停止或回溯。` : "此 Run 的高权限授权已失效；不会继续自动写入。"}</p> : null}
      {browsedEvent ? <p className="nuwa-n1-browse-chip" role="status" data-testid="nuwa-browse-chip"><Eye aria-hidden="true" /><span>正在浏览事件线 ·「{browsedEvent.title}」（{browsedEvent.unitTitle || "单元未知"} · {browsedEvent.inCurrentScope ? "排演现场内" : "不在排演范围"}）。仅查看；排演现场与范围不受影响。</span><button type="button" onClick={() => setBrowsedEvent(null)}>回到当前现场</button></p> : null}

      <section className="nuwa-n1-commandbar" aria-label="女娲控制区" data-legacy-label="本次排演方式">
        <div className="nuwa-n1-command-status"><span className={`nuwa-n1-status-dot is-${status}`} aria-hidden="true" /><div><small>{run?.authorization?.status === "active" ? "已授权自动应用" : "普通候选"}</small><strong>{statusLabel(status)}</strong></div></div>
        <div className="nuwa-n1-command-summary"><small>当前推演范围</small><strong>{run?.run ? `${run.run.scope.storylineLabel} · ${run.run.scene.label}` : selectedStoryline ? `${selectedStoryline.title} · ${scopeUnits.find((unit) => unit.id === storyUnitId)?.title ?? "请选择单元"}` : "尚未选择范围"}</strong><span>{run?.run ? `${run.run.scope.currentSceneIndex + 1}/${run.run.scope.scenes.length} 单元 · ${run.run.steps.length}/${runStepBudget(run.run)} 步` : "结果只进入待确认；不会直接改写正式故事。"}</span></div>
        <div className="nuwa-n1-command-actions">
          {!run ? <button type="button" className="primary-action" disabled={!canPrepare || busy || !executable} onClick={create}><Play />开始排演</button> : null}
          {run?.run?.status === "ready" ? <><button type="button" className="primary-action" disabled={busy} onClick={runContinuously}><Play />连续运行</button><button type="button" disabled={busy} onClick={() => runAction("step")}><Play />开始第一步</button><button type="button" className="danger-action" disabled={interrupting} onClick={() => runAction("stop")}><OctagonX />停止</button></> : null}
          {run?.run?.status === "running" ? <><button type="button" className="primary-action" disabled={busy} onClick={runContinuously}><Play />继续推演</button><button type="button" disabled={busy} onClick={() => runAction("step")}><Play />单步</button><button type="button" disabled={interrupting} onClick={() => runAction("pause")}><CirclePause />暂停</button><button type="button" className="danger-action" disabled={interrupting} onClick={() => runAction("stop")}><OctagonX />停止</button></> : null}
          {run?.run?.status === "paused" ? <><button type="button" className="primary-action" aria-label="恢复" disabled={busy} onClick={() => runAction("resume")}><CirclePlay />继续推演</button><button type="button" className="danger-action" disabled={interrupting} onClick={() => runAction("stop")}><OctagonX />停止</button></> : null}
          {run?.run && canResumeDispatchBlockedRun(run.run) ? <button type="button" className="primary-action" disabled={busy} onClick={() => runAction("resume")}><CirclePlay />恢复本次排演</button> : null}
          {run?.run && ["completed", "cancelled", "blocked"].includes(run.run.status) ? <><button type="button" disabled={busy} onClick={() => runAction("replay")}><History />回放</button><button type="button" className="primary-action" disabled={busy} onClick={beginAnotherRun}><MessageSquarePlus />新建排演</button></> : null}
        </div>
        <div className="nuwa-n1-command-tools">
          <button type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}><Settings2 aria-hidden="true" />推演设置</button>
          <button type="button" onClick={() => window.dispatchEvent(new Event("tianyan-nuwa-open-structure"))}><Network aria-hidden="true" />故事结构</button>
          <button type="button" aria-expanded={eventVisible} onClick={() => { if (eventVisible) { setEventDrawer(false); updateAuxiliary({ auxiliaryOpen: false }); } else { setEventDrawer(true); updateAuxiliary({ auxiliaryOpen: true }); workspaceSurfaceManager.closeSurface("nuwa-inspector"); } }}><GitBranch aria-hidden="true" />排演脉络</button>
          <button type="button" aria-expanded={inspectorOpen} onClick={() => inspectorOpen ? workspaceSurfaceManager.closeSurface("nuwa-inspector") : openInspector()}><PanelRight aria-hidden="true" />角色与来源</button>
        </div>
      </section>


      {error ? <p className="nuwa-n1-message is-error" role="alert"><AlertTriangle />{error}</p> : null}
      <div className="nuwa-n1-body" ref={bodyRef} data-preferred-width={panes.preferredWidth}>
        <div className="nuwa-n1-primary">
        {formalNodePreselect ? <p className="nuwa-n1-formal-node-source" role="status">正式节点来源 · 单元 {bootstrap?.storyUnits.find((unit) => unit.id === formalNodePreselect.storyUnitId)?.title ?? formalNodePreselect.storyUnitId} · 仅作为本次排演范围，不是正式写入。</p> : null}

        <details className={`nuwa-n1-controlbar ${run && !settingsOpen ? "is-hidden" : ""}`} aria-label="排演范围与操作" open={!run || settingsOpen} onToggle={(event) => { if (run) setSettingsOpen(event.currentTarget.open); }}>
          <summary><span><ChevronDown aria-hidden="true" /><strong>推演设置</strong></span><small>{run?.run ? `本次排演范围：${run.run.scope.storylineLabel} · ${run.run.scene.label} · ${run.run.participants.map((participant) => participant.title).join("、")}` : "作品版本、事件线、单元范围、角色与局部目标"}</small></summary>
          <div className="nuwa-n1-controlbar-grid">
          <label><span>作品版本</span><select aria-label="作品版本" value={workVersionId} disabled={Boolean(run) || busy || !selectableWorkVersions.length} onChange={(event) => { setWorkVersionId(event.target.value); setSetup(null); }}>{selectableWorkVersions.length ? selectableWorkVersions.map((version) => <option key={version.identity.workVersionId} value={version.identity.workVersionId}>{version.identity.kind === "root" ? "主版本" : "IF"} · {version.identity.displayName} · r{version.identity.currentRevision}</option>) : <option value="">尚未建立正式版本 · 仅候选排演</option>}</select></label>
          <label><span>事件线</span><select aria-label="事件线" value={storylineKey} disabled={Boolean(run) || busy} onChange={(event) => { const next = bootstrap?.storylines.find((line) => line.key === event.target.value); setStorylineKey(event.target.value); setStoryUnitId(next?.units[0]?.id ?? ""); setEndStoryUnitId(next?.units[0]?.id ?? ""); setSetup(null); }}><option value="">请先选择事件线</option>{bootstrap?.storylines.map((line) => <option key={line.key} value={line.key}>{line.title}</option>)}</select></label>
          <label><span>从单元开始</span><select aria-label="从单元开始" value={storyUnitId} disabled={Boolean(run) || busy || !scopeUnits.length} onChange={(event) => { const next = event.target.value; setStoryUnitId(next); if (scopeMode === "bounded" && (!endStoryUnitId || scopeUnits.findIndex((unit) => unit.id === endStoryUnitId) < scopeUnits.findIndex((unit) => unit.id === next))) setEndStoryUnitId(next); setSetup(null); }}>{scopeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label>
          <label><span>推演范围</span><select aria-label="推演范围" value={scopeMode} disabled={Boolean(run) || busy} onChange={(event) => { setScopeMode(event.target.value as NuwaN1ScopeSelection["mode"]); setSetup(null); }}><option value="bounded">到指定单元</option><option value="continuous">持续推演（N1 预算内）</option></select></label>
          {scopeMode === "bounded" ? <label><span>到单元结束</span><select aria-label="到单元结束" value={endStoryUnitId} disabled={Boolean(run) || busy || !scopeUnits.length} onChange={(event) => { setEndStoryUnitId(event.target.value); setSetup(null); }}>{scopeUnits.slice(Math.max(0, scopeUnits.findIndex((unit) => unit.id === storyUnitId))).map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label> : <span className="nuwa-n1-scope-hint">持续模式会从开始单元依序推进；N1 本轮最多覆盖 3 个单元 / 6 步，可暂停并恢复。</span>}
          <label><span>自动关系类型</span><select value={relationTypeId ?? ""} disabled={Boolean(run) || busy || !bootstrap?.relationTypes.length} onChange={(event) => setRelationTypeId(event.target.value || null)}><option value="">不写关系</option>{bootstrap?.relationTypes.map((type) => <option key={type.id} value={type.id}>{type.title}</option>)}</select></label>
          <label className="nuwa-n1-goal"><span>局部目标</span><input value={goal} disabled={Boolean(run) || busy} onChange={(event) => { setGoal(event.target.value); setSetup(null); }} maxLength={240} placeholder="例如：决定是否沿旧桥继续追查" /></label>
          <div className="nuwa-n1-status"><span>状态</span><strong>{statusLabel(status)}</strong>{run?.run ? <small>{run.run.scope.currentSceneIndex + 1} / {run.run.scope.scenes.length} 单元 · {run.run.steps.length} / {runStepBudget(run.run)} 步 · 本地/网络模型发送 {run.run.providerDispatches} / 12 · 内部工具回合 {internalToolTurns(run.run)}</small> : <small>范围内自动分步，最多 3 个单元 / 6 步</small>}</div>
          <fieldset><legend>选择 2–3 位正式角色</legend><div className="nuwa-n1-participant-options">{bootstrap?.participants.map((participant) => {
            const checked = participantIds.includes(participant.id);
            return <label key={participant.id}><input type="checkbox" checked={checked} disabled={busy || (!checked && participantIds.length >= MAX_PARTICIPANTS)} onChange={() => { setParticipantIds((current) => checked ? current.filter((id) => id !== participant.id) : [...current, participant.id]); setSetup(null); }} /><span><strong>{participant.title}</strong><small>正式角色</small></span></label>;
          })}</div></fieldset>
          {participantIds.length ? <fieldset className="nuwa-n1-participant-goals"><legend>逐角色本场目标</legend>{participantIds.map((participantId) => { const participant = bootstrap?.participants.find((item) => item.id === participantId); return <label key={participantId}><span>{participant?.title ?? "角色"}</span><input value={participantGoals[participantId] ?? ""} disabled={busy} maxLength={800} required onChange={(event) => { setParticipantGoals((current) => ({ ...current, [participantId]: event.target.value })); setSetup(null); }} placeholder="本场只属于这个角色的目标" /></label>; })}</fieldset> : null}
          <div className="nuwa-n1-controlbar-footer"><span>角色只会获得自己的可知范围；{participantIds.length < MIN_PARTICIPANTS ? `还需要选择 ${MIN_PARTICIPANTS - participantIds.length} 位角色。` : participantIds.some((id) => !participantGoals[id]?.trim()) ? "请为每位角色填写本场目标。" : "范围准备就绪；可先检查上下文。"}</span><button type="button" disabled={!canPrepare || busy} onClick={prepare}><ShieldCheck />查看上下文</button></div>
          </div>
        </details>
      {run?.run && selectionMode ? <div className="nuwa-n1-selection-bar" role="region" aria-label="已选结果操作"><strong>已选 {selectedStepIds.length} 个结果</strong><small>{!["completed", "cancelled"].includes(run.run.status) ? "排演进行中或已暂停；完成或停止后可送入待确认。" : !selectedStepIds.length ? "请选择至少一个已保存结果。" : "所选结果将进入作者待确认。"}</small>{run.authorization?.status === "active" ? <button type="button" className="primary-action" disabled={busy || !selectedStepIds.length || !["completed", "cancelled"].includes(run.run.status)} onClick={autoApply}><CheckCircle2 />自动应用结果</button> : <button type="button" disabled={busy || !selectedStepIds.length || !["completed", "cancelled"].includes(run.run.status)} onClick={sendCandidate}><FilePlus2 />送入待确认</button>}{run.automaticApplication ? <span className="nuwa-n1-application-tools"><button type="button" disabled={busy || Boolean(run.automaticApplication.fixedDraft)} onClick={freezeDraft}>固定稿</button>{run.automaticApplication.fixedDraft ? <button type="button" onClick={openFixedDraft}>查看并下载固定稿</button> : null}<button type="button" className="danger-action" disabled={busy || run.automaticApplication.rollback?.status === "active"} onClick={rollbackApplication}>{run.automaticApplication.rollback?.status === "recovery-required" ? "恢复回溯" : "回溯本批"}</button></span> : null}</div> : null}
      {run?.run ? <NuwaRunReader run={run} selectionMode={selectionMode} onSelectionModeChange={setSelectionMode} selectedStepId={selectedStepId} selectedStepIds={selectedStepIds} onSelectActor={(actorId) => { setSelectedActorId(actorId); openInspector({ actorId }); setInspectorTab("context"); }} onSelectStep={(step) => { setSelectedStepId(step.stepId); setSelectedActorId(step.actorId); openInspector({ actorId: step.actorId, stepId: step.stepId }); setInspectorTab("step"); }} onToggleCandidate={(stepId) => setSelectedStepIds((current) => current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId])} /> : null}

      {!run && setup ? <section className="nuwa-n1-context-preview"><ShieldCheck /><div><strong>本轮上下文预览</strong><p>{setup.setup.contextPreview.map((actor) => `${bootstrap?.participants.find((item) => item.id === actor.actorId)?.title ?? "角色"}：${actor.profileBasis.core ?? "未设置核心"}；底线 ${actor.profileBasis.boundaries ?? "未设置"}；目标 ${actor.localGoal}`).join("；")}</p><small>这里只是发送前预览；尚未提交步骤，也没有网络发送回执。</small></div></section> : null}
      {run?.run && run.automaticApplication ? <ApplicationSummary application={run.automaticApplication} heardCount={run.run.steps.reduce((count, step) => count + step.heardStatements.length, 0)} onOpenEvent={openApplicationEvent} onOpenRelation={openApplicationRelation} onOpenFixedDraft={openFixedDraft} /> : null}
      {run?.run?.directorAdjustment?.status !== "adopted" && previousDirector ? <p className="nuwa-n1-message is-notice">上一份已采纳调整仍在本场景生效：{previousDirector.proposedAdjustment} 新建议只有采纳后才会替换它。</p> : null}
      {run?.run?.directorAdjustment ? <section className={`nuwa-n1-director-card is-${run.run.directorAdjustment.status}`} role="status"><details className="nuwa-n1-director-disclosure"><summary><strong>导演调整</strong><span>{directorStatusLabel(run.run.directorAdjustment.status, run.run.directorAdjustment.appliesFromStep, run.run.directorAdjustment.appliedStepId)}</span>{run.run.directorAdjustment.status === "suggested" ? <em>待作者审阅</em> : null}</summary><div className="nuwa-n1-director-full">
        <p><strong>保存的推进提示：</strong>{run.run.directorAdjustment.proposedAdjustment || "尚无可执行调整。"}</p>
        <p>作者原话：{run.run.directorAdjustment.instruction}</p>
        {run.run.directorAdjustment.understood ? <p>建议理解：{run.run.directorAdjustment.understood}</p> : null}
        {run.run.directorAdjustment.unsupported?.length ? <p>未执行的要求：{run.run.directorAdjustment.unsupported.join("；")}</p> : null}
        {run.run.directorAdjustment.scope ? <p>适用范围：{run.run.directorAdjustment.scope}</p> : null}
        {run.run.directorAdjustment.failure ? <p role="alert">{run.run.directorAdjustment.failure}</p> : null}
        <p>采纳后仅把保存的推进提示交给后续步骤；不保证角色会按预期行动，也不改变角色知情边界。</p>
        {run.run.directorAdjustment.status === "suggested" ? <div className="nuwa-n1-director-state"><button type="button" className="primary-action" disabled={busy} onClick={() => decideDirector("adopt")}>采纳调整</button><button type="button" disabled={busy} onClick={() => decideDirector("discard")}>放弃</button></div> : null}
        {run.run.directorAdjustment.status === "failed" ? <button type="button" disabled={busy} onClick={() => { setCue(run.run!.directorAdjustment!.instruction); setCueTarget("nuwa"); cueTargetRef.current?.focus(); }}>保留输入并重试</button> : null}
      </div></details></section> : null}
      {run?.run?.pendingCue ? <section className="nuwa-n1-pending-cue" role="status"><div><strong>待生效的作者提示</strong><p>{run.run.pendingCue.instruction}</p></div><span>{cueProgressLabel(run.run.pendingCue, new Map(run.run.participants.map((participant) => [participant.id, participant.title])), run.run.participants) ?? cueStateLabel(run.run.pendingCue.addressee, new Map(run.run.participants.map((participant) => [participant.id, participant.title])))}</span>{run.run.pendingCue.addressee ? null : <button type="button" disabled={busy} onClick={() => { setCue(run.run!.pendingCue!.instruction); cueTargetRef.current?.focus(); }}>补选对象</button>}</section> : null}
      {run?.run ? <footer className="nuwa-n1-composer"><form onSubmit={sendCue}><div className="nuwa-n1-cue-target"><strong>作者输入 · 非角色对白</strong><label><span>接收对象</span><select aria-label="作者提示接收对象" ref={cueTargetRef} value={cueTarget} disabled={busy || !["ready", "running", "paused"].includes(run.run.status)} onChange={(event) => changeCueTarget(event.target.value as "" | NuwaN1CueAddressee["kind"])}><option value="">必须选择对象</option><option value="nuwa">调整排演（女娲）</option><option value="actors">指定角色的后续提示</option><option value="all-actors">全体角色的后续提示</option></select></label>{cueTarget === "actors" ? <div className="nuwa-n1-cue-actors">{run.run.participants.map((participant) => { const checked = cueActorIds.includes(participant.id); return <label key={participant.id}><input type="checkbox" checked={checked} disabled={busy} onChange={() => setCueActorIds((current) => checked ? current.filter((id) => id !== participant.id) : [...current, participant.id])} /><span>{participant.title}</span></label>; })}</div> : null}<details className="nuwa-n1-cue-boundary"><summary>用途与边界</summary><small>{cueTarget === "nuwa" ? "先生成建议，作者采纳后才影响后续步骤。" : cueAddressee ? `${cueStateLabel(cueAddressee, new Map(run.run.participants.map((participant) => [participant.id, participant.title])))}；这不是角色对白。` : "选择对象后才可提交；作者内容不会作为场景对白。"}</small></details></div><label className="nuwa-n1-cue-input"><span>{cueTarget === "nuwa" ? "给女娲的导演要求" : "给所选对象的下一步指令"}</span><textarea value={cue} onChange={(event) => setCue(event.target.value)} disabled={busy || !["ready", "running", "paused"].includes(run.run.status)} maxLength={800} rows={2} placeholder={cueTarget === "nuwa" ? "向女娲提出后续排演要求…" : "选择接收对象，写下后续步骤提示…"} /></label><button type="submit" className="primary-action" disabled={busy || !cue.trim() || !cueAddressee || !["ready", "running", "paused"].includes(run.run.status)}><Send />{cueTarget === "nuwa" ? "生成调整建议" : "加入后续步骤"}</button></form></footer> : null}
        </div>

        <div className={`nuwa-n1-auxiliary ${eventVisible ? "is-open is-drawer" : ""}`} role={eventVisible ? "dialog" : undefined} aria-label="事件线辅助面" onKeyDown={(event) => { if (event.key === "Escape") { setEventDrawer(false); updateAuxiliary({ auxiliaryOpen: false }); } }} style={{ "--nuwa-aux-size": `${panes.eventWidth}px` } as CSSProperties}>
          <StoryThreadMap run={run} selectedStepId={selectedStepId} selectedStepIds={selectedStepIds} onSelectStep={(step) => { setSelectedStepId(step.stepId); setSelectedActorId(step.actorId); }} onToggleCandidate={(stepId) => setSelectedStepIds((current) => current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId])} />
        </div>

      <aside className={`nuwa-n1-inspector ${inspectorOpen ? "is-open is-drawer" : ""}`} role={inspectorOpen ? "dialog" : undefined} aria-label="女娲上下文检查器">
        <header><div><PanelRight /><span><small>角色与辅助信息</small><strong>{selectedActorContext?.actorLabel ?? "侧边栏"}</strong></span></div><button type="button" aria-label={inspectorOpen ? "收起角色侧边栏" : "展开角色侧边栏"} aria-pressed={inspectorOpen} onClick={() => inspectorOpen ? workspaceSurfaceManager.closeSurface("nuwa-inspector") : openInspector()}><PanelRight /></button></header>
        {inspectorOpen ? <><nav aria-label="侧边栏内容"><button type="button" aria-pressed={inspectorTab === "context"} onClick={() => setInspectorTab("context")}>心理与知情</button><button type="button" aria-pressed={inspectorTab === "step"} onClick={() => setInspectorTab("step")}>当前视角</button><button type="button" aria-pressed={inspectorTab === "log"} onClick={() => setInspectorTab("log")}>工程日志</button></nav>
          {inspectorTab === "context" ? <ContextInspector actors={selectedActorContext ? [selectedActorContext] : actorContext} mode={run?.run ? "committed" : "preview"} participantLabels={new Map(bootstrap?.participants.map((participant) => [participant.id, participant.title]) ?? [])} sceneLabels={new Map(bootstrap?.storyUnits.map((unit) => [unit.id, unit.title]) ?? [])} /> : null}
          {inspectorTab === "step" ? <StepInspector step={selectedStep} participantLabels={new Map(run?.run?.participants.map((participant) => [participant.id, participant.title]) ?? [])} /> : null}
          {inspectorTab === "log" ? <LogInspector run={run} /> : null}
        </> : null}
      </aside>
      </div>
      <details className="nuwa-n1-technical"><summary>运行技术详情</summary><dl>{run?.run ? <><div><dt>Run</dt><dd>{run.run.runId}</dd></div><div><dt>修订</dt><dd>{run.run.revision}</dd></div></> : null}<div><dt>执行配置</dt><dd>{availability?.label ?? "本地作品服务未连接"}</dd></div><div><dt>请求记录</dt><dd>{localFake ? "本地工程演练 · 真实 Provider 0 次" : availability?.kind === "local-pi-host" ? `本地宿主请求 ${run?.run?.providerDispatches ?? 0} 次 · 真实 Provider 0 次` : executable ? `本次排演已发送 ${run?.run?.providerDispatches ?? 0} 次 Provider 请求（含工具轮与失败请求）` : "无可执行 Provider"}</dd></div></dl></details>
    </section>
  </main>;
}

function NuwaRunReader(props: { run: NuwaN1ReadModel; selectionMode: boolean; onSelectionModeChange(value: boolean): void; selectedStepId: string | null; selectedStepIds: string[]; onSelectActor(actorId: string): void; onSelectStep(step: NuwaN1Step): void; onToggleCandidate(stepId: string): void }) {
  const run = props.run.run;
  const readerListRef = useRef<HTMLOListElement | null>(null);
  const [atLatest, setAtLatest] = useState(true);
  const selectionMode = props.selectionMode;
  useEffect(() => {
    if (!run) return;
    const reader = readerListRef.current?.closest<HTMLElement>(".nuwa-n1-reader");
    try { if (reader) reader.scrollTop = Number(window.sessionStorage.getItem(`tianyan-nuwa-reader-scroll:${run.runId}`)) || 0; }
    catch { /* the reader still scrolls without browser storage */ }
  }, [run?.runId, run?.steps.length]);
  useEffect(() => {
    const focusStep = (event: Event) => {
      const stepId = (event as CustomEvent<string>).detail;
      const item = Array.from(readerListRef.current?.children ?? []).find((node) => (node as HTMLElement).dataset.stepId === stepId);
      item?.scrollIntoView({ block: "center" });
    };
    window.addEventListener("tianyan-nuwa-focus-step", focusStep);
    return () => window.removeEventListener("tianyan-nuwa-focus-step", focusStep);
  }, []);
  if (!run) return null;
  const scrollToLatest = () => {
    const items = readerListRef.current?.children;
    items?.[items.length - 1]?.scrollIntoView({ block: "nearest" });
  };
  if (!run.steps.length) return <section className="nuwa-n1-empty-run"><Sparkles /><strong>排演已建立，等待第一步</strong><p>选择“单步”开始局部演练；这里不会把场景输入直接写入正式事件。</p></section>;
  return <section className="nuwa-n1-reader" aria-label="排演步骤" onScroll={(event) => { const node = event.currentTarget; setAtLatest(node.scrollHeight - node.scrollTop - node.clientHeight < 48); try { window.sessionStorage.setItem(`tianyan-nuwa-reader-scroll:${run.runId}`, String(node.scrollTop)); } catch { /* scrolling remains usable */ } }}><header><div><small>{run.steps.length} 条已保存消息</small></div><div className="nuwa-n1-reader-tools">{!atLatest ? <button type="button" onClick={scrollToLatest}><ChevronDown aria-hidden="true" />最新消息</button> : null}<button type="button" aria-pressed={selectionMode} onClick={() => props.onSelectionModeChange(!selectionMode)}>{selectionMode ? `完成选择${props.selectedStepIds.length ? ` · ${props.selectedStepIds.length} 已选` : ""}` : `选择结果${props.selectedStepIds.length ? ` · ${props.selectedStepIds.length} 已选` : ""}`}</button></div></header><ol ref={readerListRef} className={selectionMode ? "is-selecting" : ""}>{run.steps.map((step) => {
    const actor = run.participants.find((participant) => participant.id === step.actorId);
    const chosen = props.selectedStepIds.includes(step.stepId);
    const heardNames = step.heardStatements.map((heard) => run.participants.find((participant) => participant.id === heard.recipientId)?.title ?? heard.recipientId).join("、");
    return <li key={step.stepId} data-step-id={step.stepId} className={`${step.stepId === props.selectedStepId ? "is-selected" : ""} ${chosen ? "is-chosen" : ""}`}><article><span className="nuwa-n1-avatar" aria-hidden="true">{(actor?.title ?? "角").slice(0, 1)}</span><div className="nuwa-n1-step-content"><header><button type="button" aria-label={`查看角色 ${actor?.title ?? "角色"}`} onClick={() => props.onSelectActor(step.actorId)}>{actor?.title ?? "角色"}</button><small>第 {step.sequence} 步</small><details className="nuwa-n1-step-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); event.stopPropagation(); } }}><summary aria-label={`第 ${step.sequence} 步消息操作`}>···</summary><div><button type="button" aria-label={`查看第 ${step.sequence} 步来源与依据`} onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) { details.open = false; details.querySelector("summary")?.focus(); } props.onSelectStep(step); }}>查看来源与依据</button>{selectionMode ? <button type="button" aria-label={`${chosen ? "取消选择" : "选择"}第 ${step.sequence} 步结果`} onClick={() => props.onToggleCandidate(step.stepId)}>{chosen ? "取消选择" : "选择此结果"}</button> : null}</div></details></header>{step.speech ? <p className="nuwa-n1-step-speech">{step.speech}</p> : null}{step.observableResult ? <p className="nuwa-n1-step-happened">{step.observableResult}</p> : null}{selectionMode ? <label className="nuwa-n1-step-select"><input type="checkbox" checked={chosen} onChange={() => props.onToggleCandidate(step.stepId)} /><span>{chosen ? "已选结果" : "选择结果"}</span></label> : null}</div></article></li>;
  })}</ol></section>;
}

function StoryThreadMap(props: { run: NuwaN1ReadModel | null; selectedStepId: string | null; selectedStepIds: string[]; onSelectStep(step: NuwaN1Step): void; onToggleCandidate(stepId: string): void }) {
  const run = props.run?.run;
  if (!run) return <section className="nuwa-n1-story-map" aria-label="剧情脉络线"><header><div><small>剧情脉络线</small><h2>当前附近的故事</h2></div><MapIcon aria-hidden="true" /></header><div className="nuwa-n1-map-empty"><GitBranch /><strong>建立排演后显示故事导图</strong><p>这里会按单元、节点与真实排演结果呈现当前附近脉络，不会补造预测。</p></div></section>;
  const currentScene = run.scope.scenes[run.scope.currentSceneIndex] ?? run.scope.scenes[0];
  const previousScene = run.scope.scenes[run.scope.currentSceneIndex - 1] ?? null;
  const nextScene = run.scope.scenes[run.scope.currentSceneIndex + 1] ?? null;
  const currentSteps = run.steps.filter((step) => step.scene.storyUnitId === currentScene?.storyUnit.id);
  const decisionSteps = currentSteps.slice(-3);
  return <section className="nuwa-n1-story-map" aria-label="剧情脉络线">
    <details className="nuwa-n1-thread-more">
      <summary><MapIcon aria-hidden="true" /><strong>剧情脉络线 · 本次排演的单元、节点与决策</strong><small>{currentSteps.length} 个节点 · 正式位置以事件线为准</small></summary>
      <div className="nuwa-n1-unit-track" aria-label="单元级别">
        <article className="is-adjacent"><small>上一个单元</small><strong>{previousScene?.label ?? "当前范围没有上一单元"}</strong></article>
        <article className="is-current"><small>当前单元</small><strong>{currentScene?.label ?? run.scene.label}</strong><span>{run.scope.storylineLabel}</span></article>
        <article className="is-adjacent"><small>下一个单元</small><strong>{nextScene?.label ?? "当前范围没有下一单元"}</strong></article>
      </div>
      <div className="nuwa-n1-node-track" aria-label="节点级别">
        <div className="nuwa-n1-map-section-title"><span>节点推进</span><small>{currentSteps.length} 个已保存步骤</small></div>
        {currentSteps.length ? currentSteps.map((step) => {
          const actor = run.participants.find((participant) => participant.id === step.actorId);
          const verb = actionLabel(step.action?.action);
          return <button key={step.stepId} type="button" className={step.stepId === props.selectedStepId ? "is-current" : ""} onClick={() => props.onSelectStep(step)}><span>{step.sequence}</span><div><small>{actor?.title ?? "角色"} · {verb ?? step.action?.action ?? "观察"}</small><strong>{step.observableResult}</strong></div></button>;
        }) : <p>尚无节点。开始第一步后，真实排演结果会沿线出现。</p>}
      </div>
      <div className="nuwa-n1-decision-track" aria-label="预测与决策级别">
        <div className="nuwa-n1-map-section-title"><span>预测 / 决策点</span><small>只使用已有排演结果</small></div>
        {decisionSteps.length ? <div className="nuwa-n1-decision-branches">{decisionSteps.map((step) => <label key={step.stepId} className={props.selectedStepIds.includes(step.stepId) ? "is-selected" : ""}><input type="checkbox" checked={props.selectedStepIds.includes(step.stepId)} onChange={() => props.onToggleCandidate(step.stepId)} /><span><small>结果 {step.sequence}</small><strong>{step.observableResult}</strong><em>{props.selectedStepIds.includes(step.stepId) ? "已选作后续决策" : "可选作候选"}</em></span></label>)}</div> : <p>暂无可选择的预测结果；不会用占位内容冒充分支。</p>}
      </div>
    </details>
  </section>;
}

function actionLabel(action: string | undefined): string | null {
  return ({ speak: "说话", observe: "观察", ask: "询问", write: "书写", move: "移动" } as Record<string, string>)[action ?? ""] ?? null;
}

function ContextInspector(props: { mode: "preview" | "committed"; participantLabels: ReadonlyMap<string, string>; sceneLabels: ReadonlyMap<string, string>; actors: Array<{ actorId: string; actorLabel: string; localGoal: string; coreSummary: string; profileBasis: { core: string | null; boundaries: string | null; sourceRevision: string }; attention: { selected: Array<{ sourceId: string; reason: string }>; excluded: { count: number }; budget: { estimator: string; maxInputTokens: number; baseBytes: number; sourceBudgetBytes: number; selectedSourceBytes: number; outputReserveTokens: number; requiredOverflow: boolean } }; knowledgeItems: Array<{ id: string; summary: string; visibility: string }>; beliefItems: Array<{ id: string; summary: string; stance: string }>; memoryItems: Array<{ id: string; summary: string; source: { speakerId: string; sourceRunId: string; sourceStepId: string; sceneId: string; sceneObservedAt: string; workVersionId: string; workRevision: string; validity: "active" }; selectedByAttention?: boolean }>; evidenceRefs: string[]; excludedCount: number }> }) {
  if (!props.actors.length) return <section className="nuwa-n1-inspector-empty"><UsersRound /><p>选择参与者后可查看各自允许的上下文；未选择的人物不会收到这些材料。</p></section>;
  return <section className="nuwa-n1-context-list">{props.actors.map((actor) => <article key={actor.actorId}>
    <header><strong>{actor.actorLabel}</strong><small>{props.mode === "preview" ? "本轮上下文预览" : "本步骤使用的依据"}</small></header>
    <dl className="nuwa-n1-role-state"><div><dt>心理状态</dt><dd>未接入</dd></div><div><dt>当前视角</dt><dd>{actor.actorLabel}</dd></div><div><dt>角色记忆</dt><dd>{actor.memoryItems.length ? `${actor.memoryItems.length} 条有来源记录` : "暂无数据"}</dd></div><div><dt>已知 / 未知</dt><dd>{actor.knowledgeItems.length} 条已知 · {actor.excludedCount} 项权限排除</dd></div></dl>
    <dl className="nuwa-n1-context-basis"><div><dt>角色核心</dt><dd>{actor.profileBasis.core ?? "未设置"}</dd></div><div><dt>底线</dt><dd>{actor.profileBasis.boundaries ?? "未设置"}</dd></div><div><dt>本场目标</dt><dd>{actor.localGoal}</dd></div></dl>
    <p>{actor.knowledgeItems.length ? actor.knowledgeItems.map((item) => item.summary).join("；") : "当前没有可安全提供的已知内容。"}</p>
    {actor.beliefItems.length ? <p><small>信念与误解</small><br />{actor.beliefItems.map((item) => item.summary).join("；")}</p> : null}
    {actor.memoryItems.length ? <div className="nuwa-n1-memory-sources"><small>听闻 · 与正式关系、已确认事实分开</small><ul>{actor.memoryItems.map((item) => <li key={item.id}><span>{props.participantLabels.get(item.source.speakerId) ?? "一位角色"}在{props.sceneLabels.get(item.source.sceneId) ?? "先前场景"}告诉{actor.actorLabel}：{readableMemoryStatement(item.summary)}</span><small>{item.source.validity === "active" ? "当前有效" : item.source.validity}{item.selectedByAttention === false ? " · 本轮未选入" : " · 已选入本轮依据"}</small><details><summary>复制与定位来源</summary><code>{item.source.sourceRunId} / {item.source.sourceStepId} / {item.source.workVersionId}@r{item.source.workRevision} / {item.source.sceneObservedAt}</code></details></li>)}</ul></div> : null}
    <details className="nuwa-n1-context-technical"><summary>其他资料 · 查看来源、修订与预算详情</summary><p>人物修订：{actor.profileBasis.sourceRevision}</p>{actor.attention.selected.length ? <ol className="nuwa-n1-attention-sources">{actor.attention.selected.map((source) => <li key={`${source.sourceId}:${source.reason}`}><span>{source.sourceId}</span><small>{attentionReasonLabel(source.reason)}</small></li>)}</ol> : <p>预算内没有额外可用依据。</p>}<div className="nuwa-n1-attention-budget"><small>UTF-8 保守估算</small><span>已选来源 {actor.attention.budget.selectedSourceBytes} / {actor.attention.budget.sourceBudgetBytes} 字节 · 完整输入上限 {actor.attention.budget.maxInputTokens} · 输出预留 {actor.attention.budget.outputReserveTokens}；不是实际计费 token</span></div></details>
    <footer><span>{actor.evidenceRefs.length} 条已选来源</span>{actor.attention.excluded.count ? <span>{actor.attention.excluded.count} 条低相关来源未选入</span> : null}{actor.excludedCount ? <span>{actor.excludedCount} 项权限排除（身份隐藏）</span> : null}</footer>
  </article>)}</section>;
}

function readableMemoryStatement(summary: string): string {
  return summary.match(/^听闻：.+? 说“(.+)”$/u)?.[1] ?? summary;
}

function StepInspector(props: { step: NuwaN1Step | null; participantLabels?: ReadonlyMap<string, string> }) {
  if (!props.step) return <section className="nuwa-n1-inspector-empty"><FileClock /><p>选择一个排演步骤，查看它的执行结果与状态决定。</p></section>;
  const heardName = (recipientId: string) => props.participantLabels?.get(recipientId) ?? recipientId;
  return <section className="nuwa-n1-step-detail"><small>第 {props.step.sequence} 步</small><h3>本步骤结果</h3><dl><div><dt>人物意图</dt><dd>{props.step.intent}</dd></div>{props.step.speech ? <div><dt>人物对白</dt><dd>{props.step.speech}</dd></div> : null}{props.step.action ? <div><dt>人物行动</dt><dd>{actionLabel(props.step.action.action) ?? props.step.action.action}</dd></div> : null}<div><dt>发生的结果</dt><dd>{props.step.observableResult}</dd></div>{props.step.heardStatements.length ? <div><dt>谁听到了</dt><dd>{props.step.heardStatements.map((heard) => <span key={heard.recipientId}>仅递送给 {heardName(heard.recipientId)}</span>)}</dd></div> : null}</dl><details><summary>技术依据</summary><p>上下文工具：{props.step.tool.name}</p>{props.step.heardStatements.map((heard) => <p key={`${heard.recipientId}:source`}>听闻来源：{heard.sourceStepId}@{heard.sourceRevision}</p>)}{props.step.contextEvidenceRefs.map((reference) => <p key={`${reference.kind}:${reference.id}`}>{reference.visibility} · {reference.sourceId}@{reference.sourceRevision}</p>)}</details></section>;
}

function ApplicationSummary(props: { application: NonNullable<NuwaN1ReadModel["automaticApplication"]>; heardCount: number; onOpenEvent(): void; onOpenRelation(): void; onOpenFixedDraft(): void }) {
  const application = props.application;
  const rolledBack = application.status === "rolled-back";
  return <section className="nuwa-n1-application-summary" data-testid="nuwa-n1-application-summary" data-status={application.status}>
    <header><div><small>本场正式变化</small><h2>{rolledBack ? "本批已补偿回溯" : application.status === "applied" ? "授权范围内的变化已保存" : "自动应用需要恢复"}</h2><p>{rolledBack ? "原 Run、固定稿和历史回执保持可查；当前有效故事已按补偿版本更新。" : "显示来自实际 Owner 回执的结果；听闻单列，不与正式事实或关系合计。"}</p></div><strong>{application.status === "applied" ? "已应用" : application.status === "rolled-back" ? "已回溯" : "待恢复"}</strong></header>
    <dl><div><dt>正式事件</dt><dd>{application.eventId ? "1 项" : "0 项"}</dd></div><div><dt>正式关系</dt><dd>{application.relationId ? "1 项" : "0 项"}</dd></div><div><dt>叙事位置</dt><dd>{application.narrativePlacementIds.length} 项</dd></div><div><dt>人物新增听闻</dt><dd>{props.heardCount} 项</dd></div></dl>
    <nav aria-label="变化去向">{application.eventId ? <button type="button" onClick={props.onOpenEvent}>查看正式事件</button> : null}{application.relationId ? <button type="button" onClick={props.onOpenRelation}>比较这条关系</button> : <span>本批未配置合法关系类型，没有补造关系。</span>}{application.fixedDraft ? <button type="button" onClick={props.onOpenFixedDraft}>查看并下载固定稿</button> : <span>尚未固定本批故事稿。</span>}</nav>
  </section>;
}

function LogInspector(props: { run: NuwaN1ReadModel | null }) {
  const receipts = props.run?.receipts ?? [];
  const attempts = props.run?.run?.attempts ?? [];
  if (!receipts.length && !attempts.length) return <section className="nuwa-n1-inspector-empty"><History /><p>开始排演后，这里会显示关键状态、工具和回执；不会记录每次输入或角色不可见原文。</p></section>;
  return <ol className="nuwa-n1-log">{attempts.map((attempt) => {
    const provider = attempt.dispatches.filter((dispatch) => dispatch.phase === "provider");
    const internal = attempt.dispatches.filter((dispatch) => dispatch.phase !== "provider");
    const isDirector = attempt.dispatches.some((dispatch) => dispatch.phase === "request" && dispatch.detail === "director-suggestion");
    const observation = attempt.observation;
    return <li key={attempt.attemptId}><small>{isDirector ? "导演建议" : "角色回合"}</small><p>{attemptOutcomeLabel(attempt.outcome)} · 模型发送 {provider.length} 次（{provider.map((dispatch) => providerDispatchStatusLabel(dispatch.status)).join("、") || "无"}）· 内部工具回合 {internal.length} 次 · 工具{toolStatusLabel(attempt.tool.status)}</p><time>{formatTime(attempt.updatedAt)}</time>{observation ? <details><summary>耗时与上下文诊断</summary><p>端到端 {observation.endToEndMs} ms · 装配 {durationLabel(observation.contextAssemblyMs)} · 首轮模型 {durationLabel(observation.firstModelWaitMs)} · 本地工具 {durationLabel(observation.localToolMs)} · 次轮模型 {durationLabel(observation.secondModelWaitMs)} · 校验 {durationLabel(observation.businessValidationMs)} · 步骤保存 {durationLabel(observation.stepSaveMs)}</p><p>上下文 {observation.context ? `${observation.context.bytes} 字节 · 来源 ${observation.context.sourceCount} · 近况对白 ${observation.context.dialogueCount} · ${observation.context.version} · 来源摘要 ${observation.context.sourceSetId}` : "未取得"}；用量 {attempt.usage ? `${attempt.usage.inputTokens}/${attempt.usage.outputTokens} token（${attempt.usage.source === "reported" ? "回报" : "估算"}）` : "未知"}</p><p>请求形状：{observation.rounds.map((round, index) => `${index + 1} 轮 ${round.requestBytes ?? "未知"} 字节 / ${round.messageCount ?? "未知"} 条消息 / ${round.toolCount ?? "未知"} 个工具 / ${round.shapeId ?? "未知"}`).join("；") || "未发送"}</p>{observation.rounds.map((round, index) => <p key={index}>第 {index + 1} 轮实发：{round.wire ? `${round.wire.modelId} · max_tokens ${round.wire.maxTokens} · thinking ${String(round.wire.thinking)} · stream ${String(round.wire.stream)} · tool_choice ${round.wire.toolChoice ?? "无"} · timeout ${round.wire.timeoutMs ?? "未知"} ms` : "未取得"}；分片：{round.frames ? `正文 ${round.frames.contentChunks}/${round.frames.contentBytes} 字节、思考 ${round.frames.reasoningChunks}/${round.frames.reasoningBytes} 字节、工具参数 ${round.frames.toolArgumentChunks}/${round.frames.toolArgumentBytes} 字节；调用 ${round.frames.toolCalls} 个 ${round.frames.toolName ?? "无"}；JSON 闭合 ${String(round.frames.argumentsJsonClosed)}、空参数 schema ${String(round.frames.argumentsSchemaValid)}；finish ${round.frames.finishReason ?? "未知"}；usage ${round.frames.usageReceived ? "收到" : "未知"}；错误 ${round.frames.malformedReason ?? "无"}` : "未取得"}</p>)}</details> : null}</li>;
  })}{receipts.map((receipt) => <li key={receipt.operationId}><small>{receipt.kind}</small><p>{receiptLabel(receipt.kind)} · 修订 {receipt.revision}</p><time>{formatTime(receipt.recordedAt)}</time></li>)}</ol>;
}

function durationLabel(value: number | null): string { return value == null ? "未知" : `${value} ms`; }

function NuwaUnavailable(props: { title: string; detail: string; loading?: boolean }) {
  return <main className="shell-workspace shell-workspace-nuwa"><section className="nuwa-n1-unavailable" role={props.loading ? "status" : "alert"}>{props.loading ? <RefreshCw /> : <AlertTriangle />}<h1>{props.title}</h1><p>{props.detail}</p></section></main>;
}

function statusLabel(status: NuwaN1Run["status"] | "ready") { return ({ ready: "准备中", running: "排演中", paused: "已暂停", completed: "已完成", cancelled: "已停止", blocked: "需要处理" } as const)[status]; }
function messageFor(reason: unknown, fallback: string) { return reason instanceof Error && reason.message ? reason.message : fallback; }
function selectedParticipants(bootstrap: NuwaN1Bootstrap | null, ids: string[], goals: Record<string, string>) { return bootstrap?.participants.filter((participant) => ids.includes(participant.id)).map((participant) => ({ ...participant, localGoal: goals[participant.id]?.normalize("NFC").trim() })) ?? []; }
function cueTargetSummary(addressee: NuwaN1CueAddressee | null, labels: Map<string, string>) {
  if (!addressee) return "未定向";
  if (addressee.kind === "nuwa") return "女娲";
  if (addressee.kind === "all-actors") return "全体角色";
  return addressee.actorIds.map((id) => labels.get(id) ?? id).join("、");
}
function cueStateLabel(addressee: NuwaN1CueAddressee | null, labels: Map<string, string>) {
  if (!addressee) return "未定向 · 在补选对象之前不会发送给任何角色";
  if (addressee.kind === "nuwa") return "女娲 · 已保存，暂未执行";
  return `${cueTargetSummary(addressee, labels)} · ${addressee.kind === "all-actors" ? "每位接收角色的回合各生效一次" : "该角色的回合"}生效，提交后消费`;
}
function cueRecipientIds(addressee: NuwaN1CueAddressee | null, participants: ReadonlyArray<{ id: string }>): string[] {
  if (!addressee || addressee.kind === "nuwa") return [];
  return addressee.kind === "all-actors" ? participants.map((participant) => participant.id) : addressee.actorIds;
}
function cueProgressLabel(cue: NonNullable<NuwaN1Run["pendingCue"]>, labels: Map<string, string>, participants: ReadonlyArray<{ id: string }>): string | null {
  const consumed = cue.consumedByActorIds ?? [];
  if (!consumed.length) return null;
  const name = (ids: string[]) => ids.map((id) => labels.get(id) ?? id).join("、");
  const waiting = cueRecipientIds(cue.addressee, participants).filter((id) => !consumed.includes(id));
  return waiting.length ? `已送达：${name(consumed)}；等待：${name(waiting)} 的回合` : `已送达全部接收对象（${name(consumed)}），提示结束`;
}
function cueDeliveryNotice(addressee: NuwaN1CueAddressee | null, labels: Map<string, string>) {
  if (!addressee) return "作者提示已保留，但没有接收对象；补选对象之前不会发送给任何角色。";
  if (addressee.kind === "nuwa") return "作者提示已保存，暂未执行：本场排演还没有执行作者规划的入口，也不会进入任何角色上下文。";
  return `作者提示已进入当前 Run 的后续步骤，只会发送给${cueTargetSummary(addressee, labels)}；不会改写既有步骤，也不会写成角色经历。`;
}
function directorStatusLabel(status: NonNullable<NuwaN1Run["directorAdjustment"]>["status"], appliesFromStep: number, appliedStepId: string | null) {
  if (status === "generating") return "正在生成调整建议；尚未改变排演。";
  if (status === "suggested") return `建议待作者采纳；采纳后从第 ${appliesFromStep} 步起生效。`;
  if (status === "expired") return "调整已失效：原场景或本次排演已结束。";
  if (status === "adopted") return appliedStepId ? `已采纳，并已在第 ${appliesFromStep} 步生效。` : `已采纳；从第 ${appliesFromStep} 步起生效。`;
  if (status === "discarded") return "作者已放弃本建议；此前已采纳调整仍按原有效范围执行。";
  if (status === "stale") return "排演已前进；这份建议不能套用，请重新生成。";
  return "生成失败；输入已保留，可明确重试。";
}
function directorNotice(adjustment: NuwaN1Run["directorAdjustment"] | null | undefined) {
  return adjustment ? directorStatusLabel(adjustment.status, adjustment.appliesFromStep, adjustment.appliedStepId) : "导演建议未返回；作者输入保持不变。";
}
function selectedStoryUnit(bootstrap: NuwaN1Bootstrap | null, id: string) { return bootstrap?.storyUnits.find((unit) => unit.id === id) ?? null; }
function newOperationId() { return `nuwa-n1.${crypto.randomUUID()}`; }
function receiptLabel(kind: "create" | "start" | "step" | "pause" | "resume" | "cancel" | "cue" | "director" | "handoff") { return ({ create: "建立排演", start: "开始排演", step: "完成一步", pause: "暂停排演", resume: "恢复排演", cancel: "停止排演", cue: "加入作者提示", director: "处理导演建议", handoff: "送入待确认" } as const)[kind]; }
function attemptOutcomeLabel(outcome: NuwaN1Run["attempts"][number]["outcome"]) { return ({ pending: "执行中", committed: "已提交", failed: "执行失败", cancelled: "已取消", blocked: "预算阻断" } as const)[outcome]; }
function toolStatusLabel(status: NuwaN1Run["attempts"][number]["tool"]["status"]) { return ({ pending: "等待中", completed: "已完成", failed: "失败", cancelled: "已取消" } as const)[status]; }
function providerDispatchStatusLabel(status: NuwaN1Run["attempts"][number]["dispatches"][number]["status"]) { return ({ reserved: "已预留", dispatched: "已进入发送", completed: "已完成", failed: "发送前失败", cancelled: "已取消", unknown: "结果未知" } as const)[status]; }
function runStepBudget(run: NuwaN1Run) { return run.scope.scenes.length === 1 ? 6 : Math.min(6, run.scope.scenes.length * 2); }
function internalToolTurns(run: NuwaN1Run) { return run.attempts.reduce((count, attempt) => count + attempt.dispatches.filter((dispatch) => dispatch.phase !== "provider").length, 0); }
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" }); }
function attentionReasonLabel(reason: string) { return ({ "current-scene-required": "当前场景必需", "goal-keyword-match": "匹配角色目标", "scene-keyword-match": "匹配当前场景", "stable-authorized-fallback": "预算内稳定补充" } as Record<string, string>)[reason] ?? reason; }
