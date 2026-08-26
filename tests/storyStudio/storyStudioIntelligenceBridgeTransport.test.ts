import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("all Tianyi-Nuwa bridge routes share token, same-origin, bounded JSON, and exact body keys", () => {
  const source = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  for (const route of ["resume", "brief/create", "brief/read", "brief/revise", "brief/approve", "brief/start", "brief/run", "brief/synthesize", "result/read", "result/submit"]) {
    assert.match(source, new RegExp(`"${route.replace("/", "\\/")}"`));
  }
  assert.match(source, /handleIntelligenceBridgeRequest[\s\S]*requireToken\(request\);[\s\S]*requireSameOrigin\(request\);[\s\S]*MAX_CONTINUITY_JSON_BODY_BYTES/);
  assert.match(source, /"brief\/create": \[\["projectId"[\s\S]*"returnDestination"(?:,|\])/);
  assert.match(source, /requireAllowedKeys\(body, definition\[0\]\)/);
  assert.match(source, /tianyiOperations: tianyi/);
  assert.match(source, /submitLegacyExplorationRouteToImpact/);
  assert.doesNotMatch(source, /authorControl\.submitStoryExplorationRouteToImpact\(body\)/);
});
