import { EXTERNAL_MEMORY_SKILL_DESCRIPTORS } from "../memorySkills/externalMemorySkillAdapters.ts";
import { MEMORY_PALACE_SKILL_MANIFEST } from "../memorySkills/memoryPalaceSkill.ts";
import type { SkillDomain, SkillManifest } from "./skillManifest.ts";
import { STORY_MEMORY_RECALL_SKILL_MANIFEST } from "./storyMemoryRecallSkillManifest.ts";
import { STORY_STUDIO_SYSTEM_SKILL_MANIFESTS } from "./storyStudioSystemSkillManifests.ts";

export type SkillRegistry = {
  manifests: SkillManifest[];
};

export function createDefaultSkillRegistry(): SkillRegistry {
  return normalizeRegistry({
    manifests: [
      MEMORY_PALACE_SKILL_MANIFEST,
      STORY_MEMORY_RECALL_SKILL_MANIFEST,
      ...STORY_STUDIO_SYSTEM_SKILL_MANIFESTS,
      ...EXTERNAL_MEMORY_SKILL_DESCRIPTORS
    ]
  });
}

export function registerSkillManifest(registry: SkillRegistry, manifest: SkillManifest): SkillRegistry {
  const manifests = [
    ...registry.manifests.filter((item) => item.id !== manifest.id),
    cloneManifest(manifest)
  ];

  return normalizeRegistry({ manifests });
}

export function getSkillManifest(registry: SkillRegistry, skillId: string): SkillManifest {
  const found = registry.manifests.find((manifest) => manifest.id === skillId);
  if (!found) {
    throw new Error(`Unknown skill manifest: ${skillId}`);
  }

  return cloneManifest(found);
}

export function listSkillsByDomain(registry: SkillRegistry, domain: SkillDomain): SkillManifest[] {
  return registry.manifests
    .filter((manifest) => manifest.domain === domain)
    .map(cloneManifest)
    .sort(compareManifest);
}

function normalizeRegistry(registry: SkillRegistry): SkillRegistry {
  return {
    manifests: registry.manifests.map(cloneManifest).sort(compareManifest)
  };
}

function cloneManifest(manifest: SkillManifest): SkillManifest {
  return structuredClone(manifest);
}

function compareManifest(left: SkillManifest, right: SkillManifest): number {
  return left.id.localeCompare(right.id);
}
