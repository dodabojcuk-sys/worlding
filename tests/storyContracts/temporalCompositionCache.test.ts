import test from "node:test";
import assert from "node:assert/strict";

import { buildTemporalCompositionCache, validateTemporalCompositionCache } from "../../src/storyContracts/temporalCompositionCache.ts";
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
