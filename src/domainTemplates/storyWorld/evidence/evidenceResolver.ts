import type {
  StoryCharacterImpact,
  StoryEventImpact,
  StoryImpactReport,
  StoryRelationshipImpact,
  StoryWorldRuleImpact
} from "../analysis/index.ts";
import type {
  StoryWorldCharacter,
  StoryWorldEvent,
  StoryWorldKeyframe,
  StoryWorldLocation,
  StoryWorldOpenLoop,
  StoryWorldProject
} from "../index.ts";
import type { StoryEvidenceBundle, StoryEvidenceItem, StoryEvidenceSourceRef } from "./evidenceTypes.ts";

export function resolveStoryEvidenceBundle(
  project: StoryWorldProject,
  report: StoryImpactReport
): StoryEvidenceBundle {
  const characterEvidence = report.affectedCharacters.map((impact) => characterEvidenceFor(project, impact));
  const eventEvidence = report.affectedEvents.map((impact) => eventEvidenceFor(project, impact));
  const relationshipEvidence = report.affectedRelationships.map((impact) => relationshipEvidenceFor(project, impact));
  const worldRuleEvidence = report.affectedRules
    .map((impact) => worldRuleEvidenceFor(project, impact))
    .sort(byFirstSourcePath);
  const historyEvidence = historyEvidenceFor(project, report.affectedEvents);
  const explainedImpactRefs = new Set([
    ...characterEvidence,
    ...eventEvidence,
    ...relationshipEvidence,
    ...worldRuleEvidence
  ].map((item) => item.impactRef));
  const allImpactRefs = impactRefsFromReport(report);
  const unexplainedImpactRefs = allImpactRefs.filter((impactRef) => !explainedImpactRefs.has(impactRef));

  return cloneData({
    version: "world-os-story-evidence-bundle-v1",
    intentId: report.intentId,
    characterEvidence,
    eventEvidence,
    relationshipEvidence,
    worldRuleEvidence,
    historyEvidence,
    coverage: {
      totalImpacts: allImpactRefs.length,
      explainedImpacts: allImpactRefs.length - unexplainedImpactRefs.length,
      unexplainedImpactRefs
    },
    deterministic: true,
    canModifyWorld: false
  });
}

function characterEvidenceFor(project: StoryWorldProject, impact: StoryCharacterImpact): StoryEvidenceItem {
  const character = findCharacter(project, impact.characterId);
  const source = characterSource(character);

  return {
    evidenceId: `evidence-${impactRefForCharacter(impact)}`,
    impactRef: impactRefForCharacter(impact),
    summary: `${character.name} explains the character impact.`,
    explanation: `${character.name} is ${character.role} with status ${character.status}; this makes the impact traceable to an existing character state.`,
    sources: [source]
  };
}

function eventEvidenceFor(project: StoryWorldProject, impact: StoryEventImpact): StoryEvidenceItem {
  const event = findEvent(project, impact.eventId);
  const eventSource = eventSourceFor(event);
  const chapterSource: StoryEvidenceSourceRef = {
    sourceType: "chapter",
    sourceId: impact.chapter,
    sourcePath: `chapters.${impact.chapter}`,
    label: impact.chapter,
    excerpt: `Referenced by existing event ${event.id}.`
  };

  return {
    evidenceId: `evidence-${impactRefForEvent(impact)}`,
    impactRef: impactRefForEvent(impact),
    summary: `${event.id} explains the event dependency.`,
    explanation: `The existing event in ${impact.chapter} already contains consequences, so the new intent depends on prior story history.`,
    sources: [eventSource, chapterSource]
  };
}

function relationshipEvidenceFor(project: StoryWorldProject, impact: StoryRelationshipImpact): StoryEvidenceItem {
  const sourceCharacter = findCharacter(project, impact.sourceId);
  const targetCharacter = findCharacter(project, impact.targetId);
  const relationship = sourceCharacter.relationships.find((candidate) => candidate.targetId === impact.targetId);
  const relationshipSource: StoryEvidenceSourceRef = {
    sourceType: "relationship",
    sourceId: `${impact.sourceId}->${impact.targetId}`,
    sourcePath: `relationships.${impact.sourceId}->${impact.targetId}`,
    label: `${sourceCharacter.name} -> ${targetCharacter.name}`,
    excerpt: relationship === undefined ? "No stored relationship detail." : `${relationship.type}; ${relationship.status}`
  };

  return {
    evidenceId: `evidence-${impactRefForRelationship(impact)}`,
    impactRef: impactRefForRelationship(impact),
    summary: `${sourceCharacter.name} and ${targetCharacter.name} explain the relationship impact.`,
    explanation: `The relationship record already connects ${sourceCharacter.name} and ${targetCharacter.name}, so trust or conflict changes have a visible source.`,
    sources: [relationshipSource]
  };
}

function worldRuleEvidenceFor(project: StoryWorldProject, impact: StoryWorldRuleImpact): StoryEvidenceItem {
  if (impact.category === "location_impact") {
    const location = findLocation(project, impact.rule);
    const source: StoryEvidenceSourceRef = {
      sourceType: "location",
      sourceId: location.id,
      sourcePath: `locations.${location.id}`,
      label: location.name,
      excerpt: location.description
    };

    return {
      evidenceId: `evidence-${impactRefForWorldRule(impact)}`,
      impactRef: impactRefForWorldRule(impact),
      summary: `${location.name} explains the location impact.`,
      explanation: `The intent touches ${location.name}, which is an existing place with explicit connections.`,
      sources: [source]
    };
  }

  const source: StoryEvidenceSourceRef = {
    sourceType: "world_rule",
    sourceId: impact.rule,
    sourcePath: `rules.worldRules.${impact.rule}`,
    label: impact.rule,
    excerpt: impact.rule
  };

  return {
    evidenceId: `evidence-${impactRefForWorldRule(impact)}`,
    impactRef: impactRefForWorldRule(impact),
    summary: `${impact.rule} explains the rule impact.`,
    explanation: `The impact is grounded in a protected world rule, so it cannot be treated as a free-form change.`,
    sources: [source]
  };
}

function historyEvidenceFor(project: StoryWorldProject, affectedEvents: StoryEventImpact[]): StoryEvidenceItem[] {
  const latestAffectedEvent = affectedEvents
    .map((impact) => findEvent(project, impact.eventId))
    .sort((left, right) => right.timelinePosition - left.timelinePosition || left.id.localeCompare(right.id))[0];

  const items: StoryEvidenceItem[] = [];

  if (latestAffectedEvent !== undefined) {
    items.push({
      evidenceId: `evidence-history-${latestAffectedEvent.id}`,
      impactRef: `history:${latestAffectedEvent.id}`,
      summary: `${latestAffectedEvent.id} anchors the current history.`,
      explanation: `The affected event already exists in the timeline, so the prediction has a prior story anchor.`,
      sources: [eventSourceFor(latestAffectedEvent)]
    });

    const keyframe = nearestKeyframe(project.keyframes, latestAffectedEvent.timelinePosition);
    if (keyframe !== undefined) {
      items.push({
        evidenceId: `evidence-history-${keyframe.id}`,
        impactRef: `history:${keyframe.id}`,
        summary: `${keyframe.id} anchors the author-approved state.`,
        explanation: `The keyframe records the author-approved state around this point in the story.`,
        sources: [keyframeSource(keyframe)]
      });
    }
  }

  const openLoop = [...project.openLoops].sort((left, right) => left.id.localeCompare(right.id))[0];
  if (openLoop !== undefined) {
    items.push({
      evidenceId: `evidence-history-${openLoop.id}`,
      impactRef: `history:${openLoop.id}`,
      summary: `${openLoop.id} keeps the unresolved story question visible.`,
      explanation: `The unresolved thread explains why a reveal can affect suspense or pacing.`,
      sources: [openLoopSource(openLoop)]
    });
  }

  return items;
}

function impactRefsFromReport(report: StoryImpactReport): string[] {
  return [
    ...report.affectedCharacters.map(impactRefForCharacter),
    ...report.affectedEvents.map(impactRefForEvent),
    ...report.affectedRelationships.map(impactRefForRelationship),
    ...report.affectedRules.map(impactRefForWorldRule)
  ].sort();
}

function impactRefForCharacter(impact: StoryCharacterImpact): string {
  return `character:${impact.characterId}:${impact.category}`;
}

function impactRefForEvent(impact: StoryEventImpact): string {
  return `event:${impact.eventId}:${impact.category}`;
}

function impactRefForRelationship(impact: StoryRelationshipImpact): string {
  return `relationship:${impact.sourceId}->${impact.targetId}:${impact.category}`;
}

function impactRefForWorldRule(impact: StoryWorldRuleImpact): string {
  return `world_rule:${impact.rule}:${impact.category}`;
}

function characterSource(character: StoryWorldCharacter): StoryEvidenceSourceRef {
  return {
    sourceType: "character",
    sourceId: character.id,
    sourcePath: `characters.${character.id}`,
    label: character.name,
    excerpt: `${character.role}; ${character.status}; ${character.traits.join(", ")}`
  };
}

function eventSourceFor(event: StoryWorldEvent): StoryEvidenceSourceRef {
  return {
    sourceType: "event",
    sourceId: event.id,
    sourcePath: `events.${event.id}`,
    label: event.id,
    excerpt: event.consequences.join("; ")
  };
}

function keyframeSource(keyframe: StoryWorldKeyframe): StoryEvidenceSourceRef {
  return {
    sourceType: "keyframe",
    sourceId: keyframe.id,
    sourcePath: `keyframes.${keyframe.id}`,
    label: keyframe.majorMoment,
    excerpt: keyframe.authorDecision
  };
}

function openLoopSource(openLoop: StoryWorldOpenLoop): StoryEvidenceSourceRef {
  return {
    sourceType: "open_loop",
    sourceId: openLoop.id,
    sourcePath: `openLoops.${openLoop.id}`,
    label: openLoop.unresolvedConflict,
    excerpt: openLoop.pendingThread
  };
}

function nearestKeyframe(keyframes: StoryWorldKeyframe[], timelinePosition: number): StoryWorldKeyframe | undefined {
  return [...keyframes]
    .filter((keyframe) => keyframe.timelinePosition <= timelinePosition)
    .sort((left, right) => right.timelinePosition - left.timelinePosition || left.id.localeCompare(right.id))[0];
}

function findCharacter(project: StoryWorldProject, id: string): StoryWorldCharacter {
  const character = project.characters.find((candidate) => candidate.id === id);

  if (character === undefined) {
    throw new Error(`Missing character evidence source: ${id}`);
  }

  return character;
}

function findEvent(project: StoryWorldProject, id: string): StoryWorldEvent {
  const event = project.events.find((candidate) => candidate.id === id);

  if (event === undefined) {
    throw new Error(`Missing event evidence source: ${id}`);
  }

  return event;
}

function findLocation(project: StoryWorldProject, id: string): StoryWorldLocation {
  const location = project.locations.find((candidate) => candidate.id === id);

  if (location === undefined) {
    throw new Error(`Missing location evidence source: ${id}`);
  }

  return location;
}

function byFirstSourcePath(left: StoryEvidenceItem, right: StoryEvidenceItem): number {
  return left.sources[0].sourcePath.localeCompare(right.sources[0].sourcePath);
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
