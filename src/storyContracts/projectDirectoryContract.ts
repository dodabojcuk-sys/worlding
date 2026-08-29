/**
 * Read-only navigation projection for the global project directory.
 *
 * It owns labels, ordering and stable references only. Canon, Event,
 * WorldState, prose, memory and file-system paths remain in existing owners.
 */
export type ProjectDirectoryNodeKind = "group" | "category" | "reference";

export type ProjectDirectoryStableReference = {
  objectId: string;
  version: string;
  sourceId: string | null;
  projectId: string;
  workVersionId: string | null;
  objectType: string;
};

export type ProjectDirectoryNode = {
  id: string;
  label: string;
  kind: ProjectDirectoryNodeKind;
  count?: number;
  children?: readonly ProjectDirectoryNode[];
  reference?: ProjectDirectoryStableReference;
  aliases?: readonly string[];
  breadcrumb?: readonly string[];
};

export type ProjectDirectoryProjection = {
  projectId: string;
  workVersionId: string | null;
  pendingCount: number;
  classifiedCount: number;
  groups: readonly ProjectDirectoryNode[];
};

export function projectDirectoryContainsStableReferences(projection: ProjectDirectoryProjection): boolean {
  const visit = (nodes: readonly ProjectDirectoryNode[]): boolean => nodes.every((node) => {
    if (node.kind === "reference" && !node.reference) return false;
    return !node.children || visit(node.children);
  });
  return visit(projection.groups);
}
