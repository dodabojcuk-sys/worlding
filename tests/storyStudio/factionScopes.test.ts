import assert from "node:assert/strict";
import test from "node:test";

import { factionScopes, scopeHue } from "../../apps/story-studio/src/components/world/factionScopes.ts";

const MEMBER_TYPE = "relation-type.member.verified";

function fixture() {
  const relations = [
    { relationId: "r1", sourceObjectId: "faction.north", targetObjectId: "character.gu", relationTypeId: MEMBER_TYPE, reviewState: "confirmed" },
    { relationId: "r2", sourceObjectId: "faction.north", targetObjectId: "character.cheng", relationTypeId: MEMBER_TYPE, reviewState: "confirmed" },
    { relationId: "r3", sourceObjectId: "faction.east", targetObjectId: "character.gu", relationTypeId: MEMBER_TYPE, reviewState: "confirmed" },
    { relationId: "r4", sourceObjectId: "faction.east", targetObjectId: "character.lin", relationTypeId: MEMBER_TYPE, reviewState: "confirmed" },
    { relationId: "r5", sourceObjectId: "faction.east", targetObjectId: "character.wang", relationTypeId: MEMBER_TYPE, reviewState: "candidate" },
    { relationId: "r6", sourceObjectId: "faction.north", targetObjectId: "character.lin", relationTypeId: "relation-type.chase", reviewState: "confirmed" },
    { relationId: "r7", sourceObjectId: "faction.north", targetObjectId: "faction.east", relationTypeId: "relation-type.ally", reviewState: "confirmed" },
    { relationId: "r8", sourceObjectId: "character.gu", targetObjectId: "character.cheng", relationTypeId: MEMBER_TYPE, reviewState: "confirmed" }
  ];
  const objects = [
    { id: "faction.north", type: "faction", title: "北闸会" },
    { id: "faction.east", type: "faction", title: "东港行" },
    { id: "character.gu", type: "character", title: "顾澜" },
    { id: "character.cheng", type: "character", title: "程野" },
    { id: "character.lin", type: "character", title: "林昭" },
    { id: "character.wang", type: "character", title: "王五" }
  ];
  return { relations, objects };
}

test("member projection requires the explicit member relation type and keeps overlapping membership", () => {
  const { relations, objects } = fixture();
  const scopes = factionScopes(relations, objects, { memberRelationTypeIds: [MEMBER_TYPE] });
  assert.equal(scopes.length, 2);
  const north = scopes.find((scope) => scope.label === "北闸会")!;
  const east = scopes.find((scope) => scope.label === "东港行")!;
  assert.deepEqual([...north.memberIds], ["character.cheng", "character.gu"]);
  assert.deepEqual([...east.memberIds], ["character.gu", "character.lin"], "顾澜 must belong to both factions");
  assert.equal(north.memberIds.includes("character.lin"), false, "追捕 is not membership");
  assert.equal(scopes.some((scope) => scope.memberIds.includes("character.wang")), false, "candidate membership is not formal membership");
});

test("non-member faction relations never create members even when confirmed", () => {
  const { relations, objects } = fixture();
  const scopes = factionScopes(relations, objects, { memberRelationTypeIds: ["relation-type.ally"] });
  assert.equal(scopes.length, 0, "结盟 is not membership");
});

test("without a verified member mapping the projection is paused and renders nothing", () => {
  const { relations, objects } = fixture();
  assert.deepEqual(factionScopes(relations, objects, { memberRelationTypeIds: [] }), []);
});

test("scope hues are deterministic per org id and stable across reordering", () => {
  assert.equal(scopeHue("faction.north", 0), scopeHue("faction.north", 0));
  assert.notEqual(scopeHue("faction.north", 0), scopeHue("faction.east", 1));
});
