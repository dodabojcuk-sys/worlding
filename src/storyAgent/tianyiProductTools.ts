import type { AgentRuntimeTool } from "./agentRuntimePlugin.ts";
import type { WorkspacePathPolicy } from "../storyWorkspace/workspacePathPolicy.ts";

type Scope = { projectId: string; workVersionId: string; sessionId: string; runId: string };
type EventGraphDirection = "forward" | "reverse" | "both" | "none";

export function createTianyiProductTools(input: {
  scope: Scope;
  workspacePathPolicy?: WorkspacePathPolicy;
  createArtifact(command: { projectId: string; workVersionId: string; type: string; title: string; content: string; generationBrief: Record<string, unknown> }): Promise<{ id: string; relativeId: string }> | { id: string; relativeId: string };
  createEntityProposal(command: { projectId: string; sessionId: string; runId: string; workVersionId: string; kind: "character" | "item" | "location"; title: string; sourceReceiptId: string }): Promise<{ proposalId: string; status: string }>;
  createEventGraphCandidate(command: { projectId: string; workVersionId: string; sessionId: string; runId: string; sourceEventId: string; targetEventId: string; relationTypeId: string; direction: EventGraphDirection; sourceReceiptId: string }): Promise<{ relationId: string; reviewState: "candidate" }>;
}): AgentRuntimeTool[] {
  const scope = structuredClone(input.scope);
  return [{
    name: "create_artifact",
    label: "创建普通创作产物",
    description: "在现有 Workspace repository 管理的正式 artifact 区创建普通产物；不会写入 Canon。",
    inputSchema: { type: "object", required: ["type", "title", "content"], properties: { type: { type: "string", maxLength: 32 }, title: { type: "string", maxLength: 100 }, content: { type: "string", maxLength: 12_000 } }, additionalProperties: false },
    async execute(call) {
      const sourceReceiptId = requireApproval(call.approvalReceiptId);
      const type = requireArtifactType(call.arguments.type);
      const title = requireBoundedString(call.arguments.title, "普通产物标题", 100);
      const content = requireBoundedString(call.arguments.content, "普通产物正文", 12_000);
      const artifact = await input.createArtifact({
        projectId: scope.projectId,
        workVersionId: scope.workVersionId,
        type,
        title,
        content,
        generationBrief: { owner: "tianyi-agent-runtime", projectId: scope.projectId, workVersionId: scope.workVersionId, runId: scope.runId, sourceReceiptId }
      });
      input.workspacePathPolicy?.assertArtifactRelativePath({ projectId: scope.projectId, artifactId: artifact.id, relativeId: artifact.relativeId });
      return { artifactId: artifact.id, relativeId: artifact.relativeId, projectId: scope.projectId, workVersionId: scope.workVersionId, runId: scope.runId, sourceReceiptId, canonStatus: "not-canon" };
    }
  }, {
    name: "propose_entity_candidate",
    label: "提议人物或资料候选",
    description: "只向现有 Agent Recognition Proposal owner 创建待确认候选；不会确认候选。",
    inputSchema: { type: "object", required: ["kind", "title"], properties: { kind: { type: "string", maxLength: 48 }, title: { type: "string", maxLength: 160 } }, additionalProperties: false },
    async execute(call) {
      const sourceReceiptId = requireApproval(call.approvalReceiptId);
      const kind = requireProposalKind(call.arguments.kind);
      const title = requireBoundedString(call.arguments.title, "候选标题", 160);
      const proposal = await input.createEntityProposal({ ...scope, kind, title, sourceReceiptId });
      if (proposal.status !== "pending" && proposal.status !== "edited") throw new Error("候选 owner 返回了非待确认状态。");
      return { ...proposal, projectId: scope.projectId, workVersionId: scope.workVersionId, runId: scope.runId, sourceReceiptId };
    }
  }, {
    name: "submit_event_graph_candidate",
    label: "提交事件关系候选",
    description: "只在既有 Relation owner 中创建待确认关系；不会确认、不会写入 Canon。",
    inputSchema: { type: "object", required: ["sourceEventId", "targetEventId", "relationTypeId"], properties: { sourceEventId: { type: "string", maxLength: 160 }, targetEventId: { type: "string", maxLength: 160 }, relationTypeId: { type: "string", maxLength: 160 }, direction: { type: "string", maxLength: 16 } }, additionalProperties: false },
    async execute(call) {
      const sourceReceiptId = requireApproval(call.approvalReceiptId);
      const sourceEventId = requireBoundedString(call.arguments.sourceEventId, "来源事件", 160);
      const targetEventId = requireBoundedString(call.arguments.targetEventId, "目标事件", 160);
      if (sourceEventId === targetEventId) throw new Error("事件关系候选必须连接两条不同的正式事件。");
      const relationTypeId = requireBoundedString(call.arguments.relationTypeId, "关系类型", 160);
      const direction = requireEventGraphDirection(call.arguments.direction);
      const relation = await input.createEventGraphCandidate({ ...scope, sourceEventId, targetEventId, relationTypeId, direction, sourceReceiptId });
      if (relation.reviewState !== "candidate") throw new Error("Relation owner 返回了非待确认状态。");
      return { ...relation, projectId: scope.projectId, workVersionId: scope.workVersionId, runId: scope.runId, sourceReceiptId, canonStatus: "not-canon" };
    }
  }];
}

function requireApproval(value: string | null): string {
  if (typeof value !== "string" || !/^receipt\.tianyi-agent-approval\.[a-f0-9]{24}$/u.test(value)) throw new Error("受控产品工具缺少有效的作者审批回执。");
  return value;
}

function requireArtifactType(value: unknown): string {
  if (typeof value !== "string" || !["screenplay", "storyboard", "comic", "motion-comic", "interactive-drama"].includes(value)) throw new Error("普通产物类型不受支持；小说正文必须继续由现有 DocumentModel 编辑 owner 创建。");
  return value;
}

function requireProposalKind(value: unknown): "character" | "item" | "location" {
  if (value !== "character" && value !== "item" && value !== "location") throw new Error("该候选类型没有安全的现有资料 Owner。");
  return value;
}

function requireEventGraphDirection(value: unknown): EventGraphDirection {
  if (value === undefined || value === null || value === "") return "forward";
  if (value === "forward" || value === "reverse" || value === "both" || value === "none") return value;
  throw new Error("事件关系方向不受支持。");
}

function requireBoundedString(value: unknown, label: string, maximum: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maximum) throw new Error(`${label}为空或过长。`);
  return text;
}
