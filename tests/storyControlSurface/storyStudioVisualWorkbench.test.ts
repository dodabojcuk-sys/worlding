import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function createOperations() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-visual-ops-"));
  const stateFilePath = path.join(rootPath, ".app-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const project = operations.createProject({ title: "雾中灯塔", folderSlug: "mist-lighthouse" });
  const location = operations.createWorldObject({ projectId: project.id, type: "location", title: "旧灯塔" });
  const character = operations.createWorldObject({ projectId: project.id, type: "character", title: "林远" });
  return { rootPath, stateFilePath, operations, project, location, character };
}

test("Story Studio visual workbench creates, updates, opens, and restores map and graph documents", () => {
  const input = createOperations();
  const map = input.operations.createVisualDocument({
    projectId: input.project.id,
    type: "map",
    title: "灯塔海域"
  });
  const graph = input.operations.createVisualDocument({
    projectId: input.project.id,
    type: "graph",
    title: "核心关系"
  });
  const updatedMap = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: map.relativePath,
    expectedHash: map.contentHash,
    document: {
      ...map,
      content: {
        ...map.content,
        markers: [{ id: "marker.lighthouse", objectId: input.location.id, layerId: "layer.main", x: 250, y: 180, label: "旧灯塔", color: "#63c3b5" }]
      }
    }
  });

  assert.equal(updatedMap.conflict, false);
  input.operations.openVisualDocument({ projectId: input.project.id, relativePath: map.relativePath, pane: "primary" });
  input.operations.openVisualDocument({ projectId: input.project.id, relativePath: graph.relativePath, pane: "secondary" });
  input.operations.setVisualSplitView({ projectId: input.project.id, enabled: true });

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const bootstrap = restarted.getVisualWorkbenchBootstrap({ projectId: input.project.id });
  assert.equal(bootstrap.splitView, true);
  assert.equal(bootstrap.primaryDocument?.relativePath, map.relativePath);
  assert.equal(bootstrap.secondaryDocument?.relativePath, graph.relativePath);
  assert.equal(bootstrap.primaryDocument?.content.markers[0].objectId, input.location.id);

  const stateText = readFileSync(path.join(input.rootPath, input.project.id, ".world-os", "state.json"), "utf8");
  assert.doesNotMatch(stateText, /# |"content"|"markers"|"nodes"|"edges"/);
  assert.doesNotMatch(stateText, new RegExp(input.rootPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("World Workbench folders, cross-type visual tabs, pane swap, and close state survive repository boundaries", () => {
  const input = createOperations();
  const folder = input.operations.createWorkspaceFolder({ projectId: input.project.id, title: "核心世界" });
  const map = input.operations.createVisualDocument({ projectId: input.project.id, type: "map", title: "灯塔海域" });
  const tree = input.operations.createVisualDocument({ projectId: input.project.id, type: "tree", title: "守塔关系树" });

  input.operations.openVisualDocument({ projectId: input.project.id, relativePath: map.relativePath, pane: "primary" });
  input.operations.openVisualDocument({ projectId: input.project.id, relativePath: tree.relativePath, pane: "secondary" });
  input.operations.setVisualSplitView({ projectId: input.project.id, enabled: true });
  const swapped = input.operations.swapVisualPanes({ projectId: input.project.id });
  assert.equal(swapped.primaryDocument?.id, tree.id);
  assert.equal(swapped.secondaryDocument?.id, map.id);

  const library = input.operations.getStoryStudioWorldLibraryBootstrap({ projectId: input.project.id });
  assert.deepEqual(library.folders.map((item) => item.id), [folder.folder.id]);
  assert.deepEqual(new Set(library.visualDocuments.map((item) => item.type)), new Set(["map", "tree"]));

  const closed = input.operations.closeVisualDocument({ projectId: input.project.id, relativePath: tree.relativePath });
  assert.equal(closed.tabs.includes(tree.relativePath), false);
  assert.equal(closed.splitView, false);
  const closedObject = input.operations.closeWorldObject({ projectId: input.project.id, objectId: input.character.id });
  assert.equal(closedObject.tabs.some((relativeId) => relativeId === input.character.relativeId), false);
});

test("shared revision history previews, milestones, and restores object and visual documents as new revisions", () => {
  const input = createOperations();
  const initialObjectHistory = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "object", id: input.character.id } });
  assert.equal(initialObjectHistory.revisions.length, 1);
  const firstObjectRevision = initialObjectHistory.revisions[0];
  const updatedObject = input.operations.updateWorldObject({
    projectId: input.project.id,
    objectId: input.character.id,
    expectedHash: input.character.revisionToken,
    title: "林远（改变后）",
    status: input.character.status,
    tags: input.character.tags,
    aliases: input.character.aliases,
    body: "# 林远\n\n暂时改变。\n",
    card: input.character.card
  });
  assert.equal(updatedObject.conflict, false);
  const historyAfterSave = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "object", id: input.character.id } });
  assert.equal(historyAfterSave.revisions.length, 3);
  assert.equal(historyAfterSave.revisions[0].operationId, historyAfterSave.revisions[1].operationId);
  const milestone = input.operations.createDocumentMilestone({ projectId: input.project.id, ref: { kind: "object", id: input.character.id }, revisionId: firstObjectRevision.id, title: "人物初稿" });
  assert.equal(milestone.history.milestones[0].title, "人物初稿");
  const preview = input.operations.previewDocumentRevision({ projectId: input.project.id, ref: { kind: "object", id: input.character.id }, revisionId: firstObjectRevision.id });
  assert.equal(preview.changedFromCurrent, true);
  assert.doesNotMatch(JSON.stringify(historyAfterSave), /contentHash|relativePath|history\/documents/);

  const restored = input.operations.restoreDocumentRevision({
    projectId: input.project.id,
    ref: { kind: "object", id: input.character.id },
    revisionId: firstObjectRevision.id,
    expectedHash: updatedObject.object.revisionToken
  });
  assert.equal(restored.conflict, false);
  assert.equal(restored.history.revisions.length, 4);
  assert.equal(restored.history.revisions[0].source, "restore");
  assert.equal(input.operations.readWorldObject({ projectId: input.project.id, objectId: input.character.id }).title, "林远");

  const stale = input.operations.restoreDocumentRevision({
    projectId: input.project.id,
    ref: { kind: "object", id: input.character.id },
    revisionId: firstObjectRevision.id,
    expectedHash: updatedObject.object.revisionToken
  });
  assert.equal(stale.conflict, true);

  const map = input.operations.createVisualDocument({ projectId: input.project.id, type: "map", title: "灯塔地图" });
  const mapHistory = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "visual", id: map.id } });
  const changedMap = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: map.relativePath,
    expectedHash: map.contentHash,
    document: {
      ...map,
      title: "改变后的地图",
      content: { ...map.content, layers: [...map.content.layers, { id: "layer.notes", title: "注记", visible: true, locked: false }] }
    }
  });
  assert.equal(changedMap.conflict, false);
  const mapPreview = input.operations.previewDocumentRevision({ projectId: input.project.id, ref: { kind: "visual", id: map.id }, revisionId: mapHistory.revisions[0].id });
  assert.ok(mapPreview.semanticChanges.some((change) => change.kind === "layer"));
  const restoredMap = input.operations.restoreDocumentRevision({ projectId: input.project.id, ref: { kind: "visual", id: map.id }, revisionId: mapHistory.revisions[0].id, expectedHash: changedMap.document.contentHash });
  assert.equal(restoredMap.conflict, false);
  assert.equal(input.operations.readVisualDocument({ projectId: input.project.id, relativePath: map.relativePath }).title, "灯塔地图");
});

test("map and graph documents keep one content truth and do not copy object prose", () => {
  const input = createOperations();
  const map = input.operations.createVisualDocument({ projectId: input.project.id, type: "map", title: "灯塔海域" });
  const graph = input.operations.createVisualDocument({ projectId: input.project.id, type: "graph", title: "核心关系" });
  const mapSource = readFileSync(path.join(input.rootPath, input.project.id, map.relativePath), "utf8");
  const graphSource = readFileSync(path.join(input.rootPath, input.project.id, graph.relativePath), "utf8");

  assert.doesNotMatch(mapSource, /# 旧灯塔|# 林远/);
  assert.doesNotMatch(graphSource, /# 旧灯塔|# 林远/);
  assert.match(mapSource, /"type": "map"/);
  assert.match(graphSource, /"type": "graph"/);
});

test("Timeline and Tree reuse canonical events, graph relations, shared IDs, conflicts, and restart state", () => {
  const input = createOperations();
  const event = input.operations.createWorldObject({
    projectId: input.project.id,
    type: "event",
    title: "地下室线索被部分透露",
    status: "committed",
    tags: ["作者确认"],
    body: "# 地下室线索被部分透露\n\n正文不会复制到时间线 JSON。\n"
  });
  const graph = input.operations.createVisualDocument({ projectId: input.project.id, type: "graph", title: "守塔关系" });
  const graphUpdated = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: graph.relativePath,
    expectedHash: graph.contentHash,
    document: {
      ...graph,
      content: {
        nodes: [
          { id: "node.lin", objectId: input.character.id, x: 40, y: 60 },
          { id: "node.lighthouse", objectId: input.location.id, x: 280, y: 60 }
        ],
        edges: [{ id: "edge.guard", source: "node.lin", target: "node.lighthouse", relation: "守护", direction: "forward" }],
        filters: { objectTypes: [] }
      }
    }
  }).document;
  const timeline = input.operations.createVisualDocument({ projectId: input.project.id, type: "timeline", title: "灯塔正史" });
  const timelineUpdated = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: timeline.relativePath,
    expectedHash: timeline.contentHash,
    document: {
      ...timeline,
      content: { lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }], entries: [{ id: "entry.1", eventId: event.id, laneId: "lane.canon", order: 0 }] }
    }
  }).document;
  const tree = input.operations.createVisualDocument({ projectId: input.project.id, type: "tree", title: "守塔结构" });
  const treeUpdated = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: tree.relativePath,
    expectedHash: tree.contentHash,
    document: {
      ...tree,
      content: { sourceGraphPath: graphUpdated.relativePath, includedEdgeIds: ["edge.guard"], rootObjectIds: [input.character.id], collapsedObjectIds: [], direction: "LR" }
    }
  }).document;

  input.operations.openVisualDocument({ projectId: input.project.id, relativePath: timelineUpdated.relativePath, pane: "primary" });
  input.operations.openVisualDocument({ projectId: input.project.id, relativePath: treeUpdated.relativePath, pane: "secondary" });
  input.operations.setVisualSplitView({ projectId: input.project.id, enabled: true });

  const timelinePath = path.join(input.rootPath, input.project.id, timelineUpdated.relativePath);
  const source = readFileSync(timelinePath, "utf8");
  assert.doesNotMatch(source, /正文不会复制/);
  const externallyChanged = JSON.parse(source);
  externallyChanged.title = "外部修改的正史";
  writeFileSync(timelinePath, `${JSON.stringify(externallyChanged, null, 2)}\n`, "utf8");
  const conflict = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: timelineUpdated.relativePath,
    expectedHash: timelineUpdated.contentHash,
    document: { ...timelineUpdated, title: "内存中的正史" }
  });
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.document.title, "外部修改的正史");

  const restarted = createStoryStudioWorkspaceOperations({ rootPath: input.rootPath, stateFilePath: input.stateFilePath });
  const bootstrap = restarted.getVisualWorkbenchBootstrap({ projectId: input.project.id });
  assert.equal(bootstrap.primaryDocument?.type, "timeline");
  assert.equal(bootstrap.secondaryDocument?.type, "tree");
  assert.equal(bootstrap.splitView, true);
  assert.deepEqual(restarted.readWorldObject({ projectId: input.project.id, objectId: event.id }).visualReferences.map((reference) => reference.type), ["timeline"]);
  assert.ok(restarted.readWorldObject({ projectId: input.project.id, objectId: input.character.id }).visualReferences.some((reference) => reference.type === "tree"));
});

test("planning event creation writes one Markdown note and one stable Timeline reference", () => {
  const input = createOperations();
  const timeline = input.operations.createVisualDocument({ projectId: input.project.id, type: "timeline", title: "剧情规划" });
  const result = input.operations.createPlanningEventAndAddToTimeline({
    projectId: input.project.id,
    timelineRelativePath: timeline.relativePath,
    timelineExpectedHash: timeline.contentHash,
    title: "阿岚收到部分线索",
    body: "# 阿岚收到部分线索\n\n林远只透露地下室的一部分。\n"
  });

  assert.equal(result.planningNoteCreated, true);
  assert.equal(result.timelineEntryAdded, true);
  assert.equal(result.timelineConflict, false);
  assert.equal(result.noteConflict, false);
  assert.equal(result.recoveryAction, null);
  const planning = input.operations.readWorldObject({ projectId: input.project.id, objectId: result.planningEventId });
  assert.equal(planning.type, "event");
  assert.equal(planning.status, "planned");
  assert.deepEqual(planning.tags, ["作者规划"]);
  assert.match(planning.relativeId, /^world\/events\//);
  assert.equal(input.operations.listWorldObjects({ projectId: input.project.id, type: "event" }).length, 1);
  const savedTimeline = input.operations.readVisualDocument({ projectId: input.project.id, relativePath: timeline.relativePath });
  assert.deepEqual(savedTimeline.content.entries.map((entry: { eventId: string }) => entry.eventId), [planning.id]);
  const source = readFileSync(path.join(input.rootPath, input.project.id, timeline.relativePath), "utf8");
  assert.doesNotMatch(source, /林远只透露地下室的一部分/);
  assert.equal(source.includes('"eventId"'), true);
});

test("planning note survives a stale Timeline hash and can be added after reload", () => {
  const input = createOperations();
  const timeline = input.operations.createVisualDocument({ projectId: input.project.id, type: "timeline", title: "冲突规划" });
  const timelinePath = path.join(input.rootPath, input.project.id, timeline.relativePath);
  const external = JSON.parse(readFileSync(timelinePath, "utf8"));
  external.title = "外部更新后的冲突规划";
  writeFileSync(timelinePath, `${JSON.stringify(external, null, 2)}\n`, "utf8");

  const partial = input.operations.createPlanningEventAndAddToTimeline({
    projectId: input.project.id,
    timelineRelativePath: timeline.relativePath,
    timelineExpectedHash: timeline.contentHash,
    title: "冲突后仍保留的规划",
    body: "# 冲突后仍保留的规划\n"
  });
  assert.equal(partial.planningNoteCreated, true);
  assert.equal(partial.timelineEntryAdded, false);
  assert.equal(partial.timelineConflict, true);
  assert.equal(partial.noteConflict, false);
  assert.deepEqual(partial.recoveryAction, {
    kind: "reload-and-add-existing-planning-event",
    planningEventId: partial.planningEventId,
    timelineRelativePath: timeline.relativePath
  });
  assert.equal(input.operations.readWorldObject({ projectId: input.project.id, objectId: partial.planningEventId }).status, "planned");
  assert.equal(input.operations.readVisualDocument({ projectId: input.project.id, relativePath: timeline.relativePath }).content.entries.length, 0);

  const reloaded = input.operations.readVisualDocument({ projectId: input.project.id, relativePath: timeline.relativePath });
  const recovered = input.operations.addPlanningEventToTimeline({
    projectId: input.project.id,
    timelineRelativePath: timeline.relativePath,
    timelineExpectedHash: reloaded.contentHash,
    planningEventId: partial.planningEventId
  });
  assert.equal(recovered.timelineEntryAdded, true);
  assert.equal(recovered.timelineConflict, false);
  assert.deepEqual(recovered.document.content.entries.map((entry: { eventId: string }) => entry.eventId), [partial.planningEventId]);
});

test("planning events can be created independently, abandoned explicitly, and keep Timeline layout untouched", () => {
  const input = createOperations();
  const timeline = input.operations.createVisualDocument({ projectId: input.project.id, type: "timeline", title: "规划时间线" });
  const planning = input.operations.createPlanningEvent({
    projectId: input.project.id,
    title: "阿岚绕开旧港口",
    body: "# 阿岚绕开旧港口\n\n保留地下室秘密。\n"
  });
  const planningPath = path.join(input.rootPath, input.project.id, planning.relativeId);
  const planningSource = readFileSync(planningPath, "utf8");
  const timelineSource = readFileSync(path.join(input.rootPath, input.project.id, timeline.relativePath), "utf8");

  assert.equal(planning.status, "planned");
  assert.deepEqual(planning.tags, ["作者规划"]);
  assert.equal(readFileSync(path.join(input.rootPath, input.project.id, timeline.relativePath), "utf8"), timelineSource);

  const abandoned = input.operations.abandonPlanningEvent({
    projectId: input.project.id,
    planningEventId: planning.id,
    expectedHash: planning.revisionToken
  });
  assert.equal(abandoned.conflict, false);
  assert.equal(abandoned.object.status, "abandoned");
  assert.match(readFileSync(planningPath, "utf8"), /保留地下室秘密/);
  assert.equal(readFileSync(path.join(input.rootPath, input.project.id, timeline.relativePath), "utf8"), timelineSource);
  assert.notEqual(readFileSync(planningPath, "utf8"), planningSource);

  const stalePlanning = input.operations.createPlanningEvent({
    projectId: input.project.id,
    title: "外部修改后的规划"
  });
  const stalePath = path.join(input.rootPath, input.project.id, stalePlanning.relativeId);
  writeFileSync(stalePath, `${readFileSync(stalePath, "utf8")}\n外部修改。\n`, "utf8");
  const stale = input.operations.abandonPlanningEvent({
    projectId: input.project.id,
    planningEventId: stalePlanning.id,
    expectedHash: stalePlanning.revisionToken
  });
  assert.equal(stale.conflict, true);
});

test("generic object update cannot promote a planned event directly to canon", () => {
  const input = createOperations();
  const planning = input.operations.createWorldObject({
    projectId: input.project.id,
    type: "event",
    title: "必须经过评审的规划",
    status: "planned",
    tags: ["作者规划"]
  });
  assert.throws(() => input.operations.updateWorldObject({
    projectId: input.project.id,
    objectId: planning.id,
    expectedHash: planning.revisionToken,
    title: planning.title,
    status: "committed",
    tags: ["作者确认"],
    aliases: planning.aliases,
    body: planning.body,
    card: planning.card
  }), /Impact Review|影响评审/);
  assert.throws(() => input.operations.updateWorldObject({
    projectId: input.project.id,
    objectId: planning.id,
    expectedHash: planning.revisionToken,
    title: planning.title,
    status: "planned",
    tags: [],
    aliases: planning.aliases,
    body: planning.body,
    card: planning.card
  }), /规划身份|影响评审/);
  assert.equal(input.operations.readWorldObject({ projectId: input.project.id, objectId: planning.id }).status, "planned");
});

test("a historical Timeline v1 revision restores through the additive v2 reader", () => {
  const input = createOperations();
  const event = input.operations.createWorldObject({ projectId: input.project.id, type: "event", title: "旧版正史事件", status: "committed", tags: ["作者确认"] });
  const timeline = input.operations.createVisualDocument({ projectId: input.project.id, type: "timeline", title: "可恢复旧时间线" });
  const timelinePath = path.join(input.rootPath, input.project.id, timeline.relativePath);
  const legacy = JSON.parse(readFileSync(timelinePath, "utf8"));
  legacy.content = {
    lanes: [{ id: "lane.canon", title: "正史", color: "#63c3b5" }],
    entries: [{ id: "entry.legacy", eventId: event.id, laneId: "lane.canon", order: 4 }]
  };
  writeFileSync(timelinePath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
  const history = input.operations.getDocumentRevisionHistory({ projectId: input.project.id, ref: { kind: "visual", id: timeline.id } });
  const legacyRevision = history.revisions[0];
  const opened = input.operations.readVisualDocument({ projectId: input.project.id, relativePath: timeline.relativePath });
  const saved = input.operations.updateVisualDocument({
    projectId: input.project.id,
    relativePath: timeline.relativePath,
    expectedHash: opened.contentHash,
    document: opened
  });
  assert.equal(saved.conflict, false);
  const restored = input.operations.restoreDocumentRevision({
    projectId: input.project.id,
    ref: { kind: "visual", id: timeline.id },
    revisionId: legacyRevision.id,
    expectedHash: saved.document.contentHash
  });
  assert.equal(restored.conflict, false);
  const reread = input.operations.readVisualDocument({ projectId: input.project.id, relativePath: timeline.relativePath });
  assert.deepEqual(reread.content.entries.map((entry: { id: string; eventId: string }) => [entry.id, entry.eventId]), [["entry.legacy", event.id]]);
  assert.ok(Array.isArray(reread.content.trackViews));
});
