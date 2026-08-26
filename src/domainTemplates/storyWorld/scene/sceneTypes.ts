import type { StoryEventCommit } from "../commit/index.ts";

export type StorySceneBeatType = "opening" | "development" | "conflict" | "turning_point" | "resolution";

export type StorySceneBeat = {
  type: StorySceneBeatType;
  summary: string;
};

export type StorySceneReviewStatus = "pending" | "accepted" | "modified" | "rejected";

export type StorySceneReview = {
  status: StorySceneReviewStatus;
  authorNotes: string[];
};

export type StoryScenePlan = {
  version: "world-os-story-scene-plan-v1";
  sceneId: string;
  chapterId: string;
  sourceCommitId: string;
  purpose: string;
  characters: string[];
  location: string;
  conflict: string;
  beats: StorySceneBeat[];
  emotionalGoal: string;
  informationReveal: string;
  risks: string[];
  review: StorySceneReview;
};

export type StorySceneValidationResult = {
  version: "world-os-story-scene-validation-v1";
  valid: boolean;
  violations: string[];
};

export type StorySceneReviewInput = {
  status: StorySceneReviewStatus;
  authorNotes?: string[];
};

export type StorySceneReviewResult = {
  version: "world-os-story-scene-review-result-v1";
  plan: StoryScenePlan;
  sourceCommit: Pick<StoryEventCommit, "id" | "chapterId">;
  canDraft: boolean;
};
