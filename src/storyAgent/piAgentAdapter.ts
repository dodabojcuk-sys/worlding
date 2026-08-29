/** Replaceable Pi infrastructure adapter; product facts stay in AgentRuntimePort. */
export type PiTextStreamEvent =
  | { type: "text-delta"; delta: string; sequence: number; recordedAt: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string; sequence: number; recordedAt: string }
  | { type: "tool-call-end"; toolCallId: string; toolName: string; isError: boolean; sequence: number; recordedAt: string };

export type PiProviderUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type PiTextProviderEvent =
  | { type: "chunk"; text: string; finishReason: string | null; usage: PiProviderUsage | null }
  | { type: "tool-call"; id: string; name: string; arguments: Record<string, unknown> };
export type PiTextProviderStream = { traceId: string | null; events: AsyncIterable<PiTextProviderEvent> };
export type PiTextAgentTool = {
  name: string;
  label: string;
  description: string;
  execute(input: { toolCallId: string; arguments: Record<string, unknown>; signal?: AbortSignal }): Promise<Record<string, unknown>>;
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
  authorizeTool?(input: { toolName: string; arguments: Record<string, unknown> }): Promise<{ allowed: boolean; reason?: string }>;
  openProviderStream(input: { messages: Array<{ role: "system" | "user" | "assistant"; content: string }>; providerCall: number; retry: boolean; signal?: AbortSignal }): Promise<PiTextProviderStream>;
  onEvent?(event: PiTextStreamEvent): Promise<void> | void;
};
export type PiTextAgentResult = { text: string; providerCalls: number; traceId: string | null; usage: PiProviderUsage; latencyMs: number };

export class PiAgentAdapterError extends Error {
  readonly code: "cancelled" | "provider-unavailable" | "provider-failed" | "tool-denied" | "unknown";
  readonly retryable: boolean;
  constructor(input: { code: PiAgentAdapterError["code"]; message: string; retryable: boolean; cause?: unknown }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "PiAgentAdapterError";
    this.code = input.code;
    this.retryable = input.retryable;
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
    let usage: PiProviderUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const emit = async (event: Omit<PiTextStreamEvent, "sequence" | "recordedAt">) => {
      sequence += 1;
      await request.onEvent?.({ ...event, sequence, recordedAt: now() } as PiTextStreamEvent);
    };
    const tools = (request.tools ?? []).map((tool) => ({
      name: tool.name, label: tool.label, description: tool.description, parameters: Type.Object({}, { additionalProperties: true }),
      execute: async (toolCallId: string, args: Record<string, unknown>, signal?: AbortSignal) => ({ content: [{ type: "text" as const, text: JSON.stringify(await tool.execute({ toolCallId, arguments: args, signal })) }], details: { owner: "product-agent-runtime", toolName: tool.name } })
    }));
    const agent = new Agent({
      initialState: { systemPrompt: request.systemPrompt, model, thinkingLevel: "off", tools },
      sessionId: `${request.projectId}:${request.workVersionId}:${request.sessionId}`,
      toolExecution: "sequential",
      maxRetryDelayMs: 0,
      beforeToolCall: async ({ toolCall }) => {
        const decision = await request.authorizeTool?.({ toolName: toolCall.name, arguments: toolCall.arguments }) ?? { allowed: false, reason: "工具调用没有通过产品审批边界。" };
        return decision.allowed ? undefined : { block: true, terminate: true, reason: decision.reason ?? "工具调用没有通过产品审批边界。" };
      },
      streamFn: async (_selectedModel, context, options = {}) => {
        providerCalls += 1;
        const stream = new AssistantMessageEventStream();
        void bridgeProviderStream({ stream, request, messages: toGatewayMessages(request.systemPrompt, context.messages, contentText), providerCall: providerCalls, retry: request.retry || providerCalls > 1, signal: options.signal, model, onTrace(value) { traceId = value; }, onUsage(value) { usage = value; } });
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

async function bridgeProviderStream(input: { stream: { push(event: unknown): void; end(result?: unknown): void }; request: PiTextAgentRequest; messages: Array<{ role: "system" | "user" | "assistant"; content: string }>; providerCall: number; retry: boolean; signal?: AbortSignal; model: { api: "openai-completions"; provider: string; id: string }; onTrace(value: string | null): void; onUsage(value: PiProviderUsage): void }) {
  const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
  let text = "";
  let toolCall: { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> } | null = null;
  let usage = emptyUsage();
  const base = () => ({ role: "assistant" as const, content: toolCall ? [toolCall] : [{ type: "text" as const, text }], api: input.model.api, provider: input.model.provider, model: input.model.id, usage, stopReason: "pending" as const, timestamp: Date.now() });
  try {
    if (input.signal?.aborted) throw abortError();
    input.stream.push({ type: "start", partial: { ...base(), content: [] } });
    input.stream.push({ type: "text_start", contentIndex: 0, partial: base() });
    const provider = await input.request.openProviderStream({ messages: input.messages, providerCall: input.providerCall, retry: input.retry, signal: input.signal });
    input.onTrace(provider.traceId);
    let finishReason = "stop";
    for await (const event of provider.events) {
      if (input.signal?.aborted) throw abortError();
      if (event.type === "tool-call") {
        toolCall = { type: "toolCall", id: event.id, name: event.name, arguments: event.arguments };
        input.stream.push({ type: "toolcall_start", contentIndex: 0, partial: base() });
        input.stream.push({ type: "toolcall_delta", contentIndex: 0, delta: JSON.stringify(event.arguments), partial: base() });
        input.stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: base() });
        finishReason = "toolUse";
        continue;
      }
      if (event.text) { text += event.text; input.stream.push({ type: "text_delta", contentIndex: 0, delta: event.text, partial: base() }); }
      if (event.finishReason) finishReason = event.finishReason;
      if (event.usage) { input.onUsage(event.usage); usage = { ...usage, input: event.usage.promptTokens, output: event.usage.completionTokens, totalTokens: event.usage.totalTokens }; }
    }
    const message = { ...base(), stopReason: toolCall ? "toolUse" as const : finishReason === "length" ? "length" as const : "stop" as const };
    if (!toolCall) input.stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
    input.stream.push({ type: "done", reason: message.stopReason, message });
    input.stream.end(message);
  } catch (cause) {
    const cancelled = input.signal?.aborted || (cause instanceof Error && cause.name === "AbortError");
    const error = { ...base(), stopReason: cancelled ? "aborted" as const : "error" as const, errorMessage: cause instanceof Error ? cause.message : "Provider stream failed." };
    input.stream.push({ type: "error", reason: error.stopReason, error });
    input.stream.end(error);
  }
}

function toGatewayMessages(systemPrompt: string, messages: readonly any[], contentText: (content: any) => string): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const result: Array<{ role: "system" | "user" | "assistant"; content: string }> = [{ role: "system", content: systemPrompt }];
  for (const message of messages) {
    const text = message.role === "toolResult" ? `Tool ${message.toolName} result: ${contentText(message.content)}` : contentText(message.content);
    if (text.trim()) result.push({ role: message.role === "assistant" ? "assistant" : "user", content: text.trim() });
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
