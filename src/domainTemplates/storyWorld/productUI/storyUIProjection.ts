import type { StoryImpactReport } from "../analysis/index.ts";
import type { StoryDecisionWorkspace } from "../decision/index.ts";
import type { StoryWorldProject } from "../index.ts";
import type { StoryWritingWorkspace } from "../writing/index.ts";
import type {
  StoryAIDecisionPanel,
  StoryProductPanelBase,
  StoryProductUIProjectionInput,
  StoryProductUIState,
  StoryProductUIValidationResult,
  StoryProductWorkspace
} from "./storyUIState.ts";

export function projectStoryProductUIState(input: StoryProductUIProjectionInput): StoryProductUIState {
  const project = input.project as StoryWorldProject;
  const writingWorkspace = input.writingWorkspace as StoryWritingWorkspace;
  const impactReport = input.impactReport as StoryImpactReport | undefined;
  const decisionWorkspace = input.decisionWorkspace as StoryDecisionWorkspace | undefined;
  const activeScene = writingWorkspace.scenes.find((scene) => scene.sceneId === writingWorkspace.activeSceneId) ?? writingWorkspace.scenes[0];

  return cloneData({
    version: "world-os-story-product-ui-state-v1",
    currentWorkspace: input.currentWorkspace ?? "writing",
    activeChapter: {
      id: project.currentChapter.id,
      title: project.currentChapter.title,
      status: writingWorkspace.chapterState.status,
      primaryAction: "Continue writing",
      visibleConcepts: ["chapter", "scenes", "constraints"]
    },
    activeScene: {
      id: activeScene.sceneId,
      sourceCommitId: activeScene.plan.sourceCommitId,
      status: activeScene.status,
      purpose: activeScene.plan.purpose,
      primaryAction: "Prepare draft request",
      visibleConcepts: ["scene", "beats", "locks"]
    },
    worldSummary: {
      title: project.world.title,
      characters: project.characters.map((character) => character.name),
      locations: project.locations.map((location) => location.name),
      events: project.events.map((event) => event.id),
      primaryAction: "Review world",
      visibleConcepts: ["characters", "locations", "events"]
    },
    characterPanel: {
      focus: activeScene.lockedElements.characterFacts,
      locked: ["character facts", "world rules", "approved decisions"],
      editable: activeScene.editableElements,
      primaryAction: "Review character constraints",
      visibleConcepts: ["focus", "locked", "editable"]
    },
    aiDecisionPanel: aiDecisionPanel(impactReport, decisionWorkspace),
    writingPanel: {
      chapterId: writingWorkspace.chapterId,
      scenes: writingWorkspace.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        status: scene.status,
        purpose: scene.plan.purpose
      })),
      lockedElements: [
        ...activeScene.lockedElements.committedEvents,
        ...activeScene.lockedElements.characterFacts,
        ...activeScene.lockedElements.worldRules,
        ...activeScene.lockedElements.approvedDecisions
      ],
      editableElements: activeScene.editableElements,
      draftStatus: writingWorkspace.draftStatus,
      primaryAction: "Prepare draft request",
      visibleConcepts: ["scene", "locked", "editable"]
    },
    consistencyPanel: {
      consistency: {
        characterConsistency: 95,
        timelineConflicts: 0,
        unresolvedThreads: project.openLoops.length
      },
      recentHistory: recentHistory(project, activeScene.plan.sourceCommitId),
      primaryAction: "Inspect consistency",
      visibleConcepts: ["consistency", "threads", "history"]
    },
    nextAction: {
      id: "prepare-draft-request",
      label: "Prepare draft request",
      targetWorkspace: "writing",
      reason: "Accepted scene plan is ready for structured draft preparation."
    }
  });
}

export function validateStoryProductUIState(state: StoryProductUIState): StoryProductUIValidationResult {
  const panels = panelList(state);
  const violations: string[] = [];

  if (panels.some((panel) => panel.primaryAction.trim() === "")) {
    violations.push("Every product panel needs a primary action.");
  }

  if (panels.some((panel) => panel.visibleConcepts.length > 3)) {
    violations.push("Visible concepts must be three or fewer per panel.");
  }

  return cloneData({
    version: "world-os-story-product-ui-validation-v1",
    valid: violations.length === 0,
    violations
  });
}

function aiDecisionPanel(
  impactReport: StoryImpactReport | undefined,
  decisionWorkspace: StoryDecisionWorkspace | undefined
): StoryAIDecisionPanel {
  if (impactReport === undefined) {
    return {
      title: "天意",
      status: "idle",
      impactSummary: [],
      alternatives: [],
      primaryAction: "Review suggestions",
      visibleConcepts: ["impact", "alternatives", "decision"]
    };
  }

  return {
    title: "天意",
    status: decisionWorkspace === undefined ? "analysis_ready" : "decision_ready",
    impactSummary: [
      ...impactReport.affectedCharacters.map((impact) => `character:${impact.characterId}`),
      ...impactReport.affectedEvents.map((impact) => `event:${impact.eventId}`),
      ...impactReport.affectedRules.map((impact) => `rule:${impact.rule}`)
    ],
    alternatives: impactReport.alternatives.map((alternative) => alternative.label),
    ...(decisionWorkspace === undefined
      ? {}
      : {
          pendingDecision: {
            intentId: decisionWorkspace.intentId,
            optionIds: decisionWorkspace.options.map((option) => option.id)
          }
        }),
    primaryAction: "Choose story path",
    visibleConcepts: ["impact", "alternatives", "decision"]
  };
}

function recentHistory(project: StoryWorldProject, sourceCommitId: string): string[] {
  const latestEvent = project.events[project.events.length - 1]?.id;
  return latestEvent === undefined ? [sourceCommitId] : [sourceCommitId, latestEvent];
}

function panelList(state: StoryProductUIState): StoryProductPanelBase[] {
  return [
    state.activeChapter,
    state.activeScene,
    state.worldSummary,
    state.characterPanel,
    state.aiDecisionPanel,
    state.writingPanel,
    state.consistencyPanel
  ];
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
