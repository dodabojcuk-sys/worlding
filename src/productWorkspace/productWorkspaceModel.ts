export type CoreWorkspaceSpaceId = "world" | "create" | "ai" | "extend" | "inspect";
export type WorkspaceSpaceId = CoreWorkspaceSpaceId | (string & {});
export type WorkspaceMode = "understanding" | "creation" | "collaboration" | "extension" | "inspection";

export type WorldSpaceConcept = "timeline" | "replay" | "cognition" | "prediction" | "branch";
export type CreateSpaceConcept = "chapter" | "draft" | "keyframe" | "revision" | "ai_assist";
export type AiSpaceConcept = "conversation" | "suggestions" | "tasks" | "active_skills" | "memory_context";
export type ExtendSpaceConcept = "skills" | "plugins" | "workflows";
export type InspectSpaceConcept = "history" | "changes" | "validation";
export type WorkspaceConcept =
  | WorldSpaceConcept
  | CreateSpaceConcept
  | AiSpaceConcept
  | ExtendSpaceConcept
  | InspectSpaceConcept
  | (string & {});

export type ProductWorkspaceSpace = {
  id: WorkspaceSpaceId;
  label: string;
  mode: WorkspaceMode;
  purpose: string;
  concepts: WorkspaceConcept[];
  primaryAction: string;
  secondaryAction: string;
  visibleConcepts: WorkspaceConcept[];
};

export type ProductWorkspace = {
  version: "world-os-product-workspace-model-v2";
  spaces: Record<WorkspaceSpaceId, ProductWorkspaceSpace>;
  defaultUserPath: WorkspaceSpaceId[];
};

export type WorkspaceState = {
  version: "world-os-workspace-state-v2";
  activeSpaceId: WorkspaceSpaceId;
  mode: WorkspaceMode;
  primaryAction: string;
  secondaryAction: string;
  visibleConcepts: WorkspaceConcept[];
  availableSpaces: WorkspaceSpaceId[];
  deterministic: true;
};

export type WorkspaceStateValidation = {
  valid: boolean;
  violations: string[];
};

export function createProductWorkspace(): ProductWorkspace {
  const spaces = {
    world: space({
      id: "world",
      label: "World",
      mode: "understanding",
      purpose: "Understand the current world through observation surfaces.",
      concepts: ["timeline", "replay", "cognition", "prediction", "branch"],
      primaryAction: "Understand current world",
      secondaryAction: "Compare possible branches",
      visibleConcepts: ["timeline", "replay", "cognition"]
    }),
    create: space({
      id: "create",
      label: "Create",
      mode: "creation",
      purpose: "Continue daily authoring work around the current chapter.",
      concepts: ["chapter", "draft", "keyframe", "revision", "ai_assist"],
      primaryAction: "Continue chapter",
      secondaryAction: "Revise with keyframe checks",
      visibleConcepts: ["chapter", "draft", "keyframe"]
    }),
    ai: space({
      id: "ai",
      label: "AI",
      mode: "collaboration",
      purpose: "Coordinate assisted writing context and suggestions.",
      concepts: ["conversation", "suggestions", "tasks", "active_skills", "memory_context"],
      primaryAction: "Open collaboration",
      secondaryAction: "Review memory context",
      visibleConcepts: ["conversation", "suggestions", "memory_context"]
    }),
    extend: space({
      id: "extend",
      label: "Extend",
      mode: "extension",
      purpose: "Manage user-controlled capabilities.",
      concepts: ["skills", "plugins", "workflows"],
      primaryAction: "Manage capabilities",
      secondaryAction: "Compose workflow",
      visibleConcepts: ["skills", "plugins", "workflows"]
    }),
    inspect: space({
      id: "inspect",
      label: "Inspect",
      mode: "inspection",
      purpose: "Review history, changes, and validation results.",
      concepts: ["history", "changes", "validation"],
      primaryAction: "Review changes",
      secondaryAction: "Run validation",
      visibleConcepts: ["history", "changes", "validation"]
    })
  };

  return {
    version: "world-os-product-workspace-model-v2",
    spaces,
    defaultUserPath: ["world", "create", "ai", "extend", "inspect"]
  };
}

export function createWorkspaceState(workspace: ProductWorkspace): WorkspaceState {
  return stateForSpace(workspace, "create");
}

export function switchWorkspaceSpace(
  workspace: ProductWorkspace,
  _state: WorkspaceState,
  activeSpaceId: WorkspaceSpaceId
): WorkspaceState {
  return stateForSpace(workspace, activeSpaceId);
}

export function switchWorkspaceMode(
  workspace: ProductWorkspace,
  state: WorkspaceState,
  mode: WorkspaceMode
): WorkspaceState {
  const target = workspace.defaultUserPath.find((spaceId) => workspace.spaces[spaceId]?.mode === mode);

  if (target === undefined) {
    return state;
  }

  return stateForSpace(workspace, target);
}

export function extendProductWorkspace(
  workspace: ProductWorkspace,
  extensionSpace: ProductWorkspaceSpace
): ProductWorkspace {
  const nextSpaces = cloneData(workspace.spaces);

  nextSpaces[extensionSpace.id] = space(extensionSpace);

  return {
    version: workspace.version,
    spaces: nextSpaces,
    defaultUserPath: [...workspace.defaultUserPath, extensionSpace.id]
  };
}

export function validateWorkspaceState(
  workspace: ProductWorkspace,
  state: WorkspaceState
): WorkspaceStateValidation {
  const violations: string[] = [];
  const activeSpace = workspace.spaces[state.activeSpaceId];

  if (activeSpace === undefined) {
    violations.push(`Unknown workspace space: ${state.activeSpaceId}`);
  } else {
    if (state.mode !== activeSpace.mode) {
      violations.push("Workspace state mode must match the active space.");
    }

    if (state.primaryAction !== activeSpace.primaryAction) {
      violations.push("Workspace state primary action must match the active space.");
    }

    for (const concept of state.visibleConcepts) {
      if (!activeSpace.concepts.includes(concept)) {
        violations.push(`Visible concept does not belong to active space: ${concept}`);
      }
    }
  }

  if (state.visibleConcepts.length > 3) {
    violations.push("Workspace state must expose no more than three visible concepts.");
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

function stateForSpace(workspace: ProductWorkspace, activeSpaceId: WorkspaceSpaceId): WorkspaceState {
  const activeSpace = workspace.spaces[activeSpaceId];

  if (activeSpace === undefined) {
    throw new Error(`Unknown workspace space: ${activeSpaceId}`);
  }

  return {
    version: "world-os-workspace-state-v2",
    activeSpaceId,
    mode: activeSpace.mode,
    primaryAction: activeSpace.primaryAction,
    secondaryAction: activeSpace.secondaryAction,
    visibleConcepts: [...activeSpace.visibleConcepts],
    availableSpaces: [...workspace.defaultUserPath],
    deterministic: true
  };
}

function space<T extends ProductWorkspaceSpace>(input: T): T {
  if (input.visibleConcepts.length > 3) {
    throw new Error(`Workspace space exposes too many visible concepts: ${input.id}`);
  }

  for (const concept of input.visibleConcepts) {
    if (!input.concepts.includes(concept)) {
      throw new Error(`Visible concept does not belong to workspace space ${input.id}: ${concept}`);
    }
  }

  return cloneData(input);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
