import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryWorkspace, createWorkspaceNote, serializeStoryMarkdown } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  createDocumentMilestone,
  listDocumentRevisions,
  previewDocumentRevision,
  readDocumentRevisionSnapshot,
  recordDocumentRevision
} from "../../src/storyWorkspace/documentRevisionRepository.mjs";

test("document revision repository appends portable snapshots, suppresses duplicates, and references milestones", () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-revision-repo-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const note = createWorkspaceNote(rootPath, { id: "character.lin-yuan", type: "character", title: "林远", status: "active", body: "# 林远\n\n守塔人。\n" });
  const source = serializeStoryMarkdown({ frontmatter: note.frontmatter, body: note.body });
  const ref = { kind: "object", id: note.id };
  const first = recordDocumentRevision(rootPath, { ref, relativePath: note.relativePath, source, revisionSource: "create", recordedAt: "2026-07-12T00:00:00.000Z" });
  const duplicate = recordDocumentRevision(rootPath, { ref, relativePath: note.relativePath, source, revisionSource: "save", recordedAt: "2026-07-12T00:01:00.000Z" });
  const milestone = createDocumentMilestone(rootPath, { ref, revisionId: first.revision.id, title: "角色基线" });
  const preview = previewDocumentRevision(rootPath, { ref, revisionId: first.revision.id, currentSource: `${source}\n变化` });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(listDocumentRevisions(rootPath, { ref }).revisions.length, 1);
  assert.equal(milestone.milestone.revisionId, first.revision.id);
  assert.equal(preview.changedFromCurrent, true);
  assert.match(preview.summary, /行变化/);
  assert.equal(readDocumentRevisionSnapshot(rootPath, { ref, revisionId: first.revision.id }), source);
  assert.equal(existsSync(path.join(rootPath, "history", "documents")), true);
  assert.equal(existsSync(path.join(rootPath, ".world-os", "history")), false);
  assert.equal(readdirSync(path.join(rootPath, "history", "documents")).length, 1);
});

test("map revision previews describe author-facing semantic changes before raw JSON", () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-map-revision-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const ref = { kind: "visual", id: "map.lighthouse" };
  const baseline = JSON.stringify({
    version: "story-visual-document/v1",
    id: ref.id,
    type: "map",
    content: {
      baseImage: null,
      backgrounds: [],
      activeBackgroundId: null,
      layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: false }],
      markers: [{ id: "marker.lin", objectId: "character.lin", layerId: "layer.main", x: 10, y: 20, color: "#63c3b5", labelMode: "always" }],
      regions: [],
      labels: []
    }
  }, null, 2);
  const current = JSON.stringify({
    ...JSON.parse(baseline),
    content: {
      ...JSON.parse(baseline).content,
      layers: [{ id: "layer.main", title: "主要地点", visible: true, locked: true }],
      markers: [{ id: "marker.lin", objectId: "character.lin", layerId: "layer.main", x: 42, y: 64, color: "#63c3b5", labelMode: "hover" }],
      labels: [{ id: "label.1", text: "灯塔", layerId: "layer.main", x: 20, y: 30, fontSize: 18, fontWeight: 600, align: "center", rotation: 0, visible: true, treatment: "plate" }]
    }
  }, null, 2);
  const recorded = recordDocumentRevision(rootPath, { ref, relativePath: "documents/maps/lighthouse.map.json", source: baseline, revisionSource: "create", recordedAt: "2026-07-12T00:00:00.000Z" });
  const preview = previewDocumentRevision(rootPath, { ref, revisionId: recorded.revision.id, currentSource: current });

  assert.ok(preview.semanticChanges.some((change) => change.kind === "marker" && /位置/.test(change.detail)));
  assert.ok(preview.semanticChanges.some((change) => change.kind === "layer" && /解锁/.test(change.detail)));
  assert.ok(preview.semanticChanges.some((change) => change.kind === "label" && /移除/.test(change.label)));
  assert.match(preview.preview, /story-visual-document/);
});

test("card presentation revision previews describe author actions without leaking stable block IDs", () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-card-revision-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  const ref = { kind: "card", id: "character.lin" };
  const baseline = JSON.stringify({ version: "story-card-presentation/v2", objectId: ref.id, preset: "character", layout: "horizontal", portrait: null, cover: null, templateRef: null, blocks: [{ id: "card-block.text.01", kind: "text", contentRef: "markdown-body", collapsed: false, size: "large" }], visual: { density: "comfortable", mediaAssets: [] } }, null, 2);
  const current = JSON.stringify({ version: "story-card-presentation/v2", objectId: ref.id, preset: "character", layout: "vertical", portrait: null, cover: null, templateRef: null, blocks: [{ id: "card-block.secret.01", kind: "secret", contentRef: "markdown-section.secret-01", collapsed: true, size: "medium" }, { id: "card-block.text.01", kind: "text", contentRef: "markdown-body", collapsed: true, size: "medium" }], visual: { density: "comfortable", mediaAssets: [] } }, null, 2);
  const revision = recordDocumentRevision(rootPath, { ref, relativePath: "documents/cards/character.lin.card.json", source: baseline, revisionSource: "create", recordedAt: "2026-07-13T00:00:00.000Z", operationId: "card-operation.character.lin.1" });
  const preview = previewDocumentRevision(rootPath, { ref, revisionId: revision.revision.id, currentSource: current });
  assert.ok(preview.semanticChanges.some((change) => change.kind === "layout"));
  assert.ok(preview.semanticChanges.some((change) => change.kind === "block"));
  assert.equal(preview.semanticChanges.some((change) => /card-block\./.test(`${change.label} ${change.detail}`)), false);
  assert.equal(revision.revision.operationId, "card-operation.character.lin.1");
});

test("Graph and Tree revision previews describe relationships, proposals, roots, and layout", () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-graph-tree-revision-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  createWorkspaceNote(rootPath, { id: "character.lin", type: "character", title: "林远", status: "active", body: "# 林远\n" });
  createWorkspaceNote(rootPath, { id: "character.alan", type: "character", title: "阿岚", status: "active", body: "# 阿岚\n" });
  const graphRef = { kind: "visual", id: "graph.core" };
  const graphBaseline = JSON.stringify({ version: "story-visual-document/v1", id: graphRef.id, type: "graph", content: { nodes: [{ id: "node.lin", objectId: "character.lin", x: 0, y: 0 }], edges: [], proposals: [], filters: { objectTypes: [] } } }, null, 2);
  const graphCurrent = JSON.stringify({ version: "story-visual-document/v1", id: graphRef.id, type: "graph", content: { nodes: [{ id: "node.lin", objectId: "character.lin", x: 20, y: 30 }, { id: "node.alan", objectId: "character.alan", x: 240, y: 30 }], edges: [], proposals: [{ id: "proposal.1", source: "node.lin", target: "node.alan", relation: "盟友", direction: "both", origin: "tree", sourceDocumentId: "tree.core" }], filters: { objectTypes: [] } } }, null, 2);
  const graphRevision = recordDocumentRevision(rootPath, { ref: graphRef, relativePath: "documents/graphs/core.graph.json", source: graphBaseline, revisionSource: "create", recordedAt: "2026-07-12T00:00:00.000Z" });
  const graphPreview = previewDocumentRevision(rootPath, { ref: graphRef, revisionId: graphRevision.revision.id, currentSource: graphCurrent });
  assert.ok(graphPreview.semanticChanges.some((change) => change.kind === "node"));
  assert.ok(graphPreview.semanticChanges.some((change) => change.kind === "proposal"));
  assert.equal(graphPreview.semanticChanges.some((change) => /character\.|node\.|proposal\./.test(`${change.label} ${change.detail}`)), false);
  assert.ok(graphPreview.semanticChanges.some((change) => /林远|阿岚/.test(`${change.label} ${change.detail}`)));

  const treeRef = { kind: "visual", id: "tree.core" };
  const treeBaseline = JSON.stringify({ version: "story-visual-document/v1", id: treeRef.id, type: "tree", content: { sourceGraphPath: "documents/graphs/core.graph.json", includedEdgeIds: [], rootObjectIds: [], collapsedObjectIds: [], direction: "LR" } }, null, 2);
  const treeCurrent = JSON.stringify({ version: "story-visual-document/v1", id: treeRef.id, type: "tree", content: { sourceGraphPath: "documents/graphs/core.graph.json", includedEdgeIds: ["edge.1"], rootObjectIds: ["character.lin", "character.alan"], collapsedObjectIds: ["character.lin"], direction: "TB" } }, null, 2);
  const treeRevision = recordDocumentRevision(rootPath, { ref: treeRef, relativePath: "documents/trees/core.tree.json", source: treeBaseline, revisionSource: "create", recordedAt: "2026-07-12T00:00:00.000Z" });
  const treePreview = previewDocumentRevision(rootPath, { ref: treeRef, revisionId: treeRevision.revision.id, currentSource: treeCurrent });
  assert.ok(treePreview.semanticChanges.some((change) => change.kind === "root"));
  assert.ok(treePreview.semanticChanges.some((change) => change.kind === "direction"));
  assert.equal(treePreview.semanticChanges.some((change) => /character\.|edge\./.test(`${change.label} ${change.detail}`)), false);
});

test("Timeline revision previews use current author-facing titles instead of stable IDs", () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-timeline-revision-"));
  createStoryWorkspace({ rootPath, title: "雾中灯塔" });
  createWorkspaceNote(rootPath, { id: "event.letter", type: "event", title: "收到十年前的旧信", status: "committed", frontmatter: { tags: ["作者确认"] }, body: "# 收到十年前的旧信\n" });
  createWorkspaceNote(rootPath, { id: "event.clue", type: "event", title: "地下室线索被部分透露", status: "planned", frontmatter: { tags: ["作者规划"] }, body: "# 地下室线索被部分透露\n" });
  const ref = { kind: "visual", id: "timeline.core" };
  const baseline = JSON.stringify({ version: "story-visual-document/v1", id: ref.id, type: "timeline", content: { lanes: [{ id: "lane.main", title: "主线", order: 0 }], entries: [{ id: "entry.letter", eventId: "event.letter", laneId: "lane.main", order: 0 }], trackViews: [{ id: "track.canon", kind: "canon", refId: null, visible: true, collapsed: false }], dependencies: [], filters: { mode: "all", objectIds: [] }, viewport: { focusedTrackId: null, density: "comfortable" } } }, null, 2);
  const current = JSON.stringify({ version: "story-visual-document/v1", id: ref.id, type: "timeline", content: { lanes: [{ id: "lane.main", title: "主线", order: 0 }], entries: [{ id: "entry.clue", eventId: "event.clue", laneId: "lane.main", order: 0 }, { id: "entry.letter", eventId: "event.letter", laneId: "lane.main", order: 1 }], trackViews: [{ id: "track.canon", kind: "canon", refId: null, visible: true, collapsed: false }, { id: "track.planning", kind: "planning", refId: null, visible: true, collapsed: true }], dependencies: [{ id: "dependency.1", fromEventId: "event.letter", toEventId: "event.clue", kind: "requires" }], filters: { mode: "planning", objectIds: [] }, viewport: { focusedTrackId: "track.planning", density: "compact" } } }, null, 2);
  const revision = recordDocumentRevision(rootPath, { ref, relativePath: "documents/timelines/core.timeline.json", source: baseline, revisionSource: "create", recordedAt: "2026-07-12T00:00:00.000Z" });
  const preview = previewDocumentRevision(rootPath, { ref, revisionId: revision.revision.id, currentSource: current });

  assert.ok(preview.semanticChanges.some((change) => change.kind === "dependency" && /收到十年前的旧信|地下室线索被部分透露/.test(`${change.label} ${change.detail}`)));
  assert.ok(preview.semanticChanges.some((change) => change.kind === "track"));
  assert.equal(preview.semanticChanges.some((change) => /event\.|entry\.|track\.|dependency\./.test(`${change.label} ${change.detail}`)), false);
});
