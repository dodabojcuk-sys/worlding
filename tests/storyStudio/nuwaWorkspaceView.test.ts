import assert from "node:assert/strict";
import test from "node:test";

import { resolveNuwaWorkspaceView, type NuwaWorkspaceViewInput } from "../../apps/story-studio/src/components/nuwa/nuwaWorkspaceView.ts";

const BR = "work-version.derived.0123456789abcdef0123456789abcdef";
const done = { projectLoadState: "done" as const, branchLoadState: "done" as const, runLoadState: "done" as const };
const branches = [{ workVersionId: BR }];
const base: NuwaWorkspaceViewInput = { routeTarget: { branchId: null, nodeId: null }, userIntent: "auto", ...done, branches, latestRun: null };

const viewOf = (over: Partial<NuwaWorkspaceViewInput>) => resolveNuwaWorkspaceView({ ...base, ...over }).view;

test("状态矩阵 S1-S10", () => {
  assert.equal(viewOf({ latestRun: { runId: "r", status: "ready" } }), "branch");            // S1 有分支+ready → branch
  assert.equal(viewOf({ branches: [], latestRun: null }), "setup");                            // S2 无分支无 Run → setup
  assert.equal(viewOf({ branches: [], latestRun: { runId: "r", status: "ready" } }), "resume-run"); // S2b
  assert.equal(viewOf({ routeTarget: { branchId: BR, nodeId: "n1" } }), "branch");            // S3 深链存在
  assert.equal(viewOf({ routeTarget: { branchId: "work-version.derived.ffffffffffffffffffffffffffffffff", nodeId: null } }), "missing-target"); // S3 目标缺失
  assert.equal(viewOf({ latestRun: { runId: "r", status: "running" } }), "run");               // S5 running
  assert.equal(viewOf({ latestRun: { runId: "r", status: "paused" } }), "run");                // S6 paused
  assert.equal(viewOf({}), "branch");                                                          // S7 有分支无 nodeId
  assert.equal(viewOf({ branchLoadState: "loading", runLoadState: "loading", latestRun: { runId: "r", status: "running" } }), "loading"); // S8
  assert.equal(viewOf({ branchLoadState: "loading" }), "loading");
});

test("Provider 状态不参与主工作面解析（输入中无 Provider 字段即为证明）", () => {
  const keys = Object.keys(base);
  assert.ok(!keys.some((key) => /provider/i.test(key)));
});

test("顺序无关：同一最终数据，branch 先到或 run 先到，视图一致", () => {
  // 到达顺序在组件层表现为中间态序列；这里断言：无论中间经过哪种 loading 序列，
  // 只要最终三元组相同，最终视图相同。
  const final = { routeTarget: { branchId: null as string | null, nodeId: null }, userIntent: "auto" as const, projectLoadState: "done" as const, branchLoadState: "done" as const, runLoadState: "done" as const, branches, latestRun: { runId: "r", status: "running" as const } };
  const sequences: Array<Array<Partial<NuwaWorkspaceViewInput>>> = [
    [{ branchLoadState: "done" as const }, { runLoadState: "done" as const, latestRun: final.latestRun }],
    [{ runLoadState: "done" as const, latestRun: final.latestRun }, { branchLoadState: "done" as const }]
  ];
  const finals = sequences.map((sequence) => {
    let current: NuwaWorkspaceViewInput = { ...base, branchLoadState: "loading", runLoadState: "loading", branches: [], latestRun: null };
    const views: string[] = [];
    for (const patch of sequence) {
      current = { ...current, ...patch };
      views.push(resolveNuwaWorkspaceView(current).view);
    }
    views.push(resolveNuwaWorkspaceView(current).view);
    return views.at(-1);
  });
  assert.equal(finals[0], finals[1]);
  assert.equal(finals[0], "run");
});

test("作者意图优先：后到异步数据不抢焦点；意图目标失效→missing-target", () => {
  assert.equal(viewOf({ userIntent: "run", latestRun: { runId: "r", status: "running" }, branches }), "run");
  assert.equal(viewOf({ userIntent: "branch", latestRun: { runId: "r", status: "running" } }), "branch");
  assert.equal(viewOf({ userIntent: "branch", branches: [] }), "missing-target");
  assert.equal(viewOf({ userIntent: "run", latestRun: null }), "missing-target");
});

test("加载中绝不显示 setup；旧项目响应缺失按 missing/error 呈现", () => {
  assert.equal(viewOf({ branchLoadState: "loading", runLoadState: "loading", branches: [], latestRun: null }), "loading");
  assert.equal(viewOf({ projectLoadState: "missing" }), "error");
});
