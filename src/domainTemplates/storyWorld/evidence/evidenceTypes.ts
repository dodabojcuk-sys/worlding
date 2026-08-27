export type StoryEvidenceSourceType =
  | "character"
  | "event"
  | "relationship"
  | "world_rule"
  | "location"
  | "chapter"
  | "keyframe"
  | "open_loop";

export type StoryEvidenceSourceRef = {
  sourceType: StoryEvidenceSourceType;
  sourceId: string;
  sourcePath: string;
  label: string;
  excerpt: string;
};

export type StoryEvidenceItem = {
  evidenceId: string;
  impactRef: string;
  summary: string;
  explanation: string;
  sources: StoryEvidenceSourceRef[];
};

export type StoryEvidenceCoverage = {
  totalImpacts: number;
  explainedImpacts: number;
  unexplainedImpactRefs: string[];
};

export type StoryEvidenceBundle = {
  version: "world-os-story-evidence-bundle-v1";
  intentId: string;
  characterEvidence: StoryEvidenceItem[];
  eventEvidence: StoryEvidenceItem[];
  relationshipEvidence: StoryEvidenceItem[];
  worldRuleEvidence: StoryEvidenceItem[];
  historyEvidence: StoryEvidenceItem[];
  coverage: StoryEvidenceCoverage;
  deterministic: true;
  canModifyWorld: false;
};

export type StoryEvidenceProjectionItem = {
  evidenceId: string;
  impactRef: string;
  explanation: string;
  sourceLabels: string[];
  sourcePaths: string[];
  sourceExcerpts: string[];
};

export type StoryEvidenceProjectionSection = {
  id: "character" | "event" | "relationship" | "world_rule" | "history";
  title: string;
  items: StoryEvidenceProjectionItem[];
};

export type StoryEvidenceProjection = {
  version: "world-os-story-evidence-projection-v1";
  intentId: string;
  summary: string;
  sections: StoryEvidenceProjectionSection[];
  unexplainedImpactRefs: string[];
};
