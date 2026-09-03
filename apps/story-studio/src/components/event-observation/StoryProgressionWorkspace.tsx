import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
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
  MoreHorizontal,
  Package,
  PanelTopOpen,
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
  type EventTaskPreset
} from "../../../../../src/storyContracts/eventObservation.ts";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";
import type { EventLineEventSummary } from "../eventLineCommittedEvents";

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
  narrativePathId: string;
};

export function StoryProgressionWorkspace(props: {
  task: EventTaskPreset;
  taskNotice: string | null;
  projectTitle: string;
  currentUnitLabel: string | null;
  events: readonly EventLineEventSummary[];
  storyUnits: readonly StoryUnit[];
  objects: readonly PerspectiveObjectRef[];
  narratives: readonly NarrativeArrangementRead[];
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
  renderEventLine(input: { onOpenStaging(): void }): ReactNode;
  renderTimeLine(): ReactNode;
}) {
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [stagingOpen, setStagingOpen] = useState(false);
  const eventById = useMemo(() => new Map(props.events.map((event) => [event.id, event])), [props.events]);
  const formalObjects = useMemo(() => props.objects.filter((object) => object.formal === true), [props.objects]);
  const focusObjectIds = props.focusObjectIds.filter((id) => formalObjects.some((object) => object.id === id)).slice(0, MAX_FOCUS_OBJECTS);
  const selectedFocus = focusObjectIds.flatMap((id) => formalObjects.find((object) => object.id === id) ?? []);
  const placed = useMemo<DisplayPlacement[]>(() => props.narratives.flatMap((read) => read.projection.placed.flatMap((placement) => {
    const event = eventById.get(placement.eventId);
    return event ? [{ ...placement, event, narrativePathId: read.projection.narrativePathId }] : [];
  })), [eventById, props.narratives]);
  const placedEventIds = useMemo(() => new Set(placed.map((placement) => placement.event.id)), [placed]);
  const unplaced = useMemo(() => props.events.filter((event) => !placedEventIds.has(event.id)), [placedEventIds, props.events]);
  const conflicts = useMemo(() => props.narratives.flatMap((read) => read.projection.conflicts), [props.narratives]);
  const hasArrangement = props.narratives.some((read) => read.arrangement !== null);
  const title = props.task === "time" ? "时间线" : props.task === "audit" ? "证据审计" : props.task === "perspective" ? "角色视角" : props.task === "relationship" ? "关系变化" : "事件线";
  const summary = props.task === "time"
    ? "按世界时间证据定位同一批 Event；叙事 Placement、焦点与详情保持不变。"
    : props.task === "audit"
      ? "逐项核对参与、见证、明确缺席与来源；矩阵不承担叙事顺序。"
      : props.task === "perspective"
        ? "角色视角将在同一工作区开放；当前不会用参与标签冒充人物的知情、信念或误解。"
        : props.task === "relationship"
          ? "关系变化需要版本化 Relation 状态序列；当前不从轨迹相交或邻近推断关系。"
          : "从叙事顺序、世界时间与参与证据观察同一批 Event。";

  return <section className="story-progression-workspace" data-testid="story-progression-workspace" data-event-task={props.task} data-arrangement-state={hasArrangement ? placed.length ? "placed" : "formal-empty" : "legacy-unplaced"}>
    <header className="story-progression-heading">
      <div><small>Event · 作者工作面</small><h1>{title}</h1><p>{summary}</p></div>
      <dl><div><dt>当前范围</dt><dd>{props.currentUnitLabel ?? "全部 Story Unit"} · {props.events.length} 个 Event</dd></div><div><dt>正式位置</dt><dd>{placed.length} 个 Placement · {conflicts.length} 个冲突</dd></div></dl>
    </header>
    {props.taskNotice ? <p className="story-progression-migration-notice" role="status">{props.taskNotice}</p> : null}
    <nav className="story-progression-controls" aria-label="事件线任务">
      <div className="story-progression-tasks" role="group" aria-label="任务">
        <TaskButton active={props.task === "story"} icon={<ArrowRight />} label="事件线" onClick={() => props.onTask("story")} />
        <TaskButton active={props.task === "time"} icon={<Clock3 />} label="时间线" onClick={() => props.onTask("time")} />
        <TaskButton active={props.task === "audit"} icon={<ShieldCheck />} label="证据审计" onClick={() => props.onTask("audit")} />
      </div>
      <div className="story-progression-actions">
        <button type="button" aria-expanded={scopeOpen} onClick={() => { setScopeOpen((open) => !open); setMoreOpen(false); }}><PanelTopOpen />范围：{props.currentUnitLabel ?? "全书"}<ChevronDown /></button>
        <button type="button" className="focus-object-trigger" aria-expanded={focusPickerOpen} onClick={() => { setFocusPickerOpen((open) => !open); setMoreOpen(false); }}><UsersRound />焦点：{selectedFocus.length ? selectedFocus.map((object) => object.label).join("、") : "未选择"}<ChevronDown /></button>
        {props.onCreateEvent ? <button type="button" className="primary-action" onClick={props.onCreateEvent}><FilePlus2 />新增事件</button> : null}
        <button type="button" disabled={!props.selectedEventId} onClick={props.onLocateCurrent}><LocateFixed />聚焦当前</button>
        <button type="button" aria-expanded={moreOpen} onClick={() => { setMoreOpen((open) => !open); setScopeOpen(false); }}><MoreHorizontal />更多</button>
      </div>
    </nav>
    {scopeOpen ? <ScopeOverview units={props.storyUnits} narratives={props.narratives} onClose={() => setScopeOpen(false)} /> : null}
    {focusPickerOpen ? <FocusObjectPicker objects={formalObjects} selectedIds={focusObjectIds} onChange={props.onFocusObjectIds} onClose={() => setFocusPickerOpen(false)} /> : null}
    {moreOpen ? <section className="story-progression-advanced" aria-label="更多事件线观察"><div><small>仍在同一 /event-line</small><strong>观察图层与路线说明</strong><p>这些入口只改变只读投影，不创建第二套 Event 或叙事顺序。</p></div><button type="button" onClick={() => props.onOpenAdvanced("spine")}><PanelTopOpen />故事结构</button><button type="button" onClick={() => props.onOpenAdvanced("graph")}><GitBranch />关系网络</button><span><Eye />角色视角、关系变化待正式合同后开放</span></section> : null}
    {props.task === "perspective" || props.task === "relationship"
      ? <UnavailableTask task={props.task} onBack={() => props.onTask("story")} />
      : props.task === "audit"
        ? <EvidenceAuditMatrix events={auditEvents(placed, props.events)} objects={selectedFocus} selectedEventId={props.selectedEventId} onSelectEvent={props.onSelectEvent} />
        : props.task === "time"
          ? props.renderTimeLine()
          : props.renderEventLine({ onOpenStaging: () => setStagingOpen(true) })}
    {props.task === "story" ? <NarrativeStagingArea open={stagingOpen} events={props.events} unplaced={unplaced} conflicts={conflicts} onOpen={setStagingOpen} onArrange={props.onArrange} /> : null}
  </section>;
}

function TaskButton(props: { active: boolean; icon: ReactNode; label: string; onClick(): void }) {
  return <button type="button" aria-pressed={props.active} onClick={props.onClick}>{props.icon}{props.label}</button>;
}

function ScopeOverview(props: { units: readonly StoryUnit[]; narratives: readonly NarrativeArrangementRead[]; onClose(): void }) {
  const revisions = new Map(props.narratives.map((read) => [read.projection.narrativePathId, read.arrangement?.currentRevision ?? null]));
  return <section className="story-progression-scope" role="dialog" aria-modal="false" aria-label="当前事件线范围"><header><div><small>全书位置</small><h2>Story Unit 范围</h2></div><button type="button" aria-label="关闭范围" onClick={props.onClose}><X /></button></header><div>{props.units.filter((unit) => unit.status !== "archived").sort((a, b) => a.order - b.order).map((unit) => <article key={unit.id} className={`is-${unit.kind}`}><span>{unit.kind === "branch" ? <GitBranch /> : <ArrowRight />}</span><div><strong>{unit.title}</strong><small>{unit.kind === "branch" ? "支线" : "主线"} · {revisions.get(unit.id) == null ? "尚未编排" : `revision ${revisions.get(unit.id)}`}</small></div></article>)}</div></section>;
}

function EvidenceAuditMatrix(props: { events: readonly EventLineEventSummary[]; objects: readonly PerspectiveObjectRef[]; selectedEventId: string | null; onSelectEvent(eventId: string): void }) {
  const projection = buildEventParticipationProjection({ events: props.events, objects: props.objects, focusObjectIds: props.objects.map((object) => object.id), layout: "narrative" });
  if (!props.objects.length) return <section className="evidence-audit-empty"><ListChecks /><strong>选择焦点对象后开始证据审计</strong><p>审计矩阵会明确显示 unknown；图形事件线仍保持留白。</p></section>;
  return <section className="evidence-audit-board" data-testid="evidence-audit-board"><header><div><small>完整四态 · 来源可查</small><h2>证据审计矩阵</h2><p>Event 目录顺序只用于审计浏览，不代表 NarrativeArrangement。</p></div><span><ShieldCheck />{props.objects.length} 个对象 · {props.events.length} 个 Event</span></header><div className="evidence-audit-scroll" tabIndex={0}><table><thead><tr><th>对象 / Event</th>{props.events.map((event, index) => <th key={event.id}><button type="button" aria-current={props.selectedEventId === event.id ? "true" : undefined} onClick={() => props.onSelectEvent(event.id)}><small>{String(index + 1).padStart(2, "0")}</small>{event.title}</button></th>)}</tr></thead><tbody>{props.objects.map((object, objectIndex) => <tr key={object.id}><th><span>{objectIcon(object.type)}</span><strong>{object.label}</strong><small>{objectTypeLabel(object.type)}</small></th>{projection.columns.map((column) => { const cell = column.cells[objectIndex]!; return <td key={`${object.id}:${column.event.id}`} className={`is-${cell.state}`}><button type="button" onClick={() => props.onSelectEvent(column.event.id)}><strong>{trajectoryStateLabel(cell.state)}</strong><small>{cell.evidenceRefs.length ? `${cell.evidenceRefs.length} 个来源引用` : "无证据"}</small></button></td>; })}</tr>)}</tbody></table></div><footer><span>参与</span><span>见证</span><span>明确缺席</span><span>unknown</span><strong>矩阵只读，不改变 Event 顺序。</strong></footer></section>;
}

function NarrativeStagingArea(props: { open: boolean; events: readonly EventLineEventSummary[]; unplaced: readonly EventLineEventSummary[]; conflicts: Array<{ state: "order-conflict" | "dangling-reference"; placementId: string; eventId: string; storyUnitId: string; reason: string }>; onOpen(open: boolean): void; onArrange(selection: NarrativeArrangementSelection): void }) {
  const eventById = new Map(props.events.map((event) => [event.id, event]));
  if (!props.unplaced.length && !props.conflicts.length) return null;
  return <section className={`narrative-staging ${props.open ? "is-open" : ""}`} data-testid="narrative-staging" aria-label="待编排与冲突"><header><div><small>画布边缘 staging area</small><h2>待编排与冲突</h2></div><span>{props.unplaced.length} 个待编排 · {props.conflicts.length} 个冲突</span><button type="button" aria-expanded={props.open} onClick={() => props.onOpen(!props.open)}>{props.open ? <X /> : <GripHorizontal />}{props.open ? "收起" : "打开待编排"}</button></header>{props.open ? <><div className="unplaced-event-tray"><p><CircleHelp />这是未排序集合；条目位置不代表作者顺序。</p><div>{props.unplaced.map((event) => <article key={event.id}><div><strong>{event.title}</strong><small>{event.status === "draft" ? "作者草稿" : "正式 Event · 尚未编排"}</small></div><button type="button" onClick={() => props.onArrange({ eventId: event.id, placementId: null })}><ArrowRight />安排位置</button></article>)}</div></div>{props.conflicts.length ? <div className="narrative-conflict-list">{props.conflicts.map((conflict) => <article key={`${conflict.state}:${conflict.placementId}`}><AlertTriangle /><div><strong>{conflict.state === "order-conflict" ? "顺序冲突" : "引用已失效"}</strong><p>{eventById.get(conflict.eventId)?.title ?? conflict.eventId} · {conflict.reason}</p></div></article>)}</div> : null}</> : <p className="narrative-staging-preview">未编排 Event 保持在画布之外；打开后由作者选择目标 Story Unit 和位置。</p>}</section>;
}

function FocusObjectPicker(props: { objects: readonly PerspectiveObjectRef[]; selectedIds: readonly string[]; onChange(ids: string[]): void; onClose(): void }) {
  const toggle = (id: string) => props.onChange(props.selectedIds.includes(id) ? props.selectedIds.filter((item) => item !== id) : props.selectedIds.length < MAX_FOCUS_OBJECTS ? [...props.selectedIds, id] : [...props.selectedIds]);
  return <section className="focus-object-picker" role="dialog" aria-modal="false" aria-label="选择焦点对象"><header><div><small>按需轨迹</small><h2>选择 1–3 个焦点对象</h2></div><button type="button" aria-label="关闭焦点对象选择" onClick={props.onClose}><X /></button></header><div>{(["character", "location", "item"] as const).map((type) => <fieldset key={type}><legend>{objectTypeLabel(type)}</legend>{props.objects.filter((object) => object.type === type).map((object) => <label key={object.id}><input type="checkbox" checked={props.selectedIds.includes(object.id)} disabled={!props.selectedIds.includes(object.id) && props.selectedIds.length >= MAX_FOCUS_OBJECTS} onChange={() => toggle(object.id)} /><span>{objectIcon(type)}{object.label}</span><small>{objectTypeTrackLabel(type)}</small></label>)}{props.objects.every((object) => object.type !== type) ? <small>暂无正式{objectTypeLabel(type)}对象</small> : null}</fieldset>)}</div><footer><span>已选 {props.selectedIds.length}/{MAX_FOCUS_OBJECTS}</span><button type="button" onClick={() => props.onChange([])}>清空</button><button type="button" className="primary-action" onClick={props.onClose}>完成</button></footer></section>;
}

export function NarrativeArrangementInspector(props: {
  selection: NarrativeArrangementSelection | null;
  events: readonly EventLineEventSummary[];
  storyUnits: readonly StoryUnit[];
  narratives: readonly NarrativeArrangementRead[];
  callbacks: NarrativeArrangementMutationCallbacks | null;
}) {
  const targetEvent = props.selection ? props.events.find((event) => event.id === props.selection!.eventId) ?? null : null;
  const allPlacements = currentPlacements(props.narratives);
  const placement = props.selection?.placementId ? allPlacements.find((item) => item.placementId === props.selection!.placementId) ?? null : null;
  const sourceRead = placement ? props.narratives.find((read) => read.projection.placed.some((item) => item.placementId === placement.placementId)) ?? null : null;
  const activeUnits = props.storyUnits.filter((unit) => unit.status !== "archived").sort((a, b) => a.order - b.order);
  const sourceUnit = sourceRead ? activeUnits.find((unit) => unit.id === sourceRead.projection.narrativePathId) ?? null : null;
  const availableUnits = placement && sourceRead
    ? activeUnits.filter((unit) => sourceRead.projection.narrativePathId === unit.id || (unit.kind === "main" && sourceUnit?.kind === "main"))
    : activeUnits;
  const [storyUnitId, setStoryUnitId] = useState(placement?.storyUnitId ?? availableUnits.find((unit) => unit.kind === "main")?.id ?? availableUnits[0]?.id ?? "");
  const [positionKind, setPositionKind] = useState<NarrativePositionIntent["kind"]>(placement ? "after" : "end");
  const [anchorPlacementId, setAnchorPlacementId] = useState("");
  const [role, setRole] = useState<NarrativePlacementRole>("primary");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setStoryUnitId(placement?.storyUnitId ?? availableUnits.find((unit) => unit.kind === "main")?.id ?? availableUnits[0]?.id ?? "");
    setPositionKind(placement ? "after" : "end");
    setAnchorPlacementId("");
    setRole(placement?.role ?? "primary");
    setConfirmRemove(false);
    setMessage(null);
  }, [props.selection?.eventId, props.selection?.placementId]);
  const anchors = allPlacements.filter((item) => item.storyUnitId === storyUnitId && item.placementId !== placement?.placementId);
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
  return <form className="narrative-arrangement-inspector" onSubmit={(event) => { event.preventDefault(); void submit(); }}><header><small>{placement ? "移动正式 Placement" : "放入正式编排"}</small><h2>{targetEvent.title}</h2><p>{placement ? `Placement ${placement.placementId}` : "当前 Event 尚未获得叙事位置。"}</p></header>{!props.callbacks ? <p className="narrative-arrangement-blocked"><AlertTriangle />当前项目缺少可写的 WorkVersion 或 Story Unit；仍保持只读 unplaced。</p> : <><label><span>目标 Story Unit</span><select value={storyUnitId} onChange={(event) => { setStoryUnitId(event.target.value); setAnchorPlacementId(""); }} required>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.kind === "branch" ? "支线 · " : "主线 · "}{unit.title}</option>)}</select></label>{!placement ? <label><span>呈现角色</span><select value={role} onChange={(event) => setRole(event.target.value as NarrativePlacementRole)}><option value="primary">主要呈现</option><option value="flashback">倒叙</option><option value="recap">回看</option><option value="reveal">再次揭示</option><option value="reinterpretation">重新解释</option></select></label> : null}<label><span>作者意图</span><select value={positionKind} onChange={(event) => { setPositionKind(event.target.value as NarrativePositionIntent["kind"]); setAnchorPlacementId(""); }}><option value="start">放在单元开头</option><option value="end">放在单元末尾</option><option value="before">放在某 Placement 之前</option><option value="after">放在某 Placement 之后</option></select></label>{positionKind === "before" || positionKind === "after" ? <label><span>锚点 Placement</span><select value={anchorPlacementId} onChange={(event) => setAnchorPlacementId(event.target.value)} required><option value="">请选择</option>{anchors.map((anchor) => <option key={anchor.placementId} value={anchor.placementId}>{props.events.find((event) => event.id === anchor.eventId)?.title ?? anchor.eventId}</option>)}</select></label> : null}<section><ShieldCheck /><div><strong>提交前检查</strong><p>使用当前 owner version 与 expectedRevision；冲突时拒绝写入，并返回 operation receipt。</p></div></section><button type="submit" className="primary-action" disabled={busy || !storyUnitId}>{busy ? "正在保存…" : placement ? "确认移动 Placement" : "确认插入 Placement"}</button>{placement ? <div className="narrative-remove-action"><button type="button" disabled={busy} onClick={() => void remove()}><Trash2 />{confirmRemove ? "再次确认移除" : "从当前编排移除"}</button>{confirmRemove ? <small>只移除 Placement；不会删除 Event 或改变世界时间。</small> : null}</div> : null}</>}{message ? <p className="narrative-arrangement-message" role="status">{message}</p> : null}</form>;
}

function UnavailableTask(props: { task: "perspective" | "relationship"; onBack(): void }) {
  return <section className="story-progression-unavailable"><span>{props.task === "perspective" ? <Eye /> : <GitBranch />}</span><small>同一事件线工作区 · 能力未开放</small><h2>{props.task === "perspective" ? "角色视角需要正式知情与信念合同" : "关系变化需要版本化 Relation 状态"}</h2><p>{props.task === "perspective" ? "当前参与、见证和听闻证据仍可在事件线与证据审计中核对，但不会被包装成人物内心。" : "当前可以查看正式关系证据，但轨迹靠近、相交或并行都不会自动产生 Relation。"}</p><button type="button" onClick={props.onBack}><ArrowLeft />返回事件线</button></section>;
}

function auditEvents(placements: readonly DisplayPlacement[], events: readonly EventLineEventSummary[]): EventLineEventSummary[] {
  const result: EventLineEventSummary[] = [];
  const seen = new Set<string>();
  for (const event of [...placements.map((placement) => placement.event), ...events]) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

function currentPlacements(reads: readonly NarrativeArrangementRead[]): NarrativePlacement[] {
  return reads.flatMap((read) => read.arrangement?.revisions.find((revision) => revision.revision === read.arrangement!.currentRevision)?.placements ?? []);
}
function objectTypeLabel(type: PerspectiveObjectRef["type"]): string { return type === "character" ? "人物" : type === "location" ? "地点" : "物品"; }
function objectTypeTrackLabel(type: PerspectiveObjectRef["type"]): string { return type === "character" ? "人物轨迹" : type === "location" ? "地点出现" : "物品流转"; }
function objectIcon(type: PerspectiveObjectRef["type"]) { return type === "character" ? <UserRound /> : type === "location" ? <MapPin /> : <Package />; }
function trajectoryStateLabel(state: "direct" | "witnessed" | "explicit-absence" | "unknown"): string { return state === "direct" ? "参与" : state === "witnessed" ? "见证" : state === "explicit-absence" ? "明确缺席" : "unknown"; }
function conflictLabel(code: NarrativeArrangementWriteResult["code"]): string { return ({ "stale-arrangement-revision": "Arrangement revision 已过期", "idempotency-key-reused": "操作 ID 已被其他载荷使用", "placement-not-found": "Placement 已不存在", "anchor-not-found": "锚点已不存在", "anchor-unit-mismatch": "锚点不在目标单元", "order-conflict": "当前正式顺序存在冲突", "branch-mismatch": "分支或叙事路径不匹配", "rollback-revision-not-found": "回滚版本不存在", "stale-owner-version": "Story Unit 版本已变化", "arrangement-already-exists": "Arrangement 已由其他操作建立" } as const)[code ?? "stale-arrangement-revision"]; }
