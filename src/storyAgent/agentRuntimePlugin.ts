/**
 * Stable host-side ABI for selectable Agent runtimes.
 *
 * This module deliberately contains no SDK import. Product UI, Session,
 * Provider Gateway, Workspace and author-control code may depend on this
 * contract, while a built-in plugin owns any upstream runtime integration.
 */
export const AGENT_RUNTIME_HOST_API_VERSION = "1.0.0" as const;

export type AgentRuntimeCapability = "text-stream" | "native-tool-frames" | "cancel" | "resume" | "author-approval";
export type AgentRuntimeStreamEvent =
  | { type: "response-metadata"; responseModelId: string; sequence: number; recordedAt: string }
  | { type: "text-delta"; delta: string; sequence: number; recordedAt: string }
  | { type: "tool-call-start"; toolCallId: string; toolName: string; sequence: number; recordedAt: string }
  | { type: "tool-call-end"; toolCallId: string; toolName: string; isError: boolean; sequence: number; recordedAt: string };
export type AgentRuntimeUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type AgentRuntimeProviderEvent =
  | { type: "response-metadata"; responseModelId: string }
  | { type: "chunk"; text: string; finishReason: string | null; usage: AgentRuntimeUsage | null }
  | { type: "tool-call-start"; id: string; name: string; index: number }
  | { type: "tool-call-delta"; id: string; name: string; index: number; argumentsDelta: string }
  | { type: "tool-call-end"; id: string; name: string; index: number; argumentsJson: string; arguments: Record<string, unknown> }
  | { type: "tool-call-malformed"; id: string | null; name: string | null; index: number; argumentsJson: string; reason: string }
  | { type: "tool-call-aborted"; id: string | null; name: string | null; index: number; reason: string }
  | { type: "done" };
export type AgentRuntimeProviderStream = { traceId: string | null; events: AsyncIterable<AgentRuntimeProviderEvent> };
export type AgentRuntimeGatewayMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: Array<{ id: string; name: string; argumentsJson: string }> }
  | { role: "tool"; toolCallId: string; name: string; content: string };
export type AgentRuntimeTool = {
  name: string;
  label: string;
  description: string;
  inputSchema?: { type: "object"; required?: string[]; properties?: Record<string, unknown>; additionalProperties?: boolean };
  execute(input: { toolCallId: string; arguments: Record<string, unknown>; approvalReceiptId: string | null; signal?: AbortSignal }): Promise<Record<string, unknown>>;
};
export type AgentRuntimeRequest = {
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
  tools?: readonly AgentRuntimeTool[];
  requiredToolName?: string | null;
  authorizeTool?(input: { toolName: string; arguments: Record<string, unknown> }): Promise<{ allowed: boolean; reason?: string; approvalRequired?: boolean; approvalReceiptId?: string }>;
  openProviderStream(input: { messages: AgentRuntimeGatewayMessage[]; tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>; toolChoice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } }; providerCall: number; retry: boolean; signal?: AbortSignal }): Promise<AgentRuntimeProviderStream>;
  onEvent?(event: AgentRuntimeStreamEvent): Promise<void> | void;
};
export type AgentRuntimeResult = { text: string; providerCalls: number; traceId: string | null; responseModelId: string | null; usage: AgentRuntimeUsage | null; latencyMs: number };
export type AgentRuntimeErrorCode = "cancelled" | "provider-unavailable" | "provider-failed" | "tool-denied" | "tool-approval-required" | "invalid-tool-call" | "unknown";

export class AgentRuntimePluginError extends Error {
  readonly code: AgentRuntimeErrorCode;
  readonly retryable: boolean;
  readonly toolCall: { toolName: string; arguments: Record<string, unknown> } | null;
  constructor(input: { code: AgentRuntimeErrorCode; message: string; retryable: boolean; cause?: unknown; toolCall?: { toolName: string; arguments: Record<string, unknown> } }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "AgentRuntimePluginError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.toolCall = input.toolCall ? structuredClone(input.toolCall) : null;
  }
}

export type AgentRuntimeEngine = {
  run(request: AgentRuntimeRequest): Promise<AgentRuntimeResult>;
  cancel(input: { projectId: string; workVersionId: string; sessionId: string; runId: string }): boolean;
  dispose?(): void | Promise<void>;
};
export type AgentRuntimePluginManifest = {
  id: string;
  pluginVersion: string;
  upstreamVersion: string;
  hostApiRange: string;
  capabilities: readonly AgentRuntimeCapability[];
};
export type AgentRuntimePluginHealth = { status: "healthy" | "degraded" | "unavailable"; message: string | null };
export type AgentRuntimeHostApi = { version: typeof AGENT_RUNTIME_HOST_API_VERSION };
export type AgentRuntimePlugin = {
  manifest: AgentRuntimePluginManifest;
  createRuntime(host: AgentRuntimeHostApi): AgentRuntimeEngine;
  dispose?(runtime: AgentRuntimeEngine): void | Promise<void>;
  health(): AgentRuntimePluginHealth | Promise<AgentRuntimePluginHealth>;
};
