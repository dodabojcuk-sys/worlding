import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";

import { agentPermissionProfileForIntent, createTianyiSubmitGate, currentTianyiAgentStep, tianyiAgentRunStorageKey } from "../../apps/story-studio/src/components/tianyi/tianyiAgentRunViewModel.ts";
import { tianyiAgentSessionStorageKey, tianyiDialogueSessionStorageKey } from "../../apps/story-studio/src/product-shell/runtime/tianyiShellSessionRecovery.ts";
import { createActionPermissionBroker } from "../../src/storyControlSurface/actionPermissionBroker.ts";

test("R0.3 session and Agent recovery keys stay project- and session-scoped", () => {
  assert.equal(tianyiDialogueSessionStorageKey("project-a"), "tianyi-dialogue-session:project-a");
  assert.equal(tianyiAgentSessionStorageKey("project-a"), "tianyi-agent-session:project-a");
  assert.notEqual(tianyiDialogueSessionStorageKey("project-a"), tianyiAgentSessionStorageKey("project-a"));
  assert.equal(tianyiAgentRunStorageKey("project-a", "work-version.a", "session-a"), "tianyi-agent-run:project-a:work-version.a:session-a");
  assert.notEqual(tianyiAgentRunStorageKey("project-a", "work-version.a", "session-a"), tianyiAgentRunStorageKey("project-a", "work-version.b", "session-a"));
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
