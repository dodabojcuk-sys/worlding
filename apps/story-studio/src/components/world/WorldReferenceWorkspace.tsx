import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Globe, RefreshCw, Search, TriangleAlert } from "lucide-react";

import { getWorldLibrary, type WorldObjectSummary } from "../../lib/localTransport";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { MaterialsSectionNavigation } from "./MaterialsSectionNavigation";
import {
  WORLD_REFERENCE_CATEGORY_LABELS,
  WORLD_REFERENCE_NATURE_LABELS,
  projectWorldReferences,
  worldReferencesRelatedTo,
  type WorldReferenceCategory,
  type WorldReferenceEntry,
  type WorldReferenceKnowledgeState,
  type WorldReferenceNature,
} from "../../../../../src/storyContracts/worldReferenceProjection";
import { openEntityDock } from "../entity-dock/entityInspectorDockStore";
import { retrieveHybrid, type HybridRetrievalResult } from "../../../../../src/storyContracts/hybridRetrieval.ts";
import type { SemanticChunk } from "../../../../../src/storyContracts/semanticChunking.ts";

const CATEGORY_ORDER: WorldReferenceCategory[] = ["character", "location", "faction", "item", "rule", "clue"];
const NATURE_ORDER: WorldReferenceNature[] = ["confirmed-fact", "pending-clue", "rumor", "author-note"];
const KNOWLEDGE_LABELS: Record<WorldReferenceKnowledgeState, string> = { known: "已知", unknown: "未知", uncertain: "传闻 · 存疑" };

/** 世界构建视角（R2）：资料二级导航内的投影行——只改筛选，不复制对象。 */
const WORLD_BUILDING_FACETS: ReadonlyArray<{ label: string; category: WorldReferenceCategory | "all" }> = [
  { label: "世界总览", category: "all" },
  { label: "系统与规则", category: "rule" },
  { label: "空间与生态", category: "location" },
  { label: "历史与演化", category: "clue" },
  { label: "社会与组织", category: "faction" },
  { label: "日常生活", category: "item" },
  { label: "当前故事关联", category: "clue" },
];

function readRelated(): string {
  return new URLSearchParams(window.location.search).get("related")?.trim() ?? "";
}

/** 世界参考工作面（R1）：按「类别 × 信息性质」浏览既有世界事实，
 * 支持当前场景/角色反查；只读组合既有 world-library，不建立第二事实库。 */
export function WorldReferenceWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [objects, setObjects] = useState<WorldObjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<WorldReferenceCategory | "all">("all");
  const [natures, setNatures] = useState<WorldReferenceNature[]>([]);
  const [search, setSearch] = useState("");
  const [related, setRelated] = useState(readRelated);
  const [buildingFacet, setBuildingFacet] = useState("世界总览");
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        document.querySelectorAll(".world-reference-filter-popover[open], .world-reference-filter-popover[open]").forEach((el) => { (el as HTMLDetailsElement).open = false; });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [semanticEnabled, setSemanticEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    setObjects(null); setError(null);
    if (!projectId) return () => { active = false; };
    void getWorldLibrary(projectId).then((library) => {
      if (active) setObjects(library.objects);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.message ? reason.message : "世界资料读取失败；现有内容没有被修改。");
    });
    return () => { active = false; };
  }, [projectId]);

  const entries = useMemo(() => projectWorldReferences(objects ?? []), [objects]);
  const relatedEntries = useMemo(() => (related ? worldReferencesRelatedTo(entries, related) : entries), [entries, related]);
  const baseVisible = useMemo(() => {
    return relatedEntries
      .filter((entry) => category === "all" || entry.category === category)
      .filter((entry) => natures.length === 0 || natures.includes(entry.nature));
  }, [relatedEntries, category, natures]);

  const query = search.trim();
  const searchActive = query.length > 0;
  // 持久派生索引接线（R3.1）：优先消费服务端持久索引；缺失/损坏时诚实回退页面级检索。
  const [persistedStatus, setPersistedStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [persistedChunks, setPersistedChunks] = useState<SemanticChunk[]>([]);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setPersistedStatus("loading");
    void (async () => {
      try {
        let res = await fetch(`/__local/story-studio/semantic-index?projectId=${encodeURIComponent(projectId)}&workVersionId=${encodeURIComponent(props.runtime.workVersionId || "当前主线")}&branchId=${encodeURIComponent("当前主线")}`);
        let json = await res.json().catch(() => null);
        if (json?.data?.status === "missing") {
          await fetch(`/__local/story-studio/semantic-index/rebuild`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, workVersionId: props.runtime.workVersionId || "当前主线", branchId: "当前主线", generation: "none-v0" }) });
          res = await fetch(`/__local/story-studio/semantic-index?projectId=${encodeURIComponent(projectId)}&workVersionId=${encodeURIComponent(props.runtime.workVersionId || "当前主线")}&branchId=${encodeURIComponent("当前主线")}`);
          json = await res.json().catch(() => null);
        }
        if (!active) return;
        if (json?.data?.status === "ready" && json.data.entries) {
          const chunks: SemanticChunk[] = Object.values(json.data.entries).map((entry: any) => ({
            objectId: entry.objectId,
            sectionId: entry.sectionId,
            title: entry.title,
            objectType: entry.objectType,
            authority: entry.authority,
            informationNature: entry.informationNature,
            knownTo: entry.visibility?.knownTo ?? [],
            unknownTo: entry.visibility?.unknownTo ?? [],
            lexicalText: entry.lexicalText,
            sourceRefs: [entry.sectionId],
          }));
          setPersistedChunks(chunks);
          setPersistedStatus("ready");
        } else {
          setPersistedStatus("fallback");
        }
      } catch {
        if (active) setPersistedStatus("fallback");
      }
    })();
    return () => { active = false; };
  }, [projectId]);
  const searchChunks = useMemo(() => baseVisible.map((entry) => ({
    objectId: entry.id,
    sectionId: `${entry.id}#card`,
    title: entry.title,
    objectType: entry.category,
    authority: entry.status === "active" ? "author" as const : "candidate" as const,
    informationNature: entry.nature,
    knownTo: entry.knowledge.filter((item) => item.state === "known").map((item) => item.character),
    unknownTo: entry.knowledge.filter((item) => item.state !== "known").map((item) => item.character),
    lexicalText: [entry.title, ...entry.tags, ...entry.knowledge.map((item) => `${item.character}${KNOWLEDGE_LABELS[item.state]}`)].join(" "),
    sourceRefs: [entry.id],
  } satisfies SemanticChunk)), [baseVisible]);
  // 持久索引就绪时优先消费结构化区块（definition/origin/mechanism 等）；
  // 未就绪时回退页面级卡片块（诚实显示回退状态）。
  const retrievalChunks = useMemo(() => (persistedStatus === "ready" && persistedChunks.length ? persistedChunks : searchChunks), [persistedStatus, persistedChunks, searchChunks]);
  const [retrieval, setRetrieval] = useState<HybridRetrievalResult | null>(null);
  useEffect(() => {
    if (!searchActive) { setRetrieval(null); return; }
    let active = true;
    void retrieveHybrid({ query, chunks: retrievalChunks, topK: 12, tokenBudget: 2000, semanticEnabled }).then((result) => {
      if (active) setRetrieval(result);
    });
    return () => { active = false; };
  }, [query, retrievalChunks, semanticEnabled, searchActive]);

  const visible = useMemo(() => {
    if (!searchActive) return baseVisible;
    if (!retrieval) return [];
    if (persistedStatus === "ready") {
      // 持久索引模式：同一 object 的多 section 聚合为一张结果卡
      const order: string[] = [];
      const byObject = new Map<string, { reasons: string[]; sections: string[] }>();
      for (const hit of retrieval.hits) {
        const objectId = hit.chunk.objectId;
        if (!byObject.has(objectId)) { byObject.set(objectId, { reasons: hit.reasons.slice(0, 3), sections: [] }); order.push(objectId); }
        byObject.get(objectId)!.sections.push(hit.chunk.sectionId);
      }
      const entryById = new Map(baseVisible.map((entry) => [entry.id, entry]));
      return order.map((objectId) => entryById.get(objectId)).filter((entry): entry is WorldReferenceEntry => Boolean(entry));
    }
    const entryById = new Map(baseVisible.map((entry) => [entry.id, entry]));
    return retrieval.hits.map((hit) => entryById.get(hit.chunk.objectId)).filter((entry): entry is WorldReferenceEntry => Boolean(entry));
  }, [baseVisible, retrieval, searchActive, persistedStatus]);
  const hitByEntryId = useMemo(() => new Map((retrieval?.hits ?? []).map((hit) => [hit.chunk.objectId, hit])), [retrieval]);
  const excludedSummary = useMemo(() => {
    if (!searchActive || !retrieval) return null;
    const byReason = new Map<string, number>();
    for (const item of retrieval.excluded) byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
    return Array.from(byReason.entries()).map(([reason, count]) => `${reason} ${count} 条`).join(" · ");
  }, [retrieval, searchActive]);

  const setRelatedAndUrl = (value: string) => {
    setRelated(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("related", value);
    else url.searchParams.delete("related");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  };

  const natureCount = (nature: WorldReferenceNature) => entries.filter((entry) => entry.nature === nature).length;

  return <main className="shell-workspace shell-workspace-library">
    <section className="materials-workspace world-reference-workspace" data-testid="world-reference-workspace">
      <MaterialsSectionNavigation current="reference" />
      <header className="materials-workspace-header">
        <div className="materials-workspace-identity">
          <small>世界观 · 当前作品</small>
          <h1>世界观工作台</h1>
          <p>浏览、追溯和完善这个世界的关键设定与事实。</p>
        </div>
      </header>
      {error ? <p className="world-reference-message is-error" role="alert"><TriangleAlert size={14} />{error}</p> : null}
      {!objects && !error ? <p className="world-reference-message" role="status"><RefreshCw size={14} />正在读取世界资料……</p> : null}
      {objects ? <>
        <div className="world-reference-chiprow" aria-label="世界构建视角" data-testid="world-building-facets">
          {WORLD_BUILDING_FACETS.map((facet) => <button key={facet.label} type="button" className={facet.label === buildingFacet ? "is-active" : ""} onClick={() => { setBuildingFacet(facet.label); setCategory(facet.category); }}>{facet.label}</button>)}
        </div>
        {related ? <div className="world-reference-related" data-testid="world-reference-related">
          <span>反查上下文：<strong>{related}</strong> 相关的条目（{relatedEntries.length} 条）</span>
          <button type="button" onClick={() => { setRelatedAndUrl(""); }}><ArrowLeft size={13} />查看全部</button>
        </div> : null}
        <div className="world-reference-toolbar">
          <label className="world-reference-search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索这个世界……（支持自然语言问题）" aria-label="搜索世界资料" /></label>
          <details className="world-reference-filter-popover" data-testid="world-reference-filter-popover">
            <summary>筛选 {category !== "all" || natures.length ? `· ${natures.length + (category !== "all" ? 1 : 0)}` : ""}</summary>
            <div className="world-reference-filter-panel">
              <div className="world-reference-chiprow" aria-label="类别筛选">
                <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>全部类别</button>
                {CATEGORY_ORDER.map((key) => <button key={key} type="button" className={category === key ? "is-active" : ""} onClick={() => setCategory(key)}>{WORLD_REFERENCE_CATEGORY_LABELS[key]}</button>)}
              </div>
              <div className="world-reference-chiprow" aria-label="信息性质筛选">
                {NATURE_ORDER.map((nature) => <button key={nature} type="button" className={natures.includes(nature) ? "is-active" : ""} aria-pressed={natures.includes(nature)} onClick={() => setNatures((current) => current.includes(nature) ? current.filter((item) => item !== nature) : [...current, nature])}>{WORLD_REFERENCE_NATURE_LABELS[nature]} · {natureCount(nature)}</button>)}
              </div>
            </div>
          </details>
          <label className="world-reference-mode" data-testid="world-reference-mode">
            <span>检索模式</span>
            <select value={semanticEnabled ? "hybrid" : "keyword"} disabled aria-label="检索模式">
              <option value="keyword">关键词</option>
              <option value="hybrid" disabled>混合（未配置）</option>
            </select>
            <small>语义索引未配置 · </small><a href="/settings">前往设置</a>
          </label>
          <span className="world-reference-index-status" data-testid="world-reference-index-status">持久索引：{{ loading: "读取中", ready: "就绪", fallback: "未就绪（已回退页面级检索）" }[persistedStatus] ?? persistedStatus}</span>
          {excludedSummary ? <span className="world-reference-excluded" data-testid="world-reference-excluded">权限与边界排除：{excludedSummary}</span> : null}
        </div>
        {!searchActive && visible.length === 0 ? <p className="world-reference-empty">当前筛选下没有世界条目。这个世界的事实会随着资料录入与事件线整理逐步出现在这里。</p> :
          searchActive ? (() => {
            const buckets: Record<string, WorldReferenceEntry[]> = { "直接依据": [], "因果支持": [], "相关资料": [], "不确定线索": [] };
            for (const entry of visible) {
              const reasons = hitByEntryId.get(entry.id)?.reasons ?? [];
              let bucket = "不确定线索";
              if (reasons.some((reason) => reason.includes("精确") || reason.includes("关键词"))) bucket = "直接依据";
              else if (entry.category === "rule") bucket = "因果支持";
              else if (entry.category !== "clue") bucket = "相关资料";
              buckets[bucket].push(entry);
            }
            return <div className="world-reference-groups" data-testid="world-reference-groups">
              {(["直接依据", "因果支持", "相关资料", "不确定线索"] as const).map((groupName) => {
                const bucket = buckets[groupName];
                return bucket.length ? <section key={groupName} className="world-reference-group" data-result-group={groupName}>
                  <h3>{groupName}（{bucket.length}）</h3>
                  <ul className="world-reference-list">
                    {bucket.map((entry) => <WorldReferenceCard key={entry.id} entry={entry} hit={hitByEntryId.get(entry.id)} onRelated={(value) => setRelatedAndUrl(value)} onOpenDetail={() => openEntityDock({ kind: "world-reference", objectId: entry.id, openedFrom: "world-reference" })} />)}
                  </ul>
                </section> : null;
              })}
            </div>;
          })() : null}
        {!searchActive && visible.length > 0 ? <ul className="world-reference-list">
          {visible.map((entry) => <WorldReferenceCard key={entry.id} entry={entry} onRelated={(value) => setRelatedAndUrl(value)} onOpenDetail={() => openEntityDock({ kind: "world-reference", objectId: entry.id, openedFrom: "world-reference" })} />)}
        </ul> : null}
        {searchActive && visible.length === 0 && retrieval ? <p className="world-reference-empty">没有命中的世界条目；{excludedSummary ?? "部分条目可能因权限被排除"}。</p> : null}
      </> : null}
    </section>
  </main>;
}

function WorldReferenceCard(props: { entry: WorldReferenceEntry; hit?: { reasons: string[] }; onRelated(title: string): void; onOpenDetail(): void }) {
  const entry = props.entry;
  const pressureCount = entry.tags.filter((tag) => tag.startsWith("压力") || tag.startsWith("冲突")).length;
  const relatedCount = Math.max(0, entry.relatedKeys.length - 1);
  const open = () => props.onOpenDetail();
  return <li className="world-reference-card is-clickable" data-nature={entry.nature} data-object-id={entry.id} data-testid="world-reference-card">
    <header className="world-reference-card-head" onClick={open} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }}>
      <span className={`world-reference-nature is-${entry.nature}`}>{WORLD_REFERENCE_NATURE_LABELS[entry.nature]}</span>
      <strong>{entry.title}</strong>
      <span className="world-reference-category">{WORLD_REFERENCE_CATEGORY_LABELS[entry.category]}</span>
    </header>
    {props.hit ? <p className="world-reference-why" data-testid="world-reference-why">为什么命中：{props.hit.reasons.join(" · ")}</p> : null}
    <p className="world-reference-summary">{entry.status === "active" ? "已确认" : "草稿"}{pressureCount ? ` · ${pressureCount} 项压力记录` : ""}{relatedCount ? ` · 关联 ${relatedCount} 个对象` : ""} · 来源 1 项（本机工程）</p>
    {entry.knowledge.length ? <ul className="world-reference-knowledge">
      {entry.knowledge.map((item) => <li key={item.character} data-state={item.state}><span>{item.character}</span><small>{KNOWLEDGE_LABELS[item.state]}</small></li>)}
    </ul> : null}
    {entry.tags.length ? <p className="world-reference-tags">{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</p> : null}
    <footer className="world-reference-card-foot">
      <span>来源：本机工程（markdown）<details><summary>来源标识</summary><code>{entry.id}</code>{entry.updatedAt ? <small> · 更新 {entry.updatedAt}</small> : null}</details></span>
      <span className="world-reference-card-actions">
        <button type="button" onClick={() => props.onRelated(entry.title)}><Globe size={13} />查看相关</button>
      </span>
    </footer>
  </li>;
}
