import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";

import type { ProjectDirectoryNode } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { useI18n } from "../i18n/I18nProvider";

export function ProjectDirectoryTree(props: { groups: readonly ProjectDirectoryNode[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(() => new Set(["directory.library", "directory.story", "directory.ideas"]));
  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <nav className="project-directory-tree" aria-label={t("directory.tree")}>
    {props.groups.map((group) => {
      const open = expanded.has(group.id);
      return <section key={group.id}>
        <button type="button" aria-expanded={open} onClick={() => toggle(group.id)}>
          {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          {open ? <FolderOpen aria-hidden="true" /> : <Folder aria-hidden="true" />}
          <span>{group.label}</span><strong>{group.count}</strong>
        </button>
        {open && <div>{group.children?.map((child) => <button type="button" key={child.id} data-directory-node={child.id}>
          <span>{child.label}</span><strong>{child.count}</strong>
        </button>)}</div>}
      </section>;
    })}
  </nav>;
}
