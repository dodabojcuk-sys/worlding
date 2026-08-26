import type { StoryWorldProject } from "../index.ts";
import {
  createAuthorIntent as createWorkflowAuthorIntent,
  type StoryAuthorIntent as WorkflowAuthorIntent,
  type StoryProposedChange
} from "../workflow/index.ts";

export type StoryIntentSource = "author" | "ai" | "import";
export type StoryIntentTargetScope = "character" | "event" | "relationship" | "world_rule" | "new_scene";
export type StoryIntentType =
  | "character_change"
  | "event_change"
  | "relationship_change"
  | "world_rule_change"
  | "new_scene";
export type StoryIntentHistoryStatus = "pending" | "accepted" | "modified" | "rejected";

export type StoryAuthorIntent = {
  id: string;
  content: string;
  source: StoryIntentSource;
  targetScope: StoryIntentTargetScope;
  createdAtLogical: number;
  relatedCharacters: string[];
  relatedEvents: string[];
  relatedLocations: string[];
};

export type StoryIntentClassification = {
  version: "world-os-story-intent-classification-v1";
  intentId: string;
  primaryType: StoryIntentType;
  intentTypes: StoryIntentType[];
  priority: number;
  reasons: string[];
};

export type IntentAffectedObjects = {
  characters: string[];
  events: string[];
  locations: string[];
  rules: string[];
};

export type IntentImpactRequest = {
  version: "world-os-intent-impact-request-v1";
  intent: StoryAuthorIntent;
  affectedObjects: IntentAffectedObjects;
  analysisNeeded: StoryIntentType[];
  workflowTarget: {
    chapterId: string;
  };
};

export type IntentHistoryEntry = {
  intent: StoryAuthorIntent;
  status: StoryIntentHistoryStatus;
  sourcePriority: number;
};

export type IntentHistory = {
  version: "world-os-story-intent-history-v1";
  projectId: string;
  entries: IntentHistoryEntry[];
};

export type WorkflowIntentBuildOptions = {
  authorConfirmed?: boolean;
  authorNote?: string;
};

const priorityBySource: Record<StoryIntentSource, number> = {
  author: 100,
  import: 50,
  ai: 10
};

const typeOrder: StoryIntentType[] = [
  "world_rule_change",
  "relationship_change",
  "character_change",
  "event_change",
  "new_scene"
];

export function createStoryAuthorIntent(input: StoryAuthorIntent): StoryAuthorIntent {
  return cloneData({
    id: input.id,
    content: input.content,
    source: input.source,
    targetScope: input.targetScope,
    createdAtLogical: input.createdAtLogical,
    relatedCharacters: sorted(input.relatedCharacters),
    relatedEvents: sorted(input.relatedEvents),
    relatedLocations: sorted(input.relatedLocations)
  });
}

export function classifyStoryIntent(intent: StoryAuthorIntent): StoryIntentClassification {
  const types = new Set<StoryIntentType>();
  const reasons: string[] = [];
  const targetType = targetScopeType(intent.targetScope);

  types.add(targetType);
  reasons.push(`targetScope maps to ${targetType}`);

  for (const detectedType of keywordTypes(intent)) {
    types.add(detectedType);
  }

  if (intent.relatedCharacters.length > 0) {
    types.add("character_change");
  }

  if (intent.relatedEvents.length > 0) {
    types.add("event_change");
  }

  if (intent.relatedLocations.length > 0) {
    types.add("new_scene");
  }

  if (intent.source === "author") {
    reasons.push("author source has highest priority");
  } else if (intent.source === "ai") {
    reasons.push("AI source requires author confirmation");
  } else {
    reasons.push("import source requires author confirmation");
  }

  const intentTypes = [...types].sort((left, right) => typeOrder.indexOf(left) - typeOrder.indexOf(right));

  return cloneData({
    version: "world-os-story-intent-classification-v1",
    intentId: intent.id,
    primaryType: intentTypes[0],
    intentTypes,
    priority: priorityBySource[intent.source],
    reasons
  });
}

export function buildIntentImpactRequest(project: StoryWorldProject, intent: StoryAuthorIntent): IntentImpactRequest {
  const classification = classifyStoryIntent(intent);

  return cloneData({
    version: "world-os-intent-impact-request-v1",
    intent,
    affectedObjects: {
      characters: intersect(intent.relatedCharacters, project.characters.map((character) => character.id)),
      events: intersect(intent.relatedEvents, project.events.map((event) => event.id)),
      locations: intersect(intent.relatedLocations, project.locations.map((location) => location.id)),
      rules: affectedRules(project, intent)
    },
    analysisNeeded: classification.intentTypes,
    workflowTarget: {
      chapterId: project.currentChapter.id
    }
  });
}

export function buildWorkflowIntentFromImpactRequest(
  request: IntentImpactRequest,
  options: WorkflowIntentBuildOptions = {}
): WorkflowAuthorIntent {
  if (request.intent.source !== "author" && options.authorConfirmed !== true) {
    throw new Error("Author confirmation required before non-author input can enter Story Authoring Workflow.");
  }

  return createWorkflowAuthorIntent({
    id: request.intent.id,
    chapterId: request.workflowTarget.chapterId,
    text: request.intent.content,
    proposedChanges: proposedChangesFromRequest(request, options.authorNote)
  });
}

export function createIntentHistory(projectId: string): IntentHistory {
  return {
    version: "world-os-story-intent-history-v1",
    projectId,
    entries: []
  };
}

export function recordIntentHistory(
  history: IntentHistory,
  intent: StoryAuthorIntent,
  status: StoryIntentHistoryStatus = "pending"
): IntentHistory {
  const entries = [
    ...history.entries.map((entry) => cloneData(entry)),
    {
      intent: createStoryAuthorIntent(intent),
      status,
      sourcePriority: priorityBySource[intent.source]
    }
  ].sort(compareHistoryEntries);

  return cloneData({
    version: history.version,
    projectId: history.projectId,
    entries
  });
}

export function updateIntentHistoryStatus(
  history: IntentHistory,
  intentId: string,
  status: StoryIntentHistoryStatus
): IntentHistory {
  return cloneData({
    version: history.version,
    projectId: history.projectId,
    entries: history.entries
      .map((entry) => ({
        ...entry,
        intent: createStoryAuthorIntent(entry.intent),
        status: entry.intent.id === intentId ? status : entry.status
      }))
      .sort(compareHistoryEntries)
  });
}

function targetScopeType(targetScope: StoryIntentTargetScope): StoryIntentType {
  if (targetScope === "character") {
    return "character_change";
  }

  if (targetScope === "event") {
    return "event_change";
  }

  if (targetScope === "relationship") {
    return "relationship_change";
  }

  if (targetScope === "world_rule") {
    return "world_rule_change";
  }

  return "new_scene";
}

function keywordTypes(intent: StoryAuthorIntent): StoryIntentType[] {
  const content = intent.content;
  const detected = new Set<StoryIntentType>();

  if (includesAny(content, ["角色", "人物", "状态"])) {
    detected.add("character_change");
  }

  if (includesAny(content, ["事件", "发生", "发现", "确认"])) {
    detected.add("event_change");
  }

  if (includesAny(content, ["关系", "信任", "怀疑", "背叛"])) {
    detected.add("relationship_change");
  }

  if (includesAny(content, ["规则", "限制", "不得", "必须", "潮门"])) {
    detected.add("world_rule_change");
  }

  if (includesAny(content, ["场景", "地点", "来到", "进入", "码头", "灯塔", "雾港"])) {
    detected.add("new_scene");
  }

  return [...detected].sort((left, right) => typeOrder.indexOf(left) - typeOrder.indexOf(right));
}

function affectedRules(project: StoryWorldProject, intent: StoryAuthorIntent): string[] {
  if (!classifyStoryIntent(intent).intentTypes.includes("world_rule_change")) {
    return [];
  }

  return project.rules.worldRules.filter((rule) => intent.content.includes(rule) || ruleIncludesKeyword(rule, intent.content));
}

function ruleIncludesKeyword(rule: string, content: string): boolean {
  return rule
    .split("")
    .filter((character) => character.trim() !== "")
    .some((character) => content.includes(character) && character !== "的");
}

function proposedChangesFromRequest(
  request: IntentImpactRequest,
  authorNote: string | undefined
): StoryProposedChange[] {
  const changes: StoryProposedChange[] = [];
  const summary = authorNote === undefined ? request.intent.content : `${request.intent.content} (${authorNote})`;

  for (const characterId of request.affectedObjects.characters) {
    changes.push({
      type: "character",
      targetId: characterId,
      summary
    });
  }

  for (const eventId of request.affectedObjects.events) {
    changes.push({
      type: "time",
      targetId: eventId,
      summary
    });
  }

  for (const rule of request.affectedObjects.rules) {
    changes.push({
      type: "rule",
      targetId: rule,
      summary
    });
  }

  if (request.analysisNeeded.includes("relationship_change") && request.affectedObjects.characters.length > 0) {
    changes.push({
      type: "relationship",
      targetId: request.affectedObjects.characters[0],
      summary
    });
  }

  if (changes.length > 0) {
    return changes;
  }

  return [
    {
      type: "time",
      targetId: request.workflowTarget.chapterId,
      summary
    }
  ];
}

function compareHistoryEntries(left: IntentHistoryEntry, right: IntentHistoryEntry): number {
  return (
    right.sourcePriority - left.sourcePriority ||
    left.intent.createdAtLogical - right.intent.createdAtLogical ||
    left.intent.id.localeCompare(right.intent.id)
  );
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return sorted(left.filter((value) => rightSet.has(value)));
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
