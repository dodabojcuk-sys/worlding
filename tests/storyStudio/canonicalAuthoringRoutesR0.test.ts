import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  creationRouteForMode,
  multiverseRouteForMode,
  readCreationRouteMode,
  readMultiverseRouteMode
} from "../../apps/story-studio/src/product-shell/authoringRouteState.ts";

test("M3 authoring URLs are canonical presentation routes, not new workspaces", () => {
  assert.deepEqual([
    creationRouteForMode("hub"), creationRouteForMode("novel"), creationRouteForMode("screenplay"), creationRouteForMode("comic"), creationRouteForMode("interactive"), creationRouteForMode("translation-adaptation"), creationRouteForMode("plugins")
  ], ["/creation", "/creation/novel", "/creation/screenplay", "/creation/comic", "/creation/interactive", "/creation/translation-adaptation", "/creation/plugins"]);
  assert.deepEqual([
    multiverseRouteForMode(null), multiverseRouteForMode("translation"), multiverseRouteForMode("pov"), multiverseRouteForMode("if"), multiverseRouteForMode("adaptation")
  ], ["/multiverse", "/multiverse/translation", "/multiverse/perspective", "/multiverse/if", "/multiverse/localization"]);
  assert.equal(readCreationRouteMode("/creation/unknown"), "hub");
  assert.equal(readMultiverseRouteMode("/multiverse/unknown"), null);
  assert.equal(readMultiverseRouteMode("/multiverse/pov"), "pov");
  assert.equal(readMultiverseRouteMode("/multiverse/fan-localization"), "adaptation");
});

test("M3 keeps translation/adaptation behind explicit Multiverse preparation and preserves existing owners", () => {
  const creation = readFileSync("apps/story-studio/src/components/CreationHome.tsx", "utf8");
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const multiverse = readFileSync("apps/story-studio/src/components/MultiverseWorkbench.tsx", "utf8");
  assert.match(creation, /先在多元完成来源与审核/);
  assert.match(creation, /不会模拟创建或写入任何产物/);
  assert.match(creation, /props\.routeMode === "translation-adaptation"/);
  assert.match(app, /navigateAuthoringRoute/);
  assert.match(multiverse, /data-multiverse-route="hub"/);
  assert.match(multiverse, /data-multiverse-method={props\.routeMode}/);
  assert.doesNotMatch(creation, /createOutputArtifact/);
  assert.doesNotMatch(multiverse, /relationRepository|RelationGraph/);
});
