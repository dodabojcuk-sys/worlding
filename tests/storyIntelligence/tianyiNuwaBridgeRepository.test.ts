import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  approveExecutionBriefRevision,
  computeExecutionBriefHash,
  computeExecutionSourceSetHash,
  normalizeNuwaResultReceipt,
  normalizeTianyiNuwaExecutionBrief,
  readExecutionBriefRevision,
  readLatestExecutionBriefRevision,
  readNuwaResultReceipt,
  writeExecutionBriefRevision,
  writeNuwaResultReceipt,
  type NuwaResultReceipt,
  type TianyiNuwaExecutionBrief
} from "../../src/storyIntelligence/index.ts";

test("Execution Brief v1 rejects unknown, dangerous, unbounded, and path-bearing input", () => {
  const valid = brief();
  assert.deepEqual(normalizeTianyiNuwaExecutionBrief(valid), valid);

  const unknown = structuredClone(valid) as TianyiNuwaExecutionBrief & { transcript?: string };
  unknown.transcript = "full session";
  assert.throws(() => normalizeTianyiNuwaExecutionBrief(unknown), /fields are invalid/);

  const nestedUnknown = structuredClone(valid) as TianyiNuwaExecutionBrief & { capabilityBudget: TianyiNuwaExecutionBrief["capabilityBudget"] & { provider?: string } };
  nestedUnknown.capabilityBudget.provider = "openai";
  assert.throws(() => normalizeTianyiNuwaExecutionBrief(nestedUnknown), /capability budget fields/);

  const pathBearing = structuredClone(valid);
  pathBearing.currentContext.documentId = "/Users/private/story.md";
  assert.throws(() => normalizeTianyiNuwaExecutionBrief(pathBearing), /stable product identifier/);

  const tooMany = structuredClone(valid);
  tooMany.approvedMemoryRefs = Array.from({ length: 17 }, (_, index) => `memory.${index}`);
  assert.throws(() => normalizeTianyiNuwaExecutionBrief(tooMany), /Memory references is invalid/);

  const dangerous = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
  dangerous.currentContext = JSON.parse('{"mode":"writing","documentId":"scene.1","objectIds":[],"selectionRef":"selection.1","constructor":{"polluted":true}}');
  assert.throws(() => normalizeTianyiNuwaExecutionBrief(dangerous), /dangerous key|fields are invalid/);
});

test("Execution Brief revisions are append-only, hash-bound, and approval-neutral", () => {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-brief-repository-"));
  try {
    const first = brief();
    assert.equal(computeExecutionBriefHash(first), first.expectedHashes.brief);
    assert.equal(computeExecutionSourceSetHash(first, resolvedSources([hash("scene"), hash("receipt")])), first.expectedHashes.sourceSet);
    assert.deepEqual(writeExecutionBriefRevision(root, first), first);
    assert.deepEqual(readExecutionBriefRevision(root, first.briefId), first);

    const approved = { ...first, authorApprovalState: "approved" as const };
    assert.equal(computeExecutionBriefHash(approved), first.expectedHashes.brief);
    assert.throws(() => writeExecutionBriefRevision(root, approved), /different content/);

    const secondSeed = {
      ...first,
      revision: 2,
      authorGoal: "Compare a narrower evidence-backed reveal.",
      authorApprovalState: "draft" as const,
      expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) }
    };
    const second = withHashes(secondSeed, [hash("scene-v2")]);
    writeExecutionBriefRevision(root, second);
    assert.deepEqual(readExecutionBriefRevision(root, first.briefId, 1), first);
    assert.deepEqual(readExecutionBriefRevision(root, first.briefId), second);
    assert.deepEqual(readLatestExecutionBriefRevision(root), second);

    const competingDraft = withHashes({ ...first, briefId: "brief.mist-lighthouse.0002", operationId: "operation.nuwa.0002" }, [hash("scene"), hash("receipt")]);
    writeExecutionBriefRevision(root, competingDraft);
    assert.deepEqual(readLatestExecutionBriefRevision(root), competingDraft);
    const approvedSecond = { ...second, authorApprovalState: "approved" as const };
    assert.deepEqual(approveExecutionBriefRevision(root, approvedSecond), approvedSecond);
    assert.deepEqual(readLatestExecutionBriefRevision(root), approvedSecond);

    const mismatched = structuredClone(second);
    mismatched.authorGoal = "Changed without a new hash.";
    assert.throws(() => writeExecutionBriefRevision(root, mismatched), /hash does not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Execution Brief source-set hash binds each source identity to its own hash", () => {
  const value = brief();
  const left = [
    { kind: "story-snapshot" as const, id: "scene.opening", hash: hash("scene-a") },
    { kind: "context-receipt" as const, id: "receipt.000001", hash: hash("receipt-b") }
  ];
  const swapped = [
    { ...left[0], hash: left[1].hash },
    { ...left[1], hash: left[0].hash }
  ];
  assert.notEqual(computeExecutionSourceSetHash(value, left), computeExecutionSourceSetHash(value, swapped));
});

test("Result Receipt v1 binds an existing Nuwa run and derives no stale or partial eligibility", () => {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-result-receipt-"));
  try {
    const current = receipt();
    assert.deepEqual(normalizeNuwaResultReceipt(current), current);
    assert.throws(() => writeNuwaResultReceipt(root, "nuwa-run-bridge", current), /existing run artifact/);

    const runRoot = path.join(root, ".world-os", "runs", "nuwa", "nuwa-run-bridge");
    mkdirSync(path.join(runRoot, "report"), { recursive: true });
    writeFileSync(path.join(runRoot, "run.json"), "{}\n", "utf8");
    assert.deepEqual(writeNuwaResultReceipt(root, "nuwa-run-bridge", current), current);
    assert.deepEqual(readNuwaResultReceipt(root, "nuwa-run-bridge"), current);

    for (const staleState of ["stale", "partial"] as const) {
      assert.throws(() => normalizeNuwaResultReceipt({ ...current, staleState, impactReviewEligible: true }), /cannot enter Impact Review/);
      assert.equal(normalizeNuwaResultReceipt({ ...current, staleState, impactReviewEligible: false }).impactReviewEligible, false);
    }

    const unknown = { ...current, acceptedRouteId: "route.1" };
    assert.throws(() => normalizeNuwaResultReceipt(unknown), /fields are invalid/);
    const copiedTranscript = { ...current, sourceRefs: ["/tmp/full-transcript.json"] };
    assert.throws(() => normalizeNuwaResultReceipt(copiedTranscript), /stable product identifier|sources/);
    assert.throws(() => normalizeNuwaResultReceipt({ ...current, sourceRefs: ["这是完整对话而不是来源编号"] }), /structured reference/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function brief(): TianyiNuwaExecutionBrief {
  const seed: TianyiNuwaExecutionBrief = {
    version: "story-studio-tianyi-nuwa-execution-brief/v1",
    briefId: "brief.mist-lighthouse.0001",
    revision: 1,
    authorGoal: "Compare evidence-backed routes for revealing the lighthouse secret.",
    sourceProject: { projectId: "mist-lighthouse", projectRevision: hash("project") },
    currentContext: { mode: "writing", documentId: "scene.opening", objectIds: ["character.keeper"], selectionRef: "selection.opening.1" },
    selectedContextReceiptIds: ["receipt.000001"],
    selectedArchiveMessageRefs: [{ sessionId: "session.000001", messageId: "event.000001" }],
    approvedMemoryRefs: ["memory.000001"],
    mustKeep: ["The keeper cannot knowingly lie."],
    mustAvoid: ["Do not reveal the offshore faction."],
    unresolvedQuestions: ["Who notices the forged log first?"],
    expectedOutputKind: "candidate-routes",
    allowedAgents: ["nuwa.supervisor", "nuwa.continuity", "nuwa.evidence-critic"],
    allowedSkills: ["story-memory-recall@1.0.0"],
    capabilityBudget: { maxAgentRuns: 3, maxSkillCalls: 1, maxTokens: 12_000, timeoutSeconds: 180 },
    sensitivity: "project-private",
    authorApprovalState: "draft",
    expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) },
    operationId: "operation.nuwa.0001",
    originatingTianyiSessionId: "session.000001",
    returnDestination: { mode: "writing", documentId: "scene.opening", selectionRef: "selection.opening.1" }
  };
  return withHashes(seed, [hash("scene"), hash("receipt")]);
}

function withHashes(seed: TianyiNuwaExecutionBrief, sourceHashes: string[]): TianyiNuwaExecutionBrief {
  const prepared = { ...seed, expectedHashes: { brief: "0".repeat(64), sourceSet: "0".repeat(64) } };
  const briefHash = computeExecutionBriefHash(prepared);
  const withBrief = { ...prepared, expectedHashes: { ...prepared.expectedHashes, brief: briefHash } };
  return { ...withBrief, expectedHashes: { brief: briefHash, sourceSet: computeExecutionSourceSetHash(withBrief, resolvedSources(sourceHashes)) } };
}

function resolvedSources(hashes: string[]) {
  return hashes.map((value, index) => ({
    kind: index === 0 ? "story-snapshot" as const : "context-receipt" as const,
    id: index === 0 ? "scene.opening" : `receipt.${String(index).padStart(6, "0")}`,
    hash: value
  }));
}

function receipt(): NuwaResultReceipt {
  return {
    version: "story-studio-nuwa-result-receipt/v1",
    resultReceiptId: "nuwa-result.000001",
    briefId: "brief.mist-lighthouse.0001",
    briefRevision: 1,
    operationId: "operation.nuwa.0001",
    agentsUsed: ["nuwa.supervisor", "nuwa.continuity"],
    skillsUsed: ["story-memory-recall@1.0.0"],
    sourceRefs: ["receipt.000001", "session.000001:event.000001", "story.character.keeper"],
    candidateRouteIds: ["route.1", "route.2"],
    disagreements: ["Continuity review requires an author decision."],
    unresolvedQuestions: ["Who notices the forged log first?"],
    staleState: "current",
    impactReviewEligible: true,
    returnDestination: { tianyiSessionId: "session.000001", mode: "writing", documentId: "scene.opening", selectionRef: "selection.opening.1" }
  };
}

function hash(value: string): string {
  return Buffer.from(value).toString("hex").padEnd(64, "0").slice(0, 64);
}
