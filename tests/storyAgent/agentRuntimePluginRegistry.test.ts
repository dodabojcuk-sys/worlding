import assert from "node:assert/strict";
import test from "node:test";

import { createAgentRuntimePluginRegistry, isHostApiCompatible } from "../../src/storyAgent/agentRuntimePluginRegistry.ts";
import { BUILTIN_PI_AGENT_RUNTIME_PLUGIN_ID, createBuiltinPiAgentRuntimePlugin } from "../../src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts";
import type { AgentRuntimePlugin } from "../../src/storyAgent/agentRuntimePlugin.ts";

function plugin(input: Partial<AgentRuntimePlugin["manifest"]> & { throws?: boolean } = {}): AgentRuntimePlugin {
  const manifest = {
    id: input.id ?? "agent.fixture.runtime",
    pluginVersion: input.pluginVersion ?? "1.0.0",
    upstreamVersion: input.upstreamVersion ?? "fixture-1",
    hostApiRange: input.hostApiRange ?? "^1.0.0",
    capabilities: input.capabilities ?? ["text-stream"]
  } as const;
  return {
    manifest,
    createRuntime() {
      if (input.throws) throw new Error("fixture initialization failed");
      return { async run() { return { text: "", providerCalls: 0, traceId: null, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 0 }; }, cancel() { return false; } };
    },
    health() { return { status: "healthy", message: null }; }
  };
}

test("built-in Pi plugin declares stable host ABI without opening a dynamic loader", async () => {
  const builtIn = createBuiltinPiAgentRuntimePlugin();
  assert.equal(builtIn.manifest.id, BUILTIN_PI_AGENT_RUNTIME_PLUGIN_ID);
  assert.equal(builtIn.manifest.pluginVersion, "0.1.0");
  assert.equal(builtIn.manifest.upstreamVersion, "0.84.2");
  assert.equal(builtIn.manifest.hostApiRange, "^1.0.0");
  assert.ok(builtIn.manifest.capabilities.includes("native-tool-frames"));
  assert.deepEqual(await builtIn.health(), { status: "healthy", message: null });
});

test("registry is whitelist-only and records missing, disabled, incompatible and init-failure states", () => {
  const fallback = plugin({ id: "agent.fixture.fallback" });
  const incompatible = plugin({ id: "agent.fixture.incompatible", hostApiRange: "^2.0.0" });
  const broken = plugin({ id: "agent.fixture.broken", throws: true });
  const registry = createAgentRuntimePluginRegistry({ plugins: [fallback, incompatible, broken], defaultPluginId: fallback.manifest.id });

  const disabled = registry.activate({ enabled: false });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.runtime, null);

  const missing = registry.activate({ pluginId: "agent.unreviewed.external" });
  assert.equal(missing.state, "fallback");
  assert.equal(missing.fallbackFromPluginId, "agent.unreviewed.external");
  assert.equal(missing.activePluginId, fallback.manifest.id);

  const incompatibleResult = registry.activate({ pluginId: incompatible.manifest.id });
  assert.equal(incompatibleResult.state, "fallback");
  assert.equal(incompatibleResult.fallbackFromPluginId, incompatible.manifest.id);

  const failed = registry.activate({ pluginId: broken.manifest.id });
  assert.equal(failed.state, "fallback");
  assert.equal(failed.fallbackFromPluginId, broken.manifest.id);
});

test("registry performs an explicit upgrade fallback and preserves host API compatibility rules", () => {
  const previous = plugin({ id: "agent.fixture.pi.previous", pluginVersion: "1.0.0" });
  const attemptedUpgrade = plugin({ id: "agent.fixture.pi.next", pluginVersion: "2.0.0", throws: true });
  const registry = createAgentRuntimePluginRegistry({ plugins: [previous, attemptedUpgrade], defaultPluginId: previous.manifest.id });
  const result = registry.activate({ pluginId: attemptedUpgrade.manifest.id, fallbackPluginId: previous.manifest.id });
  assert.equal(result.state, "fallback");
  assert.equal(result.activePluginId, previous.manifest.id);
  assert.equal(result.fallbackFromPluginId, attemptedUpgrade.manifest.id);
  assert.equal(isHostApiCompatible("1.2.0", "^1.0.0"), true);
  assert.equal(isHostApiCompatible("2.0.0", "^1.0.0"), false);
  assert.equal(isHostApiCompatible("1.0.1", "1.0.0"), false);
});
