import assert from "node:assert/strict";
import test from "node:test";
import { createPredictionRun, derivePredictionReviewGate, normalizeMultiNodePredictionRequest, normalizePredictionAcceptanceSelection, validatePredictionBundle } from "../../src/storyContracts/multiNodePrediction.ts";
import { createDeterministicMultiNodePredictionGateway } from "../../src/storyAgent/multiNodePredictionGateway.ts";

const projectId = "long-night";
const ref = (id: string, revision = "a".repeat(64)) => ({ version: "story-studio-event-reference/v1" as const, projectId, eventId: id, revisionToken: revision, state: "planned" as const, requestedUse: "constraint" as const });
const request = () => ({ projectId, sourceEventRefs: [ref("event.signal"), ref("event.standoff"), ref("event.lock")], authorGoal: "推演后续", predictionMode: "forward-development", operationId: "prediction.operation.1" });
const evidence = { sourceEventIds: ["event.signal"], rationale: "来源事件支持这条候选连线。" };
const edge = (id: string, sourceCandidateId: string, targetCandidateId: string, pathIds: string[], label = "后续") => ({ id, sourceCandidateId, targetCandidateId, label, direction: "forward" as const, pathIds, sourceEvidence: evidence, relationTypeHint: { resolution: "unresolved" as const, label: null } });
function readyRun() {
  const run = createPredictionRun({ ...request(), runId: "prediction-run.1", createdAt: "2026-08-30T12:00:00.000Z" });
  const bundle = validatePredictionBundle({ run, bundle: {
    bundleId: "prediction-bundle.1", sourceSnapshot: run.sourceSnapshot, predictionMode: run.predictionMode,
    nodes: [
      { id: "prediction-node.fire", pathIds: ["prediction-path.1", "prediction-path.2"], title: "灯塔失火", summary: "候选", narrativeTime: "第2夜", identityResolution: { kind: "create-new-with-difference", existingEventId: null, differenceReason: "不是既有封锁事件" }, timeConsistency: { kind: "consistent", label: "第2夜", reason: null } },
      { id: "prediction-node.harbor", pathIds: ["prediction-path.1"], title: "雾港启航", summary: "候选", narrativeTime: null, identityResolution: { kind: "reference-existing", existingEventId: "event.existing-harbor", differenceReason: null }, timeConsistency: { kind: "unknown", label: "时间未定", reason: "没有来源时间" } },
      { id: "prediction-node.trace", pathIds: ["prediction-path.2"], title: "雨夜追踪", summary: "候选", narrativeTime: "第3夜", identityResolution: { kind: "merge-review", existingEventId: "event.trace", differenceReason: null }, timeConsistency: { kind: "consistent", label: "第3夜", reason: null } }
    ],
    edges: [edge("prediction-edge.fire-harbor", "prediction-node.fire", "prediction-node.harbor", ["prediction-path.1"]), edge("prediction-edge.fire-trace", "prediction-node.fire", "prediction-node.trace", ["prediction-path.2"], "分叉")],
    paths: [{ id: "prediction-path.1", title: "路径一", candidateNodeIds: ["prediction-node.fire", "prediction-node.harbor"], candidateEdgeIds: ["prediction-edge.fire-harbor"] }, { id: "prediction-path.2", title: "路径二", candidateNodeIds: ["prediction-node.fire", "prediction-node.trace"], candidateEdgeIds: ["prediction-edge.fire-trace"] }]
  } });
  return { ...run, bundle, status: "ready" as const };
}

test("request enforces ordered 1–4 same-project versioned unique sources and registered modes", () => {
  assert.equal(normalizeMultiNodePredictionRequest(request()).sourceEventRefs.length, 3);
  assert.throws(() => normalizeMultiNodePredictionRequest({ ...request(), sourceEventRefs: [] }), /1–4/u);
  assert.throws(() => normalizeMultiNodePredictionRequest({ ...request(), sourceEventRefs: [ref("event.signal"), ref("event.signal")] }), /duplicated/u);
  assert.throws(() => normalizeMultiNodePredictionRequest({ ...request(), sourceEventRefs: [ref("event.signal"), { ...ref("event.other"), projectId: "other" }] }), /another project/u);
  assert.throws(() => normalizeMultiNodePredictionRequest({ ...request(), predictionMode: "backward" }), /unsupported/u);
});

test("bundle isolates candidate identities, allows branches/merges, rejects cycles and internal fields", () => {
  const run = readyRun();
  assert.equal(run.bundle!.paths.length, 2);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, nodes: [{ ...run.bundle!.nodes[0]!, id: "event.fire" }] } }), /prediction namespace/u);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, edges: [...run.bundle!.edges, edge("prediction-edge.cycle", "prediction-node.harbor", "prediction-node.fire", ["prediction-path.1"], "循环")] } }), /cycle/u);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, nodes: [{ ...run.bundle!.nodes[0]!, model: "forbidden" }] as any } }), /internal Agent/u);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, edges: [] } }), /connecting candidate edges|edges are invalid/u);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, paths: [{ ...run.bundle!.paths[0]!, candidateEdgeIds: [] }, run.bundle!.paths[1]!] } }), /requires connecting candidate edges/u);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, edges: run.bundle!.edges.map((item) => item.id === "prediction-edge.fire-harbor" ? { ...item, sourceEvidence: { sourceEventIds: ["event.outside"], rationale: "越界来源" } } : item) } }), /source evidence/u);
  assert.throws(() => validatePredictionBundle({ run, bundle: { ...run.bundle!, edges: run.bundle!.edges.map((item) => item.id === "prediction-edge.fire-harbor" ? { ...item, relationTypeHint: { resolution: "unresolved" as const, label: "猜测因果" } } : item) } }), /must not guess/u);
});

test("review gate allows unknown time but blocks unresolved identity, conflict, non-ready, and missing path", () => {
  const run = readyRun();
  assert.deepEqual(derivePredictionReviewGate({ run, pathId: "prediction-path.1" }), { allowed: true, reasons: [] });
  assert.equal(derivePredictionReviewGate({ run: { ...run, status: "validating" }, pathId: "prediction-path.1" }).allowed, false);
  assert.equal(derivePredictionReviewGate({ run, pathId: null }).reasons[0], "path-not-selected");
  const conflict = { ...run, bundle: { ...run.bundle!, nodes: run.bundle!.nodes.map((node) => node.id === "prediction-node.fire" ? { ...node, timeConsistency: { kind: "conflict" as const, label: "冲突", reason: "倒序" } } : node) } };
  assert.equal(derivePredictionReviewGate({ run: conflict, pathId: "prediction-path.1" }).allowed, false);
});

test("acceptance supports partial path selections without widening them", () => {
  const run = readyRun();
  const selection = normalizePredictionAcceptanceSelection({ projectId, runId: run.runId, pathId: "prediction-path.1", selectedCandidateNodeIds: ["prediction-node.fire"], operationId: "accept.1" }, run);
  assert.deepEqual(selection.selectedCandidateNodeIds, ["prediction-node.fire"]);
  assert.throws(() => normalizePredictionAcceptanceSelection({ ...selection, selectedCandidateNodeIds: ["prediction-node.trace"] }, run), /only nodes from its selected path/u);
});

test("deterministic gateway resolves actual existing Event identities without exposing its execution internals", async () => {
  const gateway = createDeterministicMultiNodePredictionGateway();
  const bundle = await gateway.generate({ request: normalizeMultiNodePredictionRequest(request()), knownEvents: [{ id: "event.existing-harbor", title: "雾港启航" }], bundleId: "prediction-bundle.gateway" });
  assert.deepEqual(bundle.nodes.find((node) => node.title === "雾港启航")?.identityResolution, { kind: "reference-existing", existingEventId: "event.existing-harbor", differenceReason: null });
  for (const node of bundle.nodes) assert.equal(["prompt", "model", "tool", "gateway", "runtime", "pi"].some((key) => Object.hasOwn(node, key)), false);
});
