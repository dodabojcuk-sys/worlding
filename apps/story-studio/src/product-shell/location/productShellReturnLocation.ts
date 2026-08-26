import type { WorkspaceSelection } from "../../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import type { ProductWorkspaceMode } from "../navigation/topLevelDestinationRegistry";

export type ProductShellFocusToken = "writing-editor" | "tianyi-launcher" | "workspace";
export type ProductShellTargetKind = "project" | "writing-document" | "world-object" | "visual-document";

export type ProductShellLocationSnapshot = {
  version: "story-studio-product-shell-location/v1";
  projectId: string;
  destination: ProductWorkspaceMode;
  workspaceMode: string;
  showWorldHome: boolean;
  target: { kind: ProductShellTargetKind; id: string; revision: string | null };
  selectionAnchor: WorkspaceSelection;
  editorSelection: { start: number; end: number } | null;
  scrollTop: number;
  focusToken: ProductShellFocusToken;
};

export type ProductShellAvailableTarget = {
  kind: ProductShellTargetKind;
  id: string;
  revision: string | null;
};

export type ProductShellReturnResolution =
  | { state: "exact"; snapshot: ProductShellLocationSnapshot }
  | { state: "nearest-stable-parent"; reason: "target-missing" | "revision-stale"; snapshot: ProductShellLocationSnapshot }
  | { state: "project-mismatch"; snapshot: ProductShellLocationSnapshot };

/** Resolves only stable IDs and revision tokens. It never aliases by title or list position. */
export function resolveProductShellReturnLocation(input: {
  snapshot: ProductShellLocationSnapshot;
  currentProjectId: string;
  availableTargets: ProductShellAvailableTarget[];
}): ProductShellReturnResolution {
  if (input.snapshot.projectId !== input.currentProjectId) {
    return { state: "project-mismatch", snapshot: input.snapshot };
  }
  if (input.snapshot.target.kind === "project") {
    return { state: "exact", snapshot: input.snapshot };
  }
  const current = input.availableTargets.find((target) =>
    target.kind === input.snapshot.target.kind && target.id === input.snapshot.target.id
  );
  if (!current) {
    return { state: "nearest-stable-parent", reason: "target-missing", snapshot: input.snapshot };
  }
  if (input.snapshot.target.revision && current.revision !== input.snapshot.target.revision) {
    return { state: "nearest-stable-parent", reason: "revision-stale", snapshot: input.snapshot };
  }
  return { state: "exact", snapshot: input.snapshot };
}
