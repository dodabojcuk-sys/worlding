/** 纯函数：女娲工作面主焦点解析（无副作用、无依赖，顺序无关）。 */
export type NuwaWorkspaceView =
  | { view: "loading"; reason: "project" | "branches" | "run" }
  | { view: "branch" }
  | { view: "run"; resumable: boolean }
  | { view: "resume-run" }
  | { view: "setup" }
  | { view: "missing-target"; branchId: string }
  | { view: "error"; reason: string };

export type NuwaRouteTarget = { branchId: string | null; nodeId: string | null };
export type NuwaUserIntent = "auto" | "branch" | "run" | "setup";
export type NuwaRunStatus = "ready" | "running" | "paused" | "completed" | "cancelled" | "blocked";
export type NuwaLatestRun = { runId: string; status: NuwaRunStatus } | null;

export type NuwaWorkspaceViewInput = {
  routeTarget: NuwaRouteTarget;
  userIntent: NuwaUserIntent;
  projectLoadState: "loading" | "done" | "missing";
  branchLoadState: "loading" | "done" | "error";
  runLoadState: "loading" | "done" | "error";
  branches: Array<{ workVersionId: string }>;
  latestRun: NuwaLatestRun;
};

const ACTIVE: ReadonlySet<string> = new Set(["running", "paused"]);

/** 决策矩阵：URL 深链优先→作者意图→自动。Provider 不参与。 */
export function resolveNuwaWorkspaceView(input: NuwaWorkspaceViewInput): NuwaWorkspaceView {
  if (input.projectLoadState === "loading") return { view: "loading", reason: "project" };
  if (input.projectLoadState === "missing") return { view: "error", reason: "project-missing" };
  if (input.branchLoadState === "error" || input.runLoadState === "error") return { view: "error", reason: "load-failed" };

  const routeBranchId = input.routeTarget.branchId?.trim() || null;
  if (routeBranchId) {
    if (input.branchLoadState === "loading") return { view: "loading", reason: "branches" };
    if (!input.branches.some((branch) => branch.workVersionId === routeBranchId)) return { view: "missing-target", branchId: routeBranchId };
    return { view: "branch" };
  }
  if (input.userIntent === "branch") {
    if (input.branchLoadState === "loading") return { view: "loading", reason: "branches" };
    if (!input.branches.length) return { view: "missing-target", branchId: "" };
    return { view: "branch" };
  }
  if (input.userIntent === "run") {
    if (input.runLoadState === "loading") return { view: "loading", reason: "run" };
    if (!input.latestRun) return { view: "missing-target", branchId: "" };
    return { view: "run", resumable: input.latestRun.status === "ready" || input.latestRun.status === "paused" };
  }
  if (input.userIntent === "setup") return { view: "setup" };

  if (input.branchLoadState === "loading" || input.runLoadState === "loading") {
    return { view: "loading", reason: input.branchLoadState === "loading" ? "branches" : "run" };
  }
  if (input.latestRun && ACTIVE.has(input.latestRun.status)) return { view: "run", resumable: input.latestRun.status === "paused" };
  if (input.branches.length > 0) return { view: "branch" };
  if (input.latestRun && (input.latestRun.status === "ready" || input.latestRun.status === "completed")) return { view: "resume-run" };
  return { view: "setup" };
}
