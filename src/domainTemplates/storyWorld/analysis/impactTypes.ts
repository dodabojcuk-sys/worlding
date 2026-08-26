export type StoryCharacterImpactCategory = "personality_change" | "status_change" | "knowledge_change";
export type StoryEventImpactCategory = "timeline_effect" | "dependency_effect";
export type StoryRelationshipImpactCategory = "trust" | "conflict" | "alliance";
export type StoryWorldImpactCategory = "rule_conflict" | "location_impact";

export type StoryCharacterImpact = {
  characterId: string;
  category: StoryCharacterImpactCategory;
  summary: string;
};

export type StoryEventImpact = {
  eventId: string;
  category: StoryEventImpactCategory;
  summary: string;
  chapter: string;
};

export type StoryRelationshipImpact = {
  sourceId: string;
  targetId: string;
  category: StoryRelationshipImpactCategory;
  summary: string;
};

export type StoryWorldRuleImpact = {
  rule: string;
  category: StoryWorldImpactCategory;
  summary: string;
};

export type StoryImpactAlternative = {
  id: string;
  label: "immediate reveal" | "partial clue" | "delayed reveal";
  summary: string;
  effect: string;
  canModifyWorld: false;
};

export type StoryImpactReport = {
  version: "world-os-story-impact-report-v1";
  intentId: string;
  affectedCharacters: StoryCharacterImpact[];
  affectedEvents: StoryEventImpact[];
  affectedRelationships: StoryRelationshipImpact[];
  affectedRules: StoryWorldRuleImpact[];
  risks: string[];
  opportunities: string[];
  alternatives: StoryImpactAlternative[];
  confidence: number;
  reasoning: string[];
};

export type StoryImpactAuthorDecisionInput = {
  version: "world-os-impact-author-decision-input-v1";
  intentId: string;
  nextStep: "AuthorDecision";
  proposal: string;
  alternatives: StoryImpactAlternative["label"][];
  authorChoice: {
    choice: "pending";
  };
  canCommit: false;
};
