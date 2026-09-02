import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const projection = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");

test("R9 exposes Collection Point creation through selection and keyboard context menus", () => {
  assert.match(graph, />创建集点</u);
  assert.match(graph, /event\.shiftKey && event\.key === "F10"/u);
  assert.match(graph, /解散集点（保留 Event）/u);
  assert.match(graph, /formalUnit\?\.collectionPoints/u);
});

test("R9 routes Collection Point mutations through the Story Workspace owner", () => {
  assert.match(projection, /createStoryCollectionPoint/u);
  assert.match(projection, /updateStoryCollectionPoint/u);
  assert.match(projection, /dissolveStoryCollectionPoint/u);
  assert.match(server, /story-collection-points\/create/u);
  assert.match(server, /story-collection-points\/update/u);
  assert.match(server, /story-collection-points\/dissolve/u);
});

test("R9 collapsed Collection Point edges stay explicit visual projections", () => {
  assert.match(graph, /集点折叠投影 · 端点未改/u);
  assert.match(graph, /collapsedMembership/u);
  assert.match(graph, /collection-projection\./u);
});
