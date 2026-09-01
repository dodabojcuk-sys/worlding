import type { SourceImportDocumentR0, WorldLibraryBootstrap, StoryUnit } from "../../lib/localTransport";
import type { ProjectDirectoryNode, ProjectDirectoryProjection } from "../../../../../src/storyContracts/projectDirectoryContract.ts";
import { buildEventSemanticNode } from "../../../../../src/storyContracts/eventSemanticHierarchy.ts";
import type { TranslationKey } from "../i18n/translations";

type DirectoryData = { library: WorldLibraryBootstrap; units: readonly StoryUnit[]; sources: readonly SourceImportDocumentR0[]; workVersionId: string | null; pendingCount: number; verifiedEventIds: readonly string[] };

function reference(object: WorldLibraryBootstrap["objects"][number], projectId: string, workVersionId: string | null): ProjectDirectoryNode {
  return { id: `object:${object.id}`, label: object.title, kind: "reference", aliases: object.aliases,
    reference: { objectId: object.id, version: object.revisionToken, sourceId: object.relativeId || null, projectId, workVersionId, objectType: object.type } };
}
function category(id: string, label: string, children: readonly ProjectDirectoryNode[], count = children.length): ProjectDirectoryNode { return { id, label, kind: "category", count, children }; }
function group(id: string, label: string, children: readonly ProjectDirectoryNode[]): ProjectDirectoryNode { return { id, label, kind: "group", count: children.reduce((count, child) => count + (child.count ?? 0), 0), children }; }

/**
 * The classified tree is product information architecture, not project data.
 * A project projection only fills this shell with counts and stable references.
 */
export function createDirectoryShellDescriptor(t: (key: TranslationKey) => string, input: {
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
    group("directory.story", t("directory.story"), [category("directory.story.units", t("directory.storyUnits"), input.storyUnits ?? []), category("directory.story.lines", t("directory.storyLines"), input.storyLines ?? [])]),
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
  const verifiedEventIds = new Set(data.verifiedEventIds);
  const eventObjects = objects.filter((item) => item.type === "event" && (verifiedEventIds.has(item.id) || (item.status === "draft" && item.tags.includes("作者草稿"))));
  const eventById = new Map(eventObjects.map((event) => [event.id, event]));
  const claimedEventIds = new Set<string>();
  const unitNodes: ProjectDirectoryNode[] = [];
  const normalizeUnitLabel = (value: string) => value.replace(/^\s*单元\s*\d*\s*[\u00b7・:\uff1a-]?\s*/u, "").trim().toLocaleLowerCase();
  const eventUnitLabel = (event: (typeof eventObjects)[number]) => buildEventSemanticNode({ id: event.id, title: event.title, tags: event.tags, revision: event.revisionToken, status: event.status }).storyUnit.label;
  const buildUnitNode = (id: string, label: string, eventIds: readonly string[]): ProjectDirectoryNode => {
    const unitEvents = eventIds.map((eventId) => eventById.get(eventId)).filter((event): event is (typeof eventObjects)[number] => event !== undefined).filter((event) => !claimedEventIds.has(event.id));
    for (const event of unitEvents) claimedEventIds.add(event.id);
    const direct: ProjectDirectoryNode[] = [];
    const setPoints = new Map<string, ProjectDirectoryNode[]>();
    for (const event of unitEvents) {
      const semantic = buildEventSemanticNode({ id: event.id, title: event.title, tags: event.tags, revision: event.revisionToken, status: event.status });
      const node = reference(event, data.library.project.id, data.workVersionId);
      if (semantic.setPoint.label === "未指定集点") direct.push(node);
      else setPoints.set(semantic.setPoint.label, [...(setPoints.get(semantic.setPoint.label) ?? []), node]);
    }
    const children: ProjectDirectoryNode[] = [];
    if (direct.length) children.push(category(`unit:${id}:direct`, t("directory.directNodes"), direct));
    for (const [setPoint, events] of setPoints) children.push(category(`unit:${id}:set-point:${setPoint}`, `${t("directory.optionalCollectionPoint")} · ${setPoint}`, events));
    return category(`unit:${id}`, label, children, unitEvents.length);
  };
  for (const [unitIndex, unit] of data.units.entries()) {
    const linked = new Set([...unit.linkedEntityIds, ...unit.items.map((item) => item.subjectRef).filter((value): value is string => Boolean(value))]);
    const unitLabel = normalizeUnitLabel(unit.title);
    for (const event of eventObjects) if (normalizeUnitLabel(eventUnitLabel(event)) === unitLabel) linked.add(event.id);
    const directoryLabel = /^\s*单元\s*\d+/u.test(unit.title) ? unit.title : `单元 ${String(unitIndex + 1).padStart(2, "0")} · ${unit.title}`;
    unitNodes.push(buildUnitNode(unit.id, directoryLabel, [...linked]));
  }
  const inferredUnits = new Map<string, string[]>();
  for (const event of eventObjects) if (!claimedEventIds.has(event.id)) {
    const label = eventUnitLabel(event);
    inferredUnits.set(label, [...(inferredUnits.get(label) ?? []), event.id]);
  }
  for (const [label, eventIds] of inferredUnits) unitNodes.push(buildUnitNode(`inferred:${label}`, label, eventIds));
  const sourceNodes = data.sources.map((source) => ({ id: `source:${source.sourceDocumentId}`, label: source.title, kind: "reference" as const,
    aliases: [source.filename], reference: { objectId: source.sourceDocumentId, version: source.currentRevisionHash, sourceId: source.sourceDocumentId, projectId: data.library.project.id, workVersionId: data.workVersionId, objectType: "source-document" } }));
  const groups = createDirectoryShellDescriptor(t, {
    storyUnits: unitNodes, storyLines: objectNodes("thread"), characters: objectNodes("character"), items: objectNodes("item"), locations: objectNodes("location"), organizations: objectNodes("faction"), rules: objectNodes("rule"), sourceDocuments: sourceNodes
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

export type DirectoryReferenceSearchItem = { node: ProjectDirectoryNode; path: readonly ProjectDirectoryNode[]; searchText: string };
export function flattenDirectoryReferences(groups: readonly ProjectDirectoryNode[]): DirectoryReferenceSearchItem[] {
  const results: DirectoryReferenceSearchItem[] = [];
  const visit = (nodes: readonly ProjectDirectoryNode[], parents: readonly ProjectDirectoryNode[]) => nodes.forEach((node) => {
    const path = [...parents, node];
    if (node.reference) results.push({ node, path, searchText: [node.label, ...(node.aliases ?? []), node.reference.objectId, node.reference.sourceId ?? "", ...path.map((item) => item.label)].join(" ").toLocaleLowerCase() });
    if (node.children) visit(node.children, path);
  });
  visit(groups, []);
  return results;
}
