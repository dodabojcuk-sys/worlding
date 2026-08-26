import type {
  StoryProductPrototypeModel,
  StoryPrototypeScenarioId
} from "../storyProductPrototypeState.ts";

export type StoryControlStage =
  | "project-home"
  | "writing"
  | "impact-review"
  | "world-update"
  | "writing-return"
  | "draft-workspace";

export type StoryControlPathId = "partial_clue" | "delayed_reveal" | "keep_current_world";

export type StoryControlActor = "user" | "codex" | "api" | "skill" | "playwright";

export type StoryControlActionName =
  | "getProjectHome"
  | "continueCurrentWriting"
  | "analyzeStoryInput"
  | "chooseStoryPath"
  | "applyWorldUpdatePreview"
  | "enterWritingWorkspace"
  | "enterDraftWorkspace"
  | "updateDraftText"
  | "checkDraftConsistency"
  | "resolveDraft"
  | "getCurrentStoryState";

export type StoryControlProject = {
  title: "雾中灯塔";
  currentChapter: "第三章";
  currentScene: "地下室门前";
};

export type StoryControlWorldObject = {
  id: string;
  name?: string;
  summary?: string;
  text?: string;
};

export type StoryControlAnalysisState = {
  worldObjects: {
    characters: StoryControlWorldObject[];
    locations: StoryControlWorldObject[];
    events: StoryControlWorldObject[];
    clues: StoryControlWorldObject[];
  };
  impactReview: {
    proposal: string;
    changeType: string;
    decisionRequired: boolean;
    evidence: string[];
    impacts: string[];
    risks: string[];
    alternatives: string[];
  };
};

export type StoryControlDecisionState = {
  status: "pending" | "accepted" | "rejected";
  selectedPathId?: StoryControlPathId;
  selectedOptionId?: string;
  label?: string;
  consequences: string[];
};

export type StoryControlWorldUpdateState = {
  selectedPath: string;
  confirmedChanges: string[];
  affectedCharacters: string[];
  affectedRelationships: string[];
  affectedEvents: string[];
  preservedMysteries: string[];
  prototypeOnly: true;
};

export type StoryControlDraftResolutionAction = "revise" | "mark_ready" | "review_impact";

export type StoryControlDraftResolutionState = {
  status: "unresolved" | "revise" | "ready" | "review_impact";
  primaryAction: "继续修改" | "确认这一幕" | "送回影响评审" | "等待作者处理";
  result: string;
  nextStep: string;
  requiresImpactReview: boolean;
  prototypeOnly: true;
};

export type StoryControlConsistencyReport = {
  status: "not_checked" | "clear" | "has_issues";
  issues: Array<{
    issue: string;
    affectedElement: string;
    explanation: string;
    optionalAction: string;
  }>;
  summary: string;
};

export type StoryControlDraftState = {
  text: string;
  status: "empty" | "unsaved" | "checked" | "ready";
  consistency: StoryControlConsistencyReport;
  resolution: StoryControlDraftResolutionState;
};

export type StoryControlHistoryEntry = {
  logicalStep: number;
  actor: StoryControlActor;
  action: StoryControlActionName;
  stage: StoryControlStage;
  summary: string;
  operation: {
    actorLabel: string;
    actionLabel: string;
    stageLabel: string;
    result: string;
    nextStep: string;
  };
};

export type StoryControlUiProjection = {
  prototypeModel: StoryProductPrototypeModel;
};

export type StoryControlState = {
  version: "world-os-story-control-state-v1";
  project: StoryControlProject;
  stage: StoryControlStage;
  scenarioId: StoryPrototypeScenarioId;
  rawStoryText: string;
  selectedPathId?: StoryControlPathId;
  selectedOptionId?: string;
  authorDecision: StoryControlDecisionState;
  analysis: StoryControlAnalysisState;
  worldUpdate: StoryControlWorldUpdateState;
  draft: StoryControlDraftState;
  ui: StoryControlUiProjection;
  logicalStep: number;
  history: StoryControlHistoryEntry[];
};

export type StoryControlResult<TPayload = unknown> = {
  action: StoryControlActionName;
  state: StoryControlState;
  payload: TPayload;
};
