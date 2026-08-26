import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createCharacterFateFixtureProjection, CHARACTER_FATE_FIXTURE_EVENTS } from "../../apps/story-studio/src/components/character-fate/characterFateFixture.ts";
import { projectCharacterFate, type CharacterFateProjectionInput } from "../../src/storyContracts/characterFateProjection.ts";

test("complete fixture keeps actual, planned and candidate trajectories semantically separate", () => {
  const projection = createCharacterFateFixtureProjection()!;
  assert.ok(projection.actualTrajectory.length > 0);
  assert.ok(projection.plannedTrajectory.length > 0);
  assert.ok(projection.candidateTrajectory.length > 0);
  assert.ok(projection.actualTrajectory.every((point) => ["confirmed", "conflicted", "stale", "unknown"].includes(point.authority)));
  assert.ok(projection.plannedTrajectory.every((point) => point.authority === "author_planned"));
  assert.ok(projection.candidateTrajectory.every((point) => ["candidate", "inferred", "unknown", "conflicted", "stale"].includes(point.authority)));
  assert.ok(projection.unknownIntervals.length > 0);
  assert.ok(projection.conflictRecords.length > 0);
});

test("projection reuses known Event IDs, preserves narrative order and never invents unknown world time", () => {
  const projection = createCharacterFateFixtureProjection()!;
  const known = new Set(CHARACTER_FATE_FIXTURE_EVENTS.map((event) => event.id));
  const points = [...projection.actualTrajectory, ...projection.plannedTrajectory, ...projection.candidateTrajectory];
  assert.ok(points.every((point) => known.has(point.eventId)));
  const unknown = points.find((point) => point.worldTime.kind === "unknown")!;
  assert.equal(unknown.worldTime.sortKey, null);
  assert.equal(unknown.worldTime.label, "未知时间");
  assert.ok(points.every((point) => Number.isInteger(point.narrativeOrder)));
});

test("Character rename keeps stable Character and point identity while revision remains explicit", () => {
  const original = createCharacterFateFixtureProjection()!;
  const renamed = createCharacterFateFixtureProjection({ renamedCharacter: "沈砚（修订名）" })!;
  assert.equal(renamed.characterId, original.characterId);
  assert.notEqual(renamed.characterName, original.characterName);
  assert.deepEqual(renamed.actualTrajectory.map((point) => point.pointId), original.actualTrajectory.map((point) => point.pointId));
});

test("branch, character and scope isolation never borrow points from another owner", () => {
  const main = createCharacterFateFixtureProjection()!;
  const missingBranch = createCharacterFateFixtureProjection({ branchId: "branch.missing" })!;
  const aWu = createCharacterFateFixtureProjection({ characterId: "fixture.character.a-wu" })!;
  assert.equal(missingBranch.actualTrajectory.length + missingBranch.plannedTrajectory.length + missingBranch.candidateTrajectory.length, 0);
  assert.ok(aWu.actualTrajectory.every((point) => point.characterId === "fixture.character.a-wu"));
  assert.ok(main.actualTrajectory.every((point) => point.branchId === "branch.main"));
});

test("single, planned-only, actual-only, unknown, conflict, stale, rejected and empty fixtures stay honest", () => {
  assert.equal(createCharacterFateFixtureProjection({ fixtureCase: "single" })!.actualTrajectory.length, 1);
  assert.equal(createCharacterFateFixtureProjection({ fixtureCase: "planned-only" })!.actualTrajectory.length, 0);
  assert.equal(createCharacterFateFixtureProjection({ fixtureCase: "actual-only" })!.plannedTrajectory.length, 0);
  assert.ok(createCharacterFateFixtureProjection({ fixtureCase: "unknown-only" })!.unknownIntervals.length > 0);
  assert.ok(createCharacterFateFixtureProjection({ fixtureCase: "conflict" })!.conflictRecords.length > 0);
  assert.ok(createCharacterFateFixtureProjection({ fixtureCase: "stale" })!.actualTrajectory.every((point) => point.stale));
  assert.equal(createCharacterFateFixtureProjection({ fixtureCase: "rejected" })!.candidateTrajectory.length, 0);
  const empty = createCharacterFateFixtureProjection({ fixtureCase: "empty-branch" })!;
  assert.equal(empty.actualTrajectory.length + empty.plannedTrajectory.length + empty.candidateTrajectory.length, 0);
});

test("invalid authorities, fabricated Event IDs and confirmed points without source anchors fail closed", () => {
  const valid = baseInput();
  assert.throws(() => projectCharacterFate({ ...valid, observations: [{ ...valid.observations[0]!, eventId: "event.fabricated" }] }), /reuse an existing Event ID/);
  assert.throws(() => projectCharacterFate({ ...valid, observations: [{ ...valid.observations[0]!, sourceAnchorIds: [] }] }), /require a source anchor/);
  assert.throws(() => projectCharacterFate({ ...valid, observations: [{ ...valid.observations[0]!, trajectory: "actual", authority: "candidate" }] as CharacterFateProjectionInput["observations"] }), /Actual trajectory/);
});

test("Data UI exposes equivalent table, evidence states, Event drill-down and fixture-only Work Dock", () => {
  const workspace = readFileSync("apps/story-studio/src/components/character-fate/CharacterFateWorkspace.tsx", "utf8");
  const dock = readFileSync("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  assert.match(workspace, /角色命运 K 线/);
  assert.match(workspace, /图表的等价表格/);
  assert.match(workspace, /来源冲突/);
  assert.match(workspace, /来源过期/);
  assert.match(workspace, /未知 · 不插值/);
  assert.match(workspace, /onOpenEventLine/);
  assert.match(workspace, /history\.state/);
  assert.match(dock, /CharacterFateFixtureWorkDock/);
  assert.match(dock, /data-real-provider-calls="0"/);
  assert.match(app, /returnToData/);
});

function baseInput(): CharacterFateProjectionInput {
  return {
    project: { id: "project.1", version: "v1" },
    character: { id: "character.1", revision: "v1", name: "角色" },
    branchId: "branch.1",
    scope: "主线",
    knownEventIds: ["event.1"],
    generatedAt: "2026-08-23T08:00:00.000Z",
    observations: [{ observationId: "observation.1", characterId: "character.1", eventId: "event.1", unitId: "unit.1", unitLabel: "单元", setPointId: "set.1", setPointLabel: "集点", storylineIds: ["storyline.1"], narrativeOrder: 1, worldTime: { kind: "exact", label: "08:00", sortKey: "08:00" }, stateDimension: "knowledge", stateDimensionLabel: "知识", valueBefore: "未知", valueAfter: "知道", changeKind: "knowledge", trajectory: "actual", authority: "confirmed", sourceAnchorIds: ["source.1"], explanation: "来源明确。", confidence: "author", stale: false, conflictGroupId: null, knowledgeBoundary: "只知道当前事实。", branchId: "branch.1", scope: "主线" }]
  };
}
