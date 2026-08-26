import { BookMarked, Boxes, ChevronDown, CircleDot, Folder, Lightbulb, MapPin, Package, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

export type AuthorContextTarget =
  | "character" | "item" | "location" | "custom-material"
  | "node" | "beat" | "unit" | "event-line"
  | "worldview" | "background" | "setting" | "custom-setting"
  | "idea" | "foreshadow" | "inspiration" | "custom-other";

export type AuthorContextCounts = Partial<Record<AuthorContextTarget, number>>;

const GROUPS: Array<{
  id: string;
  label: string;
  items: Array<{ id: AuthorContextTarget; label: string; detail?: string; Icon: typeof UserRound }>;
}> = [
  { id: "materials", label: "资料库", items: [
    { id: "character", label: "角色", Icon: UserRound },
    { id: "item", label: "物品", Icon: Package },
    { id: "location", label: "地点", Icon: MapPin },
    { id: "custom-material", label: "自定义分类", Icon: Folder }
  ] },
  { id: "plot", label: "剧情库", items: [
    { id: "node", label: "节点", detail: "Node", Icon: CircleDot },
    { id: "beat", label: "情节点", detail: "Beat", Icon: BookMarked },
    { id: "unit", label: "单元", detail: "Unit", Icon: Boxes },
    { id: "event-line", label: "其他事件线", Icon: Sparkles }
  ] },
  { id: "setting", label: "设定库", items: [
    { id: "worldview", label: "世界观", Icon: MapPin },
    { id: "background", label: "故事背景", Icon: BookMarked },
    { id: "setting", label: "设定", Icon: Boxes },
    { id: "custom-setting", label: "自定义分类", Icon: Folder }
  ] },
  { id: "other", label: "其他", items: [
    { id: "idea", label: "创意", detail: "可进入提案或任务", Icon: Lightbulb },
    { id: "foreshadow", label: "伏笔", detail: "埋设 · 待回收 · 已回收", Icon: BookMarked },
    { id: "inspiration", label: "灵感", detail: "尚未结构化", Icon: Sparkles },
    { id: "custom-other", label: "自定义分类", Icon: Folder }
  ] }
];

/** Shared, read-only taxonomy projection. Content writes remain in current domain owners. */
export function AuthorLibraryHierarchy(props: {
  counts?: AuthorContextCounts;
  query?: string;
  onQuery?(value: string): void;
  onSelect?(target: AuthorContextTarget): void;
  compact?: boolean;
}) {
  const [internalQuery, setInternalQuery] = useState("");
  const query = props.query ?? internalQuery;
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const groups = useMemo(() => GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !normalized || `${group.label}${item.label}${item.detail || ""}`.toLocaleLowerCase("zh-CN").includes(normalized))
  })).filter((group) => group.items.length), [normalized]);
  const changeQuery = (value: string) => props.onQuery ? props.onQuery(value) : setInternalQuery(value);

  return <section className={`author-library-hierarchy ${props.compact ? "is-compact" : ""}`} data-testid="author-library-hierarchy">
    {!props.compact && <label className="author-context-search"><span className="sr-only">搜索作者上下文</span><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="搜索资料、情节或设定" /></label>}
    {groups.map((group) => <details open key={group.id} className="author-context-group">
      <summary><ChevronDown aria-hidden="true" /><strong>{group.label}</strong></summary>
      <div>{group.items.map((item) => { const Icon = item.Icon; const count = props.counts?.[item.id]; return <button type="button" key={item.id} onClick={() => props.onSelect?.(item.id)} data-context-target={item.id}><Icon aria-hidden="true" /><span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>{typeof count === "number" && <b>{count}</b>}</button>; })}</div>
    </details>)}
    {!groups.length && <p className="author-context-empty">没有匹配的上下文</p>}
  </section>;
}

