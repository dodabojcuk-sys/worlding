import assert from "node:assert/strict";
import test from "node:test";

import { createMapEditProposalProviderAdapter } from "../../apps/story-studio/server/providerGateway/mapEditProposalProviderAdapter.mjs";

const road = { id: "drawing.road", kind: "line", subtype: "road", layerId: "layer.routes", points: [{ x: 10, y: 50 }, { x: 90, y: 50 }], strokeColor: "#765b3d", fillColor: "#765b3d", fillOpacity: .2, width: 2, size: 4, seed: 1, rotation: 0, label: "滨海道", objectId: null };
const forest = { ...road, id: "drawing.forest", kind: "terrain", subtype: "forest", layerId: "layer.terrain", points: [{ x: 40, y: 45 }, { x: 60, y: 45 }], label: "雾松林" };
const forestArea = { ...road, id: "drawing.forest-area", kind: "area", subtype: "geography", layerId: "layer.terrain", points: [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }], fillOpacity: .3, label: "雾松林明确范围" };
const map = { id: "map.north-bay", title: "北湾区域图", type: "map", revision: 3, contentHash: "sha256:map-base", relativePath: "documents/maps/north-bay.visual.json", content: { coordinateSystem: { axis: "x-right-y-down", bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, unit: null, scaleKnown: false, precision: "illustrative" }, layers: [{ id: "layer.routes", title: "道路", visible: true, locked: false }, { id: "layer.terrain", title: "地形", visible: true, locked: false }], drawings: [road, forest, forestArea] } };

function gateway(argumentsValue: Record<string, unknown>) {
  const calls: any[] = [];
  return { calls, metadata() { return { profiles: [{ id: "profile.text", providerId: "provider.real", modelId: "model.text" }], providers: [{ id: "provider.real", configured: true }] }; }, async openChatCompletion(input: any) { calls.push(input); return { modelId: "model.actual", toolCalls: [{ id: "call.map", name: "propose_map_edit", arguments: argumentsValue }], content: "", usage: { promptTokens: 100, completionTokens: 80, totalTokens: 180 }, receiptEnvelopeId: "receipt.map" }; } };
}

test("real map Provider adapter keeps references read-only and preserves selected line endpoints", async () => {
  const fake = gateway({ summary: "道路绕开森林", operations: [{ action: "update", targetId: road.id, points: [{ x: 10, y: 50 }, { x: 36, y: 35 }, { x: 64, y: 35 }, { x: 90, y: 50 }], reason: "从森林北侧绕行并保留端点" }] });
  const result = await createMapEditProposalProviderAdapter({ gateway: fake }).generate({ projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.1", profileId: "profile.text", prompt: "绕开森林并保持端点", map, scope: { kind: "selection", objectIds: [road.id] }, referenceObjectIds: [forestArea.id], avoidAreaObjectIds: [forestArea.id], preserveLineEndpoints: true });
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].toolChoice.function.name, "propose_map_edit");
  assert.deepEqual(result.operations[0].patch.points.at(0), road.points.at(0));
  assert.deepEqual(result.operations[0].patch.points.at(-1), road.points.at(-1));
  assert.equal(result.generation.providerDispatches, 1);
  assert.equal(result.generation.modelId, "model.actual");
  assert.deepEqual(result.constraints, { preserveLineEndpointIds: [road.id], avoidAreaObjectIds: [forestArea.id] });
  const sent = JSON.parse(fake.calls[0].messages[1].content);
  assert.equal(sent.context.readOnlyReferenceObjects[0].kind, "area");
  assert.deepEqual(sent.context.spatialConstraints.avoidExplicitAreaObjectIds, [forestArea.id]);
});

test("real map Provider adapter rejects reference mutation, endpoint drift and region overflow", async () => {
  const base = { projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.2", profileId: "profile.text", prompt: "修改地图", map, referenceObjectIds: [forest.id], preserveLineEndpoints: true };
  await assert.rejects(() => createMapEditProposalProviderAdapter({ gateway: gateway({ summary: "越权", operations: [{ action: "update", targetId: forest.id, points: forest.points, reason: "修改参考" }] }) }).generate({ ...base, scope: { kind: "selection", objectIds: [road.id] } }), /只读参考/u);
  await assert.rejects(() => createMapEditProposalProviderAdapter({ gateway: gateway({ summary: "端点漂移", operations: [{ action: "update", targetId: road.id, points: [{ x: 11, y: 50 }, { x: 90, y: 50 }], reason: "移动" }] }) }).generate({ ...base, scope: { kind: "selection", objectIds: [road.id] } }), /端点/u);
  await assert.rejects(() => createMapEditProposalProviderAdapter({ gateway: gateway({ summary: "越界新增", operations: [{ action: "add", kind: "symbol", subtype: "entrance", points: [{ x: 80, y: 80 }], label: "入口", reason: "新增入口" }] }) }).generate({ ...base, scope: { kind: "region", layerId: "layer.routes", bounds: { x: 40, y: 40, width: 10, height: 10 } } }), /超出/u);
});

test("only explicit area polygons can become deterministic avoidance constraints", async () => {
  const crossing = gateway({ summary: "仍穿过范围", operations: [{ action: "update", targetId: road.id, points: [{ x: 10, y: 50 }, { x: 50, y: 50 }, { x: 90, y: 50 }], reason: "错误绕行" }] });
  const generated = await createMapEditProposalProviderAdapter({ gateway: crossing }).generate({ projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.avoid", profileId: "profile.text", prompt: "绕开森林", map, scope: { kind: "selection", objectIds: [road.id] }, referenceObjectIds: [forestArea.id], avoidAreaObjectIds: [forestArea.id], preserveLineEndpoints: true });
  assert.deepEqual(generated.constraints.avoidAreaObjectIds, [forestArea.id], "The owner repository performs the final geometry check when the proposal is created and accepted.");
  await assert.rejects(() => createMapEditProposalProviderAdapter({ gateway: crossing }).generate({ projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.brush", profileId: "profile.text", prompt: "绕开森林", map, scope: { kind: "selection", objectIds: [road.id] }, referenceObjectIds: [forest.id], avoidAreaObjectIds: [forest.id], preserveLineEndpoints: true }), /范围图形/u);
});

test("real map Provider adapter assigns trusted identities and refuses implicit whole-map scope", async () => {
  const fake = gateway({ summary: "新增两个入口", operations: [{ action: "add", kind: "symbol", subtype: "entrance", points: [{ x: 42, y: 44 }], label: "北门", reason: "标注入口" }, { action: "add", kind: "symbol", subtype: "entrance", points: [{ x: 48, y: 46 }], label: "南门", reason: "标注入口" }] });
  const adapter = createMapEditProposalProviderAdapter({ gateway: fake });
  const result = await adapter.generate({ projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.3", profileId: "profile.text", prompt: "新增入口", map, scope: { kind: "region", layerId: "layer.routes", bounds: { x: 40, y: 40, width: 10, height: 10 } }, referenceObjectIds: [], preserveLineEndpoints: true });
  assert.equal(result.operations.length, 2);
  assert.ok(result.operations.every((item: any) => item.type === "add-drawing" && item.value.id.startsWith("drawing.ai.") && item.value.layerId === "layer.routes"));
  await assert.rejects(() => adapter.generate({ projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.4", profileId: "profile.text", prompt: "改整张地图", map, scope: { kind: "map" }, referenceObjectIds: [], preserveLineEndpoints: true }), /不能默认扩大/u);
});

test("real map Provider adapter forwards cancellation without creating a parsed result", async () => {
  const abort = new AbortController();
  abort.abort();
  const fake = gateway({ summary: "不应采用", operations: [{ action: "delete", targetId: road.id, reason: "不应执行" }] });
  fake.openChatCompletion = async (input: any) => {
    fake.calls.push(input);
    assert.equal(input.signal, abort.signal);
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  };
  await assert.rejects(() => createMapEditProposalProviderAdapter({ gateway: fake }).generate({ projectId: "project.isolated", workVersionId: "work-version.root.1", sessionId: "session.1", operationId: "operation.cancel", profileId: "profile.text", prompt: "删除道路", map, scope: { kind: "selection", objectIds: [road.id] }, referenceObjectIds: [], preserveLineEndpoints: true, signal: abort.signal }), { name: "AbortError" });
  assert.equal(fake.calls.length, 1);
});
