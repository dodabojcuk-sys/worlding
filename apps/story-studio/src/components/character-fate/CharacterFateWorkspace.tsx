import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Clock3, GitBranch, History, Link2, ListTree, ScanSearch, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { CharacterFatePoint, CharacterFateProjection, CharacterFateTrajectoryKind } from "../../../../../src/storyContracts/characterFateProjection";
import {
  CHARACTER_FATE_FIXTURE_CHARACTERS,
  characterFateFixtureEventTitle,
  createCharacterFateFixtureProjection,
  type CharacterFateFixtureCase
} from "./characterFateFixture";

type AxisMode = "narrative" | "world";
type TrajectoryFilter = "all" | CharacterFateTrajectoryKind;

export function CharacterFateWorkspace(props: {
  projectTitle: string;
  onBack(): void;
  onOpenEventLine(eventId: string, returnToCharacterFate: true): void;
  onOpenWorkDock(prompt: string): void;
  onReturnCharacterState?(): void;
}) {
  const initial = readRoute();
  const [characterId, setCharacterId] = useState(initial.characterId);
  const [trajectory, setTrajectory] = useState<TrajectoryFilter>(initial.trajectory);
  const [axis, setAxis] = useState<AxisMode>(initial.axis);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(initial.selectedPointId);
  const [fixtureCase, setFixtureCase] = useState<CharacterFateFixtureCase>(initial.fixtureCase);
  const [profileCharacterId, setProfileCharacterId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const projection = useMemo(() => createCharacterFateFixtureProjection({ characterId, fixtureCase, branchId: initial.branchId }), [characterId, fixtureCase, initial.branchId]);
  const allPoints = useMemo(() => projection ? pointsForProjection(projection) : [], [projection]);
  const visiblePoints = useMemo(() => allPoints.filter((point) => trajectory === "all" || point.trajectory === trajectory), [allPoints, trajectory]);
  const selectedPoint = allPoints.find((point) => point.pointId === selectedPointId) ?? visiblePoints[0] ?? null;

  useEffect(() => {
    if (!selectedPoint && selectedPointId) setSelectedPointId(null);
    if (!selectedPointId && selectedPoint) setSelectedPointId(selectedPoint.pointId);
  }, [selectedPoint?.pointId, selectedPointId]);

  useEffect(() => {
    writeRoute({ characterId, trajectory, axis, selectedPointId: selectedPoint?.pointId ?? null, fixtureCase, branchId: projection?.branchId || initial.branchId });
  }, [axis, characterId, fixtureCase, initial.branchId, projection?.branchId, selectedPoint?.pointId, trajectory]);

  useLayoutEffect(() => {
    if (new URL(window.location.href).searchParams.get("returned") !== "1") return;
    const value = readReturnSnapshot(characterId);
    const scrollHost = rootRef.current?.closest<HTMLElement>(".data-workspace");
    const restore = () => {
      if (scrollHost && value) scrollHost.scrollTop = value.scrollTop;
      const target = value?.focusPointId || selectedPoint?.pointId;
      if (target) document.querySelector<HTMLElement>(`[data-fate-point-id="${CSS.escape(target)}"]`)?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
    const url = new URL(window.location.href);
    url.searchParams.delete("returned");
    window.history.replaceState({ ...(window.history.state ?? {}), workspace: "data" }, "", `${url.pathname}${url.search}${url.hash}`);
    return () => window.cancelAnimationFrame(frame);
  }, [characterId, selectedPoint?.pointId]);

  const actualCount = projection?.actualTrajectory.length ?? 0;
  const plannedCount = projection?.plannedTrajectory.length ?? 0;
  const candidateCount = projection?.candidateTrajectory.length ?? 0;
  const hasConflict = Boolean(projection?.conflictRecords.length);
  const hasStale = allPoints.some((point) => point.stale || point.authority === "stale");
  const hasUnknown = Boolean(projection?.unknownIntervals.length);
  const insufficient = visiblePoints.length <= 1;

  const choosePoint = (point: CharacterFatePoint) => {
    setSelectedPointId(point.pointId);
  };
  const openEvent = (point: CharacterFatePoint) => {
    const scrollHost = rootRef.current?.closest<HTMLElement>(".data-workspace");
    writeReturnSnapshot(characterId, { scrollTop: scrollHost?.scrollTop || 0, focusPointId: point.pointId });
    setSelectedPointId(point.pointId);
    props.onOpenEventLine(point.eventId, true);
  };
  const handlePointKey = (event: ReactKeyboardEvent<HTMLButtonElement>, point: CharacterFatePoint) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = visiblePoints.findIndex((item) => item.pointId === point.pointId);
    const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? visiblePoints.length - 1 : (index + (event.key === "ArrowRight" ? 1 : visiblePoints.length - 1)) % visiblePoints.length;
    const target = visiblePoints[targetIndex];
    if (!target) return;
    choosePoint(target);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-fate-point-id="${CSS.escape(target.pointId)}"]`)?.focus());
  };

  return <main ref={rootRef} className="character-fate-workspace" data-testid="character-fate-workspace" data-axis={axis} data-trajectory={trajectory} data-owner-boundary="read-only-projection">
    <header className="character-fate-toolbar">
      <button type="button" className="icon-action" onClick={new URL(window.location.href).searchParams.get("returnTo") === "character-state" && props.onReturnCharacterState ? props.onReturnCharacterState : props.onBack} aria-label={new URL(window.location.href).searchParams.get("returnTo") === "character-state" ? "返回角色状态" : "返回数据首页"}><ArrowLeft /></button>
      <div><small>数据 · 只读投影</small><h1>角色命运 K 线</h1><p>不是命运分数；它将已发生、作者规划和待确认可能分开。</p></div>
      <button type="button" className="secondary-action" onClick={() => props.onOpenWorkDock(`解释${projection?.characterName || "当前角色"}的实际、规划与候选轨迹，列出证据缺口；使用隔离 Fixture，不调用真实 Provider。`)}><Sparkles />天意工作</button>
    </header>

    <section className="character-fate-context" aria-label="当前角色命运范围">
      <label><UserRound />当前角色<select aria-label="当前角色" value={characterId} onChange={(event) => { setCharacterId(event.target.value); setSelectedPointId(null); }}><option value="">选择角色</option>{CHARACTER_FATE_FIXTURE_CHARACTERS.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}</select></label>
      <span><BookOpen /><span><small>当前作品与版本</small><strong>{props.projectTitle} · R0</strong></span></span>
      <span><GitBranch /><span><small>当前范围</small><strong>{projection?.scope || "当前 Branch 无数据"}</strong></span></span>
      <label className="character-fate-case-control"><ScanSearch />验收状态<select aria-label="验收状态" value={fixtureCase} onChange={(event) => { setFixtureCase(event.target.value as CharacterFateFixtureCase); setSelectedPointId(null); }}><option value="complete">完整轨迹</option><option value="single">只有一点</option><option value="planned-only">只有规划</option><option value="actual-only">只有实际</option><option value="unknown-only">时间全部未知</option><option value="conflict">来源冲突</option><option value="stale">来源过期</option><option value="rejected">Candidate 已拒绝</option><option value="empty-branch">当前 Branch 无数据</option></select></label>
    </section>

    {!projection ? <EmptyState title="没有角色" body="当前没有可投影的稳定 Character ID。请先在资料中建立或确认角色。" /> : projection.branchId !== "branch.main" ? <EmptyState title="当前 Branch 没有角色轨迹" body="该 Branch 不会借用原始主线的状态。请切换 Branch 或先建立有来源的 Event。" /> : <>
      <section className="character-fate-summary" aria-label="轨迹摘要">
        <article><strong>{actualCount}</strong><span>实际轨迹点</span></article><article><strong>{plannedCount}</strong><span>规划轨迹点</span></article><article><strong>{candidateCount}</strong><span>候选轨迹点</span></article><article><strong>{projection.unknownIntervals.length}</strong><span>未知区间</span></article>
      </section>

      <section className="character-fate-controls" aria-label="轨迹观察方式">
        <div className="character-fate-filter" role="tablist" aria-label="轨迹类型">{(["all", "actual", "planned", "candidate"] as const).map((value) => <button type="button" role="tab" aria-selected={trajectory === value} className={trajectory === value ? "is-active" : ""} onClick={() => setTrajectory(value)} key={value}>{trajectoryLabel(value)}</button>)}</div>
        <div className="character-fate-axis" role="group" aria-label="横轴模式"><span><Clock3 />横轴</span><button type="button" aria-pressed={axis === "narrative"} onClick={() => setAxis("narrative")}>叙事进程</button><button type="button" aria-pressed={axis === "world"} onClick={() => setAxis("world")}>世界时间</button></div>
      </section>

      <section className="character-fate-legend" aria-label="权威状态图例"><span className="is-actual"><i />实际 · 实线</span><span className="is-planned"><i />规划 · 虚线</span><span className="is-candidate"><i />候选 · 点线与待确认</span><span className="is-unknown"><AlertTriangle />未知 · 不插值</span></section>

      {(hasUnknown || hasConflict || hasStale || fixtureCase === "rejected") && <section className="character-fate-alerts" aria-label="证据缺口">{hasUnknown && <p><AlertTriangle /><strong>存在未知时间</strong><span>仅保留叙事顺序，不伪造日期或插值。</span></p>}{hasConflict && <p><GitBranch /><strong>存在来源冲突</strong><span>两份有效来源同时保留，等待作者判断。</span></p>}{hasStale && <p><History /><strong>存在过期来源</strong><span>来源版本已变化，旧结论不再作为当前事实。</span></p>}{fixtureCase === "rejected" && <p><AlertTriangle /><strong>Candidate 已拒绝</strong><span>被拒绝的候选不再显示为命运轨迹，仅保留审计状态。</span></p>}</section>}

      {visiblePoints.length === 0 ? <EmptyState title={trajectory === "planned" ? "只有实际，没有作者规划" : trajectory === "actual" ? "只有规划，尚未发生" : "有角色，但没有关联 Event"} body="当前筛选范围内没有可追溯的轨迹点。投影不会用其他轨迹补齐。" /> : <>
        {insufficient && <section className="character-fate-insufficient" role="note"><ListTree /><span><strong>现有证据还不足以形成完整轨迹</strong><small>至少还需要一个具有稳定 Event ID、状态前后值和来源锚点的转折。</small></span></section>}
        <section className="character-fate-chart" aria-label={`${projection.characterName}的角色命运多轨轨迹`}>
          {(["actual", "planned", "candidate"] as const).filter((kind) => trajectory === "all" || trajectory === kind).map((kind) => {
            const points = visiblePoints.filter((point) => point.trajectory === kind);
            return <article className={`character-fate-lane is-${kind}`} data-trajectory-kind={kind} key={kind}><header><strong>{trajectoryLabel(kind)}</strong><small>{laneDescription(kind)}</small></header><div className="character-fate-lane-track" role="list" aria-label={`${trajectoryLabel(kind)}轨迹`}>{points.length ? points.map((point) => <button type="button" role="listitem" className={`character-fate-point is-${point.authority} ${selectedPoint?.pointId === point.pointId ? "is-selected" : ""}`} aria-label={`${characterFateFixtureEventTitle(point.eventId)}：${point.stateDimensionLabel}，${authorityLabel(point.authority)}`} aria-pressed={selectedPoint?.pointId === point.pointId} data-fate-point-id={point.pointId} data-event-id={point.eventId} data-authority={point.authority} onClick={() => choosePoint(point)} onDoubleClick={() => openEvent(point)} onKeyDown={(event) => handlePointKey(event, point)} key={point.pointId}><span>{axis === "narrative" ? `#${point.narrativeOrder}` : point.worldTime.label}</span><strong>{point.stateDimensionLabel}</strong><small>{point.valueBefore || "未知"} <ArrowRight /> {point.valueAfter || "未知"}</small><em>{authorityLabel(point.authority)}</em></button>) : <p>当前没有{trajectoryLabel(kind)}轨迹。</p>}</div></article>;
          })}
        </section>

        {selectedPoint && <PointDetail point={selectedPoint} onOpenEvent={() => openEvent(selectedPoint)} onOpenCharacter={() => setProfileCharacterId(selectedPoint.characterId)} onOpenCharacterState={props.onReturnCharacterState} />}

        <section className="character-fate-table-wrap" aria-labelledby="character-fate-table-title"><header><div><small>图表的等价表格</small><h2 id="character-fate-table-title">轨迹明细</h2></div><span>可用键盘逐行访问</span></header><div className="character-fate-table-scroll"><table><thead><tr><th>顺序</th><th>世界时间</th><th>事件</th><th>变化前</th><th>变化后</th><th>权威状态</th><th>来源</th><th>解释</th></tr></thead><tbody>{visiblePoints.map((point) => <tr key={point.pointId} data-authority={point.authority}><td>{point.narrativeOrder}</td><td>{point.worldTime.label}</td><td><button type="button" onClick={() => choosePoint(point)}>{characterFateFixtureEventTitle(point.eventId)}</button></td><td>{point.valueBefore || "未知"}</td><td>{point.valueAfter || "未知"}</td><td>{authorityLabel(point.authority)}</td><td>{point.sourceAnchorIds.join("、") || "缺少来源"}</td><td>{point.explanation}</td></tr>)}</tbody></table></div></section>
      </>}
    </>}
    {profileCharacterId && projection ? <section className="character-fate-profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setProfileCharacterId(null); }}><article className="character-fate-profile" role="dialog" aria-modal="true" aria-labelledby="character-fate-profile-title" data-testid="character-fate-profile"><header><div><small>资料 · 隔离 Fixture · 只读</small><h2 id="character-fate-profile-title">{projection.characterName}</h2></div><button type="button" className="icon-action" aria-label="关闭角色资料" onClick={() => setProfileCharacterId(null)}><X /></button></header><dl><div><dt>稳定 Character ID</dt><dd>{profileCharacterId}</dd></div><div><dt>Character revision</dt><dd>{projection.characterRevision}</dd></div><div><dt>当前范围</dt><dd>{projection.scope}</dd></div><div><dt>投影边界</dt><dd>只读现有 Character / Event / source owner</dd></div></dl><section><h3>当前转折来源</h3>{selectedPoint?.sourceAnchorIds.length ? <ul>{selectedPoint.sourceAnchorIds.map((id) => <li key={id}><Link2 />{id}</li>)}</ul> : <p>当前点缺少来源，不能升级为事实。</p>}<p>{selectedPoint?.knowledgeBoundary}</p></section><footer><button type="button" className="secondary-action" onClick={() => setProfileCharacterId(null)}>返回命运线</button></footer></article></section> : null}
  </main>;
}

function PointDetail(props: { point: CharacterFatePoint; onOpenEvent(): void; onOpenCharacter(): void; onOpenCharacterState?(): void }) {
  const point = props.point;
  return <section className="character-fate-point-detail" aria-label="轨迹点详情" data-testid="character-fate-point-detail"><header><div><small>当前转折</small><h2>{characterFateFixtureEventTitle(point.eventId)}</h2><p>{point.unitLabel} / {point.setPointLabel} / Event</p></div><span className={`authority-badge is-${point.authority}`}>{authorityLabel(point.authority)}</span></header><div className="character-fate-detail-grid"><dl><div><dt>叙事顺序</dt><dd>#{point.narrativeOrder}</dd></div><div><dt>世界时间</dt><dd>{point.worldTime.label}</dd></div><div><dt>Storyline</dt><dd>{point.storylineIds.join("、")}</dd></div><div><dt>状态变化</dt><dd>{point.valueBefore || "未知"} → {point.valueAfter || "未知"}</dd></div></dl><article><h3>为什么形成转折</h3><p>{point.explanation}</p><h3>角色当时的知识边界</h3><p>{point.knowledgeBoundary || "未形成可验证的知识边界。"}</p></article><article><h3>来源锚点</h3>{point.sourceAnchorIds.length ? <ul>{point.sourceAnchorIds.map((sourceAnchorId) => <li key={sourceAnchorId}><Link2 />{sourceAnchorId}</li>)}</ul> : <p>缺少来源，本点不能升级为事实。</p>}<p>{point.stale ? "来源已过期。" : point.conflictGroupId ? "该点属于来源冲突组。" : "来源版本当前有效。"}</p></article></div><section className="character-fate-state-explanation" data-testid="character-fate-state-explanation"><h3>这个转折如何改变角色状态</h3><dl><div><dt>事实变化</dt><dd>{point.stateDimensionLabel}：{point.valueBefore || "未知"} → {point.valueAfter || "未知"}</dd></div><div><dt>角色新知道</dt><dd>{point.trajectory === "actual" ? point.knowledgeBoundary : "尚未发生，不进入当前知识"}</dd></div><div><dt>仍然未知</dt><dd>寄信人身份与没有来源支持的精确时间保持未知。</dd></div><div><dt>信念 / 目标</dt><dd>{point.trajectory === "actual" ? "只显示有 Event 与来源支持的变化。" : "规划或候选不能伪装成已发生状态。"}</dd></div><div><dt>越界风险</dt><dd>{point.sourceAnchorIds.length ? "当前来源可追溯；仍需遵守角色视角。" : "缺少来源，不能升级为事实。"}</dd></div></dl></section><footer><button type="button" className="primary-action" onClick={props.onOpenEvent}><BookOpen />打开事件线</button>{props.onOpenCharacterState && <button type="button" className="secondary-action" onClick={props.onOpenCharacterState}><Clock3 />打开当前状态</button>}<button type="button" className="secondary-action" onClick={props.onOpenCharacter}><UserRound />打开角色资料</button></footer></section>;
}

function EmptyState(props: { title: string; body: string }) {
  return <section className="character-fate-empty" data-testid="character-fate-empty"><ListTree /><h2>{props.title}</h2><p>{props.body}</p></section>;
}

function pointsForProjection(projection: CharacterFateProjection): CharacterFatePoint[] {
  return [...projection.actualTrajectory, ...projection.plannedTrajectory, ...projection.candidateTrajectory].sort((left, right) => left.narrativeOrder - right.narrativeOrder || left.pointId.localeCompare(right.pointId));
}

function trajectoryLabel(value: TrajectoryFilter): string {
  return value === "all" ? "全部" : value === "actual" ? "实际" : value === "planned" ? "规划" : "候选";
}

function laneDescription(value: CharacterFateTrajectoryKind): string {
  return value === "actual" ? "只来自已确认 Event 和明确状态变化" : value === "planned" ? "作者已确认的方向，不等于已发生" : "待审查可能，始终保持未确认";
}

function authorityLabel(value: CharacterFatePoint["authority"]): string {
  return ({ confirmed: "已确认事实", author_planned: "作者规划", candidate: "待确认候选", inferred: "模型判断", unknown: "未知", conflicted: "来源冲突", stale: "来源过期" } as const)[value];
}

function readRoute(): { characterId: string; trajectory: TrajectoryFilter; axis: AxisMode; selectedPointId: string | null; fixtureCase: CharacterFateFixtureCase; branchId: string } {
  const params = new URL(window.location.href).searchParams;
  const trajectory = params.get("trajectory");
  const fixtureCase = params.get("case");
  return {
    characterId: params.get("character") || CHARACTER_FATE_FIXTURE_CHARACTERS[0]!.id,
    trajectory: trajectory === "actual" || trajectory === "planned" || trajectory === "candidate" ? trajectory : "all",
    axis: params.get("axis") === "world" ? "world" : "narrative",
    selectedPointId: params.get("selected"),
    fixtureCase: (["complete", "single", "planned-only", "actual-only", "unknown-only", "conflict", "stale", "rejected", "empty-branch"] as string[]).includes(fixtureCase || "") ? fixtureCase as CharacterFateFixtureCase : "complete",
    branchId: params.get("branch") || "branch.main"
  };
}

function writeRoute(input: { characterId: string; trajectory: TrajectoryFilter; axis: AxisMode; selectedPointId: string | null; fixtureCase: CharacterFateFixtureCase; branchId: string }) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "character-fate");
  url.searchParams.set("fixture", "character-fate");
  url.searchParams.set("character", input.characterId);
  url.searchParams.set("trajectory", input.trajectory);
  url.searchParams.set("axis", input.axis);
  url.searchParams.set("case", input.fixtureCase);
  url.searchParams.set("branch", input.branchId);
  if (input.selectedPointId) url.searchParams.set("selected", input.selectedPointId);
  else url.searchParams.delete("selected");
  window.history.replaceState({ ...(window.history.state ?? {}), workspace: "data", characterFate: true }, "", `${url.pathname}${url.search}${url.hash}`);
}

function writeReturnSnapshot(characterId: string, value: { scrollTop: number; focusPointId: string }) {
  window.history.replaceState({ ...(window.history.state ?? {}), characterFateReturn: { characterId, ...value } }, "", window.location.href);
}

function readReturnSnapshot(characterId: string): { scrollTop: number; focusPointId: string } | null {
  const value = window.history.state?.characterFateReturn;
  return value?.characterId === characterId && Number.isFinite(value.scrollTop) && typeof value.focusPointId === "string" ? value : null;
}
