import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROVIDER_BUDGET_LEDGER_VERSION = "tianyan-provider-request-budget-ledger/v1";
export const HISTORICAL_PROVIDER_INCIDENT_R0 = Object.freeze({
  incidentId: "tianyan-real-provider-generation-budget-incident-r0",
  setupCalls: 3,
  generationCalls: 6,
  toolLoopTurns: 2,
  retryCalls: 0,
  totalCalls: 9,
  authorizedGenerationCap: 5,
  authorizedTotalCap: 8,
  verdict: "BLOCKED_GENERATION_BUDGET_EXCEEDED"
});

const ZERO_BASELINE = Object.freeze({
  incidentId: null,
  setupCalls: 0,
  generationCalls: 0,
  toolLoopTurns: 0,
  retryCalls: 0,
  totalCalls: 0,
  authorizedGenerationCap: 5,
  authorizedTotalCap: 8,
  verdict: null
});

/**
 * Durable pre-dispatch budget authority for the existing Provider boundary.
 * A reservation is written before transport dispatch and is therefore consumed
 * even when the upstream response is malformed, times out, or is cancelled.
 */
export function createProviderRequestBudgetLedger(options) {
  const appDataRoot = path.resolve(options?.appDataRoot || ".");
  const target = path.join(appDataRoot, "provider-request-budget-ledger-r0.json");
  const now = typeof options?.now === "function" ? options.now : () => new Date().toISOString();
  const baseline = normalizeBaseline(options?.initialSnapshot ?? ZERO_BASELINE);
  let state = readOrInitialize();

  return Object.freeze({
    reserve(input) {
      const request = normalizeReservation(input);
      state = readState(target);
      const existing = state.reservations.find((item) => item.idempotencyKey === request.idempotencyKey);
      if (existing) {
        if (existing.requestDigest !== request.requestDigest) throw budgetError("PROVIDER_IDEMPOTENCY_CONFLICT", "Provider request identity was reused with different dispatch semantics.");
        return Object.freeze({ reused: true, reservation: publicReservation(existing), ledger: publicLedger(state) });
      }

      const authorization = request.authorizationReceiptId
        ? state.authorizations.find((item) => item.receiptId === request.authorizationReceiptId) || null
        : null;
      if (request.authorizationReceiptId && !authorization) throw budgetError("PROVIDER_BUDGET_AUTHORIZATION_MISSING", "Provider budget increase requires an existing explicit authorization receipt.");
      const limits = authorization?.limits ?? state.limits;
      const nextGeneration = state.counts.generationCalls + (request.kind === "generation" ? 1 : 0);
      const nextTotal = state.counts.totalCalls + 1;
      if (nextGeneration > limits.generationCalls || nextTotal > limits.totalCalls) {
        throw budgetError("PROVIDER_BUDGET_EXHAUSTED", "Provider request budget is exhausted; dispatch was blocked before transport.", {
          counts: state.counts,
          limits
        });
      }

      const reservation = {
        reservationId: stableId(request.idempotencyKey),
        idempotencyKey: request.idempotencyKey,
        requestDigest: request.requestDigest,
        kind: request.kind,
        toolLoopTurn: request.toolLoopTurn,
        retry: request.retry,
        authorizationReceiptId: authorization?.receiptId ?? null,
        outcome: "reserved",
        reservedAt: now(),
        completedAt: null,
        traceId: null
      };
      state = {
        ...state,
        revision: state.revision + 1,
        counts: {
          setupCalls: state.counts.setupCalls + (request.kind === "setup" ? 1 : 0),
          generationCalls: nextGeneration,
          toolLoopTurns: state.counts.toolLoopTurns + (request.toolLoopTurn ? 1 : 0),
          retryCalls: state.counts.retryCalls + (request.retry ? 1 : 0),
          totalCalls: nextTotal
        },
        reservations: [...state.reservations, reservation]
      };
      writeState(target, state);
      return Object.freeze({ reused: false, reservation: publicReservation(reservation), ledger: publicLedger(state) });
    },

    complete(input) {
      state = readState(target);
      const index = state.reservations.findIndex((item) => item.reservationId === input?.reservationId);
      if (index < 0) throw budgetError("PROVIDER_RESERVATION_MISSING", "Provider reservation does not exist.");
      const existing = state.reservations[index];
      const outcome = normalizeOutcome(input?.outcome);
      const next = { ...existing, outcome, completedAt: now(), traceId: boundedTrace(input?.traceId) };
      state = { ...state, revision: state.revision + 1, reservations: state.reservations.map((item, itemIndex) => itemIndex === index ? next : item) };
      writeState(target, state);
      return publicReservation(next);
    },

    authorize(input) {
      const authorization = normalizeAuthorization(input, state.limits, now());
      state = readState(target);
      const existing = state.authorizations.find((item) => item.receiptId === authorization.receiptId);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(authorization)) throw budgetError("PROVIDER_BUDGET_AUTHORIZATION_CONFLICT", "Provider budget authorization receipt was reused with different limits.");
        return Object.freeze({ reused: true, authorization: structuredClone(existing) });
      }
      state = { ...state, revision: state.revision + 1, authorizations: [...state.authorizations, authorization] };
      writeState(target, state);
      return Object.freeze({ reused: false, authorization: structuredClone(authorization) });
    },

    snapshot() {
      state = readState(target);
      return publicLedger(state);
    },

    path: target
  });

  function readOrInitialize() {
    if (existsSync(target)) return readState(target);
    const initial = {
      version: PROVIDER_BUDGET_LEDGER_VERSION,
      revision: 0,
      incident: baseline.incidentId ? {
        incidentId: baseline.incidentId,
        verdict: baseline.verdict,
        immutableCounts: {
          setupCalls: baseline.setupCalls,
          generationCalls: baseline.generationCalls,
          toolLoopTurns: baseline.toolLoopTurns,
          retryCalls: baseline.retryCalls,
          totalCalls: baseline.totalCalls
        }
      } : null,
      counts: {
        setupCalls: baseline.setupCalls,
        generationCalls: baseline.generationCalls,
        toolLoopTurns: baseline.toolLoopTurns,
        retryCalls: baseline.retryCalls,
        totalCalls: baseline.totalCalls
      },
      limits: { generationCalls: baseline.authorizedGenerationCap, totalCalls: baseline.authorizedTotalCap },
      authorizations: [],
      reservations: []
    };
    writeState(target, initial);
    return initial;
  }
}

export function zeroProviderBudgetBaseline() {
  return structuredClone(ZERO_BASELINE);
}

function normalizeReservation(value) {
  if (!value || typeof value !== "object") throw budgetError("PROVIDER_BUDGET_INVALID_REQUEST", "Provider budget reservation is invalid.");
  const idempotencyKey = requiredText(value.idempotencyKey, 240);
  const kind = value.kind === "setup" || value.kind === "generation" ? value.kind : null;
  if (!kind) throw budgetError("PROVIDER_BUDGET_INVALID_REQUEST", "Provider request kind is invalid.");
  const toolLoopTurn = value.toolLoopTurn === true;
  const retry = value.retry === true;
  if (kind !== "generation" && (toolLoopTurn || retry)) throw budgetError("PROVIDER_BUDGET_INVALID_REQUEST", "Setup requests cannot be tool-loop turns or retries.");
  const authorizationReceiptId = value.authorizationReceiptId == null ? null : requiredText(value.authorizationReceiptId, 180);
  const requestDigest = stableHash({ kind, toolLoopTurn, retry, authorizationReceiptId, scope: requiredText(value.scope || "provider", 240) });
  return { idempotencyKey, kind, toolLoopTurn, retry, authorizationReceiptId, requestDigest };
}

function normalizeAuthorization(value, currentLimits, issuedAt) {
  if (!value || typeof value !== "object") throw budgetError("PROVIDER_BUDGET_AUTHORIZATION_INVALID", "Provider budget authorization is invalid.");
  const receiptId = requiredText(value.receiptId, 180);
  const authorizedBy = requiredText(value.authorizedBy, 120);
  const reason = requiredText(value.reason, 500);
  const generationCalls = boundedInteger(value.limits?.generationCalls, currentLimits.generationCalls + 1, 1_000);
  const totalCalls = boundedInteger(value.limits?.totalCalls, currentLimits.totalCalls + 1, 2_000);
  if (totalCalls < generationCalls) throw budgetError("PROVIDER_BUDGET_AUTHORIZATION_INVALID", "Provider total cap cannot be lower than generation cap.");
  return { receiptId, authorizedBy, reason, issuedAt: requiredText(value.issuedAt || issuedAt, 80), limits: { generationCalls, totalCalls } };
}

function normalizeBaseline(value) {
  const result = {
    incidentId: value?.incidentId == null ? null : requiredText(value.incidentId, 180),
    setupCalls: boundedInteger(value?.setupCalls ?? 0, 0, 1_000_000),
    generationCalls: boundedInteger(value?.generationCalls ?? 0, 0, 1_000_000),
    toolLoopTurns: boundedInteger(value?.toolLoopTurns ?? 0, 0, 1_000_000),
    retryCalls: boundedInteger(value?.retryCalls ?? 0, 0, 1_000_000),
    totalCalls: boundedInteger(value?.totalCalls ?? 0, 0, 2_000_000),
    authorizedGenerationCap: boundedInteger(value?.authorizedGenerationCap ?? 5, 1, 1_000_000),
    authorizedTotalCap: boundedInteger(value?.authorizedTotalCap ?? 8, 1, 2_000_000),
    verdict: value?.verdict == null ? null : requiredText(value.verdict, 180)
  };
  if (result.setupCalls + result.generationCalls !== result.totalCalls || result.toolLoopTurns > result.generationCalls || result.retryCalls > result.generationCalls) {
    throw new TypeError("Provider budget baseline counts are inconsistent.");
  }
  return result;
}

function readState(target) {
  const value = JSON.parse(readFileSync(target, "utf8"));
  if (value?.version !== PROVIDER_BUDGET_LEDGER_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("Provider budget ledger is invalid.");
  const baseline = normalizeBaseline({
    incidentId: value.incident?.incidentId ?? null,
    verdict: value.incident?.verdict ?? null,
    ...(value.counts || {}),
    authorizedGenerationCap: value.limits?.generationCalls,
    authorizedTotalCap: value.limits?.totalCalls
  });
  void baseline;
  if (!Array.isArray(value.reservations) || !Array.isArray(value.authorizations)) throw new Error("Provider budget ledger collections are invalid.");
  return value;
}

function writeState(target, value) {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);
}

function publicLedger(state) {
  return Object.freeze({
    version: state.version,
    revision: state.revision,
    incident: state.incident ? structuredClone(state.incident) : null,
    counts: Object.freeze({ ...state.counts }),
    limits: Object.freeze({ ...state.limits }),
    authorizationCount: state.authorizations.length,
    reservationCount: state.reservations.length,
    blocked: state.counts.generationCalls >= state.limits.generationCalls || state.counts.totalCalls >= state.limits.totalCalls
  });
}

function publicReservation(value) {
  return Object.freeze({ reservationId: value.reservationId, kind: value.kind, toolLoopTurn: value.toolLoopTurn, retry: value.retry, outcome: value.outcome, reservedAt: value.reservedAt, completedAt: value.completedAt, traceId: value.traceId });
}

function normalizeOutcome(value) {
  if (!["success", "malformed", "timeout", "cancelled-after-dispatch", "transport-failed"].includes(value)) throw budgetError("PROVIDER_RESERVATION_OUTCOME_INVALID", "Provider reservation outcome is invalid.");
  return value;
}

function boundedTrace(value) {
  if (value == null || value === "") return null;
  return requiredText(value, 180);
}

function requiredText(value, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new TypeError("Provider budget text is invalid.");
  return value.trim();
}

function boundedInteger(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError("Provider budget integer is invalid.");
  return value;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableId(value) {
  return `provider-reservation-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function budgetError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = code === "PROVIDER_BUDGET_EXHAUSTED" ? 429 : 409;
  if (details) error.details = details;
  return error;
}
