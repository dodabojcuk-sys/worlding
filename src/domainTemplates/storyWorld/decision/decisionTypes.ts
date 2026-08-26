import type { StoryImpactReport } from "../analysis/index.ts";

export type StoryDecisionStatus = "pending" | "accepted" | "modified" | "rejected";

export type StoryDecisionOptionType =
  | "accept_immediate_reveal"
  | "accept_partial_clue"
  | "accept_delayed_reveal"
  | "custom_modification"
  | "reject_change";

export type StoryDecisionRiskLevel = "low" | "medium" | "high";

export type StoryDecisionAffectedObjects = {
  characters: string[];
  events: string[];
  relationships: string[];
  rules: string[];
};

export type StoryDecisionOption = {
  id: string;
  type: StoryDecisionOptionType;
  description: string;
  consequences: string[];
  affectedObjects: StoryDecisionAffectedObjects;
  riskLevel: StoryDecisionRiskLevel;
};

export type StoryDecisionWorkspace = {
  version: "world-os-story-decision-workspace-v1";
  intentId: string;
  impactReport: StoryImpactReport;
  options: StoryDecisionOption[];
  selectedOption?: StoryDecisionOption;
  authorNotes: string[];
  status: StoryDecisionStatus;
};

export type StoryDecisionHistory = {
  version: "world-os-story-decision-history-v1";
  originalIntentId: string;
  aiSuggestions: string[];
  authorChoice: {
    optionId: string;
    optionType: StoryDecisionOptionType;
    status: StoryDecisionStatus;
  };
  modificationReason?: string;
};

export type StoryCommitCandidate = {
  version: "world-os-story-commit-candidate-v1";
  id: string;
  intentId: string;
  selectedDecision: {
    optionId: string;
    optionType: StoryDecisionOptionType;
    status: "accepted" | "modified";
    authorNotes: string[];
    authorContent?: string;
  };
  affectedEvents: string[];
  affectedCharacters: string[];
  worldChangesProposal: string[];
  decisionHistory: StoryDecisionHistory;
};

export type ResolveAuthorDecisionInput = {
  workspace: StoryDecisionWorkspace;
  selectedOptionId: string;
  status: StoryDecisionStatus;
  authorNotes?: string[];
  authorContent?: string;
};

export type StoryDecisionResolution = {
  version: "world-os-story-decision-resolution-v1";
  workspace: StoryDecisionWorkspace;
  decisionHistory: StoryDecisionHistory;
  commitCandidate?: StoryCommitCandidate;
  canCommit: boolean;
};
