import type { SourceImportDocumentR0, WorldLibraryBootstrap, StoryUnit } from "../../lib/localTransport";
import type { ProjectDirectoryNode, ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import type { TranslationKey } from "../i18n/translations";

type DirectoryData = { library: WorldLibraryBootstrap; units: readonly StoryUnit[]; sources: readonly SourceImportDocumentR0[]; workVersionId: string | null; pendingCount: number };

function reference(object: WorldLibraryBootstrap["objects"][number], projectId: string, workVersionId: string | null): ProjectDirectoryNode {
  return { id: `object:${object.id}`, label: object.title, kind: "reference", aliases: object.aliases,
    reference: { objectId: object.id, version: object.revisionToken, sourceId: object.relativeId || null, projectId, workVersionId, objectType: object.type } };
}
function category(id: string, label: string, children: readonly ProjectDirectoryNode[]): ProjectDirectoryNode { return { id, label, kind: "category", count: children.length, children }; }
function group(id: string, label: string, children: readonly ProjectDirectoryNode[]): ProjectDirectoryNode { return { id, label, kind: "group", count: children.reduce((count, child) => count + (child.count ?? 0), 0), children }; }

/**
 * The classified tree is product information architecture, not project data.
 * A project projection only fills this shell with counts and stable references.
 */
export function createDirectoryShellDescriptor(t: (key: TranslationKey) => string, input: {
  storyNodes?: readonly ProjectDirectoryNode[];
  storyUnits?: readonly ProjectDirectoryNode[];
  storyLines?: readonly ProjectDirectoryNode[];
  characters?: readonly ProjectDirectoryNode[];
  items?: readonly ProjectDirectoryNode[];
  locations?: readonly ProjectDirectoryNode[];
  organizations?: readonly ProjectDirectoryNode[];
  rules?: readonly ProjectDirectoryNode[];
  sourceDocuments?: readonly ProjectDirectoryNode[];
} = {}): readonly ProjectDirectoryNode[] {
  return [
    group("directory.story", t("directory.story"), [category("directory.story.nodes", t("directory.storyNodes"), input.storyNodes ?? []), category("directory.story.units", t("directory.storyUnits"), input.storyUnits ?? []), category("directory.story.lines", t("directory.storyLines"), input.storyLines ?? [])]),
    group("directory.library", t("directory.library"), [category("directory.library.character", t("directory.characters"), input.characters ?? []), category("directory.library.item", t("directory.items"), input.items ?? []), category("directory.library.location", t("directory.locations"), input.locations ?? []), category("directory.library.faction", t("directory.organizations"), input.organizations ?? [])]),
    group("directory.settings", t("directory.settings"), [category("directory.settings.rules", t("directory.rules"), input.rules ?? [])]),
    group("directory.sources", t("directory.sources"), [category("directory.sources.documents", t("directory.sourceDocuments"), input.sourceDocuments ?? [])]),
    group("directory.ideas", t("directory.ideas"), [category("directory.ideas.plot", t("directory.plotIdeas"), [])])
  ];
}

export function createEmptyProjectDirectoryProjection(t: (key: TranslationKey) => string): ProjectDirectoryProjection {
  return { projectId: "directory.unopened", workVersionId: null, pendingCount: 0, classifiedCount: 0, groups: createDirectoryShellDescriptor(t) };
}

/** Builds labels and hierarchy only; all records are passed in from existing read ports. */
export function createProjectDirectoryViewModel(t: (key: TranslationKey) => string, data: DirectoryData): ProjectDirectoryProjection {
  const objects = data.library.objects;
  const objectNodes = (type: string) => objects.filter((item) => item.type === type).map((item) => reference(item, data.library.project.id, data.workVersionId));
  const unitNodes = data.units.map((unit) => ({ id: `unit:${unit.id}`, label: unit.title, kind: "reference" as const,
    reference: { objectId: unit.id, version: unit.version, sourceId: unit.relativeId, projectId: data.library.project.id, workVersionId: data.workVersionId, objectType: "story-unit" } }));
  const sourceNodes = data.sources.map((source) => ({ id: `source:${source.sourceDocumentId}`, label: source.title, kind: "reference" as const,
    aliases: [source.filename], reference: { objectId: source.sourceDocumentId, version: source.currentRevisionHash, sourceId: source.sourceDocumentId, projectId: data.library.project.id, workVersionId: data.workVersionId, objectType: "source-document" } }));
  const groups = createDirectoryShellDescriptor(t, {
    storyNodes: objectNodes("event"), storyUnits: unitNodes, storyLines: objectNodes("thread"), characters: objectNodes("character"), items: objectNodes("item"), locations: objectNodes("location"), organizations: objectNodes("faction"), rules: objectNodes("rule"), sourceDocuments: sourceNodes
  });
  return { projectId: data.library.project.id, workVersionId: data.workVersionId, pendingCount: data.pendingCount, classifiedCount: objects.length + data.units.length + sourceNodes.length, groups };
}
function matches(node: ProjectDirectoryNode, query: string): boolean { return [node.label, ...(node.aliases ?? []), node.reference?.objectId ?? "", node.reference?.sourceId ?? ""].join(" ").toLocaleLowerCase().includes(query); }
export function filterProjectDirectory(projection: ProjectDirectoryProjection, query: string): ProjectDirectoryProjection {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return projection;
  const filter = (node: ProjectDirectoryNode): ProjectDirectoryNode | null => { const children = node.children?.map(filter).filter((item): item is ProjectDirectoryNode => Boolean(item)) ?? []; return matches(node, normalized) || children.length ? { ...node, children } : null; };
  return { ...projection, groups: projection.groups.map(filter).filter((item): item is ProjectDirectoryNode => Boolean(item)) };
}
