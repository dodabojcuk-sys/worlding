import type { StoryImpactReport } from "../analysis/index.ts";
import type {
  StoryDecisionAffectedObjects,
  StoryDecisionOption,
  StoryDecisionOptionType,
  StoryDecisionRiskLevel,
  StoryDecisionWorkspace
} from "./decisionTypes.ts";

export function createStoryDecisionWorkspace(report: StoryImpactReport): StoryDecisionWorkspace {
  return cloneData({
    version: "world-os-story-decision-workspace-v1",
    intentId: report.intentId,
    impactReport: report,
    options: buildOptions(report),
    selectedOption: undefined,
    authorNotes: [],
    status: "pending"
  });
}

function buildOptions(report: StoryImpactReport): StoryDecisionOption[] {
  const affectedObjects = affectedObjectsFromReport(report);
  const riskLevel = riskLevelFromReport(report);
  const risks = report.risks.map((risk) => `Risk: ${risk}`);

  return [
    ...report.alternatives.map((alternative) => ({
      id: decisionOptionId(report.intentId, alternative.id),
      type: optionTypeForAlternative(alternative.label),
      description: `Accept ${alternative.label}`,
      consequences: [alternative.effect, ...risks],
      affectedObjects,
      riskLevel: riskLevelForAlternative(alternative.label, riskLevel)
    })),
    {
      id: `decision-${report.intentId}-custom`,
      type: "custom_modification",
      description: "Custom modification",
      consequences: ["Requires author content before commit candidate."],
      affectedObjects,
      riskLevel: "medium"
    },
    {
      id: `decision-${report.intentId}-reject`,
      type: "reject_change",
      description: "Reject this change",
      consequences: ["No world change proposal is created."],
      affectedObjects,
      riskLevel: "low"
    }
  ];
}

function affectedObjectsFromReport(report: StoryImpactReport): StoryDecisionAffectedObjects {
  return {
    characters: report.affectedCharacters.map((impact) => impact.characterId).sort(),
    events: report.affectedEvents.map((impact) => impact.eventId).sort(),
    relationships: report.affectedRelationships
      .map((impact) => `${impact.sourceId}->${impact.targetId}`)
      .sort(),
    rules: report.affectedRules.map((impact) => impact.rule)
  };
}

function decisionOptionId(intentId: string, alternativeId: string): string {
  const suffix = alternativeId.slice(alternativeId.lastIndexOf("-") + 1);
  return `decision-${intentId}-${suffix}`;
}

function optionTypeForAlternative(label: string): StoryDecisionOptionType {
  if (label === "immediate reveal") {
    return "accept_immediate_reveal";
  }

  if (label === "partial clue") {
    return "accept_partial_clue";
  }

  return "accept_delayed_reveal";
}

function riskLevelFromReport(report: StoryImpactReport): StoryDecisionRiskLevel {
  if (report.risks.length >= 2) {
    return "high";
  }

  if (report.risks.length === 1) {
    return "medium";
  }

  return "low";
}

function riskLevelForAlternative(label: string, baseRisk: StoryDecisionRiskLevel): StoryDecisionRiskLevel {
  if (label === "delayed reveal") {
    return "low";
  }

  if (label === "partial clue" && baseRisk === "high") {
    return "medium";
  }

  return baseRisk;
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
