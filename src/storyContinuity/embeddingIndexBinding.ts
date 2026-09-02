export type EmbeddingProtocol = "openai-compatible" | "ollama-native";
export type EmbeddingIndexStatus = "building" | "ready" | "failed" | "superseded";

export type EmbeddingBindingIdentity = {
  providerInstanceId: string;
  protocol: EmbeddingProtocol;
  preset: string;
  endpointIdentity: string;
  modelId: string;
  modelRevision: string;
  dimensions: number;
  encoding: string;
  normalization: string;
  distanceMetric: string;
  adapterVersion: string;
  chunkingRecipe: string;
  chunkingVersion: string;
};

export type EmbeddingIndexManifest = EmbeddingBindingIdentity & {
  version: "tianyan-embedding-index-manifest/v1";
  indexGenerationId: string;
  datasetId: string;
  createdAt: string;
  status: EmbeddingIndexStatus;
  sourceBoundary: {
    documentIds: string[];
    versionIds: string[];
    boundaryDigest: string;
  };
};

export const EMBEDDING_INDEX_REBUILD_MESSAGE = "此数据集已绑定另一 Embedding 配置；需要重建新索引后才能切换。";

const identityFields: ReadonlyArray<keyof EmbeddingBindingIdentity> = [
  "providerInstanceId",
  "protocol",
  "preset",
  "endpointIdentity",
  "modelId",
  "modelRevision",
  "dimensions",
  "encoding",
  "normalization",
  "distanceMetric",
  "adapterVersion",
  "chunkingRecipe",
  "chunkingVersion"
];

export function createEmbeddingIndexManifest(input: Omit<EmbeddingIndexManifest, "version">): EmbeddingIndexManifest {
  const manifest: EmbeddingIndexManifest = { version: "tianyan-embedding-index-manifest/v1", ...input };
  validateEmbeddingIndexManifest(manifest);
  return Object.freeze({
    ...manifest,
    sourceBoundary: Object.freeze({
      documentIds: Object.freeze([...manifest.sourceBoundary.documentIds]) as unknown as string[],
      versionIds: Object.freeze([...manifest.sourceBoundary.versionIds]) as unknown as string[],
      boundaryDigest: manifest.sourceBoundary.boundaryDigest
    })
  });
}

export function embeddingBindingFingerprint(identity: EmbeddingBindingIdentity): string {
  validateEmbeddingBindingIdentity(identity);
  return identityFields.map((field) => `${field}:${String(identity[field])}`).join("|");
}

export function compareEmbeddingBindings(current: EmbeddingBindingIdentity, requested: EmbeddingBindingIdentity): { compatible: boolean; mismatches: string[] } {
  validateEmbeddingBindingIdentity(current);
  validateEmbeddingBindingIdentity(requested);
  const mismatches = identityFields.filter((field) => current[field] !== requested[field]);
  return { compatible: mismatches.length === 0, mismatches };
}

export function guardDatasetEmbeddingBinding(manifest: EmbeddingIndexManifest, requested: EmbeddingBindingIdentity): { allowed: boolean; requiresRebuild: boolean; message: string | null; mismatches: string[] } {
  validateEmbeddingIndexManifest(manifest);
  const comparison = compareEmbeddingBindings(manifest, requested);
  return comparison.compatible
    ? { allowed: true, requiresRebuild: false, message: null, mismatches: [] }
    : { allowed: false, requiresRebuild: true, message: EMBEDDING_INDEX_REBUILD_MESSAGE, mismatches: comparison.mismatches };
}

export function assertDatasetEmbeddingCompatible(manifest: EmbeddingIndexManifest, requested: EmbeddingBindingIdentity): void {
  const result = guardDatasetEmbeddingBinding(manifest, requested);
  if (!result.allowed) throw new Error(EMBEDDING_INDEX_REBUILD_MESSAGE);
}

/** A global default is only a future-index preference; existing bindings are immutable. */
export function changeGlobalEmbeddingDefault<T extends { datasetId: string; manifest: EmbeddingIndexManifest }>(input: {
  currentDefault: EmbeddingBindingIdentity | null;
  nextDefault: EmbeddingBindingIdentity;
  datasetBindings: T[];
}): { defaultEmbedding: EmbeddingBindingIdentity; datasetBindings: T[] } {
  validateEmbeddingBindingIdentity(input.nextDefault);
  input.datasetBindings.forEach((binding) => validateEmbeddingIndexManifest(binding.manifest));
  return { defaultEmbedding: { ...input.nextDefault }, datasetBindings: input.datasetBindings.map((binding) => ({ ...binding, manifest: binding.manifest })) };
}

export function validateEmbeddingIndexManifest(value: EmbeddingIndexManifest): void {
  if (value?.version !== "tianyan-embedding-index-manifest/v1") throw new TypeError("Embedding index manifest version is invalid.");
  validateId(value.indexGenerationId, "indexGenerationId");
  validateId(value.datasetId, "datasetId");
  validateEmbeddingBindingIdentity(value);
  if (!["building", "ready", "failed", "superseded"].includes(value.status)) throw new TypeError("Embedding index status is invalid.");
  if (!validDate(value.createdAt)) throw new TypeError("Embedding index createdAt is invalid.");
  if (!value.sourceBoundary || !Array.isArray(value.sourceBoundary.documentIds) || !Array.isArray(value.sourceBoundary.versionIds)) throw new TypeError("Embedding source boundary is invalid.");
  value.sourceBoundary.documentIds.forEach((id) => validateId(id, "documentId"));
  value.sourceBoundary.versionIds.forEach((id) => validateId(id, "versionId"));
  validateText(value.sourceBoundary.boundaryDigest, "boundaryDigest");
}

function validateEmbeddingBindingIdentity(value: EmbeddingBindingIdentity): void {
  validateId(value.providerInstanceId, "providerInstanceId");
  if (!["openai-compatible", "ollama-native"].includes(value.protocol)) throw new TypeError("Embedding protocol is invalid.");
  for (const field of ["preset", "endpointIdentity", "modelId", "modelRevision", "encoding", "normalization", "distanceMetric", "adapterVersion", "chunkingRecipe", "chunkingVersion"] as const) validateText(value[field], field);
  if (!Number.isInteger(value.dimensions) || value.dimensions < 1 || value.dimensions > 1_000_000) throw new TypeError("Embedding dimensions are invalid.");
}

function validateId(value: string, field: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u.test(value)) throw new TypeError(`${field} is invalid.`);
}

function validateText(value: string, field: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\r\n\0]/u.test(value)) throw new TypeError(`${field} is invalid.`);
}

function validDate(value: string): boolean { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
