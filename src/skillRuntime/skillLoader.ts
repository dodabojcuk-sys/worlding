import type { SkillPolicy } from "../skillControl/skillPolicy.ts";
import { resolveEnabledSkills } from "../skillControl/skillPolicy.ts";
import { getSkillManifest, type SkillRegistry } from "../skillControl/skillRegistry.ts";
import type { SkillToggle } from "../skillControl/skillToggle.ts";
import type { SkillPlugin, SkillPluginCatalog, SkillPluginRegistry } from "./skillRuntime.ts";

export type LoadSkillPluginInput = {
  pluginId: string;
  pluginRegistry: SkillPluginRegistry;
  catalog: SkillPluginCatalog;
  skillRegistry: SkillRegistry;
  policy: SkillPolicy;
  toggles?: SkillToggle[];
};

export type LoadSkillPluginResult = {
  plugin?: SkillPlugin;
  error?: {
    code: LoadSkillPluginErrorCode;
    message: string;
  };
};

type LoadSkillPluginErrorCode =
  | "plugin_not_installed"
  | "plugin_disabled"
  | "plugin_not_found"
  | "plugin_descriptor_only"
  | "plugin_not_allowed";

export function loadSkillPlugin(input: LoadSkillPluginInput): LoadSkillPluginResult {
  const installed = input.pluginRegistry.installed.find((plugin) => plugin.id === input.pluginId);
  if (!installed) {
    return blocked("plugin_not_installed", `Plugin is not installed: ${input.pluginId}`);
  }
  if (!installed.enabled) {
    return blocked("plugin_disabled", `Plugin is disabled: ${input.pluginId}`);
  }

  const manifest = getSkillManifest(input.skillRegistry, input.pluginId);
  if (manifest.adapterStatus !== "executable") {
    return blocked("plugin_descriptor_only", `Plugin is descriptor-only: ${input.pluginId}`);
  }

  const resolved = resolveEnabledSkills({
    registry: input.skillRegistry,
    policy: input.policy,
    toggles: input.toggles ?? [],
    domain: manifest.domain,
    mode: "compiler",
    operation: "read"
  });
  const selected = resolved.find((item) => item.skillId === input.pluginId && item.state === "active");
  if (!selected) {
    return blocked("plugin_not_allowed", `Plugin is blocked by skill policy or toggles: ${input.pluginId}`);
  }

  const plugin = input.catalog[input.pluginId];
  if (!plugin) {
    return blocked("plugin_not_found", `Plugin entry is not available: ${input.pluginId}`);
  }

  return {
    plugin
  };
}

function blocked(code: LoadSkillPluginErrorCode, message: string): LoadSkillPluginResult {
  return {
    error: {
      code,
      message
    }
  };
}
