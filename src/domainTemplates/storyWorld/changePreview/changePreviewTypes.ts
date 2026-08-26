import type { StoryCommitCandidate } from "../decision/index.ts";

export type StoryChangePreviewInput = {
  projectId: string;
  candidate: StoryCommitCandidate;
  authorDecision: StoryCommitCandidate["selectedDecision"];
  previousSnapshotId: string;
};

export type StoryChangePreviewCharacterState = {
  characterId: string;
  name: string;
  role: string;
  status: string;
};

export type StoryChangePreviewRelationshipState = {
  sourceId: string;
  targetId: string;
  type: string;
  status: string;
};

export type StoryChangePreviewEventState = {
  eventId: string;
  chapter: string;
  timelinePosition: number;
  consequences: string[];
};

export type StoryChangePreviewBeforeState = {
  characterStates: StoryChangePreviewCharacterState[];
  relationshipStates: StoryChangePreviewRelationshipState[];
  eventStates: StoryChangePreviewEventState[];
  worldRules: string[];
};

export type StoryChangePreviewChange = {
  id: string;
  summary: string;
  evidenceRefs: string[];
};

export type StoryChangePreviewChangeSet = {
  addedFacts: StoryChangePreviewChange[];
  changedRelationships: StoryChangePreviewChange[];
  triggeredEvents: StoryChangePreviewChange[];
};

export type StoryChangePreviewProjectedCharacterState = {
  characterId: string;
  name: string;
  projectedStatus: string;
  evidenceRefs: string[];
};

export type StoryChangePreviewAfterState = {
  projectedCharacterStates: StoryChangePreviewProjectedCharacterState[];
  projectedWorldState: string[];
  affectedFutureThreads: string[];
};

export type StoryChangePreviewRollbackReference = {
  version: "world-os-story-change-preview-rollback-reference-v1";
  previousSnapshotId: string;
};

export type StoryChangePreviewValidationResult = {
  version: "world-os-story-change-preview-validation-v1";
  valid: boolean;
  violations: string[];
};

export type StoryChangePreview = {
  version: "world-os-story-change-preview-v1";
  id: string;
  candidateId: string;
  intentId: string;
  authorDecision: StoryCommitCandidate["selectedDecision"];
  beforeState: StoryChangePreviewBeforeState;
  changeSet: StoryChangePreviewChangeSet;
  afterState: StoryChangePreviewAfterState;
  rollbackReference: StoryChangePreviewRollbackReference;
  validation: StoryChangePreviewValidationResult;
  canCommit: false;
  mutatesWorld: false;
};
