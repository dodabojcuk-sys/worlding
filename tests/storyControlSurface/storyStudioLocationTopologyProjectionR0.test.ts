import assert from "node:assert/strict";
import test from "node:test";

import { createLocationTopologyProjection } from "../../src/storyContracts/storyStudioLocationTopology.ts";

test("location topology is a deterministic confirmed-only projection with explicit candidates and region hints", () => {
  const objects = [
    { id: "location.port", title: "港口", type: "location", profile: { fields: { region: { label: "所属区域", value: "北岸", source: "author" as const, confidence: "high" as const, sourceAnchors: [] } } } },
    { id: "location.lighthouse", title: "旧灯塔", type: "location" },
    { id: "character.keeper", title: "守灯人", type: "character" }
  ];
  const relations = [
    { relationId: "relation.port-lighthouse", sourceObjectId: "location.port", targetObjectId: "location.lighthouse", currentTypeLabel: "相邻", relationLabelSnapshot: "相邻", reviewState: "confirmed" as const, archived: false },
    { relationId: "relation.candidate", sourceObjectId: "location.lighthouse", targetObjectId: "location.port", currentTypeLabel: "入口", relationLabelSnapshot: "入口", reviewState: "candidate" as const, archived: false },
    { relationId: "relation.character", sourceObjectId: "character.keeper", targetObjectId: "location.lighthouse", currentTypeLabel: "位于", relationLabelSnapshot: "位于", reviewState: "confirmed" as const, archived: false },
    { relationId: "relation.archived", sourceObjectId: "location.port", targetObjectId: "location.lighthouse", currentTypeLabel: "连通", relationLabelSnapshot: "连通", reviewState: "confirmed" as const, archived: true }
  ];
  const projection = createLocationTopologyProjection({ objects, relations });
  assert.equal(projection.version, "story-location-topology-projection/v1");
  assert.deepEqual(projection.nodes.map((node) => node.objectId), ["location.port", "location.lighthouse"]);
  assert.equal(projection.nodes.find((node) => node.objectId === "location.port")?.region, "北岸");
  assert.deepEqual(projection.confirmedEdges.map((edge) => edge.relationId), ["relation.port-lighthouse"]);
  assert.deepEqual(projection.candidateEdges.map((edge) => edge.relationId), ["relation.candidate"]);
});
