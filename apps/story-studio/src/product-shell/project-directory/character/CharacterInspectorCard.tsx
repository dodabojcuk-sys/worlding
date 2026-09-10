import { BookOpen, ChevronLeft, ChevronRight, Link2, Pencil, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getCharacterMemoryQuery, getEventStoryCrossingKnowledgeProjection, getObjectCatalog, getWorldLibrary, listRelations, readWorldObject } from "../../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { EventStoryCrossingKnowledgeProjection } from "../../../../../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import type { CharacterMemoryQueryProjection } from "../../../../../../src/storyContinuity/characterMemoryQuery.ts";
import { useI18n } from "../../i18n/I18nProvider";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import { characterRoleLabel } from "./CharacterCreateDialog";
import { getCharacterDetailSections, getCharacterDirectorySummary } from "./characterDirectoryPresentation";
import { UNVERSIONED_CATALOG_SCOPE, type CharacterDirectoryRecord } from "./useCharacterDirectory";

export function CharacterInspectorLoader(props: { runtime: TianyanShellRuntimeState; objectId: string; onClose(): void; onOpenFull(): void; onOpenKnowledge(objectId: string): void; onAddToNuwa(objectId: string): void }) {
  const [record, setRecord] = useState<CharacterDirectoryRecord | null>(null);
  const [knowledge, setKnowledge] = useState<EventStoryCrossingKnowledgeProjection | null>(null);
  const [formalRelations, setFormalRelations] = useState<RelationReadProjectionR0[]>([]);
  const [memoryQuery, setMemoryQuery] = useState<CharacterMemoryQueryProjection | null>(null);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setRecord(null); setKnowledge(null); setFormalRelations([]); setMemoryQuery(null); setMemoryError(null); if (!props.runtime.project) return;
    const workVersionId = props.runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE;
    const projectId = props.runtime.project.id;
    void Promise.all([readWorldObject(projectId, props.objectId), getObjectCatalog(projectId, workVersionId), getWorldLibrary(projectId), getEventStoryCrossingKnowledgeProjection(projectId, props.objectId), listRelations({ projectId, workVersionId: props.runtime.workVersionId, objectId: props.objectId, reviewState: "confirmed" })]).then(([object, catalog, library, projection, relationRead]) => {
      if (!active) return;
      if (object.type !== "character") { props.onClose(); return; }
      const metadata = catalog.records.find((item) => item.objectId === object.id && item.objectType === "character");
      const categories = new Map(library.folders.filter((folder) => folder.kind === "custom-category").map((folder) => [folder.id, folder.title]));
      const eventIds = new Set([...(object.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []), ...object.linkedObjects.filter((item) => item.type === "event").map((item) => item.id)]);
      setRecord({ object, categoryId: metadata?.categoryId ?? null, categoryName: metadata?.categoryId ? categories.get(metadata.categoryId) ?? null : null, trashedAt: metadata?.trashedAt ?? null, trashedFrom: metadata?.trashedFrom ?? null, eventCount: eventIds.size, manualOrder: metadata?.displayOrder ?? null });
      setKnowledge(projection.observer.id === object.id ? projection : null);
      setFormalRelations(relationRead.relations);
    }).catch(() => { if (active) props.onClose(); });
    void getCharacterMemoryQuery(projectId, props.objectId, props.runtime.workVersionId).then((query) => {
      if (active) setMemoryQuery(query);
    }).catch(() => { if (active) setMemoryError("角色记忆记录暂时无法读取；没有把读取失败当成没有经历。") });
    return () => { active = false; };
  }, [props.objectId, props.runtime.project?.id, props.runtime.workVersionId]);
  return record ? <CharacterInspectorCard record={record} knowledge={knowledge} memoryQuery={memoryQuery} memoryError={memoryError} formalRelations={formalRelations} onClose={props.onClose} onOpenFull={props.onOpenFull} onOpenKnowledge={props.onOpenKnowledge} onAddToNuwa={props.onAddToNuwa} /> : null;
}

export function CharacterInspectorCard(props: { record: CharacterDirectoryRecord; knowledge: EventStoryCrossingKnowledgeProjection | null; memoryQuery: CharacterMemoryQueryProjection | null; memoryError: string | null; formalRelations: readonly RelationReadProjectionR0[]; onClose(): void; onOpenFull(): void; onOpenKnowledge(objectId: string): void; onAddToNuwa(objectId: string): void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const object = props.record.object;
  const role = characterRoleLabel(object.subtype, t);
  const summary = getCharacterDirectorySummary(object, t("character.noSummary"));
  const details = getCharacterDetailSections(object.body);
  const relations = props.formalRelations;
  const events = object.worldProjection?.timelineParticipations ?? [];
  const characterCore = authorProfileValue(object, "character_core");
  const boundaries = authorProfileValue(object, "boundaries");
  const edit = (label: string) => <button type="button" className="character-inspector-edit" onClick={props.onOpenFull} aria-label={`${t("character.edit")}${label}`} title={`${t("character.edit")}${label}`}><Pencil aria-hidden="true" /></button>;

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); props.onClose(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); trigger?.focus(); };
  }, [props.onClose]);

  return <aside className="character-inspector" aria-label={t("character.inspector")} aria-expanded={expanded} data-expanded={expanded} data-testid="character-inspector">
    <header><div className="character-avatar">{object.card.portrait ? <img src={object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</div><div className="character-inspector-identity"><h2><span>{object.title}</span>{edit(t("character.name"))}</h2><div><span>{role}</span><b>{object.status === "archived" ? t("character.archived") : t("character.confirmed")}</b></div></div><div className="character-inspector-header-actions"><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? t("character.collapseInspector") : t("character.expandInspector")} aria-expanded={expanded} title={expanded ? t("character.collapseInspector") : t("character.expandInspector")}>{expanded ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}</button><button ref={closeRef} type="button" onClick={props.onClose} aria-label={t("common.close")} title={t("common.close")}><X aria-hidden="true" /></button></div></header>
    <section className="character-inspector-quick">
      <p className="character-inspector-quick-label">快速查看</p>
      <div className="character-inspector-summary"><p>{summary}</p></div>
      <dl className="character-inspector-agent-basis"><div><dt>角色核心</dt><dd>{characterCore ?? "未设置"}</dd></div><div><dt>底线</dt><dd>{boundaries ?? "未设置"}</dd></div></dl>
      <div className="character-inspector-snapshot"><div><p>{t("character.eventCount")}</p><strong>{events.length}</strong><span>在中央工作面查看关联故事</span></div><div><p>{t("character.relationCount")}</p><strong>{relations.length}</strong><span>只计当前版本的正式关系</span></div></div>
      {expanded && <div className="character-inspector-details"><h3>{t("character.readOnlyDetails")}</h3>{details.length ? details.map((detail) => <article key={detail.heading}><h4>{detail.heading}</h4><p>{detail.content}</p></article>) : <p>{t("character.noAdditionalDetails")}</p>}</div>}
    </section>
    <footer><button type="button" onClick={props.onOpenFull}><BookOpen aria-hidden="true" />展开角色工作面</button><button type="button" onClick={() => props.onAddToNuwa(object.id)}><Link2 aria-hidden="true" />加入女娲</button></footer>
  </aside>;
}

export function CharacterMemoryQuery(props: { query: CharacterMemoryQueryProjection | null; error: string | null; search?: string; kind?: "all" | "experienced" | "witnessed" | "informed" | "belief" | "heard"; onSearchChange?(value: string): void; onKindChange?(value: "all" | "experienced" | "witnessed" | "informed" | "belief" | "heard"): void; onOpenEvent?(eventId: string): void; onOpenNuwa?(runId: string): void }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "experienced" | "witnessed" | "informed" | "belief" | "heard">("all");
  if (props.error) return <section className="character-memory-query" data-testid="character-memory-query-error"><h3>经历与记忆记录</h3><p role="alert">{props.error}</p></section>;
  if (!props.query) return <section className="character-memory-query" aria-busy="true"><h3>经历与记忆记录</h3><p>正在读取当前角色、项目与作品版本的记录……</p></section>;
  const currentSearch = props.search ?? search;
  const currentKind = props.kind ?? kind;
  const changeSearch = (value: string) => { setSearch(value); props.onSearchChange?.(value); };
  const changeKind = (value: typeof kind) => { setKind(value); props.onKindChange?.(value); };
  const needle = currentSearch.trim().toLocaleLowerCase("zh-CN");
  const records = props.query.records.filter((record) => (currentKind === "all" || record.kind === currentKind) && (!needle || `${record.title}\n${record.summary}\n${record.label}`.toLocaleLowerCase("zh-CN").includes(needle)));
  return <section className="character-memory-query" data-testid="character-memory-query" data-provider-calls={props.query.providerCalls}>
    <h3>经历与记忆记录</h3>
    <p>只读取当前角色在当前作品版本可追溯的正式事件与听闻账本。正式事实不会让所有角色自动知情；已回溯的听闻保留失效记录，不再作为可用记忆。</p>
    <small>版本：{props.query.scope.sourceIdentity.kind} · {props.query.scope.sourceIdentity.workVersionId} @ {props.query.scope.sourceIdentity.revision}</small>
    <div className="character-memory-query-controls"><input value={currentSearch} onChange={(event) => changeSearch(event.target.value)} placeholder="搜索经历、说法或来源" aria-label="搜索经历与记忆" /><select value={currentKind} onChange={(event) => changeKind(event.target.value as typeof kind)} aria-label="筛选经历与记忆类型"><option value="all">全部记录</option><option value="experienced">亲历</option><option value="witnessed">目击</option><option value="informed">获知</option><option value="belief">信念</option><option value="heard">听闻</option></select></div>
    <dl className="character-memory-query-counts"><div><dt>亲历</dt><dd>{props.query.counts.experienced}</dd></div><div><dt>目击</dt><dd>{props.query.counts.witnessed}</dd></div><div><dt>听闻</dt><dd>{props.query.counts.heard}</dd></div><div><dt>信念</dt><dd>{props.query.counts.belief}</dd></div></dl>
    {records.length ? <ol>{records.map((record) => <li key={record.id} data-memory-kind={record.kind} data-validity={record.validity}><div><b>{record.label}</b>{record.validity === "invalidated" ? <em>已失效：来源已回溯</em> : null}</div><strong>{record.title}</strong><p>{record.summary}</p><small>{record.source.eventId ? `正式事件 · ${record.source.eventId} · 修订 ${record.source.eventRevision}` : `女娲步骤 · ${record.source.runId} / ${record.source.stepId} · 记录于 ${record.occurredAt}`}</small><div className="character-memory-query-links">{record.source.eventId ? <button type="button" onClick={() => props.onOpenEvent ? props.onOpenEvent(record.source.eventId!) : window.location.assign(`/event-line?eventId=${encodeURIComponent(record.source.eventId!)}`)}>打开事件</button> : null}{record.source.runId ? <button type="button" onClick={() => props.onOpenNuwa ? props.onOpenNuwa(record.source.runId!) : window.location.assign(`/nuwa?runId=${encodeURIComponent(record.source.runId!)}`)}>打开女娲步骤</button> : null}</div></li>)}</ol> : <p data-testid="character-memory-query-empty">当前筛选没有可显示的记录；这不代表角色从未经历任何事情。</p>}
  </section>;
}

export function FormalRelations(props: { objectId: string; relations: readonly RelationReadProjectionR0[]; graphRelationCount: number; objectLabels?: ReadonlyMap<string, string>; onOpenEvent?(eventId: string): void }) {
  const openSource = (relation: RelationReadProjectionR0) => {
    const reference = relation.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference as { eventId?: string } | undefined;
    if (reference?.eventId) props.onOpenEvent ? props.onOpenEvent(reference.eventId) : window.location.assign(`/event-line?eventId=${encodeURIComponent(reference.eventId)}`);
  };
  return <><h3><Link2 aria-hidden="true" />正式关系</h3><p>这里读取 Relation Owner 的已确认记录；人物听闻、图形邻近和候选不会自动成为正式关系。</p>{props.relations.length ? <ul className="character-inspector-formal-relations">{props.relations.map((relation) => {
    const isSource = relation.sourceObjectId === props.objectId;
    const otherId = isSource ? relation.targetObjectId : relation.sourceObjectId;
    const direction = relation.direction === "both" ? "双向" : relation.direction === "none" ? "未指定方向" : isSource === (relation.direction === "forward") ? "由此角色指向对方" : "由对方指向此角色";
    const temporal = relation.temporal?.validFrom || relation.temporal?.validTo ? `${relation.temporal.validFrom ?? "时间未知"} 至 ${relation.temporal.validTo ?? "仍有效"}` : "有效时间未知";
    return <li key={relation.relationId}><strong>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</strong><span>{direction} · {props.objectLabels?.get(otherId) ?? "关联对象"}</span><small>{temporal} · {relation.evidenceRefs.length ? `${relation.evidenceRefs.length} 项正式依据` : "未附加可定位依据"}</small><details><summary>技术详情</summary><code>{otherId}</code></details>{relation.evidenceRefs.some((item) => item.kind === "confirmed-event") ? <button type="button" onClick={() => openSource(relation)}>查看支持事件</button> : null}</li>;
  })}</ul> : <p>当前没有已确认的正式关系。{props.graphRelationCount ? "图谱引用不等于 Relation Owner 中的正式关系。" : ""}</p>}</>;
}

function authorProfileValue(object: CharacterDirectoryRecord["object"], key: "character_core" | "boundaries"): string | null {
  const field = object.profile?.authorConfirmed === true ? object.profile.fields[key] : null;
  return field?.source === "author" && typeof field.value === "string" ? field.value : null;
}

export function CharacterKnowledgePreview(props: { projection: EventStoryCrossingKnowledgeProjection | null }) {
  if (!props.projection) return <section className="character-inspector-knowledge"><h3>角色可知范围</h3><p>当前作品没有可用的角色知情投影；未把角色介绍或作者规划当作已知事实。</p></section>;
  return <section className="character-inspector-knowledge" data-testid="character-knowledge-preview" data-provider-calls={props.projection.providerCalls}><h3>角色可知范围</h3><p>本次只展示该角色可安全读取的事件状态；未知事件正文不会进入此面板或后续角色上下文。</p><dl><div><dt>可见依据</dt><dd>{props.projection.visibleEvents.length} 项</dd></div><div><dt>已排除</dt><dd>{props.projection.hiddenCount} 项</dd></div><div><dt>上下文版本</dt><dd>{props.projection.characterStateProjectionRevision ?? "尚无派生状态"}</dd></div></dl>{props.projection.visibleEvents.length ? <ol>{props.projection.visibleEvents.map((event) => <li key={event.eventId}><strong>{event.title}</strong><span>{event.knowledgeLabel} · {event.sourceEventIds.length ? `${event.sourceEventIds.length} 条来源引用` : "未提供额外引用"}</span></li>)}</ol> : <p>当前没有角色可安全读取的事件。</p>}</section>;
}
