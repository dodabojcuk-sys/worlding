import type {
  StoryEvidenceBundle,
  StoryEvidenceItem,
  StoryEvidenceProjection,
  StoryEvidenceProjectionItem,
  StoryEvidenceProjectionSection
} from "./evidenceTypes.ts";

export function projectStoryEvidenceForAuthor(bundle: StoryEvidenceBundle): StoryEvidenceProjection {
  return {
    version: "world-os-story-evidence-projection-v1",
    intentId: bundle.intentId,
    summary: `${bundle.coverage.explainedImpacts}/${bundle.coverage.totalImpacts} impacts have traceable story evidence.`,
    sections: [
      section("character", "Character evidence", bundle.characterEvidence),
      section("event", "Event evidence", bundle.eventEvidence),
      section("relationship", "Relationship evidence", bundle.relationshipEvidence),
      section("world_rule", "World rule evidence", bundle.worldRuleEvidence),
      section("history", "History evidence", bundle.historyEvidence)
    ],
    unexplainedImpactRefs: [...bundle.coverage.unexplainedImpactRefs]
  };
}

function section(
  id: StoryEvidenceProjectionSection["id"],
  title: string,
  evidence: StoryEvidenceItem[]
): StoryEvidenceProjectionSection {
  return {
    id,
    title,
    items: evidence.map(projectEvidenceItem)
  };
}

function projectEvidenceItem(item: StoryEvidenceItem): StoryEvidenceProjectionItem {
  return {
    evidenceId: item.evidenceId,
    impactRef: item.impactRef,
    explanation: item.explanation,
    sourceLabels: item.sources.map((source) => source.label),
    sourcePaths: item.sources.map((source) => source.sourcePath),
    sourceExcerpts: item.sources.map((source) => source.excerpt)
  };
}
