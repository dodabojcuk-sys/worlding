import { BookOpen, ChevronLeft, Link2, Pencil, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getCharacterMemoryQuery, getEventStoryCrossingKnowledgeProjection, getObjectCatalog, getWorldLibrary, listRelations, readWorldObject } from "../../../lib/localTransport";
import type { EventStoryCrossingKnowledgeProjection } from "../../../../../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import type { CharacterMemoryQueryProjection } from "../../../../../../src/storyContinuity/characterMemoryQuery.ts";
import type { RelationReadProjectionR0 } from "../../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../runtime/TianyanShellRuntime";
import { useI18n } from "../../i18n/I18nProvider";
import { CharacterKnowledgePreview, CharacterMemoryQuery, FormalRelations } from "./CharacterInspectorCard";
import { characterRoleLabel } from "./CharacterCreateDialog";
import { getCharacterDetailSections, getCharacterDirectorySummary } from "./characterDirectoryPresentation";
import { UNVERSIONED_CATALOG_SCOPE, type CharacterDirectoryRecord } from "./useCharacterDirectory";

type QueryKind = "all" | "experienced" | "witnessed" | "informed" | "belief" | "heard";
type CharacterWorkspaceData = { record: CharacterDirectoryRecord | null; knowledge: EventStoryCrossingKnowledgeProjection | null; memoryQuery: CharacterMemoryQueryProjection | null; memoryError: string | null; relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, string>; error: string | null };

/** The central author surface is a reader over the existing World/Relation/Memory owners. */
export function CharacterWorkspace(props: { runtime: TianyanShellRuntimeState; objectId: string; onEdit(): void; onAddToNuwa(): void; onClose(): void }) {
  const { t } = useI18n();
  const data = useCharacterWorkspaceData(props.runtime, props.objectId);
  const url = new URL(window.location.href);
  const [search, setSearch] = useState(() => url.searchParams.get("characterSearch") || "");
  const [kind, setKind] = useState<QueryKind>(() => normalizeKind(url.searchParams.get("characterKind")));
  const restored = useRef(false);
  const projectId = props.runtime.project?.id ?? "no-project";
  const stateKey = `tianyan:character-workspace:${projectId}:${props.runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE}:${props.objectId}`;
  const updateUrl = (nextSearch: string, nextKind: QueryKind) => {
    const next = new URL(window.location.href);
    if (nextSearch) next.searchParams.set("characterSearch", nextSearch); else next.searchParams.delete("characterSearch");
    if (nextKind !== "all") next.searchParams.set("characterKind", nextKind); else next.searchParams.delete("characterKind");
    window.history.replaceState({}, "", `${next.pathname}${next.search}`);
  };
  const saveView = () => {
    window.sessionStorage.setItem(stateKey, JSON.stringify({ search, kind, scrollY: window.scrollY }));
  };
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(stateKey) || "null") as { search?: unknown; kind?: unknown; scrollY?: unknown } | null;
      if (!url.searchParams.get("characterSearch") && typeof stored?.search === "string") setSearch(stored.search);
      if (!url.searchParams.get("characterKind")) setKind(normalizeKind(stored?.kind));
      if (Number.isFinite(stored?.scrollY) && Number(stored?.scrollY) > 0) window.requestAnimationFrame(() => window.scrollTo(0, Number(stored!.scrollY)));
    } catch { /* A broken browser-local view state must not block the author reader. */ }
  }, [stateKey]);
  const navigateSource = (pathname: string, query: Record<string, string>) => {
    saveView();
    const target = new URL(pathname, window.location.origin);
    for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
    target.searchParams.set("characterReturn", `${window.location.pathname}${window.location.search}`);
    target.searchParams.set("characterReturnLabel", data.record?.object.title || "角色");
    window.location.assign(`${target.pathname}${target.search}`);
  };
  const changeSearch = (value: string) => { setSearch(value); updateUrl(value, kind); };
  const changeKind = (value: QueryKind) => { setKind(value); updateUrl(search, value); };
  if (!props.runtime.project) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  if (data.error) return <main className="shell-workspace"><section className="character-workspace" role="alert"><h1>角色资料暂时无法读取</h1><p>{data.error}</p><button type="button" onClick={props.onClose}>返回世界总览</button></section></main>;
  if (!data.record) return <main className="shell-workspace"><section className="character-workspace" aria-busy="true"><p>正在读取角色、当前作品版本及其可追溯记录……</p></section></main>;
  const object = data.record.object;
  const details = getCharacterDetailSections(object.body);
  const events = object.worldProjection?.timelineParticipations ?? [];
  const relationEvidenceCount = data.relations.reduce((total, relation) => total + relation.evidenceRefs.length, 0);
  return <main className="shell-workspace" aria-label={`${object.title} 的角色工作面`} data-testid="character-workspace">
    <section className="character-workspace">
      <header className="character-workspace-header"><button type="button" className="character-workspace-back" onClick={props.onClose}><ChevronLeft aria-hidden="true" />返回世界总览</button><div className="character-workspace-identity"><div className="character-workspace-avatar">{object.card.portrait ? <img src={object.card.portrait.assetRef} alt="" /> : <UserRound aria-hidden="true" />}</div><div><p>角色工作面 · 当前作品版本</p><h1>{object.title}</h1><span>{characterRoleLabel(object.subtype, t)} · {object.status === "archived" ? "已归档" : "已确认"}</span></div></div><div className="character-workspace-actions"><button type="button" onClick={props.onEdit}><Pencil aria-hidden="true" />编辑资料</button><button type="button" onClick={props.onAddToNuwa}><Link2 aria-hidden="true" />加入女娲</button></div></header>
      <div className="character-workspace-grid"><section className="character-workspace-main"><article className="character-workspace-profile"><h2>角色资料</h2><p>{getCharacterDirectorySummary(object, "暂无角色摘要。")}</p><dl><div><dt>角色核心</dt><dd>{authorProfileValue(object, "character_core") ?? "未设置"}</dd></div><div><dt>底线</dt><dd>{authorProfileValue(object, "boundaries") ?? "未设置"}</dd></div><div><dt>别名</dt><dd>{object.aliases.join("、") || "无"}</dd></div><div><dt>标签</dt><dd>{object.tags.join("、") || "无"}</dd></div></dl>{details.length ? <details><summary>完整角色资料</summary>{details.map((detail) => <article key={detail.heading}><h3>{detail.heading}</h3><p>{detail.content}</p></article>)}</details> : null}</article>
        <CharacterMemoryQuery query={data.memoryQuery} error={data.memoryError} search={search} kind={kind} onSearchChange={changeSearch} onKindChange={changeKind} onOpenEvent={(eventId) => navigateSource("/event-line", { eventId })} onOpenNuwa={(runId) => navigateSource("/nuwa", { runId })} />
        <section className="character-workspace-story"><h2><BookOpen aria-hidden="true" />关联故事</h2>{events.length ? <ul>{events.map((event) => <li key={event.eventId}><button type="button" onClick={() => navigateSource("/event-line", { eventId: event.eventId })}>{data.labels.get(event.eventId) ?? "正式事件"}</button><details><summary>技术详情</summary><code>{event.eventId}</code></details></li>)}</ul> : <p>当前没有关联的正式事件。</p>}</section>
      </section><aside className="character-workspace-context"><section><h2>查询范围</h2><p>只读当前角色、当前项目和当前作品版本。未搜到、读取失败与已回溯记录分别显示，不会把缺失当作“从未经历”。</p><dl><div><dt>可显示记录</dt><dd>{data.memoryQuery?.records.length ?? 0} 条</dd></div><div><dt>听闻记录</dt><dd>{data.memoryQuery?.counts.heard ?? 0} 条</dd></div><div><dt>正式关系依据</dt><dd>{relationEvidenceCount} 项</dd></div></dl><small>“听闻”按记忆账本条目计；“依据”按 Relation Owner 的正式证据引用计，口径不同，不能互相替代。</small></section><FormalRelations objectId={object.id} relations={data.relations} graphRelationCount={object.worldProjection?.confirmedRelations?.length ?? 0} objectLabels={data.labels} onOpenEvent={(eventId) => navigateSource("/event-line", { eventId })} /><CharacterKnowledgePreview projection={data.knowledge} /></aside></div>
    </section>
  </main>;
}

function useCharacterWorkspaceData(runtime: TianyanShellRuntimeState, objectId: string): CharacterWorkspaceData {
  const [data, setData] = useState<CharacterWorkspaceData>({ record: null, knowledge: null, memoryQuery: null, memoryError: null, relations: [], labels: new Map(), error: null });
  useEffect(() => {
    let active = true;
    setData({ record: null, knowledge: null, memoryQuery: null, memoryError: null, relations: [], labels: new Map(), error: null });
    if (!runtime.project) return;
    const projectId = runtime.project.id;
    const workVersionId = runtime.workVersionId ?? UNVERSIONED_CATALOG_SCOPE;
    void Promise.all([readWorldObject(projectId, objectId), getObjectCatalog(projectId, workVersionId), getWorldLibrary(projectId), getEventStoryCrossingKnowledgeProjection(projectId, objectId), listRelations({ projectId, workVersionId: runtime.workVersionId, objectId, reviewState: "confirmed" })]).then(([object, catalog, library, knowledge, relationRead]) => {
      if (!active) return;
      if (object.type !== "character") { setData((current) => ({ ...current, error: "所选对象不是当前作品中可打开的角色。" })); return; }
      const metadata = catalog.records.find((item) => item.objectId === object.id && item.objectType === "character");
      const categories = new Map(library.folders.filter((folder) => folder.kind === "custom-category").map((folder) => [folder.id, folder.title]));
      const eventIds = new Set([...(object.worldProjection?.timelineParticipations.map((item) => item.eventId) ?? []), ...object.linkedObjects.filter((item) => item.type === "event").map((item) => item.id)]);
      setData((current) => ({ ...current, record: { object, categoryId: metadata?.categoryId ?? null, categoryName: metadata?.categoryId ? categories.get(metadata.categoryId) ?? null : null, trashedAt: metadata?.trashedAt ?? null, trashedFrom: metadata?.trashedFrom ?? null, eventCount: eventIds.size, manualOrder: metadata?.displayOrder ?? null }, knowledge: knowledge.observer.id === object.id ? knowledge : null, relations: relationRead.relations, labels: new Map(library.objects.map((item) => [item.id, item.title])) }));
    }).catch((error: unknown) => { if (active) setData((current) => ({ ...current, error: error instanceof Error ? error.message : "角色资料读取失败。" })); });
    void getCharacterMemoryQuery(projectId, objectId, runtime.workVersionId).then((memoryQuery) => { if (active) setData((current) => ({ ...current, memoryQuery })); }).catch(() => { if (active) setData((current) => ({ ...current, memoryError: "角色记忆记录暂时无法读取；没有把读取失败当成没有经历。" })); });
    return () => { active = false; };
  }, [objectId, runtime.project?.id, runtime.workVersionId]);
  return data;
}

function normalizeKind(value: unknown): QueryKind { return value === "experienced" || value === "witnessed" || value === "informed" || value === "belief" || value === "heard" ? value : "all"; }
function authorProfileValue(object: CharacterDirectoryRecord["object"], key: "character_core" | "boundaries"): string | null { const field = object.profile?.authorConfirmed === true ? object.profile.fields[key] : null; return field?.source === "author" && typeof field.value === "string" ? field.value : null; }
