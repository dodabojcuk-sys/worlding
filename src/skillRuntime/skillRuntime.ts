import type { SkillDomain } from "../skillControl/skillManifest.ts";
import { createDefaultSkillPolicy, type SkillPolicy } from "../skillControl/skillPolicy.ts";
import { createDefaultSkillRegistry, type SkillRegistry } from "../skillControl/skillRegistry.ts";
import type { SkillToggle } from "../skillControl/skillToggle.ts";
import { STORY_MEMORY_RECALL_SKILL_ID } from "../skillControl/storyMemoryRecallSkillManifest.ts";
import { executeSkillPlugin } from "./skillExecutor.ts";

export type SkillPluginMode = "simple" | "advanced";

export type SkillPluginManifest = {
  name: string;
  version: string;
  domain: SkillDomain;
};

export type SkillPluginEntryContext = {
  pluginId: string;
  mode: SkillPluginMode;
  workspacePath?: string;
  capabilities: {
    canCompose: boolean;
    externalAccess: false;
    workspaceWrite: false;
  };
};

export type SkillPlugin = {
  id: string;
  manifest: SkillPluginManifest;
  entry: (input: Record<string, unknown>, context: SkillPluginEntryContext) => Promise<unknown> | unknown;
  dependencies?: string[];
  config?: Record<string, unknown>;
};

export type SkillPluginCatalog = Record<string, SkillPlugin>;

export type SkillPluginRegistry = {
  version: "world-os-skill-plugin-registry-v1";
  installed: {
    id: string;
    version: string;
    enabled: boolean;
  }[];
};

export type SkillRuntimeContext = {
  mode: SkillPluginMode;
  workspacePath?: string;
};

export type NormalizedSkillOutput = {
  normalized: true;
  pluginId: string;
  value: unknown;
};

export type SkillExecutionTraceEntry = {
  pluginId: string;
  status: "success" | "error" | "blocked";
  mode: SkillPluginMode;
  inputHash: string;
  outputHash: string;
  errorCode?: string;
};

export type SkillExecutionResult = {
  ok: boolean;
  output?: NormalizedSkillOutput;
  error?: {
    code: string;
    message: string;
  };
  trace: SkillExecutionTraceEntry[];
};

export type CreateSkillRuntimeInput = {
  pluginRegistry: SkillPluginRegistry;
  catalog: SkillPluginCatalog;
  skillRegistry?: SkillRegistry;
  policy?: SkillPolicy;
  toggles?: SkillToggle[];
};

export function createDefaultPluginRegistry(): SkillPluginRegistry {
  return {
    version: "world-os-skill-plugin-registry-v1",
    installed: [
      {
        id: "memory_palace",
        version: "1.0.0",
        enabled: true
      },
      {
        id: STORY_MEMORY_RECALL_SKILL_ID,
        version: "1.0.0",
        enabled: true
      }
    ]
  };
}

export function createSkillRuntime(input: CreateSkillRuntimeInput) {
  const skillRegistry = input.skillRegistry ?? createDefaultSkillRegistry();
  const policy = input.policy ?? createDefaultSkillPolicy();
  const toggles = input.toggles ?? [];

  return {
    run: (request: {
      pluginId: string;
      input: Record<string, unknown>;
      runtimeContext: SkillRuntimeContext;
    }): Promise<SkillExecutionResult> =>
      executeSkillPlugin({
        pluginId: request.pluginId,
        input: request.input,
        runtimeContext: request.runtimeContext,
        pluginRegistry: input.pluginRegistry,
        catalog: input.catalog,
        skillRegistry,
        policy,
        toggles
      })
  };
}
