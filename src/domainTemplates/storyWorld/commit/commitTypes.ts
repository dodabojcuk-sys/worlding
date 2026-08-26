import type { StoryCommitCandidate } from "../decision/index.ts";
import type { StoryWorldEvent, StoryWorldProject } from "../index.ts";

export type StoryCommitOperationInput = {
  logicalTimestamp: number;
  previousSnapshotId: string;
};

export type StoryRollbackReference = {
  version: "world-os-story-rollback-reference-v1";
  previousSnapshotId: string;
  affectedObjects: {
    characters: string[];
    events: string[];
    rules: string[];
  };
};

export type StoryCommitValidationResult = {
  version: "world-os-story-commit-validation-v1";
  valid: boolean;
  violations: string[];
};

export type StoryCommitPreview = {
  version: "world-os-story-commit-preview-v1";
  id: string;
  candidateId: string;
  commitId: string;
  changes: string[];
  affectedCharacters: string[];
  affectedEvents: string[];
  affectedRules: string[];
  chapterImpact: string[];
  rollbackReference: StoryRollbackReference;
  validation: StoryCommitValidationResult;
};

export type StoryEventCommit = {
  version: "world-os-story-event-commit-v1";
  id: string;
  projectId: string;
  chapterId: string;
  event: StoryWorldEvent;
  source: {
    candidateId: string;
    intentId: string;
    decisionId: string;
    authorChoice: "accepted" | "modified";
  };
};

export type StoryCommitHistory = {
  version: "world-os-story-commit-history-v1";
  commitId: string;
  sourceIntentId: string;
  decisionId: string;
  logicalTimestamp: number;
  changes: string[];
  authorNotes: string[];
  rollbackReference: StoryRollbackReference;
};

export type StoryCommitResult = {
  version: "world-os-story-commit-result-v1";
  project: StoryWorldProject;
  commit: StoryEventCommit;
  preview: StoryCommitPreview;
  history: StoryCommitHistory;
};

export function storyCommitId(candidate: StoryCommitCandidate): string {
  return `story-commit-${candidate.intentId}`;
}

export function storyEventId(candidate: StoryCommitCandidate): string {
  return `story-event-${candidate.intentId}`;
}

export function storyDecisionId(candidate: StoryCommitCandidate): string {
  return candidate.selectedDecision.optionId;
}
