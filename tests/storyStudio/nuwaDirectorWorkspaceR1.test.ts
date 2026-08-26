import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const workspace = readFileSync(path.join(root, "apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx"), "utf8");
const routeState = readFileSync(path.join(root, "apps/story-studio/src/components/nuwaRouteState.ts"), "utf8");
const server = readFileSync(path.join(root, "apps/story-studio/server/server.mjs"), "utf8");
const app = readFileSync(path.join(root, "apps/story-studio/src/App.tsx"), "utf8");

test("Nuwa exposes Director and staged longform work inside its existing workspace", () => {
  assert.match(routeState, /"director"/);
  assert.match(routeState, /"longform"/);
  assert.match(workspace, /导演权限 R1/);
  assert.match(workspace, /长篇分阶段编排/);
  assert.match(workspace, /这是一次排演 Run，不是故事事实/);
});

test("Director UI makes forbidden owner powers and Provider zero explicit", () => {
  for (const label of ["确认正史", "永久删除", "发布部署", "跨项目读取", "修改自身权限", "突破预算"]) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /Provider 调用 0/);
  assert.doesNotMatch(workspace, />确认 Canon</);
});

test("Director persistence remains nested under existing Nuwa exploration API", () => {
  assert.match(server, /author-control\/exploration\/director-r1/);
  assert.match(server, /readNuwaDirectorStateR1/);
  assert.match(server, /writeNuwaDirectorStateR1/);
  assert.doesNotMatch(server, /new DirectorStore/);
});

test("Director actions keep an explicit deep-linked Run as their first authority", () => {
  assert.match(app, /resolveNuwaRouteRequest\(window\.location\.search\)\.runId \|\| nuwaSceneRuntime\?\.runId \|\| storyExploration\?\.rehearsal\?\.runId/);
  assert.match(app, /nuwaDirectorRequestRef/);
});
