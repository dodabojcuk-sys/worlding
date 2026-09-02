import assert from "node:assert/strict";
import test from "node:test";

import { temporalTrackProjection } from "../../src/storyContracts/temporalCoordinateTracks.ts";

test("timeline zoom changes detail but preserves every track identity and coordinate", () => {
  const far = temporalTrackProjection("far");
  const near = temporalTrackProjection("near");
  assert.deepEqual(far.map(({ id, label, coordinateY }) => ({ id, label, coordinateY })), near.map(({ id, label, coordinateY }) => ({ id, label, coordinateY })));
  assert.equal(far.every((track) => track.detail === "compact"), true);
  assert.equal(near.every((track) => track.detail === "expanded"), true);
  assert.equal(far.some((track) => /第\s*1\s*夜|night/iu.test(track.label)), false);
});
