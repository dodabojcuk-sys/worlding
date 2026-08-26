import {
  buildWorkspaceRuntimeState,
  type WorkspaceRuntimeChapter,
  type WorkspaceRuntimeObject,
  type WorkspaceRuntimeProject,
  type WorkspaceRuntimeState
} from "../../productWorkspaceRuntime/index.ts";

export type DomainValidationResult = {
  valid: boolean;
  violations: string[];
};

export type DomainTemplate<TProject, TDashboard, TAIContext, TInput = unknown> = {
  kind: string;
  version: string;
  createProject: (input?: TInput) => TProject;
  validateProject: (project: TProject) => DomainValidationResult;
  getDashboard: (project: TProject) => TDashboard;
  getContextForAI: (project: TProject) => TAIContext;
};

export type StoryWorldTemplate = DomainTemplate<
  StoryWorldProject,
  StoryWorldDashboardModel,
  StoryWorldAIContext,
  CreateStoryWorldProjectInput
> & {
  kind: "story_world";
  version: "world-os-story-world-template-v1";
  createProject: (input?: CreateStoryWorldProjectInput) => StoryWorldProject;
  validateWorld: (project: StoryWorldProject) => DomainValidationResult;
};

export type CreateStoryWorldProjectInput = {
  projectId?: string;
  title?: string;
};

export type StoryWorldProject = {
  version: "world-os-story-world-project-v1";
  projectId: string;
  world: StoryWorldProfile;
  currentChapter: WorkspaceRuntimeChapter;
  characters: StoryWorldCharacter[];
  locations: StoryWorldLocation[];
  events: StoryWorldEvent[];
  rules: StoryWorldRules;
  keyframes: StoryWorldKeyframe[];
  openLoops: StoryWorldOpenLoop[];
  workspaceRuntime: WorkspaceRuntimeState;
};

export type StoryWorldProfile = {
  title: string;
  genre: string;
  rules: string[];
  era: string;
  themes: string[];
};

export type StoryWorldCharacter = {
  id: string;
  name: string;
  role: string;
  traits: string[];
  relationships: StoryWorldRelationship[];
  status: string;
};

export type StoryWorldRelationship = {
  targetId: string;
  type: string;
  status: string;
};

export type StoryWorldLocation = {
  id: string;
  name: string;
  description: string;
  connections: string[];
};

export type StoryWorldEvent = {
  id: string;
  chapter: string;
  timelinePosition: number;
  participants: string[];
  consequences: string[];
};

export type StoryWorldRules = {
  worldRules: string[];
  narrativeRules: string[];
  constraints: string[];
};

export type StoryWorldKeyframe = {
  id: string;
  timelinePosition: number;
  majorMoment: string;
  authorDecision: string;
};

export type StoryWorldOpenLoop = {
  id: string;
  unresolvedConflict: string;
  pendingThread: string;
};

export type StoryWorldDashboardModel = {
  version: "world-os-story-world-dashboard-v1";
  currentChapter: WorkspaceRuntimeChapter;
  mainCharacters: Pick<StoryWorldCharacter, "id" | "name" | "role" | "status">[];
  unresolvedEvents: StoryWorldOpenLoop[];
  worldRules: string[];
  aiSuggestionEntry: {
    label: string;
    targetSpace: "ai";
    contextPurpose: "draft";
  };
};

export type StoryWorldAIContext = {
  version: "world-os-story-world-ai-context-v1";
  projectId: string;
  world: {
    title: string;
    genre: string;
    era: string;
    themes: string[];
  };
  characters: Pick<StoryWorldCharacter, "id" | "name" | "role" | "traits" | "status">[];
  events: StoryWorldEvent[];
  rules: StoryWorldRules;
  relationships: StoryWorldAIContextRelationship[];
  keyframes: StoryWorldKeyframe[];
  openLoops: StoryWorldOpenLoop[];
};

export type StoryWorldAIContextRelationship = StoryWorldRelationship & {
  sourceId: string;
};

export function createStoryWorldTemplate(): StoryWorldTemplate {
  return {
    kind: "story_world",
    version: "world-os-story-world-template-v1",
    createProject: createStoryWorldProject,
    validateWorld: validateStoryWorld,
    validateProject: validateStoryWorld,
    getDashboard: getStoryWorldDashboard,
    getContextForAI: buildStoryWorldContextForAI
  };
}

export function createStoryWorldProject(input: CreateStoryWorldProjectInput = {}): StoryWorldProject {
  const projectId = input.projectId ?? "mist-lighthouse";
  const title = input.title ?? "雾中灯塔";
  const currentChapter: WorkspaceRuntimeChapter = {
    id: "chapter-3",
    title: "第3章 · 灯塔下层",
    status: "drafting"
  };
  const currentObject: WorkspaceRuntimeObject = {
    id: "lin-yuan",
    label: "林远",
    type: "character"
  };
  const activeProject: WorkspaceRuntimeProject = {
    id: projectId,
    title,
    kind: "creation-project"
  };

  return cloneData({
    version: "world-os-story-world-project-v1",
    projectId,
    world: {
      title,
      genre: "mystery fantasy",
      rules: ["潮门不能主动开启", "灯塔只在海雾中显影", "工业时代技术水平不得自动跃迁"],
      era: "industrial coastal age",
      themes: ["memory", "truth", "choice"]
    },
    currentChapter,
    characters: [
      {
        id: "a-lan",
        name: "阿岚",
        role: "witness",
        traits: ["沉默", "熟悉潮汐", "留下警告"],
        relationships: [
          {
            targetId: "lin-yuan",
            type: "left_warning",
            status: "unverified"
          }
        ],
        status: "missing"
      },
      {
        id: "lin-yuan",
        name: "林远",
        role: "keeper",
        traits: ["谨慎", "怕深水", "相信旧信"],
        relationships: [
          {
            targetId: "a-lan",
            type: "old_letter",
            status: "evidence_gap"
          }
        ],
        status: "drafting"
      }
    ],
    locations: [
      {
        id: "fog-port",
        name: "雾港",
        description: "被海雾封锁的工业港镇。",
        connections: ["old-lighthouse"]
      },
      {
        id: "old-lighthouse",
        name: "旧灯塔",
        description: "只在海雾中显影的潮门入口。",
        connections: ["fog-port", "tide-door"]
      }
    ],
    events: [
      {
        id: "event-1",
        chapter: "chapter-1",
        timelinePosition: 10,
        participants: ["lin-yuan"],
        consequences: ["林远收到旧信"]
      },
      {
        id: "event-2",
        chapter: "chapter-2",
        timelinePosition: 20,
        participants: ["lin-yuan", "a-lan"],
        consequences: ["阿岚的警告被记录但未验证"]
      },
      {
        id: "event-3",
        chapter: "chapter-3",
        timelinePosition: 30,
        participants: ["lin-yuan"],
        consequences: ["旧灯塔下层等待作者确认"]
      }
    ],
    rules: {
      worldRules: ["潮门不能主动开启", "灯塔只在海雾中显影", "工业时代技术水平不得自动跃迁"],
      narrativeRules: ["关键帧由作者决定", "不得自动推进时代", "AI只补全关键帧之间的表达"],
      constraints: ["角色状态必须由作者确认", "时代水平必须来自关键帧", "开放线索必须显式关闭"]
    },
    keyframes: [
      {
        id: "keyframe-1",
        timelinePosition: 10,
        majorMoment: "林远收到旧信",
        authorDecision: "旧信是真的但来源未确认"
      },
      {
        id: "keyframe-2",
        timelinePosition: 30,
        majorMoment: "林远抵达旧灯塔下层",
        authorDecision: "潮门仍关闭，技术水平保持工业时代"
      }
    ],
    openLoops: [
      {
        id: "loop-1",
        unresolvedConflict: "旧灯塔地下潮门未确认",
        pendingThread: "需要证据闭环"
      },
      {
        id: "loop-2",
        unresolvedConflict: "阿岚留下警告后失踪",
        pendingThread: "需要确认阿岚动机"
      }
    ],
    workspaceRuntime: buildWorkspaceRuntimeState({
      activeProject,
      currentChapter,
      currentObject
    })
  });
}

export function validateStoryWorld(project: StoryWorldProject): DomainValidationResult {
  const violations: string[] = [];

  if (project.world.title.trim() === "") {
    violations.push("Story world needs a title.");
  }

  if (project.world.rules.length === 0 || project.rules.worldRules.length === 0) {
    violations.push("Story world needs explicit world rules.");
  }

  if (project.characters.length === 0) {
    violations.push("Story world needs at least one character.");
  }

  if (project.locations.length === 0) {
    violations.push("Story world needs at least one location.");
  }

  if (project.rules.constraints.length === 0) {
    violations.push("Story world needs explicit constraints.");
  }

  if (project.currentChapter.id.trim() === "") {
    violations.push("Story world needs a current chapter.");
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

export function getStoryWorldDashboard(project: StoryWorldProject): StoryWorldDashboardModel {
  return cloneData({
    version: "world-os-story-world-dashboard-v1",
    currentChapter: project.currentChapter,
    mainCharacters: [...project.characters]
      .sort(byId)
      .map((character) => ({
        id: character.id,
        name: character.name,
        role: character.role,
        status: character.status
      })),
    unresolvedEvents: [...project.openLoops].sort(byId),
    worldRules: [...project.rules.worldRules],
    aiSuggestionEntry: {
      label: "Build story context",
      targetSpace: "ai",
      contextPurpose: "draft"
    }
  });
}

export function buildStoryWorldContextForAI(project: StoryWorldProject): StoryWorldAIContext {
  return cloneData({
    version: "world-os-story-world-ai-context-v1",
    projectId: project.projectId,
    world: {
      title: project.world.title,
      genre: project.world.genre,
      era: project.world.era,
      themes: [...project.world.themes]
    },
    characters: [...project.characters]
      .sort(byId)
      .map((character) => ({
        id: character.id,
        name: character.name,
        role: character.role,
        traits: [...character.traits],
        status: character.status
      })),
    events: [...project.events].sort(byTimelineThenId),
    rules: project.rules,
    relationships: project.characters
      .flatMap((character) =>
        character.relationships.map((relationship) => ({
          sourceId: character.id,
          targetId: relationship.targetId,
          type: relationship.type,
          status: relationship.status
        }))
      )
      .sort(byRelationship),
    keyframes: [...project.keyframes].sort(byTimelineThenId),
    openLoops: [...project.openLoops].sort(byId)
  });
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function byTimelineThenId<T extends { id: string; timelinePosition: number }>(left: T, right: T): number {
  return left.timelinePosition - right.timelinePosition || byId(left, right);
}

function byRelationship(left: StoryWorldAIContextRelationship, right: StoryWorldAIContextRelationship): number {
  return (
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetId.localeCompare(right.targetId) ||
    left.type.localeCompare(right.type)
  );
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
