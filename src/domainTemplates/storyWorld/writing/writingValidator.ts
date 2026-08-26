import type {
  StoryLockedElements,
  StoryWritingChangeProposal,
  StoryWritingChangeValidationResult,
  StoryWritingValidationResult,
  StoryWritingWorkspace
} from "./writingTypes.ts";

export function validateStoryWritingWorkspace(workspace: StoryWritingWorkspace): StoryWritingValidationResult {
  const violations: string[] = [];
  const unacceptedScenes = workspace.scenes
    .filter((scene) => scene.status === "ready_for_draft" && !isApprovedScene(scene.plan.review.status))
    .map((scene) => scene.sceneId);

  if (unacceptedScenes.length > 0) {
    violations.push(`Unaccepted scenes cannot enter drafting: ${unacceptedScenes.join(", ")}.`);
  }

  if (containsGeneratedPayload(workspace)) {
    violations.push("Writing workspace must not contain generated prose payload.");
  }

  return cloneData({
    version: "world-os-story-writing-validation-v1",
    valid: violations.length === 0,
    violations
  });
}

export function validateStoryWritingChange(
  workspace: StoryWritingWorkspace,
  proposal: StoryWritingChangeProposal
): StoryWritingChangeValidationResult {
  const scene = workspace.scenes.find((candidate) => candidate.sceneId === proposal.sceneId);

  if (scene === undefined) {
    return validationResult([`Unknown writing scene: ${proposal.sceneId}.`]);
  }

  if (isLockedTarget(proposal.target)) {
    return validationResult([`Locked element cannot be modified: ${proposal.target} ${proposal.value}.`]);
  }

  if (!scene.editableElements.includes(proposal.target)) {
    return validationResult([`Writing target is not editable for scene: ${proposal.target}.`]);
  }

  return validationResult([]);
}

function isApprovedScene(status: string): boolean {
  return status === "accepted" || status === "modified";
}

function isLockedTarget(target: string): target is keyof StoryLockedElements {
  return ["committed_events", "character_facts", "world_rules", "approved_decisions"].includes(target);
}

function containsGeneratedPayload(workspace: StoryWritingWorkspace): boolean {
  const data = workspace as StoryWritingWorkspace & Record<string, unknown>;
  const fields = [
    ["chapter", "Text"],
    ["draft", "Text"]
  ].map((parts) => parts.join(""));

  return fields.some((field) => data[field] !== undefined);
}

function validationResult(violations: string[]): StoryWritingChangeValidationResult {
  return cloneData({
    version: "world-os-writing-change-validation-v1",
    valid: violations.length === 0,
    violations
  });
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
