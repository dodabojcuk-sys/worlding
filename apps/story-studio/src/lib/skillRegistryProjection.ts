import { createDefaultSkillRegistry } from "../../../../src/skillControl/skillRegistry.ts";
import { STORY_STUDIO_SYSTEM_SKILL_MANIFESTS } from "../../../../src/skillControl/storyStudioSystemSkillManifests.ts";

export type ControlCenterSkill = {
  id: string;
  name: string;
  description: string;
  permissionSummary: string;
  enabled: boolean;
  availability: "descriptor-only";
};

/**
 * Creates a safe, read-only product projection from the canonical Skill Control
 * registry. It deliberately exposes no entrypoint or execution method.
 */
export function projectStoryStudioSystemSkills(): ControlCenterSkill[] {
  const registry = createDefaultSkillRegistry();
  const byId = new Map(registry.manifests.map((manifest) => [manifest.id, manifest]));
  return STORY_STUDIO_SYSTEM_SKILL_MANIFESTS
    .flatMap((descriptor) => {
      const manifest = byId.get(descriptor.id);
      return manifest ? [manifest] : [];
    })
    .map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      permissionSummary: manifest.permissions.readProject
        ? "只读当前项目 · 不可写入 · 不使用网络"
        : "不读取项目 · 不可写入 · 不使用网络",
      enabled: manifest.defaultEnabled,
      availability: "descriptor-only" as const
    }));
}
