/** URL parsing only. App owns session continuity; this module never reads or
 * writes browser storage, Projects, Runs, Reviews, or Canon. */
export const NUWA_WORKSPACE_STAGES = ["rehearsal", "simulation", "director", "longform", "comparison", "review", "history"] as const;

export type NuwaWorkspaceStage = (typeof NUWA_WORKSPACE_STAGES)[number];

export type NuwaRouteRequest = {
  stage: NuwaWorkspaceStage | null;
  explicitStage: boolean;
  projectId: string | null;
  unitId: string | null;
  runId: string | null;
  reviewId: string | null;
};

export function resolveNuwaRouteRequest(search: string): NuwaRouteRequest {
  const params = new URLSearchParams(search);
  const requestedStage = params.get("stage");
  return {
    stage: isNuwaWorkspaceStage(requestedStage) ? requestedStage : null,
    explicitStage: requestedStage !== null,
    projectId: stableId(params.get("project")),
    unitId: stableId(params.get("unit")),
    runId: stableId(params.get("run")),
    reviewId: stableId(params.get("review"))
  };
}

export function resolveNuwaWorkspaceStage(request: NuwaRouteRequest, storedStage: NuwaWorkspaceStage | null): NuwaWorkspaceStage {
  return request.stage || storedStage || "rehearsal";
}

export function isNuwaWorkspaceStage(value: unknown): value is NuwaWorkspaceStage {
  return typeof value === "string" && (NUWA_WORKSPACE_STAGES as readonly string[]).includes(value);
}

function stableId(value: string | null): string | null {
  return value && /^[a-zA-Z0-9._:-]{1,180}$/u.test(value) ? value : null;
}
