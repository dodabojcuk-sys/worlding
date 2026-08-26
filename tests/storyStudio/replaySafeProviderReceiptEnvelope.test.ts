import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createAiProviderGateway, DEFAULT_MODEL_PROFILES } from "../../apps/story-studio/server/providerGateway/aiProviderGateway.mjs";
import { createProviderRequestBudgetLedger, HISTORICAL_PROVIDER_INCIDENT_R0, zeroProviderBudgetBaseline } from "../../apps/story-studio/server/providerGateway/providerRequestBudgetLedger.mjs";
import { createReplaySafeProviderReceiptEnvelopeStore, REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_STORE_VERSION } from "../../apps/story-studio/server/providerGateway/replaySafeProviderReceiptEnvelope.mjs";

const PROFILE = DEFAULT_MODEL_PROFILES[0];

test("full receipt chain survives restart, replays without Provider or budget, and exports only safe metadata", () => {
  const root = freshRoot("full");
  const store = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root, now: clock() });
  const begun = store.begin(beginInput());
  store.markDispatched({ envelopeId: begun.envelope.envelopeId, dispatchReceiptId: "dispatch.fixture.1" });
  store.freezeResponse({ envelopeId: begun.envelope.envelopeId, frozenResponseId: "response.fixture.1", frozenResponseHash: hash("fixture-response"), usage: { promptTokens: 3, completionTokens: 6, totalTokens: 9 }, finishReason: "stop" });
  store.recordStrictProjection({ envelopeId: begun.envelope.envelopeId, strictProjectionId: "strict.fixture.1", strictProjectionSchema: "strict/story-projection/v1", strictProjectionStatus: "accepted" });
  store.appendToolReceipt({ envelopeId: begun.envelope.envelopeId, toolReceiptId: "tool.fixture.1", toolName: "read_event", argumentsSummary: "one stable Event ID", status: "success" });
  store.appendCandidateReceipt({ envelopeId: begun.envelope.envelopeId, candidateReceiptId: "candidate.fixture.1" });
  store.appendImpactReviewReceipt({ envelopeId: begun.envelope.envelopeId, impactReviewReceiptId: "impact.fixture.1" });
  store.complete({ envelopeId: begun.envelope.envelopeId });

  const restarted = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root, now: clock() });
  const replay = restarted.replay({ envelopeId: begun.envelope.envelopeId, resolveOwnerReference: () => true });
  assert.equal(replay.providerCalls, 0);
  assert.equal(replay.budgetReservations, 0);
  assert.equal(replay.envelope.replayStatus, "completed");
  assert.deepEqual(replay.envelope.toolReceiptIds, ["tool.fixture.1"]);
  const exported = restarted.exportSafe({ envelopeId: begun.envelope.envelopeId, resolveOwnerReference: () => true });
  assert.equal(exported.manifest.realProviderCallCount, 0);
  assert.equal(exported.redactionReport.rawProviderBodyIncluded, false);
  assert.equal(JSON.stringify(exported).includes("fixture-response"), false);
  assert.equal(JSON.stringify(exported).includes("api-secret"), false);
  assert.equal("operationDigest" in exported.envelopeProjection, false);
});

test("malformed strict projection, timeout, cancellation, and unknown tool failure remain durable", () => {
  const cases = [
    { suffix: "malformed", finish(store: ReturnType<typeof createReplaySafeProviderReceiptEnvelopeStore>, envelopeId: string) { store.freezeResponse({ envelopeId, frozenResponseId: "response.bad", frozenResponseHash: hash("malformed") }); store.recordStrictProjection({ envelopeId, strictProjectionId: "strict.bad", strictProjectionSchema: "strict/v1", strictProjectionStatus: "rejected" }); }, status: "strict_parse_failed", frozen: true },
    { suffix: "timeout", finish(store: ReturnType<typeof createReplaySafeProviderReceiptEnvelopeStore>, envelopeId: string) { store.markFailure({ envelopeId, replayStatus: "timeout", errorClassification: "timeout" }); }, status: "timeout", frozen: false },
    { suffix: "cancel", finish(store: ReturnType<typeof createReplaySafeProviderReceiptEnvelopeStore>, envelopeId: string) { store.markFailure({ envelopeId, replayStatus: "cancelled", errorClassification: "cancelled" }); }, status: "cancelled", frozen: false },
    { suffix: "tool", finish(store: ReturnType<typeof createReplaySafeProviderReceiptEnvelopeStore>, envelopeId: string) { store.freezeResponse({ envelopeId, frozenResponseId: "response.tool", frozenResponseHash: hash("tool") }); store.recordStrictProjection({ envelopeId, strictProjectionId: "strict.tool", strictProjectionSchema: "strict/v1", strictProjectionStatus: "accepted" }); store.appendToolReceipt({ envelopeId, toolReceiptId: "tool.unknown.1", toolName: "unknown_tool", argumentsSummary: "unsupported destination", status: "failed", errorClassification: "unsupported-tool" }); }, status: "tool_failed", frozen: true }
  ] as const;
  for (const item of cases) {
    const root = freshRoot(item.suffix);
    const store = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root, now: clock() });
    const begun = store.begin(beginInput({ operationId: `operation.${item.suffix}` }));
    store.markDispatched({ envelopeId: begun.envelope.envelopeId, dispatchReceiptId: `dispatch.${item.suffix}` });
    item.finish(store, begun.envelope.envelopeId);
    const restarted = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root });
    const receipt = restarted.read({ envelopeId: begun.envelope.envelopeId }).envelope!;
    assert.equal(receipt.replayStatus, item.status);
    assert.equal(Boolean(receipt.frozenResponseId), item.frozen);
  }
});

test("idempotency conflicts, integrity mismatch, missing owner references, and private payloads fail closed", () => {
  const root = freshRoot("closed");
  const store = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root });
  const first = store.begin(beginInput());
  assert.equal(store.begin(beginInput()).reused, true);
  assert.throws(() => store.begin(beginInput({ projectVersion: "project.v2" })), (error: unknown) => (error as { code?: string }).code === "REPLAY_ENVELOPE_IDEMPOTENCY_CONFLICT");
  assert.throws(() => store.begin({ ...beginInput({ operationId: "private" }), prompt: "private story" }), (error: unknown) => (error as { code?: string }).code === "REPLAY_ENVELOPE_PRIVATE_PAYLOAD_REJECTED");
  store.markDispatched({ envelopeId: first.envelope.envelopeId, dispatchReceiptId: "dispatch.closed" });
  const missing = store.read({ envelopeId: first.envelope.envelopeId, resolveOwnerReference: ({ kind }: { kind: string }) => kind !== "archive" });
  assert.equal(missing.status, "missing-reference");
  assert.deepEqual(missing.missingReferences, ["archive:archive.fixture.1"]);
  const disk = JSON.parse(readFileSync(store.path, "utf8"));
  disk.envelopes[0].providerId = "tampered-provider";
  writeFileSync(store.path, `${JSON.stringify(disk, null, 2)}\n`);
  assert.equal(store.read({ envelopeId: first.envelope.envelopeId }).status, "integrity-mismatch");
  assert.throws(() => store.replay({ envelopeId: first.envelope.envelopeId }), (error: unknown) => (error as { code?: string }).code === "REPLAY_ENVELOPE_INTEGRITY_MISMATCH");
});

test("legacy v0 envelopes project read-only and are never silently rewritten", () => {
  const root = freshRoot("legacy");
  const target = path.join(root, "replay-safe-provider-receipt-envelopes-r0.json");
  const legacy = { schemaVersion: "tianyan-replay-safe-provider-receipt-envelope/v0", envelopeId: "legacy.1", operationId: "legacy.operation" };
  writeFileSync(target, `${JSON.stringify({ version: REPLAY_SAFE_PROVIDER_RECEIPT_ENVELOPE_STORE_VERSION, revision: 1, envelopes: [legacy] }, null, 2)}\n`);
  const before = readFileSync(target, "utf8");
  const store = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root });
  assert.equal(store.read({ envelopeId: "legacy.1" }).status, "read-only-migrated");
  assert.equal(readFileSync(target, "utf8"), before);
  assert.throws(() => store.markDispatched({ envelopeId: "legacy.1", dispatchReceiptId: "no-write" }), (error: unknown) => (error as { code?: string }).code === "REPLAY_ENVELOPE_READ_ONLY_SCHEMA");
});

test("gateway persists budget, envelope and dispatch before local fake transport, then freezes response", async () => {
  const root = freshRoot("gateway");
  const ledger = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: zeroProviderBudgetBaseline(), now: clock() });
  const durableStore = createReplaySafeProviderReceiptEnvelopeStore({ appDataRoot: root, now: clock() });
  const order: string[] = [];
  const observedReservationIds: string[] = [];
  const store = {
    ...durableStore,
    begin(input: Record<string, unknown>) { order.push("envelope"); observedReservationIds.push(String(input.budgetReservationId)); return durableStore.begin(input); },
    markDispatched(input: Record<string, unknown>) { order.push("dispatch"); return durableStore.markDispatched(input); }
  };
  const gateway = createAiProviderGateway({
    budgetLedger: ledger,
    receiptEnvelopeStore: store,
    adapters: [{
      id: "siliconflow",
      models: [{ id: PROFILE.modelId, label: "Local Fake", capabilities: ["streaming", "json"] }],
      status: () => ({ configured: true }),
      async openChatCompletion() { order.push("transport"); assert.equal(ledger.snapshot().reservationCount, 1); return { modelId: PROFILE.modelId, content: "fixture-only", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }, traceId: "local-fake-trace" }; }
    }]
  });
  const result = await gateway.openChatCompletion({ profileId: PROFILE.id, messages: [{ role: "user", content: "fixture" }], idempotencyKey: "gateway.fixture.1", receiptEnvelopeContext: beginInput({ operationId: "gateway.fixture.1", budgetReservationId: undefined }) });
  assert.deepEqual(order, ["envelope", "dispatch", "transport"]);
  assert.match(observedReservationIds[0]!, /^provider-reservation-/);
  assert.equal(result.receiptEnvelopeId, durableStore.list()[0]!.envelopeId);
  assert.equal(durableStore.list()[0]!.replayStatus, "response_frozen");
  assert.equal(durableStore.list()[0]!.frozenResponseHash, hash("fixture-only"));
  assert.equal(ledger.snapshot().counts.totalCalls, 1);
});

test("historical 3/6/9 Provider incident remains immutable and unrelated to local replay fixtures", () => {
  const root = freshRoot("historical");
  const ledger = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: HISTORICAL_PROVIDER_INCIDENT_R0 });
  assert.deepEqual(ledger.snapshot().counts, { setupCalls: 3, generationCalls: 6, toolLoopTurns: 2, retryCalls: 0, totalCalls: 9 });
  assert.throws(() => ledger.reserve({ idempotencyKey: "forbidden-new-call", kind: "generation", scope: "historical-gate" }), (error: unknown) => (error as { code?: string }).code === "PROVIDER_BUDGET_EXHAUSTED");
});

function beginInput(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project.fixture.1",
    projectVersion: "project.v1",
    sessionId: "session.fixture.1",
    archiveRecordId: "archive.fixture.1",
    sourceAnchorIds: ["source.fixture.1"],
    sourceRevision: "source.v1",
    operationId: "operation.fixture.1",
    budgetReservationId: "budget.fixture.1",
    providerProfileRevision: "provider-profile.v1",
    providerId: "siliconflow",
    modelId: PROFILE.modelId,
    ...overrides
  };
}

function freshRoot(suffix: string) { return mkdtempSync(path.join(tmpdir(), `tianyan-replay-envelope-${suffix}-`)); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function clock() { let second = 0; return () => `2026-08-23T08:00:${String(second++).padStart(2, "0")}.000Z`; }
