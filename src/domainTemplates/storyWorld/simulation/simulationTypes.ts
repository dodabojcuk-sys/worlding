import type { StoryImpactReport } from "../analysis/index.ts";
import type { StoryDecisionResolution, StoryDecisionWorkspace } from "../decision/index.ts";
import type { StoryWorldProject } from "../index.ts";
import type { StoryProductUIState } from "../productUI/storyUIState.ts";
import type { StoryScenePlan } from "../scene/index.ts";
import type { StoryAuthorIntent } from "../intent/index.ts";

export type ManualStorySimulationInput = string | {
  rawText: string;
  project?: StoryWorldProject;
};

export type NormalizedManualStorySimulationInput = {
  rawText: string;
  source: "author";
  logicalClock: number;
};

export type ManualExtractedCharacter = {
  id: string;
  name: string;
  evidence: string[];
};

export type ManualExtractedLocation = {
  id: string;
  name: string;
  evidence: string[];
};

export type ManualExtractedEvent = {
  id: string;
  summary: string;
  sequence: number;
};

export type ManualExtractedClue = {
  id: string;
  text: string;
  evidence: string[];
};

export type ManualExtractedWorldObjects = {
  version: "world-os-story-manual-world-extraction-v1";
  characters: ManualExtractedCharacter[];
  locations: ManualExtractedLocation[];
  events: ManualExtractedEvent[];
  clues: ManualExtractedClue[];
  relatedProjectRefs: {
    characters: string[];
    locations: string[];
    events: string[];
  };
};

export type ManualSimulationDecisionState = {
  version: "world-os-story-manual-simulation-decision-state-v1";
  authorDecisionRequired: true;
  workspace: StoryDecisionWorkspace;
  selectedOptionId: string;
  resolution: StoryDecisionResolution;
};

export type ManualSimulationResult = {
  version: "world-os-story-manual-simulation-result-v1";
  input: NormalizedManualStorySimulationInput;
  worldObjects: ManualExtractedWorldObjects;
  intent: StoryAuthorIntent;
  impactReport: StoryImpactReport;
  decisionState: ManualSimulationDecisionState;
  scenePlan: StoryScenePlan;
  uiProjection: StoryProductUIState;
};
