import type {
  StoryControlActor,
  StoryControlDraftResolutionAction,
  StoryControlPathId,
  StoryControlResult,
  StoryControlState
} from "./storyControlTypes.ts";
import {
  buildState,
  checkDraftText,
  createDraftResolutionState,
  createInitialStoryControlState,
  getScenario,
  getScenarioFromState,
  getSelectedOptionFromState,
  resolvePathOption,
  selectScenarioId
} from "./storyControlState.ts";
import { createStoryProductPrototypeModel } from "../storyProductPrototypeState.ts";

export { createInitialStoryControlState } from "./storyControlState.ts";

export type StoryControlSurface = ReturnType<typeof createStoryControlSurface>;

export function createStoryControlSurface(input: { actor?: StoryControlActor; state?: StoryControlState } = {}) {
  const actor = input.actor ?? "user";
  let state = input.state ? structuredClone(input.state) : createInitialStoryControlState();

  function setState(next: StoryControlState): StoryControlState {
    state = structuredClone(next);
    return getSnapshot();
  }

  function getSnapshot(): StoryControlState {
    return structuredClone(state);
  }

  function nextStep(): number {
    return state.logicalStep + 1;
  }

  function result<TPayload>(action: StoryControlResult<TPayload>["action"], payload: TPayload): StoryControlResult<TPayload> {
    return {
      action,
      payload,
      state: getSnapshot()
    };
  }

  return {
    getProjectHome() {
      state = setState(buildState({
        action: "getProjectHome",
        actor,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "project-home"
      }));

      return result("getProjectHome", state.ui.prototypeModel.authorLoop.projectHome);
    },

    continueCurrentWriting() {
      state = setState(buildState({
        action: "continueCurrentWriting",
        actor,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "writing"
      }));

      return result("continueCurrentWriting", state.ui.prototypeModel.writingWorkspace);
    },

    analyzeStoryInput({ text }: { text: string }) {
      const scenarioId = selectScenarioId(text);
      const model = createStoryProductPrototypeModel({ activeScenarioId: scenarioId });
      const scenario = {
        ...getScenario(model, scenarioId),
        input: text
      };

      state = setState(buildState({
        action: "analyzeStoryInput",
        actor,
        draftText: "",
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario,
        selectedOptionId: undefined,
        selectedPathId: undefined,
        stage: "impact-review"
      }));

      return result("analyzeStoryInput", state.analysis);
    },

    chooseStoryPath({ pathId }: { pathId: StoryControlPathId }) {
      const scenario = getScenarioFromState(state);
      const selectedOption = resolvePathOption(scenario, pathId);

      state = setState(buildState({
        action: "chooseStoryPath",
        actor,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario,
        selectedOptionId: selectedOption?.id,
        selectedPathId: pathId,
        stage: "impact-review"
      }));

      return result("chooseStoryPath", state.authorDecision);
    },

    applyWorldUpdatePreview() {
      if (state.authorDecision.status !== "accepted") {
        throw new Error("applyWorldUpdatePreview requires an accepted author path.");
      }

      state = setState(buildState({
        action: "applyWorldUpdatePreview",
        actor,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "world-update"
      }));

      return result("applyWorldUpdatePreview", state.worldUpdate);
    },

    enterWritingWorkspace() {
      if (state.authorDecision.status !== "accepted") {
        throw new Error("enterWritingWorkspace requires an accepted author path.");
      }

      state = setState(buildState({
        action: "enterWritingWorkspace",
        actor,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "writing-return"
      }));

      return result("enterWritingWorkspace", state.ui.prototypeModel.authorLoop.writingWorkspaceRuntime);
    },

    enterDraftWorkspace() {
      state = setState(buildState({
        action: "enterDraftWorkspace",
        actor,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "draft-workspace"
      }));

      return result("enterDraftWorkspace", state.ui.prototypeModel.authorLoop.draftWorkspace);
    },

    updateDraftText({ text }: { text: string }) {
      state = setState(buildState({
        action: "updateDraftText",
        actor,
        draftText: text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "draft-workspace"
      }));

      return result("updateDraftText", state.draft);
    },

    checkDraftConsistency() {
      const scenario = getScenarioFromState(state);
      const consistency = checkDraftText(
        scenario.presentation,
        getSelectedOptionFromState(state),
        state.draft.text
      );

      state = setState(buildState({
        action: "checkDraftConsistency",
        actor,
        consistency,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario,
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: "draft-workspace"
      }));

      return result("checkDraftConsistency", state.draft.consistency);
    },

    resolveDraft({ action }: { action: StoryControlDraftResolutionAction }) {
      if (state.draft.consistency.status === "not_checked") {
        throw new Error("resolveDraft requires a checked draft.");
      }

      const draftResolution = createDraftResolutionState(action);

      state = setState(buildState({
        action: "resolveDraft",
        actor,
        consistency: state.draft.consistency,
        draftResolution,
        draftText: state.draft.text,
        logicalStep: nextStep(),
        previousHistory: state.history,
        scenario: getScenarioFromState(state),
        selectedOptionId: state.selectedOptionId,
        selectedPathId: state.selectedPathId,
        stage: action === "review_impact" ? "impact-review" : "draft-workspace"
      }));

      return result("resolveDraft", state.draft.resolution);
    },

    getCurrentStoryState() {
      return result("getCurrentStoryState", getSnapshot());
    }
  };
}
