import { normalizeStoryStudioEventReference, type StoryStudioEventReference } from "./storyStudioEventReference.ts";

export const MULTI_NODE_PREDICTION_VERSION = "tianyan-multi-node-prediction/v1" as const;
export const PREDICTION_MODES = ["forward-development"] as const;
export type PredictionMode = typeof PREDICTION_MODES[number];
export type PredictionRunStatus = "created" | "generating" | "validating" | "ready" | "failed" | "stale" | "abandoned";
export type IdentityResolutionKind = "reference-existing" | "merge-review" | "create-new-with-difference" | "unresolved";
export type TimeConsistencyKind = "consistent" | "unknown" | "conflict";

export type MultiNodePredictionRequest = {
  projectId: string;
  sourceEventRefs: StoryStudioEventReference[];
  authorGoal: string;
  predictionMode: PredictionMode;
  operationId: string;
};

export type IdentityResolution = {
  kind: IdentityResolutionKind;
  existingEventId: string | null;
  differenceReason: string | null;
};

export type TimeConsistencyResult = {
  kind: TimeConsistencyKind;
  label: string;
  reason: string | null;
};

export type PredictionNode = {
  id: string;
  title: string;
  summary: string;
  narrativeTime: string | null;
  identityResolution: IdentityResolution;
  timeConsistency: TimeConsistencyResult;
};

export type PredictionEdge = { id: string; sourceCandidateId: string; targetCandidateId: string; label: string };
export type PredictionPath = { id: string; title: string; candidateNodeIds: string[]; candidateEdgeIds: string[] };

export type PredictionBundle = {
  bundleId: string;
  sourceSnapshot: StoryStudioEventReference[];
  predictionMode: PredictionMode;
  paths: PredictionPath[];
  nodes: PredictionNode[];
  edges: PredictionEdge[];
};

export type PredictionRun = {
  version: typeof MULTI_NODE_PREDICTION_VERSION;
  runId: string;
  bundle: PredictionBundle | null;
  projectId: string;
  operationId: string;
  sourceSnapshot: StoryStudioEventReference[];
  authorGoal: string;
  predictionMode: PredictionMode;
  createdAt: string;
  status: PredictionRunStatus;
};

export type PredictionAcceptanceSelection = {
  projectId: string;
  runId: string;
  pathId: string;
  selectedCandidateNodeIds: string[];
  operationId: string;
};

export type PredictionReviewGate = { allowed: boolean; reasons: string[] };

export function normalizeMultiNodePredictionRequest(value: unknown): MultiNodePredictionRequest {
  const input = object(value, "Multi-node prediction request");
  exact(input, ["projectId", "sourceEventRefs", "authorGoal", "predictionMode", "operationId"], "Multi-node prediction request");
  const projectId = project(input.projectId);
  const sourceEventRefs = array(input.sourceEventRefs, "sourceEventRefs").map(normalizeStoryStudioEventReference);
  if (sourceEventRefs.length < 1 || sourceEventRefs.length > 4) throw new Error("Multi-node prediction requires 1–4 source events.");
  const seen = new Set<string>();
  for (const reference of sourceEventRefs) {
    if (reference.projectId !== projectId) throw new Error("Prediction source event belongs to another project.");
    if (seen.has(reference.eventId)) throw new Error("Prediction source event is duplicated.");
    seen.add(reference.eventId);
  }
  return { projectId, sourceEventRefs, authorGoal: text(input.authorGoal, "Author goal", 1_000), predictionMode: predictionMode(input.predictionMode), operationId: stableId(input.operationId, "Prediction operation") };
}

export function createPredictionRun(input: MultiNodePredictionRequest & { runId: string; createdAt: string }): PredictionRun {
  const request = normalizeMultiNodePredictionRequest({
    projectId: input.projectId,
    sourceEventRefs: input.sourceEventRefs,
    authorGoal: input.authorGoal,
    predictionMode: input.predictionMode,
    operationId: input.operationId
  });
  return {
    version: MULTI_NODE_PREDICTION_VERSION,
    runId: stableId(input.runId, "Prediction run"),
    bundle: null,
    projectId: request.projectId,
    operationId: request.operationId,
    sourceSnapshot: request.sourceEventRefs,
    authorGoal: request.authorGoal,
    predictionMode: request.predictionMode,
    createdAt: timestamp(input.createdAt),
    status: "created"
  };
}

export function validatePredictionBundle(input: { run: PredictionRun; bundle: PredictionBundle }): PredictionBundle {
  const bundle = input.bundle;
  if (!bundle || typeof bundle !== "object") throw new Error("Prediction bundle is invalid.");
  if (bundle.predictionMode !== input.run.predictionMode) throw new Error("Prediction bundle mode does not match its run.");
  if (!stableId(bundle.bundleId, "Prediction bundle")) throw new Error("Prediction bundle is invalid.");
  const sourceKeys = bundle.sourceSnapshot.map(referenceKey);
  if (sourceKeys.length !== input.run.sourceSnapshot.length || sourceKeys.some((key, index) => key !== referenceKey(input.run.sourceSnapshot[index]!))) throw new Error("Prediction bundle source snapshot does not match its run.");
  const nodeIds = new Set<string>();
  for (const node of bundle.nodes) {
    candidateId(node.id, "Prediction node");
    if (nodeIds.has(node.id)) throw new Error("Prediction node is duplicated.");
    nodeIds.add(node.id);
    text(node.title, "Prediction node title", 160);
    text(node.summary, "Prediction node summary", 2_000);
    validateIdentityResolution(node.identityResolution);
    validateTimeConsistency(node.timeConsistency);
    assertNoInternalFields(node);
  }
  const edgeIds = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const edge of bundle.edges) {
    candidateId(edge.id, "Prediction edge");
    if (edgeIds.has(edge.id)) throw new Error("Prediction edge is duplicated.");
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceCandidateId) || !nodeIds.has(edge.targetCandidateId) || edge.sourceCandidateId === edge.targetCandidateId) throw new Error("Prediction edge does not connect candidate nodes.");
    adjacency.set(edge.sourceCandidateId, [...(adjacency.get(edge.sourceCandidateId) ?? []), edge.targetCandidateId]);
    text(edge.label, "Prediction edge label", 160);
    assertNoInternalFields(edge);
  }
  if (hasCycle([...nodeIds], adjacency)) throw new Error("Prediction candidate graph cannot contain a cycle.");
  const paths = new Set<string>();
  for (const path of bundle.paths) {
    candidateId(path.id, "Prediction path");
    if (paths.has(path.id)) throw new Error("Prediction path is duplicated.");
    paths.add(path.id);
    if (!path.candidateNodeIds.length || new Set(path.candidateNodeIds).size !== path.candidateNodeIds.length || path.candidateNodeIds.some((id) => !nodeIds.has(id))) throw new Error("Prediction path nodes are invalid.");
    if (new Set(path.candidateEdgeIds).size !== path.candidateEdgeIds.length || path.candidateEdgeIds.some((id) => !edgeIds.has(id))) throw new Error("Prediction path edges are invalid.");
  }
  if (!bundle.paths.length) throw new Error("Prediction bundle requires at least one path.");
  assertNoInternalFields(bundle);
  return structuredClone(bundle);
}

export function derivePredictionReviewGate(input: { run: PredictionRun; pathId: string | null; operationPending?: boolean }): PredictionReviewGate {
  const reasons: string[] = [];
  if (input.run.status !== "ready") reasons.push("prediction-not-ready");
  if (!input.pathId) reasons.push("path-not-selected");
  const path = input.pathId ? input.run.bundle?.paths.find((item) => item.id === input.pathId) : null;
  if (input.pathId && !path) reasons.push("path-unavailable");
  for (const node of path ? input.run.bundle!.nodes.filter((item) => path.candidateNodeIds.includes(item.id)) : []) {
    if (node.identityResolution.kind === "unresolved") reasons.push(`identity-unresolved:${node.id}`);
    if (node.timeConsistency.kind === "conflict") reasons.push(`time-conflict:${node.id}`);
  }
  if (input.operationPending) reasons.push("operation-pending");
  return { allowed: reasons.length === 0, reasons };
}

export function normalizePredictionAcceptanceSelection(value: unknown, run: PredictionRun): PredictionAcceptanceSelection {
  const input = object(value, "Prediction acceptance selection");
  exact(input, ["projectId", "runId", "pathId", "selectedCandidateNodeIds", "operationId"], "Prediction acceptance selection");
  if (project(input.projectId) !== run.projectId || stableId(input.runId, "Prediction run") !== run.runId) throw new Error("Prediction selection belongs to another run.");
  const pathId = candidateId(input.pathId, "Prediction path");
  const gate = derivePredictionReviewGate({ run, pathId });
  if (!gate.allowed) throw new Error(`Prediction selection is blocked: ${gate.reasons.join(", ")}.`);
  const path = run.bundle!.paths.find((item) => item.id === pathId)!;
  const selectedCandidateNodeIds = array(input.selectedCandidateNodeIds, "selectedCandidateNodeIds").map((id) => candidateId(id, "Prediction node"));
  if (!selectedCandidateNodeIds.length || new Set(selectedCandidateNodeIds).size !== selectedCandidateNodeIds.length || selectedCandidateNodeIds.some((id) => !path.candidateNodeIds.includes(id))) throw new Error("Prediction selection must contain only nodes from its selected path.");
  return { projectId: run.projectId, runId: run.runId, pathId, selectedCandidateNodeIds, operationId: stableId(input.operationId, "Acceptance operation") };
}

function validateIdentityResolution(value: IdentityResolution): void {
  if (!value || !["reference-existing", "merge-review", "create-new-with-difference", "unresolved"].includes(value.kind)) throw new Error("Prediction identity resolution is invalid.");
  if (["reference-existing", "merge-review"].includes(value.kind) && !value.existingEventId) throw new Error("Prediction identity resolution requires an existing event.");
  if (value.kind === "create-new-with-difference" && !value.differenceReason?.trim()) throw new Error("Creating a same-name event requires a difference reason.");
}
function validateTimeConsistency(value: TimeConsistencyResult): void { if (!value || !["consistent", "unknown", "conflict"].includes(value.kind) || !value.label?.trim()) throw new Error("Prediction time consistency is invalid."); }
function predictionMode(value: unknown): PredictionMode { if (!PREDICTION_MODES.includes(value as PredictionMode)) throw new Error("Prediction mode is unsupported."); return value as PredictionMode; }
function hasCycle(nodes: string[], adjacency: Map<string, string[]>): boolean { const visiting = new Set<string>(); const visited = new Set<string>(); const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const target of adjacency.get(id) ?? []) if (visit(target)) return true; visiting.delete(id); visited.add(id); return false; }; return nodes.some(visit); }
function assertNoInternalFields(value: unknown): void { const forbidden = /^(?:prompt|model|temperature|tool|gateway|runtime|pi|agent(?:execution)?(?:node|edge)?)$/iu; const walk = (item: unknown): void => { if (Array.isArray(item)) return item.forEach(walk); if (!item || typeof item !== "object") return; for (const [key, child] of Object.entries(item)) { if (forbidden.test(key)) throw new Error("Prediction DTO exposes an internal Agent field."); walk(child); } }; walk(value); }
function referenceKey(reference: StoryStudioEventReference): string { return `${reference.projectId}:${reference.eventId}:${reference.revisionToken}:${reference.state}:${reference.requestedUse}`; }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, keys: string[], label: string): void { if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} fields are invalid.`); }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} is invalid.`); return value; }
function project(value: unknown): string { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) throw new Error("Prediction project is invalid."); return value; }
function stableId(value: unknown, label: string): string { if (typeof value !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u.test(value)) throw new Error(`${label} is invalid.`); return value; }
function candidateId(value: unknown, label: string): string { const id = stableId(value, label); if (!id.startsWith("prediction-")) throw new Error(`${label} must use the prediction namespace.`); return id; }
function text(value: unknown, label: string, maximum: number): string { if (typeof value !== "string" || !value.trim() || [...value.trim()].length > maximum) throw new Error(`${label} is invalid.`); return value.trim(); }
function timestamp(value: unknown): string { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("Prediction timestamp is invalid."); return value; }
