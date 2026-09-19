/**
 * 索引资格分区（R3.1）：在任何远程 Embedding / Reranker 调用之前，
 * 对每个语义块做确定性的出站资格判定。纯函数、无 IO、无模型调用。
 *
 * 默认策略（宁保守、不静默升级）：
 * - 显式禁止索引 / DO_NOT_INDEX 标签          → DO_NOT_INDEX
 * - 作者备注 / 作者秘密（author-note）          → LOCAL_ONLY
 * - 角色私密记忆（character-memory）           → LOCAL_ONLY
 * - 传闻 · 不确定（rumor）                     → LEXICAL_ONLY
 * - 未知性质（无法分类）                        → LEXICAL_ONLY（不得静默视为可远程）
 * - 其余世界资料                               → PROJECT_REMOTE_ALLOWED（按项目隐私策略，
 *   projectPrivacyPolicy="local" 时降为 LEXICAL_ONLY）
 * - 公共参考（信息来源本身为公共参考文档）        → PUBLIC_REMOTE_ALLOWED
 */

export type IndexEligibility =
  | "PUBLIC_REMOTE_ALLOWED"
  | "PROJECT_REMOTE_ALLOWED"
  | "LOCAL_ONLY"
  | "LEXICAL_ONLY"
  | "DO_NOT_INDEX";

export type ProjectPrivacyPolicy = "public" | "private" | "local";

export interface IndexEligibilityInput {
  informationNature: string | null;
  objectType: string;
  tags: readonly string[];
  status?: string;
  /** 显式禁止索引（来源：作者对对象的显式标记或管理动作）。 */
  explicitForbidden?: boolean;
  /** 项目隐私策略；缺省按 private（保守）处理。 */
  projectPrivacyPolicy?: ProjectPrivacyPolicy;
}

export interface IndexEligibilityDecision {
  eligibility: IndexEligibility;
  reason: string;
}

const FORBIDDEN_TAG = "禁止索引";

export function resolveIndexEligibility(input: IndexEligibilityInput): IndexEligibilityDecision {
  const tags = (input.tags ?? []).map((tag) => tag.trim());
  if (input.explicitForbidden === true || tags.includes(FORBIDDEN_TAG)) {
    return { eligibility: "DO_NOT_INDEX", reason: "显式禁止索引。" };
  }
  if (input.informationNature === "author-note") {
    return { eligibility: "LOCAL_ONLY", reason: "作者备注/作者秘密只允许本地处理。" };
  }
  if (input.objectType === "character-memory") {
    return { eligibility: "LOCAL_ONLY", reason: "角色私密记忆只允许本地处理。" };
  }
  if (input.informationNature === "rumor") {
    return { eligibility: "LEXICAL_ONLY", reason: "传闻与不确定内容只参与词法检索。" };
  }
  if (input.informationNature === null || input.informationNature === undefined || input.informationNature === "unknown") {
    return { eligibility: "LEXICAL_ONLY", reason: "信息性质未知；保守地只做词法检索，不静默升级为可远程。" };
  }
  // fail-closed：项目隐私策略未知/未配置时，项目内容保守地只做词法检索，
  // 不得自动升级为 PROJECT_REMOTE_ALLOWED（真实 Embedding 接入前的前置边界）。
  const policy = input.projectPrivacyPolicy ?? "unknown";
  if (policy === "unknown" || policy === "local") {
    return { eligibility: "LEXICAL_ONLY", reason: policy === "local" ? "项目隐私策略为本地。" : "项目隐私策略未知；fail-closed 只做词法检索。" };
  }
  if (policy === "local") {
    return { eligibility: "LEXICAL_ONLY", reason: "项目隐私策略为本地。" };
  }
  if (policy === "private") {
    return { eligibility: "PROJECT_REMOTE_ALLOWED", reason: "项目内容；仅可发送到项目绑定的 Provider。" };
  }
  return { eligibility: "PUBLIC_REMOTE_ALLOWED", reason: "公共世界资料；可远程或本地。" };
}

/** 出站判定：只有这两种资格允许把文本发送到远程 Embedding/Reranker。 */
export function mayLeaveDevice(decision: IndexEligibilityDecision): boolean {
  return decision.eligibility === "PUBLIC_REMOTE_ALLOWED" || decision.eligibility === "PROJECT_REMOTE_ALLOWED";
}

/** 远程通道的候选过滤：本地/词法/禁止 内容一律不出站（reranker 同样适用）。 */
export function remoteEligibleChunks<T extends { eligibility?: IndexEligibilityDecision }>(chunks: readonly T[]): T[] {
  return chunks.filter((chunk) => {
    const decision = (chunk as { eligibility?: IndexEligibilityDecision }).eligibility;
    if (!decision) return false;
    return mayLeaveDevice(decision);
  });
}

/** 日志脱敏：任何日志只允许出现标题与长度，不打印正文。 */
export function redactForLog(entry: { title: string; lexicalText?: string }): string {
  return `${entry.title}（正文 ${entry.lexicalText?.length ?? 0} 字符，未记录）`;
}
