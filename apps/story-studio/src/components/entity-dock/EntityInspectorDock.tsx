import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Pin, PinOff, X, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react";

import {
  getCharacterMemoryQuery,
  getEventStoryCrossingKnowledgeProjection,
  getWorldLibrary,
  listRelations,
  readWorldObject,
} from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { EventStoryCrossingKnowledgeProjection } from "../../../../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import type { CharacterMemoryQueryProjection } from "../../../../../src/storyContinuity/characterMemoryQuery.ts";
import { projectWorldReferences, WORLD_REFERENCE_CATEGORY_LABELS } from "../../../../../src/storyContracts/worldReferenceProjection.ts";
import { buildCharacterContextPack, type CharacterContextPack } from "../../../../../src/storyContracts/characterContextPack.ts";
import { attachTimeFrames, projectCausalEvolution, type CausalEvolutionCard } from "../../../../../src/storyContracts/worldCausalEvolution.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { CharacterMemoryQuery, FormalRelations, CharacterKnowledgePreview } from "../../product-shell/project-directory/character/CharacterInspectorCard";
import {
  closeEntityDock,
  getEntityDockState,
  setEntityDockPinned,
  setEntityDockStatus,
  subscribeEntityDock,
} from "./entityInspectorDockStore";

const DOCK_TABS = ["总览", "档案", "心理与状态", "记忆", "关系与知情", "人生与事件", "演化与命运", "Agent 运行", "来源与权限"] as const;
type DockTab = (typeof DOCK_TABS)[number];

interface CharacterDockRead {
  title: string;
  subtype: string | null;
  status: string;
  portraitAssetRef: string | null;
  profileCore: string | null;
  boundaries: string | null;
  participations: Array<{ eventId: string }>;
}

/** 通用磁吸详情工作台：peek/expanded/pinned；当前支持 character，容器与入口对任意实体通用。
 * 只读组合既有 Owner（WorldObject/Relation/CharacterMemory/知识投影），不建立第二事实库。 */
export function EntityInspectorDock(props: { runtime: TianyanShellRuntimeState }) {
  const state = useSyncExternalStore(subscribeEntityDock, getEntityDockState, getEntityDockState);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state.status !== "closed" && !state.pinned) closeEntityDock();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.status, state.pinned]);
  if (state.status === "closed" || !props.runtime.project || !state.objectId) return null;
  if (state.kind === "character") return <CharacterEntityDock runtime={props.runtime} objectId={state.objectId} status={state.status} pinned={state.pinned} sceneTitle={state.sceneTitle} />;
  if (state.kind === "world-reference") return <WorldEntityDock runtime={props.runtime} objectId={state.objectId} status={state.status} pinned={state.pinned} />;
  return null;
}

function CharacterEntityDock(props: { runtime: TianyanShellRuntimeState; objectId: string; status: "peek" | "expanded"; pinned: boolean; sceneTitle: string | null }) {
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId ?? null;
  const [read, setRead] = useState<CharacterDockRead | null>(null);
  const [failed, setFailed] = useState(false);
  const [knowledge, setKnowledge] = useState<EventStoryCrossingKnowledgeProjection | null>(null);
  const [relations, setRelations] = useState<RelationReadProjectionR0[]>([]);
  const [memoryQuery, setMemoryQuery] = useState<CharacterMemoryQueryProjection | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [worldObjects, setWorldObjects] = useState<unknown>(null);
  const [tab, setTab] = useState<DockTab>("总览");

  useEffect(() => {
    let active = true;
    setRead(null); setFailed(false); setKnowledge(null); setRelations([]); setMemoryQuery(null); setWorldObjects(null);
    if (!projectId) return () => { active = false; };
    void Promise.all([readWorldObject(projectId, props.objectId), getWorldLibrary(projectId), getEventStoryCrossingKnowledgeProjection(projectId, props.objectId), listRelations({ projectId, workVersionId, objectId: props.objectId, reviewState: "confirmed" })]).then(([object, library, projection, relationRead]) => {
      if (!active) return;
      if (object.type !== "character") { setFailed(true); return; }
      setRead({
        title: object.title,
        subtype: object.subtype ?? null,
        status: object.status,
        portraitAssetRef: object.card.portrait?.assetRef ?? null,
        profileCore: profileValue(object, "character_core"),
        boundaries: profileValue(object, "boundaries"),
        participations: (object.worldProjection?.timelineParticipations ?? []).map((item) => ({ eventId: item.eventId })),
      });
      setKnowledge(projection.observer.id === object.id ? projection : null);
      setRelations(relationRead.relations);
      setWorldObjects(library.objects);
    }).catch(() => { if (active) setFailed(true); });
    void getCharacterMemoryQuery(projectId, props.objectId, workVersionId).then((query) => { if (active) setMemoryQuery(query); }).catch(() => { if (active) setMemoryError("角色记忆记录暂时无法读取；没有把读取失败当成没有经历。"); });
    return () => { active = false; };
  }, [projectId, props.objectId, workVersionId]);

  const references = useMemo(() => projectWorldReferences((worldObjects as Array<{ id: string; title: string; type: string; status: string; tags: string[]; aliases?: string[] }> | null) ?? []), [worldObjects]);
  const objectLabels = useMemo(() => new Map(((worldObjects as Array<{ id: string; title: string; type: string }> | null) ?? []).filter((item) => item.type === "character").map((item) => [item.id, item.title])), [worldObjects]);
  const contextPack = useMemo(() => {
    if (!read) return null;
    const characterMemories = (memoryQuery?.records ?? []).map((record) => ({ id: record.id, label: record.label, title: record.title, summary: record.summary, occurredAt: record.occurredAt, validity: record.validity }));
    const labels = new Map([...objectLabels.entries(), ...references.map((entry) => [entry.title, entry.title] as const)]);
    const sanitizedMemories = characterMemories.map((memory) => ({ ...memory, label: sanitizeInternalIds(memory.label, labels), title: sanitizeInternalIds(memory.title, labels), summary: sanitizeInternalIds(memory.summary, labels) }));
    return buildCharacterContextPack({
      characterTitle: read.title,
      sceneFrame: props.sceneTitle ? { title: props.sceneTitle, worldTimeLabel: "当前场景" } : null,
      goal: null,
      profileCore: read.profileCore,
      boundaries: read.boundaries,
      worldReferences: references,
      relations: relations.map((relation) => {
        const isSource = relation.sourceObjectId === props.objectId;
        const otherId = isSource ? relation.targetObjectId : relation.sourceObjectId;
        return { other: objectLabels.get(otherId) ?? "关联对象", typeLabel: relation.currentTypeLabel ?? relation.relationLabelSnapshot, directionLabel: relation.direction === "both" ? "双向" : "单向" };
      }),
      memories: sanitizedMemories,
      visibleEventTitles: (knowledge?.visibleEvents ?? []).map((event) => event.title),
    });
  }, [read, references, relations, memoryQuery, knowledge, props.objectId, props.sceneTitle]);

  if (failed) return <aside className="entity-dock is-peek" data-testid="entity-inspector-dock" role="complementary" aria-label="详情工作台">
    <DockHeader title="详情工作台" status="peek" pinned={false} onPin={() => undefined} onExpand={() => undefined} onClose={closeEntityDock} />
    <p className="entity-dock-empty" role="alert"><AlertTriangle size={14} />该对象不存在或已归档；没有读取到可展示的角色。</p>
  </aside>;
  if (!read) return <aside className="entity-dock is-peek" data-testid="entity-inspector-dock" role="complementary" aria-label="详情工作台">
    <DockHeader title="详情工作台" status="peek" pinned={false} onPin={() => undefined} onExpand={() => undefined} onClose={closeEntityDock} />
    <p className="entity-dock-empty" aria-busy="true"><RefreshCw size={14} />正在读取角色……读取本身不调用模型。</p>
  </aside>;

  const visibleCount = knowledge?.visibleEvents.length ?? 0;
  const hiddenCount = knowledge?.hiddenCount ?? 0;
  const lastParticipation = read.participations.length ? `参与正式事件 ${read.participations.length} 项` : "暂无正式事件参与记录";
  return <aside className={`entity-dock is-${props.status}`} data-status={props.status} data-pinned={props.pinned} data-testid="entity-inspector-dock" role="complementary" aria-label="角色详情工作台">
    <header className="entity-dock-head">
      <div className="entity-dock-avatar" aria-hidden="true">{read.title.slice(0, 1)}</div>
      <div className="entity-dock-identity">
        <strong>{read.title}</strong>
        <span>{read.subtype ?? "角色"} · {read.status === "archived" ? "已归档" : "已确认"}</span>
      </div>
      <div className="entity-dock-head-actions">
        <button type="button" aria-label={props.pinned ? "取消固定" : "固定工作台"} aria-pressed={props.pinned} onClick={() => setEntityDockPinned(!props.pinned)}>{props.pinned ? <Pin size={14} /> : <PinOff size={14} />}</button>
        <button type="button" aria-label={props.status === "expanded" ? "收起为简卡" : "展开为完整工作台"} aria-expanded={props.status === "expanded"} onClick={() => setEntityDockStatus(props.status === "expanded" ? "peek" : "expanded")}>{props.status === "expanded" ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}</button>
        <button type="button" aria-label="关闭详情工作台" onClick={closeEntityDock}><X size={15} /></button>
      </div>
    </header>

    {props.status === "peek" ? <div className="entity-dock-peek" data-testid="entity-dock-peek">
      <p className="entity-dock-line"><small>当前故事位置</small>{lastParticipation}</p>
      <p className="entity-dock-line"><small>角色核心</small>{read.profileCore ?? "未设置"}</p>
      <p className="entity-dock-line"><small>知情摘要</small>可见 {visibleCount} 项 · 对该角色隐藏 {hiddenCount} 项</p>
      <p className="entity-dock-line"><small>关键关系</small>{relations.length ? relations.slice(0, 2).map((relation) => {
        const isSource = relation.sourceObjectId === props.objectId;
        const otherId = isSource ? relation.targetObjectId : relation.sourceObjectId;
        return objectLabels.get(otherId) ?? "关联对象";
      }).join("、") : "暂无已确认正式关系"}</p>
      <button type="button" className="entity-dock-expand" onClick={() => setEntityDockStatus("expanded")}>展开角色工作台</button>
    </div> : <>
      <nav className="entity-dock-tabs" role="tablist" aria-label="角色工作台页签">
        {DOCK_TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}
      </nav>
      <div className="entity-dock-body" role="tabpanel" data-testid="entity-dock-body">
        {tab === "总览" ? <OverviewTab objectId={props.objectId} read={read} relations={relations} objectLabels={objectLabels} pack={contextPack} /> : null}
        {tab === "档案" ? <div className="entity-dock-section"><p>档案字段以角色目录编辑器为唯一编辑入口；此处只读展示。</p><dl><div><dt>角色核心</dt><dd>{read.profileCore ?? "未设置"}</dd></div><div><dt>底线</dt><dd>{read.boundaries ?? "未设置"}</dd></div></dl><a href={`/world?worldView=character&objectId=${encodeURIComponent(props.objectId)}`}>在角色目录中编辑档案</a></div> : null}
        {tab === "心理与状态" ? <div className="entity-dock-section"><p>状态投影合同（tianyan-character-state-projection/v1）已定义，但当前没有生产喂入；本面板不做无来源推断。<small>非心理测评。</small></p></div> : null}
        {tab === "记忆" ? <CharacterMemoryQuery query={memoryQuery} error={memoryError} /> : null}
        {tab === "关系与知情" ? <div className="entity-dock-section"><FormalRelations objectId={props.objectId} relations={relations} graphRelationCount={0} objectLabels={objectLabels} /><CharacterKnowledgePreview projection={knowledge} /></div> : null}
        {tab === "人生与事件" ? <div className="entity-dock-section"><p>{lastParticipation}。</p><a href={`/event-line?projectId=${encodeURIComponent(props.runtime.project?.id ?? "")}`}>在事件线查看</a></div> : null}
        {tab === "演化与命运" ? <div className="entity-dock-section"><p>命运投影合同（tianyan-character-fate-projection/v1）已定义；当前没有 actual / planned / candidate 生产数据，不生成无来源轨迹。</p></div> : null}
        {tab === "Agent 运行" ? <AgentRunTab pack={contextPack} /> : null}
        {tab === "来源与权限" ? <div className="entity-dock-section">
          <p>来源：本机工程（markdown）；技术标识见各条目「来源标识」折叠。</p>
          <p>知识边界：作者备注与传闻 {contextPack?.excluded.length ?? 0} 项不进入该角色上下文；可见事件 {visibleCount} 项、隐藏 {hiddenCount} 项。</p>
        </div> : null}
      </div>
    </>}
  </aside>;
}

function OverviewTab(props: { objectId: string; read: { title: string; subtype: string | null; profileCore: string | null; participations: Array<{ eventId: string }> }; relations: RelationReadProjectionR0[]; objectLabels: Map<string, string>; pack: CharacterContextPack | null }) {
  return <div className="entity-dock-section">
    <p><small>关键身份</small>{props.read.title}{props.read.subtype ? ` · ${props.read.subtype}` : ""}</p>
    <p><small>当前故事位置</small>{props.read.participations.length ? `参与正式事件 ${props.read.participations.length} 项` : "暂无正式事件参与记录"}</p>
    <p><small>最近变化</small>{props.pack?.includedMemories[0] ? props.pack.includedMemories[0].title : "暂无相关记忆记录"}</p>
    <p><small>关键关系</small>{props.relations.length ? props.relations.slice(0, 2).map((relation) => {
      const isSource = relation.sourceObjectId === props.objectId;
      const otherId = isSource ? relation.targetObjectId : relation.sourceObjectId;
      return props.objectLabels?.get(otherId) ?? "关联对象";
    }).join("、") : "暂无已确认正式关系"}</p>
    <p><small>当前目标</small>{props.pack?.goal ?? "未记录"}</p>
    <p><small>当前风险</small>{props.pack?.excluded.length ? `${props.pack.excluded.length} 项信息对该角色隐藏（作者备注/传闻/未知）` : "未识别到需要隐藏的信息"}</p>
  </div>;
}

function AgentRunTab(props: { pack: CharacterContextPack | null }) {
  return <div className="entity-dock-section" data-testid="entity-agent-run">
    <h4>执行档案解析链（项目默认 → 演员团 → 角色 → 任务）</h4>
    <ol className="entity-dock-chain">
      <li>项目默认：未设置（诚实空态）</li>
      <li>演员团：未设置</li>
      <li>角色覆盖：未设置</li>
      <li>任务临时覆盖：未设置</li>
    </ol>
    <p>最终解析结果：尚无可执行档案；不会自动回退为假对话。角色级配置 Owner 未建立，不提供临时 JSON 存储，也不提供假保存按钮。</p>
    <h4>预算与策略</h4>
    <p>单场景最多 6 步 / 12 次模型发送；记忆策略：CharacterMemory 账本（亲历/目击/听闻/信念，回溯即失效）；知识边界策略：作者备注、传闻与该角色未知信息不进入上下文。</p>
    <h4>上下文包预览（确定性 · 0 Provider）</h4>
    {props.pack ? <div className="entity-dock-contextpack" data-testid="character-context-pack">
      <p><small>场景框</small>{props.pack.sceneFrame ? `${props.pack.sceneFrame.title} · ${props.pack.sceneFrame.worldTimeLabel}` : "未提供"}</p>
      <p><small>角色内核</small>{props.pack.kernel.core ?? "未设置"}；底线 {props.pack.kernel.boundaries ?? "未设置"}</p>
      <p><small>纳入事实</small>{props.pack.includedFacts.map((fact) => `${fact.title}（${fact.categoryLabel}${fact.knowledgeLabel ? " · " + fact.knowledgeLabel : ""}）`).join("；") || "无"}</p>
      <p><small>本轮检索记忆</small>{props.pack.includedMemories.map((memory) => memory.title).join("；") || "无相关记忆"}</p>
      <p><small>排除（含理由）</small>{props.pack.excluded.map((item) => `${item.title}（${item.reason === "author-note" ? "作者备注" : item.reason === "rumor" ? "传闻" : "该角色未知"}）`).join("；") || "无"}</p>
      <p><small>预计 token</small>约 {props.pack.estimatedTokens}（保守估算，非计费 token）· Provider 调用 {props.pack.providerCalls}</p>
    </div> : <p>正在读取上下文数据……</p>}
  </div>;
}

function DockHeader(props: { title: string; status: "peek" | "expanded"; pinned: boolean; onPin(): void; onExpand(): void; onClose(): void }) {
  return <header className="entity-dock-head">
    <strong>{props.title}</strong>
    <div className="entity-dock-head-actions">
      <button type="button" aria-label={props.pinned ? "取消固定" : "固定工作台"} onClick={props.onPin}>{props.pinned ? <Pin size={14} /> : <PinOff size={14} />}</button>
      <button type="button" aria-label={props.status === "expanded" ? "收起为简卡" : "展开为完整工作台"} onClick={props.onExpand}>{props.status === "expanded" ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}</button>
      <button type="button" aria-label="关闭详情工作台" onClick={props.onClose}><X size={15} /></button>
    </div>
  </header>;
}

function sanitizeInternalIds(text: string, labels: Map<string, string>): string {
  return text.replace(/([a-z-]+)\.([^\s，。；）】"]+)/gu, (match, prefix: string, rawName: string) => {
    const name = rawName.replace(/_/gu, " ");
    if (labels.has(name)) return labels.get(name) as string;
    const known: Record<string, string> = { character: "角色", event: "事件", item: "物件", location: "地点", faction: "组织", rule: "规则", "story-unit": "单元", "work-version": "作品版本", nuwa: "排演" };
    return known[prefix] ? `${known[prefix]}（已隐去标识）` : match;
  });
}

function profileValue(object: { profile?: { authorConfirmed?: boolean; fields?: Record<string, { source?: string; value?: unknown }> | null } | null }, key: string): string | null {
  const field = object.profile?.authorConfirmed === true ? object.profile.fields?.[key] : null;
  return field?.source === "author" && typeof field.value === "string" ? field.value : null;
}

/** 世界条目磁吸详情：peek=摘要/类别/性质/相关对象/当前压力；expanded=因果—演化工作台（A–G + 变化维度 + 时间关键帧）。
 * 只读组合既有 WorldObject 与其 world-library 投影，按 projectId + objectId 隔离加载。 */
function WorldEntityDock(props: { runtime: TianyanShellRuntimeState; objectId: string; status: "peek" | "expanded"; pinned: boolean }) {
  const projectId = props.runtime.project?.id ?? null;
  const [object, setObject] = useState<{ id: string; title: string; type: string; status: string; tags: string[]; body: string | null; relativeId: string | null } | null>(null);
  const [relatedClues, setRelatedClues] = useState<Array<{ id: string; title: string; status: string; tags: string[] }>>([]);
  const [failed, setFailed] = useState(false);
  const WORLD_TABS = ["概览", "因果链", "演化时间", "关系与影响", "当前故事", "来源与证据"] as const;
  type WorldTab = (typeof WORLD_TABS)[number];
  const [tab, setTab] = useState<WorldTab>("概览");

  useEffect(() => {
    let active = true;
    setObject(null); setFailed(false); setRelatedClues([]);
    if (!projectId) return () => { active = false; };
    void Promise.all([readWorldObject(projectId, props.objectId), getWorldLibrary(projectId)]).then(([object, library]) => {
      if (!active) return;
      setObject({ id: object.id, title: object.title, type: object.type, status: object.status, tags: object.tags, body: object.body ?? null, relativeId: object.relativeId ?? null });
      setRelatedClues(library.objects.filter((item) => item.type === "event" && (item.tags.some((tag) => tag.includes(object.title)) || item.title.includes(object.title))).map((item) => ({ id: item.id, title: item.title, status: item.status, tags: item.tags })));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [projectId, props.objectId]);

  const card = useMemo(() => (object ? attachTimeFrames(projectCausalEvolution(object), relatedClues) : null), [object, relatedClues]);
  const nature = useMemo(() => (object ? projectWorldReferences([object])[0]?.nature ?? null : null), [object]);
  const relatedObjectCount = useMemo(() => {
    if (!object) return 0;
    const names = new Set<string>();
    for (const clue of relatedClues) {
      for (const tag of clue.tags) {
        if (!tag.includes(object.title)) continue;
        for (const part of tag.split(/[:：]/u).slice(1)) {
          for (const piece of part.split(/[、，,;；]/u)) {
            const name = piece.split(/[=＝]/u)[0].trim();
            if (name) names.add(name);
          }
        }
      }
    }
    return names.size;
  }, [object, relatedClues]);
  const pressureCount = (object?.tags ?? []).filter((tag) => tag.startsWith("压力") || tag.startsWith("冲突")).length;
  const natureLabel = nature === "confirmed-fact" ? "已确认事实" : nature === "pending-clue" ? "待确认线索" : nature === "rumor" ? "传闻 · 不确定" : nature === "author-note" ? "作者备注" : null;

  return <aside className={`entity-dock is-${props.status}`} data-status={props.status} data-pinned={props.pinned} data-testid="entity-inspector-dock" role="complementary" aria-label="世界条目详情工作台">
    <header className="entity-dock-head">
      <div className="entity-dock-identity">
        <strong>{object?.title ?? "世界条目"}</strong>
        <span>{card ? card.categoryLabel : "读取中"}{natureLabel ? ` · ${natureLabel}` : ""}{props.pinned ? " · 已固定" : ""}</span>
      </div>
      <div className="entity-dock-head-actions">
        {props.status === "peek" ? <button type="button" aria-label="展开为因果—演化工作台" onClick={() => setEntityDockStatus("expanded")}><ChevronsLeft size={15} /></button> : <button type="button" aria-label="收起为简卡" onClick={() => setEntityDockStatus("peek")}><ChevronsRight size={15} /></button>}
        <button type="button" aria-label="关闭详情工作台" onClick={closeEntityDock}><X size={15} /></button>
      </div>
    </header>
    {!object ? failed
      ? <p className="entity-dock-empty" role="alert"><AlertTriangle size={14} />该世界条目不存在或已归档。</p>
      : <p className="entity-dock-empty" aria-busy="true"><RefreshCw size={14} />正在读取世界条目……</p>
      : props.status === "peek" ? <div className="entity-dock-peek" data-testid="entity-dock-peek">
        <p className="entity-dock-line"><small>摘要</small>{(object.body ?? "").split(/\r?\n/u).find((line) => line.trim() && !line.startsWith("#")) ?? "尚未记录"}</p>
        <p className="entity-dock-line"><small>当前性质</small>{natureLabel ?? "尚未记录"}</p>
        <p className="entity-dock-line"><small>当前状态</small>{object.status === "active" ? "已确认（现行）" : "草稿候选"}{card?.dimensions.worldTime ? ` · ${card.dimensions.worldTime}` : ""}</p>
        <p className="entity-dock-line"><small>当前故事关联</small>{object.tags.filter((tag) => tag.startsWith("单元") || tag.startsWith("故事线")).join("；") || "尚未标记单元或故事线"}</p>
        <p className="entity-dock-line"><small>相关对象</small>{relatedObjectCount ? `标签引用 ${relatedObjectCount} 个对象` : "暂无标签引用"}</p>
        <button type="button" className="entity-dock-expand" onClick={() => setEntityDockStatus("expanded")}>展开工作台</button>
      </div> : card ? <div className="entity-dock-body" data-testid="world-causal-card">
        <nav className="entity-dock-tabs" role="tablist" aria-label="世界条目页签">
          {WORLD_TABS.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>)}
        </nav>
        {tab === "概览" ? <div className="entity-dock-section" data-testid="world-causal-card">
          <p><small>定义</small>{card.definition.text ?? "尚未记录"}</p>
          <p><small>当前状态</small>{object.status === "active" ? "已确认（现行）" : "草稿候选"}{card.dimensions.worldTime ? ` · ${card.dimensions.worldTime}` : ""}</p>
          <p><small>变化维度</small>范围 {card.dimensions.scopeLevel} · 表达 {card.dimensions.expression} · 变化 {card.dimensions.changeKind} · 权威 {card.dimensions.authority === "author" ? "作者确认" : "候选"}</p>
          <p><small>相关对象</small>{relatedObjectCount ? `标签引用 ${relatedObjectCount} 个对象` : "尚未记录"}</p>
        </div> : null}
        {tab === "因果链" ? <div className="entity-dock-section" data-testid="world-causal-chain">
          <ol className="wb-causal-chain" aria-label="因果链">
            <li className="wb-causal-node" data-filled={card.origin.text ? "true" : "false"}>
              <small>起源</small><span>{card.origin.text ?? "尚未记录"}</span>
            </li>
            <li aria-hidden="true" className="wb-causal-arrow">→</li>
            <li className="wb-causal-node" data-filled={card.mechanism.text ? "true" : "false"}>
              <small>机制</small><span>{card.mechanism.text ?? "尚未记录"}</span>
            </li>
            <li aria-hidden="true" className="wb-causal-arrow">→</li>
            <li className="wb-causal-node" data-filled={object.status === "active" ? "true" : "false"}>
              <small>当前</small><span>{object.status === "active" ? `已确认（现行）${card.dimensions.worldTime ? ` · ${card.dimensions.worldTime}` : ""}` : "草稿候选"}</span>
            </li>
            <li aria-hidden="true" className="wb-causal-arrow">→</li>
            <li className="wb-causal-node" data-filled={card.evolutionNotes.text ? "true" : "false"}>
              <small>可能变化</small><span>{card.evolutionNotes.text ?? "尚未记录"}</span>
            </li>
          </ol>
          <p className="wb-field"><small>利益与代价</small><span>{card.interests.text ?? "尚未记录"}</span></p>
          <p className="wb-field"><small>当前压力</small><span>{pressureCount ? `${pressureCount} 项压力/冲突记录` : "尚未记录"}</span></p>
        </div> : null}
        {tab === "演化时间" ? <div className="entity-dock-section" data-testid="world-time-frames">
          <ol className="wb-dock-timeline" aria-label="演化时间轨迹">
            <li className="wb-timeline-track" data-authority="confirmed">
              <h4>已确认</h4>
              {card.timeFrames.length ? <ul>
                {card.timeFrames.filter((frame) => frame.frameAuthority === "confirmed-event").map((frame) => <li key={frame.label + frame.title}>
                  <span className="wb-timeline-marker" aria-hidden="true" />
                  <div><strong>{frame.label} · {frame.title}</strong>{frame.detail ? <small>{frame.detail}</small> : null}{frame.eventId ? <a href={`/event-line?projectId=${encodeURIComponent(props.runtime.project?.id ?? "")}&eventId=${encodeURIComponent(frame.eventId)}`}>回事件线</a> : null}</div>
                </li>)}
                {card.timeFrames.every((frame) => frame.frameAuthority !== "confirmed-event") ? <li className="wb-empty">尚无已确认的时间节点。</li> : null}
              </ul> : <p className="wb-empty">尚无已确认的时间节点。</p>}
            </li>
            <li className="wb-timeline-track" data-authority="planned">
              <h4>规划</h4>
              <p className="wb-empty">暂无规划数据；规划轨迹由作者明确设计后出现在这里（诚实空态）。</p>
            </li>
            <li className="wb-timeline-track" data-authority="candidate">
              <h4>候选</h4>
              <p className="wb-empty">暂无候选数据（诚实空态）。</p>
            </li>
          </ol>
        </div> : null}
        {tab === "关系与影响" ? <div className="entity-dock-section" data-testid="world-relations-impact">
          <p><small>相关对象</small>{relatedObjectCount ? `标签引用 ${relatedObjectCount} 个对象` : "尚未记录"}</p>
          <p><small>利益与代价</small>{card.interests.text ?? "尚未记录"}</p>
          {relatedClues.length ? <p><small>关联线索</small>{relatedClues.map((clue) => clue.title).join("、")}</p> : <p>尚无关联线索事件。</p>}
        </div> : null}
        {tab === "当前故事" ? <div className="entity-dock-section" data-testid="world-story-links">
          <p><small>故事关联</small>{object.tags.filter((tag) => tag.startsWith("单元") || tag.startsWith("故事线")).join("；") || "尚未记录"}</p>
          <p><small>当前压力</small>{pressureCount ? `${pressureCount} 项压力/冲突记录` : "尚未记录"}</p>
          {relatedClues.length ? <p><small>相关线索</small>{relatedClues.map((clue) => clue.title).join("、")}</p> : null}
          <a href={`/event-line?projectId=${encodeURIComponent(props.runtime.project?.id ?? "")}`}>打开事件线</a>
        </div> : null}
        {tab === "来源与证据" ? <div className="entity-dock-section" data-testid="world-source-evidence">
          <p>来源：本机工程（markdown）</p>
          <details><summary>来源标识</summary><code>{card.sourceRef}</code></details>
          <details><summary>原始正文</summary><pre>{object.body ?? "（无正文）"}</pre></details>
          <p><small>本页全部内容均来自上述来源；无 AI 补全。</small></p>
        </div> : null}
      </div> : null}
  </aside>;
}
