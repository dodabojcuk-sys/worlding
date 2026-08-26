import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_VERSION = "tianyan-replay-safe-provider-receipt-envelope/v1";
export const REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_STORE_VERSION = "tianyan-replay-safe-provider-receipt-envelope-store/v1";

const REPLAY_STATUSES = new Set([
  "reserved",
  "dispatched",
  "response_frozen",
  "strict_parse_failed",
  "tool_failed",
  "candidate_pending",
  "impact_pending",
  "completed",
  "timeout",
  "transport_failed",
  "cancelled"
]);

/**
 * Durable reference index for receipts owned by existing Tianyan boundaries.
 * The store never persists prompts, credentials or raw Provider response data.
 */
export function createReplaySafeProviderReceiptEnvelopeStore(options = {}) {
  const appDataRoot = path.resolve(options.appDataRoot || ".");
  const target = path.resolve(options.filePath || path.join(appDataRoot, "replay-safe-provider-receipt-envelopes-r0.json"));
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  initialize();

  return Object.freeze({
    begin(input) {
      const request = normalizeBegin(input, now());
      const state = readState(target);
      const existing = state.envelopes.find((item) => item.operationId === request.operationId);
      if (existing) {
        assertIntegrity(existing);
        if (existing.operationDigest !== request.operationDigest) throw envelopeError("REPLAY_ENVELOPE_IDEMPOTENCY_CONFLICT", "Envelope operation identity was reused with different semantics.");
        return Object.freeze({ reused: true, envelope: publicEnvelope(existing) });
      }
      const envelope = withIntegrity({
        schemaVersion: REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_VERSION,
        envelopeId: request.envelopeId,
        projectId: request.projectId,
        projectVersion: request.projectVersion,
        sessionId: request.sessionId,
        archiveRecordId: request.archiveRecordId,
        sourceAnchorIds: request.sourceAnchorIds,
        sourceRevision: request.sourceRevision,
        operationId: request.operationId,
        operationDigest: request.operationDigest,
        budgetReservationId: request.budgetReservationId,
        providerProfileRevision: request.providerProfileRevision,
        providerId: request.providerId,
        modelId: request.modelId,
        dispatchReceiptId: null,
        dispatchedAt: null,
        frozenResponseId: null,
        frozenResponseHash: null,
        frozenAt: null,
        strictProjectionId: null,
        strictProjectionSchema: null,
        strictProjectionStatus: null,
        toolReceiptIds: [],
        toolReceipts: [],
        candidateReceiptIds: [],
        impactReviewReceiptIds: [],
        usage: null,
        finishReason: null,
        errorClassification: null,
        completedAt: null,
        replayStatus: "reserved",
        createdAt: request.createdAt,
        updatedAt: request.createdAt
      });
      writeState(target, { ...state, revision: state.revision + 1, envelopes: [...state.envelopes, envelope] });
      return Object.freeze({ reused: false, envelope: publicEnvelope(envelope) });
    },

    markDispatched(input) {
      return update(input?.envelopeId, (current) => {
        const dispatchReceiptId = requiredText(input?.dispatchReceiptId, 240, "dispatchReceiptId");
        const dispatchedAt = optionalTimestamp(input?.dispatchedAt) || now();
        if (current.dispatchReceiptId) {
          assertSame(current.dispatchReceiptId, dispatchReceiptId, "dispatch receipt");
          return current;
        }
        assertStatus(current, ["reserved"]);
        return { ...current, dispatchReceiptId, dispatchedAt, replayStatus: "dispatched", updatedAt: dispatchedAt };
      });
    },

    freezeResponse(input) {
      assertNoPrivatePayload(input);
      return update(input?.envelopeId, (current) => {
        const frozenResponseId = requiredText(input?.frozenResponseId, 240, "frozenResponseId");
        const frozenResponseHash = requiredHash(input?.frozenResponseHash, "frozenResponseHash");
        const frozenAt = optionalTimestamp(input?.frozenAt) || now();
        if (current.frozenResponseId) {
          assertSame(current.frozenResponseId, frozenResponseId, "frozen response");
          assertSame(current.frozenResponseHash, frozenResponseHash, "frozen response hash");
          return current;
        }
        assertStatus(current, ["dispatched"]);
        return {
          ...current,
          frozenResponseId,
          frozenResponseHash,
          frozenAt,
          usage: normalizeUsage(input?.usage),
          finishReason: optionalText(input?.finishReason, 120),
          replayStatus: "response_frozen",
          updatedAt: frozenAt
        };
      });
    },

    recordStrictProjection(input) {
      return update(input?.envelopeId, (current) => {
        const strictProjectionId = requiredText(input?.strictProjectionId, 240, "strictProjectionId");
        const strictProjectionSchema = requiredText(input?.strictProjectionSchema, 240, "strictProjectionSchema");
        const strictProjectionStatus = input?.strictProjectionStatus === "accepted" || input?.strictProjectionStatus === "rejected"
          ? input.strictProjectionStatus
          : null;
        if (!strictProjectionStatus) throw envelopeError("REPLAY_ENVELOPE_INVALID", "Strict projection status is invalid.");
        if (current.strictProjectionId) {
          assertSame(current.strictProjectionId, strictProjectionId, "strict projection");
          assertSame(current.strictProjectionSchema, strictProjectionSchema, "strict projection schema");
          assertSame(current.strictProjectionStatus, strictProjectionStatus, "strict projection status");
          return current;
        }
        assertStatus(current, ["response_frozen"]);
        const recordedAt = optionalTimestamp(input?.recordedAt) || now();
        return {
          ...current,
          strictProjectionId,
          strictProjectionSchema,
          strictProjectionStatus,
          errorClassification: strictProjectionStatus === "rejected" ? "strict-parse-failed" : current.errorClassification,
          replayStatus: strictProjectionStatus === "rejected" ? "strict_parse_failed" : "candidate_pending",
          updatedAt: recordedAt
        };
      });
    },

    appendToolReceipt(input) {
      assertNoPrivatePayload(input);
      return update(input?.envelopeId, (current) => {
        const receipt = normalizeToolReceipt(input, now());
        const existing = current.toolReceipts.find((item) => item.receiptId === receipt.receiptId);
        if (existing) {
          if (canonicalJson(existing) !== canonicalJson(receipt)) throw envelopeError("REPLAY_ENVELOPE_IDEMPOTENCY_CONFLICT", "Tool receipt identity was reused with different metadata.");
          return current;
        }
        assertStatus(current, ["candidate_pending", "tool_failed"]);
        return {
          ...current,
          toolReceiptIds: [...current.toolReceiptIds, receipt.receiptId],
          toolReceipts: [...current.toolReceipts, receipt],
          replayStatus: receipt.status === "failed" ? "tool_failed" : "candidate_pending",
          errorClassification: receipt.status === "failed" ? receipt.errorClassification || "tool-failed" : current.errorClassification,
          updatedAt: receipt.recordedAt
        };
      });
    },

    appendCandidateReceipt(input) {
      return appendReference(input, "candidateReceiptIds", "candidateReceiptId", "candidate_pending");
    },

    appendImpactReviewReceipt(input) {
      return appendReference(input, "impactReviewReceiptIds", "impactReviewReceiptId", "impact_pending");
    },

    markFailure(input) {
      return update(input?.envelopeId, (current) => {
        const errorClassification = requiredText(input?.errorClassification, 160, "errorClassification");
        const replayStatus = input?.replayStatus === "cancelled" || input?.replayStatus === "timeout" || input?.replayStatus === "transport_failed" || input?.replayStatus === "strict_parse_failed" || input?.replayStatus === "tool_failed"
          ? input.replayStatus
          : null;
        if (!replayStatus) throw envelopeError("REPLAY_ENVELOPE_INVALID", "Failure replay status is invalid.");
        const recordedAt = optionalTimestamp(input?.recordedAt) || now();
        return { ...current, errorClassification, replayStatus, completedAt: ["cancelled", "timeout", "transport_failed"].includes(replayStatus) ? recordedAt : current.completedAt, updatedAt: recordedAt };
      });
    },

    complete(input) {
      return update(input?.envelopeId, (current) => {
        if (current.replayStatus === "completed") return current;
        if (current.strictProjectionStatus !== "accepted") throw envelopeError("REPLAY_ENVELOPE_INCOMPLETE", "An accepted strict projection is required before completion.");
        const completedAt = optionalTimestamp(input?.completedAt) || now();
        return { ...current, replayStatus: "completed", completedAt, updatedAt: completedAt };
      });
    },

    read(input) {
      const state = readState(target);
      const value = state.envelopes.find((item) => item.envelopeId === input?.envelopeId);
      if (!value) return Object.freeze({ status: "missing", envelope: null, missingReferences: [] });
      if (value.schemaVersion !== REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_VERSION) return readLegacy(value);
      try { assertIntegrity(value); } catch {
        return Object.freeze({ status: "integrity-mismatch", envelope: publicEnvelope(value), missingReferences: [] });
      }
      const missingReferences = resolveMissingReferences(value, input?.resolveOwnerReference);
      return Object.freeze({ status: missingReferences.length ? "missing-reference" : "ready", envelope: publicEnvelope(value), missingReferences: Object.freeze(missingReferences) });
    },

    replay(input) {
      const result = this.read(input);
      if (result.status !== "ready") throw envelopeError(result.status === "integrity-mismatch" ? "REPLAY_ENVELOPE_INTEGRITY_MISMATCH" : "REPLAY_ENVELOPE_REFERENCE_MISSING", result.status === "integrity-mismatch" ? "Envelope integrity verification failed." : `Envelope owner reference is unavailable: ${result.missingReferences.join(", ")}`);
      return Object.freeze({ status: "replayed", providerCalls: 0, budgetReservations: 0, envelope: result.envelope });
    },

    exportSafe(input) {
      const result = this.read(input);
      if (result.status !== "ready") throw envelopeError("REPLAY_ENVELOPE_EXPORT_BLOCKED", `Safe export requires a valid replay projection; current status is ${result.status}.`);
      const envelope = result.envelope;
      const exportValue = {
        manifest: {
          schemaVersion: "tianyan-replay-safe-evidence-export/v1",
          envelopeId: envelope.envelopeId,
          exportedAt: optionalTimestamp(input?.exportedAt) || now(),
          replayStatus: envelope.replayStatus,
          integrityHash: envelope.integrityHash,
          realProviderCallCount: 0
        },
        envelopeProjection: envelope,
        stableIdentities: {
          projectId: envelope.projectId,
          projectVersion: envelope.projectVersion,
          sessionId: envelope.sessionId,
          archiveRecordId: envelope.archiveRecordId,
          operationId: envelope.operationId
        },
        sourceAnchorMetadata: envelope.sourceAnchorIds.map((sourceAnchorId) => ({ sourceAnchorId, sourceRevision: envelope.sourceRevision })),
        receiptMetadata: {
          budgetReservationId: envelope.budgetReservationId,
          dispatchReceiptId: envelope.dispatchReceiptId,
          frozenResponseId: envelope.frozenResponseId,
          strictProjectionId: envelope.strictProjectionId,
          toolReceipts: envelope.toolReceipts,
          candidateReceiptIds: envelope.candidateReceiptIds,
          impactReviewReceiptIds: envelope.impactReviewReceiptIds
        },
        schemaVersions: [envelope.schemaVersion, envelope.strictProjectionSchema].filter(Boolean),
        redactionReport: {
          rawProviderBodyIncluded: false,
          promptIncluded: false,
          credentialsIncluded: false,
          authorizationHeaderIncluded: false,
          privateStoryBodyIncluded: false,
          excludedFields: ["apiKey", "authorization", "prompt", "messages", "rawBody", "responseBody", "credentialHash"]
        }
      };
      assertSafeExport(exportValue);
      return Object.freeze(structuredClone(exportValue));
    },

    list() {
      return Object.freeze(readState(target).envelopes.map(publicEnvelope));
    },

    path: target
  });

  function initialize() {
    if (existsSync(target)) {
      readState(target);
      return;
    }
    writeState(target, { version: REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_STORE_VERSION, revision: 0, envelopes: [] });
  }

  function update(envelopeIdValue, transform) {
    const envelopeId = requiredText(envelopeIdValue, 240, "envelopeId");
    const state = readState(target);
    const index = state.envelopes.findIndex((item) => item.envelopeId === envelopeId);
    if (index < 0) throw envelopeError("REPLAY_ENVELOPE_MISSING", "Replay-safe envelope does not exist.");
    const current = state.envelopes[index];
    if (current.schemaVersion !== REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_VERSION) throw envelopeError("REPLAY_ENVELOPE_READ_ONLY_SCHEMA", "Legacy envelope schemas are read-only.");
    assertIntegrity(current);
    const nextValue = transform(structuredClone(current));
    if (nextValue === current || canonicalJson(nextValue) === canonicalJson(current)) return publicEnvelope(current);
    if (!REPLAY_STATUSES.has(nextValue.replayStatus)) throw envelopeError("REPLAY_ENVELOPE_INVALID", "Replay status is invalid.");
    const next = withIntegrity({ ...nextValue, integrityHash: undefined });
    writeState(target, { ...state, revision: state.revision + 1, envelopes: state.envelopes.map((item, itemIndex) => itemIndex === index ? next : item) });
    return publicEnvelope(next);
  }

  function appendReference(input, collectionKey, inputKey, replayStatus) {
    return update(input?.envelopeId, (current) => {
      const receiptId = requiredText(input?.[inputKey], 240, inputKey);
      if (current[collectionKey].includes(receiptId)) return current;
      const recordedAt = optionalTimestamp(input?.recordedAt) || now();
      return { ...current, [collectionKey]: [...current[collectionKey], receiptId], replayStatus, updatedAt: recordedAt };
    });
  }
}

function normalizeBegin(value, createdAt) {
  if (!value || typeof value !== "object") throw envelopeError("REPLAY_ENVELOPE_INVALID", "Envelope input is invalid.");
  assertNoPrivatePayload(value);
  const operationId = requiredText(value.operationId, 240, "operationId");
  const projectId = requiredText(value.projectId, 240, "projectId");
  const sessionId = requiredText(value.sessionId, 240, "sessionId");
  const archiveRecordId = requiredText(value.archiveRecordId, 240, "archiveRecordId");
  const sourceAnchorIds = uniqueTexts(value.sourceAnchorIds, 1, 64, "sourceAnchorIds");
  const normalized = {
    envelopeId: optionalText(value.envelopeId, 240) || `provider-envelope-${sha256(`${projectId}:${sessionId}:${operationId}`).slice(0, 24)}`,
    projectId,
    projectVersion: requiredText(value.projectVersion, 240, "projectVersion"),
    sessionId,
    archiveRecordId,
    sourceAnchorIds,
    sourceRevision: requiredText(value.sourceRevision, 240, "sourceRevision"),
    operationId,
    budgetReservationId: requiredText(value.budgetReservationId, 240, "budgetReservationId"),
    providerProfileRevision: requiredText(String(value.providerProfileRevision), 240, "providerProfileRevision"),
    providerId: requiredText(value.providerId, 120, "providerId"),
    modelId: requiredText(value.modelId, 240, "modelId"),
    createdAt: optionalTimestamp(value.createdAt) || createdAt
  };
  const { createdAt: _createdAt, envelopeId: _envelopeId, ...operationIdentity } = normalized;
  return { ...normalized, operationDigest: sha256(canonicalJson(operationIdentity)) };
}

function normalizeToolReceipt(value, recordedAt) {
  const receiptId = requiredText(value?.toolReceiptId, 240, "toolReceiptId");
  const toolName = requiredText(value?.toolName, 160, "toolName");
  const argumentsSummary = optionalText(value?.argumentsSummary, 500) || "No safe argument summary recorded.";
  const status = value?.status === "success" || value?.status === "failed" || value?.status === "rejected" ? value.status : null;
  if (!status) throw envelopeError("REPLAY_ENVELOPE_INVALID", "Tool receipt status is invalid.");
  return {
    receiptId,
    toolName,
    argumentsSummary,
    status,
    errorClassification: status === "success" ? null : optionalText(value?.errorClassification, 160) || "tool-rejected",
    recordedAt: optionalTimestamp(value?.recordedAt) || recordedAt
  };
}

function normalizeUsage(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object") throw envelopeError("REPLAY_ENVELOPE_INVALID", "Provider usage is invalid.");
  const promptTokens = boundedInteger(value.promptTokens ?? 0, 0, 1_000_000_000, "promptTokens");
  const completionTokens = boundedInteger(value.completionTokens ?? 0, 0, 1_000_000_000, "completionTokens");
  const totalTokens = boundedInteger(value.totalTokens ?? promptTokens + completionTokens, 0, 2_000_000_000, "totalTokens");
  if (totalTokens < promptTokens + completionTokens) throw envelopeError("REPLAY_ENVELOPE_INVALID", "Provider usage total is inconsistent.");
  return { promptTokens, completionTokens, totalTokens };
}

function resolveMissingReferences(envelope, resolver) {
  if (typeof resolver !== "function") return [];
  const refs = [
    ["session", envelope.sessionId],
    ["archive", envelope.archiveRecordId],
    ...envelope.sourceAnchorIds.map((id) => ["source-anchor", id]),
    ["budget-reservation", envelope.budgetReservationId],
    ...(envelope.dispatchReceiptId ? [["dispatch", envelope.dispatchReceiptId]] : []),
    ...(envelope.frozenResponseId ? [["frozen-response", envelope.frozenResponseId]] : []),
    ...(envelope.strictProjectionId ? [["strict-projection", envelope.strictProjectionId]] : []),
    ...envelope.toolReceiptIds.map((id) => ["tool-receipt", id]),
    ...envelope.candidateReceiptIds.map((id) => ["candidate-receipt", id]),
    ...envelope.impactReviewReceiptIds.map((id) => ["impact-review-receipt", id])
  ];
  return refs.filter(([kind, id]) => resolver({ kind, id, envelope }) !== true).map(([kind, id]) => `${kind}:${id}`);
}

function readLegacy(value) {
  if (value?.schemaVersion !== "tianyan-replay-safe-provider-receipt-envelope/v0") return Object.freeze({ status: "unsupported-schema", envelope: null, missingReferences: [] });
  return Object.freeze({ status: "read-only-migrated", envelope: Object.freeze({ ...structuredClone(value), migratedReadOnly: true }), missingReferences: [] });
}

function assertStatus(value, allowed) {
  if (!allowed.includes(value.replayStatus)) throw envelopeError("REPLAY_ENVELOPE_STATE_CONFLICT", `Envelope state ${value.replayStatus} cannot perform this append.`);
}

function assertSame(left, right, label) {
  if (left !== right) throw envelopeError("REPLAY_ENVELOPE_IDEMPOTENCY_CONFLICT", `${label} identity was reused with different semantics.`);
}

function assertIntegrity(value) {
  if (value.integrityHash !== calculateIntegrity(value)) throw envelopeError("REPLAY_ENVELOPE_INTEGRITY_MISMATCH", "Envelope integrity verification failed.");
}

function withIntegrity(value) {
  const normalized = structuredClone(value);
  delete normalized.integrityHash;
  return { ...normalized, integrityHash: calculateIntegrity(normalized) };
}

function calculateIntegrity(value) {
  const clone = structuredClone(value);
  delete clone.integrityHash;
  // Conflict detection is local metadata and is intentionally absent from
  // portable safe exports; it must not change their integrity digest.
  delete clone.operationDigest;
  return sha256(canonicalJson(clone));
}

function publicEnvelope(value) {
  const clone = structuredClone(value);
  delete clone.operationDigest;
  return Object.freeze(clone);
}

function readState(target) {
  const value = JSON.parse(readFileSync(target, "utf8"));
  if (value?.version !== REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_STORE_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.envelopes)) {
    throw envelopeError("REPLAY_ENVELOPE_STORE_INVALID", "Replay-safe envelope store is invalid.");
  }
  return value;
}

function writeState(target, value) {
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);
}

function assertNoPrivatePayload(value) {
  if (!value || typeof value !== "object") return;
  const forbidden = /^(?:apiKey|authorization|authorizationHeader|prompt|messages|rawBody|responseBody|rawResponse|credential|credentialHash|privateStory)$/iu;
  for (const key of Object.keys(value)) {
    if (forbidden.test(key)) throw envelopeError("REPLAY_ENVELOPE_PRIVATE_PAYLOAD_REJECTED", `Envelope input cannot contain private field ${key}.`);
  }
}

function assertSafeExport(value) {
  const serialized = JSON.stringify(value);
  if (/Bearer\s+|"apiKey"\s*:|"rawBody"\s*:|"responseBody"\s*:|"prompt"\s*:/iu.test(serialized)) {
    throw envelopeError("REPLAY_ENVELOPE_EXPORT_UNSAFE", "Safe export contains a forbidden private field.");
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function uniqueTexts(value, minimum, maximum, label) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw envelopeError("REPLAY_ENVELOPE_INVALID", `${label} is invalid.`);
  const result = [...new Set(value.map((item) => requiredText(item, 240, label)))];
  if (result.length !== value.length) throw envelopeError("REPLAY_ENVELOPE_INVALID", `${label} contains duplicates.`);
  return result;
}

function requiredHash(value, label) {
  const result = requiredText(value, 64, label);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw envelopeError("REPLAY_ENVELOPE_INVALID", `${label} must be a SHA-256 digest.`);
  return result;
}

function requiredText(value, maximum, label) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw envelopeError("REPLAY_ENVELOPE_INVALID", `${label} is invalid.`);
  return value.trim();
}

function optionalText(value, maximum) {
  if (value == null || value === "") return null;
  return requiredText(value, maximum, "optional text");
}

function optionalTimestamp(value) {
  if (value == null || value === "") return null;
  const result = requiredText(value, 80, "timestamp");
  if (!Number.isFinite(Date.parse(result))) throw envelopeError("REPLAY_ENVELOPE_INVALID", "Timestamp is invalid.");
  return result;
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw envelopeError("REPLAY_ENVELOPE_INVALID", `${label} is invalid.`);
  return value;
}

function envelopeError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = code === "REPLAY_ENVELOPE_MISSING" ? 404 : 409;
  return error;
}
