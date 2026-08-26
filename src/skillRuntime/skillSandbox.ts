import type { SkillPluginEntryContext, SkillPluginMode } from "./skillRuntime.ts";

export type CreateSkillSandboxInput = {
  pluginId: string;
  mode: SkillPluginMode;
  workspacePath?: string;
};

export function createSkillSandbox(input: CreateSkillSandboxInput): SkillPluginEntryContext {
  return {
    pluginId: input.pluginId,
    mode: input.mode,
    workspacePath: input.workspacePath,
    capabilities: {
      canCompose: input.mode === "advanced",
      externalAccess: false,
      workspaceWrite: false
    }
  };
}
