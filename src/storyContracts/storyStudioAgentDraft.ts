import {
  normalizeStoryStudioObjectProfile,
  type StoryStudioObjectProfile,
  type StoryStudioObjectProfileObjectType
} from "./storyStudioObjectProfile.ts";

export const STORY_STUDIO_AGENT_DRAFT_VERSION = "story-studio-agent-draft/v1" as const;
export const STORY_STUDIO_AGENT_DRAFT_MODES = ["draft", "extract"] as const;

export type StoryStudioAgentDraftMode = typeof STORY_STUDIO_AGENT_DRAFT_MODES[number];
export type StoryStudioAgentDraftRequest = {
  operationId: string;
  projectId: string;
  requestedObjectType: Extract<StoryStudioObjectProfileObjectType, "character" | "item" | "location">;
  mode: StoryStudioAgentDraftMode;
  authorIntent: string;
  sourceScope: string;
  sourceText: string;
  existingObjectSummaries: Array<{ id: string; title: string; type: string; aliases: string[] }>;
  allowedFieldSchema: string[];
  noWritePolicy: true;
};

export type StoryStudioAgentDraftOutput = {
  version: typeof STORY_STUDIO_AGENT_DRAFT_VERSION;
  operationId: string;
  requestedObjectType: StoryStudioAgentDraftRequest["requestedObjectType"];
  suggestedName: string;
  proposedProfile: StoryStudioObjectProfile;
  proposedAliases: string[];
  proposedRelations: Array<{
    relationLabel: string;
    sourceObjectId: string | null;
    targetObjectId: string | null;
    validFrom: string | null;
    validTo: string | null;
    sourceAnchors: string[];
  }>;
  proposedCustomTypes: string[];
  evidenceAnchors: string[];
  confidence: "high" | "medium" | "low" | "unknown";
  warnings: string[];
  unresolvedQuestions: string[];
};

export function validateStoryStudioAgentDraftOutput(value: unknown): StoryStudioAgentDraftOutput {
  if (!isRecord(value)) throw new Error("Agent draft output must be an object.");
  const requestedObjectType = value.requestedObjectType;
  if (requestedObjectType !== "character" && requestedObjectType !== "item" && requestedObjectType !== "location") throw new Error("Agent draft object type is invalid.");
  const proposedProfile = normalizeStoryStudioObjectProfile(value.proposedProfile);
  if (proposedProfile.objectType !== requestedObjectType) throw new Error("Agent draft profile type does not match its request.");
  return {
    version: value.version === STORY_STUDIO_AGENT_DRAFT_VERSION ? STORY_STUDIO_AGENT_DRAFT_VERSION : (() => { throw new Error("Unsupported Agent draft version."); })(),
    operationId: boundedText(value.operationId, "Agent draft operation", 180),
    requestedObjectType,
    suggestedName: boundedText(value.suggestedName, "Agent draft suggested name", 120),
    proposedProfile,
    proposedAliases: boundedList(value.proposedAliases, "Agent draft aliases", 32, 120),
    proposedRelations: normalizeRelations(value.proposedRelations),
    proposedCustomTypes: boundedList(value.proposedCustomTypes, "Agent draft custom types", 32, 120),
    evidenceAnchors: boundedList(value.evidenceAnchors, "Agent draft evidence anchors", 32, 240),
    confidence: normalizeConfidence(value.confidence),
    warnings: boundedList(value.warnings, "Agent draft warnings", 32, 500),
    unresolvedQuestions: boundedList(value.unresolvedQuestions, "Agent draft unresolved questions", 32, 500)
  };
}

/** Deterministic disposable fixture used by tests and the isolated founder smoke only. */
export function createDeterministicStoryStudioAgentDraft(input: StoryStudioAgentDraftRequest): StoryStudioAgentDraftOutput {
  const operationId = boundedText(input.operationId, "Agent draft operation", 180);
  const objectType = input.requestedObjectType;
  const intent = boundedText(input.authorIntent, "Agent draft author intent", 2_000);
  const sourceText = input.sourceText.trim();
  const title = firstMeaningfulLine(intent) || firstMeaningfulLine(sourceText) || (objectType === "character" ? "未命名角色" : objectType === "item" ? "未命名物品" : "未命名地点");
  const excerpt = firstMeaningfulLine(sourceText) || intent;
  const fieldsByType: Record<typeof objectType, Record<string, { label: string; value: string }>> = {
    character: {
      "story-role": { label: "故事定位", value: "待作者确认" },
      summary: { label: "一句话简介", value: excerpt },
      life: { label: "生平", value: "尚未从当前范围确认" }
    },
    item: {
      category: { label: "类别", value: "待作者确认" },
      purpose: { label: "故事定位 / 用途", value: excerpt },
      description: { label: "介绍", value: "尚未从当前范围确认" }
    },
    location: {
      "location-type": { label: "地点类型", value: "待作者确认" },
      description: { label: "简介", value: excerpt },
      atmosphere: { label: "氛围", value: "尚未从当前范围确认" }
    }
  };
  const sourceAnchor = input.sourceScope.startsWith("fixture:") ? input.sourceScope : `fixture:${input.sourceScope}`;
  const fields = Object.fromEntries(Object.entries(fieldsByType[objectType]).map(([key, field]) => [key, {
    ...field,
    source: sourceText ? "source-anchor" : "agent",
    confidence: sourceText ? "medium" : "low",
    sourceAnchors: sourceText ? [sourceAnchor] : []
  }]));
  return validateStoryStudioAgentDraftOutput({
    version: STORY_STUDIO_AGENT_DRAFT_VERSION,
    operationId,
    requestedObjectType: objectType,
    suggestedName: title,
    proposedProfile: {
      version: "story-studio-object-profile/v1",
      objectType,
      fields,
      unresolvedQuestions: ["请作者确认名称、关键设定和当前范围之外的未知信息。"],
      warnings: sourceText ? [] : ["本次起草没有来源正文，字段仅是候选建议。"],
      authorConfirmed: false
    },
    proposedAliases: [],
    proposedRelations: [],
    proposedCustomTypes: [],
    // The author scope is still an auditable source anchor when the draft is
    // based on intent only; the profile fields remain low-confidence agent
    // suggestions until the author confirms them.
    evidenceAnchors: [sourceAnchor],
    confidence: sourceText ? "medium" : "low",
    warnings: ["这是确定性隔离 fixture，不代表真实 Provider 已连接。"],
    unresolvedQuestions: ["是否存在同名或别名对象，需要作者检查重复建议。"]
  });
}

function normalizeRelations(value: unknown): StoryStudioAgentDraftOutput["proposedRelations"] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error("Agent draft relations are invalid.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Agent draft relation is invalid.");
    return {
      relationLabel: boundedText(item.relationLabel, "Agent draft relation label", 120),
      sourceObjectId: optionalText(item.sourceObjectId, 180),
      targetObjectId: optionalText(item.targetObjectId, 180),
      validFrom: optionalText(item.validFrom, 80),
      validTo: optionalText(item.validTo, 80),
      sourceAnchors: boundedList(item.sourceAnchors, "Agent draft relation source anchors", 32, 240)
    };
  });
}

function normalizeConfidence(value: unknown): StoryStudioAgentDraftOutput["confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : "unknown";
}

function firstMeaningfulLine(value: string): string {
  return value.split(/\r?\n/u).map((line) => line.replace(/^[-*#\s]+/u, "").trim()).find(Boolean)?.slice(0, 120) || "";
}

function boundedList(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} is invalid.`);
  return [...new Set(value.map((item) => boundedText(item, label, maximumLength)))];
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (value == null || value === "") return null;
  return boundedText(value, "Agent draft reference", maximumLength);
}

function boundedText(value: unknown, label: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = value.normalize("NFC").trim();
  if (!text || [...text].length > maximumLength || /[\u0000-\u001f]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
