import type { WorldLibraryBootstrap, StoryUnit } from "../../lib/localTransport";
import type { ProjectDirectoryNode, ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import type { TranslationKey } from "../i18n/translations";

type DirectoryData = { library: WorldLibraryBootstrap; units: readonly StoryUnit[]; workVersionId: string | null; pendingCount: number };
const labels: Record<string, TranslationKey> = { character: "directory.characters", item: "directory.items", location: "directory.locations", faction: "directory.organizations", rule: "directory.rules", event: "directory.storyNodes", thread: "directory.storyLines" };

function reference(object: WorldLibraryBootstrap["objects"][number], projectId: string, workVersionId: string | null): ProjectDirectoryNode {
  return { id: `object:${object.id}`, label: object.title, kind: "reference", aliases: object.aliases,
    reference: { objectId: object.id, version: object.revisionToken, sourceId: object.relativeId || null, projectId, workVersionId, objectType: object.type } };
}
function category(id: string, label: string, children: readonly ProjectDirectoryNode[]): ProjectDirectoryNode { return { id, label, kind: "category", count: children.length, children }; }
function group(id: string, label: string, children: readonly ProjectDirectoryNode[]): ProjectDirectoryNode { return { id, label, kind: "group", count: children.reduce((count, child) => count + (child.count ?? 0), 0), children }; }

/** Builds labels and hierarchy only; all records are passed in from existing read ports. */
export function createProjectDirectoryViewModel(t: (key: TranslationKey) => string, data: DirectoryData): ProjectDirectoryProjection {
  const objects = data.library.objects;
  const objectNodes = (type: string) => objects.filter((item) => item.type === type).map((item) => reference(item, data.library.project.id, data.workVersionId));
  const unitNodes = data.units.map((unit) => ({ id: `unit:${unit.id}`, label: unit.title, kind: "reference" as const,
    reference: { objectId: unit.id, version: unit.version, sourceId: unit.relativeId, projectId: data.library.project.id, workVersionId: data.workVersionId, objectType: "story-unit" } }));
  const groups = [
    group("directory.story", t("directory.story"), [category("directory.story.nodes", t("directory.storyNodes"), objectNodes("event")), category("directory.story.units", t("directory.storyUnits"), unitNodes), category("directory.story.lines", t("directory.storyLines"), objectNodes("thread"))]),
    group("directory.library", t("directory.library"), ["character", "item", "location", "faction"].map((type) => category(`directory.library.${type}`, t(labels[type]), objectNodes(type)))),
    group("directory.settings", t("directory.settings"), [category("directory.settings.rules", t("directory.rules"), objectNodes("rule"))]),
    group("directory.sources", t("directory.sources"), [category("directory.sources.documents", t("directory.sourceDocuments"), [])]),
    group("directory.ideas", t("directory.ideas"), [category("directory.ideas.plot", t("directory.plotIdeas"), [])])
  ];
  return { projectId: data.library.project.id, workVersionId: data.workVersionId, pendingCount: data.pendingCount, classifiedCount: objects.length + data.units.length, groups };
}
function matches(node: ProjectDirectoryNode, query: string): boolean { return [node.label, ...(node.aliases ?? []), node.reference?.objectId ?? "", node.reference?.sourceId ?? ""].join(" ").toLocaleLowerCase().includes(query); }
export function filterProjectDirectory(projection: ProjectDirectoryProjection, query: string): ProjectDirectoryProjection {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return projection;
  const filter = (node: ProjectDirectoryNode): ProjectDirectoryNode | null => { const children = node.children?.map(filter).filter((item): item is ProjectDirectoryNode => Boolean(item)) ?? []; return matches(node, normalized) || children.length ? { ...node, children } : null; };
  return { ...projection, groups: projection.groups.map(filter).filter((item): item is ProjectDirectoryNode => Boolean(item)) };
}
