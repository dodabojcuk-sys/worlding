import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { createRealProviderMultiNodePredictionGateway, REAL_PROVIDER_PREDICTION_ADAPTER_VERSION } from "../../apps/story-studio/server/providerGateway/multiNodePredictionProviderAdapter.mjs";
import { TIAN_YI_PREDICTION_TOOL_ALLOWLIST } from "../../src/storyAgent/piMultiNodePredictionGateway.ts";

const sourceRefs = ["one", "two", "three"].map((id) => ({
  version: "story-studio-event-reference/v1" as const,
  projectId: "long-night",
  eventId: `event.${id}`,
  revisionToken: "b".repeat(64),
  state: "planned" as const,
  requestedUse: "constraint" as const
}));

test("server-only real Provider adapter drives the Pi tool loop through the existing broker", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const gateway = {
    metadata() {
      return {
        providers: [{ id: "siliconflow", configured: true }],
        profiles: [{ id: "structured", providerId: "siliconflow", modelId: "fixture/model", purpose: "structured-story" }]
      };
    },
    async openChatStream(input: Record<string, unknown>) {
      calls.push(input);
      const providerCall = calls.length;
      return { traceId: `trace.fake.${providerCall}`, events: providerEvents(providerCall) };
    }
  };
  const adapter = createRealProviderMultiNodePredictionGateway({ gateway, maxPredictionRuns: 1, maxProviderCalls: 8, maxOutputTokens: 256, now: () => "2026-08-31T00:00:00.000Z" });
  const request = {
    request: { projectId: "long-night", sourceEventRefs: sourceRefs, authorGoal: "推演后续", predictionMode: "forward-development", operationId: "prediction.operation.real-adapter" },
    knownEvents: sourceRefs.map((reference, index) => ({ id: reference.eventId, title: ["暗号传递", "仓库对峙", "旧仓库封锁"][index]! })),
    bundleId: "prediction-bundle.real-adapter",
    runtime: { runId: "prediction-run.real-adapter", attemptId: "agent-attempt.real-adapter.1", workVersionId: "work-version.real-adapter", sessionId: "prediction-session.real-adapter" }
  } as const;
  const bundle = await adapter.generate(request);
  assert.equal(REAL_PROVIDER_PREDICTION_ADAPTER_VERSION, "tianyan-multi-node-prediction-provider-adapter-r1/v1");
  assert.ok(bundle.paths.length >= 2);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.profileId === "structured" && call.maxOutputTokens === 256), true);
  assert.equal(calls.every((call) => typeof call.idempotencyKey === "string" && String(call.idempotencyKey).includes("prediction-run.real-adapter")), true);
  assert.deepEqual((calls[0]!.tools as Array<{ name: string }>).map((tool) => tool.name), TIAN_YI_PREDICTION_TOOL_ALLOWLIST);
  await assert.rejects(() => adapter.generate(request), /limited to one Prediction Run/u);
  assert.equal(calls.length, 2, "The bounded smoke adapter must reject a second Run before Provider dispatch.");
});

test("real Provider adapter fails closed before dispatch when configuration is unavailable", () => {
  assert.throws(() => createRealProviderMultiNodePredictionGateway({ gateway: { metadata: () => ({ providers: [{ id: "siliconflow", configured: false }], profiles: [{ id: "structured", providerId: "siliconflow", modelId: "fixture/model", purpose: "structured-story" }] }), openChatStream: async () => { throw new Error("must not dispatch"); } } }), /not configured/u);
});

test("real Provider smoke command defaults to a zero-call confirmation gate", () => {
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/tianyan-multi-node-prediction-real-provider-smoke-r1.mjs"], { cwd: process.cwd(), env: { ...process.env }, encoding: "utf8" });
  const result = JSON.parse(output) as { verdict: string; adapter: string; realProviderCalls: number; acceptedCandidates: number };
  assert.equal(result.verdict, "REAL_PROVIDER_SMOKE_NOT_STARTED_CONFIRMATION_REQUIRED");
  assert.equal(result.adapter, "READY_NOT_CALLED");
  assert.equal(result.realProviderCalls, 0);
  assert.equal(result.acceptedCandidates, 0);
});

async function* providerEvents(providerCall: number) {
  if (providerCall > 1) {
    yield { type: "chunk" as const, text: "候选路径已就绪。", finishReason: "stop", usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 } };
    yield { type: "done" as const };
    return;
  }
  for (const [index, name] of TIAN_YI_PREDICTION_TOOL_ALLOWLIST.entries()) {
    const id = `tool-call.${index + 1}`;
    yield { type: "tool-call-start" as const, id, name, index };
    yield { type: "tool-call-delta" as const, id, name, index, argumentsDelta: "{}" };
    yield { type: "tool-call-end" as const, id, name, index, argumentsJson: "{}", arguments: {} };
  }
  yield { type: "done" as const };
}
