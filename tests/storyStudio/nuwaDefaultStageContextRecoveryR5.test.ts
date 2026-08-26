import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveNuwaRouteRequest,
  resolveNuwaWorkspaceStage
} from "../../apps/story-studio/src/components/nuwaRouteState.ts";

test("Nuwa route requests keep a valid explicit stage ahead of per-project presentation continuity", () => {
  const request = resolveNuwaRouteRequest("?stage=review&project=project.current&unit=unit.current&run=run.current&review=review.current");
  assert.equal(request.stage, "review");
  assert.equal(request.projectId, "project.current");
  assert.equal(request.unitId, "unit.current");
  assert.equal(request.runId, "run.current");
  assert.equal(request.reviewId, "review.current");
  assert.equal(resolveNuwaWorkspaceStage(request, "history"), "review");
});

test("Nuwa route parsing never guesses malformed or cross-project object identifiers", () => {
  const request = resolveNuwaRouteRequest("?stage=unknown&project=bad%2Fproject&unit=unit.current&run=bad%20run&review=review.current");
  assert.equal(request.stage, null);
  assert.equal(request.explicitStage, true);
  assert.equal(request.projectId, null);
  assert.equal(request.unitId, "unit.current");
  assert.equal(request.runId, null);
  assert.equal(request.reviewId, "review.current");
  assert.equal(resolveNuwaWorkspaceStage(request, "comparison"), "comparison");
});

test("Nuwa App treats Project, Unit, Run, and Review URL recovery as presentation validation rather than a second owner", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx", "utf8");

  assert.match(app, /resolveNuwaRouteRequest\(window\.location\.search\)/);
  assert.match(app, /routeParameters\.has\("project"\) && !request\.projectId/);
  assert.match(app, /routeParameters\.has\("unit"\) && !request\.unitId/);
  assert.match(app, /routeParameters\.has\("run"\) && !request\.runId/);
  assert.match(app, /routeParameters\.has\("review"\) && !request\.reviewId/);
  assert.match(app, /switchProject\(requestedProject, "nuwa"\)/);
  assert.match(app, /原工作上下文已失效，已返回当前作品。/);
  assert.match(app, /该记录已不存在或不属于当前作品；已返回当前 Unit。/);
  assert.match(app, /readNuwaStage\(library\.project\.id\)/);
  assert.match(app, /rememberNuwaStage\(library\.project\.id, stage\)/);
  assert.match(app, /setBridgeExplorationId\(null\)/);
  assert.match(app, /setNuwaPageDockState\(\{ open: false, activeLens: "context" \}\)/);
  assert.doesNotMatch(workspace, /fetch\(|localStorage|createNuwaRun|createNuwaReview|applyAuthorChangeSet/);
  assert.match(workspace, /aria-label="女娲运行详情" role="tablist"/);
  assert.match(workspace, /onKeyDown=\{\(event\) => moveFocus\(event, item\.id\)\}/);
  assert.match(workspace, /从一个故事开始/);
  assert.match(workspace, /查看历史不会重新执行 Provider/);
  assert.match(workspace, /送入 Impact Review 不等于确认，更不会直接写入 Canon。/);
});
