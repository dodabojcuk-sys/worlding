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

const CATEGORY_ORDER: WorldReferenceCategory[] = ["character", "location", "faction", "item", "rule", "clue"];
const NATURE_ORDER: WorldReferenceNature[] = ["confirmed-fact", "pending-clue", "rumor", "author-note"];
const KNOWLEDGE_LABELS: Record<WorldReferenceKnowledgeState, string> = { known: "已知", unknown: "未知", uncertain: "传闻 · 存疑" };

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
  const visible = useMemo(() => {
    const keyword = search.trim();
    return relatedEntries
      .filter((entry) => category === "all" || entry.category === category)
      .filter((entry) => natures.length === 0 || natures.includes(entry.nature))
      .filter((entry) => !keyword || entry.title.includes(keyword) || entry.tags.some((tag) => tag.includes(keyword)));
  }, [relatedEntries, category, natures, search]);

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
          <small>世界参考 · 当前作品</small>
          <h1>世界参考工作面</h1>
          <p>按类别与信息性质浏览这个世界的关键事实；所有条目都来自既有资料与事件线索，来源可追溯。</p>
        </div>
      </header>
      {error ? <p className="world-reference-message is-error" role="alert"><TriangleAlert size={14} />{error}</p> : null}
      {!objects && !error ? <p className="world-reference-message" role="status"><RefreshCw size={14} />正在读取世界资料……</p> : null}
      {objects ? <>
        {related ? <div className="world-reference-related" data-testid="world-reference-related">
          <span>反查上下文：<strong>{related}</strong> 相关的条目（{relatedEntries.length} 条）</span>
          <button type="button" onClick={() => { setRelatedAndUrl(""); }}><ArrowLeft size={13} />查看全部</button>
        </div> : null}
        <div className="world-reference-filters">
          <div className="world-reference-chiprow" aria-label="类别筛选">
            <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>全部类别</button>
            {CATEGORY_ORDER.map((key) => <button key={key} type="button" className={category === key ? "is-active" : ""} onClick={() => setCategory(key)}>{WORLD_REFERENCE_CATEGORY_LABELS[key]}</button>)}
          </div>
          <div className="world-reference-chiprow" aria-label="信息性质筛选">
            {NATURE_ORDER.map((nature) => <button key={nature} type="button" className={natures.includes(nature) ? "is-active" : ""} aria-pressed={natures.includes(nature)} onClick={() => setNatures((current) => current.includes(nature) ? current.filter((item) => item !== nature) : [...current, nature])}>{WORLD_REFERENCE_NATURE_LABELS[nature]} · {natureCount(nature)}</button>)}
          </div>
          <label className="world-reference-search"><Search size={13} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题或标签…" aria-label="搜索世界资料" /></label>
        </div>
        {visible.length === 0 ? <p className="world-reference-empty">当前筛选下没有世界条目。这个世界的事实会随着资料录入与事件线整理逐步出现在这里。</p> :
          <ul className="world-reference-list">
            {visible.map((entry) => <WorldReferenceCard key={entry.id} entry={entry} onRelated={(value) => setRelatedAndUrl(value)} />)}
          </ul>}
      </> : null}
    </section>
  </main>;
}

function WorldReferenceCard(props: { entry: WorldReferenceEntry; onRelated(title: string): void }) {
  const entry = props.entry;
  return <li className="world-reference-card" data-nature={entry.nature}>
    <header className="world-reference-card-head">
      <span className={`world-reference-nature is-${entry.nature}`}>{WORLD_REFERENCE_NATURE_LABELS[entry.nature]}</span>
      <strong>{entry.title}</strong>
      <span className="world-reference-category">{WORLD_REFERENCE_CATEGORY_LABELS[entry.category]}</span>
    </header>
    {entry.knowledge.length ? <ul className="world-reference-knowledge">
      {entry.knowledge.map((item) => <li key={item.character} data-state={item.state}><span>{item.character}</span><small>{KNOWLEDGE_LABELS[item.state]}</small></li>)}
    </ul> : null}
    {entry.tags.length ? <p className="world-reference-tags">{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</p> : null}
    <footer className="world-reference-card-foot">
      <span>来源：本机工程（markdown）<details><summary>来源标识</summary><code>{entry.id}</code>{entry.updatedAt ? <small> · 更新 {entry.updatedAt}</small> : null}</details></span>
      <button type="button" onClick={() => props.onRelated(entry.title)}><Globe size={13} />查看相关</button>
    </footer>
  </li>;
}
