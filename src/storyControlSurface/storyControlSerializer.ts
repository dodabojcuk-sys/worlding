import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createInitialStoryControlState } from "./storyControlState.ts";
import type { StoryControlState } from "./storyControlTypes.ts";

export function serializeStoryControlState(state: StoryControlState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function deserializeStoryControlState(raw: string): StoryControlState {
  const parsed = JSON.parse(raw) as StoryControlState;

  if (parsed.version !== "world-os-story-control-state-v1") {
    throw new Error("Unsupported story control state version.");
  }

  return structuredClone(parsed);
}

export function loadStoryControlState(path: string): StoryControlState {
  try {
    return deserializeStoryControlState(readFileSync(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return createInitialStoryControlState();
    }

    throw error;
  }
}

export function saveStoryControlState(path: string, state: StoryControlState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeStoryControlState(state), "utf8");
}
