import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyGraphRelationFixtureMigration,
  previewGraphRelationMigration,
  readRelationRepository
} from "../../src/storyWorkspace/relationRepository.mjs";
import {
  createStoryWorkspace,
  createWorkspaceNote
} from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  createVisualDocument,
  readVisualDocument,
  updateVisualDocument
} from "../../src/storyWorkspace/visualDocumentRepository.mjs";
import {
  acceptRelationProposal,
  createRelationProposal,
  immediateNeighborhood,
  rejectRelationProposal,
  shortestRelationshipPath
} from "../../apps/story-studio/src/lib/graphAuthoring.ts";

function createFixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-relation-authority-"));
  createStoryWorkspace({ rootPath, title: "关系权威测试" });
  const actor = createWorkspaceNote(rootPath, { id: "character.actor", type: "character", title: "甲", status: "active", body: "# 甲\n" });
  const location = createWorkspaceNote(rootPath, { id: "location.clocktower", type: "location", title: "钟楼", status: "active", body: "# 钟楼\n" });
  const item = createWorkspaceNote(rootPath, { id: "item.seal", type: "item", title: "印章", status: "active", body: "# 印章\n" });
  return { rootPath, actor, location, item };
}

function nodes(fixture: ReturnType<typeof createFixture>) {
  return [
    { id: "node.actor", objectId: fixture.actor.id, x: 0, y: 0 },
    { id: "node.location", objectId: fixture.location.id, x: 180, y: 0 },
    { id: "node.item", objectId: fixture.item.id, x: 360, y: 0 }
  ];
}

test("new GraphDocument persists only relation references while the repository owns semantic fields", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "唯一关系图",
    content: {
      nodes: nodes(fixture),
      edges: [{ id: "edge.guard", source: "node.actor", target: "node.location", relation: "守护", direction: "forward" }],
      proposals: [],
      filters: { objectTypes: [] }
    }
  });
  const source = readFileSync(path.join(fixture.rootPath, graph.relativePath), "utf8");
  assert.doesNotMatch(source, /"edges"|"proposals"|"relationLabelSnapshot"|"evidenceRefs"/);
  assert.match(source, /"relationRefs"/);
  assert.equal(graph.content.relationAuthority?.status, "ready");
  const store = readRelationRepository(fixture.rootPath);
  assert.equal(store.relations.length, 1);
  assert.equal(store.relations[0].sourceObjectId, fixture.actor.id);
  assert.equal(store.relations[0].targetObjectId, fixture.location.id);
  assert.equal(store.relations[0].reviewState, "confirmed");
  assert.equal(store.relations[0].evidenceRefs[0].kind, "legacy-unanchored");
  assert.match(store.relations[0].evidenceRefs[0].payloadHash, /^[a-f0-9]{64}$/);
  assert.match(store.relations[0].provenance.legacyEdgePayloadHash, /^[a-f0-9]{64}$/);
  assert.equal(store.relations[0].provenance.conversionVersion, "story-relation-projection/v1");
});

test("same endpoints support independent relations and same legacy EdgeId is graph-scoped", () => {
  const fixture = createFixture();
  const first = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "第一图",
    content: {
      nodes: nodes(fixture),
      edges: [
        { id: "edge.same", source: "node.actor", target: "node.location", relation: "守护", direction: "forward" },
        { id: "edge.other", source: "node.actor", target: "node.location", relation: "监视", direction: "forward" }
      ],
      proposals: [],
      filters: { objectTypes: [] }
    }
  });
  const second = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "第二图",
    content: {
      nodes: nodes(fixture),
      edges: [{ id: "edge.same", source: "node.actor", target: "node.location", relation: "守护", direction: "forward" }],
      proposals: [],
      filters: { objectTypes: [] }
    }
  });
  const store = readRelationRepository(fixture.rootPath);
  assert.equal(store.relations.length, 3);
  const firstSame = first.content.edges.find((edge) => edge.id === "edge.same")?.relationId;
  const secondSame = second.content.edges.find((edge) => edge.id === "edge.same")?.relationId;
  assert.ok(firstSame && secondSame);
  assert.notEqual(firstSame, secondSame);
  assert.notEqual(first.content.edges[0].relationId, first.content.edges[1].relationId);
});

test("candidate accept/reject uses one relationId and durable exactly-once receipts", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, { type: "graph", title: "审查图", content: { nodes: nodes(fixture), edges: [], proposals: [], filters: { objectTypes: [] } } });
  const pending = createRelationProposal({
    document: graph,
    anchorObjectId: fixture.actor.id,
    targetObjectId: fixture.item.id,
    relation: "持有",
    direction: "forward",
    placement: "right",
    origin: "graph",
    sourceDocumentId: graph.id
  });
  const pendingSaved = updateVisualDocument(fixture.rootPath, { relativePath: graph.relativePath, expectedContentHash: graph.contentHash, document: pending.document });
  assert.equal(pendingSaved.conflict, false);
  const candidate = readRelationRepository(fixture.rootPath).relations.find((relation) => relation.reviewState === "candidate");
  assert.ok(candidate);
  const candidateRelationId = candidate.relationId;
  const accepted = acceptRelationProposal(pendingSaved.document, pendingSaved.document.content.proposals[0].id);
  assert.equal(accepted.edge.relationId, candidateRelationId);
  const acceptedSaved = updateVisualDocument(fixture.rootPath, { relativePath: graph.relativePath, expectedContentHash: pendingSaved.document.contentHash, document: accepted.document });
  assert.equal(acceptedSaved.conflict, false);
  const afterAccept = readRelationRepository(fixture.rootPath);
  const confirmed = afterAccept.relations.find((relation) => relation.relationId === candidateRelationId)!;
  assert.equal(confirmed.reviewState, "confirmed");
  assert.equal(confirmed.decisionReceipt?.decision, "confirmed");
  const receiptCount = afterAccept.receipts.length;

  const secondPending = createRelationProposal({
    document: acceptedSaved.document,
    anchorObjectId: fixture.location.id,
    targetObjectId: fixture.item.id,
    relation: "位于",
    direction: "forward",
    placement: "right",
    origin: "graph",
    sourceDocumentId: graph.id
  });
  const secondPendingSaved = updateVisualDocument(fixture.rootPath, { relativePath: graph.relativePath, expectedContentHash: acceptedSaved.document.contentHash, document: secondPending.document });
  const rejectedDocument = rejectRelationProposal(secondPendingSaved.document, secondPendingSaved.document.content.proposals[0].id);
  const rejectedSaved = updateVisualDocument(fixture.rootPath, { relativePath: graph.relativePath, expectedContentHash: secondPendingSaved.document.contentHash, document: rejectedDocument });
  assert.equal(rejectedSaved.conflict, false);
  const afterReject = readRelationRepository(fixture.rootPath);
  const rejected = afterReject.relations.find((relation) => relation.relationLabelSnapshot === "位于")!;
  assert.equal(rejected.reviewState, "rejected");
  assert.equal(rejected.archived, true);
  assert.equal(rejected.decisionReceipt?.decision, "rejected");
  assert.equal(afterReject.receipts.filter((receipt) => receipt.relationId === rejected.relationId).length, 2);

  const replay = updateVisualDocument(fixture.rootPath, { relativePath: graph.relativePath, expectedContentHash: rejectedSaved.document.contentHash, document: rejectedSaved.document });
  assert.equal(replay.conflict, false);
  assert.equal(readRelationRepository(fixture.rootPath).receipts.length, afterReject.receipts.length);
  assert.equal(receiptCount < afterReject.receipts.length, true);
});

test("legacy graph read is zero-write, preview is composite-keyed, fixture apply is deterministic and idempotent", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, { type: "graph", title: "旧图", content: { nodes: nodes(fixture), edges: [], proposals: [], filters: { objectTypes: [] } } });
  const graphPath = path.join(fixture.rootPath, graph.relativePath);
  const legacySource = JSON.parse(readFileSync(graphPath, "utf8"));
  delete legacySource.content.relationRefs;
  delete legacySource.content.relationAuthority;
  legacySource.content.edges = [{ id: "edge.legacy", source: "node.actor", target: "node.location", relation: "守护", direction: "forward" }];
  legacySource.content.proposals = [{ id: "proposal.legacy", source: "node.location", target: "node.item", relation: "知道", direction: "forward", origin: "tree", sourceDocumentId: "tree.legacy" }];
  writeFileSync(graphPath, `${JSON.stringify(legacySource, null, 2)}\n`, "utf8");
  const beforeStore = path.join(fixture.rootPath, ".world-os/relations/relations.json");
  assert.equal(existsSync(beforeStore), false);
  const legacy = readVisualDocument(fixture.rootPath, graph.relativePath);
  assert.equal(legacy.content.relationAuthority?.status, "legacy-readonly");
  assert.equal(existsSync(beforeStore), false);
  assert.throws(() => updateVisualDocument(fixture.rootPath, { relativePath: graph.relativePath, expectedContentHash: legacy.contentHash, document: legacy }), /migration is required/i);

  const preview = previewGraphRelationMigration(fixture.rootPath, { graphDocumentId: graph.id, sourceRevision: legacy.contentHash, content: legacy.content });
  assert.match(preview.previewedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(preview.conversionVersion, "story-relation-projection/v1");
  assert.equal(preview.relationRefs.length, 2);
  assert.match(preview.relationRefs[0].relationId, /relation\.legacy/);
  assert.notEqual(preview.relationRefs[0].relationId, preview.relationRefs[1].relationId);
  assert.deepEqual(preview.relations[0].evidenceRefs[0].kind, "legacy-unanchored");
  const applied = applyGraphRelationFixtureMigration(fixture.rootPath, { fixture: true, graphDocumentId: graph.id, sourceRevision: legacy.contentHash, content: legacy.content });
  assert.equal(applied.content.relationAuthority?.status, "ready");
  const once = readRelationRepository(fixture.rootPath);
  const replay = applyGraphRelationFixtureMigration(fixture.rootPath, { fixture: true, graphDocumentId: graph.id, sourceRevision: legacy.contentHash, content: legacy.content });
  const twice = readRelationRepository(fixture.rootPath);
  assert.deepEqual(replay.relationRefs, applied.relationRefs);
  assert.equal(twice.revision, once.revision);
  assert.equal(twice.receipts.length, once.receipts.length);
});

test("unknown GraphNode endpoints fail closed without creating a WorldObject", () => {
  const fixture = createFixture();
  assert.throws(() => createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "非法端点",
    content: {
      nodes: [{ id: "node.unknown", objectId: "character.missing", x: 0, y: 0 }, { id: "node.actor", objectId: fixture.actor.id, x: 100, y: 0 }],
      edges: [{ id: "edge.invalid", source: "node.unknown", target: "node.actor", relation: "关联", direction: "forward" }],
      proposals: [],
      filters: { objectTypes: [] }
    }
  }), /unknown world object|stable WorldObject reference/i);
  assert.equal(readRelationRepository(fixture.rootPath).relations.length, 0);
});

test("default traversal is directional and undirected exploration is explicit", () => {
  const fixture = createFixture();
  const graph = createVisualDocument(fixture.rootPath, {
    type: "graph",
    title: "方向图",
    content: {
      nodes: nodes(fixture),
      edges: [
        { id: "edge.forward", source: "node.actor", target: "node.location", relation: "守护", direction: "forward" },
        { id: "edge.reverse", source: "node.location", target: "node.item", relation: "被持有", direction: "reverse" }
      ],
      proposals: [],
      filters: { objectTypes: [] }
    }
  });
  assert.deepEqual([...immediateNeighborhood(graph, fixture.actor.id)].sort(), ["node.actor", "node.location"]);
  assert.deepEqual([...immediateNeighborhood(graph, fixture.location.id)].sort(), ["node.location"]);
  assert.deepEqual([...immediateNeighborhood(graph, fixture.actor.id, undefined, "undirected")].sort(), ["node.actor", "node.location"]);
  assert.deepEqual(shortestRelationshipPath(graph, fixture.item.id, fixture.actor.id), null);
  assert.deepEqual(shortestRelationshipPath(graph, fixture.item.id, fixture.actor.id, undefined, "undirected")?.edgeIds, ["edge.reverse", "edge.forward"]);
});
