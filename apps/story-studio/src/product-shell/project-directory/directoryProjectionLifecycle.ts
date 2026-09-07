export type DirectoryCoreDisposition =
  | { kind: "commit"; outcome: "ready" | "empty" }
  | { kind: "discard"; reason: "effect-cleanup" | "project-mismatch" };

export function decideDirectoryCoreDisposition(input: {
  requestedProjectId: string;
  responseProjectId: string;
  cancelled: boolean;
  objectCount: number;
  unitCount: number;
}): DirectoryCoreDisposition {
  if (input.cancelled) return { kind: "discard", reason: "effect-cleanup" };
  if (input.responseProjectId !== input.requestedProjectId) return { kind: "discard", reason: "project-mismatch" };
  return { kind: "commit", outcome: input.objectCount === 0 && input.unitCount === 0 ? "empty" : "ready" };
}
