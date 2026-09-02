import test from "node:test";
import assert from "node:assert/strict";

import { buildTemporalCompositionCache, resolveTemporalTrackProjection, validateTemporalCompositionCache } from "../../src/storyContracts/temporalCompositionCache.ts";
import type { TemporalPlacement } from "../../src/storyContracts/temporalProjection.ts";

const reference = { projectId: "long-night", eventId: "event.branch.1", revisionToken: "a".repeat(64), state: "committed", requestedUse: "constraint" } as const;
const placement: TemporalPlacement = { versionedEventRef: reference, placementKind: "ambiguous", relativePosition: 180, segmentId: "segment.parallel", authoredTimeLabel: null, inferredWindow: { start: 160, end: 220 }, anchorBeforeEventIds: [], anchorAfterEventIds: [], confidence: .72, evidenceRefs: ["source.chapter.3"], authorFacingSummary: "封锁前后的一段区间。", alternatives: [{ relativePosition: 240, label: "也可能发生在封锁之后" }] };

test("temporal composition cache records versioned Events, branch tracks, intervals and source revision metadata", () => {
  const cache = buildTemporalCompositionCache({ sourceManifestDigest: `sha256:${"b".repeat(64)}`, layoutRevision: "temporal-layout.7", placements: [placement], branchTrackByEventId: { [reference.eventId]: "track.harbor-branch" } });
  assert.equal(cache.version, "tianyan-temporal-composition-cache/v1");
  assert.equal(cache.items[0]?.versionedEventRef.revisionToken, reference.revisionToken);
  assert.equal(cache.items[0]?.branchTrack, "track.harbor-branch");
  assert.deepEqual(cache.items[0]?.interval, { start: 160, end: 220 });
  assert.equal(cache.items[0]?.point, null);
  assert.deepEqual(validateTemporalCompositionCache(cache, [reference]), cache);
});

test("temporal composition cache rejects stale Event versions", () => {
  const cache = buildTemporalCompositionCache({ sourceManifestDigest: `sha256:${"c".repeat(64)}`, layoutRevision: "temporal-layout.8", placements: [placement], branchTrackByEventId: {} });
  assert.throws(() => validateTemporalCompositionCache(cache, [{ ...reference, revisionToken: "d".repeat(64) }]), /stale/u);
});

test("ready composition branchTrack changes stable Y-track order and survives refresh", () => {
  const secondReference = { ...reference, eventId: "event.main.2", revisionToken: "e".repeat(64) };
  const secondPlacement = { ...placement, versionedEventRef: secondReference };
  const cache = buildTemporalCompositionCache({ sourceManifestDigest: `sha256:${"f".repeat(64)}`, layoutRevision: "temporal-layout.r10", placements: [placement, secondPlacement], branchTrackByEventId: { [reference.eventId]: "track.parallel", [secondReference.eventId]: "track.primary" } });
  const input = { eventIds: [reference.eventId, secondReference.eventId], fallbackTrackByEventId: { [reference.eventId]: "primary", [secondReference.eventId]: "primary" }, cache };
  const first = resolveTemporalTrackProjection(input);
  const refreshed = resolveTemporalTrackProjection(input);
  assert.equal(first.origin, "ai-suggested");
  assert.equal(first.trackByEventId[reference.eventId], "track.parallel");
  assert.deepEqual(first.tracks.map((track) => [track.id, track.order]), [["track.primary", 0], ["track.parallel", 1]]);
  assert.deepEqual(refreshed, first);
});

test("stale composition remains visible and labeled while invalid cache falls back honestly", () => {
  const stale = resolveTemporalTrackProjection({ eventIds: [reference.eventId], fallbackTrackByEventId: { [reference.eventId]: "primary" }, cache: buildTemporalCompositionCache({ sourceManifestDigest: `sha256:${"1".repeat(64)}`, layoutRevision: "temporal-layout.stale", placements: [placement], branchTrackByEventId: { [reference.eventId]: "track.harbor" } }), stale: true });
  assert.equal(stale.origin, "ai-suggested-stale");
  assert.match(stale.tracks[0]!.label, /^AI 建议/u);
  const invalid = resolveTemporalTrackProjection({ eventIds: [reference.eventId, "event.missing"], fallbackTrackByEventId: { [reference.eventId]: "parallel", "event.missing": "primary" }, cache: null });
  assert.equal(invalid.origin, "author-formal");
  assert.equal(invalid.trackByEventId[reference.eventId], "parallel");
  assert.match(invalid.tracks[0]!.label, /^作者正式/u);
});
