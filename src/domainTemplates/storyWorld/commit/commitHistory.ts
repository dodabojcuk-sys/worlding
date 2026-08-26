import type { StoryCommitCandidate } from "../decision/index.ts";
import type {
  StoryCommitHistory,
  StoryCommitOperationInput,
  StoryEventCommit,
  StoryRollbackReference
} from "./commitTypes.ts";
import { storyDecisionId } from "./commitTypes.ts";

export function createRollbackReference(
  candidate: StoryCommitCandidate,
  affectedRules: string[],
  previousSnapshotId: string
): StoryRollbackReference {
  return cloneData({
    version: "world-os-story-rollback-reference-v1",
    previousSnapshotId,
    affectedObjects: {
      characters: [...candidate.affectedCharacters],
      events: [...candidate.affectedEvents],
      rules: [...affectedRules]
    }
  });
}

export function createStoryCommitHistory(
  commit: StoryEventCommit,
  candidate: StoryCommitCandidate,
  input: StoryCommitOperationInput,
  rollbackReference: StoryRollbackReference
): StoryCommitHistory {
  return cloneData({
    version: "world-os-story-commit-history-v1",
    commitId: commit.id,
    sourceIntentId: candidate.intentId,
    decisionId: storyDecisionId(candidate),
    logicalTimestamp: input.logicalTimestamp,
    changes: [...candidate.worldChangesProposal],
    authorNotes: [...candidate.selectedDecision.authorNotes],
    rollbackReference
  });
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
