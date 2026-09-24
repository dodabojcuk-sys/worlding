import { describeNuwaDirectorFocus, NUWA_DIRECTOR_FOCUS_RULES } from "../../../src/storyIntelligence/nuwaDirectorFocus.ts";
import { createHash } from "node:crypto";
const ADAPTER_ID = "pi-n1-role-tool-roundtrip/v1";

/**
 * Production-shaped N1 adapter. It is deliberately inert until the host
 * explicitly supplies a configured Pi runtime and Provider bridge. The only
 * product tool is a frozen, role-scoped context read; this adapter has no
 * filesystem, Canon, Event, World, Relation, or character-write capability.
 */
export function createNuwaN1PiAdapter({ runtime, projectId, runId, actorIds, provider, sourceIdentity, openProviderStream, onProviderLifecycle = null, roleMaxOutputTokens = 512, directorMaxOutputTokens = 2_400, now = () => new Date().toISOString() }) {
  if (!runtime || typeof runtime.run !== "function") throw new Error("Nuwa N1 Pi adapter requires an active Agent Runtime.");
  if (!provider?.providerId || !provider?.profileId || !provider?.modelId) throw new Error("Nuwa N1 Pi adapter requires an explicit Provider profile.");
  if (!sourceIdentity?.workVersionId || !sourceIdentity?.revision || !sourceIdentity?.kind) throw new Error("Nuwa N1 Pi adapter requires an explicit versioned or unversioned source identity.");
  const scopedActorIds = [...new Set((Array.isArray(actorIds) ? actorIds : []).map((actorId) => typeof actorId === "string" ? actorId.normalize("NFC").trim() : "").filter(Boolean))];
  if (scopedActorIds.length < 2 || scopedActorIds.length > 3) throw new Error("Nuwa N1 Pi adapter requires two or three stable Run actor IDs.");
  if (typeof openProviderStream !== "function") throw new Error("Nuwa N1 Pi adapter requires the host Provider bridge.");
  if (!Number.isSafeInteger(roleMaxOutputTokens) || roleMaxOutputTokens < 1 || roleMaxOutputTokens > 8_192) throw new Error("Nuwa N1 role output budget is invalid.");
  if (!Number.isSafeInteger(directorMaxOutputTokens) || directorMaxOutputTokens < 1 || directorMaxOutputTokens > 8_192) throw new Error("Nuwa N1 director output budget is invalid.");
  const contextTool = "read_role_context";
  let activeAgentRunId = null;
  const observation = { rounds: [], localToolMs: null, businessParseMs: null, context: null };
  const observeProvider = (event, providerCall) => {
    const round = observation.rounds[providerCall - 1] ?? { started: null, durationMs: null, status: null, requestBytes: null, messageCount: null, toolCount: null, shapeId: null };
    if (event.phase === "dispatched") round.started = performance.now();
    if (["completed", "failed", "cancelled", "unknown"].includes(event.phase)) {
      if (round.started != null) round.durationMs = Math.max(0, Math.round(performance.now() - round.started));
      round.status = event.phase;
    }
    observation.rounds[providerCall - 1] = round;
  };
  const observeWire = (wire, providerCall) => {
    const round = observation.rounds[providerCall - 1];
    if (round) round.wire = wire;
  };
  const observeFrame = (round, event) => {
    if (!round) return;
    const frames = round.frames ??= { contentBytes: 0, contentChunks: 0, reasoningBytes: 0, reasoningChunks: 0, toolArgumentBytes: 0, toolArgumentChunks: 0, toolCalls: 0, toolName: null, argumentsJsonClosed: null, argumentsSchemaValid: null, finishReason: null, usageReceived: false, malformedReason: null };
    if (event.type === "chunk") {
      if (event.text) { frames.contentBytes += Buffer.byteLength(event.text); frames.contentChunks += 1; }
      if (event.reasoningBytes) { frames.reasoningBytes += event.reasoningBytes; frames.reasoningChunks += 1; }
      if (event.finishReason) frames.finishReason = event.finishReason;
      if (event.usage) frames.usageReceived = true;
    }
    if (event.type === "tool-call-start") { frames.toolCalls += 1; frames.toolName = event.name === "read_director_brief" || event.name === "read_role_context" ? event.name : "unexpected"; }
    if (event.type === "tool-call-delta") { frames.toolArgumentBytes += Buffer.byteLength(event.argumentsDelta); frames.toolArgumentChunks += 1; }
    if (event.type === "tool-call-end" || event.type === "tool-call-malformed") {
      if (event.type === "tool-call-end") frames.finishReason = "tool_calls";
      try {
        const parsed = JSON.parse(event.argumentsJson ?? "");
        frames.argumentsJsonClosed = true;
        frames.argumentsSchemaValid = parsed != null && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length === 0;
      } catch { frames.argumentsJsonClosed = false; frames.argumentsSchemaValid = false; }
      if (event.type === "tool-call-malformed") frames.malformedReason = event.reason;
    }
  };
  const requestShape = (providerInput) => {
    const messages = Array.isArray(providerInput.messages) ? providerInput.messages : [];
    const messageShape = messages.map((message) => ({ role: message.role, bytes: Buffer.byteLength(JSON.stringify(message), "utf8") }));
    const round = observation.rounds[providerInput.providerCall - 1] ?? { started: null, durationMs: null, status: null };
    round.requestBytes = Buffer.byteLength(JSON.stringify({ messages, tools: providerInput.tools, toolChoice: providerInput.toolChoice }), "utf8");
    round.messageCount = messages.length;
    round.toolCount = providerInput.tools?.length ?? 0;
    round.shapeId = createHash("sha256").update(JSON.stringify(messageShape)).digest("hex").slice(0, 16);
    observation.rounds[providerInput.providerCall - 1] = round;
  };
  const observeStream = async (providerCall, open) => {
    const started = performance.now();
    const round = observation.rounds[providerCall - 1];
    try {
      const stream = await open();
      return { ...stream, events: (async function* () {
        try {
          for await (const event of stream.events) { observeFrame(round, event); yield event; }
          if (round.status == null) round.status = "completed";
        } catch (error) {
          if (round.status == null) round.status = "failed";
          throw error;
        } finally {
          if (round.durationMs == null) round.durationMs = Math.max(0, Math.round(performance.now() - (round.started ?? started)));
        }
      })() };
    } catch (error) {
      if (round.status == null) round.status = "failed";
      if (round.durationMs == null) round.durationMs = Math.max(0, Math.round(performance.now() - (round.started ?? started)));
      throw error;
    }
  };
  return Object.freeze({
    adapterId: ADAPTER_ID,
    diagnostics() {
      return {
        rounds: observation.rounds.map(({ started: _started, ...round }) => ({ ...round })),
        localToolMs: observation.localToolMs,
        businessParseMs: observation.businessParseMs,
        context: observation.context ? { ...observation.context } : null
      };
    },
    cancel() {
      return activeAgentRunId && typeof runtime.cancel === "function"
        ? runtime.cancel({ projectId, workVersionId: sourceIdentity.workVersionId, sessionId: runId, runId: activeAgentRunId })
        : false;
    },
    async suggestDirector(brief) {
      if (!brief?.runId || brief.runId !== runId || !brief.operationId || !brief.instruction) throw new Error("Nuwa N1 director brief is outside the frozen Run scope.");
      let briefRead = false;
      activeAgentRunId = `${runId}.director.${brief.operationId}`;
      try {
        const result = await runtime.run({
          runId: activeAgentRunId, projectId, workVersionId: sourceIdentity.workVersionId, sessionId: runId,
          prompt: directorPromptFor(brief),
          systemPrompt: "你是女娲 N1 的受控导演建议适配器。首轮只调用 read_director_brief，参数为 {}，不得在工具参数中写建议或简报；工具返回后才输出严格 JSON 建议。只可读取本次 Run 作者侧概要；不得调用角色上下文、文件、网络、凭据或任何故事写入工具。不得把作者原话、秘密身份、角色知识或建议全文交给角色。不要解释过程。",
          providerId: provider.providerId, profileId: provider.profileId, modelId: provider.modelId, maxOutputTokens: directorMaxOutputTokens, retry: false,
          tools: [{ name: "read_director_brief", label: "读取导演概要", description: "返回当前 Run 的作者导演要求和已提交步骤摘要；仅用于提出未采纳建议。", inputSchema: { type: "object", additionalProperties: false, properties: {} }, async execute(input) { if (input.toolCallId.length > 240 || Object.keys(input.arguments).length) throw new Error("Nuwa N1 director brief accepts no arguments."); briefRead = true; return { brief: safeDirectorBriefForProvider(brief) }; } }],
          requiredToolName: "read_director_brief",
          async authorizeTool(input) { return input.toolName === "read_director_brief" && !Object.keys(input.arguments).length ? { allowed: true, approvalReceiptId: `nuwa-n1-director-brief:${brief.operationId}` } : { allowed: false, reason: "Nuwa N1 director permits only its frozen brief." }; },
          async openProviderStream(providerInput) {
            if (providerInput.providerCall > 2 || (providerInput.providerCall > 1 && !briefRead)) throw new Error("导演概要工具未被正确读取，或模型重复调用工具；已停止本回合，未继续发送请求。");
            const effective = { ...providerInput, ...(briefRead ? { tools: [], toolChoice: null } : {}) };
            requestShape(effective);
            return observeStream(providerInput.providerCall, () => openProviderStream({ ...effective, onRequestShape: (wire) => observeWire(wire, providerInput.providerCall), onProviderLifecycle: (event) => { observeProvider(event, providerInput.providerCall); return onProviderLifecycle?.({ ...event, attemptId: brief.operationId, providerCall: providerInput.providerCall, provider: { providerId: provider.providerId, profileId: provider.profileId, modelId: provider.modelId } }); } }));
          },
          onEvent() { /* The RunPack keeps only the bounded suggestion. */ }
        });
        return parseDirectorSuggestion(result.text, result.usage);
      } finally { activeAgentRunId = null; }
    },
    async request(context) {
      return { type: "tool-request", toolName: contextTool, requestId: toolRequestId(context), actor: structuredClone(context.actor) };
    },
    async executeTool({ context, request }) {
      if (request.toolName !== contextTool || request.requestId !== toolRequestId(context) || !sameRef(request.actor, context.actor)) throw new Error("Pi N1 context tool request is outside the frozen actor scope.");
      return { type: "tool-result", toolName: contextTool, requestId: request.requestId, actor: structuredClone(context.actor), context: structuredClone(context) };
    },
    async continueAfterTool({ context, toolResult }) {
      if (toolResult.toolName !== contextTool || toolResult.requestId !== toolRequestId(context) || !sameRef(toolResult.actor, context.actor) || !sameRef(toolResult.context.actor, context.actor)) throw new Error("Pi N1 context tool result is outside the frozen actor scope.");
      let contextRead = false;
      activeAgentRunId = `${runId}.${context.attemptId}`;
      try {
      const result = await runtime.run({
        runId: activeAgentRunId,
        projectId,
        // A rehearsal has to name the actual version contract it read.  An
        // unversioned draft is explicit; a fabricated constant is not.
        workVersionId: sourceIdentity.workVersionId,
        sessionId: runId,
        prompt: promptFor(context, scopedActorIds),
        systemPrompt: "你是女娲 N1 的受控 Pi 回合适配器。只能使用 read_role_context 返回的冻结角色范围。不得访问文件、Shell、网络以外的产品工具、凭据、其他作品或隐藏角色信息；不得写入 Canon、World、Event、Relation、人物资料或记忆。只输出严格 JSON，不要解释过程。",
        providerId: provider.providerId,
        profileId: provider.profileId,
        modelId: provider.modelId,
        maxOutputTokens: roleMaxOutputTokens,
        retry: false,
        tools: [{
          name: contextTool,
          label: "读取当前角色上下文",
          description: "返回本回合冻结的角色可知范围、信念和未知项；没有任何写入能力。",
          inputSchema: { type: "object", additionalProperties: false, properties: {} },
          async execute(input) {
            if (input.toolCallId.length > 240 || Object.keys(input.arguments).length) throw new Error("Pi N1 context tool accepts no arguments.");
            const started = performance.now();
            contextRead = true;
            try {
              const safe = safeContextForProvider(context);
              observation.context = {
                version: safe.version,
                actorRevision: safe.actor.revision,
                bytes: Buffer.byteLength(JSON.stringify(safe), "utf8"),
                sourceCount: safe.knownFacts.length + safe.beliefs.length,
                dialogueCount: safe.recentDialogue.length,
                sourceSetId: createHash("sha256").update(JSON.stringify([...safe.knownFacts.map((fact) => [fact.sourceId, fact.sourceRevision]), ...safe.beliefs.map((belief) => [belief.sourceId, belief.sourceRevision])])).digest("hex").slice(0, 16)
              };
              return { context: safe };
            } finally { observation.localToolMs = Math.max(0, Math.round(performance.now() - started)); }
          }
        }],
        requiredToolName: contextTool,
        async authorizeTool(input) {
          return input.toolName === contextTool && !Object.keys(input.arguments).length
            ? { allowed: true, approvalReceiptId: `nuwa-n1-role-context:${context.attemptId}` }
            : { allowed: false, reason: "Nuwa N1 only permits its frozen role-context tool." };
        },
        async openProviderStream(providerInput) {
          if (providerInput.providerCall > 2 || (providerInput.providerCall > 1 && !contextRead)) throw new Error("角色上下文工具未被正确读取，或模型重复调用工具；已停止本回合，未继续发送请求。");
          const effective = {
            ...providerInput,
            ...(contextRead ? { tools: [], toolChoice: null } : {}),
          };
          requestShape(effective);
          return observeStream(providerInput.providerCall, () => openProviderStream({
            ...effective,
            onRequestShape: (wire) => observeWire(wire, providerInput.providerCall),
            // This callback is deliberately handed to the Gateway rather than
            // invoked here: an N1 record must follow Gateway reservation and
            // transport lifecycle, not merely Pi's intent to send.
            onProviderLifecycle: (event) => { observeProvider(event, providerInput.providerCall); return onProviderLifecycle?.({
                ...event,
                attemptId: context.attemptId,
                providerCall: providerInput.providerCall,
                provider: { providerId: provider.providerId, profileId: provider.profileId, modelId: provider.modelId }
              }); }
          }));
        },
        onEvent() { /* RunPack stores the resulting bounded turn, not model-chain text. */ }
      });
      const parseStarted = performance.now();
      try { return parseActorResult(result.text, context, result.usage, scopedActorIds); }
      finally { observation.businessParseMs = Math.max(0, Math.round(performance.now() - parseStarted)); }
      } finally {
        activeAgentRunId = null;
      }
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
    profileBasis: context.profileBasis,
    knownFacts: context.knownFacts,
    beliefs: context.beliefs,
    // Selection ranking, byte arithmetic and the algorithm identity are the
    // author-side audit of why this turn's subset was chosen. They duplicate
    // evidence the role already receives and are not role-perceptible, so the
    // author inspector keeps them while the Provider payload does not.
    // Excluded identities can themselves disclose a future secret. The role
    // gets only an auditable count/reason; the author inspector retains IDs.
    excluded: { count: context.excludedKnowledgeCount, reasonCodes: context.excludedKnowledgeCount ? ["not-known-by-actor"] : [] },
    recentDialogue: context.recentDialogue,
    allowedActions: context.allowedActions,
    remaining: context.remaining,
    authorCue: context.authorCue,
    directorFocus: context.directorFocus
  };
}
function promptFor(context, actorIds) {
  const eligibleHearerActorIds = [...new Set((Array.isArray(actorIds) ? actorIds : []).filter((actorId) => typeof actorId === "string" && actorId !== context.actor.id))].slice(0, 2);
  return [
    "先调用 read_role_context；之后只根据该工具结果输出一个角色回合。",
    "read_role_context 不接受任何参数，禁止传 roleId 或请求其他角色。读取成功后只能输出结果，不得再次调用工具。action.targetId 可为 null；仅 speak/ask 可填写本次允许且在 heardByActorIds 中明确列出的接收角色 ID，其他行动必须为 null。observableResult 只写外部可观察的行动，不写内心秘密。",
    "输出严格 JSON：{\"intent\":string,\"speech\":string|null,\"heardByActorIds\":string[],\"action\":{\"action\":\"speak\"|\"observe\"|\"ask\",\"targetId\":string|null},\"observableResult\":string}。",
    `heardByActorIds 只能取这些当前 Run 稳定角色 ID：${JSON.stringify(eligibleHearerActorIds)}；speech 为 null 时必须为 []。`,
    "未知、怀疑和误解不得提升为事实；不可引用工具结果之外的内容。",
    context.directorFocus?.length ? `本回合仅遵循这些导演层推进标签：${JSON.stringify(context.directorFocus)}；它们不提供任何故事事实或角色知识。\n${describeNuwaDirectorFocus(context.directorFocus)}` : "本回合没有已采纳的导演层推进标签。",
    `当前回合：${context.step}；角色：${context.actor.id}；场景：${context.scene.label}`
  ].join("\n");
}
function parseSingleJsonResult(text) {
  const source = String(text).trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/iu.exec(source);
  return JSON.parse(fenced ? fenced[1] : source);
}

function parseActorResult(text, context, usage, actorIds) {
  let value;
  try { value = parseSingleJsonResult(text); }
  catch { throw new Error("Pi N1 response must be one strict JSON actor result."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["intent", "speech", "action", "observableResult", "heardByActorIds"].includes(key))) throw new Error("Pi N1 response has unsupported fields.");
  if (typeof value.intent !== "string" || !value.intent.trim() || typeof value.observableResult !== "string" || !value.observableResult.trim()) throw new Error("Pi N1 response lacks a bounded intent or observable result.");
  if (value.speech !== null && typeof value.speech !== "string") throw new Error("Pi N1 speech must be string or null.");
  if (value.heardByActorIds != null && (!Array.isArray(value.heardByActorIds) || value.heardByActorIds.some((id) => typeof id !== "string"))) throw new Error("Pi N1 statement recipients must be stable IDs.");
  const eligibleHearerActorIds = new Set((Array.isArray(actorIds) ? actorIds : []).filter((actorId) => typeof actorId === "string" && actorId !== context.actor.id));
  if (value.heardByActorIds?.some((id) => !eligibleHearerActorIds.has(id.normalize("NFC")))) throw new Error("Pi N1 statement recipients are outside the current Run scope.");
  if (value.speech === null && value.heardByActorIds?.length) throw new Error("Pi N1 silent turns cannot name statement recipients.");
  const boundedRecipientTarget = value.action?.targetId != null && ["speak", "ask"].includes(value.action?.action) && eligibleHearerActorIds.has(value.action.targetId) && value.heardByActorIds?.includes(value.action.targetId);
  if (!value.action || typeof value.action !== "object" || Array.isArray(value.action) || Object.keys(value.action).some((key) => !["action", "targetId"].includes(key)) || !context.allowedActions.includes(value.action.action) || (value.action.targetId !== null && !boundedRecipientTarget)) throw new Error("Pi N1 action is outside this role's allowed read-only turn.");
  return {
    type: "actor-result",
    actor: structuredClone(context.actor),
    intent: value.intent.trim().slice(0, 600),
    speech: value.speech === null ? null : value.speech.trim().slice(0, 1_200),
    action: { action: value.action.action, targetId: boundedRecipientTarget ? value.action.targetId : null },
    observableResult: value.observableResult.trim().slice(0, 1_200),
    heardByActorIds: value.heardByActorIds == null ? undefined : [...new Set(value.heardByActorIds.map((id) => id.normalize("NFC")))],
    usage: usage ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens } : { inputTokens: null, outputTokens: null }
  };
}
function safeDirectorBriefForProvider(brief) {
  return { version: brief.version, runId: brief.runId, instruction: brief.instruction, authorGoal: brief.authorGoal, scene: brief.scene, completedSteps: brief.completedSteps, scope: brief.scope };
}
function directorPromptFor(brief) {
  return [
    "首轮只调用 read_director_brief，工具参数必须是空对象 {}；不要在参数中写分析、建议或重复简报。收到工具结果后，才输出一个当前 Run 的导演建议。不要 Markdown 代码块或额外说明。",
    "输出严格 JSON：{\"understood\":string,\"proposedAdjustment\":string,\"scope\":string,\"focus\":[\"defer-reveal\"|\"prioritize-character-interaction\"|\"preserve-uncertainty\"|\"advance-observation\"],\"unsupported\":string[]}。",
    "逐项核对作者要求：unsupported 必须列出不能执行的部分；完全不支持时 focus=[]，禁止用默认标签伪装成功。focus 有支持项时必须是一到两个枚举值。它是唯一会进入后续角色回合的内容；不得在其中放入姓名、秘密、作者原话或自由文本。",
    "仅支持当前场景从下一安全步骤起的有限推进提示；不承诺特定剧情、对象、台词或结果。已提交步骤、事件线、角色、正式故事、人物记忆均不可修改。",
    "精确映射：作者说暂缓/延后/不要主动揭露时用 defer-reveal；作者说优先角色互动时用 prioritize-character-interaction。preserve-uncertainty 仅表示不要把推测当事实，不可替代暂缓揭露。advance-observation 仅表示优先观察。作者明确提出两项受支持要求时分别保留这两项，不用其他标签替换；额外剧情要求放 unsupported。",
    "unsupported 逐项列出要求中所有不受支持的具体剧情操作，不能遗漏新增事物、指定事件或改写场景等要求。不要把隐私/知识隔离要求列为未执行：不发送作者秘密与原文是系统始终执行的边界，不消耗 focus 名额。understood 对不能执行的要求也只能表示理解，不得承诺执行。",
    JSON.stringify(NUWA_DIRECTOR_FOCUS_RULES),
    `当前 Run：${brief.runId}；下一安全步骤：${brief.completedSteps.length + 1}；场景：${brief.scene.label}`
  ].join("\n");
}
function parseDirectorSuggestion(text, usage) {
  let value;
  try { value = parseSingleJsonResult(text); } catch { throw new Error("Pi N1 director response must be one strict JSON suggestion."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["understood", "proposedAdjustment", "scope", "focus", "unsupported"].includes(key))) throw new Error("Pi N1 director response has unsupported fields.");
  if ([value.understood, value.proposedAdjustment, value.scope].some((item) => typeof item !== "string" || !item.trim()) || !Array.isArray(value.focus) || value.focus.length > 2 || !Array.isArray(value.unsupported) || value.unsupported.length > 8 || value.unsupported.some((item) => typeof item !== "string" || !item.trim() || item.length > 240) || (!value.focus.length && !value.unsupported.length)) throw new Error("Pi N1 director response lacks a bounded adjustment.");
  const allowed = new Set(["defer-reveal", "prioritize-character-interaction", "preserve-uncertainty", "advance-observation"]);
  const focus = [...new Set(value.focus.map((item) => typeof item === "string" ? item.normalize("NFC").trim() : ""))];
  if (focus.some((item) => !allowed.has(item))) throw new Error("Pi N1 director response is outside N1's supported adjustment scope.");
  return { understood: value.understood.trim().slice(0, 600), proposedAdjustment: describeNuwaDirectorFocus(focus), scope: value.scope.trim().slice(0, 400), focus, unsupported: value.unsupported, usage: usage ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens } : { inputTokens: null, outputTokens: null } };
}
