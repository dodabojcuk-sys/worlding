/**
 * Pi Agent 的可替换运行底座合同。
 *
 * 适配器没有故事事实、会话事实或作者确认权。它只执行领域层显式授权的能力，
 * 并返回候选与运行回执；领域层决定是否审查、持久化或写入任何内容。
 */
export type PiAgentContextReference = {
  id: string;
  kind: "source" | "object" | "event" | "selection" | "receipt";
  version?: string;
};

export type PiAgentCapabilityGrant = {
  capability: string;
  mode: "read" | "propose" | "execute";
};

export type PiAgentRunRequest = {
  operationId: string;
  prompt: string;
  context: readonly PiAgentContextReference[];
  grants: readonly PiAgentCapabilityGrant[];
  budget?: { maxTokens?: number; maxSteps?: number };
};

export type PiAgentProposal = {
  kind: string;
  payload: unknown;
  evidence: readonly PiAgentContextReference[];
  uncertainty?: string;
};

export type PiAgentReceipt = {
  operationId: string;
  status: "completed" | "cancelled" | "failed";
  adapterId: string;
  startedAt: string;
  completedAt?: string;
  message?: string;
};

export type PiAgentRunResult = {
  proposals: readonly PiAgentProposal[];
  receipt: PiAgentReceipt;
};

export interface PiAgentAdapter {
  readonly id: string;
  run(request: PiAgentRunRequest): Promise<PiAgentRunResult>;
  cancel?(operationId: string): Promise<PiAgentReceipt>;
  resume?(operationId: string): Promise<PiAgentRunResult>;
}
