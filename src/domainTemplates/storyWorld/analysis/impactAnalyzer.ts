import type { StoryWorldProject } from "../index.ts";
import type { StoryAuthorIntent } from "../intent/index.ts";
import type {
  StoryCharacterImpact,
  StoryCharacterImpactCategory,
  StoryEventImpact,
  StoryImpactAlternative,
  StoryImpactAuthorDecisionInput,
  StoryImpactReport,
  StoryRelationshipImpact,
  StoryRelationshipImpactCategory,
  StoryWorldRuleImpact
} from "./impactTypes.ts";

export function analyzeStoryImpactReport(
  project: StoryWorldProject,
  intent: StoryAuthorIntent
): StoryImpactReport {
  const affectedCharacters = analyzeCharacters(project, intent);
  const affectedEvents = analyzeEvents(project, intent);
  const affectedRelationships = analyzeRelationships(project, intent);
  const affectedRules = analyzeRulesAndLocations(project, intent);

  return cloneData({
    version: "world-os-story-impact-report-v1",
    intentId: intent.id,
    affectedCharacters,
    affectedEvents,
    affectedRelationships,
    affectedRules,
    risks: riskList({ affectedEvents, affectedRelationships, affectedRules }),
    opportunities: opportunityList(intent, affectedRules),
    alternatives: alternativeList(intent.id),
    confidence: confidenceFor(affectedCharacters, affectedEvents, affectedRelationships, affectedRules),
    reasoning: reasoningList(intent, {
      affectedCharacters,
      affectedEvents,
      affectedRules
    })
  });
}

export function buildAuthorDecisionInputFromImpactReport(
  report: StoryImpactReport
): StoryImpactAuthorDecisionInput {
  return cloneData({
    version: "world-os-impact-author-decision-input-v1",
    intentId: report.intentId,
    nextStep: "AuthorDecision",
    proposal: `Review impact report for ${report.intentId}.`,
    alternatives: report.alternatives.map((alternative) => alternative.label),
    authorChoice: {
      choice: "pending"
    },
    canCommit: false
  });
}

function analyzeCharacters(project: StoryWorldProject, intent: StoryAuthorIntent): StoryCharacterImpact[] {
  const characterIds = new Set(intent.relatedCharacters);

  return project.characters
    .filter((character) => characterIds.has(character.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((character) => {
      const category = characterImpactCategory(intent.content);
      const summary = intent.content.includes(character.name)
        ? `${character.name} gains new information from the intent.`
        : `${character.name} is tied to the discovered clue.`;

      return {
        characterId: character.id,
        category,
        summary
      };
    });
}

function analyzeEvents(project: StoryWorldProject, intent: StoryAuthorIntent): StoryEventImpact[] {
  const eventIds = new Set(intent.relatedEvents);

  return project.events
    .filter((event) => eventIds.has(event.id))
    .sort((left, right) => left.timelinePosition - right.timelinePosition || left.id.localeCompare(right.id))
    .map((event) => ({
      eventId: event.id,
      category: eventImpactCategory(intent.content),
      summary: `Existing event ${event.id} becomes a dependency for the new author intent.`,
      chapter: event.chapter
    }));
}

function analyzeRelationships(project: StoryWorldProject, intent: StoryAuthorIntent): StoryRelationshipImpact[] {
  const characterIds = new Set(intent.relatedCharacters);
  const category = relationshipCategory(intent.content);

  return project.characters
    .flatMap((character) =>
      character.relationships.map((relationship) => ({
        sourceId: character.id,
        targetId: relationship.targetId,
        category,
        summary: relationshipSummary(category, character.id, relationship.targetId)
      }))
    )
    .filter((relationship) => characterIds.has(relationship.sourceId) && characterIds.has(relationship.targetId))
    .sort(
      (left, right) =>
        left.sourceId.localeCompare(right.sourceId) ||
        left.targetId.localeCompare(right.targetId) ||
        left.category.localeCompare(right.category)
    );
}

function analyzeRulesAndLocations(project: StoryWorldProject, intent: StoryAuthorIntent): StoryWorldRuleImpact[] {
  const impacts: StoryWorldRuleImpact[] = [];
  const locationIds = new Set(intent.relatedLocations);

  for (const rule of project.rules.worldRules) {
    if (intent.content.includes(rule)) {
      impacts.push({
        rule,
        category: "rule_conflict",
        summary: `Intent mentions a protected world rule: ${rule}.`
      });
    }
  }

  for (const location of project.locations) {
    if (locationIds.has(location.id)) {
      impacts.push({
        rule: location.id,
        category: "location_impact",
        summary: `Intent affects location ${location.id}.`
      });
    }
  }

  return impacts.sort((left, right) => categoryOrder(left.category) - categoryOrder(right.category) || left.rule.localeCompare(right.rule));
}

function characterImpactCategory(content: string): StoryCharacterImpactCategory {
  if (includesAny(content, ["性格", "习惯", "价值观"])) {
    return "personality_change";
  }

  if (includesAny(content, ["失踪", "受伤", "死亡", "身份", "状态"])) {
    return "status_change";
  }

  return "knowledge_change";
}

function eventImpactCategory(content: string): StoryEventImpact["category"] {
  if (includesAny(content, ["提前", "推迟", "顺序", "时间"])) {
    return "timeline_effect";
  }

  return "dependency_effect";
}

function relationshipCategory(content: string): StoryRelationshipImpactCategory {
  if (includesAny(content, ["怀疑", "隐瞒", "冲突", "背叛"])) {
    return "conflict";
  }

  if (includesAny(content, ["联盟", "合作", "共同"])) {
    return "alliance";
  }

  return "trust";
}

function relationshipSummary(
  category: StoryRelationshipImpactCategory,
  sourceId: string,
  targetId: string
): string {
  if (category === "conflict") {
    return `Suspicion language can increase conflict between ${sourceId} and ${targetId}.`;
  }

  if (category === "alliance") {
    return `Cooperation language can increase alliance between ${sourceId} and ${targetId}.`;
  }

  return `Shared clue language can change trust between ${sourceId} and ${targetId}.`;
}

function riskList(input: {
  affectedEvents: StoryEventImpact[];
  affectedRelationships: StoryRelationshipImpact[];
  affectedRules: StoryWorldRuleImpact[];
}): string[] {
  const risks: string[] = [];

  if (input.affectedRelationships.some((relationship) => relationship.category === "conflict")) {
    risks.push("Relationship conflict may reveal motivation too early.");
  }

  if (input.affectedEvents.length > 0) {
    risks.push("The intent changes existing event dependencies.");
  }

  if (input.affectedRules.length > 0) {
    risks.push("The intent touches a protected story rule or location.");
  }

  return risks;
}

function opportunityList(intent: StoryAuthorIntent, affectedRules: StoryWorldRuleImpact[]): string[] {
  const opportunities: string[] = [];

  if (isDiscovery(intent.content)) {
    opportunities.push("Use the discovery to pay off an existing open loop.");
  }

  if (affectedRules.some((impact) => impact.category === "location_impact")) {
    opportunities.push("Turn the location into a stronger scene anchor.");
  }

  opportunities.push("Let the author choose between reveal, clue, or delay.");

  return opportunities;
}

function alternativeList(intentId: string): StoryImpactAlternative[] {
  return [
    {
      id: `alternative-${intentId}-a`,
      label: "immediate reveal",
      summary: "Let the discovery become explicit in the current chapter.",
      effect: "Higher clarity, higher risk of collapsing suspense.",
      canModifyWorld: false
    },
    {
      id: `alternative-${intentId}-b`,
      label: "partial clue",
      summary: "Show a clue without confirming the full secret.",
      effect: "Preserves open loops while rewarding the author intent.",
      canModifyWorld: false
    },
    {
      id: `alternative-${intentId}-c`,
      label: "delayed reveal",
      summary: "Move the discovery pressure to a later chapter.",
      effect: "Maintains pacing and keeps current world state stable.",
      canModifyWorld: false
    }
  ];
}

function confidenceFor(
  affectedCharacters: StoryCharacterImpact[],
  affectedEvents: StoryEventImpact[],
  affectedRelationships: StoryRelationshipImpact[],
  affectedRules: StoryWorldRuleImpact[]
): number {
  const evidenceCount =
    affectedCharacters.length + affectedEvents.length + affectedRelationships.length + affectedRules.length;
  return Math.min(0.84, 0.72 + evidenceCount * 0.02);
}

function reasoningList(
  intent: StoryAuthorIntent,
  input: {
    affectedCharacters: StoryCharacterImpact[];
    affectedEvents: StoryEventImpact[];
    affectedRules: StoryWorldRuleImpact[];
  }
): string[] {
  const reasoning = [
    `Intent source ${intent.source} is analyzed as suggestion data only.`,
    `Matched ${input.affectedCharacters.length} character references.`,
    `Matched ${input.affectedEvents.length} event references.`,
    `Matched ${input.affectedRules.filter((impact) => impact.category === "location_impact").length} location references.`
  ];

  if (isDiscovery(intent.content)) {
    reasoning.push("Detected discovery language, so knowledge impact is primary.");
  }

  return reasoning;
}

function isDiscovery(content: string): boolean {
  return includesAny(content, ["发现", "秘密", "线索"]);
}

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function categoryOrder(category: StoryWorldRuleImpact["category"]): number {
  return category === "rule_conflict" ? 0 : 1;
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
