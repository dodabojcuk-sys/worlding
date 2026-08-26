import type { SkillDomain, SkillManifest, SkillProviderType } from "./skillManifest.ts";
import { isSkillVisibleInMode, type SkillMode, type SkillToggle } from "./skillToggle.ts";
import type { SkillRegistry } from "./skillRegistry.ts";

export type SkillOperation = "read" | "write" | "diagnose";

export type SkillDomainPolicy = {
  enabled: boolean;
  allowedProviderTypes: SkillProviderType[];
  allowNetwork: boolean;
  allowApiKey: boolean;
  allowLocalCommand: boolean;
  requireConfirmationForWrite: boolean;
};

export type SkillPolicy = {
  version: "world-os-skill-policy-v1";
  defaultMemorySkillId: string;
  domainPolicies: Record<SkillDomain, SkillDomainPolicy>;
};

export type ResolveEnabledSkillsInput = {
  registry: SkillRegistry;
  policy: SkillPolicy;
  toggles: SkillToggle[];
  domain: SkillDomain;
  mode: SkillMode;
  operation: SkillOperation;
};

export type ResolvedSkill = {
  skillId: string;
  publicSkillId: string;
  domain: SkillDomain;
  providerType: SkillProviderType;
  state: SkillToggle["state"];
  canRead: boolean;
  canWrite: boolean;
  canDiagnose: boolean;
  requiresConfirmation: boolean;
  fallbackSkillIds: string[];
};

const SKILL_AREAS: SkillDomain[] = [
  "memory",
  "writing",
  "review",
  "rewrite",
  "worldbuilding",
  "reasoning",
  "analysis",
  "transformation",
  "retrieval",
  "orchestration",
  "prediction",
  "validation",
  "export",
  "debug"
];

export function createDefaultSkillPolicy(): SkillPolicy {
  const basePolicy: SkillDomainPolicy = {
    enabled: true,
    allowedProviderTypes: ["builtin", "local_function"],
    allowNetwork: false,
    allowApiKey: false,
    allowLocalCommand: false,
    requireConfirmationForWrite: true
  };

  return {
    version: "world-os-skill-policy-v1",
    defaultMemorySkillId: "memory_palace",
    domainPolicies: Object.fromEntries(SKILL_AREAS.map((domain) => [domain, { ...basePolicy }])) as Record<
      SkillDomain,
      SkillDomainPolicy
    >
  };
}

export function resolveEnabledSkills(input: ResolveEnabledSkillsInput): ResolvedSkill[] {
  const domainPolicy = input.policy.domainPolicies[input.domain];
  if (!domainPolicy?.enabled) {
    return [];
  }

  const togglesBySkill = new Map(input.toggles.map((toggle) => [toggle.skillId, toggle]));
  const manifests = input.registry.manifests
    .filter((manifest) => manifest.domain === input.domain)
    .map((manifest) => [manifest, togglesBySkill.get(manifest.id)] as const)
    .filter(([, toggle]) => toggle && toggle.state !== "off" && isSkillVisibleInMode(toggle, input.mode))
    .filter(([manifest, toggle]) => toggle?.state === "observe" || isExecutableUnderPolicy(manifest, domainPolicy))
    .sort((left, right) => {
      const priorityDelta = (left[1]?.priority ?? 0) - (right[1]?.priority ?? 0);
      return priorityDelta === 0 ? left[0].id.localeCompare(right[0].id) : priorityDelta;
    });

  return manifests.map(([manifest, toggle]) => {
    const state = toggle?.state ?? "off";
    const canWrite = state === "active" && input.operation === "write" && manifest.permissions.writeMemory;
    return {
      skillId: manifest.id,
      publicSkillId: input.mode === "product" ? manifest.domain : manifest.id,
      domain: manifest.domain,
      providerType: manifest.providerType,
      state,
      canRead: state !== "off" && manifest.permissions.readMemory,
      canWrite,
      canDiagnose: state === "observe" || input.mode === "compiler",
      requiresConfirmation: canWrite && domainPolicy.requireConfirmationForWrite,
      fallbackSkillIds: [...(toggle?.fallbackSkillIds ?? [])].sort()
    };
  });
}

function isExecutableUnderPolicy(manifest: SkillManifest, policy: SkillDomainPolicy): boolean {
  if (!policy.allowedProviderTypes.includes(manifest.providerType)) {
    return false;
  }
  if (manifest.permissions.useNetwork && !policy.allowNetwork) {
    return false;
  }
  if (manifest.permissions.useApiKey && !policy.allowApiKey) {
    return false;
  }
  if (manifest.permissions.executeLocalCommand && !policy.allowLocalCommand) {
    return false;
  }

  return manifest.adapterStatus === "executable";
}
