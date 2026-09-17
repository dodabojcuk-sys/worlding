import { ChevronLeft, ChevronRight, PanelRight, UsersRound } from "lucide-react";

export interface NuwaSceneOverviewProps {
  scenes: Array<{ sceneKey: string; title: string }>;
  activeSceneKey: string;
  activeSceneTitle: string;
  /** 1 起的场景序号；未知时为 0 */
  sceneIndex: number;
  worldTimeLabel: string;
  branchDisplayName: string | null;
  sceneSummary: string | null;
  cast: Array<{ id: string; title: string }>;
  saveStatusText: string | null;
  sidebarOpen: boolean;
  onSelectScene(sceneKey: string): void;
  onStepScene(direction: -1 | 1): void;
  onOpenCharacter(characterId: string): void;
  onOpenBranchDrawer(): void;
  onToggleSidebar(): void;
}

/** 顶部场景总览：当前场景、场景导航、情境标签、摘要与出场人物。
 * 只投影既有场景/节点数据，不建立新的场景事实。 */
export function NuwaSceneOverview(props: NuwaSceneOverviewProps) {
  const hasPrev = props.sceneIndex > 1;
  const hasNext = props.sceneIndex > 0 && props.sceneIndex < props.scenes.length;
  return <section className="nuwa-scene-overview" data-testid="nuwa-scene-overview">
      <div className="nuwa-scene-overview-main">
      <div className="nuwa-scene-overview-top">
        {props.scenes.length > 1 ? <span className="nuwa-scene-pager">
          <button type="button" aria-label="上一个场景" disabled={!hasPrev} onClick={() => props.onStepScene(-1)}><ChevronLeft size={14} /></button>
          <span>{props.sceneIndex || "—"} / {props.scenes.length}</span>
          <button type="button" aria-label="下一个场景" disabled={!hasNext} onClick={() => props.onStepScene(1)}><ChevronRight size={14} /></button>
        </span> : null}
        <nav className="nuwa-scene-chips" aria-label="场景导航">
          {props.scenes.map((scene) => <button key={scene.sceneKey} type="button" className={scene.sceneKey === props.activeSceneKey ? "is-active" : ""} onClick={() => props.onSelectScene(scene.sceneKey)}>{scene.title}</button>)}
        </nav>
        {props.saveStatusText ? <span className="nuwa-scene-save-status" role="status">{props.saveStatusText}</span> : null}
      </div>
      <div className="nuwa-scene-overview-title-row">
        <span className="nuwa-scene-overview-label">当前场景</span>
        <h2>{props.activeSceneTitle}</h2>
        <div className="nuwa-scene-tags">
          <span className="nuwa-scene-tag">{props.worldTimeLabel}</span>
          <span className="nuwa-scene-tag">视角 · 作者全知</span>
          {props.branchDisplayName ? <button type="button" className="nuwa-scene-tag is-branch" onClick={props.onOpenBranchDrawer}>分支 · {props.branchDisplayName}</button> : null}
        </div>
      </div>
      {props.sceneSummary ? <p className="nuwa-scene-summary">{props.sceneSummary}</p> : null}
    </div>
    <div className="nuwa-scene-overview-cast">
      <header><UsersRound size={14} /><span>出场角色（{props.cast.length}）</span>
        <button type="button" aria-label={props.sidebarOpen ? "收起故事辅助栏" : "展开故事辅助栏"} aria-pressed={props.sidebarOpen} onClick={props.onToggleSidebar}><PanelRight size={14} /></button>
      </header>
      <div className="nuwa-cast-row">
        {props.cast.map((member) => <button key={member.id} type="button" className="nuwa-cast-chip" title={`查看 ${member.title} 的知情`} onClick={() => props.onOpenCharacter(member.id)}>
          <span className="nuwa-cast-avatar" aria-hidden="true">{member.title.slice(0, 1)}</span>
          <span className="nuwa-cast-name">{member.title}</span>
        </button>)}
        {props.cast.length === 0 ? <span className="nuwa-cast-empty">正文中还没有出场角色</span> : null}
      </div>
    </div>
  </section>;
}
