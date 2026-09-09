/**
 * N4's two intentionally small world-state slices.  This is a value contract
 * only: the existing WorkspaceOperations WorldState owner persists it and the
 * Relation/Run/UI layers may only read its projections.
 */
export const WORLD_STATE_N4_VERSION = "tianyan-world-state-n4/v1" as const;

export type WorldStateN4ObjectRef = { id: string; revision: string };
export type WorldStateN4Evidence = { kind: "confirmed-event"; event: WorldStateN4ObjectRef };
export type PassageStateN4 = "open" | "closed" | "unknown";
export type HolderStateN4 = "held" | "unheld" | "unknown";
export type WorldStateN4Value =
  | { kind: "passage"; state: PassageStateN4 }
  | { kind: "holder"; state: HolderStateN4; holder: WorldStateN4ObjectRef | null };

export type WorldStateN4Change = {
  changeId: string;
  operationId: string;
  subject: WorldStateN4ObjectRef;
  effectiveAt: string;
  value: WorldStateN4Value;
  evidence: WorldStateN4Evidence;
  baseRevision: number;
  revision: number;
  compensatesChangeId: string | null;
  createdAt: string;
};

export type WorldStateN4Store = {
  version: typeof WORLD_STATE_N4_VERSION;
  revision: number;
  changes: WorldStateN4Change[];
};

export type WorldStateN4Projection = {
  subjectId: string;
  observedAt: string;
  status: "known" | "unknown";
  value: WorldStateN4Value | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  change: WorldStateN4Change | null;
  history: WorldStateN4Change[];
};

const IDENTIFIER = /^[A-Za-z0-9._-]{3,180}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export function emptyWorldStateN4Store(): WorldStateN4Store {
  return { version: WORLD_STATE_N4_VERSION, revision: 0, changes: [] };
}

export function normalizeWorldStateN4Store(value: unknown): WorldStateN4Store {
  if (!isRecord(value) || value.version !== WORLD_STATE_N4_VERSION || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.changes)) throw new Error("World state store is invalid.");
  const changes = value.changes.map(normalizeChange).sort(compareChanges);
  if (new Set(changes.map((change) => change.changeId)).size !== changes.length || new Set(changes.map((change) => change.operationId)).size !== changes.length) throw new Error("World state identities must be unique.");
  if (changes.some((change, index) => change.revision !== index + 1) || value.revision !== changes.length) throw new Error("World state revisions must be contiguous.");
  return { version: WORLD_STATE_N4_VERSION, revision: value.revision, changes };
}

export function appendWorldStateN4Change(input: {
  store: WorldStateN4Store;
  operationId: string;
  subject: WorldStateN4ObjectRef;
  effectiveAt: string;
  value: WorldStateN4Value;
  evidence: WorldStateN4Evidence;
  expectedRevision: number;
  now: string;
  compensatesChangeId?: string | null;
}): { store: WorldStateN4Store; change: WorldStateN4Change; idempotent: boolean } {
  const store = normalizeWorldStateN4Store(input.store);
  if (input.expectedRevision !== store.revision) throw new Error("World state revision is stale.");
  const operationId = identifier(input.operationId, "World state operation");
  const normalized = {
    subject: objectRef(input.subject),
    effectiveAt: isoTime(input.effectiveAt, "World state effective time"),
    value: stateValue(input.value),
    evidence: evidence(input.evidence),
    compensatesChangeId: input.compensatesChangeId == null ? null : identifier(input.compensatesChangeId, "Compensated world state change"),
    now: isoTime(input.now, "World state timestamp")
  };
  const replay = store.changes.find((change) => change.operationId === operationId);
  if (replay) {
    if (sameChangeInput(replay, normalized)) return { store, change: structuredClone(replay), idempotent: true };
    throw new Error("World state operation identity was already used with different content.");
  }
  if (normalized.compensatesChangeId && !store.changes.some((change) => change.changeId === normalized.compensatesChangeId && change.subject.id === normalized.subject.id)) throw new Error("Compensated world state change is unavailable for this object.");
  const revision = store.revision + 1;
  const change: WorldStateN4Change = {
    changeId: `world-state-n4.${stableSuffix(`${operationId}:${revision}`)}`,
    operationId,
    subject: normalized.subject,
    effectiveAt: normalized.effectiveAt,
    value: normalized.value,
    evidence: normalized.evidence,
    baseRevision: store.revision,
    revision,
    compensatesChangeId: normalized.compensatesChangeId,
    createdAt: normalized.now
  };
  return { store: { version: WORLD_STATE_N4_VERSION, revision, changes: [...store.changes, change].sort(compareChanges) }, change: structuredClone(change), idempotent: false };
}

export function projectWorldStateN4(input: { store: WorldStateN4Store; subjectId: string; observedAt: string }): WorldStateN4Projection {
  const store = normalizeWorldStateN4Store(input.store);
  const subjectId = identifier(input.subjectId, "World state object");
  const observedAt = isoTime(input.observedAt, "World state observation time");
  const history = store.changes.filter((change) => change.subject.id === subjectId).sort(compareChanges);
  const applicable = history.filter((change) => change.effectiveAt <= observedAt);
  const current = applicable.at(-1) ?? null;
  const following = current ? history.find((change) => change.effectiveAt > current.effectiveAt || (change.effectiveAt === current.effectiveAt && change.revision > current.revision)) ?? null : null;
  return {
    subjectId,
    observedAt,
    status: current ? "known" : "unknown",
    value: current ? structuredClone(current.value) : null,
    effectiveFrom: current?.effectiveAt ?? null,
    effectiveTo: following?.effectiveAt ?? null,
    change: current ? structuredClone(current) : null,
    history: history.map((change) => structuredClone(change))
  };
}

export function compensationValueForWorldStateN4(input: { store: WorldStateN4Store; changeId: string }): { subject: WorldStateN4ObjectRef; effectiveAt: string; value: WorldStateN4Value; evidence: WorldStateN4Evidence; compensatesChangeId: string } {
  const store = normalizeWorldStateN4Store(input.store);
  const change = store.changes.find((item) => item.changeId === identifier(input.changeId, "World state change"));
  if (!change) throw new Error("World state change does not exist.");
  const earlier = store.changes.filter((item) => item.subject.id === change.subject.id && (item.effectiveAt < change.effectiveAt || (item.effectiveAt === change.effectiveAt && item.revision < change.revision))).sort(compareChanges).at(-1);
  return { subject: structuredClone(change.subject), effectiveAt: change.effectiveAt, value: earlier ? structuredClone(earlier.value) : unknownFor(change.value), evidence: structuredClone(change.evidence), compensatesChangeId: change.changeId };
}

function normalizeChange(value: unknown): WorldStateN4Change {
  if (!isRecord(value) || !Number.isSafeInteger(value.baseRevision) || !Number.isSafeInteger(value.revision) || value.baseRevision < 0 || value.revision < 1) throw new Error("World state change is invalid.");
  return { changeId: identifier(value.changeId, "World state change"), operationId: identifier(value.operationId, "World state operation"), subject: objectRef(value.subject), effectiveAt: isoTime(value.effectiveAt, "World state effective time"), value: stateValue(value.value), evidence: evidence(value.evidence), baseRevision: value.baseRevision, revision: value.revision, compensatesChangeId: value.compensatesChangeId == null ? null : identifier(value.compensatesChangeId, "Compensated world state change"), createdAt: isoTime(value.createdAt, "World state timestamp") };
}

function stateValue(value: unknown): WorldStateN4Value {
  if (!isRecord(value)) throw new Error("World state value is invalid.");
  if (value.kind === "passage" && ["open", "closed", "unknown"].includes(String(value.state))) return { kind: "passage", state: value.state as PassageStateN4 };
  if (value.kind === "holder" && ["held", "unheld", "unknown"].includes(String(value.state))) {
    const holder = value.holder == null ? null : objectRef(value.holder);
    if ((value.state === "held") !== Boolean(holder)) throw new Error("Held state must have exactly one holder.");
    if (value.state !== "held" && holder) throw new Error("Unheld and unknown states cannot name a holder.");
    return { kind: "holder", state: value.state as HolderStateN4, holder };
  }
  throw new Error("World state kind or value is invalid.");
}

function unknownFor(value: WorldStateN4Value): WorldStateN4Value {
  return value.kind === "passage" ? { kind: "passage", state: "unknown" } : { kind: "holder", state: "unknown", holder: null };
}

function evidence(value: unknown): WorldStateN4Evidence {
  if (!isRecord(value) || value.kind !== "confirmed-event") throw new Error("World state requires one confirmed Event reference.");
  return { kind: "confirmed-event", event: objectRef(value.event) };
}

function objectRef(value: unknown): WorldStateN4ObjectRef {
  if (!isRecord(value)) throw new Error("World state object reference is invalid.");
  return { id: identifier(value.id, "World state object"), revision: identifier(value.revision, "World state object revision") };
}

function sameChangeInput(change: WorldStateN4Change, input: { subject: WorldStateN4ObjectRef; effectiveAt: string; value: WorldStateN4Value; evidence: WorldStateN4Evidence; compensatesChangeId: string | null; now: string }): boolean {
  return JSON.stringify({ subject: change.subject, effectiveAt: change.effectiveAt, value: change.value, evidence: change.evidence, compensatesChangeId: change.compensatesChangeId, now: change.createdAt }) === JSON.stringify(input);
}

function compareChanges(left: WorldStateN4Change, right: WorldStateN4Change): number { return left.effectiveAt.localeCompare(right.effectiveAt) || left.revision - right.revision; }
function identifier(value: unknown, label: string): string { if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`${label} is invalid.`); return value; }
function isoTime(value: unknown, label: string): string { if (typeof value !== "string" || !ISO_TIME.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function stableSuffix(value: string): string { let hash = 2166136261; for (const code of value) { hash ^= code.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
