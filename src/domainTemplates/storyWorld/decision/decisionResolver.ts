import type {
  ResolveAuthorDecisionInput,
  StoryCommitCandidate,
  StoryDecisionHistory,
  StoryDecisionOption,
  StoryDecisionResolution,
  StoryDecisionWorkspace
} from "./decisionTypes.ts";

export function resolveAuthorDecision(input: ResolveAuthorDecisionInput): StoryDecisionResolution {
  const selectedOption = findOption(input.workspace, input.selectedOptionId);

  if (input.status === "modified" && input.authorContent?.trim() === undefined) {
    throw new Error("Modified decision requires author content.");
  }

  if (input.status === "modified" && input.authorContent.trim() === "") {
    throw new Error("Modified decision requires author content.");
  }

  const workspace = applySelection(input.workspace, selectedOption, input.status, input.authorNotes ?? []);
  const decisionHistory = buildHistory(workspace, selectedOption, input.status, input.authorContent);

  if (input.status === "accepted" || input.status === "modified") {
    const commitCandidate = buildCommitCandidate(workspace, selectedOption, decisionHistory, input.authorContent);

    return cloneData({
      version: "world-os-story-decision-resolution-v1",
      workspace,
      decisionHistory,
      commitCandidate,
      canCommit: true
    });
  }

  return cloneData({
    version: "world-os-story-decision-resolution-v1",
    workspace,
    decisionHistory,
    commitCandidate: undefined,
    canCommit: false
  });
}

function findOption(workspace: StoryDecisionWorkspace, selectedOptionId: string): StoryDecisionOption {
  const selectedOption = workspace.options.find((option) => option.id === selectedOptionId);

  if (selectedOption === undefined) {
    throw new Error(`Unknown story decision option: ${selectedOptionId}`);
  }

  return selectedOption;
}

function applySelection(
  workspace: StoryDecisionWorkspace,
  selectedOption: StoryDecisionOption,
  status: ResolveAuthorDecisionInput["status"],
  authorNotes: string[]
): StoryDecisionWorkspace {
  return cloneData({
    ...workspace,
    selectedOption,
    authorNotes: [...authorNotes],
    status
  });
}

function buildHistory(
  workspace: StoryDecisionWorkspace,
  selectedOption: StoryDecisionOption,
  status: ResolveAuthorDecisionInput["status"],
  authorContent: string | undefined
): StoryDecisionHistory {
  const history: StoryDecisionHistory = {
    version: "world-os-story-decision-history-v1",
    originalIntentId: workspace.intentId,
    aiSuggestions: workspace.impactReport.alternatives.map((alternative) => alternative.label),
    authorChoice: {
      optionId: selectedOption.id,
      optionType: selectedOption.type,
      status
    }
  };

  if (status === "modified") {
    history.modificationReason = authorContent;
  }

  return history;
}

function buildCommitCandidate(
  workspace: StoryDecisionWorkspace,
  selectedOption: StoryDecisionOption,
  decisionHistory: StoryDecisionHistory,
  authorContent: string | undefined
): StoryCommitCandidate {
  const selectedDecision = {
    optionId: selectedOption.id,
    optionType: selectedOption.type,
    status: decisionHistory.authorChoice.status as "accepted" | "modified",
    authorNotes: [...workspace.authorNotes],
    ...(authorContent === undefined ? {} : { authorContent })
  };

  return cloneData({
    version: "world-os-story-commit-candidate-v1",
    id: commitCandidateId(workspace.intentId, selectedOption.id),
    intentId: workspace.intentId,
    selectedDecision,
    affectedEvents: [...selectedOption.affectedObjects.events],
    affectedCharacters: [...selectedOption.affectedObjects.characters],
    worldChangesProposal: worldChangesProposal(selectedOption, authorContent),
    decisionHistory
  });
}

function commitCandidateId(intentId: string, optionId: string): string {
  const suffix = optionId.slice(optionId.lastIndexOf("-") + 1);
  return `commit-candidate-${intentId}-${suffix}`;
}

function worldChangesProposal(selectedOption: StoryDecisionOption, authorContent: string | undefined): string[] {
  if (selectedOption.type === "custom_modification") {
    return [`Custom modification: ${authorContent}`, `Risk level: ${selectedOption.riskLevel}`];
  }

  return [`${selectedOption.description}: ${selectedOptionSummary(selectedOption)}`, `Risk level: ${selectedOption.riskLevel}`];
}

function selectedOptionSummary(selectedOption: StoryDecisionOption): string {
  if (selectedOption.type === "accept_immediate_reveal") {
    return "Let the discovery become explicit in the current chapter.";
  }

  if (selectedOption.type === "accept_partial_clue") {
    return "Show a clue without confirming the full secret.";
  }

  if (selectedOption.type === "accept_delayed_reveal") {
    return "Move the discovery pressure to a later chapter.";
  }

  return selectedOption.description;
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
