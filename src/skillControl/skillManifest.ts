export type SkillProviderType = "builtin" | "mcp" | "api" | "external_cli" | "agent" | "local_function";

export type SkillDomain =
  | "memory"
  | "writing"
  | "review"
  | "rewrite"
  | "worldbuilding"
  | "reasoning"
  | "analysis"
  | "transformation"
  | "retrieval"
  | "orchestration"
  | "prediction"
  | "validation"
  | "export"
  | "debug";

export type SkillAdapterStatus = "executable" | "descriptor_only";

export type SkillPermissions = {
  readProject: boolean;
  writeProject: boolean;
  readMemory: boolean;
  writeMemory: boolean;
  useNetwork: boolean;
  useApiKey: boolean;
  executeLocalCommand: boolean;
};

export type SkillManifest = {
  id: string;
  name: string;
  domain: SkillDomain;
  providerType: SkillProviderType;
  description: string;
  version: string;
  adapterStatus: SkillAdapterStatus;
  capabilities: string[];
  entrypoints: string[];
  permissions: SkillPermissions;
  defaultEnabled: boolean;
  userConfigurable: boolean;
};
