export type CreationSourceViewVisit = Readonly<{ projectId: string | null; generation: number }>;

/** A screen visit, not a persisted project version. It rejects old UI replies. */
export function nextCreationSourceViewVisit(active: CreationSourceViewVisit, projectId: string | null): CreationSourceViewVisit {
  return active.projectId === projectId ? active : { projectId, generation: active.generation + 1 };
}

export function isCurrentCreationSourceViewVisit(active: CreationSourceViewVisit, candidate: CreationSourceViewVisit) {
  return active.projectId === candidate.projectId && active.generation === candidate.generation;
}

export function sameCreationSourceScope(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

export function creationRouteArtifactForProject(input: { currentProjectId: string | null; routeProjectId: string | null; routeArtifactId: string | null; legacyRouteProjectId: string | null }) {
  if (!input.routeArtifactId) return null;
  const boundProjectId = input.routeProjectId || input.legacyRouteProjectId;
  return boundProjectId === input.currentProjectId ? input.routeArtifactId : null;
}
