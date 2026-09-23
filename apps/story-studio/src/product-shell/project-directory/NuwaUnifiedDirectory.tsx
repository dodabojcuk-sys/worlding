import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, Settings, UserRound, X } from "lucide-react";

import { getNuwaN1Bootstrap, getNuwaN1Latest, getNuwaN1Run, type NuwaN1Bootstrap, type NuwaN1ReadModel } from "../../lib/localTransport";
import { NuwaEventLineRail, type BrowsedEvent } from "../../components/nuwa/NuwaEventLineRail";
import type { StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import { STORY_STUDIO_SHELL_NAVIGATION_REGISTRY, type StoryStudioShellDestination } from "../navigation/topLevelDestinationRegistry";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import { ProjectConversationPanel } from "./ProjectConversationPanel";

type DirectoryView = "conversations" | "structure";
const viewKey = "tianyan-nuwa-directory-view";
function initialView(): DirectoryView {
  try { return window.sessionStorage.getItem(viewKey) === "structure" ? "structure" : "conversations"; }
  catch { return "conversations"; }
}
function rememberedUnit(projectId: string | null): { id: string; title: string } | null {
  if (!projectId) return null;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(`tianyan-nuwa-directory-unit:${projectId}`) ?? "null");
    return value && typeof value === "object" && "id" in value && "title" in value && typeof value.id === "string" && typeof value.title === "string" ? { id: value.id, title: value.title } : null;
  } catch { return null; }
}
function rememberedLine(projectId: string | null): string | null {
  if (!projectId) return null;
  try { return window.sessionStorage.getItem(`tianyan-nuwa-directory-line:${projectId}`); }
  catch { return null; }
}

/** Navigation projection over the existing space registry, session archive and Event owners. */
export function NuwaUnifiedDirectory(props: {
  runtime: TianyanShellRuntimeState;
  onClose(): void;
  onNavigate(destination: StoryStudioShellDestination): void;
  onSettings(): void;
  onAccount(): void;
  onOpenTianyi(reference: StoryStudioEventReference, draft: string, sourceLabels?: string[]): void;
}) {
  const { t } = useI18n();
  const projectId = props.runtime.project?.id ?? null;
  const [view, setView] = useState<DirectoryView>(initialView);
  const [refreshKey, setRefreshKey] = useState(0);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<NuwaN1Bootstrap | null>(null);
  const [run, setRun] = useState<NuwaN1ReadModel | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [browsed, setBrowsed] = useState<BrowsedEvent | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<{ id: string; title: string } | null>(() => rememberedUnit(projectId));
  const [selectedLineKey, setSelectedLineKey] = useState<string | null>(() => rememberedLine(projectId));
  const structureRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const runId = new URLSearchParams(window.location.search).get("runId");

  useEffect(() => {
    if (!projectId) { setBootstrap(null); setRun(null); setRunLoading(false); return; }
    let active = true;
    setRunLoading(true);
    void Promise.all([getNuwaN1Bootstrap(projectId), runId ? getNuwaN1Run(projectId, runId) : getNuwaN1Latest(projectId, props.runtime.tianyiConversationId)])
      .then(([nextBootstrap, nextRun]) => { if (active) { setBootstrap(nextBootstrap); setRun(nextRun); setRunLoading(false); setError(null); } })
      .catch(() => { if (active) { setRunLoading(false); setError("故事结构暂时无法读取，排演内容未改变。"); } });
    return () => { active = false; };
  }, [projectId, runId, props.runtime.tianyiConversationId, refreshKey]);

  useEffect(() => {
    const openStructure = () => selectView("structure");
    window.addEventListener("tianyan-nuwa-open-structure", openStructure);
    return () => window.removeEventListener("tianyan-nuwa-open-structure", openStructure);
  }, []);
  useEffect(() => {
    if (!projectId || view !== "structure" || !bootstrap || !structureRef.current) return;
    try { structureRef.current.scrollTop = Number(window.sessionStorage.getItem(`tianyan-nuwa-structure-scroll:${projectId}`)) || 0; }
    catch { /* navigation remains usable */ }
  }, [projectId, view, bootstrap]);

  function selectView(next: DirectoryView) {
    setView(next);
    if (next === "structure") setRefreshKey((value) => value + 1);
    try { window.sessionStorage.setItem(viewKey, next); } catch { /* navigation remains usable without storage */ }
  }
  async function changeProject(nextId: string) {
    if (!nextId || nextId === projectId || switching) return;
    setSwitching(true); setError(null);
    try { await props.runtime.openProject(nextId); window.location.assign("/nuwa"); }
    catch { setError("切换项目失败，当前项目仍保持不变。"); setSwitching(false); }
  }
  const browse = (event: BrowsedEvent | null) => {
    setBrowsed(event);
    setSelectedUnit(null);
    if (projectId) try { window.sessionStorage.removeItem(`tianyan-nuwa-directory-unit:${projectId}`); } catch { /* navigation remains usable */ }
    window.dispatchEvent(new CustomEvent("tianyan-nuwa-browse-event", { detail: event }));
  };
  const chooseUnit = (id: string, title: string) => {
    setSelectedUnit({ id, title }); setBrowsed(null);
    if (projectId) try { window.sessionStorage.setItem(`tianyan-nuwa-directory-unit:${projectId}`, JSON.stringify({ id, title })); } catch { /* selection remains usable */ }
    window.dispatchEvent(new CustomEvent("tianyan-nuwa-browse-unit", { detail: { id, title } }));
  };
  const currentUnitId = run?.run?.scope.scenes[run.run.scope.currentSceneIndex]?.storyUnit.id ?? run?.run?.scene.storyUnitId ?? null;
  const currentLineKey = bootstrap?.storylines.find((line) => line.key === selectedLineKey)?.key ?? bootstrap?.storylines.find((line) => line.units.some((unit) => unit.id === currentUnitId))?.key ?? bootstrap?.storylines[0]?.key ?? null;
  const unitSteps = run?.run?.steps.filter((step) => step.scene.storyUnitId === selectedUnit?.id) ?? [];

  return <aside className="project-directory-panel nuwa-unified-directory" aria-label="女娲统一目录" data-testid="nuwa-unified-directory">
    <header><strong>目录</strong><button type="button" aria-label="收起目录" onClick={props.onClose}><X aria-hidden="true" /></button></header>
    <div className="nuwa-directory-project"><label><span>当前项目</span><span className="nuwa-directory-project-select"><select aria-label="目录项目选择" value={projectId ?? ""} disabled={switching} onChange={(event) => void changeProject(event.target.value)}>{props.runtime.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><ChevronDown aria-hidden="true" /></span></label><button type="button" onClick={() => setCreatingProject((value) => !value)}>新建项目</button></div>
    {creatingProject ? <form className="nuwa-directory-project-create" onSubmit={(event) => { event.preventDefault(); if (!newProjectTitle.trim() || switching) return; setSwitching(true); void props.runtime.createProject(newProjectTitle.trim()).then(() => window.location.assign("/nuwa")).catch(() => { setError("新建项目失败，请保留名称并重试。"); setSwitching(false); }); }}><input aria-label="新项目名称" value={newProjectTitle} maxLength={80} onChange={(event) => setNewProjectTitle(event.target.value)} /><button type="submit" disabled={!newProjectTitle.trim() || switching}>创建</button></form> : null}
    <details className="nuwa-directory-spaces" open={spacesOpen} onToggle={(event) => setSpacesOpen(event.currentTarget.open)}><summary>项目空间 · 女娲</summary><nav aria-label="项目内空间">{STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.filter((item) => item.enabled).map((item) => <button key={item.id} type="button" aria-current={item.id === "nuwa" ? "page" : undefined} onClick={() => props.onNavigate(item)}>{t(item.labelKey as TranslationKey)}</button>)}</nav><div className="nuwa-directory-utilities"><button type="button" onClick={props.onSettings}><Settings aria-hidden="true" />设置</button><button type="button" onClick={props.onAccount}><UserRound aria-hidden="true" />个人中心</button></div></details>
    <div className="nuwa-directory-views" role="tablist" aria-label="女娲目录视图"><button type="button" role="tab" aria-selected={view === "conversations"} onClick={() => selectView("conversations")}>对话与排演</button><button type="button" role="tab" aria-selected={view === "structure"} onClick={() => selectView("structure")}>故事结构</button></div>
    <div className="nuwa-directory-content" hidden={view !== "conversations"}><ProjectConversationPanel key={projectId ?? "none"} runtime={props.runtime} currentProjectOnly onDirectory={() => selectView("structure")} onClose={props.onClose} /></div>
    <div className="nuwa-directory-content is-structure" ref={structureRef} hidden={view !== "structure"} onScroll={(event) => { if (projectId) try { window.sessionStorage.setItem(`tianyan-nuwa-structure-scroll:${projectId}`, String(event.currentTarget.scrollTop)); } catch { /* navigation remains usable */ } }}>
      {error ? <p role="alert">{error}</p> : null}
      {!projectId ? <p>先选择项目，再浏览故事结构。</p> : !bootstrap ? <p>正在读取当前项目的事件线…</p> : <>{bootstrap.storylines.length > 1 ? <label className="nuwa-directory-line-picker">事件线<select aria-label="浏览事件线" value={currentLineKey ?? ""} onChange={(event) => { setSelectedLineKey(event.target.value); setSelectedUnit(null); try { window.sessionStorage.setItem(`tianyan-nuwa-directory-line:${projectId}`, event.target.value); window.sessionStorage.removeItem(`tianyan-nuwa-directory-unit:${projectId}`); } catch { /* line browsing remains usable */ } }}>{bootstrap.storylines.map((line) => <option key={line.key} value={line.key}>{line.title}</option>)}</select></label> : null}<NuwaEventLineRail projectId={projectId} workVersionId={props.runtime.workVersionId ?? null} storylines={bootstrap.storylines} currentStoryUnitId={currentUnitId} selectedStorylineKey={currentLineKey} onlySelectedStoryline browsedEventId={browsed?.eventId ?? null} onSelectEvent={browse} onSelectUnit={chooseUnit} onOpenTianyi={props.onOpenTianyi} /></>}
      {selectedUnit ? <section className="nuwa-directory-selection" aria-live="polite"><strong title={selectedUnit.title}>{selectedUnit.title}</strong><p>{runLoading ? "正在核对本次排演的已保存结果…" : unitSteps.length ? `本次排演在此单元有 ${unitSteps.length} 条已保存结果；点击结果可回到消息。` : "本次排演在此单元没有已保存结果；浏览不会改变排演范围。"}</p>{!runLoading ? unitSteps.map((step) => <button type="button" key={step.stepId} onClick={() => window.dispatchEvent(new CustomEvent("tianyan-nuwa-focus-step", { detail: step.stepId }))}>第 {step.sequence} 步 · {step.speech || step.observableResult}</button>) : null}</section> : null}
      {browsed ? <section className="nuwa-directory-selection" aria-live="polite"><strong title={browsed.title}>{browsed.title}</strong><p>正式事件 · {browsed.unitTitle}；仅浏览，不作为新的排演起点。</p><button type="button" onClick={() => window.location.assign(`/event-line?eventId=${encodeURIComponent(browsed.eventId)}`)}><BookOpen aria-hidden="true" />打开正式事件与来源</button></section> : null}
    </div>
  </aside>;
}
