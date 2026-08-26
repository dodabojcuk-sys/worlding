import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createProviderRequestBudgetLedger,
  HISTORICAL_PROVIDER_INCIDENT_R0,
  zeroProviderBudgetBaseline
} from "../../apps/story-studio/server/providerGateway/providerRequestBudgetLedger.mjs";

test("historical incident is immutable and blocks a corrected rerun before dispatch", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-provider-budget-incident-"));
  const ledger = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: HISTORICAL_PROVIDER_INCIDENT_R0 });
  assert.deepEqual(ledger.snapshot().counts, { setupCalls: 3, generationCalls: 6, toolLoopTurns: 2, retryCalls: 0, totalCalls: 9 });
  assert.throws(() => ledger.reserve({ idempotencyKey: "gate-c-corrected-rerun", kind: "generation", scope: "gate-c", retry: false }), (error: unknown) => (error as { code?: string }).code === "PROVIDER_BUDGET_EXHAUSTED");
  assert.equal(ledger.snapshot().counts.totalCalls, 9);
});

test("pre-dispatch reservations count malformed timeout and cancelled outcomes and survive restart", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-provider-budget-restart-"));
  const ledger = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: zeroProviderBudgetBaseline() });
  const first = ledger.reserve({ idempotencyKey: "generation-1", kind: "generation", scope: "creative" });
  ledger.complete({ reservationId: first.reservation.reservationId, outcome: "malformed" });
  const second = ledger.reserve({ idempotencyKey: "generation-2", kind: "generation", scope: "conversation", retry: true });
  ledger.complete({ reservationId: second.reservation.reservationId, outcome: "timeout" });
  const third = ledger.reserve({ idempotencyKey: "generation-3", kind: "generation", scope: "event-work", toolLoopTurn: true });
  ledger.complete({ reservationId: third.reservation.reservationId, outcome: "cancelled-after-dispatch" });
  const restarted = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: HISTORICAL_PROVIDER_INCIDENT_R0 });
  assert.deepEqual(restarted.snapshot().counts, { setupCalls: 0, generationCalls: 3, toolLoopTurns: 1, retryCalls: 1, totalCalls: 3 });
});

test("idempotency reuses one reservation and concurrent dispatch attempts cannot cross the cap", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-provider-budget-concurrent-"));
  const ledger = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: { ...zeroProviderBudgetBaseline(), authorizedGenerationCap: 2, authorizedTotalCap: 2 } });
  const first = ledger.reserve({ idempotencyKey: "same-request", kind: "generation", scope: "same" });
  const reused = ledger.reserve({ idempotencyKey: "same-request", kind: "generation", scope: "same" });
  assert.equal(first.reused, false);
  assert.equal(reused.reused, true);
  const attempts = await Promise.allSettled(["a", "b"].map(async (id) => ledger.reserve({ idempotencyKey: `concurrent-${id}`, kind: "generation", scope: id })));
  assert.deepEqual(attempts.map((item) => item.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(ledger.snapshot().counts.totalCalls, 2);
});

test("higher caps require an explicit persisted authorization receipt", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-provider-budget-auth-"));
  const ledger = createProviderRequestBudgetLedger({ appDataRoot: root, initialSnapshot: { ...zeroProviderBudgetBaseline(), authorizedGenerationCap: 1, authorizedTotalCap: 1 } });
  ledger.reserve({ idempotencyKey: "before-auth", kind: "generation", scope: "normal" });
  assert.throws(() => ledger.reserve({ idempotencyKey: "missing-auth", kind: "generation", scope: "normal", authorizationReceiptId: "missing" }), /authorization receipt/i);
  ledger.authorize({ receiptId: "author-receipt-r0", authorizedBy: "author", reason: "Explicitly authorize one additional bounded call.", limits: { generationCalls: 2, totalCalls: 2 }, issuedAt: "2026-08-23T00:00:00.000Z" });
  ledger.reserve({ idempotencyKey: "after-auth", kind: "generation", scope: "authorized", authorizationReceiptId: "author-receipt-r0" });
  assert.equal(ledger.snapshot().counts.totalCalls, 2);
});
