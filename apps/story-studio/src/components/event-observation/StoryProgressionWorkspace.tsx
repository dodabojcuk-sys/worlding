import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Eye,
  FilePlus2,
  GitBranch,
  GripHorizontal,
  ListChecks,
  LocateFixed,
  MapPin,
  Minus,
  Package,
  PanelTopOpen,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  NarrativeArrangementRead,
  NarrativeArrangementWriteResult,
  NarrativePlacement,
  NarrativePlacementRole,
  NarrativePositionIntent,
  StoryUnit
} from "../../lib/localTransport";
import {
  buildEventParticipationProjection,
  type EventTaskPreset,
  type ParticipationState
} from "../../../../../src/storyContracts/eventObservation.ts";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";
import { eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

const MAX_FOCUS_OBJECTS = 3;

export type NarrativeArrangementSelection = { eventId: string; placementId: string | null };
export type NarrativeArrangementMutationCallbacks = {
  insert(input: { eventId: string; storyUnitId: string; role: NarrativePlacementRole; position: NarrativePositionIntent }): Promise<NarrativeArrangementWriteResult>;
  move(input: { placementId: string; storyUnitId: string; position: NarrativePositionIntent }): Promise<NarrativeArrangementWriteResult>;
  remove(placementId: string): Promise<NarrativeArrangementWriteResult>;
};

type DisplayPlacement = {
  placementId: string;
  event: EventLineEventSummary;
  storyUnitId: string;
  narrativeIndex: number;
  role: NarrativePlacementRole;
};

export function StoryProgressionWorkspace(props: {
  task: EventTaskPreset;
  taskNotice: string | null;
  projectTitle: string;
  currentUnitLabel: string | null;
  events: readonly EventLineEventSummary[];
  storyUnits: readonly StoryUnit[];
  objects: readonly PerspectiveObjectRef[];
  narrative: NarrativeArrangementRead | null;
  focusObjectIds: readonly string[];
  selectedEventId: string | null;
  detailsOpen: boolean;
  onTask(task: EventTaskPreset): void;
  onFocusObjectIds(ids: string[]): void;
  onSelectEvent(eventId: string): void;
  onArrange(selection: NarrativeArrangementSelection): void;
  onCreateEvent?(): void;
  onLocateCurrent(): void;
  onOpenAdvanced(view: "spine" | "graph"): void;
}) {
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const eventById = useMemo(() => new Map(props.events.map((event) => [event.id, event])), [props.events]);
  const unitById = useMemo(() => new Map(props.storyUnits.map((unit) => [unit.id, unit])), [props.storyUnits]);
  const formalObjects = useMemo(() => props.objects.filter((object) => object.formal === true), [props.objects]);
  const focusObjectIds = props.focusObjectIds.filter((id) => formalObjects.some((object) => object.id === id)).slice(0, MAX_FOCUS_OBJECTS);
  const placed = useMemo<DisplayPlacement[]>(() => (props.narrative?.projection.placed ?? []).flatMap((placement) => {
    const event = eventById.get(placement.eventId);
    return event ? [{ placementId: placement.placementId, event, storyUnitId: placement.storyUnitId, narrativeIndex: placement.narrativeIndex, role: placement.role }] : [];
  }), [eventById, props.narrative]);
  const displayed = useMemo(() => props.task === "time" ? orderByWorldTime(placed) : placed, [placed, props.task]);
  const unplaced = useMemo(() => props.events.filter((event) => Boolean(props.narrative?.projection.unplaced[event.id]) || !props.narrative), [props.events, props.narrative]);
  const branchUnits = props.storyUnits.filter((unit) => unit.kind === "branch" && unit.status !== "archived");
  const title = props.task === "time" ? "时间核对" : props.task === "audit" ? "证据审计" : props.task === "perspective" ? "角色视角" : props.task === "relationship" ? "关系变化" : "故事推进";
  const summary = props.task === "time"
    ? "同一批 Event 改按已确认的世界时间核对；叙事 Placement、焦点与详情保持不变。"
    : props.task === "audit"
      ? "按对象逐项核对参与、见证、明确缺席与来源；矩阵不承担叙事顺序。"
      : props.task === "perspective"
        ? "角色视角将在同一工作区开放；当前不会用参与标签冒充人物的知情、信念或误解。"
        : props.task === "relationship"
          ? "关系变化需要版本化 Relation 状态序列；当前不从轨迹相交或邻近推断关系。"
          : "沿正式叙事编排理解发生了什么，再按需叠加人物、地点或物品轨迹。";
  const selectedFocus = focusObjectIds.flatMap((id) => formalObjects.find((object) => object.id === id) ?? []);

  return <section className="story-progression-workspace" data-testid="story-progression-workspace" data-event-task={props.task} data-arrangement-state={props.narrative?.arrangement ? "placed" : "legacy-unplaced"}>
    <header className="story-progression-heading">
      <div><small>事件线 · 作者工作面</small><h1>{title}</h1><p>{summary}</p></div>
      <dl><div><dt>当前范围</dt><dd>{props.currentUnitLabel ?? "全部 Story Unit"} · {props.events.length} 个 Event</dd></div><div><dt>正式编排</dt><dd>{props.narrative?.arrangement ? `revision ${props.narrative.arrangement.currentRevision}` : "尚未建立"}</dd></div></dl>
    </header>
    {props.taskNotice ? <p className="story-progression-migration-notice" role="status">{props.taskNotice}</p> : null}
    <nav className="story-progression-controls" aria-label="事件线任务">
      <div className="story-progression-tasks" role="group" aria-label="任务预设">
        <TaskButton active={props.task === "story"} icon={<ArrowRight />} label="故事推进" onClick={() => props.onTask("story")} />
        <TaskButton active={props.task === "time"} icon={<Clock3 />} label="时间核对" onClick={() => props.onTask("time")} />
        <TaskButton active={props.task === "audit"} icon={<ShieldCheck />} label="证据审计" onClick={() => props.onTask("audit")} />
        <TaskButton active={props.task === "perspective"} disabled icon={<Eye />} label="角色视角 · 未开放" onClick={() => props.onTask("perspective")} />
        <TaskButton active={props.task === "relationship"} disabled icon={<GitBranch />} label="关系变化 · 未开放" onClick={() => props.onTask("relationship")} />
      </div>
      <div className="story-progression-actions">
        <button type="button" className="focus-object-trigger" aria-expanded={focusPickerOpen} onClick={() => setFocusPickerOpen((open) => !open)}><UsersRound />焦点：{selectedFocus.length ? selectedFocus.map((object) => object.label).join("、") : "未选择"}<ChevronDown /></button>
        {props.onCreateEvent ? <button type="button" className="primary-action" onClick={props.onCreateEvent}><FilePlus2 />新增事件</button> : null}
        <button type="button" disabled={!props.selectedEventId} onClick={props.onLocateCurrent}><LocateFixed />聚焦当前</button>
        <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}><Settings2 />高级观察设置</button>
      </div>
    </nav>
    {focusPickerOpen ? <FocusObjectPicker objects={formalObjects} selectedIds={focusObjectIds} onChange={props.onFocusObjectIds} onClose={() => setFocusPickerOpen(false)} /> : null}
    {advancedOpen ? <section className="story-progression-advanced" aria-label="高级观察设置"><div><small>仍在同一事件线工作区</small><strong>结构与关系证据</strong><p>这些入口只改变观察投影，不创建第二套 Event 或叙事顺序。</p></div><button type="button" onClick={() => props.onOpenAdvanced("spine")}><PanelTopOpen />故事结构</button><button type="button" onClick={() => props.onOpenAdvanced("graph")}><GitBranch />关系网络</button></section> : null}
    {props.task === "perspective" || props.task === "relationship" ? <UnavailableTask task={props.task} onBack={() => props.onTask("story")} /> : props.task === "audit" ? <EvidenceAuditMatrix placements={displayed} objects={selectedFocus} selectedEventId={props.selectedEventId} onSelectEvent={props.onSelectEvent} /> : <NarrativeSpineBoard task={props.task} placements={displayed} storyUnits={props.storyUnits} focusObjects={selectedFocus} selectedEventId={props.selectedEventId} branchUnits={branchUnits} onSelectEvent={props.onSelectEvent} onArrange={props.onArrange} />}
    <NarrativeExceptions narrative={props.narrative} events={props.events} unplaced={unplaced} onArrange={props.onArrange} />
  </section>;
}

function TaskButton(props: { active: boolean; disabled?: boolean; icon: ReactNode; label: string; onClick(): void }) {
  return <button type="button" aria-pressed={props.active} disabled={props.disabled} onClick={props.onClick}>{props.icon}{props.label}</button>;
}

function NarrativeSpineBoard(props: {
  task: "story" | "time";
  placements: readonly DisplayPlacement[];
  storyUnits: readonly StoryUnit[];
  focusObjects: readonly PerspectiveObjectRef[];
  selectedEventId: string | null;
  branchUnits: readonly StoryUnit[];
  onSelectEvent(eventId: string): void;
  onArrange(selection: NarrativeArrangementSelection): void;
}) {
  const unitById = new Map(props.storyUnits.map((unit) => [unit.id, unit]));
  const participation = buildEventParticipationProjection({ events: props.placements.map((placement) => placement.event), objects: props.focusObjects, focusObjectIds: props.focusObjects.map((object) => object.id), layout: "narrative" });
  return <section className="narrative-spine-board" data-testid="narrative-spine-board" data-coordinate={props.task === "time" ? "world-time" : "narrative-arrangement"}>
    <header><div><small>{props.task === "time" ? "世界时间坐标" : "叙事编排坐标"}</small><h2>{props.task === "time" ? "同一 Event，按可证实时间重新定位" : "主故事向右推进"}</h2></div><div className="narrative-legend"><span><i className="is-confirmed" />已确认</span><span><i className="is-draft" />草稿</span><span><i className="is-conflict" />冲突</span><span><i className="is-weak" />听闻/推测</span></div></header>
    {props.placements.length ? <>
      <div className="narrative-mini-spine"><strong>全书位置</strong><div>{props.placements.map((placement, index) => <button key={placement.placementId} type="button" aria-label={`定位 ${placement.event.title}`} aria-current={props.selectedEventId === placement.event.id ? "true" : undefined} onClick={() => props.onSelectEvent(placement.event.id)}><span />{index + 1}</button>)}</div><em>{props.placements.length} 个 Placement</em></div>
      <div className="narrative-spine-scroll" tabIndex={0} aria-label="共享 Event 脊柱，可横向滚动">
        <div className="narrative-spine-grid" style={{ gridTemplateColumns: `9rem repeat(${props.placements.length}, minmax(10.5rem, 11.5rem))` }}>
          <div className="narrative-track-label is-spine"><strong>Event 脊柱</strong><small>{props.task === "time" ? "世界时间只读核对" : "作品揭示顺序"}</small></div>
          {props.placements.map((placement, index) => <EventPlacementCard key={placement.placementId} placement={placement} displayIndex={index + 1} unitLabel={unitById.get(placement.storyUnitId)?.title ?? "Story Unit 待恢复"} selected={props.selectedEventId === placement.event.id} coordinate={props.task} onOpen={() => props.onSelectEvent(placement.event.id)} onArrange={() => props.onArrange({ eventId: placement.event.id, placementId: placement.placementId })} />)}
          {props.focusObjects.flatMap((object, objectIndex) => {
            const cells = participation.columns.map((column) => column.cells[objectIndex]!);
            return [<div key={`label:${object.id}`} className={`narrative-track-label is-${object.type}`}><span>{objectIcon(object.type)}</span><strong>{object.label}</strong><small>{objectTypeTrackLabel(object.type)}</small></div>, ...cells.map((cell, index) => <TrajectoryCell key={`${object.id}:${props.placements[index]!.placementId}`} object={object} event={props.placements[index]!.event} cell={cell} connected={index > 0 && isConnectable(cell.state) && isConnectable(cells[index - 1]!.state)} onOpen={() => props.onSelectEvent(props.placements[index]!.event.id)} />)];
          })}
        </div>
        {props.branchUnits.length ? <div className="narrative-branch-summary"><GitBranch /><strong>{props.branchUnits.length} 条独立分支按需折叠</strong><span>{props.branchUnits.map((unit) => unit.title).join("、")}；视觉靠近不代表合流。</span></div> : null}
      </div>
    </> : <div className="narrative-empty-arrangement"><GripHorizontal /><strong>尚未建立正式叙事编排</strong><p>旧项目中的 Event 全部保持“待编排”；系统不会按 ID、数组、标题或世界时间替作者排序。</p></div>}
    <footer><span>选择 1–3 个焦点对象后，轨迹只在同一共享 Event 列下展开。</span><strong>叙事位置来自 NarrativeArrangement；浏览不会写入。</strong></footer>
  </section>;
}

function EventPlacementCard(props: { placement: DisplayPlacement; displayIndex: number; unitLabel: string; selected: boolean; coordinate: "story" | "time"; onOpen(): void; onArrange(): void }) {
  const semantic = eventLineSemanticNode(props.placement.event);
  const status = /冲突|conflict/iu.test(props.placement.event.tags.join(" ")) ? "conflict" : props.placement.event.status === "draft" ? "draft" : "confirmed";
  const summary = eventSummary(props.placement.event);
  return <article className={`narrative-event-card is-${status} ${props.selected ? "is-selected" : ""}`} data-placement-id={props.placement.placementId} data-confirmed-event-id={props.placement.event.id}>
    <button type="button" className="narrative-event-card-main" onClick={props.onOpen}><span className="narrative-status">{status === "conflict" ? "冲突" : status === "draft" ? "作者草稿" : "已确认"}</span><b>{String(props.displayIndex).padStart(2, "0")}</b><h3>{props.placement.event.title}</h3><p>{summary}</p><footer><span>{props.coordinate === "time" ? semantic.time.label : props.unitLabel}</span><em>{placementRoleLabel(props.placement.role)}</em></footer></button>
    <button type="button" className="narrative-arrange-button" onClick={props.onArrange}><GripHorizontal />编排位置</button>
  </article>;
}

function TrajectoryCell(props: { object: PerspectiveObjectRef; event: EventLineEventSummary; cell: { state: ParticipationState; conflict: boolean }; connected: boolean; onOpen(): void }) {
  const weak = props.cell.state === "unknown" && hasWeakEvidence(props.event, props.object);
  const state = weak ? "weak" : props.cell.state;
  return <button type="button" className={`narrative-trajectory-cell is-${state} ${props.connected ? "is-connected" : ""}`} aria-label={`${props.object.label}在${props.event.title}：${trajectoryStateLabel(state)}`} onClick={props.onOpen}>{state === "direct" ? <CheckCircle2 /> : state === "witnessed" ? <Eye /> : state === "explicit-absence" ? <Minus /> : state === "weak" ? <GripHorizontal /> : null}<span className={state === "unknown" ? "sr-only" : undefined}>{trajectoryStateLabel(state)}</span>{props.cell.conflict ? <AlertTriangle /> : null}</button>;
}

function EvidenceAuditMatrix(props: { placements: readonly DisplayPlacement[]; objects: readonly PerspectiveObjectRef[]; selectedEventId: string | null; onSelectEvent(eventId: string): void }) {
  const projection = buildEventParticipationProjection({ events: props.placements.map((placement) => placement.event), objects: props.objects, focusObjectIds: props.objects.map((object) => object.id), layout: "narrative" });
  if (!props.objects.length) return <section className="evidence-audit-empty"><ListChecks /><strong>选择焦点对象后开始证据审计</strong><p>审计矩阵会明确显示 unknown；故事推进视图仍保持留白。</p></section>;
  return <section className="evidence-audit-board" data-testid="evidence-audit-board"><header><div><small>完整四态 · 来源可查</small><h2>证据审计矩阵</h2><p>unknown 在这里明确出现；矩阵不会生成关系，也不会改变 Event 顺序。</p></div><span><ShieldCheck />{props.objects.length} 个对象 · {props.placements.length} 个 Placement</span></header><div className="evidence-audit-scroll" tabIndex={0}><table><thead><tr><th>对象 / Event</th>{props.placements.map((placement, index) => <th key={placement.placementId}><button type="button" aria-current={props.selectedEventId === placement.event.id ? "true" : undefined} onClick={() => props.onSelectEvent(placement.event.id)}><small>{String(index + 1).padStart(2, "0")}</small>{placement.event.title}</button></th>)}</tr></thead><tbody>{props.objects.map((object, objectIndex) => <tr key={object.id}><th><span>{objectIcon(object.type)}</span><strong>{object.label}</strong><small>{objectTypeLabel(object.type)}</small></th>{projection.columns.map((column, index) => { const cell = column.cells[objectIndex]!; return <td key={`${object.id}:${props.placements[index]!.placementId}`} className={`is-${cell.state}`}><button type="button" onClick={() => props.onSelectEvent(props.placements[index]!.event.id)}><strong>{trajectoryStateLabel(cell.state)}</strong><small>{cell.evidenceRefs.length ? `${cell.evidenceRefs.length} 个来源引用` : "无证据"}</small></button></td>; })}</tr>)}</tbody></table></div><footer><span>参与</span><span>见证</span><span>明确缺席</span><span>unknown</span><strong>矩阵只读，不改变 Event 顺序。</strong></footer></section>;
}

function NarrativeExceptions(props: { narrative: NarrativeArrangementRead | null; events: readonly EventLineEventSummary[]; unplaced: readonly EventLineEventSummary[]; onArrange(selection: NarrativeArrangementSelection): void }) {
  const conflicts = props.narrative?.projection.conflicts ?? [];
  const eventById = new Map(props.events.map((event) => [event.id, event]));
  if (!props.unplaced.length && !conflicts.length) return null;
  return <section className="narrative-exceptions" aria-label="待编排与冲突"><header><div><small>正式编排之外</small><h2>待编排与冲突</h2></div><span>{props.unplaced.length} 个待编排 · {conflicts.length} 个冲突</span></header>{props.unplaced.length ? <div className="unplaced-event-tray"><p><CircleHelp />这是未排序集合；卡片位置不代表作者顺序。</p><div>{props.unplaced.map((event) => <article key={event.id}><div><strong>{event.title}</strong><small>{event.status === "draft" ? "作者草稿" : "正式 Event · 尚未编排"}</small></div><button type="button" onClick={() => props.onArrange({ eventId: event.id, placementId: null })}><ArrowRight />安排位置</button></article>)}</div></div> : null}{conflicts.length ? <div className="narrative-conflict-list">{conflicts.map((conflict) => <article key={`${conflict.state}:${conflict.placementId}`}><AlertTriangle /><div><strong>{conflict.state === "order-conflict" ? "顺序冲突" : "引用已失效"}</strong><p>{eventById.get(conflict.eventId)?.title ?? conflict.eventId} · {conflict.reason}</p></div></article>)}</div> : null}</section>;
}

function FocusObjectPicker(props: { objects: readonly PerspectiveObjectRef[]; selectedIds: readonly string[]; onChange(ids: string[]): void; onClose(): void }) {
  const toggle = (id: string) => props.onChange(props.selectedIds.includes(id) ? props.selectedIds.filter((item) => item !== id) : props.selectedIds.length < MAX_FOCUS_OBJECTS ? [...props.selectedIds, id] : [...props.selectedIds]);
  return <section className="focus-object-picker" role="dialog" aria-modal="false" aria-label="选择焦点对象"><header><div><small>按需轨迹</small><h2>选择 1–3 个焦点对象</h2></div><button type="button" aria-label="关闭焦点对象选择" onClick={props.onClose}><X /></button></header><div>{(["character", "location", "item"] as const).map((type) => <fieldset key={type}><legend>{objectTypeLabel(type)}</legend>{props.objects.filter((object) => object.type === type).map((object) => <label key={object.id}><input type="checkbox" checked={props.selectedIds.includes(object.id)} disabled={!props.selectedIds.includes(object.id) && props.selectedIds.length >= MAX_FOCUS_OBJECTS} onChange={() => toggle(object.id)} /><span>{objectIcon(type)}{object.label}</span><small>{objectTypeTrackLabel(type)}</small></label>)}{props.objects.every((object) => object.type !== type) ? <small>暂无正式{objectTypeLabel(type)}对象</small> : null}</fieldset>)}</div><footer><span>已选 {props.selectedIds.length}/{MAX_FOCUS_OBJECTS}</span><button type="button" onClick={() => props.onChange([])}>清空</button><button type="button" className="primary-action" onClick={props.onClose}>完成</button></footer></section>;
}

export function NarrativeArrangementInspector(props: {
  selection: NarrativeArrangementSelection | null;
  events: readonly EventLineEventSummary[];
  storyUnits: readonly StoryUnit[];
  narrative: NarrativeArrangementRead | null;
  callbacks: NarrativeArrangementMutationCallbacks | null;
}) {
  const targetEvent = props.selection ? props.events.find((event) => event.id === props.selection!.eventId) ?? null : null;
  const placement = props.selection?.placementId ? currentPlacements(props.narrative).find((item) => item.placementId === props.selection!.placementId) ?? null : null;
  const mainUnits = props.storyUnits.filter((unit) => unit.kind === "main" && unit.status !== "archived").sort((a, b) => a.order - b.order);
  const [storyUnitId, setStoryUnitId] = useState(placement?.storyUnitId ?? mainUnits[0]?.id ?? "");
  const [positionKind, setPositionKind] = useState<NarrativePositionIntent["kind"]>(placement ? "after" : "end");
  const [anchorPlacementId, setAnchorPlacementId] = useState("");
  const [role, setRole] = useState<NarrativePlacementRole>("primary");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setStoryUnitId(placement?.storyUnitId ?? mainUnits[0]?.id ?? "");
    setPositionKind(placement ? "after" : "end");
    setAnchorPlacementId("");
    setRole(placement?.role ?? "primary");
    setConfirmRemove(false);
    setMessage(null);
  }, [props.selection?.eventId, props.selection?.placementId]);
  const anchors = currentPlacements(props.narrative).filter((item) => item.storyUnitId === storyUnitId && item.placementId !== placement?.placementId);
  const submit = async () => {
    if (!props.callbacks || !targetEvent || !storyUnitId) return;
    if ((positionKind === "before" || positionKind === "after") && !anchorPlacementId) { setMessage("请选择一个有效锚点；没有写入任何顺序。"); return; }
    setBusy(true); setMessage(null);
    const position: NarrativePositionIntent = positionKind === "before" || positionKind === "after" ? { kind: positionKind, anchorPlacementId } : { kind: positionKind };
    try {
      const result = placement
        ? await props.callbacks.move({ placementId: placement.placementId, storyUnitId, position })
        : await props.callbacks.insert({ eventId: targetEvent.id, storyUnitId, role, position });
      setMessage(result.conflict ? `编排冲突：${conflictLabel(result.code)}。已重新读取，未静默覆盖。` : `编排已保存 · revision ${result.arrangement?.currentRevision ?? "?"} · receipt ${result.receipt?.receiptId ?? "已记录"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "编排操作失败；没有静默覆盖。"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!props.callbacks || !placement) return;
    if (!confirmRemove) { setConfirmRemove(true); return; }
    setBusy(true); setMessage(null);
    try {
      const result = await props.callbacks.remove(placement.placementId);
      setMessage(result.conflict ? `移除冲突：${conflictLabel(result.code)}。Placement 保持不变。` : `Placement 已移除 · receipt ${result.receipt?.receiptId ?? "已记录"}`);
      setConfirmRemove(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "移除失败；Placement 保持不变。"); }
    finally { setBusy(false); }
  };
  if (!targetEvent || !props.selection) return <div className="narrative-arrangement-inspector-empty"><GripHorizontal /><strong>选择一个 Event 的编排位置</strong><p>所有正式修改都会检查 Story Unit 版本与 Arrangement revision。</p></div>;
  return <form className="narrative-arrangement-inspector" onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><small>{placement ? "移动正式 Placement" : "放入正式编排"}</small><h2>{targetEvent.title}</h2><p>{placement ? `Placement ${placement.placementId}` : "当前 Event 尚未获得叙事位置。"}</p></header>{!props.callbacks ? <p className="narrative-arrangement-blocked"><AlertTriangle />当前项目缺少可写的 WorkVersion 或 Story Unit；仍保持只读 unplaced。</p> : <><label><span>目标 Story Unit</span><select value={storyUnitId} onChange={(event) => { setStoryUnitId(event.target.value); setAnchorPlacementId(""); }} required>{mainUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.title}</option>)}</select></label>{!placement ? <label><span>呈现角色</span><select value={role} onChange={(event) => setRole(event.target.value as NarrativePlacementRole)}><option value="primary">主要呈现</option><option value="flashback">倒叙</option><option value="recap">回看</option><option value="reveal">再次揭示</option><option value="reinterpretation">重新解释</option></select></label> : null}<label><span>作者意图</span><select value={positionKind} onChange={(event) => { setPositionKind(event.target.value as NarrativePositionIntent["kind"]); setAnchorPlacementId(""); }}><option value="start">放在单元开头</option><option value="end">放在单元末尾</option><option value="before">放在某 Placement 之前</option><option value="after">放在某 Placement 之后</option></select></label>{positionKind === "before" || positionKind === "after" ? <label><span>锚点 Placement</span><select value={anchorPlacementId} onChange={(event) => setAnchorPlacementId(event.target.value)} required><option value="">请选择</option>{anchors.map((anchor) => <option key={anchor.placementId} value={anchor.placementId}>{props.events.find((event) => event.id === anchor.eventId)?.title ?? anchor.eventId}</option>)}</select></label> : null}<section><ShieldCheck /><div><strong>提交前检查</strong><p>使用当前 owner version 与 expectedRevision；冲突时拒绝写入，并返回 operation receipt。</p></div></section><button type="submit" className="primary-action" disabled={busy || !storyUnitId}>{busy ? "正在保存…" : placement ? "确认移动 Placement" : "确认插入 Placement"}</button>{placement ? <div className="narrative-remove-action"><button type="button" disabled={busy} onClick={() => void remove()}><Trash2 />{confirmRemove ? "再次确认移除" : "从当前编排移除"}</button>{confirmRemove ? <small>只移除 Placement；不会删除 Event 或改变世界时间。</small> : null}</div> : null}</>}{message ? <p className="narrative-arrangement-message" role="status">{message}</p> : null}</form>;
}

function UnavailableTask(props: { task: "perspective" | "relationship"; onBack(): void }) {
  return <section className="story-progression-unavailable"><span>{props.task === "perspective" ? <Eye /> : <GitBranch />}</span><small>同一事件线工作区 · 能力未开放</small><h2>{props.task === "perspective" ? "角色视角需要正式知情与信念合同" : "关系变化需要版本化 Relation 状态"}</h2><p>{props.task === "perspective" ? "当前参与、见证和听闻证据仍可在故事推进与证据审计中核对，但不会被包装成人物内心。" : "当前可以查看正式关系证据，但轨迹靠近、相交或并行都不会自动产生 Relation。"}</p><button type="button" onClick={props.onBack}><ArrowLeft />返回故事推进</button></section>;
}

function orderByWorldTime(placements: readonly DisplayPlacement[]): DisplayPlacement[] {
  const projection = buildEventParticipationProjection({ events: placements.map((placement) => placement.event), objects: [], focusObjectIds: [], layout: "world-time" });
  return projection.columns.map((column) => placements[column.narrativeIndex]!).filter(Boolean);
}
function currentPlacements(read: NarrativeArrangementRead | null): NarrativePlacement[] { return read?.arrangement?.revisions.find((revision) => revision.revision === read.arrangement!.currentRevision)?.placements ?? []; }
function isConnectable(state: ParticipationState): boolean { return state === "direct" || state === "witnessed"; }
function eventSummary(event: EventLineEventSummary): string { return event.tags.find((tag) => /^(?:摘要|Summary)[：:]/iu.test(tag))?.replace(/^[^：:]+[：:]\s*/u, "") ?? "打开事件查看发生了什么、来源与影响。"; }
function placementRoleLabel(role: NarrativePlacementRole): string { return ({ primary: "主要呈现", flashback: "倒叙", recap: "回看", reveal: "再次揭示", reinterpretation: "重新解释" })[role]; }
function objectTypeLabel(type: PerspectiveObjectRef["type"]): string { return type === "character" ? "人物" : type === "location" ? "地点" : "物品"; }
function objectTypeTrackLabel(type: PerspectiveObjectRef["type"]): string { return type === "character" ? "人物轨迹" : type === "location" ? "地点出现" : "物品流转"; }
function objectIcon(type: PerspectiveObjectRef["type"]) { return type === "character" ? <UserRound /> : type === "location" ? <MapPin /> : <Package />; }
function trajectoryStateLabel(state: ParticipationState | "weak"): string { return state === "direct" ? "参与" : state === "witnessed" ? "见证" : state === "explicit-absence" ? "明确缺席" : state === "weak" ? "听闻/推测" : "unknown"; }
function hasWeakEvidence(event: EventLineEventSummary, object: PerspectiveObjectRef): boolean { return event.tags.some((tag) => /^(?:听闻|推测|Heard|Inferred)[：:]/iu.test(tag) && tag.split(/[：:]/u).slice(1).join(":").split(/[,，、;；|]/u).some((label) => label.trim().normalize("NFKC").toLocaleLowerCase("zh-CN") === object.label.normalize("NFKC").toLocaleLowerCase("zh-CN"))); }
function conflictLabel(code: NarrativeArrangementWriteResult["code"]): string { return ({ "stale-arrangement-revision": "Arrangement revision 已过期", "idempotency-key-reused": "操作 ID 已被其他载荷使用", "placement-not-found": "Placement 已不存在", "anchor-not-found": "锚点已不存在", "anchor-unit-mismatch": "锚点不在目标单元", "order-conflict": "当前正式顺序存在冲突", "branch-mismatch": "分支或叙事路径不匹配", "rollback-revision-not-found": "回滚版本不存在", "stale-owner-version": "Story Unit 版本已变化", "arrangement-already-exists": "Arrangement 已由其他操作建立" } as const)[code ?? "stale-arrangement-revision"]; }
