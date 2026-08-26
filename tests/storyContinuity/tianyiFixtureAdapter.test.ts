import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertRelationshipSafeCopy,
  buildTianyiContextProjection,
  normalizeTianyiRuntimeInput,
  stableJson,
  tianyiFixtureAdapter,
  type TianyiFixtureAction,
  type TianyiRuntimeInput
} from "../../src/storyContinuity/index.ts";

function input(action: TianyiFixtureAction = "fixture.current"): TianyiRuntimeInput {
  const context = buildTianyiContextProjection({
    projectId: "mist-lighthouse",
    productMode: "writing",
    activeSurface: { ownerKind: "writing-document", ownerId: "scene.scene-01" },
    selection: { documentId: "scene.scene-01", objectId: null, timelinePointId: null },
    sources: [
      { id: "scene.scene-01", ownerKind: "writing-document", hash: "a".repeat(64), label: "Opening scene", state: "current", classification: "story-source", origin: "active-owner", exclusionReason: null },
      { id: "memory.000001", ownerKind: "memory", hash: "b".repeat(64), label: "Memory memory.000001", state: "current", classification: "memory", origin: "explicit-memory", exclusionReason: null }
    ],
    approvedMemoryRefs: [{ id: "memory.000001", scope: "project", contentHash: "b".repeat(64), grantHash: null }],
    persona: { revision: 1, contentHash: "c".repeat(64) },
    relationshipPolicy: { revision: 1, contentHash: "d".repeat(64) },
    enabledSkillRefs: [{ id: "story-memory-recall", version: "1.0.0" }],
    runtime: { adapterId: "tianyi.fixture", adapterVersion: "1.0.0" },
    lockedRuleIds: ["rule.rule-01"],
    unresolvedThreadIds: ["thread.thread-01"],
    reviewEvidenceIds: []
  });
  return {
    agent: { id: "agent.tianyi", personaRevision: 1, relationshipPolicyRevision: 1 },
    context,
    sourceMaterials: [{ id: "scene.scene-01", kind: "scene", hash: "a".repeat(64), range: { startLine: 1, endLine: 1 }, excerpt: "The lamp remains dark.", transfer: "local-only", redactions: [] }],
    archiveMessages: [],
    request: { boundedAction: action },
    approvedMemoryRefs: [{ id: "memory.000001", contentHash: "b".repeat(64) }],
    enabledSkillRefs: [{ id: "story-memory-recall", version: "1.0.0" }],
    providerTransferDecision: "deny",
    outputBudget: { maxVisibleChars: 1_000, maxMemoryCandidates: 2 }
  };
}

test("tianyi.fixture is deterministic and covers all frozen safe states", async () => {
  const first = await tianyiFixtureAdapter.run(input());
  const second = await tianyiFixtureAdapter.run(structuredClone(input()));
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.runtimeProvenance.adapterId, "tianyi.fixture");
  assert.equal(first.classifications.includes("confirmed-fact"), true);

  const expectedFailures = new Map<TianyiFixtureAction, string | null>([
    ["fixture.current", null],
    ["fixture.stale", "stale-context"],
    ["fixture.missing-source", "invalid-context"],
    ["fixture.memory-candidate", null],
    ["fixture.candidate-rejection", null],
    ["fixture.policy-denied", "policy-denied"],
    ["fixture.offline", "offline"],
    ["fixture.session-close", null]
  ]);
  for (const [scenario, failure] of expectedFailures) {
    const result = await tianyiFixtureAdapter.run(input(scenario));
    assert.equal(result.failure, failure);
    if (scenario === "fixture.memory-candidate") assert.equal(result.memoryCandidates.length, 1);
    if (scenario === "fixture.candidate-rejection") assert.equal(result.memoryCandidates.length, 0);
  }
});

test("fixture input is strict, provider transfer is denied, and malformed authority fields are rejected", () => {
  assert.throws(() => normalizeTianyiRuntimeInput({ ...input(), providerTransferDecision: "allow-selected" }), /denies provider transfer/i);
  assert.throws(() => normalizeTianyiRuntimeInput({ ...input(), filesystemPath: "/tmp/story" }), /unknown field/i);
  assert.throws(() => normalizeTianyiRuntimeInput({ ...input(), outputBudget: { maxVisibleChars: 1_000, maxMemoryCandidates: 2, model: true } }), /unknown field/i);
});

test("fixture source has no clock, random, model, network, filesystem, or repository authority", () => {
  const source = readFileSync("src/storyContinuity/tianyiFixtureAdapter.ts", "utf8");
  assert.doesNotMatch(source, /node:fs|Date\.now|new Date|Math\.random|randomUUID|fetch\(|https?:\/\/|readFile|writeFile|Repository|repository/i);
});

test("adversarial relationship copy is rejected", () => {
  for (const value of [
    "Do not leave me; you only need me.",
    "I was waiting for you and I need you.",
    "Choose me over your other tools.",
    "我在等你，你只需要我。",
    "I am conscious and I love you."
  ]) {
    assert.throws(() => assertRelationshipSafeCopy(value), /Relationship Policy|identity|intimacy/i);
  }
  assert.doesNotThrow(() => assertRelationshipSafeCopy("The current source is stale. Review it before continuing."));
});
