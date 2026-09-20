import { createHash } from "node:crypto";

import { normalizeNuwaN1Action, validateNuwaN1ActorResult } from "../../../src/storyIntelligence/nuwaN1Runtime.ts";
import { buildNuwaN1ActorPrompt, parseNuwaN1ActorResult } from "./nuwaN1PiAdapter.mjs";

export const SINGLE_CHARACTER_ACTION_CANDIDATE_VERSION = "tianyan-single-character-action-candidate/r0";
const ALLOWED_ACTIONS = Object.freeze(["speak", "observe", "ask"]);
const ZERO_WRITES = Object.freeze({ canon: 0, event: 0, world: 0, relation: 0, character: 0, storyUnit: 0, nuwaRun: 0 });

/**
 * One bounded Provider completion over the existing Character safe projection.
 * This is deliberately not a Nuwa Run: it creates no RunPack, tool receipt,
 * Candidate owner, pending review, or story write. The caller owns the only
 * in-memory copy and may discard it.
 */
export function createSingleCharacterActionCandidatePort(dependencies) {
  const { readActor, readScene, prepareContext, resolveProvider, providerGateway, receiptStore = null } = dependencies ?? {};
  if (![readActor, readScene, prepareContext, resolveProvider].every((value) => typeof value === "function") || typeof providerGateway?.openChatCompletion !== "function") {
    throw new TypeError("Single Character action candidate port requires existing read, context, and Provider Gateway dependencies.");
  }

  return Object.freeze({
    async generate(rawInput) {
      const input = normalizeInput(rawInput);
      const before = readSnapshot(input, { readActor, readScene, prepareContext });
      const provider = normalizeProvider(resolveProvider(input));
      if (!provider.configured) throw candidateError("PROVIDER_NOT_CONFIGURED", "Provider 未配置，未发送请求。", 503);

      const context = structuredClone(before.preparation.providerSafeContext);
      const prompt = buildNuwaN1ActorPrompt({ ...context, actor: structuredClone(context.actor), scene: structuredClone(context.scene), step: 0 }, [input.actorId], { contextAlreadyProvided: true });
      const requestKey = `single-character-action.${input.projectId}.${input.operationId}`;
      const projectionId = `single-character-action-projection.${digest(`${requestKey}:${input.contextDigest}`).slice(0, 24)}`;
      let response;
      try {
        response = await providerGateway.openChatCompletion({
          profileId: provider.profileId,
          messages: [
            { role: "system", content: "你是女娲 N1 的受控单角色行动适配器。只能使用用户消息中的安全角色投影；不得访问文件、Shell、隐藏角色信息、凭据或其他作品；不得写入 Canon、World、Event、Relation、人物档案或记忆。只输出严格 JSON。" },
            { role: "user", content: JSON.stringify({ instruction: prompt, context }) }
          ],
          responseFormat: "json-object",
          maxOutputTokens: 512,
          retry: false,
          idempotencyKey: requestKey,
          budgetScope: `single-character-action:${input.projectId}`,
          receiptEnvelopeContext: {
            projectId: input.projectId,
            projectVersion: input.projectionRevision || input.sceneRevision,
            sessionId: input.operationId,
            archiveRecordId: input.sceneId,
            sourceAnchorIds: unique([input.actorId, input.sceneId, ...(context.stateProjection?.sourceAnchors ?? [])]),
            sourceRevision: input.contextDigest,
            operationId: requestKey,
            providerProfileRevision: provider.profileRevision
          }
        });
      } catch (error) {
        throw normalizeProviderError(error);
      }

      let result;
      try {
        result = parseNuwaN1ActorResult(response.content, { actor: { id: input.actorId, revision: input.actorRevision }, allowedActions: ALLOWED_ACTIONS }, response.usage, [input.actorId]);
        validateNuwaN1ActorResult(result, { character: { id: input.actorId, revision: input.actorRevision }, allowedActions: ALLOWED_ACTIONS });
        result = { ...result, action: normalizeNuwaN1Action(result.action) };
      } catch (error) {
        recordStrict(receiptStore, response.receiptEnvelopeId, projectionId, "rejected");
        throw candidateError("MODEL_CONTRACT_INVALID", "模型结果未通过 NuwaN1ActorResult 合同校验。", 422, error);
      }
      recordStrict(receiptStore, response.receiptEnvelopeId, projectionId, "accepted");
      completeReceipt(receiptStore, response.receiptEnvelopeId);

      const afterActor = normalizeActor(readActor({ projectId: input.projectId, actorId: input.actorId }));
      const afterScene = normalizeScene(readScene({ projectId: input.projectId, sceneId: input.sceneId }));
      const afterPreparation = prepareContext({ input, actor: afterActor, scene: afterScene, allowedActions: ALLOWED_ACTIONS });
      const postResponseStale = afterActor.revision !== input.actorRevision
        || afterScene.revision !== input.sceneRevision
        || afterPreparation?.previewDigest !== input.contextDigest
        || (afterPreparation?.projectionRevision ?? null) !== (input.projectionRevision ?? null);
      return Object.freeze({
        version: SINGLE_CHARACTER_ACTION_CANDIDATE_VERSION,
        candidateId: `transient.${digest(`${input.operationId}:${input.contextDigest}:${JSON.stringify(result)}`).slice(0, 24)}`,
        label: "未保存候选",
        lifecycle: postResponseStale ? "stale" : "transient",
        persistence: "not-saved",
        usable: !postResponseStale,
        replayAvailable: false,
        actor: { id: input.actorId, revision: input.actorRevision },
        scene: { id: input.sceneId, revision: input.sceneRevision },
        localGoal: input.localGoal,
        contextDigest: input.contextDigest,
        projectionRevision: input.projectionRevision,
        sourceRefs: unique([input.actorId, input.sceneId, ...(context.stateProjection?.sourceAnchors ?? [])]),
        result: structuredClone(result),
        provider: { providerId: provider.providerId, profileId: provider.profileId, modelId: provider.modelId },
        receiptEnvelopeId: response.receiptEnvelopeId ?? null,
        providerCalls: 1,
        automaticRetries: 0,
        writes: ZERO_WRITES
      });
    }
  });
}

function readSnapshot(input, dependencies) {
  const actor = normalizeActor(dependencies.readActor({ projectId: input.projectId, actorId: input.actorId }));
  if (actor.id !== input.actorId || actor.revision !== input.actorRevision) throw candidateError("STALE_ACTOR", "角色已变更，未发送 Provider 请求。", 409);
  const scene = normalizeScene(dependencies.readScene({ projectId: input.projectId, sceneId: input.sceneId }));
  if (scene.id !== input.sceneId || scene.revision !== input.sceneRevision) throw candidateError("STALE_SCENE", "故事单元已变更，未发送 Provider 请求。", 409);
  const preparation = dependencies.prepareContext({ input, actor, scene, allowedActions: ALLOWED_ACTIONS });
  if (preparation?.handoff?.contextAccess !== "character" || preparation.blockedReason || !preparation.providerSafeContext) throw candidateError("CONTEXT_ACCESS_DENIED", "角色安全上下文权限未开放，未发送 Provider 请求。", 403);
  if (preparation.previewDigest !== input.contextDigest || (preparation.projectionRevision ?? null) !== (input.projectionRevision ?? null)) {
    const clientGuard = `${input.contextDigest.slice(0, 12)}:${String(input.projectionRevision ?? "none").slice(0, 12)}`;
    const serverGuard = `${String(preparation.previewDigest ?? "none").slice(0, 12)}:${String(preparation.projectionRevision ?? "none").slice(0, 12)}`;
    throw candidateError("STALE_CONTEXT", `角色上下文已变更，未发送 Provider 请求。安全摘要守卫 ${clientGuard} -> ${serverGuard}。`, 409);
  }
  if (preparation.missingConditions?.some((condition) => condition !== "world-time")) throw candidateError("CONTEXT_INCOMPLETE", "角色行动上下文不完整，未发送 Provider 请求。", 409);
  return { actor, scene, preparation };
}

function normalizeInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw candidateError("INVALID_REQUEST", "候选请求无效。", 400);
  return {
    projectId: text(value.projectId, "projectId", 160), actorId: text(value.actorId, "actorId", 160), actorRevision: text(value.actorRevision, "actorRevision", 240),
    sceneId: text(value.sceneId, "sceneId", 160), sceneRevision: text(value.sceneRevision, "sceneRevision", 240), localGoal: text(value.localGoal, "localGoal", 600),
    contextDigest: text(value.contextDigest, "contextDigest", 240), projectionRevision: value.projectionRevision == null ? null : text(value.projectionRevision, "projectionRevision", 240),
    operationId: operationId(value.operationId)
  };
}
function normalizeActor(value) { if (!value?.id || !value?.revision) throw candidateError("ACTOR_NOT_FOUND", "找不到可用角色。", 404); return value; }
function normalizeScene(value) { if (!value?.id || !value?.revision) throw candidateError("SCENE_NOT_FOUND", "找不到可用故事单元。", 404); return value; }
function normalizeProvider(value) { return { configured: value?.configured === true, profileId: value?.profileId || "", providerId: value?.providerId || "", modelId: value?.modelId || "", profileRevision: String(value?.profileRevision || "current") }; }
function text(value, label, maximum) { const normalized = typeof value === "string" ? value.normalize("NFC").trim() : ""; if (!normalized || normalized.length > maximum || (label !== "localGoal" && /[\0\r\n]/u.test(normalized))) throw candidateError("INVALID_REQUEST", `${label} 无效。`, 400); return normalized; }
function operationId(value) { const normalized = text(value, "operationId", 200); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) throw candidateError("INVALID_REQUEST", "operationId 无效。", 400); return normalized; }
function unique(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].slice(0, 64); }
function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function recordStrict(store, envelopeId, strictProjectionId, status) { if (store && envelopeId) store.recordStrictProjection({ envelopeId, strictProjectionId, strictProjectionSchema: "tianyan-nuwa-n1-actor-result/v1", strictProjectionStatus: status }); }
function completeReceipt(store, envelopeId) { if (store && envelopeId) store.complete({ envelopeId }); }
function normalizeProviderError(error) { if (error?.code === "PROVIDER_IDEMPOTENT_REPLAY_REQUIRED") return candidateError("RESULT_STATUS_UNKNOWN", "同一操作已有 Provider 收据，但临时候选不可重放；未再次发送。", 409, error); return error; }
function candidateError(code, message, statusCode, cause = undefined) { const error = new Error(message, cause ? { cause } : undefined); error.code = code; error.statusCode = statusCode; return error; }
