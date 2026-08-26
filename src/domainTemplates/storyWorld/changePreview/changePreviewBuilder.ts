import type { StoryCommitCandidate } from "../decision/index.ts";
import type { StoryEvidenceBundle, StoryEvidenceItem } from "../evidence/index.ts";
import type { StoryWorldCharacter, StoryWorldEvent, StoryWorldProject } from "../index.ts";
import type {
  StoryChangePreview,
  StoryChangePreviewBeforeState,
  StoryChangePreviewChange,
  StoryChangePreviewChangeSet,
  StoryChangePreviewInput
} from "./changePreviewTypes.ts";
import { validateStoryChangePreviewInput } from "./changePreviewValidator.ts";

export type BuildStoryChangePreviewInput = {
  project: StoryWorldProject;
  candidate: StoryCommitCandidate;
  authorDecision: StoryCommitCandidate["selectedDecision"];
  evidenceBundle: StoryEvidenceBundle;
  previousSnapshotId: string;
};

export function buildStoryChangePreview(input: BuildStoryChangePreviewInput): StoryChangePreview {
  const validation = validateStoryChangePreviewInput(input);

  if (!validation.valid) {
    throw new Error(validation.violations.join(" "));
  }

  return cloneData({
    version: "world-os-story-change-preview-v1",
    id: `change-preview-${input.candidate.id}`,
    candidateId: input.candidate.id,
    intentId: input.candidate.intentId,
    authorDecision: input.authorDecision,
    beforeState: beforeStateFor(input.project, input.candidate),
    changeSet: changeSetFor(input.project, input.candidate, input.evidenceBundle),
    afterState: {
      projectedCharacterStates: affectedCharacters(input.project, input.candidate).map((character) => ({
        characterId: character.id,
        name: character.name,
        projectedStatus: `${character.status} -> affected by ${input.authorDecision.optionType}`,
        evidenceRefs: characterEvidenceRefs(input.evidenceBundle, character.id)
      })),
      projectedWorldState: [
        "World rules remain locked during preview.",
        "No committed story event is created by this preview."
      ],
      affectedFutureThreads: input.project.openLoops
        .map((loop) => loop.unresolvedConflict)
        .sort((left, right) => left.localeCompare(right))
    },
    rollbackReference: {
      version: "world-os-story-change-preview-rollback-reference-v1",
      previousSnapshotId: input.previousSnapshotId
    },
    validation,
    canCommit: false,
    mutatesWorld: false
  });
}

export function buildStoryChangePreviewInput(input: BuildStoryChangePreviewInput): StoryChangePreviewInput {
  return cloneData({
    projectId: input.project.projectId,
    candidate: input.candidate,
    authorDecision: input.authorDecision,
    previousSnapshotId: input.previousSnapshotId
  });
}

function beforeStateFor(project: StoryWorldProject, candidate: StoryCommitCandidate): StoryChangePreviewBeforeState {
  return {
    characterStates: affectedCharacters(project, candidate).map((character) => ({
      characterId: character.id,
      name: character.name,
      role: character.role,
      status: character.status
    })),
    relationshipStates: affectedCharacters(project, candidate).flatMap((character) =>
      character.relationships
        .filter((relationship) => candidate.affectedCharacters.includes(relationship.targetId))
        .map((relationship) => ({
          sourceId: character.id,
          targetId: relationship.targetId,
          type: relationship.type,
          status: relationship.status
        }))
    ),
    eventStates: affectedEvents(project, candidate).map((event) => ({
      eventId: event.id,
      chapter: event.chapter,
      timelinePosition: event.timelinePosition,
      consequences: [...event.consequences]
    })),
    worldRules: [...project.rules.worldRules]
  };
}

function changeSetFor(
  project: StoryWorldProject,
  candidate: StoryCommitCandidate,
  evidenceBundle: StoryEvidenceBundle
): StoryChangePreviewChangeSet {
  return {
    addedFacts: candidate.worldChangesProposal.map((proposal, index) => ({
      id: `added-fact-${candidate.id}-${index + 1}`,
      summary: proposal,
      evidenceRefs: affectedCharacterEvidenceRefs(evidenceBundle, candidate)
    })),
    changedRelationships: relationshipChanges(project, candidate, evidenceBundle),
    triggeredEvents: affectedEvents(project, candidate).map((event) => ({
      id: `triggered-event-${event.id}`,
      summary: `${event.id} is pulled into the preview as a dependency.`,
      evidenceRefs: eventEvidenceRefs(evidenceBundle, event.id)
    }))
  };
}

function relationshipChanges(
  project: StoryWorldProject,
  candidate: StoryCommitCandidate,
  evidenceBundle: StoryEvidenceBundle
): StoryChangePreviewChange[] {
  const [first, second] = orderedRelationshipCharacters(project, candidate);

  if (first === undefined || second === undefined) {
    return [];
  }

  return [
    {
      id: `relationship-change-${first.id}-${second.id}`,
      summary: `${first.name} and ${second.name} relationship may shift through ${candidate.selectedDecision.optionType}.`,
      evidenceRefs: relationshipEvidenceRefs(evidenceBundle)
    }
  ];
}

function orderedRelationshipCharacters(
  project: StoryWorldProject,
  candidate: StoryCommitCandidate
): StoryWorldCharacter[] {
  const currentObjectId = project.workspaceRuntime.currentObject.id;

  return affectedCharacters(project, candidate).sort((left, right) => {
    if (left.id === currentObjectId) {
      return -1;
    }

    if (right.id === currentObjectId) {
      return 1;
    }

    return left.id.localeCompare(right.id);
  });
}

function affectedCharacters(project: StoryWorldProject, candidate: StoryCommitCandidate): StoryWorldCharacter[] {
  const affectedIds = new Set(candidate.affectedCharacters);

  return project.characters
    .filter((character) => affectedIds.has(character.id))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function affectedEvents(project: StoryWorldProject, candidate: StoryCommitCandidate): StoryWorldEvent[] {
  const affectedIds = new Set(candidate.affectedEvents);

  return project.events
    .filter((event) => affectedIds.has(event.id))
    .sort((left, right) => left.timelinePosition - right.timelinePosition || left.id.localeCompare(right.id));
}

function affectedCharacterEvidenceRefs(evidenceBundle: StoryEvidenceBundle, candidate: StoryCommitCandidate): string[] {
  return candidate.affectedCharacters
    .flatMap((characterId) => characterEvidenceRefs(evidenceBundle, characterId))
    .sort();
}

function characterEvidenceRefs(evidenceBundle: StoryEvidenceBundle, characterId: string): string[] {
  return evidenceBundle.characterEvidence
    .filter((item) => item.impactRef.startsWith(`character:${characterId}:`))
    .map(evidenceId)
    .sort();
}

function eventEvidenceRefs(evidenceBundle: StoryEvidenceBundle, eventId: string): string[] {
  return evidenceBundle.eventEvidence
    .filter((item) => item.impactRef.startsWith(`event:${eventId}:`))
    .map(evidenceId)
    .sort();
}

function relationshipEvidenceRefs(evidenceBundle: StoryEvidenceBundle): string[] {
  return evidenceBundle.relationshipEvidence.map(evidenceId).sort();
}

function evidenceId(item: StoryEvidenceItem): string {
  return item.evidenceId;
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
