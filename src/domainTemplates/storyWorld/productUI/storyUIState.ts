export type StoryProductWorkspace = "world" | "writing" | "ai_assistant" | "inspect";

export type StoryProductPanelBase = {
  primaryAction: string;
  visibleConcepts: string[];
};

export type StoryActiveChapterPanel = StoryProductPanelBase & {
  id: string;
  title: string;
  status: string;
};

export type StoryActiveScenePanel = StoryProductPanelBase & {
  id: string;
  sourceCommitId: string;
  status: string;
  purpose: string;
};

export type StoryWorldSummaryPanel = StoryProductPanelBase & {
  title: string;
  characters: string[];
  locations: string[];
  events: string[];
};

export type StoryCharacterPanel = StoryProductPanelBase & {
  focus: string[];
  locked: string[];
  editable: string[];
};

export type StoryAIDecisionPanel = StoryProductPanelBase & {
  title: "天意";
  status: "decision_ready" | "analysis_ready" | "idle";
  impactSummary: string[];
  alternatives: string[];
  pendingDecision?: {
    intentId: string;
    optionIds: string[];
  };
};

export type StoryWritingPanel = StoryProductPanelBase & {
  chapterId: string;
  scenes: Array<{
    sceneId: string;
    status: string;
    purpose: string;
  }>;
  lockedElements: string[];
  editableElements: string[];
  draftStatus: string;
};

export type StoryConsistencyPanel = StoryProductPanelBase & {
  consistency: {
    characterConsistency: number;
    timelineConflicts: number;
    unresolvedThreads: number;
  };
  recentHistory: string[];
};

export type StoryNextAction = {
  id: string;
  label: string;
  targetWorkspace: StoryProductWorkspace;
  reason: string;
};

export type StoryProductUIState = {
  version: "world-os-story-product-ui-state-v1";
  currentWorkspace: StoryProductWorkspace;
  activeChapter: StoryActiveChapterPanel;
  activeScene: StoryActiveScenePanel;
  worldSummary: StoryWorldSummaryPanel;
  characterPanel: StoryCharacterPanel;
  aiDecisionPanel: StoryAIDecisionPanel;
  writingPanel: StoryWritingPanel;
  consistencyPanel: StoryConsistencyPanel;
  nextAction: StoryNextAction;
};

export type StoryProductUIProjectionInput = {
  project: unknown;
  writingWorkspace: unknown;
  impactReport?: unknown;
  decisionWorkspace?: unknown;
  currentWorkspace?: StoryProductWorkspace;
};

export type StoryProductUIValidationResult = {
  version: "world-os-story-product-ui-validation-v1";
  valid: boolean;
  violations: string[];
};
