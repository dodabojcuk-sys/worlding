import { ArrowLeft, ChevronRight, Folder, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { useI18n } from "../i18n/I18nProvider";
import { flattenDirectoryReferences } from "./projectDirectoryViewModel";

export function ProjectDirectoryTree(props: { groups: readonly ProjectDirectoryNode[]; selectedObjectId: string | null; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void }) {
  const { t } = useI18n();
  const [path, setPath] = useState<readonly string[]>([]);
  const [query, setQuery] = useState("");
  const trail = useMemo(() => resolveDirectoryTrail(props.groups, path), [path, props.groups]);
  const current = trail.at(-1) ?? null;
  const visible = current?.children ?? props.groups;
  const searchResults = useMemo(() => query.trim() ? flattenDirectoryReferences(props.groups).filter((item) => item.searchText.includes(query.trim().toLocaleLowerCase())) : [], [props.groups, query]);
  useEffect(() => {
    if (trail.length !== path.length) setPath(trail.map((item) => item.id));
  }, [path, trail]);
  const enter = (node: ProjectDirectoryNode) => {
    if (node.reference) { props.onOpenReference(node.reference); return; }
    if (!node.children) return;
    setPath([...trail.map((item) => item.id), node.id]);
    props.onNavigate(node);
  };
  const goBack = () => {
    const focusId = path.at(-1) ?? null;
    setPath(path.slice(0, -1));
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-directory-node="${CSS.escape(focusId ?? "")}"]`)?.focus());
  };
  return <nav className="project-directory-tree" aria-label={t("directory.tree")} onKeyDown={(event) => {
    if ((event.altKey && event.key === "ArrowLeft") || (event.key === "Escape" && !query && path.length)) { event.preventDefault(); goBack(); }
  }}>
    <label className="project-directory-search"><Search aria-hidden="true" /><span className="sr-only">{t("directory.search")}</span><input type="search" value={query} placeholder={t("directory.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} /></label>
    {!query && <div className="project-directory-breadcrumb" aria-label={t("directory.breadcrumb")}>
      {path.length > 0 && <button type="button" className="project-directory-back" aria-label={t("directory.back")} onClick={goBack}><ArrowLeft aria-hidden="true" /></button>}
      <button type="button" onClick={() => setPath([])}>{t("directory.label")}</button>{trail.map((node, index) => <span key={node.id}><ChevronRight aria-hidden="true" /><button type="button" aria-current={index === trail.length - 1 ? "page" : undefined} onClick={() => setPath(trail.slice(0, index + 1).map((item) => item.id))}>{node.label}</button></span>)}
    </div>}
    {query ? <div className="project-directory-search-results" aria-live="polite"><p>{t("directory.searchResults")} · {searchResults.length}</p>{searchResults.map((result) => <button key={result.node.id} type="button" className="project-directory-reference" onClick={() => { setQuery(""); setPath(result.path.slice(0, -1).map((item) => item.id)); result.node.reference && props.onOpenReference(result.node.reference); }}><span>{result.node.label}<small>{result.path.map((item) => item.label).join(" / ")}</small></span></button>)}{!searchResults.length && <p>{t("directory.empty")}</p>}</div> : <div role="list" className="project-directory-page" data-directory-depth={path.length}>
      {visible.map((node) => <button key={node.id} type="button" role="listitem" className={node.reference ? "project-directory-reference" : "project-directory-entry"} data-directory-node={node.id} data-selected={node.reference?.objectId === props.selectedObjectId || undefined} aria-current={node.reference?.objectId === props.selectedObjectId ? "page" : undefined} aria-label={`${node.label}${node.count === undefined ? "" : `，${node.count}`}`} onClick={() => enter(node)}>{!node.reference && <Folder aria-hidden="true" />}<span title={node.label}>{node.label}</span>{node.reference?.objectId === props.selectedObjectId ? <em>{t("directory.current")}</em> : node.count !== undefined ? <strong>{node.count}</strong> : null}{!node.reference && <ChevronRight aria-hidden="true" />}</button>)}
    </div>}
  </nav>;
}

function resolveDirectoryTrail(groups: readonly ProjectDirectoryNode[], path: readonly string[]): ProjectDirectoryNode[] {
  const trail: ProjectDirectoryNode[] = [];
  let nodes = groups;
  for (const id of path) {
    const node = nodes.find((item) => item.id === id);
    if (!node) break;
    trail.push(node);
    nodes = node.children ?? [];
  }
  return trail;
}
