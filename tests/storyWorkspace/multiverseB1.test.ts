import assert from "node:assert/strict";
import test from "node:test";
import { compareMultiverseB1Versions, planMultiverseB1Merge, type MultiverseVersionSnapshot } from "../../src/storyWorkspace/multiverseB1.ts";

const base: MultiverseVersionSnapshot = {
  projectId: "north-gate", workVersionId: "work-version.root.north-gate", revision: 4, manifestDigest: "base-manifest",
  objects: {
    Event: [{ id: "event.key-transfer", value: { title: "林昭保留铜钥匙", actors: ["character.lin"] }, sourceRefs: ["event.key-transfer"] }],
    Relation: [{ id: "relation.lin-awu", value: { source: "character.lin", target: "character.awu", direction: "forward", type: "trust", validFrom: "T1" }, sourceRefs: ["relation.lin-awu"] }],
    WorldState: [{ id: "state.copper-key", value: { itemId: "item.copper-key", holderId: "character.lin" }, sourceRefs: ["event.key-transfer"], dependencyIds: ["event.key-transfer"] }, { id: "state.north-gate", value: { placeId: "place.north-gate", access: "closed" }, sourceRefs: ["event.gate"] }],
    NarrativePlacement: [{ id: "placement.key-transfer", value: { storyUnitId: "unit.one", eventId: "event.key-transfer", position: 1 }, sourceRefs: ["event.key-transfer"], dependencyIds: ["event.key-transfer"] }]
  }
};

function snapshot(workVersionId: string, revision: number, manifestDigest: string, patch: Partial<MultiverseVersionSnapshot["objects"]>): MultiverseVersionSnapshot {
  return { ...base, workVersionId, revision, manifestDigest, objects: { ...base.objects, ...patch } };
}

test("B1 compares Event, Relation, N4 state and NarrativePlacement by stable identity", () => {
  const source = snapshot("work-version.derived.north-gate", 2, "if-manifest", {
    Event: [{ id: "event.key-transfer", value: { title: "林昭将铜钥匙交给阿芜", actors: ["character.lin", "character.awu"] }, sourceRefs: ["event.key-transfer.if"] }],
    Relation: [{ id: "relation.lin-awu", value: { source: "character.lin", target: "character.awu", direction: "forward", type: "trust", validFrom: "T2" }, sourceRefs: ["relation.lin-awu.if"] }],
    WorldState: [{ id: "state.copper-key", value: { itemId: "item.copper-key", holderId: "character.awu" }, sourceRefs: ["event.key-transfer.if"], dependencyIds: ["event.key-transfer"] }, ...base.objects.WorldState.slice(1)],
    NarrativePlacement: [{ id: "placement.key-transfer", value: { storyUnitId: "unit.one", eventId: "event.key-transfer", position: 2 }, sourceRefs: ["event.key-transfer.if"], dependencyIds: ["event.key-transfer"] }]
  });
  const target = snapshot("work-version.root.north-gate", 4, "target-manifest", {});
  const compared = compareMultiverseB1Versions({ base, source, target });
  assert.equal(compared.differences.filter((item) => item.selection === "available").length, 4);
  assert.equal(compared.differences.find((item) => item.objectId === "state.copper-key")?.state, "changed");
  const plan = planMultiverseB1Merge({ comparison: compared, selectedChangeIds: ["multiverse-b1.worldstate.state.copper-key"], operationId: "author.merge.key", idempotencyKey: "merge-key-0001", currentTarget: target });
  assert.deepEqual(plan.requiredChangeIds, ["multiverse-b1.event.event.key-transfer"]);
  assert.deepEqual(plan.ownerWriteOrder, ["Event", "WorldState"]);
});

test("B1 blocks divergent dual-side content and stale target writes", () => {
  const source = snapshot("work-version.derived.north-gate", 2, "if-manifest", { WorldState: [{ id: "state.copper-key", value: { itemId: "item.copper-key", holderId: "character.awu" }, sourceRefs: ["if"] }] });
  const target = snapshot("work-version.root.north-gate", 5, "target-manifest", { WorldState: [{ id: "state.copper-key", value: { itemId: "item.copper-key", holderId: "character.lu" }, sourceRefs: ["target"] }] });
  const compared = compareMultiverseB1Versions({ base, source, target });
  const change = compared.differences.find((item) => item.objectId === "state.copper-key")!;
  assert.equal(change.state, "conflict");
  assert.equal(change.selection, "blocked-conflict");
  assert.throws(() => planMultiverseB1Merge({ comparison: compared, selectedChangeIds: [change.changeId], operationId: "author.conflict", idempotencyKey: "merge-conflict-0001", currentTarget: { ...target, revision: 6 } }), /changed after comparison/u);
});
