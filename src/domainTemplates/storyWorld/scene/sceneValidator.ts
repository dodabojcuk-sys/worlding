import type { StorySceneBeatType, StoryScenePlan, StorySceneValidationResult } from "./sceneTypes.ts";

const requiredBeatTypes: StorySceneBeatType[] = ["opening", "development", "conflict", "turning_point", "resolution"];

export function validateStoryScenePlan(plan: StoryScenePlan): StorySceneValidationResult {
  const violations: string[] = [];
  const actualBeatTypes = plan.beats.map((beat) => beat.type);

  if (requiredBeatTypes.some((beatType) => !actualBeatTypes.includes(beatType)) || plan.beats.length !== 5) {
    violations.push("Scene plan must contain opening, development, conflict, turning point, and resolution beats.");
  }

  if (containsTextPayload(plan)) {
    violations.push("Scene plan must not contain generated chapter text.");
  }

  return cloneData({
    version: "world-os-story-scene-validation-v1",
    valid: violations.length === 0,
    violations
  });
}

function containsTextPayload(plan: StoryScenePlan): boolean {
  const data = plan as StoryScenePlan & Record<string, unknown>;
  const forbiddenFields = [
    ["chapter", "Text"],
    ["draft", "Text"]
  ].map((parts) => parts.join(""));

  return forbiddenFields.some((field) => data[field] !== undefined);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
