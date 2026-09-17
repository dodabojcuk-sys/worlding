/**
 * Embedding / Reranker Profile 合同（R3）：provider-agnostic 的只读配置。
 * 只保存 Provider Profile 引用（providerProfileId），永不保存明文凭据；
 * 模型未配置时调用方必须呈现诚实不可用状态，不得伪造向量结果。
 */

export const EMBEDDING_PROFILE_VERSION = "tianyan-embedding-profile/v1" as const;
export const RERANKER_PROFILE_VERSION = "tianyan-reranker-profile/v1" as const;

export type DistanceMetric = "cosine" | "dot" | "euclidean";

export interface EmbeddingProfile {
  profileId: string;
  providerProfileId: string | null;
  modelId: string | null;
  dimensions: number | null;
  maxInputTokens: number | null;
  distanceMetric: DistanceMetric;
  supportsDense: boolean;
  supportsSparse: boolean;
  supportsMultiVector: boolean;
  queryInstruction: string | null;
  passageInstruction: string | null;
}

export interface RerankerProfile {
  profileId: string;
  providerProfileId: string | null;
  modelId: string | null;
  maxPairs: number | null;
}

export interface EmbeddingProfileValidation {
  ok: boolean;
  problems: string[];
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/iu;

export function validateEmbeddingProfile(profile: EmbeddingProfile): EmbeddingProfileValidation {
  const problems: string[] = [];
  if (!ID_PATTERN.test(profile.profileId)) problems.push("profileId 非法。");
  if (profile.supportsDense && (!profile.modelId || !profile.dimensions || profile.dimensions <= 0)) problems.push("支持 dense 时必须声明 modelId 与正数 dimensions。");
  if (profile.supportsDense && !profile.providerProfileId) problems.push("支持 dense 时必须引用 providerProfileId（只存引用，不存凭据）。");
  if (profile.maxInputTokens !== null && profile.maxInputTokens <= 0) problems.push("maxInputTokens 必须为正数。");
  if (profile.supportsMultiVector && !profile.supportsDense) problems.push("multi-vector 依赖 dense 通道。");
  return { ok: problems.length === 0, problems };
}

export function validateRerankerProfile(profile: RerankerProfile): EmbeddingProfileValidation {
  const problems: string[] = [];
  if (!ID_PATTERN.test(profile.profileId)) problems.push("profileId 非法。");
  if (profile.modelId && !profile.providerProfileId) problems.push("声明 modelId 时必须引用 providerProfileId。");
  if (profile.maxPairs !== null && profile.maxPairs <= 0) problems.push("maxPairs 必须为正数。");
  return { ok: problems.length === 0, problems };
}

/** 未配置任何 Embedding Profile 时的诚实默认值：全部能力关闭，只留精确/关键词检索。 */
export function emptyEmbeddingProfile(): EmbeddingProfile {
  return { profileId: "none", providerProfileId: null, modelId: null, dimensions: null, maxInputTokens: null, distanceMetric: "cosine", supportsDense: false, supportsSparse: false, supportsMultiVector: false, queryInstruction: null, passageInstruction: null };
}
