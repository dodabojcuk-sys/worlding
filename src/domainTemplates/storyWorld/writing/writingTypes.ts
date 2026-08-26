import type { StoryScenePlan } from "../scene/index.ts";

export type StoryChapterWritingStatus = "drafting" | "reviewing" | "revising" | "completed";

export type StorySceneWorkStatus = "ready_for_draft" | "drafting" | "blocked";

export type StoryWritingReviewStatus = "pending" | "reviewing" | "approved";

export type StoryLockedElements = {
  committedEvents: string[];
  characterFacts: string[];
  worldRules: string[];
  approvedDecisions: string[];
};

export type StoryEditableElement = "wording" | "pacing" | "description" | "scene_expansion";

export type StorySceneWorkState = {
  sceneId: string;
  plan: StoryScenePlan;
  status: StorySceneWorkStatus;
  notes: string[];
  lockedElements: StoryLockedElements;
  editableElements: StoryEditableElement[];
};

export type StoryChapterWritingState = {
  chapterId: string;
  status: StoryChapterWritingStatus;
  sceneIds: string[];
};

export type StoryWritingWorkspace = {
  version: "world-os-story-writing-workspace-v1";
  projectId: string;
  chapterId: string;
  chapterState: StoryChapterWritingState;
  scenes: StorySceneWorkState[];
  activeSceneId: string;
  draftStatus: StoryChapterWritingStatus;
  authorNotes: string[];
  aiSuggestions: string[];
  reviewStatus: StoryWritingReviewStatus;
};

export type ChapterDraftRequest = {
  version: "world-os-chapter-draft-request-v1";
  projectId: string;
  chapterId: string;
  sceneId: string;
  sourceScenePlanId: string;
  sourceCommitId: string;
  purpose: string;
  beats: StoryScenePlan["beats"];
  lockedElements: StoryLockedElements;
  editableElements: StoryEditableElement[];
  authorNotes: string[];
  constraints: string[];
  requestedOutput: "chapter_draft_structure_only";
};

export type StoryWritingValidationResult = {
  version: "world-os-story-writing-validation-v1";
  valid: boolean;
  violations: string[];
};

export type StoryWritingChangeTarget =
  | "committed_events"
  | "character_facts"
  | "world_rules"
  | "approved_decisions"
  | StoryEditableElement;

export type StoryWritingChangeProposal = {
  sceneId: string;
  target: StoryWritingChangeTarget;
  value: string;
};

export type StoryWritingChangeValidationResult = {
  version: "world-os-writing-change-validation-v1";
  valid: boolean;
  violations: string[];
};
