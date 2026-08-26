import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveTianyiTransportState,
  TIANYI_TRANSPORT_DESCRIPTIONS,
  TIANYI_TRANSPORT_LABELS,
  type TianyiTransportState
} from "../../apps/story-studio/src/components/tianyi/tianyiTransportPresentation.ts";

test("Tianyi transport presentation distinguishes every frozen safe state", () => {
  const states: TianyiTransportState[] = ["idle", "connecting", "ready", "streaming", "stopped", "unavailable", "disconnected", "failed", "retrying"];
  assert.deepEqual(Object.keys(TIANYI_TRANSPORT_LABELS).sort(), states.slice().sort());
  assert.deepEqual(Object.keys(TIANYI_TRANSPORT_DESCRIPTIONS).sort(), states.slice().sort());
  assert.equal(resolveTianyiTransportState({ loading: true, busy: false, providerReady: false }), "connecting");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: true, providerReady: true }), "streaming");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: false, providerReady: true }), "ready");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: false, providerReady: false }), "unavailable");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: false, providerReady: null }), "disconnected");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: false, providerReady: true, recoveryKind: "send-failed" }), "failed");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: false, providerReady: true, stopped: true }), "stopped");
  assert.equal(resolveTianyiTransportState({ loading: false, busy: false, providerReady: true, retrying: true }), "retrying");
});

test("full Tianyi and quick Tianyi keep one shared continuity boundary while source handoffs use the full route", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const quick = readFileSync("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");
  assert.match(app, /sharedTianyiSessionId/);
  assert.match(app, /sharedTianyiDraft/);
  assert.match(app, /openFullTianyi\("world", "conversation"\)/);
  assert.match(app, /openFullTianyi\(writing\?\.activeDocument \? "writing" : "world", "conversation"\)/);
  assert.match(app, /workspaceDockCoordinator\.closeQuickTianyi\(\)/);
  assert.match(app, /mode=\{tianyiWorkspaceMode\}/);
  assert.match(app, /providerStatus=\{modelServiceStatus\}/);
  assert.match(workspace, /canStartSession=\{!contextUnavailable\}/);
  assert.match(workspace, /data-testid="tianyi-latest-response"/);
  assert.match(workspace, /天意工作方式/);
  assert.match(workspace, /data-testid="tianyi-transport-status"/);
  assert.doesNotMatch(quick, />创意<\/button>/);
  assert.match(quick, />对话<\/button>/);
  assert.match(quick, />工作<\/button>/);
  assert.equal((app.match(/useState<Record<string, string>>\(\{\}\)/g) || []).length, 1);
});
