import assert from "node:assert/strict";
import test from "node:test";

import { createLocationTopologyProjection, createTypedLocationStructureProjection } from "../../src/storyContracts/storyStudioLocationTopology.ts";

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

test("geography and administration use separately selected relation types", () => {
  const objects = [
    { id: "location.fog-harbor", title: "雾港", type: "location" },
    { id: "location.north-bay", title: "北湾", type: "location" },
    { id: "location.pine-forest", title: "松林", type: "location" },
    { id: "location.east-prefecture", title: "东郡", type: "location" },
    { id: "location.west-prefecture", title: "西郡", type: "location" }
  ];
  const relations = [
    { relationId: "geo.harbor-bay", sourceObjectId: "location.fog-harbor", targetObjectId: "location.north-bay", relationTypeId: "type.geo-contained", currentTypeLabel: "空间包含", relationLabelSnapshot: "空间包含", reviewState: "confirmed" as const, archived: false },
    { relationId: "admin.harbor-east", sourceObjectId: "location.fog-harbor", targetObjectId: "location.east-prefecture", relationTypeId: "type.admin-governs", currentTypeLabel: "行政管辖", relationLabelSnapshot: "行政管辖", reviewState: "confirmed" as const, archived: false },
    { relationId: "admin.forest-east", sourceObjectId: "location.pine-forest", targetObjectId: "location.east-prefecture", relationTypeId: "type.admin-governs", currentTypeLabel: "行政管辖", relationLabelSnapshot: "行政管辖", reviewState: "confirmed" as const, archived: false },
    { relationId: "admin.forest-west", sourceObjectId: "location.pine-forest", targetObjectId: "location.west-prefecture", relationTypeId: "type.admin-governs", currentTypeLabel: "行政管辖", relationLabelSnapshot: "行政管辖", reviewState: "confirmed" as const, archived: false },
    { relationId: "legacy.ambiguous", sourceObjectId: "location.pine-forest", targetObjectId: "location.north-bay", relationTypeId: "type.legacy", currentTypeLabel: "位于", relationLabelSnapshot: "位于", reviewState: "confirmed" as const, archived: false }
  ];
  const rule = { geographyRelationTypeIds: ["type.geo-contained"], administrationRelationTypeIds: ["type.admin-governs"] };
  const geography = createTypedLocationStructureProjection({ objects, relations, rule, kind: "geography" });
  const administration = createTypedLocationStructureProjection({ objects, relations, rule, kind: "administration" });
  assert.deepEqual(geography.edges.map((edge) => edge.relationId), ["geo.harbor-bay"]);
  assert.deepEqual(administration.edges.map((edge) => edge.relationId), ["admin.harbor-east", "admin.forest-east", "admin.forest-west"]);
  assert.equal(administration.childrenByParentId.get("location.east-prefecture")?.length, 2);
  assert.equal(geography.unclassifiedRelationCount, 4);
});
