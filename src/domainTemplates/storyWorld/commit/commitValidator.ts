import type { StoryCommitCandidate } from "../decision/index.ts";
import type { StoryWorldProject } from "../index.ts";
import type { StoryCommitValidationResult } from "./commitTypes.ts";
import { storyEventId } from "./commitTypes.ts";

export function validateStoryCommitCandidate(
  project: StoryWorldProject,
  candidate: StoryCommitCandidate
): StoryCommitValidationResult {
  const violations: string[] = [];

  if (candidate.selectedDecision?.status !== "accepted" && candidate.selectedDecision?.status !== "modified") {
    violations.push("Author decision must be accepted or modified before commit.");
  }

  for (const characterId of candidate.affectedCharacters) {
    if (!project.characters.some((character) => character.id === characterId)) {
      violations.push(`Unknown affected character: ${characterId}.`);
    }
  }

  for (const eventId of candidate.affectedEvents) {
    if (!project.events.some((event) => event.id === eventId)) {
      violations.push(`Unknown affected event: ${eventId}.`);
    }
  }

  if (candidate.worldChangesProposal.some(hasTechnologyDrift)) {
    violations.push("World rule violation: technology level cannot drift without a keyframe.");
  }

  const nextEventId = storyEventId(candidate);
  if (project.events.some((event) => event.id === nextEventId)) {
    violations.push(`Duplicate story event id: ${nextEventId}.`);
  }

  return cloneData({
    version: "world-os-story-commit-validation-v1",
    valid: violations.length === 0,
    violations
  });
}

function hasTechnologyDrift(change: string): boolean {
  return change.includes("科技时代") || change.includes("technology level drift");
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
