const ADAPTER_ID = "pi-n1-role-tool-roundtrip/v1";

/**
 * Production-shaped N1 adapter. It is deliberately inert until the host
 * explicitly supplies a configured Pi runtime and Provider bridge. The only
 * product tool is a frozen, role-scoped context read; this adapter has no
 * filesystem, Canon, Event, World, Relation, or character-write capability.
 */
export function createNuwaN1PiAdapter({ runtime, projectId, runId, provider, openProviderStream, now = () => new Date().toISOString() }) {
  if (!runtime || typeof runtime.run !== "function") throw new Error("Nuwa N1 Pi adapter requires an active Agent Runtime.");
  if (!provider?.providerId || !provider?.profileId || !provider?.modelId) throw new Error("Nuwa N1 Pi adapter requires an explicit Provider profile.");
  if (typeof openProviderStream !== "function") throw new Error("Nuwa N1 Pi adapter requires the host Provider bridge.");
  const contextTool = "read_role_context";
  return Object.freeze({
    adapterId: ADAPTER_ID,
    async request(context) {
      return { type: "tool-request", toolName: contextTool, requestId: toolRequestId(context), actor: structuredClone(context.actor) };
    },
    async executeTool({ context, request }) {
      if (request.toolName !== contextTool || request.requestId !== toolRequestId(context) || !sameRef(request.actor, context.actor)) throw new Error("Pi N1 context tool request is outside the frozen actor scope.");
      return { type: "tool-result", toolName: contextTool, requestId: request.requestId, actor: structuredClone(context.actor), context: structuredClone(context) };
    },
    async continueAfterTool({ context, toolResult }) {
      if (toolResult.toolName !== contextTool || toolResult.requestId !== toolRequestId(context) || !sameRef(toolResult.actor, context.actor) || !sameRef(toolResult.context.actor, context.actor)) throw new Error("Pi N1 context tool result is outside the frozen actor scope.");
      const result = await runtime.run({
        runId: `${runId}.${context.attemptId}`,
        projectId,
        workVersionId: "work-version.nuwa-n1",
        sessionId: runId,
        prompt: promptFor(context),
        systemPrompt: "你是女娲 N1 的受控 Pi 回合适配器。只能使用 read_role_context 返回的冻结角色范围。不得访问文件、Shell、网络以外的产品工具、凭据、其他作品或隐藏角色信息；不得写入 Canon、World、Event、Relation、人物资料或记忆。只输出严格 JSON，不要解释过程。",
        providerId: provider.providerId,
        profileId: provider.profileId,
        modelId: provider.modelId,
        maxOutputTokens: 512,
        retry: false,
        tools: [{
          name: contextTool,
          label: "读取当前角色上下文",
          description: "返回本回合冻结的角色可知范围、信念和未知项；没有任何写入能力。",
          inputSchema: { type: "object", additionalProperties: false, properties: {} },
          async execute(input) {
            if (input.toolCallId.length > 240 || Object.keys(input.arguments).length) throw new Error("Pi N1 context tool accepts no arguments.");
            return { context: safeContextForProvider(context) };
          }
        }],
        requiredToolName: contextTool,
        async authorizeTool(input) {
          return input.toolName === contextTool && !Object.keys(input.arguments).length
            ? { allowed: true, approvalReceiptId: `nuwa-n1-role-context:${context.attemptId}` }
            : { allowed: false, reason: "Nuwa N1 only permits its frozen role-context tool." };
        },
        openProviderStream,
        onEvent() { /* RunPack stores the resulting bounded turn, not model-chain text. */ }
      });
      return parseActorResult(result.text, context, result.usage);
    }
  });
}

export const NUWA_N1_PI_ADAPTER_ID = ADAPTER_ID;

function toolRequestId(context) { return `n1-pi-tool.${context.runId}.${context.step}.${context.attemptId}`; }
function sameRef(left, right) { return left?.id === right?.id && left?.revision === right?.revision; }
function safeContextForProvider(context) {
  return {
    version: context.version,
    runId: context.runId,
    step: context.step,
    actor: context.actor,
    scene: context.scene,
    localGoal: context.localGoal,
    coreSummary: context.coreSummary,
    knownFacts: context.knownFacts,
    beliefs: context.beliefs,
    unknownFactIds: context.unknownFactIds,
    recentDialogue: context.recentDialogue,
    allowedActions: context.allowedActions,
    remaining: context.remaining,
    authorCue: context.authorCue
  };
}
function promptFor(context) {
  return [
    "先调用 read_role_context；之后只根据该工具结果输出一个角色回合。",
    "输出严格 JSON：{\"intent\":string,\"speech\":string|null,\"action\":{\"action\":\"speak\"|\"observe\"|\"ask\",\"targetId\":null},\"observableResult\":string}。",
    "未知、怀疑和误解不得提升为事实；不可引用工具结果之外的内容。",
    `当前回合：${context.step}；角色：${context.actor.id}；场景：${context.scene.label}`
  ].join("\n");
}
function parseActorResult(text, context, usage) {
  let value;
  try { value = JSON.parse(String(text).trim()); }
  catch { throw new Error("Pi N1 response must be one strict JSON actor result."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["intent", "speech", "action", "observableResult"].includes(key))) throw new Error("Pi N1 response has unsupported fields.");
  if (typeof value.intent !== "string" || !value.intent.trim() || typeof value.observableResult !== "string" || !value.observableResult.trim()) throw new Error("Pi N1 response lacks a bounded intent or observable result.");
  if (value.speech !== null && typeof value.speech !== "string") throw new Error("Pi N1 speech must be string or null.");
  if (!value.action || typeof value.action !== "object" || Array.isArray(value.action) || Object.keys(value.action).some((key) => !["action", "targetId"].includes(key)) || !context.allowedActions.includes(value.action.action) || value.action.targetId !== null) throw new Error("Pi N1 action is outside this role's allowed read-only turn.");
  return {
    type: "actor-result",
    actor: structuredClone(context.actor),
    intent: value.intent.trim().slice(0, 600),
    speech: value.speech === null ? null : value.speech.trim().slice(0, 1_200),
    action: { action: value.action.action, targetId: null },
    observableResult: value.observableResult.trim().slice(0, 1_200),
    usage: usage ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens } : { inputTokens: null, outputTokens: null }
  };
}
