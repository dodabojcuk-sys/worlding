/** Replaceable Pi infrastructure adapter; product facts stay in AgentRuntimePort. */
export type PiTextStreamEvent =
  | { type: "text-delta"; delta: string; sequence: number; recordedAt: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string; sequence: number; recordedAt: string }
  | { type: "tool-call-end"; toolCallId: string; toolName: string; isError: boolean; sequence: number; recordedAt: string };

export type PiProviderUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type PiTextProviderEvent =
  | { type: "chunk"; text: string; finishReason: string | null; usage: PiProviderUsage | null }
  | { type: "tool-call-start"; id: string; name: string; index: number }
  | { type: "tool-call-delta"; id: string; name: string; index: number; argumentsDelta: string }
  | { type: "tool-call-end"; id: string; name: string; index: number; argumentsJson: string; arguments: Record<string, unknown> }
  | { type: "tool-call-malformed"; id: string | null; name: string | null; index: number; argumentsJson: string; reason: string }
  | { type: "tool-call-aborted"; id: string | null; name: string | null; index: number; reason: string }
  | { type: "done" };
export type PiTextProviderStream = { traceId: string | null; events: AsyncIterable<PiTextProviderEvent> };
export type PiGatewayMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: Array<{ id: string; name: string; argumentsJson: string }> }
  | { role: "tool"; toolCallId: string; name: string; content: string };
export type PiTextAgentTool = {
  name: string;
  label: string;
  description: string;
  inputSchema?: { type: "object"; required?: string[]; properties?: Record<string, unknown>; additionalProperties?: boolean };
  execute(input: { toolCallId: string; arguments: Record<string, unknown>; approvalReceiptId: string | null; signal?: AbortSignal }): Promise<Record<string, unknown>>;
};
export type PiTextAgentRequest = {
  runId: string;
  projectId: string;
  workVersionId: string;
  sessionId: string;
  prompt: string;
  systemPrompt: string;
  providerId: string;
  profileId: string;
  modelId: string;
  maxOutputTokens: number;
  retry: boolean;
  signal?: AbortSignal;
  tools?: readonly PiTextAgentTool[];
  authorizeTool?(input: { toolName: string; arguments: Record<string, unknown> }): Promise<{ allowed: boolean; reason?: string; approvalRequired?: boolean; approvalReceiptId?: string }>;
  openProviderStream(input: { messages: PiGatewayMessage[]; tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>; providerCall: number; retry: boolean; signal?: AbortSignal }): Promise<PiTextProviderStream>;
  onEvent?(event: PiTextStreamEvent): Promise<void> | void;
};
export type PiTextAgentResult = { text: string; providerCalls: number; traceId: string | null; usage: PiProviderUsage; latencyMs: number };

export class PiAgentAdapterError extends Error {
  readonly code: "cancelled" | "provider-unavailable" | "provider-failed" | "tool-denied" | "tool-approval-required" | "invalid-tool-call" | "unknown";
  readonly retryable: boolean;
  readonly toolCall: { toolName: string; arguments: Record<string, unknown> } | null;
  constructor(input: { code: PiAgentAdapterError["code"]; message: string; retryable: boolean; cause?: unknown; toolCall?: { toolName: string; arguments: Record<string, unknown> } }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "PiAgentAdapterError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.toolCall = input.toolCall ? structuredClone(input.toolCall) : null;
  }
}

export interface PiTextAgentAdapter {
  readonly id: "pi.agent-core";
  readonly packageVersion: "0.84.2";
  run(request: PiTextAgentRequest): Promise<PiTextAgentResult>;
  cancel(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): boolean;
}

export function createPiTextAgentAdapter(input: { now?: () => string; monotonicNow?: () => number } = {}): PiTextAgentAdapter {
  const now = input.now ?? (() => new Date().toISOString());
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const active = new Map<string, { abort(): void }>();

  async function run(request: PiTextAgentRequest): Promise<PiTextAgentResult> {
    const key = scopeKey(request);
    if (active.has(key)) throw new PiAgentAdapterError({ code: "unknown", message: "同一工作版本中的 Agent Run 已在执行。", retryable: false });
    const startedAt = monotonicNow();
    const [{ Agent }, { AssistantMessageEventStream, Type, contentText }] = await Promise.all([import("@earendil-works/pi-agent-core"), import("@earendil-works/pi-ai")]);
    const model = { id: request.modelId, name: request.modelId, api: "openai-completions" as const, provider: request.providerId, baseUrl: "http://127.0.0.1/pi-provider-gateway", reasoning: false, input: ["text" as const], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32_000, maxTokens: request.maxOutputTokens };
    let providerCalls = 0;
    let sequence = 0;
    let traceId: string | null = null;
    let terminalBridgeError: PiAgentAdapterError | null = null;
    let pendingApproval: { toolName: string; arguments: Record<string, unknown> } | null = null;
    const approvalReceipts = new Map<string, string>();
    let usage: PiProviderUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const emit = async (event: Omit<PiTextStreamEvent, "sequence" | "recordedAt">) => {
      sequence += 1;
      await request.onEvent?.({ ...event, sequence, recordedAt: now() } as PiTextStreamEvent);
    };
    const tools = (request.tools ?? []).map((tool) => ({
      name: tool.name, label: tool.label, description: tool.description, parameters: tool.inputSchema ?? Type.Object({}, { additionalProperties: false }),
      execute: async (toolCallId: string, args: Record<string, unknown>, signal?: AbortSignal) => ({ content: [{ type: "text" as const, text: JSON.stringify(await tool.execute({ toolCallId, arguments: args, approvalReceiptId: approvalReceipts.get(toolCallId) ?? null, signal })) }], details: { owner: "product-agent-runtime", toolName: tool.name } })
    }));
    const agent = new Agent({
      initialState: { systemPrompt: request.systemPrompt, model, thinkingLevel: "off", tools },
      sessionId: `${request.projectId}:${request.workVersionId}:${request.sessionId}`,
      toolExecution: "sequential",
      maxRetryDelayMs: 0,
      beforeToolCall: async ({ toolCall }) => {
        const decision = await request.authorizeTool?.({ toolName: toolCall.name, arguments: toolCall.arguments }) ?? { allowed: false, reason: "工具调用没有通过产品审批边界。" };
        if (decision.allowed && decision.approvalReceiptId) approvalReceipts.set(toolCall.id, decision.approvalReceiptId);
        if (!decision.allowed && decision.approvalRequired) pendingApproval = { toolName: toolCall.name, arguments: structuredClone(toolCall.arguments) };
        return decision.allowed ? undefined : { block: true, terminate: true, reason: decision.reason ?? "工具调用没有通过产品审批边界。" };
      },
      streamFn: async (_selectedModel, context, options = {}) => {
        providerCalls += 1;
        const stream = new AssistantMessageEventStream();
        void bridgeProviderStream({ stream, request, messages: toGatewayMessages(request.systemPrompt, context.messages, contentText), providerCall: providerCalls, retry: request.retry || providerCalls > 1, signal: options.signal, model, onTrace(value) { traceId = value; }, onUsage(value) { usage = value; }, onTerminalError(error) { terminalBridgeError = error; } });
        return stream;
      }
    });
    active.set(key, agent);
    const abort = () => agent.abort();
    request.signal?.addEventListener("abort", abort, { once: true });
    const unsubscribe = agent.subscribe(async (event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") await emit({ type: "text-delta", delta: event.assistantMessageEvent.delta });
      else if (event.type === "tool_execution_start") await emit({ type: "tool-call-start", toolCallId: event.toolCallId, toolName: event.toolName });
      else if (event.type === "tool_execution_end") await emit({ type: "tool-call-end", toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError });
    });
    try {
      await agent.prompt(request.prompt);
      if (terminalBridgeError) throw terminalBridgeError;
      if (pendingApproval) throw new PiAgentAdapterError({ code: "tool-approval-required", message: "Provider 请求执行受控产品工具，正在等待作者审批。", retryable: false, toolCall: pendingApproval });
      const assistant = agent.state.messages.slice().reverse().find((message) => message.role === "assistant");
      if (!assistant) throw new PiAgentAdapterError({ code: "provider-failed", message: "Pi Agent 没有返回可读取的文本回合。", retryable: true });
      if (assistant.stopReason === "aborted") throw new PiAgentAdapterError({ code: "cancelled", message: "本次 Agent 运行已取消。", retryable: false });
      if (assistant.stopReason === "error") throw new PiAgentAdapterError({ code: "provider-failed", message: assistant.errorMessage || "Provider 回合失败。", retryable: true });
      return { text: contentText(assistant.content).trim(), providerCalls, traceId, usage, latencyMs: Math.max(0, Math.round(monotonicNow() - startedAt)) };
    } catch (cause) {
      throw normalizePiError(cause, request.signal?.aborted === true);
    } finally {
      unsubscribe();
      request.signal?.removeEventListener("abort", abort);
      active.delete(key);
    }
  }

  function cancel(scope: { projectId: string; workVersionId: string; sessionId: string; runId: string }): boolean {
    const agent = active.get(scopeKey(scope));
    if (!agent) return false;
    agent.abort();
    return true;
  }
  return Object.freeze({ id: "pi.agent-core" as const, packageVersion: "0.84.2" as const, run, cancel });
}

async function bridgeProviderStream(input: { stream: { push(event: unknown): void; end(result?: unknown): void }; request: PiTextAgentRequest; messages: PiGatewayMessage[]; providerCall: number; retry: boolean; signal?: AbortSignal; model: { api: "openai-completions"; provider: string; id: string }; onTrace(value: string | null): void; onUsage(value: PiProviderUsage): void; onTerminalError(error: PiAgentAdapterError): void }) {
  const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
  const content: Array<{ type: "text"; text: string } | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown>; partialJson?: string }> = [];
  const providerToolCalls = new Map<string, { contentIndex: number; id: string; name: string; argumentsJson: string; ended: boolean }>();
  const declaredTools = new Set((input.request.tools ?? []).map((tool) => tool.name));
  let currentTextIndex: number | null = null;
  let usage = emptyUsage();
  const base = () => ({ role: "assistant" as const, content: content.map((block) => ({ ...block })), api: input.model.api, provider: input.model.provider, model: input.model.id, usage, stopReason: "pending" as const, timestamp: Date.now() });
  const endText = () => {
    if (currentTextIndex === null) return;
    const block = content[currentTextIndex];
    input.stream.push({ type: "text_end", contentIndex: currentTextIndex, content: block?.type === "text" ? block.text : "", partial: base() });
    currentTextIndex = null;
  };
  try {
    if (input.signal?.aborted) throw abortError();
    input.stream.push({ type: "start", partial: { ...base(), content: [] } });
    const provider = await input.request.openProviderStream({
      messages: input.messages,
      tools: (input.request.tools ?? []).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema ?? { type: "object", properties: {}, additionalProperties: false } })),
      providerCall: input.providerCall,
      retry: input.retry,
      signal: input.signal
    });
    input.onTrace(provider.traceId);
    let finishReason = "stop";
    for await (const event of provider.events) {
      if (input.signal?.aborted) throw abortError();
      if (event.type === "tool-call-malformed") throw new PiAgentAdapterError({ code: "invalid-tool-call", message: `Provider 工具帧无效：${event.reason}。`, retryable: false });
      if (event.type === "tool-call-aborted") throw abortError();
      if (event.type === "tool-call-start") {
        endText();
        if (!declaredTools.has(event.name)) throw new PiAgentAdapterError({ code: "invalid-tool-call", message: `Provider 请求了未声明工具：${event.name}。`, retryable: false });
        if (providerToolCalls.has(event.id)) throw new PiAgentAdapterError({ code: "invalid-tool-call", message: "Provider 重复启动了同一个工具调用。", retryable: false });
        const contentIndex = content.length;
        content.push({ type: "toolCall", id: event.id, name: event.name, arguments: {}, partialJson: "" });
        providerToolCalls.set(event.id, { contentIndex, id: event.id, name: event.name, argumentsJson: "", ended: false });
        input.stream.push({ type: "toolcall_start", contentIndex, partial: base() });
        finishReason = "toolUse";
        continue;
      }
      if (event.type === "tool-call-delta") {
        const call = providerToolCalls.get(event.id);
        if (!call || call.ended || call.name !== event.name) throw new PiAgentAdapterError({ code: "invalid-tool-call", message: "Provider 工具参数分片顺序无效。", retryable: false });
        call.argumentsJson += event.argumentsDelta;
        const block = content[call.contentIndex];
        if (block?.type === "toolCall") block.partialJson = call.argumentsJson;
        input.stream.push({ type: "toolcall_delta", contentIndex: call.contentIndex, delta: event.argumentsDelta, partial: base() });
        continue;
      }
      if (event.type === "tool-call-end") {
        const call = providerToolCalls.get(event.id);
        if (!call || call.ended || call.name !== event.name || call.argumentsJson !== event.argumentsJson) throw new PiAgentAdapterError({ code: "invalid-tool-call", message: "Provider 工具完成帧与参数分片不一致。", retryable: false });
        call.ended = true;
        const toolCall = { type: "toolCall" as const, id: event.id, name: event.name, arguments: event.arguments };
        content[call.contentIndex] = toolCall;
        input.stream.push({ type: "toolcall_end", contentIndex: call.contentIndex, toolCall, partial: base() });
        continue;
      }
      if (event.type === "done") continue;
      if (event.text) {
        if (currentTextIndex === null) {
          currentTextIndex = content.length;
          content.push({ type: "text", text: "" });
          input.stream.push({ type: "text_start", contentIndex: currentTextIndex, partial: base() });
        }
        const block = content[currentTextIndex];
        if (block?.type === "text") block.text += event.text;
        input.stream.push({ type: "text_delta", contentIndex: currentTextIndex, delta: event.text, partial: base() });
      }
      if (event.finishReason) finishReason = event.finishReason;
      if (event.usage) { input.onUsage(event.usage); usage = { ...usage, input: event.usage.promptTokens, output: event.usage.completionTokens, totalTokens: event.usage.totalTokens }; }
    }
    endText();
    if ([...providerToolCalls.values()].some((call) => !call.ended)) throw new PiAgentAdapterError({ code: "invalid-tool-call", message: "Provider 工具调用没有完整结束。", retryable: false });
    const hasToolCall = providerToolCalls.size > 0;
    const message = { ...base(), stopReason: hasToolCall ? "toolUse" as const : finishReason === "length" ? "length" as const : "stop" as const };
    input.stream.push({ type: "done", reason: message.stopReason, message });
    input.stream.end(message);
  } catch (cause) {
    const cancelled = input.signal?.aborted || (cause instanceof Error && cause.name === "AbortError");
    if (cause instanceof PiAgentAdapterError) input.onTerminalError(cause);
    const error = { ...base(), stopReason: cancelled ? "aborted" as const : "error" as const, errorMessage: cause instanceof Error ? cause.message : "Provider stream failed." };
    input.stream.push({ type: "error", reason: error.stopReason, error });
    input.stream.end(error);
  }
}

function toGatewayMessages(systemPrompt: string, messages: readonly any[], contentText: (content: any) => string): PiGatewayMessage[] {
  const result: PiGatewayMessage[] = [{ role: "system", content: systemPrompt }];
  for (const message of messages) {
    if (message.role === "toolResult") {
      result.push({ role: "tool", toolCallId: String(message.toolCallId), name: String(message.toolName), content: contentText(message.content).trim() || "{}" });
      continue;
    }
    if (message.role === "assistant") {
      const blocks = Array.isArray(message.content) ? message.content : [];
      const text = blocks.filter((block: any) => block?.type === "text").map((block: any) => block.text).join("").trim();
      const toolCalls = blocks.filter((block: any) => block?.type === "toolCall").map((block: any) => ({ id: String(block.id), name: String(block.name), argumentsJson: JSON.stringify(block.arguments ?? {}) }));
      if (text || toolCalls.length) result.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { toolCalls } : {}) });
      continue;
    }
    const text = contentText(message.content).trim();
    if (text) result.push({ role: "user", content: text });
  }
  return result;
}
function scopeKey(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): string { return `${input.projectId}\u0000${input.workVersionId}\u0000${input.sessionId}\u0000${input.runId}`; }
function normalizePiError(cause: unknown, aborted: boolean): PiAgentAdapterError {
  if (cause instanceof PiAgentAdapterError) return cause;
  if (aborted || (cause instanceof Error && cause.name === "AbortError")) return new PiAgentAdapterError({ code: "cancelled", message: "本次 Agent 运行已取消。", retryable: false, cause });
  const source = cause as { code?: unknown; retryable?: unknown; message?: unknown } | null;
  const unavailable = source?.code === "unconfigured" || source?.code === "unauthorized" || source?.code === "forbidden";
  return new PiAgentAdapterError({ code: unavailable ? "provider-unavailable" : "provider-failed", message: typeof source?.message === "string" ? source.message : "Pi Agent 运行失败。", retryable: unavailable ? false : source?.retryable !== false, cause });
}
function abortError(): Error { const error = new Error("Provider stream aborted."); error.name = "AbortError"; return error; }
