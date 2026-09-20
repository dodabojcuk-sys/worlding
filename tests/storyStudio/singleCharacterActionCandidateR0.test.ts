import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { createSingleCharacterActionCandidatePort } from "../../apps/story-studio/server/singleCharacterActionCandidatePort.mjs";

const actor = { id: "character.guard", revision: "actor-r1", title: "守门人" };
const scene = { id: "story-unit.gate", revision: "scene-r1", title: "潮门外" };
const safeContext = {
  previewMode: true,
  actor: { id: actor.id, revision: actor.revision },
  scene: {
    storyUnit: { id: scene.id, revision: scene.revision },
    sceneRef: { id: scene.id, revision: scene.revision },
    observedAt: "无世界时间依据",
    label: scene.title
  },
  localGoal: "确认潮门是否安全",
  coreSummary: "先求证，再行动",
  profileBasis: { core: "先求证，再行动", boundaries: "不伤害无辜", sourceRevision: actor.revision, sources: [] },
  knownFacts: [{ factId: "event.known", summary: "已亲历：潮门开启", sourceId: "event.known", sourceRevision: "event-r1", visibility: "experienced" }],
  beliefs: [],
  attention: { selected: [], excluded: { count: 0, reasonCodes: [] }, budget: { baseBytes: 0, selectedBytes: 0, totalBytes: 0, maxInputTokens: 4096, outputReserveTokens: 1024 } },
  excluded: { count: 1, reasonCodes: ["character-unknown"] },
  recentDialogue: [],
  allowedActions: ["speak", "observe", "ask"],
  authorCue: null,
  stateProjection: { projectionRevision: "projection-r1", asOf: null, asOfText: "无世界时间依据", sourceAnchors: ["event:event.known"] }
};

function setup(overrides: Record<string, unknown> = {}) {
  let currentActor = { ...actor };
  let currentScene = { ...scene };
  let providerCalls = 0;
  const receiptCalls: Array<[string, unknown]> = [];
  const deps = {
    readActor: () => ({ ...currentActor }),
    readScene: () => ({ ...currentScene }),
    prepareContext: () => ({
      providerSafeContext: structuredClone(safeContext),
      previewDigest: "context-r1",
      projectionRevision: "projection-r1",
      handoff: { contextAccess: "character" },
      blockedReason: null,
      missingConditions: []
    }),
    resolveProvider: () => ({ profileId: "profile.safe", providerId: "provider.safe", modelId: "model.safe", configured: true }),
    providerGateway: {
      async openChatCompletion(input: unknown) {
        providerCalls += 1;
        return {
          content: JSON.stringify({
            intent: "先观察门轴",
            speech: null,
            heardByActorIds: [],
            action: { action: "observe", targetId: null },
            observableResult: "守门人停在原地观察门轴。"
          }),
          traceId: "trace-1",
          receiptEnvelopeId: "receipt-1",
          usage: { promptTokens: 100, completionTokens: 30 }
        };
      }
    },
    receiptStore: {
      recordStrictProjection(input: unknown) { receiptCalls.push(["strict", input]); },
      complete(input: unknown) { receiptCalls.push(["complete", input]); }
    },
    ...overrides
  };
  const port = createSingleCharacterActionCandidatePort(deps);
  const input = {
    projectId: "gray-tower",
    actorId: actor.id,
    actorRevision: actor.revision,
    sceneId: scene.id,
    sceneRevision: scene.revision,
    localGoal: "确认潮门是否安全",
    contextDigest: "context-r1",
    projectionRevision: "projection-r1",
    operationId: "single-action.op-1"
  };
  return {
    port,
    input,
    providerCalls: () => providerCalls,
    receiptCalls,
    mutateActor: () => { currentActor = { ...currentActor, revision: "actor-r2" }; },
    mutateScene: () => { currentScene = { ...currentScene, revision: "scene-r2" }; }
  };
}

test("T1/T2/T3/T4 creates one validated transient candidate with one Provider call and no story writes", async () => {
  const fixture = setup();
  const result = await fixture.port.generate(fixture.input);

  assert.equal(fixture.providerCalls(), 1);
  assert.equal(result.lifecycle, "transient");
  assert.equal(result.persistence, "not-saved");
  assert.equal(result.label, "未保存候选");
  assert.equal(result.providerCalls, 1);
  assert.equal(result.automaticRetries, 0);
  assert.deepEqual(result.writes, { canon: 0, event: 0, world: 0, relation: 0, character: 0, storyUnit: 0, nuwaRun: 0 });
  assert.equal(result.result.actor.id, actor.id);
  assert.equal(result.result.action.action, "observe");
  assert.deepEqual(fixture.receiptCalls.map(([name]) => name), ["strict", "complete"]);
});

test("T5/T6/T7 fails closed before Provider for stale actor, stale scene, or stale context", async () => {
  for (const change of ["actor", "scene", "context"] as const) {
    const fixture = setup();
    const input = { ...fixture.input };
    if (change === "actor") input.actorRevision = "actor-old";
    if (change === "scene") input.sceneRevision = "scene-old";
    if (change === "context") input.contextDigest = "context-old";
    await assert.rejects(() => fixture.port.generate(input), (error: any) => error?.code === `STALE_${change.toUpperCase()}`);
    assert.equal(fixture.providerCalls(), 0);
  }
});

test("API operation identity is length and character bounded before Provider", async () => {
  for (const operationId of ["bad operation", "x".repeat(201), "../bad"]) {
    const fixture = setup();
    await assert.rejects(() => fixture.port.generate({ ...fixture.input, operationId }), (error: any) => error?.code === "INVALID_REQUEST");
    assert.equal(fixture.providerCalls(), 0);
  }
});

test("T8/T9 permission and Provider readiness block dispatch", async () => {
  const permission = setup({ prepareContext: () => ({ providerSafeContext: null, previewDigest: null, projectionRevision: null, handoff: { contextAccess: "display-only" }, blockedReason: "stable-actor-mismatch", missingConditions: [] }) });
  await assert.rejects(() => permission.port.generate(permission.input), (error: any) => error?.code === "CONTEXT_ACCESS_DENIED");
  assert.equal(permission.providerCalls(), 0);

  const provider = setup({ resolveProvider: () => ({ profileId: null, providerId: null, modelId: null, configured: false }) });
  await assert.rejects(() => provider.port.generate(provider.input), (error: any) => error?.code === "PROVIDER_NOT_CONFIGURED");
  assert.equal(provider.providerCalls(), 0);
});

test("T10 invalid model shape is rejected and never becomes a candidate", async () => {
  const fixture = setup({ providerGateway: { async openChatCompletion() { return { content: JSON.stringify({ intent: "越权", speech: null, heardByActorIds: [], action: { action: "rewrite-canon", targetId: null }, observableResult: "越权" }), receiptEnvelopeId: "receipt-bad" }; } } });
  await assert.rejects(() => fixture.port.generate(fixture.input), (error: any) => error?.code === "MODEL_CONTRACT_INVALID");
  assert.deepEqual(fixture.receiptCalls.map(([name]) => name), ["strict"]);
});

test("T8 a failed Provider request is attempted exactly once with retry disabled", async () => {
  let calls = 0;
  let retry: unknown = null;
  const fixture = setup({ providerGateway: { async openChatCompletion(input: any) { calls += 1; retry = input.retry; throw Object.assign(new Error("fixture failure"), { code: "transport-failed" }); } } });
  await assert.rejects(() => fixture.port.generate(fixture.input), /fixture failure/u);
  assert.equal(calls, 1);
  assert.equal(retry, false);
  assert.deepEqual(fixture.receiptCalls, []);
});

test("T5 a context digest change during the one request returns a stale non-owner result", async () => {
  let preparations = 0;
  const fixture = setup({ prepareContext: () => ({
    providerSafeContext: structuredClone(safeContext),
    previewDigest: ++preparations === 1 ? "context-r1" : "context-r2",
    projectionRevision: "projection-r1",
    handoff: { contextAccess: "character" },
    blockedReason: null,
    missingConditions: []
  }) });
  const result = await fixture.port.generate(fixture.input);
  assert.equal(result.lifecycle, "stale");
  assert.equal(result.usable, false);
  assert.equal(result.persistence, "not-saved");
});

test("T11/T12 a post-response revision change marks the result stale and never claims replay", async () => {
  let fixture: ReturnType<typeof setup>;
  fixture = setup({ providerGateway: { async openChatCompletion() {
    fixture.mutateActor();
    return { content: JSON.stringify({ intent: "观察", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "观察完成" }), receiptEnvelopeId: "receipt-stale" };
  } } });
  const result = await fixture.port.generate(fixture.input);
  assert.equal(result.lifecycle, "stale");
  assert.equal(result.usable, false);
  assert.equal(result.replayAvailable, false);
  assert.equal(result.persistence, "not-saved");
});

test("T13/T14/T15 outbound and returned projections exclude secrets, raw bodies, credentials, and fake Run identity", async () => {
  let outbound = "";
  const fixture = setup({ providerGateway: { async openChatCompletion(input: unknown) {
    outbound = JSON.stringify(input);
    return { content: JSON.stringify({ intent: "观察", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "观察完成" }), receiptEnvelopeId: "receipt-safe" };
  } } });
  const result = await fixture.port.generate(fixture.input);
  const returned = JSON.stringify(result);
  for (const forbidden of ["SECRET_UNKNOWN_BODY_SENTINEL", "apiKey", "authorization", "rawBody", "runId", "attemptId"]) {
    assert.equal(outbound.includes(forbidden), false, `outbound leaked ${forbidden}`);
    assert.equal(returned.includes(forbidden), false, `candidate leaked ${forbidden}`);
  }
  assert.equal(outbound.includes("read_role_context"), false, "single-call path must not pretend a tool roundtrip happened");
  assert.equal(returned.includes("event:event.known"), true, "safe source anchors remain inspectable");
});

test("server route rejects browser-supplied knowledge and exposes no apply or replay action", () => {
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const route = server.slice(server.indexOf('pathname === "/__local/story-studio/single-character-action-candidate"'), server.indexOf('pathname === "/__local/story-studio/storage/reveal"'));
  assert.match(route, /requireToken\(request\)/);
  assert.match(route, /requireAllowedKeys\(body, \["projectId", "actorId", "actorRevision", "sceneId", "sceneRevision", "localGoal", "contextDigest", "projectionRevision", "operationId"\]\)/);
  assert.doesNotMatch(route, /knownFacts|beliefs|profileBasis|apply|adopt|replay/);
});
