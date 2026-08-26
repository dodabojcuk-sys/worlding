import type { SkillManifest } from "../skillControl/skillManifest.ts";

export type ExternalMemorySkillDescriptor = SkillManifest & {
  adapterStatus: "descriptor_only";
  integrationStyle: string;
  networkRequired: boolean;
  databaseRequired: boolean;
  recommendedUsage: string;
  licenseCaution: string;
};

export const EXTERNAL_MEMORY_SKILL_DESCRIPTORS: ExternalMemorySkillDescriptor[] = [
  {
    id: "claude_mem",
    name: "claude-mem",
    domain: "memory",
    providerType: "mcp",
    description: "Descriptor for staged recall through compact search, timeline context, and full observations.",
    version: "descriptor-v1",
    adapterStatus: "descriptor_only",
    capabilities: ["searchMemory", "exportMemorySnapshot"],
    entrypoints: [],
    permissions: baseReadOnlyPermissions(false, false),
    defaultEnabled: false,
    userConfigurable: true,
    integrationStyle: "MCP-style staged memory recall; v1 stores only the descriptor.",
    networkRequired: false,
    databaseRequired: false,
    recommendedUsage: "Optional recall accelerator after local policy, budget, and confirmation controls are proven.",
    licenseCaution: "Inspect upstream license before promotion to executable adapter."
  },
  {
    id: "claude_memory_skill",
    name: "claude-memory-skill",
    domain: "memory",
    providerType: "local_function",
    description: "Descriptor for lightweight file-organized memory skill patterns.",
    version: "descriptor-v1",
    adapterStatus: "descriptor_only",
    capabilities: ["searchMemory", "writeMemory", "exportMemorySnapshot"],
    entrypoints: [],
    permissions: baseReadOnlyPermissions(false, false),
    defaultEnabled: false,
    userConfigurable: true,
    integrationStyle: "Skill-file memory organization pattern; v1 stores only the descriptor.",
    networkRequired: false,
    databaseRequired: false,
    recommendedUsage: "Optional local authoring memory style reference, not a live dependency.",
    licenseCaution: "Inspect upstream license before promotion to executable adapter."
  },
  {
    id: "mem0",
    name: "mem0",
    domain: "memory",
    providerType: "api",
    description: "Descriptor for universal memory with embeddings, storage adapters, and scoped recall.",
    version: "descriptor-v1",
    adapterStatus: "descriptor_only",
    capabilities: ["searchMemory", "writeMemory", "exportMemorySnapshot"],
    entrypoints: [],
    permissions: baseReadOnlyPermissions(true, true),
    defaultEnabled: false,
    userConfigurable: true,
    integrationStyle: "SDK or service adapter requiring explicit provider, storage, and identity-scope configuration.",
    networkRequired: true,
    databaseRequired: true,
    recommendedUsage: "Optional memory provider after per-skill budgets and identity isolation are enforced.",
    licenseCaution: "Local metadata reports Apache-2.0; still verify dependency and deployment terms before enabling."
  },
  {
    id: "graphiti",
    name: "Graphiti",
    domain: "memory",
    providerType: "api",
    description: "Descriptor for temporal knowledge graph memory and evolving facts.",
    version: "descriptor-v1",
    adapterStatus: "descriptor_only",
    capabilities: ["searchMemory", "writeMemory", "exportMemorySnapshot"],
    entrypoints: [],
    permissions: baseReadOnlyPermissions(true, true),
    defaultEnabled: false,
    userConfigurable: true,
    integrationStyle: "Temporal graph adapter requiring graph storage plus model-backed extraction and retrieval.",
    networkRequired: true,
    databaseRequired: true,
    recommendedUsage: "Optional advanced adapter for relationship and fact evolution after local memory stabilizes.",
    licenseCaution: "Local metadata reports Apache-2.0; verify graph and model provider terms before enabling."
  },
  {
    id: "cognee",
    name: "Cognee",
    domain: "memory",
    providerType: "api",
    description: "Descriptor for self-hosted knowledge graph memory for agents.",
    version: "descriptor-v1",
    adapterStatus: "descriptor_only",
    capabilities: ["searchMemory", "writeMemory", "exportMemorySnapshot"],
    entrypoints: [],
    permissions: baseReadOnlyPermissions(true, true),
    defaultEnabled: false,
    userConfigurable: true,
    integrationStyle: "Graph memory platform adapter requiring ingestion, storage, and retrieval configuration.",
    networkRequired: true,
    databaseRequired: true,
    recommendedUsage: "Optional graph-backed memory once project-scope isolation and cost controls are mature.",
    licenseCaution: "Local metadata reports Apache-2.0; verify deployment and dependency terms before enabling."
  },
  {
    id: "letta",
    name: "Letta",
    domain: "memory",
    providerType: "agent",
    description: "Descriptor for stateful agents with persistent memory blocks.",
    version: "descriptor-v1",
    adapterStatus: "descriptor_only",
    capabilities: ["searchMemory", "writeMemory"],
    entrypoints: [],
    permissions: baseReadOnlyPermissions(true, true),
    defaultEnabled: false,
    userConfigurable: true,
    integrationStyle: "Stateful agent platform adapter; memory is coupled to agent identity and sessions.",
    networkRequired: true,
    databaseRequired: true,
    recommendedUsage: "Optional future agent-memory route, not the default memory adapter.",
    licenseCaution: "Local metadata reports Apache-2.0; verify service and storage terms before enabling."
  }
];

function baseReadOnlyPermissions(useNetwork: boolean, useApiKey: boolean) {
  return {
    readProject: true,
    writeProject: false,
    readMemory: true,
    writeMemory: false,
    useNetwork,
    useApiKey,
    executeLocalCommand: false
  };
}
