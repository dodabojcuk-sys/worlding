import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendSessionEvent,
  createSession,
  readSession
} from "../../src/storyContinuity/interactionArchiveRepository.ts";
import {
  defaultTianyiPersona,
  initializePersona,
  readPersona,
  readRelationshipPolicy,
  updatePersona
} from "../../src/storyContinuity/personaPolicyRepositories.ts";
import {
  createTianyiGroundedAnswerOperations,
  TianyiGroundedRecoveryError,
  type TianyiGroundedModelGateway
} from "../../src/storyContinuity/tianyiGroundedAnswerOperation.ts";
import { ensureTianyiIdentityReady } from "../../src/storyContinuity/tianyiIdentityReadiness.ts";
import {
  compileTianyiGroundedContext,
  type TianyiGroundedContextRequest
} from "../../src/storyContinuity/tianyiGroundedContextGate.ts";
import {
  CONTEXT_RECEIPT_VERSION,
  INTERACTION_EVENT_VERSION,
  type ContextReceiptV5,
  type InteractionEvent
} from "../../src/storyContinuity/continuityTypes.ts";
import { sha256, stableJson } from "../../src/storyContinuity/continuityValidation.ts";
import { resolveContinuityOwner } from "../../src/storyContinuity/continuityFilesystem.ts";
import {
  allocateReceiptId,
  createReceipt,
  readReceipt
} from "../../src/storyContinuity/receiptStoppingRepositories.ts";

const RECORDED_AT = "2026-07-31T00:00:00.000Z";
const ANSWER = JSON.stringify({
  summary: "现有证据不足。",
  claims: [{
    statement: "无法确认。",
    status: "unknown",
    sourceRefs: [],
    uncertaintyReason: "没有已授权来源。"
  }],
  status: "unknown",
  sourceRefs: [],
  uncertaintyReason: "没有已授权来源。",
  includedSources: [],
  excludedSources: []
});

test("clean-start identity bootstraps before Provider dispatch and freezes exact owner history", async () => {
  const fixture = await createFixture();
  try {
    assert.equal(await readPersona(fixture.authorContext), null);
    assert.equal(await readRelationshipPolicy(fixture.authorContext), null);
    const providerSnapshots: unknown[] = [];
    const gateway = gatewayFrom(async () => {
      const snapshot = await ensureTianyiIdentityReady({
        rootPath: fixture.rootPath,
        agentId: "agent.tianyi",
        projectId: fixture.projectId,
        recordedAt: RECORDED_AT
      });
      providerSnapshots.push(snapshot);
      return ANSWER;
    });
    const operation = operations(fixture, gateway);
    const result = await operation.runTianyiGroundedAnswer({
      operationId: "operation.clean-start",
      submissionId: "submission.clean-start",
      profileId: "loopback",
      question: "当前能确认什么？",
      contextRequest: fixture.request
    });

    assert.equal(result.status, "current");
    assert.equal(providerSnapshots.length, 1);
    const receipt = await readReceipt(fixture.projectContext, result.receiptId);
    assert.equal(receipt?.value.version, "story-tianyi-context-receipt/v5");
    if (receipt?.value.version !== "story-tianyi-context-receipt/v5") assert.fail("Receipt v5 is required.");
    assert.deepEqual(receipt.value.identitySnapshot, providerSnapshots[0]);
    assert.equal(receipt.value.identitySnapshot.projectId, fixture.projectId);
    assert.equal(receipt.value.identitySnapshot.persona.owner.scope, "author-global");
    assert.equal(receipt.value.identitySnapshot.relationshipPolicy.owner.scope, "author-global");
  } finally {
    await fixture.cleanup();
  }
});

test("identity preview is zero-write; canonical half-pair recovers; custom or historyless half-pair fails closed", async () => {
  const preview = await createFixture();
  try {
    const before = await listRelativeFiles(preview.rootPath);
    assert.equal(await readPersona(preview.authorContext), null);
    assert.equal(await readRelationshipPolicy(preview.authorContext), null);
    assert.deepEqual(await listRelativeFiles(preview.rootPath), before);
  } finally {
    await preview.cleanup();
  }

  const recovered = await createFixture();
  try {
    await assert.rejects(
      ensureTianyiIdentityReady({
        rootPath: recovered.rootPath,
        agentId: "agent.tianyi",
        projectId: recovered.projectId,
        recordedAt: RECORDED_AT,
        onFaultMilestone(milestone) {
          if (milestone === "after-persona-create") throw new Error("simulated process boundary");
        }
      }),
      /simulated process boundary/u
    );
    assert.ok(await readPersona(recovered.authorContext));
    assert.equal(await readRelationshipPolicy(recovered.authorContext), null);
    const snapshot = await ensureTianyiIdentityReady({
      rootPath: recovered.rootPath,
      agentId: "agent.tianyi",
      projectId: recovered.projectId,
      recordedAt: RECORDED_AT
    });
    assert.match(snapshot.digest, /^[a-f0-9]{64}$/u);
  } finally {
    await recovered.cleanup();
  }

  const custom = await createFixture();
  try {
    const created = await initializePersona(
      custom.authorContext,
      { source: "create", recordedAt: RECORDED_AT, operationId: "operation.custom-persona" },
      { ...defaultTianyiPersona(), working_style: "author-custom" }
    );
    assert.equal(created.ok, true);
    await assert.rejects(
      ensureTianyiIdentityReady({
        rootPath: custom.rootPath,
        agentId: "agent.tianyi",
        projectId: custom.projectId,
        recordedAt: RECORDED_AT
      }),
      (error: unknown) => error instanceof Error && "identityState" in error && error.identityState === "CONFLICTED"
    );
  } finally {
    await custom.cleanup();
  }

  const historyless = await createFixture();
  try {
    await initializePersona(
      historyless.authorContext,
      { source: "create", recordedAt: RECORDED_AT, operationId: "operation.historyless-persona" }
    );
    await rm(path.join(
      historyless.rootPath,
      "_continuity",
      "agents",
      "agent.tianyi",
      "history",
      "persona"
    ), {
      recursive: true,
      force: true
    });
    await assert.rejects(
      ensureTianyiIdentityReady({
        rootPath: historyless.rootPath,
        agentId: "agent.tianyi",
        projectId: historyless.projectId,
        recordedAt: RECORDED_AT
      }),
      (error: unknown) => error instanceof Error && "identityState" in error && error.identityState === "HISTORY_MISSING"
    );
  } finally {
    await historyless.cleanup();
  }
});

for (const milestone of [
  "before-persona-create",
  "after-persona-create",
  "before-policy-create",
  "after-policy-create",
  "before-snapshot"
] as const) {
  test(`identity bootstrap converges after ${milestone}`, async () => {
    const fixture = await createFixture();
    try {
      let fired = false;
      await assert.rejects(
        ensureTianyiIdentityReady({
          rootPath: fixture.rootPath,
          agentId: "agent.tianyi",
          projectId: fixture.projectId,
          recordedAt: RECORDED_AT,
          onFaultMilestone(current) {
            if (!fired && current === milestone) {
              fired = true;
              throw new Error(`fault:${milestone}`);
            }
          }
        }),
        new RegExp(`fault:${milestone}`, "u")
      );
      const recovered = await ensureTianyiIdentityReady({
        rootPath: fixture.rootPath,
        agentId: "agent.tianyi",
        projectId: fixture.projectId,
        recordedAt: RECORDED_AT
      });
      assert.match(recovered.digest, /^[a-f0-9]{64}$/u);
      assert.equal(recovered.persona.historySequence, 1);
      assert.equal(recovered.relationshipPolicy.historySequence, 1);
    } finally {
      await fixture.cleanup();
    }
  });
}

test("deliberate duplicate questions are distinct while one submission is locally idempotent", async () => {
  const fixture = await createFixture();
  try {
    let providerCalls = 0;
    const operation = operations(fixture, gatewayFrom(async () => {
      providerCalls += 1;
      return ANSWER;
    }));
    const first = await operation.runTianyiGroundedAnswer({
      operationId: "operation.duplicate.first",
      submissionId: "submission.duplicate.first",
      profileId: "loopback",
      question: "同一个问题",
      contextRequest: fixture.request
    });
    const transportRetry = await operation.runTianyiGroundedAnswer({
      operationId: "operation.duplicate.transport-retry",
      submissionId: "submission.duplicate.first",
      profileId: "loopback",
      question: "同一个问题",
      contextRequest: fixture.request
    });
    const second = await operation.runTianyiGroundedAnswer({
      operationId: "operation.duplicate.second",
      submissionId: "submission.duplicate.second",
      profileId: "loopback",
      question: "同一个问题",
      contextRequest: fixture.request
    });

    assert.equal(providerCalls, 2);
    assert.equal(transportRetry.alreadyCompleted, true);
    assert.equal(first.questionAttemptKey === second.questionAttemptKey, false);
    const session = await readSession(fixture.projectContext, fixture.sessionId);
    assert.equal(session?.value.filter((event) => event.type === "author-message").length, 2);
    assert.equal(session?.value.filter((event) => event.type === "tianyi-response").length, 2);
    assert.equal((await listReceiptOwners(fixture)).length, 2);
  } finally {
    await fixture.cleanup();
  }
});

test("same submission with a different payload fails QUESTION_ATTEMPT_MISMATCH", async () => {
  const fixture = await createFixture();
  try {
    const operation = operations(fixture, gatewayFrom(async () => ANSWER));
    await operation.runTianyiGroundedAnswer({
      operationId: "operation.mismatch.first",
      submissionId: "submission.mismatch",
      profileId: "loopback",
      question: "原问题",
      contextRequest: fixture.request
    });
    await assert.rejects(
      operation.runTianyiGroundedAnswer({
        operationId: "operation.mismatch.second",
        submissionId: "submission.mismatch",
        profileId: "loopback",
        question: "不同问题",
        contextRequest: fixture.request
      }),
      (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "QUESTION_ATTEMPT_MISMATCH"
    );
  } finally {
    await fixture.cleanup();
  }
});

test("unknown Provider outcome never auto-redispatches and explicit retry retains one local artifact set", async () => {
  const fixture = await createFixture();
  try {
    let providerCalls = 0;
    const first = operations(fixture, gatewayFrom(async () => {
      providerCalls += 1;
      throw new Error("delivery interrupted");
    }));
    const input = {
      operationId: "operation.unknown.first",
      submissionId: "submission.unknown",
      profileId: "loopback",
      question: "需要恢复",
      contextRequest: fixture.request
    };
    await assert.rejects(first.runTianyiGroundedAnswer(input), /delivery interrupted/u);
    const afterFailure = await readSession(fixture.projectContext, fixture.sessionId);
    assert.equal(afterFailure?.value.filter((event) => event.type === "author-message").length, 1);
    assert.equal((await listReceiptReservations(fixture.rootPath)).length, 1);

    const restarted = operations(fixture, gatewayFrom(async () => {
      providerCalls += 1;
      return ANSWER;
    }));
    await assert.rejects(
      restarted.runTianyiGroundedAnswer({ ...input, operationId: "operation.unknown.restart" }),
      (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "PROVIDER_OUTCOME_UNKNOWN"
    );
    assert.equal(providerCalls, 1, "restart read must not dispatch");
    const completed = await restarted.runTianyiGroundedAnswer({
      ...input,
      operationId: "operation.unknown.explicit-retry",
      explicitRetry: true
    });
    assert.equal(completed.status, "current");
    assert.equal(providerCalls, 2);
    const finalSession = await readSession(fixture.projectContext, fixture.sessionId);
    assert.equal(finalSession?.value.filter((event) => event.type === "author-message").length, 1);
    assert.equal(finalSession?.value.filter((event) => event.type === "tianyi-response").length, 1);
    assert.equal((await listReceiptOwners(fixture)).length, 1);
    assert.equal((await listReceiptReservations(fixture.rootPath)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

for (const scenario of [
  { name: "timeout", response: async () => { throw new Error("provider timeout"); }, expectedCalls: 1 },
  { name: "abort", response: async () => { throw new Error("provider abort"); }, expectedCalls: 1 },
  { name: "429", response: async () => { throw new Error("provider 429"); }, expectedCalls: 1 },
  { name: "500", response: async () => { throw new Error("provider 500"); }, expectedCalls: 1 },
  { name: "malformed-json", response: async () => "{", expectedCalls: 2 },
  { name: "forbidden-extra-field", response: async () => JSON.stringify({ ...JSON.parse(ANSWER), forbidden: true }), expectedCalls: 2 },
  { name: "invalid-repair", response: async () => "{}", expectedCalls: 2 }
] as const) {
  test(`terminal Provider failure retains one author and reservation for ${scenario.name}`, async () => {
    const fixture = await createFixture();
    try {
      let providerCalls = 0;
      const operation = operations(fixture, gatewayFrom(async () => {
        providerCalls += 1;
        return scenario.response();
      }));
      await assert.rejects(operation.runTianyiGroundedAnswer({
        operationId: `operation.failure.${scenario.name}`,
        submissionId: `submission.failure.${scenario.name}`,
        profileId: "loopback",
        question: "失败保留",
        contextRequest: fixture.request
      }));
      const session = await readSession(fixture.projectContext, fixture.sessionId);
      assert.equal(providerCalls, scenario.expectedCalls);
      assert.equal(session?.value.filter((event) => event.type === "author-message").length, 1);
      assert.equal(session?.value.filter((event) => event.type === "tianyi-response").length, 0);
      assert.equal((await listReceiptOwners(fixture)).length, 0);
      assert.equal((await listReceiptReservations(fixture.rootPath)).length, 1);
    } finally {
      await fixture.cleanup();
    }
  });
}

test("orphan Receipt reservation remains consumed and is never rebound", async () => {
  const fixture = await createFixture();
  try {
    const orphanReceiptId = await allocateReceiptId(fixture.projectContext);
    const result = await operations(fixture, gatewayFrom(async () => ANSWER)).runTianyiGroundedAnswer({
      operationId: "operation.orphan-reservation",
      submissionId: "submission.orphan-reservation",
      profileId: "loopback",
      question: "保留空洞",
      contextRequest: fixture.request
    });
    assert.notEqual(result.receiptId, orphanReceiptId);
    assert.equal((await listReceiptReservations(fixture.rootPath)).length, 2);
    assert.deepEqual(await listReceiptOwners(fixture), [`${result.receiptId}.context-receipt.json`]);
  } finally {
    await fixture.cleanup();
  }
});

test("occupied reserved Receipt target fails closed without alternate finalization", async () => {
  const fixture = await createFixture();
  try {
    let fired = false;
    const first = createTianyiGroundedAnswerOperations({
      rootPath: fixture.rootPath,
      agentId: "agent.tianyi",
      now: () => RECORDED_AT,
      compileGroundedContext: async (request) => compileTianyiGroundedContext({ request, candidates: [] }),
      gateway: gatewayFrom(async () => ANSWER),
      onFaultMilestone(current) {
        if (!fired && current === "before-receipt-commit") {
          fired = true;
          throw new Error("fault:before-receipt-commit");
        }
      }
    });
    const input = {
      operationId: "operation.receipt-collision",
      submissionId: "submission.receipt-collision",
      profileId: "loopback",
      question: "收据冲突",
      contextRequest: fixture.request
    };
    await assert.rejects(first.runTianyiGroundedAnswer(input), /fault:before-receipt-commit/u);
    const session = await readSession(fixture.projectContext, fixture.sessionId);
    assert.ok(session);
    const archived = JSON.parse(session.value.find((event) => event.type === "author-message")?.content ?? "{}") as {
      receiptId: string;
    };
    const collision = await createReceipt(fixture.projectContext, {
      version: CONTEXT_RECEIPT_VERSION,
      id: archived.receiptId,
      sessionId: fixture.sessionId,
      agentId: "agent.tianyi",
      personaRevision: 1,
      relationshipPolicyRevision: 1,
      runtime: { mode: "deterministic", adapterId: "tianyi.fixture", adapterVersion: "1.0.0" },
      project: { id: fixture.projectId, surface: "collision" },
      selection: { documentId: null, objectId: null, timelinePointId: null },
      sources: [],
      approvedMemoryIds: [],
      enabledSkillRefs: [],
      excludedSources: [],
      generationTimestamp: RECORDED_AT,
      stale: false,
      responseClassifications: ["unavailable-evidence"]
    }, {
      source: "immutable-create",
      recordedAt: RECORDED_AT,
      operationId: "operation.unrelated-receipt"
    });
    assert.equal(collision.ok, true);
    await assert.rejects(
      operations(fixture, gatewayFrom(async () => assert.fail("Provider must not rerun"))).runTianyiGroundedAnswer({
        ...input,
        operationId: "operation.receipt-collision.recover"
      }),
      (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "ATTEMPT_CONFLICT"
    );
    const finalSession = await readSession(fixture.projectContext, fixture.sessionId);
    assert.equal(finalSession?.value.filter((event) => event.type === "author-message").length, 1);
    assert.equal(finalSession?.value.filter((event) => event.type === "tianyi-response").length, 0);
    assert.equal((await listReceiptOwners(fixture)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("malformed attempt state and closed partial Session both fail closed", async () => {
  for (const variant of ["malformed-state", "closed-session"] as const) {
    const fixture = await createFixture();
    try {
      let fired = false;
      const first = createTianyiGroundedAnswerOperations({
        rootPath: fixture.rootPath,
        agentId: "agent.tianyi",
        now: () => RECORDED_AT,
        compileGroundedContext: async (request) => compileTianyiGroundedContext({ request, candidates: [] }),
        gateway: gatewayFrom(async () => ANSWER),
        onFaultMilestone(current) {
          if (!fired && current === "after-author-prepared") {
            fired = true;
            throw new Error("fault:after-author-prepared");
          }
        }
      });
      const input = {
        operationId: `operation.${variant}`,
        submissionId: `submission.${variant}`,
        profileId: "loopback",
        question: "异常状态",
        contextRequest: fixture.request
      };
      await assert.rejects(first.runTianyiGroundedAnswer(input), /fault:after-author-prepared/u);
      const session = await readSession(fixture.projectContext, fixture.sessionId);
      assert.ok(session);
      const event: InteractionEvent = {
        version: INTERACTION_EVENT_VERSION,
        eventId: `event.${variant}`,
        sessionId: fixture.sessionId,
        sequence: session.value.length + 1,
        type: variant === "malformed-state" ? "grounded-attempt" : "session-closed",
        recordedAt: RECORDED_AT,
        actor: "system",
        content: variant === "malformed-state" ? "{\"version\":\"invalid\"}" : JSON.stringify({ reason: "author-close" }),
        responseClassifications: [],
        memoryCandidateIds: [],
        receiptId: null,
        operationId: `operation.${variant}.inject`
      };
      const appended = await appendSessionEvent(
        fixture.projectContext,
        fixture.sessionId,
        session.contentHash,
        event.sequence,
        event,
        { recordedAt: RECORDED_AT, operationId: event.operationId }
      );
      assert.equal(appended.ok, true);
      await assert.rejects(operations(fixture, gatewayFrom(async () => assert.fail("Provider must not run"))).runTianyiGroundedAnswer({
        ...input,
        operationId: `operation.${variant}.recover`,
        explicitRetry: true
      }));
      const finalSession = await readSession(fixture.projectContext, fixture.sessionId);
      assert.equal(finalSession?.value.filter((item) => item.type === "author-message").length, 1);
      assert.equal(finalSession?.value.filter((item) => item.type === "tianyi-response").length, 0);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("multiple Receipt or assistant artifacts for one attempt fail closed", async () => {
  for (const variant of ["receipt", "assistant"] as const) {
    const fixture = await createFixture();
    try {
      let fired = false;
      const first = createTianyiGroundedAnswerOperations({
        rootPath: fixture.rootPath,
        agentId: "agent.tianyi",
        now: () => RECORDED_AT,
        compileGroundedContext: async (request) => compileTianyiGroundedContext({ request, candidates: [] }),
        gateway: gatewayFrom(async () => ANSWER),
        onFaultMilestone(current) {
          if (!fired && current === "after-receipt-committed") {
            fired = true;
            throw new Error("fault:after-receipt-committed");
          }
        }
      });
      const input = {
        operationId: `operation.multi-${variant}`,
        submissionId: `submission.multi-${variant}`,
        profileId: "loopback",
        question: "重复本地产物",
        contextRequest: fixture.request
      };
      await assert.rejects(first.runTianyiGroundedAnswer(input), /fault:after-receipt-committed/u);
      const session = await readSession(fixture.projectContext, fixture.sessionId);
      assert.ok(session);
      const archived = JSON.parse(session.value.find((event) => event.type === "author-message")?.content ?? "{}") as {
        questionAttemptKey: string;
        responseMessageId: string;
        receiptId: string;
      };
      if (variant === "receipt") {
        const original = await readReceipt(fixture.projectContext, archived.receiptId);
        assert.ok(original?.value.version === "story-tianyi-context-receipt/v5");
        const duplicateId = await allocateReceiptId(fixture.projectContext);
        const duplicate = await createReceipt(fixture.projectContext, {
          ...original.value,
          id: duplicateId
        }, {
          source: "immutable-create",
          recordedAt: RECORDED_AT,
          operationId: "operation.multi-receipt.inject"
        });
        assert.equal(duplicate.ok, true);
      } else {
        const duplicate: InteractionEvent = {
          version: INTERACTION_EVENT_VERSION,
          eventId: "event.duplicate-assistant",
          sessionId: fixture.sessionId,
          sequence: session.value.length + 1,
          type: "tianyi-response",
          recordedAt: RECORDED_AT,
          actor: "tianyi",
          content: JSON.stringify({ questionAttemptKey: archived.questionAttemptKey }),
          responseClassifications: ["unavailable-evidence"],
          memoryCandidateIds: [],
          receiptId: archived.receiptId,
          operationId: "operation.multi-assistant.inject"
        };
        const appended = await appendSessionEvent(
          fixture.projectContext,
          fixture.sessionId,
          session.contentHash,
          duplicate.sequence,
          duplicate,
          { recordedAt: RECORDED_AT, operationId: duplicate.operationId }
        );
        assert.equal(appended.ok, true);
      }
      await assert.rejects(
        operations(fixture, gatewayFrom(async () => assert.fail("Provider must not rerun"))).runTianyiGroundedAnswer({
          ...input,
          operationId: `operation.multi-${variant}.recover`
        }),
        (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "ATTEMPT_CONFLICT"
      );
    } finally {
      await fixture.cleanup();
    }
  }
});

for (const tamper of [
  {
    name: "submission",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      questionAttempt: { ...receipt.questionAttempt, submissionId: "submission.tampered" }
    })
  },
  {
    name: "author-message",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      questionAttempt: { ...receipt.questionAttempt, authorMessageId: "event.tampered-author" }
    })
  },
  {
    name: "response-message",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      questionAttempt: { ...receipt.questionAttempt, responseMessageId: "event.tampered-response" }
    })
  },
  {
    name: "session",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      sessionId: "session.999999"
    })
  },
  {
    name: "manifest-envelope",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      project: { ...receipt.project, surface: "f".repeat(64) }
    })
  },
  {
    name: "provider",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      runtime: { ...receipt.runtime, providerId: "provider.tampered" }
    })
  },
  {
    name: "profile-model",
    apply: (receipt: ContextReceiptV5): ContextReceiptV5 => ({
      ...receipt,
      runtime: { ...receipt.runtime, profileId: "profile.tampered", modelId: "tampered/model" }
    })
  }
] as const) {
  test(`Receipt ${tamper.name} envelope tampering fails closed during recovery`, async () => {
    const fixture = await createFixture();
    try {
      let providerCalls = 0;
      let fired = false;
      const first = createTianyiGroundedAnswerOperations({
        rootPath: fixture.rootPath,
        agentId: "agent.tianyi",
        now: () => RECORDED_AT,
        compileGroundedContext: async (request) => compileTianyiGroundedContext({ request, candidates: [] }),
        gateway: gatewayFrom(async () => {
          providerCalls += 1;
          return ANSWER;
        }),
        onFaultMilestone(current) {
          if (!fired && current === "after-receipt-committed") {
            fired = true;
            throw new Error("fault:after-receipt-committed");
          }
        }
      });
      const input = {
        operationId: `operation.receipt-envelope.${tamper.name}`,
        submissionId: `submission.receipt-envelope.${tamper.name}`,
        profileId: "loopback",
        question: "收据互指校验",
        contextRequest: fixture.request
      };
      await assert.rejects(first.runTianyiGroundedAnswer(input), /fault:after-receipt-committed/u);
      const session = await readSession(fixture.projectContext, fixture.sessionId);
      const archived = JSON.parse(session?.value.find((event) => event.type === "author-message")?.content ?? "{}") as {
        receiptId: string;
      };
      const receipt = await readReceipt(fixture.projectContext, archived.receiptId);
      assert.ok(receipt?.value.version === "story-tianyi-context-receipt/v5");
      await writeFile(receiptOwnerPath(fixture, archived.receiptId), stableJson(tamper.apply(receipt.value)), "utf8");
      await assert.rejects(
        operations(fixture, gatewayFrom(async () => {
          providerCalls += 1;
          return ANSWER;
        })).runTianyiGroundedAnswer({
          ...input,
          operationId: `operation.receipt-envelope.${tamper.name}.recover`
        }),
        (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "ATTEMPT_CONFLICT"
      );
      assert.equal(providerCalls, 1);
      const finalSession = await readSession(fixture.projectContext, fixture.sessionId);
      assert.equal(finalSession?.value.filter((event) => event.type === "tianyi-response").length, 0);
    } finally {
      await fixture.cleanup();
    }
  });
}

for (const variant of [
  "assistant-content-only",
  "assistant-and-receipt-digest",
  "missing-result-staged",
  "duplicate-result-staged",
  "malformed-result-staged",
  "result-staged-digest-mismatch",
  "result-staged-operation-mismatch",
  "receipt-response-identity-mismatch"
] as const) {
  test(`completed recovery rejects ${variant} without Provider or local writes`, async () => {
    const fixture = await createFixture();
    try {
      let providerCalls = 0;
      const input = {
        operationId: `operation.durable-result.${variant}`,
        submissionId: `submission.durable-result.${variant}`,
        profileId: "loopback",
        question: "持久结果完整性",
        contextRequest: fixture.request
      };
      await operations(fixture, gatewayFrom(async () => {
        providerCalls += 1;
        return ANSWER;
      })).runTianyiGroundedAnswer(input);

      const beforeTamper = await readSession(fixture.projectContext, fixture.sessionId);
      assert.ok(beforeTamper);
      const archived = JSON.parse(beforeTamper.value.find((event) => event.type === "author-message")?.content ?? "{}") as {
        receiptId: string;
        responseMessageId: string;
      };
      const response = beforeTamper.value.find((event) => event.eventId === archived.responseMessageId);
      const staged = beforeTamper.value.find((event) => {
        if (event.type !== "grounded-attempt") return false;
        return (JSON.parse(event.content) as { state?: unknown }).state === "RESULT_STAGED";
      });
      assert.ok(response?.type === "tianyi-response");
      assert.ok(staged);

      if (variant === "assistant-content-only" || variant === "assistant-and-receipt-digest") {
        let replacementDigest = "";
        await rewriteSessionArchive(fixture, (events) => {
          const target = events.find((event) => event.eventId === archived.responseMessageId);
          assert.ok(target);
          const content = JSON.parse(target.content) as {
            answer: { summary: string };
            usage: unknown;
            providerDispatchCount: number;
            visibleResponse: string;
            resultDigest: string;
          };
          const answer = { ...content.answer, summary: "被篡改的可见结果。" };
          replacementDigest = sha256(stableJson({
            answer,
            usage: content.usage,
            providerDispatchCount: content.providerDispatchCount
          }));
          target.content = JSON.stringify({
            ...content,
            answer,
            visibleResponse: answer.summary,
            ...(variant === "assistant-and-receipt-digest" ? { resultDigest: replacementDigest } : {})
          });
        });
        if (variant === "assistant-and-receipt-digest") {
          const receipt = await readReceipt(fixture.projectContext, archived.receiptId);
          assert.ok(receipt?.value.version === "story-tianyi-context-receipt/v5");
          await writeFile(receiptOwnerPath(fixture, archived.receiptId), stableJson({
            ...receipt.value,
            questionAttempt: { ...receipt.value.questionAttempt, resultDigest: replacementDigest }
          }), "utf8");
        }
      }

      if (variant === "missing-result-staged") {
        await rewriteSessionArchive(fixture, (events) => {
          const index = events.findIndex((event) => event.eventId === staged.eventId);
          assert.ok(index >= 0);
          events.splice(index, 1);
        });
      }

      if (variant === "duplicate-result-staged") {
        await rewriteSessionArchive(fixture, (events) => {
          events.push({ ...staged, eventId: "event.duplicate-result-staged" });
        });
      }

      if (variant === "malformed-result-staged" || variant === "result-staged-digest-mismatch" || variant === "result-staged-operation-mismatch") {
        await rewriteSessionArchive(fixture, (events) => {
          const target = events.find((event) => event.eventId === staged.eventId);
          assert.ok(target);
          if (variant === "malformed-result-staged") {
            target.content = "{\"version\":\"invalid\"}";
          }
          if (variant === "result-staged-digest-mismatch") {
            const content = JSON.parse(target.content) as { resultDigest: string };
            target.content = JSON.stringify({ ...content, resultDigest: "0".repeat(64) });
          }
          if (variant === "result-staged-operation-mismatch") {
            target.operationId = "operation.durable-result.tampered";
          }
        });
      }

      if (variant === "receipt-response-identity-mismatch") {
        const receipt = await readReceipt(fixture.projectContext, archived.receiptId);
        assert.ok(receipt?.value.version === "story-tianyi-context-receipt/v5");
        await writeFile(receiptOwnerPath(fixture, archived.receiptId), stableJson({
          ...receipt.value,
          questionAttempt: { ...receipt.value.questionAttempt, responseMessageId: "event.tampered-response" }
        }), "utf8");
      }

      const sessionPath = await sessionOwnerPath(fixture);
      const receiptPath = receiptOwnerPath(fixture, archived.receiptId);
      const beforeRecoverySession = await readFile(sessionPath, "utf8");
      const beforeRecoveryReceipt = await readFile(receiptPath, "utf8");
      const beforeRecoveryFiles = await listRelativeFiles(fixture.rootPath);
      await assert.rejects(
        operations(fixture, gatewayFrom(async () => {
          providerCalls += 1;
          return ANSWER;
        })).runTianyiGroundedAnswer({
          ...input,
          operationId: `operation.durable-result.${variant}.recover`
        }),
        (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "ATTEMPT_CONFLICT"
      );
      assert.equal(providerCalls, 1);
      assert.equal(await readFile(sessionPath, "utf8"), beforeRecoverySession);
      assert.equal(await readFile(receiptPath, "utf8"), beforeRecoveryReceipt);
      assert.deepEqual(await listRelativeFiles(fixture.rootPath), beforeRecoveryFiles);
    } finally {
      await fixture.cleanup();
    }
  });
}

for (const milestone of [
  "after-result-staged",
  "after-receipt-committed",
  "after-assistant-appended"
] as const) {
  test(`${milestone} restart completes without another Provider dispatch`, async () => {
    const fixture = await createFixture();
    try {
      let providerCalls = 0;
      let fired = false;
      const first = createTianyiGroundedAnswerOperations({
        rootPath: fixture.rootPath,
        agentId: "agent.tianyi",
        now: () => RECORDED_AT,
        compileGroundedContext: async (request) => compileTianyiGroundedContext({ request, candidates: [] }),
        gateway: gatewayFrom(async () => {
          providerCalls += 1;
          return ANSWER;
        }),
        onFaultMilestone(current) {
          if (!fired && current === milestone) {
            fired = true;
            throw new Error(`fault:${milestone}`);
          }
        }
      });
      const input = {
        operationId: `operation.${milestone.replaceAll("-", ".")}`,
        submissionId: `submission.${milestone.replaceAll("-", ".")}`,
        profileId: "loopback",
        question: "阶段恢复",
        contextRequest: fixture.request
      };
      await assert.rejects(first.runTianyiGroundedAnswer(input), new RegExp(`fault:${milestone}`, "u"));
      const restarted = operations(fixture, gatewayFrom(async () => {
        providerCalls += 1;
        return ANSWER;
      }));
      const result = await restarted.runTianyiGroundedAnswer({
        ...input,
        operationId: `operation.${milestone.replaceAll("-", ".")}.restart`
      });
      assert.equal(result.status, "current");
      assert.equal(providerCalls, 1);
      const session = await readSession(fixture.projectContext, fixture.sessionId);
      assert.equal(session?.value.filter((event) => event.type === "author-message").length, 1);
      assert.equal(session?.value.filter((event) => event.type === "tianyi-response").length, 1);
      assert.equal((await listReceiptOwners(fixture)).length, 1);
    } finally {
      await fixture.cleanup();
    }
  });
}

test("concurrent same-submission calls claim one initial Provider dispatch and one local artifact set", async () => {
  const fixture = await createFixture();
  try {
    let providerCalls = 0;
    let release: (() => void) | null = null;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const operation = operations(fixture, gatewayFrom(async () => {
      providerCalls += 1;
      release?.();
      await barrier;
      return ANSWER;
    }));
    const input = {
      submissionId: "submission.concurrent",
      profileId: "loopback",
      question: "并发问题",
      contextRequest: fixture.request
    };
    const settled = await Promise.allSettled([
      operation.runTianyiGroundedAnswer({ ...input, operationId: "operation.concurrent.one" }),
      operation.runTianyiGroundedAnswer({ ...input, operationId: "operation.concurrent.two" })
    ]);
    assert.equal(settled.some((item) => item.status === "fulfilled"), true);
    assert.equal(providerCalls, 1);
    const session = await readSession(fixture.projectContext, fixture.sessionId);
    assert.equal(session?.value.filter((event) => event.type === "author-message").length, 1);
    assert.equal(session?.value.filter((event) => event.type === "tianyi-response").length, 1);
    assert.equal((await listReceiptOwners(fixture)).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("identity is revalidated before the repair Provider call", async () => {
  const fixture = await createFixture();
  try {
    let calls = 0;
    const operation = operations(fixture, gatewayFrom(async () => {
      calls += 1;
      if (calls === 1) {
        const persona = await readPersona(fixture.authorContext);
        assert.ok(persona);
        const updated = await updatePersona(
          fixture.authorContext,
          persona.contentHash,
          { ...persona.value, persona_revision: 2, body: `${persona.value.body} Changed.` },
          { recordedAt: "2026-07-31T00:00:01.000Z", operationId: "operation.identity-change" }
        );
        assert.equal(updated.ok, true);
        return "{}";
      }
      return ANSWER;
    }));
    await assert.rejects(
      operation.runTianyiGroundedAnswer({
        operationId: "operation.repair-identity",
        submissionId: "submission.repair-identity",
        profileId: "loopback",
        question: "修复前身份检查",
        contextRequest: fixture.request
      }),
      (error: unknown) => error instanceof TianyiGroundedRecoveryError && error.code === "QUESTION_ATTEMPT_MISMATCH"
    );
    assert.equal(calls, 1, "repair Provider must not run under changed identity");
  } finally {
    await fixture.cleanup();
  }
});

for (const crashCase of [
  { milestone: "after-identity-snapshot", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "before-receipt-reservation", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "after-receipt-reservation", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 2 },
  { milestone: "before-author-append", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 2 },
  { milestone: "after-author-prepared", explicitRetry: true, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "before-provider-dispatch", explicitRetry: true, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "after-provider-result", explicitRetry: true, expectedProviderCalls: 2, expectedReservations: 1 },
  { milestone: "before-result-staged", explicitRetry: true, expectedProviderCalls: 2, expectedReservations: 1 },
  { milestone: "after-result-staged", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "before-receipt-commit", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "after-receipt-committed", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "before-assistant-append", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "after-assistant-appended", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 },
  { milestone: "after-completed-state", explicitRetry: false, expectedProviderCalls: 1, expectedReservations: 1 }
] as const) {
  test(`real SIGKILL at ${crashCase.milestone} recovers in a new process`, async () => {
    const fixture = await createFixture();
    const providerLogPath = path.join(fixture.rootPath, "provider-calls.log");
    const processLogPath = path.join(fixture.rootPath, "processes.jsonl");
    const worker = path.resolve("tests/storyContinuity/fixtures/tianyiPartialRecoveryWorker.ts");
    const inspector = path.resolve("tests/storyContinuity/fixtures/tianyiPartialRecoveryInspector.ts");
    try {
      const started = spawnSync(process.execPath, [
        "--experimental-strip-types",
        worker,
        "start",
        fixture.rootPath,
        fixture.projectId,
        fixture.sessionId,
        crashCase.milestone,
        providerLogPath,
        "false",
        processLogPath
      ], { encoding: "utf8" });
      assert.equal(started.signal, "SIGKILL");
      const inspected = spawnSync(process.execPath, [
        "--experimental-strip-types",
        inspector,
        fixture.rootPath,
        fixture.projectId,
        fixture.sessionId
      ], { encoding: "utf8" });
      assert.equal(inspected.status, 0, inspected.stderr);
      const beforeRecovery = JSON.parse(inspected.stdout) as {
        authorMessages: number;
        assistantMessages: number;
        receiptIds: string[];
        reservationCount: number;
      };
      const recovered = spawnSync(process.execPath, [
        "--experimental-strip-types",
        worker,
        "recover",
        fixture.rootPath,
        fixture.projectId,
        fixture.sessionId,
        crashCase.milestone,
        providerLogPath,
        String(crashCase.explicitRetry),
        processLogPath
      ], { encoding: "utf8" });
      assert.equal(recovered.status, 0, recovered.stderr);
      const result = JSON.parse(recovered.stdout) as { status: string };
      assert.equal(result.status, "current");
      const providerCalls = (await readFile(providerLogPath, "utf8")).trim().split("\n").filter(Boolean);
      assert.equal(providerCalls.length, crashCase.expectedProviderCalls);
      const session = await readSession(fixture.projectContext, fixture.sessionId);
      assert.equal(session?.value.filter((event) => event.type === "author-message").length, 1);
      assert.equal(session?.value.filter((event) => event.type === "tianyi-response").length, 1);
      assert.equal((await listReceiptOwners(fixture)).length, 1);
      assert.equal((await listReceiptReservations(fixture.rootPath)).length, crashCase.expectedReservations);
      const processRows = (await readFile(processLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      const evidenceDirectory = process.env.TIANYAN_IDENTITY_SESSION_EVIDENCE_DIR;
      if (evidenceDirectory) {
        await appendFile(path.join(evidenceDirectory, "identity-session-fault-observations.jsonl"), `${JSON.stringify({
          milestone: crashCase.milestone,
          startPid: processRows[0]?.pid,
          startSignal: started.signal,
          beforeRecovery,
          recoveryPid: processRows[1]?.pid,
          recoveryExit: recovered.status,
          providerCalls: providerCalls.length,
          reservations: crashCase.expectedReservations,
          finalAuthorMessages: session?.value.filter((event) => event.type === "author-message").length,
          finalAssistantMessages: session?.value.filter((event) => event.type === "tianyi-response").length,
          finalReceipts: (await listReceiptOwners(fixture)).length
        })}\n`, "utf8");
      }
    } finally {
      await fixture.cleanup();
    }
  });
}

function operations(fixture: Awaited<ReturnType<typeof createFixture>>, gateway: TianyiGroundedModelGateway) {
  return createTianyiGroundedAnswerOperations({
    rootPath: fixture.rootPath,
    agentId: "agent.tianyi",
    now: () => RECORDED_AT,
    gateway,
    compileGroundedContext: async (request) => compileTianyiGroundedContext({ request, candidates: [] })
  });
}

function gatewayFrom(run: () => Promise<string>): TianyiGroundedModelGateway {
  return {
    metadata() {
      return { profiles: [{ id: "loopback", providerId: "loopback", modelId: "loopback/model" }] };
    },
    async openChatStream() {
      const value = await run();
      return {
        events: (async function* () {
          yield { type: "chunk" as const, text: value };
          yield {
            type: "done" as const,
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
          };
        })()
      };
    }
  };
}

async function createFixture() {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "tianyi-identity-recovery-"));
  const projectId = "synthetic-story";
  await mkdir(path.join(rootPath, projectId), { recursive: true });
  await writeFile(path.join(rootPath, projectId, "project.md"), "# Synthetic Story\n", "utf8");
  const projectContext = {
    rootPath,
    agentId: "agent.tianyi",
    scope: "project" as const,
    projectId
  };
  const authorContext = {
    rootPath,
    agentId: "agent.tianyi",
    scope: "author-global" as const
  };
  const sessionId = "session.000001";
  const opened: InteractionEvent = {
    version: INTERACTION_EVENT_VERSION,
    eventId: "event.session-open",
    sessionId,
    sequence: 1,
    type: "session-opened",
    recordedAt: RECORDED_AT,
    actor: "system",
    content: JSON.stringify({ projectId, agentId: "agent.tianyi" }),
    responseClassifications: [],
    memoryCandidateIds: [],
    receiptId: null,
    operationId: "operation.session-open"
  };
  const created = await createSession(projectContext, opened, {
    source: "create",
    recordedAt: RECORDED_AT,
    operationId: "operation.session-open"
  });
  assert.equal(created.ok, true);
  const request: TianyiGroundedContextRequest = {
    version: "story-tianyi-grounded-context-request/v1",
    projectId,
    sessionId,
    taskKind: "grounded-answer",
    accessMode: "author",
    subjectRef: null,
    sceneRef: null,
    explicitRefs: []
  };
  return {
    rootPath,
    projectId,
    projectContext,
    authorContext,
    sessionId,
    request,
    async cleanup() {
      await rm(rootPath, { recursive: true, force: true });
    }
  };
}

async function listReceiptOwners(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const directory = path.join(
    fixture.rootPath,
    fixture.projectId,
    path.join("continuity", "agents", "agent.tianyi", "receipts")
  );
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".context-receipt.json"));
  } catch {
    return [];
  }
}

async function sessionOwnerPath(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<string> {
  return (await resolveContinuityOwner(fixture.projectContext, "session", fixture.sessionId)).absolutePath;
}

async function rewriteSessionArchive(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  mutate: (events: InteractionEvent[]) => void
): Promise<void> {
  const ownerPath = await sessionOwnerPath(fixture);
  const events = (await readFile(ownerPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as InteractionEvent);
  mutate(events);
  await writeFile(
    ownerPath,
    `${events.map((event, index) => JSON.stringify({ ...event, sequence: index + 1 })).join("\n")}\n`,
    "utf8"
  );
}

function receiptOwnerPath(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  receiptId: string
): string {
  return path.join(
    fixture.rootPath,
    fixture.projectId,
    "continuity",
    "agents",
    "agent.tianyi",
    "receipts",
    `${receiptId}.context-receipt.json`
  );
}

async function listReceiptReservations(rootPath: string) {
  const base = path.join(rootPath, ".world-os/continuity-id-reservations");
  const result: string[] = [];
  async function walk(directory: string) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else result.push(path.relative(base, target));
    }
  }
  await walk(base);
  return result;
}

async function listRelativeFiles(rootPath: string) {
  const result: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else result.push(path.relative(rootPath, target).split(path.sep).join("/"));
    }
  }
  await walk(rootPath);
  return result.sort();
}
