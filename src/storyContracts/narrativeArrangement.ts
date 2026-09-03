import { createHash } from "node:crypto";

import { stableJson } from "../storyContinuity/continuityValidation.ts";

export const NARRATIVE_ARRANGEMENT_SCHEMA = "tianyan-narrative-arrangement/r0" as const;
export const NARRATIVE_PLACEMENT_SCHEMA = "tianyan-narrative-placement/r0" as const;
export const NARRATIVE_ARRANGEMENT_REVISION_SCHEMA = "tianyan-narrative-arrangement-revision/r0" as const;
export const NARRATIVE_ARRANGEMENT_RECEIPT_SCHEMA = "tianyan-narrative-arrangement-receipt/r0" as const;
export const NARRATIVE_ARRANGEMENT_PROJECTION_SCHEMA = "tianyan-narrative-arrangement-projection/r0" as const;
export const NARRATIVE_ARRANGEMENT_STORE_SCHEMA = "tianyan-story-unit-narrative-arrangements/r0" as const;

const ORDER_KEY_STEP = 1_024;

export type NarrativePlacementRole = "primary" | "flashback" | "recap" | "reveal" | "reinterpretation";

export type NarrativePlacementSourceRef = {
  sourceKind: "author-action" | "author-control";
  authorActionId: string;
  sourceRef: string;
  capturedAt: string;
};

export type NarrativePlacement = {
  schemaVersion: typeof NARRATIVE_PLACEMENT_SCHEMA;
  placementId: string;
  eventId: string;
  arrangementId: string;
  storyUnitId: string;
  workVersionId: string;
  sourceLineageId: string;
  narrativePathId: string;
  orderKey: number;
  role: NarrativePlacementRole;
  source: NarrativePlacementSourceRef;
  createdRevision: number;
  updatedRevision: number;
};

export type NarrativeArrangementRevision = {
  schemaVersion: typeof NARRATIVE_ARRANGEMENT_REVISION_SCHEMA;
  revision: number;
  previousRevision: number | null;
  operationId: string;
  authorActionId: string;
  createdAt: string;
  placements: NarrativePlacement[];
  revisionDigest: string;
};

export type NarrativeArrangementReceipt = {
  schemaVersion: typeof NARRATIVE_ARRANGEMENT_RECEIPT_SCHEMA;
  receiptId: string;
  arrangementId: string;
  action: "create" | "insert" | "move" | "remove" | "rollback";
  operationId: string;
  authorActionId: string;
  payloadDigest: string;
  expectedRevision: number;
  beforeRevision: number;
  afterRevision: number;
  beforePlacementIds: string[];
  afterPlacementIds: string[];
  rollbackOfRevision: number | null;
  createdAt: string;
  receiptDigest: string;
};

export type NarrativeArrangement = {
  schemaVersion: typeof NARRATIVE_ARRANGEMENT_SCHEMA;
  arrangementId: string;
  projectId: string;
  workVersionId: string;
  sourceLineageId: string;
  narrativePathId: string;
  ownerStoryUnitId: string;
  currentRevision: number;
  currentVersion: string;
  revisions: NarrativeArrangementRevision[];
  receipts: NarrativeArrangementReceipt[];
  extensions: Record<string, unknown>;
};

export type NarrativeArrangementStore = {
  schemaVersion: typeof NARRATIVE_ARRANGEMENT_STORE_SCHEMA;
  ownerStoryUnitId: string;
  arrangements: NarrativeArrangement[];
  extensions: Record<string, unknown>;
};

export type NarrativePositionIntent =
  | { kind: "start" | "end" }
  | { kind: "before" | "after"; anchorPlacementId: string };

type BaseMutation = {
  operationId: string;
  authorActionId: string;
  sourceKind: NarrativePlacementSourceRef["sourceKind"];
  sourceRef: string;
  expectedRevision: number;
  createdAt: string;
};

export type NarrativeArrangementMutation =
  | (BaseMutation & { action: "insert"; eventId: string; storyUnitId: string; role: NarrativePlacementRole; position: NarrativePositionIntent })
  | (BaseMutation & { action: "move"; placementId: string; storyUnitId: string; position: NarrativePositionIntent })
  | (BaseMutation & { action: "remove"; placementId: string })
  | (BaseMutation & { action: "rollback"; targetRevision: number });

export type NarrativeArrangementConflictCode =
  | "stale-arrangement-revision"
  | "idempotency-key-reused"
  | "placement-not-found"
  | "anchor-not-found"
  | "anchor-unit-mismatch"
  | "order-conflict"
  | "branch-mismatch"
  | "rollback-revision-not-found";

export type NarrativeArrangementMutationResult =
  | { conflict: false; replayed: boolean; arrangement: NarrativeArrangement; receipt: NarrativeArrangementReceipt }
  | { conflict: true; replayed: false; code: NarrativeArrangementConflictCode; arrangement: NarrativeArrangement; receipt: null };

export type NarrativeProjectionStoryUnit = { storyUnitId: string; order: number };

export type NarrativeArrangementProjection = {
  schemaVersion: typeof NARRATIVE_ARRANGEMENT_PROJECTION_SCHEMA;
  projectId: string;
  workVersionId: string;
  sourceLineageId: string | null;
  narrativePathId: string;
  arrangementId: string | null;
  arrangementRevision: number | null;
  arrangementVersion: string | null;
  placed: Array<{
    state: "placed";
    narrativeIndex: number;
    placementId: string;
    eventId: string;
    storyUnitId: string;
    orderKey: number;
    role: NarrativePlacementRole;
    source: NarrativePlacementSourceRef;
    placementRevision: number;
  }>;
  unplaced: Record<string, { state: "unplaced"; eventId: string; narrativeIndex: null }>;
  conflicts: Array<{
    state: "order-conflict" | "dangling-reference";
    placementId: string;
    eventId: string;
    storyUnitId: string;
    reason: string;
  }>;
};

export function createNarrativeArrangement(input: {
  projectId: string;
  workVersionId: string;
  sourceLineageId: string;
  narrativePathId: string;
  ownerStoryUnitId: string;
  operationId: string;
  authorActionId: string;
  createdAt: string;
  extensions?: Record<string, unknown>;
}): { arrangement: NarrativeArrangement; receipt: NarrativeArrangementReceipt } {
  const scope = normalizeScope(input);
  const arrangementId = narrativeArrangementId(scope);
  const operationId = requireStableText(input.operationId, "Narrative arrangement operation", 180);
  const authorActionId = requireStableText(input.authorActionId, "Narrative arrangement author action", 180);
  const createdAt = requireTimestamp(input.createdAt);
  const revision = createRevision({ revision: 1, previousRevision: null, placements: [], operationId, authorActionId, createdAt });
  const receipt = createReceipt({
    arrangementId,
    action: "create",
    operationId,
    authorActionId,
    payloadDigest: digest({ ...scope, operationId, authorActionId, createdAt }),
    expectedRevision: 0,
    beforeRevision: 0,
    afterRevision: 1,
    beforePlacementIds: [],
    afterPlacementIds: [],
    rollbackOfRevision: null,
    createdAt
  });
  return {
    arrangement: {
      schemaVersion: NARRATIVE_ARRANGEMENT_SCHEMA,
      arrangementId,
      ...scope,
      currentRevision: revision.revision,
      currentVersion: revision.revisionDigest,
      revisions: [revision],
      receipts: [receipt],
      extensions: normalizeExtensions(input.extensions)
    },
    receipt
  };
}

export function applyNarrativeArrangementMutation(
  current: NarrativeArrangement,
  rawMutation: NarrativeArrangementMutation,
  allowedStoryUnitIds: ReadonlySet<string>
): NarrativeArrangementMutationResult {
  const arrangement = normalizeNarrativeArrangement(current);
  const mutation = normalizeMutation(rawMutation);
  const payloadDigest = digest(mutation);
  const priorReceipt = arrangement.receipts.find((receipt) => receipt.operationId === mutation.operationId);
  if (priorReceipt) {
    if (priorReceipt.payloadDigest !== payloadDigest) return conflict("idempotency-key-reused", arrangement);
    return { conflict: false, replayed: true, arrangement, receipt: priorReceipt };
  }
  if (mutation.expectedRevision !== arrangement.currentRevision) return conflict("stale-arrangement-revision", arrangement);

  const before = currentPlacements(arrangement);
  if (duplicates(before.map((placement) => placement.placementId)).size || duplicates(before.map((placement) => `${placement.storyUnitId}:${placement.orderKey}`)).size) {
    return conflict("order-conflict", arrangement);
  }
  let after: NarrativePlacement[];
  let rollbackOfRevision: number | null = null;
  if (mutation.action === "insert") {
    if (!allowedStoryUnitIds.has(mutation.storyUnitId)) return conflict("branch-mismatch", arrangement);
    const placementId = narrativePlacementId(arrangement.arrangementId, mutation.operationId);
    const placement: NarrativePlacement = {
      schemaVersion: NARRATIVE_PLACEMENT_SCHEMA,
      placementId,
      eventId: mutation.eventId,
      arrangementId: arrangement.arrangementId,
      storyUnitId: mutation.storyUnitId,
      workVersionId: arrangement.workVersionId,
      sourceLineageId: arrangement.sourceLineageId,
      narrativePathId: arrangement.narrativePathId,
      orderKey: 0,
      role: mutation.role,
      source: sourceRef(mutation),
      createdRevision: arrangement.currentRevision + 1,
      updatedRevision: arrangement.currentRevision + 1
    };
    const positioned = placeIntoUnit(before, placement, mutation.storyUnitId, mutation.position);
    if (positioned.code) return conflict(positioned.code, arrangement);
    after = rebalancePlacementOrder(positioned.placements);
  } else if (mutation.action === "move") {
    if (!allowedStoryUnitIds.has(mutation.storyUnitId)) return conflict("branch-mismatch", arrangement);
    const existing = before.find((placement) => placement.placementId === mutation.placementId);
    if (!existing) return conflict("placement-not-found", arrangement);
    const without = before.filter((placement) => placement.placementId !== mutation.placementId);
    const moved = { ...existing, storyUnitId: mutation.storyUnitId, source: sourceRef(mutation), updatedRevision: arrangement.currentRevision + 1 };
    const positioned = placeIntoUnit(without, moved, mutation.storyUnitId, mutation.position);
    if (positioned.code) return conflict(positioned.code, arrangement);
    after = rebalancePlacementOrder(positioned.placements);
  } else if (mutation.action === "remove") {
    if (!before.some((placement) => placement.placementId === mutation.placementId)) return conflict("placement-not-found", arrangement);
    after = rebalancePlacementOrder(before.filter((placement) => placement.placementId !== mutation.placementId));
  } else {
    const target = arrangement.revisions.find((revision) => revision.revision === mutation.targetRevision);
    if (!target) return conflict("rollback-revision-not-found", arrangement);
    rollbackOfRevision = target.revision;
    after = target.placements.map((placement) => ({ ...placement, updatedRevision: arrangement.currentRevision + 1 }));
  }

  const nextRevision = createRevision({
    revision: arrangement.currentRevision + 1,
    previousRevision: arrangement.currentRevision,
    placements: after,
    operationId: mutation.operationId,
    authorActionId: mutation.authorActionId,
    createdAt: mutation.createdAt
  });
  const receipt = createReceipt({
    arrangementId: arrangement.arrangementId,
    action: mutation.action,
    operationId: mutation.operationId,
    authorActionId: mutation.authorActionId,
    payloadDigest,
    expectedRevision: mutation.expectedRevision,
    beforeRevision: arrangement.currentRevision,
    afterRevision: nextRevision.revision,
    beforePlacementIds: before.map((placement) => placement.placementId),
    afterPlacementIds: after.map((placement) => placement.placementId),
    rollbackOfRevision,
    createdAt: mutation.createdAt
  });
  const next = normalizeNarrativeArrangement({
    ...arrangement,
    currentRevision: nextRevision.revision,
    currentVersion: nextRevision.revisionDigest,
    revisions: [...arrangement.revisions, nextRevision],
    receipts: [...arrangement.receipts, receipt]
  });
  return { conflict: false, replayed: false, arrangement: next, receipt };
}

export function projectNarrativeArrangement(input: {
  projectId: string;
  workVersionId: string;
  narrativePathId: string;
  eventIds: Iterable<string>;
  storyUnits: NarrativeProjectionStoryUnit[];
  arrangement: NarrativeArrangement | null;
}): NarrativeArrangementProjection {
  const projectId = requireStableText(input.projectId, "Narrative projection Project", 180);
  const workVersionId = requireStableText(input.workVersionId, "Narrative projection WorkVersion", 180);
  const narrativePathId = requireStableText(input.narrativePathId, "Narrative projection path", 180);
  const eventIds = new Set([...input.eventIds].map((eventId) => requireStableText(eventId, "Narrative projection Event", 180)));
  const storyUnitOrders = new Map<string, number>();
  const duplicateUnitOrders = new Set<number>();
  for (const unit of input.storyUnits) {
    const storyUnitId = requireStableText(unit.storyUnitId, "Narrative projection Story Unit", 180);
    const order = requireInteger(unit.order, "Narrative projection Story Unit order");
    if ([...storyUnitOrders.values()].includes(order)) duplicateUnitOrders.add(order);
    storyUnitOrders.set(storyUnitId, order);
  }
  const arrangement = input.arrangement == null ? null : normalizeNarrativeArrangement(input.arrangement);
  if (arrangement && (arrangement.projectId !== projectId || arrangement.workVersionId !== workVersionId || arrangement.narrativePathId !== narrativePathId)) {
    throw new Error("Narrative arrangement projection scope mismatch.");
  }

  const unplaced = Object.fromEntries([...eventIds].sort().map((eventId) => [eventId, { state: "unplaced" as const, eventId, narrativeIndex: null }]));
  if (!arrangement) return emptyProjection({ projectId, workVersionId, narrativePathId, unplaced });

  const placements = currentPlacements(arrangement);
  const duplicatePlacementIds = duplicates(placements.map((placement) => placement.placementId));
  const duplicateOrderKeys = duplicates(placements.map((placement) => `${placement.storyUnitId}:${placement.orderKey}`));
  const conflicts: NarrativeArrangementProjection["conflicts"] = [];
  const valid: NarrativePlacement[] = [];
  for (const placement of placements) {
    const unitOrder = storyUnitOrders.get(placement.storyUnitId);
    const reason = !eventIds.has(placement.eventId)
      ? "Event reference does not exist in the current story/work."
      : unitOrder == null
        ? "Story Unit reference does not exist in the current narrative path."
        : duplicatePlacementIds.has(placement.placementId)
          ? "Placement identity occurs more than once."
          : duplicateOrderKeys.has(`${placement.storyUnitId}:${placement.orderKey}`)
            ? "Two Placements use the same formal order key in one Story Unit."
            : duplicateUnitOrders.has(unitOrder)
              ? "Two Story Units use the same formal Story Unit order."
              : null;
    if (reason) {
      conflicts.push({
        state: !eventIds.has(placement.eventId) || unitOrder == null ? "dangling-reference" : "order-conflict",
        placementId: placement.placementId,
        eventId: placement.eventId,
        storyUnitId: placement.storyUnitId,
        reason
      });
    } else {
      valid.push(placement);
      delete unplaced[placement.eventId];
    }
  }
  valid.sort((left, right) => storyUnitOrders.get(left.storyUnitId)! - storyUnitOrders.get(right.storyUnitId)! || left.orderKey - right.orderKey);
  return {
    schemaVersion: NARRATIVE_ARRANGEMENT_PROJECTION_SCHEMA,
    projectId,
    workVersionId,
    sourceLineageId: arrangement.sourceLineageId,
    narrativePathId,
    arrangementId: arrangement.arrangementId,
    arrangementRevision: arrangement.currentRevision,
    arrangementVersion: arrangement.currentVersion,
    placed: valid.map((placement, narrativeIndex) => ({
      state: "placed",
      narrativeIndex,
      placementId: placement.placementId,
      eventId: placement.eventId,
      storyUnitId: placement.storyUnitId,
      orderKey: placement.orderKey,
      role: placement.role,
      source: placement.source,
      placementRevision: placement.updatedRevision
    })),
    unplaced,
    conflicts
  };
}

export function normalizeNarrativeArrangement(raw: NarrativeArrangement): NarrativeArrangement {
  if (!raw || raw.schemaVersion !== NARRATIVE_ARRANGEMENT_SCHEMA) throw new Error("Unknown NarrativeArrangement schema.");
  const scope = normalizeScope(raw);
  const arrangementId = requireStableText(raw.arrangementId, "Narrative arrangement identity", 180);
  if (arrangementId !== narrativeArrangementId(scope)) throw new Error("Narrative arrangement identity does not match its scope.");
  const revisions = raw.revisions.map(normalizeRevision);
  if (revisions.length === 0) throw new Error("Narrative arrangement has no formal revision.");
  for (let index = 0; index < revisions.length; index += 1) {
    const revision = revisions[index]!;
    if (revision.revision !== index + 1 || revision.previousRevision !== (index === 0 ? null : index)) throw new Error("Narrative arrangement revision chain is broken.");
    for (const placement of revision.placements) assertPlacementScope(placement, arrangementId, scope);
  }
  const head = revisions.at(-1)!;
  if (raw.currentRevision !== head.revision || raw.currentVersion !== head.revisionDigest) throw new Error("Narrative arrangement head does not match its revision chain.");
  const receipts = raw.receipts.map(normalizeReceipt);
  if (receipts.length !== revisions.length) throw new Error("Narrative arrangement receipt chain is incomplete.");
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index]!;
    if (receipt.arrangementId !== arrangementId || receipt.afterRevision !== index + 1 || receipt.beforeRevision !== index || receipt.expectedRevision !== index) {
      throw new Error("Narrative arrangement receipt chain is broken.");
    }
  }
  return {
    schemaVersion: NARRATIVE_ARRANGEMENT_SCHEMA,
    arrangementId,
    ...scope,
    currentRevision: head.revision,
    currentVersion: head.revisionDigest,
    revisions,
    receipts,
    extensions: normalizeExtensions(raw.extensions)
  };
}

export function serializeNarrativeArrangementStore(store: NarrativeArrangementStore): string {
  return stableJson(normalizeNarrativeArrangementStore(store));
}

export function parseNarrativeArrangementStore(raw: unknown, ownerStoryUnitId: string): NarrativeArrangementStore {
  if (raw == null || raw === "") return emptyNarrativeArrangementStore(ownerStoryUnitId);
  if (typeof raw !== "string") throw new Error("Story Unit narrative arrangement payload must be a serialized object.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Story Unit narrative arrangement payload is invalid JSON.");
  }
  return normalizeNarrativeArrangementStore(parsed as NarrativeArrangementStore, ownerStoryUnitId);
}

export function emptyNarrativeArrangementStore(ownerStoryUnitId: string): NarrativeArrangementStore {
  return {
    schemaVersion: NARRATIVE_ARRANGEMENT_STORE_SCHEMA,
    ownerStoryUnitId: requireStableText(ownerStoryUnitId, "Narrative arrangement owner Story Unit", 180),
    arrangements: [],
    extensions: {}
  };
}

export function narrativeArrangementId(scope: Pick<NarrativeArrangement, "projectId" | "workVersionId" | "narrativePathId" | "ownerStoryUnitId">): string {
  const normalized = normalizeScope({ ...scope, sourceLineageId: "identity-only" });
  return `narrative-arrangement.${digest([normalized.projectId, normalized.workVersionId, normalized.narrativePathId, normalized.ownerStoryUnitId]).slice(0, 32)}`;
}

export function narrativePlacementId(arrangementId: string, operationId: string): string {
  return `narrative-placement.${digest([requireStableText(arrangementId, "Narrative arrangement identity", 180), requireStableText(operationId, "Narrative placement operation", 180)]).slice(0, 32)}`;
}

export function currentPlacements(arrangement: NarrativeArrangement): NarrativePlacement[] {
  const head = arrangement.revisions.find((revision) => revision.revision === arrangement.currentRevision);
  if (!head) throw new Error("Narrative arrangement current revision is missing.");
  return structuredClone(head.placements);
}

export function rebalancePlacementOrder(placements: NarrativePlacement[]): NarrativePlacement[] {
  const unitOrder = new Map<string, NarrativePlacement[]>();
  for (const placement of placements) {
    const group = unitOrder.get(placement.storyUnitId) ?? [];
    group.push(structuredClone(placement));
    unitOrder.set(placement.storyUnitId, group);
  }
  const keyed = new Map<string, NarrativePlacement>();
  for (const group of unitOrder.values()) {
    group.sort((left, right) => left.orderKey - right.orderKey);
    group.forEach((placement, index) => keyed.set(placement.placementId, { ...placement, orderKey: (index + 1) * ORDER_KEY_STEP }));
  }
  return placements.map((placement) => keyed.get(placement.placementId)!);
}

function normalizeNarrativeArrangementStore(raw: NarrativeArrangementStore, expectedOwnerStoryUnitId?: string): NarrativeArrangementStore {
  if (!raw || raw.schemaVersion !== NARRATIVE_ARRANGEMENT_STORE_SCHEMA) throw new Error("Unknown Story Unit narrative arrangement store schema.");
  const ownerStoryUnitId = requireStableText(raw.ownerStoryUnitId, "Narrative arrangement owner Story Unit", 180);
  if (expectedOwnerStoryUnitId && ownerStoryUnitId !== expectedOwnerStoryUnitId) throw new Error("Narrative arrangement store owner does not match its Story Unit.");
  const arrangements = raw.arrangements.map(normalizeNarrativeArrangement);
  if (arrangements.some((arrangement) => arrangement.ownerStoryUnitId !== ownerStoryUnitId)) throw new Error("Narrative arrangement is hosted by the wrong Story Unit.");
  if (duplicates(arrangements.map((arrangement) => arrangement.arrangementId)).size) throw new Error("Narrative arrangement identity is duplicated in one Story Unit.");
  return { schemaVersion: NARRATIVE_ARRANGEMENT_STORE_SCHEMA, ownerStoryUnitId, arrangements, extensions: normalizeExtensions(raw.extensions) };
}

function placeIntoUnit(
  placements: NarrativePlacement[],
  placement: NarrativePlacement,
  storyUnitId: string,
  position: NarrativePositionIntent
): { placements: NarrativePlacement[]; code: "anchor-not-found" | "anchor-unit-mismatch" | null } {
  const inUnit = placements.filter((candidate) => candidate.storyUnitId === storyUnitId).sort((left, right) => left.orderKey - right.orderKey);
  let index: number;
  if (position.kind === "start") index = 0;
  else if (position.kind === "end") index = inUnit.length;
  else {
    const anyAnchor = placements.find((candidate) => candidate.placementId === position.anchorPlacementId);
    if (!anyAnchor) return { placements, code: "anchor-not-found" };
    if (anyAnchor.storyUnitId !== storyUnitId) return { placements, code: "anchor-unit-mismatch" };
    const anchorIndex = inUnit.findIndex((candidate) => candidate.placementId === position.anchorPlacementId);
    index = position.kind === "before" ? anchorIndex : anchorIndex + 1;
  }
  inUnit.splice(index, 0, placement);
  inUnit.forEach((candidate, placementIndex) => {
    candidate.orderKey = (placementIndex + 1) * ORDER_KEY_STEP;
  });
  let replacementIndex = 0;
  const merged = placements.map((candidate) => candidate.storyUnitId === storyUnitId ? inUnit[replacementIndex++]! : candidate);
  if (replacementIndex < inUnit.length) merged.push(...inUnit.slice(replacementIndex));
  return { placements: merged, code: null };
}

function createRevision(input: Omit<NarrativeArrangementRevision, "schemaVersion" | "revisionDigest">): NarrativeArrangementRevision {
  const body = {
    schemaVersion: NARRATIVE_ARRANGEMENT_REVISION_SCHEMA,
    revision: requirePositiveInteger(input.revision, "Narrative arrangement revision"),
    previousRevision: input.previousRevision == null ? null : requirePositiveInteger(input.previousRevision, "Narrative arrangement previous revision"),
    operationId: requireStableText(input.operationId, "Narrative arrangement operation", 180),
    authorActionId: requireStableText(input.authorActionId, "Narrative arrangement author action", 180),
    createdAt: requireTimestamp(input.createdAt),
    placements: input.placements.map(normalizePlacement)
  };
  return { ...body, revisionDigest: digest(body) };
}

function normalizeRevision(raw: NarrativeArrangementRevision): NarrativeArrangementRevision {
  if (raw.schemaVersion !== NARRATIVE_ARRANGEMENT_REVISION_SCHEMA) throw new Error("Unknown NarrativeArrangement revision schema.");
  const normalized = createRevision(raw);
  if (normalized.revisionDigest !== raw.revisionDigest) throw new Error("Narrative arrangement revision digest mismatch.");
  return normalized;
}

function createReceipt(input: Omit<NarrativeArrangementReceipt, "schemaVersion" | "receiptId" | "receiptDigest">): NarrativeArrangementReceipt {
  const body = {
    schemaVersion: NARRATIVE_ARRANGEMENT_RECEIPT_SCHEMA,
    receiptId: `narrative-arrangement-receipt.${digest([input.arrangementId, input.operationId]).slice(0, 40)}`,
    arrangementId: requireStableText(input.arrangementId, "Narrative arrangement identity", 180),
    action: input.action,
    operationId: requireStableText(input.operationId, "Narrative arrangement operation", 180),
    authorActionId: requireStableText(input.authorActionId, "Narrative arrangement author action", 180),
    payloadDigest: requireDigest(input.payloadDigest, "Narrative arrangement payload digest"),
    expectedRevision: requireNonNegativeInteger(input.expectedRevision, "Narrative arrangement expected revision"),
    beforeRevision: requireNonNegativeInteger(input.beforeRevision, "Narrative arrangement before revision"),
    afterRevision: requirePositiveInteger(input.afterRevision, "Narrative arrangement after revision"),
    beforePlacementIds: input.beforePlacementIds.map((id) => requireStableText(id, "Narrative placement identity", 180)),
    afterPlacementIds: input.afterPlacementIds.map((id) => requireStableText(id, "Narrative placement identity", 180)),
    rollbackOfRevision: input.rollbackOfRevision == null ? null : requirePositiveInteger(input.rollbackOfRevision, "Narrative arrangement rollback revision"),
    createdAt: requireTimestamp(input.createdAt)
  };
  return { ...body, receiptDigest: digest(body) };
}

function normalizeReceipt(raw: NarrativeArrangementReceipt): NarrativeArrangementReceipt {
  if (raw.schemaVersion !== NARRATIVE_ARRANGEMENT_RECEIPT_SCHEMA) throw new Error("Unknown NarrativeArrangement receipt schema.");
  const normalized = createReceipt(raw);
  if (normalized.receiptId !== raw.receiptId || normalized.receiptDigest !== raw.receiptDigest) throw new Error("Narrative arrangement receipt digest mismatch.");
  return normalized;
}

function normalizePlacement(raw: NarrativePlacement): NarrativePlacement {
  if (raw.schemaVersion !== NARRATIVE_PLACEMENT_SCHEMA) throw new Error("Unknown NarrativePlacement schema.");
  return {
    schemaVersion: NARRATIVE_PLACEMENT_SCHEMA,
    placementId: requireStableText(raw.placementId, "Narrative placement identity", 180),
    eventId: requireStableText(raw.eventId, "Narrative placement Event", 180),
    arrangementId: requireStableText(raw.arrangementId, "Narrative placement arrangement", 180),
    storyUnitId: requireStableText(raw.storyUnitId, "Narrative placement Story Unit", 180),
    workVersionId: requireStableText(raw.workVersionId, "Narrative placement WorkVersion", 180),
    sourceLineageId: requireStableText(raw.sourceLineageId, "Narrative placement source lineage", 180),
    narrativePathId: requireStableText(raw.narrativePathId, "Narrative placement path", 180),
    orderKey: requirePositiveInteger(raw.orderKey, "Narrative placement order key"),
    role: requireRole(raw.role),
    source: {
      sourceKind: raw.source.sourceKind === "author-control" ? "author-control" : raw.source.sourceKind === "author-action" ? "author-action" : fail("Narrative placement source kind is invalid."),
      authorActionId: requireStableText(raw.source.authorActionId, "Narrative placement author action", 180),
      sourceRef: requireStableText(raw.source.sourceRef, "Narrative placement source reference", 240),
      capturedAt: requireTimestamp(raw.source.capturedAt)
    },
    createdRevision: requirePositiveInteger(raw.createdRevision, "Narrative placement creation revision"),
    updatedRevision: requirePositiveInteger(raw.updatedRevision, "Narrative placement update revision")
  };
}

function normalizeMutation(raw: NarrativeArrangementMutation): NarrativeArrangementMutation {
  const base = {
    operationId: requireStableText(raw.operationId, "Narrative arrangement operation", 180),
    authorActionId: requireStableText(raw.authorActionId, "Narrative arrangement author action", 180),
    sourceKind: raw.sourceKind === "author-control" ? "author-control" as const : raw.sourceKind === "author-action" ? "author-action" as const : fail("Narrative arrangement source kind is invalid."),
    sourceRef: requireStableText(raw.sourceRef, "Narrative arrangement source reference", 240),
    expectedRevision: requireNonNegativeInteger(raw.expectedRevision, "Narrative arrangement expected revision"),
    createdAt: requireTimestamp(raw.createdAt)
  };
  if (raw.action === "insert") return { ...base, action: "insert", eventId: requireStableText(raw.eventId, "Narrative placement Event", 180), storyUnitId: requireStableText(raw.storyUnitId, "Narrative placement Story Unit", 180), role: requireRole(raw.role), position: normalizePosition(raw.position) };
  if (raw.action === "move") return { ...base, action: "move", placementId: requireStableText(raw.placementId, "Narrative placement identity", 180), storyUnitId: requireStableText(raw.storyUnitId, "Narrative placement Story Unit", 180), position: normalizePosition(raw.position) };
  if (raw.action === "remove") return { ...base, action: "remove", placementId: requireStableText(raw.placementId, "Narrative placement identity", 180) };
  if (raw.action === "rollback") return { ...base, action: "rollback", targetRevision: requirePositiveInteger(raw.targetRevision, "Narrative arrangement rollback revision") };
  return fail("Narrative arrangement mutation action is invalid.");
}

function normalizePosition(raw: NarrativePositionIntent): NarrativePositionIntent {
  if (raw.kind === "start" || raw.kind === "end") return { kind: raw.kind };
  if (raw.kind === "before" || raw.kind === "after") return { kind: raw.kind, anchorPlacementId: requireStableText(raw.anchorPlacementId, "Narrative placement anchor", 180) };
  return fail("Narrative placement position intent is invalid.");
}

function normalizeScope(raw: Pick<NarrativeArrangement, "projectId" | "workVersionId" | "sourceLineageId" | "narrativePathId" | "ownerStoryUnitId">) {
  return {
    projectId: requireStableText(raw.projectId, "Narrative arrangement Project", 180),
    workVersionId: requireStableText(raw.workVersionId, "Narrative arrangement WorkVersion", 180),
    sourceLineageId: requireStableText(raw.sourceLineageId, "Narrative arrangement source lineage", 180),
    narrativePathId: requireStableText(raw.narrativePathId, "Narrative arrangement path", 180),
    ownerStoryUnitId: requireStableText(raw.ownerStoryUnitId, "Narrative arrangement owner Story Unit", 180)
  };
}

function assertPlacementScope(placement: NarrativePlacement, arrangementId: string, scope: ReturnType<typeof normalizeScope>) {
  if (placement.arrangementId !== arrangementId || placement.workVersionId !== scope.workVersionId || placement.sourceLineageId !== scope.sourceLineageId || placement.narrativePathId !== scope.narrativePathId) {
    throw new Error("NarrativePlacement scope does not match its NarrativeArrangement.");
  }
}

function sourceRef(mutation: NarrativeArrangementMutation): NarrativePlacementSourceRef {
  return { sourceKind: mutation.sourceKind, authorActionId: mutation.authorActionId, sourceRef: mutation.sourceRef, capturedAt: mutation.createdAt };
}

function emptyProjection(input: { projectId: string; workVersionId: string; narrativePathId: string; unplaced: NarrativeArrangementProjection["unplaced"] }): NarrativeArrangementProjection {
  return {
    schemaVersion: NARRATIVE_ARRANGEMENT_PROJECTION_SCHEMA,
    projectId: input.projectId,
    workVersionId: input.workVersionId,
    sourceLineageId: null,
    narrativePathId: input.narrativePathId,
    arrangementId: null,
    arrangementRevision: null,
    arrangementVersion: null,
    placed: [],
    unplaced: input.unplaced,
    conflicts: []
  };
}

function conflict(code: NarrativeArrangementConflictCode, arrangement: NarrativeArrangement): NarrativeArrangementMutationResult {
  return { conflict: true, replayed: false, code, arrangement, receipt: null };
}

function normalizeExtensions(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Narrative arrangement extensions must be an object.");
  return structuredClone(raw as Record<string, unknown>);
}

function requireRole(raw: unknown): NarrativePlacementRole {
  if (["primary", "flashback", "recap", "reveal", "reinterpretation"].includes(String(raw))) return raw as NarrativePlacementRole;
  return fail("Narrative placement role is invalid.");
}

function requireStableText(raw: unknown, label: string, maximum: number): string {
  const value = String(raw ?? "").normalize("NFC").trim();
  if (!value || value.length > maximum || /[\u0000-\u001f]/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function requireTimestamp(raw: unknown): string {
  const value = requireStableText(raw, "Narrative arrangement timestamp", 48);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) throw new Error("Narrative arrangement timestamp is invalid.");
  return value;
}

function requireInteger(raw: unknown, label: string): number {
  if (!Number.isSafeInteger(raw)) throw new Error(`${label} is invalid.`);
  return raw as number;
}

function requirePositiveInteger(raw: unknown, label: string): number {
  const value = requireInteger(raw, label);
  if (value < 1) throw new Error(`${label} is invalid.`);
  return value;
}

function requireNonNegativeInteger(raw: unknown, label: string): number {
  const value = requireInteger(raw, label);
  if (value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function requireDigest(raw: unknown, label: string): string {
  const value = requireStableText(raw, label, 64);
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) seen.has(value) ? duplicate.add(value) : seen.add(value);
  return duplicate;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}
