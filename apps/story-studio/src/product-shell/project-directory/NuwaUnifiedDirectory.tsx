import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Search, Settings, UserRound, X } from "lucide-react";

import type { StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference";
import type { TianyanShellRuntimeState } from "../runtime/TianyanShellRuntime";
import { STORY_STUDIO_SHELL_NAVIGATION_REGISTRY, type StoryStudioShellDestination } from "../navigation/topLevelDestinationRegistry";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/translations";
import { NuwaRunDirectory } from "./NuwaRunDirectory";
import { TianyiConversationDirectory } from "./TianyiConversationDirectory";
import { useProjectDirectoryProjection } from "./useProjectDirectoryProjection";

const expandedKey = "tianyan-project-directory-expanded-space";
const expandedKeyFor = (space: string) => `${expandedKey}:${space}`;

/** Navigation projection over the existing space registry, session archive and Event owners. */
export function NuwaUnifiedDirectory(props: {
  runtime: TianyanShellRuntimeState;
  space?: "nuwa" | "event-line" | "tianyi";
  onClose(): void;
  onNavigate(destination: StoryStudioShellDestination): void;
  onSettings(): void;
  onAccount(): void;
  onSearch(): void;
  onPending(): void;
  onTasks(): void;
  onOpenTianyi(reference: StoryStudioEventReference, draft: string, sourceLabels?: string[]): void;
}) {
  const { t } = useI18n();
  const directoryProjection = useProjectDirectoryProjection(props.runtime.project, t, props.runtime);
  const space = props.space ?? "nuwa";
  const projectId = props.runtime.project?.id ?? null;
  const [expandedSpace, setExpandedSpace] = useState<string | null>(() => {
    try { return window.sessionStorage.getItem(expandedKeyFor(space)) ?? space; }
    catch { return space; }
  });
  useEffect(() => {
    try { setExpandedSpace(window.sessionStorage.getItem(expandedKeyFor(space)) ?? space); }
    catch { setExpandedSpace(space); }
  }, [space]);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  useEffect(() => {
    const openStructure = () => window.location.assign("/event-line");
    window.addEventListener("tianyan-nuwa-open-structure", openStructure);
    return () => window.removeEventListener("tianyan-nuwa-open-structure", openStructure);
  }, []);
  function toggleSpace(id: string) {
    const next = expandedSpace === id ? null : id;
    setExpandedSpace(next);
    try { if (next) window.sessionStorage.setItem(expandedKeyFor(space), next); else window.sessionStorage.removeItem(expandedKeyFor(space)); } catch { /* navigation remains usable */ }
  }
  async function changeProject(nextId: string) {
    if (!nextId || nextId === projectId || switching) return;
    setSwitching(true); setError(null);
    try { await props.runtime.openProject(nextId); window.location.assign(space === "event-line" ? "/event-line" : space === "tianyi" ? "/tianyi" : "/nuwa"); }
    catch { setError("切换项目失败，当前项目仍保持不变。"); setSwitching(false); }
  }
  return <aside className="project-directory-panel nuwa-unified-directory" aria-label="项目与功能目录" data-testid="nuwa-unified-directory">
    <div className="nuwa-directory-project"><label><span className="shell-visually-hidden">当前项目</span><span className="nuwa-directory-project-select"><select aria-label="目录项目选择" value={projectId ?? ""} disabled={switching} onChange={(event) => void changeProject(event.target.value)}>{props.runtime.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><ChevronDown aria-hidden="true" /></span></label><button type="button" aria-label="收起目录" title="收起目录" onClick={props.onClose}><X aria-hidden="true" /></button></div>
    {creatingProject ? <form className="nuwa-directory-project-create" onSubmit={(event) => { event.preventDefault(); if (!newProjectTitle.trim() || switching) return; setSwitching(true); void props.runtime.createProject(newProjectTitle.trim()).then(() => window.location.assign("/nuwa")).catch(() => { setError("新建项目失败，请保留名称并重试。"); setSwitching(false); }); }}><input aria-label="新项目名称" value={newProjectTitle} maxLength={80} onChange={(event) => setNewProjectTitle(event.target.value)} /><button type="submit" disabled={!newProjectTitle.trim() || switching}>创建</button></form> : null}
    <div className="nuwa-directory-quick"><button type="button" onClick={props.onSearch}><Search aria-hidden="true" />搜索</button><button type="button" onClick={() => setCreatingProject((value) => !value)}>＋ 新建项目</button></div>
    <nav className="nuwa-directory-tree" aria-label="项目内功能与对象">
      {STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.filter((item) => item.enabled).map((item) => <div key={item.id} className="nuwa-directory-space">
        <div className="nuwa-directory-space-row">{item.id === "nuwa" || item.id === "event-line" || item.id === "tianyi" ? <button type="button" className="nuwa-directory-space-toggle" aria-label={`${expandedSpace === item.id ? "收起" : "展开"}${t(item.labelKey as TranslationKey)}`} aria-expanded={expandedSpace === item.id} onClick={() => toggleSpace(item.id)}>{expandedSpace === item.id ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button> : <span className="nuwa-directory-space-toggle is-placeholder" aria-hidden="true" />}<button type="button" className="nuwa-directory-space-name" aria-current={item.id === space ? "page" : undefined} onClick={() => item.id === "event-line" ? window.location.assign("/event-line") : props.onNavigate(item)}>{t(item.labelKey as TranslationKey)}</button></div>
        {expandedSpace === item.id && item.id === "tianyi" ? <TianyiConversationDirectory runtime={props.runtime} /> : null}
        {expandedSpace === item.id && item.id === "nuwa" ? <div className="nuwa-directory-children"><button type="button" className="nuwa-directory-child-link" onClick={() => window.location.assign("/nuwa?nuwaView=manage")}>排演管理与新建</button><button type="button" className="nuwa-directory-child-link" onClick={() => window.location.assign("/event-line")}>故事结构 · 选择事件线</button><NuwaRunDirectory runtime={props.runtime} /></div> : null}
        {expandedSpace === item.id && item.id === "event-line" ? <div className="nuwa-directory-children"><button type="button" className="nuwa-directory-child-link" onClick={() => window.location.assign("/event-line")}>选择事件线</button></div> : null}
      </div>)}
    </nav>
    <footer className="nuwa-directory-footer"><button type="button" onClick={props.onPending}>待确认 · {directoryProjection.pendingStatus === "ready" ? directoryProjection.pending?.pendingCount ?? 0 : directoryProjection.pendingStatus === "failed" ? "读取失败" : "…"}</button><button type="button" onClick={props.onTasks}><ClipboardList aria-hidden="true" />任务与运行</button><button type="button" onClick={props.onSettings}><Settings aria-hidden="true" />设置</button><button type="button" onClick={props.onAccount}><UserRound aria-hidden="true" />个人中心</button></footer>
  </aside>;
}
