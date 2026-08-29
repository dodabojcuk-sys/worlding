import { isWorkspaceExportPath } from "./workspaceLayoutV1.ts";

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

/** Workspace owner implementation used by Agent artifact ports. */
export function createWorkspacePathPolicy(): WorkspacePathPolicy {
  return Object.freeze({
    assertArtifactRelativePath(input: { projectId: string; relativeId: string; artifactId: string }) {
      const projectId = requireMachineId(input.projectId, "Project identifier");
      const artifactId = requireMachineId(input.artifactId, "Artifact identifier");
      const relativeId = requireLogicalPath(input.relativeId);
      if (!relativeId.startsWith("artifacts/") || !relativeId.endsWith(".md") || !isWorkspaceExportPath(relativeId)) {
        throw new Error("Workspace artifact path is outside the storage-owned artifacts boundary.");
      }
      // The Workspace owner derives the filename from the author-facing title,
      // while the stable artifact id is recorded inside that Markdown note.
      // Validate both receipt fields, but do not invent a second filename rule.
      void projectId;
      void artifactId;
    }
  });
}

function requireMachineId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,159}$/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function requireLogicalPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 320 || value.startsWith("/") || value.includes("\\") || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Workspace artifact path must be a confined logical relative path.");
  }
  return value.normalize("NFC");
}
