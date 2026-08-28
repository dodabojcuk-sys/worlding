import type { ProjectDirectoryNode, ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import type { TranslationKey } from "../i18n/translations";

const group = (id: string, label: string, count: number, children: readonly ProjectDirectoryNode[]): ProjectDirectoryNode => ({ id, label, count, kind: "group", children });
const category = (id: string, label: string, count: number): ProjectDirectoryNode => ({ id, label, count, kind: "category" });

export function createProjectDirectoryViewModel(t: (key: TranslationKey) => string): ProjectDirectoryProjection {
  const groups = [
    group("directory.story", t("directory.story"), 9, [
      category("directory.story.nodes", t("directory.storyNodes"), 5),
      category("directory.story.units", t("directory.storyUnits"), 2),
      category("directory.story.lines", t("directory.storyLines"), 2)
    ]),
    group("directory.library", t("directory.library"), 24, [
      category("directory.library.characters", t("directory.characters"), 8),
      category("directory.library.items", t("directory.items"), 6),
      category("directory.library.locations", t("directory.locations"), 5),
      category("directory.library.organizations", t("directory.organizations"), 5)
    ]),
    group("directory.settings", t("directory.settings"), 14, [
      category("directory.settings.rules", t("directory.rules"), 8),
      category("directory.settings.background", t("directory.background"), 6)
    ]),
    group("directory.sources", t("directory.sources"), 6, [
      category("directory.sources.documents", t("directory.sourceDocuments"), 4),
      category("directory.sources.imports", t("directory.imports"), 2)
    ]),
    group("directory.ideas", t("directory.ideas"), 12, [
      category("directory.ideas.plot", t("directory.plotIdeas"), 5),
      category("directory.ideas.inspiration", t("directory.inspiration"), 4),
      category("directory.ideas.notes", t("directory.notes"), 3)
    ])
  ] as const;
  return { pendingCount: 7, classifiedCount: groups.reduce((total, item) => total + (item.count ?? 0), 0), groups };
}

export function filterProjectDirectory(projection: ProjectDirectoryProjection, query: string): ProjectDirectoryProjection {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return projection;
  const groups = projection.groups.flatMap((item) => {
    const children = item.children?.filter((child) => child.label.toLocaleLowerCase().includes(normalized)) ?? [];
    return item.label.toLocaleLowerCase().includes(normalized) || children.length ? [{ ...item, children }] : [];
  });
  return { ...projection, groups };
}
