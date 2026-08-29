import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectDirectoryNode, ProjectDirectoryStableReference } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectDirectoryTree(props: { groups: readonly ProjectDirectoryNode[]; selectedObjectId: string | null; onNavigate(node: ProjectDirectoryNode): void; onOpenReference(reference: ProjectDirectoryStableReference): void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() => new Set(props.groups.map((group) => group.id)));
  useEffect(() => setExpanded((current) => new Set([...current, ...props.groups.map((group) => group.id)])), [props.groups]);
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <nav className="project-directory-tree" aria-label={t("directory.tree")}><div role="tree">
    {props.groups.map((group) => <section key={group.id} role="treeitem" aria-expanded={expanded.has(group.id)}>
      <button type="button" onClick={() => toggle(group.id)}>{expanded.has(group.id) ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}{expanded.has(group.id) ? <FolderOpen aria-hidden="true" /> : <Folder aria-hidden="true" />}<span>{group.label}</span><strong>{group.count}</strong></button>
      {expanded.has(group.id) && <div role="group">{group.children?.map((category) => <div key={category.id} role="treeitem" className="project-directory-category">
        <button type="button" data-directory-node={category.id} onClick={() => props.onNavigate(category)}><span>{category.label}</span><strong>{category.count}</strong></button>
        {category.children?.map((item) => <button key={item.id} type="button" className="project-directory-reference" data-selected={item.reference?.objectId === props.selectedObjectId || undefined} aria-current={item.reference?.objectId === props.selectedObjectId ? "page" : undefined} onClick={() => item.reference && props.onOpenReference(item.reference)}><span>{item.label}</span>{item.reference?.objectId === props.selectedObjectId && <em>{t("directory.current")}</em>}</button>)}
      </div>)}</div>}
    </section>)}</div></nav>;
}
