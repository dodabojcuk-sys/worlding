import type { StoryCommitCandidate } from "../decision/index.ts";
import type { StoryWorldEvent, StoryWorldProject } from "../index.ts";
import { createRollbackReference, createStoryCommitHistory } from "./commitHistory.ts";
import type {
  StoryCommitOperationInput,
  StoryCommitPreview,
  StoryCommitResult,
  StoryEventCommit
} from "./commitTypes.ts";
import { storyCommitId, storyDecisionId, storyEventId } from "./commitTypes.ts";
import { validateStoryCommitCandidate } from "./commitValidator.ts";

export function previewStoryCommit(
  project: StoryWorldProject,
  candidate: StoryCommitCandidate,
  input: StoryCommitOperationInput
): StoryCommitPreview {
  const affectedRules = affectedRuleIds(project, candidate);
  const rollbackReference = createRollbackReference(candidate, affectedRules, input.previousSnapshotId);

  return cloneData({
    version: "world-os-story-commit-preview-v1",
    id: `commit-preview-${candidate.id}`,
    candidateId: candidate.id,
    commitId: storyCommitId(candidate),
    changes: [...candidate.worldChangesProposal],
    affectedCharacters: [...candidate.affectedCharacters],
    affectedEvents: [...candidate.affectedEvents],
    affectedRules,
    chapterImpact: chapterImpact(project, candidate),
    rollbackReference,
    validation: validateStoryCommitCandidate(project, candidate)
  });
}

export function commitStoryEvent(
  project: StoryWorldProject,
  candidate: StoryCommitCandidate,
  input: StoryCommitOperationInput
): StoryCommitResult {
  const preview = previewStoryCommit(project, candidate, input);

  if (!preview.validation.valid) {
    throw new Error(preview.validation.violations.join(" "));
  }

  const event: StoryWorldEvent = {
    id: storyEventId(candidate),
    chapter: project.currentChapter.id,
    timelinePosition: nextTimelinePosition(project),
    participants: [...candidate.affectedCharacters],
    consequences: [...candidate.worldChangesProposal]
  };
  const commit: StoryEventCommit = {
    version: "world-os-story-event-commit-v1",
    id: storyCommitId(candidate),
    projectId: project.projectId,
    chapterId: project.currentChapter.id,
    event,
    source: {
      candidateId: candidate.id,
      intentId: candidate.intentId,
      decisionId: storyDecisionId(candidate),
      authorChoice: candidate.selectedDecision.status
    }
  };
  const nextProject = cloneData(project);
  nextProject.events.push(cloneData(event));

  return cloneData({
    version: "world-os-story-commit-result-v1",
    project: nextProject,
    commit,
    preview,
    history: createStoryCommitHistory(commit, candidate, input, preview.rollbackReference)
  });
}

function affectedRuleIds(project: StoryWorldProject, candidate: StoryCommitCandidate): string[] {
  return project.rules.worldRules.filter((rule) =>
    candidate.worldChangesProposal.some((change) => change.includes(rule))
  );
}

function chapterImpact(project: StoryWorldProject, candidate: StoryCommitCandidate): string[] {
  const chapters = new Set<string>();

  for (const event of project.events) {
    if (candidate.affectedEvents.includes(event.id)) {
      chapters.add(event.chapter);
    }
  }

  if (chapters.size === 0) {
    chapters.add(project.currentChapter.id);
  }

  return [...chapters].sort();
}

function nextTimelinePosition(project: StoryWorldProject): number {
  return Math.max(...project.events.map((event) => event.timelinePosition), 0) + 1;
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
