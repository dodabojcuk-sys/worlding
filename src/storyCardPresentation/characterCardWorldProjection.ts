export const CHARACTER_RELATION_CONFIRMED_ONLY = true as const;

export type CharacterRelationDirection = "incoming" | "outgoing" | "both" | "none";

export type CharacterRelationGroupConfig = {
  sourceDocumentIds: string[];
  directions: CharacterRelationDirection[];
  relationTypes: string[];
  edgeIds: string[];
};

export type CharacterProjectionReference = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  missing: boolean;
  provenance: "markdown-link" | "markdown-backlink" | "confirmed-graph";
};

export type CharacterGraphRelationProjection = {
  id: string;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  sourceRelativePath: string;
  relation: string;
  direction: CharacterRelationDirection;
  otherObject: CharacterProjectionReference;
};

export type CharacterRelationGroupProjection = {
  blockId: string;
  label: string;
  relations: CharacterGraphRelationProjection[];
  pendingProposalCount: number;
  missingSourceDocumentIds: string[];
  missingEdgeIds: string[];
};

export type CharacterTimelineParticipation = {
  id: string;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  sourceRelativePath: string;
  eventId: string;
  eventTitle: string | null;
  eventExcerpt: string;
  state: "canon" | "planned" | "abandoned" | "drift" | "missing";
  trackBadges: string[];
};

export type CharacterVisualAppearance = {
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  sourceRelativePath: string;
  type: "map" | "tree" | "canvas";
  appearanceCount: number;
  referenceIds: string[];
  role: "marker" | "root" | "included-range" | "ordinary-node" | "object-node";
  missingSource: boolean;
};

export type CharacterCardWorldProjection = {
  confirmedOnly: true;
  confirmedRelations: CharacterGraphRelationProjection[];
  relationGroups: CharacterRelationGroupProjection[];
  pendingGraphProposals: Array<{ sourceDocumentId: string; sourceDocumentTitle: string; sourceRelativePath: string; count: number }>;
  timelineParticipations: CharacterTimelineParticipation[];
  mapAppearances: CharacterVisualAppearance[];
  treeAppearances: CharacterVisualAppearance[];
  canvasAppearances: CharacterVisualAppearance[];
  backlinks: CharacterProjectionReference[];
  linkedScenes: CharacterProjectionReference[];
  factions: CharacterProjectionReference[];
  openThreads: CharacterProjectionReference[];
  currentLocation: CharacterProjectionReference | null;
  diagnostics: Array<{ code: string; message: string; sourceDocumentId?: string; referenceId?: string }>;
};

type ProjectionNote = {
  id: string;
  title: string;
  type: string;
  status: string;
  body: string;
};

type ProjectionDocument = {
  id: string;
  title: string;
  type: "map" | "graph" | "canvas" | "timeline" | "tree";
  relativePath: string;
  objectRefs: string[];
  content: unknown;
  diagnostics?: { timeline?: TimelineDiagnostics };
};

type TimelineDiagnostics = {
  entryStates: Array<{ entryId: string; eventId: string; status: "canonical" | "planned" | "missing" | "ineligible" }>;
  projectedEntries: Array<{ entryId: string; eventId: string; trackIds: string[]; characterIds: string[]; locationIds: string[]; plannedFromEventId: string | null }>;
};

type RelationGroupInput = { blockId: string; label: string; config: CharacterRelationGroupConfig };

export function buildCharacterCardWorldProjection(input: {
  characterId: string;
  notes: ProjectionNote[];
  linkedNoteIds: string[];
  backlinkNoteIds: string[];
  documents: ProjectionDocument[];
  relationGroups: RelationGroupInput[];
}): CharacterCardWorldProjection {
  const notesById = new Map(input.notes.map((note) => [note.id, note]));
  const documentsById = new Map(input.documents.map((document) => [document.id, document]));
  const graphs = input.documents.filter((document) => document.type === "graph");
  const confirmedRelations = graphs.flatMap((graph) => graphRelations(graph, input.characterId, notesById));
  const pendingGraphProposals = graphs.flatMap((graph) => {
    const count = touchingGraphItems(graph, input.characterId, "proposals").length;
    return count > 0 ? [{ sourceDocumentId: graph.id, sourceDocumentTitle: graph.title, sourceRelativePath: graph.relativePath, count }] : [];
  }).sort(compareDocumentProjection);
  const diagnostics: CharacterCardWorldProjection["diagnostics"] = [];

  const relationGroups = input.relationGroups.map((group) => {
    const sourceIds = group.config.sourceDocumentIds.length ? group.config.sourceDocumentIds : graphs.map((graph) => graph.id);
    const missingSourceDocumentIds = sourceIds.filter((id) => !documentsById.has(id));
    const sourceGraphs = sourceIds.flatMap((id) => {
      const document = documentsById.get(id);
      return document?.type === "graph" ? [document] : [];
    });
    const availableEdgeIds = new Set(sourceGraphs.flatMap((graph) => graphItems(graph, "edges").map((edge) => text(edge.id))));
    const missingEdgeIds = group.config.edgeIds.filter((id) => !availableEdgeIds.has(id));
    const includedEdges = new Set(group.config.edgeIds);
    const includedDirections = new Set(group.config.directions);
    const includedTypes = new Set(group.config.relationTypes);
    const relations = sourceGraphs
      .flatMap((graph) => graphRelations(graph, input.characterId, notesById))
      .filter((relation) => includedEdges.size === 0 || includedEdges.has(relation.id))
      .filter((relation) => includedDirections.size === 0 || includedDirections.has(relation.direction))
      .filter((relation) => includedTypes.size === 0 || includedTypes.has(relation.relation));
    const pendingProposalCount = sourceGraphs.reduce((count, graph) => count + touchingGraphItems(graph, input.characterId, "proposals").length, 0);
    for (const sourceDocumentId of missingSourceDocumentIds) diagnostics.push({ code: "missing-relation-group-source", message: "关系组的来源图谱已缺失。", sourceDocumentId });
    for (const referenceId of missingEdgeIds) diagnostics.push({ code: "missing-relation-group-edge", message: "关系组引用的已确认关系已缺失。", referenceId });
    return { blockId: group.blockId, label: group.label, relations: uniqueRelations(relations), pendingProposalCount, missingSourceDocumentIds, missingEdgeIds };
  });

  for (const relation of confirmedRelations) {
    if (relation.otherObject.missing) diagnostics.push({ code: "missing-graph-endpoint", message: "已确认关系的另一端 Markdown 已缺失。", sourceDocumentId: relation.sourceDocumentId, referenceId: relation.otherObject.id });
  }

  const timelineParticipations = input.documents
    .filter((document) => document.type === "timeline")
    .flatMap((document) => timelineParticipationsFor(document, input.characterId, notesById))
    .sort(compareDocumentProjection);
  for (const participation of timelineParticipations) {
    if (participation.state === "missing") diagnostics.push({ code: "missing-timeline-event", message: "时间线参与引用的事件 Markdown 已缺失。", sourceDocumentId: participation.sourceDocumentId, referenceId: participation.eventId });
    if (participation.state === "drift" || participation.state === "abandoned") diagnostics.push({ code: "timeline-source-drift", message: "时间线事件已不再符合当前投影条件。", sourceDocumentId: participation.sourceDocumentId, referenceId: participation.eventId });
  }

  const mapAppearances = input.documents.filter((document) => document.type === "map").flatMap((document) => mapAppearance(document, input.characterId)).sort(compareDocumentProjection);
  const treeAppearances = input.documents.filter((document) => document.type === "tree").flatMap((document) => treeAppearance(document, input.characterId, input.documents)).sort(compareDocumentProjection);
  const canvasAppearances = input.documents.filter((document) => document.type === "canvas").flatMap((document) => canvasAppearance(document, input.characterId)).sort(compareDocumentProjection);

  const linked = input.linkedNoteIds.flatMap((id) => noteReference(notesById.get(id), id, "markdown-link"));
  const backlinks = input.backlinkNoteIds.flatMap((id) => noteReference(notesById.get(id), id, "markdown-backlink")).sort(compareReference);
  const linkedScenes = backlinks.filter((reference) => reference.type === "scene");
  const markdownFactions = [...linked, ...backlinks].filter((reference) => reference.type === "faction");
  const graphFactions = confirmedRelations.filter((relation) => relation.otherObject.type === "faction").map((relation) => ({ ...relation.otherObject, provenance: "confirmed-graph" as const }));
  const factions = uniqueReferences([...markdownFactions, ...graphFactions]);
  const openThreads = uniqueReferences([...linked, ...backlinks].filter((reference) => reference.type === "thread" && !["resolved", "closed", "abandoned"].includes(reference.status || "")));
  const currentLocation = linked.filter((reference) => reference.type === "location").sort(compareReference)[0] || null;

  return {
    confirmedOnly: CHARACTER_RELATION_CONFIRMED_ONLY,
    confirmedRelations: uniqueRelations(confirmedRelations),
    relationGroups,
    pendingGraphProposals,
    timelineParticipations,
    mapAppearances,
    treeAppearances,
    canvasAppearances,
    backlinks,
    linkedScenes,
    factions,
    openThreads,
    currentLocation,
    diagnostics
  };
}

function graphRelations(graph: ProjectionDocument, characterId: string, notesById: Map<string, ProjectionNote>): CharacterGraphRelationProjection[] {
  const nodes = new Map(graphItems(graph, "nodes").map((node) => [text(node.id), text(node.objectId)]));
  return touchingGraphItems(graph, characterId, "edges").flatMap((edge) => {
    const sourceObjectId = nodes.get(text(edge.source));
    const targetObjectId = nodes.get(text(edge.target));
    if (sourceObjectId !== characterId && targetObjectId !== characterId) return [];
    const otherObjectId = sourceObjectId === characterId ? targetObjectId : sourceObjectId;
    if (!otherObjectId) return [];
    const note = notesById.get(otherObjectId);
    return [{
      id: text(edge.id),
      sourceDocumentId: graph.id,
      sourceDocumentTitle: graph.title,
      sourceRelativePath: graph.relativePath,
      relation: text(edge.relation),
      direction: relativeDirection(text(edge.direction), sourceObjectId === characterId),
      otherObject: { id: otherObjectId, title: note?.title || null, type: note?.type || null, status: note?.status || null, missing: !note, provenance: "confirmed-graph" as const }
    }];
  }).sort((left, right) => left.sourceDocumentId.localeCompare(right.sourceDocumentId) || left.id.localeCompare(right.id));
}

function touchingGraphItems(graph: ProjectionDocument, characterId: string, field: "edges" | "proposals"): Array<Record<string, unknown>> {
  const nodes = new Map(graphItems(graph, "nodes").map((node) => [text(node.id), text(node.objectId)]));
  return graphItems(graph, field).filter((item) => nodes.get(text(item.source)) === characterId || nodes.get(text(item.target)) === characterId);
}

function graphItems(graph: ProjectionDocument, field: "nodes" | "edges" | "proposals"): Array<Record<string, unknown>> {
  const value = recordValue(graph.content)[field];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function timelineParticipationsFor(document: ProjectionDocument, characterId: string, notesById: Map<string, ProjectionNote>): CharacterTimelineParticipation[] {
  const diagnostics = document.diagnostics?.timeline;
  if (!diagnostics) return [];
  const content = recordValue(document.content);
  const entries = arrayRecords(content.entries);
  const entryById = new Map(entries.map((entry) => [text(entry.id), entry]));
  const stateByEntry = new Map(diagnostics.entryStates.map((entry) => [entry.entryId, entry.status]));
  const tracks = arrayRecords(content.trackViews);
  const characterTrackIds = new Set(tracks.filter((track) => text(track.kind) === "character" && text(track.refId) === characterId).map((track) => text(track.id)));
  const relevant = diagnostics.projectedEntries.filter((entry) => entry.characterIds.includes(characterId) || entry.trackIds.some((trackId) => characterTrackIds.has(trackId)));
  const missingInCharacterView = diagnostics.entryStates.filter((entry) => entry.status === "missing" && characterTrackIds.size > 0 && !relevant.some((item) => item.entryId === entry.entryId)).map((entry) => ({ entryId: entry.entryId, eventId: entry.eventId, trackIds: [...characterTrackIds], characterIds: [], locationIds: [], plannedFromEventId: null }));
  const byEvent = new Map<string, CharacterTimelineParticipation>();
  for (const projected of [...relevant, ...missingInCharacterView]) {
    const entry = entryById.get(projected.entryId);
    if (!entry) continue;
    const eventId = text(entry.eventId || projected.eventId);
    const event = notesById.get(eventId);
    const rawState = stateByEntry.get(projected.entryId) || "ineligible";
    const state = rawState === "canonical" ? "canon" : rawState === "planned" ? "planned" : rawState === "missing" ? "missing" : event?.status === "abandoned" ? "abandoned" : "drift";
    const trackBadges = projected.trackIds.map((trackId) => timelineTrackLabel(tracks.find((track) => text(track.id) === trackId), notesById, arrayRecords(content.lanes))).filter(Boolean);
    const existing = byEvent.get(eventId);
    if (existing) {
      existing.trackBadges = [...new Set([...existing.trackBadges, ...trackBadges])];
      continue;
    }
    byEvent.set(eventId, {
      id: `${document.id}:${eventId}`,
      sourceDocumentId: document.id,
      sourceDocumentTitle: document.title,
      sourceRelativePath: document.relativePath,
      eventId,
      eventTitle: event?.title || null,
      eventExcerpt: event ? excerpt(event.body, 140) : "",
      state,
      trackBadges: [...new Set(trackBadges)]
    });
  }
  return [...byEvent.values()].sort((left, right) => left.eventId.localeCompare(right.eventId));
}

function timelineTrackLabel(track: Record<string, unknown> | undefined, notesById: Map<string, ProjectionNote>, lanes: Array<Record<string, unknown>>): string {
  if (!track) return "";
  const kind = text(track.kind);
  if (kind === "canon") return "正史";
  if (kind === "planning") return "规划";
  if (kind === "character" || kind === "location") return notesById.get(text(track.refId))?.title || "引用已缺失";
  return lanes.find((lane) => text(lane.id) === text(track.refId))?.title ? text(lanes.find((lane) => text(lane.id) === text(track.refId))?.title) : "展示轨";
}

function mapAppearance(document: ProjectionDocument, characterId: string): CharacterVisualAppearance[] {
  const markers = arrayRecords(recordValue(document.content).markers).filter((marker) => text(marker.objectId) === characterId);
  if (!markers.length) return [];
  return [{ sourceDocumentId: document.id, sourceDocumentTitle: document.title, sourceRelativePath: document.relativePath, type: "map", appearanceCount: markers.length, referenceIds: markers.map((marker) => text(marker.id)), role: "marker", missingSource: false }];
}

function treeAppearance(document: ProjectionDocument, characterId: string, documents: ProjectionDocument[]): CharacterVisualAppearance[] {
  if (!document.objectRefs.includes(characterId)) return [];
  const content = recordValue(document.content);
  const rootObjectIds = stringArray(content.rootObjectIds);
  const sourcePath = text(content.sourceGraphPath);
  const source = documents.find((candidate) => candidate.type === "graph" && candidate.relativePath === sourcePath);
  let role: CharacterVisualAppearance["role"] = rootObjectIds.includes(characterId) ? "root" : "ordinary-node";
  if (role !== "root" && source) {
    const nodeIds = new Set(graphItems(source, "nodes").filter((node) => text(node.objectId) === characterId).map((node) => text(node.id)));
    const included = new Set(stringArray(content.includedEdgeIds));
    if (graphItems(source, "edges").some((edge) => included.has(text(edge.id)) && (nodeIds.has(text(edge.source)) || nodeIds.has(text(edge.target))))) role = "included-range";
  }
  return [{ sourceDocumentId: document.id, sourceDocumentTitle: document.title, sourceRelativePath: document.relativePath, type: "tree", appearanceCount: 1, referenceIds: [characterId], role, missingSource: Boolean(sourcePath && !source) }];
}

function canvasAppearance(document: ProjectionDocument, characterId: string): CharacterVisualAppearance[] {
  const nodes = arrayRecords(recordValue(document.content).nodes).filter((node) => text(node.kind) === "object" && text(node.objectId) === characterId);
  if (!nodes.length) return [];
  return [{ sourceDocumentId: document.id, sourceDocumentTitle: document.title, sourceRelativePath: document.relativePath, type: "canvas", appearanceCount: nodes.length, referenceIds: nodes.map((node) => text(node.id)), role: "object-node", missingSource: false }];
}

function noteReference(note: ProjectionNote | undefined, id: string, provenance: "markdown-link" | "markdown-backlink"): CharacterProjectionReference[] {
  return [{ id, title: note?.title || null, type: note?.type || null, status: note?.status || null, missing: !note, provenance }];
}

function relativeDirection(direction: string, characterIsSource: boolean): CharacterRelationDirection {
  if (direction === "both") return "both";
  if (direction === "none") return "none";
  if (direction === "reverse") return characterIsSource ? "incoming" : "outgoing";
  return characterIsSource ? "outgoing" : "incoming";
}

function uniqueRelations(relations: CharacterGraphRelationProjection[]): CharacterGraphRelationProjection[] {
  return relations.filter((relation, index, all) => all.findIndex((candidate) => candidate.sourceDocumentId === relation.sourceDocumentId && candidate.id === relation.id) === index);
}

function uniqueReferences(references: CharacterProjectionReference[]): CharacterProjectionReference[] {
  return references.filter((reference, index, all) => all.findIndex((candidate) => candidate.id === reference.id && candidate.provenance === reference.provenance) === index).sort(compareReference);
}

function compareReference(left: CharacterProjectionReference, right: CharacterProjectionReference): number {
  return (left.type || "").localeCompare(right.type || "") || left.id.localeCompare(right.id);
}

function compareDocumentProjection(left: { sourceDocumentId: string; id?: string }, right: { sourceDocumentId: string; id?: string }): number {
  return left.sourceDocumentId.localeCompare(right.sourceDocumentId) || (left.id || "").localeCompare(right.id || "");
}

function excerpt(body: string, maximum: number): string {
  const value = body.replace(/<!--[^]*?-->/gu, " ").replace(/^#{1,6}\s+/gmu, "").replace(/\[[^\]]*\]\([^)]+\)/gu, " ").replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, "$2$1").replace(/\s+/gu, " ").trim();
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}
