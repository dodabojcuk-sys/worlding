import {
  createStoryAuthorIntent,
  type StoryIntentTargetScope
} from "../intent/index.ts";
import type { StoryWorldProject } from "../index.ts";
import {
  createStoryDecisionWorkspace,
  resolveAuthorDecision,
  type StoryDecisionResolution,
  type StoryDecisionWorkspace
} from "../decision/index.ts";
import type { StoryImpactReport } from "../analysis/index.ts";
import {
  planStoryScene,
  reviewStoryScenePlan,
  type StoryScenePlan
} from "../scene/index.ts";
import {
  createStoryWritingWorkspace,
  type StoryWritingWorkspace
} from "../writing/index.ts";
import type {
  ManualExtractedClue,
  ManualExtractedEvent,
  ManualExtractedWorldObjects,
  ManualSimulationDecisionState,
  ManualStorySimulationInput,
  NormalizedManualStorySimulationInput
} from "./simulationTypes.ts";

export function normalizeManualStorySimulationInput(
  input: ManualStorySimulationInput
): NormalizedManualStorySimulationInput {
  const rawText = typeof input === "string" ? input : input.rawText;

  return cloneData({
    rawText,
    source: "author",
    logicalClock: rawText.length
  });
}

export function extractManualStoryWorldObjects(
  project: StoryWorldProject,
  input: NormalizedManualStorySimulationInput
): ManualExtractedWorldObjects {
  const characters = project.characters
    .filter((character) => includesAny(input.rawText, [character.name, character.id]))
    .map((character) => ({
      id: character.id,
      name: character.name,
      evidence: [character.name]
    }))
    .sort(byId);
  const locations = project.locations
    .filter((location) => locationMatches(input.rawText, location.id, location.name))
    .map((location) => ({
      id: location.id,
      name: location.name,
      evidence: locationEvidence(input.rawText, location.id, location.name)
    }))
    .sort(byId);
  const events = extractEvents(input.rawText);
  const clues = extractClues(input.rawText);
  const relatedEvents = relatedProjectEventIds(project, input.rawText);

  return cloneData({
    version: "world-os-story-manual-world-extraction-v1",
    characters,
    locations,
    events,
    clues,
    relatedProjectRefs: {
      characters: characters.map((character) => character.id),
      locations: locations.map((location) => location.id),
      events: relatedEvents
    }
  });
}

export function buildManualSimulationIntent(
  input: NormalizedManualStorySimulationInput,
  worldObjects: ManualExtractedWorldObjects
) {
  return createStoryAuthorIntent({
    id: `manual-intent-${stableTextHash(input.rawText)}`,
    content: input.rawText,
    source: "author",
    targetScope: targetScopeFor(input.rawText, worldObjects),
    createdAtLogical: input.logicalClock,
    relatedCharacters: worldObjects.relatedProjectRefs.characters,
    relatedEvents: worldObjects.relatedProjectRefs.events,
    relatedLocations: worldObjects.relatedProjectRefs.locations
  });
}

export function buildManualSimulationDecisionState(
  report: StoryImpactReport
): ManualSimulationDecisionState {
  const workspace = createStoryDecisionWorkspace(report);
  const selectedOption = workspace.options.find((option) => option.type === "accept_partial_clue") ?? workspace.options[0];
  const resolution = resolveAuthorDecision({
    workspace,
    selectedOptionId: selectedOption.id,
    status: "accepted",
    authorNotes: ["Manual simulation author gate accepted partial clue for projection."]
  });

  return cloneData({
    version: "world-os-story-manual-simulation-decision-state-v1",
    authorDecisionRequired: true,
    workspace,
    selectedOptionId: selectedOption.id,
    resolution
  });
}

export function buildManualSimulationScenePlan(
  project: StoryWorldProject,
  decisionState: ManualSimulationDecisionState
): StoryScenePlan {
  const previewCommit = buildPreviewCommit(project, decisionState.workspace, decisionState.resolution);
  const plan = planStoryScene(project, previewCommit);

  return reviewStoryScenePlan(plan, {
    status: "accepted",
    authorNotes: ["Manual simulation accepted scene plan for writing workspace projection."]
  }).plan;
}

export function buildManualSimulationWritingWorkspace(
  project: StoryWorldProject,
  scenePlan: StoryScenePlan
): StoryWritingWorkspace {
  return createStoryWritingWorkspace(project, [scenePlan]);
}

function buildPreviewCommit(
  project: StoryWorldProject,
  workspace: StoryDecisionWorkspace,
  resolution: StoryDecisionResolution
) {
  const candidate = resolution.commitCandidate;

  if (candidate === undefined) {
    throw new Error("Manual simulation needs an accepted author decision projection.");
  }

  return {
    version: "world-os-story-event-commit-v1",
    id: `story-commit-${candidate.intentId}`,
    projectId: project.projectId,
    chapterId: project.currentChapter.id,
    event: {
      id: `story-event-${candidate.intentId}`,
      chapter: project.currentChapter.id,
      timelinePosition: nextTimelinePosition(project),
      participants: [...candidate.affectedCharacters],
      consequences: [...candidate.worldChangesProposal]
    },
    source: {
      candidateId: candidate.id,
      intentId: candidate.intentId,
      decisionId: workspace.options.find((option) => option.id === candidate.selectedDecision.optionId)?.id ?? candidate.selectedDecision.optionId,
      authorChoice: candidate.selectedDecision.status
    }
  };
}

function extractEvents(rawText: string): ManualExtractedEvent[] {
  return rawText
    .split(/[。！？\n]+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map((summary, index) => ({
      id: `manual-event-${index + 1}`,
      summary,
      sequence: index + 1
    }));
}

function extractClues(rawText: string): ManualExtractedClue[] {
  const clues: ManualExtractedClue[] = [];

  if (includesAny(rawText, ["地下声音", "地下"])) {
    clues.push({
      id: "clue-underground-sound",
      text: "地下声音",
      evidence: matchingEvidence(rawText, ["地下声音", "地下"])
    });
  }

  if (includesAny(rawText, ["旧信", "写着自己名字"])) {
    clues.push({
      id: "clue-old-letter",
      text: "旧信",
      evidence: matchingEvidence(rawText, ["旧信", "写着自己名字"])
    });
  }

  return clues;
}

function relatedProjectEventIds(project: StoryWorldProject, rawText: string): string[] {
  return project.events
    .filter((event) => {
      if (event.id === "event-1") {
        return includesAny(rawText, ["旧信", "写着自己名字"]);
      }

      if (event.id === "event-2") {
        return includesAny(rawText, ["阿岚", "警告"]);
      }

      if (event.id === "event-3") {
        return includesAny(rawText, ["地下", "灯塔", "下层"]);
      }

      return event.consequences.some((consequence) => rawText.includes(consequence));
    })
    .sort((left, right) => left.timelinePosition - right.timelinePosition || compareText(left.id, right.id))
    .map((event) => event.id);
}

function targetScopeFor(
  rawText: string,
  worldObjects: ManualExtractedWorldObjects
): StoryIntentTargetScope {
  if (includesAny(rawText, ["规则", "不能", "不得"])) {
    return "world_rule";
  }

  if (includesAny(rawText, ["关系", "信任", "怀疑", "背叛"])) {
    return "relationship";
  }

  if (worldObjects.relatedProjectRefs.events.length > 0 || worldObjects.clues.length > 0) {
    return "event";
  }

  if (worldObjects.relatedProjectRefs.characters.length > 0) {
    return "character";
  }

  return "new_scene";
}

function locationMatches(rawText: string, id: string, name: string): boolean {
  if (rawText.includes(name) || rawText.includes(id)) {
    return true;
  }

  if (id === "old-lighthouse") {
    return includesAny(rawText, ["灯塔", "地下"]);
  }

  if (id === "fog-port") {
    return includesAny(rawText, ["雾港", "港"]);
  }

  return false;
}

function locationEvidence(rawText: string, id: string, name: string): string[] {
  if (id === "old-lighthouse") {
    return matchingEvidence(rawText, [name, "灯塔", "地下"]);
  }

  if (id === "fog-port") {
    return matchingEvidence(rawText, [name, "雾港", "港"]);
  }

  return matchingEvidence(rawText, [name, id]);
}

function stableTextHash(value: string): string {
  let hash = 17;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
  }

  return hash.toString(36);
}

function nextTimelinePosition(project: StoryWorldProject): number {
  return project.events.reduce(
    (highest, event) => (event.timelinePosition > highest ? event.timelinePosition : highest),
    0
  ) + 1;
}

function matchingEvidence(source: string, candidates: string[]): string[] {
  return candidates.filter((candidate) => source.includes(candidate)).sort(compareText);
}

function includesAny(source: string, candidates: string[]): boolean {
  return candidates.some((candidate) => source.includes(candidate));
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
