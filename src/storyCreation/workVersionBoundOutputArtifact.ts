export const WORK_VERSION_OUTPUT_ARTIFACT_SOURCE_SCHEMA = "tianyan-work-version-output-artifact-source/r0" as const;
export const CREATION_SOURCE_RECONCILIATION_RECEIPT_SCHEMA = "tianyan-creation-source-reconciliation-receipt/r0" as const;

export type CreationSourceReconciliationReceiptR0 = {
  schemaVersion: typeof CREATION_SOURCE_RECONCILIATION_RECEIPT_SCHEMA;
  artifactId: string;
  originalArtifactRevisionId: string;
  newArtifactRevisionId: string;
  sourceWorkVersionId: string;
  fromRevision: number;
  fromManifestDigest: string;
  toRevision: number;
  toManifestDigest: string;
  semanticDiffDigest: `sha256:${string}`;
  bodyDigestBefore: `sha256:${string}`;
  bodyDigestAfter: `sha256:${string}`;
  confirmedDifferenceIds: string[];
  unresolvedDifferenceIds: string[];
  idempotencyKey: string;
  executionStage: "artifact_revision_appended";
  expectedWorkVersionReceiptId: string;
  blockedReason: null;
  createdAt: string;
};

export type WorkVersionOutputArtifactSourceStatus =
  | "current"
  | "historical_valid"
  | "archived_valid"
  | "unverifiable_missing"
  | "unverifiable_corrupt";

export type WorkVersionOutputArtifactSourceR0 = {
  schemaVersion: typeof WORK_VERSION_OUTPUT_ARTIFACT_SOURCE_SCHEMA;
  sourceKind: "work-version";
  projectId: string;
  workVersionId: string;
  workVersionKind: "root";
  pinnedRevision: number;
  manifestId: string;
  manifestDigest: string;
  selectedStoryUnitRefs: Array<{ unitId: string; unitVersion: string }>;
  selectedEventRefs: Array<{ eventId: string; eventRevision: string }>;
  sourceAnchorRefs: string[];
  neutralStoryPackageId: string;
  neutralStoryPackageDigest: `sha256:${string}`;
  sourceOwnerReceiptRefs: string[];
  creationOperationReceipt: {
    operationId: string;
    idempotencyKey: string;
    payloadDigest: `sha256:${string}`;
  };
  sourceReconciliationReceipt?: CreationSourceReconciliationReceiptR0;
  createdAt: string;
};

export type WorkVersionOutputArtifactSourceValidation = {
  status: WorkVersionOutputArtifactSourceStatus;
  sourceReadable: true;
  sourceDependentOperationsAllowed: boolean;
  authorMessage: string;
  technicalReason: string | null;
};

export type WorkVersionSourceValidationInput = {
  binding: WorkVersionOutputArtifactSourceR0;
  currentVersion: {
    projectId: string;
    workVersionId: string;
    kind: "root" | "derived";
    status: "active" | "archived";
    currentRevision: number;
  } | null;
  pinnedManifest: {
    manifestId: string;
    projectId: string;
    workVersionId: string;
    versionRevision: number;
    canonicalDigest: string;
    stableReferenceIds: string[];
    provenanceReceiptIds: string[];
  } | null;
  currentSourceProjectionMatchesPinned?: boolean;
  integrity: "verified" | "missing" | "corrupt";
};

export function normalizeWorkVersionOutputArtifactSource(value: unknown): WorkVersionOutputArtifactSourceR0 | null {
  if (value == null) return null;
  const source = exactRecord(value, [
    "schemaVersion", "sourceKind", "projectId", "workVersionId", "workVersionKind",
    "pinnedRevision", "manifestId", "manifestDigest", "selectedStoryUnitRefs",
    "selectedEventRefs", "sourceAnchorRefs", "neutralStoryPackageId",
    "neutralStoryPackageDigest", "sourceOwnerReceiptRefs", "creationOperationReceipt",
    "createdAt", "sourceReconciliationReceipt"
  ], "WorkVersion OutputArtifact source", ["sourceReconciliationReceipt"]);
  if (source.schemaVersion !== WORK_VERSION_OUTPUT_ARTIFACT_SOURCE_SCHEMA) throw new Error("OutputArtifact WorkVersion source schema is unsupported.");
  if (source.sourceKind !== "work-version") throw new Error("OutputArtifact source kind must be work-version.");
  if (source.workVersionKind !== "root") throw new Error("This Creation slice accepts only the root WorkVersion as source.");
  const selectedStoryUnitRefs = requireReferenceList(source.selectedStoryUnitRefs, ["unitId", "unitVersion"], "Story Unit source reference", (entry) => ({
    unitId: requireText(entry.unitId, "Story Unit source identifier", 180),
    unitVersion: requireText(entry.unitVersion, "Story Unit source version", 180)
  }));
  if (selectedStoryUnitRefs.length === 0) throw new Error("At least one Story Unit source reference is required.");
  const selectedEventRefs = requireReferenceList(source.selectedEventRefs, ["eventId", "eventRevision"], "Event source reference", (entry) => ({
    eventId: requireText(entry.eventId, "Event source identifier", 180),
    eventRevision: requireText(entry.eventRevision, "Event source revision", 180)
  }));
  if (selectedEventRefs.length === 0) throw new Error("At least one Event source reference is required.");
  const operation = exactRecord(source.creationOperationReceipt, ["operationId", "idempotencyKey", "payloadDigest"], "Creation operation receipt");
  const sourceReconciliationReceipt = source.sourceReconciliationReceipt == null
    ? undefined
    : normalizeCreationSourceReconciliationReceipt(source.sourceReconciliationReceipt);
  return {
    schemaVersion: WORK_VERSION_OUTPUT_ARTIFACT_SOURCE_SCHEMA,
    sourceKind: "work-version",
    projectId: requireText(source.projectId, "Source Project identifier", 180),
    workVersionId: requireText(source.workVersionId, "Source WorkVersion identifier", 180),
    workVersionKind: "root",
    pinnedRevision: requirePositiveInteger(source.pinnedRevision, "Pinned WorkVersion revision"),
    manifestId: requireText(source.manifestId, "Source manifest identifier", 180),
    manifestDigest: requireDigest(source.manifestDigest, "Source manifest digest"),
    selectedStoryUnitRefs,
    selectedEventRefs,
    sourceAnchorRefs: requireTextList(source.sourceAnchorRefs, "Source anchor reference", true),
    neutralStoryPackageId: requireText(source.neutralStoryPackageId, "Neutral Story Package identifier", 180),
    neutralStoryPackageDigest: requirePrefixedDigest(source.neutralStoryPackageDigest, "Neutral Story Package digest"),
    sourceOwnerReceiptRefs: requireTextList(source.sourceOwnerReceiptRefs, "Source owner receipt", true),
    creationOperationReceipt: {
      operationId: requireText(operation.operationId, "Creation operation identifier", 180),
      idempotencyKey: requireText(operation.idempotencyKey, "Creation idempotency key", 180),
      payloadDigest: requirePrefixedDigest(operation.payloadDigest, "Creation payload digest")
    },
    ...(sourceReconciliationReceipt ? { sourceReconciliationReceipt } : {}),
    createdAt: requireTimestamp(source.createdAt)
  };
}

export function normalizeCreationSourceReconciliationReceipt(value: unknown): CreationSourceReconciliationReceiptR0 {
  const receipt = exactRecord(value, [
    "schemaVersion", "artifactId", "originalArtifactRevisionId", "newArtifactRevisionId",
    "sourceWorkVersionId", "fromRevision", "fromManifestDigest", "toRevision",
    "toManifestDigest", "semanticDiffDigest", "bodyDigestBefore", "bodyDigestAfter",
    "confirmedDifferenceIds", "unresolvedDifferenceIds", "idempotencyKey",
    "executionStage", "expectedWorkVersionReceiptId", "blockedReason", "createdAt"
  ], "Creation source reconciliation receipt");
  if (receipt.schemaVersion !== CREATION_SOURCE_RECONCILIATION_RECEIPT_SCHEMA) throw new Error("Creation source reconciliation receipt schema is unsupported.");
  if (receipt.executionStage !== "artifact_revision_appended") throw new Error("Creation source reconciliation receipt stage is invalid.");
  if (receipt.blockedReason !== null) throw new Error("A completed artifact reconciliation receipt cannot contain a blocked reason.");
  const fromRevision = requirePositiveInteger(receipt.fromRevision, "Source reconciliation from revision");
  const toRevision = requirePositiveInteger(receipt.toRevision, "Source reconciliation to revision");
  if (toRevision <= fromRevision) throw new Error("Source reconciliation must advance the pinned root revision.");
  const bodyDigestBefore = requirePrefixedDigest(receipt.bodyDigestBefore, "Source reconciliation body digest before");
  const bodyDigestAfter = requirePrefixedDigest(receipt.bodyDigestAfter, "Source reconciliation body digest after");
  if (bodyDigestBefore !== bodyDigestAfter) throw new Error("Source reconciliation cannot auto-rewrite the artifact body.");
  return {
    schemaVersion: CREATION_SOURCE_RECONCILIATION_RECEIPT_SCHEMA,
    artifactId: requireText(receipt.artifactId, "Source reconciliation artifact", 180),
    originalArtifactRevisionId: requireText(receipt.originalArtifactRevisionId, "Original artifact revision", 180),
    newArtifactRevisionId: requireText(receipt.newArtifactRevisionId, "New artifact revision", 180),
    sourceWorkVersionId: requireText(receipt.sourceWorkVersionId, "Source WorkVersion", 180),
    fromRevision,
    fromManifestDigest: requireDigest(receipt.fromManifestDigest, "Source reconciliation from manifest digest"),
    toRevision,
    toManifestDigest: requireDigest(receipt.toManifestDigest, "Source reconciliation to manifest digest"),
    semanticDiffDigest: requirePrefixedDigest(receipt.semanticDiffDigest, "Source reconciliation semantic diff digest"),
    bodyDigestBefore,
    bodyDigestAfter,
    confirmedDifferenceIds: requireTextList(receipt.confirmedDifferenceIds, "Confirmed semantic difference", true),
    unresolvedDifferenceIds: requireTextList(receipt.unresolvedDifferenceIds, "Unresolved semantic difference", false),
    idempotencyKey: requireText(receipt.idempotencyKey, "Source reconciliation idempotency key", 180),
    executionStage: "artifact_revision_appended",
    expectedWorkVersionReceiptId: requireText(receipt.expectedWorkVersionReceiptId, "Expected WorkVersion receipt", 180),
    blockedReason: null,
    createdAt: requireTimestamp(receipt.createdAt)
  };
}

export function projectWorkVersionOutputArtifactSourceValidation(input: WorkVersionSourceValidationInput): WorkVersionOutputArtifactSourceValidation {
  const binding = normalizeWorkVersionOutputArtifactSource(input.binding)!;
  if (input.integrity === "corrupt") return invalid("unverifiable_corrupt", "来源完整性检查失败", "WorkVersion integrity verification failed.");
  if (input.integrity === "missing" || !input.currentVersion || !input.pinnedManifest) return invalid("unverifiable_missing", "来源记录缺失", "A required WorkVersion or manifest reference is missing.");
  const current = input.currentVersion;
  const manifest = input.pinnedManifest;
  if (
    current.projectId !== binding.projectId ||
    current.workVersionId !== binding.workVersionId ||
    current.kind !== "root" ||
    manifest.projectId !== binding.projectId ||
    manifest.workVersionId !== binding.workVersionId ||
    manifest.manifestId !== binding.manifestId ||
    manifest.versionRevision !== binding.pinnedRevision ||
    manifest.canonicalDigest !== binding.manifestDigest
  ) return invalid("unverifiable_corrupt", "来源完整性检查失败", "The pinned WorkVersion identity, revision, manifest, or digest does not match.");

  const stableRefs = new Set(manifest.stableReferenceIds);
  const receiptRefs = new Set(manifest.provenanceReceiptIds);
  const missingStable = [
    ...binding.selectedStoryUnitRefs.map((item) => `story-unit:${item.unitId}`),
    ...binding.selectedEventRefs.map((item) => `event:${item.eventId}`),
    ...binding.sourceAnchorRefs
  ].filter((ref) => !stableRefs.has(ref));
  const missingReceipts = binding.sourceOwnerReceiptRefs.filter((ref) => !receiptRefs.has(ref));
  if (missingStable.length || missingReceipts.length) return invalid("unverifiable_missing", "来源记录缺失", `Pinned source references are missing: ${[...missingStable, ...missingReceipts].join(", ")}.`);
  if (current.status === "archived") return valid("archived_valid", "来源版本已归档，引用仍完整");
  if (current.currentRevision === binding.pinnedRevision || input.currentSourceProjectionMatchesPinned === true) return valid("current", "来源完整 · 当前作品主线");
  if (current.currentRevision > binding.pinnedRevision) return valid("historical_valid", `主线已有更新，本文仍基于第 ${binding.pinnedRevision} 版`);
  return invalid("unverifiable_corrupt", "来源完整性检查失败", "The current WorkVersion revision is older than the pinned source revision.");
}

function valid(status: "current" | "historical_valid" | "archived_valid", authorMessage: string): WorkVersionOutputArtifactSourceValidation {
  return { status, sourceReadable: true, sourceDependentOperationsAllowed: true, authorMessage, technicalReason: null };
}

function invalid(status: "unverifiable_missing" | "unverifiable_corrupt", authorMessage: string, technicalReason: string): WorkVersionOutputArtifactSourceValidation {
  return { status, sourceReadable: true, sourceDependentOperationsAllowed: false, authorMessage, technicalReason };
}

function exactRecord(value: unknown, keys: string[], label: string, optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  const unknown = actual.filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !optional.includes(key) && !actual.includes(key));
  if (unknown.length) throw new Error(`${label} contains unknown field: ${unknown.join(", ")}.`);
  if (missing.length) throw new Error(`${label} is missing field: ${missing.join(", ")}.`);
  return record;
}

function requireReferenceList<T>(value: unknown, keys: string[], label: string, project: (entry: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error(`${label} list is invalid.`);
  return value.map((entry) => project(exactRecord(entry, keys, label)));
}

function requireTextList(value: unknown, label: string, requireOne: boolean): string[] {
  if (!Array.isArray(value) || value.length > 512 || (requireOne && value.length === 0)) throw new Error(`${label} list is invalid.`);
  return [...new Set(value.map((entry) => requireText(entry, label, 240)))].sort();
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requirePositiveInteger(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} is invalid.`);
  return number;
}

function requireDigest(value: unknown, label: string): string {
  const digest = String(value ?? "").trim();
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} is invalid.`);
  return digest;
}

function requirePrefixedDigest(value: unknown, label: string): `sha256:${string}` {
  const digest = String(value ?? "").trim();
  if (!/^sha256:[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} is invalid.`);
  return digest as `sha256:${string}`;
}

function requireTimestamp(value: unknown): string {
  const timestamp = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(timestamp) || Number.isNaN(Date.parse(timestamp))) throw new Error("Source creation timestamp is invalid.");
  return timestamp;
}
