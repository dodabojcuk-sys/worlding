import assert from "node:assert/strict";
import test from "node:test";

import {
  MULTIVERSE_EVENT_CHANGE_ID,
  buildSingleDerivedSemanticCompare,
  validateSingleEventSelection
} from "../../src/storyWorkspace/multiverseSingleDerivedR0.ts";

const fresh = () => buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false });

test("compare uses the R0 schema", () => assert.equal(fresh().version, "tianyan-multiverse-semantic-compare-r0/v1"));
test("base stays pinned to revision one", () => assert.equal(fresh().base.revision, 1));
test("current exposes the root revision", () => assert.equal(fresh().current.revision, 1));
test("derived exposes its pinned revision", () => assert.equal(fresh().derived.pinnedRevision, 1));
test("compare has four owner-referenced write projections", () => assert.equal(fresh().rows.length, 4));
test("compare exposes all sixteen required author semantic dimensions", () => assert.equal(fresh().signals.length, 16));
test("compare distinguishes narrative order from world time", () => {
  assert.equal(fresh().signals.find((signal) => signal.dimension === "Narrative order")?.state, "changed");
  assert.equal(fresh().signals.find((signal) => signal.dimension === "World time")?.state, "unknown");
});
test("compare exposes Character knowledge and Fate separately", () => {
  assert.equal(fresh().signals.find((signal) => signal.dimension === "Character knowledge")?.state, "unknown");
  assert.equal(fresh().signals.find((signal) => signal.dimension === "Character Fate")?.state, "unchanged");
});
test("Event is the first semantic dimension", () => assert.equal(fresh().rows[0]?.owner, "Event"));
test("Character is represented", () => assert.ok(fresh().rows.some((row) => row.owner === "Character")));
test("WorldState is represented", () => assert.ok(fresh().rows.some((row) => row.owner === "WorldState")));
test("Relation is represented", () => assert.ok(fresh().rows.some((row) => row.owner === "Relation")));
test("Event difference is changed", () => assert.equal(fresh().rows[0]?.state, "changed"));
test("Character stays unchanged", () => assert.equal(fresh().rows[1]?.state, "unchanged"));
test("WorldState stays unchanged", () => assert.equal(fresh().rows[2]?.state, "unchanged"));
test("Relation remains unknown", () => assert.equal(fresh().rows[3]?.state, "unknown"));
test("only one row is selectable", () => assert.equal(fresh().rows.filter((row) => row.selectable).length, 1));
test("selectable row is Event", () => assert.equal(fresh().rows.find((row) => row.selectable)?.owner, "Event"));
test("Event uses the fixed change identity", () => assert.equal(fresh().rows[0]?.changeId, MULTIVERSE_EVENT_CHANGE_ID));
test("Event carries two source references", () => assert.equal(fresh().rows[0]?.sourceRefs.length, 2));
test("Character cannot be selected", () => assert.equal(fresh().rows[1]?.selectable, false));
test("WorldState cannot be selected", () => assert.equal(fresh().rows[2]?.selectable, false));
test("Relation cannot be selected", () => assert.equal(fresh().rows[3]?.selectable, false));
test("valid selection returns Event row", () => assert.equal(validateSingleEventSelection(fresh(), [MULTIVERSE_EVENT_CHANGE_ID]).owner, "Event"));
test("duplicate selection values normalize to one", () => assert.equal(validateSingleEventSelection(fresh(), [MULTIVERSE_EVENT_CHANGE_ID, MULTIVERSE_EVENT_CHANGE_ID]).owner, "Event"));
test("empty selection fails closed", () => assert.throws(() => validateSingleEventSelection(fresh(), []), /exactly one/));
test("unknown selection fails closed", () => assert.throws(() => validateSingleEventSelection(fresh(), ["unknown"]), /exactly one/));
test("two distinct selections fail closed", () => assert.throws(() => validateSingleEventSelection(fresh(), [MULTIVERSE_EVENT_CHANGE_ID, "other"]), /exactly one/));
test("whitespace-only selection fails closed", () => assert.throws(() => validateSingleEventSelection(fresh(), [" "]), /exactly one/));
test("missing source projects insufficient evidence", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false, missingSource: true }).rows[0]?.state, "insufficient"));
test("missing source blocks selection", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false, missingSource: true }).rows[0]?.selectable, false));
test("missing source validation fails", () => assert.throws(() => validateSingleEventSelection(buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false, missingSource: true }), [MULTIVERSE_EVENT_CHANGE_ID]), /unavailable/));
test("stale selection projects stale distinctly", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false, staleSelection: true }).rows[0]?.state, "stale"));
test("stale selection blocks selection", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false, staleSelection: true }).rows[0]?.selectable, false));
test("stale selection validation fails", () => assert.throws(() => validateSingleEventSelection(buildSingleDerivedSemanticCompare({ rootRevision: 1, derivedPinnedRevision: 1, integrated: false, staleSelection: true }), [MULTIVERSE_EVENT_CHANGE_ID]), /stale/));
test("integrated compare projects root revision two", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 2, derivedPinnedRevision: 1, integrated: true }).current.revision, 2));
test("integrated compare keeps derived pin one", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 2, derivedPinnedRevision: 1, integrated: true }).derived.pinnedRevision, 1));
test("integrated Event is no longer selectable", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 2, derivedPinnedRevision: 1, integrated: true }).rows[0]?.selectable, false));
test("integrated Event projects integrated distinctly", () => assert.equal(buildSingleDerivedSemanticCompare({ rootRevision: 2, derivedPinnedRevision: 1, integrated: true }).rows[0]?.state, "integrated"));
test("integrated Event current text is confirmed", () => assert.match(buildSingleDerivedSemanticCompare({ rootRevision: 2, derivedPinnedRevision: 1, integrated: true }).rows[0]?.current || "", /已确认/));
test("integrated selection cannot write again", () => assert.throws(() => validateSingleEventSelection(buildSingleDerivedSemanticCompare({ rootRevision: 2, derivedPinnedRevision: 1, integrated: true }), [MULTIVERSE_EVENT_CHANGE_ID]), /unavailable/));
test("projection contains no merge operation", () => assert.doesNotMatch(JSON.stringify(fresh()), /merge|rebase|sync/i));
test("projection contains no raw provider body", () => assert.doesNotMatch(JSON.stringify(fresh()), /apiKey|rawResponse|prompt/i));
test("Event base and derived are semantically distinct", () => assert.notEqual(fresh().rows[0]?.base, fresh().rows[0]?.derived));
test("unchanged Character base and current match", () => assert.equal(fresh().rows[1]?.base, fresh().rows[1]?.current));
test("unchanged WorldState base and current match", () => assert.equal(fresh().rows[2]?.base, fresh().rows[2]?.current));
