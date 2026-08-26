import type { StoryCommitCandidate } from "../decision/index.ts";
import type { StoryEvidenceBundle } from "../evidence/index.ts";
import type { StoryWorldProject } from "../index.ts";
import type { StoryChangePreviewValidationResult } from "./changePreviewTypes.ts";

export type ValidateStoryChangePreviewInput = {
  project: StoryWorldProject;
  candidate: StoryCommitCandidate;
  evidenceBundle: StoryEvidenceBundle;
};

export function validateStoryChangePreviewInput(
  input: ValidateStoryChangePreviewInput
): StoryChangePreviewValidationResult {
  const violations: string[] = [];

  if (input.candidate.selectedDecision.status !== "accepted" && input.candidate.selectedDecision.status !== "modified") {
    violations.push("Author decision must be accepted or modified before change preview.");
  }

  for (const characterId of input.candidate.affectedCharacters) {
    if (!input.project.characters.some((character) => character.id === characterId)) {
      violations.push(`Unknown affected character: ${characterId}.`);
    }
  }

  for (const eventId of input.candidate.affectedEvents) {
    if (!input.project.events.some((event) => event.id === eventId)) {
      violations.push(`Unknown affected event: ${eventId}.`);
    }
  }

  if (input.evidenceBundle.coverage.unexplainedImpactRefs.length > 0) {
    violations.push("All preview changes must be traceable to evidence.");
  }

  return cloneData({
    version: "world-os-story-change-preview-validation-v1",
    valid: violations.length === 0,
    violations
  });
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
