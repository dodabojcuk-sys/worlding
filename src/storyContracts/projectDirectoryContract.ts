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
  sourceId: string;
};

export type ProjectDirectoryNode = {
  id: string;
  label: string;
  kind: ProjectDirectoryNodeKind;
  count?: number;
  children?: readonly ProjectDirectoryNode[];
  reference?: ProjectDirectoryStableReference;
};

export type ProjectDirectoryProjection = {
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
