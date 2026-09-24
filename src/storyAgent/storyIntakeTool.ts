import type { AgentRuntimeTool } from "./agentRuntimePlugin.ts";
import { buildStoryIntakeEnvelope, type StoryIntakeBaseVersion, type StoryIntakeEnvelope, type StoryIntakeSourceRef } from "../storyContracts/storyIntakeEnvelope.ts";

export const STORY_INTAKE_TOOL_NAME = "propose_story_intake" as const;

export function assertStoryIntakeProviderTurn(providerCall: number, hasEnvelope: boolean): void {
  if (!hasEnvelope && providerCall > 2) {
    throw Object.assign(new Error("候选结构或原文引用连续两次未通过校验；已停止调用，原话已保留。"), { code: "tool-failed", retryable: false });
  }
}

export function createStoryIntakeProposalTool(input: {
  projectId: string;
  sessionId: string;
  runId: string;
  sourceRef: StoryIntakeSourceRef;
  sourceText: string;
  baseVersion: StoryIntakeBaseVersion;
  requestedProviderId?: string | null;
  requestedModelId?: string | null;
  responseModelId?: string | null;
  existingEntities?: Array<{ objectId: string; objectType: "character" | "item" | "location"; title: string; revisionToken: string }>;
  now?: () => string;
  onEnvelope(envelope: StoryIntakeEnvelope): void;
}): AgentRuntimeTool {
  const now = input.now ?? (() => new Date().toISOString());
  let executions = 0;
  return {
    name: STORY_INTAKE_TOOL_NAME,
    label: "提出结构化故事候选",
    description: "把本次已保存的作者原话整理为带精确证据的候选包。只返回 Candidate，不创建或修改 Agent、Event、Relation、StoryUnit、NarrativePlacement、WorkVersion 或 Canon。",
    inputSchema: storyIntakeToolSchema(input.existingEntities),
    async execute(call) {
      executions += 1;
      if (executions > 2) throw new Error("Story Intake 结构修复机会已用尽。");
      const envelope = buildStoryIntakeEnvelope({
        projectId: input.projectId,
        sessionId: input.sessionId,
        runId: input.runId,
        sourceRef: input.sourceRef,
        sourceText: input.sourceText,
        baseVersion: input.baseVersion,
        toolArguments: call.arguments,
        providerCalls: 1,
        requestedProviderId: input.requestedProviderId,
        requestedModelId: input.requestedModelId,
        responseModelId: input.responseModelId,
        existingEntities: input.existingEntities,
        createdAt: now()
      });
      input.onEnvelope(envelope);
      return { envelopeId: envelope.envelopeId, candidateCount: envelope.candidates.length, formalStoryWrites: 0, status: "candidate-only" };
    }
  };
}

/** Native schema narrows the same type-dependent fields checked by the domain.
 * Cross-candidate links and exact source evidence remain domain validations. */
export function storyIntakeToolSchema(existingEntities: Array<{ objectId: string }> = []) {
  const base = {
      type: "object" as const,
      required: ["candidates"],
      additionalProperties: false,
      properties: {
        candidates: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            required: ["localRef", "type", "proposedName", "proposedTitle", "summary", "sourceSpan", "confidence", "uncertainties", "existingEntityId", "identityDecision", "proposedRelations", "warnings", "narrativePath"],
            additionalProperties: false,
            properties: {
              localRef: { type: "string", maxLength: 80, pattern: "^[a-zA-Z0-9]+(?:[._:-][a-zA-Z0-9]+)*$" },
              type: { type: "string", enum: ["character", "item", "location", "event", "relation", "story_unit", "narrative_path_membership", "unresolved"] },
              proposedName: { type: ["string", "null"], maxLength: 160, description: "character/item/location 必须填写名称；其余类型必须为 null。" },
              proposedTitle: { type: ["string", "null"], maxLength: 200, description: "character/item/location 必须为 null；其余类型必须填写标题。" },
              summary: { type: "string", maxLength: 800 },
              sourceSpan: { type: "object", required: ["excerpt"], additionalProperties: false, properties: { excerpt: { type: "string", maxLength: 1_200 } } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              uncertainties: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", maxLength: 320 } },
              existingEntityId: { type: ["string", "null"], enum: [null, ...existingEntities.map((entity) => entity.objectId)], maxLength: 180 },
              identityDecision: { type: "string", enum: ["link_existing", "propose_new", "ambiguous"] },
              proposedRelations: { type: "array", maxItems: 24, items: { type: "object", required: ["relation", "targetLocalRef", "label"], additionalProperties: false, properties: { relation: { type: "string", enum: ["precedes", "involves", "occurs-at", "belongs-to-story-unit", "member-of-narrative-path", "related-to"] }, targetLocalRef: { type: "string", maxLength: 80, pattern: "^[a-zA-Z0-9]+(?:[._:-][a-zA-Z0-9]+)*$", description: "必须引用本次 candidates 中另一项的 localRef，不能直接填已有对象 ID。" }, label: { type: ["string", "null"], maxLength: 160 } } } },
              warnings: { type: "array", maxItems: 8, items: { type: "string", maxLength: 320 } },
              narrativePath: { description: "仅 narrative_path_membership 填对象；其他所有类型必须为 null。", anyOf: [{ type: "null" }, { type: "object", required: ["kind", "label"], additionalProperties: false, properties: { kind: { type: "string", enum: ["main", "side", "hidden", "character", "item", "location", "custom"] }, label: { type: "string", maxLength: 120 } } }] }
            }
          }
        }
      }
    };
  const candidate = base.properties.candidates.items;
  const branch = (types: string[], entity: boolean, path: boolean) => ({
    ...candidate,
    properties: {
      ...candidate.properties,
      type: { type: "string", enum: types },
      proposedName: entity ? { type: "string", minLength: 1, maxLength: 160 } : { type: "null" },
      proposedTitle: entity ? { type: "null" } : { type: "string", minLength: 1, maxLength: 200 },
      narrativePath: path ? candidate.properties.narrativePath.anyOf[1] : { type: "null" },
      ...(entity ? {} : { existingEntityId: { type: "null" }, identityDecision: { type: "string", enum: ["propose_new"] } })
    }
  });
  return { ...base, properties: { candidates: { ...base.properties.candidates, items: { anyOf: [
    branch(["character", "item", "location"], true, false),
    branch(["event", "relation", "story_unit", "unresolved"], false, false),
    branch(["narrative_path_membership"], false, true)
  ] } } } };
}
