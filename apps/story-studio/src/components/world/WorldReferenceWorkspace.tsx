import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, BookOpen, GitBranch, Globe, Map as MapIcon, PanelRightOpen, RefreshCw, Search, TriangleAlert } from "lucide-react";

import { getWorldLibrary, readWorldObject, type WorldObject, type WorldObjectSummary } from "../../lib/localTransport";
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
import { projectCausalEvolution, type CausalEvolutionCard } from "../../../../../src/storyContracts/worldCausalEvolution.ts";
import { openEntityDock } from "../entity-dock/entityInspectorDockStore";
import { retrieveHybrid, type HybridRetrievalResult } from "../../../../../src/storyContracts/hybridRetrieval.ts";
import type { SemanticChunk } from "../../../../../src/storyContracts/semanticChunking.ts";

const CATEGORY_ORDER: WorldReferenceCategory[] = ["character", "location", "faction", "item", "rule", "clue"];
const NATURE_ORDER: WorldReferenceNature[] = ["confirmed-fact", "pending-clue", "rumor", "author-note"];
const KNOWLEDGE_LABELS: Record<WorldReferenceKnowledgeState, string> = { known: "已知", unknown: "未知", uncertain: "传闻 · 存疑" };

const isPressureTag = (tag: string) => tag.startsWith("压力") || tag.startsWith("冲突") || tag.includes("未解决");
const tagValue = (tags: readonly string[], prefix: string): string | null => {
  const found = tags.find((tag) => tag.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
};
const tagValues = (tags: readonly string[], prefix: string): string[] => {
  const raw = tagValue(tags, prefix);
  return raw ? raw.split(/[、，,;；]/u).map((part) => part.trim()).filter(Boolean) : [];
};

function readRelated(): string {
  return new URLSearchParams(window.location.search).get("related")?.trim() ?? "";
}

/** 世界观工作台（R4）：默认首屏 = 世界脉搏 + 主/辅工作区；搜索只在输入查询后成为工作面。
 * 全部内容只读投影既有 WorldObject / Event / Relation / 标签，不建立第二事实库、不伪造内容。 */
export function WorldReferenceWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const projectId = props.runtime.project?.id ?? null;
  const [objects, setObjects] = useState<WorldObjectSummary[] | null>(null);
  const [fullObjects, setFullObjects] = useState<Map<string, WorldObject>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [natures, setNatures] = useState<WorldReferenceNature[]>([]);
  const [search, setSearch] = useState("");
  const [related, setRelated] = useState(readRelated);
  const [auxOpen, setAuxOpen] = useState(false);
  const [browseCategory, setBrowseCategory] = useState<WorldReferenceCategory>("rule");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        document.querySelectorAll("details.wb-details[open]").forEach((el) => { (el as HTMLDetailsElement).open = false; });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const [semanticEnabled, setSemanticEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    setObjects(null); setError(null); setFullObjects(new Map());
    if (!projectId) return () => { active = false; };
    void getWorldLibrary(projectId).then(async (library) => {
      if (!active) return;
      setObjects(library.objects);
      const loaded = new Map<string, WorldObject>();
      await Promise.all(library.objects.map(async (summary) => {
        try { loaded.set(summary.id, await readWorldObject(projectId, summary.id)); } catch { /* 正文缺失时按仅有标签投影，不伪造内容 */ }
      }));
      if (active) setFullObjects(loaded);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.message ? reason.message : "世界资料读取失败；现有内容没有被修改。");
    });
    return () => { active = false; };
  }, [projectId]);

  const entries = useMemo(() => projectWorldReferences(objects ?? []), [objects]);
  const relatedEntries = useMemo(() => (related ? worldReferencesRelatedTo(entries, related) : entries), [entries, related]);
  const filtered = useMemo(
    () => relatedEntries.filter((entry) => natures.length === 0 || natures.includes(entry.nature)),
    [relatedEntries, natures],
  );
  const cardOf = useMemo(() => {
    const map = new Map<string, CausalEvolutionCard>();
    for (const entry of entries) {
      const full = fullObjects.get(entry.id);
      if (full?.body) map.set(entry.id, projectCausalEvolution(full));
    }
    return map;
  }, [entries, fullObjects]);

  const bodySummary = (entry: WorldReferenceEntry, lines = 2): string[] => {
    const body = fullObjects.get(entry.id)?.body ?? "";
    const out: string[] = [];
    for (const line of body.split(/\r?\n/u)) {
      const text = line.trim();
      if (!text || text.startsWith("#")) continue;
      out.push(text);
      if (out.length >= lines) break;
    }
    return out;
  };

  // ── 世界脉搏（默认首屏，全部来自既有标签/性质/状态，不生成百分比） ──
  const pulse = useMemo(() => ({
    rules: entries.filter((entry) => entry.category === "rule"),
    pressures: entries.filter((entry) => entry.tags.some(isPressureTag)),
    openQuestions: entries.filter((entry) => entry.nature === "pending-clue" || entry.nature === "rumor"),
    storyLinked: entries.filter((entry) => entry.tags.some((tag) => tag.startsWith("单元") || tag.startsWith("故事线"))),
    worldTime: entries.map((entry) => tagValue(entry.tags, "时间：")).find(Boolean) ?? null,
    units: Array.from(new Set(entries.flatMap((entry) => tagValues(entry.tags, "单元：")))),
  }), [entries]);

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
  const searchChunks = useMemo(() => filtered.map((entry) => ({
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
  } satisfies SemanticChunk)), [filtered]);
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
    if (!searchActive || !retrieval) return [];
    const entryById = new Map(filtered.map((entry) => [entry.id, entry]));
    // 同一 objectId 只出现一次：无论持久索引多区块还是页面级卡片块，都按对象去重。
    const order: string[] = [];
    const seen = new Set<string>();
    for (const hit of retrieval.hits) {
      if (seen.has(hit.chunk.objectId)) continue;
      seen.add(hit.chunk.objectId);
      order.push(hit.chunk.objectId);
    }
    return order.map((objectId) => entryById.get(objectId)).filter((entry): entry is WorldReferenceEntry => Boolean(entry));
  }, [filtered, retrieval, searchActive]);
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

  const openDetail = (entry: WorldReferenceEntry) => openEntityDock({ kind: "world-reference", objectId: entry.id, openedFrom: "world-reference" });
  const natureCount = (nature: WorldReferenceNature) => entries.filter((entry) => entry.nature === nature).length;

  const browseEntries = useMemo(
    () => filtered.filter((entry) => entry.category === browseCategory),
    [filtered, browseCategory],
  );
  const evolutionEntries = useMemo(
    () => filtered.filter((entry) => entry.category === "clue").slice(0, 8),
    [filtered],
  );

  return <main className="shell-workspace shell-workspace-library">
    <section className="materials-workspace world-reference-workspace wb-root" data-testid="world-reference-workspace" data-search-active={searchActive ? "true" : "false"}>
      <MaterialsSectionNavigation current="reference" />
      <header className="wb-header" data-testid="wb-header">
        <div className="wb-header-identity">
          <h1>世界观工作台</h1>
          <div className="wb-header-meta">
            <span>作品 · {props.runtime.project?.title ?? "未打开"}</span>
            <span>故事锚点 · {props.runtime.workVersionLabel ?? "当前主线"}</span>
            {pulse.worldTime ? <span>世界时间 · {pulse.worldTime}</span> : null}
          </div>
        </div>
        <div className="wb-header-actions">
          <label className="wb-search" data-testid="wb-search">
            <Search size={13} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="需要时搜索这个世界……" aria-label="搜索世界资料" />
            {search ? <button type="button" aria-label="清除搜索" onClick={() => setSearch("")}>×</button> : null}
          </label>
          <a className="wb-action" href="/library"><BookOpen size={13} />资料编辑</a>
          <a className="wb-action" href="/library?libraryView=map"><MapIcon size={13} />地图</a>
          <a className="wb-action" href="/library?libraryView=relations"><GitBranch size={13} />关系</a>
          <button type="button" className="wb-action" data-testid="wb-story-toggle" onClick={() => { setAuxOpen(true); document.getElementById("wb-story-context")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><PanelRightOpen size={13} />当前故事关联</button>
        </div>
      </header>
      {error ? <p className="world-reference-message is-error" role="alert"><TriangleAlert size={14} />{error}</p> : null}
      {!objects && !error ? <p className="world-reference-message" role="status"><RefreshCw size={14} />正在读取世界资料……</p> : null}
      {objects && entries.length === 0 ? <p className="world-reference-empty">这个世界还没有世界条目。可以从「资料编辑」导入来源或创建第一个设定，它们会出现在这里。</p> : null}

      {objects && entries.length > 0 && searchActive ? <SearchSurface
        visible={visible} retrieval={retrieval} hitByEntryId={hitByEntryId} excludedSummary={excludedSummary}
        summaryOf={bodySummary} persistedStatus={persistedStatus} semanticEnabled={semanticEnabled}
        onSemanticToggle={setSemanticEnabled} natureCount={natureCount} natures={natures} onNatures={setNatures}
        onOpenDetail={openDetail} onRelated={setRelatedAndUrl} query={query}
      /> : null}

      {objects && entries.length > 0 && !searchActive ? <>
        {related ? <div className="world-reference-related" data-testid="world-reference-related">
          <span>反查上下文：<strong>{related}</strong> 相关的条目（{relatedEntries.length} 条）</span>
          <button type="button" onClick={() => { setRelatedAndUrl(""); }}><ArrowLeft size={13} />查看全部</button>
        </div> : null}
        <div className="wb-columns">
          <div className="wb-main">
            <section className="wb-pulse" data-testid="wb-world-pulse" aria-label="世界脉搏">
              <div className="wb-pulse-block">
                <h3>核心规则</h3>
                <ul>{pulse.rules.length ? pulse.rules.slice(0, 4).map((entry) => <li key={entry.id}>
                  <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                  <small>{entry.status === "active" ? "现行" : "草稿"}{tagValue(entry.tags, "范围：") ? ` · ${tagValue(entry.tags, "范围：")}` : ""}</small>
                </li>) : <li className="wb-empty">尚无规则条目。</li>}</ul>
              </div>
              <div className="wb-pulse-block">
                <h3>当前压力</h3>
                <ul>{pulse.pressures.length ? pulse.pressures.slice(0, 4).map((entry) => <li key={entry.id}>
                  <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                  <small>{entry.tags.filter(isPressureTag).slice(0, 2).join(" · ")}</small>
                </li>) : <li className="wb-empty">暂无标记为压力或冲突的条目。</li>}</ul>
              </div>
              <div className="wb-pulse-block">
                <h3>未决问题</h3>
                <ul>{pulse.openQuestions.length ? pulse.openQuestions.slice(0, 4).map((entry) => <li key={entry.id}>
                  <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                  <small>{WORLD_REFERENCE_NATURE_LABELS[entry.nature]}</small>
                </li>) : <li className="wb-empty">暂无待确认或传闻性质的线索。</li>}</ul>
              </div>
              <div className="wb-pulse-block">
                <h3>当前故事关联</h3>
                <ul>{pulse.storyLinked.length ? pulse.storyLinked.slice(0, 4).map((entry) => <li key={entry.id}>
                  <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                  <small>{tagValues(entry.tags, "单元：").concat(tagValues(entry.tags, "故事线：")).join(" · ") || "—"}</small>
                </li>) : <li className="wb-empty">尚无标记「单元 / 故事线」的条目。</li>}</ul>
              </div>
            </section>

            <section className="wb-section" aria-label="世界系统与因果脉络" data-testid="wb-rules-section">
              <h2>世界系统与因果脉络</h2>
              {pulse.rules.length ? <div className="wb-typed-grid">
                {pulse.rules.map((entry) => <RuleCard key={entry.id} entry={entry} card={cardOf.get(entry.id) ?? null} onOpen={() => openDetail(entry)} />)}
              </div> : <p className="wb-empty">尚无规则条目；在资料编辑中创建带「规则」类型的对象后会出现在这里。</p>}
            </section>

            <section className="wb-section" aria-label="历史与演化" data-testid="wb-evolution-section">
              <h2>历史与演化</h2>
              {evolutionEntries.length ? <ol className="wb-timeline" data-testid="wb-evolution-timeline">
                {evolutionEntries.map((entry) => {
                  const time = tagValue(entry.tags, "时间：");
                  const origin = /起源|确立|建立|成立/u.test(entry.title);
                  return <li key={entry.id} data-origin={origin ? "true" : "false"} data-nature={entry.nature}>
                    <span className="wb-timeline-marker" aria-hidden="true" />
                    <div>
                      <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                      <small>{time ?? "时间未标注"}{entry.nature !== "confirmed-fact" ? ` · ${WORLD_REFERENCE_NATURE_LABELS[entry.nature]}` : ""}</small>
                    </div>
                  </li>;
                })}
              </ol> : <p className="wb-empty">尚无线索类条目；事件线中的事件与线索会按时间标签出现在这条轨迹上。</p>}
            </section>

            <section className="wb-section" aria-label="类型化对象浏览" data-testid="wb-browse-section">
              <h2>对象浏览</h2>
              <div className="wb-details-row">
                <div className="world-reference-chiprow" aria-label="类别浏览" data-testid="wb-browse-categories">
                  {CATEGORY_ORDER.map((key) => {
                    const count = filtered.filter((entry) => entry.category === key).length;
                    return <button key={key} type="button" className={browseCategory === key ? "is-active" : ""} onClick={() => setBrowseCategory(key)}>{WORLD_REFERENCE_CATEGORY_LABELS[key]} · {count}</button>;
                  })}
                </div>
                <details className="wb-details world-reference-filter-popover" data-testid="world-reference-filter-popover">
                  <summary>筛选信息性质{natures.length ? ` · ${natures.length}` : ""}</summary>
                  <div className="wb-details-panel">
                    {NATURE_ORDER.map((nature) => <button key={nature} type="button" className={natures.includes(nature) ? "is-active" : ""} aria-pressed={natures.includes(nature)} onClick={() => setNatures((current) => current.includes(nature) ? current.filter((item) => item !== nature) : [...current, nature])}>{WORLD_REFERENCE_NATURE_LABELS[nature]} · {natureCount(nature)}</button>)}
                  </div>
                </details>
              </div>
              <div className="wb-typed-grid" data-testid="wb-typed-cards">
                {browseEntries.length ? browseEntries.map((entry) => <TypedCard key={entry.id} entry={entry} card={cardOf.get(entry.id) ?? null} onOpen={() => openDetail(entry)} onRelated={setRelatedAndUrl} summaryOf={bodySummary} />) : <p className="wb-empty">该类别下暂无条目。</p>}
              </div>
            </section>
          </div>

          <aside className={`wb-aux${auxOpen ? " is-open" : ""}`} data-testid="wb-aux" aria-label="当前故事上下文">
            <div className="wb-aux-head">
              <h2>当前故事上下文</h2>
              <button type="button" className="wb-aux-close" aria-label="关闭故事上下文" onClick={() => setAuxOpen(false)}>×</button>
            </div>
            <section id="wb-story-context" className="wb-aux-block" data-testid="wb-story-context">
              <h3>故事关联</h3>
              <p><small>当前锚点</small>{props.runtime.workVersionLabel ?? "当前主线"}</p>
              {pulse.units.length ? pulse.units.map((unit) => {
                const unitEntries = pulse.storyLinked.filter((entry) => tagValues(entry.tags, "单元：").includes(unit));
                return <div key={unit} className="wb-unit">
                  <h4>{unit}</h4>
                  <ul>{unitEntries.map((entry) => <li key={entry.id}>
                    <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                    <small>{WORLD_REFERENCE_CATEGORY_LABELS[entry.category]}</small>
                  </li>)}</ul>
                </div>;
              }) : <p className="wb-empty">尚有条目标记「单元」。在资料标签中加入「单元：名称」即可建立关联。</p>}
            </section>
            <section className="wb-aux-block">
              <h3>快捷入口</h3>
              <div className="wb-aux-links">
                <a href="/library?libraryView=map">打开地图</a>
                <a href="/library?libraryView=relations">打开关系</a>
                <a href={`/event-line?projectId=${encodeURIComponent(projectId ?? "")}`}>打开事件线</a>
                <a href="/library">进入资料库</a>
              </div>
            </section>
            <section className="wb-aux-block">
              <h3>未决问题</h3>
              <ul>{pulse.openQuestions.length ? pulse.openQuestions.slice(0, 5).map((entry) => <li key={entry.id}>
                <button type="button" onClick={() => openDetail(entry)}>{entry.title}</button>
                <small>{WORLD_REFERENCE_NATURE_LABELS[entry.nature]}</small>
              </li>) : <li className="wb-empty">暂无未决线索。</li>}</ul>
            </section>
          </aside>
          {auxOpen ? <button type="button" className="wb-aux-scrim" aria-label="关闭故事上下文" onClick={() => setAuxOpen(false)} /> : null}
        </div>
      </> : null}
    </section>
  </main>;
}

/** 搜索工作面（第二状态）：只在有查询时出现；分组 + 摘要 + 为什么命中 + 高级区。 */
function SearchSurface(props: {
  visible: WorldReferenceEntry[];
  retrieval: HybridRetrievalResult | null;
  hitByEntryId: Map<string, { reasons: string[] }>;
  excludedSummary: string | null;
  summaryOf(entry: WorldReferenceEntry, lines?: number): string[];
  persistedStatus: "loading" | "ready" | "fallback";
  semanticEnabled: boolean;
  onSemanticToggle(value: boolean): void;
  natureCount(nature: WorldReferenceNature): number;
  natures: WorldReferenceNature[];
  onNatures(next: WorldReferenceNature[]): void;
  onOpenDetail(entry: WorldReferenceEntry): void;
  onRelated(title: string): void;
  query: string;
}) {
  const buckets: Record<string, WorldReferenceEntry[]> = { "直接依据": [], "因果支持": [], "相关资料": [], "不确定线索": [] };
  for (const entry of props.visible) {
    const reasons = props.hitByEntryId.get(entry.id)?.reasons ?? [];
    let bucket = "不确定线索";
    if (reasons.some((reason) => reason.includes("精确") || reason.includes("关键词"))) bucket = "直接依据";
    else if (entry.category === "rule") bucket = "因果支持";
    else if (entry.category !== "clue") bucket = "相关资料";
    buckets[bucket].push(entry);
  }
  return <div className="wb-search-surface" data-testid="wb-search-surface">
    <div className="wb-search-status">
      <span>搜索「{props.query}」 · {props.retrieval ? `${props.visible.length} 个结果` : "检索中……"}</span>
      <details className="wb-details" data-testid="wb-search-advanced">
        <summary>检索高级</summary>
        <div className="wb-details-panel">
          <label className="world-reference-mode">
            <span>检索模式</span>
            <select value={props.semanticEnabled ? "hybrid" : "keyword"} disabled aria-label="检索模式">
              <option value="keyword">关键词</option>
              <option value="hybrid" disabled>混合（未配置）</option>
            </select>
          </label>
          <span className="world-reference-index-status" data-testid="world-reference-index-status">持久索引：{{ loading: "读取中", ready: "就绪", fallback: "未就绪（已回退页面级检索）" }[props.persistedStatus] ?? props.persistedStatus}</span>
          <div className="world-reference-chiprow">
            {NATURE_ORDER.map((nature) => <button key={nature} type="button" className={props.natures.includes(nature) ? "is-active" : ""} onClick={() => props.onNatures(props.natures.includes(nature) ? props.natures.filter((item) => item !== nature) : [...props.natures, nature])}>{WORLD_REFERENCE_NATURE_LABELS[nature]} · {props.natureCount(nature)}</button>)}
          </div>
        </div>
      </details>
      {props.excludedSummary ? <small className="world-reference-excluded" data-testid="world-reference-excluded">权限与边界排除：{props.excludedSummary}</small> : null}
    </div>
    <div className="world-reference-groups" data-testid="world-reference-groups">
      {(["直接依据", "因果支持", "相关资料", "不确定线索"] as const).map((groupName) => {
        const bucket = buckets[groupName];
        return bucket.length ? <section key={groupName} className="world-reference-group" data-result-group={groupName}>
          <h3>{groupName}（{bucket.length}）</h3>
          <ul className="world-reference-list">
            {bucket.map((entry) => <SearchResultCard key={entry.id} entry={entry} hit={props.hitByEntryId.get(entry.id)} summary={props.summaryOf(entry)} onOpen={() => props.onOpenDetail(entry)} onRelated={() => props.onRelated(entry.title)} />)}
          </ul>
        </section> : null;
      })}
    </div>
    {props.retrieval && props.visible.length === 0 ? <p className="world-reference-empty">没有命中的世界条目；{props.excludedSummary ?? "部分条目可能因权限被排除"}。</p> : null}
  </div>;
}

function SearchResultCard(props: { entry: WorldReferenceEntry; hit?: { reasons: string[] }; summary: string[]; onOpen(): void; onRelated(): void }) {
  const entry = props.entry;
  return <li className="world-reference-card is-clickable" data-nature={entry.nature} data-object-id={entry.id} data-testid="world-reference-card">
    <header className="world-reference-card-head" onClick={props.onOpen} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onOpen(); } }}>
      <span className={`world-reference-nature is-${entry.nature}`}>{WORLD_REFERENCE_NATURE_LABELS[entry.nature]}</span>
      <strong>{entry.title}</strong>
      <span className={`world-reference-category is-${entry.category}`}>{WORLD_REFERENCE_CATEGORY_LABELS[entry.category]}</span>
    </header>
    {props.hit ? <p className="world-reference-why" data-testid="world-reference-why">为什么命中：{props.hit.reasons.join(" · ")}</p> : null}
    {props.summary.length ? <p className="world-reference-summary">{props.summary.map((line, index) => <span key={index}>{line}</span>)}</p> : <p className="world-reference-summary">该条目尚未记录正文。</p>}
    <footer className="world-reference-card-foot">
      <span>来源：本机工程（markdown）</span>
      <span className="world-reference-card-actions">
        <button type="button" onClick={props.onOpen}>打开详情</button>
        <button type="button" onClick={props.onRelated}><Globe size={13} />查看相关</button>
      </span>
    </footer>
  </li>;
}

const Field = (props: { label: string; value: string | null; href?: string }) => props.value || props.href ? <p className="wb-field"><small>{props.label}</small>{props.href ? <a href={props.href}>{props.value ?? props.label}</a> : <span>{props.value}</span>}</p> : null;

/** 类型化卡片：按类别给出不同的信息骨架（不是只换徽标）。 */
function TypedCard(props: { entry: WorldReferenceEntry; card: CausalEvolutionCard | null; onOpen(): void; onRelated(title: string): void; summaryOf(entry: WorldReferenceEntry, lines?: number): string[] }) {
  const { entry } = props;
  if (entry.category === "location") return <LocationCard entry={entry} card={props.card} onOpen={props.onOpen} />;
  if (entry.category === "rule") return <RuleCard entry={entry} card={props.card} onOpen={props.onOpen} />;
  if (entry.category === "faction") return <FactionCard entry={entry} card={props.card} onOpen={props.onOpen} />;
  if (entry.category === "item") return <ItemCard entry={entry} card={props.card} onOpen={props.onOpen} />;
  if (entry.category === "clue") return <ClueCard entry={entry} onOpen={props.onOpen} />;
  return <CharacterCard entry={entry} summary={props.summaryOf(entry, 1)} onOpen={props.onOpen} />;
}

function CardShell(props: { entry: WorldReferenceEntry; title: ReactNode; onOpen(): void; children: ReactNode; foot?: ReactNode }) {
  return <article className={`wb-card wb-card-${props.entry.category}`} data-testid="wb-typed-card" data-category={props.entry.category} data-nature={props.entry.nature} data-object-id={props.entry.id}>
    <header onClick={props.onOpen} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onOpen(); } }}>
      <strong>{props.title}</strong>
      <span className="wb-card-kind">{WORLD_REFERENCE_CATEGORY_LABELS[props.entry.category]}</span>
    </header>
    {props.children}
    {props.foot}
  </article>;
}

function LocationCard(props: { entry: WorldReferenceEntry; card: CausalEvolutionCard | null; onOpen(): void }) {
  const entry = props.entry;
  const zones = entry.tags.filter((tag) => !tag.includes("：") && !tag.includes(":")).slice(0, 3);
  const events = entry.relatedKeys.slice(1, 4);
  return <CardShell entry={entry} title={entry.title} onOpen={props.onOpen}
    foot={<Field label="地图" value="在地图中查看" href="/library?libraryView=map" />}>
    <Field label="区域 / 空间" value={zones.length ? zones.join(" · ") : tagValue(entry.tags, "区域：")} />
    <Field label="当前状态" value={entry.status === "active" ? "已确认（现行）" : "草稿候选"} />
    <Field label="发生过的事件" value={events.length ? events.join(" · ") : "暂无关联事件"} />
  </CardShell>;
}

function RuleCard(props: { entry: WorldReferenceEntry; card: CausalEvolutionCard | null; onOpen(): void }) {
  const entry = props.entry;
  const card = props.card;
  return <CardShell entry={entry} title={entry.title} onOpen={props.onOpen}
    foot={<Field label="当前是否生效" value={entry.status === "active" ? "生效中" : "未生效（草稿）"} />}>
    <Field label="适用范围" value={tagValue(entry.tags, "范围：") ?? card?.scope.text ?? (tagValues(entry.tags, "单元：").join(" · ") || null)} />
    <Field label="机制" value={card?.mechanism.text ?? null} />
    <Field label="代价" value={card?.interests.text ?? null} />
    <Field label="例外" value={card?.variants.text ?? (card?.dimensions.bounds?.join(" · ") ?? null)} />
  </CardShell>;
}

function FactionCard(props: { entry: WorldReferenceEntry; card: CausalEvolutionCard | null; onOpen(): void }) {
  const entry = props.entry;
  const relations = entry.relatedKeys.slice(1, 4);
  const pressures = entry.tags.filter(isPressureTag);
  return <CardShell entry={entry} title={entry.title} onOpen={props.onOpen}>
    <Field label="目标" value={props.card?.definition.text ?? null} />
    <Field label="资源或影响" value={props.card?.mechanism.text ?? null} />
    <Field label="关键关系" value={relations.length ? relations.join(" · ") : "暂无记录"} />
    <Field label="当前压力" value={pressures.length ? pressures.join(" · ") : "尚未记录"} />
  </CardShell>;
}

function ItemCard(props: { entry: WorldReferenceEntry; card: CausalEvolutionCard | null; onOpen(): void }) {
  const entry = props.entry;
  const holder = tagValue(entry.tags, "持有人：") ?? tagValue(entry.tags, "持有：");
  const place = tagValue(entry.tags, "地点：") ?? tagValue(entry.tags, "所在地：");
  const transfers = entry.relatedKeys.slice(1, 4);
  return <CardShell entry={entry} title={entry.title} onOpen={props.onOpen}>
    <Field label="持有人" value={holder} />
    <Field label="所在地" value={place} />
    <Field label="当前状态" value={entry.status === "active" ? "已确认（现行）" : "草稿候选"} />
    <Field label="关键转移事件" value={transfers.length ? transfers.join(" · ") : "暂无转移记录"} />
  </CardShell>;
}

function ClueCard(props: { entry: WorldReferenceEntry; onOpen(): void }) {
  const entry = props.entry;
  const informants = entry.knowledge.map((item) => `${item.character}（${KNOWLEDGE_LABELS[item.state]}）`);
  const events = entry.relatedKeys.slice(1, 4);
  return <CardShell entry={entry} title={entry.title} onOpen={props.onOpen}>
    <Field label="确定性" value={WORLD_REFERENCE_NATURE_LABELS[entry.nature]} />
    <Field label="知情角色" value={informants.length ? informants.join(" · ") : "暂无知情记录"} />
    <Field label="关联事件" value={events.length ? events.join(" · ") : "暂无关联"} />
    <Field label="时间状态" value={tagValue(entry.tags, "时间：") ?? "时间未标注"} />
  </CardShell>;
}

function CharacterCard(props: { entry: WorldReferenceEntry; summary: string[]; onOpen(): void }) {
  return <CardShell entry={props.entry} title={props.entry.title} onOpen={props.onOpen}>
    <Field label="身份" value={props.entry.status === "active" ? "已确认" : "草稿候选"} />
    <Field label="摘要" value={props.summary[0] ?? null} />
  </CardShell>;
}
