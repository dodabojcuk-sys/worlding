import { createHash } from "node:crypto";

/**
 * Semantic comparison and selection contract for a single, root-derived IF.
 *
 * This is deliberately a read/plan layer: Event, Relation, WorldState and
 * NarrativeArrangement remain owned by their existing writers.  A caller must
 * materialise an accepted plan through those writers and then append the
 * resulting owner receipt references to WorkVersionAuthority.
 */
export const MULTIVERSE_B1_COMPARE_SCHEMA = "tianyan-multiverse-b1-compare/v1" as const;
export const MULTIVERSE_B1_MERGE_SCHEMA = "tianyan-multiverse-b1-merge-plan/v1" as const;

export type MultiverseOwnerKind = "Event" | "Relation" | "WorldState" | "NarrativePlacement";
export type MultiverseObject = {
  id: string;
  value: Record<string, unknown>;
  sourceRefs: string[];
  dependencyIds?: string[];
  state?: "active" | "archived" | "unknown";
};
export type MultiverseVersionSnapshot = {
  projectId: string;
  workVersionId: string;
  revision: number;
  manifestDigest: string;
  objects: Record<MultiverseOwnerKind, MultiverseObject[]>;
};
export type MultiverseDifference = {
  changeId: string;
  ownerKind: MultiverseOwnerKind;
  objectId: string;
  state: "added" | "changed" | "ended" | "unchanged" | "conflict" | "unknown";
  selection: "available" | "duplicate" | "blocked-conflict" | "not-applicable";
  summary: string;
  sourceRefs: string[];
  dependencyIds: string[];
  base: MultiverseObject | null;
  source: MultiverseObject | null;
  target: MultiverseObject | null;
};
export type MultiverseComparison = {
  schemaVersion: typeof MULTIVERSE_B1_COMPARE_SCHEMA;
  base: MultiverseVersionSnapshot;
  source: MultiverseVersionSnapshot;
  target: MultiverseVersionSnapshot;
  differences: MultiverseDifference[];
  compareDigest: string;
};

export type MultiverseMergePlan = {
  schemaVersion: typeof MULTIVERSE_B1_MERGE_SCHEMA;
  operationId: string;
  idempotencyKey: string;
  compareDigest: string;
  source: Pick<MultiverseVersionSnapshot, "projectId" | "workVersionId" | "revision" | "manifestDigest">;
  target: Pick<MultiverseVersionSnapshot, "projectId" | "workVersionId" | "revision" | "manifestDigest">;
  selectedChangeIds: string[];
  requiredChangeIds: string[];
  ownerWriteOrder: MultiverseOwnerKind[];
  receiptId: string;
};

/**
 * Durable-owner adapters use this small state machine to make a B1 merge
 * resumable without becoming an Event/Relation/WorldState repository.  The
 * receipt contains only the frozen plan and references returned by the
 * existing Owners; the adapter remains responsible for persisting it.
 */
export type MultiverseMergeExecutionStatus = "planned" | "applying" | "recovery-required" | "applied" | "compensating" | "compensated";
export type MultiverseMergeOwnerReceipt = { ownerKind: MultiverseOwnerKind; changeId: string; receiptRef: string; targetRef: string };
export type MultiverseMergeExecution = {
  schemaVersion: "tianyan-multiverse-b1-merge-execution/v1";
  plan: MultiverseMergePlan;
  status: MultiverseMergeExecutionStatus;
  ownerReceipts: MultiverseMergeOwnerReceipt[];
  resultVersion: { workVersionId: string; revision: number; manifestDigest: string } | null;
  failure: string | null;
};

const ownerOrder: MultiverseOwnerKind[] = ["Event", "Relation", "WorldState", "NarrativePlacement"];

export function compareMultiverseB1Versions(input: { base: MultiverseVersionSnapshot; source: MultiverseVersionSnapshot; target: MultiverseVersionSnapshot }): MultiverseComparison {
  assertComparable(input.base, input.source, input.target);
  const differences: MultiverseDifference[] = [];
  for (const ownerKind of ownerOrder) {
    const base = index(input.base.objects[ownerKind], ownerKind);
    const source = index(input.source.objects[ownerKind], ownerKind);
    const target = index(input.target.objects[ownerKind], ownerKind);
    for (const objectId of [...new Set([...base.keys(), ...source.keys(), ...target.keys()])].sort()) {
      differences.push(compareObject(ownerKind, objectId, base.get(objectId) || null, source.get(objectId) || null, target.get(objectId) || null));
    }
  }
  const projection = { base: identity(input.base), source: identity(input.source), target: identity(input.target), differences };
  return { schemaVersion: MULTIVERSE_B1_COMPARE_SCHEMA, ...projection, compareDigest: digest(projection) };
}

export function planMultiverseB1Merge(input: { comparison: MultiverseComparison; selectedChangeIds: string[]; operationId: string; idempotencyKey: string; currentTarget: Pick<MultiverseVersionSnapshot, "workVersionId" | "revision" | "manifestDigest"> }): MultiverseMergePlan {
  const selected = unique(input.selectedChangeIds);
  if (!selected.length) throw new Error("Choose at least one available IF change.");
  if (input.currentTarget.workVersionId !== input.comparison.target.workVersionId || input.currentTarget.revision !== input.comparison.target.revision || input.currentTarget.manifestDigest !== input.comparison.target.manifestDigest) {
    throw new Error("The target WorkVersion changed after comparison; compare again before merging.");
  }
  const byId = new Map(input.comparison.differences.map((item) => [item.changeId, item]));
  const required = new Set<string>();
  for (const changeId of selected) {
    const difference = byId.get(changeId);
    if (!difference) throw new Error(`Unknown IF change: ${changeId}.`);
    if (difference.selection !== "available") throw new Error(`IF change is not mergeable: ${difference.summary}`);
    for (const dependencyId of difference.dependencyIds) {
      const dependency = [...byId.values()].find((item) => item.objectId === dependencyId && item.selection === "available");
      if (!dependency) throw new Error(`IF change ${difference.objectId} has no mergeable dependency for ${dependencyId}.`);
      if (!selected.includes(dependency.changeId)) required.add(dependency.changeId);
    }
  }
  const all = unique([...selected, ...required]);
  const writes = unique(all.map((changeId) => byId.get(changeId)!.ownerKind)).sort((left, right) => ownerOrder.indexOf(left) - ownerOrder.indexOf(right));
  const material = { compareDigest: input.comparison.compareDigest, source: identity(input.comparison.source), target: identity(input.comparison.target), selectedChangeIds: all, operationId: input.operationId, idempotencyKey: input.idempotencyKey };
  return {
    schemaVersion: MULTIVERSE_B1_MERGE_SCHEMA,
    operationId: requiredText(input.operationId, "operationId"),
    idempotencyKey: requiredText(input.idempotencyKey, "idempotencyKey"),
    compareDigest: input.comparison.compareDigest,
    source: identity(input.comparison.source),
    target: identity(input.comparison.target),
    selectedChangeIds: selected,
    requiredChangeIds: [...required].sort(),
    ownerWriteOrder: writes,
    receiptId: `multiverse-b1-merge.${digest(material).slice(0, 32)}`
  };
}

export function beginMultiverseB1Merge(plan: MultiverseMergePlan): MultiverseMergeExecution {
  return {
    schemaVersion: "tianyan-multiverse-b1-merge-execution/v1",
    plan: clone(plan), status: "planned", ownerReceipts: [], resultVersion: null, failure: null
  };
}

/** Records exactly one existing-Owner result. Replays are accepted only when
 * they name the same result; a lost HTTP response can therefore resume safely. */
export function recordMultiverseB1OwnerResult(input: { execution: MultiverseMergeExecution; ownerKind: MultiverseOwnerKind; changeId: string; receiptRef: string; targetRef: string }): MultiverseMergeExecution {
  const current = clone(input.execution);
  if (!["planned", "applying", "recovery-required"].includes(current.status)) throw new Error(`Cannot write an Owner result while merge is ${current.status}.`);
  if (!current.plan.selectedChangeIds.includes(input.changeId) && !current.plan.requiredChangeIds.includes(input.changeId)) throw new Error("Owner result does not belong to the selected B1 merge.");
  if (!current.plan.ownerWriteOrder.includes(input.ownerKind)) throw new Error("Owner result is outside the B1 merge write order.");
  const prior = current.ownerReceipts.find((item) => item.changeId === input.changeId);
  const next = { ownerKind: input.ownerKind, changeId: input.changeId, receiptRef: requiredText(input.receiptRef, "receiptRef"), targetRef: requiredText(input.targetRef, "targetRef") };
  if (prior && !same(prior, next)) throw new Error("B1 idempotency key already has a different Owner result.");
  if (!prior) current.ownerReceipts.push(next);
  current.status = "applying";
  current.failure = null;
  return current;
}

export function markMultiverseB1MergeRecovery(execution: MultiverseMergeExecution, failure: string): MultiverseMergeExecution {
  const next = clone(execution);
  if (!["planned", "applying", "recovery-required"].includes(next.status)) throw new Error(`Cannot recover merge in ${next.status}.`);
  next.status = "recovery-required";
  next.failure = requiredText(failure, "failure");
  return next;
}

export function finishMultiverseB1Merge(input: { execution: MultiverseMergeExecution; resultVersion: { workVersionId: string; revision: number; manifestDigest: string } }): MultiverseMergeExecution {
  const next = clone(input.execution);
  const required = unique([...next.plan.selectedChangeIds, ...next.plan.requiredChangeIds]);
  if (next.status === "applied") {
    if (!same(next.resultVersion, input.resultVersion)) throw new Error("B1 idempotency key already has a different result version.");
    return next;
  }
  if (!["planned", "applying", "recovery-required"].includes(next.status) || required.some((changeId) => !next.ownerReceipts.some((item) => item.changeId === changeId))) throw new Error("B1 merge is missing one or more required Owner receipts.");
  if (input.resultVersion.workVersionId !== next.plan.target.workVersionId || !Number.isSafeInteger(input.resultVersion.revision) || !input.resultVersion.manifestDigest) throw new Error("B1 merge result does not bind to its target WorkVersion.");
  next.status = "applied";
  next.resultVersion = clone(input.resultVersion);
  next.failure = null;
  return next;
}

export function beginMultiverseB1Compensation(execution: MultiverseMergeExecution): MultiverseMergeExecution {
  const next = clone(execution);
  if (next.status === "compensated") return next;
  if (next.status !== "applied") throw new Error("Only an applied B1 merge can be compensated.");
  next.status = "compensating";
  return next;
}

export function finishMultiverseB1Compensation(execution: MultiverseMergeExecution): MultiverseMergeExecution {
  const next = clone(execution);
  if (next.status === "compensated") return next;
  if (next.status !== "compensating") throw new Error("B1 compensation has not started.");
  next.status = "compensated";
  return next;
}

function compareObject(ownerKind: MultiverseOwnerKind, objectId: string, base: MultiverseObject | null, source: MultiverseObject | null, target: MultiverseObject | null): MultiverseDifference {
  const changeId = `multiverse-b1.${ownerKind.toLowerCase()}.${objectId}`;
  const baseValue = semanticValue(base);
  const sourceValue = semanticValue(source);
  const targetValue = semanticValue(target);
  const sourceChanged = !same(sourceValue, baseValue);
  const targetChanged = !same(targetValue, baseValue);
  const sameResult = same(sourceValue, targetValue);
  const state = source?.state === "unknown" || target?.state === "unknown" || base?.state === "unknown"
    ? "unknown"
    : !sourceChanged ? "unchanged"
    : source === null || source?.state === "archived" ? "ended"
    : base === null ? "added"
    : targetChanged && !sameResult ? "conflict"
    : "changed";
  const selection = state === "unknown" || state === "unchanged" ? "not-applicable"
    : state === "conflict" ? "blocked-conflict"
    : sameResult ? "duplicate"
    : targetChanged ? "not-applicable"
    : "available";
  return {
    changeId,
    ownerKind,
    objectId,
    state,
    selection,
    summary: `${ownerKind} ${objectId}: ${state}`,
    sourceRefs: unique([...(source?.sourceRefs || []), ...(base?.sourceRefs || [])]),
    dependencyIds: unique(source?.dependencyIds || []),
    base: clone(base), source: clone(source), target: clone(target)
  };
}

function assertComparable(base: MultiverseVersionSnapshot, source: MultiverseVersionSnapshot, target: MultiverseVersionSnapshot) {
  if (!base.projectId || base.projectId !== source.projectId || base.projectId !== target.projectId) throw new Error("IF comparison requires three snapshots from one Project.");
  if (source.workVersionId === target.workVersionId) throw new Error("IF source and merge target must be different WorkVersions.");
  if (!base.workVersionId || !base.manifestDigest || !source.manifestDigest || !target.manifestDigest) throw new Error("IF comparison requires frozen WorkVersion identities and manifest digests.");
}
function index(items: MultiverseObject[], ownerKind: string) { const map = new Map<string, MultiverseObject>(); for (const item of items || []) { if (!item?.id || map.has(item.id)) throw new Error(`${ownerKind} snapshot has a missing or duplicate stable object id.`); map.set(item.id, item); } return map; }
function semanticValue(object: MultiverseObject | null) { return object ? { state: object.state || "active", value: object.value } : null; }
function identity(value: MultiverseVersionSnapshot) { return { projectId: value.projectId, workVersionId: value.workVersionId, revision: value.revision, manifestDigest: value.manifestDigest }; }
function same(left: unknown, right: unknown) { return canonical(left) === canonical(right); }
function unique(items: string[]) { return [...new Set(items)].sort(); }
function requiredText(value: string, name: string) { const text = String(value || "").trim(); if (!text) throw new Error(`${name} is required.`); return text; }
function digest(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`; } return JSON.stringify(value); }
function clone<T>(value: T): T { return value === null ? value : structuredClone(value); }
