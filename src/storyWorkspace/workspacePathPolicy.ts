/**
 * Product-owned path decision port for future storage backends.
 * Agent and Pi code may pass logical artifact identifiers only; implementations stay
 * inside the Workspace owner and must never expose an absolute project path.
 */
export interface WorkspacePathPolicy {
  assertArtifactRelativePath(input: {
    projectId: string;
    relativeId: string;
    artifactId: string;
  }): void;
}
