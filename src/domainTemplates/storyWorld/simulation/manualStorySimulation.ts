import { analyzeStoryImpactReport } from "../analysis/index.ts";
import { createStoryWorldTemplate } from "../index.ts";
import {
  projectStoryProductUIState,
  validateStoryProductUIState
} from "../productUI/storyUIProjection.ts";
import type { ManualSimulationResult, ManualStorySimulationInput } from "./simulationTypes.ts";
import {
  buildManualSimulationDecisionState,
  buildManualSimulationIntent,
  buildManualSimulationScenePlan,
  buildManualSimulationWritingWorkspace,
  extractManualStoryWorldObjects,
  normalizeManualStorySimulationInput
} from "./simulationProjection.ts";

export function simulateManualStoryInput(input: ManualStorySimulationInput): ManualSimulationResult {
  const normalizedInput = normalizeManualStorySimulationInput(input);
  const project = typeof input === "string"
    ? createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" })
    : input.project ?? createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const worldObjects = extractManualStoryWorldObjects(project, normalizedInput);
  const intent = buildManualSimulationIntent(normalizedInput, worldObjects);
  const impactReport = analyzeStoryImpactReport(project, intent);
  const decisionState = buildManualSimulationDecisionState(impactReport);
  const scenePlan = buildManualSimulationScenePlan(project, decisionState);
  const writingWorkspace = buildManualSimulationWritingWorkspace(project, scenePlan);
  const uiProjection = projectStoryProductUIState({
    project,
    writingWorkspace,
    impactReport,
    decisionWorkspace: decisionState.workspace,
    currentWorkspace: "writing"
  });
  const validation = validateStoryProductUIState(uiProjection);

  if (!validation.valid) {
    throw new Error(validation.violations.join(" "));
  }

  return cloneData({
    version: "world-os-story-manual-simulation-result-v1",
    input: normalizedInput,
    worldObjects,
    intent,
    impactReport,
    decisionState,
    scenePlan,
    uiProjection
  });
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
