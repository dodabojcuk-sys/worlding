import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  createVisualDocument,
  duplicateMapDocument,
  listVisualDocumentRevisions,
  readVisualDocument,
  readVisualDocumentRevision,
  updateVisualDocument
} from "../../src/storyWorkspace/visualDocumentRepository.mjs";
import {
  acceptMapEditProposal,
  createMapEditProposal,
  rejectMapEditProposal
} from "../../src/storyWorkspace/mapEditProposalRepository.mjs";
import { createPortableWorkspacePackage, validatePortableWorkspacePackage } from "../../src/storyWorkspace/portableWorkspacePackage.mjs";

function fixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "tianyan-map-spatial-"));
  createStoryWorkspace({ rootPath, title: "雾港空间" });
  return rootPath;
}

function save(rootPath: string, map: any, content: any) {
  const result = updateVisualDocument(rootPath, { relativePath: map.relativePath, expectedContentHash: map.contentHash, document: { ...map, content } });
  assert.equal(result.ok, true);
  return result.document;
}

test("map placements keep directory-independent point, range and calibrated identities without parent overwrite", () => {
  const root = fixture();
  try {
    let region = createVisualDocument(root, { type: "map", title: "北湾" });
    const city = createVisualDocument(root, { type: "map", title: "雾港" });
    let atlas = createVisualDocument(root, { type: "map", title: "航海图" });
    region = save(root, region, { ...region.content, placements: [
      { id: "place.city.point", childMapId: city.id, kind: "point", point: { x: 35, y: 42 }, bounds: [], transform: null, precision: "illustrative", note: "大概入口" }
    ] });
    atlas = save(root, atlas, { ...atlas.content, placements: [
      { id: "place.city.range", childMapId: city.id, kind: "range", point: null, bounds: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 25, y: 35 }], transform: null, precision: "illustrative", note: null }
    ] });
    assert.equal(readVisualDocument(root, region.relativePath).content.placements[0].kind, "point");
    assert.equal(readVisualDocument(root, atlas.relativePath).content.placements[0].kind, "range");
    assert.throws(() => save(root, city, { ...city.content, placements: [{ id: "cycle", childMapId: region.id, kind: "point", point: { x: 1, y: 1 }, bounds: [], transform: null, precision: "illustrative", note: null }] }), /cycle/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("map connections require explicit endpoints while copy, archive and history preserve identity boundaries", () => {
  const root = fixture();
  try {
    let floor1 = createVisualDocument(root, { type: "map", title: "守卫楼一层" });
    const floor2 = createVisualDocument(root, { type: "map", title: "守卫楼二层" });
    floor1 = save(root, floor1, { ...floor1.content, connections: [{
      id: "connection.stairs", title: "北楼梯", kind: "stairs", direction: "both",
      from: { mapId: floor1.id, endpointId: "stairs.floor1", x: 40, y: 50, layerId: "layer.main" },
      to: { mapId: floor2.id, endpointId: "stairs.floor2", x: 42, y: 48, layerId: "layer.main" },
      relationId: null, note: "导航连接，非正式通行事实"
    }] });
    const originalHash = floor1.contentHash;
    floor1 = save(root, floor1, { ...floor1.content, lifecycle: { ...floor1.content.lifecycle, archived: true } });
    const history = listVisualDocumentRevisions(root, floor1.relativePath);
    assert.ok(history.some((item) => item.contentHash === originalHash && !item.current));
    assert.equal(readVisualDocumentRevision(root, { relativePath: floor1.relativePath, contentHash: originalHash }).content.lifecycle.archived, false);
    const copy = duplicateMapDocument(root, { relativePath: floor1.relativePath, title: "守卫楼一层副本" });
    assert.notEqual(copy.id, floor1.id);
    assert.equal(copy.content.lifecycle.copiedFromMapId, floor1.id);
    assert.deepEqual(copy.content.connections, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("text-model map proposals validate locked layers, apply atomically, reject stale bases and remain idempotent", () => {
  const root = fixture();
  try {
    let map = createVisualDocument(root, { type: "map", title: "北湾道路" });
    map = save(root, map, { ...map.content, drawings: [{ id: "drawing.road", kind: "line", subtype: "road", layerId: "layer.main", points: [{ x: 10, y: 20 }, { x: 80, y: 20 }], strokeColor: "#9a6b3c", fillColor: "#9a6b3c", fillOpacity: .2, width: 3, size: 4, seed: 1, rotation: 0, label: "港道", objectId: null }] });
    const proposal = createMapEditProposal(root, {
      relativePath: map.relativePath, operationId: "proposal-valid", baseContentHash: map.contentHash,
      prompt: "调整道路，保留建筑", scope: { kind: "selection", objectIds: ["drawing.road"] },
      capability: { mode: "text", imageInput: false, structuredOperations: true },
      operations: [{ type: "update-drawing", targetId: "drawing.road", patch: { points: [{ x: 12, y: 22 }, { x: 82, y: 22 }] } }]
    });
    assert.deepEqual(proposal.preview.modifiedDrawingIds, ["drawing.road"]);
    const accepted = acceptMapEditProposal(root, { operationId: "proposal-valid" });
    assert.equal(accepted.status, "accepted");
    assert.deepEqual(acceptMapEditProposal(root, { operationId: "proposal-valid" }), accepted);
    map = readVisualDocument(root, map.relativePath);
    assert.equal(map.content.drawings[0].points[0].x, 12);

    const stale = createMapEditProposal(root, { relativePath: map.relativePath, operationId: "proposal-stale", baseContentHash: map.contentHash, prompt: "再调整", scope: { kind: "map" }, capability: { mode: "text" }, operations: [{ type: "update-drawing", targetId: "drawing.road", patch: { width: 4 } }] });
    map = save(root, map, { ...map.content, labels: [...map.content.labels, { id: "label.manual", text: "人工修改", layerId: "layer.main", x: 50, y: 50, fontSize: 16, fontWeight: 600, align: "center", rotation: 0, visible: true, treatment: "outline" }] });
    assert.throws(() => acceptMapEditProposal(root, { operationId: stale.operationId }), /人工修改/u);

    map = save(root, map, { ...map.content, layers: map.content.layers.map((layer: any) => ({ ...layer, locked: true })) });
    assert.throws(() => createMapEditProposal(root, { relativePath: map.relativePath, operationId: "proposal-locked", baseContentHash: map.contentHash, prompt: "删除建筑", scope: { kind: "map" }, capability: { mode: "text" }, operations: [{ type: "delete-drawing", targetId: "drawing.road" }] }), /锁定/u);

    const rejectableMap = save(root, map, { ...map.content, layers: map.content.layers.map((layer: any) => ({ ...layer, locked: false })) });
    const rejectable = createMapEditProposal(root, { relativePath: rejectableMap.relativePath, operationId: "proposal-reject", baseContentHash: rejectableMap.contentHash, prompt: "不要采用", scope: { kind: "map" }, capability: { mode: "text" }, operations: [{ type: "update-drawing", targetId: "drawing.road", patch: { width: 5 } }] });
    assert.equal(rejectMapEditProposal(root, { operationId: rejectable.operationId }).status, "rejected");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("portable project packages preserve map assets, spatial topology, history and proposal receipts", () => {
  const root = fixture();
  try {
    let parent = createVisualDocument(root, { type: "map", title: "北湾导出" });
    const child = createVisualDocument(root, { type: "map", title: "雾港导出" });
    parent = save(root, parent, { ...parent.content,
      placements: [{ id: "placement.export", childMapId: child.id, kind: "point", point: { x: 31, y: 44 }, bounds: [], transform: null, precision: "illustrative", note: null }],
      connections: [{ id: "connection.export", title: "港道", kind: "road", direction: "both", from: { mapId: parent.id, endpointId: "road.parent", x: 31, y: 44, layerId: "layer.main" }, to: { mapId: child.id, endpointId: "road.child", x: 50, y: 50, layerId: "layer.main" }, relationId: null, note: "地图连接" }]
    });
    createMapEditProposal(root, { relativePath: parent.relativePath, operationId: "proposal-export", baseContentHash: parent.contentHash, prompt: "保留为待审", scope: { kind: "map" }, capability: { mode: "text" }, operations: [{ type: "add-drawing", value: { id: "drawing.proposed-road", kind: "line", subtype: "road", layerId: "layer.main", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], strokeColor: "#765b3d", fillColor: "#765b3d", fillOpacity: .2, width: 2, size: 4, seed: 1, rotation: 0, label: "提案道路", objectId: null } }] });
    const payload = createPortableWorkspacePackage(root, { projectId: "map-export-fixture" });
    assert.equal(validatePortableWorkspacePackage(payload).fileCount, payload.files.length);
    const paths = payload.files.map((file: { path: string }) => file.path);
    assert.ok(paths.includes(parent.relativePath));
    assert.ok(paths.some((entry: string) => entry.includes("documents/maps/.history/")), "exact prior map revisions remain portable");
    assert.ok(paths.some((entry: string) => entry.includes("documents/maps/.proposals/")), "proposal decisions remain portable");
    const exportedMap = JSON.parse(Buffer.from(payload.files.find((file: { path: string }) => file.path === parent.relativePath)!.data, "base64").toString("utf8"));
    assert.equal(exportedMap.content.placements[0].childMapId, child.id);
    assert.equal(exportedMap.content.connections[0].to.mapId, child.id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
