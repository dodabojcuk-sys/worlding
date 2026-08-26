import {
  createProductWorkspace,
  type CoreWorkspaceSpaceId,
  type ProductWorkspace,
  type ProductWorkspaceSpace,
  type WorkspaceConcept,
  type WorkspaceSpaceId
} from "../productWorkspace/index.ts";

export type WorkspaceRuntimeProject = {
  id: string;
  title: string;
  kind: "creation-project";
};

export type WorkspaceRuntimeChapter = {
  id: string;
  title: string;
  status: "drafting" | "reviewing" | "revising" | "final";
};

export type WorkspaceRuntimeObject = {
  id: string;
  label: string;
  type: "character" | "chapter" | "world" | "asset";
};

export type WorkspaceRuntimeAction = {
  id: string;
  label: string;
  priority: "primary" | "secondary";
  targetSpace: WorkspaceSpaceId;
};

export type WorkspaceAssistantContext = {
  activeSpace: WorkspaceSpaceId;
  currentTask: string;
  contextSummary: string;
};

export type WorkspaceViewBase<TType extends CoreWorkspaceSpaceId> = {
  type: TType;
  sourceSpaceId: TType;
  primaryAction: string;
  secondaryAction: string;
  visibleConcepts: WorkspaceConcept[];
};

export type WorldView = WorkspaceViewBase<"world"> & {
  currentWorldStatus: "stable";
  currentObject: WorkspaceRuntimeObject;
  timelineEntry: "Open timeline";
  replayEntry: "Open replay";
};

export type CreateView = WorkspaceViewBase<"create"> & {
  currentChapter: WorkspaceRuntimeChapter;
  draftStatus: "active";
  keyframe: string;
  revision: string;
};

export type AIView = WorkspaceViewBase<"ai"> & {
  currentTask: string;
  suggestions: string[];
  conversationContext: string;
};

export type ExtendView = WorkspaceViewBase<"extend"> & {
  enabledCapabilities: string[];
  optionalSkills: string[];
  plugins: string[];
};

export type InspectView = WorkspaceViewBase<"inspect"> & {
  history: string[];
  changes: string[];
  validation: string[];
};

export type WorkspaceRuntimeViews = {
  world: WorldView;
  create: CreateView;
  ai: AIView;
  extend: ExtendView;
  inspect: InspectView;
};

export type WorkspaceRuntimeView = WorkspaceRuntimeViews[keyof WorkspaceRuntimeViews];

export type WorkspaceRuntimeState = {
  version: "world-os-workspace-runtime-view-v1";
  source: {
    workspaceVersion: ProductWorkspace["version"];
    workspaceSpaceIds: WorkspaceSpaceId[];
  };
  activeSpace: WorkspaceSpaceId;
  activeProject: WorkspaceRuntimeProject;
  currentChapter: WorkspaceRuntimeChapter;
  currentObject: WorkspaceRuntimeObject;
  availableSpaces: WorkspaceSpaceId[];
  availableActions: WorkspaceRuntimeAction[];
  contextualPanels: WorkspaceConcept[];
  assistantContext: WorkspaceAssistantContext;
  views: WorkspaceRuntimeViews;
  activeView: WorkspaceRuntimeView;
  transitions: WorkspaceRuntimeTransition[];
  deterministic: true;
};

export type WorkspaceRuntimeTransitionId =
  | "continue_creation"
  | "need_help"
  | "need_capability"
  | "review_changes"
  | "fix_issue";

export type WorkspaceRuntimeTransition = {
  id: WorkspaceRuntimeTransitionId;
  from: WorkspaceSpaceId;
  to: WorkspaceSpaceId;
  label: string;
};

export type BuildWorkspaceRuntimeStateInput = {
  workspace?: ProductWorkspace;
  activeSpace?: WorkspaceSpaceId;
  activeProject?: WorkspaceRuntimeProject;
  currentChapter?: WorkspaceRuntimeChapter;
  currentObject?: WorkspaceRuntimeObject;
};

export type TransitionWorkspaceRuntimeInput = {
  workspace?: ProductWorkspace;
  state: WorkspaceRuntimeState;
  transitionId: WorkspaceRuntimeTransitionId;
};

export function buildWorkspaceRuntimeState(input: BuildWorkspaceRuntimeStateInput = {}): WorkspaceRuntimeState {
  const workspace = input.workspace ?? createProductWorkspace();
  const activeSpace = input.activeSpace ?? "create";
  const activeProject = input.activeProject ?? defaultProject();
  const currentChapter = input.currentChapter ?? defaultChapter();
  const currentObject = input.currentObject ?? defaultObject();
  const views = buildViews({ workspace, currentChapter, currentObject });
  const activeView = resolveActiveView(views, activeSpace);

  return {
    version: "world-os-workspace-runtime-view-v1",
    source: {
      workspaceVersion: workspace.version,
      workspaceSpaceIds: [...workspace.defaultUserPath]
    },
    activeSpace,
    activeProject,
    currentChapter,
    currentObject,
    availableSpaces: [...workspace.defaultUserPath],
    availableActions: actionsForSpace(workspace, activeSpace),
    contextualPanels: [...activeView.visibleConcepts],
    assistantContext: assistantContextFor(activeSpace, activeView.primaryAction, currentChapter, currentObject),
    views,
    activeView,
    transitions: defaultTransitions(),
    deterministic: true
  };
}

export function transitionWorkspaceRuntimeView(input: TransitionWorkspaceRuntimeInput): WorkspaceRuntimeState {
  const workspace = input.workspace ?? createProductWorkspace();
  const transition = defaultTransitions().find((candidate) => candidate.id === input.transitionId);

  if (transition === undefined) {
    throw new Error(`Unknown workspace runtime transition: ${input.transitionId}`);
  }

  return buildWorkspaceRuntimeState({
    workspace,
    activeSpace: transition.to,
    activeProject: input.state.activeProject,
    currentChapter: input.state.currentChapter,
    currentObject: input.state.currentObject
  });
}

function buildViews(input: {
  workspace: ProductWorkspace;
  currentChapter: WorkspaceRuntimeChapter;
  currentObject: WorkspaceRuntimeObject;
}): WorkspaceRuntimeViews {
  return {
    world: {
      ...baseView(input.workspace.spaces.world, "world"),
      currentWorldStatus: "stable",
      currentObject: cloneData(input.currentObject),
      timelineEntry: "Open timeline",
      replayEntry: "Open replay"
    },
    create: {
      ...baseView(input.workspace.spaces.create, "create"),
      currentChapter: cloneData(input.currentChapter),
      draftStatus: "active",
      keyframe: "旧灯塔规则锁定",
      revision: "等待作者确认"
    },
    ai: {
      ...baseView(input.workspace.spaces.ai, "ai"),
      currentTask: input.workspace.spaces.create.primaryAction,
      suggestions: ["补足旧灯塔证据", "保持林远状态不漂移"],
      conversationContext: "第3章 / 旧灯塔 / 证据缺口"
    },
    extend: {
      ...baseView(input.workspace.spaces.extend, "extend"),
      enabledCapabilities: ["Memory Palace", "Writer", "Reviewer"],
      optionalSkills: ["Logic Check", "Style Pass"],
      plugins: ["Timeline Export", "Chapter Package"]
    },
    inspect: {
      ...baseView(input.workspace.spaces.inspect, "inspect"),
      history: ["创建第3章工作面", "锁定旧灯塔关键帧"],
      changes: ["E4 仍为证据缺口", "林远状态需补证据"],
      validation: ["时间线稳定", "关键帧未被改写"]
    }
  };
}

function baseView<TType extends CoreWorkspaceSpaceId>(
  space: ProductWorkspaceSpace,
  type: TType
): WorkspaceViewBase<TType> {
  return {
    type,
    sourceSpaceId: type,
    primaryAction: space.primaryAction,
    secondaryAction: space.secondaryAction,
    visibleConcepts: [...space.visibleConcepts]
  };
}

function resolveActiveView(views: WorkspaceRuntimeViews, activeSpace: WorkspaceSpaceId): WorkspaceRuntimeView {
  if (activeSpace === "world" || activeSpace === "create" || activeSpace === "ai" || activeSpace === "extend" || activeSpace === "inspect") {
    return views[activeSpace];
  }

  return views.extend;
}

function actionsForSpace(workspace: ProductWorkspace, activeSpace: WorkspaceSpaceId): WorkspaceRuntimeAction[] {
  const space = workspace.spaces[activeSpace] ?? workspace.spaces.extend;

  return [
    {
      id: `${activeSpace}.primary`,
      label: space.primaryAction,
      priority: "primary",
      targetSpace: activeSpace
    },
    {
      id: `${activeSpace}.secondary`,
      label: space.secondaryAction,
      priority: "secondary",
      targetSpace: activeSpace
    }
  ];
}

function assistantContextFor(
  activeSpace: WorkspaceSpaceId,
  currentTask: string,
  currentChapter: WorkspaceRuntimeChapter,
  currentObject: WorkspaceRuntimeObject
): WorkspaceAssistantContext {
  return {
    activeSpace,
    currentTask,
    contextSummary: `${currentChapter.title} / ${currentObject.label} / draft`
  };
}

function defaultTransitions(): WorkspaceRuntimeTransition[] {
  return [
    transition("continue_creation", "world", "create", "继续创作"),
    transition("need_help", "create", "ai", "需要帮助"),
    transition("need_capability", "ai", "extend", "需要新能力"),
    transition("review_changes", "create", "inspect", "检查修改"),
    transition("fix_issue", "inspect", "create", "回到创作")
  ];
}

function transition(
  id: WorkspaceRuntimeTransitionId,
  from: WorkspaceSpaceId,
  to: WorkspaceSpaceId,
  label: string
): WorkspaceRuntimeTransition {
  return { id, from, to, label };
}

function defaultProject(): WorkspaceRuntimeProject {
  return {
    id: "mist-lighthouse",
    title: "雾中灯塔",
    kind: "creation-project"
  };
}

function defaultChapter(): WorkspaceRuntimeChapter {
  return {
    id: "chapter-3",
    title: "第3章 · 灯塔下层",
    status: "drafting"
  };
}

function defaultObject(): WorkspaceRuntimeObject {
  return {
    id: "lin-yuan",
    label: "林远",
    type: "character"
  };
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
