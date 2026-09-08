import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";

import { agentPermissionProfileForIntent, createTianyiSubmitGate, currentTianyiAgentStep, shouldCommitTianyiAgentRunProjection, tianyiAgentRunStorageKey } from "../../apps/story-studio/src/components/tianyi/tianyiAgentRunViewModel.ts";
import { tianyiComposerDraftStorageKey, tianyiConversationStorageKey } from "../../apps/story-studio/src/product-shell/runtime/tianyiShellSessionRecovery.ts";
import { createActionPermissionBroker } from "../../src/storyControlSurface/actionPermissionBroker.ts";

test("R0.3 conversation and Page Agent Run recovery stay project- and session-scoped", () => {
  assert.equal(tianyiConversationStorageKey("project-a"), "tianyi-conversation:project-a");
  assert.equal(tianyiAgentRunStorageKey("project-a", "work-version.a", "session-a"), "tianyi-agent-run:project-a:work-version.a:session-a");
  assert.notEqual(tianyiAgentRunStorageKey("project-a", "work-version.a", "session-a"), tianyiAgentRunStorageKey("project-a", "work-version.b", "session-a"));
  assert.equal(tianyiComposerDraftStorageKey("project-a", "creative"), "tianyi-composer-draft:project-a:creative");
  assert.notEqual(tianyiComposerDraftStorageKey("project-a", "work"), tianyiComposerDraftStorageKey("project-b", "work"));
});

test("R0.3 author submission gate prevents duplicate session or run dispatch before UI state updates", () => {
  const gate = createTianyiSubmitGate();
  assert.equal(gate.tryEnter(), true);
  assert.equal(gate.inFlight, true);
  assert.equal(gate.tryEnter(), false);
  gate.leave();
  assert.equal(gate.inFlight, false);
  assert.equal(gate.tryEnter(), true);
});

test("R0.3 maps only broker-backed permission intents and preserves author-confirmation steps", () => {
  assert.equal(agentPermissionProfileForIntent("read-only"), "general");
  assert.equal(agentPermissionProfileForIntent("candidate"), "auto-review");
  assert.equal(agentPermissionProfileForIntent("suggest"), null);
  assert.equal(agentPermissionProfileForIntent("authorized-edit"), null);
  assert.deepEqual(currentTianyiAgentStep({ plan: [{ stepId: "step-1", status: "awaiting_author" }] } as never), { stepId: "step-1", status: "awaiting_author" });
  assert.equal(currentTianyiAgentStep({ plan: [{ stepId: "step-1", status: "completed" }] } as never), null);
});

test("R4 browser recovery cannot replace a terminal cancelled projection with an older stream snapshot", () => {
  const cancelled = { runId: "run.same", revision: 8, status: "cancelled" } as never;
  const staleRecovery = { runId: "run.same", revision: 7, status: "awaiting_author" } as never;
  const lateCompletion = { runId: "run.same", revision: 9, status: "completed" } as never;
  const newerCancelled = { runId: "run.same", revision: 9, status: "cancelled" } as never;
  assert.equal(shouldCommitTianyiAgentRunProjection(cancelled, staleRecovery), false);
  assert.equal(shouldCommitTianyiAgentRunProjection(cancelled, lateCompletion), false);
  assert.equal(shouldCommitTianyiAgentRunProjection(cancelled, newerCancelled), true);
  assert.equal(shouldCommitTianyiAgentRunProjection(cancelled, { runId: "run.new", revision: 1, status: "awaiting_author" } as never), true);
});

test("R0.3 permission intent reaches the existing broker without a Provider call", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyi-r03-permissions-"));
  try {
    const broker = createActionPermissionBroker({
      resolveProjectPath: (projectId) => path.join(root, projectId),
      now: () => "2026-08-29T00:00:00.000Z"
    });
    const profile = agentPermissionProfileForIntent("candidate");
    assert.equal(profile, "auto-review");
    broker.setProfile({ projectId: "project-a", profile });
    assert.equal(broker.read("project-a").profile, "auto-review");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Nuwa full access is a server-created, target-bound scope rather than a forged author confirmation", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "nuwa-full-access-permissions-"));
  try {
    const broker = createActionPermissionBroker({
      resolveProjectPath: (projectId) => path.join(root, projectId),
      now: () => "2026-09-08T00:00:00.000Z"
    });
    broker.setProfile({ projectId: "project-a", profile: "full-access" });
    const authorization = broker.grantNuwaFullAccess({
      projectId: "project-a",
      runId: "run.a",
      storyUnitId: "unit.bridge",
      storyUnitRevision: "unit-revision-a",
      actorIds: ["character.lin", "character.wu"],
      sourceOperationId: "nuwa.start.a"
    });
    const automatic = broker.record("project-a", {
      actor: "nuwa", action: "confirmed-event", targetType: "nuwa-run",
      targets: ["run.a", "unit.bridge", "character.lin", "character.wu"], authorizationId: authorization.id
    });
    assert.equal(automatic.outcome, "allowed");
    assert.equal(automatic.decisionSource, "nuwa-scope-authorization");
    assert.equal(automatic.authorizationId, authorization.id);
    const forged = broker.record("project-a", {
      actor: "nuwa", action: "confirmed-event", targetType: "nuwa-run",
      targets: ["run.a", "unit.other", "character.lin", "character.wu"], authorizationId: authorization.id
    });
    assert.equal(forged.outcome, "requires-author", "a valid authorization cannot be reused for another Story Unit");
    const browserSpoof = broker.record("project-a", {
      actor: "nuwa", action: "confirmed-event", targetType: "nuwa-run",
      targets: ["run.a", "unit.bridge", "character.lin", "character.wu"], authorConfirmed: true
    });
    assert.equal(browserSpoof.outcome, "requires-author");
    assert.equal(browserSpoof.decisionSource, "policy", "a Nuwa request cannot forge an author confirmation");
    broker.revokeNuwaFullAccess({ projectId: "project-a", authorizationId: authorization.id, reason: "作者停止自动执行。" });
    const revoked = broker.record("project-a", {
      actor: "nuwa", action: "confirmed-event", targetType: "nuwa-run",
      targets: ["run.a", "unit.bridge", "character.lin", "character.wu"], authorizationId: authorization.id
    });
    assert.equal(revoked.outcome, "requires-author");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
